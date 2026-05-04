#!/usr/bin/env node
/**
 * scripts/check-migration-policy.mjs — Migration policy linter.
 *
 * Validates migration files in the consumer's migrations directory against
 * structural and safety rules.  Configured via harness.config.json
 * `linters['check-migration-policy']`.
 *
 * Usage:
 *   node scripts/check-migration-policy.mjs [--cwd <path>] [--config <path>] [--quiet]
 *
 * Exit codes:
 *   0 — all rules pass
 *   1 — at least one rule violation (or harness.config.json is malformed JSON)
 *   2 — usage error (unknown flag, missing flag value)
 *
 * @module scripts/check-migration-policy.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// requireValue guard (LRN-040)
// Exits 2 if args[i+1] is absent or starts with '-'.
// ---------------------------------------------------------------------------

/**
 * @param {string[]} args
 * @param {number}   i
 * @param {string}   flagName
 */
function requireValue(args, i, flagName) {
  if (!args[i + 1] || args[i + 1].startsWith('-')) {
    process.stderr.write(`check-migration-policy: missing value for ${flagName}\n`);
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

let cwdArg = process.cwd();
let configArg = null;
let quiet = false;

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--cwd') {
    requireValue(argv, i, '--cwd');
    cwdArg = path.resolve(argv[++i]);
  } else if (a === '--config') {
    requireValue(argv, i, '--config');
    configArg = argv[++i];
  } else if (a === '--quiet') {
    quiet = true;
  } else if (a === '--help' || a === '-h') {
    process.stdout.write(
      'Usage: check-migration-policy.mjs [--cwd <path>] [--config <path>] [--quiet]\n\n' +
      'Validate migration files against structural and safety policy rules.\n\n' +
      'Options:\n' +
      '  --cwd <path>     Consumer repo root (default: process.cwd())\n' +
      '  --config <path>  Path to harness.config.json (default: <cwd>/harness.config.json)\n' +
      '  --quiet          Suppress stdout report on success; violations are still printed\n' +
      '  --help           Print this help text\n'
    );
    process.exit(0);
  } else {
    process.stderr.write(`check-migration-policy: unknown flag: ${a}\n`);
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// Load harness.config.json (fail-closed per LRN-033)
// ---------------------------------------------------------------------------

// Resolve --config relative to cwdArg so the linter can be invoked from outside
// the consumer root. Absolute paths pass through unchanged.
const configPath = configArg
  ? path.resolve(cwdArg, configArg)
  : path.join(cwdArg, 'harness.config.json');

/** @type {Record<string,unknown>} */
let linterConfig = {};

if (fs.existsSync(configPath)) {
  let raw;
  try {
    raw = fs.readFileSync(configPath, 'utf8');
  } catch (err) {
    process.stdout.write(`ERROR: cannot read "${configPath}": ${err.message}\n`);
    process.exit(1);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    // Fail-closed (LRN-033): malformed JSON is a hard error, not a silent default.
    process.stdout.write(`ERROR: harness.config.json: malformed JSON: ${err.message}\n`);
    process.exit(1);
  }
  const linters = parsed && typeof parsed === 'object' ? parsed['linters'] : undefined;
  if (linters && typeof linters === 'object' && !Array.isArray(linters)) {
    const entry = linters['check-migration-policy'];
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      linterConfig = entry;
    }
  }
}

// ---------------------------------------------------------------------------
// Resolve configuration with defaults
// ---------------------------------------------------------------------------

const migrationsDir = path.resolve(
  cwdArg,
  typeof linterConfig['dir'] === 'string' ? linterConfig['dir'] : 'migrations'
);

const strictNaming =
  linterConfig['strict_naming'] === false ? false : true;

const enforceSafeUp =
  linterConfig['enforce_safe_up'] === false ? false : true;

/** @type {string[]} */
const unsafeUpPatterns =
  Array.isArray(linterConfig['unsafe_up_patterns'])
    ? /** @type {string[]} */ (linterConfig['unsafe_up_patterns'])
    : ['DROP TABLE', 'TRUNCATE'];

// ---------------------------------------------------------------------------
// Finding collectors (stdout per LRN-044)
// ---------------------------------------------------------------------------

/** @type {string[]} */
const violations = [];

/**
 * Record a violation and print it to stdout (always, not suppressed by --quiet).
 * @param {string} msg
 */
function addViolation(msg) {
  violations.push(msg);
  process.stdout.write(`VIOLATION: ${msg}\n`);
}

// ---------------------------------------------------------------------------
// Read migrations directory
// ---------------------------------------------------------------------------

let entries;
try {
  entries = fs.readdirSync(migrationsDir);
} catch (err) {
  process.stdout.write(`ERROR: cannot read migrations directory "${migrationsDir}": ${err.message}\n`);
  process.exit(1);
}

// Only consider .sql files for all checks.
const sqlFiles = entries.filter((e) => e.endsWith('.sql'));

// ---------------------------------------------------------------------------
// Rule 2: canonical-naming
// Every .sql file must match ^\d{4}_[a-z0-9-]+\.(up|down)\.sql$
// ---------------------------------------------------------------------------

const CANONICAL_RE = /^\d{4}_[a-z0-9-]+\.(up|down)\.sql$/;

if (strictNaming) {
  for (const f of sqlFiles) {
    if (!CANONICAL_RE.test(f)) {
      addViolation(
        `canonical-naming: "${f}" does not match \\d{4}_[a-z0-9-]+.(up|down).sql`
      );
    }
  }
}

// From here on only work with canonically-named files (avoids double-errors on bad names).
const canonicalFiles = strictNaming
  ? sqlFiles.filter((f) => CANONICAL_RE.test(f))
  : sqlFiles.filter((f) => CANONICAL_RE.test(f)); // always parse canonical shape

// ---------------------------------------------------------------------------
// Build stem → { up, down } index. The "stem" is the full filename minus the
// `.up.sql` / `.down.sql` suffix (e.g. "0001_create-users-table"). Pairing on
// the full stem (not just the 4-digit prefix) is required so that mismatched
// names like "0001_create-users.up.sql" + "0001_drop-posts.down.sql" are
// caught as unpaired (per CS10 R1 review).
// ---------------------------------------------------------------------------

/**
 * @typedef {{ up: string|null; down: string|null }} StemEntry
 * @type {Map<string, StemEntry>}
 */
const stemMap = new Map();

for (const f of canonicalFiles) {
  const m = /^(\d{4}_[a-z0-9-]+)\.(up|down)\.sql$/.exec(f);
  if (!m) continue;
  const stem = m[1];
  const dir = /** @type {'up'|'down'} */ (m[2]);
  if (!stemMap.has(stem)) stemMap.set(stem, { up: null, down: null });
  const entry = /** @type {StemEntry} */ (stemMap.get(stem));
  if (entry[dir] !== null) {
    // Will be caught by duplicate-stem check below.
    continue;
  }
  entry[dir] = f;
}

// ---------------------------------------------------------------------------
// Rule 3: no-duplicate-prefix
// No two files may share the same four-digit numeric prefix of the same
// direction. (Two files with the same numeric prefix but different stems are
// also caught here — a single sequence number must map to a single migration.)
// ---------------------------------------------------------------------------

/** @type {Map<string, string[]>} */
const prefixDirIndex = new Map();

for (const f of canonicalFiles) {
  const m = /^(\d{4})_[a-z0-9-]+\.(up|down)\.sql$/.exec(f);
  if (!m) continue;
  const numericPrefix = m[1];
  const dirSuffix = f.endsWith('.up.sql') ? '.up' : '.down';
  const bucketKey = numericPrefix + dirSuffix;
  if (!prefixDirIndex.has(bucketKey)) prefixDirIndex.set(bucketKey, []);
  /** @type {string[]} */ (prefixDirIndex.get(bucketKey)).push(f);
}

for (const [bucketKey, files] of prefixDirIndex) {
  if (files.length > 1) {
    addViolation(
      `no-duplicate-prefix: prefix "${bucketKey}" used by multiple files: ${files.join(', ')}`
    );
  }
}

// ---------------------------------------------------------------------------
// Rule 1: paired-up-down
// Every up file must have a matching down file (same full stem) and vice versa.
// ---------------------------------------------------------------------------

for (const [stem, entry] of stemMap) {
  if (entry.up !== null && entry.down === null) {
    addViolation(
      `paired-up-down: "${entry.up}" has no matching "${stem}.down.sql" file`
    );
  }
  if (entry.down !== null && entry.up === null) {
    addViolation(
      `paired-up-down: "${entry.down}" has no matching "${stem}.up.sql" file`
    );
  }
}

// ---------------------------------------------------------------------------
// Rule 4: safe-up
// *.up.sql files must not contain unsafe SQL tokens (configurable).
// ---------------------------------------------------------------------------

if (enforceSafeUp) {
  for (const [, entry] of stemMap) {
    if (entry.up === null) continue;
    const filePath = path.join(migrationsDir, entry.up);
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      process.stdout.write(`ERROR: cannot read "${filePath}": ${err.message}\n`);
      process.exit(1);
    }
    const upper = content.toUpperCase();
    for (const token of unsafeUpPatterns) {
      if (upper.includes(token.toUpperCase())) {
        addViolation(
          `safe-up: "${entry.up}" contains unsafe token "${token}" in an up-migration`
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Summary (stdout per LRN-044)
// ---------------------------------------------------------------------------

const pass = violations.length === 0;

if (pass) {
  if (!quiet) {
    process.stdout.write(
      `check-migration-policy: ${canonicalFiles.length} file${canonicalFiles.length === 1 ? '' : 's'} checked, 0 violations\n`
    );
  }
  process.exit(0);
} else {
  process.stdout.write(
    `\ncheck-migration-policy: ${violations.length} violation${violations.length === 1 ? '' : 's'} found\n`
  );
  process.exit(1);
}
