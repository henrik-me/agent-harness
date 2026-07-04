# CS87 — `copilot-engage --help` accuracy: "requestReviews mutation" → REST review-request wording

**Status:** active
**Owner:** yoga-ah-c2
**Branch:** cs87/content
**Started:** 2026-07-04
**Closed:** —
**Filed by:** CS87 filed at CS65 close-out (2026-07-02 by `omni-ah-c3`) — the GPT-5.5 plan-vs-implementation review's 1 non-blocking finding, re-homed from the closed CS65 file into a visible planned CS per the "follow-ups must be a planned CS or a learning" convention.
**Depends on:** none.

## Goal

Fix the factual inaccuracy in `harness copilot-engage --help`: it describes the engagement as a **"requestReviews mutation"** in three places, but the actual — and correctly documented — engagement primitive is the REST `gh pr edit --add-reviewer copilot-pull-request-reviewer`. The `requestReviews` GraphQL mutation was proven (CS37 / ADR-0004 § ADR4-2) to REJECT the Copilot reviewer because it is a `Bot`, not a `User`. The help text self-contradicts (its opening line already says "via `gh pr edit --add-reviewer`"), so this is a pure wording correction with no runtime change.

## Background

Surfaced by the GPT-5.5 plan-vs-implementation review of CS65 (recorded in `done_cs65_process-doc-right-sizing` § Plan-vs-implementation review) as its single non-blocking finding; pre-existing, not introduced by CS65. The correct REST-vs-GraphQL doctrine is retained in `OPERATIONS.md` (§ Copilot engagement procedure — the `requestReviews` mutation "REJECTS the Copilot reviewer ID … because the Copilot reviewer is `__typename: Bot`") and in `lib/copilot-engage.mjs`, so only the CLI help string is stale.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C87-1 | Correct the stale wording | In the `copilot-engage` help block in `bin/harness.mjs` (the `--no-poll` option description at ~L515 + the two exit-code descriptions ~L532/L534), replace "requestReviews mutation" / "mutation accepted" with "review request (`gh pr edit --add-reviewer`)" / "request accepted". Help-text only — no change to `lib/copilot-engage.mjs` runtime, no flag/behavior change. | Aligns the help with the shipped engagement primitive (REST `add-reviewer`, per CS37/ADR-0004) and with the help's own opening line; removes a self-contradiction that misleads readers into thinking a GraphQL mutation is used. |
| C87-2 | Regression guard | **Extend** the existing `tests/cli-copilot-engage.test.mjs` help-output test to assert `copilot-engage --help` does NOT match `/requestReviews\|mutation accepted/` and DOES reference `gh pr edit --add-reviewer` (help output only). | A tiny always-on assertion prevents the stale wording from creeping back; the existing help-output test is the lowest-friction home (mirrors the CS44 docs/impl-alignment watchdog pattern). |

## Deliverables

1. `bin/harness.mjs` — `copilot-engage` help-text wording corrected (usage line + exit-code descriptions). (C87-1)
2. A regression assertion (C87-2) **extending** `tests/cli-copilot-engage.test.mjs`'s help-output test — `doesNotMatch(/requestReviews\|mutation accepted/)` + `match(/gh pr edit --add-reviewer/)`.
3. `CHANGELOG.md` `[Unreleased]` entry (documentation/help-accuracy fix).

## User-approval gates

- (none)

## Exit criteria

1. `harness copilot-engage --help` contains no "requestReviews mutation" / "mutation accepted" wording and consistently attributes engagement to `gh pr edit --add-reviewer`. (C87-1)
2. No runtime/flag/exit-code behavior change (help string only); `node -c bin/harness.mjs` clean.
3. `harness lint` passes; `node --test tests/*.test.mjs` green.
4. Plan-vs-implementation review (GPT-5.5 gate) returns GO.
5. `CHANGELOG.md` `[Unreleased]` entry present.

## Risks + open questions

| # | Risk / what breaks | Mitigation |
|---|---|---|
| R1 | A downstream test pins the old help wording. | Grep `tests/` for the stale **help-specific** phrases (`requestReviews mutation`, `mutation accepted`, `--no-poll.*requestReviews`) — NOT all `requestReviews` mentions, since `OPERATIONS.md` legitimately documents `requestReviews` as the *rejected* primitive — per CS65 LRN-181; update any such assertion in the same PR. |
| Q1 | Resolved by plan-review (Go-with-amendments): a regression assertion IS worth it. | Extend `tests/cli-copilot-engage.test.mjs`'s existing help-output test (C87-2). |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: omni-ah-c3) | 735219bc47ce | 2026-07-02T20:15:00Z | Go-with-amendments | Premise sound (help self-contradicts; runtime uses REST add-reviewer). Amendments applied: targeted stale-help grep (R1) + regression assertion in cli-copilot-engage.test (C87-2). |

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | yoga-ah-c2 |
| Reviewer agent | rubber-duck (orchestrator: yoga-ah-c2) |
| Notes | **Patch** SemVer (help-text wording fix in `bin/harness.mjs` + regression assertion + CHANGELOG; no flag/behavior/schema change). Independence per REVIEWS § 2.3 — reviewer `gpt-5.5` ≠ implementer `claude-opus-4.8`. Plan reviewed by gpt-5.5 (R1 Go-with-amendments, hash `735219bc47ce`). Finalized at close-out. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1 — `bin/harness.mjs`: correct `copilot-engage` help wording (C87-1) — `--no-poll` description + two exit-code descriptions: "requestReviews mutation" / "mutation accepted" → REST review-request (`gh pr edit --add-reviewer`) / "request accepted". Help-string only, no runtime change | active | yoga-ah-c2 | agent-id=cs87-help \| role=implementer \| report-status=pending \| learnings=0 |
| T2 — `tests/cli-copilot-engage.test.mjs`: extend the help-output test with a regression assertion (C87-2) — help does NOT contain `requestReviews` / `mutation accepted`, DOES reference `gh pr edit --add-reviewer`; `CHANGELOG.md` `[Unreleased]` help-accuracy entry | active | yoga-ah-c2 | agent-id=cs87-help \| role=implementer \| report-status=pending \| learnings=0 |
| Independent content review (GPT-5.5) | pending | — | reviewer model ≠ implementer (independence per REVIEWS § 2.3); via `harness review` |
| Close-out: docs + restart state | pending | yoga-ah-c2 | Update WORKBOARD.md (remove CS87 row) + CONTEXT.md; no rendered-mirror change (bin/tests/CHANGELOG only). |
| Close-out: learnings + follow-ups | pending | yoga-ah-c2 | File any LEARNINGS.md entry (or none) + disposition follow-ups; no open issue tied to CS87. |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
