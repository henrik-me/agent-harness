# CS64b — Harness verb reliability + consumer-delivery primitives (post-CS64 hardening)

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** Follow-up to active **CS64** (2026-06-10 by `omni-ah-c2`) to absorb three open LRNs that surfaced reliability gaps in the harness lifecycle/verb surface and were tagged as "CS64 scope candidates" during the 2026-06-10 LRN disposition refresh (PR #288). Rather than expand CS64 mid-flight, the items are spun out here as the dedicated post-CS64 hardening CS, gating the downstream planned CS65–CS68 stream so the reliability primitives land before further work on top of the verb surface.
**Depends on:** **CS64** (hard) — the doctor / disposer / sync-reconciliation strands harden or extend verbs and flows that CS64 introduces (`startup`/`status`, the cross-clone temp-dir/clone patterns shared by the lifecycle verbs, and the `harness upgrade` preview — which runs a dry-run sync and so surfaces the same C64b-3 new-managed-file reconciliation), so CS64 must close first. The governance-doc strand is **CS64-independent**: C64b-7 (seed/init delivery) can split into an earlier wave alone, but C64b-8 couples to C64b-3 (it reuses `--apply-new` and edits the same `lib/sync.mjs` surface), so C64b-8 should carry `--apply-new` with it or land after C64b-3.

## Goal

Apply three open LRNs that surfaced reliability gaps in the harness verb surface — git-ref crash recovery (LRN-151), temp-dir/clone hygiene + leading-dash ref rejection (LRN-157), and sync-time new-managed-file reconciliation (LRN-155) — **and close a consumer-delivery miss surfaced 2026-06-15: the harness's core governance/onboarding docs (`INSTRUCTIONS.md`, `.github/copilot-instructions.md`, `TRACKING.md`, `RETROSPECTIVES.md`, `READMEGUIDE.md`) were never seeded or installed by `init`, so no consumer ever received them (`sub-invaders` has none)** — as concrete, testable primitives that every later verb-touching CS (CS65–CS68) can build on. Lands as a focused hardening pass rather than scope creep on top of CS64.

## Background

Three open LRNs all point at active CS64 in their current Disposition (LEARNINGS.md, 2026-06-10 refresh) but the user has elected to spin them out as a dedicated successor CS instead of expanding CS64's scope mid-implementation:

- **LRN-151** (`git`, crash-recovery): a crash mid-`fetch` leaves loose ref files like `.git/refs/remotes/origin/<branch>` populated with whitespace/NUL bytes; subsequent `git fetch` aborts with `fatal: bad object refs/remotes/...` for every ref. Repair is mechanical (delete the loose ref file + matching `packed-refs` line, re-`fetch`). No `harness doctor`-style probe exists today; the workaround lives only in the LRN.
- **LRN-157** (security / hygiene): verbs that allocate temp dirs or clones must apply the `{path, cleanup}` disposer pattern (paired allocation + idempotent removal) and reject leading-dash refs at the boundary (so a hostile-looking branch like `--foo` cannot be passed unquoted into `git` and be parsed as a flag). CS64 introduces multiple verbs that may allocate temp dirs (`startup`, `status`, and `dispatch`-adjacent flows), but the pattern is not yet a CONVENTIONS/REVIEWS rule.
- **LRN-155** (`pr_check` / managed-file lifecycle): when the harness adds a new file under `template/managed/`, existing consumers' `harness sync` runs do not surface the new file as an adoption opportunity; the orchestrator must notice manually. A sync-time new-managed-file reconciliation (or guided proposal) would close the gap.

None of these are blockers for CS64 to ship as scoped, but each is a primitive the downstream CSs (CS65 doc thinning, CS66 review-family verbs, CS67 release verb, CS68 dependency-bump adoption) will lean on — so they need to land before those CSs are claimed.

**Consumer-delivery miss (governance docs), surfaced 2026-06-15 by `omni-ah`.** Separately from the three LRNs above, verification of `sub-invaders` showed it has neither `INSTRUCTIONS.md` nor `.github/copilot-instructions.md` (nor `TRACKING.md` / `RETROSPECTIVES.md` / `READMEGUIDE.md`). Root cause: `template/seeded/harness.config.json` declares **no `managed` block** and `bin/harness.mjs` `init` appends only workflow YAMLs to `managed.files`, so these governance docs are delivered to **no** consumer — not via fresh `init` (never declared) nor via `sync` (`lib/sync.mjs:755` builds its work list solely from the consumer's `managed.files`). `.github/copilot-instructions.md` is the file GitHub auto-loads as repo custom instructions, so a Copilot agent in such a consumer gets **none** of the harness hard rules. This is the same root family as LRN-155 but a distinct, more severe instance (the files were never in the seed/init path at all), so C64b-7 / C64b-8 add the seed/init delivery + a required-doc sync gate on top of C64b-3's general reconciliation.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C64b-1 | `harness doctor` probe | Add a read-only `harness doctor` subcommand (backed by `lib/doctor.mjs`) that detects the LRN-151 broken-loose-ref state by walking `.git/refs/remotes/` for zero-byte / whitespace-only / NUL-only files, cross-checking with `git for-each-ref ... 2>&1 \| grep "ignoring broken ref"`, and printing the exact repair recipe (`rm .git/refs/remotes/<…>` + `packed-refs` line removal + `git fetch origin --prune`). Default **report-only**; `--repair` applies the deletion + `fetch` with explicit confirmation. Idempotent. | A read-only probe is safe to run anytime (including from `harness startup`); `--repair` keeps the destructive step explicit. Encodes the LRN-151 recipe so an agent does not have to rediscover it after a crash. |
| C64b-2 | Temp-dir / clone disposer pattern | Audit every `lib/*.mjs` verb that allocates a temp dir or clone and apply the `{path, cleanup}` disposer pattern from LRN-157 (paired allocation + idempotent `cleanup()` registered before any use), plus a shared `assertSafeRef(ref)` helper that rejects refs matching `^-` (or `--`) before they are passed to `git`. Land as a small new `lib/disposers.mjs` + unit tests. Add a CONVENTIONS bullet stating the pattern is required for any new verb. | Encodes the LRN-157 finding as a reusable helper rather than three copies; making it a CONVENTIONS rule means CS66/CS67's later verbs adopt it by default. Leading-dash ref rejection is a tiny but real argv-injection mitigation for verbs that take `--ref`/`--branch`. |
| C64b-3 | Sync-time new-managed-file reconciliation | Extend `harness sync --mode=check` (and the default sync path) to surface every consumer-deliverable file in the harness's `template/managed/` manifest (excluding sentinels such as `.gitkeep`) that is **absent from the consumer's `managed.files`** — membership, not mere disk presence, since an untracked-on-disk file is still skipped by sync — alongside the existing drift detection. Default: report-only (a "new managed files" section in the sync report). `--apply-new` adopts them (adds the `managed.files` entry + copies the file, resolving any present-but-untracked local conflict) after explicit confirmation. Update the `pr_check` schema/doc note (LRN-155 evidence; `schemas/harness.config.schema.json`) to reference the new flow. Files in the **core managed-doc set** (C64b-7) are surfaced with the stronger WARN of C64b-8 rather than this optional report-only line. | Closes the LRN-155 gap symmetrically with the existing drift checks: today sync notices *changed* managed files but not *new* ones; the asymmetry is exactly the failure mode. Report-only default keeps consumers from getting unexpected file additions on a `sync`. |
| C64b-4 | Logic in `lib/`, thin `bin/` | All mechanics in `lib/doctor.mjs` + `lib/disposers.mjs` + `lib/sync.mjs` edits, with **injectable fs/git seams** so tests run without real git/network. `bin/harness.mjs` only parses flags + delegates. Tests write only under `os.tmpdir()`, never REPO_ROOT (per the test-hygiene memory / LRN-094). | Matches the C64-10 pattern; keeps the surface unit-testable and consistent with the rest of the verb library. |
| C64b-5 | SemVer | One new CLI subcommand (`doctor`) + new sync behaviour + fresh-init core managed-doc installs (C64b-7) + a warn-level core-doc sync gate (C64b-8) ⇒ **minor** bump per `OPERATIONS.md § SemVer policy`; all additive. The C64b-8 escalation of the core-doc gate from WARN to ERROR is deferred to a future bump as a deliberate consumer-compatibility choice; the `review_gates` v0.4→v0.5 migration is the *warn-before-error* precedent (it does not itself imply a major). | New consumer-visible CLI surface + additive sync/init behaviour; warn-only core-doc gate means no existing green consumer breaks on this minor. |
| C64b-6 | Apply-LRN gate | LRN-151, LRN-155, and LRN-157 all flip `open → applied` at close-out, with the merge SHA recorded in each Disposition prose, **plus file a new `applied` LRN for the governance-doc seed/init propagation miss (category `architectural`, claim_area `sync-engine`)** with the merge SHA. CS65/CS66/CS67/CS68 update their `**Depends on:**` line (preamble — outside the plan-review hash surface, per `lib/plan-review-hash.mjs:41-77`) to add CS64b as a hard dependency; no plan-review re-attestation required. | The LRN flips are the primary close-out signal; the downstream-CS dep line is updated as part of *this* CS's filing PR (current PR), not at close-out, so the dependency information is visible to whoever claims CS65–CS68 next. |
| C64b-7 | Core (required) managed-doc set + seed/init delivery | Define the **core managed-doc set** — the governance/onboarding files every consumer MUST receive: `INSTRUCTIONS.md`, `.github/copilot-instructions.md`, `TRACKING.md`, `RETROSPECTIVES.md`, `READMEGUIDE.md` (the pure-doc managed files; managed *workflows* + `.github/CODEOWNERS` keep their existing per-feature install + C64b-3 optional adoption). Record the set once in a new `lib/core-managed-files.mjs` constant consumed by init, the C64b-8 gate, and tests. Add it to (a) `template/seeded/harness.config.json` `managed.files` (today there is **no** `managed` block) and (b) `bin/harness.mjs` fresh-init, which copies each template into the consumer tree and `addUnique`s it to `managed.files`, mirroring the existing `workboard-auto-approve.yml` / `harness-pr-check.yml` installs. Also add the one missing `templating` variable the core docs reference — **`repo_slug`** (the other four — `project_name`/`agent_suffix`/`agent_suffix_upper`/`repo_short` — are already present) — to `template/seeded/harness.config.json` so the docs render with no unresolved `{{…}}`; verify under strict templating. | Root cause of the propagation miss: the seed declares no managed block and init appends only workflow YAMLs, so these governance docs reached **no** consumer (`sub-invaders` has none). A single shared constant prevents the list drifting across init/sync/tests (LRN-039 field-guessing class). |
| C64b-8 | Required-managed-file sync gate (warn → error) | `harness sync --mode=check` (and the default sync path) emits a **WARN** for every core managed-doc-set file (C64b-7) **missing from the consumer's `managed.files`** (membership check, not mere disk presence), distinct from C64b-3's optional report-only "new managed files" section. **Warn-only in this minor**; escalation to a hard **ERROR** is deferred to a future bump (a deliberate consumer-compatibility choice) and documented in `OPERATIONS.md § Sync` (mirrors the `review_gates` v0.4 warn → v0.5 error migration). `--apply-new` (C64b-3) is the adoption path; **`--quiet` is added as a net-new `sync` flag** that suppresses the warn (it does not exist on `sync` today — `node bin/harness.mjs sync --quiet` currently errors — so this also makes the pre-existing OPERATIONS.md § Sync `--quiet` claim accurate). | Governance docs are mandatory, not opt-in — but an immediate hard error would break existing green consumers' CI (e.g. `sub-invaders`) on upgrade. Warn-first gives a migration window without leaving the gap silent. |

## Deliverables

1. `lib/doctor.mjs` + `tests/lib-doctor.test.mjs` — read-only broken-loose-ref probe per LRN-151; `--repair` applies the deletion + `fetch`. (C64b-1, C64b-4)
2. `lib/disposers.mjs` (new) + `tests/lib-disposers.test.mjs` — `{path, cleanup}` temp-dir/clone disposer + `assertSafeRef(ref)` leading-dash rejection helper. (C64b-2, C64b-4)
3. Audit + edits to all existing `lib/*.mjs` verbs allocating temp dirs/clones to use the disposer pattern + `assertSafeRef` (deliverable scope confirmed at claim time; expected: `lib/cross-repo.mjs`, `lib/review.mjs`, any CS64 verbs once that PR lands). (C64b-2)
4. `lib/sync.mjs` (edit) + `bin/harness.mjs` (edit, `sync`) + `schemas/harness.config.schema.json` (edit, `pr_check` adoption note) + `tests/lib-sync.test.mjs` — new-managed-file detection (absence from `managed.files`; manifest excludes sentinels like `.gitkeep`) in `--mode=check` and default sync path; `--apply-new` flag; report-only default; regression test that `.gitkeep` is never offered. (C64b-3, C64b-4)
5. `bin/harness.mjs` (edit) — register `doctor` in `COMMAND_REGISTRY` + `TOP_HELP` + `SUBCOMMAND_HELP`; thin delegation only. (C64b-1)
6. CONVENTIONS / REVIEWS update — a bullet (location TBD at claim time; likely `OPERATIONS.md` reviewer checklist) requiring new verbs that allocate temp dirs/clones to use the disposer + `assertSafeRef` pattern. (C64b-2)
7. `LEARNINGS.md` (edit) — flip **LRN-151**, **LRN-155**, **LRN-157** to `applied` at close-out with merge-SHA in each Disposition prose, **plus file a new `applied` LRN for the governance-doc seed/init propagation miss**. (C64b-6)
8. `CHANGELOG.md` (edit) — `[Unreleased]` entries for `harness doctor` + the `harness sync` new-managed-file behaviour, the fresh-init core managed-doc installs, and the core-doc sync warn gate.
9. `lib/core-managed-files.mjs` (new) + `tests/lib-core-managed-files.test.mjs` — single source of truth for the core managed-doc set (`INSTRUCTIONS.md`, `.github/copilot-instructions.md`, `TRACKING.md`, `RETROSPECTIVES.md`, `READMEGUIDE.md`). (C64b-7)
10. `template/seeded/harness.config.json` (edit) + seeded-config test update — add a `managed.files` block containing the core managed-doc set **and add the missing `templating.repo_slug`**; keep the `init → sync --mode=check` integration path green (LRN-057) and assert the rendered core docs contain no unresolved `{{…}}` placeholder (strict templating). (C64b-7)
11. `bin/harness.mjs` (edit, `init`) + tests — fresh init copies each core managed doc into the consumer tree and `addUnique`s it to `managed.files`. (C64b-7)
12. `lib/sync.mjs` (edit) + `bin/harness.mjs` (edit, `sync`: add net-new `--quiet` flag + help) + `tests/lib-sync.test.mjs` — core-managed-file WARN keyed on absence from `managed.files` in `--mode=check`/default sync, separate from the C64b-3 report-only section; the net-new `--quiet` suppresses it; document the WARN→ERROR escalation **and correct the `--quiet` claim** in `OPERATIONS.md § Sync`. (C64b-8)

## User-approval gates

- **G-doctor-repair** — confirm whether `harness doctor --repair` should require interactive confirmation or accept `--yes` (default: interactive).
- **G-apply-new** — confirm whether `harness sync --apply-new` should require per-file confirmation or take all (default: per-file).

## Exit criteria

1. `harness doctor` detects + (with `--repair`) recovers the LRN-151 broken-loose-ref state in a synthetic test fixture (C64b-1).
2. Every `lib/*.mjs` verb allocating a temp dir or clone uses the disposer pattern and `assertSafeRef` for any ref arg; a new lint or test enforces this (C64b-2).
3. `harness sync --mode=check` reports new managed files absent from a consumer fixture; `--apply-new` adopts them with confirmation; the `pr_check` schema adoption note reflects the new flow (C64b-3).
4. Fresh `harness init` into an empty repo produces a `managed.files` containing the core managed-doc set and copies each file; `harness --cwd <consumer> sync --mode=check` then exits 0 with no drift, and the rendered core docs contain no unresolved `{{…}}` placeholder (LRN-057 init→sync-check integration path) (C64b-7).
5. `harness sync --mode=check` emits a WARN when a core managed doc is missing from a consumer fixture's `managed.files`; the net-new `--quiet` flag suppresses it (C64b-8).
6. `harness lint --quiet` passes; `node --test tests/*.test.mjs` green; `sync --mode=check` no drift on self-host.
7. LRN-151, LRN-155, LRN-157 flipped to `applied` with merge SHA in each Disposition; the new governance-doc-propagation LRN filed `applied`.
8. CHANGELOG `[Unreleased]` entries present.
9. Plan-vs-implementation review (GPT-5.5 gate) returns GO.

## Risks + open questions

| # | Risk / what breaks | Mitigation |
|---|---|---|
| R1 | `harness doctor --repair` deletes a ref the user wanted (false positive on a legitimate zero-byte ref). | Default report-only; `--repair` is explicit + interactive (G-doctor-repair); the heuristic is precise (zero-byte / whitespace-only / NUL-only + `git for-each-ref` flags it as `ignoring broken ref`). |
| R2 | Disposer-pattern audit touches every verb in `lib/` and creates a sprawling diff. | Scope the audit to verbs that *actually* allocate temp dirs/clones (likely 2–3 today + CS64's new verbs); land the helper first, then per-verb adoption commits. |
| R3 | `harness sync --apply-new` adopts a file a consumer deliberately omitted. | Report-only default; `--apply-new` is per-file confirmation (G-apply-new). |
| R4 | CS64 ships verbs that themselves should have used the disposer pattern — needs retrofit. | C64b-2 explicitly includes "any CS64 verbs once that PR lands" in the audit scope; retrofit lands as part of *this* CS, not a separate follow-up. |
| R5 | Seeded core docs fail to render via `init` (unresolved `{{templating}}` placeholders in `INSTRUCTIONS.md` / `copilot-instructions.md`), breaking the LRN-057 init→sync-check path. | Exit criterion 4 runs the integration path; the same templates are already rendered by the harness's own dogfooded `managed.files`, so the placeholders are exercised. |
| R6 | Marking governance docs "required" surprises a consumer who intentionally omitted one (CI noise on upgrade). | Warn-only this minor (C64b-8); hard error deferred to the next major with documented migration; `--apply-new` is per-file adoption. |
| Q1 | Should `harness startup` auto-invoke `harness doctor` (advisory)? | Default: no (doctor is a separate explicit verb); revisit at claim time if `startup`'s authors prefer integration. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.7-1m-internal | rubber-duck (orchestrator: omni-ah-c2) | 0c8a81611231 | 2026-06-10T14:43:26Z | Go-with-amendments | F1/F3/F4/F6 pass; amend absent `lib/git-util.mjs` alt (F2) and reconcile CS68's stale LRN-157 ownership (F5 deferred — CS68 plan re-attestation OOS). |
| R2 | gpt-5.5 | claude-opus-4.7-1m-internal | rubber-duck (orchestrator: omni-ah-c2) | a8cd5bd7af63 | 2026-06-10T14:46:01Z | Needs-Fix | F2 still present in C64b-4 (`or extension of lib/git-util.mjs`); hash + numbering OK; F5 deferral acceptable. |
| R3 | gpt-5.5 | claude-opus-4.7-1m-internal | rubber-duck (orchestrator: omni-ah-c2) | 4ab5755f0df1 | 2026-06-10T14:47:06Z | Go | Hash verified; `git-util` absent; deliverables 1-8 contiguous; independence holds. |
| R4 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: omni-ah) | fa17cbf78259 | 2026-06-16T15:10:00Z | Needs-Fix | F1(block): seed lacks repo_slug→unresolved {{}}; F2: sync --quiet not real; F3: key managed.files not disk; F4: exclude .gitkeep; F5: add schema deliverable; F7: reword precedent. |
| R5 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: omni-ah) | 2c7824e8e77f | 2026-06-16T15:21:01Z | Go | All R4 findings resolved; hash verified; no new blockers. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per OPERATIONS.md § Claim) | planned | — | — |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
