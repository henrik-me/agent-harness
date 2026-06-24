import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * CS64b (C64b-2 / Exit criterion 2): enforce that the shared temp-dir/clone
 * disposer pattern is the single allocation path. Any lib/ module that allocates
 * a temp directory MUST do so through lib/disposers.mjs (makeTempDir/withTempDir)
 * rather than a raw fs.mkdtempSync — so the provenance-safe paired
 * allocation+idempotent-cleanup (LRN-157) lives in exactly one place and future
 * verbs adopt it by default.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIB_DIR = path.join(REPO_ROOT, 'lib');

// lib/disposers.mjs is the one place the raw primitive is allowed to live.
const ALLOWED = new Set(['disposers.mjs']);

function libModules() {
  return readdirSync(LIB_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.mjs') && !ALLOWED.has(e.name))
    .map((e) => e.name);
}

// Strip block + line comments before scanning so a documentation MENTION of the
// forbidden primitive (e.g. a lib/ module stating this very rule) does not
// register as a call site — the guard targets actual allocation calls, not prose
// (Copilot review). A line comment is recognised only when "//" starts the line
// or follows whitespace, so URL content like "https://" (where "//" follows ":")
// is not stripped. Pragmatic heuristic for the current lib/ source, not a full JS
// tokenizer (a "//" inside a string literal after whitespace would be treated as
// a comment) — an accepted limitation for a defence-in-depth build guard whose
// primary enforcement is the convention + code review.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')      // block comments
    .replace(/(^|\s)\/\/.*$/gm, '$1');     // line comments ("//" at line-start or after whitespace)
}

test('no lib/ module allocates a raw temp dir outside lib/disposers.mjs', () => {
  const offenders = [];
  for (const name of libModules()) {
    const src = stripComments(readFileSync(path.join(LIB_DIR, name), 'utf8'));
    if (/\bmkdtemp(Sync)?\s*\(/.test(src)) {
      offenders.push(name);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `These lib/ modules call mkdtemp directly; route temp-dir allocation through ` +
      `lib/disposers.mjs makeTempDir()/withTempDir() instead: ${offenders.join(', ')}`
  );
});

test('the raw-temp-dir guard ignores mkdtempSync named only in a comment', () => {
  // A documentation comment that names the forbidden primitive must NOT trip the
  // guard; a real call site still must.
  const commented = '// Always use makeTempDir, never mkdtempSync().\nexport const x = 1;\n';
  assert.equal(/\bmkdtemp(Sync)?\s*\(/.test(stripComments(commented)), false, 'comment mention must not match');
  const realCall = "const d = mkdtempSync(path.join(os.tmpdir(), 'x'));\n";
  assert.equal(/\bmkdtemp(Sync)?\s*\(/.test(stripComments(realCall)), true, 'real call must still match');
  // A URL on the same line as a real call must NOT be treated as a comment and
  // hide the call ("//" in "https://" follows ":", not whitespace).
  const urlLine = "const u = 'https://x.example'; const d = mkdtempSync();\n";
  assert.equal(/\bmkdtemp(Sync)?\s*\(/.test(stripComments(urlLine)), true, 'URL must not hide a real call');
});

test('lib/disposers.mjs itself provides the disposer primitives', () => {
  const src = readFileSync(path.join(LIB_DIR, 'disposers.mjs'), 'utf8');
  assert.match(src, /export function makeTempDir\b/, 'makeTempDir export missing');
  assert.match(src, /export (async )?function withTempDir\b/, 'withTempDir export missing');
  assert.match(src, /export function assertSafeRef\b/, 'assertSafeRef export missing');
});

test('lib/upgrade.mjs (the lone temp-clone verb) adopts the shared disposer + assertSafeRef', () => {
  const src = readFileSync(path.join(LIB_DIR, 'upgrade.mjs'), 'utf8');
  assert.match(
    src,
    /from '\.\/disposers\.mjs'/,
    'upgrade.mjs must import the shared disposer helpers'
  );
  assert.match(src, /makeTempDir\s*\(/, 'upgrade.mjs must allocate via makeTempDir');
  assert.match(src, /assertSafeRef\s*\(/, 'upgrade.mjs must validate refs via assertSafeRef');
});
