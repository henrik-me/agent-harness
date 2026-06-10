#!/usr/bin/env node
/**
 * scripts/check-clickstop-plan-review.mjs — Plan-review attestation linter.
 *
 * Validates that every clickstop plan file under
 *   <dir>/planned/*.md
 *   <dir>/active/*.md
 * carries a well-formed `## Plan review` section recording one or more
 * independent plan reviews (per CS35b decisions C35b-1 through C35b-15).
 *
 * Files under <dir>/done/ are SKIPPED — the close-out gate
 * `## Plan-vs-implementation review` already covers that surface (CS03b,
 * enforced in scripts/check-clickstop.mjs).
 *
 * Schema (per C35b-2):
 *   ## Plan review
 *   | Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
 *   |---|---|---|---|---|---|---|---|
 *   | R1 | <reviewer-model> | <author-model-1,author-model-2,...> | <agent-id> | <12-char-hash> | YYYY-MM-DDThh:mm:ssZ | Go|Go-with-amendments|Needs-Fix | <≤200 chars> |
 *   ...
 *
 * Rules enforced:
 *   - Section presence (controlled by --strict + --mode per C35b-9/10).
 *   - Header-row column count (8 columns).
 *   - At least one data row.
 *   - Round labels follow R<digit>+ pattern.
 *   - Independence: Reviewer model MUST NOT appear in any row's Plan author
 *     model(s) (accumulated across all rows; per C35b-4).
 *   - Timestamp is ISO-8601 UTC (YYYY-MM-DDThh:mm:ssZ).
 *   - Verdict is in the enum {Go, Go-with-amendments, Needs-Fix} (C35b-5).
 *   - Findings recap ≤ 200 characters.
 *   - Hash freshness: latest row's "Reviewed sections hash" MUST equal the
 *     SHA-256-prefix-12 of the current Decisions+Deliverables content
 *     (per C35b-3, computed via lib/plan-review-hash.mjs).
 *   - Latest verdict MUST be Go or Go-with-amendments (C35b-5).
 *
 * Mode + strictness (per C35b-9, C35b-10, C42-7):
 *   --mode standalone   (default) — `--strict` defaults to TRUE in v0.5.0
 *                                  (CS42 flipped from v0.4.0's warn-only
 *                                  default per CS35b-10 migration ramp).
 *                                  Pass `--strict false` to opt out.
 *   --mode pr-evidence  — STRICT regardless of --strict flag (A6 gate).
 *                         The asymmetry between local convenience and PR
 *                         enforcement was the v0.4.0 mechanism that closed
 *                         the gap; v0.5.0 collapses the asymmetry to "always
 *                         strict by default" while preserving the explicit
 *                         opt-out for repos still mid-migration.
 *
 * Once a `## Plan review` section IS present, schema/independence/hash/
 * verdict violations are ALWAYS errors, regardless of --strict or --mode —
 * the warn-only behavior applies SOLELY to "section absent entirely".
 *
 * Skip-reasons (per C35b-11):
 *   In pr-evidence mode, --skip-reasons workboard-only short-circuits to a
 *   pass (workboard-only PRs do not carry plan content).
 *   Other skip reasons (bot-author, fork-source) DO NOT skip A6: read-only
 *   gate; missing attestation is still a violation regardless of who
 *   authored the diff.
 *
 * Usage:
 *   node scripts/check-clickstop-plan-review.mjs --dir <path> \
 *     [--mode standalone|pr-evidence] [--strict true|false] \
 *     [--skip-reasons <csv>] [--files <csv>] [--quiet] [--help]
 *
 * The `--files` flag (added per PR #154 R1 review) restricts linting to an
 * explicit list of files (typically the PR diff). Files outside the
 * planned/active subdirs are silently skipped, so the caller can pass the
 * full diff via `gh pr diff --name-only` without any pre-filtering.
 * Without `--files`, every file in <dir>/planned/ + <dir>/active/ is scanned.
 *
 * Exit codes:
 *   0 — all files pass (or warn-only on missing-section in standalone mode)
 *   1 — at least one strict violation (missing section in strict mode, OR
 *       any schema/independence/hash/verdict violation regardless of mode)
 *   2 — bad usage
 *
 * @module scripts/check-clickstop-plan-review.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  assertHeadings,
  extractSectionBody,
  headingAnchor,
} from '../lib/doc-schema.mjs';
import { computePlanReviewHashFromText } from '../lib/plan-review-hash.mjs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Subdirectories whose .md files are linted (per C35b-7). done/ skipped. */
const LINTED_SUBDIRS = ['planned', 'active'];

/** Required column headers for the `## Plan review` table (per C35b-2). */
const REQUIRED_COLUMNS = [
  'Round',
  'Reviewer model',
  'Plan author model(s)',
  'Reviewer agent',
  'Reviewed sections hash',
  'Timestamp (UTC)',
  'Verdict',
  'Findings recap (≤200 chars)',
];

/** Permitted verdict values (per C35b-5). */
const VERDICT_ENUM = new Set(['Go', 'Go-with-amendments', 'Needs-Fix']);

/** Verdicts that allow the file to be considered "reviewed pass". */
const PASSING_VERDICTS = new Set(['Go', 'Go-with-amendments']);

/** Maximum length of the Findings recap field (per C35b-2). */
const MAX_FINDINGS_RECAP = 200;

/** ISO-8601 UTC timestamp regex: YYYY-MM-DDThh:mm:ssZ. */
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/** Round label regex: R<positive-integer>. */
const ROUND_LABEL_RE = /^R\d+$/;

/** 12-char lowercase hex regex. */
const HASH_RE = /^[0-9a-f]{12}$/;

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

let clickstopsDir = null;
let mode = 'standalone';
let strict = true;
let strictExplicit = false;
let skipReasons = new Set();
let quiet = false;
// When provided, restrict linting to this explicit file list (typically the
// PR's changed files). Files outside planned/ or active/ are silently
// skipped — the caller is expected to pass a superset (e.g. `gh pr diff
// --name-only`) and let the linter filter. Per CS35b R2 review (PR #154):
// without this flag the linter walks every planned/active file in the repo,
// which would fail unrelated PRs because of pre-arc grandfathered files.
let filesFilter = null;

const HELP = [
  'Usage: check-clickstop-plan-review.mjs --dir <path> [options]',
  '',
  'Validate `## Plan review` attestation sections on planned/*.md and active/*.md',
  'clickstop files. Done files are skipped (close-out gate covers them).',
  '',
  'Options:',
  '  --dir <path>           Path to the clickstops/ root directory (required)',
  '  --mode <m>             standalone (default) | pr-evidence',
  '                         pr-evidence forces strict regardless of --strict',
  '  --strict <bool>        true|false (default true in standalone mode in v0.5.0;',
  '                         CS42 flipped the default from false per CS35b-10 ramp;',
  '                         pass --strict false to opt out of the strict default).',
  '                         Applies only to "section entirely absent". Schema /',
  '                         independence / hash / verdict violations are always errors.',
  '  --skip-reasons <csv>   In pr-evidence mode, "workboard-only" short-circuits',
  '                         to a pass. Other reasons do not skip this gate.',
  '  --files <csv>          Restrict linting to this explicit list of files',
  '                         (paths relative to repo root or absolute). Files',
  '                         not under <dir>/planned/ or <dir>/active/ are',
  '                         silently skipped. Intended for PR-evidence mode',
  '                         driven by `gh pr diff --name-only`. Without this',
  '                         flag, every planned/active file is scanned.',
  '  --quiet                Suppress per-finding output; print only the summary',
  '  --help                 Print this help text',
  '',
  'Exit codes:',
  '  0  pass (or warn-only on missing section with --strict=false in standalone mode)',
  '  1  strict violation OR schema/independence/hash/verdict violation',
  '  2  bad usage',
  '',
].join('\n');

function requireValue(args, i, flagName) {
  if (!args[i + 1] || args[i + 1].startsWith('-')) {
    process.stderr.write(
      `check-clickstop-plan-review: missing value for ${flagName}\n${HELP}`
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
  } else if (a === '--mode') {
    mode = requireValue(argv, i, '--mode');
    if (mode !== 'standalone' && mode !== 'pr-evidence') {
      process.stderr.write(
        `check-clickstop-plan-review: --mode must be 'standalone' or 'pr-evidence', got '${mode}'\n`
      );
      process.exit(2);
    }
    i++;
  } else if (a === '--strict') {
    const value = requireValue(argv, i, '--strict');
    if (value !== 'true' && value !== 'false') {
      process.stderr.write(
        `check-clickstop-plan-review: --strict must be 'true' or 'false', got '${value}'\n`
      );
      process.exit(2);
    }
    strict = value === 'true';
    strictExplicit = true;
    i++;
  } else if (a === '--skip-reasons') {
    const csv = requireValue(argv, i, '--skip-reasons');
    skipReasons = new Set(csv.split(',').map((s) => s.trim()).filter(Boolean));
    i++;
  } else if (a === '--files') {
    const csv = requireValue(argv, i, '--files');
    filesFilter = csv.split(',').map((s) => s.trim()).filter(Boolean);
    i++;
  } else if (a === '--quiet') {
    quiet = true;
  } else if (a === '--help' || a === '-h') {
    process.stdout.write(HELP);
    process.exit(0);
  } else {
    process.stderr.write(`check-clickstop-plan-review: unknown flag: ${a}\n${HELP}`);
    process.exit(2);
  }
}

if (!clickstopsDir) {
  process.stderr.write(`check-clickstop-plan-review: --dir <path> is required\n${HELP}`);
  process.exit(2);
}

if (!fs.existsSync(clickstopsDir)) {
  process.stderr.write(
    `check-clickstop-plan-review: directory not found: ${clickstopsDir}\n`
  );
  process.exit(2);
}

// pr-evidence mode forces strict on missing-section per C35b-9.
const effectiveStrict = mode === 'pr-evidence' ? true : strict;

// In pr-evidence mode with workboard-only skip reason, short-circuit (C35b-11).
if (mode === 'pr-evidence' && skipReasons.has('workboard-only')) {
  if (!quiet) {
    process.stdout.write(
      'check-clickstop-plan-review: skipped (workboard-only PR carries no plan content)\n'
    );
  }
  process.stdout.write('check-clickstop-plan-review: 0 errors, 0 warnings (skipped)\n');
  process.exit(0);
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
  if (!quiet) process.stdout.write(`WARN:  ${msg}\n`);
}

// ---------------------------------------------------------------------------
// Plan-review section parser
// ---------------------------------------------------------------------------

/**
 * Split a markdown table row into trimmed cell values.
 *
 * Strips the leading and trailing pipe (if present), splits on `|`,
 * trims each cell. Does NOT attempt to handle escaped pipes; clickstop
 * tables don't use them.
 *
 * @param {string} line
 * @returns {string[]}
 */
function parseTableRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((cell) => cell.trim());
}

/**
 * Extract the `## Plan review` table from a markdown document.
 *
 * @param {string} content
 * @returns {{
 *   present: boolean,
 *   headerCells: string[]|null,
 *   dataRows: Array<{ cells: string[], lineNumber: number }>,
 *   raw: string,
 * }}
 */
function extractPlanReviewTable(content) {
  const hasH2 = assertHeadings(content, ['Plan review']).length === 0;
  if (!hasH2) {
    return { present: false, headerCells: null, dataRows: [], raw: '' };
  }

  const body = extractSectionBody(content, headingAnchor('Plan review'));
  const lines = body.split('\n');

  let headerCells = null;
  const dataRows = [];
  let sawSeparator = false;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const stripped = line.trim();
    if (!stripped.startsWith('|')) continue;

    if (headerCells === null) {
      headerCells = parseTableRow(line);
      continue;
    }

    if (!sawSeparator) {
      // Markdown table separator row: |---|---|...
      if (/^\|[\s\-:|]+\|?$/.test(stripped)) {
        sawSeparator = true;
        continue;
      }
      // No separator row encountered before next pipe row — table malformed.
      // Treat as data row anyway so the column-count check fires.
      dataRows.push({ cells: parseTableRow(line), lineNumber: idx });
      continue;
    }

    dataRows.push({ cells: parseTableRow(line), lineNumber: idx });
  }

  return { present: true, headerCells, dataRows, raw: body };
}

// ---------------------------------------------------------------------------
// File checking
// ---------------------------------------------------------------------------

/**
 * Validate one clickstop file's `## Plan review` section.
 *
 * @param {string} filePath
 * @param {string} subdir
 */
/**
 * CS file naming pattern: `<planned|active|done>_cs<digits>[suffix]_<slug>.md`.
 *
 * Sibling .md artifacts in directory-form CSs (e.g.
 * `active_cs64_<slug>/runtime-skill-spike.md`) are NOT CS planning files and
 * MUST NOT be plan-review linted — they are arbitrary research artifacts
 * scoped to the CS. The CS's main file (matching this pattern) carries the
 * canonical `## Plan review` attestation.
 */
const CS_FILENAME_RE = /^(planned|active|done)_cs\d+[a-z]?_[a-z0-9][a-z0-9_-]*\.md$/;

function checkFile(filePath, subdir) {
  const basename = path.basename(filePath);
  const label = `${subdir}/${basename}`;

  // Skip sibling artifacts in directory-form CSs (CS64+). Only files whose
  // basename matches the canonical CS naming pattern carry plan-review state.
  if (!CS_FILENAME_RE.test(basename)) {
    return;
  }

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    logError(`${label}: cannot read file: ${err.message}`);
    return;
  }
  const content = raw
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const { present, headerCells, dataRows } = extractPlanReviewTable(content);

  // 1. Section presence
  if (!present) {
    const message =
      `${label}: missing required H2 section "## Plan review" ` +
      `(see OPERATIONS.md § Plan review attestation procedure for the ` +
      `verbatim section template; CS35b decision C35b-1)`;
    if (effectiveStrict) {
      logError(message);
    } else {
      logWarning(message);
    }
    return;
  }

  // 2. Header row column count + label match
  if (!headerCells || headerCells.length !== REQUIRED_COLUMNS.length) {
    logError(
      `${label}: "## Plan review" table header has ${headerCells ? headerCells.length : 0} ` +
      `columns; expected ${REQUIRED_COLUMNS.length} ` +
      `(${REQUIRED_COLUMNS.join(' | ')})`
    );
    return;
  }
  for (let c = 0; c < REQUIRED_COLUMNS.length; c++) {
    if (headerCells[c] !== REQUIRED_COLUMNS[c]) {
      logError(
        `${label}: "## Plan review" header column ${c + 1} is ` +
        `"${headerCells[c]}"; expected "${REQUIRED_COLUMNS[c]}"`
      );
    }
  }

  // 3. At least one data row
  if (dataRows.length === 0) {
    logError(
      `${label}: "## Plan review" table contains no attestation rows ` +
      `(at least one R1 row required)`
    );
    return;
  }

  // 4. Per-row schema + independence accumulation
  const allAuthorModelsAcrossRows = new Set();
  for (let r = 0; r < dataRows.length; r++) {
    const { cells } = dataRows[r];
    const rowLabel = `row ${r + 1}`;

    if (cells.length !== REQUIRED_COLUMNS.length) {
      logError(
        `${label}: "## Plan review" ${rowLabel} has ${cells.length} cells; ` +
        `expected ${REQUIRED_COLUMNS.length}`
      );
      continue;
    }

    const [
      round,
      reviewerModel,
      planAuthorModelsRaw,
      reviewerAgent,
      reviewedHash,
      timestamp,
      verdict,
      findings,
    ] = cells;

    if (!ROUND_LABEL_RE.test(round)) {
      logError(
        `${label}: "## Plan review" ${rowLabel}: Round "${round}" does not ` +
        `match R<digit>+ (e.g. R1, R2)`
      );
    }

    const planAuthorModels = planAuthorModelsRaw
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
    if (planAuthorModels.length === 0) {
      logError(
        `${label}: "## Plan review" ${rowLabel}: Plan author model(s) is empty ` +
        `(must list at least one model)`
      );
    }
    for (const m of planAuthorModels) {
      allAuthorModelsAcrossRows.add(m);
    }

    if (!reviewerModel || reviewerModel === '') {
      logError(`${label}: "## Plan review" ${rowLabel}: Reviewer model is empty`);
    }
    if (reviewerModel && allAuthorModelsAcrossRows.has(reviewerModel)) {
      logError(
        `${label}: "## Plan review" ${rowLabel}: Reviewer model "${reviewerModel}" ` +
        `appears in Plan author model(s) (this row or a prior row); ` +
        `independence invariant violated (CS35b decision C35b-4)`
      );
    }
    if (planAuthorModels.includes(reviewerModel)) {
      // Already covered by accumulated check above, but emit a clearer message
      // when the overlap is in the same row.
      // (Above check fires; no extra log needed.)
    }

    if (!reviewerAgent || reviewerAgent === '') {
      logError(
        `${label}: "## Plan review" ${rowLabel}: Reviewer agent is empty ` +
        `(must record the agent identity that ran the review, e.g. ` +
        `"rubber-duck dispatched (orchestrator: <agent-id>)")`
      );
    }

    if (!HASH_RE.test(reviewedHash)) {
      logError(
        `${label}: "## Plan review" ${rowLabel}: Reviewed sections hash ` +
        `"${reviewedHash}" is not a 12-char lowercase hex string ` +
        `(use "harness plan-review-hash <file>" to compute)`
      );
    }

    if (!ISO_TIMESTAMP_RE.test(timestamp)) {
      logError(
        `${label}: "## Plan review" ${rowLabel}: Timestamp "${timestamp}" ` +
        `is not ISO-8601 UTC (YYYY-MM-DDThh:mm:ssZ)`
      );
    }

    if (!VERDICT_ENUM.has(verdict)) {
      logError(
        `${label}: "## Plan review" ${rowLabel}: Verdict "${verdict}" not in ` +
        `{Go, Go-with-amendments, Needs-Fix}`
      );
    }

    if (findings.length > MAX_FINDINGS_RECAP) {
      logError(
        `${label}: "## Plan review" ${rowLabel}: Findings recap is ` +
        `${findings.length} chars; max ${MAX_FINDINGS_RECAP}`
      );
    }
  }

  // 5. Latest row verdict gate (C35b-5)
  const latestRow = dataRows[dataRows.length - 1];
  if (latestRow.cells.length === REQUIRED_COLUMNS.length) {
    const latestVerdict = latestRow.cells[6];
    if (VERDICT_ENUM.has(latestVerdict) && !PASSING_VERDICTS.has(latestVerdict)) {
      logError(
        `${label}: "## Plan review" latest row verdict is "${latestVerdict}"; ` +
        `must be one of Go, Go-with-amendments before file can be merged ` +
        `(file an amendment with a fresh attestation row to clear the gate)`
      );
    }
  }

  // 6. Hash freshness (C35b-3)
  if (latestRow.cells.length === REQUIRED_COLUMNS.length) {
    const latestHash = latestRow.cells[4];
    if (HASH_RE.test(latestHash)) {
      const currentHash = computePlanReviewHashFromText(content);
      if (latestHash !== currentHash) {
        logError(
          `${label}: "## Plan review" latest row Reviewed sections hash ` +
          `"${latestHash}" does not match the current Decisions+Deliverables ` +
          `content hash "${currentHash}"; the plan has been amended since the ` +
          `last review — file a fresh attestation row before merging ` +
          `(CS35b decision C35b-3; run "harness plan-review-hash <file>" to confirm)`
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Walk + run
// ---------------------------------------------------------------------------

let filesChecked = 0;

function isUnderLintedSubdir(absFile) {
  for (const subdir of LINTED_SUBDIRS) {
    const root = path.resolve(path.join(clickstopsDir, subdir)) + path.sep;
    const f = path.resolve(absFile);
    if ((f + path.sep).startsWith(root)) return subdir;
  }
  return null;
}

if (filesFilter !== null) {
  // Explicit-file mode: lint only the supplied list (typically the PR diff).
  // Files outside planned/ or active/ are silently skipped — the caller can
  // safely pass the full diff (`gh pr diff --name-only`) without filtering.
  for (const rel of filesFilter) {
    if (!rel.endsWith('.md')) continue;
    const full = path.isAbsolute(rel) ? rel : path.resolve(rel);
    if (!fs.existsSync(full)) continue;
    const stat = fs.statSync(full);
    if (!stat.isFile()) continue;
    const subdir = isUnderLintedSubdir(full);
    if (!subdir) continue;
    filesChecked++;
    checkFile(full, subdir);
  }
} else {
  for (const subdir of LINTED_SUBDIRS) {
    const dir = path.join(clickstopsDir, subdir);
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;
      if (entry === '.gitkeep') continue;
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (!stat.isFile()) continue;
      filesChecked++;
      checkFile(full, subdir);
    }
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

if (!quiet) {
  process.stdout.write(
    `check-clickstop-plan-review: scanned ${filesChecked} files (mode=${mode}, strict=${effectiveStrict})\n`
  );
}
process.stdout.write(
  `check-clickstop-plan-review: ${errors.length} errors, ${warnings.length} warnings\n`
);

process.exit(errors.length > 0 ? 1 : 0);
