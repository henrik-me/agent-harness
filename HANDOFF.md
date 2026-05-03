# HANDOFF — Bootstrap guide for a new orchestrator

> This file exists so any fresh agent or human picking up the project can self-bootstrap with a deterministic reading order. **If you're a new orchestrator, read this first.**

## Starter prompt for a new orchestrator session

Copy-paste this into a fresh Copilot CLI session (or equivalent) at the start:

```
cd C:\src\agent-harness, then read HANDOFF.md carefully and follow its
bootstrap reading order. After that, continue from where the prior session
left off (check CONTEXT.md and WORKBOARD.md for the current state).
Operate autonomously per the directive — only check in with me at CS15a
(public-flip) or for substantive design decisions not derivable from the
cs-plan + LRNs.
```

That's all you need to type. HANDOFF.md (this file) pulls in everything else in the right order.

## TL;DR

1. **Where are we?** Read [`CONTEXT.md`](CONTEXT.md) for current state and the commit ref of the last completed CS.
2. **Is anything in flight?** Read [`WORKBOARD.md`](WORKBOARD.md). If the **Active Work** row shows a CS in `claimed`/`active`, finish or hand off that CS before claiming a new one.
3. **What's the working model?** Read [`template/composed/OPERATIONS.md`](template/composed/OPERATIONS.md) — the canonical claim → dispatch → handoff → sync → harvest loop, sub-agent dispatch contract, SemVer policy, and conventions. (The root `OPERATIONS.md` is the CS01 proto; the canonical version under `template/composed/` will replace it during CS11 dogfood.)
4. **What conventions apply?** Read [`template/composed/CONVENTIONS.md`](template/composed/CONVENTIONS.md), [`template/composed/REVIEWS.md`](template/composed/REVIEWS.md), and [`template/managed/INSTRUCTIONS.md`](template/managed/INSTRUCTIONS.md) (especially the **Quick Reference Checklist** and **Per-CS Loop**).
5. **What's been learned?** Skim [`LEARNINGS.md`](LEARNINGS.md). Use a bounded subset: filter to the upcoming CS's area + `status: open`/`applied` (per [LRN-031](LEARNINGS.md#lrn-031) bounded-prompt rule). Don't dump all entries into context.
6. **What's the master plan?** Read [`project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md`](project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md) for the full 22-CS roadmap, locked decisions table, and parallelisation guidance.

## Persistent memory layout

The repo IS the memory between sessions. There is no other state.

| Path | Purpose |
|---|---|
| `CONTEXT.md` | Current state, recently completed CSs with commit refs, blockers |
| `WORKBOARD.md` | Live coordination: orchestrators table, Active Work, Recently Completed |
| `LEARNINGS.md` | Process learnings (LRN-001..N), schema-validated, sectioned by status |
| `ARCHITECTURE.md` | Architecture overview (Components, Data model, Decision log) |
| `project/clickstops/active/` | Currently in-flight CS spec (one file when active, empty when stable) |
| `project/clickstops/planned/` | Queued CSs in priority order (`planned_cs<NN>_<short-name>.md`) |
| `project/clickstops/done/` | Completed CS files with full actuals (sub-agent ledger, GPT-5.5 review log, learnings filed, follow-up planned CSs) |
| `template/managed/` | Templates that overwrite consumer files on every sync |
| `template/composed/` | Templates with managed core + marker-preserved local blocks |
| `template/seeded/` | Skeletons created if missing, never overwritten |

## Standard CS lifecycle (what to do for each CS)

For each CS:

1. **Claim** — `git checkout -b cs<NN>/claim`; `git mv` the planned file to active; flip status to `active`; populate the sub-agent ledger in the Tasks table; update WORKBOARD/CONTEXT to remove "ready to claim" stale language. Open a small workboard-only PR. Get a quick GPT-5.5 review and merge.
2. **Content** — `git checkout -b cs<NN>/content`. Dispatch sub-agents per the parallelisation plan in the active CS file. Each sub-agent gets a briefing with mandatory **no-commit preflight** (per [LRN-021](LEARNINGS.md#lrn-021)), explicit **file ownership** (per [LRN-016](LEARNINGS.md#lrn-016)), and **schema-source-of-truth** + **`requireValue` arg guard** + **flat-key templating only** if applicable. Verify SHA unchanged after each sub-agent. Commit + push + open PR + GPT-5.5 review (~3 rounds for user-facing CSs; more for HIGH-RISK).
3. **Close-out** — `git checkout -b cs<NN>/close-out`. File new LRN entries (numbered sequentially from the last). Pre-file the next planned CS(s) and any follow-up CSs (e.g. CS<NN>b) for deferred items. `git mv` active → done with full actuals. Update WORKBOARD/CONTEXT. PR + GPT-5.5 review + merge.

The detailed mechanics (briefing template text, report shape, ledger format, dispatch model heuristics) live in [`template/composed/OPERATIONS.md`](template/composed/OPERATIONS.md) § Sub-agent dispatch.

## Critical conventions to internalise (high-leverage LRNs)

These prevent recurring failure modes — read in full before dispatching any sub-agent:

- [LRN-016](LEARNINGS.md#lrn-016) — Parallel sub-agents must own disjoint files; otherwise file races.
- [LRN-021](LEARNINGS.md#lrn-021) — Sub-agents MUST run a no-commit preflight (record `git log --oneline -1` SHA; verify before reporting).
- [LRN-029](LEARNINGS.md#lrn-029) — Windows: `spawnSync('npm', …, { shell: true })`; `npm.cmd` direct = EINVAL.
- [LRN-032](LEARNINGS.md#lrn-032) — Linter wrappers must pass explicit `--file <consumer-cwd-path>`; never infer from script location.
- [LRN-039](LEARNINGS.md#lrn-039) — Schema is source of truth: read `schemas/*.schema.json` before any field access.
- [LRN-040](LEARNINGS.md#lrn-040) — Argument parsers need `requireValue(args, i, flagName)` guard; bare `args[i+1]` accepts other flags as values.
- [LRN-047](LEARNINGS.md#lrn-047) — Fix-round dispatch heuristic: findings × files > ~6 → use a sub-agent; otherwise fix inline.
- [LRN-049](LEARNINGS.md#lrn-049) — Templates use **flat keys** (`{{agent_suffix}}`) not dot notation (`{{project.agent_suffix}}`).
- [LRN-050](LEARNINGS.md#lrn-050) — Managed templates use **consumer-root-relative** paths (`LEARNINGS.md`, `docs/adr/...`), never source-relative (`../LEARNINGS.md`).
- [LRN-056](LEARNINGS.md#lrn-056) — Composed templates: never embed literal harness markers in prose, even inside backticks.

## Reviewer

Every PR (claim, content, close-out) goes through GPT-5.5 rubber-duck review BEFORE merge. The reviewer is **independent** — runs in a separate context. Address every Blocking finding (fix inline if 1-2 small issues, sub-agent if many). Non-blockers go into close-out notes. See [`template/composed/REVIEWS.md`](template/composed/REVIEWS.md) for the full taxonomy and HIGH-RISK CS list.

Fallback per [Decision #22](project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md): if GPT-5.5 unavailable >30min, fall back to Sonnet 4.6 (independence invariant: must be a different model from the implementer).

## Verification before declaring a CS done

- `node --test tests/*.test.mjs` — all green
- `node scripts/validate-schemas.mjs` — N/0
- `node scripts/check-learnings.mjs` — exit 0
- `node bin/harness.mjs lint --quiet` — `0 failed`
- `git status --short` — only the expected files modified
- Sub-agent commits **never** appear in `git log` (verify SHA preflight discipline)

## Common pitfalls

- **Don't dump full LEARNINGS.md into a sub-agent briefing.** Use a bounded subset (relevant area + `status: open`/`applied`) per [LRN-031](LEARNINGS.md#lrn-031).
- **Don't claim a new CS while one is active.** Check WORKBOARD's Active Work row first.
- **Don't push a workboard-only claim and content in the same PR.** They're separate PRs by design (per the 3-PR shape in OPERATIONS.md § Claim).
- **Don't bypass GPT-5.5 review** even for small docs PRs. The discipline is the value.
- **Don't run `harness lint` from the harness package directory expecting it to lint a consumer repo.** Pass `--cwd <consumer-path>` (per [LRN-032](LEARNINGS.md#lrn-032)).

## Where to ask the human

The human owner is `henrik-me` (GitHub user). Per the directive in CS01, the human is checked-in only at:
- `CS15a` (public-readiness hardening — explicit approval before public flip)
- Anything that would require a substantive design decision not derivable from the cs-plan + LRNs (e.g. cost trade-offs, naming for new things not already locked, scope changes)

Until then, proceed autonomously. Use [LRN-058](LEARNINGS.md#lrn-058) cumulative-dispatch confidence: ~32 sub-agent dispatches across CS01–CS09 with zero commit-discipline violations means the model works at scale.

## Parallelism: what runs in parallel today vs what doesn't

**What IS parallel:**
- **Sub-agents within ONE orchestrator session** — proven up to 9-way (CS06) and 8-way (CS08) with zero file races. File ownership per [LRN-016](LEARNINGS.md#lrn-016) is the safety mechanism.

**What is serialized (by design, today):**
- **CSs themselves.** WORKBOARD's `## Active Work` table is single-row by orchestrator discipline. Only one CS is in-flight at a time on the mainline plan.
- **LEARNINGS.md ID numbering.** LRN-NNN entries are appended sequentially — concurrent close-outs from different orchestrators would race on the next ID.

**Could multiple orchestrators run in parallel?** Yes, but only with discipline (no enforcement infrastructure yet). What works today with care:

1. **Lane split.** One orchestrator on mainline (CS10 → CS11 → ...), another on the deferred backlog (CS03b, CS04a/b/c/d, CS06b, CS08b, CS09b). Backlog CSs target narrow disjoint areas — low race risk.
2. **LRN range allocation.** Each orchestrator pre-reserves a 10-ID block (e.g. orchestrator A reserves LRN-060..069 for CS10, B reserves LRN-070..079 for CS06b). Document the reservation in WORKBOARD.

**What's missing for safe true-parallel orchestration** (would itself be a future CS — call it `CS22b: multi-orchestrator coordination`):
- WORKBOARD multi-row Active Work with cross-orchestrator visibility
- LRN-range allocation as a first-class WORKBOARD construct
- File-ownership locks ("orchestrator B holds `template/composed/*` until 2026-05-10")
- A `harness lock <area>` / `harness release <area>` CLI to claim/release file areas

Until that CS lands, **single orchestrator at a time on the mainline** is the safe default. If you need parallel work, use the lane split model and coordinate manually via WORKBOARD before claiming.
