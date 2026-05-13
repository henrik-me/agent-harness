/**
 * tests/template-pr-evidence-workflow.test.mjs — CS38a PR-evidence workflow template.
 *
 * Asserts the managed workflow shape without adding a YAML parser dependency.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.join(__dirname, '..');
const WORKFLOW = path.join(
  REPO_ROOT,
  'template',
  'managed',
  '.github',
  'workflows',
  'pr-evidence-lint.yml'
);

function readWorkflow() {
  return readFileSync(WORKFLOW, 'utf8');
}

function leadingSpaces(line) {
  return line.match(/^ */)[0].length;
}

function extractBlock(text, startPattern) {
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  const start = lines.findIndex((line) => startPattern.test(line));
  assert.notEqual(start, -1, `missing block matching ${startPattern}`);
  const indent = leadingSpaces(lines[start]);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    if (leadingSpaces(line) <= indent) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

function extractJob(text, jobName) {
  return extractBlock(text, new RegExp(`^  ${jobName}:\\s*$`));
}

describe('CS38a — managed pr-evidence-lint workflow template', () => {
  it('exists in template/managed/.github/workflows', () => {
    assert.equal(existsSync(WORKFLOW), true, 'managed workflow template must exist');
  });

  it('declares workflow name pr-evidence-lint', () => {
    assert.match(readWorkflow(), /^name:\s*pr-evidence-lint$/m);
  });

  it('declares top-level read-only permissions for contents and pull requests', () => {
    const permissions = extractBlock(readWorkflow(), /^permissions:\s*$/m);
    assert.match(permissions, /^  contents:\s*read$/m);
    assert.match(permissions, /^  pull-requests:\s*read$/m);
    assert.doesNotMatch(permissions, /:\s*write\b/, 'top-level permissions must not grant write');
  });

  it('runs on pull_request opened, synchronize, reopened, and edited events', () => {
    const onBlock = extractBlock(readWorkflow(), /^on:\s*$/m);
    assert.match(onBlock, /^  pull_request:\s*$/m);
    for (const eventType of ['opened', 'synchronize', 'reopened', 'edited']) {
      assert.match(onBlock, new RegExp(`types:\\s*\\[[^\\]]*\\b${eventType}\\b`));
    }
  });

  it('declares workflow_dispatch input pr_number as required', () => {
    const onBlock = extractBlock(readWorkflow(), /^on:\s*$/m);
    assert.match(onBlock, /^  workflow_dispatch:\s*$/m);
    assert.match(onBlock, /^      pr_number:\s*$/m);
    assert.match(onBlock, /^        required:\s*true$/m);
    assert.match(onBlock, /^        type:\s*string$/m);
  });

  it('declares read-only-gates and mutation-engage jobs', () => {
    const text = readWorkflow();
    assert.match(text, /^  read-only-gates:\s*$/m);
    assert.match(text, /^  mutation-engage:\s*$/m);
  });

  it('guards read-only-gates to pull_request events', () => {
    const job = extractJob(readWorkflow(), 'read-only-gates');
    assert.match(job, /^    if:\s*github\.event_name == 'pull_request'$/m);
  });

  it('guards mutation-engage to workflow_dispatch events', () => {
    const job = extractJob(readWorkflow(), 'mutation-engage');
    assert.match(job, /^    if:\s*github\.event_name == 'workflow_dispatch'$/m);
  });

  it('keeps read-only-gates job permissions read-only', () => {
    const job = extractJob(readWorkflow(), 'read-only-gates');
    assert.match(job, /^    permissions:\s*$/m);
    assert.match(job, /^      contents:\s*read$/m);
    assert.match(job, /^      pull-requests:\s*read$/m);
    assert.doesNotMatch(job, /^      [a-z-]+:\s*write$/m);
  });

  it('grants mutation-engage pull-requests write permission', () => {
    const job = extractJob(readWorkflow(), 'mutation-engage');
    assert.match(job, /^    permissions:\s*$/m);
    assert.match(job, /^      contents:\s*read$/m);
    assert.match(job, /^      pull-requests:\s*write$/m);
  });

  it('invokes harness pr-evidence via cloned bin/harness.mjs, not npx harness', () => {
    const job = extractJob(readWorkflow(), 'read-only-gates');
    assert.match(
      job,
      /node\s+"\$HARNESS_DIR\/bin\/harness\.mjs"\s+pr-evidence/,
      'read-only job must invoke the cloned harness CLI directly'
    );
    assert.doesNotMatch(job, /npx\s+harness\s+pr-evidence/);
  });

  it('uses SHA-pinned actions/checkout in read-only-gates', () => {
    const job = extractJob(readWorkflow(), 'read-only-gates');
    assert.match(
      job,
      /uses:\s*actions\/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd\b/
    );
  });

  it('uses gh pr edit --add-reviewer for Copilot engagement', () => {
    const job = extractJob(readWorkflow(), 'mutation-engage');
    assert.match(
      job,
      /gh\s+pr\s+edit\s+"\$PR_NUM"\s+--add-reviewer\s+copilot-pull-request-reviewer/,
      'ADR4-2 engagement primitive must be gh pr edit --add-reviewer'
    );
  });

  it('computes all centralized skip-reason vocabularies', () => {
    const job = extractJob(readWorkflow(), 'read-only-gates');
    for (const reason of ['workboard-only', 'bot-author', 'fork-source']) {
      assert.match(job, new RegExp(reason), `missing skip reason ${reason}`);
    }
  });

  it('checks out full history for read-only-gates', () => {
    const job = extractJob(readWorkflow(), 'read-only-gates');
    assert.match(
      job,
      /uses:\s*actions\/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd[\s\S]*?with:\s*\n\s+fetch-depth:\s*0\b/,
      'read-only checkout must set fetch-depth: 0 because B1 needs full commit graph'
    );
  });

  // C38a R2 B1: workflow splits A5+A16 (Copilot review) off the aggregator
  // so fork-source PRs (where check-copilot-review.mjs exits 2) don't fail CI.
  it('splits Copilot review gate into a separate step with continue-on-error: true', () => {
    const job = extractJob(readWorkflow(), 'read-only-gates');
    assert.match(
      job,
      /- id:\s*copilot-gate\b/,
      'must declare a step with id: copilot-gate for the A5+A16 gate'
    );
    assert.match(
      job,
      /id:\s*copilot-gate[\s\S]*?continue-on-error:\s*true/,
      'copilot-gate step must set continue-on-error: true'
    );
  });

  it('invokes check-copilot-review.mjs directly (not via aggregator) for the Copilot gate', () => {
    const job = extractJob(readWorkflow(), 'read-only-gates');
    assert.match(
      job,
      /node\s+"\$HARNESS_DIR\/scripts\/check-copilot-review\.mjs"/,
      'copilot-gate must invoke scripts/check-copilot-review.mjs directly so its exit-2 fork-source code is preserved verbatim'
    );
  });

  it('reads steps.copilot-gate.outcome and emits a notice (not an error) on fork-source skip', () => {
    const job = extractJob(readWorkflow(), 'read-only-gates');
    assert.match(
      job,
      /steps\.copilot-gate\.outcome/,
      'must aggregate the copilot-gate outcome in a follow-on step'
    );
    assert.match(
      job,
      /::notice\s+title=Copilot review gate skipped/,
      'fork-source path must emit a GitHub Actions ::notice (not ::error) when copilot-gate fails'
    );
  });

  it('read-only aggregator invocation passes NO --repo / --pr (so A5+A16 is naturally skipped there)', () => {
    const text = readWorkflow();
    // Extract just the read-only-gates step (not the copilot-gate step)
    const startIdx = text.indexOf('- id: read-only-gates');
    assert.notEqual(startIdx, -1, 'must have read-only-gates step');
    const endIdx = text.indexOf('- id: copilot-gate', startIdx);
    assert.notEqual(endIdx, -1, 'must have copilot-gate step after read-only-gates');
    const stepBody = text.slice(startIdx, endIdx);
    assert.doesNotMatch(
      stepBody,
      /^\s*--repo\b/m,
      'read-only step must not pass --repo (or A5+A16 will be registered by the aggregator)'
    );
    assert.doesNotMatch(
      stepBody,
      /^\s*--pr\s+"/m,
      'read-only step must not pass --pr'
    );
  });
});
