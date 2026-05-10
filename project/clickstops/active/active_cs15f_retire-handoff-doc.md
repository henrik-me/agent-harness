# CS15f — Retire HANDOFF.md and consolidate into INSTRUCTIONS / OPERATIONS / README

**Status:** active
**Owner:** yoga-ah
**Branch:** cs15f/retire-handoff-doc (TBD on content commit)
**Started:** 2026-05-10
**Closed:** —
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

- [ ] `template/managed/INSTRUCTIONS.md` — `### Session Start` extended with a fenced bash block of the 6 bootstrap sanity-check commands (`git pull`, `git status --short`, `git log -3 --oneline`, `git tag --list 'v*' | tail -5`, `node --test tests/*.test.mjs`, `node bin/harness.mjs lint --quiet`, `node bin/harness.mjs sync --mode=check --cwd .`). Existing prose preserved; commands added as the concrete recipe.
- [ ] `template/composed/OPERATIONS.md` — `## Harvest` extended with a small "Open-LRN audit" subsection containing the two grep recipes from HANDOFF.md (status distribution count + open-entry IDs).
- [ ] `README.md` (project-owned, root) — `## Repo layout` extended with the per-path-purpose memory-layout table (`CONTEXT.md`, `WORKBOARD.md`, `LEARNINGS.md`, `ARCHITECTURE.md`, `project/clickstops/{active,planned,done}/`, `template/{managed,composed,seeded}/`); `## Starting an agent session` new subsection with the starter prompt snippet (rewritten to point at INSTRUCTIONS.md, not HANDOFF.md).
- [ ] `harness.config.json` — remove `"HANDOFF.md"` from the `excluded` array (line 60).
- [ ] `CONTEXT.md` — remove the `> **🆕 New orchestrator picking this up?**` callout (line 5) that points at HANDOFF.md; replace with a one-liner pointing at `INSTRUCTIONS.md`. Also fix the `## Parallelism` paragraph at line 90 that references HANDOFF.md § Parallelism.
- [ ] `project/clickstops/planned/planned_cs22b_multi-orchestrator-coordination.md` — update the 3 references to HANDOFF.md (lines 8, 50, 64, 77) to point at the new homes (CONTEXT.md § Parallelism + OPERATIONS.md as appropriate). The "Filed by: Docs/handoff PR" historical reference may stay or be reworded.
- [ ] Root `OPERATIONS.md` (composed) — line 44 reference to `HANDOFF.md` updated; corresponding fix in `template/composed/OPERATIONS.md` so they stay in sync via `harness sync`.
- [ ] Re-run `harness sync --mode=apply --resolved-sha $(git rev-parse HEAD) --cwd .` after the content commit (per LRN-070 / LRN-074 ordering trap) so `.harness-lock.json` reflects the template changes.
- [ ] `git rm HANDOFF.md`.
- [ ] All linters pass (24/0/3 unchanged); `harness sync --mode=check` shows no drift; full test suite still passes (669/669 — no test count change expected).
- [ ] Historical references in `project/clickstops/done/done_cs03d_template-prose-hash.md` and `project/clickstops/done/done_cs11_self-host*.md` are NOT modified (they are historical record).

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
| Edit `template/managed/INSTRUCTIONS.md` § Session Start (add 6-command bash block) | pending | yoga-ah | agent-id=yoga-ah \| role=orchestrator-impl \| report-status=pending \| learnings=0 |
| Edit `template/composed/OPERATIONS.md` § Harvest (add Open-LRN audit subsection) | pending | yoga-ah | agent-id=yoga-ah \| role=orchestrator-impl \| report-status=pending \| learnings=0 |
| Edit `README.md` § Repo layout (add memory-layout table) + new § Starting an agent session | pending | yoga-ah | agent-id=yoga-ah \| role=orchestrator-impl \| report-status=pending \| learnings=0 |
| Edit `harness.config.json` (remove HANDOFF.md from excluded) | pending | yoga-ah | agent-id=yoga-ah \| role=orchestrator-impl \| report-status=pending \| learnings=0 |
| Edit `CONTEXT.md` (remove HANDOFF callout + parallelism cross-ref) + edit `template/composed/OPERATIONS.md` line 44 reference | pending | yoga-ah | agent-id=yoga-ah \| role=orchestrator-impl \| report-status=pending \| learnings=0 |
| Edit `planned_cs22b_*.md` (3 refs) | pending | yoga-ah | agent-id=yoga-ah \| role=orchestrator-impl \| report-status=pending \| learnings=0 |
| Run `harness sync --mode=apply --resolved-sha … --cwd .` to refresh lock + propagate template edits | pending | yoga-ah | agent-id=yoga-ah \| role=orchestrator-impl \| report-status=pending \| learnings=0 |
| `git rm HANDOFF.md` | pending | yoga-ah | agent-id=yoga-ah \| role=orchestrator-impl \| report-status=pending \| learnings=0 |
| Local review (GPT-5.5) | pending | yoga-ah | agent-id=yoga-ah \| role=local-reviewer \| report-status=pending \| learnings=0 |
| Plan-vs-implementation review (GPT-5.5 close-out gate) | pending | yoga-ah | agent-id=yoga-ah \| role=close-out-reviewer \| report-status=pending \| learnings=0 |
| Close-out: docs + restart state (WORKBOARD active→done row, CONTEXT.md if changed) | pending | yoga-ah | agent-id=yoga-ah \| role=closeout \| report-status=pending \| learnings=0 |
| Close-out: learnings + follow-ups (LEARNINGS.md entry on duplicate-state-doc anti-pattern, planned CSs filed if any) | pending | yoga-ah | agent-id=yoga-ah \| role=closeout \| report-status=pending \| learnings=1 |

## Notes / Learnings

- Surfaced during pre-CS16 doc audit. The trigger was almost-merging PR #105 (a HANDOFF.md "Current mainline state" refresh after CS06c/CS08c closed) and realising the section is structurally identical to CONTEXT.md `## Codebase state` — i.e. we maintain CS-completion bookkeeping in two places, and forget one half the time.
- Anticipated LRN: **`status-doc duplication anti-pattern`** — orchestrator-facing process docs (HANDOFF/INSTRUCTIONS/OPERATIONS/CONTEXT/README) MUST have a single canonical home for each piece of content. Recurring "Current mainline state"-style sections must live in CONTEXT.md only; bootstrap reading order in INSTRUCTIONS.md only; lifecycle procedure in OPERATIONS.md only. Bootstrap docs that re-summarise other docs accumulate stale duplicates and create churn at every CS close.
- The starter prompt is intentionally moved to `README.md` (project-owned, not synced) rather than `.github/copilot-instructions.md` (managed template) — the starter prompt is for HUMANS opening a fresh agent session, not for the agent's system prompt. README is the natural entry point for repo-onboarding.

## Plan-vs-implementation review

_(to be filled during the close-out gate)_
