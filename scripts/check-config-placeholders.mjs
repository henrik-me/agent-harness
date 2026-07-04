#!/usr/bin/env node
/**
 * scripts/check-config-placeholders.mjs — Linter for un-replaced REPLACE_ME
 * placeholder tokens in a consumer's harness.config.json (CS26 Finding #3,
 * Decision C26-3).
 *
 * A fresh `harness init` seeds a harness.config.json whose real identity fields
 * (project.repo, templating.repo_owner, templating.repo_slug, ...) carry the
 * literal token `REPLACE_ME` as a VALUE. A consumer who runs `sync` before
 * substituting those values ships a broken config. This linter catches that.
 *
 * It JSON-parses the target config (fail-closed on malformed input, LRN-033)
 * and walks the parsed value, reporting one error per standalone `\bREPLACE_ME\b`
 * token found in a string VALUE under a non-`_`-prefixed key. Keys beginning
 * with `_` (e.g. the instructional `_comment` meta key, whose text legitimately
 * contains "REPLACE_ME") are skipped entirely — neither the key nor its value is
 * scanned. Scope is the single config file passed via `--file`; the linter never
 * scans template/seeded/… (which legitimately ships placeholders).
 *
 * Usage:
 *   node scripts/check-config-placeholders.mjs [--file <path>] [--quiet]
 *
 * Exit codes:
 *   0 — no un-replaced placeholder tokens
 *   1 — at least one REPLACE_ME token found, or the file is missing/malformed
 *   2 — bad CLI usage (unknown flag, or missing value for --file)
 *
 * @module scripts/check-config-placeholders.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

// The linter's own name — used to prefix findings and label the summary line.
const LINTER_NAME = 'check-config-placeholders';

// Standalone, case-sensitive placeholder token. `\b` word boundaries ensure a
// value like "REPLACE_MEOW" or "NOTREPLACE_ME" does NOT match, while
// "REPLACE_ME/REPLACE_ME" yields two matches.
const TOKEN = 'REPLACE_ME';

// Standalone matcher derived from TOKEN so the constant and the regex cannot
// drift (Copilot review). `String.prototype.match` with a /g regex is stateless
// (it ignores lastIndex), so reusing this module-level regex across scan() calls
// is safe.
const TOKEN_RE = new RegExp(`\\b${TOKEN}\\b`, 'g');

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

let filePath = null;
let quiet = false;

const argv = process.argv.slice(2);

// requireValue guard (LRN-040): every value-taking flag must have a following
// token that exists and does not itself look like a flag; otherwise usage + 2.
function requireValue(args, i, flagName) {
  if (!args[i + 1] || args[i + 1].startsWith('-')) {
    process.stderr.write(`${LINTER_NAME}: missing value for ${flagName}\n`);
    process.exit(2);
  }
  return args[i + 1];
}

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--file') {
    filePath = requireValue(argv, i, '--file');
    i++;
  } else if (a === '--quiet') {
    quiet = true;
  } else if (a === '--help' || a === '-h') {
    process.stdout.write(
      'Usage: check-config-placeholders.mjs [--file <path>] [--quiet]\n\n' +
      'Flag un-replaced REPLACE_ME placeholder tokens in a harness.config.json.\n\n' +
      'Options:\n' +
      '  --file <path>   Path to the harness.config.json to lint\n' +
      '                  (default: <cwd>/harness.config.json)\n' +
      '  --quiet         Suppress per-finding output; print only the summary\n' +
      '  --help          Print this help text\n'
    );
    process.exit(0);
  } else {
    process.stderr.write(`${LINTER_NAME}: unknown flag: ${a}\n`);
    process.exit(2);
  }
}

// Consumer-root-relative default (LRN-050): resolve the target from the --file
// argument, falling back to the config in the consumer's current directory.
if (!filePath) {
  filePath = path.join(process.cwd(), 'harness.config.json');
}

// ---------------------------------------------------------------------------
// Read + parse the target config (fail-closed, LRN-033)
// ---------------------------------------------------------------------------

let rawText;
try {
  rawText = fs.readFileSync(filePath, 'utf8');
} catch (err) {
  // Do NOT gate the read behind existsSync(): it also returns false on
  // permission errors, which would misreport an unreadable-but-present config
  // as "not found" and silently mask EACCES/EPERM. Read directly and
  // discriminate err.code === 'ENOENT' (cf. scripts/check-clickstop.mjs).
  const detail = err.code === 'ENOENT'
    ? `config file not found: "${filePath}"`
    : `cannot read file "${filePath}": ${err.message}`;
  process.stderr.write(`${LINTER_NAME}: ${detail}\n`);
  process.exit(1);
}

let config;
try {
  config = JSON.parse(rawText);
} catch (err) {
  process.stderr.write(`${LINTER_NAME}: malformed JSON in "${filePath}": ${err.message}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Finding collector
// ---------------------------------------------------------------------------

const errors = [];

/**
 * Record an error finding and print it (as an ERROR: line) unless --quiet.
 *
 * @param {string} msg
 */
function logError(msg) {
  errors.push(msg);
  if (!quiet) process.stdout.write(`ERROR: ${msg}\n`);
}

// ---------------------------------------------------------------------------
// Recursive scan
// ---------------------------------------------------------------------------

/**
 * Walk a parsed JSON value, reporting one error per standalone REPLACE_ME token
 * found in a string value. Object keys beginning with `_` (and their values) are
 * skipped so the instructional `_comment` meta key is never scanned. Array
 * elements have no keys and are always walked.
 *
 * @param {unknown} value    The current node.
 * @param {string}  jsonPath Dotted/indexed path to `value` (e.g. project.repo).
 */
function scan(value, jsonPath) {
  if (typeof value === 'string') {
    const matches = value.match(TOKEN_RE);
    if (matches) {
      const where = jsonPath || '<root>';
      for (let n = 0; n < matches.length; n++) {
        logError(
          `${filePath}: ${where} contains unresolved placeholder token ${TOKEN}`
        );
      }
    }
    return;
  }

  if (Array.isArray(value)) {
    for (let idx = 0; idx < value.length; idx++) {
      scan(value[idx], `${jsonPath}[${idx}]`);
    }
    return;
  }

  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      // Skip meta keys (e.g. _comment) entirely — do not scan the value.
      if (key.startsWith('_')) continue;
      scan(child, jsonPath ? `${jsonPath}.${key}` : key);
    }
  }
  // numbers, booleans, null: not string values — nothing to scan.
}

scan(config, '');

// ---------------------------------------------------------------------------
// Summary + final status
// ---------------------------------------------------------------------------

process.stdout.write(`\n${LINTER_NAME}: ${errors.length} errors, 0 warnings\n`);

if (errors.length > 0) {
  process.stdout.write('\n❌ Linter FAILED\n');
  process.exit(1);
} else {
  process.stdout.write('\n✅ Linter passed\n');
  process.exit(0);
}
