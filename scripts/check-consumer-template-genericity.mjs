#!/usr/bin/env node
/**
 * scripts/check-consumer-template-genericity.mjs — Guard linter (CS72 / C72-3).
 *
 * Fails if any consumer-onboarding doc in the defined scope set contains a
 * harness-internal reference. This makes the consumer-template genericity
 * invariant permanent: the exact regression CS64b shipped (harness-internal
 * LRN/CS/anchor refs leaking into consumer-shipped docs) cannot recur silently.
 *
 * Scope set (each resolved to its generic location, relative to --cwd):
 *   - template/composed/INSTRUCTIONS.md               (composed base)
 *   - template/composed/.github/copilot-instructions.md (composed base)
 *   - template/managed/TRACKING.md                    (scrubbed managed)
 *   - template/managed/RETROSPECTIVES.md              (scrubbed managed)
 *   - template/managed/READMEGUIDE.md                 (managed, already clean)
 *
 * Banned references (each is a FAIL outside allowlisted local-block regions):
 *   - a `LEARNINGS.md#lrn-` link
 *   - a bare `\bLRN-\d+\b` token
 *   - a bare `\bCS\d+[a-z]?\b` token
 *   - the literal `henrik-me/agent-harness` slug
 *
 * For composed bases, allowlisted `<!-- harness:local-start id=... -->`
 * regions are EXCLUDED from the scan via the composed marker parser
 * (lib/composed.mjs) — NOT ad-hoc regex slicing. A malformed/unclosed/nested
 * marker is fail-closed: the parse error is surfaced AND the entire raw file
 * is scanned (so a broken marker cannot silently hide a ref).
 *
 * Usage:
 *   node scripts/check-consumer-template-genericity.mjs [--cwd <dir>] [--allow <token>]... [--quiet]
 *
 * Exit codes:
 *   0 — every in-scope doc is generic (no harness-internal references)
 *   1 — at least one banned reference (or a fail-closed parse/read error)
 *   2 — bad CLI usage
 *
 * @module scripts/check-consumer-template-genericity.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseComposed, ComposedParseError } from '../lib/composed.mjs';

const LINTER_NAME = 'check-consumer-template-genericity';

// ---------------------------------------------------------------------------
// Scope set — the consumer-onboarding docs, each at its generic location.
//   kind: 'composed' bases are parsed; content inside allowlisted local-block
//   regions (allowBlocks) is excluded. 'managed' docs are scanned whole.
// ---------------------------------------------------------------------------

const SCOPE_SET = [
  {
    display: 'template/composed/INSTRUCTIONS.md',
    segments: ['template', 'composed', 'INSTRUCTIONS.md'],
    kind: 'composed',
    allowBlocks: ['instructions.harness'],
  },
  {
    display: 'template/composed/.github/copilot-instructions.md',
    segments: ['template', 'composed', '.github', 'copilot-instructions.md'],
    kind: 'composed',
    allowBlocks: ['copilot-instructions.harness'],
  },
  {
    display: 'template/managed/TRACKING.md',
    segments: ['template', 'managed', 'TRACKING.md'],
    kind: 'managed',
  },
  {
    display: 'template/managed/RETROSPECTIVES.md',
    segments: ['template', 'managed', 'RETROSPECTIVES.md'],
    kind: 'managed',
  },
  {
    display: 'template/managed/READMEGUIDE.md',
    segments: ['template', 'managed', 'READMEGUIDE.md'],
    kind: 'managed',
  },
];

// ---------------------------------------------------------------------------
// Banned-reference patterns. Precise + word-boundaried to avoid false
// positives on legitimate generic prose (the word "learnings", "clickstop",
// the placeholders LRN-NNN / CSNN, etc.).
// ---------------------------------------------------------------------------

const PATTERNS = [
  // A LEARNINGS.md#lrn- link (optionally followed by digits). Case-insensitive
  // because markdown anchors lowercase, but the bare-token patterns below stay
  // case-sensitive to avoid matching ordinary words like "learn".
  { name: 'learnings-anchor', re: /LEARNINGS\.md#lrn-\d*/gi },
  // A bare LRN-<digits> token (does NOT match the LRN-NNN / LRN-<NNN> placeholders).
  { name: 'lrn-token', re: /\bLRN-\d+\b/g },
  // A bare CS<digits>[suffix] token (does NOT match the CSNN / CS<NN> placeholders).
  { name: 'cs-token', re: /\bCS\d+[a-z]?\b/g },
  // The literal harness repo slug.
  { name: 'slug', re: /henrik-me\/agent-harness/g },
];

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

let cwd = process.cwd();
let quiet = false;
const allowList = new Set();

const argv = process.argv.slice(2);

function requireValue(args, i, flagName) {
  if (!args[i + 1] || args[i + 1].startsWith('-')) {
    process.stderr.write(`${LINTER_NAME}: missing value for ${flagName}\n`);
    process.exit(2);
  }
  return args[i + 1];
}

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--cwd') {
    cwd = requireValue(argv, i, '--cwd');
    i++;
  } else if (a === '--allow') {
    allowList.add(requireValue(argv, i, '--allow'));
    i++;
  } else if (a === '--quiet') {
    quiet = true;
  } else if (a === '--help' || a === '-h') {
    process.stdout.write(
      'Usage: check-consumer-template-genericity.mjs [--cwd <dir>] [--allow <token>]... [--quiet]\n\n' +
      'Fail if any consumer-onboarding doc in the scope set contains a\n' +
      'harness-internal reference (LRN-NNN / CSNN / LEARNINGS.md#lrn- / the\n' +
      'henrik-me/agent-harness slug). Local-block regions of composed bases are\n' +
      'excluded via the composed marker parser.\n\n' +
      'Options:\n' +
      '  --cwd <dir>     Repo root the scope-set paths resolve against (default: cwd)\n' +
      '  --allow <token> Exempt an exact token from the scan (repeatable)\n' +
      '  --quiet         Suppress success output; errors still go to stderr\n' +
      '  --help          Print this help text\n'
    );
    process.exit(0);
  } else {
    process.stderr.write(`${LINTER_NAME}: unknown flag: ${a}\n`);
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip BOM and normalize CRLF/CR to LF. */
function normalizeLF(content) {
  return content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

const errors = [];

function logError(msg) {
  errors.push(msg);
  process.stderr.write(`ERROR: ${msg}\n`);
}

/**
 * Scan a single line for banned references, recording an error per match
 * (allowlisted exact tokens are skipped).
 */
function scanLine(display, lineNo, line) {
  for (const { re } of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(line)) !== null) {
      const token = m[0];
      if (!allowList.has(token)) {
        logError(`${display}:${lineNo}: ${token}`);
      }
      // Guard against zero-length matches looping forever.
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
}

/** Scan every line of raw content (used for managed docs + fail-closed fallback). */
function scanWhole(display, content) {
  const lines = normalizeLF(content).split('\n');
  for (let i = 0; i < lines.length; i++) {
    scanLine(display, i + 1, lines[i]);
  }
}

/**
 * Scan a composed base, excluding the body of allowlisted local-block regions.
 * Non-allowlisted block bodies ARE scanned. A parse error is fail-closed:
 * surface it and scan the whole raw file so a broken marker hides nothing.
 */
function scanComposed(display, content, allowBlocks) {
  const allowed = new Set(allowBlocks ?? []);
  let parsed;
  try {
    parsed = parseComposed(content, { filename: display });
  } catch (err) {
    if (err instanceof ComposedParseError) {
      logError(`${display}: composed parse error (${err.code}): ${err.message}`);
      // Fail-closed: a malformed/unclosed/nested marker must not hide a ref.
      scanWhole(display, content);
      return;
    }
    throw err;
  }

  for (const section of parsed.sections) {
    if (section.type === 'template') {
      section.lines.forEach((line, idx) => {
        scanLine(display, section.startLine + idx, line);
      });
    } else if (section.type === 'block') {
      // Allowlisted local block — the harness self-host may legitimately keep
      // anchors here, so its body is excluded from the scan.
      if (allowed.has(section.id)) continue;
      // Non-allowlisted block: scan its body (start marker is at startLine).
      section.body.forEach((line, idx) => {
        scanLine(display, section.startLine + 1 + idx, line);
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Main — scan every doc in the scope set
// ---------------------------------------------------------------------------

for (const doc of SCOPE_SET) {
  const absPath = path.join(cwd, ...doc.segments);
  let content;
  try {
    content = fs.readFileSync(absPath, 'utf8');
  } catch (err) {
    // Fail-closed: an in-scope onboarding doc that should exist is missing.
    logError(`${doc.display}: cannot read file (${err.message})`);
    continue;
  }

  if (doc.kind === 'composed') {
    scanComposed(doc.display, content, doc.allowBlocks);
  } else {
    scanWhole(doc.display, content);
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

if (errors.length > 0) {
  process.stderr.write(`\n${LINTER_NAME}: ${errors.length} errors, 0 warnings\n`);
  process.stderr.write('\n\u274c Linter FAILED\n');
  process.exit(1);
} else {
  if (!quiet) {
    process.stdout.write(`\n${LINTER_NAME}: 0 errors, 0 warnings\n`);
    process.stdout.write('\n\u2705 Linter passed\n');
  }
  process.exit(0);
}
