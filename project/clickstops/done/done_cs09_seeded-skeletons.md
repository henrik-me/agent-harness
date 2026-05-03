# CS09 — Seeded skeletons (create-if-missing set)

**Status:** done
**Owner:** yoga-ah
**Branch:** `cs09/content` (merged) + `cs09/close-out` (close-out)
**Started:** 2026-05-03
**Closed:** 2026-05-03
**Filed by:** CS08 close-out (per [`harness-cs-plan.md` § CS09](../done/done_cs01_bootstrap-repo/harness-cs-plan.md#cs09--author-seeded-skeletons-the-create-if-missing-set)).
**Depends on:** CS08

## Goal

Author the `template/seeded/` skeletons — empty/structural files that `harness init` creates in a consumer repo if the file does not already exist. Seeded files are created once and never overwritten (unlike managed files which are overwritten on every sync, and composed files which are merged). This CS delivers the full create-if-missing set so a fresh `harness init` produces a linter-passing repo tree with zero manual edits.

## Background

CS01 hand-authored proto process docs and seeded project-state docs (CONTEXT, ARCHITECTURE, LEARNINGS, WORKBOARD) for the harness repo itself. CS08 canonicalized the managed/composed templates. CS09 fills in the seeded skeleton set so the harness can bootstrap a brand-new consumer repo to a clean, linter-passing state via a single `harness init` invocation.

The key behavioral constraint: seeded files are **created if missing, never overwritten**. If a consumer has already written their own CONTEXT.md, `harness sync` must not touch it.

## Deliverables

### Seeded skeleton files (6 sub-agent tasks)

| File | Notes |
|------|-------|
| `template/seeded/CONTEXT.md` | Required H2s, `> Last updated:` header; passes `check-context.mjs` |
| `template/seeded/ARCHITECTURE.md` | Required sections + mermaid placeholder; passes `check-architecture.mjs` |
| `template/seeded/LEARNINGS.md` | Header + harvest pointer + empty Open/Applied sections; passes `check-learnings.mjs` |
| `template/seeded/WORKBOARD.md` | Orchestrator table + Active Work + Recently Completed headers; passes `check-workboard.mjs` |
| `template/seeded/README.md` | Consumer skeleton per READMEGUIDE; passes `check-readme.mjs` |
| `template/seeded/harness.config.json` | Example consumer config with all required fields; passes schema validation |
| `template/seeded/project/clickstops/planned/.gitkeep` | Scaffold dir |
| `template/seeded/project/clickstops/active/.gitkeep` | Scaffold dir |
| `template/seeded/project/clickstops/done/.gitkeep` | Scaffold dir |

### Fixture test

**`tests/cs09-init.test.mjs`** (9 new tests) — runs `harness init` against `tests/fixtures/cs09/empty-repo/` and asserts README.md, CONTEXT.md, ARCHITECTURE.md, LEARNINGS.md, WORKBOARD.md are produced and pass their corresponding `check-*` linters.

## Exit criteria (achieved)

- `harness init` against an empty fixture directory produces a tree that passes all applicable linters with zero edits required.
- Fixture test green (README produced from seeded skeleton; all linters pass).
- `node --test tests/*.test.mjs` passes: **384 tests** (375 baseline + 9 new).
- `node scripts/validate-schemas.mjs` passes: **64/0** (59 prior + 5 new LRNs).
- `node bin/harness.mjs lint --quiet` exits 0: **9 pass, 0 fail, 3 skipped**.
- No `TODO(CS09)` markers remain.

## Sub-agent ledger summary

**Total implementation passes: 8** = 6 initial parallel sub-agent jobs + 1 fix-round sub-agent (cs09-fixes-r1: addressed 2 blockers + 3 non-blockers) + 1 inline orchestrator R2 fix (inline marker in OPERATIONS.md prose). **Review rounds: 3** (GPT-5.5: R1=2 blockers+3 non-blockers; R2=1 blocker [inline marker]; R3=clean GO).

### Initial parallel dispatch (6-way)

**6-way parallel sub-agent dispatch.** All sub-agents Sonnet 4.6, all 0 commits, all succeeded. Zero file races (strict per-agent file-ownership per [LRN-016](../../../LEARNINGS.md#lrn-016)). Validates [LRN-058](../../../LEARNINGS.md#lrn-058) — cumulative 32 dispatches with zero commit violations.

| Sub-agent | Role | Result | Notes |
|---|---|---|---|
| cs09-context | context-skeleton | complete | 0 commits |
| cs09-architecture | arch-skeleton | complete | 0 commits |
| cs09-learnings | learnings-skeleton | complete | 0 commits |
| cs09-workboard | workboard-skeleton | complete | 0 commits |
| cs09-readme | readme-skeleton | complete | 0 commits |
| cs09-config | config-skeleton + .gitkeep | complete | 0 commits |

### Fix round sub-agent (R1 → cs09-fixes-r1)

After R1 identified 2 blockers + 3 non-blockers, **cs09-fixes-r1** (Sonnet 4.6, 0 commits) addressed all 5 findings:
- **B1:** `cmdInit` early-return gated all seeded-file copies on config-file existence ([LRN-054](../../../LEARNINGS.md#lrn-054))
- **B2:** (renumbered) additional blocker addressed by cs09-fixes-r1
- **NB-1:** Various non-blocking fixes
- **NB-3:** Source-relative `$schema` path in seeded `harness.config.json` ([LRN-055](../../../LEARNINGS.md#lrn-055))

### Inline orchestrator fix (R2)

R2 found 1 blocker: literal harness marker `<!-- harness:local-start id=X -->` in OPERATIONS.md prose at line 5 caused composed parser rejection on first `harness sync --mode=check`. Fixed inline by orchestrator — rephrased to descriptive text. ([LRN-056](../../../LEARNINGS.md#lrn-056))

### GPT-5.5 review rounds

- **R1:** 2 blockers (B1..B2) + 3 non-blockers (NB-1..3). Dispatched cs09-fixes-r1 sub-agent. Content PR #24: commits `fa01b14` (initial 6-way fan-out) + `c8c5e85` (fixes-r1) + `6914ed0` (fixes-r2), squash-merged as `ceab301`. Claim PR #23 (`73bb712`).
- **R2:** 1 blocker (inline marker in OPERATIONS.md prose) — fixed inline by orchestrator.
- **R3:** Clean GO.

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| `template/seeded/CONTEXT.md` | done | sub-agent cs09-context | agent-id=yoga-ah-sub-1 \| role=context-skeleton \| report-status=complete \| learnings=0 |
| `template/seeded/ARCHITECTURE.md` | done | sub-agent cs09-architecture | agent-id=yoga-ah-sub-2 \| role=arch-skeleton \| report-status=complete \| learnings=0 |
| `template/seeded/LEARNINGS.md` | done | sub-agent cs09-learnings | agent-id=yoga-ah-sub-3 \| role=learnings-skeleton \| report-status=complete \| learnings=0 |
| `template/seeded/WORKBOARD.md` | done | sub-agent cs09-workboard | agent-id=yoga-ah-sub-4 \| role=workboard-skeleton \| report-status=complete \| learnings=0 |
| `template/seeded/README.md` | done | sub-agent cs09-readme | agent-id=yoga-ah-sub-5 \| role=readme-skeleton \| report-status=complete \| learnings=0 |
| `template/seeded/harness.config.json` + clickstops/.gitkeep | done | sub-agent cs09-config | agent-id=yoga-ah-sub-6 \| role=config-skeleton \| report-status=complete \| learnings=0 |
| Wire `harness init` + fixture test (`tests/cs09-init.test.mjs`) | done | yoga-ah (orchestrator inline) | 9 new tests; 384 total |
| Fix all R1 findings (B1..B2 + NB-1..3) | done | sub-agent cs09-fixes-r1 | Sonnet 4.6, 0 commits; all 5 findings addressed |
| Inline R2 fix (inline marker in OPERATIONS.md prose) | done | yoga-ah (orchestrator inline) | Rephrased to descriptive text per LRN-056 |
| GPT-5.5 review rounds | done | yoga-ah | review-status=complete (R3=clean GO) |
| Open PR + squash-merge | done | yoga-ah | Content PR #24 (commits `fa01b14` initial + `c8c5e85` fixes-r1 + `6914ed0` fixes-r2), squash-merged as `ceab301`. Claim PR #23 (`73bb712`). |
| Close-out: file 5 new learnings (LRN-054..058) | done | yoga-ah | All 64 LRN entries validate (`node scripts/validate-schemas.mjs` → 64/0 pass) |
| Close-out: file planned CS10 (scaffolds) | done | yoga-ah | `planned_cs10_scaffolds.md` created |
| Close-out: file planned CS09b (sync fixture extension) | done | yoga-ah | `planned_cs09b_sync-fixture-extension.md` created |
| Close-out: rename file active → done; update WORKBOARD + CONTEXT | done | yoga-ah | This branch (cs09/close-out) |

## Notes / Learnings

(harvested at close-out; all filed as LRN-054..058)

### Process observations

- **Early-return gate anti-pattern ([LRN-054](../../../LEARNINGS.md#lrn-054)):** `cmdInit` early-returned when config existed, silently skipping all seeded-file copies. Guard each step independently in init-style commands.
- **`$schema` canonical URL rule ([LRN-055](../../../LEARNINGS.md#lrn-055)):** Seeded templates must use canonical URLs (not source-relative paths) for `$schema` references. Companion to LRN-050.
- **Inline marker in prose ([LRN-056](../../../LEARNINGS.md#lrn-056)):** Literal harness markers in prose (even in backticks) cause composed parser rejection. Rephrase to descriptive text; recognised escapes are U+200B or HTML entity.
- **Init/sync integration gap ([LRN-057](../../../LEARNINGS.md#lrn-057)):** End-to-end fixture test must include `harness sync --mode=check`, not just `harness lint`. Unit linter tests pass; only sync catches marker-in-prose bugs triggered by seeded config.
- **6-way dispatch validated ([LRN-058](../../../LEARNINGS.md#lrn-058)):** Zero races, zero rogue commits; cumulative 32 dispatches across CS01–CS09 with zero commit-discipline violations.

### Highlight

**`harness init` now produces a fully linter-passing consumer repo from a single command.** A fresh empty directory, one `harness init` invocation, and the result passes all applicable `check-*` linters with zero manual edits required. This is the first end-to-end consumer bootstrap milestone.

### Final state

- 384 tests pass (375 baseline + 9 new in `tests/cs09-init.test.mjs`).
- 6 new seeded skeleton files + 3 `.gitkeep` + 1 fixture test file.
- `harness lint --quiet`: 9 pass, 0 fail, 3 skipped (pr-body, compose-v2, public-artifact).
- 5 LRN entries filed (LRN-054..058).
- 2 planned CSs filed (CS10: scaffolds; CS09b: sync fixture extension).
