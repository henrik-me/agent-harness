# CS03 — Sync engine library (`lib/sync.mjs`)

**Status:** done
**Owner:** yoga-ah
**Branch:** `cs03/sync-engine` (merged) + `cs03/close-out` (close-out)
**Started:** 2026-05-03T07:30Z
**Closed:** 2026-05-03T11:00Z
**Filed by:** CS02 close-out (so CS03 can be claimed via the documented planned → active rename flow per [TRACKING.md § Clickstop lifecycle](../../../TRACKING.md#clickstop-lifecycle))
**Depends on:** CS02

## Goal

Build the pure-Node copy-with-templating engine that respects all three file classes (`managed`, `composed`, `seeded`) and writes a `.harness-lock.json`. This is the engine the schemas from CS02 are designed for.

**This is a high-risk CS** per cs-plan Decision #22 — GPT-5.5 review is mandatory pre-merge (no Sonnet fallback).

## Deliverables

See [`done_cs01_bootstrap-repo/harness-cs-plan.md` § CS03](../done/done_cs01_bootstrap-repo/harness-cs-plan.md) for the canonical deliverables list. Summary:

- `lib/sync.mjs` — orchestrates classes; modes `apply` / `check` / `dry-run`
- `lib/templating.mjs` — `{{project_name}}`-style substitution from `templating` config
- `lib/lock.mjs` — read/write `.harness-lock.json` per `schemas/harness-lock.schema.json`
- `lib/composed.mjs` — composed-class merge with **hardened parser** per [ADR 0001](../../../docs/adr/0001-file-classes.md) (4 recognition conditions; fail-closed on marker-looking text inside code blocks unless escaped; per-block lock-file recording)
- **Sync invariant** (per LRN-001 area + cs-plan re-review): for any composed target, sync REFUSES to overwrite if the target contains non-template/non-block content unless `legacy_composed_mapping.json` explicitly maps or discards each region. Exit non-zero, no partial write.
- Unit tests via `node --test`. Zero runtime deps.
- Fixtures covering each class + each composed-parser edge case (marker-inside-fenced-code, marker-inside-indented-code, marker-in-prose-comment, duplicate-marker-in-example, nested local blocks, block-dropped, block-ID-renamed, template-reordered-around-blocks, legacy-unmapped-content)

## Exit criteria

- All tests pass via `node --test`
- `harness sync --check` against fixture repo behaves correctly (zero false positives, catches all designed drift cases)
- Sync invariant verified: composed file with legacy unmarked content + no mapping → exit non-zero with descriptive message
- All 3 example configs from CS02 (`examples/*.harness.config.json`) parse and the engine can determine which class each declared file belongs to
- Schema drift: any field used by the engine is present in `schemas/harness.config.schema.json` (no engine-only fields)

## Open questions for CS03 design (from CS02 deferred learnings)

- **[LRN-009](../../../LEARNINGS.md#lrn-009)**: `composed.overrides[file].local_blocks` vs top-level `local_blocks[file]` redundancy. **Recommended decision** (from LRN-009 disposition): make `composed.overrides[file].local_blocks` authoritative; deprecate top-level `local_blocks`; emit warning if both present and disagree; remove top-level in v0.2.0.
- **[LRN-010](../../../LEARNINGS.md#lrn-010)**: `composed_block_migrations` schema-ahead-of-engine — engine MUST reject at runtime when non-empty (matches schema description).
- **[LRN-008](../../../LEARNINGS.md#lrn-008)**: AJV strictRequired interaction — if engine does runtime config validation via AJV, use `Ajv2020` with `strict: false` consistent with `validate-schemas.mjs`.
- **[LRN-015](../../../LEARNINGS.md#lrn-015)**: `excluded[]` is literal paths, NOT globs. Engine must treat each as literal string match (paths ending `/` are directory prefixes).
- **Escape syntax for composed markers** (per [ADR 0001 § Error rules](../../../docs/adr/0001-file-classes.md)): pin which characters the parser recognises as escape (zero-width-space U+200B after `<`, OR HTML-entity `&lt;`). Document in `lib/composed.mjs` doc-comments + `check-composed-blocks.mjs` test fixtures.

## Sub-agent fan-out (per cs-plan parallelisation table)

5 parallel sub-tasks per cs-plan: `sync.mjs` / `templating.mjs` / `lock.mjs` / `composed.mjs` / fixtures. Each gets dispatched per the [OPERATIONS.md § Sub-agent dispatch](../../../OPERATIONS.md#sub-agent-dispatch-proto-cs01) template.

**Briefing additions per [LRN-007](../../../LEARNINGS.md#lrn-007):** every CS03 sub-agent briefing must include the relevant schema files in `schemas/` AND ADR 0001 in `docs/adr/` as required reading (not just the cs-plan deliverables list).

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| Author lib/sync.mjs (orchestrator + apply/check/dry-run modes) | done | sub-agent | agent-id=cs03-sync \| role=engine-author \| report-status=complete \| learnings=2 |
| Author lib/templating.mjs (substitution from `templating` config) | done-stub | sub-agent | agent-id=cs03-templating \| role=engine-author \| report-status=complete \| learnings=0 — **rich-API work LOST in parallel race with cs03-sync stubs (LRN-016 candidate); current file is the cs03-sync-written stub. Functional but minimal.** |
| Author lib/lock.mjs (read/write .harness-lock.json per schema) | done-stub | sub-agent | agent-id=cs03-lock \| role=engine-author \| report-status=complete \| learnings=1 — **rich-API work LOST in same race; current file is cs03-sync-written stub. tests/lock.test.mjs (16 tests) also lost.** |
| Author lib/composed.mjs (hardened parser + merge per ADR 0001) | done | sub-agent | agent-id=cs03-composed \| role=engine-author \| report-status=complete \| learnings=2 — full impl + 54 tests pass; 2 escalations (legacy_composed_mapping schema; legacy fail-closed UX) deferred to follow-up CS |
| Author tests/fixtures (per-class + per-edge-case fixtures) | done | sub-agent | agent-id=cs03-fixtures \| role=test-author \| report-status=complete \| learnings=1 — 94 fixtures across 27 dirs |
| Cross-link integrity merge + sync-invariant verification | done | yoga-ah | Stubs added orchestrator-side: tests/templating.test.mjs (8 tests), tests/lock.test.mjs (3 tests). Total tests: 105/0 pass. validate-schemas: 21/0. |
| Local review with GPT-5.5 (mandatory, no fallback per Decision #22) | done | yoga-ah | **7 review iterations (6 No-Go + 1 GO); 12 blocking + 11 non-blocking + 1 suggestion total.** Iter 1: 4 blocking + 4 non-blocking → cs03-fixes-v1 (Sonnet) fixes 4B + 3NB; #8 deferred per GPT-5.5 recommendation. Iter 2: 3 blocking + 3 non-blocking → cs03-fixes-v2 (Sonnet, hard no-commit preflight per LRN-021). Iter 3: 1 blocking + 2 non-blocking + 1 suggestion → inline. Iter 4: 1 blocking + 1 non-blocking → cs03-fixes-v3 (Sonnet). Iter 5: 2 blocking + 1 non-blocking → inline. Iter 6: 1 blocking → inline. Iter 7: GO. |
| Open PR | done | yoga-ah | PR #6 |
| Squash-merge | done | yoga-ah | Commit `4e50789` on main; branch deleted |
| Close-out: file 10 new learnings (LRN-016..025) | done | yoga-ah | All 25 LRN entries validate (`node scripts/validate-schemas.mjs` → 31/0 pass with 25 learnings) |
| Close-out: file planned CS03b (upgrade templating + lock stubs) | done | yoga-ah | `project/clickstops/planned/planned_cs03b_upgrade-templating-lock-stubs.md` — recover rich APIs lost in LRN-016 race |
| Close-out: rename file active → done; update WORKBOARD + CONTEXT | done | yoga-ah | This PR (cs03/close-out) |

## Notes / Learnings

(filled during execution; harvested at close-out)


### Sub-agent ledger summary

**Total work passes: 11 = 5 initial sub-agent jobs + 3 fix-round sub-agent jobs + 3 inline orchestrator fix iterations.**

**Initial 5 (Wave 1 + Wave 2 of CS03 sync engine library):**

- **cs03-templating** (Haiku): rich-API report; **work LOST in race per LRN-016**; stub remains. tests/templating.test.mjs added by orchestrator post-merge (8 tests). Filed planned_cs03b for recovery.
- **cs03-lock** (Sonnet): rich-API report including 16 lost tests; **partially LOST in race per LRN-016** but rich-API features later restored across cs03-fixes-v1/v2/v3 (atomic write, schema validation, LockError class, validateLockObject). tests/lock.test.mjs added by orchestrator post-merge (3 tests; later expanded by fixes-v1/v2 to 16+).
- **cs03-composed** (Sonnet): full impl, 54 tests; 2 escalations (LRN-019/020 deferred); 1 LRN candidate (LRN-018 BOM applied).
- **cs03-sync** (Sonnet): full impl, 40 tests; wrote stubs of templating + lock that won the race (LRN-016 source).
- **cs03-fixtures** (Haiku): 94 fixture files across 27 dirs (templating: 26, lock: 7, composed: 47, sync: 11). 1 LRN candidate (LRN-006 reaffirmed).

**Fix-round 3 (post-content-PR-#6, GPT-5.5 review iterations):**

- **cs03-fixes-v1** (Sonnet): 7 fixes from GPT-5.5 review #1 (4 blocking + 3 non-blocking). Committed without permission per LRN-021.
- **cs03-fixes-v2** (Sonnet, hard no-commit preflight): 6 fixes from review #2 (3 blocking + 3 non-blocking). Honored preflight.
- **cs03-fixes-v3** (Sonnet, hard preflight): 2 fixes from review #4 (1 blocking + 1 non-blocking). Honored preflight.

**Inline orchestrator fix iterations 3:**

- **Review #3:** 3 small fixes inline (1 blocking + 2 non-blocking) — path canonicalization extension; `discard`+`block_id:null` presence check; mtime-test seeding.
- **Review #5:** 3 small fixes inline (2 blocking + 1 non-blocking) — prior-lock canonicalization; empty-canonical rejection; canonical-key collision in overrides/local_blocks.
- **Review #6:** 1 small fix inline (1 blocking) — Map-based accumulator for `__proto__` prototype-pollution safety.

### Process observations

- **HIGH-RISK CS calibration (LRN-024):** 7 review iterations to converge (6 No-Go + 1 GO); 12 blocking + 11 non-blocking + 1 suggestion findings total. Across the 6 No-Go iterations, blocking findings ranged 1–4 per iteration (median 1.5); non-blocking ranged 0–4. Future cs-plan should budget similarly for CS11, CS15a/b, CS18b, CS19.
- **Parallel sub-agent file race (LRN-016/017):** the most expensive lesson — significant work lost. OPERATIONS.md § Sub-agent dispatch needs hard file-ownership declarations + post-completion disk verification. Will be canonicalized in CS08; addressed in cs-plan adjustments.
- **Hard preflight effectiveness (LRN-021):** explicit "DO NOT COMMIT" + final-checklist preflight worked perfectly in cs03-fixes-v2 + v3. Pattern to canonicalize.
- **Sub-agent vs inline tradeoff:** inline edits won for small fixes (≤30 min); sub-agent dispatch overhead dominated. Heuristic: if the fix touches >2 files OR involves new test scenarios that require fixture authoring, dispatch sub-agent; else inline.

### Final state

- 162 tests pass; 21 schema validations pass; 31 total `validate-schemas.mjs` checks pass (3 schemas + 3 examples + 25 learnings).
- `lib/composed.mjs`: 26KB full impl with all 8 ADR 0001 error codes + bijective legacy mapping + allowedBlockIds enforcement + escape syntax + per-block lock records.
- `lib/sync.mjs`: 30KB full orchestrator with plan-then-commit phases + canonical config + Map-based collision detection + atomic lock semantics.
- `lib/lock.mjs`: 4.4KB with atomic write + schema validation + LockError class + validateLockObject helper.
- `lib/templating.mjs`: 1.3KB stub (lenient {{key}} substitution); rich API recovery in CS03b.
- 94 fixture files + 8 test files (including added orchestrator tests).
- 10 new LRN entries (LRN-016 through LRN-025); 1 planned CS filed (CS03b).
