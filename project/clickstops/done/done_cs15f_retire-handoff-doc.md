# CS15f — Retire HANDOFF.md and consolidate into INSTRUCTIONS / OPERATIONS / README

**Status:** done
**Owner:** yoga-ah
**Branch:** cs15f/retire-handoff-doc (content @ `991622c` + R1 fixup `a71f87c`); cs15f/plan-vs-impl-fixups (R1.5 fixups @ `e469f99`); cs15f/close-out (this PR)
**Started:** 2026-05-10
**Closed:** 2026-05-10
**Filed by:** Orchestrator review during pre-CS16 doc-state audit (post-CS06c+CS08c). User stated preference: "it is preferred to be able to kick things off from instructions and no special handoff doc needed, it should be possible to follow normal instructions on active work (workboard), and CS's to figure out what is next etc."
**Depends on:** CS06c, CS08c (both done; pre-CS16 cleanup theme).

## Goal

Eliminate `HANDOFF.md` as a separate bootstrap doc by migrating the genuinely-unique content into the canonical process docs (`INSTRUCTIONS.md`, `OPERATIONS.md`, `README.md`, `.github/copilot-instructions.md`), then `git rm HANDOFF.md`. After this CS, a fresh agent or human picks up the repo via `INSTRUCTIONS.md` (already the canonical entry door per `.github/copilot-instructions.md`) — no separate handoff doc.

## Background

`HANDOFF.md` was authored as a bootstrap / restart guide for a new orchestrator. Audit during the pre-CS16 doc-state review (after CS06c + CS08c closed today) showed it is ~95% duplication of content that already lives in `INSTRUCTIONS.md`, `OPERATIONS.md`, `CONTEXT.md`, and `README.md`:

| HANDOFF.md section | Already covered in… | Migration |
|---|---|---|
| Starter prompt (CLI copy-paste) | Nowhere | Move to `README.md` as a small `## Starting an agent session` snippet |
| Prerequisites | `README.md ## Installation` (partial) | Add missing bits (Python optional, `npm ci` for js-yaml) to README |
| Bootstrap sanity check (6 commands) | `INSTRUCTIONS.md ### Session Start` (concept exists, commands don't) | Add the 6 commands as a fenced bash block in Session Start (in the `template/managed/INSTRUCTIONS.md` template, since that file is `managed`) |
| Stop rules | `OPERATIONS.md` | Delete (cross-referenced) |
| TL;DR — reading order | `INSTRUCTIONS.md ## Quick Reference Checklist` | Delete |
| Persistent memory layout | `README.md ## Repo layout` (partial) | Extend Repo layout with the per-path-purpose table |
| Standard CS lifecycle | `OPERATIONS.md ## Claim`/`Dispatch`/etc. + `.github/copilot-instructions.md ## Per-CS loop` | Delete (pure duplication) |
| Critical conventions (LRN list) | `INSTRUCTIONS.md` + `LEARNINGS.md` itself | Delete (goes stale every CS) |
| Reviewer | `REVIEWS.md` | Delete |
| Verification before declaring CS done | `INSTRUCTIONS.md ### Closing a CS` + `OPERATIONS.md` | Delete |
| Common pitfalls | Mapped 1:1 to LRN entries | Delete (already cross-linked from LRNs) |
| Open-LRN audit | Nowhere as recipes | Move grep recipes to `OPERATIONS.md ## Harvest` (in `template/composed/OPERATIONS.md`) |
| Where to ask the human | `OPERATIONS.md` | Delete |
| Current mainline state | `CONTEXT.md ## Codebase state` (better, more current) | Delete (smoking gun for retirement: maintaining it in two places caused chase-the-tail churn during CS06c/CS08c close-out) |
| Parallelism | `CONTEXT.md ## Parallelism` | Delete |

The risk of NOT doing this CS: every future CS close-out has a chance of leaving HANDOFF.md's "Current mainline state" section stale, the way it almost did today before catching it. The risk of doing this CS: minimal — `HANDOFF.md` is a project-owned root doc (file class `D2` per CS11; excluded from `harness sync` per `harness.config.json:60`); deleting it does not affect runtime behaviour, schemas, lib code, or tests.

## Deliverables

- [x] `template/managed/INSTRUCTIONS.md` — `### Session Start` extended with a fenced bash block of the 6 bootstrap sanity-check commands (`git pull`, `git status --short`, `git log -3 --oneline`, `git tag --list 'v*' | tail -5`, `node --test tests/*.test.mjs`, `node bin/harness.mjs lint --quiet`, `node bin/harness.mjs sync --mode=check --cwd .`). Existing prose preserved; commands added as the concrete recipe.
- [x] `template/composed/OPERATIONS.md` — `## Harvest` extended with a small "Open-LRN audit" subsection containing the two grep recipes from HANDOFF.md (status distribution count + open-entry IDs).
- [x] `README.md` (project-owned, root) — `## Repo layout` extended with the per-path-purpose memory-layout table (`CONTEXT.md`, `WORKBOARD.md`, `LEARNINGS.md`, `ARCHITECTURE.md`, `project/clickstops/{active,planned,done}/`, `template/{managed,composed,seeded}/`); `## Starting an agent session` new subsection with the starter prompt snippet (rewritten to point at INSTRUCTIONS.md, not HANDOFF.md). Template rows added in plan-vs-impl-fixups PR #108 after R1.5 review noted them missing.
- [x] `harness.config.json` — remove `"HANDOFF.md"` from the `excluded` array (line 60).
- [x] `CONTEXT.md` — remove the `> **🆕 New orchestrator picking this up?**` callout (line 5) that points at HANDOFF.md; replace with a one-liner pointing at `INSTRUCTIONS.md`. Also fix the `## Parallelism` paragraph at line 90 that references HANDOFF.md § Parallelism. R1 fixup additionally rephrased two CONTEXT.md current-state prose mentions (lines 3, 62) per local-review gate.
- [x] `project/clickstops/planned/planned_cs22b_multi-orchestrator-coordination.md` — update the 4 references to HANDOFF.md (lines 8, 50, 64, 77) to point at the new homes (CONTEXT.md § Parallelism + OPERATIONS.md as appropriate).
- [x] Root `OPERATIONS.md` (composed) — line 44 reference to `HANDOFF.md` updated; corresponding fix in `template/composed/OPERATIONS.md` so they stay in sync via `harness sync`.
- [x] Re-run `harness sync --mode=apply --resolved-sha $(git rev-parse HEAD) --cwd .` after the content commit (per LRN-070 / LRN-074 ordering trap) so `.harness-lock.json` reflects the template changes.
- [x] `git rm HANDOFF.md`.
- [x] All linters pass (24/0/3 unchanged); `harness sync --mode=check` shows no drift; full test suite still passes (669/669 — no test count change expected).
- [x] Historical references in `project/clickstops/done/done_cs03d_template-prose-hash.md` and `project/clickstops/done/done_cs11_self-host*.md` are NOT modified (they are historical record). Plan-vs-impl-fixups PR #108 retargeted one stale operational pointer in `done_cs15e_init-private-tier-detection.md:13` (line 13 RESUME POINT) per R1.5 review; line 184 historical task ledger mention preserved as accurate history.

## Exit criteria

- `HANDOFF.md` is deleted from the repository at the post-merge HEAD.
- `node bin/harness.mjs lint --quiet` exits 0; row count stays at 24/0/3.
- `node bin/harness.mjs sync --mode=check` reports "No drift detected."
- `node --test tests/*.test.mjs` passes; count unchanged at 669.
- `grep -rn 'HANDOFF\.md' .` returns ONLY: (a) the historical references in `done_cs03d_*.md` / `done_cs11_*.md` / `done_cs15a_*.md`, (b) the LEARNINGS.md historical mention in LRN-077 evidence, and (c) zero references in any active orchestrator-facing process doc (`INSTRUCTIONS.md`, `OPERATIONS.md`, `README.md`, `CONTEXT.md`, `WORKBOARD.md`, `.github/copilot-instructions.md`, root or template).
- The CS15f close-out file lists this CS as "the smoking gun was the CS06c/CS08c close-out cycle: `Current mainline state` was duplicated in CONTEXT.md and HANDOFF.md, and updating one without the other caused observable churn (PR #105, opened then closed unmerged)."

## Sub-agent fan-out

Single-CS scope; orchestrator-owned. Scope is too narrow to benefit from fan-out (5 small files; sequencing is `template edits → root file edits → sync lock fixup → git rm`; fan-out would race on `.harness-lock.json`). Per [LRN-016](../../../LEARNINGS.md#lrn-016), single-owner is the safest model here.

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| Edit `template/managed/INSTRUCTIONS.md` § Session Start (add 6-command bash block) | done | yoga-ah | content commit `991622c` |
| Edit `template/composed/OPERATIONS.md` § Harvest (add Open-LRN audit subsection) | done | yoga-ah | content commit `991622c` |
| Edit `README.md` § Repo layout (add memory-layout table) + new § Starting an agent session | done | yoga-ah | content commit `991622c`; template rows added in fixup commit `e469f99` after R1.5 review |
| Edit `harness.config.json` (remove HANDOFF.md from excluded) | done | yoga-ah | content commit `991622c` |
| Edit `CONTEXT.md` (remove HANDOFF callout + parallelism cross-ref) + edit `template/composed/OPERATIONS.md` line 44 reference | done | yoga-ah | content commit `991622c`; current-state prose rephrased in R1 fixup commit `a71f87c` |
| Edit `planned_cs22b_*.md` (4 refs) | done | yoga-ah | content commit `991622c` |
| Run `harness sync --mode=apply --resolved-sha … --cwd .` to refresh lock + propagate template edits | done | yoga-ah | content commit `991622c` (6 changes applied, `.harness-lock.json` refreshed) |
| `git rm HANDOFF.md` | done | yoga-ah | content commit `991622c` |
| Local review (GPT-5.5) | done | yoga-ah | gpt-5.5 code-review agent `cs15f-local-review`; initial NEEDS-FIX (2 stale CONTEXT.md HANDOFF refs at lines 3 + 62) → fixed in `a71f87c` → re-validated GO |
| Plan-vs-implementation review (GPT-5.5 close-out gate) | done | yoga-ah | gpt-5.5 code-review agent `cs15f-plan-vs-impl`; initial NEEDS-FIX (stale `done_cs15e:13` HANDOFF pointer + missing template rows in README per-path table) → fixed in `e469f99` → re-validated GO. See `## Plan-vs-implementation review` below. |
| Close-out: docs + restart state (WORKBOARD active→done row, CONTEXT.md if changed) | done | yoga-ah | this PR (cs15f/close-out) |
| Close-out: learnings + follow-ups (LEARNINGS.md entry on duplicate-state-doc anti-pattern, planned CSs filed if any) | done | yoga-ah | LRN-098 filed (status-doc duplication anti-pattern); LRN-099 filed (temp scratch files in repo root caught by file-class linter — observed during R1.5 fixup work) |

## Notes / Learnings

- Surfaced during pre-CS16 doc audit. The trigger was almost-merging PR #105 (a HANDOFF.md "Current mainline state" refresh after CS06c/CS08c closed) and realising the section is structurally identical to CONTEXT.md `## Codebase state` — i.e. we maintain CS-completion bookkeeping in two places, and forget one half the time.
- Anticipated LRN: **`status-doc duplication anti-pattern`** — orchestrator-facing process docs (HANDOFF/INSTRUCTIONS/OPERATIONS/CONTEXT/README) MUST have a single canonical home for each piece of content. Recurring "Current mainline state"-style sections must live in CONTEXT.md only; bootstrap reading order in INSTRUCTIONS.md only; lifecycle procedure in OPERATIONS.md only. Bootstrap docs that re-summarise other docs accumulate stale duplicates and create churn at every CS close.
- The starter prompt is intentionally moved to `README.md` (project-owned, not synced) rather than `.github/copilot-instructions.md` (managed template) — the starter prompt is for HUMANS opening a fresh agent session, not for the agent's system prompt. README is the natural entry point for repo-onboarding.

## Plan-vs-implementation review

**Reviewer:** GPT-5.5 (`cs15f-plan-vs-impl` code-review agent)
**Date:** 2026-05-10
**Outcome:** GO (after R1.5 fixups merged via PR #108 commit `e469f99`)

Per LRN-064 mandatory close-out gate.

**Initial verdict:** NEEDS-FIX. Two plan-coverage issues:

1. **Stale HANDOFF.md operational pointer survived.** `project/clickstops/done/done_cs15e_init-private-tier-detection.md:13` — RESUME POINT at the top of that done CS still said "See `WORKBOARD.md` and `HANDOFF.md` for the next CS to claim." This was operationally misleading post-CS15f (HANDOFF.md no longer exists). Not in the plan's allowed-historical list (which named `done_cs03d_*.md`, `done_cs11_self-host*.md`, `done_cs15a_*.md`, LRN-077 evidence). Reviewer correctly treated as a real exit-criteria miss.
2. **README per-path purpose table missing template rows.** Plan deliverable explicitly called for `template/{managed,composed,seeded}/` rows in the new Repo-layout table; content PR #107 added the table but only covered `template/` collectively in the tree above it.

**Fixes:** Plan-vs-impl-fixups PR #108 (commit `e469f99`):
- Retargeted `done_cs15e:13` from HANDOFF.md → INSTRUCTIONS.md. Line 184 historical task ledger row preserved as accurate history (it describes work done at the time CS15e closed, when HANDOFF.md was an active doc).
- Added 3 template rows to the README per-path table.

**Re-validated:** lint 24/0/3, sync no drift, 669/669 tests, no live HANDOFF.md references in any active prose doc.

**Final verdict:** GO. All 10 numbered focus areas PASS:
1. Bootstrap entry door integrity — PASS (`.github/copilot-instructions.md` → `INSTRUCTIONS.md` → Session Start sanity block).
2. Single source of truth — PASS (no new duplication introduced; each piece of content has one canonical home).
3. Cross-link integrity — PASS (only allowed historical refs + `## Handoff` H2 in OPERATIONS.md which is a different topic).
4. `harness.config.json` + sync-lock coherence — PASS.
5. Composed-template scope — PASS (template-edit + `harness sync apply` propagated to root, not direct-edit at root).
6. No stray HANDOFF refs in active prose — PASS (after R1 fixup `a71f87c` and R1.5 fixup `e469f99`).
7. `planned_cs22b` coherence — PASS (4 refs rewritten; plan still self-consistent).
8. CRLF / encoding — PASS (24/0/3 lint clean).
9. Test count drift — PASS (669/669, no change — docs-only CS).
10. OPERATIONS.md Open-LRN audit subsection placement — PASS (inside `## Harvest`, recipes match current `LEARNINGS.md` schema; status count returns 96 applied / 1 deferred / 0 open).

**LRNs filed:** LRN-098 (status-doc duplication anti-pattern — orchestrator-facing process docs MUST have a single canonical home for each piece of content); LRN-099 (temp scratch files in repo root are caught by file-class linter — incidentally observed when `pr-body-cs15f.md` left in repo root briefly broke `cs11-self-host-config` test before being removed).
