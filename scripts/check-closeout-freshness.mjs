#!/usr/bin/env node
/**
 * scripts/check-closeout-freshness.mjs — close-out context-integrity gate
 * (CS63 decision C63-5 / finding C2).
 *
 * The repo IS the durable memory between agent sessions, yet nothing tied an
 * `active_csNN → done_csNN` close-out to a `CONTEXT.md` refresh — so a CS could
 * be closed without recording the new state. This gate fails a PR that performs
 * a close-out rename without updating `CONTEXT.md`, and warns when `LEARNINGS.md`
 * is left untouched.
 *
 * It is narrowly scoped to the **rename event**: it fires only when the changed
 * set contains BOTH a `done/done_csNN_*` path and the matching `active/active_csNN_*`
 * path (the signature of a `git mv active→done`). A standalone edit to an
 * existing `done_` file (e.g. a typo fix) does NOT trigger it (CS63 risk R6).
 *
 * Usage:
 *   node scripts/check-closeout-freshness.mjs
 *     (--files <csv|@file> | --base <ref> --head <ref>) [--quiet] [--help]
 *
 *   Provide EITHER --files (comma-separated, or @path to a newline-delimited
 *   file) OR --base/--head — the two are alternatives, not add-ons. With
 *   --base/--head the changed set is computed via
 *   `git diff --name-only --no-renames <base> <head>`. `--no-renames` is required
 *   so an active->done rename surfaces as delete(active)+add(done) — both paths —
 *   which the same-CS-id close-out detector needs; `--name-only` alone reports only
 *   the rename destination and would silently no-op the gate.
 *
 * Exit codes:
 *   0 — no close-out rename, or close-out with CONTEXT.md updated.
 *   1 — a close-out rename without a CONTEXT.md change.
 *   2 — usage error.
 *
 * @module scripts/check-closeout-freshness.mjs
 */

import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DONE_RE = /(?:^|\/)done_cs(\d+[a-z]?)_/;
const ACTIVE_RE = /(?:^|\/)active_cs(\d+[a-z]?)_/;

/** True when the path's basename is exactly `name` (e.g. CONTEXT.md). */
function isBasename(p, name) {
  return path.basename(p.replace(/\\/g, '/')) === name;
}

/**
 * Classify a changed-file set for close-out freshness. Pure function.
 *
 * @param {string[]} changedFiles - repo-relative paths in the PR diff.
 * @returns {{
 *   closeoutRenames: string[],   // CS ids (e.g. "54b") moved active→done
 *   contextChanged: boolean,
 *   learningsChanged: boolean
 * }}
 */
export function classifyCloseoutFreshness(changedFiles) {
  const files = Array.isArray(changedFiles) ? changedFiles : [];
  const doneIds = new Set();
  const activeIds = new Set();
  let contextChanged = false;
  let learningsChanged = false;

  for (const raw of files) {
    if (typeof raw !== 'string' || raw === '') continue;
    const f = raw.replace(/\\/g, '/');
    const d = DONE_RE.exec(f);
    if (d) doneIds.add(d[1]);
    const a = ACTIVE_RE.exec(f);
    if (a) activeIds.add(a[1]);
    if (isBasename(f, 'CONTEXT.md')) contextChanged = true;
    if (isBasename(f, 'LEARNINGS.md')) learningsChanged = true;
  }

  // A close-out is the rename signature: same CS id present as both done & active.
  const closeoutRenames = [...doneIds].filter((id) => activeIds.has(id));
  return { closeoutRenames, contextChanged, learningsChanged };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = [
  'Usage: check-closeout-freshness.mjs (--files <csv|@file> | --base <ref> --head <ref>) [--quiet] [--help]',
  '',
  'Fail (exit 1) when a CS close-out rename (active_csNN -> done_csNN) lands without a',
  'CONTEXT.md change. Warns if LEARNINGS.md is untouched. Exit codes: 0 ok, 1 stale, 2 usage.',
].join('\n');

function parseFilesArg(val) {
  if (val.startsWith('@')) {
    const p = path.resolve(val.slice(1));
    return fs.readFileSync(p, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }
  return val.split(',').map((s) => s.trim()).filter(Boolean);
}

function main(argv) {
  let files = null;
  let base = null;
  let head = null;
  let quiet = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const need = (flag) => {
      if (!argv[i + 1] || argv[i + 1].startsWith('-')) {
        process.stderr.write(`check-closeout-freshness: missing value for ${flag}\n`);
        process.exit(2);
      }
      return argv[++i];
    };
    if (a === '--help' || a === '-h') { process.stdout.write(USAGE + '\n'); process.exit(0); }
    else if (a === '--files') files = parseFilesArg(need('--files'));
    else if (a === '--base') base = need('--base');
    else if (a === '--head') head = need('--head');
    else if (a === '--quiet') quiet = true;
    else { process.stderr.write(`check-closeout-freshness: unknown flag: ${a}\n\n${USAGE}\n`); process.exit(2); }
  }

  if (files && (base || head)) {
    process.stderr.write(`check-closeout-freshness: --files and --base/--head are mutually exclusive\n\n${USAGE}\n`);
    process.exit(2);
  }

  if (!files) {
    if (base && head) {
      const r = spawnSync('git', ['diff', '--name-only', '--no-renames', base, head], { encoding: 'utf8' });
      if (r.status !== 0) {
        process.stderr.write(`check-closeout-freshness: git diff failed: ${r.stderr}\n`);
        process.exit(2);
      }
      files = r.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    } else {
      process.stderr.write(`check-closeout-freshness: provide --files or --base/--head\n\n${USAGE}\n`);
      process.exit(2);
    }
  }

  const { closeoutRenames, contextChanged, learningsChanged } = classifyCloseoutFreshness(files);

  if (closeoutRenames.length === 0) {
    if (!quiet) process.stdout.write('check-closeout-freshness: no close-out rename in diff\n\u2705 Linter passed\n');
    process.exit(0);
  }

  if (!contextChanged) {
    process.stdout.write(
      `ERROR: close-out of CS ${closeoutRenames.join(', ')} (active->done) without a CONTEXT.md update. ` +
      `The repo is the durable memory — update CONTEXT.md at close-out (CS63 C63-5).\n` +
      '\u274c Linter FAILED\n'
    );
    process.exit(1);
  }

  if (!learningsChanged && !quiet) {
    process.stdout.write(
      `WARNING: close-out of CS ${closeoutRenames.join(', ')} did not touch LEARNINGS.md — ` +
      `confirm there are no learnings to file.\n`
    );
  }
  if (!quiet) process.stdout.write('check-closeout-freshness: close-out updates CONTEXT.md\n\u2705 Linter passed\n');
  process.exit(0);
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main(process.argv.slice(2));
}
