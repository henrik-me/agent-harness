# Scaffold: cs-probes

Lightweight scripts that verify CS lifecycle readiness gates before and during close-out.

## When to use

Add this scaffold when you want mechanical checks that complement `harness lint`:

- At most one active clickstop **per orchestrator** (keyed on Owner) and each active CS's front-matter is valid.
- All sub-agent task rows in every active CS have a resolved `report-status` value
  (none `pending` or `dispatched`) before you open the close-out PR.

These are gentle, consumer-specific assertions targeting the CS process itself,
not the structural correctness of the repo tree (which `harness lint` already checks).

## What it ships

| Consumer path | Role |
|---|---|
| `scripts/cs-probes/probe-active.mjs` | Validates `project/clickstops/active/` front-matter |
| `scripts/cs-probes/probe-tasks-resolved.mjs` | Checks that every task row has a resolved `report-status` |
| `scripts/cs-probes/run-all.mjs` | Dispatcher: discovers and runs every `probe-*.mjs`, summarizes pass/fail |
| `scripts/cs-probes/README.md` | Consumer-facing usage notes |

## Customization points

Each script contains `// TODO: customize` markers at:

- **probe-active.mjs** — additional front-matter fields to validate beyond the built-in set
  (`Status`, `Owner`, `Branch`, `Started`).
- **probe-tasks-resolved.mjs** — the `RESOLVED_STATUSES` and `UNRESOLVED_STATUSES` sets
  (extend if your project uses non-standard `report-status` values); the Notes column
  index if your Tasks table has more or fewer columns.
- **run-all.mjs** — extra probe scripts to include beyond the auto-discovered `probe-*.mjs`
  set; integration into a pre-PR git hook.
- All probes: wiring into `.git/hooks/pre-push` for automatic enforcement.

## How to invoke

```sh
# Single probe against the current directory
node scripts/cs-probes/probe-active.mjs
node scripts/cs-probes/probe-tasks-resolved.mjs

# Override the repo root (useful in CI or monorepos)
node scripts/cs-probes/probe-active.mjs --cwd /path/to/repo

# Suppress success lines (useful in CI pipelines)
node scripts/cs-probes/probe-active.mjs --quiet

# Run all probes in one pass
node scripts/cs-probes/run-all.mjs [--cwd <path>] [--quiet]
```

Exit codes for every probe: `0` = pass, `1` = fail, `2` = usage error.

## Configuration

No external configuration files are required. All behaviour is controlled via CLI
flags and the `// TODO: customize` markers inside each script.

To wire the probes into a pre-push git hook, add to `.git/hooks/pre-push`:

```sh
#!/bin/sh
node scripts/cs-probes/run-all.mjs --quiet || exit 1
```
