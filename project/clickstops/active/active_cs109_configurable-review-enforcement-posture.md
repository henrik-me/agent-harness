# CS109 — Configurable review-enforcement posture (human-approval | required-check | both)

**Status:** active
**Owner:** yoga-ah-c2
**Branch:** cs109/content
**Started:** 2026-07-05
**Closed:** —
**Filed by:** yoga-ah (orchestrator, Claude Opus 4.8) — triage of untriaged inbound issue [#402](https://github.com/henrik-me/agent-harness/issues/402) (2026-07-05). Surfaced from `henrik-me/sub-invaders`. Directed by @henrik-me ("triage the issues, identify how to address each, such as filing CS's").
**Depends on:** none. (Related: **CS90c** — a future single-context `review-gates.yml` aggregate would be a cleaner required context; **CS106** — the concrete self-host required-check flip.)

## Goal

Add a first-class, configurable **review-enforcement posture** so a repo can enforce code review via a **required status check** (the harness review-evidence gate) instead of GitHub's native `required_approving_review_count`. This lets a solo-maintainer + agent repo drop the (unsatisfiable) human-approval requirement while making review *stronger*, and lets workboard/bookkeeping PRs merge with **no** admin-bypass, token, or App. Deliver #402's F1–F5 as the **generalized, consumer-configurable** surface — distinct from CS106 (the concrete self-host flip) and CS90 (the CI-gate layering ADR + aggregate context).

## Background

- Filed from inbound issue **#402** (state: open; verify via `gh issue view 402` at claim-time HEAD). Verified at HEAD `1d01eac` that #402 is open with zero triage disposition and no dedicated CS (only cross-linked by CS106/CS90 as the broader superset).
- #402's five proposed features:
  - **F1 — enforcement-posture config:** `review_gates.enforcement: "human-approval" | "required-check" | "both"` (default `human-approval` for back-compat) driving ruleset generation (`required_approving_review_count` 1/0/1; review gate advisory/required/required).
  - **F2 — harness-managed ruleset:** `harness ruleset apply` / `check` — render the branch-protection ruleset from config, apply via the GitHub API, and **detect drift** between the live ruleset and the source (today it is a hand-authored, hand-applied consumer file).
  - **F3 — required-check safety guarantee + deadlock detector:** a status check is only safe to require if its job **always runs and reports green** — including on workboard-only / bot / fork PRs; a skipped job leaves the required context perpetually pending → **deadlock**. Add a `harness lint`/`doctor` check that warns when a consumer marks a required context whose job can be skipped.
  - **F4 — posture-coherence warning:** `gh pr merge --admin` bypasses required *checks*, not just approvals; a repo on `required-check`/`both` that keeps admin-merging is *bypassing the gate* (decorative). Warn on this incoherent combination.
  - **F5 — docs:** a team-shape → posture matrix, the reversibility steps, and the per-mode guard inventory.
- **Dependency posture (no hard block).** F3's premise is that a required check must ALWAYS report green. That safe context **already exists**: `read-only-gates` (in `pr-evidence-lint.yml`) runs on every PR (`if: github.event_name == 'pull_request' || …`), and — post-CS71 (shipped in v0.17.0) — the four `review-gates.yml` evidence jobs always execute and short-circuit **internally** to success (step-level `if: steps.wb.outputs.skip != 'true'`; never a job-level `workboard-only` skip that would leave the context absent). So CS109 is **not** blocked on CS90 — it targets the existing safe context. A future single-context `review-gates.yml` **aggregate** (scoped to **CS90c**) would be a cleaner required context and is a soft/related follow-up, not a prerequisite.
- **Relationship to CS106.** CS106 flips **THIS repo's** ruleset to `required-check` + `required_approving_review_count = 0` (a concrete instance); CS109 is the **generalized, consumer-configurable** surface (F1 config + F2 verb + F3/F4 guards + F5 docs). CS106's C106-5 explicitly assigns the generalized surface to "CS90 / #402" — CS109 is that owner; CS106 must not be re-implemented here.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Scope | Deliver #402 **F1–F5** as the generalized, consumer-configurable posture surface (config enum + `harness ruleset` verb + deadlock/coherence guards + docs). Do **not** re-do CS106's concrete self-host flip, and do **not** re-do CS90's CI-gate layering ADR / aggregate context. | Keeps blast radius bounded; CS106 (concrete instance) + CS90 (aggregate context) are the dependency/sibling, not duplicated here (the C106-5 boundary). |
| 2 | Dependency | **None hard.** A safe always-running context already exists: `read-only-gates` (in `pr-evidence-lint.yml`) runs on every PR, and — post-CS71 (v0.17.0) — the `review-gates.yml` evidence jobs always execute and report their context (step-level skip, never job-level absence). CS109 targets that existing safe context; a future single-context aggregate (**CS90c**) is a soft/related nicety. Coordinate with **CS106** (self-host instance). | Post-CS71 the evidence contexts always report, so requiring one does not deadlock workboard/bot/fork PRs — the original CS90 blocker is stale. F3's deadlock **detector** stays valuable: it guards a consumer who marks a genuinely skippable context required. |
| 3 | ADR-first | Author an ADR for the posture design (config-enum semantics, ruleset generation + drift, F3 deadlock-safety rule, F4 coherence rule) **before** implementation; may split into sub-CSs at claim-time if the ADR shows it warrants it. | Branch-protection posture is high-blast-radius — a wrong required context deadlocks every PR — so an ADR + independent review de-risks it, mirroring CS90's ADR-first stance. |
| 4 | Config surface | New **optional** `review_gates.enforcement` enum (`human-approval` default) + `schemas/harness.config.schema.json` addition. | New optional config field → **Minor**, backward-compatible; the default preserves today's behavior. |
| 5 | New verb | `harness ruleset apply` / `harness ruleset check` — render the branch-protection ruleset from config and detect drift vs. the live ruleset (fail-closed; `apply` dry-run-first). | New CLI subcommand → **Minor**; F2 requires a harness-managed, drift-checked ruleset (today it is hand-authored + hand-applied with nothing verifying the live state). |

## Deliverables

1. **ADR** (`docs/adr/NNNN-review-enforcement-posture.md`) — the posture design: `review_gates.enforcement` semantics, the ruleset-generation/drift model, the F3 deadlock-safety rule, and the F4 coherence rule.
2. **Config + reader** — new optional `review_gates.enforcement` enum (`human-approval | required-check | both`, default `human-approval`) in `harness.config.json` + `schemas/harness.config.schema.json`, read fail-closed by the existing `reviews`/`review_gates` config reader.
3. **`harness ruleset apply` / `check`** verb — render the branch-protection ruleset from config + apply via the GitHub API; `check` detects drift between the live ruleset and the config-derived source (fail-closed; `apply` dry-run-first with explicit `--apply`).
4. **F3 deadlock-risk guard** — a `harness lint`/`doctor` check that warns when a required status context's job can be skipped (never-runs → perpetually-pending → deadlock).
5. **F4 posture-coherence guard** — warn when `enforcement` is `required-check`/`both` but the repo still admin-merges (the gate is bypassed → decorative).
6. **F5 docs** — team-shape → posture matrix, reversibility steps (flip back to `human-approval` + re-apply), and the per-mode guard inventory (`OPERATIONS.md` / `REVIEWS.md` + composed mirrors).
7. **Tests** for the config reader, the ruleset renderer/drift, and the two guards.
8. **`CHANGELOG.md` `[Unreleased]`** entry (Minor — new optional config field + new `harness ruleset` subcommand).

## User-approval gates

- **G-ruleset-apply.** `harness ruleset apply` mutates the live branch-protection ruleset (high blast radius). The ADR must define whether `apply` is behind an explicit `--apply` + human confirmation. Escalate the **default posture** and any **self-host ruleset change** to @henrik-me before applying to the self-host repo.
- **G-adr.** The ADR is a user-approval gate before implementation (design decision with repo-wide merge-policy impact).

## Exit criteria

- ADR accepted (independent review); `review_gates.enforcement` config + schema shipped (default back-compat); `harness ruleset apply`/`check` renders + drift-detects; F3 + F4 guards registered in `harness lint`; F5 docs present; tests + `harness lint` green; CHANGELOG entry.

## Risks + open questions

- **Soft dependency on CS90c (not a blocker).** A single-context `review-gates.yml` aggregate (CS90c) would be a cleaner required context than pinning individual gate contexts; if it lands, CS109 should prefer it. CS109 is **not** blocked on it — `read-only-gates` is the safe fallback context today (CS106 C106-1).
- **Branch-protection mutation** (F2 `apply`) is high-blast-radius and hard to reverse — a bad required context deadlocks every PR. Mitigated by the ADR + a dry-run-first `apply`.
- **Overlap with CS106** — CS109 must deliver only the generalized surface; the self-host concrete flip stays with CS106. If CS106 lands first, CS109 generalizes its concrete choices into the config enum.
- **Open question (split).** F1–F5 may exceed one CS; the ADR decides whether to split (e.g. config+docs vs. the `ruleset` verb vs. the guards). Resolve at claim-time.

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | rubber-duck (background, yoga-ah) | 2f82a3b192bf | 2026-07-05T05:22:02Z | Needs-Fix | 1 blocking: stale HARD CS90 dep — post-CS71 review-gates jobs are step-gated (always report) + read-only-gates always runs; make CS90 soft/CS90c. |
| R2 | gpt-5.5 | claude-opus-4.8 | rubber-duck (background, yoga-ah) | a9e6a35f4130 | 2026-07-05T05:31:02Z | Go | R1 blocker resolved: Depends-on none, CS90c soft, existing safe context (read-only-gates) cited, F3 detector retained; dependency facts re-verified. No findings. |

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | yoga-ah |
| Reviewer agent | rubber-duck (orchestrator: yoga-ah) |
| Notes | Filing-only triage of #402. Minor SemVer (new optional config field + new `harness ruleset` subcommand). ADR-first; **no hard dependency** (a safe required context already exists post-CS71; the CS90c aggregate is a soft follow-up). Independence per REVIEWS § 2.3 — reviewer `gpt-5.5` ≠ implementer `claude-opus-4.8`. Finalized at close-out. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| C109-1: author `docs/adr/0006-review-enforcement-posture.md` — the posture design: `review_gates.enforcement` (`human-approval` \| `required-check` \| `both`) semantics + ruleset-generation/drift model (F2), F3 deadlock-safety rule (required context must always run + report green), F4 admin-merge coherence rule, and the split decision (Decision 3 / open question) | planned | — | role=implementer \| report-status=pending \| learnings=0 |
| G109-adr: user-approval gate — approve the ADR posture design (config-enum semantics + ruleset-generation/drift + F3/F4 rules + split decision) before any implementation lands | planned | — | role=gate \| report-status=pending \| learnings=0 |
| C109-2: config + reader — new **optional** `review_gates.enforcement` enum (default `human-approval`, back-compat) in `harness.config.json` + `schemas/harness.config.schema.json`, read fail-closed by the existing review-gates config reader | planned | — | role=implementer \| report-status=pending \| learnings=0 |
| C109-3: `harness ruleset apply` / `harness ruleset check` verb — render the branch-protection ruleset from config + apply via the GitHub API; `check` detects drift vs. the live ruleset (fail-closed; `apply` dry-run-first, gated behind explicit `--apply`) | planned | — | role=implementer \| report-status=pending \| learnings=0 |
| C109-4: F3 deadlock-risk guard — a `harness lint`/`doctor` check that warns when a required status context's job can be skipped (never-runs → perpetually-pending → deadlock) | planned | — | role=implementer \| report-status=pending \| learnings=0 |
| C109-5: F4 posture-coherence guard — warn when `enforcement` is `required-check`/`both` but the repo still admin-merges (gate bypassed → decorative) | planned | — | role=implementer \| report-status=pending \| learnings=0 |
| C109-6: F5 docs — team-shape → posture matrix, reversibility steps, per-mode guard inventory (`OPERATIONS.md` / `REVIEWS.md` + composed mirrors) | planned | — | role=implementer \| report-status=pending \| learnings=0 |
| C109-7: tests — config reader, ruleset renderer/drift, and the F3/F4 guards (`node --test`) | planned | — | role=implementer \| report-status=pending \| learnings=0 |
| G109-ruleset-apply: user-approval gate — approve the default posture + any self-host live-ruleset change before `harness ruleset apply --apply` runs against the self-host repo (high blast radius) | planned | — | role=gate \| report-status=pending \| learnings=0 |
| CHANGELOG.md: add `[Unreleased]` entry (Minor — new optional `review_gates.enforcement` config field + new `harness ruleset` subcommand); reference #402 for auto-close | planned | — | report-status=pending \| learnings=0 |
| Local review — GPT-5.5 rubber-duck of the ADR + implementation (independence invariant per REVIEWS.md § 2.3) | planned | — | role=reviewer \| report-status=pending \| learnings=0 |
| Close-out: docs + restart state (WORKBOARD + CONTEXT + handoff) | planned | — | report-status=pending \| learnings=0 |
| Close-out: learnings + follow-ups (LEARNINGS.md) | planned | — | report-status=pending \| learnings=0 |

## Notes / Learnings

### ADR-first (C109-1) — `docs/adr/0006-review-enforcement-posture.md`

- **Authored** 2026-07-05 (`83e0bad`); **revised** after independent review (`74e4859`).
- **Independent design review** — gpt-5.5 rubber-duck (implementer claude-opus-4.8;
  independence per REVIEWS.md § 2.3). **R1 = Needs-Fix**, 4 blocking findings, all addressed:
  1. Default/absence guarantee not airtight (schema-default reader materializes absent) →
     **D1**: no schema `default`; presence-gated generation; byte-for-byte-unchanged test (C109-7).
  2. `reviews.enforce_gates` vs explicit `human-approval` precedence unspecified →
     **D2**: explicit `enforcement` overrides legacy `enforce_gates`; cross-product tested.
  3. Deadlock guard mis-modelled job-level `if:` (skipped ≠ pending); missed no-producer class →
     **D4**: guard flags no-producer contexts + workflow-level filters as primary; job-level `if:` informational.
  4. Bot/fork "always green" overclaim (only workboard-only skip exists; copilot gate can fail) →
     **D3/Context**: contexts are *reported* not unconditionally green; bot/fork parity is CS90c.
  - Non-blocking: refreshed recon HEAD, discover ruleset by name (dropped `reviews.ruleset_id`),
    flagged CS106 stale-premise reconciliation as a close-out learning candidate.
- **Design summary:** optional `review_gates.enforcement` enum (`human-approval | required-check | both`,
  **no** schema default; presence-gated); enforcement→ruleset mapping (approval-count 1/0/1 +
  review-gate contexts advisory/required/required); `harness ruleset check` (read-only drift) +
  `apply --apply` (live mutation, G109-ruleset-apply); F3 deadlock guard; F4 admin-merge coherence guard.
- **D6 scope split (recommended, pending G109-adr ratification):** CS109 = safe/additive surface
  (config + reader + `ruleset check` + F3/F4 + docs + tests; no live mutation); **CS109a** (follow-up) =
  `ruleset apply --apply` + self-host posture selection (coordinates with CS106).
- **G109-adr status:** presented to @henrik-me for ratification (design + scope). User **away** and
  directed autonomous progress → **proceeded on the recommended option 1** (D6 split): implemented the
  CS109 safe/additive surface; the live-ruleset apply + self-host flip stay deferred to CS109a behind
  G109-ruleset-apply (never crossed — no live ruleset was mutated). The content PR is **not merged**
  pending @henrik-me's G109-adr ratification, so no design "lands" before acceptance.

### Implementation (C109-2..7, F5, CHANGELOG) — 2026-07-05

- **C109-2** schema `review_gates.enforcement` enum (no default) + `lib/reviews-policy.mjs`
  `loadReviewGatesEnforcement()` presence reader (fail-closed). Commit `e870ac6`.
- **C109-3** presence-gated renderer in `syncReviewGateRuleset` (absent ⇒ byte-for-byte unchanged;
  present ⇒ D2 mapping; overrides legacy `enforce_gates`) + **`harness ruleset check`** verb
  (managed-surface drift vs live; `apply` rejected → CS109a). Commit `e870ac6`.
- **C109-4/5** F3 `check-ruleset-deadlock.mjs` + F4 `check-posture-coherence.mjs` guards, registered in
  `harness lint` (43 linters). Commit `551bce1`.
- **C109-7** 30 tests (`tests/cs109-review-enforcement.test.mjs` + `tests/cs109-guards.test.mjs`):
  reader presence/malformed, renderer cross-product incl. absent=unchanged + precedence,
  `diffManagedRulesetSurface`, `ruleset check` CLI, both guards. Commit `551bce1`.
- **C109-6 (F5)** operating docs: posture matrix + reversibility + guard inventory in ADR 0006
  `## Operating the posture (F5)`, plus a pointer in `REVIEWS.md` `reviews.project-gates` local block.
- **CHANGELOG** `[Unreleased] / Added` entry.
- **CS109a** filed (`project/clickstops/planned/planned_cs109a_*.md`) with an independent gpt-5.5 plan review.
- **Delegation note:** F3/F4 guards were implemented directly (not via parallel background agents) —
  they couple tightly to the `harness lint` registration + are false-positive-sensitive (must pass clean
  on self-host), and concurrent shared-working-tree agent edits would race the orchestrator's doc/CHANGELOG
  edits (git-status/lint self-checks). Independent GPT-5.5 review was still used for the ADR + will be for the PR.

## Plan-vs-implementation review

> _(filled at close-out per the gate)_
