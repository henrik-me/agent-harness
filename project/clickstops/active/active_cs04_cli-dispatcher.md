# CS04 — CLI dispatcher (`bin/harness.mjs`)

**Status:** active
**Owner:** yoga-ah
**Branch:** `cs04/cli-dispatcher`
**Started:** 2026-05-03T11:30Z
**Closed:** —
**Filed by:** workboard claim PR (note: I missed pre-filing CS04 at CS03 close-out per the LRN-007 pattern; created directly in active/ at claim time. Tiny process gap captured at CS04 close-out.)
**Depends on:** CS03

## Goal

Build the single entry point `bin/harness.mjs` with subcommands that wrap the CS03 sync engine library + future linters. Per cs-plan CS04 deliverables, support **10 subcommands**: `init | sync | check | lint | harvest | check-migration | composed-audit | pack | version | whoami`.

## Deliverables

See [`done_cs01_bootstrap-repo/harness-cs-plan.md` § CS04](../done/done_cs01_bootstrap-repo/harness-cs-plan.md) for the canonical deliverables list. Summary:

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

**Decision: ONE sub-agent (cs04-cli) owns the entire CLI** — not 8 parallel sub-agents. Per [LRN-016](../../../LEARNINGS.md#lrn-016) (parallel sub-agent file race during CS03), all 10 subcommands write to the SAME file (`bin/harness.mjs`); parallel dispatch would race the same way templating + lock did in CS03. The cs-plan parallelisation table for CS04 listed 8 parallel sub-tasks (one per subcommand) — that was authored before LRN-016 was filed and should be considered REJECTED for CS04 in favor of the single-sub-agent model.

Trade-off: lower parallelism (single Sonnet 4.6 sub-agent dispatch) for ZERO race risk on a one-file deliverable. CS04 is not high-risk per Decision #22 and the CLI is mostly thin wrappers around `lib/sync.mjs`, `lib/composed.mjs`, `lib/lock.mjs`, etc. — so a single sub-agent should handle it cleanly in one pass.

**Briefing requirements** (per LRN-021 + LRN-017):
- Hard "no commit" preflight in the briefing's first paragraph
- Final-checklist requirement: `git status --short` + `git --no-pager log --oneline -1` + literal "No commit was created."
- Explicit file ownership: `bin/harness.mjs`, `tests/cli.test.mjs`, plus optional package.json `bin` field verification (no overlap with other sub-agents since none are running in parallel)
- Post-completion verification: orchestrator runs disk size check on `bin/harness.mjs` to catch under-delivery

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
