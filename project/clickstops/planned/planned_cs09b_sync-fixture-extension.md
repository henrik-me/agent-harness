# CS09b — Sync fixture extension (`harness sync --mode=check` in init test)

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** CS09 close-out ([LRN-057](../../../LEARNINGS.md#lrn-057) init/sync integration-testing gap).
**Depends on:** CS09

## Goal

Extend the `tests/cs09-init.test.mjs` fixture test to run `harness sync --mode=check` against the init-produced repo, validating that the seeded config does not produce a composed-parser rejection on first sync. This closes the integration-testing gap surfaced by CS09 R2 (LRN-057).

## Background

CS09 delivered a fixture test (`tests/cs09-init.test.mjs`) that runs `harness init` against an empty fixture directory and asserts that the produced files pass linters. However, it did not include a `harness sync --mode=check` step. During CS09 R2, GPT-5.5 identified that an inline harness marker in OPERATIONS.md prose only surfaced as a failure when `harness sync --mode=check` was invoked — not from `harness lint` alone.

The unit tests all passed; the integration bug required both (a) the seeded config enabling OPERATIONS.md as a composed file AND (b) actual sync invocation to surface. This is the gap CS09b closes.

## Deliverables

- [ ] Add `harness sync --mode=check` step to `tests/cs09-init.test.mjs` (or a new `tests/cs09b-sync-check.test.mjs`) that:
  - Runs against the init-produced fixture directory from CS09's test.
  - Asserts exit code 0 (no composed-parser rejection, no drift).
  - Asserts no unexpected file mutations (seeded files untouched by sync).
- [ ] Document the test pattern in OPERATIONS.md under "Integration testing checklist" (or equivalent).

## Exit criteria

- `node --test tests/*.test.mjs` still passes; new step adds ≥2 tests.
- `node scripts/validate-schemas.mjs` still passes.
- `node bin/harness.mjs lint --quiet` exits 0.
- `harness sync --mode=check` against the init fixture exits 0 with no errors.
- No `TODO(CS09b)` markers remain.

## Sub-agent fan-out

**1 sub-agent** (cs09b-sync-fixture): owns the test extension and any OPERATIONS.md documentation update. Briefings MUST include:
- Hard "no commit" preflight (per [LRN-021](../../../LEARNINGS.md#lrn-021))
- Explicit file ownership — sub-agent owns `tests/cs09-init.test.mjs` (or new `tests/cs09b-sync-check.test.mjs`) and any doc update
- Context: LRN-056 (inline marker escape rules) and LRN-057 (integration test gap) as mandatory reading

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per OPERATIONS.md § Claim) | planned | — | — |

## Notes / Learnings

(filled during execution)
