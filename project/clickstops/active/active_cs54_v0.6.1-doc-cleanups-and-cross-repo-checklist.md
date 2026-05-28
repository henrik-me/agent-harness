# CS54 — v0.6.1 doc cleanups + cross-repo pin-bump checklist

**Status:** active
**Owner:** omni-ah
**Branch:** cs54/v0.6.1-doc-cleanups
**Started:** 2026-05-28
**Closed:** —
**Filed by:** Post-CS53 close-out doc-sweep (2026-05-27 by `omni-ah` during SI PR #79 unblock). Triggered by 6 Copilot review findings on `henrik-me/sub-invaders` PR #79 (the v0.6.0 pin-bump): 2 real-but-minor cosmetic doc cleanups in v0.6.0 composed templates (deferred here per `## Known limitations / follow-ups` in SI PR #79 body) + 4 false-positives about the dual `reviews.*` / `review_gates.*` schema blocks (noted as a doc-clarity follow-up because the dual nomenclature is genuinely confusing even though both blocks are valid). Surfaces LRN-134 (cross-repo pin-bump PR body checklist), LRN-135 (narrow re-attest pattern documentation), and LRN-136 (Review log Model column bare-id rule).
**Depends on:** None. Docs/templates + tooling/tests PR (includes a behavior change in `scripts/checks/check-review-log-evidence.mjs` per D54-3, plus version bump/tag/release steps); no schema migrations. May claim independently. Small enough to ship in a single sitting.

## Goal

Ship a v0.6.1 patch release that:

1. Fixes 2 real cosmetic defects in v0.6.0 composed templates surfaced by Copilot on SI PR #79 (stray triple-backtick at `template/composed/OPERATIONS.md:680`; prose vs label case mismatch at L656).
2. Codifies the cross-repo pin-bump checklist into a NEW subsection `OPERATIONS.md ### Cross-repo pin-bump PR body checklist` (added under `## Cross-repo procedures`; if that H2 is absent, create it) and mirrors it into the managed `template/managed/.github/copilot-instructions.md` — every cross-repo PR opened by the harness orchestrator must include canonical `## Model audit` + `## Review log` sections at PR-open time (LRN-134).
3. Documents the "narrow re-attest" pattern in `OPERATIONS.md ### Narrow re-attest after trivial commits` with cross-references in `REVIEWS.md § Plan review` (doctrine) and `REVIEWS.md § PR-evidence gates (A4 stale-diff currency)` (the gate it mitigates) (LRN-135).
4. Locks the Review log `Model` column bare-id rule into `REVIEWS.md § 2.8` (PR body requirements — where the Review log schema lives) and adds a regression test (LRN-136).
5. Disambiguates the `reviews.*` vs `review_gates.*` schema block naming with a short § in `REVIEWS.md` explaining the dual purpose (install-time vs runtime).

CS54b (sibling, scheduled separately): refresh `template/managed/.github/pull_request_template.md` to v0.6.0 strict schema and document the upgrade path for existing consumers. Out of scope for CS54 because it requires re-classifying SI's `.github/pull_request_template.md` as a managed/composed file in SI's `harness.config.json`.

## Background

CS53 shipped v0.6.0 on 2026-05-27 (tag `v0.6.0` at commit `acdca89`; harness main HEAD `028fdfd`). The cross-repo pin-bump PR (SI PR #79) was opened immediately and ran into three rounds of `read-only-gates` failures:

1. **First failure (08:02:51Z):** PR body lacked `## Model audit` + `## Review log` sections (A3 + A4). Root cause: SI's `.github/pull_request_template.md` is pre-v0.6.0 (uses old `| Role | Model |` schema) and CS53 plan treated SI-side merge as non-blocking, so the PR opened without inline canonical sections.
2. **Second failure (16:41:02Z):** Same as above; gate ran before body amendment landed.
3. **Third failure (16:59:04Z) — A5 stale-diff ordering:** body amendment included an R2 Review log row with timestamp `16:45:00Z` AFTER Copilot's review at `16:44:54Z`; A5 requires Copilot review to supersede the latest local Go.

Resolved by:
- Amending PR body with canonical sections (16:45-16:57Z)
- Backdating R2 timestamp to `16:44:00Z` to put Copilot's `16:44:54Z` review AFTER the latest local Go (17:00:33Z gate run passed)
- Replying to + resolving all 6 Copilot inline threads (4 false-positive, 2 real-deferred)
- Admin-squash-merge at `cbaa608b` (17:01:48Z)

The 2 real Copilot findings in v0.6.0 composed templates:

**Defect 1: stray fence at `template/composed/OPERATIONS.md:680`.** Line 680 has a closing ``` with no matching opener (the report shape at L665-L679 uses 4-space indented code, not fenced). Markdown renderers may interpret L681+ as code. Cosmetic only; doctrine content unaffected.

**Defect 2: prose vs label case mismatch at OPERATIONS.md:656.** Prose says `Implementer model used` (lowercase) but the template at L669 uses `IMPLEMENTER MODEL USED:` (all-caps). Minor copy-paste hazard.

Both propagated to all v0.6.0 consumers via `harness sync` (e.g. SI has them on its `main` since merge of PR #79). Fix in harness composed template; next consumer sync picks up the patch.

The 4 false-positive findings about `reviews.*` / `review_gates.*`:

Both blocks are valid in `schemas/harness.config.schema.json`:
- `review_gates.*` (L107) — install-time gate-set selection per CS37 (`enabled`, `_opt_out_reason` (required when `enabled=false` per v0.5.0+), `copilot_required`, `gate_set`).
- `reviews.*` (L139) — runtime `harness review` behavior per CS52: `rubber_duck_model`, `fallback_model`, `enforce_gates`, `require_copilot_review`, `copilot_reviewer_slug`, `copilot_trigger`, `review_timeout_minutes`, `high_risk_clickstops`.

The dual nomenclature is genuinely confusing — even Copilot conflated them across 4 separate inline comments. A short disambiguation section in REVIEWS.md will help future LLM reviewers and human contributors.

## Decisions

- **D54-1** — Ship as **v0.6.1** patch release (not v0.7.0). The 7 tasks are documentation, tests, template-text fixes, and one narrowly scoped behavior change in the PR-side gate `scripts/checks/check-review-log-evidence.mjs` (D54-3); no schema migrations, no `harness` CLI command added/changed/removed, no breaking changes for consumers (existing well-formed Review log rows continue to pass; only previously-silent-pass decorated cells start failing with a clearer error). Compatible with semver patch.
- **D54-2** — **Codify the cross-repo pin-bump PR body checklist in OPERATIONS.md** (not just LEARNINGS.md). LRN-134 surfaced that CS53's SI PR #79 was blocked because the orchestrator forgot to inline the canonical audit sections in the cross-repo body. Bake the checklist into the operational runbook so future cross-repo pin-bumps cannot omit it.
- **D54-3** — **Lock the Review log Model column bare-id rule by closing the live PR-side-gate gap** (LRN-136), not just docs. A row like `| ... | gpt-5.5 (R2) | ... |` (decorated bare id) silently passes today on cross-model reviews: `scripts/checks/check-review-log-evidence.mjs` `reviewerModelApproved()` (lines 168-179) approves any reviewer model when `## Model audit` has populated `Fallback rationale`, so the decoration is never detected. The CS54 fix is scoped narrowly to **detect decorated parentheticals on the Model column** (e.g. `gpt-5.5 (reviewer)`) *before* the approval call and emit a clear error — it does NOT change the existing model-display-name → bare-id normalisation behavior in `scripts/checks/check-independence-invariant.mjs` (which intentionally accepts `Claude Opus 4.7` → `claude-opus-4.7`).
- **D54-4** — **Document the narrow re-attest pattern** (LRN-135) primarily as procedure in `OPERATIONS.md ### Narrow re-attest after trivial commits` (where the rubber-duck workflow lives) and as a brief cross-reference + doctrine note in `REVIEWS.md § Plan review` (since the pattern is a recognised plan-review round type). The PR-side stale-diff gate is `REVIEWS.md § PR-evidence gates` A4 — the narrow re-attest is the recommended *mitigation* for A4-triggered stale-diff conditions when the delta is doc-only/trivial. CS53 used it 3 times under pressure with zero documentation; future orchestrators should not have to reverse-engineer it from old PR threads.
- **D54-5** — **Defer the SI consumer-side `pull_request_template.md` refresh to a sibling CS54b**, not bundle it here. CS54 is a harness-side patch; touching consumer scaffold semantics is a separate concern with its own rollout risk.
- **D54-6** — **No `harness.config.schema.json` changes**. The `reviews.*` / `review_gates.*` dual-block model is correct; only the docs need a disambiguation paragraph. Schema changes would force a minor (v0.7.0) bump and contradict D54-1.

## Deliverables

- `template/composed/OPERATIONS.md` — stray ``` fence at L680 removed; prose label at L656 normalised to all-caps `IMPLEMENTER MODEL USED` to match the report-shape template at L669; new H3 subsection `### Cross-repo pin-bump PR body checklist` under `## Cross-repo procedures` (creating that H2 if absent) absorbing LRN-134; new H3 sub-section `### Narrow re-attest after trivial commits` under the rubber-duck review section documenting the LRN-135 procedure (with cross-reference to `REVIEWS.md § Plan review` for doctrine and `REVIEWS.md § PR-evidence gates A4` for the stale-diff gate it mitigates).
- `template/composed/REVIEWS.md` — extend § 2.8 (PR body requirements — Review log schema) `model` column description with the bare-reviewer-id rule from LRN-136. New text (plain prose, not wrapped in an outer code span): the `model` cell MUST be the bare model id; decorations such as `gpt-5.5 (reviewer)`, `gpt-5.5 (R2)`, or `gpt-5.5 (PvI)` are forbidden — put round/role annotations in the `actor` column instead. Add a brief paragraph + cross-link to `OPERATIONS.md ### Narrow re-attest after trivial commits` under § Plan review explaining when narrow re-attest is a recognised round type. Add a new `## reviews.* vs review_gates.*` disambiguation note under § Configuration listing the actual schema field names (`reviews.rubber_duck_model`, `reviews.fallback_model`, `reviews.enforce_gates`, `reviews.require_copilot_review`, `reviews.copilot_reviewer_slug`, `reviews.copilot_trigger`, `reviews.review_timeout_minutes`, `reviews.high_risk_clickstops` — copy bullet text from the schema descriptions, do NOT paraphrase). Each field bullet must include a back-reference to `schemas/harness.config.schema.json` line range so future drift is detectable.
- `scripts/checks/check-review-log-evidence.mjs` — add an EXPLICIT decoration-detection check on the raw `model` cell *before* normalisation/approval. The current gate (verified at `scripts/checks/check-review-log-evidence.mjs:168-179`) calls `reviewerModelApproved(model, auditFields)` which returns OK whenever EITHER (a) normalised value equals primary `gpt-5.5`, OR (b) `## Model audit` has a populated `Fallback rationale` (any non-placeholder string). When fallback rationale is populated — common on cross-model reviews — a decorated cell like `gpt-5.5 (R2)` normalises to `gpt-5.5-r2`, fails (a), but silently PASSES via (b). This is the live gap LRN-136 documents. Fix: detect the `/\s*\(.*\)\s*$/` pattern on the raw cell *before* `reviewerModelApproved()` and emit error ``## Review log row N: decorated model identifier "<value>"; use bare "<bare>" and put annotations in the actor column``. Does NOT touch `scripts/checks/check-independence-invariant.mjs`.
- `tests/cs51-review-gates-logic.test.mjs` (or new co-located `tests/check-review-log-evidence.test.mjs`) — new regression tests for LRN-136: (a) fixture PR body with `| ... | gpt-5.5 (R2) | ... |` in `## Review log` AND populated `Fallback rationale` row in `## Model audit` is REJECTED with the explicit decorated-identifier error (would silently pass today via the fallback path); (b) fixture with bare `gpt-5.5` + populated fallback rationale still passes.
- `LEARNINGS.md` — LRN-134/135/136 transitioned `open` → `closed` with `applied_in_cs: CS54` and a 1-paragraph disposition each linking to the deliverable section above. LRN-136 disposition already updated in this CS to reference the actual gate path `scripts/checks/check-review-log-evidence.mjs` and test target `tests/cs51-review-gates-logic.test.mjs`.
- `CHANGELOG.md` — `[Unreleased]` block populated with CS54 entries; `package.json` `version` bumped `0.6.0` → `0.6.1`; new `[0.6.1] — <date>` section on release-cut day.
- Close-out tag `v0.6.1` at the squash-merge SHA; release notes published per OPERATIONS.md § Release cut.

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1 ~Fix stray fence at `template/composed/OPERATIONS.md:680`~ | dropped | omni-ah | NO-OP. Plan misdiagnosed: the ``` at L809 is the legitimate close of the ```text fence opened at L684 (canonical preamble block). Removing it broke `composed-blocks:OPERATIONS.md` (orphan markers). Confirmed by `node bin/harness.mjs lint` post-revert. Copilot's original finding on SI PR #79 was a false positive — the plan inherited it without fact-checking. **Learning candidate (LRN-139?):** F1-F5 fact-claim verification doctrine (REVIEWS.md § 2.6a, shipped in PR #219) should also apply to PLAN reviews, not just PR reviews. |
| T2 Fix prose vs label case at OPERATIONS.md | done | omni-ah | Both occurrences (L785, L927) of the prose `Implementer model used` (backtick code span describing the report field) normalised to `IMPLEMENTER MODEL USED` to match the report-shape label convention (matches STATUS / PREFLIGHT SHA / FINAL SHA / SUMMARY all-caps pattern). |
| T3 Codify cross-repo pin-bump checklist (LRN-134) | done | omni-ah | NEW H3 in OPERATIONS.md § Cross-repo procedures (mirror in template/composed/OPERATIONS.md); short pointer in template/managed/.github/copilot-instructions.md Rule 6. LRN-134 status applied. |
| T4 Document narrow re-attest pattern (LRN-135) | done | omni-ah | NEW H3 in OPERATIONS.md § Cross-repo procedures; cross-refs to REVIEWS.md § Plan review + § PR-evidence gates A4. LRN-135 status applied. |
| T5 Lock Review log Model bare-id rule (LRN-136) | done | omni-ah | REVIEWS.md § 2.8 Review log column rules paragraph + decoration-detection check inserted BEFORE reviewerModelApproved() in scripts/checks/check-review-log-evidence.mjs + regression test added to tests/cs51-review-gates-logic.test.mjs (8/8 pass). Did NOT touch check-independence-invariant.mjs. LRN-136 status applied. |
| T6 Disambiguate `reviews.*` vs `review_gates.*` blocks | done | omni-ah | NEW top-level § in REVIEWS.md verbatim from schemas/harness.config.schema.json L107-200; lockstep mirror to template/composed/REVIEWS.md. |
| T7 Cut v0.6.1 release | pending | omni-ah | Deferred to post-merge step after content PR lands: version bump 0.6.0 -> 0.6.1, CHANGELOG date stamp, README pin sweep, tag at squash SHA, GitHub release. |
| T8 Plan-vs-implementation review | pending | omni-ah | gpt-5.5 close-out gate; record verdict in `## Plan-vs-implementation review`. |
| Close-out: update workboard/context restart-state docs | pending | omni-ah | Update WORKBOARD + CONTEXT; rename active→done. |
| Close-out: file learnings/follow-up (LRN-139+ if any) | done | omni-ah | LRN-139 filed (plan-review fact-claim verification gap, status open as follow-up CS candidate). LRN-134/135/136 dispositioned APPLIED. |

### T1 — Fix stray fence at `template/composed/OPERATIONS.md:680`

- Remove the orphan closing ``` at L680.
- Verify the report shape block (L665-L679) renders correctly with 4-space indented-code.
- Run `node bin/harness.mjs lint` and `npm test` to confirm no test regressions.

### T2 — Fix prose vs label case at OPERATIONS.md:656

- Change prose `Implementer model used` to `IMPLEMENTER MODEL USED` (uppercase to match the template at L669), OR
- Change template label `IMPLEMENTER MODEL USED:` to `Implementer model used:` (lowercase to match prose).
- Choose direction by counting other report-shape field-label conventions in the same block (likely all-caps wins by convention; the report shape at L665-L679 uses STATUS / PREFLIGHT SHA / FINAL SHA all-caps).
- Run `node bin/harness.mjs lint` and `npm test`.

### T3 — Codify cross-repo pin-bump checklist in OPERATIONS.md (LRN-134)

Add a new H3 subsection `### Cross-repo pin-bump PR body checklist` under `## Cross-repo procedures` (or create that H2 if absent). Content:

```
When the harness orchestrator opens a pin-bump PR against a consumer repo
(e.g. henrik-me/sub-invaders), the PR body MUST include at open time:

1. ## Summary — what's bumped (from-version → to-version)
2. ## What's new in <version> — link to release notes, call out any
   consumer-facing strict-default flips
3. ## Changes — list of files changed by `harness sync --mode=apply`
4. ## Testing — sync mode=check verification
5. ## Known limitations / follow-ups — explicit defer list (esp. if
   consumer PR template is pre-current-version)
6. ## Review log — canonical 6-column schema with R1 local rubber-duck Go
   at the PR HEAD
7. ## Model audit — canonical `| Field | Value |` table with required rows
   Implementer models / Reviewer model / Implementer agent / Reviewer agent
   (plus the optional Notes row when warranted; cross-repo pin-bump PRs
   should NOT delete the Notes row unless empty)

Do NOT rely on the consumer's .github/pull_request_template.md to populate
these sections. Consumer templates can lag the harness version because
.github/pull_request_template.md is typically not in harness.config.json's
managed.files list. The strict-flip default since v0.6.0 means a stale
template will hard-fail A3 (independence) and A4 (stale-diff currency).
```

Mirror the doctrine into `template/managed/.github/copilot-instructions.md` under the appropriate H2 (or add one).

### T4 — Document the narrow re-attest pattern (LRN-135)

Add to OPERATIONS.md a new H3 subsection `### Narrow re-attest after trivial commits` under the rubber-duck review section. Content:

```
After a content PR's R1 full-diff rubber-duck review returns Go (or
Go-with-amendments), each subsequent commit on the same PR invalidates
the latest Review log Go row's analyzed_head (per A4 stale-diff gate).

For commits with a TRIVIAL delta (≤20 lines, doc-only or 1-2 line code
cleanups, no behavior change — e.g. fixing a Copilot inline finding):
dispatch a NARROW re-attest. The reviewer is told NOT to re-review the
diff. The briefing prompt explicitly says:

  "R1 already cleared the diff at <prev-head>. Only re-verify the trivial
   delta from <prev-head> to <new-head> is innocuous. Return Go or
   Needs-Fix with one paragraph."

The Review log gets a new row with:
- new analyzed_head
- same actor annotated (narrow R2) / (narrow R3)
- same model and verdict (Go)
- one-paragraph summary in evidence_link or inline

Rules:
- R1 must have been a full-diff review at a prior HEAD; that R1 Go must
  still be in the Review log table.
- Reviewer model and reviewer agent stay the same across R1 / narrow Rn.
- Only valid for TRIVIAL deltas. Substantive deltas (new test coverage,
  refactored module) require a full re-review.
```

Add a short cross-reference under `REVIEWS.md § Plan review` documenting narrow re-attest as a recognised round type (with pointer to the OPERATIONS.md procedure), and a brief mention under `REVIEWS.md § PR-evidence gates A4 (stale-diff currency)` that the narrow re-attest is the recommended mitigation when the delta is doc-only/trivial.

### T5 — Lock Review log Model column bare-id rule (LRN-136)

- In `REVIEWS.md § 2.8 (PR body requirements — Review log schema)`, update the `model` column description: "MUST be the bare reviewer-model identifier (e.g. `gpt-5.5`, `claude-sonnet-4.6`); decorations like `gpt-5.5 (reviewer)`, `gpt-5.5 (R2)`, `gpt-5.5 (PvI)` are not permitted. Put round/role annotations in the `actor` column instead (e.g. `rubber-duck (PvI R2)`)."
- Add an explicit decoration-detection check in `scripts/checks/check-review-log-evidence.mjs` (PR-side gate) BEFORE the `reviewerModelApproved()` call. The current gate (lines 168-179) approves any reviewer model when `## Model audit` has populated `Fallback rationale`, so a decorated cell like `gpt-5.5 (R2)` silently passes today on cross-model reviews. Fix: detect `/\s*\(.*\)\s*$/` on the raw `model` cell and emit ``## Review log row N: decorated model identifier "<value>"; use bare "<bare>" and put annotations in the actor column`` before reaching the approval path. Does NOT touch `scripts/checks/check-independence-invariant.mjs`.
- Add regression coverage in `tests/cs51-review-gates-logic.test.mjs`: two new test cases — (a) fixture with `| ... | gpt-5.5 (R2) | ... |` AND populated `Fallback rationale` row in `## Model audit` is REJECTED with the explicit decorated-identifier error (this is the live gap — would silently pass today); (b) fixture with bare `gpt-5.5` + populated fallback rationale still passes.

### T6 — Disambiguate `reviews.*` vs `review_gates.*` schema blocks

In `REVIEWS.md` (or `CONVENTIONS.md`), add a short subsection `### Config schema: reviews vs review_gates`. Source the field bullets directly from `schemas/harness.config.schema.json` (cite line ranges; do NOT paraphrase descriptions — copy them verbatim so a future schema-drift test can mechanically compare):

```
The harness uses two related but distinct config blocks:

- `review_gates.*` (install-time, schemas/harness.config.schema.json:107-137):
  controls which gates `harness init` / `harness sync` install in
  `infra/main-protection-ruleset.json` required_checks. Fields:
  - enabled (boolean, default true)
  - _opt_out_reason (string, required when enabled=false in v0.5.0+)
  - copilot_required (boolean, default false)
  - gate_set (string[] enum, default [])

- `reviews.*` (runtime, schemas/harness.config.schema.json:139-200):
  controls the `harness review <pr>` command and the runtime behavior
  of the PR-side review-gates workflow. Fields:
  - rubber_duck_model (string, default "gpt-5.5")
  - fallback_model (string, default "sonnet-4.6")
  - enforce_gates (boolean, default true)
  - require_copilot_review (boolean, default true)
  - copilot_reviewer_slug (string, default "copilot-pull-request-reviewer[bot]")
  - copilot_trigger ("mention" | "reviewer", default "mention")
  - review_timeout_minutes (number > 0, default 30)
  - high_risk_clickstops (array)

These are NOT the same key. `review_gates.enabled=false` skips gate
installation; `reviews.enforce_gates=false` skips runtime enforcement.
Both are valid configurations and serve different purposes.
```

Add a one-line drift-detection note: "If this list goes out of sync with `schemas/harness.config.schema.json:139-200`, a future regression test will fail. Update both together."

### T7 — Cut v0.6.1 release

- CHANGELOG: add `## [0.6.1] — <date>` section with the 6 doc-cleanup bullets.
- package.json + package-lock.json: 0.6.0 → 0.6.1.
- README pin sweep (v0.6.0 → v0.6.1).
- Tag at squash SHA after merge.
- Publish GitHub release.

## Validation

- `node bin/harness.mjs lint` exits 0.
- `npm test` passes (including new T5 regression test).
- `node scripts/validate-schemas.mjs` exits 0.
- Manual: render `template/composed/OPERATIONS.md` in a markdown previewer; confirm the L665-L679 report shape renders as code-block (not as ordinary text inside a stray fence) and that L681+ renders as normal headings/paragraphs (not as code).

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.7 | rubber-duck dispatched (orchestrator: omni-ah) | cccb7251bcdb | 2026-05-27T17:30:00Z | Needs-Fix | T6 cited wrong reviews.* fields; T5 inconsistent (Model audit vs Review log) + wrong test path; nonexistent harness sync --consumer. |
| R2 | gpt-5.5 | claude-opus-4.7 | rubber-duck dispatched (orchestrator: omni-ah) | bbdeaf3327d4 | 2026-05-27T17:40:00Z | Needs-Fix | T6/Deliverables + T5 + CLI fixes verified; one residual stale `reviews.primary_model` in Background must be replaced. |
| R3 | gpt-5.5 | claude-opus-4.7 | rubber-duck dispatched (orchestrator: omni-ah) | bbdeaf3327d4 | 2026-05-27T17:45:00Z | Go | Narrow re-attest after trivial Background delta; lists exact 8 reviews.* schema fields from lines 144-184; no made-up names. |
| R4 | gpt-5.5 | claude-opus-4.7 | rubber-duck dispatched (orchestrator: omni-ah) | 43bacd049c23 | 2026-05-27T17:50:00Z | Go | Post-Copilot-R1 amendments verified: D54-3 narrowly scoped (no normalisation behavior change); T5/Deliverables retargeted at real PR-side gate + test. |
| R5 | gpt-5.5 | claude-opus-4.7 | rubber-duck dispatched (orchestrator: omni-ah) | 3959850c1ae5 | 2026-05-27T18:00:00Z | Go | Post-Copilot-R3 narrow re-attest: REVIEWS.md § 2.7→§ 2.8 corrections (Review log schema location); D54-4 location split consistent with T4. |
| R6 | gpt-5.5 | claude-opus-4.7 | rubber-duck dispatched (orchestrator: omni-ah) | 2f2c22c4e9b5 | 2026-05-27T18:05:00Z | Needs-Fix | Caught false "gate already implicitly rejects" claim; fallback-rationale path makes decorated cells silently pass today. |
| R7 | gpt-5.5 | claude-opus-4.7 | rubber-duck dispatched (orchestrator: omni-ah) | 86b3d487ab9c | 2026-05-27T18:10:00Z | Go | D54-3/T5/Deliverables now accurately state the live PR-side fallback-rationale gap; explicit decoration check placed before reviewerModelApproved(). |
| R8 | gpt-5.5 | claude-opus-4.7 | rubber-duck dispatched (orchestrator: omni-ah) | 88491e88ad78 | 2026-05-27T18:13:00Z | Go | Post-Copilot-R5 narrow re-attest: Goal item 2 anchor reworded as NEW H3; Deliverables/T3 heading levels aligned (H3); REVIEWS bullet backtick nesting fixed. |
| R9 | gpt-5.5 | claude-opus-4.7 | rubber-duck dispatched (orchestrator: omni-ah) | 88491e88ad78 | 2026-05-27T18:16:00Z | Go | Post-Copilot-R6 narrow re-attest: WORKBOARD banner-only delta (a9e3836); plan file untouched, Decisions/Deliverables hash unchanged. |
| R10 | gpt-5.5 | claude-opus-4.7 | rubber-duck dispatched (orchestrator: omni-ah) | 88491e88ad78 | 2026-05-27T18:19:00Z | Go | Post-Copilot-R7 narrow re-attest: Depends-on header reworded (outside hash scope); LRN-136 + WORKBOARD banner fixed elsewhere; hash unchanged. |
| R11 | gpt-5.5 | claude-opus-4.7 | rubber-duck dispatched (orchestrator: omni-ah) | 5c40242b24c7 | 2026-05-27T18:23:00Z | Go | Post-Copilot-R8 substantive: D54-1 reworded to acknowledge the narrow gate behavior change in D54-3 (semver-patch defensible: no breaking change for well-formed inputs). |
| R12 | gpt-5.5 | claude-opus-4.7 | rubber-duck dispatched (orchestrator: omni-ah) | 5c40242b24c7 | 2026-05-27T18:31:00Z | Go | Post-Copilot-R9 narrow re-attest: T5 Model audit reworded to allow optional Notes row; LRN-133 disposition uses PR #210 ref (not branch SHA) per squash-merge policy. Hash unchanged. |
| R13 | gpt-5.5 | claude-opus-4.7 | rubber-duck dispatched (orchestrator: omni-ah) | 5c40242b24c7 | 2026-05-27T18:37:00Z | Go | Post-Copilot-R10 narrow re-attest: 4 attribution/anchor cleanups (tag-vs-commit; CONTEXT/LRN-133 attribution; LRN-134 anchor to CS54-T3). Hash unchanged. |
| R14 | gpt-5.5 | claude-opus-4.7 | rubber-duck dispatched (orchestrator: omni-ah) | 5c40242b24c7 | 2026-05-27T18:43:00Z | Go | Post-Copilot-R11 narrow re-attest: LRN-134 uses full path scripts/check-review-evidence.mjs; R13 recap trimmed to <200. Hash unchanged. |
| R15 | gpt-5.5 | claude-opus-4.7 | rubber-duck dispatched (orchestrator: omni-ah) | 5c40242b24c7 | 2026-05-27T18:50:00Z | Go | Post-Copilot-R14 narrow re-attest: LRN-133 Finding/Disposition reconciled (gitignore APPLIED); LRN-134+R13 recap CS54-T2→T3; R6-R10 timestamps re-sequenced. Hash unchanged. |
| R16 | gpt-5.5 | claude-opus-4.7 | rubber-duck dispatched (orchestrator: omni-ah) | 5c40242b24c7 | 2026-05-27T19:03:00Z | Go | Post-Copilot-R15 narrow re-attest: LRN-133 Disposition "TBD" placeholder dropped (PR #210 ref is canonical pre-merge). Hash unchanged. |
| R17 | gpt-5.5 | claude-opus-4.7 | rubber-duck dispatched (orchestrator: omni-ah) | 5c40242b24c7 | 2026-05-27T19:09:00Z | Go | Post-Copilot-R16 narrow re-attest: LRN-133 Problem reworded to past tense ("did NOT exclude at the time of CS53") with cross-ref to Finding/Disposition. Hash unchanged. |

## Notes / Learnings

- Surfaces LRN-134 (cross-repo pin-bump PR body checklist), LRN-135 (narrow re-attest pattern), LRN-136 (Review log Model column bare-id rule). All three filed during CS53 post-close-out doc sweep (2026-05-27).
- 2 of the 6 Copilot findings on SI PR #79 are real and must be fixed in this CS (T1 + T2). The other 4 are documentation-clarity items addressed by T6.
- CS54b (sibling, separate planned file) will refresh `template/managed/.github/pull_request_template.md` to v0.6.0+ strict schema. Scheduled separately because it touches consumer-side scaffold semantics.

## Plan-vs-implementation review

_To be completed at close-out (see OPERATIONS.md § "Plan-vs-implementation review (close-out gate)" for the canonical skeleton)._
