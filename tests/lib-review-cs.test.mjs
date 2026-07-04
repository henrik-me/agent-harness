/**
 * tests/lib-review-cs.test.mjs — unit tests for lib/review-cs.mjs (CS66 C66-3).
 *
 * Hermetic: every test drives the core through an INJECTED in-memory seam
 * (fake spawnSync returning canned {status, stdout, stderr} + fake readdir /
 * exists over a synthetic clickstops tree). No real linters are spawned, no
 * real filesystem is touched, and nothing is written under the repo root or
 * os.tmpdir() (LRN-094) — the fake seam removes the need for scratch fixtures
 * entirely.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { normalizeCsId, locateClickstop, runReviewCs } from '../lib/review-cs.mjs';

const CWD = path.join(path.sep, 'repo');

/**
 * Build an in-memory seam for a single clickstop file.
 *
 * @param {object} cfg
 * @param {string} cfg.stage       - 'planned' | 'active' | 'done'.
 * @param {string} cfg.fileName    - flat .md filename OR directory name.
 * @param {boolean} [cfg.dirForm]  - true → directory-form CS.
 * @param {number} [cfg.planStatus]
 * @param {string} [cfg.planStdout]
 * @param {number} [cfg.lifeStatus]
 * @param {string} [cfg.lifeStdout]
 * @param {Error}  [cfg.spawnError]
 * @param {string[]} [cfg.extraStages] - other stage dirs that exist but are empty.
 * @param {string} [cfg.fileContent]   - content returned by seam.readFile (B4).
 * @param {string[]} [cfg.trackedFiles] - files returned by `git ls-files` (C75-4).
 */
function makeSeam(cfg) {
  const {
    stage,
    fileName,
    dirForm = false,
    planStatus = 0,
    planStdout = '',
    lifeStatus = 0,
    lifeStdout = '',
    spawnError = null,
    extraStages = [],
    fileContent = '',
    trackedFiles = [],
  } = cfg;

  const clickstopsDir = path.join(CWD, 'project', 'clickstops');
  const stageDir = path.join(clickstopsDir, stage);
  const dirContents = new Map();
  const existing = new Set([stageDir]);

  dirContents.set(stageDir, [fileName]);
  for (const s of extraStages) {
    const d = path.join(clickstopsDir, s);
    existing.add(d);
    dirContents.set(d, []);
  }
  if (dirForm) {
    // N3 (Copilot) — locateClickstop now reads the inner directory (ENOENT-
    // discriminating) instead of exists()-gating innerMd, so the fake readdir
    // must return the inner `<name>.md` entry for the subdirectory path.
    const innerDir = path.join(stageDir, fileName);
    existing.add(path.join(innerDir, `${fileName}.md`));
    dirContents.set(innerDir, [`${fileName}.md`]);
  }

  const out = [];
  const err = [];

  const seam = {
    readdir: (dir) => {
      if (!dirContents.has(dir)) {
        // Mirror readdirSync on a missing dir: throw an ENOENT-coded Error so
        // locateClickstop's C3 discrimination skips (vs. rethrows) correctly.
        throw Object.assign(new Error(`ENOENT: no such file or directory, scandir '${dir}'`), {
          code: 'ENOENT',
        });
      }
      return dirContents.get(dir);
    },
    exists: (p) => existing.has(p),
    readFile: () => {
      if (fileContent instanceof Error) throw fileContent;
      return fileContent;
    },
    stdout: (s) => out.push(s),
    stderr: (s) => err.push(s),
    spawnSync: (cmd, args) => {
      if (spawnError) return { error: spawnError, status: null, stdout: '', stderr: '' };
      // C75-4: the deliverable-path advisory resolves tracked files via
      // `git ls-files`. Return the fixture's tracked-file list for THAT call
      // only (narrowed so other git usage isn't masked, and so spawnError above
      // still applies to git).
      if (cmd === 'git' && args.includes('ls-files')) {
        return { status: 0, stdout: trackedFiles.join('\n'), stderr: '' };
      }
      const isPlan = args.some((a) => a.includes('plan-review'));
      return isPlan
        ? { status: planStatus, stdout: planStdout, stderr: '' }
        : { status: lifeStatus, stdout: lifeStdout, stderr: '' };
    },
  };

  return { seam, out: () => out.join(''), err: () => err.join('') };
}

const VALID_ACTIVE_PVI = '# CS\n\n## Plan-vs-implementation review\n\nReviewer notes here.\n';
const VALID_DONE_PVI =
  '# CS\n\n## Plan-vs-implementation review\n\n' +
  '**Reviewer:** gpt-5.5\n**Date:** 2026-01-01\n**Outcome:** Go\n';

/* ---------- normalizeCsId ------------------------------------------------- */

test('normalizeCsId: accepts CS66, cs66, 66, 66b, CS66b; rejects gibberish', () => {
  assert.equal(normalizeCsId('CS66'), 'CS66');
  assert.equal(normalizeCsId('cs66'), 'CS66');
  assert.equal(normalizeCsId('66'), 'CS66');
  assert.equal(normalizeCsId(66), 'CS66');
  assert.equal(normalizeCsId('66b'), 'CS66b');
  assert.equal(normalizeCsId('CS66B'), 'CS66b');
  assert.throws(() => normalizeCsId('foo'), /invalid clickstop id/);
  assert.throws(() => normalizeCsId(''), /required/);
  assert.throws(() => normalizeCsId(undefined), /required/);
});

/* ---------- locateClickstop ---------------------------------------------- */

test('locateClickstop: finds a flat file in planned/, active/, and done/', () => {
  for (const stage of ['planned', 'active', 'done']) {
    const fileName = `${stage}_cs66_review-family-verbs.md`;
    const { seam } = makeSeam({ stage, fileName });
    const matches = locateClickstop(CWD, 'CS66', seam);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].stage, stage);
    assert.equal(matches[0].label, `${stage}/${fileName}`);
  }
});

test('locateClickstop: supports directory-form clickstops', () => {
  const { seam } = makeSeam({ stage: 'active', fileName: 'active_cs70_foo', dirForm: true });
  const matches = locateClickstop(CWD, 'CS70', seam);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].basename, 'active_cs70_foo.md');
  assert.equal(matches[0].label, 'active/active_cs70_foo.md');
});

test('locateClickstop: no match returns empty array', () => {
  const { seam } = makeSeam({ stage: 'planned', fileName: 'planned_cs66_x.md' });
  assert.deepEqual(locateClickstop(CWD, 'CS99', seam), []);
});

/* ---------- runReviewCs: normalization + happy path ---------------------- */

test('runReviewCs: both linters pass → complete, exit 0, report says review-complete', async () => {
  const { seam, out } = makeSeam({ stage: 'planned', fileName: 'planned_cs66_review-family-verbs.md' });
  const r = await runReviewCs({ cwd: CWD, csId: 'CS66', seam });
  assert.equal(r.status, 'complete');
  assert.equal(r.exitCode, 0);
  assert.equal(r.csId, 'CS66');
  assert.equal(r.state, 'planned');
  assert.equal(r.planReview.ok, true);
  assert.equal(r.pvi.ok, true);
  assert.match(r.report, /review-complete/);
  assert.match(out(), /review-complete/);
});

test('runReviewCs: normalizes bare "66" the same as "CS66"', async () => {
  const a = makeSeam({ stage: 'planned', fileName: 'planned_cs66_x.md' });
  const b = makeSeam({ stage: 'planned', fileName: 'planned_cs66_x.md' });
  const r1 = await runReviewCs({ cwd: CWD, csId: '66', seam: a.seam });
  const r2 = await runReviewCs({ cwd: CWD, csId: 'CS66', seam: b.seam });
  assert.equal(r1.csId, 'CS66');
  assert.equal(r2.csId, 'CS66');
  assert.equal(r1.status, r2.status);
});

/* ---------- runReviewCs: fail-closed location ---------------------------- */

test('runReviewCs: CS not found → fail closed, nonzero exit, clear stderr', async () => {
  const { seam, err } = makeSeam({ stage: 'planned', fileName: 'planned_cs66_x.md' });
  const r = await runReviewCs({ cwd: CWD, csId: 'CS99', seam });
  assert.equal(r.status, 'error');
  assert.notEqual(r.exitCode, 0);
  assert.match(r.error, /no clickstop file found for CS99/);
  assert.match(err(), /no clickstop file found for CS99/);
});

test('runReviewCs: ambiguous match (>1) → fail closed', async () => {
  // Same CS present in both planned/ and active/ → ambiguous.
  const clickstopsDir = path.join(CWD, 'project', 'clickstops');
  const plannedDir = path.join(clickstopsDir, 'planned');
  const activeDir = path.join(clickstopsDir, 'active');
  const out = [];
  const err = [];
  const seam = {
    readdir: (dir) => {
      if (dir === plannedDir) return ['planned_cs66_a.md'];
      if (dir === activeDir) return ['active_cs66_b.md'];
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    },
    exists: (p) => p === plannedDir || p === activeDir,
    stdout: (s) => out.push(s),
    stderr: (s) => err.push(s),
    spawnSync: () => ({ status: 0, stdout: '', stderr: '' }),
  };
  const r = await runReviewCs({ cwd: CWD, csId: '66', seam });
  assert.equal(r.status, 'error');
  assert.notEqual(r.exitCode, 0);
  assert.match(r.error, /ambiguous/);
  assert.match(err.join(''), /ambiguous/);
});

test('runReviewCs: invalid CS id → fail closed before lookup', async () => {
  const { seam } = makeSeam({ stage: 'planned', fileName: 'planned_cs66_x.md' });
  const r = await runReviewCs({ cwd: CWD, csId: 'banana', seam });
  assert.equal(r.status, 'error');
  assert.notEqual(r.exitCode, 0);
  assert.match(r.error, /invalid clickstop id/);
});

/* ---------- runReviewCs: plan-review failure ----------------------------- */

test('runReviewCs: plan-review fails → incomplete; advisory exit 0, strict exit 1', async () => {
  const label = 'planned/planned_cs66_x.md';
  const planStdout =
    `ERROR: ${label}: "## Plan review" section is absent\n` +
    'check-clickstop-plan-review: 1 errors, 0 warnings\n';

  const advisory = makeSeam({
    stage: 'planned',
    fileName: 'planned_cs66_x.md',
    planStatus: 1,
    planStdout,
  });
  const r = await runReviewCs({ cwd: CWD, csId: 'CS66', seam: advisory.seam });
  assert.equal(r.status, 'incomplete');
  assert.equal(r.exitCode, 0); // advisory
  assert.equal(r.planReview.ok, false);
  assert.ok(r.planReview.details.some((d) => /Plan review.*absent/.test(d)));
  assert.match(r.report, /Plan review: FAIL/);

  const strictSeam = makeSeam({
    stage: 'planned',
    fileName: 'planned_cs66_x.md',
    planStatus: 1,
    planStdout,
  });
  const rs = await runReviewCs({ cwd: CWD, csId: 'CS66', strict: true, seam: strictSeam.seam });
  assert.equal(rs.status, 'incomplete');
  assert.equal(rs.exitCode, 1); // strict
});

/* ---------- runReviewCs: PVI failure ------------------------------------- */

test('runReviewCs: PVI missing on active file → reported; strict exit 1', async () => {
  const label = 'active/active_cs66_x.md';
  const lifeStdout =
    `ERROR: ${label}: "## Plan-vs-implementation review" section is missing\n` +
    'clickstops: 1 files checked, 1 errors\n';

  const advisory = makeSeam({
    stage: 'active',
    fileName: 'active_cs66_x.md',
    lifeStatus: 1,
    lifeStdout,
  });
  const r = await runReviewCs({ cwd: CWD, csId: 'CS66', seam: advisory.seam });
  assert.equal(r.status, 'incomplete');
  assert.equal(r.exitCode, 0);
  assert.equal(r.pvi.ok, false);
  assert.ok(r.pvi.details.some((d) => /Plan-vs-implementation review.*missing/.test(d)));

  const strictSeam = makeSeam({
    stage: 'active',
    fileName: 'active_cs66_x.md',
    lifeStatus: 1,
    lifeStdout,
  });
  const rs = await runReviewCs({ cwd: CWD, csId: 'CS66', strict: true, seam: strictSeam.seam });
  assert.equal(rs.exitCode, 1);
});

test('runReviewCs: a sibling CS failure does not contaminate this CS verdict', async () => {
  // Lifecycle linter exits 1 because OF ANOTHER file; our file has no ERROR line.
  const lifeStdout =
    'ERROR: active/active_cs77_other.md: "## Plan-vs-implementation review" section is missing\n' +
    'clickstops: 2 files checked, 1 errors\n';
  const { seam } = makeSeam({
    stage: 'active',
    fileName: 'active_cs66_x.md',
    lifeStatus: 1,
    lifeStdout,
    fileContent: VALID_ACTIVE_PVI,
  });
  const r = await runReviewCs({ cwd: CWD, csId: 'CS66', seam });
  assert.equal(r.pvi.ok, true);
  assert.equal(r.status, 'complete');
});

/* ---------- runReviewCs: aggregation + done handling --------------------- */

test('runReviewCs: report contains BOTH plan-review and PVI status lines', async () => {
  const { seam } = makeSeam({ stage: 'planned', fileName: 'planned_cs66_x.md' });
  const r = await runReviewCs({ cwd: CWD, csId: 'CS66', seam, quiet: true });
  assert.match(r.report, /^Plan review: /m);
  assert.match(r.report, /^PVI gate: /m);
});

test('runReviewCs: done CS — plan-review skipped, PVI from lifecycle', async () => {
  // done files are skipped by plan-review (status 0, no output); PVI passes.
  const { seam } = makeSeam({ stage: 'done', fileName: 'done_cs66_x.md', fileContent: VALID_DONE_PVI });
  const r = await runReviewCs({ cwd: CWD, csId: 'CS66', seam });
  assert.equal(r.state, 'done');
  assert.equal(r.planReview.ok, true);
  assert.ok(r.planReview.details.some((d) => /done/.test(d)));
  assert.equal(r.status, 'complete');
});

test('runReviewCs: quiet suppresses stdout report', async () => {
  const { seam, out } = makeSeam({ stage: 'planned', fileName: 'planned_cs66_x.md' });
  await runReviewCs({ cwd: CWD, csId: 'CS66', seam, quiet: true });
  assert.equal(out(), '');
});

/* ---------- runReviewCs: linter usage / spawn failures fail closed ------- */

test('runReviewCs: linter usage error (status 2) → fail closed', async () => {
  const { seam, err } = makeSeam({
    stage: 'planned',
    fileName: 'planned_cs66_x.md',
    planStatus: 2,
    planStdout: '',
  });
  const r = await runReviewCs({ cwd: CWD, csId: 'CS66', seam });
  assert.equal(r.status, 'error');
  assert.notEqual(r.exitCode, 0);
  assert.match(r.error, /usage error/);
  assert.match(err(), /usage error/);
});

test('runReviewCs: subprocess spawn failure → fail closed', async () => {
  const { seam } = makeSeam({
    stage: 'planned',
    fileName: 'planned_cs66_x.md',
    spawnError: new Error('spawn ENOENT'),
  });
  const r = await runReviewCs({ cwd: CWD, csId: 'CS66', seam });
  assert.equal(r.status, 'error');
  assert.notEqual(r.exitCode, 0);
  assert.match(r.error, /failed to run|ENOENT/);
});

/* ---------- B4: direct PVI backstop (directory-form skip) ----------------- */

test('B4: directory-form ACTIVE file missing PVI H2 is caught even when check-clickstop reports clean', async () => {
  // Simulate check-clickstop SKIPPING the directory-form file (status 0, no
  // ERROR lines). The direct PVI check must still flag the missing H2.
  const { seam } = makeSeam({
    stage: 'active',
    fileName: 'active_cs70_dirform',
    dirForm: true,
    lifeStatus: 0,
    lifeStdout: '',
    fileContent: '# CS70\n\nNo PVI section here.\n',
  });
  const r = await runReviewCs({ cwd: CWD, csId: 'CS70', seam });
  assert.equal(r.pvi.ok, false);
  assert.equal(r.status, 'incomplete');
  assert.ok(r.pvi.details.some((d) => /direct check/.test(d)));

  const strictSeam = makeSeam({
    stage: 'active',
    fileName: 'active_cs70_dirform',
    dirForm: true,
    lifeStatus: 0,
    lifeStdout: '',
    fileContent: '# CS70\n\nNo PVI section here.\n',
  });
  const rs = await runReviewCs({ cwd: CWD, csId: 'CS70', strict: true, seam: strictSeam.seam });
  assert.equal(rs.exitCode, 1);
});

test('B4: DONE file with PVI H2 but missing **Outcome:** is caught by the direct check', async () => {
  const { seam } = makeSeam({
    stage: 'done',
    fileName: 'done_cs66_x.md',
    lifeStatus: 0,
    lifeStdout: '',
    fileContent:
      '# CS\n\n## Plan-vs-implementation review\n\n**Reviewer:** gpt-5.5\n**Date:** 2026-01-01\n',
  });
  const r = await runReviewCs({ cwd: CWD, csId: 'CS66', seam });
  assert.equal(r.pvi.ok, false);
  assert.ok(r.pvi.details.some((d) => /Reviewer\/Date\/Outcome field absent/.test(d)));
});

test('B4 (R2): DONE file with Reviewer/Date/Outcome OUTSIDE an empty PVI section is caught', async () => {
  // The fields live in another section (## Model audit); the PVI section body is
  // empty. A whole-file field check would false-pass; the section-scoped check
  // must flag it (R2 review finding).
  const { seam } = makeSeam({
    stage: 'done',
    fileName: 'done_cs66_x.md',
    lifeStatus: 0,
    lifeStdout: '',
    fileContent:
      '# CS\n\n## Model audit\n\n**Reviewer:** gpt-5.5\n**Date:** 2026-01-01\n**Outcome:** GO\n\n' +
      '## Plan-vs-implementation review\n\n_(empty)_\n',
  });
  const r = await runReviewCs({ cwd: CWD, csId: 'CS66', seam });
  assert.equal(r.pvi.ok, false);
  assert.ok(r.pvi.details.some((d) => /Reviewer\/Date\/Outcome field absent/.test(d)));
});

test('B4 (R2): DONE file with Reviewer/Date/Outcome INSIDE the PVI section passes', async () => {
  // Same fields, but now correctly inside the PVI section body → must pass.
  const { seam } = makeSeam({
    stage: 'done',
    fileName: 'done_cs66_x.md',
    lifeStatus: 0,
    lifeStdout: '',
    fileContent:
      '# CS\n\n## Plan-vs-implementation review\n\n' +
      '**Reviewer:** gpt-5.5\n**Date:** 2026-01-01\n**Outcome:** GO\n\n## Notes\n\ntrailing.\n',
  });
  const r = await runReviewCs({ cwd: CWD, csId: 'CS66', seam });
  assert.equal(r.pvi.ok, true);
  assert.equal(r.status, 'complete');
});

test('B4: DONE file with the grandfathering line passes the direct check', async () => {
  const grandfathered =
    '# CS\n\n## Plan-vs-implementation review\n\n' +
    '> Grandfathered: closed before plan-vs-implementation review gate was introduced (CS03b).\n';
  const { seam } = makeSeam({
    stage: 'done',
    fileName: 'done_cs66_x.md',
    lifeStatus: 0,
    lifeStdout: '',
    fileContent: grandfathered,
  });
  const r = await runReviewCs({ cwd: CWD, csId: 'CS66', seam });
  assert.equal(r.pvi.ok, true);
  assert.equal(r.status, 'complete');
});

test('B4: ACTIVE file WITH a PVI H2 passes the direct check', async () => {
  const { seam } = makeSeam({
    stage: 'active',
    fileName: 'active_cs66_x.md',
    lifeStatus: 0,
    lifeStdout: '',
    fileContent: VALID_ACTIVE_PVI,
  });
  const r = await runReviewCs({ cwd: CWD, csId: 'CS66', seam });
  assert.equal(r.pvi.ok, true);
  assert.equal(r.status, 'complete');
});

test('B4: a readFile failure on the located file fails closed', async () => {
  const { seam, err } = makeSeam({
    stage: 'active',
    fileName: 'active_cs66_x.md',
    lifeStatus: 0,
    lifeStdout: '',
    fileContent: new Error('EACCES read'),
  });
  const r = await runReviewCs({ cwd: CWD, csId: 'CS66', seam });
  assert.equal(r.status, 'error');
  assert.notEqual(r.exitCode, 0);
  assert.match(r.error, /direct PVI check/);
  assert.match(err(), /direct PVI check/);
});

/* ---------- C2: fence-aware PVI heading detection ------------------------ */

test('C2: PVI H2 that exists ONLY inside a code fence is treated as MISSING', async () => {
  // The active file mentions "## Plan-vs-implementation review" only inside a
  // ```fenced``` block — a fence-naive regex would false-pass. The fence-aware
  // direct check must report the H2 missing → pvi not ok on an active file.
  const fencedOnly =
    '# CS70\n\nSee the skeleton:\n\n```markdown\n## Plan-vs-implementation review\n\n' +
    '**Reviewer:** x\n**Date:** y\n**Outcome:** Go\n```\n\nNothing real below.\n';
  const { seam } = makeSeam({
    stage: 'active',
    fileName: 'active_cs70_dirform',
    dirForm: true,
    lifeStatus: 0,
    lifeStdout: '',
    fileContent: fencedOnly,
  });
  const r = await runReviewCs({ cwd: CWD, csId: 'CS70', seam });
  assert.equal(r.pvi.ok, false);
  assert.equal(r.status, 'incomplete');
  assert.ok(r.pvi.details.some((d) => /section missing \(direct check\)/.test(d)));
});

test('C2: a REAL PVI heading after a fence that merely mentions it is found + body extracted', async () => {
  // A fenced block mentions the heading (and even bogus fields), THEN a real H2
  // with valid fields follows. The real heading must win: pvi ok, fields read
  // from the REAL section body (not the fenced mention).
  const realAfterFence =
    '# CS66\n\nExample skeleton:\n\n```\n## Plan-vs-implementation review\n(ignore me)\n```\n\n' +
    '## Plan-vs-implementation review\n\n' +
    '**Reviewer:** gpt-5.5\n**Date:** 2026-01-01\n**Outcome:** Go\n';
  const { seam } = makeSeam({
    stage: 'done',
    fileName: 'done_cs66_x.md',
    lifeStatus: 0,
    lifeStdout: '',
    fileContent: realAfterFence,
  });
  const r = await runReviewCs({ cwd: CWD, csId: 'CS66', seam });
  assert.equal(r.pvi.ok, true);
  assert.equal(r.status, 'complete');
});

test('C2 (R6): inner ``` does NOT close a 4-backtick outer fence — heading stays MISSING', async () => {
  // CommonMark: a ```` (4-backtick) fence is not closed by an inner ``` (len 3 < 4).
  // A char-only fence tracker would treat the inner ``` as the close, exposing the
  // PVI heading as "real" (R6 bug). The length-aware tracker keeps it fenced.
  const fourBacktickOuter =
    '# CS70\n\n````markdown\n```\n## Plan-vs-implementation review\n\n' +
    '**Reviewer:** x\n**Date:** y\n**Outcome:** Go\n````\n\nNothing real below.\n';
  const { seam } = makeSeam({
    stage: 'active',
    fileName: 'active_cs70_dirform',
    dirForm: true,
    lifeStatus: 0,
    lifeStdout: '',
    fileContent: fourBacktickOuter,
  });
  const r = await runReviewCs({ cwd: CWD, csId: 'CS70', seam });
  assert.equal(r.pvi.ok, false);
  assert.equal(r.status, 'incomplete');
  assert.ok(r.pvi.details.some((d) => /section missing \(direct check\)/.test(d)));
});

test('C2 (R6): a normal triple-backtick fence still closes (3 closes 3) so the real heading is found', async () => {
  // Guard the length rule did not break the common case.
  const normalFence =
    '# CS66\n\n```\ncode\n```\n\n## Plan-vs-implementation review\n\n' +
    '**Reviewer:** gpt-5.5\n**Date:** 2026-01-01\n**Outcome:** Go\n';
  const { seam } = makeSeam({
    stage: 'done',
    fileName: 'done_cs66_x.md',
    lifeStatus: 0,
    lifeStdout: '',
    fileContent: normalFence,
  });
  const r = await runReviewCs({ cwd: CWD, csId: 'CS66', seam });
  assert.equal(r.pvi.ok, true);
  assert.equal(r.status, 'complete');
});

/* ---------- C3 / C4: non-ENOENT scan errors fail closed ------------------ */

/**
 * Build a seam whose readdir throws a custom (non-ENOENT) error for one stage
 * dir while behaving normally for the located CS's own stage dir. Drives the
 * C3 rethrow + C4 structured-error path.
 */
function makeScanErrorSeam({ stage, fileName, throwStage, error }) {
  const clickstopsDir = path.join(CWD, 'project', 'clickstops');
  const stageDir = path.join(clickstopsDir, stage);
  const throwDir = path.join(clickstopsDir, throwStage);
  const out = [];
  const err = [];
  const seam = {
    readdir: (dir) => {
      if (dir === throwDir) throw error;
      if (dir === stageDir) return [fileName];
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    },
    exists: () => false,
    readFile: () => '',
    stdout: (s) => out.push(s),
    stderr: (s) => err.push(s),
    spawnSync: () => ({ status: 0, stdout: '', stderr: '' }),
  };
  return { seam, out: () => out.join(''), err: () => err.join('') };
}

test('C3: locateClickstop RETHROWS a non-ENOENT readdir error (EACCES)', () => {
  const eacces = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
  const { seam } = makeScanErrorSeam({
    stage: 'done',
    fileName: 'done_cs66_x.md',
    throwStage: 'planned',
    error: eacces,
  });
  assert.throws(() => locateClickstop(CWD, 'CS66', seam), /EACCES/);
});

test('C3: an ENOENT-coded readdir error is skipped (not rethrown)', () => {
  const enoent = Object.assign(new Error('ENOENT: missing'), { code: 'ENOENT' });
  const { seam } = makeScanErrorSeam({
    stage: 'done',
    fileName: 'done_cs66_x.md',
    throwStage: 'planned',
    error: enoent,
  });
  const matches = locateClickstop(CWD, 'CS66', seam);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].stage, 'done');
});

test('C4: runReviewCs converts a scan throw (EACCES) into a structured fail-closed result', async () => {
  const eacces = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
  const { seam, err } = makeScanErrorSeam({
    stage: 'done',
    fileName: 'done_cs66_x.md',
    throwStage: 'planned',
    error: eacces,
  });
  const r = await runReviewCs({ cwd: CWD, csId: 'CS66', seam });
  assert.equal(r.status, 'error');
  assert.equal(r.exitCode, 1);
  assert.match(r.error, /failed to scan clickstops/);
  assert.match(err(), /failed to scan clickstops for CS66/);
});

/* ---------- N3: directory-form inner-file probe discriminates ENOENT ------ */

/**
 * Build a seam for a directory-form match where the OUTER stage readdir returns
 * the CS directory name, but the INNER directory readdir throws `innerError`.
 * Drives the N3 rethrow (EACCES) vs. skip (ENOENT) discrimination.
 */
function makeInnerDirSeam({ stage, dirName, innerError = null, innerEntries = null }) {
  const clickstopsDir = path.join(CWD, 'project', 'clickstops');
  const stageDir = path.join(clickstopsDir, stage);
  const innerDir = path.join(stageDir, dirName);
  const out = [];
  const err = [];
  const seam = {
    readdir: (dir) => {
      if (dir === stageDir) return [dirName];
      if (dir === innerDir) {
        if (innerError) throw innerError;
        return innerEntries || [];
      }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    },
    exists: () => false,
    readFile: () => VALID_ACTIVE_PVI,
    stdout: (s) => out.push(s),
    stderr: (s) => err.push(s),
    spawnSync: () => ({ status: 0, stdout: '', stderr: '' }),
  };
  return { seam, out: () => out.join(''), err: () => err.join('') };
}

test('N3: inner-dir readdir EACCES is RETHROWN (not masked as absent)', () => {
  const eacces = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
  const { seam } = makeInnerDirSeam({ stage: 'active', dirName: 'active_cs70_foo', innerError: eacces });
  assert.throws(() => locateClickstop(CWD, 'CS70', seam), /EACCES/);
});

test('N3: inner-dir readdir ENOENT skips the match (no throw)', () => {
  const enoent = Object.assign(new Error('ENOENT: missing'), { code: 'ENOENT' });
  const { seam } = makeInnerDirSeam({ stage: 'active', dirName: 'active_cs70_foo', innerError: enoent });
  assert.deepEqual(locateClickstop(CWD, 'CS70', seam), []);
});

test('N3: inner-dir without the `<name>.md` entry skips the match', () => {
  const { seam } = makeInnerDirSeam({ stage: 'active', dirName: 'active_cs70_foo', innerEntries: ['notes.md'] });
  assert.deepEqual(locateClickstop(CWD, 'CS70', seam), []);
});

test('N3: inner-dir EACCES propagates to a structured fail-closed runReviewCs result', async () => {
  const eacces = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
  const { seam } = makeInnerDirSeam({ stage: 'active', dirName: 'active_cs70_foo', innerError: eacces });
  const r = await runReviewCs({ cwd: CWD, csId: 'CS70', seam });
  assert.equal(r.status, 'error');
  assert.equal(r.exitCode, 1);
  assert.match(r.error, /failed to scan clickstops/);
});

/* ---------- N5: planOk requires no extracted ERROR lines ------------------ */

test('N5: plan linter exits 0 but emits an ERROR line for this CS → planReview.ok false', async () => {
  const label = 'active/active_cs66_x.md';
  const planStdout =
    `ERROR: ${label}: "## Plan review" verdict is stale\n` +
    'check-clickstop-plan-review: 1 errors, 0 warnings\n';

  const advisory = makeSeam({
    stage: 'active',
    fileName: 'active_cs66_x.md',
    planStatus: 0, // linter exited 0 despite the ERROR line
    planStdout,
    lifeStatus: 0,
    fileContent: VALID_ACTIVE_PVI,
  });
  const r = await runReviewCs({ cwd: CWD, csId: 'CS66', seam: advisory.seam });
  assert.equal(r.planReview.ok, false);
  assert.equal(r.status, 'incomplete');
  assert.equal(r.exitCode, 0); // advisory
  assert.match(r.report, /Plan review: FAIL/);

  const strictSeam = makeSeam({
    stage: 'active',
    fileName: 'active_cs66_x.md',
    planStatus: 0,
    planStdout,
    lifeStatus: 0,
    fileContent: VALID_ACTIVE_PVI,
  });
  const rs = await runReviewCs({ cwd: CWD, csId: 'CS66', strict: true, seam: strictSeam.seam });
  assert.equal(rs.status, 'incomplete');
  assert.equal(rs.exitCode, 1); // strict
});

/* ---------- C75-4: deliverable-path existence advisory ------------------- */

const DELIV_PVI =
  '# CS\n\n' +
  '## Deliverables\n\n' +
  '1. `lib/real-thing.mjs` (edit) — an existing module.\n' +
  '2. `lib/ghost-module.mjs` (new) — does NOT exist in the tree yet.\n\n' +
  '## Plan-vs-implementation review\n\nReviewer notes.\n';

test('deliverable advisory: flags a deliverable path not tracked in git', async () => {
  const { seam } = makeSeam({
    stage: 'active',
    fileName: 'active_cs66_x.md',
    fileContent: DELIV_PVI,
    trackedFiles: ['lib/real-thing.mjs', 'README.md'],
  });
  const r = await runReviewCs({ cwd: CWD, csId: 'CS66', seam });
  // Advisory is non-blocking: it never changes the verdict/exit code.
  assert.equal(r.exitCode, 0);
  assert.equal(r.advisories.length, 1);
  assert.match(r.advisories[0], /lib\/ghost-module\.mjs/);
  assert.ok(!r.advisories.some((a) => a.includes('lib/real-thing.mjs')));
  assert.match(r.report, /Deliverable-path advisories \(non-blocking\)/);
  assert.match(r.report, /lib\/ghost-module\.mjs/);
});

test('deliverable advisory: no advisory when every deliverable path is tracked', async () => {
  const { seam } = makeSeam({
    stage: 'active',
    fileName: 'active_cs66_x.md',
    fileContent: DELIV_PVI,
    trackedFiles: ['lib/real-thing.mjs', 'lib/ghost-module.mjs'],
  });
  const r = await runReviewCs({ cwd: CWD, csId: 'CS66', seam });
  assert.equal(r.advisories.length, 0);
  assert.ok(!/Deliverable-path advisories/.test(r.report));
});

test('deliverable advisory: no false positive on prose/glob/bare-word tokens', async () => {
  const content =
    '# CS\n\n' +
    '## Deliverables\n\n' +
    '- Update the module at lib/prose-only.mjs so it loads (no backticks — illustrative).\n' +
    '- Add `tests/*.test.mjs` coverage (a glob — must not be flagged).\n' +
    '- Touch the `harness` CLI verb (bare word — not a path).\n\n' +
    '## Plan-vs-implementation review\n\nReviewer notes.\n';
  const { seam } = makeSeam({
    stage: 'active',
    fileName: 'active_cs66_x.md',
    fileContent: content,
    trackedFiles: [], // even with an empty tree, none of the tokens qualify
  });
  const r = await runReviewCs({ cwd: CWD, csId: 'CS66', seam });
  assert.equal(r.advisories.length, 0);
});
