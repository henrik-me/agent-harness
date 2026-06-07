/**
 * tests/check-closeout-freshness.test.mjs — tests for the close-out
 * context-integrity gate (CS63 C63-5 / C2). Validates the narrow rename-event
 * scoping: only an active->done rename without a CONTEXT.md change fails.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyCloseoutFreshness } from '../scripts/check-closeout-freshness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(__dirname, '..', 'scripts', 'check-closeout-freshness.mjs');

test('rename signature (active+done same id) is detected as a close-out', () => {
  const r = classifyCloseoutFreshness([
    'project/clickstops/active/active_cs54b_x.md',
    'project/clickstops/done/done_cs54b_x.md',
    'CONTEXT.md',
  ]);
  assert.deepEqual(r.closeoutRenames, ['54b']);
  assert.equal(r.contextChanged, true);
});

test('directory-form done path is matched', () => {
  const r = classifyCloseoutFreshness([
    'project/clickstops/active/active_cs11_self-host.md',
    'project/clickstops/done/done_cs11_self-host/done_cs11_self-host.md',
  ]);
  assert.deepEqual(r.closeoutRenames, ['11']);
});

test('a standalone done-file edit (no matching active) is NOT a close-out (R6)', () => {
  const r = classifyCloseoutFreshness([
    'project/clickstops/done/done_cs54b_x.md', // typo fix, no active counterpart
    'README.md',
  ]);
  assert.deepEqual(r.closeoutRenames, []);
});

test('filing a new planned/active CS (no done) is NOT a close-out', () => {
  const r = classifyCloseoutFreshness([
    'project/clickstops/active/active_cs63a_x.md',
    'project/clickstops/planned/planned_cs63b_y.md',
  ]);
  assert.deepEqual(r.closeoutRenames, []);
});

test('CONTEXT.md / LEARNINGS.md basenames are detected', () => {
  const r = classifyCloseoutFreshness(['CONTEXT.md', 'LEARNINGS.md']);
  assert.equal(r.contextChanged, true);
  assert.equal(r.learningsChanged, true);
});

test('empty / nullish change sets are safe', () => {
  assert.deepEqual(classifyCloseoutFreshness([]).closeoutRenames, []);
  assert.deepEqual(classifyCloseoutFreshness(undefined).closeoutRenames, []);
});

test('CLI: close-out WITHOUT CONTEXT.md change exits 1', () => {
  const files = 'project/clickstops/active/active_cs54b_x.md,project/clickstops/done/done_cs54b_x.md';
  const r = spawnSync(process.execPath, [SCRIPT, '--files', files], { encoding: 'utf8' });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /without a CONTEXT\.md update/);
});

test('CLI: close-out WITH CONTEXT.md change exits 0', () => {
  const files = 'project/clickstops/active/active_cs54b_x.md,project/clickstops/done/done_cs54b_x.md,CONTEXT.md';
  const r = spawnSync(process.execPath, [SCRIPT, '--files', files], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('CLI: no close-out rename exits 0 (self-host-safe on unrelated diffs)', () => {
  const r = spawnSync(process.execPath, [SCRIPT, '--files', 'README.md,lib/sync.mjs'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /no close-out rename/);
});

test('CLI: --help exits 0, missing args exit 2', () => {
  assert.equal(spawnSync(process.execPath, [SCRIPT, '--help'], { encoding: 'utf8' }).status, 0);
  assert.equal(spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' }).status, 2);
});

test('CLI: --files and --base/--head together => exit 2 (mutually exclusive)', () => {
  const r = spawnSync(process.execPath, [SCRIPT, '--files', 'CONTEXT.md', '--base', 'HEAD~1', '--head', 'HEAD'], { encoding: 'utf8' });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /mutually exclusive/);
});

test('harness pr-evidence wires the C2 close-out-freshness gate (diff-scoped)', () => {
  const cli = readFileSync(path.join(__dirname, '..', 'bin', 'harness.mjs'), 'utf8');
  assert.match(cli, /name: 'C2 close-out-freshness'/, 'cmdPrEvidence must register the C2 gate');
  assert.match(cli, /script: 'check-closeout-freshness\.mjs'/, 'C2 gate must invoke the linter');
  assert.match(cli, /hasCloseoutRename/, 'C2 gate must be diff-scoped to close-out renames (omitted otherwise)');
});

test('harness lint (cmdLint) also wires the close-out-freshness gate', () => {
  const cli = readFileSync(path.join(__dirname, '..', 'bin', 'harness.mjs'), 'utf8');
  assert.match(cli, /name: 'closeout-freshness'/, 'cmdLint must register the close-out-freshness linter');
});

// Regression for the rename-collapse bug: `git diff --name-only` reports ONLY the
// rename DESTINATION, so the same-CS-id active+done detector saw only `done_` and
// silently no-op'd the gate. The fix passes `--no-renames` so a rename surfaces as
// delete(active)+add(done). These tests exercise the real --base/--head git path.
function initRepo(prefix) {
  const repo = mkdtempSync(path.join(os.tmpdir(), prefix));
  const git = (...args) => {
    const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    assert.equal(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}`);
    return r;
  };
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  git('config', 'commit.gpgsign', 'false');
  mkdirSync(path.join(repo, 'project', 'clickstops', 'active'), { recursive: true });
  mkdirSync(path.join(repo, 'project', 'clickstops', 'done'), { recursive: true });
  return { repo, git };
}

test('CLI --base/--head: real active->done rename with NO CONTEXT change => exit 1 (stale)', () => {
  const { repo, git } = initRepo('closeout-freshness-stale-');
  try {
    writeFileSync(path.join(repo, 'project', 'clickstops', 'active', 'active_cs99_demo.md'), '# CS99\n');
    writeFileSync(path.join(repo, 'CONTEXT.md'), 'context v1\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'seed active CS99');
    git('mv', 'project/clickstops/active/active_cs99_demo.md', 'project/clickstops/done/done_cs99_demo.md');
    git('commit', '-q', '-m', 'close out CS99 (no CONTEXT change)');
    const r = spawnSync(process.execPath, [SCRIPT, '--base', 'HEAD~1', '--head', 'HEAD'], { cwd: repo, encoding: 'utf8' });
    assert.equal(r.status, 1, `expected stale exit 1; got ${r.status}\n${r.stdout}${r.stderr}`);
    assert.match(r.stdout + r.stderr, /CONTEXT\.md/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('CLI --base/--head: real active->done rename WITH a CONTEXT change => exit 0', () => {
  const { repo, git } = initRepo('closeout-freshness-ok-');
  try {
    writeFileSync(path.join(repo, 'project', 'clickstops', 'active', 'active_cs99_demo.md'), '# CS99\n');
    writeFileSync(path.join(repo, 'CONTEXT.md'), 'context v1\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'seed');
    git('mv', 'project/clickstops/active/active_cs99_demo.md', 'project/clickstops/done/done_cs99_demo.md');
    writeFileSync(path.join(repo, 'CONTEXT.md'), 'context v2 (updated at close-out)\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'close out CS99 + CONTEXT update');
    const r = spawnSync(process.execPath, [SCRIPT, '--base', 'HEAD~1', '--head', 'HEAD'], { cwd: repo, encoding: 'utf8' });
    assert.equal(r.status, 0, `expected ok exit 0; got ${r.status}\n${r.stdout}${r.stderr}`);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
