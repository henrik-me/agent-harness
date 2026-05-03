/**
 * tests/check-clickstop.test.mjs — Tests for scripts/check-clickstop.mjs
 *
 * Uses node:test (consistent with existing test files).
 * Spawns the linter via spawnSync (same pattern as check-learnings.test.mjs).
 * Fixture trees live under tests/fixtures/cs06/clickstop/.
 *
 * Run: node --test tests/check-clickstop.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const LINTER = path.join(REPO_ROOT, 'scripts', 'check-clickstop.mjs');
const FIXTURES = path.join(__dirname, 'fixtures', 'cs06', 'clickstop');
const NODE = process.execPath;

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Run the linter with given args. Returns { stdout, stderr, status }.
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
 * Return the path to a fixture subdirectory.
 *
 * @param {string} name
 * @returns {string}
 */
function fixtureDir(name) {
  return path.join(FIXTURES, name);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('check-clickstop linter', () => {

  // 1. Valid tree (3 files, one per state) → exit 0
  it('1. valid tree exits 0 with success indicator', () => {
    const r = runLinter(['--dir', fixtureDir('valid')]);
    assert.equal(
      r.status, 0,
      `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('✅'),
      `Expected ✅ in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('3 files checked'),
      `Expected "3 files checked" in summary; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('0 errors'),
      `Expected "0 errors" in summary; got:\n${r.stdout}`
    );
  });

  // 2. active/ file missing **Status:** field → exit 1
  it('2. active file missing **Status:** field exits 1', () => {
    const r = runLinter(['--dir', fixtureDir('missing-field')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected ERROR in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('Status'),
      `Expected mention of "Status" in error; got:\n${r.stdout}`
    );
  });

  // 3. active/ file has **Status:** done (mismatched lifecycle) → exit 1
  it('3. active file with Status:done (lifecycle mismatch) exits 1', () => {
    const r = runLinter(['--dir', fixtureDir('mismatched')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected ERROR in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.toLowerCase().includes('active') && r.stdout.toLowerCase().includes('done'),
      `Expected mention of both "active" and "done" in error; got:\n${r.stdout}`
    );
  });

  // 4. Filename violates convention (active/random_name.md) → exit 1
  it('4. non-conforming filename exits 1', () => {
    const r = runLinter(['--dir', fixtureDir('bad-filename')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected ERROR in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('filename') || r.stdout.includes('convention'),
      `Expected mention of "filename" or "convention" in error; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('random_name.md'),
      `Expected "random_name.md" mentioned in error; got:\n${r.stdout}`
    );
  });

  // 5. Real-tree regression: project/clickstops → exit 0
  it('5. real project/clickstops tree exits 0', () => {
    const r = runLinter(['--dir', path.join(REPO_ROOT, 'project', 'clickstops')]);
    assert.equal(
      r.status, 0,
      `Expected exit 0 on real tree; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('✅'),
      `Expected ✅ in output; got:\n${r.stdout}`
    );
  });

  // 6. Missing --dir → exit 2
  it('6. missing --dir exits 2', () => {
    const r = runLinter([]);
    assert.equal(
      r.status, 2,
      `Expected exit 2 for missing --dir; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stderr.includes('--dir'),
      `Expected mention of "--dir" in stderr; got:\n${r.stderr}`
    );
  });

  // 7. --quiet flag suppresses per-finding output but still prints summary
  it('7. --quiet suppresses finding output but prints summary', () => {
    const r = runLinter(['--dir', fixtureDir('missing-field'), '--quiet']);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`
    );
    // With --quiet, individual ERROR lines should not appear
    assert.ok(
      !r.stdout.includes('ERROR:'),
      `Expected no "ERROR:" lines with --quiet; got:\n${r.stdout}`
    );
    // But summary must still appear
    assert.ok(
      r.stdout.includes('clickstops:'),
      `Expected summary line with --quiet; got:\n${r.stdout}`
    );
  });

  // 8. --help exits 0 and prints usage
  it('8. --help exits 0 with usage text', () => {
    const r = runLinter(['--help']);
    assert.equal(
      r.status, 0,
      `Expected exit 0 for --help; got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('--dir'),
      `Expected "--dir" in help output; got:\n${r.stdout}`
    );
  });

  // 9. unknown flag exits 2
  it('9. unknown flag exits 2', () => {
    const r = runLinter(['--dir', fixtureDir('valid'), '--unknown-flag']);
    assert.equal(
      r.status, 2,
      `Expected exit 2 for unknown flag; got ${r.status}\nstdout: ${r.stdout}`
    );
  });

});
