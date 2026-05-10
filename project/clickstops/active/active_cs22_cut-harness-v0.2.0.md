# CS22 — Cut harness v0.2.0 (refresh pin target before CS16 bootstrap)

**Status:** active
**Owner:** yoga-ah (HENRIKM-YOGA)
**Branch:** `cs22/cut-v0.2.0`
**Started:** 2026-05-10
**Closed:** —
**Filed by:** Authored 2026-05-10 per user direction. The user observed that CS16's plan currently pins `v0.1.0`, but a substantial commit set has landed on main since CS14 cut `v0.1.0` on 2026-05-04 — including **one BREAKING change** (CS02b dropped top-level `local_blocks`) plus the entire CS15-series (a–f), CS06c, CS08c, CS03d, CS03e. (The audit step in this CS captures the actual count from `git rev-list --count v0.1.0..main` rather than hard-coding it — see C22-2.) Bootstrapping `henrik-me/sub-invaders` on `v0.1.0` would commit it to a stale shape and waste SI-CS03's pin-bump exercise on a single-step jump. CS22 cuts `v0.2.0` so CS16 bootstraps on the latest published harness tag.
**Depends on:** Nothing in flight. CS22 is small + standalone + must close BEFORE CS16 claims (CS16 references the v0.2.0 tag at `harness init` time).

## Goal

Cut a clean `v0.2.0` release that captures every consumer-visible change since `v0.1.0`, refresh `[Unreleased]` to match reality, ship a verifiable GitHub Release, and re-prove the private-smoke path against the new tag.

## Background

- `v0.1.0` was cut on 2026-05-04 (CS14). Since then, the following CSs have closed: CS02b, CS03d, CS03e, CS06c, CS08c, CS15a, CS15c, CS15d, CS15e, CS15f. Some of these are already partly captured in `[Unreleased]` (CS02b BREAKING, CS03d, CS03e); most are not.
- The `[Unreleased]` section in `CHANGELOG.md` is **incomplete relative to the actual surface delta**. CS22's audit step is what brings them into agreement before tagging.
- Per [OPERATIONS.md § SemVer policy](../../../OPERATIONS.md#semver-policy): "Breaking config schema change" → Major bump. However, while pre-1.0 (per [SemVer 2.0.0 §4](https://semver.org/spec/v2.0.0.html#spec-item-4)), Minor bumps are allowed to carry breaking changes. The convention this repo has adopted (visible in OPERATIONS's bump table) treats the v0.x.y line as a single-Minor-per-release-of-meaningful-changes cadence; the breaking `local_blocks` removal lands in v0.2.0, not v1.0.0.
- CS14 already shipped the release machinery: `.github/workflows/release.yml` fires on `v*.*.*` tag pushes; `.github/workflows/private-smoke.yml` exists for tag-pinned consumption verification. CS22 reuses both unmodified.
- This is the first time the release machinery is exercised since CS14. Any latent regression in `release.yml` or `private-smoke.yml` (e.g. from CS15c's CLI changes or LRN-092's `\Z`-vs-lookahead fix) surfaces here, not in CS16 or beyond.
- The breaking change has **no current consumers** (sub-invaders bootstraps AFTER v0.2.0, gwn migration is CS19), so the migration cost of v0.2.0 is paid by no one. Document anyway for future migrations.

## Decisions (CS22-specific)

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C22-1 | Target version | `v0.2.0` | Per OPERATIONS.md SemVer table; one breaking schema change present + multiple feature additions = Minor (in 0.x line; would be Major post-1.0). |
| C22-2 | CHANGELOG audit scope | Every commit on `main` since `v0.1.0` (`git log v0.1.0..main --no-merges`). For each: classify as `already-listed` / `add-Added` / `add-Changed` / `add-Fixed` / `add-Changed-BREAKING` / `no-entry-needed`. Doc-only edits to repo-internal files (LEARNINGS, CONTEXT, WORKBOARD, RETROSPECTIVES, project/clickstops) classify as `no-entry-needed`; user-facing surface edits (template/, lib/, scripts/, bin/, scaffolds/, schemas/, README, .github/workflows/) require an entry. The auditor MUST capture the actual commit count from `git rev-list --count v0.1.0..main` in the report frontmatter and verify the row count in the report matches; do not hard-code the count anywhere in this plan because it drifts every time `main` advances. | The v0.2.0 CHANGELOG block must accurately reflect the published surface; an audit is the only way to be confident given the post-v0.1.0 commit volume (well into the dozens at CS22 filing time). |
| C22-3 | Release-mechanics flow | Reuse CS14's `release.yml` and `private-smoke.yml` unchanged. **Cut sequence (note: tag is on the CONTENT-PR merge SHA, BEFORE the close-out PR is opened):** (1) content PR squash-merges; (2) capture `MERGE_SHA` from the content PR (`gh pr view <cs22-content-pr-num> --json mergeCommit --jq .mergeCommit.oid`); (3) `git fetch origin main && git tag v0.2.0 $MERGE_SHA && git push origin v0.2.0`; (4) wait for `release.yml` to fire; (5) verify GitHub Release exists, is non-draft, has the expected notes; (6) `gh workflow run private-smoke.yml -f ref=v0.2.0`; (7) verify smoke job green; (8) THEN open the close-out PR (which records the release URL + smoke run URL in the close-out summary). | Same path CS14 used for v0.1.0 (CS14 also tagged the content-PR merge SHA, not the close-out merge SHA). If `release.yml` regressed, CS22 catches it before CS16 depends on it. |
| C22-4 | Pin references in repo docs | Sweep README.md and any other doc/template that references `npx -y "github:henrik-me/agent-harness#v0.1.0"` and update to `#v0.2.0`. **Exclude**: historical references (LRNs citing earlier versions, CHANGELOG `[0.1.0]` block, done CS files mentioning v0.1.0 as "the published tag at the time"). | Pinning examples in install docs is the surface that downstream consumers copy-paste; everything else is history and stays as-is. |
| C22-5 | LRN reservation | LRN-100..LRN-103 advisory (re-check at filing per [LRN-086](../../../LEARNINGS.md#lrn-086)). | Generous; a release CS typically surfaces 1–3 LRNs (release-tooling regressions, audit-process surprises). |
| C22-6 | Scope guard | CS22 does **NOT** add new features, fix bugs, or refactor. Audit + CHANGELOG + tag + smoke + doc-pin sweep are the only allowed activities. If the audit surfaces a missing CHANGELOG entry whose underlying commit appears to retro-actively re-classify the SemVer impact (e.g. an undocumented breaking change beyond the known `local_blocks` removal), **STOP and escalate** — do NOT silently fold a behaviour change into the release. | A release CS is the wrong place to fix latent bugs; clean release discipline keeps the audit trail trustworthy. |
| C22-7 | Migration notes | Append a `### Migration: v0.1.0 → v0.2.0` subsection to the new `[0.2.0]` CHANGELOG block. Document the `local_blocks` BREAKING change with exact `harness.config.json` before/after example (`local_blocks[<file>]` → `composed.overrides[<file>].local_blocks`). Document any other consumer-impacting changes the audit surfaces. | Even with no current consumers, the migration notes serve as a checkpoint for the future CS19 migration of gwn. |
| C22-8 | Branch + PR shape | Standard three-PR shape: claim PR (`cs22/claim`) → content PR (`cs22/content`) → close-out PR (`cs22/close-out`). **The tag push happens BETWEEN content-PR squash-merge and close-out-PR open** (per C22-3): orchestrator waits for content-PR merge SHA, tags THAT SHA (not `HEAD`, not the close-out merge SHA), pushes, verifies release fires, verifies smoke green, THEN opens close-out PR. | Matches CS14 precedent (which also tagged the content-PR merge SHA, between content-merge and close-out-PR-open). |

## Deliverables

### Phase 1 — Audit (single sub-agent, in `cs22/content`)

1. **`project/clickstops/active/active_cs22_*/changelog-audit-report.md`** — the canonical artefact. Frontmatter records the gwn-style snapshot data: harness `main` SHA at audit time, `v0.1.0` SHA, audit timestamp, total commit count. Body: one row per commit (table or definition-list), columns: SHA, subject (one-line `git log` format), classification per C22-2, proposed CHANGELOG bullet (if applicable), CHANGELOG section the bullet belongs in (`Added` / `Changed` / `Fixed` / `Changed (BREAKING)`).

### Phase 2 — CHANGELOG + docs (same content PR)

2. **`CHANGELOG.md` edits:**
   - Every "missing-but-needed" entry from the audit appears under the appropriate `### Added` / `### Changed` / `### Fixed` / `### Changed (BREAKING)` heading inside `[Unreleased]`. Existing `[Unreleased]` entries are preserved (unless the audit shows they're duplicated by an entry that should be added).
   - `[Unreleased]` is renamed to `[0.2.0] — <YYYY-MM-DD>` (close-out date, same as the tag-push date).
   - A fresh, empty `## [Unreleased]` block is inserted immediately above the new `[0.2.0]` block.
   - The new `[0.2.0]` block ends with `### Migration: v0.1.0 → v0.2.0` per C22-7.

3. **README + doc-pin sweep** per C22-4. The orchestrator runs `grep -rn "v0.1.0" README.md docs/ template/managed/ template/composed/ .github/workflows/` to enumerate candidates, then edits only the install-snippet references (not historical mentions). The audit report's `## Pin sweep` appendix lists every file touched and every file deliberately skipped.

### Phase 3 — Tag + verify (orchestrator-owned, BETWEEN content-PR merge and close-out-PR open)

4. **Tag + push:**
   - Orchestrator captures the content-PR squash-merge SHA: `MERGE_SHA=$(gh pr view <cs22-content-pr-num> --json mergeCommit --jq .mergeCommit.oid)`.
   - `git fetch origin main && git tag v0.2.0 $MERGE_SHA && git push origin v0.2.0`.

5. **Release verification:**
   - Wait for `release.yml` to complete (poll `gh run list --workflow=release.yml --limit=1`); verify SUCCESS.
   - `gh release view v0.2.0` shows: tag `v0.2.0`, release exists, is non-draft (or matches CS14's draft-by-default behaviour, in which case orchestrator promotes to non-draft after manual notes review).
   - Release notes contain the new `[0.2.0]` CHANGELOG content (the `release.yml` workflow extracts it).

6. **Smoke verification:**
   - `gh workflow run private-smoke.yml -f ref=v0.2.0`.
   - Wait for smoke run to complete; verify SUCCESS.
   - Capture the run URL in the close-out summary.

### Phase 4 — Close-out

7. **`active_cs22_*` → `done_cs22_*` rename** + WORKBOARD/CONTEXT updates per [OPERATIONS.md § Claim](../../../OPERATIONS.md#claim) three-PR shape.

8. **CS16 + CS21 ripple-update reminders** in the close-out summary (NOT a deliverable — just a reminder for the orchestrator that takes CS16/CS21 next):
   - CS16's `Depends on` line should now read `CS22 (v0.2.0 published tag — the pin target)` instead of `CS14 (v0.1.0 ...)`. CS16 was authored against this expectation; the planned file should already reflect it before CS22 starts. Verify at CS22 close-out.
   - CS21's C21-5 references "CS22 — Cut v0.2.0" as the example follow-up CS title. With CS22 closed, the example becomes anachronistic but still readable; no edit forced. The orchestrator should mentally translate to "CS<NN> — Cut harness v0.3.0" when CS21 actually triggers a release follow-up.

## Exit criteria

CS22 close-out is permitted only when **all** the following are true and recorded in the active CS file's `## Plan-vs-implementation review` section:

1. `changelog-audit-report.md` exists with every commit since `v0.1.0` classified (zero unclassified) and a frontmatter SHA snapshot.
2. `CHANGELOG.md` has a `[0.2.0] — <date>` block matching the audit's "missing-but-needed" set + the prior `[Unreleased]` content; a fresh `[Unreleased]` block exists above it; the migration subsection per C22-7 is present.
3. `git tag --list v0.2.0` shows the tag on the content-PR merge SHA.
4. GitHub Release for `v0.2.0` exists, is non-draft, and the release notes contain the `[0.2.0]` CHANGELOG content.
5. `private-smoke` workflow ran with `ref=v0.2.0` and succeeded; run URL recorded.
6. README + every install-snippet doc references `v0.2.0`; the audit report's pin-sweep appendix enumerates touched + skipped files.
7. `node bin/harness.mjs lint --quiet` exits 0 (≥24 pass / 0 fail / 3 skipped — current baseline).
8. `node --test tests/*.test.mjs` exits 0 (full suite green; ~669 tests at baseline).
9. The close-out summary explicitly notes the CS16/CS21 ripple-update items per Phase 4 §8 (so the next orchestrator inherits the context cleanly).
10. CS22-specific LRNs filed: at minimum one `process` LRN about the audit-cadence experience (e.g. "audit cost vs. enforcing CHANGELOG-on-every-CS-close-out"); any incidental LRNs from `release.yml` or `private-smoke.yml` regressions caught.

## Sub-agent fan-out

CS22 is small (single audit + edits + verification chain) and runs as a **single-agent CS** with orchestrator-owned tag/verify steps.

| # | Sub-agent | Owned files |
|---|-----------|-------------|
| 1 | `cs22-changelog-auditor` | `agent-harness:project/clickstops/active/active_cs22_*/changelog-audit-report.md` AND `agent-harness:CHANGELOG.md` (the audit's `[Unreleased]` → `[0.2.0]` rename + missing-bullet additions). The auditor is also authorised to read `git log`, `git show`, `git diff` for any commit in the v0.1.0..main range. |

After Wave A, orchestrator-owned (sequential):
- Run `grep -rn "v0.1.0" README.md docs/ template/managed/ template/composed/ .github/workflows/` for the pin sweep; edit install-snippet references; append the pin-sweep appendix to the audit report.
- Run `harness lint --quiet` + `node --test tests/*.test.mjs` — must both exit 0.
- Open content PR; standard review loop; squash-merge.
- Tag + push + verify release + verify smoke per Phase 3.
- Open close-out PR per Phase 4.

Single-agent briefing must include the standard guards: no-commit preflight per [LRN-021](../../../LEARNINGS.md#lrn-021), schema source-of-truth per [LRN-039](../../../LEARNINGS.md#lrn-039), explicit `--file` per [LRN-032](../../../LEARNINGS.md#lrn-032), `requireValue` per [LRN-040](../../../LEARNINGS.md#lrn-040), canonical preamble verbatim per [LRN-068](../../../LEARNINGS.md#lrn-068), tempdirs in `os.tmpdir()` per [LRN-094](../../../LEARNINGS.md#lrn-094). Plus an explicit reminder of C22-6 (no behaviour changes; STOP and escalate on surprise findings).

## Risks + open questions

- **R1 (medium):** `release.yml` regression. Latent bug in the release workflow surfaces only on tag push. Mitigation: review `release.yml` against any post-CS14 changes BEFORE tagging; if `gh release create` semantics shifted (e.g. `--generate-notes` flag changes), patch in a separate harness CS BEFORE re-tagging. The `release.yml` SHA at v0.1.0 should match its current SHA — quick `git log -- .github/workflows/release.yml` check at audit time.
- **R2 (medium):** `private-smoke` regression. The smoke workflow `npx`-installs the harness from a tag and runs `--help` + `init`. Either CS15c's CLI changes or CS15e's init changes could have broken the smoke flow without CI catching it (smoke is workflow_dispatch + scheduled-weekly, not on every PR). Mitigation: run smoke against `main` (workflow_dispatch with `ref=main`) BEFORE tagging; if it fails, fix in a separate harness CS.
- **R3 (low):** CHANGELOG audit misses a commit (e.g. via `--no-merges` skipping a meaningful merge commit's substance). Mitigation: cross-check the audit's commit count against `git rev-list --count v0.1.0..main` (with and without `--no-merges`); reconcile the diff.
- **R4 (low):** The breaking `local_blocks` change is documented in CHANGELOG but the runtime error message may not point users to the migration notes. Mitigation: at audit time, verify `lib/composed.mjs` (or wherever the schema rejection happens) emits an error that mentions the new shape; if not, file as a learning candidate (NOT a CS22 fix — separate CS).
- **R5 (low):** Tag pushed to wrong SHA (e.g. orchestrator tags `main` HEAD instead of the **content-PR merge SHA**, picking up un-released or post-content-merge commits). Mitigation: per C22-3 + C22-8, explicitly capture `MERGE_SHA` from `gh pr view <cs22-content-pr-num> --json mergeCommit --jq .mergeCommit.oid` and tag THAT SHA, not `HEAD` and not the close-out merge SHA.
- **R6 (low):** OPERATIONS.md SemVer policy table says breaking changes → Major. We're calling this Minor (v0.2.0). Mitigation: SemVer 2.0.0 §4 explicitly carves out the 0.x line (anything goes); add a one-line note to the migration subsection acknowledging the convention. Alternatively, CS22 can revise the OPERATIONS.md table to clarify the 0.x carve-out — **but per C22-6 this is a behaviour-doc change**, so file it as a follow-up CS unless the user says otherwise at claim time.

- **OQ1:** Should CS22 also bump `package.json:version` from `0.1.0` to `0.2.0`? **Default assumption:** yes — `package.json:version` should track the published tag (consumers reading `npm pack` metadata expect agreement). The audit report includes `package.json` in the pin sweep; the auditor edits it as part of Phase 2.
- **OQ2:** Should the OPERATIONS.md SemVer table get the 0.x carve-out clarification in CS22? **Default assumption:** no (per R6 mitigation above; C22-6 says no behaviour-doc changes). If the orchestrator flags it as visible enough to be worth folding in, escalate at content-PR review time.

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| Workboard claim PR (rename planned→active, update WORKBOARD active/queued tables) | done | yoga-ah | this PR (`workboard/cs22-claim`) |
| Branch `cs22/cut-v0.2.0` from main | pending | yoga-ah | after claim PR merges |
| Phase 1: dispatch `cs22-changelog-auditor` sub-agent — produce `audit-report.md` (per C22-2 + C22-7) capturing actual `git rev-list --count v0.1.0..main` count, full commit list with subject + classification, gap-analysis vs `[Unreleased]`, pin-sweep target list | pending | yoga-ah | sub-agent owns audit; orchestrator reviews |
| Phase 2: write CHANGELOG.md `[0.2.0]` section + sweep doc-pin references from v0.1.0 → v0.2.0 (README + docs/private-consumption.md + examples/sub-invaders.harness.config.json + package.json) per audit pin-sweep list | pending | yoga-ah | orchestrator-owned (small surface) |
| Phase 2: run `harness lint --quiet` + `node --test tests/*.test.mjs` + `harness sync --mode=check` — must all exit 0 | pending | yoga-ah | baseline 24/0/3 lint, 669/669 tests |
| Phase 2: open content PR `cs22/cut-v0.2.0`; address GPT-5.5 local-review findings; squash-merge | pending | yoga-ah | capture content-PR `MERGE_SHA` via `gh pr view <pr> --json mergeCommit --jq .mergeCommit.oid` |
| Phase 3: pre-tag verification — `gh workflow run private-smoke.yml --ref main` succeeds; review `release.yml` for any post-CS14 SHA changes | pending | yoga-ah | per R1+R2 mitigations |
| Phase 3: tag content-PR merge SHA — `git tag v0.2.0 <MERGE_SHA>` then `git push origin v0.2.0`. **NOT** `HEAD`; **NOT** the close-out merge SHA. Per C22-3 + C22-8 + R5. | pending | yoga-ah | tag-after-content-merge-before-close-out discipline (CS14 precedent) |
| Phase 3: verify `release.yml` fired and produced a draft GitHub Release for v0.2.0; verify `private-smoke.yml` against the new tag green | pending | yoga-ah | per exit criterion 7 |
| Local review (GPT-5.5) of content PR | pending | yoga-ah | mandatory per OPERATIONS.md § Local review |
| Plan-vs-implementation review (GPT-5.5 close-out gate) | pending | yoga-ah | mandatory per OPERATIONS.md § Plan-vs-implementation review (close-out gate) |
| Close-out: docs + restart state (rename active→done; update WORKBOARD active row → Recently Completed; CONTEXT.md current-state prose) | pending | yoga-ah | close-out PR `cs22/close-out` |
| Close-out: learnings + follow-ups (LRN entries reserved 100..103 per C22-5; file what's actually surfaced; reconcile LRN-100 if the workflow-trigger fix is folded in) | pending | yoga-ah | close-out PR; reservation may underflow — only file what surfaces |

## Plan-vs-implementation review

_(Populated at close-out per [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate). Reviewer = GPT-5.5 rubber-duck or fallback per OPERATIONS.md.)_
