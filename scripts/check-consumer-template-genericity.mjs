#!/usr/bin/env node
/**
 * scripts/check-consumer-template-genericity.mjs — Guard linter (CS72 / C72-3;
 * invocation scan CS83 / C83-5).
 *
 * Runs two orthogonal scans over the consumer-shipped harness docs:
 *
 *   1. ANCHOR scan (CS72) — fails if any onboarding doc in the anchor scope set
 *      contains a harness-internal reference. This makes the consumer-template
 *      genericity invariant permanent: the exact regression CS64b shipped
 *      (harness-internal LRN/CS/anchor refs leaking into consumer-shipped docs)
 *      cannot recur silently.
 *
 *   2. INVOCATION scan (CS83; check-readme ref CS88) — fails if any
 *      process/onboarding doc in the broader invocation scope set contains a
 *      consumer-invalid harness-repo run command (`node bin/harness.mjs …` or
 *      `node scripts/<x>.mjs …`), or a reference to the harness-repo-only README
 *      linter script `check-readme.mjs`. None of those paths exists in a consumer
 *      checkout, so such an invocation fails there with `Cannot find module`
 *      (issues #370, #381). The scans are kept separate because process docs
 *      (e.g. OPERATIONS.md) legitimately carry LRN/CS tokens — so they cannot
 *      join the anchor scan — yet their run commands must still be
 *      consumer-runnable.
 *
 * Anchor scope set (each resolved to its generic location, relative to --cwd):
 *   - template/composed/INSTRUCTIONS.md               (composed base)
 *   - template/composed/.github/copilot-instructions.md (composed base)
 *   - template/managed/TRACKING.md                    (scrubbed managed)
 *   - template/managed/RETROSPECTIVES.md              (scrubbed managed)
 *   - template/managed/READMEGUIDE.md                 (managed, already clean)
 *
 * Invocation scope set — the broader consumer-shipped composed + managed process
 * and onboarding docs (the five anchor docs plus the composed process bases):
 *   - the five anchor-scope docs above
 *   - template/composed/OPERATIONS.md                 (composed base)
 *   - template/composed/REVIEWS.md                    (composed base)
 *   - template/composed/CONVENTIONS.md                (composed base)
 *
 * Banned anchor references (each is a FAIL anywhere in an anchor-scope doc):
 *   - a `LEARNINGS.md#lrn-` link
 *   - a bare `\bLRN-\d+\b` token
 *   - a bare `\bCS\d+[a-z]?\b` token
 *   - the (case-insensitive) `henrik-me/agent-harness` slug
 *
 * Banned invocations (each is a FAIL anywhere in an invocation-scope doc). The
 * two `node …` run-command patterns are anchored on the `node ` run prefix, so a
 * backtick source-ref (e.g. `` `bin/harness.mjs` ``) and the `{{harness_invoke}}`
 * templating placeholder are NOT flagged — only actual run commands are. The
 * third pattern bans any reference to the harness-repo-only README linter script
 * `check-readme.mjs` (the `scripts/check-readme.mjs` path or a bare
 * `check-readme.mjs` name); a consumer has no such script and runs the README
 * linter via `{{harness_invoke}} lint` (issue #381 / CS83 residual):
 *   - `\bnode\s+bin/harness\.mjs\b`
 *   - `\bnode\s+scripts/[\w-]+\.mjs\b`
 *   - `\bcheck-readme\.mjs\b`
 *
 * For composed bases, the ENTIRE base is scanned — including the default body
 * of `<!-- harness:local-start id=... -->` local blocks. That default body is
 * rendered verbatim into a fresh consumer's file on first init (lib/composed.mjs
 * seeds the local-block body from the template default), so it is
 * consumer-shipped and MUST be generic too.
 * lib/composed.mjs `parseComposed` is still used to validate the markers are
 * well-formed: a malformed/unclosed/nested marker is fail-closed — the parse
 * error is surfaced AND the entire raw file is scanned (so a broken marker
 * cannot silently hide a ref).
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
//   kind: 'composed' bases are marker-validated then scanned IN FULL (the
//   default local-block body ships to consumers, so it must be generic too).
//   'managed' docs are scanned whole.
// ---------------------------------------------------------------------------

const SCOPE_SET = [
  {
    display: 'template/composed/INSTRUCTIONS.md',
    segments: ['template', 'composed', 'INSTRUCTIONS.md'],
    kind: 'composed',
  },
  {
    display: 'template/composed/.github/copilot-instructions.md',
    segments: ['template', 'composed', '.github', 'copilot-instructions.md'],
    kind: 'composed',
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
// Invocation scope set — the broader set scanned for consumer-invalid harness
// run commands (C83-5). Superset of SCOPE_SET: the five onboarding docs plus the
// composed process bases OPERATIONS.md / REVIEWS.md / CONVENTIONS.md, which
// legitimately carry LRN/CS tokens (so they stay OUT of the anchor scan) but
// whose run-command examples must still be consumer-runnable. Same
// { display, segments, kind } shape; the invocation scan is a whole-file line
// scan for every kind (see the invocation pass below).
// ---------------------------------------------------------------------------

const INVOCATION_SCOPE_SET = [
  {
    display: 'template/composed/INSTRUCTIONS.md',
    segments: ['template', 'composed', 'INSTRUCTIONS.md'],
    kind: 'composed',
  },
  {
    display: 'template/composed/.github/copilot-instructions.md',
    segments: ['template', 'composed', '.github', 'copilot-instructions.md'],
    kind: 'composed',
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
  {
    display: 'template/composed/OPERATIONS.md',
    segments: ['template', 'composed', 'OPERATIONS.md'],
    kind: 'composed',
  },
  {
    display: 'template/composed/REVIEWS.md',
    segments: ['template', 'composed', 'REVIEWS.md'],
    kind: 'composed',
  },
  {
    display: 'template/composed/CONVENTIONS.md',
    segments: ['template', 'composed', 'CONVENTIONS.md'],
    kind: 'composed',
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
  // The harness repo slug. Case-INSENSITIVE: GitHub repo slugs are
  // case-insensitive, so a case-variant (e.g. Henrik-Me/agent-harness) must
  // not slip the guard (Copilot review #322; matches how the slug is treated
  // elsewhere in the codebase).
  { name: 'slug', re: /henrik-me\/agent-harness/gi },
];

// ---------------------------------------------------------------------------
// Invocation patterns (C83-5; check-readme ref C88-4). The two `node …` run
// patterns are anchored on the `node ` run prefix so they match RUN COMMANDS but
// not prose/backtick source-refs (`` `bin/harness.mjs` ``) or the
// `{{harness_invoke}}` templating placeholder. `node --test …` is not matched
// either (it is neither `node bin/harness.mjs` nor `node scripts/<x>.mjs`). The
// third pattern bans any `check-readme.mjs` reference — the harness-repo-only
// README linter script (the `scripts/check-readme.mjs` path or a bare
// `check-readme.mjs` name); a consumer has no such script and runs the README
// linter via `{{harness_invoke}} lint` (issue #381 / CS83 residual).
// ---------------------------------------------------------------------------

const INVOCATION_PATTERNS = [
  // `node bin/harness.mjs …` — the harness CLI entry point, not shipped to consumers.
  { name: 'harness-bin-invocation', re: /\bnode\s+bin\/harness\.mjs\b/g },
  // `node scripts/<harness-script>.mjs …` — harness-repo-only linters/scripts.
  { name: 'harness-script-invocation', re: /\bnode\s+scripts\/[\w-]+\.mjs\b/g },
  // `check-readme.mjs` — the harness-repo-only README linter script (the
  // `scripts/check-readme.mjs` path or a bare name); a consumer runs the README
  // linter via `{{harness_invoke}} lint`, not a local script (C88-4 / issue #381).
  { name: 'harness-readme-linter-ref', re: /\bcheck-readme\.mjs\b/g },
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
      'Run two orthogonal genericity scans over the consumer-shipped harness docs:\n\n' +
      '  1. Anchor scan — fail if any onboarding doc in the anchor scope set\n' +
      '     contains a harness-internal reference (a bare LRN-<digits> / CS<digits>\n' +
      '     token, a LEARNINGS.md#lrn- anchor, or the case-insensitive\n' +
      '     henrik-me/agent-harness slug).\n' +
      '  2. Invocation scan — fail if any process/onboarding doc in the broader\n' +
      '     invocation scope set (the anchor docs plus OPERATIONS.md, REVIEWS.md\n' +
      '     and CONVENTIONS.md) contains a consumer-invalid harness-repo run\n' +
      '     command (node bin/harness.mjs ... or node scripts/<x>.mjs ...) or a\n' +
      '     reference to the harness-repo-only README linter check-readme.mjs. The\n' +
      '     two node-run patterns are anchored on the "node " prefix, so backtick\n' +
      '     source-refs and the {{harness_invoke}} placeholder are not flagged.\n\n' +
      'Composed bases are scanned in full, including default local-block bodies\n' +
      '(they ship to consumers); the composed marker parser only fail-closes on\n' +
      'malformed markers.\n\n' +
      'Options:\n' +
      '  --cwd <dir>     Repo root the scope-set paths resolve against (default: cwd)\n' +
      '  --allow <token> Exempt an exact token from either scan (repeatable)\n' +
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
 * Scan a single line against the given pattern list, recording an error per
 * match (allowlisted exact tokens are skipped). The `patterns` argument lets the
 * same scanner drive both the anchor and invocation passes.
 */
function scanLine(display, lineNo, line, patterns) {
  for (const { re } of patterns) {
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

/** Scan every line of raw content against `patterns` (used for managed docs, the
 * invocation pass, and the composed fail-closed fallback). */
function scanWhole(display, content, patterns) {
  const lines = normalizeLF(content).split('\n');
  for (let i = 0; i < lines.length; i++) {
    scanLine(display, i + 1, lines[i], patterns);
  }
}

/**
 * Scan a composed base. The ENTIRE base — template regions AND every
 * local-block body — is scanned, because the default block body is rendered
 * verbatim into a fresh consumer file on first init and is therefore
 * consumer-shipped (lib/composed.mjs). parseComposed is used to validate the
 * markers are well-formed; a parse error is fail-closed: surface it and scan
 * the whole raw file so a broken marker hides nothing.
 */
function scanComposed(display, content, patterns) {
  try {
    parseComposed(content, { filename: display });
  } catch (err) {
    if (err instanceof ComposedParseError) {
      logError(`${display}: composed parse error (${err.code}): ${err.message}`);
      // Fail-closed: a malformed/unclosed/nested marker must not hide a ref.
      scanWhole(display, content, patterns);
      return;
    }
    throw err;
  }

  // Markers validated — scan the whole file. Local-block bodies are NOT exempt:
  // their default content ships to consumers and must be generic too.
  scanWhole(display, content, patterns);
}

// ---------------------------------------------------------------------------
// Read helper — fail-closed, and memoized so a doc that appears in BOTH scope
// sets (all five anchor docs are also in the invocation scope) is read, and any
// read error reported, exactly once.
// ---------------------------------------------------------------------------

const fileCache = new Map();

function readInScope(doc) {
  const absPath = path.join(cwd, ...doc.segments);
  if (fileCache.has(absPath)) return fileCache.get(absPath);
  let content;
  try {
    content = fs.readFileSync(absPath, 'utf8');
  } catch (err) {
    // Fail-closed: an in-scope doc that should exist is missing.
    logError(`${doc.display}: cannot read file (${err.message})`);
    content = null;
  }
  fileCache.set(absPath, content);
  return content;
}

// ---------------------------------------------------------------------------
// Anchor pass — harness-internal LRN/CS/slug refs over the anchor scope set.
// Composed bases are marker-validated then scanned in full; managed docs whole.
// ---------------------------------------------------------------------------

for (const doc of SCOPE_SET) {
  const content = readInScope(doc);
  if (content === null) continue;
  if (doc.kind === 'composed') {
    scanComposed(doc.display, content, PATTERNS);
  } else {
    scanWhole(doc.display, content, PATTERNS);
  }
}

// ---------------------------------------------------------------------------
// Invocation pass — consumer-invalid `node bin/harness.mjs` / `node
// scripts/<x>.mjs` run commands over the broader invocation scope set. Composed
// bases ONLY in this set (OPERATIONS.md / REVIEWS.md / CONVENTIONS.md) are
// marker-validated here via scanComposed (fail-closed on a malformed marker);
// the composed bases shared with the anchor scope (INSTRUCTIONS.md /
// copilot-instructions.md) were already marker-validated by the anchor pass, so
// they use a whole-file scan to avoid double-reporting a parse error. Either
// way the whole file — template regions AND default local-block bodies — is
// scanned, so a malformed marker cannot hide an invocation. Managed docs are
// scanned whole.
// ---------------------------------------------------------------------------

const anchorComposedPaths = new Set(
  SCOPE_SET.filter((d) => d.kind === 'composed').map((d) => path.join(cwd, ...d.segments)),
);

for (const doc of INVOCATION_SCOPE_SET) {
  const content = readInScope(doc);
  if (content === null) continue;
  const absPath = path.join(cwd, ...doc.segments);
  if (doc.kind === 'composed' && !anchorComposedPaths.has(absPath)) {
    scanComposed(doc.display, content, INVOCATION_PATTERNS);
  } else {
    scanWhole(doc.display, content, INVOCATION_PATTERNS);
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
