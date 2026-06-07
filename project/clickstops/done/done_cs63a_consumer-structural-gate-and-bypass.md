# CS63a — Consumer structural PR gate + bypass hardening (CS63 sibling)

**Status:** done
**Owner:** yoga-ah-c3
**Branch:** cs63a/content
**Started:** 2026-06-07
**Closed:** 2026-06-07
**Filed by:** CS63 (2026-06-06 by `yoga-ah-c3`) per the **G-scope=(a)** user decision — the **template-class** slice of the CS63 umbrella (workstreams W1 + W5). Kept separate from the code/doc siblings (CS63b/CS63c) to honor the template-changes-own-CS doctrine (INSTRUCTIONS.md:517-518).
**Depends on:** **CS63** (umbrella — all decisions/risks live there). Disjoint from CS63b/CS63c for its **new files** (the `template/.github/workflows/*` gate, `scripts/check-managed-drift.mjs`, schema/config, tests) — those may be built in parallel. Its **orchestrator-owned shared-file edits** (`bin/harness.mjs` `cmdInit`, `INSTRUCTIONS.md`/`OPERATIONS.md` + mirrors, `CHANGELOG.md`) are **serialized** with CS63b/CS63c per CS63 C63-10. The backing `scripts/check-managed-drift.mjs` is tightly coupled to the workflow gate and rides with it (acceptable per the CS64-rereview ruling that a template gate + its dedicated classifier is one cohesive unit, not piggy-backed implementation).

## Goal

Deliver the harness's **core value as an actual consumer merge gate**: a managed PR-time `harness lint` + file-class drift check (CS63 C63-2/C63-3, workstream W1) and the `workboard-only` bypass tightening (CS63 C63-7, workstream W5). This is the highest-priority CS63 finding (G1 🔴 — the structural gate the harness enforces on itself but does not ship to consumers).

## Background

See CS63 § Background (Axis 1 — G1/G2/G3) for the full evidence. In short: consumers get only a weekly drift workflow, not a PR-time structural gate, and the `workboard-only` label short-circuits all review gates. This sibling closes both.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C63a-1 | Scope | This CS executes CS63 workstreams **W1** (consumer structural PR gate, decisions C63-2 + C63-3) and **W5** (bypass hardening, decision C63-7). All substantive decisions are CS63's; this file carves the **template-class** slice for separate review/merge. | Honors INSTRUCTIONS.md:517-518 (template changes in their own CS) while keeping the gate + its dedicated classifier together. |
| C63a-2 | Default-on | Per the confirmed **G-gate-default** decision, `harness-pr-check.yml` ships **default-on** for fresh `init`; existing consumers receive it on next `sync` with a one-release CHANGELOG warn-note. | User decision 2026-06-06; closes CS63 Q1. |
| C63a-3 | Inherit CS63 | C63-2 (gate + `check-managed-drift.mjs` classifier + workflow security: least-privilege permissions, base-branch ref, allowlist), C63-3 (auditable `harness-managed-edit-ack` valve), C63-7 (bypass confined to the workboard diff-path allowlist) apply verbatim. | Single source of truth; no decision drift between umbrella and sibling. |

## Deliverables

Per CS63 § Deliverables W1 + W5 (verbatim scope):
1. `template/managed/.github/workflows/harness-pr-check.yml` (CS63 deliverable 1).
2. `scripts/check-managed-drift.mjs` + `tests/check-managed-drift.test.mjs` (CS63 deliverable 2, 5).
3. `schemas/harness.config.schema.json` `pr_check.enabled` field + `template/seeded/harness.config.json` default-on (CS63 deliverables 3, 4).
4. `tests/cs63-consumer-pr-check.test.mjs` (CS63 deliverable 5).
5. `template/managed/.github/workflows/pr-evidence-lint.yml` + `review-gates.yml` bypass tightening + `tests/cs63-workboard-bypass.test.mjs` (CS63 deliverables 13, 14).
6. Orchestrator-owned `bin/harness.mjs` `cmdInit` wiring of `harness-pr-check.yml` + `CHANGELOG.md` `[Unreleased]` entry (CS63 W7 subset for this slice).
7. Orchestrator-owned `INSTRUCTIONS.md` + `OPERATIONS.md` (+ `template/managed/` + `template/composed/` mirrors, lockstep) — document the consumer PR gate (C63-2/C63-3) and the `workboard-only` bypass tightening (C63-7); the **W1/W5 subset of CS63 deliverable 20** (serialized with CS63b/CS63c).

## User-approval gates

- **G-release** — folds into the single CS63-arc minor release (confirmed).

## Exit criteria

1. CS63 exit criteria **1** (consumer PR gate + classifier + security + ack) and **5** (bypass no longer skips mixed-content PRs) are met.
2. `harness lint --quiet` passes on self-host; `node --test tests/*.test.mjs` green; `sync --mode=check` no drift.
3. Plan-vs-implementation review (GPT-5.5 gate) returns GO.
4. CHANGELOG `[Unreleased]` entry present.

## Risks + open questions

Inherits CS63 risks **R2** (seeded-drift classifier), **R3** (ack auditability), **R8** (bypass allowlist must not break `workboard-auto-approve`), **R13** (workflow security / fork-PR ref injection). See CS63 § Risks for full text + mitigations.

| # | Risk / what breaks | Mitigation |
|---|---|---|
| R1 | Default-on (C63a-2) could start failing existing consumers' open PRs on first `sync`. | One-release CHANGELOG warn-note; the `pr_check.enabled` opt-out + the `harness-managed-edit-ack` valve give an immediate release path. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: yoga-ah-c3) | e446dfc8f0d0 | 2026-06-07T00:09:00Z | Needs-Fix | 2 blocking: "independent" wording contradicted orchestrator-owned cmdInit/serial (C63-10); W1/W5 doc subset of deliverable 20 unassigned. Both fixed in R2. |
| R2 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: yoga-ah-c3) | ff428913bf41 | 2026-06-07T00:14:00Z | Go | Depends-on now distinguishes disjoint new files from serialized shared-file edits (C63-10); deliverable 7 adds the W1/W5 doc subset. No new contradiction. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| W1 — consumer structural PR gate (`harness-pr-check.yml` + `check-managed-drift.mjs` classifier + `pr_check` schema/config) | done | yoga-ah-c3 | implemented on `cs63a/content`; CS63 deliverables 1–5 |
| W5 — `workboard-only` bypass hardening (`pr-evidence-lint.yml` + `review-gates.yml` path-allowlist confinement + tests) | done | yoga-ah-c3 | implemented on `cs63a/content`; C63-7, deliverables 13–14 |
| W7 subset — orchestrator integration (`bin/harness.mjs` `cmdInit` wiring + `INSTRUCTIONS.md`/`OPERATIONS.md` (+ mirrors) docs + `CHANGELOG.md`) | done | yoga-ah-c3 | serialized vs CS63b/CS63c per C63-10 |
| Content PR — GPT-5.5 rubber-duck + independent reviewer, CI green, squash-merge | in_progress | yoga-ah-c3 | `cs63a/content` rebased onto current main |
| Close-out: docs + restart state — update WORKBOARD, CONTEXT, relevant docs so a fresh agent can restart | pending | yoga-ah-c3 | per OPERATIONS.md § Claim close-out |
| Close-out: learnings + follow-ups — file/disposition LEARNINGS and any planned follow-up CSs | pending | yoga-ah-c3 | per RETROSPECTIVES.md |

## Notes / Learnings

**Close-out deviations (2026-06-07, `yoga-ah-c3`):**

- **C63a-2 / CS63 C63-2 — existing-consumer auto-delivery NOT delivered (escalated).** The plan stated existing consumers receive the gate "on next `harness sync`". `harness sync` has **no new-managed-file reconciliation** — it processes only files already in the consumer's config `managed`/`composed`/`seeded` arrays (`lib/sync.mjs`) — and `cmdInit` installs the gate only on fresh init (`if (!configExists)`). Shipped the **accurate** claim instead (fresh-init default-on + documented manual adoption: copy the workflow + add it to `managed.files`); **escalated** the auto-delivery decision to the user and deferred it to CS63c (guided update) / CS64. **LRN-155** filed. (Caught by the GitHub Copilot content review on PR #264.)
- **D3 (Deliverable 3) — fresh-init default-on via `cmdInit`, not the seeded config block.** `template/seeded/harness.config.json` was not given an explicit `pr_check` block; `cmdInit` materializes `pr_check.enabled: true` + the workflow on fresh init instead. Functionally equivalent and covered by `tests/cs63a-pr-check-init.test.mjs`. Accepted divergence (PVI).
- **D4 (Deliverable 5) — test filename.** Fresh-init/schema coverage landed as `tests/cs63a-pr-check-init.test.mjs` rather than the plan's `tests/cs63-consumer-pr-check.test.mjs`. Cosmetic; coverage is present. Accepted divergence (PVI).
- **D7 (Deliverable 7) — INSTRUCTIONS.md not updated.** The consumer PR gate + bypass tightening are documented in `OPERATIONS.md` (+ `template/composed/OPERATIONS.md` mirror), the procedures home; `INSTRUCTIONS.md` (orchestrator quick-ref) was not the appropriate home. Accepted divergence (PVI).

**Review:** 8 rounds (gpt-5.5 R1–R8 + 5 GitHub Copilot rounds) on PR #264 caught 13+ real issues in the prior session's implementation — including security hardening (base-config opt-out vs PR-head self-disable, exact-match + rename-aware + fail-closed `workboard-only` bypass) and correctness (`await` async `main`, accurate adoption docs). The mandatory multi-reviewer content-PR gate proved its value on code that had never had a content PR.

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | yoga-ah-c3 |
| Reviewer agent | rubber-duck |
| Notes | W1+W5 implemented on `cs63a/content` (prior session, claude-opus-4.8); reviewer GPT-5.5 + independent reviewer per REVIEWS.md independence invariant. |

## Plan-vs-implementation review

**Reviewer:** GPT-5.5 rubber-duck
**Date:** 2026-06-07T20:01:18Z
**Outcome:** GO

R1 (NEEDS-FIX) flagged one blocker — the missing CHANGELOG `[Unreleased]` entry (deliverable 6 / exit criterion 4); R2 confirmed the added entry's content was accurate but uncommitted; R3 verified it committed on `cs63a/close-out` (`6c88ef6`), non-empty vs `origin/main`, and accurate to the shipped implementation. Accepted divergences are recorded in `## Notes / Learnings`; LRN-155 documents the sync/new-managed-file delivery gap.

| # | Deliverable | Outcome |
|---|---|---|
| 1 | `harness-pr-check.yml` consumer structural gate (base-config ref/opt-out, least-privilege perms, head-SHA fallback, ack valve) | match |
| 2 | `check-managed-drift.mjs` classifier (managed/composed fail; seeded advisory) + tests | match |
| 3 | `pr_check.enabled` default-on | diverged / accepted — delivered via `cmdInit` fresh-init wiring (tested), not an explicit seeded-config block |
| 4 | fresh-init/schema test | diverged / accepted — landed as `tests/cs63a-pr-check-init.test.mjs` (cosmetic filename) |
| 5 | `workboard-only` bypass hardening + tests | match — exact-match allowlist, rename/copy-source aware, label re-trigger, fail-closed on files-API error |
| 6 | `cmdInit` wiring + CHANGELOG `[Unreleased]` | match — wiring present; CHANGELOG entry committed + accurate |
| 7 | INSTRUCTIONS/OPERATIONS docs | diverged / accepted — documented in `OPERATIONS.md` (+ composed mirror), the procedures home; not `INSTRUCTIONS.md` |

**Test coverage:** sufficient — drift classification, fresh-init/default-on, schema/config, and hardened `workboard-only` bypass scenarios are covered.

**C63a-2 deviation (accepted/escalated):** existing-consumer auto-delivery on `sync` is not delivered (`harness sync` has no new-managed-file reconciliation); accurate manual-adoption claim shipped + escalated to the user → CS63c/CS64. See `## Notes / Learnings` + LRN-155.
