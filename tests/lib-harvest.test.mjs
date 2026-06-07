/**
 * tests/lib-harvest.test.mjs — unit tests for lib/harvest.mjs (CS63 C63-4).
 *
 * Pure-function tests: harvest input is markdown text + an injected `now`, so
 * no filesystem, clock, or network is touched. No scratch files are written.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  harvestLearnings,
  formatHarvestReport,
  harvestExitCode,
  ageInDays,
  DEFAULT_STALE_DAYS,
} from '../lib/harvest.mjs';

const NOW = new Date('2026-06-06T00:00:00Z');

/** Build a LEARNINGS.md-style entry block from frontmatter fields. */
function entry({ id, date, category = 'process', status = 'open', tags = [], claim_area }) {
  const lines = [
    `### ${id}`,
    '',
    '```yaml',
    `id: ${id}`,
    `date: ${date}`,
    `category: ${category}`,
    'source_cs: CS99',
    `status: ${status}`,
    `tags: [${tags.join(', ')}]`,
  ];
  if (claim_area !== undefined) lines.push(`claim_area: ${claim_area}`);
  lines.push('```', '', `**Problem:** body of ${id}.`, '');
  return lines.join('\n');
}

const STALE = '2026-05-01'; // 36 days before NOW
const FRESH = '2026-06-06'; // 0 days before NOW

test('ageInDays computes whole-day age and tolerates bad dates', () => {
  assert.equal(ageInDays('2026-05-01', NOW), 36);
  assert.equal(ageInDays('2026-06-06', NOW), 0);
  assert.equal(ageInDays('not-a-date', NOW), null);
  assert.equal(ageInDays(undefined, NOW), null);
});

test('pre-claim: stale open process-category entry is a candidate', () => {
  const md = entry({ id: 'LRN-901', date: STALE, category: 'process' });
  const r = harvestLearnings(md, { now: NOW });
  assert.equal(r.counts.candidates, 1);
  assert.equal(r.candidates[0].id, 'LRN-901');
  assert.match(r.candidates[0].reasons[0], /stale-open \(36d\)/);
});

test('pre-claim: fresh open process entry is NOT a candidate (not stale)', () => {
  const md = entry({ id: 'LRN-902', date: FRESH, category: 'process' });
  const r = harvestLearnings(md, { now: NOW });
  assert.equal(r.counts.candidates, 0);
});

test('pre-claim: stale open entry tagged architectural (non-process category) is a candidate', () => {
  const md = entry({ id: 'LRN-903', date: STALE, category: 'operational', tags: ['architectural'] });
  const r = harvestLearnings(md, { now: NOW });
  assert.equal(r.counts.candidates, 1);
});

test('pre-claim: stale open entry matches only when claim_area matches', () => {
  const md = entry({ id: 'LRN-904', date: STALE, category: 'operational', tags: ['misc'], claim_area: 'repo-policy' });
  const noArea = harvestLearnings(md, { now: NOW });
  assert.equal(noArea.counts.candidates, 0, 'no claimArea → not surfaced');
  const matched = harvestLearnings(md, { now: NOW, claimArea: 'repo-policy' });
  assert.equal(matched.counts.candidates, 1);
  assert.match(matched.candidates[0].reasons[0], /claim_area=repo-policy/);
  const other = harvestLearnings(md, { now: NOW, claimArea: 'docs-schema' });
  assert.equal(other.counts.candidates, 0, 'non-matching claimArea → not surfaced');
});

test('pre-claim: closed/applied entries are never surfaced', () => {
  const md = [
    entry({ id: 'LRN-905', date: STALE, category: 'process', status: 'applied' }),
    entry({ id: 'LRN-906', date: STALE, category: 'process', status: 'obsolete' }),
  ].join('\n');
  const r = harvestLearnings(md, { now: NOW });
  assert.equal(r.counts.open, 0);
  assert.equal(r.counts.candidates, 0);
});

test('weekly: every open entry is surfaced regardless of staleness/tags', () => {
  const md = [
    entry({ id: 'LRN-907', date: FRESH, category: 'tooling', tags: ['x'] }),
    entry({ id: 'LRN-908', date: STALE, category: 'operational', tags: ['y'] }),
    entry({ id: 'LRN-909', date: STALE, category: 'process', status: 'applied' }),
  ].join('\n');
  const r = harvestLearnings(md, { now: NOW, mode: 'weekly' });
  assert.equal(r.counts.open, 2, 'two open, one applied');
  assert.equal(r.counts.candidates, 2);
});

test('pre-claim: unparseable date is not treated as stale', () => {
  const md = entry({ id: 'LRN-910', date: 'soon', category: 'process' });
  const r = harvestLearnings(md, { now: NOW });
  assert.equal(r.counts.candidates, 0);
  assert.equal(r.candidates.length, 0);
});

test('formatHarvestReport is quiet when there are no candidates', () => {
  const r = harvestLearnings(entry({ id: 'LRN-911', date: FRESH }), { now: NOW });
  const out = formatHarvestReport(r);
  assert.match(out, /no stale open learnings/);
  assert.doesNotMatch(out, /LRN-911/);
});

test('formatHarvestReport lists candidates with a disposition prompt', () => {
  const md = entry({ id: 'LRN-912', date: STALE, category: 'architectural' });
  const out = formatHarvestReport(harvestLearnings(md, { now: NOW }));
  assert.match(out, /LRN-912/);
  assert.match(out, /apply \| file-cs \| obsolete \| defer \| skip-for-this-CS/);
});

test('harvestExitCode is advisory (0) by default, 1 only under --strict with candidates', () => {
  const withCand = harvestLearnings(entry({ id: 'LRN-913', date: STALE }), { now: NOW });
  const none = harvestLearnings(entry({ id: 'LRN-914', date: FRESH }), { now: NOW });
  assert.equal(harvestExitCode(withCand), 0, 'advisory by default');
  assert.equal(harvestExitCode(withCand, { strict: true }), 1, 'strict + candidates → 1');
  assert.equal(harvestExitCode(none, { strict: true }), 0, 'strict + no candidates → 0');
});

test('DEFAULT_STALE_DAYS is 14 and is the boundary (>= staleDays)', () => {
  assert.equal(DEFAULT_STALE_DAYS, 14);
  const at14 = entry({ id: 'LRN-915', date: '2026-05-23', category: 'process' }); // exactly 14d before NOW
  assert.equal(harvestLearnings(at14, { now: NOW }).counts.candidates, 1);
  const at13 = entry({ id: 'LRN-916', date: '2026-05-24', category: 'process' }); // 13d
  assert.equal(harvestLearnings(at13, { now: NOW }).counts.candidates, 0);
});
