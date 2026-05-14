import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const CLI = path.join(REPO_ROOT, 'bin', 'harness.mjs');
const MIGRATION_MESSAGE = 'review_gates is now opt-out by default in v0.5.0';

function makeTempDir() {
  return mkdtempSync(path.join(os.tmpdir(), 'cs41-flip-'));
}

function runHarness(args, cwd, env = {}) {
  const result = spawnSync(
    process.execPath,
    [CLI, ...args],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    }
  );
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function writeConfig(dir, cfg) {
  writeFileSync(path.join(dir, 'harness.config.json'), `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');
}

function minimalConfig(extra = {}) {
  return {
    version: 'v0.5.0',
    project: { name: 'cs41-flip-fixture', agent_suffix: 'cf' },
    managed: { files: [] },
    composed: { files: [] },
    seeded: { files: [] },
    scaffolds: [],
    excluded: [],
    ...extra,
  };
}

describe('CS41 review_gates default flip', () => {
  it('fresh harness init with no flags writes review_gates.enabled=true', () => {
    const dir = makeTempDir();
    try {
      const r = runHarness(
        ['init', '--cwd', dir],
        dir,
        { HARNESS_DETECT_TIER_OVERRIDE: JSON.stringify({ tier: 'unknown', reason: 'offline-test' }) }
      );
      assert.equal(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
      const cfg = JSON.parse(readFileSync(path.join(dir, 'harness.config.json'), 'utf8'));
      assert.equal(cfg.review_gates?.enabled, true);
      assert.deepEqual(cfg.review_gates?.gate_set, ['B1', 'A3', 'A4', 'A5', 'A16']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('sync --mode=check errors when review_gates block is absent', () => {
    const dir = makeTempDir();
    try {
      writeConfig(dir, minimalConfig());
      const r = runHarness(['sync', '--mode=check', '--cwd', dir], dir);
      assert.equal(r.status, 1, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
      assert.match(r.stderr, new RegExp(MIGRATION_MESSAGE));
      assert.match(r.stderr, /_opt_out_reason/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('sync --mode=check accepts explicit opt-out with a reason', () => {
    const dir = makeTempDir();
    try {
      writeConfig(dir, minimalConfig({
        review_gates: {
          enabled: false,
          _opt_out_reason: 'legacy migration in progress',
        },
      }));
      const r = runHarness(['sync', '--mode=check', '--cwd', dir], dir);
      assert.equal(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
      assert.match(r.stdout, /No drift detected/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
