#!/usr/bin/env node
/**
 * scripts/check-clickstop-implementer-not-reviewer.mjs — Agent/model independence linter.
 *
 * Scans planned/, active/, and done/ clickstop files for a `## Model audit` key-value
 * table. `Implementer agent` and `Reviewer agent` must be present and must
 * not match case-insensitively. `Implementer models` and `Reviewer model` must
 * satisfy the PR-side model-independence policy: model IDs are normalized to a
 * family+version form (so `"Claude Sonnet 4.6"` and `claude-sonnet-4-6` compare
 * equal); a reviewer/implementer overlap is an ERROR unless the reviewer model
 * is the configured primary reviewer (`reviews.rubber_duck_model`, schema
 * default `gpt-5.5`) AND the clickstop is NOT high-risk. Both the primary
 * reviewer model and the high-risk set are read from `harness.config.json` →
 * `reviews.*` via the shared `loadReviewsPolicy` reader (CS61, applying
 * LRN-145; CS57 C57-3); a malformed config fails closed (CS57 C57-6).
 *
 * A missing or structurally-malformed `## Model audit` is an ERROR for files
 * that pass a date gate keyed on `MODEL_AUDIT_ENFORCEMENT_DATE` (CS57 C57-4):
 * `active/` files always enforce; `done/` files closed on/after the enforcement
 * date enforce while earlier ones are grandfathered (warn-only); `planned/`
 * files are warn-only regardless of date. Missing agent rows warn by default;
 * pass --strict-agent-columns to turn missing agent warnings into errors.
 */

import fs from 'node:fs';
import path from 'node:path';
import { headingAnchor } from '../lib/doc-schema.mjs';
import { loadReviewsPolicy } from '../lib/reviews-policy.mjs';

const LINTED_SUBDIRS = ['planned', 'active', 'done'];

/**
 * CS57 C57-4 — enforcement cutoff for the missing/malformed `## Model audit`
 * rule. Set strictly AFTER the latest existing closed CS (2026-06-03) so the
 * historical CS48–CS56 `done/` files that predate Model-audit enforcement stay
 * grandfathered (warn-only). `done/` files closed on/after this date and all
 * `active/` files must carry a well-formed `## Model audit`; `planned/` files
 * are warn-only regardless of date.
 */
const MODEL_AUDIT_ENFORCEMENT_DATE = '2026-06-04';

/**
 * CS43 — recurse into nested CS subdirectories under
 * `project/clickstops/{planned,active,done}/` (e.g. `done_cs01_bootstrap-repo/`)
 * with a date-gated grandfather. Done CSs whose `**Closed:**` date
 * parses to a value strictly BEFORE this constant are silently skipped;
 * everything at-or-after this date is linted as usual. The constant
 * mirrors the `CLOSEOUT_TASK_ENFORCEMENT_DATE` pattern in
 * `scripts/check-clickstop.mjs`.
 */
const IMPLEMENTER_NOT_REVIEWER_RECURSION_ENFORCEMENT_DATE = '2026-05-14';

/** Match the `^(planned|active|done)_cs\d+[a-z]*_.*$` CS subfolder pattern used
 *  for nested CS files (e.g. `done_cs01_bootstrap-repo/`). Aligned with
 *  `scripts/check-clickstop.mjs` (which uses `[a-z]*` for multi-letter
 *  suffixes like `cs10bb`) so the two linters cover the same set of files. */
const NESTED_CS_DIR_RE = /^(planned|active|done)_cs\d+[a-z]*_.*$/;

const HELP = `\
Usage: check-clickstop-implementer-not-reviewer.mjs [--cwd <dir>] [--strict-agent-columns] [--quiet] [--help]

Validate that ` + '`## Model audit`' + ` records distinct Implementer/Reviewer agent values and model-independent Implementer/Reviewer values.

Options:
  --cwd <dir>                 Consumer repo root (default: process.cwd())
  --strict-agent-columns      Treat missing Implementer/Reviewer agent rows as errors
  --quiet                     Suppress per-finding output; print only the summary
  --help                      Print this help text

Exit codes:
  0  pass (or warnings only with default --strict-agent-columns=false)
  1  agent-identity violation, model-independence violation, missing/malformed Model audit (date-gated), malformed harness.config.json, or strict mode + missing agent columns
  2  bad usage
`;

let cwd = process.cwd();
let strictAgentColumns = false;
let quiet = false;

function requireValue(args, i, flagName) {
  if (!args[i + 1] || args[i + 1].startsWith('-')) {
    process.stderr.write(
      `check-clickstop-implementer-not-reviewer: missing value for ${flagName}\n${HELP}`
    );
    process.exit(2);
  }
  return args[i + 1];
}

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--cwd') {
    cwd = path.resolve(requireValue(argv, i, '--cwd'));
    i++;
  } else if (a.startsWith('--cwd=')) {
    const v = a.slice('--cwd='.length);
    if (!v) {
      process.stderr.write(`check-clickstop-implementer-not-reviewer: --cwd= requires a value\n${HELP}`);
      process.exit(2);
    }
    cwd = path.resolve(v);
  } else if (a === '--strict-agent-columns') {
    strictAgentColumns = true;
  } else if (a === '--quiet') {
    quiet = true;
  } else if (a === '--help' || a === '-h') {
    process.stdout.write(HELP);
    process.exit(0);
  } else {
    process.stderr.write(`check-clickstop-implementer-not-reviewer: unknown flag: ${a}\n${HELP}`);
    process.exit(2);
  }
}

if (!fs.existsSync(cwd)) {
  process.stderr.write(`check-clickstop-implementer-not-reviewer: --cwd directory not found: ${cwd}\n`);
  process.exit(2);
}

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

function parseTableRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((cell) => cell.trim());
}

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
      dataRows.push(parseTableRow(line));
      rowLineOffsets.push(i);
      continue;
    }

    dataRows.push(parseTableRow(line));
    rowLineOffsets.push(i);
  }

  return { headerCells: headerCells || [], dataRows, rowLineOffsets };
}

function buildColMap(headerCells) {
  const map = new Map();
  for (let i = 0; i < headerCells.length; i++) {
    map.set(headerCells[i].toLowerCase().trim(), i);
  }
  return map;
}

function missingAgentFinding(label, line, missingFields) {
  const message =
    `${label}:${line}: ## Model audit missing required agent row(s) (absent or empty): ${missingFields.join(', ')}. ` +
    `Fix: add "| Implementer agent | <github-login> |" and ` +
    `"| Reviewer agent | <github-login> |" rows with distinct GitHub usernames.`;
  if (strictAgentColumns) {
    logError(message);
  } else {
    logWarning(message);
  }
}

function missingModelMessage(label, line, missingFields) {
  return `${label}:${line}: ## Model audit missing required model row(s) (absent or empty): ${missingFields.join(', ')}. ` +
    `Fix: add "| Implementer models | <comma-separated model ids> |" and ` +
    `"| Reviewer model | <single model id> |" rows whose values do not overlap.`;
}

function missingModelFinding(label, line, missingFields) {
  logError(missingModelMessage(label, line, missingFields));
}

function missingModelWarning(label, line, missingFields) {
  logWarning(missingModelMessage(label, line, missingFields));
}

function normalizeModelId(value) {
  const compact = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');

  // Fold known families to `family-major.minor` so doc-style and config-style
  // spellings (and trailing capability qualifiers like `-high`/`-1m`/`-xhigh`)
  // collapse to the same canonical id (CS57 C57-1). Unknown shapes pass through.
  const claude = compact.match(/^(?:claude-)?(opus|sonnet|haiku)-(\d+)-(\d+)/);
  if (claude) return `claude-${claude[1]}-${claude[2]}.${claude[3]}`;

  const gpt = compact.match(/^gpt-(\d+)-(\d+)/);
  if (gpt) return `gpt-${gpt[1]}.${gpt[2]}`;

  return compact;
}

/**
 * Read the reviews policy once from `harness.config.json` via the shared
 * loadReviewsPolicy reader (CS61, applying LRN-145). The reader applies schema
 * defaults when a field is absent and throws on a present-but-malformed value;
 * we capture that throw here and fail closed below (logError + `null` high-risk
 * sentinel) rather than crashing at module load.
 *
 * @returns {{policy: object|null, error: Error|null}}
 */
function loadReviewsPolicySafe() {
  try {
    return { policy: loadReviewsPolicy({ cwd }), error: null };
  } catch (error) {
    return { policy: null, error };
  }
}

const { policy: reviewsPolicy, error: reviewsPolicyError } = loadReviewsPolicySafe();

/**
 * High-risk clickstop set from `reviews.high_risk_clickstops` via the shared
 * reader (CS57 C57-3/C57-6 contract preserved):
 *   - config absent, or present-and-valid with the key absent → schema default;
 *   - key present as an array (including `[]`) → returned verbatim (an explicit
 *     empty array is honored as an empty high-risk set);
 *   - malformed config (JSON parse error, non-array value, or an element that
 *     is not a CS-id) → emit an ERROR naming the offending surface and return
 *     `null` (fail-closed sentinel — stricter than the runtime consumers).
 *
 * @returns {string[] | null}  CS-id list, or `null` on fail-closed config.
 */
function loadHighRiskClickstops() {
  if (reviewsPolicyError) {
    logError(
      `${reviewsPolicyError.message}. Refusing to fall back to the default ` +
      `high-risk set — failing closed (CS57 C57-6).`
    );
    return null;
  }
  return reviewsPolicy.high_risk_clickstops;
}

// Primary reviewer model from `reviews.rubber_duck_model` via the shared reader
// (schema default applies when absent) — no hard-coded literal (CS61, LRN-145).
// When the config is malformed (`reviewsPolicy` is null) the high-risk set is
// the null fail-closed sentinel, so every overlap is treated as high-risk and
// this value is never consulted; `?? ''` keeps it defined without a literal.
const PRIMARY_REVIEWER_MODEL = normalizeModelId(reviewsPolicy?.rubber_duck_model ?? '');
// Display form of the configured primary reviewer for fix-guidance messages —
// sourced from reviews.rubber_duck_model (schema default applies when absent),
// never a hard-coded literal (CS61, LRN-145 EC2). When the config failed to load
// (reviewsPolicy null), don't name a specific model in the guidance.
const PRIMARY_REVIEWER_DISPLAY = reviewsPolicy?.rubber_duck_model || 'the configured primary reviewer model';
const HIGH_RISK_LIST = loadHighRiskClickstops();
const HIGH_RISK_CLICKSTOPS =
  HIGH_RISK_LIST === null ? null : new Set(HIGH_RISK_LIST.map((id) => id.toUpperCase()));

/**
 * Parse the `**Closed:** YYYY-MM-DD` line from a clickstop body.
 *
 * Returns one of:
 *   - `{ kind: 'missing' }`           — no `**Closed:**` line in the body.
 *   - `{ kind: 'unparseable', raw }`  — line present but the value is not a
 *                                       valid YYYY-MM-DD date (e.g. em-dash
 *                                       placeholder `—`, plain `-`, `TBD`,
 *                                       `<ISO-...>`, `(when done)`).
 *   - `{ kind: 'date', date }`        — value parses as YYYY-MM-DD (with
 *                                       optional trailing `THH:MMZ` time or
 *                                       `(parenthetical context)`).
 *
 * The split between `missing` and `unparseable` lets the caller treat them
 * differently (CS43 C43-4 emits a per-file WARN for `unparseable` because
 * that signals a half-formed close-out worth flagging, but stays silent for
 * `missing` because that case is owned by `scripts/check-clickstop.mjs`'s
 * required-fields check and is not this script's concern).
 *
 * @param {string} content
 * @returns {{ kind: 'missing' } | { kind: 'unparseable', raw: string } | { kind: 'date', date: Date }}
 */
function parseClosedDate(content) {
  const lines = content.split('\n');
  for (const line of lines) {
    const m = line.match(/^\*\*Closed:\*\*\s*(.*?)\s*$/);
    if (!m) continue;
    const raw = m[1];
    if (!raw) return { kind: 'unparseable', raw: '' };
    const dateMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!dateMatch) return { kind: 'unparseable', raw };
    const iso = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T00:00:00Z`;
    const ts = Date.parse(iso);
    if (!Number.isFinite(ts)) return { kind: 'unparseable', raw };
    return { kind: 'date', date: new Date(ts) };
  }
  return { kind: 'missing' };
}

const ENFORCEMENT_DATE_MS = Date.parse(
  `${IMPLEMENTER_NOT_REVIEWER_RECURSION_ENFORCEMENT_DATE}T00:00:00Z`,
);

const MODEL_AUDIT_ENFORCEMENT_DATE_MS = Date.parse(
  `${MODEL_AUDIT_ENFORCEMENT_DATE}T00:00:00Z`,
);

function clickstopIdFromBasename(basename) {
  const m = basename.match(/^(?:planned|active|done)_(cs\d+[a-z]*)_/i);
  return m ? m[1].toUpperCase() : null;
}

/**
 * CS57 C57-4 — decide whether a missing/structurally-malformed `## Model audit`
 * is an ERROR (enforced) or a WARN (grandfathered) for this file. Mirrors
 * `shouldLintByDateGate`'s `**Closed:**` handling for `done/` files but keyed on
 * `MODEL_AUDIT_ENFORCEMENT_DATE`:
 *   - `planned/` → warn-only regardless of date (no implementation surface yet);
 *   - `active/`  → always enforce;
 *   - `done/` with a parseable `**Closed:**` on/after the enforcement date → enforce,
 *     strictly before → grandfather (warn-only);
 *   - `done/` missing the `**Closed:**` line → enforce (check-clickstop.mjs
 *     separately requires the field, so this is not a silent bypass);
 *   - `done/` with an unparseable `**Closed:**` → warn-only (these are already
 *     warn+skipped upstream by `shouldLintByDateGate`, so this is defensive).
 *
 * @param {string} lifecycleSubdir  active/done/planned.
 * @param {string} content          File content (for the `**Closed:**` date).
 * @returns {boolean}  true → ERROR on missing audit; false → WARN only.
 */
function shouldRequireModelAudit(lifecycleSubdir, content) {
  if (lifecycleSubdir === 'planned') return false;
  if (lifecycleSubdir === 'active') return true;
  if (lifecycleSubdir !== 'done') return false;
  const closed = parseClosedDate(content);
  if (closed.kind === 'missing') return true;
  if (closed.kind === 'unparseable') return false;
  return closed.date.getTime() >= MODEL_AUDIT_ENFORCEMENT_DATE_MS;
}

function missingAuditModelFinding(label, line, missingFields, requireAudit) {
  if (requireAudit) {
    missingModelFinding(label, line, missingFields);
  } else {
    missingModelWarning(label, line, missingFields);
  }
}

/**
 * Date-gate predicate per CS43 C43-2/C43-3/C43-4. Returns `true` if the
 * file should be linted, `false` if it is grandfathered out.
 *
 *   - Active and planned files: always lint (C43-3); the date-gate only
 *     applies to `done_*` files.
 *   - Done files with a parseable `**Closed:**` date strictly BEFORE
 *     `IMPLEMENTER_NOT_REVIEWER_RECURSION_ENFORCEMENT_DATE`: silently
 *     grandfathered out.
 *   - Done files with an unparseable `**Closed:**` value (em-dash, TBD,
 *     etc.): WARN+skip per C43-4.
 *   - Done files missing the `**Closed:**` line entirely: lint normally;
 *     `check-clickstop.mjs` already enforces the required-fields invariant.
 *
 * @param {string} label  Human-readable label for diagnostics.
 * @param {string} basename  Filename (e.g. `done_cs01_thing.md`).
 * @param {string} content  File content.
 * @returns {boolean}
 */
function shouldLintByDateGate(label, basename, content) {
  if (!/^done_/.test(basename)) return true;
  const closed = parseClosedDate(content);
  if (closed.kind === 'missing') return true;
  if (closed.kind === 'unparseable') {
    logWarning(
      `${label}: skipping due to unparseable **Closed:** date '${closed.raw}' ` +
      `(CS43 C43-4 — unparseable date is not a hygiene gate failure).`,
    );
    return false;
  }
  if (closed.date.getTime() < ENFORCEMENT_DATE_MS) return false;
  return true;
}

function checkFile(filePath, labelPrefix, lifecycleSubdir = labelPrefix.split('/')[0]) {
  const basename = path.basename(filePath);
  const label = `${labelPrefix}/${basename}`;
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8')
      .replace(/^\uFEFF/, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
  } catch (err) {
    logError(`${label}: cannot read file: ${err.message}`);
    return;
  }
  if (!shouldLintByDateGate(label, basename, content)) return;

  const requireAudit = shouldRequireModelAudit(lifecycleSubdir, content);

  const section = extractSectionWithLineNumber(content, headingAnchor('Model audit'));
  if (!section) {
    missingAgentFinding(label, 1, ['Implementer agent', 'Reviewer agent']);
    missingAuditModelFinding(label, 1, ['Implementer models', 'Reviewer model'], requireAudit);
    return;
  }

  const { headerCells, dataRows, rowLineOffsets } = parseMarkdownTable(section.body);
  if (!headerCells || headerCells.length === 0) {
    missingAgentFinding(label, section.headingLine, ['Implementer agent', 'Reviewer agent']);
    missingAuditModelFinding(label, section.headingLine, ['Implementer models', 'Reviewer model'], requireAudit);
    return;
  }

  const colMap = buildColMap(headerCells);
  const fieldIdx = colMap.get('field');
  const valueIdx = colMap.get('value');
  if (fieldIdx === undefined || valueIdx === undefined) {
    missingAgentFinding(label, section.headingLine, ['Implementer agent', 'Reviewer agent']);
    missingAuditModelFinding(label, section.headingLine, ['Implementer models', 'Reviewer model'], requireAudit);
    return;
  }

  let implementerAgentRaw = null;
  let reviewerAgentRaw = null;
  let implementerModelsRaw = null;
  let reviewerModelRaw = null;
  let implementerAgentLine = section.headingLine;
  let reviewerAgentLine = section.headingLine;
  let implementerModelsLine = section.headingLine;
  let reviewerModelLine = section.headingLine;

  for (let i = 0; i < dataRows.length; i++) {
    const cells = dataRows[i];
    if (cells.length <= Math.max(fieldIdx, valueIdx)) continue;
    const fieldName = cells[fieldIdx].toLowerCase().trim();
    const value = cells[valueIdx];
    const rowLine = section.headingLine + 1 + rowLineOffsets[i];
    if (fieldName === 'implementer agent') {
      implementerAgentRaw = value;
      implementerAgentLine = rowLine;
    } else if (fieldName === 'reviewer agent') {
      reviewerAgentRaw = value;
      reviewerAgentLine = rowLine;
    } else if (fieldName === 'implementer models') {
      implementerModelsRaw = value;
      implementerModelsLine = rowLine;
    } else if (fieldName === 'reviewer model') {
      reviewerModelRaw = value;
      reviewerModelLine = rowLine;
    }
  }

  const implementerAgentTrimmed = implementerAgentRaw === null ? '' : implementerAgentRaw.trim();
  const reviewerAgentTrimmed = reviewerAgentRaw === null ? '' : reviewerAgentRaw.trim();

  const missingFields = [];
  if (implementerAgentTrimmed === '') missingFields.push('Implementer agent');
  if (reviewerAgentTrimmed === '') missingFields.push('Reviewer agent');
  if (missingFields.length > 0) {
    missingAgentFinding(label, section.headingLine, missingFields);
  } else {
    const implementerAgent = implementerAgentTrimmed.toLowerCase();
    const reviewerAgent = reviewerAgentTrimmed.toLowerCase();
    if (implementerAgent === reviewerAgent) {
      logError(
        `${label}:${reviewerAgentLine}: ## Model audit agent-identity violation — ` +
        `Implementer agent and Reviewer agent are both "${reviewerAgentTrimmed}" ` +
        `(case-insensitive compare). Fix: dispatch a reviewer under a different GitHub identity ` +
        `and update the Reviewer agent row at ${label}:${reviewerAgentLine}.`
      );
    }
  }

  const implementerModels = (implementerModelsRaw === null ? '' : implementerModelsRaw)
    .split(',')
    .map(normalizeModelId)
    .filter(Boolean);
  const reviewerModel = reviewerModelRaw === null ? '' : normalizeModelId(reviewerModelRaw);

  const missingModelFields = [];
  if (implementerModels.length === 0) missingModelFields.push('Implementer models');
  if (reviewerModel === '') missingModelFields.push('Reviewer model');
  if (missingModelFields.length > 0) {
    const missingLine = implementerModels.length === 0 ? implementerModelsLine : reviewerModelLine;
    missingModelFinding(label, missingLine, missingModelFields);
    return;
  }

  const overlap = implementerModels.filter((m) => m === reviewerModel);
  if (overlap.length > 0) {
    const csId = clickstopIdFromBasename(basename);
    // Fail-closed config (null high-risk set) forces high-risk treatment so a
    // primary-reviewer overlap is never silently allowed when the config is malformed.
    const highRisk = HIGH_RISK_CLICKSTOPS === null
      ? true
      : (csId ? HIGH_RISK_CLICKSTOPS.has(csId) : false);
    if (reviewerModel !== PRIMARY_REVIEWER_MODEL || highRisk) {
      const fix = reviewerModel === PRIMARY_REVIEWER_MODEL
        ? `obtain an independent ${PRIMARY_REVIEWER_DISPLAY} review or explicit user waiver for this high-risk CS`
        : `dispatch an independent reviewer or use ${PRIMARY_REVIEWER_DISPLAY} per the PR-side independence gate`;
      logError(
        `${label}:${reviewerModelLine}: ## Model audit model-independence violation — ` +
        `Implementer models {${implementerModels.join(', ')}} overlap with Reviewer model {${reviewerModel}} ` +
        `(normalized family/version compare). Fix: ${fix} ` +
        `and update the Reviewer model row at ${label}:${reviewerModelLine}.`
      );
    }
  }
}

let filesChecked = 0;
const clickstopsDir = path.join(cwd, 'project', 'clickstops');

/**
 * Match canonical CS file basenames (e.g. `done_cs01_bootstrap-repo.md`).
 * Auxiliary files inside a nested CS subfolder (e.g. `harness-cs-plan.md`)
 * do not match and are intentionally NOT linted by this script — they
 * carry their own structure.
 */
const CS_FILE_RE = /^(planned|active|done)_cs\d+[a-z]*_.*\.md$/;

/**
 * Walk a single `LINTED_SUBDIRS` directory: lint every CS-shaped `.md` file
 * directly inside, and additionally descend ONE level into each child
 * directory whose name matches the canonical CS subfolder pattern (e.g.
 * `done_cs01_bootstrap-repo/`) per CS43 C43-1. Sub-subdirectories are NOT
 * descended into — CSs do not nest more deeply than one level. Files whose
 * basename does not match the canonical CS-file shape are skipped (auxiliary
 * docs).
 *
 * @param {string} dirPath  Absolute path to the active/done/planned dir.
 * @param {string} subdir   The lifecycle subdir name (active/done/planned).
 */
function walkClickstopSubdir(dirPath, subdir) {
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (err) {
    logError(`${subdir}/: cannot read directory: ${err.message}`);
    return;
  }

  for (const entry of entries) {
    if (entry.name === '.gitkeep') continue;
    if (entry.isFile()) {
      if (!CS_FILE_RE.test(entry.name)) continue;
      filesChecked++;
      checkFile(path.join(dirPath, entry.name), subdir);
      continue;
    }
    if (entry.isDirectory() && NESTED_CS_DIR_RE.test(entry.name)) {
      const nestedPath = path.join(dirPath, entry.name);
      const nestedLabel = `${subdir}/${entry.name}`;
      let nestedEntries;
      try {
        nestedEntries = fs.readdirSync(nestedPath, { withFileTypes: true });
      } catch (err) {
        logError(`${nestedLabel}/: cannot read directory: ${err.message}`);
        continue;
      }
      for (const nested of nestedEntries) {
        if (!nested.isFile()) continue;
        if (!CS_FILE_RE.test(nested.name)) continue;
        filesChecked++;
        checkFile(path.join(nestedPath, nested.name), nestedLabel, subdir);
      }
    }
    // Any other directory shape (e.g. unrecognised prefix or two-level nesting)
    // is silently skipped per C43-1's defensive recursion.
  }
}

for (const subdir of LINTED_SUBDIRS) {
  const dirPath = path.join(clickstopsDir, subdir);
  if (!fs.existsSync(dirPath)) continue;
  walkClickstopSubdir(dirPath, subdir);
}

if (!quiet) {
  process.stdout.write(
    `check-clickstop-implementer-not-reviewer: scanned ${filesChecked} files ` +
    `(strictAgentColumns=${strictAgentColumns})\n`
  );
}
process.stdout.write(
  `check-clickstop-implementer-not-reviewer: ${errors.length} errors, ${warnings.length} warnings\n`
);

process.exit(errors.length > 0 ? 1 : 0);
