# CS122 — Single-source model registry: make adopting a newer model a one-file change (delivers CS116's C116-9(a))

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** omni-ah (orchestrator, `claude-opus-5`) on 2026-07-24, from a maintainer-requested repo evaluation ("improve the harness considering newer models"). Scope mapped against `main` @ `8deaa32`.
**Depends on:** **CS116** (landed — merged as #541; its `## Plan review` decision **C116-9(a)** explicitly defers "making the aspirational GPT fallback rungs selectable + first-class code-enforced fallbacks" to a follow-up CS. This is that CS.)

## Goal

Replace the scattered, hand-synchronised model strings with one machine-readable registry that the schema, the CLI allowlist, the review runtime, and the evidence linters all read.

**Precise scope of the "one-file" promise (narrowed during plan review):** *registering, re-ranking, or deprecating an **unconfigured** model* is a single edit to `schemas/models.json`. Two operations legitimately need more: *adopting a different model as the primary reviewer* remains a one-value policy edit to `reviews.rubber_duck_model` (plus the schema default, the consumer fallback), because C122-6 keeps the registry from choosing policy; and *deprecating the **currently configured** primary or fallback* requires that same policy + schema-default migration, since C122-7 makes a configured deprecated model an error by design. The win is that none of these any longer requires touching `bin/harness.mjs`, `lib/review.mjs`, normative-doc prose, or fixtures, as CS116's seven-deliverable sweep did.

## Background

The harness is *current* on models (CS116 made `gpt-5.6-sol` the primary). The problem is **agility**, not version: the cost of the next bump is structurally high.

A model id is independently declared in at least four code/config sites that must agree:

- `harness.config.json` — `reviews.rubber_duck_model` / `reviews.fallback_model` (the canonical policy).
- `schemas/harness.config.schema.json:172,180` — `default` + `examples` for both fields (the consumer fallback when the field is omitted).
- `lib/review.mjs:28-29` — runtime defaults duplicated in code.
- `bin/harness.mjs:4272-4273` — a **hard-coded array literal** `['gpt-5.6-sol', 'sonnet-4.6']` gating `harness review --model`, with the same pair repeated in the help text at `:508,519`.

Plus the normative docs (`REVIEWS.md` §2.2/§2.2.1, `OPERATIONS.md`, `INSTRUCTIONS.md`, `CONVENTIONS.md`), each with a `template/composed/**` mirror that must move in lockstep, the PR template's example, and a set of test fixtures. CS116's own deliverable list ran to seven items across all of these — for what is conceptually a one-value policy change.

Structural gaps this creates:

- **No allowlist source of truth.** The CLI array and the schema default can drift apart with nothing to detect it.
- **No lifecycle for a model id.** There is no representation of "current" vs "aspirational" vs "deprecated". CS116's fallback ladder is therefore *prose the tooling cannot enforce* (C116-2/C116-3): the § 2.2.1 ladder names intermediate GPT rungs that `harness review --model` will reject. CS116 accepted this deliberately, to avoid introducing a selectable model that bypasses the `fallback_model`-only auto-rationale and HIGH-RISK logic in `lib/review.mjs:~416,~924` — a regression the 1:1 swap (C116-4) sidestepped rather than solved.
- **No deprecation signal.** Nothing warns that a configured model is retired.

Normalisation logic already exists (`scripts/checks/check-review-log-evidence.mjs:45-53` `normalizeModel()`), but it normalises *syntax*, not identity — it will happily accept a model that no longer exists.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C122-1 | Registry location + format | New `schemas/models.json` (data, not a JSON Schema), validated by a companion `schemas/models.schema.json` | Data belongs beside the other canonical schema artefacts; a schema for the registry keeps it lint-able by the existing `validate-schemas.mjs` job. |
| C122-2 | Record shape | Per model: `id`, `vendor`, `roles` (`reviewer` \| `implementer`), `status` (`current` \| `aspirational` \| `deprecated`), `rung` (integer), `successor` (required when `status: deprecated`; must name an existing non-deprecated `id`), `notes` | `status` + `rung` are the two facts the prose ladder encodes today but the code cannot read. `successor` is required because C122-7 promises the deprecation warning names one — without the field that promise is unimplementable. |
| C122-3 | Rung ordering semantics | **Lower `rung` = more preferred.** `rung: 0` is the most-preferred reviewer. The registry loader validates that rungs are unique among reviewer-role models | An explicit, validated direction is required before any comparison logic can be written; "below the primary" is ambiguous without it. |
| C122-4 | Selectable set derivation | `harness review --model` accepts any registry model with `roles ∋ reviewer` and `status ≠ deprecated`; the hard-coded array at `bin/harness.mjs:4272` is deleted | Removes the drift-prone duplicate and makes the ladder's intermediate rungs genuinely selectable — the substance of C116-9(a). |
| C122-5 | Fallback/HIGH-RISK generalisation **with a preservation invariant** | Generalise `lib/review.mjs`'s `fallback_model`-only special-casing (auto-rationale ~`:924`, HIGH-RISK restriction ~`:416`) to "any model ranked **worse** than the configured primary (`rung > primary.rung`)". Load-time validation **fails closed** unless `rung(fallback_model) > rung(rubber_duck_model)` | Rung comparison alone does **not** imply current behaviour is preserved: nothing otherwise forces the configured fallback to rank below the configured primary, so a careless re-rank could silently drop the HIGH-RISK protection that today attaches to `sonnet-4.6`. The explicit invariant is what makes the generalisation safe, and it is asserted at load time rather than assumed. |
| C122-6 | Config compatibility | `reviews.rubber_duck_model` / `reviews.fallback_model` keep their current names, meaning, and schema defaults; they become **validated against** the registry rather than replaced by it | Zero-migration for consumers. The registry constrains the values; it does not change the policy surface. Any config-shape change would be a consumer-breaking change for no benefit. |
| C122-7 | Unknown / deprecated configured models | A configured model absent from the registry is an **error**. A configured `rubber_duck_model` or `fallback_model` with `status: deprecated` is **also an error**, naming its `successor`. `status: deprecated` models are excluded from the selectable set, so implicit and explicit selection behave identically | An earlier draft warned-only on a deprecated configured primary while C122-4 excluded deprecated models from `--model` — meaning the same id would be silently usable implicitly but rejected explicitly. Erroring in both paths removes that inconsistency. Deprecation is surfaced as a `warning` only where it is *informational* (e.g. a registry entry referenced in docs), never where it selects a reviewer. |
| C122-8 | Normative docs carry **no committed model enumeration** | Remove enumerated model ids from the § 2.2/§ 2.2.1 ladder prose and replace them with a **stable pointer** to `schemas/models.json` (plus the `harness` command that prints the current ladder). No generated block is committed | A committed generated block would still change on every registry edit, so a freshness verifier would reject a registry-only diff until docs were regenerated — i.e. not a one-file change after all. A pointer has nothing to regenerate and nothing to drift. |
| C122-9 | Missing/corrupt registry | **Fail closed** with a clear error — no silent fallback to schema defaults | A silent fallback contradicts both the single-source decision and C122-7's fail-closed unknown-model rule, and would mask a packaging defect. `schemas/` already ships in the package `files:` list, so registry-absent is a broken install, not a supported configuration. |
| C122-10 | History is not rewritten | Historical model references in `LEARNINGS.md`, `project/clickstops/done/**`, `CHANGELOG.md`, past attestations, and deliberate alternate-model fixtures are untouched | Same reasoning as CS116's C116-6: those are evidence, not policy. Registry validation applies to *current config*, never to recorded history. |
| C122-11 | Out of scope | (a) auto-discovery of vendor-available models over the network; (b) tightening the independence gate to reject all implementer/reviewer overlap (CS116 C116-9(b)); (c) changing which model is primary | (a) makes the harness network-dependent and non-deterministic in CI — explicitly rejected; (b) is a separate policy change; (c) is a config edit, not this CS. |

## Deliverables

1. `schemas/models.json` + `schemas/models.schema.json` per C122-1/C122-2/C122-3, seeded with the current ladder: `gpt-5.6-sol` (current, reviewer, `rung: 0`), the intermediate GPT rungs (aspirational), and `sonnet-4.6` (current, reviewer, highest rung).
2. `scripts/validate-schemas.mjs` — **explicitly register** `models.schema.json` in the `schemaFiles` list (`:36-41`) and add validation of `models.json` against it. Placing files under `schemas/` does **not** auto-validate them; the list is hand-maintained.
3. `lib/models-registry.mjs` — loader + accessors (`selectableReviewers()`, `rungOf(id)`, `statusOf(id)`, `successorOf(id)`), enforcing the C122-3 uniqueness rule and the C122-5 `rung(fallback) > rung(primary)` invariant at load, failing closed per C122-9.
4. `bin/harness.mjs` — `--model` allowlist + help text derived from the registry; the `['gpt-5.6-sol','sonnet-4.6']` literal at `:4272` deleted.
5. `lib/review.mjs` — rung-based generalisation per C122-5; runtime default derived from config → schema → registry.
6. `lib/reviews-policy.mjs` + the review-evidence checks — validate configured models against the registry per C122-7.
7. `REVIEWS.md` § 2.2/§ 2.2.1 — committed model enumeration removed and replaced by a stable pointer per C122-8, with `template/composed/**` mirrors in lockstep; a linter asserts no normative doc contains a literal reviewer-model id outside historical/evidence sections.
8. Tests: registry load/validate; explicit schema registration; rung uniqueness; **the C122-5 invariant rejecting a config where the fallback ranks better than the primary**; selectable-set derivation; unknown model → error; **deprecated configured primary/fallback → error naming `successor`, in both implicit and explicit selection paths (C122-7)**; missing registry → fail closed; rung-based fallback rationale; HIGH-RISK restriction across ≥3 rungs (the case CS116 could not express); the no-literal-model-ids docs linter.
9. `OPERATIONS.md`/`INSTRUCTIONS.md`/`CONVENTIONS.md` updated to point at the registry as the source of truth (mirrors in lockstep); `CHANGELOG.md` `[Unreleased]` entry (Minor — new capability, no breaking config change).

## User-approval gates

- **G122-1:** the seeded registry encodes which intermediate GPT rungs become genuinely selectable. Confirm the exact ladder membership and ordering with @henrik-me before implementing — CS116 deliberately left these unselectable, so making them selectable reverses a reviewed decision (legitimately, per C116-9(a), but it should be an explicit choice).
- **G122-2:** if implementation shows C122-5's generalisation cannot preserve current HIGH-RISK behaviour exactly for the two-model case, escalate rather than adjusting HIGH-RISK semantics in passing.
- **G122-3:** C122-8 removes model names from normative review policy prose in favour of a pointer to the registry. Confirm this is acceptable for `REVIEWS.md`, since a reader can no longer see the ladder without running a command or opening the registry.

## Exit criteria

1. Registering, re-ranking, or deprecating an **unconfigured** model is a single edit to `schemas/models.json` — no `bin/harness.mjs`, `lib/review.mjs`, normative-doc, or fixture edit, and nothing to regenerate. Changing the *primary*, or deprecating the **currently configured** primary/fallback, additionally requires the `reviews.rubber_duck_model` / `reviews.fallback_model` policy value and its schema default to be migrated (C122-6/C122-7).
2. `harness review --model` accepts every non-deprecated registry reviewer and rejects unknown ids with a message naming the valid set.
3. A configured-but-unregistered model fails; a configured **deprecated** primary/fallback fails identically in both implicit and explicit paths, naming its `successor`; a missing/corrupt registry fails closed.
4. HIGH-RISK + auto-rationale behaviour for the current `{gpt-5.6-sol, sonnet-4.6}` pair is **unchanged** (regression-tested), the C122-5 invariant rejects an inverted ranking, and the behaviour now also holds for intermediate rungs.
5. No normative doc contains a literal reviewer-model id outside historical/evidence sections.
6. `node --test` 0 fail; `harness lint` 0 fail; `sync --mode=check` no drift.
7. Plan-vs-implementation review Go before close-out.

## Risks + open questions

| # | Risk / what breaks | Mitigation |
|---|---|---|
| R1 | Reintroducing CS116's R4 — a selectable model that bypasses the `fallback_model`-only auto-rationale/HIGH-RISK logic. | C122-5 generalises that logic to rung comparison **and** pins the `rung(fallback) > rung(primary)` invariant at load, **before** C122-4 widens the selectable set; exit criterion 4 regression-tests the current pair and the inverted-ranking rejection. Order matters — do not land C122-4 first. |
| R2 | Registry becomes another thing to keep in sync with docs — the very problem being solved. | C122-8 removes committed model enumeration from the docs entirely in favour of a pointer, so there is nothing to regenerate and nothing to drift; a linter asserts no literal reviewer-model id reappears in normative prose. |
| R3 | Failing closed on a missing registry (C122-9) breaks a consumer whose package somehow lacks `schemas/models.json`. | `schemas/` is already in the package `files:` list, so an npm/npx install is atomic — registry-absent means a corrupt install, which should fail loudly. If a concrete non-atomic consumer scenario is found during implementation, escalate rather than quietly adding a fallback. |
| R4 | Model ids are vendor-controlled strings that can change or vanish without notice, so the registry can be stale in a way the harness cannot detect. | Accepted — C122-11(a) rules out network discovery. `status: deprecated` + `successor` make staleness a *managed*, human-curated fact rather than a silent one. |
| R5 | Scope creep into "which model should we use" debates. | C122-11(c): this CS changes no policy value. The primary stays `gpt-5.6-sol` as CS116 set it. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R4 | gpt-5.6-sol | claude-opus-5 | cs119-123-plan-review (omni-ah) | 4dd202f93aec | 2026-07-25T01:56:50Z | Go | Go — registry ordering, fallback safeguards, deprecation semantics, stable documentation pointers, validation, and qualified one-file operations are coherent. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per § Claim) | planned | — | — |

## Notes / Learnings

- Scope map (read-only, `main` @ `8deaa32`): model ids hard-coded at `bin/harness.mjs:508,519,4272-4273`; `lib/review.mjs:28-29`; `schemas/harness.config.schema.json:171-181`; plus docs, composed mirrors, and fixtures.
- This CS is the designated home for CS116 **C116-9(a)**; C116-9(b) (independence-gate tightening) remains unclaimed.

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
