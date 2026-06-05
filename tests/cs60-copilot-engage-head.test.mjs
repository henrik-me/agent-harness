import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseCopilotEngageArgs } from '../bin/harness.mjs';
import { __testSeam, engageCopilot } from '../lib/copilot-engage.mjs';

const OWNER = 'henrik-me';
const REPO = 'agent-harness';
const PR_HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OVERRIDE_HEAD = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const COPILOT_LOGIN = 'copilot-pull-request-reviewer';

const defaultSeam = { ...__testSeam };
let scratch;

beforeEach(() => {
  Object.assign(__testSeam, defaultSeam);
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cs60-engage-head-'));
});

afterEach(() => {
  Object.assign(__testSeam, defaultSeam);
  fs.rmSync(scratch, { recursive: true, force: true });
});

function dieAsThrow(message, code) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

function parse(args) {
  return parseCopilotEngageArgs(args, process.cwd(), { dieFn: dieAsThrow });
}

function prNode(headRefOid = PR_HEAD) {
  return {
    repository: {
      pullRequest: {
        id: 'PR_kwDOExample',
        isCrossRepository: false,
        headRefOid,
      },
    },
  };
}

function identityNode() {
  return {
    node: { __typename: 'Bot', id: 'BOT_kgDOCnlnWA', login: COPILOT_LOGIN },
  };
}

function reviewsAt(oid) {
  return {
    repository: {
      pullRequest: {
        reviews: {
          nodes: [
            {
              state: 'COMMENTED',
              submittedAt: '2026-06-04T12:00:01Z',
              commit: { oid },
              author: { __typename: 'Bot', login: COPILOT_LOGIN },
            },
          ],
        },
      },
    },
  };
}

describe('CS60 copilot-engage HEAD selection', () => {
  it('accepts --head <sha> as an explicit poll override', () => {
    const parsed = parse(['123', '--repo', `${OWNER}/${REPO}`, '--head', OVERRIDE_HEAD]);

    assert.equal(parsed.prNumber, 123);
    assert.equal(parsed.repo, `${OWNER}/${REPO}`);
    assert.equal(parsed.headSha, OVERRIDE_HEAD);
  });

  it('rejects --head without a guarded value with exit code 2', () => {
    assert.throws(
      () => parse(['123', '--repo', `${OWNER}/${REPO}`, '--head', '--quiet']),
      (err) => {
        assert.equal(err.code, 2);
        assert.match(err.message, /missing value for --head/);
        return true;
      },
    );
  });

  it('does not force a local HEAD override when --head is omitted', () => {
    const parsed = parse(['123', '--repo', `${OWNER}/${REPO}`]);

    assert.equal(parsed.headSha, undefined);
  });

  it('defaults the library poll HEAD to the PR headRefOid when headSha is undefined', async () => {
    let now = Date.parse('2026-06-04T12:00:00Z');
    const resolvedHeads = [];
    const graphqlResponses = [prNode(PR_HEAD), identityNode(), reviewsAt(PR_HEAD)];

    __testSeam.now = () => now;
    __testSeam.sleep = async (ms) => { now += ms; };
    __testSeam.graphqlFn = async () => {
      assert.ok(graphqlResponses.length > 0, 'unexpected GraphQL call');
      return graphqlResponses.shift();
    };
    __testSeam.requestFn = async (_repo, _prNumber, opts) => ({ ok: true, login: opts.login });

    const result = await engageCopilot({
      owner: OWNER,
      repo: REPO,
      prNumber: 123,
      opts: {
        cacheDir: scratch,
        timeoutMs: 100,
        intervalMs: 10,
        onResolvedHead: (head) => resolvedHeads.push(head),
      },
    });

    assert.equal(result.headSha, PR_HEAD);
    assert.equal(result.headRefOid, PR_HEAD);
    assert.deepEqual(resolvedHeads, [{ headSha: PR_HEAD, prHeadSha: PR_HEAD }]);
    assert.equal(result.review.commit.oid, PR_HEAD);
  });
});
