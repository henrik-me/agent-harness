# CS07 — Generic policy linters

**Status:** done
**Owner:** yoga-ah
**Branch:** `cs07/content` (merged) + `cs07/close-out` (close-out)
**Started:** 2026-05-03
**Closed:** 2026-05-03
**Filed by:** CS06 close-out (per [`harness-cs-plan.md` § CS07](../done/done_cs01_bootstrap-repo/harness-cs-plan.md#cs07--generic-policy-linters)).
**Depends on:** CS06

## Goal

Port the truly-generic policy checks from `guesswhatisnext` — refactored to ESM, config-driven (no hard-coded project assumptions), and tested against fixtures. Wire the 3 checker scripts into `harness lint` (the 4th, `render-deploy-summary.mjs`, is a renderer, not a checker). These address process-level constraints (PR body shape, commit trailers, compose file version, deploy summary rendering) that apply to any consumer repo.

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

- `tests/check-pr-body.test.mjs` — fixture-based tests
- `tests/check-commit-trailers.test.mjs` — fixture-based tests
- `tests/check-compose-v2.test.mjs` — fixture-based tests
- `tests/render-deploy-summary.test.mjs` — fixture-based tests
- 23 fixtures under `tests/fixtures/cs07/` (one subdirectory per linter)

### Wired into `harness lint`

3 checker scripts (pr-body, commit-trailers, compose-v2) wired into `bin/harness.mjs` `cmdLint` alongside the 10 existing CS05+CS06 linters. `cmdLint` now runs **13 linters total** (check-learnings + 9 CS06 + 3 CS07 policy checkers — per [LRN-032](../../../LEARNINGS.md#lrn-032) explicit consumer-cwd-relative file paths). `render-deploy-summary.mjs` is a renderer (not a checker) and is intentionally NOT invoked by `harness lint`.

## Exit criteria (achieved)

- All 4 linter scripts exit 0 against applicable fixtures.
- All 4 linter scripts exit non-zero on appropriate fixture errors.
- `node scripts/validate-schemas.mjs` passes (54/0 — 49 prior + 5 new LRNs).
- 375 tests pass (333 baseline + 42 new: 38 from sub-agents + 4 from R2 inline fix).
- `harness lint` runs all 13 linters (check-learnings + 9 CS06 + 3 CS07 policy checkers; render-deploy-summary excluded as a renderer) in sequence.
- No hard-coded project assumptions in any linter script.
- `harness lint --quiet`: 9 pass, 0 fail, 3 skipped (pr-body, compose-v2, public-artifact — skipped without targets).

## Sub-agent ledger summary

**Total implementation passes: 6** = 4 initial parallel sub-agent jobs + 1 inline orchestrator R2 fix (5 R1 findings all concentrated in render-deploy-summary.mjs → inline more efficient than sub-agent per [LRN-047](../../../LEARNINGS.md#lrn-047)) + orchestrator inline wiring. **Review rounds: 2** (GPT-5.5: R1, R2-clean).

### Initial parallel dispatch (4-way)

**4-way parallel sub-agent dispatch.** All sub-agents Sonnet 4.6, all 0 commits, all succeeded. Zero file races (strict per-agent file-ownership per [LRN-016](../../../LEARNINGS.md#lrn-016)). Validates [LRN-048](../../../LEARNINGS.md#lrn-048).

| Sub-agent | Role | Result | Notes |
|---|---|---|---|
| cs07-prbody | pr-body-linter | complete | 0 commits |
| cs07-trailers | commit-trailers-linter | complete | 0 commits |
| cs07-compose | compose-v2-linter | complete | 0 commits |
| cs07-render | deploy-summary-renderer | complete | 0 commits; R1 findings (B1: stdout contamination, B2: --redact-required depth, NB-3: per-type map selection) all in this file — fixed inline |

### Inline orchestrator fix (R2)

- After R1 identified 2 blockers + 3 non-blockers, **all 5 findings concentrated in `render-deploy-summary.mjs`** (1 file × 5 findings = 5 → inline fix efficient per [LRN-047](../../../LEARNINGS.md#lrn-047)). Fixed inline by orchestrator. 4 regression tests added.
  - B1: stdout contamination in `--quiet` mode — stdout reserved for artifact ([LRN-044](../../../LEARNINGS.md#lrn-044))
  - B2: `--redact-required` checked surface presence only, not substance of rule ([LRN-045](../../../LEARNINGS.md#lrn-045))
  - NB-3: `public_artifact_redaction` map iterated instead of per-type key selection ([LRN-046](../../../LEARNINGS.md#lrn-046))
  - NB-1, NB-2: additional non-blocking fixes

### GPT-5.5 review rounds

- **R1:** 2 blockers (B1: stdout contamination; B2: --redact-required substance check) + 3 non-blockers (NB-1..3; NB-3: per-type map iteration) — all in `render-deploy-summary.mjs`. Fixed inline by orchestrator.
- **R2:** GO. Content PR #18 (commits `eb61c6d` initial 4-way fan-out + `c54a8fb` fixes-r2), squash-merged as `4c3c913`. Claim PR #17 (`25eed7b`).

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| `scripts/check-pr-body.mjs` + tests + fixtures | done | sub-agent cs07-prbody | agent-id=yoga-ah-sub-1 \| role=pr-body-linter \| report-status=complete \| learnings=0 |
| `scripts/check-commit-trailers.mjs` + tests + fixtures | done | sub-agent cs07-trailers | agent-id=yoga-ah-sub-2 \| role=commit-trailers-linter \| report-status=complete \| learnings=0 |
| `scripts/check-compose-v2.mjs` + tests + fixtures | done | sub-agent cs07-compose | agent-id=yoga-ah-sub-3 \| role=compose-v2-linter \| report-status=complete \| learnings=0 |
| `scripts/render-deploy-summary.mjs` + tests + fixtures | done | sub-agent cs07-render | agent-id=yoga-ah-sub-4 \| role=deploy-summary-renderer \| report-status=complete \| learnings=0 |
| Wire 3 CS07 checkers into `harness lint`; extend `cmdLint` to 13 linters | done | yoga-ah (orchestrator inline) | 13-linter aggregator shipped (render-deploy-summary excluded — renderer) |
| GPT-5.5 review rounds | done | yoga-ah | review-status=complete (R2=GO) |
| Open PR + squash-merge | done | yoga-ah | Content PR #18 (commits `eb61c6d` initial + `c54a8fb` fixes-r2), squash-merged as `4c3c913`. Claim PR #17 (`25eed7b`). |
| Close-out: file 5 new learnings (LRN-044..048) | done | yoga-ah | All 54 LRN entries validate (`node scripts/validate-schemas.mjs` → 54/0 pass) |
| Close-out: file planned CS08 | done | yoga-ah | `planned_cs08_managed-composed-process-docs.md` created |
| Close-out: rename file active → done; update WORKBOARD + CONTEXT | done | yoga-ah | This branch (cs07/close-out) |

## Notes / Learnings

(harvested at close-out; all filed as LRN-044..048)

### Process observations

- **Stdout/stderr discipline in renderers (LRN-044):** stdout is reserved for artifact; progress always goes to stderr (non-quiet) or is suppressed (quiet).
- **Safety flags must validate substance (LRN-045):** `--redact-required` must verify the rule exists, not just that config was loaded.
- **Per-type map key selection (LRN-046):** consumers of per-type config maps MUST select by key, never iterate the whole map.
- **Inline vs sub-agent fix heuristic (LRN-047):** (findings × files) ≤ ~6 → inline; > ~6 → dispatch sub-agent. CS07 R1 was 5 findings × 1 file → inline.
- **4-way parallel dispatch validated (LRN-048):** zero races, zero rogue commits; cumulative 18 dispatches with 0 violations.

### Highlight

**Single-CS R1 fix-set concentrated in one file → inline orchestrator fix more efficient than sub-agent fan-out (LRN-047).** All 5 R1 findings were in `render-deploy-summary.mjs`; orchestrator fixed inline in one pass, R2=GO.

### Final state

- 375 tests pass (333 baseline + 42 new: 38 from sub-agents + 4 from inline R2 fix).
- 4 new linter scripts under `scripts/`.
- 4 new test files under `tests/`.
- 23 fixtures across `tests/fixtures/cs07/`.
- `bin/harness.mjs` `cmdLint` extended to 13-linter aggregator.
- `harness lint --quiet`: 9 pass, 0 fail, 3 skipped (pr-body, compose-v2, public-artifact).

## Plan-vs-implementation review

> Grandfathered: closed before plan-vs-implementation review gate was introduced (CS03b).
