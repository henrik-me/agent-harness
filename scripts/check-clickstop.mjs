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
 * NOTE (CS35b): the planning-phase counterpart of the close-out
 * `## Plan-vs-implementation review` gate enforced here lives in
 * `scripts/check-clickstop-plan-review.mjs`. That script enforces the
 * `## Plan review` attestation section on planned/*.md and active/*.md
 * files; this script remains responsible for the close-out gate and the
 * core lifecycle invariants.
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
import { assertHeadings, extractSectionBody, headingAnchor } from '../lib/doc-schema.mjs';

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

/** Close-out task enforcement applies from CS15a close-out onward. */
const CLOSEOUT_TASK_ENFORCEMENT_DATE = '2026-05-10';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

let clickstopsDir = null;
let quiet = false;

/**
 * Return the value for a value-taking CLI flag or exit with usage.
 *
 * @param {string[]} args
 * @param {number} i
 * @param {string} flagName
 * @returns {string}
 */
function requireValue(args, i, flagName) {
  if (!args[i + 1] || args[i + 1].startsWith('-')) {
    process.stderr.write(
      `check-clickstop: missing value for ${flagName}\n` +
      'Usage: check-clickstop.mjs --dir <path> [--quiet]\n'
    );
    process.exit(2);
  }
  return args[i + 1];
}

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--dir') {
    clickstopsDir = requireValue(argv, i, '--dir');
    i++;
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

if (!fs.existsSync(clickstopsDir)) {
  process.stderr.write(
    `check-clickstop: directory not found: ${clickstopsDir}\n`
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

/**
 * Check whether a markdown heading with the given text exists at any level.
 *
 * @param {string} content
 * @param {string} heading
 * @returns {boolean}
 */
function hasMarkdownHeading(content, heading) {
  return assertHeadings(content, [heading]).length === 0;
}

/**
 * Parse markdown table rows from a section body.
 *
 * @param {string} sectionBody
 * @returns {string[]}
 */
function tableRows(sectionBody) {
  return sectionBody
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'))
    .filter((line) => !/^\|[\s\-:|]+\|?$/.test(line))
    .filter((line) => !/^\|\s*Task\s*\|/i.test(line));
}

/**
 * Determine whether close-out task rows are required for this file.
 *
 * @param {string} content
 * @param {string} subdir
 * @returns {boolean}
 */
function requiresCloseoutTasks(content, subdir) {
  if (subdir === 'active') return true;
  if (subdir !== 'done') return false;
  const closedMatch = content.match(/\*\*Closed:\*\*\s*(\d{4}-\d{2}-\d{2})/);
  return Boolean(closedMatch && closedMatch[1] >= CLOSEOUT_TASK_ENFORCEMENT_DATE);
}

/**
 * Check that the Tasks table includes explicit close-out hygiene rows.
 *
 * @param {string} content
 * @param {string} subdir
 * @param {string} basename
 */
function checkCloseoutTasks(content, subdir, basename) {
  if (!requiresCloseoutTasks(content, subdir)) return;

  const tasksBody = hasMarkdownHeading(content, 'Tasks')
    ? extractSectionBody(content, headingAnchor('Tasks'))
    : null;
  if (!tasksBody) {
    logError(
      `${subdir}/${basename}: missing required "## Tasks" section for close-out task enforcement`
    );
    return;
  }

  const rows = tableRows(tasksBody)
    .map((row) => row.replace(/\blearnings=\d+\b/gi, '').toLowerCase());

  const hasDocsTask = rows.some((row) =>
    /(close-?out|restart|docs?|documentation)/.test(row) &&
    /(workboard|context|handoff|instructions|relevant docs|restart|docs?|documentation)/.test(row)
  );
  const hasLearningsTask = rows.some((row) =>
    /(close-?out|learnings?|lrn|follow-?ups?|planned cs)/.test(row) &&
    /(learnings?|lrn|follow-?ups?|planned cs)/.test(row)
  );

  if (!hasDocsTask) {
    logError(
      `${subdir}/${basename}: ## Tasks must include an explicit close-out docs/restart-state task ` +
      `(see OPERATIONS.md close-out procedure)`
    );
  }
  if (!hasLearningsTask) {
    logError(
      `${subdir}/${basename}: ## Tasks must include an explicit close-out learnings/follow-up task ` +
      `(see RETROSPECTIVES.md and OPERATIONS.md close-out procedure)`
    );
  }
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

  // 4. Plan-vs-implementation review gate (CS03b)
  // active/ and done/ must have the H2; done/ must have content or grandfathering.
  // Anchored multi-line regex (CS03b R1 review fix): inline mention of the H2
  // in prose or fenced code must NOT satisfy the check.
  if (subdir === 'active' || subdir === 'done') {
    const GATE_H2_RE = /^## Plan-vs-implementation review\s*$/m;
    const hasGateHeading = hasMarkdownHeading(content, 'Plan-vs-implementation review');
    const headingMatch = content.match(GATE_H2_RE);
    if (!hasGateHeading || !headingMatch) {
      logError(
        `${subdir}/${basename}: missing required H2 section ` +
        `"## Plan-vs-implementation review" (CS03b gate)`
      );
    } else if (subdir === 'done') {
      const body = extractSectionBody(content, headingAnchor('Plan-vs-implementation review'));

      const GRANDFATHERING = '> Grandfathered: closed before plan-vs-implementation review gate was introduced (CS03b).';
      const hasGrandfathering = body.includes(GRANDFATHERING);
      const hasReviewer = /^\*\*Reviewer:\*\*/m.test(body);
      const hasDate = /^\*\*Date:\*\*/m.test(body);
      const hasOutcome = /^\*\*Outcome:\*\*/m.test(body);
      const hasAllFields = hasReviewer && hasDate && hasOutcome;

      if (!hasGrandfathering && !hasAllFields) {
        logError(
          `${subdir}/${basename}: "## Plan-vs-implementation review" section ` +
          `must contain Reviewer/Date/Outcome fields OR the grandfathering line`
        );
      }
    }
  }

  // 5. Close-out hygiene tasks (introduced after CS15a close-out)
  checkCloseoutTasks(content, subdir, basename);
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
