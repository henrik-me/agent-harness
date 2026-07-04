#!/usr/bin/env node
/**
 * scripts/check-clickstop.mjs — Clickstop document linter.
 *
 * Checks all .md files (direct children) under:
 *   <dir>/active/
 *   <dir>/done/
 *   <dir>/planned/
 *
 * Validates per file:
 *   - Filename convention: active_csNN_*.md / done_csNN_*.md / planned_csNN_*.md
 *   - Required header fields: Status, Owner, Branch, Started, Closed, Depends on
 *   - Lifecycle status invariant: directory name matches **Status:** value
 *
 * NOTE (CS35b): the planning-phase counterpart of the close-out
 * `## Plan-vs-implementation review` gate enforced here lives in
 * `scripts/check-clickstop-plan-review.mjs`. That script enforces the
 * `## Plan review` attestation section on planned/*.md and active/*.md
 * files; this script remains responsible for the close-out gate and the
 * core lifecycle invariants.
 *
 * Usage:
 *   node scripts/check-clickstop.mjs --dir <path> [--quiet] [--help]
 *
 * Exit codes:
 *   0 — all files valid
 *   1 — at least one validation error
 *   2 — bad usage (missing required --dir flag)
 *
 * @module scripts/check-clickstop.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { assertHeadings, extractSectionBody, headingAnchor } from '../lib/doc-schema.mjs';
import { matchesDistributedSurface, extractDeliverablePathTokens } from '../lib/distributed-surface-globs.mjs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Fields whose `**FieldName:**` marker must appear in the file body. */
const REQUIRED_FIELDS = ['Status', 'Owner', 'Branch', 'Started', 'Closed', 'Depends on'];

/** Expected **Status:** value for each subdirectory. */
const DIR_STATUS = { active: 'active', done: 'done', planned: 'planned' };

/** Filename regex for each subdirectory (csNN optionally followed by a letter suffix). */
const FILENAME_RE = {
  active: /^active_cs\d+[a-z]*_.*\.md$/,
  done:   /^done_cs\d+[a-z]*_.*\.md$/,
  planned: /^planned_cs\d+[a-z]*_.*\.md$/,
};

/** Close-out task enforcement applies from CS15a close-out onward. */
const CLOSEOUT_TASK_ENFORCEMENT_DATE = '2026-05-10';

/**
 * CHANGELOG-touch task enforcement (CS24 / LRN-101) applies from this date
 * onward. The latest existing done-CS `**Closed:**` date in the repo at CS24
 * time is 2026-07-04; per the `MODEL_AUDIT_ENFORCEMENT_DATE` precedent in
 * `scripts/check-clickstop-implementer-not-reviewer.mjs`, the cutoff is set
 * strictly AFTER it so every already-closed CS is grandfathered (warn-free) and
 * CI stays green. Do NOT lower this date — an earlier value would retroactively
 * flag closed CSs that predate the convention's mechanical enforcement.
 */
const CHANGELOG_TOUCH_ENFORCEMENT_DATE = '2026-07-05';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

let clickstopsDir = null;
let quiet = false;

/**
 * Return the value for a value-taking CLI flag or exit with usage.
 *
 * @param {string[]} args
 * @param {number} i
 * @param {string} flagName
 * @returns {string}
 */
function requireValue(args, i, flagName) {
  if (!args[i + 1] || args[i + 1].startsWith('-')) {
    process.stderr.write(
      `check-clickstop: missing value for ${flagName}\n` +
      'Usage: check-clickstop.mjs --dir <path> [--quiet]\n'
    );
    process.exit(2);
  }
  return args[i + 1];
}

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--dir') {
    clickstopsDir = requireValue(argv, i, '--dir');
    i++;
  } else if (a === '--quiet') {
    quiet = true;
  } else if (a === '--help' || a === '-h') {
    process.stdout.write(
      'Usage: check-clickstop.mjs --dir <path> [--quiet]\n\n' +
      'Lint all clickstop .md files under <path>/{active,done,planned}/.\n\n' +
      'Options:\n' +
      '  --dir <path>  Path to the clickstops/ root directory (required)\n' +
      '  --quiet       Suppress per-finding output; print only the summary\n' +
      '  --help        Print this help text\n'
    );
    process.exit(0);
  } else {
    process.stderr.write(`check-clickstop: unknown flag: ${a}\n`);
    process.exit(2);
  }
}

if (!clickstopsDir) {
  process.stderr.write(
    'check-clickstop: --dir <path> is required\n' +
    'Usage: check-clickstop.mjs --dir <path> [--quiet]\n'
  );
  process.exit(2);
}

if (!fs.existsSync(clickstopsDir)) {
  process.stderr.write(
    `check-clickstop: directory not found: ${clickstopsDir}\n`
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Finding collectors
// ---------------------------------------------------------------------------

const allErrors = [];

/**
 * Record an error and print it unless --quiet.
 *
 * @param {string} msg
 */
function logError(msg) {
  allErrors.push(msg);
  if (!quiet) process.stdout.write(`ERROR: ${msg}\n`);
}

/**
 * Check whether a markdown heading with the given text exists at any level.
 *
 * @param {string} content
 * @param {string} heading
 * @returns {boolean}
 */
function hasMarkdownHeading(content, heading) {
  return assertHeadings(content, [heading]).length === 0;
}

/**
 * Parse markdown table rows from a section body.
 *
 * @param {string} sectionBody
 * @returns {string[]}
 */
function tableRows(sectionBody) {
  return sectionBody
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'))
    .filter((line) => !/^\|[\s\-:|]+\|?$/.test(line))
    .filter((line) => !/^\|\s*Task\s*\|/i.test(line));
}

/**
 * Determine whether close-out task rows are required for this file.
 *
 * @param {string} content
 * @param {string} subdir
 * @returns {boolean}
 */
function requiresCloseoutTasks(content, subdir) {
  if (subdir === 'active') return true;
  if (subdir !== 'done') return false;
  const closedMatch = content.match(/\*\*Closed:\*\*\s*(\d{4}-\d{2}-\d{2})/);
  return Boolean(closedMatch && closedMatch[1] >= CLOSEOUT_TASK_ENFORCEMENT_DATE);
}

/**
 * Check that the Tasks table includes explicit close-out hygiene rows.
 *
 * @param {string} content
 * @param {string} subdir
 * @param {string} basename
 */
function checkCloseoutTasks(content, subdir, basename) {
  if (!requiresCloseoutTasks(content, subdir)) return;

  const tasksBody = hasMarkdownHeading(content, 'Tasks')
    ? extractSectionBody(content, headingAnchor('Tasks'))
    : null;
  if (!tasksBody) {
    logError(
      `${subdir}/${basename}: missing required "## Tasks" section for close-out task enforcement`
    );
    return;
  }

  const rows = tableRows(tasksBody)
    .map((row) => row.replace(/\blearnings=\d+\b/gi, '').toLowerCase());

  const hasDocsTask = rows.some((row) =>
    /(close-?out|restart|docs?|documentation)/.test(row) &&
    /(workboard|context|handoff|instructions|relevant docs|restart|docs?|documentation)/.test(row)
  );
  const hasLearningsTask = rows.some((row) =>
    /(close-?out|learnings?|lrn|follow-?ups?|planned cs)/.test(row) &&
    /(learnings?|lrn|follow-?ups?|planned cs)/.test(row)
  );

  if (!hasDocsTask) {
    logError(
      `${subdir}/${basename}: ## Tasks must include an explicit close-out docs/restart-state task ` +
      `(see OPERATIONS.md close-out procedure)`
    );
  }
  if (!hasLearningsTask) {
    logError(
      `${subdir}/${basename}: ## Tasks must include an explicit close-out learnings/follow-up task ` +
      `(see RETROSPECTIVES.md and OPERATIONS.md close-out procedure)`
    );
  }
}

// ---------------------------------------------------------------------------
// CHANGELOG-touch task enforcement (CS24 — LRN-101)
// ---------------------------------------------------------------------------

/**
 * Cached `harness.config.json` `excluded[]` list (loaded lazily, once).
 * `null` means "not yet loaded".
 *
 * @type {string[]|null}
 */
let excludedListCache = null;

/**
 * Load the `excluded[]` array from `harness.config.json`, fail-closed.
 *
 * The config lives at the repo root. It is resolved from the repo toplevel of
 * the clickstops directory (via git) so the lookup is robust regardless of the
 * process CWD; when the clickstops dir is not inside a git checkout, it falls
 * back to `process.cwd()`. A missing or malformed config is a hard error
 * (stderr + exit 1) — never a silent "treat everything as distributed" default
 * (LRN-033). The result is memoized so repeated per-file calls read the config
 * at most once.
 *
 * @returns {string[]} the `excluded[]` array (empty when the key is absent).
 */
function getExcludedList() {
  if (excludedListCache !== null) return excludedListCache;

  const top = gitTry(clickstopsDir, ['rev-parse', '--show-toplevel']);
  const root = top != null ? top.trim() : process.cwd();
  const configPath = path.join(root, 'harness.config.json');

  let raw;
  try {
    raw = fs.readFileSync(configPath, 'utf8');
  } catch (err) {
    process.stderr.write(
      `check-clickstop: cannot read harness.config.json at ${configPath} for ` +
      `distributed-surface detection (CS24): ${err.message}\n`
    );
    process.exit(1);
  }

  let config;
  try {
    config = JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch (err) {
    process.stderr.write(
      `check-clickstop: malformed harness.config.json at ${configPath}: ${err.message}\n`
    );
    process.exit(1);
  }

  let excluded = [];
  if (config.excluded !== undefined) {
    if (!Array.isArray(config.excluded)) {
      process.stderr.write(
        `check-clickstop: harness.config.json "excluded" must be an array; got ` +
        `${typeof config.excluded}\n`
      );
      process.exit(1);
    }
    excluded = config.excluded;
  }

  excludedListCache = excluded;
  return excludedListCache;
}

/**
 * Determine whether the CHANGELOG-touch task row is required for this file.
 * Mirrors {@link requiresCloseoutTasks}: `active/` files always; `done/` files
 * only when their `**Closed:**` date parses AND is on/after
 * `CHANGELOG_TOUCH_ENFORCEMENT_DATE`; never for `planned/`.
 *
 * @param {string} content
 * @param {string} subdir
 * @returns {boolean}
 */
function requiresChangelogTouchTask(content, subdir) {
  if (subdir === 'active') return true;
  if (subdir !== 'done') return false;
  const closedMatch = content.match(/\*\*Closed:\*\*\s*(\d{4}-\d{2}-\d{2})/);
  return Boolean(closedMatch && closedMatch[1] >= CHANGELOG_TOUCH_ENFORCEMENT_DATE);
}

/**
 * Check that a CS whose deliverables touch the distributed harness surface
 * carries an explicit CHANGELOG-touch task row (CS24 / LRN-101).
 *
 * Detection is pure-static: parse ONLY the `## Deliverables` section for path
 * tokens (see {@link extractDeliverablePathTokens}) and match them against the
 * distributed-surface globs minus the config `excluded[]` list
 * ({@link matchesDistributedSurface}). If no `## Deliverables` section exists,
 * the CS is treated as NOT distributed-touching (cannot determine — skip). When
 * the CS is distributed-touching, the `## Tasks` table must contain a row
 * matching both `/changelog/i` and one of the verbs
 * `touch|update|entry|bullet|append|add` (after the same `learnings=\d+` strip +
 * lowercase normalization used by {@link checkCloseoutTasks}).
 *
 * @param {string} content
 * @param {string} subdir
 * @param {string} basename
 */
function checkChangelogTouchTask(content, subdir, basename) {
  if (!requiresChangelogTouchTask(content, subdir)) return;

  const deliverablesBody = hasMarkdownHeading(content, 'Deliverables')
    ? extractSectionBody(content, headingAnchor('Deliverables'))
    : null;
  if (!deliverablesBody) return; // no Deliverables section → cannot determine; skip

  const excluded = getExcludedList();
  const tokens = extractDeliverablePathTokens(deliverablesBody);
  const touchesDistributed = tokens.some((t) => matchesDistributedSurface(t, excluded));
  if (!touchesDistributed) return;

  const tasksBody = hasMarkdownHeading(content, 'Tasks')
    ? extractSectionBody(content, headingAnchor('Tasks'))
    : null;
  if (!tasksBody) {
    logError(
      `${subdir}/${basename}: missing required "## Tasks" section — a CHANGELOG-touch task row ` +
      `is required (CS touches the distributed harness surface; see OPERATIONS.md § Harvest / LRN-101)`
    );
    return;
  }

  const rows = tableRows(tasksBody)
    .map((row) => row.replace(/\blearnings=\d+\b/gi, '').toLowerCase());
  const hasChangelogRow = rows.some((row) =>
    /changelog/i.test(row) && /(touch|update|entry|bullet|append|add)/i.test(row)
  );

  if (!hasChangelogRow) {
    logError(
      `${subdir}/${basename}: ## Tasks must include an explicit CHANGELOG-touch task row ` +
      `(CS touches the distributed harness surface; see OPERATIONS.md § Harvest / LRN-101)`
    );
  }
}

// ---------------------------------------------------------------------------
// File checking
// ---------------------------------------------------------------------------

/**
 * Check a single clickstop .md file for all invariants.
 *
 * @param {string} filePath   Absolute path to the file.
 * @param {string} subdir     Subdirectory name: 'active' | 'done' | 'planned'.
 */
function checkFile(filePath, subdir) {
  const basename = path.basename(filePath);
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8')
      .replace(/^\uFEFF/, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
  } catch (err) {
    logError(`${basename}: cannot read file: ${err.message}`);
    return;
  }

  // 1. Filename convention
  if (!FILENAME_RE[subdir].test(basename)) {
    logError(
      `${subdir}/${basename}: filename does not match convention ` +
      `(expected ${subdir}_csNN_<slug>.md)`
    );
  }

  // 2. Required header fields
  for (const field of REQUIRED_FIELDS) {
    // Escape the space in "Depends on" for the regex
    const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[ \\t]+');
    const pattern = new RegExp(`\\*\\*${escaped}:\\*\\*`);
    if (!pattern.test(content)) {
      logError(`${subdir}/${basename}: missing required field "**${field}:**"`);
    }
  }

  // 3. Lifecycle status invariant
  const statusMatch = content.match(/\*\*Status:\*\*\s*(\S+)/);
  if (statusMatch) {
    const fileStatus = statusMatch[1].toLowerCase().replace(/[^a-z]/g, '');
    const expectedStatus = DIR_STATUS[subdir];
    if (fileStatus !== expectedStatus) {
      logError(
        `${subdir}/${basename}: **Status:** is "${statusMatch[1]}" but file ` +
        `is in ${subdir}/ (expected "${expectedStatus}")`
      );
    }
  }
  // Note: missing Status is already caught by the required-fields check above.

  // 4. Plan-vs-implementation review gate (CS03b)
  // active/ and done/ must have the H2; done/ must have content or grandfathering.
  // Anchored multi-line regex (CS03b R1 review fix): inline mention of the H2
  // in prose or fenced code must NOT satisfy the check.
  if (subdir === 'active' || subdir === 'done') {
    const GATE_H2_RE = /^## Plan-vs-implementation review\s*$/m;
    const hasGateHeading = hasMarkdownHeading(content, 'Plan-vs-implementation review');
    const headingMatch = content.match(GATE_H2_RE);
    if (!hasGateHeading || !headingMatch) {
      logError(
        `${subdir}/${basename}: missing required H2 section ` +
        `"## Plan-vs-implementation review" (CS03b gate)`
      );
    } else if (subdir === 'done') {
      const body = extractSectionBody(content, headingAnchor('Plan-vs-implementation review'));

      const GRANDFATHERING = '> Grandfathered: closed before plan-vs-implementation review gate was introduced (CS03b).';
      const hasGrandfathering = body.includes(GRANDFATHERING);
      const hasReviewer = /^\*\*Reviewer:\*\*/m.test(body);
      const hasDate = /^\*\*Date:\*\*/m.test(body);
      const hasOutcome = /^\*\*Outcome:\*\*/m.test(body);
      const hasAllFields = hasReviewer && hasDate && hasOutcome;

      if (!hasGrandfathering && !hasAllFields) {
        logError(
          `${subdir}/${basename}: "## Plan-vs-implementation review" section ` +
          `must contain Reviewer/Date/Outcome fields OR the grandfathering line. ` +
          `The required field labels are matched verbatim (case-sensitive, bold-prefixed): ` +
          `"**Reviewer:**", "**Date:**", "**Outcome:**". ` +
          `See OPERATIONS.md § "Plan-vs-implementation review (close-out gate)" for the canonical skeleton.`
        );
      }
    }
  }

  // 5. Close-out hygiene tasks (introduced after CS15a close-out)
  checkCloseoutTasks(content, subdir, basename);

  // 6. CHANGELOG-touch task for distributed-surface CSs (CS24 — LRN-101)
  checkChangelogTouchTask(content, subdir, basename);
}

// ---------------------------------------------------------------------------
// Directory-form close-out orphan check (CS70 — C70-6 / C70-6a)
// ---------------------------------------------------------------------------

/**
 * Run a read-only git command scoped to the repo containing `cwd`. Returns
 * stdout on success, or null on any failure (non-git context, git not
 * installed, unreadable history) so callers degrade to a no-op rather than
 * producing a false positive.
 *
 * @param {string} cwd
 * @param {string[]} args
 * @returns {string|null}
 */
function gitTry(cwd, args) {
  try {
    return execFileSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

/** Convert an OS path to POSIX separators (for git pathspecs + comparisons). */
function toPosix(p) {
  return p.split(path.sep).join('/');
}

/**
 * Files under `root` as POSIX-relative paths (recursive).
 *
 * @param {string} root
 * @returns {{ files: Set<string>, hadError: boolean }} `files` is the set of
 *   POSIX-relative paths discovered; `hadError` is true if any non-ENOENT I/O
 *   error was hit mid-walk (the listing is then partial — callers should not
 *   draw "missing file" conclusions from it).
 */
function listFilesRel(root) {
  const out = new Set();
  let hadError = false;
  const walk = (cur, rel) => {
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch (err) {
      // ENOENT mid-walk is benign (nothing to enumerate); any other I/O error
      // (e.g. EACCES on a present-but-unreadable subtree) is surfaced so the
      // operator sees the real cause rather than a misleading "file missing"
      // orphan error derived from an incomplete listing.
      if (err.code !== 'ENOENT') {
        hadError = true;
        logError(`cannot read ${cur} during directory-form orphan check: ${err.message}`);
      }
      return;
    }
    for (const e of entries) {
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(cur, e.name), childRel);
      else out.add(childRel);
    }
  };
  walk(root, '');
  return { files: out, hadError };
}

/**
 * Parse a `.harness-closeout-allow-drop` allow-list into a Set of basenames
 * (C70-6a). Format: one basename per line; lines beginning with `#` are
 * comments; blank lines ignored. A missing file yields an empty Set
 * (default-strict).
 *
 * @param {string} filePath
 * @returns {{ allowed: Set<string>, hadError: boolean }} `allowed` is the set
 *   of allow-listed basenames; `hadError` is true if the file exists but could
 *   not be read (non-ENOENT). On `hadError` the set may be incomplete — callers
 *   should not treat absent entries as "not allow-listed".
 */
function parseAllowDrop(filePath) {
  const allowed = new Set();
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') {
      logError(`cannot read allow-list ${filePath}: ${err.message}`);
      return { allowed, hadError: true };
    }
    return { allowed, hadError: false }; // ENOENT → empty (default-strict)
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    allowed.add(trimmed);
  }
  return { allowed, hadError: false };
}

/**
 * For every directory-form done CS (`done/done_csNN_<slug>/done_csNN_<slug>.md`),
 * verify no file ever present under the corresponding
 * `active/active_csNN_<slug>/` directory (in any commit, across all refs) is
 * missing from the done directory — except the renamed plan file
 * (`active_…​.md` → `done_…​.md`) and any basename declared in the CS's optional
 * `.harness-closeout-allow-drop` allow-list. Catches the CS16 failure mode
 * where a per-file close-out rename silently drops sibling artifacts
 * (agent-harness#290). Node-builtins only (git via child_process). In a
 * non-git checkout it is a no-op (returns early). In a **shallow clone** it
 * still runs, best-effort, against whatever `active/` history is available and
 * emits a non-failing NOTE: it may miss drops whose history was truncated but
 * never false-positives (it can only flag files it actually sees in history).
 * CI should run `harness lint` with full history (e.g. `actions/checkout`
 * `fetch-depth: 0`) for complete coverage.
 *
 * @param {string} dir  the clickstops directory (contains active/ done/ planned/)
 */
function checkDirFormOrphans(dir) {
  const doneDir = path.join(dir, 'done');

  const top = gitTry(dir, ['rev-parse', '--show-toplevel']);
  if (top == null) return;
  const root = top.trim();

  // A shallow clone may not see the full history of active/ directories, so the
  // orphan check can only run best-effort and may miss truncated drops. Surface
  // that as a non-failing NOTE so the gap is visible rather than silent.
  const shallow = gitTry(dir, ['rev-parse', '--is-shallow-repository']);
  if (shallow != null && shallow.trim() === 'true' && !quiet) {
    process.stdout.write(
      'NOTE: shallow git clone — the directory-form close-out orphan check (CS70) ' +
      'is degraded and may miss dropped files; run with full history ' +
      '(fetch-depth: 0) for complete coverage.\n'
    );
  }

  // Read done/ directly rather than guarding with existsSync(): ENOENT means
  // there are no done CSes to check (a legitimate skip), but any other I/O
  // error (e.g. EACCES on a present-but-unreadable tree) must fail closed via
  // logError instead of silently skipping orphan detection.
  let doneEntries;
  try {
    doneEntries = fs.readdirSync(doneDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return;
    logError(`cannot read done/ for directory-form orphan check: ${err.message}`);
    return;
  }

  for (const entry of doneEntries) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith('done_')) continue;
    const slug = entry.name.slice('done_'.length); // csNN_<slug>
    const doneCsDir = path.join(doneDir, entry.name);
    // Directory-form requires the plan file inside. Distinguish ENOENT (not
    // dir-form — skip) from other I/O errors (fail closed via logError).
    let planStat;
    try {
      planStat = fs.statSync(path.join(doneCsDir, `done_${slug}.md`));
    } catch (err) {
      if (err.code === 'ENOENT') continue;
      logError(`cannot stat done/${entry.name}/done_${slug}.md: ${err.message}`);
      continue;
    }
    if (!planStat.isFile()) continue;

    const activeRel = toPosix(path.relative(root, path.resolve(dir, 'active', `active_${slug}`)));
    const log = gitTry(root, ['log', '--all', '--pretty=format:', '--name-only', '--', activeRel]);
    if (log == null) continue;

    const prefix = `${activeRel}/`;
    const historicalActive = new Set();
    for (const line of log.split('\n')) {
      const p = line.trim();
      if (p && p.startsWith(prefix)) historicalActive.add(p.slice(prefix.length));
    }
    if (historicalActive.size === 0) continue;

    const { files: donePresent, hadError: doneReadError } = listFilesRel(doneCsDir);
    const { allowed, hadError: allowReadError } = parseAllowDrop(
      path.join(doneCsDir, '.harness-closeout-allow-drop')
    );
    // If the done tree or the allow-list could not be fully read (e.g. EACCES on
    // a subtree/file), the listing is incomplete. Skip the orphan comparison for
    // this CS to avoid emitting misleading "file missing" errors on top of the
    // already-logged I/O failure — the linter still fails closed via that error.
    if (doneReadError || allowReadError) continue;

    for (const relPath of [...historicalActive].sort()) {
      if (relPath === `active_${slug}.md`) continue; // plan file is renamed, not dropped
      if (path.posix.basename(relPath) === '.gitkeep') continue; // empty-dir git placeholder, not a content artifact
      if (donePresent.has(relPath)) continue;
      if (allowed.has(relPath) || allowed.has(path.posix.basename(relPath))) continue;
      logError(
        `done/${entry.name}: file "${relPath}" was present under ` +
        `active/active_${slug}/ in git history but is missing from done/${entry.name}/. ` +
        'Directory-form CS close-out must `git mv` the whole directory ' +
        '(OPERATIONS.md § Claim, CS70); if the drop was intentional, add ' +
        `"${path.posix.basename(relPath)}" to done/${entry.name}/.harness-closeout-allow-drop.`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Walk subdirectories
// ---------------------------------------------------------------------------

let filesChecked = 0;

for (const subdir of ['active', 'done', 'planned']) {
  const dirPath = path.join(clickstopsDir, subdir);

  // Skip subdirectory if it doesn't exist (graceful — useful for partial fixture trees)
  if (!fs.existsSync(dirPath)) continue;

  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (err) {
    logError(`cannot read directory ${subdir}/: ${err.message}`);
    continue;
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.md')) continue;
    if (entry.name === '.gitkeep') continue;

    checkFile(path.join(dirPath, entry.name), subdir);
    filesChecked++;
  }
}

// Directory-form close-out orphan check (CS70 — C70-6 / C70-6a)
checkDirFormOrphans(clickstopsDir);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

process.stdout.write(`\nclickstops: ${filesChecked} files checked, ${allErrors.length} errors\n`);

if (allErrors.length > 0) {
  process.stdout.write('\n❌ Linter FAILED\n');
  process.exit(1);
} else {
  process.stdout.write('\n✅ Linter passed\n');
  process.exit(0);
}
