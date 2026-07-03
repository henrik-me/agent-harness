# CS101 — harness review: delegate the Copilot leg to the copilot-engage `--add-reviewer` path

**Status:** done
**Owner:** yoga-ah-c2
**Branch:** cs101/content
**Started:** 2026-07-03
**Closed:** 2026-07-03
**Filed by:** yoga-ah-c2 (Claude Opus 4.8), 2026-07-03 — from inbound bug report #422 (filed by the harness orchestrator from consumer repo `henrik-me/authzandentitlements`, CS10; consumer LRN-006).
**Depends on:** none. Touches `lib/review.mjs` (+ `schemas/harness.config.schema.json` default, `lib/reviews-policy.mjs` default, tests). Concurrent sibling CS100 (#421, owned by yoga-ah) touches a git hook + `harness init`/scaffold — disjoint from this CS's `lib/review.mjs` surface. Reuses `engageCopilot` from `lib/copilot-engage.mjs` (read-only dependency).

## Goal

Fix issue #422: `harness review <pr> --copilot-only` (and `harness review`'s Copilot leg generally) polls for a Copilot review it never actually requested — with the default `reviews.copilot_trigger: 'mention'`, `triggerCopilotReview` posts an `@copilot review` PR comment (`gh api …/issues/<pr>/comments`) that does **not** add Copilot to `requested_reviewers`, so no review ever arrives and the poll runs to timeout. `harness copilot-engage` works because it uses the REST `gh pr edit --add-reviewer` path (ADR-0004) with CS92 verify/re-add hardening. Make `harness review` delegate its Copilot leg to that same hardened `engageCopilot` path so `--copilot-only` reliably requests Copilot and returns a real verdict.

## Background

In `lib/review.mjs` `runReview`, the Copilot leg calls `triggerCopilotReview({ trigger: config.copilot_trigger })` (`:174`, `:200`) then `pollForCopilotReview` (`:221`). `triggerCopilotReview` (`:543`) branches on `trigger`:

- `mention` (the schema default, `schemas/harness.config.schema.json:189-193`; also `review.mjs:23`): `gh api repos/<o>/<r>/issues/<pr>/comments -f body=@copilot review` — an @-mention **comment**, which does not populate `requested_reviewers`. This is the #422 root cause: the subsequent `pollForCopilotReview` waits for a review that is never triggered.
- `reviewer`: `gh pr edit <pr> --add-reviewer <COPILOT_LOGIN>` — the working path.

`lib/copilot-engage.mjs` already exports `engageCopilot({ owner, repo, prNumber, opts })` — the canonical, hardened engage path: it resolves the Copilot identity, requests via `--add-reviewer` **with retry** (`withRetry`), **verifies** `requested_reviewers` landed with one bounded re-add (C92-2/LRN-160 → typed `reviewer-not-requested` exit 6 instead of a slow timeout), supports `opts.noPoll`, `opts.headSha`, `opts.submittedAfter` (the A5 ordering floor), and polls with `commit.oid === headSha` + submitted-after predicate, throwing typed `EngageError`s (`fork-source`, `reviewer-not-requested`, `reviewer-verify-unavailable`, `timeout`, `bad-input`). `harness copilot-engage` (`bin/harness.mjs` `cmdCopilotEngage`) already calls it.

So `harness review` maintains a **divergent, weaker, and (by default) broken** Copilot path — including a second copy of `pollForCopilotReview` (`review.mjs:562`, duplicating `copilot-engage.mjs:416`). The fix is to delete the divergence: route review's Copilot leg through `engageCopilot`.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C101-1 | Delegate review's Copilot leg to `engageCopilot` | In `runReview`, replace both `triggerCopilotReview` + `pollForCopilotReview` call sites (the `noPoll` dispatch path `:172-182` and the trigger `:199-208` + poll `:219-230` path) with `engageCopilot({ owner, repo, prNumber, opts })` imported from `./copilot-engage.mjs`. Pass `opts` = `{ noPoll, headSha: pr.headRefOid, timeoutMs, submittedAfter, cwd }` (+ any existing `transportOpts`/`__testSeam` wiring engage needs). | Reuses the exact REST `--add-reviewer` path that works for `copilot-engage`, plus its CS92 verify/re-add + typed-failure hardening. Directly fixes #422 (`--copilot-only` now actually requests Copilot) and removes the divergent weaker path. |
| C101-2 | A5 ordering floor **+ control-flow reorder** | Today `runReview` triggers Copilot (`:199-208`) BEFORE obtaining the rubber-duck output (`:211-217`), and it has **no** pre-poll local-Go timestamp (the `## Review log` timestamp is generated later, during the PR-body update). Amend the full (`!copilotOnly`) path to: (1) obtain + parse the rubber-duck output **first**; (2) capture `localGoAt = new Date(__testSeam.now()).toISOString()` at the moment a Go is parsed; (3) **then** call `engageCopilot` with `opts.submittedAfter = localGoAt`; reuse `localGoAt` as the `## Review log` Go-row timestamp so the row and the poll floor agree. For `--copilot-only` (no rubber-duck leg) omit `submittedAfter` → `engageCopilot` floors on its own engage-request time. | The plan's original claim that review "already records" a Go timestamp before polling was false — it must be captured and the engagement moved after the Go. Enforces A5/A16 (Copilot review must post-date the local Go) with a real timestamp and removes the current pre-Go trigger. `engageCopilot`'s `submittedAfter` already implements MAX(engageRequestedAt, callerFloor). |
| C101-3 | Translate **all** `EngageError` kinds → `ReviewError`; preserve review's 0/1/2 | `cmdReview` only catches `ReviewError` (`bin/harness.mjs:3373`) and maps it via `reviewExitCode` (`:3485`: `no-go`→1, else→2); an unmapped `EngageError` would fall through to an ugly crash. Add a `toReviewErrorFromEngage(err)` helper (near `toReviewError` `:1039`) translating every `EngageError` kind — `bad-input`, `auth-missing`, `network`, `cache-write-failed`, `reviewer-not-requested`, `reviewer-verify-unavailable`, `timeout`, `fork-source` — into a `ReviewError` (kind `bad-input`→`bad-input`; `timeout`→`timeout`; all others incl. `auth-missing`→`transport`) with a faithful message; wrap the `engageCopilot` call in `runReview` to rethrow via it. `reviewExitCode` then yields exit **2** for these; a genuine Copilot `CHANGES_REQUESTED` remains a review **No-Go** (exit 1) via the existing `computeVerdict`. `harness review` keeps its documented 0/1/2 contract — do NOT surface copilot-engage's 3/4/5/6 codes. | Preserves review's CLI contract while surfacing the real, typed engage failure (e.g. `reviewer-not-requested`) instead of a silent/timeout poll. |
| C101-4 | Retire the ineffective `mention` trigger | `engageCopilot` always uses `--add-reviewer`, so `reviews.copilot_trigger` no longer selects review's mechanism. Change the schema **default** `mention` → `reviewer` in `schemas/harness.config.schema.json` and the `lib/review.mjs:23` fallback constant, and rewrite the schema field `description` to state `harness review` always uses the reviewer-attachment path (via the engage path) and that `mention` is retained only for back-compat and is a **no-op**. Keep the enum `[mention, reviewer]` (do NOT remove the field — removal is a breaking schema change). **`lib/reviews-policy.mjs` needs no default edit** — it sources defaults directly from the schema (`:72-73`), so the schema change propagates automatically. Update the root `REVIEWS.md` + `template/composed/REVIEWS.md` `copilot_trigger` prose (default now `reviewer`; `mention` deprecated/no-op) in **lockstep** (byte-identical composed core). Remove the now-unused `triggerCopilotReview` and the review-local `pollForCopilotReview` **iff** no longer referenced after C101-1 (update `tests/cs52-harness-review-lib.test.mjs`); if a residual consumer exists, leave them exported but unused. | Eliminates the broken default that caused #422 while staying non-breaking (field kept, enum kept). Dedupes the second `pollForCopilotReview`. Removal-vs-retain is gated on actual references. |
| C101-5 | SemVer | **Patch** — bug fix restoring `harness review --copilot-only` to its intended behaviour. No CLI flag/subcommand added or removed; no config **field** added/removed (only a default value + description change, backward-compatible; `mention` still validates). Removed items (`triggerCopilotReview`, review's `pollForCopilotReview`) are internal module exports, not a consumer CLI surface. CHANGELOG `[Unreleased] → Fixed`. | Restoring a broken command is a fix; the schema shape and CLI surface are unchanged. (Reviewer to confirm the default-change classification.) |

## Deliverables

1. `lib/review.mjs` (edit) — import `engageCopilot` + `EngageError` from `./copilot-engage.mjs`; **reorder** the Copilot leg after the rubber-duck Go and capture `localGoAt` (C101-2); replace the `triggerCopilotReview`/`pollForCopilotReview` call sites (noPoll + full path) with `engageCopilot` per C101-1; add `toReviewErrorFromEngage()` + wrap the engage call to translate every `EngageError` kind (C101-3); update `describePlannedActions` so the dry-run text reflects the reviewer-attachment path (no longer "trigger Copilot via {mention}"); change the `:23` fallback default to `copilot_trigger: 'reviewer'`; remove `triggerCopilotReview` + the review-local `pollForCopilotReview` if unreferenced after the change (grep-gated).
2. `schemas/harness.config.schema.json` (edit) — `reviews.copilot_trigger` default `mention` → `reviewer`; rewrite the description (reviewer-attachment path always used; `mention` deprecated/no-op). Keep the enum. (`lib/reviews-policy.mjs` needs **no** edit — defaults are schema-sourced.)
3. `REVIEWS.md` (root) **and** `template/composed/REVIEWS.md` (edit) — update the `copilot_trigger` prose (~`:653-654`: default now `reviewer`; `mention` deprecated/no-op) in **lockstep** (byte-identical composed core), so the schema default flip leaves no stale user-facing docs and the composed-blocks linter + `sync --mode=check` stay green.
4. `tests/*` (edit/add):
   - `tests/cs52-harness-review-lib.test.mjs` — replace the `triggerCopilotReview` import/case with the delegated engage path (inject an `engageCopilot`/`__testSeam` mock).
   - `tests/cs61-reviews-policy-reader.test.mjs` — update the `copilot_trigger` default assertion to `reviewer`.
   - Add regression tests (any suitable `tests/*.test.mjs`): (a) `runReview({ copilotOnly: true })` drives the **add-reviewer engage** seam (not the mention comment) and surfaces a **typed exit-2 failure** when the reviewer never lands (no infinite/timeout poll of an un-requested reviewer); (b) the full path engages Copilot **after** the rubber-duck Go and passes `submittedAfter = localGoAt` (A5); (c) each `EngageError` kind (`reviewer-not-requested`, `reviewer-verify-unavailable`, `timeout`, `auth-missing`, `network`, `cache-write-failed`, `fork-source`, `bad-input`) maps to the expected review exit (2, except No-Go=1 which comes from the verdict, not engage); (d) dry-run `describePlannedActions` text reflects the reviewer-attachment path. Minimum coverage; over-delivery welcome.
5. `CHANGELOG.md` (edit) — `[Unreleased] → Fixed` bullet referencing #422.
6. `LEARNINGS.md` (edit, at close-out) — learning: a verb that *polls* for an async effect must *cause* it through the same **verified** path as the dedicated engage command, never a divergent trigger (an @-mention comment ≠ a reviewer request); dedupe rather than fork the engage path. Cross-ref #422 / consumer LRN-006 / CS92.

## User-approval gates

- **(none)** — self-contained fix to a distributed CLI verb; no user-facing surface added. The default flip is backward-compatible (existing `mention` configs still validate; the value is now a no-op for review).

## Exit criteria

- `harness review <pr> --copilot-only` requests Copilot via the REST `--add-reviewer` engage path (not the mention comment) — verified by a unit test asserting `runReview({ copilotOnly: true })` drives the `engageCopilot` add-reviewer seam and, when the reviewer never lands, throws a typed failure (not an unbounded/timeout poll of an un-requested reviewer).
- The full (`!copilotOnly`) path still records the rubber-duck Go and polls Copilot with the Go timestamp as the `submittedAfter` floor (A5 preserved).
- `node --test tests/*.test.mjs` passes (incl. updated cs52 + cs61 + new cases).
- `node bin/harness.mjs lint --quiet` exits 0 and `node bin/harness.mjs sync --mode=check --cwd .` reports no drift (schema default change is internal to the self-host config surface).
- Issue #422 closes on merge.

## Risks + open questions

- **R1 — return-shape/contract drift.** `runReview` has a specific result shape (`copilotReview`, `copilotDispatch`, verdict, exitCode) consumed by `cmdReview` + the review-evidence flow. Mitigation: map `engageCopilot`'s return to the existing fields; keep `cmdReview`'s output/exit contract; cover with the existing review tests.
- **R2 — over-broad deletion.** Removing `triggerCopilotReview`/`pollForCopilotReview` could break an unseen caller. Mitigation: C101-4 gates removal on a zero-reference check post-delegation; otherwise retain them exported-but-unused. Grep before deleting.
- **R3 — A5 ordering regression.** If `submittedAfter` is mis-wired, Copilot could be accepted before the local Go. Mitigation: pass the recorded Go timestamp explicitly (C101-2) and test it.
- **R4 — SemVer of the default change.** A schema **default** change (not a field add/remove) is backward-compatible; classified Patch. Reviewer to confirm vs Minor.
- **(Resolved) OQ — remove the field vs keep it?** Keep it (enum unchanged) to avoid a breaking schema change; only flip the default + deprecate `mention` in prose.

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | cs101-plan-review | ee7a4b4c40ff | 2026-07-03T22:02:00Z | Go-with-amendments | Root-cause + SemVer Patch verified; 2 blocking: A5 floor under-specified (no pre-poll Go ts; Copilot triggered before Go) + EngageError mapping incomplete vs cmdReview 0/1/2. |
| R2 | gpt-5.5 | claude-opus-4.8 | cs101-plan-review2 | c6455203599d | 2026-07-03T22:10:00Z | Go-with-amendments | A5 reorder resolved; exit strategy OK; one gap: EngageError list/tests still omit real `auth-missing` kind. |
| R3 | gpt-5.5 | claude-opus-4.8 | cs101-plan-review3 | 1f498b5cac69 | 2026-07-03T22:14:00Z | Go | `auth-missing` added to C101-3 + tests (→transport→exit 2); kind list matches copilot-engage; no omissions. |

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | yoga-ah-c2 (sub-agent cs101-impl) |
| Reviewer agent | rubber-duck (orchestrator: yoga-ah-c2) |
| Notes | **Patch** SemVer (bug fix; schema default flip + description only, enum kept; internal-export removals). Independence per REVIEWS § 2.3 — reviewer `gpt-5.5` ≠ implementer `claude-opus-4.8`. Plan reviewed by gpt-5.5 (R3 Go, hash `1f498b5cac69`; R1/R2 Go-with-amendments resolved). Finalized at close-out. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1 — `lib/review.mjs`: delegate Copilot leg to `engageCopilot` (import; reorder after rubber-duck Go with `localGoAt` `submittedAfter`; `toReviewErrorFromEngage` for all `EngageError` kinds incl. `auth-missing`; `describePlannedActions` reviewer-attachment text; `:23` default `reviewer`; remove dead `triggerCopilotReview`/`pollForCopilotReview` if unref) — C101-1/2/3/4 | done | yoga-ah-c2 | agent-id=yoga-ah-c2 \| role=implementer (sub-agent cs101-impl) \| report-status=complete \| learnings=1 |
| T2 — `schemas/harness.config.schema.json` `copilot_trigger` default `mention`→`reviewer` + description; `REVIEWS.md` + `template/composed/REVIEWS.md` `copilot_trigger` prose in lockstep (C101-4) | done | yoga-ah-c2 | agent-id=yoga-ah-c2 \| role=implementer (sub-agent cs101-impl) \| report-status=complete \| learnings=0 |
| T3 — tests: update `cs52`/`cs61`; add delegation + `--copilot-only` request + A5 `localGoAt` floor + all-`EngageError`-kind exit + dry-run `describePlannedActions` regression tests; `CHANGELOG.md` `[Unreleased]` Fixed (#422) | done | yoga-ah-c2 | agent-id=yoga-ah-c2 \| role=implementer (sub-agent cs101-impl) \| report-status=complete \| learnings=0 |
| Independent content review (GPT-5.5) | done | gpt-5.5 | R1 Go @ 6ec5fe7 (cs101-review); R2 Go @ 9576bc5 (cs101-review2, Copilot timestamp nit fixed); Copilot COMMENTED×2 (1 nit adopted, clean at HEAD), threads resolved; reviewer ≠ implementer per REVIEWS § 2.3 |
| Close-out: docs + restart state | pending | yoga-ah-c2 | Update WORKBOARD.md (remove CS101 row) + CONTEXT.md; REVIEWS.md is a rendered-doc change (composed lockstep). |
| Close-out: learnings + follow-ups | pending | yoga-ah-c2 | File LEARNINGS.md poll-must-cause-via-verified-path entry; #422 auto-closes on merge. |

## Notes / Learnings

- Bundles the single inbound bug #422. Sibling CS10 learnings LRN-018/020 also spawned #420 (CS97, done), #421 (CS100, yoga-ah), #423, #424 — each its own CS.

## Plan-vs-implementation review

**Reviewer:** GPT-5.5 (rubber-duck; background agent `cs101-pvi`, independent of the claude-opus-4.8 implementer per REVIEWS § 2.3)
**Date:** 2026-07-03T22:55:00Z
**Outcome:** GO

Reviewed the CS101 plan (§ Decisions C101-1…C101-5, § Deliverables 1–6, § Exit criteria) against the merged content (PR #440, squash `f02cd39`).

| Deliverable | Outcome | Assessment |
|---|---|---|
| 1 — `lib/review.mjs` delegation | match | Imports `engageCopilot`/`EngageError`; delegates noPoll + full Copilot paths via `__testSeam.engageCopilot`/`runEngageLeg`; reorders after the rubber-duck Go with `localGoAt` `submittedAfter`; `toReviewErrorFromEngage` maps all `EngageError` kinds (0/1/2 preserved); `describePlannedActions` + `:23` default `reviewer`; removed divergent `triggerCopilotReview`/`pollForCopilotReview` + dead GraphQL. |
| 2 — schema | match | `copilot_trigger` default `reviewer`; enum kept; description says reviewer-attachment path always used, `mention` deprecated/no-op. |
| 3 — REVIEWS.md lockstep | match | Root + `template/composed/REVIEWS.md` `copilot_trigger` block byte-identical (default `reviewer`). |
| 4 — tests | match | cs52/cs61 updated; new `cs101-review-engage-delegation.test.mjs` covers engage seam (no mention comment), typed exit-2 failures, A5 `submittedAfter`, all `EngageError` kinds, No-Go, noPoll, dry-run wording. |
| 5 — CHANGELOG | match | `[Unreleased] → Fixed` #422; no overclaim. |
| 6 — LEARNINGS | done at close-out | LRN-189 filed in this close-out. |

**Accepted divergence (in-intent hardening):** a follow-up commit gates the Review-log row timestamp on a **Go** combined verdict before reusing `localGoAt` (Copilot review of PR #440 flagged a Needs-Fix row being mis-stamped with the Go moment) — not scope creep; the A5 poll floor is unchanged. Exit criteria 5/5 met; #422 CLOSED on merge; no overclaims (GPT-5.5 `cs101-pvi`; `bin/harness.mjs` unchanged).
