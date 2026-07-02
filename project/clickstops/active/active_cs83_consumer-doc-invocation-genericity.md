# CS83 — Consumer-doc invocation-form genericity: fix #370 harness-repo invocation paths in shipped onboarding docs

**Status:** active
**Owner:** omni-ah-c2
**Branch:** cs83/content
**Started:** 2026-07-02
**Closed:** —
**Filed by:** omni-ah-c2 (Claude Opus 4.8), 2026-07-02 — filed from inbound consumer-feedback issue #370 (discovered by `henrik-me/sub-invaders`'s v0.10.0→v0.11.0 adoption review, reporter `omni-si`). Re-files the command-example half of #356 that CS81 left unaddressed.
**Depends on:** none (hard). Builds on CS72 (consumer-template genericity guard, `scripts/check-consumer-template-genericity.mjs`) and the existing `lib/templating.mjs` `{{key}}` engine. Coordinated with planned CS76 (which targets `template/composed/OPERATIONS.md` cross-ref lines): CS83 edits **disjoint invocation lines** in OPERATIONS.md (C83-6) and merges first; CS76 rebases.

## Goal

Make every command **invocation example** in the consumer-shipped harness docs runnable in a consumer repo, closing issue #370. Consumers invoke the harness as `npx -y github:henrik-me/agent-harness#<ref> <cmd>`; the shipped templates currently tell them to run `node bin/harness.mjs <cmd>` and `node scripts/<harness-script>.mjs`, neither of which exists in a consumer (`bin/harness.mjs` is not shipped; `scripts/*.mjs` are harness-repo-only). Fix the consumer-shipped onboarding docs **and** the `OPERATIONS.md` process base to render the correct form per render context (harness self-host vs consumer) using the existing templating engine, and extend the CS72 genericity guard with an invocation scan so the regression cannot recur.

## Background

Issue #370 (inbound, class **harness bug — not user error**) reports that harness-managed core template prose instructs consumers to run harness-repo-local paths. Because these live in managed/composed core (not consumer-owned local blocks), a consumer cannot fix them without `harness sync --mode=check` reporting drift. Especially acute since CS72 ships `.github/copilot-instructions.md` by default: it becomes active repository custom instructions an agent reads every session, and `INSTRUCTIONS.md` is the "re-read after every `git pull`" quick-reference — an agent following either literally in a consumer runs a non-existent command.

Verified inventory of the **invocation** bug class in the five in-scope onboarding docs (grep `\bnode\s+bin/harness\.mjs` / `\bnode\s+scripts/[\w-]+\.mjs`):

| File (class) | Instances | Form |
|---|---|---|
| `template/composed/INSTRUCTIONS.md` | 3 (L93, L110, L111) | `node bin/harness.mjs {startup,lint,sync}` |
| `template/composed/.github/copilot-instructions.md` | 3 (L56, L192, L193) | `node scripts/{validate-schemas,check-pr-body}.mjs` |
| `template/managed/RETROSPECTIVES.md` | 6 (L201,244,273,381,382,383) | `node scripts/check-learnings.mjs` |
| `template/managed/READMEGUIDE.md` | 2 (L302, L308) | `node scripts/check-readme.mjs` |
| `template/managed/TRACKING.md` | 0 invocations (L195, L225 are **prose** source-refs) | — no change |

Key mechanics verified in the tree:
- Sync renders templates through `applyTemplating(templateRaw, config.templating ?? {})` (`lib/sync.mjs:1140,1192`); the engine is **non-strict** by default (`lib/templating.mjs` `strict=false`), so an unresolved `{{key}}` is emitted **literally** with no guard. A new placeholder therefore MUST have a value for every consumer or it ships as literal `{{harness_invoke}}` — worse than the bug.
- Templates already use `{{...}}` placeholders (`{{agent_suffix}}`, `{{repo_slug}}`, `{{project_name}}`), so the self-host renders its own root docs from these same sources; the render-context gate the issue asks for is exactly this engine.
- `templating` is an **open** string map in `schemas/harness.config.schema.json:265-279` (`additionalProperties: {type:string}`) — a new key needs **no** schema change.
- The established consumer-invoke convention is `npx -y github:henrik-me/agent-harness#<ref>` (README.md; `template/managed/.github/workflows/harness-drift.yml` uses `github:henrik-me/agent-harness#${CLI_REF}`).
- No per-linter CLI verb exists; `harness lint` is the aggregate lint runner. Verified against the `harness lint` registry (`bin/harness.mjs`): it DOES run `check-{learnings,readme,pr-body,planning-locality,text-encoding,templates}.mjs`, so those single-linter examples map accurately to `{{harness_invoke}} lint`. It does **NOT** run `scripts/validate-schemas.mjs` (an AJV+js-yaml harness-repo-dev tool that self-validates `schemas/*.json` + example/learning fixtures — not applicable to a consumer, which authors no harness schemas). Consumer config-schema conformance is instead validated by `harness sync --mode=check` (`lib/sync.mjs` imports Ajv2020).
- The same invocation bug class ALSO exists in `template/composed/OPERATIONS.md` (8 instances: L224, L692, L1217, L1225, L1709, L1745, L2383, L2520). CS83 now includes an **invocation-only** OPERATIONS.md pass (C83-6) to fully close #370; the composed process-doc bases `REVIEWS.md`/`CONVENTIONS.md` carry no invocations today but join the guard's invocation scope for future-proofing.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C83-1 | What counts as the bug (invocation vs prose) | Fix only consumer-invalid **invocation** forms — a `node bin/harness.mjs …` or `node scripts/<harness-script>.mjs …` **run command**. Leave **prose/backtick source-file references** (e.g. TRACKING.md "the canonical implementation lives in `bin/harness.mjs`"; INSTRUCTIONS.md "Add a new subcommand to `bin/harness.mjs`") untouched — they describe harness layout, are not run, and do not cause the `Cannot find module` failure #370 describes. Audit **every** occurrence in the in-scope files; TRACKING.md has only prose → no change (correcting #370's evidence table, which counted its two prose refs as invocations). | Precise scoping avoids both the real breakage (run commands) and false edits/false-positives on legitimate documentation prose. |
| C83-2 | Render-context gate mechanism | Use the existing `lib/templating.mjs` engine, not hardcoding. Add one placeholder `{{harness_invoke}}` that expands to the CLI-invocation prefix. Self-host renders `node bin/harness.mjs`; consumers render the npx form. | The five docs are shared between the self-host (which renders its own roots via `harness sync` and must keep the local dev copy `node bin/harness.mjs` — an `npx …#<ref>` would fetch published code, not the copy under test) and consumers. Templating is the "gate on file class / render context" the issue names, and the only mechanism already wired through sync. |
| C83-3 | Consumer default injection point (load-bearing) | Inject a **computed default** in `lib/sync.mjs`, merged UNDER config: `applyTemplating(tpl, { harness_invoke: <default>, ...config.templating })`. `<default>` = `npx -y github:henrik-me/agent-harness#<ref>`, where `<ref>` is the consumer's `config.version` when it is a usable ref, else the literal reader placeholder `#<ref>`. ONLY the self-host root `harness.config.json` sets `templating.harness_invoke = "node bin/harness.mjs"` to **override** the default. Do **NOT** seed `harness_invoke` into `template/seeded/harness.config.json`: because the merge lets any `config.templating` key win, a seeded static value would permanently override the computed `config.version`-based default for every fresh consumer (and single-pass templating means a seeded `#{{version}}` would not re-resolve). | Because sync reads `config.templating` verbatim and templating is non-strict, a missing key ships literal `{{harness_invoke}}`. A sync-side default (config overrides it) means **every** consumer — fresh AND existing — gets the correct, pin-aware form on next sync with **no re-init**; only the self-host overrides. Hardcoding the harness slug matches `harness-drift.yml` precedent (a consumer's own `repo_slug` is its project, not the harness). |
| C83-4 | Single-linter script examples (map accurately) | Map each `node scripts/<check>.mjs` example to the command that is actually equivalent — verified against the `harness lint` registry, NOT assumed. `check-learnings`/`check-readme`/`check-pr-body`/`check-planning-locality`/`check-text-encoding`/`check-templates` ARE in `harness lint` → `{{harness_invoke}} lint`. `validate-schemas.mjs` is NOT in `harness lint` and is harness-repo-only (validates the harness's own schemas) → drop it from consumer docs; where the intent is consumer config-schema conformance (copilot-instructions.md Hard Rule #4), map to `{{harness_invoke}} sync --mode=check`. Rewrite the copilot-instructions.md "if `harness` is not on PATH, run scripts directly" fallback block to the `{{harness_invoke}}` forms (a consumer has no `scripts/`). | Prevents shipping a FALSE equivalence (the reviewer confirmed `harness lint` does not run `validate-schemas`). Accepted cost (R3): the self-host's rendered `RETROSPECTIVES.md`/`copilot-instructions.md`/`OPERATIONS.md` sub-agent-self-check guidance swap targeted single-linter tips for the `harness lint` aggregate; harness devs can still run the script directly. The implementer MUST fact-claim-verify each mapping (REVIEWS.md § 2.6a) and never assert `harness lint` validates schemas. |
| C83-5 | Guard extension — two scope sets (recurrence prevention) | Extend `scripts/check-consumer-template-genericity.mjs` (issue's explicit suggestion) with a SEPARATE `INVOCATION_SCOPE_SET` and two `node `-anchored patterns: `\bnode\s+bin/harness\.mjs\b` and `\bnode\s+scripts/[\w-]+\.mjs\b`. The existing LRN/CS/slug **anchor** patterns stay on the original 5-file `SCOPE_SET`; the new **invocation** patterns scan a BROADER set — every consumer-shipped composed+managed process/onboarding doc: the 5 + `template/composed/OPERATIONS.md` + `REVIEWS.md` + `CONVENTIONS.md`. Reuse `scanLine`/`allowList`/`--allow`. Fixtures: invocation form → fail; prose source-ref (`` `bin/harness.mjs` ``) → pass; `{{harness_invoke}} lint` → pass; content with legit `CSNN`/`LRN-NNN` tokens is NOT flagged by the invocation scan. | Two scope sets keep the invariants orthogonal: OPERATIONS.md legitimately carries `CSNN`/`LRN-NNN` tokens (so it cannot join the anchor scan — CS72 C72-3), but its INVOCATIONS must be guarded. The `node ` anchor separates a broken invocation from a legitimate prose source-ref. Extending the existing single-purpose guard (vs a new script) is **not** a new-linter SemVer trigger. |
| C83-6 | OPERATIONS.md IN scope — invocation-only pass | Fix all 8 invocation instances in `template/composed/OPERATIONS.md` so #370's bug class is fully closed. Seven are consumer-runnable command examples → `{{harness_invoke}} <cmd>` (L224/L692/L1217/L1225/L2383/L2520 → `{{harness_invoke}} lint`; L1709 → `{{harness_invoke}} pr-evidence`). L1745 is legit harness-CI prose that *intentionally* contrasts the clone-then-`node bin/harness.mjs` pattern with `npx` (explaining why CI avoids npx) — **reword** it to drop the `node ` prefix (becoming a prose source-ref) rather than templating it, so no allowlist is needed and the invocation guard passes. Also reword the L1216-1225 self-check prose so it describes the `{{harness_invoke}} lint` aggregate (not targeted per-file/per-script checks). Do NOT touch OPERATIONS.md cross-ref lines (that is CS76's scope). | Fully closes #370 rather than shipping a partial fix (reviewer F1). The invocation-only, line-disjoint edits avoid collision with planned CS76 (which edits sibling cross-ref lines); CS83 merges first, CS76 rebases. Rewording L1745 keeps the guard allowlist-free. |
| C83-7 | Lockstep with self-host mirrors | Edit `template/` sources, then `harness sync --mode=apply` to regenerate the self-host root `INSTRUCTIONS.md` + `OPERATIONS.md` + managed `RETROSPECTIVES.md`/`READMEGUIDE.md`/`TRACKING.md` + composed `.github/copilot-instructions.md`; gate on `harness sync --mode=check` = no drift + `check-composed-blocks`. Root `INSTRUCTIONS.md` stays byte-identical (override → `node bin/harness.mjs`); the rendered `RETROSPECTIVES.md`/`copilot-instructions.md`/`OPERATIONS.md` change per C83-4/C83-6. | The repo self-hosts; the drift check + composed-blocks lockstep enforce that the managed-core sections agree after rendering. Roots are not byte-identical to sources (placeholders are substituted), so the gate is drift-check, not file equality. |
| C83-8 | SemVer, blast radius, issue closure | Classify **Minor** (`harness_invoke` is a new backward-compatible optional `templating` key → "New optional config field", § SemVer policy); no schema change. Touch ONLY: the 5 in-scope templates (INSTRUCTIONS/copilot-instructions/RETROSPECTIVES/READMEGUIDE + OPERATIONS.md) + their rendered self-host mirrors, root `harness.config.json` (self-host override only), `lib/sync.mjs` + tests, `scripts/check-consumer-template-genericity.mjs` + its tests/fixtures, `.harness-lock.json` (sync-apply rewrites rendered-file hashes), `LEARNINGS.md`, `CHANGELOG.md`. Regenerate mirrors + lock via commit-content-then-`harness sync --mode=apply --resolved-sha <commit-sha>` (LRN-070 ordering) so lock provenance points at the content commit. CHANGELOG `[Unreleased]` Fixed entry noting the new templating var. Reference #370 non-closingly; user (or merge) closes it (G-issue-close). | Honors the SemVer table; bounded blast radius; the lock records rendered managed/composed hashes so it moves when those rendered contents change (root INSTRUCTIONS.md stays byte-identical); sync-apply may additionally normalize a pre-existing stale lock entry (the `INSTRUCTIONS.md` class path), so the implementer reviews the full lock diff (D11). |

## Deliverables

1. `template/composed/INSTRUCTIONS.md` + rendered root `INSTRUCTIONS.md` (edit, lockstep) — 3 invocations → `{{harness_invoke}} {startup,lint,sync …}` (C83-1/2).
2. `template/composed/.github/copilot-instructions.md` + rendered root (edit, lockstep) — Hard-Rule-#4 line → `{{harness_invoke}} lint` / `sync --mode=check`; validation fallback block rewritten to `{{harness_invoke}}` forms, dropping the harness-repo-only `validate-schemas` line (C83-4).
3. `template/managed/RETROSPECTIVES.md` + rendered root (edit, lockstep) — 6 `node scripts/check-learnings.mjs` examples → `{{harness_invoke}} lint` (C83-4).
4. `template/managed/READMEGUIDE.md` + rendered root (edit, lockstep) — 2 `node scripts/check-readme.mjs` examples → `{{harness_invoke}} lint` (C83-4).
5. `template/composed/OPERATIONS.md` + rendered root (edit, lockstep) — 7 invocation examples → `{{harness_invoke}} …`; L1745 reworded to a prose source-ref (C83-6). ALSO reword the surrounding self-check prose bullets (L1216-1225: "Text-encoding check on every modified file", "templates linter") so they describe the `{{harness_invoke}} lint` **aggregate** (which runs text-encoding over the cwd + templates among its linters), not a targeted per-file/per-script check. Invocation lines only; no cross-ref edits (CS76's scope).
6. root `harness.config.json` (edit) — add `templating.harness_invoke = "node bin/harness.mjs"` (self-host override only; C83-3). `template/seeded/harness.config.json` is deliberately NOT touched (C83-3).
7. `lib/sync.mjs` (edit) — compute + merge the `harness_invoke` default UNDER `config.templating` before `applyTemplating` (C83-3).
8. `tests/*.test.mjs` (new/edit, `os.tmpdir()` only) — sync-rendering tests: consumer (no config key) renders the npx form; self-host/override renders `node bin/harness.mjs`; `config.version` ref threading + `<ref>` fallback; no literal `{{harness_invoke}}` leaks. Minimum one test per branch; over-delivery welcome.
9. `scripts/check-consumer-template-genericity.mjs` (edit) — separate `INVOCATION_SCOPE_SET` (5 onboarding docs + OPERATIONS.md + REVIEWS.md + CONVENTIONS.md) + two `node `-anchored invocation patterns; anchor patterns unchanged on the 5-file scope (C83-5).
10. `tests/*.test.mjs` (edit, fixtures) — guard fixtures: invocation → fail; prose source-ref → pass; `{{harness_invoke}}` → pass; content with legit `CSNN`/`LRN-NNN` tokens not flagged by the invocation scan.
11. `.harness-lock.json` (edit, via `harness sync --mode=apply`) — refresh rendered hashes for the changed managed/composed mirrors. **Expect a possibly-broader refresh than the four moved hashes**: the current lock records `INSTRUCTIONS.md` under a stale `template/managed/` class path while config now classes it `composed`, and sync-apply rebuilds lock entries from the current config classes, so apply may also normalize that pre-existing entry. The implementer reviews the FULL lock diff, keeps it minimal, and escalates any normalization unrelated to this CS; final `harness sync --mode=check` must be green (C83-8).
12. `LEARNINGS.md` (edit) — new LRN capturing the shared-doc render-context-invocation invariant + the non-strict-templating "missing key ships literally" gotcha (flip to `applied` with merge SHA at close-out).
13. `CHANGELOG.md` (edit) — `[Unreleased]` Fixed entry (C83-8).

## User-approval gates

- **G-invoke-form** — confirm the consumer default form: `npx -y github:henrik-me/agent-harness#<ref>` with `<ref>` = the consumer's pinned `config.version` (fallback literal `#<ref>`), vs a version-less `npx -y github:henrik-me/agent-harness` (always-latest). Plan default: pin-from-`config.version` with `<ref>` fallback (C83-3).
- **G-issue-close** — confirm whether the agent or the user closes #370 at merge (agent-does-not-file/close-issues convention).

## Exit criteria

- No consumer-shipped composed/managed process or onboarding doc (the 5 + `OPERATIONS.md`; `REVIEWS.md`/`CONVENTIONS.md` guard-covered) contains a consumer-invalid `node bin/harness.mjs` / `node scripts/<x>.mjs` **invocation**; the extended guard fails on a reintroduced one and passes the remediated tree.
- A consumer render (no `harness_invoke` in config) produces the `npx …` form; the self-host render (override) produces `node bin/harness.mjs`; no literal `{{harness_invoke}}` ships.
- `harness sync --mode=check` = no drift; `check-composed-blocks` green; root `INSTRUCTIONS.md` byte-identical.
- `node bin/harness.mjs lint --quiet` exits 0; full `node --test tests/*.test.mjs` passes.
- Issue #370 closed (by user or at merge per G-issue-close).

## Risks + open questions

- **R1 — non-strict templating ships a missing key literally.** If any consumer lacks `harness_invoke` and no default is injected, `{{harness_invoke}}` renders verbatim. Mitigated by the C83-3 sync-side computed default (config overrides it); a test asserts the no-config-key consumer path.
- **R2 — guard false-positives on prose.** The two new patterns are anchored on the `node ` prefix so backtick source-refs (`` `bin/harness.mjs` ``) pass; fixtures lock the fail case, the prose-pass case, and that legit `CSNN`/`LRN-NNN` tokens are not flagged by the invocation scan (C83-5).
- **R3 — self-host DX broadening (C83-4).** The self-host's rendered `RETROSPECTIVES.md`/`copilot-instructions.md`/`OPERATIONS.md` sub-agent-self-check guidance lose targeted single-linter tips in favour of `harness lint`. Accepted (no per-linter consumer CLI exists); harness devs can still run `node scripts/<check>.mjs` directly, and the CHANGELOG/LRN note it.
- **R4 — residual invocation surface.** With OPERATIONS.md now in scope (C83-6), the remaining consumer-shipped process bases `REVIEWS.md`/`CONVENTIONS.md` carry no invocations today; they join the invocation guard scope so a future one is caught. #370's bug class is fully closed for the shipped surface.
- **R5 — CS76 collision on OPERATIONS.md.** Planned CS76 edits OPERATIONS.md cross-ref lines; CS83 edits disjoint invocation lines (+ reworded L1745). CS83 merges first; CS76 rebases. Low textual-overlap risk; flagged for the CS76 owner.
- **R6 — false command equivalence.** Mapping a script example to the wrong CLI command (e.g. claiming `harness lint` validates schemas) would ship a new inaccuracy. Mitigated by C83-4 (registry-verified mappings) + the implementer's mandatory fact-claim verification (REVIEWS.md § 2.6a).
- **OQ1 — pinned-ref vs version-less default** — resolved by G-invoke-form (plan default: pin-from-`config.version`).

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | cs83-plan-review | 8e8543279c19 | 2026-07-02T05:35:04Z | Go-with-amendments | GPT-5.5: Needs-Fix (OPERATIONS.md scope, seeded-key conflict, validate-schemas not in lint, lock-diff) all addressed; Go-with-amendments after self-check prose reword + broader lock refresh |

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | omni-ah-c2 |
| Reviewer agent | rubber-duck (orchestrator: omni-ah-c2) |
| Notes | **Minor** SemVer (new optional `harness_invoke` templating key; no schema change). Independence per REVIEWS § 2.3 — reviewer `gpt-5.5` ≠ implementer `claude-opus-4.8`. Plan reviewed by gpt-5.5 (Go-with-amendments, hash `8e8543279c19`). |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1 — Onboarding-doc invocation fixes: INSTRUCTIONS / copilot-instructions / RETROSPECTIVES / READMEGUIDE template sources → `{{harness_invoke}}` / `{{harness_invoke}} lint` (C83-1/2/4) | pending | omni-ah-c2 | agent-id=cs83-templates \| role=implementer \| report-status=pending \| learnings=0. OWNs ONLY the 4 template SOURCES (not rendered roots). |
| T2 — OPERATIONS.md invocation-only pass: 7 examples → `{{harness_invoke}} …`; reword L1745 + L1216-1225 self-check prose (C83-6) | pending | omni-ah-c2 | agent-id=cs83-operations \| role=implementer \| report-status=pending \| learnings=0. OWNs ONLY `template/composed/OPERATIONS.md`; invocation lines only, no cross-ref edits (CS76). |
| T3 — Sync computed default + self-host override + tests: `lib/sync.mjs` merges `harness_invoke` default under config; `harness.config.json` sets `node bin/harness.mjs`; sync-rendering tests (C83-3) | pending | omni-ah-c2 | agent-id=cs83-lib \| role=implementer \| report-status=pending \| learnings=0. OWNs ONLY `lib/sync.mjs`, `harness.config.json`, its new test file. |
| T4 — Guard extension: `check-consumer-template-genericity.mjs` `INVOCATION_SCOPE_SET` + 2 node-anchored patterns + fixtures/tests (C83-5) | pending | omni-ah-c2 | agent-id=cs83-guard \| role=implementer \| report-status=pending \| learnings=0. OWNs ONLY the linter + its tests/fixtures. |
| T5 — Integration (orchestrator): regenerate rendered mirrors via `harness sync --mode=apply`, refresh `.harness-lock.json`, CHANGELOG `[Unreleased]`, LEARNINGS entry; full lint + tests green (C83-7/8) | pending | omni-ah-c2 | orchestrator-owned; runs after T1–T4 land. |
| Close-out: docs + restart state | pending | omni-ah-c2 | Update WORKBOARD.md, CONTEXT.md, and rendered mirrors so a fresh agent can restart from actual state. |
| Close-out: learnings + follow-ups | pending | omni-ah-c2 | File/disposition LEARNINGS.md; flag the CS76 OPERATIONS.md rebase; create follow-up CSs for anything unresolved. |

## Notes / Learnings

- Closes inbound #370; re-files the command-example half of #356 (link/anchor half was fixed by CS81). Sibling to #352 (fixed in v0.11.0).
- Distinct from CS72's anchor-genericity invariant (no harness-internal LRN/CS/slug tokens) and CS76's cross-ref-resolvability invariant (refs resolve against the synced set): this is the **invocation-form** invariant (run commands are consumer-valid per render context).
- Plan review: the single R1 attestation row consolidates two GPT-5.5 passes — an initial Needs-Fix (agent `cs83-plan-review`) whose four findings were all applied, then a Go-with-amendments confirmation (agent `cs83-plan-review-r2`) whose two non-blocking amendments were applied before the hash was pinned.

## Plan-vs-implementation review

> _(filled at close-out per the gate)_
