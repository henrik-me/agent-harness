# CS65 — Process-doc right-sizing: OPERATIONS.md extraction + LEARNINGS.md archival

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** CS63 (2026-06-06 by `yoga-ah-c3`) as the deferred follow-up for decision **C63-9** (doc right-sizing). CS63 did the safe `CONTEXT.md` history cap and deferred the high-risk `OPERATIONS.md` extraction and `LEARNINGS.md` archival to this dedicated CS, to ride with the CS64 CLI-commands work.
**Depends on:** **CS64** (hard, for the OPERATIONS.md half) — the procedure-body extraction thins `OPERATIONS.md` sections to pointers at the new `harness claim`/`close-out` command help, so those commands must exist first. The `LEARNINGS.md` archival half is independent and may proceed alone.

## Goal

Right-size the two process docs with structural unbounded-growth problems, identified by CS63's measurement: `OPERATIONS.md` (97 KB / 2038 lines — the procedure bible) and `LEARNINGS.md` (380 KB / 3612 lines — append-only log). Reduce always-loaded context cost and improve navigability **without losing any procedure an agent relies on or breaking any `LRN-###`/section cross-link**.

## Background

CS63 decision **C63-9** flagged these two files as the right-sizing targets and deliberately deferred them because both are load-bearing and high-blast-radius:

- **`OPERATIONS.md`** — most of its 2038 lines are procedure bodies (claim, dispatch, handoff, sync, harvest, copilot-engage, cross-repo, release) that are only needed at a specific lifecycle moment. Once CS64 ships `harness claim`/`close-out` (and CS63 shipped `harvest`), the executable procedure lives in command `--help`; the doc sections can collapse to thin "what + when + pointer" stubs. CS63 set a target of ~600 lines.
- **`LEARNINGS.md`** — an append-only knowledge log that only grows. Entries with status `applied`/`obsolete` past a threshold can move to an archive tier, keeping the active log lean while preserving every `LRN-###` anchor referenced across the process docs (the `check-instructions.mjs` dead-anchor lint and cross-link integrity must stay green).

This is explicitly a separate CS from CS63 because aggressive trimming of load-bearing docs is the dominant risk (CS63 R10); it must be done incrementally, anchor-preserving, and gated on CS64.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C65-1 | `OPERATIONS.md` extraction | Thin each procedure section whose executable steps are now a `harness` command (`claim`, `close-out`, `harvest`, and any other command-backed procedure) down to a **"what it does / when to run it / `harness <cmd> --help`"** stub, moving step-by-step detail into the command help text where it is missing. Target ≈ 600 lines. Edit the root file **and** `template/composed/OPERATIONS.md` in lockstep. **Do not** remove any procedure that has no command equivalent. | Removes the duplicated procedure bodies (the bulk of the file) while keeping the executable detail discoverable at the point of use. Composed lockstep keeps consumers correct. |
| C65-2 | Section-by-section, reversible | Extract **one section per commit**, each independently reviewable, verifying after each that the procedure is fully reachable via the referenced command help. No single sweeping rewrite. | Bounds blast radius (CS63 R10); a removed-procedure regression is caught at the section granularity, not buried in a 1000-line diff. |
| C65-3 | `LEARNINGS.md` archival | Split `LEARNINGS.md` into the active log + a new `LEARNINGS-archive.md` (or per-era archive), moving only `applied`/`obsolete` entries older than a defined threshold. **Every `LRN-###` anchor must remain resolvable** — update the dead-anchor/cross-link linters to treat the archive as an anchor source, or keep anchors as stubs that link to the archive. | Keeps the active learnings surface lean for harvest + pre-claim scans while preserving the full record and all cross-references. Status-gated so `open`/`deferred` items never leave the active log. |
| C65-4 | Anchor + cross-link integrity is the gate | The extraction/archival is only valid if a **repo-wide `LRN-###` + heading-anchor reference check** stays green — not just `check-instructions.mjs` (which validates only INSTRUCTIONS.md's own LRN refs and in-doc anchors, `scripts/check-instructions.mjs:158-204,257-259`) and `check-learnings.mjs` (entry/duplicate/sequence validation, not inbound links). Add a new repo-wide markdown reference linter (or an explicit audit over the root docs + `project/clickstops/**`) that fails if any `LRN-###` or `OPERATIONS.md#…`/`LEARNINGS.md#…` anchor referenced **anywhere in the repo** no longer resolves; composed-blocks lockstep also stays green. Add fixtures/tests for the archive tier. | Cross-link breakage is the concrete failure mode (CS63 R10); the existing linters only cover a slice, so links from `OPERATIONS.md`, `CONTEXT.md`, `done_csNN` files, or consumer docs could break silently. Make repo-wide resolution a mechanical gate, not a manual check. |
| C65-5 | No procedure loss + no anchor loss is the hard invariant | A pre/post audit lists every procedure heading in `OPERATIONS.md` before extraction and asserts each is still reachable (in-doc stub + command help) after. **Invariant: no existing public heading anchor in `OPERATIONS.md`/`LEARNINGS.md` is removed without a same-anchor stub or redirect**, so external consumers/scripts pinned to `…#anchor` links keep resolving even when the body moves to command help. | The unacceptable outcomes are silently deleting a procedure an agent depends on (R1) and silently breaking a heading anchor a consumer pinned to (R2); make both preservation guarantees auditable. |

## Deliverables

1. `OPERATIONS.md` (edit) + `template/composed/OPERATIONS.md` (edit, lockstep) — procedure sections thinned to pointer stubs; ≈ 600-line target. (C65-1, C65-2)
2. Command `--help` text (in `bin/harness.mjs`, edit) — backfilled with any step detail moved out of `OPERATIONS.md` so nothing is lost. (C65-1)
3. `LEARNINGS-archive.md` (new) + `LEARNINGS.md` (edit) — `applied`/`obsolete` aged entries moved to the archive; active log lean; all `LRN-###` anchors resolvable. (C65-3)
4. A **repo-wide `LRN-###` + heading-anchor reference linter** (new) + fixtures/tests, plus updates so `check-instructions.mjs` / `check-learnings.mjs` recognize the archive tier; all stay green and every inbound link across root docs + `project/clickstops/**` resolves. (C65-4)
5. A **procedure-preservation audit** artifact (pre/post heading list, reachability assertion) in this CS's `done_` directory. (C65-5)
6. `CHANGELOG.md` (edit) — `[Unreleased]` entries (doc-structure change; note for consumers that `OPERATIONS.md` sections now point at command help).

## User-approval gates

- **G-threshold** — confirm the `LEARNINGS.md` archival age/status threshold before moving entries (C65-3).
- **G-target** — confirm the `OPERATIONS.md` line-count target / how aggressively to thin (C65-1).

## Exit criteria

1. `OPERATIONS.md` (+ composed mirror) procedure sections are pointer stubs referencing command help; the file is materially smaller (≈ target) with **no procedure removed without a command-help equivalent** (C65-1, C65-5).
2. The procedure-preservation audit shows every pre-extraction procedure heading still reachable (C65-5).
3. `LEARNINGS.md` retains all `open`/`deferred` entries; aged `applied`/`obsolete` entries are in `LEARNINGS-archive.md`; every `LRN-###` cross-reference resolves (C65-3, C65-4).
4. `check-instructions.mjs`, `check-learnings.mjs`, composed-blocks lockstep, and all doc-link checks pass on self-host (C65-4).
5. `harness lint --quiet` passes; `node --test tests/*.test.mjs` green; `sync --mode=check` no drift.
6. Plan-vs-implementation review (GPT-5.5 gate) returns GO.
7. CHANGELOG `[Unreleased]` entries present.

## Risks + open questions

| # | Risk / what breaks | Mitigation |
|---|---|---|
| R1 | Aggressive `OPERATIONS.md` trimming **deletes a procedure an agent relies on** (the dominant CS63 R10 risk). | C65-5 pre/post audit; C65-2 one-section-per-commit; only thin sections with a command equivalent; backfill command help before removing prose. |
| R2 | `LEARNINGS.md` split **breaks `LRN-###` anchors** referenced across INSTRUCTIONS/OPERATIONS/CONTEXT and the dead-anchor lint. | C65-4 makes anchor/cross-link integrity a mechanical gate; archive recognized as an anchor source or anchors kept as redirect stubs; status-gated move (open/deferred never leave). |
| R3 | Root vs `template/composed/OPERATIONS.md` **drift** during a large multi-commit extraction. | Edit both in lockstep per section; `sync --mode=check` + composed-blocks lint in exit criteria catch divergence. |
| R4 | Hard dependency on **CS64** — extracting before `claim`/`close-out` exist would leave dangling pointers. | Gate the OPERATIONS half on CS64 merge; the LEARNINGS-archival half is independent and can proceed first. |
| R5 | Moving content out of always-loaded docs could make a procedure **less discoverable** if an agent does not run the command. | Keep a one-line "what + when" stub in-doc (never a bare link); the stub names the command so discovery survives even without invoking it. |
| Q1 | Open — should the archive be one `LEARNINGS-archive.md` or per-era files? | G-threshold decision; default single archive unless size warrants era-splitting. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: yoga-ah-c3) | bac9ab5a2d67 | 2026-06-06T23:35:00Z | Go | Counts corrected (2038/3612); C65-4 now requires repo-wide LRN-###/heading-anchor check (not just check-instructions); C65-5 adds no-anchor-removal invariant. CS63→64→65 acyclic. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per OPERATIONS.md § Claim) | planned | — | — |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
