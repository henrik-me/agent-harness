# CS03b — Upgrade `lib/templating.mjs` and `lib/lock.mjs` from stubs to rich APIs + add plan-vs-implementation review gate

**Status:** done
**Owner:** yoga-ah
**Branch:** cs03b/content (squash-merged as `846f3be`)
**Started:** 2026-05-04
**Closed:** 2026-05-04
**Filed by:** CS03 close-out per [LRN-016](../../../LEARNINGS.md#lrn-016) (parallel sub-agent file race lost the rich APIs that `cs03-templating` and `cs03-lock` had authored).
**Depends on:** CS03

## Goal

Two related deliverables, bundled because (a) both gate CS11 (HIGH-RISK self-host swap) and (b) CS03b becomes the first CS to exercise its own new close-out gate:

1. **Recover the rich-API features for `lib/templating.mjs` and `lib/lock.mjs`** that were lost in the CS03 parallel-sub-agent file race. The current v0.1.0 implementations are functional minimal-baseline; the rich APIs add safety + UX features needed before CS11 swaps the harness onto its own engine.
2. **Add the plan-vs-implementation review gate** as the mandatory last step before closing any CS. The gate uses GPT-5.5 to verify what shipped matches what the plan said, that test coverage is adequate, and surfaces deviations. Documented in OPERATIONS.md, INSTRUCTIONS.md, and `.github/copilot-instructions.md`; mechanically enforced by `check-clickstop.mjs`. Existing done CSs (CS01–CS10) are grandfathered with an explicit marker.

## Background

During CS03, 5 sub-agents were dispatched in parallel for the sync engine library. `cs03-sync` (Sonnet) wrote stub `lib/templating.mjs` and `lib/lock.mjs` early in its run so its own code could `import` them. The `cs03-templating` (Haiku) and `cs03-lock` (Sonnet) sub-agents reported success with much richer APIs, but their writes were not preserved on disk — the sync sub-agent's stubs remained final. Per [LRN-016](../../../LEARNINGS.md#lrn-016) and [LRN-017](../../../LEARNINGS.md#lrn-017).

Note: `lib/lock.mjs` already grew significantly during the CS03 review iterations (atomic write, schema validation, LockError class with codes, validateLockObject helper) — many of the rich-API features have ALREADY landed via fixes-v1. So this CS is mostly about templating + the few remaining lock features.

## Deliverables

### `lib/templating.mjs` upgrades
- `applyTemplating(input, vars, opts)` rich signature with `opts.strict` (**default `false`** for backward-compat with v0.1.x lenient behavior; set `true` per call when needed), `opts.placeholderPattern`, plus a sentinel for missing-variables collection
- `TemplatingError` class extending `Error` with `code` (e.g. `ETPL_UNKNOWN_VAR`, `ETPL_BAD_PATTERN`)
- Whitespace tolerance: `{{ name }}` works
- Escape syntax: `\{{name}}` is preserved literally as `{{name}}` (leading `\` consumed)
- Single-pass guarantee: substituted value NOT re-scanned for placeholders
- Behavioural decision (re-confirm at CS03b time): substitution applies inside fenced code blocks (consumer code samples may legitimately use `{{x}}`). Document in JSDoc.
- 9+ tests (the lost-tests baseline cs03-templating reported)

### `lib/lock.mjs` upgrades (most landed in CS03 fixes-v1; remaining):
- `newEmptyLock({ harnessRef, resolvedSha, configSchemaVersion })` helper — lock skeleton factory used by sync engine on first sync
- Verify atomic-write semantics work cross-platform (Windows MoveFileExW, Linux/macOS rename)
- Confirm `LockError.code` enum stable (**`EBADLOCK | ESCHEMA`** — the originally-planned `ENOLOCK` was dropped because `readLock` returns `null` for missing-lock rather than throwing; documented in `lib/lock.mjs` JSDoc) and documented in JSDoc

### Tests
- `tests/templating.test.mjs`: minimum 9 tests covering all 9 manual scenarios from cs03-templating's report (substitution, whitespace, escape, strict/lenient, code-fence, multi-placeholder, repeat, unknown error, unicode)
- `tests/lock.test.mjs`: extend to cover `newEmptyLock` + cross-platform atomic-write spot-check

### Sync engine integration
- Update `lib/sync.mjs` to use `newEmptyLock()` for fresh-sync lock skeleton (replaces inline construction)
- Update `lib/sync.mjs` templating call to pass `opts: { strict: true }` if/when strict templating is desired (defer to a runtime decision OR keep lenient for v0.1.x backward-compat — re-confirm at CS03b)

### Plan-vs-implementation review gate (NEW — process)

- **Convention:** every CS file (planned/active/done) has a top-level `## Plan-vs-implementation review` H2 section. Planned files contain a placeholder line ("filled at close-out"). Active files may begin populating it during the content phase. Done files MUST contain a populated review with: `**Reviewer:** GPT-5.5`, `**Date:** YYYY-MM-DD`, `**Outcome:** GO|NEEDS-FIX`, plus prose summarising plan-vs-built, test-coverage assessment, and findings.
- **Process docs updated** (root + template):
  - `template/composed/OPERATIONS.md` § Claim → Three-PR shape: amend the close-out PR step to require the gate; add a new sub-section `### Plan-vs-implementation review (close-out gate)`.
  - Root `OPERATIONS.md` mirrors the same change (CS01 proto until CS11 sync replaces it).
  - `template/managed/INSTRUCTIONS.md` § Closing a CS: add explicit "Run plan-vs-implementation review (GPT-5.5)" bullet as the final step.
  - Root `INSTRUCTIONS.md` mirror.
  - `template/managed/.github/copilot-instructions.md` Per-CS loop step 9 amended to include the gate.
- **Linter:** extend `scripts/check-clickstop.mjs` to require `## Plan-vs-implementation review` H2 in every active/done file; for done files, additionally require Reviewer/Date/Outcome markers OR a literal grandfathering line.
- **Tests:** extend `tests/check-clickstop.test.mjs` with new fixtures + test cases for each gate scenario.
- **Retrofits:**
  - All 10 existing done CSs (CS01–CS10): add the section with the grandfathering one-liner.
  - All planned CSs: add the section header with a "filled at close-out" placeholder.
- **Self-application:** at CS03b close-out, the orchestrator runs the new gate against CS03b itself and populates this CS's `## Plan-vs-implementation review` section before the active→done rename.

## Exit criteria

- All existing tests still pass (411+ baseline; this CS adds ≥15 new).
- New tests cover the rich-API features (templating + lock).
- New tests cover the gate enforcement (`check-clickstop.mjs`).
- `node scripts/validate-schemas.mjs` exit 0 (no schema regression).
- `node bin/harness.mjs lint --quiet` exits 0 (with the new check-clickstop rule active).
- Documentation comment in `lib/templating.mjs` and `lib/lock.mjs` references this CS as the source of the rich API.
- Every CS file under `project/clickstops/{active,done,planned}/` has the `## Plan-vs-implementation review` section per the new convention.
- This CS file's own `## Plan-vs-implementation review` section is populated by the new gate BEFORE close-out rename.

## Sub-agent fan-out

3 parallel sub-tasks (per cs-plan parallelisation pattern): `lib/templating.mjs` upgrade, `lib/lock.mjs` upgrade, sync integration tests. Briefings MUST include:
- Hard "no commit" preflight (per [LRN-021](../../../LEARNINGS.md#lrn-021))
- Explicit file ownership: each sub-agent owns ONE file; sync integration sub-agent reads but does not write `templating.mjs` or `lock.mjs` (per [LRN-016](../../../LEARNINGS.md#lrn-016))
- Post-completion verification: orchestrator runs `git status --short` + per-file size check after each wave (per [LRN-017](../../../LEARNINGS.md#lrn-017))

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| `lib/templating.mjs` rich API + `tests/templating.test.mjs` | done | sub-agent cs03b-templating | agent-id=yoga-ah-sub-1 \| role=lib-author \| report-status=complete \| learnings=1 |
| `lib/lock.mjs` `newEmptyLock` + extend `tests/lock.test.mjs` | done | sub-agent cs03b-lock | agent-id=yoga-ah-sub-2 \| role=lib-author \| report-status=complete \| learnings=0 |
| `lib/sync.mjs` integration (use `newEmptyLock`; keep templating lenient for v0.1.x backcompat) | done | orchestrator | agent-id=yoga-ah \| role=orchestrator \| report-status=complete \| learnings=0 |
| Process-gate doc updates + linter extension + retrofits (10 done + 9 planned) | done | sub-agent cs03b-gate | agent-id=yoga-ah-sub-3 \| role=process-gate \| report-status=complete \| learnings=1 |
| Self-application: run new gate against CS03b + populate this CS's review section | done | orchestrator | agent-id=yoga-ah \| role=orchestrator \| report-status=complete \| learnings=0 |

## Plan-vs-implementation review

**Reviewer:** GPT-5.5 (rubber-duck)
**Date:** 2026-05-04
**Outcome:** GO (R3 verdict; R1 and R2 each surfaced 1–2 blockers, all addressed inline)

### Plan vs implementation

| Deliverable | Outcome | Notes |
|---|---|---|
| `lib/templating.mjs` rich API (TemplatingError, opts.strict, opts.placeholderPattern, whitespace, escape, single-pass, code-fence-agnostic) | match | 208 lines; 18 tests including ASCII-only-keys (default) + custom Unicode-property pattern (extension point). |
| `lib/lock.mjs` `newEmptyLock` factory + `LockError.code` enum stable | match | Schema-validated factory; 17 lock tests. `LockError.code` clarified as `EBADLOCK \| ESCHEMA` (originally-planned `ENOLOCK` was dropped because `readLock` returns `null` for missing-lock; documented inline in JSDoc). |
| `lib/sync.mjs` integration uses `newEmptyLock` | match | Replaces inline `lockAfter` construction. Templating call kept lenient (default `opts.strict=false`) for v0.1.x backcompat. |
| Plan-vs-implementation review gate | match | Mandatory close-out gate added. Process docs (root + template OPERATIONS, INSTRUCTIONS, copilot-instructions) updated. `check-clickstop.mjs` enforces section presence (active/done) + body validation (done). 6 new fixtures + 6 new linter tests. 10 done CSs grandfathered + 9 planned CSs placeholder-stamped. **CS03b is the first CS to exercise the gate on itself.** |
| Inline orchestrator fixes | added | `scripts/check-workboard.mjs` extended to accept `CS\d+[a-z]?` IDs (was rejecting `CS03b`). |

### Test coverage

Sufficient. Verified:
- `node --test tests/*.test.mjs` → **432 pass / 0 fail** (was 411 baseline; +21 new: 11 templating + 4 lock + 6 gate).
- `node scripts/check-clickstop.mjs --dir project/clickstops` → 0 errors.
- `node bin/harness.mjs lint --quiet` → 9 pass / 0 fail / 3 skipped.
- `node scripts/validate-schemas.mjs` → 69 pass / 0 fail.

### Findings

R1 (NEEDS-FIX, 2 blockers + 1 NB):
1. Missing unicode templating test → added.
2. `LockError.code` enum mismatch (`ENOLOCK` planned but absent in code) → JSDoc reconciled to document the deliberate drop.
3. (NB) Templating strict-default conflict → active CS file deliverables table updated to mark `false` as intentional v0.1.x backcompat.

R2 (NEEDS-FIX, 1 blocker + 1 NB):
1. R1's "unicode test" only covered values, not keys (default pattern is ASCII-only) → renamed test to clarify intent and added a second test demonstrating the custom-pattern extension point with Unicode property classes.
2. (NB) Sync integration row still pending in Tasks table → flipped to `done`.

R3: GO. No remaining blockers. No non-blocking issues. Self-application of the gate validated end-to-end on the CS that introduces it.

## Notes / Learnings

(filled during execution)
