/**
 * tests/cs73-probe-active.test.mjs — CS73 per-orchestrator lock for the shipped
 * cs-probes scaffold. Fixture-based (os.tmpdir() only — never writes under the
 * repo root) checks that:
 *   - probe-active.mjs passes for one active CS, passes for two active CSs owned
 *     by DIFFERENT owners, and fails only when a SINGLE owner has >1 active CS.
 *   - probe-tasks-resolved.mjs validates EVERY active CS, not just one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// import.meta.url is used ONLY to locate the harness's own scaffold scripts
// under test — this is a test, not a consumer-runtime script.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCAFFOLD = path.join(__dirname, '..', 'scaffolds', 'cs-probes', 'files', 'scripts', 'cs-probes');
const PROBE_ACTIVE = path.join(SCAFFOLD, 'probe-active.mjs');
const PROBE_TASKS = path.join(SCAFFOLD, 'probe-tasks-resolved.mjs');

function makeTmpRepo() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'cs73-probe-'));
  mkdirSync(path.join(root, 'project', 'clickstops', 'active'), { recursive: true });
  return root;
}

// Write a minimal, well-formed active CS file. The Notes cell uses `\|` as the
// intra-cell separator that parseTableRow understands, carrying report-status.
function writeActiveCs(root, { cs, slug, owner, taskStatus = 'complete' }) {
  const body = [
    `# CS${cs} — ${slug}`,
    '',
    '**Status:** active',
    `**Owner:** ${owner}`,
    '**Branch:** x',
    '**Started:** y',
    '',
    '## Tasks',
    '',
    '| Task | State | Owner | Notes |',
    '|---|---|---|---|',
    `| T1 — work | active | ${owner} | agent-id=a \\| role=implementer \\| report-status=${taskStatus} |`,
    '',
  ].join('\n');
  const file = path.join(root, 'project', 'clickstops', 'active', `active_cs${cs}_${slug}.md`);
  writeFileSync(file, body);
  return file;
}

function runProbe(probe, root) {
  return spawnSync(process.execPath, [probe, '--cwd', root, '--quiet'], { encoding: 'utf8' });
}

/* ---------- probe-active.mjs (per-Owner lock) --------------------------- */

test('probe-active: one active CS (owner A) → exit 0', () => {
  const root = makeTmpRepo();
  try {
    writeActiveCs(root, { cs: '80', slug: 'alpha', owner: 'omni-ah' });
    const r = runProbe(PROBE_ACTIVE, root);
    assert.equal(r.status, 0, r.stdout + r.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('probe-active: two active CSs owned by DIFFERENT owners → exit 0', () => {
  const root = makeTmpRepo();
  try {
    writeActiveCs(root, { cs: '80', slug: 'alpha', owner: 'omni-ah' });
    writeActiveCs(root, { cs: '81', slug: 'beta', owner: 'yoga-ah' });
    const r = runProbe(PROBE_ACTIVE, root);
    assert.equal(r.status, 0, r.stdout + r.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('probe-active: two active CSs owned by the SAME owner → exit 1, stdout names the owner', () => {
  const root = makeTmpRepo();
  try {
    writeActiveCs(root, { cs: '80', slug: 'alpha', owner: 'omni-ah' });
    writeActiveCs(root, { cs: '81', slug: 'beta', owner: 'omni-ah' });
    const r = runProbe(PROBE_ACTIVE, root);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /omni-ah/);
    assert.match(r.stdout, /has 2 active CS files/);
    assert.match(r.stdout, /at most 1 per orchestrator/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/* ---------- probe-tasks-resolved.mjs (validate EVERY active CS) --------- */

test('probe-tasks-resolved: two active CSs, every task row resolved → exit 0', () => {
  const root = makeTmpRepo();
  try {
    writeActiveCs(root, { cs: '80', slug: 'alpha', owner: 'omni-ah', taskStatus: 'complete' });
    writeActiveCs(root, { cs: '81', slug: 'beta', owner: 'yoga-ah', taskStatus: 'complete' });
    const r = runProbe(PROBE_TASKS, root);
    assert.equal(r.status, 0, r.stdout + r.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('probe-tasks-resolved: two active CSs, one with a pending task row → exit 1', () => {
  const root = makeTmpRepo();
  try {
    writeActiveCs(root, { cs: '80', slug: 'alpha', owner: 'omni-ah', taskStatus: 'complete' });
    writeActiveCs(root, { cs: '81', slug: 'beta', owner: 'yoga-ah', taskStatus: 'pending' });
    const r = runProbe(PROBE_TASKS, root);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /active_cs81_beta\.md/);
    assert.match(r.stdout, /report-status=pending/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/* ---------- ENOENT discrimination: missing active/ dir → PASS ----------- */

test('probe-active: no active/ directory → exit 0 (ENOENT is not a failure)', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'cs73-probe-'));
  try {
    const r = runProbe(PROBE_ACTIVE, root); // no project/clickstops/active created
    assert.equal(r.status, 0, r.stdout + r.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('probe-tasks-resolved: no active/ directory → exit 0 (ENOENT is not a failure)', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'cs73-probe-'));
  try {
    const r = runProbe(PROBE_TASKS, root); // no project/clickstops/active created
    assert.equal(r.status, 0, r.stdout + r.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
