# CS52 — `harness review <pr>` content-PR review orchestrator

**Status:** done
**Owner:** yoga-ah
**Branch:** —
**Started:** —
**Closed:** 2026-05-14
**Filed by:** Issue [#141](https://github.com/henrik-me/agent-harness/issues/141) — consolidate ad-hoc rubber-duck dispatch, Copilot engagement, and PR-body review evidence updates into one canonical CLI command.
**Depends on:** CS40 (`harness review-output`) and CS41 (`harness copilot-engage` / review gates default flip). May land independently after those are present on main.

## Goal

Add `harness review <pr>` as the canonical local orchestrator command for content-PR review rounds. The command should validate that the target PR is a CS content PR, guard reviewer independence, produce the GPT-5.5 (or permitted fallback) rubber-duck dispatch artefact, trigger/poll Copilot review, update the PR body's `## Review log` and `## Model audit` sections idempotently, and exit with a meaningful verdict code.

## Background

Issue #141 records that the review-production side of the harness was still manual even after the verification gates existed. Orchestrators had to remember how to dispatch an independent rubber-duck reviewer, how to request Copilot review, and how to edit PR-body evidence without duplicating rows or drifting from the required table shape. This CS implements the local producer command that pairs with the existing PR-evidence verification checks.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C52-1 | CLI entry point | Add `harness review <pr>` with flags `--repo`, `--rubber-duck-only`, `--copilot-only`, `--model`, `--round`, `--dry-run`, `--no-poll`, and `--timeout-minutes`. Accept content branches following the repo convention `cs<NN>/<slug>` while still refusing workboard-only/fork PRs. | Mirrors issue #141 and gives orchestrators one memorable command for the full review-production path without rejecting current harness branch naming. |
| C52-2 | Rubber-duck dispatch implementation | MVP is manual-provider based: the CLI composes and prints the guardrailed reviewer prompt, then consumes pasted structured reviewer output from stdin unless `--dry-run`, `--no-poll`, or `--copilot-only` is used. | The harness has no model-provider dependency and should not require API credentials in consumer repos. This still centralizes the independence guard, prompt shape, verdict parsing, and PR-body update. |
| C52-3 | Copilot trigger | Default `reviews.copilot_trigger` is `mention`, posting `@copilot review` via `gh api`; `reviewer` remains supported for repos where reviewer attachment works. | The mention path avoids the collaborator-status trap called out in issue #141 while allowing the CS41 reviewer path where desired. |
| C52-4 | Configuration | Add a `reviews` block to `harness.config.json` and schema with `rubber_duck_model`, `fallback_model`, `require_copilot_review`, `copilot_trigger`, `review_timeout_minutes`, and `high_risk_clickstops`. | Keeps review policy defaults visible and lets consumers disable Copilot production where unavailable without disabling PR-evidence verification globally. |
| C52-5 | Independence guard | Parse implementer models from `## Model audit`, plan-review rows, and sub-agent ledger model notes in the clickstop file; refuse reviewer-model overlap and refuse fallback model on configured high-risk CS IDs. | Closes the PR #28 class of implementer/self-review mistakes while preserving the REVIEWS.md fallback ladder. |
| C52-6 | PR-body updates | Append review-log rows idempotently by round/head/actor/model/verdict and upsert field-value model-audit rows. | Re-running after a fix round must add `R2`, not duplicate `R1`, and must preserve compatible existing body content. |
| C52-7 | Exit codes | Exit `0` for Go / dry-run / dispatch accepted, `1` for No-Go or unresolved Blocking findings, and `2` for usage, policy, timeout, or transport failures. | Matches issue #141 and makes the command scriptable by orchestrators and release checklists. |
| C52-8 | Docs and generated roots | Edit composed templates (`template/composed/OPERATIONS.md`, `template/composed/REVIEWS.md`) and regenerate roots via `harness sync --mode=apply --resolved-sha <sha>`. | Composed templates are source-of-truth for process docs; root docs must not be hand-edited. |
| C52-9 | Tests | Add targeted CLI and library tests for help/flag errors/dry-run, independence guard, review-log idempotency, verdict computation, and mocked Copilot trigger. | Locks the new user-facing CLI contract without requiring network access or live model calls. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.7 | rubber-duck dispatched (orchestrator: yoga-ah) | 83f0c05f6d4c | 2026-05-14T22:00:00Z | Go-with-amendments | Issue #141 plan accepted with manual rubber-duck MVP, explicit reviews config, docs/sync workflow, and network-free regression tests. |

## Deliverables

1. **`lib/review.mjs`** — new review orchestration library with config loading, PR validation, reviewer-independence guard, prompt composition, Copilot trigger/poll helpers, verdict calculation, and PR-body update helpers.
2. **`bin/harness.mjs`** — register `review` subcommand, help text, argument parsing, dry-run/no-poll/manual-stdin UX, actor derivation, and exit-code mapping.
3. **`harness.config.json` + `schemas/harness.config.schema.json`** — add `reviews` defaults and schema validation for all config fields in C52-4.
4. **Tests** — add `tests/cs52-harness-review-cli.test.mjs` and `tests/cs52-harness-review-lib.test.mjs` with network-free coverage for C52-1 through C52-7.
5. **Docs** — update `template/composed/OPERATIONS.md` and `template/composed/REVIEWS.md`; run sync to regenerate `OPERATIONS.md`, `REVIEWS.md`, and `.harness-lock.json`.
6. **CHANGELOG.md** — add an `[Unreleased] / Added` entry for CS52 / #141.
7. **Validation evidence** — targeted CS52 tests pass; `harness lint --quiet` passes; `harness sync --mode=check` reports no drift; `harness review --help` documents all flags and exit codes; PR body lint passes before opening the PR.
8. **Content PR** — push `cs52/harness-review-cli`, open a PR titled `CS52: harness review <pr> CLI subcommand (closes #141)`, and request Copilot review via the harness tooling.

## Sub-agent fan-out

No sub-agent fan-out is required for implementation. The surface is cross-cutting but small enough for a single orchestrator to own without file-ownership races.

## Exit criteria

1. `node --test tests\cs52-harness-review-*.test.mjs` passes.
2. `node bin\harness.mjs review --help` lists every flag from C52-1 and the exit-code contract from C52-7.
3. `node bin\harness.mjs lint --quiet` exits 0.
4. `node bin\harness.mjs sync --mode=check` exits 0 after generated docs are refreshed.
5. `scripts/check-pr-body.mjs` accepts the opened PR body containing `## Review log` and `## Model audit` evidence.
6. The PR references and closes issue #141.

## Risks + open questions

| # | Risk | Mitigation |
|---|---|---|
| R1 | Fully automatic GPT-5.5 dispatch would require model-provider credentials and runtime dependencies that the harness does not currently own. | C52-2 defines the MVP as prompt emission + pasted structured output; future CS can add provider plugins if desired. |
| R2 | `gh` network calls cannot be exercised reliably in unit tests. | Put network interactions behind seams and cover them with mocked `spawnSync` / GraphQL helpers; reserve live verification for PR review. |
| R3 | PR-body table variants may appear in consumer repos. | Parse by header names and fall back to canonical sections only when malformed or missing. |
| R4 | Copilot review can arrive asynchronously after timeout. | Configurable timeout and `--no-poll` mode let orchestrators dispatch now and verify later with existing PR-evidence gates. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| Implement `lib/review.mjs` orchestration helpers | in-progress | yoga-ah | Manual rubber-duck MVP, Copilot trigger, polling, verdict, PR-body helpers. |
| Wire `harness review` CLI | in-progress | yoga-ah | Help, parser, dry-run, no-poll/manual stdin, exit codes. |
| Add config/schema defaults | in-progress | yoga-ah | `reviews` block in root config + schema. |
| Add tests | in-progress | yoga-ah | CLI + library targeted tests. |
| Update docs + changelog + planned CS file | in-progress | yoga-ah | Template docs first, root docs via sync. |
| Validate, push, open PR, request Copilot | planned | yoga-ah | See Exit criteria. |
| Close-out: update workboard/context restart-state docs | done | yoga-ah | Retroactive 2026-05-14 via PR #204; CS52 lifecycle compressed (no `active/` rename). |
| Close-out: file learnings/follow-up planned CS | done | yoga-ah | LRN-131 filed in PR #204 codifying lifecycle-compression doctrine. |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

**Reviewer:** none (deferred — close-out compressed during SI-feedback velocity batch)
**Date:** 2026-05-14
**Outcome:** Deferred — see "## Close-out compression note" below.

## Close-out compression note

CS52 was implemented and merged via [PR #196](https://github.com/henrik-me/agent-harness/pull/196) (squash `80325b8`) on 2026-05-14 as part of the SI-feedback velocity batch. Same lifecycle compression as CS48 (see `done_cs48_*.md` § Close-out compression note for the full rationale, including the Tasks-table-stale convention). Retroactively renamed `planned/ → done/` in PR #204 (commit-dated 2026-05-14). The `## Tasks` table above is the at-merge snapshot — only the explicit `Close-out: …` rows added in PR #204 reflect post-merge state.
