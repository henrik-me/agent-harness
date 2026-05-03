# CS06 — Remaining structural linters

**Status:** done
**Owner:** yoga-ah
**Branch:** `cs06/content` (merged) + `cs06/close-out` (close-out)
**Started:** 2026-05-03
**Closed:** 2026-05-03
**Filed by:** CS05 close-out (pre-filed per cs-plan CS06 scope; see [`harness-cs-plan.md` § CS06](../done/done_cs01_bootstrap-repo/harness-cs-plan.md#cs06--remaining-structural-linters)).
**Depends on:** CS05

## Goal

Build the remaining 9 structural linters — one per structured document or file class — all built on `lib/doc-schema.mjs` (delivered in CS05). Each linter is independently deployable, ≤ ~80 LOC with fixtures, and wired into `harness lint`.

## Deliverables

### Linter scripts

Each linter script lives under `scripts/` and uses `lib/doc-schema.mjs` functions exclusively (no ad-hoc markdown parsing). Each has a `--file` flag and an explicit `--cwd` flag consistent with the pattern established in CS05 (per [LRN-032](../../../LEARNINGS.md#lrn-032)).

| Script | Validates | Key checks |
|--------|-----------|------------|
| `scripts/check-context.mjs` | `CONTEXT.md` | Required sections present (`## Codebase state`, `## Architecture pointer`, `## Blockers / open questions`, `## CS plan`); no stale "ready to claim" language if a CS is active |
| `scripts/check-workboard.mjs` | `WORKBOARD.md` | Required tables present (`## Orchestrators`, `## Active Work`, `## Recently Completed`); `Active Work` rows have required columns; no orphan CS entries |
| `scripts/check-architecture.mjs` | `ARCHITECTURE.md` | Required top-level sections present; no broken internal links |
| `scripts/check-clickstop.mjs` | `project/clickstops/**/*.md` | Every clickstop file has required fields (`Status`, `Owner`, `Branch`, `Started`, `Closed`, `Depends on`); `active/` files have `Status: active`; `done/` files have `Status: done`; `planned/` files have `Status: planned` |
| `scripts/check-instructions.mjs` | `INSTRUCTIONS.md` | Required quick-reference checklist sections present; cross-link integrity (no dead links to decisions/LRN anchors); dead-section detection |
| `scripts/check-readme.mjs` | `README.md` | Enforces READMEGUIDE (from CS08): one-liner, status badges, quickstart, harness pointer, contributing pointer, license, links to ARCHITECTURE.md and CONTEXT.md |
| `scripts/check-composed-blocks.mjs` | All `template/composed/*.md` | Required block IDs present; no duplicate IDs; no orphan IDs in lock file; no markers inside code fences (per cs-plan GPT-5.5 #1 hardening) |
| `scripts/check-workflow-pins.mjs` | `.github/workflows/*.yml` | All `henrik-me/agent-harness/...@ref` references match the version in `harness.config.json`; prevents local/CI rule drift (per Decision #24, cs-plan GPT-5.5 #10) |
| `scripts/check-public-artifact.mjs` | Archived shadow/pilot/migration artifacts | Scans for forbidden fields (tokens, tenant/subscription IDs, internal URLs, full logs, unredacted telemetry); driven by `public_artifact_redaction` config (per Decision #24, cs-plan GPT-5.5 #5); mandatory from CS15a onward |

### Tests

- `tests/check-context.test.mjs` — fixture-based tests
- `tests/check-workboard.test.mjs` — fixture-based tests
- `tests/check-architecture.test.mjs` — fixture-based tests
- `tests/check-clickstop.test.mjs` — fixture-based tests
- `tests/check-instructions.test.mjs` — fixture-based tests
- `tests/check-readme.test.mjs` — fixture-based tests
- `tests/check-composed-blocks.test.mjs` — fixture-based tests
- `tests/check-workflow-pins.test.mjs` — fixture-based tests
- `tests/check-public-artifact.test.mjs` — fixture-based tests
- Fixtures under `tests/fixtures/cs06/` (one subdirectory per linter)

### Wired into `harness lint`

All 9 linter scripts wired into `bin/harness.mjs` `cmdLint` alongside `check-learnings.mjs`. `cmdLint` rewritten as a 10-linter aggregator with `--only`/`--skip` flag support.

### Real-file regression

`harness lint --quiet`: 8 pass, 1 skipped (public-artifact — no public artifact files in repo yet per Decision #24 mandatory-from-CS15a-onward).

## Exit criteria (achieved)

- All 9 linter scripts exit 0 against this repo's hand-authored docs (8 pass, 1 skipped).
- All 9 linter scripts exit non-zero on appropriate fixture errors.
- `node scripts/validate-schemas.mjs` passes (49/0 — 43 prior + 6 new LRNs).
- 333 tests pass (253 baseline + 80 new: 71 from sub-agents + 6 from fixes-r1 + 3 from inline R2 fix).
- `harness lint` runs all 10 linters (check-learnings + 9 new) in sequence.

## Sub-agent ledger summary

**Total implementation passes: 11** = 9 initial parallel sub-agent jobs + 1 fix-round sub-agent job (cs06-fixes-r1) + 1 inline orchestrator R2 fix. **Review rounds: 3** (GPT-5.5: R1, R2, R3-clear).

### Initial parallel dispatch (9-way)

**First true 9-way parallel sub-agent dispatch in this project.** All sub-agents Sonnet 4.6, all 0 commits, all succeeded. Zero file races (strict per-agent file-ownership per [LRN-016](../../../LEARNINGS.md#lrn-016)). Validates [LRN-041](../../../LEARNINGS.md#lrn-041).

| Sub-agent | Role | Result | Notes |
|---|---|---|---|
| cs06-context | context-linter | complete | 0 commits; updated CONTEXT.md (removed stale "ready to claim" language) to pass its own regression — per [LRN-043](../../../LEARNINGS.md#lrn-043) |
| cs06-workboard | workboard-linter | complete | 0 commits |
| cs06-architecture | arch-linter | complete | 0 commits |
| cs06-clickstop | clickstop-linter | complete | 0 commits |
| cs06-instructions | instructions-linter | complete | 0 commits |
| cs06-readme | readme-linter | complete | 0 commits; added `## Architecture` and `## Status` sections to README.md to pass its own regression — per [LRN-043](../../../LEARNINGS.md#lrn-043) |
| cs06-composed | composed-blocks-linter | complete | 0 commits; initially guessed `composed_files` field (LRN-039) — fixed in cs06-fixes-r1 |
| cs06-workflowpins | workflow-pins-linter | complete | 0 commits; initially guessed `harness_pin` field (LRN-039) — fixed in cs06-fixes-r1 |
| cs06-public | public-artifact-linter | complete | 0 commits |

### Fix-round (cs06-fixes-r1)

- **cs06-fixes-r1** (Sonnet 4.6, hard no-commit preflight): fixed all 4 GPT-5.5 R1 blockers + 3 non-blockers in one pass. 0 commits.
  - B-1: `cs06-workflowpins` used `harness_pin` — corrected to schema-canonical `version` field ([LRN-039](../../../LEARNINGS.md#lrn-039))
  - B-2: `cs06-composed` used `composed_files` — corrected to schema-canonical `composed.files` ([LRN-039](../../../LEARNINGS.md#lrn-039))
  - B-3: all 9 linters lacked `requireValue` guard for flag-value args ([LRN-040](../../../LEARNINGS.md#lrn-040))
  - B-4: `cmdLint` missing `--only`/`--skip` wiring
  - NB-1 through NB-3: additional non-blocking fixes

### Inline orchestrator fix (R2)

- After R2 identified (1) lock-format misread in `check-composed-blocks.mjs` (`lock.composed_blocks` → `lock.files[].blocks[]` per [LRN-042](../../../LEARNINGS.md#lrn-042)) and (2) `cmdLint` config-path inconsistency ([LRN-038](../../../LEARNINGS.md#lrn-038)), both fixed inline by orchestrator. 3 regression tests added.

### GPT-5.5 review rounds

- **R1:** 4 blockers (B-1: workflowpins field name; B-2: composed field name; B-3: requireValue missing; B-4: --only/--skip missing) + 4 non-blockers (NB-1..4; NB-5 deferred=CS06b; NB-6 deferred=CS06b). Dispatched to cs06-fixes-r1.
- **R2:** 1 blocker (lock format orphan detection shape) + 1 non-blocker (config path inconsistency in cmdLint). Fixed inline by orchestrator.
- **R3:** GO. Content PR #15 merged as squash commit `161b9f3`.

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| `scripts/check-context.mjs` + tests + fixtures | done | sub-agent cs06-context | agent-id=yoga-ah-sub-1 \| role=context-linter \| report-status=complete \| learnings=0 |
| `scripts/check-workboard.mjs` + tests + fixtures | done | sub-agent cs06-workboard | agent-id=yoga-ah-sub-2 \| role=workboard-linter \| report-status=complete \| learnings=0 |
| `scripts/check-architecture.mjs` + tests + fixtures | done | sub-agent cs06-architecture | agent-id=yoga-ah-sub-3 \| role=arch-linter \| report-status=complete \| learnings=0 |
| `scripts/check-clickstop.mjs` + tests + fixtures | done | sub-agent cs06-clickstop | agent-id=yoga-ah-sub-4 \| role=clickstop-linter \| report-status=complete \| learnings=0 |
| `scripts/check-instructions.mjs` + tests + fixtures | done | sub-agent cs06-instructions | agent-id=yoga-ah-sub-5 \| role=instructions-linter \| report-status=complete \| learnings=0 |
| `scripts/check-readme.mjs` + tests + fixtures | done | sub-agent cs06-readme | agent-id=yoga-ah-sub-6 \| role=readme-linter \| report-status=complete \| learnings=0 |
| `scripts/check-composed-blocks.mjs` + tests + fixtures | done | sub-agent cs06-composed | agent-id=yoga-ah-sub-7 \| role=composed-blocks-linter \| report-status=complete \| learnings=0 |
| `scripts/check-workflow-pins.mjs` + tests + fixtures | done | sub-agent cs06-workflowpins | agent-id=yoga-ah-sub-8 \| role=workflow-pins-linter \| report-status=complete \| learnings=0 |
| `scripts/check-public-artifact.mjs` + tests + fixtures | done | sub-agent cs06-public | agent-id=yoga-ah-sub-9 \| role=public-artifact-linter \| report-status=complete \| learnings=0 |
| Wire all 9 linters into `harness lint`; rewrite `cmdLint` with `--only`/`--skip` | done | yoga-ah (orchestrator inline) | 10-linter aggregator shipped |
| GPT-5.5 review rounds | done | yoga-ah | review-status=complete (R3=GO) |
| Open PR + squash-merge | done | yoga-ah | Content PR #15 (commits `2166ffb` initial + `5d2cbbe` fixes-r1 + `3bc4e86` fixes-r2), squash-merged as `161b9f3`. Claim PR #14 (`7a228b8`). |
| Close-out: file 6 new learnings (LRN-038..043) | done | yoga-ah | All 49 LRN entries validate (`node scripts/validate-schemas.mjs` → 49/0 pass) |
| Close-out: file planned CS06b + CS07 | done | yoga-ah | `planned_cs06b_shared-parser-refactor-and-cross-link-validation.md` + `planned_cs07_generic-policy-linters.md` created |
| Close-out: rename file active → done; update WORKBOARD + CONTEXT | done | yoga-ah | This branch (cs06/close-out) |

## Notes / Learnings

(harvested at close-out; all filed as LRN-038..043)

### Process observations

- **Aggregator config-path single-source (LRN-038):** `cmdLint` must resolve config once and use it everywhere.
- **Schema-first field access (LRN-039):** sub-agent briefings for config/lock-reading code MUST mandate `schemas/*.schema.json` as primary source before writing any field access.
- **requireValue arg guard (LRN-040):** never use bare `args[i+1]`; always validate next token is not a flag.
- **9-way parallel dispatch validated (LRN-041):** first true 9-way fan-out in this project — zero races, zero rogue commits.
- **Lock file schema-canonical shape (LRN-042):** orphan detection must read `lock.files[].blocks[]`, not a guessed flat array.
- **Dogfooding mid-CS (LRN-043):** when a linter's regression target is a live project file, fixing that file IS the deliverable.

### Final state

- 333 tests pass (253 baseline + 80 new: 71 from sub-agents + 6 from fixes-r1 + 3 from inline R2 fix).
- 9 new linter scripts under `scripts/`.
- 9 new test files under `tests/`.
- 50+ fixtures across `tests/fixtures/cs06/`.
- `bin/harness.mjs` `cmdLint` rewritten as 10-linter aggregator with `--only`/`--skip`.
- `README.md` updated: `## Architecture` and `## Status` sections added (dogfooding cs06-readme linter).
- `CONTEXT.md` updated: stale "ready to claim" language removed (dogfooding cs06-context linter).
- `validate-schemas.mjs`: 49/0 (43 prior + 6 new LRN-038..043).
- 6 new LRN entries (LRN-038..043).
- 2 planned CSs filed (CS06b: shared-parser refactor + cross-link validation; CS07: generic policy linters).
- Claim PR: #14 (`7a228b8`). Content PR: #15 (squash-merged as `161b9f3`).
- **Highlight:** first true 9-way parallel sub-agent dispatch in this project; succeeded with zero file races and zero rogue commits.

