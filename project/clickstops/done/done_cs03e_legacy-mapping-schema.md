# CS03e — `legacy-composed-mapping.schema.json` (closes LRN-019)

**Status:** done
**Owner:** yoga-ah
**Branch:** cs03e/content (squash-merged as `ca637d1` via PR #69)
**Started:** 2026-05-09
**Closed:** 2026-05-09
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

**Reviewer:** GPT-5.5 (rubber-duck)
**Date:** 2026-05-09
**Outcome:** GO (R1 — no blockers; 1 NB about LRN-019 prose refresh, addressed inline at close-out)

### Plan vs implementation

| Deliverable | Outcome | Notes |
|---|---|---|
| `schemas/legacy-composed-mapping.schema.json` (Draft-2020-12) | diverged (intentional) | Final schema allows extra root/region keys to match runtime leniency (R2/R3 fix). All other shape rules match `validateLegacyMapping` exactly. |
| `examples/legacy-composed-mapping.example.json` | match | `$schema` self-reference + both region actions. |
| 7 D8 fixtures | added | All 7 plan-listed fixtures shipped + 3 added during R2/R3 (`invalid-empty-regions`, `invalid-region-missing-content`, `valid-root-with-extra-key`, plus `valid-region-with-extra-key`). 10 fixtures total. |
| New test file ≥ 5 tests | added | `tests/legacy-composed-mapping-schema.test.mjs` has 14 tests (was 10 at content-PR; +2 at R2 +2 at R3). |
| `validate-schemas.mjs` wire-up | match | Schema listed in `schemaFiles`; `EXPECTED_MIN.schemas` bumped to 4. |
| ADR 0001 pointer paragraph | match | Present in § Legacy-content fail-closed invariant. |
| `LEARNINGS.md` LRN-019 status flip | match | `deferred` → `applied` with citation paragraph (refreshed at close-out to accurately reflect the final R3 state). |
| CHANGELOG entry | match | Unreleased / Added entry present. |
| `lib/composed.mjs` runtime not changed | match | No diff. Schema is authoring-time only per D9. |

### Test coverage

**Sufficient.** Schema/runtime pure-shape parity verified end-to-end after R2/R3.

- `node --test tests/*.test.mjs` → 533 / 533 / 0.
- `node bin/harness.mjs lint --quiet` → 15 / 0 / 3.
- `node scripts/validate-schemas.mjs` → 4 schemas + 3 examples + 79 learnings = 86 passed / 0 failed.

### Findings

**Blocking:** none.

**Non-blocking:** original LRN-019 applied paragraph (drafted at content-PR time) said "additionalProperties: false everywhere / 7 fixtures / 10 tests" — replaced at close-out with accurate "additionalProperties NOT set to false (matches runtime leniency) / 10 fixtures / 12+ tests" wording.

## Notes / Learnings

### LRN candidates

1. **Schema-stricter-than-runtime drift can be a real blocker even when the strictness seems "harmless".** R1 and R2 of CS03e both hinged on this: the initial schema had `additionalProperties: false` at root and per-region for typo prevention, classified as a strengthening. The reviewer correctly identified it as drift — runtime accepts what schema rejects, so a consumer following the runtime spec but not the schema gets confusing schema errors. **Severity:** moderate. **Disposition candidate:** add to the rubber-duck briefing for schema-authoring CSs: "for every shape rule in the schema, identify the matching runtime check (or document the deliberate divergence with rationale)."

2. **The 3-PR shape plus the plan PR adds up to 4 PRs per CS, which feels heavy for a small schema-only CS.** CS03e was 4 PRs (#67/#68/#69/#70) for ~150 LOC of net additions. Future small CSs could legitimately combine plan+claim into a single workboard-only PR. **Severity:** very low. **Disposition candidate:** document as a shortcut for "small docs/schema CSs filed and claimed by the same orchestrator in the same session", or leave alone for consistency.
