# CS02b — Drop redundant top-level `local_blocks` (option b for LRN-009)

**Status:** done
**Owner:** yoga-ah
**Branch:** cs02b/content (squash-merged as `90b04db` via PR #60)
**Started:** 2026-05-09
**Closed:** 2026-05-09
**Filed by:** [LRN-009](../../../LEARNINGS.md#lrn-009) at 2026-05-09 pre-CS15a hygiene pass
**Depends on:** CS02 (schema baseline), CS03 (sync engine), CS06 (composed-block linter)

## Goal

Remove the redundant top-level `local_blocks` field from `harness.config.json`. Make `composed.overrides[file].local_blocks` the single source of truth for composed-block allowlists. Eliminates a known drift hazard (the two forms can disagree silently) and simplifies the schema before the public flip.

Per the user directive (2026-05-09): pick option (b) from LRN-009 (remove the redundant form rather than schema-enforce equality).

## Background

Per [LRN-009](../../../LEARNINGS.md#lrn-009): `harness.config.json` accepts two ways to express composed-block allowlists:

1. **Top-level** `local_blocks: { "FILE.md": ["block-id", ...] }`
2. **Per-file nested** `composed.overrides["FILE.md"].local_blocks: ["block-id", ...]`

Both forms exist in every example config and in the self-host config. The schema doesn't enforce equality; the engine has to pick one as authoritative. Historically the top-level form was the original syntax; the nested form was added when `composed.overrides` was generalised. Today, `bin/harness.mjs cmdLint` reads the **top-level** form (lines ~727–729) when assembling allowlists for `check-composed-blocks.mjs --allowed-ids`.

## Decisions made up front (no user check-in needed)

| # | Decision | Rationale |
|---|---|---|
| D1 | **Hard-remove top-level `local_blocks`** from the schema (no deprecation period). | Pre-1.0; v0.1.0 only just released; only 2 known consumers (gwn, sub-invaders) and both still pin to v0.1.0 — they'll opt-in to v0.2.0 by bumping their version pin. |
| D2 | **Source of truth becomes `composed.overrides[file].local_blocks`.** A composed file with no `composed.overrides[file]` entry has an **empty allowlist** (no local blocks permitted). | Matches existing schema description for `composed.overrides`; preserves the explicit-allowlist invariant. |
| D3 | `composed.overrides` itself remains **optional** at the schema level. Files in `composed.files` without a matching `composed.overrides[file]` entry simply have no permitted local blocks. | Keeps simple consumers (no local blocks) terse. |
| D4 | **Schema change is breaking**; we update CHANGELOG.md noting "v0.2.0 (unreleased): BREAKING — removed top-level `local_blocks`; use `composed.overrides[file].local_blocks` instead." This CS does **not** tag a release — a future release CS will. | Aligns with the CS14 release-tooling pattern (releases are their own CSs). |
| D5 | **Self-host migration in this CS:** root `harness.config.json` is updated in the same content commit (it currently uses the top-level form with no `composed.overrides`). After the change, it gains a `composed.overrides` block. | Self-host must stay green; sync drift check would otherwise fail. |
| D6 | **Example/fixture configs** (`examples/*.json`, `template/seeded/harness.config.json`, `tests/fixtures/cs03/sync/*/harness.config.json`) are migrated in the same commit. The two example configs that already have BOTH forms (gwn, sub-invaders) just drop the top-level. | One-shot consistency. |
| D7 | **Doc updates** sweep ONLY live/active surfaces: `docs/adr/0001-file-classes.md`, `template/composed/OPERATIONS.md`, `template/managed/INSTRUCTIONS.md`. Root `OPERATIONS.md` / `INSTRUCTIONS.md` are re-rendered via `harness sync` after the template edits (per LRN-070/074 lock-refresh pattern). | Live surfaces are the canonical reference; rewriting them prevents future drift. |
| D8 | **Historical surfaces are immutable** and are NOT touched: every file under `project/clickstops/done/`, the cs-plan (`project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md`), every existing `LEARNINGS.md` entry body. These contain accurate history of what was true at the time. | Don't rewrite history. The CHANGELOG entry + LRN-009 status flip are how the migration is recorded. |
| D9 | **Sequential, single-content-branch.** No sub-agent fan-out: schema → engine → ~10 config files → docs are too tightly interlocked for safe parallel ownership per LRN-016. Orchestrator does the work directly. | Smaller risk surface than fan-out for this kind of sweeping rename. |
| D10 | **Rubber-duck reviewer:** GPT-5.5 (per user directive). Independent context. Recorded in PR body and `## Plan-vs-implementation review` per LRN-064. | Standard process. |

## Deliverables

### Schema
- [ ] Remove the `local_blocks` property (and any `$defs` / `required` references) from `schemas/harness.config.schema.json`.
- [ ] Verify no other schema file references `local_blocks` at the top level.

### Engine + CLI
- [ ] `bin/harness.mjs` `cmdLint` (~lines 714–740): replace top-level `cfg.local_blocks` reads with iteration over `cfg.composed?.overrides` to assemble allowlists per file.
- [ ] `lib/composed.mjs`: scan for any `local_blocks` reads (top-level form); migrate to `composed.overrides[file].local_blocks`.
- [ ] `lib/sync.mjs`: same scan + migration.
- [ ] Audit any other reader (`scripts/`, `lib/`) and migrate.

### Configs (must all stay valid post-change)
- [ ] `harness.config.json` (self-host root) — drop top-level `local_blocks`, add `composed.overrides.{CONVENTIONS.md,OPERATIONS.md,REVIEWS.md}.local_blocks`.
- [ ] `examples/agent-harness-self.harness.config.json`
- [ ] `examples/guesswhatisnext.harness.config.json` (drop top-level; nested already exists)
- [ ] `examples/sub-invaders.harness.config.json`
- [ ] `template/seeded/harness.config.json`
- [ ] `tests/fixtures/cs03/sync/sync-already-synced/harness.config.json`
- [ ] `tests/fixtures/cs03/sync/sync-composed-mid-CS-warning/harness.config.json`
- [ ] `tests/fixtures/cs03/sync/sync-fresh-consumer/harness.config.json`

### Tests
- [ ] **New regression test** (in `tests/cli.test.mjs` or a new file): schema validation rejects a config that includes a top-level `local_blocks` field with a clear error message ("`local_blocks` is no longer supported; use `composed.overrides[file].local_blocks`").
- [ ] **New regression test:** end-to-end sync against a config with only `composed.overrides[file].local_blocks` (no top-level) — `check-composed-blocks` receives the correct `--allowed-ids` and passes.
- [ ] Update existing tests in `tests/cli.test.mjs`, `tests/cs09-init.test.mjs`, `tests/cs11-self-host-config.test.mjs`, `tests/sync.test.mjs` that previously asserted both forms work.
- [ ] Minimum **3 new tests**; over-delivery encouraged (LRN-037).

### Docs
- [ ] `docs/adr/0001-file-classes.md` — replace any mention of top-level `local_blocks` with the nested form; add a one-line "v0.2.0 (BREAKING)" note in the ADR's history section.
- [ ] `template/composed/OPERATIONS.md` — sweep + re-render to root via `harness sync --mode=apply --resolved-sha $(git rev-parse HEAD) --cwd .`.
- [ ] `template/managed/INSTRUCTIONS.md` — sweep + re-render to root.
- [ ] `LEARNINGS.md` — flip LRN-009 `status: deferred` → `status: applied` with citation: "Applied by CS02b — schema removal commit `<sha>`; option (b) per user directive 2026-05-09."
- [ ] `CHANGELOG.md` — add to "Unreleased" / "v0.2.0" section: "BREAKING: removed top-level `local_blocks` from `harness.config.json` schema. Use `composed.overrides[file].local_blocks` instead. Migration: move each entry from `local_blocks[file]` to `composed.overrides[file].local_blocks` and drop the top-level key."

### Lock refresh
- [ ] After all template + config edits land in the content commit, run `node bin/harness.mjs sync --mode=apply --resolved-sha $(git rev-parse HEAD) --cwd .` to refresh `.harness-lock.json` (per LRN-070/074).

## Exit criteria

- `node --test tests/*.test.mjs` → 509+ baseline + at least 3 new = ≥512 passing, 0 failing.
- `node bin/harness.mjs lint --quiet` → 0 failed.
- `node bin/harness.mjs sync --mode=check --cwd .` → "No drift detected".
- `node scripts/validate-schemas.mjs` → 0 failed.
- `git grep '"local_blocks"'` in **live surfaces** (everything except `project/clickstops/done/**`, `project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md`, `LEARNINGS.md`, and `CHANGELOG.md`) returns matches **only** under `composed.overrides[*]` (no top-level remains in any live surface). Historical mentions in the excepted paths are intentionally preserved per D8.
- `LEARNINGS.md` LRN-009 has `status: applied` with the citation.
- `## Plan-vs-implementation review` section populated by GPT-5.5 with `Outcome: GO` before close-out rename.

## Sub-agent fan-out

**None.** Per D9, the changes are too tightly interlocked (schema → engine → configs → templates → tests) to safely parallelise; orchestrator executes directly. This avoids the LRN-016 file-race risk and keeps the single content commit coherent.

If any individual deliverable grows unexpectedly large during execution, the orchestrator may dispatch a focused sub-agent for that one slice (with disjoint file ownership and the canonical preamble per LRN-068).

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| Schema removal | planned | — | agent-id=— \| role=orchestrator \| report-status=pending \| learnings=0 |
| Engine + CLI migration | planned | — | agent-id=— \| role=orchestrator \| report-status=pending \| learnings=0 |
| Config migrations (8 files) | planned | — | agent-id=— \| role=orchestrator \| report-status=pending \| learnings=0 |
| Test additions + updates | planned | — | agent-id=— \| role=orchestrator \| report-status=pending \| learnings=0 |
| Doc + LEARNINGS + CHANGELOG sweep | planned | — | agent-id=— \| role=orchestrator \| report-status=pending \| learnings=0 |
| Lock refresh + final lint | planned | — | agent-id=— \| role=orchestrator \| report-status=pending \| learnings=0 |
| GPT-5.5 plan-vs-impl review | planned | — | agent-id=— \| role=reviewer \| report-status=pending \| learnings=0 |

## Risks + mitigations

- **Risk:** missed reader of top-level `local_blocks` somewhere in `lib/` or `scripts/` causes runtime regression. **Mitigation:** `git grep -n local_blocks` sweep before commit; new e2e test exercises the read path.
- **Risk:** test fixtures drift from production schema. **Mitigation:** `validate-schemas.mjs` runs each fixture against the schema; fixtures are migrated in the same commit.
- **Risk:** doc references in done-CS files (CS02/CS03/CS11) are immutable history. **Mitigation:** leave them as-is; only update active/template docs and add CHANGELOG entry. Linter doesn't flag historical mentions.

## Plan-vs-implementation review

**Reviewer:** GPT-5.5 (rubber-duck)
**Date:** 2026-05-09
**Outcome:** GO (R1 — no blockers, no NBs requiring fix)

### Plan vs implementation

| Deliverable | Outcome | Notes |
|---|---|---|
| Schema removal of top-level `local_blocks` | match | Root schema is `additionalProperties: false`; `local_blocks` no longer a root property. Description updated to reference nested form. |
| `bin/harness.mjs cmdLint` migration | match | Reads `cfg.composed?.overrides[*].local_blocks`; passes empty allowlists explicitly per R2 fix. |
| `lib/composed.mjs` doc comment update | match | Engine contract now names nested form as source of truth. |
| `lib/sync.mjs` cleanup | match | `resolveAllowedBlockIds()` reads only nested overrides; `canonLocalBlocks` block removed; warning path removed; Ajv error messages now name the offending `additionalProperty`. |
| `scripts/check-composed-blocks.mjs` (R1 fix) | added | `--allowed-ids` parser hardened to distinguish explicit empty (`''`) from no constraint (`undefined`); enables empty-allowlist enforcement. |
| All 8 config files migrated | match | self-host root, 3 examples, template/seeded, 3 fixtures (already nested-only pre-CS). |
| Schema-rejection regression test | diverged | Implemented in `tests/sync.test.mjs` (close to existing composed-files describe block) rather than `tests/cli.test.mjs`. Asserts `ESYNC_INVALID_CONFIG` + `local_blocks` in error message. Cleaner placement; same intent. |
| Empty-allowlist enforcement regression (R1 follow-up) | added | `tests/cli.test.mjs` B2b: composed file with no `composed.overrides[file]` entry + a local block → linter exits non-zero. |
| Updated `cs09-init` tests | match | Init assertions now require nested overrides + explicit `cfg.local_blocks === undefined`. |
| Updated `cs11-self-host-config` tests | match | Self-host compliance compares template IDs to nested config IDs and rejects top-level key. |
| ADR 0001 v0.2.0 subsection | match | Migration/history subsection added before Cross-references. |
| Template/INSTRUCTIONS update + root re-render | match | Template + root both reference nested allowlist path. |
| `LEARNINGS.md` LRN-009 status flip | match | `deferred` → `applied`; `deferred_until` removed; CS02b application paragraph added. |
| CHANGELOG entry | match | Unreleased / Changed (BREAKING) entry naming the migration. |
| Lock refresh per LRN-070/074 | match | Two lock-fixup commits (R1, R2) per CS11b/CS12 R1 precedent; squashed into the merged PR. |
| Test count target (≥512) | diverged | Net 508 (was 509). Plan target presumed pure-add; actuals removed 3 obsolete dual-form tests and added 2 new regressions. Coverage requirements still met. |

### Test coverage

**Sufficient.** Verified:
- Schema rejection (`tests/sync.test.mjs:834-851`).
- Empty-allowlist enforcement (`tests/cli.test.mjs:311-339`).
- Nested happy path (`tests/cli.test.mjs:274-305`).
- Self-host compliance (`tests/cs11-self-host-config.test.mjs:80-115`).
- 508 / 508 / 0 (`node --test tests/*.test.mjs`).

### Findings

**Blocking:** none.

**Non-blocking:** test-count target diverged from the original CS plan by -1, explained by the removal of obsolete dual-form tests; the required regression coverage is present.

## Notes / Learnings

(filled during execution)

### LRN candidates

1. **`harness sync` mid-CS warning is correct discipline but noisy in a CS that legitimately must re-render templates.** Every sync invocation during cs02b/content emitted "WORKBOARD.md has active CS rows. Syncing mid-CS may cause process-shape changes mid-flight." The warning is right (this is a process-shape change), but for a CS that explicitly *needs* mid-flight sync (template-touching CSs per LRN-070/074), the warning-on-every-call adds friction. Consider an opt-out flag (e.g. `--allow-active-cs-sync` or a CS-file frontmatter declaration) so legit cases don't have to grep past the noise. **Severity:** low; **Disposition candidate:** defer — file as planned CS or open LRN if it recurs in cs03d.

2. **R1 surfaced a behavior gap that the plan's deliverables list described correctly but the rubber-duck on the planned CS file did NOT catch.** The original R3 GO on the plan PR didn't anticipate that the engine's "no `--allowed-ids` flag = no constraint" semantics would silently nullify the new "missing override = empty allowlist" rule. The plan-rubber-duck's job is to verify factual correctness against the codebase; behavior-gap detection requires a runtime check. **Severity:** moderate; **Disposition candidate:** add a checklist item to plan-PR rubber-duck briefings: "verify each new behavior is exercised by at least one new or updated test." Could be incorporated into REVIEWS.md or the rubber-duck briefing template.

(Both above are candidates; orchestrator decides whether to elevate to LEARNINGS.md at close-out.)
