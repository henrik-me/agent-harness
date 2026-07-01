# CS80 — Single release creator: the verb owns releases; delete `release.yml`

**Status:** active
**Owner:** omni-ah-c2
**Branch:** cs80/content
**Started:** 2026-07-01
**Closed:** —
**Filed by:** `omni-ah-c2` (Claude Opus 4.8) on 2026-07-01, at @henrik-me's request ("go with option B, there should only be one thing that does the release"). The `harness release` verb (CS67) and `.github/workflows/release.yml` (CS14, pre-verb) both create a GitHub Release for a pushed tag ([LRN-175](../../../LEARNINGS.md#lrn-175)); CS79 mitigated the resulting double-draft by guarding the workflow (Option A). @henrik-me chose the **structural** fix (Option B, refined): make the **verb the single release creator** and **delete `release.yml`**. Because `release.yml` is **self-host-only** (never shipped to consumers), consumers *already* use the verb as their sole creator — so deleting `release.yml` makes the harness self-host **consistent** with every consumer, rather than shipping a workflow to everyone (the discarded B1 alternative).
**Depends on:** **CS77** (`6ccc284` — discovered LRN-175) and **CS79** (`9171ca6` — the Option-A guard this CS supersedes). No hard code dependency. **No `lib/release.mjs` change** — the verb already creates the release; this CS only removes the redundant second creator.

## Goal

Make `harness release` the **single** thing that creates a GitHub Release, everywhere, by **deleting `.github/workflows/release.yml`** (its only job is release creation, which the verb already does) and its `tests/cs14-release-workflow.test.mjs`. After CS80: a verb cut in the harness self-host produces exactly one release from exactly one creator (the verb) — identical to how consumers already behave (they have no `release.yml`); no duplicate-draft can occur; and the CS79 guard is gone with the workflow. The `lib/release.mjs` verb is unchanged. Docs are updated so the manual (non-verb) fallback creates the release by hand (`gh release create --draft`) rather than relying on the deleted workflow.

## Background

**State-of-the-world probes ([REVIEWS.md § 2.6c F6](../../../REVIEWS.md)).** Probed 2026-07-01 by `omni-ah-c2`:

```text
$ ls .github/workflows/*.yml  # which are tag-triggered?
release.yml → tag-triggered (on push tags v*.*.*)   ← the ONLY tag-triggered workflow
harness-checks / harness-drift / pr-evidence-lint / review-gates / secret-scan /
validate-schemas / workboard-auto-approve / npm-pack-dry-run / private-smoke /
harness-self-check(*) → NOT tag-triggered

$ grep -l 'release' infra/*.json   # is release.yml a required status check?
(no output — release.yml is NOT a required status check in the branch ruleset)

$ ls template/**/release.yml ; grep release.yml harness.config.json
(empty — release.yml is NOT a shipped consumer template)
```

So `release.yml` is the only tag-triggered workflow, is not a required merge check, and is not shipped to consumers — deleting it removes only the redundant self-host release-creator. Current-state references to `release.yml` (to update): `bin/harness.mjs` release help, `OPERATIONS.md` (+ `template/composed/OPERATIONS.md`) § Release process steps 9–10 + caveats + probes, `template/composed/INSTRUCTIONS.md` (+ root), and `CHANGELOG.md`. Historical `done_cs*/` records and the `template/composed/REVIEWS.md` past-incident example (F6, "auto-created by `release.yml`") are **left as-is** (accurate historical narrative).

**Why B2, not B1.** "One creator" can mean the workflow (B1) or the verb (B2). B1 (verb defers to `release.yml`) would require **shipping `release.yml` to every consumer** as a managed template and would break any consumer that lacks it. B2 (the verb) requires no new template, works in every repo, and — since consumers already have no `release.yml` — makes the harness self-host match them. The verb is the portable, shipped tool actually used to cut releases (v0.10.0 was), so it is the natural single creator.

**What the verb already does (unchanged).** `lib/release.mjs` `publishRelease` Phase B verifies the SHA, creates + pushes the annotated tag, then `gh release create <tag> --verify-tag --draft` (draft-by-default, LRN-121; human publishes at the G-publish gate) and files issue-only consumer notifications. With `release.yml` gone, its own `gh release view` idempotency probe still guards re-runs, and nothing else races it. The v0.10.0 cut already proved the verb creates the release itself (its draft `id=347664859` existed before `release.yml`'s duplicate).

**Manual fallback change.** OPERATIONS § Release process documents a manual fallback (no verb). Today step 9 pushes the tag and `release.yml` drafts; step 10 publishes that draft. With `release.yml` deleted, the manual fallback must create the release by hand: after pushing the tag, `gh release create <tag> --draft --notes-file <CHANGELOG [x.y.z]>`, then `gh release edit <tag> --draft=false`. The verb path is unaffected (it creates the release directly).

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C80-1 | Which "one thing" | **B2 — the verb is the single release creator; delete `release.yml`.** NOT B1 (verb defers to a shipped-everywhere `release.yml`). | Consumers already use the verb as their only creator (no `release.yml` shipped); B2 makes the harness self-host consistent with no new template and no consumer breakage. @henrik-me chose B2. |
| C80-2 | Delete scope | `git rm .github/workflows/release.yml` **and** `git rm tests/cs14-release-workflow.test.mjs` (the latter tests only the deleted workflow). | The workflow's sole function is release creation, now the verb's job; its test has nothing left to assert. Verb behavior is covered by `tests/lib-release.test.mjs` (unchanged). |
| C80-3 | Verb unchanged | **No `lib/release.mjs` / `bin/harness.mjs` `cmdRelease` logic change.** The verb already creates the release; CS80 only removes the second creator. This **supersedes** the CS79 guard (which lived inside the deleted workflow). | Keeps the change minimal + the verb's equivalence proof intact; the guard is moot once no second creator exists. |
| C80-4 | Doc updates (current-state only) | Update: (a) `bin/harness.mjs` release help — drop the "a verb-created tag may also trigger `release.yml`… re-check for duplicate drafts" note; (b) `OPERATIONS.md` **and** `template/composed/OPERATIONS.md` (byte-equal) § Release process — the verb-note caveat, the "stale duplicate drafts from `release.yml`" probe wording, and manual steps 9–10 (manual fallback now `gh release create` by hand); (c) `INSTRUCTIONS.md` **and** `template/composed/INSTRUCTIONS.md` (byte-equal) — the "push to trigger `release.yml` draft creation" line; (d) `.github/workflows/private-smoke.yml` — remove the `- '.github/workflows/release.yml'` line from its `paths:` filter (it would reference a deleted file); (e) `CHANGELOG.md` — the **CS79 `[Unreleased]` `### Fixed` entry** (which currently claims `release.yml` "still creates" manual releases) is **superseded** by CS80: replace it with the CS80 entry (Deliverable 5), since the CS79 guard is in the unreleased window and never shipped. **Leave** historical `done_cs*/` files, the shipped `CHANGELOG.md` `[0.10.0]`/earlier entries, and the `template/composed/REVIEWS.md` past-incident F6 example (accurate history). | Current-state docs must stop implying `release.yml` exists / auto-creates; the private-smoke path-filter would dangle; the unreleased CS79 entry would contradict the deletion. Historical narrative is accurate as-is; byte-equal edits keep the composed mirrors drift-free. |
| C80-5 | Manual fallback | Document that a manual (non-verb) cut now creates the release explicitly: push the annotated tag, **extract the `CHANGELOG.md` `[x.y.z]` section to a file** (e.g. `awk '/^## \[x.y.z\]/{f=1;print;next} f&&/^## \[/{exit} f' CHANGELOG.md > notes.md`), then `gh release create <tag> --draft --notes-file notes.md`, then `gh release edit <tag> --draft=false`. | With no workflow to auto-draft, the manual path must create the release; `--notes-file` needs a real file, so the CHANGELOG section is extracted first (mirroring what `release.yml` did internally). |
| C80-6 | New learning | File **LRN-176** (`single release creator`): the verb owns releases; `release.yml` deleted as the redundant pre-verb creator; supersedes the CS79 Option-A guard. Add a one-line supersession note to LRN-175's Disposition. | Records the architecture decision + the CS79→CS80 evolution for future release CSs. |
| C80-7 | Risk + reviewer + PR shape | **Standard risk** (removes a redundant creator; no irreversible artifact — validated on the next cut). GPT-5.5 rubber-duck + Copilot; reviewer `gpt-5.5` ≠ implementer `claude-opus-4.8`; NOT added to `reviews.high_risk_clickstops`. Standard **3-PR** lifecycle (`cs80/claim` → `cs80/content` → `cs80/close-out`) + this filing PR; solo-orchestrator content merge = admin-merge. | Canonical shape; the deletion's correctness is by construction (the verb is the sole remaining creator) + validated on the next release. |

## Deliverables

1. **`.github/workflows/release.yml` deleted** and **`tests/cs14-release-workflow.test.mjs` deleted** (C80-2).
2. **`bin/harness.mjs`** release help — the `release.yml` duplicate-draft note removed (C80-4a).
3. **`OPERATIONS.md` + `template/composed/OPERATIONS.md`** (byte-equal) — verb-note caveat + stale-duplicate probe wording + manual steps 9–10 updated to reflect a deleted `release.yml` and a manual `gh release create` fallback (C80-4b/C80-5).
4. **`INSTRUCTIONS.md` + `template/composed/INSTRUCTIONS.md`** (byte-equal) — the "trigger `release.yml` draft creation" line updated (C80-4c); **and `.github/workflows/private-smoke.yml`** — the `- '.github/workflows/release.yml'` line removed from its `paths:` filter (C80-4d).
5. **`CHANGELOG.md`** — the CS79 `[Unreleased]` `### Fixed` entry (release.yml guard) **replaced** by the CS80 entry (net: `release.yml` deleted; the verb is the sole release creator), since the CS79 guard is in the unreleased window and never shipped (C80-4e).
6. **[LRN-176](../../../LEARNINGS.md) filed** + LRN-175 Disposition supersession note (C80-6).
7. **Validation green** — `node bin/harness.mjs lint --quiet` (0 failed), `node --test tests/*.test.mjs` (0 failed; the deleted cs14 test drops out of the glob), `node bin/harness.mjs check` (no drift; OPERATIONS + INSTRUCTIONS copies byte-equal).
8. **Local review** — GPT-5.5 rubber-duck (mandatory) + Copilot; recorded in the content PR body's `## Model audit` + `## Review log` (C80-7).
9. **This planned file** — `## Plan review` ≥1 `Go` row; renamed `planned → active` at claim, `active → done` at close-out.
10. **Close-out** — `WORKBOARD.md` CS80 row removed + **CS65 resumed**; `CONTEXT.md` updated; `## Plan-vs-implementation review` **GO** before the rename.

## User-approval gates

- **Gate A — which single creator.** Resolved: @henrik-me chose **B2** (the verb; delete `release.yml`) over B1 (ship `release.yml` to all consumers), given `release.yml` is self-host-only and consumers already use the verb as their sole creator.

## Exit criteria

1. `.github/workflows/release.yml` and `tests/cs14-release-workflow.test.mjs` no longer exist; no tag-triggered workflow remains (`grep -l 'tags:' .github/workflows/*.yml` → none matching `v*`).
2. No **current-state** doc implies `release.yml` exists or auto-creates a release: `bin/harness.mjs` help, both `OPERATIONS.md` copies, both `INSTRUCTIONS.md` copies, and `.github/workflows/private-smoke.yml`'s `paths:` filter updated; the `CHANGELOG.md` CS79 `[Unreleased]` entry is replaced by the CS80 entry. (Historical `done_cs*/`, shipped `[0.10.0]`/earlier CHANGELOG entries, + REVIEWS F6 example intentionally retained.)
3. `node bin/harness.mjs lint --quiet` and `node --test tests/*.test.mjs` exit 0; `node bin/harness.mjs check` = no drift (byte-equal composed mirrors).
4. LRN-176 filed; LRN-175 Disposition notes the CS80 supersession.
5. `lib/release.mjs` is unchanged (`git diff` shows no `lib/` change).
6. The content-PR PVI returns **GO** (GPT-5.5), recorded before the `active → done` rename.

## Risks + open questions

- **R1 — Deleting the workflow leaves manual (non-verb) tag pushes with no auto-release.** Accepted + documented (C80-5): releases go through the verb; a manual cut now runs `gh release create` by hand. Low impact — the harness cuts releases via the verb (v0.10.0 did).
- **R2 — Doc byte-equality (OPERATIONS + INSTRUCTIONS).** Edit each root + `template/composed/` pair identically; `harness check` enforces it.
- **R3 — Dangling historical `release.yml` mentions.** The `done_cs*/` records and the REVIEWS F6 example are past-tense/historical and remain accurate; only current-state instructions are updated (C80-4). No linter scans them for this (genericity linter covers the 5 onboarding docs, not OPERATIONS/REVIEWS narrative).
- **OQ1 — Keep a minimal `release.yml` (e.g., tag-format validation only) instead of deleting?** No — its only purpose was release creation; a validation-only workflow adds maintenance for no benefit. Delete.

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: omni-ah-c2) | 6a8a73838446 | 2026-07-01T22:04:00Z | Go-with-amendments | B2/no-lib-change sound; missed refs: `private-smoke.yml` release.yml path-filter + the unreleased CS79 CHANGELOG entry; clarify manual `--notes-file`. |
| R2 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: omni-ah-c2) | 5d7c8a350c95 | 2026-07-01T22:10:00Z | Go | R1 fixes verified (private-smoke, CS79-CHANGELOG-entry supersession, `--notes-file` extraction); no current-state release.yml ref still missed. |

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | omni-ah-c2 |
| Reviewer agent | rubber-duck (orchestrator: omni-ah-c2) |
| Notes | Planned ledger (finalized at close-out). Standard risk (C80-7); NOT in `reviews.high_risk_clickstops`. Delete `release.yml` + its test + doc updates; **no `lib/` change**. Supersedes CS79's Option-A guard. Independence per REVIEWS § 2.3 — reviewer `gpt-5.5` ≠ implementer `claude-opus-4.8`. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1 — `git rm` `.github/workflows/release.yml` + `tests/cs14-release-workflow.test.mjs` (C80-2) | pending | omni-ah-c2 | Verify no tag-triggered workflow remains. |
| T2 — Doc updates: bin help + both OPERATIONS copies (steps 9–10 + caveats + probe, byte-equal) + both INSTRUCTIONS copies (byte-equal) + `private-smoke.yml` paths-filter + replace the CS79 `[Unreleased]` CHANGELOG entry with the CS80 entry (C80-4/C80-5) | pending | omni-ah-c2 | `harness check` no drift. Leave historical done_cs*/REVIEWS + shipped CHANGELOG entries. |
| T3 — File LRN-176 (single release creator) + LRN-175 Disposition supersession note (C80-6) | pending | omni-ah-c2 | status applied (structural fix landed). |
| T4 — Validate (`harness lint --quiet`, `node --test`, `harness check`); GPT-5.5 rubber-duck + Copilot; content PR → admin-merge (C80-7) | pending | omni-ah-c2 | Reviewer gpt-5.5 ≠ implementer claude-opus-4.8. |
| Close-out: docs + restart state — rename active→done; WORKBOARD (remove CS80, resume CS65) + CONTEXT; `sync --mode=check` clean | pending | omni-ah-c2 | Mandatory close-out row. |
| Close-out: learnings — LRN-176 finalized; follow-ups | pending | omni-ah-c2 | Notes the CS79→CS80 evolution. |

## Notes / Learnings

- _(populated at close-out)_

## Plan-vs-implementation review

> _(filled at close-out per the gate)_
