/**
 * tests/lib-sync.test.mjs — CS64b new-managed-file reconciliation tests for
 * lib/sync.mjs (C64b-3 detection + advisory + --apply-new adoption).
 *
 * Covers:
 *  - detectNewManagedFiles() surfaces exactly the untracked managed files
 *    (membership against managed.files, not disk presence).
 *  - Sentinels (.gitkeep) are NEVER surfaced — fixture tree AND the real
 *    template/managed/ tree.
 *  - --quiet suppresses the advisory (success/advisory output only).
 *  - The C64b-3 advisory is report-only: it lists new files in
 *    result.newManagedFiles and never flips driftDetected / the exit code.
 *  - --apply-new adopts: adds the canonical target to managed.files (persisted
 *    to disk) AND copies the template into the consumer tree.
 *  - Re-running after adoption surfaces nothing (idempotent).
 *  - --apply-new does not adopt in check mode (no writes, config untouched).
 *
 * Fixtures + scratch live under os.tmpdir() ONLY (LRN-094). The real
 * template/managed/ tree is read-only.
 *
 * Run: node --test tests/lib-sync.test.mjs
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

import { sync, detectNewManagedFiles } from '../lib/sync.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(prefix = 'harness-libsync-') {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

function removeTmpDir(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function writeJSON(filePath, obj) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function writeText(filePath, content) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}

function readText(filePath) {
  return readFileSync(filePath, 'utf8');
}

/**
 * Managed templates written into every fixture harness repo. Keys are
 * consumer-root-relative target paths; values are template content (no
 * templating placeholders, so rendered === template).
 */
const MANAGED_TEMPLATES = {
  'INSTRUCTIONS.md': '# Instructions\n',
  '.github/copilot-instructions.md': '# Copilot Instructions\n',
  'TRACKING.md': '# Tracking\n',
  'RETROSPECTIVES.md': '# Retrospectives\n',
  'READMEGUIDE.md': '# Readme Guide\n',
  '.github/CODEOWNERS': '* @owner\n',
  '.github/workflows/harness-drift.yml': 'name: drift\n',
};

/**
 * Build a minimal harness repo with the real config schema + a controlled
 * template/managed/ tree (including a .gitkeep sentinel).
 */
function buildHarnessRepo(dir) {
  const realSchema = readFileSync(
    path.join(repoRoot, 'schemas', 'harness.config.schema.json'),
    'utf8'
  );
  writeText(path.join(dir, 'schemas', 'harness.config.schema.json'), realSchema);

  for (const [name, content] of Object.entries(MANAGED_TEMPLATES)) {
    writeText(path.join(dir, 'template', 'managed', ...name.split('/')), content);
  }
  // Sentinel that must never be surfaced as a deliverable file.
  writeText(path.join(dir, 'template', 'managed', '.gitkeep'), '');
}

/**
 * Build a consumer repo whose managed.files tracks `trackedManaged`. Every
 * tracked managed file is also written to disk with its rendered content so the
 * baseline has no real drift.
 */
function buildConsumerRepo(dir, trackedManaged = [], excluded = []) {
  const config = {
    version: 'v0.1.0',
    project: { name: 'test-project', agent_suffix: 'test' },
    managed: { files: [...trackedManaged] },
    composed: { files: [] },
    seeded: { files: [] },
    excluded: [...excluded],
    templating: {},
  };
  writeJSON(path.join(dir, 'harness.config.json'), config);
  for (const target of trackedManaged) {
    if (MANAGED_TEMPLATES[target] !== undefined) {
      writeText(path.join(dir, ...target.split('/')), MANAGED_TEMPLATES[target]);
    }
  }
}

function readConsumerConfig(dir) {
  return JSON.parse(readText(path.join(dir, 'harness.config.json')));
}

const ALL_MANAGED = Object.keys(MANAGED_TEMPLATES);

// ---------------------------------------------------------------------------
// detectNewManagedFiles() — pure unit
// ---------------------------------------------------------------------------

describe('detectNewManagedFiles() — detection', () => {
  let harnessDir;

  beforeEach(() => { harnessDir = makeTmpDir('harness-'); buildHarnessRepo(harnessDir); });
  afterEach(() => removeTmpDir(harnessDir));

  it('surfaces exactly the managed templates absent from managed.files', async () => {
    const tracked = ['INSTRUCTIONS.md', '.github/CODEOWNERS'];
    const config = { managed: { files: tracked } };
    const { newFiles } = await detectNewManagedFiles({ config, harnessRepoPath: harnessDir });

    const expected = ALL_MANAGED.filter(f => !tracked.includes(f)).sort();
    assert.deepEqual(newFiles, expected);
  });

  it('never surfaces the .gitkeep sentinel even when nothing is tracked', async () => {
    const config = { managed: { files: [] } };
    const { newFiles } = await detectNewManagedFiles({ config, harnessRepoPath: harnessDir });

    assert.ok(!newFiles.includes('.gitkeep'), 'newFiles must not include .gitkeep');
    assert.deepEqual(newFiles, [...ALL_MANAGED].sort());
  });

  it('never surfaces .gitkeep against the real template/managed/ tree', async () => {
    const config = { managed: { files: [] } };
    const { newFiles } = await detectNewManagedFiles({ config, harnessRepoPath: repoRoot });

    assert.ok(newFiles.length > 0, 'real tree should have managed files');
    assert.ok(!newFiles.includes('.gitkeep'), 'real-tree newFiles must not include .gitkeep');
    assert.ok(newFiles.every(f => path.basename(f) !== '.gitkeep'));
  });
});

// ---------------------------------------------------------------------------
// sync() — C64b-3 report-only new-managed-file advisory
// ---------------------------------------------------------------------------

describe('sync() — new-managed advisory (C64b-3)', () => {
  let harnessDir, consumerDir;

  beforeEach(() => {
    harnessDir = makeTmpDir('harness-');
    consumerDir = makeTmpDir('consumer-');
    buildHarnessRepo(harnessDir);
  });
  afterEach(() => { removeTmpDir(harnessDir); removeTmpDir(consumerDir); });

  it('reports new managed files as a report-only advisory without drift', async () => {
    buildConsumerRepo(consumerDir, ['INSTRUCTIONS.md']);
    const result = await sync({ consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'check' });

    assert.ok(result.newManagedFiles.includes('.github/CODEOWNERS'));
    assert.ok(result.newManagedFiles.includes('.github/workflows/harness-drift.yml'));
    assert.ok(
      result.warnings.some(w => w.includes('New managed files')),
      `expected a report-only advisory line; got: ${JSON.stringify(result.warnings)}`
    );
    // Report-only: advisory must not flip drift / exit code.
    assert.equal(result.driftDetected, false);
  });

  it('--quiet suppresses the advisory (data still returned)', async () => {
    buildConsumerRepo(consumerDir, ['INSTRUCTIONS.md']);
    const result = await sync({
      consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'check', quiet: true,
    });

    assert.ok(!result.warnings.some(w => w.includes('New managed files')), 'quiet must suppress advisory');
    // Structured field remains populated for programmatic callers.
    assert.ok(result.newManagedFiles.includes('.github/CODEOWNERS'));
  });

  it('respects config.excluded: an excluded target is neither surfaced nor adopted', async () => {
    // Consumer tracks INSTRUCTIONS.md and explicitly excludes TRACKING.md.
    buildConsumerRepo(consumerDir, ['INSTRUCTIONS.md'], ['TRACKING.md']);
    const result = await sync({ consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'check' });

    assert.ok(!result.newManagedFiles.includes('TRACKING.md'), 'excluded target must not appear in the advisory');
    assert.ok(result.newManagedFiles.includes('.github/CODEOWNERS'), 'non-excluded new files still surface');
  });

  it('--apply-new does not adopt or materialize an excluded target', async () => {
    buildConsumerRepo(consumerDir, ['INSTRUCTIONS.md'], ['TRACKING.md']);
    await sync({ consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'apply', applyNew: true });

    const config = readConsumerConfig(consumerDir);
    assert.ok(!config.managed.files.includes('TRACKING.md'), 'excluded target must not be adopted into managed.files');
    assert.ok(!existsSync(path.join(consumerDir, 'TRACKING.md')), 'excluded target must not be materialized');
    // Non-excluded new files ARE still adopted.
    assert.ok(config.managed.files.includes('.github/CODEOWNERS'));
  });
});

// ---------------------------------------------------------------------------
// sync() — C64b-3 adoption (--apply-new)
// ---------------------------------------------------------------------------

describe('sync() — adoption (--apply-new, C64b-3)', () => {
  let harnessDir, consumerDir;

  beforeEach(() => {
    harnessDir = makeTmpDir('harness-');
    consumerDir = makeTmpDir('consumer-');
    buildHarnessRepo(harnessDir);
  });
  afterEach(() => { removeTmpDir(harnessDir); removeTmpDir(consumerDir); });

  it('adds new managed files to managed.files AND copies them into the tree', async () => {
    buildConsumerRepo(consumerDir, ['INSTRUCTIONS.md']);
    const result = await sync({
      consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'apply', applyNew: true,
    });

    // Persisted config now tracks every managed template.
    const config = readConsumerConfig(consumerDir);
    for (const target of ALL_MANAGED) {
      assert.ok(config.managed.files.includes(target), `managed.files should include ${target}`);
    }
    // Templates copied into the consumer tree.
    assert.ok(existsSync(path.join(consumerDir, 'TRACKING.md')));
    assert.ok(existsSync(path.join(consumerDir, '.github', 'CODEOWNERS')));
    assert.equal(readText(path.join(consumerDir, 'TRACKING.md')), MANAGED_TEMPLATES['TRACKING.md']);

    // Nothing outstanding after adoption.
    assert.deepEqual(result.newManagedFiles, []);
  });

  it('is idempotent: re-running after adoption surfaces nothing', async () => {
    buildConsumerRepo(consumerDir, ['INSTRUCTIONS.md']);
    await sync({
      consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'apply', applyNew: true,
    });

    // Re-detect with the now-updated on-disk config.
    const config = readConsumerConfig(consumerDir);
    const { newFiles } = await detectNewManagedFiles({ config, harnessRepoPath: harnessDir });
    assert.deepEqual(newFiles, []);

    // A second apply-new run is a no-op for managed.files membership.
    const before = readConsumerConfig(consumerDir).managed.files.slice().sort();
    const result = await sync({
      consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'apply', applyNew: true,
    });
    const after = readConsumerConfig(consumerDir).managed.files.slice().sort();
    assert.deepEqual(after, before);
    assert.deepEqual(result.newManagedFiles, []);
  });

  it('does not adopt in check mode (no writes, config untouched)', async () => {
    buildConsumerRepo(consumerDir, ['INSTRUCTIONS.md']);
    const before = readConsumerConfig(consumerDir);
    const result = await sync({
      consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'check', applyNew: true,
    });

    const after = readConsumerConfig(consumerDir);
    assert.deepEqual(after.managed.files, before.managed.files, 'check mode must not mutate config');
    assert.ok(!existsSync(path.join(consumerDir, 'TRACKING.md')), 'check mode must not copy files');
    // Detection still reports the un-adopted files.
    assert.ok(result.newManagedFiles.includes('.github/CODEOWNERS'));
  });
});
