# REVIEWS

> **File class: composed.**
> The managed core below is owned by the harness and updated on sync. The
> `reviews.project-gates` block at the end is owned by the project and
> preserved across syncs. Edit managed sections via
> `template/composed/REVIEWS.md`; edit local gates directly in this file.

---

## Overview

Every clickstop (CS) passes through a three-phase review lifecycle:

1. **Claim PR review** — a brief local review performed before opening the
   content PR, confirming the work is coherent enough to share.
2. **Content PR review** — iterative GPT-5.5 (or approved fallback) review
   rounds on the open PR until all blocking findings are resolved.
3. **Close-out PR review** — a final pass confirming that non-blocking
   findings have been tracked or addressed and that the retrospective entry is
   filed.

This document defines the policies, models, calibration targets, and findings
taxonomy that govern each phase.

---

## Phase 1 — Claim PR Review

The claim PR is a lightweight WORKBOARD-only PR (labeled `workboard-only`).
It is auto-approved and auto-merged by the dedicated workflow
(`workboard-auto-approve.yml`) when:

- Only `WORKBOARD.md` and/or clickstop rename paths changed.
- The `workboard-only` label is present.
- The author is in the approved-actors list.

No formal review iteration is required for claim PRs. The orchestrator is
responsible for verifying the claim is correct (CS number, slug, branch name)
before the PR is raised.

---

## Phase 2 — Content PR Review

### 2.1 Review model

**Primary reviewer: GPT-5.5.**

GPT-5.5 is the sole approved primary reviewer for all content PRs. Every CS
implementation must receive at least one GPT-5.5 review before the PR is
considered merge-ready.

**Fallback: Claude Sonnet 4.6** — subject to the independence invariant and
risk-class restrictions below.

### 2.2 Fallback policy (Decision #22)

If GPT-5.5 is unavailable for more than 30 minutes, or after two failed
attempts, the orchestrator may fall back to a Claude Sonnet 4.6 rubber-duck
review. The following conditions must all hold before the fallback is allowed:

| Condition | Requirement |
|---|---|
| Independence invariant | Sonnet 4.6 must **not** have materially implemented the CS being reviewed. If Sonnet performed non-trivial implementation sub-tasks within the CS, the fallback is forbidden. |
| Risk class | The CS must **not** be HIGH-RISK (see §2.3). |
| Documentation | The PR body must record: model used, timestamp, fallback reason, and the implementer-model-list for the CS. |

If Sonnet 4.6 cannot be used (independence violation or HIGH-RISK CS), the
only permitted options are: retry GPT-5.5, or obtain an explicit user waiver.
A user waiver must be recorded in the PR body with the waiver rationale.

### 2.2.1 Reviewer model fallback ladder (CS35 C35-2)

The fallback ladder governs which model to use when the primary reviewer
(GPT-5.5) is unavailable:

> GPT-highest-available (5.5 → 5.4 → ...) → Claude Sonnet-highest (4.7 → 4.6 → ...) → orchestrator's own model (last resort with explicit user waiver). The independence invariant (no implementer/reviewer model overlap) applies at every step of the ladder.

See §2.3 for risk-class restrictions: HIGH-RISK CSs forbid the
orchestrator-own-model rung absent an explicit user waiver.

### 2.3 Risk-class restrictions

HIGH-RISK CSs require GPT-5.5 **or explicit user waiver only** — no Sonnet
fallback regardless of independence:

- CS03 (sync engine)
- CS11 (self-host)
- CS15a (public-readiness, visibility flip, and Ruleset activation)
- CS18b (PILOT-A baseline)
- CS19 (migration)

Any CS newly designated HIGH-RISK by the orchestrator inherits these same
restrictions.

### 2.4 Review-round calibration

Review convergence takes multiple rounds. The following targets are calibration
baselines, not hard caps — converge when all blocking findings are resolved
regardless of round count.

| CS risk class | Expected rounds | Calibration source |
|---|---|---|
| User-facing surface (CLI, schema-rendered outputs) | ~3 | [LRN-031](LEARNINGS.md#lrn-031) |
| HIGH-RISK (sync engine, schema authoring, public-flip, migration) | 5–8 | [LRN-024](LEARNINGS.md#lrn-024) |
| Thin plumbing / tooling | ~2 | heuristic |

**Do not close the content PR until GPT-5.5 (or approved fallback) issues an
explicit GO verdict.**

Key observations from [LRN-024](LEARNINGS.md#lrn-024) and
[LRN-031](LEARNINGS.md#lrn-031):

- Each fix round can introduce new findings by disturbing adjacent invariants.
  Multiple iterations are normal, not a sign of poor work.
- High-risk CSs with multiple interacting invariants (fail-closed semantics,
  cross-platform behaviour, prototype-pollution edge cases) routinely require
  6–7 rounds even for careful implementations.
- User-facing CLIs generate 5–10 findings per round because they have rich
  behavioural contracts (exit codes, flag semantics, help text, platform
  portability).
- Budget time and sub-agent slots accordingly when planning high-risk or
  user-facing CSs.

### 2.5 What the reviewer examines

The review scope depends on CS type:

**Implementation CSs:**
- Correctness and edge-case coverage.
- Sync invariants — especially composed-class fail-closed semantics.
- Schema compatibility (no breaking changes to `harness.lock.json` or
  published schemas).
- Test coverage — new behaviour must have tests; regression tests for any
  found bugs.
- Secrets and IP hygiene — no credentials, internal hostnames, or
  third-party-copyright content committed.

**Template CSs (CS08–CS10, canonical doc authoring):**
- Linter pass (`check-composed-blocks.mjs` for composed-class files).
- Cross-link integrity (anchors resolve, LEARNINGS.md IDs exist).
- Schema conformance (YAML front-matter where required).
- No project-specific leakage into managed templates — managed sections must
  be portable across harness consumers.

**Migration CSs (CS19):**
- Parity manifest completeness.
- Freshness-calendar compliance.
- Migration-base SHA recorded.
- Soft-freeze status confirmed.
- Rollback path documented.

### 2.6 Findings taxonomy

Every finding is classified at time of delivery. The reviewer must use
exactly one of these labels:

| Label | Meaning | Gate |
|---|---|---|
| **Blocking** | Defect, missing invariant, security/IP issue, or broken contract that must be resolved before merge. | Hard gate — PR cannot merge with open Blocking findings. |
| **Non-blocking** | Real issue worth tracking, but safe to defer. Examples: debt items, minor inconsistency, opportunistic improvement. | Soft gate — must be recorded in the close-out entry; may not silently vanish. |
| **Suggestion** | Optional improvement at the orchestrator's discretion. No gate. | No gate — record or discard. |

### 2.7 Finding disposition

**Blocking findings:** must be addressed before merge via one of:

1. **Fixed** — the finding is corrected in the PR and the reviewer confirms in
   the next round.
2. **Explicitly waived** — the orchestrator documents a justification for why
   the finding is safe to defer or disagree with. The waiver is recorded in
   the PR body. The orchestrator reserves final judgment on all waivers.

Silently ignoring a Blocking finding is not permitted. If the orchestrator
disagrees with the reviewer's classification, the disagreement must be stated
explicitly in the PR body before proceeding.

**Non-blocking findings:** must appear in the close-out retrospective entry.
The entry records: finding text, source round, and one of: `deferred`,
`addressed`, or `accepted-debt`.

**Suggestions:** the orchestrator logs or discards at its discretion. No
close-out entry required.

### 2.8 PR body requirements

Every content PR body must record the following fields before merge:

```
## Review log

| timestamp | analyzed_head | actor | model | verdict | evidence_link |
|---|---|---|---|---|---|
| 2026-05-14T10:32:00Z | a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2 | yoga-ah | gpt-5.5 | Go | https://github.com/henrik-me/agent-harness/pull/150#issuecomment-123456 |
```

## Model audit

| Field | Required | Description |
|---|---|---|
| `Implementer models` | yes | Comma-separated list of every model that materially implemented any code/doc/config in the CS (orchestrator + all sub-agents). Case-insensitive on the family + version pair (e.g. `claude-opus-4.7` ≡ `Claude Opus 4.7`). |
| `Reviewer model` | yes | Single model identifier from the C35-2 fallback ladder. |
| `Implementer agent` | optional in v0.4.0; required in v0.5.0 per C42-6 | GitHub username of the implementing agent. Per CS35 C35-18 (agent-identity independence). |
| `Reviewer agent` | optional in v0.4.0; required in v0.5.0 per C42-6 | GitHub username of the reviewing agent. Per CS35 C35-18. |

**Independence invariant (MUST):** `intersection({Implementer models}, {Reviewer model})` = ∅. Comparison is case-insensitive on the family + version pair. Violation blocks merge per A3.

**Agent-identity independence (MUST per CS35 C35-18):** `Implementer agent` ≠ `Reviewer agent` (case-insensitive). v0.4.0 issues a warning when columns are absent; v0.5.0 may upgrade to error per C42-6.

Example block (paste into the active CS file):

```
## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.7, claude-sonnet-4.6, claude-haiku-4.5 |
| Reviewer model | gpt-5.5 |
| Implementer agent | yoga-ah |
| Reviewer agent | copilot |
```

**Stale-diff doctrine (CS35 C35-3 + A4 gate):** A `Go` row whose
`analyzed_head` ≠ current HEAD is INVALID — re-review is required before
merge. The A4 PR-evidence gate (lands in CS36) enforces this mechanically.

**R1 / Rn distinction (CS35 + #145 Change 1):** R1 = first review on a given
HEAD; reviewer must enumerate every file under review. Rn = follow-up review
on a delta from the previous round; reviewer may enumerate ONLY the changed
files (delta-only enumeration permitted).

## PR-evidence gates (B1, A2–A6, A16 reference)

The PR-evidence subcommand (lands in CS36, wired to CI in CS38a) runs a fixed
set of mechanical gates against the diff + git log + PR body of a content PR.
Each gate is named (B1, A2..A6, A16) so CS plans, review log entries, and bug
reports can reference them by short name. The gates are layered: failure of an
earlier gate may shadow later gates' findings, but every reachable gate
reports independently.

| Gate | Name | Source CS | What it checks | C35 anchor |
|---|---|---|---|---|
| B1 | per-commit trailer | CS36 | Every commit in `git log <base>..<head>` (NOT squash-only) carries the `Co-authored-by: Copilot` trailer. The B-prefix is intentional: B-gates inspect the git **branch** / commit graph; A-gates inspect the active CS **audit** artefacts. | C35-5 |
| A2 | per-file enumeration | CS36 | The PR body's "Changes" section enumerates every changed file by path; no summary-pass on YAML/package.json bundles. | #145 PR #28 evidence |
| A3 | model-audit independence | CS36 | The active CS file's `## Model audit` block satisfies the independence invariant: `intersection({Implementer models}, {Reviewer model})` = ∅, case-insensitive on family + version. (Schema presence is implicit — if the table is missing or unparseable, A3 fails with a parse error.) | C35-4 |
| A4 | stale-diff currency | CS36 | The latest `Go` row in `## Review log` has `analyzed_head` equal to the current HEAD SHA of the PR. | C35-3 / C35-6 |
| A5 | review-after-implementation timestamp | CS36 | The latest `Go` row's `timestamp` is AFTER the latest commit's authored timestamp on the branch (no review-before-fix patterns). | C35-6 |
| A6 | plan-review attestation (PR-time) | CS35b | Every planned/active CS file touched by the PR carries a `## Plan review` row whose `Reviewed sections hash` matches the current content hash AND whose `Reviewer model` ∉ `Plan author model(s)`. STRICT in v0.4.0+v0.5.0 — no `--strict` ramp on this gate (per CS35b C35b-9). | CS35b C35b-2..C35b-9 |
| A16 | Copilot review engagement | CS41 | A Copilot review (state ∈ `APPROVED`/`COMMENTED`/`CHANGES_REQUESTED`) is present on the PR per the Copilot engagement procedure (OPERATIONS.md § Copilot engagement procedure). Verification-only on CI; mutation lives in `harness copilot-engage` per C35-10. | C35-10 |

Skip-semantics for B1, A2..A6, A16 are centralized via `--skip-reasons <comma-list>`
on `harness pr-evidence` (per C35-19); valid reasons: `workboard-only`,
`bot-author` (C35-8), `fork-source` (C35-9). The CI workflow computes the
reasons from the GitHub event payload; `harness pr-evidence` itself MUST
NOT call `gh pr view`.

---

## Phase 3 — Close-Out PR Review

The close-out PR archives the clickstop folder and updates `WORKBOARD.md`.
It is also `workboard-only`-labeled and auto-approved by the same workflow
as the claim PR.

Before raising the close-out PR the orchestrator must confirm:

- [ ] All Blocking findings from all content PR rounds are resolved or waived.
- [ ] All Non-blocking findings appear in the retrospective entry under
  `project/clickstops/done/<slug>/`.
- [ ] The WORKBOARD row for this CS is updated to `done`.
- [ ] Any LEARNINGS entries surfaced during the CS are filed in `LEARNINGS.md`.
- [ ] The `harness.lock.json` version is bumped if any managed or composed
  template changed.

---

## Review thread hygiene

All PR review threads must be resolved before merge. The squash-merge
policy (Decision #16, #17) applies:

- **Never** merge with unresolved review threads.
- **Never** merge-commit; squash only.
- If a thread represents a Suggestion the orchestrator has decided to discard,
  resolve it with a one-line explanation (e.g., "Suggestion noted; deferred to
  future CS.").

---

## Independence invariant — full statement

The independence invariant exists to prevent a model from reviewing its own
work. The invariant is violated when the same model (or
model/configuration pair) that materially implemented a CS is also the sole
reviewer of that CS.

"Materially implemented" means: the model authored non-trivial logic, not
merely mechanical find-replace or scaffolding.

Violation handling:
1. If GPT-5.5 is available: use GPT-5.5. No invariant concern (GPT-5.5 is
   never used as an implementer in this harness).
2. If GPT-5.5 is unavailable and Sonnet 4.6 is the candidate fallback:
   check the implementer-model-list for the CS. If Sonnet 4.6 did
   non-trivial implementation work, the fallback is forbidden. Escalate to
   GPT-5.5 retry or user waiver.
3. If neither is available: block the review, do not merge, escalate to user.

Beyond model independence (above), CS35 C35-18 introduces agent-identity
independence: the GitHub usernames of `Implementer agent` and `Reviewer agent`
MUST also differ. The CS41 linter `check-clickstop-implementer-not-reviewer`
enforces this; v0.4.0 issues a warning when the columns are absent, v0.5.0
may upgrade to error per C42-6.

---

## Phase matrix — quick reference

| Phase | PR type | Review required | Auto-merge eligible |
|---|---|---|---|
| Claim | `workboard-only` | No | Yes, via `workboard-auto-approve.yml` |
| Content | Normal | Yes — GPT-5.5 GO | No |
| Close-out | `workboard-only` | No (post-review confirmation only) | Yes, via `workboard-auto-approve.yml` |

---

<!-- harness:local-start id=reviews.project-gates -->

## Project-specific review gates

_No project-specific gates are defined yet. Add entries here for gates that
apply to this project but are not universal harness policy. Examples:_

- _"All clickstops that touch Azure deployment configuration require a manual
  approval step from the project owner before the close-out PR is raised."_
- _"Security-sensitive changes (cryptographic primitives, secret handling,
  auth flows) require a dedicated security review round in addition to the
  standard GPT-5.5 content review."_
- _"Any CS that modifies public-facing API schemas must include a
  backwards-compatibility attestation in the PR body."_

_Replace this placeholder paragraph with the actual gates for your project._

<!-- harness:local-end id=reviews.project-gates -->
