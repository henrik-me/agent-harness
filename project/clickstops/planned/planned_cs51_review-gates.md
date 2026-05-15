# CS51 — Enforce REVIEWS.md as required status checks

**Status:** planned
**Owner:** copilot
**Branch:** `cs51/review-gates`
**Started:** 2026-05-14
**Closed:** —
**Depends on:** Issue [#140](https://github.com/henrik-me/agent-harness/issues/140); no in-repo CS dependency.

## Goal

Implement issue #140 by turning REVIEWS.md content-PR review doctrine into four required PR-side status checks: `review-log-evidence`, `copilot-review-attached`, `independence-invariant`, and `review-threads-resolved`.

## Background

Issue #140 records a discipline-only failure mode observed downstream: content PRs could merge without a real GPT-5.5 rubber-duck review, without Copilot review engagement, with implementer/reviewer model overlap, with unresolved review threads, or with PR-body template placeholders still present. The fix is mechanical enforcement: scripts, workflow, config/schema knobs, ruleset injection, and tests.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C51-1 | Gate granularity | Ship four independent scripts and four workflow jobs named exactly `review-log-evidence`, `copilot-review-attached`, `independence-invariant`, and `review-threads-resolved`. | Required checks must identify the failing doctrine surface directly; one aggregate job would recreate the ambiguity issue #140 reports. |
| C51-2 | Fixture mode | Every script supports `--pr-body <file>` fixture mode; GraphQL-backed checks also support `--repo <owner/repo> --pr <num>`. | Enables deterministic `node --test` coverage without GitHub network while preserving live PR enforcement. |
| C51-3 | Workflow source | Keep the requested `template/.github/workflows/review-gates.yml` path and mirror it to `template/managed/.github/workflows/review-gates.yml` for the existing file-class sync engine. | The briefing names the former; consumers need the latter because managed files are sourced from `template/managed`. A regression test enforces byte-for-byte parity. |
| C51-4 | Config shape | Add `harness.config.json → reviews` with `enforce_gates`, `require_copilot_review`, `copilot_reviewer_slug`, and `high_risk_clickstops`. Preserve existing `review_gates` for PR-evidence compatibility. | Separates issue #140's REVIEWS.md gates from the older CS36/CS37 PR-evidence gate set while avoiding a breaking rename. |
| C51-5 | Ruleset injection | `harness init --enable-review-gates` and `harness sync --mode=apply` insert the four contexts into `infra/main-protection-ruleset.json` `required_checks`; check mode reports drift. | Meets issue #140 acceptance criteria and keeps branch-protection config inspectable in-repo. |
| C51-6 | Copilot side effect | `copilot-review-attached` posts `@copilot review` when no acceptable Copilot review exists and the gate is required. | Matches the issue's requested self-healing behavior without adding an Octokit runtime dependency. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-sonnet-4.6 | rubber-duck dispatched (orchestrator: copilot) | c8c746fe3c97 | 2026-05-14T23:34:50Z | Go-with-amendments | Coherent/testable; clarify workboard-only skip predicate and live GitHub permission/failure behavior for Copilot request side effect. |

## Deliverables

1. `scripts/checks/check-review-log-evidence.mjs` — G-RG-1 PR-body review-log evidence checker.
2. `scripts/checks/check-copilot-review-attached.mjs` — G-RG-2 Copilot review presence checker with best-effort `@copilot review` comment.
3. `scripts/checks/check-independence-invariant.mjs` — G-RG-3 PR-body model-audit independence checker.
4. `scripts/checks/check-review-threads-resolved.mjs` — G-RG-4 unresolved review-thread checker.
5. `template/.github/workflows/review-gates.yml` and managed mirror — four PR jobs with `workboard-only` skip semantics.
6. `bin/harness.mjs`, `schemas/harness.config.schema.json`, `harness.config.json`, and `template/seeded/harness.config.json` — reviews config defaults and ruleset-context injection.
7. `template/composed/OPERATIONS.md`, `template/composed/REVIEWS.md`, root regenerated docs, and `CHANGELOG.md` — document required status checks and config knobs.
8. `tests/cs51-review-gates-logic.test.mjs`, `tests/cs51-review-gates-workflow.test.mjs`, and `tests/cs51-review-gates-sync.test.mjs` — deterministic coverage of scripts, workflow shape, and sync/init integration.
9. `project/clickstops/planned/planned_cs51_review-gates.md` — this CS plan with plan-review attestation.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| R1 — Workflow context naming differs from GitHub's displayed required-check context | Keep job names exactly equal to the requested check names and inject those names into `required_checks`; document any platform mismatch as a follow-up if observed. |
| R2 — Consumer repos lack Copilot PR reviews | `reviews.require_copilot_review=false` skips only the Copilot attachment gate while leaving the other three gates enforced. |
| R3 — Ruleset JSON shape varies by consumer | Injection recursively finds existing `required_checks` arrays and otherwise creates the required-status-checks rule with a `required_checks` array. |
| R4 — Duplicate workflow template paths drift | `cs51-review-gates-workflow.test.mjs` asserts requested template path and managed sync source are byte-identical. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| Implement four check scripts with `--help` and deterministic `--pr-body` mode | done | copilot | GraphQL modes included for live checks. |
| Add `review-gates.yml` workflow with four check jobs and `workboard-only` skip | done | copilot | Job names match required contexts. |
| Add reviews config/schema defaults and ruleset injection in init/sync | done | copilot | Existing `review_gates` retained. |
| Update OPERATIONS/REVIEWS docs and regenerate root composed files | done | copilot | `harness sync --mode=apply` ran after template edits. |
| Add CS51 tests for logic, workflow, and sync/init behavior | done | copilot | Targeted test suite passes locally. |
| Close-out: docs + restart state | pending | copilot | Update WORKBOARD/CONTEXT if this CS is closed by an orchestrator. |
| Close-out: learnings + follow-ups | pending | copilot | File learnings/follow-up CSs if review or CI surfaces residual gaps. |

## Notes

- Scope was implemented in an isolated sibling worktree (`C:\src\agent-harness-cs51`) because another parallel CS had the primary worktree checked out on `cs49/operations-doctrine`.
- The workflow clones the harness CLI into `.harness-ci/agent-harness` rather than assuming consumer repos contain `scripts/checks/`.
