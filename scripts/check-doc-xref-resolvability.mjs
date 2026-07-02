#!/usr/bin/env node
/**
 * scripts/check-doc-xref-resolvability.mjs — Guard linter (CS81 / C81-5, C81-6).
 *
 * Validates that three classes of doc cross-reference actually RESOLVE, closing
 * the gaps that shipped the v0.10.0 dangling refs (#352-F1 + #356):
 *
 *   (a) LRN-token resolvability — every uppercase `LRN-<id>` token in the process
 *       docs `OPERATIONS.md` + `REVIEWS.md` (root copies) must resolve to a
 *       matching `### LRN-<id>` heading in `LEARNINGS.md`. A placeholder token
 *       (`LRN-A`, `LRN-B`) or a dead numeric token (`LRN-999`) → FAIL. This is
 *       the #352-F1 class: `OPERATIONS.md` cited `LRN-A` / `LRN-B` (never
 *       assigned; the real IDs were `LRN-164` / `LRN-165`).
 *
 *   (b) cross-file anchor resolvability — every markdown link `](X.md#anchor)`
 *       in `INSTRUCTIONS.md` (root) whose target doc `X.md` exists as a sibling
 *       repo doc must point at a heading that exists in `X.md` (GitHub anchor
 *       algorithm). A stale anchor → FAIL. This is the #356a class:
 *       `INSTRUCTIONS.md` linked `OPERATIONS.md#sub-agent-report-shape` after the
 *       heading gained a `(mandatory)` suffix.
 *
 *   (c) relative-link deliverability — in the consumer-ONBOARDING doc set only,
 *       every relative-path FILE link `](path)` (not `http(s):`/`mailto:`, not a
 *       pure `#anchor`, not a trailing-slash directory link) must resolve to a
 *       target that ships under the `template/` delivery surface (composed OR
 *       managed OR seeded). A target absent from `template/` → FAIL. This is the
 *       #356b class: `template/managed/READMEGUIDE.md` linked
 *       `docs/adr/000{1,2}-*.md`, which exist at the harness root but ship in no
 *       consumer. Checks (b)/(c) skip fenced code blocks and inline-code spans so
 *       illustrative example links do not false-positive.
 *
 *       The onboarding set deliberately EXCLUDES the composed process-doc bases
 *       (`OPERATIONS.md` / `REVIEWS.md` / `CONVENTIONS.md`): they carry pervasive
 *       relative `docs/adr/*` links pending a separate genericization pass
 *       (C81-1, follow-up R3), so scanning them here would trip the guard on
 *       out-of-scope debt.
 *
 * Self-host only. The `harness lint` runner gates this linter by package name
 * (args/target null unless `package.json` `name` is `@henrik-me/agent-harness`,
 * exactly like `check-consumer-template-genericity`). As defence-in-depth for a
 * direct invocation, the script ALSO self-gates on the same package name and
 * no-ops (exit 0) elsewhere — checks (a)/(b) read consumer-present docs
 * (`OPERATIONS.md` / `INSTRUCTIONS.md` / `LEARNINGS.md`), so running them in a
 * consumer would false-fail on harness-internal LRN tokens. node-builtins only
 * (regex + `fs`/`path`; no js-yaml/ajv), so it can back the dependency-free
 * review-gate clone (LRN-147).
 *
 * Usage:
 *   node scripts/check-doc-xref-resolvability.mjs [--cwd <dir>] [--dir <dir>] [--quiet]
 *
 * Exit codes:
 *   0 — every scanned cross-reference resolves (or not self-host: skipped)
 *   1 — at least one unresolved reference (or a fail-closed read error)
 *   2 — bad CLI usage
 *
 * @module scripts/check-doc-xref-resolvability.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const LINTER_NAME = 'check-doc-xref-resolvability';
const SELF_HOST_PKG = '@henrik-me/agent-harness';

// ---------------------------------------------------------------------------
// Scan targets (all relative to --cwd).
// ---------------------------------------------------------------------------

// (a) process docs whose LRN tokens must resolve to LEARNINGS.md headings.
const CHECK_A_DOCS = ['OPERATIONS.md', 'REVIEWS.md'];
const LEARNINGS_DOC = 'LEARNINGS.md';

// (b) the onboarding doc whose cross-file anchors must resolve.
const CHECK_B_DOC = 'INSTRUCTIONS.md';

// (c) the consumer-onboarding doc set, each at its shipped template location,
//     paired with the directory it renders to in a consumer (so a relative link
//     resolves against the right base). EXCLUDES the process-doc bases.
const CHECK_C_DOCS = [
  { rel: 'template/managed/READMEGUIDE.md', consumerDir: '' },
  { rel: 'template/composed/INSTRUCTIONS.md', consumerDir: '' },
  { rel: 'template/composed/.github/copilot-instructions.md', consumerDir: '.github' },
  { rel: 'template/managed/TRACKING.md', consumerDir: '' },
  { rel: 'template/managed/RETROSPECTIVES.md', consumerDir: '' },
];

// The template delivery surface: a link target ships if it exists under any of
// these class dirs at its consumer-relative path.
const TEMPLATE_CLASSES = ['composed', 'managed', 'seeded'];

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

let cwd = process.cwd();
let quiet = false;

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
  if (a === '--cwd' || a === '--dir') {
    // --dir is accepted as an alias for --cwd (sibling-script convention); the
    // scan set is fixed, so both name the repo root the paths resolve against.
    cwd = requireValue(argv, i, a);
    i++;
  } else if (a === '--quiet') {
    quiet = true;
  } else if (a === '--help' || a === '-h') {
    process.stdout.write(
      'Usage: check-doc-xref-resolvability.mjs [--cwd <dir>] [--dir <dir>] [--quiet]\n\n' +
      'Self-host-only guard. Fail if any of three doc cross-reference classes\n' +
      'dangles:\n' +
      '  (a) an uppercase LRN-<id> token in OPERATIONS.md / REVIEWS.md that has\n' +
      '      no matching "### LRN-<id>" heading in LEARNINGS.md;\n' +
      '  (b) an INSTRUCTIONS.md "](X.md#anchor)" link whose anchor is not a\n' +
      '      heading in the (existing) sibling doc X.md;\n' +
      '  (c) a relative FILE link in a consumer-onboarding doc (READMEGUIDE +\n' +
      '      the CS72 onboarding set) whose target ships under no template/ class.\n' +
      'Checks (b)/(c) skip fenced code blocks and inline-code spans.\n\n' +
      'Options:\n' +
      '  --cwd <dir>   Repo root the scan paths resolve against (default: cwd)\n' +
      '  --dir <dir>   Alias for --cwd\n' +
      '  --quiet       Suppress success output; errors still go to stderr\n' +
      '  --help        Print this help text\n'
    );
    process.exit(0);
  } else {
    process.stderr.write(`${LINTER_NAME}: unknown flag: ${a}\n`);
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// Self-host gate (defence-in-depth; the runner also gates by package name).
// ---------------------------------------------------------------------------

function isSelfHost(root) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    return pkg && pkg.name === SELF_HOST_PKG;
  } catch {
    return false;
  }
}

if (!isSelfHost(cwd)) {
  if (!quiet) {
    process.stdout.write(`${LINTER_NAME}: skipped (not the harness self-host)\n`);
  }
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip BOM and normalize CRLF/CR to LF. */
function normalizeLF(content) {
  return content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Read a file relative to cwd. Returns null only when the file is genuinely
 * ABSENT (ENOENT) — callers treat that as "nothing to validate here". Any OTHER
 * read failure (permission, I/O, ...) must NOT fail open: it is logged as an
 * error so the guard exits non-zero (fail-closed, LRN-033). existsSync/readFile
 * both report false/throw on permission errors too, so we discriminate on
 * `e.code === 'ENOENT'` rather than gating on existence.
 */
function readDoc(relPath) {
  try {
    return normalizeLF(fs.readFileSync(path.join(cwd, relPath), 'utf8'));
  } catch (e) {
    if (e && e.code === 'ENOENT') return null; // genuinely absent — caller decides
    logError(`${relPath}: cannot read file: ${e && e.message}`);
    return null;
  }
}

/**
 * GitHub heading-anchor slug. Mirrors lib/doc-schema.mjs `headingAnchor`
 * (reimplemented here to keep this guard node-builtins-only): lowercase, drop
 * punctuation, underscores + whitespace → hyphen, collapse hyphens, trim.
 */
function headingAnchor(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/_/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Collect the set of GitHub anchors for every ATX heading in a document,
 *  skipping lines inside fenced code blocks so ```markdown examples (which
 *  contain literal `#`/`##` lines, e.g. the CS skeleton) do not pollute the
 *  anchor set and let a stale link falsely resolve. */
function headingAnchorSet(content) {
  const set = new Set();
  let inFence = false;
  for (const line of content.split('\n')) {
    if (/^\s*(?:```|~~~)/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (m) set.add(headingAnchor(m[2].trim()));
  }
  return set;
}

/** Collect the set of `### LRN-<id>` heading ids declared in LEARNINGS.md,
 *  skipping fenced code blocks (an example `### LRN-NNN` inside ``` is not a
 *  real entry and must not make a dead token falsely resolve). */
function learningHeadingIds(content) {
  const set = new Set();
  let inFence = false;
  for (const line of content.split('\n')) {
    if (/^\s*(?:```|~~~)/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = line.match(/^#{1,6}\s+(LRN-[A-Za-z0-9]+)\b/);
    if (m) set.add(m[1]);
  }
  return set;
}

/**
 * Yield `{ lineNo, text }` for every line OUTSIDE a fenced code block, with
 * inline-code spans stripped. Used by checks (b)/(c) so illustrative example
 * links inside ``` fences or `backticks` are not treated as live references.
 * A simple fence toggle on ``` / ~~~ lines suffices for these docs.
 */
function contentLines(content) {
  const out = [];
  let inFence = false;
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(?:```|~~~)/.test(lines[i])) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    out.push({ lineNo: i + 1, text: lines[i].replace(/`[^`]*`/g, '') });
  }
  return out;
}

const errors = [];

function logError(msg) {
  errors.push(msg);
  process.stderr.write(`ERROR: ${msg}\n`);
}

// ---------------------------------------------------------------------------
// Check (a) — LRN-token resolvability in OPERATIONS.md + REVIEWS.md
// ---------------------------------------------------------------------------

// Match an uppercase-prefixed LRN token (case-sensitive, so lowercase anchor
// fragments like `#lrn-007` are not treated as bare tokens).
const LRN_TOKEN_RE = /\bLRN-[A-Za-z0-9]+\b/g;
// A pure `N`-run suffix (`LRN-NNN`, `LRN-N`) is the documentation placeholder
// glyph, not a concrete reference — skip it (matches the codebase convention
// that reserves `LRN-NNN` as "fill in the next id").
const LRN_PLACEHOLDER_RE = /^LRN-N+$/;

function checkLrnTokens() {
  const learnings = readDoc(LEARNINGS_DOC);
  if (learnings === null) {
    logError(`${LEARNINGS_DOC}: cannot read file (required to validate LRN tokens)`);
    return;
  }
  const ids = learningHeadingIds(learnings);

  for (const rel of CHECK_A_DOCS) {
    const content = readDoc(rel);
    if (content === null) continue; // absent process doc: nothing to validate here
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      LRN_TOKEN_RE.lastIndex = 0;
      let m;
      while ((m = LRN_TOKEN_RE.exec(lines[i])) !== null) {
        const token = m[0];
        if (LRN_PLACEHOLDER_RE.test(token)) continue;
        if (!ids.has(token)) {
          logError(
            `${rel}:${i + 1}: LRN token "${token}" does not resolve to a "### ${token}" heading in ${LEARNINGS_DOC}`
          );
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Check (b) — cross-file anchor resolvability in INSTRUCTIONS.md
// ---------------------------------------------------------------------------

// A markdown link whose target is `<sibling>.md#<anchor>` (relative doc + anchor).
const XFILE_ANCHOR_RE = /\]\(([A-Za-z0-9._/-]+\.md)#([^)\s]+)\)/g;

function checkCrossFileAnchors() {
  const content = readDoc(CHECK_B_DOC);
  if (content === null) return; // absent onboarding doc: nothing to validate

  const anchorSetCache = new Map();
  for (const { lineNo, text } of contentLines(content)) {
    XFILE_ANCHOR_RE.lastIndex = 0;
    let m;
    while ((m = XFILE_ANCHOR_RE.exec(text)) !== null) {
      const targetDoc = m[1];
      const anchor = m[2];
      // Only validate anchors into a sibling repo doc that actually exists; a
      // link to a non-existent doc is a different (out-of-scope) class here.
      const targetContent = readDoc(targetDoc);
      if (targetContent === null) continue;
      let anchors = anchorSetCache.get(targetDoc);
      if (!anchors) {
        anchors = headingAnchorSet(targetContent);
        anchorSetCache.set(targetDoc, anchors);
      }
      if (!anchors.has(anchor)) {
        logError(
          `${CHECK_B_DOC}:${lineNo}: cross-file anchor "${targetDoc}#${anchor}" does not resolve to a heading in ${targetDoc}`
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Check (c) — relative-link deliverability for the onboarding doc set
// ---------------------------------------------------------------------------

/** Recursively list files under a directory as `/`-joined paths relative to it. */
function listFilesRel(absDir, relBase, acc) {
  let entries;
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch (e) {
    if (e && e.code === 'ENOENT') return acc; // absent class dir — nothing to add
    logError(`template delivery surface: cannot read directory ${absDir}: ${e && e.message}`);
    return acc;
  }
  for (const e of entries) {
    const abs = path.join(absDir, e.name);
    const rel = relBase ? `${relBase}/${e.name}` : e.name;
    if (e.isDirectory()) listFilesRel(abs, rel, acc);
    else acc.add(rel);
  }
  return acc;
}

/** Build the set of consumer-relative paths delivered under template/. */
function buildShipsSet() {
  const ships = new Set();
  for (const cls of TEMPLATE_CLASSES) {
    listFilesRel(path.join(cwd, 'template', cls), '', ships);
  }
  return ships;
}

// Any markdown link target `](...)`.
const LINK_RE = /\]\(([^)]+)\)/g;

function checkRelativeLinkDeliverability() {
  const ships = buildShipsSet();

  for (const { rel, consumerDir } of CHECK_C_DOCS) {
    const content = readDoc(rel);
    if (content === null) continue; // "if present" — skip an absent onboarding doc

    for (const { lineNo, text } of contentLines(content)) {
      LINK_RE.lastIndex = 0;
      let m;
      while ((m = LINK_RE.exec(text)) !== null) {
        let target = m[1].trim();
        // Skip absolute / external / pure-anchor links.
        if (/^(?:https?:|mailto:|#)/i.test(target)) continue;
        // Drop any link title (`](path "title")`) and trailing anchor.
        target = target.split(/\s+/)[0].split('#')[0];
        if (!target) continue; // was a pure `#anchor`
        if (target.endsWith('/')) continue; // directory link, not a FILE link
        if (/^[.\u2026]+$/.test(target)) continue; // ellipsis / `.` placeholder

        const consumerPath = path.posix.normalize(
          (consumerDir ? `${consumerDir}/` : '') + target
        );
        if (!ships.has(consumerPath)) {
          logError(
            `${rel}:${lineNo}: relative link "${target}" resolves to consumer path "${consumerPath}", which ships under no template/ class`
          );
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

checkLrnTokens();
checkCrossFileAnchors();
checkRelativeLinkDeliverability();

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
