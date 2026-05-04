# Scaffold: feature-flags

Declarative feature-flag configuration plus a consumer-shipped policy linter that catches
stale, structurally invalid, and dangerously long-lived flags before they reach production.

## When to use

Adopt this scaffold when your project needs:

- A lightweight, file-based feature-flag system that works without an external service.
- Automated CI enforcement of flag hygiene rules (expiry dates, naming, ownership).
- A clear lifecycle model — **created → ramped → removed** — with linter-enforced exit criteria.
- An easy migration path to a remote flag service later: swap only `lib/feature-flags.mjs`.

## What it ships

| Consumer path                           | Role                                                          |
|-----------------------------------------|---------------------------------------------------------------|
| `flags/flags.json`                      | Declarative flag registry (array of flag objects).            |
| `flags/README.md`                       | Flag lifecycle guide and schema reference.                    |
| `lib/feature-flags.mjs`                 | Stdlib flag reader: `loadFlags()` + `isEnabled()`.            |
| `scripts/check-feature-flag-policy.mjs` | Shipped linter — run in CI to enforce flag hygiene rules.     |

None of these files are managed by `harness sync` after the initial scaffold drop. They are
yours to extend.

## Customization points

All `// TODO: customize` markers ship inside the scaffold files:

| Marker location                   | What to customize                                                              |
|-----------------------------------|--------------------------------------------------------------------------------|
| `lib/feature-flags.mjs` — rollout-strategy | Replace the djb2 hash with HMAC or a service-specific bucketing algorithm. |
| `lib/feature-flags.mjs` — remote-config adapter | Swap `loadFlags()` for a call to LaunchDarkly, Unleash, Flagsmith, etc. |
| `scripts/check-feature-flag-policy.mjs` — staleness threshold | Adjust the default staleness comparison date. |
| `scripts/check-feature-flag-policy.mjs` — flag-name regex | Tighten or relax the name pattern (e.g. kebab-only vs. snake-allowed). |
| `flags/flags.json` — `_comment` top key | Replace example flags with your project's real flags.                    |

## How to invoke

Drop the scaffold into a consumer repo with:

```sh
node bin/harness.mjs init --with-scaffold feature-flags
```

Then run the linter:

```sh
# Basic
node scripts/check-feature-flag-policy.mjs

# With explicit paths
node scripts/check-feature-flag-policy.mjs \
  --cwd /path/to/consumer \
  --config /path/to/harness.config.json \
  --flags-file flags/flags.json

# Quiet (CI — suppress PASS lines, print only failures)
node scripts/check-feature-flag-policy.mjs --quiet
```

Add to your CI workflow:

```yaml
- name: Lint feature flags
  run: node scripts/check-feature-flag-policy.mjs --quiet
```

## Configuration

The linter reads the `linters['check-feature-flag-policy']` sub-object from
`harness.config.json`. All keys are optional.

```jsonc
{
  "linters": {
    "check-feature-flag-policy": {
      "flagsFile": "flags/flags.json",
      "stalenessThreshold": "2025-06-01",
      "namePattern": "^[a-z][a-z0-9-]*$",
      "fullyOnMaxDays": 90
    }
  }
}
```

| Key                  | Type     | Default                    | Description                                                                                                     |
|----------------------|----------|----------------------------|-----------------------------------------------------------------------------------------------------------------|
| `flagsFile`          | `string` | `flags/flags.json`         | Path to the flags JSON file, relative to `--cwd`.                                                              |
| `stalenessThreshold` | `string` | today (ISO `YYYY-MM-DD`)   | Flags whose `"expires"` date is before this date are reported as STALE. Set to a fixed date for reproducible CI. |
| `namePattern`        | `string` | `^[a-z][a-z0-9_-]*$`      | Regex string that every flag `"name"` must match. Tighten to `^[a-z][a-z0-9-]*$` for kebab-only names.        |
| `fullyOnMaxDays`     | `number` | `90`                       | Warn when a `"rollout": "on"` flag has been past its `"expires"` date for more than N days. Set to `0` to disable. |

CLI flags take precedence over config file values where they overlap (`--flags-file`
overrides `flagsFile`).

## Linter contract

### Rules

| # | Severity | Rule                                                                                                              |
|---|----------|-------------------------------------------------------------------------------------------------------------------|
| 1 | ERROR    | Each flag must have all required fields: `name`, `description`, `default`, `owner`.                              |
| 2 | ERROR    | Flag `name` must match `namePattern` (default `^[a-z][a-z0-9_-]*$`).                                            |
| 3 | ERROR    | Flag names must be unique within the file. Duplicate names are reported with both indices.                        |
| 4 | ERROR    | Flags with an `"expires"` date strictly before `stalenessThreshold` are STALE. Remove or update the expiry.      |
| 5 | ERROR    | `"expires"` (when present and non-null) must be a valid `YYYY-MM-DD` string.                                     |
| 6 | ERROR    | `"rollout"` (when present) must be one of `"off"`, `"percent"`, `"on"`.                                         |
| 7 | ERROR    | `"default"` must be a boolean (not a string or number).                                                          |
| 8 | WARNING  | A `"rollout": "on"` flag whose `"expires"` date is more than `fullyOnMaxDays` days in the past should be removed. |

### Exit codes

| Code | Meaning                                          |
|------|--------------------------------------------------|
| `0`  | All rules passed (warnings do not affect exit).  |
| `1`  | At least one ERROR rule was violated.            |
| `2`  | Usage error (bad arguments, missing flag value). |

### Output channels

- **stdout** — human-readable linting report (PASS / FAIL lines, per-finding detail).
- **stderr** — hard runtime errors only (unreadable file, invalid JSON in config).

`--quiet` suppresses the PASS/WARN lines on stdout; failures are always printed.

### Fail-closed guarantee

A flags file that cannot be parsed (invalid JSON, missing `"flags"` array) is always an
error (exit 1). The linter never silently skips malformed input.
