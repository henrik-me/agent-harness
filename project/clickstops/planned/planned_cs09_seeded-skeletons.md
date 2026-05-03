# CS09 — Seeded skeletons (create-if-missing set)

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** CS08 close-out (per [`harness-cs-plan.md` § CS09](../done/done_cs01_bootstrap-repo/harness-cs-plan.md#cs09--author-seeded-skeletons-the-create-if-missing-set)).
**Depends on:** CS08

## Goal

Author the `template/seeded/` skeletons — empty/structural files that `harness init` creates in a consumer repo if the file does not already exist. Seeded files are created once and never overwritten (unlike managed files which are overwritten on every sync, and composed files which are merged). This CS delivers the full create-if-missing set so a fresh `harness init` produces a linter-passing repo tree with zero manual edits.

## Background

CS01 hand-authored proto process docs and seeded project-state docs (CONTEXT, ARCHITECTURE, LEARNINGS, WORKBOARD) for the harness repo itself. CS08 canonicalized the managed/composed templates. CS09 fills in the seeded skeleton set so the harness can bootstrap a brand-new consumer repo to a clean, linter-passing state via a single `harness init` invocation.

The key behavioral constraint: seeded files are **created if missing, never overwritten**. If a consumer has already written their own CONTEXT.md, `harness sync` must not touch it.

## Deliverables

- [ ] `template/seeded/CONTEXT.md` — skeleton with required H2s: `## Codebase state`, `## Architecture pointer`, `## Blockers / open questions`, `## CS plan`. Includes placeholder text and `> Last updated:` header per `check-context.mjs` requirements.
- [ ] `template/seeded/ARCHITECTURE.md` — skeleton with required sections: Overview + mermaid placeholder, Components, Data model, External integrations, Cross-cutting concerns, Decision log, Known constraints. Must pass `check-architecture.mjs`.
- [ ] `template/seeded/LEARNINGS.md` — header + harvest procedure pointer + empty `## Open` / `## Applied` sections + one example entry slot conforming to `schemas/learning.schema.json`. Must pass `check-learnings.mjs` with 0 entries (or 1 skeleton entry with status `open`).
- [ ] `template/seeded/WORKBOARD.md` — orchestrator table (Agent ID, Machine, Repo Folder, Status, Last Seen) + Active Work table headers + Recently Completed section header. Must pass `check-workboard.mjs`.
- [ ] **`template/seeded/README.md`** — consumer skeleton conforming to READMEGUIDE (`template/managed/READMEGUIDE.md`): one-liner, status badges placeholder, quickstart section, harness pointer, contributing pointer, license section, architecture link, context link. Must pass `check-readme.mjs`.
- [ ] `template/seeded/project/clickstops/planned/.gitkeep`
- [ ] `template/seeded/project/clickstops/active/.gitkeep`
- [ ] `template/seeded/project/clickstops/done/.gitkeep`
- [ ] `template/seeded/harness.config.json` — example consumer config with all required fields populated (per `schemas/harness.config.schema.json`); uses realistic placeholder values.
- [ ] **Fixture test (per GPT-5.5 #1):** `tests/fixtures/cs09/empty-repo/` — a fixture representing an empty consumer repo directory. A test in `tests/cs09-init.test.mjs` (or equivalent) runs `harness init` against this fixture directory and asserts that:
  - `README.md` is produced from `template/seeded/README.md` (proves the seeded README path is exercised even though the harness repo's own root README is project-owned and excluded from sync).
  - `CONTEXT.md`, `ARCHITECTURE.md`, `LEARNINGS.md`, `WORKBOARD.md` are produced.
  - All produced files pass the corresponding `check-*` linters.

## Exit criteria

- `harness init` against an empty fixture directory produces a tree that passes all applicable linters with zero edits required.
- Fixture test green (README produced from seeded skeleton; all linters pass).
- `node --test tests/*.test.mjs` still passes (375+ tests; fixture test adds ≥6 new tests).
- `node scripts/validate-schemas.mjs` still passes.
- `node bin/harness.mjs lint --quiet` exits 0 against this repo.
- All seeded skeleton files themselves pass their corresponding `check-*` linters when referenced directly.
- No `TODO(CS09)` markers remain.

## Sub-agent fan-out

**5 skeletons + fixture test → 6 parallelisable sub-tasks.** Per [LRN-016](../../../LEARNINGS.md#lrn-016), each sub-agent owns exactly its skeleton file(s). Orchestrator owns the fixture test wiring and `harness init` integration. Briefings MUST include:
- Hard "no commit" preflight (per [LRN-021](../../../LEARNINGS.md#lrn-021))
- Explicit file ownership — sub-agent owns exactly its skeleton file(s)
- `schemas/*.schema.json` as mandatory reading before any field access (per [LRN-039](../../../LEARNINGS.md#lrn-039))
- Use consumer-root-relative paths only (NOT source-relative paths) per [LRN-050](../../../LEARNINGS.md#lrn-050)
- Do NOT use dot-notation placeholders `{{X.Y}}` — flat key map only per [LRN-049](../../../LEARNINGS.md#lrn-049)
- After large `edit` operations, verify line count delta matches expectation per [LRN-053](../../../LEARNINGS.md#lrn-053)

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per OPERATIONS.md § Claim) | planned | — | — |

## Notes / Learnings

(filled during execution)
