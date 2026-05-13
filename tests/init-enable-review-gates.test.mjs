import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const prTemplate = '.github/pull_request_template.md';
const instructionNeedle = 'PR-evidence gates enabled. Manual step required:';

function makeTempDir() {
  return mkdtempSync(path.join(os.tmpdir(), 'harness-review-gates-'));
}

function writeConfig(dir) {
  const cfg = {
    $schema: 'https://github.com/henrik-me/agent-harness/schemas/harness.config.schema.json',
    version: 'v0.1.0',
    project: { name: 'review-gates-fixture', agent_suffix: 'rg', repo: 'owner/repo' },
    managed: { files: [prTemplate] },
    composed: { files: [], overrides: {} },
    seeded: { files: [] },
    templating: {
      project_name: 'review-gates-fixture',
      agent_suffix: 'rg',
      agent_suffix_upper: 'RG',
      repo_owner: 'owner',
      repo_slug: 'owner/repo',
      repo_short: 'repo',
      default_codeowner: 'owner',
      lib_codeowner: 'owner',
    },
    scaffolds: [],
    excluded: [],
  };
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'harness.config.json'), `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');
}

function readConfig(dir) {
  return JSON.parse(readFileSync(path.join(dir, 'harness.config.json'), 'utf8'));
}

function runInit(dir, extraArgs = []) {
  return spawnSync(
    process.execPath,
    ['bin/harness.mjs', 'init', ...extraArgs, '--cwd', dir],
    { cwd: repoRoot, encoding: 'utf8' },
  );
}

function instructionBlock(stdout) {
  const marker = '══════════════════════════════════════════════════════════════════════';
  const start = stdout.indexOf(marker);
  assert.notEqual(start, -1, `instruction block missing from stdout:\n${stdout}`);
  const end = stdout.indexOf(marker, start + marker.length);
  assert.notEqual(end, -1, `instruction block terminator missing from stdout:\n${stdout}`);
  return stdout.slice(start, end + marker.length).trim();
}

describe('harness init --enable-review-gates', () => {
  it('writes the review_gates config block', () => {
    const dir = makeTempDir();
    try {
      writeConfig(dir);
      const result = runInit(dir, ['--enable-review-gates']);
      assert.equal(result.status, 0, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);

      assert.deepEqual(readConfig(dir).review_gates, {
        enabled: true,
        copilot_required: true,
        gate_set: ['B1', 'A3', 'A4', 'A5', 'A16', 'A6'],
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('migrates the PR template from managed.files to composed.files', () => {
    const dir = makeTempDir();
    try {
      writeConfig(dir);
      const result = runInit(dir, ['--enable-review-gates']);
      assert.equal(result.status, 0, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);

      const cfg = readConfig(dir);
      assert.equal(cfg.managed.files.includes(prTemplate), false);
      assert.equal(cfg.composed.files.includes(prTemplate), true);
      assert.deepEqual(cfg.composed.overrides[prTemplate], {
        _inherited_class: 'managed',
        local_blocks: ['pull-request.review-evidence'],
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('emits the branch-ruleset instruction block to stdout', () => {
    const dir = makeTempDir();
    try {
      writeConfig(dir);
      const result = runInit(dir, ['--enable-review-gates']);
      assert.equal(result.status, 0, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);

      assert.match(result.stdout, new RegExp(instructionNeedle));
      assert.match(result.stdout, /pr-evidence-lint \/ read-only-gates/);
      assert.match(result.stdout, /managing-rulesets-for-a-repository/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is idempotent and re-emits the same instruction block', () => {
    const dir = makeTempDir();
    try {
      writeConfig(dir);
      const first = runInit(dir, ['--enable-review-gates']);
      assert.equal(first.status, 0, `stdout:\n${first.stdout}\nstderr:\n${first.stderr}`);
      const afterFirst = readConfig(dir);

      const second = runInit(dir, ['--enable-review-gates']);
      assert.equal(second.status, 0, `stdout:\n${second.stdout}\nstderr:\n${second.stderr}`);

      assert.deepEqual(readConfig(dir), afterFirst);
      assert.equal(instructionBlock(second.stdout), instructionBlock(first.stdout));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not write review_gates or migrate without the flag', () => {
    const dir = makeTempDir();
    try {
      writeConfig(dir);
      const result = runInit(dir);
      assert.equal(result.status, 0, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);

      const cfg = readConfig(dir);
      assert.equal(cfg.review_gates, undefined);
      assert.equal(cfg.managed.files.includes(prTemplate), true);
      assert.equal(cfg.composed.files.includes(prTemplate), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
