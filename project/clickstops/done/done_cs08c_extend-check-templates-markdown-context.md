# CS08c — Extend check-templates markdown-context awareness

**Status:** done
**Owner:** yoga-ah
**Branch:** cs08c/extend-check-templates-markdown-context (merged as `b90d08b`)
**Started:** 2026-05-10
**Closed:** 2026-05-10
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

- [x] `stripMarkdownNonScannable` (or its successor) recognises `~~~` (3+ tildes) as fence delimiters identically to ` ``` ` (3+ backticks). Per CommonMark, opening and closing fence must use the same character; track the fence character in the state. — Done; `state.fenceChar` tracks `` ` `` vs `~`; backtick fence does not close a tilde fence and vice versa.
- [x] `stripMarkdownNonScannable` skips lines that are indented code blocks: at least 4 leading spaces (or one tab) AND not inside a list item continuation. — Done; gated to `.md` files (see Notes for the R2 fix that introduced `isMarkdown` to avoid false-negatives in YAML/JSON templates).
- [x] Inline code-span stripping handles double-backtick (and N-backtick) spans by matching balanced N-backtick fences on a line. — Done; regex generalised from `` /`[^`]*`/g `` to `` /(`+)([\s\S]*?)\1/g ``.
- [x] New fixtures under `tests/fixtures/cs08c/check-templates/`:
  - `valid/tilde-fenced-example.md` — done
  - `valid/indented-code-example.md` — done
  - `valid/double-backtick-span.md` — done
  - `negative-regression-still-flags.md` — done (intentionally NOT under `valid/`; the file is supposed to fail the linter)
  - `indented-yaml-still-flags.yml` — done (added in R2 to lock in the `.md`-gating fix surfaced by the R1 content review)
- [x] `tests/check-templates.test.mjs` extended with 6 new CS08c tests (target was ≥4; 5-6).
- [x] No regression on existing 18 tests; LRN-049/050/051 enforcement unchanged for *real* code outside markdown contexts.

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
| Refactor `stripMarkdownNonScannable` to track fence-character (tilde + backtick) | done | yoga-ah | agent-id=yoga-ah \| role=orchestrator-impl \| report-status=done \| learnings=0 |
| Add indented-code-block recognition (≥4 leading spaces / 1 tab) | done | yoga-ah | agent-id=yoga-ah \| role=orchestrator-impl \| report-status=done \| learnings=1 (LRN-097: gate to .md only) |
| Add N-backtick balanced span stripping | done | yoga-ah | agent-id=yoga-ah \| role=orchestrator-impl \| report-status=done \| learnings=0 |
| New fixtures under `tests/fixtures/cs08c/check-templates/` (≥4) | done | yoga-ah | agent-id=yoga-ah \| role=orchestrator-impl \| report-status=done \| learnings=0 (5 fixtures shipped) |
| New tests in `tests/check-templates.test.mjs` (≥4; target 5-6) | done | yoga-ah | agent-id=yoga-ah \| role=orchestrator-impl \| report-status=done \| learnings=0 (6 tests shipped) |
| Local review (GPT-5.5) | done | yoga-ah | agent-id=yoga-ah \| role=local-reviewer \| report-status=done \| learnings=1 (R1 NEEDS-FIX → R2 GO) |
| Plan-vs-implementation review (GPT-5.5 close-out gate) | done | yoga-ah | agent-id=yoga-ah \| role=close-out-reviewer \| report-status=done \| learnings=0 |
| Close-out: docs + restart state (WORKBOARD active→done row) | done | yoga-ah | agent-id=yoga-ah \| role=closeout \| report-status=done \| learnings=0 |
| Close-out: learnings + follow-ups (LEARNINGS.md, planned CSs if any) | done | yoga-ah | agent-id=yoga-ah \| role=closeout \| report-status=done \| learnings=1 (LRN-097) |

## Notes / Learnings

- **R1 NEEDS-FIX (caught by GPT-5.5 content review): the indented-code-block stripping was applied to all file types, not just Markdown.** A YAML template line like `      - run: echo {{project.name}}` (8-space indent) would be emptied before the LRN-049 check ran, masking real violations. R2 fix introduced `isMarkdown = path.extname(filePath).toLowerCase() === '.md'` and gated the indented-line stripping behind it. Tilde-fence and N-backtick-span stripping remain global because those constructs are no-ops on YAML/JSON/JS in practice (parallels the existing backtick-fence behaviour). Filed as **LRN-097** at close-out.
- **Intentional CommonMark relaxation:** the indented-code-block rule is "any line with ≥4 leading spaces or one tab is treated as code" rather than the strict CommonMark "indented code requires a preceding blank line". This is a deliberate false-NEGATIVE-vs-false-POSITIVE trade documented in the original CS08c plan: false-positives in `template/` docs (linter blocks CI on a doc that explains the rules) are far more harmful than the marginal false-negatives this allows (a real placeholder authored at exactly 4 spaces indent in a .md file would be missed).
- **Fixture-file naming convention:** `valid/` holds fixtures that must PASS the linter (exit 0); fixtures that must FAIL (negative-regression / YAML-still-flags) live at the cs08c-root, NOT inside `valid/`. Mirrors the CS15d pattern.
- **CRLF gotcha during fixture creation:** the `create` tool writes files with the platform's native line endings (CRLF on Windows). The text-encoding linter (LRN-074) catches these; remediated by stripping `\r` bytes via PowerShell post-write. Worth remembering for future Windows-side fixture authoring.

## Plan-vs-implementation review

**Reviewer:** GPT-5.5 (cs08c-plan-vs-impl gate)
**Date:** 2026-05-10 UTC
**Outcome:** GO

**Summary:** Merged CS08c implementation is faithful to the plan: it extends `check-templates` markdown-context stripping for tilde fences, markdown-only indented code blocks, and N-backtick spans; preserves LRN-049/050/051 enforcement outside markdown contexts; and includes regression coverage for the R1 YAML false-negative. The extra YAML fixture/test is acceptable over-delivery tied directly to the R1 blocker fix, not scope drift. CS08c remained active in WORKBOARD/CONTEXT through this gate (correctly — it is closed at this close-out PR).

**Tasks-table coverage:**
- Refactor `stripMarkdownNonScannable` to track fence-character (tilde + backtick) — Done — `state.fenceChar` tracks `` ` `` vs `~`; backtick fence does not close a tilde fence and vice versa.
- Add indented-code-block recognition (≥4 leading spaces / 1 tab) — Done — gated to `.md` files via `isMarkdown` flag (R2 fix); YAML regression covered.
- Add N-backtick balanced span stripping — Done — strips balanced backtick runs; double/triple span tests cover.
- New fixtures (≥4) — Done — 5 fixtures shipped (3 valid markdown, 1 negative markdown, 1 YAML regression).
- New tests (≥4; target 5-6) — Done — 6 CS08c tests.
- Local review (GPT-5.5) — Done — R1 NEEDS-FIX → R2 GO documented in merge commit.
- Plan-vs-implementation review (GPT-5.5 close-out gate) — Done — this report.
- Close-out: docs + restart state — Done at this close-out PR (active→done rename, WORKBOARD active row removed + Recently Completed row added, CONTEXT.md updated).
- Close-out: learnings + follow-ups — Done — LRN-097 filed for the multi-format-linter file-type-gating finding.

**Exit-criteria coverage:**
- `node --test tests/check-templates.test.mjs` passes — Met — 24/24.
- `node bin/harness.mjs lint --quiet` exits 0 — Met — 24/0/3.
- A doc file added under `template/` or `docs/` with the new constructs passes — Met by 3 valid markdown fixtures.
- A doc file with the patterns *outside* code blocks still fails — Met by `negative-regression-still-flags.md` (2 violations, exit 1) AND `indented-yaml-still-flags.yml` (1 violation, exit 1).

**Drift / drive-by changes:** none. The R2 YAML fixture/test is acceptable over-delivery tied to the R1 blocker fix.

**LEARNINGS candidates surfaced during review:** Markdown-context stripping in multi-format linters must gate markdown-only constructs by file type; otherwise non-markdown templates can silently lose lint coverage. Filed as **LRN-097**.

**Verification commands run:**
- `git --no-pager log --oneline main -5` → HEAD is `b90d08b` CS08c merge.
- `git --no-pager show b90d08b --stat` → 7-file change (2 modified + 5 added fixtures).
- `git --no-pager show b90d08b --name-status` → only planned files modified.
- `node --test tests/check-templates.test.mjs` → 24/24.
- `node --test tests/*.test.mjs 2>&1 | Select-String "^# (tests|pass|fail)"` → 669/669.
- `node bin/harness.mjs lint --quiet 2>&1 | Select-Object -Last 3` → 24/0/3.
- `node bin/harness.mjs sync --mode=check 2>&1 | Select-Object -Last 5` → No drift detected.
