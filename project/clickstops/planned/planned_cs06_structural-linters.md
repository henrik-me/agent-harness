# CS06 — Remaining structural linters

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** CS05 close-out (pre-filed per cs-plan CS06 scope; see [`harness-cs-plan.md` § CS06](../done/done_cs01_bootstrap-repo/harness-cs-plan.md#cs06--remaining-structural-linters)).
**Depends on:** CS05

## Goal

Build the remaining 9 structural linters — one per structured document or file class — all built on `lib/doc-schema.mjs` (delivered in CS05). Each linter is independently deployable, ≤ ~80 LOC with fixtures, and wired into `harness lint`.

## Deliverables

### Linter scripts

Each linter script lives under `scripts/` and uses `lib/doc-schema.mjs` functions exclusively (no ad-hoc markdown parsing). Each must have a `--file` flag and an explicit `--cwd` flag consistent with the pattern established in CS05 (per [LRN-032](../../../LEARNINGS.md#lrn-032)).

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

- `tests/check-context.test.mjs` — minimum fixture-based tests
- `tests/check-workboard.test.mjs` — minimum fixture-based tests
- `tests/check-architecture.test.mjs` — minimum fixture-based tests
- `tests/check-clickstop.test.mjs` — minimum fixture-based tests
- `tests/check-instructions.test.mjs` — minimum fixture-based tests
- `tests/check-readme.test.mjs` — minimum fixture-based tests
- `tests/check-composed-blocks.test.mjs` — minimum fixture-based tests
- `tests/check-workflow-pins.test.mjs` — minimum fixture-based tests
- `tests/check-public-artifact.test.mjs` — minimum fixture-based tests
- Fixtures under `tests/fixtures/cs06/` (one subdirectory per linter)

### Wired into `harness lint`

All 9 linter scripts wired into `bin/harness.mjs` `lint` subcommand alongside `check-learnings.mjs`. Each linter receives the explicit consumer-cwd-relative file path per [LRN-032](../../../LEARNINGS.md#lrn-032).

### Bonus: `schemas/legacy-composed-mapping.schema.json`

Per [LRN-019](../../../LEARNINGS.md#lrn-019) deferred at CS03, CS06 is the natural home for `legacy-composed-mapping.schema.json` (consumed by `check-composed-blocks.mjs`). If time permits, add this schema; otherwise defer to CS06b.

## Exit criteria

- All 9 linter scripts exit 0 against this repo's hand-authored docs.
- All 9 linter scripts exit non-zero on appropriate fixture errors.
- `node scripts/validate-schemas.mjs` still passes (37+ entries).
- All existing 253+ tests still pass.
- Minimum 5 new tests per linter (45+ new tests total).
- `harness lint` runs all 10 linters (check-learnings + 9 new) in sequence.

## Sub-agent fan-out

**9 parallel sub-agents — one per linter script.** Per [LRN-016](../../../LEARNINGS.md#lrn-016), each linter is its own file with no file overlap between sub-agents.

Each sub-agent owns:
- `scripts/check-<name>.mjs`
- `tests/check-<name>.test.mjs`
- `tests/fixtures/cs06/<name>/` (fixtures)

No sub-agent touches `lib/doc-schema.mjs` (read-only) or `bin/harness.mjs` (wired by orchestrator inline after sub-agents complete).

Briefings MUST include:
- Hard "no commit" preflight (per [LRN-021](../../../LEARNINGS.md#lrn-021))
- Explicit file ownership — sub-agent owns exactly the 3 paths listed above (per [LRN-016](../../../LEARNINGS.md#lrn-016))
- Full `lib/doc-schema.mjs` source as required reading
- The target document's actual content as a regression fixture
- Minimum test count specified as a minimum, not an exact count (per [LRN-037](../../../LEARNINGS.md#lrn-037))
- `--file` flag must be explicit; do NOT infer path from `import.meta.url` (per [LRN-032](../../../LEARNINGS.md#lrn-032))
- Entry-boundary patterns must use document-specific id regex, not generic `id:` (per [LRN-035](../../../LEARNINGS.md#lrn-035))

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per OPERATIONS.md § Claim) | planned | — | — |

## Notes / Learnings

(filled during execution)
