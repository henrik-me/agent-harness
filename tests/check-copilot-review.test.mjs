/**
 * tests/check-copilot-review.test.mjs — Tests for the A5 + A16 Copilot review gate.
 *
 * Tests use the exported `runCheck()` function directly with a stubbed `graphqlFn` so we never
 * hit the real GitHub API. CLI behavior (argv parsing, exit codes, --help) is tested via
 * spawnSync against the script itself.
 *
 * Cases covered (ADR4-3/ADR4-4/ADR4-5/ADR4-6 + skip semantics):
 *   1. Happy path: Copilot review at HEAD with COMMENTED state → exit 0
 *   2. No Copilot review at all → exit 1, A16 missing message
 *   3. Stale Copilot review (different commit.oid) → exit 1, A16/A4 stale message
 *   4. PENDING Copilot review only → exit 1, A16 PENDING message
 *   5. APPROVED Copilot review at HEAD → exit 0
 *   6. CHANGES_REQUESTED Copilot review at HEAD → exit 0
 *   7. A5 ordering OK (Copilot.submittedAt > local Go.timestamp) → exit 0
 *   8. A5 ordering VIOLATED (Copilot.submittedAt < local Go.timestamp) → exit 1
 *   9. A5 ordering excludes Copilot rows from local Go scan → exit 0
 *  10. Fork PR (isCrossRepository=true) → exit 2, fork message
 *  11. --skip-reasons workboard-only → exit 0 with skip notice
 *  12. --skip-reasons bot-author → exit 0 with skip notice
 *  13. --skip-reasons fork-source → exit 2 (does NOT skip)
 *  14. Auth-missing GraphQL error → exit 2 with remediation
 *  15. PR not found in GraphQL response → exit 2
 *  16. Missing required args → exit 2
 *  17. Bad --head (not 40 hex) → exit 2
 *  18. Filter ignores Bot reviews from other logins (e.g. github-advanced-security)
 *  19. CLI: --help exits 0 with usage
 *  20. CLI: missing --repo exits 2
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { runCheck, findLatestLocalGoTimestamp } from '../scripts/check-copilot-review.mjs';
import { GraphQLError } from '../lib/github-graphql.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'check-copilot-review.mjs');
const NODE = process.execPath;

const HEAD_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const STALE_SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

let scratch;

before(() => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'check-copilot-review-'));
});

after(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
});

function makeStub(reviews, { isFork = false, missing = false } = {}) {
  return async (_query, _vars) => {
    if (missing) {
      return { repository: { pullRequest: null } };
    }
    return {
      repository: {
        pullRequest: {
          id: 'PR_xyz',
          headRefOid: HEAD_SHA,
          isCrossRepository: isFork,
          reviews: { nodes: reviews },
        },
      },
    };
  };
}

function copilotReview({
  state = 'COMMENTED',
  oid = HEAD_SHA,
  submittedAt = '2026-05-13T09:42:15Z',
  login = 'copilot-pull-request-reviewer',
  __typename = 'Bot',
} = {}) {
  return {
    state,
    submittedAt,
    commit: { oid },
    author: { __typename, login },
  };
}

describe('check-copilot-review runCheck()', () => {
  it('1. happy path: COMMENTED Copilot review at HEAD exits 0', async () => {
    const r = await runCheck({
      repo: 'o/r',
      prNumber: 42,
      headSha: HEAD_SHA,
      quiet: true,
      graphqlFn: makeStub([copilotReview()]),
    });
    assert.equal(r.exitCode, 0, `stdout=${r.stdout.join('\n')} stderr=${r.stderr.join('\n')}`);
    assert.match(r.stdout.join('\n'), /0 errors/);
  });

  it('2. no Copilot review exits 1 with A16 missing', async () => {
    const r = await runCheck({
      repo: 'o/r',
      prNumber: 42,
      headSha: HEAD_SHA,
      graphqlFn: makeStub([]),
    });
    assert.equal(r.exitCode, 1);
    assert.match(r.stdout.join('\n'), /A16: no review by copilot-pull-request-reviewer/);
    assert.match(r.stdout.join('\n'), /Fix: run 'harness copilot-engage 42'/);
  });

  it('3. stale Copilot review exits 1 with A16/A4 message', async () => {
    const r = await runCheck({
      repo: 'o/r',
      prNumber: 42,
      headSha: HEAD_SHA,
      graphqlFn: makeStub([copilotReview({ oid: STALE_SHA })]),
    });
    assert.equal(r.exitCode, 1);
    assert.match(r.stdout.join('\n'), /A16\/A4: latest copilot-pull-request-reviewer review is on stale commit/);
  });

  it('4. PENDING Copilot review exits 1 with A16 PENDING message', async () => {
    const r = await runCheck({
      repo: 'o/r',
      prNumber: 42,
      headSha: HEAD_SHA,
      graphqlFn: makeStub([copilotReview({ state: 'PENDING' })]),
    });
    assert.equal(r.exitCode, 1);
    assert.match(r.stdout.join('\n'), /A16: latest copilot-pull-request-reviewer review is in PENDING state/);
  });

  it('5. APPROVED Copilot review at HEAD exits 0', async () => {
    const r = await runCheck({
      repo: 'o/r',
      prNumber: 42,
      headSha: HEAD_SHA,
      quiet: true,
      graphqlFn: makeStub([copilotReview({ state: 'APPROVED' })]),
    });
    assert.equal(r.exitCode, 0);
  });

  it('6. CHANGES_REQUESTED Copilot review at HEAD exits 0', async () => {
    const r = await runCheck({
      repo: 'o/r',
      prNumber: 42,
      headSha: HEAD_SHA,
      quiet: true,
      graphqlFn: makeStub([copilotReview({ state: 'CHANGES_REQUESTED' })]),
    });
    assert.equal(r.exitCode, 0);
  });

  it('7. A5 ordering OK (Copilot after local Go) exits 0', async () => {
    const bodyPath = path.join(scratch, 'body-good.md');
    fs.writeFileSync(
      bodyPath,
      [
        '## Review log',
        '',
        '| timestamp | analyzed_head | actor | model | verdict | evidence_link |',
        '|---|---|---|---|---|---|',
        '| 2026-05-13T10:00:00Z | ' + HEAD_SHA + ' | copilot | gpt-5.5 | Go | https://x |',
        '',
      ].join('\n'),
    );
    const r = await runCheck({
      repo: 'o/r',
      prNumber: 42,
      headSha: HEAD_SHA,
      prBodyPath: bodyPath,
      quiet: true,
      graphqlFn: makeStub([copilotReview({ submittedAt: '2026-05-13T20:00:00Z' })]),
    });
    assert.equal(r.exitCode, 0);
  });

  it('8. A5 ordering VIOLATED (Copilot before local Go) exits 1', async () => {
    const bodyPath = path.join(scratch, 'body-bad.md');
    fs.writeFileSync(
      bodyPath,
      [
        '## Review log',
        '',
        '| timestamp | analyzed_head | actor | model | verdict | evidence_link |',
        '|---|---|---|---|---|---|',
        '| 2026-05-13T10:00:00Z | ' + HEAD_SHA + ' | copilot | gpt-5.5 | Go | https://x |',
        '',
      ].join('\n'),
    );
    const r = await runCheck({
      repo: 'o/r',
      prNumber: 42,
      headSha: HEAD_SHA,
      prBodyPath: bodyPath,
      graphqlFn: makeStub([copilotReview({ submittedAt: '2026-05-13T05:00:00Z' })]),
    });
    assert.equal(r.exitCode, 1);
    assert.match(r.stdout.join('\n'), /A5: latest copilot-pull-request-reviewer review .* was submitted BEFORE/);
  });

  it('9. A5 ordering excludes Copilot rows from local Go scan', () => {
    // Direct test of helper: a Review log with ONLY a Copilot row should yield null.
    const ts = findLatestLocalGoTimestamp(
      [
        '## Review log',
        '',
        '| timestamp | analyzed_head | actor | model | verdict | evidence_link |',
        '|---|---|---|---|---|---|',
        '| 2026-05-13T10:00:00Z | ' + HEAD_SHA + ' | copilot-pull-request-reviewer | bot | Go | https://x |',
        '',
      ].join('\n'),
    );
    assert.equal(ts, null, 'Copilot row should be excluded from local Go scan');
  });

  it('10. fork PR exits 2 with fork message', async () => {
    const r = await runCheck({
      repo: 'o/r',
      prNumber: 42,
      headSha: HEAD_SHA,
      graphqlFn: makeStub([], { isFork: true }),
    });
    assert.equal(r.exitCode, 2);
    assert.match(r.stderr.join('\n'), /is a fork PR \(isCrossRepository=true\)/);
    assert.match(r.stderr.join('\n'), /harness copilot-engage/);
  });

  it('11. --skip-reasons workboard-only exits 0 with skip notice', async () => {
    const r = await runCheck({
      repo: 'o/r',
      prNumber: 42,
      headSha: HEAD_SHA,
      skipReasons: new Set(['workboard-only']),
    });
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout.join('\n'), /skipped \(workboard-only\)/);
  });

  it('12. --skip-reasons bot-author exits 0 with skip notice', async () => {
    const r = await runCheck({
      repo: 'o/r',
      prNumber: 42,
      headSha: HEAD_SHA,
      skipReasons: new Set(['bot-author']),
    });
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout.join('\n'), /skipped \(bot-author\)/);
  });

  it('13. --skip-reasons fork-source exits 2 (NOT a skip)', async () => {
    const r = await runCheck({
      repo: 'o/r',
      prNumber: 42,
      headSha: HEAD_SHA,
      skipReasons: new Set(['fork-source']),
    });
    assert.equal(r.exitCode, 2);
    assert.match(r.stderr.join('\n'), /fork-source PRs cannot run this gate/);
  });

  it('14. Auth-missing GraphQL error exits 2 with remediation', async () => {
    const graphqlFn = async () => {
      throw new GraphQLError('GitHub API access requires gh auth status', 'auth-missing');
    };
    const r = await runCheck({
      repo: 'o/r',
      prNumber: 42,
      headSha: HEAD_SHA,
      graphqlFn,
    });
    assert.equal(r.exitCode, 2);
    assert.match(r.stderr.join('\n'), /gh auth status/);
  });

  it('15. PR not found in GraphQL response exits 2', async () => {
    const r = await runCheck({
      repo: 'o/r',
      prNumber: 42,
      headSha: HEAD_SHA,
      graphqlFn: makeStub([], { missing: true }),
    });
    assert.equal(r.exitCode, 2);
    assert.match(r.stderr.join('\n'), /PR o\/r#42 not found via GraphQL/);
  });

  it('16. Missing required args exits 2', async () => {
    const r1 = await runCheck({ prNumber: 42, headSha: HEAD_SHA });
    assert.equal(r1.exitCode, 2);
    assert.match(r1.stderr.join('\n'), /--repo/);

    const r2 = await runCheck({ repo: 'o/r', headSha: HEAD_SHA });
    assert.equal(r2.exitCode, 2);
    assert.match(r2.stderr.join('\n'), /--pr/);

    const r3 = await runCheck({ repo: 'o/r', prNumber: 42 });
    assert.equal(r3.exitCode, 2);
    assert.match(r3.stderr.join('\n'), /--head/);
  });

  it('17. Bad --head (not 40 hex) exits 2', async () => {
    const r = await runCheck({
      repo: 'o/r',
      prNumber: 42,
      headSha: 'not-a-sha',
    });
    assert.equal(r.exitCode, 2);
    assert.match(r.stderr.join('\n'), /--head must be a 40-char SHA/);
  });

  it('18. Filter ignores Bot reviews from other logins', async () => {
    const r = await runCheck({
      repo: 'o/r',
      prNumber: 42,
      headSha: HEAD_SHA,
      graphqlFn: makeStub([
        copilotReview({ login: 'github-advanced-security', __typename: 'Bot' }),
      ]),
    });
    // Only github-advanced-security present, no Copilot — A16 must fail.
    assert.equal(r.exitCode, 1);
    assert.match(r.stdout.join('\n'), /A16: no review by copilot-pull-request-reviewer/);
  });
});

describe('check-copilot-review CLI', () => {
  it('19. --help exits 0 with usage', () => {
    const result = spawnSync(NODE, [SCRIPT, '--help'], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage: check-copilot-review.mjs/);
    assert.match(result.stdout, /A5 \+ A16 gate/);
  });

  it('20. missing --repo exits 2 with usage', () => {
    const env = { ...process.env, GITHUB_TOKEN: 'ghp_test' };
    const result = spawnSync(NODE, [SCRIPT, '--pr', '42', '--head', HEAD_SHA], {
      encoding: 'utf8',
      env,
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /--repo <owner\/repo> is required/);
  });
});
