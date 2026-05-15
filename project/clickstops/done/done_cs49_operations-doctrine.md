# CS49 — Operations doctrine: orchestrator availability, progress reporting, and workboard-first out-of-CS work

**Status:** done
**Owner:** yoga-ah
**Branch:** `cs49/operations-doctrine`
**Started:** 2026-05-14
**Closed:** 2026-05-14
**Filed by:** [Issue #139](https://github.com/henrik-me/agent-harness/issues/139) — codify orchestrator-availability invariant, sub-agent progress-reporting cadence, and workboard-first status for out-of-CS work.
**Depends on:** None. Coordinates with concurrent CS48/CS50/CS51/CS52 by respecting their file-ownership boundaries: do not touch the dispatch-template Reporting subsection, § Enforcement model owned subsections, REVIEWS.md, workflow templates, `bin/`, `lib/`, or `scripts/checks/`.

## Goal

Codify three operating doctrines in the canonical operations template and regenerated root `OPERATIONS.md`:

1. The orchestrator stays available for user instructions and triage by delegating plausible work unless a narrow exception applies.
2. Sub-agents emit periodic progress updates so silence longer than the stated threshold can be treated as a stall.
3. Out-of-CS work is surfaced on the live coordination workboard before starting so user-visible status is never hidden until completion.

The CS is documentation-only plus regression tests that mechanically assert the new doctrine exists in the template/root docs and that the new learning entry records the downstream consumer episode.

## Background

Issue #139 was filed after a `henrik-me/sub-invaders` post-CS hotfix episode: the orchestrator handled the torpedo-collision regression directly, did not keep itself available by delegating to a background agent, and updated user-visible status only at the end. The user called out that the harness instructions were not explicit enough. Existing `OPERATIONS.md` documents structured sub-agent dispatch inside a CS, but it does not state the orchestrator-availability invariant, periodic progress-reporting cadence, or workboard-first rule for out-of-CS work.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C49-1 | Orchestrator availability placement | Add `### Orchestrator availability invariant` at the end of `## Sub-agent dispatch`, after existing subsections and before the new progress section. | This is the dispatch doctrine surface; placing it at the end avoids modifying CS48's dispatch-template Reporting work while making the rule easy to find. |
| C49-2 | Progress reporting placement and wording | Add `### Sub-agent progress reporting` immediately after C49-1. Require one-line updates after each owned-file commit or no-commit edit batch, after tool invocations over 5 minutes, and treat silence longer than 15 wall-minutes as a stall. | Matches issue #139 acceptance while reconciling the existing no-commit default for normal sub-agents. |
| C49-3 | Workboard-first placement | No standalone `## Workboard` section exists, so add `### Workboard-first for out-of-CS work` after `### Enforcement model` without editing existing enforcement text. | Follows the issue instruction fallback while respecting CS50/CS51 ownership of Enforcement-model subsections. |
| C49-4 | Workboard shape | Reference the actual `WORKBOARD.md` Active Work columns, require a short title, branch, active/in-progress state, owner, last-updated date, and user-facing reason in the Title or Blocked Reason cell. Use a CS-shaped tracking ID such as `CS02h` because `check-workboard.mjs` rejects arbitrary IDs today. | Keeps doctrine actionable without creating a linter mismatch. |
| C49-5 | Source-of-truth sync workflow | Edit `template/composed/OPERATIONS.md` first, commit the source/doc/test batch, then run `node bin/harness.mjs sync --mode=apply --resolved-sha <source-commit-sha>` to regenerate root `OPERATIONS.md` and the lockfile. | Follows composed-file doctrine and LRN-124's commit-before-harness-command guard. |
| C49-6 | LRN entry | Add `LRN-126` under Applied to record that the gap was identified by the downstream `sub-invaders` CS02 hotfix episode. | Satisfies issue #139 acceptance criterion #4 and preserves the consumer-feedback lesson. |
| C49-7 | Regression test | Add read-only `tests/cs49-operations-doctrine.test.mjs` that extracts `## Sub-agent dispatch`, asserts both new headings and key substrings in template/root docs, asserts the Workboard-first subsection exists, and asserts `LRN-126` exists. | Locks the doctrine in the source template, generated root, and learning log without adding dependencies or scratch files. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-sonnet-4.6 | rubber-duck dispatched (cs49-rubber-duck) | c07f31a287c3 | 2026-05-14T23:25:36Z | Go | Scoped doc/test plan codifies all three doctrines, preserves ownership boundaries, and includes template/root/LRN assertions plus lint/sync validation. |

## Deliverables

1. **`template/composed/OPERATIONS.md`** — add three new subsections with unique headings:
   - `### Orchestrator availability invariant` at the end of `## Sub-agent dispatch`.
   - `### Sub-agent progress reporting` immediately after the invariant.
   - `### Workboard-first for out-of-CS work` after `### Enforcement model` because no `## Workboard` section exists.
2. **`OPERATIONS.md`** — regenerate from the composed template using `node bin/harness.mjs sync --mode=apply --resolved-sha <source-commit-sha>`.
3. **`.harness-lock.json`** — update via the same sync command only; no hand edits.
4. **`LEARNINGS.md`** — add `LRN-126` with the required downstream `sub-invaders CS02 hotfix episode` evidence.
5. **`tests/cs49-operations-doctrine.test.mjs`** — new read-only Node test asserting the doctrine and LRN entry exist.
6. **`CHANGELOG.md`** — add one `[Unreleased] / Changed` bullet citing CS49 and issue #139.
7. **`project/clickstops/planned/planned_cs49_operations-doctrine.md`** — this plan, including a fresh `## Plan review` row after rubber-duck review.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| R1 — Touching CS48's dispatch-template Reporting subsection creates a merge conflict | Only append new `###` subsections after existing `## Sub-agent dispatch` subsections; do not edit the report-shape block or preamble Reporting text. |
| R2 — Workboard-first wording conflicts with current `WORKBOARD.md` linter shape | Explicitly reference the existing columns and CS-shaped ID constraint; defer schema changes because issue #139 is docs-only. |
| R3 — `harness sync` rewrites root docs or lock unexpectedly | Commit the source batch first per LRN-124, run sync once with explicit `--resolved-sha`, then verify with `sync --mode=check`. |
| R4 — Plan-review hash stales after plan amendments | Compute the hash after finalizing Decisions + Deliverables, run a rubber-duck review, and only then fill the Plan review row. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| Read issue #139, current operations layout, workboard shape, learning format, and CS46 plan prior art | done | Copilot CLI | Required reading completed before plan authoring. |
| Add CS49 plan and rubber-duck plan review | done | Copilot CLI | R1 rubber-duck verdict Go; hash `c07f31a287c3`. |
| Edit `template/composed/OPERATIONS.md` with the three doctrine subsections | done | Copilot CLI | Appended new subsections without editing CS48/CS50/CS51/CS52 owned text. |
| Add `LRN-126`, CS49 test, and CHANGELOG bullet | done | Copilot CLI | Source/doc/test batch committed before any harness command per LRN-124. |
| Run `harness sync --mode=apply --resolved-sha <source-sha>` | done | Copilot CLI | Regenerated root `OPERATIONS.md` + `.harness-lock.json`; final sync check reports no drift. |
| Validate targeted test, `harness lint --quiet`, `harness sync --mode=check`, and PR body | done | Copilot CLI | Targeted test 7/7, lint 29 passed / 0 failed / 3 skipped, sync check clean; PR body checked before opening PR. |
| Close-out: update workboard/context restart-state docs | done | yoga-ah | Retroactive 2026-05-14 via PR #204; CS49 lifecycle compressed (no `active/` rename). |
| Close-out: file learnings/follow-up planned CS | done | yoga-ah | LRN-131 filed in PR #204 codifying lifecycle-compression doctrine. |
| Push branch, open PR, and engage Copilot | pending | Copilot CLI | Title must close issue #139. |

## Notes

- This CS intentionally does not add or change linter enforcement for out-of-CS workboard rows; current scope is doctrine and regression tests asserting the doctrine exists.

## Plan-vs-implementation review

**Reviewer:** none (deferred — close-out compressed during SI-feedback velocity batch)
**Date:** 2026-05-14
**Outcome:** Deferred — see "## Close-out compression note" below.

## Close-out compression note

CS49 was implemented and merged via [PR #195](https://github.com/henrik-me/agent-harness/pull/195) (squash `aed6247`) on 2026-05-14 as part of the SI-feedback velocity batch. Same lifecycle compression as CS48 (see `done_cs48_*.md` § Close-out compression note for the full rationale). Retroactively renamed `planned/ → done/` in PR #204 (commit-dated 2026-05-14).
