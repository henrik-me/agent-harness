#!/usr/bin/env node
/**
 * scripts/check-pr-commits.mjs — B1 gate: Co-authored-by trailer presence on
 * every commit in a PR's commit graph.
 *
 * Walks the commit graph between <base> (exclusive) and <head> (inclusive),
 * and verifies that every commit body carries the canonical
 * Co-authored-by: Copilot trailer (C36-4). Merge commits are NOT excluded
 * (per C36-3: no --no-merges).
 *
 * Usage:
 *   node scripts/check-pr-commits.mjs --base <sha> --head <sha>
 *     [--skip-reasons <csv>] [--quiet] [--help]
 *
 * Exit codes:
 *   0 — all commits pass (or range empty, or skipped)
 *   1 — at least one commit missing the trailer
 *   2 — bad usage (missing args, unknown flag) or git error (SHA not found)
 *
 * @module scripts/check-pr-commits.mjs
 */

import { execFileSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Canonical Co-authored-by trailer regex (C36-4). */
const COPILOT_TRAILER_RE =
  /^Co-authored-by: Copilot <223556219\+Copilot@users\.noreply\.github\.com>$/m;

/**
 * Skip-reasons that cause B1 to exit 0 without checking any commits (C36-5).
 * fork-source is NOT in this set — it does not skip B1.
 */
const SKIP_REASONS_SKIP_B1 = new Set(['workboard-only', 'bot-author']);

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

const HELP = [
  'Usage: check-pr-commits.mjs --base <sha> --head <sha> [options]',
  '',
  'B1 gate: verify every commit in <base>..<head> carries the canonical',
  'Co-authored-by: Copilot trailer. Merge commits are included (no --no-merges).',
  '',
  'Options:',
  '  --base <sha>           Base SHA (exclusive start of commit range, required)',
  '  --head <sha>           Head SHA (inclusive end of commit range, required)',
  '  --skip-reasons <csv>   Comma-separated skip reasons. workboard-only and',
  '                         bot-author: skip entirely (exit 0 with skip notice).',
  '                         fork-source: does NOT skip this gate.',
  '  --quiet                Suppress per-commit findings; print only the summary',
  '  --help                 Print this help text',
  '',
  'Exit codes:',
  '  0  all commits pass (or range empty, or skipped)',
  '  1  at least one commit is missing the Co-authored-by: Copilot trailer',
  '  2  bad usage (missing/unknown args) or git error (SHA not available locally)',
  '',
].join('\n');

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

let baseSha = null;
let headSha = null;
let skipReasons = new Set();
let quiet = false;

function requireValue(args, i, flagName) {
  if (!args[i + 1] || args[i + 1].startsWith('-')) {
    process.stderr.write(`check-pr-commits: missing value for ${flagName}\n`);
    process.exit(2);
  }
  return args[i + 1];
}

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--base') {
    baseSha = requireValue(argv, i, '--base');
    i++;
  } else if (a === '--head') {
    headSha = requireValue(argv, i, '--head');
    i++;
  } else if (a === '--skip-reasons') {
    const csv = requireValue(argv, i, '--skip-reasons');
    skipReasons = new Set(csv.split(',').map((s) => s.trim()).filter(Boolean));
    i++;
  } else if (a === '--quiet') {
    quiet = true;
  } else if (a === '--help' || a === '-h') {
    process.stdout.write(HELP);
    process.exit(0);
  } else {
    process.stderr.write(`check-pr-commits: unknown flag: ${a}\n${HELP}`);
    process.exit(2);
  }
}

if (!baseSha) {
  process.stderr.write(`check-pr-commits: --base <sha> is required\n${HELP}`);
  process.exit(2);
}
if (!headSha) {
  process.stderr.write(`check-pr-commits: --head <sha> is required\n${HELP}`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Skip-reason handling (C36-5)
// ---------------------------------------------------------------------------

for (const reason of SKIP_REASONS_SKIP_B1) {
  if (skipReasons.has(reason)) {
    if (!quiet) {
      process.stdout.write(`check-pr-commits: skipped (${reason})\n`);
    }
    process.stdout.write('check-pr-commits: 0 errors, 0 warnings (skipped)\n');
    process.exit(0);
  }
}

// ---------------------------------------------------------------------------
// Git log — walk commit graph (C36-3)
// R1 mitigation: git exits non-zero when a SHA is unknown locally; we catch
// and emit an actionable message before exiting 2.
// ---------------------------------------------------------------------------

let gitOutput;
try {
  gitOutput = execFileSync(
    'git',
    ['log', `${baseSha}..${headSha}`, '--format=%H%n%s%n%b%n--END--'],
    { cwd: process.cwd(), encoding: 'utf8' }
  );
} catch {
  process.stderr.write(
    `check-pr-commits: base or head SHA not found locally; run ` +
    `"git fetch origin ${baseSha} ${headSha}" then retry.\n`
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Parse commit entries
//
// git log --format=%H%n%s%n%b%n--END-- outputs per-commit blocks:
//
//   <40-char-sha>
//   <subject>
//   <body lines (may be empty)>
//   --END--
//
// We split on '\n--END--' to separate commits; the first line of each block
// is the SHA (40 hex chars), the second is the subject, remainder is the body.
// ---------------------------------------------------------------------------

/**
 * @typedef {{ sha: string, subject: string, body: string }} CommitEntry
 */

/**
 * Parse raw git log output into commit entries.
 *
 * @param {string} raw
 * @returns {CommitEntry[]}
 */
function parseCommits(raw) {
  const commits = [];
  const parts = raw.split('\n--END--');
  for (const part of parts) {
    // Strip leading newline that git inserts between commit blocks
    const block = part.replace(/^\n/, '');
    if (!block.trim()) continue;
    const lines = block.split('\n');
    const sha = lines[0].trim();
    if (!/^[0-9a-f]{40}$/.test(sha)) continue; // skip malformed or empty blocks
    const subject = (lines[1] ?? '').trim();
    const body = lines.slice(2).join('\n');
    commits.push({ sha, subject, body });
  }
  return commits;
}

const commits = parseCommits(gitOutput);

// ---------------------------------------------------------------------------
// Empty range → pass immediately
// ---------------------------------------------------------------------------

if (commits.length === 0) {
  if (!quiet) {
    process.stdout.write('check-pr-commits: 0 commits in range\n');
  }
  process.stdout.write('check-pr-commits: 0 errors, 0 warnings\n');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Check each commit for the Copilot trailer
// ---------------------------------------------------------------------------

const errors = [];

function logError(msg) {
  errors.push(msg);
  if (!quiet) process.stdout.write(`ERROR: ${msg}\n`);
}

for (const { sha, subject, body } of commits) {
  const fullMessage = `${subject}\n${body}`;
  if (!COPILOT_TRAILER_RE.test(fullMessage)) {
    const shortSha = sha.slice(0, 7);
    logError(`commit ${shortSha} "${subject}": missing Co-authored-by: Copilot trailer`);
  }
}

// ---------------------------------------------------------------------------
// Summary + exit
// ---------------------------------------------------------------------------

process.stdout.write(`check-pr-commits: ${errors.length} errors, 0 warnings\n`);
process.exit(errors.length > 0 ? 1 : 0);
