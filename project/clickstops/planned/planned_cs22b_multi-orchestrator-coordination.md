# CS22b — Multi-orchestrator coordination

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** Docs/handoff PR (alongside HANDOFF.md). Captures the parallel-orchestrator model discussed in [`HANDOFF.md`](../../../HANDOFF.md) § Parallelism and [`CONTEXT.md`](../../../CONTEXT.md) § Parallelism.
**Depends on:** CS22 (or after CS15b public flip — TBD)

## Goal

Enable safe true-parallel orchestration: multiple agent IDs working on different CSs concurrently without races on shared mutable state (WORKBOARD, LEARNINGS.md numbering, file-area ownership). Today the discipline-only model assumes a single mainline orchestrator; this CS adds the infrastructure to make multi-orchestrator the default safe mode.

## Background

- Decision #20c already supports multiple agent IDs per machine via the `-c<N>` clone suffix (`yoga-ah-c2`, `yoga-ah-c3`).
- Sub-agents within a session run in parallel (proven 9-way via [LRN-052](../../../LEARNINGS.md#lrn-052) and [LRN-058](../../../LEARNINGS.md#lrn-058)) — but only one orchestrator is in flight on the mainline at a time.
- WORKBOARD's `## Active Work` table allows multiple rows by schema, but orchestrator discipline keeps it single-row.
- The mainline plan is largely sequential (CS11 needs CS10, etc.), but deferred backlog CSs (CS03b, CS04a/b/c/d, CS06b, CS08b, CS09b) target narrow disjoint areas — these are natural parallel candidates.

## Deliverables

### LRN range allocation (mechanical)

- New WORKBOARD section `## LRN ranges` listing reservations: `| Orchestrator | CS | Reserved IDs | Status |`.
- New `harness reserve-lrn --orchestrator <id> --cs <CSref> --count <N>` subcommand: atomically allocates the next N LRN IDs in WORKBOARD and returns the range. Other orchestrators must not use IDs in another's reservation.
- New linter `check-lrn-ranges.mjs`: validates that any LRN entry in `LEARNINGS.md` falls within a reserved range (or is unreserved-and-monotonic for backwards compat).

### File-area locks (mechanical)

- New WORKBOARD section `## Area locks` listing reservations: `| Orchestrator | CS | Path glob | Acquired | Expires |`.
- New `harness lock <area-glob> --cs <CSref> --hours <N>` subcommand: claims a path glob area for a bounded time. Returns 1 if conflict.
- New `harness release <area-glob>` subcommand.
- Locks expire automatically; orchestrators must re-acquire if work runs long.

### Multi-row Active Work (discipline + linter update)

- Update `check-workboard.mjs`: allow multiple Active Work rows; reject duplicate `CS-Task ID` values; reject overlapping branch names.
- Update `template/composed/OPERATIONS.md` § Claim to describe the multi-orchestrator claim flow (check existing claims; allocate LRN range; acquire area lock).

### Conflict detection (mechanical)

- Pre-claim check: `harness pre-claim --cs <CSref>` — exits 1 if WORKBOARD shows another orchestrator with overlapping area lock or working on the same CS.
- Pre-PR check: orchestrator must verify no commits to overlapping locked areas have landed since their lock acquisition (rebase or release-and-reclaim).

### Documentation

- Update `template/composed/OPERATIONS.md` § Sub-agent dispatch with cross-orchestrator coordination patterns.
- Update `HANDOFF.md` to remove the "single orchestrator default" caveat once this CS lands.
- Add `template/composed/OPERATIONS.md` § Multi-orchestrator section with worked examples (lane split, parallel backlog CSs).

### Tests

- Fixture tests for `harness reserve-lrn`, `harness lock`, `harness release`.
- `check-workboard` regression: multi-row Active Work passes; duplicate CS-Task ID fails; overlapping branch fails.
- `check-lrn-ranges` regression.
- End-to-end: simulate two orchestrators in tmpdirs, both pre-claim, allocate LRN ranges, acquire non-overlapping locks, file LRN entries — assert no conflict.

## Exit criteria

- All new linters and CLI subcommands pass `harness lint`.
- Multi-orchestrator end-to-end test green.
- HANDOFF.md / CONTEXT.md / OPERATIONS.md updated to reflect parallel-default mode.
- Cumulative LRN dispatch count maintained (zero violations from the new flow).

## Sub-agent fan-out

**5 sub-tasks with explicit disjoint file ownership** per [LRN-016](../../../LEARNINGS.md#lrn-016). State source-of-truth is **WORKBOARD.md** (not separate JSON files) — keeps coordination state in the one file orchestrators already read.

| # | Sub-agent | Owned files |
|---|-----------|-------------|
| 1 | `cs22b-lrn-lib` | `lib/lrn-ranges.mjs` (parse/serialize WORKBOARD `## LRN ranges` table; allocator logic), `tests/lrn-ranges.test.mjs`, `tests/fixtures/cs22b/lrn-ranges/*` |
| 2 | `cs22b-locks-lib` | `lib/area-locks.mjs` (parse/serialize WORKBOARD `## Area locks` table; lock acquire/release/expiry logic), `tests/area-locks.test.mjs`, `tests/fixtures/cs22b/area-locks/*` |
| 3 | `cs22b-checkers` | `scripts/check-lrn-ranges.mjs` + tests + fixtures (validates `LEARNINGS.md` entries fall in reserved ranges); UPDATES to `scripts/check-workboard.mjs` + its tests (multi-row Active Work; duplicate CS-Task ID detection; overlapping branch detection) |
| 4 | `cs22b-cli` | UPDATES to `bin/harness.mjs` only: 4 new subcommands (`reserve-lrn`, `lock`, `release`, `pre-claim`) — calls into `lib/lrn-ranges.mjs` and `lib/area-locks.mjs` from sub-agents 1 and 2; `tests/cli.test.mjs` additions for the new subcommands |
| 5 | `cs22b-docs` | UPDATES to `template/composed/OPERATIONS.md` (§ Multi-orchestrator section; § Claim updated for new pre-claim flow), `HANDOFF.md` (remove single-orchestrator caveat), `CONTEXT.md` (update parallelism section), `template/managed/INSTRUCTIONS.md` (add multi-orchestrator quick-ref) |

**Dispatch order:** Sub-agents 1 and 2 in **wave A** (independent libs). Sub-agents 3, 4, 5 in **wave B** (after wave A completes — they read the wave-A APIs). Per [LRN-016](../../../LEARNINGS.md#lrn-016), wave-B sub-agents must NOT modify wave-A files; only consume their exports.

Briefings MUST include all standard guards (no-commit preflight per [LRN-021](../../../LEARNINGS.md#lrn-021), schema source-of-truth per [LRN-039](../../../LEARNINGS.md#lrn-039), `requireValue` per [LRN-040](../../../LEARNINGS.md#lrn-040), explicit `--file` per [LRN-032](../../../LEARNINGS.md#lrn-032)).

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per OPERATIONS.md § Claim) | planned | — | — |

## Notes / Learnings

(filled during execution)
