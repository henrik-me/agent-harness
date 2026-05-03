#!/usr/bin/env node
/**
 * scripts/check-workboard.mjs — Linter for WORKBOARD.md.
 *
 * Validates required headings, table shapes, and CS-Task ID integrity in
 * WORKBOARD.md.
 *
 * Usage:
 *   node scripts/check-workboard.mjs --file <path> [--quiet]
 *
 * Exit codes:
 *   0 — no errors found
 *   1 — at least one validation error
 *   2 — bad invocation (missing --file)
 *
 * @module scripts/check-workboard.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHeadings, assertTableShape } from '../lib/doc-schema.mjs';

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
      process.stderr.write('check-workboard: missing value for --file\n');
      process.exit(2);
    }
    filePath = argv[++i];
  } else if (a === '--quiet') {
    quiet = true;
  } else if (a === '--help' || a === '-h') {
    process.stdout.write(
      'Usage: check-workboard.mjs --file <path> [--quiet]\n\n' +
      'Validate WORKBOARD.md structure and CS-Task ID integrity.\n\n' +
      'Options:\n' +
      '  --file <path>   Path to the WORKBOARD.md file to lint (REQUIRED)\n' +
      '  --quiet         Suppress per-finding output; print only the summary\n' +
      '  --help          Print this help text\n'
    );
    process.exit(0);
  } else {
    process.stderr.write(`check-workboard: unknown flag: ${a}\n`);
    process.exit(2);
  }
}

if (!filePath) {
  process.stderr.write('check-workboard: --file <path> is required\n');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Read target file
// ---------------------------------------------------------------------------

let markdownText;
try {
  markdownText = fs.readFileSync(filePath, 'utf8');
} catch (err) {
  process.stderr.write(`check-workboard: cannot read file "${filePath}": ${err.message}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Finding collectors
// ---------------------------------------------------------------------------

const errors = [];

/**
 * Record an error and print it unless --quiet.
 *
 * @param {string} msg
 */
function logError(msg) {
  errors.push(msg);
  if (!quiet) process.stdout.write(`ERROR: ${msg}\n`);
}

// ---------------------------------------------------------------------------
// Check 1 — Required headings present
// ---------------------------------------------------------------------------

const REQUIRED_HEADINGS = ['Orchestrators', 'Active Work', 'Recently Completed'];
const headingFindings = assertHeadings(markdownText, REQUIRED_HEADINGS);
for (const f of headingFindings) {
  logError(`Missing required heading: "${f.heading}"`);
}

// ---------------------------------------------------------------------------
// Check 2 — Orchestrators table shape
// ---------------------------------------------------------------------------

const ORCHESTRATOR_COLS = ['Agent ID', 'Machine', 'Repo Folder', 'Status', 'Last Seen'];
const orchFindings = assertTableShape(markdownText, 'Orchestrators', ORCHESTRATOR_COLS);
for (const f of orchFindings) {
  logError(f.message);
}

// ---------------------------------------------------------------------------
// Check 3 — Active Work table shape
// ---------------------------------------------------------------------------

const ACTIVE_WORK_COLS = [
  'CS-Task ID', 'Title', 'State', 'Owner', 'Branch', 'Last Updated', 'Blocked Reason',
];
const activeFindings = assertTableShape(markdownText, 'Active Work', ACTIVE_WORK_COLS);
for (const f of activeFindings) {
  logError(f.message);
}

// ---------------------------------------------------------------------------
// Check 4 — No orphan CS entries in Active Work
//   Each data row must have a CS-Task ID matching CS\d+, OR the em-dash
//   placeholder (— or —) when the Title contains "no active cs"
//   (case-insensitive).
// ---------------------------------------------------------------------------

/**
 * Parse data rows from the table immediately under a named heading.
 * Returns an array of objects mapping column headers to cell values.
 *
 * @param {string} text - Normalized markdown text.
 * @param {string} headingAnchor - Exact heading text to locate.
 * @returns {Array<Record<string, string>>}
 */
function parseTableRows(text, headingAnchor) {
  // Normalize line endings
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');

  // Find heading
  let headingIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^#{1,6}\s+(.+)$/);
    if (m && m[1].trim() === headingAnchor) {
      headingIdx = i;
      break;
    }
  }
  if (headingIdx === -1) return [];

  // Find table header row
  let tableHeaderIdx = -1;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue;
    if (line.startsWith('|')) { tableHeaderIdx = i; break; }
    if (/^#{1,6}\s/.test(lines[i])) break;
  }
  if (tableHeaderIdx === -1) return [];

  // Parse column names
  const headers = lines[tableHeaderIdx]
    .split('|')
    .map((c) => c.trim())
    .filter((c) => c !== '');

  // Skip separator row (line with only |, -, :, space)
  let dataStart = tableHeaderIdx + 1;
  if (dataStart < lines.length && /^\|[\s\-:|\s]+$/.test(lines[dataStart])) {
    dataStart++;
  }

  // Parse data rows until next heading or end of table
  const rows = [];
  for (let i = dataStart; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue;
    if (!line.startsWith('|')) break;
    if (/^#{1,6}\s/.test(lines[i])) break;

    const cells = lines[i]
      .split('|')
      .map((c) => c.trim())
      .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);

    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = cells[j] ?? '';
    }
    rows.push(row);
  }
  return rows;
}

// EM-dash variants: Unicode — (U+2014) and HTML entity &mdash;
const EM_DASH_RE = /^(\u2014|&mdash;|-{1,3})$/;

const activeRows = parseTableRows(markdownText, 'Active Work');
for (const row of activeRows) {
  const csId = (row['CS-Task ID'] ?? '').trim();
  const title = (row['Title'] ?? '').trim();

  const isPlaceholder = csId === '' || EM_DASH_RE.test(csId);

  if (isPlaceholder) {
    // Placeholder is allowed only when Title indicates no active work
    if (!/no active cs/i.test(title)) {
      logError(
        `Active Work row has empty or placeholder CS-Task ID but Title does not say ` +
        `"no active CS": Title="${title}"`
      );
    }
  } else {
    // Non-placeholder must match CS\d+
    if (!/^CS\d+$/.test(csId)) {
      logError(
        `Active Work row has invalid CS-Task ID "${csId}" — expected CS\\d+ format`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const label = path.basename(filePath);
process.stdout.write(`${label}: ${errors.length} error${errors.length === 1 ? '' : 's'}\n`);

process.exit(errors.length > 0 ? 1 : 0);
