#!/usr/bin/env node
/**
 * scripts/check-composed-blocks.mjs — Linter for composed-class markdown files.
 *
 * Validates a composed-class file by checking:
 *   - Required block IDs are present (via --allowed-ids).
 *   - No duplicate block IDs.
 *   - Every start marker has a matching end marker (balanced).
 *   - No markers appear unescaped inside code fences.
 *   - Lock file does not reference orphan IDs absent from the file (via --lock).
 *
 * Usage:
 *   node scripts/check-composed-blocks.mjs --file <path> [--allowed-ids <comma-list>]
 *                                           [--lock <path>] [--quiet] [--help]
 *
 * Exit codes:
 *   0 — file is valid
 *   1 — at least one error found
 *   2 — bad CLI usage (missing required flag or unknown flag)
 *
 * @module scripts/check-composed-blocks.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

let filePath = null;
/** @type {string[]|null} null = no constraint; array = allowlist + required */
let allowedIds = null;
let lockPath = null;
let quiet = false;

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--file') {
    if (!argv[i + 1] || argv[i + 1].startsWith('-')) {
      process.stderr.write('check-composed-blocks: missing value for --file\n');
      process.exit(2);
    }
    filePath = argv[++i];
  } else if (a === '--allowed-ids') {
    // Distinguish "no value provided" (undefined) from "explicit empty" (''
    // or argv[++i] = '' after split). Empty string is a valid value: it means
    // the file's allowlist is explicitly empty (no local blocks permitted).
    // Per LRN-009 / CS02b: a composed file without a composed.overrides[file]
    // entry must have an empty allowlist enforced (not "no constraint").
    if (argv[i + 1] === undefined || argv[i + 1].startsWith('-')) {
      process.stderr.write('check-composed-blocks: missing value for --allowed-ids\n');
      process.exit(2);
    }
    allowedIds = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
  } else if (a === '--lock') {
    if (!argv[i + 1] || argv[i + 1].startsWith('-')) {
      process.stderr.write('check-composed-blocks: missing value for --lock\n');
      process.exit(2);
    }
    lockPath = argv[++i];
  } else if (a === '--quiet') {
    quiet = true;
  } else if (a === '--help' || a === '-h') {
    process.stdout.write(
      'Usage: check-composed-blocks.mjs --file <path> [--allowed-ids <ids>]\n' +
      '                                  [--lock <path>] [--quiet]\n\n' +
      'Validate a composed-class markdown file.\n\n' +
      'Options:\n' +
      '  --file <path>        Path to the composed markdown file to lint (REQUIRED)\n' +
      '  --allowed-ids <ids>  Comma-separated allowed block IDs (required + allowlist)\n' +
      '  --lock <path>        Path to a lock JSON; orphan IDs in lock → ERROR\n' +
      '  --quiet              Suppress per-finding output; print only the summary\n' +
      '  --help               Print this help text\n'
    );
    process.exit(0);
  } else {
    process.stderr.write(`check-composed-blocks: unknown flag: ${a}\n`);
    process.exit(2);
  }
}

if (!filePath) {
  process.stderr.write('check-composed-blocks: --file <path> is required\n');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Read and normalize the target file
// ---------------------------------------------------------------------------

let content;
try {
  content = fs.readFileSync(filePath, 'utf8');
} catch (err) {
  process.stderr.write(`check-composed-blocks: cannot read file "${filePath}": ${err.message}\n`);
  process.exit(1);
}

// Strip UTF-8 BOM and normalize line endings (LRN-018, LRN-006)
content = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
const lines = content.split('\n');

// ---------------------------------------------------------------------------
// Marker patterns (mirrors lib/composed.mjs constants)
// ---------------------------------------------------------------------------

// Matches a whole-line (stripped) start or end marker.
const MARKER_EXACT_RE = /^<!--\s+harness:local-(start|end)\s+id=([^\s>]+)\s+-->$/;
// Substring that identifies an unescaped marker.
const MARKER_CONTAINS = '<!-- harness:local-';
// Escape prefix: zero-width space (U+200B) between '<' and '!'.
const ESCAPE_ZWSP_PREFIX = '<\u200B!--';
// Escape prefix: HTML entity form.
const ESCAPE_ENTITY_PREFIX = '&lt;!--';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return fence info if `line` opens or closes a fenced code block, else null.
 *
 * @param {string} line
 * @returns {{ char: string, len: number }|null}
 */
function getFenceInfo(line) {
  const m = /^( {0,3})(`{3,}|~{3,})/.exec(line);
  if (!m) return null;
  return { char: m[2][0], len: m[2].length };
}

/**
 * Return true if every `<!-- harness:local-` substring in `line` is escaped
 * (preceded by U+200B or replaced with `&lt;!--`).
 *
 * @param {string} line
 * @returns {boolean}
 */
function lineIsEscapedOrClean(line) {
  let check = line;
  if (line.includes(ESCAPE_ZWSP_PREFIX)) check = check.replace(/<\u200B!--/g, '');
  if (line.includes(ESCAPE_ENTITY_PREFIX)) check = check.replace(/&lt;!--/g, '');
  return !check.includes(MARKER_CONTAINS);
}

// ---------------------------------------------------------------------------
// Finding collector
// ---------------------------------------------------------------------------

const errors = [];

/**
 * Record an error and print it unless --quiet.
 *
 * @param {string} msg
 */
function logError(msg) {
  errors.push(msg);
  if (!quiet) process.stdout.write(`ERROR: ${msg}\n`);
}

// ---------------------------------------------------------------------------
// Parse the file — track fences and collect markers
// ---------------------------------------------------------------------------

/** @type {Array<{ id: string, lineNum: number }>} */
const startMarkers = [];
/** @type {Array<{ id: string, lineNum: number }>} */
const endMarkers = [];

let inFence = false;
let fenceChar = null;
let fenceLen = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const lineNum = i + 1;

  // Update fence state first.
  const fi = getFenceInfo(line);
  if (fi) {
    if (!inFence) {
      inFence = true;
      fenceChar = fi.char;
      fenceLen = fi.len;
      continue;
    } else if (fi.char === fenceChar && fi.len >= fenceLen) {
      inFence = false;
      fenceChar = null;
      fenceLen = 0;
      continue;
    }
  }

  // Quick skip: line has no marker-related content at all.
  if (
    !line.includes(MARKER_CONTAINS) &&
    !line.includes(ESCAPE_ZWSP_PREFIX) &&
    !line.includes(ESCAPE_ENTITY_PREFIX)
  ) {
    continue;
  }

  // If all marker-like content on this line is escaped, skip cleanly.
  if (lineIsEscapedOrClean(line)) {
    continue;
  }

  // Unescaped marker-like content found.
  if (inFence) {
    logError(`line ${lineNum}: marker inside code fence: ${line.trim()}`);
    continue;
  }

  // Parse as a whole-line marker.
  const stripped = line.replace(/^[ \t]+|[ \t]+$/g, '');
  const m = MARKER_EXACT_RE.exec(stripped);
  if (m) {
    const type = m[1];
    const id = m[2];
    if (type === 'start') {
      startMarkers.push({ id, lineNum });
    } else {
      endMarkers.push({ id, lineNum });
    }
  }
}

// ---------------------------------------------------------------------------
// Check 1 — Duplicate start IDs
// ---------------------------------------------------------------------------

/** @type {Map<string, number[]>} id → line numbers */
const startIdLines = new Map();
for (const { id, lineNum } of startMarkers) {
  if (!startIdLines.has(id)) startIdLines.set(id, []);
  startIdLines.get(id).push(lineNum);
}

for (const [id, lnums] of startIdLines) {
  if (lnums.length > 1) {
    logError(`duplicate block id="${id}" appears at lines ${lnums.join(', ')}`);
  }
}

// ---------------------------------------------------------------------------
// Check 2 — Balanced markers (every start has a matching end and vice-versa)
// ---------------------------------------------------------------------------

const startIdSet = new Set(startMarkers.map((x) => x.id));
const endIdSet = new Set(endMarkers.map((x) => x.id));

for (const { id, lineNum } of startMarkers) {
  if (!endIdSet.has(id)) {
    logError(`unmatched start marker id="${id}" at line ${lineNum} (no matching end)`);
  }
}

for (const { id, lineNum } of endMarkers) {
  if (!startIdSet.has(id)) {
    logError(`orphan end marker id="${id}" at line ${lineNum} (no matching start)`);
  }
}

// ---------------------------------------------------------------------------
// Check 3 — Allowed IDs (allowlist + required-IDs check)
// ---------------------------------------------------------------------------

// Set of all unique block IDs defined by start markers in this file.
const definedIds = new Set(startMarkers.map((x) => x.id));

if (allowedIds !== null) {
  const allowedSet = new Set(allowedIds);

  // Every ID in the allowlist is required.
  for (const id of allowedIds) {
    if (!definedIds.has(id)) {
      logError(`required block id="${id}" is missing from the file`);
    }
  }

  // No IDs outside the allowlist are permitted.
  for (const id of definedIds) {
    if (!allowedSet.has(id)) {
      logError(`block id="${id}" is not in the allowed IDs list`);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 4 — Lock file orphan detection
// ---------------------------------------------------------------------------

if (lockPath) {
  let lockContent;
  try {
    lockContent = fs.readFileSync(lockPath, 'utf8');
  } catch (err) {
    process.stderr.write(
      `check-composed-blocks: cannot read lock file "${lockPath}": ${err.message}\n`
    );
    process.exit(1);
  }

  let lock;
  try {
    lock = JSON.parse(lockContent);
  } catch (err) {
    process.stderr.write(
      `check-composed-blocks: cannot parse lock file "${lockPath}": ${err.message}\n`
    );
    process.exit(1);
  }

  // Schema-correct lock format (per schemas/harness-lock.schema.json):
  //   lock.files[] = { target, class, blocks?: [{id, hash, ...}] }
  // We collect block IDs from the entry whose `target` matches the linted file.
  // Match is by basename (relative paths in lock.files[].target may not match the
  // user-supplied --file absolute path). Falls back to the legacy `composed_blocks`
  // array shape if present (some test fixtures use that simpler form).
  const lockIds = [];
  const fileBase = path.basename(filePath);
  if (Array.isArray(lock.files)) {
    for (const entry of lock.files) {
      if (!entry || entry.class !== 'composed') continue;
      const target = typeof entry.target === 'string' ? entry.target : '';
      if (path.basename(target) !== fileBase) continue;
      if (Array.isArray(entry.blocks)) {
        for (const b of entry.blocks) {
          if (typeof b === 'string') lockIds.push(b);
          else if (b && typeof b.id === 'string') lockIds.push(b.id);
        }
      }
    }
  }
  // Legacy / simple-fixture shape: { composed_blocks: ["id1", ...] }
  if (Array.isArray(lock.composed_blocks)) {
    for (const entry of lock.composed_blocks) {
      if (typeof entry === 'string') lockIds.push(entry);
      else if (entry && typeof entry.id === 'string') lockIds.push(entry.id);
    }
  }

  for (const id of lockIds) {
    if (!definedIds.has(id)) {
      logError(`lock file has orphan block id="${id}" not found in the file`);
    }
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const fileName = path.basename(filePath);
process.stdout.write(`\n${fileName}: ${errors.length} error${errors.length !== 1 ? 's' : ''}\n`);

if (errors.length > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
