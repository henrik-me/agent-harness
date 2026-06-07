/**
 * lib/harvest.mjs — learnings harvest gate (CS63 decision C63-4).
 *
 * Deterministic, network-free scan of LEARNINGS.md for `open` learnings that
 * need disposition, backing two cadences (INSTRUCTIONS.md § Harvest Cadence):
 *
 *   - `pre-claim` (bounded, default): surfaces only **stale** `open` learnings
 *     that are tagged/categorised `process`/`architectural` OR whose
 *     `claim_area` matches the area being claimed. Silent when none match —
 *     so it never nags before an unrelated claim.
 *   - `weekly`: surfaces **all** `open` learnings for the weekly sweep.
 *
 * The harness advertises this gate in INSTRUCTIONS.md (§ Per-CS Loop step 1 /
 * § Harvest Cadence) but `harness harvest` is currently a stub
 * (`bin/harness.mjs` `cmdHarvest`). This module is the real implementation the
 * CLI delegates to; it is a pure function over the file text + an injected
 * `now`, so it is fully unit-testable without touching the clock, network, or
 * filesystem. Zero runtime dependencies beyond `lib/doc-schema.mjs` (the same
 * frontmatter parser the rest of the linter family uses).
 *
 * Exit-code doctrine (applied by the CLI, not this module): the gate is
 * **advisory** — `harvestExitCode(result)` returns 0 by default so a stale
 * learning never wedges a claim; pass `{ strict: true }` to make outstanding
 * candidates a hard failure (exit 1).
 *
 * @module lib/harvest.mjs
 */

import { parseFrontmatterBlocks } from './doc-schema.mjs';

/** Default staleness threshold (days) for the bounded pre-claim cadence. */
export const DEFAULT_STALE_DAYS = 14;

/** Milliseconds in a day. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `category`/`tag` values that make an `open` learning relevant to the bounded
 * pre-claim gate regardless of the area being claimed (INSTRUCTIONS.md §
 * Harvest Cadence "Before-Claim").
 */
const PROCESS_ARCH = new Set(['process', 'architectural']);

/**
 * Whole-day age of an ISO `YYYY-MM-DD` date relative to `now`.
 *
 * @param {string|undefined} dateStr - ISO date string from the entry frontmatter.
 * @param {Date} now - Reference instant (injected for deterministic tests).
 * @returns {number|null} Whole days elapsed, or null if the date is unparseable.
 */
export function ageInDays(dateStr, now) {
  if (typeof dateStr !== 'string') return null;
  const ms = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(ms)) return null;
  return Math.floor((now.getTime() - ms) / DAY_MS);
}

/**
 * Scan parsed LEARNINGS.md frontmatter for open learnings needing disposition.
 *
 * @param {string} markdownText - Raw LEARNINGS.md content.
 * @param {object} [opts]
 * @param {Date}   [opts.now] - Reference instant (default: new Date()).
 * @param {number} [opts.staleDays] - Pre-claim staleness threshold (default: 14).
 * @param {string|null} [opts.claimArea] - Area being claimed; matched against
 *        each entry's `claim_area` in pre-claim mode (default: null).
 * @param {'pre-claim'|'weekly'} [opts.mode] - Cadence (default: 'pre-claim').
 * @returns {{
 *   mode: string, staleDays: number, claimArea: string|null,
 *   counts: { open: number, candidates: number },
 *   candidates: Array<{
 *     id: string, date: string, category: string, tags: string[],
 *     claimArea: string|null, ageDays: number|null, lineNumber: number,
 *     reasons: string[]
 *   }>
 * }}
 */
export function harvestLearnings(markdownText, opts = {}) {
  const {
    now = new Date(),
    staleDays = DEFAULT_STALE_DAYS,
    claimArea = null,
    mode = 'pre-claim',
  } = opts;

  const blocks = parseFrontmatterBlocks(markdownText);
  const openBlocks = blocks.filter(
    (b) => !b.parseError && b.parsed && b.parsed.status === 'open'
  );

  const candidates = [];
  for (const block of openBlocks) {
    const p = block.parsed;
    const tags = Array.isArray(p.tags) ? p.tags : [];
    const age = ageInDays(p.date, now);
    const stale = age != null && age >= staleDays;
    const taggedProcessArch =
      PROCESS_ARCH.has(p.category) || tags.some((t) => PROCESS_ARCH.has(t));
    const matchesClaimArea = claimArea != null && p.claim_area === claimArea;

    const reasons = [];
    if (mode === 'weekly') {
      reasons.push('open');
    } else {
      if (stale && taggedProcessArch) {
        reasons.push(`stale-open (${age}d) — ${PROCESS_ARCH.has(p.category) ? `category=${p.category}` : 'tagged process/architectural'}`);
      }
      if (stale && matchesClaimArea) {
        reasons.push(`stale-open (${age}d) — claim_area=${claimArea}`);
      }
    }

    if (reasons.length > 0) {
      candidates.push({
        id: p.id,
        date: p.date,
        category: p.category,
        tags,
        claimArea: p.claim_area ?? null,
        ageDays: age,
        lineNumber: block.lineNumber,
        reasons,
      });
    }
  }

  return {
    mode,
    staleDays,
    claimArea,
    counts: { open: openBlocks.length, candidates: candidates.length },
    candidates,
  };
}

/**
 * Render a harvest result as human-readable text. Silent (a single
 * informational line) when there are no candidates, so the bounded pre-claim
 * gate stays quiet before an unrelated claim.
 *
 * @param {ReturnType<typeof harvestLearnings>} result
 * @returns {string} Multi-line report ending in a trailing newline.
 */
export function formatHarvestReport(result) {
  if (result.candidates.length === 0) {
    return result.mode === 'weekly'
      ? 'harvest: no open learnings to disposition.\n'
      : 'harvest: no stale open learnings require pre-claim disposition.\n';
  }

  const lines = [];
  const header =
    result.mode === 'weekly'
      ? `harvest: ${result.counts.candidates} open learning(s) to disposition (weekly sweep):`
      : `harvest: ${result.counts.candidates} stale open learning(s) need pre-claim disposition` +
        `${result.claimArea ? ` (claim_area=${result.claimArea})` : ''}:`;
  lines.push(header);

  for (const c of result.candidates) {
    const age = c.ageDays == null ? 'age?' : `${c.ageDays}d`;
    lines.push(`  - ${c.id} (${c.category}, ${age}, line ${c.lineNumber}): ${c.reasons.join('; ')}`);
  }

  lines.push('  Disposition each: apply | file-cs | obsolete | defer | skip-for-this-CS.');
  return lines.join('\n') + '\n';
}

/**
 * Advisory-by-default exit code for the CLI. Returns 0 unless `strict` is set
 * and outstanding candidates remain — a buggy or noisy harvest must never wedge
 * a claim (CS63 risk R4).
 *
 * @param {ReturnType<typeof harvestLearnings>} result
 * @param {object} [opts]
 * @param {boolean} [opts.strict] - Treat outstanding candidates as a failure.
 * @returns {0|1}
 */
export function harvestExitCode(result, opts = {}) {
  if (opts.strict && result.candidates.length > 0) return 1;
  return 0;
}
