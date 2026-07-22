/**
 * tests/cs68-review-non-cs.test.mjs — CS68 (C68-3 / risk R4).
 *
 * `harness review` must run against a NON-clickstop (deps/maintenance) branch —
 * a `deps/<pkg>-<ver>` or `dependabot/…` PR that carries no `cs<NN>/` id and no
 * clickstop file. On that path the implementer-model set is sourced from an
 * explicit `--implementer-models <csv>` flag and/or the PR body's existing
 * `## Model audit`, unioned with a hard superset invariant so the flag can never
 * shrink or launder the audited implementer set (R4). The clickstop-branch path
 * is unchanged and covered by tests/cs52-harness-review-lib.test.mjs.
 *
 * All GitHub/git round-trips are mocked via `__testSeam` — no network, no real
 * clickstop-file reads (the non-CS path never calls findClickstopFile).
 *
 * Run: node --test tests/cs68-review-non-cs.test.mjs
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

import {
  __testSeam,
  assertReviewerAllowed,
  resolveNonCsImplementerModels,
  ReviewError,
  runReview,
} from '../lib/review.mjs';

const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);

const AUDIT_BODY = (models) => [
  '## Summary',
  '',
  'x',
  '',
  '## Model audit',
  '',
  '| Field | Value |',
  '|---|---|',
  `| Implementer models | ${models} |`,
  '| Reviewer model | gpt-5.6-sol |',
  '',
].join('\n');

const defaultSeam = { ...__testSeam };

beforeEach(() => {
  Object.assign(__testSeam, defaultSeam);
  __testSeam.now = () => Date.parse('2026-07-04T12:00:00Z');
});

afterEach(() => {
  Object.assign(__testSeam, defaultSeam);
});

describe('CS68 resolveNonCsImplementerModels — flag/PR-body source with superset invariant', () => {
  it('flag-only: returns exactly the parsed flag models', () => {
    const models = resolveNonCsImplementerModels({ flagRaw: 'claude-opus-4.8, claude-sonnet-4.6' });
    assert.deepEqual([...models].sort(), ['claude-opus-4.8', 'claude-sonnet-4.6']);
  });

  it('body-only: returns the models parsed from the PR-body ## Model audit', () => {
    const models = resolveNonCsImplementerModels({ prBody: AUDIT_BODY('claude-opus-4.8') });
    assert.deepEqual([...models], ['claude-opus-4.8']);
    // The audit's reviewer-model row must NOT be treated as an implementer.
    assert.equal(models.has('gpt-5.6-sol'), false);
  });

  it('both present, flag is a proper superset of the body audit: returns the union (== flag), no throw', () => {
    const models = resolveNonCsImplementerModels({
      flagRaw: 'claude-opus-4.8, claude-sonnet-4.6',
      prBody: AUDIT_BODY('claude-opus-4.8'),
    });
    assert.deepEqual([...models].sort(), ['claude-opus-4.8', 'claude-sonnet-4.6']);
  });

  it('both present, differing spellings of the SAME model (normalized) are a superset — no dup, no throw', () => {
    // Flag "Claude Opus 4.8" normalizes to the body's "claude-opus-4.8".
    const models = resolveNonCsImplementerModels({
      flagRaw: 'Claude Opus 4.8',
      prBody: AUDIT_BODY('claude-opus-4.8'),
    });
    // Union by normalized identity keeps the flag spelling, exactly one entry.
    assert.equal(models.size, 1);
    assert.equal(models.has('Claude Opus 4.8'), true);
  });

  it('both present, body has a model absent from the flag: throws ReviewError kind "policy" (shrink refusal)', () => {
    assert.throws(
      () => resolveNonCsImplementerModels({
        flagRaw: 'claude-sonnet-4.6',
        prBody: AUDIT_BODY('claude-opus-4.8'),
      }),
      (err) => err instanceof ReviewError
        && err.kind === 'policy'
        && /shrink the audited implementer set/i.test(err.message)
        && /claude-opus-4\.8/.test(err.message),
    );
  });

  it('neither source yields a model: throws ReviewError kind "bad-input" naming the branch + remediation', () => {
    assert.throws(
      () => resolveNonCsImplementerModels({ branch: 'deps/js-yaml-4.2.0' }),
      (err) => err instanceof ReviewError
        && err.kind === 'bad-input'
        && /deps\/js-yaml-4\.2\.0/.test(err.message)
        && /--implementer-models/.test(err.message)
        && /## Model audit/.test(err.message),
    );
  });

  it('a flag value that parses to no recognizable model id also fails closed (bad-input)', () => {
    assert.throws(
      () => resolveNonCsImplementerModels({ flagRaw: 'not-a-model', branch: 'deps/x-1.0.0' }),
      (err) => err instanceof ReviewError && err.kind === 'bad-input',
    );
  });
});

describe('CS68 independence guard is preserved on the non-CS path (R4)', () => {
  it('a reviewer model in the resolved implementer set is refused (normalized alias)', () => {
    // Implementer "claude-sonnet-4.6" and reviewer "sonnet-4.6" normalize equal.
    const implementerModels = resolveNonCsImplementerModels({ flagRaw: 'claude-sonnet-4.6' });
    assert.throws(
      () => assertReviewerAllowed({
        reviewerModel: 'sonnet-4.6',
        implementerModels,
        csId: null,
        config: { fallback_model: 'sonnet-4.6', rubber_duck_model: 'gpt-5.6-sol', high_risk_clickstops: [] },
      }),
      (err) => err instanceof ReviewError && err.kind === 'policy' && /Independence guard refused/.test(err.message),
    );
  });

  it('the flag cannot launder an independence violation hidden in the PR-body audit', () => {
    // Body audits claude-opus-4.8; a flag that is a superset still surfaces it to
    // the guard, so a reviewer that overlaps the (unioned) set is refused.
    const implementerModels = resolveNonCsImplementerModels({
      flagRaw: 'claude-opus-4.8, claude-sonnet-4.6',
      prBody: AUDIT_BODY('claude-opus-4.8'),
    });
    assert.throws(
      () => assertReviewerAllowed({
        reviewerModel: 'claude-opus-4.8',
        implementerModels,
        csId: null,
        config: { fallback_model: 'sonnet-4.6', rubber_duck_model: 'gpt-5.6-sol', high_risk_clickstops: [] },
      }),
      (err) => err instanceof ReviewError && err.kind === 'policy' && /Independence guard refused/.test(err.message),
    );
  });
});

describe('CS68 runReview end-to-end on a non-CS branch', () => {
  const stubPr = (headRefName, body = '') => {
    __testSeam.spawnSync = (cmd, args) => {
      if (cmd === 'gh' && args[0] === 'pr' && args[1] === 'view') {
        return {
          status: 0,
          stdout: JSON.stringify({
            body,
            headRefName,
            headRefOid: HEAD,
            baseRefOid: BASE,
            isCrossRepository: false,
            labels: [],
            url: 'https://github.com/o/r/pull/262',
          }),
          stderr: '',
        };
      }
      if (cmd === 'git') return { status: 0, stdout: '', stderr: '' };
      return { status: 1, stdout: '', stderr: `unexpected ${cmd} ${args.join(' ')}` };
    };
  };

  it('deps/<pkg>-<ver> branch with --implementer-models dispatches (csId=null) without a "cannot derive CS id" error', async () => {
    stubPr('deps/js-yaml-4.2.0');
    const result = await runReview({
      cwd: process.cwd(),
      repo: 'o/r',
      prNumber: 262,
      reviewerModel: 'gpt-5.6-sol',
      rubberDuckOnly: true,
      noPoll: true,
      actor: 'yoga-ah',
      implementerModelsFlag: 'claude-opus-4.8',
    });

    assert.equal(result.status, 'dispatched');
    assert.equal(result.csId, null);
    assert.equal(result.csFile, null);
    // The prompt renders with the branch label and the non-CS "N/A" file line.
    assert.match(result.rubberDuckPrompt, /deps\/js-yaml-4\.2\.0/);
    assert.match(result.rubberDuckPrompt, /N\/A — non-CS/);
    // Independence line still reflects the resolved implementer set.
    assert.match(result.rubberDuckPrompt, /claude-opus-4\.8/);
  });

  it('sources implementer models from the PR-body ## Model audit when no flag is passed', async () => {
    stubPr('deps/js-yaml-4.2.0', AUDIT_BODY('claude-opus-4.8'));
    const result = await runReview({
      cwd: process.cwd(),
      repo: 'o/r',
      prNumber: 262,
      reviewerModel: 'gpt-5.6-sol',
      rubberDuckOnly: true,
      noPoll: true,
      actor: 'yoga-ah',
    });
    assert.equal(result.status, 'dispatched');
    assert.equal(result.csId, null);
    assert.match(result.rubberDuckPrompt, /claude-opus-4\.8/);
  });

  it('a dependabot/… branch is also accepted by the branch gate', async () => {
    stubPr('dependabot/npm_and_yarn/js-yaml-4.2.0');
    const result = await runReview({
      cwd: process.cwd(),
      repo: 'o/r',
      prNumber: 262,
      reviewerModel: 'gpt-5.6-sol',
      rubberDuckOnly: true,
      noPoll: true,
      actor: 'yoga-ah',
      implementerModelsFlag: 'claude-opus-4.8',
    });
    assert.equal(result.status, 'dispatched');
    assert.equal(result.csId, null);
  });

  it('a non-CS branch with neither flag nor PR-body audit fails closed (bad-input)', async () => {
    stubPr('deps/js-yaml-4.2.0');
    await assert.rejects(
      () => runReview({
        cwd: process.cwd(),
        repo: 'o/r',
        prNumber: 262,
        reviewerModel: 'gpt-5.6-sol',
        rubberDuckOnly: true,
        noPoll: true,
        actor: 'yoga-ah',
      }),
      (err) => err instanceof ReviewError
        && err.kind === 'bad-input'
        && /Cannot determine implementer models/.test(err.message),
    );
  });

  it('the non-CS path still enforces independence: reviewer ∈ implementer set is refused (exit-2 policy)', async () => {
    stubPr('deps/js-yaml-4.2.0');
    await assert.rejects(
      () => runReview({
        cwd: process.cwd(),
        repo: 'o/r',
        prNumber: 262,
        reviewerModel: 'sonnet-4.6',
        rubberDuckOnly: true,
        noPoll: true,
        actor: 'yoga-ah',
        implementerModelsFlag: 'claude-sonnet-4.6',
      }),
      (err) => err instanceof ReviewError && err.kind === 'policy' && /Independence guard refused/.test(err.message),
    );
  });

  it('an unknown branch shape (neither cs<NN>/ nor deps|dependabot) is still rejected by the gate', async () => {
    stubPr('feature/random');
    await assert.rejects(
      () => runReview({
        cwd: process.cwd(),
        repo: 'o/r',
        prNumber: 262,
        reviewerModel: 'gpt-5.6-sol',
        rubberDuckOnly: true,
        noPoll: true,
        actor: 'yoga-ah',
        implementerModelsFlag: 'claude-opus-4.8',
      }),
      (err) => err instanceof ReviewError && err.kind === 'bad-input' && /head branch must match/.test(err.message),
    );
  });

  it('requests isCrossRepository from gh pr view so the fork gate is effective (regression: PR_VIEW_FIELDS omission)', async () => {
    let jsonArg = null;
    __testSeam.spawnSync = (cmd, args) => {
      if (cmd === 'gh' && args[0] === 'pr' && args[1] === 'view') {
        const ji = args.indexOf('--json');
        jsonArg = ji >= 0 ? args[ji + 1] : '';
        return {
          status: 0,
          stdout: JSON.stringify({
            body: '', headRefName: 'deps/js-yaml-4.2.0', headRefOid: HEAD,
            baseRefOid: BASE, isCrossRepository: false, labels: [], url: 'u',
          }),
          stderr: '',
        };
      }
      if (cmd === 'git') return { status: 0, stdout: '', stderr: '' };
      return { status: 1, stdout: '', stderr: `unexpected ${cmd}` };
    };
    await runReview({
      cwd: process.cwd(), repo: 'o/r', prNumber: 262, reviewerModel: 'gpt-5.6-sol',
      rubberDuckOnly: true, noPoll: true, actor: 'yoga-ah', implementerModelsFlag: 'claude-opus-4.8',
    });
    assert.ok(
      jsonArg && jsonArg.split(',').includes('isCrossRepository'),
      `gh pr view --json must request isCrossRepository so validateContentPr's fork gate works; got '${jsonArg}'`,
    );
  });

  it('rejects a FORKED deps/… PR (isCrossRepository=true) even though the branch shape matches', async () => {
    __testSeam.spawnSync = (cmd, args) => {
      if (cmd === 'gh' && args[0] === 'pr' && args[1] === 'view') {
        return {
          status: 0,
          stdout: JSON.stringify({
            body: '', headRefName: 'deps/js-yaml-4.2.0', headRefOid: HEAD,
            baseRefOid: BASE, isCrossRepository: true, labels: [], url: 'u',
          }),
          stderr: '',
        };
      }
      if (cmd === 'git') return { status: 0, stdout: '', stderr: '' };
      return { status: 1, stdout: '', stderr: `unexpected ${cmd}` };
    };
    await assert.rejects(
      () => runReview({
        cwd: process.cwd(), repo: 'o/r', prNumber: 262, reviewerModel: 'gpt-5.6-sol',
        rubberDuckOnly: true, noPoll: true, actor: 'yoga-ah', implementerModelsFlag: 'claude-opus-4.8',
      }),
      (err) => err instanceof ReviewError && err.kind === 'bad-input' && /from a fork/.test(err.message),
    );
  });
});
