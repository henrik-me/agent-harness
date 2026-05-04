# Scaffold: migrations

One-time copy-and-customize bundle for DB migration workflows: naming convention,
placeholder SQL files, a no-op migration runner, and an optional policy linter
configurable via `harness.config.json`.

## When to use

- Your project manages a relational database and you want a version-controlled
  migration history alongside the application code.
- You need a lightweight runner that prints the migration plan without depending
  on a full ORM or migration framework.
- You want to enforce structural invariants on migration files (paired up/down,
  canonical naming, no accidental destructive statements in up-migrations).

## What it ships

After `harness init --with-scaffold migrations` the following files appear in
the consumer repo (created once; never overwritten by `harness sync`):

- `migrations/.gitkeep` — keeps the empty `migrations/` directory in version control
- `migrations/README.md` — naming convention and workflow guide for contributors
- `migrations/0001_example.up.sql` — placeholder forward migration (customize or delete)
- `migrations/0001_example.down.sql` — placeholder reverse migration (customize or delete)
- `scripts/run-migration.mjs` — migration plan printer with a no-op adapter stub
- `scripts/check-migration-policy.mjs` — optional policy linter (see §Linter contract)

## Customization points

All shipped files contain `-- TODO: customize` or `// TODO: customize` markers:

| File | Customization |
|---|---|
| `migrations/0001_example.up.sql` | Replace with your first real schema change |
| `migrations/0001_example.down.sql` | Mirror the reverse of the up migration |
| `scripts/run-migration.mjs` | Swap the no-op adapter for your real DB client |
| `scripts/check-migration-policy.mjs` | Adjust rule defaults or add project-specific checks |

## How to invoke

All commands run from the consumer repo root.

**Print the migration plan (dry-run):**
```sh
node scripts/run-migration.mjs
node scripts/run-migration.mjs --dir migrations
node scripts/run-migration.mjs --dir migrations --verbose
```

**Run the policy linter:**
```sh
node scripts/check-migration-policy.mjs
node scripts/check-migration-policy.mjs --quiet
node scripts/check-migration-policy.mjs --cwd /path/to/repo
node scripts/check-migration-policy.mjs --config harness.config.json
```

**Integrate with CI:**
```yaml
- run: node scripts/check-migration-policy.mjs --quiet
```

## Configuration

The linter reads `linters['check-migration-policy']` from `harness.config.json`
when that key is present. All keys are optional; missing keys fall back to defaults.

```jsonc
{
  "linters": {
    "check-migration-policy": {
      "dir": "migrations",
      "strict_naming": true,
      "enforce_safe_up": true,
      "unsafe_up_patterns": ["DROP TABLE", "TRUNCATE"]
    }
  }
}
```

| Key | Type | Default | Description |
|---|---|---|---|
| `dir` | `string` | `"migrations"` | Directory to scan, relative to the consumer repo root (or `--cwd`). |
| `strict_naming` | `boolean` | `true` | When `true`, filenames must match `^\d{4}_[a-z0-9-]+\.(up\|down)\.sql$`. Set to `false` to skip the naming check. |
| `enforce_safe_up` | `boolean` | `true` | When `true`, up-migration files are scanned for potentially destructive SQL tokens (see `unsafe_up_patterns`). Set to `false` to disable. |
| `unsafe_up_patterns` | `string[]` | `["DROP TABLE","TRUNCATE"]` | Case-insensitive token list checked in `*.up.sql` files when `enforce_safe_up` is `true`. |

## Linter contract

`scripts/check-migration-policy.mjs` enforces four rules:

### Rules

| # | Rule name | Description |
|---|---|---|
| 1 | **paired-up-down** | Every `*.up.sql` file must have a corresponding `*.down.sql` with the same prefix (and vice versa). |
| 2 | **canonical-naming** | Every file in `migrations/` whose extension is `.sql` must match `^\d{4}_[a-z0-9-]+\.(up\|down)\.sql$`. Configurable via `strict_naming`. |
| 3 | **no-duplicate-prefix** | No two migration files may share the same four-digit numeric prefix (e.g. two `0001_*` files). |
| 4 | **safe-up** | `*.up.sql` files must not contain `DROP TABLE` or `TRUNCATE` (case-insensitive). The token list and enforcement are configurable via `enforce_safe_up` / `unsafe_up_patterns`. |

### CLI

```
Usage: check-migration-policy.mjs [--cwd <path>] [--config <path>] [--quiet]

Options:
  --cwd <path>    Consumer repo root (default: process.cwd())
  --config <path> Path to harness.config.json (default: <cwd>/harness.config.json)
  --quiet         Suppress stdout report on success; still prints violations
  --help          Print this help text
```

### Exit codes

| Code | Meaning |
|---|---|
| `0` | All rules pass |
| `1` | At least one rule violation detected (or config file is malformed JSON) |
| `2` | Usage error (unknown flag, missing flag value) |

### Stdout / stderr discipline

- **stdout** — human-readable violation report (and summary line).
- **stderr** — usage errors only (flag parse errors, missing values).
- With `--quiet`, stdout is suppressed on success (exit 0); violations are still printed.
- Stack traces never appear; all error paths are caught and formatted.

### Fail-closed behaviour

If `harness.config.json` exists but contains malformed JSON, the linter exits 1
with a clear `ERROR: harness.config.json: …` message rather than crashing with a
stack trace or silently defaulting (per LRN-033).
