/**
 * tests/cs101-review-engage-delegation.test.mjs — CS101 (#422) regression tests.
 *
 * `harness review`'s Copilot leg must delegate to the hardened copilot-engage
 * `--add-reviewer` path (not the ineffective @mention comment), engage AFTER
 * the rubber-duck Go with `submittedAfter = localGoAt` (A5), and translate
 * every EngageError kind into a ReviewError that preserves review's 0/1/2
 * exit contract. All Copilot round-trips are mocked via
 * `__testSeam.engageCopilot` — no network.
 *
 * Run: node --test tests/cs101-review-engage-delegation.test.mjs
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

import { __testSeam, runReview, ReviewError } from '../lib/review.mjs';
import { EngageError } from '../lib/copilot-engage.mjs';

const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const FIXED_NOW_ISO = '2026-05-14T12:00:00.000Z';

// Mirrors bin/harness.mjs `reviewExitCode` (:3485): no-go → 1, else → 2.
const reviewExitCode = (err) => (err.kind === 'no-go' ? 1 : 2);

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

function prJson(overrides = {}) {
  return JSON.stringify({
    body: '## Summary\n\nx\n',
    headRefName: 'cs52/harness-review-cli',
    headRefOid: HEAD,
    baseRefOid: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    isCrossRepository: false,
    labels: [],
    url: 'https://github.com/henrik-me/agent-harness/pull/141',
    ...overrides,
  });
}

const defaultSeam = { ...__testSeam };

beforeEach(() => {
  Object.assign(__testSeam, defaultSeam);
  __testSeam.now = () => Date.parse('2026-05-14T12:00:00Z');
  // Controlled CS markdown so parseImplementerModels is deterministic and the
  // reviewer model (gpt-5.5) never overlaps an implementer (claude-opus-4.8).
  __testSeam.readFile = () => CS_MARKDOWN;
  __testSeam.writeFile = () => {};
  __testSeam.unlink = () => {};
  __testSeam.spawnSync = (cmd, args) => {
    if (cmd === 'gh' && args[0] === 'pr' && args[1] === 'view') {
      return { status: 0, stdout: prJson(), stderr: '' };
    }
    if (cmd === 'gh' && args[0] === 'pr' && args[1] === 'edit') {
      return { status: 0, stdout: '', stderr: '' };
    }
    if (cmd === 'git') return { status: 0, stdout: '', stderr: '' };
    return { status: 1, stdout: '', stderr: `unexpected ${cmd} ${args.join(' ')}` };
  };
});

afterEach(() => {
  Object.assign(__testSeam, defaultSeam);
});

const baseArgs = {
  cwd: process.cwd(),
  repo: 'henrik-me/agent-harness',
  prNumber: 141,
  reviewerModel: 'gpt-5.5',
  actor: 'yoga-ah',
};

describe('CS101 — harness review delegates its Copilot leg to copilot-engage', () => {
  it('copilot-only drives the engage add-reviewer seam and surfaces a typed exit-2 failure when the reviewer never lands', async () => {
    let engageOpts = null;
    __testSeam.engageCopilot = async ({ owner, repo, prNumber, opts }) => {
      engageOpts = { owner, repo, prNumber, opts };
      // CS92 verify path: `gh pr edit --add-reviewer` reported success but the
      // reviewer never landed in requested_reviewers → fast typed failure
      // (NOT an unbounded poll of a reviewer that was never requested — #422).
      throw new EngageError('reviewer not requested', 'reviewer-not-requested', { requestedReviewers: [] });
    };

    await assert.rejects(
      () => runReview({ ...baseArgs, copilotOnly: true }),
      (err) => {
        assert.ok(err instanceof ReviewError, 'engage failure must become a ReviewError');
        assert.equal(err.kind, 'transport');
        assert.equal(err.engageKind, 'reviewer-not-requested');
        assert.equal(reviewExitCode(err), 2);
        return true;
      },
    );

    // Delegation actually happened, addressed to the right PR, with a HEAD
    // pin and no @mention fallback.
    assert.ok(engageOpts, 'engageCopilot must be invoked');
    assert.deepEqual(
      { owner: engageOpts.owner, repo: engageOpts.repo, prNumber: engageOpts.prNumber },
      { owner: 'henrik-me', repo: 'agent-harness', prNumber: 141 },
    );
    assert.equal(engageOpts.opts.headSha, HEAD);
    // --copilot-only has no local Go → engage floors on its own request time.
    assert.equal(engageOpts.opts.submittedAfter, undefined);
  });

  it('full path engages Copilot AFTER the rubber-duck Go and passes submittedAfter = localGoAt (A5)', async () => {
    const order = [];
    let engageOpts = null;
    __testSeam.engageCopilot = async ({ opts }) => {
      order.push('engage');
      engageOpts = opts;
      return {
        requested: true,
        verified: true,
        review: { state: 'COMMENTED', submittedAt: FIXED_NOW_ISO, commit: { oid: HEAD } },
      };
    };
    const goOutput = `Verdict: Go\nAnalyzed HEAD: ${HEAD}\n`;
    const promptRubberDuck = async () => {
      order.push('rubber-duck');
      return goOutput;
    };

    const result = await runReview({ ...baseArgs, promptRubberDuck });

    assert.equal(result.status, 'complete');
    assert.equal(result.exitCode, 0);
    // Copilot is engaged strictly AFTER the local Go is parsed (C101-2 reorder).
    assert.deepEqual(order, ['rubber-duck', 'engage']);
    // The A5 floor equals the captured local-Go timestamp, so the poll floor
    // and the Review-log Go row agree.
    assert.equal(engageOpts.submittedAfter, FIXED_NOW_ISO);
    assert.equal(engageOpts.headSha, HEAD);
  });

  it('reuses localGoAt as the Review-log Go-row timestamp (row and poll floor agree)', async () => {
    let capturedBody = null;
    __testSeam.writeFile = (_path, body) => { capturedBody = body; };
    __testSeam.engageCopilot = async ({ opts }) => ({
      requested: true,
      verified: true,
      review: { state: 'COMMENTED', submittedAt: opts.submittedAfter, commit: { oid: HEAD } },
    });
    const goOutput = `Verdict: Go\nAnalyzed HEAD: ${HEAD}\n`;

    const result = await runReview({ ...baseArgs, rubberDuckOutput: goOutput });

    assert.equal(result.status, 'complete');
    assert.ok(capturedBody, 'PR body should be written');
    // localGoAt is 2026-05-14T12:00:00Z; the row strips milliseconds.
    assert.match(capturedBody, /2026-05-14T12:00:00Z/);
  });

  it('a genuine Copilot CHANGES_REQUESTED is a review No-Go (exit 1), not an engage transport error', async () => {
    __testSeam.engageCopilot = async () => ({
      requested: true,
      verified: true,
      review: { state: 'CHANGES_REQUESTED', submittedAt: FIXED_NOW_ISO, commit: { oid: HEAD } },
    });
    const goOutput = `Verdict: Go\nAnalyzed HEAD: ${HEAD}\n`;

    await assert.rejects(
      () => runReview({ ...baseArgs, rubberDuckOutput: goOutput }),
      (err) => {
        assert.ok(err instanceof ReviewError);
        assert.equal(err.kind, 'no-go');
        assert.equal(reviewExitCode(err), 1);
        return true;
      },
    );
  });

  it('no-poll copilot leg requests the reviewer via engage (noPoll:true), never a mention comment', async () => {
    const ghCalls = [];
    __testSeam.spawnSync = (cmd, args) => {
      ghCalls.push({ cmd, args });
      if (cmd === 'gh' && args[0] === 'pr' && args[1] === 'view') {
        return { status: 0, stdout: prJson(), stderr: '' };
      }
      if (cmd === 'git') return { status: 0, stdout: '', stderr: '' };
      return { status: 1, stdout: '', stderr: `unexpected ${cmd} ${args.join(' ')}` };
    };
    let engageOpts = null;
    __testSeam.engageCopilot = async ({ opts }) => {
      engageOpts = opts;
      return { requested: true, verified: false, login: 'copilot-pull-request-reviewer', headSha: HEAD };
    };

    const result = await runReview({ ...baseArgs, copilotOnly: true, noPoll: true });

    assert.equal(result.status, 'dispatched');
    assert.equal(engageOpts.noPoll, true);
    assert.equal(engageOpts.headSha, HEAD);
    assert.equal(result.copilotDispatch.requested, true);
    const mentionCall = ghCalls.find(
      (call) => call.cmd === 'gh' && call.args[0] === 'api' && String(call.args[1] || '').includes('/comments'),
    );
    assert.equal(mentionCall, undefined);
  });

  it('skips the Copilot engage entirely with --rubber-duck-only', async () => {
    let engaged = false;
    __testSeam.engageCopilot = async () => { engaged = true; return {}; };
    const goOutput = `Verdict: Go\nAnalyzed HEAD: ${HEAD}\n`;

    const result = await runReview({ ...baseArgs, rubberDuckOnly: true, rubberDuckOutput: goOutput });

    assert.equal(result.status, 'complete');
    assert.equal(engaged, false);
    assert.equal(result.copilotReview, null);
  });

  it('dry-run planned actions describe the reviewer-attachment engage path (not a mention)', async () => {
    const result = await runReview({ ...baseArgs, dryRun: true });
    assert.equal(result.status, 'dry-run');
    const joined = result.actions.join('\n');
    assert.match(joined, /request the Copilot reviewer via the copilot-engage --add-reviewer path/);
    assert.doesNotMatch(joined, /trigger Copilot via/);
    assert.doesNotMatch(joined, /\bmention\b/);
  });

  describe('every EngageError kind maps to the expected review exit', () => {
    const KIND_TO_REVIEW = [
      ['bad-input', 'bad-input', 2],
      ['timeout', 'timeout', 2],
      ['auth-missing', 'transport', 2],
      ['network', 'transport', 2],
      ['cache-write-failed', 'transport', 2],
      ['reviewer-not-requested', 'transport', 2],
      ['reviewer-verify-unavailable', 'transport', 2],
      ['fork-source', 'transport', 2],
    ];

    for (const [engageKind, reviewKind, exit] of KIND_TO_REVIEW) {
      it(`EngageError '${engageKind}' → ReviewError '${reviewKind}' (exit ${exit})`, async () => {
        __testSeam.engageCopilot = async () => {
          throw new EngageError(`${engageKind} failure`, engageKind);
        };

        await assert.rejects(
          () => runReview({ ...baseArgs, copilotOnly: true }),
          (err) => {
            assert.ok(err instanceof ReviewError);
            assert.equal(err.kind, reviewKind);
            assert.equal(err.engageKind, engageKind);
            assert.equal(reviewExitCode(err), exit);
            // The faithful engage message is preserved.
            assert.match(err.message, new RegExp(`${engageKind} failure`));
            return true;
          },
        );
      });
    }
  });
});
