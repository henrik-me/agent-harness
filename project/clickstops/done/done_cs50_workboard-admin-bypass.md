# CS50 — Workboard-only PR admin-bypass fallback via WORKBOARD_MERGE_TOKEN

**Status:** done
**Owner:** yoga-ah
**Branch:** `cs50/workboard-admin-bypass`
**Started:** 2026-05-14
**Closed:** 2026-05-14
**Filed by:** Issue [#138](https://github.com/henrik-me/agent-harness/issues/138), fix (a) workflow-side admin merge via per-repo PAT.
**Depends on:** None.

## Goal

Allow consumer repos that have not installed the G3 `workboard-auto-approve` GitHub App to claim and close out clickstops without a human admin-merge step. Eligible `workboard-only` PRs should still pass the existing label, branch, actor, same-repository, immutable-head, and path-allowlist validation before any credential that can merge is used.

## Background

Issue #138 was filed from `henrik-me/sub-invaders` CS02 claim friction: `workboard-auto-approve.yml` validation passed and the normal required checks were green, but the PR remained blocked because the consumer repo did not have the G3 App installed and branch protection still required one approving review. The owner had to run `gh pr merge --squash --admin --delete-branch` manually for status-only workboard transitions.

The existing workflow in this repo lives at `.github/workflows/workboard-auto-approve.yml`; the user-requested `template/.github/workflows/workboard-auto-approve.yml` path does not exist on `main`. CS50 therefore keeps the live workflow aligned with a new managed template copy at `template/managed/.github/workflows/workboard-auto-approve.yml` and surfaces the optional PAT setup from `harness init`.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C50-1 | Workflow source | Update the live workflow and add a byte-identical managed-template copy. | The live workflow is the only existing file, but consumers need a template source for fresh init/sync. |
| C50-2 | Merge credential precedence | Prefer the existing GitHub App path when App secrets are configured; use `WORKBOARD_MERGE_TOKEN` only when App credentials are absent. | Keeps the least-privilege App path primary and treats PAT admin bypass as the fallback requested by issue #138. |
| C50-3 | Validation boundary | Do not run App/PAT merge steps until label, branch, actor allowlist, same-repo metadata, immutable head, and path allowlist pass. | Preserves the security contract: the PAT cannot expand workboard-only scope. |
| C50-4 | Admin merge safety | Before `gh pr merge --admin`, re-check the PR head and poll `statusCheckRollup` so non-workboard checks must be green, neutral, or skipped; pending, null, cancelled, timed-out, action-required, or unknown states skip the admin merge. | `--admin` can bypass required checks; CS50 uses it only to bypass the missing approval after CI is reported green. |
| C50-5 | Secret absence | If neither App secrets nor `WORKBOARD_MERGE_TOKEN` are set, keep validation green and log `validation-only` with a manual-merge notice. | Backward compatible for consumers that have not created the PAT yet. |
| C50-6 | PAT documentation | Document `WORKBOARD_MERGE_TOKEN`, `contents: write`, `pull-requests: write`, and that the PAT user's account must be a `main-protection` ruleset bypass actor; mention `gh auth refresh -s admin:org` only for managing bypass actors via gh/API. | Clarifies token permissions versus account/ruleset authority and avoids implying the PAT scope itself grants bypass. |
| C50-7 | Init surface | Add `--skip-workboard-pat-prompt`; by default `harness init` prints PAT setup guidance and fresh init installs the managed workboard workflow. | New consumers see the fallback without reading issue history; CI/non-interactive runs can suppress the guidance. |
| C50-8 | Regression tests | Add a CS50 test that parses workflow YAML, asserts App precedence + PAT gating + status re-check, preserves actor/path allowlists, checks validation-failure comment wiring, and checks init/docs surfaces. | Locks the issue #138 contract mechanically without network access. |
| C50-9 | Source-control discipline | Commit multi-file edits before running `harness sync`, then commit generated root `OPERATIONS.md` / lock updates separately. | Applies LRN-124 to avoid working-tree-loss during composed sync. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | copilot-cli | rubber-duck via general-purpose (orchestrator: yoga-ah) | ece0f7fce457 | 2026-05-14T23:29:46Z | Go-with-amendments | R1 blockers addressed; proceed with status-rollup fail-closed and PAT bypass-actor docs/test. |

## Deliverables

1. **`.github/workflows/workboard-auto-approve.yml`** — add optional `WORKBOARD_MERGE_TOKEN` admin-merge fallback after existing validation, with App precedence, status-check re-check, validation-failure PR comments for path violations, clear PAT/App/manual path logs, and graceful secret absence.
2. **`template/managed/.github/workflows/workboard-auto-approve.yml`** — managed-template copy kept byte-identical to the live workflow for fresh consumers.
3. **`template/composed/OPERATIONS.md`** — add `Workboard-only PR admin-bypass fallback` at the end of § Enforcement model documenting secret name, scopes, ruleset bypass actor requirement, setup path, graceful degradation, and security gating.
4. **`OPERATIONS.md`** — regenerate from composed source via `node bin/harness.mjs sync --mode=apply --resolved-sha <sha>`.
5. **`bin/harness.mjs` cmdInit** — add `--skip-workboard-pat-prompt`, print the PAT setup guidance by default, and install the managed workboard workflow on fresh init.
6. **`tests/cs50-workboard-admin-bypass.test.mjs`** — new regression contract for workflow YAML, allowlists, init prompt/flag, and root OPERATIONS docs.
7. **`CHANGELOG.md`** — add one `[Unreleased] / Added` bullet citing CS50 and issue #138.
8. **Self-check evidence** — record targeted test, YAML parse, lint, sync-check, and PR-body lint results in the implementation PR.

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| R1 — PAT admin merge bypasses CI | Poll `statusCheckRollup` and skip admin merge unless all reported non-workboard checks are green/neutral/skipped. |
| R2 — PAT authority misunderstood as a scope | Docs and init guidance distinguish token repository permissions from the token user's ruleset bypass actor membership. |
| R3 — Both App and PAT configured | Workflow prefers the App path and skips PAT fallback unless App credentials are absent. |
| R4 — Secret-bearing workflow handles untrusted PR code | Workflow uses `pull_request_target` but checks out base SHA only and never executes PR-head code before secrets are used. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| Extend workboard workflow with App-preferred PAT fallback | in_progress | yoga-ah | live + template-managed copy |
| Add OPERATIONS fallback docs and regenerate root | pending | yoga-ah | composed source first, then sync apply |
| Add cmdInit PAT prompt/skip flag/fresh workflow install | in_progress | yoga-ah | default prints guidance; skip flag for CI |
| Add CS50 regression test | in_progress | yoga-ah | no repo-root temp dirs |
| Add changelog entry | done | yoga-ah | `[Unreleased] / Added` |
| Self-checks: YAML parse, targeted test, lint, sync-check, PR-body lint | pending | yoga-ah | run after sync |
| Open PR and engage Copilot | pending | yoga-ah | title closes #138 |
| Close-out: file learnings/follow-up planned CS | done | yoga-ah | LRN for close-out compression filed in PR #204 |

## Plan-vs-implementation review

**Reviewer:** none (deferred — close-out compressed during SI-feedback velocity batch)
**Date:** 2026-05-14
**Outcome:** Deferred — see "## Close-out compression note" below.

## Close-out compression note

CS50 was implemented and merged via [PR #197](https://github.com/henrik-me/agent-harness/pull/197) (squash `3726e75`) on 2026-05-14 as part of the SI-feedback velocity batch. Same lifecycle compression as CS48 (see `done_cs48_*.md` § Close-out compression note for the full rationale). Retroactively renamed `planned/ → done/` on 2026-05-14 via PR #204.
