# CS54b — PR template strict-schema refresh (sibling of CS54, deferred per D54-5)

**Status:** active
**Owner:** yoga-ah-c2
**Branch:** cs54b/content
**Started:** 2026-06-06
**Closed:** —
**Filed by:** CS54 close-out (2026-06-03 by `yoga-ah`). CS54 D54-5 explicitly deferred the consumer-side `pull_request_template.md` refresh to a sibling CS because it touches consumer scaffold semantics with its own rollout risk. This file makes that deferred sibling concrete so it is not lost.
**Depends on:** None hard. Related to CS54 (v0.7.0 cross-repo pin-bump checklist) and CS51/CS52 (the strict `## Model audit` / `## Review log` schema). May claim independently.

## Goal

Refresh the managed PR template `template/managed/.github/pull_request_template.md` to the v0.6.0+ strict `## Model audit` (with `Implementer agent` / `Reviewer agent` rows) and `## Review log` (6-column, bare reviewer-model id) schema, and document the upgrade path for existing consumers whose `.github/pull_request_template.md` predates the strict flip.

## Background

CS53 C53-5 made `scripts/check-review-evidence.mjs --strict-agent-columns` the default, so missing `Implementer agent` / `Reviewer agent` rows are now errors. CS54's cross-repo pin-bump checklist (LRN-134) further requires consumer-repo pin-bump PRs to inline canonical `## Model audit` + `## Review log` sections at PR-open time, because `.github/pull_request_template.md` is typically NOT in `harness.config.json` `managed.files` and therefore lags the harness version. The concrete pain surfaced on `henrik-me/sub-invaders` PR #79 (the v0.6.0 pin-bump), which hard-failed the read-only gates three times because SI's template was pre-strict.

The root cause is structural: the harness ships a managed PR template but consumers can carry a stale copy. Two things must change together — (a) the harness's own managed template must already be at the strict schema so fresh consumers inherit it, and (b) there must be a documented, low-risk upgrade path for existing consumers.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C54b-1 | Template target | Update `template/managed/.github/pull_request_template.md` to the strict v0.6.0+ schema: `## Summary`, `## Changes`, `## Testing`, `## Model audit` (key-value table with required `Implementer models` / `Reviewer model` / `Implementer agent` / `Reviewer agent` rows + optional `Notes`), `## Review log` (6-column, bare reviewer-model id). | Fresh `harness init` / `sync` consumers must inherit a template that already passes the strict gates, eliminating the SI PR #79 class of failure at source. |
| C54b-2 | Consumer upgrade path | Document the upgrade as an OPERATIONS.md procedure, NOT an automatic rewrite of consumer files. Reclassifying `.github/pull_request_template.md` as a managed/composed file in a consumer's `harness.config.json` is a consumer-owned decision. | `.github/pull_request_template.md` is consumer scaffold; silently overwriting it on `sync` would be surprising and could clobber consumer customisations. Provide the recipe; let the consumer opt in. |
| C54b-3 | No schema change | No `schemas/harness.config.schema.json` edits. This is a template-text + docs CS. | Avoids forcing a major/minor coupling; the strict schema already exists from CS51/CS52/CS53. |
| C54b-4 | Validation | Add/extend a test that (a) asserts the raw shipped managed template structurally contains the required sections + columns (`## Model audit` with `Implementer agent`/`Reviewer agent` rows, `## Review log` 6-column header), and (b) renders/fills a fixture derived from the template (real 40-char SHA + ISO timestamp + bare reviewer-model id in the `## Review log` Go row) and asserts THAT passes `check-review-evidence.mjs` (default strict) and `check-pr-body.mjs`. The raw template necessarily contains placeholders in the Review-log row, so it must NOT be fed directly to the timestamp/SHA-strict evidence checker. | Locks the template against future drift away from the strict schema without falsely asserting that a placeholder-bearing template passes the SHA/timestamp-strict A4 gate. |

## Deliverables

1. **`template/managed/.github/pull_request_template.md`** — refreshed to the strict v0.6.0+ schema per C54b-1. Mirror any root `.github/pull_request_template.md` if the repo keeps a self-host copy in lockstep.
2. **OPERATIONS.md** — new subsection documenting the consumer upgrade path per C54b-2 (how to adopt the strict template: copy the managed template, or reclassify the path under `managed.files`, plus the inline-sections fallback already documented in the cross-repo pin-bump checklist).
3. **Test** — new or extended test per C54b-4: (a) structural assertions that the raw managed template contains the required strict sections/columns, AND (b) a rendered/filled fixture derived from the template that passes `check-review-evidence.mjs` (default strict) and `check-pr-body.mjs`. The raw placeholder-bearing template is NOT fed directly to the SHA/timestamp-strict evidence checker. Minimum 2 assertions.
4. **CHANGELOG.md** — entry under the next version's `[Unreleased]` block.

## User-approval gates

- **G-release** if CS54b ships in its own tag. Standard pattern.

## Exit criteria

1. Managed PR template updated to the strict schema (C54b-1) and renders the required sections.
2. Consumer upgrade-path subsection present in OPERATIONS.md (C54b-2).
3. Test exists and passes: structural assertions on the raw managed template PLUS a rendered/filled fixture that passes the strict review-evidence + pr-body linters (C54b-4).
4. `harness lint --quiet` passes on self-host (full suite).
5. CHANGELOG entry present.
6. Plan-vs-implementation review (GPT-5.5 gate) returns GO.

## Risks + open questions

| # | Risk | Mitigation |
|---|---|---|
| R1 | Overwriting a consumer's customised template on sync | C54b-2: do NOT auto-rewrite; document an opt-in upgrade path only. |
| R2 | Self-host root template and managed template drifting | If a root `.github/pull_request_template.md` lockstep copy exists, update both in the same PR and assert equality in a test. |
| R3 | Strict template breaks consumers still on pre-strict harness | The template is managed/inherited only on init/sync; existing consumers are unaffected until they opt in. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: yoga-ah) | 56140e6fd999 | 2026-06-03T18:00:00Z | Needs-Fix | Raw template must pass check-review-evidence, but placeholders fail A4; amend to test a filled fixture + structural schema assertions. |
| R2 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: yoga-ah) | d3736b0e24dd | 2026-06-03T18:09:33Z | Go | R1 resolved; raw template structural-only, filled fixture gets strict lint checks; no new blocking issues. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1-TEMPLATE: refresh managed `template/managed/.github/pull_request_template.md` to strict v0.6.0+ schema (Model audit incl. `Notes` row + `Review log` 6-column, bare reviewer-model id) per C54b-1; keep any root self-host copy in lockstep per R2 | done | yoga-ah-c2 | report-status=complete. **Deviation:** target was an orphan; deleted it. Shipped `template/composed/.github/pull_request_template.md` already strict (no change). See Notes. |
| T2-DOCS: OPERATIONS.md consumer upgrade-path subsection (opt-in adoption; no auto-rewrite of consumer files) per C54b-2 | done | yoga-ah-c2 | report-status=complete. Added "Adopting the strict PR template in an existing consumer (CS54b)" to `template/composed/OPERATIONS.md` + rendered root (lockstep). |
| T3-TEST: structural assertions on the raw managed template + a rendered/filled fixture passing `check-review-evidence.mjs` (default strict) and `check-pr-body.mjs` per C54b-4 (min 2 assertions) | done | yoga-ah-c2 | report-status=complete. `tests/cs54b-pr-template-strict.test.mjs` (5 cases) — retargeted to the shipped composed template per the deviation. |
| T4-CHANGELOG: `[Unreleased]` entry per Deliverable 4 | done | yoga-ah-c2 | report-status=complete. |
| Orchestrator integration: full `node --test` + `harness lint --quiet` + `sync --mode=check`; GPT-5.5 rubber-duck local review | active | yoga-ah-c2 | Single-writer. node --test 1118 pass / 0 fail; lint 30/0/3; sync no-drift. GPT-5.5 review at PR. |
| Close-out: docs + restart state — update `WORKBOARD.md` (remove CS54b Active Work row), `CONTEXT.md`, and any process templates/rendered roots as needed | planned | yoga-ah-c2 | — |
| Close-out: learnings + follow-ups — file/disposition learnings in `LEARNINGS.md`; planned follow-ups for unresolved issues | planned | yoga-ah-c2 | — |

## Notes / Learnings

**Deviation (2026-06-06, `yoga-ah-c2`) — C54b-1's target is an orphaned file; implemented against reality per LRN-143 (hashed `## Decisions` / `## Deliverables` left intact).** Pre-implementation investigation found `template/managed/.github/pull_request_template.md` is a **dead orphan**: the PR template was migrated to a *composed* file at CS38a (PR #163), and `.github/pull_request_template.md` is listed under `composed.files` (rendered from `template/composed/.github/pull_request_template.md`), NOT `managed.files`. The `template/managed/` copy is referenced by no code, test, linter, or sync file-list (`grep` across `lib/` / `scripts/` / `bin/` / `tests/` / `harness.config.json`: zero hits) and never ships. The shipped composed template is **already** at the strict v0.6.0+ schema (`## Model audit` with `Implementer agent` / `Reviewer agent` + optional `Notes`; `## Review log` 6-column), so fresh `init` / `sync` consumers already inherit it — the SI PR #79 failure was a *stale consumer copy*, not the harness shipping pre-strict.

**Resolution (delivers the Deliverables' intent against reality):**
- C54b-1 / Deliverable 1 → **deleted** the orphan `template/managed/.github/pull_request_template.md` (removes the very drift-risk duplicate this CS exists to prevent); the shipped `template/composed/.github/pull_request_template.md` is already strict (verified — no change needed).
- C54b-4 / Deliverable 3 → the new `tests/cs54b-pr-template-strict.test.mjs` asserts the **composed** (shipped) template's strict structure + a filled fixture passing `check-review-evidence.mjs` (strict) and `check-pr-body.mjs` (retargeted from the orphan).
- C54b-2 / Deliverables 2 & 4 (OPERATIONS upgrade-path subsection + CHANGELOG) → unchanged.

**Learning:** the plan (and its R1/R2 plan review) targeted an orphaned path and asserted the shipped template was pre-strict — a plan-side fact-claim miss that supports CS58 / LRN-139. To be filed as a new LRN at close-out.

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | yoga-ah-c2 |
| Reviewer agent | rubber-duck |

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
