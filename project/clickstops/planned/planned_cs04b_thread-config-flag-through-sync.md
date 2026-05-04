# CS04b — Thread `--config` flag through `lib/sync.mjs`

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** [LRN-027](../../../LEARNINGS.md#lrn-027) at CS04 close-out (`--config` parsed but silently ignored; rejected with exit 2 as a stop-gap).
**Depends on:** CS04

## Goal

Fully wire `--config <path>` through the CLI dispatcher into `lib/sync.mjs::sync()` so that `harness sync --config alternate.json` and `harness check --config alternate.json` actually use the alternate config file instead of the default `<consumerRepoPath>/harness.config.json`.

## Background

During CS04, `--config` was added to the global argument parser but never threaded into `lib/sync.mjs`. Because silently ignoring a CLI flag is worse than rejecting it (per [LRN-027](../../../LEARNINGS.md#lrn-027)), the CS04 stop-gap rejects `--config` with exit 2 and a message pointing at `--cwd`. This CS implements the real threading.

## Deliverables

- [ ] Extend `lib/sync.mjs::sync(opts)` to accept `opts.configPath` (absolute or relative string). When present, read config from `configPath` instead of `path.join(consumerRepoPath, 'harness.config.json')`.
- [ ] Update `bin/harness.mjs` sync + check subcommands to pass `configPath` from `--config` into `sync()`.
- [ ] Remove the "exit 2 / not yet wired" guard for `--config` in those subcommands.
- [ ] Handle three error conditions:
  - `configPath` file not found → exit 1 with clear "config file not found: <path>" message
  - `configPath` file is not valid JSON → exit 1 with parse error context
  - `configPath` file fails schema validation → exit 1 with AJV error summary
- [ ] Document `--config` in per-subcommand `--help` output for sync and check.

## Exit criteria

- `harness sync --config path/to/alternate.json` reads the alternate config (not default); verified by test with temp fixture config.
- `harness sync --config /nonexistent/file.json` exits 1 with "config file not found" message.
- `harness sync --config malformed.json` exits 1 with parse error.
- `harness sync --config invalid-schema.json` exits 1 with schema error.
- All existing 224+ tests still pass.
- `node scripts/validate-schemas.mjs` still passes.

## Sub-agent fan-out

Single sub-agent (one file pair: `lib/sync.mjs` + `bin/harness.mjs`). Per [LRN-016](../../../LEARNINGS.md#lrn-016) avoid parallel dispatch to the same files. Briefing MUST include:
- Hard "no commit" preflight (per [LRN-021](../../../LEARNINGS.md#lrn-021))
- Explicit file ownership: sub-agent owns `lib/sync.mjs` + `bin/harness.mjs` + test additions in `tests/cli.test.mjs`
- LRN-027 inline as derivation context

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per OPERATIONS.md § Claim) | planned | — | — |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
