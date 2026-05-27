## Summary

Post-close-out doc sweep after **CS53** (v0.6.0 release) and **SI PR #79** (cross-repo pin-bump, admin-squash-merged at [`cbaa608b`](https://github.com/henrik-me/sub-invaders/commit/cbaa608b8196e03ebb09e168562501c105930622)).

This is a **doc-only PR** that files 3 new LRNs (LRN-134/135/136) surfaced during the SI PR #79 unblock effort, files the CS54 plan (v0.6.1 patch release bundling the LRN fixes + 2 real Copilot-surfaced template defects + `reviews.*` / `review_gates.*` schema disambiguation), and refreshes `CONTEXT.md` + `WORKBOARD.md` banners. No runtime code, schema, or test changes.

## Changes

- `LEARNINGS.md` — added LRN-134/135/136 entries (all open, source_cs: CS53):
  - **LRN-134** (cross-repo pin-bump PR body checklist): Cross-repo pin-bump PR bodies MUST inline canonical `## Model audit` + `## Review log` sections — consumer `.github/pull_request_template.md` can lag the harness version (often not in `managed.files`); v0.6.0 strict-flip makes stale templates hard-fail A3/A4. Blocked SI PR #79 for ~30min during CS53 post-close-out.
  - **LRN-135** (narrow re-attest pattern): After R1 full-diff Go, each subsequent commit invalidates the latest Review log Go row's `analyzed_head` (A4 gate). For TRIVIAL deltas (≤20 lines, doc-only / 1-2 line code cleanups, no behavior change) dispatch a NARROW re-attest — same reviewer/model/agent, hash unchanged, "verify trivial delta is innocuous" briefing. Used 3x in CS53 with zero documentation.
  - **LRN-136** (Review log Model column bare-id rule): The `model` column in `## Review log` rows MUST be the bare reviewer-model id; decorations like `gpt-5.5 (R2)` silently fail `check-review-evidence.mjs`. Memory-only rule today, no tooling protection.
- `project/clickstops/planned/planned_cs54_v0.6.1-doc-cleanups-and-cross-repo-checklist.md` — NEW. 7 tasks: T1 fix stray `\\\\\\\\\\\\` fence at OPERATIONS.md:680; T2 normalise prose label case at L656; T3 codify cross-repo pin-bump checklist (LRN-134); T4 document narrow re-attest pattern (LRN-135); T5 lock Review log Model bare-id rule via parser tightening + regression test (LRN-136); T6 disambiguate `reviews.*` vs `review_gates.*` schema blocks (verbatim copy from schema:139-200); T7 cut v0.6.1 release.
- `CONTEXT.md` — banner refreshed; § Suggested next CSs reordered to place CS47 first, CS54 second.
- `WORKBOARD.md` — banner refreshed to reflect SI merge + CS54 filing.

## Testing

- `node bin/harness.mjs lint` → **30 passed, 0 failed, 3 skipped**
- `node scripts/validate-schemas.mjs` → **142 passed, 0 failed** (validates LRN-134/135/136 frontmatter)
- `node --test tests/check-learnings.test.mjs tests/check-clickstop.test.mjs tests/check-clickstop-plan-review.test.mjs` → **60 passed, 0 failed**
- CS54 plan review: R1 (gpt-5.5, hash `cccb7251bcdb`) Needs-Fix → R2 (gpt-5.5, hash `bbdeaf3327d4`) Needs-Fix → R3 (gpt-5.5, hash `bbdeaf3327d4`) Go (narrow re-attest after trivial Background fix)

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.7-1m-internal |
| Reviewer model | gpt-5.5 |
| Implementer agent | omni-ah |
| Reviewer agent | rubber-duck dispatched (orchestrator: omni-ah) |

## Review log

| round | actor | model | verdict | analyzed_head | timestamp | evidence_link |
|---|---|---|---|---|---|---|
| R1 | rubber-duck (CS54 plan R1) | gpt-5.5 | Needs-Fix | 73b5c68e6d1f855cdf427955afda3b7e70a80065 | 2026-05-27T17:30:00Z | plan-review-hash cccb7251bcdb |
| R2 | rubber-duck (CS54 plan R2) | gpt-5.5 | Needs-Fix | 73b5c68e6d1f855cdf427955afda3b7e70a80065 | 2026-05-27T17:40:00Z | plan-review-hash bbdeaf3327d4 |
| R3 | rubber-duck (CS54 plan R3 narrow re-attest) | gpt-5.5 | Go | 73b5c68e6d1f855cdf427955afda3b7e70a80065 | 2026-05-27T17:45:00Z | plan-review-hash bbdeaf3327d4 |
| R4 | rubber-duck (CS54 plan R4 post-Copilot-R1) | gpt-5.5 | Go | 73b5c68e6d1f855cdf427955afda3b7e70a80065 | 2026-05-27T17:50:00Z | plan-review-hash 43bacd049c23 |
| R5 | rubber-duck (CS54 plan R5 post-Copilot-R3 narrow re-attest) | gpt-5.5 | Go | 73b5c68e6d1f855cdf427955afda3b7e70a80065 | 2026-05-27T18:00:00Z | plan-review-hash 3959850c1ae5 |
| R6 | rubber-duck (CS54 plan R6 post-Copilot-R4) | gpt-5.5 | Needs-Fix | 73b5c68e6d1f855cdf427955afda3b7e70a80065 | 2026-05-27T18:10:00Z | plan-review-hash 2f2c22c4e9b5 |
| R7 | rubber-duck (CS54 plan R7 narrow re-attest) | gpt-5.5 | Go | e4d23e645b166975f8990b14fa01d4ebbe46cbf0 | 2026-05-27T18:20:00Z | plan-review-hash 86b3d487ab9c |
| R8 | rubber-duck (CS54 plan R8 post-Copilot-R5 narrow re-attest) | gpt-5.5 | Go | ac5989cec7f3d4c1d704bb9e37439b5dd79a5c55 | 2026-05-27T18:35:00Z | plan-review-hash 88491e88ad78 |
| R9 | rubber-duck (CS54 plan R9 post-Copilot-R6 narrow re-attest, WORKBOARD+self-row delta) | gpt-5.5 | Go | afcb913189a8219d844553b6b493da50b342f11e | 2026-05-27T18:50:00Z | plan-review-hash 88491e88ad78 |
| Copilot-R1 | copilot-pull-request-reviewer | gpt-5-codex | COMMENTED | 22fb0899cfef113d91558a23b6890e7b26e42818 | 2026-05-27T17:08:00Z | 5 inline findings, all real, all addressed and resolved |
| Copilot-R2 | copilot-pull-request-reviewer | gpt-5-codex | COMMENTED | 4fae1a4269daa0b2327a297e541d218e32548483 | 2026-05-27T17:36:20Z | 1 inline finding (R4 timestamp ordering) addressed and resolved |
| Copilot-R3 | copilot-pull-request-reviewer | gpt-5-codex | COMMENTED | 4fae1a4269daa0b2327a297e541d218e32548483 | 2026-05-27T17:42:22Z | 5 inline findings (stale REVIEWS.md § 2.7 refs), all addressed and resolved |
| Copilot-R4 | copilot-pull-request-reviewer | gpt-5-codex | COMMENTED | 73b5c68e6d1f855cdf427955afda3b7e70a80065 | 2026-05-27T18:05:00Z | 2 inline findings (Goal item 3 § A4 anchor; Deliverables wording re: gate current behavior); both addressed and resolved |
| Copilot-R5 | copilot-pull-request-reviewer | gpt-5-codex | COMMENTED | e4d23e645b166975f8990b14fa01d4ebbe46cbf0 | 2026-05-27T17:59:29Z | 3 inline findings (Goal item 2 non-existent anchor; Deliverables H2/H3 mismatch with T3; backtick nesting in REVIEWS deliverable bullet); all addressed and resolved |
| Copilot-R6 | copilot-pull-request-reviewer | gpt-5-codex | COMMENTED | ac5989cec7f3d4c1d704bb9e37439b5dd79a5c55 | 2026-05-27T18:06:24Z | 1 inline finding (WORKBOARD plan-review status drifted from CS54 plan); addressed and resolved |

## Known limitations / follow-ups

- CS54 itself (not this PR) implements the actual fixes; this PR only files the plan + LRNs.
- SI-side `.github/pull_request_template.md` refresh deferred to a separate CS54b sibling (touches consumer scaffold semantics; separate rollout risk).

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
