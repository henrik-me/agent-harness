#!/usr/bin/env node
/**
 * scripts/check-planning-locality.mjs — CS35 (planning-locality enforcement).
 *
 * Bans repo-root scratch planning files that hold strategic content outside the
 * canonical `project/clickstops/` arc. Session storage is non-durable; any
 * agent restart, model swap, or handoff must succeed from the repo alone, so
 * multi-CS planning content MUST live in `project/clickstops/{planned,active,
 * done}/**` and nowhere else.
 *
 * Per CS35 decisions:
 *   - C35-11 (planning-locality rule): strategic planning content MUST live
 *     in `project/clickstops/{planned,active,done}/**`.
 *   - C35-12 (banned file shapes): files whose basename matches PLAN.md,
 *     ROADMAP.md, TODO.md, NOTES.md, or STRATEGY.md (case-insensitive)
 *     anywhere in the repo outside the allow-list.
 *
 * Allow-list (paths whose contents are NOT scanned for banned names):
 *   - `project/clickstops/` — the canonical home for planning artefacts.
 *   - `template/`           — template skeletons may legitimately ship example
 *                             PLAN/TODO/NOTES files for consumers.
 *   - `node_modules/`       — vendored deps; not authored content.
 *   - `.git/`               — git internals.
 *   - `tests/fixtures/`     — fixture trees for other linters may legitimately
 *                             include named files for assertion purposes.
 *
 * File-set source: `git ls-files` (tracked files only) so untracked or
 * gitignored scratch files do not flag — only files committed (or staged)
 * into the repo can violate.
 *
 * Usage:
 *   node scripts/check-planning-locality.mjs --cwd <path> [--quiet]
 *
 * Exit codes:
 *   0 — no violations (or no git repo / no tracked files)
 *   1 — at least one violation
 *   2 — usage error
 *
 * @module scripts/check-planning-locality.mjs
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const BANNED_BASENAMES = ['plan.md', 'roadmap.md', 'todo.md', 'notes.md', 'strategy.md'];

const ALLOW_LISTED_PREFIXES = [
  'project/clickstops/',
  'template/',
  'node_modules/',
  '.git/',
  'tests/fixtures/',
];

const USAGE = `Usage: check-planning-locality --cwd <path> [--quiet]

Scans tracked files for banned planning-file basenames outside the allow-list.

Banned basenames (case-insensitive):
  ${BANNED_BASENAMES.join(', ')}

Allow-listed path prefixes (POSIX, repo-root-relative):
  ${ALLOW_LISTED_PREFIXES.join(', ')}

Options:
  --cwd <path>      Repo root to scan (default: process.cwd()).
  --quiet           Suppress success stdout.
  --help, -h        Show this message.

Exit codes:
  0  no violations (or not a git repo)
  1  at least one violation
  2  usage error
`;

function requireValue(args, i, flag) {
  if (!args[i + 1] || args[i + 1].startsWith('-')) {
    process.stderr.write(`check-planning-locality: missing value for ${flag}\n`);
    process.stderr.write(USAGE);
    process.exit(2);
  }
}

function parseArgs(argv) {
  const result = { cwd: process.cwd(), quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--cwd') {
      requireValue(argv, i, '--cwd');
      result.cwd = argv[++i];
    } else if (a === '--quiet') {
      result.quiet = true;
    } else if (a === '--help' || a === '-h') {
      process.stdout.write(USAGE);
      process.exit(0);
    } else {
      process.stderr.write(`check-planning-locality: unknown argument: ${a}\n`);
      process.stderr.write(USAGE);
      process.exit(2);
    }
  }
  return result;
}

function listTrackedFiles(cwd) {
  const res = spawnSync('git', ['-C', cwd, 'ls-files'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.status !== 0) {
    return null;
  }
  return res.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function isAllowed(relPath) {
  const posix = relPath.split(path.sep).join('/');
  return ALLOW_LISTED_PREFIXES.some((prefix) => posix.startsWith(prefix));
}

function isBannedBasename(relPath) {
  const base = path.basename(relPath).toLowerCase();
  return BANNED_BASENAMES.includes(base);
}

const args = parseArgs(process.argv.slice(2));

const tracked = listTrackedFiles(args.cwd);
if (tracked === null) {
  if (!args.quiet) {
    process.stdout.write('check-planning-locality: not a git repository or git unavailable; skipping.\n');
  }
  process.exit(0);
}

const violations = [];
for (const file of tracked) {
  if (isAllowed(file)) continue;
  if (isBannedBasename(file)) {
    violations.push(file);
  }
}

if (violations.length > 0) {
  process.stderr.write(
    `check-planning-locality: ${violations.length} banned planning file(s) found outside ` +
    `project/clickstops/ (per CS35 decisions C35-11, C35-12):\n`
  );
  for (const v of violations) {
    process.stderr.write(`  - ${v}\n`);
  }
  process.stderr.write(
    '\nMove planning content into project/clickstops/{planned,active,done}/ ' +
    'or rename the file. See INSTRUCTIONS.md § Hard rules.\n'
  );
  process.exit(1);
}

if (!args.quiet) {
  process.stdout.write(`check-planning-locality: ${tracked.length} tracked files scanned, 0 violations.\n`);
}
process.exit(0);
