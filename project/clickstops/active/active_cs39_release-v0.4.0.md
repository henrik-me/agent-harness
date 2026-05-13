# CS39 — Release v0.4.0 + file SI pin-bump SUB-CS

**Status:** active
**Owner:** yoga-ah
**Branch:** cs39/release-v0.4.0
**Started:** 2026-05-13
**Closed:** —
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
| T1 — Content branch from main | pending | yoga-ah | `cs39/release-v0.4.0` from current `main`. |
| T2 — Read CS37 close-out for spike outcome (C39-3 conditional branch select) | pending | yoga-ah | Per C37 close-out notes: spike outcome = PASS → release notes include A5+A16 as enforced. |
| T3 — CHANGELOG version bump | pending | yoga-ah | Replace `## [Unreleased]` with `## [0.4.0] — 2026-05-13` (em-dash U+2014 per C39-2; required by `release.yml` awk extractor). Verify all CS35–CS38b entries captured. |
| T4 — package.json version bump | pending | yoga-ah | `0.0.0-pre` → `0.4.0` per C39-1. Run `npm install --package-lock-only` if needed for lockfile coherence. |
| T5 — Local validation pre-PR | pending | yoga-ah | `harness lint --quiet`, `node --test tests/**/*.test.mjs`, `harness sync` clean drift. CHANGELOG dry-run via `awk '/^## \[0\.4\.0\]/' CHANGELOG.md` per C39-R1 mitigation. |
| T6 — Open content PR + R1 plan-vs-impl review (release-cut convention) | pending | yoga-ah | Open PR; engage Copilot via `gh pr edit --add-reviewer copilot-pull-request-reviewer`; dispatch GPT-5.5 R1 plan-vs-impl review per C35-2. Wait for CI green + Copilot review. |
| T7 — Close-out docs/restart-state task | pending | yoga-ah | Rename active→done; populate `## Plan-vs-implementation review` H2 with R1 transcript; refresh WORKBOARD (drop CS39 → no active CS, v0.4.0 arc complete) + CONTEXT (CS39-done bullet, queue moves to v0.5.0 arc CS40). |
| T8 — Admin merge content PR | pending | yoga-ah | After CI green + R1 GO + Copilot review present, admin squash-merge. Capture squash SHA. |
| T9 — Tag push v0.4.0 | pending | yoga-ah | `git tag v0.4.0 <squash-sha>` then `git push origin v0.4.0`. Triggers `release.yml` workflow. |
| T10 — Verify GitHub Release page | pending | yoga-ah | Per C39-6: title `v0.4.0`; body matches CHANGELOG section; no asset requirements. |
| T11 — Cross-repo SI pin-bump SUB-CS PR | pending | yoga-ah | Per C39-4/5 (R1-amended): open PR against `henrik-me/sub-invaders` filing `planned_cs10_pin-harness-v0.4.0.md` (next available — SI uses `planned_csNN_*` convention not `planned_subNN_*`; verified live via gh api 2026-05-13). |
| T12 — Close-out PR (workboard-only) for CS39 + close-out learnings task | pending | yoga-ah | Standard close-out PR. File any LRNs surfaced during release-cut. |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out)_
