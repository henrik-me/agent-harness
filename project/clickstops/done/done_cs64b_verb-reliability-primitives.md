# CS64b — Harness verb reliability primitives (post-CS64 hardening)

**Status:** done
**Owner:** omni-ah
**Branch:** cs64b/content
**Started:** 2026-06-22
**Closed:** 2026-06-24
**Filed by:** Follow-up to active **CS64** (2026-06-10 by `omni-ah-c2`) to absorb three open LRNs that surfaced reliability gaps in the harness lifecycle/verb surface and were tagged as "CS64 scope candidates" during the 2026-06-10 LRN disposition refresh (PR #288). Rather than expand CS64 mid-flight, the items are spun out here as the dedicated post-CS64 hardening CS, gating the downstream planned CS65–CS68 stream so the reliability primitives land before further work on top of the verb surface.
**Depends on:** **CS64** (hard) — all three deliverables harden or extend verbs that CS64 introduces (`startup`/`status`, the cross-clone temp-dir/clone patterns shared by the lifecycle verbs, and the `harness upgrade` flow). CS64 must close first.

## Goal

Apply three open LRNs that surfaced reliability gaps in the harness verb surface — git-ref crash recovery (LRN-151), temp-dir/clone hygiene + leading-dash ref rejection (LRN-157), and sync-time new-managed-file reconciliation (LRN-155) — as concrete, testable primitives that every later verb-touching CS (CS65–CS68) can build on. Lands as a focused hardening pass rather than scope creep on top of CS64.

## Background

Three open LRNs all point at active CS64 in their current Disposition (LEARNINGS.md, 2026-06-10 refresh) but the user has elected to spin them out as a dedicated successor CS instead of expanding CS64's scope mid-implementation:

- **LRN-151** (`git`, crash-recovery): a crash mid-`fetch` leaves loose ref files like `.git/refs/remotes/origin/<branch>` populated with whitespace/NUL bytes; subsequent `git fetch` aborts with `fatal: bad object refs/remotes/...` for every ref. Repair is mechanical (delete the loose ref file + matching `packed-refs` line, re-`fetch`). No `harness doctor`-style probe exists today; the workaround lives only in the LRN.
- **LRN-157** (security / hygiene): verbs that allocate temp dirs or clones must apply the `{path, cleanup}` disposer pattern (paired allocation + idempotent removal) and reject leading-dash refs at the boundary (so a hostile-looking branch like `--foo` cannot be passed unquoted into `git` and be parsed as a flag). CS64 introduces multiple verbs that may allocate temp dirs (`startup`, `status`, and `dispatch`-adjacent flows), but the pattern is not yet a CONVENTIONS/REVIEWS rule.
- **LRN-155** (`pr_check` / managed-file lifecycle): when the harness adds a new file under `template/managed/`, existing consumers' `harness sync` runs do not surface the new file as an adoption opportunity; the orchestrator must notice manually. A sync-time new-managed-file reconciliation (or guided proposal) would close the gap.

None of these are blockers for CS64 to ship as scoped, but each is a primitive the downstream CSs (CS65 doc thinning, CS66 review-family verbs, CS67 release verb, CS68 dependency-bump adoption) will lean on — so they need to land before those CSs are claimed.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C64b-1 | `harness doctor` probe | Add a read-only `harness doctor` subcommand (backed by `lib/doctor.mjs`) that detects the LRN-151 broken-loose-ref state by walking `.git/refs/remotes/origin/` for zero-byte / whitespace-only / NUL-only ref files and printing the exact repair recipe (`rm .git/refs/remotes/<…>` + `packed-refs` line removal + `git fetch origin --prune`). Default **report-only** (exit 0 advisory); `--repair` is an explicit opt-in flag that applies the deletion + `fetch origin --prune` immediately (non-interactive). Idempotent. | A read-only probe is safe to run anytime (including from `harness startup`); `--repair` keeps the destructive step behind an explicit flag. Detection is **origin-scoped** because repair re-fetches origin only — deleting a broken ref under another remote would orphan it (deleted, never recreated), so a non-origin broken ref is left for manual recovery. Encodes the LRN-151 recipe so an agent does not have to rediscover it after a crash. |
| C64b-2 | Temp-dir / clone disposer pattern | Audit every `lib/*.mjs` verb that allocates a temp dir or clone and apply the `{path, cleanup}` disposer pattern from LRN-157 (paired allocation + idempotent `cleanup()` registered before any use), plus a shared `assertSafeRef(ref)` helper that rejects refs matching `^-` (or `--`) before they are passed to `git`. Land as a small new `lib/disposers.mjs` + unit tests. Add a CONVENTIONS bullet stating the pattern is required for any new verb. | Encodes the LRN-157 finding as a reusable helper rather than three copies; making it a CONVENTIONS rule means CS66/CS67's later verbs adopt it by default. Leading-dash ref rejection is a tiny but real argv-injection mitigation for verbs that take `--ref`/`--branch`. |
| C64b-3 | Sync-time new-managed-file reconciliation | Extend `harness sync --mode=check` (and the default sync path) to surface every consumer-deliverable file in the harness's `template/managed/` manifest (excluding sentinels such as `.gitkeep`) that is **absent from the consumer's `managed.files`** — membership, not mere disk presence, since an untracked-on-disk file is still skipped by sync — alongside the existing drift detection. Default: report-only (a "new managed files" section in the sync report). `--apply-new` adopts them (adds the `managed.files` entry + copies the file) non-interactively in apply mode (adopt-all; see the G-apply-new resolution). Update the `pr_check` schema/doc note (LRN-155 evidence; `schemas/harness.config.schema.json`) to reference the new flow. | Closes the LRN-155 gap symmetrically with the existing drift checks: today sync notices *changed* managed files but not *new* ones; the asymmetry is exactly the failure mode. Report-only default keeps consumers from getting unexpected file additions on a `sync`. |
| C64b-4 | Logic in `lib/`, thin `bin/` | All mechanics in `lib/doctor.mjs` + `lib/disposers.mjs` + `lib/sync.mjs` edits, with **injectable fs/git seams** so tests run without real git/network. `bin/harness.mjs` only parses flags + delegates. Tests write only under `os.tmpdir()`, never REPO_ROOT (per the test-hygiene memory / LRN-094). | Matches the C64-10 pattern; keeps the surface unit-testable and consistent with the rest of the verb library. |
| C64b-5 | SemVer | One new CLI subcommand (`doctor`) + new behaviour on `sync` ⇒ **minor** bump per `OPERATIONS.md § SemVer policy`. | New consumer-visible CLI surface + new sync behaviour. |
| C64b-6 | Apply-LRN gate | LRN-151, LRN-155, and LRN-157 all flip `open → applied` at close-out, with the merge SHA recorded in each Disposition prose. CS65/CS66/CS67/CS68 update their `**Depends on:**` line (preamble — outside the plan-review hash surface, per `lib/plan-review-hash.mjs:41-77`) to add CS64b as a hard dependency; no plan-review re-attestation required. | The LRN flips are the primary close-out signal; the downstream-CS dep line is updated as part of *this* CS's filing PR (current PR), not at close-out, so the dependency information is visible to whoever claims CS65–CS68 next. |

## Deliverables

1. `lib/doctor.mjs` + `tests/lib-doctor.test.mjs` — read-only broken-loose-ref probe per LRN-151; `--repair` applies the deletion + `fetch`. (C64b-1, C64b-4)
2. `lib/disposers.mjs` (new) + `tests/lib-disposers.test.mjs` — `{path, cleanup}` temp-dir/clone disposer + `assertSafeRef(ref)` leading-dash rejection helper. (C64b-2, C64b-4)
3. Audit + edits to all existing `lib/*.mjs` verbs allocating temp dirs/clones to use the disposer pattern + `assertSafeRef` (deliverable scope confirmed at claim time; expected: `lib/cross-repo.mjs`, `lib/review.mjs`, any CS64 verbs once that PR lands). (C64b-2)
4. `lib/sync.mjs` (edit) + `bin/harness.mjs` (edit, `sync`) + `schemas/harness.config.schema.json` (edit, `pr_check` adoption note) + `tests/lib-sync.test.mjs` — new-managed-file detection (absence from `managed.files`; manifest excludes sentinels like `.gitkeep`) in `--mode=check` and default sync path; `--apply-new` flag; report-only default; regression test that `.gitkeep` is never offered. (C64b-3, C64b-4)
5. `bin/harness.mjs` (edit) — register `doctor` in `COMMAND_REGISTRY` + `TOP_HELP` + `SUBCOMMAND_HELP`; thin delegation only. (C64b-1)
6. CONVENTIONS / REVIEWS update — a bullet (location TBD at claim time; likely `OPERATIONS.md` reviewer checklist) requiring new verbs that allocate temp dirs/clones to use the disposer + `assertSafeRef` pattern. (C64b-2)
7. `LEARNINGS.md` (edit) — flip **LRN-151**, **LRN-155**, **LRN-157** to `applied` at close-out with merge-SHA in each Disposition prose. (C64b-6)
8. `CHANGELOG.md` (edit) — `[Unreleased]` entries for `harness doctor` + the `harness sync` new-managed-file behaviour.

## User-approval gates

- **G-doctor-repair** — **resolved: non-interactive.** `--repair` is itself the explicit opt-in (default is read-only advisory), so it applies the deletion + `fetch origin --prune` immediately with no interactive prompt and no `--yes` flag — consistent with autonomous/CI execution.
- **G-apply-new** — **resolved: adopt-all (non-interactive).** `harness sync --apply-new` adopts every detected new managed file in apply mode without prompting (per-file interactive confirmation would hang in CI / autonomous contexts). Per-file confirmation remains a possible follow-up.

## Exit criteria

1. `harness doctor` detects + (with `--repair`) recovers the LRN-151 broken-loose-ref state in a synthetic test fixture (C64b-1).
2. Every `lib/*.mjs` verb allocating a temp dir or clone uses the disposer pattern and `assertSafeRef` for any ref arg; a new lint or test enforces this (C64b-2).
3. `harness sync --mode=check` reports new managed files absent from a consumer fixture; `--apply-new` adopts them non-interactively (adopt-all) in apply mode (C64b-3).
4. `harness lint --quiet` passes; `node --test tests/*.test.mjs` green; `sync --mode=check` no drift on self-host.
5. LRN-151, LRN-155, LRN-157 flipped to `applied` with merge SHA in each Disposition.
6. CHANGELOG `[Unreleased]` entries present.
7. Plan-vs-implementation review (GPT-5.5 gate) returns GO.

## Risks + open questions

| # | Risk / what breaks | Mitigation |
|---|---|---|
| R1 | `harness doctor --repair` deletes a ref the user wanted (false positive on a legitimate zero-byte ref). | Default report-only; `--repair` is an explicit opt-in flag (non-interactive — G-doctor-repair); the heuristic is precise (only zero-byte / whitespace-only / NUL-only ref files under `refs/remotes/origin/` match — healthy 40-hex / symref refs never do). |
| R2 | Disposer-pattern audit touches every verb in `lib/` and creates a sprawling diff. | Scope the audit to verbs that *actually* allocate temp dirs/clones (likely 2–3 today + CS64's new verbs); land the helper first, then per-verb adoption commits. |
| R3 | `harness sync --apply-new` adopts a file a consumer deliberately omitted. | Report-only default; `--apply-new` only adopts in apply mode (never check/dry-run), is opt-in, and skips `config.excluded` targets, so adoption is never a silent surprise; per-file confirmation is a possible follow-up (G-apply-new). |
| R4 | CS64 ships verbs that themselves should have used the disposer pattern — needs retrofit. | C64b-2 explicitly includes "any CS64 verbs once that PR lands" in the audit scope; retrofit lands as part of *this* CS, not a separate follow-up. |
| Q1 | Should `harness startup` auto-invoke `harness doctor` (advisory)? | Default: no (doctor is a separate explicit verb); revisit at claim time if `startup`'s authors prefer integration. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.7-1m-internal | rubber-duck (orchestrator: omni-ah-c2) | 0c8a81611231 | 2026-06-10T14:43:26Z | Go-with-amendments | F1/F3/F4/F6 pass; amend absent `lib/git-util.mjs` alt (F2) and reconcile CS68's stale LRN-157 ownership (F5 deferred — CS68 plan re-attestation OOS). |
| R2 | gpt-5.5 | claude-opus-4.7-1m-internal | rubber-duck (orchestrator: omni-ah-c2) | a8cd5bd7af63 | 2026-06-10T14:46:01Z | Needs-Fix | F2 still present in C64b-4 (`or extension of lib/git-util.mjs`); hash + numbering OK; F5 deferral acceptable. |
| R3 | gpt-5.5 | claude-opus-4.7-1m-internal | rubber-duck (orchestrator: omni-ah-c2) | 4ab5755f0df1 | 2026-06-10T14:47:06Z | Go | Hash verified; `git-util` absent; deliverables 1-8 contiguous; independence holds. |
| R4 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: omni-ah) | 245219717720 | 2026-06-23T05:18:24Z | Go | Re-attest after split: C64b-3 + Deliverable 4 corrected to membership wording (absent from `managed.files`, not disk presence) to match the implementation; hash verified; independence holds. |
| R5 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: omni-ah) | aa0314e427e4 | 2026-06-23T15:12:20Z | Go | Re-attest after resolving G-apply-new to adopt-all: C64b-3 + gate + Exit-3 + R3 + Notes now consistently describe non-interactive adopt-all (apply-mode-only, skips `config.excluded`); hash verified. |
| R6 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: omni-ah) | e0f2ad1d3f39 | 2026-06-24T04:59:39Z | Go | Re-attest after C64b-1 doctor wording update: origin-only scan, dropped `for-each-ref`, non-interactive `--repair`; hash verified; deliverables remain consistent. |

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8, claude-opus-4.6, claude-opus-4.5 |
| Reviewer model | gpt-5.5 |
| Implementer agent | omni-ah |
| Reviewer agent | rubber-duck (orchestrator: omni-ah) |
| Notes | Sub-agent ledger (materially-used models): orchestrator omni-ah `claude-opus-4.8` (doctor/sync-flag bin wiring, upgrade.mjs disposer retrofit, docs, CHANGELOG); cs64b-doctor `claude-opus-4.6` (`lib/doctor.mjs` + tests); cs64b-disposers + cs64b-sync `claude-opus-4.5` (`lib/disposers.mjs`, `lib/sync.mjs` C64b-3 + tests + schema note). Model independence per REVIEWS § 2.3 — reviewer `gpt-5.5` ≠ every implementer model. CS64b is NOT on `reviews.high_risk_clickstops`; fallback `claude-sonnet-4.6` permitted if `gpt-5.5` is unavailable. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1 — `harness doctor` probe: `lib/doctor.mjs` + `tests/lib-doctor.test.mjs` (read-only broken-loose-ref detect per LRN-151; `--repair` applies delete + fetch) + register `doctor` in `bin/harness.mjs` | pending | omni-ah | C64b-1, C64b-4; Deliverables 1, 5. Injectable fs/git seams; tests under `os.tmpdir()` only (LRN-094). |
| T2 — Disposer pattern: `lib/disposers.mjs` + `tests/lib-disposers.test.mjs` (`{path, cleanup}` + `assertSafeRef` leading-dash rejection) | pending | omni-ah | C64b-2, C64b-4; Deliverable 2. Land helper first, then retrofit (T3). |
| T3 — Audit + retrofit existing temp-dir/clone verbs to disposer + `assertSafeRef`; add CONVENTIONS/REVIEWS bullet | pending | omni-ah | C64b-2; Deliverables 3, 6. Scope confirmed at impl time (expected `lib/cross-repo.mjs`, `lib/review.mjs`, CS64 verbs). |
| T4 — Sync new-managed-file reconciliation: `lib/sync.mjs` + `bin/harness.mjs` (`sync --apply-new`) + `schemas/harness.config.schema.json` note + `tests/lib-sync.test.mjs`; report-only default; `.gitkeep` excluded | pending | omni-ah | C64b-3, C64b-4; Deliverable 4. Membership (`managed.files`) not disk presence. |
| T5 — CHANGELOG `[Unreleased]` entries: `harness doctor`, sync new-managed-file behaviour | pending | omni-ah | Deliverable 8; LRN-101 distributed-surface CHANGELOG-touch convention. |
| T6 — Local rubber-duck plan-vs-implementation review (GPT-5.5) before PR | pending | omni-ah | Independence invariant: reviewer model ≠ implementer model. |
| T7 — Open content PR (`cs64b/content`); PR-level rubber-duck + `harness copilot-engage`; resolve threads; squash-merge | pending | omni-ah | Per OPERATIONS.md § Three-PR shape (content PR). |
| T8 — Flip `LEARNINGS.md` LRN-151 / LRN-155 / LRN-157 → `applied` with merge SHA | pending | omni-ah | C64b-6; Deliverable 7. At close-out with merge SHA. |
| T9 — Close-out docs/restart-state: rename `active_cs64b_*.md` → `done_cs64b_*.md`; update WORKBOARD + CONTEXT handoff; file new LEARNINGS | pending | omni-ah | Close-out PR (`cs64b/close-out`). |
| T10 — Close-out learnings sweep: scan execution for follow-ups; file as new LRN entries or follow-up planned CSs | pending | omni-ah | Per RETROSPECTIVES.md. |

## Notes / Learnings

**G-apply-new resolved to "adopt-all" (non-interactive).** The G-apply-new
user-approval gate is resolved to **adopt-all without prompting**: CS64b was
executed autonomously with no user available to confirm, and interactive
per-file prompts would hang in CI / non-interactive contexts. `--apply-new` only
adopts in `--mode=apply` (detection-only in check/dry-run) and skips
`config.excluded` targets, so it is never a silent surprise. Per-file
confirmation remains a possible follow-up. The plan text (C64b-3, the G-apply-new
gate, Exit criterion 3, Risk R3) was updated to reflect this resolution and
re-attested (see the Plan review R5 row).

**G-doctor-repair resolved + `doctor` detection narrowed (CS64b review fixes).**
The shipped `harness doctor` scans `.git/refs/remotes/origin/` only (not all
remotes): repair re-fetches origin, so detecting/deleting a broken ref under
another remote would orphan it — LRN-151 is origin-scoped. The planned
`git for-each-ref ... ignoring broken ref` cross-check was dropped — the direct
file-content heuristic (zero-byte / whitespace-only / NUL-only) is sufficient and
injectable. `--repair` is an explicit opt-in flag that acts immediately (no
interactive prompt; G-doctor-repair resolved non-interactive). The plan text
(C64b-1, the G-doctor-repair gate) was updated to match the shipped behaviour and
re-attested (see the Plan review R6 row).

**Review trail.** gpt-5.5 rubber-duck R1 (pre-PR) = Go with 4 non-blocking findings;
all addressed in the fix commit. R2 verified the fixes (findings 2/4 fully resolved;
1/3 logic correct, doc-wording nits + this G-apply-new plan-vs-impl note remained) →
addressed here. Implementer models: claude-opus-4.8 (orchestrator) + claude-opus-4.6
(doctor) + claude-opus-4.5 (disposers, sync); reviewer gpt-5.5 (independent).

## Plan-vs-implementation review

**Reviewer:** gpt-5.5 (rubber-duck, orchestrator: omni-ah)
**Date:** 2026-06-24
**Outcome:** GO

Reviewed at merge commit `f27c214` (PR #310). The initial PVI returned NEEDS-FIX on a D1 plan-vs-impl gap — the plan described all-`refs/remotes/` walking, a `git for-each-ref ... ignoring broken ref` cross-check, and `--repair` with interactive confirmation, none of which the shipped `lib/doctor.mjs` does. The plan (C64b-1, the G-doctor-repair gate, Risk R1, Notes) was updated to the shipped behaviour — origin-scoped detection, file-content heuristic only, non-interactive explicit `--repair` — and re-attested (Plan review **R6**, hash `e0f2ad1d3f39`). Re-review confirms D1 now matches; D2–D8 unchanged from the first pass.

- **D1** (`harness doctor`) — PASS: `lib/doctor.mjs` walks `.git/refs/remotes/origin/` for zero-byte / whitespace-only / NUL-only refs (no `for-each-ref`); `--repair` is an explicit non-interactive flag that deletes the broken loose refs, strips matching `packed-refs` lines, and runs `git fetch origin --prune`.
- **D2** (`lib/disposers.mjs` — `makeTempDir`/`withTempDir`/`assertSafeRef`) — PASS.
- **D3** (disposer retrofit of `lib/upgrade.mjs` + `cs64b-disposer-pattern` guard test) — PASS.
- **D4** (`lib/sync.mjs` new-managed reconciliation — membership, `.gitkeep` excluded, report-only default, `--apply-new` adopt-all, respects `config.excluded`) — PASS.
- **D5** (`doctor` registered in COMMAND_REGISTRY / TOP_HELP / SUBCOMMAND_HELP) — PASS.
- **D6** (disposer reviewer convention in `OPERATIONS.md` + composed mirror) — PASS.
- **D7** (LRN-151 / LRN-155 / LRN-157 → `applied` with merge SHA) — done in this close-out.
- **D8** (`CHANGELOG.md` `[Unreleased]` — doctor + sync new-managed + disposers) — PASS.

Exit criteria EC1–EC4 + EC6 verified (targeted CS64b tests, full `node --test`, `harness lint --quiet` 30/0/3, self `sync --mode=check` no drift). The consumer governance-doc strand was split out to CS72 (filed + merged as PR #313), so this CS contains no C64b-7/8 content.
