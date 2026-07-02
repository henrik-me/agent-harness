/**
 * tests/cs81-doc-xref-resolvability.test.mjs
 *   — Tests for scripts/check-doc-xref-resolvability.mjs (CS81 / C81-5, C81-6).
 *
 * Uses node:test + spawnSync. Every fixture tree is built programmatically under
 * os.tmpdir() (mkdtempSync) — nothing is ever written under the repo root. Each
 * tree carries a self-host package.json (name '@henrik-me/agent-harness') so the
 * guard's self-host gate lets the checks run; a per-test overrides map replaces
 * or removes individual files to exercise one branch at a time.
 *
 * Run: node --test tests/cs81-doc-xref-resolvability.test.mjs
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
const LINTER = path.join(REPO_ROOT, 'scripts', 'check-doc-xref-resolvability.mjs');
const NODE = process.execPath;

// A clean self-host tree in which all three checks pass:
//   (a) OPERATIONS.md/REVIEWS.md reference only the resolving token LRN-001;
//   (b) INSTRUCTIONS.md links OPERATIONS.md#report-shape (a real heading);
//   (c) READMEGUIDE.md links ARCHITECTURE.md, which ships under template/managed.
const CLEAN_TREE = {
  'package.json': JSON.stringify({ name: '@henrik-me/agent-harness' }, null, 2) + '\n',
  'LEARNINGS.md': '# Learnings\n\n### LRN-001\n\nProblem body.\n',
  'OPERATIONS.md': '# Operations\n\n## Report shape\n\nBody referencing LRN-001.\n',
  'REVIEWS.md': '# Reviews\n\nReview referencing LRN-001.\n',
  'INSTRUCTIONS.md': '# Instructions\n\nSee [report shape](OPERATIONS.md#report-shape).\n',
  'template/managed/READMEGUIDE.md': '# Guide\n\nSee [architecture](ARCHITECTURE.md).\n',
  'template/managed/ARCHITECTURE.md': '# Architecture\n',
};

const tmpDirs = [];

/**
 * Build a temp tree from CLEAN_TREE with per-file overrides applied. An override
 * value of `null` removes that file; any string replaces its content.
 *
 * @param {Record<string, string|null>} [overrides]
 * @returns {string} absolute temp dir path
 */
function buildTree(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs81-xref-'));
  tmpDirs.push(dir);
  const files = { ...CLEAN_TREE };
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

// ---------------------------------------------------------------------------

describe('check-doc-xref-resolvability', () => {
  it('passes (exit 0) on a fully clean self-host tree', () => {
    const dir = buildTree();
    const { status, stdout } = runLinter(['--cwd', dir]);
    assert.equal(status, 0);
    assert.match(stdout, /✅ Linter passed/);
  });

  // ----- Check (a): LRN-token resolvability --------------------------------

  it('(a) fails (exit 1) on a dead numeric LRN token', () => {
    const dir = buildTree({
      'OPERATIONS.md': '# Operations\n\n## Report shape\n\nSee LRN-777 for details.\n',
    });
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(stderr, /OPERATIONS\.md:\d+: LRN token "LRN-777" does not resolve/);
    assert.match(stderr, /❌ Linter FAILED/);
  });

  it('(a) fails (exit 1) on a placeholder LRN-A token (the #352-F1 bug)', () => {
    const dir = buildTree({
      'OPERATIONS.md': '# Operations\n\n## Report shape\n\nClose-out (CS70 / LRN-A).\n',
    });
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(stderr, /OPERATIONS\.md:\d+: LRN token "LRN-A" does not resolve/);
  });

  it('(a) also scans REVIEWS.md for dead LRN tokens', () => {
    const dir = buildTree({ 'REVIEWS.md': '# Reviews\n\nSee LRN-B for the rule.\n' });
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(stderr, /REVIEWS\.md:\d+: LRN token "LRN-B" does not resolve/);
  });

  it('(a) passes (exit 0) when every LRN token resolves to a heading', () => {
    const dir = buildTree({
      'OPERATIONS.md': '# Operations\n\n## Report shape\n\nSee LRN-001 and LRN-001 again.\n',
    });
    assert.equal(runLinter(['--cwd', dir]).status, 0);
  });

  it('(a) does NOT false-positive on an LRN-NNN documentation placeholder', () => {
    const dir = buildTree({
      'OPERATIONS.md': '# Operations\n\n## Report shape\n\nFile the next learning as LRN-NNN.\n',
    });
    assert.equal(runLinter(['--cwd', dir]).status, 0);
  });

  // ----- Check (b): cross-file anchor resolvability ------------------------

  it('(b) fails (exit 1) on a stale cross-file anchor (the #356a bug)', () => {
    const dir = buildTree({
      'OPERATIONS.md': '# Operations\n\n## Sub-agent report shape (mandatory)\n\nBody.\n',
      'INSTRUCTIONS.md': '# Instructions\n\nSee [shape](OPERATIONS.md#sub-agent-report-shape).\n',
    });
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(
      stderr,
      /INSTRUCTIONS\.md:\d+: cross-file anchor "OPERATIONS\.md#sub-agent-report-shape" does not resolve/
    );
  });

  it('(b) passes (exit 0) once the anchor matches the (mandatory)-suffixed heading', () => {
    const dir = buildTree({
      'OPERATIONS.md': '# Operations\n\n## Sub-agent report shape (mandatory)\n\nBody.\n',
      'INSTRUCTIONS.md':
        '# Instructions\n\nSee [shape](OPERATIONS.md#sub-agent-report-shape-mandatory).\n',
    });
    assert.equal(runLinter(['--cwd', dir]).status, 0);
  });

  it('(b) does NOT falsely resolve an anchor that only matches a fenced code-block heading', () => {
    const dir = buildTree({
      'OPERATIONS.md':
        '# Operations\n\nExample skeleton:\n\n```markdown\n## Fake heading in a fence\n```\n',
      'INSTRUCTIONS.md':
        '# Instructions\n\nSee [x](OPERATIONS.md#fake-heading-in-a-fence).\n',
    });
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(stderr, /cross-file anchor "OPERATIONS\.md#fake-heading-in-a-fence" does not resolve/);
  });

  it('(b) skips a link whose target sibling doc does not exist', () => {
    const dir = buildTree({
      'INSTRUCTIONS.md': '# Instructions\n\nSee [x](NOSUCH.md#whatever).\n',
    });
    assert.equal(runLinter(['--cwd', dir]).status, 0);
  });

  // ----- Check (c): relative-link deliverability ---------------------------

  it('(c) fails (exit 1) on a relative link to a non-template path (the #356b bug)', () => {
    const dir = buildTree({
      'template/managed/READMEGUIDE.md':
        '# Guide\n\nSee [ADR 0001](docs/adr/0001-file-classes.md).\n',
    });
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(
      stderr,
      /READMEGUIDE\.md:\d+: relative link "docs\/adr\/0001-file-classes\.md" .* ships under no template\/ class/
    );
  });

  it('(c) passes (exit 0) on a relative link to a shipped template path', () => {
    // CLEAN_TREE links ARCHITECTURE.md, which ships under template/managed.
    assert.equal(runLinter(['--cwd', buildTree()]).status, 0);
  });

  it('(c) skips a non-shipped link that lives inside a fenced code block', () => {
    const dir = buildTree({
      'template/managed/READMEGUIDE.md':
        '# Guide\n\n```markdown\nSee [ADR](docs/adr/0001-file-classes.md).\n```\n',
    });
    assert.equal(runLinter(['--cwd', dir]).status, 0);
  });

  it('(c) resolves a link across the template class boundary (managed link -> seeded target)', () => {
    const dir = buildTree({
      'template/managed/READMEGUIDE.md': '# Guide\n\nSee [readme](README.md).\n',
      'template/seeded/README.md': '# Project\n',
    });
    assert.equal(runLinter(['--cwd', dir]).status, 0);
  });

  // ----- Self-host gate + CLI ---------------------------------------------

  it('no-ops (exit 0, "skipped") when the tree is not the harness self-host', () => {
    const dir = buildTree({ 'package.json': JSON.stringify({ name: 'some-consumer' }) + '\n' });
    const { status, stdout } = runLinter(['--cwd', dir]);
    assert.equal(status, 0);
    assert.match(stdout, /skipped \(not the harness self-host\)/);
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

  it('--quiet still reports errors to stderr (exit 1)', () => {
    const dir = buildTree({
      'OPERATIONS.md': '# Operations\n\n## Report shape\n\nSee LRN-777.\n',
    });
    const { status, stderr, stdout } = runLinter(['--cwd', dir, '--quiet']);
    assert.equal(status, 1);
    assert.match(stderr, /LRN-777/);
    assert.equal(stdout.trim(), '');
  });
});
