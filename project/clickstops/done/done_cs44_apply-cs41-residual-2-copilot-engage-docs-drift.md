# CS44 — Apply CS41 R5 F-residual-2: align `harness copilot-engage` doc wording (`node(login:)` → `node(id:$id)` + `BOT_kgDOCnlnWA`) with shipped impl

**Status:** done
**Owner:** yoga-ah
**Branch:** cs43-45/cs41-residuals-bundle
**Started:** 2026-05-14
**Closed:** 2026-05-14
**Filed by:** Pre-CS44 disposition of [CS41 § R5 Copilot disposition F-residual-2](../done/done_cs41_copilot-engage-cli-and-default-flip.md#r5-copilot-disposition--copilot-r4-review-residuals) (CS41 close-out, 2026-05-14, admin-merged at squash SHA `cd11fbd`). Authored 2026-05-14 by `yoga-ah` per [INSTRUCTIONS.md § Pre-claim gate](../../../INSTRUCTIONS.md#claiming-a-cs).
**Depends on:** None. Independent of CS42 (release v0.5.0); may claim before or after the v0.5.0 cut — but **strongly preferred to land before CS42 tag** so the v0.5.0 release notes describe the actual identity-resolution mechanism, not the documented-but-not-shipped login-based one. **Note (LRN-numbering):** done_cs41 R5 prose cites this residual as "LRN-118" but `LEARNINGS.md` LRN-118 documents the unrelated empty-cell linter semantics fix. The canonical reference is the **F-residual-2 anchor** in done_cs41 § R5.

## Goal

Reconcile a pure documentation drift between the `harness copilot-engage` narrative (in `OPERATIONS.md` § Copilot engagement procedure, the composed mirror at `template/composed/OPERATIONS.md`, and the `[Unreleased] / Added` CHANGELOG.md row for CS41) and the shipped implementation in `lib/copilot-engage.mjs`. The docs say Copilot's identity is resolved via the `node(login:)` / `... on Bot` GraphQL fragment, but `IDENTITY_NODE_QUERY` at `lib/copilot-engage.mjs:41-46` actually queries `node(id:$id) { ... on Bot { databaseId login } }` with a hardcoded `COPILOT_NODE_ID = 'BOT_kgDOCnlnWA'` constant (line 10). The hardcoded ID was the CS37 spike's verified workaround for the fact that `query { user(login: "copilot-pull-request-reviewer") { id } }` returns null — Copilot's Bot identity is not exposed via the `user(login:)` resolver.

The doc drift was surfaced by the CS41 R4 dogfood Copilot review (review at HEAD `c099ee5`, 2026-05-14T04:01:47Z) and dispositioned as a deferred residual under `## Plan-vs-implementation review § R5 Copilot disposition F-residual-2`. The issue is **purely documentation** — no behaviour change is needed; the CS37 spike confirmed `node(id:$id)` is the correct mechanism and the impl already uses it. The CS only updates the prose to match, and adds a one-line rationale so future readers don't ask "why hardcoded?".

## Background

The chronology of the drift:

1. **CS37 ADR-0004 § ADR4-2** documented the Copilot engagement primitive as `node(login: "copilot-pull-request-reviewer") { id } on Bot` based on the then-best-guess identity-resolution recipe.
2. **CS37 spike** discovered that `user(login:)` returns null for Bot accounts and that the only stable resolution is to hardcode the Bot's GraphQL node ID (verified: `BOT_kgDOCnlnWA`). The spike landed the workaround in code but the OPERATIONS.md narrative was not refreshed; the original `node(login:)` wording survived from the planning ADR.
3. **CS41** built `harness copilot-engage` on top of the CS37 spike's verified mechanism. The implementation correctly uses `node(id:$id)` and `COPILOT_NODE_ID = 'BOT_kgDOCnlnWA'`. The OPERATIONS.md § Copilot engagement procedure was rewritten to point at the new CLI but copy-pasted the stale `node(login:)` wording from the ADR. The CHANGELOG.md entry for CS41 inherited the same stale wording.
4. **CS41 R4 Copilot dogfood** flagged `OPERATIONS.md:803`, `template/composed/OPERATIONS.md:803`, and `CHANGELOG.md:14` as out of sync with `lib/copilot-engage.mjs:41-46`. Filed as F-residual-2.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C44-1 | Source of truth | The shipped impl at `lib/copilot-engage.mjs:41-46` (using `node(id:$id) { ... on Bot { databaseId login } }` with hardcoded `COPILOT_NODE_ID = 'BOT_kgDOCnlnWA'`) is the source of truth. Docs are updated to match — the impl is NOT changed. | Per [LRN-009](../../../LEARNINGS.md#lrn-009) (CS37 spike) `user(login:)` returns null for Bot accounts; reverting the impl to a login-based query would re-break the CLI. |
| C44-2 | New doc wording | Replace "node(login:) / `... on Bot` GraphQL fragment" with "the `node(id:$id) { ... on Bot { databaseId login } }` GraphQL fragment with the hardcoded Copilot Bot node ID `BOT_kgDOCnlnWA`" in OPERATIONS.md, template/composed/OPERATIONS.md, and CHANGELOG.md `[Unreleased] / Added` § CS41 row. | Concise, accurate, explicit about the hardcoded ID so reviewers don't have to chase the source. |
| C44-3 | Rationale for hardcoded ID | Add a single sentence after the new wording in OPERATIONS.md (root + composed): "The hardcoded ID is required because `user(login: 'copilot-pull-request-reviewer')` returns `null` per the CS37 GraphQL spike — see [LRN-009](../../LEARNINGS.md#lrn-009) and ADR-0004 § ADR4-2." | One-sentence rationale prevents the "why hardcoded?" question from generating future CSs. |
| C44-4 | Composed-file workflow | Edit `template/composed/OPERATIONS.md` first, then run `harness sync --mode=apply --resolved-sha <sha>` to refresh root `OPERATIONS.md` + `.harness-lock.json` per [LRN-070](../../../LEARNINGS.md#lrn-070). Do NOT hand-edit root `OPERATIONS.md`. | Standard self-host composed-file workflow (CS03c, CS06c, CS08c, CS15f, CS24-style). |
| C44-5 | ADR-0004 update? | Out of scope. The ADR documents the original decision; ADRs are immutable historical records per the harness ADR convention. The drift between ADR4-2 and the shipped impl is captured in [LRN-009](../../../LEARNINGS.md#lrn-009)'s body, which is the right place. | Mutating ADRs would erase the decision trail; the LRN already documents the spike outcome. |
| C44-6 | Test approach | Light: add a `tests/cs44-docs-impl-alignment.test.mjs` that asserts the four touchpoints (`OPERATIONS.md`, `template/composed/OPERATIONS.md`, `CHANGELOG.md`, plus `lib/copilot-engage.mjs:41-46` ≡ canonical impl) all reference `node(id:` and `BOT_kgDOCnlnWA` in the relevant paragraph. The test acts as a doc-drift watchdog so a future doc edit reverting to `node(login:)` will be caught. | Cheap insurance against the same drift recurring. |
| C44-7 | LRN-009 cross-link tightening | If [LRN-009](../../../LEARNINGS.md#lrn-009)'s body does not already cite the `BOT_kgDOCnlnWA` hardcoded ID, append an `Implications` bullet: "OPERATIONS.md § Copilot engagement procedure documents the resulting `node(id:$id)` workaround per CS44." Verify at claim time and skip if already present. | Closes the loop on the doc/impl/LRN tri-link. |

## Deliverables

1. **`template/composed/OPERATIONS.md`** § Copilot engagement procedure (around line 803): replace the `node(login:)` / `... on Bot` wording per C44-2 + add the rationale sentence per C44-3.
2. **`OPERATIONS.md`** root: regenerated via `harness sync --mode=apply --resolved-sha <sha>` per C44-4 (do NOT hand-edit).
3. **`CHANGELOG.md`** `[Unreleased] / Added` § CS41 row (line 14 at HEAD `fa047cd`): replace the `node(login:)` / `... on Bot` wording per C44-2.
4. **`tests/cs44-docs-impl-alignment.test.mjs`** (new): per C44-6, asserts the three doc paths and the source code stay in sync. Minimum 4 assertions (one per touchpoint).
5. **`LEARNINGS.md`** [LRN-009](../../../LEARNINGS.md#lrn-009) body: append the cross-link bullet per C44-7 if not already present.
6. **CHANGELOG.md** `[Unreleased] / Changed` (separate row from the CS41 fix): "`harness copilot-engage` documentation now matches the shipped `node(id:$id)` + hardcoded `BOT_kgDOCnlnWA` mechanism (CS44 — corrects doc drift inherited from ADR-0004 § ADR4-2)."

## Sub-agent fan-out

Single-CS scope; orchestrator-owned. No fan-out warranted (3 small text edits + 1 sync regeneration + 1 watchdog test fits cleanly in one session).

## Exit criteria

CS44 close-out is permitted only when **all** of the following are true and recorded in the active CS file's `## Plan-vs-implementation review` section:

1. `template/composed/OPERATIONS.md`, root `OPERATIONS.md`, and `CHANGELOG.md` `[Unreleased] / Added` § CS41 all use the canonical `node(id:` wording with `BOT_kgDOCnlnWA` mention.
2. Root `OPERATIONS.md` was regenerated via `harness sync --mode=apply --resolved-sha <sha>`, not hand-edited; `.harness-lock.json` reflects the new sha.
3. `tests/cs44-docs-impl-alignment.test.mjs` exists and passes.
4. `node --test tests/*.test.mjs` exits 0; total test count is `prior + ≥4`.
5. `node bin/harness.mjs lint --quiet` exits 0 (≥29 pass / 0 fail / 3 skipped baseline).
6. `node bin/harness.mjs sync --mode=check --cwd .` reports `No drift detected`.
7. CHANGELOG.md `[Unreleased] / Changed` includes the doc-correction bullet (C44-2) so the v0.5.x or v0.6.0 release notes capture this audit trail.
8. `## Plan-vs-implementation review` records at least one GPT-5.5 plan-vs-impl review with verdict Go.

## Risks + open questions

- **R1 (low):** A future CS could refresh OPERATIONS.md with a different identity-resolution mechanism (e.g. if GitHub eventually exposes Copilot via `user(login:)`). The watchdog test (C44-6) would then fail and would need to be updated together with the impl + docs in that CS. Acceptable — that's a coordinated change. Document this in the test's leading comment.
- **R2 (low):** ADR-0004 will continue to read `node(login:)` since ADRs are immutable. A new reader following the ADR-link from OPERATIONS.md may be momentarily confused. Mitigation: the rationale sentence (C44-3) explicitly cites ADR-0004 § ADR4-2 and LRN-009; a careful reader will see the LRN's "Disposition" section explains the spike outcome.
- **OQ1 (defer to claim time):** Whether to also update `template/composed/REVIEWS.md` if it references the Copilot identity-resolution mechanism in any worked example. Default: probably not — REVIEWS.md is about review-evidence schemas, not identity resolution. Verify at claim time and add to the deliverable list if a citation exists.

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.7-xhigh | rubber-duck dispatched (orchestrator: yoga-ah) | 042dc747f02d | 2026-05-14T04:50:00Z | Go-with-amendments | CS44 grandfather: filed in PR #178 between CS35b and CS42; missed Plan-review section at filing. Backfilled here per CS42-7. Plan content unchanged. |
## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| Edit `template/composed/OPERATIONS.md` § Copilot engagement procedure: stale wording → `node(id:$id)` + `BOT_kgDOCnlnWA` per C44-2 | done | yoga-ah | composed-mirror first per LRN-070 |
| Add rationale sentence after the new wording (cite LRN-009 + ADR-0004 § ADR4-2) per C44-3 | done | yoga-ah | one sentence, same paragraph |
| Run `harness sync --mode=apply --resolved-sha <sha>` to regenerate root `OPERATIONS.md` + refresh `.harness-lock.json` per C44-4 | done | yoga-ah | DO NOT hand-edit root; required two passes due to stale `template_prose_hash` in lock — see Notes |
| Edit `CHANGELOG.md` `[0.5.0] / Added` § CS41 row to use the canonical `node(id:` wording per C44-2 | done | yoga-ah | the row already shipped under [0.5.0] (not [Unreleased]) since CS42 cut v0.5.0; edited in place — see Notes |
| Add CHANGELOG.md `[Unreleased] / Changed` bullet documenting this doc-correction (bundled w/ CS43 + CS45) | done | yoga-ah | bullet uses neutral "stale `node`-by-login wording" phrasing so the watchdog regex doesn't trip on the changelog itself |
| Add `tests/cs44-docs-impl-alignment.test.mjs` (≥4 assertions) per C44-6 | done | yoga-ah | 9 assertions total: 4 touchpoints × `node(id:` (4) + 4 touchpoints × `BOT_kgDOCnlnWA` (4) + 1 anti-regression for absence of stale wording; all pass |
| LEARNINGS.md LRN-009 cross-link bullet per C44-7 (skip if already present) | done | yoga-ah | new "Cross-link (CS44, 2026-05-14)" paragraph appended to LRN-009 body |
| Close-out: docs + restart state (bundled with CS43 + CS45) | pending | yoga-ah | per [OPERATIONS.md § Claim](../../../OPERATIONS.md#claim); orchestrator action |
| Close-out: learnings + follow-ups (bundled) | pending | yoga-ah | per [OPERATIONS.md § Claim](../../../OPERATIONS.md#claim); orchestrator action |

## Notes / Learnings

- **CHANGELOG row location drift (briefing said `[Unreleased]/Added`, actual was `[0.5.0]/Added`):** Plan referenced `[Unreleased] / Added` § CS41 row, but CS42 already cut v0.5.0 between CS41 close-out and CS44 claim, so the CS41 row had already moved into the `## [0.5.0] ### Added` block at line ~39. Decision: edit the [0.5.0] CS41 row in place to fix the historical record AND add a separate CS44 doc-correction bullet under `[Unreleased] / Changed`. This preserves changelog accuracy without rewriting release history.
- **Sync required two `--mode=apply` passes (pre-existing stale `template_prose_hash` in `.harness-lock.json`):** First sync attempt with my CS44 + CS45 composed-mirror edits failed with `Composed merge failed for "OPERATIONS.md": Consumer file contains content outside local blocks that does not match the template`. Root cause: the lock's recorded `template_prose_hash` for `OPERATIONS.md` was `a130e2c3...` (stale from synced_at `2026-05-13T21:04:47`), but the current consumer skeleton hashed to `410b5d85...` and the new templated skeleton (with my edits) hashed to `7dbd0926...` — case (b) "consumer edited prose" fail-closed (per `lib/composed.mjs:706-742`). Workaround: stashed my template edits, ran `harness sync --mode=apply` once to refresh the lock's `template_prose_hash` to the current consumer skeleton hash (`410b5d85`), unstashed, ran sync again — case (a) "template prose evolved" → AUTO-ADOPT triggered. Final state: `harness sync --mode=check --cwd .` reports `No drift detected.` Worth filing as a LEARNINGS CANDIDATE — the prose-hash refresh seems to fail silently when the diff between consumer and template is below some threshold; future composed-mirror edits to OPERATIONS.md may hit this same issue.
- **Watchdog test phrasing:** The CHANGELOG `[Unreleased]/Changed` bullet uses "stale `node`-by-login GraphQL fragment wording" instead of the literal `node(login:)` so the new watchdog test (which scans CHANGELOG.md for `/node\(login:\)/`) doesn't trip on the changelog itself. The test's regex is intentionally narrow (only the `node(login:)` form) so future descriptive prose can safely talk about "login-based GraphQL queries" without false positives.

## Plan-vs-implementation review

**Reviewer:** gpt-5.5 (rubber-duck, close-out gate)
**Date:** 2026-05-14T18:29:31Z
**Branch HEAD SHA:** 30f556ef6f63722deb656eec33d0a8afb24c871a
**R-round:** R4 (close-out — supersedes R1 NEEDS-FIX on `60368ff`, R2 PASS on `b91ba2b`, R3 PASS on `3b2e1af`)
**Outcome:** GO
**Evidence link:** https://github.com/henrik-me/agent-harness/pull/188

### Per-deliverable outcome table

| # | Deliverable (from CS plan) | Outcome | Rationale |
|---|----------------------------|---------|-----------|
| C44-1 | Source of truth — shipped impl at `lib/copilot-engage.mjs:41-46` using `node(id:$id)` + hardcoded `COPILOT_NODE_ID = 'BOT_kgDOCnlnWA'`; docs updated, impl not changed. | match |  |
| C44-2 | New doc wording — replace stale `node(login:)` wording with canonical `node(id:$id) { ... on Bot { databaseId login } }` + `BOT_kgDOCnlnWA`. | match |  |
| C44-3 | Rationale for hardcoded ID — add sentence citing CS37 spike / LRN-009 / ADR-0004. | match |  |
| C44-4 | Composed-file workflow — edit `template/composed/OPERATIONS.md`, then run sync to refresh root `OPERATIONS.md` and lock. | match |  |
| C44-5 | ADR-0004 update out of scope. | match |  |
| C44-6 | Test approach — add watchdog test asserting docs and implementation stay aligned. | match |  |
| C44-7 | LRN-009 cross-link tightening. | match |  |
| 1 | **`template/composed/OPERATIONS.md`** § Copilot engagement procedure (around line 803): replace the `node(login:)` / `... on Bot` wording per C44-2 + add the rationale sentence per C44-3. | match |  |
| 2 | **`OPERATIONS.md`** root: regenerated via `harness sync --mode=apply --resolved-sha <sha>` per C44-4 (do NOT hand-edit). | match |  |
| 3 | **`CHANGELOG.md`** `[Unreleased] / Added` § CS41 row (line 14 at HEAD `fa047cd`): replace the `node(login:)` / `... on Bot` wording per C44-2. | diverged | The CS41 row had moved to `[0.5.0] / Added` after CS42 release, so the implementation corrected that historical row in place and added a separate `[Unreleased] / Changed` CS44 bullet. |
| 4 | **`tests/cs44-docs-impl-alignment.test.mjs`** (new): per C44-6, asserts the three doc paths and the source code stay in sync. Minimum 4 assertions (one per touchpoint). | added | The watchdog test landed with 9 assertions across the four touchpoints, exceeding the planned minimum. |
| 5 | **`LEARNINGS.md`** [LRN-009](../../../LEARNINGS.md#lrn-009) body: append the cross-link bullet per C44-7 if not already present. | match |  |
| 6 | **CHANGELOG.md** `[Unreleased] / Changed` (separate row from the CS41 fix): "`harness copilot-engage` documentation now matches the shipped `node(id:$id)` + hardcoded `BOT_kgDOCnlnWA` mechanism (CS44 — corrects doc drift inherited from ADR-0004 § ADR4-2)." | match |  |

### Test-coverage assessment

**Result:** sufficient

`tests/cs44-docs-impl-alignment.test.mjs` directly guards the CS44 contract: root `OPERATIONS.md`, `template/composed/OPERATIONS.md`, `CHANGELOG.md`, and `lib/copilot-engage.mjs` all reference the canonical `node(id:)` mechanism and `BOT_kgDOCnlnWA`, and the stale `node(login:)` form is rejected. This is adequate for a documentation/implementation-alignment CS.

### Notes

The changelog location drift is acceptable: CS42 had already moved the CS41 entry from `[Unreleased]` to `[0.5.0]`, so correcting the released row plus adding a new `[Unreleased] / Changed` audit bullet is the right historical treatment.
