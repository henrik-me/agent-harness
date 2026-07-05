/**
 * tests/cs86-dispatch-preamble-relocation.test.mjs — CS86 (C86-2 / C86-4).
 *
 * The sub-agent briefing preamble SOURCE was relocated out of OPERATIONS.md into
 * a new harness-owned MANAGED root doc, DISPATCH-PREAMBLE.md. `harness dispatch`
 * now resolves its source consumer-root-relative (LRN-050), preferring
 * DISPATCH-PREAMBLE.md and falling back to the legacy inline-fenced OPERATIONS.md
 * for a pre-`sync --apply-new` consumer (C86-4). These tests assert:
 *   - BYTE-EQUALITY: the briefing emitted from the NEW file is byte-identical to
 *     frozen golden baselines (node/dotnet x fenced/no-fence). The relocation
 *     must not change a single byte of dispatch output.
 *   - resolution precedence: the new file wins when both sources are present.
 *   - fallback: the legacy OPERATIONS.md resolves when the new file is absent,
 *     and (pre-thinning) yields byte-identical output.
 *   - fail-closed: a present-but-malformed new file surfaces extractPreamble's
 *     error and is NOT silently masked by a valid OPERATIONS.md alongside it.
 *   - a clear error naming BOTH paths + `sync --apply-new` when neither exists.
 *   - consumer-root-relative resolution using committed fixture dirs as cwd.
 *   - the wired CLI (`bin/harness.mjs dispatch`) emits the golden bytes and
 *     falls back / fails closed correctly in a synthetic consumer checkout.
 *
 * Golden values are raw-LF stdout byte length + MD5, measured via the CLI (no
 * shell re-encoding). Because emitBriefing() always ends its output with a
 * single '\n' and cmdDispatch writes it without appending another, the CLI
 * stdout bytes equal the emit-string bytes exactly, so the same goldens pin
 * both the library helpers and the CLI. Regenerate ONLY after an intentional
 * `### Mandatory briefing preamble` edit, from the repo root:
 *   node --input-type=module -e "const c=await import('node:child_process');const h=await import('node:crypto');for(const a of [[],['--no-fence'],['--language-profile','dotnet'],['--language-profile','dotnet','--no-fence']]){const o=c.execFileSync('node',['bin/harness.mjs','dispatch',...a]);console.log(a.join(' '),o.length,h.createHash('md5').update(o).digest('hex').toUpperCase());}"
 *
 * Committed fixtures under tests/fixtures/cs86-dispatch/ are READABILITY-ONLY:
 * resolvePreambleSource reads each candidate to probe readability (discriminating
 * ENOENT) but does not parse its content, so the fixtures are minimal readable
 * stubs. Content-level scratch is created under os.tmpdir() and removed in a
 * finally — never under the repo root.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  resolvePreambleSource,
  emitBriefingFromDir,
  emitBriefingFromFile,
  PREAMBLE_SOURCE_BASENAME,
  LEGACY_PREAMBLE_SOURCE_BASENAME,
} from '../lib/dispatch.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const BIN = path.join(REPO_ROOT, 'bin', 'harness.mjs');
const NEW_SRC = path.join(REPO_ROOT, PREAMBLE_SOURCE_BASENAME); // DISPATCH-PREAMBLE.md
const LEGACY_SRC = path.join(REPO_ROOT, LEGACY_PREAMBLE_SOURCE_BASENAME); // OPERATIONS.md
const FIXTURES = path.join(__dirname, 'fixtures', 'cs86-dispatch');

// ---------------------------------------------------------------------------
// Golden baselines — raw-LF dispatch output (byte length + MD5). Freezing these
// makes the OPERATIONS.md -> DISPATCH-PREAMBLE.md relocation a provable no-op on
// emitted bytes.
// ---------------------------------------------------------------------------
const GOLDEN = {
  'node,fence': { bytes: 6295, md5: '71FF954B3F15DB1E94477213B368CCEB', args: [] },
  'node,nofence': { bytes: 6283, md5: '58D2F935BD5D2D10C6E389DD30CC45E8', args: ['--no-fence'] },
  'dotnet,fence': {
    bytes: 6016,
    md5: '76C7F4976CAFA8D50ABAECDE75932A46',
    args: ['--language-profile', 'dotnet'],
  },
  'dotnet,nofence': {
    bytes: 6004,
    md5: '7FB1CFB63A0930D59C69543F09A75FA1',
    args: ['--language-profile', 'dotnet', '--no-fence'],
  },
};

/** MD5 (upper hex) of a string's UTF-8 bytes. */
function md5Utf8(str) {
  return createHash('md5').update(Buffer.from(str, 'utf8')).digest('hex').toUpperCase();
}

/** MD5 (upper hex) of a raw byte Buffer. */
function md5Buf(buf) {
  return createHash('md5').update(buf).digest('hex').toUpperCase();
}

/** Map dispatch CLI args -> the emitBriefingFromDir/File option shape. */
function emitOpts(args) {
  const includeFence = !args.includes('--no-fence');
  const i = args.indexOf('--language-profile');
  const languageProfile = i >= 0 ? args[i + 1] : undefined;
  return { includeFence, languageProfile };
}

/** mkdtemp scratch dir in os.tmpdir(), run fn(dir), always rm -rf afterwards. */
function withTmp(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'cs86-dispatch-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Copy a source doc into `dir/basename`, normalized to no-BOM LF. */
function placeLF(dir, basename, srcPath) {
  const raw = readFileSync(srcPath, 'utf8')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n');
  writeFileSync(path.join(dir, basename), raw, 'utf8');
}

// ---------------------------------------------------------------------------
// (a) BYTE-EQUALITY — the NEW file, in isolation, reproduces every golden.
// ---------------------------------------------------------------------------
for (const [key, g] of Object.entries(GOLDEN)) {
  test(`byte-equality: an isolated DISPATCH-PREAMBLE.md emits golden (${key})`, () => {
    withTmp((dir) => {
      placeLF(dir, PREAMBLE_SOURCE_BASENAME, NEW_SRC);
      const out = emitBriefingFromDir({ cwd: dir, ...emitOpts(g.args) });
      assert.equal(Buffer.byteLength(out, 'utf8'), g.bytes, `${key}: byte length`);
      assert.equal(md5Utf8(out), g.md5, `${key}: md5`);
    });
  });
}

// ---------------------------------------------------------------------------
// (c) FALLBACK PARITY — a legacy OPERATIONS.md (with fences), in isolation,
// emits the identical goldens. Uses the new file's fenced content renamed to
// OPERATIONS.md so it stays green after cs86-docs thins the real OPERATIONS.md
// (extractPreamble anchors on the heading + fence, ignoring the managed header).
// ---------------------------------------------------------------------------
for (const [key, g] of Object.entries(GOLDEN)) {
  test(`fallback parity: an isolated legacy OPERATIONS.md emits golden (${key})`, () => {
    withTmp((dir) => {
      placeLF(dir, LEGACY_PREAMBLE_SOURCE_BASENAME, NEW_SRC);
      const out = emitBriefingFromDir({ cwd: dir, ...emitOpts(g.args) });
      assert.equal(Buffer.byteLength(out, 'utf8'), g.bytes, `${key}: byte length`);
      assert.equal(md5Utf8(out), g.md5, `${key}: md5`);
    });
  });
}

test('C86-4: the current on-repo OPERATIONS.md still emits golden via fallback (until thinned)', (t) => {
  const raw = readFileSync(LEGACY_SRC, 'utf8');
  if (!raw.includes('## CRITICAL PREFLIGHT (LRN-021)')) {
    t.skip('OPERATIONS.md preamble fences already relocated/thinned (CS86 T2)');
    return;
  }
  withTmp((dir) => {
    placeLF(dir, LEGACY_PREAMBLE_SOURCE_BASENAME, LEGACY_SRC);
    const out = emitBriefingFromDir({ cwd: dir, includeFence: true });
    assert.equal(md5Utf8(out), GOLDEN['node,fence'].md5);
  });
});

// ---------------------------------------------------------------------------
// (b)/(c)/(d)/(e) RESOLUTION — consumer-root-relative, existence-based, using
// committed presence-only fixture dirs as cwd.
// ---------------------------------------------------------------------------
test('resolution (fixture cwd): prefers DISPATCH-PREAMBLE.md when both exist', () => {
  const dir = path.join(FIXTURES, 'synced-consumer');
  assert.equal(resolvePreambleSource({ cwd: dir }), path.join(dir, PREAMBLE_SOURCE_BASENAME));
});

test('resolution (fixture cwd): falls back to OPERATIONS.md when the new file is absent', () => {
  const dir = path.join(FIXTURES, 'legacy-consumer');
  assert.equal(
    resolvePreambleSource({ cwd: dir }),
    path.join(dir, LEGACY_PREAMBLE_SOURCE_BASENAME)
  );
});

test('resolution (fixture cwd): throws naming both paths + `sync --apply-new` when neither exists', () => {
  const dir = path.join(FIXTURES, 'empty-consumer');
  assert.throws(
    () => resolvePreambleSource({ cwd: dir }),
    (err) => {
      assert.match(err.message, /sync --apply-new/);
      assert.match(err.message, /DISPATCH-PREAMBLE\.md/);
      assert.match(err.message, /OPERATIONS\.md/);
      return true;
    }
  );
});

test('resolution (tmpdir): throws for a dir containing neither source', () => {
  withTmp((dir) => {
    assert.throws(() => resolvePreambleSource({ cwd: dir }), /sync --apply-new/);
  });
});

test('resolvePreambleSource: rejects a missing/empty cwd', () => {
  assert.throws(() => resolvePreambleSource(), /cwd/);
  assert.throws(() => resolvePreambleSource({}), /cwd/);
  assert.throws(() => resolvePreambleSource({ cwd: '' }), /cwd/);
});

// ---------------------------------------------------------------------------
// PRECEDENCE (content) — a valid new file wins over a malformed legacy.
// ---------------------------------------------------------------------------
test('precedence: a valid new file is used even when a malformed OPERATIONS.md sits alongside', () => {
  withTmp((dir) => {
    placeLF(dir, PREAMBLE_SOURCE_BASENAME, NEW_SRC);
    writeFileSync(
      path.join(dir, LEGACY_PREAMBLE_SOURCE_BASENAME),
      '# thinned OPERATIONS.md — no preamble fences here\n',
      'utf8'
    );
    const out = emitBriefingFromDir({ cwd: dir, includeFence: true });
    assert.equal(md5Utf8(out), GOLDEN['node,fence'].md5);
  });
});

// ---------------------------------------------------------------------------
// (d) FAIL-CLOSED — a present-but-malformed new file surfaces extractPreamble's
// error; it must NEVER silently fall back to a valid OPERATIONS.md alongside.
// ---------------------------------------------------------------------------
test('fail-closed: a malformed DISPATCH-PREAMBLE.md throws (no silent fallback to a valid OPERATIONS.md)', () => {
  withTmp((dir) => {
    writeFileSync(
      path.join(dir, PREAMBLE_SOURCE_BASENAME),
      '# broken preamble\n\nno mandatory-briefing heading, no ```text fence\n',
      'utf8'
    );
    placeLF(dir, LEGACY_PREAMBLE_SOURCE_BASENAME, NEW_SRC); // a VALID legacy alongside
    // The resolver returns the (malformed) new file, not the valid legacy:
    assert.equal(
      resolvePreambleSource({ cwd: dir }),
      path.join(dir, PREAMBLE_SOURCE_BASENAME)
    );
    // ...and emit surfaces extractPreamble's error rather than masking it:
    assert.throws(
      () => emitBriefingFromDir({ cwd: dir, includeFence: true }),
      /canonical preamble heading not found/
    );
  });
});

// ---------------------------------------------------------------------------
// (Copilot #486) NON-ENOENT FAIL-CLOSED — a present-but-unreadable primary must
// surface, never be treated as "missing". existsSync() returns false on EACCES
// too, so the resolver reads + discriminates ENOENT (lib/closeout.mjs readdirSafe
// pattern; PR #299) rather than gating on existsSync.
// ---------------------------------------------------------------------------
test('fail-closed: a non-ENOENT error at the primary source surfaces (no silent fallback to a valid OPERATIONS.md)', () => {
  withTmp((dir) => {
    // A DIRECTORY at the primary path makes readFileSync throw a non-ENOENT
    // error (EISDIR). existsSync() would report it "present" (the old gate would
    // return it); a readFileSync-discriminating resolver must surface the failure
    // rather than silently choosing the valid legacy OPERATIONS.md alongside.
    mkdirSync(path.join(dir, PREAMBLE_SOURCE_BASENAME));
    placeLF(dir, LEGACY_PREAMBLE_SOURCE_BASENAME, NEW_SRC); // a VALID legacy alongside
    assert.throws(
      () => resolvePreambleSource({ cwd: dir }),
      (err) => err && err.code !== 'ENOENT' && !/sync --apply-new/.test(err.message)
    );
  });
});

// ---------------------------------------------------------------------------
// WIRING — emitBriefingFromDir == emitBriefingFromFile(resolvePreambleSource).
// ---------------------------------------------------------------------------
test('emitBriefingFromDir composes resolvePreambleSource + emitBriefingFromFile', () => {
  withTmp((dir) => {
    placeLF(dir, PREAMBLE_SOURCE_BASENAME, NEW_SRC);
    const viaDir = emitBriefingFromDir({ cwd: dir, includeFence: false, languageProfile: 'dotnet' });
    const viaFile = emitBriefingFromFile({
      operationsPath: path.join(dir, PREAMBLE_SOURCE_BASENAME),
      includeFence: false,
      languageProfile: 'dotnet',
    });
    assert.equal(viaDir, viaFile);
  });
});

test('exports: preamble-source basename constants have their documented values', () => {
  assert.equal(PREAMBLE_SOURCE_BASENAME, 'DISPATCH-PREAMBLE.md');
  assert.equal(LEGACY_PREAMBLE_SOURCE_BASENAME, 'OPERATIONS.md');
  assert.equal(typeof resolvePreambleSource, 'function');
  assert.equal(typeof emitBriefingFromDir, 'function');
});

// ---------------------------------------------------------------------------
// CLI (end-to-end) — the wired `harness dispatch` emits golden bytes from the
// on-repo DISPATCH-PREAMBLE.md, and behaves correctly in synthetic consumers.
// stdout is LF-normalized before hashing so a CRLF checkout of the source doc
// on Windows still asserts the canonical LF baseline.
// ---------------------------------------------------------------------------
for (const [key, g] of Object.entries(GOLDEN)) {
  test(`CLI: \`harness dispatch ${g.args.join(' ')}\` emits golden from the wired source (${key})`, () => {
    const res = spawnSync(process.execPath, [BIN, 'dispatch', ...g.args], { cwd: REPO_ROOT });
    assert.equal(res.status, 0, res.stderr?.toString('utf8'));
    const outLF = Buffer.from(res.stdout.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
    assert.equal(outLF.length, g.bytes, `${key}: byte length`);
    assert.equal(md5Buf(outLF), g.md5, `${key}: md5`);
  });
}

test('CLI: falls back to OPERATIONS.md in a pre-`sync --apply-new` consumer checkout', () => {
  withTmp((dir) => {
    placeLF(dir, LEGACY_PREAMBLE_SOURCE_BASENAME, NEW_SRC); // only the legacy source present
    const res = spawnSync(process.execPath, [BIN, 'dispatch'], { cwd: dir });
    assert.equal(res.status, 0, res.stderr?.toString('utf8'));
    const outLF = res.stdout.toString('utf8').replace(/\r\n/g, '\n');
    assert.equal(md5Utf8(outLF), GOLDEN['node,fence'].md5);
  });
});

test('CLI: fails closed with a clear error + exit 1 when no source is present', () => {
  withTmp((dir) => {
    const res = spawnSync(process.execPath, [BIN, 'dispatch'], { cwd: dir });
    assert.equal(res.status, 1);
    assert.match(res.stderr.toString('utf8'), /sync --apply-new/);
  });
});
