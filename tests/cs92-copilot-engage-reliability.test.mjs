/**
 * tests/cs92-copilot-engage-reliability.test.mjs — CS92 reliability hardening.
 *
 * Covers (C92-5):
 *   (a) transient 401 retried then success
 *   (b) auth-missing fails fast (no retry)
 *   (c) silent add no-op self-heals via one re-add
 *   (d) persistent add no-op → reviewer-not-requested fast failure (not timeout)
 *   (e) --no-poll returns verified:false (library success, no throw)
 *   (f) poll returns verified:true ONLY for a review at HEAD after the floor
 *   (g) non-transient permission/scope gh failure fails fast (no retry)
 *   + isTransientGhError truth table
 *   + no-poll unreadable-reviewer-list → verified:false with a ::notice::
 *   + poll unreadable-reviewer-list → reviewer-verify-unavailable typed error
 *
 * All network/gh calls are mocked through lib/copilot-engage.mjs's __testSeam.
 */

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { __testSeam, engageCopilot, EngageError } from '../lib/copilot-engage.mjs';
import { GraphQLError, isTransientGhError } from '../lib/github-graphql.mjs';

const OWNER = 'henrik-me';
const REPO = 'agent-harness';
const PR_NUMBER = 92;
const HEAD_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER_SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const COPILOT_LOGIN = 'copilot-pull-request-reviewer';
const FUTURE_ISO = '2026-07-03T06:00:00Z';

const defaultSeam = { ...__testSeam };
let scratch;

beforeEach(() => {
  Object.assign(__testSeam, defaultSeam);
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cs92-engage-'));
});

afterEach(() => {
  Object.assign(__testSeam, defaultSeam);
  fs.rmSync(scratch, { recursive: true, force: true });
});

// --- Response builders -----------------------------------------------------

function prNodeResp(headRefOid = HEAD_SHA) {
  return {
    repository: {
      pullRequest: { id: 'PR_kwDOExample', isCrossRepository: false, headRefOid },
    },
  };
}

function identityResp() {
  return { node: { __typename: 'Bot', id: 'BOT_kgDOCnlnWA', login: COPILOT_LOGIN } };
}

function reviewRequestsResp(logins) {
  return {
    repository: {
      pullRequest: {
        reviewRequests: {
          nodes: logins.map((login) => ({ requestedReviewer: { __typename: 'Bot', login } })),
        },
      },
    },
  };
}

function reviewNode({ state = 'COMMENTED', oid = HEAD_SHA, submittedAt = FUTURE_ISO } = {}) {
  return { state, submittedAt, commit: { oid }, author: { __typename: 'Bot', login: COPILOT_LOGIN } };
}

function reviewsResp(nodes) {
  return { repository: { pullRequest: { reviews: { nodes } } } };
}

function transient401() {
  return new GraphQLError('HTTP 401: Bad credentials', 'network', {
    httpStatus: 401,
    exitCode: 1,
    stderr: 'HTTP 401: Bad credentials',
  });
}

function classifyQuery(query) {
  if (query.includes('isCrossRepository')) return 'prNode';
  if (query.includes('reviewRequests')) return 'reviewRequests';
  if (query.includes('reviews(last')) return 'reviewPoll';
  if (query.includes('node(id')) return 'identityNode';
  if (query.includes('user(login')) return 'identityUser';
  return 'unknown';
}

// Build a graphqlFn that dispatches by query type. Each handler is either a
// static response object or a function receiving the 1-based call index for
// that type (so it can throw on early calls and succeed later).
function makeGraphqlFn(handlers) {
  const counts = {};
  const fn = async (query) => {
    const type = classifyQuery(query);
    counts[type] = (counts[type] || 0) + 1;
    const h = handlers[type];
    if (h === undefined) throw new Error(`unexpected graphql call type=${type}`);
    return typeof h === 'function' ? h(counts[type]) : h;
  };
  fn.counts = counts;
  return fn;
}

function installClock() {
  let now = Date.parse('2026-07-03T00:00:00Z');
  const sleeps = [];
  __testSeam.now = () => now;
  __testSeam.sleep = async (ms) => {
    sleeps.push(ms);
    now += ms;
  };
  return { sleeps };
}

function engage(opts = {}) {
  return engageCopilot({
    owner: OWNER,
    repo: REPO,
    prNumber: PR_NUMBER,
    opts: { cacheDir: scratch, headSha: HEAD_SHA, timeoutMs: 100, intervalMs: 10, ...opts },
  });
}

describe('CS92 — transient-flake retry (C92-1)', () => {
  it('(a) retries a transient 401 then succeeds within the retry budget', async () => {
    const { sleeps } = installClock();
    __testSeam.requestFn = async (_r, _p, opts) => ({ ok: true, login: opts.login });
    __testSeam.graphqlFn = makeGraphqlFn({
      prNode: (n) => {
        if (n <= 2) throw transient401();
        return prNodeResp();
      },
      identityNode: identityResp(),
      reviewRequests: reviewRequestsResp([COPILOT_LOGIN]),
      reviewPoll: reviewsResp([reviewNode()]),
    });

    const result = await engage();

    assert.equal(result.requested, true);
    assert.equal(result.verified, true);
    assert.equal(result.review.commit.oid, HEAD_SHA);
    assert.equal(sleeps.length, 2, 'two transient 401s must be retried (two backoff sleeps)');
  });

  it('(b) a real auth-missing error fails fast with no retry', async () => {
    const { sleeps } = installClock();
    __testSeam.requestFn = async (_r, _p, opts) => ({ ok: true, login: opts.login });
    __testSeam.graphqlFn = makeGraphqlFn({
      prNode: () => {
        throw new GraphQLError('no credential', 'auth-missing');
      },
    });

    await assert.rejects(engage(), (err) => {
      assert.ok(err instanceof EngageError);
      assert.equal(err.kind, 'auth-missing');
      return true;
    });
    assert.equal(sleeps.length, 0, 'auth-missing must NOT be retried');
  });

  it('(g) a permission/scope gh failure fails fast with no retry', async () => {
    const { sleeps } = installClock();
    __testSeam.requestFn = async (_r, _p, opts) => ({ ok: true, login: opts.login });
    __testSeam.graphqlFn = makeGraphqlFn({
      prNode: () => {
        throw new GraphQLError("'gh' failed (exit 1): Resource not accessible by integration", 'network', {
          exitCode: 1,
          stderr: 'HTTP 403: Resource not accessible by integration',
        });
      },
    });

    await assert.rejects(engage(), (err) => {
      assert.ok(err instanceof EngageError);
      assert.equal(err.kind, 'network');
      return true;
    });
    assert.equal(sleeps.length, 0, 'a permission/scope denial must NOT be retried');
  });
});

describe('CS92 — post-add reviewer verification (C92-2)', () => {
  it('(c) a silent add no-op self-heals via one bounded re-add', async () => {
    installClock();
    let addCount = 0;
    __testSeam.requestFn = async (_r, _p, opts) => {
      addCount++;
      return { ok: true, login: opts.login };
    };
    __testSeam.graphqlFn = makeGraphqlFn({
      prNode: prNodeResp(),
      identityNode: identityResp(),
      reviewRequests: (n) => (n === 1 ? reviewRequestsResp([]) : reviewRequestsResp([COPILOT_LOGIN])),
      reviewPoll: reviewsResp([reviewNode()]),
    });

    const result = await engage();

    assert.equal(result.verified, true);
    assert.equal(addCount, 2, 'silent no-op must trigger exactly one re-add');
  });

  it('(d) a persistent add no-op fails fast as reviewer-not-requested (not a timeout)', async () => {
    installClock();
    let addCount = 0;
    let pollCount = 0;
    __testSeam.requestFn = async (_r, _p, opts) => {
      addCount++;
      return { ok: true, login: opts.login };
    };
    __testSeam.graphqlFn = makeGraphqlFn({
      prNode: prNodeResp(),
      identityNode: identityResp(),
      reviewRequests: reviewRequestsResp([]),
      reviewPoll: () => {
        pollCount++;
        return reviewsResp([reviewNode()]);
      },
    });

    await assert.rejects(engage(), (err) => {
      assert.ok(err instanceof EngageError);
      assert.equal(err.kind, 'reviewer-not-requested');
      assert.notEqual(err.kind, 'timeout');
      assert.match(err.message, /was not requested/);
      return true;
    });
    assert.equal(addCount, 2, 'exactly one bounded re-add (initial add + one retry)');
    assert.equal(pollCount, 0, 'must fail before polling, not via a poll timeout');
  });

  it('(bonus) an unreadable reviewer list in poll mode throws reviewer-verify-unavailable', async () => {
    installClock();
    __testSeam.requestFn = async (_r, _p, opts) => ({ ok: true, login: opts.login });
    __testSeam.graphqlFn = makeGraphqlFn({
      prNode: prNodeResp(),
      identityNode: identityResp(),
      reviewRequests: () => {
        throw transient401();
      },
    });

    await assert.rejects(engage(), (err) => {
      assert.ok(err instanceof EngageError);
      assert.equal(err.kind, 'reviewer-verify-unavailable');
      return true;
    });
  });

  it('(bonus) an unreadable reviewer list in no-poll mode returns verified:false with a ::notice::', async () => {
    installClock();
    const notices = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk, ...rest) => {
      notices.push(String(chunk));
      return true;
    };
    try {
      __testSeam.requestFn = async (_r, _p, opts) => ({ ok: true, login: opts.login });
      __testSeam.graphqlFn = makeGraphqlFn({
        prNode: prNodeResp(),
        identityNode: identityResp(),
        reviewRequests: () => {
          throw transient401();
        },
      });

      const result = await engage({ noPoll: true });

      assert.equal(result.requested, true);
      assert.equal(result.verified, false);
    } finally {
      process.stderr.write = originalWrite;
    }
    assert.ok(
      notices.some((n) => n.includes('::notice::') && n.includes('unverified')),
      `expected a ::notice:: about unverified reviewer; got: ${JSON.stringify(notices)}`,
    );
  });
});

describe('CS92 — trustworthy success semantics (C92-3)', () => {
  it('(e) --no-poll returns verified:false (library success, no throw)', async () => {
    installClock();
    __testSeam.requestFn = async (_r, _p, opts) => ({ ok: true, login: opts.login });
    __testSeam.graphqlFn = makeGraphqlFn({
      prNode: prNodeResp(),
      identityNode: identityResp(),
      reviewRequests: reviewRequestsResp([COPILOT_LOGIN]),
    });

    const result = await engage({ noPoll: true });

    assert.equal(result.requested, true);
    assert.equal(result.verified, false, 'no-poll is explicitly unverified');
    assert.equal(result.review, undefined);
    assert.equal(result.polledMs, 0);
  });

  it('(f) poll returns verified:true ONLY for a review at HEAD after the floor', async () => {
    installClock();
    __testSeam.requestFn = async (_r, _p, opts) => ({ ok: true, login: opts.login });
    __testSeam.graphqlFn = makeGraphqlFn({
      prNode: prNodeResp(),
      identityNode: identityResp(),
      reviewRequests: reviewRequestsResp([COPILOT_LOGIN]),
      reviewPoll: reviewsResp([reviewNode({ oid: HEAD_SHA, submittedAt: FUTURE_ISO })]),
    });

    const result = await engage();

    assert.equal(result.verified, true);
    assert.equal(result.review.commit.oid, HEAD_SHA);
  });

  it('(f) a review at a DIFFERENT commit never yields a verified success (times out)', async () => {
    installClock();
    __testSeam.requestFn = async (_r, _p, opts) => ({ ok: true, login: opts.login });
    __testSeam.graphqlFn = makeGraphqlFn({
      prNode: prNodeResp(),
      identityNode: identityResp(),
      reviewRequests: reviewRequestsResp([COPILOT_LOGIN]),
      reviewPoll: reviewsResp([reviewNode({ oid: OTHER_SHA, submittedAt: FUTURE_ISO })]),
    });

    await assert.rejects(engage({ timeoutMs: 30, intervalMs: 10 }), (err) => {
      assert.ok(err instanceof EngageError);
      assert.equal(err.kind, 'timeout', 'a stale-commit review must NOT satisfy the at-HEAD guarantee');
      return true;
    });
  });

  it('(f) a review at HEAD but BEFORE the floor never yields a verified success', async () => {
    installClock();
    __testSeam.requestFn = async (_r, _p, opts) => ({ ok: true, login: opts.login });
    __testSeam.graphqlFn = makeGraphqlFn({
      prNode: prNodeResp(),
      identityNode: identityResp(),
      reviewRequests: reviewRequestsResp([COPILOT_LOGIN]),
      // submitted long BEFORE the engage-request floor (2026-07-03T00:00:00Z).
      reviewPoll: reviewsResp([reviewNode({ oid: HEAD_SHA, submittedAt: '2026-07-01T00:00:00Z' })]),
    });

    await assert.rejects(engage({ timeoutMs: 30, intervalMs: 10 }), (err) => {
      assert.ok(err instanceof EngageError);
      assert.equal(err.kind, 'timeout', 'a review predating the floor must NOT satisfy');
      return true;
    });
  });
});

describe('CS92 — isTransientGhError truth table (C92-1)', () => {
  it('classifies transient vs fail-fast errors correctly', () => {
    // Transient (retry):
    assert.equal(isTransientGhError(new GraphQLError('x', 'network', { httpStatus: 401 })), true, '401 not-auth-missing → transient');
    assert.equal(isTransientGhError(new GraphQLError('x', 'network', { httpStatus: 503 })), true, '503 → transient');
    assert.equal(isTransientGhError(new GraphQLError('x', 'network', { transport: true })), true, 'transport blip → transient');
    assert.equal(isTransientGhError(new GraphQLError('x', 'http-status', { status: 500 })), true, 'http-status 500 → transient');

    // Fail fast (no retry):
    assert.equal(isTransientGhError(new GraphQLError('x', 'auth-missing')), false, 'auth-missing → fail fast');
    assert.equal(isTransientGhError(new GraphQLError('x', 'bad-input')), false, 'bad-input → fail fast');
    assert.equal(
      isTransientGhError(new GraphQLError('x', 'network', { httpStatus: 403, stderr: 'HTTP 403: Resource not accessible by integration' })),
      false,
      '403/scope → fail fast',
    );
    assert.equal(
      isTransientGhError(new GraphQLError('x', 'network', { httpStatus: 401, stderr: 'permission denied' })),
      false,
      'scope-denial stderr overrides a 401 → fail fast',
    );
    assert.equal(isTransientGhError(new GraphQLError('x', 'graphql-errors')), false, 'graphql-errors → fail fast');
    assert.equal(isTransientGhError(new Error('plain')), false, 'non-GraphQLError → fail fast');
  });
});
