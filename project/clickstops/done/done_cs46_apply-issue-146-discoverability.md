# CS46 — Apply issue #146: surface canonical formats for workboard empty-state and clickstop Plan-vs-implementation review section

**Status:** done
**Owner:** yoga-ah
**Branch:** `cs46/issue-146-discoverability` (merged via PR #192, squashed) → close-out via `cs46/close-out`
**Started:** 2026-05-14
**Closed:** 2026-05-14
**Filed by:** Pre-claim disposition of [issue #146](https://github.com/henrik-me/agent-harness/issues/146) (filed 2026-05-13 by `henrikm`; encountered first-hand by `yoga-ah` during the close-out of CS23 + CS43 + CS44 + CS45 on 2026-05-14, PR #189).
**Depends on:** None. May claim independently. Small enough to ship in a single sitting (single orchestrator, no fan-out per rubber-duck finding #6).

## Goal

Two harness-enforced format constraints currently have no canonical published examples and no actionable error messages, leading consumers to a CI roundtrip on first encounter (issue #146). This CS addresses both:

1. **Constraint A — `check-workboard.mjs`:** rejects `_(none)_` placeholder rows in the `## Active Work` table; valid empty forms (header-only OR a single em-dash row with "no active CS" in Title) aren't documented in the seeded scaffold or the lint message.
2. **Constraint B — `check-clickstop.mjs`:** requires verbatim `**Reviewer:**`, `**Date:**`, `**Outcome:**` field labels in the `## Plan-vs-implementation review` section of every `done/` clickstop file; the linter error message doesn't enumerate them, so consumers using semantically-equivalent labels (`**Verdict:**`, `**Date closed:**`) hit a CI roundtrip.

Phase 3 from issue #146 (`harness lint --fix` autofix) is explicitly deferred per the issue's own framing ("nice to have, not blocking").

## Background

Issue #146 was filed 2026-05-13 with concrete reproduction in `henrik-me/sub-invaders` PR #29 close-out. Trap (A) was independently re-encountered by the orchestrator during close-out PR #189 (this morning, 2026-05-14) — `_(none)_` placeholder rejected by `check-workboard.mjs`, then header-only converged on by trial-and-error.

`check-workboard.mjs:228-247` enforces the regex `^CS\d{2,}[a-z]?$` on every CS-Task ID cell and accepts em-dash placeholder rows ONLY when Title contains "no active CS". `check-clickstop.mjs:283-309` enforces a separate `## Plan-vs-implementation review` H2 gate on `active/`+`done/` files; the `done/` arm requires `**Reviewer:**`, `**Date:**`, `**Outcome:**` (or the canonical grandfathering line). Both linters are correct in their strictness — the issue is purely discoverability + message quality, not enforcement strength.

Issue acceptance criteria #1 ("a consumer running `harness init` in a fresh repo gets a `WORKBOARD.md` whose empty state passes `check-workboard` without modification") binds the seeded template (`template/seeded/WORKBOARD.md`) to the linter contract.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C46-1 | Canonical empty-state form to document | **Option (a) header-only.** Update `template/seeded/WORKBOARD.md` to use header-only as the canonical empty state + add an HTML comment documenting the contract. | Simpler than the em-dash placeholder; matches what the linter reaches via `activeRows.length === 0`; matches the form `yoga-ah` converged on in PR #189. The em-dash variant remains accepted by the linter (no behavior change there). |
| C46-2 | Plan-vs-impl review skeleton location | Extend the existing code block in `template/composed/OPERATIONS.md` § "Plan-vs-implementation review (close-out gate)" to be a complete copy-pasteable skeleton + add an explicit "field labels are matched verbatim by `check-clickstop.mjs` — no aliases" callout. | Already the canonical place per OPERATIONS.md lines 95-144; consumers will look here first. |
| C46-3 | `check-workboard.mjs` error message hint | Append `. For an empty Active Work table, remove all data rows and keep header rows only (or use a single em-dash row with "no active CS" in the Title cell — see WORKBOARD.md template).` to the existing `Active Work row has invalid CS-Task ID "${csId}" — expected CS\d{2,}(a-z)? format` message. | Self-documenting; both valid forms surfaced; consumer doesn't need to read linter source. |
| C46-4 | `check-clickstop.mjs` error message hint | Append `. The required field labels are matched verbatim (case-sensitive bold-prefixed): "**Reviewer:**", "**Date:**", "**Outcome:**". See OPERATIONS.md § "Plan-vs-implementation review (close-out gate)" for the canonical skeleton.` to the existing `must contain Reviewer/Date/Outcome fields OR the grandfathering line` message. | Same self-documenting principle; surfaces verbatim labels + canonical reference. |
| C46-5 | Test approach | Add `tests/cs46-empty-state-and-review-discoverability.test.mjs` with 4+ fixture-based tests: (1) seeded WORKBOARD.md template passes `check-workboard.mjs` cleanly with no data rows, (2) `_(none)_` row produces error message containing the new C46-3 hint substring, (3) clickstop with `**Verdict:**` instead of `**Outcome:**` produces error containing the new C46-4 verbatim-labels hint, (4) clickstop **built as a minimally-valid done file (with required close-out hygiene task rows per `check-clickstop.mjs:311-312`)** with the canonical OPERATIONS.md skeleton verbatim copy-pasted passes the lint AND does NOT pass via the grandfathering fallback. | Mirrors `tests/check-workboard.test.mjs` + `tests/check-clickstop.test.mjs:332-354` patterns. Fixture #4 wording avoids false-pass via grandfathering by asserting exact-label enforcement (per rubber-duck finding #3). |
| C46-6 | Out of scope | Phase 3 autofix (`harness lint --fix`); CS-Task ID case sensitivity (separate planned CS pointing at issue #138 once #138 design is decided); regex generalization to accept `_(none)_` (issue #146 explicitly rejects this); changes to issue #138's PAT-based admin-merge proposal. | Scope discipline — bundling either would multiply review surface and create dependency on user design input that's not yet provided. |
| C46-7 | Composed-file workflow | Edit `template/composed/OPERATIONS.md`; run `harness sync --mode=apply --resolved-sha <sha>` to refresh root `OPERATIONS.md` + `.harness-lock.json`. Two-pass workaround (CS43-45 finding) likely needed if prose-hash drifts. | Follow established managed-core flow; do NOT hand-edit root `OPERATIONS.md`. |
| C46-8 | Fresh-consumer acceptance test (per rubber-duck finding #1) | Add `node bin/harness.mjs init --target-dir <os.tmpdir()/cs46-fresh-XXXXXX>` followed by `cd <fresh-dir> && node <abs-path-bin/harness.mjs> lint --quiet` as a deliverable-side self-check (executed during implementation; recorded in CS file Notes section). Assertion: zero errors against the fresh seeded `WORKBOARD.md` and `project/clickstops/`. Use `os.tmpdir()` per LRN-094 to avoid REPO_ROOT race with `check-text-encoding`. | Issue #146 acceptance criterion #1 is explicit; cannot pass acceptance without exercising the `harness init` path end-to-end. |
| C46-9 | TRACKING.md skeleton drift (per rubber-duck finding #2) | Append a 1-2 sentence pointer in `template/managed/TRACKING.md`'s clickstop skeleton (around lines 87-105) directing consumers to the canonical Plan-vs-impl review skeleton in OPERATIONS.md so consumers copying TRACKING's skeleton don't omit the close-out gate. | TRACKING is one of two documented sources; without this pointer, the discoverability fix is incomplete for the TRACKING copy-paste path. |

## Deliverables

1. **`template/seeded/WORKBOARD.md`** — replace line 19 placeholder row with HTML comment + header-only empty state per C46-1.
2. **`template/composed/OPERATIONS.md`** § Plan-vs-implementation review (close-out gate) — extend skeleton + add verbatim-labels callout per C46-2.
3. **`OPERATIONS.md`** root — regenerated via `harness sync --mode=apply` per C46-7.
4. **`scripts/check-workboard.mjs`** — extend `logError` line 244 per C46-3.
5. **`scripts/check-clickstop.mjs`** — extend `logError` lines 304-305 per C46-4.
6. **`tests/cs46-empty-state-and-review-discoverability.test.mjs`** — new file, 4+ tests per C46-5.
7. **`template/managed/TRACKING.md`** — append cross-link from clickstop skeleton to canonical OPERATIONS.md plan-vs-impl skeleton per C46-9.
8. **`CHANGELOG.md`** `[Unreleased]/Changed` bullet citing CS46.
9. **Self-check evidence** — fresh-init E2E test result (per C46-8) recorded in Notes section.
10. `## Plan-vs-implementation review` section filled at close-out per gate.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| R1 — TRACKING.md edit lands inside a managed local block that auto-regen would clobber | C46-9 confines the edit to a small append; verify the target lines (87-105) are not inside a `<!-- harness:... -->` block before editing. If they are, wrap the new prose in its own local block. |
| R2 — Fresh-init self-check (C46-8) may pass on the harness self-host but fail in a real fresh consumer due to peer-deps gaps (issue #138 friction list mentions `ajv`/`ajv-formats`/`js-yaml` peer-deps). | Document the dep requirement in the Notes section if encountered; do NOT bundle a peer-deps fix into CS46 (separate scope). |
| R3 — Issue #146 mentions related issue #138 in scope adjacency. Consumer may expect both fixed together. | C46-6 explicitly excludes #138; CS46 PR body states the boundary clearly so reviewers don't conflate. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.7-xhigh | rubber-duck dispatched (orchestrator: yoga-ah) | 2c8a5f0f2a82 | 2026-05-14T19:00:00Z | Go-with-amendments | R1 NEEDS-FIX flagged missing fresh-init acceptance test (issue #146 AC #1); amended C46-8 + C46-9 + C46-5 wording in same session before opening this filing PR. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| Edit `template/seeded/WORKBOARD.md` per C46-1 — replace `_(none)_` placeholder row with HTML comment + header-only canonical empty state | done | yoga-ah | line 19; em-dash variant remains accepted |
| Edit `template/composed/OPERATIONS.md` § Plan-vs-implementation review (close-out gate) per C46-2 — extend skeleton + add verbatim-labels callout | done | yoga-ah | composed-mirror first per LRN-070 |
| Run `harness sync --mode=apply --resolved-sha <sha>` to regenerate root `OPERATIONS.md` per C46-7 | done | yoga-ah | DO NOT hand-edit root; ran cleanly first try (no two-pass needed this time) |
| Extend `scripts/check-workboard.mjs` line 244 `logError` per C46-3 — append empty-table hint | done | yoga-ah | self-documenting linter |
| Extend `scripts/check-clickstop.mjs` lines 304-305 `logError` per C46-4 — append verbatim-labels hint | done | yoga-ah | self-documenting linter |
| Add `tests/cs46-empty-state-and-review-discoverability.test.mjs` per C46-5 + C46-8 (4+ fixture-based tests + fresh-init E2E) | done | yoga-ah | 6 tests total (5 from plan + 1 R2 doc-drift guard); use `os.tmpdir()` per LRN-094 |
| Append cross-link in `template/managed/TRACKING.md` clickstop skeleton (lines ~87-105) per C46-9 | done | yoga-ah | 1-2 sentence pointer to OPERATIONS.md skeleton |
| Add `CHANGELOG.md` `[Unreleased] / Changed` bullet citing CS46 + issue #146 | done | yoga-ah | per Deliverable #8 |
| Self-checks: `node --test` (targeted) + `harness lint` + `harness sync --mode=check` + fresh-init acceptance per C46-8 + `check-pr-body` | done | yoga-ah | 6/6 targeted tests pass; full `npm test` 951 pass / 0 fail; `harness lint --quiet` 29 passed / 0 failed / 3 skipped; `harness sync --mode=check` no drift |
| gpt-5.5 rubber-duck review of implementation (R2) | done | yoga-ah | R2 returned NEEDS-FIX flagging incomplete C46-8 (test #5 only ran check-workboard, not full `harness lint`); R2.1 strengthened test #5 + added test #6 (doc-drift guard for OPERATIONS.md callout); see Notes below |
| Open content PR with canonical Review log + Field/Value Model audit | done | yoga-ah | PR #192 opened with full Review log + Field/Value table |
| Engage Copilot reviewer; address comments; merge | done | yoga-ah | 4 Copilot review rounds (R1-R4) — R1 had 3 line comments (WORKBOARD comment direction; CHANGELOG count; test docstring); R2/R3 chased lock-provenance staleness; R4 returned "no new comments". Admin-merged 2026-05-14T20:01Z (BLOCKED by `REVIEW_REQUIRED` policy — `read-only-gates` green). |
| Close-out: docs + restart state | done | yoga-ah | active→done rename; WORKBOARD active row → header-only empty state; orchestrator status → 🟡 Idle; CONTEXT.md restart state refreshed |
| Close-out: learnings + follow-ups | done | yoga-ah | LRN-124 (working-tree-loss doctrine — commit before any repo-level command), LRN-125 (Copilot-reviewer feedback chain via PR-body review log) |

## Notes / Learnings

- **Rubber-duck R2 (gpt-5.5, 2026-05-14):** flagged C46-8 implementation as incomplete — original test #5 only ran `check-workboard` against the seeded `WORKBOARD.md`, but the C46-8 contract (issue #146 AC #1) requires `harness lint --quiet` against the entire fresh-init consumer scaffold. **Fix (R2.1, commit `76cd581`):** test #5 now runs both `check-workboard --file <seeded-wb>` AND `harness --cwd <fresh-dir> lint --quiet`, asserting both exit 0. R2 also flagged a non-blocking doc-drift gap: the canonical OPERATIONS.md skeleton + verbatim-labels callout could regress without any CS46 test failing. **Fix (same commit):** new test #6 mechanically asserts the callout + all 4 keywords (`**Reviewer:**`, `**Date:**`, `**Outcome:**`, `**Verdict:**`) exist in BOTH `template/composed/OPERATIONS.md` AND root `OPERATIONS.md`. After R2.1, all 6 tests pass; full `npm test` 951 pass / 0 fail.
- **Sync ran cleanly first try (no two-pass needed this time).** R3 risk in plan listed the LRN-from-CS43-45 two-pass workaround as a likely-needed step for OPERATIONS.md composed-mirror edits. In CS46, `harness sync --mode=apply --resolved-sha <head>` succeeded on first invocation — both `OPERATIONS.md` (composed callout) and `TRACKING.md` (managed close-out reminder) regenerated cleanly. The `template_prose_hash` was fresh because CS43-45 had already updated it the same session. Worth filing as a contextual addendum to the LRN: the two-pass workaround is needed only when the lock's recorded `template_prose_hash` is stale relative to the current consumer skeleton — back-to-back composed-mirror CSs in the same session avoid the trigger.
- **Working-tree-loss gotcha (this session, 2026-05-14):** during initial implementation I lost all 5 source-file edits when a stray detached-HEAD checkout-to-tag intervened between editing and committing. Symptoms: `edit` tool calls succeeded, then `git status --short` showed only the new test file as untracked (the 5 modified files reverted). Recovery: re-applied the 5 edits and committed immediately before any other git operation. **Lesson:** for multi-file edits, `git add -A && git commit` BEFORE running any other repo-level command (especially `harness sync` and `git checkout`). Candidate for new LRN. **Note:** the root cause appears to have been an incidental detached-HEAD checkout on a tag that occurred outside my command flow; not directly attributable to `harness sync` itself.
- **C46-8 fresh-init E2E acceptance evidence:** `node bin/harness.mjs --cwd <fresh-tmpdir> init` followed by `node bin/harness.mjs --cwd <fresh-tmpdir> lint --quiet` exits 0 against the freshly-init'd scaffold (no consumer modifications). Captured mechanically by test #5 in `tests/cs46-empty-state-and-review-discoverability.test.mjs`.

## Plan-vs-implementation review

**Reviewer:** gpt-5.5 (rubber-duck, close-out gate)
**Date:** 2026-05-14
**Outcome:** GO

**Evidence:** All 8 substantive deliverables (Deliverables #1-8) verified with line-cited evidence per the table below; targeted CS46 test suite passes 6/6; `harness sync --mode=check` reports no drift. Issue #146 acceptance criteria all met (AC #1 fresh-init E2E covered by test #5; AC #2 OPERATIONS canonical skeleton with verbatim labels at lines 127-138; AC #3 both linter errors self-documenting). The R1 close-out review returned NEEDS-FIX flagging only the close-out hygiene gap (file Status field + this section unfilled) — addressed in this commit before the close-out PR opens. Final `node bin/harness.mjs lint --quiet` runs green after these close-out edits.

| Deliverable | Plan claim | Implementation evidence | Verdict |
|---|---|---|---|
| #1 seeded WORKBOARD | C46-1 header-only + HTML comment | `template/seeded/WORKBOARD.md` lines 17-35: canonical header-only empty state documented. | GO |
| #2 composed OPERATIONS skeleton + callout | C46-2 verbatim-labels callout | `template/composed/OPERATIONS.md` lines 127-138: skeleton + verbatim-labels callout present. | GO |
| #3 root OPERATIONS regenerated | C46-7 regenerated via `harness sync` | `OPERATIONS.md` lines 127-138 mirror composed; `sync --mode=check` reports no drift. | GO |
| #4 workboard linter hint | C46-3 empty-table hint appended | `scripts/check-workboard.mjs` lines 243-247: empty-table hint present. | GO |
| #5 clickstop linter hint | C46-4 verbatim-labels hint appended | `scripts/check-clickstop.mjs` lines 302-308: verbatim labels enumerated. | GO |
| #6 CS46 tests | C46-5 + C46-8 6 tests | `tests/cs46-empty-state-and-review-discoverability.test.mjs`: 6 pass / 0 fail (incl. fresh-init E2E + doc-drift guard). | GO |
| #7 TRACKING pointer | C46-9 close-out gate pointer | `template/managed/TRACKING.md` and root `TRACKING.md` lines 109-114 contain pointer to OPERATIONS skeleton. | GO |
| #8 CHANGELOG | `[Unreleased]/Changed` bullet | `CHANGELOG.md` lines 18-24 documents CS46 + issue #146 + 6 tests + all touchpoints. | GO |
