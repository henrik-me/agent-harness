#!/usr/bin/env node
/**
 * scripts/check-text-encoding.mjs — CS03c.
 *
 * Detects (a) UTF-8 BOM and (b) CRLF line endings (or bare \r) in text files.
 * Mechanically prevents:
 *   - BOM creep (LRN-006, LRN-018, LRN-065): sub-agent file writes on Windows.
 *   - CRLF creep (LRN-074): git's core.autocrlf=true on Windows breaking
 *     harness sync drift detection.
 *
 * Usage:
 *   node scripts/check-text-encoding.mjs --dir <path>
 *     [--include <ext,...>]              Comma-separated extensions; default standard set.
 *     [--exclude <pattern,...>]          Comma-separated path-prefix patterns to exclude;
 *                                         default node_modules,.git. Each pattern matches if
 *                                         the relative path equals it OR starts with `<pattern>/`.
 *                                         Substring matching is intentionally NOT used (per
 *                                         CS03c plan-vs-impl gate finding) to avoid `.git`
 *                                         false-matching `.github/...`.
 *     [--no-check-bom]                   Skip BOM check.
 *     [--no-check-line-endings]          Skip line-endings check.
 *     [--quiet]                          Suppress success stdout.
 *
 * Exit codes:
 *   0 — no violations.
 *   1 — at least one violation.
 *   2 — usage error.
 *
 * @module scripts/check-text-encoding.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_INCLUDE = new Set([
  '.md', '.mjs', '.js', '.json', '.yml', '.yaml',
  '.sh', '.ps1', '.txt', '.sql', '.html', '.css',
]);
const DEFAULT_EXCLUDE = ['node_modules', '.git'];

const USAGE =
  'Usage: check-text-encoding.mjs --dir <path> ' +
  '[--include <ext,...>] [--exclude <pattern,...>] ' +
  '[--no-check-bom] [--no-check-line-endings] [--quiet]\n';

// ---------------------------------------------------------------------------
// requireValue guard (LRN-040)
// ---------------------------------------------------------------------------

/**
 * Validate that args[i+1] exists and is not a flag token.
 *
 * @param {string[]} args
 * @param {number} i - index of the flag
 * @param {string} flagName
 */
function requireValue(args, i, flagName) {
  if (!args[i + 1] || args[i + 1].startsWith('-')) {
    process.stderr.write(`check-text-encoding: missing value for ${flagName}\n`);
    process.stderr.write(USAGE);
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

let dir = null;
let includeExts = null;
let excludePatterns = null;
let checkBom = true;
let checkLineEndings = true;
let quiet = false;

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--dir') {
    requireValue(argv, i, '--dir');
    dir = argv[++i];
  } else if (a === '--include') {
    requireValue(argv, i, '--include');
    includeExts = new Set(
      argv[++i]
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean),
    );
  } else if (a === '--exclude') {
    requireValue(argv, i, '--exclude');
    excludePatterns = argv[++i]
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
  } else if (a === '--no-check-bom') {
    checkBom = false;
  } else if (a === '--no-check-line-endings') {
    checkLineEndings = false;
  } else if (a === '--quiet') {
    quiet = true;
  } else if (a === '--help' || a === '-h') {
    process.stdout.write(
      'Usage: check-text-encoding.mjs --dir <path> [options]\n\n' +
      'Detect UTF-8 BOM and CRLF/bare-\\r line endings in text files.\n\n' +
      'Options:\n' +
      '  --dir <path>              Directory to scan recursively (REQUIRED)\n' +
      '  --include <ext,...>       Comma-separated extensions to include\n' +
      '                            (default: .md,.mjs,.js,.json,.yml,.yaml,.sh,.ps1,.txt,.sql,.html,.css)\n' +
      '  --exclude <pattern,...>   Comma-separated path-prefix patterns to exclude (default: node_modules,.git)\n' +
      '                            (default: node_modules,.git)\n' +
      '  --no-check-bom            Skip BOM (0xEF 0xBB 0xBF) check\n' +
      '  --no-check-line-endings   Skip CRLF / bare-\\r line endings check\n' +
      '  --quiet                   Suppress success stdout\n' +
      '  --help                    Print this help text\n',
    );
    process.exit(0);
  } else {
    process.stderr.write(`check-text-encoding: unknown flag: ${a}\n`);
    process.stderr.write(USAGE);
    process.exit(2);
  }
}

if (!dir) {
  process.stderr.write('check-text-encoding: --dir <path> is required\n');
  process.stderr.write(USAGE);
  process.exit(2);
}

const effectiveIncludes = includeExts ?? DEFAULT_INCLUDE;
const effectiveExcludes = excludePatterns ?? DEFAULT_EXCLUDE;

// ---------------------------------------------------------------------------
// Walk directory recursively
// ---------------------------------------------------------------------------

let entries;
try {
  entries = fs.readdirSync(dir, { recursive: true, withFileTypes: true });
} catch (err) {
  process.stderr.write(`check-text-encoding: cannot read directory "${dir}": ${err.message}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Scan files
// ---------------------------------------------------------------------------

/** @type {Array<{ relPath: string, kinds: string[] }>} */
const violations = [];
let filesChecked = 0;
let readErrors = 0;

for (const entry of entries) {
  if (!entry.isFile()) continue;

  // Node 20.12+ uses parentPath; older Node 20 uses path on the Dirent.
  const entryDir = entry.parentPath ?? entry.path;
  const fullPath = path.join(entryDir, entry.name);
  const relPath = path.relative(dir, fullPath);

  // Normalise separators for cross-platform substring matching.
  const relPathNorm = relPath.replace(/\\/g, '/');

  const ext = path.extname(entry.name).toLowerCase();
  if (!effectiveIncludes.has(ext)) continue;
  // Exclude matching: treat each pattern as a directory-segment prefix,
  // not a substring. Otherwise `.git` would also match `.github/...` (the
  // exact false-positive caught by the CS03c plan-vs-impl gate).
  // Match if relPathNorm equals the pattern OR begins with `<pattern>/`.
  if (effectiveExcludes.some((p) => relPathNorm === p || relPathNorm.startsWith(p + '/'))) continue;

  filesChecked++;

  let bytes;
  try {
    bytes = fs.readFileSync(fullPath);
  } catch (err) {
    process.stderr.write(`check-text-encoding: cannot read "${relPath}": ${err.message}\n`);
    readErrors++;
    continue;
  }

  const kinds = [];

  if (checkBom && bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    kinds.push('BOM');
  }

  if (checkLineEndings && bytes.indexOf(0x0D) !== -1) {
    kinds.push('CRLF');
  }

  if (kinds.length > 0) {
    violations.push({ relPath: relPathNorm, kinds });
    if (!quiet) {
      process.stdout.write(`VIOLATION: ${relPathNorm}: ${kinds.join(', ')}\n`);
    }
  }
}

// ---------------------------------------------------------------------------
// Summary + exit
// ---------------------------------------------------------------------------

const count = violations.length;
const summary =
  `text-encoding: ${filesChecked} files checked, ${count} violation${count === 1 ? '' : 's'}` +
  (readErrors > 0 ? `, ${readErrors} read error${readErrors === 1 ? '' : 's'}` : '') + '.';

// CS03c R1 (PR #40 review NB): exit 1 on read errors as well as violations.
// Otherwise unreadable files would silently fail open and a clean scan of the
// remaining files could falsely certify the directory.
if (count === 0 && readErrors === 0) {
  if (!quiet) process.stdout.write(`${summary}\n`);
  process.exit(0);
} else {
  process.stdout.write(`\n${summary}\n`);
  process.exit(1);
}
