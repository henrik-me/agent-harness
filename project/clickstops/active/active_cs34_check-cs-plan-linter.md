# CS34 — `check-cs-plan.mjs` linter — flag harness-repo-relative paths in consumer-targeted CS plans

**Status:** active
**Owner:** orchestrator
**Branch:** cs34/content
**Started:** 2026-05-12
**Closed:** —
**Filed by:** [CS32](../done/done_cs32_harness-lint-ux-hardening.md) close-out (2026-05-12) by `yoga-ah`. CS32/D2 added a "Cross-repo path discipline" bullet to the mandatory sub-agent briefing preamble, addressing the human-readable side of [LRN-105](../../../LEARNINGS.md#lrn-105). This CS lands the machine-enforced side — a linter that catches the bug before a sub-agent gets dispatched with the wrong paths.
**Depends on:** None. CS32 shipped the briefing-preamble bullet; this CS hardens the same contract with automated detection.

## Goal

A new linter, `scripts/check-cs-plan.mjs`, registered in the harness lint runner, that scans CS plan files (`project/clickstops/{active,done,planned}/*.md`) and flags references to harness-repo-internal paths (`template/composed/...`, `template/seeded/...`, `lib/...`, `bin/...`, `scripts/...`) when the CS plan's *target* is a consumer repo.

The "target is a consumer repo" heuristic must be designed during implementation. Candidate signals:

1. The repo running the linter is **not** the agent-harness itself (`package.json#name !== '@henrik-me/agent-harness'`). Any CS plan in such a repo that mentions `template/composed/...` is almost certainly a wrong-perspective path → ERROR.
2. Within the agent-harness repo, scan CS plans for blocks fenced as "consumer dispatch" (TBD: a marker like `<!-- cs-plan:consumer-target -->` could be introduced) and apply the rule only inside those blocks.

The simplest first cut is signal (1) — fail-loud-in-consumer-repos, silent-in-harness-self-host. That alone closes the LRN-105 failure mode (the SI agent's CS01/A5 bug). Signal (2) can be added later if cross-repo dispatches inside the harness repo become common.

## Background

[LRN-105](../../../LEARNINGS.md#lrn-105) listed two recommended next steps:

> 1. Add a check to the harness's CS-plan template (or a new `check-cs-plan.mjs` linter) that flags `template/composed/` and `template/seeded/` references in CS plans whose target is a *consumer* repo. — **This CS.**
> 2. Cross-reference this LRN in the canonical sub-agent briefing preamble. — **Done in CS32/D2.**

The goal is to catch the bug at lint time (before the orchestrator dispatches a sub-agent) instead of at sub-agent runtime (where the cost is a confused sub-agent + a manual correction round-trip + downstream re-dispatch).

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C34-1 | Detection signal (first cut) | `package.json#name !== '@henrik-me/agent-harness'` AND CS plan mentions any of the path prefixes (`template/composed/`, `template/seeded/`, `lib/`, `bin/`, `scripts/`) outside fenced code blocks AND outside markdown links to harness-repo issues / PRs | Self-host-aware: the harness's own CS plans legitimately reference these paths because the harness IS the harness. Consumer repos referencing them is the actual bug. |
| C34-2 | Severity | ERROR (fails the lint run) | Soft-warning would let the bug ship; the SI-CS01/A5 case shows the failure mode is real. |
| C34-3 | Configurability | Path prefix list configurable via `harness.config.json` (e.g. `cs_plan_lint.forbidden_path_prefixes`); defaults baked in | Forward-compatible: future harness internal directories can be added without a code change. |
| C34-4 | Scope | All CS plans under `project/clickstops/{active,done,planned}/` (recursive) | Catches the bug at any lifecycle stage; done plans are immutable but flagging them retroactively serves as documentation. |
| C34-5 | Self-host guard | Linter exits 0 with a "skipped (self-host)" note when running inside the harness repo | Prevents the harness's legitimate references from breaking its own CI. |

## Deliverables

1. **`scripts/check-cs-plan.mjs`** — new script implementing C34-1..C34-5. Top-of-file docstring matches the pattern used by other `scripts/check-*.mjs`.
2. **Register in lint runner** — `bin/harness.mjs cmdLint` adds `cs-plan` to the linters list (and a corresponding entry in `LINTER_EXPLANATIONS` per the CS32/D3 pattern).
3. **Fixtures** — `tests/fixtures/cs-plan-lint/` with at least 4 fixture CS plans:
   - Consumer-target plan with `template/composed/CONVENTIONS.md` reference → ERROR.
   - Consumer-target plan with `lib/composed.mjs` reference → ERROR.
   - Consumer-target plan with `template/composed/CONVENTIONS.md` mention inside a fenced code block (literal example) → no error.
   - Harness-self-host plan with the same references → no error (self-host guard).
4. **Tests** — `tests/check-cs-plan.test.mjs` exercising all 4 fixtures + a `--quiet` test + an aggregator integration test.
5. **CHANGELOG.md** — `[Unreleased] § Added` entry citing CS34 + LRN-105.
6. **LRN-105 disposition update paragraph** — append a second update paragraph noting the linter is now applied via CS34, completing the LRN-105 follow-up.

## User-approval gates

- **G-release** if CS34 ships in its own tag. Standard pattern.

## Exit criteria

1. `scripts/check-cs-plan.mjs` exists and implements C34-1..C34-5.
2. Linter registered in `bin/harness.mjs cmdLint` and has a `LINTER_EXPLANATIONS` entry.
3. ≥ 4 fixtures + ≥ 6 tests in `tests/check-cs-plan.test.mjs`; all pass.
4. `harness lint --quiet` against the harness self-host passes (full suite, including the new linter being self-host-skipped).
5. Smoke: clone a fresh consumer repo (use the same throwaway-repo pattern as CS25/CS26 close-out smoke); add a CS plan referencing `template/composed/CONVENTIONS.md`; run `harness lint`; observe the failure with a useful error message + path-prefix listing. Transcript captured in active CS file Notes.
6. CHANGELOG entry present.
7. LRN-105 disposition update paragraph appended.
8. Plan-vs-implementation review (GPT-5.5 gate) returns GO.

## Risks + open questions

| # | Risk | Mitigation |
|---|---|---|
| R1 | Self-host guard misclassifies a legitimate cross-repo dispatch *inside* the harness repo (orchestrator A working in agent-harness dispatches sub-agent B to operate on a different repo) | First cut accepts this false-negative because the failure mode is rare; can be refined later by adding fenced-block markers (signal 2 in Goal). The LRN-105 trigger case (SI agent's CS01 plan) was a consumer-repo CS plan, which signal 1 catches. |
| R2 | Path-prefix list (`template/`, `lib/`, `bin/`, `scripts/`) might trigger on legitimate references to a consumer's *own* `lib/` or `scripts/` directory | False positives are mitigated by C34-3 (configurable via `harness.config.json`); a consumer with its own `lib/` directory can override the prefix list. The defaults target the harness's directory names specifically. |
| R3 | New linter adds CI time | Each new linter adds ~100ms; acceptable. The whole `harness lint --quiet` run is currently <5s. |
| R4 | Fixture CS plans must be valid enough to NOT trip `check-clickstop` | Fixtures live under `tests/fixtures/cs-plan-lint/`, not `project/clickstops/`, so `check-clickstop` doesn't see them. Verify during implementation. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1 | Read CS file + LRN-105 + bin/harness.mjs cmdLint linters list + LINTER_EXPLANATIONS pattern + existing scripts/check-*.mjs (e.g. check-fixtures.mjs as a similar self-host-aware linter) | planned | sub-agent | agent-id=TBD \| role=implementer \| report-status=pending \| learnings=0 |
| T2 | Implement scripts/check-cs-plan.mjs per Decisions C34-1..C34-5 (self-host-aware; configurable forbidden-prefix list via harness.config.json) | planned | sub-agent | — |
| T3 | Register the linter in bin/harness.mjs cmdLint linters list AND add a LINTER_EXPLANATIONS entry following the CS32/D3 pattern | planned | sub-agent | — |
| T4 | Create tests/fixtures/cs-plan-lint/ with ≥4 fixture CS plans (consumer-target with template/composed/, with lib/, with mention inside fenced code block, harness-self-host with same refs) | planned | sub-agent | — |
| T5 | Create tests/check-cs-plan.test.mjs with ≥6 tests covering all fixtures + --quiet + aggregator integration | planned | sub-agent | — |
| T6 | CHANGELOG.md `[Unreleased] § Added` one-liner citing CS34 + LRN-105 | planned | sub-agent | — |
| T7 | Self-checks (text-encoding, lint --quiet, node --test, fixtures linter on the new fixtures dir) | planned | sub-agent | — |
| T8 | Orchestrator: commit on cs34/content, run GPT-5.5 plan-vs-impl gate | planned | orchestrator | — |
| T9 | Open content PR; merge after CI green | planned | orchestrator | — |
| T10 | Close-out: docs + restart state (active→done rename, WORKBOARD prune, LRN-105 disposition update) | planned | orchestrator | per OPERATIONS.md § Claim |
| T11 | Close-out: learnings + follow-ups (file any new LRNs from CS34 implementation) | planned | orchestrator | per OPERATIONS.md § Claim |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
