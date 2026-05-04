# Scaffold: container-validate

Validate a built container image before pushing or deploying — checks existence,
labels, tag hygiene, entrypoint, and size in one command.

## When to use

Pull this scaffold when your CI pipeline builds a Docker (or Podman) image and you
need a gate that prevents broken or mislabelled images from reaching a registry. Typical
placement: between the `docker build` step and the `docker push` step.

## What it ships

| Consumer path | Role |
|---|---|
| `scripts/validate-image.mjs` | Main validator — run with Node 20+, pure stdlib |
| `scripts/validate-image.config.example.json` | Example config with expected labels, max size, entrypoint |
| `.dockerignore.example` | Starter dockerignore; rename to `.dockerignore` to adopt |

## Customization points

All `// TODO: customize` markers in `scripts/validate-image.mjs`:

1. **Docker command** — defaults to `docker`. Change to `podman` or `buildah` if your
   environment uses a different container tool.
2. **Expected labels** — list of `key=value` pairs every image must carry (e.g.
   `org.opencontainers.image.version`). Pass via `--labels` or leave the default list
   empty to skip label checks.
3. **Image size threshold** — default `500` MB. Override with `--max-size-mb <N>` or
   change the default constant in the script.
4. **ENTRYPOINT expectation** — default check is disabled (empty array = skip). Set
   `EXPECTED_ENTRYPOINT` in the script to enforce a specific entrypoint.

## How to invoke

```sh
# Minimal — check image exists and is not tagged :latest
node scripts/validate-image.mjs --image myapp:1.2.3

# Check image with required labels
node scripts/validate-image.mjs --image myapp:1.2.3 \
  --labels org.opencontainers.image.version=1.2.3,maintainer=team@example.com

# Enforce a size cap (MB)
node scripts/validate-image.mjs --image myapp:1.2.3 --max-size-mb 200

# All checks, suppress success lines (only errors printed)
node scripts/validate-image.mjs --image myapp:1.2.3 \
  --labels org.opencontainers.image.version=1.2.3 \
  --max-size-mb 200 \
  --quiet

# Show usage
node scripts/validate-image.mjs --help
```

Exit codes:

| Code | Meaning |
|---|---|
| `0` | All checks passed |
| `1` | One or more validation checks failed |
| `2` | Usage error or docker/podman not installed |

## Configuration

This scaffold does not read `harness.config.json`. All parameters are passed as CLI
flags. See `scripts/validate-image.config.example.json` for the list of tunable values
and their defaults.
