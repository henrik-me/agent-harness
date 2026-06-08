/**
 * lib/upgrade.mjs — guided consumer update preview (CS63 decision C63-6 / U2).
 *
 * Today a consumer "upgrades" by hand-editing `harness.config.json.version` and
 * running `harness sync`, with no preview of what the new harness ref would
 * change. `harness upgrade <ref>` closes that gap: it fetches the harness at the
 * target ref and runs a **dry-run** sync of that ref's templates against the
 * consumer repo, printing the list of files that would change (per-file action +
 * class) + a change-count summary — **without applying anything**. Apply remains
 * the explicit, separate `harness sync --mode=apply` step.
 *
 * Design: additive over the existing sync engine (no apply-path changes, per
 * C63-6 risk R7). All side-effecting seams (the ref fetch, the sync call) are
 * injectable so the planner is unit-testable without network or git.
 *
 * Note: the preview renders the target ref's `template/` files using the
 * **local** sync engine (sync's templating is zero-dependency Node built-ins),
 * which is a faithful preview of the file set that would change.
 *
 * @module lib/upgrade.mjs
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

/** Refs allowed for clone/checkout (semver tags, branches, 40-char SHAs). */
const REF_ALLOWLIST = /^[a-zA-Z0-9._/-]+$/;

/** Default upstream harness repository. */
const DEFAULT_REPO_URL = 'https://github.com/henrik-me/agent-harness.git';

/** Sync actions that represent a real change in the preview. */
const CHANGED_ACTIONS = new Set(['created', 'updated']);

export class UpgradeError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'UpgradeError';
    this.code = code;
  }
}

/**
 * Default fetch seam: clone the harness at {@link ref} into a temp dir and
 * return its path. The cloned tree is only used for its `template/` files, so
 * no `npm install` is needed (sync rendering is dependency-free).
 *
 * @param {string} ref
 * @param {object} [opts]
 * @param {string} [opts.repoUrl]
 * @returns {string} absolute path to the checked-out clone
 */
export function defaultFetchHarnessAtRef(ref, { repoUrl = DEFAULT_REPO_URL } = {}) {
  if (!REF_ALLOWLIST.test(ref)) {
    throw new UpgradeError(`invalid ref "${ref}" (allowed: ${REF_ALLOWLIST})`, 'EUPGRADE_BAD_REF');
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-upgrade-'));
  try {
    const clone = spawnSync('git', ['clone', '--quiet', '--no-checkout', repoUrl, dir], { encoding: 'utf8' });
    if (clone.status !== 0) {
      const detail = (clone.stderr || clone.error?.message || `git exited with status ${clone.status}`).trim();
      throw new UpgradeError(`git clone failed: ${detail}`, 'EUPGRADE_CLONE');
    }
    const co = spawnSync('git', ['-C', dir, 'checkout', '--quiet', ref], { encoding: 'utf8' });
    if (co.status !== 0) {
      const detail = (co.stderr || co.error?.message || `git exited with status ${co.status}`).trim();
      throw new UpgradeError(`git checkout "${ref}" failed: ${detail}`, 'EUPGRADE_CHECKOUT');
    }
    return dir;
  } catch (err) {
    // Don't leak the temp clone if clone/checkout fails.
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
    throw err;
  }
}

/**
 * Plan an upgrade preview. All side effects are injectable for testability.
 *
 * @param {object} opts
 * @param {string} opts.consumerRepoPath
 * @param {string} opts.targetRef
 * @param {string|null} [opts.configPath]
 * @param {(ref:string)=>string} [opts.fetchHarnessAtRef] - returns harnessRepoPath
 * @param {(args:object)=>Promise<{changes:Array}>} [opts.sync] - sync engine (dry-run)
 * @returns {Promise<{ targetRef:string, currentVersion:string|null, changes:Array, summary:object }>}
 */
export async function planUpgrade({
  consumerRepoPath,
  targetRef,
  configPath = null,
  fetchHarnessAtRef = defaultFetchHarnessAtRef,
  sync,
}) {
  if (!targetRef) throw new UpgradeError('targetRef is required', 'EUPGRADE_NO_REF');
  if (!REF_ALLOWLIST.test(targetRef)) {
    throw new UpgradeError(`invalid ref "${targetRef}" (allowed: ${REF_ALLOWLIST})`, 'EUPGRADE_BAD_REF');
  }

  const cfgPath = configPath ?? path.join(consumerRepoPath, 'harness.config.json');
  let currentVersion = null;
  try {
    currentVersion = JSON.parse(fs.readFileSync(cfgPath, 'utf8')).version ?? null;
  } catch {
    // No/unreadable config — preview still proceeds; currentVersion stays null.
  }

  const harnessRepoPath = fetchHarnessAtRef(targetRef);
  try {
    const syncFn = sync ?? (await import('./sync.mjs')).sync;

    const result = await syncFn({
      consumerRepoPath,
      harnessRepoPath,
      mode: 'dry-run',
      configPath: cfgPath,
      acceptMajor: true, // preview only; a real apply still gates on --accept-major
    });

    const changes = (result.changes ?? []).filter((c) => CHANGED_ACTIONS.has(c.action));
    const summary = {};
    for (const c of changes) summary[c.action] = (summary[c.action] ?? 0) + 1;

    return { targetRef, currentVersion, changes, summary };
  } finally {
    // Best-effort cleanup of the default fetcher's temp clone so repeated
    // `harness upgrade` runs don't accumulate dirs in os.tmpdir(). Guarded to
    // the `harness-upgrade-*` prefix this module creates, so an injected
    // fetcher's path (a caller-owned fixture) is never deleted.
    if (harnessRepoPath && harnessRepoPath.startsWith(path.join(os.tmpdir(), 'harness-upgrade-'))) {
      try { fs.rmSync(harnessRepoPath, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
  }
}

/**
 * Render an upgrade plan as human-readable text.
 *
 * @param {Awaited<ReturnType<typeof planUpgrade>>} plan
 * @returns {string}
 */
export function formatUpgradePlan({ targetRef, currentVersion, changes, summary }) {
  const lines = [];
  lines.push(
    `harness upgrade: preview ${currentVersion ?? '(unpinned)'} -> ${targetRef} ` +
    `(dry-run — nothing applied)`
  );
  if (!changes || changes.length === 0) {
    lines.push('  No changes — the consumer already matches the target ref.');
    return lines.join('\n') + '\n';
  }
  for (const c of changes) {
    lines.push(`  ${String(c.action).padEnd(9)} ${String(c.class).padEnd(9)} ${c.target}`);
  }
  lines.push(`  Summary: ${Object.entries(summary).map(([a, n]) => `${n} ${a}`).join(', ')}`);
  lines.push(
    `  To apply: set harness.config.json "version" to "${targetRef}", then ` +
    `run \`harness sync --mode=apply\` (use --accept-major for a major bump).`
  );
  return lines.join('\n') + '\n';
}
