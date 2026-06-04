// tests/cs27-workboard-active-row-detector.test.mjs — CS27 Finding #7.
//
// The `workboardHasActiveRows` detector in lib/sync.mjs drives the sync
// "Syncing mid-CS may cause process-shape changes mid-flight" warning. Before
// CS27 it returned true for ANY non-header pipe row in the Active Work table,
// including the canonical em-dash placeholder seed row — a false positive on a
// freshly-init'd consumer that has no active CS (Finding #7).
//
// Decision C27-1: a row counts as active only when (a) CS-Task ID is
// non-placeholder, (b) State is non-placeholder, and (c) at least one of
// {Owner, Branch} is non-placeholder. These fixtures pin that predicate.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { workboardHasActiveRows } from '../lib/sync.mjs';

const HEADER = [
  '## Active Work',
  '',
  '| CS-Task ID | Title | State | Owner | Branch | Last Updated | Blocked Reason |',
  '|------------|-------|-------|-------|--------|--------------|----------------|',
];

const TRAILER = [
  '',
  '> **Note:** WORKBOARD shows live coordination state only.',
];

function workboard(rows) {
  return [...HEADER, ...rows, ...TRAILER].join('\n') + '\n';
}

test('CS27 Finding #7: header-only seed (no data rows) reports NO active rows', () => {
  assert.equal(workboardHasActiveRows(workboard([])), false);
});

test('CS27 Finding #7: em-dash placeholder seed row reports NO active rows', () => {
  const row = '| — | no active CS — populate when claiming | — | — | — | _(set on claim)_ | _(none)_ |';
  assert.equal(workboardHasActiveRows(workboard([row])), false);
});

test('CS27 Finding #7: a real active row reports exactly one active row', () => {
  const row = '| CS27 | lint detector tightening | 🟢 Active | yoga-ah | cs27/lint-detector-tightening | 2026-06-04 | — |';
  assert.equal(workboardHasActiveRows(workboard([row])), true);
});

test('CS27 Finding #7: mix of placeholder + real row reports active (the real one)', () => {
  const placeholder = '| — | no active CS — populate when claiming | — | — | — | _(set on claim)_ | _(none)_ |';
  const real = '| CS27 | lint detector tightening | 🟢 Active | yoga-ah | cs27/lint-detector-tightening | 2026-06-04 | — |';
  assert.equal(workboardHasActiveRows(workboard([placeholder, real])), true);
});

test('CS27 Finding #7: concrete State but placeholder CS-Task ID is ignored (C27-1 edge)', () => {
  const row = '| — | malformed | 🟢 Active | — | — | 2026-06-04 | — |';
  assert.equal(workboardHasActiveRows(workboard([row])), false);
});

test('CS27 Finding #7: concrete ID + State but placeholder Owner AND Branch is ignored (needs Owner OR Branch)', () => {
  const row = '| CS99 | t | 🟢 Active | — | — | 2026-06-04 | — |';
  assert.equal(workboardHasActiveRows(workboard([row])), false);
});

test('CS27 Finding #7: concrete ID + State + Branch (Owner placeholder) is active', () => {
  const row = '| CS99 | t | 🟢 Active | — | cs99/slug | 2026-06-04 | — |';
  assert.equal(workboardHasActiveRows(workboard([row])), true);
});

test('CS27 Finding #7: rows outside the Active Work section are ignored', () => {
  const content = [
    '## Orchestrators',
    '',
    '| Agent ID | Machine | Repo Folder | Status | Last Seen |',
    '|----------|---------|-------------|--------|-----------|',
    '| yoga-ah | host | /path | 🟢 Active | now |',
    '',
    '## Active Work',
    '',
    '| CS-Task ID | Title | State | Owner | Branch | Last Updated | Blocked Reason |',
    '|------------|-------|-------|-------|--------|--------------|----------------|',
    '',
  ].join('\n') + '\n';
  assert.equal(workboardHasActiveRows(content), false);
});

test('CS27 Finding #7: a narrow (<5-column) Active Work row is treated as malformed and ignored', () => {
  // The canonical Active Work schema is 7 columns; a legacy/narrow 3-column row
  // lacks Owner/Branch entirely and is intentionally not treated as active —
  // documents the cells.length<5 cutoff so it is a deliberate contract, not a
  // silent regression.
  const row = '| CS42 | My Task | 🟢 Active |';
  assert.equal(workboardHasActiveRows(workboard([row])), false);
});

test('CS27 Finding #7: every documented placeholder token blocks an otherwise-active row', () => {
  // isPlaceholderWorkboardCell contract: empty / hyphen-dash family / parenthesised
  // (optionally italic|bold) / none|n/a|tbd are all placeholders. Put each token
  // in the CS-Task ID column (with concrete State+Owner) and assert NOT active.
  for (const token of ['', '-', '–', '—', '_(set on claim)_', '*(none)*', '(none)', 'none', 'N/A', 'tbd']) {
    const row = `| ${token} | Title | 🟢 Active | yoga-ah | cs/x | 2026-06-04 | — |`;
    assert.equal(
      workboardHasActiveRows(workboard([row])),
      false,
      `placeholder token ${JSON.stringify(token)} in CS-Task ID should not count as active`,
    );
  }
});
