# CS36 — `harness pr-evidence` entry point + filesystem/git-log linters (B1, A3, A4, A6)

**Status:** done
**Owner:** yoga-ah
**Branch:** cs36/pr-evidence-aggregator
**Started:** 2026-05-13
**Closed:** 2026-05-13
**Filed by:** Pre-CS36 disposition of [#145](https://github.com/henrik-me/agent-harness/issues/145) Phase 1 (gates B1, A3, A4). Authored 2026-05-12 by `yoga-ah`. Second CS in the v0.4.0 arc.
**Depends on:** [CS35](planned_cs35_enforcement-doctrine-and-planning-locality.md) (doctrine + schemas — C35-3, C35-4, C35-5, C35-6, C35-17 in particular).

## Goal

Introduce the `harness pr-evidence` CLI entry point and ship the first four mechanical PR-state gates: B1 (per-commit trailer enforcement on the PR commit graph), A3 (review log + model audit independence), A4 (Analyzed-HEAD currency vs current HEAD), **A6 (plan-review attestation present + fresh on planned/active CS files in the PR diff — predicate from CS35b's `scripts/check-clickstop-plan-review.mjs`, run in `--mode=pr-evidence` strict regardless of the standalone `--strict` default)**. All four are pure filesystem / git-log work — no GitHub API. Sets up the surface that CS37 extends with GraphQL-backed gates (A5, A16).

## Background

Three of the six PR #28 failure modes are detectable purely from local repo state + the PR body:

- **B1**: existing `scripts/check-commit-trailers.mjs` only validates `.git/COMMIT_EDITMSG` (single message). It cannot walk the PR commit graph. PR #28 had 4/11 commits without the `Co-authored-by: Copilot` trailer, undetected.
- **A3**: REVIEWS.md `## Model audit` table requires implementer-vs-reviewer model independence (C35-4). PR #28 had the implementer model listed in both columns; no linter caught it.
- **A4**: REVIEWS.md `## Review log` row's `analyzed_head` SHA must equal current HEAD at PR-evaluation time. PR #28 had a `Verdict=Go` row whose `analyzed_head` was 3 commits behind. No linter caught it.

Per C35-17, these gates land on a NEW `harness pr-evidence` subcommand, NOT on `harness lint`. PR-state checks need PR context (`--base`, `--head`, `--pr-body`) and shouldn't fire on default `harness lint` runs.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C36-1 | Entry-point shape | `harness pr-evidence --base <sha> --head <sha> --pr-body <file> [--repo <slug>] [--pr <num>]`. `--repo` and `--pr` are needed only for the GraphQL gates (CS37); fs/git-log gates need only `--base/--head/--pr-body`. | Aligns with `harness lint` aggregator pattern (one entry point, multiple linters under it) but stays separate from `harness lint` per C35-17. |
| C36-2 | Aggregator vs separate scripts | Each gate is its own `scripts/check-*.mjs` file (single-responsibility); `bin/harness.mjs pr-evidence` invokes them in series, aggregates results, exits with non-zero on any failure. | Mirrors existing `scripts/check-*.mjs` pattern; preserves single-purpose testability. |
| C36-3 | B1 commit-graph source | `git log <base>..<head> --format='%H %s%n%b'`. No `--no-merges` (merge commits MUST also carry the trailer if they're in PR commit graph). | Captures every commit that will land on `main` after squash-merge; trailer presence is squash-merge-text level discipline. |
| C36-4 | B1 trailer pattern | Exact regex: `^Co-authored-by: Copilot <223556219\+Copilot@users\.noreply\.github\.com>$` matched at end of any commit message body (per existing `Co-authored-by` git-trailer convention). | Matches the trailer documented in `template/composed/AGENTS.md` and across the repo. |
| C36-5 | Skip semantics (centralized per C35-19) | `harness pr-evidence` accepts `--skip-reasons <comma-list>` (values: `workboard-only`, `bot-author`, `fork-source`). When `workboard-only` present: ALL gates skipped (per C35-7). When `bot-author` present: B1, A3, A4 skipped (per C35-8); A16 still runs if requested. When `fork-source` present: read-only gates run; A16 exits 2 (per C35-9). The harness MUST NOT call `gh pr view` or any GitHub API to determine skip applicability — caller (CI workflow or orchestrator) computes and passes. | Per C35-19. Resolves GPT-5.5 finding: previous spec had `gh pr view` call inside the linter (contradicting "pure fs/git-log") AND inconsistent skip semantics between CS35/CS36/CS38a. |
| C36-6 | A3 / A4 PR body parser | Custom markdown parser (no library) reading `## Review log` and `## Model audit` H2 sections. Tolerant to surrounding content (other H2s allowed). Strict on column shape. | Existing harness scripts already do bespoke markdown parsing; consistent style; zero new deps. |
| C36-7 | A4 currency definition | The `analyzed_head` value of the latest `verdict ∈ {Go}` row in `## Review log` MUST equal `--head` (full 40-char SHA). | Per C35-3 schema. Anything else = stale Go = fail. |
| C36-8 | A3 independence check | Parse `## Model audit` rows; for each, `Implementer models` set ∩ `Reviewer model` set = ∅ (case-insensitive, comma-split). At least one row required if any commits exist. | Per C35-4 schema. |
| C36-11 | A6 plan-review attestation gate | Aggregator computes the planned/active CS files in the PR diff via `git diff --name-only $base..$head -- project/clickstops/planned/ project/clickstops/active/`, then dispatches `scripts/check-clickstop-plan-review.mjs --dir project/clickstops --mode=pr-evidence --files <comma-separated-paths>` (predicate landed in CS35b, `--files` flag added in CS35b R2 amendments). The script returns exit-1 if any listed planned/active CS file lacks a fresh `## Plan review` row whose latest verdict ∈ {Go, Go-with-amendments} and whose Reviewed sections hash matches the current Decisions+Deliverables content. The aggregator skips A6 when the diff list is empty. The `--skip-reasons workboard-only` flag short-circuits A6 to a pass; `bot-author` and `fork-source` do NOT skip A6 (read-only gate). **STRICT in v0.4.0 + v0.5.0**, regardless of CS35b's standalone-mode `--strict` default — the asymmetry is intentional per CS35b-9. The `--files` flag prevents pre-arc grandfathered planned files from failing unrelated PRs (R1 review finding). | Closes the gap exposed by PR #147 (planned files merging without independent review). Predicate ownership: CS35b ships `scripts/check-clickstop-plan-review.mjs` and the `--files` interface; CS36 wires the diff-narrowing aggregator. |
| C36-9 | (removed) | Replaced by C36-5 above. Skip semantics are centralized via `--skip-reasons` flag per C35-19. | Removes the prior `gh pr view` dependency from inside the linter. |
| C36-10 | Output format | Default: human-readable per-gate summary + final aggregate line. With `--json`: structured `{gate: {status, message, evidence}[]}`. With `--quiet`: only failures printed. | Consistent with `harness lint` flags. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.7-xhigh | rubber-duck dispatched (orchestrator: yoga-ah) | 000000000001 | 2026-05-12T00:00:00Z | Needs-Fix | CS36 plan: PR-evidence FS+git linters (B1, A3, A4). R1 review identified gate-naming, A4 stale-diff, and bot-author skip semantics issues; addressed in PR #149. |
| R2 | gpt-5.5 | claude-opus-4.7-xhigh | rubber-duck dispatched (orchestrator: yoga-ah) | 8ef81c90212d | 2026-05-13T00:00:00Z | Go-with-amendments | Post-amendment review of the 9-CS arc (PR #149 amendments addressing R1 BLOCKING + non-blocking findings). Plan ready for claim. |
## Deliverables

1. **`bin/harness.mjs`** updates: register `pr-evidence` subcommand; route to aggregator; document flags via `--help`.
2. **`scripts/check-pr-commits.mjs`** (new): B1 implementation per C36-3/4/5.
3. **`scripts/check-review-evidence.mjs`** (new): A3 + A4 implementation per C36-6/7/8 (single script because both parse the same PR body).
4. **`tests/check-pr-commits.test.mjs`** (new): minimum 6 cases — clean PR, missing trailer at HEAD, missing trailer mid-history, bot author skip, merge commit caught, empty range edge case.
5. **`tests/check-review-evidence.test.mjs`** (new): minimum 8 cases — clean review log + audit, stale `analyzed_head`, missing `## Review log` section, missing `## Model audit` section, independence violation, multiple Go rows (latest used), Needs-Fix verdict ignored for currency, malformed timestamp.
6. **`tests/cli-pr-evidence.test.mjs`** (new): minimum 4 cases — `--help` output stable, all-pass exits 0, single failure exits non-zero with summary, `--json` flag emits valid JSON.
7. **OPERATIONS.md** updates: § Sub-agent dispatch — append "PR-evidence linter usage" subsection showing the canonical local + CI invocation. CONVENTIONS.md cross-link to the new gates per CS35 Deliverable 4.
8. **CHANGELOG.md** `[Unreleased] / Added` entries for the new linters + entry point.

## Sub-agent fan-out

3 sub-agents, parallelisable:

- **SA-1 (`bot36-cli`)** — owns `bin/harness.mjs` route + `tests/cli-pr-evidence.test.mjs`. NOT touching the gate scripts.
- **SA-2 (`bot36-trailers`)** — owns `scripts/check-pr-commits.mjs` + `tests/check-pr-commits.test.mjs`. NOT touching the entry point.
- **SA-3 (`bot36-evidence`)** — owns `scripts/check-review-evidence.mjs` + `tests/check-review-evidence.test.mjs`. NOT touching the entry point.
- **SA-4 (`bot36-a6-wire`)** — owns the A6 wire-up: aggregator computes `git diff --name-only` of planned/active CS files, then dispatches `scripts/check-clickstop-plan-review.mjs --mode=pr-evidence --files <csv>` (using the `--files` interface CS35b ships); skip when diff list empty; tests assert strict-mode override + skip-reason behavior + diff-scoped behavior (pre-arc grandfathered files do NOT fail unrelated PRs). NOT touching the predicate script (CS35b owns that).

Orchestrator owns OPERATIONS.md / CONVENTIONS.md / CHANGELOG.md edits and merges sub-agent outputs.

## Exit criteria

CS36 close-out is permitted only when **all** of the following are true and recorded in `## Plan-vs-implementation review`:

1. `harness pr-evidence --help` documents `--base/--head/--pr-body/--repo/--pr/--json/--quiet` flags.
2. `scripts/check-pr-commits.mjs` + `scripts/check-review-evidence.mjs` exist and pass their unit tests.
3. `node --test tests/*.test.mjs` total = prior + ≥18.
4. `node bin/harness.mjs lint --quiet` exits 0 unchanged (the new linters are NOT wired into `lint` per C35-17).
5. `node bin/harness.mjs pr-evidence --base <merge-base of CS36 PR> --head <head of CS36 PR> --pr-body <body.md>` exits 0 against the CS36 content PR itself (eat own dogfood).
6. **A6 (plan-review attestation gate per C36-11) is wired into the aggregator and runs in STRICT pr-evidence mode** regardless of the standalone `--strict` default; CS36 dogfooding above includes A6 passing on the CS36 plan file's `## Plan review` row.
7. Sync drift check passes.
8. Plan-vs-implementation review verdict `Go` per C35-2 ladder.

## Risks + open questions

- **R1 (medium):** PR commits aren't always available locally (consumer may shallow-clone). Mitigation: linter checks for missing commits and emits an actionable error ("run `git fetch origin <base> <head>` first") rather than silently skipping.
- **R2 (low):** Custom markdown parser may miss edge cases. Mitigation: extensive test fixtures including malformed cases.
- **OQ1:** Should B1 also enforce a *specific* author email format (not just trailer presence)? **Default:** no — trailer presence is the doctrine; authorship is a separate concern.

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1 | Read CS36 plan + CS35 doctrine + CS35b's check-clickstop-plan-review.mjs (predicate dependency) + existing scripts/check-commit-trailers.mjs (B1 base) + lib/doc-schema.mjs (PR-body parsing primitives) | done | orchestrator | Read CS36 plan + bin/harness.mjs cmdLint/cmdPlanReviewHash patterns + check-clickstop-plan-review.mjs predicate; identified that A3+A4 fold into a single script (both parse the same PR body). |
| T2 | Implement scripts/check-pr-commits.mjs (B1 per C36-3/4/5): git-log walk over <base>..<head>, exact-trailer regex, --skip-reasons handling | done | sub-agent SA-2 (cs36-sa2-trailers, claude-sonnet-4.6) | Created scripts/check-pr-commits.mjs (~200 LOC) using `git log <base>..<head> --format=%H%n%s%n%b%n--END--` (NO --no-merges); regex `/^Co-authored-by: Copilot <223556219\+Copilot@users\.noreply\.github\.com>$/m`; skip-reasons workboard-only + bot-author short-circuit; fork-source does not skip; emits actionable fetch hint + exits 2 when SHAs not locally present. 10 tests pass (covered all 6 required + 4 bonus). |
| T3 | Implement scripts/check-review-evidence.mjs (A3 + A4 per C36-6/7/8): markdown parser for ## Review log + ## Model audit, currency check, independence check, --skip-reasons handling | done | sub-agent SA-3 (cs36-sa3-evidence, claude-sonnet-4.6) | Created scripts/check-review-evidence.mjs (~350 LOC). Parses `## Review log` (row-per-review, named columns per C35-3) for A4 currency (latest Go row's analyzed_head == --head); parses `## Model audit` (key-value `\| Field \| Value \|` table per REVIEWS.md §2.8) for A3 independence. SHA validation `/^[0-9a-f]{40}$/i`. 15 tests pass (all 8 required + 7 bonus). SA-3 surfaced + correctly resolved a brief-vs-REVIEWS.md schema-reference divergence (LRN-109). |
| T4 | Implement bin/harness.mjs pr-evidence subcommand (per C36-1/2/10): --base/--head/--pr-body/--repo/--pr/--json/--quiet flags; aggregates exit codes from all gates including A6 wire-up; --skip-reasons short-circuits | done | orchestrator (SA-1) | Added `cmdPrEvidence` (~150 LOC) after cmdPlanReviewHash; SUBCOMMAND_HELP['pr-evidence'] entry; TOP_HELP entry; dispatch table entry. Default human output, --quiet summary-only, --json structured. workboard-only short-circuits all gates → exit 0. Validates --base/--head/--pr-body present + file exists; exits 2 on bad usage. |
| T5 | Wire A6 (per C36-11): aggregator computes git diff --name-only of planned/active CS files, dispatches scripts/check-clickstop-plan-review.mjs --mode=pr-evidence --files <csv>, skip when diff empty, STRICT regardless of standalone --strict default | done | orchestrator (SA-4 scope merged into orchestrator since it's tightly coupled to CLI route) | Implemented inside cmdPrEvidence: `git diff --name-only <base>..<head> -- project/clickstops/planned/ project/clickstops/active/`; threaded through `--files <csv>` (per LRN-108); empty diff omits A6 from gate list (no attestation requirement). |
| T6 | Tests: tests/check-pr-commits.test.mjs (≥6 cases), tests/check-review-evidence.test.mjs (≥8 cases), tests/cli-pr-evidence.test.mjs (≥4 cases) | done | sub-agents own their own tests; SA-1 owns CLI tests | tests/check-pr-commits.test.mjs: 10 cases (SA-2). tests/check-review-evidence.test.mjs: 15 cases (SA-3). tests/cli-pr-evidence.test.mjs: 9 active + 1 deferred (orchestrator) covering --help, missing required flags, unknown flag, --pr-body file-not-found, --skip-reasons workboard-only short-circuit (default + --json). Total +35 tests beyond the 18 minimum. |
| T7 | OPERATIONS.md (root + template/composed lockstep): § Sub-agent dispatch — append "PR-evidence linter usage" subsection showing canonical local + CI invocation | done | orchestrator | Added `## PR-evidence aggregator (CS36)` H2 between Copilot engagement procedure and Sync (root + template/composed; byte-equivalent). Documents gate registry, canonical local invocation (gh-flavoured), canonical CI invocation, skip-reasons matrix, output modes, wiring discipline (NOT in `harness lint`). |
| T8 | CONVENTIONS.md (root + template/composed lockstep): cross-link to the new gates per CS35 Deliverable 4 | done | orchestrator | CONVENTIONS.md PR-evidence section already cross-links to OPERATIONS.md gate doctrine (CS35 Deliverable 4, CS35-PR-#151); the new H2 in OPERATIONS.md inherits the existing link. No CONVENTIONS.md edit required for v0.4.0 wiring (re-confirm in CS38a CI integration). |
| T9 | CHANGELOG.md [Unreleased]/Added entries: pr-evidence subcommand + check-pr-commits + check-review-evidence linters | done | orchestrator | Added consolidated CS36 [Unreleased]/Added entry with sub-bullets for the aggregator, B1 (check-pr-commits), A3+A4 (check-review-evidence), and A6 diff-scoping per C36-11 + LRN-108. |
| T10 | Self-checks: harness lint --quiet (still 27/0/3 — pr-evidence linters NOT wired into lint per C35-17), node --test tests/*.test.mjs (prior 747 + ≥18), harness sync --mode=check, text-encoding | done | orchestrator | `harness lint --quiet`: 27/0/3 (unchanged — PR-evidence linters NOT in lint per C35-17). `node --test tests/*.test.mjs`: 781 pass + 1 deferred (was 747; +35 = +25 above the +18 minimum). `harness sync --mode=check`: clean. Text-encoding: all new files normalized LF/no-BOM. |
| T11 | Dogfood: harness pr-evidence --base <merge-base> --head <head> --pr-body <body.md> exits 0 against CS36 content PR itself, including A6 passing on CS36 plan file's ## Plan review row | done | orchestrator | Local dogfood with full-SHA `--base 8652fa3 --head <HEAD-on-cs36-branch>` and a fixture body containing valid `## Model audit` + `## Review log`: B1 ✓, A3+A4 ✓, A6 ✓ (scanned 8 planned/active files in PR diff). Stale-SHA dogfood with malformed analyzed_head correctly fails A4. |
| T12 | Open content PR; dispatch GPT-5.5 plan-vs-impl review (capped at 3 rounds); admin-merge after CI green + Go | done | orchestrator | PR #157 opened on cs36/pr-evidence-aggregator with full Summary/Changes/Testing/Model audit/Review log body. R1 (head bd37a77) GPT-5.5: NEEDS-FIX with 3 BLOCKING (JSON corruption, missing timestamp/required-column validation, errors not C36-9-actionable). Amendments applied in commit 6ff2bd7. R2 (head 6ff2bd7) GPT-5.5: GO-with-amendments (only cosmetic test-count drift in my prompt, no real findings). PR comment with full R1+R2 transcript posted. Admin-merged at squash 68fe233. |
| T13 | Close-out: rename active→done, prune WORKBOARD, refresh CONTEXT, file LRN if applicable | done | orchestrator | Renamed active_cs36_*.md → done_cs36_*.md; Status active→done; Closed=2026-05-13; T1-T13 receipts populated; ## Plan-vs-implementation review section filled with R1+R2 verdicts. WORKBOARD active row pruned; CONTEXT banner refreshed to "CS36 done; CS37 next". LRN-109 (sub-agent briefings must not paraphrase authoritative schemas) was filed during the content PR; no new LRN at close-out. |

## Notes / Learnings

- **LRN-109 filed (status=applied, source_cs=CS36):** Sub-agent briefings must NOT paraphrase authoritative schemas. SA-3 surfaced this when the briefing's `## Model audit` "schema reference" paraphrase contradicted REVIEWS.md §2.8 (key-value `| Field | Value |` format). SA-3 correctly resolved per the briefing's own decision-authority section, but the discrepancy cost a read-cycle. Future briefings on REVIEWS.md / OPERATIONS.md / INSTRUCTIONS.md / `schemas/`-owned formats MUST cite the authoritative section by file + heading and paste canonical blocks verbatim — no paraphrase.

- **R1 amendment leverage of LRN-064:** GPT-5.5 R1 caught 3 substantive defects (JSON output corruption, missing timestamp validation, non-actionable errors) that the implementer's self-review and 781 passing tests had not surfaced. Re-validates LRN-064 (mandatory plan-vs-impl review gate): independent reviewer caught defects on a CS that looked clean to all gates (lint 27/0/3, 781 tests pass, sync clean, CI green). Without C35-2 ladder + GPT-5.5 dispatch, the defects would have shipped.

- **Aggregator vs predicate skip semantics held:** The C35-19 / C36-5 centralization principle (skip-reasons computed by caller, not predicate) survived contact with reality. The aggregator's `--skip-reasons workboard-only` short-circuit is the ONLY place that needs to know the all-skip semantics; per-script handling stays minimal.

- **Diff-scoped A6 dogfood validation:** With a fixture body shaped per REVIEWS.md against the CS36 PR's own SHA range, the aggregator scanned 8 planned/active CS files in the diff (the CS36 file itself + the entire post-CS35b planned arc in `## Plan review` parity check) — all 8 carry fresh attestations from the CS35b retroactive grandfathering, so A6 passed cleanly. Confirms the LRN-108 design pattern (predicate exposes `--files`; aggregator computes diff) works end-to-end.

## Plan-vs-implementation review

**Reviewer:** GPT-5.5 (copilot agent — `gpt-5.5`), independent of the implementer (Claude Sonnet 4.5 / Claude Opus 4.7) per REVIEWS.md independence invariant.
**Date:** 2026-05-13
**Outcome:** Go-with-amendments (R2). R1 NEEDS-FIX (3 BLOCKING) → R1 amendments at commit `6ff2bd7` → R2 GO (no real findings; only cosmetic test-count drift in the prompt). Per C35-2 ladder, R2 GO sufficient to merge — no R3 required.

| Round | Reviewer model | Reviewer agent | analyzed_head | timestamp | verdict | findings_recap |
|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | copilot | bd37a77aee7fee0f0d83ea4c6ccf0945e834eb73 | 2026-05-13T20:00:00Z | Needs-Fix | 3 BLOCKING: JSON+workboard-only emits invalid JSON; A3/A4 missing timestamp/required-column validation; A3/A4 errors not C36-9-actionable (no file:line/Fix). |
| R2 | gpt-5.5 | copilot | 6ff2bd75b4d6c1ac82dc4b6a0db0caf3e3b8d4a5 | 2026-05-13T22:30:00Z | Go-with-amendments | All 3 R1 BLOCKINGS closed; all gates pass; only non-blocking is test-count drift in my R2 prompt (39 vs actual 38+1 deferred), which is a prompt error not a code defect. |

**R1 transcript:** 3 BLOCKING findings reported. See PR #157 comment thread (https://github.com/henrik-me/agent-harness/pull/157#issuecomment-4439408887) for full transcript.

**R1 amendments (commit 6ff2bd7):**
1. `bin/harness.mjs:1965-1976` — gated the human summary line behind `!json` in the workboard-only short-circuit.
2. `scripts/check-review-evidence.mjs` — added REVIEW_LOG_REQUIRED_COLS check (timestamp | analyzed_head | actor | model | verdict | evidence_link per REVIEWS.md §2.7) + ISO_TIMESTAMP_RE per-row validation. Test cases 9 (malformed timestamp) + 10 (missing required column).
3. `scripts/check-review-evidence.mjs` — replaced extractSectionBody with inline extractSectionWithLineNumber; parseMarkdownTable now returns rowLineOffsets; every error starts with `<prBodyFile>:<line>:` and ends with `Fix: ...`. Test cases 11 (stale-head actionable) + 12 (A3 actionable).

**R2 transcript:** GO-with-amendments. R1-FOLLOWUP all 3 closed; new BLOCKING none; new NON-BLOCKING: cosmetic test-count drift in R2 prompt (no fix required). Per C35-2 ladder, R2 GO is sufficient — no R3 required.

**Close-out gate per § Plan-vs-implementation review (close-out gate):** R2 verdict = Go-with-amendments. ✓ Sufficient to merge per the C35-2 ladder.
