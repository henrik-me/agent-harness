# CS58 — Plan-side fact-claim verification (apply LRN-139)

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** CS54 close-out (2026-06-03 by `yoga-ah`). Applies **LRN-139** (`LEARNINGS.md` § LRN-139, status `open`), surfaced during CS54 implementation when task T1's plan-asserted "stray triple-backtick fence at `template/composed/OPERATIONS.md:680`" turned out to be a false positive that survived 17 rubber-duck plan-review rounds before being caught at implementation time.
**Depends on:** None hard. Builds on the REVIEWS.md § 2.6a F1–F5 fact-claim verification doctrine shipped in PR #218 (currently scoped to PR-side reviews of shipped code). May claim independently.

## Goal

Extend the REVIEWS.md § 2.6a "F1–F5 fact-claim verification" doctrine — currently applied only to PR-side rubber-duck reviews of shipped code — to **plan reviews**, so that file/line citations and factual claims in a CS plan are verified against the actual codebase before a plan-review "Go" verdict is valid.

## Background

REVIEWS.md § 2.6a (shipped in PR #218) requires PR-side rubber-duck reviewers to verify that every factual claim in a diff matches the cited shipped surface (F1: flags exist; F2: paths exist; F3: doctrine wording matches; F4: LRN/CS scope not overstated; F5: cross-doc consistency). That doctrine closed the dominant failure mode for docs/prose PRs.

LRN-139 identified the symmetric gap on the **planning** side: a CS plan can assert "line 680 has a stray fence with no opener" with no opener-matching-close check, and a sequence of plan-review rounds will rubber-stamp the claim because plan reviewers were never told to verify the plan's factual assertions about the codebase. In CS54 this produced a phantom task (T1) that was only caught when an implementer tried to apply the "fix" and broke the composed-blocks lint. 17 plan-review rounds at hash `5c40242b24c7` passed the false claim through.

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
| (populated at claim time per OPERATIONS.md § Claim) | planned | — | — |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
