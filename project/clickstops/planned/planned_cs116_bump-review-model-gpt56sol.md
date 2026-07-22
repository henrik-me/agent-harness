# CS116 — Bump the primary code-review model gpt-5.5 → gpt-5.6-sol

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** omni-ah (orchestrator, Claude Opus 4.8) on 2026-07-22. Directed by @henrik-me: "Why are you still using gpt 5.5 for reviews? … update the version of GPT to use for reviews to 5.6 SOL … make that update where needed." Change set mapped by background sub-agent `review-model-scope`.
**Depends on:** none.

## Goal

Make **`gpt-5.6-sol`** the primary code-review model across the harness, replacing `gpt-5.5`, so every plan review, content review, and PVI review defaults to `gpt-5.6-sol`. Update the canonical policy source, the enforcement/CLI surfaces, the normative docs (+ their composed mirrors), the PR-template example, and the tests that assert the model — without rewriting historical evidence.

## Background

- The canonical primary-reviewer model is the **`reviews.rubber_duck_model`** policy field: self-host sets it in `harness.config.json`; consumers that omit it fall back to the schema default in `schemas/harness.config.schema.json`. `lib/reviews-policy.mjs` sources defaults from the schema; the shared review-evidence checks (`scripts/checks/check-review-log-evidence.mjs`, `scripts/checks/check-independence-invariant.mjs`) read that policy (no hard-coded primary). NOTE: `scripts/check-review-evidence.mjs` is policy-**agnostic** — it does not read the primary model; it only carries a current-facing `gpt-5.5` *diagnostic example* (~line 561) to refresh.
- `bin/harness.mjs` has a hard-coded `harness review --model` allowlist (`gpt-5.5 | sonnet-4.6`) that currently rejects `gpt-5.6-sol`; CS116 **swaps the primary** (→ `gpt-5.6-sol | sonnet-4.6`) rather than widening — it does NOT keep `gpt-5.5` selectable (see C116-4).
- `REVIEWS.md` (§ 2.2 primary + § 2.2.1 fallback ladder) has a composed mirror at `template/composed/REVIEWS.md` (validated by `tests/operations-reviewer-preamble.test.mjs` — which checks both copies SEPARATELY, not byte-equality; composed roots preserve their local blocks); `OPERATIONS.md` and `INSTRUCTIONS.md` (and their composed mirrors) carry normative "primary reviewer = GPT-5.5" text. Each mirror pair changes in lockstep and `sync --mode=check` must stay clean.
- `gpt-5.6-sol` already has repo precedent (used as an independent reviewer this session; e.g. CS114 plan-review pre-pass).
- **Fallback ladder is prose, not a new config field.** The config models a single `fallback_model` (currently `sonnet-4.6`); the intermediate GPT steps live only in the § 2.2.1 prose ladder (this is the pre-existing design). So this CS bumps the primary + the ladder-top prose and leaves `fallback_model = sonnet-4.6` unchanged — no schema shape change.
- **Bootstrap:** this CS's own content PR is reviewed by `gpt-5.6-sol`; the review-evidence gate reads the policy from the PR HEAD, which this PR sets to `gpt-5.6-sol`, so the new primary is self-consistently approved. (If the gate is found to read the base/main policy instead, fall back to a `gpt-5.5` review-of-record for this one bootstrap PR.)

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C116-1 | Primary reviewer | `gpt-5.6-sol` | Maintainer-directed; independent of the `claude-opus-4.8` implementer/orchestrator (independence invariant preserved). |
| C116-2 | Fallback ladder (prose) | `gpt-5.6-sol → next-highest-available GPT (ASPIRATIONAL, e.g. gpt-5.5) → Claude Sonnet-highest → user waiver`. The CLI-selectable + code-enforced set is ONLY {`gpt-5.6-sol`, `sonnet-4.6`} (C116-4); intermediate GPT rungs are aspirational prose the tooling does not accept (as `gpt-5.4` was pre-CS116). | Keeps the GPT-first intent while matching what the code actually enforces; making the GPT rungs selectable + enforced is the C116-9 follow-up. |
| C116-3 | Config shape | Change only `reviews.rubber_duck_model` (+ schema default + `lib/review.mjs` default) to `gpt-5.6-sol`; leave `reviews.fallback_model = sonnet-4.6` unchanged | Minimal + correct: the code special-cases ONLY `fallback_model` (Sonnet) for auto-rationale (`lib/review.mjs:~924`) and HIGH-RISK restriction (`:~416`). Intermediate GPT rungs (formerly `gpt-5.4`, now also `gpt-5.5`) are PROSE guidance the code has never enforced — a pre-existing design left unchanged (see C116-9). |
| C116-4 | CLI allowlist (1:1 primary swap) | Change `harness review --model` default + allowlist to the selectable set {`gpt-5.6-sol` (default), `sonnet-4.6`} — a 1:1 swap of the pre-CS116 set {`gpt-5.5`, `sonnet-4.6`}. Do NOT keep `gpt-5.5` selectable. | Keeping `gpt-5.5` as a non-primary `--model` option would create a selectable model that BYPASSES the `fallback_model`-only auto-rationale + HIGH-RISK logic in `lib/review.mjs` — a NEW regression. The 1:1 swap (allowlist = {primary, `fallback_model`}) matches pre-CS116 structure and avoids it; `gpt-5.5` remains an aspirational prose rung until C116-9. |
| C116-5 | Composed-file discipline | For each composed doc (`REVIEWS.md`/`OPERATIONS.md`/`INSTRUCTIONS.md`), edit the `template/composed/**` managed core and regenerate the root (or edit both consistently), keeping each root's local block intact; `sync --mode=check` clean is an exit gate | Composed roots are NOT byte-identical to their templates (they preserve project local blocks); `sync --mode=check` compares rendered-and-merged content (`lib/sync.mjs`). `operations-reviewer-preamble.test.mjs` validates both copies separately (not equality). |
| C116-6 | Do NOT rewrite history | Leave historical/evidence references untouched: `LEARNINGS.md`, `project/clickstops/done/**`, past plan-review + ADR attestations, `CHANGELOG.md` past entries, `CONTEXT.md`/`WORKBOARD.md` historical rows, and historical code/test comments (e.g. `lib/claim.mjs`, `lib/closeout.mjs`, `check-workboard-allowlist-consistency.mjs` reviewer comments) | They are evidence/history, not current policy; a blind find-replace would corrupt them. |
| C116-7 | Review-of-record for THIS CS | `gpt-5.6-sol` (bootstrap per Background); the one prior `gpt-5.5` usage was the policy-compliant review under the OLD rule | Answers the maintainer's "why still 5.5": the switch flips the default for all subsequent CSs. |
| C116-8 | Independence (overlap exception) | Extend the REVIEWS.md non-high-risk overlap-exception justification (§ ~842-848) to name `gpt-5.6-sol` as the reviewer-only primary — implementer/orchestrator model is `claude-opus-4.8` (INSTRUCTIONS.md), so `gpt-5.6-sol` is not used as an implementer and the existing exception rationale holds. Do NOT redesign the independence gate. | The exception was justified by "gpt-5.5 was never an implementer"; the same holds for gpt-5.6-sol. Update the doc + asserting tests to reference the new primary; a reject-all-overlap gate redesign is a separate concern (C116-9). |
| C116-9 | Scope boundary | OUT OF SCOPE (file as follow-up CS): (a) making the aspirational GPT fallback rungs (gpt-5.5/gpt-5.4) SELECTABLE + first-class code-enforced fallbacks (auto-rationale + HIGH-RISK restriction in `lib/review.mjs`); (b) tightening the independence gate to reject ALL implementer/reviewer overlap | Both are orthogonal to the maintainer's ask (make `gpt-5.6-sol` the primary). CS116 avoids the fallback regression by NOT adding gpt-5.5 as selectable (C116-4); a proper multi-rung GPT fallback is the follow-up. Bundling would expand CS116 into a review-policy-architecture change. |

## Deliverables

1. `harness.config.json` (`reviews.rubber_duck_model` → `gpt-5.6-sol`), `schemas/harness.config.schema.json` (default/description/examples), and `lib/review.mjs` runtime default → `gpt-5.6-sol`.
2. `bin/harness.mjs` — `harness review --model` help + allowlist changed to the selectable set {`gpt-5.6-sol` (default), `sonnet-4.6`} — a 1:1 primary swap that DROPS `gpt-5.5` as a selectable option (C116-4); refresh the current-facing `gpt-5.5` diagnostic example in `scripts/check-review-evidence.mjs` (~line 561; policy-agnostic check, example only).
3. Normative docs updated (primary model + § 2.2.1 ladder-top) in `REVIEWS.md`, `OPERATIONS.md`, `INSTRUCTIONS.md` **and** their `template/composed/**` mirrors (each preserving its local block), in lockstep.
4. `.github/pull_request_template.md` + `template/composed/.github/pull_request_template.md` — reviewer-model example `gpt-5.5` → `gpt-5.6-sol` (implementer example unchanged).
5. Update the policy/enforcement **tests + fixtures** that assert the primary/default model or the C116-8 overlap-exception rationale: `cs61-reviews-policy-reader`, `cs51-review-gates-logic`, `cs52-harness-review-lib`, `cs52-harness-review-cli`, `cs68-review-non-cs`, `cs54b-pr-template-strict`, `check-clickstop-implementer-not-reviewer` — only where they assert the current/default policy or that rationale, NOT deliberate alternate-model fixtures (e.g. cs113's intentional `gpt-5.4` reviewer).
6. `CHANGELOG.md` `[Unreleased]` entry.
7. Verification: `node --test tests/*.test.mjs` 0 fail; `node bin/harness.mjs lint --quiet` 0 fail; `node bin/harness.mjs sync --mode=check` no drift.

## User-approval gates

- Direction approved by @henrik-me this session (bump reviews to gpt-5.6-sol).
- **G116-1:** if the fallback ladder needs a config-shape change (a `fallback_model` list) rather than prose-only, escalate before implementing (default is prose-only per C116-3).

## Exit criteria

1. `reviews.rubber_duck_model` = `gpt-5.6-sol` (config + schema default); `harness review --model` accepts it and defaults to it; all normative docs + composed mirrors say primary = GPT-5.6 Sol; PR-template reviewer example updated.
2. Historical evidence untouched; `sync --mode=check` clean; mirror-assertion tests green.
3. `node --test`, `harness lint` green. Plan-vs-implementation review (gpt-5.6-sol) GO before close-out.

## Risks + open questions

| # | Risk / what breaks | Mitigation |
|---|---|---|
| R1 | Bootstrap: the review-evidence gate rejects a `gpt-5.6-sol` reviewer because it reads the base/main policy (still `gpt-5.5`) instead of PR HEAD. | If observed, use a `gpt-5.5` review-of-record for this one PR (compliant under the old rule); all subsequent CSs use gpt-5.6-sol. (C116-7.) |
| R2 | A composed mirror edited on only one side → `sync --mode=check` drift + mirror-assertion test failure. | C116-5: edit both sides in lockstep (or edit the template + regen the root); sync-check + mirror tests are exit gates. |
| R3 | Over-broad rewrite hits historical prose (LEARNINGS/done/CHANGELOG/attestations), corrupting evidence. | C116-6: change only CANONICAL POLICY / FALLBACK-LADDER / normative-doc / test-assertion hits from the `review-model-scope` map; leave HISTORICAL PROSE hits. |
| R4 | Keeping `gpt-5.5` as a selectable non-primary `--model` would BYPASS the `fallback_model`-only auto-rationale + HIGH-RISK logic (`lib/review.mjs`) — a NEW regression (gpt-5.5 was the primary before, not a bare fallback). | Avoided by C116-4: the selectable set is {`gpt-5.6-sol`, `sonnet-4.6`} (a 1:1 primary swap), so no new selectable-but-unenforced model is introduced. Making the GPT rungs selectable + code-enforced is the C116-9 follow-up. |
| R5 | The non-high-risk overlap exception could permit self-review if `gpt-5.6-sol` were ever used as an implementer. | C116-8: `gpt-5.6-sol` is reviewer-only (implementer/orchestrator = `claude-opus-4.8`); the exception rationale is extended to it in doc + tests. A full reject-all-overlap gate redesign is a separate follow-up (C116-9). |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.6-sol | claude-opus-4.8 | cs116-plan-review (omni-ah) | 2a25a674624f | 2026-07-22T20:19:54Z | Go | 1:1 allowlist swap removes fallback regression; composed-file, policy-reader, history, test, bootstrap, and reviewer-only independence scopes now match repo behavior. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per § Claim) | planned | — | — |

## Notes / Learnings

(filled during execution)

- Change set mapped by background sub-agent `review-model-scope` (read-only): canonical source = `reviews.rubber_duck_model`; `bin/harness.mjs` has a hard-coded `--model` allowlist; REVIEWS/OPERATIONS/INSTRUCTIONS have composed mirrors; historical prose (LEARNINGS/done/CHANGELOG/attestations) must not be rewritten.
- **Plan review (3 rounds, gpt-5.6-sol `cs116-plan-review`):** R1 Needs-Fix (fallback-rung enforcement gap; non-high-risk independence-overlap exception unproven for gpt-5.6-sol; factual "byte-identical" + policy-reader errors) → R2 Needs-Fix (the fallback issue was a NEW regression from keeping gpt-5.5 selectable, not deferrable) → **R3 Go** after the C116-4 1:1 allowlist swap (drop gpt-5.5 as selectable), C116-8 reviewer-only independence, and the byte-identical/policy-reader corrections. The R1 attestation row above is the final Go over the amended Decisions+Deliverables (hash `2a25a674624f`).

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
