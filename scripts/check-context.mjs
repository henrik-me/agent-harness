#!/usr/bin/env node
/**
 * scripts/check-context.mjs — Linter for CONTEXT.md.
 *
 * Validates structural requirements for CONTEXT.md:
 *  - Required section headings are present.
 *  - No stale "ready to claim" language when a CS is currently active.
 *
 * Usage:
 *   node scripts/check-context.mjs --file <path> [--cwd <path>] [--quiet] [--help]
 *
 * Exit codes:
 *   0 — no errors
 *   1 — at least one error
 *   2 — usage error (missing required args / unknown flag)
 *
 * @module scripts/check-context.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { assertHeadings } from '../lib/doc-schema.mjs';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

let filePath = null;
let cwd = process.cwd();
let quiet = false;

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--file') {
    if (!argv[i + 1] || argv[i + 1].startsWith('-')) {
      process.stderr.write('check-context: missing value for --file\n');
      process.exit(2);
    }
    filePath = argv[++i];
  } else if (a === '--cwd') {
    if (!argv[i + 1] || argv[i + 1].startsWith('-')) {
      process.stderr.write('check-context: missing value for --cwd\n');
      process.exit(2);
    }
    cwd = argv[++i];
  } else if (a === '--quiet') {
    quiet = true;
  } else if (a === '--help' || a === '-h') {
    process.stdout.write(
      'Usage: check-context.mjs --file <path> [--cwd <path>] [--quiet]\n\n' +
      'Validate CONTEXT.md structural requirements.\n\n' +
      'Options:\n' +
      '  --file <path>   Path to the CONTEXT.md file to lint (required)\n' +
      '  --cwd <path>    Directory used to resolve WORKBOARD.md\n' +
      '                  (default: process.cwd())\n' +
      '  --quiet         Suppress per-finding output; print only the summary\n' +
      '  --help          Print this help text\n'
    );
    process.exit(0);
  } else {
    process.stderr.write(`check-context: unknown flag: ${a}\n`);
    process.exit(2);
  }
}

if (!filePath) {
  process.stderr.write(
    'check-context: --file <path> is required\n' +
    'Usage: check-context.mjs --file <path> [--cwd <path>] [--quiet]\n'
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Read the target file
// ---------------------------------------------------------------------------

let markdownText;
try {
  markdownText = fs.readFileSync(filePath, 'utf8');
} catch (err) {
  process.stderr.write(`check-context: cannot read file "${filePath}": ${err.message}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Finding collectors
// ---------------------------------------------------------------------------

const errors = [];

/**
 * Record an error finding and print it unless --quiet is active.
 *
 * @param {string} msg - Human-readable error description.
 */
function logError(msg) {
  errors.push(msg);
  if (!quiet) process.stdout.write(`ERROR: ${msg}\n`);
}

// ---------------------------------------------------------------------------
// Check 1 — Required headings
// ---------------------------------------------------------------------------

const REQUIRED_HEADINGS = [
  'Codebase state',
  'Architecture pointer',
  'Blockers / open questions',
  'CS plan',
];

const headingFindings = assertHeadings(markdownText, REQUIRED_HEADINGS);
for (const finding of headingFindings) {
  logError(`Missing required heading: "## ${finding.heading}"`);
}

// ---------------------------------------------------------------------------
// Check 2 — Stale language when a CS is active
//
// If <cwd>/WORKBOARD.md exists and has an Active Work row with
// state=claimed/active, CONTEXT.md must not contain stale phrases.
// If WORKBOARD.md does not exist, this check is skipped entirely.
// ---------------------------------------------------------------------------

const STALE_PHRASES = ['ready to claim', 'no active cs'];

const workboardPath = path.join(cwd, 'WORKBOARD.md');
let workboardText = null;
try {
  workboardText = fs.readFileSync(workboardPath, 'utf8');
} catch {
  // WORKBOARD.md not found — skip stale language check (no error)
}

if (workboardText !== null && hasClaimedOrActiveWork(workboardText)) {
  const lower = markdownText.toLowerCase();
  for (const phrase of STALE_PHRASES) {
    if (lower.includes(phrase)) {
      logError(`Stale language found: "${phrase}" — a CS is currently active`);
    }
  }
}

/**
 * Parse WORKBOARD.md text and return true if any row in the "## Active Work"
 * table has its State column set to "claimed" or "active".
 *
 * @param {string} text - Raw WORKBOARD.md content.
 * @returns {boolean}
 */
function hasClaimedOrActiveWork(text) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  let inActiveWork = false;
  let headerParsed = false;
  let stateColIndex = -1;

  for (const line of lines) {
    // Enter "## Active Work" section
    if (/^#{1,6}\s+Active Work\s*$/.test(line)) {
      inActiveWork = true;
      headerParsed = false;
      stateColIndex = -1;
      continue;
    }
    // Exit at next heading
    if (inActiveWork && /^#{1,6}\s/.test(line)) {
      break;
    }
    if (!inActiveWork) continue;

    // Parse header row to locate the State column
    if (!headerParsed && line.trim().startsWith('|')) {
      const cols = line.split('|').map((c) => c.trim());
      stateColIndex = cols.findIndex((c) => c.toLowerCase() === 'state');
      headerParsed = true;
      continue;
    }

    // Skip separator rows (e.g. |---|---|)
    if (/^\|[-| :]+\|$/.test(line.trim())) continue;

    // Check data rows
    if (headerParsed && line.trim().startsWith('|') && stateColIndex >= 0) {
      const cols = line.split('|').map((c) => c.trim());
      const state = (cols[stateColIndex] ?? '').toLowerCase();
      if (state === 'claimed' || state === 'active') {
        return true;
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

process.stdout.write(`\nCONTEXT.md: ${errors.length} error${errors.length !== 1 ? 's' : ''}\n`);
if (errors.length > 0) {
  process.stdout.write('❌ Linter FAILED\n');
  process.exit(1);
} else {
  process.stdout.write('✅ Linter passed\n');
  process.exit(0);
}
