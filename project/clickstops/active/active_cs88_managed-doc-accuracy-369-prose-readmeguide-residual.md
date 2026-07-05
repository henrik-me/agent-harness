# CS88 — v0.12.0 managed-doc accuracy: gate the composed OPERATIONS #369 `validate-and-approve` prose + finish the READMEGUIDE `check-readme.mjs` genericity (CS83 residual)

**Status:** active
**Owner:** yoga-ah-c2
**Branch:** cs88/content
**Started:** 2026-07-05
**Closed:** —
**Filed by:** Triage of open inbound issue [#381](https://github.com/henrik-me/agent-harness/issues/381) (2026-07-02 by `omni-ah-c3`, at the maintainer's request to file file-worthy issues as CSs). Surfaced by Copilot review on the `henrik-me/sub-invaders` v0.12.0 pin-bump (sub-invaders#140).
**Depends on:** none (but see C88-3: shares `template/composed/OPERATIONS.md` with CS76 — land sequentially).

## Goal

Fix two **harness-managed consumer-doc surfaces** that describe automation a consumer may not actually have — both flagged by Copilot review on the sub-invaders v0.12.0 pin-bump (issue #381). Consumers cannot fix either in-repo (editing managed/composed content trips `sync --mode=check` drift), so the fix must be upstream:

1. **Composed `OPERATIONS.md` #369 prose** — the "Auto-merge branch patterns" block states that a non-matching branch's `validate-and-approve` job **fails a branch-name check**. That job lives in the managed `workboard-auto-approve.yml` template, which is **not** listed in `managed.files` and so is surfaced as an adoptable managed file (report-only "new managed files available") rather than auto-synced. A consumer that synced the composed docs but has not adopted that workflow reads prose overclaiming enforcement it does not have.
2. **Managed `READMEGUIDE.md`** — still cites the harness-repo-local README linter `check-readme.mjs` (three places — one as the `scripts/check-readme.mjs` path, two as bare `check-readme.mjs`). A consumer runs the README linter via `npx … lint` and has no such script — a residual of CS83/#370's consumer-doc invocation-genericity sweep.

## Background

Filed from inbound issue **#381** (state: open; verified via `gh issue view 381`). Both surfaces are managed/composed, so consumer-side edits break `harness-sync-check`.

Verified at HEAD `3b20d0a`:

- `template/composed/OPERATIONS.md:146-156` — the "**Auto-merge branch patterns.**" block; L153 reads "…its `validate-and-approve` job then **fails** the branch-name check, so an admin must squash-merge it". Root mirror `OPERATIONS.md` is the composed *output* of this base.
- `template/managed/READMEGUIDE.md` — three harness-repo-local README-linter references: **L4** the path `scripts/check-readme.mjs` ("The harness linter (`scripts/check-readme.mjs`) mechanically enforces…"), **L31** bare `check-readme.mjs` ("map directly to what `check-readme.mjs` enforces"), **L322** bare `check-readme.mjs` ("Do not run `check-readme.mjs` against this guide file").
- The `validate-and-approve` job (`template/managed/.github/workflows/workboard-auto-approve.yml:57`) and its branch-name `grep -Eq` (`:82`) **do exist** in the template (and predate v0.12.0 — present at v0.11.0), but that workflow is **not** in the self-host `managed.files` (`harness.config.json:16-24` lists only `harness-drift.yml`, `pr-evidence-lint.yml`, `review-gates.yml`) and is adopted only via `harness sync --mode=apply --apply-new` (report-only surfacing otherwise; `--apply-new` has no effect under `--mode=check`/`dry-run`). So the mismatch is an **adoption-gap overclaim** (the doc assumes a workflow the consumer may not have adopted), not a nonexistent mechanism.

Related: **CS76** (also edits `template/composed/OPERATIONS.md`, but its cited regions are cross-ref links / label wording / ADR refs — **not** the L146-156 auto-merge block; overlap is same-file, non-overlapping-block, so sequencing/rebase is prudent but not a hard content collision); **CS83 / #370** (CS83's invocation-genericity sweep fixed the `node scripts/check-readme.mjs` *example* lines at READMEGUIDE L302/L308; the prose references here are a real residual it did not target). Distinct concern from CS76: CS88 fixes *prose accuracy about automation*, not *dangling links*.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C88-1 | Fix the composed #369 prose | Reword `template/composed/OPERATIONS.md:146-156` so the branch-name-check enforcement is explicitly conditioned on the consumer having **adopted the managed `workboard-auto-approve.yml`** (a qualifying clause, e.g. "if your repo has adopted the managed `workboard-auto-approve.yml`"), so a consumer that has not adopted it does not read the failure as already-active. Do not claim the workflow is new in any particular version. Regenerate the root `OPERATIONS.md` mirror via `harness sync` (mid-CS single-file sync permitted — it is the deliverable). No workflow/behaviour change. | Removes the F3-style overclaim (`fails` asserted unconditionally) without dropping the (correct, for adopters) documentation of the mechanism. Keeps composed base and root mirror in lockstep. |
| C88-2 | Fix the READMEGUIDE residual | Reword the three README-linter references — the `scripts/check-readme.mjs` path at L4 and the two bare `check-readme.mjs` prose mentions at L31/L322 — to the consumer-valid generic form used elsewhere post-CS83 (the "README linter" / `npx -y github:henrik-me/agent-harness#<ref> lint`), never a repo-local `scripts/*` path or a bare `check-readme.mjs` script name. | Completes CS83/#370's genericity goal; a consumer has no `scripts/check-readme.mjs`. Matches the invocation-genericity pattern CS83 established for the other consumer docs. |
| C88-3 | CS76 coordination / scope boundary | CS88 owns ONLY the #369-prose accuracy edit (C88-1) + the READMEGUIDE residual (C88-2). It does NOT touch cross-ref *link* resolvability (CS76's scope). Because both CSs edit `template/composed/OPERATIONS.md`, land them **sequentially**: whichever claims first merges; the second rebases onto `main` before its own PR. | Prevents a silent composed-base edit collision between two in-flight CSs on the same file; keeps each CS's diff reviewable. |
| C88-4 | Regression guard vs one-time fix | Default: add a **targeted assertion** (extend the CS72/CS83 consumer-doc-genericity guard, or a small test) that `template/managed/READMEGUIDE.md` contains neither the `scripts/check-readme.mjs` path NOR a bare `check-readme.mjs` script reference (unless deliberately allowlisted). Treat the guard as the preferred outcome; fall back to a one-time fix only if plan-review deems a guard disproportionate. | A residual recurred *because* CS83 lacked a mechanical guard for READMEGUIDE; a tiny always-on check prevents a third recurrence (LRN-183 lineage on unifying doc guards). |

## Deliverables

1. `template/composed/OPERATIONS.md` — L146-156 block reworded per **C88-1**; root `OPERATIONS.md` regenerated via `harness sync` so the mirror matches (sync-check clean).
2. `template/managed/READMEGUIDE.md` — the `scripts/check-readme.mjs` path (L4) + the two bare `check-readme.mjs` references (L31/L322) reworded per **C88-2**.
3. Regression guard/assertion per **C88-4** (guard preferred; scope confirmed at plan-review).
4. `CHANGELOG.md` `[Unreleased]` entry (managed/composed consumer-doc accuracy fix; note it closes #381).
5. Exit-criteria evidence: `harness lint` 0-failed, `node --test tests/*.test.mjs` green, `harness sync --mode=check` "no drift".

## User-approval gates

- (none) — pure managed/composed doc-accuracy fix; no behaviour, flag, or schema change.

## Exit criteria

1. Composed `OPERATIONS.md` no longer asserts an unconditional `validate-and-approve` branch-name failure for consumers that have not adopted `workboard-auto-approve.yml`; the mechanism is conditioned/qualified per C88-1, and the root mirror matches the base.
2. `template/managed/READMEGUIDE.md` contains no consumer-invalid `scripts/check-readme.mjs` path and no bare `check-readme.mjs` script reference.
3. Regression guard (C88-4) present and green, or a documented plan-review decision that a one-time fix suffices.
4. `harness lint` passes; `node --test tests/*.test.mjs` green; `harness sync --mode=check` reports no drift.
5. `CHANGELOG.md` `[Unreleased]` entry present. Plan-vs-implementation review (GPT-5.5) returns GO. Issue #381 referenced for auto-close on merge.

## Risks + open questions

| # | Risk / what breaks | Mitigation |
|---|---|---|
| R1 | Composed-base edit shares `template/composed/OPERATIONS.md` with CS76. | Overlap is same-file but non-overlapping-block (CS76 touches cross-ref/label/ADR regions, not L146-156). C88-3: land sequentially; second CS rebases onto `main`. Small, well-separated diffs reduce conflict surface. |
| R2 | Rewording drifts the composed base from the root mirror → `sync-check` failure. | Deliverable 1 regenerates the mirror via `sync`; exit criterion 4 gates on `sync --mode=check` clean. |
| R3 | Over-generic READMEGUIDE wording loses the useful "this file is not itself README-linted" caveat at L322. | Preserve the *semantics* of each of the three lines; only swap the invocation form, not the caveat. |
| Q1 | Should the #369 prose be gated behind workflow presence (dynamic) or simply qualified (static prose)? | Recommended: static qualifier (C88-1) — composed bases are static text; a dynamic gate would need sync-time logic out of scope here. Confirm at plan-review. |
| Q2 | Guard vs one-time fix for C88-4. | Defaulted to guard; final call recorded at plan-review. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | cs88-plan-review (omni-ah-c3) | 0e7c58378532 | 2026-07-02T23:44:00Z | Go-with-amendments | Premise sound; applied: workflow predates v0.12.0 (frame as not-in-managed.files); apply-new needs --mode=apply; L4 path vs L31/L322 bare refs + guard bans both; CS76 non-overlapping block. |

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | yoga-ah-c2 |
| Reviewer agent | rubber-duck (orchestrator: yoga-ah-c2) |
| Notes | Provisional at claim; finalized at close-out. Independence per REVIEWS.md § 2.3 — reviewer `gpt-5.5` ≠ implementer `claude-opus-4.8`. SemVer **Patch** (provisional): pure managed/composed consumer-doc accuracy fix (no behaviour/flag/schema change); rises to **Minor** only if C88-4 ships as a new always-on standalone linter rather than an extension of an existing guard/test (Q2 — confirmed at close-out). |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| C88-1: reword composed `template/composed/OPERATIONS.md` #369 auto-merge block (condition branch-name enforcement on adopted `workboard-auto-approve.yml`) + regenerate root `OPERATIONS.md` mirror via `harness sync` | planned | — | agent-id=cs88-content \| role=implementer \| report-status=pending \| learnings=0 |
| C88-2: reword `template/managed/READMEGUIDE.md` three `check-readme.mjs` refs (L4 path + L31/L322 bare) to the consumer-generic `npx … lint` README-linter form | planned | — | agent-id=cs88-content \| role=implementer \| report-status=pending \| learnings=0 |
| C88-4: add regression guard asserting `template/managed/READMEGUIDE.md` carries no `scripts/check-readme.mjs` path nor bare `check-readme.mjs` script ref | planned | — | agent-id=cs88-content \| role=implementer \| report-status=pending \| learnings=0 |
| CHANGELOG.md `[Unreleased]` entry (managed/composed consumer-doc accuracy; closes #381) | planned | — | agent-id=cs88-content \| role=implementer \| report-status=pending \| learnings=0 |
| Local review — GPT-5.5 rubber-duck (independence invariant per REVIEWS.md) | planned | — | role=reviewer \| report-status=pending \| learnings=0 |
| Close-out: docs + restart state (WORKBOARD + CONTEXT + handoff) | planned | — | report-status=pending \| learnings=0 |
| Close-out: learnings + follow-ups (LEARNINGS.md) | planned | — | report-status=pending \| learnings=0 |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
