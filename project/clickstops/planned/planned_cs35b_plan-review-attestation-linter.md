# CS35b — Plan-review attestation linter (`check-clickstop-plan-review`) + retroactive grandfathering

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** Pre-CS35b disposition. Authored 2026-05-12 by `yoga-ah`. New CS inserted between CS35 and CS36 in the v0.4.0 arc to close a gap exposed when PR #147 (the original 9-file CS arc filing) merged without any documented GPT-5.5 review of the planned files. The user observed: "I thought there was a linter in place to ensure and guard against plans going into the repo without GPT-5.5 review" — confirmed missing; this CS lands it.
**Depends on:** [CS35](planned_cs35_enforcement-doctrine-and-planning-locality.md) (doctrine front-load + planning-locality linter must already exist; CS35b extends the same enforcement layer).

## Goal

Three deliverables that together close the "plan landed without independent review" gap:

1. **Doctrine + schema**: every `planned/*.md` and `active/*.md` clickstop file MUST carry a `## Plan review` section listing one or more attestation rows. Each row records the round (`R1` / `R2` / ...), the reviewer model, the reviewer agent identity, an ISO-8601 UTC timestamp, a verdict (`Go | Go-with-amendments | Needs-Fix`), and a short findings recap. The latest row's verdict MUST be `Go` or `Go-with-amendments` for the file to be mergeable.
2. **Linter**: `scripts/check-clickstop-plan-review.mjs` — extends the existing `check-clickstop.mjs` family. Validates schema shape, enumerates reviewer-model independence (reviewer model MUST NOT be in any model the orchestrator claims to use, per C35-4), enforces latest-verdict gate. Runs in `harness lint`.
3. **Retroactive attestation**: append a `## Plan review` section to each of the 10 already-filed planned files (CS35, CS35b itself, CS36, CS37, CS38a, CS38b, CS39, CS40, CS41, CS42) recording the GPT-5.5 review that took place 2026-05-12 plus the amendment-round review that gates this PR — so the linter goes green on first run.

This is a v0.4.0 arc CS — it ships in the same release as CS35–CS39. Consumers of the harness inherit the linter automatically via `harness sync`.

## Background

The original 9-CS filing (PR #147) merged without any `## Plan review` attestation on the planned files. A GPT-5.5 review WAS dispatched and produced 8 blocking + 3 non-blocking findings (which became the amendments PR currently in flight), but nothing in the repo records that the review happened, nor would a future CS author be blocked from merging plans without one.

Self-host green is necessary but not sufficient (per the LRN reservation in C35-16): the harness's own discipline of "always rubber-duck a plan before filing" is implicit doctrine that breaks down once it isn't enforced. CS35 ships planning-locality (preventing plans from leaking out of CS files); CS35b ships review-attestation (preventing plans from landing without independent critique).

The schema mirrors the existing `## Plan-vs-implementation review` close-out gate (CS03b, enforced at `scripts/check-clickstop.mjs:272-297`), but for the *planning* phase rather than the close-out phase. Both gates produce the same shape of artefact: a structured table the linter can parse and a verdict-state the linter can gate on.

The user-stated requirement: "this is the same as the harness needs to ship with" — so the linter is a managed deliverable that propagates to consumers (e.g., sub-invaders) via the next harness sync.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C35b-1 | Schema location | A `## Plan review` H2 section appears AFTER `## Decisions` and BEFORE `## Deliverables` (or, if Deliverables is first, immediately before Tasks) — placement chosen to keep the attestation visually adjacent to the decision table it gates. | Easy to find for both human and machine readers. |
| C35b-2 | Schema rows | Markdown table with header `\| Round \| Reviewer model \| Reviewer agent \| Timestamp (UTC) \| Verdict \| Findings recap (≤200 chars) \|`. At least one row required. Rows append-only (R1 first, then R2, R3, ... after each amendment round). | Mirrors `## Model audit` shape (per C35-18); append-only history preserves audit trail. |
| C35b-3 | Round semantics | `R1` = initial plan review (when the file is first filed). `Rn` (n≥2) = post-amendment review (when the file's decisions/deliverables are materially changed). Trivial typo/wording edits do NOT trigger a new round; material edits to decisions/exit-criteria/deliverables DO. The linter enforces "if the file's `## Decisions` or `## Deliverables` section content changed since the last attestation row's timestamp (compared via git blame), a new attestation row is required". | Avoids attestation churn on cosmetic edits while catching substantive plan changes. |
| C35b-4 | Independence invariant | `Reviewer model` MUST NOT appear in `Implementer model` for the same CS file (cross-checked against `## Model audit` if present in the file, or against orchestrator-declared model from `harness.config.json.templating` if not). Identical to A3-style independence per C35-4. | Same axis of independence as code-review gates; same axis of failure mode. |
| C35b-5 | Verdict enum | `Go | Go-with-amendments | Needs-Fix`. Mergeable verdicts: `Go`, `Go-with-amendments`. Blocking verdict: `Needs-Fix` (latest row). The linter exits 1 if the latest row is `Needs-Fix`. | Three states cover the realistic outcomes; matches the existing `## Plan-vs-implementation review` vocabulary (CS03b). |
| C35b-6 | Linter file | `scripts/check-clickstop-plan-review.mjs`. Reuses `lib/doc-schema.mjs` helpers (`assertHeadings`, `extractSectionBody`, `headingAnchor`) for consistency with `check-clickstop.mjs`. | Stays in the existing linter family; same testing patterns. |
| C35b-7 | Linter scope | Runs against `project/clickstops/planned/*.md` AND `project/clickstops/active/*.md`. Skips `done/*.md` (close-out gate `## Plan-vs-implementation review` already handles that surface). | Targets the gap precisely; no overlap with the existing close-out gate. |
| C35b-8 | `harness lint` integration | Add `check-clickstop-plan-review` to the linter registry (whatever `harness lint` calls — see `bin/harness.mjs cmdLint`). Default-on. | Same mechanism as every other clickstop linter. |
| C35b-9 | `harness pr-evidence` integration | CS36's pr-evidence aggregator gains a NEW gate `A6 — plan-review attestation present on planned/active CS files in the PR diff`. CS35b registers `A6` and provides the predicate; CS36 consumes it (CS35b updates CS36's `gate_set` default to include `A6`, and CS36's deliverables/exit-criteria reference `A6`). The aggregator skips `A6` when no planned/active CS file is in the diff. | Catches the gap at PR-time, not just at `harness lint`-time. CS36 is the natural home for the registration; CS35b is the natural home for the predicate. |
| C35b-10 | Backward compatibility (one-cycle warn) | First release (v0.4.0): the linter exits 0 with a stderr WARNING for files that lack the section, controlled by a `--strict` flag (default `false` in v0.4.0). v0.5.0 (CS42 release-cut) flips `--strict` default to `true` (linter exits 1 on missing section). The warning includes the exact section template to paste in (per C35b-12). | Prevents an immediate v0.4.0 break for any latent files we missed in retroactive grandfathering. Migration ramp matches the `--strict-agent-columns` pattern in CS41. |
| C35b-11 | Skip-reasons (CI-only) | The `--skip-reasons` flag from C35-19 applies to A6 in pr-evidence: when `workboard-only` is in the skip set, A6 skips (workboard-only PRs don't carry plan content). When `bot-author` is in the skip set, A6 still runs (bots can edit planned files; a missing attestation is still a violation). When `fork-source` is in the skip set, A6 still runs (read-only gate). | Centralized skip semantics per C35-19. |
| C35b-12 | Section template (copy-pasteable) | Provide a verbatim block in OPERATIONS.md § Plan review attestation procedure: <pre><br/>## Plan review<br/><br/>\| Round \| Reviewer model \| Reviewer agent \| Timestamp (UTC) \| Verdict \| Findings recap (≤200 chars) \|<br/>\|---\|---\|---\|---\|---\|---\|<br/>\| R1 \| &lt;model-id&gt; \| &lt;agent-id (or "rubber-duck dispatched")&gt; \| YYYY-MM-DDThh:mm:ssZ \| Go \| &lt;short summary&gt; \|<br/></pre> | Removes any "what does the section look like?" friction; orchestrator pastes + fills six fields. |
| C35b-13 | Retroactive attestation source | All 10 planned files (CS35, CS35b, CS36, CS37, CS38a, CS38b, CS39, CS40, CS41, CS42) get an `R1` row recording the GPT-5.5 review of 2026-05-12 (verdict: `Needs-Fix` for the 8 receiving findings, `Go` for CS42 which had no findings) PLUS an `R2` row recording the post-amendment GPT-5.5 review that gates this CS35b's PR (verdict expected: `Go` or `Go-with-amendments`). The R1 row's "Findings recap" cites the issue/PR/comment URL where the original critique lives so future readers can audit. | Honest history; no rewriting the past. |
| C35b-14 | Honor-system caveat | The linter cannot verify the claimed reviewer model actually ran. Like B1 trailers, this is honor-system attestation: shape enforces deliberation, orchestrator discipline + plan-vs-impl close-out review catch lies. ADR-NNN documents the limitation; future CS may add cryptographic evidence (e.g., signed transcripts) but not in this CS. | Same trust model as B1 commit trailers; explicit so reviewers know what they are and aren't getting. |
| C35b-15 | Where the doctrine lives | OPERATIONS.md § "Plan review attestation procedure" (new section, immediately after § Plan-vs-implementation review (close-out gate) for symmetry). The section explains: when to dispatch the reviewer; how to interpret verdict; how to amend on Needs-Fix; the section template (C35b-12). | Doctrine + procedure colocated; matches the existing close-out section's pattern. |

## Plan review

| Round | Reviewer model | Reviewer agent | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|
| R1 | gpt-5.5 | rubber-duck dispatched (orchestrator: yoga-ah / claude-opus-4.7-xhigh) | 2026-05-12T00:00:00Z | Needs-Fix (pending) | New CS authored 2026-05-12 in response to user-identified gap; awaiting GPT-5.5 review of this file alongside the CS35–CS41 amendment batch. Final verdict to be recorded in R2 row pre-merge. |

(R2 row to be appended after the amendments-PR GPT-5.5 review; must be `Go` or `Go-with-amendments` for merge.)

## Deliverables

1. **`scripts/check-clickstop-plan-review.mjs`** (new) per C35b-6/7. Implements all schema, independence, and verdict-gating logic. Supports `--dir <path>`, `--strict {true|false}` (default `false` per C35b-10), `--quiet`, `--help`. Exit codes: 0 = pass / warn-only, 1 = strict-mode failure or latest-verdict-Needs-Fix, 2 = bad usage.
2. **`tests/check-clickstop-plan-review.test.mjs`** (new) per LRN-094 (tests use `os.tmpdir()`, NEVER REPO_ROOT). Minimum 12 cases:
   - clean planned file with R1 Go
   - clean active file with R1 Go-with-amendments
   - missing `## Plan review` section + `--strict=false` warns and exits 0
   - missing `## Plan review` section + `--strict=true` fails and exits 1
   - latest row Needs-Fix fails (regardless of `--strict`)
   - reviewer model overlap with implementer model fails
   - malformed table (wrong column count) fails
   - non-ISO timestamp fails
   - findings recap > 200 chars fails
   - R1 + R2 happy path (latest row decides verdict)
   - done file is skipped (linter is no-op on done/)
   - material edit to `## Decisions` since last attestation requires new round (uses git blame)
3. **`bin/harness.mjs`**: register the new linter in the `cmdLint` registry. Document in `--help`. Add the new check to `harness lint --quiet` baseline output (expected `26/0/3` after CS35b lands, was `25/0/3`).
4. **OPERATIONS.md** + **template/composed/OPERATIONS.md**: add new section "Plan review attestation procedure" per C35b-15 + C35b-12. Cross-link from § Mandatory briefing preamble + § Plan-vs-implementation review (close-out gate).
5. **REVIEWS.md** + **template/composed/REVIEWS.md**: add `## Plan review` section schema reference (mirroring the existing `## Model audit` schema reference) so consumer agents can find it.
6. **Retroactive attestations** (per C35b-13): append `## Plan review` sections to all 10 already-filed planned files in this CS's content PR. R1 row records the GPT-5.5 critique of 2026-05-12; R2 row records the post-amendment review (added in the same commit batch as the linter, after rubber-duck pass).
7. **CS36 dependency update**: edit `planned_cs36_pr-evidence-fs-and-git-linters.md` to add `A6` to its gate set + reference the predicate from `scripts/check-clickstop-plan-review.mjs` (predicate exposed as a library function so CS36's aggregator can call it). Also update CS36's exit criteria to assert `A6` is wired.
8. **CHANGELOG.md** `[Unreleased] / Added`: "`check-clickstop-plan-review` linter: enforces `## Plan review` attestation on `planned/*.md` and `active/*.md` clickstops; warn-only in v0.4.0, strict in v0.5.0 (per CS35b)."
9. **`scripts/check-clickstop.mjs` doc-comment update**: add a note pointing to `check-clickstop-plan-review.mjs` for the planning-phase counterpart of the existing close-out gate.

## Sub-agent fan-out

1 sub-agent (the linter is a single coherent deliverable; orchestrator handles docs, retroactive attestations, and CS36 cross-edit):

- **SA-1 (`bot35b-plan-review-linter`)** — owns `scripts/check-clickstop-plan-review.mjs` + `tests/check-clickstop-plan-review.test.mjs` + `bin/harness.mjs cmdLint` registration. Exposes the predicate function for CS36 to import. NOT touching OPERATIONS.md / REVIEWS.md / CHANGELOG.md / CS36 file / retroactive attestations.

Orchestrator owns: OPERATIONS.md + REVIEWS.md docs (Deliverables 4, 5); retroactive attestations on the 10 planned files (Deliverable 6); CS36 cross-edit (Deliverable 7); CHANGELOG (Deliverable 8); doc-comment update on existing `check-clickstop.mjs` (Deliverable 9).

## Exit criteria

1. `harness lint --help` lists `check-clickstop-plan-review`.
2. `harness lint --quiet` baseline = `26/0/3` (one new linter passing on the harness's own planned/active files thanks to retroactive attestations).
3. `node --test tests/check-clickstop-plan-review.test.mjs` passes all 12+ cases.
4. `node --test tests/*.test.mjs` total = prior + ≥12.
5. All 10 already-filed planned CS files contain a `## Plan review` section with at least one row whose verdict is `Go` or `Go-with-amendments`.
6. OPERATIONS.md § Plan review attestation procedure exists, contains the verbatim section template, and cross-links from the close-out gate section.
7. CS36's planned file references `A6` in its gate set + exit criteria (CS36 will land the aggregator wiring; CS35b only ensures CS36's plan reflects the new gate).
8. `harness sync --mode=check` clean (no drift introduced by the OPERATIONS.md / REVIEWS.md edits since they go through the composed-file merge).
9. `check-text-encoding` passes (LF-only, no BOM, per harness self-host invariants).
10. Plan-vs-implementation review `Go` (close-out gate).

## Risks + open questions

- **R1 (low):** Material-edit detection via git blame (C35b-3) may produce false positives on rebase/squash-merge because blame lines change. Mitigation: blame uses `--follow` and `-w` (ignore whitespace); test fixture covers a squash scenario explicitly. If false positives prove common, fall back to a simpler "any change in `## Decisions` H2 section since last `## Plan review` row's timestamp" heuristic.
- **R2 (low):** Honor-system attestation per C35b-14 — the linter trusts the model claim. A bad-faith actor can paste any model name. Mitigation: same trust model as B1 trailers (the existing harness pattern); ADR-NNN documents explicitly so reviewers don't assume cryptographic strength.
- **R3 (medium):** The `--strict=false → --strict=true` migration in v0.5.0 (CS42) needs explicit release-note callout or consumers will be surprised. Mitigation: CS42 release-cut PR includes a "BREAKING in v0.6.0" or "STRICT-MODE in v0.5.0" section; CS35b's CHANGELOG entry mentions the migration ramp explicitly.
- **R4 (low):** The retroactive attestations on 10 files create a large content PR that might trigger workboard auto-approve regex mismatch. Mitigation: this CS35b work is a normal `csNN/<slug>` content branch (not workboard), so it goes through normal PR review. CHANGELOG entry summarizes scope.
- **OQ1:** Should the linter also enforce a maximum age on `R1` rows (e.g. "if the file has been planned > 90 days, require a fresh attestation before claim")? **Default:** no — out of scope; can be added in a future CS if staleness becomes an issue. Filed as a candidate for LEARNINGS.md if observed.
- **OQ2:** Should consumers (e.g. sub-invaders) be required to opt in via `harness init --enable-plan-review-linter`, or is it always-on? **Default:** always-on (it's filesystem-only, no PR context required, and the warn-not-error mode in v0.4.0 means consumers won't be broken by adoption). CS41-style default-flip not needed.

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time) | planned | — | — |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out)_
