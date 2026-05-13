# CS42 — Release v0.5.0

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** Pre-CS42 disposition. Authored 2026-05-12 by `yoga-ah`. Third (final) CS in the v0.5.0 arc; release-cut.
**Depends on:** [CS41](planned_cs41_copilot-engage-cli-and-default-flip.md) (and transitively CS40, CS39).

## Goal

Cut harness release v0.5.0 with the v0.5.0 arc deliverables (CS40 + CS41). Verify CHANGELOG completeness, tag, and observe the release workflow ship the GitHub Release. File a planned SUB-CS in `henrik-me/sub-invaders` for the orchestrator there to pin to v0.5.0 (which adopts the new opt-out default).

## Background

Standard release-cut CS, mirroring [CS39](planned_cs39_release-v0.4.0.md). Two notable callouts for v0.5.0:

1. **Default flip is a breaking change** (per C41-7). Release notes must be loud about it.
2. **REVIEWS.md schema migration** (per C41-6): added `Implementer agent` + `Reviewer agent` columns; existing PRs warn-not-error for one cycle; CS42 may upgrade to hard error after consumer adoption signal.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C42-1 | Version | v0.5.0 (minor bump from v0.4.x). | New CLI subcommand (`copilot-engage`), schema change (model-audit columns), default flip. Minor per semver. |
| C42-2 | CHANGELOG header format | `## [0.5.0] — 2026-XX-XX` (em-dash, ISO date). | Per `release.yml` awk extractor. |
| C42-3 | Release notes scope | Headline: `harness copilot-engage` CLI; default flip from opt-in to opt-out for `review_gates`; `clickstop-implementer-not-reviewer` linter; REVIEWS.md `## Model audit` schema additions (Implementer agent + Reviewer agent columns). Migration callout: existing PRs without the new columns warn-not-error for v0.5.0; v0.6.0 may upgrade to error. | Consumer-facing summary. |
| C42-4 | SUB-CS filing for sub-invaders | Same pattern as CS39: I open a single PR against `henrik-me/sub-invaders` adding `project/clickstops/planned/planned_subNN_pin-harness-v0.5.0.md`. SI orchestrator implements. | Per established cross-repo pin-bump pattern. |
| C42-5 | Pin-bump SUB-CS content | Documents: target version `v0.5.0`; what changes (default-opt-out for `review_gates` — SI must either accept the default or add explicit `_opt_out_reason`); REVIEWS.md schema migration (add agent columns to existing PRs going forward); recommended path (accept new default, no opt-out reason needed since SI has been on v0.4.0 with `enabled: true` since CS39). | Self-contained plan for SI orchestrator. |
| C42-6 | Schema-migration upgrade decision | Decide at CS42 close-out: based on consumer adoption signal (number of consumer repos seen running v0.4.0 without the agent columns), either keep warn-not-error or file a follow-up CS to upgrade to error in v0.6.0. | Data-driven; defer the decision. |

## Deliverables

1. **CHANGELOG.md** updates: replace `## [Unreleased]` with `## [0.5.0] — <date>`; ensure CS40 + CS41 entries are captured.
2. **`package.json`** version bump to `0.5.0`.
3. **Tag push**: `git tag v0.5.0 <commit-sha>` + `git push origin v0.5.0`.
4. **Cross-repo PR** to `henrik-me/sub-invaders` per C42-4 + C42-5.
5. **CONTEXT.md** refresh.
6. **WORKBOARD.md** prune of CS40–CS42.

## Sub-agent fan-out

None. Release-cut is orchestrator-only.

## Exit criteria

1. CHANGELOG `## [0.5.0] — <date>` section is complete; em-dash format verified.
2. `package.json` version is `0.5.0`.
3. Tag `v0.5.0` exists; `release.yml` workflow run succeeds; GitHub Release page is published.
4. Sub-invaders PR is opened (number recorded in CS42 close-out notes).
5. CONTEXT.md + WORKBOARD.md updated.
6. Schema-migration decision (C42-6) is recorded in CS42 close-out notes (warn-not-error retained OR follow-up CS filed).
7. `harness lint --quiet` + tests + sync drift all pass.

## Risks + open questions

- **R1 (low):** Same as CS39 — tag push triggers release workflow; CHANGELOG format must be correct.
- **R2 (medium):** Default flip may surprise consumers who haven't watched v0.4.0 release notes. Mitigation: pre-release announcement issue in agent-harness (manual; this is the one case where the user — NOT the agent — files an issue, since announcements are inbound communication-shaped not work-tracking-shaped); migration message in `harness sync` is loud.
- **OQ1:** Should v0.5.0 also include a `harness migrate-review-gates` command to backfill consumer configs? **Default:** no — `harness init --enable-review-gates` already does this; another command is redundant.

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time) | planned | — | — |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out)_
