#!/usr/bin/env node
/**
 * scripts/check-clickstop-implementer-not-reviewer.mjs — Agent/model independence linter.
 *
 * Scans planned/, active/, and done/ clickstop files for a `## Model audit` key-value
 * table. `Implementer agent` and `Reviewer agent` must be present and must
 * not match case-insensitively. `Implementer models` and `Reviewer model` must
 * satisfy the PR-side model-independence policy: non-GPT reviewer overlaps fail;
 * GPT-5.5 overlaps fail only for high-risk CSs. Missing model rows are errors;
 * missing agent rows warn by default unless --strict-agent-columns is set.
 */

import fs from 'node:fs';
import path from 'node:path';
import { headingAnchor } from '../lib/doc-schema.mjs';

const LINTED_SUBDIRS = ['planned', 'active', 'done'];
const DEFAULT_HIGH_RISK_CLICKSTOPS = ['CS03', 'CS11', 'CS15a', 'CS18b', 'CS19'];

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
  1  agent-identity violation, model-independence violation, missing model columns, or strict mode + missing agent columns
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

  const claude = compact.match(/^(?:claude-)?(opus|sonnet|haiku)-(\d+)-(\d+)/);
  if (claude) return `claude-${claude[1]}-${claude[2]}.${claude[3]}`;

  const gpt = compact.match(/^gpt-(\d+)-(\d+)/);
  if (gpt) return `gpt-${gpt[1]}.${gpt[2]}`;

  return compact;
}

function loadHighRiskClickstops() {
  const configPath = path.join(cwd, 'harness.config.json');
  if (!fs.existsSync(configPath)) return DEFAULT_HIGH_RISK_CLICKSTOPS;
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (Array.isArray(cfg.reviews?.high_risk_clickstops)) {
      return cfg.reviews.high_risk_clickstops.map((id) => String(id));
    }
  } catch (err) {
    logError(`cannot parse harness.config.json reviews.high_risk_clickstops: ${err.message}`);
  }
  return DEFAULT_HIGH_RISK_CLICKSTOPS;
}

const PRIMARY_REVIEWER_MODEL = normalizeModelId('gpt-5.5');
const HIGH_RISK_CLICKSTOPS = new Set(loadHighRiskClickstops().map((id) => id.toUpperCase()));

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

function clickstopIdFromBasename(basename) {
  const m = basename.match(/^(?:planned|active|done)_(cs\d+[a-z]*)_/i);
  return m ? m[1].toUpperCase() : null;
}

function shouldRequireModelAudit(subdir, basename) {
  // Backlog planned files predate Model audit; active/new done files must not bypass it.
  if (subdir === 'active') return true;
  if (subdir !== 'done') return false;
  const csId = clickstopIdFromBasename(basename);
  const m = csId ? csId.match(/^CS(\d+)/) : null;
  return m ? Number.parseInt(m[1], 10) >= 48 : true;
}

function missingAuditModelFinding(label, line, missingFields, subdir, basename) {
  if (shouldRequireModelAudit(subdir, basename)) {
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

  const section = extractSectionWithLineNumber(content, headingAnchor('Model audit'));
  if (!section) {
    missingAgentFinding(label, 1, ['Implementer agent', 'Reviewer agent']);
    missingAuditModelFinding(label, 1, ['Implementer models', 'Reviewer model'], lifecycleSubdir, basename);
    return;
  }

  const { headerCells, dataRows, rowLineOffsets } = parseMarkdownTable(section.body);
  if (!headerCells || headerCells.length === 0) {
    missingAgentFinding(label, section.headingLine, ['Implementer agent', 'Reviewer agent']);
    missingAuditModelFinding(label, section.headingLine, ['Implementer models', 'Reviewer model'], lifecycleSubdir, basename);
    return;
  }

  const colMap = buildColMap(headerCells);
  const fieldIdx = colMap.get('field');
  const valueIdx = colMap.get('value');
  if (fieldIdx === undefined || valueIdx === undefined) {
    missingAgentFinding(label, section.headingLine, ['Implementer agent', 'Reviewer agent']);
    missingAuditModelFinding(label, section.headingLine, ['Implementer models', 'Reviewer model'], lifecycleSubdir, basename);
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
    const highRisk = csId ? HIGH_RISK_CLICKSTOPS.has(csId) : false;
    if (reviewerModel !== PRIMARY_REVIEWER_MODEL || highRisk) {
      const fix = reviewerModel === PRIMARY_REVIEWER_MODEL
        ? 'obtain an independent GPT-5.5 review or explicit user waiver for this high-risk CS'
        : 'dispatch an independent reviewer or use GPT-5.5 per the PR-side independence gate';
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
