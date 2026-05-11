# CS33 — Auto-suggest `harness lint --explain <linter>` at the bottom of every linter failure

**Status:** active
**Owner:** orchestrator
**Branch:** cs33/content
**Started:** 2026-05-12
**Closed:** —
**Filed by:** [CS32](../done/done_cs32_harness-lint-ux-hardening.md) close-out (2026-05-12) by `yoga-ah`. CS32/D3 expanded the `LINTER_EXPLANATIONS` registry to all 18 shipped linters; this CS lands the second half of [LRN-104](../../../LEARNINGS.md#lrn-104) — promote `--explain` from an opt-in subcommand to an automatic suggestion at the bottom of every linter failure.
**Depends on:** None. CS32 already shipped the registry that makes this useful for all 18 linters; without this CS the registry is opt-in via `--explain <name>` only.

## Goal

When `harness lint` (or `harness lint --only <name>` / `lint:<name>`) reports any failures from a linter that has a `LINTER_EXPLANATIONS` entry, append a one-line hint to the failure summary:

```
Run `harness lint --explain <linter-name>` for the full rule set.
```

The hint must:

1. Appear once per failing linter (not once per individual error).
2. Appear only when the failing linter has an entry in `LINTER_EXPLANATIONS` (silent for any future linter that hasn't yet been documented — avoids dangling-pointer UX).
3. Be suppressed under `--quiet` mode (consistent with CS27 R2 reasoning).
4. Not change exit codes or error counts.

## Background

[LRN-104](../../../LEARNINGS.md#lrn-104) listed two recommended next steps:

> 1. File a planned CS to populate the `LINTER_EXPLANATIONS` registry for the remaining linters. — **Done in CS32/D3.**
> 2. Consider promoting `--explain` from an opt-in subcommand to an automatic suggestion at the bottom of every linter failure (e.g. "Run `harness lint --explain <name>` for the full rule set" appended to the first error per linter). — **This CS.**

The goal is discoverability: a sub-agent (or first-time human consumer) hitting a non-obvious linter contract should learn about `--explain` from the failure itself, not from grepping the source.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C33-1 | Hint emit point | Aggregator-level (`bin/harness.mjs cmdLint`), after each per-linter result block, not inside individual `scripts/check-*.mjs` scripts | Keeps each linter script unchanged; centralises the UX policy; the aggregator already knows the linter name and pass/fail state. |
| C33-2 | Hint suppression conditions | Suppress under `--quiet`, suppress for linters NOT in `LINTER_EXPLANATIONS`, suppress when the linter passes | Avoids noise; avoids dangling-pointer UX for undocumented linters; only useful on failure. |
| C33-3 | Hint phrasing | `→ Run \`harness lint --explain <name>\` for the full rule set.` (or similar; finalise during implementation) | Distinct from the linter's own error lines; uses an arrow glyph to visually separate the meta-hint from the substantive errors. |

## Deliverables

1. **Edit `bin/harness.mjs cmdLint`** — after each linter result is emitted, if `result.status === 'fail'` AND `LINTER_EXPLANATIONS[name]` exists AND `--quiet` is not set, emit the hint line.
2. **Tests** — extend `tests/cli.test.mjs` (CS33 block) with at least 3 tests:
   - `lint` failing on a linter with an `--explain` entry: hint appears once.
   - `lint --quiet` failing on the same linter: hint suppressed.
   - `lint` failing on a hypothetical linter NOT in the registry: no hint emitted (use a fixture / mock or skip if unrealistic — design during implementation).
3. **CHANGELOG.md** — `[Unreleased] § Changed` entry citing CS33 + LRN-104.
4. **LRN-104 disposition update paragraph** — append a second update paragraph noting the auto-suggest piece is now applied via CS33, completing the LRN-104 follow-up.

## User-approval gates

- **G-release** if CS33 ships in its own tag. Standard pattern.

## Exit criteria

1. `bin/harness.mjs cmdLint` emits the hint per Decision C33-1 / C33-2 / C33-3.
2. ≥ 3 new tests in `tests/cli.test.mjs` covering hint-on, quiet-suppress, no-registry-entry-suppress; all pass.
3. `harness lint --quiet` against the harness self-host passes (full suite).
4. Smoke: deliberately break a linter (e.g. introduce a `## Queued` section into `WORKBOARD.md`), run `harness lint`, observe the hint at the bottom of the workboard failure block. Transcript captured in active CS file Notes.
5. CHANGELOG entry present.
6. LRN-104 disposition update paragraph appended.
7. Plan-vs-implementation review (GPT-5.5 gate) returns GO.

## Risks + open questions

| # | Risk | Mitigation |
|---|---|---|
| R1 | Hint phrasing competes for visual attention with the linter's own error lines | Distinct prefix glyph (→) and explicit "for the full rule set" phrasing make the meta-hint clearly different from substantive errors. Pilot the phrasing during implementation; adjust if it's noisy. |
| R2 | Future linters that ship without an `--explain` entry would be silently undiscoverable via this mechanism | Tracked: when a new linter lands, the contributor checklist should include "add a `LINTER_EXPLANATIONS` entry". The current tests for `--explain unknown-name` already enforce that all 18 shipped linters have entries; any future linter added without one would not regress the current tests but would fail a future "all linters have explanations" coverage test (out of scope for CS33 but reasonable for a follow-up CS if drift becomes a problem). |
| R3 | The hint references `--explain` which itself requires the user to know the linter name | The aggregator already prints the linter name in its result block, so the user can copy it directly. The hint substitutes the actual name, not a `<name>` placeholder. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1 | Read CS file + LRN-104 + bin/harness.mjs cmdLint result-emission path | planned | sub-agent | agent-id=TBD \| role=implementer \| report-status=pending \| learnings=0 |
| T2 | Implement hint-emit at aggregator level (Decision C33-1/C33-2/C33-3) | planned | sub-agent | — |
| T3 | Add ≥3 tests in tests/cli.test.mjs CS33 block (hint-on, --quiet suppress, no-registry-entry suppress) | planned | sub-agent | — |
| T4 | CHANGELOG.md `[Unreleased] § Changed` one-liner citing CS33 + LRN-104 | planned | sub-agent | — |
| T5 | Self-checks (text-encoding, lint --quiet, node --test) | planned | sub-agent | — |
| T6 | Orchestrator: commit on cs33/content, run GPT-5.5 plan-vs-impl gate | planned | orchestrator | — |
| T7 | Open content PR; merge after CI green | planned | orchestrator | — |
| T8 | Close-out: docs + restart state (active→done rename, WORKBOARD prune, LRN-104 disposition update) | planned | orchestrator | per OPERATIONS.md § Claim |
| T9 | Close-out: learnings + follow-ups (file any new LRNs from CS33 implementation) | planned | orchestrator | per OPERATIONS.md § Claim |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
