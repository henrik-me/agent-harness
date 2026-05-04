# Scaffold: health-check

Service health probe pattern: server-side liveness/readiness handler + external probe runner.

## When to use

Use this scaffold when your service needs a standardised `/health` endpoint and an
accompanying probe script that can be called from deployment pipelines, container
orchestrators, or smoke-test suites to verify the service is reachable and ready.

Covers two distinct probe types:

- **Liveness** — confirms the process is alive and the event loop is responsive.
- **Readiness** — confirms all external dependencies (databases, downstream services)
  are reachable before traffic is routed to the instance.

## What it ships

| Consumer path | Role |
|---|---|
| `scripts/health-probe.mjs` | External CLI probe runner. Performs HTTP GET, validates response, exits 0/1/2. |
| `health/handler.mjs.example` | Server-side handler stub. Copy to `health/handler.mjs` and wire into your HTTP server. |
| `health/README.md` | Liveness vs readiness conventions and endpoint naming guide. |

## Customization points

All `// TODO: customize` markers in the shipped files:

- **`health/handler.mjs.example`** — replace the placeholder readiness check with real
  dependency probes (DB ping, downstream fetch, etc.). Import your actual clients.
- **`scripts/health-probe.mjs`** — the default timeout (5 000 ms) and retry count (3)
  are coded as `DEFAULTS`. Adjust them to match your deployment SLA, or override per
  invocation via `--timeout-ms` / `--retries`.
- **Response shape agreement** — the probe runner expects `{ "status": "ok" }` by default.
  If your handler returns a different key or value, either update the handler or pass
  `--expect-key` / `--expect-value` to the probe runner.

## How to invoke

**Probe runner:**

```sh
node scripts/health-probe.mjs --url http://localhost:3000/health
node scripts/health-probe.mjs --url http://localhost:3000/health --timeout-ms 2000 --retries 5
node scripts/health-probe.mjs --url http://localhost:3000/health --quiet
node scripts/health-probe.mjs --url http://localhost:3000/health \
  --expect-key ready --expect-value true
```

Exit codes: `0` = probe passed, `1` = all retries exhausted (probe failed), `2` = usage error.

**Server-side handler:**

```js
// Copy health/handler.mjs.example → health/handler.mjs, then:
import { handleHealth } from './health/handler.mjs';

server.on('request', (req, res) => {
  if (req.method === 'GET' && req.url === '/health') return handleHealth(req, res);
  // ... other routes
});
```

## Configuration

No `harness.config.json` fields are required for this scaffold. All probe behaviour is
controlled via CLI flags on `health-probe.mjs` or by editing the handler directly.

| Flag | Default | Description |
|---|---|---|
| `--url` | *(required)* | URL to probe (HTTP or HTTPS). |
| `--timeout-ms` | `5000` | Per-attempt timeout in milliseconds. |
| `--retries` | `3` | Number of attempts before declaring failure. |
| `--expect-key` | `status` | JSON key to assert in the response body. |
| `--expect-value` | `ok` | Expected string value for `--expect-key`. |
| `--quiet` | off | Suppress success output on stdout (errors still go to stderr). |
