# cs-probes

Readiness-probe scripts for verifying CS lifecycle gates.

## Usage

```sh
# Check that active/ contains one valid, well-formed CS
node scripts/cs-probes/probe-active.mjs [--cwd <repo-root>] [--quiet]

# Check that all task rows in the active CS are resolved
node scripts/cs-probes/probe-tasks-resolved.mjs [--cwd <repo-root>] [--quiet]

# Run all probes in one pass
node scripts/cs-probes/run-all.mjs [--cwd <repo-root>] [--quiet]
```

Exit codes: `0` = pass, `1` = fail, `2` = usage error.

## Pre-PR hook

Add to `.git/hooks/pre-push` to block pushes when probes fail:

```sh
#!/bin/sh
node scripts/cs-probes/run-all.mjs --quiet || exit 1
```

## Customization

Each probe contains `// TODO: customize` markers. See the harness scaffold
`README.md` for the full list of customization points.
