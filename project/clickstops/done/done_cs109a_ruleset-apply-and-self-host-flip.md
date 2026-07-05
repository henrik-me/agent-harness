# CS109a — `harness ruleset apply --apply` (live-ruleset mutation) + self-host posture flip

**Status:** done
**Owner:** yoga-ah-c2
**Branch:** cs109a/content
**Started:** 2026-07-05
**Closed:** 2026-07-05
**Filed by:** CS109 (ADR [0006](../../../docs/adr/0006-review-enforcement-posture.md) § D6 split) — the high-blast-radius live-mutation half of #402, deliberately deferred from CS109 so the additive/safe surface (config + reader + `ruleset check` + F3/F4 guards + docs) could land without any live branch-protection change.
**Depends on:** **CS109** (HARD) — CS109 ships the `review_gates.enforcement` config, the presence-gated ruleset renderer, `harness ruleset check`, and the F3/F4 guards. CS109a adds only the live-mutation verb + the self-host posture selection on top of that surface. Related: **CS106** (the concrete self-host `required-check` + `required_approving_review_count = 0` flip — coordinate so the two do not double-apply).

## Goal

Deliver the deferred half of ADR 0006: the **`harness ruleset apply` / `apply --apply`** subcommand action that PUTs the config-derived source ruleset (`infra/main-protection-ruleset.json`) to the **live** GitHub ruleset via the API (dry-run first; `--apply` required to mutate), and — behind the **G109-ruleset-apply** user-approval gate — select and apply the self-host review-enforcement posture. This closes #402's F2 live-mutation requirement that CS109 intentionally scoped out.

## Background

- Filed from ADR 0006 § D6 (verify at claim-time HEAD). CS109 shipped `review_gates.enforcement`, the presence-gated renderer, read-only `harness ruleset check`, and the F3 (`ruleset-deadlock`) + F4 (`posture-coherence`) `harness lint` guards; `harness ruleset apply` currently **rejects** with a pointer here (exit 2).
- The live mutation is **high blast radius**: a mis-rendered required context or a wrong approval count can deadlock every PR in the repo. ADR 0006 D6 isolates it here for exactly that reason.
- Coordinate with **CS106** (open, HARD-blocked on CS90): CS106 is the concrete self-host `required-check` + count-0 flip. CS109a provides the *tool* (`ruleset apply --apply`) that CS106 (or this CS) uses to perform that flip. Resolve at claim-time whether CS109a performs the self-host flip itself or only ships the verb and leaves the flip to CS106.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Scope | Ship `harness ruleset apply` (dry-run) + `apply --apply` (live PUT), reusing the CS109 renderer + `diffManagedRulesetSurface`. Do NOT re-implement the config/renderer/guards (CS109 owns them). | Bounds CS109a to the irreversible mutation path; the additive surface already shipped in CS109. |
| 2 | Mutation safety | `apply` is dry-run by default (prints the rendered ruleset + the diff vs live); **`--apply` is required** to PUT. Fail-closed on any API error; after a successful PUT, `apply --apply` **automatically** re-runs the managed-surface check and **fails closed (nonzero) on any residual drift**. | An explicit flag + dry-run-first + mandatory automatic post-apply verification is the minimum safety envelope for a repo-wide merge-policy mutation. |
| 3 | Self-host posture | Escalate the self-host posture choice (`required-check` vs `both`) and the live apply to @henrik-me (**G109-ruleset-apply**) before any self-host mutation. | Repo-wide blast radius; the maintainer owns the merge-policy decision (ADR 0006 D7). |
| 4 | CS106 coordination | Resolve at claim-time whether CS109a performs the self-host flip or only ships the verb; avoid double-applying with CS106. Record a concrete disposition ("CS109a performs the flip; CS106 superseded/updated" OR "CS109a ships verb only; CS106 owns the flip") in the claim-time plan. | Two CSs mutating the same live ruleset must not race or contradict. |
| 5 | Pre-apply preflight (binding) | Self-host `apply --apply` MUST be preceded by `harness sync --mode=check` (no config-vs-source drift) **and** `harness lint` with **zero `ruleset-deadlock` (F3) warnings** for the target ruleset. A stale or deadlocking required context is resolved **before** the PUT. This is a binding deliverable/exit requirement, not operator folklore — script or test the preflight path. | Applying a stale or deadlock-inducing required context can freeze every merge; the F3 guard (`bin/harness.mjs` `ruleset-deadlock`) exists precisely to catch this and must gate the apply. |

## Deliverables

1. `harness ruleset apply` (dry-run) + `apply --apply` (live GitHub-API PUT of the rendered ruleset, discovered by name / `--ruleset-id`), reusing CS109's renderer + managed-surface diff; fail-closed.
2. Tests for the apply path (dry-run output, `--apply` gating, fail-closed on API error) — mocked/`--live-file`-style where the live API cannot be exercised.
3. **Mandatory** post-apply verification: after a successful PUT, `apply --apply` **automatically** runs the managed-surface check and **exits nonzero (fail-closed) on any residual drift or API/parse error** — not merely documented. Tests cover both the verify-success and verify-failure paths.
4. **Binding pre-apply preflight (Decision 5):** self-host `apply --apply` is gated on `harness sync --mode=check` reporting no drift **and** `harness lint` reporting **zero `ruleset-deadlock` (F3) warnings** for the target ruleset; script or test the preflight so it cannot be skipped.
5. (If G109-ruleset-apply approves) the self-host posture selection + live apply, with the CS106 disposition (Decision 4) recorded.
6. `CHANGELOG.md` `[Unreleased]` entry. #402 referenced for the live-mutation portion.

## User-approval gates

- **G109-ruleset-apply** — approve the default posture and any self-host live-ruleset change before `harness ruleset apply --apply` runs against the self-host repo. Blast radius: repo-wide merge policy; a mis-ordered apply can freeze all merges.

## Exit criteria

- `harness ruleset apply --apply` renders + PUTs the ruleset (dry-run first; `--apply` gated), preceded by the binding pre-apply preflight (`sync --mode=check` clean + zero F3 `ruleset-deadlock` warnings), fail-closed on API error, and **automatically** runs the managed-surface check post-PUT (nonzero on residual drift). Tests + `harness lint` green; `sync --mode=check` clean. If the self-host flip is performed, it is approved via G109-ruleset-apply and the CS106 disposition is recorded. Plan-vs-implementation review (GPT-5.5) GO.

## Risks + open questions

| # | Risk / what breaks | Mitigation |
|---|---|---|
| R1 | A mis-rendered required context or wrong approval count deadlocks every PR. | Dry-run-first; explicit `--apply`; post-apply `ruleset check`; F3 `ruleset-deadlock` guard run before apply; documented rollback (re-render `human-approval` + re-apply). |
| R2 | Double-apply / contradiction with CS106 on the same live ruleset. | Decision 4 — resolve ownership of the self-host flip at claim-time; one CS performs it. |
| R3 | Live API shape drift (GitHub adds/renames ruleset fields) breaks the PUT. | Manage only the harness surface; fail-closed; pin the API version in the call if needed. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | cs109a-plan-review (yoga-ah-c2) | 552c84d896c7 | 2026-07-05T20:20:00Z | Needs-Fix | Post-apply verify was optional (D3); pre-apply lint/F3 deadlock preflight not binding in Decisions/Deliverables. |
| R2 | gpt-5.5 | claude-opus-4.8 | cs109a-plan-review-r2 (yoga-ah-c2) | a3405344ad52 | 2026-07-05T20:36:00Z | Go | R1 blockers resolved: mandatory fail-closed post-PUT verification + tested paths; binding pre-apply sync/lint F3 gate added; CS106 disposition explicit. |

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | yoga-ah-c2 |
| Reviewer agent | rubber-duck (orchestrator: yoga-ah-c2) |
| Notes | Runtime CLI CS (`harness ruleset apply` verb + tests). Independence per REVIEWS § 2.3 — reviewer `gpt-5.5` ≠ implementer `claude-opus-4.8`. Finalized at close-out. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| Dispatch implementer — `harness ruleset apply` verb + tests + preflight + CHANGELOG (Deliverables 1-4,6) | done | cs109a-impl | agent-id=cs109a-impl \| role=implementer \| report-status=complete \| learnings=0 |
| Claim recon — re-verify #402 / ADR 0006 § D6 state at HEAD; confirm `harness ruleset apply` still rejects (exit 2) | done | yoga-ah-c2 | F6 state-of-world |
| Implement `harness ruleset apply` (dry-run: render + diff vs live) + `apply --apply` (live PUT), reusing CS109 renderer + `diffManagedRulesetSurface`; fail-closed on API error | done | yoga-ah-c2 | Deliverable 1 / Decisions 1,2 — shipped #517, API-shape-corrected #518 |
| Mandatory post-apply verification: after a successful PUT, auto re-run the managed-surface check; exit nonzero on residual drift/parse error | done | yoga-ah-c2 | Deliverable 3 / Decision 2 |
| Binding pre-apply preflight: gate self-host `apply --apply` on `sync --mode=check` clean + zero F3 `ruleset-deadlock` warnings; script/test so it cannot be skipped | done | yoga-ah-c2 | Deliverable 4 / Decision 5 |
| Tests for the apply path (dry-run output, `--apply` gating, fail-closed on API error, verify-success + verify-failure paths) via `--live-file`/mock | done | yoga-ah-c2 | Deliverable 2,3 — 18 tests |
| Record the CS106 coordination disposition (Decision 4) — whether CS109a performs the self-host flip or ships the verb only | done | yoga-ah-c2 | Decision 4 / R2 — verb-only; CS106 owns flip |
| Add `CHANGELOG.md` `[Unreleased]` entry referencing #402 for the live-mutation portion | done | yoga-ah-c2 | Deliverable 6 |
| Validate: `harness lint`, `node --test tests/*.test.mjs`, `sync --mode=check` clean | done | yoga-ah-c2 | Exit criteria — lint 43/0/3, 2049 pass, no drift |
| Local review — GPT-5.5 rubber-duck before opening the content PR | done | yoga-ah-c2 | REVIEWS.md — #518 R1 Go (API-shape fix) + Copilot |
| (If G109-ruleset-apply approved) self-host posture selection + live apply | deferred | yoga-ah-c2 | Deliverable 5 / G109-ruleset-apply — not granted; CS106 owns the concrete flip |
| Plan-vs-implementation review (GPT-5.5) — GO before close-out | done | yoga-ah-c2 | close-out gate — GO (`cs109a-pvi-review`) |
| Close-out: docs + restart state — update WORKBOARD.md, CONTEXT.md, handoff | done | yoga-ah-c2 | mandatory |
| Close-out: learnings + follow-ups — file LEARNINGS.md candidates / planned follow-up CSs | done | yoga-ah-c2 | mandatory — LRN-197/210/211 already open (no dupes) |

## Notes / Learnings

**CS106 coordination disposition (Decision 4 — resolved at claim time by yoga-ah-c2):**
CS109a **ships the `harness ruleset apply` verb + tooling only** (Deliverables 1-4, 6). The concrete self-host `required-check` + `required_approving_review_count = 0` flip (Deliverable 5) is **NOT performed here** — it remains owned by **CS106** and is gated behind the **G109-ruleset-apply** user-approval gate (repo-wide merge-policy blast radius; ADR 0006 D7). This avoids the double-apply/contradiction risk (R2). CS106 (HARD-blocked on CS90's aggregate context) will use the `apply --apply` verb this CS ships to perform that flip once its own preconditions + G109-ruleset-apply are met.

**Deliverable 5 status:** deferred — no live self-host ruleset mutation was made in this CS (G109-ruleset-apply not granted in-session).

(further notes filled during execution)

## Plan-vs-implementation review

**Reviewer:** GPT-5.5 (rubber-duck)
**Date:** 2026-07-05T23:35:00Z
**Outcome:** GO

An earlier PVI pass found the GitHub-API-shape defect (the source↔live diff and the `--apply` PUT body used the internal `required_checks` strings shape instead of the API `required_status_checks` objects) and returned NEEDS-FIX; it was fixed in PR #518 (`5acebaf`). This is the re-review of the now-complete CS109a delivery on `main` (PRs #517 + #518), independent per REVIEWS.md § 2.3 (reviewer `gpt-5.5` ≠ implementer `claude-opus-4.8`).

Per-deliverable outcome:

| # | Deliverable (short) | Outcome | Rationale |
|---|---|---|---|
| 1 | `harness ruleset apply` dry-run + `apply --apply` live PUT | match | — |
| 2 | Apply-path tests: dry-run, `--apply` gating, API-error fail-closed | match | — |
| 3 | Mandatory post-apply verification, fail-closed on residual drift/API error | match | — |
| 4 | Binding pre-apply preflight: `sync --mode=check` clean + zero F3 warnings | match | — |
| 5 | Self-host posture flip | match (deferred) | Intended scope deferral: the CS Notes record G109-ruleset-apply was not granted, no live self-host mutation was made, and CS106 owns the concrete `required-check` + count-0 flip. Not dropped. |
| 6 | `CHANGELOG.md` `[Unreleased]` entry referencing #402 | match | — |

Test-coverage assessment: **sufficient** — `node --test tests/cs109a-ruleset-apply.test.mjs` passes 18/18; coverage includes dry-run output, `--apply` gating, fail-closed PUT error, preflight success/failure (real `sync --mode=check` + F3 `ruleset-deadlock` block), post-apply verify success/failure, seam-safety guards, and GitHub API-shape read/PUT serialization.

Summary: the implementation matches the CS109a plan, including the previously-flagged API-shape fix — live reads understand `required_status_checks` while PUT bodies serialize to the API shape. The pre-apply preflight and mandatory post-apply verification are binding fail-closed paths and are tested. The renderer/on-disk ruleset source remains on the internal `required_checks` shape; `toApiRulesetBody` is only used on the PUT path, and `harness sync --mode=check` reports no drift, so the split is non-breaking.
