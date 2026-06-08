/**
 * tests/lib-upgrade.test.mjs — guided update preview (CS63 C63-6 / U2).
 * Seams (ref fetch, sync) are injected, so no network or git is touched.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  planUpgrade,
  formatUpgradePlan,
  UpgradeError,
} from '../lib/upgrade.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(__dirname, '..', 'bin', 'harness.mjs');

// A sync seam that returns a fixed dry-run change set.
function fakeSync(changes) {
  return async () => ({ changes, driftDetected: changes.length > 0, warnings: [] });
}
const fetchStub = () => '/tmp/fake-harness-clone';

test('planUpgrade returns only created/updated changes + a summary', async () => {
  const plan = await planUpgrade({
    consumerRepoPath: os.tmpdir(),
    targetRef: 'v9.9.9',
    fetchHarnessAtRef: fetchStub,
    sync: fakeSync([
      { target: 'INSTRUCTIONS.md', class: 'managed', action: 'updated' },
      { target: '.github/x.yml', class: 'managed', action: 'created' },
      { target: 'CONTEXT.md', class: 'seeded', action: 'preserved' }, // filtered
      { target: 'README.md', class: 'managed', action: 'skipped' },   // filtered
    ]),
  });
  assert.equal(plan.targetRef, 'v9.9.9');
  assert.equal(plan.changes.length, 2);
  assert.deepEqual(plan.summary, { updated: 1, created: 1 });
});

test('planUpgrade reads currentVersion from the consumer config', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'upgrade-cfg-'));
  try {
    writeFileSync(path.join(dir, 'harness.config.json'), JSON.stringify({ version: 'v1.2.3' }));
    const plan = await planUpgrade({
      consumerRepoPath: dir,
      targetRef: 'v2.0.0',
      fetchHarnessAtRef: fetchStub,
      sync: fakeSync([]),
    });
    assert.equal(plan.currentVersion, 'v1.2.3');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('planUpgrade rejects a missing or invalid ref', async () => {
  await assert.rejects(
    planUpgrade({ consumerRepoPath: os.tmpdir(), targetRef: '', fetchHarnessAtRef: fetchStub, sync: fakeSync([]) }),
    (e) => e instanceof UpgradeError && e.code === 'EUPGRADE_NO_REF'
  );
  await assert.rejects(
    planUpgrade({ consumerRepoPath: os.tmpdir(), targetRef: 'bad ref;rm -rf', fetchHarnessAtRef: fetchStub, sync: fakeSync([]) }),
    (e) => e instanceof UpgradeError && e.code === 'EUPGRADE_BAD_REF'
  );
});

test('planUpgrade never applies (dry-run mode is passed to sync)', async () => {
  let observedMode = null;
  await planUpgrade({
    consumerRepoPath: os.tmpdir(),
    targetRef: 'v1.0.0',
    fetchHarnessAtRef: fetchStub,
    sync: async (a) => { observedMode = a.mode; return { changes: [] }; },
  });
  assert.equal(observedMode, 'dry-run', 'upgrade must run sync in dry-run, never apply');
});

test('planUpgrade never reaches the apply/write path (R7 — no consumer write)', async () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'upgrade-nowrite-'));
  try {
    const sentinel = path.join(repo, 'WRITTEN');
    // A sync seam that writes a sentinel ONLY in apply mode. Upgrade must never
    // reach apply, so the sentinel must not exist — locks R7 end-to-end at the
    // upgrade/sync boundary (no consumer-repo mutation from `harness upgrade`).
    const syncSpy = async (a) => {
      if (a.mode === 'apply') writeFileSync(sentinel, 'x');
      return { changes: [{ action: 'update', class: 'managed', target: 'X.md' }], driftDetected: true, warnings: [] };
    };
    await planUpgrade({ consumerRepoPath: repo, targetRef: 'v1.2.3', fetchHarnessAtRef: fetchStub, sync: syncSpy });
    assert.equal(existsSync(sentinel), false, 'upgrade must never run sync in apply mode — no consumer write');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('formatUpgradePlan: no changes vs changes', () => {
  const none = formatUpgradePlan({ targetRef: 'v2', currentVersion: 'v1', changes: [], summary: {} });
  assert.match(none, /No changes/);

  const some = formatUpgradePlan({
    targetRef: 'v2', currentVersion: 'v1',
    changes: [{ target: 'INSTRUCTIONS.md', class: 'managed', action: 'updated' }],
    summary: { updated: 1 },
  });
  assert.match(some, /v1 -> v2/);
  assert.match(some, /INSTRUCTIONS\.md/);
  assert.match(some, /harness sync --mode=apply/);
});

test('CLI: harness upgrade requires a ref (exit 2) and --help exits 0', () => {
  assert.equal(spawnSync(process.execPath, [CLI, 'upgrade'], { encoding: 'utf8' }).status, 2);
  const help = spawnSync(process.execPath, [CLI, 'upgrade', '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Preview upgrading/);
});

test('CLI: harness upgrade rejects an injection-y ref (exit 1)', () => {
  const r = spawnSync(process.execPath, [CLI, 'upgrade', 'bad;rm'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
});
