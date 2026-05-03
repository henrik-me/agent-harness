# Project Context

> **Last updated:** 2026-05-03 (CS08 close-out)

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

- **CS05 complete** (closed 2026-05-03). Delivered: `lib/doc-schema.mjs` (shared doc-parsing library with 4 exported functions), `scripts/check-learnings.mjs` (first reference linter), `tests/check-learnings.test.mjs` (17 tests), `tests/doc-schema.test.mjs` (10 tests), 13 fixtures under `tests/fixtures/cs05/`, `bin/harness.mjs` lint subcommand wired. **253 tests pass total** (224+29 new). 3 GPT-5.5 review rounds (R1=5 blockers+4 non-blockers, R2=1 partial-fix blocker, R3=GO). 6 additional learnings filed (LRN-032 through LRN-037): CLI linter path threading, fail-closed parser design, fence-line regex robustness, specific id-pattern matching, stub-promotion test update, sub-agent over-delivery is good. 1 planned CS filed (CS06: 9 structural linters). Squash-merged PR #12 as `adc2777`.

- **CS06 complete** (closed 2026-05-03). Delivered: 9 linter scripts (`check-context`, `check-workboard`, `check-architecture`, `check-clickstop`, `check-instructions`, `check-readme`, `check-composed-blocks`, `check-workflow-pins`, `check-public-artifact`), 9 test files, 50+ fixtures under `tests/fixtures/cs06/`, `bin/harness.mjs` `cmdLint` rewritten as a 10-linter aggregator with `--only`/`--skip`. **333 tests pass total** (253+80 new). 3 GPT-5.5 review rounds (R1=4 blockers+4 non-blockers, R2=1 blocker+1 non-blocker, R3=GO). 6 additional learnings filed (LRN-038 through LRN-043). 2 planned CSs filed (CS06b: shared-parser refactor + cross-link validation; CS07: generic policy linters). `harness lint` aggregator now functional: 8 of 10 linters runnable against this repo (public-artifact skipped — mandatory from CS15a). First true 9-way parallel sub-agent dispatch; zero file races, zero rogue commits. Squash-merged PR #15 as `161b9f3`.

- **CS07 complete** (closed 2026-05-03). Delivered: 4 generic policy linter scripts (`check-pr-body`, `check-commit-trailers`, `check-compose-v2`, `render-deploy-summary`), 4 test files, 23 fixtures under `tests/fixtures/cs07/`, `bin/harness.mjs` `cmdLint` extended to 13-linter aggregator. **375 tests pass total** (333+42 new: 38 from sub-agents + 4 from inline R2 fix). 2 GPT-5.5 review rounds (R1=2 blockers+3 non-blockers all in render-deploy-summary, R2=GO). 5 additional learnings filed (LRN-044 through LRN-048): stdout/stderr discipline in renderers, safety-flag substance validation, per-type-map key selection, inline-vs-sub-agent fix heuristic, 4-way parallel dispatch validated. 1 planned CS filed (CS08: managed/composed process docs canonicalization). `harness lint` aggregator now **13 linters** (10 of 13 runnable; pr-body/compose-v2/public-artifact skipped without targets). Squash-merged PR #18 as `4c3c913`.

- **CS08 complete** (closed 2026-05-03). Delivered: 10 template files (7 process doc templates: `template/managed/INSTRUCTIONS.md`, `template/composed/CONVENTIONS.md`, `template/composed/OPERATIONS.md`, `template/composed/REVIEWS.md`, `template/managed/TRACKING.md`, `template/managed/RETROSPECTIVES.md`, `template/managed/READMEGUIDE.md`; 3 `.github` bundle files: `copilot-instructions.md`, `pull_request_template.md`, `CODEOWNERS`). **375 tests pass total** (docs-only CS, no new tests). 2 GPT-5.5 review rounds (R1=3 blockers+4 non-blockers; R2=1 small NB inline-fixed, GO). 5 additional learnings filed (LRN-049 through LRN-053): dot-notation placeholder trap, consumer-root-relative path rule, template self-reference trap, 8-way parallel dispatch validated, edit-tool truncation near end-of-file. 2 planned CSs filed (CS08b: template linter; CS09: seeded skeletons). `harness lint --quiet`: 9 pass, 0 fail, 3 skipped. Squash-merged PR #21 as `676c494`.

**CS09 (seeded skeletons) is now active (claimed by yoga-ah on branch cs09/content).**

## Architecture pointer

See [ARCHITECTURE.md](ARCHITECTURE.md).

## Blockers / open questions

- None. CS08 is complete; CS09 is now active.

## CS plan

The full CS plan that drives this repo's evolution lives at [`project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md`](project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md).
