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
import { readFileSync, mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
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
