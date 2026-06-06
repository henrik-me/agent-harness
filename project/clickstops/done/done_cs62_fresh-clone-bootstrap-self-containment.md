# CS62 — Make the orchestrator fresh-clone startup self-contained (env-setup docs) + hermetic whoami tests

**Status:** done
**Owner:** yoga-ah-c2
**Branch:** cs62/content
**Started:** 2026-06-06
**Closed:** 2026-06-06
**Filed by:** Session bootstrap follow-up (2026-06-05 by `yoga-ah-c2`). Applies **LRN-146**. Surfaced when a fresh full clone (`agent-harness_copilot2`) failed the INSTRUCTIONS.md § Session Start bootstrap sanity check with 209 `node --test` failures (all `ERR_MODULE_NOT_FOUND` for `ajv`/`js-yaml`) because `node_modules` was never installed, and — after `npm install` — two `harness whoami` tests stayed red because they assert `id.endsWith('-ah')` while the clone derives a `-c2` suffix from its folder name.
**Depends on:** None. Touches docs + two test assertions only; no runtime-code change. May claim independently.

## Goal

Make the documented orchestrator startup path self-contained for a fresh clone so an agent that follows `INSTRUCTIONS.md` § Session Start reaches all-green without external knowledge, and remove two non-hermetic test assertions that false-red the "main is always green" bootstrap signal in any clone not named exactly `agent-harness`. Two surfaces: (1) a one-time environment-setup precondition (Node ≥ 20 + `npm ci`) documented in the startup path itself (not only in `CONTRIBUTING.md`); (2) hermetic `harness whoami` tests that do not depend on the checkout directory's basename.

## Background

LRN-146 (this session, `main` @ `7932f9e`): a fresh clone in `C:\src\agent-harness_copilot2` ran the Session Start bootstrap sanity check and saw 564 pass / 209 fail / 1 skip (774 total) on `node --test`, every failure an `ERR_MODULE_NOT_FOUND` for the dev deps `ajv` / `js-yaml` (imported by `lib/sync.mjs`, `lib/doc-schema.mjs`, and the schema/plan-review linters). Root cause: `node_modules` is gitignored and per-checkout and had never been installed in that clone. After `npm install` the suite went to 1081 pass / 2 fail / 1 skip (1084 total).

The documented startup path does not prevent the wall of failures:

- `README.md` § "Starting an agent session" (L77-93) routes the agent to `INSTRUCTIONS.md` and "the Session Start bootstrap sanity check".
- root `INSTRUCTIONS.md` § Session Start "Bootstrap sanity check" (L75-84), rendered from `template/managed/INSTRUCTIONS.md` (§ Session Start L60-84), runs `node --test`, `harness lint`, and `sync --mode=check` — all dependency-backed — with **no** preceding env-setup step.
- The startup path never references `CONTRIBUTING.md` — the only **human/agent-facing setup** doc that carries the `npm ci` step (L30-31, in the external-contributor fork→PR workflow); the INSTRUCTIONS.md Pointers table omits CONTRIBUTING.md. (CI workflows such as `harness-self-check.yml` invoke `npm ci` too, but that is not setup guidance the startup path surfaces to an agent.)

`LRN-141` already recorded the per-checkout `node_modules` fact but applied its fix only to git-worktree sub-agent dispatch (`OPERATIONS.md` § Sub-agent dispatch + the briefing preamble + `.github/copilot-instructions.md`), not to the orchestrator's own Session Start bootstrap — so the orchestrator startup path is the unclosed surface.

The two residual test failures are non-hermetic, not real regressions. `tests/cli.test.mjs` "prints agent ID ending in -ah…" (`:144-149`) and "…env var override as machine-short" (`:160-169`) assert `id.endsWith('-ah')`, but the `run()` helper defaults `cwd: REPO_ROOT` (`:36`) and `whoami` calls `cloneSuffixFromDir(cwd)` (`bin/harness.mjs:3522`), where `cloneSuffixFromDir` applies `path.basename(dirPath)` internally and matches `_copilot(\d+)$` (`:617-619`). For folder `agent-harness_copilot2` the id is `yoga-ah-c2`, so `endsWith('-ah')` is false. The clone-suffix derivation is correct/intended (Decision #20; Blocker-4 tests at `tests/cli.test.mjs:1034-1088` assert `agent-harness_copilot2 → -c2` and `agent-harness → no suffix`). `package-lock.json` is tracked and `node_modules/` is gitignored, so `npm ci` is the correct one-time command.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C62-1 | Env-setup precondition | Add a "First-run environment setup" step to `template/managed/INSTRUCTIONS.md` § Session Start, immediately **before** the "Bootstrap sanity check" block: require Node ≥ 20 and a one-time `npm ci` (note `node_modules` is gitignored/per-checkout), plus an explicit triage line — "if `node --test` floods with `ERR_MODULE_NOT_FOUND`, run `npm ci`; `main` is not broken." Regenerate the rendered root `INSTRUCTIONS.md` via `harness sync --mode=apply` in the same change. | Closes the LRN-146 gap at the exact place the startup process is read; managed-file discipline (edit the template, regenerate the render, keep `sync --mode=check` clean). |
| C62-2 | README cross-reference | In `README.md` § "Starting an agent session", add a one-line pointer to the one-time setup (Node ≥ 20 + `npm ci`) before the starter prompt, linking to `CONTRIBUTING.md` for detail. `README.md` is project-owned (sync-excluded) and edited directly. | The orchestrator entry point should mention setup without forcing a CONTRIBUTING.md detour, while keeping CONTRIBUTING.md the canonical detailed source. |
| C62-3 | Whoami test hermeticity | Make `tests/cli.test.mjs` "prints agent ID ending in -ah…" (`:144-149`) and "…env var override as machine-short" (`:160-169`) hermetic by running `whoami` with `--cwd` pinned to a temp dir named `agent-harness` (reuse `makeNamedDir('agent-harness')` at `:1066`), so the `-ah` terminal-suffix assertion is independent of the checkout folder name. Preserve the env-override test's `HARNESS_AGENT_AH_MACHINE` semantics and the `--config` self-config usage. | A test must not couple to REPO_ROOT's basename; pinning `--cwd` keeps the exact `-ah` assertion deterministic in the canonical case CI verifies. |
| C62-4 | Assertion form | Prefer the `--cwd`-pinned approach over weakening the assertion to `/-ah(-c\d+)?$/`; use the regex only if a pinned `--cwd` proves impractical. | Pinning preserves the strict `-ah` terminal-suffix check; the regex would also accept clone-suffixed ids, losing intent. |
| C62-5 | Scope guard | **No** change to `bin/harness.mjs` `cloneSuffixFromDir` / agent-id derivation; the `-c<N>` behavior is correct (Decision #20). This CS changes docs + two test assertions only. | The production behavior is right; the defects are a doc gap + two non-hermetic assertions. |
| C62-6 | Learnings lifecycle | Transition **LRN-146** `open → applied` at close-out, citing the merge SHA. | Standard lifecycle. |
| C62-7 | Tests + validation | Verify the two whoami tests pass independent of the checkout folder name; keep all whoami/clone-suffix tests green; full `node --test` + `harness lint --quiet` + `sync --mode=check` green. | Proves the false-red is eliminated and nothing regressed. |

## Deliverables

1. **`template/managed/INSTRUCTIONS.md`** — "First-run environment setup" precondition in § Session Start before the bootstrap sanity check (C62-1).
2. **root `INSTRUCTIONS.md`** — regenerated from the template via `harness sync --mode=apply` so `sync --mode=check` stays clean (C62-1).
3. **`README.md`** § "Starting an agent session" — one-time `npm ci` / Node ≥ 20 setup cross-reference (C62-2).
4. **`tests/cli.test.mjs`** — hermetic whoami tests (C62-3/C62-4).
5. **`LEARNINGS.md`** — LRN-146 `open → applied` (C62-6).
6. **`CHANGELOG.md`** — `[Unreleased]` entry (docs + test-hygiene).

## Parallelization / dispatch plan

Small CS; two disjoint workstreams plus serial orchestrator integration. Can also be done by a single agent.

| WS | Owns (write) | Notes |
|---|---|---|
| **WS-DOCS** | `template/managed/INSTRUCTIONS.md`, root `INSTRUCTIONS.md` (via sync), `README.md` | Edit the template, run `harness sync --mode=apply`, then verify `sync --mode=check` clean. |
| **WS-TESTS** | `tests/cli.test.mjs` | Pin `--cwd` to an `agent-harness`-named temp dir for the two failing whoami tests. |
| **Orchestrator (serial)** | `LEARNINGS.md`, `CHANGELOG.md` | LRN-146 → applied; CHANGELOG entry; full lint + PVI gate. |

## User-approval gates

- None expected (docs + test-hygiene; no public-posture or dependency change). Rides the next release cut.

## Exit criteria

1. `template/managed/INSTRUCTIONS.md` § Session Start carries the env-setup precondition (Node ≥ 20 + `npm ci` + `ERR_MODULE_NOT_FOUND` triage line) before the bootstrap sanity check, and `harness sync --mode=check` reports **No drift** (root `INSTRUCTIONS.md` regenerated) (C62-1).
2. `README.md` § "Starting an agent session" cross-references the one-time `npm ci` / Node ≥ 20 setup (C62-2).
3. The two whoami tests pass independent of the checkout folder name (hermetic `--cwd`); all whoami + clone-suffix (Blocker-4) tests green (C62-3/C62-4).
4. No change to `bin/harness.mjs` clone-suffix derivation (C62-5).
5. `node --test tests/*.test.mjs` fully green (incl. when run from a non-`agent-harness`-named clone); `harness lint --quiet` 0 failed; `sync --mode=check` No drift (C62-7).
6. LRN-146 `applied`; CHANGELOG `[Unreleased]` entry present (C62-6).
7. Plan-vs-implementation review (GPT-5.5 gate) returns GO.

## Risks + open questions

| # | Risk | Mitigation |
|---|---|---|
| R1 | Editing managed `INSTRUCTIONS.md` without regenerating the render → `sync --mode=check` drift | C62-1 requires `harness sync --mode=apply`; exit criterion 1 gates on `sync --mode=check` clean. |
| R2 | Env-setup wording drifts from `CONTRIBUTING.md`'s `npm ci` instruction | Keep CONTRIBUTING.md the canonical detailed setup; INSTRUCTIONS gives the one-line precondition + triage and links to it (C62-2). |
| R3 | Pinning `--cwd` to an `agent-harness` temp dir changes `whoami` config resolution (it loads config from cwd) | The two tests already pass `--config=<self config>` explicitly; combine that with a `makeNamedDir('agent-harness')` cwd so the suffix is `-ah` and config still resolves. Mirror the Blocker-4 pattern (`tests/cli.test.mjs:1034-1088`). |
| R4 | A future render-drift check counts the env-setup note as managed-content the consumer shouldn't get | The note is generic orchestrator guidance already shipped to consumers via the managed INSTRUCTIONS.md; it applies equally to a consumer's own checkout. No consumer-specific content. |
| Q1 | `npm ci` vs `npm install` in the precondition | **Resolved:** `package-lock.json` is tracked, so `npm ci` (reproducible) is primary; mention `npm install` as the fallback when the lockfile is stale. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: `yoga-ah-c2`) | 0b0eedcad440 | 2026-06-06T19:38:00Z | Needs-Fix | Scope/citations mostly verified; F1 overclaim "only npm ci in CONTRIBUTING.md" (CI workflows run it too); F2 cite is cloneSuffixFromDir(cwd), basename internal. Amend Background+LRN. |
| R2 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: `yoga-ah-c2`) | 0b0eedcad440 | 2026-06-06T19:44:00Z | Go | F1/F2 resolved; wording now scopes npm ci setup docs correctly and cites cloneSuffixFromDir(cwd); Decisions/Deliverables unchanged; no new contradictions. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| WS-TESTS: make the two `harness whoami` assertions in `tests/cli.test.mjs` hermetic via `--cwd` pinned to an `agent-harness`-named temp dir (C62-3/C62-4) | done | yoga-ah-c2 | agent-id=yoga-ah-c2 \| role=orchestrator \| report-status=complete \| learnings=0 |
| WS-DOCS: First-run environment setup precondition in `template/managed/INSTRUCTIONS.md` § Session Start + regen root `INSTRUCTIONS.md` via `sync --mode=apply`; `README.md` cross-ref (C62-1/C62-2) | done | yoga-ah-c2 | agent-id=yoga-ah-c2 \| role=orchestrator \| report-status=complete \| learnings=0 |
| Orchestrator integration: `CHANGELOG.md` `[Unreleased]` entry; full `node --test` + `harness lint --quiet` + `sync --mode=check`; GPT-5.5 rubber-duck local review (C62-7) | done | yoga-ah-c2 | Single-writer; orchestrator-implemented (no sub-agent dispatch). |
| Close-out: docs + restart state — update `WORKBOARD.md` (remove CS62 Active Work row), `CONTEXT.md` if state changed, and any process templates/rendered roots as needed | done | yoga-ah-c2 | WORKBOARD CS62 row removed; CONTEXT rolled forward. |
| Close-out: learnings + follow-ups — transition LRN-146 `open → applied` in `LEARNINGS.md` citing the merge SHA (C62-6) | done | yoga-ah-c2 | LRN-146 applied, citing 9f26d8d. |

## Notes / Learnings

(filled during execution)

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | yoga-ah-c2 |
| Reviewer agent | rubber-duck |

## Plan-vs-implementation review

**Reviewer:** GPT-5.5 (rubber-duck)
**Date:** 2026-06-06T22:19:29Z
**Outcome:** GO

Run against the merged content HEAD (squash commit `9f26d8d`, PR #251). Reviewer model gpt-5.5 differs from the implementer model claude-opus-4.8 (independence invariant).

Per-deliverable outcome:

| Deliverable | Outcome | Rationale (non-match only) |
|---|---|---|
| `template/managed/INSTRUCTIONS.md` first-run env-setup precondition (C62-1) | match | — |
| root `INSTRUCTIONS.md` regenerated / sync clean (C62-1) | match | — |
| `README.md` § "Starting an agent session" setup cross-ref (C62-2) | match | — |
| `tests/cli.test.mjs` hermetic whoami tests (C62-3/C62-4) | match | — |
| `LEARNINGS.md` LRN-146 lifecycle (C62-6) | match | Flip to `applied` correctly deferred to this close-out per C62-6; still `open` at content-merge is correct. |
| `CHANGELOG.md` `[Unreleased]` entry | match | — |

Scope guard (C62-5) confirmed: `git show 9f26d8d` changed no `bin/harness.mjs`; clone-suffix derivation unmodified.

Test-coverage assessment: **sufficient** — the two modified `harness whoami` tests pin `--cwd` to an `agent-harness` temp dir while preserving strict `endsWith('-ah')` and env-override semantics; the existing Blocker-4 clone-suffix tests cover the intended `-c<N>` derivation. No material untested scenario.

Gates re-run on the merged HEAD: `node --test --test-name-pattern="whoami"` 9/9; `harness lint --quiet` 30 passed / 0 failed; `sync --mode=check` No drift detected.
