# CS10 — Author scaffolds

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** CS09 close-out (per [`harness-cs-plan.md` § CS10](../done/done_cs01_bootstrap-repo/harness-cs-plan.md#cs10--author-scaffolds)).
**Depends on:** CS09

## Goal

Author the `scaffolds/` directory — copy-and-customize starting points for opt-in patterns that consumers can pull into their repo with `harness init --with-scaffold <name>`. Each scaffold is a named bundle of template files with `// TODO: customize` markers, a `README.md` describing the pattern, and an optional shipped linter parameterised via `harness.config.json`. The 8 scaffolds cover the canonical patterns used across the harness consumer base.

## Background

CS09 delivered the seeded skeleton set so a fresh `harness init` produces a linter-passing repo tree with zero manual edits. CS10 layers on top: named scaffold bundles that consumers opt into. Scaffolds are intentionally thinner than managed/composed files — they are one-time copy-and-customize artifacts, not kept in sync by `harness sync`.

The key behavioral constraint: `harness init --with-scaffold <name>` drops scaffold files once (create-if-missing). Subsequent `harness sync` does not touch scaffold output files.

## Deliverables

- [ ] `scaffolds/smoke/` — smoke-test scaffold: `README.md`, template test runner stub.
- [ ] `scaffolds/migrations/` — DB migration scaffold: `README.md`, migration script template, optional `check-migration-policy.mjs` linter. Parameterised via `harness.config.json`.
- [ ] `scaffolds/container-validate/` — container image validation scaffold: `README.md`, validate-image script template.
- [ ] `scaffolds/health-check/` — service health-check scaffold: `README.md`, health probe template.
- [ ] `scaffolds/seed/` — database seed scaffold: `README.md`, seed script template.
- [ ] `scaffolds/verify-deploy/` — deployment verification scaffold: `README.md`, post-deploy checks template.
- [ ] `scaffolds/feature-flags/` — feature flag scaffold: `README.md`, flag-config template, optional `check-feature-flag-policy.mjs` linter. Parameterised via `harness.config.json`.
- [ ] `scaffolds/cs-probes/` — CS readiness probe scaffold: `README.md`, probe script template.
- [ ] Wire `harness init --with-scaffold <name>` to drop the named scaffold (bin/harness.mjs `cmdInit`).
- [ ] Tests in `tests/cs10-scaffolds.test.mjs` asserting that `harness init --with-scaffold smoke` produces the expected files and `harness lint` passes.

## Exit criteria

- `harness init --with-scaffold <name>` drops the scaffold files for all 8 named scaffolds.
- `node --test tests/*.test.mjs` still passes (384+ tests; fixture tests add ≥8 new tests).
- `node scripts/validate-schemas.mjs` still passes.
- `node bin/harness.mjs lint --quiet` exits 0 against this repo.
- All scaffold README.md files pass `check-readme.mjs`.
- No `TODO(CS10)` markers remain.

## Sub-agent fan-out

**8 scaffolds → 8 parallelisable sub-tasks.** Per [LRN-016](../../../LEARNINGS.md#lrn-016), each sub-agent owns exactly its scaffold directory. Orchestrator owns the `cmdInit --with-scaffold` wiring and fixture test. Briefings MUST include:
- Hard "no commit" preflight (per [LRN-021](../../../LEARNINGS.md#lrn-021))
- Explicit file ownership — sub-agent owns exactly its `scaffolds/<name>/` directory
- `schemas/*.schema.json` as mandatory reading before any field access (per [LRN-039](../../../LEARNINGS.md#lrn-039))
- Use consumer-root-relative paths only (NOT source-relative paths) per [LRN-050](../../../LEARNINGS.md#lrn-050)
- Do NOT use dot-notation placeholders `{{X.Y}}` — flat key map only per [LRN-049](../../../LEARNINGS.md#lrn-049)
- After large `edit` operations, verify line count delta matches expectation per [LRN-053](../../../LEARNINGS.md#lrn-053)
- Guard each scaffold-drop step independently — no early-return gates per [LRN-054](../../../LEARNINGS.md#lrn-054)

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per OPERATIONS.md § Claim) | planned | — | — |

## Notes / Learnings

(filled during execution)
