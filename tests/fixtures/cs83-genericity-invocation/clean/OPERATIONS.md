# OPERATIONS (composed process base)

Process doctrine for the harness. This base legitimately references specific
learnings and clickstops — e.g. CS83 and LRN-170 — because OPERATIONS.md is a
process doc, not a consumer-onboarding anchor doc. The invocation scan must NOT
flag those tokens (only the anchor scan bans them, and OPERATIONS.md is outside
the anchor scope).

## Validation

Run the aggregate check with `{{harness_invoke}} lint`; a consumer has no local
`scripts/` directory. Run the unit suite with `node --test tests/*.test.mjs`.

## Source layout (prose refs, not run commands)

The CLI entry point lives in `bin/harness.mjs`; to add a subcommand, edit
`bin/harness.mjs`. Individual linters live under `scripts/` (source refs only,
e.g. `scripts/check-text-encoding.mjs`).

<!-- harness:local-start id=operations.harness -->
_(Project-local process notes. Empty by default.)_
<!-- harness:local-end id=operations.harness -->
