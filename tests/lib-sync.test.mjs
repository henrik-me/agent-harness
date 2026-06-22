/**
 * tests/lib-sync.test.mjs — CS64b new-managed-file reconciliation tests for
 * lib/sync.mjs (C64b-3 detection/adoption + C64b-8 core-doc WARN gate).
 *
 * Covers:
 *  - detectNewManagedFiles() surfaces exactly the untracked managed files
 *    (membership against managed.files, not disk presence).
 *  - Sentinels (.gitkeep) are NEVER surfaced — fixture tree AND the real
 *    template/managed/ tree.
 *  - Required core managed docs (CORE_MANAGED_FILES) missing from managed.files
 *    appear in coreMissing and emit a WARN; tracked ones do not.
 *  - --quiet suppresses the WARN + advisory (success/advisory output only).
 *  - The C64b-3 advisory is report-only: it lists non-core new files in
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
import { CORE_MANAGED_FILES } from '../lib/core-managed-files.mjs';

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
function buildConsumerRepo(dir, trackedManaged = []) {
  const config = {
    version: 'v0.1.0',
    project: { name: 'test-project', agent_suffix: 'test' },
    managed: { files: [...trackedManaged] },
    composed: { files: [] },
    seeded: { files: [] },
    excluded: [],
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

  it('reports a missing core doc in coreMissing (membership-based)', async () => {
    const config = { managed: { files: ['.github/CODEOWNERS'] } };
    const { coreMissing } = await detectNewManagedFiles({ config, harnessRepoPath: harnessDir });

    assert.ok(coreMissing.includes('INSTRUCTIONS.md'), 'INSTRUCTIONS.md should be coreMissing');
    assert.deepEqual(coreMissing, [...CORE_MANAGED_FILES].sort());
  });

  it('omits tracked core docs from coreMissing', async () => {
    const config = { managed: { files: [...CORE_MANAGED_FILES] } };
    const { coreMissing } = await detectNewManagedFiles({ config, harnessRepoPath: harnessDir });

    assert.deepEqual(coreMissing, []);
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
// sync() — C64b-8 WARN gate + C64b-3 advisory wiring
// ---------------------------------------------------------------------------

describe('sync() — core-doc WARN gate (C64b-8)', () => {
  let harnessDir, consumerDir;

  beforeEach(() => {
    harnessDir = makeTmpDir('harness-');
    consumerDir = makeTmpDir('consumer-');
    buildHarnessRepo(harnessDir);
  });
  afterEach(() => { removeTmpDir(harnessDir); removeTmpDir(consumerDir); });

  it('emits a WARN for a missing core managed doc and surfaces coreMissing', async () => {
    buildConsumerRepo(consumerDir, ['INSTRUCTIONS.md']);
    const result = await sync({ consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'check' });

    assert.ok(result.coreMissing.includes('TRACKING.md'));
    assert.ok(
      result.warnings.some(w => w.includes('TRACKING.md') && w.includes('core managed doc')),
      `expected a core-doc WARN; got: ${JSON.stringify(result.warnings)}`
    );
    // Warn-only: the missing core doc must NOT flip drift or exit semantics.
    assert.equal(result.driftDetected, false);
  });

  it('--quiet suppresses the WARN and advisory (data still returned)', async () => {
    buildConsumerRepo(consumerDir, ['INSTRUCTIONS.md']);
    const result = await sync({
      consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'check', quiet: true,
    });

    assert.ok(!result.warnings.some(w => w.includes('core managed doc')), 'quiet must suppress core WARN');
    assert.ok(!result.warnings.some(w => w.includes('New managed files')), 'quiet must suppress advisory');
    // Structured fields remain populated for programmatic callers.
    assert.ok(result.coreMissing.includes('TRACKING.md'));
    assert.ok(result.newManagedFiles.includes('.github/CODEOWNERS'));
  });

  it('reports non-core new files as a report-only advisory without drift', async () => {
    // Track every core doc so only non-core files remain new.
    buildConsumerRepo(consumerDir, [...CORE_MANAGED_FILES]);
    const result = await sync({ consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'check' });

    assert.deepEqual(result.coreMissing, []);
    assert.ok(result.newManagedFiles.includes('.github/CODEOWNERS'));
    assert.ok(result.newManagedFiles.includes('.github/workflows/harness-drift.yml'));
    assert.ok(
      result.warnings.some(w => w.includes('New managed files')),
      'expected a report-only advisory line'
    );
    // Report-only: advisory must not flip drift / exit code.
    assert.equal(result.driftDetected, false);
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
    assert.deepEqual(result.coreMissing, []);
  });

  it('is idempotent: re-running after adoption surfaces nothing', async () => {
    buildConsumerRepo(consumerDir, ['INSTRUCTIONS.md']);
    await sync({
      consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'apply', applyNew: true,
    });

    // Re-detect with the now-updated on-disk config.
    const config = readConsumerConfig(consumerDir);
    const { newFiles, coreMissing } = await detectNewManagedFiles({ config, harnessRepoPath: harnessDir });
    assert.deepEqual(newFiles, []);
    assert.deepEqual(coreMissing, []);

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
    assert.ok(result.coreMissing.includes('TRACKING.md'));
  });
});
