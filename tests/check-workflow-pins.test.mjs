/**
 * tests/check-workflow-pins.test.mjs — Tests for scripts/check-workflow-pins.mjs
 *
 * Uses node:test (consistent with existing test files).
 * Spawns the linter via spawnSync (same pattern as tests/check-learnings.test.mjs).
 * Fixture files live in tests/fixtures/cs06/workflow-pins/.
 *
 * Run: node --test tests/check-workflow-pins.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const LINTER = path.join(REPO_ROOT, 'scripts', 'check-workflow-pins.mjs');
const FIXTURES = path.join(__dirname, 'fixtures', 'cs06', 'workflow-pins');
const NODE = process.execPath;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run the linter with given extra args.  Returns { stdout, stderr, status }.
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
 * Return the absolute path to a fixture directory under workflow-pins/.
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

describe('check-workflow-pins linter', () => {
  // 1. Valid SHA pin → exit 0
  it('1. valid 40-char hex SHA pin exits 0', () => {
    const r = runLinter(['--dir', fixtureDir('valid-sha')]);
    assert.equal(
      r.status, 0,
      `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('✅'),
      `Expected success indicator in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('1 pins checked'),
      `Expected 1 pin checked; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('0 errors'),
      `Expected 0 errors; got:\n${r.stdout}`
    );
  });

  // 2. Valid pin matching harness_pin in config → exit 0
  it('2. pin matching harness_pin config exits 0', () => {
    const r = runLinter([
      '--dir', fixtureDir('valid-pin'),
      '--config', path.join(FIXTURES, 'config-v0.1.0.json'),
    ]);
    assert.equal(
      r.status, 0,
      `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('✅'),
      `Expected success indicator in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('0 errors'),
      `Expected 0 errors; got:\n${r.stdout}`
    );
  });

  // 3. Branch ref (@main) → exit 1
  it('3. branch ref @main exits 1 with error', () => {
    const r = runLinter(['--dir', fixtureDir('invalid-branch')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected ERROR in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('@main') || r.stdout.includes('main'),
      `Expected mention of 'main' ref in error; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('1 errors'),
      `Expected 1 error in summary; got:\n${r.stdout}`
    );
  });

  // 4. Ref doesn't match harness_pin → exit 1
  it('4. pin mismatch with harness_pin exits 1 with error', () => {
    const r = runLinter([
      '--dir', fixtureDir('invalid-mismatch'),
      '--config', path.join(FIXTURES, 'config-v0.1.0.json'),
    ]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected ERROR in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('v0.1.0') || r.stdout.includes('harness_pin'),
      `Expected mention of harness_pin mismatch; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('1 errors'),
      `Expected 1 error in summary; got:\n${r.stdout}`
    );
  });

  // 5. Real-tree regression: actual .github/workflows/ has no harness refs → exit 0
  it('5. real .github/workflows/ has no harness refs — vacuously passes (exit 0)', () => {
    const realWorkflowsDir = path.join(REPO_ROOT, '.github', 'workflows');
    const r = runLinter(['--dir', realWorkflowsDir]);
    assert.equal(
      r.status, 0,
      `Expected exit 0 for real workflows dir; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('0 errors'),
      `Expected 0 errors; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('0 pins checked'),
      `Expected 0 pins checked (no harness refs); got:\n${r.stdout}`
    );
  });

  // 6. Missing --dir → exit 2
  it('6. missing --dir exits 2 with usage error', () => {
    const r = runLinter([]);
    assert.equal(
      r.status, 2,
      `Expected exit 2; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stderr.includes('--dir'),
      `Expected mention of '--dir' in stderr; got:\n${r.stderr}`
    );
  });

  // 7. Empty dir (no yml files) → exit 0
  it('7. directory with no yml/yaml files exits 0', () => {
    const r = runLinter(['--dir', fixtureDir('empty')]);
    assert.equal(
      r.status, 0,
      `Expected exit 0 for empty dir; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('0 files'),
      `Expected "0 files" in summary; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('0 errors'),
      `Expected 0 errors; got:\n${r.stdout}`
    );
  });
});
