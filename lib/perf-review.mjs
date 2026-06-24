/**
 * lib/perf-review.mjs — `harness perf-review <pr>` core (CS66 decision C66-4,
 * wave 2).
 *
 * A performance review pass dispatching an independent reviewer with a concrete
 * perf checklist scoped to the PR diff; emits the canonical reviewer-output
 * shape; advisory by default (plan C66-6). Thin wrapper over
 * runChecklistReview.
 */

import { runChecklistReview } from './review-checklist.mjs';

/**
 * Concrete, enumerated performance checklist (plan C66-4). Scoped to the PR
 * diff so it stays actionable rather than a generic audit (risk R3).
 */
export const PERF_REVIEW_CHECKLIST = Object.freeze([
  {
    id: 'P1',
    title: 'Hot-path allocations.',
    detail: 'No avoidable per-iteration object/array/string allocations on hot or frequently-called paths.',
  },
  {
    id: 'P2',
    title: 'Algorithmic complexity.',
    detail: 'No accidental quadratic (or worse) loops; data-structure choice matches access pattern.',
  },
  {
    id: 'P3',
    title: 'N+1 / repeated IO.',
    detail: 'No N+1 query/network/filesystem patterns; batch or cache repeated IO.',
  },
  {
    id: 'P4',
    title: 'Sync-in-async.',
    detail: 'No blocking/synchronous calls (sync fs, spawnSync, busy-wait) inside async/hot paths.',
  },
  {
    id: 'P5',
    title: 'Unbounded growth.',
    detail: 'No unbounded caches, buffers, queues, or recursion that can grow without limit.',
  },
]);

/**
 * Run the performance review. Same opts/return contract as runChecklistReview
 * (see lib/review-checklist.mjs).
 */
export async function runPerfReview(opts = {}) {
  return runChecklistReview({ ...opts, verb: 'perf-review', checklist: PERF_REVIEW_CHECKLIST });
}
