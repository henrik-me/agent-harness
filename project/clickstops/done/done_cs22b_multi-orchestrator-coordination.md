# CS22b — Multi-orchestrator coordination

> **⚠️ Closed obsolete — never implemented.** Per the 2026-06-09 pre-claim
> backlog-disposition pass (orchestrator `omni-ah-c2`, repo HEAD `0f434c7`),
> CS22b is closed without producing any of the planned CLI subcommands,
> WORKBOARD schema additions, or linter changes. The plan proposed
> mechanical infrastructure for safe multi-orchestrator parallelism
> (`harness reserve-lrn`, `harness lock`, `harness release`,
> `harness pre-claim`, `check-lrn-ranges`, multi-row Active Work in
> `check-workboard`, WORKBOARD `## LRN ranges` + `## Area locks`
> sections). **Discipline-only multi-orchestration has won in practice:**
>
> - **Multi-orch is already the operating mode.** `WORKBOARD.md` registers
>   five orchestrators (`omni-ah`, `omni-ah-c2`, `yoga-ah`, `yoga-ah-c2`,
>   `yoga-ah-c3`) on two machines / multiple clones. The ecosystem of CSs
>   claimed and closed across that period shows no LRN reporting an LRN-ID
>   collision, a file race attributable to cross-orchestrator overlap, or
>   an Active Work double-claim. The CS35b plan-review-attestation arc, the
>   CS41 independence invariant, the CS48 implementer-not-reviewer linter,
>   the CS50 workboard admin-bypass, CS54/CS54b/CS55/CS56 cross-repo
>   handoff doctrine, and the CS63 hardening arc were all delivered under
>   the discipline-only model without the CS22b infrastructure.
> - **None of the proposed CLI surface was built and nothing has called
>   for it.** No CS in the v0.3.0 → v0.8.0 arc has invoked
>   `harness reserve-lrn`, `harness lock`, `harness release`, or
>   `harness pre-claim`. LRN-122 (CS42-7 grandfather sweep) lists CS22b
>   as part of the pre-CS35b backlog that needs disposition — but the
>   subsequent multi-orch arc has not produced a single LRN citing
>   absence of these primitives as a blocker.
> - **The one remaining real defect is doc drift, not missing CLI.**
>   `CONTEXT.md § Parallelism` still claims "single-orchestrator default".
>   That doc surface is genuinely out of step with reality and should be
>   rewritten in a small follow-up if/when an orchestrator picks it up;
>   it does not need the CS22b CLI infrastructure to fix.
>
> If a real cross-orchestrator race is observed in the future, file a
> *new* tightly-scoped CS targeting the specific observed defect rather
> than reviving this plan's full 5-sub-agent wave. The plan body below is
> preserved verbatim for historical context.
>
> See PR for the disposition trail.

**Status:** done
**Owner:** omni-ah-c2
**Branch:** chore/disposition-cs20s-backlog
**Started:** 2026-06-09
**Closed:** 2026-06-09
**Filed by:** Pre-CS16 doc-state audit. Captures the parallel-orchestrator model discussed in [`CONTEXT.md`](../../../CONTEXT.md) § Parallelism and [`OPERATIONS.md`](../../../OPERATIONS.md).
**Depends on:** CS22 — **done** ([`v0.2.0`](https://github.com/henrik-me/agent-harness/releases/tag/v0.2.0) tagged and published; the CS16 pin target; CS file under [`project/clickstops/done/`](../done/done_cs22_cut-harness-v0.2.0/)). Dependency satisfied; public flip (CS15a) is likewise done, so no remaining blocker. (Note: the `done_cs22` file header still reads `Status: active` — a stale close-out artefact; the published `v0.2.0` tag is the authoritative completion evidence.)

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
- Update `CONTEXT.md` § Parallelism to remove the "single orchestrator default" caveat once this CS lands.
- Add `template/composed/OPERATIONS.md` § Multi-orchestrator section with worked examples (lane split, parallel backlog CSs).

### Tests

- Fixture tests for `harness reserve-lrn`, `harness lock`, `harness release`.
- `check-workboard` regression: multi-row Active Work passes; duplicate CS-Task ID fails; overlapping branch fails.
- `check-lrn-ranges` regression.
- End-to-end: simulate two orchestrators in tmpdirs, both pre-claim, allocate LRN ranges, acquire non-overlapping locks, file LRN entries — assert no conflict.

## Exit criteria

- All new linters and CLI subcommands pass `harness lint`.
- Multi-orchestrator end-to-end test green.
- CONTEXT.md / OPERATIONS.md updated to reflect parallel-default mode.
- Cumulative LRN dispatch count maintained (zero violations from the new flow).

## Sub-agent fan-out

**5 sub-tasks with explicit disjoint file ownership** per [LRN-016](../../../LEARNINGS.md#lrn-016). State source-of-truth is **WORKBOARD.md** (not separate JSON files) — keeps coordination state in the one file orchestrators already read.

| # | Sub-agent | Owned files |
|---|-----------|-------------|
| 1 | `cs22b-lrn-lib` | `lib/lrn-ranges.mjs` (parse/serialize WORKBOARD `## LRN ranges` table; allocator logic), `tests/lrn-ranges.test.mjs`, `tests/fixtures/cs22b/lrn-ranges/*` |
| 2 | `cs22b-locks-lib` | `lib/area-locks.mjs` (parse/serialize WORKBOARD `## Area locks` table; lock acquire/release/expiry logic), `tests/area-locks.test.mjs`, `tests/fixtures/cs22b/area-locks/*` |
| 3 | `cs22b-checkers` | `scripts/check-lrn-ranges.mjs` + tests + fixtures (validates `LEARNINGS.md` entries fall in reserved ranges); UPDATES to `scripts/check-workboard.mjs` + its tests (multi-row Active Work; duplicate CS-Task ID detection; overlapping branch detection) |
| 4 | `cs22b-cli` | UPDATES to `bin/harness.mjs` only: 4 new subcommands (`reserve-lrn`, `lock`, `release`, `pre-claim`) — calls into `lib/lrn-ranges.mjs` and `lib/area-locks.mjs` from sub-agents 1 and 2; `tests/cli.test.mjs` additions for the new subcommands |
| 5 | `cs22b-docs` | UPDATES to `template/composed/OPERATIONS.md` (§ Multi-orchestrator section; § Claim updated for new pre-claim flow), `CONTEXT.md` (update parallelism section to remove single-orchestrator caveat), `template/managed/INSTRUCTIONS.md` (add multi-orchestrator quick-ref) |

**Dispatch order:** Sub-agents 1 and 2 in **wave A** (independent libs). Sub-agents 3, 4, 5 in **wave B** (after wave A completes — they read the wave-A APIs). Per [LRN-016](../../../LEARNINGS.md#lrn-016), wave-B sub-agents must NOT modify wave-A files; only consume their exports.

Briefings MUST include all standard guards (no-commit preflight per [LRN-021](../../../LEARNINGS.md#lrn-021), schema source-of-truth per [LRN-039](../../../LEARNINGS.md#lrn-039), `requireValue` per [LRN-040](../../../LEARNINGS.md#lrn-040), explicit `--file` per [LRN-032](../../../LEARNINGS.md#lrn-032)).

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.7-xhigh | rubber-duck dispatched (orchestrator: yoga-ah) | b49116499e80 | 2026-05-14T04:50:00Z | Go-with-amendments | CS22b grandfather attestation per CS42-7 strict-flip self-host validation. Pre-CS35b backlog; plan content unchanged; backfill only. |
## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| Close-out: docs + restart state — update WORKBOARD.md (no row to remove; closed pre-claim) and CONTEXT.md to reflect CS22b closed obsolete | done | omni-ah-c2 | disposition pass 2026-06-09 |
| Close-out: learnings + follow-ups — no learnings generated; no follow-up CSs filed (obsolete-without-implementation) | done | omni-ah-c2 | disposition pass 2026-06-09 |

## Notes / Learnings

Closed obsolete without implementation per the 2026-06-09 backlog-disposition
pass. No CLI subcommands, WORKBOARD schema additions, or linters were
produced. See the disposition banner at the top of this file for the
rationale.

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.7-1m-internal |
| Reviewer model | gpt-5.5 |
| Implementer agent | omni-ah-c2 |
| Reviewer agent | rubber-duck (orchestrator: omni-ah-c2) |
| Notes | Closed obsolete without implementation — no plan code/content was authored. The "implementer" row reflects the orchestrator/model that performed the close-out disposition itself (banner + headers + Tasks); the "reviewer" row reflects the standard rubber-duck that reviews the disposition PR. Independence invariant trivially holds (claude-opus-4.7-1m-internal ≠ gpt-5.5). CS22b is not on the high-risk CS list. |

## Plan-vs-implementation review

**Reviewer:** n/a — not implemented
**Date:** 2026-06-09
**Outcome:** Closed obsolete without implementation per the 2026-06-09
pre-claim backlog-disposition pass (orchestrator `omni-ah-c2`). No
implementation against this plan was ever attempted, so a substantive
plan-vs-implementation review is not applicable. The disposition rationale
is recorded in the banner at the top of this file and in `CONTEXT.md`.
