# CS61 — Apply LRN-145: shared reviews-policy config reader + schema-conformance review item

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** CS60 follow-up (2026-06-05 by `yoga-ah`). Applies **LRN-145** (schema-conformance review gap) and closes the **LRN-142** residual (shared `lib/` config accessor + `check-review-log-evidence.mjs` hard-coded `gpt-5.5`). Surfaced when a GPT-5.5 review-of-record gave Go on a linter that over-required schema-optional config fields; Copilot caught it post-Go by cross-referencing the schema.
**Depends on:** None hard. Builds on CS57 (`check-clickstop-implementer-not-reviewer.mjs` config-sourcing) and CS60 (`check-independence-invariant.mjs` de-drift, which is the gold-standard semantics to factor out). May claim independently.

## Goal

Eliminate the per-check duplication and drift in how harness review-gate linters read review policy from `harness.config.json`. Introduce a single canonical reviews-policy reader in `lib/config-reader.mjs` with **"apply schema default when absent, fail closed only on malformed-present"** semantics (LRN-145 rule 1), migrate all consumers to it (removing every hard-coded `gpt-5.5` / high-risk-list literal under `scripts/checks/`), and add the LRN-145 rule-2 schema-conformance verification item to the rubber-duck review checklist (`REVIEWS.md`).

## Background

`lib/config-reader.mjs` exists but only exposes generic `loadConfig`/`writeConfig` (full AJV). There is no shared *reviews-policy* accessor, so four checks each roll their own with inconsistent semantics (verified at CS60 close `c339fe5`/`bbe5cd9`):

- `scripts/checks/check-independence-invariant.mjs` — correct (CS60): local `SCHEMA_DEFAULT_*` constants, default-when-absent + fail-closed-on-malformed. **Gold standard to factor out.**
- `scripts/check-clickstop-implementer-not-reviewer.mjs` — reads `reviews.high_risk_clickstops` from config (default-when-absent + fail-closed, CS57) **but** hard-codes `PRIMARY_REVIEWER_MODEL = normalizeModelId('gpt-5.5')` (L307). Partial drift. Also owns the GPT-5.5 non-high-risk reviewer-overlap exception and the `MODEL_AUDIT_ENFORCEMENT_DATE` grandfather gate — both must survive.
- `scripts/checks/check-review-log-evidence.mjs` — hard-codes `PRIMARY_REVIEWER_MODEL = 'gpt-5.5'` (L14), no config read. **The named LRN-142 residual.**
- `scripts/checks/check-copilot-review-attached.mjs` — own `loadReviewsConfig` (L50): fails closed (throws `UsageError`) only on **invalid JSON**, but returns `{}` on a missing file **and** on a present-but-non-object `reviews` (L52/L55) — **shape-lenient**, the LRN-145 rule-1 anti-pattern for malformed-shape inputs.

Two further consumers read individual review-policy keys and are in audit scope (C61-4), not the four-check core migration:
- `scripts/check-review-gates.mjs` (L91) reads `reviews.enforce_gates` with `!== true` (absent → skip). Schema default is `true`, so a naive default-when-absent migration would **flip absent-config behavior from skip to enforce** — migrate behavior-preserving or defer.
- `lib/review.mjs` (L25) sets `DEFAULT_REVIEW_CONFIG.high_risk_clickstops: []`, which **diverges from the schema default** (the CS list). Migrating it to schema defaults is **not** behavior-preserving — C61-4 must explicitly choose migrate-with-change (escalate) or defer.

The schema (`schemas/harness.config.schema.json`) is the source of truth: `reviews` has no `required` array and defines `default`s `rubber_duck_model: "gpt-5.5"`, `fallback_model: "sonnet-4.6"`, `high_risk_clickstops: ["CS03","CS11","CS15a","CS18b","CS19"]`, `copilot_reviewer_slug`, etc.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C61-1 | Shared reader | Add `loadReviewsPolicy({ cwd, configPath })` (+ a `ReviewsConfigError`) to `lib/config-reader.mjs` returning the normalized reviews policy (`rubber_duck_model`, `fallback_model`, `high_risk_clickstops`, `copilot_reviewer_slug`, `enforce_gates`, …). Semantics: **apply the schema default when a field is absent; fail closed (throw) only on a present-but-malformed value** (wrong type / bad pattern / duplicate). Validation is scoped to the **`reviews` subtree only** (not the full config schema) so lightweight fixtures/configs that omit unrelated keys still load. Missing config file or missing `reviews` key → all-defaults; an explicit `--config <nonexistent>` path → throw. | Single source for the LRN-145 rule-1 policy; mirrors the CS60 `check-independence-invariant.mjs` semantics that are already correct. Subtree-only validation avoids regressing checks that accept partial configs today. |
| C61-2 | Defaults source | The shared reader sources its defaults by reading the `default` values from `schemas/harness.config.schema.json` at load time, **not** a new hard-coded constant block. | Avoids relocating the drift (LRN-039 schema-is-source-of-truth); a single read keeps schema authoritative. If a runtime schema read is undesirable, the fallback is ONE shared constant table in `lib/config-reader.mjs` with a test asserting it equals the schema defaults. |
| C61-3 | Migrate consumers | Migrate all four checks to `loadReviewsPolicy`: (a) `check-review-log-evidence.mjs` — drop hard-coded `gpt-5.5`; (b) `check-clickstop-implementer-not-reviewer.mjs` — drop hard-coded `PRIMARY_REVIEWER_MODEL` + local `loadHighRiskClickstops`, **preserving** the GPT-5.5 non-high-risk overlap exception and the date-gate grandfathering; (c) `check-copilot-review-attached.mjs` — replace shape-lenient `loadReviewsConfig` (returns `{}` on non-object `reviews`) with the shared reader, flipping malformed-shape inputs to fail-closed while keeping missing-file/absent-`reviews` → defaults; (d) `check-independence-invariant.mjs` — swap its local `SCHEMA_DEFAULT_*` + `loadReviewsConfig` for the shared reader (low risk — already-correct semantics). | Removes every hard-coded review-policy literal under `scripts/checks/`; makes all gates consistent. |
| C61-4 | Runtime / other consumers | Audit `lib/review.mjs`, `bin/harness.mjs`, and `scripts/check-review-gates.mjs` for review-policy reads; migrate to `loadReviewsPolicy` **only where behavior is preserved**. Two known divergences are **defer-or-escalate, not silent**: (i) `lib/review.mjs` defaults `high_risk_clickstops` to `[]` vs the schema's CS list — adopting schema defaults changes which CSs are high-risk; (ii) `check-review-gates.mjs` treats absent `enforce_gates` as skip vs the schema default `true` — naive migration flips skip→enforce. For each, either keep the current local default (documented divergence) or change-with-escalation + CHANGELOG; never flip silently. | LRN-142 noted these "silently default or incidentally crash"; the audit closes the loop, but the two schema-vs-runtime default mismatches are behavior changes that must be a conscious, escalated decision. |
| C61-5 | Review doctrine (LRN-145 rule 2) | Add a **schema-conformance** verification item to the rubber-duck review checklist in `REVIEWS.md` (adjacent to § 2.6a F1–F5): a change that adds/edits a config or schema reader MUST diff the reader's enforced-required set and defaults against the schema's `required` array + per-field `default`s; "linter requires a field the schema marks optional/defaulted" (or the inverse) is a P0 blind spot. Mirror to `template/composed/OPERATIONS.md` / `template/managed/.github/copilot-instructions.md` only if the checklist is duplicated there. | Codifies the gap that let the CS60 over-require pass three rubber-duck rounds; parallel to the LRN-139 plan-side fact-claim doctrine. |
| C61-6 | Learnings lifecycle | Transition **LRN-145** `open → applied`; update the **LRN-142** disposition to mark the `check-review-log-evidence.mjs` residual resolved. | Standard lifecycle; closes both the LRN-145 surface and the LRN-142 residual in one CS. |
| C61-7 | Tests | Add a dedicated `tests/cs61-reviews-policy-reader.test.mjs` covering default-when-absent, fail-closed-on-malformed (each field), explicit-missing-config, and schema-default parity; keep each migrated check's existing tests green (baseline-run first). | LRN-094/CS25 test-hygiene: scratch dirs under `os.tmpdir()`, never REPO_ROOT. |

## Deliverables

1. **`lib/config-reader.mjs`** — new `loadReviewsPolicy({ cwd, configPath })` + `ReviewsConfigError`, schema-default-sourced, default-when-absent / fail-closed-on-malformed (C61-1/C61-2).
2. **`scripts/checks/check-review-log-evidence.mjs`** — replace hard-coded `gpt-5.5` with the shared reader (C61-3a).
3. **`scripts/check-clickstop-implementer-not-reviewer.mjs`** — replace hard-coded `PRIMARY_REVIEWER_MODEL` + local high-risk loader with the shared reader, preserving the non-high-risk overlap exception + date-gate (C61-3b).
4. **`scripts/checks/check-copilot-review-attached.mjs`** — replace lenient `loadReviewsConfig` with the shared reader (C61-3c).
5. **`scripts/checks/check-independence-invariant.mjs`** — swap local `SCHEMA_DEFAULT_*`/`loadReviewsConfig` for the shared reader (C61-3d).
6. **`lib/review.mjs` + `bin/harness.mjs` + `scripts/check-review-gates.mjs`** — migrate existing review-policy reads to the shared reader where behavior is unchanged; the `high_risk`/`enforce_gates` default mismatches are defer-or-escalate (C61-4).
7. **`REVIEWS.md`** (+ lockstep mirrors if applicable) — schema-conformance review-checklist item (C61-5).
8. **`tests/cs61-reviews-policy-reader.test.mjs`** (new) + updates to any migrated check's tests/fixtures (C61-7).
9. **`LEARNINGS.md`** — LRN-145 `open → applied`; LRN-142 disposition residual marked resolved (C61-6).
10. **`CHANGELOG.md`** — entry under `[Unreleased]`.

## Parallelization / dispatch plan

`lib/config-reader.mjs` reader is the **blocking prerequisite**; the per-check migrations then fan out (disjoint files) and the REVIEWS.md doc runs in parallel.

| WS | Owns (write) | Notes |
|---|---|---|
| **WS-READER** (first) | `lib/config-reader.mjs`, `tests/cs61-reviews-policy-reader.test.mjs` | Blocking. Defines `loadReviewsPolicy` + tests. |
| **WS-CHECKS-A** | `scripts/checks/check-review-log-evidence.mjs`, `scripts/checks/check-independence-invariant.mjs` (+ their tests) | After WS-READER. |
| **WS-CHECKS-B** | `scripts/check-clickstop-implementer-not-reviewer.mjs`, `scripts/checks/check-copilot-review-attached.mjs` (+ their tests/fixtures) | After WS-READER. Highest-risk migrations (exception/date-gate; lenient→fail-closed). |
| **WS-RUNTIME** | `lib/review.mjs`, `bin/harness.mjs`, `scripts/check-review-gates.mjs` | After WS-READER. Behavior-preserving only; the `high_risk`/`enforce_gates` schema-vs-runtime default mismatches are defer-or-escalate (C61-4). |
| **WS-DOCS** | `REVIEWS.md` (+ mirrors) | Parallel from the start. |
| **Orchestrator (serial)** | `LEARNINGS.md`, `CHANGELOG.md` | Integration after WS complete; full lint + PVI. |

## User-approval gates

- **G-release** if CS61 ships in its own tag; otherwise rides the next release cut.

## Exit criteria

1. `lib/config-reader.mjs` exposes `loadReviewsPolicy` with default-when-absent + fail-closed-on-malformed semantics, defaults sourced from (or test-asserted equal to) the schema (C61-1/C61-2).
2. **Zero** hard-coded **review-policy** `gpt-5.5` / high-risk-clickstop literals remain under `scripts/checks/` and `scripts/check-clickstop-implementer-not-reviewer.mjs` (examples, help text, comments, and test fixtures are out of scope); all four checks consume the shared reader (C61-3).
3. The CS57 GPT-5.5 non-high-risk overlap exception and the `MODEL_AUDIT_ENFORCEMENT_DATE` grandfather gate still behave identically (regression-asserted) (C61-3b).
4. `check-copilot-review-attached` now fails closed on malformed `reviews` (was silently lenient), with fixtures/tests updated; baseline-run recorded in Notes (C61-3c).
5. `lib/review.mjs`, `bin/harness.mjs`, and `scripts/check-review-gates.mjs` review-policy reads use the shared reader **where behavior-preserving**; the two schema-vs-runtime default mismatches are explicitly resolved (defer or escalate + CHANGELOG), not silently flipped (C61-4/R6).
6. `REVIEWS.md` carries the schema-conformance review-checklist item, mirrors in lockstep where applicable (C61-5).
7. LRN-145 `applied`; LRN-142 disposition residual marked resolved (C61-6).
8. `harness lint --quiet` passes (full suite, incl. composed/managed lockstep); full `node --test` green.
9. CHANGELOG entry present.
10. Plan-vs-implementation review (GPT-5.5 gate) returns GO.

## Risks + open questions

| # | Risk | Mitigation |
|---|---|---|
| R1 | Shared reader reintroduces a hard-coded default → moves the drift instead of removing it | C61-2 sources defaults from the schema (or a single constant with a schema-parity test); a test asserts reader defaults == schema defaults. |
| R2 | `check-copilot-review-attached` flip lenient→fail-closed newly fails existing fixtures | Baseline-run before changing; update fixtures/tests; record the behavior change in Notes + CHANGELOG. |
| R3 | Migrating `check-clickstop-implementer-not-reviewer` drops the CS57 overlap exception or date-gate | Preserve both explicitly; keep the CS57 regression tests; add an exception-preserved assertion. |
| R4 | Runtime schema read adds I/O cost / failure surface to every check invocation | Read+cache once per process; or use the single-constant + parity-test fallback (C61-2). |
| R5 | Scope creep into a broad config refactor | Bounded to the reviews-policy keys only; runtime consumers migrated behavior-preserving (C61-4); escalate anything wider. |
| R6 | Schema-vs-runtime default mismatch (`high_risk_clickstops` `[]` in `lib/review.mjs`; `enforce_gates` absent→skip in `check-review-gates.mjs`) silently flips behavior when migrated | C61-4 makes both an explicit defer-or-escalate decision with CHANGELOG note; never adopt the schema default silently for these two. Subtree-validation + per-field tests guard the rest. |
| Q1 | Open: should the shared reader live in `lib/config-reader.mjs` or a new `lib/reviews-policy.mjs`? | Default to extending `lib/config-reader.mjs` (already the config home); revisit if it bloats. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: `yoga-ah`) | ccb1eb97ab81 | 2026-06-05T16:03:00Z | Go-with-amendments | Verified C1-3,5,6; fixed C4 (copilot-review-attached is shape-lenient/JSON-fail-closed); added check-review-gates + lib/review.mjs default-divergence consumers; subtree validation. Amendments applied. |
| R2 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: `yoga-ah`) | ccb1eb97ab81 | 2026-06-05T16:10:05Z | Go | R1 amendments confirmed applied (C4 wording, +2 consumers, subtree validation, EC2/EC5 scoping); no internal contradictions remain. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per OPERATIONS.md § Claim) | planned | — | — |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
