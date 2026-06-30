# CS74 — Cut harness v0.9.0

**Status:** active
**Owner:** omni-ah
**Branch:** cs74/content
**Started:** 2026-06-30
**Closed:** —
**Filed by:** `omni-ah` (Claude Opus 4.8) on 2026-06-30, at @henrik-me's request. Surfacing context: ~39 commits and 9 shipped clickstops have accumulated under `CHANGELOG.md` `[Unreleased]` since `v0.8.0` (2026-06-09), dominated by new CLI surface — CS64 lifecycle verbs (`startup`/`status`/`claim`/`close-out`/`dispatch`), CS64b `doctor` + sync reconciliation, CS66 review-family verbs (`review-doc`/`review-cs`/`perf-review`/`security-review`) — plus new linters (CS69, CS70 orphan guard, CS72 genericity) and a new composed template (CS72). Per [OPERATIONS.md § SemVer policy](../../../OPERATIONS.md#semver-policy) those are **minor** signals, so the pending cut is **v0.9.0**.
**Depends on:** None hard. [CS59](../done/done_cs59_document-release-process.md) (release-process docs — **closed**) is the spec this CS follows. CS67 (`harness release` verb) is **not** required: CS74 is the **manual** cut per [OPERATIONS.md § Release process](../../../OPERATIONS.md#release-process); CS67 will mechanize future cuts and is deliberately the v0.10.0 headline, not a blocker here (see C74-2).

## Goal

Cut **v0.9.0** following [OPERATIONS.md § Release process](../../../OPERATIONS.md#release-process): bump `package.json` + `package-lock.json`, promote `CHANGELOG.md` `[Unreleased]` → `[0.9.0]`, sweep `README.md` version pins, tag the content-PR **squash SHA**, publish the GitHub Release, and notify the known consumer (`henrik-me/sub-invaders`) via an issue-only handoff. After CS74, `package.json`, the `CHANGELOG.md` `## [x.y.z]` sections, and `git tag --list 'v*'` are 1:1 at `v0.9.0`, and consumers can pin a real tagged ref.

## Background

**State-of-the-world probes ([REVIEWS.md § 2.6c F6](../../../REVIEWS.md)).** Probed 2026-06-30 by `omni-ah`; recorded verbatim so subsequent plan reviewers can audit the same premise:

```text
$ gh api repos/henrik-me/agent-harness/releases --jq 'map(select(.tag_name=="v0.9.0"))'
[]

$ gh release list --repo henrik-me/agent-harness --limit 6
v0.8.0   Latest   v0.8.0   2026-06-09T17:56:38Z
v0.7.0            v0.7.0   2026-06-03T21:39:48Z
v0.6.0            v0.6.0   2026-05-27T08:00:17Z
v0.5.2            v0.5.2   2026-05-14T23:31:20Z
v0.5.1            v0.5.1   2026-05-14T16:29:09Z
v0.5.0            v0.5.0   2026-05-14T05:18:21Z

$ git ls-remote origin refs/tags/v0.9.0
(no output — tag does not exist)

$ node -p "require('./package.json').version"
0.8.0
```

Conclusion: **no published or draft GitHub Release and no git tag exists for `v0.9.0`** (clean cut — no stale-duplicate-draft cleanup per [LRN-159](../../../LEARNINGS.md#lrn-159) is required at filing time, but the content PR re-probes per C74-5). Current pinned version is `0.8.0`; latest tag is `v0.8.0`.

**Pre-release `[Unreleased]` audit ([LRN-101](../../../LEARNINGS.md#lrn-101)).** `git log v0.8.0..HEAD --oneline` is **39 commits**. Distinct clickstop tokens in those commit subjects: `cs21, cs22b, cs24, cs26, cs35b, cs58, cs59, cs64, cs64b, cs65, cs66, cs69, cs70, cs71, cs72, cs73`. Reconciled against `CHANGELOG.md` `[Unreleased]`:

- **Shipped, with an `[Unreleased]` bullet present (✓):** CS58, CS59, CS64, CS64b, CS66, CS69, CS70, CS72, CS73.
- **Closed obsolete — no entry required (✓):** CS21 and CS22b were both dispositioned **obsolete** in the pre-CS35b backlog pass (PR #284, "disposition pre-CS35b backlog (CS21/CS22b obsolete; CS24/CS26 notes)") — no shipping change, so correctly absent.
- **Not shipped (planned / in-flight) — no entry (✓):** CS24 + CS26 (planned; only "notes" touched by #284), CS65 (process-doc right-sizing), CS71 (filed planned). `cs35b` appears only as a reference to the existing plan-review-attestation procedure, not a new close-out.

The `[Unreleased]` section is therefore **complete and accurate** as of filing. Because anchor drift between filing-HEAD and tag-time-HEAD is the exact failure LRN-101 catches — and a sibling orchestrator may close another CS into `[Unreleased]` before this CS's content PR — the audit is **re-run at content-PR time**, not trusted from this snapshot (C74-3 / R3).

**Bump justification ([OPERATIONS.md § SemVer policy](../../../OPERATIONS.md#semver-policy)).** New CLI subcommands (CS64 ×5, CS64b `doctor`) + new linters (CS69, CS70, CS72) + a new template class addition (CS72 `INSTRUCTIONS.md`/`copilot-instructions.md` composed bases) are each **minor** signals; there is **no** breaking change (no removed/renamed CLI flag, no removed/renamed/retyped config-schema field, no new required config field). Cumulative bump: **minor → `v0.9.0`**.

**Precedent.** CS74 inherits the manual release-cut shape from [CS70](../done/done_cs70_cut-v0.7.0-and-v0.8.0-releases.md) / CS53 / CS42, simplified to a **single** release (no backfill phase).

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C74-1 | Bump size | **Minor → `v0.9.0`.** | New CLI subcommands (CS64 ×5, CS64b `doctor`), new linters (CS69/CS70/CS72), and a new composed-template addition (CS72) are minor signals per [OPERATIONS.md § SemVer policy](../../../OPERATIONS.md#semver-policy); no breaking change is present. |
| C74-2 | Manual cut vs. `harness release` verb | **Cut manually per [OPERATIONS.md § Release process](../../../OPERATIONS.md#release-process); do NOT block on CS67.** | CS67 (`harness release`) is unbuilt; dogfooding a brand-new, irreversible-output release verb on a live production cut adds avoidable risk. CS67 becomes the v0.10.0 headline (mirrors CS70 C70-9). |
| C74-3 | CHANGELOG transform | Promote `## [Unreleased]` → `## [0.9.0] — <ISO date>` (em-dash U+2014). Insert a fresh empty `## [Unreleased]` with the `### Added / ### Changed / ### Documentation / ### Fixed` skeleton. Bottom link refs: add `[0.9.0]: https://github.com/henrik-me/agent-harness/compare/v0.8.0...v0.9.0`; update `[Unreleased]: https://github.com/henrik-me/agent-harness/compare/v0.9.0...HEAD`. **Re-run the pre-release audit at content time** before promoting; do not trust the filing-time snapshot. | Matches `release.yml`'s `^## \[<version>\]` extractor; em-dash is repo convention (CS53 C53-2). Re-audit guards LRN-101 anchor drift (R3). |
| C74-4 | Version-file bump | `npm version 0.9.0 --no-git-tag-version` (never hand-edit `package.json`). | Keeps `package.json` + `package-lock.json` in sync (parity enforced by `check-pack`); `--no-git-tag-version` because the tag is created post-merge on the squash SHA (C74-5). |
| C74-5 | Tag target + Release publish | `git tag -a v0.9.0 <content-PR-squash-SHA>` (NOT raw `main` HEAD) → `git push origin v0.9.0`, which fires `.github/workflows/release.yml` (draft per [LRN-121](../../../LEARNINGS.md#lrn-121)). Verify the draft notes match `CHANGELOG.md` `[0.9.0]`, `gh release edit v0.9.0 --draft=false`, then **re-probe** that exactly one release exists for the tag (delete any stale duplicate draft per [LRN-159](../../../LEARNINGS.md#lrn-159)). | Tagging the squash SHA makes the artifact reproducible and avoids LRN-101 anchor drift; the draft → publish + duplicate re-probe is the documented post-merge sequence. |
| C74-6 | README pin sweep | Sweep `README.md` for `v0.8.0` install / status / quickstart pins and flip to `v0.9.0`; leave historical-narrative version mentions untouched. `README.md` is sync-excluded. | Consumer-facing install snippets must point at the latest tag (OPERATIONS § Release process step 3). An empty result is acceptable and recorded as such. |
| C74-7 | Consumer notification | **Issue-only handoff** (Hard Rule § 6 / [OPERATIONS.md § Cross-repo procedures](../../../OPERATIONS.md#cross-repo-procedures)). File exactly one tracking issue in `henrik-me/sub-invaders` via `harness cross-repo open-issue --repo henrik-me/sub-invaders --title "[harness:cs74] bump pinned harness to v0.9.0" --body-file <path>` (applies `harness-orchestrator` label; idempotent by exact title). The body MUST include the canonical OPERATIONS § Cross-repo step-4 fields **and** the [§ Cross-repo pin-bump PR body checklist (CS54)](../../../OPERATIONS.md#cross-repo-pin-bump-pr-body-checklist-cs54) verbatim. The SI agent owns the PR/validation/merge. | The harness orchestrator is issue-only outside its own repo (CS55 / [LRN-137](../../../LEARNINGS.md#lrn-137)); mirrors CS70 C70-8. |
| C74-8 | Reviewer model + risk class | **GPT-5.5 only, no Claude Sonnet fallback.** CS74 is designated **HIGH-RISK** by the orchestrator per [REVIEWS.md § 2.3](../../../REVIEWS.md): it produces consumer-visible, **irreversible** artifacts (annotated `v0.9.0` tag, published GitHub Release, version bump) that can only be superseded, never silently reverted. At implementation time add `CS74` to `harness.config.json` `reviews.high_risk_clickstops` for the active duration and revert it at close-out. Independence holds: plan author / implementer = Claude Opus 4.8; reviewer = GPT-5.5; no overlap. | Standing release-cut precedent (CS70 C70-10 / CS53 C53-7); release irreversibility matches the HIGH-RISK criteria. |
| C74-9 | PR shape | Standard **3-PR lifecycle** — `cs74/claim` (workboard-only rename `planned→active`) → `cs74/content` (version bump + CHANGELOG + README) → `cs74/close-out` (workboard-only rename `active→done` + WORKBOARD/CONTEXT/LEARNINGS) — plus **this plan-filing PR**. No special phases (single release, unlike CS70's two-phase backfill). Solo-orchestrator content/close-out merges use the documented admin-merge path. | Mirrors the canonical claim → content → close-out shape; admin-merge per [OPERATIONS.md § Content/release-PR admin-merge](../../../OPERATIONS.md#contentrelease-pr-admin-merge-solo-orchestrator-reality). |
| C74-10 | Scope boundary | **Out of scope:** CS67 (release verb), CS24 (CHANGELOG-touch linter), CS26 (init defects), CS65 (doc right-sizing), CS71 (gate timing). The pre-claim harvest gate dispositions the 5 stale-open `process` learnings (LRN-163/161/156/152/101); **none block the cut** and their resolution is not a CS74 deliverable. | Keeping the release tight avoids re-creating mega-PR risk and decouples the cut from unrelated in-flight work. |

## Deliverables

1. **`package.json` + `package-lock.json`** — bumped `0.8.0 → 0.9.0` via `npm version 0.9.0 --no-git-tag-version` (C74-4).
2. **`CHANGELOG.md`** — `## [Unreleased]` promoted to `## [0.9.0] — <ISO date>`; fresh empty `## [Unreleased]` skeleton prepended; `[0.9.0]` link ref added and `[Unreleased]` link ref repointed (C74-3). Content-time pre-release audit re-run confirmed (recorded in the content PR body).
3. **`README.md`** — `v0.8.0 → v0.9.0` pin sweep (status/install/quickstart); historical narrative left as-is (C74-6).
4. **Validation green** — `node bin/harness.mjs lint --quiet` (0 failed) and `node --test tests/*.test.mjs` (0 failed) on the content branch (C74-4 parity, etc.).
5. **Local review** — GPT-5.5 rubber-duck (mandatory per the close-out PVI gate and INSTRUCTIONS § Every CS); model + timestamp + verdict recorded in the content PR body's `## Model audit` + `## Review log` (C74-8).
6. **Git tag `v0.9.0`** at the content-PR squash SHA, pushed to `origin`; **GitHub Release `v0.9.0` published** (not draft) with notes matching `CHANGELOG.md` `[0.9.0]`; re-probe confirms exactly one release for the tag (C74-5).
7. **`henrik-me/sub-invaders` tracking issue** filed via `harness cross-repo open-issue` (pin to `v0.9.0`) with the canonical step-4 fields + Cross-repo pin-bump PR body checklist verbatim (C74-7).
8. **This planned file** — `## Plan review` table populated with ≥1 row reaching `Go` / `Go-with-amendments`; renamed `planned → active` at claim and `active → done` at close-out.
9. **Close-out** — `WORKBOARD.md` Active Work row removed; `CONTEXT.md` updated to the v0.9.0 state; new LRNs filed / the 5 stale-open process LRNs dispositioned; `CS74` removed from `reviews.high_risk_clickstops` (C74-8); `## Plan-vs-implementation review` populated with **Outcome: GO** before the rename.

## User-approval gates

- **Gate A — cut now vs. build CS67 first (C74-2).** Resolved: **cut v0.9.0 now** via the manual process — @henrik-me directed filing the v0.9.0 release CS. CS67 stays the v0.10.0 headline.
- **Gate B — HIGH-RISK designation + GPT-5.5-only review (C74-8).** Default: **designate HIGH-RISK** (release artifacts are irreversible). Confirm at claim, or downgrade to allow the Sonnet fallback if desired.

## Exit criteria

1. `package.json` + `package-lock.json` read `0.9.0` (lockfile parity intact).
2. `CHANGELOG.md` has `## [0.9.0] — <date>` (em-dash) with a fresh empty `## [Unreleased]` above it; `[0.9.0]` and `[Unreleased]` link refs resolve to the correct `compare/...` ranges.
3. `README.md` carries no stale `v0.8.0` install/status/quickstart pin (sweep complete or recorded empty).
4. `node bin/harness.mjs lint --quiet` and `node --test tests/*.test.mjs` both exit 0 on the content branch.
5. The content-PR plan-vs-implementation review returns **GO** (GPT-5.5), recorded in the active CS file before the `active → done` rename.
6. `git ls-remote origin refs/tags/v0.9.0` resolves; the tag points at the content-PR squash SHA.
7. `gh api repos/henrik-me/agent-harness/releases --jq 'map(select(.tag_name=="v0.9.0"))'` returns **exactly one**, published (not draft); notes match `CHANGELOG.md` `[0.9.0]`.
8. Exactly one open `harness-orchestrator`-labelled tracking issue exists in `henrik-me/sub-invaders` requesting the `v0.9.0` pin bump, with the canonical body + checklist.
9. Close-out complete: WORKBOARD row removed, `CONTEXT.md` refreshed, learnings dispositioned, `CS74` removed from `reviews.high_risk_clickstops`.

## Risks + open questions

- **R1 — Tag anchor drift.** Tagging pre-merge branch HEAD instead of the squash SHA reintroduces the LRN-101 drift. Mitigation: tag the squash SHA only (C74-5).
- **R2 — Stale duplicate draft Release.** `release.yml` auto-drafts on tag push; a prior partial cut could leave a duplicate. Mitigation: filing-time probe is clean (`[]`); re-probe + delete at publish time per LRN-159/LRN-121 (C74-5).
- **R3 — `[Unreleased]` drift between filing and content time.** A sibling orchestrator may close another CS into `[Unreleased]` before this content PR. Mitigation: re-run the pre-release audit at content time (C74-3); do not trust this plan's filing-time snapshot.
- **R4 — Solo-orchestrator merge.** Content + close-out PRs cannot self-approve and Copilot lands `COMMENTED`. Mitigation: documented `gh pr merge --admin --squash` path (OPERATIONS § Content/release-PR admin-merge).
- **OQ1 — Fold CS24/CS26 into v0.9.0?** Default **no** — keep the release tight; they are independent and become v0.10.0-window candidates. Revisit only if the maintainer wants a combined cut.

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | general-purpose (orchestrator: omni-ah) | e71fcea81d18 | 2026-06-30T20:17:53Z | Go | No F1–F6 defects found; release-state probes clean; v0.9.0 minor/manual-cut/issue-only decisions match doctrine. |

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | omni-ah |
| Reviewer agent | rubber-duck (orchestrator: omni-ah) |
| Notes | Planned ledger (finalized at close-out). HIGH-RISK release cut (C74-8): GPT-5.5 only, no Sonnet fallback. Orchestrator omni-ah `claude-opus-4.8` performs claim, `npm version` bump, CHANGELOG promote, README sweep, tag, PRs, consumer issue. Independence per REVIEWS § 2.3 — reviewer `gpt-5.5` ≠ implementer `claude-opus-4.8`. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1 — Pre-release audit re-run + CHANGELOG promote `[Unreleased]` → `[0.9.0] — <date>` + link refs (C74-3) | pending | omni-ah | Re-run `git log v0.8.0..HEAD` reconciliation at content time; em-dash heading. |
| T2 — `npm version 0.9.0 --no-git-tag-version` + README pin sweep v0.8.0→v0.9.0 (C74-4/C74-6) | pending | omni-ah | package.json + package-lock.json parity; README sync-excluded. |
| T3 — Add CS74 to `reviews.high_risk_clickstops`; validate (`harness lint --quiet`, `node --test`); GPT-5.5 PVI review (C74-8) | pending | omni-ah | high_risk edit lands in the content PR (outside workboard-only scope); record Model audit + Review log in PR body. |
| T4 — Content PR → admin-merge; `git tag -a v0.9.0 <squash-sha>` + push; publish draft Release; re-probe single release (C74-5) | pending | omni-ah | Tag squash SHA (LRN-101); dedupe stale drafts (LRN-159/121). |
| T5 — Consumer notification: `harness cross-repo open-issue` → henrik-me/sub-invaders (pin v0.9.0) (C74-7) | pending | omni-ah | Issue-only; canonical step-4 fields + pin-bump checklist verbatim. |
| Close-out: docs + restart state — rename active→done; update WORKBOARD + CONTEXT; remove CS74 from `reviews.high_risk_clickstops`; `sync --mode=check` clean | pending | omni-ah | Mandatory close-out row (OPERATIONS § Claim). |
| Close-out: learnings + follow-ups — file release LEARNINGS; disposition stale process LRNs (163/161/156/152/101); follow-up CSs for any deferred scope | pending | omni-ah | Mandatory close-out row. |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
