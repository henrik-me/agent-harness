import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const F3 = path.join(REPO_ROOT, 'scripts', 'check-ruleset-deadlock.mjs');
const F4 = path.join(REPO_ROOT, 'scripts', 'check-posture-coherence.mjs');

// Scratch state lives under os.tmpdir() — never under REPO_ROOT (writes there
// race check-text-encoding's recursive walk under parallel `node --test`).
function makeTempDir(prefix = 'cs109-guards-') {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

function run(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function writeRuleset(dir, { contexts = [], bypassActors = [] } = {}) {
  mkdirSync(path.join(dir, 'infra'), { recursive: true });
  const ruleset = {
    name: 'main-protection',
    rules: [{ type: 'required_status_checks', parameters: { required_checks: contexts.map((context) => ({ context })) } }],
    bypass_actors: bypassActors,
  };
  const p = path.join(dir, 'infra', 'main-protection-ruleset.json');
  writeFileSync(p, `${JSON.stringify(ruleset, null, 2)}\n`, 'utf8');
  return p;
}

function writeWorkflow(dir, name, body) {
  const wfDir = path.join(dir, '.github', 'workflows');
  mkdirSync(wfDir, { recursive: true });
  writeFileSync(path.join(wfDir, name), body, 'utf8');
}

function writeConfig(dir, reviewGates) {
  const p = path.join(dir, 'harness.config.json');
  writeFileSync(p, JSON.stringify({ review_gates: reviewGates }), 'utf8');
  return p;
}

// ---------------------------------------------------------------------------
// F3 — check-ruleset-deadlock (ADR 0006 D4)
// ---------------------------------------------------------------------------

describe('CS109 F3 check-ruleset-deadlock', () => {
  it('passes with 0 warnings when every required context has a producing job', () => {
    const dir = makeTempDir();
    try {
      const rs = writeRuleset(dir, { contexts: ['job-a', 'job-b'] });
      writeWorkflow(dir, 'w.yml', 'name: w\non:\n  pull_request:\n    branches: [main]\njobs:\n  job-a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: true\n  job-b:\n    name: job-b\n    runs-on: ubuntu-latest\n    steps:\n      - run: true\n');
      const res = run(F3, ['--ruleset', rs, '--workflows-dir', path.join(dir, '.github', 'workflows')]);
      assert.equal(res.status, 0);
      assert.match(res.stdout, /0 warning\(s\)/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('warns (exit 0) on a required context with no producing job', () => {
    const dir = makeTempDir();
    try {
      const rs = writeRuleset(dir, { contexts: ['ghost'] });
      writeWorkflow(dir, 'w.yml', 'name: w\non:\n  pull_request:\njobs:\n  real:\n    runs-on: ubuntu-latest\n    steps:\n      - run: true\n');
      const res = run(F3, ['--ruleset', rs, '--workflows-dir', path.join(dir, '.github', 'workflows')]);
      assert.equal(res.status, 0, 'warn-only, never hard-fails');
      assert.match(res.stdout, /NO producing workflow job/);
      assert.match(res.stdout, /1 warning\(s\)/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('warns when a required context is produced only by a path-filtered workflow', () => {
    const dir = makeTempDir();
    try {
      const rs = writeRuleset(dir, { contexts: ['gated'] });
      writeWorkflow(dir, 'w.yml', 'name: w\non:\n  pull_request:\n    paths:\n      - "src/**"\njobs:\n  gated:\n    runs-on: ubuntu-latest\n    steps:\n      - run: true\n');
      const res = run(F3, ['--ruleset', rs, '--workflows-dir', path.join(dir, '.github', 'workflows')]);
      assert.equal(res.status, 0);
      assert.match(res.stdout, /paths\/paths-ignore filter/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not warn when only a non-PR event (push) carries a paths filter', () => {
    const dir = makeTempDir();
    try {
      const rs = writeRuleset(dir, { contexts: ['job-a'] });
      writeWorkflow(dir, 'w.yml', 'name: w\non:\n  push:\n    paths:\n      - "src/**"\n  pull_request:\n    branches: [main]\njobs:\n  job-a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: true\n');
      const res = run(F3, ['--ruleset', rs, '--workflows-dir', path.join(dir, '.github', 'workflows')]);
      assert.equal(res.status, 0);
      assert.match(res.stdout, /0 warning\(s\)/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not treat a step-level name: as a producing job (no false negative)', () => {
    const dir = makeTempDir();
    try {
      const rs = writeRuleset(dir, { contexts: ['deploy'] });
      // `deploy` appears only as a STEP name (not a job) → still no producer → warn.
      writeWorkflow(dir, 'w.yml', 'name: w\non:\n  pull_request:\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n        name: deploy\n');
      const res = run(F3, ['--ruleset', rs, '--workflows-dir', path.join(dir, '.github', 'workflows')]);
      assert.equal(res.status, 0);
      assert.match(res.stdout, /NO producing workflow job/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exits 1 (fail-closed) on a malformed ruleset', () => {
    const dir = makeTempDir();
    try {
      mkdirSync(path.join(dir, 'infra'), { recursive: true });
      const p = path.join(dir, 'infra', 'main-protection-ruleset.json');
      writeFileSync(p, '{ not json', 'utf8');
      const res = run(F3, ['--ruleset', p]);
      assert.equal(res.status, 1);
      assert.match(res.stderr, /malformed JSON/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// F4 — check-posture-coherence (ADR 0006 D5)
// ---------------------------------------------------------------------------

describe('CS109 F4 check-posture-coherence', () => {
  it('passes with 0 warnings when enforcement is absent', () => {
    const dir = makeTempDir();
    try {
      const cfg = writeConfig(dir, { enabled: true });
      const rs = writeRuleset(dir, { bypassActors: [{ actor_id: 1, actor_type: 'RepositoryRole' }] });
      const res = run(F4, ['--config', cfg, '--ruleset', rs]);
      assert.equal(res.status, 0);
      assert.match(res.stdout, /0 warning\(s\)/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes when enforcement is human-approval even with bypass actors', () => {
    const dir = makeTempDir();
    try {
      const cfg = writeConfig(dir, { enforcement: 'human-approval' });
      const rs = writeRuleset(dir, { bypassActors: [{ actor_id: 1, actor_type: 'RepositoryRole' }] });
      const res = run(F4, ['--config', cfg, '--ruleset', rs]);
      assert.equal(res.status, 0);
      assert.match(res.stdout, /0 warning\(s\)/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('warns when enforcement is required-check and the ruleset has bypass actors', () => {
    const dir = makeTempDir();
    try {
      const cfg = writeConfig(dir, { enforcement: 'required-check' });
      const rs = writeRuleset(dir, { bypassActors: [{ actor_id: 1, actor_type: 'RepositoryRole' }] });
      const res = run(F4, ['--config', cfg, '--ruleset', rs]);
      assert.equal(res.status, 0, 'warn-only');
      assert.match(res.stdout, /bypass actor/);
      assert.match(res.stdout, /1 warning\(s\)/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('warns when enforcement is both but no ruleset exists (unrendered)', () => {
    const dir = makeTempDir();
    try {
      const cfg = writeConfig(dir, { enforcement: 'both' });
      const res = run(F4, ['--config', cfg, '--ruleset', path.join(dir, 'infra', 'nope.json')]);
      assert.equal(res.status, 0);
      assert.match(res.stdout, /UNRENDERED/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exits 1 (fail-closed) on a malformed enforcement value', () => {
    const dir = makeTempDir();
    try {
      const cfg = writeConfig(dir, { enforcement: 'bogus' });
      const res = run(F4, ['--config', cfg]);
      assert.equal(res.status, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
