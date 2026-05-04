# CS05 — Doc-schema lib + first reference linter (`check-learnings.mjs`)

**Status:** done
**Owner:** yoga-ah
**Branch:** `cs05/content` (merged) + `cs05/close-out` (close-out)
**Started:** 2026-05-03
**Closed:** 2026-05-03
**Filed by:** CS04 close-out (pre-filed per cs-plan CS05 scope; see [`harness-cs-plan.md` § CS05](../done/done_cs01_bootstrap-repo/harness-cs-plan.md#cs05--doc-schema-lib--first-reference-linter)).
**Depends on:** CS04

## Goal

Establish the linter pattern with one fully-implemented example. Deliver `lib/doc-schema.mjs` (the shared doc-parsing library) and `scripts/check-learnings.mjs` (the first reference linter, validating every entry in `LEARNINGS.md` against the prescribed schema). All existing `LEARNINGS.md` entries (LRN-001 through LRN-031+) must pass the linter without retrofit.

## Deliverables

### `lib/doc-schema.mjs`

A shared library used by all CS06+ linters:

- `parseFrontmatterBlocks(markdownText)` — extracts YAML frontmatter code fences (` ```yaml ... ``` ` blocks that contain an `id:` field) from a markdown file; returns array of `{ raw, parsed, lineNumber }`.
- `assertHeadings(ast, requiredHeadings)` — verifies that required section headings are present; returns array of missing-heading errors.
- `assertTableShape(ast, headingAnchor, requiredColumns)` — verifies that a markdown table under a given heading has the expected column headers.
- `resolveLinks(markdownText, baseDir)` — resolves relative markdown links and returns an array of broken-link findings.
- Zero runtime deps (uses Node built-ins only). No AJV dependency — doc-schema is purely structural; field-level validation happens in the per-linter layer.

### `scripts/check-learnings.mjs`

Validates every entry in `LEARNINGS.md`. Per the cs-plan canonical deliverables:

- **Required headings:** file must have `## Open`, `## Applied`, `## Obsolete`, `## Deferred` sections (or tolerate their absence if no entries in that category; must not have undocumented sections).
- **Per-entry frontmatter:** each entry YAML block must validate against `schemas/learning.schema.json` (the existing AJV schema from CS02). Errors reported as `LRN-XXX: <field> <violation>`.
- **Status/disposition consistency:** entries with `status: applied` or `status: obsolete` must have a non-empty `**Disposition:**` paragraph in their body.
- **Age-out warning:** entries with `status: open` and `date` older than 14 days emit a WARNING (non-fatal, but printed).
- **Deferred escalation flag:** entries with `status: deferred` and `deferred_until` date already passed emit a WARNING (non-fatal) — the deferred deadline has lapsed; revisit needed.
- **ID sequence check:** IDs must be sequential with no gaps (LRN-001, LRN-002, … LRN-N with no skip). Out-of-sequence IDs are a WARNING.
- **Exit codes:** 0 = all entries valid; 1 = at least one validation error; warnings are printed but do not change exit code.

### Tests

- `tests/check-learnings.test.mjs`: fixture-based tests covering:
  - Valid entry (all fields correct) → passes
  - Missing required field → error
  - Unknown `category` → error
  - `status: deferred` without `deferred_until` → error
  - `status: open` with old date → warning (exit 0)
  - `status: deferred` with lapsed `deferred_until` → warning (exit 0)
  - Disposition paragraph absent on `applied` entry → error
  - Gap in ID sequence → warning (exit 0)
  - Full LEARNINGS.md regression: linter passes against the real file with LRN-001..N
- `tests/doc-schema.test.mjs`: fixture-based tests for `lib/doc-schema.mjs`
- 13 fixtures under `tests/fixtures/cs05/`

### Wired into `harness lint`

- `bin/harness.mjs lint` subcommand invokes `check-learnings.mjs` with an explicit `--file` path (per [LRN-032](../../../LEARNINGS.md#lrn-032)).

## Exit criteria (achieved)

- `node scripts/check-learnings.mjs` exits 0 against the current `LEARNINGS.md` (LRN-001 through LRN-037).
- `node scripts/validate-schemas.mjs` passes (43/0 — 37 prior + 6 new LRNs).
- 253 tests pass (224 baseline + 29 new).
- `lib/doc-schema.mjs` has JSDoc for every exported function.

## Sub-agent fan-out

**Decision: ONE sub-agent (cs05-content) owns the full implementation** — `lib/doc-schema.mjs` + `scripts/check-learnings.mjs` + `tests/check-learnings.test.mjs` + `tests/doc-schema.test.mjs` + fixtures. Per [LRN-016](../../../LEARNINGS.md#lrn-016), all files compose a single coherent linter; parallel dispatch would create file-race risk.

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| Implement `lib/doc-schema.mjs` + `scripts/check-learnings.mjs` + tests + fixtures | done | sub-agent | agent-id=cs05-content \| role=full-implementation \| report-status=complete \| learnings=0 |
| Fix R1 blockers (5 blockers + 4 non-blockers) | done | sub-agent | agent-id=cs05-fixes-r1 \| report-status=complete \| learnings=0 |
| Fix R2 partial-fix blocker (entry-boundary regex tightening) | done | yoga-ah (orchestrator inline) | id-regex tightened to `/id: LRN-\d+/` per LRN-035 |
| GPT-5.5 review rounds | done | yoga-ah | review-status=complete (R3=GO) |
| Open PR + squash-merge | done | yoga-ah | Content PR #12, squash-merged as `adc2777` |
| Close-out: file 6 new learnings (LRN-032..037) | done | yoga-ah | All 43 LRN entries validate (`node scripts/validate-schemas.mjs` → 43/0 pass) |
| Close-out: file planned CS06 | done | yoga-ah | `planned_cs06_structural-linters.md` created |
| Close-out: rename file active → done; update WORKBOARD + CONTEXT | done | yoga-ah | This branch (cs05/close-out) |

## Notes / Learnings

(harvested at close-out; all filed as LRN-032..037)


### Sub-agent ledger summary

**Total implementation passes: 3** = 1 initial sub-agent job (cs05-content) + 1 fix-round sub-agent job (cs05-fixes-r1) + 1 inline orchestrator fix (R2 entry-classifier tightening). **Review rounds: 3** (GPT-5.5: R1, R2, R3-clear).

**Initial (cs05-content):**

- **cs05-content** (Sonnet 4.6): full implementation of `lib/doc-schema.mjs` + `scripts/check-learnings.mjs` + `tests/check-learnings.test.mjs` + `tests/doc-schema.test.mjs` + 13 fixtures. Per [LRN-016](../../../LEARNINGS.md#lrn-016) single-sub-agent model chosen to avoid file-race. Completed with 0 commits (no-commit preflight honored per [LRN-021](../../../LEARNINGS.md#lrn-021)). Delivered 12 check-learnings tests (exceeded minimum of 10 per [LRN-037](../../../LEARNINGS.md#lrn-037)). LRN candidates: 0 escalated (findings emerged during GPT-5.5 review).

**Fix-round (cs05-fixes-r1):**

- **cs05-fixes-r1** (Sonnet 4.6, hard no-commit preflight): fixed all 5 GPT-5.5 R1 blockers + 4 non-blockers in one pass. 0 commits. Blockers addressed: (1) `cmdLint` missing `--file` pass-through (LRN-032); (2) silent-skip of malformed frontmatter blocks (LRN-033); (3) fence-line regex brittle on trailing whitespace (LRN-034); (4) entry-boundary using generic `/id:/` (LRN-035 initial fix); (5) CS04 lint test asserting exit 3 not updated (LRN-036). Delivered 10 doc-schema tests (exceeded minimum of 7 per [LRN-037](../../../LEARNINGS.md#lrn-037)).

**Inline orchestrator fix (R2):**

- After R2 identified the entry-boundary regex still needed tightening from `/id:/` to `/id: LRN-\d+/` (LRN-035 final fix), orchestrator fixed inline. 1 additional regression test added.

**GPT-5.5 review rounds:**

- **R1:** 5 blockers + 4 non-blocking. All blockers dispatched to cs05-fixes-r1.
- **R2:** 1 blocker (partial B4 fix — entry-boundary regex still too broad). Fixed inline by orchestrator.
- **R3:** GO. Content PR #12 merged as squash commit `adc2777`.

### Process observations

- **CLI linter path threading (LRN-032):** `harness lint` wrapper must pass explicit consumer-cwd-relative paths to linter scripts.
- **Fail-closed parser design (LRN-033):** malformed entries must ERROR, never silently skip.
- **Regex robustness from day one (LRN-034):** fence-line matching must tolerate trailing whitespace.
- **Specific id-pattern matching (LRN-035):** entry-boundary classification must use document-specific id regex.
- **Stub-promotion test update (LRN-036):** promote a stub → search and update all stub exit-3 tests.
- **Sub-agent over-delivery is good (LRN-037):** specify minimums, not exact counts, in briefings.

### Final state

- 253 tests pass (224 baseline + 29 new: 12 check-learnings + 10 doc-schema + 1 cli lint update + 1 doc-schema R2 regression + 5 additional coverage).
- `lib/doc-schema.mjs`: shared doc-parsing library with 4 exported functions + full JSDoc.
- `scripts/check-learnings.mjs`: reference linter, validates LEARNINGS.md against `schemas/learning.schema.json`.
- `tests/check-learnings.test.mjs`: 17 fixture-based tests.
- `tests/doc-schema.test.mjs`: 10 fixture-based tests.
- `tests/fixtures/cs05/`: 13 fixture files.
- `bin/harness.mjs`: `lint` subcommand wired to invoke `check-learnings.mjs` with explicit `--file`.
- `validate-schemas.mjs`: 43/0 (37 prior + 6 new LRN-032..037).
- 6 new LRN entries (LRN-032..037).
- 1 planned CS filed (CS06).
- Claim PR: #11 (`b65e045`). Content PR: #12 (squash-merged as `adc2777`).

## Plan-vs-implementation review

> Grandfathered: closed before plan-vs-implementation review gate was introduced (CS03b).
