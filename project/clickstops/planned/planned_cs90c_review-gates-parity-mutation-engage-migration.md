# CS90c — #393 L4: `review-gates.yml` parity (least-privilege `mutation-engage` + bot/fork skip-reasons + optional aggregate mode) + migration mapping

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** CS90 deliverable 2 / C90-6 (2026-07-05 by `yoga-ah`) — implements inbound issue [#393](https://github.com/henrik-me/agent-harness/issues/393) under the layering model fixed by [ADR-0005](../../../docs/adr/0005-ci-drift-review-gate-layering.md) (L4). One of the three mandatory sub-CSs split from CS90 (C90-6).
**Depends on:** **CS90** (HARD) — [ADR-0005](../../../docs/adr/0005-ci-drift-review-gate-layering.md) fixes the L4 parity scope, the `mutation-engage` least-privilege posture (C90-4), and the migration mapping (C90-5). Do NOT claim before user-approval **G90-1** (ADR layering model + CS90a/b/c breakdown) is granted.

## Goal

Implement the **L4** parity from ADR-0005: port from `pr-evidence-lint.yml` into `review-gates.yml` (1) a least-privilege `mutation-engage` Copilot-engagement job, (2) the full **bot-author + fork-source** skip-reason set (today `review-gates.yml` skips only on `workboard-only`, so Dependabot and fork PRs false-fail its gates), and (3) an optional **single-context aggregate mode**; plus ship the documented old→new required-status-context migration mapping (ADR-0005 §"Migration mapping"). Close #393.

## Background

Filed from inbound issue **#393** (state: open — re-verify `gh issue view 393` at claim-time HEAD, F6). `review-gates.yml` is the split per-gate evolution of the `pr-evidence-lint.yml` aggregator; migrating drops the three capabilities above and requires manual branch-protection ruleset surgery. ADR-0005 fixes the parity scope + posture + mapping; CS90c implements them.

**Also tracks inbound issue [#497](https://github.com/henrik-me/agent-harness/issues/497)** (triaged 2026-07-05, yoga-ah-c2): #497's **Problem 1** — add a `pull_request_review` trigger to `review-gates.yml` so `copilot-review-attached` re-runs when Copilot submits its review — is exactly this CS's decision **C90c-7** (port `pr-evidence-lint.yml`'s `pull_request_review: [submitted]` trigger). #497's **Problem 2** — a `workboard-only` label applied after PR-open leaves a stale pre-label `failure` run — is addressed by **done CS71** (the review-gates evidence jobs now always run and short-circuit internally to success via a step-level `if`, and `review-gates.yml` already re-triggers on `labeled`), so the latest run re-evaluates the label; the implementer should re-verify Problem 2 is closed against the current `review-gates.yml` at claim HEAD and, if any residual pre-label stale-run behaviour remains, fold a `labeled`/`unlabeled` re-evaluation into the C90c-2 skip-reason work. #497 is closed on this CS's merge alongside #393.

Grounding (verify at claim HEAD):

- `review-gates.yml` runs one guard job `validate-workboard-only-scope` + four gate jobs (`review-log-evidence`, `copilot-review-attached`, `independence-invariant`, `review-threads-resolved`), each skipping only on the `workboard-only` condition (label or allowlist-confined diff). It has **no** `mutation-engage` job and computes **no** `bot-author` / `fork-source` skip reasons.
- `pr-evidence-lint.yml` is the parity SOURCE: its `compute-skip-reasons` step derives `workboard-only` + `bot-author` (`[bot]$` login) + `fork-source` (`head.repo != base.repo`); its `mutation-engage` job runs `if: github.event_name == 'workflow_dispatch'`, holds `permissions: { contents: read, pull-requests: write }` on that job ALONE, and runs `gh pr edit "$PR_NUM" --add-reviewer copilot-pull-request-reviewer` (ADR-0004 / ADR4-2 primitive) without checking out PR-head code.
- **Self-host blast radius:** `review-gates.yml` **is** in the self-host `managed.files` set — editing the template regenerates this repo's own review gates. This CS must land its template change with `sync --mode=apply` regeneration and a green self-host PR before relying on the new gates (CS90 R2). `pr-evidence-lint.yml` is also self-host managed.
- **Existing PR-event engagement path:** `review-gates.yml`'s `copilot-review-attached` gate already holds `pull-requests: write` AND uses it — `scripts/checks/check-copilot-review-attached.mjs` posts a best-effort `@copilot review` comment via `gh pr comment` (its `postCopilotComment` helper, ~lines 168-187) when no acceptable Copilot review is present. So `review-gates.yml` **already engages** Copilot on `pull_request` events; adding a `workflow_dispatch` `mutation-engage` job alone does NOT yield a single `workflow_dispatch`-only engagement path — this CS must ALSO make `copilot-review-attached` verification-only (drop the auto-comment + its write scope) so engagement consolidates to the one write-scoped job.
- **Trigger parity:** `review-gates.yml` triggers ONLY on `pull_request`; `pr-evidence-lint.yml` also triggers on `pull_request_review: [submitted]` (base-`main`-guarded) so a Copilot review submitted ~3 min after engagement re-runs verification without a manual rerun. This CS must port that trigger or an engaged review leaves the gate stale/failed.
- Copilot engagement is **asynchronous** (~3 min, ADR4-8): engage on `workflow_dispatch`, verify on a later `pull_request` / `pull_request_review` event — never engage-and-verify in one run.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C90c-1 | Least-privilege `mutation-engage` | Port a `mutation-engage` job into `review-gates.yml` holding ADR-0005 C90-4's posture: (a) `workflow_dispatch`-only trigger; (b) `pull-requests: write` on THAT job ALONE (all other jobs — including `copilot-review-attached` after C90c-6 — must be `pull-requests: read`); (c) an explicit guard that the input `pr_number` is an OPEN PR in the SAME repo (belt-and-suspenders atop `gh pr edit`'s in-repo resolution); (d) never checks out or runs PR-head code. | Restores Copilot engagement in `review-gates.yml` without widening the privileged surface; the explicit OPEN-PR guard is stronger than today's `pr-evidence-lint.yml`. |
| C90c-2 | Full skip-reason set | Port the centralized `compute-skip-reasons` vocabulary — `workboard-only` + `bot-author` (`[bot]$` login) + `fork-source` (`head.repo != base.repo`) — into `review-gates.yml`'s per-gate skip logic so Dependabot and fork PRs no longer false-fail. | Correctness fix: today `review-gates.yml` skips only on workboard-only, so bot/fork PRs false-fail the review gates. |
| C90c-3 | Optional single-context aggregate mode | Add an optional aggregate mode so a consumer can keep ONE required status context (as `pr-evidence-lint.yml`'s `read-only-gates` provides) instead of remapping branch protection to the four gate contexts. Off by default (preserve the split contexts); opt-in. | ADR-0005: the migration off-ramp for consumers who value a single required check; default-preserving so existing split-context consumers are unaffected. |
| C90c-4 | Migration mapping (docs) | Ship the documented old→new required-status-context mapping from ADR-0005 §"Migration mapping" as the MVP. A `harness migrate-ci` helper is a SEPARATE follow-up CS, filed only if the manual mapping proves insufficient — NOT built here (R5). | ADR-0005 C90-5: lowers migration risk with zero net-new CLI surface; a helper is avoidable scope expansion. |
| C90c-5 | Tests + regeneration | Add a skip-reason-matrix test (incl. bot-author + fork-source + workboard-only) and an aggregate-mode-present test; regenerate the self-host `review-gates.yml` via `sync --mode=apply` and confirm `sync --mode=check` clean + green self-host PR before merge. | The skip-matrix is the correctness surface; self-host regeneration is mandatory because the file is self-host managed (R2). |
| C90c-6 | Consolidate Copilot engagement to a single write path | Make `copilot-review-attached` **verification-only** when `mutation-engage` is ported: drop its best-effort `@copilot review` auto-comment (`check-copilot-review-attached.mjs` `postCopilotComment`) and reduce that job to `pull-requests: read`, so exactly ONE job — `mutation-engage` (`workflow_dispatch`-only) — holds `pull-requests: write` and engages Copilot. | `review-gates.yml` ALREADY engages on PR events via the auto-comment (Background); without this, porting `mutation-engage` yields TWO engagement paths, one still PR-event/write-scoped, defeating the least-privilege posture (ADR-0005 §mutation-engage). |
| C90c-7 | Async re-verify trigger parity | Port `pr-evidence-lint.yml`'s `pull_request_review: [submitted]` trigger (with the base-`main` guard) to `review-gates.yml` so a Copilot review submitted ~3 min after `workflow_dispatch` engagement re-runs the verification gate without a manual rerun. | Without it, an engaged review leaves the required gate stale/failed until an unrelated PR event or manual rerun (ADR-0004 ADR4-8 async lifecycle). |

## Deliverables

1. `template/managed/.github/workflows/review-gates.yml` + `scripts/checks/check-copilot-review-attached.mjs` — least-privilege `mutation-engage` job (C90c-1); `copilot-review-attached` made **verification-only** (drop the `@copilot review` auto-comment path, reduce the job to `pull-requests: read`) so `mutation-engage` is the single write-scoped engagement path (C90c-6); the `pull_request_review: [submitted]` re-verify trigger with a base-`main` guard (C90c-7); the `bot-author` + `fork-source` skip-reasons ported into every gate's skip logic (C90c-2); and the optional single-context aggregate mode (C90c-3).
2. The documented old→new required-status-context migration mapping (ADR-0005 §"Migration mapping") surfaced where consumers will find it (ADR-0005 already carries it; add an OPERATIONS.md / migration-doc pointer as needed).
3. Tests (`node --test`) — skip-reason matrix incl. bot-author + fork-source + workboard-only; aggregate-mode present/off; `copilot-review-attached` no longer posts an auto-comment in its default (verification-only) path; the `pull_request_review` re-verify trigger is present.
4. Self-host regeneration: `sync --mode=apply` regenerates the root `review-gates.yml`; `sync --mode=check` clean; a green self-host PR proves the regenerated gates work on this repo.
5. `CHANGELOG.md` `[Unreleased]` entry; issue #393 referenced for auto-close on merge.
6. `harness lint` green; `node --test tests/*.test.mjs` green; `sync --mode=check` clean.

## User-approval gates

- Inherits **G90-1** (ADR-0005 layering model + CS90a/b/c breakdown). CS90c is not claimed until G90-1 is granted.
- **G90c-1** — security review sign-off on the ported `mutation-engage` job (least-privilege posture, OPEN-same-repo-PR guard, no PR-head checkout) before the regenerated self-host `review-gates.yml` is relied upon, given the workflow is self-host managed and holds a write-scoped job.

## Exit criteria

1. `review-gates.yml` engages Copilot via a SINGLE least-privilege path — the `workflow_dispatch`-only `mutation-engage` job (write on that job alone, OPEN-same-repo-PR guard, no PR-head checkout) — with `copilot-review-attached` reduced to verification-only (no auto-comment, read-only), and re-verifies via the ported `pull_request_review: [submitted]` trigger.
2. `review-gates.yml` skips its gates on `bot-author` + `fork-source` + `workboard-only`; Dependabot and fork PRs no longer false-fail.
3. The optional single-context aggregate mode is available (off by default); the migration mapping is documented.
4. Self-host `review-gates.yml` regenerated; `sync --mode=check` clean; the self-host PR's own review gates pass green.
5. Issue #393 closed. `harness lint` + `node --test tests/*.test.mjs` green.
6. Plan-vs-implementation review (GPT-5.5) GO.

## Risks + open questions

| # | Risk / what breaks | Mitigation |
|---|---|---|
| R1 | `review-gates.yml` is self-host `managed.files`; a template change regenerates this repo's OWN review gates and could disrupt this repo's PR gating. | Land the template change with `sync --mode=apply` regeneration + a green self-host PR before relying on the new gates; treat as a mid-CS managed-file change; `sync --mode=check` clean before merge (R2 from CS90). |
| R2 | The ported `mutation-engage` job widens the privileged surface. | C90c-1 posture: `workflow_dispatch`-only, `pull-requests: write` on that job ALONE, OPEN-same-repo-PR guard, no PR-head checkout; **G90c-1** security review; confirm all non-engage jobs — including `copilot-review-attached` after C90c-6 — are `pull-requests: read`. |
| R3 | A per-gate skip-reason refactor could accidentally skip a gate on a content PR (false skip = missed review evidence). | Port the exact `pr-evidence-lint.yml` fail-closed detection (api-error → run the real gate); skip-reason-matrix test asserts content PRs never skip. |
| R4 | Aggregate mode + split contexts both required in a ruleset would double-gate. | Aggregate mode off by default (C90c-3); the migration mapping documents choosing ONE (never both), consistent with ADR-0005 "do not run both L4 workflows". |
| Q1 | Does the aggregate mode reuse `pr-evidence-lint.yml`'s aggregation or add a new aggregate job inside `review-gates.yml`? | Resolve at claim recon against the two workflows; prefer the smallest change that yields one always-present success/neutral context for all PR classes (coherent with CS106's required-check need). |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | cs90-plan-review (yoga-ah) | 0d8c5d589c3b | 2026-07-05T16:55:00Z | Go-with-amendments | B1/B2 (existing @copilot engagement via copilot-review-attached; missing pull_request_review trigger) fixed via C90c-6/C90c-7; verified. Amendment: read-only wording applied. See Notes. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per § Claim) | planned | — | — |

## Notes / Learnings

- **Reference note (C90c-4 "(R5)").** The "(R5)" in decision C90c-4 refers to **CS90's parent-plan risk R5** (the `harness migrate-ci` scope-expansion risk), mirrored from [ADR-0005](../../../docs/adr/0005-ci-drift-review-gate-layering.md) §"Migration mapping" (C90-5) — it is **not** a CS90c-local Risks-table entry (this plan's Risks table is R1–R4 + Q1). Left in the hashed C90c-4 wording as-is; this note supplies the cross-reference.
- **Plan review (pre-claim, two passes).** An initial independent review pass (gpt-5.5, 2026-07-05) returned **Needs-Fix** on two blockers: (B1) `review-gates.yml`'s `copilot-review-attached` gate already engages Copilot on `pull_request` events — `scripts/checks/check-copilot-review-attached.mjs` posts a best-effort `@copilot review` comment via `gh pr comment` — so a `workflow_dispatch`-only engagement posture is NOT achieved by merely adding `mutation-engage`; (B2) `review-gates.yml` lacks the `pull_request_review: [submitted]` re-verify trigger that `pr-evidence-lint.yml` has, so an async Copilot review would leave the gate stale. Both were resolved by adding **C90c-6** (make `copilot-review-attached` verification-only) and **C90c-7** (port the `pull_request_review` trigger), plus the Background / Deliverable 1 / Exit-criterion-1 updates. The recorded attestation (R1 in `## Plan review`, gpt-5.5, **Go-with-amendments**) is the follow-up pass over the fixed plan; its sole amendment — the C90c-1 / R2-risk wording made read-only-consistent with C90c-6 — is applied and covered by the pinned hash.

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
