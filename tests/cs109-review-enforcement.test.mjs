import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { loadReviewGatesEnforcement, ReviewsConfigError } from '../lib/reviews-policy.mjs';
import { diffManagedRulesetSurface } from '../bin/harness.mjs';

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
function makeTempDir(prefix = 'cs109-enf-') {
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

function writeConfig(dir, { enforcement, enforceGates = true } = {}) {
  const reviewGates = { enabled: true, copilot_required: true, gate_set: ['B1', 'A3', 'A4', 'A5', 'A16'] };
  if (enforcement !== undefined) reviewGates.enforcement = enforcement;
  const cfg = {
    version: 'v0.5.1',
    project: { name: 'cs109-fixture', agent_suffix: 'rg', repo: 'owner/repo' },
    managed: { files: [] },
    composed: { files: [] },
    seeded: { files: [] },
    scaffolds: [],
    excluded: [],
    review_gates: reviewGates,
    reviews: { enforce_gates: enforceGates, require_copilot_review: true },
  };
  writeFileSync(path.join(dir, 'harness.config.json'), `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');
}

function writeRuleset(dir, contexts = ['ci']) {
  const rulesetDir = path.join(dir, 'infra');
  mkdirSync(rulesetDir, { recursive: true });
  const ruleset = {
    name: 'main-protection',
    target: 'branch',
    enforcement: 'active',
    conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } },
    rules: [
      { type: 'required_status_checks', parameters: { strict_required_status_checks_policy: true, required_checks: contexts.map((context) => ({ context })) } },
    ],
    bypass_actors: [],
  };
  writeFileSync(path.join(rulesetDir, 'main-protection-ruleset.json'), `${JSON.stringify(ruleset, null, 2)}\n`, 'utf8');
}

function readRuleset(dir) {
  return JSON.parse(readFileSync(path.join(dir, 'infra', 'main-protection-ruleset.json'), 'utf8'));
}

function requiredContexts(ruleset) {
  const out = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    for (const [key, value] of Object.entries(node)) {
      if (key === 'required_checks' && Array.isArray(value)) {
        for (const e of value) out.push(typeof e === 'string' ? e : e.context);
      } else visit(value);
    }
  };
  visit(ruleset);
  return out;
}

function approvalCount(ruleset) {
  const rule = (ruleset.rules ?? []).find((r) => r?.type === 'pull_request');
  return rule ? rule.parameters?.required_approving_review_count ?? null : null;
}

// ---------------------------------------------------------------------------
// Reader — presence semantics (ADR 0006 D1)
// ---------------------------------------------------------------------------

describe('CS109 loadReviewGatesEnforcement — presence semantics', () => {
  const cases = [
    ['absent review_gates block', { version: '1.0.0' }, { present: false }],
    ['review_gates present, enforcement absent', { review_gates: { enabled: true } }, { present: false }],
    ['explicit human-approval', { review_gates: { enforcement: 'human-approval' } }, { present: true, value: 'human-approval' }],
    ['explicit required-check', { review_gates: { enforcement: 'required-check' } }, { present: true, value: 'required-check' }],
    ['explicit both', { review_gates: { enforcement: 'both' } }, { present: true, value: 'both' }],
  ];
  for (const [label, cfg, expected] of cases) {
    it(label, () => {
      const dir = makeTempDir();
      try {
        writeFileSync(path.join(dir, 'harness.config.json'), JSON.stringify(cfg), 'utf8');
        const got = loadReviewGatesEnforcement({ cwd: dir, configPath: 'harness.config.json' });
        assert.equal(got.present, expected.present);
        if (expected.present) assert.equal(got.value, expected.value);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }

  it('fails closed on a malformed enforcement value', () => {
    const dir = makeTempDir();
    try {
      writeFileSync(path.join(dir, 'harness.config.json'), JSON.stringify({ review_gates: { enforcement: 'nope' } }), 'utf8');
      assert.throws(
        () => loadReviewGatesEnforcement({ cwd: dir, configPath: 'harness.config.json' }),
        (err) => err instanceof ReviewsConfigError && err.code === 'MALFORMED' && err.field === 'review_gates.enforcement'
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails closed when review_gates is not an object', () => {
    const dir = makeTempDir();
    try {
      writeFileSync(path.join(dir, 'harness.config.json'), JSON.stringify({ review_gates: 'x' }), 'utf8');
      assert.throws(
        () => loadReviewGatesEnforcement({ cwd: dir, configPath: 'harness.config.json' }),
        (err) => err instanceof ReviewsConfigError && err.field === 'review_gates'
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Renderer — enforcement → ruleset mapping (ADR 0006 D2) via `harness sync`
// ---------------------------------------------------------------------------

describe('CS109 ruleset renderer — enforcement → ruleset mapping', () => {
  it('absent enforcement leaves the ruleset byte-for-byte unchanged (no pull_request rule)', () => {
    const dir = makeTempDir();
    try {
      writeConfig(dir, { enforcement: undefined, enforceGates: true });
      writeRuleset(dir, [...GATE_CONTEXTS, 'ci']); // already contains gate contexts
      const before = readFileSync(path.join(dir, 'infra', 'main-protection-ruleset.json'), 'utf8');
      const apply = runHarness(['--cwd', dir, 'sync', '--mode=apply']);
      assert.equal(apply.status, 0, `stdout:\n${apply.stdout}\nstderr:\n${apply.stderr}`);
      const after = readFileSync(path.join(dir, 'infra', 'main-protection-ruleset.json'), 'utf8');
      assert.equal(after, before, 'absent enforcement must not mutate an already-synced ruleset');
      assert.equal(approvalCount(readRuleset(dir)), null, 'no pull_request rule when enforcement absent');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('human-approval → approval count 1, gate contexts advisory (removed)', () => {
    const dir = makeTempDir();
    try {
      writeConfig(dir, { enforcement: 'human-approval' });
      writeRuleset(dir, [...GATE_CONTEXTS, 'ci']);
      const apply = runHarness(['--cwd', dir, 'sync', '--mode=apply']);
      assert.equal(apply.status, 0, `stdout:\n${apply.stdout}\nstderr:\n${apply.stderr}`);
      const ruleset = readRuleset(dir);
      const ctx = requiredContexts(ruleset);
      assert.equal(approvalCount(ruleset), 1);
      assert.ok(ctx.includes('ci'), 'non-gate contexts preserved');
      for (const g of GATE_CONTEXTS) assert.ok(!ctx.includes(g), `gate context ${g} should be removed (advisory)`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('required-check → approval count 0, gate contexts required', () => {
    const dir = makeTempDir();
    try {
      writeConfig(dir, { enforcement: 'required-check' });
      writeRuleset(dir, ['ci']);
      const apply = runHarness(['--cwd', dir, 'sync', '--mode=apply']);
      assert.equal(apply.status, 0, `stdout:\n${apply.stdout}\nstderr:\n${apply.stderr}`);
      const ruleset = readRuleset(dir);
      const ctx = requiredContexts(ruleset);
      assert.equal(approvalCount(ruleset), 0);
      for (const g of GATE_CONTEXTS) assert.ok(ctx.includes(g), `gate context ${g} should be required`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('both → approval count 1, gate contexts required', () => {
    const dir = makeTempDir();
    try {
      writeConfig(dir, { enforcement: 'both' });
      writeRuleset(dir, ['ci']);
      const apply = runHarness(['--cwd', dir, 'sync', '--mode=apply']);
      assert.equal(apply.status, 0, `stdout:\n${apply.stdout}\nstderr:\n${apply.stderr}`);
      const ruleset = readRuleset(dir);
      const ctx = requiredContexts(ruleset);
      assert.equal(approvalCount(ruleset), 1);
      for (const g of GATE_CONTEXTS) assert.ok(ctx.includes(g), `gate context ${g} should be required`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('explicit human-approval overrides legacy enforce_gates:true (gates advisory)', () => {
    const dir = makeTempDir();
    try {
      writeConfig(dir, { enforcement: 'human-approval', enforceGates: true });
      writeRuleset(dir, [...GATE_CONTEXTS]);
      const apply = runHarness(['--cwd', dir, 'sync', '--mode=apply']);
      assert.equal(apply.status, 0, `stdout:\n${apply.stdout}\nstderr:\n${apply.stderr}`);
      const ruleset = readRuleset(dir);
      const ctx = requiredContexts(ruleset);
      assert.equal(approvalCount(ruleset), 1, 'enforcement wins → approval count managed');
      for (const g of GATE_CONTEXTS) assert.ok(!ctx.includes(g), `enforcement human-approval must remove ${g} despite enforce_gates:true`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('sync --mode=check reports no drift after an enforcement apply (idempotent)', () => {
    const dir = makeTempDir();
    try {
      writeConfig(dir, { enforcement: 'required-check' });
      writeRuleset(dir, ['ci']);
      assert.equal(runHarness(['--cwd', dir, 'sync', '--mode=apply']).status, 0);
      const check = runHarness(['--cwd', dir, 'sync', '--mode=check']);
      assert.equal(check.status, 0, `stdout:\n${check.stdout}\nstderr:\n${check.stderr}`);
      assert.match(check.stdout, /No drift detected/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails closed on a malformed enforcement value during sync', () => {
    const dir = makeTempDir();
    try {
      writeConfig(dir, { enforcement: 'bogus' });
      writeRuleset(dir, ['ci']);
      const apply = runHarness(['--cwd', dir, 'sync', '--mode=apply']);
      assert.notEqual(apply.status, 0, 'malformed enforcement must fail closed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// diffManagedRulesetSurface — unit (ADR 0006 D3)
// ---------------------------------------------------------------------------

describe('CS109 diffManagedRulesetSurface — managed-surface diff', () => {
  const src = {
    rules: [
      { type: 'required_status_checks', parameters: { required_checks: [{ context: 'a' }, { context: 'b' }] } },
      { type: 'pull_request', parameters: { required_approving_review_count: 0 } },
    ],
  };

  it('no drift when live matches the managed surface (ignoring GitHub-added fields)', () => {
    const live = {
      id: 42,
      created_at: 'x',
      rules: [
        { type: 'required_status_checks', parameters: { required_checks: [{ context: 'b' }, { context: 'a' }], strict_required_status_checks_policy: true } },
        { type: 'pull_request', parameters: { required_approving_review_count: 0, dismiss_stale_reviews_on_push: false } },
      ],
    };
    const { drift } = diffManagedRulesetSurface(src, live);
    assert.equal(drift, false);
  });

  it('detects a missing required context', () => {
    const live = { rules: [{ type: 'required_status_checks', parameters: { required_checks: [{ context: 'a' }] } }, { type: 'pull_request', parameters: { required_approving_review_count: 0 } }] };
    const { drift, details } = diffManagedRulesetSurface(src, live);
    assert.equal(drift, true);
    assert.ok(details.some((d) => /MISSING/.test(d) && /b/.test(d)));
  });

  it('detects an approval-count drift', () => {
    const live = { rules: [{ type: 'required_status_checks', parameters: { required_checks: [{ context: 'a' }, { context: 'b' }] } }, { type: 'pull_request', parameters: { required_approving_review_count: 1 } }] };
    const { drift, details } = diffManagedRulesetSurface(src, live);
    assert.equal(drift, true);
    assert.ok(details.some((d) => /required_approving_review_count/.test(d)));
  });

  it('does not flag approval count when the source does not manage one', () => {
    const srcNoPr = { rules: [{ type: 'required_status_checks', parameters: { required_checks: [{ context: 'a' }] } }] };
    const live = { rules: [{ type: 'required_status_checks', parameters: { required_checks: [{ context: 'a' }] } }, { type: 'pull_request', parameters: { required_approving_review_count: 1 } }] };
    const { drift } = diffManagedRulesetSurface(srcNoPr, live);
    assert.equal(drift, false);
  });
});

// ---------------------------------------------------------------------------
// `harness ruleset check` verb — CLI (ADR 0006 D3)
// ---------------------------------------------------------------------------

describe('CS109 harness ruleset check — CLI', () => {
  it('exits 0 with no drift against a matching --live-file', () => {
    const dir = makeTempDir();
    try {
      writeRuleset(dir, [...GATE_CONTEXTS]);
      const live = path.join(dir, 'live.json');
      writeFileSync(live, JSON.stringify({ name: 'main-protection', rules: [{ type: 'required_status_checks', parameters: { required_checks: GATE_CONTEXTS.map((context) => ({ context })) } }] }), 'utf8');
      const res = runHarness(['--cwd', dir, 'ruleset', 'check', '--live-file', live]);
      assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
      assert.match(res.stdout, /no drift/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exits 1 on drift against a divergent --live-file', () => {
    const dir = makeTempDir();
    try {
      writeRuleset(dir, [...GATE_CONTEXTS]);
      const live = path.join(dir, 'live.json');
      writeFileSync(live, JSON.stringify({ name: 'main-protection', rules: [{ type: 'required_status_checks', parameters: { required_checks: [{ context: 'ci' }] } }] }), 'utf8');
      const res = runHarness(['--cwd', dir, 'ruleset', 'check', '--live-file', live]);
      assert.equal(res.status, 1);
      assert.match(res.stderr, /DRIFT/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects `ruleset apply` (deferred to CS109a) with exit 2', () => {
    const dir = makeTempDir();
    try {
      writeRuleset(dir, ['ci']);
      const res = runHarness(['--cwd', dir, 'ruleset', 'apply']);
      assert.equal(res.status, 2);
      assert.match(res.stderr, /deferred to CS109a/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
