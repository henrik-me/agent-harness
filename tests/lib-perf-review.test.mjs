/**
 * tests/lib-perf-review.test.mjs — unit tests for lib/perf-review.mjs (C66-4).
 * Injected seam only; no real git/model calls.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runPerfReview, PERF_REVIEW_CHECKLIST } from '../lib/perf-review.mjs';

function seam(diff = 'diff --git a/lib/hot.mjs b/lib/hot.mjs\n+loop\n') {
  return {
    now: () => 0,
    getDiff: () => diff,
    resolveSha: () => 'a'.repeat(40),
    validateReviewerOutput: () => ({ status: 0, stdout: '', stderr: '' }),
    log: () => {},
    warn: () => {},
  };
}

test('checklist includes the 5 enumerated perf items', () => {
  const ids = PERF_REVIEW_CHECKLIST.map((c) => c.id);
  assert.deepEqual(ids, ['P1', 'P2', 'P3', 'P4', 'P5']);
  const text = PERF_REVIEW_CHECKLIST.map((c) => c.title).join(' ');
  assert.match(text, /allocations/i);
  assert.match(text, /complexity/i);
  assert.match(text, /N\+1/i);
  assert.match(text, /Sync-in-async/i);
  assert.match(text, /Unbounded/i);
});

test('runPerfReview advisory plan scopes to the diff and lists perf items', async () => {
  const res = await runPerfReview({
    prNumber: 99,
    reviewerModel: 'gpt-5.5',
    implementerModels: ['claude-opus-4.8'],
    quiet: true,
    seam: seam(),
  });
  assert.equal(res.status, 'planned');
  assert.equal(res.verb, 'perf-review');
  assert.deepEqual(res.plan.diffScope, ['lib/hot.mjs']);
  for (const id of ['P1', 'P2', 'P3', 'P4', 'P5']) {
    assert.match(res.prompt, new RegExp(`\\[${id}\\]`));
  }
});
