# CS07 — Generic policy linters

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** CS06 close-out (per [`harness-cs-plan.md` § CS07](../done/done_cs01_bootstrap-repo/harness-cs-plan.md#cs07--generic-policy-linters)).
**Depends on:** CS06

## Goal

Port the truly-generic policy checks from `guesswhatisnext` — refactored to ESM, config-driven (no hard-coded project assumptions), and tested against fixtures. Wire all 4 linters into `harness lint`. These linters address process-level constraints (PR body shape, commit trailers, compose file version, deploy summary rendering) that apply to any consumer repo, making them the harness's first fully consumer-facing policy linters.

## Deliverables

### Linter scripts

Each script lives under `scripts/`, uses `lib/doc-schema.mjs` where applicable, has `--file` and `--cwd` flags, and is wired into `harness lint` via `cmdLint`.

| Script | Validates | Key checks |
|--------|-----------|------------|
| `scripts/check-pr-body.mjs` | PR body markdown | Required sections present; no placeholder text left in body; optional minimum word count per section (config-driven) |
| `scripts/check-commit-trailers.mjs` | Git commit message trailer block | Required trailers present (e.g. `Co-authored-by`, `Signed-off-by`); trailer format valid; trailer values match expected patterns (config-driven allowlist) |
| `scripts/check-compose-v2.mjs` | `docker-compose.yml` / `compose.yaml` | File uses Compose spec v2+ (no `version:` field or `version: "3"` style); services block present; no deprecated keys |
| `scripts/render-deploy-summary.mjs` | Deployment summary rendering | Renders a normalized deployment summary from a structured input JSON; validates required fields; outputs a markdown artifact; driven by `public_artifact_redaction` config (per Decision #24) |

### Tests

- `tests/check-pr-body.test.mjs` — minimum fixture-based tests
- `tests/check-commit-trailers.test.mjs` — minimum fixture-based tests
- `tests/check-compose-v2.test.mjs` — minimum fixture-based tests
- `tests/render-deploy-summary.test.mjs` — minimum fixture-based tests
- Fixtures under `tests/fixtures/cs07/` (one subdirectory per linter)

### Wired into `harness lint`

All 4 linter scripts wired into `bin/harness.mjs` `cmdLint` alongside the 10 existing linters. Each receives an explicit consumer-cwd-relative file path per [LRN-032](../../../LEARNINGS.md#lrn-032).

## Exit criteria

- All 4 linter scripts exit 0 against applicable fixtures.
- All 4 linter scripts exit non-zero on appropriate fixture errors.
- `node scripts/validate-schemas.mjs` still passes.
- All existing 333+ tests still pass.
- Minimum 5 new tests per linter (20+ new tests total).
- `harness lint` runs all 14 linters (10 from CS05/CS06 + 4 new) in sequence.
- No hard-coded project assumptions in any linter script — all project-specific values are read from `harness.config.json` or passed via flags.

## Sub-agent fan-out

**4 parallel sub-agents — one per linter script.** Per [LRN-016](../../../LEARNINGS.md#lrn-016), each linter is its own file with no overlap between sub-agents. Each sub-agent owns:
- `scripts/check-<name>.mjs` (or `scripts/render-<name>.mjs`)
- `tests/check-<name>.test.mjs` (or `tests/render-<name>.test.mjs`)
- `tests/fixtures/cs07/<name>/` (fixtures)

No sub-agent touches `lib/doc-schema.mjs` (read-only) or `bin/harness.mjs` (wired by orchestrator inline after sub-agents complete).

Briefings MUST include:
- Hard "no commit" preflight (per [LRN-021](../../../LEARNINGS.md#lrn-021))
- Explicit file ownership — sub-agent owns exactly the 3 paths listed above (per [LRN-016](../../../LEARNINGS.md#lrn-016))
- Full `lib/doc-schema.mjs` source as required reading
- `schemas/*.schema.json` mandatory read before any field access (per [LRN-039](../../../LEARNINGS.md#lrn-039))
- `requireValue(args, i, flagName)` guard for all flag-value parsing (per [LRN-040](../../../LEARNINGS.md#lrn-040))
- Minimum test count specified as a minimum, not exact (per [LRN-037](../../../LEARNINGS.md#lrn-037))
- `--file` flag must be explicit; do NOT infer path from `import.meta.url` (per [LRN-032](../../../LEARNINGS.md#lrn-032))

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per OPERATIONS.md § Claim) | planned | — | — |

## Notes / Learnings

(filled during execution)
