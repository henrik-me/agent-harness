/**
 * tests/cs52-harness-review-lib.test.mjs — unit tests for lib/review.mjs.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

import {
  __testSeam,
  appendReviewLogRow,
  assertReviewerAllowed,
  computeVerdict,
  parseImplementerModels,
  ReviewError,
  runReview,
} from '../lib/review.mjs';

const defaultSeam = { ...__testSeam };
const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

beforeEach(() => {
  Object.assign(__testSeam, defaultSeam);
  __testSeam.now = () => Date.parse('2026-05-14T12:00:00Z');
});

afterEach(() => {
  Object.assign(__testSeam, defaultSeam);
});

describe('CS52 review library helpers', () => {
  it('parses implementer models from Model audit and Plan review tables', () => {
    const markdown = [
      '# CS52',
      '',
      '## Model audit',
      '',
      '| Field | Value |',
      '|---|---|',
      '| Implementer models | claude-opus-4.7, sonnet-4.6 |',
      '',
      '## Plan review',
      '',
      '| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |',
      '|---|---|---|---|---|---|---|---|',
      '| R1 | gpt-5.5 | claude-haiku-4.5 | rubber-duck | abcdef123456 | 2026-05-14T00:00:00Z | Go | ok |',
      '',
      '| Task | State | Owner | Notes |',
      '|---|---|---|---|',
      '| Implement | done | sub-agent | agent-id=bot | role=impl | model=claude-sonnet-4.6 | report-status=complete | learnings=0 |',
    ].join('\n');

    const models = parseImplementerModels(markdown);
    assert.deepEqual([...models].sort(), [
      'claude-haiku-4.5',
      'claude-opus-4.7',
      'claude-sonnet-4.6',
      'sonnet-4.6',
    ]);
  });

  it('independence guard rejects reviewer model overlap and high-risk fallback', () => {
    assert.throws(
      () => assertReviewerAllowed({
        reviewerModel: 'sonnet-4.6',
        implementerModels: new Set(['Claude Sonnet 4.6']),
        csId: 'CS52',
        config: { fallback_model: 'sonnet-4.6', rubber_duck_model: 'gpt-5.5', high_risk_clickstops: [] },
      }),
      (err) => err instanceof ReviewError && err.kind === 'policy' && /Independence guard refused/.test(err.message),
    );

    assert.throws(
      () => assertReviewerAllowed({
        reviewerModel: 'sonnet-4.6',
        implementerModels: new Set(['claude-opus-4.7']),
        csId: 'CS03',
        config: { fallback_model: 'sonnet-4.6', rubber_duck_model: 'gpt-5.5', high_risk_clickstops: ['CS03'] },
      }),
      (err) => err instanceof ReviewError && err.kind === 'policy' && /HIGH-RISK CS03/.test(err.message),
    );
  });

  it('appends Review log rows idempotently and uses R2 for the next round', () => {
    const initial = [
      '## Summary', '', 'Test', '',
      '## Review log', '',
      '| timestamp | analyzed_head | actor | model | verdict | evidence_link |',
      '|---|---|---|---|---|---|',
      '',
    ].join('\n');

    const r1 = appendReviewLogRow(initial, {
      round: 'R1',
      analyzedHead: HEAD,
      actor: 'yoga-ah',
      reviewerModel: 'gpt-5.5',
      verdict: 'Go',
    });
    assert.equal(r1.added, true);
    assert.match(r1.body, /harness-review:R1/);

    const r1Again = appendReviewLogRow(r1.body, {
      round: 'R1',
      analyzedHead: HEAD,
      actor: 'yoga-ah',
      reviewerModel: 'gpt-5.5',
      verdict: 'Go',
    });
    assert.equal(r1Again.added, false);
    assert.equal(r1Again.body, r1.body);

    const r2 = appendReviewLogRow(r1.body, {
      analyzedHead: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      actor: 'yoga-ah',
      reviewerModel: 'gpt-5.5',
      verdict: 'Needs-Fix',
    });
    assert.equal(r2.round, 'R2');
    assert.match(r2.body, /harness-review:R2/);
  });

  it('computes Go vs No-Go verdicts from rubber-duck and Copilot outputs', () => {
    const go = computeVerdict({
      rubberDuck: { verdict: 'Go', blockingCount: 0 },
      copilotReview: { state: 'COMMENTED' },
    });
    assert.equal(go.exitCode, 0);
    assert.equal(go.outcome, 'Go');

    const blocking = computeVerdict({
      rubberDuck: { verdict: 'Needs-Fix', blockingCount: 1 },
      copilotReview: { state: 'COMMENTED' },
    });
    assert.equal(blocking.exitCode, 1);
    assert.match(blocking.summary, /blocking rubber-duck/);

    const changes = computeVerdict({
      rubberDuck: { verdict: 'Go', blockingCount: 0 },
      copilotReview: { state: 'CHANGES_REQUESTED' },
    });
    assert.equal(changes.exitCode, 1);
    assert.match(changes.summary, /Copilot review requested changes/);
  });

  it('accepts csNN/slug content branches and refuses fork PRs', async () => {
    const prJson = (overrides = {}) => JSON.stringify({
      body: '',
      headRefName: 'cs52/harness-review-cli',
      headRefOid: HEAD,
      baseRefOid: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      isCrossRepository: false,
      labels: [],
      url: 'https://github.com/henrik-me/agent-harness/pull/141',
      ...overrides,
    });

    __testSeam.spawnSync = (cmd, args) => {
      if (cmd === 'gh' && args[0] === 'pr' && args[1] === 'view') {
        return { status: 0, stdout: prJson(), stderr: '' };
      }
      if (cmd === 'git') return { status: 0, stdout: '', stderr: '' };
      return { status: 1, stdout: '', stderr: `unexpected ${cmd} ${args.join(' ')}` };
    };

    const result = await runReview({
      cwd: process.cwd(),
      repo: 'henrik-me/agent-harness',
      prNumber: 141,
      rubberDuckOnly: true,
      noPoll: true,
      actor: 'yoga-ah',
    });
    assert.equal(result.status, 'dispatched');
    assert.equal(result.csId, 'CS52');
    assert.match(result.rubberDuckPrompt, /cs52\/harness-review-cli/);

    __testSeam.spawnSync = (cmd, args) => {
      if (cmd === 'gh' && args[0] === 'pr' && args[1] === 'view') {
        return { status: 0, stdout: prJson({ isCrossRepository: true }), stderr: '' };
      }
      if (cmd === 'git') return { status: 0, stdout: '', stderr: '' };
      return { status: 1, stdout: '', stderr: `unexpected ${cmd} ${args.join(' ')}` };
    };

    await assert.rejects(
      () => runReview({
        cwd: process.cwd(),
        repo: 'henrik-me/agent-harness',
        prNumber: 141,
        rubberDuckOnly: true,
        noPoll: true,
        actor: 'yoga-ah',
      }),
      (err) => err instanceof ReviewError && err.kind === 'bad-input' && /from a fork/.test(err.message),
    );
  });

  it('delegates the Copilot leg to the copilot-engage add-reviewer path (no mention comment)', async () => {
    const prJson = JSON.stringify({
      body: '',
      headRefName: 'cs52/harness-review-cli',
      headRefOid: HEAD,
      baseRefOid: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      isCrossRepository: false,
      labels: [],
      url: 'https://github.com/henrik-me/agent-harness/pull/141',
    });
    const ghCalls = [];
    __testSeam.spawnSync = (cmd, args) => {
      ghCalls.push({ cmd, args });
      if (cmd === 'gh' && args[0] === 'pr' && args[1] === 'view') {
        return { status: 0, stdout: prJson, stderr: '' };
      }
      if (cmd === 'git') return { status: 0, stdout: '', stderr: '' };
      return { status: 1, stdout: '', stderr: `unexpected ${cmd} ${args.join(' ')}` };
    };

    const engageCalls = [];
    __testSeam.engageCopilot = async ({ owner, repo, prNumber, opts }) => {
      engageCalls.push({ owner, repo, prNumber, opts });
      return { requested: true, verified: false, login: 'copilot-pull-request-reviewer', headSha: HEAD };
    };

    const result = await runReview({
      cwd: process.cwd(),
      repo: 'henrik-me/agent-harness',
      prNumber: 141,
      copilotOnly: true,
      noPoll: true,
      actor: 'yoga-ah',
    });

    assert.equal(result.status, 'dispatched');
    // Delegated to the engage seam exactly once with the add-reviewer request.
    assert.equal(engageCalls.length, 1);
    assert.deepEqual(
      { owner: engageCalls[0].owner, repo: engageCalls[0].repo, prNumber: engageCalls[0].prNumber },
      { owner: 'henrik-me', repo: 'agent-harness', prNumber: 141 },
    );
    assert.equal(engageCalls[0].opts.noPoll, true);
    assert.equal(engageCalls[0].opts.headSha, HEAD);
    // No `gh api .../comments` @-mention comment is ever posted (issue #422).
    const mentionCall = ghCalls.find(
      (call) => call.cmd === 'gh' && call.args[0] === 'api' && String(call.args[1] || '').includes('/comments'),
    );
    assert.equal(mentionCall, undefined);
  });
});
