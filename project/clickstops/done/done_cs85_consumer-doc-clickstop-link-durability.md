# CS85 — Consumer-doc clickstop-link durability: bootstrap-authoring doctrine + a link-durability guard (fixes #371, harness-side)

**Status:** done
**Owner:** omni-ah-c2 (Claude Opus 4.8)
**Branch:** cs85/content
**Started:** 2026-07-02
**Closed:** 2026-07-02 (content merge `0e505c5`, PR #386)
**Filed by:** omni-ah-c2 (Claude Opus 4.8), 2026-07-01 — filed at @henrik-me's request from inbound bug **#371** (a `henrik-me/sub-invaders` bootstrap-authored `ARCHITECTURE.md` that links into a now-404 harness `project/clickstops/active/active_cs16…` path and duplicates the CS16 decision table). Harness-side root cause only; the consumer-side cleanup is **explicitly out of scope** (tracked separately in the consumer repo) — per @henrik-me, this CS does **no** cross-repo commits/PRs and instead files an inbound "addressed" issue in `sub-invaders` at close-out.
**Depends on:** none (hard). Builds on **CS70** (`done_cs70_bootstrap-summary-doctrine-and-stale-links` — bootstrap-summary doctrine + cross-repo pre-flight; fixed #290) and the CS72/CS81 consumer-doc guard family (`scripts/check-consumer-template-genericity.mjs`, `scripts/check-doc-xref-resolvability.mjs`). Same failure family as **#229** (CS76, planned) and **#370** (CS83, done). No in-flight CS owns `OPERATIONS.md`'s composed core except paused **CS65** (Risks R4).

## Goal

Close the harness-side root cause of **#371**: the bootstrap-authoring step embedded harness-**transient** and harness-**institutional** content into a durable consumer doc — (a) a link into a `project/clickstops/active/active_cs16…` path that 404s the moment CS16 closed out (active → done), and (b) a duplicated `### CS16 technology decisions` table plus inline `(C16-xx)` provenance tags. Deliver a **bootstrap-authoring durability doctrine** (never author transient-clickstop links or duplicated harness decision tables/provenance into durable consumer docs) **and a mechanical guard** that fails on the link-durability class so it cannot regress — in the harness's own controllable surface and, per the recommended scope, in consumer repos at `harness lint` time (which is exactly where #371's class of defect lives). The clean `template/seeded/ARCHITECTURE.md` is confirmed unaffected — the rot came from the ad-hoc CS16 authoring step, not the template.

## Background

**The concrete breakage (#371).** During CS16 (the sub-invaders bootstrap), the AUTHORING step wrote into sub-invaders' `ARCHITECTURE.md`: (1) a hard link to `…/blob/…/project/clickstops/active/active_cs16_bootstrap-sub-invaders/…` — a **transient** path that GitHub 404s after close-out renamed `active/ → done/`; and (2) a verbatim copy of the harness clickstop's `### CS16 technology decisions (C16-9..C16-16)` table and ~10 inline `(C16-xx)` decision tags. Both are harness-internal artefacts that do not belong in a consumer's durable architecture doc. This is the same "harness-internal content leaks into consumer docs" family as #229 (CS76), #290 (CS70), and #370 (CS83), but a distinct, still-open instance: the **transient-link + decision-table-duplication** class.

**What already exists (and why #371 is residual).** CS70 (#290) established bootstrap doctrine for a *different* symptom — an orphaned harness-internal `sub-invaders-bootstrap-summary.md`: it declared that file harness-internal-only, taught close-out to preserve directory-form CS files, and added a cross-repo pre-flight (don't file issues to update non-existent consumer files). CS72/CS81 guard *onboarding-doc genericity* and *doc-xref resolvability* — but both are self-host-gated and neither scans for a link into a **transient `active/` clickstop path**, nor for duplicated clickstop decision tables. So #371's class is unguarded.

**Harness surface is currently clean (verified read-only, HEAD `072bc8e`).** No harness root doc or `template/**` file contains an absolute `blob/…/project/clickstops/active/…` permalink, and `template/seeded/ARCHITECTURE.md` contains no `CS16` / `(C16-…)` / `clickstops/active` content. So the guard lands green on the harness and is **preventive** here; its consumer-side value (recommended scope C85-3) is to surface exactly the #371-class rot that lives in consumer repos when they run `harness lint` in CI.

**Why a permalink into `active/` is a durability bug, but a SHA-pinned one is not.** A branch-pinned URL (`blob/main/…` or `blob/<branch>/…`) into `…/project/clickstops/active/active_csNN…` resolves only while that CS is active; close-out `git mv`s the file to `done/`, so the branch URL 404s. A **commit-SHA permalink** (`blob/<40-hex>/…active/…`) pins the historical tree and keeps resolving — so the guard must **allow** SHA-pinned permalinks and flag only branch-pinned ones (C85-2). The doctrine's preferred remediations are, in order: **no link**, a **commit-SHA permalink**, or a **stable `done/` pointer**.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C85-1 | Bootstrap-authoring durability doctrine | Add a `### Consumer-doc bootstrap-authoring durability invariant` section to `OPERATIONS.md` (composed core, next to the CS72 "Consumer-template genericity invariant", L1990), covering **two sub-classes**: (i) never author a link into a **transient** `project/clickstops/active/…` path in a durable consumer doc (prefer no link → commit-SHA permalink → stable `done/` pointer); (ii) never copy a harness clickstop **decision table** or inline `(C<NN>-<n>)` provenance tags into a durable consumer doc (reference a single stable pointer instead). Ships to consumers (generic advice: applies to a consumer's own clickstop workflow too). | Doctrine is the primary root-cause fix (the bug was an authoring-behavior gap); co-locating with the existing consumer-doc invariant family keeps the doctrine discoverable and mirrors #371's own "Suggested fix". |
| C85-2 | Link-durability guard (new linter) | Add `scripts/check-clickstop-link-durability.mjs` — node-builtins-only, registered in `harness lint` (`clickstop-link-durability`), with a `harness lint --explain` entry + a `bin/harness.mjs` help bullet. **The `package.json` name selects the SCAN MODE, not a consumer no-op** (unlike CS72/CS81, which `target:null`-skip in consumers): in the harness self-host it scans the self-host doc set (C85-3), and in a consumer it scans the consumer doc set — it must **run in both**, since #371's rot lives in consumer repos. The rule is generic (no harness-internal token reads), so it does not false-fail in consumers. It scans for **branch-pinned** absolute GitHub permalinks matching `https?://github.com/<o>/<r>/blob/<ref>/…project/clickstops/active/…` — including URLs bearing a trailing `#fragment` and refs containing `/` — where `<ref>` is **not** a 40-hex commit SHA. SHA-pinned permalinks pass. Each hit → an actionable message naming the transient-path rot + the 3 preferred remediations (C85-1). | The link class is the clearest, lowest-false-positive mechanical rule; a new script (not extending CS81) keeps a single-responsibility guard and is the policy-correct SemVer trigger (C85-5). Scan-mode-by-package-name (vs consumer no-op) is required so the guard actually catches the consumer-side defect. |
| C85-3 | Guard scope + consumer-active (**RESOLVED — R1 GPT-5.5 Go-with-amendments**) | (a) **ERROR in both modes** — the rule is narrow/low-FP, SI is the known defect target, and the Minor release notes + the C85-4 SI issue are the migration path (no WARN ramp needed). (b) **File sets:** self-host scans repo-root `*.md` **plus `template/**/*.md`** (composed/managed/seeded templates can carry the same rot, and the C85-1 doctrine itself lands in `template/composed/OPERATIONS.md`); consumer scans repo-root `*.md` plus `.github/copilot-instructions.md` and `.github/pull_request_template.md` when present. **Both modes exclude** `project/clickstops/**` (legitimate workflow refs), `.git`, `node_modules`, and `tests/fixtures/**` (self-host). (c) **No broad provenance/decision-table guard in CS85** — existing process docs carry legitimate `(C<NN>-<n>)` tags (e.g. `REVIEWS.md:560`), so broad matching would false-fail; that sub-class stays **doctrine-only** (C85-1). A future exact `### CS\d+ technology decisions` / `(C\d+-\d+)` check scoped strictly to `ARCHITECTURE.md` may be added later if warranted. | Consumer-active ERROR maximizes real-world value and aligns with the SI notify issue (C85-4); scanning all `template/**` closes the rot surface the root-render coverage misses; keeping the provenance sub-class doctrine-only avoids the guaranteed false-fail on legitimate in-doc decision tags. |
| C85-4 | SI notification — inbound issue only (no cross-repo update) | At close-out (after the harness fix merges), **idempotently** file exactly one issue in `henrik-me/sub-invaders` (`harness-orchestrator` label; prefer `harness cross-repo open-issue`) stating #371's harness-side root cause is **addressed** and pointing SI to remediate its own `ARCHITECTURE.md` (remove the 404 `active/cs16` link + the duplicated CS16 decision table). First check for an existing tracking issue to stay idempotent. **No commit/branch/PR** to sub-invaders (Hard Rule §6). | Directly executes @henrik-me's instruction ("don't do any cross repo updates … file an issue in the si repo saying this issue has been addressed"); an inbound issue is the sanctioned cross-repo handoff, not a "cross-repo update". |
| C85-5 | SemVer = **Minor** | A new linter script fires the `OPERATIONS.md § SemVer policy` "New linter script added ⇒ **Minor**" trigger (L2229). CHANGELOG `[Unreleased]`: **Added** (the guard) + **Fixed**/**Documentation** (the doctrine). This CS does **not** cut a release — versioning is a separate user-initiated action. | Policy-driven; recorded so the eventual release CS bumps correctly. |
| C85-6 | Scope + issue closure | Touch: `OPERATIONS.md` (composed core + root mirror, lockstep C85-7); `scripts/check-clickstop-link-durability.mjs` (new); `tests/cs85-clickstop-link-durability.test.mjs` (new, `os.tmpdir()` only) + `tests/fixtures/**` as needed; `bin/harness.mjs` (register + help + `--explain`); `CHANGELOG.md`; `LEARNINGS.md` (new applied LRN at close-out). **No `schemas/` change.** The agent **closes #371** at PVI-GO (matching the #370/CS83 precedent this session; INSTRUCTIONS.md forbids the agent *opening* harness-repo issues, not closing a resolved one — OPERATIONS.md § issue-closure). | Bounded blast radius; #371 closed + the SI issue filed are the success signals. |
| C85-7 | Lockstep with the root `OPERATIONS.md` mirror | Edit `template/composed/OPERATIONS.md` (the composed source) and re-render the root mirror in lockstep; the new doctrine prose is non-templated, so root and source match. Gate: `check-composed-blocks` lockstep + `harness sync --mode=check` stay green. If `sync --mode=apply` fail-closes on the CS55-era stale `.harness-lock.json`, use the documented `mergeComposed` bootstrap regeneration (leave `.harness-lock.json` untouched; `sync --mode=check` compares root-vs-rendered-template, not the lock — LRN-179). | Self-host lockstep enforces managed-core agreement after rendering; the LRN-179 workaround avoids a false-positive drift failure. |

## Deliverables

1. `template/composed/OPERATIONS.md` + root `OPERATIONS.md` (edit, lockstep C85-7) — add the `### Consumer-doc bootstrap-authoring durability invariant` doctrine section (C85-1), and a one-line pointer from the existing bootstrap/cross-repo doctrine so it is discoverable at authoring time.
2. `scripts/check-clickstop-link-durability.mjs` (new) — the branch-pinned-`active/`-permalink guard (C85-2); node-builtins-only. The `package.json` name selects the SCAN MODE (self-host vs consumer doc set per C85-3) — it **runs in both** (does not `target:null`-skip consumers).
3. `bin/harness.mjs` (edit) — register the `clickstop-link-durability` check in the `harness lint` registry so it runs in **both** self-host and consumer mode with the correct per-mode target/args (C85-3; do **not** set `target:null` for consumers), add the `--explain` entry, and add the help-text bullet next to `check-doc-xref-resolvability`.
4. `tests/cs85-clickstop-link-durability.test.mjs` (new) + `tests/fixtures/**` — cover: branch-pinned `active/` permalink (fail); the **exact #371 URL shape** — `blob/main/…/project/clickstops/active/…#anchor` with a trailing `#fragment` (fail); a branch **ref containing `/`** into an `active/` path (fail); SHA-pinned `active/` permalink (pass); `done/` permalink (pass); no-link prose (pass); relative `active/` workflow ref in an excluded `project/clickstops/**` path (pass/ignored); a `template/**` self-host hit (fail); consumer-mode vs self-host-mode file-set gating; and a newly-introduced violation (fail). `os.tmpdir()` only — never write under REPO_ROOT.
5. `CHANGELOG.md` (edit) — `[Unreleased]`: **Added** (guard) + **Fixed**/**Documentation** (doctrine); Minor (C85-5).
6. `LEARNINGS.md` (edit) — new `applied` LRN at close-out (merge SHA): the transient-clickstop-link + decision-table-duplication class, its doctrine + guard, and the consumer-active scope decision; cross-ref #371, #290/CS70, #229/CS76, #370/CS83.
7. **SI notification issue** (C85-4) — one idempotent `harness-orchestrator`-labelled issue in `henrik-me/sub-invaders`; URL recorded in the done file. No commit/PR to sub-invaders.

## User-approval gates

- **G-guard-scope** — **RESOLVED (R1, GPT-5.5 Go-with-amendments, 2026-07-01):** (a) **ERROR** in both self-host and consumer mode (narrow/low-FP rule; Minor release notes + the C85-4 SI issue are the migration path — no WARN ramp); (b) self-host scans root `*.md` + `template/**/*.md`, consumer scans root `*.md` + `.github/copilot-instructions.md` + `.github/pull_request_template.md` (if present), both excluding `project/clickstops/**` / `.git` / `node_modules` / `tests/fixtures/**`; (c) the decision-table/`(C<NN>-<n>)`-provenance sub-class stays **doctrine-only** (broad matching false-fails on legit in-doc tags). Recorded in C85-3.
- **G-si-issue-timing** — file the SI "addressed" issue only **after** the harness fix merges (so "addressed" is true). Recorded in C85-4; no user action required.

## Exit criteria

- No harness root doc / `template/**` file contains a branch-pinned `project/clickstops/active/…` permalink; the guard fails on a reintroduced one and passes the remediated tree.
- The doctrine section ships in `template/composed/OPERATIONS.md` + the root mirror; `check-composed-blocks` lockstep + `harness sync --mode=check` stay green.
- `clickstop-link-durability` is registered in `harness lint` (+ `--explain` + help bullet); `node bin/harness.mjs lint --quiet` exits 0; full `node --test tests/*.test.mjs` passes.
- #371 closed at PVI-GO; the idempotent SI "addressed" issue filed and its URL recorded in the done file.

## Risks + open questions

- **R1 — consumer-facing ERROR is a behavior change (RESOLVED to ERROR, R1).** A consumer-active ERROR guard reddens an existing consumer's CI on next pin bump if their docs carry the rot (SI's does — the intended surfacing; the C85-4 SI issue asks them to fix it). The plan review judged the rule narrow/low-FP enough that no WARN ramp is warranted; the Minor release notes + the SI issue are the migration path. Recorded in C85-3(a).
- **R2 — false positives on legitimate `active/` references.** Harness workflow docs and clickstop files reference `active/` paths in prose/commands and relative links by design. The guard must target only **absolute branch-pinned GitHub blob permalinks into `active/` clickstop paths** and **exclude `project/clickstops/**`** from the scanned set — no fuzzy "is this a clickstop ref?" heuristic. The decision-table/provenance sub-class is doctrine-only unless the review opts into a scoped mechanical check (C85-3).
- **R3 — SHA-pin allowance correctness.** The `<ref>`-is-not-40-hex test admits a pathological all-hex 40-char branch name as "SHA-pinned"; acceptable (astronomically rare, and a SHA-named branch's blob is still stable). Documented, not guarded further.
- **R4 — sequencing vs paused CS65.** CS65 (⏸️ Paused, owner omni-ah-c2, branch `cs65/content`) also rewrites root `OPERATIONS.md`. CS85's single new doctrine section is additive and low-conflict; rebase if CS65 resumes and lands first. CS65 is blocked on user gates, so CS85 may proceed.
- **R5 — doctrine-only fallback.** If plan review judges the guard too risky/complex, ship doctrine-only (C85-1) + the SI issue; #371's "Suggested fix" lists the lint as "Consider" (optional). The guard is preferred (harness mechanical-enforcement culture) but not load-bearing for closing #371.

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | cs85-plan-review | 35cfe6b0ecd5 | 2026-07-02T16:39:54Z | Go-with-amendments | Sound root cause + scope; amended guard wiring so consumer mode really runs (not target:null), widened self-host scan to template/**, added #371-URL fixtures, kept provenance guard doctrine-only. |
## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 (T1 doctrine — orchestrator; T2 guard — sub-agent `cs85-guard`) |
| Reviewer model | gpt-5.5 |
| Implementer agent | omni-ah-c2 |
| Reviewer agent | rubber-duck (orchestrator: omni-ah-c2) |
| Notes | **Minor** SemVer (new linter `check-clickstop-link-durability.mjs`; no schema change). Independence per REVIEWS § 2.3 — reviewer `gpt-5.5` ≠ implementer `claude-opus-4.8`. Plan reviewed by gpt-5.5 (Go-with-amendments, hash `35cfe6b0ecd5`). |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1 — Doctrine: add `### Consumer-doc clickstop-link durability invariant` to `template/composed/OPERATIONS.md` composed core + root mirror next to the CS72 genericity invariant (C85-1) | done | omni-ah-c2 | Orchestrator. Added identical non-templated section to both mirrors (1943 chars, byte-identical → lockstep by construction). Title genericized ("Consumer-doc clickstop-link durability invariant"). composed-blocks 0 errors both files; `sync --mode=check` no-drift; genericity/xref/encoding green. |
| T2 — Guard: new `scripts/check-clickstop-link-durability.mjs` + register in `bin/harness.mjs` + tests/fixtures (C85-2/3) | done | cs85-guard | 389-line guard (pure `scanTextForViolations`/`checkTree` + CLI); branch-pinned `active/` permalink FLAG, 40-hex SHA-pin ALLOW, fence/inline-code SKIP, runs BOTH modes (`target:cwd`, not `target:null`). 32 tests (all pass); regex boundary excludes `\|` for table cells. Fixtures built in `os.tmpdir()` (no static dir, per LRN-076). Help bullet placed in always-run list (not Self-host-only). |
| T3 — Integration (orchestrator): CHANGELOG `[Unreleased]` Added+Fixed; root-mirror lockstep (done in T1); full `harness lint` + `sync --mode=check` + `node --test` green (C85-5/6/7) | done | omni-ah-c2 | CHANGELOG Added (guard) + Fixed (doctrine). Fixed cross-cutting fixture `tests/cs15d-aggregator.test.mjs:129` (linter row count 24/16 → 25/17 — the new always-enabled linter adds one consumer row). Final: `harness lint` **35/0/3**; `sync --mode=check` **no drift**; `node --test tests/*.test.mjs` **1644 pass / 0 fail**. |
| Close-out: docs + restart state | done | omni-ah-c2 | WORKBOARD.md (CS85 row removed), CONTEXT.md (CS85 entry prepended); no rendered-mirror change beyond the merged doctrine. |
| Close-out: learnings + follow-ups | done | omni-ah-c2 | LRN-180 filed (applied, merge `0e505c5`); sub-invaders notify issue filed; #371 auto-closed on merge. No follow-up CSs needed. |

## Notes / Learnings

**Learning candidates (file at close-out):**
- **guard-design / help taxonomy:** a lint guard that runs in BOTH self-host and consumer mode must not be documented under the `harness lint --help` "Self-host-only" heading even when co-located with the self-host-gated doc-guards (genericity/xref) — place it in the always-run list. The runner gates on `args`+`target` presence, independent of the help taxonomy. (cs85-guard, `bin/harness.mjs`.)
- **testing / cross-cutting linter-count fixtures:** adding an always-enabled linter breaks any test asserting an EXACT dispatched-linter row count. `tests/cs15d-aggregator.test.mjs:129` hardcodes the consumer row count; it surfaced only in the FULL `node --test` suite, not the sub-agent's own test file or `harness lint`. Orchestrator must run the full suite at integration when a CS adds a registry entry.
- **guard self-consistency:** the new durability guard scans `template/**` + root docs, so the C85-1 doctrine's own illustrative permalink had to live in an inline-code span (which the guard skips) — a clean end-to-end validation of the fence/inline-code skip logic (`OPERATIONS.md` doctrine example passed the guard).

## Plan-vs-implementation review

**Reviewer:** GPT-5.5 (rubber-duck)
**Date:** 2026-07-02T18:16:54Z
**Outcome:** GO

CS85 maps cleanly to the merged implementation at `0e505c5`. Every planned deliverable is present and correct; no divergences. The `tests/cs15d-aggregator.test.mjs` fixture count bump is the expected consequence of adding an always-enabled linter (assessed in-scope). Verified `harness lint` 35/0/3, CS85 tests 38 pass, `sync --mode=check` no-drift, full `node --test` exit 0. The LRN-180 flip, the sub-invaders notification issue, and #371 closure are close-out tasks (the last auto-closed on merge via `fixes #371`).

| Deliverable | Outcome | Note |
|---|---|---|
| C85-1 / D1 — doctrine | met | "Consumer-doc clickstop-link durability invariant" in `template/composed/OPERATIONS.md` + root mirror (byte-identical), both sub-classes + preferred remediations |
| C85-2/3 / D2-D4 — guard | met | `scripts/check-clickstop-link-durability.mjs`: branch/SHA detection, fence/inline-code skip, both-modes ERROR, scan sets, registered in lint + `--explain` + help (non-null `target`); 38 tests |
| C85-5 — SemVer Minor | met | CHANGELOG `[Unreleased]` Added (guard) + Fixed (doctrine); no `schemas/` change |
| C85-6 — scope | met | Only planned files + the necessary `cs15d` fixture bump; #371 auto-closed on merge |
| Exit criteria | met | No branch-pinned `active/` permalink in the harness surface; guard fails-on-reintroduce/passes-tree; lockstep + sync-check green; lint 0; full tests pass |
