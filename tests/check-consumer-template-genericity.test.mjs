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
const NODE = process.execPath;

// Scope-set destinations (relative to the temp --cwd), keyed for overrides.
const SCOPE = {
  instructions: ['template', 'composed', 'INSTRUCTIONS.md'],
  copilot: ['template', 'composed', '.github', 'copilot-instructions.md'],
  tracking: ['template', 'managed', 'TRACKING.md'],
  retro: ['template', 'managed', 'RETROSPECTIVES.md'],
  readme: ['template', 'managed', 'READMEGUIDE.md'],
};

const CLEAN_FILES = {
  instructions: path.join(CLEAN, 'INSTRUCTIONS.md'),
  copilot: path.join(CLEAN, 'copilot-instructions.md'),
  tracking: path.join(CLEAN, 'TRACKING.md'),
  retro: path.join(CLEAN, 'RETROSPECTIVES.md'),
  readme: path.join(CLEAN, 'READMEGUIDE.md'),
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
 * Run the linter. Pass { cwd: false } to omit the --cwd flag entirely.
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
