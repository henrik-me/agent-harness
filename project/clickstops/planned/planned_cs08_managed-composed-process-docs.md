# CS08 — Managed/composed process docs canonicalization

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** CS07 close-out (per [`harness-cs-plan.md` § CS08](../done/done_cs01_bootstrap-repo/harness-cs-plan.md#cs08--author-managedcomposed-process-docs-the-source-of-truth-set)).
**Depends on:** CS07

## Goal

Write the canonical `INSTRUCTIONS.md`, `CONVENTIONS.md`, `OPERATIONS.md`, `REVIEWS.md`, `TRACKING.md`, `RETROSPECTIVES.md`, and `READMEGUIDE.md` as harness templates under `template/managed/` and `template/composed/`. Classify each file correctly (managed = full overwrite on sync; composed = managed core + marker-preserved local blocks). This CS also absorbs many open LRNs by incorporating their findings into the canonical OPERATIONS.md conventions block (Windows `spawnSync` shell:true, `--help` forwarding, linter path threading, test minimums, etc.).

## Background

CS01 hand-authored proto process docs (INSTRUCTIONS, CONVENTIONS, OPERATIONS, REVIEWS, TRACKING, RETROSPECTIVES) marked `proto, CS01`. CS08 promotes these to the canonical, schema-validated, harness-owned templates. From CS11 onward, `harness sync` overwrites managed files and preserves composed local blocks. All check-* linters must pass against these templates.

## Deliverables

- [ ] `template/managed/INSTRUCTIONS.md` — quick-reference checklist + "When to add X" decision tree pointing at scaffolds + harvest cadence (weekly + bounded before-claim)
- [ ] `template/composed/CONVENTIONS.md` — language-agnostic core (managed) + local block `id=conventions.project` for project-specific language/framework conventions
- [ ] `template/composed/OPERATIONS.md` — claim/dispatch/handoff/sync/harvest core (managed) + local block `id=operations.project-deploy` for project-specific deploy commands. Documents WORKBOARD-claim mechanism (Decision #23), SemVer policy, Windows `spawnSync shell:true` convention (LRN-029), `--help` forwarding pattern (LRN-030), explicit linter path threading (LRN-032), sub-agent test minimums vs exact counts (LRN-037), aggregator single-source config path (LRN-038), `requireValue` arg guard (LRN-040)
- [ ] `template/composed/REVIEWS.md` — review loop core (managed) + local block `id=reviews.project-gates` for project-specific review gates. Documents GPT-5.5 fallback policy (Decision #22), review-round calibration (LRN-024, LRN-031)
- [ ] `template/managed/TRACKING.md` — clickstop lifecycle, workboard state machine, § Agent Identification parameterised on `project.agent_suffix` (format `<machine-short>-<repo-short>[-c<N>]`, override via `HARNESS_AGENT_<SUFFIX_UPPER>_MACHINE` per Decision #20c)
- [ ] `template/managed/RETROSPECTIVES.md` — precise definition of "learning", category taxonomy (`architectural`/`operational`/`tooling`/`process`/`anti-pattern`), harvest procedure, disposition states, both cadences with bounded prompt rules
- [ ] `template/managed/READMEGUIDE.md` — harness's opinion on consumer READMEs (one-liner, status badges, quickstart, harness pointer, contributing pointer, license, screenshot/demo if applicable, links to ARCHITECTURE.md and CONTEXT.md) — enforced by `check-readme.mjs`
- [ ] `template/managed/.github/copilot-instructions.md`, `pull_request_template.md`, `CODEOWNERS` template
- [ ] **SemVer policy section in OPERATIONS.md**: Major/Minor/Patch rules; update guidance (harness updates in own PR/CS, CLI warns on mid-CS or major sync)
- [ ] All `check-*` linters pass against these templates

## Exit criteria

- All `check-*` linters pass against the new templates (`node bin/harness.mjs lint --quiet` exits 0).
- `node scripts/validate-schemas.mjs` still passes.
- `node --test tests/*.test.mjs` still passes (375+ tests).
- No `TODO(CS08)` markers remain in the codebase.
- Absorbed open LRNs (LRN-029, LRN-030, LRN-032, LRN-037, LRN-038, LRN-040) documented in canonical OPERATIONS.md conventions block.

## Sub-agent fan-out

**7 docs + SemVer section → 8 parallelisable sub-tasks** (one per template file or section); merge/cross-link integrity step by orchestrator inline after sub-agents complete. Per [LRN-016](../../../LEARNINGS.md#lrn-016), each sub-agent owns exactly one template file. Briefings MUST include:
- Hard "no commit" preflight (per [LRN-021](../../../LEARNINGS.md#lrn-021))
- Explicit file ownership — sub-agent owns exactly its template file
- `schemas/*.schema.json` as mandatory reading before any field access (per [LRN-039](../../../LEARNINGS.md#lrn-039))
- `requireValue(args, i, flagName)` guard for all flag-value parsing (per [LRN-040](../../../LEARNINGS.md#lrn-040))
- Test minimums, not exact counts (per [LRN-037](../../../LEARNINGS.md#lrn-037))
- `--file` flag must be explicit; do NOT infer path from `import.meta.url` (per [LRN-032](../../../LEARNINGS.md#lrn-032))

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per OPERATIONS.md § Claim) | planned | — | — |

## Notes / Learnings

(filled during execution)
