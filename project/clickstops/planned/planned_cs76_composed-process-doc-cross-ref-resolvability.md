# CS76 — Composed process-doc cross-ref resolvability: fix #229 dangling sibling refs + guard

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** omni-ah-c3 (Claude Opus 4.8), 2026-06-30 — filed from the open-LRN harvest triage requested by @henrik-me, adopting **LRN-170** (the second, distinct consumer-doc-cleanliness invariant CS72 deliberately carved out) and closing the consumer→harness feedback issue **#229**.
**Depends on:** none (hard). Builds on CS72 (consumer-template genericity guard, `scripts/check-consumer-template-genericity.mjs`) and the CS58 § 2.6a/2.6c fact-claim doctrine. No in-flight CS owns the composed process-doc bases.

## Goal

Make every cross-reference in the **consumer-shipped composed process-doc bases** (`template/composed/OPERATIONS.md`, `template/composed/REVIEWS.md`) resolve against a surface the consumer is **guaranteed** to have — closing issue #229's dangling references to `INSTRUCTIONS.md` / `.github/copilot-instructions.md` — and add a guard so the regression cannot recur. This is the second consumer-doc invariant LRN-170 names, distinct from CS72's anchor-genericity guard.

## Background

CS72 made the 5 consumer *onboarding* docs anchor-generic (no `LRN-NNN` / `CSNN` / slug tokens) and guarded it with `scripts/check-consumer-template-genericity.mjs`. It deliberately scoped OUT the composed *process-doc* bases (C72-3) and a second failure mode (LRN-170): a consumer-shipped composed base can cross-reference a **sibling file the consumer may not sync**, producing a dangling ref in the rendered consumer doc. Such a ref contains no banned anchor token, so CS72's guard passes it.

Issue #229 (filed from `henrik-me/sub-invaders`'s v0.7.0 pin-bump PR #85) documents the concrete breakage:

- **A (primary) — broken cross-refs to non-synced files.** `template/composed/OPERATIONS.md` and `REVIEWS.md` point at `INSTRUCTIONS.md` / `.github/copilot-instructions.md` as canonical sources (e.g. `template/composed/OPERATIONS.md:228,579,682`; `template/composed/REVIEWS.md:226,333` — the § 2.6a F3 "Source of truth" column lists `INSTRUCTIONS.md`). A consumer whose `harness.config.json` does not sync those files renders dangling references it **cannot fix locally** (composed sections are regenerated verbatim by `harness sync`, so a local edit fails `harness-sync-check`). #229 enumerated a representative subset by its *rendered-consumer* line numbers; the live **template** bases contain **additional** unqualified cross-refs (e.g. `template/composed/OPERATIONS.md:2228` "bootstrap sanity-check passes per `INSTRUCTIONS.md`", `:2314`), so remediation is **audit-driven over every occurrence**, not limited to the issue's cited lines — and must spare legitimate *descriptive* mentions (e.g. `:1942` lists `INSTRUCTIONS.md` as a delivered doc).
- **B — inaccurate doctrine wording.** `template/composed/OPERATIONS.md:614` heads the issue-creation procedure "non-mutating to consumer labels", but its step 2 (`:636-644`) *creates* the `harness-orchestrator` label when missing (`:646-649` only avoids `--force`/overwrite). Rephrase to "non-destructive / non-overwriting (no `--force`)".
- **C — path-precision nit.** `template/composed/REVIEWS.md:592` uses `pr-evidence-lint.yml` where the full `template/managed/.github/workflows/pr-evidence-lint.yml` form is used elsewhere in the same file (`:603`).

Because the repo self-hosts, every composed-base edit is propagated to the rendered repo-root `OPERATIONS.md` / `REVIEWS.md` via `harness sync` (templating placeholders such as `{{agent_suffix}}` are substituted in the roots, so the roots are **not** byte-identical to the source); the `check-composed-blocks` lockstep lint + `harness sync --mode=check` enforce that the managed-core sections agree **after rendering**.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C76-1 | Cross-ref remediation principle (audit-driven) | **Audit every occurrence** of a not-guaranteed sibling (`INSTRUCTIONS.md`, `.github/copilot-instructions.md`) in `template/composed/OPERATIONS.md` + `REVIEWS.md` and classify each as a **cross-reference** (a canonical-source pointer a consumer would follow) or a **descriptive mention** (prose naming the file, e.g. the delivered-docs list at `OPERATIONS.md:1942`). Every cross-reference must then either (a) point at an **in-document section** shipped in the same composed file, or (b) be **explicitly qualified** optional with a single documented qualifier phrase (e.g. "the harness `INSTRUCTIONS.md` *(if your consumer syncs it)*") — there is no universally "always-present" sibling doc to retarget to (C76-2). Descriptive mentions are left as-is and recorded in the guard allowlist (C76-3). Remediation is **not** limited to #229's cited lines. | Matches #229's suggested fixes; removes the dangling-ref class without deleting useful pointers or rewriting legitimate prose. Auditing every occurrence (not just the issue's subset) prevents leaving sibling dangling refs the guard would then flag. |
| C76-2 | The not-guaranteed sibling set (curated; no positive guarantee) | The guard bans **unqualified** references to an explicit, curated set of **not-guaranteed siblings** — `INSTRUCTIONS.md` and `.github/copilot-instructions.md` — the docs #229 identified and that selective consumers omit (sub-invaders' `harness.config.json` syncs neither). There is **no** universally "guaranteed-present" doc to retarget to: a consumer's synced set is its own `composed.files`/`managed.files` selection (`lib/sync.mjs` builds the work list from `config.composed.files`; `schemas/harness.config.schema.json` defines `files` as a selectable array), so even an `OPERATIONS.md`→`REVIEWS.md` cross-ref is not guaranteed to resolve. Safe remediation is therefore **in-document section** refs or **explicit qualification** (C76-1), never "point at another always-present doc". The not-guaranteed token set is explicit, updatable config in the guard, scoped to the siblings actually observed to dangle. | A positive "guaranteed-present" claim is unsupported by the config schema (any composed/managed doc is selectable); the sound, bounded scope is a curated ban-list of the siblings #229 observed dangling, plus retargets that depend on **no** cross-doc presence assumption. |
| C76-3 | Guard linter — occurrence + allowlist (recurrence prevention) | Add a guard (new `scripts/check-composed-xref-resolvability.mjs`; form resolved in C76-7) registered in `harness lint`, self-host-only **by package name** (as CS72's guard is), node-builtins only (runs under the dependency-free `.harness-ci` clone). It scans the composed process-doc bases and **fails on every occurrence of a not-guaranteed-sibling filename token** (`INSTRUCTIONS.md`, `.github/copilot-instructions.md`) that is **neither** (a) accompanied by the documented qualifier phrase in the same line/context **nor** (b) listed in an explicit, **commented in-script allowlist of audited descriptive mentions** (each entry keyed by an unambiguous anchor — the descriptive phrase — with a one-line justification). This occurrence-based rule catches *both* the prose `per INSTRUCTIONS.md` form *and* the bare F3 "Source of truth" table-cell form (which a `see`/`per`/`in` regex would miss), while the allowlist prevents false positives on legitimate prose. Fixture tests: unqualified prose ref (fail), unqualified table-cell ref (fail), qualified ref (pass), allowlisted descriptive mention (pass), newly-introduced unqualified ref (fail). | Makes the LRN-170 invariant permanent and mechanical without the false-positive/false-negative failure of a naive "hard cross-ref" heuristic: matching *every* occurrence is reliable, and a small curated allowlist is the only sound way to permit genuine descriptive prose. Self-host-only because it governs the harness's own template authoring. |
| C76-4 | Lockstep with root mirrors (templating-aware) | Edit the `template/composed/{OPERATIONS,REVIEWS}.md` **source**, then re-render the root `OPERATIONS.md` / `REVIEWS.md` via `harness sync`. Root and template are **not** byte-identical in general — templating placeholders are substituted in the rendered root (e.g. `template/composed/OPERATIONS.md:1179` `{{agent_suffix}}` → root `ah`) — but the lines this CS touches are non-templated prose, so the **touched** content matches across both while placeholders stay rendered in roots. The gate is `check-composed-blocks` lockstep + `harness sync --mode=check` (not full-file byte equality). The guard targets the `template/composed/` source; scanning the rendered roots too is optional defence-in-depth (OQ2). | The repo self-hosts; the composed-blocks lockstep + sync-check enforce that managed-core sections agree *after rendering*. Claiming full byte equality is inaccurate and would mis-instruct the implementer to strip placeholders from roots. |
| C76-5 | Fix B + C in the same pass | Apply #229-B (relabel "non-mutating to consumer labels" → "non-destructive / non-overwriting (no `--force`)") and #229-C (full workflow path) in the composed bases + root mirrors. | They are the same fact-claim-accuracy class (§ 2.6a F2/F3) in the same files; fixing them together avoids a second pass and keeps #229 fully closed. |
| C76-6 | Scope + #229 closure | Touch only `template/composed/{OPERATIONS,REVIEWS}.md`, root `{OPERATIONS,REVIEWS}.md`, the new guard script + tests, `LEARNINGS.md`, `CHANGELOG.md`. No `schemas/` change. The content PR references #229 non-closingly; the user closes it per the agent-does-not-close-issues convention (or it is closed at merge per repo practice — see G-issue-close). | Bounded blast radius; #229 is inbound consumer feedback and its closure is the deliverable's success signal. |
| C76-7 | SemVer + guard form (resolves OQ1) | Implement the guard as a **new** `scripts/check-composed-xref-resolvability.mjs` (keeps it single-purpose and distinct from CS72's anchor-genericity guard, per LRN-170's own framing). Per `OPERATIONS.md § SemVer policy` ("New linter script added" ⇒ **Minor**, `template/composed/OPERATIONS.md:2179`), classify this CS as **Minor**. CHANGELOG `[Unreleased]` → Fixed (the consumer doc correction) plus the new-linter note that drives the Minor trigger. | The SemVer table is explicit that a new linter script is a Minor bump regardless of self-host scope; honoring it avoids a plan-vs-policy conflict at close-out. A new script (vs extending CS72's guard) keeps the two invariants — anchor genericity vs cross-ref resolvability — cleanly separated. |

## Deliverables

1. `template/composed/OPERATIONS.md` + root `OPERATIONS.md` (edit, lockstep) — remediate #229-A cross-refs (C76-1) + #229-B label wording (C76-5).
2. `template/composed/REVIEWS.md` + root `REVIEWS.md` (edit, lockstep) — remediate #229-A F3 "Source of truth" ref (C76-1) + #229-C path precision (C76-5).
3. `scripts/check-composed-xref-resolvability.mjs` (new) — the occurrence-based not-guaranteed-sibling-ref guard with qualifier + commented allowlist (C76-3), node-builtins only, registered in `harness lint`, self-host-only by package name; documents the qualifier phrase + allowlist format.
4. `tests/*.test.mjs` (new, `os.tmpdir()` only) — guard fixtures matching C76-3: clean base (pass), unqualified prose ref (fail), **unqualified table-cell ref (fail)**, qualified ref (pass), allowlisted descriptive mention (pass), newly-introduced unqualified ref (fail). Minimum coverage of each branch; over-delivery welcome.
5. `LEARNINGS.md` (edit) — flip LRN-170 `open → applied` at close-out with the merge SHA; cross-ref #229.
6. `CHANGELOG.md` (edit) — `[Unreleased]` Fixed entry (consumer-doc cross-ref correctness + guard).

## User-approval gates

- **G-xref-approach** — confirm the C76-1 remediation style (qualify-in-place vs retarget-to-in-document-section) before sweeping all sites, since it sets the documented qualifier the guard enforces.
- **G-issue-close** — confirm whether the agent or the user closes #229 at merge (per the agent-does-not-close-issues convention).

## Exit criteria

- No consumer-shipped composed process-doc base contains an unqualified hard cross-reference to a not-guaranteed sibling; the new guard fails on a reintroduced one and passes the remediated tree.
- #229-A/B/C all addressed in both `template/composed/` and the root mirrors; `check-composed-blocks` lockstep + `harness sync --mode=check` stay green.
- `node bin/harness.mjs lint --quiet` exits 0; full `node --test tests/*.test.mjs` passes.
- Issue #229 closed (by user or at merge per the G-issue-close decision).

## Risks + open questions

- **R1 — false positives on descriptive mentions (mitigated by C76-3).** Composed bases legitimately *describe* the onboarding-doc set (e.g. `template/composed/OPERATIONS.md:1942` lists `INSTRUCTIONS.md` as a delivered doc). The occurrence + commented-allowlist rule (C76-3) handles this: every occurrence must be qualified or explicitly allowlisted, so descriptive prose is permitted only via a justified allowlist entry — no fuzzy "is this a cross-ref?" heuristic. Residual risk: the allowlist must be re-audited when the composed bases change — covered by the guard failing on any *new* unqualified occurrence.
- **R2 — "guaranteed-present" is consumer-config-dependent.** The set is an explicit assumption (C76-2), not derivable from any single consumer's config; if a future change makes `INSTRUCTIONS.md` universally delivered, the set must be updated. Encode it as documented config, not a magic constant.
- **(Resolved, C76-7) Guard is a new script** `check-composed-xref-resolvability.mjs` (not an extension of CS72's guard), keeping anchor-genericity and cross-ref-resolvability as separate single-purpose invariants; this drives the Minor SemVer.
- **OQ2 — scan the rendered roots too, or only the `template/composed/` source?** Lockstep keeps them equal, so scanning the source suffices, but scanning both is cheap defence-in-depth.

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | CS76-plan-review | 6ed4811b0a82 | 2026-06-30T20:09:00Z | Needs-Fix | Guard 'see/per/in' heuristic misses F3 table-cell refs + false-positives on descriptive mentions; byte-equal mirroring overstated; SemVer patch vs new-linter=Minor policy. |
| R2 | gpt-5.5 | claude-opus-4.8 | CS76-review-r2 | 7c7efc9e7ff2 | 2026-06-30T20:24:00Z | Needs-Fix | Occurrence+allowlist guard sound; stale 'byte-equal' Background; C76-6 'new/extended' lingering; C76-2 guaranteed-present set unsupported (composed docs consumer-selectable). |
| R3 | gpt-5.5 | claude-opus-4.8 | CS76-review-r3 | 13d94dbc1c18 | 2026-06-30T20:35:00Z | Go-with-amendments | All R2 fixes landed; guard implementable. Applied final amendment: dropped 'reference-always-present-doc' from G-xref gate (contradicted C76-1/2). |
| R4 | gpt-5.5 | claude-opus-4.8 | cs76-review-r4 | c414a4892321 | 2026-06-30T21:09:00Z | Go | Renumber confirmation CS74->CS76 (sibling-orchestrator CS74 collision); decision IDs C74->C76; content otherwise unchanged from R3; substance + #229 citations intact. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per § Claim) | planned | — | — |

## Notes / Learnings

- Adopts LRN-170; closes #229. Distinct from CS72's anchor-genericity guard (that = no harness-internal anchors; this = cross-refs resolve against the guaranteed-synced set).

## Plan-vs-implementation review

> _(filled at close-out per the gate)_
