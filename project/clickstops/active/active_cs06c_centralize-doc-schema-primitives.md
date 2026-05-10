# CS06c — Centralize remaining doc-schema primitives in lib/doc-schema.mjs

**Status:** active
**Owner:** yoga-ah
**Branch:** cs06c/centralize-doc-schema-primitives
**Started:** 2026-05-10
**Closed:** —
**Filed by:** CS15d close-out (GPT-5.5 plan-vs-implementation review GO with non-blocking concern #1: refactored linters retain inline H2-only / anchor-enumeration / H2-until-next-H1/H2 body-extraction parsers).
**Depends on:** CS06b (delivered via [CS15d](../done/done_cs15d_linter-expansion.md))

## Goal

Finish the `lib/doc-schema.mjs` consolidation that CS06b started. Three primitives remained inline in the refactored linters because the library did not expose them at the time of CS15d Wave 1: (a) an H2-only collector (return only level-2 headings, ignoring nested H3+), (b) an anchor enumerator (extract the GitHub-flavoured anchor slug for each heading), and (c) a body extractor that returns the markdown content from one H2 anchor up to but not including the next H1 or H2. Add these to `lib/doc-schema.mjs` and refactor `scripts/check-instructions.mjs`, `scripts/check-readme.mjs`, and `scripts/check-clickstop.mjs` to delegate to them.

## Background

CS06b refactored three linters to use `lib/doc-schema.mjs` for the high-level operations they shared (`parseFrontmatterBlocks`, `assertHeadings`, `assertTableShape`). During CS15d Wave 1 implementation, sub-agents β3/β4/β5 found that some operations the linters needed weren't yet in the library: each linter still parsed headings and anchors inline using slightly different regexes. The orchestrator and GPT-5.5 reviewer agreed to ship the partial refactor (which already eliminates substantial duplication) and file this follow-up to finish the job, rather than block CS15d on a library-design discussion.

The risk of not doing this CS is low — the inline parsers are correct today. But three near-identical implementations of "get me the H2 list" or "extract the body of section X" are a divergence trap: a future linter author needing the same primitive will copy the closest-looking inline implementation rather than promote it, and the four copies will drift over time.

## Deliverables

- [ ] `lib/doc-schema.mjs` exports `collectH2Headings(markdown) → Array<{text, line, anchor}>` (level-2 only; ignores deeper nesting).
- [ ] `lib/doc-schema.mjs` exports `headingAnchor(text) → string` (GitHub-flavoured slug: lowercase, spaces→hyphens, strip non-alphanumeric except hyphens, collapse runs of hyphens).
- [ ] `lib/doc-schema.mjs` exports `extractSectionBody(markdown, h2Anchor) → string` (markdown content from the H2 with that anchor up to but not including the next H1 or H2; returns `''` if anchor not found).
- [ ] `scripts/check-instructions.mjs` refactored to use the three new primitives; inline H2/anchor/body parsers removed.
- [ ] `scripts/check-readme.mjs` refactored similarly.
- [ ] `scripts/check-clickstop.mjs` refactored similarly. **Note:** preserve the LRN-064 H2 close-out gate behaviour exactly; the gate is independent of which parser is used to read the headings.
- [ ] Unit tests for the three new primitives in `tests/lib-doc-schema.test.mjs` (existing file; add cases).
- [ ] Existing linter tests still pass with no count regression.

## Exit criteria

- `node --test tests/*.test.mjs` still passes at >=609 tests (current baseline).
- `node scripts/validate-schemas.mjs` still passes.
- `node bin/harness.mjs lint --quiet` exits 0 with no row-shape changes.
- No private `parse*Headings` / `slugify*` / `extract*Body` helpers remain inside `scripts/check-{instructions,readme,clickstop}.mjs`.
- LRN-064 close-out H2 gate behaviour confirmed by `tests/check-clickstop.test.mjs` (no regression).

## Sub-agent fan-out

Single-CS scope; can be done by a single agent without fan-out, OR fan out as 1 lib agent (owns `lib/doc-schema.mjs` + `tests/lib-doc-schema.test.mjs`) + 3 refactor agents (one per linter, each owns its script + test file). Per [LRN-016](../../../LEARNINGS.md#lrn-016), the lib agent must complete and merge first if fanning out, since the refactor agents depend on the new exports.

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| Add `collectHeadings`, `collectH2Headings`, `headingAnchor`, `extractSectionBody` to `lib/doc-schema.mjs` + tests | pending | yoga-ah | agent-id=yoga-ah \| role=orchestrator-impl \| report-status=pending \| learnings=0 |
| Refactor `scripts/check-instructions.mjs` (drop `slugify` + `parseHeadings`) | pending | yoga-ah | agent-id=yoga-ah \| role=orchestrator-impl \| report-status=pending \| learnings=0 |
| Refactor `scripts/check-readme.mjs` (drop inline H2 collector) | pending | yoga-ah | agent-id=yoga-ah \| role=orchestrator-impl \| report-status=pending \| learnings=0 |
| Refactor `scripts/check-clickstop.mjs` (drop `h2Body` + inline gate body slice; preserve LRN-064 gate exactly) | pending | yoga-ah | agent-id=yoga-ah \| role=orchestrator-impl \| report-status=pending \| learnings=0 |
| Local review (GPT-5.5) | pending | yoga-ah | agent-id=yoga-ah \| role=local-reviewer \| report-status=pending \| learnings=0 |
| Plan-vs-implementation review (GPT-5.5 close-out gate) | pending | yoga-ah | agent-id=yoga-ah \| role=close-out-reviewer \| report-status=pending \| learnings=0 |
| Close-out: docs + restart state (WORKBOARD active→done row, CONTEXT.md if changed) | pending | yoga-ah | agent-id=yoga-ah \| role=closeout \| report-status=pending \| learnings=0 |
| Close-out: learnings + follow-ups (LEARNINGS.md entries, planned CSs filed if any) | pending | yoga-ah | agent-id=yoga-ah \| role=closeout \| report-status=pending \| learnings=0 |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
