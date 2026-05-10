# CS15d — Linter expansion (umbrella: CS06b + CS08b + CS10b)

**Status:** active
**Owner:** yoga-ah
**Branch:** cs15d/content (after claim)
**Started:** 2026-05-09
**Closed:** —
**Filed by:** Pre-CS16 backlog cleanup (planning PR for cs15-cleanup-planning, 2026-05-09); user authorization for Option C umbrella bundling 2026-05-09 ("you can add the CS structure needed to optimize for parralelism").
**Depends on:** CS06 (structural linters), CS08 (managed/composed process docs), CS10 (scaffolds), CS15c (uses `lib/config-reader.mjs` consistency with `--config` threading)

## ⚠️ RESUME POINT — read this first if you're a fresh agent instance

This is the **second** umbrella in the pre-CS16 backlog cleanup sequence:
**CS15c → CS15d → CS15e**, executed sequentially.

CS15d is the largest of the three umbrellas: 8-way Wave 1 sub-agent fan-out
(matching the previous high-water mark at CS06's 9-way and CS08's 8-way) plus
1 sequential Wave 2 owner for `bin/harness.mjs cmdLint` aggregator wiring.

When this CS is claimed, the three superseded planned files (`planned_cs06b_*.md`,
`planned_cs08b_*.md`, `planned_cs10b_*.md`) get moved to `done/` at close-out
with the standard "absorbed by CS15d" pointer.

**Bootstrap to claim:** see `planned_cs15c_cli-surface-cleanup.md` § Bootstrap;
expected counts after CS15c lands: 548+/0 tests, 15/0/3 lint, no drift.

## Goal

Expand the harness lint aggregator from 15 to 17 linters and refactor 3 existing
linters to use shared parser primitives, closing 4 process-debt items:

1. **CS06b:** Refactor `scripts/check-instructions.mjs`, `scripts/check-readme.mjs`, `scripts/check-clickstop.mjs` to use `lib/doc-schema.mjs` primitives (eliminating ad-hoc markdown parsing flagged in CS06 R1 NB-6/NB-8). Add `lib/config-reader.mjs` and `lib/lock-reader.mjs` shared helpers (closes [LRN-039](../../../LEARNINGS.md#lrn-039) and [LRN-042](../../../LEARNINGS.md#lrn-042) anti-patterns). Extend `check-instructions.mjs` with cross-file link validation for `LEARNINGS.md#lrn-NNN` and `docs/adr/*.md#anchor` references.
2. **CS08b:** New `scripts/check-templates.mjs` linter (3 rules) catching the template-authoring regressions documented in [LRN-049](../../../LEARNINGS.md#lrn-049), [LRN-050](../../../LEARNINGS.md#lrn-050), [LRN-051](../../../LEARNINGS.md#lrn-051).
3. **CS10b part 1:** New `scripts/check-scaffold-readme.mjs` linter validating the structure of harness-side scaffold pattern docs (`scaffolds/<name>/README.md`); separate from `check-readme.mjs` because the criteria differ.
4. **CS10b part 2:** Aggregator integration of optional shipped scaffold linters — when a consumer's `harness.config.json` `scaffolds[]` includes `migrations` or `feature-flags`, `harness lint` automatically dispatches the corresponding shipped linter against the consumer repo (graceful-skip if the script is not present, consistent with `pr-body` / `compose-v2` / `public-artifact`).

All four originate from CS06/CS08/CS10 close-out review findings.

## Absorbs

| Constituent | Origin | What it brings |
|---|---|---|
| [CS06b](../planned/planned_cs06b_shared-parser-refactor-and-cross-link-validation.md) | CS06 R1 NB-6/NB-8 + LRN-039/042 | `lib/{config,lock}-reader.mjs` + 3 linter refactors + cross-link validation |
| [CS08b](../planned/planned_cs08b_template-linter.md) | LRN-049/050/051 | `check-templates.mjs` (3 rules) |
| [CS10b](../planned/planned_cs10b_scaffold-readme-linter-and-aggregator-integration.md) | LRN-063 + CS10 PR #29 § "Notable scope adjustment" | `check-scaffold-readme.mjs` + aggregator integration of optional shipped linters |

## Resolved decisions

| Decision | Choice | Rationale |
|---|---|---|
| `lib/config-reader.mjs` shape | Function `loadConfig({cwd, configPath})` returns `{config, schema-validated}` or throws typed errors. Mirrors CS15c's `--config` threading semantics. | Schema-first per LRN-039; consistent with `--config` cwd-or-explicit pattern. |
| `lib/lock-reader.mjs` shape | Function `loadLock({cwd})` plus accessor `getComposedBlocks(lock, file)` returning the `files[].blocks[]` shape per the lock schema. | Schema-canonical access; eliminates LRN-042 guessed-shape risk. |
| `check-instructions.mjs` cross-link validation scope | LRN anchors must exist in LEARNINGS.md; ADR file references must resolve to a file. Other intra-doc anchors (e.g., `OPERATIONS.md#claim`) explicitly **out of scope** (deferred — adds complexity). | Bounded scope; matches CS06b spec letter; can extend later. |
| CS08b Rule 3 forbidden tokens | Allowlist: `TODO:` and `FIXME:` only (case-insensitive at start of line or after whitespace). Wider lists deferred. | Spec example list; expansion is a future incremental linter change. |
| CS10b aggregator scaffold-readme walk | Self-host case only (when `package.json.name === '@henrik-me/agent-harness'`); skip in consumer cwd. Mirrors `check-pack` self-host guard per [LRN-077](../../../LEARNINGS.md#lrn-077). | Keeps linter behavior context-appropriate; no false-positives in consumer repos that have no `scaffolds/` dir at the harness root. |
| CS10b aggregator shipped-linter dispatch | When `scaffolds[<name>]` is in config AND `scripts/check-<name>-policy.mjs` exists in consumer cwd, dispatch it; else graceful-skip with a "scaffold linter X not present in consumer; skipped" message. | Matches existing `pr-body`/`compose-v2`/`public-artifact` skipped-target pattern. |

## Deliverables

### CS06b (shared parsers + cross-link validation)

- [ ] `lib/config-reader.mjs` (NEW) + `tests/lib-config-reader.test.mjs` (NEW; ≥4 tests)
- [ ] `lib/lock-reader.mjs` (NEW) + `tests/lib-lock-reader.test.mjs` (NEW; ≥4 tests)
- [ ] Refactor `scripts/check-instructions.mjs` to use `lib/doc-schema.mjs` exclusively (remove ad-hoc parsing); add cross-link validation per § Resolved decisions; remove `TODO(CS06b)` markers.
- [ ] Refactor `scripts/check-readme.mjs` to use `lib/doc-schema.mjs` exclusively; remove `TODO(CS06b)` markers.
- [ ] Refactor `scripts/check-clickstop.mjs` to use `lib/doc-schema.mjs` exclusively; remove `TODO(CS06b)` markers. **VERIFY** the `## Plan-vs-implementation review` H2 detection (CS03b/[LRN-064](../../../LEARNINGS.md#lrn-064) gate) does not regress — anchored regex must still match exactly.
- [ ] Update tests for the 3 refactored linters to cover the new cross-link validation (check-instructions) and confirm no regression on existing behavior. Add ≥1 fixture for dead `LEARNINGS.md#lrn-999` anchor → expect non-zero exit.

### CS08b (`check-templates.mjs`)

- [ ] `scripts/check-templates.mjs` (NEW) implementing 3 rules:
  - **Rule 1 (LRN-049):** Reject `{{X.Y}}` dot-notation placeholders (regex `/\{\{[^}]+\.[^}]+\}\}/`).
  - **Rule 2 (LRN-050):** Reject `../` relative paths in template files (regex `/\.\.\//`).
  - **Rule 3 (LRN-051):** Under `template/managed/.github/`, files matching `*template*` (case-insensitive in basename) reject literal `TODO:` and `FIXME:` tokens (case-insensitive). Use a unicode-safe boundary check (`(?:^|\s)(TODO|FIXME):`).
- [ ] CLI: `--file <path>` and `--dir <path>` (one of) and `--cwd <path>`; `requireValue(args, i, flagName)` guard per [LRN-040](../../../LEARNINGS.md#lrn-040); `--quiet` to suppress success.
- [ ] `tests/check-templates.test.mjs` (NEW) with ≥12 tests across the fixtures.
- [ ] `tests/fixtures/cs15d/check-templates/` (NEW) — note: dir is `cs15d` because absorbed; original spec said `cs08b/`:
  - `valid/` — templates that pass all 3 rules
  - `dot-notation/` — template containing `{{project.name}}` (Rule 1)
  - `relative-path/` — template containing `../LEARNINGS.md` (Rule 2)
  - `self-ref-token/` — PR template basename `*template*.md` containing `TODO:` (Rule 3)
- [ ] Wire into `bin/harness.mjs cmdLint` (Wave 2 / β9).
- [ ] Remove any `TODO(CS08b)` markers.

### CS10b part 1 (`check-scaffold-readme.mjs`)

- [ ] `scripts/check-scaffold-readme.mjs` (NEW):
  - CLI: `--file <path>` `--name <scaffold-name>` `[--quiet]`. `requireValue` guard.
  - Validates `# Scaffold: <name>` H1 matches the directory name.
  - Validates required H2s present: `## When to use`, `## What it ships`, `## Customization points`, `## How to invoke`. Optional H2: `## Configuration`.
  - Stdout for the report; stderr for errors. `--quiet` suppresses success.
- [ ] `tests/check-scaffold-readme.test.mjs` (NEW) covering happy + missing-H2 + mismatched-name + parameterized over the 8 in-tree scaffold READMEs.
- [ ] Run cleanly against all 8 in-tree `scaffolds/*/README.md` files (verify before wiring; if any fails the new linter, the spec winner: linter spec is correct, scaffold READMEs need a one-line fix).

### CS10b part 2 (aggregator integration)

- [ ] `bin/harness.mjs cmdLint` (Wave 2 / β9):
  - Walk `scaffolds/*/README.md` (relative to harness package root, NOT consumer cwd) under self-host guard (per LRN-077); dispatch `check-scaffold-readme.mjs` for each.
  - When running against a consumer cwd whose `harness.config.json` has `scaffolds[]` populated, for each entry: if `scripts/check-<name>-policy.mjs` exists in consumer cwd, dispatch it against the consumer's relevant directory (`migrations/` for migrations, `feature-flags/` for feature-flags); else graceful-skip.
  - Update `--help` text to document the 2 new linters and the auto-dispatch behavior.
- [ ] `tests/cs15d-aggregator.test.mjs` (NEW) — fixture test: consumer dir with `scaffolds: ["migrations"]` invokes the migration linter; same for feature-flags; missing-script case skips gracefully.
- [ ] Update `template/managed/INSTRUCTIONS.md` if it mentions linter count (verify post-change count matches).

### Joint deliverables

- [ ] Update `template/composed/OPERATIONS.md` § Sub-agent dispatch (canonical preamble) to mention `check-templates` as part of the self-check linter list. Re-render root `OPERATIONS.md` via `--resolved-sha` per LRN-070/074.

## Sub-agent fan-out

**Wave 1: 8 parallel sub-agents** (all disjoint files):

| Agent | Owns (write-allowed) | Deliverables |
|---|---|---|
| β1 | `lib/config-reader.mjs` + `tests/lib-config-reader.test.mjs` | CS06b shared config helper |
| β2 | `lib/lock-reader.mjs` + `tests/lib-lock-reader.test.mjs` | CS06b shared lock helper |
| β3 | `scripts/check-instructions.mjs` + `tests/check-instructions.test.mjs` | CS06b refactor + cross-link validation |
| β4 | `scripts/check-readme.mjs` + `tests/check-readme.test.mjs` | CS06b refactor |
| β5 | `scripts/check-clickstop.mjs` + `tests/check-clickstop.test.mjs` | CS06b refactor (preserve LRN-064 gate detection) |
| β6 | `scripts/check-templates.mjs` + `tests/check-templates.test.mjs` + `tests/fixtures/cs15d/check-templates/` | CS08b new linter + fixtures |
| β7 | `scripts/check-scaffold-readme.mjs` + `tests/check-scaffold-readme.test.mjs` | CS10b part 1 new linter |
| β8 | `tests/cs15d-aggregator.test.mjs` | CS10b part 2 aggregator test (against stub bin/harness.mjs interface; rebases against β9 once Wave 2 lands) |

**Wave 2: 1 sequential sub-agent** (orchestrator-owned):

| Agent | Owns | Deliverables |
|---|---|---|
| β9 (orchestrator) | `bin/harness.mjs` `cmdLint` + `template/managed/INSTRUCTIONS.md` (linter count update; template-side edit only) + `template/composed/OPERATIONS.md` (preamble update; template-side edit only) | Wire β6 + β7 linters; aggregator extension for β8's auto-dispatch; doc updates (template-side only) |

**File ownership disjointness:** ✅ — β1–β8 disjoint; β9 sequential after Wave 1.

**Sub-agent commit discipline.** Per [OPERATIONS.md § Sub-agent dispatch](../../../OPERATIONS.md#sub-agent-dispatch) and [LRN-021](../../../LEARNINGS.md#lrn-021), **sub-agents do not commit**. β1–β8 (and β9 if dispatched as a sub-agent) stage edits and report back. The orchestrator stages all output, runs full validation, makes a single content commit, and then does the post-commit lock-fixup re-render of root `INSTRUCTIONS.md` + `OPERATIONS.md` via `node bin/harness.mjs sync --mode=apply --resolved-sha <content-commit-sha> --cwd .` per [LRN-070/074](../../../LEARNINGS.md#lrn-070).

## Exit criteria

- 548+ tests still pass (CS-α adds ≥10 to bring baseline; CS-β adds ≥30 new: ≥12 CS06b + ≥12 CS08b + ≥6 CS10b).
- `harness lint --quiet`: now **24/0/3** in self-host (15 base + `templates` + 8 per-scaffold `scaffold-readme:<name>` rows). The original plan estimated **17/0/3** assuming `scaffold-readme` would aggregate to a single row; the implementation chose the per-scaffold visibility pattern already used by `composed-blocks:` (one row per file). Non-self-host consumers see **17/0/3** (15 base + `templates` + a single skipped `scaffold-readme` row), matching the plan's spirit. Skipped count unchanged at 3 in both.
- `harness sync --mode=check --cwd .`: "No drift detected".
- `validate-schemas.mjs`: still passes (4 schemas).
- New cross-link validation in `check-instructions.mjs` rejects fixture with dead `LEARNINGS.md#lrn-999`.
- No `TODO(CS06b)`, `TODO(CS08b)`, `TODO(CS10b)` markers remain.
- Three superseded planned files moved to `done/` with `**Status:** done` and "absorbed by CS15d" note.
- `harness lint --cwd <consumer-with-scaffolds-migrations>` invokes `check-migration-policy.mjs` automatically; same for feature-flags.

## LRN range reservation

LRN-087..094 reserved for CS15d. Expected ~4-6 LRNs (likely: shared-library refactor pattern, cross-link validation gotchas, scaffold self-host guard pattern, aggregator extension pattern).

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| Claim PR (rename planned → active; populate Tasks; WORKBOARD update) | done | yoga-ah | branch `workboard/cs15d-claim`; this PR |
| β1: `lib/config-reader.mjs` + `tests/lib-config-reader.test.mjs` (≥4 tests) | done | sub-agent β1 | 6/6 tests; Ajv2020 schema validator; LRN-039 compliant |
| β2: `lib/lock-reader.mjs` + `tests/lib-lock-reader.test.mjs` (≥4 tests) | done | sub-agent β2 | 8/8 tests; canonical files[].target lookup w/ object-map fallback |
| β3: refactor `scripts/check-instructions.mjs` to `lib/doc-schema.mjs` + add cross-link validation; update `tests/check-instructions.test.mjs` | done | sub-agent β3 | 8 → 12 tests; doc-schema integration; LRN/ADR cross-link validation; CS06b TODO removed |
| β4: refactor `scripts/check-readme.mjs` to `lib/doc-schema.mjs`; update `tests/check-readme.test.mjs` | done | sub-agent β4 | 11/11 tests; doc-schema integration; both CS06b TODOs removed |
| β5: refactor `scripts/check-clickstop.mjs` to `lib/doc-schema.mjs`; update `tests/check-clickstop.test.mjs`; **preserve LRN-064 H2 detection** | done | sub-agent β5 | 17 → 19 tests; LRN-064 body-extraction inline (doc-schema lacks H2-until-H1/H2 primitive); +2 regression tests for the gate |
| β6: `scripts/check-templates.mjs` (3 rules) + `tests/check-templates.test.mjs` (≥12) + `tests/fixtures/cs15d/check-templates/` | done | sub-agent β6 + orchestrator | 18 tests; orchestrator added negative-lookbehind for `${{ ... }}` GitHub Actions expressions and markdown-context awareness (skips backticks, fenced blocks, HTML comments) |
| β7: `scripts/check-scaffold-readme.mjs` + `tests/check-scaffold-readme.test.mjs` (≥6) | done | sub-agent β7 | 11 tests; passes cleanly against all 8 in-tree scaffold READMEs |
| β8: `tests/cs15d-aggregator.test.mjs` | done | sub-agent β8 + orchestrator | 6 tests; β8 used `t.skip` feature-detect; all 6 now pass after β9 wired aggregator (no skips remaining) |
| β9 (orchestrator): wire β6+β7 linters into `bin/harness.mjs cmdLint`; aggregator extension for β8; update `template/managed/INSTRUCTIONS.md` linter count + `template/composed/OPERATIONS.md` preamble | done | yoga-ah | `templates` row added; self-host scaffold-readme walk emits per-scaffold rows (skipped row in non-self-host); shipped scaffold-policy mapping `migrations`→`migration-policy`, `feature-flags`→`feature-flag-policy` (intentional plural→singular); SUBCOMMAND_HELP['lint'] updated; OPERATIONS.md preamble item 6 added |
| Re-render root `INSTRUCTIONS.md` + `OPERATIONS.md` via `harness sync --mode=apply --resolved-sha <content-sha>` | pending | yoga-ah | per LRN-070/074 |
| Plan-vs-implementation review (GPT-5.5) | pending | yoga-ah | per LRN-064 mandatory close-out gate |
| Open content PR (label none / standard); CI green; admin merge if bot rejects (per user standing authorization) | pending | yoga-ah | — |
| Close-out: docs + restart state (CONTEXT/WORKBOARD/HANDOFF + this CS file's RESUME POINT; rename active → done; `git mv` 3 absorbed planned files to `done/` with "absorbed by CS15d" pointer) | pending | yoga-ah | required by check-clickstop close-out enforcement |
| Close-out: learnings + follow-ups (LEARNINGS.md within LRN-087..094; re-check max LRN id per LRN-086; document any deferred follow-ups as new planned CSs) | pending | yoga-ah | required by check-clickstop close-out enforcement |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

**Reviewer:** GPT-5.5 (via Copilot CLI background agent)
**Date:** 2026-05-10
**Outcome:** GO

Implementation covers the planned CS15d deliverables, wiring, docs, tests,
and schema constraints. The concerns are residual robustness/cleanup items,
not close-out blockers. Validation: `node --test tests/*.test.mjs` exited 0
(609/609); `node bin/harness.mjs lint --quiet` reported 24 passed / 0 failed
/ 3 skipped; schema validation passed.

### Goal coverage

- [PASS] CS06b shared config/lock readers exist and validate schemas — `lib/config-reader.mjs:16,57-68`; `lib/lock-reader.mjs:19-24,62-68`; tests at `tests/lib-config-reader.test.mjs:41-137`, `tests/lib-lock-reader.test.mjs:59-147`.
- [CONCERN] Refactored linters use `lib/doc-schema.mjs`, but not "exclusively" — imports present in `scripts/check-instructions.mjs:24-29`, `scripts/check-readme.mjs:35`, `scripts/check-clickstop.mjs:28`; inline markdown parsers remain at `scripts/check-instructions.mjs:150-190` and `scripts/check-readme.mjs:165-172`. No live CS06b TODO markers outside plans.
- [PASS] LRN-064 gate preserved functionally — anchored H2 regex/body extraction remains at `scripts/check-clickstop.mjs:293-307`; regression tests at `tests/check-clickstop.test.mjs:353-382`.
- [PASS] CS08b template linter enforces three rules — rules at `scripts/check-templates.mjs:155-172`; GH Actions negative-lookbehind at `:155`; markdown skipping at `:108-137`.
- [PASS] CS10b scaffold README linter exists with required `--name` — `scripts/check-scaffold-readme.mjs:17,51-53,85-87`.
- [PASS] CS10b aggregator walks self-host scaffold READMEs and auto-dispatches shipped policies — `bin/harness.mjs:921-958,959-994`.

### Aggregator wiring

- [PASS] `templates` row added — `bin/harness.mjs:890-898`.
- [PASS] Self-host per-scaffold rows / non-self-host single skipped row — `bin/harness.mjs:921-958`.
- [PASS] `SHIPPED_SCAFFOLD_LINTERS` map present and documented — `bin/harness.mjs:959-972`.
- [PASS] Absolute script paths allowed in linter table — `bin/harness.mjs:1046-1049`.
- [PASS] `SUBCOMMAND_HELP['lint']` documents new linters and dispatch contract — `bin/harness.mjs:138-152`.

### Process compliance

- [PASS] Both commits include the canonical `Co-authored-by: Copilot` trailer.
- [PASS] Lock-fixup commit follows content commit and points to content SHA (LRN-070/074) — `.harness-lock.json:3` = `c40fa8926a043533b45c8f321042a4e183ad7775`.
- [PASS] β1-β9 task ledger marked done — `## Tasks` table.
- [PASS] No scaffold edits; only owned `lib/config-reader.mjs` and `lib/lock-reader.mjs` under `lib/` changed.
- [PASS] All commits are on `cs15d/content`; no edits to `main`.

### Test coverage

- [PASS] New lib module tests present — `tests/lib-config-reader.test.mjs` (6 tests), `tests/lib-lock-reader.test.mjs` (8 tests).
- [PASS] New linter tests present — `tests/check-templates.test.mjs` (18 tests), `tests/check-scaffold-readme.test.mjs` (11 tests).
- [PASS] Aggregator integration test now runs with 0 skips — `tests/cs15d-aggregator.test.mjs:74-142` (6/6 pass).
- [PASS] Refactored linters have same-or-more tests plus regression coverage — `check-instructions` 12, `check-readme` 11, `check-clickstop` 19.

### Schema/contract integrity

- [PASS] Config reader validates against `harness.config.schema.json` — `lib/config-reader.mjs:16,57-68`.
- [PASS] Lock reader validates against `harness-lock.schema.json` — `lib/lock-reader.mjs:19-24,62-68`.
- [PASS] No schema files changed — `git diff --name-only main..HEAD -- schemas/*` returned empty.

### Surprises and red flags

- Markdown-context stripping in `check-templates` only handles triple-backtick fences and single-backtick spans; CommonMark tilde fences (`~~~`), indented code blocks, and double-backtick spans (`` ``…`` ``) can still false-positive (`scripts/check-templates.mjs:108-137`). Mitigation: log as a follow-up below; current template/ subtree passes the linter.
- The "exclusive" doc-schema refactor scope was softened — three refactored linters retain some inline markdown parsing because `lib/doc-schema.mjs` lacks the requisite primitives (H2-only collector, anchor enumerator, body-until-H1/H2 extractor). Mitigation: log as a follow-up below.

### Close-out follow-ups (filed as new planned CSs at close-out)

1. **Centralize heading/link extraction in `lib/doc-schema.mjs`** so `check-instructions`, `check-readme`, `check-clickstop` can drop their remaining inline parsers. Concrete primitives needed: case-insensitive H2 enumerator, anchor enumerator, H2-until-next-H1/H2 body extractor.
2. **Extend `check-templates` markdown-context awareness** to CommonMark tilde fences (`~~~`), indented code blocks (≥4 leading spaces), and double-backtick spans. Add fixtures covering each.
