/**
 * tests/check-closeout-freshness.test.mjs — tests for the close-out
 * context-integrity gate (CS63 C63-5 / C2). Validates the narrow rename-event
 * scoping: only an active->done rename without a CONTEXT.md change fails.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
