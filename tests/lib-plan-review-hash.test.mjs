/**
 * tests/lib-plan-review-hash.test.mjs — Unit tests for the plan-review-hash helper.
 *
 * Covers:
 *   - Identical content produces identical hash (determinism)
 *   - Different Decisions content changes the hash
 *   - Different Deliverables content changes the hash
 *   - Edits to OTHER sections (Background / Risks / Notes) do NOT change hash
 *   - Hash is exactly 12 lowercase hex chars
 *   - File-based and text-based variants agree
 *   - Missing sections produce a (still-deterministic) hash
 *
 * Per CS35b decision C35b-2/C35b-3.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  computePlanReviewHash,
  computePlanReviewHashFromText,
  HASH_PREFIX_LENGTH,
} from '../lib/plan-review-hash.mjs';

const SAMPLE = `# Sample CS

## Background

Some background text.

## Decisions

| # | Decision | Choice |
|---|---|---|
| C1 | thing | yes |

## Deliverables

1. Deliverable one
2. Deliverable two

## Tasks

| Task | State |
|---|---|
| T1 | pending |
`;

describe('lib/plan-review-hash.mjs', () => {
  it('produces a 12-char lowercase hex string', () => {
    const h = computePlanReviewHashFromText(SAMPLE);
    assert.equal(h.length, HASH_PREFIX_LENGTH);
    assert.match(h, /^[0-9a-f]{12}$/);
  });

  it('is deterministic across calls with identical input', () => {
    const h1 = computePlanReviewHashFromText(SAMPLE);
    const h2 = computePlanReviewHashFromText(SAMPLE);
    assert.equal(h1, h2);
  });

  it('changes when Decisions section content changes', () => {
    const h1 = computePlanReviewHashFromText(SAMPLE);
    const modified = SAMPLE.replace('| C1 | thing | yes |', '| C1 | thing | no  |');
    const h2 = computePlanReviewHashFromText(modified);
    assert.notEqual(h1, h2);
  });

  it('changes when Deliverables section content changes', () => {
    const h1 = computePlanReviewHashFromText(SAMPLE);
    const modified = SAMPLE.replace('Deliverable two', 'Deliverable two-prime');
    const h2 = computePlanReviewHashFromText(modified);
    assert.notEqual(h1, h2);
  });

  it('does NOT change when Background section content changes', () => {
    const h1 = computePlanReviewHashFromText(SAMPLE);
    const modified = SAMPLE.replace('Some background text.', 'Some other background text entirely.');
    const h2 = computePlanReviewHashFromText(modified);
    assert.equal(h1, h2);
  });

  it('does NOT change when Tasks section content changes', () => {
    const h1 = computePlanReviewHashFromText(SAMPLE);
    const modified = SAMPLE.replace('| T1 | pending |', '| T1 | done |\n| T2 | pending |');
    const h2 = computePlanReviewHashFromText(modified);
    assert.equal(h1, h2);
  });

  it('handles missing Decisions section gracefully', () => {
    const noDecisions = SAMPLE.replace(/## Decisions[\s\S]*?(?=## Deliverables)/, '');
    const h = computePlanReviewHashFromText(noDecisions);
    assert.match(h, /^[0-9a-f]{12}$/);
  });

  it('handles missing Deliverables section gracefully', () => {
    const noDeliverables = SAMPLE.replace(/## Deliverables[\s\S]*?(?=## Tasks)/, '');
    const h = computePlanReviewHashFromText(noDeliverables);
    assert.match(h, /^[0-9a-f]{12}$/);
  });

  it('text-based and file-based variants agree', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-review-hash-'));
    try {
      const file = path.join(dir, 'sample.md');
      fs.writeFileSync(file, SAMPLE, 'utf8');
      const hText = computePlanReviewHashFromText(SAMPLE);
      const hFile = computePlanReviewHash(file);
      assert.equal(hFile, hText);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('CRLF and LF inputs produce the same hash (BOM/CRLF normalization)', () => {
    const hLF = computePlanReviewHashFromText(SAMPLE);
    const hCRLF = computePlanReviewHashFromText(SAMPLE.replace(/\n/g, '\r\n'));
    assert.equal(hLF, hCRLF);
  });
});
