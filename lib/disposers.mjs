/**
 * lib/disposers.mjs — shared temp-dir / clone disposer primitives (CS64b C64b-2).
 *
 * Encodes LRN-157 as a reusable helper rather than per-verb copies. Any verb
 * that allocates a temp directory or git clone should use these primitives so
 * the allocation owns the lifetime of what it creates:
 *
 *   - `makeTempDir()` returns a `{ path, cleanup }` disposer. `cleanup()` is
 *     idempotent and best-effort: it removes ONLY the exact path that was
 *     allocated (captured at creation), never a path-prefix guess. This is the
 *     provenance-safe rule from LRN-157 — a caller-owned fixture that happens to
 *     live under `os.tmpdir()` is never removed.
 *   - `withTempDir(fn)` scopes a temp dir to a callback and ALWAYS cleans up in
 *     a `finally`, on success and on thrown error alike (no leak on either
 *     path).
 *   - `assertSafeRef(ref)` rejects a non-string / empty / leading-dash ref
 *     before it is passed to `git`, closing an argv-injection vector where a
 *     hostile ref like `--upload-pack=…` would be parsed as a flag.
 *
 * Node 20+ stdlib only (no npm deps). The fs seam is injectable for testability
 * while keeping zero-arg ergonomics for callers.
 *
 * @module lib/disposers.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** @typedef {{ path: string, cleanup: () => void }} Disposer */

/**
 * Allocate a fresh temp directory and return a provenance-safe disposer.
 *
 * The returned `cleanup()` removes ONLY the exact directory allocated here
 * (captured in this closure). It is idempotent and best-effort: calling it more
 * than once, or after the directory was already removed externally, never
 * throws. It never path-prefix-guesses, so a caller-owned path is never removed
 * (LRN-157).
 *
 * @param {string} [prefix='harness-'] - mkdtemp prefix placed under os.tmpdir().
 * @param {object} [opts]
 * @param {typeof fs} [opts.fs=fs] - injectable fs seam for tests.
 * @returns {Disposer} the allocated dir path + an idempotent cleanup disposer.
 */
export function makeTempDir(prefix = 'harness-', { fs: fsImpl = fs } = {}) {
  if (typeof prefix !== 'string') {
    throw new TypeError(`makeTempDir prefix must be a string, got ${typeof prefix}`);
  }
  // Defense-in-depth (CS64b Copilot review + R9): the mkdtemp template must sit
  // DIRECTLY inside os.tmpdir(), so neither the allocation nor the recursive
  // cleanup can escape it. Asserting the template's parent === os.tmpdir()
  // rejects path separators, '..', and absolute paths AND the empty/'.' prefixes
  // that collapse path.join back to os.tmpdir() itself (whose mkdtemp would then
  // create a *sibling* of tmpdir, not a child).
  const tmpRoot = os.tmpdir();
  const stem = path.join(tmpRoot, prefix);
  if (path.dirname(stem) !== tmpRoot) {
    throw new Error(
      `makeTempDir prefix must be a simple basename that resolves directly under ` +
      `os.tmpdir(); got ${JSON.stringify(prefix)}`
    );
  }
  // Capture the exact allocated path; cleanup removes only this, never a guess.
  const dir = fsImpl.mkdtempSync(stem);
  let removed = false;
  const cleanup = () => {
    if (removed) return;
    removed = true;
    try {
      fsImpl.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best-effort: never throw from cleanup, never mask the primary result */
    }
  };
  return { path: dir, cleanup };
}

/**
 * Scope a temp directory to a callback. The directory is allocated, passed to
 * `fn`, and ALWAYS removed in a `finally` — on success AND when `fn` throws or
 * rejects (no leak on either path). Returns whatever `fn` returns/resolves to.
 *
 * @template T
 * @param {(dir: string) => (T | Promise<T>)} fn - receives the temp dir path.
 * @param {object} [opts]
 * @param {string} [opts.prefix='harness-'] - mkdtemp prefix under os.tmpdir().
 * @param {typeof fs} [opts.fs=fs] - injectable fs seam for tests.
 * @returns {Promise<T>} the result of awaiting `fn(dir)`.
 */
export async function withTempDir(fn, { prefix = 'harness-', fs: fsImpl = fs } = {}) {
  if (typeof fn !== 'function') {
    throw new TypeError(`withTempDir requires a callback function, got ${typeof fn}`);
  }
  const { path: dir, cleanup } = makeTempDir(prefix, { fs: fsImpl });
  try {
    return await fn(dir);
  } finally {
    cleanup();
  }
}

/**
 * Allowed git refs: tags, branches, and 40-char SHAs that begin with an
 * alphanumeric. Requiring a leading alphanumeric is what blocks a leading-dash
 * ref (e.g. `-foo`, `--upload-pack=…`) from being parsed as a `git` flag.
 */
const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

/**
 * Assert that `ref` is safe to pass to `git` as a tree-ish argument. Throws a
 * clear `Error` if `ref` is not a non-empty string or begins with a dash
 * (single `-` or `--`), closing an argv-injection vector (LRN-157). Valid refs
 * like `main`, `origin/main`, `cs64b/content`, `v1.2.3`, `HEAD` pass through.
 *
 * @param {unknown} ref - candidate git ref.
 * @returns {string} the validated ref (for convenient inline use).
 * @throws {Error} if the ref is empty, not a string, or starts with a dash.
 */
export function assertSafeRef(ref) {
  if (typeof ref !== 'string' || ref.length === 0) {
    throw new Error(`unsafe git ref: expected a non-empty string, got ${ref === '' ? "''" : typeof ref}`);
  }
  if (/^-/.test(ref)) {
    throw new Error(`unsafe git ref "${ref}": must not start with a dash (could be parsed as a git flag)`);
  }
  if (!SAFE_REF.test(ref)) {
    throw new Error(`unsafe git ref "${ref}": allowed characters are alphanumerics and ._/- (must start alphanumeric)`);
  }
  return ref;
}
