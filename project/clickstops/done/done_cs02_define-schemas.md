# CS02 — Define schemas (config + lock + learning) + parameterization model + file classes

**Status:** done
**Owner:** yoga-ah
**Branch:** `cs02/define-schemas` (merged) + `cs02/close-out` (close-out)
**Started:** 2026-05-03T05:30Z
**Closed:** 2026-05-03T07:00Z
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
| Local review with GPT-5.5 | done | yoga-ah | 3 review iterations: #1 (8 findings → fixed), #2 (1 blocking → fixed), #3 (GO). PR #3 |
| Open PR | done | yoga-ah | PR #3 cs02/define-schemas |
| Squash-merge | done | yoga-ah | Commit `d5ed537` on main; branch deleted |
| Close-out: file 10 new learnings (LRN-006..015) | done | yoga-ah | All 15 total LRN entries validate against learning.schema.json (`node scripts/validate-schemas.mjs` → 21/0 pass) |
| Close-out: rename file active → done; update WORKBOARD + CONTEXT | done | yoga-ah | This PR (cs02/close-out) |

## Notes / Learnings

CS02 delivered the foundational schema contracts (`harness.config`, `harness-lock`, `learning`), 2 ADRs (file classes, README ownership), 3 worked example configs (gwn / sub-invaders / agent-harness-self), and the `validate-schemas` CI workflow. Authored via 9 parallel sub-agents in 2 waves (5 + 4), per the cs-plan parallelisation table. Orchestrator merge step patched a schema gap (`excluded` + `$schema` + `_comment` properties were missing — surfaced by 3 of 4 example sub-agents) and ran 3 GPT-5.5 review iterations on the content PR before merge.

**Sub-agent ledger summary** (24 learning candidates surfaced; 10 elevated to LEARNINGS.md, 14 dropped as already-addressed-in-PR or not meeting the RETROSPECTIVES "would change future approach" criterion):
- LRN-006: Windows CRLF/LF normalization in sub-agent tooling (applied)
- LRN-007: Orchestrator briefings must cross-check ADRs (applied)
- LRN-008: AJV strictRequired interaction with if/then (applied)
- LRN-009: composed.overrides[file].local_blocks vs top-level local_blocks redundancy (deferred to CS03)
- LRN-010: composed_block_migrations schema-ahead-of-engine pattern (applied)
- LRN-011: Composed-block 3-way consistency (template + config + linter) (deferred to CS06)
- LRN-012: Sub-agent devDep additions need explicit DECISIONS reporting (applied)
- LRN-013: js-yaml date-coercion needs JSON_SCHEMA option (applied)
- LRN-014: gwn scripts/ harness-vs-project distinction for check-migration (deferred to CS04)
- LRN-015: excluded[] is literal paths only, no globs (applied)

**Validation status at close-out:** `node scripts/validate-schemas.mjs` → 21 passed (3 schemas + 3 examples + 15 LRN entries) + 3 fixture-count assertions, exit 0.

**Process observations** (orchestrator-only, not formal LRNs):
- 2-wave dispatch (Wave 1 schemas+ADRs, Wave 2 examples+CI) was the right granularity. Examples couldn't validate until schemas existed; schemas could be designed independently.
- 3 GPT-5.5 review iterations is high for a content PR — most fixes were ADR↔schema↔cs-plan contract drifts that better cross-checking would have caught. LRN-007 captures this for future briefings.
- Sub-agent reports were uniformly well-structured (all 9 followed the OPERATIONS report shape). The structured ledger format (`agent-id|role|report-status|learnings`) made consolidation straightforward.

## Plan-vs-implementation review

> Grandfathered: closed before plan-vs-implementation review gate was introduced (CS03b).
