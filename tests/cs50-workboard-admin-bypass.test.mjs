/**
 * tests/cs50-workboard-admin-bypass.test.mjs — CS50 / issue #138 regression contract.
 *
 * Locks the optional WORKBOARD_MERGE_TOKEN admin-bypass fallback for
 * workboard-only PRs. The fallback must never weaken the existing actor/path
 * validation gate, and it must be visible from both the workflow and init/docs
 * surfaces so consumer repos without the G3 App can configure it deliberately.
 *
 * Run: node --test tests/cs50-workboard-admin-bypass.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const CLI = path.join(REPO_ROOT, 'bin', 'harness.mjs');
const NODE = process.execPath;
const ROOT_WORKFLOW = path.join(REPO_ROOT, '.github', 'workflows', 'workboard-auto-approve.yml');
const TEMPLATE_WORKFLOW = path.join(REPO_ROOT, 'template', 'managed', '.github', 'workflows', 'workboard-auto-approve.yml');
const WORKFLOWS = [ROOT_WORKFLOW, TEMPLATE_WORKFLOW];

function read(relOrAbs) {
  return readFileSync(path.isAbsolute(relOrAbs) ? relOrAbs : path.join(REPO_ROOT, relOrAbs), 'utf8');
}

function loadWorkflow(filePath) {
  const text = read(filePath);
  const doc = yaml.load(text);
  assert.ok(doc && typeof doc === 'object', `${filePath} must parse as a YAML mapping`);
  return { text, doc };
}

function validateJob(doc) {
  const job = doc.jobs?.['validate-and-approve'];
  assert.ok(job && typeof job === 'object', 'workboard workflow must keep the validate-and-approve job');
  assert.ok(Array.isArray(job.steps), 'validate-and-approve must define steps');
  return job;
}

describe('CS50 — workboard admin-bypass workflow contract', () => {
  it('root and template workflow YAML parse and stay byte-identical', () => {
    for (const workflow of WORKFLOWS) {
      loadWorkflow(workflow);
    }
    assert.equal(
      read(ROOT_WORKFLOW),
      read(TEMPLATE_WORKFLOW),
      'root workflow and template-managed workflow must stay aligned; consumers sync from the template copy.',
    );
  });

  it('contains an admin-merge step gated by WORKBOARD_MERGE_TOKEN', () => {
    const { doc } = loadWorkflow(ROOT_WORKFLOW);
    const job = validateJob(doc);
    assert.match(
      String(job.env?.WORKBOARD_MERGE_TOKEN_CONFIGURED ?? ''),
      /secrets\.WORKBOARD_MERGE_TOKEN\s*!=\s*''/,
      'job env must derive a boolean from secrets.WORKBOARD_MERGE_TOKEN so unset secrets can skip gracefully',
    );

    const adminStep = job.steps.find((step) => step.id === 'admin-merge');
    assert.ok(adminStep, 'workflow must contain an admin-merge step with id=admin-merge');
    assert.match(String(adminStep.name), /Admin-merge PR with WORKBOARD_MERGE_TOKEN/);
    assert.match(
      String(adminStep.if ?? ''),
      /WORKBOARD_MERGE_TOKEN_CONFIGURED\s*==\s*'true'/,
      'admin merge step must be gated on WORKBOARD_MERGE_TOKEN presence',
    );
    assert.match(
      String(adminStep.if ?? ''),
      /WORKBOARD_APP_CONFIGURED\s*!=\s*'true'/,
      'GitHub App credentials must take precedence when both the App and PAT are configured',
    );
    assert.equal(
      adminStep.env?.GH_TOKEN,
      '${{ secrets.WORKBOARD_MERGE_TOKEN }}',
      'admin merge step must use the PAT secret as GH_TOKEN',
    );
    assert.match(adminStep.run, /statusCheckRollup/, 'admin merge must re-check status checks before using --admin');
    assert.match(
      adminStep.run,
      /gh pr merge "\$PR_NUMBER"[\s\S]*--squash[\s\S]*--admin[\s\S]*--delete-branch/,
      'admin merge command must squash admin-merge the validated PR and delete the branch',
    );
  });

  it('preserves actor allowlist and path allowlist validation before merge credentials are used', () => {
    const workflow = read(ROOT_WORKFLOW);
    assert.match(workflow, /ALLOWED_AUTHORS:\s*'henrik-me'/, 'actor allowlist must remain explicit');
    assert.match(workflow, /author '\$PR_AUTHOR' is not in the orchestrator allowlist/, 'actor rejection must remain fail-closed');
    for (const allowed of [
      'WORKBOARD.md',
      'CONTEXT.md',
      'LEARNINGS.md',
      'project/clickstops/planned/',
      'project/clickstops/active/',
      'project/clickstops/done/',
    ]) {
      assert.ok(workflow.includes(allowed), `path allowlist missing ${allowed}`);
    }
    assert.match(workflow, /OUTSIDE the workboard-only allowlist/, 'path violations must remain hard failures');
    assert.match(workflow, /Checkout base repository \(never PR head\)/, 'workflow must not checkout untrusted PR head before secrets are used');
  });
});

describe('CS50 — init/docs surfaces for WORKBOARD_MERGE_TOKEN', () => {
  it('cmdInit exposes the PAT setup guidance and CI skip flag', () => {
    const cli = read('bin/harness.mjs');
    assert.match(cli, /--skip-workboard-pat-prompt/, 'harness init must expose --skip-workboard-pat-prompt');
    assert.match(cli, /Create a fine-grained PAT with these scopes:/, 'init guidance must tell users to create a fine-grained PAT');
    assert.match(cli, /WORKBOARD_MERGE_TOKEN/, 'init guidance must name the repo secret');
  });

  it('fresh init installs the managed workboard workflow when the prompt is skipped', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'cs50-init-'));
    try {
      const result = spawnSync(
        NODE,
        [CLI, 'init', dir, '--skip-constraint-detection', '--skip-workboard-pat-prompt'],
        { cwd: REPO_ROOT, encoding: 'utf8' },
      );
      assert.equal(
        result.status,
        0,
        `harness init should pass without network when skip flags are set\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      );
      assert.match(result.stdout, /Skipped WORKBOARD_MERGE_TOKEN PAT setup guidance/);
      const workflowPath = path.join(dir, '.github', 'workflows', 'workboard-auto-approve.yml');
      assert.ok(existsSync(workflowPath), 'fresh init must materialize the managed workboard workflow');
      const config = JSON.parse(readFileSync(path.join(dir, 'harness.config.json'), 'utf8'));
      assert.ok(
        config.managed?.files?.includes('.github/workflows/workboard-auto-approve.yml'),
        'fresh init must record the workboard workflow in managed.files so future syncs maintain it',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('root OPERATIONS documents the admin-bypass fallback subsection', () => {
    const operations = read('OPERATIONS.md');
    assert.match(operations, /#### Workboard-only PR admin-bypass fallback/);
    assert.match(operations, /WORKBOARD_MERGE_TOKEN/);
    assert.match(operations, /contents: write/);
    assert.match(operations, /pull-requests: write/);
    assert.match(operations, /gh auth refresh -s admin:org/);
    assert.match(operations, /actor allowlist[\s\S]*path-allowlist/);
  });
});
