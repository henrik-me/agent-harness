# CS32 — Harness lint UX hardening + sub-agent path discipline (umbrella)

**Status:** active
**Owner:** orchestrator
**Branch:** cs32/harness-lint-ux-hardening
**Started:** 2026-05-12
**Closed:** —
**Filed by:** Post-CS31 follow-up batch — addresses the three open LRNs filed during the CS30/CS31 close-out batch (LRN-104, LRN-105, LRN-106) that were each tagged "Open. Action will be filed as a planned CS." Bundling into one umbrella because all three are small follow-ups from the same CS30 retrospective. Single-orchestrator emergency mode per LRN-103.
**Depends on:** CS30 (introduced --explain registry, briefing-preamble path discussion, and --only/--skip flags); CS31 (introduced the --only zero-match validation that D1 mirrors).

---

## Problem

Three open LRNs from the CS30/CS31 retrospective remain unaddressed:

1. **LRN-106 (open, source CS31)** — `harness lint --skip <unknown>` is silently no-op'd. CS31 fixed `--only` but explicitly deferred `--skip` to keep CS31 narrowly scoped. Same footgun: a CI workflow that skips a renamed/removed linter silently starts running it again.
2. **LRN-105 (open, source CS30)** — Sub-agent dispatch briefings must use repo-relative paths from the perspective of the executing repo. The mandatory briefing preamble (`template/composed/OPERATIONS.md` § Conventions to follow) does not currently call this out; the SI agent's CS01 sub-agent A5 had to be corrected mid-task.
3. **LRN-104 (open, source CS30)** — `LINTER_EXPLANATIONS` registry at `bin/harness.mjs:946` only covers 3 of 18 linters. CS30/D5 noted "grows opportunistically" but the natural opportunity is now: 15 linter docstrings still missing.

## Proposed fix

### D1 — LRN-106: --skip zero-match validation

In `bin/harness.mjs` `cmdLint`, immediately after the CS31 `--only` validation block, mirror the same validation for `--skip`:

```js
if (skip.size > 0) {
  const knownBaseNames = new Set(linters.map((l) => l.name.split(':')[0]));
  const unknown = [...skip].filter((n) => !knownBaseNames.has(n));
  if (unknown.length > 0) {
    const known = [...knownBaseNames].sort().join(', ');
    const label = unknown.length === 1 ? 'name' : 'names';
    die(
      `harness lint --skip: unknown linter ${label}: ${unknown.join(', ')}\nKnown: ${known}`,
      2,
    );
  }
}
```

Reuse the `knownBaseNames` set if both `--only` and `--skip` are used (refactor to compute once).

Tests: mirror the CS31 unknown / mixed pair for `--skip`. Plus assert that `--skip valid` continues to work (already covered by an existing test at line 266 — verify it still passes).

CHANGELOG `[Unreleased] § Changed`: one-line citing CS32/D1 and LRN-106.

### D2 — LRN-105: cross-repo path discipline in mandatory briefing preamble

Add a new bullet to the `Conventions to follow` section of the mandatory briefing preamble in `template/composed/OPERATIONS.md` (~line 417), after the existing `Consumer-root-relative paths (LRN-050)` bullet (line 443). Suggested wording:

> - **Cross-repo path discipline (LRN-105).** When a sub-agent operates in a repo OTHER than the orchestrator's, every path in the briefing must be rooted in the executing repo. For composed-block edits in a consumer repo: edit `<consumer-root>/<file>` between `<!-- harness:local-start id=X -->` markers, NOT `template/composed/<file>` (that path only exists in the harness repo). Disambiguate any `template/`, `scripts/`, or other directory name that exists in both repos with different semantics.

Then run `harness sync` to propagate the change into the rendered `OPERATIONS.md` at the repo root.

LRN-105 disposition update: status `open` → `applied` with a back-reference to CS32/D2.

### D3 — LRN-104: expand --explain registry to all 18 linters

Add the missing 15 entries to `LINTER_EXPLANATIONS` in `bin/harness.mjs`:

- `clickstop` (scripts/check-clickstop.mjs)
- `commit-trailers` (scripts/check-commit-trailers.mjs)
- `compose-v2` (scripts/check-compose-v2.mjs)
- `composed-blocks` (scripts/check-composed-blocks.mjs)
- `context` (scripts/check-context.mjs)
- `fixtures` (scripts/check-fixtures.mjs)
- `instructions` (scripts/check-instructions.mjs)
- `learnings` (scripts/check-learnings.mjs)
- `pack` (scripts/check-pack.mjs)
- `pr-body` (scripts/check-pr-body.mjs)
- `public-artifact` (scripts/check-public-artifact.mjs)
- `readme` (scripts/check-readme.mjs)
- `scaffold-readme` (scripts/check-scaffold-readme.mjs)
- `templates` (scripts/check-templates.mjs)
- `workflow-pins` (scripts/check-workflow-pins.mjs)

Each entry must follow the existing CS30/D5 pattern: **Linter** (script path), **Target**, **Rules** (key rules, not every detail), **Why** (or **Canonical seed** when applicable). Source-of-truth is each linter's docstring at the top of `scripts/check-*.mjs`.

Tests: extend the existing `CS30/D5: lint --explain architecture ...` test to cover at least one new entry (e.g. `clickstop`) — assert the `--explain` output contains a representative rule from that linter so the test catches accidental empty/placeholder entries.

CHANGELOG `[Unreleased] § Changed`: one-line citing CS32/D3 and LRN-104.

LRN-104 disposition update: status `open` → `applied` with a back-reference to CS32/D3.

### LRN dispositions (close-out task T8)

In `LEARNINGS.md`:
- LRN-104: `status: open` → `status: applied`, add **Disposition update (2026-05-12, CS32/D3)** paragraph.
- LRN-105: `status: open` → `status: applied`, add **Disposition update (2026-05-12, CS32/D2)** paragraph.
- LRN-106: `status: open` → `status: applied`, add **Disposition update (2026-05-12, CS32/D1)** paragraph.

## Out of scope

- Auto-suggesting `--explain` at the bottom of failure output (LRN-104 mentions; defer unless trivially small).
- A `check-cs-plan.mjs` linter that flags `template/composed/` paths in CS plans whose target is a consumer repo (LRN-105 mentions; large scope, defer to a future CS).
- Refactoring the `LINTER_EXPLANATIONS` registry to live in a separate file (defer; current colocation with `cmdLint` is intentional and helps keep entries in sync with new linters).

## Tasks

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T1: D1 — `--skip` zero-match validation in `cmdLint` | pending | yoga-ah | Mirror CS31 `--only` block. |
| T2: D1 — tests for `--skip typo`, `--skip valid,typo` | pending | yoga-ah | Mirror CS31 test pair. |
| T3: D1 — CHANGELOG one-line | pending | yoga-ah | `[Unreleased] § Changed`. |
| T4: D2 — preamble bullet in `template/composed/OPERATIONS.md` | pending | yoga-ah | After Consumer-root-relative paths bullet. |
| T5: D2 — `harness sync` to propagate into rendered `OPERATIONS.md` | pending | yoga-ah | Verify diff is exactly the new bullet. |
| T6: D3 — expand `LINTER_EXPLANATIONS` to 18 entries | pending | yoga-ah | Source of truth: each linter's top-of-file docstring. |
| T7: D3 — extend `--explain` test for one new entry | pending | yoga-ah | E.g. `clickstop`. |
| T8: LRN dispositions LRN-104/105/106 → applied | pending | yoga-ah | At close-out only. |
| T9: Run `harness lint --quiet` + full `node --test` regression | pending | yoga-ah | Expect 24/0/3 + ≥ 690 tests. |
| T10: GPT-5.5 plan-vs-impl gate (mandatory pre-PR per LRN-064/103) | pending | yoga-ah | Reviewer model id `gpt-5.5`. |
| T11: Content PR + admin-merge | pending | yoga-ah | Single-orchestrator emergency mode (LRN-103). |
| T12: Close-out docs + restart state (active→done rename, WORKBOARD prune) | pending | yoga-ah | |
| T13: Close-out learnings + follow-ups | pending | yoga-ah | T8 is the headline; any new candidates surface here. |

## Plan-vs-implementation review

**Reviewer:** GPT-5.5 (rubber-duck, code-review agent, pre-content-PR gate)
**Date:** 2026-05-12
**Outcome:** GO

**Per-deliverable assessment:**

- **D1 — PASS.** `cmdLint` computes one shared `knownBaseNames` set and uses it
  for both `--only` and `--skip` validation. The `--skip` error mirrors `--only`:
  exit 2, unknown name(s), and `Known:` list. The two CS32/D1 tests cover
  unknown-only and mixed valid+unknown `--skip`; the existing valid `--skip
  workflow-pins,readme` test still passes.
- **D2 — PASS.** The new "Cross-repo path discipline (LRN-105)" bullet is
  present in both `template/composed/OPERATIONS.md` and rendered root
  `OPERATIONS.md` under § Conventions to follow. It explicitly calls out the
  consumer-vs-harness composed-block trap. The literal marker mention is
  escaped with U+200B; `harness sync --mode=check` reports no drift; lint
  passes including composed-blocks.
- **D3 — PASS.** `LINTER_EXPLANATIONS` now has 18 entries matching the shipped
  linter base names. New entries follow the existing pattern (Linter / Target /
  Rules / Why-or-Canonical-seed). Spot-checks against `check-clickstop`,
  `check-workflow-pins`, `check-compose-v2`, `check-public-artifact`,
  `check-templates`, `check-readme`, `check-composed-blocks`, and
  `check-scaffold-readme` confirmed descriptions align with actual script
  behavior. The two CS32/D3 `--explain` tests for `clickstop` and
  `workflow-pins` pass; full `node --test 'tests/**/*.test.mjs'` exits 0
  (692/692).

**Plan items not implemented:** none for D1/D2/D3. Explicitly out-of-scope
items remain unimplemented as planned: `--explain` auto-suggestion at the
bottom of failure output, `check-cs-plan.mjs` linter, and LRN-104/105/106
disposition flips (which happen in the CS32 close-out PR, not this content PR).

**Implementation items not in plan:** WORKBOARD CS32 row update, the new
active CS plan file, and `.harness-lock.json` sync metadata updates — all
expected, none functional scope creep.

**Recommended follow-ups:** none blocking. Disposition flips of LRN-104/105/106
(open → applied) handled by T8 in the close-out PR.
