/**
 * tests/check-public-artifact.test.mjs — Tests for scripts/check-public-artifact.mjs
 *
 * Uses node:test (consistent with existing test files).
 * Spawns the linter via spawnSync.
 * Fixture files live in tests/fixtures/cs06/public-artifact/.
 *
 * Run: node --test tests/check-public-artifact.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const LINTER = path.join(REPO_ROOT, 'scripts', 'check-public-artifact.mjs');
const FIXTURES = path.join(__dirname, 'fixtures', 'cs06', 'public-artifact');
const NODE = process.execPath;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run the linter with given extra args. Returns { stdout, stderr, status }.
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
 * Return the absolute path to a fixture sub-directory.
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

describe('check-public-artifact linter', () => {
  // 1. Clean dir — no forbidden patterns → exit 0
  it('1. clean dir exits 0', () => {
    const r = runLinter(['--dir', fixtureDir('clean')]);
    assert.equal(
      r.status, 0,
      `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('✅'),
      `Expected success indicator in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('0 forbidden findings'),
      `Expected "0 forbidden findings" in output; got:\n${r.stdout}`
    );
  });

  // 2. File contains GitHub PAT → exit 1
  it('2. file with GitHub PAT exits 1', () => {
    const r = runLinter(['--dir', fixtureDir('github-pat')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected "ERROR" in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('GitHub token') || r.stdout.includes('ghp_'),
      `Expected mention of GitHub token; got:\n${r.stdout}`
    );
  });

  // 3. File contains AWS access key → exit 1
  it('3. file with AWS access key exits 1', () => {
    const r = runLinter(['--dir', fixtureDir('aws-key')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected "ERROR" in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('AWS') || r.stdout.includes('AKIA'),
      `Expected mention of AWS key; got:\n${r.stdout}`
    );
  });

  // 4. File contains forbidden internal URL → exit 1
  it('4. file with forbidden internal URL exits 1', () => {
    const r = runLinter(['--dir', fixtureDir('forbidden-url')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected "ERROR" in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('internal') || r.stdout.includes('URL'),
      `Expected mention of internal/URL; got:\n${r.stdout}`
    );
  });

  // 5. JSON file with forbidden key → exit 1
  it('5. JSON file with forbidden key exits 1', () => {
    const r = runLinter(['--dir', fixtureDir('forbidden-json-key')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected "ERROR" in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('password') || r.stdout.includes('forbidden JSON key'),
      `Expected mention of forbidden key; got:\n${r.stdout}`
    );
  });

  // 6. Binary file (with NUL byte) → skipped, exit 0
  it('6. binary file is skipped, exits 0', () => {
    const r = runLinter(['--dir', fixtureDir('binary-file')]);
    assert.equal(
      r.status, 0,
      `Expected exit 0 (binary skipped); got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('✅'),
      `Expected success indicator; got:\n${r.stdout}`
    );
    // Binary file should not be counted in scanned files (it's skipped)
    assert.ok(
      r.stdout.includes('0 forbidden findings'),
      `Expected 0 findings; got:\n${r.stdout}`
    );
  });

  // 7. Empty dir → exit 0
  it('7. empty dir exits 0', () => {
    const r = runLinter(['--dir', fixtureDir('empty-dir')]);
    assert.equal(
      r.status, 0,
      `Expected exit 0 for empty dir; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('0 files scanned') || r.stdout.includes('0 forbidden findings'),
      `Expected "0 files scanned" or "0 forbidden findings"; got:\n${r.stdout}`
    );
  });

  // 8. Missing --dir → exit 2
  it('8. missing --dir exits 2', () => {
    const r = runLinter([]);
    assert.equal(
      r.status, 2,
      `Expected exit 2 for missing --dir; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stderr.includes('--dir') || r.stderr.includes('required'),
      `Expected mention of --dir in stderr; got:\n${r.stderr}`
    );
  });
});
