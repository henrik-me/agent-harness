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
 *     [--respect-gitignore]              Default ON. When --dir is inside a git repo, use
 *                                         `git ls-files --cached --others --exclude-standard`
 *                                         as the scan list so build artifacts in gitignored
 *                                         directories (e.g. dotnet's bin/ obj/) don't trigger
 *                                         violations. Tracked files are still checked.
 *     [--no-respect-gitignore]           Disable the above; revert to recursive walk for all
 *                                         files matching --include / --exclude.
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
import { spawnSync } from 'node:child_process';

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
  '[--respect-gitignore] [--no-respect-gitignore] ' +
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
// CS30 / D3: gitignore-awareness defaults ON; opt-out via --no-respect-gitignore.
let respectGitignore = true;

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
  } else if (a === '--respect-gitignore') {
    respectGitignore = true;
  } else if (a === '--no-respect-gitignore') {
    respectGitignore = false;
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
      '  --respect-gitignore       Default ON. When --dir is a git repo, use\n' +
      '                            `git ls-files --cached --others --exclude-standard`\n' +
      '                            as scan list (skips files ignored by .gitignore)\n' +
      '  --no-respect-gitignore    Disable gitignore-awareness; use recursive walk\n' +
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
// CS30 / D3: build scan list — gitignore-aware when in a git repo, otherwise
// fall back to the original recursive walk.
//
// `git ls-files --cached --others --exclude-standard` returns:
//   - --cached: tracked files (the linter's primary safety net)
//   - --others: untracked-but-not-ignored files (catches new BOM/CRLF before commit)
//   - --exclude-standard: respects .gitignore + .git/info/exclude + global excludes
//
// We then apply the same --include / --exclude filters to the result list so
// behaviour stays consistent with the recursive-walk path.
//
// Fallback triggers (each emits one informational line on stderr):
//   - --no-respect-gitignore explicitly passed
//   - target dir is not inside a git repo (no .git in any ancestor)
//   - `git` command not found / errored
// ---------------------------------------------------------------------------

/**
 * Walk up from `start` looking for a `.git` directory or file (the latter for git
 * worktrees). Returns true on first hit, false at the filesystem root.
 *
 * @param {string} start
 * @returns {boolean}
 */
function isInsideGitRepo(start) {
  let current = path.resolve(start);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (fs.existsSync(path.join(current, '.git'))) return true;
    const parent = path.dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

/**
 * Run `git ls-files --cached --others --exclude-standard` from `dir` and return
 * the file list as an array of paths relative to `dir`. Returns null on any
 * error so the caller can fall back to a recursive walk.
 *
 * @param {string} cwd
 * @returns {string[] | null}
 */
function gitTrackedAndUntracked(cwd) {
  try {
    const result = spawnSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard'],
      { cwd, encoding: 'utf8' },
    );
    if (result.error) return null;
    if (typeof result.status === 'number' && result.status !== 0) return null;
    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return null;
  }
}

/** @type {Array<{ relPath: string, fullPath: string }>} */
const candidateFiles = [];

const useGitignore = respectGitignore && isInsideGitRepo(dir);
let scanMode = 'walk';

if (useGitignore) {
  const list = gitTrackedAndUntracked(dir);
  if (list) {
    scanMode = 'git';
    for (const rel of list) {
      // git always emits forward slashes; normalise for cross-platform path ops.
      const relPath = rel.split('/').join(path.sep);
      const fullPath = path.join(dir, relPath);
      candidateFiles.push({ relPath, fullPath });
    }
  } else {
    process.stderr.write(
      'check-text-encoding: --respect-gitignore requested but `git ls-files` failed; ' +
      'falling back to recursive walk\n',
    );
  }
}

if (scanMode === 'walk') {
  let entries;
  try {
    entries = fs.readdirSync(dir, { recursive: true, withFileTypes: true });
  } catch (err) {
    process.stderr.write(`check-text-encoding: cannot read directory "${dir}": ${err.message}\n`);
    process.exit(1);
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    // Node 20.12+ uses parentPath; older Node 20 uses path on the Dirent.
    const entryDir = entry.parentPath ?? entry.path;
    const fullPath = path.join(entryDir, entry.name);
    const relPath = path.relative(dir, fullPath);
    candidateFiles.push({ relPath, fullPath });
  }
}

// ---------------------------------------------------------------------------
// Scan files
// ---------------------------------------------------------------------------

/** @type {Array<{ relPath: string, kinds: string[] }>} */
const violations = [];
let filesChecked = 0;
let readErrors = 0;

for (const { relPath, fullPath } of candidateFiles) {
  // Normalise separators for cross-platform substring matching.
  const relPathNorm = relPath.replace(/\\/g, '/');

  const ext = path.extname(fullPath).toLowerCase();
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
  `text-encoding: ${filesChecked} files checked (mode: ${scanMode}), ` +
  `${count} violation${count === 1 ? '' : 's'}` +
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
