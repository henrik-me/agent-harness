#!/usr/bin/env node
/**
 * scripts/check-architecture.mjs — Linter for ARCHITECTURE.md.
 *
 * Validates that ARCHITECTURE.md:
 *   1. Contains all required top-level section headings.
 *   2. Has no broken relative internal links.
 *
 * Usage:
 *   node scripts/check-architecture.mjs --file <path> [--quiet]
 *
 * Exit codes:
 *   0 — no errors
 *   1 — at least one validation error
 *   2 — usage error (missing --file)
 *
 * @module scripts/check-architecture.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHeadings, resolveLinks } from '../lib/doc-schema.mjs';

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
      process.stderr.write('check-architecture: missing value for --file\n');
      process.exit(2);
    }
    filePath = argv[++i];
  } else if (a === '--quiet') {
    quiet = true;
  } else if (a === '--help' || a === '-h') {
    process.stdout.write(
      'Usage: check-architecture.mjs --file <path> [--quiet]\n\n' +
      'Validate ARCHITECTURE.md for required headings and broken links.\n\n' +
      'Options:\n' +
      '  --file <path>   Path to the ARCHITECTURE.md file to lint (REQUIRED)\n' +
      '  --quiet         Suppress per-finding output; print only the summary\n' +
      '  --help          Print this help text\n'
    );
    process.exit(0);
  } else {
    process.stderr.write(`check-architecture: unknown flag: ${a}\n`);
    process.exit(2);
  }
}

if (!filePath) {
  process.stderr.write('check-architecture: --file <path> is required\n');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Required headings (derived from the actual ARCHITECTURE.md in this repo)
// ---------------------------------------------------------------------------

const REQUIRED_HEADINGS = [
  'Overview',
  'Components',
  'Data model',
  'Decision log',
];

// ---------------------------------------------------------------------------
// Read target file
// ---------------------------------------------------------------------------

let markdownText;
try {
  markdownText = fs.readFileSync(filePath, 'utf8');
} catch (err) {
  process.stderr.write(`check-architecture: cannot read file "${filePath}": ${err.message}\n`);
  process.exit(1);
}

const baseDir = path.dirname(path.resolve(filePath));

// ---------------------------------------------------------------------------
// Finding collectors
// ---------------------------------------------------------------------------

const errors = [];

/**
 * Record an error finding and print it unless --quiet is active.
 *
 * @param {string} msg
 */
function logError(msg) {
  errors.push(msg);
  if (!quiet) process.stdout.write(`ERROR: ${msg}\n`);
}

// ---------------------------------------------------------------------------
// Check 1 — Required headings
// ---------------------------------------------------------------------------

const headingFindings = assertHeadings(markdownText, REQUIRED_HEADINGS);
for (const f of headingFindings) {
  logError(`Missing required heading: "## ${f.heading}"`);
}

// ---------------------------------------------------------------------------
// Check 2 — No broken internal links
// ---------------------------------------------------------------------------

const brokenLinks = resolveLinks(markdownText, baseDir);
for (const link of brokenLinks) {
  logError(`Broken link at line ${link.lineNumber}: "${link.href}"`);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const label = path.basename(filePath);
process.stdout.write(`\n${label}: ${errors.length} error${errors.length === 1 ? '' : 's'}\n`);

if (errors.length > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
