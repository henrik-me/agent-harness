#!/usr/bin/env node
/**
 * scripts/check-instructions.mjs — Linter for INSTRUCTIONS.md.
 *
 * TODO(CS06b): migrate to lib/doc-schema.mjs primitives where applicable
 *
 * Validates:
 *   1. Required top-level (H2) headings are present.
 *   2. In-doc anchor links ([text](#anchor)) resolve to an existing heading.
 *   3. Headings with no content body emit a WARNING (dead-section detection).
 *
 * Usage:
 *   node scripts/check-instructions.mjs --file <path> [--quiet]
 *
 * Exit codes:
 *   0 — valid (warnings are printed but do not affect exit code)
 *   1 — at least one validation error
 *   2 — bad CLI usage (missing required --file flag)
 *
 * @module scripts/check-instructions.mjs
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
      process.stderr.write('check-instructions: missing value for --file\n');
      process.exit(2);
    }
    filePath = argv[++i];
  } else if (a === '--quiet') {
    quiet = true;
  } else if (a === '--help' || a === '-h') {
    process.stdout.write(
      'Usage: check-instructions.mjs --file <path> [--quiet]\n\n' +
      'Validate INSTRUCTIONS.md structure and cross-link integrity.\n\n' +
      'Options:\n' +
      '  --file <path>   Path to the INSTRUCTIONS.md file to lint (REQUIRED)\n' +
      '  --quiet         Suppress per-finding output; print only the summary\n' +
      '  --help          Print this help text\n'
    );
    process.exit(0);
  } else {
    process.stderr.write(`check-instructions: unknown flag: ${a}\n`);
    process.exit(2);
  }
}

if (!filePath) {
  process.stderr.write(
    'check-instructions: --file <path> is required\n' +
    'Usage: check-instructions.mjs --file <path> [--quiet]\n'
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Required H2 headings — derived from actual INSTRUCTIONS.md sections
// ---------------------------------------------------------------------------

const REQUIRED_HEADINGS = [
  'Quick Reference Checklist',
  'Per-CS Loop',
  'Pointers',
];

// ---------------------------------------------------------------------------
// Read the target file
// ---------------------------------------------------------------------------

let markdownText;
try {
  markdownText = fs.readFileSync(filePath, 'utf8');
} catch (err) {
  process.stderr.write(`check-instructions: cannot read file "${filePath}": ${err.message}\n`);
  process.exit(1);
}

const normalized = markdownText
  .replace(/^\uFEFF/, '')
  .replace(/\r\n/g, '\n')
  .replace(/\r/g, '\n');

const lines = normalized.split('\n');

// ---------------------------------------------------------------------------
// Finding collectors
// ---------------------------------------------------------------------------

const errors = [];
const warnings = [];

function logError(msg) {
  errors.push(msg);
  if (!quiet) process.stdout.write(`ERROR: ${msg}\n`);
}

function logWarning(msg) {
  warnings.push(msg);
  if (!quiet) process.stdout.write(`WARNING: ${msg}\n`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a heading text to a GitHub-flavoured anchor slug.
 * Algorithm: lowercase → remove chars not in [a-z0-9 \-] → spaces to hyphens.
 *
 * @param {string} text
 * @returns {string}
 */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')   // strip non-word, non-space, non-hyphen
    .replace(/\s+/g, '-')       // spaces → hyphens
    .replace(/_/g, '-')         // underscores → hyphens (rare in headings)
    .replace(/-+/g, '-')        // collapse consecutive hyphens
    .replace(/^-|-$/g, '');     // trim leading/trailing hyphens
}

// ---------------------------------------------------------------------------
// Parse headings from the document
// ---------------------------------------------------------------------------

/**
 * @typedef {{ level: number, text: string, slug: string, lineIndex: number }} Heading
 */

/** @type {Heading[]} */
const headings = [];

for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^(#{1,6})\s+(.+)$/);
  if (m) {
    const text = m[2].trim();
    headings.push({
      level: m[1].length,
      text,
      slug: slugify(text),
      lineIndex: i,
    });
  }
}

// Set of all slugs present in the document (for anchor validation).
const existingSlugs = new Set(headings.map((h) => h.slug));

// Set of H2 heading texts present in the document.
const existingH2Texts = new Set(
  headings.filter((h) => h.level === 2).map((h) => h.text)
);

// ---------------------------------------------------------------------------
// Check 1 — Required H2 headings
// ---------------------------------------------------------------------------

for (const required of REQUIRED_HEADINGS) {
  if (!existingH2Texts.has(required)) {
    logError(`Missing required heading: "## ${required}"`);
  }
}

// ---------------------------------------------------------------------------
// Check 2 — In-doc anchor cross-link integrity
//   Only links of the form [text](#anchor) are checked (in-doc anchors).
//   Cross-file links like [text](other.md#anchor) are ignored.
// ---------------------------------------------------------------------------

const anchorLinkRe = /\[([^\]]*)\]\(#([^)]+)\)/g;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  let match;
  while ((match = anchorLinkRe.exec(line)) !== null) {
    const anchor = match[2];
    if (!existingSlugs.has(anchor)) {
      logError(
        `Line ${i + 1}: broken anchor link "#${anchor}" — no matching heading found`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Check 3 — Dead-section detection
//   A heading is "dead" if the next non-blank line is another heading (or EOF).
// ---------------------------------------------------------------------------

for (let h = 0; h < headings.length; h++) {
  const heading = headings[h];
  const startLine = heading.lineIndex + 1;
  const endLine = h + 1 < headings.length ? headings[h + 1].lineIndex : lines.length;

  let hasContent = false;
  for (let l = startLine; l < endLine; l++) {
    if (lines[l].trim() !== '') {
      hasContent = true;
      break;
    }
  }

  if (!hasContent) {
    logWarning(
      `Line ${heading.lineIndex + 1}: heading "${'#'.repeat(heading.level)} ${heading.text}" has no content (dead section)`
    );
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const basename = path.basename(filePath);
process.stdout.write(`\n${basename}: ${errors.length} errors, ${warnings.length} warnings\n`);

if (errors.length > 0) {
  process.stdout.write('\n❌ Linter FAILED\n');
  process.exit(1);
} else {
  process.stdout.write('\n✅ Linter passed\n');
  process.exit(0);
}
