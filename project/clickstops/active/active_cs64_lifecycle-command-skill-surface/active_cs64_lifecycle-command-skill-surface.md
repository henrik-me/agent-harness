# CS64 — Lifecycle command/skill surface: extract & leverage harness verbs

**Status:** active
**Owner:** omni-ah
**Branch:** cs64/content
**Started:** 2026-06-10
**Closed:** —
**Filed by:** CS63 (2026-06-06 by `yoga-ah-c3`) as the deferred follow-up for decision **C63-8** (skills / procedure-locality), expanded per user direction to capture the **complete** lifecycle command/skill surface — not just `claim`/`close-out`. CS63 resolved the skills evaluation to "CLI-commands-first, runtime-skills-second" and shipped `harvest` as the first verb; CS64 catalogs the full surface, implements the foundational lifecycle verbs, and wires the process docs to invoke them at the right moment.
**Depends on:** **CS63** (soft) — `claim`'s pre-claim step calls `lib/harvest.mjs` (C63-4) and `close-out`'s context check pairs with `scripts/check-closeout-freshness.mjs` (C63-5); CS64 coding may begin against injectable stubs, but the harvest/freshness wiring + those exit criteria are gated on the CS63 deliverables merging. The review-family + release verbs (C64-8) defer to **CS66**/**CS67**. **CS70** (soft, ships ahead) — establishes the v0.8.0 baseline so CS64 ships as v0.9.0 (per amended C64-11 / G-release).

## Goal

Extract the harness's **lifecycle procedure surface** — currently spread across `OPERATIONS.md`/`INSTRUCTIONS.md` prose — into portable, testable `harness` **verbs** (CLI subcommands), and wire each process-doc lifecycle step to **invoke its verb** as the canonical executable path. Expose runtime "skills" (Copilot CLI) only as thin wrappers over those verbs. This is the "CLI-commands-first" realization of CS63 C63-8: it makes procedure right-time-invokable (not always-loaded prose), unit-testable, and agent-agnostic, and it is the prerequisite that lets CS65 thin `OPERATIONS.md` to pointers.

CS64 **catalogs the entire surface** (the C64-1 table), **implements the foundational verbs** (`startup`, `claim`, `close-out`, `dispatch`, `status`), and **leverages** them in the docs. The substantial review-family and release verbs are cataloged here and implemented in named follow-ups.

## Background

Per CS63 **C63-8**, `harness <verb>` subcommands are the harness's agent-agnostic "skill" mechanism, preferred over runtime-specific skills for core procedure. Today the lifecycle is mostly prose an agent must read and execute by hand — the failure mode CS63 C1 documented (the docs even reference a non-existent `harness claim`). The current CLI already covers part of the surface (`init`, `sync`, `check`, `lint`, `review`, `review-output`, `copilot-engage`, `pr-evidence`, `cross-repo`, `whoami`, `version`, plus `harvest`/`upgrade` from CS63); the gaps are the session-bootstrap, claim, close-out, dispatch, status, and the review-family/release verbs.

The claim/close-out verbs must conform to the existing **three-PR shape** (`OPERATIONS.md § Claim`, lines 21-68): every CS produces (1) a **workboard-claim PR** (branch `cs<NN>/claim`, touches only `WORKBOARD.md` + rename `planned→active`, label `workboard-only`), (2) a **content PR** (branch `cs<NN>/content`), (3) a **close-out PR** (branch `cs<NN>/close-out`, touches `WORKBOARD.md` row removal + rename `active→done` + `CONTEXT.md`/`LEARNINGS.md`, preceded by the plan-vs-implementation gate). The verbs mechanize the claim and close-out PR steps respectively — **not** the content branch, which is created by hand after the claim PR merges.

## Command/skill surface catalog

The complete target surface. **Status:** EXISTS (shipped) · CS63 · **CS64** (this CS) · CS66/CS67 (deferred). "Leverage point" is the doc section that must invoke the verb (C64-2).

| Verb | Lifecycle moment | Status | Leverage point |
|---|---|---|---|
| `harness startup` | Session start / resume — bootstrap sanity check | **CS64** | INSTRUCTIONS § Session Start |
| `harness whoami` | Derive + print agent ID | EXISTS | INSTRUCTIONS § Session Start |
| `harness harvest` | Pre-claim + weekly learnings gate | CS63 | Per-CS Loop step 1 |
| `harness claim <NN>` | Claim = workboard-claim PR step | **CS64** | Per-CS Loop step 2 / OPERATIONS § Claim |
| `harness dispatch` | Emit canonical sub-agent briefing preamble + report shape (mechanizes the LRN-073 verbatim-paste discipline) | **CS64** | OPERATIONS § Sub-agent dispatch / Per-CS Loop step 4 |
| `harness check` | Drift check (`sync --mode=check`) | EXISTS | Per-CS Loop step 5 |
| `harness lint` | Structural + policy lint (validation entry point) | EXISTS | every pre-report self-check |
| `harness review <pr>` | Content-PR review orchestration (rubber-duck + Copilot + PR body) | EXISTS (CS52) | Per-CS Loop steps 6, 9 |
| `harness review-doc <pr>` | Doc/prose PR review — fact-claim verification (REVIEWS § 2.6a F1–F5: flags/paths/doctrine/LRN-scope/cross-doc) | CS66 | REVIEWS § 2.6a |
| `harness review-cs <NN>` | Plan / clickstop review — plan-vs-implementation + plan-review-hash workflow | CS66 | OPERATIONS § Plan-vs-implementation review |
| `harness perf-review <pr>` | Performance review pass | CS66 | REVIEWS (review family) |
| `harness security-review <pr>` | Security review pass (secrets, injection, permissions, supply-chain) | CS66 | REVIEWS (review family) |
| `harness review-output` | Validate reviewer-output markdown shape | EXISTS (CS40) | OPERATIONS § Reviewer dispatch |
| `harness copilot-engage <pr>` | Request Copilot review + poll | EXISTS (CS41) | Per-CS Loop review |
| `harness pr-evidence <pr>` | PR-evidence gates (B1/A3/A4/A5/A6/A16) | EXISTS | CI |
| `harness close-out <NN>` | Close-out = close-out PR step (PVI gate → rename `active→done` → WORKBOARD removal → CONTEXT/LEARNINGS) | **CS64** | Per-CS Loop step 12 / OPERATIONS § Claim |
| `harness release` | Release cut (version bump → CHANGELOG promote → tag → `gh release` → consumer notify) | CS67 (dep CS59) | OPERATIONS § Release process |
| `harness cross-repo` | Issue-only cross-repo handoff | EXISTS (CS56) | OPERATIONS § Cross-repo |
| `harness upgrade` | Guided consumer update (dry-run diff) | CS63 | install/update docs |
| `harness status` | Show current CS / WORKBOARD state + in-flight arc (resume/handoff aid) | **CS64** | INSTRUCTIONS § Session Start; handoff |

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C64-1 | Canonical surface inventory | The catalog table above is the **single canonical inventory** of the lifecycle verb/skill surface. Every lifecycle procedure either maps to a verb here or is explicitly out of scope. New lifecycle procedure ⇒ a verb + a catalog row, not new always-loaded prose. | "Capture all skills" requires one authoritative list; it also becomes the checklist CS65 uses to know which `OPERATIONS.md` sections can collapse to pointers. |
| C64-2 | Leverage principle | Every lifecycle doc section (`INSTRUCTIONS § Session Start`, the Per-CS Loop steps, the matching `OPERATIONS.md` sections) **references its verb as the canonical executable path**, and the Per-CS Loop names the verb at each step. Docs keep the "why/when"; the verb carries the "how". Applied in this CS for the implemented verbs; CS65 then thins the prose. | An extracted verb is worthless if the docs do not point an agent to it at the right moment. Wiring leverage is the difference between "a command exists" and "the workflow uses it." |
| C64-3 | `harness startup` | Implement a session-bootstrap verb backed by `lib/startup.mjs`: runs the INSTRUCTIONS § Session Start sanity sequence (`git pull --ff-only`, `git status` clean check, `node --test`, `harness lint --quiet`, `sync --mode=check`), lists in-flight `planned`/`active` CS files, and prints the derived agent ID + the HEAD SHA for the "INSTRUCTIONS re-read @ \<SHA\>" line. **Read-only / advisory** — it reports, never mutates; non-zero only on a genuinely broken tree (so "main is green" is a real gate). | Turns the most-skipped manual checklist into one command, surfacing "resume vs restart" (in-flight CS list) deterministically. Read-only keeps it safe to run anytime. |
| C64-4 | `harness claim <NN>` = workboard-claim step ONLY | Backed by `lib/claim.mjs`: preflight (clean worktree; exactly one `planned_cs<NN>_*` match; `main` up to date; deterministic slug from the planned filename; target `cs<NN>/claim` branch absent), run the `lib/harvest.mjs` pre-claim gate (advisory), create branch `cs<NN>/claim`, add the `WORKBOARD.md` Active-Work row, `git mv planned→active`, and **print the commit + `workboard-only` PR instructions**. It does **not** create the `cs<NN>/content` branch (that is a separate, post-claim-merge step) and does **not** commit/push automatically. `--dry-run` prints the mutation plan; apply is explicit; idempotent (already-active CS ⇒ no-op with a clear message). | Conforms to the three-PR shape (`OPERATIONS.md:21-68`): claim mutations belong on `cs<NN>/claim` in a `workboard-only` PR, separate from content work. Preflights + dry-run + idempotency prevent half-applied WORKBOARD/branch state. |
| C64-5 | `harness close-out <NN>` = close-out PR step | Backed by `lib/closeout.mjs` as a **two-phase flow**: **Phase 1 (preflight, read-only)** — `## Plan-vs-implementation review` present + GO (block on absent/NEEDS-FIX), plus `cs<NN>/close-out` branch + clean-worktree checks. **Phase 2 (mutate, dry-run-first)** — `git mv active→done`, remove the `WORKBOARD.md` row, prompt for `CONTEXT.md`/`LEARNINGS.md` updates; then a **final validation** runs the CS63 `check-closeout-freshness` logic over the resulting changed-file set and **refuses to print PR-ready instructions** until `CONTEXT.md` is changed. Idempotent; never auto-commit. | The freshness gate keys off the `active→done` rename + changed-file set, so it must validate the staged result, not pre-empt it; PVI is the true pre-gate. Encodes the close-out gate so an agent cannot finish close-out while skipping the PVI or context-update steps; reuses the CS63 freshness check as one source of truth; conforms to the three-PR close-out shape. |
| C64-6 | `harness dispatch` | Backed by `lib/dispatch.mjs`: emit the **canonical sub-agent briefing preamble** (OPERATIONS § Mandatory briefing preamble) + the required report shape, with slots for role / owned-files / required-reading, so the orchestrator invokes one verb instead of hand-pasting 40 lines verbatim. Output-only (prints the briefing); no mutation. | Mechanizes the verbatim-paste discipline whose value was empirically validated by LRN-073 (zero violations across ~46 dispatches when paste is honored) — by generating the preamble instead of relying on the orchestrator to copy it. |
| C64-7 | `harness status` | **Required in CS64** (G-status resolved 2026-06-09): a read-only verb printing the active CS, WORKBOARD Active-Work rows, and in-flight `planned`/`active` arc — the resume/handoff snapshot. Backed by `lib/status.mjs` per C64-10. Output-only; no mutation. | Cheap handoff aid; complements `startup`. Originally filed as a stretch goal; user pre-resolved G-status to include it as a core deliverable in CS64 to deliver the full lifecycle resume/handoff path in a single CS rather than fragmenting across follow-ups. |
| C64-8 | Review-family + release deferred | `review-doc`, `review-cs`, `perf-review`, `security-review` are substantial review-workflow designs extending `harness review`; they defer to **CS66** (review-family expansion). `harness release` defers to **CS67** (depends on CS59's release-process docs). Both are cataloged (C64-1) and their stub CSs are filed as a CS64 deliverable. | Each review verb is its own design (what it checks, how it reports, independence). Bundling them would re-create the CS63 mega-PR risk. Catalog now, implement in focused follow-ups. |
| C64-9 | Skills = thin wrappers (spike with mandatory silent-skip mitigation) | Produce a **spike + written go/no-go proposal** for thin Copilot-CLI skill wrappers that invoke these verbs at the right moment. Skills contain **no** procedure logic — only invocation. **The proposal MUST include a documented mitigation for the silent-skip failure mode** (i.e. the failure mode where a skill's description doesn't match the agent's context, the skill doesn't auto-load, and procedure regresses silently because the orchestrator believed the skill would handle it). Absent a proper mitigation, the only valid recommendation is no-go (with the unmitigated risk recorded as the rationale). When a wrapper exists, **INSTRUCTIONS.md and OPERATIONS.md (+ lockstep mirrors) reference the skill at the relevant lifecycle moment for "how" details**, and the skill itself documents (a) which verb it wraps, (b) what triggers it, (c) what happens if it doesn't auto-fire (the silent-skip mitigation in action — e.g. an unconditional inline reminder in the doc, or a verb-side check that detects skill-mediated invocation and warns if absent). Bidirectional reference: doc → skill, skill → verb + doc. If go, a follow-up ships wrappers; if no-go, the proposal records the no-go with the mitigation gap as evidence. | Honors C63-8: stay agent-agnostic; the silent-skip failure mode of an unloaded skill is unacceptable for core procedure, so logic lives in the verb regardless. The mandatory mitigation requirement (G-skill amendment 2026-06-09) elevates silent-skip from a discussion point to a hard go-decision criterion, mirroring how LRN-073's verbatim-paste discipline (validated across ~46 dispatches with zero violations when paste is honored) became the operational standard for canonical-preamble dispatch. The bidirectional doc/skill reference closes the doctrine loop so an agent reading either surface finds the other. |
| C64-10 | Logic in `lib/`, thin `bin/` | All mechanics live in `lib/{startup,claim,closeout,dispatch,status}.mjs` (zero runtime deps, unit-testable) with **injectable git/fs seams** so tests run without real git/network; `bin/harness.mjs` only parses flags + delegates. Tests write only under `os.tmpdir()`, never REPO_ROOT (project test-hygiene constraint; cited in this plan as a CS64 design constraint per LRN-094 / the existing test-hygiene memory `tests must use os.tmpdir() — REPO_ROOT writes race with check-text-encoding's recursive walk under parallel node --test`). | Per "When to Add a Library Module" + LRN-039/032; injectable seams + tmpdir keep tests from mutating the real repo and racing the recursive linters. Adding `status.mjs` to the module list keeps the C64-10 surface consistent with C64-7 / Deliverable 6 (R2 amendment 2026-06-09). |
| C64-11 | SemVer | Four+ new CLI subcommands ⇒ **minor** bump per `OPERATIONS.md § SemVer policy`. | New consumer-visible CLI surface. |

## Deliverables

1. **Catalog** (this file's `## Command/skill surface catalog`) — the canonical inventory (C64-1).
2. `lib/startup.mjs` + `tests/lib-startup.test.mjs` — read-only session-bootstrap sequence + in-flight-CS listing + agent-ID/HEAD print (C64-3).
3. `lib/claim.mjs` + `tests/lib-claim.test.mjs` — workboard-claim-step mechanics with preflights, dry-run, idempotency, harvest-gate wiring; injectable git/fs seams (C64-4, C64-10).
4. `lib/closeout.mjs` + `tests/lib-closeout.test.mjs` — close-out-step mechanics: PVI + freshness read-only gates (fail closed), rename, WORKBOARD removal; dry-run + idempotent (C64-5, C64-10).
5. `lib/dispatch.mjs` + `tests/lib-dispatch.test.mjs` — canonical briefing-preamble + report-shape emitter (C64-6).
6. `lib/status.mjs` + `tests/lib-status.test.mjs` — required resume/handoff snapshot verb per C64-7 (G-status resolved: include in CS64).
7. `bin/harness.mjs` (edit, orchestrator) — register `startup`, `claim`, `close-out`, `dispatch`, `status` in `COMMAND_REGISTRY` + `TOP_HELP` + `SUBCOMMAND_HELP`; thin delegation only.
8. `INSTRUCTIONS.md` + `OPERATIONS.md` (edit, orchestrator) **and `template/managed/` + `template/composed/` mirrors in lockstep** — the leverage wiring: Session Start references `harness startup`; Per-CS Loop steps name `harvest`/`claim`/`dispatch`/`review`/`close-out`/`status`; OPERATIONS § Claim references the verbs. **If C64-9 yields "go" on skill wrappers, also add a short "How skills relate to verbs" pointer in INSTRUCTIONS.md (or OPERATIONS.md as appropriate) per the C64-9 G-skill amendment** — docs reference the skill for the "how" of skill-wrapped invocation, while the skill file itself documents the wrapped verb + silent-skip mitigation. Reference, not duplicate (C64-2); prose-thinning is CS65.
9. Runtime-skill **spike + go/no-go proposal** artifact in this CS's `done_` directory (C64-9). **The proposal MUST contain a "Silent-skip mitigation" section** (per G-skill amendment 2026-06-09) — without it, the recommendation defaults to no-go. If "go", proposal also includes a sample wrapper for at least one verb (e.g. `harness startup`) and the proposed doc-↔-skill bidirectional reference shape.
10. `project/clickstops/planned/planned_cs66_*.md` (review-family verbs) + `planned_cs67_*.md` (release verb) stubs (C64-8).
11. `CHANGELOG.md` (edit) — `[Unreleased]` entries for the new subcommands.

## User-approval gates

- **G-status** — ✅ **resolved 2026-06-09: include `harness status` in CS64.** Originally an in-flight gate; user pre-resolved during CS64 pre-claim conversation. C64-7 + Deliverable 6 + Exit criterion 1a reflect the inclusion. The gate is recorded here for historical traceability; no further action.
- **G-skill** — ✅ **resolved 2026-06-10: NO-GO this CS.** See [`runtime-skill-spike.md`](./runtime-skill-spike.md) for the full proposal + go/no-go evidence. Silent-skip mitigation evidence is incomplete: mitigations (1) doc-side inline naming and (3) verb-side fail-fast are present (delivered by CS64 D8 + every verb's preflight), but mitigation (2) cold-telemetry audit for missed invocations has not been designed or validated. Per C64-9's binding language ("Absent a proper mitigation, the only valid recommendation is no-go"), the gate returns no-go. Follow-up CS deferred — to be filed when an orchestrator brings prototyped + validated mitigation-(2) evidence. The CLI verbs themselves stand on their own merits; skill wrappers were an invocation convenience layer, not load-bearing.
- **G-release** — minor bump per C64-11 when CS64 ships in a tag. With CS70 (cut v0.7.0 backfill + v0.8.0) ahead in the queue, CS64 ships as **v0.9.0** (next minor above the v0.8.0 baseline CS70 establishes).

## Exit criteria

1. `harness startup` runs the Session-Start sanity sequence read-only, lists in-flight `planned`/`active` CSs, prints the agent ID + HEAD SHA, and exits non-zero only on a broken tree (C64-3).
1a. `harness status` prints the active CS, WORKBOARD Active-Work rows, and in-flight `planned`/`active` arc snapshot; read-only; exits 0 in normal states (C64-7).
2. `harness claim <NN>` performs **only** the workboard-claim step (branch `cs<NN>/claim`, WORKBOARD row, rename `planned→active`, harvest gate, printed PR instructions), does not create the content branch or auto-commit, with `--dry-run` preview + idempotency + preflights (clean worktree, single match, branch-absent, slug source) (C64-4).
3. `harness close-out <NN>` blocks on absent/NEEDS-FIX PVI as a pre-gate; performs the `active→done` rename + WORKBOARD removal dry-run-first; and refuses PR-ready output until `CONTEXT.md` is changed (post-mutation freshness validation) (C64-5).
4. `harness dispatch` emits the canonical briefing preamble + report shape verbatim from the OPERATIONS source (C64-6).
5. All mechanics live in `lib/*.mjs` with tests writing only under `os.tmpdir()`; `bin/` is thin delegation (C64-10).
6. `INSTRUCTIONS.md`/`OPERATIONS.md` (+ mirrors) invoke each implemented verb at its lifecycle step without duplicating procedure; lockstep lint passes (C64-2, C64-8 deliverable 8). **If C64-9 yields "go", docs also include a "How skills relate to verbs" pointer per C64-9 G-skill amendment.**
7. The runtime-skill spike proposal records a clear go/no-go (C64-9) **AND includes a "Silent-skip mitigation" section** (G-skill amendment); CS66 + CS67 stubs are filed (C64-8).
8. `harness lint --quiet` passes on self-host; `node --test tests/*.test.mjs` green; `sync --mode=check` no drift.
9. Plan-vs-implementation review (GPT-5.5 gate) returns GO.
10. CHANGELOG `[Unreleased]` entries present.

## Risks + open questions

| # | Risk / what breaks | Mitigation |
|---|---|---|
| R1 | `claim`/`close-out` mutate git + the shared `WORKBOARD.md`; a half-applied or buggy run could **corrupt coordination state** or strand a branch. Wrong branch sequencing could put claim/close-out mutations on the content branch, breaking the three-PR shape. | C64-4/C64-5 scope each verb to its single PR step + branch (`cs<NN>/claim`, `cs<NN>/close-out`); dry-run-first; idempotent; injectable seams; never auto-commit (the agent reviews + commits). |
| R2 | Missing preflights → half-applied state: unclean worktree, target branch already exists, ambiguous slug, duplicate `planned_cs<NN>` files, partial mutation on mid-run failure. | C64-4 mandates preflights (clean worktree, exactly-one match, branch-absent, deterministic slug) and an atomic mutation plan / explicit rollback ordering; tested. |
| R3 | `WORKBOARD.md` is multi-orchestrator; a `claim` could race another orchestrator and double-claim. | `claim` re-reads WORKBOARD immediately before writing and refuses if the CS (or any CS) is already `Active` under another owner; surfaces the conflict rather than overwriting (CS22b coordination doctrine). |
| R4 | Encoding procedure in verbs risks **drift** from the prose it mirrors. | C64-2 makes docs reference the verb as canonical (single source); CS65 then thins the prose to pointers, removing the duplication. |
| R5 | Soft dependency on CS63 (`lib/harvest.mjs`, `check-closeout-freshness`) — building before they merge risks rework. | Inject the harvest/freshness checks via seams; unit-test with stubs; gate the real wiring + the dependent exit criteria on CS63 merge. |
| R6 | Tests touching real git or writing under REPO_ROOT would race the recursive linters. | All scratch dirs under `os.tmpdir()`; git seam mocked; no REPO_ROOT writes (memory: tests must use `os.tmpdir()`). |
| R7 | Scope is large (4–5 verbs + catalog + doc leverage + 2 stub CSs + spike); risks review fatigue. After the G-status amendment elevates `status` to required, the verb count is 5 (no longer 4 with one optional). | Verbs are cohesive (all lifecycle extraction) and independently testable; review-family + release deferred (C64-8); land verbs in reviewable increments. |
| R8 | Runtime-skill spike could tempt putting logic in the skill (silent-skip failure mode). | C64-9 is spike-only; logic stays in `lib/` regardless; proposal decides go/no-go. |
| R9 | Deferred review-family/release verbs (`review-doc`, `review-cs`, `perf-review`, `security-review`, `release`) are only cataloged, not built — risk they are forgotten. | C64-8 files CS66 + CS67 stubs as a deliverable so the deferred surface is durably tracked, not lost. |
| Q1 | ~~Open — is `harness status` worth building in CS64 or a later CS?~~ **Resolved 2026-06-09 (G-status): include in CS64 as required deliverable.** | — |
| Q2 | Open — should `review-cs` wrap the existing `plan-review-hash` + close-out gate, or be a new orchestration like `harness review`? | Resolved in CS66 design; cataloged here only. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: yoga-ah-c3) | f267c30c28d2 | 2026-06-06T23:34:30Z | Go-with-amendments | Catalog labels + claim/close-out three-PR shape verified (OPERATIONS:21-68); applied C64-5 two-phase close-out (PVI pre-gate; freshness validates staged diff). Chain acyclic. |
| R2 | gpt-5.5 | claude-opus-4.7-1m-internal | rubber-duck (orchestrator: omni-ah) | 31b4c4298ba6 | 2026-06-09T17:00:00Z | Go-with-amendments | Hash fresh; G-status/G-skill amendments coherent; no R1 regression. Amend C64-10 status module list and tighten LRN-068→LRN-073/tmpdir citations. |
| R3 | gpt-5.5 | claude-opus-4.7-1m-internal | rubber-duck (orchestrator: omni-ah) | bf7dc0c2e6db | 2026-06-09T17:15:02Z | Go | All R2 amendments folded cleanly (status module list; LRN-073 verbatim-paste citation; LRN-094 tmpdir constraint). No new blocking findings. Plan ready to file. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1: Implement `lib/startup.mjs` + `tests/lib-startup.test.mjs` (D2, C64-3) — read-only session-bootstrap verb running INSTRUCTIONS § Session Start sanity sequence (`git pull --ff-only` probe, clean-worktree check, `node --test`, `harness lint --quiet`, `sync --mode=check`); list in-flight planned/active CS files; print agent ID + HEAD SHA. Injectable git/fs seams; tests use `os.tmpdir()` only (R6 / LRN-094); never mutates. | pending | omni-ah | agent-id=cs64-startup \| role=implementer \| report-status=pending \| learnings=0 |
| T2: Implement `lib/claim.mjs` + `tests/lib-claim.test.mjs` (D3, C64-4, C64-10) — workboard-claim-step mechanics with preflights (clean worktree, exactly-one `planned_cs<NN>_*` match, `main` up-to-date, deterministic slug, `cs<NN>/claim` branch absent), `lib/harvest` advisory wiring, branch create + WORKBOARD row + `git mv planned→active`; `--dry-run` preview; idempotent on already-active CS; never auto-commit; prints PR instructions. Injectable git/fs seams; R3 race-aware WORKBOARD re-read before write. | pending | omni-ah | agent-id=cs64-claim \| role=implementer \| report-status=pending \| learnings=0 |
| T3: Implement `lib/closeout.mjs` + `tests/lib-closeout.test.mjs` (D4, C64-5, C64-10) — Phase 1 read-only PVI + branch + clean-worktree gates (fail-closed on absent/NEEDS-FIX PVI); Phase 2 `git mv active→done`, remove WORKBOARD row, prompt for CONTEXT/LEARNINGS updates; final freshness re-validation using CS63's `check-closeout-freshness` logic refusing PR-ready output until `CONTEXT.md` changed. `--dry-run` preview; idempotent; never auto-commit. Injectable freshness-check seam. | pending | omni-ah | agent-id=cs64-closeout \| role=implementer \| report-status=pending \| learnings=0 |
| T4: Implement `lib/dispatch.mjs` + `tests/lib-dispatch.test.mjs` (D5, C64-6) — output-only emitter of canonical sub-agent briefing preamble (verbatim from OPERATIONS § Mandatory briefing preamble source) + required report shape, with slots for role / owned-files / required-reading. Mechanizes LRN-073 verbatim-paste discipline. No mutation. | pending | omni-ah | agent-id=cs64-dispatch \| role=implementer \| report-status=pending \| learnings=0 |
| T5: Implement `lib/status.mjs` + `tests/lib-status.test.mjs` (D6, C64-7) — read-only resume/handoff snapshot: prints active CS, WORKBOARD Active Work rows, in-flight planned/active arc. Output-only; exits 0 in normal states. Injectable seams. | pending | omni-ah | agent-id=cs64-status \| role=implementer \| report-status=pending \| learnings=0 |
| T6: Wire CLI in `bin/harness.mjs` (D7) — register `startup`, `claim`, `close-out`, `dispatch`, `status` in `COMMAND_REGISTRY` + `TOP_HELP` + `SUBCOMMAND_HELP`; forward `--help`; `requireValue()` for flag parsing (LRN-040); thin delegation only (C64-10). Depends on T1–T5. | pending | omni-ah | agent-id=cs64-cli \| role=implementer \| report-status=pending \| learnings=0 |
| T7: Wire leverage refs in `INSTRUCTIONS.md` + `OPERATIONS.md` + `template/managed/INSTRUCTIONS.md` + `template/composed/OPERATIONS.md` (D8, C64-2) — Session Start references `harness startup` + `harness status`; Per-CS Loop steps name `harvest`/`claim`/`dispatch`/`review`/`close-out`/`status` at their lifecycle moments; OPERATIONS § Claim references the verbs as canonical executable path. Lockstep mirrors byte-equal. Reference, not duplicate (CS65 thins prose later). Depends on T6. | pending | omni-ah | agent-id=cs64-docs \| role=implementer \| report-status=pending \| learnings=0 |
| T8: Produce runtime-skill spike + go/no-go proposal artifact (D9, C64-9) in this CS's `active_cs64_lifecycle-command-skill-surface/` directory — proposal MUST include a "Silent-skip mitigation" section (G-skill amendment 2026-06-09); absent mitigation defaults to no-go with the gap recorded. If go, include sample wrapper for at least `harness startup` and proposed doc↔skill bidirectional reference shape. Independent of T1–T7. | pending | omni-ah | agent-id=cs64-skill-spike \| role=implementer \| report-status=pending \| learnings=0 |
| T9: File CS66 + CS67 stub plans (D10) — `planned_cs66_review-family-verbs.md` (review-doc/review-cs/perf-review/security-review per C64-8) and `planned_cs67_release-verb.md` (depends on CS59 release docs). Stubs only; brief plan-review per OPERATIONS § Filing. **Note:** stub files already exist on disk (`planned_cs66_review-family-verbs.md`, `planned_cs67_release-verb.md`) — verify content matches D10's intent and amend if needed rather than re-filing. | pending | omni-ah | agent-id=cs64-stubs \| role=implementer \| report-status=pending \| learnings=0 |
| T10: `CHANGELOG.md` `[Unreleased]` entries (D11) — one bullet per new subcommand (`startup`, `claim`, `close-out`, `dispatch`, `status`); cite CS64 + C64-11 (minor bump → v0.9.0 per G-release). Depends on T6. | pending | omni-ah | agent-id=cs64-changelog \| role=implementer \| report-status=pending \| learnings=0 |
| T11: Resolve G-skill gate per T8 outcome — record go/no-go in active CS file; if go, file follow-up CS for wrapper shipment; if no-go, record silent-skip mitigation gap as rationale. Depends on T8. | pending | omni-ah | agent-id=cs64-g-skill \| role=implementer \| report-status=pending \| learnings=0 |
| Close-out: docs + restart state — update `WORKBOARD.md` (remove CS64 row, bump banner); refresh `CONTEXT.md` (5 new verbs available + status command for resume); ensure managed/composed lockstep mirrors byte-equal; run `harness sync --mode=check` (no drift). | pending | omni-ah | agent-id=cs64-closeout-docs \| role=implementer \| report-status=pending \| learnings=0 |
| Close-out: learnings + follow-ups — file any new learnings in `LEARNINGS.md`; surface any extraction-time gaps as planned CS follow-ups; ensure CS66/CS67 stubs are filed (D10) and the v0.9.0 minor-bump trigger is noted for the next release-cut CS. | pending | omni-ah | agent-id=cs64-closeout-lrn \| role=implementer \| report-status=pending \| learnings=0 |

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.7-1m-internal |
| Reviewer model | gpt-5.5 |
| Implementer agent | omni-ah |
| Reviewer agent | rubber-duck (orchestrator: omni-ah) |
| Notes | Implementer + reviewer model independence per REVIEWS § 2.3 (`claude-opus-4.7-1m-internal` ≠ `gpt-5.5`). CS64 is NOT on the `reviews.high_risk_clickstops` list (CS03/CS11/CS15a/CS18b/CS19); fallback `claude-sonnet-4.6` is permitted if `gpt-5.5` unavailable. Sub-agent rows may add additional implementer model entries here as they dispatch. |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
