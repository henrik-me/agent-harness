# CS38b — Retroactive PR #28 self-test + harness self-host opt-in

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** Pre-CS38b disposition of [#145](https://github.com/henrik-me/agent-harness/issues/145) Phase 1 acceptance criteria. Authored 2026-05-12 by `yoga-ah`. Fifth CS in the v0.4.0 arc.
**Depends on:** [CS38a](planned_cs38a_pr-evidence-workflow-and-init.md) (workflow + init flag must exist), [CS36](planned_cs36_pr-evidence-fs-and-git-linters.md), [CS37](planned_cs37_copilot-review-gate-graphql.md).

## Goal

Two outcomes:

1. **Retroactive self-test**: Demonstrate that `harness pr-evidence` against `henrik-me/sub-invaders` PR #28 produces failures matching all 6 documented gaps (B1, A3, A4, A5 if CS37 spike PASSED, A16). Captured as a transcript in `docs/cs38b-retro-pr28-transcript.md` + reference fixture.
2. **Self-host opt-in**: Run `harness init --enable-review-gates` against the harness repo itself, land the resulting workflow + config changes, expose any latent violations on the harness's own `main` history, and either fix them or file follow-up CSs.

## Background

#145 Phase 1 acceptance criterion explicitly requires the linters to fire on a re-test of PR #28 and produce findings matching the documented failures. Doing this also doubles as integration-level proof that the entire CS35→CS37 stack works end-to-end.

Per rubber-duck finding 3, the retroactive test is non-trivial because PR #28 lives in another repo. Concrete command sequence required:

```bash
gh repo clone henrik-me/sub-invaders /tmp/si-retro
cd /tmp/si-retro
gh pr view 28 --json number,baseRefOid,headRefOid,body,labels,author,headRepository,baseRepository > /tmp/si-pr28.json
gh pr view 28 --body > /tmp/si-pr28-body.md
git fetch origin pull/28/head:pr-28
BASE=$(jq -r .baseRefOid /tmp/si-pr28.json)
HEAD=$(jq -r .headRefOid /tmp/si-pr28.json)
node /path/to/agent-harness/bin/harness.mjs pr-evidence \
  --base "$BASE" --head "$HEAD" --pr-body /tmp/si-pr28-body.md \
  --repo henrik-me/sub-invaders --pr 28 \
  --json > /tmp/si-pr28-evidence.json
```

The self-host opt-in is the second half: applying the harness's own gates to itself. This will likely surface latent violations because none of the existing harness PRs were reviewed against the new gates. The CS budget includes time to triage and either fix-in-place or file follow-ups.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C38b-1 | Retroactive transcript home | `docs/cs38b-retro-pr28-transcript.md` (committed). Includes the verbatim command sequence, the resulting JSON output, and a per-gate annotation mapping output to #145 failures 1–6. | Audit trail. Anyone can rerun and verify. |
| C38b-2 | Reference fixture | A snapshot of `gh pr view 28 --json` + body at the SHAs the retro-test runs against, stored in `tests/fixtures/si-pr28/` for regression tests. | Pins the fixture so future linter changes can verify "still detects PR #28 gaps" without network. |
| C38b-3 | Latent-violation policy | Run the retroactive on the harness's own `main` history (last 10 PRs); for each finding, classify as: (a) genuine violation → file follow-up CS; (b) doctrine-not-applicable (CS predates v0.4.0 doctrine) → grandfather with notice. The grandfather notice goes into LEARNINGS.md as a one-time disposition. | Self-host integrity matters; can't ship v0.4.0 with a self-host that fails its own gates. |
| C38b-4 | Self-host opt-in scope | Run `harness init --enable-review-gates` in the harness repo; land `.github/workflows/pr-evidence-lint.yml` + `harness.config.json` `review_gates` block; manually add the required status check via repo settings (instructions block emitted by init). | Live demonstration of the opt-in path. |
| C38b-5 | Acceptance threshold | Retroactive must produce ≥4 distinct gate failures matching #145 (B1 mismatched commits + A3 independence violation + A4 stale `analyzed_head` + A16 missing/wrong Copilot review). A5 ordering may or may not appear depending on CS37 spike outcome. | Per #145 the documented failures; less than 4 means linters under-fire. |

## Deliverables

1. **`docs/cs38b-retro-pr28-transcript.md`** (new) per C38b-1.
2. **`tests/fixtures/si-pr28/`** (new) per C38b-2: snapshot files + a `tests/retro-si-pr28.test.mjs` that reruns `harness pr-evidence` against the fixture and asserts ≥4 expected failures.
3. **Self-host opt-in commits**:
   - `.github/workflows/pr-evidence-lint.yml` (landed via `harness sync` after the template change in CS38a).
   - `harness.config.json` `review_gates` block.
   - Branch-protection instruction acknowledgment recorded in CS38b PR body (manual step on user side).
4. **Latent-violation handling**: for each finding from C38b-3 step (a), file `project/clickstops/planned/planned_csNN_*.md`. For each (b), append disposition to LEARNINGS.md with rationale.
5. **CHANGELOG.md** `[Unreleased] / Added` entry: "harness self-host opted in to `pr-evidence-lint`".

## Sub-agent fan-out

1 sub-agent:

- **SA-1 (`bot38b-retro`)** — owns `docs/cs38b-retro-pr28-transcript.md` + `tests/fixtures/si-pr28/` + `tests/retro-si-pr28.test.mjs`. Runs the retroactive harness against SI PR #28; captures output. NOT touching `.github/workflows/` or `harness.config.json` (those are orchestrator-handled in step 3).

Orchestrator owns: self-host opt-in commits (Deliverable 3); latent-violation triage and follow-up CS filing (Deliverable 4); CHANGELOG.

## Exit criteria

1. `docs/cs38b-retro-pr28-transcript.md` exists and shows ≥4 distinct gate failures per C38b-5.
2. `tests/retro-si-pr28.test.mjs` passes deterministically (uses fixture, no network).
3. `.github/workflows/pr-evidence-lint.yml` runs successfully on the CS38b content PR itself.
4. `harness.config.json` includes `review_gates` block with `enabled: true`.
5. All latent violations from C38b-3 are either fixed or have a planned follow-up CS file or grandfather LRN entry.
6. `node --test tests/*.test.mjs` total = prior + ≥1.
7. `harness lint --quiet` + sync drift checks pass.
8. Plan-vs-implementation review `Go`.

## Risks + open questions

- **R1 (medium):** Self-host opt-in may surface a swarm of latent violations that consume the CS budget. Mitigation: timebox triage; default-grandfather for any CS predating v0.4.0; only fix violations on PRs opened after CS35 lands.
- **R2 (low):** Cross-repo `gh repo clone` requires `gh auth status` working for `henrik-me/sub-invaders`. Mitigation: document prerequisite in transcript.
- **R3 (low):** PR #28 SHAs may be force-pushed away. Mitigation: fixture snapshot (C38b-2) eliminates network dependency for regression tests.
- **OQ1:** Should the retroactive test also run against earlier sub-invaders PRs (e.g. PR #27, #26)? **Default:** no — PR #28 is the canonical reference per #145; expanding scope risks scope creep. Add as follow-up CS if useful.

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time) | planned | — | — |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out)_
