/**
 * tests/check-commit-trailers.test.mjs — Tests for scripts/check-commit-trailers.mjs
 *
 * Uses node:test (consistent with existing test files).
 * Spawns the linter via spawnSync (same pattern as check-context.test.mjs).
 * Fixture files live in tests/fixtures/cs07/commit-trailers/.
 *
 * Run: node --test tests/check-commit-trailers.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const LINTER = path.join(REPO_ROOT, 'scripts', 'check-commit-trailers.mjs');
const FIXTURES = path.join(__dirname, 'fixtures', 'cs07', 'commit-trailers');
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('check-commit-trailers linter', () => {
  // 1. Valid commit with Co-authored-by → exit 0
  it('1. valid commit message with Co-authored-by exits 0', () => {
    const r = runLinter(['--file', fixture('valid-single-trailer.txt')]);
    assert.equal(
      r.status, 0,
      `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('✅'),
      `Expected success indicator in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('commit trailers: 0 errors'),
      `Expected "commit trailers: 0 errors"; got:\n${r.stdout}`
    );
  });

  // 2. Missing Co-authored-by → exit 1
  it('2. missing Co-authored-by exits 1', () => {
    const r = runLinter(['--file', fixture('missing-co-authored-by.txt')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected ERROR in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('Co-authored-by'),
      `Expected "Co-authored-by" mentioned in error; got:\n${r.stdout}`
    );
  });

  // 3. Custom --required Signed-off-by, trailer absent → exit 1
  it('3. custom --required Signed-off-by exits 1 when absent', () => {
    const r = runLinter([
      '--file', fixture('missing-signed-off-by.txt'),
      '--required', 'Signed-off-by',
    ]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('Signed-off-by'),
      `Expected "Signed-off-by" in error; got:\n${r.stdout}`
    );
  });

  // 4. --allow Co-authored-by pattern rejects non-matching value → exit 1
  it('4. --allow pattern rejects non-matching Co-authored-by value', () => {
    const r = runLinter([
      '--file', fixture('allow-pattern-nonmatch.txt'),
      '--allow', 'Co-authored-by=^Bot <bot@.+>$',
    ]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected ERROR in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('Co-authored-by'),
      `Expected "Co-authored-by" in error; got:\n${r.stdout}`
    );
  });

  // 5. Multiple trailers all valid → exit 0
  it('5. multiple valid trailers all pass exits 0', () => {
    const r = runLinter([
      '--file', fixture('valid-multiple-trailers.txt'),
      '--required', 'Co-authored-by,Signed-off-by',
    ]);
    assert.equal(
      r.status, 0,
      `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('✅'),
      `Expected success indicator; got:\n${r.stdout}`
    );
  });

  // 6. Empty file → exit 0
  it('6. empty file exits 0', () => {
    const r = runLinter(['--file', fixture('empty.txt')]);
    assert.equal(
      r.status, 0,
      `Expected exit 0 for empty file; got ${r.status}\nstdout: ${r.stdout}`
    );
  });

  // 7. Missing --file arg → exit 2
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

  // 8. --file --quiet (value is another flag) → exit 2 (LRN-040)
  it('8. --file --quiet (value is a flag) exits 2', () => {
    const r = runLinter(['--file', '--quiet']);
    assert.equal(
      r.status, 2,
      `Expected exit 2 when --file value is a flag; got ${r.status}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stderr.includes('--file'),
      `Expected --file mentioned in error; got:\n${r.stderr}`
    );
  });

  // 9. --allow pattern that DOES match → exit 0
  it('9. --allow pattern matching value exits 0', () => {
    const r = runLinter([
      '--file', fixture('valid-single-trailer.txt'),
      '--allow', 'Co-authored-by=^.+ <.+@.+>$',
    ]);
    assert.equal(
      r.status, 0,
      `Expected exit 0 when pattern matches; got ${r.status}\nstdout: ${r.stdout}`
    );
  });

  // 10. --quiet suppresses per-finding lines but still prints summary
  it('10. --quiet suppresses per-finding lines but still prints summary', () => {
    const r = runLinter([
      '--file', fixture('missing-co-authored-by.txt'),
      '--quiet',
    ]);
    assert.equal(
      r.status, 1,
      `Expected exit 1 (errors present); got ${r.status}`
    );
    assert.ok(
      !r.stdout.includes('ERROR:'),
      `Expected no ERROR: lines with --quiet; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('commit trailers:'),
      `Expected summary line with --quiet; got:\n${r.stdout}`
    );
  });

  // 11. Unknown flag → exit 2
  it('11. unknown flag exits 2', () => {
    const r = runLinter(['--file', fixture('valid-single-trailer.txt'), '--unknown-flag']);
    assert.equal(
      r.status, 2,
      `Expected exit 2 for unknown flag; got ${r.status}`
    );
    assert.ok(
      r.stderr.includes('unknown flag'),
      `Expected "unknown flag" in stderr; got:\n${r.stderr}`
    );
  });

  // -------------------------------------------------------------------------
  // CS97 (#420) — git comment / scissors lines stripped before trailer scan
  // -------------------------------------------------------------------------

  // 12. #420 repro: trailer followed by a `# Conflicts:` comment block → exit 0
  it('12. trailer followed by # Conflicts: comments exits 0 (#420 repro)', () => {
    const r = runLinter(['--file', fixture('trailer-then-conflicts-comments.txt')]);
    assert.equal(
      r.status, 0,
      `Expected exit 0 when trailer precedes # Conflicts: comments; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('commit trailers: 0 errors'),
      `Expected "commit trailers: 0 errors"; got:\n${r.stdout}`
    );
  });

  // 13. Trailer followed by interactive-rebase status comments → exit 0
  it('13. trailer followed by rebase-status # comments exits 0', () => {
    const r = runLinter(['--file', fixture('trailer-then-rebase-status-comments.txt')]);
    assert.equal(
      r.status, 0,
      `Expected exit 0 when trailer precedes rebase-status comments; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('✅'),
      `Expected success indicator; got:\n${r.stdout}`
    );
  });

  // 14. `git commit --verbose` scissors line + trailing diff → exit 0
  //     (the diff below the >8 cut-line must not be mistaken for body/trailer)
  it('14. scissors cut-line + trailing diff exits 0', () => {
    const r = runLinter(['--file', fixture('trailer-then-scissors-diff.txt')]);
    assert.equal(
      r.status, 0,
      `Expected exit 0 when a diff follows the scissors line; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('commit trailers: 0 errors'),
      `Expected "commit trailers: 0 errors"; got:\n${r.stdout}`
    );
  });

  // 15. Comment-only / scissors-only buffer → exit 0, "0 errors" (C97-4)
  it('15. comment/scissors-only buffer exits 0 with 0 errors', () => {
    const r = runLinter(['--file', fixture('comment-only.txt')]);
    assert.equal(
      r.status, 0,
      `Expected exit 0 for a comment/scissors-only buffer; got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('commit trailers: 0 errors'),
      `Expected "commit trailers: 0 errors"; got:\n${r.stdout}`
    );
  });

  // 16. Genuinely trailer-less message WITH # comments → still exit 1 (no false pass)
  it('16. missing required trailer with # comments still exits 1', () => {
    const r = runLinter(['--file', fixture('missing-trailer-with-comments.txt')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1 when the required trailer is genuinely absent; got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('Co-authored-by'),
      `Expected "Co-authored-by" in error; got:\n${r.stdout}`
    );
  });

  // 17. A `#`-commented-out Co-authored-by line does NOT satisfy the requirement
  //     (body `#` line stripped like git; commented trailer never counts) → exit 1
  it('17. commented-out (#) trailer does not satisfy the requirement (exits 1)', () => {
    const r = runLinter(['--file', fixture('hash-body-line.txt')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1 when the only Co-authored-by is on a # comment line; got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('Co-authored-by'),
      `Expected "Co-authored-by" in error; got:\n${r.stdout}`
    );
  });
});
