/**
 * tests/check-instructions.test.mjs — Tests for scripts/check-instructions.mjs
 *
 * Uses node:test (consistent with existing test files).
 * Spawns the linter via spawnSync (same pattern as tests/check-learnings.test.mjs).
 * Fixture files live in tests/fixtures/cs06/instructions/.
 *
 * Run: node --test tests/check-instructions.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const LINTER = path.join(REPO_ROOT, 'scripts', 'check-instructions.mjs');
const FIXTURES = path.join(__dirname, 'fixtures', 'cs06', 'instructions');
const CS15D_FIXTURES = path.join(__dirname, 'fixtures', 'cs15d', 'check-instructions');
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
 * Return the absolute path to a fixture file.
 *
 * @param {string} name
 * @returns {string}
 */
function fixture(name) {
  return path.join(FIXTURES, name);
}

function cs15dFixture(...parts) {
  return path.join(CS15D_FIXTURES, ...parts);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('check-instructions linter', () => {
  // 1. Valid INSTRUCTIONS fixture → exit 0
  it('1. valid fixture exits 0', () => {
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

  // 2. Missing required heading → exit 1
  it('2. missing required heading exits 1 with error', () => {
    const r = runLinter(['--file', fixture('missing-heading.md')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected "ERROR" in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('Per-CS Loop'),
      `Expected mention of missing heading "Per-CS Loop"; got:\n${r.stdout}`
    );
  });

  // 3. Broken in-doc anchor link → exit 1
  it('3. broken anchor link exits 1 with error', () => {
    const r = runLinter(['--file', fixture('broken-anchor.md')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected "ERROR" in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('this-heading-does-not-exist'),
      `Expected broken anchor name in error; got:\n${r.stdout}`
    );
  });

  // 4. Empty section (heading with no body) → exit 0 with warning
  it('4. empty section exits 0 with warning', () => {
    const r = runLinter(['--file', fixture('empty-section.md')]);
    assert.equal(
      r.status, 0,
      `Expected exit 0 (warning only); got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('WARNING'),
      `Expected "WARNING" in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('Quick Reference Checklist'),
      `Expected warning to mention the empty heading; got:\n${r.stdout}`
    );
  });

  // 5. Real-file regression against REPO_ROOT/INSTRUCTIONS.md → exit 0
  it('5. real INSTRUCTIONS.md passes linter (exit 0)', () => {
    const realFile = path.join(REPO_ROOT, 'INSTRUCTIONS.md');
    const r = runLinter(['--file', realFile]);
    assert.equal(
      r.status, 0,
      `Expected exit 0 against real INSTRUCTIONS.md; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('✅'),
      `Expected success indicator; got:\n${r.stdout}`
    );
  });

  // 6. Missing --file flag → exit 2
  it('6. missing --file flag exits 2', () => {
    const r = runLinter([]);
    assert.equal(
      r.status, 2,
      `Expected exit 2 for missing --file; got ${r.status}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stderr.includes('--file'),
      `Expected "--file" mentioned in stderr; got:\n${r.stderr}`
    );
  });

  // 7. --quiet suppresses per-finding output but prints summary
  it('7. --quiet flag suppresses per-finding lines but prints summary', () => {
    const r = runLinter(['--file', fixture('empty-section.md'), '--quiet']);
    assert.equal(
      r.status, 0,
      `Expected exit 0; got ${r.status}`
    );
    assert.ok(
      !r.stdout.includes('WARNING:'),
      `Expected no WARNING lines with --quiet; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('errors') && r.stdout.includes('warnings'),
      `Expected summary with errors/warnings counts even with --quiet; got:\n${r.stdout}`
    );
  });

  // 8. Valid in-doc anchor that resolves correctly → exit 0 (no error for valid anchor)
  it('8. valid in-doc anchor resolves without error', () => {
    const r = runLinter(['--file', fixture('broken-anchor.md')]);
    // The valid anchor #per-cs-loop should NOT appear as an error
    const errorLines = r.stdout.split('\n').filter((l) => l.startsWith('ERROR:'));
    const validAnchorErrors = errorLines.filter((l) => l.includes('per-cs-loop'));
    assert.equal(
      validAnchorErrors.length, 0,
      `Expected no errors for valid anchor #per-cs-loop; got:\n${validAnchorErrors.join('\n')}`
    );
  });

  it('9. valid LRN anchor and ADR reference exits 0', () => {
    const r = runLinter(['--file', cs15dFixture('valid', 'INSTRUCTIONS.md')]);
    assert.equal(
      r.status, 0,
      `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
  });

  it('10. dead LRN anchor exits non-zero with expected stderr', () => {
    const r = runLinter(['--file', cs15dFixture('dead-lrn', 'INSTRUCTIONS.md')]);
    assert.notEqual(
      r.status, 0,
      `Expected non-zero exit for dead LRN anchor\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stderr.includes('INSTRUCTIONS.md: dead LRN anchor "LEARNINGS.md#lrn-999" (no matching heading in LEARNINGS.md)'),
      `Expected dead LRN message in stderr; got:\n${r.stderr}`
    );
  });

  it('11. dead ADR file reference exits non-zero with expected stderr', () => {
    const r = runLinter(['--file', cs15dFixture('dead-adr', 'INSTRUCTIONS.md')]);
    assert.notEqual(
      r.status, 0,
      `Expected non-zero exit for dead ADR reference\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stderr.includes('INSTRUCTIONS.md: dead ADR reference "docs/adr/9999-nonexistent.md" (file does not exist at '),
      `Expected dead ADR message in stderr; got:\n${r.stderr}`
    );
  });

  it('12. ADR anchors are out of scope when the ADR file exists', () => {
    const r = runLinter(['--file', cs15dFixture('adr-anchor-out-of-scope', 'INSTRUCTIONS.md')]);
    assert.equal(
      r.status, 0,
      `Expected exit 0 because ADR anchors are out of scope; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
  });
});
