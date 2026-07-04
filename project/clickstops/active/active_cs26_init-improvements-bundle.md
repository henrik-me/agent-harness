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
> **Re-authored 2026-07-04 (`yoga-ah`, Path B).** Per the disposition
> above, the `## Decisions`, `## Deliverables`, `## Sub-agent fan-out`,
> `## Exit criteria`, and `## Risks` sections below were re-authored down
> to the four remaining findings (#2/#3/#6/#9); the obsolete C26-4/C26-5
> decisions and the #4/#5 deliverables were dropped. This invalidated the
> R1 plan-review hash, so a fresh **R2** GPT-5.5 plan review re-attests the
> narrowed body (see `## Plan review`). The original six-finding framing is
> retained in this Status-update note (and the CS16
> `sub-invaders-bootstrap-summary.md`) for traceability.

## Goal

Fix the `harness init` defects observed during the first downstream-consumer init (CS16, sub-invaders bootstrap, 2026-05-11). CS16 surfaced six findings; **four remain real against `main`** and are in scope here (#2/#3/#6/#9), while #4/#5 were dispositioned obsolete (see the Status-update note). Each in-scope finding leaves a fresh consumer in a partially-broken state requiring manual cleanup — together a poor first-run onboarding experience.

## Background

The CS16 sub-invaders bootstrap was the first end-to-end exercise of `harness init` against a freshly-created public consumer repo (not self-host). The original six findings are documented in detail in [`sub-invaders-bootstrap-summary.md`](../done/done_cs16_bootstrap-sub-invaders/sub-invaders-bootstrap-summary.md); the four in scope here (#2/#3/#6/#9) were re-confirmed against `main` at claim time.

These are bundled into a single CS because (a) all four touch the `harness init` flow, (b) they share validation surface (one end-to-end smoke probe verifies all of them), and (c) the work splits cleanly across two disjoint sub-agents.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C26-1 | Bundle vs. split | Bundle the four remaining findings (#2/#3/#6/#9) in one CS | All touch the `harness init` flow and share one end-to-end smoke validation; splitting would mean four close-out PRs with redundant smoke runs. (#4/#5 dropped as obsolete — see the 2026-06-09 Status-update note.) |
| C26-2 | Version-detect strategy (Finding #2) | In `cmdInit`, for a FRESH init only (`!configExists`), derive provenance via `lib/sync.mjs` `resolveHarnessProvenance()` and NORMALIZE before writing the consumer `harness.config.json` `version`: (1) if `harness_ref` is a SemVer (`/^v?\d+\.\d+\.\d+/`, with or without a `v` — `resolveFromNpxCache` can derive a bare `0.16.0` from `entry.version`, whereas git yields the `v`-prefixed release tag), write it normalized to a `v` prefix (prepend `v` when absent) → `v0.16.0`; (2) else if `resolved_sha` is a real 40-hex SHA (not the all-zero placeholder), write the full `resolved_sha`; (3) else write `v${harness package.json version}`. Replaces the seeded `v0.1.0`. | `resolveFromGit` returns `harness_ref` = exact-tag → branch → short-SHA and `resolved_sha` = the full 40-char HEAD SHA, so writing `harness_ref` verbatim could persist a mutable branch name or a short SHA. Normalizing to tag-or-full-SHA-or-package-version keeps the pin schema-clean (`version` accepts a SemVer tag or a full Git SHA) and stable. FRESH-init-only preserves the LRN-057 / C41-8 "init never mutates an existing config" invariant. |
| C26-3 | `check-config-placeholders` linter (Finding #3) | New `scripts/check-config-placeholders.mjs` scans the consumer-root `harness.config.json` ONLY (never `template/seeded/…`, which legitimately ships placeholders). It PARSES the file as JSON (fail-closed on malformed, per LRN-033) and reports one error per string VALUE, under a non-`_`-prefixed key, that contains a standalone `\bREPLACE_ME\b` token — so the seeded `_comment` meta key (whose instructional text legitimately contains "REPLACE_ME") is ignored, and a consumer who replaced every real placeholder passes even with the comment retained. Full linter interface: `--file <path>` (default `<cwd>/harness.config.json`), `--quiet`, exit 0/1/2, a `<basename>: N errors, M warnings` summary line, and a final `✅ Linter passed` / `❌ Linter FAILED` line. Register in the `cmdLint` aggregator (`args: ['--file', <cwd>/harness.config.json]`, `target: <cwd>/harness.config.json`). | Catches a consumer who ran `init` but forgot to replace placeholders before `sync`. The config is the single source of truth (rendered composed docs merely propagate it), so scanning the config alone is sufficient and avoids the composed-doc false-positive surface. Skipping `_`-prefixed keys eliminates the `_comment` false positive (R2 finding). The self-host root config has no `REPLACE_ME` in scanned positions today (verified), so the linter is green on self-host. |
| C26-6 | Stray sentinel `.gitkeep` (Finding #6) | Delete BOTH `template/seeded/.gitkeep` (root) AND `template/seeded/.github/.gitkeep` — meaningless sentinels in dirs that are non-empty after a fresh init (the root always has README/config/…; `.github/` holds `workflows/` created earlier in `cmdInit`). RETAIN `template/seeded/project/clickstops/{active,done,planned}/.gitkeep` (those dirs stay empty; `tests/cs09-init.test.mjs` asserts them). Removing the sole file under `template/seeded/.github/` drops that empty dir from the seed tree — consumers still get `.github/` via the fresh-init workflow copies, so nothing is lost. | The disposition note's guidance is "delete the root sentinel and any sub-dir `.gitkeep` whose target dir is now non-empty"; both the root and `.github/` sentinels qualify. No `cmdInit` code change; grep confirms no test or code depends on either sentinel. |
| C26-7 | `.gitattributes` seed shape (Finding #9) | New `template/seeded/.gitattributes` mirroring the harness's own root `.gitattributes`: `* text=auto eol=lf` plus the binary overrides (`*.png *.jpg *.jpeg *.gif *.ico *.pdf *.zip *.gz *.tar`). The existing seeded-copy loop (create-if-missing) ships it automatically — no `cmdInit` change. Must be committed LF-encoded (the file itself asserts `eol=lf`). | Mirrors the repo's own LF discipline (CS11b), eliminating the Windows CRLF round-trip warnings a fresh consumer hits on first commit. The global `* text=auto eol=lf` already forces LF for all text, so per-extension LF overrides are unnecessary. |
| C26-8 | Backwards compatibility | The version-set is FRESH-init-only (guarded by `!configExists`), so re-running `init` never mutates an existing consumer's config (LRN-057 / C41-8). The seeded-copy loop runs unconditionally and is create-if-missing, so a re-init on an existing consumer that lacks `.gitattributes` will CREATE it — additive; it never overwrites an existing `.gitattributes`/`.gitkeep`. | Distinguishes config mutation (fresh-only) from additive create-if-missing seeding (always) — matching the actual `cmdInit` control flow (seed loop at ~1629 is unconditional; config writes are `!configExists`-gated). Adding a missing file is the behaviour every seed file already has; no existing file is modified. |
| C26-9 | Test approach | Each of the four fixes gets ≥1 test in a new `tests/cs26-init-improvements.test.mjs` (consolidated per the CS15e pattern). Version-detect tests cover the three normalization branches via seam-injected provenance: SemVer (`v`-prefixed OR bare npx-cache version) → `v`-normalized; non-tag git ref (branch/short-SHA) → full `resolved_sha`; unresolved → `v${pkg.version}`. Placeholder-linter tests include "every real placeholder replaced but `_comment` retained → exit 0" and "a real `REPLACE_ME` value → exit 1". Extend `tests/cs09-init.test.mjs` to assert a fresh init yields: a `version` that is NOT `v0.1.0`; NEITHER a root `.gitkeep` NOR `.github/.gitkeep`; a `.gitattributes` containing `eol=lf`; and (retained) the clickstops `.gitkeep` sentinels. | Consolidates CS-scoped fixtures in one file; the cs09 extension is the end-to-end guardrail. Test minimums (≥4), not exact counts — over-delivery welcome. |

## Deliverables

1. **Finding #2 fix:** `bin/harness.mjs` `cmdInit` — on FRESH init (`!configExists`), derive provenance via `resolveHarnessProvenance()` and write a NORMALIZED value into the consumer `harness.config.json` `version` (SemVer `harness_ref` → `v`-normalized `vX.Y.Z`; else real 40-hex `resolved_sha` → full SHA; else `v${package.json version}`), replacing the seeded `v0.1.0`. Per Decision C26-2.
2. **Finding #3 fix:** new `scripts/check-config-placeholders.mjs` per Decision C26-3 — JSON-parse the consumer-root `harness.config.json` (fail-closed), flag standalone `\bREPLACE_ME\b` in string values under non-`_` keys (ignores `_comment`); `--file`/`--quiet`, exit 0/1/2, `<basename>: N errors, M warnings` summary + final `✅/❌` line. Wire into the `bin/harness.mjs` `cmdLint` aggregator registry.
3. **Finding #6 fix:** delete BOTH `template/seeded/.gitkeep` and `template/seeded/.github/.gitkeep`. RETAIN the `template/seeded/project/clickstops/{active,done,planned}/.gitkeep` sentinels. Per Decision C26-6.
4. **Finding #9 fix:** new `template/seeded/.gitattributes` (`* text=auto eol=lf` + binary overrides, LF-encoded) per Decision C26-7. Shipped automatically by the existing `cmdInit` seeded-copy loop (create-if-missing).
5. **Tests:** new `tests/cs26-init-improvements.test.mjs` covering all four fixes (≥4 tests; incl. seam-injected version-detect branch tests + the `_comment`-retained linter-pass case). Extend `tests/cs09-init.test.mjs` end-to-end smoke per Decision C26-9.
6. **End-to-end fresh-install smoke validation:** during close-out, run `harness init` into a throwaway temp dir and confirm: `harness.config.json` `version` is NOT `v0.1.0` (a tag or full SHA); no root `.gitkeep` and no `.github/.gitkeep`; `.gitattributes` exists and contains `eol=lf`; the clickstops `.gitkeep` sentinels are present; and `check-config-placeholders` flags a deliberately-reintroduced `REPLACE_ME` value while passing on the retained `_comment`. Capture the transcript in the active CS file Notes.
7. **CHANGELOG.md:** add a `## [Unreleased]` entry listing the four init improvements, citing the 2026-06-09 Status-update note as the reason the scope is four findings (not the original six). The versioned release is a separate CS.
8. **`sub-invaders-bootstrap-summary.md` update** (archived under `project/clickstops/done/done_cs16_bootstrap-sub-invaders/sub-invaders-bootstrap-summary.md`): add resolution notes to Findings #2, #3, #6, #9 pointing at the CS26 close-out commit; note that #4 and #5 were dispositioned obsolete (not fixed in CS26).

## Sub-agent fan-out

Scoped to a **2-way split with disjoint file ownership** (the 2026-06-09 note allows one orchestrator session; this optional split honours the "dispatch background sub-agents" preference while keeping write scopes non-overlapping). Ownership below is exclusive — no file is written by more than one agent.

| Agent | Owned files (OWN only) | Findings |
|---|---|---|
| A — `cs26-init-and-seeds` | `bin/harness.mjs`, `template/seeded/.gitkeep` (delete), `template/seeded/.github/.gitkeep` (delete), `template/seeded/.gitattributes` (new), `tests/cs26-init-improvements.test.mjs`, `tests/cs09-init.test.mjs` | #2 (cmdInit version-set, normalized), #6 (delete BOTH stray sentinels), #9 (new seed), the `cmdLint` registry wiring for #3's linter (by the agreed path/contract), and ALL tests |
| B — `cs26-placeholder-linter` | `scripts/check-config-placeholders.mjs` (new) | #3 — the standalone linter body only: JSON-parse `harness.config.json` (fail-closed), flag standalone `\bREPLACE_ME\b` in string values under non-`_` keys (ignore `_comment`); `--file`/`--quiet`, exit 0/1/2, `<basename>: N errors, M warnings` summary + final `✅/❌` line |
| (orchestrator-owned) | active CS file, `CHANGELOG.md`, `sub-invaders-bootstrap-summary.md`, end-to-end smoke probe | Deliverables 6–8 + integration verification |

**Integration contract:** Agent A references Agent B's script by the fixed path `scripts/check-config-placeholders.mjs` and the CLI contract above; Agent B implements exactly that. Because A owns all of `bin/harness.mjs` and both test files, and B owns only the new standalone script, the write scopes are disjoint. The orchestrator runs the combined `node --test tests/*.test.mjs` + `harness lint` **after both agents land** (A's #3 test exercises B's script), and falls back to completing any failed sub-agent's scope itself.

## User-approval gates

- **No release in CS26.** This CS lands the four init fixes and a `## [Unreleased]` CHANGELOG entry only; promoting a versioned release is a separate release CS with its own G-release gate.

## Exit criteria

1. All four findings (#2/#3/#6/#9) have ≥1 corresponding change committed.
2. `tests/cs26-init-improvements.test.mjs` exists with ≥4 tests (one per finding) and `node --test tests/*.test.mjs` exits 0 with all passing.
3. `tests/cs09-init.test.mjs` end-to-end smoke extended per Decision C26-9 and passing.
4. `harness lint --quiet` passes (full suite, including the new `check-config-placeholders`).
5. End-to-end fresh-install smoke per Deliverable 6 passes all assertions; transcript captured in the CS Notes.
6. `CHANGELOG.md` `## [Unreleased]` entry present listing the four init improvements.
7. CS16's `sub-invaders-bootstrap-summary.md` Findings #2, #3, #6, #9 each have resolution notes pointing at the CS26 close-out SHA (and #4/#5 noted obsolete).
8. All implementation sub-agent reports collected with STATUS: complete + correct PREFLIGHT/FINAL SHA invariants.
9. Plan-vs-implementation review (GPT-5.5 gate) returns GO.

## Risks + open questions

| # | Risk | Mitigation |
|---|---|---|
| R1 | Version-detect (Finding #2) writes a non-tag branch name or short SHA into `version` | Normalize before writing (C26-2): SemVer `harness_ref` → `v`-normalized `vX.Y.Z` (npx-cache may yield a bare `0.16.0`); any other git ref (branch/short-SHA) → full 40-hex `resolved_sha`; unresolved → `v${package.json version}`. Never write a bare branch name or short SHA. Seam-injected tests cover all three branches. |
| R2 | `check-config-placeholders` false-positives on the seeded `_comment` (which contains "REPLACE_ME") | JSON-parse the config and scan only string VALUES under non-`_`-prefixed keys, so `_comment` is ignored; a consumer who replaced every real placeholder passes even with the comment retained. Scope is the consumer-root `harness.config.json` only (never `template/seeded/…`). A dedicated test covers "all real placeholders replaced + `_comment` retained → exit 0". |
| R3 | Deleting the seeded root `.gitkeep` (Finding #6) affects a consumer that committed one deliberately | The fix only STOPS seeding it; `sync` never deletes consumer files, so an existing committed `.gitkeep` stays. `tests/cs09-init.test.mjs` guards that the clickstops sentinels are retained. |
| R4 | Seeded `.gitattributes` (Finding #9) conflicts with a consumer's pre-existing one | The seeded-copy loop is create-if-missing (`bin/harness.mjs` line ~1642 `if (!existsSync(dest))`); an existing consumer `.gitattributes` is preserved. |
| R5 | 2-way split shares `bin/harness.mjs` write scope | NO — ownership is disjoint: Agent A owns ALL of `bin/harness.mjs` + both test files; Agent B owns ONLY the standalone new linter script. Integration is via the agreed CLI contract; the orchestrator runs the combined test+lint after both land. |
| R6 | Finding #3's hard `cmdLint` error conflicts with **issue #146 AC #1** ("a freshly-init'd consumer passes `harness lint --quiet` exit 0"): a fresh init ships intentional `REPLACE_ME` identity placeholders (`project.repo`, `templating.*`) that `config-placeholders` correctly flags → `harness lint` exits 1 on a pristine fresh init (surfaced by Agent A; missed by R2/R3). | **RESOLVED — Option A (orchestrator decision, 2026-07-04, user unavailable).** `config-placeholders` failing on a pristine fresh-init config is its INTENDED behaviour (a fresh init HAS unfilled placeholders — catching them is the whole feature). #146 is refined, not abandoned: "lint-clean out of the box" now means **structurally** clean PLUS a directive `config-placeholders` "fill in your identity" reminder. `cs46` test 5 asserts structural cleanliness via `harness lint --skip config-placeholders` (exit 0) AND asserts `config-placeholders` flags the unfilled config (exit 1) — mirrors the pattern in `cs09` test 7. The self-host root config (real values) still lints clean, so CI/startup are unaffected. **Alternative for maintainer review (Option C):** relocate the check to a `harness sync --mode=check` gate so `harness lint` stays strictly #146-clean while enforcement happens at the sync harm-point (placeholders propagate into rendered docs at sync). Deferred as an easy follow-up if the strict letter of #146 is preferred over a hard lint reminder. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.7-xhigh | rubber-duck dispatched (orchestrator: yoga-ah) | 2d48e031198c | 2026-05-14T04:50:00Z | Go-with-amendments | CS26 grandfather attestation per CS42-7 strict-flip self-host validation. Pre-CS35b backlog; plan content unchanged; backfill only. |
| R2 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: yoga-ah) | 14d1c9d5c353 | 2026-07-04T04:26:47Z | Needs-Fix | Path-B re-author review: linter would flag seeded `_comment` REPLACE_ME; provenance may write branch/short-SHA into `version`; compat + linter-interface claims need tightening. |
| R3 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: yoga-ah) | e9ad7e211bed | 2026-07-04T04:44:47Z | Go-with-amendments | R2 blockers resolved (JSON value-scan skips `_comment`; provenance normalized to tag/full-SHA/pkg-version). Amendment folded in: v-normalize bare npx-cache versions. |

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
| T0 — Scope + path: **Path B chosen** — re-authored Decisions/Deliverables to #2/#3/#6/#9 (#4/#5 dropped); R1 hash invalidated; R2 GPT-5.5 review returned Needs-Fix (linter `_comment` false-positive + provenance normalization), both addressed in-plan; R3 re-attests | done | yoga-ah | plan-review hash recomputed after revision (see `## Plan review` R3) |
| T1 — Finding #2: `bin/harness.mjs` cmdInit derives + NORMALIZES the harness ref (SemVer tag → full SHA → `v${pkg.version}`) into `harness.config.json` `version` (C26-2) | pending | — | impl; sub-agent A |
| T2 — Finding #3: new `scripts/check-config-placeholders.mjs` — JSON-parse config, flag `\bREPLACE_ME\b` in non-`_`-key string values (ignore `_comment`); basename summary + `✅/❌`; wire into cmdLint (C26-3) | pending | — | impl; sub-agent B (linter body) + A (registry wiring) |
| T3 — Finding #6: delete BOTH `template/seeded/.gitkeep` and `template/seeded/.github/.gitkeep`; retain the clickstops sentinels (C26-6) | pending | — | impl; sub-agent A |
| T4 — Finding #9: new `template/seeded/.gitattributes` (`* text=auto eol=lf` + binary overrides, LF-encoded); shipped by the existing copy loop (C26-7) | pending | — | impl; sub-agent A |
| T5 — Tests: `tests/cs26-init-improvements.test.mjs` (≥4, one per finding) + extend `tests/cs09-init.test.mjs` end-to-end smoke (C26-9) | pending | — | over-delivery on tests encouraged |
| T6 — End-to-end fresh-install smoke probe (Deliverable #6) + `CHANGELOG.md [Unreleased]` entry (Deliverable #7) | pending | yoga-ah | orchestrator-owned |
| T7 — Plan-vs-implementation review (GPT-5.5 close-out gate) | pending | yoga-ah | independence: reviewer model ≠ every implementer model |
| Close-out: docs + restart state | pending | yoga-ah | Update WORKBOARD.md and CONTEXT.md so a fresh agent can restart from actual state |
| Close-out: learnings + follow-ups | pending | yoga-ah | File LEARNINGS.md entries; add resolution notes to CS16 `sub-invaders-bootstrap-summary.md` findings #2/#3/#6/#9; file planned follow-up CSs as needed |

## Notes / Learnings

### Implementation (2026-07-04, `yoga-ah`)

Two disjoint background sub-agents implemented the four findings; the orchestrator did the integration, smoke probe, CHANGELOG, and CS16-summary notes.

**Sub-agent ledger:**

| Agent | Model | Scope | Result |
|---|---|---|---|
| `cs26-placeholder-linter` | claude-opus-4.8 | `scripts/check-config-placeholders.mjs` (new) — Finding #3 | complete; 11 fixture cases green; no commit |
| `cs26-init-and-seeds` | claude-opus-4.8 | `bin/harness.mjs` (#2 + #3 registry), delete both stray `.gitkeep`s (#6), new `.gitattributes` (#9), all tests | complete (owned green); surfaced + escalated the #146 conflict below |

**#146 reconciliation (see Risk R6 — orchestrator decision, user unavailable):** registering `config-placeholders` as a hard `cmdLint` check flags the seeded `REPLACE_ME` identity placeholders on a pristine fresh init, conflicting with issue #146 AC #1 ("fresh init passes `harness lint` exit 0"). Resolved via **Option A**: the linter failing on unfilled placeholders is its intended behaviour, so #146 is refined to "structurally clean + a directive fill-identity reminder" (`cs46` test 5 asserts structural cleanliness via `--skip config-placeholders` PLUS asserts the linter flags the unfilled config, mirroring `cs09` test 7). The sync-gate alternative (Option C) is documented in R6 for maintainer review.

### End-to-end smoke transcript (Deliverable #6)

`harness init` into a fresh `git init` temp dir (run from `cs26/content`):

- `version = aaf50f1e71fe8c9b19d2ffbbf78233ddf9d52a10` — full HEAD SHA (untagged branch → normalized to `resolved_sha`; NOT `v0.1.0`) ✓
- root `.gitkeep` exists? **False** ✓ · `.github/.gitkeep` exists? **False** ✓
- `.gitattributes` exists? **True**, contains `eol=lf` ✓
- `project/clickstops/{planned,active,done}/.gitkeep` retained? **True** ✓
- `config-placeholders` on the pristine config → flags `project.repo` (×2) + `templating.*` (exit 1 by design) ✓

A real npx-from-release consumer resolves `version` to the release tag (e.g. `v0.16.0`) via the npx-cache branch; the untagged-branch self-host smoke exercises the full-SHA fallback.

### Verification

- `node --test tests/*.test.mjs` → 1806 tests, **1802 pass / 0 fail / 4 skipped** (delta +12: cs26 +11, cs09 +1).
- `node bin/harness.mjs lint --quiet` → **36 passed / 0 failed / 3 skipped** (new `config-placeholders` row).
- `node bin/harness.mjs sync --mode=check --cwd .` → **No drift detected.**

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_