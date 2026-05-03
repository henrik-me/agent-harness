#!/usr/bin/env node
/**
 * scripts/check-readme.mjs — Linter for README.md (v0 baseline).
 *
 * TODO(CS06b): migrate to lib/doc-schema.mjs primitives where applicable
 *
 * Validates README.md structural requirements against the eventual READMEGUIDE
 * (CS08 will canonicalize; this script enforces a v0 baseline).
 *
 * TODO(CS06b): migrate to lib/doc-schema.mjs primitives where applicable
 *
 * DECISIONS:
 *   - "## Architecture" OR link to ARCHITECTURE.md: ERROR per CS06 spec.
 *   - "## Status" OR link to CONTEXT.md: ERROR per CS06 spec.
 *   - Status badges: WARNING (aesthetic, not structural).
 *
 * Checks:
 *   1. First non-empty line is an H1 (`# <something>`).              → ERROR
 *   2. At least one paragraph between the H1 and the next H2.        → ERROR
 *   3a. "## Quickstart" OR "## Getting started" (case-insensitive).  → ERROR
 *   3b. "## License" or a "MIT" mention anywhere in the file.        → ERROR
 *   3c. "## Architecture" OR a link to ARCHITECTURE.md.              → ERROR
 *   3d. "## Status" OR a link to CONTEXT.md.                         → ERROR
 *   4. At least one `![…](…)` badge image in the first 30 lines.     → WARNING
 *
 * Usage:
 *   node scripts/check-readme.mjs --file <path> [--quiet]
 *
 * Exit codes:
 *   0 — no errors (warnings are allowed)
 *   1 — at least one validation error
 *   2 — usage error (missing required --file flag)
 *
 * @module scripts/check-readme.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

let filePath = null;
let quiet = false;

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--file') {
    if (!argv[i + 1] || argv[i + 1].startsWith('-')) {
      process.stderr.write('check-readme: missing value for --file\n');
      process.exit(2);
    }
    filePath = argv[++i];
  } else if (a === '--quiet') {
    quiet = true;
  } else if (a === '--help' || a === '-h') {
    process.stdout.write(
      'Usage: check-readme.mjs --file <path> [--quiet]\n\n' +
      'Validate README.md against the v0 structural baseline.\n\n' +
      'Options:\n' +
      '  --file <path>   Path to the README.md file to lint (REQUIRED)\n' +
      '  --quiet         Suppress per-finding output; print only the summary\n' +
      '  --help          Print this help text\n'
    );
    process.exit(0);
  } else {
    process.stderr.write(`check-readme: unknown flag: ${a}\n`);
    process.exit(2);
  }
}

if (!filePath) {
  process.stderr.write('check-readme: --file <path> is required\n');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Read the target file
// ---------------------------------------------------------------------------

let rawText;
try {
  rawText = fs.readFileSync(filePath, 'utf8');
} catch (err) {
  process.stderr.write(`check-readme: cannot read file "${filePath}": ${err.message}\n`);
  process.exit(1);
}

// Normalize: strip UTF-8 BOM, convert CRLF/CR → LF.
const text = rawText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
const lines = text.split('\n');

// ---------------------------------------------------------------------------
// Finding collectors
// ---------------------------------------------------------------------------

const errors = [];
const warnings = [];

/**
 * Record an error and print it unless --quiet.
 * @param {string} msg
 */
function logError(msg) {
  errors.push(msg);
  if (!quiet) process.stdout.write(`ERROR: ${msg}\n`);
}

/**
 * Record a warning and print it unless --quiet.
 * @param {string} msg
 */
function logWarning(msg) {
  warnings.push(msg);
  if (!quiet) process.stdout.write(`WARNING: ${msg}\n`);
}

// ---------------------------------------------------------------------------
// Check 1 — First non-empty line must be an H1
// ---------------------------------------------------------------------------

const firstNonEmptyLine = lines.find((l) => l.trim() !== '');
if (!firstNonEmptyLine || !/^#\s+\S/.test(firstNonEmptyLine)) {
  logError('First non-empty line is not an H1 heading (expected: # <title>)');
}

// ---------------------------------------------------------------------------
// Check 2 — One-liner: at least one paragraph between the H1 and the next H2
// ---------------------------------------------------------------------------

const firstH1Index = lines.findIndex((l) => /^#\s+\S/.test(l));
const nextH2AfterH1 =
  firstH1Index !== -1
    ? lines.findIndex((l, i) => i > firstH1Index && /^##\s/.test(l))
    : -1;

if (firstH1Index !== -1) {
  const slice =
    nextH2AfterH1 === -1
      ? lines.slice(firstH1Index + 1)
      : lines.slice(firstH1Index + 1, nextH2AfterH1);
  const paragraphLines = slice.filter((l) => l.trim() !== '' && !/^#+/.test(l));
  if (paragraphLines.length === 0) {
    logError('README.md must have at least one paragraph between the H1 and the first H2 (one-liner)');
  }
}

// ---------------------------------------------------------------------------
// Helpers for H2 + full-text pattern matching
// ---------------------------------------------------------------------------

/** Lower-cased H2 heading text from the document. */
const h2Headings = lines
  .filter((l) => /^##\s/.test(l))
  .map((l) => l.replace(/^##\s+/, '').trim().toLowerCase());

const fullTextLower = text.toLowerCase();

/**
 * Return true if any H2 heading matches the given pattern.
 * @param {RegExp} pattern
 */
function hasH2Matching(pattern) {
  return h2Headings.some((h) => pattern.test(h));
}

// ---------------------------------------------------------------------------
// Check 3a — Quickstart / Getting started (ERROR)
// ---------------------------------------------------------------------------

if (!hasH2Matching(/quickstart|getting\s+started/)) {
  logError('Missing required section: "## Quickstart" or "## Getting started"');
}

// ---------------------------------------------------------------------------
// Check 3b — License / MIT mention (ERROR)
// ---------------------------------------------------------------------------

if (!hasH2Matching(/license/) && !fullTextLower.includes('mit')) {
  logError('Missing required section: "## License" or an MIT mention in the file');
}

// ---------------------------------------------------------------------------
// Check 3c — Architecture / ARCHITECTURE.md link (ERROR)
// ---------------------------------------------------------------------------

if (!hasH2Matching(/architecture/) && !text.includes('ARCHITECTURE.md')) {
  logError(
    'Missing required "## Architecture" section or a link to ARCHITECTURE.md'
  );
}

// ---------------------------------------------------------------------------
// Check 3d — Status / CONTEXT.md link (ERROR)
// ---------------------------------------------------------------------------

if (!hasH2Matching(/status/) && !text.includes('CONTEXT.md')) {
  logError(
    'Missing required "## Status" section or a link to CONTEXT.md'
  );
}

// ---------------------------------------------------------------------------
// Check 4 — Shield badge in first 30 lines (WARNING)
// ---------------------------------------------------------------------------

const first30 = lines.slice(0, 30).join('\n');
if (!/!\[.*?\]\(.*?\)/.test(first30)) {
  logWarning('No shield/badge image found in the first 30 lines (recommended for visibility)');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const label = path.basename(filePath);
process.stdout.write(
  `\n${label}: ${errors.length} error${errors.length === 1 ? '' : 's'}, ` +
  `${warnings.length} warning${warnings.length === 1 ? '' : 's'}\n`
);

process.exit(errors.length > 0 ? 1 : 0);
