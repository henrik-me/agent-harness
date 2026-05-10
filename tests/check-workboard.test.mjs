/**
 * tests/check-workboard.test.mjs — Tests for scripts/check-workboard.mjs
 *
 * Uses node:test (consistent with existing test files).
 * Spawns the linter via spawnSync (same pattern as tests/check-learnings.test.mjs).
 * Fixture files live in tests/fixtures/cs06/workboard/.
 *
 * Run: node --test tests/check-workboard.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const LINTER = path.join(REPO_ROOT, 'scripts', 'check-workboard.mjs');
const FIXTURES = path.join(__dirname, 'fixtures', 'cs06', 'workboard');
const NODE = process.execPath;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run the linter with given args.  Returns { stdout, stderr, status }.
 *
 * @param {string[]} [args]
 * @returns {{ stdout: string, stderr: string, status: number }}
 */
function runLinter(args = []) {
  const result = spawnSync(NODE, [LINTER, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? -1,
  };
}

/**
 * Return the absolute path to a fixture file.
 *
 * @param {string} name
 * @returns {string}
 */
function fixture(name) {
  return path.join(FIXTURES, name);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('check-workboard linter', () => {
  // 1. Valid WORKBOARD fixture → exit 0
  it('1. valid fixture exits 0', () => {
    const r = runLinter(['--file', fixture('valid.md')]);
    assert.equal(
      r.status, 0,
      `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('0 errors'),
      `Expected "0 errors" in output; got:\n${r.stdout}`
    );
  });

  // 2. Missing ## Active Work heading → exit 1
  it('2. missing Active Work heading exits 1', () => {
    const r = runLinter(['--file', fixture('missing-active-work.md')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected "ERROR" in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('Active Work'),
      `Expected "Active Work" mentioned; got:\n${r.stdout}`
    );
  });

  // 3. Active Work table missing required column → exit 1
  it('3. Active Work table missing column exits 1', () => {
    const r = runLinter(['--file', fixture('missing-column.md')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected "ERROR" in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('Blocked Reason'),
      `Expected mention of missing column "Blocked Reason"; got:\n${r.stdout}`
    );
  });

  // 4. Orphan CS entry (empty CS-Task ID, Title not "no active CS") → exit 1
  it('4. orphan CS entry exits 1', () => {
    const r = runLinter(['--file', fixture('orphan-cs.md')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected "ERROR" in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('CS-Task ID'),
      `Expected mention of "CS-Task ID" in error; got:\n${r.stdout}`
    );
  });

  // 5. Duplicate Recently Completed sections → exit 1
  it('5. duplicate Recently Completed sections exit 1', () => {
    const r = runLinter(['--file', fixture('duplicate-recently-completed.md')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('exactly one') && r.stdout.includes('Recently Completed'),
      `Expected duplicate Recently Completed error; got:\n${r.stdout}`
    );
  });

  // 6. Recently Completed rows with stale in-flight language → exit 1
  it('6. stale Recently Completed row exits 1', () => {
    const r = runLinter(['--file', fixture('stale-completed.md')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('stale in-flight language'),
      `Expected stale language error; got:\n${r.stdout}`
    );
  });

  // 7. Real-file regression: actual WORKBOARD.md → exit 0
  it('7. real WORKBOARD.md passes (regression)', () => {
    const workboard = path.join(REPO_ROOT, 'WORKBOARD.md');
    const r = runLinter(['--file', workboard]);
    assert.equal(
      r.status, 0,
      `Expected exit 0 for WORKBOARD.md; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
  });

  // 8. Missing --file → exit 2
  it('8. missing --file exits 2', () => {
    const r = runLinter([]);
    assert.equal(
      r.status, 2,
      `Expected exit 2 when --file is missing; got ${r.status}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stderr.includes('--file'),
      `Expected "--file" mentioned in stderr; got:\n${r.stderr}`
    );
  });
});
