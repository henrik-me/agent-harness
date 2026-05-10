# CS04a — `harness init` detects private-repo / free-tier constraints

**Status:** done
**Owner:** yoga-ah (via CS15e)
**Branch:** —
**Started:** 2026-05-10 (via CS15e)
**Closed:** 2026-05-10 (via CS15e)
**Filed by:** [LRN-002](../../../LEARNINGS.md#lrn-002) at CS01 close-out
**Superseded by:** [CS15e](./done_cs15e_init-private-tier-detection.md) — absorbed and delivered by the CS15e umbrella; PR #95 merged 2026-05-10. CS04a Q1–Q5 were user-resolved during the cs15-cleanup-planning Q&A (2026-05-09) and captured in CS15e § "Resolved decisions". This file moved to `done/` at CS15e close-out.
**Depends on:** CS04 (CLI dispatcher)

## Goal

When a consumer runs `harness init` against a repo, detect upfront whether the consumer's GitHub repo is private + on the free tier, and surface the same disposition options that LRN-001 forced for `agent-harness` itself: discipline-only enforcement / upgrade to GitHub Pro / flip-public-when-ready. Avoid the mid-init "wait, I can't enable branch protection" surprise.

## Deliverables

- [ ] `harness init` queries the consumer repo's visibility (`gh api repos/{owner}/{repo}` → `visibility`) and account tier (`gh api users/{owner}` → `plan.name`)
- [ ] If repo is `private` AND owner plan is `free`, print a clear notice + the three disposition options
- [ ] Generate a `.harness-known-constraints.md` artifact in the consumer repo recording the detected constraints + chosen disposition
- [ ] Hook the disposition into `harness.config.json` so subsequent `harness sync` and `harness lint` adapt accordingly (e.g., don't try to set Ruleset checks if the consumer chose discipline-only)
- [ ] Document in `template/managed/INSTRUCTIONS.md` how consumers should re-evaluate the disposition over time

## Exit criteria

- New consumer repo on `private` + `free` runs `harness init` → sees the constraint surfaced before any file is written
- `.harness-known-constraints.md` exists post-init and is referenced from the consumer's CONTEXT.md
- Sub Invaders (CS16) flow exercises this path

## Notes

This is an opt-in pre-emptive UX improvement, not a hard blocker. Sub Invaders (CS16) would still work without it — just less smoothly.

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per OPERATIONS.md § Claim) | planned | — | — |
| Close-out: docs + restart-state (CONTEXT/WORKBOARD/HANDOFF + relevant docs) | done | yoga-ah (via CS15e) | done in CS15e close-out (umbrella absorbed this CS); see done_cs15e_*.md |
| Close-out: learnings + follow-ups (LEARNINGS.md + planned CSs) | done | yoga-ah (via CS15e) | LRN-092..094 filed in CS15e; no follow-up planned CSs needed (CS04a deliverables fully delivered by CS15e Wave 1 sub-agents γ1–γ5) |

## Plan-vs-implementation review

**Reviewer:** GPT-5.5 (via [CS15e umbrella review](./done_cs15e_init-private-tier-detection.md#plan-vs-implementation-review))
**Date:** 2026-05-10
**Outcome:** GO

This CS was absorbed by the [CS15e umbrella](./done_cs15e_init-private-tier-detection.md) before it was ever independently claimed. CS04a's deliverables (private-tier detection at `harness init` time, `.harness-known-constraints.md` artifact, `harness.config.json` `constraints` block, INSTRUCTIONS.md re-evaluation guidance) were implemented as Wave 1 sub-agents γ1, γ2, γ3, γ5 plus orchestrator γ4 in CS15e and reviewed there. See CS15e's plan-vs-implementation review for the full analysis (initial NEEDS-FIX → re-review GO after fixes commit `27f56ae`).
