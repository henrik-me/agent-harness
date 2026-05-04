# CS04d — Global `--ref` flag wiring

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** CS04 close-out (GPT-5.5 R1 non-blocking #2: "`--ref` is parsed globally but never used — pin semantics unspecified").
**Depends on:** CS04

## Goal

Either (a) wire `--ref <git-ref>` through to `lib/sync.mjs::sync()` so it pins the harness ref used to fetch templates, OR (b) reject it explicitly with exit 2 + a clear "not yet implemented — see roadmap" message, so callers aren't misled into believing the ref is being pinned when it isn't.

## Background

During CS04, `--ref` was added to the global argument parser as a forward-looking flag, but the sync engine (`lib/sync.mjs`) does not yet have a ref-pinning mechanism. Like `--config` (per [LRN-027](../../../LEARNINGS.md#lrn-027)), a silently-parsed-but-ignored flag is an anti-pattern. This CS resolves the ambiguity: either implement the semantics fully or reject with a clear message until they're ready.

## Decision to make at claim time

**Option A (full implementation):** `sync()` receives `opts.harnessRef`; when present, uses that ref to fetch template files instead of the configured `version` field. Requires git-aware template fetching in `lib/sync.mjs`.

**Option B (explicit rejection):** `harness sync --ref <anything>` exits 2 with: "–-ref is not yet implemented. To pin a harness version, set `version` in harness.config.json." Option B is the minimum viable fix; Option A is the full feature.

Recommend Option B for the near term (cleaner semantics deferred to a CS where the git-ref-based template fetching is designed properly); implement Option A if/when cs-plan introduces a "live-ref sync" feature.

## Deliverables (Option B — minimum viable)

- [ ] `bin/harness.mjs`: when `--ref` is present AND a sync/check subcommand is active, print an explicit "not yet implemented" message and exit 2.
- [ ] Update `--help` output for sync and check to note that `--ref` is a planned flag.

## Deliverables (Option A — full implementation, if chosen)

- [ ] Extend `lib/sync.mjs::sync(opts)` to accept `opts.harnessRef`.
- [ ] When `harnessRef` is set, fetch template files from `git show <harnessRef>:template/...` instead of the local clone.
- [ ] Document ref-pinning in per-subcommand `--help`.
- [ ] Tests for ref override semantics.

## Exit criteria

- `harness sync --ref v0.2.0` either uses the v0.2.0 templates (Option A) OR exits 2 with a clear message (Option B).
- No silent ignore in either case.
- All existing 224+ tests still pass.

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per OPERATIONS.md § Claim) | planned | — | — |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
