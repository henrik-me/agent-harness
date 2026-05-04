# CS04 — CLI dispatcher (`bin/harness.mjs`)

**Status:** done
**Owner:** yoga-ah
**Branch:** `cs04/cli-dispatcher` (merged) + `cs04/close-out` (close-out)
**Started:** 2026-05-03T11:30Z
**Closed:** 2026-05-03T18:00Z
**Filed by:** workboard claim PR (note: I missed pre-filing CS04 at CS03 close-out per the LRN-007 pattern; created directly in active/ at claim time. Tiny process gap captured at CS04 close-out.)
**Depends on:** CS03

## Goal

Build the single entry point `bin/harness.mjs` with subcommands that wrap the CS03 sync engine library + future linters. Per cs-plan CS04 deliverables, support **10 subcommands**: `init | sync | check | lint | harvest | check-migration | composed-audit | pack | version | whoami`.

## Deliverables

See [`done_cs01_bootstrap-repo/harness-cs-plan.md` § CS04](../done/done_cs01_bootstrap-repo/harness-cs-plan.md) for the canonical deliverables list. Summary:

- `bin/harness.mjs` — CLI dispatcher with 10 subcommands per cs-plan + flags `--cwd`, `--config`, `--dry-run`, `--report`, `--ref`, `--accept-major`, `--explain`
- Each subcommand wraps the appropriate `lib/*.mjs` function (sync, lint, etc.)
- `harness whoami [--explain]` derives the agent ID per Decision #20 (`_copilot(\d+)$` then `(\d+)$` patterns); reads `HARNESS_AGENT_<SUFFIX_UPPER>_MACHINE` override; `--explain` prints derivation chain
- `harness init` scaffolds `harness.config.json` + seeded files into a target dir
- `harness sync` wraps `lib/sync.mjs` `sync()`; supports apply/check/dry-run modes; major-version + WORKBOARD warnings
- `harness composed-audit --from-existing-harness` (STUB in CS04, full impl in CS06 per LRN-019)
- `harness check-migration --from-existing-harness` (STUB in CS04)
- `harness harvest [--snooze=<reason>:<deferred_until>]` (STUB in CS04)
- `harness pack` runs `npm pack --dry-run` (basic sanity; whitelist verification deferred to CS04c)
- `harness version` prints package version + linked harness ref
- Helpful `--help` per subcommand
- Exit codes: 0=success, 1=runtime error, 2=bad invocation, 3=planned-but-not-implemented
- `--config` rejected (exit 2 + pointer to `--cwd`) until threaded through `lib/sync.mjs` in CS04b

## Exit criteria

- All 10 subcommands callable; each has `--help`
- `harness whoami` returns correct agent ID (`yoga-ah`) using Decision #20 patterns (`_copilot(\d+)$` → `(\d+)$`)
- `harness sync --dry-run` against `examples/agent-harness-self.harness.config.json` produces a sensible diff (no actual writes)
- `npm pack --dry-run` (via `harness pack`) succeeds
- `validate-schemas` 31/0 (37/0 after CS04 close-out adds 6 new LRNs)
- 224 tests pass (162 baseline + 62 new CLI tests)

## Sub-agent fan-out

**Decision: ONE sub-agent (cs04-cli) owns the entire CLI** — not 8 parallel sub-agents. Per [LRN-016](../../../LEARNINGS.md#lrn-016), all subcommands write to the SAME file (`bin/harness.mjs`); parallel dispatch would race the same way as CS03.

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| Author bin/harness.mjs (full CLI dispatcher with 10 subcommands) | done | sub-agent | agent-id=cs04-cli \| role=cli-author \| report-status=complete \| learnings=0 |
| Author tests/cli.test.mjs (per-subcommand dispatch + flag parsing) | done | sub-agent | agent-id=cs04-cli (same sub-agent — tests live alongside implementation) \| report-status=complete \| learnings=0 |
| Update package.json bin entry verification | done | sub-agent | agent-id=cs04-cli \| `"bin": { "harness": "./bin/harness.mjs" }` confirmed |
| Cross-link integrity merge | done | yoga-ah | All 10 subcommands callable; whoami derives correctly per Decision #20 |
| Local review with GPT-5.5 | done | yoga-ah | 3 review rounds (R1=7 blockers, R2=1 new blocker [--dry-run alias], R3=GO) |
| Open PR | done | yoga-ah | PR #9 (content: afbaf3a initial + 12a2f6c fixes-r1 + 0b85ddf fixes-r2) |
| Squash-merge | done | yoga-ah | Commit `13c1411` on main; branch deleted |
| Close-out: file 6 new learnings (LRN-026..031) | done | yoga-ah | All 37 LRN entries validate (`node scripts/validate-schemas.mjs` → 37/0 pass) |
| Close-out: file planned CS04b–CS04d + CS05 | done | yoga-ah | 4 planned CS files created |
| Close-out: rename file active → done; update WORKBOARD + CONTEXT | done | yoga-ah | This PR (cs04/close-out) |

## Notes / Learnings

(harvested at close-out; all filed as LRN-026..031)


### Sub-agent ledger summary

**Total work passes: 4 = 1 initial sub-agent job + 1 fix-round sub-agent job + 1 inline orchestrator fix + 1 GPT-5.5 review pass.**

**Initial (cs04-cli):**

- **cs04-cli** (Sonnet 4.6): full implementation of `bin/harness.mjs` + `tests/cli.test.mjs`. Per [LRN-016](../../../LEARNINGS.md#lrn-016) single-sub-agent model chosen to avoid file race. Completed with 0 commits (no-commit preflight honored per [LRN-021](../../../LEARNINGS.md#lrn-021)). 59 CLI tests authored. LRN candidates: 0 escalated (findings emerged during GPT-5.5 review).

**Fix-round (cs04-fixes-r1):**

- **cs04-fixes-r1** (Sonnet 4.6, hard no-commit preflight): fixed all 7 GPT-5.5 R1 blockers in one pass. 0 commits. Blockers addressed: (1) wrong regex in `cloneSuffixFromDir()` (LRN-026); (2) `--config` silent ignore → exit 2 (LRN-027); (3) stub subcommands exit 0 → exit 3 (LRN-028); (4) Windows `spawnSync` without `shell: true` (LRN-029); (5) `--help` forwarding to subcommand (LRN-030); (6) `--dry-run` alias wiring; (7) pack whitelist stub output.

**Inline orchestrator fix (R2):**

- After R2 identified a `--dry-run` alias regression introduced by r1, orchestrator fixed inline: 1 commit by orchestrator (`0b85ddf`). 3 additional tests for `--dry-run` alias added inline.

**GPT-5.5 review rounds:**

- **R1:** 7 blockers + 3 non-blocking. All blockers dispatched to cs04-fixes-r1.
- **R2:** 1 blocker (--dry-run alias regression). Fixed inline by orchestrator.
- **R3:** GO. Content PR #9 merged as squash commit `13c1411`.

### Process observations

- **User-facing CLI calibration (LRN-031):** 3 GPT-5.5 review rounds (R1: 7 blockers, R2: 1 blocker, R3: GO). Even "not high-risk" CSs with user-facing surface need ~3 rounds. Complements LRN-024.
- **Single-sub-agent model vindicated (LRN-016 applied):** zero file-race incidents; all 10 subcommands in one coherent file.
- **Hard preflight effectiveness (LRN-021 applied):** both cs04-cli and cs04-fixes-r1 honored the no-commit preflight; 0 unauthorized commits.

### Final state

- 224 tests pass (162 baseline + 62 new CLI tests, including 3 inline --dry-run tests by orchestrator).
- `bin/harness.mjs`: full 10-subcommand CLI dispatcher, ~350 LOC.
- `tests/cli.test.mjs`: 62 CLI tests covering all subcommands, flag parsing, exit codes, whoami derivation, --help routing.
- `validate-schemas.mjs`: 37/0 (31 prior + 6 new LRN-026..031).
- 6 new LRN entries (LRN-026..031).
- 4 planned CSs filed (CS04b, CS04c, CS04d, CS05).
- Claim PR: #8 (`9931220`). Content PR: #9 (squash-merged as `13c1411`).

## Plan-vs-implementation review

> Grandfathered: closed before plan-vs-implementation review gate was introduced (CS03b).
