/**
 * tests/check-clickstop.test.mjs — Tests for scripts/check-clickstop.mjs
 *
 * Uses node:test (consistent with existing test files).
 * Spawns the linter via spawnSync (same pattern as check-learnings.test.mjs).
 * Fixture trees live under tests/fixtures/cs06/clickstop/.
 *
 * Run: node --test tests/check-clickstop.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const LINTER = path.join(REPO_ROOT, 'scripts', 'check-clickstop.mjs');
const FIXTURES = path.join(__dirname, 'fixtures', 'cs06', 'clickstop');
const FIXTURES_CS03B = path.join(__dirname, 'fixtures', 'cs03b', 'clickstop');
const NODE = process.execPath;

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Run the linter with given args. Returns { stdout, stderr, status }.
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
 * Return the path to a fixture subdirectory.
 *
 * @param {string} name
 * @returns {string}
 */
function fixtureDir(name) {
  return path.join(FIXTURES, name);
}

/**
 * Return the path to a cs03b fixture subdirectory.
 *
 * @param {string} name
 * @returns {string}
 */
function fixtureDirCs03b(name) {
  return path.join(FIXTURES_CS03B, name);
}

/**
 * Create a generated single-file done/ clickstop fixture for gate tests.
 *
 * @param {string} name
 * @param {string} gateSection
 * @returns {string}
 */
function writeGeneratedDoneFixture(name, gateSection) {
  // CS25 follow-up race fix: must NOT write fixtures under REPO_ROOT — concurrent
  // tests have the text-encoding linter walking REPO_ROOT recursively and
  // transient .test-output creation triggers ENOENT (LRN-094 anti-pattern).
  const root = path.join(os.tmpdir(), 'check-clickstop-test-output', name);
  const doneDir = path.join(root, 'done');
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(doneDir, { recursive: true });
  fs.writeFileSync(
    path.join(doneDir, 'done_cs99_generated-gate.md'),
    [
      '# Generated gate fixture',
      '',
      '**Status:** done',
      '**Owner:** test',
      '**Branch:** test',
      '**Started:** 2026-05-09',
      '**Closed:** 2026-05-09',
      '**Depends on:** —',
      '',
      gateSection,
      '',
    ].join('\n'),
    'utf8'
  );
  return root;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('check-clickstop linter', () => {

  // 1. Valid tree (3 files, one per state) → exit 0
  it('1. valid tree exits 0 with success indicator', () => {
    const r = runLinter(['--dir', fixtureDir('valid')]);
    assert.equal(
      r.status, 0,
      `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('✅'),
      `Expected ✅ in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('3 files checked'),
      `Expected "3 files checked" in summary; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('0 errors'),
      `Expected "0 errors" in summary; got:\n${r.stdout}`
    );
  });

  // 2. active/ file missing **Status:** field → exit 1
  it('2. active file missing **Status:** field exits 1', () => {
    const r = runLinter(['--dir', fixtureDir('missing-field')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected ERROR in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('Status'),
      `Expected mention of "Status" in error; got:\n${r.stdout}`
    );
  });

  // 3. active/ file has **Status:** done (mismatched lifecycle) → exit 1
  it('3. active file with Status:done (lifecycle mismatch) exits 1', () => {
    const r = runLinter(['--dir', fixtureDir('mismatched')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected ERROR in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.toLowerCase().includes('active') && r.stdout.toLowerCase().includes('done'),
      `Expected mention of both "active" and "done" in error; got:\n${r.stdout}`
    );
  });

  // 4. Filename violates convention (active/random_name.md) → exit 1
  it('4. non-conforming filename exits 1', () => {
    const r = runLinter(['--dir', fixtureDir('bad-filename')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected ERROR in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('filename') || r.stdout.includes('convention'),
      `Expected mention of "filename" or "convention" in error; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('random_name.md'),
      `Expected "random_name.md" mentioned in error; got:\n${r.stdout}`
    );
  });

  // 5. Real-tree regression: project/clickstops — done/ and planned/ must be clean.
  // Note: active_cs03b_upgrade-templating-lock-stubs.md is orchestrator-owned and
  // receives the gate section at close-out, so the active/ directory may have one
  // expected gate error during the CS03b window.
  it('5. real project/clickstops tree: done+planned fully retrofitted (no done/planned errors)', () => {
    const r = runLinter(['--dir', path.join(REPO_ROOT, 'project', 'clickstops')]);
    const errorLines = r.stdout.split('\n').filter(l => l.startsWith('ERROR:'));
    const doneOrPlannedErrors = errorLines.filter(
      l => l.includes('done/') || l.includes('planned/')
    );
    assert.equal(
      doneOrPlannedErrors.length, 0,
      `Expected no done/ or planned/ errors; got:\n${doneOrPlannedErrors.join('\n')}\nfull stdout:\n${r.stdout}`
    );
  });

  // 6. Missing --dir → exit 2
  it('6. missing --dir exits 2', () => {
    const r = runLinter([]);
    assert.equal(
      r.status, 2,
      `Expected exit 2 for missing --dir; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stderr.includes('--dir'),
      `Expected mention of "--dir" in stderr; got:\n${r.stderr}`
    );
  });

  // 7. --quiet flag suppresses per-finding output but still prints summary
  it('7. --quiet suppresses finding output but prints summary', () => {
    const r = runLinter(['--dir', fixtureDir('missing-field'), '--quiet']);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`
    );
    // With --quiet, individual ERROR lines should not appear
    assert.ok(
      !r.stdout.includes('ERROR:'),
      `Expected no "ERROR:" lines with --quiet; got:\n${r.stdout}`
    );
    // But summary must still appear
    assert.ok(
      r.stdout.includes('clickstops:'),
      `Expected summary line with --quiet; got:\n${r.stdout}`
    );
  });

  // 8. --help exits 0 and prints usage
  it('8. --help exits 0 with usage text', () => {
    const r = runLinter(['--help']);
    assert.equal(
      r.status, 0,
      `Expected exit 0 for --help; got ${r.status}\nstdout: ${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('--dir'),
      `Expected "--dir" in help output; got:\n${r.stdout}`
    );
  });

  // 9. unknown flag exits 2
  it('9. unknown flag exits 2', () => {
    const r = runLinter(['--dir', fixtureDir('valid'), '--unknown-flag']);
    assert.equal(
      r.status, 2,
      `Expected exit 2 for unknown flag; got ${r.status}\nstdout: ${r.stdout}`
    );
  });

  // -------------------------------------------------------------------------
  // CS03b gate tests
  // -------------------------------------------------------------------------

  // 10. active/ file missing gate H2 → exit 1
  it('10. active file missing gate H2 exits 1 with gate error', () => {
    const r = runLinter(['--dir', fixtureDirCs03b('gate-active-missing')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected ERROR in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('Plan-vs-implementation review') && r.stdout.includes('CS03b gate'),
      `Expected gate error message; got:\n${r.stdout}`
    );
  });

  // 11. done/ file missing gate H2 → exit 1
  it('11. done file missing gate H2 exits 1', () => {
    const r = runLinter(['--dir', fixtureDirCs03b('gate-done-missing')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('missing required H2 section'),
      `Expected missing-H2 error; got:\n${r.stdout}`
    );
  });

  // 12. done/ file with gate H2 but empty body → exit 1
  it('12. done file with empty gate body exits 1', () => {
    const r = runLinter(['--dir', fixtureDirCs03b('gate-done-empty')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('Reviewer/Date/Outcome') || r.stdout.includes('grandfathering'),
      `Expected body-content error; got:\n${r.stdout}`
    );
  });

  // 13. done/ file with grandfathering line → exit 0
  it('13. done file with grandfathering line exits 0', () => {
    const r = runLinter(['--dir', fixtureDirCs03b('gate-done-grandfathered')]);
    assert.equal(
      r.status, 0,
      `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(r.stdout.includes('✅'), `Expected ✅; got:\n${r.stdout}`);
  });

  // 14. done/ file with Reviewer/Date/Outcome fields → exit 0
  it('14. done file with Reviewer/Date/Outcome fields exits 0', () => {
    const r = runLinter(['--dir', fixtureDirCs03b('gate-done-populated')]);
    assert.equal(
      r.status, 0,
      `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(r.stdout.includes('✅'), `Expected ✅; got:\n${r.stdout}`);
  });

  // 15. active/ file with gate H2 placeholder → exit 0
  it('15. active file with gate H2 placeholder exits 0', () => {
    const r = runLinter(['--dir', fixtureDirCs03b('gate-active-present')]);
    assert.equal(
      r.status, 0,
      `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(r.stdout.includes('✅'), `Expected ✅; got:\n${r.stdout}`);
  });

  // 16. done/ file after close-out task enforcement missing task rows → exit 1
  it('16. done file missing close-out task rows exits 1', () => {
    const r = runLinter(['--dir', fixtureDirCs03b('closeout-tasks-missing')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('close-out docs/restart-state task') &&
      r.stdout.includes('close-out learnings/follow-up task'),
      `Expected close-out task errors; got:\n${r.stdout}`
    );
  });

  // 17. done/ file after close-out task enforcement with task rows → exit 0
  it('17. done file with close-out task rows exits 0', () => {
    const r = runLinter(['--dir', fixtureDirCs03b('closeout-tasks-present')]);
    assert.equal(
      r.status, 0,
      `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(r.stdout.includes('✅'), `Expected ✅; got:\n${r.stdout}`);
  });

  // 18. done/ file with only H1-subsection gate fields → exit 1
  it('18. done file with Reviewer/Date/Outcome only under H1 subsection exits 1', () => {
    const root = writeGeneratedDoneFixture(
      'gate-fields-under-h1',
      [
        '## Plan-vs-implementation review',
        '',
        '# Nested review record',
        '',
        '**Reviewer:** GPT-5.5',
        '**Date:** 2026-05-09',
        '**Outcome:** GO',
      ].join('\n')
    );
    try {
      const r = runLinter(['--dir', root]);
      assert.equal(
        r.status, 1,
        `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
      );
      assert.ok(
        r.stdout.includes('Reviewer/Date/Outcome') || r.stdout.includes('grandfathering'),
        `Expected gate body-content error; got:\n${r.stdout}`
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // 19. done/ file with top-level gate fields before H3 subsection → exit 0
  it('19. done file with Reviewer/Date/Outcome before H3 subsection exits 0', () => {
    const root = writeGeneratedDoneFixture(
      'gate-fields-before-h3',
      [
        '## Plan-vs-implementation review',
        '',
        '**Reviewer:** GPT-5.5',
        '**Date:** 2026-05-09',
        '**Outcome:** GO',
        '',
        '### Supporting detail',
        '',
        'Details below the required fields should not prevent satisfaction.',
      ].join('\n')
    );
    try {
      const r = runLinter(['--dir', root]);
      assert.equal(
        r.status, 0,
        `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
      );
      assert.ok(r.stdout.includes('✅'), `Expected ✅; got:\n${r.stdout}`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

});
