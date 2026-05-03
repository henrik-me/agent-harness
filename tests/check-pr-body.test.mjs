/**
 * tests/check-pr-body.test.mjs — Tests for scripts/check-pr-body.mjs
 *
 * Uses node:test (consistent with existing test files).
 * Spawns the linter via spawnSync (same pattern as tests/check-context.test.mjs).
 * Fixture files live in tests/fixtures/cs07/pr-body/.
 *
 * Run: node --test tests/check-pr-body.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const LINTER = path.join(REPO_ROOT, 'scripts', 'check-pr-body.mjs');
const FIXTURES = path.join(__dirname, 'fixtures', 'cs07', 'pr-body');
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
 * Return the absolute path to a fixture file under tests/fixtures/cs07/pr-body/.
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

describe('check-pr-body linter', () => {
  // 1. Valid PR body with all 3 required sections, no placeholders → exit 0
  it('1. valid PR body with all required sections exits 0', () => {
    const r = runLinter(['--file', fixture('valid.md')]);
    assert.equal(
      r.status, 0,
      `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('✅'),
      `Expected success indicator in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('PR body: 0 errors'),
      `Expected "PR body: 0 errors" in output; got:\n${r.stdout}`
    );
  });

  // 2. Missing one required section → exit 1
  it('2. missing one required section exits 1 with error', () => {
    const r = runLinter(['--file', fixture('missing-section.md')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected "ERROR" in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('Testing'),
      `Expected mention of missing "Testing" section; got:\n${r.stdout}`
    );
  });

  // 3. Placeholder text TODO: left in body → exit 1
  it('3. placeholder text TODO: in body exits 1 with error', () => {
    const r = runLinter(['--file', fixture('placeholder.md')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected "ERROR" in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.toLowerCase().includes('placeholder'),
      `Expected mention of placeholder issue; got:\n${r.stdout}`
    );
  });

  // 4. Custom --required summary,changes (case-insensitive) works → exit 0
  it('4. custom --required with sections present exits 0', () => {
    const r = runLinter(['--file', fixture('custom-sections.md'), '--required', 'summary,changes']);
    assert.equal(
      r.status, 0,
      `Expected exit 0 with custom sections; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('✅'),
      `Expected success indicator; got:\n${r.stdout}`
    );
  });

  // 5. --min-words 10 against a section with ~2 words → exit 1
  it('5. --min-words threshold not met exits 1', () => {
    const r = runLinter(['--file', fixture('low-word-count.md'), '--min-words', '10']);
    assert.equal(
      r.status, 1,
      `Expected exit 1 for under-threshold sections; got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected "ERROR" in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('minimum'),
      `Expected mention of minimum word count; got:\n${r.stdout}`
    );
  });

  // 6. Missing --file → exit 2
  it('6. missing --file exits 2 with usage error', () => {
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

  // 7. --file --quiet (flag-as-value) → exit 2 (LRN-040)
  it('7. --file followed by flag value exits 2 (LRN-040 requireValue guard)', () => {
    const r = runLinter(['--file', '--quiet']);
    assert.equal(
      r.status, 2,
      `Expected exit 2 for flag-as-value; got ${r.status}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stderr.includes('missing value') || r.stderr.includes('--file'),
      `Expected error about missing value for --file; got:\n${r.stderr}`
    );
  });

  // 8. --quiet suppresses per-finding output but prints summary
  it('8. --quiet suppresses per-finding lines but still prints summary', () => {
    const r = runLinter([
      '--file', fixture('missing-section.md'),
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
      r.stdout.includes('PR body:'),
      `Expected summary line even with --quiet; got:\n${r.stdout}`
    );
  });
});
