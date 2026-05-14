#!/usr/bin/env node
/**
 * scripts/check-cs-plan.mjs — CS34 (LRN-105 follow-up).
 *
 * Flags harness-repo-internal path references inside consumer-repo CS plans.
 *
 * Background (LRN-105): when an orchestrator copies a CS plan template from
 * the harness repo into a consumer repo, file paths like `template/composed/`
 * (and the other `template/*` siblings) are correct relative to the harness
 * repo but wrong in the consumer repo (those paths either do not exist or
 * refer to different content). A sub-agent dispatched from such a plan will
 * look for the wrong path, waste a round-trip, and potentially make
 * incorrect edits. This linter catches those stale harness-perspective paths
 * at lint time, before dispatch, so they can be corrected to consumer-repo-
 * relative paths.
 *
 * Default scope (post-issue #183): the prefix list is intentionally narrow —
 * only `template/composed/`, `template/seeded/`, `template/managed/` are
 * unambiguously harness-only. The original CS34 cut also defaulted on `lib/`,
 * `bin/`, `scripts/`, but those collide with universal consumer-repo dir names
 * and produced false positives across typical Node consumer layouts. Repos
 * that DO want the stricter pre-#183 set re-add them via
 * `harness.config.json → cs_plan_lint.forbidden_path_prefixes`.
 *
 * Self-host guard (Decision C34-5): when running inside the harness repo
 * itself (detected via package.json#name === '@henrik-me/agent-harness'), the
 * linter exits 0 immediately with a "skipped (self-host)" note. The harness's
 * own CS plans legitimately reference these paths because the harness IS the
 * harness.
 *
 * Usage:
 *   node scripts/check-cs-plan.mjs --dir <path>
 *     [--config <path>]   Path to harness.config.json for forbidden_path_prefixes overrides.
 *     [--cwd <path>]      Repo root used for self-host detection (default: process.cwd()).
 *     [--quiet]           Suppress success stdout.
 *     [--help | -h]       Print this usage and exit 0.
 *
 * Exit codes:
 *   0 — no violations (or self-host skipped, or no project/clickstops dir).
 *   1 — at least one violation.
 *   2 — usage error or fatal parse failure.
 *
 * @module scripts/check-cs-plan.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Issue #183 (Gap A): defaults shrunk to harness-only template/* prefixes.
// `lib/`, `bin/`, `scripts/` are universal consumer-repo dir names and produced
// false positives across typical consumer layouts. Consumers who DO want the
// stricter set can re-enable via `harness.config.json → cs_plan_lint.forbidden_path_prefixes`.
const DEFAULT_FORBIDDEN_PREFIXES = [
  'template/composed/',
  'template/seeded/',
  'template/managed/',
];

/** GitHub URL prefix for the harness repo — lines containing this are exempt. */
const HARNESS_GITHUB_URL = 'https://github.com/henrik-me/agent-harness/';

const USAGE = `Usage: check-cs-plan --dir <path> [--config <path>] [--cwd <path>] [--quiet]

Scans CS plan files under <path>/{active,done,planned}/*.md and flags
references to harness-repo-internal path prefixes outside fenced code
blocks and outside links to the harness GitHub repo.

Options:
  --dir <path>      Root to scan (required). Pass project/clickstops.
  --config <path>   Path to harness.config.json for forbidden_path_prefixes overrides.
  --cwd <path>      Repo root for self-host detection (default: process.cwd()).
  --quiet           Suppress success stdout.
  --help, -h        Show this message.

Exit codes:
  0  no violations (or self-host skipped, or directory absent)
  1  at least one violation
  2  usage error or fatal parse failure
`;

// ---------------------------------------------------------------------------
// requireValue guard (LRN-040)
// ---------------------------------------------------------------------------

/**
 * Assert that args[i+1] exists and is not a flag token.
 * @param {string[]} args
 * @param {number} i
 * @param {string} flagName
 */
function requireValue(args, i, flagName) {
  if (!args[i + 1] || args[i + 1].startsWith('-')) {
    process.stderr.write(`check-cs-plan: missing value for ${flagName}\n`);
    process.stderr.write(USAGE);
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const result = { dir: null, config: null, cwd: null, quiet: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir') {
      requireValue(argv, i, '--dir');
      result.dir = argv[++i];
    } else if (a === '--config') {
      requireValue(argv, i, '--config');
      result.config = argv[++i];
    } else if (a === '--cwd') {
      requireValue(argv, i, '--cwd');
      result.cwd = argv[++i];
    } else if (a === '--quiet') {
      result.quiet = true;
    } else if (a === '--help' || a === '-h') {
      result.help = true;
    } else {
      process.stderr.write(`check-cs-plan: unknown argument: ${a}\n`);
      process.stderr.write(USAGE);
      process.exit(2);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Self-host detection
// ---------------------------------------------------------------------------

function isSelfHost(cwdArg) {
  const pkgPath = path.join(cwdArg, 'package.json');
  if (!fs.existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg && pkg.name === '@henrik-me/agent-harness';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

function loadForbiddenPrefixes(configPath) {
  if (!configPath || !fs.existsSync(configPath)) return DEFAULT_FORBIDDEN_PREFIXES;
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    process.stderr.write(`check-cs-plan: failed to parse config file ${configPath}: ${e.message}\n`);
    process.exit(1);
  }
  const prefixes = cfg?.cs_plan_lint?.forbidden_path_prefixes;
  if (
    Array.isArray(prefixes) &&
    prefixes.length > 0 &&
    prefixes.every((p) => typeof p === 'string')
  ) {
    return prefixes;
  }
  return DEFAULT_FORBIDDEN_PREFIXES;
}

// ---------------------------------------------------------------------------
// Scanning logic
// ---------------------------------------------------------------------------

/**
 * Collect .md files directly under <dir>/active/, <dir>/done/, <dir>/planned/.
 * One level deep; does not recurse into nested directories.
 */
function collectMdFiles(dir) {
  const subdirs = ['active', 'done', 'planned'];
  const files = [];
  for (const sub of subdirs) {
    const subPath = path.join(dir, sub);
    if (!fs.existsSync(subPath)) continue;
    let entries;
    try {
      entries = fs.readdirSync(subPath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (ent.isFile() && ent.name.endsWith('.md')) {
        files.push(path.join(subPath, ent.name));
      }
    }
  }
  return files;
}

/**
 * Strip backtick-delimited inline code spans from a single line.
 *
 * Issue #183 (Gap B): markdown inline code (`text`, ``text``, ```text```) is
 * the natural way to reference paths in prose; treating only fenced blocks as
 * exempt produced false positives in learning entries and prose discussions
 * that quoted harness-perspective paths.
 *
 * The matcher requires balanced same-count backticks with no embedded
 * backticks in the content (the common case). Unmatched / asymmetric backticks
 * leave the line unchanged so the caller still scans them.
 *
 * @param {string} line
 * @returns {string}
 */
function stripInlineCode(line) {
  return line.replace(/(`+)([^`]+)\1/g, '');
}

/**
 * Scan a single .md file for forbidden-prefix violations.
 * Returns an array of violation message strings.
 */
function scanFile(filePath, forbiddenPrefixes) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    process.stderr.write(`check-cs-plan: could not read ${filePath}: ${e.message}\n`);
    return [];
  }

  const lines = content.split('\n');
  const violations = [];
  let inFencedBlock = false;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const trimmed = line.trim();

    // Toggle fenced-code-block state on lines beginning with ```.
    if (trimmed.startsWith('```')) {
      inFencedBlock = !inFencedBlock;
      continue;
    }

    if (inFencedBlock) continue;

    // Issue #183 Gap B: strip inline-code spans before checking; backtick-quoted
    // path references in prose are an explicit escape hatch, same as fenced blocks.
    const scanLine = stripInlineCode(line);

    // Check each forbidden prefix.
    for (const prefix of forbiddenPrefixes) {
      if (!scanLine.includes(prefix)) continue;
      // Exempt lines that contain a harness GitHub URL (legitimate references).
      if (scanLine.includes(HARNESS_GITHUB_URL)) continue;
      violations.push(
        `VIOLATION: ${filePath}:${lineIdx + 1}: contains harness-repo path "${prefix}" outside a fenced code block (consumer-repo CS plans should use consumer-repo-relative paths; see LRN-105).`,
      );
      // Only report the first matching prefix per line to avoid duplicate lines.
      break;
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  if (!args.dir) {
    process.stderr.write('check-cs-plan: --dir is required\n');
    process.stderr.write(USAGE);
    process.exit(2);
  }

  const cwdArg = args.cwd || process.cwd();

  // Self-host guard (Decision C34-5).
  if (isSelfHost(cwdArg)) {
    if (!args.quiet) {
      process.stdout.write('check-cs-plan: skipped (self-host)\n');
    }
    process.exit(0);
  }

  const dir = path.resolve(args.dir);

  // If the clickstops directory doesn't exist, exit cleanly.
  if (!fs.existsSync(dir)) {
    if (!args.quiet) {
      process.stdout.write('check-cs-plan: 0 files (no project/clickstops directory).\n');
    }
    process.exit(0);
  }

  const forbiddenPrefixes = loadForbiddenPrefixes(args.config);
  const mdFiles = collectMdFiles(dir);

  if (mdFiles.length === 0) {
    if (!args.quiet) {
      process.stdout.write('check-cs-plan: 0 files checked, 0 violations.\n');
    }
    process.exit(0);
  }

  const allViolations = [];
  for (const f of mdFiles) {
    const v = scanFile(f, forbiddenPrefixes);
    allViolations.push(...v);
  }

  if (allViolations.length === 0) {
    if (!args.quiet) {
      process.stdout.write(`check-cs-plan: ${mdFiles.length} files checked, 0 violations.\n`);
    }
    process.exit(0);
  }

  for (const v of allViolations) {
    process.stderr.write(v + '\n');
  }
  process.stderr.write(
    `check-cs-plan: ${mdFiles.length} files checked, ${allViolations.length} violation(s).\n`,
  );
  process.exit(1);
}

main();
