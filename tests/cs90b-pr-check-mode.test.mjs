/**
 * tests/cs90b-pr-check-mode.test.mjs — CS90b (#392 L3): pr_check.mode drift-only
 * vs lint+drift + adoption-overlap advisory + schema.
 *
 * Covers:
 *  - Schema: pr_check.mode accepts "lint+drift" / "drift-only" (and absent);
 *    rejects any other value (additionalProperties stays false).
 *  - Workflow: harness-pr-check.yml reads pr_check.mode from the BASE-tree config
 *    (never the PR head) and, in drift-only, SKIPS `harness lint` while STILL
 *    running the managed/composed drift classifier + harness-managed-edit-ack
 *    escape valve; lint+drift keeps the pre-CS90b behaviour.
 *  - Overlap advisory (C90b-4): fires for an ADOPTED lint+drift consumer whose own
 *    (non-harness-managed) workflow already runs `harness lint`; silent when
 *    drift-only, when there is no overlap, and when harness-pr-check.yml is not
 *    adopted (the self-host case). Never changes driftDetected / the sync exit code.
 *
 * All scratch fixtures live under os.tmpdir() ONLY (harness convention: writing
 * under the repo root races check-text-encoding's recursive walk under parallel
 * `node --test`). The real template/managed/ + schema trees are read-only here.
 *
 * Run: node --test tests/cs90b-pr-check-mode.test.mjs
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { sync, detectPrCheckLintOverlap } from '../lib/sync.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const schema = JSON.parse(
  readFileSync(path.join(repoRoot, 'schemas', 'harness.config.schema.json'), 'utf8')
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(prefix = 'cs90b-') {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}
function removeTmpDir(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}
function writeText(filePath, content) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}
function writeJSON(filePath, obj) {
  writeText(filePath, JSON.stringify(obj, null, 2) + '\n');
}

/** Schema compile helper — mirrors tests/schema-review-gates.test.mjs. */
function compile() {
  const ajv = new Ajv2020({ strict: false, validateSchema: false });
  addFormats(ajv);
  return ajv.compile(schema);
}
function minimalConfig() {
  return { version: 'v0.1.0', project: { name: 'fixture', agent_suffix: 'fx' } };
}

/**
 * Minimal harness fixture: the real config schema + a sentinel-only
 * template/managed/ tree (so the C64b "new managed files" advisory stays silent
 * and cannot be confused with the CS90b overlap advisory under test).
 */
function buildHarnessRepo(dir) {
  const realSchema = readFileSync(
    path.join(repoRoot, 'schemas', 'harness.config.schema.json'),
    'utf8'
  );
  writeText(path.join(dir, 'schemas', 'harness.config.schema.json'), realSchema);
  writeText(path.join(dir, 'template', 'managed', '.gitkeep'), '');
}

/**
 * Build a consumer repo. Options:
 *   mode              — pr_check.mode value (omit to leave pr_check.mode absent).
 *   adoptViaDisk      — write .github/workflows/harness-pr-check.yml to disk.
 *   adoptViaConfig    — add harness-pr-check.yml to managed.files.
 *   siblingWorkflows  — { name: content } written under .github/workflows/.
 */
function buildConsumerRepo(dir, opts = {}) {
  const { mode, adoptViaDisk = false, adoptViaConfig = false, siblingWorkflows = {} } = opts;
  const config = {
    version: 'v0.1.0',
    project: { name: 'test-project', agent_suffix: 'test' },
    managed: { files: [] },
    composed: { files: [] },
    seeded: { files: [] },
    excluded: [],
    templating: {},
  };
  if (mode !== undefined) config.pr_check = { enabled: true, mode };
  if (adoptViaConfig) config.managed.files.push('.github/workflows/harness-pr-check.yml');
  writeJSON(path.join(dir, 'harness.config.json'), config);
  if (adoptViaDisk) {
    writeText(path.join(dir, '.github', 'workflows', 'harness-pr-check.yml'), 'name: harness-pr-check\n');
  }
  for (const [name, content] of Object.entries(siblingWorkflows)) {
    writeText(path.join(dir, '.github', 'workflows', name), content);
  }
}

/** A consumer CI workflow that runs `harness lint` inline (the overlap signal). */
const CI_WITH_LINT = 'name: ci\njobs:\n  lint:\n    steps:\n      - run: node bin/harness.mjs lint --cwd .\n';
/** A consumer CI workflow that does NOT lint / sync-check. */
const CI_NO_LINT = 'name: ci\njobs:\n  build:\n    steps:\n      - run: npm run build\n';

const OVERLAP_ADVISORY_SIGNAL = 'Set pr_check.mode: "drift-only"';

// ---------------------------------------------------------------------------
// C90b-1 — schema: pr_check.mode enum
// ---------------------------------------------------------------------------

describe('CS90b — pr_check.mode schema', () => {
  it('accepts pr_check.mode: "drift-only"', () => {
    const validate = compile();
    const cfg = { ...minimalConfig(), pr_check: { enabled: true, mode: 'drift-only' } };
    assert.equal(validate(cfg), true, JSON.stringify(validate.errors));
  });

  it('accepts pr_check.mode: "lint+drift"', () => {
    const validate = compile();
    const cfg = { ...minimalConfig(), pr_check: { mode: 'lint+drift' } };
    assert.equal(validate(cfg), true, JSON.stringify(validate.errors));
  });

  it('accepts pr_check without an explicit mode (default applies)', () => {
    const validate = compile();
    const cfg = { ...minimalConfig(), pr_check: { enabled: true } };
    assert.equal(validate(cfg), true, JSON.stringify(validate.errors));
  });

  it('rejects an unknown pr_check.mode value', () => {
    const validate = compile();
    const cfg = { ...minimalConfig(), pr_check: { mode: 'lint' } };
    assert.equal(validate(cfg), false);
    assert.match(JSON.stringify(validate.errors), /mode/);
  });

  it('declares the enum + default and keeps additionalProperties:false', () => {
    const prCheck = schema.properties?.pr_check;
    assert.ok(prCheck, 'schema must define pr_check');
    assert.equal(prCheck.additionalProperties, false);
    assert.deepEqual(prCheck.properties?.mode?.enum, ['lint+drift', 'drift-only']);
    assert.equal(prCheck.properties?.mode?.default, 'lint+drift');
    assert.equal(prCheck.properties?.mode?.type, 'string');
  });
});

// ---------------------------------------------------------------------------
// C90b-2 — workflow: BASE-tree mode read + drift-only skips lint
// ---------------------------------------------------------------------------

describe('CS90b — harness-pr-check.yml mode wiring', () => {
  const wf = readFileSync(
    path.join(repoRoot, 'template', 'managed', '.github', 'workflows', 'harness-pr-check.yml'),
    'utf8'
  );

  it('reads pr_check.mode from the BASE-tree config, never the PR head', () => {
    assert.match(wf, /git show "\$\{PR_BASE_SHA\}:harness\.config\.json"/,
      'mode must be read from the base-tree config');
    assert.match(wf, /pr_check\?\.mode==='drift-only'\?'drift-only':'lint\+drift'/,
      'only the literal drift-only opts out; everything else fails safe to lint+drift');
    assert.match(wf, /echo "mode=\$mode" >> "\$GITHUB_OUTPUT"/,
      'mode must be exposed as a step output');
  });

  it('passes the resolved mode into the structural-gate step via env', () => {
    assert.match(wf, /MODE:\s*\$\{\{\s*steps\.optout\.outputs\.mode\s*\}\}/);
  });

  it('drift-only skips harness lint but keeps the drift classifier + escape valve', () => {
    assert.match(wf, /if \[ "\$MODE" = "drift-only" \]; then/,
      'a drift-only guard must gate the lint invocation');
    assert.match(wf, /lint_rc=0/, 'drift-only must neutralize lint_rc without running lint');
    // Default (lint+drift) branch still invokes harness lint.
    assert.match(wf, /node "\$tmp\/bin\/harness\.mjs" lint --quiet --cwd "\$consumer"/,
      'lint+drift must still run harness lint');
    // The drift classifier runs regardless of mode.
    assert.match(wf, /node "\$tmp\/scripts\/check-managed-drift\.mjs" --cwd "\$consumer" --harness-repo "\$tmp"/,
      'the managed-drift classifier must always run');
    // The harness-managed-edit-ack escape valve is unchanged.
    assert.match(wf, /downgraded by harness-managed-edit-ack/,
      'the ack escape-valve downgrade must remain');
  });
});

// ---------------------------------------------------------------------------
// C90b-4 — adoption-overlap detection (unit, both adoption paths)
// ---------------------------------------------------------------------------

describe('CS90b — detectPrCheckLintOverlap()', () => {
  let consumerDir;
  beforeEach(() => { consumerDir = makeTmpDir('cs90b-consumer-'); });
  afterEach(() => { removeTmpDir(consumerDir); });

  it('fires when adopted via managed.files + lint+drift + a sibling lint workflow', async () => {
    buildConsumerRepo(consumerDir, {
      mode: 'lint+drift', adoptViaConfig: true, siblingWorkflows: { 'ci.yml': CI_WITH_LINT },
    });
    const config = JSON.parse(readFileSync(path.join(consumerDir, 'harness.config.json'), 'utf8'));
    const r = await detectPrCheckLintOverlap({ config, consumerRepoPath: consumerDir });
    assert.equal(r.overlap, true);
    assert.deepEqual(r.overlappingWorkflows, ['.github/workflows/ci.yml']);
  });

  it('fires when adopted via disk presence + default (absent) mode + sibling lint', async () => {
    // mode omitted => resolves to lint+drift.
    buildConsumerRepo(consumerDir, {
      adoptViaDisk: true, siblingWorkflows: { 'ci.yml': CI_WITH_LINT },
    });
    const config = JSON.parse(readFileSync(path.join(consumerDir, 'harness.config.json'), 'utf8'));
    const r = await detectPrCheckLintOverlap({ config, consumerRepoPath: consumerDir });
    assert.equal(r.mode, 'lint+drift');
    assert.equal(r.adopted, true);
    assert.equal(r.overlap, true);
  });

  it('is silent in drift-only mode even with adoption + a sibling lint workflow', async () => {
    buildConsumerRepo(consumerDir, {
      mode: 'drift-only', adoptViaDisk: true, siblingWorkflows: { 'ci.yml': CI_WITH_LINT },
    });
    const config = JSON.parse(readFileSync(path.join(consumerDir, 'harness.config.json'), 'utf8'));
    const r = await detectPrCheckLintOverlap({ config, consumerRepoPath: consumerDir });
    assert.equal(r.mode, 'drift-only');
    assert.equal(r.overlap, false);
    assert.deepEqual(r.overlappingWorkflows, []);
  });

  it('is silent when harness-pr-check.yml is not adopted (the self-host case)', async () => {
    buildConsumerRepo(consumerDir, {
      mode: 'lint+drift', siblingWorkflows: { 'ci.yml': CI_WITH_LINT },
    });
    const config = JSON.parse(readFileSync(path.join(consumerDir, 'harness.config.json'), 'utf8'));
    const r = await detectPrCheckLintOverlap({ config, consumerRepoPath: consumerDir });
    assert.equal(r.adopted, false);
    assert.equal(r.overlap, false);
  });

  it('is silent when adopted but no consumer workflow runs lint / sync-check', async () => {
    buildConsumerRepo(consumerDir, {
      mode: 'lint+drift', adoptViaDisk: true, siblingWorkflows: { 'ci.yml': CI_NO_LINT },
    });
    const config = JSON.parse(readFileSync(path.join(consumerDir, 'harness.config.json'), 'utf8'));
    const r = await detectPrCheckLintOverlap({ config, consumerRepoPath: consumerDir });
    assert.equal(r.overlap, false);
  });

  it('excludes harness-managed workflows from the overlap scan', async () => {
    // harness-drift.yml (harness-managed) invoking sync --mode=check is NOT the
    // consumer's own independent lint, so it must not trigger the advisory.
    buildConsumerRepo(consumerDir, {
      mode: 'lint+drift',
      adoptViaDisk: true,
      siblingWorkflows: {
        'harness-drift.yml': 'name: drift\njobs:\n  d:\n    steps:\n      - run: harness sync --mode=check\n',
      },
    });
    const config = JSON.parse(readFileSync(path.join(consumerDir, 'harness.config.json'), 'utf8'));
    const r = await detectPrCheckLintOverlap({ config, consumerRepoPath: consumerDir });
    assert.equal(r.overlap, false, 'harness-managed workflows are excluded from the scan');
  });

  it('detects sync --mode=check (not just harness lint) as an overlap signal', async () => {
    buildConsumerRepo(consumerDir, {
      mode: 'lint+drift',
      adoptViaDisk: true,
      siblingWorkflows: {
        'drift-gate.yml': 'name: drift-gate\njobs:\n  g:\n    steps:\n      - run: npx harness sync --mode=check --cwd .\n',
      },
    });
    const config = JSON.parse(readFileSync(path.join(consumerDir, 'harness.config.json'), 'utf8'));
    const r = await detectPrCheckLintOverlap({ config, consumerRepoPath: consumerDir });
    assert.equal(r.overlap, true);
    assert.deepEqual(r.overlappingWorkflows, ['.github/workflows/drift-gate.yml']);
  });
});

// ---------------------------------------------------------------------------
// C90b-4 — adoption-overlap advisory end-to-end via sync() (report-only)
// ---------------------------------------------------------------------------

describe('CS90b — overlap advisory via sync() (report-only)', () => {
  let harnessDir, consumerDir;
  beforeEach(() => {
    harnessDir = makeTmpDir('cs90b-harness-');
    consumerDir = makeTmpDir('cs90b-consumer-');
    buildHarnessRepo(harnessDir);
  });
  afterEach(() => { removeTmpDir(harnessDir); removeTmpDir(consumerDir); });

  it('fires the advisory without changing driftDetected / the exit code', async () => {
    buildConsumerRepo(consumerDir, {
      mode: 'lint+drift', adoptViaDisk: true, siblingWorkflows: { 'ci.yml': CI_WITH_LINT },
    });
    const result = await sync({ consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'check' });

    assert.ok(
      result.warnings.some(w => w.includes(OVERLAP_ADVISORY_SIGNAL)),
      `expected the drift-only recommendation; got: ${JSON.stringify(result.warnings)}`
    );
    assert.ok(
      result.warnings.some(w => w.includes('.github/workflows/ci.yml')),
      'advisory must name the overlapping workflow'
    );
    // Report-only: the advisory must not flip drift or the exit code.
    assert.equal(result.driftDetected, false);
  });

  it('is silent in drift-only mode', async () => {
    buildConsumerRepo(consumerDir, {
      mode: 'drift-only', adoptViaDisk: true, siblingWorkflows: { 'ci.yml': CI_WITH_LINT },
    });
    const result = await sync({ consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'check' });
    assert.ok(!result.warnings.some(w => w.includes(OVERLAP_ADVISORY_SIGNAL)),
      'drift-only must suppress the overlap advisory');
    assert.equal(result.driftDetected, false);
  });

  it('is silent when harness-pr-check.yml is not adopted', async () => {
    buildConsumerRepo(consumerDir, {
      mode: 'lint+drift', siblingWorkflows: { 'ci.yml': CI_WITH_LINT },
    });
    const result = await sync({ consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'check' });
    assert.ok(!result.warnings.some(w => w.includes(OVERLAP_ADVISORY_SIGNAL)),
      'a non-adopted consumer (self-host case) must not see the advisory');
  });

  it('--quiet suppresses the advisory', async () => {
    buildConsumerRepo(consumerDir, {
      mode: 'lint+drift', adoptViaDisk: true, siblingWorkflows: { 'ci.yml': CI_WITH_LINT },
    });
    const result = await sync({
      consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'check', quiet: true,
    });
    assert.ok(!result.warnings.some(w => w.includes(OVERLAP_ADVISORY_SIGNAL)),
      '--quiet must suppress the overlap advisory');
  });
});
