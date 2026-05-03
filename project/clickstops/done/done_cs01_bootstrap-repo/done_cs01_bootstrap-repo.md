# CS01 — Bootstrap repo + skeleton + proto process docs

**Status:** done
**Owner:** yoga-ah
**Branch:** `cs01/close-out` (post-bootstrap close-out PR)
**Started:** 2026-05-02T22:00Z
**Closed:** 2026-05-03T05:00Z

## Goal

Stand up `henrik-me/agent-harness` with the directory layout from the design and **hand-authored proto** versions of the process docs so the repo follows its own process from commit 1.

This is the foundational CS. It supersedes nothing; it bootstraps everything. From CS02 onward, every CS follows the per-CS loop in INSTRUCTIONS.md.

## Background

The two artifacts authored before CS01 — [`harness-extraction-plan.md`](./harness-extraction-plan.md) and [`harness-cs-plan.md`](./harness-cs-plan.md) — are archived alongside this CS file. The CS plan went through 4 GPT-5.5 review cycles before greenlighting CS01.

## Deliverables

- [x] `henrik-me/agent-harness` private repo on GitHub (MIT, no description initially, fixable later)
- [x] Layout: `bin/`, `lib/`, `template/{managed,composed,seeded}/`, `scripts/`, `scaffolds/`, `schemas/`, `.github/{workflows,ISSUE_TEMPLATE}/`, `project/clickstops/{planned,active,done}/`
- [x] `package.json` (private:true initially, ESM, bin entry, files whitelist, engines.node ≥ 20)
- [x] MIT `LICENSE` (auto-created by `gh repo create`)
- [x] `.gitignore`, `.editorconfig`
- [x] Hand-authored proto docs at root: `INSTRUCTIONS.md`, `CONVENTIONS.md`, `OPERATIONS.md`, `REVIEWS.md`, `TRACKING.md`, `RETROSPECTIVES.md`, `CONTEXT.md`, `WORKBOARD.md`, `LEARNINGS.md`, `ARCHITECTURE.md`, `README.md` (project-owned, never synced)
- [x] `.github/copilot-instructions.md`, `.github/pull_request_template.md`, `.github/CODEOWNERS`
- [x] Two pre-CS01 planning artifacts moved into this CS folder
- [x] **Branch protection on `main`** — *deferred to CS15b* per [LRN-001](../../../LEARNINGS.md). Not applicable in CS01.
- [x] CS01 close-out PR opened, GPT-5.5 reviewed (multi-iteration loop until clean), self-merged per user authorisation
- [x] WORKBOARD updated; this file moved to `project/clickstops/done/done_cs01_bootstrap-repo/`
- [x] LEARNINGS captured (LRN-001 through LRN-005, all `applied`)
- [x] Planned CS04a filed (downstream from LRN-002)
- [x] Planned CS02 file created so CS02 can be claimed normally per the documented claim flow

## Exit criteria

- All deliverables checked
- `git log --oneline` on `main` shows `Initial commit` + `CS01: bootstrap repo` (squash) + `CS01 close-out: ...` (squash) + nothing else from CS01
- `gh repo view --json visibility` shows `private`
- Branch protection: deferred to CS15b — no `gh api` check applicable here

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| Create repo + clone | done | yoga-ah | `gh repo create henrik-me/agent-harness --private --license MIT` |
| Build directory skeleton | done | yoga-ah | All directories with `.gitkeep` placeholders |
| Author repo plumbing files | done | yoga-ah | `.gitignore`, `.editorconfig`, `package.json`, `.github/{copilot-instructions.md,pull_request_template.md,CODEOWNERS}` |
| Author proto process docs | done | yoga-ah | INSTRUCTIONS, CONVENTIONS, OPERATIONS, REVIEWS, TRACKING, RETROSPECTIVES |
| Author seeded skeletons | done | yoga-ah | CONTEXT, ARCHITECTURE, LEARNINGS, WORKBOARD, README |
| Move planning artifacts to CS01 folder | done | yoga-ah | This folder contains both `harness-cs-plan.md` and `harness-extraction-plan.md` |
| Author the CS01 file | done | yoga-ah | (you're reading the closed version) |
| One-time bootstrap commit to `main` | done | yoga-ah | Commit `a977933`, pushed; documented exception in OPERATIONS.md — **the only direct-to-main push** |
| Configure branch protection on `main` | **deferred to CS15b** | — | Discovered branch protection requires GitHub Pro on private repos — see [LRN-001](../../../LEARNINGS.md). User chose discipline-only model for CS01–CS14; mechanical enforcement begins at CS15b (public flip). |
| Verify discipline-only model documented | done | yoga-ah | OPERATIONS.md § Enforcement model; INSTRUCTIONS.md Quick Reference; LEARNINGS LRN-001 applied |
| Branch `cs01/close-out` for CS01 close-out | done | yoga-ah | Per discipline-only PR loop |
| Local review of bootstrap state with GPT-5.5 | done | yoga-ah | Per REVIEWS.md — covered the bootstrap commit |
| File LEARNINGS for CS01 | done | yoga-ah | LRN-001 (branch-protection wall), LRN-002 (surface in `harness init`), LRN-003 (tighten CS15b harvest invariant), LRN-004 (LEARNINGS schema discipline pre-CS05), LRN-005 (sub-agent dispatch + report shape) |
| File planned CS04a (`harness init` detects private-tier) | done | yoga-ah | `project/clickstops/planned/planned_cs04a_harness-init-detect-private-tier.md` |
| File planned CS02 (define schemas) | done | yoga-ah | `project/clickstops/planned/planned_cs02_define-schemas.md` so CS02 can be claimed via the documented planned→active rename flow |
| Convert LEARNINGS.md to per-entry YAML frontmatter shape | done | yoga-ah | Per GPT-5.5 review feedback (matches CS05 schema; entries become CS05 fixtures) |
| Local review of close-out PR with GPT-5.5 | done | yoga-ah | Per REVIEWS.md — first pass returned No-Go (4 blocking + 4 non-blocking); all addressed; second pass approved |
| Open close-out PR | done | yoga-ah | PR #1 — discipline-only PR with mandatory GPT-5.5 review-loop pre-merge |
| Move CS01 directory to `done/` (in close-out PR) | done | yoga-ah | `git mv project/clickstops/active/active_cs01_bootstrap-repo project/clickstops/done/done_cs01_bootstrap-repo`; inner file `git mv active_*.md done_*.md` |
| Update WORKBOARD (remove CS01 from Active Work) | done | yoga-ah | In close-out PR |
| Update CONTEXT.md (CS01 complete) | done | yoga-ah | In close-out PR |
| Squash-merge close-out PR | done | yoga-ah | Self-merged after GPT-5.5 review clean, per user authorisation 2026-05-02 |

## Notes / Learnings

This CS is partially executed via direct-commit-to-main (the bootstrap commit only) per the documented exception in OPERATIONS.md. **From the second commit onward, branch protection is in force *by discipline* (CS01–CS14) — see [LRN-001](../../../LEARNINGS.md) for why mechanical enforcement is deferred to CS15b.** Close-out PR `cs01/close-out` follows the normal small-PR loop with mandatory GPT-5.5 review pre-merge.

The two pre-CS01 planning artifacts are kept in this folder rather than promoted to root because they are historical/contextual, not active process docs. They move with this CS file to `done/` at close-out, using the directory form documented in [TRACKING.md § Clickstop lifecycle](../../../TRACKING.md#clickstop-lifecycle).

Four learnings captured during CS01 (LRN-001 through LRN-004); all `applied`. One downstream planned CS filed (CS04a). The CS01 close-out commit lands these in the same PR.
