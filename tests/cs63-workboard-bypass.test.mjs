/**
 * tests/cs63-workboard-bypass.test.mjs — W5 bypass hardening (CS63 C63-7 / G3).
 *
 * The `workboard-only` label short-circuits the review gates. This work confines
 * that bypass to PRs whose diff is within the workboard path allowlist; a
 * mislabeled PR touching other files is REJECTED, not skipped. Workflows can't
 * run locally, so these tests assert the guard structure + root/template lockstep.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

function read(rel) {
  return readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

const ALLOWLIST_RE = /WORKBOARD\\\.md\|CONTEXT\\\.md\|LEARNINGS\\\.md\|project\/clickstops\/\(planned\|active\|done\)\//;

describe('CS63 C63-7 — workboard-only bypass is confined to the path allowlist', () => {
  for (const w of ['review-gates.yml', 'pr-evidence-lint.yml']) {
    it(`${w}: root and template copies stay byte-identical`, () => {
      assert.equal(
        read(`.github/workflows/${w}`),
        read(`template/managed/.github/workflows/${w}`),
        'consumers sync the template copy; it must match the harness root copy'
      );
    });
  }

  it('review-gates.yml adds a validate-workboard-only-scope guard job', () => {
    const src = read('.github/workflows/review-gates.yml');
    const doc = yaml.load(src);
    const job = doc.jobs['validate-workboard-only-scope'];
    assert.ok(job, 'a validate-workboard-only-scope job must exist');
    // Runs ONLY when the label is present (the opposite of the skipping gates).
    assert.match(String(job.if), /contains\(github\.event\.pull_request\.labels\.\*\.name, 'workboard-only'\)/);
    assert.doesNotMatch(String(job.if), /!contains/, 'guard must run WHEN labelled, not when unlabelled');
    // Fails on any file outside the allowlist.
    assert.match(src, ALLOWLIST_RE, 'guard must check the workboard path allowlist');
    assert.match(src, /outside-allowlist/, 'guard must report offending out-of-allowlist files');
  });

  it('the four review gates still skip on the workboard-only label', () => {
    const doc = yaml.load(read('.github/workflows/review-gates.yml'));
    for (const name of ['review-log-evidence', 'copilot-review-attached', 'independence-invariant', 'review-threads-resolved']) {
      assert.match(String(doc.jobs[name].if), /!contains\(github\.event\.pull_request\.labels\.\*\.name, 'workboard-only'\)/, `${name} keeps its label skip`);
    }
  });

  it('pr-evidence-lint.yml rejects a mislabeled workboard-only PR before skipping gates', () => {
    const src = read('.github/workflows/pr-evidence-lint.yml');
    // The skip reason is only added after the allowlist check passes.
    assert.match(src, ALLOWLIST_RE, 'skip-reason computation must check the allowlist');
    assert.match(src, /workboard-only label present but the PR changes files OUTSIDE/, 'must reject mislabeled PRs');
    // The guard exits non-zero (rejects) rather than silently skipping.
    assert.ok(src.includes('exit 1'), 'mislabeled PR must fail (exit 1), not skip');
  });
});
