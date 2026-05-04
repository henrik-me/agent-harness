import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { readLock, writeLock, validateLockObject, newEmptyLock, LockError } from '../lib/lock.mjs';

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
    await assert.rejects(
      () => readLock(dir),
      { name: 'LockError', code: 'EBADLOCK' },
    );
  });
});

// ---------------------------------------------------------------------------
// New tests for Fix #4: LockError class, schema validation, atomic write
// ---------------------------------------------------------------------------

test('readLock throws LockError(ESCHEMA) when lock file fails schema validation', async () => {
  await withTempDir(async (dir) => {
    // Valid JSON but invalid schema: resolved_sha is not 40 hex chars.
    const bad = {
      harness_ref: 'v0.1.0',
      resolved_sha: 'not-a-sha',
      config_schema_version: 'v0.1.0',
      synced_at: '2026-05-03T00:00:00Z',
      files: [],
      scaffolds: [],
      excluded: [],
    };
    await writeFile(path.join(dir, '.harness-lock.json'), JSON.stringify(bad));
    await assert.rejects(
      () => readLock(dir),
      { name: 'LockError', code: 'ESCHEMA' },
    );
  });
});

test('writeLock writes valid lock to final path with correct content', async () => {
  await withTempDir(async (dir) => {
    const lock = {
      harness_ref: 'v0.1.0',
      resolved_sha: 'a'.repeat(40),
      config_schema_version: 'v0.1.0',
      synced_at: new Date().toISOString(),
      files: [],
      scaffolds: [],
      excluded: [],
    };
    await writeLock(dir, lock);

    // Final file must exist and parse to the same object.
    const raw = await readFile(path.join(dir, '.harness-lock.json'), 'utf8');
    assert.deepEqual(JSON.parse(raw), lock);

    // Temporary file must have been removed.
    await assert.rejects(
      () => access(path.join(dir, '.harness-lock.json.tmp')),
      'tmp file should not exist after successful write',
    );
  });
});

test('writeLock throws LockError(ESCHEMA) and writes no file when lock is invalid', async () => {
  await withTempDir(async (dir) => {
    const bad = { harness_ref: 'v0.1.0' }; // Missing required fields.
    await assert.rejects(
      () => writeLock(dir, bad),
      { name: 'LockError', code: 'ESCHEMA' },
    );

    // No partial file should have been created.
    await assert.rejects(
      () => access(path.join(dir, '.harness-lock.json')),
      'lock file should not exist after failed write',
    );
    await assert.rejects(
      () => access(path.join(dir, '.harness-lock.json.tmp')),
      'tmp file should not exist after failed write',
    );
  });
});

test('writeLock + readLock round-trip preserves all fields', async () => {
  await withTempDir(async (dir) => {
    const lock = {
      harness_ref: 'refs/tags/v1.2.3',
      resolved_sha: '0'.repeat(40),
      config_schema_version: 'v0.1.0',
      synced_at: '2026-01-15T12:00:00.000Z',
      files: [
        {
          target: 'README.md',
          source_template: 'template/managed/README.md',
          class: 'managed',
          rendered_hash: 'a'.repeat(64),
          action: 'updated',
        },
      ],
      scaffolds: [],
      excluded: ['NOTES.md'],
    };
    await writeLock(dir, lock);
    const result = await readLock(dir);
    assert.deepEqual(result, lock);
  });
});

// ---------------------------------------------------------------------------
// Tests for validateLockObject (Fix #4 — pre-flight validation helper)
// ---------------------------------------------------------------------------

const VALID_LOCK = {
  harness_ref: 'v0.1.0',
  resolved_sha: 'a'.repeat(40),
  config_schema_version: 'v0.1.0',
  synced_at: '2026-05-03T00:00:00.000Z',
  files: [],
  scaffolds: [],
  excluded: [],
};

describe('validateLockObject', () => {
  it('returns {valid: true} for a well-formed lock object', () => {
    const result = validateLockObject(VALID_LOCK);
    assert.equal(result.valid, true);
    assert.equal(result.errors, undefined);
  });

  it('returns {valid: false, errors} when resolved_sha is not 40 hex chars', () => {
    const bad = { ...VALID_LOCK, resolved_sha: 'not-a-sha' };
    const result = validateLockObject(bad);
    assert.equal(result.valid, false);
    assert.ok(Array.isArray(result.errors), 'errors should be an array');
    assert.ok(result.errors.length > 0, 'errors array should not be empty');
  });

  it('returns {valid: false, errors} when required field synced_at is missing', () => {
    const { synced_at: _, ...rest } = VALID_LOCK;
    const result = validateLockObject(rest);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  it('returns {valid: false, errors} when synced_at is not a valid date-time string', () => {
    const bad = { ...VALID_LOCK, synced_at: 'not-a-date' };
    const result = validateLockObject(bad);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  it('returns {valid: false, errors} when files contains entry with invalid rendered_hash', () => {
    const bad = {
      ...VALID_LOCK,
      files: [{
        target: 'README.md',
        source_template: 'template/managed/README.md',
        class: 'managed',
        rendered_hash: 'tooshort',  // not 64 hex chars
        action: 'created',
      }],
    };
    const result = validateLockObject(bad);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  it('does not throw — always returns a result object', () => {
    assert.doesNotThrow(() => validateLockObject(null));
    assert.doesNotThrow(() => validateLockObject({}));
    assert.doesNotThrow(() => validateLockObject('string'));
  });
});

// ---------------------------------------------------------------------------
// Tests for newEmptyLock (factory function for initial lock skeleton)
// ---------------------------------------------------------------------------

test('newEmptyLock with valid args returns a schema-valid lock', () => {
  const result = newEmptyLock({
    harnessRef: 'v0.1.0',
    resolvedSha: 'a'.repeat(40),
    configSchemaVersion: 'v0.1.0',
  });

  assert.equal(result.harness_ref, 'v0.1.0');
  assert.equal(result.resolved_sha, 'a'.repeat(40));
  assert.equal(result.config_schema_version, 'v0.1.0');
  assert.ok(typeof result.synced_at === 'string');
  assert.deepEqual(result.files, []);
  assert.deepEqual(result.scaffolds, []);
  assert.deepEqual(result.excluded, []);

  // Verify it passes validation.
  const valid = validateLockObject(result);
  assert.equal(valid.valid, true);
});

test('newEmptyLock auto-fills syncedAt with current ISO timestamp when omitted', () => {
  const before = new Date();
  const result = newEmptyLock({
    harnessRef: 'v0.1.0',
    resolvedSha: 'b'.repeat(40),
    configSchemaVersion: 'v0.1.0',
  });
  const after = new Date();

  assert.ok(result.synced_at);
  const syncedDate = new Date(result.synced_at);
  assert.ok(syncedDate >= before && syncedDate <= after, 'synced_at should be within test window');
});

test('newEmptyLock with invalid resolved_sha throws LockError ESCHEMA', () => {
  assert.throws(
    () => newEmptyLock({
      harnessRef: 'v0.1.0',
      resolvedSha: 'not-hex',
      configSchemaVersion: 'v0.1.0',
    }),
    { name: 'LockError', code: 'ESCHEMA' }
  );
});

test('newEmptyLock result writeLock-roundtrips cleanly', async () => {
  await withTempDir(async (dir) => {
    const original = newEmptyLock({
      harnessRef: 'refs/tags/v1.0.0',
      resolvedSha: 'c'.repeat(40),
      configSchemaVersion: 'v0.1.0',
      syncedAt: '2026-05-03T12:00:00Z',
    });

    await writeLock(dir, original);
    const roundtripped = await readLock(dir);

    assert.deepEqual(roundtripped, original);
  });
});
