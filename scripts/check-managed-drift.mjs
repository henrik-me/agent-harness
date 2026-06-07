#!/usr/bin/env node
/**
 * scripts/check-managed-drift.mjs — file-class-aware drift gate (CS63 C63-2 / CS63a).
 *
 * The consumer PR-time structural gate (`harness-pr-check.yml`) must FAIL a PR
 * that diverges a `managed` or `composed` template file, but must NOT fail on
 * `seeded` files — those are consumer-owned and freely editable, and the sync
 * engine only ever reports their *absence* as drift (`lib/sync.mjs:884-889`).
 *
 * Plain `harness sync --mode=check` exits 1 on *any* drift, including a missing
 * seeded file, so the gate cannot call it directly (this was the bug the CS63
 * plan rubber-duck caught). This classifier wraps the sync **check** API and
 * fails only on the protected classes, reporting seeded divergence as an
 * informational note.
 *
 * Drift semantics per class (check mode, `lib/sync.mjs`):
 *   - managed/composed → action `updated` (content differs) or `created`
 *     (absent) means the consumer's file no longer matches the rendered
 *     template ⇒ **failure**.
 *   - seeded → action `created` (absent) is the only "drift" the engine
 *     records; it is reported but never fails the gate.
 *   - `skipped`/`preserved`/`excluded` → in sync, no failure.
 *
 * Usage:
 *   node scripts/check-managed-drift.mjs [--cwd <consumer-repo>]
 *       [--harness-repo <path>] [--config <path>] [--quiet] [--help]
 *
 * Exit codes:
 *   0 — no managed/composed drift (seeded divergence, if any, is advisory).
 *   1 — at least one managed/composed file drifted.
 *   2 — usage error or fatal sync failure.
 *
 * @module scripts/check-managed-drift.mjs
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

/** Sync actions that mean a file diverged from its rendered template. */
export const DRIFT_ACTIONS = new Set(['created', 'updated']);

/** File classes the gate protects (consumer must not diverge these). */
export const PROTECTED_CLASSES = new Set(['managed', 'composed']);

/**
 * Partition sync ChangeRecords into protected-class drift (gate failures) and
 * seeded divergence (advisory only). Pure function — no I/O.
 *
 * @param {Array<{target:string,class:string,action:string}>} changes
 * @returns {{ drift: object[], seededDrift: object[] }}
 */
export function classifyManagedComposedDrift(changes) {
  const drift = [];
  const seededDrift = [];
  for (const c of changes ?? []) {
    if (!c || typeof c.class !== 'string') continue;
    if (c.class === 'seeded') {
      if (DRIFT_ACTIONS.has(c.action)) seededDrift.push(c);
      continue;
    }
    if (PROTECTED_CLASSES.has(c.class) && DRIFT_ACTIONS.has(c.action)) {
      drift.push(c);
    }
  }
  return { drift, seededDrift };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = [
  'Usage: check-managed-drift.mjs [--cwd <consumer-repo>] [--harness-repo <path>]',
  '                               [--config <path>] [--quiet] [--help]',
  '',
  'Fail (exit 1) only when a managed/composed template file has drifted in the',
  'consumer repo. Seeded divergence is reported but never fails.',
  '',
  'Exit codes: 0 = no managed/composed drift, 1 = drift found, 2 = bad usage.',
].join('\n');

function requireValue(args, i, flag) {
  if (!args[i + 1] || args[i + 1].startsWith('-')) {
    process.stderr.write(`check-managed-drift: missing value for ${flag}\n`);
    process.exit(2);
  }
  return args[i + 1];
}

async function main(argv) {
  let cwd = process.cwd();
  let harnessRepo = REPO_ROOT;
  let configPath = null;
  let quiet = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      process.stdout.write(USAGE + '\n');
      process.exit(0);
    } else if (a === '--cwd') {
      cwd = path.resolve(requireValue(argv, i, '--cwd'));
      i++;
    } else if (a === '--harness-repo') {
      harnessRepo = path.resolve(requireValue(argv, i, '--harness-repo'));
      i++;
    } else if (a === '--config') {
      configPath = path.resolve(requireValue(argv, i, '--config'));
      i++;
    } else if (a === '--quiet') {
      quiet = true;
    } else {
      process.stderr.write(`check-managed-drift: unknown flag: ${a}\n\n${USAGE}\n`);
      process.exit(2);
    }
  }

  let result;
  try {
    const { sync } = await import('../lib/sync.mjs');
    result = await sync({
      consumerRepoPath: cwd,
      harnessRepoPath: harnessRepo,
      mode: 'check',
      configPath,
    });
  } catch (err) {
    process.stderr.write(`check-managed-drift: sync failed: ${err.message}\n`);
    process.exit(2);
  }

  const { drift, seededDrift } = classifyManagedComposedDrift(result.changes);

  if (!quiet && seededDrift.length > 0) {
    process.stdout.write(
      `NOTE: ${seededDrift.length} seeded file(s) absent (advisory, not a gate failure): ` +
      seededDrift.map((c) => c.target).join(', ') + '\n'
    );
  }

  if (drift.length > 0) {
    for (const c of drift) {
      process.stdout.write(`ERROR: managed/composed drift: ${c.class} "${c.target}" (${c.action})\n`);
    }
    process.stdout.write(
      `check-managed-drift: ${drift.length} managed/composed file(s) drifted. ` +
      `Run \`harness sync --mode=apply\` or revert the local edit.\n`
    );
    process.stdout.write('\u274c Linter FAILED\n');
    process.exit(1);
  }

  if (!quiet) process.stdout.write('check-managed-drift: 0 managed/composed drift\n\u2705 Linter passed\n');
  process.exit(0);
}

// Only run when invoked directly (not when imported by tests).
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main(process.argv.slice(2));
}
