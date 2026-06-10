#!/usr/bin/env node
/**
 * scripts/check-learnings.mjs — Reference linter for LEARNINGS.md.
 *
 * Validates every entry in LEARNINGS.md against schemas/learning.schema.json
 * (AJV), checks status/disposition consistency, and emits sequence warnings.
 *
 * Usage:
 *   node scripts/check-learnings.mjs [--file <path>] [--quiet]
 *
 * Exit codes:
 *   0 — all entries valid (warnings are printed but do not affect exit code)
 *   1 — at least one validation error
 *
 * @module scripts/check-learnings.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parseFrontmatterBlocks } from '../lib/doc-schema.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

let filePath = path.join(repoRoot, 'LEARNINGS.md');
let quiet = false;

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--file') {
    if (!argv[i + 1] || argv[i + 1].startsWith('-')) {
      process.stderr.write('check-learnings: missing value for --file\n');
      process.exit(2);
    }
    filePath = argv[++i];
  } else if (a === '--quiet') {
    quiet = true;
  } else if (a === '--help' || a === '-h') {
    process.stdout.write(
      'Usage: check-learnings.mjs [--file <path>] [--quiet]\n\n' +
      'Validate all LEARNINGS.md entries against the learning schema.\n\n' +
      'Options:\n' +
      '  --file <path>   Path to the LEARNINGS.md file to lint\n' +
      '                  (default: <repoRoot>/LEARNINGS.md)\n' +
      '  --quiet         Suppress per-finding output; print only the summary\n' +
      '  --help          Print this help text\n'
    );
    process.exit(0);
  } else {
    process.stderr.write(`check-learnings: unknown flag: ${a}\n`);
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// AJV setup — same pattern as scripts/validate-schemas.mjs
// ---------------------------------------------------------------------------

const schemaPath = path.join(repoRoot, 'schemas', 'learning.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const ajv = new Ajv2020({ strict: false, validateSchema: false });
addFormats(ajv);
const validateLearning = ajv.compile(schema);

// ---------------------------------------------------------------------------
// Read and parse the target file
// ---------------------------------------------------------------------------

let markdownText;
try {
  markdownText = fs.readFileSync(filePath, 'utf8');
} catch (err) {
  process.stderr.write(`check-learnings: cannot read file "${filePath}": ${err.message}\n`);
  process.exit(1);
}

const blocks = parseFrontmatterBlocks(markdownText);

// Blocks that parsed cleanly (used for most checks).
const validBlocks = blocks.filter((b) => !b.parseError);

// ---------------------------------------------------------------------------
// Finding collectors
// ---------------------------------------------------------------------------

const errors = [];
const warnings = [];

/**
 * Record an error finding and print it unless --quiet is active.
 *
 * @param {string} msg - Human-readable error description.
 */
function logError(msg) {
  errors.push(msg);
  if (!quiet) process.stdout.write(`ERROR: ${msg}\n`);
}

/**
 * Record a warning finding and print it unless --quiet is active.
 *
 * @param {string} msg - Human-readable warning description.
 */
function logWarning(msg) {
  warnings.push(msg);
  if (!quiet) process.stdout.write(`WARNING: ${msg}\n`);
}

// ---------------------------------------------------------------------------
// Check 0 — YAML parse errors (B2)
//   Blocks that had an LRN-style id line but whose YAML was malformed are
//   treated as hard errors rather than silently skipped.
// ---------------------------------------------------------------------------

for (const block of blocks) {
  if (block.parseError) {
    const idMatch = block.raw.match(/^\s*id\s*:\s*(\S+)/m);
    const id = idMatch ? idMatch[1] : `<unknown at line ${block.lineNumber}>`;
    logError(
      `${id} (line ${block.lineNumber}): YAML parse error: ${block.parseError.message}`
    );
  }
}

// ---------------------------------------------------------------------------
// Check 1 — AJV schema validation for each frontmatter block
// ---------------------------------------------------------------------------

for (const block of validBlocks) {
  const { parsed, lineNumber } = block;
  const valid = validateLearning(parsed);
  if (!valid) {
    for (const err of (validateLearning.errors ?? [])) {
      const loc = err.instancePath ? err.instancePath.replace(/^\//, '') : err.schemaPath;
      logError(`${parsed.id} (line ${lineNumber}): ${loc} ${err.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 2 — status/disposition consistency
//   Entries with status "applied" or "obsolete" must have a
//   **Disposition:** paragraph in their body text.
// ---------------------------------------------------------------------------

for (const block of validBlocks) {
  const { parsed, bodyAfter, lineNumber } = block;
  if (parsed.status === 'applied' || parsed.status === 'obsolete') {
    if (!bodyAfter.includes('**Disposition:**')) {
      logError(
        `${parsed.id} (line ${lineNumber}): status "${parsed.status}" requires ` +
        `a **Disposition:** paragraph in the entry body`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Check 3 — age-out warning
//   Entries with status "open" and a date older than 14 days.
// ---------------------------------------------------------------------------

const today = new Date();
today.setHours(0, 0, 0, 0);

for (const block of validBlocks) {
  const { parsed } = block;
  if (parsed.status === 'open' && parsed.date) {
    const entryDate = new Date(parsed.date + 'T00:00:00Z');
    const ageDays = (today - entryDate) / (1000 * 60 * 60 * 24);
    if (ageDays > 14) {
      logWarning(
        `${parsed.id}: status "open" with date ${parsed.date} is ` +
        `${Math.floor(ageDays)} days old (>14 days)`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Check 4 — deferred escalation warning
//   Entries with status "deferred" whose deferred_until date has passed.
// ---------------------------------------------------------------------------

for (const block of validBlocks) {
  const { parsed } = block;
  if (parsed.status === 'deferred' && parsed.deferred_until) {
    const until = new Date(parsed.deferred_until + 'T00:00:00Z');
    if (until < today) {
      logWarning(
        `${parsed.id}: status "deferred" with deferred_until ${parsed.deferred_until} has passed — revisit needed`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Check 5 — ID sequence and duplicate detection
//   Duplicate IDs = ERROR.  Non-contiguous LRN-NNN sequence = WARNING.
// ---------------------------------------------------------------------------

const allLrnIds = validBlocks
  .map((b) => b.parsed.id)
  .filter((id) => typeof id === 'string' && /^LRN-\d+$/.test(id));

// NB-9: duplicate-ID check.
const seenIds = new Set();
for (const id of allLrnIds) {
  if (seenIds.has(id)) {
    logError(`Duplicate ID: ${id} appears more than once`);
  }
  seenIds.add(id);
}

// Gap check: derive unique numeric set from deduped IDs.
const lrnNums = [...seenIds]
  .map((id) => parseInt(id.slice(4), 10))
  .sort((a, b) => a - b);

for (let i = 1; i < lrnNums.length; i++) {
  if (lrnNums[i] !== lrnNums[i - 1] + 1) {
    for (let gap = lrnNums[i - 1] + 1; gap < lrnNums[i]; gap++) {
      logWarning(`ID gap: LRN-${String(gap).padStart(3, '0')} is missing from the sequence`);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 6 — section heading validation
//   Warn if entries exist for a status but the matching ## heading is absent.
//   Error if an unrecognised ## heading is present.
//
//   NOTE: section placement does NOT have to match status (per LEARNINGS.md
//   bottom note) — we validate the status field, not placement.
// ---------------------------------------------------------------------------

const normalizedText = markdownText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
const normalizedLines = normalizedText.split('\n');
const existingH2Headings = new Set();
for (const line of normalizedLines) {
  const m = line.match(/^## (.+)$/);
  if (m) existingH2Headings.add(m[1].trim());
}

const allowedH2 = new Set(['Open', 'Applied', 'Obsolete', 'Deferred']);

/** @type {Record<string, string>} */
const statusToHeading = {
  open: 'Open',
  applied: 'Applied',
  obsolete: 'Obsolete',
  deferred: 'Deferred',
};

// Warn if entries exist in a category but the heading is missing.
for (const [status, heading] of Object.entries(statusToHeading)) {
  const hasEntries = validBlocks.some((b) => b.parsed.status === status);
  if (hasEntries && !existingH2Headings.has(heading)) {
    logError(
      `Heading "## ${heading}" is missing but entries with status "${status}" exist`
    );
  }
}

// Error for any ## heading that is not in the allowed set.
for (const h of existingH2Headings) {
  if (!allowedH2.has(h)) {
    logError(`Undocumented section heading: "## ${h}"`);
  }
}

// ---------------------------------------------------------------------------
// Check 7 — H3 header presence and id↔header match (LRN-154, CS69)
//   Every entry with `id: LRN-<n>` must be preceded by a matching
//   `### LRN-<n>` H3 header. Per CS69-1, the header sits on the line(s)
//   immediately above the opening ```yaml fence, separated from it by only
//   blank lines — NOT by intervening prose. The strict adjacency rule
//   (skip blanks, require the next nonblank line above the fence to be the
//   `### LRN-<n>` candidate) ensures a `### LRN-XXX` that appears anywhere
//   inside a previous entry's body (prose or otherwise) cannot be
//   misclassified as the current entry's header.
//
//   The canonical header form is `### LRN-<digits>` with no trailing text
//   after the digit token. This matches the actual LEARNINGS.md convention
//   (every header is bare) and the assumption baked into
//   `lib/doc-schema.mjs assertHeadings()` and other linters that resolve
//   `LEARNINGS.md#lrn-<digits>` anchors by exact heading text. Headers
//   with trailing descriptive text would break those anchors silently, so
//   they are treated as missing.
//
//   Digit-string comparison (not parseInt): the frontmatter `id` is the
//   canonical zero-padded form (e.g. `LRN-001`). A header `### LRN-1`
//   that drops leading zeros is NOT a match — it would create a broken
//   `#lrn-1` anchor instead of `#lrn-001`. So the captured header digits
//   must equal `parsed.id.slice(4)` as an exact string match.
//
//   - Missing or non-canonical header → error "missing `### LRN-<n>` H3 header".
//   - Present-but-mismatched digit string (e.g. `### LRN-105` precedes
//     `id: LRN-106`, or `### LRN-1` precedes `id: LRN-001`) → distinct
//     error naming both ids.
// ---------------------------------------------------------------------------

for (const block of validBlocks) {
  const { parsed, lineNumber } = block;
  if (!/^LRN-\d+$/.test(parsed.id ?? '')) continue;

  const expectedDigits = parsed.id.slice(4); // canonical zero-padded form
  const openIdx = lineNumber - 1; // convert to 0-indexed

  // Skip blank lines walking backwards from immediately above the fence.
  let k = openIdx - 1;
  while (k >= 0 && /^\s*$/.test(normalizedLines[k])) k--;

  // The next nonblank line above the fence must be the canonical H3 header.
  // Match `### LRN-<digits>` with NO trailing text — bare-header convention.
  const candidateLine = k >= 0 ? normalizedLines[k] : null;
  const h3Match = candidateLine
    ? candidateLine.match(/^###\s+LRN-(\d+)\s*$/)
    : null;

  if (!h3Match) {
    logError(
      `${parsed.id} (line ${lineNumber}): missing \`### ${parsed.id}\` H3 header on the line immediately above the entry's YAML frontmatter block (LRN-154)`
    );
    continue;
  }

  const candidateDigits = h3Match[1];
  if (candidateDigits !== expectedDigits) {
    logError(
      `${parsed.id} (line ${lineNumber}): H3 header "### LRN-${candidateDigits}" (line ${k + 1}) does not match frontmatter id "${parsed.id}" — digit strings differ (anchors must use the canonical zero-padded form, LRN-154)`
    );
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

process.stdout.write('\n=== check-learnings summary ===\n');
process.stdout.write(`Entries checked: ${blocks.length}\n`);
process.stdout.write(`Errors: ${errors.length}\n`);
process.stdout.write(`Warnings: ${warnings.length}\n`);

if (errors.length > 0) {
  process.stdout.write('\n❌ Linter FAILED\n');
  process.exit(1);
} else {
  process.stdout.write('\n✅ Linter passed\n');
  process.exit(0);
}
