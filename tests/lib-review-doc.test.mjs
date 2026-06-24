/**
 * tests/lib-review-doc.test.mjs — unit tests for lib/review-doc.mjs (C66-2).
 * Injected seam only; no real git/model calls.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runReviewDoc, REVIEW_DOC_CHECKLIST } from '../lib/review-doc.mjs';

const HEAD_SHA = 'b'.repeat(40);

function seam(diff = 'diff --git a/README.md b/README.md\n+claim\n') {
  return {
    now: () => 0,
    getDiff: () => diff,
    resolveSha: () => HEAD_SHA,
    validateReviewerOutput: () => ({ status: 0, stdout: '', stderr: '' }),
    log: () => {},
    warn: () => {},
  };
}

test('checklist includes the F1–F5 fact-claim items', () => {
  const ids = REVIEW_DOC_CHECKLIST.map((c) => c.id);
  assert.deepEqual(ids, ['F1', 'F2', 'F3', 'F4', 'F5']);
  assert.match(REVIEW_DOC_CHECKLIST[0].title, /--flag/);
  assert.match(REVIEW_DOC_CHECKLIST[1].title, /file path/);
  assert.match(REVIEW_DOC_CHECKLIST[2].title, /doctrine-strength/);
  assert.match(REVIEW_DOC_CHECKLIST[3].title, /LEARNINGS\.md or CS entry/);
  assert.match(REVIEW_DOC_CHECKLIST[4].title, /Cross-doc/);
});

test('runReviewDoc advisory plan lists every F item and requests canonical schema', async () => {
  const res = await runReviewDoc({
    prNumber: 218,
    repo: 'henrik-me/agent-harness',
    reviewerModel: 'gpt-5.5',
    implementerModels: ['claude-opus-4.8'],
    quiet: true,
    seam: seam(),
  });
  assert.equal(res.status, 'planned');
  assert.equal(res.verb, 'review-doc');
  for (const id of ['F1', 'F2', 'F3', 'F4', 'F5']) {
    assert.match(res.prompt, new RegExp(`\\[${id}\\]`));
  }
  assert.match(res.prompt, /Verdict: Go\|Needs-Fix\|Block/);
});

test('runReviewDoc verdict path: Go yields complete/exit 0', async () => {
  const output = [
    `Analyzed HEAD: ${HEAD_SHA}`,
    '## Findings',
    'Verdict: Go',
  ].join('\n');
  const res = await runReviewDoc({
    prNumber: 218,
    reviewerModel: 'gpt-5.5',
    implementerModels: ['claude-opus-4.8'],
    reviewerOutput: output,
    quiet: true,
    seam: seam(),
  });
  assert.equal(res.status, 'complete');
  assert.equal(res.exitCode, 0);
  assert.equal(res.verdict.reviewLogVerdict, 'Go');
});
