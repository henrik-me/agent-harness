# CS72 — Genericize consumer-shipped governance docs + guard linter

**Status:** active
**Owner:** omni-ah
**Branch:** cs72/content
**Started:** 2026-06-24
**Closed:** —
**Filed by:** omni-ah (Claude Opus 4.8), 2026-06-23 — surfaced during CS64b execution when @henrik-me rejected shipping the harness's own governance/onboarding docs (which carry harness-internal LRN/ADR/CS cross-references) verbatim to consumers. User directive: *"there should be no lrn's in a repo that adopts the harness that refers back to lrn's in the agent-harness repo … it has to be clean with basic/generic instructions, not specific to another repo."* The CS64b consumer-delivery strand (C64b-7 seed/init core-doc delivery + C64b-8 core-doc sync WARN gate) was **split out** of PR #310 and is re-planned here, done correctly: genericize first, then deliver.
**Depends on:** **CS64b** (soft) — CS64b's C64b-3 `harness sync` new-managed-file reconciliation is the delivery mechanism the now-generic core docs flow through; this CS restores the delivery (descoped from CS64b) on top of generic templates.

## Goal

Make the harness's core governance/onboarding docs that are **shipped to consumers** — `INSTRUCTIONS.md`, `.github/copilot-instructions.md`, `TRACKING.md`, `RETROSPECTIVES.md`, `READMEGUIDE.md` — generic and repo-agnostic — no `LEARNINGS.md#lrn-NNN` links, no bare `LRN-NNN` / `CSNN` mentions, no hardcoded `henrik-me/agent-harness` slug — so a repo that adopts the harness receives **basic, generic instructions**, not references that dangle back into the harness's own institutional memory. Enforce it with a guard linter so the genericity cannot silently regress, and deliver the now-generic docs to **new** consumers via fresh `init`. (Existing-consumer delivery of the newly-composed `INSTRUCTIONS.md`, genericization of the **process-doc composed bases** (OPERATIONS/REVIEWS/CONVENTIONS), and genericization of the **seeded prose scaffolds** (CONTEXT/ARCHITECTURE/LEARNINGS/known-constraints) are related but **separate follow-ups** — this CS scopes the five core onboarding docs.)

## Background

CS64b (PR #310, originally) tried to fix a real propagation miss — the harness's core governance/onboarding docs (`INSTRUCTIONS.md`, `.github/copilot-instructions.md`, `TRACKING.md`, `RETROSPECTIVES.md`, `READMEGUIDE.md`) reached **no** consumer (`sub-invaders` had none, so a Copilot agent there got none of the hard rules). But the fix shipped the harness's **own** copies of those docs, which are dense with harness-internal cross-references:

- `template/managed/INSTRUCTIONS.md` — ~20 `LEARNINGS.md#lrn-NNN` links, ~23 bare `LRN-NNN` mentions, ~29 `CSNN` mentions, the `henrik-me/agent-harness` slug.
- `template/managed/.github/copilot-instructions.md` — ≥1 LRN, ≥2 CSNN, the slug (e.g. `LRN-068`, `CS54`).
- `template/managed/TRACKING.md` — ~6 CSNN; `template/managed/RETROSPECTIVES.md` — ~4 LRN + ~4 CSNN; `READMEGUIDE.md` — clean.

In a consumer these links are **dead** (the consumer's `LEARNINGS.md` has no `LRN-068`), and the prose describes *the harness's* process history, not the consumer's. The interim CS64b mitigation — gating the `check-instructions` linter to the harness self-host so consumers got a doc "validated upstream" — treated the symptom (dead-anchor lint noise) and shipped the harness-specific content anyway. The maintainer's rule: **you cannot ship code/docs in use in this repo to a consumer; consumer templates must be clean/generic.**

The harness already has the right primitive for "generic base shipped to all + repo-specific content kept local": the **composed** file class (`CONVENTIONS.md`, `OPERATIONS.md`, `REVIEWS.md`, `pull_request_template.md` are already composed — a `template/composed/*` base merged with `<!-- harness:local-start … -->` blocks). INSTRUCTIONS.md is the natural next composed file; the harness keeps its LRN/CS-rich content in its own local block while consumers receive only the generic base.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C72-1 | INSTRUCTIONS.md → **composed** (generic base + harness local block) | Reclassify `INSTRUCTIONS.md` from `managed` to `composed`: author a generic, repo-agnostic `template/composed/INSTRUCTIONS.md` base (the universal hard rules — file ownership, no-commit preflight as a sub-agent, schema-as-source-of-truth, briefing-preamble discipline, per-CS loop shape — written WITHOUT any `LRN-NNN`/`CSNN`/slug reference), plus a harness self-host `<!-- harness:local-start id=instructions-harness -->` block carrying the harness's institutional cross-anchors. Move `INSTRUCTIONS.md` from `managed.files` to `composed.files` in the root `harness.config.json` and `template/seeded/harness.config.json`. | Mirrors the existing CONVENTIONS/OPERATIONS/REVIEWS composition: consumers get the generic base; the harness preserves its rich content via its local block; `check-composed-blocks` already validates the base/local split. The universal hard rules ARE useful to a consumer; only the harness-specific anchors are not. **Safe to reclassify:** the CS64b propagation miss means no released consumer ever received `INSTRUCTIONS.md` (none have it in `managed.files`), so removing `template/managed/INSTRUCTIONS.md` cannot break an existing consumer's sync — only the harness self-host config is migrated, in this CS. |
| C72-2 | Genericize the other core docs | `.github/copilot-instructions.md`, `TRACKING.md`, `RETROSPECTIVES.md` carry harness-internal refs and must be genericized; `READMEGUIDE.md` is already clean. Per-file choice confirmed at claim time: **composed** (base + harness local block) where the harness keeps substantial repo-specific content (expected: `copilot-instructions.md`), or a **one-time scrub to generic managed** where the harness-specific refs are incidental (candidate: `TRACKING.md`, `RETROSPECTIVES.md`). | Same principle as C72-1 applied per-file; avoids forcing the composed split on docs whose harness-specific content is thin enough to simply remove. |
| C72-3 | Guard linter (genericity) | Add `scripts/check-consumer-template-genericity.mjs` (Node built-ins only; `--quiet`; exit 0/1/2) that fails if any file in a **defined consumer-onboarding doc set** contains a harness-internal reference: a `LEARNINGS.md#lrn-` link, a bare `LRN-\d+` or `CS\d+[a-z]?` token, or the literal `henrik-me/agent-harness` slug. The set is **explicit and resolved per the C72-2 decision** — for each core onboarding doc the linter scans whichever generic location it lands in: `template/managed/<doc>` if scrubbed-to-managed, or its `template/composed/<doc>` **base** if composed (local-block regions excluded). Initial set: the new `template/composed/INSTRUCTIONS.md` base + `.github/copilot-instructions.md`, `TRACKING.md`, `RETROSPECTIVES.md`, `READMEGUIDE.md` at their chosen locations. Local-block exclusion reuses the composed marker parser (`lib/composed.mjs`), NOT ad-hoc regex slicing. Register in the `harness lint` aggregator. **Explicitly out of scope (separate follow-up CSs):** (a) the existing process-doc composed bases (`OPERATIONS.md`, `REVIEWS.md`, `CONVENTIONS.md`) which today carry harness anchors; (b) the **seeded prose scaffolds** (`template/seeded/CONTEXT.md`, `ARCHITECTURE.md`, `LEARNINGS.md`, `.harness-known-constraints.md`) which `init` copies and which currently carry harness refs. (`template/seeded/harness.config.json` uses `REPLACE_ME` placeholders and is already generic.) | A static, fixture-testable guard makes the genericity invariant permanent for the onboarding docs — the exact regression CS64b shipped cannot recur silently. An explicit, per-decision set (not "all composed bases") avoids falsely failing on the process-doc bases and seeded scaffolds this CS does not touch; parser-based local-block exclusion prevents a malformed/unclosed marker from hiding a ref. The harness self-host's OWN root docs + composed local blocks are not consumer-onboarding templates, so they remain free to carry anchors. |
| C72-4 | Fresh-init delivery + revert gating (existing-consumer delivery deferred) | Add the generic core docs to `template/seeded/harness.config.json` (`composed.files` for INSTRUCTIONS.md per C72-1; `managed.files` for the scrubbed docs per C72-2) so a **fresh `harness init` materializes them** (init already renders `composed.files`). **Revert** the CS64b interim `check-instructions` self-host gating — the consumer base has no dead anchors, so the linter runs unconditionally again. **Existing-consumer sync-time delivery is explicitly deferred:** CS64b's C64b-3 `--apply-new` reconciliation scans only `template/managed/**`, so it cannot surface a newly-**composed** `INSTRUCTIONS.md`; delivering composed files to already-initialized consumers needs a new composed-file reconciliation path, tracked as a follow-up CS. | Makes the generic docs shippable to NEW consumers immediately (the common path) without inventing a composed-reconciliation engine in this CS. Honestly scopes the existing-consumer gap rather than over-claiming that C64b-3 (managed-only) covers it. |
| C72-5 | SemVer | Additive consumer-facing templates + a new linter + reclassification that is transparent to the harness self-host (the composed render preserves the self-host's operational content; `sync --mode=check` zero drift) ⇒ **minor** bump per `OPERATIONS.md § SemVer policy`. No consumer breaks: a consumer that has not adopted these files is unaffected; one that adopts gets generic content. | New consumer-visible templates + additive lint; no breaking change to existing configs. |
| C72-6 | Authoring / review independence | Plan author model(s) recorded in the plan-review table; reviewer model MUST differ (REVIEWS § 2.3). Implementation logic that is harness-runtime (the linter) lives in `scripts/` + dep-free seams with `os.tmpdir()`-only test scratch (LRN-094). | Standard harness authoring + independence discipline. |

## Deliverables

1. `template/composed/INSTRUCTIONS.md` (new, generic base) + a harness self-host local block merged into the root `INSTRUCTIONS.md`; `harness.config.json` + `template/seeded/harness.config.json` move `INSTRUCTIONS.md` from `managed.files` to `composed.files`; `check-composed-blocks` green; `harness sync --mode=check` shows zero drift on the harness self-host (the composed render preserves the current root `INSTRUCTIONS.md` operational content; a file-class banner / `harness:local-start|end` marker diff is permitted). (C72-1)
2. Genericized `.github/copilot-instructions.md`, `TRACKING.md`, `RETROSPECTIVES.md` (composed base + harness local block, or scrubbed generic managed — per-file decision recorded at claim); `READMEGUIDE.md` confirmed clean. (C72-2)
3. `scripts/check-consumer-template-genericity.mjs` (new, scoped to the C72-3 explicit onboarding set) + registration in the `harness lint` aggregator (`bin/harness.mjs`) + `tests/*.test.mjs` (`node --test`): fixtures proving a harness-internal ref (`LRN-\d+` / `CS\d+` / `LEARNINGS.md#lrn-` / the slug) in an in-scope doc fails (exit 1); a clean doc passes (exit 0); a ref inside a `harness:local-start|end` block is exempt **but** a ref outside a malformed/unclosed/nested marker is still caught (parser-based exclusion via `lib/composed.mjs`, not regex slicing); the out-of-scope process-doc composed bases (OPERATIONS/REVIEWS/CONVENTIONS) and seeded skeletons are NOT scanned; bad usage exits 2. Scratch under `os.tmpdir()` only (LRN-094). (C72-3)
4. `template/seeded/harness.config.json` fresh-init wiring (generic INSTRUCTIONS.md in `composed.files`; scrubbed docs in `managed.files`) so `harness init` materializes them; **revert** the CS64b `check-instructions` self-host gating in `bin/harness.mjs` (restore the unconditional `instructions` linter entry) + its `--explain` Scope note. Existing-consumer composed-file sync delivery is **deferred** (documented as a follow-up; C64b-3 `--apply-new` covers only `template/managed/**`). (C72-4)
5. `CHANGELOG.md` `[Unreleased]` entry; `OPERATIONS.md` (+ composed mirror) note on the consumer-template genericity invariant and the guard linter. (C72-1…C72-4)
6. Self-checks green: `harness lint --quiet` (incl. the new genericity linter + `composed-blocks` + `text-encoding`), `node --test`, and `harness sync --mode=check` (zero self-host drift). (all)

## User-approval gates

- **Gate A — per-doc genericization form (C72-2).** For each of `copilot-instructions.md` / `TRACKING.md` / `RETROSPECTIVES.md`: composed (base + harness local block) vs one-time scrub to generic managed. Default: composed for `copilot-instructions.md` (substantial harness-specific content), scrub for `TRACKING.md` / `RETROSPECTIVES.md`. Confirm at claim.
- **Gate B — existing-consumer delivery (C72-4).** This CS delivers the generic docs to NEW consumers (fresh `init`) only; sync-time delivery to already-initialized consumers (which needs a composed-file reconciliation path) is **deferred** to a follow-up CS. Confirm the deferral, or pull the composed-reconciliation work into this CS at claim (larger scope).

## Exit criteria

1. The genericity linter (`check-consumer-template-genericity`) passes, and a fixture test proves it FAILS on an injected `LRN-NNN` / `CSNN` / `LEARNINGS.md#lrn-` / `henrik-me/agent-harness` reference in a consumer-shipped template.
2. Every doc in the C72-3 onboarding set contains **zero** harness-internal references (verified by the linter), while the harness self-host's rendered root `INSTRUCTIONS.md` preserves its current **operational content** — the composed base + harness local block reproduces today's substantive content (a file-class banner / `harness:local-start|end` marker diff is permitted), and after conversion `harness sync --mode=check` reports **zero drift** on the self-host.
3. A fresh `harness init` into an empty repo materializes the generic core docs and `harness --cwd <consumer> sync --mode=check` exits 0 with no drift; the rendered **core onboarding** docs contain no harness-internal reference and no unresolved `{{…}}`. (Existing-consumer sync-time delivery of the now-composed `INSTRUCTIONS.md`, and the seeded prose scaffolds `init` also copies, are out of scope — see C72-3/C72-4.)
4. The CS64b interim `check-instructions` self-host gating is reverted; the `instructions` linter runs unconditionally again and passes on the harness self-host.
5. `harness lint --quiet` passes; `node --test` green; CHANGELOG `[Unreleased]` entry present; the close-out plan-vs-implementation review returns GO.

## Risks + open questions

| # | Risk / what breaks | Mitigation |
|---|---|---|
| R1 | Reclassifying `INSTRUCTIONS.md` managed→composed drifts the harness self-host content (the rich operational doc the harness relies on). | The harness local block preserves all harness-specific content; Exit criterion 2 asserts the composed render reproduces the current operational content (marker/banner diff aside) with `sync --mode=check` zero drift before merge. |
| R2 | The genericity linter false-positives on legitimate generic prose (e.g. the word "learnings", or a literal example). | Precise patterns only: `LEARNINGS.md#lrn-` links, `\bLRN-\d+\b`, `\bCS\d+[a-z]?\b` tokens, and the exact `henrik-me/agent-harness` slug; local-block regions excluded; an allowlist hook for unavoidable literals, fixture-tested. |
| R3 | Scope creep across four docs × genericization. | `READMEGUIDE.md` already clean; per-doc composed-vs-scrub decision (Gate A) keeps each change minimal; the required-core-doc gate is deferrable (Gate B). |
| R4 | A consumer that already adopted a CS64b-era harness-specific doc (if any shipped) keeps the dangling refs. | For the **scrubbed managed** docs, CS64b's C64b-3 `sync --apply-new` reconciliation surfaces the refreshed generic template for re-adoption; the **composed** `INSTRUCTIONS.md` re-adoption depends on the deferred composed-reconciliation path (C72-4), not C64b-3. Document the one-time re-adopt in the CHANGELOG/migration note. |
| OQ1 | Should the guard linter also cover `template/seeded/**`? | **Partially resolved (C72-3):** `template/seeded/harness.config.json` is already generic (`REPLACE_ME` placeholders); the seeded **prose scaffolds** (`CONTEXT.md` / `ARCHITECTURE.md` / `LEARNINGS.md` / `.harness-known-constraints.md`) DO currently carry harness refs and `init` ships them, but genericizing them is a **separate follow-up CS** — explicitly out of CS72's onboarding-doc scope, so this guard does not scan them. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: omni-ah) | c463a3fc6976 | 2026-06-23T04:50:00Z | Needs-Fix | linter scope fails existing composed bases; apply-new won't deliver composed docs; managed→composed may break consumers; byte-for-byte exit ambiguous/impossible. |
| R2 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: omni-ah) | d7197bd79003 | 2026-06-23T05:08:00Z | Needs-Fix | linter scope ignores C72-2 composed-doc choices; seeded exclusion false for shipped prose docs (CONTEXT/ARCH/LEARNINGS); byte-for-byte wording remains in D1/C72-5. |
| R3 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: omni-ah) | 37d23fbd87b8 | 2026-06-23T05:18:00Z | Go | R2 blockers resolved; linter scope, seeded-doc gap, drift wording, R4 mitigation now consistent; no new contradictions. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1 — Reclassify `INSTRUCTIONS.md` → composed: author generic `template/composed/INSTRUCTIONS.md` base + harness self-host local block in root `INSTRUCTIONS.md`; move to `composed.files` in `harness.config.json` + `template/seeded/harness.config.json` (C72-1, D1) | pending | — | agent-id=TBD \| role=implementer \| report-status=pending \| learnings=0 |
| T2 — Genericize `.github/copilot-instructions.md`, `TRACKING.md`, `RETROSPECTIVES.md` per Gate A; confirm `READMEGUIDE.md` clean (C72-2, D2) | pending | — | agent-id=TBD \| role=implementer \| report-status=pending \| learnings=0 |
| T3 — Add `scripts/check-consumer-template-genericity.mjs` + `harness lint` registration + fixtures/tests; parser-based local-block exclusion via `lib/composed.mjs` (C72-3, D3) | pending | — | agent-id=TBD \| role=implementer \| report-status=pending \| learnings=0 |
| T4 — Fresh-init wiring in `template/seeded/harness.config.json`; revert CS64b `check-instructions` self-host gating in `bin/harness.mjs` (C72-4, D4) | pending | — | agent-id=TBD \| role=implementer \| report-status=pending \| learnings=0 |
| T5 — `CHANGELOG.md` `[Unreleased]` entry + `OPERATIONS.md` (+ composed mirror) genericity-invariant note (D5) | pending | — | agent-id=TBD \| role=implementer \| report-status=pending \| learnings=0 |
| T6 — Local review (GPT-5.5 rubber-duck) + self-checks (`harness lint`, `node --test`, `sync --mode=check`) + open content PR (D6) | pending | — | agent-id=TBD \| role=reviewer \| report-status=pending \| learnings=0 |
| Close-out: docs + restart state — update `WORKBOARD.md` (remove CS72 row); refresh `CONTEXT.md`; run `harness sync --mode=check` (no drift) | pending | omni-ah | close-out |
| Close-out: learnings + follow-ups — file any new LRNs; file the OPERATIONS/REVIEWS cross-ref genericization follow-up CS (covers issue #229); run `harness harvest` if cadence triggers | pending | omni-ah | close-out |

## Notes / Learnings

- Filed as the corrective follow-up to the CS64b consumer-delivery strand (C64b-7/8), which was split out of PR #310 because it shipped harness-internal docs to consumers. This CS does delivery correctly: **genericize first (composed base + guard linter), then deliver.**

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | omni-ah |
| Reviewer agent | rubber-duck (orchestrator: omni-ah) |
| Notes | Forward-looking at claim time; materially-used implementer models + the sub-agent ledger are confirmed at close-out. Independence per REVIEWS § 2.3 — reviewer gpt-5.5 ≠ implementer claude-opus-4.8. CS72 is NOT on reviews.high_risk_clickstops; fallback claude-sonnet-4.6 permitted if gpt-5.5 is unavailable. |

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
