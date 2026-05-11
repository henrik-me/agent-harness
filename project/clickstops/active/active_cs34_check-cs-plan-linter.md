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
| T1 | Read CS file + LRN-105 + bin/harness.mjs cmdLint linters list + LINTER_EXPLANATIONS pattern + existing scripts/check-*.mjs (e.g. check-fixtures.mjs as a similar self-host-aware linter) | done | sub-agent | agent-id=cs34-implementer \| role=implementer \| report-status=complete \| learnings=2 |
| T2 | Implement scripts/check-cs-plan.mjs per Decisions C34-1..C34-5 (self-host-aware; configurable forbidden-prefix list via harness.config.json) | done | sub-agent | — |
| T3 | Register the linter in bin/harness.mjs cmdLint linters list AND add a LINTER_EXPLANATIONS entry following the CS32/D3 pattern | done | sub-agent | — |
| T4 | Create tests/fixtures/cs-plan-lint/ with ≥4 fixture CS plans (consumer-target with template/composed/, with lib/, with mention inside fenced code block, harness-self-host with same refs) | done | sub-agent | — |
| T5 | Create tests/check-cs-plan.test.mjs with ≥6 tests covering all fixtures + --quiet + aggregator integration | done | sub-agent | — |
| T6 | CHANGELOG.md `[Unreleased] § Added` one-liner citing CS34 + LRN-105 | done | sub-agent | — |
| T7 | Self-checks (text-encoding, lint --quiet, node --test, fixtures linter on the new fixtures dir) | done | sub-agent | — |
| T8 | Orchestrator: commit on cs34/content, run GPT-5.5 plan-vs-impl gate | planned | orchestrator | — |
| T9 | Open content PR; merge after CI green | planned | orchestrator | — |
| T10 | Close-out: docs + restart state (active→done rename, WORKBOARD prune, LRN-105 disposition update) | planned | orchestrator | per OPERATIONS.md § Claim |
| T11 | Close-out: learnings + follow-ups (file any new LRNs from CS34 implementation) | planned | orchestrator | per OPERATIONS.md § Claim |

## Notes / Learnings

### Implementation decisions

1. **Fenced-code-block detection:** A line whose `.trim()` starts with ` ``` ` (backtick-triple) toggles the `inFencedBlock` flag. This handles both opening and closing fences. Lines that START with triple-backtick are not scanned for violations — only pure toggle. This is simple and covers all standard Markdown fencing patterns used in harness CS plans. (Indented code blocks are not considered since CS plans use fenced blocks exclusively.)

2. **Per-line exemption for harness links:** Any line containing `https://github.com/henrik-me/agent-harness/` is exempt even if it also contains a forbidden prefix. This covers markdown links like `[lib/composed.mjs](https://github.com/henrik-me/agent-harness/blob/main/lib/composed.mjs)`. The check is a simple substring match; no URL parsing needed.

3. **First-prefix-wins per line:** When a line contains multiple forbidden prefixes, only the first matching prefix is reported. This avoids duplicate VIOLATION: lines for the same source line, keeping output readable.

4. **One-level-deep walk:** The linter reads `<dir>/active/`, `<dir>/done/`, `<dir>/planned/` with `readdirSync` (no recursion). CS plan files are always direct children of these subdirectories per the harness convention.

5. **Schema placement:** The new `cs_plan_lint` property was inserted before `excluded` in `schemas/harness.config.schema.json` to maintain approximate alphabetical ordering within the properties section.

6. **LINTER_EXPLANATIONS placement:** `cs-plan` was inserted between `context` and `fixtures` to maintain alphabetical order in the `LINTER_EXPLANATIONS` object in `bin/harness.mjs`.

7. **Linters array placement:** The `cs-plan` entry was placed immediately after the `fixtures` entry in the linters array. The self-host guard is handled inside the linter script itself (not via a conditional wrapper in the runner), because the linter needs to print the skip message on stdout — the runner's standard "target absent → skip" path does not emit such a message.

### Unexpected discoveries

- The `tests/fixtures/cs-plan-lint/` directory is under `tests/fixtures/`, which means `check-fixtures.mjs` will scan it (looking for .gitignore violations). The fixture files themselves have safe names and should not be gitignored, so this is benign.
- The consumer fixture's active CS plan (active_cs01) triggers a `template/composed/` violation; the planned CS plan (planned_cs02) triggers a `lib/` violation. Both violations appear in the same linter run (tests 1–2 run against the same consumer clickstops dir).

### Deferred / out-of-scope ideas

- **Signal 2 (fenced-block marker for cross-repo dispatches inside the harness):** The CS plan mentions `<!-- cs-plan:consumer-target -->` markers as a potential future refinement. Not implemented in this CS; first cut with self-host-guard is sufficient per Decision C34-5.
- **Aggregator integration test** (test 8 in the final suite — running `harness lint --only cs-plan` from a temp consumer cwd): added during plan-vs-impl gate fix. The temp cwd is built fresh per test (package.json with a non-harness name + harness.config.json + a CS plan file under project/clickstops/active/) and the test asserts the cs-plan row appears in the lint summary AND fails on the planted violation.

## Plan-vs-implementation review

**Reviewer:** GPT-5.5 (rubber-duck, code-review agent, pre-content-PR gate)
**Date:** 2026-05-12
**Outcome:** GO (after one NEEDS-FIX iteration)

**Initial verdict (run 1):** NEEDS-FIX. Two issues required: (a) the plan-required aggregator integration test was missing (the sub-agent's first-pass notes documented it as "deferred" — this conflicted with the plan's test deliverable D5); (b) several tests asserted absence-of-violation lines without also asserting exit status, so a script crash would have false-greened them.

**Fix applied (orchestrator, before re-review):**
- Added test 8 in `tests/check-cs-plan.test.mjs` — aggregator integration. Builds a temp consumer-shaped cwd (package.json with a non-harness name, harness.config.json, plus `project/clickstops/active/active_cs01_violation.md` containing a `template/composed/CONVENTIONS.md` reference), invokes `node bin/harness.mjs --cwd <tmp> lint --only cs-plan`, and asserts: (i) the cs-plan row appears in the summary, (ii) the run exits non-zero, (iii) stderr contains the expected `template/composed/` violation text.
- Strengthened tests 3, 4, 7: each now asserts `r.status` explicitly (1 for tests 3/4 because other fixtures still violate; 0 for test 7 because the override removes lib/ and template/composed/ from the prefix list and no fixture mentions template/seeded/). Test 7 also asserts the success summary line shape `check-cs-plan: 4 files checked, 0 violations.`
- Updated the Notes/Learnings entry that documented the deferral; the test is no longer deferred.

**Final verdict (run 2 — confirmed via re-running all checks):** GO.

**Per-deliverable assessment (post-fix):**

- **D1** — `scripts/check-cs-plan.mjs` implements all of C34-1..C34-5: self-host detection via `package.json#name === '@henrik-me/agent-harness'` exits 0 with the documented stdout note; default forbidden prefixes match exactly `['template/composed/', 'template/seeded/', 'lib/', 'bin/', 'scripts/']`; fenced-block toggle reliably tracks ``` on `.trim()`; harness-link exemption uses substring `https://github.com/henrik-me/agent-harness/`; `requireValue` guards every value-taking flag (LRN-040); stdout/stderr discipline correct (LRN-044); malformed `--config` JSON → stderr + exit 1 (LRN-033); walk is exactly one level under `<dir>/{active,done,planned}/`.
- **D2** — `bin/harness.mjs` registration: `cs-plan` LINTER_EXPLANATIONS entry is alphabetically placed between `context` and `fixtures`; linter-array entry follows the `fixtures` row with the expected `--cwd` and conditional `--config` args; standard skip-if-target-missing logic applies to fresh consumers without `project/clickstops/`.
- **D3** — `schemas/harness.config.schema.json`: new top-level `cs_plan_lint` property added with `additionalProperties: false` semantics preserved at both root and child levels; `validate-schemas.mjs` passes; harness's own `harness.config.json` does not need to change.
- **D4** — five fixtures present: `consumer/{active,done,planned}/` × violation/exempt cases + `self-host/package.json` + `self-host/.../active_cs99_*.md`. None matched by `.gitignore`.
- **D5** — eight tests now (was seven before the fix): all 8 pass via `node --test tests/check-cs-plan.test.mjs`. Aggregator integration test exercises the full `bin/harness.mjs lint --only cs-plan` path end-to-end against a synthetic consumer cwd. Every functional test now asserts both exit status and stdout/stderr content.
- **D6** — CHANGELOG.md `[Unreleased] § Added` includes the one-liner citing CS34 + LRN-105.
- **D7** — Tasks T1..T7 marked `done`; Notes/Learnings substantive and reflects the post-fix state.

**Cross-cutting:** `harness lint --quiet` against the harness self-host: 25 passed, 0 failed, 3 skipped (was 24/0/3 pre-CS34; cs-plan adds the +1 pass row via self-host skip). The hardcoded `17 → 18` bump in `tests/cs15d-aggregator.test.mjs` is the right local adjustment for adding a new linter row; not a workaround. No regressions in any other linter.

**Follow-ups:** None for CS34 itself. The sub-agent's LEARNINGS CANDIDATES suggest considering `count >= N` (instead of `=== N`) for hardcoded linter-row-count assertions in integration tests — the orchestrator may file this as a low-priority LRN at close-out.
