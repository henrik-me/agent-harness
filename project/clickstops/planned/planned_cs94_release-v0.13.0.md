# CS94 — cut harness v0.13.0 (Minor)

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** yoga-ah (Claude Opus 4.8), 2026-07-03 — release CS following the CS93 (#407) close-out, per @henrik-me's "fix issue 407, then release a new version, do so without stopping."
**Depends on:** CS93 merged to `main` (#411 squash `37b46e2`, close-out #412). Bundles the unreleased CS65 + CS85 + CS92 + CS93 accumulated since v0.12.0. Follows OPERATIONS.md § Release process.

## Goal

Cut and publish harness **v0.13.0** — the aggregate release of every distributed-surface change merged since v0.12.0 (CS65 archive tier + CS85 durability guard + CS92 copilot-engage reliability + CS93 #407 review-lookup fix), driven through the `harness release` verb (Phase A bump + Phase B tag/publish/notify).

## Background

**SemVer aggregate.** A release cuts a tag on `main`, capturing the whole tree — so the bump is the MAX change level across `[Unreleased]`. Per OPERATIONS.md § SemVer policy: CS85 added a new linter script (`scripts/check-clickstop-link-durability.mjs`) → **Minor**; CS65 added the LEARNINGS archive tier (new behavior) → **Minor**; CS92/CS93 are Fixed → Patch. Max = **Minor** → **v0.13.0** (a v0.12.1 Patch would be SemVer-inconsistent and the `harness release` verb rejects it).

**Pre-release audit (LRN-101).** `[Unreleased]` currently carries: CS65 (Added + Changed), CS85 (Added + Fixed), CS92 (Fixed), CS93 (Fixed). Every distributed-surface CS merged since v0.12.0 (touching `lib/`, `bin/`, `scripts/`, `template/**`) has a corresponding bullet; CS76/CS86-91 are planned-only (not merged content), CS84 was the v0.12.0 cut. No stale/missing bullets.

**State-of-the-world probes (F6, REVIEWS § 2.6c), captured 2026-07-03:**

```
$ gh api repos/henrik-me/agent-harness/releases --jq 'map(select(.tag_name=="v0.13.0")) | length'
0
$ git ls-remote origin refs/tags/v0.13.0
(empty)
$ gh release list --repo henrik-me/agent-harness --limit 3
v0.12.0   Latest   v0.12.0   2026-07-02T16:19:36Z
v0.11.0            v0.11.0   2026-07-02T04:00:51Z
v0.10.0            v0.10.0   2026-07-01T19:55:09Z
```

No v0.13.0 release object, no v0.13.0 tag (local or remote), no stale duplicate draft to delete. Current `package.json` version is `0.12.0`; v0.12.0 is Latest.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C94-1 | Version + bump | **v0.13.0 (Minor)** via `harness release --version 0.13.0` (Phase A) then `--publish --version 0.13.0 --pr <n> --sha <squash>` (Phase B). | SemVer aggregate of `[Unreleased]` is Minor (CS85 new linter + CS65 new archive-tier behavior); a Patch would be rejected as SemVer-inconsistent. The release captures the whole `main` tree, so it necessarily bundles CS65+CS85+CS92+CS93. |
| C94-2 | Publish end-state | **Publish to Latest** (`gh release edit v0.13.0 --draft=false`, or `harness release --publish --no-draft`), NOT stop at the reconciled draft. | @henrik-me's explicit instruction "release a new version, do so **without stopping**" is a direct maintainer override of the default C84-9 human-publish gate (which exists precisely so a human decides publish timing). The pushed **git tag** is the functional release (consumers pin via `#v0.13.0` regardless of Release-object draft state); publishing to Latest is the final, recoverable (re-draftable) step. Override recorded here + in the PR `## Model audit` for audit. |
| C94-3 | Consumer notification | **Issue-only** (`harness cross-repo open-issue`, label `harness-orchestrator`) to `henrik-me/authzandentitlements` (the #407 reporter — v0.13.0 directly fixes their blocker) and `henrik-me/sub-invaders` (known consumer). No cross-repo commits/PRs (Hard Rule § 6 / LRN-137). | The reporter is unblocked only once they pin v0.13.0; SI is a standing consumer. The orchestrator files a tracking issue and the consumer-repo agent owns the pin-bump PR. |
| C94-4 | Tag on squash SHA | Annotated tag `v0.13.0` on the **content-PR squash `mergeCommit.oid`** (`--pr <n>` switches Phase B's SHA check to the PR squash), pushed post-merge; never pre-merge branch HEAD (LRN-101 anchor drift). | The tag must pin the merged tree, not a transient branch head. |
| C94-5 | SemVer of this CS | The release IS the version event (Minor). No new harness surface is added by the release CS itself (only version/CHANGELOG/README + tag/Release). | A release CS bumps the version; it does not itself add a linter/flag/schema. |

## Deliverables

1. `package.json` + `package-lock.json` (edit) — `0.12.0 → 0.13.0` via `npm version 0.13.0 --no-git-tag-version` (Phase A).
2. `CHANGELOG.md` (edit) — promote `## [Unreleased] → ## [0.13.0] — 2026-07-03`; prepend a fresh empty `## [Unreleased]` skeleton (Added/Changed/Documentation/Fixed); add the `[0.13.0]` compare link `v0.12.0...v0.13.0` and repoint `[Unreleased]` to `v0.13.0...HEAD`.
3. `README.md` (edit) — sweep current-version install/quickstart pins `v0.12.0 → v0.13.0` (Status paragraph, install Option B, Quickstart, version-referencing notes); leave historical/retrospective version mentions intact.
4. **Post-merge:** annotated tag `v0.13.0` on the content-PR squash SHA + `git push origin v0.13.0` (Phase B).
5. **Post-merge:** create + **publish** the GitHub Release for `v0.13.0` (notes = `CHANGELOG.md` `[0.13.0]`), `--draft=false` (C94-2), then verify exactly one release for the tag and Latest == v0.13.0.
6. **Post-merge:** file issue-only consumer pin-bump tracking issues to `henrik-me/authzandentitlements` and `henrik-me/sub-invaders` (C94-3), each with the cross-repo pin-bump PR-body checklist.

## User-approval gates

- **(waived by explicit instruction)** The default C84-9 human-publish gate (stop at the reconciled draft) is **overridden** for this release by @henrik-me's "release … without stopping" directive (C94-2). No other approval gates apply.

## Exit criteria

- `package.json` version == `0.13.0`; `package-lock.json` in sync.
- `CHANGELOG.md` has `## [0.13.0] — 2026-07-03` (promoted from Unreleased) + a fresh empty `## [Unreleased]` + correct compare links; README current-version pins read `v0.13.0`.
- `node bin/harness.mjs lint --quiet` exits 0; `node --test tests/*.test.mjs` passes.
- Annotated tag `v0.13.0` exists on the squash SHA (peeled `^{}` == squash SHA) and is pushed to `origin`.
- Exactly one **published** GitHub Release for `v0.13.0`; `gh release list` shows Latest == v0.13.0.
- One `harness-orchestrator`-labelled tracking issue each in `authzandentitlements` and `sub-invaders`.

## Risks + open questions

- **R1 — SemVer-consistency rejection.** If `harness release --version 0.12.1` were attempted, Phase A would reject it (Added/Changed present ⇒ Minor). Mitigation: cut `0.13.0` (C94-1); Phase A previews and validates the bump before writing.
- **R2 — publish override visibility.** Publishing to Latest overrides documented doctrine (C84-9). Mitigation: the override + its explicit-instruction basis is recorded in this plan (C94-2), the PR `## Model audit`, and CONTEXT at close-out; the action is recoverable (re-draft) if the maintainer disagrees.
- **R3 — stale duplicate Release/draft.** F6 probes show none for v0.13.0; if `release.yml`-style auto-draft ever recurs, delete the `tag_name==v0.13.0 && draft==true` sibling before/after publish (LRN-159). (Note: `release.yml` was deleted at CS80, so the `harness release` verb is the sole Release creator — LRN-159 is structurally moot but the verify step still runs.)

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | cs94-plan-review | 588f9c11d99b | 2026-07-03T06:55:36Z | Go | v0.13.0 Minor correct (CS85 linter+CS65 archive force Minor); LRN-101 audit complete; F6 live probes match; publish override + issue-only notify documented. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per § Claim) | planned | — | — |

## Notes / Learnings

- Release-is-its-own-CS (OPERATIONS § Release process). Aggregate Minor bump determined by `[Unreleased]` (CS85 linter + CS65 archive tier). Publish-to-Latest is an explicit maintainer override of C84-9 for this cut only.

## Plan-vs-implementation review

> _(filled at close-out per the gate)_
