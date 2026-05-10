/**
 * tests/sync-config-override.test.mjs — Tests for sync({ configPath }).
 *
 * Run: node --test tests/sync-config-override.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

import { sync, SyncError } from '../lib/sync.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

async function makeTmpDir(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeText(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
}

async function writeJSON(filePath, value) {
  await writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function buildHarnessRepo(dir, templates = {}) {
  const schema = await readFile(path.join(repoRoot, 'schemas', 'harness.config.schema.json'), 'utf8');
  await writeText(path.join(dir, 'schemas', 'harness.config.schema.json'), schema);

  for (const [name, content] of Object.entries(templates.managed ?? {})) {
    await writeText(path.join(dir, 'template', 'managed', name), content);
  }
}

function baseConfig(overrides = {}) {
  return {
    version: 'v0.1.0',
    project: { name: 'test-project', agent_suffix: 'test' },
    managed: { files: [] },
    composed: { files: [] },
    seeded: { files: [] },
    excluded: [],
    templating: {},
    ...overrides,
  };
}

test('sync({ configPath }) reads an explicit config when consumer cwd has no config', async (t) => {
  const harnessDir = await makeTmpDir('harness-config-override-harness-');
  const consumerDir = await makeTmpDir('harness-config-override-consumer-');
  t.after(async () => {
    await rm(harnessDir, { recursive: true, force: true });
    await rm(consumerDir, { recursive: true, force: true });
  });

  await buildHarnessRepo(harnessDir);
  const overridePath = path.join(consumerDir, 'alt.json');
  await writeJSON(overridePath, baseConfig());

  assert.equal(existsSync(path.join(consumerDir, 'harness.config.json')), false);
  const result = await sync({
    consumerRepoPath: consumerDir,
    harnessRepoPath: harnessDir,
    mode: 'check',
    configPath: overridePath,
  });

  assert.equal(result.mode, 'check');
  assert.equal(result.driftDetected, false);
});

test('sync({ configPath }) ignores consumer cwd harness.config.json when override exists', async (t) => {
  const harnessDir = await makeTmpDir('harness-config-override-harness-');
  const consumerDir = await makeTmpDir('harness-config-override-consumer-');
  t.after(async () => {
    await rm(harnessDir, { recursive: true, force: true });
    await rm(consumerDir, { recursive: true, force: true });
  });

  await buildHarnessRepo(harnessDir, {
    managed: {
      'default.txt': 'default config template\n',
      'override.txt': 'override config template\n',
    },
  });
  await writeJSON(path.join(consumerDir, 'harness.config.json'), baseConfig({
    version: 'v9.0.0',
    managed: { files: ['default.txt'] },
  }));
  await writeJSON(path.join(consumerDir, '.harness-lock.json'), {
    harness_ref: 'v0.0.1',
    resolved_sha: '0'.repeat(40),
    config_schema_version: 'test',
    synced_at: new Date().toISOString(),
    files: [],
    scaffolds: [],
    excluded: [],
  });
  const overridePath = path.join(consumerDir, 'alt.json');
  await writeJSON(overridePath, baseConfig({
    version: 'v0.1.0-override',
    managed: { files: ['override.txt'] },
  }));

  const result = await sync({
    consumerRepoPath: consumerDir,
    harnessRepoPath: harnessDir,
    mode: 'check',
    configPath: overridePath,
  });

  assert.deepEqual(result.changes.map(change => change.target), ['override.txt']);
  assert.equal(result.lockAfter.files[0].target, 'override.txt');
});

test('sync({ configPath }) reports ESYNC_NO_CONFIG with override-specific message', async (t) => {
  const harnessDir = await makeTmpDir('harness-config-override-harness-');
  const consumerDir = await makeTmpDir('harness-config-override-consumer-');
  t.after(async () => {
    await rm(harnessDir, { recursive: true, force: true });
    await rm(consumerDir, { recursive: true, force: true });
  });

  await buildHarnessRepo(harnessDir);
  const missingPath = path.join(consumerDir, 'nonexistent.json');

  await assert.rejects(
    () => sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'check',
      configPath: missingPath,
    }),
    (err) => {
      assert(err instanceof SyncError);
      assert.equal(err.code, 'ESYNC_NO_CONFIG');
      assert.match(err.message, new RegExp(`^Config file not found at ${escapeRegExp(missingPath)}$`));
      return true;
    }
  );
});

test('sync({ configPath }) reports ESYNC_INVALID_CONFIG with override-specific JSON message', async (t) => {
  const harnessDir = await makeTmpDir('harness-config-override-harness-');
  const consumerDir = await makeTmpDir('harness-config-override-consumer-');
  t.after(async () => {
    await rm(harnessDir, { recursive: true, force: true });
    await rm(consumerDir, { recursive: true, force: true });
  });

  await buildHarnessRepo(harnessDir);
  const malformedPath = path.join(consumerDir, 'malformed.json');
  await writeText(malformedPath, '{ not valid json }');

  await assert.rejects(
    () => sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'check',
      configPath: malformedPath,
    }),
    (err) => {
      assert(err instanceof SyncError);
      assert.equal(err.code, 'ESYNC_INVALID_CONFIG');
      assert.match(err.message, /^Config file is not valid JSON: /);
      return true;
    }
  );
});

test('sync({ configPath }) reports ESYNC_INVALID_CONFIG for schema-invalid override config', async (t) => {
  const harnessDir = await makeTmpDir('harness-config-override-harness-');
  const consumerDir = await makeTmpDir('harness-config-override-consumer-');
  t.after(async () => {
    await rm(harnessDir, { recursive: true, force: true });
    await rm(consumerDir, { recursive: true, force: true });
  });

  await buildHarnessRepo(harnessDir);
  const invalidPath = path.join(consumerDir, 'schema-invalid.json');
  await writeJSON(invalidPath, baseConfig({ unexpected_field: true }));

  await assert.rejects(
    () => sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'check',
      configPath: invalidPath,
    }),
    (err) => {
      assert(err instanceof SyncError);
      assert.equal(err.code, 'ESYNC_INVALID_CONFIG');
      assert.match(err.message, /failed schema validation/);
      return true;
    }
  );
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
