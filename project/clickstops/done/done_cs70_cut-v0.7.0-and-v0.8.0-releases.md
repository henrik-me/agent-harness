# CS70 — Cut harness v0.7.0 (backfill) + v0.8.0 (Unreleased)

**Status:** done
**Owner:** omni-ah (Copilot CLI / Claude Opus 4.7 1M)
**Branch:** cs70/release-v0.8.0
**Started:** 2026-06-09
**Closed:** 2026-06-09
**Filed by:** `omni-ah` (Copilot CLI / Claude Opus 4.7 1M) on 2026-06-09, surfacing context: while resolving the **G-release** user-approval gate in the CS64 pre-claim conversation, discovered that the existing `## [0.7.0] — 2026-06-03` CHANGELOG section was authored at CS54's close-out (PR #227, commit `53e1a09`) and `package.json` was bumped 0.6.0→0.7.0 in the same commit, but **no `v0.7.0` git tag was ever created** and **no GitHub Release was published**. Subsequent CSs (CS54b, CS61, CS62, CS63a/b/c) all landed under a new `[Unreleased]` section without further `package.json` bumps — yet that section includes new CLI subcommands (`harness upgrade` from CS63c; `harness harvest` de-stub from CS63b) and a new managed template file (CS63a) which are SemVer-minor signals per [OPERATIONS.md § SemVer policy](../../../OPERATIONS.md#semver-policy). The repo's release state is therefore drifted: `package.json` claims `0.7.0` but no `v0.7.0` tag exists, and minor-warranting work has piled up since.
**Depends on:** None hard. CS59 (release-process docs) + CS67 (`harness release` verb) remain planned; CS70 is the **manual one-off** that closes the v0.7.0 drift and clears the v0.8.0 backlog without waiting for that automation. CS70 inherits the standard release-cut shape established by CS53 / CS42 / CS39 and adapts it for the two-phase backfill-plus-cut scenario.

## Goal

Restore the harness's release-state integrity by (a) **backfilling the missing `v0.7.0` git tag + GitHub Release** at the commit where `CHANGELOG.md` + `package.json` already declare v0.7.0 (`53e1a09`), and (b) **cutting the new `v0.8.0` release** that captures everything currently sitting in `[Unreleased]` (CS54b, CS61, CS62, CS63a/b/c). After CS70, `git tag --list 'v*'` and `## [<version>] — <date>` CHANGELOG sections are 1:1, and consumers (notably `henrik-me/sub-invaders`) can pin a real tagged ref. Provides a clean v0.8.0 baseline for CS64 to ship as v0.9.0.

## Background

**Discovery.** `git log -S '## [0.7.0]' --oneline -- CHANGELOG.md` points at commit `53e1a09` (PR #227, 2026-06-03, "CS54: cut v0.7.0 release (CS54+CS55+CS56) and close out") — that commit promoted `[Unreleased]` to `## [0.7.0] — 2026-06-03`, bumped `package.json` 0.6.0→0.7.0, and updated the `[Unreleased]: ...compare/v0.7.0...HEAD` link, but the tag-push + `gh release create` steps were not executed and were not surfaced as a `LEARNINGS.md` follow-up. (`--diff-filter=A` is wrong here because the line was added to a pre-existing file, surfacing as a Modify not an Add; the bare `-S` form returns the correct commit.) `git tag --list 'v*'` confirms: `v0.4.0`, `v0.5.0`, `v0.5.1`, `v0.5.2`, `v0.6.0` — no `v0.7.0`.

**Drift since `53e1a09`.** The following CSs landed under the post-53e1a09 `[Unreleased]` section without further `package.json` bumps:

- **CS54b** (#229) — orphan PR-template removal (`### Changed`). Patch.
- **CS61** (#244) — shared reviews-policy config reader (`### Changed`). Patch (no consumer-visible surface change).
- **CS62** (#256) — fresh-clone bootstrap self-containment (`### Fixed`). Patch.
- **CS63a** (#264) — new managed template `template/managed/.github/workflows/harness-pr-check.yml` + `pr_check.enabled` config (`### Added`). **Minor** (new managed template + new optional config field per SemVer table).
- **CS63b** (#267) — `harness harvest` real implementation + new `check-closeout-freshness` script (`### Added`). **Minor** (was previously a stub subcommand returning exit 3; the implementation flips it to exit 0 with real behaviour — equivalent to "new subcommand" for SemVer purposes).
- **CS63c** (#270) — new `harness upgrade <ref>` CLI subcommand (`### Added`). **Minor**.

So `[Unreleased]` carries multiple **minor**-warranting additions, which per OPERATIONS.md § SemVer should trigger a minor bump. The cumulative effect: `[Unreleased]` is a v0.8.0 release (one minor above v0.7.0), not a patch.

**Constraint.** CS59 (release-process docs) and CS67 (`harness release` verb) are still planned. CS70 therefore follows the **existing manual release-cut precedent** (CS53 / CS42 / CS39): hand-edit CHANGELOG + `package.json`, hand-tag, hand-publish, hand-file SI cross-repo handoff issue (NOT PR — per Hard Rule § 6 + OPERATIONS § Cross-repo, the harness orchestrator is issue-only outside `henrik-me/agent-harness`; CS53 C53-4's direct-PR pattern predates this rule and is no longer valid). The `release.yml` workflow (`.github/workflows/release.yml`) is tag-triggered and creates a draft release per LRN-121; the orchestrator promotes draft → published. CS70 explicitly **does not** invent new release automation — that is CS67's scope.

**Why two phases rather than one combined v0.7.0 at HEAD.** Combining everything into a single `v0.7.0` tag at HEAD would (i) overload the existing `## [0.7.0]` section with content that wasn't in it on 2026-06-03 (a quiet rewrite of release-history), and (ii) silently violate the SemVer policy — CS63a/b/c's minor signals would ship under the same minor version as CS54/T5 + CS56. The two-phase backfill-plus-cut preserves the SemVer story and the historical record.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C70-1 | Two-phase scope | **Phase 1: backfill `v0.7.0`.** Pure tag-and-release operation at commit `53e1a09`; zero file changes. **Phase 2: cut `v0.8.0`.** Standard release-cut: CHANGELOG transform, `package.json` bump, README pin sweep, content PR, tag at content squash SHA, GitHub Release, SI cross-repo handoff issue (per C70-8, issue-only — not a PR). | Backfill restores the missing `v0.7.0` artifact at the commit that already declares it (`package.json` is already `0.7.0` at `53e1a09`; CHANGELOG has `## [0.7.0]`). v0.8.0 captures the post-`53e1a09` `[Unreleased]` content, which on its own contains multiple SemVer-minor signals (CS63a/b/c). Splitting preserves the SemVer story; combining at HEAD would rewrite release history. |
| C70-2 | v0.7.0 tag target | `git tag -a v0.7.0 53e1a09 -m "Release v0.7.0"` then `git push origin v0.7.0`. Annotated tag (matches CS39/CS42/CS53 precedent). Single push; no PR. | `53e1a09` is the commit where `## [0.7.0]` was authored and `package.json` was set to `0.7.0` — the natural release point. Tagging a historical commit is supported and reproducible. The tag operation itself is not a code change and does not need a PR (no commits land on `main`). |
| C70-3 | v0.7.0 release notes | Extract the existing `## [0.7.0] — 2026-06-03` section body from `CHANGELOG.md` at `53e1a09` (via `git show 53e1a09:CHANGELOG.md` + the same `awk` extractor `release.yml` uses) into a temp `release-notes-v0.7.0.md`; pass to `gh release create v0.7.0 --notes-file release-notes-v0.7.0.md --verify-tag`. If `release.yml` fires automatically on the tag push and creates a draft, promote that draft via `gh release edit v0.7.0 --draft=false` and discard the manual `release create` step (avoid duplicate). | Honors the curated CHANGELOG section. `release.yml` is tag-triggered and may auto-create a draft (LRN-121); the orchestrator must reconcile: either promote the auto-draft or create + publish manually. Both paths produce the same Release page; only one should ship. |
| C70-4 | v0.8.0 CHANGELOG transform | Promote the current `## [Unreleased]` section to `## [0.8.0] — <ISO-date>` (em-dash U+2014 per project convention; CS53 C53-2 precedent). Insert a fresh empty `## [Unreleased]` block above it with the standard `### Added / ### Changed / ### Documentation / ### Fixed` skeleton. Update the link references at the bottom: `[Unreleased]: ...compare/v0.8.0...HEAD` + add `[0.8.0]: ...compare/v0.7.0...v0.8.0`. | Matches the release.yml extractor's `^## \[<version>\]` regex (em-dash is project convention, not extractor-required, per CS53 C53-2). The link refs maintain the "newest at top" compare chain. |
| C70-5 | v0.8.0 `package.json` bump | `npm version 0.8.0 --no-git-tag-version` (updates root `version` + `packages[""].version` in `package-lock.json` cleanly per CS42 T4 / CS53 D53-2 precedent). | Standard pattern; lockfile parity is enforced by `check-pack.mjs` (CS13). |
| C70-6 | v0.8.0 tag target | `git tag -a v0.8.0 <content-PR-squash-SHA>` at the squash commit of the v0.8.0 content PR (NOT raw `main` HEAD). | Matches CS39 T9 / CS42 T12 / CS53 C53-3 precedent — release artifact is reproducible from a single SHA. |
| C70-7 | README pin sweep | Sweep `README.md` for any literal `v0.7.0` (or `v0.5.x`/`v0.6.x` if any survive) install/banner pins; flip to `v0.8.0`. Same for `template/` references that pin a specific harness version (audit but do not assume). README is sync-excluded per CS42 T6. | Consumer-facing install snippets must point at the latest tag. Empty result (no pins to update) is acceptable and recorded as such. |
| C70-8 | SI cross-repo handoff | **Issue-only handoff** per Hard Rule § 6 + OPERATIONS § Cross-repo procedures (issue-only, never direct PR). File exactly one tracking issue in `henrik-me/sub-invaders` via `harness cross-repo open-issue --repo henrik-me/sub-invaders --title '[harness:cs70] Pin harness to v0.8.0' --body-file <path>`; the CLI applies the `harness-orchestrator` label and performs an idempotent open-issue search. **Issue body MUST include the OPERATIONS § Cross-repo procedures step 4 required fields** (lines 565-584): `CS reference` (CS70 + link to its done/active file), `Target repo + kind of work` (`henrik-me/sub-invaders` / pin-bump), `Context` (link to the harness v0.8.0 merged content PR SHA + the `v0.8.0` tag), `Requested action / ask` (checklist: bump harness pin from current → v0.8.0, regenerate composed templates, etc.), `Acceptance criteria` (consumer-side `harness lint --quiet` 0 failed; `harness sync --mode=check` no drift; tests pass), `Verification steps` (`node bin/harness.mjs lint`, `node bin/harness.mjs sync --mode=check`, `node --test tests/*.test.mjs`), `Relevant LRNs / docs` (LRN-121 release-publish, REVIEWS § 2.8 review-log evidence, OPERATIONS § Cross-repo pin-bump PR body checklist (CS54)), `Harness PR / tag links` (v0.8.0 PR + tag URLs), and `Coordination` (explicit "harness orchestrator will not push directly; consumer-repo agent owns the PR"). Also paste the OPERATIONS § Cross-repo pin-bump PR body checklist verbatim under `Verification steps / Acceptance criteria` per OPERATIONS line 619-622. Skip the v0.7.0 backfill in the SI handoff — v0.8.0 supersedes it for consumer purposes and an SI issue tracking a 6-day-stale interim tag adds churn. **Opening the SI issue is in-scope for CS70 phase 2; the SI agent's response (PR, validation, merge) is NOT CS70's responsibility.** | Cross-repo doctrine is issue-only since CS55/LRN-137; the harness orchestrator MUST NOT open PRs in non-harness repos. The OPERATIONS step-4 field list (lines 565-584) is canonical; deviation produces incomplete handoffs. CS53 C53-4's direct-PR pattern predates the issue-only rule and is no longer valid. |
| C70-9 | Out-of-scope: CS59 + CS67 | CS70 does **not** ship release-process documentation (CS59) and does **not** implement the `harness release` verb (CS67). CS70 is the manual cut; CS67 will mechanize. Filing CS70 does not change CS59 / CS67 scope. | Each is its own design; bundling would re-create the CS63 mega-PR risk and delay the v0.8.0 release that CS64 depends on. |
| C70-10 | Reviewer = GPT-5.5, no Sonnet fallback | Plan-review + plan-vs-impl-review use GPT-5.5 (rubber-duck dispatched via `task` tool). **No Claude Sonnet fallback** because **CS70 is hereby designated HIGH-RISK by the orchestrator** per REVIEWS § 2.3 ("Any CS newly designated HIGH-RISK by the orchestrator inherits these same restrictions"). Designation rationale: CS70 produces consumer-visible, **irreversible** artifacts (annotated git tags `v0.7.0` and `v0.8.0`; published GitHub Releases; package-registry-equivalent `package.json` version bump) at the canonical "production" namespace. A bad release-cut cannot be silently reverted — it can only be superseded by another release. Independence invariant satisfied: orchestrator/plan-author model = Claude Opus 4.7 1M; reviewer = GPT-5.5; no overlap. The designation should be reflected at implementation time by adding `CS70` to `harness.config.json` → `reviews.high_risk_clickstops` for the duration of the active CS (revert at close-out unless persistent designation is desired). | Standing release-cut precedent inherited from CS53 C53-7 (which used GPT-5.5 exclusively); REVIEWS § 2.3 supports orchestrator HIGH-RISK designation; CS70's irreversibility and consumer visibility match the criteria the existing HIGH-RISK enumeration (CS03/CS11/CS15a/CS18b/CS19) was built to protect. |
| C70-11 | PR shape | **Standard 3-PR lifecycle plus plan-filing PR** (mirrors CS53 C53-8): (a) `docs/file-planned-cs70-cut-v0.7.0-and-v0.8.0-releases` — plan-filing PR (this plan + R-loop attestation). (b) `cs70/claim` — workboard-only rename `planned→active`. (c) `cs70/release-v0.8.0` — content PR (CHANGELOG + `package.json` + lockfile + README sweep). (d) `cs70/close-out` — workboard-only rename `active→done` + WORKBOARD/CONTEXT/LEARNINGS updates. Phase 1 (v0.7.0 backfill tag operation) executes from the active CS branch with **no commits** — it is pure `git tag` + `git push origin <tag>` + `gh release` — recorded in the active CS file's `## Tasks` table as a completed task. | Phase 1's tag-push is a namespace operation, not a code change; no PR mechanism applies. Phase 2 is a standard content release PR. The 3-PR-plus-plan-filing shape mirrors CS53 C53-8 wording exactly. |
| C70-12 | Phase ordering | **Phase 1 (v0.7.0 backfill) ships before Phase 2 (v0.8.0 cut).** Strict ordering: backfill the tag → verify GitHub Release page → THEN cut v0.8.0 (CHANGELOG promote needs the `[0.7.0]` link ref to point at a real tag). Both phases happen within a single active CS lifetime. | Ordering ensures the `[0.7.0]: ...compare/v0.6.0...v0.7.0` link ref resolves (currently it resolves to a non-existent tag). Reversing the order would leave v0.7.0 untagged across the v0.8.0 release. |

## Deliverables

1. **Git tag `v0.7.0`** at commit `53e1a09`, pushed to `origin`. Annotated, with message `Release v0.7.0`.
2. **GitHub Release `v0.7.0`** published (NOT draft), notes-body matches the `## [0.7.0] — 2026-06-03` CHANGELOG section.
3. **`CHANGELOG.md`** — promote `## [Unreleased]` → `## [0.8.0] — <ISO-date>` per C70-4; re-seed empty `## [Unreleased]` skeleton; add `[0.8.0]: ...compare/v0.7.0...v0.8.0` link ref; update `[Unreleased]: ...compare/v0.8.0...HEAD`.
4. **`package.json` + `package-lock.json`** — bump `0.7.0 → 0.8.0` via `npm version 0.8.0 --no-git-tag-version`.
5. **`README.md`** — pin-version sweep `v0.7.0` → `v0.8.0` (status banner + install snippets if any).
6. **`project/clickstops/planned/planned_cs70_cut-v0.7.0-and-v0.8.0-releases.md`** (this file) — fully populated `## Plan review` table with at least one row reaching `Go` or `Go-with-amendments`.
7. **`project/clickstops/active/active_cs70_cut-v0.7.0-and-v0.8.0-releases.md`** — at claim time (rename only).
8. **`project/clickstops/done/done_cs70_cut-v0.7.0-and-v0.8.0-releases.md`** — at close-out; with `## Plan-vs-implementation review` populated per the close-out gate.
9. **`WORKBOARD.md`** — claim-time row insert; close-out row removal.
10. **`CONTEXT.md`** — close-out refresh: record v0.7.0 backfill + v0.8.0 cut + post-release state.
11. **`LEARNINGS.md`** — minimum two new LRN entries (release-cut-specific findings + the v0.7.0-missed-tag root-cause learning so CS67 can mechanize the prevention).
12. **Git tag `v0.8.0`** at the content-PR squash SHA, pushed to `origin`.
13. **GitHub Release `v0.8.0`** published (NOT draft), notes-body matches `## [0.8.0]` CHANGELOG section.
14. **SI cross-repo handoff issue** — exactly one tracking issue filed in `henrik-me/sub-invaders` via `harness cross-repo open-issue --repo henrik-me/sub-invaders --title '[harness:cs70] Pin harness to v0.8.0' --body-file <path>` (per C70-8), labeled `harness-orchestrator` (auto-applied by the CLI). The SI agent's PR/validation/merge is **NOT** CS70's exit criterion.

## User-approval gates

- **G-tag-v0.7.0**: confirm backfilling `v0.7.0` at `53e1a09` is acceptable (vs. skipping v0.7.0 entirely and tagging v0.8.0 only). This plan defaults to "backfill" per C70-1; revisit at plan-review if there is reason to skip.
- **G-release-v0.8.0**: standing approval for the v0.8.0 minor cut (per OPERATIONS § SemVer triggers; this is the standard release ack the user grants at plan-approval time per CS53 precedent).
- **G-publish**: confirm the post-tag draft Release should be promoted to published (LRN-121 — `release.yml` ships a draft; orchestrator promotes). Standing approval per release-cut precedent.

## Exit criteria

1. `git tag --list 'v*'` includes `v0.7.0` (annotated, pointing at `53e1a09`) AND `v0.8.0` (annotated, pointing at the v0.8.0 content squash SHA).
2. Both GitHub Releases (`v0.7.0` + `v0.8.0`) are **published** (not draft), with notes bodies that match their CHANGELOG sections (verified via `gh release view <tag>`).
3. `package.json` and `package-lock.json` `version` fields equal `0.8.0`. `node -p "require('./package.json').version"` prints `0.8.0`. `check-pack.mjs` passes.
4. `CHANGELOG.md` has `## [Unreleased]` (empty skeleton) above `## [0.8.0] — <date>` above `## [0.7.0] — 2026-06-03`; link refs at file bottom include `[Unreleased]: ...compare/v0.8.0...HEAD`, `[0.8.0]: ...compare/v0.7.0...v0.8.0`, `[0.7.0]: ...compare/v0.6.0...v0.7.0`.
5. `README.md` contains no remaining `v0.7.0` install/banner pins.
6. SI cross-repo handoff issue is **open** in `henrik-me/sub-invaders` (one `[harness:cs70]`-titled issue with the `harness-orchestrator` label, referencing the real `v0.8.0` tag).
7. `node --test tests/*.test.mjs` green; `harness lint --quiet` 0 failed; `harness sync --mode=check` reports no drift.
8. Plan-vs-implementation review (GPT-5.5) returns `Go`.
9. Close-out PR merged; `done_cs70_*` lives in `project/clickstops/done/`; WORKBOARD row removed; CONTEXT refreshed; ≥ 2 LRN entries filed.

## Risks + open questions

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Tagging a 6-day-stale historical commit** (`53e1a09`) may surprise contributors who expect tags at recent HEADs; if any branch protection denies tag push to historical SHAs, the operation fails. | Verify pre-push: `git log 53e1a09 --oneline -1` matches the expected commit subject. `gh api repos/henrik-me/agent-harness/rulesets --jq '.[] | select(.target=="tag")'` to confirm no tag-creation ruleset blocks historical tags. If blocked, escalate as G-tag-v0.7.0 amendment + consider Plan B (skip v0.7.0). |
| R2 | **`release.yml` may auto-create draft Releases for both tags** (LRN-121). Without reconciliation, the orchestrator could publish duplicates or stale auto-generated notes. | After each `git push origin <tag>`: `gh run watch <release.yml-run-id>` to completion; `gh release view <tag>` to inspect; if draft exists, edit it with the curated notes (via `--notes-file`) then `--draft=false`; if no draft, `gh release create <tag> --notes-file ... --verify-tag`. Record run IDs + publish timestamps in close-out. |
| R3 | **`[Unreleased]` link ref broken between phase 1 + phase 2.** During the brief window after v0.7.0 tag-push but before the v0.8.0 content PR merges, the existing `[Unreleased]: ...compare/v0.7.0...HEAD` link is valid but the `[0.7.0]: ...compare/v0.6.0...v0.7.0` link resolves to a now-existent tag — coherent. Within the v0.8.0 content PR, link refs change. No drift if phases are atomic. | Phase ordering (C70-12) makes this self-resolving. Verify via `npm view` or by clicking the link refs in the rendered CHANGELOG before close-out. |
| R4 | **LRN-124 detached-HEAD trap** — `harness lint` / `sync --mode=check` / `plan-review-hash` invocations may silently detach HEAD at the most-recent release tag, reverting uncommitted edits. Now-relevant tags after phase 1 include `v0.7.0`. | Commit-first discipline before every harness CLI call. After every call: `git symbolic-ref HEAD` + `git status --short` snapshot match. If detached, `git checkout <branch>` + re-apply lost edits from reflog. (Mitigated more strongly once CS47-style detection lands.) |
| R5 | **Content PR fails CS51 required status checks** (`review-log-evidence`, `copilot-review-attached`, `independence-invariant`, `review-threads-resolved`). | Sequenced sub-tasks per CS53 R4 mitigation: populate PR body Model audit + Review log; dispatch GPT-5.5 plan-vs-impl rubber-duck; record verdict in active CS file + PR body; commit; THEN `harness review <PR>` for evidence gates; engage Copilot via `harness copilot-engage`; verify gates green via `gh pr checks` before admin-merge. |
| R6 | **`release.yml` awk extractor doesn't find a section** (`^## \[<version>\]`), routing to `--generate-notes` fallback (silent quality regression). | Pre-tag dry-run for each tag: `awk '/^## \[0\.7\.0\]/ { found=1 } END { exit found ? 0 : 1 }' CHANGELOG.md` (for phase 1, run against `git show 53e1a09:CHANGELOG.md`). Same for v0.8.0 against the merged v0.8.0 content. |
| R7 | **CS64 starts on an interim baseline.** If CS70 is delayed, CS64 claim happens at `package.json=0.7.0` with `[Unreleased]` already populated, and CS64's CHANGELOG entries would land under a heterogenous section. | Strict sequencing: CS70 ships (both phases) BEFORE CS64 claim. The amended planned_cs64 documents this dependency as a soft prereq; CS64 plan-review confirms. |
| Q1 | Should phase 1 use `gh release create --target 53e1a09` for atomic tag+release creation, or `git tag … && git push && gh release create` separately? | Resolve at implementation time; both are supported. Prefer the atomic form if `release.yml` doesn't auto-fire on `gh release create` (verify behaviour first). |
| Q2 | Should LRN-121 (release.yml ships draft) be reopened / re-applied per CS70 findings? | TBD at close-out; if CS70 surfaces new release-process gaps, file LRN entries with `source_cs: CS70`. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.7-1m-internal | rubber-duck (orchestrator: omni-ah) | 63b35a02d860 | 2026-06-09T16:30:00Z | Needs-Fix | B1: C70-8/D14 prescribed SI direct-PR (violates issue-only). B2: HIGH-RISK claim unsupported by REVIEWS §2.3. B3: git log --diff-filter=A returns empty. |
| R2 | gpt-5.5 | claude-opus-4.7-1m-internal | rubber-duck (orchestrator: omni-ah) | 29d138b6f44c | 2026-06-09T17:00:00Z | Needs-Fix | B2/B3/C70-11 resolved. B1 incomplete: stale "SI pin-bump PR" wording at Constraint paragraph + C70-1; C70-8 body-fields list didn't match OPERATIONS 565-584. |
| R3 | gpt-5.5 | claude-opus-4.7-1m-internal | rubber-duck (orchestrator: omni-ah) | 7ab92e2eb150 | 2026-06-09T17:15:30Z | Go | B1a stale direct-PR wording resolved (lines 30+38). B1b C70-8 now lists all 9 OPERATIONS canonical fields + verbatim-paste checklist. No new blockers. Plan ready to file. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| Phase 1: pre-tag rulesets + 53e1a09 sanity check | done | omni-ah | only `branch:main-protection` ruleset present (no tag ruleset); 53e1a09 = "CS54: cut v0.7.0 release (CS54+CS55+CS56) and close out (#227)" ✓ |
| Phase 1: `git tag -a v0.7.0 53e1a09 -m "Release v0.7.0"` + push | n/a (already done) | omni-ah | **Discovery during execution:** v0.7.0 tag already existed on origin (lightweight) pointing at 53e1a09 — created 2026-06-03 alongside the CS54 PR. CS70 plan filed on a faulty premise; see LRN candidate in Notes. |
| Phase 1: reconcile `release.yml` auto-draft (LRN-121) + publish v0.7.0 Release | done | omni-ah | Published v0.7.0 Release already existed (createdAt 2026-06-03T21:39:18Z, publishedAt 2026-06-03T21:39:48Z). Stale Draft v0.7.0 (release id 334015036, created same day) deleted via `gh api -X DELETE`. |
| Phase 2: branch `cs70/release-v0.8.0` + CHANGELOG promote (`[Unreleased]` → `[0.8.0]`) | done | omni-ah | em-dash, fresh `Added/Changed/Documentation/Fixed` skeleton, link refs updated (C70-4) |
| Phase 2: `npm version 0.8.0 --no-git-tag-version` | done | omni-ah | C70-5; lockfile parity per `check-pack.mjs` |
| Phase 2: README pin-version sweep | done | omni-ah | C70-7; install-pins bumped v0.7.0 → v0.8.0 (README.md lines 35/37/45/47), v0.8.0 status paragraph prepended at line 5 (R2 found my initial sweep had missed these — sweep was scoped too narrowly to non-doc files). |
| Phase 2: open content PR, run GPT-5.5 rubber-duck + Copilot review, merge | done | omni-ah | PR #278 merged 2026-06-09T17:55:41Z at squash SHA `2352d38b3ea7dff3147bc0c70c29cb0d5c4815b2`. Rubber-duck R2 Needs-Fix (README pin sweep) → R3 Go (gpt-5.5). Copilot review COMMENTED at HEAD `85fd05d`. Admin override on the final merge (REVIEW_REQUIRED status is the standing pattern for content PRs in this repo). |
| Phase 2: `git tag -a v0.8.0 <squash-sha>` + push + publish Release | done | omni-ah | Tagged `v0.8.0` at `2352d38b`; pushed; `release.yml` LRN-121 auto-draft (id `336781228`) reconciled and published (Latest, published_at 2026-06-09T17:56:38Z). Auto-draft body had the LRN-121 awk-extractor regression (30-char body); PATCHed via gh API with the full `[0.8.0]` CHANGELOG section (16920 chars). |
| Phase 2: SI cross-repo handoff issue (issue-only per Hard Rule §6) | done | omni-ah | https://github.com/henrik-me/sub-invaders/issues/93 — filed via `harness cross-repo open-issue`. Body has all 9 OPERATIONS canonical fields + verbatim pin-bump checklist. Body-file kept under `.tmp/` (gitignored, inside repo) per CS56 realpath-cwd-containment guard. |
| Plan-vs-implementation review gate (GPT-5.5) | done | rubber-duck (orchestrator: omni-ah) | GO verdict 2026-06-09T18:01:48Z (3 deliverables diverged for documented Phase 1 deviation; no NEEDS-FIX); recorded verbatim in § Plan-vs-implementation review. |
| Close-out: docs + restart-state (CONTEXT/WORKBOARD/HANDOFF + relevant docs) | in_progress | omni-ah | rename active→done; remove WORKBOARD row; refresh CONTEXT |
| Close-out: learnings + follow-ups (LEARNINGS.md + planned CSs) | in_progress | omni-ah | 2 new LRN entries: release-cut audit-before-build (status:open) + LRN-121 draft-cleanup gap (status:open) |

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.7-1m-internal |
| Reviewer model | gpt-5.5 |
| Implementer agent | omni-ah |
| Reviewer agent | rubber-duck (orchestrator: omni-ah) |
| Notes | _(updated at close-out with any additional implementer/reviewer models materially used; CS70 is HIGH-RISK per C70-10, no Sonnet fallback per REVIEWS § 2.3)_ |

## Notes / Learnings

- **Phase 1 already complete (discovered at execution time, 2026-06-09):** The v0.7.0 tag and published v0.7.0 GitHub Release already existed at the planned target commit `53e1a09` since 2026-06-03 — created automatically alongside the CS54 release-cut PR #227. The CS70 plan was filed on the (incorrect) premise that the v0.7.0 ship was incomplete; the actual gap was an auxiliary **Draft** v0.7.0 release (release id `334015036`, sibling artifact from the same `release.yml` LRN-121 run) that was never reconciled and lingered as a duplicate. **Recovery action:** deleted the stale Draft via `gh api -X DELETE repos/henrik-me/agent-harness/releases/334015036`; no tag mutation needed.
- **LRN candidate (release-cuts / audit-before-build, applies LRN-101 doctrine):** before filing any release-backfill or release-validation CS, the planner must run `gh release list --limit N`, `git ls-remote --tags origin <tag>`, and `gh api repos/<owner>/<repo>/releases --jq '.[] | select(.tag_name=="<tag>")'` for both **published** and **draft** states, and record the result in the plan's Constraints. CS70 spent one round-trip (claim + content PR setup) before the discovery surfaced; the audit is ~10 seconds and would have re-scoped CS70 from a 2-phase release to a 1-phase release + draft cleanup.
- **LRN candidate (`release.yml` LRN-121 follow-on):** the LRN-121 auto-draft can produce a *second* artifact when the tag-create event races with manual reconciliation, leaving an `untagged-...` Draft alongside the published Release. The orchestrator should idempotently delete any `tag_name == <version> && draft == true` siblings as part of every release-publish playbook.

## Plan-vs-implementation review

**Reviewer:** gpt-5.5 (rubber-duck, independent of implementer claude-opus-4.7-1m-internal)
**Date:** 2026-06-09T18:01:48Z
**Outcome:** GO

| Deliverable | Outcome | Rationale (only for non-match) |
|---|---|---|
| C70-1 | diverged | Phase 1 became verification plus stale duplicate draft cleanup because the v0.7.0 tag and published Release already existed; the deviation is documented in Notes per LRN-143. |
| C70-2 | diverged | The v0.7.0 tag already existed at `53e1a09` as a lightweight tag, so no annotated replacement/tag push was performed to avoid mutating an existing release artifact. |
| C70-3 | diverged | The v0.7.0 Release was already published; implementation verified it and deleted the stale sibling draft instead of creating/promoting a new release. |
| C70-4 | match |  |
| C70-5 | match |  |
| C70-6 | match |  |
| C70-7 | match |  |
| C70-8 | match |  |
| C70-9 | match |  |
| C70-10 | match |  |
| C70-11 | match |  |

Test-coverage assessment: **sufficient**. Re-ran `npm test --silent` summary at HEAD: 1182 tests, 1181 pass, 0 fail, 1 skipped, matching the PR body; `node bin\harness.mjs lint --quiet` reports 30 passed, 0 failed, 3 skipped; `sync --mode=check` reports no drift. Release artifact checks also passed: `v0.8.0` is latest/published, `v0.7.0` is published, package/lock versions are 0.8.0, and the v0.8.0 Release body equals the CHANGELOG section body. The LRN-101 audit remains valid: post-merge count is 49 only because it now includes the release-cut squash itself; the PR-body 48-commit audit covered the pre-release accumulated content.

Overall reasoning: **GO**. The v0.8.0 CHANGELOG content matches the shipped delta, the minor bump is SemVer-justified by new CLI subcommands and managed-template/config surface, the LRN-121 release-body regression was corrected, SI issue #93 contains the 9 canonical handoff fields plus the verbatim pin-bump checklist, and the Phase 1 deviations are explicitly captured as Notes/LRN candidates specific enough for close-out filing.
