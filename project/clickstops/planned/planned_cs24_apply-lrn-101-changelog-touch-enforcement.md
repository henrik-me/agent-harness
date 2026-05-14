# CS24 — Apply LRN-101: mechanically enforce CHANGELOG-touch task on distributed-surface CSs

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** Pre-CS16 disposition of [LRN-101](../../../LEARNINGS.md#lrn-101) (CS22 close-out, 2026-05-10) per the [INSTRUCTIONS.md § Pre-claim gate](../../../INSTRUCTIONS.md#claiming-a-cs). Authored 2026-05-11 by `yoga-ah`. The LRN's recommended fix is two-pronged: (a) **pilot** CHANGELOG-on-every-CS-close-out in CS16 + CS21 (handled at those CSs' close-outs by adding a CHANGELOG-touch row to their `## Tasks` tables), and (b) **enforce** mechanically by extending `scripts/check-clickstop.mjs`. This CS handles part (b). Until CS24 lands, the convention is honour-system only.
**Depends on:** Should land **after** at least one pilot CS close-out (CS16 or CS21) so the convention has been exercised before the linter starts requiring it. Recommended order: CS16 close-out → CS21 close-out → CS24 claim. May claim earlier if the pilot LRNs from CS16/CS21 invalidate the design here, in which case re-author this plan first.

## Goal

Extend `scripts/check-clickstop.mjs` so that any active or done CS file whose deliverables touch the **distributed harness surface** (`template/`, `lib/`, `scripts/`, `bin/`, `scaffolds/`, `schemas/`, or package metadata `package.json` / `package-lock.json` / the `files` allowlist) **must** include an explicit CHANGELOG-touch row in its `## Tasks` table. CSs that touch only repo-internal artefacts (e.g. `LEARNINGS.md`, `CONTEXT.md`, `WORKBOARD.md`, `RETROSPECTIVES.md`, planned CS files) are exempt.

## Background

Per [LRN-101](../../../LEARNINGS.md#lrn-101) (verbatim summary):

- CS22 (Cut harness v0.2.0) ran a retroactive 57-commit audit to reconcile the CHANGELOG before tagging. Cost: ~6 min sub-agent run + a re-dispatch + an anchor-drift reconciliation at close-out (audit table 56 rows vs. tag pointing at the 57th, the content squash).
- The cheaper alternative is **CHANGELOG-on-every-CS-close-out**: the source CS adds entries to `[Unreleased]` as part of its own close-out PR, eliminating the retroactive sweep entirely.
- CS22 LRN explicitly recommends piloting in CS21 + CS16 (handled separately) and mechanically enforcing via `check-clickstop` (this CS).

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C24-1 | Distributed-surface path glob | The exact path globs are: `template/**`, `lib/**`, `scripts/**` (`*.mjs`), `bin/**`, `scaffolds/**`, `schemas/**`, `package.json`, `package-lock.json`. The `excluded[]` list in `harness.config.json` is consulted: paths the consumer/self-host explicitly excludes from sync are NOT considered distributed surface (since they don't ship). | Mirrors C21-5's enumeration exactly. The `excluded[]` consultation prevents false positives on self-host repos that exclude harness-internal files. |
| C24-2 | Detection method | Parse the active/done CS file's `## Deliverables` section for path-like tokens (regex `[\w./-]+\.(?:m?js\|json\|md\|yml\|yaml)` plus directory-like tokens ending in `/`). For each token matching a distributed-surface glob, the CS is "distributed-touching" and the CHANGELOG-touch task row is required. | Reading the *plan*, not the *diff*, keeps the linter pure-static (no git context required) and means it can run on planned files too as a sanity check. Using glob-match avoids brittle string-comparison. |
| C24-3 | Required task-row predicate | The Tasks table must include at least one row matching the regex `/changelog/i` AND `/(touch\|update\|entry\|bullet\|append\|add)/i` in the same row. (Mirror of the existing close-out-task-row predicate in `requiresCloseoutTasks` / `checkCloseoutTasks` at lines 164–215.) | Parallels the existing close-out-task pattern; reviewer cognitive load stays low. |
| C24-4 | Enforcement date | Apply the new check only to CS files whose `**Closed:**` date (for done) or filename-implied-active-state (for active) is **on or after** CS24's close-out date. Done files closed before CS24 are grandfathered. Mirrors the `CLOSEOUT_TASK_ENFORCEMENT_DATE` pattern at line 48 of `check-clickstop.mjs`. | Avoids retroactively flagging the entire backlog of done CSs (CS01–CS23 at minimum). Exact date is set in the linter at the CS24 content PR. |
| C24-5 | Test approach | Fixtures under `tests/fixtures/cs24/`: 4 valid (touches distributed surface + has CHANGELOG row; touches distributed surface + grandfathered date; touches only internal docs + no CHANGELOG row; touches only internal docs + has CHANGELOG row anyway), 4 invalid (touches distributed surface + missing CHANGELOG row + post-enforcement-date for each of: active, done-recently, done-with-no-Tasks-section, done-with-CHANGELOG-but-misnamed-row). Minimum 8 fixture-based tests. | Standard fixture-test pattern for `check-*` linters; one valid + one invalid per code path keeps the test surface tight. |
| C24-6 | Rendered template propagation | After updating `template/composed/OPERATIONS.md` to document the new requirement (see deliverable #4), run `harness sync --mode=apply` to refresh root `OPERATIONS.md` + `.harness-lock.json`. Use `--resolved-sha` per [LRN-070](../../../LEARNINGS.md#lrn-070) since CS24 touches both `template/` and root `OPERATIONS.md` in one commit. | Standard self-host workflow; same pattern as CS03c, CS06c, CS08c, CS15f. |
| C24-7 | LRN-101 status flip | At CS24 close-out, flip [LRN-101](../../../LEARNINGS.md#lrn-101) frontmatter `status: open` → `applied` and append a "Disposition update" line referencing the CS24 close-out commit SHA + the CS16/CS21 pilot evidence. | Standard learning-lifecycle disposition. |

## Deliverables

1. **Linter extension:** `scripts/check-clickstop.mjs` — add a new check function `checkChangelogTouchTask(content, subdir, basename)` modeled on `checkCloseoutTasks` (lines 178–215). Wire it into `checkFile` after the existing close-out-task check. Add the new constant `CHANGELOG_TOUCH_ENFORCEMENT_DATE` (CS24 close-out date) alongside the existing `CLOSEOUT_TASK_ENFORCEMENT_DATE` at line 48.
2. **Helper module** (only if the implementation grows beyond ~40 lines): `lib/distributed-surface-globs.mjs` exporting `DISTRIBUTED_SURFACE_GLOBS` and `matchesDistributedSurface(path, excludedList)`. Per the [INSTRUCTIONS.md § When to Add a Library Module](../../../INSTRUCTIONS.md#when-to-add-a-library-module) rule, only extract if used by ≥ 2 callers.
3. **Fixture set:** `tests/fixtures/cs24/valid-{touches-distributed-with-changelog,grandfathered,internal-only-no-changelog,internal-only-with-changelog}.md` and `tests/fixtures/cs24/invalid-{active-distributed-no-changelog,done-recent-distributed-no-changelog,done-recent-no-tasks-section,done-recent-misnamed-changelog-row}.md` (8 fixtures total).
4. **Test file:** `tests/cs24-changelog-touch-enforcement.test.mjs` — minimum 8 fixture-based tests (one per fixture).
5. **Template doc update:** `template/composed/OPERATIONS.md § Harvest` — add a paragraph (or new subsection `### CHANGELOG-on-every-CS-close-out`) describing the convention + linter enforcement. Run `harness sync --mode=apply --resolved-sha <sha>` after committing to refresh root `OPERATIONS.md` + `.harness-lock.json`.
6. **CHANGELOG.md** entry under `## [Unreleased]` `### Changed`: "`check-clickstop` now requires a CHANGELOG-touch task row on CSs that touch the distributed harness surface (LRN-101)."
7. **LRN-101 status flip** to `applied` with disposition-update note (per C24-7).

## Sub-agent fan-out

Single-CS scope; orchestrator-owned. No fan-out warranted (linter extension + 8 fixtures + 1 test file + 1 template-doc paragraph fits cleanly within one orchestrator session).

## Exit criteria

CS24 close-out is permitted only when **all** of the following are true and recorded in the active CS file's `## Plan-vs-implementation review` section:

1. `scripts/check-clickstop.mjs` includes the new `checkChangelogTouchTask` check, gated by `CHANGELOG_TOUCH_ENFORCEMENT_DATE`.
2. All 8 (or more) fixture-based tests pass.
3. `node --test tests/*.test.mjs` exits 0 with the new tests; total count is `prior + ≥8`.
4. `node bin/harness.mjs lint --quiet` exits 0 (≥24 pass / 0 fail / 3 skipped baseline).
5. `node bin/harness.mjs sync --mode=check --cwd .` reports `No drift detected`.
6. `template/composed/OPERATIONS.md` documents the new convention; root `OPERATIONS.md` reflects the same content; `.harness-lock.json` is in sync.
7. A re-run of `check-clickstop.mjs` against `agent-harness:project/clickstops/done/` produces ZERO new findings against pre-enforcement-date CSs (grandfathering works).
8. CS16 + CS21 done CS files (closed before CS24) are unaffected by the new check; if either was closed AFTER `CHANGELOG_TOUCH_ENFORCEMENT_DATE`, both must satisfy the new check.
9. CS24's own active CS file passes the new check (the linter is recursive over itself).
10. CHANGELOG.md `[Unreleased] / Changed` lists this enforcement.
11. [LRN-101](../../../LEARNINGS.md#lrn-101) frontmatter `status` is flipped to `applied` with a disposition-update note.

## Risks + open questions

- **R1 (medium):** The path-token regex (C24-2) may produce false positives on prose text mentioning paths illustratively (e.g. "as a counterexample, `lib/foo.mjs` would..."). Mitigation: scope the regex to lines inside a recognized list-item or table-row context within `## Deliverables`; document the heuristic and any escape syntax in the linter's JSDoc.
- **R2 (low):** A consumer that exempts `lib/` via `excluded[]` will not have CHANGELOG enforcement on `lib/`-touching CSs. This is the intended behaviour but worth flagging in the docs.
- **R3 (low):** Pilot CSs (CS16, CS21) may surface naming-convention drift (e.g. one uses "CHANGELOG entry" wording, the other uses "CHANGELOG bullet"). Mitigation: C24-3's regex matches multiple verbs (`touch|update|entry|bullet|append|add`) so naming flexibility is preserved.
- **OQ1:** Should the linter also check the *content* of the CHANGELOG entry against the CS's deliverables (e.g. flag a CS that touches `lib/sync.mjs` but whose CHANGELOG bullet only mentions an unrelated file)? **Default:** no for v1 — too easy to false-positive; revisit if the pilot CSs surface a real gap. This question becomes a follow-up CS if needed.

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.7-xhigh | rubber-duck dispatched (orchestrator: yoga-ah) | b450ce05374c | 2026-05-14T04:50:00Z | Go-with-amendments | CS24 grandfather attestation per CS42-7 strict-flip self-host validation. Pre-CS35b backlog; plan content unchanged; backfill only. |
## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per [OPERATIONS.md § Claim](../../../OPERATIONS.md#claim)) | planned | — | — |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
