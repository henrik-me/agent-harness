# CS03e — `legacy-composed-mapping.schema.json` (closes LRN-019)

**Status:** active
**Owner:** yoga-ah
**Branch:** cs03e/content (pending)
**Started:** 2026-05-09
**Closed:** —
**Filed by:** [LRN-019](../../../LEARNINGS.md#lrn-019) at 2026-05-09 pre-CS15a hygiene pass (per user directive 2026-05-09 "I like those gates to be in place")
**Depends on:** CS03 (sync engine), CS03d (template-prose-hash, which reduced the legacy-mapping path frequency but didn't eliminate it)

## Goal

Author `schemas/legacy-composed-mapping.schema.json` (Draft-2020-12) defining the canonical shape of the `legacy_composed_mapping.json` file that consumers author when `mergeComposed()` throws `EMERGE_LEGACY_UNMAPPED`. Wire it into `validate-schemas.mjs` so the schema itself is structurally validated on every PR, and add an example file under `examples/` (or fixtures under `tests/fixtures/cs03e/`) that consumers can copy as a starting point.

Per the user directive (2026-05-09) — "I like those gates to be in place" — applies LRN-019 before public flip so consumers get IDE autocomplete + standalone schema validation when authoring `legacy_composed_mapping.json`.

## Background

Per [LRN-019](../../../LEARNINGS.md#lrn-019): `lib/composed.mjs` `mergeComposed()` accepts a `legacyMapping` parameter shaped like `{ regions: [{ action: 'map_to_block' | 'discard', content: string, block_id?: string }] }`. The shape is defined informally in JSDoc + runtime validation (`validateLegacyMapping` in `lib/composed.mjs:401-570`) but has **no JSON Schema**. Consumers authoring the file get no IDE autocomplete, no standalone validation, no `$schema` reference.

CS03d (just shipped) reduced the legacy-mapping path frequency by introducing `template_prose_hash` evolution detection, but the path still fires for cases (b) "consumer edited prose" and (d) "no prior lock + extra prose". So the schema gap remains relevant.

## Decisions made up front (no user check-in needed)

| # | Decision | Rationale |
|---|---|---|
| D1 | **Schema name:** `legacy-composed-mapping.schema.json` (matches existing kebab-case convention; matches the file consumers author: `legacy_composed_mapping.json`). | Consistent with `harness.config.schema.json`, `harness-lock.schema.json`, `learning.schema.json`. |
| D2 | **Shape:** mirror exactly what `validateLegacyMapping` enforces today. The runtime validator IS the source-of-truth spec; the schema is its declarative twin. Keys: `regions: [...]`. Each region: `action: 'map_to_block' \| 'discard'`, `content: string` (required), `block_id?: string` (required-and-pattern-matched IF `action === 'map_to_block'`, FORBIDDEN if `action === 'discard'`). | Single source of truth: runtime validator + schema agree by construction. |
| D3 | **Block-id pattern:** `^[a-z][a-z0-9.-]*$` (matches `lib/composed.mjs` ID_RE on line ~80 and `harness.config.schema.json` block-ID pattern). | Already canonical across the codebase. |
| D4 | **`additionalProperties: false`** at root and per-region. Strict mode catches typos like `actoin` or stray keys. | Schema-author convention in this repo. |
| D5 | **`if/then/else` clause** to enforce the action-conditional `block_id` requirement (required when `map_to_block`, forbidden when `discard`). | Matches `harness-lock.schema.json` pattern (composed-class → `blocks` required). |
| D6 | **Wire into `validate-schemas.mjs`** so structural validity of the schema file itself is checked on every PR. The script already iterates `schemas/*.schema.json`; adding the file is automatic. Verify by running `node scripts/validate-schemas.mjs` and confirming the new schema is enumerated. | Already-built CI mechanism; zero new wiring. |
| D7 | **Example file** at `examples/legacy-composed-mapping.example.json` with a representative shape (one `map_to_block` region + one `discard` region) and a `$schema` pointer to the new schema. Helps consumers as copy-paste starter. | Matches the `examples/` pattern used for `harness.config.json`. |
| D8 | **Fixtures** under `tests/fixtures/cs03e/`: at least 1 valid mapping + 4 invalid mappings (missing `regions`, invalid `action`, missing `block_id` when `map_to_block`, extra `block_id` when `discard`). Used to exercise the schema directly via Ajv (parallels existing `tests/fixtures/cs03/lock/{valid,invalid}-*.lock.json`). | Mirrors existing fixture pattern. |
| D9 | **`lib/composed.mjs` does NOT need to be changed.** The runtime `validateLegacyMapping` already enforces the same rules; the schema is for authoring-time / IDE / `validate-schemas.mjs` static validation. We could OPTIONALLY wire Ajv into `mergeComposed()` for a belt-and-suspenders check, but it's not required and adds runtime cost. **Skip.** | Single behavior change minimised. Future CS could add runtime Ajv if desired. |
| D10 | **Tests:** new `tests/legacy-composed-mapping-schema.test.mjs` that loads the schema with Ajv + asserts each fixture validates as expected. Minimum 5 tests (1 valid + 4 invalid scenarios). Over-delivery encouraged (LRN-037). | Keeps the schema↔fixture contract enforced at lint time. |
| D11 | **Docs:** small mention in `docs/adr/0001-file-classes.md` § Legacy-content fail-closed invariant pointing at the new schema (one-line addition). `LEARNINGS.md` LRN-019 status flipped `deferred` → `applied` with citation. `CHANGELOG.md` Unreleased § Added entry. | Standard CS hygiene. |
| D12 | **Non-breaking, additive.** No consumer code or config changes. CHANGELOG entry under `Added`. No SemVer bump on its own (will roll into v0.2.0 with cs02b + cs03d). | Same release semantics as cs03d. |

## Deliverables

### Schema
- [ ] `schemas/legacy-composed-mapping.schema.json` (Draft-2020-12) per D2-D5.

### Examples + fixtures
- [ ] `examples/legacy-composed-mapping.example.json` (1 of each region action) with `$schema` self-reference.
- [ ] `tests/fixtures/cs03e/valid-minimal.json` (1 region, `discard`).
- [ ] `tests/fixtures/cs03e/valid-mixed.json` (2 regions, one of each action).
- [ ] `tests/fixtures/cs03e/invalid-missing-regions.json`.
- [ ] `tests/fixtures/cs03e/invalid-bad-action.json` (`action: "drop"`).
- [ ] `tests/fixtures/cs03e/invalid-map-without-block-id.json`.
- [ ] `tests/fixtures/cs03e/invalid-discard-with-block-id.json`.
- [ ] `tests/fixtures/cs03e/invalid-bad-block-id-pattern.json` (uppercase or starts-with-digit).

### Tests
- [ ] `tests/legacy-composed-mapping-schema.test.mjs` — minimum 5 tests, asserts each fixture validates as expected via Ajv against the new schema.

### Wire-up
- [ ] `scripts/validate-schemas.mjs` picks up `schemas/legacy-composed-mapping.schema.json` automatically (verify); if it doesn't (e.g. hard-coded file list), add the file.

### Docs
- [ ] `docs/adr/0001-file-classes.md` § Legacy-content fail-closed invariant: one-line addition pointing at the new schema.
- [ ] `LEARNINGS.md` LRN-019: status `deferred` → `applied` with citation paragraph.
- [ ] `CHANGELOG.md` Unreleased § Added: "schemas/legacy-composed-mapping.schema.json (Draft-2020-12)..."

### Lock refresh
- [ ] None. The new schema doesn't affect any rendered template, so the self-host lock doesn't change. (Verify by running `harness sync --mode=check --cwd .` before the close-out.)

## Exit criteria

- `node scripts/validate-schemas.mjs` exits 0 (the new schema itself validates as Draft-2020-12).
- `node --test tests/*.test.mjs` → 519 baseline + ≥5 new = ≥524 passing, 0 failing.
- `node bin/harness.mjs lint --quiet` → 0 failed.
- `node bin/harness.mjs sync --mode=check --cwd .` → "No drift detected".
- `examples/legacy-composed-mapping.example.json` validates against the new schema (verified inline).
- `LEARNINGS.md` LRN-019 has `status: applied` with citation.
- `## Plan-vs-implementation review` populated by GPT-5.5 with `Outcome: GO` before close-out.

## Sub-agent fan-out

**None.** Single sequential content branch. Schema + 7 fixtures + 1 test file + 3 doc updates is small enough for direct orchestrator authorship; sub-agent dispatch would add coordination overhead without parallelism benefit.

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| Author schema file | planned | — | agent-id=— \| role=orchestrator \| report-status=pending \| learnings=0 |
| Author 7 fixtures + example | planned | — | agent-id=— \| role=orchestrator \| report-status=pending \| learnings=0 |
| Author test file | planned | — | agent-id=— \| role=orchestrator \| report-status=pending \| learnings=0 |
| Verify validate-schemas wire-up | planned | — | agent-id=— \| role=orchestrator \| report-status=pending \| learnings=0 |
| ADR + LEARNINGS + CHANGELOG | planned | — | agent-id=— \| role=orchestrator \| report-status=pending \| learnings=0 |
| GPT-5.5 content rubber-duck | planned | — | agent-id=— \| role=reviewer \| report-status=pending \| learnings=0 |
| GPT-5.5 plan-vs-impl review | planned | — | agent-id=— \| role=reviewer \| report-status=pending \| learnings=0 |

## Risks + mitigations

- **Risk:** schema diverges from `validateLegacyMapping` runtime check (different rules accepted/rejected). **Mitigation:** the test file authors fixtures that exercise EVERY rule from `validateLegacyMapping` and asserts both the runtime validator AND the Ajv schema reach the same verdict. Drift is caught at lint time.
- **Risk:** `validate-schemas.mjs` is hard-coded to known schema files. **Mitigation:** trivial inspection at the start of content phase; if hard-coded, add the file in the same commit.
- **Risk:** `additionalProperties: false` at the root catches a real consumer `_comment` annotation that's currently tolerated. **Mitigation:** explicitly allow `_comment: string` at the root (matching the `_comment` convention used in `harness.config.json`).

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
