// lib/cross-repo.mjs
//
// CS56 — `harness cross-repo` CLI guardrail library.
//
// Exports `openIssue({ repo, title, bodyFile, labels })` and `CrossRepoError`.
// Implements the issue-only handoff doctrine codified in CS55 (Hard Rule § 6,
// OPERATIONS.md § Cross-repo procedures): when the harness orchestrator needs
// work in a non-harness repository, it files a GitHub issue instead of opening
// a PR. This module wraps `gh issue list/create` with idempotent
// search-then-create behavior, uniform `harness-orchestrator` default label,
// and non-mutating label preflight per D56-3 (R9).
//
// Tests use the `HARNESS_CROSS_REPO_GH_BIN` env-var seam to inject a fake-`gh`
// shim (D56-10). Production resolves `gh` from PATH.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const HARNESS_REPO = 'henrik-me/agent-harness';
const REPO_SLUG_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const DEFAULT_LABEL = 'harness-orchestrator';
const DEFAULT_LABEL_COLOR = '0E8A16';
const DEFAULT_LABEL_DESCRIPTION = 'Filed by harness orchestrator';

/**
 * Structured error class with a stable `kind` for callers to switch on.
 * Stable kinds:
 *  - 'bad-input': caller-side validation failure (bad repo, blank title, etc.)
 *  - 'gh-failed': `gh` binary missing or returned a non-zero we cannot recover from
 *  - 'parse-failed': `gh` output could not be parsed (bad JSON, empty/non-URL stdout)
 *  - 'body-file-missing': `bodyFile` path does not exist or is not a regular file
 *  - 'label-provision-failed': `gh label create` failed for a reason other than
 *     "already exists" (e.g. permission denied)
 */
export class CrossRepoError extends Error {
  constructor(kind, message, context = {}) {
    super(message);
    this.name = 'CrossRepoError';
    this.kind = kind;
    Object.assign(this, context);
  }
}

function ghBinary() {
  return process.env.HARNESS_CROSS_REPO_GH_BIN || 'gh';
}

function runGh(args) {
  const bin = ghBinary();
  let result;
  try {
    // If the env-var seam points to a .mjs/.js/.cjs script, spawn it via the
    // current Node executable so tests don't have to worry about Windows .cmd
    // wrappers or POSIX +x bits (mirrors scripts/check-review-output.mjs runGh).
    if (process.env.HARNESS_CROSS_REPO_GH_BIN && /\.(mjs|js|cjs)$/i.test(bin)) {
      result = spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });
    } else {
      result = spawnSync(bin, args, { encoding: 'utf8' });
    }
  } catch (err) {
    throw new CrossRepoError('gh-failed', `failed to spawn gh: ${err.message}`, {
      ghArgs: args,
    });
  }
  if (result.error) {
    // ENOENT etc.
    throw new CrossRepoError('gh-failed', `gh not found or not executable: ${result.error.message}`, {
      ghArgs: args,
    });
  }
  return {
    status: typeof result.status === 'number' ? result.status : 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function validateRepo(repo) {
  if (typeof repo !== 'string' || !REPO_SLUG_RE.test(repo)) {
    throw new CrossRepoError('bad-input', `invalid --repo: must be OWNER/NAME, got: ${JSON.stringify(repo)}`, {
      repo,
    });
  }
  // Case-insensitive self-loop guard: GitHub owner/name slugs are
  // case-insensitive in the URL/API, so Henrik-Me/agent-harness must also be
  // rejected (D56-2 contract).
  if (repo.toLowerCase() === HARNESS_REPO) {
    throw new CrossRepoError(
      'bad-input',
      `--repo refuses ${HARNESS_REPO}: use plain "gh issue create" for harness-internal issues. ` +
        `cross-repo open-issue is reserved for handoffs into OTHER repos.`,
      { repo }
    );
  }
}

function validateTitle(title) {
  if (typeof title !== 'string' || title.trim() === '') {
    throw new CrossRepoError('bad-input', '--title must be a non-empty string (after trimming)', {
      title,
    });
  }
}

function validateLabels(labels) {
  if (!Array.isArray(labels)) {
    throw new CrossRepoError('bad-input', '--label must be an array of non-empty strings', {});
  }
  for (const label of labels) {
    if (typeof label !== 'string' || label.trim() === '') {
      throw new CrossRepoError('bad-input', '--label values must be non-empty strings (after trimming)', {
        label,
      });
    }
  }
}

function validateBodyFile(bodyFile) {
  if (typeof bodyFile !== 'string' || bodyFile === '') {
    throw new CrossRepoError('body-file-missing', '--body-file path is required', { bodyFile });
  }
  let stat;
  try {
    stat = fs.statSync(bodyFile);
  } catch (err) {
    throw new CrossRepoError('body-file-missing', `--body-file not found: ${bodyFile}`, {
      bodyFile,
      cause: err.message,
    });
  }
  if (!stat.isFile()) {
    throw new CrossRepoError('body-file-missing', `--body-file is not a regular file: ${bodyFile}`, {
      bodyFile,
    });
  }
}

/**
 * Label preflight per D56-3 (Copilot R5, refined R9 — non-mutating).
 *
 * For each label, run `gh label create <name> --repo <repo> --color ... --description ...`
 * WITHOUT --force. On exit 0, label was created. On non-zero exit with stderr
 * matching "already exists" (case-insensitive), treat as success (preserve
 * consumer-owned label metadata). Any other non-zero exit raises
 * CrossRepoError(kind: 'label-provision-failed').
 */
function preflightLabels(repo, labels) {
  for (const label of labels) {
    const result = runGh([
      'label',
      'create',
      label,
      '--repo',
      repo,
      '--color',
      DEFAULT_LABEL_COLOR,
      '--description',
      DEFAULT_LABEL_DESCRIPTION,
    ]);
    if (result.status === 0) continue;
    if (/already exists/i.test(result.stderr)) {
      // Consumer-owned label preserved; do not retry with --force.
      continue;
    }
    throw new CrossRepoError(
      'label-provision-failed',
      `gh label create failed for label "${label}" in ${repo}: ${result.stderr.trim() || `(exit ${result.status})`}`,
      { repo, label, exitCode: result.status, stderr: result.stderr }
    );
  }
}

function findExistingOpenIssue(repo, title) {
  const result = runGh([
    'issue',
    'list',
    '--repo',
    repo,
    '--search',
    `${title} in:title`,
    '--state',
    'open',
    '--json',
    'number,title,url',
  ]);
  if (result.status !== 0) {
    throw new CrossRepoError(
      'gh-failed',
      `gh issue list failed for ${repo}: ${result.stderr.trim() || `(exit ${result.status})`}`,
      { repo, exitCode: result.status, stderr: result.stderr }
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout || '[]');
  } catch (err) {
    throw new CrossRepoError(
      'parse-failed',
      `gh issue list returned malformed JSON for ${repo}: ${err.message}`,
      { repo, stdout: result.stdout }
    );
  }
  if (!Array.isArray(parsed)) {
    throw new CrossRepoError(
      'parse-failed',
      `gh issue list returned non-array JSON for ${repo}: ${result.stdout.slice(0, 120)}`,
      { repo }
    );
  }
  // Exact-title match per D56-4 (case-sensitive ===).
  const match = parsed.find((item) => item && item.title === title);
  return match || null;
}

function createIssue(repo, title, bodyFile, labels) {
  const args = ['issue', 'create', '--repo', repo, '--title', title, '--body-file', bodyFile];
  for (const label of labels) {
    args.push('--label', label);
  }
  const result = runGh(args);
  if (result.status !== 0) {
    throw new CrossRepoError(
      'gh-failed',
      `gh issue create failed for ${repo}: ${result.stderr.trim() || `(exit ${result.status})`}`,
      { repo, exitCode: result.status, stderr: result.stderr }
    );
  }
  const url = (result.stdout || '').trim();
  if (url === '') {
    throw new CrossRepoError(
      'parse-failed',
      `gh issue create returned empty stdout for ${repo} (expected issue URL)`,
      { repo, stdout: result.stdout }
    );
  }
  // Validate that stdout looks like a URL.
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new CrossRepoError(
      'parse-failed',
      `gh issue create returned non-URL stdout for ${repo}: ${JSON.stringify(url.slice(0, 120))}`,
      { repo, stdout: result.stdout }
    );
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new CrossRepoError(
      'parse-failed',
      `gh issue create returned non-http(s) URL for ${repo}: ${url.slice(0, 120)}`,
      { repo, stdout: result.stdout }
    );
  }
  return url;
}

/**
 * Open an issue in a non-harness repository, idempotently.
 *
 * @param {object} opts
 * @param {string} opts.repo - GitHub owner/name slug; MUST NOT be henrik-me/agent-harness.
 * @param {string} opts.title - issue title (non-empty after trim).
 * @param {string} opts.bodyFile - path to a regular file containing the issue body.
 * @param {string[]} [opts.labels=[]] - extra labels (default `harness-orchestrator` is always prepended).
 * @returns {{url: string, created: boolean, number?: number, title: string}}
 */
export function openIssue({ repo, title, bodyFile, labels = [] }) {
  validateRepo(repo);
  validateTitle(title);
  validateLabels(labels);
  validateBodyFile(bodyFile);

  // Default label always-first; extras append per D56-3.
  const effectiveLabels = [DEFAULT_LABEL, ...labels];

  const existing = findExistingOpenIssue(repo, title);
  if (existing) {
    return {
      url: existing.url,
      created: false,
      number: existing.number,
      title,
    };
  }

  // Preflight labels before issue create per D56-3 (R5/R9).
  preflightLabels(repo, effectiveLabels);

  const url = createIssue(repo, title, bodyFile, effectiveLabels);
  return { url, created: true, title };
}
