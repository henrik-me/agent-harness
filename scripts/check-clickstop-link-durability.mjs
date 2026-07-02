#!/usr/bin/env node
/**
 * scripts/check-clickstop-link-durability.mjs — Guard linter (CS85 / C85-2, C85-3).
 *
 * Closes the harness-side root cause of #371: a bootstrap-authored consumer doc
 * (sub-invaders `ARCHITECTURE.md`) that hard-linked into a
 * `project/clickstops/active/active_cs16…` path — a TRANSIENT clickstop path that
 * GitHub 404s the moment the clickstop closes out (`git mv active/ → done/`).
 *
 * What it flags (ERROR): a BRANCH-PINNED absolute GitHub blob permalink whose
 * path contains `project/clickstops/active/`. Such a URL resolves only while that
 * CS is active; close-out renames the file into `done/`, so the branch URL rots.
 *
 * What it allows:
 *   - a COMMIT-SHA-pinned permalink into an `active/` path (`blob/<40-hex>/…`) —
 *     the SHA pins the historical tree, so it stays resolvable forever;
 *   - `done/` permalinks, relative links, and prose (none 404 on close-out).
 *
 * Detection rule (see C85-2):
 *   - Match `https?://github.com/<owner>/<repo>/blob/<seg1>/<rest>` where `<rest>`
 *     contains `project/clickstops/active/`. The URL may carry a trailing
 *     `#fragment` / `?query`, and both `<seg1>` and `<rest>` may be slashy.
 *   - `<seg1>` is the FIRST path segment after `blob/` (up to the next `/`). If it
 *     matches `^[0-9a-f]{40}$` (a full commit SHA) → SHA-pinned → ALLOW. Otherwise
 *     → branch-pinned → FLAG. This first-segment heuristic resolves GitHub's
 *     `blob/<ref>/<path>` ambiguity for slashy branch names: `blob/feature/foo/…`
 *     has seg1=`feature` (not 40-hex) → flagged, which is correct.
 *   - Fenced code blocks (``` / ~~~) and inline-code spans (`…`) are SKIPPED so
 *     illustrative example URLs in docs (including the C85-1 doctrine section,
 *     which quotes the bad shape as an inline-code example) do not false-positive.
 *
 * Scan MODE by package.json `name` (the crux — DIFFERENT from CS72/CS81, which
 * `target:null`-skip in consumers). Read `<root>/package.json`:
 *   - `name === '@henrik-me/agent-harness'` → SELF-HOST mode; else → CONSUMER
 *     mode. It RUNS in BOTH modes (never no-ops), since #371's rot lives in
 *     consumer repos. The rule is generic (no harness-internal token reads), so it
 *     does not false-fail in consumers. A malformed/unreadable package.json is
 *     fail-closed (stderr + exit 1, LRN-033); an ABSENT one → consumer mode.
 *
 * File sets (relative to `--cwd`/`--dir`, default cwd):
 *   - SELF-HOST: repo-root `*.md` (top level only) PLUS every `*.md` under
 *     `template/**` (recursive).
 *   - CONSUMER: repo-root `*.md` (top level) PLUS `.github/copilot-instructions.md`
 *     and `.github/pull_request_template.md` when present.
 *   - BOTH EXCLUDE: `project/clickstops/**` (legitimate workflow refs), `.git/**`,
 *     `node_modules/**`; SELF-HOST additionally excludes `tests/fixtures/**`.
 *
 * node-builtins only (regex + `fs`/`path`; no js-yaml/ajv), so it can back the
 * dependency-free review-gate clone (LRN-147). Consumer-root-relative (LRN-050):
 * scanned files resolve against `--cwd`, never `import.meta.url`.
 *
 * Usage:
 *   node scripts/check-clickstop-link-durability.mjs [--cwd <dir>] [--dir <dir>] [--quiet]
 *
 * Exit codes:
 *   0 — no branch-pinned active/ permalink (or nothing to scan)
 *   1 — at least one violation (or a fail-closed read/parse error)
 *   2 — bad CLI usage
 *
 * @module scripts/check-clickstop-link-durability.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LINTER_NAME = 'check-clickstop-link-durability';
const SELF_HOST_PKG = '@henrik-me/agent-harness';

// The transient clickstop segment whose branch-pinned permalinks rot on close-out.
const ACTIVE_PATH = 'project/clickstops/active/';

// An absolute GitHub blob permalink. Groups: (1) seg1 = first ref segment after
// `blob/` (no slash); (2) rest = everything after `blob/<seg1>/` up to the URL
// boundary (MAY contain `/`, so a slashy ref/path and a trailing `#frag`/`?query`
// are captured). Boundary chars (excluded from every class): whitespace and
// `)` `]` `"` `'` `<` `>` backtick `|` — so a markdown link `](url)`, autolink
// `<url>`, table cell `| url |`, or inline-code span terminates the match.
const BLOB_RE =
  /https?:\/\/github\.com\/[^/\s)\]"'<>`|]+\/[^/\s)\]"'<>`|]+\/blob\/([^/\s)\]"'<>`|]+)\/([^\s)\]"'<>`|]*)/g;

// A full 40-hex commit SHA — a permalink pinned on one of these is durable.
const SHA_RE = /^[0-9a-f]{40}$/;

// Directory names pruned from the self-host template walk (and any walk).
const EXCLUDED_DIR_NAMES = new Set(['.git', 'node_modules']);

// ---------------------------------------------------------------------------
// Pure detection core (exported for unit tests)
// ---------------------------------------------------------------------------

/** Strip BOM and normalize CRLF/CR to LF. */
function normalizeLF(content) {
  return content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Yield `{ lineNo, text }` for every line OUTSIDE a fenced code block, with
 * inline-code spans stripped — so example URLs inside ``` fences or `backticks`
 * are not treated as live links. A simple fence toggle on ``` / ~~~ lines
 * suffices for these docs (mirrors check-doc-xref-resolvability.mjs). Inline
 * stripping is delimiter-length-aware (`` `x` ``, ``` ``x`y`` ```, …): a code
 * span opened by a run of N backticks closes on the next run of N backticks
 * (CommonMark), so double-backtick spans wrapping a `` ` ``-bearing URL are
 * also skipped.
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
    // Strip inline-code spans: an opening run of N backticks (captured) closes
    // on the next identical-length run. `.*?` is lazy + line-scoped (no newline
    // in a single line), so this is linear-bounded (no ReDoS).
    out.push({ lineNo: i + 1, text: lines[i].replace(/(`+).*?\1/g, '') });
  }
  return out;
}

/**
 * Scan document text for branch-pinned GitHub permalinks into a transient
 * `project/clickstops/active/` path. Pure function — no I/O, no process state.
 *
 * @param {string} text - raw markdown content.
 * @returns {{ lineNo: number, url: string }[]} one entry per violation.
 */
export function scanTextForViolations(text) {
  const violations = [];
  for (const { lineNo, text: line } of contentLines(normalizeLF(String(text)))) {
    BLOB_RE.lastIndex = 0;
    let m;
    while ((m = BLOB_RE.exec(line)) !== null) {
      const seg1 = m[1];
      const rest = m[2];
      // Guard against a zero-length match looping forever.
      if (m.index === BLOB_RE.lastIndex) BLOB_RE.lastIndex++;
      // Only the PATH portion counts — an `active/` substring in a `?query` or
      // `#fragment` of an otherwise benign blob URL must not trip the guard.
      const restPath = rest.split(/[?#]/, 1)[0];
      if (!restPath.includes(ACTIVE_PATH)) continue; // not an active/ clickstop path
      if (SHA_RE.test(seg1)) continue; // SHA-pinned permalink is durable → allow
      violations.push({ lineNo, url: m[0] });
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Mode detection + file-set collection
// ---------------------------------------------------------------------------

/**
 * Determine the scan MODE from `<root>/package.json`. Fail-closed (LRN-033): a
 * malformed or unreadable (non-ENOENT) package.json throws; an ABSENT one is
 * treated as consumer mode (the harness self-host always ships a package.json).
 *
 * @param {string} root
 * @returns {'self-host'|'consumer'}
 */
function detectMode(root) {
  const pkgPath = path.join(root, 'package.json');
  let raw;
  try {
    raw = fs.readFileSync(pkgPath, 'utf8');
  } catch (e) {
    if (e && e.code === 'ENOENT') return 'consumer'; // absent → consumer mode
    throw new Error(`package.json: cannot read file: ${e && e.message}`);
  }
  let pkg;
  try {
    pkg = JSON.parse(normalizeLF(raw));
  } catch (e) {
    throw new Error(`package.json: malformed JSON: ${e && e.message}`);
  }
  return pkg && pkg.name === SELF_HOST_PKG ? 'self-host' : 'consumer';
}

/** Consumer-relative POSIX display path for an absolute file under `root`. */
function relDisplay(root, abs) {
  return path.relative(root, abs).split(path.sep).join('/');
}

/**
 * True when a consumer-relative POSIX path is outside the scanned surface:
 * `project/clickstops/**`, any `.git`/`node_modules` segment, and (self-host)
 * `tests/fixtures/**`.
 */
function isExcluded(relPosix, mode) {
  const segs = relPosix.split('/');
  if (segs.some((s) => EXCLUDED_DIR_NAMES.has(s))) return true;
  if (relPosix === 'project/clickstops' || relPosix.startsWith('project/clickstops/')) return true;
  if (mode === 'self-host' && (relPosix === 'tests/fixtures' || relPosix.startsWith('tests/fixtures/'))) {
    return true;
  }
  return false;
}

/**
 * Recursively collect `*.md` files under `absDir`, honoring the exclusions.
 * ENOENT on the directory is not an error (an absent `template/` just adds
 * nothing); any OTHER read failure is fail-closed via `errors`.
 */
function walkMd(absDir, root, mode, out, errors) {
  let entries;
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch (e) {
    if (e && e.code === 'ENOENT') return; // absent dir — nothing to add
    errors.push(`${relDisplay(root, absDir)}: cannot read directory: ${e && e.message}`);
    return;
  }
  for (const e of entries) {
    const abs = path.join(absDir, e.name);
    const rel = relDisplay(root, abs);
    if (e.isDirectory()) {
      if (EXCLUDED_DIR_NAMES.has(e.name) || isExcluded(rel, mode)) continue;
      walkMd(abs, root, mode, out, errors);
    } else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
      if (!isExcluded(rel, mode)) out.push(abs);
    }
  }
}

/**
 * Build the mode-appropriate absolute file list rooted at `root`. Read failures
 * accumulate in `errors` (fail-closed) rather than aborting the walk.
 */
function collectFiles(root, mode, errors) {
  const out = [];

  // Repo-root *.md (top level only), in BOTH modes.
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (e) {
    errors.push(`${root}: cannot read directory: ${e && e.message}`);
    return out;
  }
  for (const e of entries) {
    if (e.isFile() && e.name.toLowerCase().endsWith('.md') && !isExcluded(e.name, mode)) {
      out.push(path.join(root, e.name));
    }
  }

  if (mode === 'self-host') {
    // …plus every *.md under template/** (recursive).
    walkMd(path.join(root, 'template'), root, mode, out, errors);
  } else {
    // …plus the two consumer .github onboarding docs, when present.
    for (const relParts of [
      ['.github', 'copilot-instructions.md'],
      ['.github', 'pull_request_template.md'],
    ]) {
      const abs = path.join(root, ...relParts);
      let st;
      try {
        st = fs.statSync(abs);
      } catch (e) {
        if (e && e.code === 'ENOENT') continue; // "when present"
        errors.push(`${relParts.join('/')}: cannot stat file: ${e && e.message}`);
        continue;
      }
      if (st.isFile()) out.push(abs);
    }
  }

  return out;
}

/**
 * Scan a repo tree for branch-pinned active/ clickstop permalinks. Pure w.r.t.
 * process state (no exit / stdout); returns structured results for the CLI and
 * for tests.
 *
 * @param {{ cwd?: string, dir?: string }} [opts] - `dir` overrides `cwd`; both
 *   name the repo root (mode detection + file-set resolution).
 * @returns {{ mode: ('self-host'|'consumer'|null), violations: {file,lineNo,url}[], errors: string[] }}
 */
export function checkTree(opts = {}) {
  const root = path.resolve(opts.dir || opts.cwd || process.cwd());
  const errors = [];
  const violations = [];

  let mode;
  try {
    mode = detectMode(root);
  } catch (e) {
    errors.push(e.message);
    return { mode: null, violations, errors };
  }

  for (const abs of collectFiles(root, mode, errors)) {
    let content;
    try {
      content = fs.readFileSync(abs, 'utf8');
    } catch (e) {
      if (e && e.code === 'ENOENT') continue; // vanished mid-walk — skip
      errors.push(`${relDisplay(root, abs)}: cannot read file: ${e && e.message}`);
      continue;
    }
    const file = relDisplay(root, abs);
    for (const v of scanTextForViolations(content)) {
      violations.push({ file, lineNo: v.lineNo, url: v.url });
    }
  }

  return { mode, violations, errors };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const HELP =
  'Usage: check-clickstop-link-durability.mjs [--cwd <dir>] [--dir <dir>] [--quiet]\n\n' +
  'Fail if a durable doc carries a BRANCH-PINNED GitHub permalink into a transient\n' +
  'project/clickstops/active/ path (these 404 the moment the clickstop closes out\n' +
  'active/ -> done/). A commit-SHA-pinned permalink (blob/<40-hex>/…active/…) is\n' +
  'ALLOWED (the SHA pins the historical tree); done/ permalinks, relative links,\n' +
  'and prose are allowed. Fenced code blocks and inline-code spans are skipped so\n' +
  'illustrative example URLs do not false-positive.\n\n' +
  'The package.json `name` selects the scan set (NOT a consumer no-op): the\n' +
  'harness self-host scans root *.md + template/**/*.md; a consumer scans root\n' +
  '*.md + .github/copilot-instructions.md + .github/pull_request_template.md. Both\n' +
  'exclude project/clickstops/** and .git / node_modules (self-host also excludes\n' +
  'tests/fixtures/**). It RUNS IN BOTH modes.\n\n' +
  'Options:\n' +
  '  --cwd <dir>   Repo root the scan set resolves against (default: cwd)\n' +
  '  --dir <dir>   Alias for --cwd (overrides the scanned root)\n' +
  '  --quiet       Suppress success output; errors still go to stderr\n' +
  '  --help        Print this help text\n';

function requireValue(args, i, flagName) {
  if (!args[i + 1] || args[i + 1].startsWith('-')) {
    process.stderr.write(`${LINTER_NAME}: missing value for ${flagName}\n`);
    process.exit(2);
  }
  return args[i + 1];
}

function main(argv) {
  let cwd = process.cwd();
  let quiet = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--cwd' || a === '--dir') {
      // --dir is an alias for --cwd (sibling-guard convention): both name the
      // repo root the mode detection + scan set resolve against.
      cwd = requireValue(argv, i, a);
      i++;
    } else if (a === '--quiet') {
      quiet = true;
    } else if (a === '--help' || a === '-h') {
      process.stdout.write(HELP);
      process.exit(0);
    } else {
      process.stderr.write(`${LINTER_NAME}: unknown flag: ${a}\n`);
      process.exit(2);
    }
  }

  const { mode, violations, errors } = checkTree({ cwd });

  for (const msg of errors) {
    process.stderr.write(`ERROR: ${msg}\n`);
  }
  for (const v of violations) {
    process.stderr.write(
      `ERROR: ${v.file}:${v.lineNo}: branch-pinned permalink into a transient clickstop ` +
        `active/ path (404s on close-out): ${v.url} — prefer no link, a commit-SHA ` +
        `permalink, or a stable project/clickstops/done/ pointer.\n`
    );
  }

  const problems = errors.length + violations.length;
  if (problems > 0) {
    process.stderr.write(`\n${LINTER_NAME}: ${problems} errors, 0 warnings\n`);
    process.stderr.write('\n\u274c Linter FAILED\n');
    process.exit(1);
  }

  if (!quiet) {
    process.stdout.write(`\n${LINTER_NAME}: 0 errors, 0 warnings (${mode} mode)\n`);
    process.stdout.write('\n\u2705 Linter passed\n');
  }
  process.exit(0);
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main(process.argv.slice(2));
}
