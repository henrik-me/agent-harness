# CS02 — Define schemas (config + lock + learning) + parameterization model + file classes

**Status:** active
**Owner:** yoga-ah
**Branch:** `cs02/define-schemas`
**Started:** 2026-05-03T05:30Z
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

9 parallel sub-tasks: 3 schemas + 2 ADRs + 3 examples + 1 CI wiring. Each gets dispatched per the [OPERATIONS.md § Sub-agent dispatch](../../../OPERATIONS.md#sub-agent-dispatch-proto-cs01) template (CS01-introduced per LRN-005). Sub-agents report back with the structured shape from [OPERATIONS.md § Sub-agent report shape](../../../OPERATIONS.md#sub-agent-report-shape-mandatory). Per-task ledger encoded into the Tasks table's `Notes` column per the format documented in [OPERATIONS.md § Per-CS sub-agent ledger](../../../OPERATIONS.md#per-cs-sub-agent-ledger).

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| Author harness.config.schema.json | done | sub-agent | agent-id=cs02-schema-config \| role=schema-author \| report-status=complete \| learnings=4 |
| Author harness-lock.schema.json | done | sub-agent | agent-id=cs02-schema-lock \| role=schema-author \| report-status=complete \| learnings=2 |
| Author learning.schema.json + validate against LRN-001..005 | done | sub-agent | agent-id=cs02-schema-learning \| role=schema-author \| report-status=complete \| learnings=0 |
| Author ADR 0001-file-classes.md | done | sub-agent | agent-id=cs02-adr-file-classes \| role=adr-author \| report-status=complete \| learnings=1 |
| Author ADR 0002-readme-ownership.md | done | sub-agent | agent-id=cs02-adr-readme \| role=adr-author \| report-status=complete \| learnings=2 |
| Author guesswhatisnext example config | done | sub-agent | agent-id=cs02-example-gwn \| role=example-author \| report-status=complete \| learnings=4 |
| Author sub-invaders example config | done | sub-agent | agent-id=cs02-example-si \| role=example-author \| report-status=complete \| learnings=4 |
| Author agent-harness-self example config | done | sub-agent | agent-id=cs02-example-ah \| role=example-author \| report-status=complete \| learnings=3 |
| Wire validate-schemas CI workflow | done | sub-agent | agent-id=cs02-ci-validate \| role=ci-author \| report-status=complete \| learnings=4 |
| Cross-link integrity merge | done | yoga-ah | Schema gap (`excluded` + `$schema` properties) added by orchestrator post-Wave-2 reports; all 3 examples + schemas + 5 LRNs validate; `node scripts/validate-schemas.mjs` exit 0 |
| Local review with GPT-5.5 | pending | yoga-ah | Per REVIEWS.md — iterate until clean |
| Open PR | pending | yoga-ah | branch `cs02/define-schemas` |
| Squash-merge | pending | yoga-ah | Self-merge after GPT-5.5 review clean |

## Notes / Learnings

(filled during execution; harvested at close-out)
