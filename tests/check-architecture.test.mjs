/**
 * tests/check-architecture.test.mjs — Tests for scripts/check-architecture.mjs
 *
 * Uses node:test (consistent with existing test files).
 * Spawns the linter via spawnSync (same pattern as tests/check-learnings.test.mjs).
 * Fixture files live in tests/fixtures/cs06/architecture/.
 *
 * Run: node --test tests/check-architecture.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const LINTER = path.join(REPO_ROOT, 'scripts', 'check-architecture.mjs');
const FIXTURES = path.join(__dirname, 'fixtures', 'cs06', 'architecture');
const NODE = process.execPath;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run the linter with the given args. Returns { stdout, stderr, status }.
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

describe('check-architecture linter', () => {
  // 1. Valid fixture (all required headings, no broken links) → exit 0
  it('1. valid fixture exits 0', () => {
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

  // 2. Missing required heading → exit 1
  it('2. missing required heading exits 1 with error', () => {
    const r = runLinter(['--file', fixture('missing-heading.md')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected "ERROR" in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('Data model'),
      `Expected error mentioning missing heading "Data model"; got:\n${r.stdout}`
    );
  });

  // 3. Broken internal link → exit 1
  it('3. broken internal link exits 1 with error', () => {
    const r = runLinter(['--file', fixture('broken-link.md')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected "ERROR" in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('does-not-exist.md'),
      `Expected error mentioning broken link; got:\n${r.stdout}`
    );
  });

  // 4. Real-file regression: actual ARCHITECTURE.md → exit 0
  it('4. real ARCHITECTURE.md exits 0', () => {
    const realFile = path.join(REPO_ROOT, 'ARCHITECTURE.md');
    const r = runLinter(['--file', realFile]);
    assert.equal(
      r.status, 0,
      `Expected exit 0 on real ARCHITECTURE.md; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('0 errors'),
      `Expected "0 errors" in output; got:\n${r.stdout}`
    );
  });

  // 5. Missing --file → exit 2
  it('5. missing --file exits 2', () => {
    const r = runLinter([]);
    assert.equal(
      r.status, 2,
      `Expected exit 2 when --file is missing; got ${r.status}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stderr.includes('--file'),
      `Expected "--file" mentioned in stderr; got:\n${r.stderr}`
    );
  });

  // 6. --quiet suppresses per-finding output
  it('6. --quiet suppresses per-finding output', () => {
    const r = runLinter(['--file', fixture('missing-heading.md'), '--quiet']);
    assert.equal(
      r.status, 1,
      `Expected exit 1 (errors present); got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      !r.stdout.includes('ERROR:'),
      `Expected no "ERROR:" lines when --quiet; got:\n${r.stdout}`
    );
    // Summary line should still be present
    assert.ok(
      r.stdout.includes('error'),
      `Expected summary line with "error" in output; got:\n${r.stdout}`
    );
  });

  // CS30 / D5: when a required heading is missing, the error message lists the
  // FULL required-heading set + points at the canonical seed file. SI's CS01
  // sub-agent A4 ran into Finding #5 by hand-authoring ARCHITECTURE.md from
  // OPERATIONS prose alone and missing `## Data model`. The improved error
  // tells the next user where to find the answer without reading source.
  it('7. (CS30/D5) missing-heading error lists FULL required-heading set + seed-file path', () => {
    const r = runLinter(['--file', fixture('missing-heading.md')]);
    assert.equal(r.status, 1, `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`);
    // All four required headings must be listed in the augmented error.
    for (const heading of ['Overview', 'Components', 'Data model', 'Decision log']) {
      assert.ok(
        r.stdout.includes(`"## ${heading}"`),
        `Expected required heading "## ${heading}" in error message; got:\n${r.stdout}`,
      );
    }
    // Canonical seed file path is mentioned so consumers know where to copy from.
    assert.ok(
      r.stdout.includes('template/seeded/ARCHITECTURE.md'),
      `Expected seed-file path "template/seeded/ARCHITECTURE.md" in error message; got:\n${r.stdout}`,
    );
    // The `harness lint --explain architecture` hint is mentioned.
    assert.ok(
      r.stdout.includes('--explain architecture'),
      `Expected "--explain architecture" hint in error message; got:\n${r.stdout}`,
    );
  });
});
