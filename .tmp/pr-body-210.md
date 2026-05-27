## Summary

Post-close-out doc sweep after **CS53** (v0.6.0 release) and **SI PR #79** (cross-repo pin-bump, admin-squash-merged at [`cbaa608b`](https://github.com/henrik-me/sub-invaders/commit/cbaa608b8196e03ebb09e168562501c105930622)).

This is a **workboard-only / doc-only PR** that:

1. Files **3 new LRNs** (LRN-134/135/136) surfaced during the SI PR #79 unblock effort.
2. Files **CS54 plan** (`planned_cs54_v0.6.1-doc-cleanups-and-cross-repo-checklist.md`) — v0.6.1 patch release bundling the LRN fixes + 2 real Copilot-surfaced template defects in v0.6.0 composed templates + `reviews.*` / `review_gates.*` schema disambiguation.
3. Refreshes `CONTEXT.md` + `WORKBOARD.md` banners to reflect the SI merge + CS54 filing.

No runtime code, schema, or test changes — pure documentation + planning.

## LRN summaries

- **LRN-134** (cross-repo pin-bump PR body checklist): The cross-repo pin-bump PR body MUST inline the canonical `## Model audit` + `## Review log` sections. Consumer `.github/pull_request_template.md` files can lag the harness version (often not in `managed.files`); v0.6.0's strict-flip default makes stale templates hard-fail A3 (independence) + A4 (stale-diff). Blocked SI PR #79 for ~30min during CS53 post-close-out.
- **LRN-135** (narrow re-attest pattern): After a content PR's R1 full-diff Go, each subsequent commit invalidates the latest Review log Go row's `analyzed_head` (A4 gate). For TRIVIAL deltas (≤20 lines, doc-only or 1-2 line code cleanups, no behavior change) dispatch a NARROW re-attest — same reviewer/model/agent, hash unchanged, "verify trivial delta is innocuous" briefing. Used 3x in CS53 with zero documentation.
- **LRN-136** (Review log Model column bare-id rule): The `Model` column in `## Review log` rows MUST be the bare reviewer-model id (e.g. `gpt-5.5`, `claude-sonnet-4.6`); decorations like `gpt-5.5 (R2)` or `gpt-5.5 (PvI)` silently fail `check-review-evidence.mjs`. Memory-only rule today, no tooling protection. CS54 T5 adds parser-side rejection + regression test.

## CS54 scope (v0.6.1 patch)

- T1: fix stray `\\\\\\\\\\\\` fence at `template/composed/OPERATIONS.md:680`
- T2: normalise prose label `Implementer model used` → `IMPLEMENTER MODEL USED` at OPERATIONS.md:656 (matches template L669)
- T3: codify cross-repo pin-bump PR body checklist in OPERATIONS.md (LRN-134)
- T4: document narrow re-attest pattern in OPERATIONS.md (LRN-135)
- T5: lock Review log Model bare-id rule via REVIEWS.md update + `scripts/check-review-evidence.mjs` parser tightening + regression test in `tests/check-review-evidence.test.mjs` (LRN-136)
- T6: disambiguate `reviews.*` vs `review_gates.*` schema blocks in REVIEWS.md with verbatim field copy from schema:139-200
- T7: cut v0.6.1 release

## Plan review

CS54 plan review:

- R1 (gpt-5.5, hash `cccb7251bcdb`): Needs-Fix — T5/T6/CLI deliverables had bugs
- R2 (gpt-5.5, hash `bbdeaf3327d4`): Needs-Fix — fixed except stale `reviews.primary_model` in Background
- R3 (gpt-5.5, hash `bbdeaf3327d4`): Go — narrow re-attest after Background fix

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
| R1 | rubber-duck (CS54 plan R1) | gpt-5.5 | Needs-Fix | 9b3c47f | 2026-05-27T17:30:00Z | plan-review-hash cccb7251bcdb |
| R2 | rubber-duck (CS54 plan R2) | gpt-5.5 | Needs-Fix | 9b3c47f | 2026-05-27T17:40:00Z | plan-review-hash bbdeaf3327d4 |
| R3 | rubber-duck (CS54 plan R3 narrow re-attest) | gpt-5.5 | Go | 9b3c47f | 2026-05-27T17:45:00Z | plan-review-hash bbdeaf3327d4 |

## Validation

- `node bin/harness.mjs lint` → 30 passed, 0 failed, 3 skipped
- `node scripts/validate-schemas.mjs` → 142 passed, 0 failed
- `node --test tests/check-learnings.test.mjs tests/check-clickstop.test.mjs tests/check-clickstop-plan-review.test.mjs` → 60 passed, 0 failed

## Known limitations / follow-ups

- CS54 itself implements the fixes; this PR only files the plan + LRNs.
- SI-side `.github/pull_request_template.md` refresh deferred to CS54b sibling (touches consumer scaffold semantics; separate rollout risk).

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>