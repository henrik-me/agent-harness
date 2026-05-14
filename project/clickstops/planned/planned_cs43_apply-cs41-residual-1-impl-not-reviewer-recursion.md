# CS43 — Apply CS41 R5 F-residual-1: recurse into nested CS subdirectories in `check-clickstop-implementer-not-reviewer.mjs`

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** Pre-CS43 disposition of [CS41 § R5 Copilot disposition F-residual-1](../done/done_cs41_copilot-engage-cli-and-default-flip.md#r5-copilot-disposition--copilot-r4-review-residuals) (CS41 close-out, 2026-05-14, admin-merged at squash SHA `cd11fbd`). Authored 2026-05-14 by `yoga-ah` per [INSTRUCTIONS.md § Pre-claim gate](../../../INSTRUCTIONS.md#claiming-a-cs).
**Depends on:** None. Independent of CS42 (release v0.5.0); may claim before or after the v0.5.0 cut. **Note (LRN-numbering):** done_cs41 R5 prose cites this residual as "LRN-117" but `LEARNINGS.md` LRN-117 documents the unrelated `cacheDir` null-destructure fix (a different CS41 bug). The canonical reference is the **F-residual-1 anchor** in done_cs41 § R5; this CS does NOT depend on the LEARNINGS.md numbering being reconciled.

## Goal

Make `scripts/check-clickstop-implementer-not-reviewer.mjs` (CS41 deliverable #4) iterate **nested CS subdirectories** under `project/clickstops/{planned,active,done}/`, not just files directly inside those three folders. Today, the linter's main loop (lines 270-276 at HEAD `fa047cd`) skips any directory entry via `if (!entry.isFile()) continue;`, which silently drops every `done_csNN_*.md` file living inside a nested CS subfolder. As of CS41 close-out the harness self-host repo has 4 such nested subfolders:

- `project/clickstops/done/done_cs01_bootstrap-repo/`
- `project/clickstops/done/done_cs11_self-host/`
- `project/clickstops/done/done_cs16_bootstrap-sub-invaders/`
- `project/clickstops/done/done_cs22_cut-harness-v0.2.0/`

These nested subfolders predate the CS35 C35-18 agent-identity doctrine (and therefore predate CS41's `Implementer agent` / `Reviewer agent` columns), so blanket-recursion would flood the linter output with hundreds of warnings against pre-CS35 history. The fix must therefore combine recursion **with** a date-gate (mirror of the existing `CLOSEOUT_TASK_ENFORCEMENT_DATE` and `CHANGELOG_TOUCH_ENFORCEMENT_DATE` patterns in `scripts/check-clickstop.mjs`).

## Background

CS41 shipped `check-clickstop-implementer-not-reviewer` as a self-host-guarded linter that scans `project/clickstops/{active,done}/*.md`, parses each `## Model audit` block, and fails when `Implementer agent` ≡ `Reviewer agent` (case-insensitive). Per CS41 R4 fixes, missing/empty cells produce a one-cycle WARNING under the default `--strict-agent-columns=false`, becoming hard errors when the `--strict-agent-columns` flag is set. CS42 release-cut is the planned point at which this flag flips to default-true (per CS41 C42-6).

The R4 dogfood Copilot review at HEAD `c099ee5` flagged the lines-270-276 flat iteration as a coverage gap. The orchestrator dispositioned this as a deferred residual under `## Plan-vs-implementation review § R5 Copilot disposition F-residual-1` because:

1. The four nested subfolders all close before CS35 C35-18 was ratified, so they do not in fact have `Implementer agent` / `Reviewer agent` columns and a naive recursion would surface only false-positive missing-row warnings.
2. CS41's review budget was already at the bound described by [LRN-120](../../../LEARNINGS.md#lrn-120) (Copilot review cycles are non-converging — accept residuals once two GPT-5.5 plan-vs-impl Gos exist on actual deltas).
3. The fix is a 5-line linter change + an enforcement-date constant + a small fixture set, atomic enough to ship as its own CS.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C43-1 | Iteration strategy | Replace the flat `entries = fs.readdirSync(dirPath, { withFileTypes: true })` + `if (!entry.isFile()) continue;` loop at lines 264-276 with a recursive walk that also descends into subdirectories named `^(planned\|active\|done)_cs\d+[a-z]?_.*$` (the existing CS subfolder naming pattern). Skip any other directory names defensively. | Recursion is necessary; restricting the descent pattern keeps the walker tight and avoids accidentally recursing into a future unrelated subfolder a sibling tool might create. The pattern matches `done_cs01_bootstrap-repo`, `done_cs22_cut-harness-v0.2.0`, etc. |
| C43-2 | Enforcement date | Introduce `IMPLEMENTER_NOT_REVIEWER_RECURSION_ENFORCEMENT_DATE = '2026-05-14'` (CS41 close-out date) at the top of `scripts/check-clickstop-implementer-not-reviewer.mjs`. Files whose `**Closed:**` date (for done) parses to a date strictly **before** this constant are skipped entirely (not warned, not errored). CS files whose closed-date is at-or-after the constant — or which are still active/planned — are linted. The four named pre-CS35 subfolders are all closed well before 2026-05-14, so this gates them out cleanly. | Mirrors the `CLOSEOUT_TASK_ENFORCEMENT_DATE` pattern at `scripts/check-clickstop.mjs:48` and the `CHANGELOG_TOUCH_ENFORCEMENT_DATE` pattern (CS24 C24-4). Avoids retroactively flagging the entire backlog. |
| C43-3 | Active/planned files inside nested dirs | Active/planned CS files inside nested subfolders (none exist today, but might in the future) are ALWAYS linted regardless of date — the date-gate only applies to `**Status:** done` files. | Active and planned files have no `**Closed:**` date to compare against; the safe default for forward work is "lint always". |
| C43-4 | Failure mode for unparseable closed-date | If a `done_csNN_*.md` file's `**Closed:**` line is missing or unparseable as a date, log a single WARNING (not error) and skip that file. | The recursion-gate is a hygiene improvement, not a correctness gate; a malformed close-out file is already a separate `check-clickstop` finding and shouldn't be double-reported here. |
| C43-5 | Test approach | Fixtures under `tests/fixtures/cs43/`: (a) `done/done_cs99_pre-enforcement/done_cs99_thing.md` with a `**Closed:**` date predating the constant — verify it is silently skipped; (b) `done/done_cs100_post-enforcement/done_cs100_thing.md` with a `**Closed:**` date after the constant + missing model-audit columns — verify it produces a missing-row warning under default flags AND a hard error under `--strict-agent-columns`; (c) `active/active_cs101_thing/active_cs101_thing.md` — verify it is always linted regardless of date; (d) `done/done_cs102_unparseable/done_cs102_thing.md` with a `**Closed:** TBD` value — verify the per-file WARNING + skip semantics. Plus 1 fixture demonstrating the existing flat-iteration path still works. Minimum 5 fixture-based tests. | Standard fixture-test pattern; one valid + one invalid per code path. |
| C43-6 | Coordinated docs | No OPERATIONS.md change required; this is a pure linter coverage extension. CHANGELOG.md `[Unreleased] / Changed` gains a one-bullet note: "`check-clickstop-implementer-not-reviewer` now recurses into CS subdirectories with a date-gated grandfather (CS43)." | Behaviour change is small enough that a doc subsection isn't warranted; the CHANGELOG bullet is the audit trail. |
| C43-7 | Forward-compat for CS42 strict-flip | When CS42 flips `--strict-agent-columns` to default-true (per C42-6), this CS's date-gate continues to apply: pre-2026-05-14 done files remain grandfathered. CS42's strict-flip therefore intersects only with post-CS41 done files (CS42's own + any future CSs), which all ship with the agent-identity columns by construction. | Avoids surprising CS42 with a fleet of missing-column hard errors against pre-CS41 history. |

## Deliverables

1. **Linter extension:** `scripts/check-clickstop-implementer-not-reviewer.mjs` — replace the flat directory-walk loop at lines 260-276 with a recursive walker per C43-1. Add the `IMPLEMENTER_NOT_REVIEWER_RECURSION_ENFORCEMENT_DATE` constant per C43-2. Add a small `parseClosedDate(content)` helper that extracts and parses the `**Closed:**` line; returns `null` on missing/malformed input (handled by C43-4 semantics).
2. **Fixture set:** `tests/fixtures/cs43/{a-pre-enforcement,b-post-enforcement-missing-cols,c-active-nested,d-done-unparseable-close-date,e-flat-iteration-preserved}/...md` — 5 fixtures total per C43-5.
3. **Test file:** `tests/cs43-impl-not-reviewer-recursion.test.mjs` — minimum 5 tests, one per fixture per C43-5. Cover both default and `--strict-agent-columns` modes for fixture (b).
4. **CHANGELOG.md** entry under `## [Unreleased]` `### Changed`: per C43-6.
5. **Self-verify:** re-run `node scripts/check-clickstop-implementer-not-reviewer.mjs --dir project/clickstops` against the live harness self-host repo and confirm the 4 named pre-CS35 nested subfolders produce ZERO findings (grandfathering works), while any future CS subfolder would be linted.

## Sub-agent fan-out

Single-CS scope; orchestrator-owned. No fan-out warranted (linter extension + 5 fixtures + 1 test file + 1 CHANGELOG bullet fits cleanly within one orchestrator session).

## Exit criteria

CS43 close-out is permitted only when **all** of the following are true and recorded in the active CS file's `## Plan-vs-implementation review` section:

1. `scripts/check-clickstop-implementer-not-reviewer.mjs` recurses into CS subdirectories per C43-1, with the date-gate per C43-2/C43-3/C43-4.
2. All 5 (or more) fixture-based tests pass.
3. `node --test tests/*.test.mjs` exits 0; total test count is `prior + ≥5`.
4. `node bin/harness.mjs lint --quiet` exits 0 (≥29 pass / 0 fail / 3 skipped baseline as of CS41 close-out).
5. `node bin/harness.mjs sync --mode=check --cwd .` reports `No drift detected`.
6. Manual self-verify per Deliverable #5 confirms grandfathering against the 4 pre-CS35 nested subfolders.
7. CHANGELOG.md `[Unreleased] / Changed` lists this enforcement.
8. `## Plan-vs-implementation review` records at least one GPT-5.5 plan-vs-impl review with verdict Go (per CS35 doctrine).

## Risks + open questions

- **R1 (low):** A pre-CS35 nested subfolder might be re-touched (e.g. typo fix in an old `done_cs01_*.md`). The closed-date in the file content does not change on a touch, so the file remains grandfathered. Acceptable.
- **R2 (low):** A future CS could use a non-`done`/`active`/`planned` prefix on a nested subfolder (e.g. `archived_csNN_*`). C43-1's pattern restricts descent to the three known prefixes, so unfamiliar subfolders are silently skipped. If that becomes a coverage gap, broaden the regex in a follow-up CS.
- **OQ1 (defer to claim time):** Should the date-gate constant live in `lib/clickstop-utils.mjs` (shared with `scripts/check-clickstop.mjs`'s existing date constants) or remain local to `scripts/check-clickstop-implementer-not-reviewer.mjs`? Default: local — this constant has different semantics ("recursion gate" vs "tasks-row-required gate"). Promote to shared lib only if a third linter introduces the same pattern.

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per [OPERATIONS.md § Claim](../../../OPERATIONS.md#claim)) | planned | — | — |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
