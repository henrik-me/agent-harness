/**
 * tests/cs23-pr-body-trigger.test.mjs — CS23 / LRN-100 regression contract.
 *
 * Locks the `pull_request:` trigger contract for
 * `.github/workflows/harness-self-check.yml`. The workflow's `pr-body` job
 * fetches the live PR body via `gh api repos/.../pulls/<N>` and lints it
 * with `scripts/check-pr-body.mjs`. Without `types: [edited]` on the
 * `pull_request:` trigger, `gh pr edit --body` does NOT re-fire the
 * workflow, leaving a cached FAILURE conclusion visible on the PR even
 * after the body is fixed (see LRN-100 evidence: PR #110, 2026-05-10,
 * run id 25642102623). This test fails closed if any of the four
 * activity types `opened | synchronize | reopened | edited` is missing,
 * so we cannot accidentally narrow OR widen-then-narrow the surface in a
 * future refactor.
 *
 * References:
 *   - LEARNINGS.md § LRN-100
 *   - project/clickstops/active/active_cs23_apply-lrn-100-pr-body-edited-trigger.md
 *
 * OQ1 (per CS23 plan): we deliberately do NOT assert the same shape on
 * `harness-self-check-via-reusable.yml`. That workflow has no `pr-body`
 * job — it only calls the reusable `harness-checks.yml` via a relative
 * `uses:` and feeds in `github.event.pull_request.head.sha`. Re-firing
 * on `edited` would just re-run the same lint against the same head
 * SHA, costing Actions minutes for no signal change. If a future CS
 * adds PR-body-dependent work to that workflow, this test should be
 * extended at that time.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const WORKFLOW = path.join(
  REPO_ROOT,
  '.github',
  'workflows',
  'harness-self-check.yml',
);

function loadWorkflow() {
  const text = readFileSync(WORKFLOW, 'utf8');
  const doc = yaml.load(text);
  if (!doc || typeof doc !== 'object') {
    throw new Error(
      `harness-self-check.yml did not parse as a YAML mapping; ` +
        `cannot validate trigger contract (LRN-033 fail-closed).`,
    );
  }
  return doc;
}

function readPullRequestTriggerTypes(doc) {
  // YAML 1.1 truthy: bare `on:` may be parsed as the boolean key `true`.
  // Accept either string 'on' or boolean true so the assertion is robust.
  const onBlock = doc.on ?? doc[true];
  assert.ok(
    onBlock && typeof onBlock === 'object',
    'harness-self-check.yml must declare an `on:` mapping',
  );
  const pr = onBlock.pull_request;
  assert.ok(
    pr && typeof pr === 'object',
    'harness-self-check.yml must declare an `on.pull_request:` block',
  );
  return pr.types;
}

describe('CS23 — harness-self-check.yml pull_request trigger contract (LRN-100)', () => {
  it('on.pull_request.types is an array that includes "edited"', () => {
    const doc = loadWorkflow();
    const types = readPullRequestTriggerTypes(doc);
    assert.ok(
      Array.isArray(types),
      'on.pull_request.types must be an explicit array — default activity ' +
        'types do NOT include `edited`, which is exactly the LRN-100 bug.',
    );
    assert.ok(
      types.includes('edited'),
      'on.pull_request.types must include "edited" so that ' +
        '`gh pr edit --body` re-fires the `pr-body` job. ' +
        'See LEARNINGS.md § LRN-100 for evidence (PR #110, run 25642102623).',
    );
  });

  it('on.pull_request.types preserves all three default activity types (opened, synchronize, reopened)', () => {
    const doc = loadWorkflow();
    const types = readPullRequestTriggerTypes(doc);
    assert.ok(Array.isArray(types), 'on.pull_request.types must be an array');
    for (const required of ['opened', 'synchronize', 'reopened']) {
      assert.ok(
        types.includes(required),
        `on.pull_request.types must still include "${required}" — adding ` +
          `\`types:\` REPLACES the GitHub defaults, so omitting any of ` +
          `the three default activity types would silently NARROW the ` +
          `trigger surface (e.g. dropping "synchronize" would stop ` +
          `re-running on every push to a PR branch).`,
      );
    }
  });
});
