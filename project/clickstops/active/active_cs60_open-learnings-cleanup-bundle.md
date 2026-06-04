# CS60 — Open-learnings cleanup bundle (doctrine + linter correctness + Windows/worktree env hardening)

**Status:** active
**Owner:** yoga-ah
**Branch:** cs60/content
**Started:** 2026-06-04
**Closed:** —
**Filed by:** Open-learnings audit (2026-06-04 by `yoga-ah`). Bundles the seven `open` learnings that do **not** already have a dedicated planned CS: **LRN-143, LRN-144** (review/close-out doctrine), **LRN-132, LRN-142** (harness linter correctness), **LRN-133, LRN-140, LRN-141** (Windows/worktree orchestrator-environment hazards).
**Depends on:** None hard. May claim independently.
**Out of scope (already planned elsewhere):** **LRN-139** → [`planned_cs58_plan-side-fact-claim-verification.md`](../planned/planned_cs58_plan-side-fact-claim-verification.md); **LRN-101** → [`planned_cs24_apply-lrn-101-changelog-touch-enforcement.md`](../planned/planned_cs24_apply-lrn-101-changelog-touch-enforcement.md). Deferred **LRN-014** (gwn-migration, revisit by 2026-06-15) is dispositioned with its own trigger and is not addressed here.

## Goal

Close the seven actionable `open` learnings above by shipping their disposition-recommended fixes — process-doctrine edits, two surgical linter/CLI corrections, and environment-hardening doc + tooling changes — and transition each LRN `open` → `applied`. The work is intentionally bundled because the items are individually small and fall into three cohesive groups that can be implemented in parallel across disjoint file sets.

## Background

The 2026-06-04 open-learnings audit found 9 open + 1 deferred learnings. Two open items already have planned CSs (LRN-139→CS58, LRN-101→CS24). The remaining seven group naturally:

- **Group A — review/close-out doctrine (docs only).** LRN-143: factual errors discovered in an *already plan-review-hashed* `## Decisions`/`## Deliverables` row must be corrected in the **implementation** plus a dated `## Notes` deviation record, never by editing the hashed section (editing invalidates the recorded plan-review hash; hashes cover only those two section bodies per `lib/plan-review-hash.mjs`). LRN-144: the plan-vs-implementation (PVI) close-out gate evaluates the **merged content HEAD** / content diff, and its verdict is recorded in the **active** CS file **before** the `active → done` rename — doing the rename first leaves a half-migrated worktree (renamed `done_*` file, unfilled `## Plan-vs-implementation review` section) that `check-clickstop` correctly rejects, yielding a spurious NEEDS-FIX.
- **Group B — harness linter/CLI correctness (LRN-039 "schema/config is source-of-truth" family).** LRN-132: `parseImplementerModels` (`lib/review.mjs:297`, regex at `:313`) is context-blind — its `(?:model|implementer-model|implementer model)\s*=` alternation matches bare `model = X` in narrative prose (e.g. a `Reviewer model: gpt-5.5` mention in the `## Plan-vs-implementation review` section), misclassifying the reviewer as a co-implementer and making `harness review` refuse to run. LRN-142: enforcement linters should read policy inputs from the same config/schema the rest of the system treats as authoritative and grandfather pre-existing artefacts by a **date** gate, not an identifier-number cutoff; the `high_risk_clickstops` drift for `check-clickstop-implementer-not-reviewer.mjs` was fixed in CS57, leaving a follow-up **audit** of other linters for hard-coded copies of `harness.config.json` / `schemas/` values.
- **Group C — Windows/worktree orchestrator hazards.** LRN-133: Windows PowerShell file authoring writes CRLF by default; combined with scratch files, this trips `scripts/check-text-encoding.mjs` and cascades to red `npm test`. **Both** the layer-1 fix (`.tmp/` in `.gitignore:10`) **and** the layer-2 fix (`check-text-encoding.mjs` already respects gitignore by default — `--respect-gitignore` ON, CS30/D3, anchored on `git ls-files --cached --others --exclude-standard` at `scripts/check-text-encoding.mjs:89`) are **already shipped**. The only remaining LRN-133 work is to **document** the Windows LF-normalization convention and **verify** the existing gitignore-aware behavior (no new encoding-linter code is required). LRN-140: `harness copilot-engage` polls Copilot at the **cwd local HEAD** (`detectGitHead(global.cwd)` in `bin/harness.mjs`, surfaced as `opts.headSha || pr.headRefOid` in `lib/copilot-engage.mjs:140`), not the PR's GitHub `headRefOid`, causing false polls when juggling worktrees. LRN-141: a freshly-created `git worktree` has no `node_modules` (gitignored, per-checkout), so dependency-backed linters fail until `npm install` runs in the worktree.

The disposition of each LRN already names its recommended fix; this CS executes those recommendations.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C60-1 | Scope | Bundle exactly the seven unplanned open learnings (LRN-143, 144, 132, 142, 133, 140, 141); cross-reference (do not duplicate) LRN-139→CS58 and LRN-101→CS24. | Avoids overlap with already-queued CSs; keeps a single small, cohesive cleanup CS. |
| C60-2 | LRN-143 doctrine | Add to `OPERATIONS.md § Plan review` a rule: a factual error found in a plan-review-hashed `## Decisions`/`## Deliverables` row is corrected in the implementation and recorded as a dated `## Notes` deviation, NEVER by editing the hashed section. | Preserves the plan-review hash audit chain; codifies the CS27 C27-3 precedent. |
| C60-3 | LRN-144 doctrine | Add to `OPERATIONS.md § Plan-vs-implementation review (close-out gate)` an ordering note: the gate evaluates the merged content HEAD / content diff; the verdict is recorded in the **active** CS file before the `active → done` rename; the rename is the last close-out step. | Prevents the half-migrated-worktree false NEEDS-FIX (CS27); aligns the doc with the existing "record in active file before rename" rule. |
| C60-4 | LRN-132 fix | Make `parseImplementerModels` context-aware: remove the bare `model` alternative from the ledger regex (require the literal `implementer`/`implementer-model`/`implementer model` token) AND/OR anchor parsing to the `## Model audit` table row. Add a regression test asserting a CS file containing `Reviewer model: gpt-5.5` in prose does NOT flag `gpt-5.5` as an implementer. | Closes the false-refusal that blocks `harness review` self-host dogfood; minimal, well-targeted change with a guard test. |
| C60-5 | LRN-142 scope | **Audit + clear-drift fixes** in `scripts/checks/*.mjs` only: scan for hard-coded copies of values that live in `harness.config.json`/`schemas/`, and fix the clear drift. A concrete known target is `scripts/checks/check-independence-invariant.mjs:11-12`, which hard-codes `DEFAULT_HIGH_RISK_CLICKSTOPS` and `PRIMARY_REVIEWER_MODEL` (the high-risk list is read from config via `??` fallback at `:141` but without the fail-closed validation CS57 added to `check-clickstop-implementer-not-reviewer.mjs`). Record the audit summary in this CS file's `## Notes / Learnings` and in the LRN-142 disposition. Explicitly EXCLUDE `lib/review.mjs` and `bin/harness.mjs` from edits (owned by other workstreams); escalate any drift found there. A shared `lib/` config accessor is OPTIONAL/stretch, not required. | Bounded follow-on to the CS57 fix; keeps file ownership disjoint for parallel execution; avoids scope creep into a large refactor. |
| C60-6 | LRN-133 fix | The encoding-linter code fix is **already shipped** (`check-text-encoding.mjs` respects gitignore by default — CS30/D3; `.tmp/` already gitignored). Remaining work is **doc + verification only**: document the Windows LF-normalization convention in `OPERATIONS.md § Copilot engagement procedure`, and verify (in the close-out gate) that the existing gitignore-aware behavior holds. No new encoding-linter code. | Avoids re-implementing already-shipped behavior (a plan-side fact-claim correction per LRN-139); keeps the cheap convention documented. |
| C60-7 | LRN-140 fix | Change `copilot-engage` to default the poll HEAD to the PR's GitHub `headRefOid` (already fetched), treat a CLI-supplied local HEAD as an opt-in `--head` override, and emit a warning when the detected local HEAD differs from the PR head. Update the help text and `OPERATIONS.md § copilot-engage`. | Eliminates the wrong-SHA false-poll / stuck `read-only-gates` (A5/A16) class; backwards-compatible via opt-in override. |
| C60-8 | LRN-141 fix | Add a "fresh-worktree → `npm install` first" requirement to `OPERATIONS.md § Sub-agent dispatch`, the canonical briefing preamble (`OPERATIONS.md § Mandatory briefing preamble` + the duplicated copies in root and `template/managed/.github/copilot-instructions.md`), so any sub-agent owning files in a new worktree installs deps before running linters. | Doc-only; prevents the `ERR_MODULE_NOT_FOUND` class for sub-agents dispatched into fresh worktrees. |
| C60-9 | Learnings lifecycle | Transition all seven LRNs `open` → `applied` at close-out, each with a prose disposition referencing CS60 and the shipped change. | Standard learnings lifecycle; closes the loop. |
| C60-10 | Parallel execution | Implement via four disjoint-file-ownership background sub-agent workstreams (WS-DOCS, WS-REVIEW-LINTER, WS-ENGAGE, WS-CONFIG-AUDIT) that run in parallel, followed by serial orchestrator integration (CHANGELOG + LEARNINGS transitions + full lint + PVI). See § Parallelization / dispatch plan. | Maximizes throughput while guaranteeing no two agents write the same file; single-writer integration avoids CHANGELOG/LEARNINGS merge conflicts. |

## Deliverables

1. **`OPERATIONS.md`** — (a) `§ Plan review`: LRN-143 hashed-section deviation rule (C60-2); (b) `§ Plan-vs-implementation review (close-out gate)`: LRN-144 ordering note (C60-3); (c) `§ copilot-engage`: LRN-140 doc + LRN-133 LF-normalization convention (C60-6/C60-7); (d) `§ Sub-agent dispatch` + `§ Mandatory briefing preamble`: LRN-141 fresh-worktree `npm install` requirement (C60-8). Mirror to `template/composed/OPERATIONS.md` if that is the managed source.
2. **`.github/copilot-instructions.md` + `template/managed/.github/copilot-instructions.md`** — add the fresh-worktree `npm install` line to the duplicated canonical preamble copies, kept in lockstep (C60-8).
3. **`lib/review.mjs`** — context-aware `parseImplementerModels` (C60-4) + regression test in a **new dedicated** file `tests/cs60-parse-implementer-models.test.mjs`.
4. **`lib/copilot-engage.mjs` + `bin/harness.mjs`** — `copilot-engage` defaults poll HEAD to `pr.headRefOid`, `--head` opt-in override, mismatch warning, updated help text (C60-7) + test in a **new dedicated** file `tests/cs60-copilot-engage-head.test.mjs`.
5. **`scripts/checks/*.mjs`** — LRN-142 config-drift **audit + clear-drift fixes** (concrete target `check-independence-invariant.mjs`), with a regression test in a **new dedicated** file `tests/cs60-config-drift.test.mjs` (C60-5). **No `check-text-encoding.mjs` code change** — its gitignore-aware behavior is already shipped; LRN-133's residual work is the doc convention in Deliverable #1c plus close-out verification (C60-6).
6. **`LEARNINGS.md`** — LRN-143, 144, 132, 142, 133, 140, 141 transitioned `open` → `applied` per C60-9.
7. **`CHANGELOG.md`** — entry under the next version's `[Unreleased]` block.

## Parallelization / dispatch plan

Four background sub-agent workstreams with **disjoint file ownership** (fully parallel), then serial orchestrator integration. Each briefing pastes the canonical preamble verbatim and includes the fresh-worktree `npm install` step (per LRN-141, the very fix this CS ships).

| WS | Owns (write) | Learnings | Notes |
|---|---|---|---|
| **WS-DOCS** | `OPERATIONS.md`, `template/composed/OPERATIONS.md` (if managed source), `.github/copilot-instructions.md`, `template/managed/.github/copilot-instructions.md`, `REVIEWS.md` (only if a cross-ref is needed) | LRN-143, 144, 141 (doc), 140 (doc), 133 (doc convention) | All markdown doctrine in one writer to avoid `OPERATIONS.md` write contention. Must keep composed/managed mirrors in lockstep. |
| **WS-REVIEW-LINTER** | `lib/review.mjs`, `tests/cs60-parse-implementer-models.test.mjs` (new) | LRN-132 | Code-only; must NOT touch `bin/harness.mjs`. |
| **WS-ENGAGE** | `lib/copilot-engage.mjs`, `bin/harness.mjs` (cmdCopilotEngage + help text), `tests/cs60-copilot-engage-head.test.mjs` (new) | LRN-140 (code) | Owns `bin/harness.mjs` exclusively. |
| **WS-CONFIG-AUDIT** | `scripts/checks/*.mjs` (audit + clear-drift fixes), `tests/cs60-config-drift.test.mjs` (new) | LRN-142, 133 (verify) | Concrete target: `check-independence-invariant.mjs` hard-coded `DEFAULT_HIGH_RISK_CLICKSTOPS`/`PRIMARY_REVIEWER_MODEL`. Must NOT edit `lib/review.mjs`, `bin/harness.mjs`, or `scripts/check-text-encoding.mjs` (no code change needed there); escalate drift found outside scope. Records LRN-142 findings in CS Notes. |
| **Orchestrator (serial)** | `CHANGELOG.md`, `LEARNINGS.md` | LRN open→applied ×7 | Single-writer integration after all WS complete; runs `harness lint` full suite + PVI gate. |

**Dependency graph:** WS-DOCS ∥ WS-REVIEW-LINTER ∥ WS-ENGAGE ∥ WS-CONFIG-AUDIT (no shared files) → orchestrator integration (CHANGELOG + LEARNINGS) → full lint → PVI. The four WS have zero file overlap (each owns a dedicated new test file), so they can be dispatched as four concurrent background agents.

## User-approval gates

- **G-release** if CS60 ships in its own tag. Standard pattern; otherwise the changes ride the next release cut.

## Exit criteria

1. LRN-143 + LRN-144 doctrine present in `OPERATIONS.md` (C60-2/C60-3).
2. LRN-141 fresh-worktree `npm install` requirement present in `OPERATIONS.md § Sub-agent dispatch` + the canonical preamble, with the root and `template/managed` copies in lockstep (C60-8).
3. `parseImplementerModels` no longer flags a reviewer model mentioned in prose; regression test added and green (C60-4).
4. `copilot-engage` defaults to `pr.headRefOid`, supports `--head` override, warns on mismatch; help text + `OPERATIONS.md` updated; test added (C60-7).
5. `check-text-encoding.mjs` gitignore-aware behavior verified still in effect (already shipped); the Windows LF-normalization convention is documented in `OPERATIONS.md`; LRN-142 audit findings recorded in `## Notes / Learnings` with any clear drift in `scripts/checks/*.mjs` fixed (C60-5/C60-6).
6. All seven LRNs are `applied` with disposition paragraphs referencing CS60 (C60-9).
7. `harness lint --quiet` passes (full suite) including composed/managed lockstep checks; full `node --test` green.
8. CHANGELOG entry present.
9. Plan-vs-implementation review (GPT-5.5 gate) returns GO.

## Risks + open questions

| # | Risk | Mitigation |
|---|---|---|
| R1 | `OPERATIONS.md` is composed/managed and must stay in lockstep with `template/composed/OPERATIONS.md`; the canonical preamble is duplicated across OPERATIONS + two copilot-instructions copies. | Assign ALL doc edits to a single WS-DOCS writer; rely on existing composed-blocks / duplication-lockstep lints; verify mirrors in the same PR. |
| R2 | LRN-132 regex change could under-match a legitimately-formatted `model = X` implementer declaration. | Anchor on the `## Model audit` table as the authoritative source; add tests for both the prose-false-positive and the valid-table-declaration cases. |
| R3 | `copilot-engage` HEAD-default change could alter behavior for existing callers relying on the local-HEAD poll. | Keep local-HEAD as an opt-in `--head` override; emit a warning, not an error, on mismatch; cover with a test. |
| R4 | LRN-142 audit could balloon into a large cross-linter refactor. | Scope to an audit + clear-drift fixes only; defer the shared config accessor to a follow-up (C60-5 marks it optional). |
| R5 | LRN-133 could be mis-scoped as an encoding-linter code change when that gitignore-aware behavior is already shipped (`check-text-encoding.mjs` default ON, CS30/D3). | Treat LRN-133 as doc + verification only (C60-6); the close-out gate verifies the existing behavior still holds (tracked files checked, ignored scratch files skipped) without modifying the linter. |
| R6 | Parallel sub-agents could still collide if the LRN-142 audit edits a file owned by WS-REVIEW-LINTER/WS-ENGAGE. | C60-5 explicitly forbids WS-CONFIG-AUDIT from editing `lib/review.mjs`/`bin/harness.mjs`/`check-text-encoding.mjs`; each WS owns a dedicated new test file; collisions escalate to the orchestrator. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: yoga-ah) | 2147ab017e51 | 2026-06-04T17:25:00Z | Needs-Fix | Fact drift: LRN-133 encoding-linter gitignore fix already shipped (treated as new work); parallel test ownership not disjoint; LRN-142 audit-vs-fix ambiguity + no findings destination. |
| R2 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: yoga-ah) | 2c45f5c8ddc9 | 2026-06-04T17:36:01Z | Go-with-amendments | R1 findings fixed: LRN-133 scoped doc-only; three dedicated new test files; LRN-142 names check-independence-invariant target + records findings. Stale WS-name (C60-10) + R5 wording amended. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| WS-DOCS: `OPERATIONS.md` + copilot-instructions doctrine (LRN-143 hashed-section deviation, LRN-144 PVI ordering, LRN-141 fresh-worktree npm install, LRN-140 doc, LRN-133 LF convention) | planned | — | Owns all markdown doctrine; composed/managed mirrors in lockstep. |
| WS-REVIEW-LINTER: context-aware `parseImplementerModels` in `lib/review.mjs` + `tests/cs60-parse-implementer-models.test.mjs` (LRN-132) | planned | — | Code-only; must not touch bin/harness.mjs. |
| WS-ENGAGE: `copilot-engage` default poll HEAD = `pr.headRefOid`, `--head` opt-in, mismatch warning, help text in `lib/copilot-engage.mjs` + `bin/harness.mjs` + `tests/cs60-copilot-engage-head.test.mjs` (LRN-140) | planned | — | Owns bin/harness.mjs exclusively. |
| WS-CONFIG-AUDIT: `scripts/checks/*.mjs` config-drift audit + clear-drift fixes (target `check-independence-invariant.mjs`) + `tests/cs60-config-drift.test.mjs` (LRN-142); verify `check-text-encoding.mjs` gitignore behavior (LRN-133) | planned | — | Must not edit lib/review.mjs, bin/harness.mjs, check-text-encoding.mjs. |
| Orchestrator integration: `CHANGELOG.md` `[Unreleased]` entry | planned | — | Single-writer; after all WS complete. |
| Close-out: docs + restart state — update `WORKBOARD.md`, `CONTEXT.md`, and composed/managed process templates + rendered roots as needed | planned | — | Mandatory close-out row. |
| Close-out: learnings + follow-ups — transition LRN-143, 144, 132, 142, 133, 140, 141 `open` → `applied` in `LEARNINGS.md`; file follow-ups for any deferred scope | planned | — | Mandatory close-out row. |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
