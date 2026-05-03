# CS03 — Sync engine library (`lib/sync.mjs`)

**Status:** active
**Owner:** yoga-ah
**Branch:** `cs03/sync-engine`
**Started:** 2026-05-03T07:30Z
**Closed:** —
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
| Local review with GPT-5.5 (mandatory, no fallback per Decision #22) | pending | yoga-ah | High-risk CS — GPT-5.5 OR explicit user waiver only |
| Open PR | pending | yoga-ah | branch `cs03/sync-engine` |
| Squash-merge | pending | yoga-ah | After GPT-5.5 review clean |

## Notes / Learnings

(filled during execution; harvested at close-out)
