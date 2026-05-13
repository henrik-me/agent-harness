# CS40 — `check-review-output.mjs` linter (R1 enumeration vs `git diff --name-only`)

**Status:** active
**Owner:** yoga-ah
**Branch:** cs40/check-review-output
**Started:** 2026-05-13
**Closed:** —
**Filed by:** Pre-CS40 disposition of [#145](https://github.com/henrik-me/agent-harness/issues/145) gap #3 + Change C2 (R1 per-file enumeration). Authored 2026-05-12 by `yoga-ah`. First CS in the v0.5.0 arc.
**Depends on:** [CS39](planned_cs39_release-v0.4.0.md) (v0.4.0 must be released first), [CS35](planned_cs35_enforcement-doctrine-and-planning-locality.md) (doctrine/schema).

## Goal

Land the linter that closes #145 gap #3 (summary-pass on YAML / package.json with no per-file enumeration). The linter parses the reviewer's output (the markdown content delivered by the orchestrator-dispatched reviewer per LRN-068 pattern) and validates it against three predicates: (a) Analyzed-HEAD line presence and SHA validity; (b) for `--round R1`, the per-file enumeration exactly matches `git diff --name-only <base>..<head>` (no missing files, no extra files); (c) finding classification rows are well-formed.

## Background

Per #145 gap #3, PR #28's reviewer output included a single summary verdict for YAML / package.json without per-file analysis. The implementer's "all-pass" reading was technically consistent with the reviewer's output but the reviewer hadn't actually inspected each file. The fix per Change C2 is mechanical: R1 reviews must enumerate every changed file. Anything less is a malformed review and the gate fails.

Per #145 Change C1, R1 vs Rn distinction matters: R1 (first review on a HEAD) requires full enumeration; Rn (delta review on subsequent HEAD) may enumerate only the delta files. Doctrine for both ships in CS35.

This linter is the first piece of the v0.5.0 mechanical layer that complements the v0.4.0 PR-state gates: v0.4.0 enforces evidence shapes in the PR body; v0.5.0 (CS40) enforces the reviewer output's content shape.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C40-1 | Input format | `--review-output <file>` (markdown file containing reviewer's output as captured by the orchestrator). Required: `--round {R1\|Rn}`, `--base <sha>`, `--head <sha>`. Optional: `--prev-head <sha>` (required for Rn enumeration check; warned-and-skipped if absent per C40-4); `--repo <slug>` + `--pr <number>` (for hosted output retrieval AND for the independence-invariant guard's PR-body fetch per C40-6); `--reviewer-model <model-id>` (required when independence-invariant guard runs; the model the reviewer used, used for overlap check vs implementer set in `## Model audit`); `--update-pr` (optional flag enabling C40-7 PR-body update); `--json` (machine-readable output). All flags are documented in `harness review-output --help` and asserted by the CLI route test in CS40 SA-2's deliverable. | Per GPT-5.5 BLOCKING #8: enumerated all flags surfaced elsewhere in the CS so the CLI shape is captured in one place. |
| C40-2 | Schema (linter expectations of reviewer output) | The reviewer output MUST contain: (a) a line `Analyzed HEAD: <40-char-sha>` near top; (b) for R1, an H2 or H3 section listing every changed file as bullets `- <path>: <one-line per-file finding>`; (c) a `## Findings` section with rows shaped `- [<severity>] <file>:<line>: <description>` where severity ∈ `Blocking | Non-blocking | Suggestion` (matching the canonical vocabulary in `REVIEWS.md:151-153`); (d) a `Verdict: {Go\|Needs-Fix\|Block}` line near end. | Concrete, parseable, minimally invasive on reviewer prose. Severity vocab aligned to REVIEWS.md per GPT-5.5 BLOCKING #8 (was `Block / Needs-Fix / Suggest` — wrong). |
| C40-3 | R1 enumeration completeness check | Compute `git diff --name-only <base>..<head>` set; compute reviewer-enumerated file set; assert equality. Missing files = fail (lists missing files in error output). Extra files = warning (reviewer enumerated stale files no longer in diff). | Per #145 gap #3 fix. |
| C40-4 | Rn enumeration check | For `--round Rn`, enumeration must equal `git diff --name-only <prev-head>..<head>` where `--prev-head` is required. If `--prev-head` not provided, skip enumeration check (warn). | Delta reviews are intentionally narrower; can't validate without delta basis. |
| C40-5 | Finding row schema | Regex per row: `^- \[(Blocking\|Non-blocking\|Suggestion)\] (\S+):(\d+): .+$` (canonical severity vocabulary per `REVIEWS.md:151-153`). At least one finding required if Verdict ≠ Go. Verdict=Go MAY have zero findings (Suggestion findings allowed but not required). | Enforces structure without dictating content depth. Vocab aligned per GPT-5.5 BLOCKING #8. |
| C40-6 | Independence-invariant guard | If `--repo`/`--pr` provided, parse PR body's `## Model audit`; assert reviewer model (caller passes via `--reviewer-model`) is NOT in implementer set. Independence is a precondition for review validity. | Belt-and-suspenders; A3 already runs on PR body but local invocation of this linter doesn't always have PR context. |
| C40-7 | Idempotent PR-body update | When `--update-pr` flag provided, the linter posts the parsed structured output as a new row in `## Review log` of the PR body via `gh pr edit --body-file <new-body>`. Idempotent: multiple invocations with the same `--review-output` produce the same single row (deduplicated by `analyzed_head + actor + verdict`). | Convenience for orchestrators; eliminates a manual `gh pr edit` step. |
| C40-8 | Aggregator wiring | Add to `harness pr-evidence` aggregator alongside CS36/CS37 gates? **No** — `check-review-output` requires the reviewer output file which isn't available in CI. Standalone linter; orchestrator invokes locally after capturing reviewer output. | PR-state vs review-output are different surfaces. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.7-xhigh | rubber-duck dispatched (orchestrator: yoga-ah) | 000000000001 | 2026-05-12T00:00:00Z | Needs-Fix | CS40 plan: check-review-output linter for v0.5.0. R1 raised line-length and verdict-row schema questions; addressed in PR #149. |
| R2 | gpt-5.5 | claude-opus-4.7-xhigh | rubber-duck dispatched (orchestrator: yoga-ah) | 2dad38fe33e2 | 2026-05-13T00:00:00Z | Go-with-amendments | Post-amendment review of the 9-CS arc (PR #149 amendments addressing R1 BLOCKING + non-blocking findings). Plan ready for claim. |
## Deliverables

1. **`scripts/check-review-output.mjs`** (new) per C40-2/3/4/5/6/7.
2. **`tests/check-review-output.test.mjs`** (new): minimum 10 cases — clean R1, R1 missing file, R1 extra file warning, Rn with `--prev-head`, Rn without `--prev-head` (warn), malformed Verdict line, malformed finding row, independence-invariant violation, `--update-pr` idempotency, missing Analyzed-HEAD line.
3. **`bin/harness.mjs`**: register `review-output` subcommand routing to the linter; add to `--help`.
4. **OPERATIONS.md** § Reviewer dispatch: append "Post-review: `harness review-output --round R1 --base ... --head ... --review-output <file> [--update-pr]` validates and optionally posts".
5. **CHANGELOG.md** `[Unreleased] / Added` entry.

## Sub-agent fan-out

2 sub-agents:

- **SA-1 (`bot40-linter`)** — owns `scripts/check-review-output.mjs` + `tests/check-review-output.test.mjs`.
- **SA-2 (`bot40-cli-route`)** — owns `bin/harness.mjs` route + `tests/cli-review-output.test.mjs`.

Orchestrator owns OPERATIONS.md + CHANGELOG.md.

## Exit criteria

1. `harness review-output --help` shows all flags from C40-1.
2. Linter exists and tests pass; total = prior + ≥10.
3. Independence-invariant guard correctly aborts when reviewer model overlaps implementer set.
4. `--update-pr` produces deterministic body diff on repeated invocations (idempotency test).
5. `harness lint --quiet` + sync drift checks pass.
6. Plan-vs-implementation review `Go`.

## Risks + open questions

- **R1 (low):** Reviewer markdown style may vary. Mitigation: schema (C40-2) is minimally invasive — only requires specific lines/sections, not exhaustive structure.
- **R2 (medium):** `--update-pr` with idempotency requires careful body parsing/rewriting. Mitigation: dedicated test fixture with multiple invocation scenarios.
- **OQ1:** Should the linter also validate that the reviewer's findings are sorted (e.g. by severity)? **Default:** no — sort order is style, not correctness.

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1 | claim PR (workboard/cs40-claim) — rename planned→active, set Status/Owner/Branch/Started, populate Tasks, update WORKBOARD | done | yoga-ah | merged in PR #171 |
| T2 | branch `cs40/check-review-output` from main | done | yoga-ah | this branch |
| T3 | implement `scripts/check-review-output.mjs` per C40-2/3/4/5/6/7 (parser, R1/Rn enumeration, finding-row schema, independence-invariant guard, --update-pr idempotency) | done | yoga-ah | self-implementation; all C40-1 flags wired (incl. --actor + --evidence-link added in R1 amendment); gh invocation goes through injectable runGh test seam (CHECK_REVIEW_OUTPUT_GH_BIN env var) |
| T4 | implement `tests/check-review-output.test.mjs` (≥10 cases per Deliverable 2) | done | yoga-ah | 14 cases passing — R1 happy/missing/extra, Rn with/without --prev-head, malformed verdict/finding/Analyzed-HEAD, Verdict-Needs-Fix-without-findings, --json output, stale-head warning, **independence-invariant violation (fake-gh)**, **--update-pr idempotency (fake-gh round-trip)** — last two added in R1 amendment per GPT-5.5 finding |
| T5 | register `harness review-output` subcommand in `bin/harness.mjs` + `tests/cli-review-output.test.mjs` | done | yoga-ah | dispatch entry + SUBCOMMAND_HELP + cmdReviewOutput thin pass-through to script; 4 CLI tests passing |
| T6 | OPERATIONS.md § Reviewer dispatch — append post-review block per Deliverable 4 | done | yoga-ah | added `### Post-review validation (CS40 — harness review-output)` subsection in both root + composed copies |
| T7 | CHANGELOG.md `[Unreleased] / Added` entry per Deliverable 5 | done | yoga-ah | three bullets covering CLI + linter, OPERATIONS update, test inventory |
| T8 | validate (`harness lint` + tests + sync clean) | done | yoga-ah | lint 28/0/3; tests 886 (885 pass / 1 skipped / 0 fail); +16 from CS40; sync clean |
| T9 | dispatch GPT-5.5 R1 plan-vs-impl review (sync rubber-duck) | planned | yoga-ah | per LRN-064 |
| T10 | amendments per R1 + dispatch R2 | planned | yoga-ah | — |
| T11 | open content PR; engage Copilot via `gh pr edit --add-reviewer`; CI green; admin-merge | planned | yoga-ah | — |
| T12 | close-out PR (rename done, plan-vs-impl section, WORKBOARD/CONTEXT) | planned | yoga-ah | — |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out)_
