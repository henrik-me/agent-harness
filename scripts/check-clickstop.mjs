#!/usr/bin/env node
/**
 * scripts/check-clickstop.mjs — Clickstop document linter.
 *
 * Checks all .md files (direct children) under:
 *   <dir>/active/
 *   <dir>/done/
 *   <dir>/planned/
 *
 * Validates per file:
 *   - Filename convention: active_csNN_*.md / done_csNN_*.md / planned_csNN_*.md
 *   - Required header fields: Status, Owner, Branch, Started, Closed, Depends on
 *   - Lifecycle status invariant: directory name matches **Status:** value
 *
 * Usage:
 *   node scripts/check-clickstop.mjs --dir <path> [--quiet] [--help]
 *
 * Exit codes:
 *   0 — all files valid
 *   1 — at least one validation error
 *   2 — bad usage (missing required --dir flag)
 *
 * @module scripts/check-clickstop.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Fields whose `**FieldName:**` marker must appear in the file body. */
const REQUIRED_FIELDS = ['Status', 'Owner', 'Branch', 'Started', 'Closed', 'Depends on'];

/** Expected **Status:** value for each subdirectory. */
const DIR_STATUS = { active: 'active', done: 'done', planned: 'planned' };

/** Filename regex for each subdirectory (csNN optionally followed by a letter suffix). */
const FILENAME_RE = {
  active: /^active_cs\d+[a-z]*_.*\.md$/,
  done:   /^done_cs\d+[a-z]*_.*\.md$/,
  planned: /^planned_cs\d+[a-z]*_.*\.md$/,
};

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

let clickstopsDir = null;
let quiet = false;

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--dir' && argv[i + 1]) {
    clickstopsDir = argv[++i];
  } else if (a === '--quiet') {
    quiet = true;
  } else if (a === '--help' || a === '-h') {
    process.stdout.write(
      'Usage: check-clickstop.mjs --dir <path> [--quiet]\n\n' +
      'Lint all clickstop .md files under <path>/{active,done,planned}/.\n\n' +
      'Options:\n' +
      '  --dir <path>  Path to the clickstops/ root directory (required)\n' +
      '  --quiet       Suppress per-finding output; print only the summary\n' +
      '  --help        Print this help text\n'
    );
    process.exit(0);
  } else {
    process.stderr.write(`check-clickstop: unknown flag: ${a}\n`);
    process.exit(2);
  }
}

if (!clickstopsDir) {
  process.stderr.write(
    'check-clickstop: --dir <path> is required\n' +
    'Usage: check-clickstop.mjs --dir <path> [--quiet]\n'
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Finding collectors
// ---------------------------------------------------------------------------

const allErrors = [];

/**
 * Record an error and print it unless --quiet.
 *
 * @param {string} msg
 */
function logError(msg) {
  allErrors.push(msg);
  if (!quiet) process.stdout.write(`ERROR: ${msg}\n`);
}

// ---------------------------------------------------------------------------
// File checking
// ---------------------------------------------------------------------------

/**
 * Check a single clickstop .md file for all invariants.
 *
 * @param {string} filePath   Absolute path to the file.
 * @param {string} subdir     Subdirectory name: 'active' | 'done' | 'planned'.
 */
function checkFile(filePath, subdir) {
  const basename = path.basename(filePath);
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8')
      .replace(/^\uFEFF/, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
  } catch (err) {
    logError(`${basename}: cannot read file: ${err.message}`);
    return;
  }

  // 1. Filename convention
  if (!FILENAME_RE[subdir].test(basename)) {
    logError(
      `${subdir}/${basename}: filename does not match convention ` +
      `(expected ${subdir}_csNN_<slug>.md)`
    );
  }

  // 2. Required header fields
  for (const field of REQUIRED_FIELDS) {
    // Escape the space in "Depends on" for the regex
    const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[ \\t]+');
    const pattern = new RegExp(`\\*\\*${escaped}:\\*\\*`);
    if (!pattern.test(content)) {
      logError(`${subdir}/${basename}: missing required field "**${field}:**"`);
    }
  }

  // 3. Lifecycle status invariant
  const statusMatch = content.match(/\*\*Status:\*\*\s*(\S+)/);
  if (statusMatch) {
    const fileStatus = statusMatch[1].toLowerCase().replace(/[^a-z]/g, '');
    const expectedStatus = DIR_STATUS[subdir];
    if (fileStatus !== expectedStatus) {
      logError(
        `${subdir}/${basename}: **Status:** is "${statusMatch[1]}" but file ` +
        `is in ${subdir}/ (expected "${expectedStatus}")`
      );
    }
  }
  // Note: missing Status is already caught by the required-fields check above.
}

// ---------------------------------------------------------------------------
// Walk subdirectories
// ---------------------------------------------------------------------------

let filesChecked = 0;

for (const subdir of ['active', 'done', 'planned']) {
  const dirPath = path.join(clickstopsDir, subdir);

  // Skip subdirectory if it doesn't exist (graceful — useful for partial fixture trees)
  if (!fs.existsSync(dirPath)) continue;

  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (err) {
    logError(`cannot read directory ${subdir}/: ${err.message}`);
    continue;
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.md')) continue;
    if (entry.name === '.gitkeep') continue;

    checkFile(path.join(dirPath, entry.name), subdir);
    filesChecked++;
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

process.stdout.write(`\nclickstops: ${filesChecked} files checked, ${allErrors.length} errors\n`);

if (allErrors.length > 0) {
  process.stdout.write('\n❌ Linter FAILED\n');
  process.exit(1);
} else {
  process.stdout.write('\n✅ Linter passed\n');
  process.exit(0);
}
