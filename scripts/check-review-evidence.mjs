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
import { headingAnchor } from '../lib/doc-schema.mjs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Full 40-char hex SHA pattern. */
const SHA40_RE = /^[0-9a-f]{40}$/i;

/** ISO 8601 timestamp (UTC, second-precision) per REVIEWS.md §2.7 example. */
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/** REVIEWS.md §2.7 canonical Review log columns (all required, lowercase). */
const REVIEW_LOG_REQUIRED_COLS = [
  'timestamp', 'analyzed_head', 'actor', 'model', 'verdict', 'evidence_link',
];

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
  --strict-agent-columns Treat missing Implementer/Reviewer agent rows as errors (DEFAULT
                         since v0.6.0; CS53 C53-5 / CS42 C42-6 promise)
  --no-strict-agent-columns
                         Opt out of strict-agent-columns (transitional flag; missing
                         agent rows become warnings rather than errors)
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
let strictAgentColumns = true;
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
  } else if (a === '--strict-agent-columns') {
    strictAgentColumns = true;
  } else if (a === '--no-strict-agent-columns') {
    strictAgentColumns = false;
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
const warnings = [];

function logError(msg) {
  errors.push(msg);
  if (!quiet) process.stdout.write(`ERROR: ${msg}\n`);
}

function logWarning(msg) {
  warnings.push(msg);
  if (!quiet) process.stderr.write(`WARN:  ${msg}\n`);
}

// ---------------------------------------------------------------------------
// Markdown table parser (shared by A3 and A4)
// ---------------------------------------------------------------------------

/**
 * Find the H2 section by anchor and return both its body and the absolute
 * 1-based line number of the heading (so callers can compute global line
 * numbers for individual rows — needed for actionable C36-9 error messages).
 *
 * @param {string} content
 * @param {string} anchor
 * @returns {{ body: string, headingLine: number } | null}
 */
function extractSectionWithLineNumber(content, anchor) {
  const lines = content.split('\n');
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^##\s+(.+?)\s*$/);
    if (m && headingAnchor(m[1].trim()) === anchor) {
      startIdx = i;
      break;
    }
  }
  if (startIdx === -1) return null;

  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^#{1,2}\s/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }

  return {
    body: lines.slice(startIdx + 1, endIdx).join('\n'),
    headingLine: startIdx + 1,
  };
}

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
 * Skips the separator row (|---|---|...). Returns header cells, data rows,
 * and the within-section 0-based line index of each data row (so callers
 * can compute global line numbers using `headingLine + 1 + rowLineOffset`).
 *
 * @param {string} body
 * @returns {{ headerCells: string[], dataRows: string[][], rowLineOffsets: number[] }}
 */
function parseMarkdownTable(body) {
  const lines = body.split('\n');
  let headerCells = null;
  const dataRows = [];
  const rowLineOffsets = [];
  let sawSeparator = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
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
      rowLineOffsets.push(i);
      continue;
    }

    dataRows.push(parseTableRow(line));
    rowLineOffsets.push(i);
  }

  return { headerCells: headerCells || [], dataRows, rowLineOffsets };
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
 * `analyzed_head` equal to `--head`. Per REVIEWS.md §2.7, the table MUST
 * also have all canonical columns and rows MUST have ISO 8601 timestamps.
 * Missing section, missing required columns, malformed timestamps, malformed
 * SHAs, and stale heads are all hard errors with file:line + fix hints
 * (per C36-9 actionable-error requirement).
 */
function checkA4() {
  const section = extractSectionWithLineNumber(prBodyContent, headingAnchor('Review log'));
  if (!section) {
    logError(
      `${prBodyFile}: ## Review log section is missing; ` +
      `A4 (stale-diff currency) cannot be verified. ` +
      `Fix: add a "## Review log" H2 section with the canonical column set ` +
      `(${REVIEW_LOG_REQUIRED_COLS.join(' | ')}) per REVIEWS.md §2.7.`
    );
    return;
  }
  const { body: sectionBody, headingLine } = section;

  const { headerCells, dataRows, rowLineOffsets } = parseMarkdownTable(sectionBody);
  if (!headerCells || headerCells.length === 0) {
    logError(
      `${prBodyFile}:${headingLine}: ## Review log table has no header row. ` +
      `Fix: add a header row "${REVIEW_LOG_REQUIRED_COLS.join(' | ')}" per REVIEWS.md §2.7.`
    );
    return;
  }

  const colMap = buildColMap(headerCells);
  const missingCols = REVIEW_LOG_REQUIRED_COLS.filter((c) => colMap.get(c) === undefined);
  if (missingCols.length > 0) {
    logError(
      `${prBodyFile}:${headingLine}: ## Review log table is missing required column(s): ` +
      `${missingCols.join(', ')}. ` +
      `Fix: header row must be "${REVIEW_LOG_REQUIRED_COLS.join(' | ')}" per REVIEWS.md §2.7.`
    );
    return;
  }

  const verdictIdx = colMap.get('verdict');
  const analyzedHeadIdx = colMap.get('analyzed_head');
  const timestampIdx = colMap.get('timestamp');

  // Validate timestamp format on EVERY row (not just Go rows) — schema integrity
  // matters across the full log per C35-3.
  for (let i = 0; i < dataRows.length; i++) {
    const cells = dataRows[i];
    if (cells.length <= timestampIdx) continue; // column-count check fires below if needed
    const ts = (cells[timestampIdx] || '').trim();
    if (!ts) {
      logError(
        `${prBodyFile}:${headingLine + 1 + rowLineOffsets[i]}: ` +
        `## Review log row ${i + 1}: empty "timestamp" column. ` +
        `Fix: set timestamp to the UTC ISO 8601 instant when the review completed (e.g. 2026-05-13T18:42:00Z).`
      );
      return;
    }
    if (!ISO_TIMESTAMP_RE.test(ts)) {
      logError(
        `${prBodyFile}:${headingLine + 1 + rowLineOffsets[i]}: ` +
        `## Review log row ${i + 1}: malformed timestamp "${ts}" ` +
        `(expected ISO 8601 UTC like 2026-05-13T18:42:00Z). ` +
        `Fix: replace with a strict ISO timestamp matching ^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$.`
      );
      return;
    }
  }

  const goRowIndices = [];
  for (let i = 0; i < dataRows.length; i++) {
    const cells = dataRows[i];
    if (cells.length > verdictIdx && cells[verdictIdx] === 'Go') {
      goRowIndices.push(i);
    }
  }

  if (goRowIndices.length === 0) {
    logError(
      `${prBodyFile}:${headingLine}: ## Review log has no row with verdict="Go". ` +
      `Fix: dispatch a reviewer per REVIEWS.md §2.2 ladder, then append a row ` +
      `with verdict=Go and analyzed_head=<current PR HEAD SHA>.`
    );
    return;
  }

  // Latest Go row = last in document order
  const latestGoIdx = goRowIndices[goRowIndices.length - 1];
  const latestGoRow = dataRows[latestGoIdx];
  const latestGoLine = headingLine + 1 + rowLineOffsets[latestGoIdx];
  const analyzedHead = (
    latestGoRow.length > analyzedHeadIdx ? latestGoRow[analyzedHeadIdx] : ''
  ).trim();

  if (!SHA40_RE.test(analyzedHead)) {
    logError(
      `${prBodyFile}:${latestGoLine}: ` +
      `## Review log latest Go row has malformed analyzed_head "${analyzedHead}" ` +
      `(expected full 40-char SHA, got ${analyzedHead.length} chars). ` +
      `Fix: replace with the output of "git rev-parse HEAD" on the PR branch.`
    );
    return;
  }

  if (analyzedHead.toLowerCase() !== headSha.toLowerCase()) {
    logError(
      `${prBodyFile}:${latestGoLine}: ` +
      `stale Go verdict — analyzed_head="${analyzedHead}" but current PR HEAD="${headSha}". ` +
      `Fix: re-dispatch the reviewer against the current HEAD per REVIEWS.md §2.2 ` +
      `(stale-diff doctrine), then append a new row with analyzed_head="${headSha}".`
    );
  }
}

// ---------------------------------------------------------------------------
// A3 — Model-audit independence check (per C36-8 / C35-4)
// ---------------------------------------------------------------------------

/**
 * A3: the `## Model audit` section (| Field | Value | format per REVIEWS.md §2.8
 * and C35-4) must have `Implementer models` and `Reviewer model` fields whose
 * values have an empty intersection (case-insensitive). All errors include
 * file:line + a fix hint per C36-9.
 */
function checkA3() {
  const section = extractSectionWithLineNumber(prBodyContent, headingAnchor('Model audit'));
  if (!section) {
    logError(
      `${prBodyFile}: ## Model audit section is missing; ` +
      `A3 (independence) cannot be verified. ` +
      `Fix: add a "## Model audit" H2 section with the | Field | Value | key-value table per REVIEWS.md §2.8.`
    );
    return;
  }
  const { body: sectionBody, headingLine } = section;

  const { headerCells, dataRows, rowLineOffsets } = parseMarkdownTable(sectionBody);
  if (!headerCells || headerCells.length === 0) {
    logError(
      `${prBodyFile}:${headingLine}: ## Model audit table has no header row. ` +
      `Fix: add a header row "| Field | Value |" per REVIEWS.md §2.8.`
    );
    return;
  }
  if (dataRows.length === 0) {
    logError(
      `${prBodyFile}:${headingLine}: ## Model audit table has no data rows; ` +
      `at least Implementer models and Reviewer model rows are required. ` +
      `Fix: see REVIEWS.md §2.8 for the canonical key-value rows.`
    );
    return;
  }

  const colMap = buildColMap(headerCells);
  const fieldIdx = colMap.get('field');
  const valueIdx = colMap.get('value');

  if (fieldIdx === undefined || valueIdx === undefined) {
    logError(
      `${prBodyFile}:${headingLine}: ` +
      `## Model audit table is missing "Field" or "Value" columns ` +
      `(expected | Field | Value | key-value format per REVIEWS.md §2.8). ` +
      `Fix: replace the header row with "| Field | Value |".`
    );
    return;
  }

  let implementerModelsRaw = null;
  let reviewerModelRaw = null;
  let implementerAgentRaw = null;
  let reviewerAgentRaw = null;
  let implementerModelsLine = headingLine;
  let reviewerModelLine = headingLine;
  let implementerAgentLine = headingLine;
  let reviewerAgentLine = headingLine;

  for (let i = 0; i < dataRows.length; i++) {
    const cells = dataRows[i];
    if (cells.length <= Math.max(fieldIdx, valueIdx)) continue;
    const fieldName = cells[fieldIdx].toLowerCase().trim();
    const value = cells[valueIdx];
    const rowLine = headingLine + 1 + rowLineOffsets[i];
    if (fieldName === 'implementer models') {
      implementerModelsRaw = value;
      implementerModelsLine = rowLine;
    } else if (fieldName === 'reviewer model') {
      reviewerModelRaw = value;
      reviewerModelLine = rowLine;
    } else if (fieldName === 'implementer agent') {
      implementerAgentRaw = value;
      implementerAgentLine = rowLine;
    } else if (fieldName === 'reviewer agent') {
      reviewerAgentRaw = value;
      reviewerAgentLine = rowLine;
    }
  }

  if (implementerModelsRaw === null) {
    logError(
      `${prBodyFile}:${headingLine}: ` +
      `## Model audit "Implementer models" row not found. ` +
      `Fix: add a row "| Implementer models | <comma-separated model ids> |" per REVIEWS.md §2.8.`
    );
    return;
  }
  if (reviewerModelRaw === null) {
    logError(
      `${prBodyFile}:${headingLine}: ` +
      `## Model audit "Reviewer model" row not found. ` +
      `Fix: add a row "| Reviewer model | <single model id from C35-2 ladder> |" per REVIEWS.md §2.8.`
    );
    return;
  }

  const implementerAgentTrimmed = implementerAgentRaw === null ? '' : implementerAgentRaw.trim();
  const reviewerAgentTrimmed = reviewerAgentRaw === null ? '' : reviewerAgentRaw.trim();

  const missingAgentFields = [];
  if (implementerAgentTrimmed === '') missingAgentFields.push('Implementer agent');
  if (reviewerAgentTrimmed === '') missingAgentFields.push('Reviewer agent');
  if (missingAgentFields.length > 0) {
    const message =
      `${prBodyFile}:${headingLine}: ` +
      `## Model audit missing required agent row(s) (absent or empty): ${missingAgentFields.join(', ')}. ` +
      `Fix: add rows "| Implementer agent | <github-login> |" and ` +
      `"| Reviewer agent | <github-login> |" with distinct GitHub usernames per REVIEWS.md §2.8.`;
    if (strictAgentColumns) logError(message);
    else logWarning(message);
  } else {
    const implementerAgent = implementerAgentTrimmed.toLowerCase();
    const reviewerAgent = reviewerAgentTrimmed.toLowerCase();
    if (implementerAgent === reviewerAgent) {
      logError(
        `${prBodyFile}:${reviewerAgentLine}: ` +
        `## Model audit agent-identity violation — Implementer agent and Reviewer agent ` +
        `are both "${reviewerAgentTrimmed}" (case-insensitive compare). ` +
        `Fix: dispatch a reviewer under a different GitHub identity and update ` +
        `the Reviewer agent row at ${prBodyFile}:${reviewerAgentLine}.`
      );
    }
  }

  const implementerModels = implementerModelsRaw
    .split(',')
    .map((m) => m.trim().toLowerCase())
    .filter(Boolean);

  const reviewerModel = reviewerModelRaw.trim().toLowerCase();

  if (!reviewerModel) {
    logError(
      `${prBodyFile}:${reviewerModelLine}: ` +
      `## Model audit "Reviewer model" value is empty. ` +
      `Fix: set to a single model id from the C35-2 fallback ladder (e.g. gpt-5.6-sol).`
    );
    return;
  }

  const overlap = implementerModels.filter((m) => m === reviewerModel);
  if (overlap.length > 0) {
    logError(
      `${prBodyFile}:${reviewerModelLine}: ` +
      `## Model audit independence violation — implementer models {${implementerModels.join(', ')}} ` +
      `overlap with reviewer model {${reviewerModel}}. ` +
      `Fix: dispatch a different reviewer per the C35-2 fallback ladder ` +
      `(GPT-highest-available → Sonnet-highest → orchestrator's-own with independence invariant); ` +
      `then update the Reviewer model row at ${prBodyFile}:${reviewerModelLine} ` +
      `and append a new ## Review log Go row for the new analyzed_head.`
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
  `check-review-evidence: ${errors.length} errors, ${warnings.length} warnings\n`
);
process.exit(errors.length > 0 ? 1 : 0);
