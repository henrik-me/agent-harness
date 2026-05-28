import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { runGraphqlCheck as runThreadsGraphqlCheck } from '../scripts/checks/check-review-threads-resolved.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const SCRIPTS = {
  reviewLog: path.join(REPO_ROOT, 'scripts', 'checks', 'check-review-log-evidence.mjs'),
  copilot: path.join(REPO_ROOT, 'scripts', 'checks', 'check-copilot-review-attached.mjs'),
  independence: path.join(REPO_ROOT, 'scripts', 'checks', 'check-independence-invariant.mjs'),
  threads: path.join(REPO_ROOT, 'scripts', 'checks', 'check-review-threads-resolved.mjs'),
};
const HEAD = 'a'.repeat(40);
let scratch;

before(() => {
  scratch = mkdtempSync(path.join(os.tmpdir(), 'cs51-review-gates-'));
});

after(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function writeBody(name, content) {
  const file = path.join(scratch, name);
  writeFileSync(file, content, 'utf8');
  return file;
}

function run(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function body({
  reviewVerdict = 'Go',
  reviewModel = 'gpt-5.5',
  implementers = 'claude-opus-4.7',
  reviewer = 'gpt-5.5',
  fallback = null,
  copilotLogin = 'copilot-pull-request-reviewer[bot]',
  copilotState = 'COMMENTED',
  threadState = 'true',
} = {}) {
  const fallbackRows = fallback === null ? [] : [`| Fallback rationale | ${fallback} |`];
  return [
    '## Summary',
    'Review gate fixture.',
    '',
    '## Model audit',
    '',
    '| Field | Value |',
    '|---|---|',
    `| Implementer models | ${implementers} |`,
    `| Reviewer model | ${reviewer} |`,
    '| Implementer agent | yoga-ah |',
    '| Reviewer agent | rubber-duck |',
    ...fallbackRows,
    '',
    '## Review log',
    '',
    '| timestamp | analyzed_head | actor | model | verdict | evidence_link |',
    '|---|---|---|---|---|---|',
    `| 2026-05-14T10:32:00Z | ${HEAD} | yoga-ah | ${reviewModel} | ${reviewVerdict} | https://github.com/henrik-me/agent-harness/pull/1#issuecomment-1 |`,
    '',
    '## Copilot review',
    '',
    '| login | state |',
    '|---|---|',
    `| ${copilotLogin} | ${copilotState} |`,
    '',
    '## Review threads',
    '',
    '| id | isResolved |',
    '|---|---|',
    `| RT_1 | ${threadState} |`,
    '',
  ].join('\n');
}

describe('CS51 review gate scripts', () => {
  it('each script exposes --help', () => {
    for (const script of Object.values(SCRIPTS)) {
      const r = run(script, ['--help']);
      assert.equal(r.status, 0, `${script}\nstdout=${r.stdout}\nstderr=${r.stderr}`);
      assert.match(r.stdout, /Usage:/);
    }
  });

  it('review-log-evidence passes a real GPT-5.5 Go row and fails placeholders/missing passing rows', () => {
    const pass = writeBody('review-log-pass.md', body({ reviewVerdict: 'Conditional Go' }));
    const ok = run(SCRIPTS.reviewLog, ['--pr-body', pass]);
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);

    const fail = writeBody('review-log-fail.md', body({ reviewVerdict: 'Needs-Fix' }));
    const bad = run(SCRIPTS.reviewLog, ['--pr-body', fail]);
    assert.equal(bad.status, 1, bad.stdout + bad.stderr);
    assert.match(bad.stdout, /no passing row/i);
  });

  it('review-log-evidence accepts fallback reviewer only with fallback rationale', () => {
    const pass = writeBody('fallback-pass.md', body({ reviewModel: 'claude-sonnet-4.6', reviewer: 'claude-sonnet-4.6', fallback: 'GPT-5.5 unavailable after two attempts.' }));
    assert.equal(run(SCRIPTS.reviewLog, ['--pr-body', pass]).status, 0);

    const fail = writeBody('fallback-fail.md', body({ reviewModel: 'claude-sonnet-4.6', reviewer: 'claude-sonnet-4.6' }));
    const bad = run(SCRIPTS.reviewLog, ['--pr-body', fail]);
    assert.equal(bad.status, 1, bad.stdout + bad.stderr);
    assert.match(bad.stdout, /Fallback rationale/);
  });

  it('review-log-evidence rejects decorated reviewer model identifiers (LRN-136)', () => {
    // Decorated model + populated fallback rationale is the path that silently passed pre-CS54:
    // `gpt-5.5 (R2)` normalised to `gpt-5.5-r2`, failed the primary check, and the
    // fallback-rationale path approved it. The CS54 decoration check must fire FIRST.
    const decoratedWithFallback = writeBody(
      'decorated-with-fallback.md',
      body({
        reviewModel: 'gpt-5.5 (R2)',
        reviewer: 'gpt-5.5',
        fallback: 'GPT-5.5 unavailable after two attempts.',
      }),
    );
    const r1 = run(SCRIPTS.reviewLog, ['--pr-body', decoratedWithFallback]);
    assert.equal(r1.status, 1, r1.stdout + r1.stderr);
    assert.match(r1.stdout, /decorated reviewer model/i);
    assert.match(r1.stdout, /use bare "gpt-5\.5"/);
    assert.match(r1.stdout, /actor column/i);

    // Decorated model WITHOUT fallback rationale must also fail with the decoration message
    // (not the unrelated fallback-missing message).
    const decoratedBare = writeBody(
      'decorated-bare.md',
      body({ reviewModel: 'gpt-5.5 (PvI)', reviewer: 'gpt-5.5' }),
    );
    const r2 = run(SCRIPTS.reviewLog, ['--pr-body', decoratedBare]);
    assert.equal(r2.status, 1, r2.stdout + r2.stderr);
    assert.match(r2.stdout, /decorated reviewer model/i);

    // Sanity: a bare reviewer model still passes when the rest of the body is well-formed.
    const bareOk = writeBody('bare-ok.md', body({ reviewModel: 'gpt-5.5' }));
    assert.equal(run(SCRIPTS.reviewLog, ['--pr-body', bareOk]).status, 0);
  });

  it('copilot-review-attached passes only when Copilot reviewer submitted an accepted state', () => {
    const pass = writeBody('copilot-pass.md', body({ copilotState: 'APPROVED' }));
    assert.equal(run(SCRIPTS.copilot, ['--pr-body', pass]).status, 0);

    const fail = writeBody('copilot-fail.md', body({ copilotLogin: 'human-reviewer', copilotState: 'COMMENTED' }));
    const bad = run(SCRIPTS.copilot, ['--pr-body', fail]);
    assert.equal(bad.status, 1, bad.stdout + bad.stderr);
    assert.match(bad.stdout, /no acceptable review/i);
  });

  it('independence-invariant allows GPT-5.5 overlap for normal CSs but rejects non-GPT overlap and high-risk GPT overlap', () => {
    const gptOverlap = writeBody('independence-gpt-overlap.md', body({ implementers: 'gpt-5.5, claude-opus-4.7', reviewer: 'gpt-5.5' }));
    assert.equal(run(SCRIPTS.independence, ['--pr-body', gptOverlap]).status, 0);

    const nonGpt = writeBody('independence-non-gpt.md', body({ implementers: 'claude-sonnet-4.6', reviewer: 'claude-sonnet-4.6', reviewModel: 'claude-sonnet-4.6', fallback: 'Fallback attempted.' }));
    const bad = run(SCRIPTS.independence, ['--pr-body', nonGpt]);
    assert.equal(bad.status, 1, bad.stdout + bad.stderr);
    assert.match(bad.stdout, /independence invariant violation/i);

    const highRisk = writeBody('independence-high-risk.md', body({ implementers: 'gpt-5.5', reviewer: 'gpt-5.5' }));
    const highRiskBad = run(SCRIPTS.independence, ['--pr-body', highRisk, '--cs-id', 'CS03']);
    assert.equal(highRiskBad.status, 1, highRiskBad.stdout + highRiskBad.stderr);
    assert.match(highRiskBad.stdout, /high-risk CS03/i);
  });

  it('review-threads-resolved passes all resolved and fails any unresolved fixture row', () => {
    const pass = writeBody('threads-pass.md', body({ threadState: 'resolved' }));
    assert.equal(run(SCRIPTS.threads, ['--pr-body', pass]).status, 0);

    const fail = writeBody('threads-fail.md', body({ threadState: 'false' }));
    const bad = run(SCRIPTS.threads, ['--pr-body', fail]);
    assert.equal(bad.status, 1, bad.stdout + bad.stderr);
    assert.match(bad.stdout, /unresolved/i);
  });

  it('review-threads-resolved paginates GraphQL reviewThreads before passing', async () => {
    const calls = [];
    const pages = [
      { nodes: [{ isResolved: true }], pageInfo: { hasNextPage: true, endCursor: 'CURSOR_1' } },
      { nodes: [{ isResolved: false }], pageInfo: { hasNextPage: false, endCursor: null } },
    ];
    const result = await runThreadsGraphqlCheck({
      repo: 'owner/repo',
      prNumber: 7,
      graphqlFn: async (query, variables) => {
        calls.push({ query, variables });
        return { repository: { pullRequest: { reviewThreads: pages.shift() } } };
      },
    });

    assert.equal(result.exitCode, 1, result.stdout.join('\n') + result.stderr.join('\n'));
    assert.equal(calls.length, 2);
    assert.match(calls[0].query, /pageInfo \{ hasNextPage endCursor \}/);
    assert.deepEqual(calls.map((call) => call.variables.cursor), [null, 'CURSOR_1']);
    assert.match(result.stdout.join('\n'), /1 review thread unresolved/);
  });
});
