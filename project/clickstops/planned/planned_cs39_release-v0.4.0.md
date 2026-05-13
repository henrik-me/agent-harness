# CS39 — Release v0.4.0 + file SI pin-bump SUB-CS

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
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
| C39-4 | SUB-CS filing location | I open a single PR against `henrik-me/sub-invaders` adding `project/clickstops/planned/planned_subNN_pin-harness-v0.4.0.md` (where `subNN` is the next available SUB-CS number in that repo). PR title: "Pre-SUB-CS prep: file pin-harness-v0.4.0". I do NOT implement the pin-bump; SI orchestrator does that under their own workflow. | Per D-D: I file the planned CS, SI orchestrator implements. Cross-repo coordination via PR. |
| C39-5 | Pin-bump SUB-CS content | The planned SUB-CS file documents: target version `v0.4.0`; what changes (composed PR template marker block; new sync warnings about `review_gates`; option to immediately opt in via `harness init --enable-review-gates`); recommended path (opt in immediately to derive value); risks (existing PRs need re-trigger to pick up the new gate). | Self-contained plan for SI orchestrator. |
| C39-6 | Release-trigger verification | Manually verify the GitHub Release page after the tag push: title `v0.4.0`; body matches CHANGELOG section; assets (none required for this release). | Standard release-day check. |

## Deliverables

1. **CHANGELOG.md** updates: replace `## [Unreleased]` with `## [0.4.0] — <date>`; ensure all CS35–CS38b entries are captured.
2. **`package.json`** version bump to `0.4.0`.
3. **Tag push**: `git tag v0.4.0 <commit-sha>` + `git push origin v0.4.0`. Triggers `release.yml` workflow.
4. **Cross-repo PR** to `henrik-me/sub-invaders` per C39-4: branch `docs/file-planned-sub<NN>-pin-harness-v0.4.0`; new file `project/clickstops/planned/planned_sub<NN>_pin-harness-v0.4.0.md` per C39-5.
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
| (populated at claim time) | planned | — | — |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out)_
