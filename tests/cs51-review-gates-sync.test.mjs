import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const CLI = path.join(REPO_ROOT, 'bin', 'harness.mjs');
const REQUIRED = [
  'review-log-evidence',
  'copilot-review-attached',
  'independence-invariant',
  'review-threads-resolved',
];

function makeTempDir(prefix = 'cs51-review-sync-') {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

function runHarness(args, options = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...(options.env ?? {}) },
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function writeConfig(dir) {
  const cfg = {
    version: 'v0.5.1',
    project: { name: 'review-gate-sync-fixture', agent_suffix: 'rg', repo: 'owner/repo' },
    managed: { files: [] },
    composed: { files: [] },
    seeded: { files: [] },
    scaffolds: [],
    excluded: [],
    review_gates: { enabled: true, copilot_required: true, gate_set: ['B1', 'A3', 'A4', 'A5', 'A16'] },
    reviews: { enforce_gates: true, require_copilot_review: true },
  };
  writeFileSync(path.join(dir, 'harness.config.json'), `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');
}

function writeRuleset(dir, entries = ['ci']) {
  const rulesetDir = path.join(dir, 'infra');
  mkdirSync(rulesetDir, { recursive: true });
  const ruleset = {
    name: 'main-protection',
    rules: [
      {
        type: 'required_status_checks',
        parameters: {
          required_checks: entries.map((context) => ({ context })),
        },
      },
    ],
  };
  writeFileSync(path.join(rulesetDir, 'main-protection-ruleset.json'), `${JSON.stringify(ruleset, null, 2)}\n`, 'utf8');
}

function readRequiredChecks(dir) {
  const ruleset = JSON.parse(readFileSync(path.join(dir, 'infra', 'main-protection-ruleset.json'), 'utf8'));
  const checks = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'required_checks' && Array.isArray(value)) {
        for (const entry of value) checks.push(typeof entry === 'string' ? entry : entry.context);
      } else {
        visit(value);
      }
    }
  };
  visit(ruleset);
  return checks;
}

describe('CS51 review gate sync/init integration', () => {
  it('harness sync --mode=apply injects the four required_checks contexts into an existing ruleset', () => {
    const dir = makeTempDir();
    try {
      writeConfig(dir);
      writeRuleset(dir, ['ci']);
      const apply = runHarness(['--cwd', dir, 'sync', '--mode=apply']);
      assert.equal(apply.status, 0, `stdout:\n${apply.stdout}\nstderr:\n${apply.stderr}`);
      const checks = readRequiredChecks(dir);
      assert.ok(checks.includes('ci'));
      for (const context of REQUIRED) assert.ok(checks.includes(context), `missing ${context}`);

      const check = runHarness(['--cwd', dir, 'sync', '--mode=check']);
      assert.equal(check.status, 0, `stdout:\n${check.stdout}\nstderr:\n${check.stderr}`);
      assert.match(check.stdout, /No drift detected/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fresh harness init defaults reviews.enforce_gates on and creates the ruleset contexts', () => {
    const dir = makeTempDir('cs51-review-init-');
    try {
      const init = runHarness(['--cwd', dir, 'init'], {
        env: { HARNESS_DETECT_TIER_OVERRIDE: JSON.stringify({ tier: 'unknown', reason: 'offline-test' }) },
      });
      assert.equal(init.status, 0, `stdout:\n${init.stdout}\nstderr:\n${init.stderr}`);
      const cfg = JSON.parse(readFileSync(path.join(dir, 'harness.config.json'), 'utf8'));
      assert.equal(cfg.reviews?.enforce_gates, true);
      assert.equal(cfg.reviews?.require_copilot_review, true);
      assert.ok(cfg.managed.files.includes('.github/workflows/review-gates.yml'));
      const checks = readRequiredChecks(dir);
      for (const context of REQUIRED) assert.ok(checks.includes(context), `missing ${context}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
