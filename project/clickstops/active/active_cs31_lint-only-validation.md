# CS31 — Validate `lint --only` / `lint:NAME` zero-linter selections

**Status:** active
**Owner:** orchestrator
**Branch:** cs31/lint-only-zero-match-validation
**Started:** 2026-05-12
**Closed:** —
**Filed by:** GPT-5.5 plan-vs-implementation review of CS30 (medium-severity follow-up; recorded in `done_cs30_si-feedback-fixes.md` and surfaced in CS30 close-out gate run 2026-05-12).
**Depends on:** CS30 (introduced the `--only` filter and `lint:NAME` alias whose typo-handling we are tightening).

---

## Problem

`harness lint --only typo-name` and `harness lint:typo-name` silently exit 0
with `Total: 0 passed, 0 failed, 0 skipped`. This is a usability footgun:

- Sub-agents and CI users running per-linter checks (the standard CS30 / D2
  pattern) get a green-tick result for a step that ran no linters at all.
- A typo in a workflow file (e.g. `harness lint:text-encding`) silently
  passes forever.

The CS30 / D2 implementation explicitly preserved this behavior to avoid a
worse failure mode (the dispatcher rejecting `lint:foo` with
`Unknown subcommand`, which would have shadowed any future legitimate
subcommand). That guard is still correct — but once we are inside `cmdLint`,
having zero linters match should be a hard error, not a silent pass.

GPT-5.5 review of CS30 (2026-05-12) flagged this as a medium-severity
follow-up:

> Unknown `lint:NAME` aliases silently succeed (exit 0, "0 passed, 0 failed,
> 0 skipped"). A typo in a CI workflow will never fail. Recommend rejecting
> zero-match selections with exit 2 and a known-linters list, mirroring the
> existing `--explain unknown-name` UX.

## Proposed fix

In `bin/harness.mjs` `cmdLint`, after building the `linters` array and
before the per-linter loop:

1. Compute the set of all linter base names (`linter.name.split(':')[0]`).
2. If `only` is non-null:
   - Compute `unknown = [...only].filter(n => !knownBaseNames.has(n))`.
   - If `unknown.length > 0`, `die()` with exit 2 and a stderr message
     listing the unknown name(s) and the full known-names list,
     mirroring the existing `--explain` UX (line 1033).
3. If `only` is non-null and `unknown.length === 0` but the post-filter
   loop selected zero linters (e.g. all selected linters had
   target-not-found and were skipped — different from "no linter
   matches the name"), keep the current "0 passed / 0 failed / N skipped"
   behavior. The fix targets typos, not legitimate "this linter doesn't
   apply to this repo" cases.

The `lint:NAME` alias path (lines 1572-1582) does not need changes — it
just re-uses the same `--only NAME` codepath.

## Test changes

`tests/cli.test.mjs`:

1. **Update CS30/D2 unknown-name test** (lines 403-410). The original test
   asserted "exit 2 forbidden, exit 0 acceptable" because the worse failure
   mode at the time was `Unknown subcommand`. We now flip the assertion:
   exit 2 with a known-linters list is the new correct behavior. Add a
   reference to CS31 in the test name + comment so the contract change is
   discoverable. The `lint:NAME → cmdLint` rewrite path is preserved
   (the dispatcher must NOT return `Unknown subcommand`); cmdLint now
   emits its own exit-2 with a useful error.

2. **Add CS31/positive test**: `lint:learnings` (a real linter) still
   exits 0. (Already covered by the existing CS30/D2 test at line 396 —
   no new test needed.)

3. **Add CS31/negative test**: `lint --only learnings,typo-name` (mixed
   valid+typo) exits 2, and stderr lists `typo-name` as the unknown one.

## Documentation

- `CHANGELOG.md` `[Unreleased]`: under `### Changed`, note the contract
  refinement: `lint --only` and `lint:NAME` now exit 2 (instead of
  silently exiting 0) when the supplied name(s) match no known linter,
  with stderr listing the known names. This is a behavior change vs.
  v0.3.1 but only for typos — every valid usage is unchanged.
- The CS31 CHANGELOG entry should also point readers at LRN-104 (the
  per-linter explainability LRN filed in the CS16/CS25/CS29/CS30
  close-out batch) since `--explain` is the canonical "give me help on
  one linter" partner of `--only` / `lint:NAME`.

## Deliverables

1. `bin/harness.mjs`: zero-match validation in `cmdLint`.
2. `tests/cli.test.mjs`: updated CS30/D2 unknown-name test + new
   mixed-valid+typo test.
3. `CHANGELOG.md`: `[Unreleased]` entry under `### Changed`.
4. `project/clickstops/active/active_cs31_lint-only-validation.md`
   (this file) — closes out into `done/` after merge.
5. `WORKBOARD.md`: add CS31 to Active Work table; remove the
   "no active CS" placeholder.

## Exit criteria

- `node bin/harness.mjs lint --only typo-name --quiet` exits 2 with
  stderr listing `typo-name` as unknown plus the full known list.
- `node bin/harness.mjs lint:typo-name --quiet` exits 2 (same UX).
- `node bin/harness.mjs lint --only learnings,typo-name --quiet` exits 2
  (one bad name still fails).
- `node bin/harness.mjs lint --only learnings --quiet` still exits 0.
- `node bin/harness.mjs lint:learnings --quiet` still exits 0.
- `node bin/harness.mjs lint --quiet` (no `--only`) still runs all
  linters and behaves identically to v0.3.1.
- `node bin/harness.mjs lint --quiet` → 24 passed / 0 failed / 3 skipped.
- `node --test 'tests/**/*.test.mjs'` → all green.

## Tasks

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T1: Implement zero-match validation in `cmdLint` | pending | yoga-ah | Mirror `--explain` unknown-name UX. |
| T2: Update CS30/D2 unknown-name test (refines, doesn't reverse) | pending | yoga-ah | Add CS31 cross-reference comment. |
| T3: Add mixed valid+typo test | pending | yoga-ah | `--only learnings,typo-name` exits 2. |
| T4: CHANGELOG `[Unreleased] § Changed` entry | pending | yoga-ah | Cite CS31. |
| T5: Run `harness lint --quiet` + full `node --test` regression | pending | yoga-ah | Expect 24/0/3 + 689/689. |
| T6: PR + admin-merge | pending | yoga-ah | Single content PR (single-orchestrator emergency mode per LRN-103). |
| T7: Close-out docs + restart state (active→done rename, WORKBOARD prune) | pending | yoga-ah | |
| T8: Close-out learnings + follow-ups | pending | yoga-ah | Candidate: extend the same zero-match validation to `--skip` (currently still silent). |

## Plan-vs-implementation review

(populated at close-out)
