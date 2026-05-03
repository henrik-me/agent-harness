// Minimal tests for the lib/lock.mjs stub.
// The original cs03-lock sub-agent shipped a richer API (writeLock with atomic
// .tmp+rename, validateLock, newEmptyLock, LockError class with codes) but its
// work was lost in a parallel sub-agent file race with cs03-sync (see LRN-016
// at CS03 close-out). These tests cover the actual stub API; richer-API tests
// deferred to a planned CS that will upgrade lib/lock.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { readLock } from '../lib/lock.mjs';

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-harness-test-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('readLock returns null when .harness-lock.json does not exist', async () => {
  await withTempDir(async (dir) => {
    const result = await readLock(dir);
    assert.equal(result, null);
  });
});

test('readLock parses an existing .harness-lock.json', async () => {
  await withTempDir(async (dir) => {
    const lock = {
      harness_ref: 'v0.1.0',
      resolved_sha: '0'.repeat(40),
      config_schema_version: 'v0.1.0',
      synced_at: '2026-05-03T00:00:00Z',
      files: [],
      scaffolds: [],
      excluded: []
    };
    await writeFile(path.join(dir, '.harness-lock.json'), JSON.stringify(lock, null, 2));
    const result = await readLock(dir);
    assert.deepEqual(result, lock);
  });
});

test('readLock throws on invalid JSON', async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, '.harness-lock.json'), 'not valid json {{{');
    await assert.rejects(() => readLock(dir));
  });
});
