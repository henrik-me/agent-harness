/**
 * tests/check-composed-blocks.test.mjs — Tests for scripts/check-composed-blocks.mjs
 *
 * Uses node:test (consistent with existing test files).
 * Spawns the linter via spawnSync following the check-learnings.test.mjs pattern.
 * Fixture files live in tests/fixtures/cs06/composed/.
 *
 * Run: node --test tests/check-composed-blocks.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const LINTER = path.join(REPO_ROOT, 'scripts', 'check-composed-blocks.mjs');
const FIXTURES = path.join(__dirname, 'fixtures', 'cs06', 'composed');
const NODE = process.execPath;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run the linter with given extra args.
 *
 * @param {string[]} args
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

describe('check-composed-blocks linter', () => {
  // 1. Valid file with 2 balanced blocks → exit 0
  it('1. valid file with two balanced blocks exits 0', () => {
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

  // 2. Duplicate block ID → exit 1
  it('2. duplicate block ID exits 1 with error', () => {
    const r = runLinter(['--file', fixture('duplicate-id.md')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected "ERROR" in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('duplicate'),
      `Expected "duplicate" in error message; got:\n${r.stdout}`
    );
  });

  // 3. Unmatched start (no matching end) → exit 1
  it('3. unmatched start marker exits 1 with error', () => {
    const r = runLinter(['--file', fixture('unmatched-start.md')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected "ERROR" in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('unmatched') || r.stdout.includes('matching end'),
      `Expected unmatched-marker error; got:\n${r.stdout}`
    );
  });

  // 4. Marker inside code fence → exit 1
  it('4. marker inside code fence exits 1 with error', () => {
    const r = runLinter(['--file', fixture('marker-in-fence.md')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected "ERROR" in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('fence'),
      `Expected "fence" in error message; got:\n${r.stdout}`
    );
  });

  // 5. Marker inside code fence with U+200B escape → exit 0
  it('5. marker inside code fence with U+200B escape exits 0', () => {
    const r = runLinter(['--file', fixture('marker-in-fence-escaped.md')]);
    assert.equal(
      r.status, 0,
      `Expected exit 0 (escaped markers are OK); got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('0 errors'),
      `Expected "0 errors" in output; got:\n${r.stdout}`
    );
  });

  // 6. --allowed-ids intro,notes against file with extra id=foo → exit 1
  it('6. extra block ID not in --allowed-ids exits 1 with error', () => {
    const r = runLinter([
      '--file', fixture('extra-id.md'),
      '--allowed-ids', 'intro,notes',
    ]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected "ERROR" in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('foo'),
      `Expected error mentioning "foo"; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('allowed'),
      `Expected "allowed" in error message; got:\n${r.stdout}`
    );
  });

  // 7. Missing required ID via --allowed-ids → exit 1
  it('7. missing required block ID exits 1 with error', () => {
    const r = runLinter([
      '--file', fixture('missing-required-id.md'),
      '--allowed-ids', 'intro,notes',
    ]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected "ERROR" in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('notes'),
      `Expected error mentioning "notes"; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('missing') || r.stdout.includes('required'),
      `Expected "missing" or "required" in error message; got:\n${r.stdout}`
    );
  });

  // 8. Missing --file → exit 2
  it('8. missing --file flag exits 2 with usage message', () => {
    const r = runLinter([]);
    assert.equal(
      r.status, 2,
      `Expected exit 2; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stderr.includes('--file') || r.stderr.includes('required'),
      `Expected usage hint in stderr; got:\n${r.stderr}`
    );
  });

  // 9. Lock file orphan → exit 1
  it('9. lock file orphan block ID exits 1 with error', () => {
    const r = runLinter([
      '--file', fixture('valid.md'),
      '--lock', fixture('lock-with-orphan.json'),
    ]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected "ERROR" in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('orphan') || r.stdout.includes('orphan-id'),
      `Expected orphan mention in error; got:\n${r.stdout}`
    );
  });

  // 10. --quiet suppresses per-finding output but still emits summary
  it('10. --quiet suppresses individual errors but prints summary', () => {
    const r = runLinter(['--file', fixture('duplicate-id.md'), '--quiet']);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}`
    );
    // Summary line should still appear
    assert.ok(
      r.stdout.includes('duplicate-id.md'),
      `Expected filename in summary; got:\n${r.stdout}`
    );
    // Individual ERROR lines should NOT appear
    assert.ok(
      !r.stdout.includes('ERROR:'),
      `Expected no per-finding ERROR lines in quiet mode; got:\n${r.stdout}`
    );
  });

  // 11. R2 — Schema-correct lock format (lock.files[].blocks for class=composed)
  it('11. schema-correct lock (lock.files[].blocks) detects orphan block ID', () => {
    const r = runLinter([
      '--file', fixture('valid.md'),
      '--lock', fixture('lock-with-orphan-schema.json'),
    ]);
    assert.equal(
      r.status, 1,
      `Expected exit 1 against schema-shaped lock with orphan; got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('orphan-id'),
      `Expected orphan-id mention in error; got:\n${r.stdout}`
    );
  });
});
