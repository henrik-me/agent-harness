# CS23 — Apply LRN-100: add `types: [edited]` to harness-self-check `pull_request:` trigger

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** Pre-CS16 disposition of [LRN-100](../../../LEARNINGS.md#lrn-100) (CS22 close-out, 2026-05-10) per the [INSTRUCTIONS.md § Pre-claim gate](../../../INSTRUCTIONS.md#claiming-a-cs). Authored 2026-05-11 by `yoga-ah`. Recommended fix in the LRN itself: a one-line addition to `.github/workflows/harness-self-check.yml`. This CS executes that fix and adds a regression test so the trigger contract is mechanically locked.
**Depends on:** None. May claim independently of CS16 / CS21.

## Goal

Make `gh pr edit --body` re-trigger the `pr-body` job in `.github/workflows/harness-self-check.yml` so orchestrators no longer need to manually `gh run rerun <id> --failed` (or push an empty commit) after fixing a body-only failure.

## Background

Per [LRN-100](../../../LEARNINGS.md#lrn-100) (verbatim summary):

- The `pull_request:` trigger in `.github/workflows/harness-self-check.yml` uses default activity types: `opened`, `synchronize`, `reopened`. The `edited` type is **not** included.
- When a PR body is fixed in place via `gh pr edit <num> --body-file <path>`, the workflow does not re-run, and the cached `FAILURE` status check remains visible — even though the body is now valid (verified locally with `node scripts/check-pr-body.mjs`).
- Observed on PR #110 (2026-05-10). Workaround `gh run rerun 25642102623 --failed` cleared the failure within ~30s.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C23-1 | Trigger expansion scope | Add `types: [opened, synchronize, reopened, edited]` only to **`harness-self-check.yml`**. Leave other workflows (`harness-self-check-via-reusable.yml`, `private-smoke.yml`, `release.yml`, `workboard-auto-approve.yml`, etc.) unchanged unless the harvest below surfaces a parallel failure mode. | LRN-100 evidence is specific to `harness-self-check.yml`; expanding triggers on workflows that don't gate on PR body content would needlessly increase Actions usage with no benefit. |
| C23-2 | Bot-edit guarding | No additional `if:` guard on the `pr-body` job. The existing job-level `if: github.event_name == 'pull_request'` is sufficient — `edited` is still a `pull_request` event, and the only "bot-edit" risk is Dependabot, which doesn't edit PR bodies post-open in normal operation. | Keeps the change minimal (one-line); aligns with LRN-100's explicit note. |
| C23-3 | Regression-test approach | Add a fixture-based test in `tests/cs23-pr-body-trigger.test.mjs` that parses `.github/workflows/harness-self-check.yml` with `js-yaml` and asserts `on.pull_request.types` contains `'edited'`. No need to simulate the actual GitHub event — the test guards the workflow contract, which is the only mechanism by which LRN-100 can regress. | Mirrors the pattern in `tests/cs12-workflows.test.mjs` and `tests/cs14-release-workflow.test.mjs` (workflow-shape assertions via `js-yaml`). |
| C23-4 | Other workflows audit | As part of CS23, grep all `.github/workflows/*.yml` for `pull_request:` triggers without explicit `types:` and record findings in the active CS file's Notes section. Items where `edited` would matter (i.e. workflows that parse PR body / title / reviewer set) are filed as follow-up tasks; items where it would not (e.g. CI build workflows that only depend on the head SHA) are noted as "no action needed". | Cheap audit while we're already touching this surface; prevents LRN-100 from recurring elsewhere unnoticed. |
| C23-5 | LRN-100 status flip | At CS23 close-out, flip [LRN-100](../../../LEARNINGS.md#lrn-100) frontmatter `status: open` → `applied` and append a "Disposition update" line referencing the CS23 close-out commit SHA. | Standard learning-lifecycle disposition per [OPERATIONS.md § Harvest](../../../OPERATIONS.md#harvest). |

## Deliverables

1. **Workflow edit:** `.github/workflows/harness-self-check.yml` — change the `pull_request:` block from:
   ```yaml
   pull_request:
     branches: [main]
   ```
   to:
   ```yaml
   pull_request:
     branches: [main]
     types: [opened, synchronize, reopened, edited]
   ```
2. **Regression test:** `tests/cs23-pr-body-trigger.test.mjs` — minimum 2 assertions:
   - `on.pull_request.types` is an array that includes `'edited'`.
   - `on.pull_request.types` includes the three default types as well (`opened`, `synchronize`, `reopened`) so we don't accidentally narrow the trigger surface.
3. **CHANGELOG.md** entry under `## [Unreleased]` `### Fixed` (per [LRN-101](../../../LEARNINGS.md#lrn-101) pilot, if that pilot lands first; else the entry waits for the next release-cut CS).
4. **Audit notes** in active CS file's Notes section listing every workflow's `pull_request:` trigger shape (per C23-4).
5. **LRN-100 status flip** to `applied` with disposition-update note (per C23-5).

## Sub-agent fan-out

Single orchestrator-owned CS — no fan-out warranted (one workflow line + one test file).

## Exit criteria

CS23 close-out is permitted only when **all** of the following are true and recorded in the active CS file's `## Plan-vs-implementation review` section:

1. `.github/workflows/harness-self-check.yml`'s `on.pull_request.types` includes `edited`.
2. `tests/cs23-pr-body-trigger.test.mjs` exists and passes.
3. `node --test tests/*.test.mjs` exits 0 with the new test included; total count is `prior + ≥2`.
4. `node bin/harness.mjs lint --quiet` exits 0 (24/0/3 baseline unchanged).
5. `node bin/harness.mjs sync --mode=check --cwd .` reports `No drift detected`.
6. The CS23 content PR's own `pr-body` job is observed to **re-fire** after a `gh pr edit --body-file` round-trip (manual verification at content PR time — record run IDs in active CS file Notes for the close-out audit).
7. Audit per C23-4 is recorded; any follow-up items are filed as their own planned CS (do **not** inline into CS23).
8. [LRN-100](../../../LEARNINGS.md#lrn-100) frontmatter `status` is flipped to `applied` and a disposition-update note links to the CS23 content PR.
9. CHANGELOG.md `[Unreleased] / Fixed` lists this fix (per [LRN-101](../../../LEARNINGS.md#lrn-101) pilot if active).

## Risks + open questions

- **R1 (low):** Re-running the workflow on every `edited` event may slightly increase Actions minutes for a public repo. For `henrik-me/agent-harness` this cost is negligible (Actions are free for public repos; the workflow is small).
- **R2 (low):** Some PR-body edits (e.g. mid-PR conversation note appends) will trigger a redundant lint pass. This is acceptable — every `edited` event is a real change that could affect the lint result.
- **OQ1:** Should the test also assert the same shape on `harness-self-check-via-reusable.yml`? **Default:** no — it has no `pr-body` job and is gated separately. Document the rationale in the test file as a comment.

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per [OPERATIONS.md § Claim](../../../OPERATIONS.md#claim)) | planned | — | — |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
