/**
 * tests/check-readme.test.mjs — Tests for scripts/check-readme.mjs
 *
 * Uses node:test (consistent with existing test files).
 * Spawns the linter via spawnSync (same pattern as tests/check-learnings.test.mjs).
 * Fixture files live in tests/fixtures/cs06/readme/.
 *
 * Run: node --test tests/check-readme.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const LINTER = path.join(REPO_ROOT, 'scripts', 'check-readme.mjs');
const FIXTURES = path.join(__dirname, 'fixtures', 'cs06', 'readme');
const NODE = process.execPath;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run the linter with the given extra args.
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
 * Return the absolute path to a fixture file under tests/fixtures/cs06/readme/.
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

describe('check-readme linter', () => {
  // 1. Valid README fixture → exit 0
  it('1. valid README fixture exits 0', () => {
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

  // 2. Missing H1 → exit 1
  it('2. missing H1 exits 1 with error', () => {
    const r = runLinter(['--file', fixture('missing-h1.md')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected "ERROR" in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.toLowerCase().includes('h1') || r.stdout.toLowerCase().includes('heading'),
      `Expected mention of H1/heading in error; got:\n${r.stdout}`
    );
  });

  // 3. Missing all required H2s → exit 1
  it('3. missing all required H2 sections exits 1 with errors', () => {
    const r = runLinter(['--file', fixture('missing-h2s.md')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`
    );
    const errorCount = (r.stdout.match(/^ERROR:/gm) ?? []).length;
    assert.ok(
      errorCount >= 2,
      `Expected ≥2 ERROR lines; got ${errorCount}:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.toLowerCase().includes('quickstart') || r.stdout.toLowerCase().includes('getting started'),
      `Expected mention of missing Quickstart/Getting started; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.toLowerCase().includes('license') || r.stdout.toLowerCase().includes('mit'),
      `Expected mention of missing License/MIT; got:\n${r.stdout}`
    );
  });

  // 4. Real-file regression against <REPO_ROOT>/README.md → exit 0
  it('4. real README.md passes with exit 0', () => {
    const realReadme = path.join(REPO_ROOT, 'README.md');
    const r = runLinter(['--file', realReadme]);
    assert.equal(
      r.status, 0,
      `Expected exit 0 for real README.md; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('0 errors'),
      `Expected "0 errors" for real README.md; got:\n${r.stdout}`
    );
  });

  // 5. Missing --file argument → exit 2
  it('5. missing --file flag exits 2', () => {
    const r = runLinter([]);
    assert.equal(
      r.status, 2,
      `Expected exit 2 (usage error); got ${r.status}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stderr.includes('--file') || r.stderr.includes('required'),
      `Expected stderr to mention --file or required; got:\n${r.stderr}`
    );
  });

  // 6. No status badges in first 30 lines → exit 0 with warning
  it('6. missing badges exits 0 with a warning', () => {
    const r = runLinter(['--file', fixture('no-badges.md')]);
    assert.equal(
      r.status, 0,
      `Expected exit 0 (warning only); got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('WARNING'),
      `Expected "WARNING" in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.toLowerCase().includes('badge') || r.stdout.toLowerCase().includes('shield'),
      `Expected mention of badge/shield in warning; got:\n${r.stdout}`
    );
  });

  // 7. --quiet flag suppresses per-finding lines but still prints summary
  it('7. --quiet flag suppresses findings but shows summary', () => {
    const r = runLinter(['--file', fixture('missing-h1.md'), '--quiet']);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}`
    );
    assert.ok(
      !r.stdout.includes('ERROR:'),
      `Expected no "ERROR:" lines with --quiet; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('error'),
      `Expected summary line with "error" count; got:\n${r.stdout}`
    );
  });

  // 8. --help flag exits 0 and prints usage
  it('8. --help flag exits 0 and prints usage', () => {
    const r = runLinter(['--help']);
    assert.equal(
      r.status, 0,
      `Expected exit 0 for --help; got ${r.status}`
    );
    assert.ok(
      r.stdout.includes('--file') && r.stdout.includes('Usage'),
      `Expected usage text; got:\n${r.stdout}`
    );
  });
});
