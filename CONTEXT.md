# Project Context

> **Last updated:** 2026-05-03

## Codebase state

- Repo skeleton: `bin/`, `lib/`, `template/{managed,composed,seeded}/`, `scripts/`, `scaffolds/`, `schemas/`, `.github/`, `project/clickstops/`
- **Three classes of root files** (per the locked-in decisions in [`harness-cs-plan.md`](project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md)):
  - **Proto managed/composed process docs** (INSTRUCTIONS, CONVENTIONS, OPERATIONS, REVIEWS, TRACKING, RETROSPECTIVES) — hand-authored at CS01, marked `proto, CS01`. **Replaced/merged at CS11** via `harness sync` from `template/managed/` and `template/composed/`.
  - **Seeded project-state docs** (CONTEXT, ARCHITECTURE, LEARNINGS, WORKBOARD) — hand-authored at CS01. **Preserved unless explicitly edited**; CS11 sync only creates these if missing (they're not).
  - **Project-owned files** (root `README.md`, `LICENSE`, `package.json`, `.gitignore`, `.editorconfig`) — **excluded from `harness sync` entirely**.
- The two pre-CS01 planning artifacts archived under `project/clickstops/done/done_cs01_bootstrap-repo/`.
- **CS01 complete** (closed 2026-05-03). 5 learnings filed (LRN-001 through LRN-005); 1 downstream planned CS filed (CS04a). Branch protection deferred to CS15b per [LRN-001](LEARNINGS.md).

No CLI / linters / templates exist yet. Implementation begins in CS02.

## Architecture pointer

See [ARCHITECTURE.md](ARCHITECTURE.md).

## Blockers / open questions

- None at CS01 close. CS02 (schema definitions) ready to claim.

## CS plan

The full CS plan that drives this repo's evolution lives at [`project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md`](project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md).
