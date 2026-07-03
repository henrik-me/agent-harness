# CS92 — copilot-engage / gh reliability hardening: 401-retry + post-add reviewer verify + review-at-HEAD success semantics

**Status:** active
**Owner:** omni-ah-c2
**Branch:** cs92/content
**Started:** 2026-07-03
**Closed:** —
**Filed by:** omni-ah-c2 (Claude Opus 4.8), 2026-07-02 — filed from the weekly open-LRN harvest requested by @henrik-me. Bundles the three `harness copilot-engage` / `gh`-reliability learnings that share one root (transient `gh` GraphQL flakiness + fire-and-forget reviewer add): **LRN-161** (`gh api graphql` random 401), **LRN-160** (`gh pr edit --add-reviewer` silent no-op), and **LRN-173** (engage reports success before a review at HEAD lands). Distinct from planned **CS87** (`copilot-engage --help` *wording* accuracy only — no runtime change).
**Depends on:** none (hard). Touches `lib/copilot-engage.mjs` (CS37/CS41) and the `copilot-engage` command block in `bin/harness.mjs`. No in-flight CS owns these surfaces (CS87 edits only the help *string*; coordinate the two help edits if claimed concurrently — see Risks R3).

## Goal

Make `harness copilot-engage` resilient to the two transient `gh` failure modes that repeatedly cost alternating review rounds, and make its success signal trustworthy: (1) retry transient GraphQL 401 / network flakes with bounded backoff instead of aborting the whole engage on the first blip (LRN-161); (2) verify the reviewer was actually requested after the add and re-add once on a silent no-op, instead of discovering the miss only via a full poll timeout (LRN-160); (3) guarantee that a non-timeout "success" corresponds to a Copilot review whose commit is the PR HEAD, and that the no-verification early-return path is clearly distinguished from a verified-at-HEAD result (LRN-173).

## Background

`lib/copilot-engage.mjs` already handles part of this surface, so this CS is a **targeted hardening of existing behavior**, not a rewrite. Verified against the source at HEAD `3b20d0a`:

- **Already correct — review-at-HEAD in the poll path.** `findLatestMatchingCopilotReview` (`lib/copilot-engage.mjs:327`) already filters accepted Copilot reviews by `r.commit.oid === headSha` (`:336`) AND a `submittedAt >= submittedAfterMs` floor (`:337-340`); `engageCopilot` captures the `engageRequestedAtMs` floor **before** the add mutation (`:123`) and takes `max(floor, opts.submittedAfter)` (`:164-167`). So the **default (poll) path already returns success only on a review at the current HEAD submitted after the engage/local-Go floor** — the core of LRN-173's ask is present. The residual LRN-173 gap is the **`opts.noPoll` early return** (`:136-146`), which reports `requested: true` with **no** verification, and the fact that a silent add no-op (LRN-160) currently surfaces only as a slow full-timeout with a misleading "The review request was accepted" message (`:181-189`).

- **Gap 1 — no transient-flake retry (LRN-161).** No seam call has any retry-with-backoff: the poll loop rethrows a `graphqlFn` error at `:295-297` (so a single transient GraphQL 401 there aborts the whole engage), and the `requestFn` add and `resolvePrNodeId` calls surface their errors directly. (Identity resolution is the one path that already degrades gracefully — the node query falls back to `user(login:)` on non-`auth-missing` errors, `:385-404` — but even it does not retry a transient blip.) At the ~30 % GraphQL-401 flake rate observed in CS69 (LRN-161), the identical call succeeds 2–3 s later, yet the engage has already aborted. The code already distinguishes a **real** auth failure via `GraphQLError.kind === 'auth-missing'` (`:396-398`), which must **not** be retried; the blocker (Risks R1) is that a genuine `gh pr edit` permission/scope denial is surfaced with the SAME coarse `kind: 'network'` as a transport blip (`lib/github-graphql.mjs:294-311`), so the classifier needs finer signal.

- **Gap 2 — fire-and-forget reviewer add (LRN-160).** After `requestFn` returns (`:126-133`), `engageCopilot` does **not** verify that the reviewer is actually in `requested_reviewers`. `gh pr edit --add-reviewer copilot-pull-request-reviewer` can return exit 0 + the PR URL while `requested_reviewers` stays `[]` (LRN-160, observed twice in CS69 PR #295). The miss is currently caught only when the subsequent poll runs the full `timeoutMs` and fails — slow and with a misleading success-worded error.

These three cost repeated real time: LRN-161 forced `gh run rerun --failed` cycles and local re-issues; LRN-160 needed a manual `gh api ... requested_reviewers` verify + re-add; LRN-173 caused premature-proceed rounds where Copilot then re-reviewed the new HEAD. The fixes are deterministic and unit-testable through the existing `__testSeam` (injectable `now`/`sleep`/`graphqlFn`/`requestFn`, `lib/copilot-engage.mjs:77`).

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C92-1 | Transient-flake retry-with-backoff (LRN-161) | Wrap the seam network calls (`graphqlFn`, `requestFn`, and the reviewer-verify read from C92-2) in a shared, `__testSeam`-driven `withRetry` helper that retries ONLY a **positively-identified transient** error: an API/GraphQL **HTTP 401 whose kind is not `auth-missing`**, an **HTTP ≥ 500**, or an **explicit transport/timeout failure** (spawn/connection error or request timeout). Retry up to a bounded max (**default 5 attempts, ~3 s linear backoff via `__testSeam.sleep`**). **Fail fast — no retry** — on every non-transient error: `auth-missing`, `bad-input`, fork-source, and any **permission/scope / other-4xx** failure. Because today's `GraphQLError` collapses BOTH a genuine `gh pr edit` permission/scope denial AND a transport blip into the single coarse `kind: 'network'` (`lib/github-graphql.mjs:294-311`), the classifier MUST NOT key off `kind` alone: **extend the error surface** so each `GraphQLError` carries the finer signal already in hand (HTTP status where known, the subprocess exit code, and a stderr snippet), and add a single `isTransientGhError(err)` predicate over those fields (e.g. a non-zero `gh` exit whose stderr matches a permission/scope pattern is NOT transient). The wrapper and tests share the one predicate. Inside `pollForCopilotReview`, a transient `graphqlFn` throw is retried **in place** (does not hard-abort the poll). | The flake is transient and time-correlated (LRN-161: identical call succeeds 2–3 s later), but the coarse `kind: 'network'` conflates it with a real permission/scope denial that must fail fast, not retry 5×. Enriching the error with status/exit/stderr lets one shared predicate retry only the genuinely-transient class while `auth-missing` and permission failures fail immediately. Reusing `__testSeam.sleep` keeps it deterministic in tests. |
| C92-2 | Post-add reviewer verification + one bounded re-add (LRN-160) | After `requestFn` succeeds and **before** entering the poll (or returning in no-poll mode), read the PR's requested reviewers via the seam and confirm the Copilot login is present. If absent (silent no-op), **re-add exactly once** then re-verify; if still absent, fail fast with a `reviewer-not-requested` `EngageError` naming the observed empty/other `requested_reviewers` — **not** a full poll timeout. If the reviewer-read itself fails, retry it under C92-1 (transient); if it still cannot be read, do **not** silently proceed as success — either fail with a typed `reviewer-verify-unavailable` `EngageError`, or (no-poll mode only) return an explicitly **unverified** result (`verified: false`, C92-3) with a `::notice::`. Never report success from an unreadable reviewer list. | Turns LRN-160's slow, misleadingly-worded timeout into an immediate, accurate failure (or a self-heal via one re-add, which "always worked on the second attempt" in CS69). Bounding the re-add to one attempt prevents an infinite add/verify loop; treating an unreadable reviewer list as typed-error-or-explicitly-unverified (never a silent pass) avoids re-introducing the LRN-160 blind spot. |
| C92-3 | Trustworthy success semantics; no-poll path is explicitly *unverified* (LRN-173) | Keep the poll path's existing review-at-HEAD guarantee (`findLatestMatchingCopilotReview` commit.oid === headSha + submitted-after floor) as the definition of a **verified** success. Make the `opts.noPoll` early return report a distinct **`verified: false`** shape (`requested: true, verified: false`); the default (poll) result carries `verified: true`. The `verified` field is **additive** to the result object / JSON output, and **exit codes are unchanged**: no-poll still exits **0** on a successful request (now reported as `verified: false`), and the poll path still exits 0 on a verified review / non-zero on timeout. Only human-readable wording and the JSON gain the flag, so a caller cannot mistake "reviewer requested" for "review present at HEAD". No change to the poll predicate itself (already correct). | LRN-173's core (don't trust exit 0 as review-at-HEAD) is already satisfied by the poll path; the residual risk is the no-poll early return implying more than it verified. An additive `verified` flag — with no exit-code change — closes it without weakening the existing poll guarantee or breaking any caller that reads the exit code. |
| C92-4 | Scope + SemVer | Touch only `lib/copilot-engage.mjs`, `lib/github-graphql.mjs` (error-surface enrichment, C92-1), the `copilot-engage` command block in `bin/harness.mjs` (result rendering / wording + internal retry defaults), their tests, `CHANGELOG.md`, and `LEARNINGS.md`. Retry/verify use **internal defaults with no new required CLI flag**, the added `verified` output field is **additive**, and **no exit-code semantics change** (C92-3) ⇒ **Patch** (reliability bug-fix, no interface contract change). If plan-review/the user prefers an operator-visible `--retries` / `--no-verify-reviewer` knob (OQ1), that is **Minor** and recorded as an amendment. | Bounded blast radius on the engage surface + the shared gh-error module; Patch matches "bug fix with no interface change" in `OPERATIONS.md § SemVer policy` given exit codes are preserved and the JSON change is additive. Exposing a knob is the only thing that would bump it to Minor, so the choice is surfaced rather than assumed. |
| C92-5 | Deterministic tests via `__testSeam` | Cover each new branch with injected seams: (a) `graphqlFn` that throws a transient 401 N times then succeeds ⇒ engage still succeeds within the retry budget; (b) a real `auth-missing` error ⇒ **no** retry, fails fast; (c) `requestFn` add that leaves `requested_reviewers` empty once then populated after re-add ⇒ self-heals; (d) add that stays empty ⇒ `reviewer-not-requested` fast failure (not a timeout); (e) no-poll returns `verified: false` **and exit code 0**; (f) poll success still returns `verified: true` only for a review at HEAD after the floor (regression-lock the existing guarantee); (g) a non-transient permission/scope `gh` failure (non-zero exit with a scope-error stderr) ⇒ **no** retry, fails fast (locks the C92-1 narrow classifier). Any scratch files under `os.tmpdir()` only. Minimum one case per branch; over-delivery welcome. | The `__testSeam` already injects `now`/`sleep`/`graphqlFn`/`requestFn`, so flake/no-op/at-HEAD are all deterministically reproducible without real network; cases (b)+(g) lock the transient-vs-fail-fast boundary and (f) prevents an at-HEAD regression while refactoring. |
| C92-6 | LRN linkage at close-out | Flip **LRN-161** and **LRN-160** `open → applied` with the merge SHA. Flip **LRN-173** `open → applied`, its Disposition noting the poll-path review-at-HEAD guarantee already existed and CS92 closed the residual (no-poll `verified` flag + the LRN-160 fast-fail that removes the misleading timeout). Cross-link CS92. | Accurate provenance: LRN-173 was partly pre-addressed, so its Disposition must not overclaim that CS92 introduced review-at-HEAD from scratch (§ 2.6a fact-claim discipline). |

## Deliverables

1. `lib/copilot-engage.mjs` + `lib/github-graphql.mjs` (edit) — enrich `GraphQLError` with finer signal (HTTP status where known, subprocess exit code, stderr snippet) and add a shared `isTransientGhError` predicate + `withRetry` wrapper around the seam network calls, incl. in-place retry inside `pollForCopilotReview` (C92-1); post-add `requested_reviewers` verify + one bounded re-add with a `reviewer-not-requested` fast-fail and a `reviewer-verify-unavailable` typed error on unreadable-after-retry (C92-2); `verified` flag on the result shape, no-poll ⇒ `verified: false` with exit code unchanged at 0 (C92-3). Extend `__testSeam` if a reviewer-read seam is needed.
2. `bin/harness.mjs` (edit) — `copilot-engage` result rendering + wording so "requested (unverified)" is visually distinct from "verified review at HEAD" (C92-3); wire internal retry/verify defaults (C92-4). Exit codes unchanged. Coordinate with CS87's help-string edit if both are in flight (Risks R3).
3. `tests/*.test.mjs` (new/edit, `node --test`, `os.tmpdir()` only for any fs) — the seven `__testSeam`-driven cases in C92-5 (transient-401-then-success, no-retry-on-auth-missing, add-no-op-self-heal, add-no-op-fast-fail, no-poll-unverified-exit-0, poll-verified-at-HEAD regression lock, permission-scope-failure-not-retried). Minimum per-branch coverage.
4. `CHANGELOG.md` (edit) — `[Unreleased]` → **Fixed** (copilot-engage 401-retry + reviewer-add verify + trustworthy success semantics). Patch per C92-4 (or Minor if OQ1 exposes a knob).
5. `LEARNINGS.md` (edit) — flip LRN-160 / LRN-161 / LRN-173 `open → applied` at close-out with the merge SHA per C92-6.

## User-approval gates

- **G-semver-knob (OQ1)** — confirm with the orchestrator/user before adding any operator-visible `--retries` / `--no-verify-reviewer` CLI flag (which would make the CS **Minor** instead of **Patch**). Default: internal-only, no new flag.

## Exit criteria

1. A transient GraphQL 401 (no `auth-missing` kind) injected on any seam call is retried and the engage still succeeds within the retry budget; a real `auth-missing` error fails fast with no retry.
2. A silent `--add-reviewer` no-op self-heals via one re-add, or fails fast as `reviewer-not-requested` — never as a full poll timeout worded "review request was accepted".
3. No-poll mode returns/prints `verified: false`; the default poll success returns `verified: true` only for a Copilot review at PR HEAD submitted after the floor (existing guarantee regression-locked).
4. `node bin/harness.mjs lint --quiet` exits 0; `node --test tests/*.test.mjs` green; `node -c bin/harness.mjs` clean; `harness sync --mode=check` no drift.
5. `CHANGELOG.md` `[Unreleased]` entry present; LRN-160/161/173 flipped `applied` with the merge SHA at close-out.

## Risks + open questions

| # | Risk / open question | Mitigation |
|---|---|---|
| R1 | Retrying a **non-transient** failure (real missing token, permission/scope denial) would mask a genuine error and waste the full backoff budget. **`kind: 'network'` conflates** a real `gh pr edit` permission/scope denial with a transport blip (`lib/github-graphql.mjs:294-311`). | Retry **only** a positively-identified transient error (401-without-`auth-missing`, ≥500, or an explicit transport/timeout); the classifier keys off enriched status/exit/stderr signal, **not** the coarse `kind` (C92-1). `auth-missing`/`bad-input`/fork-source and permission/scope failures fail fast. Regression tests C92-5b (`auth-missing`) **and** C92-5g (permission-scope) assert no retry. |
| R2 | An unbounded re-add on a persistently-empty `requested_reviewers` could loop. | Re-add **exactly once**, then fail with `reviewer-not-requested` (C92-2). Test C92-5d locks the single-retry bound. |
| R3 | Concurrent claim of **CS87** (which edits the same `copilot-engage` help block wording) races this CS's `bin/harness.mjs` edit. | Whichever claims second rebases onto the first; the edits are disjoint (CS87 = help *string* `requestReviews`→`add-reviewer`; CS92 = result rendering/exit + internal defaults). Note the coupling in both files' dispatch briefings. |
| OQ1 | Expose retry/verify as CLI flags (Minor, operator control) or keep internal (Patch, simpler surface)? | Plan-review + G-semver-knob input. Default: internal-only ⇒ Patch. |
| OQ2 | Is LRN-173 fully closed by the existing poll `commit.oid` guarantee such that only the no-poll `verified` flag remains, or is a further settle/re-poll window wanted for the API-lag LRN-173 also notes? | Confirm at implementation: the poll loop already re-queries until timeout, so API lag is absorbed by polling; the no-poll `verified:false` flag is the honest residual fix. Record the decision in `## Notes`. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | rubber-duck (CS92-plan-review) | 8bbf1194b7d7 | 2026-07-02T21:56:00Z | Needs-Fix | Facts confirmed. Blocking: C92-1 transient class too broad (kind:'network' conflates permission fails). +3 amendments: Background overstate, C92-2 fail-open wording, C92-4 exit-code/SemVer. |
| R2 | gpt-5.5 | claude-opus-4.8 | rubber-duck (CS92-plan-review-r2) | b38493369713 | 2026-07-02T22:06:00Z | Go | All 4 R1 findings resolved (C92-1 narrowed + error-surface enrichment; Background fix; C92-2 typed/unverified; C92-3/4 exit-0 preserved, verified additive). No new findings. |
| R3 | gpt-5.5 | claude-opus-4.8 | rubber-duck (cs92-plan-review-r3) | 13c085765b80 | 2026-07-02T22:20:00Z | Go | Re-attest after administrative renumber CS88→CS92 / C88→C92 (collision with merged #401). Renumber clean, R2 findings intact, no substantive change, no new issues. |

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | omni-ah-c2 |
| Reviewer agent | rubber-duck (orchestrator: omni-ah-c2) |
| Notes | **Patch** SemVer (reliability fix; exit codes unchanged, `verified` output additive; no schema/flag). Independence per REVIEWS § 2.3 — reviewer `gpt-5.5` ≠ implementer `claude-opus-4.8`. Plan reviewed by gpt-5.5 (R3 Go, hash `13c085765b80`). Finalized at close-out. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1 — lib: enrich `GraphQLError` (http status / exit code / stderr snippet) + `isTransientGhError` predicate + `withRetry` around seam calls incl. in-place retry in `pollForCopilotReview` (C92-1); post-add `requested_reviewers` verify + one bounded re-add w/ `reviewer-not-requested` fast-fail + `reviewer-verify-unavailable` typed error (C92-2); additive `verified` flag, no-poll ⇒ `verified:false` exit 0 (C92-3) | planned | cs92-impl | agent-id=cs92-impl \| role=implementer \| report-status=pending \| learnings=0 |
| T2 — `bin/harness.mjs`: `copilot-engage` result rendering/wording (requested-unverified vs verified-at-HEAD) + wire internal retry/verify defaults; exit codes unchanged (C92-3/C92-4) | planned | cs92-impl | agent-id=cs92-impl \| role=implementer \| report-status=pending \| learnings=0 |
| T3 — tests: 7 `__testSeam` cases (C92-5) + `CHANGELOG.md` `[Unreleased]` Fixed (C92-4); `os.tmpdir()` scratch only | planned | cs92-impl | agent-id=cs92-impl \| role=implementer \| report-status=pending \| learnings=0 |
| Close-out: docs + restart state | planned | omni-ah-c2 | Update WORKBOARD.md (remove CS92 row) + CONTEXT.md; no rendered-mirror change expected (lib/CLI only). |
| Close-out: learnings + follow-ups | planned | omni-ah-c2 | Flip LRN-160 / LRN-161 / LRN-173 `open → applied` w/ merge SHA (C92-6); file any new learnings. |

## Notes / Learnings

## Plan-vs-implementation review

**Reviewer:** GPT-5.5 (rubber-duck; background agent `cs92-pvi`, independent of the claude-opus-4.8 implementer per REVIEWS § 2.3)
**Date:** 2026-07-03T01:39:00Z
**Outcome:** GO

Reviewed the CS92 plan (§ Decisions C92-1…C92-6, § Deliverables 1–5) against the merged content diff `bfaa3e6..45e4e9b` (PR #405).

| Deliverable | Outcome | Assessment |
|---|---|---|
| 1 — `lib/copilot-engage.mjs` + `lib/github-graphql.mjs` | match | Enriched `GraphQLError` (httpStatus/exitCode/stderr/transport) + `isTransientGhError` predicate + `withRetry` (incl. in-place poll retry); post-add `requested_reviewers` verify + one bounded re-add; typed `reviewer-not-requested` / `reviewer-verify-unavailable`; additive `verified` flag. |
| 2 — `bin/harness.mjs` | match | CLI distinguishes `requested (unverified)` vs verified-at-HEAD; existing error-kind exit codes preserved, new typed kinds mapped (`reviewer-not-requested`→6, `reviewer-verify-unavailable`→4). |
| 3 — `tests/*.test.mjs` | match | CS92 test file covers all seven C92-5 seam cases (a–g) + `isTransientGhError` truth table + unreadable-list edges; `os.tmpdir()` scratch only. |
| 4 — `CHANGELOG.md` | match | `[Unreleased]` → Fixed/Patch entry; explicitly states the poll-at-HEAD guarantee pre-existed/unchanged (no § 2.6a overclaim). |
| 5 — `LEARNINGS.md` (flip LRN-160/161/173) | deferred-to-closeout | Expected — the LRN flips are close-out work performed after this gate, not a content-PR defect. |

**Test-coverage assessment:** sufficient — non-vacuous coverage for (a) transient-401 retry, (b) auth-missing no-retry, (c) add no-op self-heal, (d) add no-op fast-fail, (e) no-poll `verified:false` exit 0, (f) verified-at-HEAD-after-floor, (g) permission/scope not retried. Validation: `node --test tests/*.test.mjs` → 1678 tests, 1677 pass, 0 fail, 1 skip; `node bin/harness.mjs lint --quiet` → 35 passed, 0 failed, 3 skipped.

No scope creep (no schema change, no new CLI flag, CS87 `requestReviews` help wording untouched). Review rounds: rubber-duck R1 (`6a5f76b`) Go + R2 re-attest (`04cdedf`) Go; Copilot review attached at final HEAD.
