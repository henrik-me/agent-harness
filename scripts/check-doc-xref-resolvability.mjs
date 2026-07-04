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
 *       The onboarding set (check (c)) deliberately EXCLUDES the composed
 *       process-doc bases (`OPERATIONS.md` / `REVIEWS.md` / `CONVENTIONS.md`):
 *       their harness-internal sibling + `docs/adr` cross-refs are audited
 *       separately by check (e) below (CS76 / C76-1..C76-8, fulfilling CS81's
 *       deferred R3 follow-up).
 *
 *   (d) archive/stub integrity (CS65 / C65-3, C65-4) — when a sibling
 *       `LEARNINGS-archive.md` exists next to `LEARNINGS.md`, the archival
 *       stub-redirect contract must hold so every `LEARNINGS.md#lrn-nnn` anchor
 *       still resolves. A full entry is a `### LRN-NNN` heading followed (after
 *       blank lines) by a ```yaml fence whose `id:` matches; a STUB is a
 *       `### LRN-NNN` heading NOT so followed. This check enforces:
 *         1/3. every FULL entry in the archive has a matching heading (stub or
 *              full) in `LEARNINGS.md` — no orphan, the anchor is preserved;
 *         2.   every STUB in `LEARNINGS.md` has a matching FULL entry in the
 *              archive — no dead redirect;
 *         4.   no id is a FULL entry (with frontmatter) in BOTH files;
 *         5.   no `open`/`deferred` entry appears in the archive (status-gated
 *              move — only `applied`/`obsolete` may be archived).
 *       (The `### LRN-NNN` header↔frontmatter-`id` match — invariant 6 — is
 *       enforced by check-learnings.mjs, which validates the archive's full
 *       entries against the CS69/LRN-154 rule.) Absent archive → skipped
 *       entirely, so this is a no-op pre-migration and for every consumer.
 *
 *   (e) composed-process-base xref (CS76 / C76-1..C76-8) — the three composed
 *       process-doc BASES (`template/composed/{OPERATIONS,REVIEWS,CONVENTIONS}.md`)
 *       render to BOTH a consumer doc and the harness's OWN repo-root copy, so a
 *       dangling harness-internal ref here ships to every consumer. FAILS on:
 *       (i) a BARE "not-guaranteed sibling" token (`INSTRUCTIONS.md` or
 *       `.github/copilot-instructions.md` — composed files a consumer may not
 *       sync, C76-2) that is neither qualified by the documented phrase
 *       `*(if your consumer syncs it)*` (C76-1) nor listed in the in-script
 *       DESCRIPTIVE_ALLOWLIST of audited descriptive mentions; and (ii) ANY
 *       harness-internal `docs/adr` reference — relative link, inline-code path,
 *       bare `docs/adr/` token, or hardcoded-slug ADR URL (C76-8; no allowlist).
 *       Unlike checks (b)/(c), this check SCANS inline-code spans (the sibling /
 *       `docs/adr` tokens here are ALWAYS backtick-wrapped) but still SKIPS
 *       fenced code blocks so illustrative fenced examples do not false-positive.
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
// (d) the archive tier that holds moved full entries (CS65). Optional sibling
//     of LEARNINGS.md; also a recognized source of LRN-<id> headings for (a).
const LEARNINGS_ARCHIVE_DOC = 'LEARNINGS-archive.md';

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
      '      the CS72 onboarding set) whose target ships under no template/ class;\n' +
      '  (d) archive/stub integrity between LEARNINGS.md and (if present)\n' +
      '      LEARNINGS-archive.md: a stub with no archive entry (dead redirect),\n' +
      '      an archive entry with no stub (orphan anchor), an id full in both\n' +
      '      files, or an open/deferred entry in the archive;\n' +
      '  (e) composed-process-base xref in template/composed/{OPERATIONS,\n' +
      '      REVIEWS,CONVENTIONS}.md: a bare not-guaranteed sibling ref\n' +
      '      (INSTRUCTIONS.md / .github/copilot-instructions.md) that is neither\n' +
      '      qualified "*(if your consumer syncs it)*" nor allowlisted, or any\n' +
      '      harness-internal docs/adr reference.\n' +
      'Checks (b)/(c) skip fenced code blocks and inline-code spans;\n' +
      'check (e) scans inline code but skips fenced blocks.\n\n' +
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

  // CS65 (d): the archive is a recognized LRN-<id> heading source too. With the
  // stub-redirect contract every token already resolves against LEARNINGS.md's
  // stubs, but unioning the archive headings is defense-in-depth so a token
  // resolves even if a stub were ever dropped.
  const archive = readDoc(LEARNINGS_ARCHIVE_DOC);
  if (archive !== null) {
    for (const id of learningHeadingIds(archive)) ids.add(id);
  }

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
      // Read + slug each target doc at most once; cache the anchor set (null =
      // known-absent sibling doc, a different out-of-scope class here).
      let anchors = anchorSetCache.get(targetDoc);
      if (anchors === undefined) {
        const targetContent = readDoc(targetDoc);
        anchors = targetContent === null ? null : headingAnchorSet(targetContent);
        anchorSetCache.set(targetDoc, anchors);
      }
      if (anchors === null) continue;
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
// Check (d) — archive/stub integrity between LEARNINGS.md and the archive
// ---------------------------------------------------------------------------

/**
 * Classify every `### LRN-<id>` heading in a LEARNINGS-family document as a
 * FULL entry or a STUB. A full entry is a heading whose next non-blank line is
 * a ```yaml fence; the fence's `id:` and `status:` are captured (via regex —
 * node-builtins only, no js-yaml, per LRN-147). A stub is a heading not so
 * followed (the archive-redirect shape). Headings inside fenced code blocks are
 * ignored so an illustrative `### LRN-NNN` in an example does not register.
 *
 * @param {string} content - Normalized (LF, no BOM) markdown content.
 * @returns {{ full: Map<string, { status: (string|null), fmId: (string|null), line: number }>, stubs: Set<string> }}
 */
function classifyLrnEntries(content) {
  const lines = content.split('\n');
  const full = new Map();
  const stubs = new Set();
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(?:```|~~~)/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;

    const hm = line.match(/^###\s+LRN-(\d+)\s*$/);
    if (!hm) continue;
    const id = `LRN-${hm[1]}`;

    // Look ahead: skip blank lines to the heading's first content line.
    let k = i + 1;
    while (k < lines.length && /^\s*$/.test(lines[k])) k++;

    if (k < lines.length && /^\s*```yaml\s*$/.test(lines[k])) {
      // FULL entry — read the fenced frontmatter and extract id + status.
      let j = k + 1;
      const yamlLines = [];
      while (j < lines.length && !/^\s*```\s*$/.test(lines[j])) {
        yamlLines.push(lines[j]);
        j++;
      }
      const raw = yamlLines.join('\n');
      const idm = raw.match(/^\s*id\s*:\s*(\S+)/m);
      const sm = raw.match(/^\s*status\s*:\s*(\S+)/m);
      full.set(id, { status: sm ? sm[1] : null, fmId: idm ? idm[1] : null, line: i + 1 });
    } else {
      stubs.add(id);
    }
  }

  return { full, stubs };
}

function checkArchiveStubIntegrity() {
  const archiveRaw = readDoc(LEARNINGS_ARCHIVE_DOC);
  if (archiveRaw === null) return; // absent archive → no-op (pre-migration / consumer)

  const mainRaw = readDoc(LEARNINGS_DOC);
  if (mainRaw === null) {
    logError(`${LEARNINGS_DOC}: cannot read file (required to validate archive/stub integrity)`);
    return;
  }

  const main = classifyLrnEntries(mainRaw);
  const arch = classifyLrnEntries(archiveRaw);

  // Invariant 2 — no dead redirect: every stub in LEARNINGS.md must point at a
  // full entry that actually exists in the archive.
  for (const id of main.stubs) {
    if (!arch.full.has(id)) {
      logError(
        `${LEARNINGS_DOC}: stub "### ${id}" has no matching full entry in ${LEARNINGS_ARCHIVE_DOC} (dead redirect)`
      );
    }
  }

  // Invariant 1/3 — no orphan: every full entry in the archive must have a
  // matching heading (stub OR full) in LEARNINGS.md so its anchor still resolves.
  for (const id of arch.full.keys()) {
    if (!main.stubs.has(id) && !main.full.has(id)) {
      logError(
        `${LEARNINGS_ARCHIVE_DOC}: full entry "### ${id}" has no matching heading in ${LEARNINGS_DOC} (orphan — the ${LEARNINGS_DOC}#${id.toLowerCase()} anchor would not resolve)`
      );
    }
  }

  // Invariant 4 — no id is a FULL entry (with frontmatter) in BOTH files.
  for (const id of arch.full.keys()) {
    if (main.full.has(id)) {
      logError(
        `${id}: appears as a full entry (with frontmatter) in BOTH ${LEARNINGS_DOC} and ${LEARNINGS_ARCHIVE_DOC}`
      );
    }
  }

  // Invariant 5 — status-gated move: only applied/obsolete may be archived.
  for (const [id, meta] of arch.full) {
    if (meta.status === 'open' || meta.status === 'deferred') {
      logError(
        `${LEARNINGS_ARCHIVE_DOC}: entry "### ${id}" has status "${meta.status}" — only applied/obsolete entries may be archived`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Check (e) -- composed process-base cross-ref resolvability (CS76 / C76-1..C76-8)
// ---------------------------------------------------------------------------

// The three composed process-doc BASES (template sources, not rendered roots).
// Each renders to BOTH a consumer doc and the harness's OWN repo-root copy, so a
// dangling harness-internal ref here ships to every consumer.
const CHECK_E_DOCS = [
  'template/composed/OPERATIONS.md',
  'template/composed/REVIEWS.md',
  'template/composed/CONVENTIONS.md',
];

// "Not-guaranteed siblings": composed files a consumer MAY choose not to sync
// (composed.files is consumer-selectable, C76-2). A cross-ref pointing at one as
// a canonical source must be QUALIFIED, else the pointer dangles for a consumer
// who didn't adopt that file. Bare-token boundary (C76-8): match a sibling ONLY
// when it is not part of a longer path -- the negative lookbehind excludes a
// preceding path/word char ([\w./-]), so a path-qualified example such as
// `template/composed/INSTRUCTIONS.md` (REVIEWS.md's nonexistent-path token) and
// any `x/INSTRUCTIONS.md` are NOT flagged, while a bare `INSTRUCTIONS.md` IS.
// Case-sensitive, so a lowercase `copilot-instructions.md` fragment does not
// register as the uppercase `INSTRUCTIONS.md` sibling.
const SIBLING_RES = [
  /(?<![\w./-])INSTRUCTIONS\.md\b/g,
  /(?<![\w/-])\.github\/copilot-instructions\.md\b/g,
];

// The documented qualifier phrase (C76-1). A bare sibling token counts as
// qualified when this phrase FOLLOWS it on the SAME line within QUALIFIER_WINDOW
// chars -- wide enough to span the `[link](target)` and paired-sibling
// (`A` / `B` *(...)*) shapes where the phrase trails both tokens. Accepted
// wording: "*(if your consumer syncs it)*" / "*(if your consumer syncs them)*".
const QUALIFIER_RE = /\*\(if your consumer syncs (?:it|them)\)\*/g;
const QUALIFIER_WINDOW = 80;

// Harness-internal ADR references are banned outright (C76-8, fulfilling CS81 R3):
// every form -- a relative markdown link `](docs/adr/...)`, an inline-code path
// `docs/adr/...`, a bare `docs/adr/` directory token, and a hardcoded
// henrik-me/agent-harness slug URL `https://github.com/.../docs/adr/...` --
// contains this literal substring (matched case-INSENSITIVELY so a future
// `Docs/adr` / `docs/ADR` spelling cannot slip a dangling ADR path past the
// guard). There is deliberately NO allowlist: the composed bases carry the ADR
// rationale as link-free prose (READMEGUIDE precedent from CS81).
const DOCS_ADR_RE = /docs\/adr/i;

// Audited DESCRIPTIVE mentions (C76-1): lines that merely NAME a sibling as data
// (an example doc-set list; the genericity-invariant doc set) rather than cross-
// referencing it as a canonical source. Each entry is a distinctive same-line
// substring + the justification for excusing that line's sibling token(s). Keep
// this list MINIMAL: any NEW unqualified sibling ref on a non-allowlisted line
// must fail. (docs/adr is NEVER allowlisted.)
const DESCRIPTIVE_ALLOWLIST = [
  // OPERATIONS.md, Consumer-template genericity invariant: the doc-set that
  // NAMES the onboarding files as the subject being described (spans two lines):
  'The core onboarding docs shipped to consumers', // -> INSTRUCTIONS.md (list head)
  '`TRACKING.md`, `RETROSPECTIVES.md`',            // -> .github/copilot-instructions.md (list tail)
  // ...and the rendered-repo-root list the linter deliberately does not target:
  'the **rendered repo-root** docs',               // -> INSTRUCTIONS.md
  'which the linter does not target',              // -> .github/copilot-instructions.md
  // REVIEWS.md, the 2.6a / 2.6c F3 rows: an illustrative example list of cited
  // docs; qualifying one item mid-list would misread as doctrine (DECISION:
  // descriptive, not a cross-ref). One key covers BOTH the 2.6a and 2.6c cells
  // (identical example substring):
  'OPERATIONS.md, REVIEWS.md, INSTRUCTIONS.md, README.md, etc.',
  // CONVENTIONS.md, the naming-convention example + the repo-root doc-list row
  // that TEACH file-naming/placement by naming the docs:
  'kebab-case for reference docs under', // -> INSTRUCTIONS.md (naming example)
  'Managed and seeded process docs',     // -> INSTRUCTIONS.md (repo-root doc list)
];

function isAllowlistedDescriptive(line) {
  return DESCRIPTIVE_ALLOWLIST.some(sig => line.includes(sig));
}

function checkComposedProcessBaseXref() {
  for (const rel of CHECK_E_DOCS) {
    const content = readDoc(rel);
    if (content === null) continue; // absent base: nothing to validate here

    const lines = content.split('\n');
    let inFence = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // SKIP fenced code blocks (```/~~~) so illustrative fenced examples do not
      // false-positive -- but DO scan inline-code spans below, since the real
      // sibling / docs/adr tokens here are ALWAYS backtick-wrapped (unlike the
      // CS81 (b)/(c) checks, which strip inline code and would miss every one).
      if (/^\s*(?:```|~~~)/.test(line)) { inFence = !inFence; continue; }
      if (inFence) continue;

      // (ii) harness-internal docs/adr -- banned in every form; no allowlist.
      if (DOCS_ADR_RE.test(line)) {
        logError(
          `${rel}:${i + 1}: harness-internal "docs/adr" reference must be genericized to link-free prose (C76-8): ${line.trim()}`
        );
      }

      // (i) bare not-guaranteed-sibling tokens -- must be qualified, else fail.
      // An audited descriptive mention (line names the file as data, not as a
      // canonical source) is excused via DESCRIPTIVE_ALLOWLIST.
      if (isAllowlistedDescriptive(line)) continue;

      const qualifierIdx = [];
      QUALIFIER_RE.lastIndex = 0;
      let qm;
      while ((qm = QUALIFIER_RE.exec(line)) !== null) qualifierIdx.push(qm.index);

      for (const re of SIBLING_RES) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(line)) !== null) {
          const tokenEnd = m.index + m[0].length;
          const qualified = qualifierIdx.some(
            qi => qi >= tokenEnd && qi - tokenEnd <= QUALIFIER_WINDOW
          );
          if (qualified) continue;
          logError(
            `${rel}:${i + 1}: bare not-guaranteed sibling "${m[0]}" must be qualified with ` +
            `"*(if your consumer syncs it)*" (C76-1) or added to the audited descriptive allowlist: ${line.trim()}`
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
checkArchiveStubIntegrity();
checkComposedProcessBaseXref();

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
