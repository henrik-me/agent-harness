/**
 * tests/lib-claim.test.mjs — unit tests for lib/claim.mjs (CS64 C64-4).
 *
 * Drives the pure logic (find / plan / format / insert / apply) against
 * in-memory fixtures. The runClaimFromDisk idempotent-no-op tests use real
 * filesystem fixtures under `os.tmpdir()` (the early-return path never
 * invokes the git runner, so no git is required). NO real git, NO REPO_ROOT
 * writes (LRN-094 — REPO_ROOT writes race with check-text-encoding's
 * recursive walk under parallel `node --test`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  normalizeCsId,
  slugIsValid,
  findPlannedClickstop,
  findActiveByCsId,
  parseActiveWorkRows,
  insertActiveWorkRow,
  planClaim,
  formatClaimPlan,
  applyClaimPlan,
  runClaimFromDisk,
  reassignActiveWorkRowOwner,
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
    ...fakeFs(
      {
        [PLANNED]: ['planned_cs64_my-slug'],
        [dirPath]: ['planned_cs64_my-slug.md'],
      },
      new Set([dirPath]),
    ),
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
  const twoDir = P(PLANNED, 'planned_cs64_two');
  const r = findPlannedClickstop({
    plannedDir: PLANNED,
    csId: 'CS64',
    ...fakeFs(
      {
        [PLANNED]: ['planned_cs64_one.md', 'planned_cs64_two'],
        [twoDir]: ['planned_cs64_two.md'],
      },
      new Set([twoDir])
    ),
  });
  assert.ok(!r.ok);
  assert.match(r.error, /ambiguous: 2 planned CS64/);
});

/* ---------- findActiveByCsId (C64-4 idempotency helper) ------------------ */

const ACTIVE = P(ROOT, 'active');

test('findActiveByCsId: flat form (active_csNN_<slug>.md)', () => {
  const r = findActiveByCsId({
    activeDir: ACTIVE,
    csId: 'CS64',
    ...fakeFs({ [ACTIVE]: ['active_cs64_my-slug.md', 'active_cs02_other.md'] }),
  });
  assert.ok(r.ok);
  assert.equal(r.listing.cs, 'CS64');
  assert.equal(r.listing.slug, 'my-slug');
  assert.equal(r.listing.directoryForm, false);
  assert.match(r.listing.entryPath, /active_cs64_my-slug\.md$/);
});

test('findActiveByCsId: directory form', () => {
  const dirPath = P(ACTIVE, 'active_cs64_my-slug');
  const r = findActiveByCsId({
    activeDir: ACTIVE,
    csId: 'CS64',
    ...fakeFs(
      {
        [ACTIVE]: ['active_cs64_my-slug'],
        [dirPath]: ['active_cs64_my-slug.md'],
      },
      new Set([dirPath]),
    ),
  });
  assert.ok(r.ok);
  assert.equal(r.listing.directoryForm, true);
  assert.match(r.listing.directoryPath, /active_cs64_my-slug$/);
});

test('findActiveByCsId: zero matches → error', () => {
  const r = findActiveByCsId({
    activeDir: ACTIVE,
    csId: 'CS64',
    ...fakeFs({ [ACTIVE]: [] }),
  });
  assert.ok(!r.ok);
  assert.match(r.error, /no active CS64/);
});

test('findActiveByCsId: missing dir → propagates error (not "no matches")', () => {
  const r = findActiveByCsId({
    activeDir: ACTIVE,
    csId: 'CS64',
    readdir: () => {
      throw new Error('ENOENT');
    },
    isDirectory: () => false,
  });
  assert.ok(!r.ok);
  assert.match(r.error, /cannot read/);
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

test('planClaim: ALLOWED when a DIFFERENT orchestrator owns an Active row (per-orchestrator lock)', () => {
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
  assert.ok(r.ok);
  assert.ok(!(r.errors || []).some((e) => /another CS is already Active/.test(e)));
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
  assert.match(out, /--label workboard-only/);
  assert.match(out, /gh pr create --base main --label workboard-only/);
  assert.match(out, /do NOT add it post-hoc via/);
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

// Companion to the self-race regression above: a DIFFERENT orchestrator
// claiming a different CS between plan and apply must NOT block us — the
// lock is per-orchestrator, so the apply inserts our row beside theirs.
test('applyClaimPlan: ALLOWS apply when a DIFFERENT orchestrator gained an Active row between plan and apply (per-orchestrator lock)', () => {
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
  const res = applyClaimPlan({ plan, runner });
  // Apply succeeds: our CS64 row is inserted beside the different owner's CS63 row.
  assert.equal(res.renamed, true);
  assert.equal(res.workboardEdited, true);
  const finalWb = files.get('/p/WORKBOARD.md');
  assert.match(finalWb, /CS64/);
  assert.match(finalWb, /CS63/);
  const rows = parseActiveWorkRows(finalWb);
  assert.deepEqual(
    rows.map((r) => r.cs).sort(),
    ['CS63', 'CS64'],
  );
  // Rename happened: dest present, source gone (per fakeRunner gitMv semantics).
  assert.ok(files.has(plan.destPath));
  assert.ok(!files.has(plan.sourcePath));
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

/* ---------- findPlannedClickstop: directory-form malformation guard ----- */

test('findPlannedClickstop: directory-form with missing inner main .md is a clean error (Copilot R6)', () => {
  const dirPath = P(PLANNED, 'planned_cs64_my-slug');
  const r = findPlannedClickstop({
    plannedDir: PLANNED,
    csId: 'CS64',
    // Outer dir lists the planned_cs64_my-slug directory; inner readdir
    // returns ONLY sibling artifacts (no main .md).
    ...fakeFs(
      {
        [PLANNED]: ['planned_cs64_my-slug'],
        [dirPath]: ['some-research-notes.md', 'runtime-skill-spike.md'],
      },
      new Set([dirPath]),
    ),
  });
  assert.equal(r.ok, false);
  assert.match(
    r.error,
    /missing its main markdown file/,
    `expected helpful malformed-directory error; got: ${r.error}`,
  );
});

test('findPlannedClickstop: directory-form with present inner main .md still passes', () => {
  const dirPath = P(PLANNED, 'planned_cs64_my-slug');
  const r = findPlannedClickstop({
    plannedDir: PLANNED,
    csId: 'CS64',
    ...fakeFs(
      {
        [PLANNED]: ['planned_cs64_my-slug'],
        [dirPath]: ['planned_cs64_my-slug.md', 'runtime-skill-spike.md'],
      },
      new Set([dirPath]),
    ),
  });
  assert.equal(r.ok, true);
  assert.equal(r.listing.directoryForm, true);
});

test('findPlannedClickstop: directory-form with inner readdir failure surfaces the underlying error (R13 amendment)', () => {
  const dirPath = P(PLANNED, 'planned_cs64_my-slug');
  // Mock readdir throws EACCES on the inner dir. Outer dir read succeeds.
  const readdir = (p) => {
    if (p === PLANNED) return ['planned_cs64_my-slug'];
    if (p === dirPath) {
      const err = new Error('permission denied');
      err.code = 'EACCES';
      throw err;
    }
    return [];
  };
  const r = findPlannedClickstop({
    plannedDir: PLANNED,
    csId: 'CS64',
    readdir,
    isDirectory: (p) => p === dirPath,
  });
  assert.equal(r.ok, false);
  assert.match(
    r.error,
    /cannot read planned directory.*permission denied/,
    `expected error to surface underlying I/O failure; got: ${r.error}`,
  );
  // Must NOT mislead the user into thinking the .md is missing.
  assert.doesNotMatch(r.error, /missing its main markdown file/);
});

/* ---------- runClaimFromDisk idempotency (C64-4) ------------------------- */

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

/**
 * Build a minimal tmpdir fixture with an active CS file already in place,
 * mimicking a post-claim-merged tree. No .git, no WORKBOARD.md needed —
 * runClaimFromDisk's idempotent early-return runs BEFORE the git/workboard
 * preflights so a fresh checkout with only the active file is enough.
 *
 * tmpdir parent per LRN-094 — never write under REPO_ROOT (races with the
 * recursive linters under parallel `node --test`).
 */
function mkAlreadyActiveTree(csId, slug) {
  const root = mkdtempSync(path.join(tmpdir(), 'claim-idemp-'));
  const activeDir = path.join(root, 'project', 'clickstops', 'active');
  mkdirSync(activeDir, { recursive: true });
  const num = csId.replace(/^CS/i, '').toLowerCase();
  const filename = `active_cs${num}_${slug}.md`;
  writeFileSync(path.join(activeDir, filename), `# ${csId} — ${slug}\n\nplaceholder\n`);
  return { root, filename };
}

test('runClaimFromDisk: idempotent when CS already active (post-claim-merge re-run)', () => {
  const { root, filename } = mkAlreadyActiveTree('CS64', 'lifecycle');
  try {
    const result = runClaimFromDisk({
      cwd: root,
      csId: 'CS64',
      agentId: 'test-agent',
      harnessBin: 'unused',
      apply: false,
      skipHarvest: true,
    });
    assert.equal(result.ok, true);
    assert.equal(result.alreadyClaimed, true);
    assert.equal(result.activeListing.filename, filename);
    assert.match(result.message, /CS64 is already claimed/);
    assert.ok(result.message.includes(filename));
    // Must NOT include a plan or apply result for the idempotent path.
    assert.equal(result.plan, undefined);
    assert.equal(result.apply, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runClaimFromDisk: idempotent path supports directory-form active CS', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'claim-idemp-dir-'));
  try {
    const dirName = 'active_cs64_dir-form';
    const dirPath = path.join(root, 'project', 'clickstops', 'active', dirName);
    mkdirSync(dirPath, { recursive: true });
    writeFileSync(path.join(dirPath, `${dirName}.md`), '# CS64\n');
    const result = runClaimFromDisk({
      cwd: root,
      csId: 'CS64',
      agentId: 'test-agent',
      harnessBin: 'unused',
      apply: false,
      skipHarvest: true,
    });
    assert.equal(result.ok, true);
    assert.equal(result.alreadyClaimed, true);
    assert.equal(result.activeListing.directoryForm, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runClaimFromDisk: alreadyClaimed succeeds when WORKBOARD row is consistent', () => {
  const { root, filename } = mkAlreadyActiveTree('CS64', 'lifecycle');
  try {
    // Add a consistent WORKBOARD.md with the matching Active Work row.
    const wb = [
      '# Work Board',
      '',
      '## Active Work',
      '',
      '| CS-Task ID | Title | State | Owner | Branch | Last Updated | Blocked Reason |',
      '|------------|-------|-------|-------|--------|--------------|----------------|',
      '| CS64 | Lifecycle | 🟢 Active | test-agent | cs64/content | 2026-06-10 | — |',
      '',
    ].join('\n');
    writeFileSync(path.join(root, 'WORKBOARD.md'), wb);
    const result = runClaimFromDisk({
      cwd: root,
      csId: 'CS64',
      agentId: 'test-agent',
      harnessBin: 'unused',
      apply: false,
      skipHarvest: true,
    });
    assert.equal(result.ok, true, `expected ok=true; got ${JSON.stringify(result)}`);
    assert.equal(result.alreadyClaimed, true);
    assert.equal(result.activeListing.filename, filename);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runClaimFromDisk: alreadyActive but WORKBOARD row missing → partial-state error', () => {
  // R1 reviewer (gpt-5.5): active file present but row absent must surface,
  // not be masked as a no-op.
  const { root } = mkAlreadyActiveTree('CS64', 'lifecycle');
  try {
    const wbNoRow = [
      '# Work Board',
      '',
      '## Active Work',
      '',
      '| CS-Task ID | Title | State | Owner | Branch | Last Updated | Blocked Reason |',
      '|------------|-------|-------|-------|--------|--------------|----------------|',
      '| — | no active CS | — | — | — | — | — |',
      '',
    ].join('\n');
    writeFileSync(path.join(root, 'WORKBOARD.md'), wbNoRow);
    const result = runClaimFromDisk({
      cwd: root,
      csId: 'CS64',
      agentId: 'test-agent',
      harnessBin: 'unused',
      apply: false,
      skipHarvest: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.alreadyClaimed, undefined);
    assert.ok(result.errors.some((e) => /partial claim state/.test(e)));
    assert.ok(result.errors.some((e) => /no Active Work row/.test(e)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runClaimFromDisk: alreadyActive CS64 with only sibling CS64b row → partial-state (R2 boundary)', () => {
  // R2 reviewer (gpt-5.5): startsWith match would have incorrectly accepted
  // a CS64b row as satisfying the CS64 consistency check. Exact-or-subtask
  // boundary keeps CS64 and CS64b cleanly distinct.
  const { root } = mkAlreadyActiveTree('CS64', 'lifecycle');
  try {
    const wbWrongRow = [
      '# Work Board',
      '',
      '## Active Work',
      '',
      '| CS-Task ID | Title | State | Owner | Branch | Last Updated | Blocked Reason |',
      '|------------|-------|-------|-------|--------|--------------|----------------|',
      '| CS64b | verb reliability | 🟢 Active | a | b | c | — |',
      '',
    ].join('\n');
    writeFileSync(path.join(root, 'WORKBOARD.md'), wbWrongRow);
    const result = runClaimFromDisk({
      cwd: root,
      csId: 'CS64',
      agentId: 'test-agent',
      harnessBin: 'unused',
      apply: false,
      skipHarvest: true,
    });
    assert.equal(result.ok, false, `expected partial-state error; got ${JSON.stringify(result)}`);
    assert.equal(result.alreadyClaimed, undefined);
    assert.ok(result.errors.some((e) => /partial claim state/.test(e)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('findActiveByCsId: directory form missing inner .md → malformed error (not silent accept)', () => {
  // R1 reviewer (gpt-5.5): directory-form idempotency must guard against
  // half-populated active_csNN_<slug>/ without its main markdown.
  const dirPath = P(ACTIVE, 'active_cs64_my-slug');
  const r = findActiveByCsId({
    activeDir: ACTIVE,
    csId: 'CS64',
    ...fakeFs(
      {
        [ACTIVE]: ['active_cs64_my-slug'],
        [dirPath]: ['notes.md'], // missing canonical active_cs64_my-slug.md
      },
      new Set([dirPath]),
    ),
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /missing its main markdown file/);
  assert.match(r.error, /malformed/);
});

/* ---------- Copilot reviewer (PR #299 round 2) regression tests ---------- */

test('runClaimFromDisk: ambiguous active CS surfaces verbatim (does NOT fall through to planned flow)', () => {
  // Copilot reviewer on PR #299 round 2: when findActiveByCsId returns an
  // ambiguous/malformed/I-O error, runClaimFromDisk must surface it rather
  // than silently treating it as "not yet claimed" and erroring downstream
  // with "no planned CS<NN>".
  const root = mkdtempSync(path.join(tmpdir(), 'claim-ambig-'));
  try {
    const activeDir = path.join(root, 'project', 'clickstops', 'active');
    mkdirSync(activeDir, { recursive: true });
    writeFileSync(path.join(activeDir, 'active_cs64_one.md'), '# CS64\n');
    writeFileSync(path.join(activeDir, 'active_cs64_two.md'), '# CS64 dup\n');
    const result = runClaimFromDisk({
      cwd: root,
      csId: 'CS64',
      agentId: 'test-agent',
      harnessBin: 'unused',
      apply: false,
      skipHarvest: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.alreadyClaimed, undefined);
    assert.ok(result.errors.some((e) => /ambiguous/.test(e)),
      `expected ambiguous error, got ${JSON.stringify(result.errors)}`);
    // Critically: must NOT be the "no planned" error from the fall-through path.
    assert.ok(!result.errors.some((e) => /no planned/.test(e)),
      'must not mask ambiguous-active state with no-planned error');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runClaimFromDisk: malformed active directory surfaces verbatim (does NOT fall through)', () => {
  // Copilot reviewer on PR #299 round 2: companion to the ambiguous test.
  const root = mkdtempSync(path.join(tmpdir(), 'claim-malformed-'));
  try {
    const dirName = 'active_cs64_dirform';
    const dirPath = path.join(root, 'project', 'clickstops', 'active', dirName);
    mkdirSync(dirPath, { recursive: true });
    // Intentionally do NOT create the inner ${dirName}.md → malformed.
    const result = runClaimFromDisk({
      cwd: root,
      csId: 'CS64',
      agentId: 'test-agent',
      harnessBin: 'unused',
      apply: false,
      skipHarvest: true,
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /malformed/.test(e)),
      `expected malformed error, got ${JSON.stringify(result.errors)}`);
    assert.ok(!result.errors.some((e) => /no planned/.test(e)),
      'must not mask malformed-active state with no-planned error');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runClaimFromDisk: alreadyClaimed message points to project/clickstops/planned/planned_csNN_ path', () => {
  // Copilot reviewer on PR #299 round 2: the no-op message previously hinted
  // at planned/${id}_<slug>.md which is the wrong path. Real planned CSs live
  // under project/clickstops/planned/planned_csNN_<slug>.md.
  const { root } = mkAlreadyActiveTree('CS64', 'lifecycle');
  try {
    // Add a consistent WORKBOARD row so we land on the success path.
    const wb = [
      '# Work Board',
      '',
      '## Active Work',
      '',
      '| CS-Task ID | Title | State | Owner | Branch | Last Updated | Blocked Reason |',
      '|------------|-------|-------|-------|--------|--------------|----------------|',
      '| CS64 | lifecycle | 🟢 Active | test-agent | b | c | — |',
      '',
    ].join('\n');
    writeFileSync(path.join(root, 'WORKBOARD.md'), wb);
    const result = runClaimFromDisk({
      cwd: root,
      csId: 'CS64',
      agentId: 'test-agent',
      harnessBin: 'unused',
      apply: false,
      skipHarvest: true,
    });
    assert.equal(result.ok, true);
    assert.equal(result.alreadyClaimed, true);
    assert.match(result.message, /project\/clickstops\/planned\/planned_cs64_/,
      `message should reference the correct planned path; got: ${result.message}`);
    assert.ok(!result.message.includes('planned/cs64_'),
      `message must not use the old (wrong) planned/cs64_<slug>.md hint; got: ${result.message}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runClaimFromDisk: alreadyActive + WORKBOARD.md missing => clean no-op (fresh checkout)', () => {
  // Copilot reviewer on PR #299 round 3 (symmetric claim-side fix):
  // missing-file is acceptable; readError is not (covered separately by the
  // closeout-side regression test for the same activeWorkRowExists helper).
  const { root, filename } = mkAlreadyActiveTree('CS64', 'lifecycle');
  try {
    // Intentionally do NOT create WORKBOARD.md.
    const result = runClaimFromDisk({
      cwd: root,
      csId: 'CS64',
      agentId: 'test-agent',
      harnessBin: 'unused',
      apply: false,
      skipHarvest: true,
    });
    assert.equal(result.ok, true, `expected no-op success; got ${JSON.stringify(result)}`);
    assert.equal(result.alreadyClaimed, true);
    assert.equal(result.activeListing.filename, filename);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('runClaimFromDisk: alreadyActive + unreadable WORKBOARD (path is a directory) => hard error', () => {
  // R7 rubber-duck (gpt-5.5): symmetric regression for Copilot R3 finding 1
  // on the claim idempotency branch. Previously an unreadable WORKBOARD was
  // silently treated as "row absent" via a bare try/catch that nulled
  // workboardMd and fell through to the no-op path. Now must surface as a
  // hard error citing the read failure.
  const { root } = mkAlreadyActiveTree('CS64', 'lifecycle');
  try {
    mkdirSync(path.join(root, 'WORKBOARD.md')); // unreadable
    const result = runClaimFromDisk({
      cwd: root,
      csId: 'CS64',
      agentId: 'test-agent',
      harnessBin: 'unused',
      apply: false,
      skipHarvest: true,
    });
    assert.equal(result.ok, false, `expected ok:false; got ${JSON.stringify(result)}`);
    assert.equal(result.alreadyClaimed, undefined);
    assert.ok(result.errors.some((e) => /cannot read WORKBOARD\.md/.test(e)),
      `expected "cannot read WORKBOARD.md" error; got ${JSON.stringify(result.errors)}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- CS95 (#417): already-active ownership gate + --takeover ---------------

/** WORKBOARD.md with a single Active Work row for `cs` owned by `owner`. */
function workboardWith(cs, owner, branch = `${cs.toLowerCase()}/content`) {
  return [
    '# Work Board',
    '',
    '## Active Work',
    '',
    '| CS-Task ID | Title | State | Owner | Branch | Last Updated | Blocked Reason |',
    '|------------|-------|-------|-------|--------|--------------|----------------|',
    `| ${cs} | Work | 🟢 Active | ${owner} | ${branch} | 2026-07-03 | — |`,
    '',
  ].join('\n');
}

test('runClaimFromDisk: refuses an already-active CS owned by a different agent-id (#417)', () => {
  const { root } = mkAlreadyActiveTree('CS10', 'entitlements');
  try {
    writeFileSync(path.join(root, 'WORKBOARD.md'), workboardWith('CS10', 'yoga-ae'));
    const result = runClaimFromDisk({
      cwd: root, csId: 'CS10', agentId: 'yoga-ae-c3', harnessBin: 'unused', apply: false, skipHarvest: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.alreadyClaimed, undefined);
    assert.ok(result.errors.some((e) => /owned by a DIFFERENT orchestrator/.test(e)));
    assert.ok(result.errors.some((e) => /owner=yoga-ae/.test(e) && /you=yoga-ae-c3/.test(e)));
    assert.ok(result.errors.some((e) => /--takeover/.test(e)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runClaimFromDisk: owner-match (incl. exact suffix) still returns the alreadyClaimed no-op', () => {
  const { root, filename } = mkAlreadyActiveTree('CS10', 'entitlements');
  try {
    writeFileSync(path.join(root, 'WORKBOARD.md'), workboardWith('CS10', 'yoga-ae-c3'));
    const result = runClaimFromDisk({
      cwd: root, csId: 'CS10', agentId: 'yoga-ae-c3', harnessBin: 'unused', apply: false, skipHarvest: true,
    });
    assert.equal(result.ok, true);
    assert.equal(result.alreadyClaimed, true);
    assert.equal(result.activeListing.filename, filename);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runClaimFromDisk: --takeover dry-run previews the reassignment and does NOT mutate WORKBOARD', () => {
  const { root } = mkAlreadyActiveTree('CS10', 'entitlements');
  try {
    const wbPath = path.join(root, 'WORKBOARD.md');
    writeFileSync(wbPath, workboardWith('CS10', 'yoga-ae'));
    const before = readFileSync(wbPath, 'utf8');
    const result = runClaimFromDisk({
      cwd: root, csId: 'CS10', agentId: 'yoga-ae-c3', harnessBin: 'unused', apply: false, takeover: true, skipHarvest: true,
    });
    assert.equal(result.ok, true);
    assert.equal(result.takeover, true);
    assert.equal(result.dryRun, true);
    assert.match(result.message, /Would take over CS10 from yoga-ae/);
    assert.equal(readFileSync(wbPath, 'utf8'), before, 'dry-run must not mutate WORKBOARD.md');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runClaimFromDisk: --takeover --apply reassigns the WORKBOARD Owner to the current agent-id', () => {
  const { root } = mkAlreadyActiveTree('CS10', 'entitlements');
  try {
    const wbPath = path.join(root, 'WORKBOARD.md');
    writeFileSync(wbPath, workboardWith('CS10', 'yoga-ae'));
    const result = runClaimFromDisk({
      cwd: root, csId: 'CS10', agentId: 'yoga-ae-c3', harnessBin: 'unused', apply: true, takeover: true, skipHarvest: true,
      runnerFactory: () => ({ worktreeClean: () => true }),
    });
    assert.equal(result.ok, true);
    assert.equal(result.takeover, true);
    assert.equal(result.dryRun, undefined);
    const rows = parseActiveWorkRows(readFileSync(wbPath, 'utf8'));
    const row = rows.find((r) => r.cs === 'CS10');
    assert.equal(row.owner, 'yoga-ae-c3'); // reassigned
    assert.equal(row.branch, 'cs10/content'); // preserved (same work continues)
    assert.match(row.lastUpdated, /^\d{4}-\d{2}-\d{2}$/); // stamped
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runClaimFromDisk: --takeover --apply refuses on a dirty worktree, leaving WORKBOARD unchanged', () => {
  const { root } = mkAlreadyActiveTree('CS10', 'entitlements');
  try {
    const wbPath = path.join(root, 'WORKBOARD.md');
    writeFileSync(wbPath, workboardWith('CS10', 'yoga-ae'));
    const before = readFileSync(wbPath, 'utf8');
    const result = runClaimFromDisk({
      cwd: root, csId: 'CS10', agentId: 'yoga-ae-c3', harnessBin: 'unused', apply: true, takeover: true, skipHarvest: true,
      runnerFactory: () => ({ worktreeClean: () => false }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.takeover, undefined);
    assert.ok(result.errors.some((e) => /requires a clean worktree/.test(e)));
    assert.equal(readFileSync(wbPath, 'utf8'), before, 'refusal must not mutate WORKBOARD.md');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('reassignActiveWorkRowOwner: updates only the target row Owner + Last Updated', () => {
  const wb = [
    '## Active Work',
    '',
    '| CS-Task ID | Title | State | Owner | Branch | Last Updated | Blocked Reason |',
    '|---|---|---|---|---|---|---|',
    '| CS10 | A | 🟢 Active | yoga-ae | cs10/content | 2026-07-01 | — |',
    '| CS20 | B | 🟢 Active | omni-ah | cs20/content | 2026-07-02 | — |',
    '',
  ].join('\n');
  const { md, mutated } = reassignActiveWorkRowOwner({
    workboardMd: wb, csId: 'CS10', newOwner: 'yoga-ae-c3', lastUpdated: '2026-07-03',
  });
  assert.equal(mutated, true);
  const rows = parseActiveWorkRows(md);
  assert.equal(rows.find((r) => r.cs === 'CS10').owner, 'yoga-ae-c3');
  assert.equal(rows.find((r) => r.cs === 'CS10').lastUpdated, '2026-07-03');
  assert.equal(rows.find((r) => r.cs === 'CS20').owner, 'omni-ah'); // untouched
  assert.equal(rows.find((r) => r.cs === 'CS20').lastUpdated, '2026-07-02');
});

test('reassignActiveWorkRowOwner: no matching row → mutated:false, text unchanged', () => {
  const wb = workboardWith('CS10', 'yoga-ae');
  const { md, mutated } = reassignActiveWorkRowOwner({
    workboardMd: wb, csId: 'CS99', newOwner: 'x', lastUpdated: '2026-07-03',
  });
  assert.equal(mutated, false);
  assert.equal(md, wb);
});