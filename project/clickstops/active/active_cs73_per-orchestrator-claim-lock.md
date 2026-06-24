# CS73 — Per-orchestrator claim lock: stop the global one-CS-at-a-time block

**Status:** active
**Owner:** omni-ah-c3
**Branch:** cs73/content
**Started:** 2026-06-24
**Closed:** —
**Filed by:** omni-ah-c3 (2026-06-24) — filed **and** claimed together per a direct maintainer instruction ("this rule is per orchestrator, update the rule to avoid future confusion"; "each orchestrator can pick up a cs"). Surfaced when a CS67 claim lost the global one-CS-at-a-time race to a sibling clone's CS72 even though the two claims belong to different orchestrators (`omni-ah` vs `omni-ah-c3`).
**Depends on:** none (hard). Touches the claim machinery owned by CS64 (`harness claim`) but no in-flight CS.

## Goal

Make the claim lock **per-orchestrator** instead of **global**. Each orchestrator clone may hold exactly one in-flight (Active) CS; different orchestrators run concurrently and may each own their own Active row. Today `lib/claim.mjs` enforces a *global* "any other Active CS, regardless of owner, blocks the claim" check that contradicts the module's own header comment (which documents per-orchestrator intent) and serializes the entire multi-clone fleet to a single CS at a time. This CS removes the two global checks (keeping the per-orchestrator ones) and re-words every doc/help surface that states the rule globally.

## Background

`lib/claim.mjs` has two layers of conflict detection:

- **Per-orchestrator** (correct, retained): `planClaim` refuses if the *same* `agentId` already owns an Active row (lines ~410-417); `applyClaimPlan` repeats the check at apply time against the freshly-read WORKBOARD (lines ~526-533).
- **Global** (the bug, removed): `planClaim` *also* refuses if *any other* row is Active regardless of owner (lines ~418-424); `applyClaimPlan` repeats it (lines ~534-544).

The agent ID is derived per machine + repo-folder (`<machine-short>-ah[-c<N>]`), so each clone is a distinct orchestrator for locking purposes (e.g. `omni-ah`, `omni-ah-c3`, `yoga-ah-c2`). The intended model — six orchestrators in `WORKBOARD.md`, each able to pick up work — requires the lock to key on the owner, not the global table. The global check was an over-reach: its comment ("Without this, a different orchestrator claiming a CS between plan and apply would slip past") describes the very concurrency the design wants to *allow*. `check-workboard.mjs` does **not** enforce global-single (it validates table shape only), so removing the verb-side global check leaves no contradictory gate.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C73-1 | Lock scope | The claim conflict check is **per-orchestrator**. Remove the two *global* "any other Active CS regardless of owner" checks in `lib/claim.mjs` — the `planClaim` preflight `otherActive` block and the `applyClaimPlan` apply-time `globalOtherActive` block. **Retain** both per-orchestrator checks (same `agentId` already owns an Active row, at plan time and apply time). Also re-word the in-code global wording: the module header preflight list (lines ~9-10, "no other CS already in flight") and the race comment (line ~20). | Multiple orchestrator clones run in parallel; each holds at most one in-flight CS. A global lock serialises the whole fleet to one CS, defeating the multi-clone model. The module header already documents per-orchestrator intent (line ~9: "no existing Active row for this orchestrator"), so the trailing "no other CS already in flight" is the self-contradiction to remove. |
| C73-2 | Documentation lockstep | Re-word every prose surface that states the rule globally: `OPERATIONS.md` + `template/composed/OPERATIONS.md` (lockstep) "One CS active at a time … No new CS may be claimed while an existing CS has `state = Active`"; the `bin/harness.mjs` claim help line "No other CS is Active in WORKBOARD (one-CS-at-a-time rule)"; `CONTEXT.md` "single-row by orchestrator discipline … Only one CS is in-flight at a time"; **and the existing `[Unreleased]` CHANGELOG CS64 entry** which still describes the claim preflight as the "one-CS-at-a-time rule" (unreleased ⇒ correct it in place, not just append a Fixed entry). New wording: one Active CS **per orchestrator**; a different orchestrator's Active row never blocks a claim. | "Avoid future confusion" requires code and prose to agree; a doc-only or code-only fix leaves the contradiction that bit CS67. The unreleased CHANGELOG must describe the behaviour that will actually ship. |
| C73-3 | Test realignment | Flip the two tests asserting a *different* orchestrator blocks (`planClaim: blocked when another orchestrator already owns an Active row`; `applyClaimPlan: apply-time race … DIFFERENT orchestrator`) to assert the claim is **allowed** (plan returns `ok`; apply inserts the row). **Retain** the same-orchestrator block tests (`ownership-conflict … names the Active row`; `apply-time race … this orchestrator`). Net test count must not drop. | Tests are the executable spec; they must encode per-orchestrator semantics, including the positive (cross-orchestrator allowed) and negative (same-orchestrator blocked) cases. |
| C73-4 | Manual claim for this CS | Because the live `harness claim` verb (main's code) still enforces the global block, claim CS73 via the documented **manual** procedure (`OPERATIONS.md § Claim steps`) — add the `omni-ah-c3` Active row + author the active file directly — rather than the verb. No CI gate rejects a second Active row (`check-workboard.mjs` checks shape only; the workboard-auto-approve allowlist permits clickstop + WORKBOARD paths). | The verb cannot claim its own fix while a sibling CS is Active — the bootstrapping consequence of the very bug. The manual path is in-policy and the corrected rule makes an `omni-ah-c3` row beside `omni-ah`/CS72 legitimate. |
| C73-5 | SemVer | Classify as a **patch** bug-fix: claim wrongly enforced a global lock contradicting its documented per-orchestrator design. No new CLI surface, flag, or schema field. CHANGELOG `[Unreleased]` → **Fixed**. | Loosening an incorrect precondition to match documented intent is a fix, not a feature; no consumer-visible surface is added. |
| C73-6 | cs-probes scaffold consistency | The shipped `cs-probes` scaffold *executes* the global rule and must move to per-orchestrator too: `probe-active.mjs` currently hard-FAILs when more than one `active/*.md` exists ("expected at most 1") — change to **at most one active CS per `**Owner:**`** (owner-agnostic: it never needs to know which orchestrator is running, only that no single owner has two); `probe-tasks-resolved.mjs` only validates when *exactly one* active file exists (`mdFiles.length !== 1 → return null`) — change to validate **every** active CS file; update the scaffold `README.md` wording; add a focused test for the per-owner probe behaviour. | An executable enforcement surface shipped to consumers is higher-priority than prose: leaving the global hard-fail in `probe-active.mjs` directly contradicts C73-1 and breaks multi-orchestrator consumer CI. The probe already parses `**Owner:**`, so per-owner is a faithful, bounded change. |

## Deliverables

1. `lib/claim.mjs` (edit) — remove the `planClaim` global `otherActive` block and the `applyClaimPlan` global `globalOtherActive` block; retain both per-orchestrator checks; re-word the header preflight list (lines ~9-10, drop "no other CS already in flight") and the race comment (line ~20) to per-orchestrator.
2. `tests/lib-claim.test.mjs` (edit) — flip the two cross-orchestrator tests to assert allowed (plan `ok` / row inserted); retain the same-orchestrator block tests; net test count not reduced (add a positive cross-orchestrator apply-time assertion to hold coverage).
3. `bin/harness.mjs` (edit) — re-word the claim help preflight bullet to the per-orchestrator rule.
4. `OPERATIONS.md` + `template/composed/OPERATIONS.md` (edit, lockstep) — re-word the claim-lock paragraph (`§ Claim`) to per-orchestrator; composed-blocks lockstep lint passes.
5. `CONTEXT.md` (edit) — update the single-row-discipline line to per-orchestrator (each orchestrator one in-flight CS; concurrent orchestrators ⇒ concurrent Active rows).
6. `CHANGELOG.md` (edit) — add an `[Unreleased]` **Fixed** entry for the per-orchestrator claim lock **and** re-word the existing `[Unreleased]` CS64 entry's "one-CS-at-a-time rule" claim-preflight phrasing to per-orchestrator (it has not shipped).
7. `scaffolds/cs-probes/files/scripts/cs-probes/probe-active.mjs` + `probe-tasks-resolved.mjs` + `scaffolds/cs-probes/README.md` (edit) — `probe-active` enforces **at most one active CS per `**Owner:**`** (replacing the global `>1` hard-fail) and its module-doc/help wording; `probe-tasks-resolved` validates **every** active CS file (not only when exactly one exists); README wording updated. `scaffold-readme:cs-probes` + `check-templates` lint pass.
8. `tests/cs73-probe-active.test.mjs` (new) — fixture-based test (under `os.tmpdir()`) for `probe-active`: passes with one active CS, passes with two active CSs owned by *different* owners, fails with two active CSs owned by the *same* owner.

## User-approval gates

- **G-release** — patch bump per C73-5 when this ships in a tag (no gate needed pre-merge).

## Exit criteria

1. `planClaim` **allows** a claim when a *different* orchestrator owns an Active row, and **blocks** when the *same* orchestrator already owns one (C73-1, C73-3).
2. `applyClaimPlan` apply-time re-check **allows** a different-orchestrator Active row appearing between plan and apply, and **blocks** a same-orchestrator second Active row (C73-1, C73-3).
3. `OPERATIONS.md` (+ composed mirror), `bin/harness.mjs` help, `CONTEXT.md`, and the unreleased CHANGELOG CS64 entry state the per-orchestrator rule; `composed-blocks:OPERATIONS.md` lockstep lint passes (C73-2).
4. `probe-active.mjs` fails only when a *single owner* has >1 active CS (passes for multiple owners); `probe-tasks-resolved.mjs` validates every active CS; README updated; new probe test green (C73-6).
5. `node --test tests/*.test.mjs` green; `harness lint --quiet` 0 failed; `harness sync --mode=check` no drift.
6. Plan-vs-implementation review (GPT-5.5 gate) returns GO.
7. CHANGELOG `[Unreleased]` Fixed entry present (C73-5).

## Risks + open questions

| # | Risk / what breaks | Mitigation |
|---|---|---|
| R1 | Removing the global check lets `WORKBOARD.md` accumulate multiple Active rows; a reader could mistake parallel work for drift. | This is the *intended* multi-clone model; each orchestrator owns + removes its own row at close-out. Docs (C73-2) make the per-orchestrator rule explicit. |
| R2 | Ambiguity over what counts as "one orchestrator" — does one human running two clones share a lock? | The lock keys on the derived agent ID (`<machine-short>-ah[-c<N>]`), which differs per machine + repo-folder, so each clone is its own orchestrator. Documented in Background. |
| R3 | Lockstep doc drift between root `OPERATIONS.md` and `template/composed/OPERATIONS.md`. | `composed-blocks:OPERATIONS.md` linter enforces the core block matches; both edited together. |
| R4 | A different orchestrator could now claim the *same* CS id concurrently (two clones, same CS). | Out of scope and unchanged: the same-CS guard (`r.cs !== csId`) and the planned→active rename (one file) still serialise a single CS; only the *cross-CS, cross-owner* global block is removed. |
| R5 | The `cs-probes` per-owner rewrite changes a shipped scaffold consumers may already run in CI. | Scaffolds are copied once (seeded), so existing consumers keep their copy; the template fix only reaches new installs. The new behaviour is strictly *more* permissive (multi-owner now passes), so it cannot newly break a previously-passing single-orchestrator consumer. New probe test pins the semantics. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: omni-ah-c3) | cdc34cbc0969 | 2026-06-24T06:24:00Z | Needs-Fix | Missed shipped cs-probes probe-active executable global gate (breaks multi-orch consumer CI); also reword unreleased CS64 changelog + claim.mjs header lines 9-10. All folded into C73-1/2/6. |
| R2 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: omni-ah-c3) | 7b6b125a0843 | 2026-06-24T06:33:00Z | Go | R1 blockers resolved: cs-probes in D7/D8 (per-owner probe-active, all-active probe-tasks); CHANGELOG CS64 + claim.mjs header covered; no missed surfaces. NB: add probe-tasks test in impl. |

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | omni-ah-c3 |
| Reviewer agent | rubber-duck (orchestrator: omni-ah-c3) |
| Notes | Implementation dispatched to a background sub-agent (`claude-opus-4.8`); GPT-5.5 background sub-agent for the plan review and the content rubber-duck (independence per REVIEWS § 2.3 — reviewer `gpt-5.5` ≠ implementer `claude-opus-4.8`). CS73 is NOT on `reviews.high_risk_clickstops`; fallback `claude-sonnet-4.6` permitted if `gpt-5.5` unavailable. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1 — `lib/claim.mjs`: remove the two global one-active checks (preflight + apply-time), retain per-orchestrator; update header comment | done | cs73-impl | C73-1; Deliverable 1. agent-id=cs73-impl \| role=implementer \| report-status=complete \| learnings=0 |
| T2 — `tests/lib-claim.test.mjs`: flip the two cross-orchestrator block tests to assert allowed; retain same-orchestrator block tests; net count not reduced | done | cs73-impl | C73-3; Deliverable 2. agent-id=cs73-impl \| role=implementer \| report-status=complete \| learnings=0 |
| T3 — `bin/harness.mjs` claim help + `OPERATIONS.md` + `template/composed/OPERATIONS.md` mirror + `CONTEXT.md`: re-word to per-orchestrator (lockstep) | done | cs73-impl | C73-2; Deliverables 3,4,5. agent-id=cs73-impl \| role=implementer \| report-status=complete \| learnings=0 |
| T4 — `CHANGELOG.md`: add `[Unreleased]` Fixed entry + reword the existing unreleased CS64 "one-CS-at-a-time" claim-preflight phrasing | done | cs73-impl | C73-5, C73-2; Deliverable 6. agent-id=cs73-impl \| role=implementer \| report-status=complete \| learnings=2 |
| T4b — `cs-probes` scaffold: `probe-active.mjs` per-owner, `probe-tasks-resolved.mjs` all-active, README wording + `tests/cs73-probe-active.test.mjs` | done | cs73-impl | C73-6; Deliverables 7,8. agent-id=cs73-impl \| role=implementer \| report-status=complete \| learnings=0 |
| T5 — Local rubber-duck plan-vs-implementation review (GPT-5.5) before content PR | pending | omni-ah-c3 | Independence invariant: reviewer model ≠ implementer model. |
| T6 — Open content PR (`cs73/content`); PR-level rubber-duck + `harness copilot-engage`; resolve threads; squash-merge | in_progress | omni-ah-c3 | Per OPERATIONS.md § Three-PR shape (content PR). |
| T7 — Close-out: docs + restart state — rename `active_cs73_*.md` → `done_cs73_*.md`; update WORKBOARD + CONTEXT handoff | pending | omni-ah-c3 | Close-out PR (`cs73/close-out`). |
| T8 — Close-out: learnings + follow-ups — file new LEARNINGS; create planned follow-up CSs for unresolved items | pending | omni-ah-c3 | Per RETROSPECTIVES.md. |

## Notes / Learnings

**Sub-agent ledger.** `cs73-impl` (`claude-opus-4.8`, background) implemented all of T1–T4b on `cs73/content` (11 files: `lib/claim.mjs`, `tests/lib-claim.test.mjs`, `bin/harness.mjs`, `OPERATIONS.md` + `template/composed/OPERATIONS.md` lockstep, `CONTEXT.md`, `CHANGELOG.md`, the two `cs-probes` probes + README, and new `tests/cs73-probe-active.test.mjs`). No rogue commit (PREFLIGHT == FINAL SHA `51e75a3`). Orchestrator verified the full diff; tests 1395/1394 pass/0 fail/1 skip (+5), `harness lint --quiet` 30/0/3.

**Implementer judgment call (accepted).** A `### Fixed` subsection already existed under `[Unreleased]` (the CS64 post-merge PVI entry, placed after `### Documentation`). The briefing's "add `### Fixed` before `### Documentation`" would have produced a duplicate header; the implementer correctly added the CS73 entry to the existing `### Fixed` section instead. Single, well-formed section; lint passes.

**Learning candidates (file at close-out, T8):**
- _tooling_ — the `create` file path emits CRLF on Windows; newly-created files must be LF-normalized before `check-text-encoding` (the `edit` path preserves LF). Evidence: `tests/cs73-probe-active.test.mjs` flagged CRLF until normalized.
- _process_ — a verbatim "add section X before section Y" briefing instruction can collide with pre-existing structure (a `### Fixed` already present), risking a malformed duplicate; briefings for CHANGELOG/structured-doc edits should say "add to the existing section if present, else create".

## Plan-vs-implementation review

**Reviewer:** GPT-5.5 (rubber-duck) — independent of the implementer model (claude-opus-4.8)
**Date:** 2026-06-24T07:50:00Z
**Outcome:** GO

Analyzed the merged content squash `161437f` against the plan's Decisions (C73-1..6) and Deliverables (1-8).

| Deliverable | Outcome |
|---|---|
| D1 — `lib/claim.mjs` (remove 2 global checks, retain per-orchestrator, reword comments) | match |
| D2 — `tests/lib-claim.test.mjs` (flip 2 cross-orchestrator tests; retain same-orchestrator block tests) | match |
| D3 — `bin/harness.mjs` claim help | match |
| D4 — `OPERATIONS.md` + `template/composed/OPERATIONS.md` (lockstep) | match |
| D5 — `CONTEXT.md` | match |
| D6 — `CHANGELOG.md` (Fixed entry + CS64 reword) | match |
| D7 — `cs-probes` scaffold (probe-active per-Owner; probe-tasks-resolved all-active; both fail closed on non-ENOENT) | match |
| D8 — `tests/cs73-probe-active.test.mjs` (tmpdir-only) | match |

**Test-coverage:** sufficient. **Outcome:** GO — no deliverable dropped or silently changed; cross-orchestrator claim/apply is allowed, same-orchestrator blocking retained, docs/help/CHANGELOG reworded, probes align with per-owner + all-active semantics.

Content-PR review chain (GPT-5.5 rubber-duck Go + Copilot resolved each round): R1 Go @16b8a1a → Copilot R1 (2 fail-closed findings → ef0e67a) → R2 Go @ef0e67a → Copilot R2 (spelling → 4129f76) → R3 Go @4129f76 → Copilot R3 converged (0 findings). Merged squash `161437f`.
