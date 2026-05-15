#!/usr/bin/env node
/**
 * scripts/check-pack.mjs — CS13.
 *
 * Runs `npm pack --dry-run --json` against a package directory and validates:
 *   1. Tarball unpacked-size budget (default 2 MB).
 *   2. Forbidden patterns in the packed file list.
 *   3. Required entries are present in the packed file list.
 *
 * Usage:
 *   node scripts/check-pack.mjs --cwd <path> [--max-size-bytes <N>] [--quiet]
 *
 * Options:
 *   --cwd <path>             Path to the package root (must contain package.json).
 *   --max-size-bytes <N>     Tarball unpacked-size budget in bytes (default 2097152 = 2 MB).
 *   --quiet                  Suppress success stdout; violations and errors still print.
 *
 * Exit codes:
 *   0  pass (no violations)
 *   1  pack output has violations (forbidden patterns / size budget exceeded / required files missing)
 *   2  usage error or could not run npm pack
 *
 * @module scripts/check-pack.mjs
 */

import { spawnSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_SIZE_BYTES = 2097152; // 2 MB

/** Directory/file prefixes that must NOT appear in the packed file list. */
const FORBIDDEN_PREFIXES = ['node_modules/', 'tests/', 'project/', '.github/', '.git/'];

/** Exact paths that must NOT appear in the packed file list. */
const FORBIDDEN_EXACT = ['.harness-lock.json', 'harness.config.json'];

/** Exact paths that MUST appear in the packed file list. */
const REQUIRED_EXACT = ['package.json', 'README.md', 'LICENSE', 'bin/harness.mjs'];

/** Directory prefixes under which at least one packed file must appear. */
const REQUIRED_PREFIXES = ['lib/', 'template/', 'scripts/', 'scaffolds/', 'schemas/'];

const USAGE =
  'Usage: check-pack.mjs --cwd <path> [--max-size-bytes <N>] [--quiet]\n';

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
    process.stderr.write(`check-pack: missing value for ${flagName}\n`);
    process.stderr.write(USAGE);
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

let cwdArg = null;
let maxSizeBytes = DEFAULT_MAX_SIZE_BYTES;
let quiet = false;

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--cwd') {
    requireValue(argv, i, '--cwd');
    cwdArg = argv[++i];
  } else if (a === '--max-size-bytes') {
    requireValue(argv, i, '--max-size-bytes');
    const raw = argv[++i];
    const parsed = parseInt(raw, 10);
    if (!Number.isInteger(parsed) || parsed <= 0 || !/^\d+$/.test(raw)) {
      process.stderr.write(
        `check-pack: --max-size-bytes must be a positive integer, got "${raw}"\n`,
      );
      process.stderr.write(USAGE);
      process.exit(2);
    }
    maxSizeBytes = parsed;
  } else if (a === '--quiet') {
    quiet = true;
  } else {
    process.stderr.write(`check-pack: unknown flag: ${a}\n`);
    process.stderr.write(USAGE);
    process.exit(2);
  }
}

if (!cwdArg) {
  process.stderr.write('check-pack: --cwd <path> is required\n');
  process.stderr.write(USAGE);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Run npm pack --dry-run --json (LRN-029: shell:true for npm on Windows)
// ---------------------------------------------------------------------------

const npmResult = spawnSync('npm', ['pack', '--dry-run', '--json'], {
  shell: true,
  cwd: cwdArg,
  encoding: 'utf8',
});

if (npmResult.error) {
  process.stderr.write(`check-pack: failed to spawn npm: ${npmResult.error.message}\n`);
  process.exit(2);
}

if (npmResult.status !== 0) {
  process.stderr.write(`check-pack: npm pack exited with code ${npmResult.status}\n`);
  if (npmResult.stderr) process.stderr.write(npmResult.stderr);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Parse JSON output (fail-closed per LRN-033)
// Locate the JSON array in stdout to tolerate minor npm warning noise.
// ---------------------------------------------------------------------------

let packData;
try {
  const raw = npmResult.stdout;
  const jsonStart = raw.indexOf('[');
  if (jsonStart === -1) throw new Error('no JSON array found in stdout');
  const parsed = JSON.parse(raw.slice(jsonStart));
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('expected a non-empty JSON array');
  }
  packData = parsed[0];
  if (!packData || !Array.isArray(packData.files)) {
    throw new Error('first element missing "files" array');
  }
} catch (err) {
  process.stderr.write(`check-pack: could not parse npm pack JSON output: ${err.message}\n`);
  const preview = (npmResult.stdout ?? '').slice(0, 500);
  if (preview) process.stderr.write(`stdout (first 500 chars): ${preview}\n`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Check 1 — size budget
// ---------------------------------------------------------------------------

/** @type {string[]} */
const violations = [];

if (packData.unpackedSize > maxSizeBytes) {
  violations.push(
    `size: unpacked size ${packData.unpackedSize} bytes exceeds budget ${maxSizeBytes} bytes`,
  );
}

// ---------------------------------------------------------------------------
// Check 2 — forbidden patterns
// ---------------------------------------------------------------------------

for (const file of packData.files) {
  const p = file.path;
  let matched = null;

  for (const prefix of FORBIDDEN_PREFIXES) {
    if (p.startsWith(prefix)) {
      matched = prefix;
      break;
    }
  }

  if (!matched) {
    for (const exact of FORBIDDEN_EXACT) {
      if (p === exact) {
        matched = exact;
        break;
      }
    }
  }

  if (!matched && p.endsWith('.log')) {
    matched = '*.log';
  }

  if (matched) {
    violations.push(`forbidden: ${p} (matches ${matched})`);
  }
}

// ---------------------------------------------------------------------------
// Check 3 — required entries
// ---------------------------------------------------------------------------

const filePaths = new Set(packData.files.map((f) => f.path));

for (const req of REQUIRED_EXACT) {
  if (!filePaths.has(req)) {
    violations.push(`missing-required: ${req}`);
  }
}

for (const prefix of REQUIRED_PREFIXES) {
  const hasAny = packData.files.some((f) => f.path.startsWith(prefix));
  if (!hasAny) {
    violations.push(`missing-required: (no files under ${prefix})`);
  }
}

// ---------------------------------------------------------------------------
// Output + exit
// ---------------------------------------------------------------------------

for (const v of violations) {
  process.stdout.write(`VIOLATION: ${v}\n`);
}

const summary = `pack: ${packData.unpackedSize} bytes / ${packData.entryCount} entries; ${violations.length} violations`;

if (!quiet || violations.length > 0) {
  process.stdout.write(`${summary}\n`);
}

process.exit(violations.length > 0 ? 1 : 0);
