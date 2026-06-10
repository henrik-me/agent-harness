/**
 * lib/status.mjs — read-only resume/handoff snapshot verb (CS64 C64-7).
 *
 * Prints, at a glance, what the harness thinks is in flight: the WORKBOARD's
 * Active Work rows, the on-disk active/ CS files, and the planned/ backlog
 * count. Output-only — never mutates any file, never touches the network,
 * never invokes git. Safe to run anytime; designed to be cheap and idempotent
 * so an agent (human or automated) can re-orient after a context reset.
 *
 * Pairs with `lib/startup.mjs` (which runs the broader Session-Start sanity
 * sequence). `status` is the slim, "just tell me what's going on" cousin —
 * suitable for hand-off summaries and the "what was I doing before the
 * reboot?" recovery flow.
 *
 * Zero runtime dependencies beyond Node 20+ stdlib. Pure functions over
 * markdown text + a planned/active filename list, with a thin disk-reading
 * convenience wrapper.
 *
 * @module lib/status.mjs
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * @typedef {object} ActiveWorkRow
 * @property {string} csTaskId
 * @property {string} title
 * @property {string} state
 * @property {string} owner
 * @property {string} branch
 * @property {string} lastUpdated
 * @property {string} blockedReason
 */

/**
 * @typedef {object} CsListing
 * @property {string} stage  - "planned" or "active".
 * @property {string} cs     - "CS64", "CS22b", etc. (extracted from filename).
 * @property {string} slug   - filename-encoded slug (e.g. "lifecycle-command-skill-surface").
 * @property {string} entry  - relative path of the main CS .md file.
 * @property {boolean} directoryForm
 */

/**
 * @typedef {object} StatusSnapshot
 * @property {ActiveWorkRow[]} activeWorkRows  - Rows from WORKBOARD Active Work
 *   table (excluding the em-dash placeholder).
 * @property {CsListing[]}    plannedListings
 * @property {CsListing[]}    activeListings
 * @property {string|null}    agentId
 * @property {object}         counts
 */

/** Em-dash / "no active CS" placeholder row marker. */
const PLACEHOLDER_TITLE = 'no active CS';

/**
 * Parse the WORKBOARD.md ## Active Work table.
 *
 * Locates the H2 `## Active Work` heading, scans forward to a `|` table
 * header, then reads data rows until the table ends. Skips the canonical
 * em-dash placeholder ("| — | no active CS | — | …"). Tolerant of optional
 * leading/trailing whitespace and HTML comments interleaved before the table.
 *
 * @param {string} workboardMd - Raw WORKBOARD.md content.
 * @returns {ActiveWorkRow[]}
 */
export function parseActiveWorkRows(workboardMd) {
  if (typeof workboardMd !== 'string') {
    throw new Error('parseActiveWorkRows: workboardMd must be a string');
  }

  const lines = workboardMd.split('\n');
  const headingIdx = lines.findIndex((l) => /^##\s+Active Work\b/.test(l.trim()));
  if (headingIdx === -1) return [];

  let headerIdx = -1;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^##\s/.test(t)) break;
    if (t.startsWith('|') && /CS-Task ID/i.test(t)) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  const rows = [];
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t.startsWith('|')) break;
    if (/^\|\s*[-:|\s]+\|$/.test(t)) continue;
    const cells = t
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim());
    if (cells.length < 7) continue;
    const [csTaskId, title, state, owner, branch, lastUpdated, blockedReason] = cells;
    if (title === PLACEHOLDER_TITLE) continue;
    rows.push({ csTaskId, title, state, owner, branch, lastUpdated, blockedReason });
  }
  return rows;
}

/**
 * Match a planned/active CS filename. Accepts both forms:
 *   planned_cs<NN>_<slug>.md          (flat)
 *   planned_cs<NN>_<slug>/            (directory; main file inside named identically)
 *
 * The numeric portion may carry an optional single lowercase letter suffix
 * (e.g. `cs22b`, `cs15a`) per the WORKBOARD/TRACKING conventions.
 *
 * @param {string} basename
 * @param {'planned'|'active'} stage
 * @returns {{cs: string, slug: string}|null}
 */
function matchCsName(basename, stage) {
  const re = new RegExp(`^${stage}_cs(\\d+[a-z]?)_([a-z0-9][a-z0-9.-]*)$`);
  const m = re.exec(basename.replace(/\.md$/, ''));
  if (!m) return null;
  return { cs: `CS${m[1]}`, slug: m[2] };
}

/**
 * Enumerate planned/active CS listings on disk under a clickstops root.
 *
 * @param {string} clickstopsDir - Absolute path to `project/clickstops`.
 * @returns {{planned: CsListing[], active: CsListing[]}}
 */
export function listClickstops(clickstopsDir) {
  const result = { planned: [], active: [] };
  for (const stage of /** @type {const} */ (['planned', 'active'])) {
    const stageDir = path.join(clickstopsDir, stage);
    if (!existsSync(stageDir)) continue;
    let entries;
    try {
      entries = readdirSync(stageDir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (name === '.gitkeep' || name.startsWith('.')) continue;
      const full = path.join(stageDir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }

      if (st.isFile() && name.endsWith('.md')) {
        const m = matchCsName(name, stage);
        if (!m) continue;
        result[stage].push({
          stage,
          cs: m.cs,
          slug: m.slug,
          entry: path.posix.join(stage, name),
          directoryForm: false,
        });
        continue;
      }

      if (st.isDirectory()) {
        const m = matchCsName(name, stage);
        if (!m) continue;
        const innerMd = path.join(full, `${name}.md`);
        if (!existsSync(innerMd)) continue;
        result[stage].push({
          stage,
          cs: m.cs,
          slug: m.slug,
          entry: path.posix.join(stage, name, `${name}.md`),
          directoryForm: true,
        });
      }
    }
    result[stage].sort((a, b) => a.cs.localeCompare(b.cs, 'en', { numeric: true }));
  }
  return result;
}

/**
 * Compute a snapshot from explicit inputs (no disk reads). Pure function so
 * tests can drive every shape without scratch fixtures.
 *
 * @param {object} args
 * @param {string} args.workboardMd
 * @param {CsListing[]} [args.plannedListings]
 * @param {CsListing[]} [args.activeListings]
 * @param {string|null} [args.agentId]
 * @returns {StatusSnapshot}
 */
export function getStatusSnapshot({
  workboardMd,
  plannedListings = [],
  activeListings = [],
  agentId = null,
}) {
  const activeWorkRows = parseActiveWorkRows(workboardMd);
  return {
    activeWorkRows,
    plannedListings,
    activeListings,
    agentId,
    counts: {
      activeWorkRows: activeWorkRows.length,
      planned: plannedListings.length,
      active: activeListings.length,
    },
  };
}

/**
 * Render a snapshot as a compact human-readable text report.
 *
 * Layout intent:
 *   harness status — agent <id>
 *
 *   Active Work (N):
 *     <CS-Task ID>: <Title> [<State>] owner=<Owner> branch=<Branch> updated=<date>
 *     ...
 *
 *   On-disk active (N):
 *     <CS> — <slug> [dir|flat]  → <entry>
 *     ...
 *
 *   Planned queue (N):
 *     <CS> — <slug>
 *     ...
 *
 * Empty sections render a single "(none)" line so the reader can tell the
 * absence is real rather than a parse failure.
 *
 * @param {StatusSnapshot} s
 * @returns {string} Report ending in a trailing newline.
 */
export function formatStatusReport(s) {
  const lines = [];
  const id = s.agentId ?? '(unknown)';
  lines.push(`harness status — agent ${id}`);
  lines.push('');

  lines.push(`Active Work (${s.activeWorkRows.length}):`);
  if (s.activeWorkRows.length === 0) {
    lines.push('  (none — WORKBOARD Active Work table is empty)');
  } else {
    for (const r of s.activeWorkRows) {
      lines.push(
        `  ${r.csTaskId}: ${r.title} [${r.state}] owner=${r.owner} branch=${r.branch} updated=${r.lastUpdated}`
      );
    }
  }
  lines.push('');

  lines.push(`On-disk active (${s.activeListings.length}):`);
  if (s.activeListings.length === 0) {
    lines.push('  (none — project/clickstops/active is empty)');
  } else {
    for (const a of s.activeListings) {
      const form = a.directoryForm ? 'dir' : 'flat';
      lines.push(`  ${a.cs} — ${a.slug} [${form}] → ${a.entry}`);
    }
  }
  lines.push('');

  lines.push(`Planned queue (${s.plannedListings.length}):`);
  if (s.plannedListings.length === 0) {
    lines.push('  (none — project/clickstops/planned is empty)');
  } else {
    for (const p of s.plannedListings) {
      lines.push(`  ${p.cs} — ${p.slug}`);
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Convenience: read WORKBOARD.md and enumerate planned/active listings off
 * disk, then return a snapshot. The CLI in `bin/harness.mjs` delegates here.
 *
 * @param {object} args
 * @param {string} args.cwd - Repo root containing `WORKBOARD.md` + `project/clickstops/`.
 * @param {string|null} [args.agentId]
 * @returns {StatusSnapshot}
 */
export function getStatusSnapshotFromDisk({ cwd, agentId = null }) {
  const workboardPath = path.join(cwd, 'WORKBOARD.md');
  const workboardMd = existsSync(workboardPath) ? readFileSync(workboardPath, 'utf8') : '';
  const clickstopsDir = path.join(cwd, 'project', 'clickstops');
  const { planned, active } = listClickstops(clickstopsDir);
  return getStatusSnapshot({
    workboardMd,
    plannedListings: planned,
    activeListings: active,
    agentId,
  });
}
