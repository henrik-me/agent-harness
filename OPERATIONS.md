# OPERATIONS (proto, CS01)

Day-to-day procedures. Hand-maintained until CS11. Canonical version authored in CS08 as `template/composed/OPERATIONS.md`.

## Claim

**Bootstrap exception (CS01 only):** the very first commit landing this repo's skeleton + proto docs is a direct push to `main`, since branch protection is configured immediately after. **No other direct pushes to `main` are permitted from commit 2 onward.**

From commit 2 onward, **everything** — including WORKBOARD claim/closeout — goes through PRs.

### Until CS15a (small-PR claim model)

Until CS15a configures the auto-approve bot (per [Decision #23 in cs-plan](../project/clickstops/active/active_cs01_bootstrap-repo/harness-cs-plan.md)), WORKBOARD claim/closeout PRs are **normal small PRs with user review** — same review loop as any other PR. No automation; just small scope.

1. Pull main: `git pull origin main --rebase`.
2. Create branch: `git checkout -b workboard/cs<NN>-claim`.
3. Edit `WORKBOARD.md`: add your row to the **Active Work** table with CS-Task ID, branch, agent ID, state, last updated.
4. Rename the CS file: `git mv project/clickstops/planned/planned_cs<NN>_<slug>.md project/clickstops/active/active_cs<NN>_<slug>.md` (or use the directory form per [TRACKING.md § Clickstop lifecycle](TRACKING.md#clickstop-lifecycle) for artifact-bearing CSs).
5. Commit: `Claim CS<NN>` with the `Co-authored-by: Copilot` trailer.
6. Push branch; open PR labeled `workboard-only`; user reviews; squash-merge.

### From CS15a onward (tiny auto-merged PRs)

Same shape as above, but the `workboard-auto-approve.yml` workflow + GitHub App / bot identity verifies path-restriction + label + actor allowlist and auto-approves + auto-merges. Global "Require ≥1 approving review" stays in force; the bot's review satisfies it.

## Dispatch

Branch from main: `git checkout -b cs<NN>/<slug>`. All implementation work happens on this branch; sub-agents may be dispatched per the parallelisation table in the CS plan.

## Handoff

If you need to leave a CS in the middle: update WORKBOARD with `state=blocked` (or `paused`) and a brief reason; commit. Another orchestrator can pick it up after the documented `reclaimable` threshold (default 7d).

## Sync (consumer-only, not applicable to harness repo until CS11)

`harness sync` (CS04+) updates managed/composed files in a consumer repo from the pinned harness version. Do not run mid-CS unless fixing a harness blocker.

## Harvest

- **Weekly cadence:** Monday morning, run `harness harvest` (CS04+) and review LEARNINGS.md.
- **Before-claim cadence (CS04+):** `harness harvest` runs automatically as part of `claim`; prompts user only if stale `open` learnings tagged `process` or `architectural` exist (or learnings tagged with the claim-area metadata).
- See [RETROSPECTIVES.md](RETROSPECTIVES.md) for the full procedure and disposition states.

## Models used

| Role | Model |
|---|---|
| Orchestrator | Claude Opus 4.7 1M |
| Mechanical sub-tasks | Claude Haiku 4.5 |
| Non-trivial sub-tasks | Claude Sonnet 4.6 |
| Local review (primary) | GPT-5.5 |
| Local review (fallback, non-high-risk) | Claude Sonnet 4.6 (with independence invariant — see REVIEWS.md) |

## Bootstrap exception (CS01 only)

The very first commit to `main` (the layout + proto docs landing this CS) is a direct commit before branch protection is configured. This is a one-time exception, recorded here. **From the second commit onward, branch protection (PR-required) is in force — including for WORKBOARD claim/closeout PRs (small PRs with user review until CS15a, tiny auto-merged PRs from CS15a).**
