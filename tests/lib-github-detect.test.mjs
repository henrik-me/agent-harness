/**
 * tests/lib-github-detect.test.mjs — Tests for GitHub token and repo tier helpers.
 *
 * Run: node --test tests/lib-github-detect.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { detectRepoTier } from '../lib/detect-repo-tier.mjs';
import { getGitHubToken } from '../lib/get-github-token.mjs';

const originalFetch = globalThis.fetch;
const originalToken = process.env.GITHUB_TOKEN;
// CS15e race fix: must NOT mkdtempSync inside REPO_ROOT — concurrent test runs
// have the text-encoding linter walking REPO_ROOT recursively, and transient
// tempdir creation/deletion under REPO_ROOT triggers ENOENT in readdirSync,
// causing spurious `text-encoding: fail` lint failures (LRN candidate).
const tempRoot = os.tmpdir();
const tempDirs = new Set();

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalToken === undefined) {
    delete process.env.GITHUB_TOKEN;
  } else {
    process.env.GITHUB_TOKEN = originalToken;
  }

  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.clear();
});

test('getGitHubToken returns the env var when set', () => {
  process.env.GITHUB_TOKEN = 'ghp_test_token';

  assert.equal(getGitHubToken(), 'ghp_test_token');
});

test('getGitHubToken returns null when env var is unset', () => {
  delete process.env.GITHUB_TOKEN;

  assert.equal(getGitHubToken(), null);
});

test('detectRepoTier returns no-remote for a directory without git metadata', async () => {
  const cwd = makeTempDir();
  writeFileSync(path.join(cwd, '.git'), 'gitdir: .not-a-real-git-dir\n', 'utf8');

  const result = await detectRepoTier({ cwd });

  assert.deepEqual(result, { tier: 'unknown', reason: 'no-remote' });
});

test('detectRepoTier reports unparseable remotes', async () => {
  const remoteUrl = 'https://gitlab.com/foo/bar.git';
  const cwd = makeGitRepoWithOrigin(remoteUrl);

  const result = await detectRepoTier({ cwd });

  assert.deepEqual(result, { tier: 'unknown', reason: 'unparseable-remote', remoteUrl });
});

test('detectRepoTier detects a public repo with anonymous fetch', async () => {
  delete process.env.GITHUB_TOKEN;
  const cwd = makeGitRepoWithOrigin('https://github.com/octo/example.git');
  mockFetch([
    response(200, { visibility: 'public', owner: { type: 'User' } }),
  ]);

  const result = await detectRepoTier({ cwd });

  assert.deepEqual(result, {
    tier: 'public',
    owner: 'octo',
    repo: 'example',
    ownerType: 'User',
  });
});

test('detectRepoTier sends Authorization for a public repo when token is set', async () => {
  process.env.GITHUB_TOKEN = 'ghp_public_token';
  const cwd = makeGitRepoWithOrigin('git@github.com:octo/example.git');
  const calls = mockFetch([
    response(200, { visibility: 'public', owner: { type: 'User' } }),
  ]);

  const result = await detectRepoTier({ cwd });

  assert.equal(result.tier, 'public');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer ghp_public_token');
});

test('detectRepoTier maps private User owner with free plan to private-free', async () => {
  process.env.GITHUB_TOKEN = 'ghp_private_token';
  const cwd = makeGitRepoWithOrigin('https://github.com/octo/example.git');
  mockFetch([
    response(200, { visibility: 'private', owner: { type: 'User' } }),
    response(200, { plan: { name: 'free' } }),
  ]);

  const result = await detectRepoTier({ cwd });

  assert.deepEqual(result, {
    tier: 'private-free',
    owner: 'octo',
    repo: 'example',
    ownerType: 'User',
  });
});

test('detectRepoTier maps private Organization owner with pro plan via orgs endpoint', async () => {
  process.env.GITHUB_TOKEN = 'ghp_private_token';
  const cwd = makeGitRepoWithOrigin('https://github.com/octo-org/example.git');
  const calls = mockFetch([
    response(200, { visibility: 'private', owner: { type: 'Organization' } }),
    response(200, { plan: { name: 'pro' } }),
  ]);

  const result = await detectRepoTier({ cwd });

  assert.deepEqual(result, {
    tier: 'private-pro',
    owner: 'octo-org',
    repo: 'example',
    ownerType: 'Organization',
  });
  assert.equal(calls[1].url, 'https://api.github.com/orgs/octo-org');
});

test('detectRepoTier returns plan-data-unavailable when private plan is absent', async () => {
  process.env.GITHUB_TOKEN = 'ghp_private_token';
  const cwd = makeGitRepoWithOrigin('https://github.com/octo/example.git');
  mockFetch([
    response(200, { visibility: 'private', owner: { type: 'User' } }),
    response(200, {}),
  ]);

  const result = await detectRepoTier({ cwd });

  assert.deepEqual(result, {
    tier: 'unknown',
    reason: 'plan-data-unavailable',
    owner: 'octo',
    repo: 'example',
    ownerType: 'User',
  });
  assert.notEqual(result.tier, 'private-free');
});

test('detectRepoTier handles private repo plan fetch without a token', async () => {
  delete process.env.GITHUB_TOKEN;
  const cwd = makeGitRepoWithOrigin('https://github.com/octo/example.git');
  mockFetch([
    response(200, { visibility: 'private', owner: { type: 'User' } }),
    response(200, { plan: { name: 'free' } }),
  ]);

  const result = await detectRepoTier({ cwd });

  assert.deepEqual(result, {
    tier: 'private-free',
    owner: 'octo',
    repo: 'example',
    ownerType: 'User',
  });
});

test('detectRepoTier maps 404 repo response to repo-not-found', async () => {
  const cwd = makeGitRepoWithOrigin('https://github.com/octo/missing.git');
  mockFetch([
    response(404, { message: 'Not Found' }),
  ]);

  const result = await detectRepoTier({ cwd });

  assert.deepEqual(result, {
    tier: 'unknown',
    reason: 'repo-not-found',
    owner: 'octo',
    repo: 'missing',
  });
});

test('detectRepoTier maps first fetch throws to network-error', async () => {
  const cwd = makeGitRepoWithOrigin('https://github.com/octo/example.git');
  globalThis.fetch = async () => {
    throw new Error('network down');
  };

  const result = await detectRepoTier({ cwd });

  assert.deepEqual(result, {
    tier: 'unknown',
    reason: 'network-error',
    owner: 'octo',
    repo: 'example',
  });
});

// CS15e LRN-064 review recommendation: explicit coverage for the
// private-team and private-enterprise tiers (the schema accepts them; the
// detector must produce them given a matching plan name).
test('detectRepoTier maps private Organization owner with team plan to private-team', async () => {
  process.env.GITHUB_TOKEN = 'ghp_private_token';
  const cwd = makeGitRepoWithOrigin('https://github.com/octo-org/example.git');
  mockFetch([
    response(200, { visibility: 'private', owner: { type: 'Organization' } }),
    response(200, { plan: { name: 'team' } }),
  ]);

  const result = await detectRepoTier({ cwd });

  assert.deepEqual(result, {
    tier: 'private-team',
    owner: 'octo-org',
    repo: 'example',
    ownerType: 'Organization',
  });
});

test('detectRepoTier maps private Organization owner with enterprise plan to private-enterprise', async () => {
  process.env.GITHUB_TOKEN = 'ghp_private_token';
  const cwd = makeGitRepoWithOrigin('https://github.com/octo-org/example.git');
  mockFetch([
    response(200, { visibility: 'private', owner: { type: 'Organization' } }),
    response(200, { plan: { name: 'enterprise' } }),
  ]);

  const result = await detectRepoTier({ cwd });

  assert.deepEqual(result, {
    tier: 'private-enterprise',
    owner: 'octo-org',
    repo: 'example',
    ownerType: 'Organization',
  });
});

// CS15e LRN-064 review recommendation: explicit anonymous-against-private
// path. With no token, GitHub returns 404 for a private repo (it's
// indistinguishable from a non-existent repo at the API surface), and the
// detector surfaces this as `repo-not-found` — NOT as a misleading
// `private-free` default.
test('detectRepoTier with no token against a private repo returns repo-not-found (anonymous cannot see private)', async () => {
  delete process.env.GITHUB_TOKEN;
  const cwd = makeGitRepoWithOrigin('https://github.com/octo/secret.git');
  const calls = mockFetch([
    response(404, { message: 'Not Found' }),
  ]);

  const result = await detectRepoTier({ cwd });

  assert.deepEqual(result, {
    tier: 'unknown',
    reason: 'repo-not-found',
    owner: 'octo',
    repo: 'secret',
  });
  // Verify no Authorization header was sent on the anonymous call.
  assert.ok(
    !('Authorization' in (calls[0].options?.headers ?? {})),
    'no Authorization header expected when token is absent',
  );
  // Negative assertion: must NOT default to private-free.
  assert.notEqual(result.tier, 'private-free');
});

function makeTempDir() {
  const dir = mkdtempSync(path.join(tempRoot, '.lib-github-detect-'));
  tempDirs.add(dir);
  return dir;
}

function makeGitRepoWithOrigin(remoteUrl) {
  const cwd = makeTempDir();
  execFileSync('git', ['init', '-q'], { cwd, stdio: 'ignore' });
  execFileSync('git', ['remote', 'add', 'origin', remoteUrl], { cwd, stdio: 'ignore' });
  return cwd;
}

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function mockFetch(responses) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    assert.ok(responses.length > 0, `unexpected fetch call: ${url}`);
    return responses.shift();
  };
  return calls;
}
