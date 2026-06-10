# CS69 — Enforce `### LRN-NNN` header presence in check-learnings.mjs (apply LRN-154)

**Status:** done
**Owner:** omni-ah-c2
**Branch:** cs69/content
**Started:** 2026-06-10
**Closed:** 2026-06-10
**Filed by:** CS61b close-out (2026-06-07 by `yoga-ah`). Applies **LRN-154** (`LEARNINGS.md` § LRN-154, status `open`), surfaced during CS61b when `LEARNINGS.md` entry LRN-106 shipped with valid frontmatter but no `### LRN-106` H3 header and `scripts/check-learnings.mjs` still reported 0 errors.
**Depends on:** None hard. Pure linter/tooling CS on `scripts/check-learnings.mjs` + `tests/check-learnings.test.mjs` + fixtures. May claim independently. Coordinate only to avoid landing concurrently with a CS that restructures `LEARNINGS.md` entry parsing.

## Goal

Extend `scripts/check-learnings.mjs` so that every learning entry's frontmatter `id: LRN-<n>` is introduced by a matching `### LRN-<n>` H3 header — the nearest `###` heading above the entry's YAML frontmatter block (a blank line separates the header from the opening fence). Headerless or header-mismatched entries — which undercount header-based tallies and leave broken `#lrn-<n>` anchors — must fail CI. Closes the linter gap recorded in LRN-154.

## Background

LRN-154 documents that `check-learnings.mjs` validates each entry's YAML frontmatter against `schemas/learning.schema.json` but never asserts that a markdown `### LRN-<id>` header exists for it. Two consequences were observed first-hand in CS61b: (a) `^### LRN-` counts ran one short of the authoritative `^id: LRN-` count; (b) a `[LRN-106](LEARNINGS.md#lrn-106)` link — the anchor form `scripts/check-instructions.mjs` resolves — pointed at no heading. The LRN-106 header itself was restored in CS61b (PR #256, `019ba8c`); the linter rule that would have caught it up front is the remaining follow-up.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C69-1 | Header-presence rule | Add a rule to `check-learnings.mjs`: for each entry with frontmatter `id: LRN-<n>`, require a matching `### LRN-<n>` H3 header as the nearest `###` heading preceding that entry's YAML frontmatter block (the header sits one blank line above the opening fence, not on the adjacent line). Absence is an error. | Directly closes LRN-154; mirrors the `#lrn-<n>` anchors `check-instructions.mjs` already resolves. |
| C69-2 | Header↔id match | Treat a present-but-mismatched header (e.g. `### LRN-105` above `id: LRN-106`) as an error distinct from a missing header, with a precise message naming both values. | Catches copy-paste / renumber drift — exactly the LRN-id collision renumbers CS61b had to do by hand (151→153, 152→154). |
| C69-3 | Scope discipline | No schema change, no CLI-surface change, no change to the frontmatter contract. Linter logic + fixtures + tests only. The frontmatter `id` stays the authoritative key. | Keeps the CS small and reviewable; avoids touching the shared `schemas/learning.schema.json` contract. |
| C69-4 | Fixtures + tests | Add valid (header present, matches) and invalid (header missing; header present-but-mismatched) fixtures, following the existing `tests/fixtures/cs05/` learnings-fixture pattern, with matching cases in `tests/check-learnings.test.mjs`. | Fixture-based linter testing is the repo convention (INSTRUCTIONS § When to Add a Test); invalid fixtures must exit 1 with the expected message. |

## Deliverables

1. **`scripts/check-learnings.mjs`** — header-presence + header↔id-match rule per C69-1 / C69-2, emitting `ERROR:`-prefixed lines and honouring the existing exit-code contract (0 valid / 1 errors / 2 bad usage) and `--file` / `--quiet` flags.
2. **`tests/check-learnings.test.mjs`** — new cases: header-present-matches (pass), header-missing (fail), header-present-but-mismatched (fail). Minimum 3 new cases; over-delivery welcome.
3. **`tests/fixtures/...`** — supporting valid/invalid learnings fixtures for the new cases (no fixture writes under the repo root at test time — fixtures are committed files).
4. **`LEARNINGS.md`** — at close-out, flip **LRN-154** `open → applied` with the merge SHA recorded in its Disposition prose (no frontmatter SHA field exists per `schemas/learning.schema.json`).
5. **`CHANGELOG.md`** — entry under `[Unreleased]`.

## User-approval gates

- None beyond the standard review loop. Pure internal linter hardening; no release tag required unless bundled into a later release cut.

## Exit criteria

1. `check-learnings.mjs` fails on a headerless entry and on a header↔id mismatch, and passes a well-formed file (C69-1 / C69-2).
2. `node scripts/check-learnings.mjs --file LEARNINGS.md` exits 0 against the real (now header-complete) `LEARNINGS.md`.
3. New fixture-based tests pass under `node --test tests/*.test.mjs`.
4. `harness lint --quiet` passes on self-host (full suite).
5. LRN-154 flipped to `applied`.
6. Plan-vs-implementation review (GPT-5.5 gate) returns GO.

## Risks + open questions

| # | Risk | Mitigation |
|---|---|---|
| R1 | Header-detection mis-handles an entry whose body contains a fenced `### LRN-` example | Anchor the check to the nearest `###` heading preceding each entry's YAML frontmatter block (walking back past the blank line and the opening fence), reusing the linter's existing per-entry segmentation rather than a global scan (per LRN-035 fence-robustness). |
| R2 | A concurrent CS restructures `LEARNINGS.md` parsing | Coordinate at claim; the rule layers onto the existing per-entry walk instead of replacing it. |
| R3 | `LEARNINGS.md` harbours another latent headerless entry | The new rule surfaces it on first run against the real file; fix in-band — it is the linter's own target file (exit criterion 2). |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: yoga-ah) | 34422dab3bda | 2026-06-07T18:23:22Z | Go | Verified F-A–F-F: PR #256 squash 019ba8c, check-learnings lacks header rule, 154/154 LRN counts, no number collision, structure+hash valid. 0 findings. |
| R2 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: yoga-ah) | 4fb511564a55 | 2026-06-08T01:04:26Z | Go | Amended Goal/C69-1/R1 per a Copilot finding to accurately describe LEARNINGS structure (### header + blank + yaml id, not adjacent to the fence); C/D implementable; hash 4fb511564a55; 0 findings. |
| R3 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: yoga-ah) | 335b2b3523c1 | 2026-06-08T01:24:12Z | Go | Renumbered to cs69 after the originally-filed number was taken by PR #271's dependency-bump CS; rename clean, decisions C69-1..4, substance unchanged from R2; re-hashed 335b2b3523c1. 0 findings. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1 — Extend `scripts/check-learnings.mjs` with header-presence + header↔id-match rule per C69-1/C69-2 | done | omni-ah-c2 | Mirror existing per-entry walk; honour `--file` / `--quiet` flags + exit-code contract |
| T2 — Add valid fixture (header-present-matches) under `tests/fixtures/cs69/` | done | omni-ah-c2 | Follow `tests/fixtures/cs05/` pattern |
| T3 — Add invalid fixture (header-missing) | done | omni-ah-c2 | Must exit 1 with precise message |
| T4 — Add invalid fixture (header-present-but-mismatched) | done | omni-ah-c2 | Distinct error message naming both ids |
| T5 — Extend `tests/check-learnings.test.mjs` with ≥3 new fixture-based cases | done | omni-ah-c2 | Delivered 6 cases (#18–#23) incl. R1 regression (shadowing), Copilot R1 F1 (leading-zero mismatch), F2 (decorated rejection). Use `os.tmpdir()` if any scratch space needed (LRN-094). |
| T6 — Verify `node scripts/check-learnings.mjs --file LEARNINGS.md` exits 0 on real file | done | omni-ah-c2 | Exit criterion 2: confirmed 0 errors / 1 warning on 159 entries. |
| T7 — Flip `LEARNINGS.md` LRN-154 frontmatter `status: open` → `applied`; append Disposition with merge SHA | done | omni-ah-c2 | At close-out: applied with merge SHA `b580260`. |
| T8 — Add CHANGELOG `[Unreleased]` `### Added` (or `Changed`) bullet for the new linter rule | done | omni-ah-c2 | Per LRN-101 distributed-surface CHANGELOG-touch convention |
| T9 — Local rubber-duck plan-vs-implementation review (GPT-5.5) before PR | done | omni-ah-c2 | R1 Needs-Fix (backwards-walk too permissive) → fix → R2 Go-with-amendments (CHANGELOG nit) → R3 Go before PR open. Independence-invariant: reviewer ≠ implementer. |
| T10 — Open PR, dispatch PR-level R1 rubber-duck + `harness copilot-engage`, address review threads, merge | done | omni-ah-c2 | PR #295 merged at `b580260`. R3+R4+R6 (gpt-5.5 Go), R5+R7 (Copilot No-Findings); 3 Copilot R1 findings (parseInt, trailer regex, fixture) addressed in `8a175d4`; R2 typo addressed in `789fc4e`. |
| T11 — Close-out docs/restart-state: rename `active_cs69_*.md` → `done_cs69_*.md`; update WORKBOARD + CONTEXT handoff; file any new LEARNINGS | done | omni-ah-c2 | This workboard-only PR. |
| T12 — Close-out learnings sweep: scan execution for follow-ups; file as new LRN entries or follow-up planned CSs as warranted | done | omni-ah-c2 | Candidates filed: LRN-160 (`gh pr edit --add-reviewer` silent no-op on Copilot bot — re-add to confirm via `requested_reviewers`); LRN-161 (intermittent GraphQL 401 storm during the session — retry-with-backoff worked across `gh pr edit`, `gh api graphql`, and CI checks). |

## Model audit

| Field | Value |
| --- | --- |
| Implementer agent | omni-ah-c2 |
| Implementer models | claude-opus-4.7-1m-internal |
| Reviewer agent | (TBD: PR-level rubber-duck) |
| Reviewer model | gpt-5.5 |
| Fallback rationale | n/a |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

**Reviewer:** gpt-5.5 (multi-round PR-level rubber-duck; merged R3@`06c12bf` + R4@`8a175d4` + R6@`789fc4e`) + claude-sonnet (Copilot R5@`8a175d4` No-Findings + R7@`789fc4e` No-Findings).
**Date:** 2026-06-10
**Outcome:** GO — all R3/R4/R6 verdicts Go; both Copilot rounds No-Findings after addressing R1 (3 Important Suggestions: parseInt → string compare, tighten regex, drop decorated fixture) + R2 (2 Suggestions: typo + PR-body 4→6 cases drift). Merged at `b580260` (2026-06-10T16:14:41Z).

| Round | Reviewer model | Reviewer agent | Implementer model(s) | Verdict | Findings recap (≤200 chars) | Evidence |
|---|---|---|---|---|---|---|
| R1 (local, pre-PR) | gpt-5.5 | rubber-duck (PvI) | claude-opus-4.7-1m-internal | Needs-Fix | F1: backwards-walk too permissive — a `### LRN-X` inside a prior entry's body could be accepted as the next entry's header. Fixed in-flight by strict-adjacency rewrite + new shadowing fixture (test #21). | Local session transcript |
| R2 (local, post-fix) | gpt-5.5 | rubber-duck (PvI) | claude-opus-4.7-1m-internal | Go-with-amendments | F1 resolved; CHANGELOG wording nit (still described superseded walk-back algorithm) — fixed before commit. | Local session transcript |
| R3 (PR-level R1, @ `06c12bf`) | gpt-5.5 | rubber-duck (PR-level) | claude-opus-4.7-1m-internal | Go | Verified strict adjacency / regex / errors / fixtures / tests / LEARNINGS.md 159 entries 0 errors; scope/security/perf OK. | PR #295 body Review log |
| Copilot R1 (@ `06c12bf`) | claude-sonnet | copilot-pull-request-reviewer | n/a | 3 Important Suggestions | F1: parseInt drops leading zeros (`### LRN-1` would silently match `id: LRN-001` → broken anchor). F2: trailer regex accepts decorated headers but real LEARNINGS.md is bare 159/159 and `assertHeadings()` exact-match. F3: valid fixture's decorated form inconsistent with real convention. All 3 addressed in `8a175d4`: string-compare digits, tightened regex `^### LRN-(\d+)\s*$`, fixture cleanup + 2 new regression fixtures (#22 decorated-rejected, #23 leading-zero-mismatch). | https://github.com/henrik-me/agent-harness/pull/295#pullrequestreview-4469409621 |
| R4 (PR-level R2, @ `8a175d4`) | gpt-5.5 | rubber-duck (PR-level) | claude-opus-4.7-1m-internal | Go | Verified F1+F2+F3 all addressed cleanly; strict adjacency intact; 24/24 tests; LEARNINGS.md 159 entries 0 errors; no scope creep; merge as-is. | PR #295 body Review log |
| Copilot R2 (@ `8a175d4`) | claude-sonnet | copilot-pull-request-reviewer | n/a | 2 Suggestions | (a) typo `Per C69-1` → `Per CS69-1` in Check 7 comment, (b) PR description still said 4 cases/fixtures but actually 6. Both addressed: (a) in `789fc4e`, (b) via PR body PATCH. | https://github.com/henrik-me/agent-harness/pull/295#pullrequestreview-4469477138 |
| R6 (PR-level R3, @ `789fc4e`) | gpt-5.5 | rubber-duck (PR-level, delta attestation) | claude-opus-4.7-1m-internal | Go | 1-char comment typo only; no behavior impact; clean scope. | PR #295 body Review log |
| Copilot R3 (@ `789fc4e`) | claude-sonnet | copilot-pull-request-reviewer | n/a | No-Findings | Reviewed 9/9 files, no new comments. | https://github.com/henrik-me/agent-harness/pull/295#pullrequestreview-4469521219 |

**Merge SHA:** `b580260f88cc2a9bf7f0c8911bf6531c46608b30` (squash-merge by orchestrator @ 2026-06-10T16:14:41Z).
**Independence-invariant:** implementer `claude-opus-4.7-1m-internal` ∩ reviewers `{gpt-5.5, claude-sonnet}` = ∅ ✓.
**Deliverables verified:**
1. `scripts/check-learnings.mjs` Check 7 — strict adjacency + bare-header regex + exact digit-string comparison. ✓
2. 6 new fixture-based test cases (#18–#23) — all pass. ✓
3. 6 new fixtures under `tests/fixtures/cs69/`. ✓
4. `LEARNINGS.md` LRN-154 flipped `open → applied` with merge SHA disposition. ✓ (this PR)
5. CHANGELOG `[Unreleased]/Added` bullet. ✓
6. `node scripts/check-learnings.mjs --file LEARNINGS.md` exits 0 on real file (159 entries, 0 errors, 1 unrelated warning). ✓
7. `node bin/harness.mjs lint --quiet` → 30/0/3 (post-merge). ✓
8. Full test suite 1188 → 1190 pass after merge (2 additional cases beyond original plan).

**New LRNs filed by this CS:** LRN-160 (`gh pr edit --add-reviewer` silent no-op), LRN-161 (GraphQL-401 storm + retry pattern). See `LEARNINGS.md`.
