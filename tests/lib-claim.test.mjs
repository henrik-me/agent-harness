/**
 * tests/lib-claim.test.mjs — unit tests for lib/claim.mjs (CS64 C64-4).
 *
 * Drives the pure logic (find / plan / format / insert / apply) against
 * in-memory fixtures. NO real git, NO REPO_ROOT writes (LRN-094).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  normalizeCsId,
  slugIsValid,
  findPlannedClickstop,
  parseActiveWorkRows,
  insertActiveWorkRow,
  planClaim,
  formatClaimPlan,
  applyClaimPlan,
} from '../lib/claim.mjs';

// Use the real path separator so Windows + POSIX tests agree on string equality.
const P = (...segs) => path.join(...segs);
const ROOT = P(path.sep, 'p');
const PLANNED = P(ROOT, 'planned');

/* ---------- normalizeCsId / slugIsValid ---------------------------------- */

test('normalizeCsId: accepts upper/lower case + suffix, rejects gibberish', () => {
  assert.equal(normalizeCsId('CS64'), 'CS64');
  assert.equal(normalizeCsId('cs64'), 'CS64');
  assert.equal(normalizeCsId('cs15a'), 'CS15a');
  assert.equal(normalizeCsId('CS64 '), 'CS64');
  assert.equal(normalizeCsId('nope'), null);
  assert.equal(normalizeCsId(''), null);
  assert.equal(normalizeCsId(null), null);
});

test('slugIsValid: lower-kebab, no leading hyphens or uppercase', () => {
  assert.ok(slugIsValid('lifecycle-command-skill-surface'));
  assert.ok(slugIsValid('cs64'));
  assert.ok(slugIsValid('a'));
  // dots are valid (real CS names embed semver segments, e.g.
  // done_cs70_cut-v0.7.0-and-v0.8.0-releases). Rejecting dots would block
  // `harness claim` from ever finding such planned CSs.
  assert.ok(slugIsValid('cut-v0.7.0-and-v0.8.0-releases'));
  assert.ok(slugIsValid('cut-harness-v0.2.0'));
  assert.ok(!slugIsValid('-leading-hyphen'));
  assert.ok(!slugIsValid('.leading-dot'));
  assert.ok(!slugIsValid('UPPER'));
  assert.ok(!slugIsValid('snake_case'));
  assert.ok(!slugIsValid(''));
  assert.ok(!slugIsValid(null));
});

/* ---------- findPlannedClickstop ----------------------------------------- */

function fakeFs(entries, dirs = new Set()) {
  return {
    readdir: (p) => entries[p] || [],
    isDirectory: (p) => dirs.has(p),
  };
}

test('findPlannedClickstop: flat form (planned_csNN_<slug>.md)', () => {
  const r = findPlannedClickstop({
    plannedDir: PLANNED,
    csId: 'CS64',
    ...fakeFs({ [PLANNED]: ['planned_cs64_my-slug.md', 'planned_cs02_other.md'] }),
  });
  assert.ok(r.ok);
  assert.equal(r.listing.cs, 'CS64');
  assert.equal(r.listing.slug, 'my-slug');
  assert.equal(r.listing.directoryForm, false);
  assert.match(r.listing.entryPath, /planned_cs64_my-slug\.md$/);
});

test('findPlannedClickstop: directory form (planned_csNN_<slug>/planned_csNN_<slug>.md)', () => {
  const dirPath = P(PLANNED, 'planned_cs64_my-slug');
  const r = findPlannedClickstop({
    plannedDir: PLANNED,
    csId: 'CS64',
    ...fakeFs({ [PLANNED]: ['planned_cs64_my-slug'] }, new Set([dirPath])),
  });
  assert.ok(r.ok);
  assert.equal(r.listing.directoryForm, true);
  assert.match(r.listing.entryPath.replace(/\\/g, '/'), /planned_cs64_my-slug\/planned_cs64_my-slug\.md$/);
  assert.match(r.listing.directoryPath, /planned_cs64_my-slug$/);
});

test('findPlannedClickstop: zero matches → error', () => {
  const r = findPlannedClickstop({
    plannedDir: PLANNED,
    csId: 'CS64',
    ...fakeFs({ [PLANNED]: ['planned_cs02_other.md'] }),
  });
  assert.ok(!r.ok);
  assert.match(r.error, /no planned CS64/);
});

test('findPlannedClickstop: two matches → ambiguous error', () => {
  const r = findPlannedClickstop({
    plannedDir: PLANNED,
    csId: 'CS64',
    ...fakeFs(
      { [PLANNED]: ['planned_cs64_one.md', 'planned_cs64_two'] },
      new Set([P(PLANNED, 'planned_cs64_two')])
    ),
  });
  assert.ok(!r.ok);
  assert.match(r.error, /ambiguous: 2 planned CS64/);
});

/* ---------- parseActiveWorkRows + insertActiveWorkRow -------------------- */

const WB_EMPTY = [
  '# Work Board',
  '',
  '## Active Work',
  '',
  '| CS-Task ID | Title | State | Owner | Branch | Last Updated | Blocked Reason |',
  '|------------|-------|-------|-------|--------|--------------|----------------|',
  '| — | no active CS | — | — | — | — | — |',
  '',
  '## Other Section',
  '',
].join('\n');

const WB_WITH_ROW = [
  '# Work Board',
  '',
  '## Active Work',
  '',
  '| CS-Task ID | Title | State | Owner | Branch | Last Updated | Blocked Reason |',
  '|------------|-------|-------|-------|--------|--------------|----------------|',
  '| CS64 | Lifecycle | 🟢 Active | omni-ah | cs64/content | 2026-06-10 | — |',
  '',
  '## Other Section',
  '',
].join('\n');

test('parseActiveWorkRows: skips em-dash placeholder', () => {
  assert.deepEqual(parseActiveWorkRows(WB_EMPTY), []);
});

test('parseActiveWorkRows: returns real rows in order, stops at next H2', () => {
  const rows = parseActiveWorkRows(WB_WITH_ROW);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].cs, 'CS64');
  assert.equal(rows[0].state, '🟢 Active');
  assert.equal(rows[0].owner, 'omni-ah');
});

test('insertActiveWorkRow: replaces em-dash placeholder', () => {
  const { md, mutated } = insertActiveWorkRow({
    workboardMd: WB_EMPTY,
    row: {
      cs: 'CS64',
      title: 'Lifecycle',
      state: '🟢 Active',
      owner: 'omni-ah',
      branch: 'cs64/content',
      lastUpdated: '2026-06-10',
      blocked: '—',
    },
  });
  assert.ok(mutated);
  assert.match(md, /\| CS64 \| Lifecycle \| 🟢 Active \| omni-ah \| cs64\/content \| 2026-06-10 \| — \|/);
  assert.doesNotMatch(md, /\| — \| no active CS/);
});

test('insertActiveWorkRow: appends below existing row when not placeholder', () => {
  const { md, mutated } = insertActiveWorkRow({
    workboardMd: WB_WITH_ROW,
    row: {
      cs: 'CS65',
      title: 'Next',
      state: '🟢 Active',
      owner: 'yoga-ah',
      branch: 'cs65/content',
      lastUpdated: '2026-06-10',
      blocked: '—',
    },
  });
  assert.ok(mutated);
  const rows = parseActiveWorkRows(md);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].cs, 'CS64');
  assert.equal(rows[1].cs, 'CS65');
});

test('insertActiveWorkRow: idempotent — re-inserting same CS row is a no-op', () => {
  const row = {
    cs: 'CS64',
    title: 'Lifecycle',
    state: '🟢 Active',
    owner: 'omni-ah',
    branch: 'cs64/content',
    lastUpdated: '2026-06-10',
    blocked: '—',
  };
  const { md, mutated } = insertActiveWorkRow({ workboardMd: WB_WITH_ROW, row });
  assert.equal(mutated, false);
  assert.equal(md, WB_WITH_ROW);
});

/* ---------- planClaim ---------------------------------------------------- */

function fakeListing(overrides = {}) {
  return {
    entryPath: '/p/planned/planned_cs64_my-slug.md',
    filename: 'planned_cs64_my-slug.md',
    cs: 'CS64',
    slug: 'my-slug',
    directoryForm: false,
    ...overrides,
  };
}

test('planClaim: happy path produces branch, dest, and workboard row', () => {
  const r = planClaim({
    csId: 'CS64',
    listing: fakeListing(),
    workboardMd: WB_EMPTY,
    workboardPath: '/p/WORKBOARD.md',
    plannedDir: '/p/planned',
    activeDir: '/p/active',
    agentId: 'omni-ah',
    title: 'My Title',
    today: '2026-06-10',
  });
  assert.ok(r.ok);
  assert.equal(r.plan.branch, 'cs64/content');
  assert.match(r.plan.destPath, /active_cs64_my-slug\.md$/);
  assert.equal(r.plan.directoryForm, false);
  assert.equal(r.plan.workboardRow.cs, 'CS64');
  assert.equal(r.plan.workboardRow.owner, 'omni-ah');
  assert.equal(r.plan.workboardRow.title, 'My Title');
});

test('planClaim: directory-form listing produces directory dest', () => {
  const r = planClaim({
    csId: 'CS64',
    listing: fakeListing({
      directoryForm: true,
      directoryPath: '/p/planned/planned_cs64_my-slug',
    }),
    workboardMd: WB_EMPTY,
    workboardPath: '/p/WORKBOARD.md',
    plannedDir: '/p/planned',
    activeDir: '/p/active',
    agentId: 'omni-ah',
    title: 'X',
    today: '2026-06-10',
  });
  assert.ok(r.ok);
  assert.equal(r.plan.directoryForm, true);
  assert.match(r.plan.destPath, /active_cs64_my-slug$/);
  assert.doesNotMatch(r.plan.destPath, /\.md$/);
});

test('planClaim: blocked when another orchestrator already owns an Active row', () => {
  const wb = WB_WITH_ROW.replace('cs64/content', 'cs63/content').replace('CS64', 'CS63');
  const r = planClaim({
    csId: 'CS64',
    listing: fakeListing(),
    workboardMd: wb,
    workboardPath: '/p/WORKBOARD.md',
    plannedDir: '/p/planned',
    activeDir: '/p/active',
    agentId: 'yoga-ah',
    title: 'X',
    today: '2026-06-10',
  });
  assert.ok(!r.ok);
  assert.ok(r.errors.some((e) => /another CS is already Active/.test(e)));
});

// Regression: when the same orchestrator owns multiple WORKBOARD rows
// (e.g. a non-Active row from a prior CS plus an in-progress Active row),
// the ownership-conflict error must point at the *Active* row — not the
// first matching row, which can be the wrong CS.
test('planClaim: ownership-conflict error names the Active row, not any owned row', () => {
  const wb = [
    '# Work Board',
    '',
    '## Active Work',
    '',
    '| CS-Task ID | Title | State | Owner | Branch | Last Updated | Blocked Reason |',
    '|------------|-------|-------|-------|--------|--------------|----------------|',
    '| CS60 | Older | 🟡 Blocked | omni-ah | cs60/content | 2026-06-09 | x |',
    '| CS63 | Current | 🟢 Active | omni-ah | cs63/content | 2026-06-10 | — |',
    '',
    '## Other Section',
    '',
  ].join('\n');
  const r = planClaim({
    csId: 'CS64',
    listing: fakeListing(),
    workboardMd: wb,
    workboardPath: '/p/WORKBOARD.md',
    plannedDir: '/p/planned',
    activeDir: '/p/active',
    agentId: 'omni-ah',
    title: 'X',
    today: '2026-06-10',
  });
  assert.ok(!r.ok);
  const msg = r.errors.join('\n');
  assert.match(msg, /already owns an Active CS row in WORKBOARD \(CS63\)/);
  assert.doesNotMatch(msg, /already owns an Active CS row in WORKBOARD \(CS60\)/);
});

test('planClaim: rejects invalid slug', () => {
  const r = planClaim({
    csId: 'CS64',
    listing: fakeListing({ slug: 'NOT VALID' }),
    workboardMd: WB_EMPTY,
    workboardPath: '/p/WORKBOARD.md',
    plannedDir: '/p/planned',
    activeDir: '/p/active',
    agentId: 'omni-ah',
    title: 'X',
  });
  assert.ok(!r.ok);
  assert.ok(r.errors.some((e) => /invalid slug/.test(e)));
});

/* ---------- formatClaimPlan --------------------------------------------- */

test('formatClaimPlan: includes all three steps and the never-commits notice', () => {
  const { plan } = planClaim({
    csId: 'CS64',
    listing: fakeListing(),
    workboardMd: WB_EMPTY,
    workboardPath: '/p/WORKBOARD.md',
    plannedDir: '/p/planned',
    activeDir: '/p/active',
    agentId: 'omni-ah',
    title: 'My Title',
    today: '2026-06-10',
  });
  const out = formatClaimPlan(plan);
  assert.match(out, /harness claim — CS64/);
  assert.match(out, /git checkout -b cs64\/claim/);
  assert.match(out, /git mv .*planned_cs64.* .*active_cs64/);
  assert.match(out, /Insert WORKBOARD ## Active Work row/);
  assert.match(out, /Re-run with --apply/);
  assert.match(out, /Commit is NEVER performed by harness claim/);
});

/* ---------- applyClaimPlan ---------------------------------------------- */

function fakeRunner() {
  const files = new Map();
  files.set('/p/WORKBOARD.md', WB_EMPTY);
  files.set('/p/planned/planned_cs64_my-slug.md', '# planned\n');
  const gitMvCalls = [];
  return {
    files,
    gitMvCalls,
    runner: {
      exists: (p) => files.has(p),
      readFile: (p) => files.get(p),
      writeFile: (p, body) => files.set(p, body),
      gitMv: (src, dest) => {
        gitMvCalls.push([src, dest]);
        if (!files.has(src)) throw new Error('missing src');
        files.set(dest, files.get(src));
        files.delete(src);
      },
    },
  };
}

test('applyClaimPlan: performs git mv + WORKBOARD edit on a clean tree', () => {
  const { plan } = planClaim({
    csId: 'CS64',
    listing: fakeListing(),
    workboardMd: WB_EMPTY,
    workboardPath: '/p/WORKBOARD.md',
    plannedDir: '/p/planned',
    activeDir: '/p/active',
    agentId: 'omni-ah',
    title: 'My Title',
    today: '2026-06-10',
  });
  const { files, gitMvCalls, runner } = fakeRunner();
  const out = applyClaimPlan({ plan, runner });
  assert.equal(out.renamed, true);
  assert.equal(out.workboardEdited, true);
  assert.equal(gitMvCalls.length, 1);
  assert.ok(files.has(plan.destPath));
  assert.ok(!files.has(plan.sourcePath));
  assert.match(files.get('/p/WORKBOARD.md'), /\| CS64 \|/);
});

test('applyClaimPlan: idempotent — repeat run after partial completion only does the remainder', () => {
  const { plan } = planClaim({
    csId: 'CS64',
    listing: fakeListing(),
    workboardMd: WB_EMPTY,
    workboardPath: '/p/WORKBOARD.md',
    plannedDir: '/p/planned',
    activeDir: '/p/active',
    agentId: 'omni-ah',
    title: 'My Title',
    today: '2026-06-10',
  });
  const { runner } = fakeRunner();
  applyClaimPlan({ plan, runner });
  const second = applyClaimPlan({ plan, runner });
  assert.equal(second.renamed, false, 'rename already applied → skip');
  assert.equal(second.workboardEdited, false, 'workboard row already present → skip');
  assert.ok(second.skipped.some((s) => /already applied/.test(s)));
  assert.ok(second.skipped.some((s) => /already present/.test(s)));
});

test('applyClaimPlan: R3 race-aware — uses fresh WORKBOARD content, not the planned snapshot', () => {
  const { plan } = planClaim({
    csId: 'CS64',
    listing: fakeListing(),
    workboardMd: WB_EMPTY,
    workboardPath: '/p/WORKBOARD.md',
    plannedDir: '/p/planned',
    activeDir: '/p/active',
    agentId: 'omni-ah',
    title: 'My Title',
    today: '2026-06-10',
  });
  const { files, runner } = fakeRunner();
  // Simulate sibling clone landing a non-Active CS63 (e.g. Blocked) in the
  // meantime. Sibling row must be preserved alongside our new row; this
  // verifies the freshness-re-read path independent of the apply-time
  // any-other-Active invariant (covered by the dedicated regression below).
  const sibling = insertActiveWorkRow({
    workboardMd: WB_EMPTY,
    row: {
      cs: 'CS63',
      title: 'Sibling',
      state: '🟡 Blocked',
      owner: 'yoga-ah',
      branch: 'cs63/content',
      lastUpdated: '2026-06-10',
      blocked: 'awaiting decision',
    },
  });
  files.set('/p/WORKBOARD.md', sibling.md);
  applyClaimPlan({ plan, runner });
  const finalWb = files.get('/p/WORKBOARD.md');
  const rows = parseActiveWorkRows(finalWb);
  // Sibling's row preserved AND our new row appended.
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => r.cs).sort(),
    ['CS63', 'CS64']
  );
});

test('applyClaimPlan: apply-time race re-check — refuses when this orchestrator gained an Active row between plan and apply', () => {
  const { plan } = planClaim({
    csId: 'CS64',
    listing: fakeListing(),
    workboardMd: WB_EMPTY,
    workboardPath: '/p/WORKBOARD.md',
    plannedDir: '/p/planned',
    activeDir: '/p/active',
    agentId: 'omni-ah',
    title: 'My Title',
    today: '2026-06-10',
  });
  const { files, runner } = fakeRunner();
  // Simulate this same orchestrator's other CLI invocation winning the race
  // and writing CS63 between our preflight and our apply.
  const selfRace = insertActiveWorkRow({
    workboardMd: WB_EMPTY,
    row: {
      cs: 'CS63',
      title: 'Race winner',
      state: '🟢 Active',
      owner: 'omni-ah',
      branch: 'cs63/content',
      lastUpdated: '2026-06-10',
      blocked: '—',
    },
  });
  files.set('/p/WORKBOARD.md', selfRace.md);
  assert.throws(
    () => applyClaimPlan({ plan, runner }),
    /apply-time race.*now owns Active row for CS63/,
  );
  // Nothing was mutated: source file still in place, dest absent, WORKBOARD unchanged.
  assert.ok(files.has('/p/planned/planned_cs64_my-slug.md'));
  assert.ok(!files.has(plan.destPath));
  assert.equal(files.get('/p/WORKBOARD.md'), selfRace.md);
});

// Companion to the self-race regression above: enforce the *global*
// one-CS-at-a-time invariant at apply time. A different orchestrator
// claiming a different CS between plan and apply must still block us;
// otherwise a second Active row slips into WORKBOARD silently.
test('applyClaimPlan: apply-time race re-check — refuses when a DIFFERENT orchestrator gained any Active row between plan and apply', () => {
  const { plan } = planClaim({
    csId: 'CS64',
    listing: fakeListing(),
    workboardMd: WB_EMPTY,
    workboardPath: '/p/WORKBOARD.md',
    plannedDir: '/p/planned',
    activeDir: '/p/active',
    agentId: 'omni-ah',
    title: 'My Title',
    today: '2026-06-10',
  });
  const { files, runner } = fakeRunner();
  const otherRace = insertActiveWorkRow({
    workboardMd: WB_EMPTY,
    row: {
      cs: 'CS63',
      title: 'Race winner',
      state: '🟢 Active',
      owner: 'yoga-ah',
      branch: 'cs63/content',
      lastUpdated: '2026-06-10',
      blocked: '—',
    },
  });
  files.set('/p/WORKBOARD.md', otherRace.md);
  assert.throws(
    () => applyClaimPlan({ plan, runner }),
    /apply-time race: another CS is already Active.*CS63.*owner yoga-ah/,
  );
  assert.ok(files.has('/p/planned/planned_cs64_my-slug.md'));
  assert.ok(!files.has(plan.destPath));
  assert.equal(files.get('/p/WORKBOARD.md'), otherRace.md);
});

test('applyClaimPlan: throws when source is missing and dest is also missing', () => {
  const { plan } = planClaim({
    csId: 'CS64',
    listing: fakeListing(),
    workboardMd: WB_EMPTY,
    workboardPath: '/p/WORKBOARD.md',
    plannedDir: '/p/planned',
    activeDir: '/p/active',
    agentId: 'omni-ah',
    title: 'X',
    today: '2026-06-10',
  });
  const { files, runner } = fakeRunner();
  files.delete('/p/planned/planned_cs64_my-slug.md');
  assert.throws(() => applyClaimPlan({ plan, runner }), /source missing/);
});
