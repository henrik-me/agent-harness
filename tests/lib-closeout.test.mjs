/**
 * tests/lib-closeout.test.mjs — unit tests for lib/closeout.mjs (CS64 C64-5).
 *
 * In-memory fakes throughout — no git, no REPO_ROOT writes (LRN-094).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  parsePviSection,
  removeActiveWorkRow,
  findActiveClickstop,
  planCloseout,
  preflightCloseout,
  applyCloseoutPlan,
  formatPreflightReport,
  formatApplyReport,
} from '../lib/closeout.mjs';
import { parseActiveWorkRows } from '../lib/claim.mjs';

const P = (...segs) => path.join(...segs);
const ROOT = P(path.sep, 'p');
const ACTIVE = P(ROOT, 'active');
const DONE = P(ROOT, 'done');

/* ---------- parsePviSection --------------------------------------------- */

test('parsePviSection: missing section reports "missing" issue', () => {
  const r = parsePviSection('# CS64\n\n## Other\n\nbody');
  assert.equal(r.present, false);
  assert.equal(r.filled, false);
  assert.ok(r.issues.some((i) => /missing "## Plan-vs-implementation review"/.test(i)));
});

test('parsePviSection: present + GO + all fields → filled', () => {
  const md = [
    '# CS64',
    '',
    '## Plan-vs-implementation review',
    '',
    '**Reviewer:** gpt-5.5 (rubber-duck)',
    '**Date:** 2026-06-10T15:00:00Z',
    '**Outcome:** GO',
    '',
    'All deliverables match.',
  ].join('\n');
  const r = parsePviSection(md);
  assert.equal(r.present, true);
  assert.equal(r.filled, true);
  assert.equal(r.outcome, 'GO');
  assert.equal(r.reviewer, 'gpt-5.5 (rubber-duck)');
  assert.equal(r.date, '2026-06-10T15:00:00Z');
  assert.deepEqual(r.issues, []);
});

test('parsePviSection: NEEDS-FIX outcome blocks (issue surfaced)', () => {
  const md = [
    '## Plan-vs-implementation review',
    '',
    '**Reviewer:** gpt-5.5',
    '**Date:** 2026-06-10',
    '**Outcome:** NEEDS-FIX',
  ].join('\n');
  const r = parsePviSection(md);
  assert.equal(r.outcome, 'NEEDS-FIX');
  assert.equal(r.filled, false);
  assert.ok(r.issues.some((i) => /NEEDS-FIX.*blocked/.test(i)));
});

test('parsePviSection: unfilled placeholder text is rejected', () => {
  const md = [
    '## Plan-vs-implementation review',
    '',
    '> _(filled at close-out per the gate)_',
  ].join('\n');
  const r = parsePviSection(md);
  assert.equal(r.present, true);
  assert.equal(r.filled, false);
  assert.ok(r.issues.some((i) => /unfilled-placeholder/.test(i)));
});

test('parsePviSection: missing **Outcome:** field is an issue', () => {
  const md = [
    '## Plan-vs-implementation review',
    '',
    '**Reviewer:** gpt-5.5',
    '**Date:** 2026-06-10',
  ].join('\n');
  const r = parsePviSection(md);
  assert.ok(r.issues.some((i) => /missing \*\*Outcome:\*\*/.test(i)));
});

test('parsePviSection: stops at next H2 boundary', () => {
  const md = [
    '## Plan-vs-implementation review',
    '',
    '**Reviewer:** gpt-5.5',
    '**Date:** 2026-06-10',
    '**Outcome:** GO',
    '',
    '## Next Section',
    '',
    '**Outcome:** NEEDS-FIX',
  ].join('\n');
  const r = parsePviSection(md);
  assert.equal(r.outcome, 'GO', 'must not pick up the later H2 section');
});

/* ---------- removeActiveWorkRow ----------------------------------------- */

const WB_WITH_CS64 = [
  '# Work Board',
  '',
  '## Active Work',
  '',
  '| CS-Task ID | Title | State | Owner | Branch | Last Updated | Blocked Reason |',
  '|------------|-------|-------|-------|--------|--------------|----------------|',
  '| CS64 | Lifecycle | 🟢 Active | omni-ah | cs64/content | 2026-06-10 | — |',
  '',
  '## Other',
  '',
].join('\n');

const WB_TWO_ROWS = [
  '# Work Board',
  '',
  '## Active Work',
  '',
  '| CS-Task ID | Title | State | Owner | Branch | Last Updated | Blocked Reason |',
  '|------------|-------|-------|-------|--------|--------------|----------------|',
  '| CS63 | Other  | 🟢 Active | yoga-ah | cs63/content | 2026-06-10 | — |',
  '| CS64 | Lifecycle | 🟢 Active | omni-ah | cs64/content | 2026-06-10 | — |',
  '',
  '## Other',
  '',
].join('\n');

test('removeActiveWorkRow: removes the matching row', () => {
  const { md, mutated } = removeActiveWorkRow({ workboardMd: WB_TWO_ROWS, csId: 'CS64' });
  assert.ok(mutated);
  const rows = parseActiveWorkRows(md);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].cs, 'CS63');
});

test('removeActiveWorkRow: restores em-dash placeholder when last row is removed', () => {
  const { md, mutated } = removeActiveWorkRow({ workboardMd: WB_WITH_CS64, csId: 'CS64' });
  assert.ok(mutated);
  assert.match(md, /\| — \| no active CS \| — \| — \| — \| — \| — \|/);
  assert.equal(parseActiveWorkRows(md).length, 0);
});

test('removeActiveWorkRow: idempotent when row is already gone', () => {
  const { md, mutated } = removeActiveWorkRow({ workboardMd: WB_WITH_CS64, csId: 'CS999' });
  assert.equal(mutated, false);
  assert.equal(md, WB_WITH_CS64);
});

/* ---------- findActiveClickstop ----------------------------------------- */

function fakeFs(entries, dirs = new Set()) {
  return {
    readdir: (p) => entries[p] || [],
    isDirectory: (p) => dirs.has(p),
  };
}

test('findActiveClickstop: flat form', () => {
  const r = findActiveClickstop({
    activeDir: ACTIVE,
    csId: 'CS64',
    ...fakeFs({ [ACTIVE]: ['active_cs64_my-slug.md'] }),
  });
  assert.ok(r.ok);
  assert.equal(r.listing.directoryForm, false);
  assert.match(r.listing.csFilePath, /active_cs64_my-slug\.md$/);
});

test('findActiveClickstop: directory form', () => {
  const dirP = P(ACTIVE, 'active_cs64_my-slug');
  const r = findActiveClickstop({
    activeDir: ACTIVE,
    csId: 'CS64',
    ...fakeFs({ [ACTIVE]: ['active_cs64_my-slug'] }, new Set([dirP])),
  });
  assert.ok(r.ok);
  assert.equal(r.listing.directoryForm, true);
  assert.match(r.listing.directoryPath, /active_cs64_my-slug$/);
});

test('findActiveClickstop: zero matches → error', () => {
  const r = findActiveClickstop({
    activeDir: ACTIVE,
    csId: 'CS64',
    ...fakeFs({ [ACTIVE]: [] }),
  });
  assert.ok(!r.ok);
  assert.match(r.error, /no active CS64/);
});

/* ---------- planCloseout, preflight, apply ------------------------------ */

function makeListing(directoryForm = false) {
  if (directoryForm) {
    return {
      csFilePath: P(ACTIVE, 'active_cs64_my-slug', 'active_cs64_my-slug.md'),
      filename: 'active_cs64_my-slug.md',
      cs: 'CS64',
      slug: 'my-slug',
      directoryForm: true,
      directoryPath: P(ACTIVE, 'active_cs64_my-slug'),
    };
  }
  return {
    csFilePath: P(ACTIVE, 'active_cs64_my-slug.md'),
    filename: 'active_cs64_my-slug.md',
    cs: 'CS64',
    slug: 'my-slug',
    directoryForm: false,
  };
}

const GOOD_PVI = [
  '# CS64',
  '',
  '## Plan-vs-implementation review',
  '',
  '**Reviewer:** gpt-5.5 (rubber-duck)',
  '**Date:** 2026-06-10T15:00:00Z',
  '**Outcome:** GO',
  '',
  'All deliverables match.',
].join('\n');

function fakeRunner(overrides = {}, files = {}) {
  const m = new Map(Object.entries(files));
  m.set(P(ROOT, 'WORKBOARD.md'), m.get(P(ROOT, 'WORKBOARD.md')) || WB_WITH_CS64);
  const gitMvCalls = [];
  return {
    m,
    gitMvCalls,
    runner: {
      currentBranch: () => 'cs64/close-out',
      worktreeClean: () => true,
      exists: (p) => m.has(p),
      readFile: (p) => m.get(p),
      writeFile: (p, body) => m.set(p, body),
      gitMv: (src, dest) => {
        gitMvCalls.push([src, dest]);
        if (!m.has(src)) throw new Error('missing src');
        m.set(dest, m.get(src));
        m.delete(src);
      },
      changedFiles: () => ['CONTEXT.md'],
      ...overrides,
    },
  };
}

test('planCloseout: flat form composes correct dest path', () => {
  const r = planCloseout({
    csId: 'CS64',
    listing: makeListing(false),
    activeDir: ACTIVE,
    doneDir: DONE,
    workboardPath: P(ROOT, 'WORKBOARD.md'),
    contextPath: P(ROOT, 'CONTEXT.md'),
  });
  assert.ok(r.ok);
  assert.match(r.plan.destPath, /done_cs64_my-slug\.md$/);
  assert.equal(r.plan.branchExpected, 'cs64/close-out');
});

test('planCloseout: directory form preserves directory dest (no .md)', () => {
  const r = planCloseout({
    csId: 'CS64',
    listing: makeListing(true),
    activeDir: ACTIVE,
    doneDir: DONE,
    workboardPath: P(ROOT, 'WORKBOARD.md'),
    contextPath: P(ROOT, 'CONTEXT.md'),
  });
  assert.ok(r.ok);
  assert.match(r.plan.destPath, /done_cs64_my-slug$/);
  assert.doesNotMatch(r.plan.destPath, /\.md$/);
});

test('preflightCloseout: branch mismatch is fatal', () => {
  const { plan } = planCloseout({
    csId: 'CS64',
    listing: makeListing(false),
    activeDir: ACTIVE,
    doneDir: DONE,
    workboardPath: P(ROOT, 'WORKBOARD.md'),
    contextPath: P(ROOT, 'CONTEXT.md'),
  });
  const { runner } = fakeRunner(
    { currentBranch: () => 'cs64/content' },
    { [plan.sourcePath]: GOOD_PVI }
  );
  const r = preflightCloseout({ plan, runner });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /expects "cs64\/close-out"/.test(e)));
});

test('preflightCloseout: dirty worktree is fatal', () => {
  const { plan } = planCloseout({
    csId: 'CS64',
    listing: makeListing(false),
    activeDir: ACTIVE,
    doneDir: DONE,
    workboardPath: P(ROOT, 'WORKBOARD.md'),
    contextPath: P(ROOT, 'CONTEXT.md'),
  });
  const { runner } = fakeRunner(
    { worktreeClean: () => false },
    { [plan.sourcePath]: GOOD_PVI }
  );
  const r = preflightCloseout({ plan, runner });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /worktree is not clean/.test(e)));
});

test('preflightCloseout: missing PVI section is fatal', () => {
  const { plan } = planCloseout({
    csId: 'CS64',
    listing: makeListing(false),
    activeDir: ACTIVE,
    doneDir: DONE,
    workboardPath: P(ROOT, 'WORKBOARD.md'),
    contextPath: P(ROOT, 'CONTEXT.md'),
  });
  const { runner } = fakeRunner({}, { [plan.sourcePath]: '# CS64\n\nnobody here\n' });
  const r = preflightCloseout({ plan, runner });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /missing "## Plan-vs-implementation review"/.test(e)));
});

test('preflightCloseout: green PVI + clean wt + correct branch → ok', () => {
  const { plan } = planCloseout({
    csId: 'CS64',
    listing: makeListing(false),
    activeDir: ACTIVE,
    doneDir: DONE,
    workboardPath: P(ROOT, 'WORKBOARD.md'),
    contextPath: P(ROOT, 'CONTEXT.md'),
  });
  const { runner } = fakeRunner({}, { [plan.sourcePath]: GOOD_PVI });
  const r = preflightCloseout({ plan, runner });
  assert.equal(r.ok, true);
  assert.equal(r.pvi.outcome, 'GO');
});

test('applyCloseoutPlan: rename + workboard row removal + CONTEXT detected', () => {
  const { plan } = planCloseout({
    csId: 'CS64',
    listing: makeListing(false),
    activeDir: ACTIVE,
    doneDir: DONE,
    workboardPath: P(ROOT, 'WORKBOARD.md'),
    contextPath: P(ROOT, 'CONTEXT.md'),
  });
  const { runner, m, gitMvCalls } = fakeRunner({}, { [plan.sourcePath]: GOOD_PVI });
  const applied = applyCloseoutPlan({ plan, runner });
  assert.equal(applied.renamed, true);
  assert.equal(applied.workboardEdited, true);
  assert.equal(applied.contextChanged, true);
  assert.equal(applied.prReady, true);
  assert.equal(gitMvCalls.length, 1);
  assert.ok(m.has(plan.destPath));
  assert.ok(!m.has(plan.sourcePath));
});

test('applyCloseoutPlan: CONTEXT untouched → prReady=false + freshness reason', () => {
  const { plan } = planCloseout({
    csId: 'CS64',
    listing: makeListing(false),
    activeDir: ACTIVE,
    doneDir: DONE,
    workboardPath: P(ROOT, 'WORKBOARD.md'),
    contextPath: P(ROOT, 'CONTEXT.md'),
  });
  const { runner } = fakeRunner(
    { changedFiles: () => ['WORKBOARD.md', 'project/clickstops/done/done_cs64_my-slug.md'] },
    { [plan.sourcePath]: GOOD_PVI }
  );
  const applied = applyCloseoutPlan({ plan, runner });
  assert.equal(applied.prReady, false);
  assert.ok(applied.freshness.some((f) => /CONTEXT\.md was not modified/.test(f)));
});

test('applyCloseoutPlan: idempotent — re-running after partial completion only does the remainder', () => {
  const { plan } = planCloseout({
    csId: 'CS64',
    listing: makeListing(false),
    activeDir: ACTIVE,
    doneDir: DONE,
    workboardPath: P(ROOT, 'WORKBOARD.md'),
    contextPath: P(ROOT, 'CONTEXT.md'),
  });
  const { runner } = fakeRunner({}, { [plan.sourcePath]: GOOD_PVI });
  applyCloseoutPlan({ plan, runner });
  const second = applyCloseoutPlan({ plan, runner });
  assert.equal(second.renamed, false);
  assert.equal(second.workboardEdited, false);
  assert.ok(second.skipped.some((s) => /already applied/.test(s)));
});

test('applyCloseoutPlan: R3 race-aware — uses fresh WORKBOARD content', () => {
  const { plan } = planCloseout({
    csId: 'CS64',
    listing: makeListing(false),
    activeDir: ACTIVE,
    doneDir: DONE,
    workboardPath: P(ROOT, 'WORKBOARD.md'),
    contextPath: P(ROOT, 'CONTEXT.md'),
  });
  const { runner, m } = fakeRunner({}, { [plan.sourcePath]: GOOD_PVI });
  // Sibling clone changes WORKBOARD between plan composition and apply.
  m.set(P(ROOT, 'WORKBOARD.md'), WB_TWO_ROWS);
  applyCloseoutPlan({ plan, runner });
  const final = m.get(P(ROOT, 'WORKBOARD.md'));
  const rows = parseActiveWorkRows(final);
  // CS63 sibling preserved; CS64 removed.
  assert.equal(rows.length, 1);
  assert.equal(rows[0].cs, 'CS63');
});

/* ---------- formatters --------------------------------------------------- */

test('formatPreflightReport: passing run mentions --apply', () => {
  const { plan } = planCloseout({
    csId: 'CS64',
    listing: makeListing(false),
    activeDir: ACTIVE,
    doneDir: DONE,
    workboardPath: P(ROOT, 'WORKBOARD.md'),
    contextPath: P(ROOT, 'CONTEXT.md'),
  });
  const out = formatPreflightReport({
    plan,
    preflight: {
      ok: true,
      errors: [],
      warnings: [],
      pvi: { present: true, filled: true, reviewer: 'gpt-5.5', date: '2026-06-10', outcome: 'GO', issues: [] },
    },
  });
  assert.match(out, /preflight checks passed/);
  assert.match(out, /--apply/);
  assert.match(out, /PVI: GO by gpt-5\.5/);
});

test('formatApplyReport: not-ready run lists freshness reason', () => {
  const { plan } = planCloseout({
    csId: 'CS64',
    listing: makeListing(false),
    activeDir: ACTIVE,
    doneDir: DONE,
    workboardPath: P(ROOT, 'WORKBOARD.md'),
    contextPath: P(ROOT, 'CONTEXT.md'),
  });
  const out = formatApplyReport({
    plan,
    applied: {
      renamed: true,
      workboardEdited: true,
      contextChanged: false,
      prReady: false,
      actions: ['git mv x → y'],
      skipped: [],
      freshness: ['CONTEXT.md was not modified in this branch'],
    },
  });
  assert.match(out, /NOT ready to open close-out PR/);
  assert.match(out, /CONTEXT\.md was not modified/);
});
