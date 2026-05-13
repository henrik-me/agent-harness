#!/usr/bin/env node
/**
 * scripts/check-review-output.mjs — Reviewer-output content linter (CS40).
 *
 * Validates a reviewer's output markdown (the markdown content delivered by
 * the orchestrator-dispatched reviewer per LRN-068 pattern) against three
 * predicates per CS40 Decisions C40-2/3/4/5/6/7:
 *
 *   1. **Analyzed-HEAD line presence + SHA validity** (C40-2(a))
 *      Reviewer output MUST contain a line `Analyzed HEAD: <40-char-sha>`
 *      near the top.
 *
 *   2. **R1 per-file enumeration vs `git diff --name-only <base>..<head>`**
 *      (C40-3) — for `--round R1`, the reviewer-enumerated file set MUST
 *      exactly equal the diff set. Missing files = error; extra files =
 *      warning. For `--round Rn`, the enumeration is checked against
 *      `<prev-head>..<head>` if `--prev-head` is provided; otherwise the
 *      enumeration check is warn-skipped per C40-4.
 *
 *   3. **Finding row schema** (C40-5)
 *      Each row in the `## Findings` section MUST match the regex
 *      `^- \[(Blocking|Non-blocking|Suggestion)\] (\S+):(\d+): .+$`.
 *      At least one finding required when Verdict ≠ `Go`. Verdict=Go MAY
 *      have zero findings.
 *
 * Plus three structural checks:
 *
 *   4. **Verdict line** (C40-2(d)) — `Verdict: {Go|Needs-Fix|Block}` near end.
 *
 *   5. **Independence-invariant guard** (C40-6) — if `--repo`/`--pr` provided,
 *      parse the PR body's `## Model audit`; assert the reviewer model
 *      (passed via `--reviewer-model`) is NOT in the implementer set. The
 *      A3 pr-evidence gate already enforces this, but standalone invocations
 *      of this linter outside CI still benefit from the belt-and-suspenders
 *      check.
 *
 *   6. **Idempotent PR-body update** (C40-7) — when `--update-pr` provided,
 *      post the parsed structured output as a new row in the PR body's
 *      `## Review log` section via `gh pr edit --body-file <new-body>`.
 *      Idempotent: re-running with the same `--review-output` produces the
 *      same single row (deduplicated by `analyzed_head + reviewer_actor +
 *      verdict`).
 *
 * Per C40-8: this linter is NOT registered with `harness pr-evidence` —
 * it requires the reviewer output file which isn't available in CI. It is
 * a standalone linter invoked by the orchestrator after capturing reviewer
 * output, dispatched via the `harness review-output` subcommand.
 *
 * Usage:
 *   node scripts/check-review-output.mjs \
 *     --review-output <file> --round R1|Rn --base <sha> --head <sha> \
 *     [--prev-head <sha>] [--repo <slug>] [--pr <number>] \
 *     [--reviewer-model <model-id>] [--update-pr] [--json] [--quiet]
 *
 * Exit codes:
 *   0 — all predicates pass (warnings allowed)
 *   1 — at least one error
 *   2 — bad usage
 *
 * @module scripts/check-review-output.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Permitted severity labels per C40-2(c) — aligned to REVIEWS.md:151-153. */
const SEVERITY_ENUM = new Set(['Blocking', 'Non-blocking', 'Suggestion']);

/** Permitted verdict labels per C40-2(d). */
const VERDICT_ENUM = new Set(['Go', 'Needs-Fix', 'Block']);

/** Round label regex: R1 or R<n>. We treat anything matching as Rn except R1. */
const ROUND_LABEL_RE = /^R(1|n|\d+)$/;

/** 40-char lowercase hex SHA regex. */
const SHA40_RE = /^[0-9a-f]{40}$/;

/** Analyzed HEAD line regex. Captures the SHA in group 1. */
const ANALYZED_HEAD_RE = /^Analyzed HEAD:\s+([0-9a-f]{40})\s*$/m;

/** Verdict line regex. Captures the verdict in group 1. */
const VERDICT_RE = /^Verdict:\s+(Go|Needs-Fix|Block)\s*$/m;

/** Finding row regex per C40-5. */
const FINDING_ROW_RE = /^-\s+\[(Blocking|Non-blocking|Suggestion)\]\s+(\S+):(\d+):\s+(.+)$/;

/**
 * Resolve and invoke the `gh` binary. Tests inject a fake-gh shim by setting
 * the `CHECK_REVIEW_OUTPUT_GH_BIN` env var. If the env var points to a .mjs /
 * .js / .cjs file, the linter spawns `node <script>` so test seams don't have
 * to cross Windows .cmd-vs-shell concerns. Production defaults to the system
 * `gh` on PATH.
 */
function runGh(args) {
  const ghBin = process.env.CHECK_REVIEW_OUTPUT_GH_BIN;
  if (ghBin && /\.(mjs|js|cjs)$/i.test(ghBin)) {
    return spawnSync(process.execPath, [ghBin, ...args], { encoding: 'utf8' });
  }
  return spawnSync(ghBin || 'gh', args, { encoding: 'utf8' });
}

/**
 * Per-file enumeration row regex. Matches any of:
 *   `- <path>: <one-line>`
 *   `- \`<path>\`: <one-line>`
 *   `- **<path>**: <one-line>`
 * Captures the path in group 1 (with backtick/asterisk wrapping stripped).
 */
const FILE_ENUM_ROW_RE = /^-\s+(?:`([^`]+)`|\*\*([^*]+)\*\*|([^\s:`*]+)):\s+(.+)$/;

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

let reviewOutput = null;
let round = null;
let base = null;
let head = null;
let prevHead = null;
let repo = null;
let pr = null;
let reviewerModel = null;
let actor = null;
let evidenceLink = null;
let updatePr = false;
let jsonOut = false;
let quiet = false;

const HELP = [
  'Usage: check-review-output.mjs --review-output <file> --round R1|Rn --base <sha> --head <sha> [options]',
  '',
  'Validate reviewer output markdown against the CS40 schema (Analyzed-HEAD,',
  'per-file enumeration, finding-row shape, verdict). Optionally posts the',
  'parsed output to the PR body via --update-pr.',
  '',
  'Required:',
  '  --review-output <file>       Path to markdown file with reviewer output',
  '  --round R1|Rn                Review round (R1 = full enumeration; Rn = delta)',
  '  --base <sha>                 Base SHA for diff computation',
  '  --head <sha>                 Head SHA for diff computation',
  '',
  'Optional:',
  '  --prev-head <sha>            Required for Rn enumeration check (warn-skip if absent)',
  '  --repo <owner/repo>          For PR-body fetch (independence guard + --update-pr)',
  '  --pr <number>                For PR-body fetch (independence guard + --update-pr)',
  '  --reviewer-model <model-id>  Reviewer model (required when independence guard runs)',
  '  --actor <agent-id>           Actor for ## Review log row (required with --update-pr)',
  '  --evidence-link <url>        evidence_link cell value for ## Review log row (defaults to file basename)',
  '  --update-pr                  Post parsed output as new ## Review log row (idempotent)',
  '  --json                       Emit machine-readable JSON instead of text',
  '  --quiet                      Suppress per-finding output; print summary only',
  '  --help                       Print this help text',
  '',
  'Exit codes:',
  '  0  pass (warnings allowed)',
  '  1  at least one error',
  '  2  bad usage',
  '',
].join('\n');

function requireValue(args, i, flagName) {
  if (!args[i + 1] || args[i + 1].startsWith('--')) {
    process.stderr.write(`check-review-output: missing value for ${flagName}\n${HELP}`);
    process.exit(2);
  }
  return args[i + 1];
}

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--review-output') { reviewOutput = requireValue(argv, i, '--review-output'); i++; }
  else if (a === '--round') { round = requireValue(argv, i, '--round'); i++; }
  else if (a === '--base') { base = requireValue(argv, i, '--base'); i++; }
  else if (a === '--head') { head = requireValue(argv, i, '--head'); i++; }
  else if (a === '--prev-head') { prevHead = requireValue(argv, i, '--prev-head'); i++; }
  else if (a === '--repo') { repo = requireValue(argv, i, '--repo'); i++; }
  else if (a === '--pr') { pr = requireValue(argv, i, '--pr'); i++; }
  else if (a === '--reviewer-model') { reviewerModel = requireValue(argv, i, '--reviewer-model'); i++; }
  else if (a === '--actor') { actor = requireValue(argv, i, '--actor'); i++; }
  else if (a === '--evidence-link') { evidenceLink = requireValue(argv, i, '--evidence-link'); i++; }
  else if (a === '--update-pr') { updatePr = true; }
  else if (a === '--json') { jsonOut = true; }
  else if (a === '--quiet') { quiet = true; }
  else if (a === '--help' || a === '-h') { process.stdout.write(HELP); process.exit(0); }
  else { process.stderr.write(`check-review-output: unknown flag: ${a}\n${HELP}`); process.exit(2); }
}

if (!reviewOutput) { process.stderr.write(`check-review-output: --review-output is required\n${HELP}`); process.exit(2); }
if (!round) { process.stderr.write(`check-review-output: --round is required\n${HELP}`); process.exit(2); }
if (!ROUND_LABEL_RE.test(round)) { process.stderr.write(`check-review-output: --round must match R1|Rn|R<digit>+, got '${round}'\n`); process.exit(2); }
if (!base) { process.stderr.write(`check-review-output: --base is required\n${HELP}`); process.exit(2); }
if (!head) { process.stderr.write(`check-review-output: --head is required\n${HELP}`); process.exit(2); }
if (!fs.existsSync(reviewOutput)) { process.stderr.write(`check-review-output: file not found: ${reviewOutput}\n`); process.exit(2); }

// ---------------------------------------------------------------------------
// Parse + validate
// ---------------------------------------------------------------------------

const text = fs.readFileSync(reviewOutput, 'utf8');
const errors = [];
const warnings = [];

// (1) Analyzed-HEAD presence + SHA validity (C40-2(a))
const headMatch = text.match(ANALYZED_HEAD_RE);
let analyzedHead = null;
if (!headMatch) {
  errors.push(`missing or malformed "Analyzed HEAD: <40-char-sha>" line near top of ${reviewOutput}`);
} else {
  analyzedHead = headMatch[1];
  if (!SHA40_RE.test(analyzedHead)) {
    errors.push(`Analyzed HEAD SHA must be 40 lowercase hex chars, got '${analyzedHead}'`);
  }
  if (head && analyzedHead !== head.toLowerCase()) {
    warnings.push(`Analyzed HEAD '${analyzedHead}' does not match --head '${head}' (reviewer may have analyzed a stale commit)`);
  }
}

// (4) Verdict line (C40-2(d))
const verdictMatch = text.match(VERDICT_RE);
let verdict = null;
if (!verdictMatch) {
  errors.push(`missing or malformed "Verdict: {Go|Needs-Fix|Block}" line near end`);
} else {
  verdict = verdictMatch[1];
  if (!VERDICT_ENUM.has(verdict)) {
    errors.push(`Verdict must be one of {${[...VERDICT_ENUM].join(', ')}}, got '${verdict}'`);
  }
}

// (3) Finding rows + enumeration extraction
//
// Per C40-2(b/c), the reviewer output has two structured surfaces:
//   - per-file enumeration (one bullet per changed file)
//   - findings list (rows shaped per FINDING_ROW_RE)
//
// We walk every line; rows that match FINDING_ROW_RE are findings, rows that
// match FILE_ENUM_ROW_RE are file enumeration. A row may match both regexes
// (e.g. a findings-style row); FINDING_ROW_RE wins because it's stricter.
const lines = text.split(/\r?\n/);
const findings = [];
const enumeratedFiles = new Set();
const malformedFindingsCandidates = [];

// Identify section boundaries to disambiguate enumeration vs findings.
// Heuristic: the `## Findings` heading marks the start of findings list;
// before that, file-enum rows go into the enumeration set; after, into findings.
let inFindingsSection = false;
for (const rawLine of lines) {
  const line = rawLine.trim();
  // Detect section transitions on H2/H3 headings.
  if (/^#{2,3}\s+findings\b/i.test(line)) { inFindingsSection = true; continue; }
  if (/^#{2,3}\s+/.test(line) && inFindingsSection) {
    // Subsequent H2/H3 ends the findings section.
    if (!/^#{2,3}\s+findings\b/i.test(line)) inFindingsSection = false;
  }

  if (inFindingsSection && /^-\s+\[/.test(line)) {
    // In findings section, every bullet starting with `- [` is expected to be
    // a finding row. If it doesn't match the strict regex, flag it.
    const m = line.match(FINDING_ROW_RE);
    if (m) {
      findings.push({ severity: m[1], file: m[2], line: parseInt(m[3], 10), description: m[4] });
    } else {
      malformedFindingsCandidates.push(line);
    }
  } else if (!inFindingsSection && /^-\s+/.test(line)) {
    // Outside findings: try to extract a per-file enumeration row.
    const m = line.match(FILE_ENUM_ROW_RE);
    if (m) {
      const filePath = m[1] || m[2] || m[3];
      // Skip obviously non-file bullets (sentences, etc.). Heuristic: must
      // contain a `/` OR `.` (file extension or path separator) to be a path.
      if (filePath && (/[/.]/.test(filePath))) {
        enumeratedFiles.add(filePath);
      }
    }
  }
}

for (const m of malformedFindingsCandidates) {
  errors.push(`malformed finding row (expected '- [Blocking|Non-blocking|Suggestion] <file>:<line>: <desc>'): ${m}`);
}

// (3b) Findings/verdict consistency
if (verdict && verdict !== 'Go' && findings.length === 0) {
  errors.push(`Verdict '${verdict}' requires at least one finding row, none found`);
}

// (2) R1/Rn enumeration completeness (C40-3, C40-4)
let diffSet = null;
let enumerationCheckRan = false;
if (round === 'R1') {
  const diffBase = base;
  const diffHead = head;
  const diffResult = spawnSync('git', ['diff', '--name-only', `${diffBase}..${diffHead}`], { encoding: 'utf8' });
  if (diffResult.status !== 0) {
    warnings.push(`could not compute git diff --name-only ${diffBase}..${diffHead} (exit ${diffResult.status}): ${diffResult.stderr.trim()}`);
  } else {
    diffSet = new Set(diffResult.stdout.split('\n').map((s) => s.trim()).filter(Boolean));
    enumerationCheckRan = true;
    const missing = [...diffSet].filter((f) => !enumeratedFiles.has(f));
    const extra = [...enumeratedFiles].filter((f) => !diffSet.has(f));
    for (const f of missing) {
      errors.push(`R1 enumeration missing file: ${f} (present in git diff --name-only ${diffBase}..${diffHead}, absent in reviewer enumeration)`);
    }
    for (const f of extra) {
      warnings.push(`R1 enumeration extra file: ${f} (reviewer enumerated, absent from git diff --name-only ${diffBase}..${diffHead})`);
    }
  }
} else {
  // Rn — requires --prev-head
  if (!prevHead) {
    warnings.push(`Rn enumeration check skipped: --prev-head not provided (cannot derive delta basis)`);
  } else {
    const diffResult = spawnSync('git', ['diff', '--name-only', `${prevHead}..${head}`], { encoding: 'utf8' });
    if (diffResult.status !== 0) {
      warnings.push(`could not compute git diff --name-only ${prevHead}..${head} (exit ${diffResult.status}): ${diffResult.stderr.trim()}`);
    } else {
      diffSet = new Set(diffResult.stdout.split('\n').map((s) => s.trim()).filter(Boolean));
      enumerationCheckRan = true;
      const missing = [...diffSet].filter((f) => !enumeratedFiles.has(f));
      const extra = [...enumeratedFiles].filter((f) => !diffSet.has(f));
      for (const f of missing) {
        errors.push(`Rn enumeration missing file: ${f} (present in git diff --name-only ${prevHead}..${head}, absent in reviewer enumeration)`);
      }
      for (const f of extra) {
        warnings.push(`Rn enumeration extra file: ${f} (reviewer enumerated, absent from git diff --name-only ${prevHead}..${head})`);
      }
    }
  }
}

// (5) Independence-invariant guard (C40-6)
if (repo && pr) {
  if (!reviewerModel) {
    warnings.push(`independence-invariant guard skipped: --reviewer-model not provided (cannot compare against PR-body Model audit)`);
  } else {
    const ghResult = runGh(['pr', 'view', pr, '--repo', repo, '--json', 'body', '--jq', '.body']);
    if (ghResult.status !== 0) {
      warnings.push(`could not fetch PR body via gh (exit ${ghResult.status}): ${ghResult.stderr.trim()}`);
    } else {
      const prBody = ghResult.stdout;
      const implementerModels = parseModelAuditImplementers(prBody);
      if (implementerModels.size === 0) {
        warnings.push(`independence-invariant guard: no Model audit table found in PR body (or no implementer rows)`);
      } else {
        const lowerImpl = new Set([...implementerModels].map((m) => m.toLowerCase()));
        if (lowerImpl.has(reviewerModel.toLowerCase())) {
          errors.push(`independence-invariant violation: reviewer model '${reviewerModel}' is also in implementer set ${[...implementerModels].sort().join(', ')} per PR body Model audit`);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// --update-pr (C40-7)
// ---------------------------------------------------------------------------

if (updatePr) {
  if (errors.length > 0) {
    warnings.push(`--update-pr skipped: linter errors present (refusing to post a defective row)`);
  } else if (!repo || !pr) {
    warnings.push(`--update-pr skipped: --repo and --pr are both required`);
  } else if (!reviewerModel) {
    warnings.push(`--update-pr skipped: --reviewer-model is required (canonical ## Review log "model" column)`);
  } else if (!actor) {
    warnings.push(`--update-pr skipped: --actor is required (canonical ## Review log "actor" column)`);
  } else if (!analyzedHead || !verdict) {
    warnings.push(`--update-pr skipped: parsed output is incomplete (analyzedHead=${analyzedHead}, verdict=${verdict})`);
  } else {
    const updateResult = updatePrReviewLog({
      repo, pr, analyzedHead, verdict,
      actor,
      reviewerModel,
      evidenceLink: evidenceLink || path.basename(reviewOutput),
    });
    if (updateResult.error) {
      errors.push(`--update-pr failed: ${updateResult.error}`);
    } else if (!quiet) {
      const action = updateResult.added ? 'added' : 'unchanged (idempotent)';
      process.stderr.write(`check-review-output: ## Review log row ${action} for analyzed_head=${analyzedHead}, actor=${actor}, model=${reviewerModel}, verdict=${verdict}\n`);
    }
  }
}

// ---------------------------------------------------------------------------
// Output + exit
// ---------------------------------------------------------------------------

if (jsonOut) {
  const result = {
    ok: errors.length === 0,
    file: reviewOutput,
    round,
    analyzed_head: analyzedHead,
    verdict,
    findings,
    enumerated_files: [...enumeratedFiles].sort(),
    diff_files: diffSet ? [...diffSet].sort() : null,
    enumeration_check_ran: enumerationCheckRan,
    errors,
    warnings,
  };
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} else {
  if (!quiet) {
    for (const w of warnings) process.stderr.write(`WARN: ${w}\n`);
    for (const e of errors) process.stderr.write(`ERROR: ${e}\n`);
  }
  process.stdout.write(
    `check-review-output: ${errors.length} errors, ${warnings.length} warnings ` +
    `(round=${round}, file=${reviewOutput})\n`
  );
}

process.exit(errors.length > 0 ? 1 : 0);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse the implementer model set from a PR body's `## Model audit` section.
 *
 * Per REVIEWS.md §2.8 the canonical schema is a `| Field | Value |` key-value
 * table where one row has Field = `Implementer models` (case-insensitive) and
 * its Value cell is a comma-separated list of model identifiers. Returns an
 * empty Set if the section is absent, the table is missing required columns,
 * or the row is absent.
 *
 * @param {string} prBody Markdown content of PR body
 * @returns {Set<string>} set of implementer model IDs (preserved-case strings)
 */
function parseModelAuditImplementers(prBody) {
  const result = new Set();
  // Find the `## Model audit` H2 and consume rows until the next H2/H1 or EOF.
  const m = prBody.match(/##\s+Model audit\s*\r?\n([\s\S]*?)(?:\r?\n##\s|\r?\n#\s|$)/);
  if (!m) return result;
  const section = m[1];
  const rows = section.split(/\r?\n/).filter((l) => /^\|/.test(l.trim()));
  if (rows.length < 2) return result; // header + separator at minimum

  // First row must be the header. Identify Field + Value column indices.
  const headerCells = rows[0].split('|').slice(1, -1).map((s) => s.trim());
  const fieldIdx = headerCells.findIndex((h) => /^field$/i.test(h));
  const valueIdx = headerCells.findIndex((h) => /^value$/i.test(h));
  if (fieldIdx < 0 || valueIdx < 0) return result;

  // Skip header (row 0) and separator (row 1, the ---|--- line). Walk data rows.
  for (let i = 2; i < rows.length; i++) {
    const cells = rows[i].split('|').slice(1, -1).map((s) => s.trim());
    if (cells.length <= Math.max(fieldIdx, valueIdx)) continue;
    const field = cells[fieldIdx] || '';
    const value = cells[valueIdx] || '';
    if (!/^implementer\s+models$/i.test(field)) continue;
    if (!value || /^n\/a$/i.test(value) || /^—$/.test(value)) continue;
    for (const part of value.split(',').map((s) => s.trim()).filter(Boolean)) {
      result.add(part);
    }
  }
  return result;
}

/**
 * Idempotently add a row to the PR body's `## Review log` section.
 *
 * Emits a row matching the canonical 6-column schema per REVIEWS.md §2.7
 * (also enforced by check-review-evidence.mjs:55):
 *
 *   | timestamp | analyzed_head | actor | model | verdict | evidence_link |
 *
 * Dedup key: `analyzed_head + actor + model + verdict` (case-insensitive on
 * SHA, exact on the others). The Review log table is parsed by column header
 * to locate each cell — we don't rely on positional regex matching, because
 * a future column reorder would silently break dedup.
 *
 * @param {object} opts
 * @returns {{ added: boolean, error?: string }}
 */
function updatePrReviewLog({ repo, pr, analyzedHead, verdict, actor, reviewerModel, evidenceLink }) {
  const ghView = runGh(['pr', 'view', pr, '--repo', repo, '--json', 'body', '--jq', '.body']);
  if (ghView.status !== 0) return { error: `gh pr view failed: ${ghView.stderr.trim()}` };
  const body = ghView.stdout;
  const reviewLogMatch = body.match(/(##\s+Review log\s*\r?\n[\s\S]*?)(\r?\n##\s|\r?\n#\s|$)/);
  if (!reviewLogMatch) return { error: `PR body has no ## Review log section` };
  const section = reviewLogMatch[1];

  // Parse the existing table to identify the column ordering and existing rows.
  const tableLines = section.split(/\r?\n/).filter((l) => /^\|/.test(l.trim()));
  if (tableLines.length < 2) {
    return { error: `## Review log table malformed: needs at least header + separator rows` };
  }
  const headerCells = tableLines[0].split('|').slice(1, -1).map((s) => s.trim().toLowerCase());
  const colIdx = (name) => headerCells.indexOf(name);
  const requiredCols = ['timestamp', 'analyzed_head', 'actor', 'model', 'verdict', 'evidence_link'];
  const missingCols = requiredCols.filter((c) => colIdx(c) === -1);
  if (missingCols.length > 0) {
    return { error: `## Review log table missing required columns: ${missingCols.join(', ')} (canonical schema per REVIEWS.md §2.7)` };
  }

  // Walk data rows (skip header + separator) to detect dedup hit.
  const dedupSha = analyzedHead.toLowerCase();
  for (let i = 2; i < tableLines.length; i++) {
    const cells = tableLines[i].split('|').slice(1, -1).map((s) => s.trim());
    if (cells.length < requiredCols.length) continue;
    const rowSha = (cells[colIdx('analyzed_head')] || '').toLowerCase();
    const rowActor = cells[colIdx('actor')] || '';
    const rowModel = cells[colIdx('model')] || '';
    const rowVerdict = cells[colIdx('verdict')] || '';
    if (rowSha === dedupSha && rowActor === actor && rowModel === reviewerModel && rowVerdict === verdict) {
      return { added: false };
    }
  }

  // Build the new row in canonical column order (matches the header literally
  // so order-shifts do not produce mis-aligned cells).
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const valuesByCol = {
    timestamp,
    analyzed_head: analyzedHead,
    actor,
    model: reviewerModel,
    verdict,
    evidence_link: evidenceLink,
  };
  const orderedCells = headerCells.map((h) => valuesByCol[h] !== undefined ? valuesByCol[h] : '');
  const newRow = `| ${orderedCells.join(' | ')} |`;
  const newSection = section.replace(/\s*$/, '\n' + newRow + '\n');
  const newBody = body.replace(section, newSection);

  // Write to a temp file and pass via --body-file.
  const tmpPath = path.join(os.tmpdir(), `check-review-output-pr-${pr}-${process.pid}.md`);
  fs.writeFileSync(tmpPath, newBody, 'utf8');
  try {
    const ghEdit = runGh(['pr', 'edit', pr, '--repo', repo, '--body-file', tmpPath]);
    if (ghEdit.status !== 0) return { error: `gh pr edit failed: ${ghEdit.stderr.trim()}` };
    return { added: true };
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}

function escapeRegex(s) { // eslint-disable-line no-unused-vars
  // Reserved for future use; canonical regex helper kept here so callers don't
  // have to re-derive the metachar set if they need substring-match dedup.
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
