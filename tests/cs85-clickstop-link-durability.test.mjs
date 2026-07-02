/**
 * tests/cs85-clickstop-link-durability.test.mjs
 *   — Tests for scripts/check-clickstop-link-durability.mjs (CS85 / C85-2, C85-3).
 *
 * Two layers:
 *   1. Pure-function unit tests of the exported `scanTextForViolations(text)` —
 *      the branch-pinned-vs-SHA-pinned detection rule, fence/inline-code skipping,
 *      and the exact #371 URL shape.
 *   2. CLI + tree tests via spawnSync: mode-by-package.json scan sets (self-host
 *      template/** vs consumer .github + root *.md), the project/clickstops/**
 *      exclusion, exit codes, and --quiet. Every fixture tree is built under
 *      os.tmpdir() (mkdtempSync) — nothing is ever written under the repo root.
 *
 * Run: node --test tests/cs85-clickstop-link-durability.test.mjs
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { scanTextForViolations, checkTree } from '../scripts/check-clickstop-link-durability.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const LINTER = path.join(REPO_ROOT, 'scripts', 'check-clickstop-link-durability.mjs');
const NODE = process.execPath;

// The exact #371 URL shape: a branch-pinned permalink into a transient active/
// clickstop path, carrying a trailing #fragment.
const BAD_371 =
  'https://github.com/henrik-me/sub-invaders/blob/main/project/clickstops/active/' +
  'active_cs16_bootstrap-sub-invaders/ARCHITECTURE.md#some-anchor';
// A generic branch-pinned active/ permalink.
const BAD_BRANCH =
  'https://github.com/o/r/blob/main/project/clickstops/active/active_cs99_foo/FILE.md';
// A slashy branch ref into an active/ path (seg1='feature', not 40-hex → flagged).
const BAD_SLASHY =
  'https://github.com/o/r/blob/feature/x/project/clickstops/active/active_cs1_a/z.md';
// A commit-SHA-pinned permalink into an active/ path (durable → allowed).
const OK_SHA =
  'https://github.com/o/r/blob/0123456789abcdef0123456789abcdef01234567/' +
  'project/clickstops/active/active_cs1_a/z.md';
// A done/ permalink (durable → allowed).
const OK_DONE =
  'https://github.com/o/r/blob/main/project/clickstops/done/done_cs16_x/z.md';

const tmpDirs = [];

/** A minimal self-host tree (package.json name = harness) plus a clean README. */
const SELF_HOST_TREE = {
  'package.json': JSON.stringify({ name: '@henrik-me/agent-harness' }, null, 2) + '\n',
  'README.md': '# Project\n\nClean prose, no permalinks.\n',
};

/**
 * Build a temp tree from SELF_HOST_TREE with per-file overrides. An override of
 * `null` removes that file; any string replaces/adds its content.
 *
 * @param {Record<string, string|null>} [overrides]
 * @returns {string} absolute temp dir path
 */
function buildTree(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs85-link-'));
  tmpDirs.push(dir);
  const files = { ...SELF_HOST_TREE };
  for (const [rel, content] of Object.entries(overrides)) {
    if (content === null) delete files[rel];
    else files[rel] = content;
  }
  for (const [rel, content] of Object.entries(files)) {
    const dest = path.join(dir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content);
  }
  return dir;
}

/**
 * @param {string[]} [args]
 * @returns {{ stdout: string, stderr: string, status: number }}
 */
function runLinter(args = []) {
  const result = spawnSync(NODE, [LINTER, ...args], { cwd: REPO_ROOT, encoding: 'utf8' });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? -1,
  };
}

after(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

// ===========================================================================
// Layer 1 — pure detection rule (scanTextForViolations)
// ===========================================================================

describe('scanTextForViolations (detection rule)', () => {
  it('flags a branch-pinned active/ permalink', () => {
    const hits = scanTextForViolations(`See [x](${BAD_BRANCH})\n`);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].url, BAD_BRANCH);
    assert.equal(hits[0].lineNo, 1);
  });

  it('flags the exact #371 shape (trailing #fragment)', () => {
    const hits = scanTextForViolations(`prose\nRef ${BAD_371} here.\n`);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].url, BAD_371);
    assert.equal(hits[0].lineNo, 2);
  });

  it('flags a slashy branch ref into an active/ path', () => {
    const hits = scanTextForViolations(`[y](${BAD_SLASHY})\n`);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].url, BAD_SLASHY);
  });

  it('allows a commit-SHA-pinned active/ permalink', () => {
    assert.deepEqual(scanTextForViolations(`[z](${OK_SHA})\n`), []);
  });

  it('allows a done/ permalink', () => {
    assert.deepEqual(scanTextForViolations(`[d](${OK_DONE})\n`), []);
  });

  it('skips a bad URL inside a fenced code block', () => {
    assert.deepEqual(scanTextForViolations(`text\n\`\`\`\n${BAD_BRANCH}\n\`\`\`\n`), []);
  });

  it('skips a bad URL inside a ~~~ fenced code block', () => {
    assert.deepEqual(scanTextForViolations(`text\n~~~\n${BAD_BRANCH}\n~~~\n`), []);
  });

  it('skips a bad URL inside an inline-code span', () => {
    assert.deepEqual(scanTextForViolations(`prose \`${BAD_BRANCH}\` more\n`), []);
  });

  it('does not flag plain prose that merely mentions active/ clickstops', () => {
    assert.deepEqual(
      scanTextForViolations('The clickstop lives under project/clickstops/active/ during work.\n'),
      [],
    );
  });

  it('does not flag a relative active/ link (not an absolute blob URL)', () => {
    assert.deepEqual(scanTextForViolations('[x](../active/active_cs99.md)\n'), []);
  });

  it('does not let a table-cell URL swallow the next cell (| boundary)', () => {
    const hits = scanTextForViolations(`| ${BAD_BRANCH} | next |\n`);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].url, BAD_BRANCH);
  });

  it('allows a non-active/ github blob URL (only active/ paths are in scope)', () => {
    assert.deepEqual(
      scanTextForViolations('[c](https://github.com/o/r/blob/main/README.md)\n'),
      [],
    );
  });

  it('skips a bad URL inside a double-backtick inline-code span (delimiter-aware)', () => {
    assert.deepEqual(scanTextForViolations(`prose \`\`${BAD_BRANCH}\`\` more\n`), []);
  });

  it('flags a URL after a MISMATCHED backtick run (``url``` is not a valid 2-span)', () => {
    // Open run of 2, close run of 3 — not a CommonMark code span, so the URL is
    // LIVE and must NOT be hidden (regression guard: over-stripping = false-neg).
    const hits = scanTextForViolations(`prose \`\`${BAD_BRANCH}\`\`\` more\n`);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].url, BAD_BRANCH);
  });

  it('flags a URL wrapped in ESCAPED backticks (\\` is literal, not a delimiter)', () => {
    // In CommonMark `\`url\`` is NOT a code span (the backticks are literal), so
    // the URL is LIVE and must be flagged (regression guard: escaped-delimiter
    // over-strip = false-negative).
    const hits = scanTextForViolations('prose \\`' + BAD_BRANCH + '\\` more\n');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].url, BAD_BRANCH);
  });

  it('still skips a real code span after an escaped backslash (\\\\`url` is a span)', () => {
    // `\\` is a literal backslash; the following `url` IS a real code span, so
    // the URL is an example and must be skipped (escape parity check).
    assert.deepEqual(scanTextForViolations('pre \\\\`' + BAD_BRANCH + '` post\n'), []);
  });

  it('flags a URL after a span CLOSED by a backtick that follows a backslash', () => {
    // `foo\` is a valid code span — backslashes are literal INSIDE a span, so the
    // backtick after `\` closes it. The following URL is therefore LIVE and must
    // be flagged (regression guard: escapes must not apply in the close scan).
    const hits = scanTextForViolations('before `foo\\`' + BAD_BRANCH + '` after\n');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].url, BAD_BRANCH);
  });

  it('does not flag active/ appearing only in a benign URL query string or fragment', () => {
    assert.deepEqual(
      scanTextForViolations('[q](https://github.com/o/r/blob/main/README.md?p=project/clickstops/active/x)\n'),
      [],
    );
    assert.deepEqual(
      scanTextForViolations('[f](https://github.com/o/r/blob/main/README.md#project/clickstops/active/x)\n'),
      [],
    );
  });
});

// ===========================================================================
// Layer 2 — CLI + tree behavior (mode gating, exclusions, exit codes)
// ===========================================================================

describe('check-clickstop-link-durability CLI', () => {
  it('passes (exit 0) on a clean self-host tree', () => {
    const { status, stdout } = runLinter(['--cwd', buildTree()]);
    assert.equal(status, 0);
    assert.match(stdout, /✅ Linter passed/);
    assert.match(stdout, /self-host mode/);
  });

  it('fails (exit 1) on a branch-pinned permalink in a root *.md', () => {
    const dir = buildTree({ 'README.md': `# R\n\nSee [x](${BAD_BRANCH})\n` });
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(
      stderr,
      /README\.md:\d+: branch-pinned permalink into a transient clickstop active\/ path/,
    );
    assert.match(stderr, /prefer no link, a commit-SHA permalink, or a stable project\/clickstops\/done\/ pointer/);
    assert.match(stderr, /❌ Linter FAILED/);
  });

  it('fails (exit 1) on the exact #371 URL shape', () => {
    const dir = buildTree({ 'ARCHITECTURE.md': `# Arch\n\n${BAD_371}\n` });
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(stderr, /ARCHITECTURE\.md:\d+: branch-pinned permalink/);
  });

  it('self-host mode: fails on a violation in a template/** file', () => {
    const dir = buildTree({ 'template/composed/foo.md': `# Foo\n\n${BAD_BRANCH}\n` });
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(stderr, /template\/composed\/foo\.md:\d+: branch-pinned permalink/);
  });

  it('self-host mode: EXCLUDES project/clickstops/** (a violation there passes)', () => {
    const dir = buildTree({
      'project/clickstops/active/active_cs99_x/plan.md': `# Plan\n\n${BAD_BRANCH}\n`,
    });
    assert.equal(runLinter(['--cwd', dir]).status, 0);
  });

  it('self-host mode: allows a SHA-pinned permalink in a root *.md', () => {
    const dir = buildTree({ 'README.md': `# R\n\n[z](${OK_SHA})\n` });
    assert.equal(runLinter(['--cwd', dir]).status, 0);
  });

  it('consumer mode: RUNS (not skipped) and flags a root *.md violation', () => {
    const dir = buildTree({
      'package.json': JSON.stringify({ name: 'some-consumer' }) + '\n',
      'README.md': `# R\n\n${BAD_BRANCH}\n`,
    });
    const { status, stdout, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(stderr, /README\.md:\d+: branch-pinned permalink/);
    // Proves it is NOT the CS72/CS81 "skipped in consumer" behavior.
    assert.doesNotMatch(stdout, /skipped/i);
  });

  it('consumer mode: flags a .github/copilot-instructions.md violation', () => {
    const dir = buildTree({
      'package.json': JSON.stringify({ name: 'some-consumer' }) + '\n',
      '.github/copilot-instructions.md': `# CI\n\n${BAD_BRANCH}\n`,
    });
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(stderr, /copilot-instructions\.md:\d+: branch-pinned permalink/);
  });

  it('consumer mode: flags a .github/pull_request_template.md violation', () => {
    const dir = buildTree({
      'package.json': JSON.stringify({ name: 'some-consumer' }) + '\n',
      '.github/pull_request_template.md': `## Summary\n\n${BAD_BRANCH}\n`,
    });
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(stderr, /pull_request_template\.md:\d+: branch-pinned permalink/);
  });

  it('consumer mode: does NOT scan template/** (that hit passes)', () => {
    const dir = buildTree({
      'package.json': JSON.stringify({ name: 'some-consumer' }) + '\n',
      'template/composed/foo.md': `# Foo\n\n${BAD_BRANCH}\n`,
    });
    assert.equal(runLinter(['--cwd', dir]).status, 0);
  });

  it('fail-closes (exit 1) on a malformed package.json', () => {
    const dir = buildTree({ 'package.json': '{ not valid json' });
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(stderr, /package\.json: malformed JSON/);
  });

  it('--dir is an alias for --cwd', () => {
    const dir = buildTree({ 'README.md': `# R\n\n${BAD_BRANCH}\n` });
    assert.equal(runLinter(['--dir', dir]).status, 1);
  });

  it('exits 2 on --cwd with no value', () => {
    const { status, stderr } = runLinter(['--cwd']);
    assert.equal(status, 2);
    assert.match(stderr, /missing value for --cwd/);
  });

  it('exits 2 on an unknown flag', () => {
    const { status, stderr } = runLinter(['--bogus']);
    assert.equal(status, 2);
    assert.match(stderr, /unknown flag/);
  });

  it('--quiet suppresses success stdout but keeps exit 0', () => {
    const { status, stdout } = runLinter(['--cwd', buildTree(), '--quiet']);
    assert.equal(status, 0);
    assert.equal(stdout.trim(), '');
  });

  it('--quiet still reports violations to stderr (exit 1)', () => {
    const dir = buildTree({ 'README.md': `# R\n\n${BAD_BRANCH}\n` });
    const { status, stderr, stdout } = runLinter(['--cwd', dir, '--quiet']);
    assert.equal(status, 1);
    assert.match(stderr, /branch-pinned permalink/);
    assert.equal(stdout.trim(), '');
  });
});

// ===========================================================================
// Layer 3 — checkTree() structured API (mode detection + exclusions)
// ===========================================================================

describe('checkTree (structured API)', () => {
  it('reports self-host mode and no violations on a clean tree', () => {
    const res = checkTree({ cwd: buildTree() });
    assert.equal(res.mode, 'self-host');
    assert.deepEqual(res.violations, []);
    assert.deepEqual(res.errors, []);
  });

  it('reports consumer mode for a non-harness package.json', () => {
    const dir = buildTree({ 'package.json': JSON.stringify({ name: 'x' }) + '\n' });
    assert.equal(checkTree({ cwd: dir }).mode, 'consumer');
  });

  it('treats an ABSENT package.json as consumer mode (no error)', () => {
    const dir = buildTree({ 'package.json': null });
    const res = checkTree({ cwd: dir });
    assert.equal(res.mode, 'consumer');
    assert.deepEqual(res.errors, []);
  });

  it('collects a violation with its consumer-relative file path', () => {
    const dir = buildTree({ 'README.md': `# R\n\n${BAD_BRANCH}\n` });
    const res = checkTree({ cwd: dir });
    assert.equal(res.violations.length, 1);
    assert.equal(res.violations[0].file, 'README.md');
    assert.equal(res.violations[0].url, BAD_BRANCH);
  });
});
