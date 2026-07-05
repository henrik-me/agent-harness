# CS107 — Cut harness release v0.17.0

**Status:** active
**Owner:** yoga-ah
**Branch:** cs107/content
**Started:** 2026-07-05
**Closed:** —
**Filed by:** yoga-ah (orchestrator, Claude Opus 4.8), 2026-07-04. Cuts the accumulated `[Unreleased]` batch merged since v0.16.0 (9 CSs). Directed by @henrik-me ("yes, release and properly close issues").
**Depends on:** none

## Goal

Cut harness **v0.17.0** (Minor) bundling the distributed-surface + doc work merged
since v0.16.0: **CS24, CS26, CS68, CS71, CS75, CS76, CS86, CS87, CS91**. Version
bump + CHANGELOG promotion + README pin sweep on a content PR, then post-merge
annotated tag + **published** GitHub Release, then issue-only consumer
notifications, then issue reconciliation (#229/#394 ship already-closed; #395
Rec A/C shipped, Rec B stays open in CS106).

## Background

- **Prev version:** `package.json` `version` = `0.16.0`. **Target:** `0.17.0`
  (Minor — additive, backward-compatible).
- **Pre-release audit (LRN-101).** `git log v0.16.0..main --oneline` shows the CSs
  merged since the v0.16.0 tag. `CHANGELOG.md [Unreleased]` carries 14 bullets across
  **9 CSs**: CS71 (path-derived workboard-only evidence-gate skip + new
  `check-workboard-allowlist-consistency` linter), CS91 (#394 workboard-auto-approve
  hardening + #395 Rec A/C merge-posture reframe + `workboard/maint-*` pattern),
  CS26 (new `check-config-placeholders` linter + seeded `.gitattributes` + real
  `version` pin), CS68 (`harness review --implementer-models`), CS86 (new **managed
  file** `DISPATCH-PREAMBLE.md` + OPERATIONS.md right-size), CS24 (`check-clickstop`
  CHANGELOG-touch enforcement), CS75 (`check-clickstop` directory-form recursion +
  fence-aware PVI + REVIEWS F2), CS87 (`copilot-engage --help` wording), CS76 (#229
  composed process-doc cross-ref resolvability). Promoting `[Unreleased] → [0.17.0]`
  captures exactly this batch.
- **Minor trigger.** CS86 adds a new **managed** template file (`DISPATCH-PREAMBLE.md`);
  CS71 + CS26 add **new linters**; CS68 adds a **new `--implementer-models` CLI flag** —
  each a Minor (backward-compatible additive) trigger per § SemVer policy. No Major
  (no removed/renamed flag, no breaking schema change); more than Patch (new surface).
- **State-of-the-world probes (REVIEWS § 2.6c F6), recorded verbatim:**
  - `git ls-remote origin refs/tags/v0.17.0` → **(empty — no output; no tag)**.
  - `gh api repos/henrik-me/agent-harness/releases --jq 'map(select(.tag_name=="v0.17.0")) | length'` → **`0`**.
  - `gh release list --repo henrik-me/agent-harness --limit 5` →
    ```text
    v0.16.0	Latest	v0.16.0	2026-07-04T01:33:03Z
    v0.15.0		v0.15.0	2026-07-04T01:14:32Z
    v0.14.0		v0.14.0	2026-07-03T20:57:18Z
    v0.13.0		v0.13.0	2026-07-03T07:09:36Z
    v0.12.0		v0.12.0	2026-07-02T16:19:36Z
    ```
  - Conclusion: no existing/stale v0.17.0 tag, release, or draft to delete; clean cut.
    **v0.16.0 is Latest**, so v0.17.0 layers on it (`compare/v0.16.0...v0.17.0`).
- **Publish posture:** @henrik-me directed releases be **fully published** to Latest,
  never left as drafts. This CS therefore **publishes** v0.17.0 to Latest as part of
  the cut, overriding the default draft/human-publish gate (LRN-121, C84-9) by
  explicit standing user directive.
- **Issue reconciliation.** #229 (CS76) and #394 (CS91) already auto-closed on merge —
  their fixes ship in v0.17.0. #395 (CS91) stays **open**: only Rec A (admin-override =
  zero-secret default) + Rec C (`workboard/maint-*`) shipped; **Rec B** (review-evidence
  as a required check) is deferred to **CS106** (planned, depends on CS90). No currently
  open issue is fully-fixed-but-unclosed, so the release closes no new issue — it posts
  an accurate v0.17.0-shipped status comment on #395.
- **Coordination.** CS86 is `active` under yoga-ah-c2 (content merged #486; close-out
  pending). Its `[Unreleased]` entry is already on `main`, and close-out only renames
  the CS file + edits WORKBOARD/CONTEXT/LEARNINGS (no distributed-surface or CHANGELOG
  change), so promoting it is safe. The release proceeds independently; WORKBOARD edits
  may need a rebase if both PRs land together.
- Mechanized by the `harness release` verb (CS67): Phase A previews/applies the bump +
  CHANGELOG promotion + README sweep; Phase B verifies the squash SHA, cuts the
  annotated tag, and creates the Release (published via `--no-draft`).

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Version | **0.17.0** (Minor). | CS86 adds a new managed file `DISPATCH-PREAMBLE.md`; CS71 + CS26 add new linters; CS68 adds a new `--implementer-models` CLI flag — all Minor (backward-compatible additive) triggers. Not Major (no breaking change / removed flag); not Patch (new surface beyond bug fixes). |
| 2 | Scope | Bundle the full `[Unreleased]` batch (CS24, CS26, CS68, CS71, CS75, CS76, CS86, CS87, CS91) — every current `[Unreleased]` bullet. | The release promotes `[Unreleased]`, which contains exactly these merged CSs since v0.16.0. No selective inclusion/exclusion. |
| 3 | Cut mechanism | `harness release --version 0.17.0 --apply` (Phase A) for the bump + CHANGELOG `[Unreleased] → [0.17.0]` promotion + README pin sweep on the content branch; post-merge `harness release --publish --version 0.17.0 --sha <squash-sha> --pr <n> --no-draft --apply` (Phase B) for the annotated tag + **published** Release. | The verb is the single, dry-run-first, SemVer-checked creator of the tag + Release; matches the CS105 (v0.16.0) precedent. |
| 4 | Publish | **Publish the Release to Latest** (`--no-draft`) as part of the cut — do NOT leave a draft. | @henrik-me standing directive "release fully — don't stop at draft". Overrides the default human-publish gate (LRN-121, C84-9) by standing user directive. |
| 5 | Consumer notification | After the tag + published Release, file idempotent issue-only pin-bump trackers (Hard Rule § 6) via `harness cross-repo open-issue` to **`henrik-me/sub-invaders`** and **`henrik-me/authzandentitlements`**, each carrying the § Cross-repo pin-bump PR-body checklist (CS54). | Consumers adopt via issue-only handoff; both surfaced issues in this batch (sub-invaders: #229/#394/#395; authzandentitlements: #408). |
| 6 | Issue reconciliation | Verify #229 + #394 are closed (they ship in v0.17.0). Post a status comment on open **#395** noting Rec A/C shipped in v0.17.0 and Rec B is tracked in CS106. Do **not** close #395 (Rec B outstanding). | "Properly close issues": the shipping fixes' issues auto-closed on merge; #395 is only partially delivered, so it stays open with an accurate release-status note rather than a false close. |

## Deliverables

1. **`package.json` + `package-lock.json`** — `0.16.0 → 0.17.0` (via `harness release`
   Phase A / `npm version --no-git-tag-version`).
2. **`CHANGELOG.md`** — `## [Unreleased]` → `## [0.17.0] — 2026-07-04` (em-dash); fresh
   `## [Unreleased]` skeleton; `[0.17.0]: …/compare/v0.16.0...v0.17.0` link ref;
   `[Unreleased]` link ref updated to compare from `v0.17.0`.
3. **`README.md`** — sweep current-version pins `v0.16.0 → v0.17.0`; rewrite the
   `## Status` paragraph to headline v0.17.0 (batch highlights: `DISPATCH-PREAMBLE.md`
   relocation, new `check-config-placeholders` / `check-workboard-allowlist-consistency`
   linters, `workboard-auto-approve.yml` hardening) and demote v0.16.0 to `Prior:`;
   prior-release narrative paragraphs left at their original versions.
4. **Content PR** (`cs107/content`) with GPT-5.5 rubber-duck review-of-record + Copilot
   engaged + all gates green; admin-squash-merged (solo-orchestrator).
5. **Post-merge:** annotated tag `v0.17.0` on the squash SHA (pushed) + a **published**
   (Latest) GitHub Release with the `[0.17.0]` CHANGELOG notes (`harness release
   --publish … --no-draft`).
6. **Consumer notifications:** idempotent issue-only pin-bump trackers to
   `henrik-me/sub-invaders` and `henrik-me/authzandentitlements`.
7. **Issue reconciliation:** status comment on **#395** (Rec A/C shipped v0.17.0;
   Rec B → CS106); confirm #229/#394 closed.
8. **Close-out** (active → done, WORKBOARD row removed, CONTEXT updated, LEARNINGS filed
   if any).

## User-approval gates

- None gating. Per @henrik-me's explicit directive ("yes, release and properly close
  issues") the release is **fully published** to Latest (not a draft); all steps proceed
  autonomously.

## Exit criteria

- `package.json` = `0.17.0`; CHANGELOG `[0.17.0]` section populated + fresh
  `[Unreleased]`; README pins/Status updated; `harness lint` + full `node --test` green;
  `harness sync --mode=check` no drift.
- Annotated tag `v0.17.0` on the content squash SHA pushed; a single GitHub Release
  **published to Latest** for it (verified; no duplicate).
- Consumer pin-bump issues filed (idempotent) to both consumers.
- #395 status comment posted; #229/#394 confirmed closed.
- CS closed out.

## Risks + open questions

- **Prior release (v0.16.0)** is published to Latest; v0.17.0 layers on the existing
  v0.16.0 tag (`compare/v0.16.0...v0.17.0`) and becomes the new Latest on publish.
- **Async-Copilot gate rerun (LRN-194).** The `read-only-gates` + `copilot-review-attached`
  gates go stale after the async Copilot review; may need a manual `gh run rerun` /
  re-engage per the A5 ordering doctrine.
- **Anchor drift (LRN-101).** Tag the **squash SHA** (via `--pr <n>` authoritative
  check), not the pre-merge branch head.
- **Concurrent CS86** (yoga-ah-c2, close-out pending): WORKBOARD.md edits may need a
  rebase if both PRs land close together; no distributed-surface conflict.

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | rubber-duck (background, yoga-ah) | c87239d4152e | 2026-07-05T03:04:48Z | Go | No findings. Minor bump; 9-CS scope; F6 no v0.17.0 tag/release; #229/#394 closed, #395 open (Rec B→CS106); consumers/flags/publish posture all verified. |

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | yoga-ah |
| Reviewer agent | rubber-duck (orchestrator: yoga-ah) |
| Notes | **Minor** SemVer (v0.16.0 → v0.17.0; bundles 9 `[Unreleased]` CSs). Published to Latest (not draft) per @henrik-me. Independence per REVIEWS § 2.3 — reviewer `gpt-5.5` ≠ implementer `claude-opus-4.8`. Finalized at close-out. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1 — Phase A: `harness release --version 0.17.0 --apply` (bump `package.json`/lock + **update CHANGELOG** `[Unreleased]→[0.17.0]` + link refs; README pin sweep) + README `## Status` rewrite (headline v0.17.0 batch) | planned | yoga-ah | agent-id=yoga-ah \| role=orchestrator \| report-status=pending \| learnings=0 |
| T2 — Content PR: GPT-5.5 review-of-record + Copilot engage + admin-squash-merge | planned | yoga-ah | agent-id=yoga-ah \| role=orchestrator \| report-status=pending \| learnings=0 |
| T3 — Phase B (post-merge): annotated tag `v0.17.0` + **published** (Latest) Release (`--no-draft`) | planned | yoga-ah | agent-id=yoga-ah \| role=orchestrator \| report-status=pending \| learnings=0 |
| T4 — Consumer notifications: issue-only pin-bump to sub-invaders + authzandentitlements | planned | yoga-ah | agent-id=yoga-ah \| role=orchestrator \| report-status=pending \| learnings=0 |
| T5 — Issue reconciliation: #395 status comment (Rec A/C shipped; Rec B → CS106); verify #229/#394 closed | planned | yoga-ah | agent-id=yoga-ah \| role=orchestrator \| report-status=pending \| learnings=0 |
| Independent content review (GPT-5.5) | planned | — | reviewer model ≠ implementer (independence per REVIEWS § 2.3); via `harness review` |
| Close-out: docs + restart state | planned | yoga-ah | Update WORKBOARD.md (remove CS107 row) + CONTEXT.md. |
| Close-out: learnings + follow-ups | planned | yoga-ah | File learnings if any; v0.17.0 published to Latest (not draft). |

## Notes / Learnings

## Plan-vs-implementation review

> _(filled at close-out per the gate)_
