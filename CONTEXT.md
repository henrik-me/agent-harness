# Project Context

> **Last updated:** 2026-05-03

## Codebase state

- Repo skeleton: `bin/`, `lib/`, `template/{managed,composed,seeded}/`, `scripts/`, `scaffolds/`, `schemas/`, `docs/adr/`, `examples/`, `.github/`, `project/clickstops/`
- **Three classes of root files** (per the locked-in decisions in [`harness-cs-plan.md`](project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md)):
  - **Proto managed/composed process docs** (INSTRUCTIONS, CONVENTIONS, OPERATIONS, REVIEWS, TRACKING, RETROSPECTIVES) — hand-authored at CS01, marked `proto, CS01`. **Replaced/merged at CS11** via `harness sync` from `template/managed/` and `template/composed/`.
  - **Seeded project-state docs** (CONTEXT, ARCHITECTURE, LEARNINGS, WORKBOARD) — hand-authored at CS01. **Preserved unless explicitly edited**.
  - **Project-owned files** (root `README.md`, `LICENSE`, `package.json`, `.gitignore`, `.editorconfig`) — **excluded from `harness sync` entirely**.
- **CS01 complete** (closed 2026-05-03). 5 learnings filed (LRN-001 through LRN-005).
- **CS02 complete** (closed 2026-05-03). Delivered: 3 JSON Schemas (`schemas/{harness.config,harness-lock,learning}.schema.json`), 2 ADRs (`docs/adr/{0001-file-classes,0002-readme-ownership}.md`), 3 example configs (`examples/{guesswhatisnext,sub-invaders,agent-harness-self}.harness.config.json`), 1 CI workflow (`.github/workflows/validate-schemas.yml` + `scripts/validate-schemas.mjs`). 10 additional learnings filed (LRN-006 through LRN-015). 24 total learning candidates surfaced; 10 elevated to LEARNINGS.md, 14 dropped per RETROSPECTIVES criteria. devDeps: `ajv`, `ajv-formats`, `js-yaml`.

CS03 (sync engine library) ready to claim per cs-plan. The schemas, ADRs, and learnings together form the contract CS03 must implement.

## Architecture pointer

See [ARCHITECTURE.md](ARCHITECTURE.md).

## Blockers / open questions

- None. CS02 is complete; CS03 is ready to claim.

## CS plan

The full CS plan that drives this repo's evolution lives at [`project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md`](project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md).
