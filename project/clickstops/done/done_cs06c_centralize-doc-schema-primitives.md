# CS06c — Centralize remaining doc-schema primitives in lib/doc-schema.mjs

**Status:** done
**Owner:** yoga-ah
**Branch:** cs06c/centralize-doc-schema-primitives (merged as `2d87579`)
**Started:** 2026-05-10
**Closed:** 2026-05-10
**Filed by:** CS15d close-out (GPT-5.5 plan-vs-implementation review GO with non-blocking concern #1: refactored linters retain inline H2-only / anchor-enumeration / H2-until-next-H1/H2 body-extraction parsers).
**Depends on:** CS06b (delivered via [CS15d](../done/done_cs15d_linter-expansion.md))

## Goal

Finish the `lib/doc-schema.mjs` consolidation that CS06b started. Three primitives remained inline in the refactored linters because the library did not expose them at the time of CS15d Wave 1: (a) an H2-only collector (return only level-2 headings, ignoring nested H3+), (b) an anchor enumerator (extract the GitHub-flavoured anchor slug for each heading), and (c) a body extractor that returns the markdown content from one H2 anchor up to but not including the next H1 or H2. Add these to `lib/doc-schema.mjs` and refactor `scripts/check-instructions.mjs`, `scripts/check-readme.mjs`, and `scripts/check-clickstop.mjs` to delegate to them.

## Background

CS06b refactored three linters to use `lib/doc-schema.mjs` for the high-level operations they shared (`parseFrontmatterBlocks`, `assertHeadings`, `assertTableShape`). During CS15d Wave 1 implementation, sub-agents β3/β4/β5 found that some operations the linters needed weren't yet in the library: each linter still parsed headings and anchors inline using slightly different regexes. The orchestrator and GPT-5.5 reviewer agreed to ship the partial refactor (which already eliminates substantial duplication) and file this follow-up to finish the job, rather than block CS15d on a library-design discussion.

The risk of not doing this CS is low — the inline parsers are correct today. But three near-identical implementations of "get me the H2 list" or "extract the body of section X" are a divergence trap: a future linter author needing the same primitive will copy the closest-looking inline implementation rather than promote it, and the four copies will drift over time.

## Deliverables

- [x] `lib/doc-schema.mjs` exports `collectH2Headings(markdown) → Array<{text, line, anchor}>` (level-2 only; ignores deeper nesting).
- [x] `lib/doc-schema.mjs` exports `headingAnchor(text) → string` (GitHub-flavoured slug: lowercase, spaces→hyphens, strip non-alphanumeric except hyphens, collapse runs of hyphens).
- [x] `lib/doc-schema.mjs` exports `extractSectionBody(markdown, h2Anchor) → string` (markdown content from the H2 with that anchor up to but not including the next H1 or H2; returns `''` if anchor not found).
- [x] `lib/doc-schema.mjs` also exports `collectHeadings(markdown) → Array<{level, text, line, anchor}>` (all-level companion to `collectH2Headings`).
- [x] `scripts/check-instructions.mjs` refactored to use the new primitives; inline `slugify` + `parseHeadings` removed.
- [x] `scripts/check-readme.mjs` refactored similarly; inline H2 collector removed.
- [x] `scripts/check-clickstop.mjs` refactored similarly; inline `h2Body` and gate body slice removed. LRN-064 close-out gate behaviour preserved (verified by `tests/check-clickstop.test.mjs` 19/19 pass).
- [x] Unit tests for the new primitives in `tests/doc-schema.test.mjs` (file is `tests/doc-schema.test.mjs`, not `tests/lib-doc-schema.test.mjs` as the original deliverable line suggested — the existing test file had no `lib-` prefix). 22 new tests added; suite now 30/30 pass.
- [x] Existing linter tests still pass with no count regression: full suite 643→663 (+20 net).

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
| Add `collectHeadings`, `collectH2Headings`, `headingAnchor`, `extractSectionBody` to `lib/doc-schema.mjs` + tests | done | yoga-ah | agent-id=yoga-ah \| role=orchestrator-impl \| report-status=done \| learnings=0 |
| Refactor `scripts/check-instructions.mjs` (drop `slugify` + `parseHeadings`) | done | yoga-ah | agent-id=yoga-ah \| role=orchestrator-impl \| report-status=done \| learnings=0 |
| Refactor `scripts/check-readme.mjs` (drop inline H2 collector) | done | yoga-ah | agent-id=yoga-ah \| role=orchestrator-impl \| report-status=done \| learnings=0 |
| Refactor `scripts/check-clickstop.mjs` (drop `h2Body` + inline gate body slice; preserve LRN-064 gate exactly) | done | yoga-ah | agent-id=yoga-ah \| role=orchestrator-impl \| report-status=done \| learnings=0 |
| Local review (GPT-5.5) | done | yoga-ah | agent-id=yoga-ah \| role=local-reviewer \| report-status=done \| learnings=0 |
| Plan-vs-implementation review (GPT-5.5 close-out gate) | done | yoga-ah | agent-id=yoga-ah \| role=close-out-reviewer \| report-status=done \| learnings=0 |
| Close-out: docs + restart state (WORKBOARD active→done row, CONTEXT.md if changed) | done | yoga-ah | agent-id=yoga-ah \| role=closeout \| report-status=done \| learnings=0 |
| Close-out: learnings + follow-ups (LEARNINGS.md entries, planned CSs filed if any) | done | yoga-ah | agent-id=yoga-ah \| role=closeout \| report-status=done \| learnings=1 |

## Notes / Learnings

- The original deliverable line referenced `tests/lib-doc-schema.test.mjs`, but the existing test file is `tests/doc-schema.test.mjs` (no `lib-` prefix). New tests were added to the existing file rather than splitting them off — see LRN candidate filed during close-out for the test-naming convention drift.
- The pre-existing `assertTableShape(markdownText, headingAnchor, requiredColumns)` parameter name shadows the new `headingAnchor` export inside that function only. Out-of-scope rename per the CS plan; documented here so a future cleanup CS can pick it up if desired.
- `extractSectionBody` returns line-joined body (vs the old `h2Body` char-slice in `check-clickstop.mjs`). Semantically equivalent for the LRN-064 gate's `body.includes(GRANDFATHERING)` and `^\*\*Reviewer:\*\*` multiline regex — both tolerate the off-by-one whitespace. Verified by `tests/check-clickstop.test.mjs` 19/19 pass and a realistic gate-body test in `tests/doc-schema.test.mjs`.

## Plan-vs-implementation review

**Reviewer:** GPT-5.5 (cs06c-plan-vs-impl gate)
**Date:** 2026-05-10 UTC
**Outcome:** GO

**Summary:** The merged CS06c implementation faithfully delivers the planned doc-schema primitive centralization. The content PR touched only the scoped files, adds the planned exports and tests, refactors the three target linters to delegate to `lib/doc-schema.mjs`, preserves the LRN-064 close-out gate, and passes the required verification suite. Close-out bookkeeping remains intentionally pending for the close-out PR.

**Tasks-table coverage:**
- Add `collectHeadings`, `collectH2Headings`, `headingAnchor`, `extractSectionBody` to `lib/doc-schema.mjs` + tests — Done — exports present in `lib/doc-schema.mjs`; tests in `tests/doc-schema.test.mjs`; `node --test tests/doc-schema.test.mjs` passed 30/30.
- Refactor `scripts/check-instructions.mjs` (drop `slugify` + `parseHeadings`) — Done — imports `collectHeadings` and uses `.line` / `.anchor`; grep confirmed no remaining `slugify` / `parseHeadings` helpers.
- Refactor `scripts/check-readme.mjs` (drop inline H2 collector) — Done — imports `collectH2Headings` and uses `.map(h => h.text)`.
- Refactor `scripts/check-clickstop.mjs` (drop `h2Body` + inline gate body slice; preserve LRN-064 gate exactly) — Done — imports `extractSectionBody` / `headingAnchor`, uses them for Tasks body and for the LRN-064 gate body; `tests/check-clickstop.test.mjs` passed 19/19.
- Local review (GPT-5.5) — Done — content PR #101 merged as `2d87579`.
- Plan-vs-implementation review (GPT-5.5 close-out gate) — Done — this report.
- Close-out: docs + restart state — Done at this close-out PR (active→done rename, WORKBOARD active row removed + Recently Completed row added, CONTEXT.md updated).
- Close-out: learnings + follow-ups — Done — LRN-096 filed for the test-naming convention drift surfaced by this CS.

**Exit-criteria coverage:**
- `node --test tests/*.test.mjs` still passes at >=609 tests — Met — 663/663.
- `node scripts/validate-schemas.mjs` still passes — Met — 102/0.
- `node bin/harness.mjs lint --quiet` exits 0 with no row-shape changes — Met — 24/0/3.
- No private `parse*Headings` / `slugify*` / `extract*Body` helpers remain inside `scripts/check-{instructions,readme,clickstop}.mjs` — Met — grep clean.
- LRN-064 close-out H2 gate behaviour confirmed by `tests/check-clickstop.test.mjs` — Met — 19/19 pass; gate now uses `extractSectionBody`.

**Drift / drive-by changes:** none. Merge commit `2d87579` modifies only `lib/doc-schema.mjs`, `scripts/check-instructions.mjs`, `scripts/check-readme.mjs`, `scripts/check-clickstop.mjs`, and `tests/doc-schema.test.mjs`.

**LEARNINGS candidates surfaced during review:** the test-file naming mismatch (planned `tests/lib-doc-schema.test.mjs` vs actual `tests/doc-schema.test.mjs`) — filed as LRN-096 by the close-out step.

**Verification commands run:**
- `git --no-pager log --oneline main -5` → confirmed HEAD `2d87579` is CS06c content merge.
- `git --no-pager show 2d87579 --stat` → 5-file change, 303 insertions / 76 deletions.
- `git --no-pager show 2d87579 --name-status` → only planned files modified.
- `node --test tests/doc-schema.test.mjs` → 30/30.
- `node --test tests/check-clickstop.test.mjs` → 19/19.
- `node --test tests/*.test.mjs 2>&1 | Select-String "^# (tests|pass|fail)"` → 663/663.
- `node bin/harness.mjs lint --quiet 2>&1 | Select-Object -Last 3` → 24/0/3.
- `node bin/harness.mjs sync --mode=check 2>&1 | Select-Object -Last 5` → No drift detected.
- `node scripts/validate-schemas.mjs` → 102/0.
