# CS59 — Document the release-cut process + fix dangling CHANGELOG link

**Status:** active
**Owner:** omni-ah
**Branch:** cs59/content
**Started:** 2026-06-10
**Closed:** —
**Filed by:** v0.7.0 release close-out (2026-06-03 by `yoga-ah`). Two documentation gaps surfaced while cutting v0.7.0 (the CS54 close-out release): the CHANGELOG links to a non-existent OPERATIONS.md section, and the only viable merge path for a solo-orchestrator content/release PR (`gh pr merge --admin`) is undocumented.
**Depends on:** None hard. Pure docs CS. Builds on `OPERATIONS.md § SemVer policy` (version-bump triggers) and the cross-repo issue path (CS55/CS56). May claim independently.

## Goal

Document the end-to-end harness **release-cut procedure** as a new `OPERATIONS.md § Release process` section, fix the dangling `CHANGELOG.md` link that points at it, and document the **content/release-PR admin-merge reality** for the solo orchestrator. Closes the tribal-knowledge gap exposed by the v0.7.0 cut.

## Background

The v0.7.0 release (CS54+CS55+CS56) was cut by hand against undocumented procedure. Two concrete gaps were found:

- **Gap A — dangling reference + no procedure.** `CHANGELOG.md:8` reads `Versioning policy and release process: see [OPERATIONS.md § Release process](OPERATIONS.md)`, but **no `Release process` section exists** in OPERATIONS.md. The file has `## SemVer policy` (line 1749) covering version-bump *triggers* only. The mechanical release cut — bump `package.json` + `package-lock.json`, promote CHANGELOG `[Unreleased]` → `[x.y.z]`, update README pins, open PR, run the GPT-5.5 plan-vs-impl + Phase-2 reviews, engage Copilot, pass CI, squash-merge, `git tag` + `gh release create` on the squash SHA, and notify consumers via `harness cross-repo open-issue` — is written down nowhere.
- **Gap B — content/release-PR merge reality.** OPERATIONS.md documents admin-bypass merge **only** for workboard-only PRs (`§ Workboard-only PR admin-bypass fallback`, line 305). For a **content/release PR by the sole orchestrator**, the `main` ruleset requires 1 approving review, but the PR author cannot self-approve and the Copilot reviewer only ever submits `COMMENTED` (never `APPROVED`). The only merge path is therefore `gh pr merge --admin`, which was used for PR #227 (v0.7.0) and is undocumented.

Already-adequate doctrine (NOT in scope to rewrite): the re-engage-Copilot-then-rerun-gates flow (`OPERATIONS.md:1275-1287`) and the A5 currency ordering rule.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C59-1 | Release-process section | Add a new `## Release process` section to OPERATIONS.md documenting the ordered release cut (file bumps → CHANGELOG promotion → README pins → PR → plan-vs-impl + Phase-2 review → Copilot engage → CI → squash-merge → `git tag` + `gh release create` on the squash SHA → consumer notification via `harness cross-repo open-issue`), cross-referencing `§ SemVer policy` for the bump-size decision. | Makes releases reproducible instead of tribal. Anchors the CHANGELOG link to a real section. |
| C59-2 | Fix dangling link | Point `CHANGELOG.md:8`'s anchor at the new `§ Release process` heading (e.g. `OPERATIONS.md#release-process`); keep the link text. | The current link resolves to the file top, not the (absent) section — a broken cross-reference. |
| C59-3 | Content-PR admin-merge | Add a subsection (under `§ Release process` or adjacent to the workboard-only fallback) documenting that a solo-orchestrator content/release PR merges via `gh pr merge --admin`, explicitly scoped to the case where both substantive reviews passed (GPT-5.5 rubber-duck `Go` + Copilot review attached at HEAD), because the author can't self-approve and Copilot never returns `APPROVED`. | Documents a recurring structural reality and bounds it so it is not read as a general bypass license. |
| C59-4 | Docs-only | No `schemas/` or code changes. Docs only: OPERATIONS.md, CHANGELOG.md, INSTRUCTIONS.md, and the `template/composed/OPERATIONS.md` + `template/managed/INSTRUCTIONS.md` lockstep mirrors. | Scope discipline; the procedures already exist in practice, only the documentation is missing. |
| C59-5 | Instruction grounding | Add a one-line pointer to the new `§ Release process` from `INSTRUCTIONS.md` (the quick-reference the agent re-reads after every `git pull`) and its `template/managed/INSTRUCTIONS.md` mirror, so the release procedure is part of the grounding an agent gets when reading the instructions — not a fact buried only in OPERATIONS.md. | Per the user, release doctrine important enough to recur every release must be reachable from the instruction grounding, not just memory or a deep OPERATIONS.md section. |

## Deliverables

1. **`OPERATIONS.md`** — new `## Release process` section per C59-1 + the content-PR admin-merge subsection per C59-3. Update both the root file and `template/composed/OPERATIONS.md` in lockstep if the composed mirror exists.
2. **`CHANGELOG.md`** — dangling `§ Release process` link fixed to resolve to the new section per C59-2.
3. **`template/composed/OPERATIONS.md`** — lockstep mirror of the new section, if applicable (per the existing composed-blocks lockstep lint).
4. **`INSTRUCTIONS.md`** (+ `template/managed/INSTRUCTIONS.md` mirror) — one-line pointer to `OPERATIONS.md § Release process` per C59-5, placed in the quick-reference checklist the agent re-reads after every `git pull`.
5. **`CHANGELOG.md`** — entry under the next version's `[Unreleased]` block.

## User-approval gates

- **G-release** if CS59 ships in its own tag. Standard pattern.

## Exit criteria

1. `OPERATIONS.md § Release process` section exists with the ordered cut, including the `git tag` / `gh release create` / consumer-notification steps (C59-1).
2. The `CHANGELOG.md` release-process link resolves to the new section (C59-2).
3. The content/release-PR admin-merge reality is documented and scoped (C59-3).
4. `INSTRUCTIONS.md` (+ managed mirror) carries a pointer to `§ Release process` so the procedure is reachable from the instruction grounding (C59-5).
5. `harness lint --quiet` passes on self-host (full suite), including any composed-mirror lockstep checks.
6. CHANGELOG entry present.
7. Plan-vs-implementation review (GPT-5.5 gate) returns GO.

## Risks + open questions

| # | Risk | Mitigation |
|---|---|---|
| R1 | Root and `template/composed/OPERATIONS.md` drift | Update both in the same PR; rely on the existing composed-blocks lockstep lint. |
| R2 | Documenting admin-merge reads as a general bypass license | C59-3 scopes it narrowly to solo-orchestrator content/release PRs where both substantive reviews passed; contrast with the human-approval expectation otherwise. |
| R3 | Section-anchor slug mismatch breaks the CHANGELOG link again | Verify the rendered GitHub anchor slug (`release-process`) matches the heading exactly during implementation. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: yoga-ah) | d3ce6303d7a8 | 2026-06-03T23:05:32Z | Go-with-amendments | Facts verified (dangling link, no Release-process section, workboard-only admin bypass). Amendment applied: C59-4 scope now includes INSTRUCTIONS.md. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1: Draft `OPERATIONS.md § Release process` (C59-1) — ordered cut: sanity check → file bumps (`package.json` + `package-lock.json`) → CHANGELOG promote → README pins → plan-vs-impl gate → Phase-2 review → Copilot engage → CI → squash-merge → `git tag` + `gh release create` on squash SHA → consumer notification via `harness cross-repo open-issue`; cross-ref `§ SemVer policy`. | pending | omni-ah | agent-id=omni-ah \| role=implementer \| report-status=pending \| learnings=0 |
| T2: Mirror new section into `template/composed/OPERATIONS.md` (lockstep). | pending | omni-ah | agent-id=omni-ah \| role=implementer \| report-status=pending \| learnings=0 |
| T3: Add content-PR admin-merge subsection (C59-3) — scoped narrowly: solo orchestrator + both substantive reviews passed (GPT-5.5 `Go` + Copilot review attached at HEAD); contrast with workboard-only fallback. | pending | omni-ah | agent-id=omni-ah \| role=implementer \| report-status=pending \| learnings=0 |
| T4: Fix dangling `CHANGELOG.md` link (C59-2) — point at `OPERATIONS.md#release-process`; verify GitHub anchor slug. | pending | omni-ah | agent-id=omni-ah \| role=implementer \| report-status=pending \| learnings=0 |
| T5: Add `INSTRUCTIONS.md` quick-reference pointer to `§ Release process` (C59-5) + mirror in `template/managed/INSTRUCTIONS.md`. | pending | omni-ah | agent-id=omni-ah \| role=implementer \| report-status=pending \| learnings=0 |
| T6: `CHANGELOG.md` `[Unreleased]` entry citing the new release-process docs. | pending | omni-ah | agent-id=omni-ah \| role=implementer \| report-status=pending \| learnings=0 |
| Close-out: docs + restart state — update `WORKBOARD.md` (remove CS59 row), refresh `CONTEXT.md` if state changed, ensure managed/composed lockstep mirrors are byte-identical. | pending | omni-ah | agent-id=omni-ah \| role=implementer \| report-status=pending \| learnings=0 |
| Close-out: learnings + follow-ups — file any new learnings to `LEARNINGS.md`; surface any release-procedure gaps as planned CS follow-ups. | pending | omni-ah | agent-id=omni-ah \| role=implementer \| report-status=pending \| learnings=0 |

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.7-1m-internal |
| Reviewer model | gpt-5.5 |
| Implementer agent | omni-ah |
| Reviewer agent | rubber-duck (orchestrator: omni-ah) |
| Notes | Implementer + reviewer model independence per REVIEWS § 2.3 (claude-opus-4.7-1m-internal ≠ gpt-5.5). CS59 is pure docs — not on the high-risk CS list. |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
