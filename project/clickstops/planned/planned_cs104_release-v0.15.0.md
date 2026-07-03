# CS104 — Cut harness release v0.15.0

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** yoga-ah (orchestrator, Claude Opus 4.8), 2026-07-03. Cuts the aggregate release of everything merged since v0.14.0 — the #420–#424 arc's merged work. Directed by @henrik-me ("deliver 424 → make a release; you should release the harness").
**Depends on:** none

## Goal

Cut harness **v0.15.0** (Minor) bundling the distributed-surface work merged
since v0.14.0: **CS97** (#420), **CS100** (#421), **CS101** (#422), and **CS103**
(#424). Version bump + CHANGELOG promotion + README pin sweep on a content PR,
then post-merge annotated tag + **draft** GitHub Release, then issue-only consumer
notifications.

## Background

- **Prev version:** `package.json` `version` = `0.14.0`. **Target:** `0.15.0`
  (Minor — new `harness install-hooks` verb (CS100) + new consumer-visible
  managed-workflow trigger (CS103); the highest bump among the bundled CSs).
- **Pre-release audit (LRN-101).** `git log v0.14.0..origin/main --oneline`
  shows the merged CSs since the tag: CS97 (#420, `c1d177d`), CS100 (#421,
  `21a8824`), CS101 (#422, `f02cd39`), CS103 (#424, `7c60863`) — plus CS102
  (#423) **filing + claim only** (`e6f5662`, `11acc0f`; the sibling's content is
  NOT merged, so #423 is **excluded** from this release and ships in the next
  one). Every merged distributed-surface CS has a `CHANGELOG.md [Unreleased]`
  bullet: `install-hooks` (#421, Added), auto-rerun trigger (#424, Added),
  leaner-sequencing doctrine (#424, Documentation), `harness review` engage
  delegation (#422, Fixed), `check-commit-trailers` (#420, Fixed).
- **State-of-the-world probes (REVIEWS § 2.6c F6), recorded verbatim:**
  - `git ls-remote origin refs/tags/v0.15.0` → **(empty — no output; no tag)**.
  - `gh api repos/henrik-me/agent-harness/releases --jq 'map(select(.tag_name=="v0.15.0")) | length'` → **`0`**.
  - `gh api repos/henrik-me/agent-harness/releases --jq 'map(select(.tag_name=="v0.15.0"))'` → **`[]`** (no published or draft release object).
  - `gh release list --repo henrik-me/agent-harness --limit 3` →
    ```text
    v0.14.0	Latest	v0.14.0	2026-07-03T20:57:18Z
    v0.13.0		v0.13.0	2026-07-03T07:09:36Z
    v0.12.0		v0.12.0	2026-07-02T16:19:36Z
    ```
  - Conclusion: no existing/stale v0.15.0 tag or draft to delete; clean cut.
- **Publish posture:** the user is asynchronously away at cut time. Per the
  default human-publish gate (LRN-121, C84-9), the GitHub Release is created as a
  **draft** and left for @henrik-me to publish (`gh release edit v0.15.0 --draft=false`).
  The annotated tag IS pushed (installable by tag immediately).
- Mechanized by the `harness release` verb (CS67): Phase A previews/applies the
  bump + CHANGELOG promotion + README sweep; Phase B verifies the squash SHA,
  cuts the annotated tag, and creates the draft Release.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Version | **0.15.0** (Minor). | New `harness install-hooks` verb (CS100) + consumer-visible managed-workflow trigger (CS103) are Minor triggers; CS97/CS101 were Patches, subsumed. No breaking change → not Major. |
| 2 | Scope | Bundle only the **merged** arc CSs: #420, #421, #422, #424. **Exclude #423** (CS102, sibling, content not merged). | The release promotes the current `[Unreleased]`, which contains exactly these four. #423 ships in the next release when its content merges. Directed by the user's "deliver 424 → release" (tied to #424, not #423). |
| 3 | Cut mechanism | Use `harness release --version 0.15.0 --apply` (Phase A) for the bump + CHANGELOG `[Unreleased] → [0.15.0]` promotion + README pin sweep on the content branch; post-merge `harness release --publish --version 0.15.0 --pr <n> --apply` (Phase B) for the annotated tag + draft Release. | The verb is the single, dry-run-first, SemVer-checked creator of the tag + Release; matches CS94/CS96 precedent. |
| 4 | Publish | Create the Release as a **draft**; do NOT `--no-draft`. Leave publishing to @henrik-me. | Default human-publish gate (LRN-121); the user is away, and publish-to-Latest is the one irreversible, notification-triggering step. Prior auto-publishes (v0.13.0/v0.14.0) each had an explicit in-the-moment "ship it" the user has not given for this cut. |
| 5 | Consumer notification | After the tag/draft, file issue-only pin-bump trackers (Hard Rule § 6) via `harness cross-repo open-issue` to **`henrik-me/authzandentitlements`** (the #420–#424 reporter) and **`henrik-me/sub-invaders`** (standing consumer), each carrying the § Cross-repo pin-bump PR-body checklist. | Consumers adopt via issue-only handoff; authzandentitlements is directly waiting on this arc. |

## Deliverables

1. **`package.json` + `package-lock.json`** — version `0.14.0 → 0.15.0` via
   `npm version 0.15.0 --no-git-tag-version` (never hand-edited).
2. **`CHANGELOG.md`** — `## [Unreleased]` → `## [0.15.0] — 2026-07-03` (em-dash);
   a fresh `## [Unreleased]` skeleton (`### Added`/`### Changed`/`### Documentation`/`### Fixed`);
   a `[0.15.0]: …/compare/v0.14.0...v0.15.0` link ref; `[Unreleased]` link ref
   updated to compare from `v0.15.0`.
3. **`README.md`** — sweep current-version pins `v0.14.0 → v0.15.0` and rewrite
   the `## Status` paragraph to headline v0.15.0 (CS100 `install-hooks` #421 +
   CS103 review-churn #424, plus CS97 #420 + CS101 #422); prior-release
   narrative left at its original versions.
4. **Content PR** (`cs104/content`) with GPT-5.5 rubber-duck review-of-record +
   Copilot engaged + all gates green; admin-squash-merged (solo-orchestrator).
5. **Post-merge:** annotated tag `v0.15.0` on the squash SHA (pushed) + a
   **draft** GitHub Release with the `[0.15.0]` CHANGELOG notes.
6. **Consumer notifications:** idempotent issue-only pin-bump trackers to
   `henrik-me/authzandentitlements` and `henrik-me/sub-invaders`.
7. Close-out (active → done, WORKBOARD row removed, CONTEXT updated).

## User-approval gates

- **Publishing the draft Release to Latest** is left to @henrik-me (Decision 4).
  All other steps proceed autonomously per the standing "make a release" directive.

## Exit criteria

- `package.json` = `0.15.0`; CHANGELOG `[0.15.0]` section populated + fresh
  `[Unreleased]`; README pins/Status updated; `harness lint` + full `node --test`
  green; `harness sync --mode=check` no drift.
- Annotated tag `v0.15.0` on the content squash SHA pushed; a single **draft**
  GitHub Release exists for it (verified; no duplicate).
- Consumer pin-bump issues filed (idempotent) to both consumers.
- CS closed out.

## Risks + open questions

- **Concurrent sibling arc (#423 / CS102).** The release excludes #423; when the
  sibling's content merges, its `[Unreleased]` bullet lands in the fresh
  `[Unreleased]` this CS creates — no conflict with the promoted `[0.15.0]`.
- **Draft left unpublished.** Intentional (Decision 4); the tag is installable
  immediately, and the user publishes the draft on review.
- **Anchor drift (LRN-101).** Tag the **squash SHA** (via `--pr <n>`
  authoritative check), not the pre-merge branch head.

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | rubber-duck dispatched | a8791a9a8390 | 2026-07-03T23:53:32Z | Go-with-amendments | No blocking. F6: no v0.15.0 tag/release (empty ls-remote, 0/[], v0.14.0 Latest). Minor/scope/draft-gate sound; amendment applied (verbatim release-list + [] probe). |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per § Claim) | planned | — | — |

## Notes / Learnings

## Plan-vs-implementation review

> _(filled at close-out per the gate)_
