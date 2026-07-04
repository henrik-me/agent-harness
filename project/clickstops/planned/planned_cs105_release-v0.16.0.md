# CS105 — Cut harness release v0.16.0

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** yoga-ah (orchestrator, Claude Opus 4.8), 2026-07-04. Cuts the follow-up release bundling #423 (CS102) now that it is delivered + closed out. Directed by @henrik-me ("when issue 423 gets delivered, release with those changes included").
**Depends on:** none

## Goal

Cut harness **v0.16.0** (Minor) bundling the distributed-surface work merged since
v0.15.0: **CS102** (#423, `harness dispatch` language profiles). Version bump +
CHANGELOG promotion + README pin sweep on a content PR, then post-merge annotated
tag + **draft** GitHub Release, then issue-only consumer notifications.

## Background

- **Prev version:** `package.json` `version` = `0.15.0`. **Target:** `0.16.0`
  (Minor — #423 adds a new optional `dispatch.language_profile` config key + a
  new `--language-profile` CLI override; backward-compatible additive change).
- **Pre-release audit (LRN-101).** `git log v0.15.0..origin/main --oneline` shows
  the merged CSs since the v0.15.0 tag: **CS102 (#423)** content (`35c1f59`, #451)
  + golden test (`3100b58`, #454) + close-out (`d5e78da`, #455), plus the CS104
  (v0.15.0) close-out (`538c62f`, #453). The only **distributed-surface** change
  is CS102 (#423). `CHANGELOG.md [Unreleased]` contains exactly one bullet — the
  `harness dispatch` language profiles (#423, Added, Minor) entry — so promoting
  `[Unreleased] → [0.16.0]` captures exactly the delivered #423 work.
- **State-of-the-world probes (REVIEWS § 2.6c F6), recorded verbatim:**
  - `git ls-remote origin refs/tags/v0.16.0` → **(empty — no output; no tag)**.
  - `gh api repos/henrik-me/agent-harness/releases --jq 'map(select(.tag_name=="v0.16.0")) | length'` → **`0`**.
  - `gh release list --repo henrik-me/agent-harness --limit 3` →
    ```text
    v0.15.0	Draft	v0.15.0	2026-07-04T00:11:37Z
    v0.14.0	Latest	v0.14.0	2026-07-03T20:57:18Z
    v0.13.0		v0.13.0	2026-07-03T07:09:36Z
    ```
  - Conclusion: no existing/stale v0.16.0 tag or draft to delete; clean cut.
    **v0.15.0 is still a DRAFT** (the prior release, awaiting the maintainer's
    publish) — the v0.15.0 **tag** exists, so v0.16.0 layers on it correctly
    (`compare/v0.15.0...v0.16.0`); both drafts await @henrik-me's publish.
- **Publish posture:** the maintainer is asynchronously away at cut time. Per the
  default human-publish gate (LRN-121, C84-9), the GitHub Release is created as a
  **draft** and left for @henrik-me to publish. The annotated tag IS pushed
  (installable by tag immediately).
- Mechanized by the `harness release` verb (CS67): Phase A previews/applies the
  bump + CHANGELOG promotion + README sweep; Phase B verifies the squash SHA,
  cuts the annotated tag, and creates the draft Release.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Version | **0.16.0** (Minor). | #423 adds a new optional `dispatch.language_profile` config key + `--language-profile` CLI override — a Minor (backward-compatible additive) trigger. Not Major (no breaking change); not Patch (new config/flag surface). |
| 2 | Scope | Bundle the merged **#423** (CS102) work — the sole `[Unreleased]` bullet. | The release promotes `[Unreleased]`, which contains exactly the #423 entry. This is the follow-up release the user requested once #423 was delivered. |
| 3 | Cut mechanism | `harness release --version 0.16.0 --apply` (Phase A) for the bump + CHANGELOG `[Unreleased] → [0.16.0]` promotion + README pin sweep on the content branch; post-merge `harness release --publish --version 0.16.0 --sha <squash-sha> --pr <n> --apply` (Phase B) for the annotated tag + draft Release. | The verb is the single, dry-run-first, SemVer-checked creator of the tag + Release; matches the CS104 (v0.15.0) precedent. |
| 4 | Publish | Create the Release as a **draft**; do NOT `--no-draft`. Leave publishing to @henrik-me. | Default human-publish gate (LRN-121); the maintainer is away. Consistent with the v0.15.0 draft, which is also pending publish. |
| 5 | Consumer notification | After the tag/draft, file issue-only pin-bump trackers (Hard Rule § 6) via `harness cross-repo open-issue` to **`henrik-me/authzandentitlements`** (the #423 reporter) and **`henrik-me/sub-invaders`**, each carrying the § Cross-repo pin-bump PR-body checklist. Idempotent per-workstream. | Consumers adopt via issue-only handoff; authzandentitlements filed #423 and directly benefits (the `dotnet` language profile). |

## Deliverables

1. **`package.json` + `package-lock.json`** — `0.15.0 → 0.16.0` (via
   `harness release` Phase A / `npm version --no-git-tag-version`).
2. **`CHANGELOG.md`** — `## [Unreleased]` → `## [0.16.0] — 2026-07-04` (em-dash);
   fresh `## [Unreleased]` skeleton; `[0.16.0]: …/compare/v0.15.0...v0.16.0` link
   ref; `[Unreleased]` link ref updated to compare from `v0.16.0`.
3. **`README.md`** — sweep current-version pins `v0.15.0 → v0.16.0`; rewrite the
   `## Status` paragraph to headline v0.16.0 (CS102 #423 `harness dispatch`
   language profiles) and demote v0.15.0 to `Prior:`; prior-release narrative
   left at original versions.
4. **Content PR** (`cs105/content`) with GPT-5.5 rubber-duck review-of-record +
   Copilot engaged + all gates green; admin-squash-merged (solo-orchestrator).
5. **Post-merge:** annotated tag `v0.16.0` on the squash SHA (pushed) + a
   **draft** GitHub Release with the `[0.16.0]` CHANGELOG notes.
6. **Consumer notifications:** idempotent issue-only pin-bump trackers to
   `henrik-me/authzandentitlements` and `henrik-me/sub-invaders`.
7. Close-out (active → done, WORKBOARD row removed, CONTEXT updated).

## User-approval gates

- **Publishing the draft Release to Latest** is left to @henrik-me (Decision 4).
  All other steps proceed autonomously per the standing "release with those
  changes included" directive.

## Exit criteria

- `package.json` = `0.16.0`; CHANGELOG `[0.16.0]` section populated + fresh
  `[Unreleased]`; README pins/Status updated; `harness lint` + full `node --test`
  green; `harness sync --mode=check` no drift.
- Annotated tag `v0.16.0` on the content squash SHA pushed; a single **draft**
  GitHub Release exists for it (verified; no duplicate).
- Consumer pin-bump issues filed (idempotent) to both consumers.
- CS closed out.

## Risks + open questions

- **Prior release (v0.15.0) still a draft.** v0.16.0 layers on the existing
  v0.15.0 **tag** (`compare/v0.15.0...v0.16.0`); both drafts await the maintainer's
  publish. Not a blocker.
- **Async-Copilot gate rerun (LRN-194).** The `read-only-gates` + `copilot-review-attached`
  gates go stale after the async Copilot review and need a manual `gh run rerun`
  (CS103's auto-rerun does not fire for the Copilot bot review).
- **Anchor drift (LRN-101).** Tag the **squash SHA** (via `--pr <n>` authoritative
  check), not the pre-merge branch head.

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | rubber-duck dispatched | 3620af3bd661 | 2026-07-04T01:06:22Z | Go | No findings. F6: no v0.16.0 tag/release; v0.15.0 Draft + tag present. Version Minor (#423 language_profile config+flag exist); [Unreleased] = #423 only; release flags/draft posture sound. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per § Claim) | planned | — | — |

## Notes / Learnings

## Plan-vs-implementation review

> _(filled at close-out per the gate)_
