/**
 * tests/check-context.test.mjs — Tests for scripts/check-context.mjs
 *
 * Uses node:test (consistent with existing test files).
 * Spawns the linter via spawnSync (same pattern as tests/check-learnings.test.mjs).
 * Fixture files live in tests/fixtures/cs06/context/.
 *
 * Run: node --test tests/check-context.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const LINTER = path.join(REPO_ROOT, 'scripts', 'check-context.mjs');
const FIXTURES = path.join(__dirname, 'fixtures', 'cs06', 'context');
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
 * Return the absolute path to a fixture file under tests/fixtures/cs06/context/.
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

describe('check-context linter', () => {
  // 1. Valid CONTEXT.md (all 4 headings, no stale language) → exit 0
  it('1. valid CONTEXT.md with all required headings exits 0', () => {
    const r = runLinter(['--file', fixture('valid.md'), '--cwd', FIXTURES]);
    assert.equal(
      r.status, 0,
      `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('✅'),
      `Expected success indicator in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('CONTEXT.md: 0 errors'),
      `Expected "CONTEXT.md: 0 errors" in output; got:\n${r.stdout}`
    );
  });

  // 2. Missing one required heading → exit 1
  it('2. missing one required heading exits 1 with error', () => {
    const r = runLinter(['--file', fixture('missing-one-heading.md'), '--cwd', FIXTURES]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected "ERROR" in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('CS plan'),
      `Expected mention of missing "CS plan" heading; got:\n${r.stdout}`
    );
  });

  // 3. Missing all required headings → exit 1
  it('3. missing all required headings exits 1 with multiple errors', () => {
    const r = runLinter(['--file', fixture('missing-all-headings.md'), '--cwd', FIXTURES]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`
    );
    const errorCount = (r.stdout.match(/^ERROR:/gm) ?? []).length;
    assert.ok(
      errorCount >= 4,
      `Expected ≥4 ERROR lines (one per missing heading); got ${errorCount}:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('Codebase state'),
      `Expected "Codebase state" in errors; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('Architecture pointer'),
      `Expected "Architecture pointer" in errors; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('Blockers / open questions'),
      `Expected "Blockers / open questions" in errors; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('CS plan'),
      `Expected "CS plan" in errors; got:\n${r.stdout}`
    );
  });

  // 4. Stale "ready to claim" with active workboard fixture → exit 1
  it('4. stale "ready to claim" language with active workboard exits 1', () => {
    const staleDir = fixture('stale-workboard');
    const staleContextFile = path.join(staleDir, 'CONTEXT.md');
    const r = runLinter(['--file', staleContextFile, '--cwd', staleDir]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected "ERROR" in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('ready to claim'),
      `Expected "ready to claim" mentioned in error; got:\n${r.stdout}`
    );
  });

  // 5. Real-file regression: actual CONTEXT.md → exit 0
  it('5. real CONTEXT.md passes linter (exit 0)', () => {
    const r = runLinter([
      '--file', path.join(REPO_ROOT, 'CONTEXT.md'),
      '--cwd', REPO_ROOT,
    ]);
    assert.equal(
      r.status, 0,
      `Expected exit 0 against real CONTEXT.md; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('✅'),
      `Expected success indicator; got:\n${r.stdout}`
    );
  });

  // 6. --quiet flag suppresses per-finding output but prints summary
  it('6. --quiet suppresses per-finding lines but still prints summary', () => {
    // Use a fixture with errors to verify suppression
    const r = runLinter([
      '--file', fixture('missing-one-heading.md'),
      '--cwd', FIXTURES,
      '--quiet',
    ]);
    assert.equal(
      r.status, 1,
      `Expected exit 1 (errors present); got ${r.status}`
    );
    // No ERROR lines (suppressed by --quiet)
    assert.ok(
      !r.stdout.includes('ERROR:'),
      `Expected no ERROR: lines with --quiet; got:\n${r.stdout}`
    );
    // But summary is still present
    assert.ok(
      r.stdout.includes('CONTEXT.md:'),
      `Expected summary line even with --quiet; got:\n${r.stdout}`
    );
  });

  // 7. Missing --file arg → exit 2 with usage error
  it('7. missing --file arg exits 2 with usage error', () => {
    const r = runLinter([]);
    assert.equal(
      r.status, 2,
      `Expected exit 2 for missing --file; got ${r.status}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stderr.includes('--file') || r.stderr.includes('required'),
      `Expected usage error mentioning --file; got:\n${r.stderr}`
    );
  });

  // 8. No WORKBOARD.md in cwd → stale phrases do not trigger error (check skipped)
  it('8. stale phrase without WORKBOARD.md does not trigger error', () => {
    // Point --cwd to a directory with no WORKBOARD.md; file has "ready to claim"
    // We use missing-all-headings.md which has no "ready to claim", so we need
    // the stale fixture but point cwd to a directory without WORKBOARD.md.
    const staleContextFile = fixture(path.join('stale-workboard', 'CONTEXT.md'));
    // Use FIXTURES dir as cwd — it has no WORKBOARD.md
    const r = runLinter(['--file', staleContextFile, '--cwd', FIXTURES]);
    // Should only fail on missing headings (there are none missing in stale fixture)
    // — the stale-workboard/CONTEXT.md has all 4 required headings, and
    //   since there is no WORKBOARD.md in FIXTURES, stale check is skipped.
    assert.equal(
      r.status, 0,
      `Expected exit 0 when no WORKBOARD.md; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
  });

  // 9. Unknown flag → exit 2
  it('9. unknown flag exits 2', () => {
    const r = runLinter(['--file', fixture('valid.md'), '--unknown-flag']);
    assert.equal(
      r.status, 2,
      `Expected exit 2 for unknown flag; got ${r.status}`
    );
    assert.ok(
      r.stderr.includes('unknown flag'),
      `Expected "unknown flag" in stderr; got:\n${r.stderr}`
    );
  });
});
