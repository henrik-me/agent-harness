# Scaffold: smoke

Lightweight end-to-end smoke-test runner that performs HTTP GET checks against
a deployed or local service, asserts response shape (status code, body
fragments, JSON predicate), and exits 0 when all checks pass or 1 on any
failure. Designed as a post-deploy gate or a local sanity check.

## Quickstart

```sh
node scripts/smoke.mjs --base-url http://localhost:8080
```

Set the `--base-url` flag (or edit the `DEFAULT_BASE_URL` constant in the
script) to point at your service. Then add your own checks to the `CHECKS`
array — one object per endpoint you want to verify.

## When to use

- After a deployment step to confirm the service is reachable and healthy.
- In CI as a gate before promoting an artifact to the next environment.
- Locally, as a quick sanity check before opening a pull request.
- When you need a single, dependency-free script that any engineer can run
  with `node scripts/smoke.mjs` without installing extra packages.

**Do not use** this scaffold when you need full integration tests with
database seeding, complex auth flows, or rich assertion libraries — reach for
a proper test framework instead.

## What it ships

Files dropped into the consumer working directory:

- `scripts/smoke.mjs` — main runner; performs the HTTP checks and exits 0/1.

## Customization points

All customization points are marked `// TODO: customize` in the source.

| Symbol | Location | What to fill in |
|---|---|---|
| `DEFAULT_BASE_URL` | `scripts/smoke.mjs` line ~25 | Base URL of your service (e.g. `https://api.example.com`) |
| `DEFAULT_TIMEOUT_MS` | `scripts/smoke.mjs` line ~28 | Request timeout in ms; tune to your service's typical cold-start |
| `CHECKS` array | `scripts/smoke.mjs` line ~80 | One object per endpoint: `path`, `expect.status`, `expect.bodyIncludes`, `expect.json` |

### Adding a check

```js
{
  label: 'API version endpoint',
  path: '/api/version',                     // TODO: customize
  expect: {
    status: 200,
    bodyIncludes: ['"version"'],             // TODO: customize
    json: (obj) => typeof obj.version === 'string', // TODO: customize
  },
},
```

### Check shape reference

| Field | Type | Description |
|---|---|---|
| `label` | `string` | Human-readable name shown in output |
| `path` | `string` | URL path appended to `baseUrl` |
| `expect.status` | `number` | Expected HTTP status code |
| `expect.bodyIncludes` | `string[]` | Substrings that must appear in the response body |
| `expect.json` | `(obj) => boolean` | Predicate run against the parsed JSON body (optional) |

## How to invoke

Run directly:

```sh
node scripts/smoke.mjs [--base-url <url>] [--timeout <ms>]
```

Suggested `package.json` script entry (do not copy this file — add the entry
to your existing `package.json` manually):

```json
{
  "scripts": {
    "smoke": "node scripts/smoke.mjs"
  }
}
```

Then run with:

```sh
npm run smoke -- --base-url https://staging.example.com
```

### Flags

| Flag | Default | Description |
|---|---|---|
| `--base-url <url>` | `http://localhost:8080` | Base URL of the service |
| `--timeout <ms>` | `5000` | Per-request timeout in milliseconds |
| `--help` | — | Print usage and exit 0 |

### Exit codes

| Code | Meaning |
|---|---|
| `0` | All checks passed |
| `1` | One or more checks failed |
| `2` | Usage error (bad flags) |

## Configuration

No `harness.config.json` keys are required for this scaffold. The smoke
runner is fully self-contained and configured via CLI flags or by editing the
constants at the top of `scripts/smoke.mjs`.

## License

MIT — see the project [LICENSE](LICENSE) file.

## See also

- [ARCHITECTURE.md](ARCHITECTURE.md) — overall harness architecture and
  how scaffolds fit into the consumer workflow.
- [CONTEXT.md](CONTEXT.md) — project state and active clickstops.
