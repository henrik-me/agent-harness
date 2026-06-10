/**
 * lib/claim.mjs — workboard-claim mechanics for CS lifecycle (CS64 C64-4).
 *
 * Replaces the hand-stepped OPERATIONS.md § Claim ritual with one verb that:
 *
 *   1. Preflights:  clean worktree, current branch == 'main', main is in
 *                   sync with origin/main (no fetch — assume Session-Start
 *                   pulled), exactly-one matching planned CS file, valid
 *                   slug, claim branch absent, no existing Active row for
 *                   this orchestrator, no other CS already in flight.
 *   2. Runs the pre-claim harvest gate (`harness harvest --claim-area csNN`).
 *   3. Renders a claim *plan* (the rename + the WORKBOARD row + the branch
 *      name) — read-only output by default ("--dry-run is the default").
 *   4. On --apply, executes the plan: cut the branch, git mv the file, edit
 *      WORKBOARD.md. **Never** commits and **never** pushes (LRN-073 +
 *      C64-4: claim mechanics own filesystem state, the orchestrator owns
 *      the commit message and the PR).
 *
 * R3 race-aware: applyClaimPlan() re-reads WORKBOARD.md from disk at the
 * moment of write AND re-validates the one-CS-active conflict check on the
 * fresh content before mutating, so a sibling clone that lands its own claim
 * for the SAME orchestrator between the preflight and the apply does not get
 * silently overwritten — the diff is applied to the *current* file and the
 * apply refuses (rather than producing a second Active row) if the
 * orchestrator already owns an Active row in the freshly-read WORKBOARD.
 *
 * All filesystem and git access is funnelled through an injectable
 * `runner` interface so tests drive the pure logic without touching the real
 * worktree or spawning processes. Real disk wrappers are exported for the
 * CLI to consume.
 *
 * Zero runtime dependencies beyond Node 20+ stdlib.
 *
 * @module lib/claim.mjs
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SLUG_RE = /^[a-z0-9][a-z0-9.-]*$/;
const CS_ID_RE = /^CS(\d+[a-z]?)$/i;

/**
 * @typedef {object} PlannedListing
 * @property {string}  entryPath       - Absolute path of the file to rename.
 * @property {string}  filename        - Basename of the .md file.
 * @property {string}  cs              - CS id ('CS64').
 * @property {string}  slug            - URL-safe slug ('lifecycle-command-skill-surface').
 * @property {boolean} directoryForm   - True iff the CS lives in a sibling directory.
 * @property {string}  [directoryPath] - When directoryForm, the absolute dir path being moved.
 */

/**
 * Normalize a CS id to canonical 'CS<digits>[suffix]' form (uppercase 'CS').
 * Returns null if the input is not a valid id.
 *
 * @param {string} raw
 * @returns {string|null}
 */
export function normalizeCsId(raw) {
  const m = CS_ID_RE.exec(String(raw || '').trim());
  if (!m) return null;
  return `CS${m[1].toLowerCase()}`;
}

/** Validate a slug: lower-kebab, non-empty, must start alphanumeric. */
export function slugIsValid(slug) {
  return typeof slug === 'string' && SLUG_RE.test(slug);
}

/**
 * Find the planned CS file/dir for a given CS id.
 *
 * Accepts both flat form (`planned_cs64_<slug>.md`) and directory form
 * (`planned_cs64_<slug>/planned_cs64_<slug>.md`). Returns either:
 *   - { ok: true, listing }
 *   - { ok: false, error }
 *
 * @param {object} args
 * @param {string} args.plannedDir
 * @param {string} args.csId       - Canonical CS id ('CS64').
 * @param {(p: string) => string[]} args.readdir - dir → entry-name list.
 * @param {(p: string) => boolean} args.isDirectory
 * @returns {{ok: true, listing: PlannedListing} | {ok: false, error: string}}
 */
export function findPlannedClickstop({ plannedDir, csId, readdir, isDirectory }) {
  const num = csId.replace(/^CS/i, '').toLowerCase();
  const flatRe = new RegExp(`^planned_cs${num}_([a-z0-9][a-z0-9.-]*)\\.md$`);
  const dirRe = new RegExp(`^planned_cs${num}_([a-z0-9][a-z0-9.-]*)$`);

  let entries;
  try {
    entries = readdir(plannedDir);
  } catch (e) {
    return { ok: false, error: `cannot read ${plannedDir}: ${e.message}` };
  }

  const matches = [];
  for (const name of entries) {
    const flatMatch = flatRe.exec(name);
    if (flatMatch) {
      matches.push({
        entryPath: path.join(plannedDir, name),
        filename: name,
        cs: csId,
        slug: flatMatch[1],
        directoryForm: false,
      });
      continue;
    }
    const dirMatch = dirRe.exec(name);
    if (dirMatch && isDirectory(path.join(plannedDir, name))) {
      // Directory-form match: the canonical inner file must also be present.
      // Without this check, an empty/half-populated planned_csNN_<slug>/ would
      // be accepted by claim, which would then git-mv an empty directory into
      // active/ and produce a malformed active CS missing its main markdown
      // (Copilot R6 finding on PR #289).
      const innerName = `${name}.md`;
      let innerEntries;
      try {
        innerEntries = readdir(path.join(plannedDir, name));
      } catch (e) {
        // R13 amendment: preserve the underlying I/O error rather than
        // masquerading EACCES/etc. as "missing markdown file".
        return {
          ok: false,
          error: `cannot read planned directory ${path.join(plannedDir, name)}: ${e.message}`,
        };
      }
      if (!innerEntries.includes(innerName)) {
        return {
          ok: false,
          error: `planned directory ${name} is missing its main markdown file (${innerName}) — the directory-form CS is malformed; restore the file before claim`,
        };
      }
      matches.push({
        entryPath: path.join(plannedDir, name, innerName),
        filename: innerName,
        cs: csId,
        slug: dirMatch[1],
        directoryForm: true,
        directoryPath: path.join(plannedDir, name),
      });
    }
  }

  if (matches.length === 0) {
    return { ok: false, error: `no planned ${csId} found under ${plannedDir}` };
  }
  if (matches.length > 1) {
    const names = matches.map((m) => m.filename).join(', ');
    return { ok: false, error: `ambiguous: ${matches.length} planned ${csId} entries (${names})` };
  }
  return { ok: true, listing: matches[0] };
}

/**
 * Find the active CS file/dir for a given CS id. Mirrors findPlannedClickstop
 * but for the `active/` directory. Used by runClaimFromDisk for C64-4
 * idempotency: when the planned→active rename has already happened (e.g.
 * after the claim PR merged), re-running `harness claim <NN>` should be a
 * clean no-op rather than failing with "no planned <CS>".
 *
 * Returns the same listing shape as findPlannedClickstop (entryPath /
 * filename / cs / slug / directoryForm [+ directoryPath]) so callers can
 * compose with the same renderers.
 *
 * @param {object} args
 * @param {string} args.activeDir
 * @param {string} args.csId          - Already-normalized (CS\d+[a-z]?).
 * @param {(p: string) => string[]} args.readdir
 * @param {(p: string) => boolean} args.isDirectory
 * @returns {{ok: true, listing: PlannedListing} | {ok: false, error: string}}
 */
export function findActiveByCsId({ activeDir, csId, readdir, isDirectory }) {
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
    const flatMatch = flatRe.exec(name);
    if (flatMatch) {
      matches.push({
        entryPath: path.join(activeDir, name),
        filename: name,
        cs: csId,
        slug: flatMatch[1],
        directoryForm: false,
      });
      continue;
    }
    const dirMatch = dirRe.exec(name);
    if (dirMatch && isDirectory(path.join(activeDir, name))) {
      // Same malformed-directory guard as findPlannedClickstop: a half-populated
      // active_csNN_<slug>/ without its main markdown is corrupted state, not a
      // valid idempotent already-active CS. R1 reviewer (gpt-5.5) caught this
      // gap on cs64/content-r2.
      const innerName = `${name}.md`;
      let innerEntries;
      try {
        innerEntries = readdir(path.join(activeDir, name));
      } catch (e) {
        return {
          ok: false,
          error: `cannot read active directory ${path.join(activeDir, name)}: ${e.message}`,
        };
      }
      if (!innerEntries.includes(innerName)) {
        return {
          ok: false,
          error: `active directory ${name} is missing its main markdown file (${innerName}) — the directory-form CS is malformed; restore the file before claim`,
        };
      }
      matches.push({
        entryPath: path.join(activeDir, name, innerName),
        filename: innerName,
        cs: csId,
        slug: dirMatch[1],
        directoryForm: true,
        directoryPath: path.join(activeDir, name),
      });
    }
  }

  if (matches.length === 0) {
    return { ok: false, error: `no active ${csId} found under ${activeDir}` };
  }
  if (matches.length > 1) {
    const names = matches.map((m) => m.filename).join(', ');
    return { ok: false, error: `ambiguous: ${matches.length} active ${csId} entries (${names})` };
  }
  return { ok: true, listing: matches[0] };
}

/**
 * Parse the WORKBOARD.md "## Active Work" table into row objects. Skips
 * comment markers and the em-dash placeholder. Stops at the next H2.
 *
 * Returned shape is intentionally claim-local (cs / blocked) and DIFFERS from
 * lib/status.mjs parseActiveWorkRows() which uses csTaskId / blockedReason.
 * Both readers parse the same table; the two shapes co-exist for backwards
 * compatibility with their respective callers. Do not assume cross-module
 * interchangeability.
 *
 * @param {string} workboardMd
 * @returns {{cs: string, title: string, state: string, owner: string, branch: string, lastUpdated: string, blocked: string}[]}
 */
export function parseActiveWorkRows(workboardMd) {
  const lines = String(workboardMd || '').split('\n');
  let inActive = false;
  const rows = [];
  for (const line of lines) {
    if (/^## /.test(line)) {
      if (/^## Active Work/i.test(line)) {
        inActive = true;
        continue;
      }
      if (inActive) break;
    }
    if (!inActive) continue;
    if (!line.trim().startsWith('|')) continue;
    if (/^\|[\s-]+\|/.test(line)) continue;
    if (/^\|\s*CS-Task ID\s*\|/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 7) continue;
    if (cells[0] === '—' || cells[0] === '') continue;
    rows.push({
      cs: cells[0],
      title: cells[1],
      state: cells[2],
      owner: cells[3],
      branch: cells[4],
      lastUpdated: cells[5],
      blocked: cells[6],
    });
  }
  return rows;
}

/**
 * Insert the new Active Work row into the WORKBOARD.md table. If a row for
 * the same CS already exists, returns the original text unchanged
 * (idempotent — re-running claim does not duplicate).
 *
 * The row is appended just before the next H2 / horizontal rule that ends
 * the table block.
 *
 * @param {object} args
 * @param {string} args.workboardMd
 * @param {object} args.row - {cs, title, state, owner, branch, lastUpdated, blocked}
 * @returns {{md: string, mutated: boolean}}
 */
export function insertActiveWorkRow({ workboardMd, row }) {
  const existing = parseActiveWorkRows(workboardMd);
  if (existing.some((r) => r.cs === row.cs)) {
    return { md: workboardMd, mutated: false };
  }
  const lines = String(workboardMd || '').split('\n');
  let inActive = false;
  let lastTableLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^## /.test(line)) {
      if (/^## Active Work/i.test(line)) {
        inActive = true;
        continue;
      }
      if (inActive) break;
    }
    if (!inActive) continue;
    if (line.trim().startsWith('|')) lastTableLine = i;
  }
  if (lastTableLine === -1) {
    return { md: workboardMd, mutated: false };
  }
  // If the only data row is the em-dash placeholder, replace it.
  const lastLine = lines[lastTableLine];
  const lastCells = lastLine.split('|').slice(1, -1).map((c) => c.trim());
  const isPlaceholder = lastCells[0] === '—';
  const newRow = `| ${row.cs} | ${row.title} | ${row.state} | ${row.owner} | ${row.branch} | ${row.lastUpdated} | ${row.blocked} |`;
  if (isPlaceholder) {
    lines.splice(lastTableLine, 1, newRow);
  } else {
    lines.splice(lastTableLine + 1, 0, newRow);
  }
  return { md: lines.join('\n'), mutated: true };
}

/**
 * @typedef {object} ClaimPlan
 * @property {string}  csId
 * @property {string}  slug
 * @property {string}  branch             - The *content* branch (e.g. `cs64/content`)
 *                                          that the workboard row records and the
 *                                          eventual content PR will use. NOT the
 *                                          claim branch — the claim PR always uses
 *                                          `cs<NN>/claim`, derived deterministically
 *                                          from `csId` in formatClaimPlan() and the
 *                                          createBranch step (Copilot R7 finding).
 * @property {string}  sourcePath        - Absolute path of planned/ file (or directory).
 * @property {string}  destPath          - Absolute path of active/ file (or directory).
 * @property {boolean} directoryForm
 * @property {object}  workboardRow      - Row inserted into WORKBOARD ## Active Work.
 * @property {string}  workboardPath
 * @property {string}  plannedDir
 * @property {string}  activeDir
 */

/**
 * Compose a claim plan from a planned listing + current WORKBOARD + caller
 * context. Pure — no IO. Returns either {ok: true, plan} or
 * {ok: false, errors[]}.
 *
 * @param {object} args
 * @param {string}        args.csId           - Canonical CS id ('CS64').
 * @param {PlannedListing} args.listing       - Result of findPlannedClickstop().
 * @param {string}        args.workboardMd
 * @param {string}        args.workboardPath
 * @param {string}        args.plannedDir
 * @param {string}        args.activeDir
 * @param {string}        args.agentId        - Orchestrator agent ID for the Owner column.
 * @param {string}        args.title          - CS title for the Title column.
 * @param {string}        [args.today]        - ISO date for Last Updated (YYYY-MM-DD).
 * @param {string}        [args.branchSuffix] - Default 'content' (the branch the content PR
 *                                              will use; the *claim* PR branch is always
 *                                              `csNN/claim`). Stored as the workboard row's
 *                                              Branch cell since that is what readers care about.
 * @returns {{ok: true, plan: ClaimPlan} | {ok: false, errors: string[]}}
 */
export function planClaim({
  csId,
  listing,
  workboardMd,
  workboardPath,
  plannedDir,
  activeDir,
  agentId,
  title,
  today,
  branchSuffix = 'content',
}) {
  const errors = [];
  if (!normalizeCsId(csId)) errors.push(`invalid CS id: ${csId}`);
  if (!listing || !listing.slug) errors.push('listing missing');
  else if (!slugIsValid(listing.slug)) errors.push(`invalid slug: ${listing.slug}`);
  if (!agentId) errors.push('agentId required');
  if (!title) errors.push('title required');

  const num = csId.replace(/^CS/i, '').toLowerCase();
  const rows = parseActiveWorkRows(workboardMd);
  const ownerActiveOther = rows.find(
    (r) => r.owner === agentId && r.state.includes('Active') && r.cs !== csId,
  );
  if (ownerActiveOther) {
    errors.push(
      `orchestrator ${agentId} already owns an Active CS row in WORKBOARD (${ownerActiveOther.cs})`,
    );
  }
  // One-CS-at-a-time rule: warn if any *other* row is Active.
  const otherActive = rows.find((r) => r.state.includes('Active') && r.cs !== csId);
  if (otherActive) {
    errors.push(
      `another CS is already Active in WORKBOARD: ${otherActive.cs} (owner ${otherActive.owner}) — one CS at a time`
    );
  }

  if (errors.length) return { ok: false, errors };

  const baseName = `cs${num}_${listing.slug}`;
  const destName = listing.directoryForm
    ? path.join(activeDir, `active_${baseName}`)
    : path.join(activeDir, `active_${baseName}.md`);
  const sourcePath = listing.directoryForm ? listing.directoryPath : listing.entryPath;

  return {
    ok: true,
    plan: {
      csId,
      slug: listing.slug,
      branch: `cs${num}/${branchSuffix}`,
      sourcePath,
      destPath: destName,
      directoryForm: listing.directoryForm,
      workboardRow: {
        cs: csId,
        title,
        state: '🟢 Active',
        owner: agentId,
        branch: `cs${num}/${branchSuffix}`,
        lastUpdated: today || new Date().toISOString().slice(0, 10),
        blocked: '—',
      },
      workboardPath,
      plannedDir,
      activeDir,
    },
  };
}

/**
 * Render a claim plan as the dry-run report. Stable, line-oriented; pipes
 * into the CLI's stdout.
 *
 * @param {ClaimPlan} plan
 * @returns {string}
 */
export function formatClaimPlan(plan) {
  // Render paths relative to the repo root (the parent of plan.workboardPath)
  // rather than process.cwd(). When the CLI is invoked with --cwd <consumer>
  // from another directory, process.cwd() can point at a sibling or parent
  // dir and produce confusing/incorrect paths in the user-facing plan output.
  const repoRoot = path.dirname(plan.workboardPath);
  const lines = [];
  lines.push(`harness claim — ${plan.csId} (${plan.slug})`);
  lines.push('');
  lines.push('Would perform:');
  lines.push(`  1. git checkout -b cs${plan.csId.replace(/^CS/i, '')}/claim`);
  lines.push(
    `  2. git mv ${path.relative(repoRoot, plan.sourcePath)} ${path.relative(
      repoRoot,
      plan.destPath
    )}`
  );
  lines.push(`  3. Insert WORKBOARD ## Active Work row:`);
  const r = plan.workboardRow;
  lines.push(
    `     | ${r.cs} | ${r.title} | ${r.state} | ${r.owner} | ${r.branch} | ${r.lastUpdated} | ${r.blocked} |`
  );
  lines.push('');
  lines.push('Re-run with --apply to execute. Commit is NEVER performed by harness claim.');
  return lines.join('\n') + '\n';
}

/**
 * @typedef {object} ApplyResult
 * @property {boolean} renamed
 * @property {boolean} workboardEdited
 * @property {string[]} actions  - Human-readable log of what happened.
 * @property {string[]} skipped  - Idempotency notes (rename already done, row already present).
 */

/**
 * Execute a claim plan against disk. Idempotent: re-running after partial
 * completion finishes the remaining steps without redoing the done ones.
 * NEVER commits.
 *
 * Re-reads WORKBOARD.md from disk just before write (R3 race-aware).
 *
 * @param {object} args
 * @param {ClaimPlan} args.plan
 * @param {object} args.runner
 * @param {(src: string, dest: string) => void} args.runner.gitMv
 * @param {(p: string) => boolean} args.runner.exists
 * @param {(p: string) => string} args.runner.readFile
 * @param {(p: string, body: string) => void} args.runner.writeFile
 * @returns {ApplyResult}
 */
export function applyClaimPlan({ plan, runner }) {
  const actions = [];
  const skipped = [];

  // R3 race-aware re-check: re-parse Active Work from the *current* WORKBOARD
  // and refuse to mutate if this orchestrator (or another row for the same CS
  // id) has appeared between plan time and apply time.
  const freshWorkboard = runner.readFile(plan.workboardPath);
  const freshRows = parseActiveWorkRows(freshWorkboard);
  const selfOther = freshRows.find(
    (r) => r.owner === plan.workboardRow.owner && r.state.includes('Active') && r.cs !== plan.csId,
  );
  if (selfOther) {
    throw new Error(
      `apply-time race: orchestrator ${plan.workboardRow.owner} now owns Active row for ${selfOther.cs} in WORKBOARD (was clear at plan time); refusing to add a second Active row`,
    );
  }
  // Also re-check the *global* one-CS-at-a-time invariant: any *other* Active
  // CS, regardless of owner, must block apply. Without this, a different
  // orchestrator claiming a CS between plan and apply would slip past.
  const globalOtherActive = freshRows.find(
    (r) => r.state.includes('Active') && r.cs !== plan.csId,
  );
  if (globalOtherActive) {
    throw new Error(
      `apply-time race: another CS is already Active in WORKBOARD (${globalOtherActive.cs}, owner ${globalOtherActive.owner}); refusing to add a second Active row`,
    );
  }

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

  const { md, mutated } = insertActiveWorkRow({ workboardMd: freshWorkboard, row: plan.workboardRow });
  let workboardEdited = false;
  if (mutated) {
    runner.writeFile(plan.workboardPath, md);
    actions.push(`updated ${path.basename(plan.workboardPath)} Active Work row for ${plan.csId}`);
    workboardEdited = true;
  } else {
    skipped.push(`WORKBOARD row for ${plan.csId} already present`);
  }

  return { renamed, workboardEdited, actions, skipped };
}

/* ────────────────────────── disk-side wrappers ─────────────────────────── */

/** Read planned title from a planned CS file (the first H1). */
export function readClickstopTitle(filePath) {
  try {
    const txt = readFileSync(filePath, 'utf8');
    const m = /^#\s+(.+?)\s*$/m.exec(txt);
    return m ? m[1] : '';
  } catch {
    return '';
  }
}

/**
 * Run the pre-claim harvest gate.
 *
 * @param {object} args
 * @param {string} args.cwd
 * @param {string} args.harnessBin
 * @param {string} args.csId  - 'CS64' → 'cs64' for the --claim-area flag.
 * @returns {{ok: boolean, output: string}}
 */
export function runHarvestGate({ cwd, harnessBin, csId }) {
  const area = csId.toLowerCase();
  const r = spawnSync(process.execPath, [harnessBin, 'harvest', `--claim-area`, area], {
    cwd,
    encoding: 'utf8',
  });
  const output = (r.stdout || '') + (r.stderr || '');
  return { ok: r.status === 0, output };
}

/** Default disk runner for applyClaimPlan(). */
export function createDefaultRunner({ cwd }) {
  return {
    exists: (p) => existsSync(p),
    readFile: (p) => readFileSync(p, 'utf8'),
    writeFile: (p, body) => writeFileSync(p, body),
    gitMv: (src, dest) => {
      const r = spawnSync('git', ['mv', src, dest], { cwd, encoding: 'utf8' });
      if (r.status !== 0) {
        throw new Error(`git mv failed: ${(r.stderr || '').trim()}`);
      }
    },
    createBranch: (branch) => {
      const r = spawnSync('git', ['checkout', '-b', branch], { cwd, encoding: 'utf8' });
      if (r.status !== 0) {
        throw new Error(`git checkout -b ${branch} failed: ${(r.stderr || '').trim()}`);
      }
    },
    branchExists: (branch) => {
      const r = spawnSync('git', ['rev-parse', '--verify', branch], {
        cwd,
        encoding: 'utf8',
      });
      return r.status === 0;
    },
    currentBranch: () => {
      const r = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, encoding: 'utf8' });
      if (r.status !== 0) return '';
      return (r.stdout || '').trim();
    },
    revParse: (ref) => {
      const r = spawnSync('git', ['rev-parse', ref], { cwd, encoding: 'utf8' });
      if (r.status !== 0) return '';
      return (r.stdout || '').trim();
    },
    worktreeClean: () => {
      const r = spawnSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' });
      return r.status === 0 && (r.stdout || '').trim().length === 0;
    },
  };
}

/**
 * Top-level disk operation: preflight, plan, optionally apply. Returns the
 * data structure the CLI prints; CLI owns the rendering and exit codes.
 *
 * @param {object} args
 * @param {string} args.cwd
 * @param {string} args.csId
 * @param {string} args.agentId
 * @param {string} args.harnessBin
 * @param {boolean} args.apply
 * @param {boolean} args.skipHarvest  - Escape hatch for tests / re-runs.
 * @returns {{ok: boolean, errors?: string[], plan?: ClaimPlan, apply?: ApplyResult, harvest?: {ok: boolean, output: string}}}
 */
export function runClaimFromDisk({ cwd, csId, agentId, harnessBin, apply = false, skipHarvest = false }) {
  const normalized = normalizeCsId(csId);
  if (!normalized) return { ok: false, errors: [`invalid CS id: ${csId}`] };

  const plannedDir = path.join(cwd, 'project', 'clickstops', 'planned');
  const activeDir = path.join(cwd, 'project', 'clickstops', 'active');
  const workboardPath = path.join(cwd, 'WORKBOARD.md');

  // Idempotency check (C64-4: "already-active CS ⇒ no-op with a clear
  // message"). Performed BEFORE git preflights so a re-run on a fully claimed
  // CS is a clean no-op even on a dirty worktree / wrong branch / fresh
  // checkout. CS64 PVI gate (post-merge) identified this gap: the original
  // implementation jumped straight to findPlannedClickstop and errored with
  // "no planned <CS>" once the planned→active rename had already happened.
  const readdirSafe = (p) => (existsSync(p) ? readdirSync(p) : []);
  const isDirSafe = (p) => {
    try {
      return statSync(p).isDirectory();
    } catch {
      return false;
    }
  };
  const alreadyActive = findActiveByCsId({
    activeDir,
    csId: normalized,
    readdir: readdirSafe,
    isDirectory: isDirSafe,
  });
  if (alreadyActive.ok) {
    const csNum = normalized.replace(/^CS/i, '').toLowerCase();
    // R1 reviewer (gpt-5.5) on cs64/content-r2: verify WORKBOARD consistency
    // for the already-claimed path. A fully-claimed CS must have BOTH the
    // active file AND the Active Work row. If the file is in active/ but the
    // row is missing, that's partial-claim state — surface it rather than
    // mask it as a no-op. If WORKBOARD.md itself is missing (fresh checkout),
    // we cannot verify — fall through to the no-op path with a hint.
    let workboardMd = null;
    try {
      workboardMd = readFileSync(workboardPath, 'utf8');
    } catch {
      /* missing/unreadable — handled below */
    }
    if (workboardMd !== null) {
      const rows = parseActiveWorkRows(workboardMd);
      const target = normalized.toUpperCase();
      // Copilot reviewer on PR #299 (R2 amendment follow-up):
      // WORKBOARD.md's `CS-Task ID` column is validated by
      // scripts/check-workboard.mjs as `^CS\d{2,}[a-z]?$`, so hyphenated
      // forms like `CS64-T1` are rejected by the schema. The original R2
      // boundary-aware predicate (`cell === target || cell.startsWith(`${target}-`)`)
      // was therefore accepting forms that could never appear in a valid
      // WORKBOARD and risked masking malformed rows. Exact match is the
      // correct semantics and still rejects sibling ids like `CS64b`.
      const hasRow = rows.some((r) => String(r.cs || '').toUpperCase() === target);
      if (!hasRow) {
        return {
          ok: false,
          errors: [
            `${normalized} active file present (${alreadyActive.listing.filename}) but WORKBOARD.md has no Active Work row for it — partial claim state. Add the row manually or restore the planned file to rerun the full claim flow.`,
          ],
        };
      }
    }
    return {
      ok: true,
      alreadyClaimed: true,
      message:
        `${normalized} is already claimed (active file: ${alreadyActive.listing.filename}). ` +
        `No-op; nothing to do. To re-stage a claim from scratch, ` +
        `restore planned/${normalized.toLowerCase()}_<slug>.md first or run on a fresh tree.`,
      activeListing: alreadyActive.listing,
      csNum,
    };
  }

  const runner = createDefaultRunner({ cwd });

  if (!runner.worktreeClean()) {
    return { ok: false, errors: ['worktree is not clean — commit or stash before claim'] };
  }

  const branch = runner.currentBranch();
  if (branch !== 'main') {
    return {
      ok: false,
      errors: [`must claim from main; current branch is '${branch || '(detached)'}'`],
    };
  }

  // Verify main is in sync with origin/main. No fetch — Session-Start owns the
  // network step (git pull / fetch) per INSTRUCTIONS.md. If origin/main is
  // ahead, refuse and tell the caller to re-sync.
  const head = runner.revParse('HEAD');
  const originMain = runner.revParse('refs/remotes/origin/main');
  if (originMain && head && originMain !== head) {
    return {
      ok: false,
      errors: [
        `main is out of sync with origin/main (HEAD=${head.slice(0, 12)} vs origin/main=${originMain.slice(0, 12)}); run 'git pull origin main --rebase' first`,
      ],
    };
  }

  const num = normalized.replace(/^CS/i, '').toLowerCase();
  if (runner.branchExists(`cs${num}/claim`)) {
    return { ok: false, errors: [`branch cs${num}/claim already exists`] };
  }

  const found = findPlannedClickstop({
    plannedDir,
    csId: normalized,
    readdir: readdirSafe,
    isDirectory: isDirSafe,
  });
  if (!found.ok) return { ok: false, errors: [found.error] };

  const title = readClickstopTitle(found.listing.entryPath);
  let workboardMd;
  try {
    workboardMd = readFileSync(workboardPath, 'utf8');
  } catch (err) {
    // Copilot R8 finding (PR #289): a missing/unreadable WORKBOARD.md (fresh
    // bootstrap, wrong --cwd, permissions) must surface as a structured
    // preflight failure, not an uncaught throw.
    return {
      ok: false,
      errors: [`cannot read ${path.relative(cwd, workboardPath) || 'WORKBOARD.md'}: ${err.message}`],
    };
  }
  const planned = planClaim({
    csId: normalized,
    listing: found.listing,
    workboardMd,
    workboardPath,
    plannedDir,
    activeDir,
    agentId,
    title: title || `CS ${num}`,
  });
  if (!planned.ok) return planned;

  let harvest;
  if (!skipHarvest) {
    harvest = runHarvestGate({ cwd, harnessBin, csId: normalized });
    if (!harvest.ok) {
      return { ok: false, errors: ['harvest gate failed — resolve stale learnings before claim'], harvest, plan: planned.plan };
    }
  }

  if (!apply) return { ok: true, plan: planned.plan, harvest };

  // Derive the claim branch from the normalized CS id directly rather than
  // string-replacing the content-branch suffix (see Copilot review #289):
  // planClaim()'s branchSuffix is a hook, and depending on /content$/ being
  // present here would silently produce a wrong branch if the suffix ever
  // changes. cs<NN>/claim is the only valid claim-branch shape.
  runner.createBranch(`cs${num}/claim`);
  const applied = applyClaimPlan({ plan: planned.plan, runner });
  return { ok: true, plan: planned.plan, apply: applied, harvest };
}
