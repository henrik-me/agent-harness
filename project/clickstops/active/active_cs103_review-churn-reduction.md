# CS103 — Reduce content-PR review churn: auto-rerun read-only-gates on Copilot review + leaner review-sequencing doctrine

**Status:** active
**Owner:** yoga-ah
**Branch:** cs103/content
**Started:** 2026-07-03
**Closed:** —
**Filed by:** yoga-ah (orchestrator, Claude Opus 4.8), 2026-07-03, from GitHub issue #424 (`enhancement`, `harness-orchestrator`; surfaced from consumer `henrik-me/authzandentitlements` CS10, LRN-018/020). First-hand-reproduced during CS100 (#421): the async Copilot review left `read-only-gates` red and required a manual `gh run rerun`, and Copilot re-emitted its full comment set on each re-engage.
**Depends on:** none

## Goal

Reduce the recurring friction of driving a content PR to merge, on two fronts:

1. **CI (issue #424a):** the Copilot review lands **asynchronously** (~3 min) *after*
   the push-triggered `read-only-gates` job has already run, so the A5+A16 Copilot
   gate fails on first run and the orchestrator must manually
   `gh run rerun <id> --failed` once Copilot's review arrives. Make the gate
   **re-run automatically** when the Copilot (or any) review is submitted.
2. **Doctrine (issue #424b):** codify a **leaner review-sequencing** procedure in
   `REVIEWS.md` that bounds the fix→re-attest→re-engage loop and prevents
   already-fixed Copilot comments from being re-fixed on re-raise.

## Background

- **Issue #424** (verified OPEN at plan time: `gh issue view 424 --json state` → `"OPEN"`).
- **Current CI shape (verified at plan HEAD):**
  - `read-only-gates` lives in the **managed** workflow
    `.github/workflows/pr-evidence-lint.yml` (rendered/copied verbatim from the
    template source `template/managed/.github/workflows/pr-evidence-lint.yml`).
    Only the **root** path is listed in `harness.config.json` `managed.files`;
    the `template/managed/...` file is the source it is copied from, and the two
    must stay **byte-identical** — the managed-file sync/drift check
    (`sync --mode=check`) fails on any divergence. Its `on:` triggers are
    `pull_request` (types
    `opened, synchronize, reopened, edited, labeled, unlabeled`, branches `[main]`)
    and `workflow_dispatch` (the `mutation-engage` job only).
  - The `read-only-gates` job is gated `if: github.event_name == 'pull_request'`.
    It runs a **read-only** step (B1+A3+A4+A6, `continue-on-error: false`, no
    `--repo`/`--pr` so A5+A16 are skipped) and a separate `copilot-gate` step
    (A5+A16 via `scripts/check-copilot-review.mjs`, `continue-on-error: true`),
    then an `annotate-copilot-outcome` step that `exit 1`s the job when the
    Copilot gate failed and the PR is not fork-sourced. Comment at lines 180–185
    documents ADR4-8: this workflow **verifies** Copilot engagement; because
    Copilot's pipeline is asynchronous, the first (push-triggered) attempt
    "will always fail first attempt".
  - The job reads `github.event.pull_request.{base.sha,head.sha,number}` — all of
    which are ALSO present on a `pull_request_review` event payload, so the same
    job body works unchanged for that event.
  - `tests/template-pr-evidence-workflow.test.mjs` asserts the managed workflow's
    shape via string extraction (no YAML-parser dep) — the regression-guard home
    for the new trigger.
- **Current doctrine (verified):** `REVIEWS.md` (composed; template source
  `template/composed/REVIEWS.md`) documents review-round calibration in §2.4,
  the `harness review` entry point in §2.4.1, review-family verbs in §2.4.2, the
  A4 stale-diff gate in the §"PR-evidence gates" table (A4 = "latest `Go` row's
  `analyzed_head` equals current HEAD"), and review-thread hygiene in §"Review
  thread hygiene". There is no section that sequences rubber-duck-vs-Copilot to
  minimise churn or that says "resolve, don't re-fix" for Copilot re-raises.
- **First-hand evidence (CS100):** `read-only-gates` went red until a manual
  `gh run rerun` after Copilot's async review; Copilot re-emitted its full
  comment set on each of 3 re-engages (already-fixed items reappeared as fresh
  threads); the final round's re-raises + DRY nits were dispositioned
  "resolve, don't re-fix" to cap the loop. This CS turns that ad-hoc handling
  into doctrine + removes the manual rerun.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Auto-rerun mechanism | Add a `pull_request_review: types: [submitted]` trigger to `pr-evidence-lint.yml` and extend the `read-only-gates` job's `if:` to also fire on that event. | When Copilot (a bot reviewer) **submits** its review, GitHub emits a `pull_request_review` event; re-running `read-only-gates` then re-evaluates A5+A16 against the now-present Copilot review and passes with no manual `gh run rerun`. The job body already reads `github.event.pull_request.*`, which the review-event payload carries, so no other change is needed. |
| 2 | Scope the review-triggered run | Gate the new event in the job `if:` with `github.event.pull_request.base.ref == 'main'` (the `pull_request_review` trigger has no top-level `branches:` filter). | Keeps parity with the existing `pull_request: branches: [main]` filter so review submissions on non-`main`-targeted PRs don't spawn gate runs. |
| 3 | Idempotency / safety | Do not change the gate LOGIC — the review-triggered run executes the exact same read-only + copilot-gate steps. No new permissions (`contents: read`, `pull-requests: read` suffice). | A re-run is idempotent and cheap; if the submitted review is not yet the Copilot one, the gate simply fails/annotates as before and re-runs again on the next review event. Fork-source PRs keep their existing fork skip path. |
| 4 | Doctrine placement | Add a new `REVIEWS.md` subsection **§2.4.3 "Leaner review sequencing"** (after §2.4.2), in the composed source `template/composed/REVIEWS.md` and the rendered root, kept in lockstep. | §2.4 already covers review-round calibration; the sequencing guidance is its natural neighbour. Composed-doc edits touch both the template and the rendered root (self-host invariant). |
| 5 | Doctrine content | Codify: (a) complete the rubber-duck to **Go before the first Copilot engage**; (b) batch review fixes into **minimal commits**; (c) after the **final** Copilot re-engage, **resolve all threads and merge without further commits** — with the explicit carve-out that a **genuinely new *blocking* finding still triggers the normal fix → re-attest (a fresh local Go at the new HEAD, A4) → re-engage cycle**; the "no further commits" rule applies to **re-raises of already-addressed items and non-blocking style nits**, never to a new real bug; (d) treat Copilot `COMMENTED` re-raises of already-fixed items (and test-guarded style nits) as **resolve, don't re-fix**; (e) note that Decision-1's CI auto-rerun removes the manual `gh run rerun`. | Directly the #424b ask; each clause maps to a CS100 pain point. Bounds the unbounded fix→re-attest→re-engage loop **without** suppressing genuine new bugs — the loop is capped only for re-raises and cosmetic nits, which is where CS100's churn actually came from. |
| 6 | Optional A4 carry-forward | **Deferred (non-goal).** Do NOT implement the optional "A4 carries a Go forward when the tree (not just HEAD) is unchanged". Record it as a follow-up. | The issue marks it **optional**; changing A4's stale-diff semantics touches `scripts/checks/check-review-log-evidence.mjs` and the stale-diff doctrine (a higher-risk, separable change). Keeping this CS to the trigger + doctrine keeps it low-risk and reviewable; the auto-rerun (D1) already removes the dominant churn source. |
| 7 | Regression test | Extend `tests/template-pr-evidence-workflow.test.mjs` with assertions that the managed workflow declares the `pull_request_review` `submitted` trigger AND that `read-only-gates`' `if:` references `pull_request_review`. | The existing test is the shape-guard for this workflow; a structural assertion prevents a future sync/edit from silently dropping the trigger. |
| 8 | SemVer | **Minor** — a consumer-visible managed-workflow behaviour change (new trigger) that consumers adopt on their next `harness sync`. | New CI behaviour shipped to consumers via the managed workflow; additive, not breaking. |

## Deliverables

1. **`template/managed/.github/workflows/pr-evidence-lint.yml`** + the rendered root
   **`.github/workflows/pr-evidence-lint.yml`** (edited, kept identical): add
   ```yaml
   pull_request_review:
     types: [submitted]
   ```
   under `on:`, and change the `read-only-gates` job guard to
   `if: github.event_name == 'pull_request' || (github.event_name == 'pull_request_review' && github.event.pull_request.base.ref == 'main')`.
   A short comment references #424/ADR4-8 (async Copilot → auto-rerun on review
   submission). No change to the gate steps, permissions, or the `mutation-engage`
   job.
2. **`tests/template-pr-evidence-workflow.test.mjs`** (edited): add ≥2 assertions —
   (a) the workflow's `on:` block contains a `pull_request_review:` trigger with
   `types: [submitted]`; (b) the `read-only-gates` job's `if:` mentions
   `pull_request_review`. Use the file's existing string-extraction helpers
   (no new YAML dependency).
3. **`template/composed/REVIEWS.md`** + the rendered root **`REVIEWS.md`** (edited,
   kept in lockstep): add **§2.4.3 "Leaner review sequencing"** capturing
   Decision-5 (a)–(e), cross-referencing §2.4 (calibration), the A4 stale-diff
   gate, and §"Review thread hygiene". Note the CI auto-rerun (Deliverable 1) as
   the mechanism that removes the manual `gh run rerun`.
4. **`CHANGELOG.md`** `[Unreleased]`: an **Added** entry (auto-rerun trigger) and a
   **Documentation** entry (leaner-sequencing doctrine), each referencing #424.
5. **Green gates:** `node bin/harness.mjs lint` exits 0; `node bin/harness.mjs
   sync --mode=check` reports no drift (template == root for the workflow and
   REVIEWS.md); `node --test tests/*.test.mjs` green with the new assertions.

## User-approval gates

- None beyond the standard review loop. Additive CI trigger + doctrine text; no
  destructive change, no change to gate pass/fail logic.

## Exit criteria

- The managed workflow (template + root) declares `pull_request_review: [submitted]`
  and the `read-only-gates` job fires on it (base=`main`), so a Copilot review
  submission auto-re-runs the gate — verified by the regression test.
- `REVIEWS.md` (template + root) carries §2.4.3 with the five sequencing clauses.
- CHANGELOG updated; `harness lint`, `sync --mode=check`, and the full test suite green.
- The optional A4 carry-forward is explicitly recorded as a deferred follow-up.

## Risks + open questions

- **Review-event volume.** Every review submission (incl. human/rubber-duck
  comment-reviews if posted as GitHub reviews) triggers a gate re-run. This is
  idempotent and cheap (read-only), and the `base.ref == 'main'` guard bounds it
  to content PRs; acceptable.
- **`pull_request_review` payload completeness.** The event carries
  `pull_request.{base,head,number}` used by the job; confirmed against the GitHub
  event schema. No reliance on `pull_request` fields absent from the review event.
- **Managed-file drift.** The workflow is managed — the template source and the
  rendered root must stay byte-identical or `sync --mode=check` fails. Both are
  edited together and verified.
- **Non-goal:** the optional A4 tree-unchanged carry-forward (Decision 6) is
  deferred; the auto-rerun already removes the dominant manual-rerun churn.

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | rubber-duck dispatched | f687d6d0c07f | 2026-07-03T23:17:00Z | Needs-Fix | Blocking: Background wrongly claimed both workflow files in managed.files (only root); Decision 5 ambiguous re new vs re-raised findings. Trigger premise sound. |
| R2 | gpt-5.5 | claude-opus-4.8 | rubber-duck dispatched | a974830378cc | 2026-07-03T23:21:26Z | Go | R1 blockers fixed (managed.files wording; Decision 5(c) carves out new-blocking → fix/re-attest/re-engage); no residual; pull_request_review trigger + payload premise re-verified. |

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | yoga-ah |
| Reviewer agent | rubber-duck (orchestrator: yoga-ah) |
| Notes | **Minor** SemVer (consumer-visible managed-workflow trigger change). Independence per REVIEWS § 2.3 — reviewer `gpt-5.5` ≠ implementer `claude-opus-4.8`. Plan reviewed by gpt-5.5 (R1 Needs-Fix → R2 Go, hash `a974830378cc`). Finalized at close-out. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1 — `pr-evidence-lint.yml` (managed template + rendered root): add `pull_request_review: [submitted]` trigger + extend `read-only-gates` `if:` (base=main) (D1/D2/D3) | active | yoga-ah | agent-id=cs103-impl \| role=implementer \| report-status=pending \| learnings=0 |
| T2 — `tests/template-pr-evidence-workflow.test.mjs`: assert the new trigger + job-if (D7) | active | yoga-ah | agent-id=cs103-impl \| role=implementer \| report-status=pending \| learnings=0 |
| T3 — `REVIEWS.md` §2.4.3 leaner review sequencing (composed template + root) + `CHANGELOG.md` (D4/D5) | active | yoga-ah | agent-id=yoga-ah \| role=orchestrator \| report-status=pending \| learnings=0 |
| Independent content review (GPT-5.5) | pending | — | reviewer model ≠ implementer (independence per REVIEWS § 2.3); via `harness review` |
| Close-out: docs + restart state | pending | yoga-ah | Update WORKBOARD.md (remove CS103 row) + CONTEXT.md; rendered composed/managed mirrors updated. |
| Close-out: learnings + follow-ups | pending | yoga-ah | File the deferred A4 tree-unchanged carry-forward as a follow-up (LEARNINGS or planned CS); #424 auto-closes on merge. |

## Notes / Learnings

## Plan-vs-implementation review

> _(filled at close-out per the gate)_
