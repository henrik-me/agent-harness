#!/usr/bin/env node
/**
 * G-RG-1: review-log-evidence.
 *
 * Validates that a content PR body contains real local-review evidence:
 * a Review log row with Go/Conditional Go verdict, an approved reviewer model,
 * and no template placeholders in the Review log or Model audit tables.
 */

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const PASSING_VERDICTS = new Set(['go', 'conditional go', 'go-with-amendments']);
const PRIMARY_REVIEWER_MODEL = 'gpt-5.5';

const HELP = `Usage: check-review-log-evidence.mjs (--pr-body <file> | --repo <owner/repo> --pr <num>) [options]

G-RG-1: verify ## Review log contains at least one real passing review row.

Options:
  --pr-body <file>     Read PR body markdown from a local file
  --repo <owner/repo>  GitHub repository for fetching PR body via gh api
  --pr <num>           Pull request number for --repo mode
  --quiet              Suppress per-finding output; print summary only
  --help               Print this help text

Exit codes:
  0  pass
  1  policy violation
  2  bad usage or transport error
`;

function requireValue(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith('-')) {
    throw new UsageError(`missing value for ${flag}`);
  }
  return value;
}

class UsageError extends Error {}

export function normalizeModel(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

export function normalizeVerdict(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function isPlaceholder(value) {
  const text = String(value ?? '').trim();
  if (!text) return true;
  if (/^[-—–]+$/.test(text)) return true;
  return [
    /_\(.+\)_/,
    /^<[^>]+>$/,
    /\b(TODO|FIXME|TBD|XXX|placeholder)\b/i,
    /model name/i,
    /single id/i,
    /comma-separated/i,
    /40-char SHA/i,
    /YYYY-MM-DD/i,
    /URL or note/i,
    /example:/i,
  ].some((pattern) => pattern.test(text));
}

export function extractH2(content, heading) {
  const target = heading.trim().toLowerCase();
  const lines = String(content ?? '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^##\s+(.+?)\s*$/);
    if (match && match[1].trim().toLowerCase() === target) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,2}\s+/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { body: lines.slice(start + 1, end).join('\n'), line: start + 1 };
}

export function parseTable(sectionBody) {
  const rows = [];
  const lines = String(sectionBody ?? '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw.startsWith('|')) continue;
    if (/^\|[\s\-:|]+\|?$/.test(raw)) continue;
    rows.push({ cells: splitRow(raw), lineOffset: i + 1 });
  }
  if (rows.length === 0) return { headers: [], rows: [] };
  return { headers: rows[0].cells, rows: rows.slice(1) };
}

function splitRow(line) {
  let text = line.trim();
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|')) text = text.slice(0, -1);
  return text.split('|').map((cell) => cell.trim());
}

function columnMap(headers) {
  const map = new Map();
  headers.forEach((header, index) => map.set(header.trim().toLowerCase(), index));
  return map;
}

export function parseModelAudit(content) {
  const section = extractH2(content, 'Model audit');
  if (!section) return { fields: new Map(), errors: ['## Model audit section is missing'] };
  const table = parseTable(section.body);
  if (table.headers.length === 0) return { fields: new Map(), errors: ['## Model audit table is missing'] };
  const cols = columnMap(table.headers);
  const fieldIdx = cols.get('field');
  const valueIdx = cols.get('value');
  if (fieldIdx === undefined || valueIdx === undefined) {
    return { fields: new Map(), errors: ['## Model audit must use | Field | Value | columns'] };
  }
  const fields = new Map();
  const errors = [];
  for (const row of table.rows) {
    const field = row.cells[fieldIdx]?.trim();
    const value = row.cells[valueIdx]?.trim() ?? '';
    if (!field) continue;
    fields.set(field.toLowerCase(), value);
    if (isPlaceholder(field) || isPlaceholder(value)) {
      errors.push(`## Model audit row "${field}" still contains a template placeholder`);
    }
  }
  return { fields, errors };
}

function readBodyFromRepo(repo, prNumber) {
  const result = spawnSync('gh', ['api', `repos/${repo}/pulls/${prNumber}`, '--jq', '.body // ""'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new UsageError(`failed to fetch PR body with gh api: ${(result.stderr || result.stdout || '').trim()}`);
  }
  return result.stdout ?? '';
}

function fallbackRationale(fields) {
  return fields.get('fallback rationale')
    ?? fields.get('fallback reason')
    ?? fields.get('user waiver')
    ?? fields.get('waiver rationale')
    ?? '';
}

function reviewerModelApproved(model, auditFields) {
  const normalized = normalizeModel(model);
  if (normalized === PRIMARY_REVIEWER_MODEL) return { ok: true, reason: 'primary reviewer' };
  const rationale = fallbackRationale(auditFields);
  if (rationale && !isPlaceholder(rationale)) {
    return { ok: true, reason: 'fallback rationale populated' };
  }
  return {
    ok: false,
    reason: `reviewer model "${model}" is not ${PRIMARY_REVIEWER_MODEL} and ## Model audit has no populated Fallback rationale row`,
  };
}

export function runReviewLogEvidence({ body, label = '<pr-body>', quiet = false }) {
  const errors = [];
  const stdout = [];
  const stderr = [];
  const emit = (message) => {
    errors.push(message);
    if (!quiet) stdout.push(`ERROR: ${message}`);
  };

  const audit = parseModelAudit(body);
  for (const error of audit.errors) emit(`${label}: ${error}; see REVIEWS.md §2.8 Model audit.`);

  const section = extractH2(body, 'Review log');
  if (!section) {
    emit(`${label}: ## Review log section is missing; add the canonical table from REVIEWS.md §2.8.`);
    return summarize(errors, stdout, stderr);
  }

  const table = parseTable(section.body);
  if (table.headers.length === 0) {
    emit(`${label}: ## Review log table is missing; add timestamp/analyzed_head/actor/model/verdict/evidence_link columns.`);
    return summarize(errors, stdout, stderr);
  }

  const cols = columnMap(table.headers);
  const verdictIdx = cols.get('verdict');
  const modelIdx = cols.get('reviewer model') ?? cols.get('model');
  if (verdictIdx === undefined) emit(`${label}: ## Review log table is missing a verdict column.`);
  if (modelIdx === undefined) emit(`${label}: ## Review log table is missing a model or Reviewer model column.`);
  if (verdictIdx === undefined || modelIdx === undefined) return summarize(errors, stdout, stderr);

  let passingRows = 0;
  for (let i = 0; i < table.rows.length; i++) {
    const row = table.rows[i];
    const rowNumber = i + 1;
    const placeholders = row.cells.filter((cell) => isPlaceholder(cell));
    if (placeholders.length > 0) {
      emit(`${label}: ## Review log row ${rowNumber} contains template placeholder cell(s); replace every placeholder before merge.`);
      continue;
    }
    const verdict = normalizeVerdict(row.cells[verdictIdx]);
    const model = row.cells[modelIdx] ?? '';
    const trimmedModel = model.trim();
    // Reject ANY non-bare reviewer-model identifier, not just parenthesized decorations.
    // Bare canonical IDs match /^[A-Za-z0-9._-]+$/ (e.g. `gpt-5.5`, `claude-sonnet-4.6`).
    // Decorations like `gpt-5.5 (R2)`, `gpt-5.5 R2`, `gpt-5.5 - R2`, `gpt-5.5 (PvI)` all fail.
    // Don't auto-suggest a "bare" form: heuristic extraction is brittle for non-canonical
    // inputs like `Claude Opus 4.7` (would suggest `Claude`); cite canonical examples instead.
    if (trimmedModel && !/^[A-Za-z0-9._-]+$/.test(trimmedModel)) {
      emit(`${label}: ## Review log row ${rowNumber} has non-bare reviewer model "${model}"; use the bare canonical id matching /^[A-Za-z0-9._-]+$/ (e.g. \`gpt-5.5\`, \`claude-opus-4.7\`, \`claude-sonnet-4.6\`) and put round/role annotations (e.g. "(R2)", "(narrow re-attest)", "(PvI)") in the actor column instead. See REVIEWS.md §2.8 Review log column rules.`);
      continue;
    }
    if (!PASSING_VERDICTS.has(verdict)) continue;
    const approved = reviewerModelApproved(model, audit.fields);
    if (!approved.ok) {
      emit(`${label}: ## Review log row ${rowNumber} has unapproved reviewer model: ${approved.reason}; see REVIEWS.md §2.8.`);
      continue;
    }
    passingRows += 1;
  }

  if (passingRows === 0) {
    emit(`${label}: ## Review log has no passing row with verdict ∈ {Go, Conditional Go} and an approved reviewer model.`);
  }

  return summarize(errors, stdout, stderr);
}

function summarize(errors, stdout, stderr) {
  stdout.push(`review-log-evidence: ${errors.length} error${errors.length === 1 ? '' : 's'}, 0 warnings`);
  return { exitCode: errors.length > 0 ? 1 : 0, stdout, stderr };
}

function parseCli(argv) {
  const parsed = { prBody: null, repo: null, pr: null, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--pr-body') parsed.prBody = requireValue(argv, i++, '--pr-body');
    else if (arg === '--repo') parsed.repo = requireValue(argv, i++, '--repo');
    else if (arg === '--pr') parsed.pr = requireValue(argv, i++, '--pr');
    else if (arg === '--quiet') parsed.quiet = true;
    else if (arg === '--help' || arg === '-h') parsed.help = true;
    else throw new UsageError(`unknown flag: ${arg}`);
  }
  return parsed;
}

async function main() {
  let args;
  try {
    args = parseCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`check-review-log-evidence: ${error.message}\n${HELP}`);
    process.exit(2);
  }
  if (args.help) {
    process.stdout.write(HELP);
    process.exit(0);
  }

  let body;
  let label;
  try {
    if (args.prBody) {
      body = readFileSync(args.prBody, 'utf8');
      label = args.prBody;
    } else if (args.repo && args.pr) {
      if (!/^\d+$/.test(args.pr)) throw new UsageError('--pr must be a positive integer');
      body = readBodyFromRepo(args.repo, args.pr);
      label = `${args.repo}#${args.pr}`;
    } else {
      throw new UsageError('provide either --pr-body <file> or --repo <owner/repo> --pr <num>');
    }
  } catch (error) {
    process.stderr.write(`check-review-log-evidence: ${error.message}\n`);
    process.exit(2);
  }

  const result = runReviewLogEvidence({ body, label, quiet: args.quiet });
  for (const line of result.stderr) process.stderr.write(`${line}\n`);
  for (const line of result.stdout) process.stdout.write(`${line}\n`);
  process.exit(result.exitCode);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href) {
  await main();
}
