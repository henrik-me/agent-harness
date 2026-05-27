# CS53 — Release v0.6.0

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** `omni-ah` (Copilot CLI / Claude Opus 4.7 1M) per [CONTEXT.md § Suggested next CSs](../../../CONTEXT.md#suggested-next-css-priority-ordered) item #1; queued by `yoga-ah` at the post-v0.5.2 retroactive close-out sweep (PR #204, 2026-05-15).
**Depends on:** None. The v0.6.0 `[Unreleased]` CHANGELOG arc (CS48 #198, CS49 #195, CS50 #197, CS51 #199, CS52 #196, chore PR #200, CS47 plan-filing PR #202) is already merged to `main`. CS47 (detached-HEAD fix) is **out of scope** here per C53-6 — it ships in a later patch.

## Goal

Cut harness release `v0.6.0` with the existing `CHANGELOG.md [Unreleased]` arc as the release notes. Mirror the procedural shape of [CS39](../done/done_cs39_release-v0.4.0.md) and [CS42](../done/done_cs42_release-v0.5.0.md) exactly: CHANGELOG transform, `package.json` bump, README pin sweep, content-PR squash, tag at the squash SHA, publish the draft release, file a SI cross-repo pin-bump SUB-CS. Execute the entire arc under "user-away" autonomy: every gate (plan review, plan-vs-impl review, workboard auto-merge, admin content-merge under maintainer credentials) is achievable without interactive user approval beyond the standing grants already given at plan-approval time.

## Background

The v0.6.0 `[Unreleased]` arc is already curated in `CHANGELOG.md` and contains two SemVer-minor signals per [OPERATIONS.md § SemVer policy](../../../OPERATIONS.md#semver-policy):

1. **CS52** added a new top-level CLI subcommand `harness review <pr>` (new user-facing surface area).
2. **CS51** added REVIEWS.md PR-side enforcement gates as **required status checks** (consumer-facing behavior change — existing PRs without the gates will block on merge).

Plus CS48 (ban implementer self-review), CS49 (orchestrator-availability doctrine + 15-min progress-reporting cadence + Workboard-first for out-of-CS work), CS50 (`WORKBOARD_MERGE_TOKEN` PAT bypass for consumer repos without the G3 App), and chore PR #200 (`check-pack` `DEFAULT_MAX_SIZE_BYTES` 1 MB → 2 MB to absorb doctrine growth).

Three operational realities for this release-cut, beyond the CS39/CS42 baseline:

- **LRN-124 (detached-HEAD trap)** remains unfixed; every `harness lint` / `harness sync` / `harness plan-review-hash` invocation may silently leave HEAD detached at the most-recent release tag (currently `v0.5.2 = 13ce97a` per `git tag --list`). Mitigation is operational only: **commit-first discipline** before every harness CLI call, plus `git symbolic-ref HEAD` verification after.
- **C42-6 deferred decision** (warn-not-error → error-flip for `--strict-agent-columns`) is **deferred again** per C53-5; it does not belong folded into a release-cut.
- **CS51's new required status checks** apply to the CS53 content PR itself. The PR body must be authored so that `review-log-evidence`, `copilot-review-attached`, `independence-invariant`, and `review-threads-resolved` all pass.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C53-1 | Version | `0.6.0` (minor bump from `0.5.2`). | New top-level CLI subcommand (CS52) + new required status checks affecting consumer merge gates (CS51). Both are SemVer-minor triggers per `OPERATIONS.md § SemVer policy`. |
| C53-2 | CHANGELOG header format | `## [0.6.0] — <ISO-date>` (em-dash U+2014). | Required by `release.yml` awk extractor; precedent CS39 C39-2 / CS42 C42-2. Dry-run with `awk '/^## \[0\.6\.0\]/' CHANGELOG.md` before tag push. |
| C53-3 | Tag location | `git tag -a v0.6.0 <content-squash-sha>` (NOT `main` HEAD). | Per CS39 T9 / CS42 T12 precedent: tag the actual content commit so the release artifact is reproducible from a single SHA. |
| C53-4 | SI cross-repo pin-bump | File `planned_csNN_pin-harness-v0.6.0.md` in `henrik-me/sub-invaders` via a PR (branch `docs/file-planned-csNN-pin-harness-v0.6.0`). SI orchestrator merges on their own cadence. **Opening the SI PR is in-scope for CS53; merging it is NOT.** | Per CS39 C39-4 / CS42 C42-4 pattern. Cross-repo coordination via PR; SI side is independent work-tracking. Next available SUB-CS number must be verified live via `gh api repos/henrik-me/sub-invaders/contents/project/clickstops/{planned,active,done}` before authoring (CS39 LRN-113 captured the consequence of not doing so). |
| C53-5 | C42-6 schema-migration error-flip | **Defer again.** Do NOT fold the `--strict-agent-columns` warn→error flip into CS53. File a separate planned CS at close-out time if/when adoption signal warrants it. | Release-cut scope discipline. CS42 T15 already deferred this once; release-cut is the wrong vehicle (no test changes, no behaviour change should ride in a release CS). |
| C53-6 | CS47 (detached-HEAD investigation) | **Out of scope.** v0.6.0 ships with LRN-124 mitigated only by commit-first discipline. CS47 lands in a later patch release. | CS47 plan is fully reviewed and ready to claim, but the v0.6.0 `[Unreleased]` arc is already curated; folding CS47 in would force re-review and delay release. CS47 is independent. |
| C53-7 | Plan + impl reviewer | GPT-5.5 rubber-duck (dispatched via `task` tool). NO Sonnet fallback. | Release-cut is **high-risk** per [REVIEWS.md](../../../REVIEWS.md) fallback rules: artifacts visible to all consumers (CHANGELOG, package.json, tag, GitHub Release). Independence invariant holds: orchestrator model = Opus 4.7 1M, reviewer model = GPT-5.5, no overlap. |
| C53-8 | Three-PR shape | (a) `cs53/plan-filing` — this plan + R-loop attestation (workboard-only-ish, small PR). (b) `cs53/claim` — workboard-only rename `planned→active` + WORKBOARD row. (c) `cs53/release-v0.6.0` — content. (d) `cs53/close-out` — workboard-only rename `active→done` + WORKBOARD/CONTEXT/LEARNINGS updates. | Standard CS39/CS42 shape; `cs53/plan-filing` is an extra preamble PR per CS35b plan-review-attestation doctrine (file the plan, run the GPT-5.5 R-loop, then claim). |
| C53-9 | Commit cadence + messages | Every owned-file edit batch commits immediately with a Conventional-Commits message (per user-feedback at plan approval). No batching of unrelated changes. Active CS file `## Tasks` table updated after each task completes (`state: pending → done` with a one-line note); each table update is its own commit `docs(cs53): mark Tx done — <summary>`. | Anti-LRN-124 discipline; auditable progress trail for "user-away" mode. |
| C53-10 | Admin-merge content PR | `gh pr merge <PR> --squash --admin --delete-branch` under the maintainer's `gh` credentials per the standing autonomy grant given at plan approval. Match-head-commit guard implicit via squash. | CS41/CS42 precedent (`workboard-bot does not auto-approve content PRs; admin path required`). User has confirmed standing grant at plan approval. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | _(pending)_ | claude-opus-4.7-1m | _(pending)_ | _(pending)_ | _(pending)_ | _(pending)_ | _(pending)_ |

## Deliverables

1. **`CHANGELOG.md`** — promote `## [Unreleased]` → `## [0.6.0] — <date>` (em-dash U+2014 per C53-2); re-seed empty `[Unreleased]` block with the standard `### Added / ### Changed / ### Documentation / ### Removed` skeleton.
2. **`package.json` (+ lockfile)** — bump `0.5.2 → 0.6.0` via `npm version 0.6.0 --no-git-tag-version` (this updates root + `packages."" ` version fields cleanly per CS42 T4 precedent).
3. **`README.md`** — pin-version sweep `v0.5.2` → `v0.6.0` (status banner refresh; install snippets if any pin v0.5.2; per CS42 T6 precedent — note README is sync-excluded).
4. **`project/clickstops/planned/planned_cs53_release-v0.6.0.md`** (this file) — fully populated `## Plan review` table with at least one row reaching `Go` or `Go-with-amendments` verdict.
5. **`project/clickstops/active/active_cs53_release-v0.6.0.md`** — at claim time (T-Claim); same content rename-only.
6. **`project/clickstops/done/done_cs53_release-v0.6.0.md`** — at close-out; with `## Plan-vs-implementation review` section populated per [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate).
7. **`WORKBOARD.md`** — claim-time row insert; close-out row prune.
8. **`CONTEXT.md`** — close-out refresh: record v0.6.0 cut + post-release state + advance `## Suggested next CSs` queue (top item likely becomes CS47).
9. **`LEARNINGS.md`** — any new LRN entries discovered during the cut (release-cut-specific learnings; LRN-121 already documents the release.yml-creates-draft gap).
10. **Git tag** `v0.6.0` at the content-PR squash SHA, pushed to origin.
11. **GitHub Release** — `release.yml` workflow creates a draft per LRN-121; orchestrator promotes draft to published via `gh release edit v0.6.0 --draft=false`.
12. **Cross-repo SI PR** — branch `docs/file-planned-csNN-pin-harness-v0.6.0` in `henrik-me/sub-invaders` opened (per C53-4). Merge is SI orchestrator's responsibility, not CS53's exit criterion.

## Risk Assessment

| # | Risk | Mitigation |
|---|---|---|
| R1 | **LRN-124 detached-HEAD trap** — any `harness lint`, `harness sync --mode=check`, or `harness plan-review-hash` invocation may silently detach HEAD at `v0.5.2` (the latest release tag at start of this CS), reverting uncommitted edits. | **Commit-first discipline** before every harness CLI call. After every such call, verify `git symbolic-ref HEAD` returns the expected branch ref AND `git status --short` matches the pre-call snapshot. If detached, `git checkout <branch>` immediately and re-apply lost edits from reflog or backup. |
| R2 | **CHANGELOG awk extractor format break** — `release.yml`'s awk uses em-dash U+2014; ASCII hyphen-minus silently breaks release-notes extraction (LRN-077 precedent). | Pre-tag dry-run: `awk '/^## \[0\.6\.0\] — / { found=1; print } END { exit found ? 0 : 1 }' CHANGELOG.md` must exit 0 and print the expected header line. |
| R3 | **release.yml ships draft, not published** — LRN-121 documented this recurring gap (CS39 + CS42 both observed). | Post-tag-push: `gh run watch <release.yml-run-id>` to completion; then `gh release edit v0.6.0 --draft=false` to publish. Record both run ID + publish timestamp in close-out. |
| R4 | **Content PR fails CS51's new required status checks** (`review-log-evidence`, `copilot-review-attached`, `independence-invariant`, `review-threads-resolved`). | (a) PR body authored from `.github/pull_request_template.md` with every H2 populated; (b) `harness copilot-engage <PR> --no-poll` to attach Copilot review; (c) `harness review <PR>` (the new CS52 CLI) to validate independence + log review evidence — dogfooding the new subcommand on its own release-cut PR. |
| R5 | **Cross-repo SI PR naming convention mismatch** — CS39 R1 finding (LRN-113): SI uses `planned_csNN_*.md`, not `planned_subNN_*.md`. | Pre-author verify via `gh api repos/henrik-me/sub-invaders/contents/project/clickstops/planned` + `done` + `active`. Find max existing `csNN`; use `csNN+1`. |
| R6 | **Admin-merge rejected** (e.g., a required check unexpectedly failing). | `gh pr checks <PR>` before merge; if any unexpected failure, fix on branch + re-trigger Copilot review + re-run plan-vs-impl review. Do NOT bypass legitimate failures via `--admin`. |
| R7 | **`harness sync` major-version warning during self-test** — v0.6.0 = minor bump from `0.5.x` pinned in `.harness-lock.json`, so no `--accept-major` needed. | None required; informational warning only. Verified via `OPERATIONS.md § SemVer policy` table. |
| R8 | **C53-9 commit-cadence discipline slippage under sub-agent dispatch** — release-cut is orchestrator-only (no sub-agents per CS39/CS42), so this risk is low for THIS CS but worth re-stating. | Sub-agent dispatch is explicitly NOT used in CS53 per "Sub-agent fan-out" below. Orchestrator self-discipline only. |

## Sub-agent fan-out

**None.** Release-cut is orchestrator-only per CS39 / CS42 precedent. All work runs on the orchestrator (Claude Opus 4.7 1M) directly. The only agent dispatch in this CS is the **reviewer** (GPT-5.5 rubber-duck) for plan review (Phase 0) and plan-vs-impl review (close-out gate). Reviewer dispatch is via the `task` tool with `agent_type=rubber-duck`, satisfying the CS48 reviewer-independence invariant (orchestrator model ≠ reviewer model).

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T0a — Plan-filing branch + author this file | done | omni-ah | branch `cs53/plan-filing`; commit-first per C53-9 |
| T0b — Compute plan-review hash (`harness plan-review-hash`) | pending | omni-ah | run AFTER plan committed (LRN-124 safety) |
| T0c — Dispatch GPT-5.5 plan review R1 | pending | omni-ah | rubber-duck via `task` tool; record verbatim in `## Plan review` |
| T0d — Plan-review LOOP: amend → recompute hash → dispatch R(N+1) until Go / Go-with-amendments | pending | omni-ah | cap 3 rounds per REVIEWS.md; escalate to user on R3 Needs-Fix |
| T0e — Open `cs53/plan-filing` PR; admin-merge or auto-merge after CI green | pending | omni-ah | small docs-only PR; required checks: lint + tests + sync drift |
| T1 — Workboard-claim PR (`cs53/claim`) | pending | omni-ah | rename `planned→active`; add WORKBOARD Active Work row; workboard-only label → auto-merge via workboard-auto-approve workflow |
| T2 — Branch `cs53/release-v0.6.0` from `main` post-claim-merge | pending | omni-ah | base SHA recorded in CS file |
| T3 — `npm version 0.6.0 --no-git-tag-version` + commit | pending | omni-ah | commit msg: `chore(release): bump package.json + lockfile to 0.6.0` |
| T4 — CHANGELOG transform: `[Unreleased]` → `[0.6.0] — <date>` + re-seed empty `[Unreleased]` + commit | pending | omni-ah | em-dash U+2014; commit msg: `docs(changelog): promote [Unreleased] → [0.6.0] — <date>` |
| T5 — README pin-version sweep `v0.5.2` → `v0.6.0` + status banner refresh + commit | pending | omni-ah | commit msg: `docs(readme): pin sweep v0.5.2 → v0.6.0 + v0.6.0 highlights banner` |
| T6 — Local validation: lint / tests / sync-check, verify HEAD attached after each | pending | omni-ah | per-call HEAD + `git status --short` snapshot diff |
| T7 — Open content PR with required H2s; `harness copilot-engage <PR> --no-poll` | pending | omni-ah | PR body from `.github/pull_request_template.md`; satisfies CS51 required checks |
| T8 — Dispatch GPT-5.5 plan-vs-impl rubber-duck review; record verbatim in `## Plan-vs-implementation review` section; loop until `GO` | pending | omni-ah | reviewer model differs from orchestrator (Opus 4.7 vs GPT-5.5); independence invariant holds |
| T9 — Admin-squash-merge content PR per C53-10 (`gh pr merge --squash --admin --delete-branch`) | pending | omni-ah | record squash SHA for T10 |
| T10 — Tag at squash SHA: `git tag -a v0.6.0 <squash-sha> -m "..."` + `git push origin v0.6.0` | pending | omni-ah | per C53-3; pre-push dry-run awk check per R2 |
| T11 — Watch `release.yml` to completion + publish draft via `gh release edit v0.6.0 --draft=false` | pending | omni-ah | per R3 / LRN-121 |
| T12 — Cross-repo SI PR per C53-4 | pending | omni-ah | verify naming convention live per R5 / LRN-113 |
| T13 — **Close-out: docs + restart state** (rename `active→done`, update WORKBOARD/CONTEXT, populate `## Plan-vs-implementation review`) | pending | omni-ah | per `check-clickstop.mjs` close-out enforcement |
| T14 — **Close-out: learnings + follow-up CSs** (file any new LRNs; file planned CS for C53-5 schema-migration deferral if signal emerges) | pending | omni-ah | per `check-clickstop.mjs` close-out enforcement |
| T15 — Close-out PR (`cs53/close-out`) | pending | omni-ah | workboard-only label → auto-merge |

## Exit criteria

1. Phase 0 plan-review loop landed `Go` or `Go-with-amendments` (latest row); `cs53/plan-filing` PR merged to `main`.
2. Content PR (`cs53/release-v0.6.0`) squash-merged to `main`; `## Plan-vs-implementation review` section in the active/done file ends in `Outcome: GO`.
3. CHANGELOG `## [0.6.0] — <date>` section exists with em-dash; `awk '/^## \[0\.6\.0\] — /' CHANGELOG.md` returns the header.
4. `package.json` version is `0.6.0`; lockfile coherent (root + `packages.""`).
5. Tag `v0.6.0` exists at the content-PR squash SHA; `release.yml` workflow run succeeded; GitHub Release page is **published** (not draft).
6. `harness lint --quiet` + `node --test` + `harness sync --mode=check` all clean on `main` post-merge.
7. Cross-repo SI PR opened in `henrik-me/sub-invaders` (PR number recorded in CS53 close-out notes); SI-side merge is NOT a CS53 exit criterion per C53-4.
8. CS53 file lives in `project/clickstops/done/`; WORKBOARD Active Work row removed; CONTEXT.md "Codebase state" + "Suggested next CSs" updated to reflect post-v0.6.0 state.

## Notes / Learnings

(filled during execution)
