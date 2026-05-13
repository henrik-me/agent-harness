/**
 * tests/check-pr-commits.test.mjs — Tests for the B1 PR commit trailer linter.
 *
 * Each test creates a scratch git repository under os.tmpdir() (per LRN-094 —
 * NEVER REPO_ROOT; parallel tests on recursive linters race on Windows).
 * Commits are made with controlled messages (with/without the canonical
 * Co-authored-by trailer), then the script is invoked via spawnSync to
 * exercise argv parsing + exit codes end-to-end.
 *
 * Cases covered:
 *   1. Clean PR (every commit has the trailer) → exit 0
 *   2. Missing trailer at HEAD → exit 1, that commit listed
 *   3. Missing trailer mid-history (commit 2 of 4) → exit 1, that commit listed
 *   4. --skip-reasons bot-author → exit 0 with skip notice
 *   5. Merge commit in range without trailer → exit 1 (no --no-merges filtering)
 *   6. Empty range (base == head) → exit 0 with 0 errors
 *   7. --skip-reasons workboard-only → exit 0 with skip notice
 *   8. --help exits 0 with usage text
 *   9. Missing --base exits 2
 *  10. Missing --head exits 2
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'check-pr-commits.mjs');

/** Canonical Co-authored-by trailer. */
const TRAILER =
  'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>';

// ---------------------------------------------------------------------------
// Scratch directory (single parent; each test creates its own sub-repo)
// ---------------------------------------------------------------------------

let scratch;

before(() => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'check-pr-commits-'));
});

after(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run a git command in the given repo directory. Throws on non-zero exit.
 *
 * @param {string} repoDir
 * @param {string[]} args
 * @returns {string} trimmed stdout
 */
function git(repoDir, args) {
  const result = spawnSync('git', args, {
    cwd: repoDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(' ')} failed (exit ${result.status}): ${result.stderr}`
    );
  }
  return result.stdout.trim();
}

/**
 * Get the HEAD SHA of a repo.
 *
 * @param {string} repoDir
 * @returns {string}
 */
function headSha(repoDir) {
  return git(repoDir, ['rev-parse', 'HEAD']);
}

/**
 * Write a file and create a commit in the given repo.
 *
 * @param {string} repoDir
 * @param {string} message  Full commit message (may contain \n for multiline)
 * @returns {string} SHA of the new commit
 */
function makeCommit(repoDir, message) {
  const fname = `f-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;
  fs.writeFileSync(path.join(repoDir, fname), fname);
  git(repoDir, ['add', fname]);
  git(repoDir, ['commit', '-m', message]);
  return headSha(repoDir);
}

/**
 * Initialise a fresh git repo with local user config and an initial commit
 * (so there is always at least one SHA to use as a "base").
 *
 * @returns {string} path to the new repo
 */
function makeRepo() {
  const repoDir = fs.mkdtempSync(path.join(scratch, 'repo-'));
  git(repoDir, ['init']);
  git(repoDir, ['config', 'user.name', 'Test User']);
  git(repoDir, ['config', 'user.email', 'test@example.com']);
  makeCommit(repoDir, `initial commit\n\n${TRAILER}`);
  return repoDir;
}

/**
 * Run the check-pr-commits script as a subprocess.
 *
 * @param {string} cwd  Working directory for the git repo
 * @param {string[]} extraArgs
 * @returns {{ status: number, stdout: string, stderr: string }}
 */
function runLinter(cwd, extraArgs = []) {
  const result = spawnSync('node', [SCRIPT, ...extraArgs], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

describe('scripts/check-pr-commits.mjs', () => {
  it('case 1: clean PR — every commit has the trailer → exit 0', () => {
    const repo = makeRepo();
    const base = headSha(repo);
    makeCommit(repo, `feat: add feature A\n\n${TRAILER}`);
    makeCommit(repo, `feat: add feature B\n\n${TRAILER}`);
    const head = headSha(repo);

    const r = runLinter(repo, ['--base', base, '--head', head]);
    assert.equal(
      r.status, 0,
      `expected exit 0; stdout=${r.stdout}; stderr=${r.stderr}`
    );
    assert.match(r.stdout, /0 errors/);
  });

  it('case 2: missing trailer at HEAD → exit 1, that commit listed', () => {
    const repo = makeRepo();
    const base = headSha(repo);
    makeCommit(repo, `feat: no trailer at HEAD`);
    const head = headSha(repo);

    const r = runLinter(repo, ['--base', base, '--head', head]);
    assert.equal(
      r.status, 1,
      `expected exit 1; stdout=${r.stdout}`
    );
    assert.match(r.stdout, /missing Co-authored-by: Copilot trailer/);
    assert.match(r.stdout, /no trailer at HEAD/);
    assert.match(r.stdout, /1 errors/);
  });

  it('case 3: missing trailer mid-history (commit 2 of 4) → exit 1, that commit listed', () => {
    const repo = makeRepo();
    const base = headSha(repo);
    makeCommit(repo, `commit 1 with trailer\n\n${TRAILER}`);
    makeCommit(repo, `commit 2 missing trailer`); // bad commit
    makeCommit(repo, `commit 3 with trailer\n\n${TRAILER}`);
    makeCommit(repo, `commit 4 with trailer\n\n${TRAILER}`);
    const head = headSha(repo);

    const r = runLinter(repo, ['--base', base, '--head', head]);
    assert.equal(
      r.status, 1,
      `expected exit 1; stdout=${r.stdout}`
    );
    assert.match(r.stdout, /commit 2 missing trailer/);
    assert.match(r.stdout, /missing Co-authored-by: Copilot trailer/);
    assert.match(r.stdout, /1 errors/);
  });

  it('case 4: --skip-reasons bot-author → exit 0 with skip notice', () => {
    const repo = makeRepo();
    const base = headSha(repo);
    makeCommit(repo, `bot authored commit no trailer`);
    const head = headSha(repo);

    const r = runLinter(repo, [
      '--base', base, '--head', head,
      '--skip-reasons', 'bot-author',
    ]);
    assert.equal(
      r.status, 0,
      `expected exit 0 (skipped); stdout=${r.stdout}`
    );
    assert.match(r.stdout, /bot-author|skipped/i);
    assert.match(r.stdout, /0 errors.*skipped/);
  });

  it('case 5: merge commit in range without trailer → exit 1 (no --no-merges filtering)', () => {
    const repo = makeRepo();
    const base = headSha(repo);

    // Create a feature branch and add a commit (with trailer)
    git(repo, ['checkout', '-b', 'feature-branch']);
    makeCommit(repo, `feature work\n\n${TRAILER}`);

    // Return to the original branch and add a diverging commit (so merge is non-FF)
    git(repo, ['checkout', '-']);
    makeCommit(repo, `main branch work\n\n${TRAILER}`);

    // Merge feature branch — the merge commit itself carries no trailer
    const mergeResult = spawnSync(
      'git',
      ['merge', '--no-ff', 'feature-branch', '-m', 'Merge feature-branch (no trailer)'],
      {
        cwd: repo,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    assert.equal(
      mergeResult.status, 0,
      `git merge failed: ${mergeResult.stderr}`
    );

    const head = headSha(repo);
    const r = runLinter(repo, ['--base', base, '--head', head]);
    assert.equal(
      r.status, 1,
      `expected exit 1 (merge commit caught); stdout=${r.stdout}`
    );
    assert.match(r.stdout, /missing Co-authored-by: Copilot trailer/);
    assert.match(r.stdout, /Merge feature-branch/);
  });

  it('case 6: empty range (base == head) → exit 0 with 0 errors', () => {
    const repo = makeRepo();
    const sha = headSha(repo);

    const r = runLinter(repo, ['--base', sha, '--head', sha]);
    assert.equal(
      r.status, 0,
      `expected exit 0; stdout=${r.stdout}`
    );
    assert.match(r.stdout, /0 errors/);
  });

  it('case 7: --skip-reasons workboard-only → exit 0 with skip notice', () => {
    const repo = makeRepo();
    const base = headSha(repo);
    makeCommit(repo, `workboard commit no trailer`);
    const head = headSha(repo);

    const r = runLinter(repo, [
      '--base', base, '--head', head,
      '--skip-reasons', 'workboard-only',
    ]);
    assert.equal(
      r.status, 0,
      `expected exit 0 (skipped); stdout=${r.stdout}`
    );
    assert.match(r.stdout, /workboard-only|skipped/i);
    assert.match(r.stdout, /0 errors.*skipped/);
  });

  it('case 8: --help exits 0 with usage text', () => {
    const repo = makeRepo();
    const r = runLinter(repo, ['--help']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /Usage.*check-pr-commits/);
    assert.match(r.stdout, /--base/);
    assert.match(r.stdout, /--head/);
  });

  it('case 9: missing --base exits 2', () => {
    const repo = makeRepo();
    const sha = headSha(repo);
    const r = runLinter(repo, ['--head', sha]);
    assert.equal(r.status, 2);
  });

  it('case 10: missing --head exits 2', () => {
    const repo = makeRepo();
    const sha = headSha(repo);
    const r = runLinter(repo, ['--base', sha]);
    assert.equal(r.status, 2);
  });
});
