# CS90 — CI-gate architecture: drift-detection layering doctrine (ADR) + `harness-pr-check` `pr_check.mode` + `review-gates.yml` feature parity & migration path

**Status:** active
**Owner:** yoga-ah
**Branch:** cs90/content
**Started:** 2026-07-05
**Closed:** —
**Filed by:** Triage of three coupled open inbound issues — [#391](https://github.com/henrik-me/agent-harness/issues/391), [#392](https://github.com/henrik-me/agent-harness/issues/392), [#393](https://github.com/henrik-me/agent-harness/issues/393) (2026-07-02 by `omni-ah-c3`). All surfaced from the same `henrik-me/sub-invaders` CI-adoption evaluation (#392/#393 cite v0.12.0 explicitly; #391 is a general drift-layering ask).
**Depends on:** none. (Related workflow-hardening: CS91 edits `workboard-auto-approve.yml`, a different workflow — no file overlap.)

## Goal

Resolve the harness's **CI-gate / drift-detection / review-gate architecture** as one coherent design pass, because the three issues are mutually referential ("Related: H2/H3") and a consumer today must hand-assemble the layers and risk redundant double-gating:

- **#391** — the simplest, highest-signal pattern (a per-PR `sync --mode=check` required check) is left for consumers to hand-author; `harness-drift.yml` (weekly cron) catches drift up to 7 days late. Ship/recommend a minimal per-PR sync-check baseline and reposition the cron as belt-and-suspenders for low-activity repos.
- **#392** — `harness-pr-check.yml` runs `harness lint` **and** a managed/composed-drift classifier; a consumer that already runs `harness lint` as its own required job gets a redundant second run, blocking adoption of the workflow's useful managed-drift classifier + `harness-managed-edit-ack` escape valve. Add a `pr_check.mode` (drift-only vs lint+drift) + an adoption-overlap warning.
- **#393** — `review-gates.yml` (four enforcement gates + one `validate-workboard-only-scope` guard job) drops three things `pr-evidence-lint.yml` provides: Copilot `mutation-engage`, the full **bot-author / fork-source** skip-reason set (Dependabot & fork PRs would false-fail), and a single-context **aggregate mode**; and offers no documented migration path. Port parity + a migration mapping (documented; a `harness migrate-ci` helper only if the ADR proves it essential).

The unifying deliverable is a **drift/CI/review-gate layering ADR** that makes explicit how the layers **compose** (each guards a different aspect of the product/operational cycle), names the one genuine either/or (L4's two implementations of the same gate), and the one redundancy to avoid (the same check run twice) — rather than presenting the layers as a menu to pick one from.

## Background

Filed from inbound issues **#391 / #392 / #393** (all state: open; verified via `gh issue view`). All three are consumer→harness feedback from sub-invaders' v0.12.0 adoption; none is referenced by any existing planned/active/done CS (reference scan, 2026-07-02).

Verified at HEAD `3b20d0a` (template headers read directly):

- `template/managed/.github/workflows/harness-drift.yml` — "scheduled drift detection per CS12 / LRN-074… Runs weekly… `harness sync --mode=check` → on drift, `sync --mode=apply` → opens a PR via peter-evans/create-pull-request." Cron `0 6 * * 1` + `workflow_dispatch`.
- `template/managed/.github/workflows/harness-pr-check.yml` — "consumer PR-time structural gate (CS63a / C63-2)… runs `harness lint` + a file-class drift classifier, FAILING the PR when a managed/composed file diverged… Default-on for fresh init. Opt out by `pr_check.enabled: false`." (No `pr_check.mode` today.) NOT in self-host `managed.files`.
- `template/managed/.github/workflows/review-gates.yml` — "PR-side REVIEWS.md enforcement gates (CS51 / #140)… the four gates below skip on the `workboard-only` label." In self-host `managed.files` (`harness.config.json:23`).
- `template/managed/.github/workflows/pr-evidence-lint.yml` — "PR-evidence aggregator gate (CS38a / CS36 / CS37 / ADR-0004)… enabled when `review_gates.enabled: true`." In self-host `managed.files` (`harness.config.json:22`). This is the aggregate/`mutation-engage`/skip-reasons source #393 wants ported.
- `harness.config.json` `pr_check.*` toggle is referenced by the workflow header (`pr_check.enabled`); this CS adds `pr_check.mode`, which must be added to `schemas/harness.config.schema.json` (schema-is-source-of-truth).

**Sizing / open question:** this is deliberately a **design-first** CS spanning three feature areas. Its first deliverable is the layering ADR + per-issue scope decisions; implementation MAY fan out to sub-tasks (sub-agents on disjoint files) or, if the reviewed scope is too large for one CS, split into CS90a/b/c (recorded as Q1). No code lands before the ADR fixes the layering model.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C90-1 | Layering doctrine as an ADR | Author an ADR under `docs/adr/` following the existing `NNNN-title.md` convention (next free number: `docs/adr/0005-ci-drift-review-gate-layering.md`) defining the four layers and when each applies: (L1) **per-PR `sync --mode=check`** — the recommended baseline drift gate; (L2) **weekly `harness-drift.yml` cron** — belt-and-suspenders for low-activity repos, keeps auto-fix-PR; (L3) **`harness-pr-check.yml`** managed-drift classifier + `harness-managed-edit-ack` escape valve; (L4) **`review-gates.yml` / `pr-evidence-lint.yml`** review-evidence. Document the recommended combination + the redundancies to avoid (e.g. L1 already covers most of L3's drift half). | A single authoritative layering doc is the net ask across #391/#392/#393; it prevents consumers stacking redundant gates and anchors the concrete changes below. |
| C90-2 | Per-PR sync-check baseline (#391) | Recommend a **documented `ci.yml` job snippet** running `harness sync --mode=check` as the L1 baseline (not a new managed workflow — avoids adding a file every consumer must adopt; Q2 resolved). The ADR MUST note the semantic difference: raw `sync --mode=check` fails on **any** drift (including seeded-file absence), whereas the L3 `harness-pr-check` classifier fails only on **managed/composed** drift — so L1 is stricter and consumers should not stack both blindly. Reposition `harness-drift.yml`'s header + docs explicitly as low-activity belt-and-suspenders (behaviour unchanged). | Removes the "every consumer re-invents `harness-sync-check`" friction; a snippet is zero adoption cost; the semantics note prevents mis-layering. |
| C90-3 | `pr_check.mode` (#392) | Add `pr_check.mode` ∈ `{lint+drift (default), drift-only}` to `harness-pr-check.yml` + `schemas/harness.config.schema.json`; in `drift-only` the workflow runs the managed-drift classifier + escape valve but **not** `harness lint`. Add an adoption-overlap **warning** (in `harness sync` or a `harness doctor`) when the consumer's own workflows already invoke `harness lint` / `sync --mode=check` and `harness-pr-check` would duplicate them. | Lets a consumer that lints inline adopt the drift classifier + escape valve without a redundant second lint — the specific blocker #392 identifies. Schema-first per the harness convention. |
| C90-4 | `review-gates.yml` parity (#393) | Port from `pr-evidence-lint.yml` into `review-gates.yml`: (a) a `mutation-engage` Copilot-engagement job that MUST be `workflow_dispatch`-only, hold `pull-requests: write` on that job ALONE (all other jobs stay read-only), validate the input `pr_number` refers to an OPEN PR in the same repo, and NEVER check out or run PR-head code (mirror `pr-evidence-lint.yml`'s posture); (b) the full skip-reason set — **workboard-only + bot-author + fork-source** (today review-gates skips only on workboard-only → Dependabot/fork PRs false-fail); (c) an **optional single-context aggregate mode** so consumers can keep one required check instead of remapping to the four gate contexts. | Closes the three functional regressions that block migration off the aggregator; (b) is a correctness fix (false-fail on Dependabot/fork); (a)'s least-privilege posture keeps the ported engagement job from widening the privileged surface. |
| C90-5 | Migration path (#393) | **Default:** a documented old→new required-status-context mapping (`pr-evidence-lint` → `review-gates` contexts) in the ADR is the MVP. A `harness migrate-ci` helper (swap the workflow in `managed.files` + print the exact ruleset context changes) is a **separate follow-up CS**, filed only if the ADR proves the manual mapping insufficient — not built under this arc by default. | Lowers #393's migration-risk with zero net-new CLI surface; a helper is avoidable scope expansion (R5). |
| C90-6 | Mandatory split | Plan-review confirmed the combined implementation scope is too large for one CS, so the split is **mandatory, not optional**. CS90's own deliverable is ONLY the layering ADR (C90-1) plus filing the three implementation sub-CSs; **no workflow/schema/CLI code lands under CS90 itself**. Implementation fans out to **CS90a** (#391 L1 baseline snippet + `harness-drift.yml` repositioning), **CS90b** (#392 `pr_check.mode` + overlap warning + schema), **CS90c** (#393 review-gates parity + migration mapping). The ADR is a hard prerequisite for a/b/c. | Prevents a mega-CS; ADR-first ordering makes the split clean along issue lines; each sub-CS gets its own independent review (esp. CS90c, which touches self-host-managed `review-gates.yml`). |

## Deliverables

**CS90 (this CS) delivers only:**
1. `docs/adr/0005-ci-drift-review-gate-layering.md` — the layering doctrine (C90-1), the L1-vs-L3 drift-semantics note (C90-2), the review-gates `mutation-engage` least-privilege posture (C90-4), and the #393 migration mapping (C90-5). **Prerequisite for all sub-CS code.**
2. Three filed planned sub-CSs — **CS90a / CS90b / CS90c** (C90-6) — each with its own plan + independent plan review, cross-linked to #391 / #392 / #393.

**Specified by the ADR, implemented under the sub-CSs (NOT CS90 itself):**
3. *(CS90a, #391)* documented per-PR `sync --mode=check` `ci.yml` snippet + `harness-drift.yml` header/doc repositioning (C90-2).
4. *(CS90b, #392)* `template/managed/.github/workflows/harness-pr-check.yml` + `schemas/harness.config.schema.json` `pr_check.mode` support + adoption-overlap warning wired into `harness sync` (C90-3); tests (`drift-only` skips lint; overlap warning fires).
5. *(CS90c, #393)* `template/managed/.github/workflows/review-gates.yml` least-privilege `mutation-engage` + bot/fork skip-reasons + optional aggregate mode (C90-4); skip-reason-matrix test incl. bot/fork.
6. Each sub-CS carries its own `CHANGELOG.md` `[Unreleased]` entry and closes its issue (#391 / #392 / #393 respectively).

## User-approval gates

- **G90-1** — approve the ADR's layering model + the CS90a/b/c breakdown before the sub-CSs are claimed and any workflow/schema code lands. This is the design fork the whole arc hinges on.

## Exit criteria

**CS90's own exit criteria:**
1. The layering ADR (`docs/adr/0005-…`) exists (status **Proposed** pending G90-1; flips to **Accepted** once G90-1 is granted) and makes explicit how the layers compose (the aspect each guards), the one genuine either/or (L4's two implementations) and the one same-check-twice redundancy to avoid, the L1-vs-L3 drift-semantics difference, the review-gates `mutation-engage` least-privilege posture, and the #393 context mapping.
2. CS90a / CS90b / CS90c are filed as planned CSs (each with its own passing plan review) and cross-linked to #391 / #392 / #393.
3. `harness lint` passes on the ADR + sub-CS files; `node --test tests/*.test.mjs` green. Plan-vs-implementation review (GPT-5.5) GO.

**Sub-CS exit criteria (verified when each sub-CS closes, NOT here):**
4. *(CS90a)* per-PR sync-check baseline documented; `harness-drift.yml` repositioned (behaviour unchanged).
5. *(CS90b)* `pr_check.mode=drift-only` runs drift+escape-valve without `harness lint`; schema validates the new field; overlap warning fires on duplicate lint.
6. *(CS90c)* `review-gates.yml` engages Copilot via least-privilege `mutation-engage`, skips on bot-author + fork-source + workboard-only, offers an aggregate single-context mode; Dependabot/fork PRs no longer false-fail; `sync --mode=check` clean after regeneration.

## Risks + open questions

| # | Risk / what breaks | Mitigation |
|---|---|---|
| R1 | Combined scope is too large / slow for one CS. | Resolved: C90-6 makes the split into CS90a/b/c mandatory; CS90 itself ships only the ADR + sub-CS filings. |
| R2 | `review-gates.yml` is in self-host `managed.files` — changes regenerate the self-host's own gates and could disrupt this very repo's PR gating. | Confined to CS90c (not this CS). Land review-gates changes with `sync` regeneration + a green self-host PR before relying on them; treat as a mid-CS managed-file change (CS90c's deliverable). |
| R3 | New `pr_check.mode` field diverges from schema → silent config-read failure. | Schema-first (C90-3, under CS90b): add to `schemas/harness.config.schema.json` and validate via `sync --mode=check` before authoring workflow logic. |
| R4 | The ported `mutation-engage` job could widen the privileged surface. | C90-4 constrains it: `workflow_dispatch`-only trigger, `pull-requests: write` on that job alone, validate `pr_number` is an OPEN same-repo PR, never checkout/run PR-head code. Security-review the ported job; the ADR records the posture. |
| R5 | A `harness migrate-ci` helper is a big net-new CLI surface. | C90-5 defaults it OUT: documented mapping is the MVP; the helper is a separate follow-up CS only if the ADR proves the mapping insufficient. |
| Q1 | Single CS or CS90a/b/c split? | Resolved by plan-review: mandatory split (C90-6). |
| Q2 | Is the L1 baseline a new managed workflow or a documented `ci.yml` snippet? | Resolved: documented `ci.yml` snippet (C90-2) — zero adoption cost vs a file every consumer must adopt. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | cs90-plan-review (omni-ah-c3) | 4cc103c8780c | 2026-07-02T23:47:00Z | Go-with-amendments | Facts verified; applied: mandatory split CS90a/b/c; ADR filename 0005; '4 gates+1 guard' not 5; mutation-engage least-privilege; L1 ci.yml snippet + drift-semantics; migrate-ci=follow-up. |

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | yoga-ah |
| Reviewer agent | rubber-duck (orchestrator: yoga-ah) |
| Notes | Provisional at claim; finalized at close-out. Independence per REVIEWS.md § 2.3 — reviewer `gpt-5.5` ≠ implementer `claude-opus-4.8`. CS90 ships only the layering ADR (`docs/adr/0005-…`) + filings for sub-CSs CS90a/b/c; no distributed code/schema/workflow change lands under CS90 itself, so **no SemVer bump** for this CS. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| C90-1: author `docs/adr/0005-ci-drift-review-gate-layering.md` — layering doctrine L1 (per-PR `sync --mode=check`) / L2 (weekly `harness-drift.yml` cron) / L3 (`harness-pr-check.yml` classifier) / L4 (`review-gates.yml` + `pr-evidence-lint.yml`), the L1-vs-L3 drift-semantics note, the `mutation-engage` least-privilege posture, and the #393 migration mapping | planned | — | agent-id=cs90-adr \| role=implementer \| report-status=pending \| learnings=0 |
| C90-6: file planned sub-CSs CS90a (#391) / CS90b (#392) / CS90c (#393), each with its own plan + independent GPT-5.5 plan review, cross-linked to their issues (no workflow/schema/CLI code lands under CS90 itself) | planned | — | agent-id=cs90-adr \| role=implementer \| report-status=pending \| learnings=0 |
| G90-1: user-approval gate — approve the ADR layering model + the CS90a/b/c breakdown before any sub-CS is claimed | planned | — | role=gate \| report-status=pending \| learnings=0 |
| CHANGELOG.md: CS90 itself adds no `[Unreleased]` entry (ships only the ADR + sub-CS filings, no distributed code/schema/workflow change); each sub-CS CS90a/b/c adds its own `[Unreleased]` entry when it closes #391/#392/#393 | planned | — | report-status=pending \| learnings=0 |
| Local review — GPT-5.5 rubber-duck of the ADR + sub-CS plans (independence invariant per REVIEWS.md) | planned | — | role=reviewer \| report-status=pending \| learnings=0 |
| Close-out: docs + restart state (WORKBOARD + CONTEXT + handoff) | planned | — | report-status=pending \| learnings=0 |
| Close-out: learnings + follow-ups (LEARNINGS.md) | planned | — | report-status=pending \| learnings=0 |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
