/**
 * tests/lib-review-checklist.test.mjs — unit tests for the shared CS66
 * model-dispatch review core (lib/review-checklist.mjs).
 *
 * All flows use an injected seam (no real git/gh/model calls). No disk writes
 * outside os.tmpdir() (LRN-094).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  runChecklistReview,
  composeChecklistPrompt,
  extractChangedFiles,
  defaultSeam,
  ReviewError,
} from '../lib/review-checklist.mjs';

const HEAD_SHA = 'a'.repeat(40);

const SAMPLE_DIFF = [
  'diff --git a/docs/guide.md b/docs/guide.md',
  'index 111..222 100644',
  '--- a/docs/guide.md',
  '+++ b/docs/guide.md',
  '@@ -1 +1 @@',
  '-old',
  '+new',
  'diff --git a/lib/foo.mjs b/lib/foo.mjs',
  'index 333..444 100644',
  '--- a/lib/foo.mjs',
  '+++ b/lib/foo.mjs',
  '@@ -1 +1 @@',
  '-a',
  '+b',
].join('\n');

const SAMPLE_CHECKLIST = [
  { id: 'X1', title: 'First item', detail: 'first detail' },
  { id: 'X2', title: 'Second item' },
];

function makeSeam({ diff = SAMPLE_DIFF, resolvedHead = HEAD_SHA, validate = { status: 0, stdout: '', stderr: '' } } = {}) {
  const logs = [];
  const warns = [];
  const calls = [];
  return {
    seam: {
      now: () => 0,
      getDiff: () => { calls.push('getDiff'); return diff; },
      resolveSha: () => { calls.push('resolveSha'); return resolvedHead; },
      validateReviewerOutput: (args) => { calls.push('validateReviewerOutput'); return typeof validate === 'function' ? validate(args) : validate; },
      readFile: () => '',
      log: (m) => logs.push(m),
      warn: (m) => warns.push(m),
    },
    logs,
    warns,
    calls,
  };
}

function goOutput() {
  return [
    `Analyzed HEAD: ${HEAD_SHA}`,
    '## Per-file analysis',
    '- docs/guide.md: looks fine',
    '## Findings',
    'Verdict: Go',
  ].join('\n');
}

function needsFixOutput() {
  return [
    `Analyzed HEAD: ${HEAD_SHA}`,
    '## Per-file analysis',
    '- docs/guide.md: problem',
    '## Findings',
    '- [Blocking] docs/guide.md:1: claim does not match the shipped surface',
    'Verdict: Needs-Fix',
  ].join('\n');
}

test('extractChangedFiles parses changed paths from a unified diff', () => {
  assert.deepEqual(extractChangedFiles(SAMPLE_DIFF), ['docs/guide.md', 'lib/foo.mjs']);
  assert.deepEqual(extractChangedFiles(''), []);
});

test('composeChecklistPrompt lists checklist items and requests the canonical output schema', () => {
  const prompt = composeChecklistPrompt({
    verb: 'review-doc',
    checklist: SAMPLE_CHECKLIST,
    diff: SAMPLE_DIFF,
    reviewerModel: 'gpt-5.5',
    csId: 'CS66',
    implementerModels: ['claude-opus-4.8'],
    repo: 'henrik-me/agent-harness',
    prNumber: 42,
  });
  assert.match(prompt, /\[X1\] First item — first detail/);
  assert.match(prompt, /\[X2\] Second item/);
  // Canonical reviewer-output schema requested.
  assert.match(prompt, /^Analyzed HEAD: /m);
  assert.match(prompt, /## Per-file analysis/);
  assert.match(prompt, /## Findings/);
  assert.match(prompt, /\[Blocking\|Non-blocking\|Suggestion\] <path>:<line>: <description>/);
  assert.match(prompt, /Verdict: Go\|Needs-Fix\|Block/);
  // Independence + scope present.
  assert.match(prompt, /Implementer models: claude-opus-4\.8/);
  assert.match(prompt, /docs\/guide\.md/);
});

test('C1: composeChecklistPrompt truncates a >40 KiB diff and labels it truthfully', () => {
  const MAX = 40 * 1024;
  // A unique tail marker that must NOT survive truncation.
  const tail = 'TAIL_MARKER_SHOULD_BE_DROPPED';
  const bigDiff = `${'x'.repeat(MAX + 5000)}${tail}`;
  const prompt = composeChecklistPrompt({
    verb: 'review-doc',
    checklist: SAMPLE_CHECKLIST,
    diff: bigDiff,
    reviewerModel: 'gpt-5.5',
    prNumber: 1,
  });
  // Truthful wording + truncation marker present.
  assert.match(prompt, /Diff under review \(truncated at 40 KiB by the CLI\):/);
  assert.match(prompt, /\.\.\.\[truncated by harness review\]/);
  // The oversized tail is dropped, and the embedded diff is bounded near the cap
  // (not the full multi-KiB original).
  assert.ok(!prompt.includes(tail), 'oversized diff tail must be truncated');
  assert.ok(prompt.length < bigDiff.length, 'prompt must be shorter than the raw oversized diff');
});

test('C1: a small diff is embedded untruncated (no truncation marker)', () => {
  const prompt = composeChecklistPrompt({
    verb: 'review-doc',
    checklist: SAMPLE_CHECKLIST,
    diff: SAMPLE_DIFF,
    reviewerModel: 'gpt-5.5',
    prNumber: 1,
  });
  assert.ok(prompt.includes(SAMPLE_DIFF), 'small diff must be embedded verbatim');
  assert.ok(!prompt.includes('...[truncated by harness review]'), 'no truncation marker for a small diff');
  // N1 (Copilot) — the label must not claim "truncated at 40 KiB" for a small,
  // verbatim-embedded diff. The plain label must be used instead.
  assert.ok(!prompt.includes('truncated at 40 KiB'), 'no 40 KiB truncation claim for a small diff');
  assert.match(prompt, /^Diff under review:$/m);
});

test('N4: extractChangedFiles skips /dev/null and falls back to the real path', () => {
  // A normal modified-file header → the b/ path.
  assert.deepEqual(extractChangedFiles('diff --git a/foo.js b/foo.js'), ['foo.js']);
  // A deleted-file header whose b/ side is /dev/null → fall back to the a/ side,
  // and /dev/null must never be added to the scope.
  const deleted = [
    'diff --git a/old/gone.js b/dev/null',
    'deleted file mode 100644',
    '--- a/old/gone.js',
    '+++ /dev/null',
  ].join('\n');
  assert.deepEqual(extractChangedFiles(deleted), ['old/gone.js']);
  assert.ok(!extractChangedFiles(deleted).includes('/dev/null'));
  assert.ok(!extractChangedFiles(deleted).includes('dev/null'));
});

test('advisory default returns status planned, composes prompt, invokes no model', async () => {
  const { seam, logs } = makeSeam();
  const res = await runChecklistReview({
    verb: 'review-doc',
    checklist: SAMPLE_CHECKLIST,
    cwd: process.cwd(),
    prNumber: 7,
    reviewerModel: 'gpt-5.5',
    implementerModels: ['claude-opus-4.8'],
    seam,
  });
  assert.equal(res.status, 'planned');
  assert.equal(res.exitCode, 0);
  assert.equal(res.verb, 'review-doc');
  assert.match(res.prompt, /\[X1\] First item/);
  assert.deepEqual(res.plan.checklistIds, ['X1', 'X2']);
  assert.deepEqual(res.plan.diffScope, ['docs/guide.md', 'lib/foo.mjs']);
  assert.ok(logs.some((l) => /dispatch plan/.test(l)));
});

test('independence guard rejects reviewer model that is also an implementer', async () => {
  const { seam } = makeSeam();
  await assert.rejects(
    () =>
      runChecklistReview({
        verb: 'perf-review',
        checklist: SAMPLE_CHECKLIST,
        prNumber: 7,
        reviewerModel: 'gpt-5.5',
        implementerModels: ['gpt-5.5'],
        seam,
      }),
    (err) => {
      assert.ok(err instanceof ReviewError);
      assert.equal(err.kind, 'policy');
      return true;
    },
  );
});

test('reviewerOutput Go verdict yields status complete and exit 0', async () => {
  const { seam } = makeSeam();
  const res = await runChecklistReview({
    verb: 'security-review',
    checklist: SAMPLE_CHECKLIST,
    prNumber: 7,
    reviewerModel: 'gpt-5.5',
    implementerModels: ['claude-opus-4.8'],
    reviewerOutput: goOutput(),
    seam,
  });
  assert.equal(res.status, 'complete');
  assert.equal(res.exitCode, 0);
  assert.equal(res.verdict.reviewLogVerdict, 'Go');
});

test('reviewerOutput Needs-Fix is advisory (exit 0) by default but fails under strict', async () => {
  const advisory = await runChecklistReview({
    verb: 'security-review',
    checklist: SAMPLE_CHECKLIST,
    prNumber: 7,
    reviewerModel: 'gpt-5.5',
    implementerModels: ['claude-opus-4.8'],
    reviewerOutput: needsFixOutput(),
    seam: makeSeam().seam,
  });
  assert.equal(advisory.status, 'no-go');
  assert.equal(advisory.exitCode, 0);

  const strict = await runChecklistReview({
    verb: 'security-review',
    checklist: SAMPLE_CHECKLIST,
    prNumber: 7,
    reviewerModel: 'gpt-5.5',
    implementerModels: ['claude-opus-4.8'],
    reviewerOutput: needsFixOutput(),
    strict: true,
    seam: makeSeam().seam,
  });
  assert.equal(strict.status, 'no-go');
  assert.equal(strict.exitCode, 1);
});

test('input validation: rejects non-positive prNumber, empty verb, empty checklist, non-string reviewerOutput', async () => {
  const { seam } = makeSeam();
  await assert.rejects(
    () => runChecklistReview({ verb: 'review-doc', checklist: SAMPLE_CHECKLIST, prNumber: 0, seam }),
    /prNumber must be a positive integer/,
  );
  await assert.rejects(
    () => runChecklistReview({ verb: '', checklist: SAMPLE_CHECKLIST, prNumber: 1, seam }),
    /non-empty verb/,
  );
  await assert.rejects(
    () => runChecklistReview({ verb: 'review-doc', checklist: [], prNumber: 1, seam }),
    /non-empty array/,
  );
  await assert.rejects(
    () =>
      runChecklistReview({
        verb: 'review-doc',
        checklist: SAMPLE_CHECKLIST,
        prNumber: 1,
        reviewerOutput: 123,
        seam,
      }),
    /reviewerOutput must be a string/,
  );
});

test('dry-run tolerates an unavailable diff and still returns a plan', async () => {
  const failingSeam = {
    now: () => 0,
    getDiff: () => {
      throw new ReviewError('git not available', 'io');
    },
    log: () => {},
    warn: () => {},
  };
  const res = await runChecklistReview({
    verb: 'perf-review',
    checklist: SAMPLE_CHECKLIST,
    prNumber: 7,
    reviewerModel: 'gpt-5.5',
    dryRun: true,
    quiet: true,
    seam: failingSeam,
  });
  assert.equal(res.status, 'planned');
  assert.deepEqual(res.plan.diffScope, []);
});

test('non-dry-run propagates a diff retrieval failure (fail-closed)', async () => {
  const failingSeam = {
    now: () => 0,
    getDiff: () => {
      throw new ReviewError('git boom', 'io');
    },
    log: () => {},
    warn: () => {},
  };
  await assert.rejects(
    () =>
      runChecklistReview({
        verb: 'perf-review',
        checklist: SAMPLE_CHECKLIST,
        prNumber: 7,
        reviewerModel: 'gpt-5.5',
        seam: failingSeam,
      }),
    /git boom/,
  );
});

test('defaultSeam exposes the expected real-IO surface', () => {
  assert.equal(typeof defaultSeam.getDiff, 'function');
  assert.equal(typeof defaultSeam.now, 'function');
  assert.equal(typeof defaultSeam.log, 'function');
  assert.equal(typeof defaultSeam.warn, 'function');
  assert.equal(typeof defaultSeam.resolveSha, 'function');
  assert.equal(typeof defaultSeam.validateReviewerOutput, 'function');
});

/* ---------- B2: head SHA resolution ------------------------------------- */

test('B2: composed prompt requests the resolved 40-hex HEAD (not a literal placeholder)', async () => {
  const resolved = 'b'.repeat(40);
  const { seam } = makeSeam({ resolvedHead: resolved });
  const res = await runChecklistReview({
    verb: 'review-doc',
    checklist: SAMPLE_CHECKLIST,
    prNumber: 7,
    reviewerModel: 'gpt-5.5',
    implementerModels: ['claude-opus-4.8'],
    seam,
  });
  assert.match(res.prompt, new RegExp(`^Analyzed HEAD: ${resolved}$`, 'm'));
  assert.doesNotMatch(res.prompt, /Analyzed HEAD: <head/);
});

test('B2: a verdict computation fails closed when HEAD cannot be resolved', async () => {
  const failingResolve = {
    now: () => 0,
    getDiff: () => SAMPLE_DIFF,
    resolveSha: () => { throw new ReviewError('git rev-parse boom', 'io'); },
    validateReviewerOutput: () => ({ status: 0 }),
    log: () => {},
    warn: () => {},
  };
  await assert.rejects(
    () =>
      runChecklistReview({
        verb: 'review-doc',
        checklist: SAMPLE_CHECKLIST,
        prNumber: 7,
        reviewerModel: 'gpt-5.5',
        implementerModels: ['claude-opus-4.8'],
        reviewerOutput: goOutput(),
        seam: failingResolve,
      }),
    /git rev-parse boom/,
  );
});

/* ---------- B1: CS40 reviewer-output validation ------------------------- */

test('B1: reviewer output that fails CS40 validation is rejected (fail-closed)', async () => {
  const { seam } = makeSeam({ validate: { status: 1, stdout: 'ERROR: Analyzed HEAD missing' } });
  await assert.rejects(
    () =>
      runChecklistReview({
        verb: 'review-doc',
        checklist: SAMPLE_CHECKLIST,
        prNumber: 7,
        reviewerModel: 'gpt-5.5',
        implementerModels: ['claude-opus-4.8'],
        reviewerOutput: 'Verdict: Go',
        seam,
      }),
    (err) => {
      assert.ok(err instanceof ReviewError);
      assert.equal(err.kind, 'bad-output');
      assert.match(err.message, /CS40 validation/);
      return true;
    },
  );
});

test('B1: validation runs (after resolveSha) BEFORE parse/verdict', async () => {
  const { seam, calls } = makeSeam();
  const res = await runChecklistReview({
    verb: 'review-doc',
    checklist: SAMPLE_CHECKLIST,
    prNumber: 7,
    reviewerModel: 'gpt-5.5',
    implementerModels: ['claude-opus-4.8'],
    reviewerOutput: goOutput(),
    seam,
  });
  assert.equal(res.status, 'complete');
  assert.equal(res.exitCode, 0);
  const order = calls.filter((c) => c === 'resolveSha' || c === 'validateReviewerOutput');
  assert.deepEqual(order, ['resolveSha', 'validateReviewerOutput']);
});

test('B1: round must match /^R\\d+$/', async () => {
  const { seam } = makeSeam();
  await assert.rejects(
    () =>
      runChecklistReview({
        verb: 'review-doc',
        checklist: SAMPLE_CHECKLIST,
        prNumber: 7,
        reviewerModel: 'gpt-5.5',
        implementerModels: ['claude-opus-4.8'],
        round: 'bogus',
        seam,
      }),
    /round must match/,
  );
});

/* ---------- B3: fail-closed independence -------------------------------- */

test('B3: a verdict with NO implementer models fails closed (independence)', async () => {
  const { seam } = makeSeam();
  await assert.rejects(
    () =>
      runChecklistReview({
        verb: 'review-doc',
        checklist: SAMPLE_CHECKLIST,
        prNumber: 7,
        reviewerModel: 'gpt-5.5',
        implementerModels: [],
        reviewerOutput: goOutput(),
        seam,
      }),
    (err) => {
      assert.ok(err instanceof ReviewError);
      assert.equal(err.kind, 'independence');
      return true;
    },
  );
});

test('B3: advisory preview with no implementer models warns and proceeds (planned)', async () => {
  const { seam, warns } = makeSeam();
  const res = await runChecklistReview({
    verb: 'review-doc',
    checklist: SAMPLE_CHECKLIST,
    prNumber: 7,
    reviewerModel: 'gpt-5.5',
    implementerModels: [],
    seam,
  });
  assert.equal(res.status, 'planned');
  assert.equal(res.exitCode, 0);
  assert.ok(warns.some((w) => /cannot verify reviewer independence/.test(w)));
});

test('B3: reviewer model in the implementer set still rejected even with reviewer output', async () => {
  const { seam } = makeSeam();
  await assert.rejects(
    () =>
      runChecklistReview({
        verb: 'review-doc',
        checklist: SAMPLE_CHECKLIST,
        prNumber: 7,
        reviewerModel: 'gpt-5.5',
        implementerModels: ['gpt-5.5'],
        reviewerOutput: goOutput(),
        seam,
      }),
    (err) => {
      assert.ok(err instanceof ReviewError);
      assert.equal(err.kind, 'policy');
      return true;
    },
  );
});
