#!/usr/bin/env node
/**
 * scripts/check-pr-body.mjs — Linter for PR body markdown files.
 *
 * Validates a PR body markdown file:
 *  - Required section headings are present (default: Summary, Changes, Testing).
 *  - No placeholder text remains (TODO:, FIXME:, <!-- placeholder -->, XXX:, TBD).
 *  - Optional minimum word count per required section body.
 *
 * Usage:
 *   node scripts/check-pr-body.mjs --file <path> [--required <list>]
 *     [--min-words <N>] [--quiet] [--help]
 *
 * Exit codes:
 *   0 — no errors
 *   1 — at least one error
 *   2 — usage error (missing required args / unknown flag)
 *
 * @module scripts/check-pr-body.mjs
 */

import fs from 'node:fs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Guard that the next argv element is a non-flag value.
 * Exits with code 2 if the value is missing or looks like a flag.
 *
 * @param {string[]} args - The full argv array.
 * @param {number}   i    - Index of the flag whose value follows.
 * @param {string}   flag - Flag name for the error message.
 * @returns {string} The value at args[i + 1].
 */
function requireValue(args, i, flag) {
  const next = args[i + 1];
  if (!next || next.startsWith('-')) {
    process.stderr.write(`check-pr-body: missing value for ${flag}\n`);
    process.exit(2);
  }
  return next;
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const DEFAULT_REQUIRED_SECTIONS = ['Summary', 'Changes', 'Testing'];

let filePath = null;
let requiredSections = null; // null = use default
let minWords = null;         // null = no enforcement
let quiet = false;

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--file') {
    filePath = requireValue(argv, i, '--file');
    i++;
  } else if (a === '--required') {
    const val = requireValue(argv, i, '--required');
    requiredSections = val.split(',').map((s) => s.trim()).filter(Boolean);
    i++;
  } else if (a === '--min-words') {
    const val = requireValue(argv, i, '--min-words');
    minWords = parseInt(val, 10);
    if (isNaN(minWords) || minWords < 1) {
      process.stderr.write(`check-pr-body: --min-words must be a positive integer\n`);
      process.exit(2);
    }
    i++;
  } else if (a === '--quiet') {
    quiet = true;
  } else if (a === '--help' || a === '-h') {
    process.stdout.write(
      'Usage: check-pr-body.mjs --file <path> [--required <name1,name2,...>]\n' +
      '         [--min-words <N>] [--quiet] [--help]\n\n' +
      'Validate a PR body markdown file.\n\n' +
      'Options:\n' +
      '  --file <path>           Path to the PR body markdown file (required)\n' +
      '  --required <list>       Comma-separated required section names\n' +
      '                          (default: Summary,Changes,Testing)\n' +
      '  --min-words <N>         Minimum word count per required section body\n' +
      '  --quiet                 Suppress per-finding output; print only the summary\n' +
      '  --help                  Print this help text\n'
    );
    process.exit(0);
  } else {
    process.stderr.write(`check-pr-body: unknown flag: ${a}\n`);
    process.exit(2);
  }
}

if (!filePath) {
  process.stderr.write(
    'check-pr-body: --file <path> is required\n' +
    'Usage: check-pr-body.mjs --file <path> [--required <list>] [--min-words <N>] [--quiet]\n'
  );
  process.exit(2);
}

const sections = requiredSections ?? DEFAULT_REQUIRED_SECTIONS;

// ---------------------------------------------------------------------------
// Read the target file
// ---------------------------------------------------------------------------

let markdownText;
try {
  markdownText = fs.readFileSync(filePath, 'utf8');
} catch (err) {
  process.stderr.write(`check-pr-body: cannot read file "${filePath}": ${err.message}\n`);
  process.exit(1);
}

// Normalize line endings
const normalized = markdownText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
const lines = normalized.split('\n');

// ---------------------------------------------------------------------------
// Finding collector
// ---------------------------------------------------------------------------

const errors = [];

/**
 * Record an error finding and print it unless --quiet is active.
 *
 * @param {string} msg - Human-readable error description.
 */
function logError(msg) {
  errors.push(msg);
  if (!quiet) process.stdout.write(`ERROR: ${msg}\n`);
}

// ---------------------------------------------------------------------------
// Check 1 — Required section headings (case-insensitive match on heading text)
// ---------------------------------------------------------------------------

/**
 * Extract all H2 headings from the normalized markdown text.
 * Returns a Map from lowercased heading text → original heading text.
 *
 * @returns {Map<string, string>}
 */
function extractH2Headings() {
  const map = new Map();
  for (const line of lines) {
    const m = line.match(/^##\s+(.+)$/);
    if (m) {
      map.set(m[1].trim().toLowerCase(), m[1].trim());
    }
  }
  return map;
}

const h2Headings = extractH2Headings();

for (const section of sections) {
  if (!h2Headings.has(section.toLowerCase())) {
    logError(`Missing required section: "## ${section}"`);
  }
}

// ---------------------------------------------------------------------------
// Check 2 — No placeholder text
// ---------------------------------------------------------------------------

const PLACEHOLDER_PATTERNS = [
  /\bTODO:/i,
  /\bFIXME:/i,
  /<!--\s*placeholder\s*-->/i,
  /\bXXX:/i,
  /\bTBD\b/i,
];

for (let idx = 0; idx < lines.length; idx++) {
  const line = lines[idx];
  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(line)) {
      logError(`Placeholder text found at line ${idx + 1}: ${line.trim()}`);
      break; // one error per line
    }
  }
}

// ---------------------------------------------------------------------------
// Check 3 — Minimum word count per required section (if --min-words set)
// ---------------------------------------------------------------------------

if (minWords !== null) {
  /**
   * Extract the body text of each H2 section as a map from
   * lowercased heading text → body text (lines until next H2 or EOF).
   *
   * @returns {Map<string, string>}
   */
  function extractSectionBodies() {
    const bodies = new Map();
    let currentHeading = null;
    const bodyLines = [];

    for (const line of lines) {
      const m = line.match(/^##\s+(.+)$/);
      if (m) {
        if (currentHeading !== null) {
          bodies.set(currentHeading, bodyLines.join('\n'));
        }
        currentHeading = m[1].trim().toLowerCase();
        bodyLines.length = 0;
      } else if (currentHeading !== null) {
        bodyLines.push(line);
      }
    }
    if (currentHeading !== null) {
      bodies.set(currentHeading, bodyLines.join('\n'));
    }
    return bodies;
  }

  const sectionBodies = extractSectionBodies();

  for (const section of sections) {
    const key = section.toLowerCase();
    const body = sectionBodies.get(key) ?? '';
    const words = body.trim().split(/\s+/).filter(Boolean);
    if (words.length < minWords) {
      logError(
        `Section "## ${section}" has ${words.length} word${words.length !== 1 ? 's' : ''} ` +
        `(minimum: ${minWords})`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

process.stdout.write(`\nPR body: ${errors.length} error${errors.length !== 1 ? 's' : ''}\n`);
if (errors.length > 0) {
  process.stdout.write('❌ Linter FAILED\n');
  process.exit(1);
} else {
  process.stdout.write('✅ Linter passed\n');
  process.exit(0);
}
