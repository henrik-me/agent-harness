import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const CLI = path.join(REPO_ROOT, 'bin', 'harness.mjs');

const GATE_CONTEXTS = [
  'review-log-evidence',
  'copilot-review-attached',
  'independence-invariant',
  'review-threads-resolved',
];

// All scratch state lives under os.tmpdir() — never under REPO_ROOT (writes
// there race check-text-encoding's recursive walk under parallel `node --test`).
function makeTempDir(prefix = 'cs109a-apply-') {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

function runHarness(args) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function writeSourceRuleset(dir, contexts = [...GATE_CONTEXTS]) {
  const infra = path.join(dir, 'infra');
  mkdirSync(infra, { recursive: true });
  const ruleset = {
    name: 'main-protection',
    target: 'branch',
    enforcement: 'active',
    conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } },
    rules: [
      {
        type: 'required_status_checks',
        parameters: { strict_required_status_checks_policy: true, required_checks: [...contexts] },
      },
    ],
    bypass_actors: [],
  };
  writeFileSync(path.join(infra, 'main-protection-ruleset.json'), `${JSON.stringify(ruleset, null, 2)}\n`, 'utf8');
}

// Write a workflow whose job-ids exactly match the given contexts, with NO
// PR-level paths filter → the F3 deadlock guard reports zero warnings.
function writeProducingWorkflow(dir, contexts = [...GATE_CONTEXTS]) {
  const wfDir = path.join(dir, '.github', 'workflows');
  mkdirSync(wfDir, { recursive: true });
  const jobs = contexts
    .map((c) => `  ${c}:\n    runs-on: ubuntu-latest\n    steps:\n      - run: true\n`)
    .join('');
  writeFileSync(
    path.join(wfDir, 'gates.yml'),
    `name: gates\non:\n  pull_request:\n    branches: [main]\njobs:\n${jobs}`,
    'utf8'
  );
}

function writeLiveFile(dir, name, contexts) {
  const p = path.join(dir, name);
  writeFileSync(
    p,
    JSON.stringify({
      name: 'main-protection',
      rules: [{ type: 'required_status_checks', parameters: { required_checks: contexts.map((c) => ({ context: c })) } }],
    }),
    'utf8'
  );
  return p;
}

// A fixture where the source's required contexts all have producing workflow
// jobs (so the F3 preflight is clean).
function makeCleanFixture(contexts = [...GATE_CONTEXTS]) {
  const dir = makeTempDir();
  writeSourceRuleset(dir, contexts);
  writeProducingWorkflow(dir, contexts);
  return dir;
}

// A minimal but schema-valid harness.config.json that makes `sync --mode=check`
// pass (empty managed/composed/seeded + a review_gates opt-out), so the
// pre-apply sync-check preflight leg passes with the DEFAULT config.
function writeMinimalConfig(dir) {
  const cfg = {
    version: 'v0.5.1',
    project: { name: 'fx', agent_suffix: 'rg', repo: 'owner/repo' },
    managed: { files: [] },
    composed: { files: [] },
    seeded: { files: [] },
    scaffolds: [],
    excluded: [],
    review_gates: { _opt_out_reason: 'fixture' },
  };
  writeFileSync(path.join(dir, 'harness.config.json'), `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');
}

// ---------------------------------------------------------------------------
// Dry-run (default, no --apply) — renders + diffs, mutates nothing
// ---------------------------------------------------------------------------

describe('CS109a harness ruleset apply — dry-run', () => {
  it('prints the rendered source + drift diff and mutates nothing (exit 0)', () => {
    const dir = makeCleanFixture();
    try {
      const live = writeLiveFile(dir, 'live.json', ['ci']); // diverges from source
      const store = path.join(dir, 'put-store.json');
      const res = runHarness(['--cwd', dir, 'ruleset', 'apply', '--live-file', live, '--put-file', store]);
      assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
      assert.match(res.stdout, /"name": "main-protection"/); // rendered source
      assert.match(res.stdout, /DRIFT vs the live ruleset/);
      assert.match(res.stdout, /NOTHING was mutated/);
      assert.equal(existsSync(store), false, 'dry-run must never write the PUT store');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports "no drift" in dry-run when live already matches the source (exit 0)', () => {
    const dir = makeCleanFixture();
    try {
      const live = writeLiveFile(dir, 'live.json', [...GATE_CONTEXTS]);
      const res = runHarness(['--cwd', dir, 'ruleset', 'apply', '--live-file', live]);
      assert.equal(res.status, 0, `stderr:\n${res.stderr}`);
      assert.match(res.stdout, /no drift/);
      assert.match(res.stdout, /NOTHING was mutated/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// --apply gating — apply without --apply never PUTs
// ---------------------------------------------------------------------------

describe('CS109a harness ruleset apply — --apply gating', () => {
  it('apply WITHOUT --apply never writes the PUT store', () => {
    const dir = makeCleanFixture();
    try {
      const live = writeLiveFile(dir, 'live.json', ['ci']);
      const store = path.join(dir, 'put-store.json');
      const res = runHarness(['--cwd', dir, 'ruleset', 'apply', '--live-file', live, '--put-file', store]);
      assert.equal(res.status, 0);
      assert.equal(existsSync(store), false, 'no PUT may happen without --apply');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// --apply PUT — success + fail-closed
// ---------------------------------------------------------------------------

describe('CS109a harness ruleset apply --apply — PUT', () => {
  it('writes the PUT body and verifies success (exit 0)', () => {
    const dir = makeCleanFixture();
    try {
      const live = writeLiveFile(dir, 'live.json', ['ci']);
      const store = path.join(dir, 'put-store.json');
      const res = runHarness([
        '--cwd', dir, 'ruleset', 'apply', '--apply',
        '--live-file', live, '--put-file', store, '--skip-preflight-sync',
      ]);
      assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
      assert.equal(existsSync(store), true, 'the PUT body must be written');
      const written = JSON.parse(readFileSync(store, 'utf8'));
      assert.equal(written.name, 'main-protection');
      assert.deepEqual(
        written.rules[0].parameters.required_checks,
        [...GATE_CONTEXTS],
        'the PUT body is the rendered source'
      );
      assert.match(res.stdout, /verified/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails closed (exit 1) when the PUT itself errors', () => {
    const dir = makeCleanFixture();
    try {
      const live = writeLiveFile(dir, 'live.json', ['ci']);
      // A path under a non-existent directory → writeFileSync throws ENOENT.
      const unwritable = path.join(dir, 'does-not-exist', 'put.json');
      const res = runHarness([
        '--cwd', dir, 'ruleset', 'apply', '--apply',
        '--live-file', live, '--put-file', unwritable, '--skip-preflight-sync',
      ]);
      assert.equal(res.status, 1);
      assert.match(res.stderr, /failed to write PUT body/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Mandatory post-apply verification (Deliverable 3)
// ---------------------------------------------------------------------------

describe('CS109a harness ruleset apply --apply — post-apply verification', () => {
  it('verify-success: post-PUT live matches source → exit 0', () => {
    const dir = makeCleanFixture();
    try {
      const live = writeLiveFile(dir, 'live.json', ['ci']);
      const store = path.join(dir, 'put-store.json');
      const res = runHarness([
        '--cwd', dir, 'ruleset', 'apply', '--apply',
        '--live-file', live, '--put-file', store, '--skip-preflight-sync',
      ]);
      assert.equal(res.status, 0, `stderr:\n${res.stderr}`);
      assert.match(res.stdout, /Verifying the managed surface/);
      assert.match(res.stdout, /verified/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('verify-failure: post-PUT live still diverges → fail-closed (exit 1)', () => {
    const dir = makeCleanFixture();
    try {
      const live = writeLiveFile(dir, 'live.json', ['ci']);
      const store = path.join(dir, 'put-store.json');
      // Re-read of the post-apply "live" diverges from the source.
      const divergent = writeLiveFile(dir, 'divergent.json', ['ci']);
      const res = runHarness([
        '--cwd', dir, 'ruleset', 'apply', '--apply',
        '--live-file', live, '--put-file', store, '--verify-live-file', divergent, '--skip-preflight-sync',
      ]);
      assert.equal(res.status, 1, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
      assert.match(res.stderr, /post-apply verification FAILED/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Binding pre-apply preflight (Deliverable 4 / Decision 5)
// ---------------------------------------------------------------------------

describe('CS109a harness ruleset apply --apply — pre-apply preflight', () => {
  it('preflight-pass: F3-clean fixture proceeds to the PUT (exit 0)', () => {
    const dir = makeCleanFixture();
    try {
      const live = writeLiveFile(dir, 'live.json', ['ci']);
      const store = path.join(dir, 'put-store.json');
      const res = runHarness([
        '--cwd', dir, 'ruleset', 'apply', '--apply',
        '--live-file', live, '--put-file', store, '--skip-preflight-sync',
      ]);
      assert.equal(res.status, 0, `stderr:\n${res.stderr}`);
      assert.equal(existsSync(store), true, 'preflight passed → the PUT ran');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('preflight-pass via the REAL sync-check leg: a clean default config proceeds to the PUT (exit 0)', () => {
    // Exercises the DEFAULT sync-check success path (no --skip-preflight-sync):
    // a minimal valid harness.config.json makes `sync --mode=check` pass, so the
    // preflight's sync leg runs for real and succeeds, then the F3 leg is clean,
    // and the apply proceeds to the PUT + post-apply verify.
    const dir = makeCleanFixture();
    try {
      writeMinimalConfig(dir);
      const live = writeLiveFile(dir, 'live.json', ['ci']);
      const store = path.join(dir, 'put-store.json');
      const res = runHarness([
        '--cwd', dir, 'ruleset', 'apply', '--apply', '--live-file', live, '--put-file', store,
      ]);
      assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
      assert.equal(existsSync(store), true, 'the real sync-check passed → the PUT ran');
      assert.match(res.stdout, /verified/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('preflight-block via F3: a required context with no producer blocks the apply (exit 1, no PUT)', () => {
    // Source requires a context that no workflow job produces → F3 warns.
    const dir = makeTempDir();
    try {
      writeSourceRuleset(dir, ['ghost-context']);
      writeProducingWorkflow(dir, [...GATE_CONTEXTS]); // no job named ghost-context
      const live = writeLiveFile(dir, 'live.json', ['ci']);
      const store = path.join(dir, 'put-store.json');
      const res = runHarness([
        '--cwd', dir, 'ruleset', 'apply', '--apply',
        '--live-file', live, '--put-file', store, '--skip-preflight-sync',
      ]);
      assert.equal(res.status, 1, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
      assert.match(res.stderr, /BLOCKED by the pre-apply preflight/);
      assert.match(res.stderr, /ruleset-deadlock \(F3\) warning/);
      assert.equal(existsSync(store), false, 'a blocked preflight must never PUT');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('preflight-block via sync-check: config-vs-source drift blocks the apply (exit 1, no PUT)', () => {
    // No harness.config.json → `harness sync --mode=check` exits non-zero, so the
    // sync-check preflight step (run because --skip-preflight-sync is omitted)
    // blocks the apply before any PUT.
    const dir = makeCleanFixture();
    try {
      const live = writeLiveFile(dir, 'live.json', ['ci']);
      const store = path.join(dir, 'put-store.json');
      const res = runHarness([
        '--cwd', dir, 'ruleset', 'apply', '--apply', '--live-file', live, '--put-file', store,
      ]);
      assert.equal(res.status, 1, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
      assert.match(res.stderr, /BLOCKED by the pre-apply preflight/);
      assert.match(res.stderr, /sync --mode=check/);
      assert.equal(existsSync(store), false, 'a blocked preflight must never PUT');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('threads --config into the pre-apply sync-check: a malformed --config blocks even when the DEFAULT config is clean (exit 1, no PUT)', () => {
    // Regression for the preflight-config-threading fix. The cwd carries a CLEAN
    // default harness.config.json (sync --mode=check would pass with it); a
    // MALFORMED config sits at a non-default path. With --config threaded into the
    // preflight sync-check, the malformed config is used → sync fails → the apply is
    // blocked. If --config were NOT threaded, sync would use the clean default and
    // proceed to the PUT — so this test fails without the fix.
    const dir = makeCleanFixture();
    try {
      writeMinimalConfig(dir);
      const brokenCfg = path.join(dir, 'broken.json');
      writeFileSync(brokenCfg, '{ not valid json', 'utf8');
      const live = writeLiveFile(dir, 'live.json', ['ci']);
      const store = path.join(dir, 'put-store.json');
      const res = runHarness([
        '--cwd', dir, 'ruleset', 'apply', '--apply',
        '--config', brokenCfg, '--live-file', live, '--put-file', store,
      ]);
      assert.equal(res.status, 1, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
      assert.match(res.stderr, /BLOCKED by the pre-apply preflight/);
      assert.match(res.stderr, /sync --mode=check/);
      assert.equal(existsSync(store), false, 'a blocked preflight must never PUT');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// TEST-ONLY seam safety guards — the seams must be impossible to combine into
// a live-mutation hole (file-verify / skipped preflight around a real PUT).
// ---------------------------------------------------------------------------

describe('CS109a harness ruleset apply --apply — seam safety guards', () => {
  it('rejects --verify-live-file without --put-file (exit 2) — never file-verify a real live PUT', () => {
    const dir = makeCleanFixture();
    try {
      const live = writeLiveFile(dir, 'live.json', ['ci']);
      const verify = writeLiveFile(dir, 'verify.json', ['ci']);
      const res = runHarness([
        '--cwd', dir, 'ruleset', 'apply', '--apply', '--live-file', live, '--verify-live-file', verify,
      ]);
      assert.equal(res.status, 2, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
      assert.match(res.stderr, /--verify-live-file requires --put-file/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects --skip-preflight-sync without --put-file (exit 2) — never skip the preflight around a real live PUT', () => {
    const dir = makeCleanFixture();
    try {
      const live = writeLiveFile(dir, 'live.json', ['ci']);
      const res = runHarness([
        '--cwd', dir, 'ruleset', 'apply', '--apply', '--live-file', live, '--skip-preflight-sync',
      ]);
      assert.equal(res.status, 2, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
      assert.match(res.stderr, /--skip-preflight-sync requires --put-file/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
