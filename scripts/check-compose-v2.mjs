#!/usr/bin/env node
/**
 * scripts/check-compose-v2.mjs — Docker Compose file linter.
 *
 * Validates a docker-compose.yml / compose.yaml file against Compose Spec v2+
 * conventions. Checks:
 *   1. No deprecated top-level `version:` key (v3-style format → ERROR).
 *   2. Top-level `services:` key present and non-empty.
 *   3. No known-deprecated keys (`links:`, `external_links:`, `volume_driver:`).
 *
 * Usage:
 *   node scripts/check-compose-v2.mjs --file <path> [--quiet] [--help]
 *
 * Exit codes:
 *   0 — clean (warnings allowed)
 *   1 — at least one error
 *   2 — bad CLI invocation (missing/invalid arguments)
 *
 * @module scripts/check-compose-v2.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

/**
 * Guard that the next token in argv exists and is not itself a flag.
 * Exits with code 2 if validation fails.
 *
 * @param {string[]} args
 * @param {number} i   - index of the flag token (value expected at i+1)
 * @param {string} flagName
 */
function requireValue(args, i, flagName) {
  if (!args[i + 1] || args[i + 1].startsWith('-')) {
    process.stderr.write(`check-compose-v2: missing value for ${flagName}\n`);
    process.exit(2);
  }
}

let composeFile = null;
let quiet = false;

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--file') {
    requireValue(argv, i, '--file');
    composeFile = argv[++i];
  } else if (a === '--quiet') {
    quiet = true;
  } else if (a === '--help' || a === '-h') {
    process.stdout.write(
      'Usage: check-compose-v2.mjs --file <path> [--quiet]\n\n' +
      'Validate a docker-compose.yml / compose.yaml file against Compose Spec v2+.\n\n' +
      'Options:\n' +
      '  --file <path>  Path to the compose file to validate (REQUIRED)\n' +
      '  --quiet        Suppress per-finding output; print only the summary\n' +
      '  --help         Print this help text\n'
    );
    process.exit(0);
  } else {
    process.stderr.write(`check-compose-v2: unknown flag: ${a}\n`);
    process.exit(2);
  }
}

if (!composeFile) {
  process.stderr.write('check-compose-v2: --file <path> is required\n');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Load js-yaml
// ---------------------------------------------------------------------------

let yaml = null;
try {
  const yamlModule = await import('js-yaml');
  yaml = yamlModule.default ?? yamlModule;
} catch {
  // js-yaml unavailable — will produce an error below
}

// ---------------------------------------------------------------------------
// Finding collectors
// ---------------------------------------------------------------------------

const errors = [];
const warnings = [];

/** @param {string} msg */
function logError(msg) {
  errors.push(msg);
  if (!quiet) process.stdout.write(`ERROR: ${msg}\n`);
}

/** @param {string} msg */
function logWarning(msg) {
  warnings.push(msg);
  if (!quiet) process.stdout.write(`WARNING: ${msg}\n`);
}

// ---------------------------------------------------------------------------
// Read and parse the compose file
// ---------------------------------------------------------------------------

const relPath = path.relative(process.cwd(), composeFile);

let fileText;
try {
  fileText = fs.readFileSync(composeFile, 'utf8');
} catch (err) {
  logError(`${relPath}: cannot read file: ${err.message}`);
  process.stdout.write(`\ncompose: ${errors.length} errors, ${warnings.length} warnings\n`);
  process.exit(1);
}

if (!yaml) {
  logError(`${relPath}: js-yaml is not available — cannot parse compose file`);
  process.stdout.write(`\ncompose: ${errors.length} errors, ${warnings.length} warnings\n`);
  process.exit(1);
}

let doc;
try {
  doc = yaml.load(fileText);
} catch (err) {
  logError(`${relPath}: YAML parse error: ${err.message}`);
  process.stdout.write(`\ncompose: ${errors.length} errors, ${warnings.length} warnings\n`);
  process.exit(1);
}

if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
  logError(`${relPath}: compose file must be a YAML mapping at the top level`);
  process.stdout.write(`\ncompose: ${errors.length} errors, ${warnings.length} warnings\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Check 1: top-level `version:` key (Compose Spec v2+ omits it)
// ---------------------------------------------------------------------------

if ('version' in doc) {
  logError(
    `${relPath}: top-level "version" key found ("${doc.version}") — ` +
    `v3 is deprecated; use Compose Spec v2 format which omits the version key`
  );
}

// ---------------------------------------------------------------------------
// Check 2: `services:` block present and non-empty
// ---------------------------------------------------------------------------

if (!('services' in doc) || doc.services === null || doc.services === undefined) {
  logError(`${relPath}: missing top-level "services" key — at least one service is required`);
} else if (
  typeof doc.services !== 'object' ||
  Array.isArray(doc.services) ||
  Object.keys(doc.services).length === 0
) {
  logError(`${relPath}: "services" block is empty — at least one service must be defined`);
}

// ---------------------------------------------------------------------------
// Check 3: deprecated keys within service definitions
// ---------------------------------------------------------------------------

/** Keys that are deprecated in Compose Spec v2+ */
const DEPRECATED_SERVICE_KEYS = ['links', 'external_links', 'volume_driver'];

if (doc.services && typeof doc.services === 'object' && !Array.isArray(doc.services)) {
  for (const [serviceName, serviceDef] of Object.entries(doc.services)) {
    if (!serviceDef || typeof serviceDef !== 'object') continue;
    for (const depKey of DEPRECATED_SERVICE_KEYS) {
      if (depKey in serviceDef) {
        logError(
          `${relPath}: service "${serviceName}" uses deprecated key "${depKey}" — ` +
          `remove this key; it is not supported in Compose Spec v2`
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Check 4: deprecated root-level keys
// ---------------------------------------------------------------------------

const DEPRECATED_ROOT_KEYS = ['external_links', 'volume_driver'];
for (const depKey of DEPRECATED_ROOT_KEYS) {
  if (depKey in doc) {
    logError(
      `${relPath}: deprecated top-level key "${depKey}" found — ` +
      `remove this key; it is not supported in Compose Spec v2`
    );
  }
}

// Warn about links at root level (unusual but possible in older files)
if ('links' in doc) {
  logError(
    `${relPath}: deprecated top-level key "links" found — ` +
    `remove this key; it is not supported in Compose Spec v2`
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

process.stdout.write(`\ncompose: ${errors.length} errors, ${warnings.length} warnings\n`);

if (errors.length === 0) {
  if (!quiet) process.stdout.write('✅ Compose file is valid.\n');
  process.exit(0);
} else {
  process.exit(1);
}
