# CS77 — Cut harness v0.10.0 (validate the `harness release` verb)

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** `omni-ah-c2` (Claude Opus 4.8) on 2026-07-01, at @henrik-me's request ("we should validate the new release verb by making a release"). Two distributed-surface clickstops have shipped under `CHANGELOG.md` `[Unreleased]` since `v0.9.0` (2026-06-30): **CS67** (the `harness release` verb) and **CS78** (the verb's Phase B annotated-tag fix). CS67 added a new CLI subcommand — a **minor** signal per [OPERATIONS.md § SemVer policy](../../../OPERATIONS.md#semver-policy) — so the pending cut is **v0.10.0**. This cut is executed **with** the `harness release` verb it validates (the verb's first live production use), against a differential-equivalence reference of the canonical manual commands.
**Depends on:** **CS67** (`harness release` verb — **closed**, `b2fb81d`) and **CS78** (Phase B annotated tags — **closed**, `c167dd8`) — together they are the verb under validation. CS78 is a hard prerequisite: it makes Phase B cut **annotated** tags matching the documented process, so v0.10.0's tag is annotated like its predecessors. [CS59](../done/done_cs59_document-release-process.md) (release-process docs — closed) is the manual fallback the verb must match.

## Goal

Cut **v0.10.0** by driving [OPERATIONS.md § Release process](../../../OPERATIONS.md#release-process) through the **`harness release` verb** end-to-end, proving the verb produces artifacts equivalent to the documented manual method. Phase A (`harness release --version 0.10.0 --apply`) writes the version bump (`package.json` + `package-lock.json`), the `CHANGELOG.md` `[Unreleased] → [0.10.0]` promotion, and the `README.md` install-pin sweep; Phase B (`harness release --publish --version 0.10.0 --sha <squash> --pr <pr> --apply`) verifies the squash SHA, cuts the **annotated** tag (`git tag -a` + `git push`), and creates the (draft) GitHub Release via `gh release create --verify-tag`; `--consumer henrik-me/sub-invaders --consumer-body <file>` files the issue-only pin-bump handoff. After CS77, `package.json`, the `CHANGELOG.md` `## [x.y.z]` sections, and `git tag --list 'v*'` are 1:1 at `v0.10.0`, the `v0.10.0` tag is **annotated**, exactly one GitHub Release exists for the tag, and the empirical `release.yml`-vs-verb duplicate-draft interaction is recorded.

## Background

**State-of-the-world probes ([REVIEWS.md § 2.6c F6](../../../REVIEWS.md)).** Probed 2026-07-01 by `omni-ah-c2` (post-CS78-merge); recorded verbatim:

```text
$ gh api repos/henrik-me/agent-harness/releases --jq 'map(select(.tag_name=="v0.10.0"))'
[]

$ gh release list --repo henrik-me/agent-harness --limit 3
v0.9.0   Latest   v0.9.0   2026-06-30T21:35:44Z
v0.8.0            v0.8.0   2026-06-09T17:56:38Z
v0.7.0            v0.7.0   2026-06-03T21:39:48Z

$ git ls-remote origin refs/tags/v0.10.0
(no output — tag does not exist)

$ node -p "require('./package.json').version"
0.9.0
```

Conclusion: **no published or draft GitHub Release and no git tag exists for `v0.10.0`** (clean cut — no stale-duplicate cleanup at filing time; the content PR re-probes per C77-5). Current pinned version is `0.9.0`; latest tag is `v0.9.0`.

**Pre-release `[Unreleased]` audit ([LRN-101](../../../LEARNINGS.md#lrn-101)).** `git log v0.9.0..main --oneline` since v0.9.0 comprises the CS65 pause (`ff93144`, workboard-only), the CS67 verb (`91fd191`+`8f5fe68`), the CS67 close-out (`b2fb81d`, docs-only), the **CS74 close-out** (`de94c1f`, #334 — docs-only; v0.9.0 was already tagged on the CS74 *content*-PR squash SHA, so this close-out carries no distributed-surface change and needs no CHANGELOG entry), and the full CS78 lifecycle (`7e01344`/`0804ae7`/`c167dd8`/`6ad6721`). The **distributed-surface** changes are **CS67** and **CS78** (both `lib/`+`bin/`+docs). `CHANGELOG.md` `[Unreleased]` has a single `### Added` bullet describing the `harness release` verb; CS78 **amended** that bullet in place to describe the final **annotated**-tag Phase B (rather than adding a separate bullet — CS78 refined CS67's verb before either shipped, so there is no released behavior to migrate). The bullet is accurate **except** it still reads "67 unit tests" — CS78's review added 2 more (→ **69**); C77-3 corrects "67 → 69" at content time before the promotion. No sibling orchestrator is active (WORKBOARD holds only the paused CS65).

**Bump justification ([OPERATIONS.md § SemVer policy](../../../OPERATIONS.md#semver-policy)).** CS67 adds a new CLI subcommand (`harness release`); CS78 refines it — no breaking change (no removed/renamed CLI flag, no removed/renamed/retyped config field). Cumulative: **minor → `v0.10.0`**.

**Verb-validation framing.** [CS74](../done/done_cs74_release-v0.9.0.md) cut v0.9.0 **manually** (C74-2, the verb was unbuilt). The verb has since shipped (CS67) and been corrected to cut annotated tags (CS78, after the CS77 pre-cut plan-review caught the lightweight-tag divergence). CS77's purpose is to **validate the verb on a live cut** by running it as the executor while asserting differential equivalence against the manual commands (C77-10). Pre-filing sandbox validation (pre-CS78) already proved Phase A output byte-identical to `npm version 0.10.0 --no-git-tag-version` for `package.json` + `package-lock.json`, with CHANGELOG/README transforms matching OPERATIONS steps 2–3, and Phase B verification correctly refusing a SHA not carrying the target version.

**`release.yml`-vs-verb interaction (primary validation target).** The verb's Phase B does `git push origin v0.10.0`, which triggers [`.github/workflows/release.yml`](../../../.github/workflows/release.yml) — it fires on `v*.*.*` tag push and unconditionally runs `gh release create <tag> --draft` (no idempotency probe). The verb ALSO creates the release via `gh release create <tag> --verify-tag --draft`. So **two draft releases for `v0.10.0` are the expected outcome** (GitHub permits multiple *drafts* per tag). This is the documented LRN-121/LRN-159 scenario ("a verb-created tag can also trigger `release.yml`; re-check for stale duplicate drafts before publishing"). C77-5 reconciles to exactly one draft, verifies, and the human publishes; the empirical outcome (does the double-draft occur; which draft the verb's idempotency skips vs creates) is a recorded CS77 finding and a candidate follow-up (C77-11).

**Precedent.** Single release, 3-PR lifecycle — inherits from CS74/CS70/CS53.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C77-1 | Bump size | **Minor → `v0.10.0`.** | CS67 new CLI subcommand + CS78 refinement; no breaking change. |
| C77-2 | Cut via the verb vs. manual | **Cut *with* `harness release` (Phase A `--apply` + Phase B `--publish --apply`); the manual OPERATIONS commands are the differential reference.** | CS67+CS78 are shipped, reviewed, PVI-passed; this is the verb's intended first live use and validation. Bounded by C77-10's equivalence checks, Phase-B dry-run-first, and the G-publish human gate. |
| C77-3 | CHANGELOG transform + pre-audit fix | Correct the `[Unreleased]` bullet "67 → 69 unit tests" first, then the verb's Phase A promotes `## [Unreleased]` → `## [0.10.0] — <ISO UTC date>` (em-dash), prepends a fresh `### Added / ### Changed / ### Documentation / ### Fixed` skeleton, adds `[0.10.0]: …/compare/v0.9.0...v0.10.0`, and repoints `[Unreleased]: …/compare/v0.10.0...HEAD`. Re-run the pre-release audit before `--apply`. | Matches `release.yml`'s `^## \[<version>\]` awk extractor; em-dash is repo convention. The test-count correction keeps the shipped release note accurate. |
| C77-4 | Version-file bump | Via the verb's Phase A string-edit of `package.json` + `package-lock.json`; equivalence to `npm version 0.10.0 --no-git-tag-version` asserted per C77-10. | Verb keeps package/lock in sync and never tags/commits in Phase A; proven byte-identical pre-filing. |
| C77-5 | Tag + Release publish + duplicate reconcile | Via Phase B `--publish --version 0.10.0 --sha <content-PR-squash-SHA> --pr <pr> --apply`: verifies the squash SHA, cuts the **annotated** tag (`git tag -a v0.10.0 <sha> -m "Release v0.10.0"` + `git push origin v0.10.0`), then `gh release create v0.10.0 --verify-tag --draft`. Because the tag push also triggers `release.yml` (which drafts), **re-probe** the releases API and **delete any duplicate draft** ([LRN-159](../../../LEARNINGS.md#lrn-159)) so exactly one release remains; confirm its notes match `CHANGELOG.md` `[0.10.0]`. Human publishes (`gh release edit v0.10.0 --draft=false`) at the **G-publish gate**. | Annotated tag on the squash SHA is reproducible + matches the process (LRN-101 anchor-drift avoided). The verb-vs-`release.yml` double-draft is expected (release.yml has no idempotency) — reconciliation is the documented mitigation and this cut's primary recorded finding. |
| C77-6 | README pin sweep | The verb's Phase A sweeps `README.md` install/quickstart `v0.9.0` pins → `v0.10.0` and leaves historical narrative (it flags, does not rewrite, ambiguous occurrences). The **human adds** the "v0.10.0 shipped" Status narrative. `README.md` is sync-excluded. | Install snippets must point at the latest tag (OPERATIONS step 3); historical narrative is a human judgment call. |
| C77-7 | Consumer notification | **Issue-only** via the verb's `--consumer henrik-me/sub-invaders --consumer-body <body-file> [--consumer-title <t>]` (same `openIssue` code path as `harness cross-repo open-issue`; `--consumer` REQUIRES `--consumer-body`). Exactly one tracking issue `[harness:cs77] bump pinned harness to v0.10.0` (idempotent by title; `harness-orchestrator` label). Body MUST include the canonical OPERATIONS § Cross-repo step-4 fields + the [§ Cross-repo pin-bump PR body checklist (CS54)](../../../OPERATIONS.md#cross-repo-pin-bump-pr-body-checklist-cs54) verbatim. SI agent owns the PR. | Orchestrator is issue-only outside its own repo (Hard Rule § 6 / CS55 / [LRN-137](../../../LEARNINGS.md#lrn-137)); mirrors CS74 C74-7. |
| C77-8 | Reviewer model + risk class | **GPT-5.5 only, no Sonnet fallback.** HIGH-RISK per [REVIEWS.md § 2.3](../../../REVIEWS.md) (irreversible `v0.10.0` tag + Release + version bump). **Do NOT add `CS77` to `reviews.high_risk_clickstops`** — designate HIGH-RISK by dispatch discipline only, per the CS74 C74-8 lesson (the flag forced CS74's close-out to touch config, making it a content PR). Independence: implementer/plan-author = claude-opus-4.8; reviewer = gpt-5.5. | Standing release precedent (CS70 C70-10); CS74 Notes recommend the flagless CS70 approach. |
| C77-9 | PR shape | Standard **3-PR lifecycle** — `cs77/claim` → `cs77/content` (verb Phase A output) → `cs77/close-out` — plus this filing PR and the already-merged `workboard/cs65-pause` (#338). Solo-orchestrator content merge = admin-merge. | Canonical shape; admin-merge per [OPERATIONS.md § Content/release-PR admin-merge](../../../OPERATIONS.md#contentrelease-pr-admin-merge-solo-orchestrator-reality). |
| C77-10 | Differential-equivalence validation | Run **both** the verb (`--apply` into the repo) **and** the canonical manual commands (`npm version` into a sandbox; hand-computed CHANGELOG/README transforms) and assert **byte-identical** `package.json`/`package-lock.json` (`git diff --no-index` exit 0) + inspection parity for CHANGELOG/README. Phase B verification exercised with negative tests (branch-head SHA + wrong-version SHA → refusal) before the live `--apply`. With CS78, the tag artifact is now **annotated** — matching the manual `git tag -a` step (no tag-type deviation remains). Record evidence in the content PR body. | This equivalence proof answers "does the verb work the same way as the documented process?"; it is the substantive deliverable. |
| C77-11 | Scope boundary + verb-bug policy | **Out of scope:** CS65 (paused; resumed at close-out), OPERATIONS thinning, and **any change to verb behavior**. If the live cut reveals a verb defect (e.g. the `release.yml` double-draft warrants a verb-side wait/skip), surface it as a `LEARNINGS CANDIDATE` + file a follow-up CS; do **not** patch `lib/release.mjs` in-band (it would invalidate the equivalence claim) unless trivial *and* blocking, and only after escalation. | Keeps the release tight and the validation's integrity intact. |

## Deliverables

1. **`package.json` + `package-lock.json`** — bumped `0.9.0 → 0.10.0` by Phase A (C77-4), byte-identical to `npm version` (C77-10).
2. **`CHANGELOG.md`** — "67 → 69" corrected; `[Unreleased]` promoted to `[0.10.0] — <date>` + fresh skeleton + link refs (C77-3).
3. **`README.md`** — verb pin sweep + human `v0.10.0` Status narrative; historical left (C77-6).
4. **Differential-equivalence evidence** in the content PR body: package/lock byte-identity; CHANGELOG/README parity; Phase B negative-test refusals; annotated-tag artifact parity (C77-10).
5. **Validation green** — `node bin/harness.mjs lint --quiet` (0 failed) + `node --test tests/*.test.mjs` (0 failed).
6. **Local review** — GPT-5.5 rubber-duck (mandatory); model + timestamp + verdict in the PR body's `## Model audit` + `## Review log` (C77-8).
7. **Annotated git tag `v0.10.0`** at the content-PR squash SHA (Phase B); **GitHub Release `v0.10.0`** reconciled to **exactly one** draft (LRN-159), notes == `CHANGELOG.md` `[0.10.0]`; human publishes at G-publish (C77-5).
8. **`henrik-me/sub-invaders` tracking issue** via the verb's `--consumer`/`--consumer-body` (pin `v0.10.0`) with the canonical fields + pin-bump checklist (C77-7).
9. **This planned file** — `## Plan review` ≥1 row reaching `Go`; renamed `planned → active` at claim, `active → done` at close-out.
10. **Close-out** — CS77 WORKBOARD row removed + **CS65 resumed** (`⏸️ Paused → 🟢 Active`); `CONTEXT.md` updated; the empirical `release.yml`-vs-verb finding + any LRNs filed; `## Plan-vs-implementation review` **GO** before the rename. (No `high_risk_clickstops` revert — C77-8; close-out stays workboard-only.)

## User-approval gates

- **Gate A — cut now via the verb (C77-2).** Resolved: @henrik-me directed validating the verb by cutting v0.10.0 (and fixing the verb first — CS78 — then proceeding).
- **Gate G-publish — the irreversible publish (C77-5).** The verb creates the annotated tag + draft Release under `--apply`; the human gives explicit go before that irreversible step and runs the final `gh release edit v0.10.0 --draft=false`. The orchestrator stops at the reconciled draft.

## Exit criteria

1. `package.json` + `package-lock.json` read `0.10.0` (lockfile parity), byte-identical to the `npm version` reference.
2. `CHANGELOG.md` has `## [0.10.0] — <date>` (em-dash) + fresh `## [Unreleased]`; `[0.10.0]`/`[Unreleased]` link refs resolve; the "69 unit tests" figure is correct.
3. `README.md` has no stale `v0.9.0` install/quickstart pin; `v0.10.0` Status narrative present; historical preserved.
4. `node bin/harness.mjs lint --quiet` and `node --test tests/*.test.mjs` both exit 0 on the content branch.
5. Content-PR PVI returns **GO** (GPT-5.5) at the merged HEAD, recorded before the `active → done` rename.
6. `git ls-remote origin refs/tags/v0.10.0` resolves to an **annotated** tag (peeled `^{}` line present) pointing at the content-PR squash SHA.
7. `gh api repos/henrik-me/agent-harness/releases --jq 'map(select(.tag_name=="v0.10.0"))'` returns **exactly one** release (draft until the human publishes); notes match `CHANGELOG.md` `[0.10.0]`; the verb-vs-`release.yml` interaction is recorded.
8. Exactly one open `harness-orchestrator` tracking issue in `henrik-me/sub-invaders` for the `v0.10.0` pin bump, with the canonical body + checklist.
9. Close-out complete: CS77 row removed, CS65 resumed Active, `CONTEXT.md` refreshed, learnings + the interaction finding filed.

## Risks + open questions

- **R1 — Verb-vs-`release.yml` double draft (primary).** `git push origin v0.10.0` triggers `release.yml` (unconditional `gh release create --draft`) while the verb also creates a draft → two drafts expected. Mitigation: draft-by-default (nothing published); re-probe + delete the duplicate (LRN-159); verify exactly one before G-publish (C77-5). The empirical outcome is a recorded finding + candidate follow-up.
- **R2 — Tag anchor drift.** Mitigation: Phase B `--pr <n>` pins the check to the squash `mergeCommit.oid` and refuses the branch head; tag the squash SHA (C77-5).
- **R3 — `[Unreleased]` drift filing→content.** Mitigation: re-run the pre-release audit at content time (C77-3). No sibling orchestrator active.
- **R4 — Solo-orchestrator merge.** Content PR can't self-approve; Copilot lands `COMMENTED`. Mitigation: admin-merge.
- **R5 — Verb defect mid-cut.** Mitigation: C77-11 — surface + follow-up CS; do not patch in-band.
- **OQ1 — Fold CS24/CS26?** Default **no** — keep the release + equivalence proof tight.

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: omni-ah-c2) | 807e21b8f7bb | 2026-07-01T16:26:00Z | Go-with-amendments | F1–F5 pass; F6: audit list omitted `de94c1f` (CS74 close-out, docs-only) — added. release.yml double-draft + reconcile, --consumer-body, annotated-tag, minor-bump decisions sound post-CS78. |

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | omni-ah-c2 |
| Reviewer agent | rubber-duck (orchestrator: omni-ah-c2) |
| Notes | Planned ledger (finalized at close-out). HIGH-RISK release cut (C77-8): GPT-5.5 only; `CS77` NOT added to `reviews.high_risk_clickstops` (C74-8 lesson — keeps close-out workboard-only). Orchestrator `omni-ah-c2` (`claude-opus-4.8`) runs `harness release` Phase A/B, the content/close-out PRs, and the consumer issue. Independence per REVIEWS § 2.3 — reviewer `gpt-5.5` ≠ implementer `claude-opus-4.8`. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1 — Content-time re-audit + CHANGELOG "67→69" fix + verb Phase A `--apply` (bump + CHANGELOG `[0.10.0]` + README sweep) + human `v0.10.0` README narrative (C77-3/4/6) | pending | omni-ah-c2 | Re-audit before `--apply`; em-dash; link refs; verb-produced. |
| T2 — Differential-equivalence checks: verb vs `npm version` (byte-identical package/lock) + CHANGELOG/README parity + Phase B negative-test refusals + annotated-tag parity (C77-10) | pending | omni-ah-c2 | Evidence in content PR body. |
| T3 — Validate (`harness lint --quiet`, `node --test`); GPT-5.5 PVI; content PR → admin-merge (C77-8/9) | pending | omni-ah-c2 | Reviewer gpt-5.5 ≠ implementer claude-opus-4.8. |
| T4 — Phase B on the squash SHA: `--publish --sha <squash> --pr <pr> --apply` → annotated tag + draft Release; reconcile `release.yml` duplicate (LRN-159); verify single release; human publishes at G-publish (C77-5) | pending | omni-ah-c2 | Records the empirical verb-vs-release.yml finding. |
| T5 — Consumer notification: verb `--consumer henrik-me/sub-invaders --consumer-body <file>` (pin v0.10.0) (C77-7) | pending | omni-ah-c2 | harness-orchestrator label; canonical fields + pin-bump checklist. |
| Close-out: docs + restart state — rename active→done; WORKBOARD (remove CS77, resume CS65) + CONTEXT; `sync --mode=check` clean | pending | omni-ah-c2 | Mandatory close-out row. |
| Close-out: learnings + follow-ups — file the `release.yml`-vs-verb finding + any release LRNs; follow-up CSs for deferred scope | pending | omni-ah-c2 | Records the primary validation finding (R1). |

## Notes / Learnings

- _(populated at close-out)_

## Plan-vs-implementation review

> _(filled at close-out per the gate)_
