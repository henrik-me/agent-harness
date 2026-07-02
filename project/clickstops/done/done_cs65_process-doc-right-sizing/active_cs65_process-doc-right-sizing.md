# CS65 — Process-doc right-sizing: OPERATIONS.md extraction + LEARNINGS.md archival

**Status:** active
**Owner:** omni-ah-c3
**Branch:** cs65/content
**Started:** 2026-06-30
**Closed:** —
**Filed by:** CS63 (2026-06-06 by `yoga-ah-c3`) as the deferred follow-up for decision **C63-9** (doc right-sizing). CS63 did the safe `CONTEXT.md` history cap and deferred the high-risk `OPERATIONS.md` extraction and `LEARNINGS.md` archival to this dedicated CS, to ride with the CS64 CLI-commands work.
**Depends on:** **CS64** (hard, for the OPERATIONS.md half) — the procedure-body extraction thins `OPERATIONS.md` sections to pointers at the new `harness claim`/`close-out` command help, so those commands must exist first. The `LEARNINGS.md` archival half is independent and may proceed alone. **CS64b** (hard, added 2026-06-10) — the verb reliability primitives (LRN-151/155/157 applied) land before the prose backups are removed; thinning load-bearing docs without the hardened verbs underneath compounds CS63 R10.

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

**Resolved 2026-07-02** (@henrik-me sign-off — "you have my sign-off, go"; exact threshold/archive-shape values are the orchestrator's documented decision under that sign-off, recorded here for review; orchestrator omni-ah-c3):

- **G-target →** ≈600 lines is a **goal, not hard enforcement**. Direct user quote: *"the 600 line goal is not a hard enforcement it's a goal, everything needs to work as before just with a better structure for what exists, leveraging the full power of the harness."* Priority order for T2: (1) **no procedure loss** — every command-backed procedure body collapses to a "what it does / when to run it / `harness <cmd> --help`" stub with the executable detail backfilled into the command `--help`; (2) **preserve every heading anchor** (103 inbound `OPERATIONS.md#…` links repo-wide — thinning collapses bodies, never renames/removes a heading, per C65-5); (3) hit ≈600 lines only as far as (1)/(2) allow.
- **G-threshold →** archive `applied`/`obsolete` entries **dated `< 2026-06-01`** (139 entries — the entire May backlog); **keep as full entries** all `open`/`deferred` (any date) **plus** all `applied`/`obsolete` dated `>= 2026-06-01` (June/July recent window). Active-log entry count 179 → ~40. Month distribution at decision time: May 139 / June 19 / July 6 applied+obsolete; 14 open + 1 deferred. Trivially re-tunable by moving the cut date.
- **Archive shape (C65-3/C65-5 mechanism) →** **stub-redirect**, forced by **396 inbound `LEARNINGS.md#lrn-…` anchored links** repo-wide (OPERATIONS ×43 + composed ×43, INSTRUCTIONS ×14, CONTEXT ×11, CHANGELOG ×34, REVIEWS ×4, many historical `done_` files). Each archived entry: the full body (frontmatter + Problem/Finding/Evidence/Disposition) MOVES to `LEARNINGS-archive.md`; a **`### LRN-NNN` heading stub + one-line redirect stays in `LEARNINGS.md`**, so every existing `LEARNINGS.md#lrn-nnn` anchor and every bare `LRN-###` token still resolves unchanged (no repo-wide link rewrite; historical `done_` files untouched). "Everything works as before."
- **Q1 →** a **single** `LEARNINGS-archive.md` (139 entries does not warrant per-era splitting).
- **T4 scope refinement (recon finding) →** do NOT author a brand-new linter. CS81 already shipped `scripts/check-doc-xref-resolvability.mjs` (repo cross-ref resolvability). T4 = **extend** it + `check-learnings.mjs` to be archive/stub-aware (validate full entries in the archive; recognise heading-only stubs; guard no orphan stub↔archive-entry), and register `LEARNINGS-archive.md` in `harness lint` + text-encoding.

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

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | omni-ah-c3 |
| Reviewer agent | rubber-duck (orchestrator: omni-ah-c3) |
| Notes | Planned ledger (finalized at close-out). Orchestrator omni-ah-c3 `claude-opus-4.8` (claim, `bin/harness.mjs` --help backfill, CHANGELOG, PRs). Implementation sub-agents dispatched at `claude-opus-4.8` with disjoint file ownership (OPERATIONS thinning + composed mirror; LEARNINGS archival; new repo-wide reference linter + tests). Independence per REVIEWS § 2.3 — reviewer `gpt-5.5` ≠ every implementer model. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T0 — User-approval gates: confirm G-threshold (LEARNINGS archival age/status) + G-target (OPERATIONS line target) + Q1 (single vs per-era archive) | done | omni-ah-c3 | Resolved 2026-07-02 under @henrik-me sign-off — see `## User-approval gates § Resolved`. G-target=goal-not-hard; G-threshold=archive applied/obsolete dated <2026-06-01 via stub-redirect; Q1=single archive; T4=extend check-doc-xref-resolvability. |
| T1 — Recon/baseline: pre-extraction OPERATIONS procedure-heading inventory (C65-5) + repo-wide inventory of every inbound `LRN-###` / `OPERATIONS.md#` / `LEARNINGS.md#` reference (C65-4 baseline) | done | omni-ah-c3 | agent-id=cs65-recon \| role=explore \| report-status=pending \| learnings=0. Read-only recon; produces the audit baseline. |
| T2 — OPERATIONS thinning: thin command-backed procedure sections to "what/when/`harness <cmd> --help`" stubs, one section per commit (C65-1/2); backfill any moved step detail into `bin/harness.mjs` --help | done | omni-ah-c3 | Deliv. 1,2. agent-id=cs65-ops \| role=implementer \| report-status=pending \| learnings=0. Owns ONLY `OPERATIONS.md`, `template/composed/OPERATIONS.md`, `bin/harness.mjs`. Lockstep root+composed; depends on T0 G-target. |
| T3 — LEARNINGS archival: split aged `applied`/`obsolete` entries into `LEARNINGS-archive.md`; keep all `open`/`deferred` in active log; every `LRN-###` anchor resolvable (C65-3) | done | omni-ah-c3 | Deliv. 3. agent-id=cs65-learnings \| role=implementer \| report-status=pending \| learnings=0. Owns ONLY `LEARNINGS.md`, `LEARNINGS-archive.md`. Depends on T0 G-threshold/Q1. |
| T4 — Repo-wide reference linter (new `scripts/check-*.mjs`) + fixtures/tests; teach `check-instructions`/`check-learnings` about the archive tier; register in `harness lint` (C65-4) | done | omni-ah-c3 | Deliv. 4. agent-id=cs65-linter \| role=implementer \| report-status=pending \| learnings=0. Owns ONLY the new linter + its tests/fixtures + the recognized-archive edits to `check-instructions.mjs`/`check-learnings.mjs`. Tests under os.tmpdir(). |
| T5 — Procedure-preservation audit artifact (pre/post heading list + reachability assertion) in this CS's `done_` directory (C65-5) | done | omni-ah-c3 | Deliv. 5. Orchestrator-owned; built from T1 baseline + final OPERATIONS state. |
| T6 — `CHANGELOG.md` `[Unreleased]` entries (doc-structure change; note OPERATIONS sections now point at command help) | done | omni-ah-c3 | Deliv. 6; LRN-101. Orchestrator-owned. |
| T7 — Local rubber-duck plan-vs-implementation review (GPT-5.5) before PR | pending | omni-ah-c3 | Independence: reviewer ≠ implementer. |
| T8 — Content PR (`cs65/content`); `harness copilot-engage`; resolve threads; squash-merge | pending | omni-ah-c3 | OPERATIONS § Three-PR shape. |
| Close-out: docs + restart state — rename active→done; update WORKBOARD + CONTEXT; managed/composed mirrors green; `sync --mode=check` clean | pending | omni-ah-c3 | Mandatory close-out row (OPERATIONS § Claim). |
| Close-out: learnings + follow-ups — file LEARNINGS; planned follow-up CSs for any deferred scope | pending | omni-ah-c3 | Mandatory close-out row. |

## Notes / Learnings

- **2026-07-02 — Ownership takeover (omni-ah-c2 → omni-ah-c3).** Reassigned at the user's direction (omni-ah-c2 is busy on other work). No `cs65/content` branch existed on `origin` — CS65 had stalled at **T0 (user-approval gates)** before any implementation, so the handoff is clean (no WIP to preserve). New owner omni-ah-c3 is seeking the **G-target / G-threshold / Q1** answers to unblock T2/T3. Reclaim landed via a workboard-only PR on `workboard/cs65-takeover`.

- **2026-07-02 — Resumed 🟢 Active + gates resolved (omni-ah-c3).** @henrik-me gave sign-off to proceed. T0 gates dispositioned (see `## User-approval gates § Resolved`). Recon established: 396 inbound `LEARNINGS.md#lrn-` anchored links ⇒ archival must use **stub-redirect** (not a bare move); 103 inbound `OPERATIONS.md#` anchors ⇒ T2 preserves every heading; CS81's `check-doc-xref-resolvability.mjs` already exists ⇒ T4 **extends** it rather than adding a new linter; LEARNINGS entries carry a `date` field ⇒ date-based threshold is mechanical. Next: content branch `cs65/content` — T4 (guard) + T2 (OPERATIONS thinning) + T3 (LEARNINGS archival) via background sub-agents with disjoint file ownership.

- **2026-07-02 — Content phase implemented (omni-ah-c3).** Built via **3 parallel background sub-agents** (all `claude-opus-4.8`, disjoint file ownership, no-commit): **T4** `cs65-t4-linter` (archive/stub-aware `check-learnings.mjs` + `check-doc-xref-resolvability.mjs` check (d) + 15 `os.tmpdir` tests); **T3** `cs65-t3-learnings` (139 aged `applied` entries dated `<2026-06-01` → `LEARNINGS-archive.md` stub-redirect; `LEARNINGS.md` 4522→2059 lines; all 179 `### LRN-` anchors preserved); **T2** `cs65-t2-ops` (thinned 4 command-backed sections → `harness <cmd> --help` pointers; all 113 OPERATIONS headings preserved; root+composed lockstep).
  - **T2 conservative-thinning decision (−~47 OPERATIONS lines):** recon falsified the plan's biggest thinning premise — the `## Sub-agent dispatch` / `### Mandatory briefing preamble` block is **extracted live from `OPERATIONS.md` at runtime** by `lib/dispatch.mjs` (`harness dispatch`), so it is load-bearing and cannot be thinned. (The `## Reviewer dispatch — canonical preamble` is NOT extracted — `harness review` composes its prompt in code, `lib/review.mjs` — so it is duplicated doctrine left intact, a thinning candidate; see § Follow-ups.) Remaining kept sections (Release/Sync/Cross-repo/Handoff/PVI) are doctrine-dense with only partial/read-only command equivalents. Per the G-target resolution the ≈600-line goal is subordinate to no-procedure-loss + anchor-preservation, so the dominant right-sizing win is **LEARNINGS (−54%)**; deeper OPERATIONS thinning is a documented follow-up (see § Follow-ups).
  - **Orchestrator integration — 7 test breakages fixed** (fell outside every sub-agent's disjoint scope): (a) T2 over-thinned the Copilot section, dropping the **CS44-watchdog-pinned** `node(id: …)` / `BOT_kgDOCnlnWA` identity-resolution literals → **restored** to both OPERATIONS copies (the manual-fallback datum must live in the doc, not only in `--help`); (b) the new `LEARNINGS-archive.md` root file was an unclassified orphan → added to `harness.config.json` `excluded` (self-host-only, sync-skipped) per the CS11 file-class exhaustiveness invariant; (c) `cs48`/`cs49` asserted the archived LRN-127/126 **bodies** in `LEARNINGS.md` → updated to verify the body in `LEARNINGS-archive.md` + the anchor-stable stub redirect.
  - **Gates (all green):** `harness lint` 34/0/3; `node --test` **1628** tests, 0 fail; `sync --mode=check` no drift; T5 audit (`cs65-procedure-preservation-audit.md`) 113/113 OPERATIONS anchors preserved.
  - **Deviation (Deliverable 5):** the CS was converted flat→directory form to carry the T5 audit artifact (established pattern; e.g. `done_cs22`).

## Follow-ups (not in CS65 scope)

- **Deeper OPERATIONS.md thinning.** OPERATIONS remains ~2697 lines; the Release/Sync/Cross-repo/Handoff sections could be thinned further toward the ≈600 goal, but each is doctrine-dense and the sub-agent briefing preamble (extracted live from OPERATIONS.md by `harness dispatch`) is immovable. A follow-up CS could (a) thin the `## Reviewer dispatch — canonical preamble` section (NOT extracted by any command — `harness review` composes its prompt in `lib/review.mjs`), and/or (b) move the `harness dispatch` preamble source out of OPERATIONS.md into a dedicated file so that section becomes thinnable too.

## Learning candidates

- **process (parallel-dispatch integration scope):** relocating content that existing tests assert as real-data fixtures (LRN-126/127 in `cs48`/`cs49`) or that doc-alignment watchdogs pin (`BOT_kgDOCnlnWA` in `cs44`) breaks tests **no sub-agent owns**. Before dispatching an archival/relocation sub-agent, grep `tests/` for the moved tokens and pre-assign those fixups to the orchestrator's integration scope.

## Plan-vs-implementation review

**Reviewer:** gpt-5.5 (independent of the claude-opus-4.8 implementers; REVIEWS § 2.3)
**Date:** 2026-07-02
**Analyzed HEAD:** `ef8a54572593cc4b81f874d0948de249ece78b16` (merged `main`, PR #388)
**Outcome:** GO

Deliverables 1–6 all **PASS**; exit criteria 1–7 all **MET** (verified `harness lint` 35/0/3, `node --test` 1666 tests / 0 fail, `sync --mode=check` no drift, T5 audit 113/113 OPERATIONS anchors preserved; `check-learnings` validates 41 active + 139 archive entries with 0 errors). Decisions C65-1/3/4/5 honored; documented deviations — conservative OPERATIONS thinning (per the resolved G-target *goal*), T4 **extending** CS81's `check-doc-xref-resolvability.mjs` rather than adding a new linter, and the directory-form audit artifact — are reasonable and non-scope-breaking. C65-2's "one section per commit" is not durably verifiable post-squash, but the invariants it protects are covered by the T5 audit + the R1–R5 review history + passing linters + preserved anchors. **1 non-blocking finding (out of scope; follow-up):** `copilot-engage --help` frames `--no-poll` relative to a "requestReviews mutation" while the shipped doctrine correctly states the engagement primitive is `gh pr edit --add-reviewer` — a pre-existing help-text inaccuracy not introduced by CS65 (`OPERATIONS.md` retains the correct REST-vs-GraphQL doctrine).
