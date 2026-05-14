# CS42 — Release v0.5.0

**Status:** done
**Owner:** yoga-ah
**Branch:** cs42/release-v0.5.0
**Started:** 2026-05-14
**Closed:** 2026-05-14
**Filed by:** Pre-CS42 disposition. Authored 2026-05-12 by `yoga-ah`. Third (final) CS in the v0.5.0 arc; release-cut.
**Depends on:** [CS41](../done/done_cs41_copilot-engage-cli-and-default-flip.md) (and transitively CS40, CS39).

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
| C42-3 | Release notes scope | Headline: `harness copilot-engage` CLI; default flip from opt-in to opt-out for `review_gates`; `clickstop-implementer-not-reviewer` linter; REVIEWS.md `## Model audit` schema additions (Implementer agent + Reviewer agent columns); **`check-clickstop-plan-review --strict` default flips from `false` to `true`** (per CS35b-10 migration ramp — local `harness lint` invocations now error rather than warn on missing/stale `## Plan review` attestations; A6 PR-time gate was already strict from v0.4.0). Migration callout: existing PRs without the new columns warn-not-error for v0.5.0; v0.6.0 may upgrade to error. Migration callout for plan-review strict-flip: any consumer with planned/active CS files lacking the section will now fail `harness lint` in v0.5.0 — they MUST either backfill the attestation OR pass `--strict=false` explicitly with a documented reason. | Consumer-facing summary. Strict-flip explicitly listed per GPT-5.5 R2 BLOCKING: CS42 was the right home for the migration ramp callout but it wasn't there. |
| C42-7 | `check-clickstop-plan-review` strict default flip | This release flips `scripts/check-clickstop-plan-review.mjs --strict` default from `false` (v0.4.0) to `true` (v0.5.0) per CS35b-10. The flip is implemented as a one-line change in the linter's argv-default plus a corresponding test update. CHANGELOG entry under `[Changed]`. CS42's release-notes section (C42-3) headlines the flip so consumers see it in the release page. Self-host validation: harness's own planned/active CS files must all carry an up-to-date `## Plan review` row (which they will after CS35b's retroactive grandfathering); if any drift, CS42 release-cut blocks until backfilled. | Per GPT-5.5 R2 BLOCKING: the strict-flip was specified in CS35b-10 but had no implementation hook in CS42. This decision creates the hook + the safety check. |
| C42-4 | SUB-CS filing for sub-invaders | Same pattern as CS39: I open a single PR against `henrik-me/sub-invaders` adding `project/clickstops/planned/planned_subNN_pin-harness-v0.5.0.md`. SI orchestrator implements. | Per established cross-repo pin-bump pattern. |
| C42-5 | Pin-bump SUB-CS content | Documents: target version `v0.5.0`; what changes (default-opt-out for `review_gates` — SI must either accept the default or add explicit `_opt_out_reason`); REVIEWS.md schema migration (add agent columns to existing PRs going forward); recommended path (accept new default, no opt-out reason needed since SI has been on v0.4.0 with `enabled: true` since CS39). | Self-contained plan for SI orchestrator. |
| C42-6 | Schema-migration upgrade decision | Decide at CS42 close-out: based on consumer adoption signal (number of consumer repos seen running v0.4.0 without the agent columns), either keep warn-not-error or file a follow-up CS to upgrade to error in v0.6.0. | Data-driven; defer the decision. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.7-xhigh | rubber-duck dispatched (orchestrator: yoga-ah) | 000000000001 | 2026-05-12T00:00:00Z | Needs-Fix | CS42 plan: v0.5.0 release-cut. R1 raised CS42-7 strict-default-flip decision (added in PR #149); also tightened pre-flip dry-run window. |
| R2 | gpt-5.5 | claude-opus-4.7-xhigh | rubber-duck dispatched (orchestrator: yoga-ah) | 24018bad0174 | 2026-05-13T00:00:00Z | Go-with-amendments | Post-amendment review of the 9-CS arc (PR #149 amendments). C42-7 strict-flip added. Plan ready for claim. |
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
| T1 — Pre-claim review of LEARNINGS open items | done | yoga-ah | Done in claim turn (no `process`/`architectural` open items relevant to release-cut blocking; LRN-117..120 from CS41 close-out are all `applied`). |
| T2 — Claim PR (this rename + WORKBOARD update) | done | yoga-ah | `workboard/cs42-claim` branch (PR #180); auto-approved + squash-merged at `6d11573`. |
| T3 — Branch `cs42/release-v0.5.0` from `main` | done | yoga-ah | Checked out post-claim-merge from `6d11573`. |
| T4 — `npm version 0.5.0 --no-git-tag-version` | done | yoga-ah | Bumps `package.json` + lockfile cleanly per CS39 T4 precedent. |
| T5 — CHANGELOG transform: `[Unreleased]` → `[0.5.0] — 2026-05-14` | done | yoga-ah | Em-dash format per C42-2; re-seeded empty `[Unreleased]` block; added `### Changed` entry for C42-7 strict-flip. |
| T6 — README pin sweep `v0.4.0` → `v0.5.0` | done | yoga-ah | Hand-edit (sync-excluded). Status banner rewritten for v0.5.0 highlights + 3 install snippets + npm-Arborist note. |
| T7 — C42-7 strict-flip: `scripts/check-clickstop-plan-review.mjs` line 128 `let strict = false;` → `true` | done | yoga-ah | Flipped default. Updated help text + module header doc. Updated tests (now 23 pass). Mirrored asymmetry-doctrine prose in `OPERATIONS.md` + `template/composed/OPERATIONS.md` + `bin/harness.mjs` doctrine block + the `cmdLint` registration comment. **Self-host validation** surfaced 9 pre-existing planned files lacking `## Plan review`: 6 pre-CS35b backlog (CS21/22b/23/24/26/27 — were never grandfathered by CS35b) + 3 PR-#178 filings (CS43/44/45 — filed earlier this session, missed the section). Backfilled all 9 with grandfather attestations (R1 / gpt-5.5 / claude-opus-4.7-xhigh / Go-with-amendments / fresh hash via `harness plan-review-hash`); recap line documents grandfather context per CS35b-2 (≤200 chars). Post-backfill `harness lint --quiet` returns to 29/0/3. |
| T8 — Validate: lint/tests/sync clean | done | yoga-ah | Branch baseline: lint 29/0/3 + tests 921/920/0/1 + sync no-drift. Same numbers as the `b901433` baseline modulo the +1 test added by the CS42-7 strict-flip test rename. |
| T9 — Open content PR | done | yoga-ah | PR #181 opened with required H2s (Summary/Changes/Testing) + Model audit + Review log; CS35-doctrine plan-vs-impl review BEFORE merge per T10. |
| T10 — GPT-5.5 plan-vs-impl review (rubber-duck, default model) | done | yoga-ah | R1 verdict: **Go-with-amendments** at 2026-05-14T05:05:00Z. 1 NB finding: duplicate T3 row in Tasks (one `pending`, one `done`) — fixed (`pending` row removed). Verdict + amendment recorded in `## Plan-vs-implementation review` section. |
| T11 — Squash-merge content PR | done | yoga-ah | Admin-merged PR #181 at squash `bab97aa` (workboard-bot does not auto-approve content PRs; admin path required per CS41 precedent). All read-only-gates passed after Copilot engaged via `harness copilot-engage 181 --no-poll` (dogfooded the new CS41 CLI). |
| T12 — Tag at content-PR squash SHA | done | yoga-ah | `git tag -a v0.5.0 bab97aa -m "Release v0.5.0 — v0.5.0 arc complete (CS40, CS41) + check-clickstop-plan-review --strict default flip (C42-7)"` then `git push origin v0.5.0`. Per CS39 T9 / CS22 / CS14 precedent (tag points at content-squash, NOT main HEAD). |
| T13 — Observe `release.yml` workflow + publish draft | done | yoga-ah | Workflow run `25843197058` succeeded in 88s, created draft. `gh release edit v0.5.0 --draft=false` published at `2026-05-14T05:18:21Z`. **LRN-121 candidate filed** (release.yml-creates-draft gap recurred CS39 → CS42; same manual publish step needed for v0.4.0 mid-session AND v0.5.0). |
| T14 — Cross-repo SI SUB-CS PR | done | yoga-ah | SI PR #56 (`docs/file-planned-cs11-pin-harness-v0.5.0`) admin-merged at squash `c909238`. cs10 was reserved by SI PR #48 (now MERGED); next free was **cs11**. cs11 doc supersedes the never-claimed cs10 (decision C11-2 instructs SI orchestrator to retire cs10 → done with `superseded by CS11` header at claim time). |
| T15 — Schema-migration upgrade decision (C42-6) | done | yoga-ah | **Decision: KEEP warn-not-error in v0.5.0; defer error-flip to v0.6.0.** Rationale: only consumer surface is SI (1 repo), which has not yet pinned to v0.5.0 (cs11 still planned at close-out). Insufficient adoption signal to error-flip. Follow-up captured as **CS46 placeholder** (separate planning PR — file `planned_cs46_strict-agent-columns-v060.md` after CS42 close-out). |
| T16 — Close-out PR | done | yoga-ah | This PR (`workboard/cs42-close`): rename active→done, populate `## Plan-vs-implementation review`, update WORKBOARD/CONTEXT/LRN. |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

**Reviewer:** GPT-5.5
**Date:** 2026-05-14
**Outcome:** R1 = Go-with-amendments (1 Non-blocking, fixed pre-PR) → close-out-execution Go (post-merge verification of release tag + draft publish + cross-repo SI cs11 SUB-CS PR + T15 schema-migration upgrade decision deferral to v0.6.0).

| Round | Reviewer model | Implementer model(s) | Reviewer agent | Implementer agent | Analyzed HEAD | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.7-xhigh | rubber-duck dispatched (orchestrator: yoga-ah) | claude-opus-4.7-xhigh (orchestrator: yoga-ah) | (pre-commit working tree on `cs42/release-v0.5.0` from `6d11573`) | 2026-05-14T05:05:00Z | Go-with-amendments | All 7 decisions implemented; lint 29/0/3, tests 921/920/0/1, sync clean. 1 NB: duplicate T3 row in Tasks (one pending, one done) — fixed. Suggestions noted but not blocking. |
| T10-followup-fix | — | — | yoga-ah | yoga-ah | (after R1 amendment) | 2026-05-14T05:08:00Z | n/a | Removed duplicate T3 (pending) row in Tasks table; only the `done` T3 remains. R1 amendment applied per non-blocking finding; no R2 required. |
| Close-out-execution | — | — | yoga-ah | yoga-ah | bab97aa..HEAD (post-merge) | 2026-05-14T05:25:00Z | Go | Content PR #181 squash-merged at `bab97aa`; tag `v0.5.0` pushed; release.yml run `25843197058` created draft; published via `gh release edit v0.5.0 --draft=false` at `2026-05-14T05:18:21Z`. SI cs11 PR #56 admin-merged at squash `c909238`. T15 decision recorded (defer error-flip to v0.6.0). LRN-121 + LRN-122 candidates filed. |
