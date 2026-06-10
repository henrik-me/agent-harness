/**
 * lib/closeout.mjs — close-out mechanics for CS lifecycle (CS64 C64-5).
 *
 * Two-phase close-out per OPERATIONS.md § Plan-vs-implementation review
 * (close-out gate) + § Three-PR shape (close-out PR rules):
 *
 *   Phase 1 — preflight (read-only, fail-closed):
 *     • Correct branch checked out (cs<NN>/close-out).
 *     • Worktree is clean.
 *     • Active CS file exists in `active/` and carries a populated
 *       `## Plan-vs-implementation review` section with **Reviewer:**,
 *       **Date:**, **Outcome:** GO (NEEDS-FIX / BLOCK / missing → refuse).
 *
 *   Phase 2 — mutate (read-only on disk *except* the rename + WORKBOARD edit):
 *     • git mv active/<file> done/<file>  (flat or directory form).
 *     • Remove the CS row from WORKBOARD ## Active Work; if that empties
 *       the table, restore the canonical em-dash placeholder.
 *     • Detect whether CONTEXT.md was changed in this branch's diff; if
 *       not, mark the result not-ready-for-PR and explain the gap.
 *
 * Never commits, never pushes (LRN-073 + C64-5: close-out mechanics own
 * filesystem state; the orchestrator owns the commit message and the PR).
 *
 * All git / fs / spawn access is funnelled through an injectable runner
 * so unit tests drive the pure logic without touching the real worktree
 * (LRN-094: no REPO_ROOT writes).
 *
 * Zero runtime dependencies beyond Node 20+ stdlib + lib/claim.mjs (for
 * parseActiveWorkRows — single source of truth for WORKBOARD parsing).
 *
 * @module lib/closeout.mjs
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { normalizeCsId, parseActiveWorkRows } from './claim.mjs';

const ACTIVE_DIR_NAME = 'active';
const DONE_DIR_NAME = 'done';

/* ────────────────────────── PVI parsing ────────────────────────────────── */

/**
 * @typedef {object} PviSection
 * @property {boolean} present     - Whether `## Plan-vs-implementation review` exists.
 * @property {boolean} filled      - Whether it has all three bold fields.
 * @property {string}  reviewer    - Value after **Reviewer:** (trimmed).
 * @property {string}  date        - Value after **Date:**.
 * @property {string}  outcome     - 'GO' | 'NEEDS-FIX' | 'BLOCK' | ''.
 * @property {string[]} issues     - Linter-style messages.
 */

/**
 * Parse the `## Plan-vs-implementation review` H2 section out of a CS file.
 * Returns issues describing why it's not GO-ready (empty array iff GO).
 *
 * @param {string} csFileMd
 * @returns {PviSection}
 */
export function parsePviSection(csFileMd) {
  const lines = String(csFileMd || '').split('\n');
  const result = {
    present: false,
    filled: false,
    reviewer: '',
    date: '',
    outcome: '',
    issues: [],
  };

  let inSection = false;
  const sectionLines = [];
  for (const line of lines) {
    if (/^## /.test(line)) {
      if (inSection) break;
      if (/^## Plan-vs-implementation review\b/.test(line)) {
        inSection = true;
        result.present = true;
        continue;
      }
    }
    if (inSection) sectionLines.push(line);
  }

  if (!result.present) {
    result.issues.push('missing "## Plan-vs-implementation review" section');
    return result;
  }

  const text = sectionLines.join('\n');
  const reviewerMatch = /\*\*Reviewer:\*\*\s*(.+?)\s*$/m.exec(text);
  const dateMatch = /\*\*Date:\*\*\s*(.+?)\s*$/m.exec(text);
  const outcomeMatch = /\*\*Outcome:\*\*\s*(GO|NEEDS-FIX|BLOCK)\b/m.exec(text);

  if (reviewerMatch) result.reviewer = reviewerMatch[1].trim();
  if (dateMatch) result.date = dateMatch[1].trim();
  if (outcomeMatch) result.outcome = outcomeMatch[1];

  if (!reviewerMatch) result.issues.push('PVI section missing **Reviewer:** field');
  if (!dateMatch) result.issues.push('PVI section missing **Date:** field');
  if (!outcomeMatch) {
    result.issues.push('PVI section missing **Outcome:** field (GO/NEEDS-FIX/BLOCK)');
  } else if (outcomeMatch[1] !== 'GO') {
    result.issues.push(
      `PVI outcome is ${outcomeMatch[1]} — close-out blocked until outcome is GO`
    );
  }

  // Common placeholder detection — the template leaves "_(filled at close-out per the gate)_".
  if (/_\(filled at close-out per the gate\)_/.test(text)) {
    result.issues.push('PVI section still contains the unfilled-placeholder text');
  }

  result.filled = Boolean(
    reviewerMatch && dateMatch && outcomeMatch && outcomeMatch[1] === 'GO' && result.issues.length === 0
  );
  return result;
}

/* ────────────────────────── WORKBOARD removal ──────────────────────────── */

const EMPTY_PLACEHOLDER_ROW = '| — | no active CS | — | — | — | — | — |';

/**
 * Remove the Active Work row for `csId` from WORKBOARD.md. If removing the
 * row leaves the table empty, restores the canonical em-dash placeholder
 * (check-workboard.mjs rejects `_(none)_` placeholders, so we use the
 * documented placeholder shape).
 *
 * Idempotent — if no matching row exists, returns the input unchanged.
 *
 * @param {object} args
 * @param {string} args.workboardMd
 * @param {string} args.csId
 * @returns {{md: string, mutated: boolean}}
 */
export function removeActiveWorkRow({ workboardMd, csId }) {
  const lines = String(workboardMd || '').split('\n');
  let inActive = false;
  let activeStart = -1;
  let activeEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^## /.test(line)) {
      if (/^## Active Work/i.test(line)) {
        inActive = true;
        activeStart = i;
        continue;
      }
      if (inActive) {
        activeEnd = i;
        break;
      }
    }
  }
  if (activeStart === -1) return { md: workboardMd, mutated: false };

  let mutated = false;
  const out = [];
  let dataRowCount = 0;
  let separatorIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (i < activeStart || i >= activeEnd) {
      out.push(lines[i]);
      continue;
    }
    const line = lines[i];
    if (line.trim().startsWith('|')) {
      // Header & separator survive.
      if (/^\|\s*CS-Task ID\s*\|/.test(line)) {
        out.push(line);
        continue;
      }
      if (/^\|[\s-]+\|/.test(line)) {
        out.push(line);
        separatorIndex = out.length - 1;
        continue;
      }
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      if (cells[0] === csId) {
        mutated = true;
        continue; // drop this row
      }
      if (cells[0] === '—') {
        // Drop placeholder; we'll re-add if needed.
        continue;
      }
      dataRowCount += 1;
      out.push(line);
      continue;
    }
    out.push(line);
  }

  if (mutated && dataRowCount === 0 && separatorIndex !== -1) {
    out.splice(separatorIndex + 1, 0, EMPTY_PLACEHOLDER_ROW);
  }

  return { md: out.join('\n'), mutated };
}

/* ────────────────────────── active-file lookup ─────────────────────────── */

/**
 * @typedef {object} ActiveListing
 * @property {string}  csFilePath      - Absolute path of the active .md file.
 * @property {string}  filename
 * @property {string}  cs              - Canonical CS id.
 * @property {string}  slug
 * @property {boolean} directoryForm
 * @property {string}  [directoryPath] - When directoryForm, the dir being moved.
 */

/**
 * Find the active CS file/dir for a given CS id.
 *
 * @param {object} args
 * @param {string} args.activeDir
 * @param {string} args.csId
 * @param {(p: string) => string[]} args.readdir
 * @param {(p: string) => boolean} args.isDirectory
 * @returns {{ok: true, listing: ActiveListing} | {ok: false, error: string}}
 */
export function findActiveClickstop({ activeDir, csId, readdir, isDirectory }) {
  const num = csId.replace(/^CS/i, '').toLowerCase();
  const flatRe = new RegExp(`^active_cs${num}_([a-z0-9][a-z0-9.-]*)\\.md$`);
  const dirRe = new RegExp(`^active_cs${num}_([a-z0-9][a-z0-9.-]*)$`);

  let entries;
  try {
    entries = readdir(activeDir);
  } catch (e) {
    return { ok: false, error: `cannot read ${activeDir}: ${e.message}` };
  }

  const matches = [];
  for (const name of entries) {
    const flat = flatRe.exec(name);
    if (flat) {
      matches.push({
        csFilePath: path.join(activeDir, name),
        filename: name,
        cs: csId,
        slug: flat[1],
        directoryForm: false,
      });
      continue;
    }
    const dir = dirRe.exec(name);
    if (dir && isDirectory(path.join(activeDir, name))) {
      matches.push({
        csFilePath: path.join(activeDir, name, `${name}.md`),
        filename: `${name}.md`,
        cs: csId,
        slug: dir[1],
        directoryForm: true,
        directoryPath: path.join(activeDir, name),
      });
    }
  }

  if (matches.length === 0) {
    return { ok: false, error: `no active ${csId} found under ${activeDir}` };
  }
  if (matches.length > 1) {
    return { ok: false, error: `ambiguous: ${matches.length} active ${csId} entries` };
  }
  return { ok: true, listing: matches[0] };
}

/**
 * Find the done CS file/dir for a given CS id. Mirrors findActiveClickstop
 * but for the `done/` directory. Used by runCloseoutFromDisk for C64-5
 * idempotency: when the active→done rename has already happened (e.g. after
 * the close-out PR merged), re-running `harness close-out <NN>` should be a
 * clean no-op rather than failing with "no active <CS>".
 *
 * @param {object} args
 * @param {string} args.doneDir
 * @param {string} args.csId          - Already-normalized (CS\d+[a-z]?).
 * @param {(p: string) => string[]} args.readdir
 * @param {(p: string) => boolean} args.isDirectory
 * @returns {{ok: true, listing: ActiveListing} | {ok: false, error: string}}
 */
export function findDoneByCsId({ doneDir, csId, readdir, isDirectory }) {
  const num = csId.replace(/^CS/i, '').toLowerCase();
  const flatRe = new RegExp(`^done_cs${num}_([a-z0-9][a-z0-9.-]*)\\.md$`);
  const dirRe = new RegExp(`^done_cs${num}_([a-z0-9][a-z0-9.-]*)$`);

  let entries;
  try {
    entries = readdir(doneDir);
  } catch (e) {
    return { ok: false, error: `cannot read ${doneDir}: ${e.message}` };
  }

  const matches = [];
  for (const name of entries) {
    const flat = flatRe.exec(name);
    if (flat) {
      matches.push({
        csFilePath: path.join(doneDir, name),
        filename: name,
        cs: csId,
        slug: flat[1],
        directoryForm: false,
      });
      continue;
    }
    const dir = dirRe.exec(name);
    if (dir && isDirectory(path.join(doneDir, name))) {
      // R1 reviewer (gpt-5.5) on cs64/content-r2: same malformed-directory
      // guard as findPlannedClickstop / findActiveByCsId — a half-populated
      // done_csNN_<slug>/ without its main markdown is corrupted state, not
      // a valid idempotent already-done CS.
      const innerName = `${name}.md`;
      let innerEntries;
      try {
        innerEntries = readdir(path.join(doneDir, name));
      } catch (e) {
        return {
          ok: false,
          error: `cannot read done directory ${path.join(doneDir, name)}: ${e.message}`,
        };
      }
      if (!innerEntries.includes(innerName)) {
        return {
          ok: false,
          error: `done directory ${name} is missing its main markdown file (${innerName}) — the directory-form CS is malformed; restore the file before close-out`,
        };
      }
      matches.push({
        csFilePath: path.join(doneDir, name, innerName),
        filename: innerName,
        cs: csId,
        slug: dir[1],
        directoryForm: true,
        directoryPath: path.join(doneDir, name),
      });
    }
  }

  if (matches.length === 0) {
    return { ok: false, error: `no done ${csId} found under ${doneDir}` };
  }
  if (matches.length > 1) {
    return { ok: false, error: `ambiguous: ${matches.length} done ${csId} entries` };
  }
  return { ok: true, listing: matches[0] };
}

/* ────────────────────────── plan + apply ──────────────────────────────── */

/**
 * @typedef {object} CloseoutPlan
 * @property {string}  csId
 * @property {string}  slug
 * @property {string}  sourcePath      - Active file/dir path.
 * @property {string}  destPath        - Done file/dir path.
 * @property {boolean} directoryForm
 * @property {string}  workboardPath
 * @property {string}  contextPath     - Absolute path of CONTEXT.md (for freshness check).
 * @property {string}  branchExpected  - 'cs<NN>/close-out'.
 */

/**
 * Compose a close-out plan from on-disk paths and the active listing. Pure.
 *
 * @param {object} args
 * @param {string}  args.csId
 * @param {ActiveListing} args.listing
 * @param {string}  args.activeDir
 * @param {string}  args.doneDir
 * @param {string}  args.workboardPath
 * @param {string}  args.contextPath
 * @returns {{ok: true, plan: CloseoutPlan} | {ok: false, errors: string[]}}
 */
export function planCloseout({ csId, listing, activeDir, doneDir, workboardPath, contextPath }) {
  if (!normalizeCsId(csId)) return { ok: false, errors: [`invalid CS id: ${csId}`] };
  if (!listing) return { ok: false, errors: ['listing required'] };

  const num = csId.replace(/^CS/i, '').toLowerCase();
  const baseName = `cs${num}_${listing.slug}`;
  const sourcePath = listing.directoryForm ? listing.directoryPath : listing.csFilePath;
  const destPath = listing.directoryForm
    ? path.join(doneDir, `done_${baseName}`)
    : path.join(doneDir, `done_${baseName}.md`);

  return {
    ok: true,
    plan: {
      csId,
      slug: listing.slug,
      sourcePath,
      destPath,
      directoryForm: listing.directoryForm,
      workboardPath,
      contextPath,
      branchExpected: `cs${num}/close-out`,
    },
  };
}

/**
 * @typedef {object} PreflightResult
 * @property {boolean} ok
 * @property {string[]} errors    - Hard failures (block close-out).
 * @property {string[]} warnings  - Advisory; non-blocking but worth surfacing.
 * @property {PviSection} pvi
 */

/**
 * Run Phase 1 (read-only preflights). Each check is wired through a runner
 * seam so tests can drive it without git/fs.
 *
 * @param {object} args
 * @param {CloseoutPlan} args.plan
 * @param {object} args.runner
 * @param {() => string} args.runner.currentBranch
 * @param {() => boolean} args.runner.worktreeClean
 * @param {(p: string) => boolean} args.runner.exists
 * @param {(p: string) => string} args.runner.readFile
 * @returns {PreflightResult}
 */
export function preflightCloseout({ plan, runner }) {
  const errors = [];
  const warnings = [];
  let pvi = { present: false, filled: false, reviewer: '', date: '', outcome: '', issues: [] };

  const branch = runner.currentBranch();
  if (!branch) {
    errors.push('unable to determine current git branch');
  } else if (branch !== plan.branchExpected) {
    errors.push(
      `current branch is "${branch}" but close-out expects "${plan.branchExpected}" — switch branches and retry`
    );
  }

  if (!runner.worktreeClean()) {
    errors.push('worktree is not clean — commit or stash before close-out');
  }

  if (!runner.exists(plan.sourcePath)) {
    errors.push(`active CS file not found at ${plan.sourcePath}`);
  } else {
    // Active file (or its inner .md for directory form).
    const csFilePath = plan.directoryForm
      ? path.join(plan.sourcePath, `active_cs${plan.csId.slice(2).toLowerCase()}_${plan.slug}.md`)
      : plan.sourcePath;
    if (plan.directoryForm && !runner.exists(csFilePath)) {
      errors.push(
        `active CS directory ${path.basename(plan.sourcePath)} is missing its main markdown file ` +
        `(${path.basename(csFilePath)}) — the directory-form CS is malformed; restore the file before close-out`
      );
    } else {
      const md = runner.readFile(csFilePath);
      pvi = parsePviSection(md);
      for (const issue of pvi.issues) errors.push(issue);
    }
  }

  return { ok: errors.length === 0, errors, warnings, pvi };
}

/**
 * @typedef {object} ApplyCloseoutResult
 * @property {boolean} renamed
 * @property {boolean} workboardEdited
 * @property {boolean} contextChanged  - True iff CONTEXT.md appears in branch diff.
 * @property {boolean} prReady         - False until contextChanged is also true.
 * @property {string[]} actions
 * @property {string[]} skipped
 * @property {string[]} freshness      - Reasons prReady is false.
 */

/**
 * Run Phase 2 (mutate). Requires a successful preflightCloseout() first;
 * caller passes preflight.ok as a gate. Re-reads WORKBOARD.md just before
 * write (R3 race-aware).
 *
 * @param {object} args
 * @param {CloseoutPlan} args.plan
 * @param {object} args.runner
 * @param {(p: string) => boolean} args.runner.exists
 * @param {(p: string) => string} args.runner.readFile
 * @param {(p: string, body: string) => void} args.runner.writeFile
 * @param {(src: string, dest: string) => void} args.runner.gitMv
 * @param {() => string[]} args.runner.changedFiles   - Files changed on close-out branch vs base.
 * @returns {ApplyCloseoutResult}
 */
export function applyCloseoutPlan({ plan, runner }) {
  const actions = [];
  const skipped = [];

  let renamed = false;
  if (runner.exists(plan.destPath) && !runner.exists(plan.sourcePath)) {
    skipped.push(`rename already applied: ${path.basename(plan.destPath)} present`);
  } else if (!runner.exists(plan.sourcePath)) {
    throw new Error(`source missing for rename: ${plan.sourcePath}`);
  } else {
    runner.gitMv(plan.sourcePath, plan.destPath);
    actions.push(`git mv ${path.basename(plan.sourcePath)} → ${path.basename(plan.destPath)}`);
    renamed = true;
  }

  // R3 race-aware: re-read WORKBOARD just before write.
  const fresh = runner.readFile(plan.workboardPath);
  const { md, mutated } = removeActiveWorkRow({ workboardMd: fresh, csId: plan.csId });
  let workboardEdited = false;
  if (mutated) {
    runner.writeFile(plan.workboardPath, md);
    actions.push(`removed ${plan.csId} row from ${path.basename(plan.workboardPath)} Active Work`);
    workboardEdited = true;
  } else {
    skipped.push(`no WORKBOARD row for ${plan.csId} (already removed)`);
  }

  // Freshness re-validation: refuse PR-ready until CONTEXT.md changed.
  // Compare against the exact relative path of the repo-root CONTEXT.md;
  // a permissive endsWith('CONTEXT.md') match also matches template/seeded/CONTEXT.md
  // and other nested copies, which can falsely satisfy the gate. Absolute
  // changedFiles entries are normalized to the same repo-relative form before
  // comparing, so both `git diff --name-only` (relative) and tools that emit
  // absolute paths produce the same answer.
  const changed = runner.changedFiles();
  const repoRoot = path.dirname(plan.workboardPath);
  const contextRel = path.relative(repoRoot, plan.contextPath).replace(/\\/g, '/');
  const contextChanged = changed.some((f) => {
    const norm = f.replace(/\\/g, '/');
    if (norm === contextRel) return true;
    if (path.isAbsolute(f)) {
      const rel = path.relative(repoRoot, f).replace(/\\/g, '/');
      return rel === contextRel;
    }
    return false;
  });

  const freshness = [];
  if (!contextChanged) {
    freshness.push(
      'CONTEXT.md was not modified in this branch — update the restart-state section before opening the close-out PR'
    );
  }
  const prReady = contextChanged;

  return { renamed, workboardEdited, contextChanged, prReady, actions, skipped, freshness };
}

/* ────────────────────────── formatters ────────────────────────────────── */

/**
 * Render the preflight phase to stdout. The `apply` flag rephrases the
 * trailing hint so we don't tell the user to "Re-run with --apply" when
 * we're already in --apply mode (Copilot R7 finding on PR #289).
 *
 * @param {object} args
 * @param {object} args.plan
 * @param {object} args.preflight
 * @param {boolean} [args.apply] - True iff caller is about to run Phase 2.
 */
export function formatPreflightReport({ plan, preflight, apply = false }) {
  const lines = [];
  lines.push(`harness close-out — ${plan.csId} (${plan.slug}) — preflight`);
  lines.push('');
  if (preflight.ok) {
    lines.push(
      apply
        ? 'All preflight checks passed; proceeding to Phase 2.'
        : 'All preflight checks passed. Re-run with --apply to execute Phase 2.'
    );
  } else {
    lines.push('Preflight FAILED:');
    for (const e of preflight.errors) lines.push(`  ✖ ${e}`);
  }
  if (preflight.warnings.length) {
    lines.push('');
    lines.push('Warnings:');
    for (const w of preflight.warnings) lines.push(`  ⚠ ${w}`);
  }
  if (preflight.pvi.present && preflight.pvi.filled) {
    lines.push('');
    lines.push(`PVI: ${preflight.pvi.outcome} by ${preflight.pvi.reviewer} on ${preflight.pvi.date}`);
  }
  return lines.join('\n') + '\n';
}

export function formatApplyReport({ plan, applied }) {
  const lines = [];
  lines.push(`harness close-out — ${plan.csId} (${plan.slug}) — apply`);
  lines.push('');
  for (const a of applied.actions) lines.push(`  ✓ ${a}`);
  for (const s of applied.skipped) lines.push(`  – ${s} (idempotent skip)`);
  lines.push('');
  if (applied.prReady) {
    lines.push('Ready to commit close-out PR. Commit is NEVER performed by harness close-out.');
  } else {
    lines.push('NOT ready to open close-out PR:');
    for (const f of applied.freshness) lines.push(`  ✖ ${f}`);
  }
  return lines.join('\n') + '\n';
}

/* ────────────────────────── disk wrappers ─────────────────────────────── */

/**
 * Returns whether an Active Work row for the given CS id exists in
 * WORKBOARD.md at workboardPath. Returns `{exists: false, missingFile: true}`
 * if the file is absent (e.g. fresh checkout) — callers should treat that as
 * "cannot verify" rather than "row absent". Used by the close-out idempotency
 * gate (C64-5) to detect partial-state (done file present but stale
 * WORKBOARD row); R1 reviewer (gpt-5.5) on cs64/content-r2.
 *
 * @param {string} workboardPath
 * @param {string} csId
 * @returns {{exists: boolean, missingFile?: boolean, readError?: string}}
 */
export function activeWorkRowExists(workboardPath, csId) {
  if (!existsSync(workboardPath)) return { exists: false, missingFile: true };
  let md;
  try {
    md = readFileSync(workboardPath, 'utf8');
  } catch (e) {
    // Copilot reviewer on PR #299 round 3: distinguish "missing file"
    // (e.g. fresh checkout — legitimately no WORKBOARD on disk) from
    // "exists but unreadable" (real I/O error). The latter must surface
    // upstream, not silently fall through to a clean no-op that hides
    // the inability to verify WORKBOARD consistency.
    return { exists: false, readError: String(e.message || e) };
  }
  const rows = parseActiveWorkRows(md);
  const target = csId.toUpperCase();
  // Copilot reviewer on PR #299 (R2 amendment follow-up):
  // WORKBOARD.md's `CS-Task ID` column is validated by
  // scripts/check-workboard.mjs as `^CS\d{2,}[a-z]?$`, so hyphenated forms
  // like `CS64-T1` are rejected by the schema. Exact match is the correct
  // semantics — it still rejects sibling ids (CS64 vs CS64b) and never
  // accepts forms that the workboard linter would reject as malformed.
  return {
    exists: rows.some((r) => String(r.cs || '').toUpperCase() === target),
  };
}

/** Default disk runner. */
export function createDefaultRunner({ cwd }) {
  const sh = (cmd, args) => spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  return {
    currentBranch: () => {
      const r = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
      if (r.status !== 0) return '';
      return (r.stdout || '').trim();
    },
    worktreeClean: () => {
      const r = sh('git', ['status', '--porcelain']);
      return r.status === 0 && (r.stdout || '').trim().length === 0;
    },
    exists: (p) => existsSync(p),
    readFile: (p) => readFileSync(p, 'utf8'),
    writeFile: (p, body) => writeFileSync(p, body),
    gitMv: (src, dest) => {
      const r = sh('git', ['mv', src, dest]);
      if (r.status !== 0) throw new Error(`git mv failed: ${(r.stderr || '').trim()}`);
    },
    changedFiles: () => {
      // --no-renames so a CONTEXT.md rename surfaces under both sides
      // (rename-detection rule per LRN/CS63 lessons learned).
      const r = sh('git', ['diff', '--no-renames', '--name-only', 'main...HEAD']);
      if (r.status !== 0) return [];
      return (r.stdout || '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    },
  };
}

/**
 * Top-level disk entrypoint: locate active, preflight, optionally apply.
 *
 * @param {object} args
 * @param {string} args.cwd
 * @param {string} args.csId
 * @param {boolean} args.apply
 * @returns {{ok: boolean, errors?: string[], plan?: CloseoutPlan, preflight?: PreflightResult, apply?: ApplyCloseoutResult}}
 */
export function runCloseoutFromDisk({ cwd, csId, apply = false }) {
  const normalized = normalizeCsId(csId);
  if (!normalized) return { ok: false, errors: [`invalid CS id: ${csId}`] };

  const activeDir = path.join(cwd, 'project', 'clickstops', ACTIVE_DIR_NAME);
  const doneDir = path.join(cwd, 'project', 'clickstops', DONE_DIR_NAME);
  const workboardPath = path.join(cwd, 'WORKBOARD.md');
  const contextPath = path.join(cwd, 'CONTEXT.md');

  const readdirSafe = (p) => (existsSync(p) ? readdirSync(p) : []);
  const isDirSafe = (p) => {
    try {
      return statSync(p).isDirectory();
    } catch {
      return false;
    }
  };

  const found = findActiveClickstop({
    activeDir,
    csId: normalized,
    readdir: readdirSafe,
    isDirectory: isDirSafe,
  });

  // Idempotency check (C64-5: close-out is idempotent). Only the genuine
  // "no active CS<NN> found" outcome — not ambiguous matches, malformed
  // directories, or unreadable filesystem state — should fall through to the
  // done-idempotency probe. R1 reviewer (gpt-5.5) on cs64/content-r2 flagged
  // that the broader `!found.ok` predicate masked ambiguous/corrupted active
  // states behind an "already-closed-out" no-op. The explicit "no active"
  // prefix is the contract finalized by findActiveClickstop matches.length===0.
  if (!found.ok && /^no active /.test(found.error)) {
    const alreadyDone = findDoneByCsId({
      doneDir,
      csId: normalized,
      readdir: readdirSafe,
      isDirectory: isDirSafe,
    });
    if (alreadyDone.ok) {
      // Verify WORKBOARD consistency: a fully closed-out CS must NOT still
      // have an Active Work row. If the file is in done/ but the row remains,
      // that's a half-applied state and must surface to the user, not be
      // masked as a no-op. R1 reviewer concern (WORKBOARD consistency).
      const workboardConflict = activeWorkRowExists(workboardPath, normalized);
      // Copilot reviewer on PR #299 round 3: an unreadable WORKBOARD.md
      // (exists on disk but readFileSync threw) must surface — we cannot
      // verify consistency, so a clean "no-op" message would be misleading.
      // A missing-file case (no WORKBOARD.md on disk, e.g. fresh checkout)
      // is still allowed to fall through to the no-op path.
      if (workboardConflict.readError) {
        return {
          ok: false,
          errors: [
            `${normalized} appears closed-out (${alreadyDone.listing.filename}) but cannot read WORKBOARD.md to verify consistency: ${workboardConflict.readError}`,
          ],
        };
      }
      if (workboardConflict.exists) {
        return {
          ok: false,
          errors: [
            `${normalized} appears closed-out (${alreadyDone.listing.filename}) but WORKBOARD.md still has an Active Work row for it — partial close-out state. Remove the WORKBOARD row before re-running, or restore the active file to rerun the full close-out flow.`,
          ],
        };
      }
      return {
        ok: true,
        alreadyClosedOut: true,
        message:
          `${normalized} is already closed-out (done file: ${alreadyDone.listing.filename}). ` +
          `No-op; nothing to do.`,
        doneListing: alreadyDone.listing,
      };
    }
    // Copilot reviewer on PR #299 (round 2): if findDoneByCsId failed for a
    // non-"no done" reason (ambiguous done entries, malformed directory-form
    // done, I/O error), surface the underlying done error rather than masking
    // it with the original "no active" error — the active error is now
    // misleading because we know the user is in a partial/corrupt closed-out
    // state. Only the genuine "no done" case means the CS is simply not yet
    // closed out, and we re-raise the active error for that.
    if (!/^no done /.test(alreadyDone.error)) {
      return { ok: false, errors: [alreadyDone.error] };
    }
    return { ok: false, errors: [found.error] };
  }
  if (!found.ok) {
    // Non-"no active" failure (ambiguous, malformed, unreadable) — surface
    // verbatim rather than masking with the done-idempotency path.
    return { ok: false, errors: [found.error] };
  }

  const planned = planCloseout({
    csId: normalized,
    listing: found.listing,
    activeDir,
    doneDir,
    workboardPath,
    contextPath,
  });
  if (!planned.ok) return planned;

  const runner = createDefaultRunner({ cwd });
  const preflight = preflightCloseout({ plan: planned.plan, runner });
  if (!preflight.ok) return { ok: false, errors: preflight.errors, plan: planned.plan, preflight };

  if (!apply) return { ok: true, plan: planned.plan, preflight };

  const applied = applyCloseoutPlan({ plan: planned.plan, runner });
  return { ok: applied.prReady, plan: planned.plan, preflight, apply: applied };
}
