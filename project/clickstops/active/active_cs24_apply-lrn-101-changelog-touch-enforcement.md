# CS24 — Apply LRN-101: mechanically enforce CHANGELOG-touch task on distributed-surface CSs

**Status:** active
**Owner:** yoga-ah-c2
**Branch:** cs24/content
**Started:** 2026-07-04
**Closed:** —
**Filed by:** Pre-CS16 disposition of [LRN-101](../../../LEARNINGS.md#lrn-101) (CS22 close-out, 2026-05-10) per the [INSTRUCTIONS.md § Pre-claim gate](../../../INSTRUCTIONS.md#claiming-a-cs). Authored 2026-05-11 by `yoga-ah`. The LRN's recommended fix is two-pronged: (a) **pilot** CHANGELOG-on-every-CS-close-out in CS16 + CS21 (CS16's close-out added a CHANGELOG-touch row to its `## Tasks` table; **CS21 was later closed obsolete on 2026-06-09 without implementation** — see Status update below, so no pilot run was produced from CS21), and (b) **enforce** mechanically by extending `scripts/check-clickstop.mjs`. This CS handles part (b). Until CS24 lands, the convention is honour-system only.
**Depends on:** Should land **after** at least one pilot CS close-out (CS16 or CS21) so the convention has been exercised before the linter starts requiring it. **CS16 closed 2026-05-11** (one pilot satisfied); **CS21 closed obsolete 2026-06-09** per the disposition pass below (no pilot run produced). The "at least one pilot close-out" gate is satisfied by CS16 alone. May claim earlier if any pilot LRNs from CS16 invalidate the design here, in which case re-author this plan first.

## Status update (2026-06-09, `omni-ah-c2`, disposition pass)

> Per the 2026-06-09 pre-claim backlog-disposition pass at repo HEAD
> `0f434c7`, CS24 is **still relevant but lower-value than originally
> framed**. Decision: **keep planned, low priority**.
>
> **What changed since filing (2026-05-11):**
>
> - The pilot convention has been **organically adopted** across the v0.5.0
>   → v0.8.0 arc. Every CS in the `CHANGELOG.md` `[Unreleased]` and
>   `[0.8.0]` windows (CS54b, CS58, CS61, CS62, CS63a, CS63b, CS63c, and
>   the CS70 release-cut itself) added its own CHANGELOG bullets at
>   close-out, with no retroactive sweep required. Per-CS authoring has
>   held across ~30 CSs by honour-system alone.
> - The mechanical enforcement (`scripts/check-clickstop.mjs` extension)
>   has **not** been built. Verified 2026-06-09: `grep -i changelog
>   scripts/check-clickstop.mjs` returns zero matches.
> - LRN-101's status remains `open` in `LEARNINGS.md`. The
>   "Disposition update (2026-05-11)" note inside the LRN still names
>   CS24 as the mechanical-enforcement vehicle.
> - **CS21 (one of the two named pilot CSs in this plan's "Depends on"
>   header) is itself now closed obsolete** without implementation per the
>   same 2026-06-09 disposition pass. The "CS16 close-out → CS21
>   close-out → CS24 claim" sequencing in the original `Depends on`
>   header should be read as "CS16 close-out is sufficient pilot evidence;
>   the CS21 prerequisite is moot."
>
> **Implications for the plan body below:**
>
> - C24-3, C24-4, C24-5, C24-7 stand as designed.
> - C24-1's distributed-surface path list is still aligned with the
>   current shipped surface; no schema/path additions have moved the
>   target.
> - The risk that the linter retroactively trips existing CSs is low
>   because every recent CS already follows the convention; the
>   `CHANGELOG_TOUCH_ENFORCEMENT_DATE` grandfathering pattern remains
>   appropriate.
>
> **Recommendation for the next claimer:** proceed with the plan as
> written — it is a ~1–2 hour CS that locks in a practice already in
> effect. Alternatively, flip LRN-101 to `applied` citing the organic
> adoption and downgrade CS24 to a deferred "nice to have." Either path
> is defensible.

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

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | yoga-ah-c2 |
| Reviewer agent | rubber-duck (orchestrator: yoga-ah-c2) |
| Notes | **Minor** SemVer — a new date-grandfathered enforcement added to the `check-clickstop` linter (OPERATIONS.md SemVer table: "new linter ⇒ Minor"; can newly fail a consumer's `active/` CI). Independence per REVIEWS § 2.3 — review-of-record `gpt-5.5` ≠ implementer `claude-opus-4.8`. Implementer sub-agent `cs24-changelog-enforce` (claude-opus-4.8). |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1 — Linter extension: add `checkChangelogTouchTask` + `CHANGELOG_TOUCH_ENFORCEMENT_DATE` to `scripts/check-clickstop.mjs` (Deliverable 1; helper `lib/distributed-surface-globs.mjs` per Deliverable 2 only if >40 lines) | done | cs24-changelog-enforce | C24-1/C24-2/C24-3/C24-4; check 6, modeled on `checkCloseoutTasks`; helper module created (>40 lines, unit-tested) |
| T2 — Fixture set: 9 fixtures under `tests/fixtures/cs24/` (4 valid, 5 invalid) | done | cs24-changelog-enforce | Deliverable 3 / C24-5; each a complete otherwise-valid clickstop in its own case dir (the 5th invalid is the R1 scripts-glob regression) |
| T3 — Test file: `tests/cs24-changelog-touch-enforcement.test.mjs` (≥8 fixture-based tests) | done | cs24-changelog-enforce | Deliverable 4; 34 tests (fixture e2e + extraction/matching unit + R1–R4 rubber-duck convergence matrix) |
| T4 — Template doc: `template/composed/OPERATIONS.md § Harvest`, then refresh rendered root `OPERATIONS.md` | done | cs24-changelog-enforce | Deliverable 5 / C24-6; doc added to template + rendered root; `.harness-lock.json` intentionally kept at `main` (stale-lock resync deferred — see Notes); `sync --mode=check` clean |
| T5 — CHANGELOG.md `[Unreleased] / Changed` entry for the enforcement | done | cs24-changelog-enforce | Deliverable 6; classified **Minor** |
| T6 — Flip [LRN-101](../../../LEARNINGS.md#lrn-101) `open` → `applied` with disposition-update note (close-out SHA + CS16 pilot evidence) | pending | yoga-ah-c2 | Deliverable 7 / C24-7 — CLOSE-OUT task |
| Close-out: docs + restart state | pending | yoga-ah-c2 | Update WORKBOARD.md, CONTEXT.md, and the rendered root OPERATIONS.md so a fresh agent can restart from actual state |
| Close-out: learnings + follow-ups | pending | yoga-ah-c2 | Disposition learnings in LEARNINGS.md (flip LRN-101); file a planned follow-up CS if OQ1 (content-vs-deliverable check) proves worthwhile |

## Notes / Learnings

**Implementation (2026-07-04, `cs24/content`).** Deliverables 1–6 by sub-agent
`cs24-changelog-enforce` (claude-opus-4.8) + orchestrator `yoga-ah-c2`.
`scripts/check-clickstop.mjs` gains check 6 `checkChangelogTouchTask` (backed by
new `lib/distributed-surface-globs.mjs`); 9 fixtures + 34 tests; OPERATIONS.md
§ Harvest `### CHANGELOG-on-every-CS-close-out`; CHANGELOG `[Unreleased]/Changed`
bullet. Verified: `check-clickstop --dir project/clickstops` 0 errors,
`node --test tests/*.test.mjs` 0 fail (+34 tests from CS24), `harness lint` 35/0/3,
`sync --mode=check` no drift. (Fixture/test counts grew across the 5-round
rubber-duck review — R1–R4 each added token-parser regression coverage.)

**Key decisions:**
- **Enforcement cutoff `2026-07-05`** (C24-4): strictly after the latest existing
  done-CS `**Closed:**` date (2026-07-04), mirroring `MODEL_AUDIT_ENFORCEMENT_DATE`,
  so the entire closed backlog is grandfathered and CI stays green. `active/`
  files are always checked; CS24's own active file passes via its T5 CHANGELOG row.
- **SemVer = Minor** (corrected from the sub-agent's initial "Patch"): a new
  mechanical lint enforcement is new functionality per the OPERATIONS.md SemVer
  table and can newly fail a consumer's `active/` CI.
- **`.harness-lock.json` kept at `main`'s version** (NOT a full `sync --mode=apply`
  regeneration). The committed lock has been stale since **cs55/content
  (2026-05-28)**; a plain apply regenerated ~90 lines of unrelated bookkeeping
  (INSTRUCTIONS.md + `.github/copilot-instructions.md` `managed→composed` class
  migrations, workflow/hash refreshes, `excluded[]` gaining `LEARNINGS-archive.md`)
  accumulated across ~50 CSs. Bundling those into CS24 would violate the mid-CS
  sync prohibition (harness updates land in their own CS). Reverting the lock and
  keeping only the OPERATIONS.md prose render still yields `sync --mode=check` →
  "No drift detected" (drift-check validates rendered content, not lock
  bookkeeping). Stale-lock resync deferred to a follow-up CS.

**Learning candidates (disposition into `LEARNINGS.md` at close-out):**
- *tooling:* `sync --mode=check` reports "No drift detected" on a lock whose
  bookkeeping (`harness_ref`, `synced_at`, per-file class/hashes,
  `template_prose_hash`) is stale — it compares rendered file *content* only. A
  stale `template_prose_hash` stays dormant until the next composed-template edit,
  then fail-closes `sync --mode=apply` with `EMERGE_LEGACY_UNMAPPED`. Evidence:
  lock pinned at cs55 (2026-05-28) yet check green across ~50 CSs.
- *process:* C24-1 lists `package.json`/`package-lock.json` as distributed-surface
  globs, but the self-host `excluded[]` lists both; per C24-1's excluded-subtraction
  they are therefore NOT distributed surface here — a CS touching only package
  metadata is exempt from CHANGELOG enforcement on the self-host. Implemented as
  written; a follow-up may want package metadata enforced independently of
  sync-exclusion.

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
