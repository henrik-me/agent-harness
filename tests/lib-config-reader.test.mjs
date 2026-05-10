/**
 * tests/lib-config-reader.test.mjs — Tests for shared harness config reader.
 *
 * Run: node --test tests/lib-config-reader.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { ConfigReaderError, loadConfig } from '../lib/config-reader.mjs';

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

test('loadConfig reads default harness.config.json from cwd', async (t) => {
  const cwd = await makeTmpDir('harness-config-reader-default-');
  t.after(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  const configPath = path.join(cwd, 'harness.config.json');
  const config = baseConfig();
  await writeJSON(configPath, config);

  const result = await loadConfig({ cwd });

  assert.deepEqual(result.config, config);
  assert.equal(result.configPath, configPath);
});

test('loadConfig reads explicit configPath override', async (t) => {
  const cwd = await makeTmpDir('harness-config-reader-override-');
  t.after(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  const defaultConfig = baseConfig({ version: 'v0.1.0-default' });
  const overrideConfig = baseConfig({ version: 'v0.1.0-override' });
  const overridePath = path.join(cwd, 'alt-config.json');
  await writeJSON(path.join(cwd, 'harness.config.json'), defaultConfig);
  await writeJSON(overridePath, overrideConfig);

  const result = await loadConfig({ cwd, configPath: overridePath });

  assert.deepEqual(result.config, overrideConfig);
  assert.equal(result.configPath, overridePath);
});

test('loadConfig reports NOT_FOUND for explicit configPath with override path', async (t) => {
  const cwd = await makeTmpDir('harness-config-reader-missing-override-');
  t.after(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  const missingPath = path.join(cwd, 'missing.json');
  await assert.rejects(
    () => loadConfig({ cwd, configPath: missingPath }),
    (err) => {
      assert(err instanceof ConfigReaderError);
      assert.equal(err.code, 'NOT_FOUND');
      assert.equal(err.configPath, missingPath);
      assert.match(err.message, /--config file not found:/);
      assert.ok(err.message.includes(missingPath), `message must include override path: ${err.message}`);
      return true;
    }
  );
});

test('loadConfig reports NOT_FOUND for default path with resolved default path', async (t) => {
  const cwd = await makeTmpDir('harness-config-reader-missing-default-');
  t.after(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  const defaultPath = path.join(cwd, 'harness.config.json');
  await assert.rejects(
    () => loadConfig({ cwd }),
    (err) => {
      assert(err instanceof ConfigReaderError);
      assert.equal(err.code, 'NOT_FOUND');
      assert.equal(err.configPath, defaultPath);
      assert.match(err.message, /harness\.config\.json not found at/);
      assert.ok(err.message.includes(defaultPath), `message must include default path: ${err.message}`);
      return true;
    }
  );
});

test('loadConfig reports INVALID_JSON for explicit configPath with override path', async (t) => {
  const cwd = await makeTmpDir('harness-config-reader-json-override-');
  t.after(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  const malformedPath = path.join(cwd, 'malformed.json');
  await writeText(malformedPath, '{ not valid json }');

  await assert.rejects(
    () => loadConfig({ cwd, configPath: malformedPath }),
    (err) => {
      assert(err instanceof ConfigReaderError);
      assert.equal(err.code, 'INVALID_JSON');
      assert.equal(err.configPath, malformedPath);
      assert.match(err.message, /--config file is not valid JSON:/);
      assert.ok(err.message.includes(malformedPath), `message must include override path: ${err.message}`);
      return true;
    }
  );
});

test('loadConfig reports SCHEMA_INVALID for explicit configPath with override path', async (t) => {
  const cwd = await makeTmpDir('harness-config-reader-schema-override-');
  t.after(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  const invalidPath = path.join(cwd, 'schema-invalid.json');
  await writeJSON(invalidPath, baseConfig({ unexpected_field: true }));

  await assert.rejects(
    () => loadConfig({ cwd, configPath: invalidPath }),
    (err) => {
      assert(err instanceof ConfigReaderError);
      assert.equal(err.code, 'SCHEMA_INVALID');
      assert.equal(err.configPath, invalidPath);
      assert.ok(Array.isArray(err.errors));
      assert.match(err.message, /--config file failed schema validation:/);
      assert.ok(err.message.includes(invalidPath), `message must include override path: ${err.message}`);
      return true;
    }
  );
});
