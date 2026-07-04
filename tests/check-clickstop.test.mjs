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

/**
 * Create a directory-form CS fixture tree under os.tmpdir() (never REPO_ROOT).
 * Returns the root that should be passed to the linter via --dir.
 *
 * @param {string} name       - unique fixture name (subdir of the scratch root).
 * @param {string} stage      - 'active' | 'done' | 'planned'.
 * @param {string} csDirName  - the CS directory name (e.g. 'done_cs99_x').
 * @param {Array<{name: string, body: string}>} files - files to write inside it.
 * @returns {string} the scratch root (contains the <stage>/ directory).
 */
function writeDirFormFixture(name, stage, csDirName, files) {
  const root = path.join(os.tmpdir(), 'check-clickstop-test-output', name);
  fs.rmSync(root, { recursive: true, force: true });
  const csDir = path.join(root, stage, csDirName);
  fs.mkdirSync(csDir, { recursive: true });
  for (const f of files) {
    fs.writeFileSync(path.join(csDir, f.name), f.body, 'utf8');
  }
  return root;
}

/**
 * Build a valid done-CS plan body (Closed BEFORE the close-out-task and
 * CHANGELOG-touch enforcement dates, so only the core + PVI checks apply).
 *
 * @param {string} title
 * @param {object} [opts]
 * @param {boolean} [opts.pvi=true]         - include the real PVI H2 + fields.
 * @param {boolean} [opts.fencedPvi=false]  - place the PVI H2 inside a ``` fence.
 * @param {boolean} [opts.dependsOn=true]   - include the **Depends on:** field.
 * @returns {string}
 */
function validDoneBody(title, opts = {}) {
  const { pvi = true, fencedPvi = false, dependsOn = true } = opts;
  const lines = [
    `# ${title}`,
    '',
    '**Status:** done',
    '**Owner:** test',
    '**Branch:** test',
    '**Started:** 2026-05-01',
    '**Closed:** 2026-05-01',
  ];
  if (dependsOn) lines.push('**Depends on:** none');
  lines.push('');
  const pviBlock = [
    '## Plan-vs-implementation review',
    '',
    '**Reviewer:** gpt-5.5',
    '**Date:** 2026-05-01',
    '**Outcome:** Go',
  ];
  if (pvi && fencedPvi) {
    lines.push('```', ...pviBlock, '```');
  } else if (pvi) {
    lines.push(...pviBlock);
  }
  lines.push('');
  return lines.join('\n');
}

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

  // -------------------------------------------------------------------------
  // CS75 — directory-form recursion + fence-aware PVI gate
  // -------------------------------------------------------------------------

  // 20. valid directory-form CS is validated and passes
  it('20. valid directory-form CS exits 0', () => {
    const root = writeDirFormFixture('dirform-valid', 'done', 'done_cs99_valid', [
      { name: 'done_cs99_valid.md', body: validDoneBody('CS99') },
    ]);
    try {
      const r = runLinter(['--dir', root]);
      assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}`);
      assert.ok(r.stdout.includes('1 files checked'), `Expected the inner plan file counted; got:\n${r.stdout}`);
      assert.ok(r.stdout.includes('✅'), `Expected ✅; got:\n${r.stdout}`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // 21. directory-form CS missing the PVI H2 → exit 1
  it('21. directory-form CS missing PVI H2 exits 1', () => {
    const root = writeDirFormFixture('dirform-no-pvi', 'done', 'done_cs99_nopvi', [
      { name: 'done_cs99_nopvi.md', body: validDoneBody('CS99', { pvi: false }) },
    ]);
    try {
      const r = runLinter(['--dir', root]);
      assert.equal(r.status, 1, `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`);
      assert.ok(
        r.stdout.includes('missing required H2 section'),
        `Expected missing-H2 error; got:\n${r.stdout}`
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // 22. directory-form CS missing a required field → exit 1
  it('22. directory-form CS missing a required field exits 1', () => {
    const root = writeDirFormFixture('dirform-missing-field', 'done', 'done_cs99_missing', [
      { name: 'done_cs99_missing.md', body: validDoneBody('CS99', { dependsOn: false }) },
    ]);
    try {
      const r = runLinter(['--dir', root]);
      assert.equal(r.status, 1, `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`);
      assert.ok(
        r.stdout.includes('missing required field') && r.stdout.includes('Depends on'),
        `Expected missing Depends-on field error; got:\n${r.stdout}`
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // 23. directory-form CS whose inner <dirname>.md is absent → structure error
  it('23. directory-form CS missing its inner plan file exits 1', () => {
    const root = writeDirFormFixture('dirform-no-inner', 'done', 'done_cs99_noinner', [
      { name: 'notes.md', body: '# stray notes, not the plan file\n' },
    ]);
    try {
      const r = runLinter(['--dir', root]);
      assert.equal(r.status, 1, `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`);
      assert.ok(
        r.stdout.includes('missing its inner plan file') &&
          r.stdout.includes('done_cs99_noinner.md'),
        `Expected missing-inner-plan-file error; got:\n${r.stdout}`
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // 24. directory-form CS with a stray differently-named clickstop file → error
  it('24. directory-form CS with a stray inner clickstop file exits 1', () => {
    const root = writeDirFormFixture('dirform-stray', 'done', 'done_cs99_stray', [
      { name: 'done_cs99_stray.md', body: validDoneBody('CS99') },
      { name: 'done_cs98_other.md', body: validDoneBody('CS98') },
    ]);
    try {
      const r = runLinter(['--dir', root]);
      assert.equal(r.status, 1, `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`);
      assert.ok(
        r.stdout.includes('stray clickstop file') && r.stdout.includes('done_cs98_other.md'),
        `Expected stray-file structure error; got:\n${r.stdout}`
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // 25. a fenced PVI H2 in a directory-form CS no longer satisfies the gate
  it('25. fenced PVI heading (directory-form) does not satisfy the gate', () => {
    const root = writeDirFormFixture('dirform-fenced-pvi', 'done', 'done_cs99_fenced', [
      { name: 'done_cs99_fenced.md', body: validDoneBody('CS99', { fencedPvi: true }) },
    ]);
    try {
      const r = runLinter(['--dir', root]);
      assert.equal(r.status, 1, `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`);
      assert.ok(
        r.stdout.includes('missing required H2 section'),
        `Expected a fenced PVI heading to be treated as MISSING; got:\n${r.stdout}`
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // 26. a fenced PVI H2 in a flat file no longer satisfies the gate
  it('26. fenced PVI heading (flat file) does not satisfy the gate', () => {
    const root = writeGeneratedDoneFixture(
      'flat-fenced-pvi',
      ['```', '## Plan-vs-implementation review', '', '**Reviewer:** x', '**Date:** y', '**Outcome:** Go', '```'].join('\n')
    );
    try {
      const r = runLinter(['--dir', root]);
      assert.equal(r.status, 1, `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}`);
      assert.ok(
        r.stdout.includes('missing required H2 section'),
        `Expected a fenced PVI heading to be treated as MISSING; got:\n${r.stdout}`
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // 27. CS75 review R1 (gpt-5.5) blocking finding: a fenced fake PVI section
  // carrying Reviewer/Date/Outcome fields must NOT satisfy the done-stage field
  // check when the REAL (non-fenced) PVI H2 is empty. Both presence AND the
  // field-body scope are fence-aware, so the body is taken from the real (empty)
  // heading, not the earlier fenced one (which the old extractSectionBody used).
  it('27. fenced PVI fields before a real empty PVI H2 still fail the done field check', () => {
    const root = writeGeneratedDoneFixture(
      'done-fenced-fields-before-real-empty-pvi',
      [
        '```text',
        '## Plan-vs-implementation review',
        '',
        '**Reviewer:** gpt-5.5',
        '**Date:** 2026-05-01',
        '**Outcome:** Go',
        '```',
        '',
        '## Plan-vs-implementation review',
      ].join('\n')
    );
    try {
      const r = runLinter(['--dir', root]);
      assert.equal(r.status, 1, `Expected exit 1 (real PVI body empty); got ${r.status}\nstdout: ${r.stdout}`);
      assert.ok(
        r.stdout.includes('must contain Reviewer/Date/Outcome'),
        `Expected the done-stage field error (fenced fields must not count); got:\n${r.stdout}`
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

});
