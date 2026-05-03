# CS04 — CLI dispatcher (`bin/harness.mjs`)

**Status:** active
**Owner:** yoga-ah
**Branch:** `cs04/cli-dispatcher`
**Started:** 2026-05-03T11:30Z
**Closed:** —
**Filed by:** workboard claim PR (note: I missed pre-filing CS04 at CS03 close-out per the LRN-007 pattern; created directly in active/ at claim time. Tiny process gap captured at CS04 close-out.)
**Depends on:** CS03

## Goal

Build the single entry point `bin/harness.mjs` with subcommands that wrap the CS03 sync engine library + future linters. Per cs-plan CS04 deliverables, support: `init | sync | check | lint | harvest | check-migration | composed-audit | pack | version | whoami`.

## Deliverables

See [`done_cs01_bootstrap-repo/harness-cs-plan.md` § CS04](../../done/done_cs01_bootstrap-repo/harness-cs-plan.md) for the canonical deliverables list. Summary:

- `bin/harness.mjs` — CLI dispatcher with 9 subcommands per cs-plan + flags `--cwd`, `--config`, `--dry-run`, `--report`, `--ref`, `--accept-major`, `--explain`
- Each subcommand wraps the appropriate `lib/*.mjs` function (sync, lint, etc.)
- `harness whoami [--explain]` derives the agent ID per Decision #20 (machine-short + repo-short + optional `-c<N>`); reads `HARNESS_AGENT_<SUFFIX_UPPER>_MACHINE` override; `--explain` prints derivation chain
- `harness init` scaffolds `harness.config.json` + seeded files into a target dir
- `harness sync` wraps `lib/sync.mjs` `sync()`; supports apply/check/dry-run modes; major-version + WORKBOARD warnings
- `harness composed-audit --from-existing-harness` (per LRN-019 deferred-to-CS06 — STUB in CS04, full impl in CS06)
- `harness check-migration --from-existing-harness` (similar — initial impl wraps composed-audit + duplicate-script detection per LRN-014)
- `harness harvest [--snooze=<reason>:<deferred_until>]` runs the full harvest procedure + bounded before-claim check
- `harness pack` runs `npm pack --dry-run` and verifies the file whitelist
- `harness version` prints package version + linked harness ref
- Helpful `--help` per subcommand
- Exit codes documented in OPERATIONS.md (CS08 canonicalization)

## Exit criteria

- All 9 subcommands callable; each has `--help`
- `harness whoami` returns correct agent ID for this repo (`yoga-ah` on this machine)
- `harness sync --dry-run` against `examples/agent-harness-self.harness.config.json` produces a sensible diff (no actual writes)
- `npm pack --dry-run` (via `harness pack`) succeeds; whitelist verified
- `validate-schemas` still 31/0
- 162+ tests still pass
- Add CLI tests in `tests/cli.test.mjs` (≥10 tests covering each subcommand's basic dispatch + flag parsing)

## Sub-agent fan-out

8 parallel sub-tasks per cs-plan parallelisation table — one per subcommand. Each gets dispatched per the [OPERATIONS.md § Sub-agent dispatch](../../../OPERATIONS.md#sub-agent-dispatch-proto-cs01) template **with hard preflight per [LRN-021](../../../LEARNINGS.md#lrn-021)** AND **explicit file ownership per [LRN-016](../../../LEARNINGS.md#lrn-016)**.

Critical: all sub-agents will write to `bin/harness.mjs` (single file). To avoid the race that hit CS03, dispatch in a different pattern:
- ONE sub-agent (cs04-dispatcher) builds the dispatcher skeleton + 9 subcommand stubs
- Then 8 parallel sub-agents fill in their specific subcommand body, each working in a SEPARATE branch + their own clone of the repo, and the orchestrator merges them
- OR simpler: dispatch ONE sub-agent for the whole CLI in ONE pass (lower parallelism, but no race risk)

**Recommended (per LRN-016):** ONE sub-agent for the whole CLI to avoid the file race. This trades parallelism for safety. CS04 isn't high-risk and the CLI is mostly thin wrappers around `lib/`, so a single Sonnet 4.6 sub-agent should handle it cleanly.

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| Author bin/harness.mjs (full CLI dispatcher with 9 subcommands) | pending | sub-agent | agent-id=cs04-cli \| role=cli-author \| report-status=pending \| learnings=0 |
| Author tests/cli.test.mjs (per-subcommand dispatch + flag parsing) | pending | sub-agent | agent-id=cs04-cli (same sub-agent — tests live alongside implementation) \| report-status=pending \| learnings=0 |
| Update package.json bin entry verification | pending | sub-agent | agent-id=cs04-cli \| Confirm `"bin": { "harness": "./bin/harness.mjs" }` works via `npm link` test |
| Cross-link integrity merge | pending | yoga-ah | Orchestrator: verify all 9 subcommands callable; whoami derives correctly |
| Local review with GPT-5.5 | pending | yoga-ah | Per REVIEWS.md — iterate until clean |
| Open PR | pending | yoga-ah | branch `cs04/cli-dispatcher` |
| Squash-merge | pending | yoga-ah | After GPT-5.5 review clean |

## Notes / Learnings

(filled during execution)
