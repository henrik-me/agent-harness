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

// Strict allowlist: the 3 root files are END-anchored (exact filenames, so
// `WORKBOARD.md.bak` is rejected — CS63 Copilot review), clickstops by prefix.
const ALLOWLIST_RE = /\(WORKBOARD\\\.md\|CONTEXT\\\.md\|LEARNINGS\\\.md\)\$\|\^project\/clickstops\/\(planned\|active\|done\)\//;

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

  // CS63 R8: a name-only diff misses rename/copy SOURCES, so a PR could rename a
  // non-allowlisted content file into an allowlisted path and still dodge the
  // workboard-only skip. The guard must enumerate PR files and check BOTH the
  // current path and previous_filename (matching workboard-auto-approve.yml).
  it('the bypass guard is rename/copy-source aware (checks previous_filename)', () => {
    for (const w of ['review-gates.yml', 'pr-evidence-lint.yml']) {
      const src = read(`.github/workflows/${w}`);
      assert.match(src, /previous_filename/, `${w}: guard must inspect rename/copy source paths (previous_filename)`);
      assert.match(src, /pulls\/\$\{PR_NUM\}\/files/, `${w}: guard must enumerate PR files via the GitHub files API`);
      assert.doesNotMatch(src, /--name-only/, `${w}: name-only diff omits rename sources (CS63 R8) — must not be used by the bypass guard`);
    }
  });

  // CS63 Copilot review: the 3 root files must be exact (end-anchored). The old
  // form `LEARNINGS\.md|project/clickstops/...` prefix-matched, so `WORKBOARD.md.bak`
  // would slip through the workboard-only skip.
  it('the allowlist exact-matches the 3 root files (end-anchored, no prefix slip)', () => {
    for (const w of ['review-gates.yml', 'pr-evidence-lint.yml']) {
      const src = read(`.github/workflows/${w}`);
      assert.match(src, ALLOWLIST_RE, `${w}: root-file allowlist must be end-anchored (exact filenames)`);
      assert.doesNotMatch(
        src,
        /LEARNINGS\\\.md\|project\/clickstops/,
        `${w}: root files must not be prefix-joined to the clickstops dir (WORKBOARD.md.bak would slip)`
      );
    }
  });

  // CS63 Copilot review: both bypass workflows gate on the workboard-only label,
  // so they MUST re-run on label add/remove or the bypass would not re-evaluate
  // when the label is toggled after the PR is opened (matches workboard-auto-approve.yml).
  it('both bypass workflows re-run on label add/remove', () => {
    for (const w of ['review-gates.yml', 'pr-evidence-lint.yml']) {
      const doc = yaml.load(read(`.github/workflows/${w}`));
      const types = doc.on.pull_request.types;
      assert.ok(types.includes('labeled'), `${w}: pull_request.types must include 'labeled'`);
      assert.ok(types.includes('unlabeled'), `${w}: pull_request.types must include 'unlabeled'`);
    }
  });
});
