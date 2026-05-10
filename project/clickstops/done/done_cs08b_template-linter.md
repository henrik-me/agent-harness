# CS08b — Template linter (`check-templates.mjs`)

**Status:** done
**Owner:** yoga-ah (via CS15d)
**Branch:** —
**Started:** 2026-05-10 (via CS15d)
**Closed:** 2026-05-10 (via CS15d)
**Filed by:** CS08 close-out ([LRN-049](../../../LEARNINGS.md#lrn-049) dot-notation placeholder anti-pattern + [LRN-050](../../../LEARNINGS.md#lrn-050) source-relative path anti-pattern).
**Superseded by:** [CS15d](./done_cs15d_linter-expansion.md) — absorbed and delivered as one of three deliverables in the CS15d umbrella; PR #92 merged 2026-05-10.
**Depends on:** CS08

## Goal

Add a `scripts/check-templates.mjs` linter that validates all files under `template/managed/` and `template/composed/` against the rules learned in CS08. Wire it into `harness lint` so template-authoring regressions are caught mechanically on every future CS.

## Background

CS08 R1 surfaced two blocker findings that required a dedicated fix-round sub-agent:
- **LRN-049 (B2):** Sub-agents reached for `{{project.X}}` dot-notation placeholders that `lib/templating.mjs` cannot resolve (flat key map, not nested). Dot-notation placeholders ship as literal unresolved text after consumer sync.
- **LRN-050 (B3):** Sub-agents used template-source-relative paths (`../../docs/...`, `../LEARNINGS.md`) that break after `harness sync` installs files at the consumer root.

Additionally, **LRN-051** documents a self-reference trap: templates describing a linter's forbidden tokens must not quote them verbatim.

Both issues are mechanical and checkable at lint time. Without a linter, they will recur on every future template-authoring CS.

## Deliverables

- [ ] `scripts/check-templates.mjs` — linter that scans all files under `template/managed/` and `template/composed/`:
  - **Rule 1 (LRN-049):** Reject `{{X.Y}}` dot-notation placeholders (regex `\{\{[^}]+\.[^}]+\}\}`). Any dot-notation placeholder in a template file is an error (they cannot be resolved by the flat-key substitution engine).
  - **Rule 2 (LRN-050):** Flag `../` relative paths in template files (regex `\.\./`). Templates installed at the consumer root must use root-relative paths only.
  - **Rule 3 (LRN-051 pattern):** For files under `template/managed/.github/` that match `*template*`, scan for common linter-forbidden literal tokens (e.g., `TODO:`, `FIXME:`) and reject them (self-reference trap).
  - Uses `--file`/`--dir` flag and `--cwd` flag (explicit path threading per [LRN-032](../../../LEARNINGS.md#lrn-032)).
  - Exits non-zero with a descriptive per-file, per-rule error list.
- [ ] `tests/check-templates.test.mjs` — fixture-based tests (valid templates pass; templates with each violation fail).
- [ ] Fixtures under `tests/fixtures/cs08b/`:
  - `valid/` — templates that should pass all rules
  - `dot-notation/` — template containing `{{project.name}}` (Rule 1 trigger)
  - `relative-path/` — template containing `../LEARNINGS.md` (Rule 2 trigger)
  - `self-ref-token/` — PR template containing a literal forbidden token (Rule 3 trigger)
- [ ] Wire `check-templates.mjs` into `bin/harness.mjs` `cmdLint` (14th linter).
- [ ] Remove any `TODO(CS08b)` markers in the codebase.

## Exit criteria

- `node --test tests/*.test.mjs` still passes (375+ tests; new fixtures add ≥12 tests).
- `node scripts/validate-schemas.mjs` still passes.
- `node bin/harness.mjs lint --quiet` exits 0 against this repo's `template/` tree.
- `scripts/check-templates.mjs` exits non-zero on each fixture that should fail.
- No `TODO(CS08b)` markers remain.

## Sub-agent fan-out

**1 sub-agent** (cs08b-templates): owns `scripts/check-templates.mjs`, `tests/check-templates.test.mjs`, `tests/fixtures/cs08b/`, and the `cmdLint` wiring change. Per [LRN-016](../../../LEARNINGS.md#lrn-016), single sub-agent owns all files for this CS. Briefings MUST include:
- Hard "no commit" preflight (per [LRN-021](../../../LEARNINGS.md#lrn-021))
- `schemas/*.schema.json` as mandatory reading before any field access (per [LRN-039](../../../LEARNINGS.md#lrn-039))
- `requireValue(args, i, flagName)` guard for all flag-value parsing (per [LRN-040](../../../LEARNINGS.md#lrn-040))
- `--file`/`--dir` flag must be explicit; do NOT infer path from `import.meta.url` (per [LRN-032](../../../LEARNINGS.md#lrn-032))

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per OPERATIONS.md § Claim) | planned | — | — |
| Close-out: docs + restart-state (CONTEXT/WORKBOARD/HANDOFF + relevant docs) | done | yoga-ah (via CS15d) | done in CS15d close-out (umbrella absorbed this CS); see done_cs15d_*.md |
| Close-out: learnings + follow-ups (LEARNINGS.md + planned CSs) | done | yoga-ah (via CS15d) | LRN-087..091 filed in CS15d; CS08c follow-up planned CS filed for tilde-fence/indented-code/double-backtick markdown-context extension |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

**Reviewer:** GPT-5.5 (via [CS15d umbrella review](./done_cs15d_linter-expansion.md#plan-vs-implementation-review))
**Date:** 2026-05-10
**Outcome:** GO

This CS was absorbed by the [CS15d umbrella](./done_cs15d_linter-expansion.md) before it was ever independently claimed. CS08b's deliverables (`scripts/check-templates.mjs` enforcing LRN-049/050/051 with 18 tests + 6 fixture trees) were implemented as Wave 1 sub-agent β6 in CS15d and reviewed there. The orchestrator added two robustness improvements during integration: a negative-lookbehind to exclude GitHub Actions `${{...}}` expressions, and markdown-context awareness (skip backtick spans, fenced code blocks, HTML comments) to prevent false-positives on docs that show examples of the violations. See CS15d's plan-vs-implementation review for the full analysis. One follow-up was logged: extend markdown-context awareness to CommonMark tilde fences (`~~~`), indented code blocks, and double-backtick spans.
