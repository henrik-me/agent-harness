# Scaffold: verify-deploy

Post-deployment verification runner — confirms that a deployed service's version,
key API endpoints, and deployment metadata match expectations before a release is
marked as good.

## When to use

Use this scaffold when your deployment pipeline needs a one-shot, comprehensive
end-to-end gate that runs *after* a release goes live. It is distinct from:

- **smoke** — lightweight reachability check ("is the service up at all?").
- **health-check** — ongoing readiness probe for load-balancer or k8s liveness.

`verify-deploy` is a single invocation per deployment that checks version pinning,
API schema correctness, and environment metadata in one pass. Run it as the final
step in a CD pipeline before marking the release as healthy or triggering any
downstream promotion.

## What it ships

After `harness init --with-scaffold verify-deploy`, your repo gains:

| Consumer path | Role |
|---|---|
| `scripts/verify-deploy.mjs` | Main verifier CLI — runs all checks |
| `scripts/verify-deploy.checks.example.mjs` | Example check definitions (rename and customize) |
| `.github/workflows/verify-deploy.example.yml` | Example GitHub Actions workflow (rename to activate) |

## Customization points

All `// TODO: customize` markers in the shipped files:

### 1. Check list (`scripts/verify-deploy.checks.example.mjs`)

Rename the file to `scripts/verify-deploy.checks.mjs`. Replace the three example
checks (`version`, `healthz`, `deploy-info`) with checks that match your service's
actual endpoints and expected response shapes. Each check is `{ name, path, expect }`
where `expect.json` is an optional assertion function:

```js
// return a failure string, or null to pass
json: (body, ctx) => body.version !== ctx.expectedVersion
  ? `version mismatch: ${body.version}`
  : null,
```

Then update the `import(...)` path in `verify-deploy.mjs` to point to the renamed
file (the `// TODO: customize` comment marks the exact line).

### 2. Expected-version source

Pass `--expected-version` from your CD pipeline. Common patterns:

- Git SHA: `--expected-version $GITHUB_SHA`
- Release tag: `--expected-version ${{ github.ref_name }}`

### 3. Base URL default

`--url` is always required; there is no baked-in default. To avoid repetition in
CI, set a repository variable (`vars.DEPLOY_BASE_URL`) and reference it in the
example workflow — the template already does this.

### 4. Post-failure rollback hook

After the main check loop in `verify-deploy.mjs` there is a `// TODO: customize`
comment block for rollback or alert logic. The `failed` variable holds the count of
failed checks. Add any notification, rollback invocation, or status-page update
here. In GitHub Actions, add a `if: failure()` step after the verify step —
the example workflow includes a commented-out skeleton.

## How to invoke

```
node scripts/verify-deploy.mjs \
  --url <base-url> \
  --expected-version <sha-or-tag> \
  [--checks <name,name,...>] \
  [--quiet]
```

| Flag | Required | Description |
|---|---|---|
| `--url` | yes | Base URL of the deployed service (no trailing slash) |
| `--expected-version` | yes | Expected git SHA or release tag |
| `--checks` | no | Comma-separated check names to run (default: all) |
| `--quiet` | no | Suppress pass lines; emit only failures to stderr |

Exit codes: `0` all passed · `1` one or more checks failed · `2` usage error.

Pass/fail lines are written to **stdout**; error details go to **stderr**.

### Example

```
# Run all checks against the staging environment
node scripts/verify-deploy.mjs \
  --url https://staging.example.com \
  --expected-version abc1234

# Run only the version and healthz checks
node scripts/verify-deploy.mjs \
  --url https://prod.example.com \
  --expected-version v1.2.3 \
  --checks version,healthz
```

## Configuration

No `harness.config.json` keys are consumed by this scaffold. All configuration
is supplied via CLI flags or encoded in the checks file. The example GitHub Actions
workflow uses a `vars.DEPLOY_BASE_URL` repository variable for the base URL, but
that is a CI convention — the script itself has no config-file dependency.
