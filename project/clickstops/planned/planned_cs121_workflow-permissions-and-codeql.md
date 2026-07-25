# CS121 — Least-privilege `permissions:` on every workflow (+ a linter that keeps it that way) + CodeQL

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** omni-ah (orchestrator, `claude-opus-5`) on 2026-07-24, from a maintainer-requested repo evaluation ("more solid and secure workflows"). Audit run against `main` @ `8deaa32`.
**Depends on:** **CS119** (HARD) — both CSs modify `.github/workflows/validate-schemas.yml` and `.github/workflows/harness-self-check.yml`. CS119 owns the SHA pins and the `check-workflow-pins` job wiring; CS121 owns the `permissions:` blocks. CS121 must not be claimed or dispatched in parallel with CS119 (silent file race, LRN-016).

## Goal

Give every workflow an explicit least-privilege top-level `permissions:` default, add a linter that enforces it (and rejects top-level write scopes), add CodeQL static analysis, and add dependency-advisory visibility — closing the gaps the security audit found in the harness's own CI.

## Background

Audit of all 11 workflows in `.github/workflows/` on `main` @ `8deaa32`:

- **Four workflows have no top-level `permissions:`**, so they have no declared default and any job added to them later silently inherits the repository default token scope:
  - `review-gates.yml` — five jobs. **All five already declare explicit job-level `permissions:`** (`:20-22`, `:49-51`, `:112-114`, `:177-179`, `:240-242`), four at `contents: read` + `pull-requests: read` and one at `pull-requests: write`. So today's *effective* exposure is already least-privilege; the gap is the missing safe default for future jobs.
  - `harness-self-check.yml` — five jobs; the `GITHUB_TOKEN`-using jobs declare their own permissions. Same shape: no repo-wide default, jobs individually fine.
  - `validate-schemas.yml` — needs nothing beyond `contents: read`; has no block at all, at either level.
  - `harness-self-check-via-reusable.yml` — thin caller for the reusable workflow.
- **No CodeQL** configuration or workflow exists anywhere under `.github/`.
- **No `npm audit`** (or equivalent OSV/advisory) step in any workflow.

**Framing (corrected during plan review):** this is a *defence-in-depth and consistency* fix, not the remediation of a live over-privilege. An earlier draft of this plan asserted that `review-gates.yml` inherited broad defaults across five token-using jobs; that was wrong — its jobs are individually scoped. The real risk is structural: a workflow with no top-level default is one added job away from silent over-privilege, and nothing detects it.

What already exists and is *good*, and must not be disturbed: `secret-scan.yml` (gitleaks, checksum-verified), `.github/dependabot.yml` (weekly npm + github-actions), `workboard-auto-approve.yml`'s `pull_request_target` posture (checks out `base.sha`, never PR head, with regex-validated inputs), and the ref-validation shell guards in the drift/smoke/evidence workflows. The remaining 7 workflows already declare top-level `permissions:` — this CS finishes an existing convention rather than introducing a new one.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C121-1 | Default posture | Every workflow declares a top-level `permissions:` block; the baseline is `contents: read`, with additional scopes granted **per job**, not top-level | Top-level-minimum + per-job-grant is the standard least-privilege shape and keeps the blast radius of any one job small. |
| C121-2 | Method for deriving each job's scopes | Preserve every existing job-level block as-is; audit only jobs that currently have **no** job-level block (i.e. those actually inheriting the default) and grant them their observed scopes | The audit showed existing job blocks are already correct. Touching them would risk regression for no security gain; the work is confined to genuinely undeclared jobs. |
| C121-3 | `harness-self-check-via-reusable.yml` (caller) | Set the permissions the **called** workflow needs at the `job` that calls it, not a restrictive top-level `permissions: {}` | A reusable workflow cannot receive more permission than its caller grants. A `{}` top-level here would silently break `harness-checks.yml`, which needs `contents: read`. Verified against the callee before setting. |
| C121-4 | `workboard-auto-approve.yml` | **Annotation-only edit permitted.** Its `pull_request_target` handling, job logic, and existing scopes are not touched; it receives only the `# harness:allow-top-level-write <reason>` annotation required by C121-5 for its `issues: write` top-level scope | It is the most security-sensitive workflow in the repo and already hardened (CS91), so no behavioural edit. But it *does* carry a top-level write scope, so the C121-5 linter would fail it — the annotation is required for the gate to turn on green, and an annotation changes no behaviour. |
| C121-5 | New linter | `scripts/check-workflow-permissions.mjs` — **errors** when a workflow has no top-level `permissions:`, **and errors** when a top-level block grants any `write` scope unless the workflow carries an explicit `# harness:allow-top-level-write <reason>` annotation | A warning cannot "keep" least privilege — CI stays green on `write-all`, which is the failure mode being prevented. Erroring with a narrow, greppable, reason-bearing exception makes the few legitimate cases (`harness-drift.yml` needs `contents: write` to open PRs) explicit rather than invisible. |
| C121-6 | Linter scope | Same dirs as the CS119 pin linter: `.github/workflows`, plus `template/**` and `scaffolds/**` workflow dirs | Consumer-shipped workflows carry the harness's security posture; excluding them repeats the CS119 D1 mistake one layer out. |
| C121-7 | CodeQL | Add `.github/workflows/codeql.yml` for `javascript-typescript`, on `pull_request` + `push` to `main` + a weekly schedule. Top-level `permissions: contents: read`; `security-events: write` granted **only on the analysis job**, never at top level | Job-level scoping is what C121-1/C121-5 require — a top-level `security-events: write` would itself trip the new linter and would over-grant every other job in the file. |
| C121-8 | `npm audit` | Add `npm audit --audit-level=high` as a **non-blocking** step (`continue-on-error: true`) in an existing job, reported in the log. Named in the Goal as dependency-advisory visibility | The repo has 3 runtime deps; a blocking audit would let an unrelated upstream advisory halt all PRs. Visibility first; escalate to blocking only if it proves quiet. Called out in the Goal so it is not an unannounced policy addition. |
| C121-9 | Out of scope | (a) SHA-pinning actions (CS119); (b) action version bumps (CS112); (c) changing branch-protection/required checks (CS106); (d) making `npm audit` blocking | Keeps this CS to "declare what each workflow may do, and detect drift". Each excluded item has an owning CS. |

## Deliverables

1. Top-level `permissions:` added to `harness-self-check.yml`, `review-gates.yml`, `validate-schemas.yml`, and `harness-self-check-via-reusable.yml`, with per-job grants derived per C121-2/C121-3.
2. `# harness:allow-top-level-write <reason>` annotations added to the two workflows that legitimately carry top-level write scopes — `harness-drift.yml` (`contents: write`, `pull-requests: write`) and `workboard-auto-approve.yml` (`issues: write`, annotation-only per C121-4) — **and to their `template/managed/**` mirrors**, so the C121-5 gate turns on green.
3. A short audit note (in the PR body, and summarised in the CS Notes) recording, per job, which `GITHUB_TOKEN` operations justified each granted scope — the evidence for C121-2.
4. `scripts/check-workflow-permissions.mjs` per C121-5/C121-6, registered in `harness lint`.
5. `.github/workflows/codeql.yml` per C121-7, with third-party actions SHA-pinned (so it passes the CS119 gate).
6. Non-blocking `npm audit` step per C121-8.
7. Any `template/**` / `scaffolds/**` workflow missing a `permissions:` block, corrected — notably `scaffolds/verify-deploy/files/.github/workflows/verify-deploy.example.yml`, which has none.
8. Tests for the new linter: missing block → error; `contents: read` → pass; top-level write **without** annotation → error; top-level write **with** `# harness:allow-top-level-write` → pass; template/scaffold dirs scanned; the two annotated real workflows pass.
9. `OPERATIONS.md` security-posture section updated to state the permissions invariant, the annotation exception, and its enforcing linter (+ composed mirror in lockstep); `CHANGELOG.md` `[Unreleased]` entry.

## User-approval gates

- **G121-1:** CodeQL uploads results to GitHub code scanning and will surface findings publicly on a public repo. Confirm with @henrik-me before enabling, and confirm the desired posture for pre-existing findings (triage vs. baseline-dismiss).
- **G121-2:** if deriving least-privilege scopes for `review-gates.yml` requires *raising* any current effective permission (i.e. a job relies on the broad default today), escalate — that is a behaviour change, not a hardening.

## Exit criteria

1. All 12 workflows (the 11 existing plus the new `codeql.yml`) declare a top-level `permissions:` block; the new linter passes over `.github/workflows`, `template/**`, and `scaffolds/**`, erroring on a missing block and on an unannotated top-level write.
2. All PR-triggered workflows still pass on this CS's own PR — in particular every `review-gates.yml` job and the `pr-body` job in `harness-self-check.yml` that calls `gh api`.
3. CodeQL runs and completes on the PR with `security-events: write` granted only on its analysis job; `npm audit` step reports without blocking.
4. `node --test` 0 fail; `harness lint` 0 fail; `sync --mode=check` no drift.
5. Plan-vs-implementation review Go before close-out.

## Risks + open questions

| # | Risk / what breaks | Mitigation |
|---|---|---|
| R1 | **An under-granted scope breaks a review gate, and because the gates guard PRs, the breakage blocks the very PR that would fix it.** | Derive scopes from observed usage (C121-2), and validate on this CS's own PR — it exercises `review-gates.yml` end-to-end. If a gate deadlocks, the admin-squash path used by prior CSs (CS91 Rec A) is the escape valve. |
| R2 | `harness-self-check-via-reusable.yml` over-restricted → the reusable callee loses `contents: read` and every consumer using the reusable workflow breaks. | C121-3: read the callee's declared `permissions:` first and grant at the calling job. Covered by exit criterion 2. |
| R3 | CodeQL adds minutes to every PR and its first run may produce a wall of findings. | Weekly schedule + PR runs only on `javascript-typescript`; G121-1 settles the triage posture before enabling. |
| R4 | Erroring on top-level write scopes (C121-5) breaks `harness-drift.yml` (`contents: write`) and `workboard-auto-approve.yml` (`issues: write`). | Deliverable 2 annotates **both**, plus their `template/managed/**` mirrors, in the same PR so the gate turns on green; a test covers both the annotated (pass) and unannotated (fail) cases. |
| R5 | Consumer repos syncing updated managed workflows get new `permissions:` blocks and may see jobs fail if their repo default was relied upon. | Managed-file change → surfaces through the normal drift/adoption path; call it out in the CHANGELOG entry as an adoption note. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R3 | gpt-5.6-sol | claude-opus-5 | cs119-123-plan-review (omni-ah) | 5c275afa598e | 2026-07-25T01:56:50Z | Go | Go — least-privilege defaults, explicit write annotations, job-scoped CodeQL permissions, advisory auditing, tests, and CS119 sequencing are coherent. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per § Claim) | planned | — | — |

## Notes / Learnings

- Audit method: parsed each file in `.github/workflows/` for a top-level `permissions:` key and for `pull_request_target` usage; 4 of 11 lacked the block; 1 of 11 (`workboard-auto-approve.yml`) uses `pull_request_target` and is already hardened.

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
