# CS02 — Define schemas (config + lock + learning) + parameterization model + file classes

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** CS01 close-out (so CS02 can be claimed via the documented planned → active rename flow per [TRACKING.md § Clickstop lifecycle](../../../TRACKING.md#clickstop-lifecycle))
**Depends on:** CS01

## Goal

Pin down all contracts the engine and linters will depend on, **before any code is written**. Three JSON Schemas + two ADRs + three worked examples. This is the foundational schema CS — every later CS slots into the contracts defined here.

## Deliverables

See [`done_cs01_bootstrap-repo/harness-cs-plan.md` § CS02](../done/done_cs01_bootstrap-repo/harness-cs-plan.md) for the canonical deliverables list. Summary:

- `schemas/harness.config.schema.json` (Draft-2020-12) with full key set including `project.agent_suffix`, `project.agent_env_var` (default `HARNESS_AGENT_<SUFFIX_UPPER>_MACHINE` per Decision #20c), `managed`, `composed`, `seeded`, `scaffolds`, `linters`, `templating`, `local_blocks`, `composed_block_migrations` (schema-only in v0.1.0), `public_artifact_redaction`
- `schemas/harness-lock.schema.json` for `.harness-lock.json` with per-file class/hashes/blocks (incl. composed block provenance per Decision #13)
- `schemas/learning.schema.json` matching the per-entry YAML frontmatter shape used in [LEARNINGS.md](../../../LEARNINGS.md) (CS01 entries LRN-001 through LRN-005 are CS02's regression fixtures per [LRN-004](../../../LEARNINGS.md#lrn-004))
- ADR documenting the **three file classes** (`managed`, `composed`, `seeded`)
- ADR documenting the **README ownership split** (root README is project-owned and excluded from sync)
- Worked `harness.config.json` examples for: guesswhatisnext, sub-invaders, the harness repo itself

## Exit criteria

- All three schemas validate the three example configs (`ajv` or equivalent in CI; CI itself stood up here for the first time)
- Both ADRs merged (under `docs/adr/` — created if missing)
- Schemas published with `$id` URLs so editors auto-complete
- CS01 LEARNINGS entries (LRN-001 through LRN-005) validate against `learning.schema.json` — non-negotiable per LRN-004

## Sub-agent fan-out (per cs-plan parallelisation table)

9 parallel sub-tasks: 3 schemas + 2 ADRs + 3 examples + 1 CI wiring. Each gets dispatched per the `OPERATIONS.md § Sub-agent dispatch` template (CS01-introduced per LRN-005). Sub-agents report back with the structured shape from `OPERATIONS.md § Sub-agent report shape`. Per-task ledger encoded into the Tasks table's `Notes` column.

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per OPERATIONS.md § Claim) | planned | — | — |

## Notes / Learnings

(filled during execution; harvested at close-out)
