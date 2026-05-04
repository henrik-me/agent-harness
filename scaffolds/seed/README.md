# Scaffold: seed

Deterministic, idempotent seed scripts that populate a dev or test environment with
baseline data.

## When to use

Use this scaffold when you need:

- A reproducible baseline dataset for local development (sample users, categories, config
  rows, etc.).
- Deterministic test-fixture data that is too bulky or stateful to inline in test files.
- A documented contract for which environment names are valid seed targets.

Do **not** use this scaffold as a migration tool. Seeds populate data; migrations evolve
schema. See `scaffolds/migrations/` for the migration scaffold.

## What it ships

| Consumer path | Role |
|---|---|
| `seeds/.gitkeep` | Keeps the `seeds/` directory tracked by git before the first real seed is added. |
| `seeds/README.md` | Naming convention (`NNN_<slug>.seed.mjs`), idempotency contract, and authoring guide. |
| `seeds/001_example.seed.mjs` | Annotated example seed exporting `async function seed({ env, log })`. |
| `scripts/run-seeds.mjs` | CLI runner. Walks `seeds/`, sorts by numeric prefix, and awaits each `seed()` in order. |

## Customization points

Every file contains at least one `// TODO: customize` comment that marks where you must
adapt the scaffold to your project:

| File | Customization |
|---|---|
| `seeds/001_example.seed.mjs` | Replace the DB/storage adapter import and the example insert with your real data. |
| `scripts/run-seeds.mjs` | Set the allowed environment names and the idempotency strategy for your project. |
| `seeds/README.md` | Update the idempotency strategy description to match your chosen approach. |

## How to invoke

```
node scripts/run-seeds.mjs [--env <name>] [--only <pattern>] [--dry-run] [--quiet]
```

| Flag | Default | Description |
|---|---|---|
| `--env <name>` | (required) | Target environment name (e.g. `dev`, `test`). |
| `--only <pattern>` | (all) | Run only seeds whose filename contains `<pattern>`. |
| `--dry-run` | off | Print which seeds would run without invoking them. |
| `--quiet` | off | Suppress per-seed progress lines; print only the final summary. |

Exit codes: **0** all seeds passed, **1** at least one seed failed, **2** usage error.

## Configuration

The runner reads no external config file. All runtime behaviour is controlled via CLI
flags. Project-level constraints (allowed env names, idempotency strategy) are encoded
directly in `scripts/run-seeds.mjs` — search for `// TODO: customize` to find them.
