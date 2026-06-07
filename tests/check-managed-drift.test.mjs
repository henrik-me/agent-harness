/**
 * tests/check-managed-drift.test.mjs — tests for scripts/check-managed-drift.mjs
 * (CS63 C63-2 / CS63a). Validates the corrected file-class drift design: only
 * managed/composed divergence fails; seeded absence is advisory, never a gate
 * failure (the bug the CS63 plan rubber-duck caught).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyManagedComposedDrift,
  DRIFT_ACTIONS,
  PROTECTED_CLASSES,
} from '../scripts/check-managed-drift.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'check-managed-drift.mjs');

test('managed/composed "updated" or "created" is gate-failing drift', () => {
  const changes = [
    { target: 'INSTRUCTIONS.md', class: 'managed', action: 'updated' },
    { target: '.github/x.yml', class: 'managed', action: 'created' },
    { target: 'OPERATIONS.md', class: 'composed', action: 'updated' },
  ];
  const { drift } = classifyManagedComposedDrift(changes);
  assert.equal(drift.length, 3);
});

test('seeded absence ("created") is advisory, NOT gate-failing drift', () => {
  const changes = [
    { target: 'CONTEXT.md', class: 'seeded', action: 'created' },
    { target: 'README.md', class: 'seeded', action: 'preserved' },
  ];
  const { drift, seededDrift } = classifyManagedComposedDrift(changes);
  assert.equal(drift.length, 0, 'seeded never fails the gate');
  assert.equal(seededDrift.length, 1, 'absent seeded reported as advisory');
  assert.equal(seededDrift[0].target, 'CONTEXT.md');
});

test('in-sync managed files ("skipped") and excluded files do not drift', () => {
  const changes = [
    { target: 'INSTRUCTIONS.md', class: 'managed', action: 'skipped' },
    { target: 'README.md', class: 'managed', action: 'excluded' },
    { target: 'CONTEXT.md', class: 'seeded', action: 'preserved' },
  ];
  const { drift, seededDrift } = classifyManagedComposedDrift(changes);
  assert.equal(drift.length, 0);
  assert.equal(seededDrift.length, 0);
});

test('mixed change set isolates only managed/composed drift', () => {
  const changes = [
    { target: 'a', class: 'managed', action: 'updated' },   // drift
    { target: 'b', class: 'seeded', action: 'created' },     // advisory
    { target: 'c', class: 'composed', action: 'skipped' },   // ok
    { target: 'd', class: 'composed', action: 'created' },   // drift
    { target: 'e', class: 'managed', action: 'excluded' },   // ok
  ];
  const { drift, seededDrift } = classifyManagedComposedDrift(changes);
  assert.deepEqual(drift.map((c) => c.target).sort(), ['a', 'd']);
  assert.deepEqual(seededDrift.map((c) => c.target), ['b']);
});

test('empty / nullish change sets are handled', () => {
  assert.deepEqual(classifyManagedComposedDrift([]), { drift: [], seededDrift: [] });
  assert.deepEqual(classifyManagedComposedDrift(undefined), { drift: [], seededDrift: [] });
});

test('exported constants match the documented semantics', () => {
  assert.ok(DRIFT_ACTIONS.has('created') && DRIFT_ACTIONS.has('updated'));
  assert.ok(!DRIFT_ACTIONS.has('skipped') && !DRIFT_ACTIONS.has('preserved'));
  assert.ok(PROTECTED_CLASSES.has('managed') && PROTECTED_CLASSES.has('composed'));
  assert.ok(!PROTECTED_CLASSES.has('seeded'));
});

test('--help exits 0', () => {
  const r = spawnSync(process.execPath, [SCRIPT, '--help'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /managed\/composed/);
});

test('unknown flag exits 2', () => {
  const r = spawnSync(process.execPath, [SCRIPT, '--bogus'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
});

test('self-host smoke: repo in sync reports no managed/composed drift (exit 0)', () => {
  const r = spawnSync(
    process.execPath,
    [SCRIPT, '--cwd', REPO_ROOT, '--harness-repo', REPO_ROOT],
    { encoding: 'utf8' }
  );
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}: ${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /0 managed\/composed drift/);
});
