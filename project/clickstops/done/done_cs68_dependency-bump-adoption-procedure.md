# CS68 — Dependency-bump adoption procedure + non-CS review-tooling support

**Status:** done
**Owner:** yoga-ah-c2
**Branch:** cs68/content
**Started:** 2026-07-04
**Closed:** 2026-07-04
**Filed by:** Out-of-CS `js-yaml` dependency-bump adoption (2026-06-07 by `yoga-ah-c2`). Surfaced while adopting Dependabot #226 as PR #262 (`js-yaml` 4.1.1→4.2.0, a DoS-hardening bump): the harness has no written procedure for adopting a Dependabot/dependency PR, and the review-evidence tooling is clickstop-centric so the bot/deps PR could not use it.
**Depends on:** None hard from prior CSs. Cross-references CS59 (content/release-PR admin-merge doctrine) — coordinate to avoid duplicating that section. May claim independently of prior CSs. **CS64b** (hard, added 2026-06-10) — the dep-bump branch flow (`deps/<pkg>-<ver>`) allocates a clone for re-creation + lockfile regen and must use the `lib/disposers.mjs` + `assertSafeRef` primitives (C64b-2); the adoption procedure references those primitives as the required pattern.

## Goal

Make adopting a Dependabot / dependency-bump PR a **written, repeatable** procedure rather than tribal knowledge, and remove the tooling friction that forced the maintainer to hand-author review evidence on PR #262. Two halves: (a) document the adoption procedure + branch convention; (b) teach `harness review` to run on a non-clickstop PR so deps/maintenance PRs can use the canonical review-evidence flow.

## Background

A routine security/dependency bump exposed a process gap during the v0.7.x tail (2026-06-07):

- **Gap A — no documented adoption path.** Dependabot opened #226 (`js-yaml` 4.1.1→4.2.0, carrying an upstream DoS-hardening fix). The bot PR failed the three review-evidence gates (`copilot-review-attached`, `independence-invariant`, `review-log-evidence`) because it carries no `## Model audit` / `## Review log`. No OPERATIONS.md/INSTRUCTIONS.md procedure tells an agent how to adopt such a PR. The working path was discovered ad hoc: re-create the bump on a `deps/js-yaml-4.2.0` branch, hand-author the evidence blocks per REVIEWS.md §2.8, obtain an independent GPT-5.5 rubber-duck (`Go`) + Copilot review, then owner-override merge (PR #262, squashed as `e151fa6`); #226 closed as superseded.

- **Gap B — `harness review` is clickstop-centric.** `runReview` derives the CS id from the branch name (`extractCsIdFromBranch(pr.headRefName)`) and reads the matching clickstop file to parse implementer models (`lib/review.mjs:142-145`). On a non-CS branch (`dependabot/…` or `deps/…`) there is no `csNN/` id and no clickstop file, so `harness review` cannot run — the maintainer must hand-author `## Model audit` + `## Review log`, which is exactly the friction Gap A worked around.

Already-adequate doctrine (NOT in scope to restate): the owner-override `gh pr merge --admin` reality for a solo orchestrator on a content PR is a CS59 deliverable (C59-3); Dependabot alert handling + source-template propagation audit is LRN-081. CS68 links these rather than duplicating them.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C68-1 | Adoption procedure doc | Add a `## Dependency-bump adoption` section to OPERATIONS.md with the ordered steps: re-create the bump on a `deps/<pkg>-<ver>` branch off current `origin/main`; tighten the semver range to the patched version + regenerate the lockfile; run tests + `harness lint`; produce `## Model audit` + `## Review log` per REVIEWS.md §2.8 (implementer model ≠ reviewer model); obtain an independent GPT-5.5 rubber-duck `Go` + a Copilot review; confirm the review-evidence gates are green; merge via owner-override `gh pr merge --squash --admin` (link CS59 C59-3); close/supersede the Dependabot PR; verify post-merge `main` is green. Cross-link CS59 and LRN-081 instead of restating them. | Converts the verified-but-tribal #262 procedure into doctrine so future Dependabot adoptions are reproducible. |
| C68-2 | Branch-naming convention | Register `deps/<pkg>-<ver>` for dependency/maintenance PRs in the INSTRUCTIONS.md branch-naming bullet (+ `template/managed/INSTRUCTIONS.md` mirror), alongside `csNN/` and `workboard/cs<NN>-*`. | Gives maintenance PRs a sanctioned branch shape distinct from CS work, matching what #262 used. |
| C68-3 | `harness review` non-CS support | Extend `runReview`/`cmdReview` so that when the PR branch has no `csNN/` id, implementer models are sourced from an explicit `--implementer-models <csv>` flag and/or the PR body's existing `## Model audit`, instead of `findClickstopFile`, preserving current clickstop-branch behaviour as the default. When BOTH sources are present they are **unioned**, and a flag value that conflicts with (is not a superset of) the PR-body audit is a hard error — the flag must never silently shrink or overwrite the audited implementer set. Keep `assertReviewerAllowed` enforcement on the non-CS path. Add unit tests for the happy path, the union/conflict cases, and the missing-source / reviewer∈implementers rejection. | Lets deps/maintenance PRs use the canonical review-evidence tooling instead of hand-authoring the blocks — removes the Gap B friction at its root, without giving the flag a way to launder an independence violation. |
| C68-4 | Capture the learning | File LRN-157 (`category: process`, `status: applied`) at close-out with `source_cs: CS68`, recording the gap + the codified procedure and superseding the interim agent-memory note (per LRN-153). | Satisfies knowledge-in-repo doctrine; the learning schema requires a `source_cs` matching `^CS…`, which CS68 now supplies for out-of-CS-surfaced work. |
| C68-5 | Scope boundaries | Touch only OPERATIONS.md, INSTRUCTIONS.md, `lib/review.mjs`, `bin/harness.mjs`, `tests/`, LEARNINGS.md, CHANGELOG.md, and the composed/managed mirrors. No `schemas/` changes. Keep root + mirror docs in lockstep. Coordinate with CS59 to avoid overlapping the admin-merge section. | Scope discipline; the merge doctrine already belongs to CS59, and no artefact shape changes are required. |

## Deliverables

1. **`OPERATIONS.md`** — new `## Dependency-bump adoption` section per C68-1 (+ `template/composed/OPERATIONS.md` lockstep mirror if the composed mirror covers it).
2. **`INSTRUCTIONS.md`** (+ `template/managed/INSTRUCTIONS.md` mirror) — `deps/<pkg>-<ver>` added to the branch-naming convention per C68-2.
3. **`lib/review.mjs`** + **`bin/harness.mjs`** — non-CS implementer-model source per C68-3, with unit tests under `tests/*.test.mjs` (minimum: non-CS happy path resolves models from `--implementer-models`/PR-body Model audit; non-CS path still rejects reviewer∈implementers; absent source yields a clear error).
4. **`LEARNINGS.md`** — LRN-157 (`process`, `applied`) per C68-4, with cross-refs to LRN-081, LRN-153, and CS59.
5. **`CHANGELOG.md`** — entry under `[Unreleased]`.

## User-approval gates

- **G-release** if CS68 ships in its own tag. Standard pattern.

## Exit criteria

1. `OPERATIONS.md § Dependency-bump adoption` exists with the ordered steps and the CS59 / LRN-081 cross-links (C68-1).
2. `deps/<pkg>-<ver>` is documented in the INSTRUCTIONS branch-naming convention + managed mirror (C68-2).
3. `harness review` runs against a non-CS branch via `--implementer-models` (and/or PR-body `## Model audit`) with tests green; clickstop-branch behaviour unchanged (C68-3).
4. LRN-157 is filed with `source_cs: CS68` (C68-4).
5. `harness lint --quiet` passes the full suite on self-host, including composed/managed lockstep checks.
6. CHANGELOG entry present.
7. Plan-vs-implementation review (GPT-5.5 gate) returns GO.

## Risks + open questions

| # | Risk | Mitigation |
|---|---|---|
| R1 | C68-3's review-flow change is larger than expected | Deliverables are separable: ship C68-1/C68-2/C68-4 (docs + convention + learning) first and split C68-3 into a follow-up CS if the refactor grows. The doc path has no code dependency. |
| R2 | Root vs composed/managed mirror drift (OPERATIONS, INSTRUCTIONS) | Update root + mirror in the same PR; rely on the existing composed-blocks lockstep lint. |
| R3 | Overlap with CS59's admin-merge section | C68-1 links to CS59 C59-3 rather than restating it; coordinate at claim time if CS59 is still open. |
| R4 | `--implementer-models` could weaken the independence guard if misused | Preserve `assertReviewerAllowed`; union the flag with any PR-body `## Model audit` and hard-error on a non-superset conflict so the flag cannot shrink the audited implementer set; require tests that the non-CS path still rejects a reviewer model appearing in the (unioned) implementer set. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: yoga-ah-c2) | 23ce77c74408 | 2026-06-08T00:24:04Z | Needs-Fix | LRN-155 already used by CS63a; the non-CS `--implementer-models` flag could shrink an existing Model audit — needs union/fail-on-conflict. |
| R2 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: yoga-ah-c2) | ddd8a2b89075 | 2026-06-08T00:46:04Z | Go-with-amendments | R1 fixes hold (LRN-157, union/fail-on-conflict + tests); amended stale Exit criterion LRN-155→LRN-157. |

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | yoga-ah-c2 |
| Reviewer agent | rubber-duck (orchestrator: yoga-ah-c2) |
| Notes | Planned assignment per INSTRUCTIONS.md § Every CS (orchestrator + implementer sub-tasks: claude-opus-4.8; local review: gpt-5.5). Independence per REVIEWS § 2.3 — reviewer gpt-5.5 ≠ implementer claude-opus-4.8. Finalized at close-out. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1 — OPERATIONS.md `## Dependency-bump adoption` section: ordered adoption steps (`deps/<pkg>-<ver>` branch, tighten range + regen lockfile, tests + lint, author `## Model audit`/`## Review log` per REVIEWS §2.8, GPT-5.5 Go + Copilot, owner-override squash-merge, supersede Dependabot PR, verify green) + `template/composed/OPERATIONS.md` lockstep mirror (C68-1) | done | cs68-docs | agent-id=cs68-docs \| role=impl \| model=claude-opus-4.8 \| report-status=complete \| learnings=0. Cross-link CS59 C59-3 + LRN-081 — link, don't restate (R3). Root + composed mirror lockstep (R2). |
| T2 — INSTRUCTIONS.md + `template/composed/INSTRUCTIONS.md` mirror: register `deps/<pkg>-<ver>` in the branch-naming convention (C68-2) | done | cs68-docs | agent-id=cs68-docs \| role=impl \| model=claude-opus-4.8 \| report-status=complete \| learnings=0. **Deviation:** plan said `template/managed/INSTRUCTIONS.md`, but INSTRUCTIONS.md is a *composed* file — the real mirror is `template/composed/INSTRUCTIONS.md` (managed variant does not exist; LRN-152 deliverable-target check). Root + composed lockstep (R2). |
| T3 — `lib/review.mjs` + `bin/harness.mjs`: non-CS implementer-model source via `--implementer-models` and/or PR-body `## Model audit` (union; hard-error on non-superset conflict; preserve `assertReviewerAllowed`; clickstop-branch path unchanged) (C68-3) | done | cs68-code | agent-id=cs68-code \| role=impl \| model=claude-opus-4.8 \| report-status=complete \| learnings=0. Read `schemas/*` before field access. Independence guard preserved (R4). |
| T4 — Unit tests under `tests/*.test.mjs`: non-CS happy path (models from flag/PR-body audit), union + conflict cases, missing-source error, reviewer∈implementers rejection (C68-3) | done | cs68-code | agent-id=cs68-code \| role=impl \| model=claude-opus-4.8 \| report-status=complete \| learnings=0. Test minimums, not exact counts. New file `tests/cs68-review-non-cs.test.mjs`. |
| T5 — `CHANGELOG.md` `[Unreleased]` entry (C68-5) | planned | — | SemVer per OPERATIONS § SemVer policy (Minor — new `--implementer-models` flag). |
| T6 — File LRN-157 (`process`, `applied`) with `source_cs: CS68`, cross-refs LRN-081/LRN-153/CS59 (C68-4) | planned | — | At close-out; supersedes the interim agent-memory note (LRN-153). |
| Close-out: docs + restart state | planned | — | Update WORKBOARD.md + CONTEXT.md + relevant docs so a fresh agent can restart from actual state. |
| Close-out: learnings + follow-ups | planned | — | File LRN-157 + any follow-up planned CS (R1: C68-3 may split to a follow-up if the refactor grows). |

## Notes / Learnings

Genesis: PR #262 (`deps/js-yaml-4.2.0`, merged `e151fa6`) adopted Dependabot #226 through the review-evidence gates with hand-authored evidence; the hand-authoring + missing procedure is what this CS removes.

**Execution (2026-07-04, yoga-ah-c2):** Content **PR #475** (squash `30d626f`) admin-squash-merged. Two disjoint background sub-agents (`cs68-docs`, `cs68-code` — both `claude-opus-4.8`) + orchestrator integration. Review-of-record: **gpt-5.5 rubber-duck R1 Needs-Fix → R2/R3 Go** (R1 caught a real Blocking bug — `validateContentPr`'s fork gate was dead because `PR_VIEW_FIELDS` never requested `isCrossRepository`; fixed + regression-tested) + **Copilot COMMENTED** (2 nits applied — non-CS prompt label + branch-error `|`→`or`; 1 nit resolved-not-refixed — `MAINTENANCE_BRANCH_RE`'s `/` is intentional for scoped npm packages `deps/@scope/pkg-ver` + dependabot nested branches). Scope additions beyond the literal C68-3 enumeration (both justified + test-covered): `MAINTENANCE_BRANCH_RE` in `validateContentPr` (the non-CS reject fired one gate before `extractCsIdFromBranch`) and the `isCrossRepository` fork-gate fix.

**Deviation — LRN-157 → LRN-203 (per LRN-143):** C68-4 / Deliverable 4 / Exit criterion 4 name "LRN-157", but that id was concurrently claimed by **CS63c/CS64b** (the temp-dir/clone disposer pattern; `LEARNINGS.md#lrn-157`, referenced by `lib/disposers.mjs`, `OPERATIONS.md`, tests) when the CS68 plan was authored (2026-06-08). The highest existing LRN is 202, so the CS68 close-out learning is filed as **LRN-203** (`process`, `applied`, `source_cs: CS68`), cross-referencing LRN-081 + LRN-153 + CS59 as planned. The hashed `## Decisions`/`## Deliverables` rows are left intact; this note records the number correction.

## Plan-vs-implementation review

**Reviewer:** gpt-5.5 (`cs68-pvi`, background rubber-duck; independent of implementer `claude-opus-4.8`)
**Analyzed HEAD:** `30d626f0932d97ca77c2e7cc1f934014de67976b` (merged content PR #475)
**Date:** 2026-07-04
**Outcome:** GO

Deliverable / exit-criterion mapping:
- **D1 (C68-1)** — met. `OPERATIONS.md § Dependency-bump adoption` (root + byte-identical composed mirror), 8 ordered steps, cross-links CS59 C59-3 + LRN-081 (not restating); anchors resolve.
- **D2 (C68-2)** — met. `deps/<pkg>-<ver>` in the INSTRUCTIONS.md branch-naming bullet + byte-identical composed mirror. Plan's `template/managed/INSTRUCTIONS.md` target corrected to the live composed mirror (accepted).
- **D3 (C68-3)** — met. Non-CS routing + `resolveNonCsImplementerModels` union/superset invariant + independence guard preserved + clickstop path unchanged; 17 tests cover flag/body/union/conflict/missing-source/independence/fork-gate.
- **D4 (C68-4)** — the close-out learning is filed at close-out as **LRN-203** (see the LRN-157 deviation above).
- **D5 (C68-5)** — met. CHANGELOG `[Unreleased]` Added + Documentation entries.
- **Exit criteria 1-7** — 1 met; 2 met (composed-mirror correction accepted); 3 met (tests green); 4 satisfied by LRN-203; 5 met (`harness lint --quiet` 36/0/3); 6 met; 7 met (this gate).

Rationale: all content-PR deliverables (D1/D2/D3/D5) met, mirrored surfaces in lockstep, C68-3/R4 sufficiently test-covered; the only close-out item was the CS68 learning (LRN-203). No NEEDS-FIX.
