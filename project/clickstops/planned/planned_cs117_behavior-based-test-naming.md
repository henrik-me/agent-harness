# CS117 — Adopt behavior-based test-naming convention (document in CONVENTIONS.md)

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** omni-ah (orchestrator, Claude Opus 4.8) on 2026-07-22. Directed by @henrik-me: "regarding naming of tests, they should be named based on what they do not the CS they came from, if necessary there can be a text comment inside the test that documents the link to the original work item."
**Depends on:** none.

## Goal

Record in `CONVENTIONS.md` (+ its composed mirror) that test files are named for the **behavior/unit they verify**, NOT the clickstop that introduced them, and that the originating work-item link goes in an **in-file comment**. Adopt for all new/renamed tests. (Renaming the existing `cs<NN>-*.test.mjs` files — 56 at the reviewed HEAD — is the deferred follow-up **CS118**.)

## Background

- The de-facto convention has been `tests/cs<NN>-<slug>.test.mjs` (filename tied to the clickstop). @henrik-me directed a switch to behavior-based filenames + a comment linking the work item.
- `CONVENTIONS.md` § File naming (line ~13-14) ALREADY says "Test files mirror the module they test" (`composed.test.mjs` → `lib/composed.mjs`) — but that only covers module-mirror tests (`check-*`/`lib-*`); it does NOT govern behavior/integration tests that map to no single module (the `cs<NN>-*` set, or `no-memory-hook.test.mjs`). This CS **REVISES** that bullet to also name behavior tests for what they verify (not the clickstop) and to require the in-file work-item link — superseding, not conflicting with, the existing rule.
- **CS114 already shipped the first behavior-named test** — `tests/no-memory-hook.test.mjs` with a top-of-file `// … Introduced by CS114 …` comment — so this CS documents an already-adopted practice.
- `CONVENTIONS.md` is a **composed** file with a `template/composed/CONVENTIONS.md` mirror; `composed-blocks:CONVENTIONS.md` lint + `sync --mode=check` enforce consistency, so both change in lockstep.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C117-1 | Naming rule (revises the existing § File naming bullet) | Test files are named for WHAT they verify: mirror the module under test where there is one (`composed.test.mjs` → `lib/composed.mjs`), else name a behavior/feature/integration test for the behavior it verifies (`no-memory-hook.test.mjs`) — NEVER the clickstop (`cs<NN>-…`) | Extends (not conflicts with) the existing module-mirror rule; filenames should describe WHAT is tested, surviving CS-history churn (per @henrik-me). |
| C117-2 | Work-item link | Record the originating CS/work item in an **in-file comment** (e.g. a top-of-file `// Introduced by CS114 (…)`), never in the filename | Preserves traceability without coupling the filename to a clickstop. |
| C117-3 | Scope of adoption | Applies to all NEW / renamed tests going forward; module/linter tests (`check-*`, `lib-*`) already follow it | Going-forward adoption; the retroactive bulk rename of existing `cs<NN>-*` tests is CS118 (deferred to a dedicated CS so this doc change stays small). |
| C117-4 | Where documented | REVISE the existing `## File naming` test bullet (currently "Test files mirror the module they test") in `CONVENTIONS.md` **and** the managed core of `template/composed/CONVENTIONS.md`, in lockstep — extend it to cover behavior-naming + the in-file work-item-link rule; do NOT add a separate, competing rule | The existing bullet already governs test filenames; revising it (not adding a second rule) avoids conflicting guidance. Consumers inherit the composed mirror. |

## Deliverables

1. `CONVENTIONS.md` + `template/composed/CONVENTIONS.md` — **REVISE** the `## File naming` test-file bullet (line ~13-14) to state C117-1 (module-mirror OR behavior name, never the clickstop) + C117-2 (in-file work-item-link comment), with a one-line example; edited in lockstep so `composed-blocks:CONVENTIONS.md` + `sync --mode=check` stay clean. Managed core only (do not touch local blocks).
2. Verification: `node bin/harness.mjs lint --quiet` 0-fail (composed-blocks + text-encoding pass); `node bin/harness.mjs sync --mode=check --cwd .` no drift.

## User-approval gates

- Direction approved by @henrik-me this session.

## Exit criteria

1. `CONVENTIONS.md` documents the behavior-based test-naming convention (+ the in-file work-item-link rule); the composed mirror is consistent.
2. `harness lint` + `sync --mode=check` green. Plan-vs-implementation review (gpt-5.6-sol) GO before close-out.

## Risks + open questions

| # | Risk / what breaks | Mitigation |
|---|---|---|
| R1 | Editing only one side of the composed pair → `sync --mode=check` drift + `composed-blocks:CONVENTIONS.md` failure. | C117-4: edit both root + template managed core in lockstep; sync-check is an exit gate. |
| R2 | Scope creep into renaming existing tests. | Out of scope — the bulk rename is CS118. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.6-sol | claude-opus-4.8 | cs117-cs118-plan-review (omni-ah) | 142ee9519174 | 2026-07-22T22:13:55Z | Go | Existing module-mirror guidance is correctly revised, not duplicated; behavior naming, work-item comments, and mirror lockstep are coherent. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per § Claim) | planned | — | — |

## Notes / Learnings

(filled during execution)

- **Plan review (gpt-5.6-sol `cs117-cs118-plan-review`):** R1 **Needs-Fix** — the Background wrongly claimed no test-naming convention existed, but `CONVENTIONS.md` § File naming already mandates module-mirror naming; reframed C117-1/C117-4/Deliverable 1 to REVISE that bullet (not add a competing rule). R2 **Go** (hash `142ee9519174`).

- CS114's `tests/no-memory-hook.test.mjs` is the first behavior-named test (early adoption). The retroactive bulk rename of the existing `cs<NN>-*.test.mjs` files (56 at the reviewed HEAD) is tracked separately as **CS118** (deferred execution per @henrik-me's scope choice — convention now, bulk rename in a dedicated CS).

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
