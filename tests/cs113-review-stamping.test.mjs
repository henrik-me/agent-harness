/**
 * tests/cs113-review-stamping.test.mjs — CS113 regression tests.
 *
 * `harness review` must stamp its review evidence so the two read-only CI gates
 * it historically tripped stay green:
 *
 *   A3 (scripts/check-review-evidence.mjs) — the `## Model audit` **Reviewer
 *       agent** must DIFFER from the **Implementer agent**. Before CS113 the
 *       Reviewer agent defaulted to `actor` (the orchestrator id == the PR's
 *       Implementer agent), so A3 fired on nearly every content PR
 *       (LRN-197/210/211).
 *   A5 (scripts/check-copilot-review.mjs) — the latest Copilot review must
 *       post-date the latest LOCAL `## Review log` Go row. Before CS113 the
 *       `--copilot-only` leg appended an orchestrator-actor Go row stamped at
 *       record-time, which post-dated the Copilot review it recorded and
 *       tripped A5 (LRN-197/210).
 *
 * These tests drive `runReview` through the same `__testSeam` mocks the CS101
 * suite uses (no network / no filesystem writes), plus a pair of pure-lib
 * `updatePrBodyWithReview` unit tests. A5 ordering is cross-checked against the
 * REAL `findLatestLocalGoTimestamp` predicate exported by the A5 checker.
 *
 * Run: node --test tests/cs113-review-stamping.test.mjs
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

import {
  __testSeam,
  runReview,
  updatePrBodyWithReview,
  DEFAULT_REVIEWER_AGENT,
} from '../lib/review.mjs';
import { findLatestLocalGoTimestamp } from '../scripts/check-copilot-review.mjs';

const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ACTOR = 'yoga-ah'; // orchestrator id == the PR's Implementer agent

// Deterministic CS markdown so parseImplementerModels is stable and the reviewer
// model (gpt-5.5) never overlaps an implementer (claude-opus-4.8).
const CS_MARKDOWN = [
  '# CS52',
  '',
  '## Model audit',
  '',
  '| Field | Value |',
  '|---|---|',
  '| Implementer models | claude-opus-4.8 |',
  '',
].join('\n');

function prJson(bodyMarkdown) {
  return JSON.stringify({
    body: bodyMarkdown,
    headRefName: 'cs52/harness-review-cli',
    headRefOid: HEAD,
    baseRefOid: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    isCrossRepository: false,
    labels: [],
    url: 'https://github.com/henrik-me/agent-harness/pull/141',
  });
}

/** Extract a `| Field | Value |` Model-audit value from a PR body. */
function modelAuditValue(body, field) {
  const re = new RegExp(`^\\|\\s*${field}\\s*\\|\\s*(.+?)\\s*\\|\\s*$`, 'im');
  const m = String(body).match(re);
  return m ? m[1].trim() : null;
}

/** Count `## Review log` data rows whose verdict cell reads Go. */
function countLocalGoRows(body) {
  const section = String(body).split(/^## /m).find((s) => s.startsWith('Review log')) || '';
  return section
    .split('\n')
    .filter((line) => /^\|/.test(line.trim()) && /\bGo\b/.test(line) && !/verdict/i.test(line))
    .length;
}

const defaultSeam = { ...__testSeam };

beforeEach(() => {
  Object.assign(__testSeam, defaultSeam);
  __testSeam.readFile = () => CS_MARKDOWN;
  __testSeam.writeFile = () => {};
  __testSeam.unlink = () => {};
});

afterEach(() => {
  Object.assign(__testSeam, defaultSeam);
});

const baseArgs = {
  cwd: process.cwd(),
  repo: 'henrik-me/agent-harness',
  prNumber: 141,
  reviewerModel: 'gpt-5.5',
  actor: ACTOR,
};

describe('CS113 — single-call review stamps a reviewer identity (A3) + preserves localGo ordering (A5)', () => {
  it('runReview single-call Go: Reviewer agent = rubber-duck (≠ actor); Review-log Go row carries localGoAt', async () => {
    // localGoAt is captured from now(); Copilot lands 3 min later (A5-safe).
    __testSeam.now = () => Date.parse('2026-05-14T12:00:00Z');
    const copilotSubmittedAt = '2026-05-14T12:03:00Z';

    const incomingBody = [
      '## Summary', '', 'x', '',
      '## Model audit', '',
      '| Field | Value |',
      '|---|---|',
      '| Implementer models | claude-opus-4.8 |',
      `| Implementer agent | ${ACTOR} |`,
      '| Reviewer model | _(fill via harness review)_ |',
      '| Reviewer agent | _(fill via harness review)_ |',
      '',
      '## Review log', '',
      '| timestamp | analyzed_head | actor | model | verdict | evidence_link |',
      '|---|---|---|---|---|---|',
      '',
    ].join('\n');

    let capturedBody = null;
    __testSeam.writeFile = (_path, body) => { capturedBody = body; };
    __testSeam.spawnSync = (cmd, args) => {
      if (cmd === 'gh' && args[0] === 'pr' && args[1] === 'view') {
        return { status: 0, stdout: prJson(incomingBody), stderr: '' };
      }
      if (cmd === 'gh' && args[0] === 'pr' && args[1] === 'edit') return { status: 0, stdout: '', stderr: '' };
      if (cmd === 'git') return { status: 0, stdout: '', stderr: '' };
      return { status: 1, stdout: '', stderr: `unexpected ${cmd} ${args.join(' ')}` };
    };
    __testSeam.engageCopilot = async () => ({
      requested: true,
      verified: true,
      review: { state: 'COMMENTED', submittedAt: copilotSubmittedAt, commit: { oid: HEAD } },
    });

    // NOTE: reviewerAgent is intentionally NOT passed — mirroring the CLI after
    // CS113 removed `reviewerAgent: actor` at the runReview call site, so the lib
    // default (DEFAULT_REVIEWER_AGENT) must apply.
    const result = await runReview({
      ...baseArgs,
      rubberDuckOutput: `Verdict: Go\nAnalyzed HEAD: ${HEAD}\n`,
    });

    assert.equal(result.status, 'complete');
    assert.ok(capturedBody, 'PR body must be written');

    // A3: Reviewer agent is a reviewer id, never the orchestrator/implementer id.
    assert.equal(modelAuditValue(capturedBody, 'Reviewer agent'), DEFAULT_REVIEWER_AGENT);
    assert.notEqual(modelAuditValue(capturedBody, 'Reviewer agent'), ACTOR);
    assert.notEqual(
      modelAuditValue(capturedBody, 'Reviewer agent').toLowerCase(),
      modelAuditValue(capturedBody, 'Implementer agent').toLowerCase(),
    );

    // C113-3 invariant: the single-call Review-log Go row still carries localGoAt
    // (the row and the A5 poll floor agree), and the actor column stays the
    // orchestrator id for provenance (A5-neutral per LRN-211).
    assert.match(capturedBody, /2026-05-14T12:00:00Z/);
    assert.equal(countLocalGoRows(capturedBody), 1);

    // A5 (real predicate): Copilot review post-dates the local Go row.
    const localGo = findLatestLocalGoTimestamp(capturedBody);
    assert.equal(localGo, '2026-05-14T12:00:00Z');
    assert.ok(
      new Date(copilotSubmittedAt).getTime() >= new Date(localGo).getTime(),
      'A5: Copilot review must post-date the local Go row',
    );
  });
});

describe('CS113 — --copilot-only preserves rubber-duck evidence + appends no local Go row (A3 + A5)', () => {
  it('runReview --copilot-only: preserves Reviewer model/agent; no orchestrator Go row post-dates Copilot', async () => {
    // Record time (now) is 1s AFTER the Copilot review — the exact shape that,
    // pre-CS113, produced a record-time local Go row that tripped A5.
    __testSeam.now = () => Date.parse('2026-05-14T12:00:01Z');
    const copilotSubmittedAt = '2026-05-14T12:00:00Z';

    // Pre-existing REAL rubber-duck evidence from a prior single-call run. The
    // Reviewer model (gpt-5.4) deliberately differs from this run's default
    // (gpt-5.5) so preservation is observable, and the earlier Go row's
    // timestamp (11:00:00Z) is well before Copilot.
    const incomingBody = [
      '## Summary', '', 'x', '',
      '## Model audit', '',
      '| Field | Value |',
      '|---|---|',
      '| Implementer models | claude-opus-4.8 |',
      `| Implementer agent | ${ACTOR} |`,
      '| Reviewer model | gpt-5.4 |',
      '| Reviewer agent | rubber-duck |',
      '',
      '## Review log', '',
      '| timestamp | analyzed_head | actor | model | verdict | evidence_link |',
      '|---|---|---|---|---|---|',
      `| 2026-05-14T11:00:00Z | ${HEAD} | ${ACTOR} | gpt-5.4 | Go | harness-review:R1 |`,
      '',
    ].join('\n');

    let capturedBody = null;
    __testSeam.writeFile = (_path, body) => { capturedBody = body; };
    __testSeam.spawnSync = (cmd, args) => {
      if (cmd === 'gh' && args[0] === 'pr' && args[1] === 'view') {
        return { status: 0, stdout: prJson(incomingBody), stderr: '' };
      }
      if (cmd === 'gh' && args[0] === 'pr' && args[1] === 'edit') return { status: 0, stdout: '', stderr: '' };
      if (cmd === 'git') return { status: 0, stdout: '', stderr: '' };
      return { status: 1, stdout: '', stderr: `unexpected ${cmd} ${args.join(' ')}` };
    };
    __testSeam.engageCopilot = async () => ({
      requested: true,
      verified: true,
      review: { state: 'COMMENTED', submittedAt: copilotSubmittedAt, commit: { oid: HEAD } },
    });

    const result = await runReview({ ...baseArgs, copilotOnly: true });

    assert.equal(result.status, 'complete');
    assert.ok(capturedBody, 'PR body must be written');

    // C113-2 preservation: pre-existing rubber-duck Reviewer model/agent survive
    // (NOT clobbered by this run's gpt-5.5 default nor the orchestrator id).
    assert.equal(modelAuditValue(capturedBody, 'Reviewer model'), 'gpt-5.4');
    assert.equal(modelAuditValue(capturedBody, 'Reviewer agent'), 'rubber-duck');

    // A3: Reviewer agent still differs from Implementer agent.
    assert.notEqual(
      modelAuditValue(capturedBody, 'Reviewer agent').toLowerCase(),
      modelAuditValue(capturedBody, 'Implementer agent').toLowerCase(),
    );

    // C113-2: no NEW orchestrator-actor Go row was appended — the only local Go
    // row is the pre-existing one, and the record-time (12:00:01Z) never lands.
    assert.equal(countLocalGoRows(capturedBody), 1);
    assert.doesNotMatch(capturedBody, /2026-05-14T12:00:01Z/);

    // A5 (real predicate): the latest local Go is the pre-existing 11:00:00Z row,
    // which the Copilot review (12:00:00Z) post-dates. Pre-CS113 this returned
    // the record-time 12:00:01Z row and tripped A5.
    const localGo = findLatestLocalGoTimestamp(capturedBody);
    assert.equal(localGo, '2026-05-14T11:00:00Z');
    assert.ok(
      new Date(copilotSubmittedAt).getTime() >= new Date(localGo).getTime(),
      'A5: Copilot review must post-date the latest local Go row',
    );
  });
});

describe('CS113 — updatePrBodyWithReview flag semantics (pure lib)', () => {
  const baseOpts = {
    round: 'R2',
    analyzedHead: HEAD,
    actor: ACTOR,
    reviewerModel: 'gpt-5.5',
    reviewerAgent: DEFAULT_REVIEWER_AGENT,
    verdict: 'Go',
    implementerModels: new Set(['claude-opus-4.8']),
    timestamp: Date.parse('2026-05-14T12:00:00Z'),
  };

  const bodyWithRealReviewer = [
    '## Model audit', '',
    '| Field | Value |',
    '|---|---|',
    '| Implementer models | claude-opus-4.8 |',
    `| Implementer agent | ${ACTOR} |`,
    '| Reviewer model | gpt-5.4 |',
    '| Reviewer agent | rubber-duck |',
    '',
    '## Review log', '',
    '| timestamp | analyzed_head | actor | model | verdict | evidence_link |',
    '|---|---|---|---|---|---|',
    '',
  ].join('\n');

  it('skipReviewLog suppresses the Review-log append but still upserts the Model audit', () => {
    const before = countLocalGoRows(bodyWithRealReviewer);
    const out = updatePrBodyWithReview(bodyWithRealReviewer, {
      ...baseOpts,
      skipReviewLog: true,
      preserveReviewerIdentity: true,
    });
    assert.equal(countLocalGoRows(out), before, 'no Review-log Go row is appended');
    // Model audit is still processed (Implementer models present).
    assert.equal(modelAuditValue(out, 'Implementer models'), 'claude-opus-4.8');
  });

  it('preserveReviewerIdentity keeps real pre-existing Reviewer model/agent', () => {
    const out = updatePrBodyWithReview(bodyWithRealReviewer, {
      ...baseOpts,
      skipReviewLog: true,
      preserveReviewerIdentity: true,
    });
    assert.equal(modelAuditValue(out, 'Reviewer model'), 'gpt-5.4');
    assert.equal(modelAuditValue(out, 'Reviewer agent'), 'rubber-duck');
  });

  it('preserveReviewerIdentity does NOT preserve a Reviewer agent that equals the Implementer agent — overwrites with the default (A3)', () => {
    // Pre-CS113 damage: an old `harness review` stamped Reviewer agent == the
    // orchestrator/Implementer agent id. `isRealAuditValue` alone would treat it
    // as real and preserve it, leaving A3 red on the --copilot-only leg for
    // exactly the PRs the old stamping damaged. The distinctness guard must
    // overwrite it with the default reviewer id. (Rubber-duck review finding.)
    const brokenBody = [
      '## Model audit', '',
      '| Field | Value |',
      '|---|---|',
      '| Implementer models | claude-opus-4.8 |',
      `| Implementer agent | ${ACTOR} |`,
      '| Reviewer model | gpt-5.4 |',
      `| Reviewer agent | ${ACTOR.toUpperCase()} |`, // case-insensitive A3 collision
      '',
    ].join('\n');
    const out = updatePrBodyWithReview(brokenBody, {
      ...baseOpts,
      skipReviewLog: true,
      preserveReviewerIdentity: true,
    });
    assert.equal(modelAuditValue(out, 'Reviewer agent'), DEFAULT_REVIEWER_AGENT);
    assert.notEqual(
      modelAuditValue(out, 'Reviewer agent').toLowerCase(),
      modelAuditValue(out, 'Implementer agent').toLowerCase(),
    );
    // A real Reviewer MODEL (not an agent-identity field) is still preserved.
    assert.equal(modelAuditValue(out, 'Reviewer model'), 'gpt-5.4');
  });

  it('preserveReviewerIdentity still fills an unreviewed placeholder with the defaults', () => {
    const placeholderBody = [
      '## Model audit', '',
      '| Field | Value |',
      '|---|---|',
      '| Implementer models | claude-opus-4.8 |',
      `| Implementer agent | ${ACTOR} |`,
      '| Reviewer model | _(fill via harness review)_ |',
      '| Reviewer agent | _(fill via harness review)_ |',
      '',
    ].join('\n');
    const out = updatePrBodyWithReview(placeholderBody, {
      ...baseOpts,
      skipReviewLog: true,
      preserveReviewerIdentity: true,
    });
    assert.equal(modelAuditValue(out, 'Reviewer model'), 'gpt-5.5');
    assert.equal(modelAuditValue(out, 'Reviewer agent'), DEFAULT_REVIEWER_AGENT);
  });

  it('the default (single-call) path overwrites Reviewer agent with the passed reviewer id, not the actor', () => {
    const out = updatePrBodyWithReview(bodyWithRealReviewer, baseOpts);
    assert.equal(modelAuditValue(out, 'Reviewer agent'), DEFAULT_REVIEWER_AGENT);
    assert.notEqual(modelAuditValue(out, 'Reviewer agent'), ACTOR);
    assert.equal(countLocalGoRows(out), 1, 'single-call path appends exactly one Go row');
  });
});
