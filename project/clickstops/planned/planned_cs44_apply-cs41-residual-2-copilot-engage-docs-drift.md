# CS44 — Apply CS41 R5 F-residual-2: align `harness copilot-engage` doc wording (`node(login:)` → `node(id:$id)` + `BOT_kgDOCnlnWA`) with shipped impl

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
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

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per [OPERATIONS.md § Claim](../../../OPERATIONS.md#claim)) | planned | — | — |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
