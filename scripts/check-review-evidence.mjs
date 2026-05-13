#!/usr/bin/env node
/**
 * scripts/check-review-evidence.mjs — PR-evidence A3+A4 linter.
 *
 * Runs both the A3 (model-audit independence) and A4 (stale-diff currency)
 * checks against a PR-body markdown file. Both checks parse the same body,
 * so they live in a single script (per CS36 Deliverable 3 / C36-6).
 *
 * A3 — model-audit independence check (per C36-8 / C35-4):
 *   Parses `## Model audit` section. Expected format: | Field | Value | key-value
 *   table (per REVIEWS.md §2.8). Extracts `Implementer models` (comma-separated)
 *   and `Reviewer model` (single value). Their intersection MUST be empty
 *   (case-insensitive, per C35-4).
 *
 * A4 — stale-diff currency check (per C36-7 / C35-3):
 *   Parses `## Review log` section. Expected columns (per C35-3 / REVIEWS.md §2.8):
 *   timestamp | analyzed_head | actor | model | verdict | evidence_link.
 *   Finds rows where `verdict` = "Go". The latest Go row's `analyzed_head` MUST
 *   equal `--head` (full 40-char SHA).
 *
 * Both sections are mandatory; their absence is a violation (per CS35 doctrine).
 *
 * Skip semantics (per C36-5 / C35-19):
 *   --skip-reasons workboard-only  → exit 0 (all gates skipped, per C35-7)
 *   --skip-reasons bot-author      → exit 0 (A3+A4 skipped, per C35-8)
 *   --skip-reasons fork-source     → does NOT skip A3/A4 (read-only gates)
 *
 * Usage:
 *   node scripts/check-review-evidence.mjs --pr-body <file> --head <sha>
 *     [--skip-reasons <csv>] [--quiet] [--help]
 *
 * Exit codes:
 *   0 — all checks pass (or skipped)
 *   1 — at least one violation
 *   2 — bad usage
 *
 * @module scripts/check-review-evidence.mjs
 */

import fs from 'node:fs';
import { extractSectionBody, headingAnchor } from '../lib/doc-schema.mjs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Full 40-char hex SHA pattern. */
const SHA40_RE = /^[0-9a-f]{40}$/i;

/**
 * Skip reasons that short-circuit all A3+A4 checks.
 * workboard-only: no CS content to audit (C35-7).
 * bot-author: bot PRs have no review log by construction (C35-8).
 */
const SKIP_ALL_REASONS = new Set(['workboard-only', 'bot-author']);

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const HELP = `\
Usage: check-review-evidence.mjs --pr-body <file> --head <sha> [options]

Validate A3 (model-audit independence) and A4 (stale-diff currency) in a PR body.

Options:
  --pr-body <file>       Path to a markdown file containing the PR body (required)
  --head <sha>           Full 40-char SHA of the current PR head (required)
  --skip-reasons <csv>   Comma-separated skip reasons. "workboard-only" and
                         "bot-author" short-circuit to exit 0 (A3+A4 skipped).
                         "fork-source" does not skip A3/A4 (read-only gates).
  --quiet                Suppress per-finding output; print only the summary line
  --help                 Print this help text

Exit codes:
  0  pass (or skipped)
  1  at least one violation
  2  bad usage
`;

let prBodyFile = null;
let headSha = null;
let skipReasons = new Set();
let quiet = false;

function requireValue(args, i, flag) {
  if (!args[i + 1] || args[i + 1].startsWith('-')) {
    process.stderr.write(`check-review-evidence: missing value for ${flag}\n${HELP}`);
    process.exit(2);
  }
  return args[i + 1];
}

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--pr-body') {
    prBodyFile = requireValue(argv, i, '--pr-body');
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
    process.stderr.write(`check-review-evidence: unknown flag: ${a}\n${HELP}`);
    process.exit(2);
  }
}

if (!prBodyFile) {
  process.stderr.write(`check-review-evidence: --pr-body <file> is required\n${HELP}`);
  process.exit(2);
}
if (!headSha) {
  process.stderr.write(`check-review-evidence: --head <sha> is required\n${HELP}`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Skip-reason short-circuit (per C36-5 / C35-19)
// ---------------------------------------------------------------------------

for (const reason of SKIP_ALL_REASONS) {
  if (skipReasons.has(reason)) {
    if (!quiet) {
      process.stdout.write(`check-review-evidence: skipped (${reason})\n`);
    }
    process.stdout.write('check-review-evidence: 0 errors, 0 warnings (skipped)\n');
    process.exit(0);
  }
}

// ---------------------------------------------------------------------------
// Read + normalize PR body
// ---------------------------------------------------------------------------

let prBodyContent;
try {
  prBodyContent = fs.readFileSync(prBodyFile, 'utf8')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
} catch (err) {
  process.stderr.write(`check-review-evidence: cannot read --pr-body file: ${err.message}\n`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Finding collectors
// ---------------------------------------------------------------------------

const errors = [];

function logError(msg) {
  errors.push(msg);
  if (!quiet) process.stdout.write(`ERROR: ${msg}\n`);
}

// ---------------------------------------------------------------------------
// Markdown table parser (shared by A3 and A4)
// ---------------------------------------------------------------------------

/**
 * Split one markdown table row into trimmed cell values.
 * Strips leading and trailing pipe before splitting.
 *
 * @param {string} line
 * @returns {string[]}
 */
function parseTableRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

/**
 * Parse a pipe-delimited markdown table from a section body string.
 * Skips the separator row (|---|---|...). Returns header cells and data rows.
 *
 * @param {string} body
 * @returns {{ headerCells: string[], dataRows: string[][] }}
 */
function parseMarkdownTable(body) {
  const lines = body.split('\n');
  let headerCells = null;
  const dataRows = [];
  let sawSeparator = false;

  for (const line of lines) {
    const stripped = line.trim();
    if (!stripped.startsWith('|')) continue;

    if (headerCells === null) {
      headerCells = parseTableRow(line);
      continue;
    }

    if (!sawSeparator) {
      if (/^\|[\s\-:|]+\|?$/.test(stripped)) {
        sawSeparator = true;
        continue;
      }
      // Separator row missing — treat as data row (column-count check fires later)
      dataRows.push(parseTableRow(line));
      continue;
    }

    dataRows.push(parseTableRow(line));
  }

  return { headerCells: headerCells || [], dataRows };
}

/**
 * Build a lowercase column-name → index map from a header cells array.
 * Allows case-insensitive, whitespace-trimmed column lookups.
 *
 * @param {string[]} headerCells
 * @returns {Map<string, number>}
 */
function buildColMap(headerCells) {
  const map = new Map();
  for (let i = 0; i < headerCells.length; i++) {
    map.set(headerCells[i].toLowerCase().trim(), i);
  }
  return map;
}

// ---------------------------------------------------------------------------
// A4 — Stale-diff currency check (per C36-7 / C35-3)
// ---------------------------------------------------------------------------

/**
 * A4: the latest `verdict=Go` row in `## Review log` must have an
 * `analyzed_head` equal to `--head`. Missing section, missing Go rows, and
 * malformed SHAs are all hard errors.
 */
function checkA4() {
  const sectionBody = extractSectionBody(prBodyContent, headingAnchor('Review log'));
  if (!sectionBody.trim()) {
    logError('## Review log section is missing; A4 (stale-diff currency) cannot be verified');
    return;
  }

  const { headerCells, dataRows } = parseMarkdownTable(sectionBody);
  if (!headerCells || headerCells.length === 0) {
    logError('## Review log: table has no header row');
    return;
  }

  const colMap = buildColMap(headerCells);
  const verdictIdx = colMap.get('verdict');
  const analyzedHeadIdx = colMap.get('analyzed_head');

  if (verdictIdx === undefined) {
    logError('## Review log: table is missing required "verdict" column');
    return;
  }
  if (analyzedHeadIdx === undefined) {
    logError('## Review log: table is missing required "analyzed_head" column');
    return;
  }

  const goRows = dataRows.filter(
    (cells) => cells.length > verdictIdx && cells[verdictIdx] === 'Go'
  );

  if (goRows.length === 0) {
    logError('no Go verdict row found in ## Review log');
    return;
  }

  // Latest Go row = last in document order
  const latestGoRow = goRows[goRows.length - 1];
  const analyzedHead = (
    latestGoRow.length > analyzedHeadIdx ? latestGoRow[analyzedHeadIdx] : ''
  ).trim();

  if (!SHA40_RE.test(analyzedHead)) {
    logError(
      `## Review log: latest Go row has malformed analyzed_head "${analyzedHead}" ` +
      `(expected full 40-char SHA)`
    );
    return;
  }

  if (analyzedHead.toLowerCase() !== headSha.toLowerCase()) {
    logError(
      `stale Go verdict: analyzed_head=${analyzedHead}, current head=${headSha}; ` +
      `re-review required`
    );
  }
}

// ---------------------------------------------------------------------------
// A3 — Model-audit independence check (per C36-8 / C35-4)
// ---------------------------------------------------------------------------

/**
 * A3: the `## Model audit` section (| Field | Value | format per REVIEWS.md §2.8
 * and C35-4) must have `Implementer models` and `Reviewer model` fields whose
 * values have an empty intersection (case-insensitive).
 */
function checkA3() {
  const sectionBody = extractSectionBody(prBodyContent, headingAnchor('Model audit'));
  if (!sectionBody.trim()) {
    logError('## Model audit section is missing; A3 (independence) cannot be verified');
    return;
  }

  const { headerCells, dataRows } = parseMarkdownTable(sectionBody);
  if (!headerCells || headerCells.length === 0) {
    logError('## Model audit: table has no header row');
    return;
  }
  if (dataRows.length === 0) {
    logError('## Model audit: table has no data rows; at least one row required');
    return;
  }

  const colMap = buildColMap(headerCells);
  const fieldIdx = colMap.get('field');
  const valueIdx = colMap.get('value');

  if (fieldIdx === undefined || valueIdx === undefined) {
    logError(
      '## Model audit: table is missing "Field" or "Value" columns ' +
      '(expected | Field | Value | key-value format per REVIEWS.md §2.8)'
    );
    return;
  }

  let implementerModelsRaw = null;
  let reviewerModelRaw = null;

  for (const cells of dataRows) {
    if (cells.length <= Math.max(fieldIdx, valueIdx)) continue;
    const fieldName = cells[fieldIdx].toLowerCase().trim();
    const value = cells[valueIdx];
    if (fieldName === 'implementer models') {
      implementerModelsRaw = value;
    } else if (fieldName === 'reviewer model') {
      reviewerModelRaw = value;
    }
  }

  if (implementerModelsRaw === null) {
    logError('## Model audit: "Implementer models" field not found in table');
    return;
  }
  if (reviewerModelRaw === null) {
    logError('## Model audit: "Reviewer model" field not found in table');
    return;
  }

  const implementerModels = implementerModelsRaw
    .split(',')
    .map((m) => m.trim().toLowerCase())
    .filter(Boolean);

  const reviewerModel = reviewerModelRaw.trim().toLowerCase();

  if (!reviewerModel) {
    logError('## Model audit: "Reviewer model" value is empty');
    return;
  }

  const overlap = implementerModels.filter((m) => m === reviewerModel);
  if (overlap.length > 0) {
    logError(
      `## Model audit: implementer models {${implementerModels.join(', ')}} ` +
      `overlap with reviewer model {${reviewerModel}}`
    );
  }
}

// ---------------------------------------------------------------------------
// Run checks
// ---------------------------------------------------------------------------

checkA4();
checkA3();

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

process.stdout.write(
  `check-review-evidence: ${errors.length} errors, 0 warnings\n`
);
process.exit(errors.length > 0 ? 1 : 0);
