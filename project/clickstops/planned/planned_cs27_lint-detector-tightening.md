# CS27 — Lint detector tightening (2 findings from CS16 sub-invaders bootstrap)

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** Pre-claim disposition of [Findings #7 + #8](../../clickstops/active/active_cs16_bootstrap-sub-invaders/sub-invaders-bootstrap-summary.md) from CS16 sub-invaders bootstrap (2026-05-11) by `yoga-ah`.
**Depends on:** None. May claim independently of CS25 / CS26 / CS16. Small enough to ship in a single sitting.

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

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per OPERATIONS.md § Claim) | planned | — | — |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_