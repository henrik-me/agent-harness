# INSTRUCTIONS — Orchestrator Workflow

> **Managed file.** This file is owned by the harness and is overwritten in full on
> every `harness sync`. Do **not** edit it locally — changes will be lost on the next
> sync. Project-specific process customisation belongs in `OPERATIONS.md` (local block
> `id=operations.project-deploy`).

---

## Quick Reference Checklist

Re-read this section after every `git pull`, even if INSTRUCTIONS.md did not change.

### Session Start

- **Pull:** `git pull` to fetch the latest state before doing anything else.
- **Derive your agent ID** per [TRACKING.md § Agent Identification](TRACKING.md#agent-identification):
  format `<machine-short>-{{repo_slug}}[-c<N>]`. Override the machine segment via the
  `HARNESS_AGENT_{{REPO_SLUG_UPPER}}_MACHINE` environment variable if needed
  (per Decision #20c).
- **State your identity:** in your **first response** write your derived agent ID and
  "INSTRUCTIONS.md re-read complete @ \<SHA\>". Treat session resume as session start
  for this rule — no exceptions.

### Claiming a CS

- Follow [OPERATIONS.md § Claim](OPERATIONS.md#claim) for the step-by-step procedure.
- **CS01 bootstrap only:** the very first commit to `main` is a documented one-time
  exception. From commit 2 onward every change — including WORKBOARD claim/closeout —
  goes through a PR.
- **CS01–CS14 (discipline-enforced):** GitHub branch protection is not available on
  private free-tier repos (see LRN-001). Discipline + GPT-5.5 + user review enforce
  the policy during this phase.
- **CS15b+ (mechanically enforced):** Ruleset applied on `main`; the
  `workboard-auto-approve.yml` bot handles WORKBOARD-only PRs automatically.
- **Pre-claim gate:** before claiming, review `LEARNINGS.md` for stale `open` items
  tagged `process` or `architectural`, or items whose `claim_area` matches the area
  you are about to claim. Disposition all relevant items before proceeding.
  `harness harvest` (CS04+) runs this check automatically as part of `claim`.

### Closing a CS

- Rename `active_cs<NN>_*.md` → `done_cs<NN>_*.md` and move it to
  `project/clickstops/done/`. Use the directory form if the CS carries artifacts.
- Remove the row from `WORKBOARD.md`.
- Update `CONTEXT.md` if the codebase state changed.
- File any new learnings in `LEARNINGS.md` (see [RETROSPECTIVES.md](RETROSPECTIVES.md)
  for entry shape and categories).

### Every CS

- **Implementation models:**

  | Role | Model |
  |---|---|
  | Orchestrator | Claude Opus 4.7 1M |
  | Mechanical sub-tasks | Claude Haiku 4.5 |
  | Non-trivial sub-tasks | Claude Sonnet 4.6 |
  | Local review (primary) | GPT-5.5 |
  | Local review (fallback, non-high-risk) | Claude Sonnet 4.6 (independence invariant) |

- **Local review is mandatory** before opening any PR and before committing any
  template change. Use GPT-5.5 rubber-duck. Record the model used and timestamp in
  the PR body. Fallback rules and independence invariant are in
  [REVIEWS.md](REVIEWS.md).
- **Branch naming:** `cs<NN>/<slug>` for CS work; `workboard/cs<NN>-claim`,
  `workboard/cs<NN>-close`, etc. for WORKBOARD-only PRs.
- **Commit trailers:** every commit must include
  `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.
- **Mid-CS sync prohibition:** do not run `harness sync` mid-clickstop unless
  resolving a harness blocker. Harness updates land in their own dedicated CS.
- **Sub-agent file ownership:** when dispatching parallel sub-agents, each sub-agent
  owns exactly the files listed in its briefing. Overlapping write scope causes silent
  file races (see LRN-016 in [LEARNINGS.md](LEARNINGS.md)). Enforce non-overlapping
  ownership at dispatch time, not after.
- **No-commit preflight:** every sub-agent briefing must begin with a hard no-commit
  preflight (per LRN-021). Require the sub-agent to record `git --no-pager log
  --oneline -1` in its final report and confirm "No commit was created."
- **Test minimums:** brief sub-agents with minimum test counts, never exact counts.
  Over-delivery on tests is a positive signal, not scope creep (LRN-037).
- **Schema-first:** any sub-agent writing config-reading code must read
  `schemas/*.schema.json` before authoring any field access. Field name guessing
  causes silent integration failures (LRN-039).
- **Report shape:** every sub-agent must respond with the canonical report shape from
  [OPERATIONS.md § Sub-agent report shape](OPERATIONS.md#sub-agent-report-shape).
  Reports missing this structure are rejected and the sub-agent is re-dispatched.

---

## Per-CS Loop

Complete these steps in order for every clickstop. Do not skip or reorder.

1. **Pre-claim — learnings gate.** Run `harness harvest` (CS04+) or manually review
   `LEARNINGS.md` for stale `open` items tagged `process` or `architectural`, and any
   items whose `claim_area` matches the area you are claiming. Disposition before
   proceeding. See [Harvest Cadence](#harvest-cadence) for disposition options.

2. **Claim.** Rename `planned_cs<NN>_*.md` → `active_cs<NN>_*.md`. Update
   `WORKBOARD.md` with your row: CS-Task ID, agent ID, branch, state, last-updated.
   Commit via a `workboard/cs<NN>-claim` PR (user-reviewed until CS15b; bot-merged
   from CS15b onward). WORKBOARD task states:
   - `planned` — filed, not yet started
   - `active` — claimed and in flight (you own it; no other orchestrator may claim it)
   - `blocked` — cannot proceed; document the blocker and set a `reclaimable` threshold
     (default 7 days) in the WORKBOARD row so another orchestrator can pick it up
   - `paused` — intentionally paused; same reclaimable convention as `blocked`
   - `done` — merged to `main`; remove the row at step 11

3. **Branch.** Create `cs<NN>/<slug>` from `main`:
   `git checkout -b cs<NN>/<slug> origin/main`.

4. **Plan-internal.** Identify parallelisable sub-tasks. Record each in the CS file's
   `## Tasks` table with the canonical Notes format before dispatching any sub-agent:
   `agent-id=<id> | role=<role> | report-status=pending | learnings=0`.
   Follow [OPERATIONS.md § Sub-agent dispatch](OPERATIONS.md#sub-agent-dispatch) for
   briefing structure, file-ownership declarations, no-commit preflight, and the
   mandatory report shape. Brief sub-agents with test **minimums**, never exact counts
   (per LRN-037). Every briefing must include:
   - Hard no-commit preflight in the first paragraph (LRN-021).
   - Explicit file ownership list — exactly the files this sub-agent may write.
   - Required reading list — active CS file, INSTRUCTIONS.md, CONVENTIONS.md, and any
     relevant schemas (LRN-039).
   - Decision authority and escalation path — what the sub-agent may decide alone vs.
     what must come back to the orchestrator.
   - Self-check requirements — tests, linters, `git status --short`, SHA verification.

5. **Implement.** All code, template, and doc changes land on the CS branch. Sub-agents
   may run in parallel as long as they own disjoint file sets. After each parallel
   wave, verify disk state: `git status --short` plus per-file size check (per
   LRN-017). If a sub-agent's disk state contradicts its report, re-dispatch with the
   lost-work briefing. Do not declare a parallel wave complete until the disk state
   matches every sub-agent's reported deliverables.

6. **Local review.** GPT-5.5 rubber-duck mandatory. Record model + timestamp + fallback
   reason (if any) and the list of CS implementers in the PR body.

7. **Open PR** using the pull request template. Ensure the title is `<type>(scope): ...`
   and the body includes the local-review record.

8. **CI checks** must all pass before requesting review. Fix failures on the branch;
   never merge a red CI.

9. **Review.**
   - Private phase (CS01–CS15a): GPT-5.5 + user review. Copilot review optional.
   - Public phase (CS15b+): GPT-5.5 + Copilot review + user review on
     CODEOWNERS-protected paths.

10. **Resolve all threads**, then **squash-merge**. Never merge with unresolved
    suggestions or blocking review threads.

11. **Post-merge closeout.** Rename `active_cs<NN>_*.md` → `done_cs<NN>_*.md`. Update
    `WORKBOARD.md` (remove row or mark done). Update `CONTEXT.md` if the codebase
    state changed. File new learnings in `LEARNINGS.md`.

12. **Harvest** if the cadence triggers — see [Harvest Cadence](#harvest-cadence).

### Harvest Cadence

Two triggers drive the harvest. Both use `harness harvest` (CS04+), which scans
`LEARNINGS.md` for `open` entries and prompts you to disposition each one.
Full procedure and disposition states are in [RETROSPECTIVES.md](RETROSPECTIVES.md).

#### Weekly

Run `harness harvest` at the start of your work week (Monday morning or equivalent).

For each `open` learning, choose one disposition:

- **Apply upstream.** Edit the relevant process doc (INSTRUCTIONS, CONVENTIONS,
  OPERATIONS, REVIEWS, RETROSPECTIVES, ARCHITECTURE, or TRACKING) to incorporate the
  finding. Mark the LEARNINGS.md entry `applied` with the commit SHA in its YAML
  frontmatter.
- **File a CS.** For tooling or automation gaps that require code changes, create a
  `planned_cs<NN>_<slug>.md` and link it from the learning entry. Leave the entry
  `open` until the CS closes.
- **Obsolete.** Mark `obsolete` with a short reason if the learning is no longer
  relevant (e.g., the problem it describes was eliminated by a subsequent change).
- **Defer.** Leave `open` with an explicit reason and a `deferred_until` date. The
  CLI prevents indefinite re-deferral: after the second consecutive defer, the entry
  is dropped from before-claim prompts and surfaces only at weekly harvest.

#### Before-Claim (bounded)

Triggered automatically by `harness claim` (CS04+). **Silent if no stale relevant
learning exists.** Fires only when at least one of the following is true:

- a stale `open` learning is tagged `process` or `architectural`;
- a stale `open` learning has a `claim_area` matching the area being claimed.

Output is batched — for example: "3 stale learnings; choose apply / defer / obsolete /
skip-for-this-CS each." You are not required to fully resolve learnings that lack a
clear disposition yet — file them as `open` with a reason and let the weekly harvest
handle full resolution. The goal of this gate is to prevent known process gaps from
being silently carried into new work.

---

## When to Add X

Use this section as a decision tree when you are unsure whether a change warrants a
new file, a new script, a new schema, or a new scaffold. Scaffold templates are CS10
deliverables and are referenced by expected name below. Until CS10 closes, note the
expected scaffold name in your briefing and add a `TODO(CS10)` comment where
applicable.

### When to Add a Script

**Add** a new file under `scripts/check-*.mjs` (linter) or `scripts/*.mjs` (utility)
when:

- The logic runs at authoring time, not consumer runtime (e.g., a linter, a validator,
  a report generator).
- The logic is not already covered by a function in `lib/`.
- The script accepts an explicit `--file <path>` flag; never infer the target path from
  `import.meta.url` (per LRN-032).

Linter scripts additionally must:
- Exit 0 for valid input, 1 for validation errors, 2 for bad CLI usage.
- Print `ERROR:` / `WARNING:` prefixed lines and end with `✅ Linter passed` or
  `❌ Linter FAILED`.
- Be registered in the `harness lint` aggregator so CI picks them up.
- Use `requireValue(args, i, flagName)` for all flag-value parsing to prevent silent
  misparsing when a flag is the last token with no value (per LRN-040).

Use scaffold: `scaffolds/new-script.md` (CS10 deliverable).

**Do NOT add** a script if the logic belongs at consumer runtime — that belongs in
`bin/harness.mjs` or a subcommand module.

### When to Add a CLI Subcommand

**Add** a new subcommand to `bin/harness.mjs` (or a dedicated module it delegates to)
when:

- The feature is part of the harness CLI surface that consumer projects invoke at
  runtime or in CI (e.g., `harness sync`, `harness lint`, `harness harvest`).
- It is NOT a one-off authoring script — CLI subcommands are versioned and appear in
  `harness --help`.

CLI subcommand requirements:
- Forward `--help` to print usage and exit 0 (per LRN-030).
- Accept `--config <path>` and resolve it once into a single variable used for all
  config reads and for threading to delegated subcommands (per LRN-038).
- Use `requireValue(args, i, flagName)` for all flag-value parsing (per LRN-040).
- Use `spawnSync` with `shell: true` on Windows-compatible paths (per LRN-029).

Use scaffold: `scaffolds/new-subcommand.md` (CS10 deliverable).

**Do NOT add** a CLI subcommand for logic that only runs during authoring-time
validation — use a `scripts/check-*.mjs` script instead.

### When to Add a Library Module

**Add** a new module under `lib/` when:

- The same logic is called by two or more scripts, commands, or test suites.
- The module has a stable public API that should be independently testable.
- The module has zero runtime dependencies beyond Node.js built-ins (runtime deps
  require explicit approval and a separate CS).

Use scaffold: `scaffolds/new-library-module.md` (CS10 deliverable).

**Do NOT add** a library module for one-off utilities used by only a single script —
keep them inline.

### When to Add a Template File

**Add** a new template under `template/managed/` or `template/composed/` when:

- The file is delivered to consumer repos via `harness sync`.
- You have explicitly classified it as managed or composed:
  - **Managed** (`template/managed/`): harness overwrites the file in full on every
    sync; the consumer must not edit it. No marker blocks. Use for policy files whose
    content is entirely harness-owned.
  - **Composed** (`template/composed/`): harness manages a core block; the consumer
    may add local content via `<!-- harness:start id=<block-id> -->` /
    `<!-- harness:end id=<block-id> -->` markers. Use for files that need a
    harness-provided core plus project-specific extensions.

**Add** a file to `template/seeded/` when:
- The file is copied to consumer repos on initial setup only and is **never**
  overwritten by subsequent syncs. The consumer owns it completely after seeding.

Use scaffold: `scaffolds/new-template.md` (CS10 deliverable).

**Do NOT add** a template for harness-internal files that never leave this repo — put
those in `lib/`, `bin/`, or `scripts/` as appropriate.

### When to Add a Linter

**Add** a linter under `scripts/check-*.mjs` when:

- A structural invariant or schema contract needs to be verified on every PR.
- The invariant is not already covered by an existing linter.
- The linter can be expressed as a standalone script with a `--file <path>` argument
  (so `harness lint` can thread it explicitly — per LRN-032).

Required linter interface (enforced by `harness lint`):
- Accepts `--file <path>` and `--quiet` flags.
- Exit codes: 0 = valid, 1 = errors found, 2 = bad usage.
- Summary line at the end: `<basename>: N errors, M warnings`.
- Final line: `✅ Linter passed` or `❌ Linter FAILED`.

Use scaffold: `scaffolds/new-linter.md` (CS10 deliverable).

### When to Add a Schema

**Add** a schema under `schemas/*.schema.json` when:

- A structured file format (config, lock, learning entry, CS file, etc.) is read by
  two or more scripts and needs a shared, validated contract.
- You need `check-*` linters or sub-agent briefings to cross-reference field names
  (per LRN-039 — never guess field names; always derive them from the schema).

Use scaffold: `scaffolds/new-schema.md` (CS10 deliverable).

**Do NOT add** a schema for ad-hoc internal structures used by only one script — use
JSDoc `@typedef` annotations instead.

### When to Add a Test

**Add** tests in `tests/*.test.mjs` (Node built-in test runner) when:

- A new library module is added — test its public API directly.
- A new linter is added — add fixture-based tests (valid fixtures → exit 0; invalid
  fixtures → exit 1 with expected error messages).
- A regression is found — add a test that reproduces the failure before fixing it.

Test hygiene rules:
- Tests must be runnable with `node --test tests/*.test.mjs`.
- No third-party test frameworks. Use `node:test` and `node:assert` only.
- Fixture files live in `tests/fixtures/` and are named after the test file.
- Tests must not write to `/tmp` or any path outside the project root.
- Brief sub-agents with minimum counts; over-delivery is encouraged (LRN-037).

Use scaffold: `scaffolds/new-test.md` (CS10 deliverable).

### When to Add a Scaffold

**Add** a scaffold under `scaffolds/` when:

- A new category of deliverable will be created repeatedly across multiple CSs.
- The pattern is stable enough to be templated (used at least twice, shape unlikely
  to change significantly).

Scaffolds themselves are CS10 deliverables. Until CS10 closes, reference the expected
name in briefings with a `TODO(CS10)` annotation; back-filling is acceptable.

### When to File a CS vs. Inline a Fix

**File a new CS** when:

- The change is non-trivial (estimated > 2 hours of orchestrator + sub-agent work).
- The change crosses multiple files or requires a dedicated review round.
- The change is a tooling/automation gap surfaced by a harvest learning.
- The change modifies a managed or composed template file (template changes always
  land in their own CS, never piggy-backed onto implementation work).

**Inline** a fix on the current CS when:

- The fix is a direct consequence of a failing self-check or CI error on this branch.
- The fix touches only files already owned by the current CS.
- The fix is small enough to review as part of the current CS's PR without inflating
  its scope.

When in doubt, file a CS. Small, focused CSs are cheaper than scope-inflated PRs.

---

## Pointers

| Topic | Where to look |
|---|---|
| Code, test, git, and documentation conventions | [CONVENTIONS.md](CONVENTIONS.md) |
| Day-to-day procedures (claim, dispatch, sync, harvest) | [OPERATIONS.md](OPERATIONS.md) |
| Review loop (primary model, fallback policy, independence invariant) | [REVIEWS.md](REVIEWS.md) |
| Clickstop lifecycle + agent identification | [TRACKING.md](TRACKING.md) |
| Definition of "learning", categories, harvest procedure | [RETROSPECTIVES.md](RETROSPECTIVES.md) |
| Live coordination (who owns what, blocked tasks) | [WORKBOARD.md](WORKBOARD.md) |
| Current codebase state (last CS closed, key paths) | [CONTEXT.md](CONTEXT.md) |
| Architecture (design decisions, module map) | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Accumulated project knowledge (LRN entries) | [LEARNINGS.md](LEARNINGS.md) |
| The CS plan that drives this project | [project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md](project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md) |

### {{project_name}} — Project-Specific Pointers

The following pointers are specific to this deployment of the harness in
**{{project_name}}** (repo slug: `{{repo_slug}}`). They are filled in by `harness sync`
from `harness.config.json` at sync time.

- Agent ID suffix for this repo: `{{repo_slug}}`
- Agent ID env-var override: `HARNESS_AGENT_{{REPO_SLUG_UPPER}}_MACHINE`
- Project deploy procedures: see `OPERATIONS.md` local block `id=operations.project-deploy`
- Project review gates: see `REVIEWS.md` local block `id=reviews.project-gates`
- Project conventions: see `CONVENTIONS.md` local block `id=conventions.project`


### When to Add a Linter

**Add** a linter under `scripts/check-*.mjs` when:

- A structural invariant or schema contract needs to be verified on every PR.
- The invariant is not already covered by an existing linter.
- The linter can be expressed as a standalone script with a `--file <path>` argument
  (so `harness lint` can thread it explicitly — per LRN-032).

Required linter interface (enforced by `harness lint`):
- Accepts `--file <path>` and `--quiet` flags.
- Exit codes: 0 = valid, 1 = errors found, 2 = bad usage.
- Summary line at the end: `<basename>: N errors, M warnings`.
- Final line: `✅ Linter passed` or `❌ Linter FAILED`.

Use scaffold: `scaffolds/new-linter.md` (CS10 deliverable).

### When to Add a Schema

**Add** a schema under `schemas/*.schema.json` when:

- A structured file format (config, lock, learning entry, CS file, etc.) is read by
  two or more scripts and needs a shared, validated contract.
- You need `check-*` linters or sub-agent briefings to cross-reference field names
  (per LRN-039 — never guess field names; always derive them from the schema).

Use scaffold: `scaffolds/new-schema.md` (CS10 deliverable).

**Do NOT add** a schema for ad-hoc internal structures used by only one script — use
JSDoc `@typedef` annotations instead.

### When to Add a Test

**Add** tests in `tests/*.test.mjs` (Node built-in test runner) when:

- A new library module is added — test its public API directly.
- A new linter is added — add fixture-based tests (valid fixtures → exit 0; invalid
  fixtures → exit 1 with expected error messages).
- A regression is found — add a test that reproduces the failure before fixing it.

Test hygiene rules:
- Tests must be runnable with `node --test tests/*.test.mjs`.
- No third-party test frameworks. Use `node:test` and `node:assert` only.
- Fixture files live in `tests/fixtures/` and are named after the test file.
- Tests must not write to `/tmp` or any path outside the project root.
- Brief sub-agents with minimum counts (e.g., "minimum 5 tests for the happy path and
  2 error-path tests"); over-delivery is encouraged (LRN-037).

Use scaffold: `scaffolds/new-test.md` (CS10 deliverable).

### When to Add a Scaffold

**Add** a scaffold under `scaffolds/` when:

- A new category of deliverable will be created repeatedly across multiple CSs.
- The pattern is stable enough to be templated (i.e., it has been used at least twice
  and the shape is unlikely to change significantly).

Scaffolds are CS10 deliverables. For scaffolds that don't exist yet, reference the
expected name and annotate with `TODO(CS10)`. Back-filling the scaffold file is
acceptable after the pattern is proven.

---

## Pointers

| Topic | Where to look |
|---|---|
| Code, test, git, and documentation conventions | [CONVENTIONS.md](CONVENTIONS.md) |
| Day-to-day procedures (claim, dispatch, sync, harvest) | [OPERATIONS.md](OPERATIONS.md) |
| Review loop (primary model, fallback policy, independence invariant) | [REVIEWS.md](REVIEWS.md) |
| Clickstop lifecycle + agent identification | [TRACKING.md](TRACKING.md) |
| Definition of "learning", categories, harvest procedure | [RETROSPECTIVES.md](RETROSPECTIVES.md) |
| Live coordination (who owns what, blocked tasks) | [WORKBOARD.md](WORKBOARD.md) |
| Current codebase state (last CS closed, key paths) | [CONTEXT.md](CONTEXT.md) |
| Architecture (design decisions, module map) | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Accumulated project knowledge (LRN entries) | [LEARNINGS.md](LEARNINGS.md) |
| The CS plan that drives this project | [project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md](project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md) |

### {{project_name}} — Project-Specific Pointers

The following pointers are specific to this deployment of the harness in
**{{project_name}}** (repo slug: `{{repo_slug}}`). They are filled in by `harness sync`
from `harness.config.json` at sync time.

- Agent ID suffix for this repo: `{{repo_slug}}`
- Agent ID env-var override: `HARNESS_AGENT_{{REPO_SLUG_UPPER}}_MACHINE`
- Project deploy procedures: see `OPERATIONS.md` local block `id=operations.project-deploy`
- Project review gates: see `REVIEWS.md` local block `id=reviews.project-gates`
- Project conventions: see `CONVENTIONS.md` local block `id=conventions.project`
