# OPERATIONS (all-prose source refs — must PASS)

The CLI entry point is `bin/harness.mjs`; add a subcommand there. Linters live
under `scripts/` (for example `scripts/check-text-encoding.mjs`) — source refs
only, never run commands. Consumers validate with `{{harness_invoke}} lint` and
run the suite via `node --test tests/*.test.mjs`. This process base also cites
CS83 and LRN-170, which the invocation scan ignores.
