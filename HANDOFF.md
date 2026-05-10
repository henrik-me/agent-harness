# HANDOFF — Bootstrap guide for a new orchestrator

> This file exists so any fresh agent or human picking up the project can self-bootstrap with a deterministic reading order. **If you're a new orchestrator, read this first.**

## Starter prompt for a new orchestrator session

Copy-paste this into a fresh Copilot CLI session (or equivalent) at the start:

```
cd C:\src\agent-harness, then read HANDOFF.md carefully and follow its
bootstrap reading order. After that, continue from where the prior session
left off (check CONTEXT.md and WORKBOARD.md for the current state).
Operate autonomously from the current repo state. Check in only for
substantive design decisions not derivable from the cs-plan + LRNs, or for
changes that would materially alter the public repo/security posture.
```

That's all you need to type. HANDOFF.md (this file) pulls in everything else in the right order.

## Prerequisites

- **Node.js** ≥ 20 (uses `node:test`, ESM, `node --test`).
- **npm** (for `npm pack --dry-run --json` used by `check-pack.mjs`).
- **git** + **`gh` CLI** authenticated to `henrik-me/agent-harness` (PR creation, merge, workflow_dispatch, release view all use `gh`).
- **Python** ≥ 3.11 with `pyyaml` (optional — only used for `python -c "import yaml; ..."` ad-hoc YAML validation; not required for tests/lint).
- After `git pull`, run `npm ci` (or `npm install`) once to install devDeps (`ajv`, `ajv-formats`, `js-yaml`). The `js-yaml` dep is what makes `check-workflow-pins.mjs` fail-loud on YAML errors per LRN-078.

## Bootstrap sanity check (run these AFTER reading TL;DR, BEFORE claiming any CS)

```bash
cd C:\src\agent-harness
git pull --ff-only origin main
git status --short                                    # expect: clean
git log -3 --oneline                                  # last 3 commits on main
git tag --list 'v*' | tail -5                         # latest release tags (v0.1.0 expected)
node --test tests/*.test.mjs 2>&1 | grep -E '^# (tests|pass|fail)'   # expect: all pass
node bin/harness.mjs lint --quiet                     # expect: "Total: N passed, 0 failed, M skipped"
node bin/harness.mjs sync --mode=check --cwd .        # expect: "No drift detected"
gh pr list --state open --limit 10                    # expect: empty (or just docs PRs)
```

If any of these fail, **stop and investigate** before claiming new work. The repo's invariant is "main is always green".

## Stop rules (when to halt and check in with the human)

- Any "substantive design decision not derivable from the cs-plan + LRNs" — defer to the user.
- Any change that materially alters public repo/security posture (Ruleset, GitHub App permissions, secrets, visibility, vulnerability reporting) — check in unless an existing CS plan or LRN explicitly authorizes it.
- Any post-merge CI failure on main that you can't trivially explain.

## TL;DR

1. **Where are we?** Read [`CONTEXT.md`](CONTEXT.md) for current state and the commit ref of the last completed CS.
2. **Is anything in flight?** Read [`WORKBOARD.md`](WORKBOARD.md). If the **Active Work** row shows a CS in `claimed`/`active`, finish or hand off that CS before claiming a new one.
3. **What's the working model?** Read [`template/composed/OPERATIONS.md`](template/composed/OPERATIONS.md) — the canonical claim → dispatch → handoff → sync → harvest loop, sub-agent dispatch contract, SemVer policy, and conventions. (Self-host is live since CS11; the root `OPERATIONS.md` is rendered from the template via `harness sync`.)
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
- [LRN-064](LEARNINGS.md#lrn-064) — **Plan-vs-implementation review gate is MANDATORY before any close-out.** Every active/done CS file MUST have a populated `## Plan-vs-implementation review` H2 section with `**Reviewer:**`, `**Date:**`, and `**Outcome:**` markers. Mechanically enforced by `check-clickstop.mjs` check #4. Use a gpt-5.5 rubber-duck pass (or equivalent independent reviewer) to verify implementation matches plan + test coverage adequate.
- [LRN-068](LEARNINGS.md#lrn-068) — **Canonical sub-agent briefing preamble** lives in `template/composed/OPERATIONS.md` § Sub-agent dispatch. Orchestrator pastes it verbatim into every dispatch — no ad-hoc briefings.
- [LRN-070](LEARNINGS.md#lrn-070) / [LRN-074](LEARNINGS.md#lrn-074) — When a CS modifies templates AND root files in one commit, refresh the lock with `harness sync --mode=apply --resolved-sha $(git rev-parse HEAD) --cwd .` AFTER the content commit. Avoids ordering trap.
- [LRN-075](LEARNINGS.md#lrn-075) — GitHub Actions workflows MUST pass externally-influenced values through `env:` (never directly into `run:`) AND validate against an allowlist regex before shell consumption. Defence-in-depth against shell injection.
- [LRN-076](LEARNINGS.md#lrn-076) — Test-fixture files must NOT be matched by `.gitignore`; empty-dir tests must use `mkdtempSync`. Mechanically enforced by `check-fixtures.mjs` (CS13).
- [LRN-077](LEARNINGS.md#lrn-077) — Self-host-only linters (e.g. `check-pack`) use a `package.json.name === '@henrik-me/agent-harness'` runtime guard with `target: null` clean skip.
- [LRN-078](LEARNINGS.md#lrn-078) — `check-workflow-pins.mjs` ERRORS on YAML parse failures when `js-yaml` is available. Catches malformed workflows BEFORE they fail silently on GitHub Actions (e.g. unquoted `:` in step names).

## Reviewer

Every PR (claim, content, close-out) goes through GPT-5.5 rubber-duck review BEFORE merge. The reviewer is **independent** — runs in a separate context. Address every Blocking finding (fix inline if 1-2 small issues, sub-agent if many). Non-blockers go into close-out notes. See [`template/composed/REVIEWS.md`](template/composed/REVIEWS.md) for the full taxonomy and HIGH-RISK CS list.

Fallback per [Decision #22](project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md): if GPT-5.5 unavailable >30min, fall back to Sonnet 4.6 (independence invariant: must be a different model from the implementer).

## Verification before declaring a CS done

- `node --test tests/*.test.mjs` — all green (643+ at CS15e close)
- `node scripts/validate-schemas.mjs` — N/0
- `node scripts/check-learnings.mjs` — exit 0
- `node bin/harness.mjs lint --quiet` — `0 failed` (15 linters at v0.1.0; 3 skipped is normal: pr-body, commit-trailers, compose-v2 lack targets)
- `node bin/harness.mjs sync --mode=check --cwd .` — "No drift detected"
- `git status --short` — only the expected files modified
- Sub-agent commits **never** appear in `git log` (verify SHA preflight discipline)
- The active/done CS file has a populated `## Plan-vs-implementation review` section (LRN-064 gate)

## Common pitfalls

- **Don't dump full LEARNINGS.md into a sub-agent briefing.** Use a bounded subset (relevant area + `status: open`/`applied`) per [LRN-031](LEARNINGS.md#lrn-031).
- **Don't claim a new CS while one is active.** Check WORKBOARD's Active Work row first.
- **Don't push a workboard-only claim and content in the same PR.** They're separate PRs by design (per the 3-PR shape in OPERATIONS.md § Claim).
- **Don't bypass GPT-5.5 review** even for small docs PRs. The discipline is the value.
- **Don't run `harness lint` from the harness package directory expecting it to lint a consumer repo.** Pass `--cwd <consumer-path>` (per [LRN-032](LEARNINGS.md#lrn-032)).
- **Don't push a tag without checking the tag-allowlist regex first.** `release.yml` validates the tag against `^v[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?$`. Tags outside this pattern fail the release workflow with exit 2 (per LRN-075).
- **Don't put unquoted `:` in YAML step names** (LRN-078). YAML treats them as mapping separators and the GH Actions parser silently fails the run with "This run likely failed because of a workflow file issue". `check-workflow-pins.mjs` will catch this at lint time, but only when `js-yaml` is installed (`npm ci` first).

## Open-LRN audit

The public flip required all `open` LRNs to be dispositioned, and that invariant
is currently satisfied. To enumerate future drift:

```bash
# All entries by status
grep -E '^status: ' LEARNINGS.md | sort | uniq -c

# Just the open ones (with their IDs)
grep -B 4 '^status: open' LEARNINGS.md | grep '^id: '
```

Each `open` entry needs a status flip to `applied` / `obsolete` / `deferred` (with `deferred_until: <date>`) before any future public-facing release gate.

## Where to ask the human

The human owner is `henrik-me` (GitHub user). Check in for:
- Anything that would require a substantive design decision not derivable from the cs-plan + LRNs (e.g. cost trade-offs, naming for new things not already locked, scope changes)
- Material changes to public repo/security posture (Ruleset, GitHub App permissions, secrets, visibility, vulnerability reporting)

Otherwise, proceed autonomously. Use [LRN-058](LEARNINGS.md#lrn-058) cumulative-dispatch confidence: ~51 sub-agent dispatches across CS01–CS14 with zero commit-discipline violations means the model works at scale.

## Current mainline state (as of last update)

- **v0.1.0 tagged** on main (CS14 close, 2026-05-04). Draft GitHub Release exists.
- **v0.2.0 unreleased** (CS02b + CS03d + CS03e cleared the pre-CS15a deferred-LRN backlog 2026-05-09; CHANGELOG `[Unreleased]` carries 1 BREAKING + 2 Added/Changed entries — see `CHANGELOG.md`).
- **CS01 → CS15e complete.** CS15a absorbed the public visibility flip and Ruleset application.
- **Pre-CS16 backlog cleanup COMPLETE.** All three umbrella CSs (CS15c/d/e) filed 2026-05-10 to clear the 7 deferred planned CSs accumulated through CS01–CS15a, per user authorization 2026-05-09 ("umbrella seems good"), are now closed:
  - **CS15c** — CLI surface cleanup (CS04b + CS04d + CS09b). 4 sub-agents. **DONE 2026-05-09 @ `63c54b5` (PR #89).** R1 NEEDS-FIX → R2 GO. Filed LRN-084..086. Init-drift bug fixed inline (cmdInit now finalizes via sync-apply). 3 absorbed planned files moved to `done/`.
  - **CS15d** — Linter expansion (CS06b + CS08b + CS10b). 8 parallel + 1 sequential sub-agents; adds 2 linters (15→17 in non-self-host; 24 rows in self-host with per-scaffold scaffold-readme rows). **DONE 2026-05-10 @ `8ad0871` (PR #92).** R1 GPT-5.5 plan-vs-impl GO with 2 NB → CS06c + CS08c filed as follow-ups. Filed LRN-087..091 (5 LRNs). 3 absorbed planned files moved to `done/`. New `lib/{config,lock}-reader.mjs`, refactored 3 linters to `lib/doc-schema.mjs`, new `check-templates.mjs` + `check-scaffold-readme.mjs`, aggregator self-host per-scaffold rows + `SHIPPED_SCAFFOLD_LINTERS` consumer auto-dispatch.
  - **CS15e** — `harness init` private-tier detection (CS04a; Q1–Q5 user-resolved). 4 parallel + 1 orchestrator-owned sub-agents. **DONE 2026-05-10 @ `962c866` (PR #95).** R1 NEEDS-FIX (3 blocking gaps: skip-summary leak, missing disposition-options notice, broken `\Z` JS regex) → fixed in `27f56ae` → R2 GO. Filed LRN-092..094. New `lib/{get-github-token,detect-repo-tier,config-reader::writeConfig}.mjs`, new `constraints` subschema with `if/then/else` disposition rule, `harness init --constraint-disposition` + `--skip-constraint-detection` flags, seeded `template/seeded/.harness-known-constraints.md` skeleton. 1 absorbed planned file moved to `done/`.
- **Repo is public and mechanically protected.** Main Ruleset `main-protection` is active with required checks, squash-only/linear-history/non-fast-forward/deletion protection, one approving review by default, and an explicit repository-admin bypass for owner override (LRN-080). The workboard GitHub App bot is installed and dry-run proven for eligible `workboard-only` PRs.
- **Security posture after public flip is green.** Secret scanning, Dependabot alerts/security updates, and Private Vulnerability Reporting are enabled; post-flip `fast-uri` alerts were fixed and alert readback was empty (LRN-081).
- **Next work:** **CS16 (Bootstrap Sub Invaders)** is the next mainline CS — the first downstream consumer of CS15e's constraint-detection flow. Claim once a planned file is filed (no planned file currently exists; it must be authored before claim). Two small CS15d follow-up planned CSs (CS06c, CS08c) are queued and can be claimed any time as parallel-lane work.
- 17 linters in `harness lint` non-self-host (15 base + `templates` + `scaffold-readme` skipped row); **24 rows in self-host** (15 base + templates + 8 per-scaffold rows); **643 tests passing** (post-CS15e, +34 net over CS15d); public/private-smoke workflow verified end-to-end against `v0.1.0` via `npx -y "github:henrik-me/agent-harness#v0.1.0"`.

## Parallelism: what runs in parallel today vs what doesn't

**What IS parallel:**
- **Sub-agents within ONE orchestrator session** — proven up to 9-way (CS06) and 8-way (CS08) with zero file races. File ownership per [LRN-016](LEARNINGS.md#lrn-016) is the safety mechanism.

**What is serialized (by design, today):**
- **CSs themselves.** WORKBOARD's `## Active Work` table is single-row by orchestrator discipline. Only one CS is in-flight at a time on the mainline plan.
- **LEARNINGS.md ID numbering.** LRN-NNN entries are appended sequentially — concurrent close-outs from different orchestrators would race on the next ID.

**Could multiple orchestrators run in parallel?** Yes, but only with discipline (no enforcement infrastructure yet). What works today with care:

1. **Lane split.** One orchestrator on the next selected mainline/planned CS, another on the deferred backlog. Backlog CSs target narrow disjoint areas — low race risk. (As of 2026-05-10 the deferred backlog is bundled into CS15c/d/e umbrellas — see § "Current mainline state".)
2. **LRN range allocation.** Each orchestrator pre-reserves a 10-ID block (e.g. orchestrator A reserves LRN-060..069 for CS10, B reserves LRN-070..079 for CS06b). Document the reservation in WORKBOARD.

**What's missing for safe true-parallel orchestration** (would itself be a future CS — call it `CS22b: multi-orchestrator coordination`):
- WORKBOARD multi-row Active Work with cross-orchestrator visibility
- LRN-range allocation as a first-class WORKBOARD construct
- File-ownership locks ("orchestrator B holds `template/composed/*` until 2026-05-10")
- A `harness lock <area>` / `harness release <area>` CLI to claim/release file areas

Until that CS lands, **single orchestrator at a time on the mainline** is the safe default. If you need parallel work, use the lane split model and coordinate manually via WORKBOARD before claiming.
