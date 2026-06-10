# CS58 — Plan-side fact-claim verification (apply LRN-139)

**Status:** active
**Owner:** omni-ah (Copilot CLI / Claude Opus 4.7 1M)
**Branch:** cs58/plan-side-fact-claim-verification
**Started:** 2026-06-09
**Closed:** —
**Filed by:** CS54 close-out (2026-06-03 by `yoga-ah`). Applies **LRN-139** (`LEARNINGS.md` § LRN-139, status `open`), surfaced during CS54 implementation when task T1's plan-asserted "stray triple-backtick fence at `template/composed/OPERATIONS.md:680`" turned out to be a false positive that survived 17 rubber-duck plan-review rounds before being caught at implementation time.

Additionally consumes **LRN-158** (`LEARNINGS.md` § LRN-158, status `open`) — surfaced during CS70 (2026-06-09) when a release-cut plan asserted "v0.7.0 has been bumped but never tagged or shipped" and 3 GPT-5.5 plan-review rounds (R1/R2/R3 at hash `7ab92e2eb150`) accepted the premise without anyone running `gh release list` / `gh api repos/<owner>/<repo>/releases`. Execution then discovered the tag + a published GitHub Release had existed at the asserted commit for 6 days. This is the same fact-claim verification gap LRN-139 surfaced, but on a non-file/line surface (release/tag state) — included here so the shipped doctrine covers state-of-the-world assertions, not only `file:line` citations. LRN-159 is a tooling consequence and lives with CS59/CS67; CS58 only needs to keep the doctrine general enough to cover the LRN-158 class.
**Depends on:** None hard. Builds on the REVIEWS.md § 2.6a F1–F5 fact-claim verification doctrine shipped in PR #218 (currently scoped to PR-side reviews of shipped code). May claim independently.

## Goal

Extend the REVIEWS.md § 2.6a "F1–F5 fact-claim verification" doctrine — currently applied only to PR-side rubber-duck reviews of shipped code — to **plan reviews**, so that file/line citations and factual claims in a CS plan are verified against the actual codebase before a plan-review "Go" verdict is valid.

## Background

REVIEWS.md § 2.6a (shipped in PR #218) requires PR-side rubber-duck reviewers to verify that every factual claim in a diff matches the cited shipped surface (F1: flags exist; F2: paths exist; F3: doctrine wording matches; F4: LRN/CS scope not overstated; F5: cross-doc consistency). That doctrine closed the dominant failure mode for docs/prose PRs.

LRN-139 identified the symmetric gap on the **planning** side: a CS plan can assert "line 680 has a stray fence with no opener" with no opener-matching-close check, and a sequence of plan-review rounds will rubber-stamp the claim because plan reviewers were never told to verify the plan's factual assertions about the codebase. In CS54 this produced a phantom task (T1) that was only caught when an implementer tried to apply the "fix" and broke the composed-blocks lint. 17 plan-review rounds at hash `5c40242b24c7` passed the false claim through.

**LRN-158 (CS70, 2026-06-09) — the same failure mode on release/tag state.** CS70 was filed as a two-phase release CS on the premise that `v0.7.0` had been bumped in `package.json` + CHANGELOG (at CS54's close-out, commit `53e1a09`, 2026-06-03) but never tagged or shipped as a GitHub Release. The plan went through 3 GPT-5.5 plan-review rounds (R1 Needs-Fix → R2 Needs-Fix → R3 Go, hash `7ab92e2eb150`) and was filed as PR #275 — all without the planner or any reviewer ever running `gh release list` or `gh api repos/<owner>/<repo>/releases --jq '.[]'` to verify the premise. Execution discovered the tag + a published Release had existed at `53e1a09` since the same day CS54 closed; Phase 1 reduced to deleting a stale duplicate Draft sibling. The failure surface is not `file:line` — it is **state-of-the-world** (does the tag/release exist?). The implication for CS58: F1–F5 plan-side doctrine must be worded broadly enough that "verifiable factual claim" includes state-of-the-world assertions verifiable via CLI (e.g. `gh release list`, `gh tag`, `git ls-remote --tags origin`, `gh api repos/.../releases`), not only file/line citations. CS70's plan-side audit-before-build precondition lives in LRN-158's disposition under "(3) CS70's planning skeleton" — CS58's shipped doctrine should land the corresponding REVIEWS.md / OPERATIONS.md wording.

The plan-review attestation procedure lives in `OPERATIONS.md § Plan review attestation procedure (CS35b)` and is enforced by `scripts/check-clickstop-plan-review.mjs`. The fix is primarily doctrine (reviewer prompt requirements), optionally reinforced by reviewer-prompt scaffolding — NOT a new mechanical linter, because fact-claim verification is inherently semantic.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C58-1 | Doctrine location | Add a plan-side fact-claim verification subsection to `REVIEWS.md` adjacent to (or cross-referenced from) § 2.6a, and reference it from `OPERATIONS.md § Plan review attestation procedure`. | Keeps the F1–F5 doctrine in one canonical place (REVIEWS.md) with both PR-side and plan-side scopes clearly delineated. |
| C58-2 | Required plan-review checks | A plan-review "Go" is only valid when the reviewer has verified, for every file/line citation across ALL reviewer-consumed plan sections (Background, Decisions, Deliverables, Exit criteria, Risks — per OPERATIONS.md § Plan review attestation procedure, not only Decisions/Deliverables/Tasks): (a) the cited path exists; (b) the cited line/region actually contains what the plan asserts (e.g. a "stray fence" claim requires confirming there is no matching opener); (c) any `--flag` named exists; (d) LRN/CS scope summaries do not overstate the source. | Mirrors F1–F5 for the planning surface; directly prevents the CS54 T1 class of phantom task. |
| C58-3 | No new mechanical linter | Do NOT add a new automated linter that parses plan prose for file:line claims and checks them. Encode the requirement as reviewer-prompt doctrine + a plan-review checklist item instead. | Fact-claim verification is semantic and citation formats vary; a brittle regex linter would produce false positives/negatives and add maintenance cost without closing the semantic gap. |
| C58-4 | LRN-139 disposition | Transition LRN-139 `open` → `applied` at close-out, with a prose disposition referencing this CS and the shipped doctrine. | Standard learnings lifecycle; closes the loop on the surfaced gap. |

## Deliverables

1. **`REVIEWS.md`** — new/extended subsection documenting plan-side fact-claim verification (F1–F5 applied to plan reviews) per C58-1 + C58-2, explicitly scoping verification to every reviewer-consumed plan section (Background, Decisions, Deliverables, Exit criteria, Risks), with the CS54 T1 incident cited as the source example. Mirror to `template/composed/REVIEWS.md` if that is the managed source.
2. **`OPERATIONS.md`** — cross-reference from `§ Plan review attestation procedure (CS35b)` to the new REVIEWS.md doctrine, and add the fact-claim verification expectation to the plan-review reviewer-prompt requirements.
3. **`LEARNINGS.md`** — LRN-139 transitioned `open` → `applied` per C58-4.
4. **CHANGELOG.md** — entry under the next version's `[Unreleased]` block.
5. **(Optional) reviewer-prompt scaffold** — if a canonical plan-review dispatch prompt template exists, add the fact-claim verification clause to it.

## User-approval gates

- **G-release** if CS58 ships in its own tag. Standard pattern.

## Exit criteria

1. Plan-side fact-claim verification doctrine present in REVIEWS.md (C58-1/C58-2) with the CS54 T1 incident cited.
2. OPERATIONS.md plan-review procedure cross-references the doctrine and states the reviewer-prompt requirement (C58-2).
3. LRN-139 status is `applied` with a disposition paragraph referencing CS58.
4. `harness lint --quiet` passes on self-host (full suite), including any composed-mirror lockstep checks.
5. CHANGELOG entry present.
6. Plan-vs-implementation review (GPT-5.5 gate) returns GO.

## Risks + open questions

| # | Risk | Mitigation |
|---|---|---|
| R1 | Doctrine without enforcement is ignored | Bake the requirement into the plan-review reviewer-prompt template (C58-3/D-5) so every dispatched plan review carries the instruction verbatim. |
| R2 | Over-broad doctrine slows plan reviews | Scope the requirement to file/line citations and named flags actually present in the plan — not every prose sentence. |
| R3 | REVIEWS.md is composed/managed and must stay in lockstep | Update both root and `template/composed/REVIEWS.md` in the same PR; rely on the existing composed-blocks lockstep lint. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: yoga-ah) | 53f604b8bc4c | 2026-06-03T18:09:33Z | Go-with-amendments | C58-2 broadened to all reviewer-consumed sections (Background/Decisions/Deliverables/Exit/Risks) per OPERATIONS+LRN-139; amendment applied. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1: extend REVIEWS.md § 2.6a with plan-side F1–F5 subsection (cite CS54 T1 + CS70 LRN-158 incidents); cover both `file:line` AND state-of-the-world claims (verifiable via `gh release list`, `gh api`, etc.) | pending | omni-ah | C58-1 + C58-2; broaden scope per LRN-158 |
| T2: mirror REVIEWS.md edit into `template/composed/REVIEWS.md` (composed-blocks lockstep) | pending | omni-ah | C58-1 deliverable 1 |
| T3: cross-reference from `OPERATIONS.md § Plan review attestation procedure (CS35b)` → new REVIEWS.md subsection; add the fact-claim verification expectation to plan-review reviewer-prompt requirements | pending | omni-ah | C58-1 + deliverable 2 |
| T4: mirror OPERATIONS.md edit into `template/composed/OPERATIONS.md` (composed-blocks lockstep) | pending | omni-ah | C58-1 + deliverable 2 |
| T5: transition LRN-139 `open` → `applied` with prose disposition citing CS58 | pending | omni-ah | C58-4 + deliverable 3 |
| T6: (NEW per LRN-158 background extension) transition LRN-158 `open` → `applied` with prose disposition noting the plan-side doctrine ships in CS58; CS59/CS67 dispositions remain unchanged (release-process docs + verb still own their parts) | pending | omni-ah | LRN-158 plan-side ask only — content/tooling asks stay with CS59/CS67 |
| T7: CHANGELOG.md `[Unreleased]` entry citing plan-side fact-claim verification doctrine | pending | omni-ah | deliverable 4 |
| T8: (optional) reviewer-prompt scaffold update if a canonical plan-review dispatch template exists | pending | omni-ah | deliverable 5 |
| T9: harness lint --quiet — full suite incl. composed-blocks lockstep | pending | omni-ah | Exit criterion 4 |
| T10: open content/release PR; pass A4 review-log currency + Copilot review | pending | omni-ah | Standard content-PR flow |
| T11: Plan-vs-implementation review gate (GPT-5.5) | pending | rubber-duck (orchestrator: omni-ah) | Exit criterion 6 |
| T12: close-out (rename active→done; update WORKBOARD/CONTEXT/LEARNINGS) | pending | omni-ah | Standard close-out per OPERATIONS § Close-out |

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.7-1m-internal |
| Reviewer model | gpt-5.5 |
| Implementer agent | omni-ah |
| Reviewer agent | rubber-duck (orchestrator: omni-ah) |
| Notes | Implementer + reviewer model independence per REVIEWS § 2.3 (claude-opus-4.7-1m-internal ≠ gpt-5.5). CS58 is process doctrine — not on the high-risk CS list. |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
