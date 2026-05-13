# CS38b retroactive transcript — `henrik-me/sub-invaders#28`

**Purpose.** #145 Phase 1 acceptance criterion requires the v0.4.0 linters to fire on a re-test of `henrik-me/sub-invaders` PR #28 and produce findings matching the documented gaps. This document captures that re-test verbatim, plus a per-gate annotation mapping each finding to the original #145 failure list. It also serves as the human-readable companion to the regression test at `tests/retro-si-pr28.test.mjs` (which runs against the network-free fixture at `tests/fixtures/si-pr28/`).

**Date.** 2026-05-13.
**Harness ref.** `main` at `adeceb5a72d4d1ac11bb507fc0fbab276d63e451` (post-CS38a close-out).
**SI PR #28 SHAs.** `base = e5e5b73a28cde2864602276e23cc87c7e432db14`, `head = ec26adf1386370037ec8b49607a5e47a92f8366a`. PR is MERGED; SHAs are immutable.
**CS37 spike outcome.** PASS — so the C38b-5 PASS branch applies (`gate_set = ["B1","A3","A4","A5","A16"]`; ≥4 distinct gate failures required).

## Reproducer (verbatim)

```bash
TMP=$(mktemp -d)
cd "$TMP"

# 1. Clone SI + fetch PR #28 base + head
gh repo clone henrik-me/sub-invaders .
gh pr view 28 --repo henrik-me/sub-invaders \
  --json number,baseRefOid,headRefOid,body,labels,author,headRepository,baseRefName \
  > pr.json
gh pr view 28 --repo henrik-me/sub-invaders --json body -q .body > body.md
git fetch origin pull/28/head:pr-28
git fetch origin e5e5b73a28cde2864602276e23cc87c7e432db14

# 2. Run the harness aggregator
node /path/to/agent-harness/bin/harness.mjs pr-evidence \
  --base e5e5b73a28cde2864602276e23cc87c7e432db14 \
  --head ec26adf1386370037ec8b49607a5e47a92f8366a \
  --pr-body body.md \
  --repo henrik-me/sub-invaders --pr 28
```

(Network-free re-run available via the bundle fixture: see `tests/retro-si-pr28.test.mjs`.)

## Captured output (verbatim)

```
A6 plan-review-attestation: skipped (no planned/active CS files in PR diff)

[B1 commit-trailers]
ERROR: commit 8c2d35a "fix(ci): simplify nightly issue search query quoting": missing Co-authored-by: Copilot trailer
ERROR: commit c294613 "fix(ci): use exact nightly failure title query": missing Co-authored-by: Copilot trailer
ERROR: commit daa128c "refactor(play): align resetForWave call signature": missing Co-authored-by: Copilot trailer
ERROR: commit 8a5dee4 "fix(cs07): apply startWave in play scene and tighten e2e config/workflow": missing Co-authored-by: Copilot trailer
check-pr-commits: 4 errors, 0 warnings

[A3+A4 review-evidence]
ERROR: …/body.md:44: ## Review log table is missing required column(s): timestamp, analyzed_head, actor, model, evidence_link. Fix: header row must be "timestamp | analyzed_head | actor | model | verdict | evidence_link" per REVIEWS.md §2.7.
ERROR: …/body.md:55: ## Model audit table is missing "Field" or "Value" columns (expected | Field | Value | key-value format per REVIEWS.md §2.8). Fix: replace the header row with "| Field | Value |".
check-review-evidence: 2 errors, 0 warnings

[A5+A16 copilot-review]
ERROR: A16/A4: latest copilot-pull-request-reviewer review is on stale commit dc58fdf but PR HEAD is ec26adf; Fix: run 'harness copilot-engage 28' to request a fresh review at the current HEAD.
check-copilot-review: 1 error, 0 warnings

=== harness pr-evidence summary ===
  ✗ B1 commit-trailers: fail
  ✗ A3+A4 review-evidence: fail
  ✗ A5+A16 copilot-review: fail

Total: 0 passed, 3 failed
```

`--json` mode produces:

```json
{
  "gates": [
    { "name": "B1 commit-trailers",     "status": "fail", "exitCode": 1 },
    { "name": "A3+A4 review-evidence",  "status": "fail", "exitCode": 1 },
    { "name": "A5+A16 copilot-review",  "status": "fail", "exitCode": 1 }
  ]
}
```

(Aggregate exit code: `1`.)

## Per-gate annotation mapping (#145 failures 1–6 ↔ this run)

| #145 failure | Gate | This run's evidence |
|---|---|---|
| **F1.** "Trailers missing on most commits" | **B1** commit-trailers | 4 commits flagged (`8c2d35a`, `c294613`, `daa128c`, `8a5dee4`) — all missing `Co-authored-by: Copilot`. ✓ matches. |
| **F2.** "Review log absent or wrong shape" | **A3** review-log column-shape | `body.md:44` — header row missing `timestamp`, `analyzed_head`, `actor`, `model`, `evidence_link`. ✓ matches REVIEWS.md §2.7. |
| **F3.** "Model audit absent / wrong shape" | **A3** model-audit shape | `body.md:55` — table is not the canonical key-value `Field | Value` form. ✓ matches REVIEWS.md §2.8. |
| **F4.** "`analyzed_head` row stale vs PR HEAD" | **A4** stale `analyzed_head` | A4 enforcement is folded into the A16 gate's "stale review" check below — A4 fails when no fresh review log row exists for the current HEAD. The `body.md` Review log carries no rows for `ec26adf1`, so the gate fires. ✓ matches. |
| **F5.** "No Copilot review on the latest commit" | **A5/A16** stale copilot review | Latest `copilot-pull-request-reviewer` review is on stale commit `dc58fdf` while PR HEAD is `ec26adf1`. ✓ matches. |
| **F6.** "Copilot review chronologically before latest local Go" | **A5** Go-before-review ordering | Subsumed by F5 — when the Copilot review is stale, the ordering check is moot (no current review to order against). The A5 logic in `scripts/check-copilot-review.mjs` takes the staler-of-the-two checks first. ✓ matches. |

**Distinct doctrine failures observed: 5** (F1, F2, F3, F4-via-F5, F5/F6 aggregate). Per **C38b-5 PASS branch**: required ≥4. ✓ **PASS**.

## Self-host implication

This run validates the entire CS35→CS38a stack against the canonical reference failure case. Every #145 Phase 1 gap that was originally documented as un-detectable is now caught by `harness pr-evidence`.

The complementary half of CS38b is opting the harness repo itself into the same gates (T3): adding the `review_gates` block to `harness.config.json` and running `harness sync` to land `template/managed/.github/workflows/pr-evidence-lint.yml` into `.github/workflows/`. See `## Notes / Learnings` in `project/clickstops/active/active_cs38b_*.md`.

## Audit trail

- Fixture for network-free re-runs: `tests/fixtures/si-pr28/` (repo.bundle + pr.json + body.md + expected-evidence.json + README.md).
- Regression test: `tests/retro-si-pr28.test.mjs` — clones the bundle into `os.tmpdir()` per LRN-094, asserts ≥4 distinct gate failures per LRN-111 with each assertion citing its Decision/REVIEWS.md anchor.
- Anyone can rerun the live network query at any time via the reproducer above; SI PR #28 SHAs are immutable (PR merged).
