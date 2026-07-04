import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const WORKFLOW = path.join(REPO_ROOT, 'template', '.github', 'workflows', 'review-gates.yml');
const MANAGED_WORKFLOW = path.join(REPO_ROOT, 'template', 'managed', '.github', 'workflows', 'review-gates.yml');
const EXPECTED_JOBS = [
  'review-log-evidence',
  'copilot-review-attached',
  'independence-invariant',
  'review-threads-resolved',
];

function readWorkflow() {
  return readFileSync(WORKFLOW, 'utf8');
}

function parseWorkflow() {
  return yaml.load(readWorkflow());
}

describe('CS51 review-gates workflow template', () => {
  it('exists at the requested template path and matches the managed sync source', () => {
    assert.equal(existsSync(WORKFLOW), true);
    assert.equal(existsSync(MANAGED_WORKFLOW), true);
    assert.equal(readFileSync(WORKFLOW, 'utf8'), readFileSync(MANAGED_WORKFLOW, 'utf8'));
  });

  it('parses as YAML and declares the four required job contexts plus the C63-7 guard', () => {
    const doc = parseWorkflow();
    assert.equal(doc.name, 'review-gates');
    assert.deepEqual(
      Object.keys(doc.jobs).sort(),
      [...EXPECTED_JOBS, 'validate-workboard-only-scope'].toSorted()
    );
    for (const job of EXPECTED_JOBS) {
      assert.equal(doc.jobs[job].name, job);
    }
  });

  it('runs all four jobs unconditionally and short-circuits internally for workboard-only PRs', () => {
    const doc = parseWorkflow();
    const text = readWorkflow();
    for (const job of EXPECTED_JOBS) {
      const j = doc.jobs[job];
      // CS71 D71-3: no job-level label gate -> the job always executes so its
      // required-status-check context is always reported (no transient red).
      assert.ok(
        j.if === undefined || !String(j.if).includes('workboard-only'),
        `${job} must not have a job-level workboard-only skip (always execute)`
      );
      // Its first step computes the path-derived skip; the rest are gated by it.
      assert.equal(j.steps[0].id, 'wb', `${job}: first step must compute the skip`);
      for (let i = 1; i < j.steps.length; i++) {
        assert.match(
          String(j.steps[i].if),
          /steps\.wb\.outputs\.skip != 'true'/,
          `${job}: step ${i} must be gated by the computed skip`
        );
      }
    }
    // The skip is path-derived from the allowlist regex.
    assert.match(text, /grep -Ev '\^\(WORKBOARD/, 'wb steps derive the skip from the allowlist regex');
  });

  it('references each CS51 check script exactly where expected', () => {
    const text = readWorkflow();
    for (const script of [
      'check-review-log-evidence.mjs',
      'check-copilot-review-attached.mjs',
      'check-independence-invariant.mjs',
      'check-review-threads-resolved.mjs',
    ]) {
      assert.match(text, new RegExp(`scripts/checks/${script.replace('.', '\\.')}`), `missing ${script}`);
    }
  });

  it('grants write permission only to the Copilot attachment job', () => {
    const doc = parseWorkflow();
    assert.equal(doc.jobs['copilot-review-attached'].permissions['pull-requests'], 'write');
    for (const job of ['review-log-evidence', 'independence-invariant', 'review-threads-resolved']) {
      assert.equal(doc.jobs[job].permissions['pull-requests'], 'read');
    }
  });
});
