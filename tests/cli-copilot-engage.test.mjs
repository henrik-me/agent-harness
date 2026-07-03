/**
 * tests/cli-copilot-engage.test.mjs — Tests for CS41 Copilot engagement helper + CLI route.
 *
 * Network and gh calls are mocked through lib/copilot-engage.mjs's __testSeam.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  __testSeam,
  engageCopilot,
  EngageError,
  resolveCopilotIdentity,
} from '../lib/copilot-engage.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const HARNESS = path.join(REPO_ROOT, 'bin', 'harness.mjs');
const NODE = process.execPath;

const OWNER = 'henrik-me';
const REPO = 'agent-harness';
const PR_NUMBER = 41;
const HEAD_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OLD_SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const COPILOT_LOGIN = 'copilot-pull-request-reviewer';
const DAY_MS = 24 * 60 * 60 * 1000;

const defaultSeam = { ...__testSeam };
let scratch;

beforeEach(() => {
  Object.assign(__testSeam, defaultSeam);
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cs41-engage-'));
});

afterEach(() => {
  Object.assign(__testSeam, defaultSeam);
  fs.rmSync(scratch, { recursive: true, force: true });
});

function prNode({ isCrossRepository = false, headRefOid = HEAD_SHA } = {}) {
  return {
    repository: {
      pullRequest: {
        id: 'PR_kwDOExample',
        isCrossRepository,
        headRefOid,
      },
    },
  };
}

function identityNode({ id = 'BOT_kgDOCnlnWA', login = COPILOT_LOGIN } = {}) {
  return {
    node: { __typename: 'Bot', id, login },
  };
}

function review({ state = 'COMMENTED', oid = HEAD_SHA, submittedAt = '2026-05-13T09:42:15Z' } = {}) {
  return {
    state,
    submittedAt,
    commit: { oid },
    author: { __typename: 'Bot', login: COPILOT_LOGIN },
  };
}

function reviews(nodes) {
  return {
    repository: {
      pullRequest: {
        reviews: { nodes },
      },
    },
  };
}

// CS92 C92-2: engageCopilot reads requested_reviewers (via graphqlFn) after the
// add mutation to verify the Copilot reviewer landed. Full-path engage
// sequences must include this response between identity resolution and the
// review poll. Default includes the Copilot login so verification passes.
function reviewRequests(logins = [COPILOT_LOGIN]) {
  return {
    repository: {
      pullRequest: {
        reviewRequests: {
          nodes: logins.map((login) => ({
            requestedReviewer: { __typename: 'Bot', login },
          })),
        },
      },
    },
  };
}

function installGraphqlSequence(responses) {
  const calls = [];
  __testSeam.graphqlFn = async (query, vars) => {
    calls.push({ query, vars });
    assert.ok(responses.length > 0, `unexpected GraphQL call: ${query}`);
    const next = responses.shift();
    return typeof next === 'function' ? next(query, vars) : next;
  };
  return calls;
}

describe('copilot-engage library', () => {
  it('happy path requests Copilot review and finds an immediate review at HEAD', async () => {
    // Use controlled clock so the submittedAfter floor (= now() at engage time)
    // is BEFORE the mocked review's submittedAt — see CS41 R1 finding #1.
    let now = Date.parse('2026-05-13T09:42:00Z');
    __testSeam.now = () => now;
    __testSeam.sleep = async (ms) => { now += ms; };

    const graphqlCalls = installGraphqlSequence([
      prNode(),
      identityNode(),
      reviewRequests(),
      reviews([review({ submittedAt: '2026-05-13T09:42:30Z' })]),
    ]);
    const requests = [];
    __testSeam.requestFn = async (repo, prNumber, opts) => {
      requests.push({ repo, prNumber, opts });
      return { ok: true, login: opts.login };
    };

    const result = await engageCopilot({
      owner: OWNER,
      repo: REPO,
      prNumber: PR_NUMBER,
      opts: { cacheDir: scratch, headSha: HEAD_SHA, timeoutMs: 100, intervalMs: 10 },
    });

    assert.equal(result.requested, true);
    assert.equal(result.verified, true);
    assert.equal(result.login, COPILOT_LOGIN);
    assert.equal(result.review.state, 'COMMENTED');
    assert.equal(result.review.commit.oid, HEAD_SHA);
    assert.ok(result.engageRequestedAt, 'result.engageRequestedAt must be present');
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0].repo, { owner: OWNER, repo: REPO });
    assert.equal(requests[0].prNumber, PR_NUMBER);
    assert.equal(requests[0].opts.login, COPILOT_LOGIN);
    assert.equal(graphqlCalls.length, 4);
    assert.deepEqual(graphqlCalls[3].vars, { owner: OWNER, name: REPO, num: PR_NUMBER });
  });

  it('rejects stale Copilot review on same HEAD that predates the engage request (A5 ordering — CS41 R1 #1)', async () => {
    // Stale Copilot review submitted BEFORE the engage call must NOT satisfy
    // the poll, even though state + headSha both match. This is the A5+A16
    // ordering doctrine — the engage poll predicate matches
    // scripts/check-copilot-review.mjs's "submittedAt > latestLocalGo" floor
    // by using engageRequestedAt as the implicit floor.
    let now = Date.parse('2026-05-13T10:00:00Z');
    __testSeam.now = () => now;
    __testSeam.sleep = async (ms) => { now += ms; };

    const stale = review({ submittedAt: '2026-05-13T09:00:00Z' }); // 1h before engage
    installGraphqlSequence([
      prNode(),
      identityNode(),
      reviewRequests(),
      reviews([stale]),
      reviews([stale]),
      reviews([stale]),
      reviews([stale]),
    ]);
    __testSeam.requestFn = async (_repo, _prNumber, opts) => ({ ok: true, login: opts.login });

    await assert.rejects(
      engageCopilot({
        owner: OWNER,
        repo: REPO,
        prNumber: PR_NUMBER,
        opts: { cacheDir: scratch, headSha: HEAD_SHA, timeoutMs: 30, intervalMs: 10 },
      }),
      (err) => {
        assert.ok(err instanceof EngageError, 'must raise EngageError');
        assert.equal(err.kind, 'timeout', 'stale-only reviews must drive the poll to timeout');
        assert.match(err.message, /submitted at or after/);
        return true;
      },
    );
  });

  it('honors --submitted-after caller floor when later than engage timestamp', async () => {
    let now = Date.parse('2026-05-13T10:00:00Z');
    __testSeam.now = () => now;
    __testSeam.sleep = async (ms) => { now += ms; };

    // Floor is 1h AFTER engage time. A review submitted at engage-time but
    // before the floor must NOT satisfy.
    const callerFloor = '2026-05-13T11:00:00Z';
    const callerFloorCanonical = new Date(callerFloor).toISOString();
    installGraphqlSequence([
      prNode(),
      identityNode(),
      reviewRequests(),
      reviews([review({ submittedAt: '2026-05-13T10:30:00Z' })]),
      reviews([review({ submittedAt: '2026-05-13T10:30:00Z' })]),
      reviews([review({ submittedAt: '2026-05-13T10:30:00Z' })]),
      reviews([review({ submittedAt: '2026-05-13T10:30:00Z' })]),
    ]);
    __testSeam.requestFn = async (_repo, _prNumber, opts) => ({ ok: true, login: opts.login });

    await assert.rejects(
      engageCopilot({
        owner: OWNER,
        repo: REPO,
        prNumber: PR_NUMBER,
        opts: {
          cacheDir: scratch,
          headSha: HEAD_SHA,
          timeoutMs: 30,
          intervalMs: 10,
          submittedAfter: callerFloor,
        },
      }),
      (err) => {
        assert.ok(err instanceof EngageError);
        assert.equal(err.kind, 'timeout');
        assert.ok(
          err.message.includes(callerFloorCanonical),
          `expected timeout message to mention floor '${callerFloorCanonical}'; got: ${err.message}`,
        );
        return true;
      },
    );
  });

  it('polling loop times out with remediation details', async () => {
    let now = 0;
    __testSeam.now = () => now;
    __testSeam.sleep = async (ms) => {
      now += ms;
    };
    installGraphqlSequence([
      prNode(),
      identityNode(),
      reviewRequests(),
      reviews([]),
      reviews([review({ state: 'PENDING' })]),
      reviews([review({ oid: OLD_SHA })]),
      reviews([]),
    ]);
    __testSeam.requestFn = async (_repo, _prNumber, opts) => ({ ok: true, login: opts.login });

    await assert.rejects(
      engageCopilot({
        owner: OWNER,
        repo: REPO,
        prNumber: PR_NUMBER,
        opts: { cacheDir: scratch, headSha: HEAD_SHA, timeoutMs: 30, intervalMs: 10 },
      }),
      (err) => {
        assert.ok(err instanceof EngageError);
        assert.equal(err.kind, 'timeout');
        assert.equal(err.attempts, 4);
        assert.match(err.message, /Timed out after 1s waiting/);
        assert.match(err.message, /rerun 'harness copilot-engage 41'/);
        return true;
      },
    );
  });

  it('--no-poll exits after the review request and does not query reviews', async () => {
    const graphqlCalls = installGraphqlSequence([
      prNode(),
      identityNode(),
      reviewRequests(),
    ]);
    let requestCount = 0;
    __testSeam.requestFn = async (_repo, _prNumber, opts) => {
      requestCount++;
      return { ok: true, login: opts.login };
    };

    const result = await engageCopilot({
      owner: OWNER,
      repo: REPO,
      prNumber: PR_NUMBER,
      opts: { cacheDir: scratch, headSha: HEAD_SHA, noPoll: true },
    });

    assert.equal(result.requested, true);
    assert.equal(result.verified, false);
    assert.equal(result.review, undefined);
    assert.equal(result.polledMs, 0);
    assert.equal(requestCount, 1);
    assert.equal(graphqlCalls.length, 3, 'PR resolution + identity + reviewer-verify; no review poll');
  });

  it('fork-source PRs are rejected before requesting review', async () => {
    installGraphqlSequence([prNode({ isCrossRepository: true })]);
    let requestCount = 0;
    __testSeam.requestFn = async () => {
      requestCount++;
      return { ok: true, login: COPILOT_LOGIN };
    };

    await assert.rejects(
      engageCopilot({
        owner: OWNER,
        repo: REPO,
        prNumber: PR_NUMBER,
        opts: { cacheDir: scratch, headSha: HEAD_SHA },
      }),
      (err) => {
        assert.ok(err instanceof EngageError);
        assert.equal(err.kind, 'fork-source');
        assert.match(err.message, /fork PRs cannot be engaged from upstream/);
        assert.match(err.message, /ADR 0004 § ADR4-6/);
        return true;
      },
    );
    assert.equal(requestCount, 0, 'fork rejection must not request a review');
  });

  it('resolveCopilotIdentity returns a fresh cache hit without GraphQL', async () => {
    const now = 1_000_000;
    __testSeam.now = () => now;
    const cacheFile = path.join(scratch, 'copilot-id.json');
    await __testSeam.writeFile(
      cacheFile,
      JSON.stringify({ login: COPILOT_LOGIN, id: 'BOT_cached', cachedAt: now - DAY_MS }) + '\n',
      'utf8',
    );
    let graphqlCount = 0;
    __testSeam.graphqlFn = async () => {
      graphqlCount++;
      throw new Error('GraphQL should not be called for a fresh cache hit');
    };

    const result = await resolveCopilotIdentity({ cacheDir: scratch });

    assert.deepEqual(result, {
      login: COPILOT_LOGIN,
      id: 'BOT_cached',
      source: 'cache',
      cachedAt: now - DAY_MS,
    });
    assert.equal(graphqlCount, 0);
  });

  it('resolveCopilotIdentity refreshes stale cache and writes the fetched identity', async () => {
    const now = 10 * DAY_MS;
    __testSeam.now = () => now;
    const cacheFile = path.join(scratch, 'copilot-id.json');
    await __testSeam.writeFile(
      cacheFile,
      JSON.stringify({ login: COPILOT_LOGIN, id: 'BOT_old', cachedAt: now - 8 * DAY_MS }) + '\n',
      'utf8',
    );
    let graphqlCount = 0;
    __testSeam.graphqlFn = async (_query, vars) => {
      graphqlCount++;
      assert.deepEqual(vars, { id: 'BOT_kgDOCnlnWA' });
      return identityNode({ id: 'BOT_new' });
    };

    const result = await resolveCopilotIdentity({ cacheDir: scratch });
    const written = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));

    assert.equal(result.source, 'fetched');
    assert.equal(result.id, 'BOT_new');
    assert.equal(result.cachedAt, now);
    assert.equal(graphqlCount, 1);
    assert.deepEqual(written, { login: COPILOT_LOGIN, id: 'BOT_new', cachedAt: now });
  });

  it('resolveCopilotIdentity falls back to ~/.cache/harness when cacheDir is null (CS41 PR #176 hotfix)', async () => {
    const now = 5_000_000;
    __testSeam.now = () => now;
    let resolvedCacheDir = null;
    let resolvedCacheFile = null;
    __testSeam.readFile = async (filePath) => {
      resolvedCacheFile = filePath;
      const err = new Error('ENOENT');
      err.code = 'ENOENT';
      throw err;
    };
    __testSeam.mkdir = async (dirPath) => {
      resolvedCacheDir = dirPath;
    };
    __testSeam.writeFile = async () => {};
    __testSeam.graphqlFn = async () => identityNode({ id: 'BOT_default_dir' });

    const result = await resolveCopilotIdentity({ cacheDir: null });

    assert.equal(result.source, 'fetched');
    assert.equal(result.id, 'BOT_default_dir');
    assert.ok(
      typeof resolvedCacheDir === 'string' && resolvedCacheDir.length > 0,
      `expected resolved cacheDir string, got: ${resolvedCacheDir}`,
    );
    assert.ok(
      resolvedCacheDir.includes('.cache') && resolvedCacheDir.includes('harness'),
      `expected default cacheDir under ~/.cache/harness, got: ${resolvedCacheDir}`,
    );
    assert.equal(
      resolvedCacheFile,
      path.join(resolvedCacheDir, 'copilot-id.json'),
      'cacheFile path must compose default cacheDir + copilot-id.json',
    );
  });
});

describe('harness copilot-engage CLI route', () => {
  it('--help documents CS41 flags and exit codes', () => {
    const result = spawnSync(NODE, [HARNESS, 'copilot-engage', '--help'], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    for (const flag of [
      '--repo',
      '--poll-timeout',
      '--poll-interval',
      '--no-poll',
      '--submitted-after',
      '--cache-dir',
      '--cache-ttl',
      '--quiet',
      '--json',
      '--help',
    ]) {
      assert.match(result.stdout, new RegExp(flag.replace(/-/g, '\\-')), `missing flag: ${flag}`);
    }
    assert.match(result.stdout, /Exit codes:/);
    assert.match(result.stdout, /poll timeout/);
  });

  it('top-level --help lists copilot-engage subcommand', () => {
    const result = spawnSync(NODE, [HARNESS, '--help'], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /copilot-engage\s+Request Copilot review/);
  });

  it('bad-input non-integer PR number exits 2 before git or GitHub access', () => {
    const result = spawnSync(NODE, [HARNESS, 'copilot-engage', 'not-a-pr'], { encoding: 'utf8' });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /<pr> must be a positive integer/);
  });
});

// CS45 — fs cache-write failures must surface as EngageError(kind='cache-write-failed')
// rather than raw node:fs errors leaking past the CLI's typed-error handler.
// Each test re-sets `__testSeam` in a try/finally to prevent the injected throw
// from bleeding into subsequent tests (per CS45 R2).
describe('CS45 — resolveCopilotIdentity wraps fs errors as EngageError', () => {
  it('mkdir EACCES surfaces as kind=cache-write-failed with cause preserved', async () => {
    const original = { mkdir: __testSeam.mkdir, writeFile: __testSeam.writeFile, graphqlFn: __testSeam.graphqlFn, readFile: __testSeam.readFile };
    try {
      const eaccess = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES', syscall: 'mkdir' });
      __testSeam.readFile = async () => {
        const enoent = new Error('ENOENT');
        enoent.code = 'ENOENT';
        throw enoent;
      };
      __testSeam.mkdir = async () => { throw eaccess; };
      __testSeam.writeFile = async () => {};
      __testSeam.graphqlFn = async () => identityNode({ id: 'BOT_kgDOCnlnWA' });

      await assert.rejects(
        resolveCopilotIdentity({ cacheDir: scratch }),
        (err) => {
          assert.ok(err instanceof EngageError, 'must raise EngageError');
          assert.equal(err.kind, 'cache-write-failed');
          assert.equal(err.cause, eaccess, 'original fs error must be preserved as err.cause');
          assert.match(err.message, /Failed to write Copilot identity cache/);
          assert.match(err.message, /EACCES/);
          assert.match(err.message, /syscall: mkdir/);
          return true;
        },
      );
    } finally {
      Object.assign(__testSeam, original);
    }
  });

  it('writeFile ENOSPC surfaces as kind=cache-write-failed with cause preserved', async () => {
    const original = { mkdir: __testSeam.mkdir, writeFile: __testSeam.writeFile, graphqlFn: __testSeam.graphqlFn, readFile: __testSeam.readFile };
    try {
      const enospc = Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC', syscall: 'write' });
      __testSeam.readFile = async () => {
        const enoent = new Error('ENOENT');
        enoent.code = 'ENOENT';
        throw enoent;
      };
      __testSeam.mkdir = async () => {};
      __testSeam.writeFile = async () => { throw enospc; };
      __testSeam.graphqlFn = async () => identityNode({ id: 'BOT_kgDOCnlnWA' });

      await assert.rejects(
        resolveCopilotIdentity({ cacheDir: scratch }),
        (err) => {
          assert.ok(err instanceof EngageError, 'must raise EngageError');
          assert.equal(err.kind, 'cache-write-failed');
          assert.equal(err.cause, enospc, 'original fs error must be preserved as err.cause');
          assert.match(err.message, /Failed to write Copilot identity cache/);
          assert.match(err.message, /ENOSPC/);
          assert.match(err.message, /syscall: write/);
          return true;
        },
      );
    } finally {
      Object.assign(__testSeam, original);
    }
  });

  it('CLI exits 5 with --cache-dir hint when the cache dir is unwritable (no stack trace)', () => {
    // Smoke-test the CLI's typed-error envelope at the process boundary. We
    // construct an unwritable cache-dir path (a child of a non-existent
    // directory under C:\) and invoke `harness copilot-engage` against a
    // bogus PR. The cmdCopilotEngage flow hits multiple early-exit points
    // before reaching the cache-write seam — `git rev-parse HEAD` (via
    // detectGitHead), then the GraphQL identity-resolve fetch which needs
    // GITHUB_TOKEN — so we cannot guarantee the test reaches exit 5
    // deterministically (auth-missing exit 4 is a possible early exit when
    // GITHUB_TOKEN is cleared). What we CAN guarantee at the process
    // boundary: any failure path must produce a typed-error exit code
    // (2/3/4/5) and never leak a raw `at ...` stack frame past the CLI's
    // top-level catch. Unit tests (a) + (b) above cover the actual
    // EACCES/ENOSPC paths via __testSeam injection. Note: this test is
    // Windows-targeted (the C:\ path is unlikely to be writable on the
    // CI runner); on non-Windows the path may be auto-created during
    // mkdir-recursive — but since the GraphQL fetch fails first under
    // the cleared-token env, the test still asserts the typed-error
    // contract regardless of platform.
    const unwritable = path.join('C:', 'nonexistent-dir-cs45-test', 'cache');
    const result = spawnSync(
      NODE,
      [HARNESS, 'copilot-engage', '999', '--repo', 'henrik-me/agent-harness', '--no-poll', '--cache-dir', unwritable],
      { encoding: 'utf8', cwd: scratch, env: { ...process.env, GITHUB_TOKEN: '', GH_TOKEN: '' } },
    );
    // Exit code must be a known typed-error code (2/3/4/5), never 0 (success)
    // nor 1 (uncaught-throw fallback) since the CLI wraps all EngageErrors.
    assert.ok([2, 4, 5].includes(result.status), `expected typed-error exit code; got ${result.status}\nstderr:\n${result.stderr}\nstdout:\n${result.stdout}`);
    // No raw stack trace should leak past the typed-error handler.
    assert.doesNotMatch(result.stderr, /^\s+at .*\(/m, `unexpected stack frame in stderr:\n${result.stderr}`);
    // If we hit the cache-write-failed path, verify the hint is present.
    if (result.status === 5) {
      assert.match(result.stderr, /cache write failed/);
      assert.match(result.stderr, /--cache-dir/);
    }
  });
});
