/**
 * tests/sync.test.mjs — Tests for lib/sync.mjs
 *
 * Covers:
 *  - Config validation (missing file, invalid JSON, missing fields)
 *  - composed_block_migrations rejection (EMIGRATIONSPEC_UNSUPPORTED)
 *  - Major version mismatch (with and without acceptMajor)
 *  - WORKBOARD.md active-rows warning
 *  - Excluded files
 *  - Managed files: apply, check drift, check no-drift
 *  - Seeded files: create on apply, preserve when present, drift on check
 *  - Composed files: fresh merge, update
 *  - Dry-run mode (preview, no writes)
 *  - Lock file written / read back
 *  - Invalid mode
 *
 * Run: node --test tests/sync.test.mjs
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, statSync, utimesSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

import { sync, SyncError } from '../lib/sync.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot   = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a temporary directory inside os.tmpdir() (cleaned up after each test).
 * Returns its absolute path.
 */
function makeTmpDir(prefix = 'harness-sync-test-') {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

function removeTmpDir(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

/** Write a JSON file to a path. */
function writeJSON(filePath, obj) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

/** Write a text file to a path. */
function writeText(filePath, content) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}

/**
 * Build a minimal harness repo directory in `dir`.
 * Copies the real schemas/ directory but uses simple template stubs.
 *
 * @param {string} dir
 * @param {{ managed?: string[], composed?: string[], seeded?: string[] }} templates
 *   Map from filename to content for each class.
 */
function buildHarnessRepo(dir, templates = {}) {
  // Copy the real config schema so config_schema_version resolves.
  const realSchema = readFileSync(
    path.join(repoRoot, 'schemas', 'harness.config.schema.json'),
    'utf8'
  );
  writeText(path.join(dir, 'schemas', 'harness.config.schema.json'), realSchema);

  for (const [name, content] of Object.entries(templates.managed ?? {})) {
    writeText(path.join(dir, 'template', 'managed', name), content);
  }
  for (const [name, content] of Object.entries(templates.composed ?? {})) {
    writeText(path.join(dir, 'template', 'composed', name), content);
  }
  for (const [name, content] of Object.entries(templates.seeded ?? {})) {
    writeText(path.join(dir, 'template', 'seeded', name), content);
  }
}

/**
 * Build a minimal consumer repo with a harness.config.json.
 *
 * @param {string} dir
 * @param {object} configOverrides - Merged into the base config.
 */
function buildConsumerRepo(dir, configOverrides = {}) {
  const base = {
    version: 'v0.1.0',
    project: { name: 'test-project', agent_suffix: 'test' },
    managed: { files: [] },
    composed: { files: [] },
    seeded: { files: [] },
    excluded: [],
    templating: {},
  };
  const config = deepMerge(base, configOverrides);
  writeJSON(path.join(dir, 'harness.config.json'), config);
}

/** Shallow merge that replaces arrays (not concat them). */
function deepMerge(base, overrides) {
  const result = { ...base };
  for (const [k, v] of Object.entries(overrides)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v) &&
        typeof result[k] === 'object' && result[k] !== null && !Array.isArray(result[k])) {
      result[k] = deepMerge(result[k], v);
    } else {
      result[k] = v;
    }
  }
  return result;
}

const COMPOSED_TEMPLATE = `# Composed File

<!-- harness:local-start id=my-section -->
<!-- harness:local-end id=my-section -->

## End
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sync() — config validation', () => {
  let harnessDir, consumerDir;

  beforeEach(() => {
    harnessDir = makeTmpDir('harness-');
    consumerDir = makeTmpDir('consumer-');
  });
  afterEach(() => {
    removeTmpDir(harnessDir);
    removeTmpDir(consumerDir);
  });

  it('throws ESYNC_NO_CONFIG when harness.config.json is absent', async () => {
    buildHarnessRepo(harnessDir);
    // Consumer dir has no harness.config.json.
    await assert.rejects(
      () => sync({ consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'check' }),
      (err) => {
        assert(err instanceof SyncError);
        assert.equal(err.code, 'ESYNC_NO_CONFIG');
        return true;
      }
    );
  });

  it('throws ESYNC_INVALID_CONFIG on invalid JSON', async () => {
    buildHarnessRepo(harnessDir);
    writeText(path.join(consumerDir, 'harness.config.json'), '{ not valid json }');
    await assert.rejects(
      () => sync({ consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'check' }),
      (err) => {
        assert(err instanceof SyncError);
        assert.equal(err.code, 'ESYNC_INVALID_CONFIG');
        return true;
      }
    );
  });

  it('throws ESYNC_INVALID_CONFIG when "version" is missing', async () => {
    buildHarnessRepo(harnessDir);
    writeJSON(path.join(consumerDir, 'harness.config.json'), {
      project: { name: 'x', agent_suffix: 'y' },
    });
    await assert.rejects(
      () => sync({ consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'check' }),
      (err) => {
        assert(err instanceof SyncError);
        assert.equal(err.code, 'ESYNC_INVALID_CONFIG');
        return true;
      }
    );
  });

  it('throws ESYNC_INVALID_CONFIG when "project.name" is missing', async () => {
    buildHarnessRepo(harnessDir);
    writeJSON(path.join(consumerDir, 'harness.config.json'), {
      version: 'v0.1.0',
      project: { agent_suffix: 'y' },
    });
    await assert.rejects(
      () => sync({ consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'check' }),
      (err) => {
        assert(err instanceof SyncError);
        assert.equal(err.code, 'ESYNC_INVALID_CONFIG');
        return true;
      }
    );
  });

  it('throws EMIGRATIONSPEC_UNSUPPORTED when composed_block_migrations is non-empty (LRN-010)', async () => {
    buildHarnessRepo(harnessDir);
    buildConsumerRepo(consumerDir, {
      composed_block_migrations: {
        'NOTES.md': [{ from: 'old-section', to: 'new-section' }],
      },
    });
    await assert.rejects(
      () => sync({ consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'check' }),
      (err) => {
        assert(err instanceof SyncError);
        assert.equal(err.code, 'EMIGRATIONSPEC_UNSUPPORTED');
        return true;
      }
    );
  });

  it('does NOT throw when composed_block_migrations is absent', async () => {
    buildHarnessRepo(harnessDir);
    buildConsumerRepo(consumerDir);
    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'check',
    });
    assert.equal(result.mode, 'check');
  });

  it('throws ESYNC_INVALID_MODE for unknown mode', async () => {
    buildHarnessRepo(harnessDir);
    buildConsumerRepo(consumerDir);
    await assert.rejects(
      () => sync({ consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'invalid' }),
      (err) => {
        assert(err instanceof SyncError);
        assert.equal(err.code, 'ESYNC_INVALID_MODE');
        return true;
      }
    );
  });
});

// ---------------------------------------------------------------------------
describe('sync() — major version check', () => {
  let harnessDir, consumerDir;

  beforeEach(() => {
    harnessDir = makeTmpDir('harness-');
    consumerDir = makeTmpDir('consumer-');
    buildHarnessRepo(harnessDir);
  });
  afterEach(() => {
    removeTmpDir(harnessDir);
    removeTmpDir(consumerDir);
  });

  it('throws ESYNC_MAJOR_VERSION_MISMATCH when major differs and acceptMajor is false', async () => {
    buildConsumerRepo(consumerDir, { version: 'v2.0.0' });
    // Write a lock with v1.x harness_ref.
    const lock = {
      harness_ref: 'v1.0.0',
      resolved_sha: '0'.repeat(40),
      config_schema_version: 'test',
      synced_at: new Date().toISOString(),
      files: [],
      scaffolds: [],
      excluded: [],
    };
    writeJSON(path.join(consumerDir, '.harness-lock.json'), lock);

    await assert.rejects(
      () => sync({
        consumerRepoPath: consumerDir,
        harnessRepoPath: harnessDir,
        mode: 'check',
        acceptMajor: false,
      }),
      (err) => {
        assert(err instanceof SyncError);
        assert.equal(err.code, 'ESYNC_MAJOR_VERSION_MISMATCH');
        return true;
      }
    );
  });

  it('proceeds when major differs but acceptMajor is true', async () => {
    buildConsumerRepo(consumerDir, { version: 'v2.0.0' });
    const lock = {
      harness_ref: 'v1.0.0',
      resolved_sha: '0'.repeat(40),
      config_schema_version: 'test',
      synced_at: new Date().toISOString(),
      files: [],
      scaffolds: [],
      excluded: [],
    };
    writeJSON(path.join(consumerDir, '.harness-lock.json'), lock);

    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'check',
      acceptMajor: true,
    });
    assert.equal(result.mode, 'check');
  });

  it('proceeds when major matches', async () => {
    buildConsumerRepo(consumerDir, { version: 'v1.1.0' });
    const lock = {
      harness_ref: 'v1.0.0',
      resolved_sha: '0'.repeat(40),
      config_schema_version: 'test',
      synced_at: new Date().toISOString(),
      files: [],
      scaffolds: [],
      excluded: [],
    };
    writeJSON(path.join(consumerDir, '.harness-lock.json'), lock);

    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'check',
    });
    assert.equal(result.mode, 'check');
  });
});

// ---------------------------------------------------------------------------
describe('sync() — WORKBOARD.md warning', () => {
  let harnessDir, consumerDir;

  beforeEach(() => {
    harnessDir = makeTmpDir('harness-');
    consumerDir = makeTmpDir('consumer-');
    buildHarnessRepo(harnessDir);
    buildConsumerRepo(consumerDir);
  });
  afterEach(() => {
    removeTmpDir(harnessDir);
    removeTmpDir(consumerDir);
  });

  it('emits warning when WORKBOARD.md has active rows', async () => {
    const workboard = `# WORKBOARD\n\n## Active Work\n| CS-Task ID | Title | State |\n|---|---|---|\n| CS-01 | My Task | In Progress |\n\n## Done\n`;
    writeText(path.join(consumerDir, 'WORKBOARD.md'), workboard);

    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'check',
    });
    assert(result.warnings.some(w => w.includes('WORKBOARD.md')));
  });

  it('does NOT warn when WORKBOARD.md has no active rows', async () => {
    const workboard = `# WORKBOARD\n\n## Active Work\n| CS-Task ID | Title | State |\n|---|---|---|\n\n## Done\n`;
    writeText(path.join(consumerDir, 'WORKBOARD.md'), workboard);

    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'check',
    });
    assert(!result.warnings.some(w => w.includes('WORKBOARD.md')));
  });
});

// ---------------------------------------------------------------------------
describe('sync() — excluded files', () => {
  let harnessDir, consumerDir;

  beforeEach(() => {
    harnessDir = makeTmpDir('harness-');
    consumerDir = makeTmpDir('consumer-');
  });
  afterEach(() => {
    removeTmpDir(harnessDir);
    removeTmpDir(consumerDir);
  });

  it('excludes a managed file by exact path match (LRN-015)', async () => {
    buildHarnessRepo(harnessDir, {
      managed: { 'README.md': '# README\n' },
    });
    buildConsumerRepo(consumerDir, {
      managed: { files: ['README.md'] },
      excluded: ['README.md'],
    });

    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'apply',
    });

    const change = result.changes.find(c => c.target === 'README.md');
    assert(change, 'Expected a change record for README.md');
    assert.equal(change.action, 'excluded');

    // File should not have been written.
    assert(!existsSync(path.join(consumerDir, 'README.md')));
  });

  it('excludes files under a directory prefix (entries ending with /)', async () => {
    buildHarnessRepo(harnessDir, {
      managed: { 'docs/guide.md': '# Guide\n' },
    });
    buildConsumerRepo(consumerDir, {
      managed: { files: ['docs/guide.md'] },
      excluded: ['docs/'],
    });

    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'apply',
    });

    const change = result.changes.find(c => c.target === 'docs/guide.md');
    assert.equal(change?.action, 'excluded');
    assert(!existsSync(path.join(consumerDir, 'docs', 'guide.md')));
  });

  it('excluded files do NOT appear in lockAfter.files', async () => {
    buildHarnessRepo(harnessDir, {
      managed: { 'README.md': '# README\n' },
    });
    buildConsumerRepo(consumerDir, {
      managed: { files: ['README.md'] },
      excluded: ['README.md'],
    });

    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'apply',
    });

    assert(!result.lockAfter.files.some(f => f.target === 'README.md'));
  });
});

// ---------------------------------------------------------------------------
describe('sync() — managed files', () => {
  let harnessDir, consumerDir;

  beforeEach(() => {
    harnessDir = makeTmpDir('harness-');
    consumerDir = makeTmpDir('consumer-');
  });
  afterEach(() => {
    removeTmpDir(harnessDir);
    removeTmpDir(consumerDir);
  });

  it('creates a new managed file in apply mode', async () => {
    buildHarnessRepo(harnessDir, {
      managed: { 'README.md': '# README\n' },
    });
    buildConsumerRepo(consumerDir, {
      managed: { files: ['README.md'] },
    });

    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'apply',
    });

    const content = readFileSync(path.join(consumerDir, 'README.md'), 'utf8');
    assert.equal(content, '# README\n');

    const change = result.changes.find(c => c.target === 'README.md');
    assert.equal(change?.action, 'created');
  });

  it('updates a drifted managed file in apply mode', async () => {
    buildHarnessRepo(harnessDir, {
      managed: { 'README.md': '# New README\n' },
    });
    buildConsumerRepo(consumerDir, {
      managed: { files: ['README.md'] },
    });
    writeText(path.join(consumerDir, 'README.md'), '# Old README\n');

    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'apply',
    });

    const content = readFileSync(path.join(consumerDir, 'README.md'), 'utf8');
    assert.equal(content, '# New README\n');
    const change = result.changes.find(c => c.target === 'README.md');
    assert.equal(change?.action, 'updated');
  });

  it('skips a managed file that already matches the template', async () => {
    buildHarnessRepo(harnessDir, {
      managed: { 'README.md': '# README\n' },
    });
    buildConsumerRepo(consumerDir, {
      managed: { files: ['README.md'] },
    });
    writeText(path.join(consumerDir, 'README.md'), '# README\n');

    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'apply',
    });

    const change = result.changes.find(c => c.target === 'README.md');
    assert.equal(change?.action, 'skipped');
  });

  it('check mode: detects drift without writing the file', async () => {
    buildHarnessRepo(harnessDir, {
      managed: { 'README.md': '# New Content\n' },
    });
    buildConsumerRepo(consumerDir, {
      managed: { files: ['README.md'] },
    });
    writeText(path.join(consumerDir, 'README.md'), '# Old Content\n');

    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'check',
    });

    assert.equal(result.driftDetected, true);
    // File must NOT have been overwritten.
    const content = readFileSync(path.join(consumerDir, 'README.md'), 'utf8');
    assert.equal(content, '# Old Content\n');
  });

  it('check mode: no drift when file matches template', async () => {
    buildHarnessRepo(harnessDir, {
      managed: { 'README.md': '# README\n' },
    });
    buildConsumerRepo(consumerDir, {
      managed: { files: ['README.md'] },
    });
    writeText(path.join(consumerDir, 'README.md'), '# README\n');

    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'check',
    });

    assert.equal(result.driftDetected, false);
  });

  it('dry-run mode: includes preview in change record', async () => {
    buildHarnessRepo(harnessDir, {
      managed: { 'README.md': '# README\n' },
    });
    buildConsumerRepo(consumerDir, {
      managed: { files: ['README.md'] },
    });

    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'dry-run',
    });

    const change = result.changes.find(c => c.target === 'README.md');
    assert.equal(change?.preview, '# README\n');
    assert(!existsSync(path.join(consumerDir, 'README.md')));
  });

  it('applies {{key}} templating substitution', async () => {
    buildHarnessRepo(harnessDir, {
      managed: { 'README.md': '# Project: {{project_name}}\n' },
    });
    buildConsumerRepo(consumerDir, {
      managed: { files: ['README.md'] },
      templating: { project_name: 'My App' },
    });

    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'apply',
    });

    const content = readFileSync(path.join(consumerDir, 'README.md'), 'utf8');
    assert.equal(content, '# Project: My App\n');
  });

  it('lock entry for managed file has rendered_hash', async () => {
    buildHarnessRepo(harnessDir, {
      managed: { 'README.md': '# README\n' },
    });
    buildConsumerRepo(consumerDir, {
      managed: { files: ['README.md'] },
    });

    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'apply',
    });

    const entry = result.lockAfter.files.find(f => f.target === 'README.md');
    assert(entry, 'Expected lock entry for README.md');
    assert.equal(entry.class, 'managed');
    assert.match(entry.rendered_hash, /^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
describe('sync() — seeded files', () => {
  let harnessDir, consumerDir;

  beforeEach(() => {
    harnessDir = makeTmpDir('harness-');
    consumerDir = makeTmpDir('consumer-');
  });
  afterEach(() => {
    removeTmpDir(harnessDir);
    removeTmpDir(consumerDir);
  });

  it('creates a seeded file when absent (apply mode)', async () => {
    buildHarnessRepo(harnessDir, {
      seeded: { 'GETTING-STARTED.md': '# Getting Started\n' },
    });
    buildConsumerRepo(consumerDir, {
      seeded: { files: ['GETTING-STARTED.md'] },
    });

    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'apply',
    });

    const content = readFileSync(path.join(consumerDir, 'GETTING-STARTED.md'), 'utf8');
    assert.equal(content, '# Getting Started\n');
    const change = result.changes.find(c => c.target === 'GETTING-STARTED.md');
    assert.equal(change?.action, 'created');
  });

  it('preserves a seeded file that already exists (apply mode)', async () => {
    buildHarnessRepo(harnessDir, {
      seeded: { 'GETTING-STARTED.md': '# Getting Started\n' },
    });
    buildConsumerRepo(consumerDir, {
      seeded: { files: ['GETTING-STARTED.md'] },
    });
    writeText(path.join(consumerDir, 'GETTING-STARTED.md'), '# Custom Content\n');

    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'apply',
    });

    // Existing content must not be overwritten.
    const content = readFileSync(path.join(consumerDir, 'GETTING-STARTED.md'), 'utf8');
    assert.equal(content, '# Custom Content\n');
    const change = result.changes.find(c => c.target === 'GETTING-STARTED.md');
    assert.equal(change?.action, 'preserved');
  });

  it('check mode: missing seeded file is drift', async () => {
    buildHarnessRepo(harnessDir, {
      seeded: { 'GETTING-STARTED.md': '# Getting Started\n' },
    });
    buildConsumerRepo(consumerDir, {
      seeded: { files: ['GETTING-STARTED.md'] },
    });

    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'check',
    });

    assert.equal(result.driftDetected, true);
    assert(!existsSync(path.join(consumerDir, 'GETTING-STARTED.md')));
  });

  it('check mode: present seeded file is not drift', async () => {
    buildHarnessRepo(harnessDir, {
      seeded: { 'GETTING-STARTED.md': '# Getting Started\n' },
    });
    buildConsumerRepo(consumerDir, {
      seeded: { files: ['GETTING-STARTED.md'] },
    });
    writeText(path.join(consumerDir, 'GETTING-STARTED.md'), '# Custom Content\n');

    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'check',
    });

    assert.equal(result.driftDetected, false);
  });
});

// ---------------------------------------------------------------------------
describe('sync() — composed files', () => {
  let harnessDir, consumerDir;

  beforeEach(() => {
    harnessDir = makeTmpDir('harness-');
    consumerDir = makeTmpDir('consumer-');
  });
  afterEach(() => {
    removeTmpDir(harnessDir);
    removeTmpDir(consumerDir);
  });

  it('creates a composed file fresh when absent (apply mode)', async () => {
    buildHarnessRepo(harnessDir, {
      composed: { 'NOTES.md': COMPOSED_TEMPLATE },
    });
    buildConsumerRepo(consumerDir, {
      composed: {
        files: ['NOTES.md'],
        overrides: {
          'NOTES.md': { local_blocks: ['my-section'] },
        },
      },
    });

    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'apply',
    });

    assert(existsSync(path.join(consumerDir, 'NOTES.md')));
    const change = result.changes.find(c => c.target === 'NOTES.md');
    assert.equal(change?.action, 'created');
  });

  it('preserves user block content when re-syncing (apply mode)', async () => {
    buildHarnessRepo(harnessDir, {
      composed: { 'NOTES.md': COMPOSED_TEMPLATE },
    });
    buildConsumerRepo(consumerDir, {
      composed: {
        files: ['NOTES.md'],
        overrides: {
          'NOTES.md': { local_blocks: ['my-section'] },
        },
      },
    });
    // Consumer was previously synced; user has added content inside the block.
    // Skeleton matches the template exactly (only block body differs from placeholder).
    writeText(path.join(consumerDir, 'NOTES.md'), `# Composed File

<!-- harness:local-start id=my-section -->
user content here
<!-- harness:local-end id=my-section -->

## End
`);

    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'apply',
    });

    const content = readFileSync(path.join(consumerDir, 'NOTES.md'), 'utf8');
    assert(content.includes('user content here'), 'Expected user content preserved');
    assert(content.includes('my-section'), 'Expected block markers in output');
  });

  it('check mode: absent composed file is drift (without writing)', async () => {
    buildHarnessRepo(harnessDir, {
      composed: { 'NOTES.md': COMPOSED_TEMPLATE },
    });
    buildConsumerRepo(consumerDir, {
      composed: {
        files: ['NOTES.md'],
        overrides: { 'NOTES.md': { local_blocks: ['my-section'] } },
      },
    });
    // No NOTES.md in consumer — it's missing.

    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'check',
    });

    assert.equal(result.driftDetected, true, 'Missing composed file should be drift');
    assert(!existsSync(path.join(consumerDir, 'NOTES.md')), 'check mode must not write the file');
  });

  it('composed lock entry has blocks array with hashes', async () => {
    buildHarnessRepo(harnessDir, {
      composed: { 'NOTES.md': COMPOSED_TEMPLATE },
    });
    buildConsumerRepo(consumerDir, {
      composed: {
        files: ['NOTES.md'],
        overrides: { 'NOTES.md': { local_blocks: ['my-section'] } },
      },
    });

    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'apply',
    });

    const entry = result.lockAfter.files.find(f => f.target === 'NOTES.md');
    assert(entry, 'Expected lock entry for NOTES.md');
    assert.equal(entry.class, 'composed');
    assert(Array.isArray(entry.blocks), 'Expected blocks array in lock entry');
    assert(entry.blocks.length > 0);
    const block = entry.blocks[0];
    assert.equal(block.id, 'my-section');
    assert.match(block.body_hash, /^[0-9a-f]{64}$/);
    assert.match(block.template_marker_hash, /^[0-9a-f]{64}$/);
    assert(typeof block.source_line_range?.start === 'number');
    assert(typeof block.source_line_range?.end === 'number');
  });

  it('warns when local_blocks differs between overrides and top-level (LRN-009)', async () => {
    buildHarnessRepo(harnessDir, {
      composed: { 'NOTES.md': COMPOSED_TEMPLATE },
    });
    buildConsumerRepo(consumerDir, {
      composed: {
        files: ['NOTES.md'],
        overrides: { 'NOTES.md': { local_blocks: ['my-section'] } },
      },
      local_blocks: { 'NOTES.md': ['other-section'] },  // Disagrees with overrides.
    });

    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'check',
    });

    assert(result.warnings.some(w => w.includes('LRN-009') || w.includes('local_blocks')));
  });
});

// ---------------------------------------------------------------------------
describe('sync() — lock file', () => {
  let harnessDir, consumerDir;

  beforeEach(() => {
    harnessDir = makeTmpDir('harness-');
    consumerDir = makeTmpDir('consumer-');
  });
  afterEach(() => {
    removeTmpDir(harnessDir);
    removeTmpDir(consumerDir);
  });

  it('writes .harness-lock.json after apply mode', async () => {
    buildHarnessRepo(harnessDir, {
      managed: { 'README.md': '# README\n' },
    });
    buildConsumerRepo(consumerDir, {
      managed: { files: ['README.md'] },
    });

    await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'apply',
    });

    const lockPath = path.join(consumerDir, '.harness-lock.json');
    assert(existsSync(lockPath), 'Expected .harness-lock.json to be written');
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    assert(lock.harness_ref, 'Expected harness_ref in lock');
    assert(lock.resolved_sha, 'Expected resolved_sha in lock');
    assert(lock.synced_at, 'Expected synced_at in lock');
    assert(Array.isArray(lock.files), 'Expected files array in lock');
    assert(Array.isArray(lock.excluded), 'Expected excluded array in lock');
  });

  it('does NOT write lock in check mode', async () => {
    buildHarnessRepo(harnessDir, {
      managed: { 'README.md': '# README\n' },
    });
    buildConsumerRepo(consumerDir, {
      managed: { files: ['README.md'] },
    });

    await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'check',
    });

    assert(!existsSync(path.join(consumerDir, '.harness-lock.json')));
  });

  it('does NOT write lock in dry-run mode', async () => {
    buildHarnessRepo(harnessDir, {
      managed: { 'README.md': '# README\n' },
    });
    buildConsumerRepo(consumerDir, {
      managed: { files: ['README.md'] },
    });

    await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'dry-run',
    });

    assert(!existsSync(path.join(consumerDir, '.harness-lock.json')));
  });

  it('result includes lockBefore from existing lock', async () => {
    buildHarnessRepo(harnessDir);
    buildConsumerRepo(consumerDir);
    const previousLock = {
      harness_ref: 'v0.0.9',
      resolved_sha: 'a'.repeat(40),
      config_schema_version: 'old',
      synced_at: '2024-01-01T00:00:00.000Z',
      files: [],
      scaffolds: [],
      excluded: [],
    };
    writeJSON(path.join(consumerDir, '.harness-lock.json'), previousLock);

    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'check',
    });

    assert(result.lockBefore !== null);
    assert.equal(result.lockBefore.harness_ref, 'v0.0.9');
  });

  it('lockBefore is null when no existing lock', async () => {
    buildHarnessRepo(harnessDir);
    buildConsumerRepo(consumerDir);

    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'check',
    });

    assert.equal(result.lockBefore, null);
  });
});

// ---------------------------------------------------------------------------
describe('sync() — SyncResult shape', () => {
  let harnessDir, consumerDir;

  beforeEach(() => {
    harnessDir = makeTmpDir('harness-');
    consumerDir = makeTmpDir('consumer-');
    buildHarnessRepo(harnessDir, {
      managed: { 'README.md': '# README\n' },
    });
    buildConsumerRepo(consumerDir, {
      managed: { files: ['README.md'] },
    });
  });
  afterEach(() => {
    removeTmpDir(harnessDir);
    removeTmpDir(consumerDir);
  });

  it('result has all required SyncResult fields', async () => {
    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'apply',
    });

    assert('mode' in result, 'Missing mode');
    assert('changes' in result, 'Missing changes');
    assert('driftDetected' in result, 'Missing driftDetected');
    assert('warnings' in result, 'Missing warnings');
    assert('lockBefore' in result, 'Missing lockBefore');
    assert('lockAfter' in result, 'Missing lockAfter');
    assert(Array.isArray(result.changes), 'changes must be array');
    assert(Array.isArray(result.warnings), 'warnings must be array');
  });

  it('change records have target, class, and action fields', async () => {
    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'apply',
    });

    for (const change of result.changes) {
      assert('target' in change, `Change record missing target: ${JSON.stringify(change)}`);
      assert('class' in change, `Change record missing class: ${JSON.stringify(change)}`);
      assert('action' in change, `Change record missing action: ${JSON.stringify(change)}`);
    }
  });
});


// ===========================================================================
// Fix #1: plan/commit atomicity — error in second file must not write first
// ===========================================================================

describe('sync() — Fix #1: plan/commit atomicity', () => {
  let harnessDir, consumerDir;

  beforeEach(() => {
    harnessDir = makeTmpDir('harness-');
    consumerDir = makeTmpDir('consumer-');
  });
  afterEach(() => {
    removeTmpDir(harnessDir);
    removeTmpDir(consumerDir);
  });

  it('does not write any file when a later template is missing (atomicity)', async () => {
    // README.md has a template, MISSING.md does not.
    buildHarnessRepo(harnessDir, {
      managed: { 'README.md': '# README\n' },
      // MISSING.md template deliberately absent.
    });
    buildConsumerRepo(consumerDir, {
      managed: { files: ['README.md', 'MISSING.md'] },
    });

    await assert.rejects(
      () => sync({ consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'apply' }),
      (err) => err instanceof SyncError && err.code === 'ESYNC_MISSING_TEMPLATE',
    );

    // README.md must not have been written — plan failed before commit phase.
    assert(
      !existsSync(path.join(consumerDir, 'README.md')),
      'README.md must not be written when plan phase fails',
    );
  });
});

// ===========================================================================
// Fix #5: skip identical writes — already-synced consumer produces no writes
// ===========================================================================

describe('sync() — Fix #5: skip identical writes', () => {
  let harnessDir, consumerDir;

  beforeEach(() => {
    harnessDir = makeTmpDir('harness-');
    consumerDir = makeTmpDir('consumer-');
  });
  afterEach(() => {
    removeTmpDir(harnessDir);
    removeTmpDir(consumerDir);
  });

  it('reports action=skipped for managed file with identical content on second apply', async () => {
    buildHarnessRepo(harnessDir, {
      managed: { 'README.md': '# README\n' },
    });
    buildConsumerRepo(consumerDir, {
      managed: { files: ['README.md'] },
    });

    // First apply — creates the file.
    await sync({ consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'apply' });

    // Second apply — content is already up to date.
    const mtime1 = (await import('node:fs')).statSync(path.join(consumerDir, 'README.md')).mtimeMs;

    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'apply',
    });

    const change = result.changes.find(c => c.target === 'README.md');
    assert.equal(change?.action, 'skipped', 'Second apply of identical content should be skipped');

    // File's mtime should not change (no write occurred).
    const mtime2 = (await import('node:fs')).statSync(path.join(consumerDir, 'README.md')).mtimeMs;
    assert.equal(mtime1, mtime2, 'File must not be rewritten when content is identical');
  });
});

// ===========================================================================
// Review #2 Bug #4: validateLockObject pre-flight — EBADLOCK_PLAN
// ===========================================================================

describe('sync() — Bug #4: validateLockObject pre-flight (EBADLOCK_PLAN)', () => {
  // Note: The sync engine always produces structurally valid lock objects
  // during normal operation. EBADLOCK_PLAN is a defense-in-depth guard that
  // would fire if a future code change inadvertently produces an invalid lock
  // before writing any target files.
  //
  // The validateLockObject helper is tested directly in lock.test.mjs.
  // Here we verify the integration: a valid sync run does NOT trigger EBADLOCK_PLAN.

  let harnessDir, consumerDir;

  beforeEach(() => {
    harnessDir = makeTmpDir('harness-');
    consumerDir = makeTmpDir('consumer-');
  });
  afterEach(() => {
    removeTmpDir(harnessDir);
    removeTmpDir(consumerDir);
  });

  it('does not throw EBADLOCK_PLAN for a normal valid sync run', async () => {
    buildHarnessRepo(harnessDir, {
      managed: { 'README.md': '# README\n' },
    });
    buildConsumerRepo(consumerDir, {
      managed: { files: ['README.md'] },
    });

    // Should complete without throwing EBADLOCK_PLAN.
    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'apply',
    });
    assert.ok(result.lockAfter, 'lockAfter should be present');
    assert.ok(existsSync(path.join(consumerDir, '.harness-lock.json')));
  });
});

// ===========================================================================
// Review #2 Bug #5: Path normalization — EBADCONFIG_INVALID_PATH
// ===========================================================================

describe('sync() — Bug #5: path normalization and EBADCONFIG_INVALID_PATH', () => {
  let harnessDir, consumerDir;

  beforeEach(() => {
    harnessDir = makeTmpDir('harness-');
    consumerDir = makeTmpDir('consumer-');
  });
  afterEach(() => {
    removeTmpDir(harnessDir);
    removeTmpDir(consumerDir);
  });

  it('throws EBADCONFIG_DUP_PATH when dir/file.md and dir\\file.md appear in different classes', async () => {
    buildHarnessRepo(harnessDir, {
      managed:  { 'dir/file.md': '# file\n' },
      composed: { 'dir/file.md': COMPOSED_TEMPLATE },
    });
    // Config with forward-slash in managed, backslash in composed.
    buildConsumerRepo(consumerDir, {
      managed: { files: ['dir/file.md'] },
      composed: {
        files: ['dir\\file.md'],
        overrides: { 'dir/file.md': { local_blocks: ['my-section'] } },
      },
    });

    await assert.rejects(
      () => sync({ consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'apply' }),
      (err) => err instanceof SyncError && err.code === 'EBADCONFIG_DUP_PATH',
      'backslash and forward-slash form of same path must be treated as duplicate',
    );
  });

  it('throws EBADCONFIG_INVALID_PATH for paths containing ".." segments', async () => {
    buildHarnessRepo(harnessDir, {
      managed: { 'README.md': '# README\n' },
    });
    buildConsumerRepo(consumerDir, {
      managed: { files: ['../escape.md'] },
    });

    await assert.rejects(
      () => sync({ consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'apply' }),
      (err) => err instanceof SyncError && err.code === 'EBADCONFIG_INVALID_PATH',
      'path with ".." segment must throw EBADCONFIG_INVALID_PATH',
    );
  });

  it('throws EBADCONFIG_INVALID_PATH for absolute Unix-style paths', async () => {
    buildHarnessRepo(harnessDir, {
      managed: { 'README.md': '# README\n' },
    });
    buildConsumerRepo(consumerDir, {
      managed: { files: ['/absolute/path.md'] },
    });

    await assert.rejects(
      () => sync({ consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'apply' }),
      (err) => err instanceof SyncError && err.code === 'EBADCONFIG_INVALID_PATH',
      'absolute Unix path must throw EBADCONFIG_INVALID_PATH',
    );
  });

  it('throws EBADCONFIG_INVALID_PATH for rooted backslash paths (per GPT-5.5 review #3 #1)', async () => {
    buildHarnessRepo(harnessDir, { managed: { 'README.md': '# README\n' } });
    buildConsumerRepo(consumerDir, { managed: { files: ['\\absolute\\file.md'] } });
    await assert.rejects(
      () => sync({ consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'apply' }),
      (err) => err instanceof SyncError && err.code === 'EBADCONFIG_INVALID_PATH',
    );
  });

  it('throws EBADCONFIG_INVALID_PATH for UNC-style \\\\server\\share paths', async () => {
    buildHarnessRepo(harnessDir, { managed: { 'README.md': '# README\n' } });
    buildConsumerRepo(consumerDir, { managed: { files: ['\\\\server\\share\\file.md'] } });
    await assert.rejects(
      () => sync({ consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'apply' }),
      (err) => err instanceof SyncError && err.code === 'EBADCONFIG_INVALID_PATH',
    );
  });

  it('detects dir/file.md and dir/./file.md as duplicates after canonicalization', async () => {
    buildHarnessRepo(harnessDir, {
      managed: { 'dir/file.md': '# managed\n' },
      composed: { 'dir/file.md': '# composed\n' },
    });
    buildConsumerRepo(consumerDir, {
      managed: { files: ['dir/file.md'] },
      composed: { files: ['dir/./file.md'], overrides: { 'dir/./file.md': { local_blocks: [] } } },
    });
    await assert.rejects(
      () => sync({ consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'apply' }),
      (err) => err instanceof SyncError && err.code === 'EBADCONFIG_DUP_PATH',
    );
  });

  it('detects ./dir/file.md and dir/file.md as duplicates after canonicalization', async () => {
    buildHarnessRepo(harnessDir, {
      managed: { 'dir/file.md': '# managed\n' },
      composed: { 'dir/file.md': '# composed\n' },
    });
    buildConsumerRepo(consumerDir, {
      managed: { files: ['./dir/file.md'] },
      composed: { files: ['dir/file.md'], overrides: { 'dir/file.md': { local_blocks: [] } } },
    });
    await assert.rejects(
      () => sync({ consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'apply' }),
      (err) => err instanceof SyncError && err.code === 'EBADCONFIG_DUP_PATH',
    );
  });
});

// ===========================================================================
// Review #2 Bug #6: Atomicity — composed failure must not write managed file
// ===========================================================================

describe('sync() — Bug #6: atomicity when composed merge fails', () => {
  let harnessDir, consumerDir;

  beforeEach(() => {
    harnessDir = makeTmpDir('harness-');
    consumerDir = makeTmpDir('consumer-');
  });
  afterEach(() => {
    removeTmpDir(harnessDir);
    removeTmpDir(consumerDir);
  });

  it('does not write managed file when composed file fails with EMERGE_LEGACY_UNMAPPED', async () => {
    // Harness has managed README.md and composed NOTES.md.
    buildHarnessRepo(harnessDir, {
      managed: { 'README.md': '# README\n' },
      composed: { 'NOTES.md': COMPOSED_TEMPLATE },
    });
    buildConsumerRepo(consumerDir, {
      managed: { files: ['README.md'] },
      composed: {
        files: ['NOTES.md'],
        overrides: { 'NOTES.md': { local_blocks: ['my-section'] } },
      },
    });

    // Consumer NOTES.md has extra content outside any block — triggers EMERGE_LEGACY_UNMAPPED.
    writeText(path.join(consumerDir, 'NOTES.md'), `# Composed File

LEGACY CONTENT NOT IN TEMPLATE

<!-- harness:local-start id=my-section -->
user content here
<!-- harness:local-end id=my-section -->

## End
`);

    // Sync apply should fail with SyncError propagated from EMERGE_LEGACY_UNMAPPED.
    await assert.rejects(
      () => sync({ consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'apply' }),
      (err) => {
        assert.ok(err instanceof SyncError, `Expected SyncError, got ${err.constructor.name}`);
        assert.ok(
          err.code === 'EMERGE_LEGACY_UNMAPPED' || err.message.includes('EMERGE_LEGACY_UNMAPPED'),
          `Expected EMERGE_LEGACY_UNMAPPED in error, got code "${err.code}": ${err.message}`,
        );
        return true;
      },
      'composed merge failure should propagate as SyncError',
    );

    // README.md must NOT have been written (plan phase failed before commit phase).
    assert.ok(
      !existsSync(path.join(consumerDir, 'README.md')),
      'README.md must not be created when plan phase fails mid-way',
    );

    // Lock must NOT have been written.
    assert.ok(
      !existsSync(path.join(consumerDir, '.harness-lock.json')),
      'lock file must not be written when plan phase fails',
    );
  });

  it('preserves existing managed file content + mtime when composed file fails (per GPT-5.5 review #3 #6)', async () => {
    buildHarnessRepo(harnessDir, {
      managed: { 'README.md': '# NEW HARNESS README\n' },
      composed: { 'NOTES.md': COMPOSED_TEMPLATE },
    });
    buildConsumerRepo(consumerDir, {
      managed: { files: ['README.md'] },
      composed: {
        files: ['NOTES.md'],
        overrides: { 'NOTES.md': { local_blocks: ['my-section'] } },
      },
    });

    // Seed an existing README.md in the consumer with OLD content.
    const readmePath = path.join(consumerDir, 'README.md');
    const oldContent = '# OLD CONSUMER README — must not be overwritten when composed fails\n';
    writeText(readmePath, oldContent);
    // Pin the mtime to a fixed past date so any write would change it detectably.
    const oldDate = new Date('2020-01-01T00:00:00Z');
    utimesSync(readmePath, oldDate, oldDate);
    const beforeStats = statSync(readmePath);

    // Composed NOTES.md has legacy unmapped content → triggers failure.
    writeText(path.join(consumerDir, 'NOTES.md'), `# Composed File

LEGACY CONTENT NOT IN TEMPLATE

<!-- harness:local-start id=my-section -->
user content
<!-- harness:local-end id=my-section -->
`);

    await assert.rejects(
      () => sync({ consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'apply' }),
      (err) => err instanceof SyncError,
    );

    // Existing README.md must be unchanged: same content, same mtime.
    const afterStats = statSync(readmePath);
    const afterContent = readFileSync(readmePath, 'utf8');
    assert.equal(afterContent, oldContent, 'existing managed file content must be preserved');
    assert.equal(afterStats.mtimeMs, oldDate.getTime(), 'existing managed file mtime must be unchanged');

    // Lock must NOT have been written.
    assert.ok(
      !existsSync(path.join(consumerDir, '.harness-lock.json')),
      'lock file must not be written when plan phase fails',
    );
  });
});

describe('sync() — Fix #6: duplicate path validation', () => {
  let harnessDir, consumerDir;

  beforeEach(() => {
    harnessDir = makeTmpDir('harness-');
    consumerDir = makeTmpDir('consumer-');
  });
  afterEach(() => {
    removeTmpDir(harnessDir);
    removeTmpDir(consumerDir);
  });

  it('throws EBADCONFIG_DUP_PATH when same path appears in both managed and composed', async () => {
    buildHarnessRepo(harnessDir, {
      managed: { 'README.md': '# README\n' },
      composed: { 'README.md': COMPOSED_TEMPLATE },
    });
    buildConsumerRepo(consumerDir, {
      managed: { files: ['README.md'] },
      composed: {
        files: ['README.md'],
        overrides: { 'README.md': { local_blocks: ['my-section'] } },
      },
    });

    await assert.rejects(
      () => sync({ consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'apply' }),
      (err) => err instanceof SyncError && err.code === 'EBADCONFIG_DUP_PATH',
    );
  });
});

// ---------------------------------------------------------------------------
describe('sync() — missing template error', () => {
  let harnessDir, consumerDir;

  beforeEach(() => {
    harnessDir = makeTmpDir('harness-');
    consumerDir = makeTmpDir('consumer-');
  });
  afterEach(() => {
    removeTmpDir(harnessDir);
    removeTmpDir(consumerDir);
  });

  it('throws ESYNC_MISSING_TEMPLATE when template file is absent', async () => {
    buildHarnessRepo(harnessDir); // No templates.
    buildConsumerRepo(consumerDir, {
      managed: { files: ['README.md'] },
    });

    await assert.rejects(
      () => sync({
        consumerRepoPath: consumerDir,
        harnessRepoPath: harnessDir,
        mode: 'apply',
      }),
      (err) => {
        assert(err instanceof SyncError);
        assert.equal(err.code, 'ESYNC_MISSING_TEMPLATE');
        return true;
      }
    );
  });
});

// ===========================================================================
// Review #4 Blocking: canonical path downstream routing
// ===========================================================================

const COMPOSED_TEMPLATE_FOO = `# Composed File

<!-- harness:local-start id=my-section -->
<!-- harness:local-end id=my-section -->

## End
`;

describe('sync() — Review #4: canonical path downstream routing', () => {
  let harnessDir, consumerDir;

  beforeEach(() => {
    harnessDir = makeTmpDir('harness-');
    consumerDir = makeTmpDir('consumer-');
  });
  afterEach(() => {
    removeTmpDir(harnessDir);
    removeTmpDir(consumerDir);
  });

  it('./dir/file.md target matches composed.overrides key "dir/file.md" (canonical routing)', async () => {
    // Consumer lists target as "./dir/NOTES.md" with override key "dir/NOTES.md".
    // Before the fix, resolveAllowedBlockIds would look up "./dir/NOTES.md" in
    // overrides and find nothing → allowedBlockIds = [] → user block content
    // would not be preserved on re-sync. After the fix, both are canonicalized
    // to "dir/NOTES.md" so the override is found and content is preserved.
    buildHarnessRepo(harnessDir, {
      composed: { 'dir/NOTES.md': COMPOSED_TEMPLATE_FOO },
    });
    buildConsumerRepo(consumerDir, {
      composed: {
        files: ['./dir/NOTES.md'],
        overrides: { 'dir/NOTES.md': { local_blocks: ['my-section'] } },
      },
    });
    // Pre-populate the consumer file with user content in the my-section block.
    writeText(path.join(consumerDir, 'dir', 'NOTES.md'), `# Composed File

<!-- harness:local-start id=my-section -->
user content preserved
<!-- harness:local-end id=my-section -->

## End
`);

    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'apply',
    });

    // Override was matched → my-section block is in allowedBlockIds → content preserved.
    const content = readFileSync(path.join(consumerDir, 'dir', 'NOTES.md'), 'utf8');
    assert(content.includes('user content preserved'), 'block content must be preserved when override is matched');
    // Change record should reference the canonical target "dir/NOTES.md".
    const change = result.changes.find(c => c.target === 'dir/NOTES.md');
    assert(change, 'Expected change record for canonical target dir/NOTES.md');
  });

  it('excluded: ["dir/file.md"] matches a target listed as "./dir/file.md"', async () => {
    buildHarnessRepo(harnessDir, {
      managed: { 'dir/file.md': '# file\n' },
    });
    buildConsumerRepo(consumerDir, {
      managed: { files: ['./dir/file.md'] },
      excluded: ['dir/file.md'],
    });

    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'apply',
    });

    const change = result.changes.find(c => c.target === 'dir/file.md');
    assert(change, 'Expected change record for canonical target dir/file.md');
    assert.equal(change.action, 'excluded', 'file must be excluded when excluded entry matches canonical target');
    assert(!existsSync(path.join(consumerDir, 'dir', 'file.md')), 'excluded file must not be written');
  });

  it('excluded: ["build/"] directory prefix matches target "build/anything.md"', async () => {
    buildHarnessRepo(harnessDir, {
      managed: { 'build/anything.md': '# anything\n' },
    });
    buildConsumerRepo(consumerDir, {
      managed: { files: ['build/anything.md'] },
      excluded: ['build/'],
    });

    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'apply',
    });

    const change = result.changes.find(c => c.target === 'build/anything.md');
    assert(change, 'Expected change record for build/anything.md');
    assert.equal(change.action, 'excluded', 'file under build/ must be excluded by directory prefix');
    assert(!existsSync(path.join(consumerDir, 'build', 'anything.md')), 'excluded file must not be written');
  });

  it('throws EBADCONFIG_INVALID_PATH for trailing slash on a managed file target', async () => {
    buildHarnessRepo(harnessDir, { managed: { 'README.md': '# README\n' } });
    buildConsumerRepo(consumerDir, { managed: { files: ['dir/'] } });

    await assert.rejects(
      () => sync({ consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'apply' }),
      (err) => err instanceof SyncError && err.code === 'EBADCONFIG_INVALID_PATH',
      'trailing slash on file target must throw EBADCONFIG_INVALID_PATH',
    );
  });

  it('throws EBADCONFIG_INVALID_PATH for a target path with a control character', async () => {
    buildHarnessRepo(harnessDir, { managed: { 'README.md': '# README\n' } });
    buildConsumerRepo(consumerDir, { managed: { files: ['dir/\x01file.md'] } });

    await assert.rejects(
      () => sync({ consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'apply' }),
      (err) => err instanceof SyncError && err.code === 'EBADCONFIG_INVALID_PATH',
      'control character in target path must throw EBADCONFIG_INVALID_PATH',
    );
  });

  it('throws EBADCONFIG_INVALID_PATH for "." target (canonicalizes to empty per GPT-5.5 review #5 #2)', async () => {
    buildHarnessRepo(harnessDir, { managed: { 'README.md': '# README\n' } });
    buildConsumerRepo(consumerDir, { managed: { files: ['.'] } });
    await assert.rejects(
      () => sync({ consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'apply' }),
      (err) => err instanceof SyncError && err.code === 'EBADCONFIG_INVALID_PATH',
    );
  });

  it('throws EBADCONFIG_INVALID_PATH for "./" target', async () => {
    buildHarnessRepo(harnessDir, { managed: { 'README.md': '# README\n' } });
    buildConsumerRepo(consumerDir, { managed: { files: ['./'] } });
    await assert.rejects(
      () => sync({ consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'apply' }),
      (err) => err instanceof SyncError && err.code === 'EBADCONFIG_INVALID_PATH',
    );
  });

  it('throws EBADCONFIG_INVALID_PATH for excluded "." entry', async () => {
    buildHarnessRepo(harnessDir, { managed: { 'README.md': '# README\n' } });
    buildConsumerRepo(consumerDir, { managed: { files: ['README.md'] }, excluded: ['.'] });
    await assert.rejects(
      () => sync({ consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'apply' }),
      (err) => err instanceof SyncError && err.code === 'EBADCONFIG_INVALID_PATH',
    );
  });

  it('throws EBADCONFIG_DUP_PATH for canonical-collision in composed.overrides keys', async () => {
    buildHarnessRepo(harnessDir, {
      composed: { 'dir/NOTES.md': '# composed\n' },
    });
    buildConsumerRepo(consumerDir, {
      composed: {
        files: ['dir/NOTES.md'],
        overrides: {
          './dir/NOTES.md': { local_blocks: ['a'] },
          'dir/NOTES.md':   { local_blocks: ['b'] },
        },
      },
    });
    await assert.rejects(
      () => sync({ consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'apply' }),
      (err) => err instanceof SyncError && err.code === 'EBADCONFIG_DUP_PATH',
    );
  });

  it('throws EBADCONFIG_DUP_PATH for canonical-collision in top-level local_blocks keys', async () => {
    buildHarnessRepo(harnessDir, {
      composed: { 'dir/NOTES.md': '# composed\n' },
    });
    buildConsumerRepo(consumerDir, {
      composed: { files: ['dir/NOTES.md'] },
      local_blocks: {
        './dir/NOTES.md': ['a'],
        'dir/NOTES.md':   ['b'],
      },
    });
    await assert.rejects(
      () => sync({ consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'apply' }),
      (err) => err instanceof SyncError && err.code === 'EBADCONFIG_DUP_PATH',
    );
  });
});


// ===========================================================================
// Review #5 Bug #1: Prior lock target canonicalization
// (ECOMPOSED_DROPPED protection must apply even when the prior lock used
// non-canonical target paths — e.g. consumer was synced before
// canonicalization landed.)
// ===========================================================================

describe('sync() — Review #5 #1: prior lock target canonicalization', () => {
  let harnessDir, consumerDir;

  beforeEach(() => {
    harnessDir = makeTmpDir('harness-');
    consumerDir = makeTmpDir('consumer-');
  });
  afterEach(() => {
    removeTmpDir(harnessDir);
    removeTmpDir(consumerDir);
  });

  it('detects ECOMPOSED_DROPPED when prior lock target is non-canonical and current canonical target is missing a previously-recorded block', async () => {
    const TEMPLATE = `# Composed File

<!-- harness:local-start id=my-section -->
<!-- harness:local-end id=my-section -->

End.
`;
    buildHarnessRepo(harnessDir, {
      composed: { 'dir/NOTES.md': TEMPLATE },
    });
    buildConsumerRepo(consumerDir, {
      composed: {
        files: ['dir/NOTES.md'],
        overrides: { 'dir/NOTES.md': { local_blocks: ['my-section'] } },
      },
    });

    // Prior lock uses NON-CANONICAL target ('./dir/NOTES.md').
    const previousLock = {
      harness_ref: 'v0.0.9',
      resolved_sha: 'a'.repeat(40),
      config_schema_version: 'v0.1.0',
      synced_at: '2024-01-01T00:00:00.000Z',
      files: [
        {
          target: './dir/NOTES.md',
          source_template: 'template/composed/dir/NOTES.md',
          class: 'composed',
          rendered_hash: 'b'.repeat(64),
          action: 'created',
          blocks: [
            {
              id: 'my-section',
              source_line_range: { start: 3, end: 4 },
              body_hash: 'c'.repeat(64),
              template_marker_hash: 'd'.repeat(64),
              provenance: 'user-authored',
            },
          ],
        },
      ],
      scaffolds: [],
      excluded: [],
    };
    writeJSON(path.join(consumerDir, '.harness-lock.json'), previousLock);

    // Current consumer file MISSING the 'my-section' block.
    mkdirSync(path.join(consumerDir, 'dir'), { recursive: true });
    writeText(path.join(consumerDir, 'dir', 'NOTES.md'), `# Composed File

(no my-section block here)

End.
`);

    // Without the fix: prev-lock target '/dir/NOTES.md' wouldn't match canonical
    // 'dir/NOTES.md', mergeComposed sees no prior records, silently seeds empty.
    // With the fix: prev-lock target canonicalized on read, matches, ECOMPOSED_DROPPED fires.
    await assert.rejects(
      () => sync({ consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'apply' }),
      (err) => {
        assert.ok(err instanceof SyncError, `Expected SyncError, got ${err.constructor.name}`);
        assert.ok(
          err.code === 'ECOMPOSED_DROPPED' || err.message.includes('ECOMPOSED_DROPPED'),
          `Expected ECOMPOSED_DROPPED, got code "${err.code}": ${err.message}`,
        );
        return true;
      },
    );
  });
});


// ===========================================================================
// Review #6 Bug #1: Prototype-pollution-safe canonical-key collision detection
// (composed.overrides + local_blocks accumulators must use Map, not plain
// object, so __proto__ collisions are correctly detected.)
// ===========================================================================

describe('sync() — Review #6 #1: __proto__ canonical-key collision detection', () => {
  let harnessDir, consumerDir;

  beforeEach(() => {
    harnessDir = makeTmpDir('harness-');
    consumerDir = makeTmpDir('consumer-');
  });
  afterEach(() => {
    removeTmpDir(harnessDir);
    removeTmpDir(consumerDir);
  });

  // Helper: write a harness.config.json that has '__proto__' as an OWN property
  // (object literals treat '__proto__' as the prototype-set syntax, so we hand-author the JSON).
  function writeProtoConfig(consumerDir, overridesOrLocalBlocks) {
    const json = `{
      "version": "v0.1.0",
      "project": { "name": "test-project", "agent_suffix": "test" },
      "managed": { "files": [] },
      "composed": ${overridesOrLocalBlocks.composed},
      "seeded": { "files": [] },
      "excluded": [],
      "templating": {}
      ${overridesOrLocalBlocks.local_blocks ? ', "local_blocks": ' + overridesOrLocalBlocks.local_blocks : ''}
    }`;
    writeText(path.join(consumerDir, 'harness.config.json'), json);
  }

  it('throws EBADCONFIG_DUP_PATH for __proto__ canonical-collision in composed.overrides', async () => {
    // Write the template file with literal name '__proto__' (filesystem accepts it).
    mkdirSync(path.join(harnessDir, 'template', 'composed'), { recursive: true });
    writeText(path.join(harnessDir, 'template', 'composed', '__proto__'), '# composed\n');
    writeText(
      path.join(harnessDir, 'schemas', 'harness.config.schema.json'),
      readFileSync(path.join(repoRoot, 'schemas', 'harness.config.schema.json'), 'utf8'),
    );
    // Build config with __proto__ as own property by writing JSON directly.
    writeProtoConfig(consumerDir, {
      composed: '{ "files": ["__proto__"], "overrides": { "./__proto__": { "local_blocks": ["a"] }, "__proto__": { "local_blocks": ["b"] } } }',
    });
    await assert.rejects(
      () => sync({ consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'apply' }),
      (err) => err instanceof SyncError && err.code === 'EBADCONFIG_DUP_PATH',
    );
  });

  it('throws EBADCONFIG_DUP_PATH for __proto__ canonical-collision in top-level local_blocks', async () => {
    mkdirSync(path.join(harnessDir, 'template', 'composed'), { recursive: true });
    writeText(path.join(harnessDir, 'template', 'composed', '__proto__'), '# composed\n');
    writeText(
      path.join(harnessDir, 'schemas', 'harness.config.schema.json'),
      readFileSync(path.join(repoRoot, 'schemas', 'harness.config.schema.json'), 'utf8'),
    );
    writeProtoConfig(consumerDir, {
      composed: '{ "files": ["__proto__"] }',
      local_blocks: '{ "./__proto__": ["a"], "__proto__": ["b"] }',
    });
    await assert.rejects(
      () => sync({ consumerRepoPath: consumerDir, harnessRepoPath: harnessDir, mode: 'apply' }),
      (err) => err instanceof SyncError && err.code === 'EBADCONFIG_DUP_PATH',
    );
  });
});
