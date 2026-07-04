# CS26 — `harness init` improvements bundle (6 findings from CS16 sub-invaders bootstrap)

**Status:** active
**Owner:** yoga-ah
**Branch:** cs26/content
**Started:** 2026-07-04T04:06:11Z
**Closed:** —
**Filed by:** Pre-claim disposition of [Findings #2, #3, #4, #5, #6, #9](../done/done_cs16_bootstrap-sub-invaders/sub-invaders-bootstrap-summary.md) from CS16 sub-invaders bootstrap (2026-05-11) by `yoga-ah`.
**Depends on:** [CS25](../done/done_cs25_hotfix-runtime-deps.md) (**closed 2026-05-11**; ajv/ajv-formats/js-yaml moved to runtime dependencies so the init flow has a working ajv — dependency satisfied; CS25 is on `main`). No remaining blocker. (Note: no `v0.2.1` tag was cut — the patch-release step was reframed; `v0.2.0` remains the latest `v0.2.x` tag.)

## Status update (2026-06-09, `omni-ah-c2`, disposition pass)

> Per the 2026-06-09 pre-claim backlog-disposition pass at repo HEAD
> `0f434c7`, CS26 is **partially obsolete**. Two of the six findings
> (#4, #5) have been silently addressed by other CSs since this plan
> was filed; four remain real defects against `main` today
> (#2, #3, #6, #9). Decision: **keep planned**, but **the next claimer
> should re-author the plan body down to those four remaining
> findings** rather than execute the full 6-finding / 4-sub-agent
> fan-out as written.
>
> **Finding-by-finding triage (verified at HEAD `0f434c7`):**
>
> | Finding | Topic | State today | Disposition |
> |---|---|---|---|
> | #2 | seed `harness.config.json` `version` field with actual invocation ref (not `v0.1.0`) | `template/seeded/harness.config.json` still hardcodes `"version": "v0.1.0"`. `cmdInit` copies it verbatim via `copyFileSync` (no ref-detect step). | **Still relevant** |
> | #3 | new `scripts/check-config-placeholders.mjs` linter for `REPLACE_ME` tokens | Linter file does not exist. Seeded `template/seeded/harness.config.json` still ships **6× `REPLACE_ME` tokens across 5 config fields**: `project.repo` (set to `"REPLACE_ME/REPLACE_ME"`, i.e. two tokens in one slot), `templating.repo_owner`, `templating.default_codeowner`, `templating.lib_codeowner`, `templating.repo_short`. | **Still relevant** |
> | #4 | populate `.harness-lock.json` `harness_ref` + `resolved_sha` (not `"unknown"`) | **Done** by other means: `lib/sync.mjs:resolveHarnessRef` (line 260) resolves both via `git rev-parse HEAD` + `git describe --tags --exact-match HEAD`, fallback to abbrev-ref, and writes them through `writeLock` (imported from `lib/lock.mjs`; `lib/sync.mjs:1038`). | **Obsolete** |
> | #5 | replace `template/seeded/flags/flags.json` example flags with empty array | **Obsolete by elimination**: the entire `template/seeded/flags/` subtree no longer exists; no `flags.json` is seeded. The defect cannot occur. | **Obsolete** |
> | #6 | stop creating stray root `.gitkeep` from `cmdInit` | **Still relevant** — mechanism changed but the defect persists: the unconditional `Created .gitkeep` line in `cmdInit` is gone (`grep '\.gitkeep' bin/harness.mjs` = no matches), but `template/seeded/.gitkeep` exists and `cmdInit`'s seeded-file copy loop (lines 1260–1278) recursively copies all seeded files including this one, so fresh consumers still receive a root `.gitkeep`. Fix is now to delete `template/seeded/.gitkeep` (and/or add an explicit skip in the copy loop). | **Still relevant** |
> | #9 | seed `template/seeded/.gitattributes` with `* text=auto eol=lf` + per-extension overrides | `template/seeded/.gitattributes` does not exist; fresh consumers still hit Windows CRLF round-trip warnings on first commit. | **Still relevant** |
>
> **Re-authoring guidance for the next claimer:**
>
> - **Scope:** Findings #2, #3, #6, #9 only. The 4-sub-agent fan-out
>   (table under `## Sub-agent fan-out`) is over-engineered for what
>   remains — one orchestrator-owned session is sufficient, with
>   optional 2-way split if desired (sub-agent A: cmdInit
>   version-detect + seeded `.gitattributes` + delete seeded
>   `.gitkeep`; sub-agent B: `check-config-placeholders.mjs`).
> - **Decisions retained from the plan body below:**
>   - C26-2 (version-detect strategy via npx cache `.package-lock.json`)
>     — still appropriate; the seeded config still needs a real version.
>   - C26-3 (placeholder-linter scope) — still appropriate.
>   - C26-6 (root `.gitkeep`) — still appropriate, but **update the
>     mechanism**: rather than removing a `cmdInit` line that no longer
>     exists, delete `template/seeded/.gitkeep` (and any sub-dir
>     `.gitkeep` whose target dir is now non-empty in a fresh init)
>     and/or add an explicit skip in the seeded-copy loop.
>   - C26-7 (`.gitattributes` shape: `* text=auto eol=lf` + binary/LF
>     overrides) — still appropriate.
>   - C26-8 (backwards compatibility: init-only, additive) — still
>     appropriate.
> - **Decisions obsolete:**
>   - C26-4 (lock-file resolved-ref) — implemented; remove from re-author.
>   - C26-5 (seeded `flags.json` shape) — moot; remove from re-author.
> - **CHANGELOG bullet** should cite this Status update note as the
>   reason the scope is smaller than the original `## Deliverables`
>   table.
> - **Release follow-up:** the original C26-9 mentioned a `v0.2.2` cut;
>   that's stale — the next release post-`v0.8.0` (currently Latest) is
>   `v0.8.1` or `v0.9.0` depending on the apply set's SemVer level.
>
> Plan body below is preserved verbatim for traceability against the
> original CS16 sub-invaders-bootstrap-summary (now archived at `project/clickstops/done/done_cs16_bootstrap-sub-invaders/sub-invaders-bootstrap-summary.md`) citations (Findings #2,
> #3, #4, #5, #6, #9).

## Goal

Fix six `harness init` defects observed during the first downstream-consumer init (CS16, sub-invaders bootstrap, 2026-05-11). All six leave a fresh consumer in a partially-broken state that requires manual cleanup before the consumer can productively use the harness. Together they represent a poor first-run experience for the consumer onboarding flow.

## Background

The CS16 sub-invaders bootstrap was the first end-to-end exercise of `harness init` against a freshly-created public consumer repo (not self-host). The 6 findings dispositioned here are documented in detail in [`sub-invaders-bootstrap-summary.md`](../done/done_cs16_bootstrap-sub-invaders/sub-invaders-bootstrap-summary.md). Each is reproducible from any fresh public repo by running `npx -y "github:henrik-me/agent-harness#v0.2.0" init` (after CS25's ajv hotfix lands).

These are bundled into a single CS because (a) all six touch the init flow, (b) they share validation surface (the same end-to-end smoke probe verifies all of them), and (c) sub-agent fan-out across them is natural and parallelisable.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C26-1 | Bundle vs. split | Bundle all 6 in one CS | All touch the same init code path + share end-to-end smoke validation. Splitting would require 6 separate close-out PRs with redundant smoke runs. |
| C26-2 | Version-detect strategy (Finding #2) | Read invocation ref from `process.argv[1]` resolution to the npx cache + parse `node_modules/.package-lock.json` for the resolved git ref; fall back to `package.json` `version` field if not running under npx | Most reliable across npx, npm-global, and self-host invocation modes. The npx cache stores the resolved ref in its own lock file. |
| C26-3 | `check-config-placeholders` linter scope (Finding #3) | New `scripts/check-config-placeholders.mjs` scans `harness.config.json` for literal `REPLACE_ME` strings AND scans rendered composed files (CONVENTIONS.md, OPERATIONS.md, REVIEWS.md) for the same. Fails with actionable error per occurrence | Catches both the source (config) and the propagation (rendered composed files); single pass. |
| C26-4 | Lock-file resolved-ref population (Finding #4) | When running from npx git ref, read the npx cache's `.package-lock.json` for the resolved commit SHA and the requested ref; record both in `.harness-lock.json` `harness_ref` + `resolved_sha`. Fall back to `git rev-parse HEAD` when self-host | npx caches the ref→SHA mapping in `.package-lock.json`'s `packages.""."resolved"` field. Self-host runs have a real git working tree to query. |
| C26-5 | Seeded `flags.json` content (Finding #5) | Empty `flags: []` array with comment string explaining the consumer should populate at first feature-flag use. NO example flags with dates | Avoids the date-rot problem entirely. The example flags were never actually useful — consumers never customise them in place; they delete and replace. |
| C26-6 | Stray root `.gitkeep` (Finding #6) | Remove the unconditional `Created .gitkeep` line in `bin/harness.mjs cmdInit`. `.gitkeep` files only inside subdirectories that are otherwise empty | One-line fix. The root `.gitkeep` is meaningless because the root is never empty after init (it has README, ARCHITECTURE, etc.). |
| C26-7 | `.gitattributes` seed shape (Finding #9) | Seed `* text=auto eol=lf` + override patterns matching what agent-harness itself uses (binary patterns for `*.png`, `*.jpg`, `*.ico`; LF for `*.md`, `*.mjs`, `*.json`, `*.yml`) | Mirrors agent-harness's own LF discipline; eliminates the Windows CRLF round-trip warnings consumers hit on first commit. |
| C26-8 | Backwards compatibility | All 6 changes are additive or replace defective behaviour. No CS26 change breaks existing consumers (their root `.gitkeep` stays if already committed; their existing `flags.json` is not overwritten; their existing `.gitattributes` is not overwritten) | Sync semantics: init only runs once per consumer. Existing consumers are unaffected. |
| C26-9 | Test approach | Each of the 6 fixes gets at least 1 test. Add new `tests/cs26-init-improvements.test.mjs` that consolidates them, plus extend `tests/cs09-init.test.mjs` with assertion that smoke-init produces zero `Cannot find package` warnings (validates CS25 fix), the correct seeded version, no REPLACE_ME placeholders, no root `.gitkeep`, and a `.gitattributes` file | Mirrors CS15e pattern of consolidating CS-scoped fixture tests in one file. |

## Deliverables

1. **Finding #2 fix:** `bin/harness.mjs cmdInit` — detect invocation ref + seed `harness.config.json` `version` field with the actual ref. Per Decision C26-2.
2. **Finding #3 fix:** new `scripts/check-config-placeholders.mjs` linter per Decision C26-3. Wire into `bin/harness.mjs cmdLint` aggregator. Add to `harness.config.json:scaffolds[].linters` mapping if applicable.
3. **Finding #4 fix:** `lib/sync.mjs` (or wherever `.harness-lock.json` is written) — populate `harness_ref` + `resolved_sha` per Decision C26-4. Also populate per-scaffold `version` strings (currently `"unknown"`).
4. **Finding #5 fix:** `template/seeded/flags/flags.json` — replace example flags with empty array per Decision C26-5.
5. **Finding #6 fix:** `bin/harness.mjs cmdInit` — remove the line that creates `.gitkeep` at the consumer root per Decision C26-6.
6. **Finding #9 fix:** new `template/seeded/.gitattributes` per Decision C26-7. Wire into `cmdInit`'s seeded-file copy loop.
7. **Tests:** new `tests/cs26-init-improvements.test.mjs` covering all 6 fixes. Extend `tests/cs09-init.test.mjs` end-to-end smoke per Decision C26-9.
8. **End-to-end fresh-install smoke validation:** during close-out, repeat the CS25 smoke probe (fresh throwaway repo + npx init) and confirm: zero `Cannot find package` warnings; `harness.config.json` `version` matches invocation ref; no `REPLACE_ME` strings appear in rendered composed files; no root `.gitkeep` was created; `flags.json` is empty `flags: []`; `.gitattributes` exists with `eol=lf`. Capture transcript in active CS file Notes.
9. **CHANGELOG.md:** add `## [v0.2.2]` (or whatever is next after CS25's `v0.2.1`) entry listing the 6 init improvements.
10. **`sub-invaders-bootstrap-summary.md` update** (in agent-harness CS16 active or done dir, depending on CS16 close-out timing): add resolution notes to Findings #2, #3, #4, #5, #6, #9 pointing at CS26 close-out commit + tag.

## Sub-agent fan-out

CS26 is sized for ≥4 parallel sub-agents to validate the harness's own dispatch pattern AGAIN (recursive validation — CS26 fixes harness init defects observed during sub-invaders' fan-out exercise; CS26 itself uses fan-out).

| # | Sub-agent | Owned files |
|---|---|---|
| 1 | `cs26-init-version-and-gitkeep` | `bin/harness.mjs` (cmdInit edits for Findings #2 + #6); test edits in `tests/cs26-init-improvements.test.mjs` for those 2 |
| 2 | `cs26-config-placeholders-linter` | `scripts/check-config-placeholders.mjs` (new); wiring into `bin/harness.mjs` cmdLint aggregator (escalate to sub-agent #1 to coordinate cmdInit/cmdLint co-edits if conflict); test edits for Finding #3 |
| 3 | `cs26-lock-file-resolved-ref` | `lib/sync.mjs` (or wherever lock-file is written; sub-agent must verify); test edits for Finding #4 |
| 4 | `cs26-seeded-flags-and-gitattributes` | `template/seeded/flags/flags.json`, `template/seeded/.gitattributes` (new); cmdInit copy-loop wiring (coordinate with sub-agent #1); test edits for Findings #5 + #9 |
| (orchestrator-owned) | — | active CS file Tasks population, end-to-end smoke probe (Deliverable #8), CHANGELOG.md, sub-invaders-bootstrap-summary (now archived at `project/clickstops/done/done_cs16_bootstrap-sub-invaders/sub-invaders-bootstrap-summary.md`) cross-reference, `tests/cs09-init.test.mjs` end-to-end extension |

The 4 sub-agents have disjoint owned files except the cmdInit copy-loop. The orchestrator MUST resolve the cmdInit ownership choice up-front (recommend: sub-agent #1 owns all `bin/harness.mjs` cmdInit edits; sub-agents #2 and #4 hand patches to #1 if needed; OR: split cmdInit into smaller helpers that each sub-agent can extend independently).

## User-approval gates

- **G-release:** confirm release-promote step. Standard CS14/CS22/CS25 pattern.

## Exit criteria

1. All 6 findings have at least 1 corresponding code change committed.
2. `tests/cs26-init-improvements.test.mjs` exists with ≥6 tests (one per finding) and `node --test` exits 0 with all passing.
3. `tests/cs09-init.test.mjs` end-to-end smoke extended per Decision C26-9 and passing.
4. `harness lint --quiet` passes (full suite, including the new `check-config-placeholders`).
5. End-to-end fresh-install smoke per Deliverable #8 passes all 6 assertions; transcript captured.
6. `CHANGELOG.md` `## [v0.2.2]` (or successor) section present.
7. CS16's `sub-invaders-bootstrap-summary.md` (now archived at `project/clickstops/done/done_cs16_bootstrap-sub-invaders/sub-invaders-bootstrap-summary.md`) Findings #2, #3, #4, #5, #6, #9 each have resolution notes pointing at CS26 close-out SHA.
8. All 4 sub-agent reports collected with STATUS: complete + correct PREFLIGHT/FINAL SHA invariants.
9. Plan-vs-implementation review (GPT-5.5 gate) returns GO.

## Risks + open questions

| # | Risk | Mitigation |
|---|---|---|
| R1 | Version-detect from npx cache (Finding #2 fix) is fragile if npm changes the cache layout | Per-platform fallback chain: try npx-cache lookup → fall back to package.json reading → fall back to writing literal `unknown` (better than silent `v0.1.0`). Add a test asserting the fallback chain works when the npx cache files are absent. |
| R2 | `check-config-placeholders` may produce noisy false positives if a consumer legitimately uses the string `REPLACE_ME` somewhere | Use case-sensitive match; require it to appear as a STANDALONE token (regex `\bREPLACE_ME\b`); allow opt-out via comment marker (e.g. `<!-- placeholder-allowed -->` on a line) for CONVENTIONS.md sections that intentionally show example placeholders. |
| R3 | Removing root `.gitkeep` (Finding #6) may delete one that an existing consumer has committed deliberately | The fix is to STOP creating it in init. Existing consumers' committed `.gitkeep` stays untouched. Sync does not delete files. |
| R4 | Seeded `.gitattributes` (Finding #9) may conflict with consumer's pre-existing `.gitattributes` | Init's seeded-file copy loop already has the `if file exists, skip` invariant (verified during CS09 close-out). New seeded files inherit this invariant. |
| R5 | The 4-way sub-agent fan-out has shared cmdInit ownership | Resolve by orchestrator at dispatch time per Decision C26-9 + the fan-out table notes. Either sub-agent #1 owns ALL cmdInit edits (others hand patches), or cmdInit is refactored into smaller helpers FIRST (Wave 0) before fan-out. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.7-xhigh | rubber-duck dispatched (orchestrator: yoga-ah) | 2d48e031198c | 2026-05-14T04:50:00Z | Go-with-amendments | CS26 grandfather attestation per CS42-7 strict-flip self-host validation. Pre-CS35b backlog; plan content unchanged; backfill only. |

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | yoga-ah |
| Reviewer agent | rubber-duck (orchestrator: yoga-ah) |
| Notes | Provisional at claim; finalized at close-out. Independence per REVIEWS § 2.3 — reviewer `gpt-5.5` ≠ implementer `claude-opus-4.8`. SemVer set at close-out (init defect fixes + new `check-config-placeholders` linter — likely Minor). |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T0 — Finalize scope + path: implement findings #2/#3/#6/#9 per the 2026-06-09 disposition note; choose Path A (leave Decisions/Deliverables untouched — plan-review hash `2d48e031198c` stays valid) vs Path B (re-author body → fresh R2 GPT-5.5 plan review) | in-progress | yoga-ah | #4/#5 obsolete; re-authoring Decisions/Deliverables invalidates the plan-review hash |
| T1 — Finding #2: `bin/harness.mjs` cmdInit detects invocation ref + seeds a real `version` into `harness.config.json` (C26-2; fallback chain per R1) | pending | — | impl; sub-agent A candidate |
| T2 — Finding #3: new `scripts/check-config-placeholders.mjs` (standalone `REPLACE_ME` token match) + wire into cmdLint aggregator; verify no seeded-token propagation (C26-3; risk R2) | pending | — | impl; sub-agent B candidate; 8 tokens across 6 fields today |
| T3 — Finding #6: stop shipping a root `.gitkeep` — delete `template/seeded/.gitkeep` and/or skip it in the cmdInit seeded-copy loop (C26-6, mechanism updated per disposition) | pending | — | impl; sub-agent A candidate |
| T4 — Finding #9: new `template/seeded/.gitattributes` (`* text=auto eol=lf` + binary/LF overrides) + copy-loop wiring (C26-7) | pending | — | impl; sub-agent A candidate |
| T5 — Tests: `tests/cs26-init-improvements.test.mjs` (≥4, one per finding) + extend `tests/cs09-init.test.mjs` end-to-end smoke (C26-9) | pending | — | over-delivery on tests encouraged |
| T6 — End-to-end fresh-install smoke probe (Deliverable #8) + `CHANGELOG.md [Unreleased]` entry (Deliverable #9) | pending | yoga-ah | orchestrator-owned |
| T7 — Plan-vs-implementation review (GPT-5.5 close-out gate) | pending | yoga-ah | independence: reviewer model ≠ every implementer model |
| Close-out: docs + restart state | pending | yoga-ah | Update WORKBOARD.md and CONTEXT.md so a fresh agent can restart from actual state |
| Close-out: learnings + follow-ups | pending | yoga-ah | File LEARNINGS.md entries; add resolution notes to CS16 `sub-invaders-bootstrap-summary.md` findings #2/#3/#6/#9; file planned follow-up CSs as needed |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_