# INSTRUCTIONS — Orchestrator Workflow (proto, CS01)

This is the **bootstrap** version of the orchestrator workflow doc. It supersedes nothing; it governs CS01 onward. The canonical template authored in CS08 will replace this file at CS11 via `harness sync`. Until then this is hand-maintained.

## Quick Reference Checklist

Re-read this section after every `git pull`, even if INSTRUCTIONS.md didn't change.

- **Session start:** `git pull`; derive your agent ID per [TRACKING.md § Agent Identification](TRACKING.md#agent-identification); state your derived ID + "INSTRUCTIONS.md re-read complete @ \<SHA\>" in your first response. Treat session resume as session start for this rule.
- **Claiming a CS:** see [OPERATIONS.md § Claim](OPERATIONS.md#claim). **Only the CS01 bootstrap commit goes direct to `main`.** From commit 2 onward, every change — including WORKBOARD claim/closeout — goes through a PR. **CS01–CS14 are discipline-only** (private-repo branch protection requires GitHub Pro — see [LRN-001](LEARNINGS.md)). **CS15b+ is mechanically enforced** via Rulesets configured at CS15a. Until CS15a these are normal small PRs with user review labeled `workboard-only`; from CS15a onward the auto-approve bot (Decision #23) handles them.
- **Closing a CS:** rename `active_csNN_*.md` → `done_csNN_*.md` and move to `project/clickstops/done/`; remove from WORKBOARD; update [CONTEXT.md](CONTEXT.md) if codebase state changed; capture learnings in [LEARNINGS.md](LEARNINGS.md).
- **Implementation model:** Claude Opus 4.7 1M (orchestrator). Sub-tasks: Haiku for mechanical, Sonnet for non-trivial.
- **Local review:** GPT-5.5 rubber-duck mandatory before opening any PR and before committing any template change. Fallback per [REVIEWS.md](REVIEWS.md) (Sonnet 4.6 for non-high-risk only, with the independence invariant; user waiver always allowed).
- **Branch naming:** `cs<NN>/<slug>` for CS work; `workboard/cs<NN>-claim` (and `workboard/cs<NN>-close`, etc.) for WORKBOARD-only PRs. Before CS15a these are user-reviewed small PRs; from CS15a onward they are bot-approved/auto-merged when eligible.
- **Commit trailers:** include `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.
- **Mid-CS sync prohibition:** do not run `harness sync` mid-clickstop unless fixing a harness blocker. Harness updates land in their own dedicated CS.

## Per-CS Loop

1. **Pre-claim:** review LEARNINGS.md for stale `open` items tagged `process` or `architectural`. Disposition before claiming.
2. **Claim:** rename `planned_csNN_*.md` → `active_csNN_*.md`; update [WORKBOARD.md](WORKBOARD.md) with your row (CS-Task ID, agent ID, branch, state); commit.
3. **Branch:** `cs<NN>/<slug>` from `main`.
4. **Plan-internal:** identify parallelisable sub-tasks; dispatch sub-agents.
5. **Implement.**
6. **Local review:** GPT-5.5 rubber-duck. Record model + timestamp in PR body.
7. **Open PR** following the template.
8. **CI checks** must all pass.
9. **Review:** in this private phase, GPT-5.5 + user review; Copilot review optional.
10. **Threads resolved**, then **squash-merge**.
11. **Post-merge:** rename `active_csNN_*.md` → `done_csNN_*.md`; update WORKBOARD + CONTEXT; file LEARNINGS.
12. **Harvest** if cadence triggers.

## Pointers

- Code/test/git/docs conventions → [CONVENTIONS.md](CONVENTIONS.md)
- Day-to-day procedures → [OPERATIONS.md](OPERATIONS.md)
- Review loop → [REVIEWS.md](REVIEWS.md)
- Clickstop lifecycle + agent identification → [TRACKING.md](TRACKING.md)
- Definition of "learning" + harvest procedure → [RETROSPECTIVES.md](RETROSPECTIVES.md)
- Live coordination → [WORKBOARD.md](WORKBOARD.md)
- Codebase state → [CONTEXT.md](CONTEXT.md)
- Architecture → [ARCHITECTURE.md](ARCHITECTURE.md)
- Accumulated knowledge → [LEARNINGS.md](LEARNINGS.md)
- The CS plan that drives all of this → [project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md](project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md)
