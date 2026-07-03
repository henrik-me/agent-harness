# CS96 — cut harness v0.14.0 (Minor)

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** yoga-ah (Claude Opus 4.8), 2026-07-03 — release CS following the CS95 (#417) close-out, per @henrik-me's "claim issue 417, fix it, when done ship a release the owning repo is waiting for it."
**Depends on:** CS95 merged to `main` (#425 squash `9b18745`, close-out #426). Bundles CS95 — the only distributed-surface change since v0.13.0. Follows OPERATIONS.md § Release process.

## Goal

Cut and publish harness **v0.14.0** — a **Minor** release shipping **CS95** (the #417 `harness status`/`claim` ownership gate + the new `harness claim --takeover` flag), which the owning consumer repo `henrik-me/authzandentitlements` is waiting for. Driven through the `harness release` verb (Phase A bump + Phase B tag/publish/notify).

## Background

**SemVer.** A release cuts a tag on `main`, capturing the whole tree. The only distributed-surface change since v0.13.0 is **CS95**, which adds the new `harness claim --takeover` CLI flag → **Minor** per OPERATIONS.md § SemVer policy (a backward-compatible CLI-surface addition; nearest table row "New CLI subcommand added → Minor"). The status annotation + claim owner-gate are the #417 fix (Patch-level), but the new flag drives Minor → **v0.14.0** (a v0.13.1 Patch would be SemVer-inconsistent and rejected by the verb).

**Pre-release audit (LRN-101).** `[Unreleased]` carries CS95 only: **Added** (`--takeover`) + **Fixed** (#417 status/claim ownership gate). Verified against `git log v0.13.0..main`: the only merged content CS since v0.13.0 is CS95 (PRs #418/#419/#425/#426); CS94's close-out #416 is doc-only (post-v0.13.0-tag, no CHANGELOG bullet). No stale/missing bullets.

**State-of-the-world probes (F6, REVIEWS § 2.6c), captured 2026-07-03:**

```
$ gh api repos/henrik-me/agent-harness/releases --jq 'map(select(.tag_name=="v0.14.0")) | length'
0
$ git ls-remote origin refs/tags/v0.14.0
(empty)
$ gh release list --repo henrik-me/agent-harness --limit 2
v0.13.0   Latest   v0.13.0   2026-07-03T07:09:36Z
v0.12.0            v0.12.0   2026-07-02T16:19:36Z
```

No v0.14.0 release object, no v0.14.0 tag (local or remote), no stale duplicate draft. Current `package.json` version is `0.13.0`; v0.13.0 is Latest.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C96-1 | Version + bump | **v0.14.0 (Minor)** via `harness release --version 0.14.0` (Phase A) then `--publish --version 0.14.0 --pr <n> --sha <squash>` (Phase B). | SemVer of `[Unreleased]` is Minor (CS95's new `--takeover` flag); a Patch would be rejected as SemVer-inconsistent. The release captures the whole `main` tree, bundling CS95. |
| C96-2 | Publish end-state | **Publish to Latest** (`gh release edit v0.14.0 --draft=false`, or `harness release --publish --no-draft`), NOT stop at the reconciled draft. | @henrik-me's instruction is to "**ship** a release **the owning repo is waiting for it**" — the consumer `henrik-me/authzandentitlements` (the #417 reporter) needs v0.14.0 available. The pushed **git tag** makes the version pin-able immediately; publishing to Latest completes the "ship" and makes the Release visible. This is the standard OPERATIONS § Release process step-10 completion; recoverable (re-draftable) if the maintainer disagrees. Consistent with the v0.13.0 (CS94) disposition. |
| C96-3 | Consumer notification | **Issue-only** (`harness cross-repo open-issue`, label `harness-orchestrator`) to `henrik-me/authzandentitlements` (the #417 reporter, waiting on this release) and `henrik-me/sub-invaders` (standing consumer). No cross-repo commits/PRs (Hard Rule § 6 / LRN-137). | The reporter is unblocked only once they pin v0.14.0; SI is a standing consumer. The orchestrator files a tracking issue; the consumer-repo agent owns the pin-bump PR. |
| C96-4 | Tag on squash SHA | Annotated tag `v0.14.0` on the content-PR squash `mergeCommit.oid` (`--pr <n>` strong-verifies), pushed post-merge; never pre-merge branch HEAD (LRN-101 anchor drift). | The tag must pin the merged tree, not a transient branch head. |
| C96-5 | SemVer of this CS | The release IS the version event (Minor). No new harness surface is added by the release CS itself. | A release CS bumps the version; it does not itself add a flag/linter/schema. |

## Deliverables

1. `package.json` + `package-lock.json` (edit) — `0.13.0 → 0.14.0` via `npm version 0.14.0 --no-git-tag-version` (Phase A).
2. `CHANGELOG.md` (edit) — promote `## [Unreleased] → ## [0.14.0] — 2026-07-03`; prepend a fresh empty `## [Unreleased]` skeleton; add the `[0.14.0]` compare link `v0.13.0...v0.14.0` and repoint `[Unreleased]` to `v0.14.0...HEAD`.
3. `README.md` (edit) — sweep current-version install/quickstart/upgrade pins `v0.13.0 → v0.14.0`; rewrite the Status paragraph (v0.14.0 summary; v0.13.0 demoted to Prior); leave historical/retrospective version mentions intact.
4. **Post-merge:** annotated tag `v0.14.0` on the content-PR squash SHA + `git push origin v0.14.0` (Phase B).
5. **Post-merge:** create + **publish** the GitHub Release for `v0.14.0` (notes = `CHANGELOG.md` `[0.14.0]`), `--draft=false` (C96-2), then verify exactly one release for the tag and Latest == v0.14.0.
6. **Post-merge:** file issue-only consumer pin-bump tracking issues to `henrik-me/authzandentitlements` and `henrik-me/sub-invaders` (C96-3), each with the cross-repo pin-bump PR-body checklist.

## User-approval gates

- **(none)** — "ship a release the owning repo is waiting for it" directs the full cut + publish (C96-2); no other approval gates apply.

## Exit criteria

- `package.json` version == `0.14.0`; `package-lock.json` in sync.
- `CHANGELOG.md` has `## [0.14.0] — 2026-07-03` (promoted from Unreleased) + a fresh empty `## [Unreleased]` + correct compare links; README current-version pins read `v0.14.0`.
- `node bin/harness.mjs lint --quiet` exits 0; `node --test tests/*.test.mjs` passes.
- Annotated tag `v0.14.0` exists on the squash SHA (peeled `^{}` == squash SHA) and is pushed to `origin`.
- Exactly one **published** GitHub Release for `v0.14.0`; `gh release list` shows Latest == v0.14.0.
- One `harness-orchestrator`-labelled tracking issue each in `authzandentitlements` and `sub-invaders`.

## Risks + open questions

- **R1 — SemVer-consistency rejection.** A `--version 0.13.1` would be rejected by Phase A (an Added entry ⇒ Minor). Mitigation: cut `0.14.0` (C96-1); Phase A previews + validates the bump.
- **R2 — stale duplicate Release/draft.** F6 shows none for v0.14.0; if an auto-draft ever recurs, delete the `tag_name==v0.14.0 && draft==true` sibling (LRN-159). (`release.yml` was deleted at CS80 → the verb is the sole Release creator; LRN-159 structurally moot but the verify step still runs.)
- **R3 — publish vs draft.** C96-2 publishes to Latest per the "ship … waiting for it" directive; recorded here + in the PR `## Model audit`. Recoverable (re-draft) if the maintainer prefers otherwise.

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | cs96-plan-review | 04d3d47a7bcb | 2026-07-03T20:44:34Z | Go | v0.14.0 Minor correct (CS95 --takeover Added); LRN-101 audit complete (CS95 only since v0.13.0); F6 live probes match; publish + issue-only notify sound. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per § Claim) | planned | — | — |

## Notes / Learnings

- Release-is-its-own-CS (OPERATIONS § Release process). Minor bump from CS95's new `--takeover` flag. Publish-to-Latest fulfils the "ship … the owning repo is waiting for it" directive; the consumer `authzandentitlements` (#417 reporter) is notified issue-only.

## Plan-vs-implementation review

> _(filled at close-out per the gate)_
