/**
 * tests/check-consumer-template-genericity.test.mjs
 *   — Tests for scripts/check-consumer-template-genericity.mjs (CS72 / C72-3).
 *
 * Uses node:test (consistent with existing test files) and spawns the linter
 * via spawnSync. Each case builds a temporary --cwd under os.tmpdir() (LRN-094:
 * runtime scratch never touches REPO_ROOT) mirroring the scope-set layout,
 * seeded from the static fixtures under tests/fixtures/cs72/.
 *
 * Run: node --test tests/check-consumer-template-genericity.test.mjs
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const LINTER = path.join(REPO_ROOT, 'scripts', 'check-consumer-template-genericity.mjs');
const CLEAN = path.join(__dirname, 'fixtures', 'cs72', 'clean');
const VARIANTS = path.join(__dirname, 'fixtures', 'cs72', 'variants');
// CS83 (C83-5): the invocation-scan fixtures (broader scope: process bases too).
const CS83_CLEAN = path.join(__dirname, 'fixtures', 'cs83-genericity-invocation', 'clean');
const CS83_VARIANTS = path.join(__dirname, 'fixtures', 'cs83-genericity-invocation', 'variants');
const NODE = process.execPath;

// Scope-set destinations (relative to the temp --cwd), keyed for overrides.
// The first five are the anchor scope; operations/reviews/conventions extend
// the tree to the broader CS83 invocation scope so buildCwd seeds a valid tree.
const SCOPE = {
  instructions: ['template', 'composed', 'INSTRUCTIONS.md'],
  copilot: ['template', 'composed', '.github', 'copilot-instructions.md'],
  tracking: ['template', 'managed', 'TRACKING.md'],
  retro: ['template', 'managed', 'RETROSPECTIVES.md'],
  readme: ['template', 'managed', 'READMEGUIDE.md'],
  operations: ['template', 'composed', 'OPERATIONS.md'],
  reviews: ['template', 'composed', 'REVIEWS.md'],
  conventions: ['template', 'composed', 'CONVENTIONS.md'],
};

const CLEAN_FILES = {
  instructions: path.join(CLEAN, 'INSTRUCTIONS.md'),
  copilot: path.join(CLEAN, 'copilot-instructions.md'),
  tracking: path.join(CLEAN, 'TRACKING.md'),
  retro: path.join(CLEAN, 'RETROSPECTIVES.md'),
  readme: path.join(CLEAN, 'READMEGUIDE.md'),
  operations: path.join(CS83_CLEAN, 'OPERATIONS.md'),
  reviews: path.join(CS83_CLEAN, 'REVIEWS.md'),
  conventions: path.join(CS83_CLEAN, 'CONVENTIONS.md'),
};

const tmpDirs = [];

/**
 * Build a temp --cwd seeded with the clean baseline, then apply overrides
 * (key -> absolute fixture path). Returns the temp dir.
 *
 * @param {Record<string,string>} [overrides]
 * @returns {string}
 */
function buildCwd(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs72-genericity-'));
  tmpDirs.push(dir);
  for (const [key, segments] of Object.entries(SCOPE)) {
    const src = overrides[key] ?? CLEAN_FILES[key];
    const dest = path.join(dir, ...segments);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
  return dir;
}

/**
 * Run the linter with the given CLI args (omit `--cwd` by leaving it out of `args`).
 *
 * @param {string[]} [args]
 * @returns {{ stdout: string, stderr: string, status: number }}
 */
function runLinter(args = []) {
  const result = spawnSync(NODE, [LINTER, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? -1,
  };
}

after(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------

describe('check-consumer-template-genericity', () => {
  it('(a) passes (exit 0) on an all-clean scope set', () => {
    const dir = buildCwd();
    const { status, stdout } = runLinter(['--cwd', dir]);
    assert.equal(status, 0);
    assert.match(stdout, /✅ Linter passed/);
  });

  it('(b1) fails (exit 1) on a bare LRN-<digits> token', () => {
    const dir = buildCwd({ tracking: path.join(VARIANTS, 'TRACKING-lrn.md') });
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(stderr, /template\/managed\/TRACKING\.md:\d+: LRN-068/);
    assert.match(stderr, /❌ Linter FAILED/);
  });

  it('(b2) fails (exit 1) on a bare CS<digits> token', () => {
    const dir = buildCwd({ tracking: path.join(VARIANTS, 'TRACKING-cs.md') });
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(stderr, /template\/managed\/TRACKING\.md:\d+: CS54/);
  });

  it('(b3) fails (exit 1) on a LEARNINGS.md#lrn- link in a composed base', () => {
    const dir = buildCwd({ copilot: path.join(VARIANTS, 'copilot-learnings-anchor.md') });
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(stderr, /copilot-instructions\.md:\d+: LEARNINGS\.md#lrn-068/);
  });

  it('(b4) fails (exit 1) on the henrik-me/agent-harness slug', () => {
    const dir = buildCwd({ instructions: path.join(VARIANTS, 'INSTRUCTIONS-slug.md') });
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(stderr, /template\/composed\/INSTRUCTIONS\.md:\d+: henrik-me\/agent-harness/);
  });

  it('(b4b) fails (exit 1) on a case-variant slug (GitHub slugs are case-insensitive)', () => {
    const dir = buildCwd({ instructions: path.join(VARIANTS, 'INSTRUCTIONS-slug-mixedcase.md') });
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(stderr, /template\/composed\/INSTRUCTIONS\.md:\d+: Henrik-Me\/agent-harness/);
  });

  it('(c) FAILS (exit 1) on a banned ref inside a local-block body — the default body ships to consumers', () => {
    const dir = buildCwd({ instructions: path.join(VARIANTS, 'INSTRUCTIONS-ref-in-localblock.md') });
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(stderr, /template\/composed\/INSTRUCTIONS\.md:\d+: LRN-068/);
    assert.match(stderr, /template\/composed\/INSTRUCTIONS\.md:\d+: CS54/);
    assert.match(stderr, /❌ Linter FAILED/);
  });

  it('(d) fail-closed: still catches refs around a malformed/unclosed marker (exit 1)', () => {
    const dir = buildCwd({ instructions: path.join(VARIANTS, 'INSTRUCTIONS-unclosed-marker.md') });
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    // The parse error is surfaced (not silently swallowed)...
    assert.match(stderr, /composed parse error \(ECOMPOSED_UNCLOSED\)/);
    // ...and the whole-file fallback still catches both the template-region ref
    // and the ref that the broken marker would have "hidden".
    assert.match(stderr, /LRN-068/);
    assert.match(stderr, /CS54/);
  });

  it('(e) exits 2 on bad CLI usage (--cwd with no value)', () => {
    const { status, stderr } = runLinter(['--cwd']);
    assert.equal(status, 2);
    assert.match(stderr, /missing value for --cwd/);
  });

  it('(e2) exits 2 on an unknown flag', () => {
    const { status, stderr } = runLinter(['--bogus']);
    assert.equal(status, 2);
    assert.match(stderr, /unknown flag/);
  });

  it('(f) --allow exempts an exact token (exit 0)', () => {
    const dir = buildCwd({ tracking: path.join(VARIANTS, 'TRACKING-allow.md') });
    const failed = runLinter(['--cwd', dir]);
    assert.equal(failed.status, 1, 'CS999 is flagged without --allow');
    const allowed = runLinter(['--cwd', dir, '--allow', 'CS999']);
    assert.equal(allowed.status, 0);
    assert.match(allowed.stdout, /✅ Linter passed/);
  });

  it('(g) --quiet suppresses success stdout but keeps exit 0', () => {
    const dir = buildCwd();
    const { status, stdout } = runLinter(['--cwd', dir, '--quiet']);
    assert.equal(status, 0);
    assert.equal(stdout.trim(), '');
  });

  it('(h) --quiet still reports errors to stderr (exit 1)', () => {
    const dir = buildCwd({ tracking: path.join(VARIANTS, 'TRACKING-lrn.md') });
    const { status, stderr } = runLinter(['--cwd', dir, '--quiet']);
    assert.equal(status, 1);
    assert.match(stderr, /LRN-068/);
  });

  it('(i) fail-closed: a missing in-scope doc is an error (exit 1)', () => {
    const dir = buildCwd();
    fs.rmSync(path.join(dir, ...SCOPE.tracking));
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(stderr, /template\/managed\/TRACKING\.md: cannot read file/);
  });

  it('(j) does not false-positive on LRN-NNN / CSNN placeholders in clean docs', () => {
    // The clean RETROSPECTIVES fixture intentionally contains LRN-NNN, LRN-<NNN>,
    // and ^LRN-[0-9]{3,}$ placeholders that must NOT be flagged.
    const dir = buildCwd();
    const { status } = runLinter(['--cwd', dir]);
    assert.equal(status, 0);
  });
});

// ---------------------------------------------------------------------------
// CS83 / C83-5 — the INVOCATION scan. A second, orthogonal scan that bans
// consumer-invalid harness-repo run commands (`node bin/harness.mjs …` /
// `node scripts/<x>.mjs …`) across the broader invocation scope set (the five
// anchor docs + OPERATIONS.md + REVIEWS.md + CONVENTIONS.md). The anchor scan is
// unchanged; these cases exercise only the invocation scan.
// ---------------------------------------------------------------------------

describe('check-consumer-template-genericity — invocation scan (CS83 / C83-5)', () => {
  it('(k1) fails (exit 1) on a `node bin/harness.mjs` invocation in OPERATIONS.md', () => {
    const dir = buildCwd({ operations: path.join(CS83_VARIANTS, 'OPERATIONS-invocation-bin.md') });
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(stderr, /template\/composed\/OPERATIONS\.md:\d+: node bin\/harness\.mjs/);
    assert.match(stderr, /❌ Linter FAILED/);
  });

  it('(k2) fails (exit 1) on a `node scripts/<x>.mjs` invocation in OPERATIONS.md', () => {
    const dir = buildCwd({ operations: path.join(CS83_VARIANTS, 'OPERATIONS-invocation-script.md') });
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(
      stderr,
      /template\/composed\/OPERATIONS\.md:\d+: node scripts\/check-consumer-template-genericity\.mjs/,
    );
  });

  it('(k3) catches an invocation inside a default local-block body (whole-file scan)', () => {
    const dir = buildCwd({
      operations: path.join(CS83_VARIANTS, 'OPERATIONS-invocation-in-localblock.md'),
    });
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(stderr, /template\/composed\/OPERATIONS\.md:\d+: node bin\/harness\.mjs/);
  });

  it('(k4) covers REVIEWS.md (a composed process base in the invocation scope)', () => {
    const dir = buildCwd({ reviews: path.join(CS83_VARIANTS, 'REVIEWS-invocation.md') });
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(stderr, /template\/composed\/REVIEWS\.md:\d+: node bin\/harness\.mjs/);
  });

  it('(k5) covers CONVENTIONS.md (a composed process base in the invocation scope)', () => {
    const dir = buildCwd({ conventions: path.join(CS83_VARIANTS, 'CONVENTIONS-invocation.md') });
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(
      stderr,
      /template\/composed\/CONVENTIONS\.md:\d+: node scripts\/check-text-encoding\.mjs/,
    );
  });

  it('(k6) covers the shared onboarding docs — an invocation in INSTRUCTIONS.md fails', () => {
    const dir = buildCwd({ instructions: path.join(CS83_VARIANTS, 'INSTRUCTIONS-invocation.md') });
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(stderr, /template\/composed\/INSTRUCTIONS\.md:\d+: node bin\/harness\.mjs/);
  });

  it('(l) does NOT flag prose/backtick source-refs, {{harness_invoke}}, or `node --test` (exit 0)', () => {
    const dir = buildCwd({ operations: path.join(CS83_VARIANTS, 'OPERATIONS-prose-only.md') });
    const { status, stdout } = runLinter(['--cwd', dir]);
    assert.equal(status, 0);
    assert.match(stdout, /✅ Linter passed/);
  });

  it('(m) reports ONLY the invocation — legit CS/LRN tokens stay unflagged (orthogonal scopes)', () => {
    // OPERATIONS-invocation-bin.md carries a real invocation AND CS83 / LRN-170
    // tokens. Only the invocation is reported; the CS/LRN tokens are banned solely
    // by the anchor scan, whose scope excludes OPERATIONS.md.
    const dir = buildCwd({ operations: path.join(CS83_VARIANTS, 'OPERATIONS-invocation-bin.md') });
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(stderr, /node bin\/harness\.mjs/);
    assert.doesNotMatch(stderr, /CS83/);
    assert.doesNotMatch(stderr, /LRN-170/);
  });

  it('(n) the default all-clean tree — OPERATIONS.md carrying CS/LRN + {{harness_invoke}} — passes', () => {
    const dir = buildCwd();
    const { status, stdout } = runLinter(['--cwd', dir]);
    assert.equal(status, 0);
    assert.match(stdout, /✅ Linter passed/);
  });

  it('(o) --allow exempts an exact invocation token (exit 0)', () => {
    const dir = buildCwd({ operations: path.join(CS83_VARIANTS, 'OPERATIONS-invocation-bin.md') });
    const failed = runLinter(['--cwd', dir]);
    assert.equal(failed.status, 1, 'the invocation is flagged without --allow');
    const allowed = runLinter(['--cwd', dir, '--allow', 'node bin/harness.mjs']);
    assert.equal(allowed.status, 0);
    assert.match(allowed.stdout, /✅ Linter passed/);
  });

  it('(p) fail-closed: a missing invocation-only doc (REVIEWS.md) is an error (exit 1)', () => {
    const dir = buildCwd();
    fs.rmSync(path.join(dir, ...SCOPE.reviews));
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(stderr, /template\/composed\/REVIEWS\.md: cannot read file/);
  });

  it('(q) marker-validates an invocation-only composed base — a malformed OPERATIONS.md marker is surfaced (exit 1)', () => {
    const dir = buildCwd({ operations: path.join(CS83_VARIANTS, 'OPERATIONS-unclosed-marker.md') });
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    // OPERATIONS.md is composed and invocation-only (outside the anchor scope);
    // the invocation scan marker-validates it via scanComposed, so an unclosed
    // marker is surfaced as a parse error, and the whole-file fallback still
    // catches the invocation the broken marker would otherwise hide.
    assert.match(stderr, /composed parse error \(ECOMPOSED_UNCLOSED\)/);
    assert.match(stderr, /template\/composed\/OPERATIONS\.md:\d+: node bin\/harness\.mjs/);
  });
});

// ---------------------------------------------------------------------------
// CS88 / C88-4 — the check-readme.mjs reference ban. An extension of the
// invocation scan (a third INVOCATION_PATTERN): a consumer has no local
// `check-readme.mjs` script — they run the README linter via
// `{{harness_invoke}} lint` — so a `scripts/check-readme.mjs` path OR a bare
// `check-readme.mjs` name in any consumer-shipped scope doc (e.g. the managed
// READMEGUIDE.md) is flagged (issue #381 / CS83 residual). Variant content is
// written straight into the temp --cwd (like the fs.rmSync cases above), so no
// static fixture file is needed and repo-root scratch is never touched (LRN-094).
// ---------------------------------------------------------------------------

describe('check-consumer-template-genericity — check-readme.mjs ref ban (CS88 / C88-4)', () => {
  it('(r1) fails (exit 1) on a `scripts/check-readme.mjs` path in READMEGUIDE.md', () => {
    const dir = buildCwd();
    fs.writeFileSync(
      path.join(dir, ...SCOPE.readme),
      '# README guide\n\nThe harness linter (`scripts/check-readme.mjs`) enforces every rule.\n',
    );
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(stderr, /template\/managed\/READMEGUIDE\.md:\d+: check-readme\.mjs/);
    assert.match(stderr, /❌ Linter FAILED/);
  });

  it('(r2) fails (exit 1) on a bare `check-readme.mjs` name in READMEGUIDE.md', () => {
    const dir = buildCwd();
    fs.writeFileSync(
      path.join(dir, ...SCOPE.readme),
      '# README guide\n\nThe sections map directly to what `check-readme.mjs` enforces.\n',
    );
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(stderr, /template\/managed\/READMEGUIDE\.md:\d+: check-readme\.mjs/);
  });

  it('(r3) passes (exit 0) on the generic `{{harness_invoke}} lint` README-linter form (no false positive)', () => {
    const dir = buildCwd();
    fs.writeFileSync(
      path.join(dir, ...SCOPE.readme),
      '# README guide\n\nThe harness README linter (part of `{{harness_invoke}} lint`) enforces every rule.\n',
    );
    const { status, stdout } = runLinter(['--cwd', dir]);
    assert.equal(status, 0);
    assert.match(stdout, /✅ Linter passed/);
  });

  it('(r4) --allow exempts the exact check-readme.mjs token (exit 0)', () => {
    const dir = buildCwd();
    fs.writeFileSync(
      path.join(dir, ...SCOPE.readme),
      '# README guide\n\nThe sections map to what `check-readme.mjs` enforces.\n',
    );
    const failed = runLinter(['--cwd', dir]);
    assert.equal(failed.status, 1, 'check-readme.mjs is flagged without --allow');
    const allowed = runLinter(['--cwd', dir, '--allow', 'check-readme.mjs']);
    assert.equal(allowed.status, 0);
    assert.match(allowed.stdout, /✅ Linter passed/);
  });
});
