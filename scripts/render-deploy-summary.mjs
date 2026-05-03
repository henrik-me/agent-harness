#!/usr/bin/env node
/**
 * scripts/render-deploy-summary.mjs — Deployment summary markdown renderer.
 *
 * Renders a normalized deployment summary markdown artifact from a structured
 * input JSON. Applies public_artifact_redaction patterns from harness.config.json
 * before emitting the markdown (Decision #24 / LRN-039).
 *
 * Usage:
 *   node scripts/render-deploy-summary.mjs --in <path> [--out <path>]
 *     [--config <path>] [--redact-required] [--quiet] [--help]
 *
 * Exit codes:
 *   0 — success, markdown emitted
 *   1 — input invalid or redaction required but no config
 *   2 — usage/invocation error (missing required argument)
 *
 * @module scripts/render-deploy-summary.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Guard: assert that argv[i+1] exists and is not a flag token.
 * Exits 2 on violation (LRN-040).
 *
 * @param {string[]} argv
 * @param {number} i  — index of the flag token (e.g. '--in')
 * @param {string} flagName
 * @returns {string}  — the value token
 */
function requireValue(argv, i, flagName) {
  const next = argv[i + 1];
  if (!next || next.startsWith('-')) {
    process.stderr.write(`render-deploy-summary: missing value for ${flagName}\n`);
    process.exit(2);
  }
  return next;
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

let inputPath = null;
let outputPath = null;
let configPath = null;
let redactRequired = false;
let quiet = false;

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--in') {
    inputPath = requireValue(argv, i, '--in');
    i++;
  } else if (a === '--out') {
    outputPath = requireValue(argv, i, '--out');
    i++;
  } else if (a === '--config') {
    configPath = requireValue(argv, i, '--config');
    i++;
  } else if (a === '--redact-required') {
    redactRequired = true;
  } else if (a === '--quiet') {
    quiet = true;
  } else if (a === '--help' || a === '-h') {
    process.stdout.write(
      'Usage: render-deploy-summary.mjs --in <path> [--out <path>] [--config <path>]\n' +
      '                                 [--redact-required] [--quiet] [--help]\n\n' +
      'Render a normalized deployment summary markdown from a structured input JSON.\n\n' +
      'Options:\n' +
      '  --in <path>          Input JSON file (REQUIRED)\n' +
      '  --out <path>         Output markdown file (default: stdout)\n' +
      '  --config <path>      Path to harness.config.json for redaction rules (optional)\n' +
      '  --redact-required    Error if no config is found (redaction is mandatory)\n' +
      '  --quiet              Suppress progress output\n' +
      '  --help               Print this help text\n'
    );
    process.exit(0);
  } else {
    process.stderr.write(`render-deploy-summary: unknown flag: ${a}\n`);
    process.exit(2);
  }
}

if (!inputPath) {
  process.stderr.write('render-deploy-summary: --in <path> is required\n');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Load input JSON
// ---------------------------------------------------------------------------

let inputData;
try {
  const raw = fs.readFileSync(inputPath, 'utf8');
  inputData = JSON.parse(raw);
} catch (err) {
  process.stderr.write(`render-deploy-summary: cannot read input "${inputPath}": ${err.message}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Validate required fields
// ---------------------------------------------------------------------------

const REQUIRED_FIELDS = [
  'name', 'version', 'environment', 'status',
  'started_at', 'commit_sha', 'commit_message', 'components',
];

const dep = inputData?.deployment;
if (!dep || typeof dep !== 'object') {
  process.stderr.write('render-deploy-summary: input missing required "deployment" object\n');
  process.exit(1);
}

for (const field of REQUIRED_FIELDS) {
  if (dep[field] === undefined || dep[field] === null) {
    process.stderr.write(`render-deploy-summary: deployment missing required field: "${field}"\n`);
    process.exit(1);
  }
}

if (!Array.isArray(dep.components)) {
  process.stderr.write('render-deploy-summary: deployment.components must be an array\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Load config / redaction rules (optional)
// ---------------------------------------------------------------------------

/** @type {RegExp[]} */
const redactPatterns = [];
/** @type {Set<string>} */
const allowedPlaceholders = new Set();
let configLoaded = false;
let deploySummaryRuleFound = false;

// Auto-discover config at cwd/harness.config.json if no explicit path given
const defaultConfigPath = path.join(process.cwd(), 'harness.config.json');
const resolvedConfigPath = configPath ?? (fs.existsSync(defaultConfigPath) ? defaultConfigPath : null);

if (resolvedConfigPath) {
  try {
    const raw = fs.readFileSync(resolvedConfigPath, 'utf8');
    const cfg = JSON.parse(raw);
    const redactionSection = cfg.public_artifact_redaction ?? {};
    // NB-3: select only the deploy-summary artifact-type rule to avoid over-redacting
    // with rules intended for other artifact types (e.g. shadow-report).
    const rule = redactionSection['deploy-summary'];
    if (rule && typeof rule === 'object') {
      deploySummaryRuleFound = true;
      for (const pat of (rule.forbidden_field_patterns ?? [])) {
        try {
          redactPatterns.push(new RegExp(pat, 'g'));
        } catch (regexErr) {
          if (redactRequired) {
            process.stderr.write(
              `render-deploy-summary: --redact-required: invalid regex in deploy-summary forbidden_field_patterns: ${pat} (${regexErr.message})\n`
            );
            process.exit(1);
          }
          // else: skip invalid regex silently
        }
      }
      // NB-5: honor allowed_placeholders — values matching these are NOT redacted
      for (const ph of (rule.allowed_placeholders ?? [])) {
        if (typeof ph === 'string') allowedPlaceholders.add(ph);
      }
    }
    configLoaded = true;
  } catch (err) {
    process.stderr.write(`render-deploy-summary: cannot read config "${resolvedConfigPath}": ${err.message}\n`);
    process.exit(1);
  }
}

// B2: --redact-required must fail unless we have a usable deploy-summary rule
// with at least one valid forbidden pattern.
if (redactRequired && (!configLoaded || !deploySummaryRuleFound || redactPatterns.length === 0)) {
  process.stderr.write(
    'render-deploy-summary: --redact-required is set but no usable deploy-summary redaction rule found ' +
    '(need public_artifact_redaction["deploy-summary"].forbidden_field_patterns with ≥1 valid regex)\n'
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Status icon helper
// ---------------------------------------------------------------------------

/**
 * Returns a status icon string for the given deployment status value.
 * @param {string} status
 * @returns {string}
 */
function statusIcon(status) {
  switch (status) {
    case 'succeeded':   return '✅';
    case 'failed':      return '❌';
    case 'in-progress': return '⏳';
    default:            return '❓';
  }
}

// ---------------------------------------------------------------------------
// Render markdown
// ---------------------------------------------------------------------------

const icon = statusIcon(dep.status);

const componentRows = dep.components.map((c) => {
  const details = c.details ? ` — ${c.details}` : '';
  return `- **${c.name}**: ${c.status}${details}`;
}).join('\n');

const endedLine = dep.ended_at
  ? `**Ended:** ${dep.ended_at}`
  : '**Ended:** —';

let markdown = [
  `# Deployment Summary`,
  ``,
  `**Name:** ${dep.name}`,
  `**Version:** ${dep.version}`,
  `**Environment:** ${dep.environment}`,
  ``,
  `## Status`,
  ``,
  `${icon} **${dep.status}**`,
  ``,
  `## Components`,
  ``,
  componentRows || '_No components listed._',
  ``,
  `## Commit`,
  ``,
  `**SHA:** ${dep.commit_sha}`,
  `**Message:** ${dep.commit_message}`,
  ``,
  `## Timing`,
  ``,
  `**Started:** ${dep.started_at}`,
  endedLine,
  ``,
].join('\n');

// ---------------------------------------------------------------------------
// Apply redaction
// ---------------------------------------------------------------------------

if (!configLoaded && redactRequired) {
  // Already handled above; this branch is unreachable but kept for clarity.
  process.exit(1);
}

for (const re of redactPatterns) {
  markdown = markdown.replace(re, (match) => {
    // NB-5: respect allowed_placeholders — keep matches that exactly equal an
    // allowed placeholder.
    if (allowedPlaceholders.has(match)) return match;
    return '<REDACTED>';
  });
}

// ---------------------------------------------------------------------------
// Emit output
// ---------------------------------------------------------------------------

const byteCount = Buffer.byteLength(markdown, 'utf8');

if (outputPath) {
  try {
    fs.writeFileSync(outputPath, markdown, 'utf8');
  } catch (err) {
    process.stderr.write(`render-deploy-summary: cannot write output "${outputPath}": ${err.message}\n`);
    process.exit(1);
  }
} else {
  process.stdout.write(markdown);
}

// B1: progress/status output must NEVER mix with markdown on stdout.
// - With --out: progress goes to stderr (or is suppressed in --quiet).
// - Without --out: stdout carries markdown only; --quiet suppresses progress entirely;
//   non-quiet writes progress to stderr.
const progressMsg = `deploy summary: rendered ${byteCount} bytes\n`;
if (!quiet) {
  process.stderr.write(progressMsg);
}
