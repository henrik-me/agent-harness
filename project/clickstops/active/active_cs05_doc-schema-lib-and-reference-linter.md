# CS05 — Doc-schema lib + first reference linter (`check-learnings.mjs`)

**Status:** active
**Owner:** yoga-ah
**Branch:** cs05/content
**Started:** 2026-05-03
**Closed:** —
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

- `tests/check-learnings.test.mjs`: minimum fixture-based tests covering:
  - Valid entry (all fields correct) → passes
  - Missing required field → error
  - Unknown `category` → error
  - `status: deferred` without `deferred_until` → error
  - `status: open` with old date → warning (exit 0)
  - `status: deferred` with lapsed `deferred_until` → warning (exit 0)
  - Disposition paragraph absent on `applied` entry → error
  - Gap in ID sequence → warning (exit 0)
  - Full LEARNINGS.md regression: linter passes against the real file with LRN-001..N

### Wired into `harness lint`

- `bin/harness.mjs lint` subcommand invokes `check-learnings.mjs` (and later CS06 linters) as part of the standard lint suite.

## Exit criteria

- `node scripts/check-learnings.mjs` exits 0 against the current `LEARNINGS.md` (LRN-001 through LRN-031).
- `node scripts/validate-schemas.mjs` still passes (31+ learnings validated).
- All existing 224+ tests still pass.
- Minimum 10 new tests in `tests/check-learnings.test.mjs`.
- `lib/doc-schema.mjs` has JSDoc for every exported function.

## Sub-agent fan-out

3 parallel sub-tasks per cs-plan:
1. `lib/doc-schema.mjs` (doc-schema library)
2. `scripts/check-learnings.mjs` (first reference linter)
3. `tests/check-learnings.test.mjs` + fixtures

Briefings MUST include:
- Hard "no commit" preflight (per [LRN-021](../../../LEARNINGS.md#lrn-021))
- Explicit file ownership (per [LRN-016](../../../LEARNINGS.md#lrn-016)): sub-agents 2 and 3 READ `lib/doc-schema.mjs` but do NOT write it; only sub-agent 1 writes it
- `schemas/learning.schema.json` as required reading for sub-agent 2
- The full list of LRN-001..N entries as regression fixtures for sub-agent 3

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| Implement `lib/doc-schema.mjs` | pending | yoga-ah (sub-agent: cs05-docschema) | agent-id=yoga-ah-sub-1 \| role=doc-schema-lib \| report-status=pending \| learnings=0 |
| Implement `scripts/check-learnings.mjs` | pending | yoga-ah (sub-agent: cs05-linter) | agent-id=yoga-ah-sub-2 \| role=reference-linter \| report-status=pending \| learnings=0 |
| Implement `tests/check-learnings.test.mjs` + fixtures | pending | yoga-ah (sub-agent: cs05-tests) | agent-id=yoga-ah-sub-3 \| role=linter-tests \| report-status=pending \| learnings=0 |
| Wire `harness lint` to invoke `check-learnings.mjs` | pending | yoga-ah (orchestrator inline) | small change to bin/harness.mjs |
| GPT-5.5 review rounds | pending | yoga-ah | review-status=pending |

## Notes / Learnings

(filled during execution)
