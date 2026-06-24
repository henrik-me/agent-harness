/**
 * tests/lib-security-review.test.mjs — unit tests for lib/security-review.mjs
 * (C66-5). Injected seam only; no real git/model calls.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runSecurityReview, SECURITY_REVIEW_CHECKLIST } from '../lib/security-review.mjs';

function seam(diff = 'diff --git a/.github/workflows/ci.yml b/.github/workflows/ci.yml\n+uses\n') {
  return {
    now: () => 0,
    getDiff: () => diff,
    resolveSha: () => 'a'.repeat(40),
    validateReviewerOutput: () => ({ status: 0, stdout: '', stderr: '' }),
    log: () => {},
    warn: () => {},
  };
}

test('checklist includes the 6 enumerated security items', () => {
  const ids = SECURITY_REVIEW_CHECKLIST.map((c) => c.id);
  assert.deepEqual(ids, ['S1', 'S2', 'S3', 'S4', 'S5', 'S6']);
  const text = SECURITY_REVIEW_CHECKLIST.map((c) => c.title).join(' ');
  assert.match(text, /secrets/i);
  assert.match(text, /injection/i);
  assert.match(text, /deserialization/i);
  assert.match(text, /permissions/i);
  assert.match(text, /containment/i);
  assert.match(text, /pin drift/i);
});

test('runSecurityReview advisory plan scopes to the diff and lists security items', async () => {
  const res = await runSecurityReview({
    prNumber: 123,
    reviewerModel: 'gpt-5.5',
    implementerModels: ['claude-opus-4.8'],
    quiet: true,
    seam: seam(),
  });
  assert.equal(res.status, 'planned');
  assert.equal(res.verb, 'security-review');
  assert.deepEqual(res.plan.diffScope, ['.github/workflows/ci.yml']);
  for (const id of ['S1', 'S2', 'S3', 'S4', 'S5', 'S6']) {
    assert.match(res.prompt, new RegExp(`\\[${id}\\]`));
  }
});
