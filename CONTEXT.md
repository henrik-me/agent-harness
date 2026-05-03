# Project Context

> **Last updated:** 2026-05-03 (CS04 close-out)

## Codebase state

- Repo skeleton: `bin/`, `lib/`, `template/{managed,composed,seeded}/`, `scripts/`, `scaffolds/`, `schemas/`, `docs/adr/`, `examples/`, `.github/`, `project/clickstops/`
- **Three classes of root files** (per the locked-in decisions in [`harness-cs-plan.md`](project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md)):
  - **Proto managed/composed process docs** (INSTRUCTIONS, CONVENTIONS, OPERATIONS, REVIEWS, TRACKING, RETROSPECTIVES) — hand-authored at CS01, marked `proto, CS01`. **Replaced/merged at CS11** via `harness sync` from `template/managed/` and `template/composed/`.
  - **Seeded project-state docs** (CONTEXT, ARCHITECTURE, LEARNINGS, WORKBOARD) — hand-authored at CS01. **Preserved unless explicitly edited**.
  - **Project-owned files** (root `README.md`, `LICENSE`, `package.json`, `.gitignore`, `.editorconfig`) — **excluded from `harness sync` entirely**.
- **CS01 complete** (closed 2026-05-03). 5 learnings filed (LRN-001 through LRN-005).
- **CS02 complete** (closed 2026-05-03). Delivered: 3 JSON Schemas, 2 ADRs, 3 example configs, 1 CI workflow + script. 10 additional learnings filed (LRN-006 through LRN-015). devDeps: `ajv`, `ajv-formats`, `js-yaml`.
- **CS03 complete** (closed 2026-05-03). HIGH-RISK CS — 7 GPT-5.5 review iterations to converge. Delivered: `lib/{sync,composed,templating,lock}.mjs` (sync engine library), 162 tests pass, 94 fixtures. **Templating + lock APIs are STUBS** (rich APIs lost in parallel-sub-agent file race per LRN-016; recovery filed as planned CS03b). 10 additional learnings filed (LRN-016 through LRN-025): parallel race, sub-agent reports drift, BOM stripping, legacy_composed_mapping schema deferred, composed evolution UX deferred, sub-agent commit-without-permission, multiset accounting, prototype pollution, review iteration cost, path canonicalization single-source.

- **CS04 complete** (closed 2026-05-03). Delivered: `bin/harness.mjs` (10-subcommand CLI dispatcher), `tests/cli.test.mjs` (62 CLI tests). 224 tests pass total. 3 GPT-5.5 review rounds (R1=7 blockers, R2=1, R3=GO). 6 additional learnings filed (LRN-026 through LRN-031): spec cross-reference on derivation logic, silently-ignored CLI flags, stub-subcommand exit codes, Windows spawnSync shell:true, --help forwarding, user-facing surface review calibration. 4 planned CSs filed (CS04b: thread --config; CS04c: pack whitelist; CS04d: --ref wiring; CS05: doc-schema + check-learnings). Squash-merged PR #9 as `13c1411`.

CS05 (doc-schema lib + check-learnings.mjs) ready to claim per cs-plan.

## Architecture pointer

See [ARCHITECTURE.md](ARCHITECTURE.md).

## Blockers / open questions

- None. CS04 is complete; CS05 is ready to claim.

## CS plan

The full CS plan that drives this repo's evolution lives at [`project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md`](project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md).
