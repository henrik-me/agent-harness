# CS04a — `harness init` detects private-repo / free-tier constraints

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** [LRN-002](../../../LEARNINGS.md#lrn-002-2026-05-02-process-cs01) at CS01 close-out
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
