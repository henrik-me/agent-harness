# CS81 — Fix v0.10.0 shipped-template dangling refs + resolvability guards (#352-F1 + #356)

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** omni-ah-c2 (Claude Opus 4.8), 2026-07-01 — from the consumer-feedback triage of issues **#352** (Finding 1) and **#356**, filed by the sub-invaders orchestrator (`omni-si`) during the v0.10.0 pin adoption. @henrik-me directed a two-CS split (this CS = doc dangling-ref fixes + guards; CS82 = the sync lock-provenance code fix).
**Depends on:** none (hard). Adjacent to **CS76** (composed-process-doc cross-ref resolvability, planned R4=Go) which guards a *different* dangling-ref sub-class (non-guaranteed sibling refs in OPERATIONS/REVIEWS); see C81-8 for coordination. No in-flight CS owns these files.

## Goal

Fix the three confirmed dangling references shipped in the v0.10.0 consumer templates, and add resolvability guards so each class fails `harness lint` in the harness's own CI before shipping:

1. **#352-F1** — `OPERATIONS.md` cites placeholder learning IDs `LRN-A` / `LRN-B` (never assigned at CS70 close-out); the real IDs are **LRN-164** / **LRN-165**.
2. **#356a** — `INSTRUCTIONS.md` cross-links `OPERATIONS.md#sub-agent-report-shape`, a **stale anchor** (the heading gained a `(mandatory)` suffix → `#sub-agent-report-shape-mandatory`).
3. **#356b** — `template/managed/READMEGUIDE.md` links `docs/adr/000{1,2}-*.md`, which exist at the harness root but are **not** under `template/`, so they 404 in every consumer.

## Background

All three verified against `main` (HEAD `1e129fb`):

- `OPERATIONS.md:157` `... (CS70 / LRN-A).`; `:591` `... (CS70 / LRN-B).`; `:602` `... see LRN-B).` — identical in root **and** `template/composed/OPERATIONS.md` (shared managed-core region). `LEARNINGS.md` has `### LRN-164` (`source_cs: CS70`, process, applied — directory-form close-out doctrine) and `### LRN-165` (`source_cs: CS70`, architectural, applied — cross-repo phantom-artifact). So `LRN-A`→`LRN-164`, `LRN-B`→`LRN-165`.
- `INSTRUCTIONS.md:267` (+ `template/composed/INSTRUCTIONS.md:267`) `[OPERATIONS.md § Sub-agent report shape](OPERATIONS.md#sub-agent-report-shape)`; the target heading is `OPERATIONS.md:1382` `### Sub-agent report shape (mandatory)` → GitHub anchor `#sub-agent-report-shape-mandatory`.
- `template/managed/READMEGUIDE.md:9` `(see [ADR 0002 — Root README is project-owned, not synced](docs/adr/0002-readme-ownership.md))` and `:338` `(seeded file class per [ADR 0001](docs/adr/0001-file-classes.md))`. `docs/adr/` exists at the harness root but is absent from `template/` (nothing seeds it), so these dangle in consumers.

**Why no gate caught them:** `scripts/check-instructions.mjs` validates LRN anchors + in-doc anchors + ADR files **only for INSTRUCTIONS.md** — it does not lint `OPERATIONS.md`/`REVIEWS.md` prose (so `LRN-A/B` slip through) nor cross-file `OPERATIONS.md#anchor` targets (so the stale anchor slips through). `scripts/check-consumer-template-genericity.mjs` scans `READMEGUIDE.md` but only for banned tokens (`LRN-`/`CS`/slug), not broken relative paths.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C81-1 | Scope | Fix the **three** confirmed dangling-ref bugs + add a regression guard for each class. **Not** a full genericization of the OPERATIONS/REVIEWS composed bases' CS/LRN shorthand (they contain many `CSNN`/`LRN-NNN` institutional references; genericizing all of them is a separate, larger effort — CS72 deliberately scoped the process-doc bases OUT). | Bounded blast radius that closes #352-F1 + #356 without conflating them with the much larger consumer-doc-genericization program. |
| C81-2 | LRN-A/B remediation form | Replace with **bare** `LRN-164` / `LRN-165` tokens (matching the surrounding bare `CS70` / `LRN-A` style), **not** `[LRN-164](LEARNINGS.md#lrn-164)` links. Lockstep root + `template/composed/OPERATIONS.md` (currently byte-identical in this region). | The composed `OPERATIONS.md` **ships to consumers**; a `LEARNINGS.md#lrn-164` link would 404 in every consumer (they have no harness `LEARNINGS.md`), *worsening* the #356 dangling-link class. The issue's "house link style" suggestion is therefore explicitly declined for the shipped base — a bare token that resolves in the harness (guard-checked, C81-5a) is correct. |
| C81-3 | INSTRUCTIONS anchor remediation | Fix the **anchor** → `OPERATIONS.md#sub-agent-report-shape-mandatory` (both INSTRUCTIONS copies, lockstep). Do **not** strip `(mandatory)` from the OPERATIONS heading. | Fixing the anchor is a one-token change touching two files; the heading suffix is intentional emphasis. (The ref is also a CS76-class non-guaranteed-*sibling* ref — OPERATIONS.md may not be synced by a given consumer; qualifying it is CS76's concern, C81-8, out of scope here.) |
| C81-4 | READMEGUIDE docs/adr remediation | **Genericize** (per @henrik-me): drop/reword the two `(see ADR …)` pointers, keeping the explanatory prose (`:9` "Your README.md … never touched by sync."; `:338` "consumer-owned (seeded file class)."). Edit `template/managed/READMEGUIDE.md` only (verify no root render at implementation). | Matches the consumer-cleanliness doctrine (ship nothing harness-internal / nothing that dangles). The prose already conveys the meaning; the ADR pointer is supplementary. |
| C81-5 | Resolvability guards (recurrence prevention) | Add validations that would have caught each bug, **self-host-only by package name**, **node-builtins only** (run under the dependency-free `.harness-ci` clone): **(a)** every `LRN-\d+` token — and any placeholder `LRN-[A-Z]` — in `OPERATIONS.md` + `REVIEWS.md` prose resolves to a `### LRN-NNN` heading in `LEARNINGS.md`; **(b)** a cross-file `X.md#anchor` link (where `X.md` is a repo doc) resolves to a heading in `X.md` (extends the in-doc-anchor check to cross-file; applied at least to `INSTRUCTIONS.md` → `OPERATIONS.md`/`REVIEWS.md`); **(c)** a relative-path **file** link in a consumer-**onboarding** doc — `template/managed/READMEGUIDE.md` + the CS72 onboarding set (`INSTRUCTIONS.md`, `.github/copilot-instructions.md`, `TRACKING.md`, `RETROSPECTIVES.md`) — resolves to a target that ships under `template/`. It deliberately does **not** scan the composed **process-doc** bases (`OPERATIONS.md`/`REVIEWS.md`/`CONVENTIONS.md`), which carry pervasive relative `docs/adr/*` links pending the separate process-doc genericization (C81-1, out of scope; recorded as follow-up R3). Guard is a **new** node-builtins-only script (C81-6). Fixture tests (`os.tmpdir()` only) cover each branch: dead LRN token (fail), placeholder `LRN-A` (fail), resolving token (pass); stale cross-file anchor (fail), valid (pass); relative link to a non-shipped path (fail), to a shipped path (pass). | The issue's own recommended hardening. Makes each dangling-ref class mechanical and permanent. Self-host-only because these guard the harness's own template authoring; node-builtins only because review-gate linters run from a `node_modules`-free clone (LRN-147). |
| C81-6 | SemVer + guard form | Implement as a **new** node-builtins-only script (`scripts/check-doc-xref-resolvability.mjs`). **Not** an extension of `check-instructions.mjs`: that script imports `lib/doc-schema.mjs` → `js-yaml` (a runtime dep), so it is not node-builtins-only and cannot back a dependency-free guard. The three checks (LRN-token → `### LRN-NNN` heading match, cross-file anchor → heading match, relative-link → path existence under `template/`) need only regex + `fs` — no YAML/AJV. A new linter script ⇒ **Minor** per § SemVer policy. | `check-instructions.mjs`'s js-yaml dependency (via `doc-schema.mjs`) rules out extending it under the node-builtins-only constraint; a new single-purpose builtins-only script is the clean path (matches CS76 C76-7) and honestly drives the Minor bump the policy assigns a new linter. |
| C81-7 | Lockstep + drift | Edit `template/composed/{OPERATIONS,INSTRUCTIONS}.md` sources **and** root mirrors identically in the touched (non-templated) regions; gate is `check-composed-blocks` lockstep + `harness sync --mode=check` = no drift. `READMEGUIDE.md` is a `template/managed/` file with no root render. | The repo self-hosts; managed-core sections must agree after rendering. |
| C81-8 | Coordination with CS76 | Keep the guards **single-purpose**: CS76 guards non-guaranteed-*sibling* cross-refs; CS81 guards *anchor*/​*LRN-token*/​*relative-path* resolvability. Do **not** merge them. Sequence: whichever of CS76/CS81 lands first, the other rebases its `template/composed/OPERATIONS.md` edit. | Distinct invariants (CS76 C76-7's own single-purpose rationale). Both edit the composed OPERATIONS base, so only sequencing is needed, not consolidation. |
| C81-9 | Blast radius + issue closure | Touch: `OPERATIONS.md`, `template/composed/OPERATIONS.md`, `INSTRUCTIONS.md`, `template/composed/INSTRUCTIONS.md`, `template/managed/READMEGUIDE.md`, `REVIEWS.md` + `template/composed/REVIEWS.md` (**only** if the C81-5a audit finds dangling/placeholder LRN tokens there), the new guard script (`check-doc-xref-resolvability.mjs`) + tests, `LEARNINGS.md`, `CHANGELOG.md`. No `schemas/` change. The pervasive relative `docs/adr/*` links in the composed process bases (`OPERATIONS.md` 937/1552/1571/2416, `CONVENTIONS.md` 123/131/144) are **not** remediated here (C81-1) and the C81-5c guard excludes those bases — recorded as follow-up R3. The content PR references #352 + #356 non-closingly. | Bounded scope; issues are inbound consumer feedback whose closure is the deliverable's success signal (G-issue-close). |

## Deliverables

1. `OPERATIONS.md` + `template/composed/OPERATIONS.md` (edit, lockstep) — `LRN-A`→`LRN-164`, `LRN-B`→`LRN-165` (bare) at the three sites (C81-2).
2. `INSTRUCTIONS.md` + `template/composed/INSTRUCTIONS.md` (edit, lockstep) — anchor → `#sub-agent-report-shape-mandatory` (C81-3).
3. `template/managed/READMEGUIDE.md` (edit) — genericize the two `docs/adr` pointers (C81-4).
4. `scripts/check-doc-xref-resolvability.mjs` (new, node-builtins-only) + `harness lint` wiring — the three resolvability validations, self-host-only by package name (C81-5/C81-6). Drives the **Minor** SemVer.
5. `tests/*.test.mjs` (new, `os.tmpdir()` only) — fixtures per C81-5 (each pass/fail branch).
6. `REVIEWS.md` (+ mirror) — only if the C81-5a audit finds placeholder/dead LRN tokens (else untouched).
7. `LEARNINGS.md` (edit) — file a learning capturing the placeholder-token / cross-file-anchor / consumer-relative-link gate gaps and their guards (flip to `applied` at close-out with the merge SHA).
8. `CHANGELOG.md` (edit) — `[Unreleased]` Fixed entry + the new-linter note (C81-6 is a new script ⇒ Minor).

## User-approval gates

- **G-issue-close** — confirm whether the agent or @henrik-me closes #352 / #356 at merge (per the agent-does-not-close-issues convention).

## Exit criteria

- No shipped template contains any of the three dangling refs; each new guard **fails** on a reintroduced instance and **passes** the remediated tree.
- `check-composed-blocks` lockstep + `harness sync --mode=check` stay green (no drift).
- `node bin/harness.mjs lint --quiet` exits 0 (baseline + new checks); full `node --test tests/*.test.mjs` passes.
- #352-F1 + #356 addressed in both `template/composed/` and root mirrors; issues closed per G-issue-close.

## Risks + open questions

- **R1 — guard false positives on legitimate prose.** OPERATIONS/REVIEWS legitimately mention doc filenames descriptively. The C81-5b/c checks target **linked** references (`](X.md#…)` / `](path)`), not bare filename mentions, avoiding the CS76-class false-positive surface; the C81-5a LRN check targets the `LRN-[A-Z0-9]+` token shape. Fixture tests lock the boundary.
- **R2 — genericity vs resolvability tension in OPERATIONS/REVIEWS.** These composed bases still carry `CSNN`/`LRN-NNN` shorthand that dangles in consumers (not this CS's scope, C81-1). The C81-5a guard only asserts such tokens **resolve in the harness** (self-host), it does not make them consumer-clean — full genericization remains a separate effort.
- **R3 — pervasive relative `docs/adr/*` refs in composed process bases.** Beyond READMEGUIDE, relative `docs/adr/*` refs appear in `OPERATIONS.md` + `CONVENTIONS.md` — markdown links at `OPERATIONS.md` 1571/2416 + `CONVENTIONS.md` 123 (these dangle in consumers), plus bare/code-span mentions at `OPERATIONS.md` 937/1552 + `CONVENTIONS.md` 131/144. They are **not** fixed here (C81-1 scope) and the C81-5c guard **excludes** those bases to stay turn-on-able; recorded as a follow-up (candidate CS on the process-doc genericization track, alongside CS76). Note some OPERATIONS ADR refs are already absolute GitHub URLs (resolve fine); a future pass converts the relative links or qualifies them.
- **(Resolved, C81-6) Guard is a new node-builtins-only script** `check-doc-xref-resolvability.mjs` ⇒ **Minor** SemVer (drives the Phase-3 release level).
- **OQ2 — scan rendered roots too?** Lockstep keeps roots ↔ composed equal, so scanning the `template/composed/` source (+ root INSTRUCTIONS/OPERATIONS) suffices; scanning both is cheap defence-in-depth.

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | cs81-plan-review | 196f6f9c1161 | 2026-07-02T00:08:03Z | Needs-Fix | docs/adr pervasive beyond READMEGUIDE (would trip guard); extending check-instructions breaks node-builtins-only (js-yaml via doc-schema). |
| R2 | gpt-5.5 | claude-opus-4.8 | cs81-plan-review-r2 | 5a5a2582e0d1 | 2026-07-02T00:14:03Z | Go-with-amendments | Both R1 blockers fixed: guard scoped to onboarding docs (excludes process bases); new builtins-only script ⇒ Minor. Amend R3 wording (md-links vs mentions). |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per OPERATIONS.md § Claim) | planned | — | — |

## Notes / Learnings

- Closes #352-F1 + #356. Distinct from CS76 (sibling-cross-ref resolvability) — see C81-8.

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
