import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  LockReaderError,
  getComposedBlocks,
  getFileEntry,
  loadLock,
} from '../lib/lock-reader.mjs';

const SHA = 'a'.repeat(40);
const HASH = 'b'.repeat(64);
const MARKER_HASH = 'c'.repeat(64);

function tempRepo(t) {
  const base = path.join(process.cwd(), 'tests', '.tmp-lib-lock-reader-');
  const dir = mkdtempSync(base);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function validLock(overrides = {}) {
  return {
    harness_ref: 'v0.1.0',
    resolved_sha: SHA,
    config_schema_version: 'https://github.com/henrik-me/agent-harness/schemas/harness.config.schema.json',
    synced_at: '2026-05-10T00:00:00Z',
    files: [
      {
        target: 'OPERATIONS.md',
        source_template: 'template/composed/OPERATIONS.md',
        class: 'composed',
        rendered_hash: HASH,
        action: 'updated',
        blocks: [
          {
            id: 'custom.block',
            source_line_range: { start: 1, end: 3 },
            body_hash: HASH,
            template_marker_hash: MARKER_HASH,
            provenance: 'user-authored',
          },
        ],
        template_prose_hash: HASH,
      },
    ],
    scaffolds: [],
    excluded: [],
    ...overrides,
  };
}

function writeLock(dir, lock) {
  writeFileSync(path.join(dir, '.harness-lock.json'), `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
}

test('loadLock reads a valid lock and returns the absolute lock path', async (t) => {
  const dir = tempRepo(t);
  const lock = validLock();
  writeLock(dir, lock);

  const result = await loadLock({ cwd: dir });

  assert.deepEqual(result.lock, lock);
  assert.equal(result.lockPath, path.join(dir, '.harness-lock.json'));
});

test('loadLock throws NOT_FOUND when the lock file is missing', async (t) => {
  const dir = tempRepo(t);

  await assert.rejects(
    () => loadLock({ cwd: dir }),
    (err) => {
      assert.ok(err instanceof LockReaderError);
      assert.equal(err.code, 'NOT_FOUND');
      assert.equal(err.lockPath, path.join(dir, '.harness-lock.json'));
      return true;
    }
  );
});

test('loadLock throws INVALID_JSON for malformed JSON', async (t) => {
  const dir = tempRepo(t);
  writeFileSync(path.join(dir, '.harness-lock.json'), '{ malformed\n', 'utf8');

  await assert.rejects(
    () => loadLock({ cwd: dir }),
    (err) => {
      assert.ok(err instanceof LockReaderError);
      assert.equal(err.code, 'INVALID_JSON');
      assert.equal(err.lockPath, path.join(dir, '.harness-lock.json'));
      return true;
    }
  );
});

test('loadLock throws SCHEMA_INVALID for a wrong lock shape', async (t) => {
  const dir = tempRepo(t);
  writeLock(dir, { files: {} });

  await assert.rejects(
    () => loadLock({ cwd: dir }),
    (err) => {
      assert.ok(err instanceof LockReaderError);
      assert.equal(err.code, 'SCHEMA_INVALID');
      assert.equal(err.lockPath, path.join(dir, '.harness-lock.json'));
      assert.ok(Array.isArray(err.errors));
      return true;
    }
  );
});

test('getComposedBlocks returns blocks for an existing file', () => {
  const lock = validLock();

  assert.deepEqual(getComposedBlocks(lock, 'OPERATIONS.md'), lock.files[0].blocks);
});

test('getComposedBlocks returns an empty object for missing block data', () => {
  assert.deepEqual(getComposedBlocks({}, 'OPERATIONS.md'), {});
  assert.deepEqual(getComposedBlocks(validLock(), 'MISSING.md'), {});

  const lock = validLock({
    files: [
      {
        target: 'README.md',
        source_template: 'template/managed/README.md',
        class: 'managed',
        rendered_hash: HASH,
        action: 'skipped',
      },
    ],
  });
  assert.deepEqual(getComposedBlocks(lock, 'README.md'), {});
});

test('getFileEntry returns the full file entry or null for a missing file', () => {
  const lock = validLock();

  assert.deepEqual(getFileEntry(lock, 'OPERATIONS.md'), lock.files[0]);
  assert.equal(getFileEntry(lock, 'MISSING.md'), null);
  assert.equal(getFileEntry({}, 'OPERATIONS.md'), null);
});

test('accessors tolerate object-shaped file maps for migration callers', () => {
  const entry = { blocks: [{ id: 'custom.block' }] };
  const lock = { files: { 'OPERATIONS.md': entry } };

  assert.deepEqual(getFileEntry(lock, 'OPERATIONS.md'), entry);
  assert.deepEqual(getComposedBlocks(lock, 'OPERATIONS.md'), entry.blocks);
});
