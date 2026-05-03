# CS08 — Managed/composed process docs canonicalization

**Status:** done
**Owner:** yoga-ah
**Branch:** `cs08/content` (merged) + `cs08/close-out` (close-out)
**Started:** 2026-05-03
**Closed:** 2026-05-03
**Filed by:** CS07 close-out (per [`harness-cs-plan.md` § CS08](../done/done_cs01_bootstrap-repo/harness-cs-plan.md#cs08--author-managedcomposed-process-docs-the-source-of-truth-set)).
**Depends on:** CS07

## Goal

Write the canonical `INSTRUCTIONS.md`, `CONVENTIONS.md`, `OPERATIONS.md`, `REVIEWS.md`, `TRACKING.md`, `RETROSPECTIVES.md`, and `READMEGUIDE.md` as harness templates under `template/managed/` and `template/composed/`. Classify each file correctly (managed = full overwrite on sync; composed = managed core + marker-preserved local blocks). This CS also absorbs many open LRNs by incorporating their findings into the canonical OPERATIONS.md conventions block (Windows `spawnSync` shell:true, `--help` forwarding, linter path threading, test minimums, etc.).

## Background

CS01 hand-authored proto process docs (INSTRUCTIONS, CONVENTIONS, OPERATIONS, REVIEWS, TRACKING, RETROSPECTIVES) marked `proto, CS01`. CS08 promotes these to the canonical, schema-validated, harness-owned templates. From CS11 onward, `harness sync` overwrites managed files and preserves composed local blocks. All check-* linters must pass against these templates.

## Deliverables

### Template files (10 total)

**7 process doc templates:**

| File | Class | Notes |
|------|-------|-------|
| `template/managed/INSTRUCTIONS.md` | managed | Quick-reference checklist + "When to add X" decision tree + harvest cadence (weekly + bounded before-claim) |
| `template/composed/CONVENTIONS.md` | composed | Language-agnostic core (managed) + local block `id=conventions.project` for project-specific conventions |
| `template/composed/OPERATIONS.md` | composed | Claim/dispatch/handoff/sync/harvest core (managed) + local block `id=operations.project-deploy`. Absorbs LRN-029/030/032/037/038/040. SemVer policy section. |
| `template/composed/REVIEWS.md` | composed | Review loop core (managed) + local block `id=reviews.project-gates`. Absorbs Decision #22, LRN-024/031. |
| `template/managed/TRACKING.md` | managed | Clickstop lifecycle, workboard state machine, § Agent Identification parameterised on `project.agent_suffix` |
| `template/managed/RETROSPECTIVES.md` | managed | Precise definition of "learning", category taxonomy, harvest procedure, disposition states, both cadences |
| `template/managed/READMEGUIDE.md` | managed | Harness opinion on consumer READMEs; enforced by `check-readme.mjs` |

**3 `.github` bundle files:**

| File | Notes |
|------|-------|
| `template/managed/.github/copilot-instructions.md` | Copilot agent briefing skeleton |
| `template/managed/.github/pull_request_template.md` | PR template conforming to `check-pr-body.mjs` rules (LRN-051: self-reference trap avoided — forbidden tokens paraphrased) |
| `template/managed/.github/CODEOWNERS` | CODEOWNERS template |

## Exit criteria (achieved)

- All `check-*` linters pass against the new templates (`node bin/harness.mjs lint --quiet` exits 0; 9 pass, 0 fail, 3 skipped).
- `node scripts/validate-schemas.mjs` passes (59/0 — 54 prior + 5 new LRNs).
- `node --test tests/*.test.mjs` passes (375 tests — docs-only CS, no new tests).
- No `TODO(CS08)` markers remain in the codebase.
- Absorbed open LRNs (LRN-029, LRN-030, LRN-032, LRN-037, LRN-038, LRN-040) documented in canonical OPERATIONS.md conventions block.

## Sub-agent ledger summary

**Total implementation passes: 10** = 8 initial parallel sub-agent jobs + 1 fix-round sub-agent (cs08-fixes-r1: addressed all 7 R1 findings) + 1 inline orchestrator R2 fix (last unlinked LRN reference, non-blocking). **Review rounds: 2** (GPT-5.5: R1=3 blockers+4 non-blockers; R2=1 small NB inline-fixed, GO).

### Initial parallel dispatch (8-way)

**8-way parallel sub-agent dispatch.** All sub-agents Sonnet 4.6, all 0 commits, all succeeded. Zero file races (strict per-agent file-ownership per [LRN-016](../../../LEARNINGS.md#lrn-016)). Validates [LRN-052](../../../LEARNINGS.md#lrn-052) — largest fan-out by output volume yet.

| Sub-agent | Role | Result | Notes |
|---|---|---|---|
| cs08-instructions | instructions-template | complete | 0 commits |
| cs08-conventions | conventions-template | complete | 0 commits |
| cs08-operations | operations-template | complete | 0 commits; absorbs LRN-029/030/032/037/038/040; SemVer policy |
| cs08-reviews | reviews-template | complete | 0 commits; absorbs Decision #22, LRN-024/031 |
| cs08-tracking | tracking-template | complete | 0 commits |
| cs08-retrospectives | retro-template | complete | 0 commits |
| cs08-readmeguide | readmeguide-template | complete | 0 commits |
| cs08-githubtmpl | github-templates | complete | 0 commits; fixed self-reference trap (LRN-051) inline |

### Fix round sub-agent (R1 → cs08-fixes-r1)

- After R1 identified 3 blockers + 4 non-blockers spread across multiple template files, **cs08-fixes-r1** (Sonnet 4.6, 0 commits) addressed all 7 findings. (7 findings × multiple files > 6 threshold per [LRN-047](../../../LEARNINGS.md#lrn-047) → sub-agent dispatch correct decision.)
  - B2: dot-notation placeholders `{{project.X}}` unresolvable by flat-key engine ([LRN-049](../../../LEARNINGS.md#lrn-049))
  - B3: source-relative paths in templates break after sync to consumer root ([LRN-050](../../../LEARNINGS.md#lrn-050))
  - NB-1..4: non-blocking fixes

### Inline orchestrator fix (R2)

- R2 found 1 small non-blocker: last unlinked LRN reference in a template. Fixed inline by orchestrator. R2 = GO.

### GPT-5.5 review rounds

- **R1:** 3 blockers (B1..B3) + 4 non-blockers (NB-1..4) across multiple template files. Dispatched cs08-fixes-r1 sub-agent.
- **R2:** 1 small NB (last unlinked LRN reference) — fixed inline by orchestrator. Content PR #21 (commits `20a63fb` initial 8-way fan-out + `3cda3a4` fixes-r1 + `8a1b228` fixes-r2), squash-merged as `676c494`. Claim PR #20 (`f89a064`).

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| `template/managed/INSTRUCTIONS.md` | done | sub-agent cs08-instructions | agent-id=yoga-ah-sub-1 \| role=instructions-template \| report-status=complete \| learnings=0 |
| `template/composed/CONVENTIONS.md` | done | sub-agent cs08-conventions | agent-id=yoga-ah-sub-2 \| role=conventions-template \| report-status=complete \| learnings=0 |
| `template/composed/OPERATIONS.md` (absorbs LRN-029/030/032/037/038/040 + SemVer policy) | done | sub-agent cs08-operations | agent-id=yoga-ah-sub-3 \| role=operations-template \| report-status=complete \| learnings=0 |
| `template/composed/REVIEWS.md` | done | sub-agent cs08-reviews | agent-id=yoga-ah-sub-4 \| role=reviews-template \| report-status=complete \| learnings=0 |
| `template/managed/TRACKING.md` | done | sub-agent cs08-tracking | agent-id=yoga-ah-sub-5 \| role=tracking-template \| report-status=complete \| learnings=0 |
| `template/managed/RETROSPECTIVES.md` | done | sub-agent cs08-retrospectives | agent-id=yoga-ah-sub-6 \| role=retro-template \| report-status=complete \| learnings=0 |
| `template/managed/READMEGUIDE.md` | done | sub-agent cs08-readmeguide | agent-id=yoga-ah-sub-7 \| role=readmeguide-template \| report-status=complete \| learnings=0 |
| `template/managed/.github/{copilot-instructions.md, pull_request_template.md, CODEOWNERS}` | done | sub-agent cs08-githubtmpl | agent-id=yoga-ah-sub-8 \| role=github-templates \| report-status=complete \| learnings=0 |
| Fix all R1 findings (B1..B3 + NB-1..4) | done | sub-agent cs08-fixes-r1 | Sonnet 4.6, 0 commits; all 7 findings addressed |
| Cross-link integrity check + harness lint regression | done | yoga-ah (orchestrator inline) | 9 pass, 0 fail, 3 skipped |
| GPT-5.5 review rounds | done | yoga-ah | review-status=complete (R2=GO, 1 NB inline-fixed) |
| Open PR + squash-merge | done | yoga-ah | Content PR #21 (commits `20a63fb` initial + `3cda3a4` fixes-r1 + `8a1b228` fixes-r2), squash-merged as `676c494`. Claim PR #20 (`f89a064`). |
| Close-out: file 5 new learnings (LRN-049..053) | done | yoga-ah | All 59 LRN entries validate (`node scripts/validate-schemas.mjs` → 59/0 pass) |
| Close-out: file planned CS08b (template linter) | done | yoga-ah | `planned_cs08b_template-linter.md` created |
| Close-out: file planned CS09 (seeded skeletons) | done | yoga-ah | `planned_cs09_seeded-skeletons.md` created |
| Close-out: rename file active → done; update WORKBOARD + CONTEXT | done | yoga-ah | This branch (cs08/close-out) |

## Notes / Learnings

(harvested at close-out; all filed as LRN-049..053)

### Process observations

- **Dot-notation placeholder trap ([LRN-049](../../../LEARNINGS.md#lrn-049)):** Templates resolved by flat-key substitution engine must use flat keys only — never `{{project.X}}` dot-notation.
- **Consumer-root-relative paths ([LRN-050](../../../LEARNINGS.md#lrn-050)):** Managed templates must use consumer-root-relative paths, not source-tree-relative paths. Think of the FINAL install location, not the source location.
- **Template self-reference trap ([LRN-051](../../../LEARNINGS.md#lrn-051)):** Templates documenting linter-forbidden tokens must not quote those tokens verbatim — even in HTML comments.
- **8-way dispatch validated ([LRN-052](../../../LEARNINGS.md#lrn-052)):** Zero races, zero rogue commits; largest fan-out by output volume yet; parallel fan-out scales with disjoint file ownership.
- **Edit-tool truncation near end-of-file ([LRN-053](../../../LEARNINGS.md#lrn-053)):** After large `edit` operations, verify file line count delta matches expectation — a linter pass alone does not catch silent truncation.

### Highlight

**Largest fan-out yet by output volume (8 substantive doc-authoring tasks vs CS06's 9 narrow scripts)** — validates that 8-way parallel scaling works cleanly when file ownership is disjoint. The cost is review burden: 7 templates × multiple LRN cross-references = many small audit points. CS06's bottleneck was bugs; CS08's bottleneck was cross-reference accuracy.

### Final state

- 375 tests pass (375 baseline — docs-only CS, no new tests).
- 10 new template files under `template/managed/`, `template/composed/`, `template/managed/.github/`.
- `harness lint --quiet`: 9 pass, 0 fail, 3 skipped (pr-body, compose-v2, public-artifact).
- 5 LRN entries filed (LRN-049..053).
- 2 planned CSs filed (CS08b: template linter; CS09: seeded skeletons).
