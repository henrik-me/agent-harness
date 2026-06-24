/**
 * tests/lib-disposers.test.mjs — temp-dir/clone disposer primitives (CS64b C64b-2).
 *
 * Encodes the LRN-157 contract: provenance-safe `{path, cleanup}`, idempotent
 * cleanup, leak-free `withTempDir` on success AND throw, and leading-dash ref
 * rejection. All scratch space lives under os.tmpdir() ONLY (never REPO_ROOT,
 * per LRN-094).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeTempDir, withTempDir, assertSafeRef } from '../lib/disposers.mjs';

// --- makeTempDir -----------------------------------------------------------

test('makeTempDir creates a real directory under os.tmpdir()', () => {
  const d = makeTempDir();
  try {
    assert.equal(typeof d.path, 'string');
    assert.ok(fs.existsSync(d.path), 'allocated dir should exist on disk');
    assert.ok(fs.statSync(d.path).isDirectory(), 'allocated path should be a directory');
    assert.equal(path.dirname(d.path), os.tmpdir(), 'dir must live directly under os.tmpdir()');
  } finally {
    d.cleanup();
  }
});

test('makeTempDir honours a custom prefix', () => {
  const d = makeTempDir('disposer-test-');
  try {
    assert.ok(path.basename(d.path).startsWith('disposer-test-'));
  } finally {
    d.cleanup();
  }
});

test('makeTempDir cleanup removes the directory', () => {
  const d = makeTempDir();
  assert.ok(fs.existsSync(d.path));
  d.cleanup();
  assert.ok(!fs.existsSync(d.path), 'cleanup must remove the dir');
});

test('makeTempDir cleanup removes a non-empty directory recursively', () => {
  const d = makeTempDir();
  fs.writeFileSync(path.join(d.path, 'file.txt'), 'hello');
  fs.mkdirSync(path.join(d.path, 'sub'));
  fs.writeFileSync(path.join(d.path, 'sub', 'nested.txt'), 'world');
  d.cleanup();
  assert.ok(!fs.existsSync(d.path), 'recursive force-remove must clear nested contents');
});

test('makeTempDir cleanup is idempotent on double-call (no throw)', () => {
  const d = makeTempDir();
  d.cleanup();
  assert.doesNotThrow(() => d.cleanup(), 'second cleanup() must not throw');
  assert.doesNotThrow(() => d.cleanup(), 'third cleanup() must not throw');
});

test('makeTempDir cleanup is safe after external removal (no throw)', () => {
  const d = makeTempDir();
  // Simulate the dir being removed by some other process before cleanup runs.
  fs.rmSync(d.path, { recursive: true, force: true });
  assert.ok(!fs.existsSync(d.path));
  assert.doesNotThrow(() => d.cleanup(), 'cleanup after external removal must not throw');
});

test('makeTempDir is provenance-safe: cleanup removes only the exact allocated path', () => {
  // Two independent allocations; cleaning one must not touch the other, even
  // though both live under the same os.tmpdir() prefix space.
  const a = makeTempDir('prov-a-');
  const b = makeTempDir('prov-b-');
  try {
    a.cleanup();
    assert.ok(!fs.existsSync(a.path), 'a should be removed');
    assert.ok(fs.existsSync(b.path), 'b must NOT be removed by a.cleanup() (no prefix-guess)');
  } finally {
    b.cleanup();
  }
});

test('makeTempDir uses the injected fs seam', () => {
  const calls = { mkdtemp: [], rm: [] };
  const fakeFs = {
    mkdtempSync(p) { calls.mkdtemp.push(p); return p + 'XXXX'; },
    rmSync(p, opts) { calls.rm.push({ p, opts }); },
  };
  const d = makeTempDir('seam-', { fs: fakeFs });
  assert.equal(calls.mkdtemp.length, 1);
  assert.ok(d.path.endsWith('XXXX'));
  d.cleanup();
  d.cleanup();
  assert.equal(calls.rm.length, 1, 'injected rmSync must be called exactly once (idempotent)');
  assert.equal(calls.rm[0].p, d.path, 'must remove exactly the allocated path');
  assert.deepEqual(calls.rm[0].opts, { recursive: true, force: true });
});

test('makeTempDir cleanup swallows fs errors (best-effort, never throws)', () => {
  const fakeFs = {
    mkdtempSync(p) { return p; },
    rmSync() { throw new Error('boom'); },
  };
  const d = makeTempDir('err-', { fs: fakeFs });
  assert.doesNotThrow(() => d.cleanup(), 'cleanup must swallow rmSync errors');
});

test('makeTempDir rejects a non-string prefix', () => {
  assert.throws(() => makeTempDir(123), /prefix must be a string/);
});

// --- withTempDir -----------------------------------------------------------

test('withTempDir passes a real dir and returns the callback result', async () => {
  let seen;
  const result = await withTempDir((dir) => {
    seen = dir;
    assert.ok(fs.existsSync(dir));
    return 'ok-result';
  });
  assert.equal(result, 'ok-result');
  assert.ok(!fs.existsSync(seen), 'dir must be cleaned up after success');
});

test('withTempDir cleans up on success', async () => {
  let captured;
  await withTempDir((dir) => {
    captured = dir;
    fs.writeFileSync(path.join(dir, 'x'), 'y');
  });
  assert.ok(!fs.existsSync(captured), 'temp dir must be gone after a successful run');
});

test('withTempDir cleans up when the callback throws (no leak)', async () => {
  let captured;
  await assert.rejects(
    () => withTempDir((dir) => {
      captured = dir;
      assert.ok(fs.existsSync(dir));
      throw new Error('callback failed');
    }),
    /callback failed/,
  );
  assert.ok(!fs.existsSync(captured), 'temp dir must be cleaned up even when fn throws');
});

test('withTempDir cleans up when an async callback rejects', async () => {
  let captured;
  await assert.rejects(
    () => withTempDir(async (dir) => {
      captured = dir;
      await Promise.resolve();
      throw new Error('async boom');
    }),
    /async boom/,
  );
  assert.ok(!fs.existsSync(captured), 'temp dir must be cleaned up when async fn rejects');
});

test('withTempDir honours a custom prefix', async () => {
  await withTempDir((dir) => {
    assert.ok(path.basename(dir).startsWith('with-prefix-'));
  }, { prefix: 'with-prefix-' });
});

test('withTempDir rejects a non-function argument', async () => {
  await assert.rejects(() => withTempDir(null), /requires a callback function/);
});

// --- assertSafeRef ---------------------------------------------------------

test('assertSafeRef accepts valid refs', () => {
  for (const ref of ['main', 'origin/main', 'cs64b/content', 'v1.2.3', 'HEAD', 'feature/x-1', '0123456789abcdef0123456789abcdef01234567']) {
    assert.equal(assertSafeRef(ref), ref, `expected ${ref} to be accepted`);
  }
});

test('assertSafeRef rejects a single-dash ref', () => {
  assert.throws(() => assertSafeRef('-x'), /must not start with a dash/);
});

test('assertSafeRef rejects a double-dash ref', () => {
  assert.throws(() => assertSafeRef('--foo'), /must not start with a dash/);
});

test('assertSafeRef rejects a git-flag-injection ref', () => {
  assert.throws(() => assertSafeRef('--upload-pack=touch /tmp/pwn'), /must not start with a dash/);
});

test('assertSafeRef rejects an empty string', () => {
  assert.throws(() => assertSafeRef(''), /non-empty string/);
});

test('assertSafeRef rejects non-string inputs', () => {
  for (const bad of [undefined, null, 42, {}, [], true]) {
    assert.throws(() => assertSafeRef(bad), /non-empty string/, `expected ${String(bad)} to be rejected`);
  }
});

test('assertSafeRef rejects refs with disallowed characters', () => {
  for (const bad of ['foo bar', 'foo;rm', 'foo$(x)', 'foo\nbar']) {
    assert.throws(() => assertSafeRef(bad), /allowed characters/, `expected ${JSON.stringify(bad)} to be rejected`);
  }
});
