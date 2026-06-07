# CS63b — Lifecycle + context-integrity code + doc-vs-reality (CS63 sibling)

**Status:** active
**Owner:** yoga-ah-c3
**Branch:** cs63b/content
**Started:** 2026-06-07
**Closed:** —
**Filed by:** CS63 (2026-06-06 by `yoga-ah-c3`) per the **G-scope=(a)** user decision — the **code-class** slice of the CS63 umbrella (workstreams W2 + W3) plus the C1 doc-vs-reality fix.
**Depends on:** **CS63** (umbrella — all decisions/risks). Shares the orchestrator-owned `bin/harness.mjs` + `INSTRUCTIONS.md`/`OPERATIONS.md` (+ mirrors) with CS63c → those shared-file edits **serialize** (CS63 C63-10); the new-file deliverables (`lib/harvest.mjs`, `scripts/check-closeout-freshness.mjs`) are disjoint and independent. Independent of CS63a.

## Goal

Make the advertised-but-stubbed lifecycle automation real and add the missing context-integrity gate: implement `harness harvest` (CS63 C63-4, W2), the close-out `CONTEXT.md`/`LEARNINGS.md` freshness linter (CS63 C63-5, W3), and correct the doc-vs-reality automation claims (CS63 C1).

## Background

See CS63 § Background (Axis 3 — C1/C2 and Axis 2 — U1). `harness harvest` is advertised in INSTRUCTIONS.md as the automatic pre-claim gate but is a stub; close-out has no gate that `CONTEXT.md` was updated; and the docs imply automation that does not exist.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C63b-1 | Scope | This CS executes CS63 workstreams **W2** (`harness harvest` + doc-vs-reality, decisions C63-4 + C1) and **W3** (close-out freshness linter, decision C63-5). All substantive decisions are CS63's. | Carves the code-class slice for separate review/merge from the template slice (CS63a). |
| C63b-2 | Harvest already prototyped | `lib/harvest.mjs` + `tests/lib-harvest.test.mjs` were implemented as a scope-independent spike on 2026-06-06 (12 passing tests; advisory exit, network-free, reuses `parseFrontmatterBlocks`). This CS adopts that module and wires `bin/harness.mjs` `cmdHarvest` to it (replacing the `die` stub). | The pure scanner is the risky/foundational part and is done + verified; remaining work is the thin CLI wiring + docs. |
| C63b-3 | Inherit CS63 | C63-4 (deterministic, network-free, advisory-by-default harvest; STUB-mark `check-migration`/`composed-audit` help), C63-5 (`active→done` rename ⇒ require `CONTEXT.md` change; self-host-safe; wired into `harness lint` + `pr-evidence`), C1 (correct INSTRUCTIONS/OPERATIONS automation claims) apply verbatim. | Single source of truth. |

## Deliverables

Per CS63 § Deliverables W2 + W3 (verbatim scope):
1. `lib/harvest.mjs` + `tests/lib-harvest.test.mjs` (CS63 deliverables 6, 7) — **prototyped 2026-06-06; adopt + finalize**.
2. `scripts/check-closeout-freshness.mjs` + `tests/check-closeout-freshness.test.mjs` + `tests/fixtures/cs63/closeout/**` (CS63 deliverables 9, 10).
3. Orchestrator-owned `bin/harness.mjs` — wire `cmdHarvest` to `lib/harvest.mjs`, add `check-closeout-freshness` to the `cmdLint` aggregator + `pr-evidence`, STUB-mark `check-migration`/`composed-audit` help (CS63 deliverable 19 subset).
4. Orchestrator-owned `INSTRUCTIONS.md` + `OPERATIONS.md` (+ `template/managed/` + `template/composed/` mirrors, lockstep) — correct the harvest/claim automation claims, C1 (CS63 deliverable 20 subset).
5. `CHANGELOG.md` `[Unreleased]` entries (CS63 deliverable 21 subset).

## User-approval gates

- **G-release** — folds into the single CS63-arc minor release (confirmed).

## Exit criteria

1. CS63 exit criteria **2** (real harvest + corrected automation claims + STUB-marked help) and **3** (close-out freshness linter wired + self-host-safe) are met.
2. `harness lint --quiet` passes on self-host (incl. composed-mirror lockstep + the new linter); `node --test tests/*.test.mjs` green; `sync --mode=check` no drift.
3. Plan-vs-implementation review (GPT-5.5 gate) returns GO.
4. CHANGELOG `[Unreleased]` entries present.

## Risks + open questions

Inherits CS63 risks **R4** (advisory harvest must not wedge claims), **R5** (managed-doc + mirror lockstep), **R6** (closeout linter false positives — trigger only on the rename event). See CS63 § Risks for full text.

| # | Risk / what breaks | Mitigation |
|---|---|---|
| R1 | Shared `bin/harness.mjs` + docs are also edited by CS63c → concurrent edits would race (CS63 R11). | Orchestrator-owned; serialize the shared-file edits between CS63b and CS63c (CS63 C63-10); new-file deliverables are disjoint. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: yoga-ah-c3) | 89492a4acf2c | 2026-06-07T00:10:00Z | Go | Owns W2+W3+C1; deliverables 6-10 + W7 subsets assigned without overlap; shared bin/docs serialized vs CS63c; harvest prototype (12 tests) verified present. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| W2 — adopt + finalize `lib/harvest.mjs` (+ `tests/lib-harvest.test.mjs`); wire `bin/harness.mjs` `cmdHarvest` to it (replace the `die` stub) | done | yoga-ah-c3 | implemented on `cs63b/content`; CS63 deliverables 6,7 (C63-4) |
| W3 — `scripts/check-closeout-freshness.mjs` (+ tests/fixtures); wire into `cmdLint` aggregator + `pr-evidence` | done | yoga-ah-c3 | implemented on `cs63b/content`; CS63 deliverables 9,10 (C63-5) |
| C1 — doc-vs-reality: correct INSTRUCTIONS/OPERATIONS harvest/claim automation claims (+ mirrors, lockstep) | done | yoga-ah-c3 | serialized vs CS63c (C63-10) |
| Content PR — GPT-5.5 rubber-duck + independent reviewer, CI green, squash-merge | in_progress | yoga-ah-c3 | `cs63b/content` rebased onto current main |
| Close-out: docs + restart state — update WORKBOARD, CONTEXT, relevant docs so a fresh agent can restart | pending | yoga-ah-c3 | per OPERATIONS.md § Claim close-out |
| Close-out: learnings + follow-ups — file/disposition LEARNINGS and any planned follow-up CSs | pending | yoga-ah-c3 | per RETROSPECTIVES.md |

## Notes / Learnings

- 2026-06-06: `lib/harvest.mjs` + `tests/lib-harvest.test.mjs` prototyped scope-independently (untracked working-tree spike; 12 tests pass; full suite green). To be adopted as deliverable 1 when this CS is claimed. **Validated end-to-end against the real `LEARNINGS.md`**: bounded pre-claim mode surfaces the stale open LRN-101 (process, 27d) for disposition and correctly excludes the fresh open LRN-139 (9d, < 14d threshold); weekly mode reports both open entries. Remaining W2 work is the thin `cmdHarvest` CLI wiring + the C1 doc-vs-reality edits.

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | yoga-ah-c3 |
| Reviewer agent | rubber-duck |
| Notes | W2+W3+C1 implemented on `cs63b/content` (prior session, claude-opus-4.8); reviewer GPT-5.5 + independent reviewer per REVIEWS.md independence invariant. |

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
