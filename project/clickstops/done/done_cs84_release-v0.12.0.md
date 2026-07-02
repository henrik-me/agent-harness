# CS84 — Cut harness v0.12.0

**Status:** done
**Owner:** omni-ah-c2
**Branch:** cs84/content
**Started:** 2026-07-02
**Closed:** 2026-07-02
**Filed by:** omni-ah-c2 (Claude Opus 4.8), 2026-07-02, at @henrik-me's request ("release"). One distributed-surface clickstop (**CS83** — consumer-doc invocation-form genericity, #370) plus one distributed-surface docs PR (**#369** — workboard auto-merge branch patterns in the composed `OPERATIONS.md` base) have shipped since `v0.11.0` (2026-07-02). CS83 adds a new **optional `templating` config key** (`harness_invoke`) — a **Minor** signal per [OPERATIONS.md § SemVer policy](../../../OPERATIONS.md#semver-policy) — so the pending cut is **v0.12.0**.
**Depends on:** none (hard). Uses the shipped, validated `harness release` verb (CS67 + CS78; first live use CS77/v0.10.0). `.github/workflows/release.yml` was **deleted by CS80** (single-creator), so the verb is the sole Release creator — **no `release.yml`-vs-verb double-draft** (the CS77 primary finding is now structurally eliminated).

## Goal

Cut **v0.12.0** by driving [OPERATIONS.md § Release process](../../../OPERATIONS.md#release-process) through the **`harness release` verb**. Phase A (`harness release --version 0.12.0 --apply`) writes the version bump (`package.json` + `package-lock.json`), the `CHANGELOG.md` `[Unreleased] → [0.12.0]` promotion, and the `README.md` install-pin sweep; Phase B (`harness release --publish --version 0.12.0 --sha <squash> --pr <pr> --apply`) verifies the squash SHA, cuts the **annotated** tag, and creates the **draft** GitHub Release; `--consumer henrik-me/sub-invaders --consumer-body <file>` files the issue-only pin-bump handoff. After CS84, `package.json`, the `CHANGELOG.md` `## [0.12.0]` section, and `git tag --list 'v*'` are 1:1 at `v0.12.0`, the tag is **annotated** on the content-PR squash SHA, exactly **one** GitHub Release exists for the tag (a **draft** until the human publishes at G-publish), and the sub-invaders pin-bump tracking issue is filed.

## Background

**State-of-the-world probes ([REVIEWS.md § 2.6c F6](../../../REVIEWS.md)).** Probed 2026-07-02 by `omni-ah-c2`; recorded verbatim:

```text
$ gh api repos/henrik-me/agent-harness/releases --jq 'map(select(.tag_name=="v0.12.0")) | length'
0

$ gh release list --repo henrik-me/agent-harness --limit 4
v0.11.0   Latest   v0.11.0   2026-07-02T04:00:51Z
v0.10.0            v0.10.0   2026-07-01T19:55:09Z
v0.9.0             v0.9.0    2026-06-30T21:35:44Z
v0.8.0             v0.8.0    2026-06-09T17:56:38Z

$ git ls-remote origin refs/tags/v0.12.0
(no output — tag does not exist)

$ node -p "require('./package.json').version"
0.11.0
```

Conclusion: **no published or draft GitHub Release and no git tag exists for `v0.12.0`** (clean cut). Current pinned version is `0.11.0`; latest tag is `v0.11.0`. (A stale **v0.1.0** draft release exists from the pre-release era — id 317275578 — unrelated to this cut; left untouched.)

**Pre-release `[Unreleased]` audit ([LRN-101](../../../LEARNINGS.md#lrn-101)).** `git log v0.11.0..main --oneline` since v0.11.0 comprises the full **CS83** lifecycle (filing #372, claim #373, content #374 `e05aa75`, close-out #375) and the standalone docs **#369** (`0a4eff8`). Distributed-surface changes: **CS83** (`template/composed/**`, `template/managed/**`, `lib/sync.mjs`, `scripts/**`) — `CHANGELOG.md` `[Unreleased]` already carries its `### Fixed` bullet (added at CS83 close-out per the CS24 convention); and **#369**, which added the workboard auto-merge branch-pattern documentation to the consumer-shipped composed `OPERATIONS.md` base but shipped **no** `[Unreleased]` bullet (it was a standalone docs PR, not a CS with a close-out). C84-3 adds a `### Documentation` bullet for #369 before promotion so the release note is complete.

**Bump justification ([OPERATIONS.md § SemVer policy](../../../OPERATIONS.md#semver-policy)).** CS83 adds a new **optional** `templating.harness_invoke` config key (an "optional config field, backward-compatible addition" ⇒ **Minor**); no breaking change (no removed/renamed CLI flag, no removed/renamed/retyped config field; `templating` is an open string map so no schema change). #369 is docs-only. Cumulative: **minor → `v0.12.0`**.

**Precedent.** Single release, 3-PR lifecycle — inherits from CS77/CS74/CS70/CS53. Streamlined vs CS77: the verb is proven (no differential-equivalence re-proof), and `release.yml` is gone (no double-draft reconciliation).

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C84-1 | Bump size | **Minor → `v0.12.0`.** | CS83 adds a new optional `templating` config key (backward-compatible); no breaking change. #369 docs-only. |
| C84-2 | Cut via the verb vs. manual | **Cut *with* `harness release` (Phase A `--apply` + Phase B `--publish --apply`).** | The verb is shipped, reviewed, and validated on live cuts (CS77 v0.10.0; v0.11.0). Dry-run-first + the G-publish human gate bound the irreversible steps. |
| C84-3 | CHANGELOG transform + pre-audit fix | First add a `### Documentation` bullet to `[Unreleased]` for **#369** (workboard auto-merge branch-pattern docs in `OPERATIONS.md`). Then Phase A promotes `## [Unreleased]` → `## [0.12.0] — <ISO UTC date>` (em-dash), prepends a fresh `### Added / ### Changed / ### Documentation / ### Fixed` skeleton, adds `[0.12.0]: …/compare/v0.11.0...v0.12.0`, and repoints `[Unreleased]: …/compare/v0.12.0...HEAD`. Re-run the pre-release audit before `--apply`. | Completes the release note (LRN-101 — every distributed-surface change gets a bullet); em-dash is repo convention; matches the `^## \[<version>\]` extractor. |
| C84-4 | Version-file bump | Via the verb's Phase A string-edit of `package.json` + `package-lock.json` (equivalent to `npm version 0.12.0 --no-git-tag-version`; the verb keeps package+lock in sync and never tags/commits in Phase A). | Proven byte-identical since CS77 C77-10; no re-proof needed for a validated verb. |
| C84-5 | Tag + Release (draft) | Via Phase B `--publish --version 0.12.0 --sha <content-PR-squash-SHA> --pr <pr> --apply`: verifies the squash SHA, cuts the **annotated** tag (`git tag -a v0.12.0 <sha> -m "Release v0.12.0"` + push), then `gh release create v0.12.0 --verify-tag --draft`. `release.yml` is gone (CS80), so the verb is the **sole** creator — exactly one release, no duplicate-draft reconciliation. Confirm the notes match `CHANGELOG.md` `[0.12.0]`. | Annotated tag on the squash SHA is reproducible + matches the process (LRN-101 anchor-drift avoided); single-creator eliminates LRN-159's double-draft. |
| C84-6 | README pin sweep | The verb's Phase A sweeps `README.md` install/quickstart `v0.11.0` pins → `v0.12.0` and **flags (does not auto-rewrite) current-version prose**. **Review EVERY Phase A README warning** — e.g. `README.md:5` (Status), `README.md:35` (install Option B example), `README.md:37` ("Still applies under v0.11.0" note): update each to `v0.12.0` if it describes the **current** release, and leave only genuinely retrospective history at its old version. The orchestrator adds the "v0.12.0 shipped" Status narrative. `README.md` is sync-excluded. | Install snippets AND current-version prose must point at the latest tag (OPERATIONS step 3, `template/composed/OPERATIONS.md:2374-2379`); only true historical narrative stays at prior versions. |
| C84-7 | Consumer notification | **Issue-only** via the verb's `--consumer henrik-me/sub-invaders --consumer-body <body-file>` (same `openIssue` path as `harness cross-repo open-issue`). Exactly one idempotent tracking issue (`harness-orchestrator` label) titled for the v0.12.0 pin bump. Body MUST include the canonical OPERATIONS § Cross-repo step-4 fields + the [§ Cross-repo pin-bump PR body checklist (CS54)](../../../OPERATIONS.md#cross-repo-pin-bump-pr-body-checklist-cs54) verbatim. SI agent owns the PR. | Orchestrator is issue-only outside its own repo (Hard Rule § 6 / [LRN-137](../../../LEARNINGS.md#lrn-137)); mirrors CS77 C77-7. |
| C84-8 | Reviewer model + risk class | **GPT-5.5** review-of-record (HIGH-RISK — irreversible tag + Release + version bump). **Do NOT add `CS84` to `reviews.high_risk_clickstops`** — designate HIGH-RISK by dispatch discipline only (CS70/CS74/CS77 precedent; the flag would force a config-touching heavyweight close-out). Independence: implementer/plan-author = claude-opus-4.8; reviewer = gpt-5.5 (+ Copilot). | Standing release precedent; avoids the CS74 C74-8 close-out trap. |
| C84-9 | PR shape + publish gate | Standard **3-PR lifecycle** — `cs84/claim` → `cs84/content` (verb Phase A output) → `cs84/close-out` — plus this filing PR. Solo-orchestrator content merge = admin-merge. The orchestrator cuts through the **draft** Release (Phase B `--apply`) + files the consumer issue, then **STOPS at the draft**; the final publish (`gh release edit v0.12.0 --draft=false`) is the human **G-publish** gate. | Canonical shape; the draft-then-human-publish gate (LRN-121) is preserved even under autonomous execution. |

## Deliverables

1. **`package.json` + `package-lock.json`** — bumped `0.11.0 → 0.12.0` by Phase A (C84-4).
2. **`CHANGELOG.md`** — #369 `### Documentation` bullet added; `[Unreleased]` promoted to `[0.12.0] — <date>` + fresh skeleton + link refs (C84-3).
3. **`README.md`** — verb pin sweep (`v0.11.0` → `v0.12.0` install/quickstart) + **every Phase A warning resolved** (current-version prose at `README.md:5`/`:35`/`:37` updated to `v0.12.0`; retrospective history left) + `v0.12.0` Status narrative (C84-6).
4. **Validation green** — `node bin/harness.mjs lint --quiet` (0 failed) + `node --test tests/*.test.mjs` (0 failed) on the content branch.
5. **Local review** — GPT-5.5 rubber-duck (mandatory) + Copilot; model + timestamp + verdict in the content PR's `## Model audit` + `## Review log` (C84-8).
6. **Annotated git tag `v0.12.0`** at the content-PR squash SHA (Phase B); **GitHub Release `v0.12.0`** as **exactly one draft** (no `release.yml`), notes == `CHANGELOG.md` `[0.12.0]`; human publishes at G-publish (C84-5/C84-9).
7. **`henrik-me/sub-invaders` tracking issue** via the verb's `--consumer`/`--consumer-body` (pin `v0.12.0`) with the canonical fields + pin-bump checklist (C84-7).
8. **This planned file** — `## Plan review` ≥1 row reaching `Go`; renamed `planned → active` at claim, `active → done` at close-out.
9. **Close-out** — CS84 WORKBOARD row removed; `CONTEXT.md` updated; any LRNs filed; `## Plan-vs-implementation review` **GO** before the rename. (No `high_risk_clickstops` revert — C84-8; close-out stays workboard-only.)

## User-approval gates

- **Gate A — cut now (C84-2).** Resolved: @henrik-me directed the cut ("release").
- **Gate G-publish — the irreversible publish (C84-5/C84-9).** The orchestrator creates the annotated tag + **draft** Release under Phase B `--apply` and files the consumer issue, then stops at the draft. The human gives explicit go and runs the final `gh release edit v0.12.0 --draft=false` to publish to Latest.

## Exit criteria

1. `package.json` + `package-lock.json` read `0.12.0` (lockfile parity).
2. `CHANGELOG.md` has `## [0.12.0] — <date>` (em-dash) with the CS83 Fixed bullet + the #369 Documentation bullet, and a fresh `## [Unreleased]`; `[0.12.0]`/`[Unreleased]` link refs resolve.
3. `README.md` has no stale `v0.11.0` **current-version** pin/prose — install/quickstart pins swept AND every Phase A warning (`:5`/`:35`/`:37`) resolved; `v0.12.0` Status narrative present; only genuinely retrospective history preserved at its original version.
4. `node bin/harness.mjs lint --quiet` and `node --test tests/*.test.mjs` both exit 0 on the content branch.
5. Content-PR PVI returns **GO** (GPT-5.5) at the merged HEAD, recorded before the `active → done` rename.
6. `git ls-remote origin refs/tags/v0.12.0` resolves to an **annotated** tag (peeled `^{}` line present) pointing at the content-PR squash SHA.
7. `gh api repos/henrik-me/agent-harness/releases --jq 'map(select(.tag_name=="v0.12.0"))'` returns **exactly one** release (a **draft** until the human publishes); notes match `CHANGELOG.md` `[0.12.0]`.
8. Exactly one open `harness-orchestrator` tracking issue in `henrik-me/sub-invaders` for the `v0.12.0` pin bump, with the canonical body + checklist.

## Risks + open questions

- **R1 — SemVer under-count.** If a reviewer judges the new `harness_invoke` templating key + the `lib/sync.mjs` computed-default behavior as more than "optional config field", the bump could be argued Minor-vs-Patch. Plan default: **Minor** (a new consumer-settable, backward-compatible `templating` key + new render behavior; matches the CS83 CHANGELOG's own **Minor** classification). Reviewer confirms.
- **R2 — README sweep over/under-reach.** 7 `v0.11.0` occurrences in README; the verb sweeps install/quickstart pins and flags ambiguous ones. Manually confirm historical-narrative occurrences are left and only install/quickstart pins move.
- **R3 — autonomous publish scope.** The user is executing autonomously; the plan cuts through the **draft** (tag + Release + consumer issue) but preserves the human G-publish gate rather than `--no-draft`-publishing, so the human makes the final "make it Latest" call.
- **OQ1 — #369 bullet class.** Added as `### Documentation` (docs-only clarification of shipped workboard auto-merge patterns). Reviewer confirms class + wording.

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | cs84-plan-review | 1c7b01b48eb9 | 2026-07-02T13:15:46Z | Go-with-amendments | GPT-5.5: SemVer Minor / F6 probes / #369-bullet / release.yml-gone / verb usage verified; amendment applied: resolve ALL Phase A README warnings (:5/:35/:37), not just install pins |

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | omni-ah-c2 |
| Reviewer agent | rubber-duck (orchestrator: omni-ah-c2) |
| Notes | **Minor** SemVer (v0.11.0 → v0.12.0; CS83's new optional `harness_invoke` templating key). HIGH-RISK release (irreversible tag + Release) — GPT-5.5 review-of-record + Copilot; **not** in `reviews.high_risk_clickstops` (C84-8, CS70/CS74/CS77 precedent). Independence: reviewer `gpt-5.5` ≠ implementer `claude-opus-4.8`. Plan review Go-with-amendments (hash `1c7b01b48eb9`). |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1 — Pre-release audit + Phase A cut: add #369 CHANGELOG `### Documentation` bullet (C84-3); `harness release --version 0.12.0 --apply` (version bump + CHANGELOG promotion + README pin sweep); resolve ALL Phase A README warnings (`:5`/`:35`/`:37`) + add v0.12.0 Status narrative; validate lint + tests | pending | omni-ah-c2 | orchestrator-owned (release cut, not sub-agent fan-out). |
| T2 — Content PR review + merge: GPT-5.5 review-of-record + Copilot converge; admin squash-merge `cs84/content` | pending | omni-ah-c2 | HIGH-RISK; GPT-5.5 only. |
| T3 — Phase B publish (draft) + consumer notify: `harness release --publish --version 0.12.0 --sha <squash> --pr <pr> --apply --consumer henrik-me/sub-invaders --consumer-body <file>` → annotated tag + **draft** Release + sub-invaders pin-bump issue; **STOP at the draft** (human G-publish) | pending | omni-ah-c2 | Irreversible; G-publish is the human gate (C84-9). |
| Close-out: docs + restart state | pending | omni-ah-c2 | Update WORKBOARD.md, CONTEXT.md so a fresh agent can restart. |
| Close-out: learnings + follow-ups | pending | omni-ah-c2 | File/disposition LEARNINGS.md; note the draft-pending-publish state + any follow-ups. |

## Notes / Learnings

- First release after `release.yml`'s deletion (CS80) — the `harness release` verb is the sole Release creator, so LRN-159's double-draft reconciliation is structurally moot.
- Streamlined vs CS77 (v0.10.0 first-verb-use): no differential-equivalence re-proof (verb validated), no duplicate-draft handling.

## Plan-vs-implementation review

**Reviewer:** GPT-5.5 (rubber-duck)
**Date:** 2026-07-02T13:46:17Z
**Outcome:** GO

All 9 deliverables match; the only remaining release step is the intentional human **G-publish** (draft → Latest), which is the gate, not a gap.

| Deliverable | Outcome | Note |
|---|---|---|
| 1 (package.json + lock → 0.12.0) | match | `node -p` reports `0.12.0`; lock root/package versions `0.12.0`. |
| 2 (CHANGELOG) | match | Fresh empty `[Unreleased]`; `[0.12.0] — 2026-07-02` has #369 Documentation + CS83 Fixed bullets; link refs repointed. |
| 3 (README sweep) | match | Current-version prose/pins → `v0.12.0`; only historical `Prior: v0.11.0` remains; `check-readme` exit 0. |
| 4 (validation) | match | `harness lint` 34/0; `node --test` 1612 pass / 0 fail / 1 skipped. |
| 5 (local review) | match | PR #378 body Model audit + Review log with GPT-5.5 **Go**; Copilot review present + clean. |
| 6 (annotated tag + draft Release) | match | Remote annotated tag; peeled `^{}` == `3e66461519af7ff314a72097dcea0f06940a67c9`; `cat-file -t` = `tag`. Exactly one `v0.12.0` Release (draft=true); notes normalize-equal to CHANGELOG `[0.12.0]`. |
| 7 (sub-invaders issue) | match | Issue #139 OPEN, `harness-orchestrator` label; exactly one; body has the v0.12.0 bump + checklist. |
| 8 (plan file state) | match | `## Plan review` Go-with-amendments row present; PVI recorded before the active→done rename. |
| 9 (close-out / publish gate) | match | Autonomous cut stops at the draft; G-publish is the human gate, not a gap (C84-9). |

**Test-coverage / release-artifact assessment:** `sufficient` — version files, CHANGELOG, README, annotated tag, single draft Release, release notes, consumer issue, lint (34/0), and tests (1612/0) all match the plan + exit criteria.
