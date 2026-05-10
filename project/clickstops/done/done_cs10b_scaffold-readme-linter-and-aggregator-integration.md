# CS10b — Scaffold-readme linter + aggregator integration of optional scaffold linters

**Status:** done
**Owner:** yoga-ah (via CS15d)
**Branch:** —
**Started:** 2026-05-10 (via CS15d)
**Closed:** 2026-05-10 (via CS15d)
**Filed by:** CS10 close-out (per [LRN-063](../../../LEARNINGS.md#lrn-063) and PR #29 §"Notable scope adjustment").
**Superseded by:** [CS15d](./done_cs15d_linter-expansion.md) — absorbed and delivered as one of three deliverables in the CS15d umbrella; PR #92 merged 2026-05-10.
**Depends on:** CS10

## Goal

Two related extensions to the scaffold story landed in CS10:

1. **A dedicated `check-scaffold-readme.mjs` linter** that enforces the structure of harness-side scaffold pattern docs (`scaffolds/<name>/README.md`). The criteria differ from `check-readme.mjs` (which targets consumer-project READMEs requiring Quickstart/License/Architecture/Status). Scaffold READMEs need: H1 `# Scaffold: <name>` matching directory name; required H2s `## When to use`, `## What it ships`, `## Customization points`, `## How to invoke`; optional H2 `## Configuration`. Wired into the harness `lint` aggregator as a per-scaffold-directory check.

2. **Aggregator integration of optional shipped linters** — when a consumer's `harness.config.json` `scaffolds[]` includes `migrations` or `feature-flags`, `harness lint` should automatically dispatch the corresponding shipped linter (`scripts/check-migration-policy.mjs`, `scripts/check-feature-flag-policy.mjs`) against the consumer repo. Today the linters are dropped into the consumer but the consumer must invoke them manually; this CS makes the aggregator opt-in based on the recorded scaffold list.

## Background

CS10 explicitly deferred both items per the cs-plan and the active-CS scope adjustment:

- The original CS10 spec listed "All scaffold README.md files pass `check-readme.mjs`" as an exit criterion. CS10 R1 review surfaced that `check-readme.mjs` enforces project-README structure that doesn't apply to pattern docs. Resolution (per [LRN-063](../../../LEARNINGS.md#lrn-063)): drop the criterion and file a dedicated linter as a follow-up — this CS.
- The planned-CS10 spec mentioned "optional shipped linter parameterised via `harness.config.json`" but stopped short of aggregator integration; CS10 deliberately scoped the linters as consumer-shipped artifacts only.

## Deliverables

- [ ] `scripts/check-scaffold-readme.mjs` — new harness-side linter:
  - CLI: `node scripts/check-scaffold-readme.mjs --file <path-to-scaffold-readme> --name <scaffold-name> [--quiet]`. `requireValue` guard (per LRN-040).
  - Validates the H1 matches `# Scaffold: <name>`.
  - Validates required H2s are present.
  - Exit 0 / 1 / 2 per harness convention.
  - Stdout for the report; stderr for errors. `--quiet` suppresses success.
- [ ] `tests/check-scaffold-readme.test.mjs` — covering happy path, missing H2s, mismatched name, and the 8 in-tree scaffold READMEs as fixtures (parameterized).
- [ ] `bin/harness.mjs cmdLint` — extend the aggregator:
  - Walk `scaffolds/*/README.md` (relative to harness package, NOT consumer cwd) when running against THIS repo (the harness self-host case at CS11), and dispatch `check-scaffold-readme.mjs` for each.
  - When running against a consumer repo with `harness.config.json` `scaffolds[]` populated, dispatch the corresponding shipped linter (`scripts/check-migration-policy.mjs` or `scripts/check-feature-flag-policy.mjs`) against the consumer's `--cwd`. Skip if the script is not present in the consumer (graceful missing-target behavior, consistent with `pr-body` / `compose-v2` / `public-artifact`).
- [ ] `tests/cs10b-aggregator.test.mjs` — fixture test: consumer dir with `scaffolds: ["migrations"]` in config; `harness lint` invokes `check-migration-policy.mjs` against the consumer's `migrations/` dir.
- [ ] Update `bin/harness.mjs` `lint` help text to document the new linters.
- [ ] Update `template/managed/INSTRUCTIONS.md` (if it mentions the linter list) — verify count.

## Exit criteria

- `node bin/harness.mjs lint --quiet` exits 0 against this repo (harness self-host) with at least 8 new scaffold-readme passes (one per scaffold).
- For a consumer with `scaffolds: ["migrations"]` in config, `harness lint` invokes `check-migration-policy.mjs` automatically; for `scaffolds: ["feature-flags"]`, invokes `check-feature-flag-policy.mjs`.
- `node --test tests/*.test.mjs` passes (411+ tests; this CS adds ≥10 new).
- `node scripts/validate-schemas.mjs` still passes.
- No `TODO(CS10b)` markers remain.

## Sub-agent fan-out

3 parallelisable sub-tasks:

1. `scripts/check-scaffold-readme.mjs` + `tests/check-scaffold-readme.test.mjs` (linter author)
2. `bin/harness.mjs cmdLint` aggregator extension (single owner — sequential after #1 lands)
3. `tests/cs10b-aggregator.test.mjs` + help-text update (after #1 + #2 land)

#1 can be a sub-agent; #2 and #3 are tightly coupled to the cmdLint structure and probably best done by the orchestrator.

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per OPERATIONS.md § Claim) | planned | — | — |
| Close-out: docs + restart-state (CONTEXT/WORKBOARD/HANDOFF + relevant docs) | done | yoga-ah (via CS15d) | done in CS15d close-out (umbrella absorbed this CS); see done_cs15d_*.md |
| Close-out: learnings + follow-ups (LEARNINGS.md + planned CSs) | done | yoga-ah (via CS15d) | LRN-087..091 filed in CS15d; LRN-087 (mapping-table) and LRN-088 (skipped-row) directly arose from CS10b's aggregator-integration deliverable |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

**Reviewer:** GPT-5.5 (via [CS15d umbrella review](./done_cs15d_linter-expansion.md#plan-vs-implementation-review))
**Date:** 2026-05-10
**Outcome:** GO

This CS was absorbed by the [CS15d umbrella](./done_cs15d_linter-expansion.md) before it was ever independently claimed. CS10b's two parts were both delivered:

- **Part 1** (`scripts/check-scaffold-readme.mjs` + 11 tests) — Wave 1 sub-agent β7 in CS15d. Passes against all 8 in-tree scaffold READMEs.
- **Part 2** (aggregator integration) — Wave 1 sub-agent β8 wrote the integration test (initially skip-gated via `lint --help` feature-detect); orchestrator (β9) wired the aggregator. Self-host walks `scaffolds/<name>/README.md` (one row per scaffold matching `composed-blocks:` pattern). Consumer auto-dispatch uses a deterministic `SHIPPED_SCAFFOLD_LINTERS` map (intentional plural→singular: `migrations`→`migration-policy`, `feature-flags`→`feature-flag-policy`) — chosen over name-mangling because the shipped scaffold linters are already named per-item, not per-category.

See CS15d's plan-vs-implementation review for the full analysis.
