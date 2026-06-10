/**
 * tests/lib-status.test.mjs — unit tests for lib/status.mjs (CS64 C64-7).
 *
 * Pure-function tests where possible. The disk-reading wrapper test creates
 * a temporary repo skeleton under os.tmpdir() (per LRN-094 / test-hygiene
 * convention) and tears it down after each test.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  parseActiveWorkRows,
  listClickstops,
  getStatusSnapshot,
  formatStatusReport,
  getStatusSnapshotFromDisk,
} from '../lib/status.mjs';

const EMPTY_WORKBOARD = [
  '# Work Board',
  '',
  '## Active Work',
  '',
  '| CS-Task ID | Title | State | Owner | Branch | Last Updated | Blocked Reason |',
  '|------------|-------|-------|-------|--------|--------------|----------------|',
  '| — | no active CS | — | — | — | — | — |',
  '',
].join('\n');

const ONE_ROW_WORKBOARD = [
  '# Work Board',
  '',
  '## Active Work',
  '',
  '<!-- comment between heading and table -->',
  '',
  '| CS-Task ID | Title | State | Owner | Branch | Last Updated | Blocked Reason |',
  '|------------|-------|-------|-------|--------|--------------|----------------|',
  '| CS64 | Lifecycle verbs | 🟢 Active | omni-ah | cs64/content | 2026-06-10 | — |',
  '',
  '> Note.',
].join('\n');

const TWO_ROW_WORKBOARD = [
  '## Active Work',
  '',
  '| CS-Task ID | Title | State | Owner | Branch | Last Updated | Blocked Reason |',
  '|------------|-------|-------|-------|--------|--------------|----------------|',
  '| CS64 | Lifecycle verbs | 🟢 Active | omni-ah | cs64/content | 2026-06-10 | — |',
  '| CS70 | Cut v0.7.0 | 🟡 Blocked | yoga-ah | cs70/content | 2026-06-08 | waiting on review |',
  '',
].join('\n');

test('parseActiveWorkRows: empty placeholder produces zero rows', () => {
  assert.deepEqual(parseActiveWorkRows(EMPTY_WORKBOARD), []);
});

test('parseActiveWorkRows: one populated row is returned with all cells', () => {
  const rows = parseActiveWorkRows(ONE_ROW_WORKBOARD);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    csTaskId: 'CS64',
    title: 'Lifecycle verbs',
    state: '🟢 Active',
    owner: 'omni-ah',
    branch: 'cs64/content',
    lastUpdated: '2026-06-10',
    blockedReason: '—',
  });
});

test('parseActiveWorkRows: multiple rows preserved in source order', () => {
  const rows = parseActiveWorkRows(TWO_ROW_WORKBOARD);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].csTaskId, 'CS64');
  assert.equal(rows[1].csTaskId, 'CS70');
  assert.equal(rows[1].state, '🟡 Blocked');
  assert.equal(rows[1].blockedReason, 'waiting on review');
});

test('parseActiveWorkRows: returns [] when ## Active Work heading is absent', () => {
  assert.deepEqual(parseActiveWorkRows('# Work Board\n\nNo active section.\n'), []);
});

test('parseActiveWorkRows: returns [] when the table header is missing', () => {
  assert.deepEqual(parseActiveWorkRows('## Active Work\n\n_(none)_\n'), []);
});

test('parseActiveWorkRows: rejects non-string input', () => {
  assert.throws(() => parseActiveWorkRows(undefined), /must be a string/);
});

test('parseActiveWorkRows: stops at the next H2 heading', () => {
  const md = [
    '## Active Work',
    '',
    '| CS-Task ID | Title | State | Owner | Branch | Last Updated | Blocked Reason |',
    '|------------|-------|-------|-------|--------|--------------|----------------|',
    '| CS64 | Lifecycle verbs | 🟢 Active | omni-ah | cs64/content | 2026-06-10 | — |',
    '',
    '## Other section',
    '',
    '| CS-Task ID | Title | State | Owner | Branch | Last Updated | Blocked Reason |',
    '|------------|-------|-------|-------|--------|--------------|----------------|',
    '| CSXX | Wrong table | x | x | x | x | x |',
    '',
  ].join('\n');
  const rows = parseActiveWorkRows(md);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].csTaskId, 'CS64');
});

function makeTempRepo() {
  const root = mkdtempSync(path.join(tmpdir(), 'harness-status-'));
  mkdirSync(path.join(root, 'project', 'clickstops', 'planned'), { recursive: true });
  mkdirSync(path.join(root, 'project', 'clickstops', 'active'), { recursive: true });
  mkdirSync(path.join(root, 'project', 'clickstops', 'done'), { recursive: true });
  return root;
}

test('listClickstops: enumerates flat planned and active files', () => {
  const root = makeTempRepo();
  try {
    writeFileSync(
      path.join(root, 'project', 'clickstops', 'planned', 'planned_cs65_process-doc-right-sizing.md'),
      '# CS65\n'
    );
    writeFileSync(
      path.join(root, 'project', 'clickstops', 'planned', 'planned_cs22b_multi-orchestrator.md'),
      '# CS22b\n'
    );
    writeFileSync(
      path.join(root, 'project', 'clickstops', 'active', 'active_cs64_lifecycle-command-skill-surface.md'),
      '# CS64\n'
    );
    const { planned, active } = listClickstops(path.join(root, 'project', 'clickstops'));
    assert.equal(planned.length, 2);
    assert.equal(active.length, 1);
    // Numeric-aware sort: CS22b < CS65.
    assert.equal(planned[0].cs, 'CS22b');
    assert.equal(planned[1].cs, 'CS65');
    assert.equal(active[0].cs, 'CS64');
    assert.equal(active[0].directoryForm, false);
    assert.equal(active[0].entry, 'active/active_cs64_lifecycle-command-skill-surface.md');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('listClickstops: enumerates directory-form active CS', () => {
  const root = makeTempRepo();
  try {
    const dirName = 'active_cs64_lifecycle-command-skill-surface';
    const dir = path.join(root, 'project', 'clickstops', 'active', dirName);
    mkdirSync(dir);
    writeFileSync(path.join(dir, `${dirName}.md`), '# CS64\n');
    writeFileSync(path.join(dir, 'skill-spike-proposal.md'), '# spike\n');
    const { active } = listClickstops(path.join(root, 'project', 'clickstops'));
    assert.equal(active.length, 1);
    assert.equal(active[0].cs, 'CS64');
    assert.equal(active[0].directoryForm, true);
    assert.equal(active[0].entry, `active/${dirName}/${dirName}.md`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('listClickstops: silently skips .gitkeep and non-matching names', () => {
  const root = makeTempRepo();
  try {
    writeFileSync(path.join(root, 'project', 'clickstops', 'planned', '.gitkeep'), '');
    writeFileSync(path.join(root, 'project', 'clickstops', 'planned', 'README.md'), 'noise');
    writeFileSync(path.join(root, 'project', 'clickstops', 'planned', 'planned_cs64_x.md'), '');
    const { planned } = listClickstops(path.join(root, 'project', 'clickstops'));
    assert.equal(planned.length, 1);
    assert.equal(planned[0].cs, 'CS64');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('listClickstops: tolerates missing stage directories', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'harness-status-'));
  try {
    const { planned, active } = listClickstops(path.join(root, 'project', 'clickstops'));
    assert.deepEqual(planned, []);
    assert.deepEqual(active, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('getStatusSnapshot: composes counts and propagates agentId', () => {
  const s = getStatusSnapshot({
    workboardMd: ONE_ROW_WORKBOARD,
    plannedListings: [
      { stage: 'planned', cs: 'CS65', slug: 'x', entry: 'planned/planned_cs65_x.md', directoryForm: false },
    ],
    activeListings: [
      { stage: 'active', cs: 'CS64', slug: 'y', entry: 'active/active_cs64_y/active_cs64_y.md', directoryForm: true },
    ],
    agentId: 'omni-ah',
  });
  assert.equal(s.agentId, 'omni-ah');
  assert.equal(s.activeWorkRows.length, 1);
  assert.deepEqual(s.counts, { activeWorkRows: 1, planned: 1, active: 1 });
});

test('formatStatusReport: empty state shows "(none …)" markers for every section', () => {
  const out = formatStatusReport(getStatusSnapshot({ workboardMd: EMPTY_WORKBOARD }));
  assert.match(out, /harness status — agent \(unknown\)/);
  assert.match(out, /Active Work \(0\):\s*\n\s*\(none — WORKBOARD Active Work table is empty\)/);
  assert.match(out, /On-disk active \(0\):\s*\n\s*\(none — project\/clickstops\/active is empty\)/);
  assert.match(out, /Planned queue \(0\):\s*\n\s*\(none — project\/clickstops\/planned is empty\)/);
  assert.ok(out.endsWith('\n'));
});

test('formatStatusReport: populated state lists CSs in numeric order', () => {
  const out = formatStatusReport({
    activeWorkRows: parseActiveWorkRows(ONE_ROW_WORKBOARD),
    plannedListings: [
      { stage: 'planned', cs: 'CS22b', slug: 'multi', entry: 'planned/planned_cs22b_multi.md', directoryForm: false },
      { stage: 'planned', cs: 'CS65', slug: 'sizing', entry: 'planned/planned_cs65_sizing.md', directoryForm: false },
    ],
    activeListings: [
      { stage: 'active', cs: 'CS64', slug: 'verbs', entry: 'active/active_cs64_verbs/active_cs64_verbs.md', directoryForm: true },
    ],
    agentId: 'omni-ah',
    counts: { activeWorkRows: 1, planned: 2, active: 1 },
  });
  assert.match(out, /harness status — agent omni-ah/);
  assert.match(out, /CS64: Lifecycle verbs \[🟢 Active\] owner=omni-ah branch=cs64\/content/);
  assert.match(out, /CS64 — verbs \[dir\] → active\/active_cs64_verbs\/active_cs64_verbs\.md/);
  assert.match(out, /CS22b — multi/);
  assert.match(out, /CS65 — sizing/);
});

test('getStatusSnapshotFromDisk: reads WORKBOARD + clickstops folder from a tmp repo', () => {
  const root = makeTempRepo();
  try {
    writeFileSync(path.join(root, 'WORKBOARD.md'), ONE_ROW_WORKBOARD);
    writeFileSync(
      path.join(root, 'project', 'clickstops', 'planned', 'planned_cs65_process-doc-right-sizing.md'),
      '# CS65\n'
    );
    const dirName = 'active_cs64_lifecycle-command-skill-surface';
    mkdirSync(path.join(root, 'project', 'clickstops', 'active', dirName));
    writeFileSync(
      path.join(root, 'project', 'clickstops', 'active', dirName, `${dirName}.md`),
      '# CS64\n'
    );

    const s = getStatusSnapshotFromDisk({ cwd: root, agentId: 'omni-ah' });
    assert.equal(s.agentId, 'omni-ah');
    assert.equal(s.activeWorkRows.length, 1);
    assert.equal(s.plannedListings.length, 1);
    assert.equal(s.activeListings.length, 1);
    assert.equal(s.activeListings[0].directoryForm, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('getStatusSnapshotFromDisk: tolerates missing WORKBOARD.md', () => {
  const root = makeTempRepo();
  try {
    const s = getStatusSnapshotFromDisk({ cwd: root, agentId: null });
    assert.deepEqual(s.activeWorkRows, []);
    assert.equal(s.counts.activeWorkRows, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
