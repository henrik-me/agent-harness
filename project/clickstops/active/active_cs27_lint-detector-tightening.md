# CS27 — Lint detector tightening (2 findings from CS16 sub-invaders bootstrap)

**Status:** active
**Owner:** yoga-ah
**Branch:** cs27/lint-detector-tightening
**Started:** 2026-06-04
**Closed:** —
**Filed by:** Pre-claim disposition of [Findings #7 + #8](../../clickstops/active/active_cs16_bootstrap-sub-invaders/sub-invaders-bootstrap-summary.md) from CS16 sub-invaders bootstrap (2026-05-11) by `yoga-ah`.
**Depends on:** None. May claim independently of CS25 / CS26 / CS16 (CS25 and CS16 both closed 2026-05-11; CS26 still planned — none block this CS). Small enough to ship in a single sitting.

## Goal

Two narrow tightening fixes for `harness lint` and `harness sync` UX surfaces:

1. **Finding #7 (false-positive WORKBOARD active-row warning):** sync currently warns `WORKBOARD.md has active CS rows. Syncing mid-CS may cause process-shape changes mid-flight.` when run on a freshly-init'd consumer that has no active CS — the seeded WORKBOARD's placeholder Orchestrators row pattern-matches the active-row detector. Fix the detector to ignore rows where every cell is a placeholder string.
2. **Finding #8 (silent-skip lints with no informational note):** several `harness lint` checks silently skip with `(target not found)` for consumer-applicable items the consumer SHOULD have (notably `commit-trailers`, `pr-body`). The consumer never learns these checks exist. Emit informational notes recommending adoption.

## Background

Both findings observed during the CS16 sub-invaders bootstrap (2026-05-11). Documented in detail in [`sub-invaders-bootstrap-summary.md`](../../clickstops/active/active_cs16_bootstrap-sub-invaders/sub-invaders-bootstrap-summary.md). Each is a small, low-risk UX fix that improves first-run consumer experience without changing any contract.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C27-1 | Finding #7 detector predicate | A row is "active" only if (a) the CS-Task ID column is non-empty AND non-placeholder (not `—`, not parenthesised italic), AND (b) the State column is non-empty AND non-placeholder, AND (c) at least one of {Owner, Branch} is also non-placeholder. Any row that fails (a) or (b) or (c) is a placeholder/empty row | The seeded WORKBOARD's `(placeholder — replace with real agent)` style triggers on prose-text matching; tightening the predicate to require concrete CS-Task ID + State + (Owner OR Branch) eliminates false positives. |
| C27-2 | Finding #8 skip-with-recommendation list | Emit informational notes (not errors) for: `commit-trailers` (recommends adopting commit-message convention via `.github/pull_request_template.md` mentioning the Co-authored-by trailer), `pr-body` (recommends adopting `.github/pull_request_template.md`). Other "skipped (target not found)" items (`fixtures`, `templates`, `pack`, `scaffold-readme`, `compose-v2`, `instructions`, `public-artifact`) remain silent skips because they target harness-internal artefacts not relevant to a typical consumer | Avoid adding noise for consumer-irrelevant checks while surfacing the 2 that consumers should adopt. |
| C27-3 | Note format | Lint summary lines for these 2 use a new `– commit-trailers: not configured (recommendation: add .github/pull_request_template.md and use --signoff or Co-authored-by trailers per OPERATIONS.md § Branch and commit conventions)` format. The line shows up in the `harness lint` summary alongside other check rows, prefixed `–` (em-dash, same as current "skipped" rows) but with the descriptive recommendation tail | Consistent with existing summary format; visually distinct (longer line); does not change exit code (still successful skip). |
| C27-4 | Test approach | Two small fixture-based tests: one asserting the placeholder-row detector ignores the seeded WORKBOARD; one asserting the `harness lint` summary contains the informational recommendations when the prerequisite files are absent | Mirrors the `tests/cs07-context-linter.test.mjs` and `tests/aggregator-summary.test.mjs` patterns. |

## Deliverables

1. **Finding #7 fix:** edit the active-row detector in `lib/sync.mjs` (or wherever `WORKBOARD.md has active CS rows` warning originates — `grep -rn "has active CS rows" lib/ scripts/ bin/` to locate). Apply Decision C27-1 predicate.
2. **Finding #7 test:** new `tests/cs27-workboard-active-row-detector.test.mjs` with at least 4 fixtures: (a) seeded placeholder row alone — detector should report NO active rows; (b) real active row alone — detector should report 1 active row; (c) mix — detector should report only the real one; (d) edge case where State is concrete but CS-Task ID is `—` — should be ignored (placeholder).
3. **Finding #8 fix:** edit the `harness lint` aggregator in `bin/harness.mjs cmdLint` (or wherever per-check skip results are formatted — `grep -rn "skipped (target not found)" bin/ lib/`) to apply Decision C27-2 + C27-3 formatting for the 2 specific checks.
4. **Finding #8 test:** extend `tests/aggregator-summary.test.mjs` (or add a new `tests/cs27-lint-recommendations.test.mjs` if cleaner) with a fixture asserting that running aggregator on a consumer without the prerequisite files produces the recommendation lines.
5. **CHANGELOG.md:** add entry under the next patch version (e.g. `## [v0.2.3]` — sequencing depends on CS25/CS26 ordering; CS27 may piggyback on CS26's release if both close before a new tag is cut, OR ship in its own patch tag if it lands after CS26's release).
6. **`sub-invaders-bootstrap-summary.md` update:** add resolution notes to Findings #7 and #8 pointing at CS27 close-out commit.

## User-approval gates

- **G-release** if CS27 ships in its own tag (likely if it lands after CS26's release). Standard pattern.

## Exit criteria

1. `lib/sync.mjs` (or appropriate module) active-row detector predicate updated per Decision C27-1.
2. `tests/cs27-workboard-active-row-detector.test.mjs` exists with ≥4 fixtures and passes.
3. `bin/harness.mjs` (or appropriate aggregator) emits informational recommendations for `commit-trailers` and `pr-body` per Decision C27-2 + C27-3.
4. Aggregator test asserts the recommendation lines appear when prerequisites are absent and DO NOT appear when prerequisites are present.
5. Running `harness sync` against a freshly-init'd consumer (smoke probe — same throwaway-repo pattern as CS25/CS26 close-out smoke) produces NO `WORKBOARD.md has active CS rows` warning. Transcript captured in active CS file Notes.
6. Running `harness lint` against the same fresh consumer shows the 2 recommendation lines per Decision C27-3.
7. `harness lint --quiet` against agent-harness self-host passes (full suite, including the new `tests/cs27-*` tests).
8. CHANGELOG.md entry present.
9. CS16's `sub-invaders-bootstrap-summary.md` Findings #7 + #8 each have resolution notes pointing at CS27 close-out SHA.
10. Plan-vs-implementation review (GPT-5.5 gate) returns GO.

## Risks + open questions

| # | Risk | Mitigation |
|---|---|---|
| R1 | Tightening the active-row predicate may cause real placeholder-but-meaningful rows in some consumer's WORKBOARD to be ignored | The detector predicate is intentionally narrow: requires CS-Task ID, State, AND (Owner OR Branch) all to be non-placeholder. Any row representing a real active CS will have all 3. Pure placeholder rows have none. The "one column is real, others are placeholder" edge is a malformed WORKBOARD; flagging it as not-active is preferable to false-positive sync warnings. |
| R2 | Adding informational lines to `harness lint` summary may conflict with `--quiet` flag expectations | `--quiet` should suppress informational notes the same way it suppresses success output. Verify in the test fixture: `--quiet` mode produces no recommendation lines on stdout. |
| R3 | The recommendation text references files (`.github/pull_request_template.md`) that the consumer may have but at a different path | Use the standard GitHub-recognised path. Acceptable to use ONE canonical path in the recommendation; consumers using non-standard paths can disable the recommendation later if it becomes annoying (out of scope for CS27). |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.7-xhigh | rubber-duck dispatched (orchestrator: yoga-ah) | b376befdb2b2 | 2026-05-14T04:50:00Z | Go-with-amendments | CS27 grandfather attestation per CS42-7 strict-flip self-host validation. Pre-CS35b backlog; plan content unchanged; backfill only. |
## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| Finding #7: tighten WORKBOARD active-row detector in `lib/sync.mjs` per C27-1 (export for test) | done | yoga-ah | predicate: CS-Task ID + State + (Owner OR Branch) all non-placeholder |
| Finding #7 test: `tests/cs27-workboard-active-row-detector.test.mjs` (≥4 fixtures per Deliverable #2) | done | yoga-ah | 10 fixtures: placeholder-only, real, mix, concrete-State-but-placeholder-ID, narrow-table, full placeholder set |
| Finding #8: emit recommendation notes for `commit-trailers` + `pr-body` in `bin/harness.mjs cmdLint` per C27-2/C27-3 | done | yoga-ah | non-quiet only (R2); plain skipped row under `--quiet` |
| Finding #8 test: assert recommendation lines present when prereqs absent, absent when present + under `--quiet` | done | yoga-ah | `tests/cs27-lint-recommendations.test.mjs` (3) per C27-4 / Exit criteria 4+6 |
| CHANGELOG.md `[Unreleased]/Fixed` entry citing CS27 | done | yoga-ah | Deliverable #5 |
| Update CS16 `sub-invaders-bootstrap-summary.md` Findings #7+#8 with resolution notes | done | yoga-ah | Deliverable #6 / Exit criteria 9 — in-repo `done_cs16` record updated; canonical sub-invaders copy routes via cross-repo issue (see Notes) |
| Fresh-consumer smoke probe (no active-row warning + recommendation lines) | done | yoga-ah | Exit criteria 5+6; transcript in Notes |
| Self-checks: `node --test` + `harness lint --quiet` + `harness sync --mode=check` | done | yoga-ah | Exit criteria 7 — 1069 pass/1 skip; lint 30/30; no drift |
| Plan-vs-implementation review (close-out gate) | pending | — | gpt-5.5 rubber-duck per OPERATIONS.md |
| Close-out: docs + restart state (WORKBOARD row removed, active→done rename) | pending | — | per OPERATIONS.md § Claim three-PR shape |
| Close-out: learnings + follow-ups | pending | — | per OPERATIONS.md § Claim |

## Notes / Learnings

### Implementation summary

- **Finding #7** (`lib/sync.mjs`): `workboardHasActiveRows` is now an exported
  function applying the C27-1 predicate (CS-Task ID + State non-placeholder AND
  Owner-or-Branch non-placeholder), with a new `isPlaceholderWorkboardCell`
  helper. A row is parsed from `cells = trimmed.split('|').slice(1,-1)` and is
  required to have ≥5 columns (the canonical Active Work schema is 7:
  `CS-Task ID | Title | State | Owner | Branch | Last Updated | Blocked Reason`).
  The seeded em-dash placeholder row no longer false-positives.
- **Finding #8** (`bin/harness.mjs`): `LINT_SKIP_RECOMMENDATIONS` maps the two
  consumer-applicable checks (`pr-body`, `commit-trailers`) to adoption hints;
  the lint summary renders `not configured (recommendation: …)` in non-quiet
  mode only — under `--quiet` the row falls back to the plain
  `skipped (target not found)` form so the `cs15d-aggregator` summary-row
  parser (which runs lint `--quiet` and asserts exact row counts) is unaffected.
- Tests: `tests/cs27-workboard-active-row-detector.test.mjs` (8) +
  `tests/cs27-lint-recommendations.test.mjs` (3). Stale 3-column WORKBOARD
  fixtures in `tests/sync.test.mjs` (the `WORKBOARD.md warning` block) were
  updated to the canonical 7-column schema.

### Self-checks (content branch `cs27/lint-detector-tightening`)

- `node --test` → 1069 passed / 0 failed / 1 skipped.
- `node bin/harness.mjs lint --quiet` → 30 passed / 0 failed / 3 skipped.
- `node bin/harness.mjs sync --mode=check` → No drift detected.

### Fresh-consumer smoke probe (Exit criteria 5 + 6)

```
$ harness --cwd <tmp> init --from-example=self
Sync complete (15 composed/managed files materialized).

$ harness --cwd <tmp> sync --mode=check
No drift detected.            # <- Finding #7: NO "WORKBOARD.md has active CS rows" warning

$ harness --cwd <tmp> lint
  – pr-body: not configured (recommendation: add .github/pull_request_template.md so PR bodies follow the required section structure per OPERATIONS.md)
  – commit-trailers: not configured (recommendation: add a Co-authored-by trailer to your commit messages per .github/copilot-instructions.md § Branch and commit conventions)
```

> **Deviation from Decision C27-3 (recorded per Copilot PR #239 review):** the
> `commit-trailers` recommendation text in C27-3 originally read
> `add .github/pull_request_template.md and use --signoff or Co-authored-by
> trailers per OPERATIONS.md § Branch and commit conventions`. Copilot review
> correctly flagged that (a) `OPERATIONS.md` has no "Branch and commit
> conventions" section — it lives in `.github/copilot-instructions.md`, and
> (b) `--signoff` emits a `Signed-off-by` trailer, but `check-commit-trailers`
> requires `Co-authored-by` by default. The emitted text was corrected to
> `add a Co-authored-by trailer to your commit messages per
> .github/copilot-instructions.md § Branch and commit conventions`. The C27-3
> Decisions row is left verbatim to preserve the plan-review hash; this Notes
> entry is the deviation record.

### Deliverable #6 / Exit criteria 9 — cross-repo note

The canonical `sub-invaders-bootstrap-summary.md` lives in the
`henrik-me/sub-invaders` consumer repo (it was authored on the unmerged
`cs16/content` branch and never reached agent-harness `main`). Per the
orchestrator cross-repo constraint (OPERATIONS.md § Cross-repo procedures),
its Findings #7/#8 resolution annotation cannot be committed from here; the
in-repo CS16 record (`done_cs16_bootstrap-sub-invaders.md` →
Production-validation evidence) carries the resolution note instead, and the
canonical-copy update is filed as sub-invaders issue
[#91](https://github.com/henrik-me/sub-invaders/issues/91).

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | yoga-ah |
| Reviewer agent | rubber-duck |

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_