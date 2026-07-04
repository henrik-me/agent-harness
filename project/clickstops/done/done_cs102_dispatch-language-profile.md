# CS102 — harness dispatch: language-agnostic preamble core + consumer-selectable language profile

**Status:** done
**Owner:** yoga-ah-c2
**Branch:** cs102/content
**Started:** 2026-07-03
**Closed:** 2026-07-04
**Filed by:** yoga-ah-c2 (Claude Opus 4.8), 2026-07-03 — from inbound enhancement #423 (filed by the harness orchestrator from consumer repo `henrik-me/authzandentitlements`, CS10; a .NET 10 / C# consumer). 
**Depends on:** none. Touches `lib/dispatch.mjs`, `bin/harness.mjs` (cmdDispatch), `schemas/harness.config.schema.json`, `OPERATIONS.md` + `template/composed/OPERATIONS.md` (preamble restructure), tests. Disjoint from the concurrent CS100 (#421, yoga-ah) surfaces.

## Goal

Fix issue #423: the canonical sub-agent briefing preamble emitted by `harness dispatch` (OPERATIONS.md § Mandatory briefing preamble) is Node/ESM/harness-repo-centric — "ESM `.mjs` only … no npm deps", "run `npm install` … `node --test`", "`requireValue` arg guard", "read `schemas/*.schema.json` before field access", "`node -c` any authored `.mjs`". For a **non-Node consumer** (e.g. a .NET/Aspire project) these are irrelevant noise the orchestrator must manually negate in **every** dispatch. Split the preamble into a language-**agnostic** managed core + a consumer-selectable **language profile** (`node` / `dotnet` / …) supplying the language-specific conventions and self-check commands, selected via `harness.config.json`, so `harness dispatch` emits the right one.

## Background

`harness dispatch` (bin/harness.mjs `cmdDispatch` :4702 → `emitBriefingFromFile` :4739) reads `OPERATIONS.md`, and `lib/dispatch.mjs` `extractPreamble` pulls the single ```` ```text ```` fence (anchored on `## CRITICAL PREFLIGHT (LRN-021)`) verbatim, appends task sections, and prints it. The fence (OPERATIONS.md:1124-1254) mixes:

- **Language-agnostic** items: `## CRITICAL PREFLIGHT (LRN-021)`, `## File ownership (LRN-016)`, `## Required reading`, `## Reporting independence (CS48)`, `## Mandatory report shape`, and agnostic conventions (LF/no-BOM, no dot-notation placeholders, cross-repo path discipline, fail-closed parsers).
- **Node-specific** items concentrated in `## Conventions to follow` (ESM `.mjs`/Node 20+, `npm install` for fresh worktrees, `requireValue` arg guard, `schemas/*.schema.json`-first field access, stdout/stderr `--quiet`, consumer-root-relative `import.meta.url` paths) and `## Self-checks before reporting` (`node --test`, `node -c`, template linter).

`harness.config.json` has **no** `dispatch`/`language` key today. The `.NET` consumer (CS10) pasted the verbatim preamble **and** appended a ".NET REPO OVERRIDES" block negating the ESM/npm/`requireValue`/schema items and substituting `dotnet build`/`dotnet test` — error-prone, repeated per dispatch.

The design must preserve `dispatch.mjs`'s "extract from the rendered doc" leverage principle (LRN-073/C64-2: the emitted block stays byte-equal to the documented source). The `node` profile must remain **capability-complete** (every current convention + self-check bullet), though its output is **reordered** by the restructure (agnostic bullets grouped ahead of the language block) — NOT byte-identical to the pre-CS102 output; existing `dispatch`/`cmdDispatch` tests are updated to the new structure and a fresh golden freezes the new `node` briefing (C102-2a).

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C102-1 | Config-selected profile | Add `dispatch.language_profile` to `schemas/harness.config.schema.json` — `type:string`, `enum:["node","dotnet"]`, `default:"node"`. `cmdDispatch` reads it (default `node` when the key/section is absent) and accepts a `--language-profile <name>` CLI override (via `requireValue`). | Drives profile selection from config per the issue, with a per-invocation override. Default `node` keeps the self-host + every existing consumer unchanged (backward-compatible → the addition is Minor, not a breaking required field). |
| C102-2 | Preamble restructure: agnostic core + profile fences | In `OPERATIONS.md`, keep the core ```` ```text ```` fence but restructure `## Conventions to follow` and `## Self-checks before reporting` so each holds its **agnostic** bullets first, followed by a single injection marker: `## Conventions to follow` = LF/no-BOM, no-dot-notation-placeholders, cross-repo path discipline, fail-closed parsers, then `<!-- harness:dispatch-language-conventions -->`; `## Self-checks before reporting` = git-status, git-log, run the harness lint command (the rendered `{{harness_invoke}}` value in the root doc / the `{{harness_invoke}}` placeholder in the composed base per C102-5), then `<!-- harness:dispatch-language-self-checks -->`. Add a `#### Language profiles` subsection with one ```` ```text ```` fence per profile, each anchored by first content line `## LANGUAGE PROFILE: <name>` and split by `<!-- harness:profile-self-checks -->` into `conventions`/`self-checks` parts. `node` conventions = ESM `.mjs`/Node20+, fresh-worktree `npm install`, `requireValue`, schema-first field access, stdout/stderr, consumer-root-relative paths; `node` self-checks = `node --test`, `node -c`. `dotnet` = C#/.NET conventions (`.csproj`/`.sln`/`Directory.Packages.props` ownership; NuGet central pkg mgmt; no `requireValue`/`.mjs`) + `dotnet build`/`dotnet test`/`dotnet format` self-checks. **This reorders the `node` output** (agnostic bullets now grouped before the language block) — a one-time, functionally-neutral change; it is NOT byte-identical to the pre-CS102 output. | Single marker per section avoids the multi-marker complexity the interleaved current ordering would otherwise require (plan-review finding). Agnostic discipline (fail-closed, self-check skeleton) stays in the core per the issue; language items are cleanly profile-supplied. |
| C102-2a | `node` completeness, not byte-identity | The `node` profile MUST contain **every** language-specific convention + self-check bullet present today (no capability loss); a golden regression test captures the NEW `node`-profile briefing and asserts it is stable and complete. Existing `dispatch`/`cmdDispatch` tests are updated to the new structure. | The current interleaving makes strict byte-identity-to-today incompatible with a clean single-marker split (plan-review finding c); completeness + a fresh golden is the correct regression guard. |
| C102-3 | `lib/dispatch.mjs` splice logic | Add `extractLanguageProfile(operationsMd, profileName)` (mirrors `extractPreamble`: find the `## LANGUAGE PROFILE: <name>` anchored ```` ```text ```` fence; split on the `<!-- harness:profile-self-checks -->` marker into `{conventions, selfChecks}`; fail-closed with a clear `Error` if the profile fence or marker is missing). Thread a `languageProfile` option through `emitBriefing`/`emitBriefingFromFile`: extract the core, then substitute the two core injection markers with the profile's `conventions`/`selfChecks` bodies. Unknown profile / missing fence → throw (the CLI maps to stderr + **exit 2**, bad-usage — consistent with `cmdDispatch`'s `die(...,2)` on an unknown `--language-profile`/config value). | Reuses the proven extract-and-anchor pattern; deterministic marker substitution; fail-closed on a mis-named profile rather than silently emitting a core with dangling markers. |
| C102-4 | `cmdDispatch` config loading + wiring + backward-compat | `cmdDispatch` does **not** read config today (it only resolves `cwd` + `OPERATIONS.md`). Add explicit **fail-closed** config loading: `existsSync(<cwd>/harness.config.json)` → if present, `JSON.parse(stripBOM(readFileSync(...)))` and `die(...,1)` on malformed JSON (mirror `readConfigForReviewGates`:1002); if absent, treat as no override. **Do NOT use `loadConfig`:987** — its `readJSONOrNull` swallows malformed JSON as `null`, which would silently fall through to `node` instead of failing closed. Resolve the profile: `--language-profile <name>` override → `config.dispatch?.language_profile` → `"node"`. Validate the resolved name against the known profiles and `die(...,2)` on an unknown value. Pass it to `emitBriefingFromFile`. Absent config / `node` + no flags ⇒ the emitted briefing is complete and node-correct (reordered per C102-2). | The plan originally assumed config was available; it is not, and `loadConfig` swallows malformed JSON (plan-review findings). Loading must be explicit and fail-closed on malformed config or an unknown profile. |
| C102-5 | Composed lockstep (placeholder-preserving) | Mirror the `OPERATIONS.md` preamble restructure into `template/composed/OPERATIONS.md` **preserving its `{{…}}` templating placeholders** — the composed base is NOT byte-identical to the rendered root (e.g. the no-dot-notation bullet is `{{agent_suffix}}` in composed vs `ah` in root; `{{harness_invoke}}` in the self-check skeleton). Author both from the same structure, keeping composed placeholders and root rendered values. Verify with `sync --mode=check` (renders composed → compares to root) + the composed-blocks lint. | The composed OPERATIONS.md carries templating substitutions (17 `{{…}}`), so a blind byte-copy would corrupt them (plan-review finding). Lockstep here means structural parity with placeholders intact, validated by sync-check. |
| C102-6 | SemVer | **Minor** — new optional config field `dispatch.language_profile` (backward-compatible, defaulted) + new `--language-profile` flag + new capability. No breaking change (default reproduces current behaviour; no field removed/renamed). CHANGELOG `[Unreleased] → Added`. | Per OPERATIONS SemVer policy: "New optional config field (backward-compatible addition) → Minor"; a new capability/flag is Minor. |

## Deliverables

1. `schemas/harness.config.schema.json` (edit) — add a `dispatch` object with `language_profile` (`enum:["node","dotnet"]`, `default:"node"`), `additionalProperties:false`, described. Place it as a top-level optional key alongside the existing sections.
2. `OPERATIONS.md` (edit) — restructure § Mandatory briefing preamble per C102-2: agnostic bullets first + one injection marker in each of Conventions/Self-checks; add the `#### Language profiles` subsection with the `node` + `dotnet` ```` ```text ```` fences (each `## LANGUAGE PROFILE: <name>` + `<!-- harness:profile-self-checks -->` split). The `node` fence's two parts must contain **exactly** the language-specific bullets removed from the core (no capability loss); the spliced `node` output is complete + stable per C102-2a (reordered — NOT byte-identical to the pre-CS102 output).
3. `template/composed/OPERATIONS.md` (edit) — identical restructure in the managed-core region (lockstep with root).
4. `lib/dispatch.mjs` (edit) — `extractLanguageProfile()` + `languageProfile` threading through `emitBriefing`/`emitBriefingFromFile` + marker substitution + fail-closed errors; update the module JSDoc.
5. `bin/harness.mjs` (edit) — `cmdDispatch` must **fail-closed load** `<cwd>/harness.config.json`: `existsSync`-gate then `JSON.parse(stripBOM(...))` with `die(...,1)` on malformed JSON (mirror `readConfigForReviewGates`:1002); **not** `loadConfig`:987 (it swallows malformed JSON → `null`). Resolve the profile (`--language-profile <name>` flag via `requireValue` → `config.dispatch?.language_profile` → `node`), validate it (`die(...,2)` on unknown), and pass it to `emitBriefingFromFile`. Add `--language-profile <name>` to `SUBCOMMAND_HELP['dispatch']`.
6. `tests/*` (edit/add) — `tests/lib-dispatch.test.mjs` (+ a new `tests/cs102-dispatch-language-profile.test.mjs`): (a) the default/`node` profile output is captured as a golden and asserted **complete** (contains every current convention + self-check bullet) and stable; (b) `dotnet` profile emits the .NET conventions + `dotnet` self-checks and NONE of the `.mjs`/`npm`/`requireValue` node bullets; (c) unknown profile → thrown `Error` / CLI exit non-zero; (d) `--language-profile` overrides config; (e) config `dispatch.language_profile` selects the profile; (f) the core agnostic sections (PREFLIGHT, ownership, report shape) appear for every profile; (g) malformed `harness.config.json` → `cmdDispatch` fails closed (non-zero), not a silent `node` default. Minimum coverage; over-delivery welcome.
7. `CHANGELOG.md` (edit) — `[Unreleased] → Added` bullet referencing #423.
8. `LEARNINGS.md` (edit, at close-out) — learning: a managed briefing/preamble that mixes cross-language discipline with one ecosystem's toolchain forces every non-matching consumer to negate it per-dispatch; factor language-specifics into a config-selected profile behind an agnostic core. Cross-ref #423.

## User-approval gates

- **(none)** — additive, backward-compatible (default `node` preserves current capabilities/behaviour; its output is reordered, not byte-identical, per C102-2a). The `dotnet` profile content is derived from the #423 evidence; refine later if a real .NET dispatch surfaces gaps.

## Exit criteria

- `harness dispatch` with no config / `language_profile:"node"` emits a briefing that retains **every** current convention + self-check bullet (reordered per C102-2, no capability loss), verified by a golden completeness test + manual `harness dispatch --no-fence` inspection.
- `harness dispatch` with `dispatch.language_profile:"dotnet"` (or `--language-profile dotnet`) emits the .NET conventions + `dotnet build`/`dotnet test` self-checks and omits the `.mjs`/`npm`/`requireValue`/`node --test` node bullets; the agnostic core (preflight, ownership, report shape) is present.
- An unknown profile fails closed (stderr + **exit 2**, bad-usage), not a silent core with dangling markers.
- `node --test tests/*.test.mjs` passes; `node bin/harness.mjs lint --quiet` exits 0; `node bin/harness.mjs sync --mode=check --cwd .` reports no drift (OPERATIONS lockstep).
- Issue #423 closes on merge.

## Risks + open questions

- **R1 — `node` capability loss / output drift.** The restructure reorders the `node` output (C102-2) — acceptable — but must not DROP any convention/self-check bullet. Mitigation: C102-2a requires the `node` profile to carry every current language-specific bullet; a fresh golden regression test captures + freezes the new `node` briefing and asserts completeness. Existing `dispatch`/`cmdDispatch` tests are updated to the new structure.
- **R2 — extractor fragility.** Adding a second anchored-fence extractor (`extractLanguageProfile`) alongside `extractPreamble` must tolerate the interleaved `#### Language profiles` heading + multiple fences. Mitigation: anchor on the unique `## LANGUAGE PROFILE: <name>` first-content-line (same pattern as `extractPreamble`'s `## CRITICAL PREFLIGHT` anchor); fail-closed if not found.
- **R3 — composed lockstep drift.** The root + composed OPERATIONS.md preamble share structure but the composed base keeps `{{…}}` placeholders where root has rendered values, so they are NOT byte-identical. Mitigation: author both from the same structure preserving composed placeholders; `sync --mode=check` (renders composed → compares to root) + composed-blocks lint in exit criteria catch any real drift.
- **R4 — scope of `dotnet` profile.** It is a best-effort starter derived from #423, not an exhaustive .NET spec. Mitigation: documented as refinable; the agnostic core carries the load-bearing discipline (preflight, ownership, report shape) regardless of profile accuracy.
- **(Resolved) OQ — inject vs append the profile?** Inject at in-core markers (chosen) keeps Conventions/Self-checks coherent and the report shape last, vs appending a trailing profile block after the report shape.

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | cs102-plan-review | df742954d607 | 2026-07-03T23:04:00Z | Needs-Fix | 2 blocking: cmdDispatch reads no config today (must load+fail-closed); single conventions marker can't preserve node byte-identity (interleaved bullets). |
| R2 | gpt-5.5 | claude-opus-4.8 | cs102-plan-review2/3/4/5 | ce67a4c07fe8 | 2026-07-03T23:16:00Z | Needs-Fix | Config-load + reorder/completeness + composed-placeholder findings resolved; residual prose contradictions (Background/User-approval byte-identity) + unknown-profile exit 1-vs-2. |
| R3 | gpt-5.5 | claude-opus-4.8 | cs102-plan-review6 | 1980f8ae68ac | 2026-07-03T23:22:00Z | Go | All resolved: node capability-complete/reordered (not byte-identical); cmdDispatch fail-closed config load (not loadConfig); composed placeholders preserved; unknown-profile exit 2; SemVer Minor. |

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | yoga-ah-c2 (sub-agent cs102-impl) |
| Reviewer agent | rubber-duck (orchestrator: yoga-ah-c2) |
| Notes | **Minor** SemVer (new optional `dispatch.language_profile` config + `--language-profile` flag + language-profile capability). Independence per REVIEWS § 2.3 — reviewer `gpt-5.5` ≠ implementer `claude-opus-4.8`. Plan reviewed by gpt-5.5 (R3 Go, hash `1980f8ae68ac`; 6-round review, R1/R2 Needs-Fix resolved). Finalized at close-out. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1 — `schemas/harness.config.schema.json`: add `dispatch.language_profile` (enum node/dotnet, default node, additionalProperties:false) (C102-1) | done | yoga-ah-c2 | agent-id=yoga-ah-c2 \| role=implementer (sub-agent cs102-impl) \| report-status=complete \| learnings=0 |
| T2 — `OPERATIONS.md` + `template/composed/OPERATIONS.md`: preamble restructure — agnostic core (markers in Conventions/Self-checks) + `#### Language profiles` node+dotnet fences; composed placeholders preserved (C102-2/C102-5) | done | yoga-ah-c2 | agent-id=yoga-ah-c2 \| role=implementer (sub-agent cs102-impl) \| report-status=complete \| learnings=0 |
| T3 — `lib/dispatch.mjs`: `extractLanguageProfile()` + `languageProfile` threading + marker splice + fail-closed (C102-3) | done | yoga-ah-c2 | agent-id=yoga-ah-c2 \| role=implementer (sub-agent cs102-impl) \| report-status=complete \| learnings=0 |
| T4 — `bin/harness.mjs` cmdDispatch: fail-closed config load (existsSync+JSON.parse, not loadConfig) + `--language-profile` flag + validate + help (C102-4) | done | yoga-ah-c2 | agent-id=yoga-ah-c2 \| role=implementer (sub-agent cs102-impl) \| report-status=complete \| learnings=0 |
| T5 — tests (`lib-dispatch` + new `cs102-*`: node completeness golden, dotnet, unknown→exit2, flag/config select, malformed-config fail-closed) + `CHANGELOG.md` `[Unreleased]` Added (#423) | done | yoga-ah-c2 | agent-id=yoga-ah-c2 \| role=implementer (sub-agent cs102-impl) \| report-status=complete \| learnings=0 |
| Independent content review (GPT-5.5) | done | gpt-5.5 | R1 Go @ 182f931 (cs102-review); R2 Go @ dd47370; R3 Go @ 6a8f0f8 (post-v0.15.0 rebase); +golden fast-follow PR #454 (R1-R4 Go); Copilot COMMENTED (nits adopted, clean at HEAD); reviewer ≠ implementer per REVIEWS § 2.3 |
| Close-out: docs + restart state | pending | yoga-ah-c2 | Update WORKBOARD.md (remove CS102 row) + CONTEXT.md; OPERATIONS.md is a rendered-doc change (composed lockstep). |
| Close-out: learnings + follow-ups | pending | yoga-ah-c2 | File LEARNINGS.md language-profile-vs-agnostic-core entry; #423 auto-closes on merge. |

## Notes / Learnings

- Bundles the single inbound enhancement #423. Sibling CS10 learnings LRN-018/020 also spawned #420 (CS97, done), #421 (CS100, yoga-ah), #422 (CS101, done), #424 — each its own CS.

## Plan-vs-implementation review

**Reviewer:** GPT-5.5 (rubber-duck; background agents `cs102-pvi` → `cs102-pvi2`, independent of the claude-opus implementer per REVIEWS § 2.3)
**Date:** 2026-07-04T00:45:00Z
**Outcome:** GO

Reviewed the CS102 plan (§ Decisions C102-1…C102-6, § Deliverables 1–8, § Exit criteria) against the merged content (PR #451 squash `35c1f59` + the D6a golden fast-follow PR #454 squash `3100b58`).

| Deliverable | Outcome | Assessment |
|---|---|---|
| 1 — schema `dispatch.language_profile` | match | Optional top-level, enum `node`/`dotnet`, default `node`, `additionalProperties:false`. |
| 2 — OPERATIONS.md core + profiles | match | Agnostic core (PREFLIGHT/ownership/reading/independence/report-shape + agnostic conventions) with 2 injection markers + `#### Language profiles` node/dotnet fences. |
| 3 — composed lockstep | match | `template/composed/OPERATIONS.md` mirrors the restructure preserving `{{harness_invoke}}`/`{{agent_suffix}}` placeholders; `sync --mode=check` no drift. |
| 4 — `lib/dispatch.mjs` | match | `extractLanguageProfile` + `spliceLanguageProfile` + `languageProfile` threading; fail-closed on unknown/missing profile. |
| 5 — `cmdDispatch` | match | Fail-closed config load (`existsSync`+`JSON.parse`, NOT `loadConfig`); `--language-profile` flag; `die 2` on unknown; help updated. |
| 6 — tests | match | +23 functional tests (splice/no-dangling-markers, node completeness, dotnet exclusion, unknown→exit2, flag/config select, malformed-config fail-closed) **+ 2 LF-normalized golden regression tests** freezing the full node/dotnet briefing (D6a, filed as fast-follow #454). |
| 7 — CHANGELOG | match | `[Unreleased] → Added` #423 (correctly NOT under `[0.15.0]`, since CS102 merged after the v0.15.0 tag). |
| 8 — LEARNINGS | done at close-out | LRN-195 filed in this close-out. |

**Accepted divergence (remediated):** the initial content PR (#451) implemented D6's node golden as token-**completeness** assertions but not an exact-output **stable** golden (C102-2a). The close-out PVI (`cs102-pvi`) returned NEEDS-FIX on this; it was remediated by the golden fast-follow PR #454 (LF-normalized golden fixtures + `assert.equal`), and the re-run PVI (`cs102-pvi2`) returned **GO** (5/5 exit criteria; D6 resolved). The `node` output is capability-complete but reordered (agnostic bullets grouped ahead of the language block) — accepted per C102-2/C102-2a. #423 CLOSED on merge; no overclaims.
