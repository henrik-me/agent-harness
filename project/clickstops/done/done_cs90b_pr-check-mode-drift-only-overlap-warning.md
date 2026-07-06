# CS90b — #392 L3: `harness-pr-check` `pr_check.mode` (drift-only vs lint+drift) + adoption-overlap warning + schema

**Status:** done
**Owner:** yoga-ah-c2
**Branch:** cs90b/content
**Started:** 2026-07-06
**Closed:** 2026-07-06
**Filed by:** CS90 deliverable 2 / C90-6 (2026-07-05 by `yoga-ah`) — implements inbound issue [#392](https://github.com/henrik-me/agent-harness/issues/392) under the layering model fixed by [ADR-0005](../../../docs/adr/0005-ci-drift-review-gate-layering.md) (L3). One of the three mandatory sub-CSs split from CS90 (C90-6).
**Depends on:** **CS90** (HARD) — [ADR-0005](../../../docs/adr/0005-ci-drift-review-gate-layering.md) fixes the L3 layer and the `pr_check.mode` decision. Do NOT claim before user-approval **G90-1** (ADR layering model + CS90a/b/c breakdown) is granted.

## Goal

Implement the **L3** change from ADR-0005: add a `pr_check.mode ∈ {lint+drift (default), drift-only}` toggle to `harness-pr-check.yml` and `schemas/harness.config.schema.json` so a consumer that already runs `harness lint` inline can adopt the managed-drift classifier + `harness-managed-edit-ack` escape valve **without** a redundant second lint; and add an adoption-overlap **warning** when the consumer's own CI already invokes `harness lint` / `sync --mode=check`. Close #392.

## Background

Filed from inbound issue **#392** (state: open — re-verify `gh issue view 392` at claim-time HEAD, F6). `harness-pr-check.yml`'s single `structural-gate` job runs `harness lint --quiet` (line ~116) AND `scripts/check-managed-drift.mjs` (line ~118) in one job; a consumer that already runs `harness lint` as its own required job pays for a redundant second lint just to obtain the managed-drift classifier + escape valve. (L1's `sync --mode=check` runs no lint — it verifies template drift — so it adds no lint here; the redundancy is specifically the doubled `harness lint`.) #392 asks for a mode toggle to split those, plus an overlap warning.

Grounding (verify at claim HEAD):

- `harness-pr-check.yml` reads `pr_check.enabled` from the **BASE** tree config (never the PR head — CS63 R13) via `git show "${PR_BASE_SHA}:harness.config.json"`; `pr_check.mode` MUST be read the same BASE-tree way so a PR cannot disable/alter the gate on itself.
- `harness-pr-check.yml` is **NOT** in the self-host `managed.files` set (it is an adoptable managed file), so editing the template does not regenerate a self-host root copy — but any `pr_check` schema addition is validated by `sync --mode=check` (Ajv) and the config-placeholders / templates linters.
- Schema-is-source-of-truth (LRN-039): the `pr_check.mode` field MUST be added to `schemas/harness.config.schema.json` (locate the existing `pr_check` object; read it before authoring the field) BEFORE any workflow logic reads it, else `sync --mode=check` config validation fails.
- The escape valve (`harness-managed-edit-ack` label + `Harness-managed-edit:` justification line) and the drift classifier are the parts #392 wants adoptable without the lint; `drift-only` must keep BOTH.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C90b-1 | New field | Add `pr_check.mode` with enum `{lint+drift, drift-only}`, default `lint+drift` (back-compat: existing consumers keep today's behaviour). Schema-first: add to `schemas/harness.config.schema.json` with description + default, then wire the workflow. | ADR-0005 C90-3; default-preserving so no consumer's gate changes silently on upgrade. |
| C90b-2 | `drift-only` behaviour | In `drift-only` the `structural-gate` job runs `scripts/check-managed-drift.mjs` + the `harness-managed-edit-ack` escape valve but SKIPS the `harness lint` step. `lint+drift` is unchanged from today. | Removes the exact redundant-lint blocker #392 identifies while keeping the classifier + escape valve. |
| C90b-3 | BASE-tree read | Read `pr_check.mode` from the BASE-branch config (mirroring the existing `pr_check.enabled` BASE-tree read), never the PR head. | CS63 R13: a PR must not be able to weaken the gate on itself by editing its own `pr_check.mode`. |
| C90b-4 | Adoption-overlap warning | Add a warning (in `harness sync`, or a new `harness doctor` — decided at claim recon, Q1) that fires when the consumer's own workflows already invoke `harness lint` / `sync --mode=check` AND `harness-pr-check` would duplicate them, pointing the consumer at `drift-only`. Warning only — never a hard failure. | #392 request 2: surface silent double-gating without blocking adoption. |
| C90b-5 | Tests | Add tests: schema accepts `drift-only`/`lint+drift` and rejects other values; the workflow `drift-only` path skips lint but runs drift+escape-valve; the overlap warning fires on a duplicate-lint consumer config and stays silent otherwise. Minimum coverage — over-delivery encouraged. | LRN-037 (test minimums); the mode toggle + warning are the risk surface. |

## Deliverables

1. `schemas/harness.config.schema.json` — `pr_check.mode` enum `{lint+drift, drift-only}`, default `lint+drift`, with description (schema-first).
2. `template/managed/.github/workflows/harness-pr-check.yml` — read `pr_check.mode` from the BASE config; in `drift-only` run the managed-drift classifier + escape valve but not `harness lint`.
3. Adoption-overlap warning wired into `harness sync` (or `harness doctor`, Q1) with `requireValue`-guarded flags where applicable (LRN-040).
4. Tests (`node --test`) covering the schema enum, the `drift-only` skip-lint path, and the overlap-warning fire/silent cases.
5. `CHANGELOG.md` `[Unreleased]` entry; issue #392 referenced for auto-close on merge.
6. `harness lint` green; `sync --mode=check` clean (schema validates); `node --test tests/*.test.mjs` green.

## User-approval gates

- Inherits **G90-1** (ADR-0005 layering model + CS90a/b/c breakdown). CS90b is not claimed until G90-1 is granted.

## Exit criteria

1. `pr_check.mode=drift-only` runs the managed-drift classifier + `harness-managed-edit-ack` escape valve without running `harness lint`; `lint+drift` (default) is unchanged.
2. `schemas/harness.config.schema.json` validates the new field; `sync --mode=check` clean; an invalid `pr_check.mode` value is rejected by schema validation.
3. The adoption-overlap warning fires when the consumer already runs lint/sync-check and stays silent otherwise.
4. Issue #392 closed. `harness lint` + `node --test tests/*.test.mjs` green.
5. Plan-vs-implementation review (GPT-5.5) GO.

## Risks + open questions

| # | Risk / what breaks | Mitigation |
|---|---|---|
| R1 | A new `pr_check.mode` diverging from the schema → silent config-read failure. | Schema-first (C90b-1): add to `schemas/harness.config.schema.json` and validate via `sync --mode=check` (Ajv) BEFORE the workflow reads it (LRN-039). |
| R2 | Reading `pr_check.mode` from the PR head would let a PR weaken the gate on itself. | BASE-tree read only (C90b-3), mirroring the existing `pr_check.enabled` handling (CS63 R13). |
| R3 | The overlap-warning heuristic (scanning consumer workflows) mis-fires or false-negatives. | Warning-only (never blocks); conservative detection (only fire on a clear `harness lint` / `sync --mode=check` invocation in the consumer's own workflows); test both fire + silent cases. |
| R4 | Default `drift-only` would silently drop lint for existing consumers. | Default is `lint+drift` (C90b-1) — behaviour-preserving; `drift-only` is opt-in. |
| Q1 | Does the overlap warning live in `harness sync` or a new `harness doctor` verb? | Resolve at claim recon; ADR-0005 names both as candidates. A new verb is only added if `sync` is the wrong home (avoid net-new CLI surface unless warranted). |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | cs90-plan-review (yoga-ah) | ad86c005931e | 2026-07-05T16:50:00Z | Go | Verified #392 OPEN; pr_check exists but `mode` absent, base-config read, lint+drift job, flags/paths. No plan amendments. |

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | yoga-ah-c2 |
| Reviewer agent | rubber-duck (orchestrator: yoga-ah-c2) |
| Notes | CS90b implements #392 L3 (`pr_check.mode` drift-only + adoption-overlap warning + schema) per ADR-0005. Independence per REVIEWS.md § 2.3 — reviewer `gpt-5.5` ≠ implementer `claude-opus-4.8`. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| C90b-1: add `pr_check.mode` enum `{lint+drift, drift-only}` (default `lint+drift`) to `schemas/harness.config.schema.json` with description (schema-first) | done | yoga-ah-c2 | role=implementer \| report-status=complete \| learnings=0 |
| C90b-2: wire `template/managed/.github/workflows/harness-pr-check.yml` — read `pr_check.mode` from BASE config; in `drift-only` run managed-drift + `harness-managed-edit-ack` escape valve but SKIP `harness lint` | done | yoga-ah-c2 | role=implementer \| report-status=complete \| learnings=0 |
| C90b-4: adoption-overlap warning (`harness sync` — Q1 resolved: sync, not a new doctor verb) when the consumer already runs `harness lint` / `sync --mode=check`; warn-only, never a hard failure | done | yoga-ah-c2 | role=implementer \| report-status=complete \| learnings=0 |
| C90b-5: tests (`node --test`) — schema accepts `drift-only`/`lint+drift` + rejects other values; `drift-only` skip-lint path; overlap-warning fire/silent cases (20 tests) | done | yoga-ah-c2 | role=implementer \| report-status=complete \| learnings=0 |
| CHANGELOG.md: add `[Unreleased]` entry; reference #392 for auto-close on merge | done | yoga-ah-c2 | report-status=complete \| learnings=0 |
| Local review — GPT-5.5 rubber-duck of the implementation (independence invariant, REVIEWS.md § 2.3) + Copilot engage | done | rubber-duck | role=reviewer \| report-status=complete \| learnings=0 — gpt-5.5 Go (cs90b-review) + Copilot COMMENTED (3 nits addressed, threads resolved) |
| Close-out: docs + restart state (WORKBOARD + CONTEXT + handoff) | in_progress | yoga-ah-c2 | report-status=in_progress \| learnings=0 |
| Close-out: learnings + follow-ups (LEARNINGS.md) | in_progress | yoga-ah-c2 | report-status=in_progress \| learnings=0 |

## Notes / Learnings

- **Implementation.** Delivered by background sub-agent `cs90b-impl` (`claude-opus-4.8`): schema `pr_check.mode` (schema-first), workflow BASE-tree mode read + `drift-only` skip-lint (fail-safe to `lint+drift` on any non-`drift-only` value), and an exported `detectPrCheckLintOverlap()` + report-only `harness sync` advisory (self-host-safe: silent unless `harness-pr-check.yml` is adopted, which the self-host is not). 20 tests, all scratch under `os.tmpdir()`.
- **Review-of-record.** `gpt-5.5` rubber-duck **Go** (`cs90b-review`, no findings) + two delta confirms (`cs90b-review-r2` cosmetic wording, `cs90b-review-r3` case-insensitive scan). Copilot **COMMENTED** with 3 non-blocking nits (byte-for-byte wording, C90-3 vs CS90b naming, case-sensitive scan) — all addressed; the 3 review threads resolved. Chase loop bounded per LRN-221 (one fix-then-resolve pass; no further code cycles).
- **Content PR #526** admin-squash-merged (`47c614b`, CS91 Rec A zero-secret default): the branch was **BEHIND** main because sibling orchestrator filings (**CS113** review-evidence stamping fix + **LRN-222/LRN-223**) advanced main mid-flight — orthogonal (LEARNINGS.md + a new planned CS only; no overlap with CS90b's code files), so a conflict-free admin-merge (the LRN-223 stale-base scenario, cleanly resolved). `read-only-gates` needed a `gh run rerun --failed` after the Go row + Copilot review landed (LRN-194/217).
- **Q1 resolved:** the adoption-overlap warning lives in `harness sync` (report-only advisory mirroring the C64b new-managed-files advisory), NOT a new `harness doctor` verb — avoids net-new CLI surface.
- **No SemVer bump here** (config field + workflow toggle ship under `[Unreleased]`; the next release CS promotes it). Minor when released (new optional `pr_check.mode` field).

## Plan-vs-implementation review

**Reviewer:** GPT-5.5 (rubber-duck, agent `cs90b-pvi`) — independent of implementer `claude-opus-4.8`
**Date:** 2026-07-06
**Outcome:** GO

All 6 Deliverables **match** and all 5 Exit criteria are **met** (verified at merged HEAD `47c614b`): schema `pr_check.mode` enum/default (`schemas/harness.config.schema.json:154-159`); workflow BASE-tree mode read + `drift-only` skip-lint keeping the drift classifier + ack downgrade (`harness-pr-check.yml`); exported `detectPrCheckLintOverlap()` + report-only advisory (`lib/sync.mjs`); 20 tests (targeted 20/20 pass); `[Unreleased]` CHANGELOG entry with #392 (`gh issue view 392` → CLOSED); `harness lint` 43/0/3, `sync --mode=check` no-drift, `node --test tests/*.test.mjs` green. Divergences all **approved** (exported/testable helper; case-insensitive scan per Copilot; workflow fail-safe to `lint+drift`). No unapproved gaps.
