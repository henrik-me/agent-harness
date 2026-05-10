/**
 * Detect the GitHub visibility and plan tier for the repository at `cwd`.
 *
 * The helper reads the `origin` git remote, parses GitHub HTTPS/SSH URLs, then
 * uses native `fetch()` against the GitHub REST API. It calls
 * `getGitHubToken()` from `./get-github-token.mjs` exactly once per invocation
 * and passes that token to every request as `Authorization: Bearer <token>`
 * when available.
 *
 * Return shape:
 * `{ tier, owner?, repo?, reason?, ownerType?, remoteUrl?, status? }`
 *
 * Tier values are: `public`, `private-free`, `private-pro`, `private-team`,
 * `private-enterprise`, and `unknown`.
 *
 * Reason codes:
 * - `no-remote`: step 1 could not read `git remote get-url origin`.
 * - `unparseable-remote`: step 3 could not parse a GitHub owner/repo URL.
 * - `repo-not-found`: step 4 received 404 from the repository API.
 * - `api-error`: step 4 received a non-200/non-404 repository API response.
 * - `network-error`: step 4 fetch threw before a repository response arrived.
 * - `api-response-invalid`: step 4 JSON parsing failed or required response
 *   fields were absent/unsupported.
 * - `plan-data-unavailable`: step 5 could not parse a recognized plan name
 *   from the account API response.
 * - `plan-fetch-failed`: step 5 received a non-200 account API response.
 * - `plan-network-error`: step 5 fetch threw before an account response arrived.
 *
 * The helper never throws for detection failures; it fails closed with
 * `tier: 'unknown'`.
 *
 * @param {{cwd?: string}} options
 * @returns {Promise<object>}
 */

import { execFileSync } from 'node:child_process';

import { getGitHubToken } from './get-github-token.mjs';

const GITHUB_API_BASE = 'https://api.github.com';
const RECOGNIZED_PLANS = new Set(['free', 'pro', 'team', 'enterprise']);

export async function detectRepoTier({ cwd = process.cwd() } = {}) {
  const token = getGitHubToken();
  const remoteUrl = readOriginRemote(cwd);

  if (!remoteUrl) {
    return { tier: 'unknown', reason: 'no-remote' };
  }

  const parsedRemote = parseGitHubRemoteUrl(remoteUrl);
  if (!parsedRemote) {
    return { tier: 'unknown', reason: 'unparseable-remote', remoteUrl };
  }

  const { owner, repo } = parsedRemote;
  const headers = createGitHubHeaders(token);
  const repoUrl = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  let repoResponse;
  try {
    repoResponse = await fetch(repoUrl, { headers });
  } catch {
    return { tier: 'unknown', reason: 'network-error', owner, repo };
  }

  if (repoResponse.status === 404) {
    return { tier: 'unknown', reason: 'repo-not-found', owner, repo };
  }

  if (repoResponse.status !== 200) {
    return { tier: 'unknown', reason: 'api-error', status: repoResponse.status, owner, repo };
  }

  let repoData;
  try {
    repoData = await repoResponse.json();
  } catch {
    return { tier: 'unknown', reason: 'api-response-invalid', owner, repo };
  }

  const visibility = repoData?.visibility;
  const ownerType = repoData?.owner?.type;
  if (!ownerType || !['public', 'private'].includes(visibility)) {
    return { tier: 'unknown', reason: 'api-response-invalid', owner, repo };
  }

  if (visibility === 'public') {
    return { tier: 'public', owner, repo, ownerType };
  }

  const accountPath = accountPathForOwner(owner, ownerType);
  if (!accountPath) {
    return { tier: 'unknown', reason: 'plan-data-unavailable', owner, repo, ownerType };
  }

  let planResponse;
  try {
    planResponse = await fetch(`${GITHUB_API_BASE}/${accountPath}`, { headers });
  } catch {
    return { tier: 'unknown', reason: 'plan-network-error', owner, repo, ownerType };
  }

  if (planResponse.status !== 200) {
    return {
      tier: 'unknown',
      reason: 'plan-fetch-failed',
      status: planResponse.status,
      owner,
      repo,
      ownerType,
    };
  }

  let planData;
  try {
    planData = await planResponse.json();
  } catch {
    return { tier: 'unknown', reason: 'plan-data-unavailable', owner, repo, ownerType };
  }

  const planName = planData?.plan?.name;
  if (!RECOGNIZED_PLANS.has(planName)) {
    return { tier: 'unknown', reason: 'plan-data-unavailable', owner, repo, ownerType };
  }

  return { tier: `private-${planName}`, owner, repo, ownerType };
}

function readOriginRemote(cwd) {
  try {
    return execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

function parseGitHubRemoteUrl(remoteUrl) {
  const httpsMatch = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/.exec(remoteUrl);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }

  const sshMatch = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/.exec(remoteUrl);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  return null;
}

function createGitHubHeaders(token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function accountPathForOwner(owner, ownerType) {
  if (ownerType === 'User') {
    return `users/${encodeURIComponent(owner)}`;
  }

  if (ownerType === 'Organization') {
    return `orgs/${encodeURIComponent(owner)}`;
  }

  return null;
}
