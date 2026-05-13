# CS39 — Release v0.4.0 + file SI pin-bump SUB-CS

**Status:** done
**Owner:** yoga-ah
**Branch:** cs39/release-v0.4.0
**Started:** 2026-05-13
**Closed:** 2026-05-13
**Filed by:** Pre-CS39 disposition. Authored 2026-05-12 by `yoga-ah`. Sixth (final) CS in the v0.4.0 arc; release-cut.
**Depends on:** [CS38b](planned_cs38b_retro-pr28-and-self-host-optin.md) (and transitively CS35–CS38a).

## Goal

Cut harness release v0.4.0 with the v0.4.0 arc deliverables (CS35–CS38b). Verify CHANGELOG completeness, tag, and observe the release workflow ship the GitHub Release. File a planned SUB-CS in `henrik-me/sub-invaders` for the orchestrator there to pin to v0.4.0.

## Background

Standard release-cut CS following the harness's existing pattern (see [done_cs29_release-cut-v0.3.0.md](../done/done_cs29_release-cut-v0.3.0.md)). Two harness-specific additions for this release:

1. **CHANGELOG section header format**: must use em-dash `—` (U+2014), not hyphen, per the `release.yml` awk extractor (memory: release.yml awk pattern + LRN earlier).
2. **SI pin-bump SUB-CS**: per C-D (D-D from session plan), I file the planned SUB-CS in `sub-invaders/project/clickstops/planned/`; SI orchestrator implements.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C39-1 | Version | v0.4.0 (minor bump from v0.3.x). | New CLI subcommand (`pr-evidence`), new config field (`review_gates`), new workflow template, new doctrine — minor per semver. |
| C39-2 | CHANGELOG header format | `## [0.4.0] — 2026-05-XX` (em-dash, ISO date). | Per memory + `release.yml` awk extractor requirement. |
| C39-3 | Release notes scope (degradation-aware per C37-1b) | The release notes describe ONLY the gates actually enforced in this release. The orchestrator reads CS37's close-out notes at release-cut time to determine the spike outcome, and assembles the highlights conditionally: ALWAYS include planning-locality enforcement; `harness pr-evidence` entry point + B1/A3/A4 gates; reviewer model fallback ladder; PR template managed→composed migration; `--enable-review-gates` opt-in. CONDITIONAL on CS37 PASS: include A5 + A16 as enforced. CONDITIONAL on CS37 PARTIAL with A5 deferred: include A16 as enforced; describe A5 as "doctrine ships in v0.4.0; live linter follow-up in v0.5.0 (see ADR-NNN)". CONDITIONAL on CS37 FAIL: describe both A5 + A16 as "doctrine ships in v0.4.0; live linters follow-up in v0.5.0 (see ADR-NNN)" — release notes MUST NOT claim Copilot-review enforcement. Migration callout: existing consumers see a sync warning until they opt in. | Per GPT-5.5 BLOCKING #1: release notes must reflect actual enforcement, not aspirational. Conditional language prevents "advertised but not enforced" gap. |
| C39-4 | SUB-CS filing location | I open a single PR against `henrik-me/sub-invaders` adding `project/clickstops/planned/planned_cs10_pin-harness-v0.4.0.md` (next available SUB-CS number — verified live via `gh api repos/henrik-me/sub-invaders/contents/project/clickstops/{planned,active,done}` 2026-05-13: existing csNN range is cs01–cs09, so cs10 is next; SI uses the `planned_csNN_*.md` naming convention, NOT `planned_subNN_*`). PR title: "Pre-SUB-CS prep: file pin-harness-v0.4.0". I do NOT implement the pin-bump; SI orchestrator does that under their own workflow. **R1 amendment 2026-05-13:** corrected file naming (was `planned_subNN_*` per CS39 plan; SI repo verification proved that wrong; now `planned_cs10_*` per actual SI convention). | Per D-D: I file the planned CS, SI orchestrator implements. Cross-repo coordination via PR. |
| C39-5 | Pin-bump SUB-CS content | The planned SUB-CS file documents: target version `v0.4.0`; what changes (composed PR template marker block; new sync warnings about `review_gates`; option to immediately opt in via `harness init --enable-review-gates`); recommended path (opt in immediately to derive value); risks (existing PRs need re-trigger to pick up the new gate). | Self-contained plan for SI orchestrator. |
| C39-6 | Release-trigger verification | Manually verify the GitHub Release page after the tag push: title `v0.4.0`; body matches CHANGELOG section; assets (none required for this release). | Standard release-day check. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.7-xhigh | rubber-duck dispatched (orchestrator: yoga-ah) | 000000000001 | 2026-05-12T00:00:00Z | Needs-Fix | CS39 plan: v0.4.0 release-cut. R1 surfaced CHANGELOG / SBOM / smoke-verify ordering; addressed in PR #149. |
| R2 | gpt-5.5 | claude-opus-4.7-xhigh | rubber-duck dispatched (orchestrator: yoga-ah) | 89da6676b7e3 | 2026-05-13T00:00:00Z | Go-with-amendments | Post-amendment review of the 9-CS arc (PR #149 amendments addressing R1 BLOCKING + non-blocking findings). Plan ready for claim. |
| R3 | gpt-5.5 | claude-opus-4.7-xhigh | rubber-duck dispatched (orchestrator: yoga-ah) | 9155928aa51e | 2026-05-13T21:55:00Z | Go-with-amendments | Plan-vs-impl R1 vs HEAD `73a3b77`. MAJOR: SI uses `planned_csNN_*` not `planned_subNN_*`. C39-4/C39-5/T11 amended to `planned_cs10_*`. No release-blocking findings. |
## Deliverables

1. **CHANGELOG.md** updates: replace `## [Unreleased]` with `## [0.4.0] — <date>`; ensure all CS35–CS38b entries are captured.
2. **`package.json`** version bump to `0.4.0`.
3. **Tag push**: `git tag v0.4.0 <commit-sha>` + `git push origin v0.4.0`. Triggers `release.yml` workflow.
4. **Cross-repo PR** to `henrik-me/sub-invaders` per C39-4: branch `docs/file-planned-cs10-pin-harness-v0.4.0`; new file `project/clickstops/planned/planned_cs10_pin-harness-v0.4.0.md` per C39-5 (R1-amended file convention).
5. **CONTEXT.md** refresh per LRN-105 pattern (record current codebase state through CS39).
6. **WORKBOARD.md** prune of CS35–CS39.

## Sub-agent fan-out

None. Release-cut is orchestrator-only.

## Exit criteria

1. CHANGELOG `## [0.4.0] — <date>` section is complete; em-dash format verified.
2. `package.json` version is `0.4.0`.
3. Tag `v0.4.0` exists; `release.yml` workflow run succeeds; GitHub Release page is published.
4. Sub-invaders PR is opened (number recorded in CS39 close-out notes).
5. CONTEXT.md + WORKBOARD.md updated.
6. No new linters/scripts introduced in this CS (release-cut is doc-only + tag).
7. `harness lint --quiet` + tests + sync drift all pass.

## Risks + open questions

- **R1 (low):** Tag push triggers a release workflow that may fail if CHANGELOG format is wrong. Mitigation: dry-run by checking `awk '/^## \[0\.4\.0\]/' CHANGELOG.md` returns the expected section before tagging.
- **R2 (low):** Cross-repo PR requires `gh auth status` for sub-invaders repo. Mitigation: orchestrator verifies before creating the PR.

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T0 — Claim PR (this PR) | done | yoga-ah | Rename planned→active; populate Tasks; update WORKBOARD; workboard-only PR. |
| T1 — Content branch from main | done | yoga-ah | Branched `cs39/release-v0.4.0` from `main` at SHA `56e812f`. |
| T2 — Read CS37 close-out for spike outcome (C39-3 conditional branch select) | done | yoga-ah | Verified CS37 spike outcome = PASS via `docs/adr/0004-copilot-graphql-spike.md` + done_cs37 references. CHANGELOG `## [0.4.0]` describes A5+A16 as ENFORCED per PASS branch. |
| T3 — CHANGELOG version bump | done | yoga-ah | `## [Unreleased]` → `## [0.4.0] — 2026-05-13` (em-dash codepoint verified `0x2014`). All CS35-CS38b entries captured. |
| T4 — package.json version bump | done | yoga-ah | `0.3.1` → `0.4.0`. `npm install --package-lock-only` synced lockfile (root + `packages.""` both `0.4.0`). |
| T5 — Local validation pre-PR | done | yoga-ah | `harness lint`: 28/0/3. `node --test`: 870 (869/0/1). `harness sync`: clean (mid-CS warning). CHANGELOG awk extractor compatibility verified by R1. |
| T6 — Open content PR + R1 plan-vs-impl review (release-cut convention) | done | yoga-ah | PR #169 opened. Copilot engaged via `gh pr edit --add-reviewer`. R1 returned Go-with-amendments at HEAD `73a3b77` (1 MAJOR finding on SI SUB-CS naming); R2 returned Go at HEAD `b45ff44` after amendment. |
| T7 — Close-out docs/restart-state task | done | yoga-ah | Renamed active→done; populated `## Plan-vs-implementation review` with R1+R2 transcripts; WORKBOARD dropped CS39 → `_no active CS_`; CONTEXT refreshed with CS39-done bullet + v0.4.0 arc complete + queue advances to v0.5.0 arc (CS40). |
| T8 — Admin merge content PR | done | yoga-ah | PR #169 admin-squash-merged at SHA `782742cc1a9ef9a6b8e04599aa13e1112725998e`. All 11 checks green pre-merge. |
| T9 — Tag push v0.4.0 | done | yoga-ah | `git tag v0.4.0 782742c -m "Release v0.4.0 — #145 enforcement-gap arc complete (CS35-CS38b)"` then `git push origin v0.4.0`. `release.yml` workflow run 25829299114 succeeded. |
| T10 — Verify GitHub Release page | done | yoga-ah | Per C39-6 verified: title `v0.4.0`, body = `## [0.4.0] — 2026-05-13` CHANGELOG section, createdAt 22:09:01Z, no assets required. |
| T11 — Cross-repo SI pin-bump SUB-CS PR | done | yoga-ah | Per C39-4/5 (R1-amended): SI PR [#48](https://github.com/henrik-me/sub-invaders/pull/48) opened on branch `docs/file-planned-cs10-pin-harness-v0.4.0` adding `planned_cs10_pin-harness-v0.4.0.md`. SI orchestrator implements pin-bump under their own workflow. |
| T12 — Close-out PR (workboard-only) + close-out learnings task | done | yoga-ah | Workboard-only close-out PR (this PR). LRN-113 filed for "release-cut should verify cross-repo naming conventions before plan freeze" (the R1 MAJOR finding). |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

**Reviewer:** gpt-5.5 (dispatched by yoga-ah)
**Date:** 2026-05-13
**Outcome:** Go (R1 Go-with-amendments → fixes applied → R2 Go)

### Transcript

**R1 — Go-with-amendments at HEAD `73a3b7706c46ca8986308bd212a1ad7ce6fab7cb`** (2026-05-13T21:55:00Z)

GPT-5.5 verified the release-cut against all six Decisions + seven Exit Criteria with a 12-row verification matrix. Release-cut content (CHANGELOG section + em-dash + package.json bump + lockfile coherence + release.yml extractor compatibility + sibling-CS closure + tag-collision safety + scope-tightness + validation suite) all green. Verdict downgraded from Go to Go-with-amendments by 1 MAJOR finding:

- **MAJOR** — Cross-repo SUB-CS filename convention wrong. CS39 plan said to file `planned_subNN_pin-harness-v0.4.0.md`, but live `henrik-me/sub-invaders` uses `planned_csNN_*` convention (verified via `gh api repos/henrik-me/sub-invaders/contents/project/clickstops/{planned,active,done}` 2026-05-13: existing csNN range cs01-cs09; next available cs10). C39-4/C39-5/Deliverable 4/T11 needed amendment to `planned_cs10_pin-harness-v0.4.0.md`.

R1 also surfaced two learning candidates: (a) cross-repo coordination should verify naming conventions against the target repo before hard-coding paths, (b) dry-running the changelog extractor before tag push is a useful release-cut invariant.

**R1-fixes-applied at HEAD `b45ff445fbe419096ed2b62c2ba08cd4df86182a`** (2026-05-13T22:05:00Z)

C39-4, C39-5, Deliverable 4, and T11 amended to reference `planned_cs10_pin-harness-v0.4.0.md` (verified live via `gh api`). R3 attestation row added to `## Plan review` section (hash `9155928aa51e`). Release-cut content (CHANGELOG + version bumps) untouched by amendment — R2 verified this invariant.

**R2 — Go at HEAD `b45ff445fbe419096ed2b62c2ba08cd4df86182a`** (2026-05-13T22:02:07Z)

GPT-5.5 verified all 5 R2 verification points pass: (1) amendment edits exist + correct, (2) no other files changed, (3) SI naming convention re-verified live, (4) R3 hash matches current Decisions+Deliverables hash, (5) `harness lint --quiet` exit 0 (28/0/3). No new findings. Approval: "the R1 amendment was correctly applied, introduced no unrelated file changes, has a current matching attestation hash, and passes lint."

**Bootstrap-CI iteration:** First CI run after R2 Go (run 25829027632 at 22:02:52Z) failed `read-only-gates` because (a) my Review log Go row had an analyzed_head ending in `73a3b77b` instead of the full 40-char SHA — actually, more accurately, the failure was A3+A4 because I initially wrote verdict cells like `Go (self-impl)` and `Go (R1-fixes-applied)` instead of the linter-required exact `Go` (the check uses `=== 'Go'` strict equality at `scripts/check-review-evidence.mjs:364`). After fixing verdict cells to exact `Go` (with qualifiers moved into the evidence_link column) + filling in full 40-char SHAs in analyzed_head, then re-running CI: also Copilot's first review at 22:01:56Z was BEFORE my latest local Go at 22:02:07Z, so A5 ordering would have failed — Copilot's second review at 22:05:42Z resolved that. Re-ran CI; all 11 checks green. Admin-merged at squash SHA `782742cc1a9ef9a6b8e04599aa13e1112725998e`.

**Tag + release:** Pushed `v0.4.0` tag at squash SHA `782742c`. `release.yml` workflow run 25829299114 succeeded; GitHub Release `v0.4.0` created at 22:09:01Z with the `## [0.4.0] — 2026-05-13` CHANGELOG section as the body. Em-dash extractor verified working end-to-end against a real release.

**Cross-repo SUB-CS:** Filed `henrik-me/sub-invaders` PR [#48](https://github.com/henrik-me/sub-invaders/pull/48) `docs/file-planned-cs10-pin-harness-v0.4.0` adding `project/clickstops/planned/planned_cs10_pin-harness-v0.4.0.md`. SI orchestrator implements the actual pin-bump under their own workflow.

**Merged:** content squash SHA `782742cc1a9ef9a6b8e04599aa13e1112725998e` (PR #169); v0.4.0 tag pushed; GitHub Release published; SI cross-repo PR #48 opened (awaiting SI orchestrator to claim CS10).

