# CS08c — Extend check-templates markdown-context awareness

**Status:** active
**Owner:** yoga-ah
**Branch:** cs08c/extend-check-templates-markdown-context
**Started:** 2026-05-10
**Closed:** —
**Filed by:** CS15d close-out (GPT-5.5 plan-vs-implementation review GO with non-blocking concern #2: `check-templates.mjs` markdown-context awareness only handles triple-backtick fences and single-backtick spans).
**Depends on:** CS08b (delivered via [CS15d](../done/done_cs15d_linter-expansion.md))

## Goal

Extend the markdown-context skipping logic in `scripts/check-templates.mjs` to cover three additional CommonMark constructs that currently produce false-positives when they contain examples of the patterns the linter rejects: (1) tilde-fenced code blocks (`~~~`), (2) indented code blocks (lines beginning with at least four spaces or one tab), (3) double-backtick spans (`` `` ` `` `` for code spans containing single backticks).

## Background

CS08b shipped `scripts/check-templates.mjs` with three rules. During CS15d Wave 2 integration, the orchestrator added markdown-context awareness so the linter could safely scan documentation under `template/` (otherwise the docs that *explain* the rules would trip them). The implementation handles:

- Triple-backtick fenced code blocks (` ``` ` lines flip an `inFencedCode` state flag).
- Single-backtick inline spans (regex strip).
- Multi-line HTML comments (`<!-- ... -->` across lines).
- Negative-lookbehind `(?<!\$)` on the dot-notation regex to exclude GitHub Actions `${{ ... }}`.

GPT-5.5 reviewer flagged that CommonMark allows two additional code-block syntaxes the linter doesn't yet handle: tilde fences (`~~~`, equivalent to triple-backtick per CommonMark §4.5) and indented code blocks (CommonMark §4.4). Double-backtick spans (CommonMark §6.1) are also allowed for inline code containing single backticks. None are currently used in the harness's own `template/` content, so today's linter passes — but a future doc author who reaches for the `~~~` fence (common in docs that show triple-backtick examples literally) would hit a false-positive.

## Deliverables

- [ ] `stripMarkdownNonScannable` (or its successor) recognises `~~~` (3+ tildes) as fence delimiters identically to ` ``` ` (3+ backticks). Per CommonMark, opening and closing fence must use the same character; track the fence character in the state.
- [ ] `stripMarkdownNonScannable` skips lines that are indented code blocks: at least 4 leading spaces (or one tab) AND not inside a list item continuation (per CommonMark §4.4 the indent is relative to the block's natural offset; for a top-level scan, check ≥4 leading spaces).
- [ ] Inline code-span stripping handles double-backtick (and N-backtick) spans by matching balanced N-backtick fences on a line: `/(\`+)([^\`]|\`(?!\1))*?\1/g` or equivalent.
- [ ] New fixtures under `tests/fixtures/cs08c/check-templates/`:
  - `valid/tilde-fenced-example.md` — a doc that shows the dot-notation pattern inside `~~~` blocks.
  - `valid/indented-code-example.md` — a doc that shows the pattern in a 4-space indented block.
  - `valid/double-backtick-span.md` — a doc with `` `` {{ obj.field }} `` `` inline.
- [ ] `tests/check-templates.test.mjs` extended with one passing test per fixture (3 new tests).
- [ ] No regression on existing 18 tests; LRN-049/050/051 enforcement unchanged for *real* code outside markdown contexts.

## Exit criteria

- `node --test tests/check-templates.test.mjs` passes (21 tests, currently 18).
- `node bin/harness.mjs lint --quiet` exits 0 (no false-positives introduced; no regressions).
- A doc file added under `template/` or `docs/` containing any of the three new constructs passes when the surrounding non-code-block content is clean.
- A doc file containing the patterns *outside* code blocks still fails the linter (negative regression test).

## Sub-agent fan-out

Single-CS scope; small enough for a single agent without fan-out. Owns `scripts/check-templates.mjs` + `tests/check-templates.test.mjs` + `tests/fixtures/cs08c/check-templates/**`.

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| Refactor `stripMarkdownNonScannable` to track fence-character (tilde + backtick) | pending | yoga-ah | agent-id=yoga-ah \| role=orchestrator-impl \| report-status=pending \| learnings=0 |
| Add indented-code-block recognition (≥4 leading spaces / 1 tab) | pending | yoga-ah | agent-id=yoga-ah \| role=orchestrator-impl \| report-status=pending \| learnings=0 |
| Add N-backtick balanced span stripping | pending | yoga-ah | agent-id=yoga-ah \| role=orchestrator-impl \| report-status=pending \| learnings=0 |
| New fixtures under `tests/fixtures/cs08c/check-templates/` (≥4) | pending | yoga-ah | agent-id=yoga-ah \| role=orchestrator-impl \| report-status=pending \| learnings=0 |
| New tests in `tests/check-templates.test.mjs` (≥4; target 5-6) | pending | yoga-ah | agent-id=yoga-ah \| role=orchestrator-impl \| report-status=pending \| learnings=0 |
| Local review (GPT-5.5) | pending | yoga-ah | agent-id=yoga-ah \| role=local-reviewer \| report-status=pending \| learnings=0 |
| Plan-vs-implementation review (GPT-5.5 close-out gate) | pending | yoga-ah | agent-id=yoga-ah \| role=close-out-reviewer \| report-status=pending \| learnings=0 |
| Close-out: docs + restart state (WORKBOARD active→done row) | pending | yoga-ah | agent-id=yoga-ah \| role=closeout \| report-status=pending \| learnings=0 |
| Close-out: learnings + follow-ups (LEARNINGS.md, planned CSs if any) | pending | yoga-ah | agent-id=yoga-ah \| role=closeout \| report-status=pending \| learnings=0 |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
