# CS106 — #395 Rec B: promote workboard-only review-evidence to a REQUIRED status check + set required_approving_review_count = 0

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** CS91 deliverable 4 / C91-5 (2026-07-04 by `yoga-ah`) — #395 **Rec B**, deferred by CS91 as a repo-wide branch-protection posture change with blast radius beyond one workflow. Cross-links the broader open issue [#402](https://github.com/henrik-me/agent-harness/issues/402) (configurable review-enforcement posture) and CS90's CI-gate architecture ADR.
**Depends on:** **CS90** (HARD) — the *always-running review-evidence aggregate* status context that CS106 promotes to required is delivered by CS90's CI-gate work stream (or its designated follow-up sub-CS): CS90 scopes the ADR + `review-gates.yml` feature-parity / migration path under which such an aggregate lands. Today's `review-gates.yml` runs the content-review gates as **separate per-gate jobs that SKIP on the `workboard-only` label** (CS63), so it exposes **no single always-present aggregate context** to require (requiring a skipped job would leave its context absent/pending on workboard-only PRs and deadlock them — see Background + R2). CS106 therefore lands **after** that aggregate exists (or falls back to the existing safe `read-only-gates`/`pr-evidence-lint` context per C106-1).

## Goal

Remove the need for any approving-review token / GitHub App / PAT / admin bypass on **workboard-only** PR merges by making the review-evidence aggregate a **required status check** in the managed branch-protection ruleset and then setting `required_approving_review_count = 0`. Today a workboard-only PR must obtain one approving review (supplied by the bot path in `workboard-auto-approve.yml`, or by a maintainer admin override); Rec B replaces "needs an approval" with "needs the review-evidence check to pass" — which CI already computes — so no approver identity (and thus no App/PAT/bypass) is required.

## Background

Filed from inbound issue **#395 Rec B** (state: open; verify via `gh issue view 395` at claim-time HEAD). CS91 (parent) landed #395 Rec A (admin-override = zero-secret default) + Rec C (bounded `workboard/maint-*` auto-merge pattern) but explicitly deferred Rec B (C91-5) because it changes repo-wide merge policy.

Current posture (re-verify at claim-time HEAD — F6 state-of-the-world probe):

- Branch protection on `main` requires one approving review by default (self-host public protected phase — see INSTRUCTIONS.md local block "Repository claiming phases").
- `workboard-auto-approve.yml` (a `pull_request_target` workflow) validates workboard-only PRs and, where an App/PAT is configured, supplies the approving review + enables auto-merge; otherwise the maintainer admin-merges (CS91 Rec A made admin-merge the documented zero-secret default).
- The review-evidence policy is enforced by two workflows with **different required-check safety**: `review-gates.yml` runs the content-review gates as **separate per-gate jobs** (`copilot-review-attached`, `review-log-evidence`, `independence-invariant`, `review-threads-resolved`) that deliberately **SKIP** on the `workboard-only` label (CS63) — so it exposes **no single always-present aggregate status context**, and requiring any of its skipped jobs would leave that context absent/pending (deadlock) on workboard-only PRs. `pr-evidence-lint.yml` / `read-only-gates` computes the workboard-only allowlist check and the evidence gates and **resolves to success for a labelled in-allowlist workboard-only PR** while still enforcing on content PRs — i.e. it is the currently-safe context.

Consistency note (F5): #402 and CS90 explicitly flag today's `review-gates.yml` as **not yet safe** as a required status context and assign the **always-running aggregate** to CS90's CI-gate work stream (the ADR + `review-gates.yml` parity/migration path, or its designated follow-up sub-CS) — CS106 must not assert that a safe review-gates aggregate already exists.

Related: broader open issue **#402** (configurable review-enforcement posture: `human-approval | required-check | both`) is a superset of Rec B; **CS90** owns the CI-gate architecture ADR + `harness-pr-check pr_check.mode` + `review-gates.yml` parity. CS106 should be the concrete "required-check + count-0" instance that #402 / CS90's doctrine enables, not a parallel design.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C106-1 | What becomes the required check | Promote an **always-running review-evidence aggregate** status context — one that (i) enforces review-evidence on content PRs and (ii) reports **success/neutral** (never skipped/absent/pending) on labelled in-allowlist workboard-only PRs — to REQUIRED in the ruleset. **No such single aggregate context exists today** (`review-gates.yml`'s per-gate jobs skip on workboard-only); it is a **CS90** deliverable, so CS106 requires the CS90 aggregate context **by name once it exists**, OR — as an interim — requires the existing `read-only-gates`/`pr-evidence-lint` context, which already runs-and-passes on valid workboard-only PRs and enforces on content PRs. | A required context must be **present and conclusive for every PR class** or it deadlocks the classes where it is skipped; today's `review-gates.yml` per-gate jobs fail that test. |
| C106-2 | Approval count | Once C106-1's required check is in place and proven green on `main`, set `required_approving_review_count = 0` in the ruleset. | With the required check enforcing review-evidence, an approving-review count is redundant; dropping it to 0 removes the App/PAT/admin-bypass dependency for workboard-only merges. |
| C106-3 | Migration order / deadlock safety | Apply strictly ordered: (1) confirm the chosen required context **always runs and reports success/neutral for all PR classes — especially labelled in-allowlist workboard-only PRs — and enforces on content PRs** (not merely "green on `main` once"); (2) prove it green on `main`; (3) add it to the ruleset as required; (4) only then drop approval-count to 0. NEVER require a context that is label/path-conditionally **skipped** (absent/pending on some PR class) — it would deadlock those PRs. Document the rollback (re-raise count to 1, de-require the check). | A required status check that is skipped or can't pass on some PR class blocks those merges; the "always-runs-for-all-classes" precondition + ordering prevents a self-inflicted repo-wide (or workboard-only) merge freeze. |
| C106-4 | Coherence with the workboard-only skip (CS63) | The required context MUST resolve to **success** (not skipped/absent/pending) for a labelled, in-allowlist workboard-only PR. Deliverable 3 requires an explicit probe of the **exact required-context name** on such a PR (inspect a real workboard-only PR's checks / the aggregate's conclusion) BEFORE the count→0 flip. The currently-safe context for this is `read-only-gates`/`pr-evidence-lint` (verified to exit success on valid workboard-only PRs); `review-gates.yml`'s per-gate jobs are NOT safe (they skip). | A required context that is "pending"/absent (not "success") on workboard-only PRs would deadlock the very PRs Rec A/C streamlined; the probe against the concrete context name — not an assumed aggregate — is the gate. |
| C106-5 | Scope boundary vs CS90 / #402 | CS106 delivers the concrete required-check + count-0 posture for THIS repo's ruleset; the generalised, consumer-configurable posture surface (`pr_check.mode`, `human-approval | required-check | both`) stays with CS90 / #402. Cross-link, do not duplicate. | Keeps blast radius bounded to a single deliberate posture change; avoids re-designing the configurable framework here. |

## Deliverables

1. Ruleset posture change (self-host): the chosen **always-running review-evidence context** — the CS90 aggregate (preferred) or the interim `read-only-gates`/`pr-evidence-lint` context (C106-1) — promoted to a REQUIRED status check on `main`, then `required_approving_review_count` set to 0 — applied in the documented migration order (C106-3). The active protection surface is the `main-protection` **ruleset** (branch-protection API returns 404), so the change is a ruleset edit (`gh api repos/<owner>/<repo>/rulesets/<id>` or the managed-ruleset surface if one exists) — the exact steps recorded in the CS file.
2. Doctrine update coordinated with CS90's CI-gate ADR + the INSTRUCTIONS.md local block "Repository claiming phases" review-mapping: document that workboard-only merges rely on the required review-evidence check (count 0), with admin-override as the zero-secret fallback (CS91 Rec A).
3. Coherence probe (C106-4): confirm by a real check-inspection that the **exact required-context name** resolves to **success** (not skipped/absent/pending) on a labelled, in-allowlist workboard-only PR — AND enforces on a content PR — BEFORE flipping the approval-count to 0.
4. `CHANGELOG.md` `[Unreleased]` entry. #395 referenced for auto-close (Rec B portion).

## User-approval gates

- **G106-1** — approve the branch-protection posture change (promote review-evidence to a required check AND drop `required_approving_review_count` to 0 on `main`) before applying it to the live ruleset. Blast radius: repo-wide merge policy; a mis-ordered apply can freeze all merges (C106-3).

## Exit criteria

1. The chosen review-evidence context **always runs and reports success/neutral for all PR classes (especially labelled in-allowlist workboard-only PRs) and enforces on content PRs**, is a required status check on `main`, and `required_approving_review_count = 0` — applied in the C106-3 order after the check was proven green on `main`.
2. A labelled, in-allowlist workboard-only PR merges with NO approving review, NO App/PAT, NO admin bypass — the required check alone gates it (C106-2 / C106-4).
3. A content PR still cannot merge without its review-evidence check passing (the posture does not weaken content-PR review).
4. Doctrine (CS90 ADR cross-link + INSTRUCTIONS local block) updated; rollback documented. `harness lint` + `node --test tests/*.test.mjs` green; `sync --mode=check` clean.
5. Plan-vs-implementation review (GPT-5.5) GO.

## Risks + open questions

| # | Risk / what breaks | Mitigation |
|---|---|---|
| R1 | Adding a never-green required check freezes ALL merges (including the PR that adds it). | C106-3 strict order: prove green on `main` first, add-as-required second, drop approval-count third; document rollback (raise count to 1, de-require). |
| R2 | Workboard-only PRs skip content gates (CS63); `review-gates.yml`'s per-gate jobs are skipped → a required context on any of them is absent/pending on workboard-only PRs → deadlocks the very PRs Rec A/C streamlined. | C106-1 requires an **always-running aggregate** (CS90) or the safe `read-only-gates`/`pr-evidence-lint` context (which exits success on valid workboard-only PRs); C106-4 probe confirms success on a real workboard-only PR before count→0. |
| R3 | Overlap/contradiction with CS90 (#402 configurable posture) if built independently; CS106's required context is itself a CS90 deliverable. | **Hard** Depends-on-CS90 + C106-5 scope boundary; land after CS90 and name its aggregate context; do not re-design the configurable framework here. |
| R4 | Dropping approval-count to 0 weakens content-PR review if the required check is mis-scoped. | Exit criterion 3: content PRs stay gated by their review-evidence check; the required check encodes content-review evidence, not a rubber stamp. |
| Q1 | Does the harness manage the ruleset programmatically, or is it a manual `gh api` step? Determines whether deliverable 1 is a config change or documented steps. | Resolve at claim-time recon; probe for a managed-ruleset surface in the repo. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | cs106-plan-review (yoga-ah) | 23e6bf40476f | 2026-07-04T02:50:00Z | Needs-Fix | C106-1 named a review-gates.yml aggregate that doesn't exist and skips on workboard-only; migration/coherence didn't require the context to run+pass for all PR classes. |
| R2 | gpt-5.5 | claude-opus-4.8 | cs106-plan-review-r2 (yoga-ah) | 257384654a2e | 2026-07-04T02:57:00Z | Go-with-amendments | R1 blockers resolved (CS90 aggregate/interim read-only-gates, always-runs precondition, exact-context success probe before count→0). Minor: aggregate ships via CS90 work stream/follow-up — applied. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per § Claim) | planned | — | — |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
