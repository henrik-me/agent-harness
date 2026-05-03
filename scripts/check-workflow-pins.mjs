#!/usr/bin/env node
/**
 * scripts/check-workflow-pins.mjs — GitHub Actions workflow pin linter.
 *
 * Walks all .yml/.yaml files under a given workflows directory (--dir).
 * For each file, finds every reference of the form:
 *   uses: henrik-me/agent-harness[/<path>]@<ref>
 *
 * Each <ref> must either:
 *   - Be a 40-char hex SHA pin (always valid), OR
 *   - Exactly match the `version` field in harness.config.json (if configured)
 *
 * Branch refs (e.g. @main, @master, @v1) are always ERRORs unless they are
 * a SHA or explicitly match the configured version.
 *
 * Uses js-yaml to parse workflow YAML; falls back to regex extraction if
 * parsing fails (workflow YAML can have unusual formatting).
 *
 * Usage:
 *   node scripts/check-workflow-pins.mjs --dir <path> [--config <path>] [--quiet]
 *
 * Exit codes:
 *   0 — all pin checks pass
 *   1 — at least one pin error
 *   2 — bad CLI usage (missing required --dir)
 *
 * @module scripts/check-workflow-pins.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

let workflowsDir = null;
let configPath = path.join(repoRoot, 'harness.config.json');
let quiet = false;

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--dir') {
    if (!argv[i + 1] || argv[i + 1].startsWith('-')) {
      process.stderr.write('check-workflow-pins: missing value for --dir\n');
      process.exit(2);
    }
    workflowsDir = argv[++i];
  } else if (a === '--config') {
    if (!argv[i + 1] || argv[i + 1].startsWith('-')) {
      process.stderr.write('check-workflow-pins: missing value for --config\n');
      process.exit(2);
    }
    configPath = argv[++i];
  } else if (a === '--quiet') {
    quiet = true;
  } else if (a === '--help' || a === '-h') {
    process.stdout.write(
      'Usage: check-workflow-pins.mjs --dir <path> [--config <path>] [--quiet]\n\n' +
      'Check that all henrik-me/agent-harness action pins in GitHub Actions\n' +
      'workflows are either a 40-char hex SHA or match the version from\n' +
      'harness.config.json. Branch refs like @main are always ERRORs.\n\n' +
      'Options:\n' +
      '  --dir <path>     Path to the workflows directory to scan (REQUIRED)\n' +
      '  --config <path>  Path to harness.config.json\n' +
      '                   (default: <repoRoot>/harness.config.json)\n' +
      '  --quiet          Suppress per-finding output; print only the summary\n' +
      '  --help           Print this help text\n'
    );
    process.exit(0);
  } else {
    process.stderr.write(`check-workflow-pins: unknown flag: ${a}\n`);
    process.exit(2);
  }
}

if (!workflowsDir) {
  process.stderr.write('check-workflow-pins: --dir <path> is required\n');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Load harness.config.json (optional — missing config is not an error)
// ---------------------------------------------------------------------------

let harnessPin = null;
try {
  const configText = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(configText);
  if (typeof config.version === 'string' && config.version.trim()) {
    harnessPin = config.version.trim();
  }
} catch {
  // Config missing or unreadable — pin matching is skipped; SHA-only rule applies.
}

// ---------------------------------------------------------------------------
// Load js-yaml (with graceful degradation to regex-only mode)
// ---------------------------------------------------------------------------

let yaml = null;
try {
  const yamlModule = await import('js-yaml');
  yaml = yamlModule.default ?? yamlModule;
} catch {
  // js-yaml unavailable — regex fallback will be used for all files.
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Matches a henrik-me/agent-harness uses line and captures the ref. */
const USES_REGEX = /uses:\s+henrik-me\/agent-harness(?:\/[^\s@]+)?@(\S+)/g;

/** A valid 40-char hex SHA pin. */
const SHA_PATTERN = /^[0-9a-f]{40}$/i;

// ---------------------------------------------------------------------------
// Walk workflows directory
// ---------------------------------------------------------------------------

let allYmlFiles = [];
try {
  const entries = fs.readdirSync(workflowsDir);
  allYmlFiles = entries
    .filter((e) => e.endsWith('.yml') || e.endsWith('.yaml'))
    .map((e) => path.join(workflowsDir, e));
} catch (err) {
  process.stderr.write(
    `check-workflow-pins: cannot read directory "${workflowsDir}": ${err.message}\n`
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Finding collectors
// ---------------------------------------------------------------------------

const errors = [];

/**
 * Record an error finding and print it unless --quiet is active.
 *
 * @param {string} msg
 */
function logError(msg) {
  errors.push(msg);
  if (!quiet) process.stdout.write(`ERROR: ${msg}\n`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Recursively walk a parsed YAML object and collect all `uses:` values that
 * reference henrik-me/agent-harness.
 *
 * @param {unknown} obj
 * @param {string[]} refs - accumulator
 * @returns {string[]}
 */
function collectRefsFromParsed(obj, refs = []) {
  if (!obj || typeof obj !== 'object') return refs;
  if (Array.isArray(obj)) {
    for (const item of obj) collectRefsFromParsed(item, refs);
  } else {
    for (const [key, value] of Object.entries(obj)) {
      if (
        key === 'uses' &&
        typeof value === 'string' &&
        value.startsWith('henrik-me/agent-harness')
      ) {
        const atIdx = value.lastIndexOf('@');
        if (atIdx !== -1) {
          refs.push(value.slice(atIdx + 1));
        }
      }
      collectRefsFromParsed(value, refs);
    }
  }
  return refs;
}

/**
 * Extract refs from raw YAML text using regex.
 *
 * @param {string} text
 * @returns {string[]}
 */
function collectRefsFromText(text) {
  const refs = [];
  for (const match of text.matchAll(USES_REGEX)) {
    refs.push(match[1]);
  }
  return refs;
}

/**
 * Validate a single ref and log an error if invalid.
 *
 * @param {string} ref
 * @param {string} relPath
 */
function validateRef(ref, relPath) {
  if (SHA_PATTERN.test(ref)) {
    // 40-char hex SHA — always valid regardless of config.
    return;
  }

  if (harnessPin !== null) {
    if (ref === harnessPin) {
      // Matches configured harness_pin — valid.
      return;
    }
    // Has a configured version but this ref doesn't match.
    logError(
      `${relPath}: pin "@${ref}" does not match version "${harnessPin}" ` +
      `and is not a 40-char hex SHA — update to the expected pin or use a SHA`
    );
  } else {
    // No config pin — any non-SHA ref is a branch/tag drift risk.
    logError(
      `${relPath}: pin "@${ref}" is not a 40-char hex SHA — ` +
      `branch and tag refs are a drift risk; use a SHA pin ` +
      `or configure version in harness.config.json`
    );
  }
}

// ---------------------------------------------------------------------------
// Process each workflow file
// ---------------------------------------------------------------------------

let totalPinsChecked = 0;

for (const filePath of allYmlFiles) {
  const relPath = path.relative(process.cwd(), filePath);

  let fileText;
  try {
    fileText = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    logError(`${relPath}: cannot read file: ${err.message}`);
    continue;
  }

  let refs;
  let usedFallback = false;

  if (yaml) {
    try {
      const parsed = yaml.load(fileText);
      refs = collectRefsFromParsed(parsed);
    } catch {
      // YAML parse error — fall back to regex extraction.
      refs = collectRefsFromText(fileText);
      usedFallback = true;
    }
  } else {
    refs = collectRefsFromText(fileText);
    usedFallback = true;
  }

  if (usedFallback && !quiet) {
    process.stdout.write(
      `WARNING: ${relPath}: YAML parse failed — using regex fallback for pin extraction\n`
    );
  }

  totalPinsChecked += refs.length;
  for (const ref of refs) {
    validateRef(ref, relPath);
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const summary =
  `workflows: ${allYmlFiles.length} files, ` +
  `${totalPinsChecked} pins checked, ` +
  `${errors.length} errors`;

process.stdout.write(`\n${summary}\n`);

if (errors.length === 0) {
  if (!quiet) process.stdout.write('✅ All workflow pins are valid.\n');
  process.exit(0);
} else {
  process.exit(1);
}
