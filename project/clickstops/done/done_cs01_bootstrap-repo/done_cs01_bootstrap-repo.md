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
- [ ] Branch protection on `main` configured: PR-required (with documented one-time bootstrap-commit exception), no force pushes, no deletions
- [ ] CS01 PR opened, GPT-5.5 reviewed, user reviewed, squash-merged
- [ ] WORKBOARD updated; this file moved to `project/clickstops/done/done_cs01_bootstrap-repo/`
- [ ] LEARNINGS captured

## Exit criteria

- All deliverables checked
- `git log --oneline` on `main` shows `Initial commit` + `CS01: bootstrap repo` (squash) + nothing else
- `gh repo view --json visibility` shows `private`
- Branch protection rules visible via `gh api repos/henrik-me/agent-harness/branches/main/protection`

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| Create repo + clone | done | yoga-ah | `gh repo create henrik-me/agent-harness --private --license MIT` |
| Build directory skeleton | done | yoga-ah | All directories with `.gitkeep` placeholders |
| Author repo plumbing files | done | yoga-ah | `.gitignore`, `.editorconfig`, `package.json`, `.github/{copilot-instructions.md,pull_request_template.md,CODEOWNERS}` |
| Author proto process docs | done | yoga-ah | INSTRUCTIONS, CONVENTIONS, OPERATIONS, REVIEWS, TRACKING, RETROSPECTIVES |
| Author seeded skeletons | done | yoga-ah | CONTEXT, ARCHITECTURE, LEARNINGS, WORKBOARD, README |
| Move planning artifacts to CS01 folder | done | yoga-ah | This folder now contains both `harness-cs-plan.md` and `harness-extraction-plan.md` |
| Author this active CS01 file | done | yoga-ah | (you're reading it) |
| One-time bootstrap commit to `main` | done | yoga-ah | Commit `a977933`, pushed; documented exception in OPERATIONS.md — **the only direct-to-main push** |
| ~~Configure branch protection on `main`~~ | **deferred to CS15b** | — | Discovered branch protection requires GitHub Pro on private repos — see [LRN-001](../../../LEARNINGS.md). User chose discipline-only model for CS01–CS14; mechanical enforcement begins at CS15b (public flip). |
| Verify discipline-only model documented | done | yoga-ah | OPERATIONS.md § Enforcement model; INSTRUCTIONS.md Quick Reference; LEARNINGS LRN-001 applied |
| Branch `cs01/close-out` for CS01 close-out | done | yoga-ah | Per discipline-only PR loop |
| Local review of bootstrap state with GPT-5.5 | done | yoga-ah | Per REVIEWS.md — covered the bootstrap commit |
| File LEARNINGS for CS01 | done | yoga-ah | LRN-001 (branch-protection wall), LRN-002 (surface in `harness init`), LRN-003 (tighten CS15b harvest invariant), LRN-004 (LEARNINGS schema discipline pre-CS05) |
| File planned CS04a (`harness init` detects private-tier) | done | yoga-ah | `project/clickstops/planned/planned_cs04a_harness-init-detect-private-tier.md` |
| Local review of close-out PR with GPT-5.5 | pending | yoga-ah | Per REVIEWS.md — must pass before merge; iterate until clean |
| Open close-out PR | pending | yoga-ah | Discipline-only PR; self-mergeable per user authorisation 2026-05-02 *after* GPT-5.5 review clean |
| Move CS01 directory to `done/` (in close-out PR) | pending | yoga-ah | `git mv project/clickstops/done/done_cs01_bootstrap-repo project/clickstops/done/done_cs01_bootstrap-repo`; rename inner file too |
| Update WORKBOARD (remove CS01 from Active Work) | pending | yoga-ah | In close-out PR |
| Update CONTEXT.md (CS01 complete) | pending | yoga-ah | In close-out PR |
| Squash-merge close-out PR | pending | yoga-ah | After GPT-5.5 review clean; self-merge per user authorisation |

## Notes / Learnings

This CS is partially executed via direct-commit-to-main (the bootstrap commit only) per the documented exception in OPERATIONS.md. **From the second commit onward, branch protection is in force *by discipline* (CS01–CS14) — see [LRN-001](../../../LEARNINGS.md) for why mechanical enforcement is deferred to CS15b.** Close-out PR `cs01/close-out` follows the normal small-PR loop with mandatory GPT-5.5 review pre-merge.

The two pre-CS01 planning artifacts are kept in this folder rather than promoted to root because they are historical/contextual, not active process docs. They move with this CS file to `done/` at close-out, using the directory form documented in [TRACKING.md § Clickstop lifecycle](../../../TRACKING.md#clickstop-lifecycle).

Four learnings captured during CS01 (LRN-001 through LRN-004); all `applied`. One downstream planned CS filed (CS04a). The CS01 close-out commit lands these in the same PR.
