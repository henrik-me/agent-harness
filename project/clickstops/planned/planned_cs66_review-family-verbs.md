# CS66 — Review-family verbs: review-doc, review-cs, perf-review, security-review

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** CS64 (2026-06-06 by `yoga-ah-c3`) per decision **C64-8** — the review-family verbs cataloged in CS64's command/skill surface are spun out here because each is its own review-workflow design and bundling them would re-create the CS63 mega-PR risk.
**Depends on:** **CS52** (the `harness review` content-PR orchestrator these extend) and **CS40** (`harness review-output` validation) — hard, they are the reuse base. `review-cs` also builds on `lib/plan-review-hash.mjs` + `scripts/check-clickstop-plan-review.mjs`. Independent of CS65; may claim after CS64's `harness review` reuse seams are understood. **CS64b** (hard, added 2026-06-10) — the review-family verbs allocate temp dirs / clones for diff inspection and need the `lib/disposers.mjs` + `assertSafeRef` primitives (C64b-2) before adopting them as a CONVENTIONS-required pattern.

## Goal

Extend the existing `harness review <pr>` content-PR orchestrator with four **domain-specific review verbs**, each invoking an independent reviewer with a concrete, doctrine-anchored checklist and emitting a structured verdict: `review-doc` (prose/doc PRs — fact-claim verification), `review-cs` (clickstop plans/implementations — plan-vs-implementation), `perf-review` (performance), and `security-review` (security). These are the "review" half of the CS64 command/skill surface; they make the right review checklist invokable at the right moment instead of living only as prose in `REVIEWS.md`.

## Background

`harness review` (CS52) already orchestrates rubber-duck + Copilot review and updates the PR body, and `harness review-output` (CS40) validates reviewer-output shape; the independence invariant (reviewer model ≠ every implementer model) is enforced by `scripts/checks/check-independence-invariant.mjs`. What is missing is **domain specialization**: the dominant doc-PR failure mode (fact-claim drift — `REVIEWS.md § 2.6a` F1–F5) and the plan-review/PVI workflow are currently hand-run checklists, and there is no first-class performance or security review pass. CS64 cataloged these verbs; CS66 designs and ships them on the existing review infrastructure rather than reinventing orchestration.

Scope phasing (C66-1): `review-doc` + `review-cs` map directly onto existing harness doctrine and ship first; `perf-review` + `security-review` need checklist design and may form a second wave.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C66-1 | Phasing | Ship `review-doc` + `review-cs` first (they map onto existing REVIEWS doctrine); treat `perf-review` + `security-review` as a second wave that may slip to a sibling CS without blocking the first two. | `review-doc`/`review-cs` formalize procedures the harness already runs by hand; the perf/security checklists are genuinely new design work. Phasing keeps the CS shippable. |
| C66-2 | `harness review-doc <pr>` | Orchestrate a doc/prose-PR review that dispatches an independent reviewer with the **`REVIEWS.md § 2.6a` F1–F5 fact-claim checklist** (every `--flag` exists in CLI/help/scripts; every file path exists; every doctrine claim matches the cited source's requirement level; every `LRN-###`/`CS` scope respects the source; cross-doc consistency) and validates the reviewer output via `harness review-output`. Reuses the `harness review` independence machinery. | Fact-claim drift is the dominant doc-PR failure mode (REVIEWS § 2.6a, pattern verified on PR #218). Making the F1–F5 pass a verb removes reliance on the reviewer remembering the checklist. |
| C66-3 | `harness review-cs <NN>` | A **local, verify-only** clickstop-readiness verb (NOT a model-dispatch reviewer — it does **not** reuse the `harness review` PR orchestration). Given a CS number it locates the `planned`/`active`/`done` file, runs `scripts/check-clickstop-plan-review.mjs` (plan-review attestation present, schema-valid, independent, hash-fresh, passing) **and** `scripts/check-clickstop.mjs` (PVI section for active/done), and prints a single actionable "is this CS review-complete? what's missing?" report. | Added value over invoking the linters directly: one CS-number entry point with planned/active/done lookup, aggregating the plan-review + PVI checks and printing actionable missing items — not a thin alias for one linter. |
| C66-4 | `harness perf-review <pr>` (wave 2) | A performance review pass dispatching an independent reviewer with a **concrete perf checklist** (hot-path allocations, algorithmic complexity, N+1 / repeated IO, sync-in-async, unbounded growth) scoped to the PR diff; structured verdict; advisory by default. | A named, checklist-driven perf pass beats ad-hoc "looks fine"; scoping to the diff keeps it actionable rather than a generic audit. |
| C66-5 | `harness security-review <pr>` (wave 2) | A security review pass with a checklist (hard-coded secrets, command/path injection, unsafe deserialization, workflow `permissions` least-privilege, ref/`--body-file` containment, supply-chain pin drift) scoped to the diff; structured verdict; advisory by default. | Encodes the security patterns the harness already cares about (e.g. CS12 ref allowlists, CS56 realpath containment, action SHA-pinning) into a repeatable pass. |
| C66-6 | Shared design | The **three PR-based verbs** (`review-doc`, `perf-review`, `security-review`) reuse the `harness review` orchestration + independence invariant + `review-output` validation and emit the canonical reviewer-output shape; `review-cs` is **local verify-only** (no model dispatch, no PR — C66-3). All logic in `lib/` with thin `bin/` wrappers; **advisory exit by default**, `--strict` to fail; no verb auto-invokes a paid model without an explicit flag. | A single orchestration path for the model-dispatch verbs avoids four divergent implementations, while `review-cs` stays a fast local check; advisory-by-default + explicit model invocation control cost and avoid surprise. |
| C66-7 | SemVer | New CLI subcommands ⇒ **minor** bump per `OPERATIONS.md § SemVer policy`. | New consumer-visible CLI surface. |

## Deliverables

1. `lib/review-doc.mjs` + `tests/lib-review-doc.test.mjs` — F1–F5 fact-claim orchestration + output validation (C66-2).
2. `lib/review-cs.mjs` + `tests/lib-review-cs.test.mjs` — plan-review + PVI verification wrapper (C66-3).
3. `lib/perf-review.mjs` + `lib/security-review.mjs` + tests — wave-2 checklist passes (C66-4, C66-5; may slip).
4. `bin/harness.mjs` (edit, orchestrator) — register `review-doc`, `review-cs` (+ `perf-review`, `security-review` if wave 2 lands) in `COMMAND_REGISTRY` + help; thin delegation.
5. `REVIEWS.md` (edit, orchestrator) **+ `template/composed/REVIEWS.md` mirror in lockstep** — reference each verb as the canonical executable path for its review type (leverage, per CS64 C64-2).
6. `CHANGELOG.md` (edit) — `[Unreleased]` entries.

## User-approval gates

- **G-wave2** — confirm whether `perf-review` + `security-review` land in CS66 or a sibling CS.
- **G-release** — minor bump per C66-7 when shipped in a tag.

## Exit criteria

1. `harness review-doc <pr>` dispatches an independent reviewer with the F1–F5 checklist and validates the output via `review-output` (C66-2).
2. `harness review-cs <NN>` reports plan-review attestation + PVI completeness, failing (under `--strict`) on a stale/missing/failing attestation (C66-3).
3. If wave 2 lands, `perf-review`/`security-review` run their diff-scoped checklists with structured verdicts (C66-4, C66-5).
4. All four reuse the `harness review` independence machinery; reviewer model ≠ implementer model is enforced (C66-6).
5. `REVIEWS.md` (+ mirror) references each verb at its review type; lockstep lint passes (C66-6 deliverable 5).
6. `harness lint --quiet` passes; `node --test tests/*.test.mjs` green; `sync --mode=check` no drift.
7. Plan-vs-implementation review (GPT-5.5 gate) returns GO.
8. CHANGELOG `[Unreleased]` entries present.

## Risks + open questions

| # | Risk / what breaks | Mitigation |
|---|---|---|
| R1 | A review verb that auto-invokes a model is **slow/costly** and could surprise consumers. | C66-6 advisory-by-default; no paid-model invocation without an explicit flag; `--dry-run` prints the dispatch plan. |
| R2 | `review-doc` fact-claim verification is hard to mechanize — risk of **false confidence** if the verb "passes" without truly checking claims. | The verb orchestrates + validates output *shape/coverage* of F1–F5; it does not claim to replace the reviewer's judgment; docs state it is a checklist harness, not an oracle. |
| R3 | `perf-review`/`security-review` checklists too generic to be useful. | Scope strictly to the PR diff; concrete enumerated checklist items (C66-4/C66-5); advisory verdict invites human judgment. |
| R4 | Overlap/confusion with the existing `harness review` (which review do I run?). | The CS64 catalog + REVIEWS leverage edits state clearly: `review` = content-PR orchestration; `review-doc`/`review-cs`/`perf-review`/`security-review` = specialized passes layered on top. |
| R5 | Independence invariant must hold across the new verbs. | C66-6 reuses `check-independence-invariant` machinery; tests assert reviewer ≠ implementer. |
| R6 | Scope (4 verbs) risks bloat. | C66-1 phases wave 2; `review-doc`/`review-cs` are the committed core. |
| Q1 | Open — should `review-cs` also drive the close-out PVI gate, or only verify it? | Resolve in design; default verify-only to avoid overlap with `harness close-out` (CS64). |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: yoga-ah-c3) | f339d30a8691 | 2026-06-06T23:50:00Z | Go-with-amendments | Facts verified (review/review-output/F1-F5/independence/plan-review-hash exist). Applied: review-cs scoped to local verify-only (not model dispatch), added value over the linter stated. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per OPERATIONS.md § Claim) | planned | — | — |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
