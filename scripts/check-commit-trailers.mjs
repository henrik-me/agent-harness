#!/usr/bin/env node
/**
 * scripts/check-commit-trailers.mjs — Linter for git commit message trailer blocks.
 *
 * Validates a git commit message file (e.g. `.git/COMMIT_EDITMSG` or output of
 * `git log --format=%B -n 1`). Checks that required trailers are present and
 * that trailer values match optional allowlist patterns.
 *
 * Trailer block detection:
 *   The trailer block is the trailing run of consecutive lines (after a blank
 *   line) that match `<Key>: <Value>` (RFC 5322 style). A line that does NOT
 *   match this pattern in what would be the trailer block breaks the block back
 *   to body. An empty file exits 0 immediately.
 *
 * Usage:
 *   node scripts/check-commit-trailers.mjs --file <path>
 *     [--required <Trailer1,Trailer2>]
 *     [--allow <Trailer>=<regex>] (repeatable)
 *     [--quiet] [--help]
 *
 * Exit codes:
 *   0 — no errors
 *   1 — at least one error
 *   2 — usage error (missing required args / unknown flag)
 *
 * @module scripts/check-commit-trailers.mjs
 */

import fs from 'node:fs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Guard that the next CLI token is a plain value (not a flag / missing).
 * Exits 2 with a usage error on violation.
 *
 * @param {string[]} args
 * @param {number} i  - index of the flag itself
 * @param {string} flagName
 */
function requireValue(args, i, flagName) {
  if (!args[i + 1] || args[i + 1].startsWith('-')) {
    process.stderr.write(`check-commit-trailers: missing value for ${flagName}\n`);
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

let filePath = null;
/** @type {string[]} */
let requiredTrailers = ['Co-authored-by'];
/** @type {Map<string, string[]>} */
const allowPatterns = new Map();
let quiet = false;

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--file') {
    requireValue(argv, i, '--file');
    filePath = argv[++i];
  } else if (a === '--required') {
    requireValue(argv, i, '--required');
    requiredTrailers = argv[++i].split(',').map((t) => t.trim()).filter(Boolean);
  } else if (a === '--allow') {
    requireValue(argv, i, '--allow');
    const raw = argv[++i];
    const eqIdx = raw.indexOf('=');
    if (eqIdx < 1) {
      process.stderr.write(
        `check-commit-trailers: --allow value must be <Trailer>=<regex>, got: ${raw}\n`
      );
      process.exit(2);
    }
    const key = raw.slice(0, eqIdx);
    const pattern = raw.slice(eqIdx + 1);
    if (!allowPatterns.has(key)) allowPatterns.set(key, []);
    allowPatterns.get(key).push(pattern);
  } else if (a === '--quiet') {
    quiet = true;
  } else if (a === '--help' || a === '-h') {
    process.stdout.write(
      'Usage: check-commit-trailers.mjs --file <path>\n' +
      '  [--required <Trailer1,Trailer2>]\n' +
      '  [--allow <Trailer>=<regex>] (repeatable)\n' +
      '  [--quiet] [--help]\n\n' +
      'Validate the trailer block of a git commit message file.\n\n' +
      'Options:\n' +
      '  --file <path>             Path to the commit message file (required)\n' +
      '  --required <list>         Comma-separated list of required trailer keys\n' +
      '                            (default: Co-authored-by)\n' +
      '  --allow <Trailer>=<regex> For each occurrence, all values for that trailer\n' +
      '                            must match the given regex. Repeatable.\n' +
      '  --quiet                   Suppress per-finding output; print only summary\n' +
      '  --help                    Print this help text\n'
    );
    process.exit(0);
  } else {
    process.stderr.write(`check-commit-trailers: unknown flag: ${a}\n`);
    process.exit(2);
  }
}

if (!filePath) {
  process.stderr.write(
    'check-commit-trailers: --file <path> is required\n' +
    'Usage: check-commit-trailers.mjs --file <path> [--required <list>] [--allow <Trailer>=<regex>] [--quiet]\n'
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Read the target file
// ---------------------------------------------------------------------------

let rawText;
try {
  rawText = fs.readFileSync(filePath, 'utf8');
} catch (err) {
  process.stderr.write(`check-commit-trailers: cannot read file "${filePath}": ${err.message}\n`);
  process.exit(1);
}

// Strip UTF-8 BOM if present (per LRN-018)
if (rawText.charCodeAt(0) === 0xFEFF) rawText = rawText.slice(1);
// Normalise line endings (per LRN-006)
const text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

// Empty file → clean
if (text.trim() === '') {
  process.stdout.write('\ncommit trailers: 0 errors\n✅ Linter passed\n');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Trailer block extraction
//
// RFC 2822 / git trailer convention:
//   The trailer block is the maximal trailing sequence of lines that:
//     1. Is preceded (or reached from) a blank line.
//     2. Every line matches /^[A-Za-z][A-Za-z0-9-]*: .+$/
//
// We scan from the end. Any line that does NOT match the trailer pattern
// breaks the run; we stop there.
// ---------------------------------------------------------------------------

/** Matches a valid trailer line: Key: Value */
const TRAILER_RE = /^([A-Za-z][A-Za-z0-9-]*): (.+)$/;

const lines = text.split('\n');

/**
 * @type {Array<{key: string, value: string, line: number}>}
 */
const trailers = [];

// Walk lines from end, skip trailing blank lines, collect trailer lines
let end = lines.length - 1;
// Skip trailing blank lines
while (end >= 0 && lines[end].trim() === '') end--;

// Collect consecutive trailer-matching lines from end
for (let i = end; i >= 0; i--) {
  const line = lines[i];
  if (line.trim() === '') break; // blank line ends the trailer block
  const m = TRAILER_RE.exec(line);
  if (!m) break; // non-matching line breaks the trailer block
  trailers.unshift({ key: m[1], value: m[2], line: i + 1 });
}

// ---------------------------------------------------------------------------
// Finding collectors
// ---------------------------------------------------------------------------

const errors = [];

/**
 * Record an error finding.
 *
 * @param {string} msg
 */
function logError(msg) {
  errors.push(msg);
  if (!quiet) process.stdout.write(`ERROR: ${msg}\n`);
}

// ---------------------------------------------------------------------------
// Check 1 — Required trailers present
// ---------------------------------------------------------------------------

for (const required of requiredTrailers) {
  const found = trailers.some((t) => t.key === required);
  if (!found) {
    logError(`Missing required trailer: "${required}"`);
  }
}

// ---------------------------------------------------------------------------
// Check 2 — Allowlist patterns: each trailer value must match its pattern(s)
// ---------------------------------------------------------------------------

for (const [trailerKey, patterns] of allowPatterns) {
  const matching = trailers.filter((t) => t.key === trailerKey);
  for (const t of matching) {
    for (const pattern of patterns) {
      let re;
      try {
        re = new RegExp(pattern);
      } catch (err) {
        process.stderr.write(
          `check-commit-trailers: invalid regex for --allow ${trailerKey}: ${pattern} — ${err.message}\n`
        );
        process.exit(2);
      }
      if (!re.test(t.value)) {
        logError(
          `Trailer "${t.key}" value "${t.value}" does not match required pattern /${pattern}/`
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

process.stdout.write(`\ncommit trailers: ${errors.length} error${errors.length !== 1 ? 's' : ''}\n`);
if (errors.length > 0) {
  process.stdout.write('❌ Linter FAILED\n');
  process.exit(1);
} else {
  process.stdout.write('✅ Linter passed\n');
  process.exit(0);
}
