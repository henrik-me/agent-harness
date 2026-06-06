#!/usr/bin/env node
/** G-RG-3: independence-invariant. */

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { extractH2, isPlaceholder, normalizeModel, parseTable } from './check-review-log-evidence.mjs';
import { loadReviewsPolicy, ReviewsConfigError } from '../../lib/config-reader.mjs';

const HELP = `Usage: check-independence-invariant.mjs (--pr-body <file> | --repo <owner/repo> --pr <num>) [options]

G-RG-3: verify ## Model audit satisfies the implementer/reviewer model independence invariant.

Options:
  --pr-body <file>     Read PR body markdown from a local file
  --repo <owner/repo>  GitHub repository for fetching PR body via gh api
  --pr <num>           Pull request number for --repo mode
  --config <file>      harness.config.json path (default: ./harness.config.json if present)
  --cs-id <CSNN>       Clickstop id for high-risk lookup (otherwise inferred from body)
  --quiet              Suppress per-finding output; print summary only
  --help               Print this help text

Exit codes:
  0  pass (or skipped when reviews.enforce_gates=false)
  1  policy violation or config/validation error
  2  bad usage or transport error
`;

class UsageError extends Error {}

function requireValue(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith('-')) throw new UsageError(`missing value for ${flag}`);
  return value;
}

function splitModelList(value) {
  return String(value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseKeyValueAudit(content) {
  const section = extractH2(content, 'Model audit');
  if (!section) return { fields: new Map(), errors: ['## Model audit section is missing'] };
  const table = parseTable(section.body);
  if (table.headers.length === 0) return { fields: new Map(), errors: ['## Model audit table is missing'] };
  const headers = table.headers.map((header) => header.trim().toLowerCase());
  const fieldIdx = headers.indexOf('field');
  const valueIdx = headers.indexOf('value');
  if (fieldIdx === -1 || valueIdx === -1) {
    return { fields: new Map(), errors: ['## Model audit must use | Field | Value | columns'] };
  }
  const fields = new Map();
  const errors = [];
  for (const row of table.rows) {
    const field = row.cells[fieldIdx]?.trim() ?? '';
    const value = row.cells[valueIdx]?.trim() ?? '';
    if (!field) continue;
    fields.set(field.toLowerCase(), value);
    if (isPlaceholder(field) || isPlaceholder(value)) {
      errors.push(`## Model audit row "${field}" contains a template placeholder`);
    }
  }
  return { fields, errors };
}

function normalizeCsId(value) {
  const raw = String(value ?? '').trim();
  const match = raw.match(/\bCS\d{2,}[A-Za-z]?\b/i);
  return match ? match[0].replace(/^cs/i, 'CS') : null;
}

function inferCsId(body) {
  return normalizeCsId(body);
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

export function runIndependenceInvariant({
  body,
  label = '<pr-body>',
  config = {},
  csId = null,
  quiet = false,
}) {
  const errors = [];
  const stdout = [];
  const stderr = [];
  const emit = (message) => {
    errors.push(message);
    if (!quiet) stdout.push(`ERROR: ${message}`);
  };

  if (config.enforce_gates === false) {
    stdout.push('independence-invariant: 0 errors, 0 warnings (skipped: reviews.enforce_gates=false)');
    return { exitCode: 0, stdout, stderr };
  }

  const audit = parseKeyValueAudit(body);
  for (const error of audit.errors) emit(`${label}: ${error}; fill ## Model audit per REVIEWS.md §2.8.`);

  const implementerRaw = audit.fields.get('implementer models') ?? '';
  const reviewerRaw = audit.fields.get('reviewer model') ?? '';
  if (!implementerRaw) emit(`${label}: ## Model audit is missing Implementer models.`);
  if (!reviewerRaw) emit(`${label}: ## Model audit is missing Reviewer model.`);
  if (!implementerRaw || !reviewerRaw) return summarize(errors, stdout, stderr);

  const implementerModels = splitModelList(implementerRaw).map((entry) => ({ raw: entry, normalized: normalizeModel(entry) }));
  const reviewer = { raw: reviewerRaw.trim(), normalized: normalizeModel(reviewerRaw) };
  if (implementerModels.length === 0) emit(`${label}: Implementer models must list at least one material implementation model.`);
  if (!reviewer.normalized) emit(`${label}: Reviewer model must be populated.`);

  const effectiveCsId = normalizeCsId(csId) ?? inferCsId(body);
  // config is the normalized reviews policy from loadReviewsPolicy: every field
  // is already populated from harness.config.json or the schema default, so no
  // local schema-default fallback is needed here (the `?? []`/`?? ''` guards are
  // purely defensive for direct callers that pass a partial config object).
  const highRiskSet = new Set((config.high_risk_clickstops ?? []).map((id) => String(id).toUpperCase()));
  const highRisk = effectiveCsId ? highRiskSet.has(effectiveCsId.toUpperCase()) : false;
  const primaryReviewerModel = config.rubber_duck_model ?? '';
  const primaryReviewerNormalized = normalizeModel(primaryReviewerModel);
  const overlaps = implementerModels.filter((model) => model.normalized === reviewer.normalized);

  if (overlaps.length > 0) {
    const overlapText = overlaps.map((model) => model.raw).join(', ');
    if (reviewer.normalized !== primaryReviewerNormalized) {
      emit(
        `${label}: independence invariant violation — Reviewer model "${reviewer.raw}" appears in Implementer models (${overlapText}); ` +
        `dispatch an independent reviewer or use ${primaryReviewerModel} per REVIEWS.md §2.8.`
      );
    } else if (highRisk) {
      emit(
        `${label}: high-risk ${effectiveCsId} forbids implementer/reviewer model overlap even for ${primaryReviewerModel}; ` +
        `obtain an independent ${primaryReviewerModel} review or explicit user waiver.`
      );
    }
  }

  return summarize(errors, stdout, stderr);
}

function summarize(errors, stdout, stderr) {
  stdout.push(`independence-invariant: ${errors.length} error${errors.length === 1 ? '' : 's'}, 0 warnings`);
  return { exitCode: errors.length > 0 ? 1 : 0, stdout, stderr };
}

function parseCli(argv) {
  const parsed = { prBody: null, repo: null, pr: null, configPath: null, csId: null, quiet: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--pr-body') parsed.prBody = requireValue(argv, i++, '--pr-body');
    else if (arg === '--repo') parsed.repo = requireValue(argv, i++, '--repo');
    else if (arg === '--pr') parsed.pr = requireValue(argv, i++, '--pr');
    else if (arg === '--config') parsed.configPath = requireValue(argv, i++, '--config');
    else if (arg === '--cs-id') parsed.csId = requireValue(argv, i++, '--cs-id');
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
    process.stderr.write(`check-independence-invariant: ${error.message}\n${HELP}`);
    process.exit(2);
  }
  if (args.help) {
    process.stdout.write(HELP);
    process.exit(0);
  }

  let body;
  let label;
  let config;
  try {
    config = loadReviewsPolicy({ configPath: args.configPath });
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
    process.stderr.write(`check-independence-invariant: ${error.message}\n`);
    process.exit(error instanceof ReviewsConfigError ? 1 : 2);
  }

  const result = runIndependenceInvariant({ body, label, config, csId: args.csId, quiet: args.quiet });
  for (const line of result.stderr) process.stderr.write(`${line}\n`);
  for (const line of result.stdout) process.stdout.write(`${line}\n`);
  process.exit(result.exitCode);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
