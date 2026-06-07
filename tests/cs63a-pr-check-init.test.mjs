/**
 * tests/cs63a-pr-check-init.test.mjs — fresh `harness init` wires the consumer
 * structural PR gate default-on (CS63a / decisions C63-2 + G-gate-default).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const CLI = path.join(REPO_ROOT, 'bin', 'harness.mjs');
const NODE = process.execPath;

describe('CS63a — fresh init installs the consumer structural PR gate', () => {
  it('materializes harness-pr-check.yml, records it in managed.files, and sets pr_check.enabled=true', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'cs63a-init-'));
    try {
      const r = spawnSync(
        NODE,
        [CLI, 'init', dir, '--skip-constraint-detection', '--skip-workboard-pat-prompt'],
        { cwd: REPO_ROOT, encoding: 'utf8' }
      );
      assert.equal(r.status, 0, `init failed\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);

      const workflowPath = path.join(dir, '.github', 'workflows', 'harness-pr-check.yml');
      assert.ok(existsSync(workflowPath), 'fresh init must materialize harness-pr-check.yml');

      const config = JSON.parse(readFileSync(path.join(dir, 'harness.config.json'), 'utf8'));
      assert.equal(config.pr_check?.enabled, true, 'pr_check.enabled must default to true (G-gate-default)');
      assert.ok(
        config.managed?.files?.includes('.github/workflows/harness-pr-check.yml'),
        'fresh init must record the gate in managed.files so future syncs maintain it'
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('CS63a — config schema defines pr_check', () => {
  it('schema has pr_check.enabled boolean defaulting to true', () => {
    const schema = JSON.parse(
      readFileSync(path.join(REPO_ROOT, 'schemas', 'harness.config.schema.json'), 'utf8')
    );
    const prCheck = schema.properties?.pr_check;
    assert.ok(prCheck, 'schema must define a pr_check property');
    assert.equal(prCheck.additionalProperties, false);
    assert.equal(prCheck.properties?.enabled?.type, 'boolean');
    assert.equal(prCheck.properties?.enabled?.default, true);
  });
});

describe('CS63a — harness-pr-check.yml hardening (CS63 R13 / C63-3)', () => {
  const wf = readFileSync(
    path.join(REPO_ROOT, 'template', 'managed', '.github', 'workflows', 'harness-pr-check.yml'),
    'utf8'
  );

  it('reads pr_check.enabled from the BASE config, never the PR head (self-disable guard)', () => {
    // R13: a PR must not be able to set pr_check.enabled=false in its own diff to
    // disable the structural gate on itself.
    assert.match(wf, /PR_BASE_SHA/, 'opt-out must reference the base SHA');
    assert.match(
      wf,
      /git show "\$\{PR_BASE_SHA\}:harness\.config\.json"/,
      'opt-out must read pr_check.enabled from the base-tree config'
    );
    assert.doesNotMatch(
      wf,
      /require\('\.\/harness\.config\.json'\)/,
      'opt-out must not read the PR-checkout config (a PR-head read is self-disabling)'
    );
  });

  it('managed-edit-ack requires a non-empty justification line (bare label does not clear the gate)', () => {
    // C63-3: label + a *non-empty* `Harness-managed-edit:` rationale are BOTH required.
    assert.match(
      wf,
      /Harness-managed-edit:\[\[:space:\]\]\*\[\^\[:space:\]\]/,
      'ack justification regex must require non-whitespace after the colon'
    );
  });
});
