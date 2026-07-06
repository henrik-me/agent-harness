# CS113 — fix `harness review` evidence-stamping (A3/A5): stamp a reviewer identity + stop appending a Copilot-engage local Go row

**Status:** active
**Owner:** yoga-ah
**Branch:** cs113/content
**Started:** 2026-07-06
**Closed:** —
**Filed by:** yoga-ah (orchestrator, Claude Opus 4.8) — weekly-harvest disposition (2026-07-05) of open learnings LRN-197 / LRN-210 / LRN-211 (recurring review-evidence tooling gap that trips A3/A5 on nearly every content PR).
**Depends on:** none

## Goal

Make `harness review <pr>` produce review evidence that passes the two read-only CI gates it currently trips on nearly every content PR:

- **A3** (`scripts/check-review-evidence.mjs`) — model-audit agent-identity independence: `## Model audit` **Reviewer agent** must differ from **Implementer agent**.
- **A5** (`scripts/check-copilot-review.mjs`) — review ordering: the latest Copilot review must post-date the latest *local* `## Review log` Go row.

Both the single-call `harness review <pr>` flow and the `--copilot-only` leg must leave the PR body green against A3 and A5 without manual post-editing, while preserving the already-correct single-call "record local Go, then engage Copilot" ordering.

## Background

`harness review` writes its review evidence into the PR body through `lib/review.mjs`. `updatePrBodyWithReview` (`lib/review.mjs:522-525`) calls `upsertModelAudit` (upserts the `## Model audit` `Implementer models` / `Reviewer model` / `Reviewer agent` rows) then `appendReviewLogRow` (appends a `## Review log` row). Both legs reach it at `lib/review.mjs:242`.

**A3 root cause (both legs — LRN-211 / LRN-197 / LRN-210).** The `## Model audit` **Reviewer agent** row is stamped at `lib/review.mjs:703` from `opts.reviewerAgent || opts.actor || 'harness-review'`. But `reviewerAgent` is bound to `actor` in two places: the lib default `reviewerAgent = actor` (`lib/review.mjs:96`) and the CLI call site `reviewerAgent: actor` (`bin/harness.mjs:4158`). `actor` is `deriveReviewActor(...)` (`bin/harness.mjs:4128`), which returns the orchestrator agent-id `${machine}-${suffix}${cloneSuffix}` — e.g. `yoga-ah-c2` (`bin/harness.mjs:4282-4290`). Because the PR body's `Implementer agent` is that same orchestrator id, the A3 predicate `implementerAgent === reviewerAgent` (`scripts/check-review-evidence.mjs:539`; rows read at `:497-501`, `:522-523`) fires: *"Implementer agent and Reviewer agent are both `<id>`"*. This trips on the single-call flow (LRN-211, CS89 PR #500 — `yoga-ah-c2`) and the `--copilot-only` flow (LRN-197/210, CS87 PR #460 / CS88 PR #494).

**Single-call is already A5-safe (must be preserved — LRN-211).** In the single-call flow the local Go moment `localGoAt` is captured BEFORE Copilot is engaged (`lib/review.mjs:219`), passed as the engage poll floor `submittedAfter = localGoAt` (`lib/review.mjs:236`), and Copilot is engaged AFTER (`lib/review.mjs:224-239`). The `## Review log` Go-row timestamp reuses `localGoAt` (`lib/review.mjs:258`), so Copilot's async `submittedAt` (~3 min later) correctly post-dates the local Go. LRN-211 confirms the single-call flow trips ONLY A3, not A5.

**A5 root cause (`--copilot-only` only — LRN-197 / LRN-210).** With `--copilot-only`, `copilotOnly=true` ⇒ `rubberDuck=null` and `localGoAt=null`, yet `updatePrBodyWithReview` still runs (`lib/review.mjs:242`). It (a) rewrites **Reviewer agent** to the orchestrator id (A3, as above) and (b) appends a `## Review log` Go row whose `timestamp` falls back to `__testSeam.now()` — record time — because `timestamp` is `null` when `localGoAt` is null (`lib/review.mjs:258`, `:571`), with `actor` = the orchestrator id. `findLatestLocalGoTimestamp` only excludes rows whose `actor`/`model` matches `copilot-pull-request-reviewer` (`scripts/check-copilot-review.mjs:360`; `COPILOT_LOGIN` at `:39`), so that orchestrator-actor Go row counts as the latest *local* Go and post-dates by ~1s the Copilot review it records ⇒ A5 (`scripts/check-copilot-review.mjs:290`, floor from `:286`) fails. A16 already sources Copilot review evidence directly from GitHub, so this Review-log row is redundant.

**Evidence format (REVIEWS.md § 2.8).** `## Review log` columns are `timestamp | analyzed_head | actor | model | verdict | evidence_link` (`REVIEWS.md:460`); `actor` carries round/role annotations such as `rubber-duck` (`REVIEWS.md:469`); `model` must be a bare reviewer-model id (`REVIEWS.md:470`). `## Model audit` requires distinct `Implementer agent` ≠ `Reviewer agent` (`REVIEWS.md:581`), and `rubber-duck` is an established reviewer-agent identity (`REVIEWS.md:626`; LRN-210 `LEARNINGS.md:267-273`).

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C113-1 | A3 fix — stamp a reviewer identity in BOTH legs | Decouple `reviewerAgent` from `actor` so `harness review` stamps `## Model audit` **Reviewer agent** with a REVIEWER identity (default `rubber-duck`), NEVER the orchestrator/implementer agent-id. Change the lib default `reviewerAgent = actor` (`lib/review.mjs:96`) to a reviewer-identity default and stop passing `reviewerAgent: actor` at the CLI call site (`bin/harness.mjs:4158`); the `upsertModelAudit` stamping site (`lib/review.mjs:703`) then writes a reviewer id in both the single-call and `--copilot-only` legs. | A3 (`scripts/check-review-evidence.mjs:539`) fails whenever `Reviewer agent == Implementer agent`; the orchestrator id IS the implementer id, so stamping a distinct reviewer identity is the root-cause fix. `rubber-duck` is the established reviewer-agent convention (`REVIEWS.md:626`; LRN-210 `LEARNINGS.md:267-273`) and is exactly the value the LRN-210/211 manual workarounds restore. |
| C113-2 | A5 + evidence-preservation — `--copilot-only` leg | (a) The `--copilot-only` leg must PRESERVE pre-existing rubber-duck `## Model audit` (`Reviewer model` / `Reviewer agent`) and `## Review log` rows instead of overwriting/regenerating them with the orchestrator id. (b) It must EITHER not append a `## Review log` Go row for the Copilot engagement (preferred — A16 already sources Copilot evidence from GitHub, so the row is redundant), OR append it with `actor=copilot-pull-request-reviewer` so `findLatestLocalGoTimestamp` (`scripts/check-copilot-review.mjs:360`) excludes it from the A5 floor. | Removes the orchestrator-actor Go row that post-dates the Copilot review by ~1s and trips A5 (`scripts/check-copilot-review.mjs:290`), and stops `--copilot-only` from clobbering the out-of-band rubber-duck evidence LRN-197 documented. |
| C113-3 | Invariant + preserve single-call ordering | After ANY `harness review` run: (i) `## Model audit` **Reviewer agent** ≠ **Implementer agent**, and (ii) no orchestrator/local Go `## Review log` row post-dates the Copilot review it records. The single-call ordering — record `localGoAt` first (`lib/review.mjs:219`), then engage Copilot with `submittedAfter = localGoAt` (`lib/review.mjs:236`) — MUST be preserved unchanged. | LRN-211 confirms the single-call "localGo first then engage" ordering already keeps A5 green; the fix must not regress it while curing A3. |
| C113-4 | Regression tests (minimums) | Add `node --test` coverage: (a) after a single-call `harness review`, the PR body `## Model audit` **Reviewer agent** is a reviewer id (≠ the implementer/orchestrator agent-id); (b) after `--copilot-only`, pre-existing rubber-duck `## Model audit` / `## Review log` rows are preserved AND no local-actor Go row post-dates the recorded Copilot review (either no such row is appended, or its `actor` is `copilot-pull-request-reviewer`). Update any existing test that asserts the old `Reviewer agent == actor` behavior. MINIMUMS only. | Locks the two recurring failures (A3 both legs; A5 `--copilot-only`) so they cannot silently regress. |
| C113-5 | SemVer classification | **Patch.** Behavioral fix to `harness review` evidence output; no new CLI flag, no schema change, no new/changed managed or composed surface. | The fix changes only default stamping values and the `--copilot-only` Review-log behavior — a bug fix, not new capability. A configurable reviewer-agent override flag (if ever wanted) would be a separate Minor follow-up and is out of scope here. |

## Deliverables

1. `lib/review.mjs` — decouple `reviewerAgent` from `actor` (default to a reviewer identity, e.g. a `rubber-duck` constant) so `upsertModelAudit` (`:703`) stamps `Reviewer agent` with a reviewer id in BOTH legs (C113-1); make the `--copilot-only` leg preserve pre-existing rubber-duck `## Model audit` / `## Review log` evidence and NOT append an orchestrator-actor Go row that post-dates Copilot — append nothing, or `actor=copilot-pull-request-reviewer` (C113-2); leave the single-call `localGoAt` → engage ordering (`:219`, `:236`, `:258`) unchanged (C113-3).
2. `bin/harness.mjs` — stop binding `reviewerAgent: actor` at the `runReview` call site (`:4158`); pass the reviewer identity instead (C113-1). The `actor` value continues to feed the `## Review log` `actor` column (`REVIEWS.md:469`); keeping it as the orchestrator id is A5-neutral for the single-call flow (LRN-211).
3. Tests (`node --test`, in `tests/`) per C113-4.
4. `CHANGELOG.md` `[Unreleased]` → `Fixed` entry describing the A3/A5 evidence-stamping fix (Patch).
5. `harness lint` green; `node --test tests/*.test.mjs` green.

## User-approval gates

None. This is a low-risk, self-contained tooling fix to `harness review` output stamping — no schema change, no new CLI surface, no security-sensitive workflow change. (If implementation surfaces a need for a new flag or a schema field, that crosses the CS boundary and must be escalated, not decided in-band.)

## Exit criteria

1. After a single-call `harness review <pr>`, the PR body `## Model audit` **Reviewer agent** ≠ **Implementer agent** (A3 green), and the single-call `localGoAt` → engage ordering is unchanged so A5 stays green.
2. After `harness review <pr> --copilot-only`, pre-existing rubber-duck `## Model audit` / `## Review log` rows are preserved; no orchestrator/local-actor Go row post-dates the recorded Copilot review (A5 green); `Reviewer agent` ≠ `Implementer agent` (A3 green).
3. `scripts/check-review-evidence.mjs` (A3) and `scripts/check-copilot-review.mjs` (A5) both pass against a representative PR body produced by each leg.
4. Regression tests (C113-4) added and green.
5. `harness lint` + `node --test tests/*.test.mjs` green; `CHANGELOG.md` `[Unreleased]` updated.
6. Plan-vs-implementation review (GPT-5.5) GO.

## Risks + open questions

| # | Risk / what breaks | Mitigation |
|---|---|---|
| R1 | Changing the `## Review log` `actor` value could disturb other consumers of that column. | Change ONLY the `## Model audit` **Reviewer agent** stamping (C113-1) and the `--copilot-only` Go-row behavior (C113-2); leave the single-call `actor` column as-is. A5-neutral for the single-call flow per LRN-211. |
| R2 | Suppressing the `--copilot-only` Review-log Go row could be seen as losing an audit trail. | A16 already sources Copilot review evidence directly from GitHub (`scripts/check-copilot-review.mjs`, `COPILOT_LOGIN` at `:39`), so the row is redundant. If an audit row is still desired, stamp it `actor=copilot-pull-request-reviewer` (excluded from the A5 floor by `:360`). |
| R3 | A hard-coded `rubber-duck` reviewer identity may not match a differently-named dispatched reviewer. | `rubber-duck` is the established convention (`REVIEWS.md:626`; LRN-210 `LEARNINGS.md:267-273`) and satisfies A3 (distinct from the orchestrator implementer id). A configurable reviewer-agent override is a separate Minor follow-up, not required to green A3/A5. |
| Q1 | Should the single-call `## Review log` `actor` also be aligned to `rubber-duck` for consistency with the Model audit? | A5-neutral (LRN-211). Resolve at implementation: default to preserving the orchestrator id for provenance, or align per LRN-210's "Review log rubber-duck-only" guidance. Either satisfies the gates. |
| Q2 | Do existing tests assert the old `Reviewer agent == actor` / copilot-only Go-row behavior? | Re-verify at claim HEAD (`grep` `tests/` for `reviewerAgent` / `Reviewer agent` / `copilot-only`) and update expectations as part of C113-4. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | cs113-plan-review (yoga-ah) | b806d9f984dc | 2026-07-06T04:17:25Z | Go-with-amendments | Verified A3 root cause (reviewerAgent=actor, two sites) + A5 asymmetry + Patch classification; applied rubber-duck citation fix (REVIEWS.md:593 was copilot → :626 / LRN-210). |

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | yoga-ah |
| Reviewer agent | rubber-duck (orchestrator: yoga-ah) |
| Notes | CS113 fixes `harness review` A3/A5 evidence-stamping (LRN-197/210/211). Independence per REVIEWS.md § 2.3 — reviewer `gpt-5.5` ≠ implementer `claude-opus-4.8`. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| C113-1: A3 fix — decouple `reviewerAgent` from `actor` so `harness review` stamps `## Model audit` **Reviewer agent** with a reviewer identity (default `rubber-duck`) in BOTH legs (`lib/review.mjs`, `bin/harness.mjs`) | pending | yoga-ah | role=implementer \| report-status=pending |
| C113-2: A5 + evidence-preservation — `--copilot-only` leg preserves pre-existing rubber-duck `## Model audit`/`## Review log` rows and does NOT append an orchestrator-actor Go row (append nothing, or `actor=copilot-pull-request-reviewer`) | pending | yoga-ah | role=implementer \| report-status=pending |
| C113-3: preserve single-call `localGoAt`→engage ordering (`lib/review.mjs` localGo-first/engage-after) unchanged | pending | yoga-ah | role=implementer \| report-status=pending |
| C113-4: regression tests (`node --test`) — reviewer-id ≠ implementer-id after single-call; `--copilot-only` preserves evidence + no local Go postdates Copilot | pending | yoga-ah | role=implementer \| report-status=pending |
| CHANGELOG.md: add `[Unreleased]` → `Fixed` entry (Patch) | pending | yoga-ah | report-status=pending |
| Local review — GPT-5.5 rubber-duck (independence invariant, REVIEWS.md § 2.3) + Copilot engage | pending | rubber-duck | role=reviewer \| report-status=pending |
| Close-out: docs + restart state (WORKBOARD + CONTEXT + handoff) | pending | yoga-ah | role=orchestrator \| report-status=pending |
| Close-out: learnings + follow-ups (LEARNINGS.md — flip LRN-197/210/211 → applied) | pending | yoga-ah | role=orchestrator \| report-status=pending \| learnings=0 |

## Notes / Learnings

- **Learnings addressed.** LRN-197 (`--copilot-only` regenerates evidence → A3 + A5), LRN-210 (`--copilot-only` A5 record-time Go row; A3 Reviewer-agent overwrite), LRN-211 (single-call ALSO rewrites Reviewer agent → A3; single-call ordering is A5-safe). Context: LRN-200 ("engage Copilot last"; A5 ordering doctrine) and LRN-220 (Review-log Go timestamps must be ≤ real UTC now).
- **Preserve the single-call ordering.** The `localGoAt`-first / engage-after sequence (`lib/review.mjs:219`, `:236`, `:258`) is the reason the single-call flow already passes A5; this CS must cure A3 without touching that ordering (C113-3).
- **A16 vs the copilot-engage Review-log row.** Because A16 fetches Copilot evidence from GitHub, the `--copilot-only` Review-log Go row serves no gate purpose and only trips A5; removing it (or stamping `copilot-pull-request-reviewer`) is the minimal correct fix (C113-2).

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
