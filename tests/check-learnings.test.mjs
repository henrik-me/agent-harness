/**
 * tests/check-learnings.test.mjs — Tests for scripts/check-learnings.mjs
 *
 * Uses node:test (consistent with existing test files).
 * Spawns the linter via spawnSync (same pattern as tests/cli.test.mjs).
 * Fixture files live in tests/fixtures/cs05/.
 *
 * Run: node --test tests/check-learnings.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const LINTER = path.join(REPO_ROOT, 'scripts', 'check-learnings.mjs');
const FIXTURES = path.join(__dirname, 'fixtures', 'cs05');
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
 * Return the absolute path to a fixture file under tests/fixtures/cs05/.
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

describe('check-learnings linter', () => {
  // 1. Valid entry → exit 0
  it('1. valid entry exits 0', () => {
    const r = runLinter(['--file', fixture('valid.md')]);
    assert.equal(
      r.status, 0,
      `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('✅'),
      `Expected success indicator in output; got:\n${r.stdout}`
    );
  });

  // 2. Missing required field (no 'date') → exit 1
  it('2. missing required field (no date) exits 1 with error', () => {
    const r = runLinter(['--file', fixture('missing-date.md')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('LRN-001'),
      `Expected error mentioning LRN-001; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected "ERROR" in output; got:\n${r.stdout}`
    );
    // NB-7: assert specific AJV-style message about the missing field
    assert.ok(
      r.stdout.includes('date'),
      `Expected mention of "date" in error; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes("required") || r.stdout.includes("must have required property"),
      `Expected "required" or "must have required property" in error; got:\n${r.stdout}`
    );
  });

  // 3. Unknown category value → exit 1
  it('3. unknown category value exits 1 with error', () => {
    const r = runLinter(['--file', fixture('unknown-category.md')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected "ERROR" in output; got:\n${r.stdout}`
    );
  });

  // 4. status: deferred without deferred_until → exit 1
  it('4. deferred status without deferred_until exits 1 with error', () => {
    const r = runLinter(['--file', fixture('deferred-no-until.md')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected "ERROR" in output; got:\n${r.stdout}`
    );
  });

  // 5. status: open with date 30+ days ago → exit 0 with WARNING
  it('5. open status with old date exits 0 with age warning', () => {
    const r = runLinter(['--file', fixture('open-old-date.md')]);
    assert.equal(
      r.status, 0,
      `Expected exit 0 (warning only); got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('WARNING'),
      `Expected "WARNING" in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('open'),
      `Expected mention of "open" status; got:\n${r.stdout}`
    );
  });

  // 6. status: deferred with deferred_until in past → exit 0 with WARNING
  it('6. deferred status with past deferred_until exits 0 with warning', () => {
    const r = runLinter(['--file', fixture('deferred-past.md')]);
    assert.equal(
      r.status, 0,
      `Expected exit 0 (warning only); got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('WARNING'),
      `Expected "WARNING" in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('deferred_until'),
      `Expected mention of deferred_until; got:\n${r.stdout}`
    );
  });

  // 7. status: applied entry missing **Disposition:** → exit 1
  it('7. applied entry missing **Disposition:** exits 1 with error', () => {
    const r = runLinter(['--file', fixture('applied-no-disposition.md')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('Disposition'),
      `Expected mention of "Disposition" in error; got:\n${r.stdout}`
    );
  });

  // 8. ID gap (LRN-001 then LRN-003) → exit 0 with WARNING
  it('8. ID gap in sequence exits 0 with gap warning', () => {
    const r = runLinter(['--file', fixture('id-gap.md')]);
    assert.equal(
      r.status, 0,
      `Expected exit 0 (warning only); got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('WARNING') || r.stdout.includes('gap'),
      `Expected warning about ID gap; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('LRN-002'),
      `Expected warning to mention LRN-002; got:\n${r.stdout}`
    );
  });

  // 9. Multiple errors aggregated in one run → exit 1, all errors printed
  it('9. multiple errors exit 1 and all errors are printed', () => {
    const r = runLinter(['--file', fixture('multiple-errors.md')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`
    );
    // Expect at least 2 ERROR lines in output
    const errorCount = (r.stdout.match(/^ERROR:/gm) ?? []).length;
    assert.ok(
      errorCount >= 2,
      `Expected ≥2 ERROR lines; got ${errorCount}:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('LRN-001'),
      `Expected LRN-001 error; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('LRN-002'),
      `Expected LRN-002 error; got:\n${r.stdout}`
    );
  });

  // 10. Real-file regression: actual LEARNINGS.md → exit 0
  it('10. real LEARNINGS.md passes linter (exit 0)', () => {
    const r = runLinter();
    assert.equal(
      r.status, 0,
      `Expected exit 0 against real LEARNINGS.md; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('✅'),
      `Expected success indicator; got:\n${r.stdout}`
    );
  });

  // 11. --quiet flag suppresses per-finding output but prints summary
  it('11. --quiet suppresses per-finding lines but still prints summary', () => {
    // Use a fixture that has warnings (old open date)
    const r = runLinter(['--file', fixture('open-old-date.md'), '--quiet']);
    assert.equal(
      r.status, 0,
      `Expected exit 0; got ${r.status}`
    );
    // No WARNING lines (suppressed by --quiet)
    assert.ok(
      !r.stdout.includes('WARNING:'),
      `Expected no WARNING lines with --quiet; got:\n${r.stdout}`
    );
    // But summary is still present
    assert.ok(
      r.stdout.includes('check-learnings summary'),
      `Expected summary even with --quiet; got:\n${r.stdout}`
    );
  });

  // 12. --file flag overrides the default LEARNINGS.md path
  it('12. --file flag selects alternate file to lint', () => {
    const r = runLinter(['--file', fixture('valid.md')]);
    assert.equal(r.status, 0, `Expected exit 0 for valid.md; got ${r.status}`);
    // Verify it's actually linting the fixture (1 entry) not the real file (31+)
    assert.ok(
      r.stdout.includes('Entries checked: 1'),
      `Expected "Entries checked: 1" for single-entry fixture; got:\n${r.stdout}`
    );
  });

  // 13. B2 — malformed YAML with id: LRN- exits 1 with parse error message
  it('13. malformed YAML block with LRN id exits 1 with YAML parse error', () => {
    const r = runLinter(['--file', fixture('malformed-yaml.md')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('YAML parse error'),
      `Expected "YAML parse error" in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('LRN-002'),
      `Expected LRN-002 mentioned in parse error; got:\n${r.stdout}`
    );
  });

  // 14. B3 — fence lines with trailing whitespace are accepted
  it('14. fence lines with trailing whitespace exit 0', () => {
    const r = runLinter(['--file', fixture('fence-trailing-ws.md')]);
    assert.equal(
      r.status, 0,
      `Expected exit 0 for trailing-whitespace fences; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('Entries checked: 1'),
      `Expected 1 entry; got:\n${r.stdout}`
    );
  });

  // 15. B4 — entry body containing a non-entry yaml fence does not confuse disposition check
  it('15. entry body with embedded yaml fence does not cause false disposition error', () => {
    const r = runLinter(['--file', fixture('entry-with-yaml-example.md')]);
    assert.equal(
      r.status, 0,
      `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      !r.stdout.includes('Disposition'),
      `Expected no Disposition error; got:\n${r.stdout}`
    );
  });

  // 16. B5 — entry exists for status but heading is absent → exit 1
  it('16. missing ## heading when entries exist exits 1 with error', () => {
    const r = runLinter(['--file', fixture('missing-heading-with-entries.md')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected "ERROR" in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('Applied'),
      `Expected mention of "Applied" heading; got:\n${r.stdout}`
    );
  });

  // 17. NB-9 — duplicate ID exits 1 with error
  it('17. duplicate LRN ID exits 1 with duplicate error', () => {
    const r = runLinter(['--file', fixture('duplicate-id.md')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('Duplicate'),
      `Expected "Duplicate" in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('LRN-001'),
      `Expected LRN-001 mentioned; got:\n${r.stdout}`
    );
  });
});
