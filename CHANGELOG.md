# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versioning policy and release process: see [OPERATIONS.md § Release process](OPERATIONS.md#release-process).

## [Unreleased]

### Added

- **CS67 (`harness release` verb):** Add `harness release` to mechanize the release cut that `OPERATIONS.md § Release process` documents by hand — a previewable, two-phase, dry-run-first command. Triggers a **minor** bump (new CLI surface). **Phase A** (`--version <x.y.z>` or `--bump <level>`) previews (default — printing a unified diff of every change) or `--apply`s the version bump (`package.json` + `package-lock.json`), the CHANGELOG `[Unreleased] → [x.y.z]` promotion, and the README install-pin sweep, and refuses a SemVer-inconsistent bump (e.g. a patch when `[Unreleased]` advertises a new CLI subcommand — C67-2); it never commits/tags/pushes. **Phase B** (`--publish --version <x.y.z> --sha <squash-sha>`) verifies the SHA — by default it must be the current `origin/main` HEAD (a stale / arbitrary SHA fails); `--pr <n>` **switches** the check so the SHA must instead equal that release PR's squash `mergeCommit.oid` (authoritative even if `origin/main` advanced) and not the branch head; either way `package.json` + CHANGELOG at that SHA must already carry the version — then `--apply` creates an **annotated** tag (`git tag -a v<x.y.z> <sha> -m "Release v<x.y.z>"` + `git push origin v<x.y.z>`, matching `OPERATIONS.md § Release process` step 9) and the GitHub Release on it via `gh release create v<x.y.z> --verify-tag` (release-only, no `--target`) — a **draft by default**, `--no-draft` to publish immediately (G-publish is the human gate either way) — idempotent and resumable (a pre-existing tag+release at the intended SHA is skipped, only consumer notifications retried), and files issue-only consumer notifications (`--consumer`) via `harness cross-repo open-issue` ([Hard Rule § 6](.github/copilot-instructions.md)). Logic lives in the dependency-free `lib/release.mjs` with injectable git/`gh`/fs seams; 67 unit tests write only under `os.tmpdir()`. `OPERATIONS.md § Release process` (+ `template/composed/` mirror) references the verb as the canonical executable path.

### Changed

### Documentation

### Fixed

## [0.9.0] — 2026-06-30

### Added

- **CS66 (review-family verbs — `review-doc` / `review-cs` / `perf-review` / `security-review`):** Add four domain-specific review verbs layered on the CS52 `harness review` orchestration, each making the right checklist invokable at the right lifecycle moment instead of living only as prose in `REVIEWS.md`. Triggers a **minor** bump (new CLI surface; rolls into the pending v0.9.0). Verbs:
  - **`harness review-doc <pr>`** (`lib/review-doc.mjs`, C66-2): dispatches an independent reviewer with the [REVIEWS.md § 2.6a](REVIEWS.md) **F1–F5 fact-claim checklist** (every `--flag` exists in the CLI surface; every file path exists; doctrine-strength claims match the cited source; LRN/CS summaries stay in scope; cross-doc claims are mutually consistent), scoped to the PR diff. Fact-claim drift is the dominant doc-PR failure mode (verified on PR #218).
  - **`harness perf-review <pr>`** (`lib/perf-review.mjs`, C66-4): a diff-scoped performance checklist (hot-path allocations, algorithmic complexity, N+1 / repeated IO, sync-in-async, unbounded growth).
  - **`harness security-review <pr>`** (`lib/security-review.mjs`, C66-5): a diff-scoped security checklist (hard-coded secrets, command/path injection, unsafe deserialization, workflow `permissions` least-privilege, ref/`--body-file` containment, supply-chain pin drift).
  - **`harness review-cs <NN>`** (`lib/review-cs.mjs`, C66-3): a **local, verify-only** clickstop-readiness check — NOT a model-dispatch reviewer. Locates the single planned/active/done file for the CS and aggregates the plan-review attestation gate (`check-clickstop-plan-review.mjs`) and the Plan-vs-implementation (PVI) close-out gate (`check-clickstop.mjs`) into one actionable "is this CS review-complete? what's missing?" report; no model, no `gh`, no PR.

  The three PR-based verbs share one orchestration core (`lib/review-checklist.mjs`, C66-6) that reuses the `harness review` reviewer-independence invariant (`assertReviewerAllowed` — reviewer model ≠ every implementer model) and the canonical reviewer-output shape (`parseReviewerOutput` / `computeVerdict`). All four are **advisory by default** (exit 0) with `--strict` to fail on a non-Go verdict; the model-dispatch verbs invoke **no model** unless a completed reviewer output is supplied via `--reviewer-output` (the default run only composes and prints the dispatch prompt + plan). Logic lives in dep-free `lib/` modules with injectable git/fs seams; 64 new unit tests write only under `os.tmpdir()` per [LRN-094](LEARNINGS.md#lrn-094). `REVIEWS.md` (+ `template/composed/REVIEWS.md` lockstep mirror) gains a **§ 2.4.2** verb catalog plus executable-path pointers in § 2.6a (review-doc) and § 2.6c (review-cs), naming each verb as the canonical executable path for its review type (doc-leverage per CS64 C64-2).

- **CS72 (genericize consumer-shipped onboarding docs + guard linter):** A **minor** bump (additive consumer-facing templates + a new linter; no breaking change to existing configs). Makes the core onboarding docs shipped to consumers repo-agnostic so a repo that adopts the harness receives basic, generic instructions rather than references that dangle back into the harness's own institutional memory:
  - **`INSTRUCTIONS.md` + `.github/copilot-instructions.md` reclassified `managed` → `composed`:** a generic, repo-agnostic `template/composed/<doc>` base (the universal hard rules) plus a `harness:local-*` block that carries the harness self-host's institutional cross-anchors. `TRACKING.md` and `RETROSPECTIVES.md` are scrubbed to generic `managed` docs; `READMEGUIDE.md` was already clean.
  - **`scripts/check-consumer-template-genericity.mjs`** (new guard linter, registered in `harness lint`): fails if any consumer-onboarding doc in the defined scope set contains a harness-internal reference (a bare `LRN-<digits>` / `CS<digits>` token, a `LEARNINGS.md#lrn-` anchor link, or the case-insensitive `henrik-me/agent-harness` slug). Composed bases are scanned **in full** — including default `harness:local-*` block bodies, which ship to consumers on first init; `lib/composed.mjs` validates the markers and a malformed/unclosed marker is fail-closed (the whole raw file is scanned so a broken marker hides nothing). Self-host only — the entry is **package-name gated** (runs only when `package.json` `name` is `@henrik-me/agent-harness`) and is cleanly skipped in consumers.
  - **Fresh-init delivery:** `template/seeded/harness.config.json` now lists the scrubbed generic docs in `managed.files` (and the reclassified docs in `composed.files`) so a fresh `harness init` materializes the generic core onboarding docs. Existing-consumer sync-time delivery of the now-composed `INSTRUCTIONS.md` is deferred to a follow-up CS (the `sync --apply-new` reconciliation covers only `template/managed/**`).

- **CS64b (verb-reliability primitives — post-CS64 hardening):** A focused hardening pass applying LRN-151 / LRN-155 / LRN-157. Triggers a **minor** bump (new CLI surface + additive sync behaviour). Strands:
  - **`harness doctor`** (`lib/doctor.mjs`, C64b-1): read-only probe for the [LRN-151](LEARNINGS.md#lrn-151) broken git remote-tracking ref state — a crash mid-fetch can leave a loose ref under `.git/refs/remotes/origin/<branch>` holding only whitespace/NUL bytes, which makes every subsequent `git fetch` abort. Detects zero-byte / whitespace-only / NUL-only ref files (precise heuristic so healthy 40-hex/symref refs never false-positive), prints the exact repair recipe, and with `--repair` deletes the broken loose ref files + matching `packed-refs` lines and re-runs `git fetch origin --prune`. Report-only by default (exit 0 advisory — safe to run anytime, including from `harness startup`); injectable git/fs seams.
  - **`harness sync` new-managed-file reconciliation** (`lib/sync.mjs`, C64b-3): surfaces every `template/managed/` file absent from the consumer's `managed.files` (membership, not disk presence; sentinels such as `.gitkeep` excluded) as a report-only "new managed files" advisory alongside the existing drift detection; `sync --mode=apply --apply-new` adopts them (adds the `managed.files` entry + materializes the file).
  - **`lib/disposers.mjs`** (C64b-2): shared provenance-safe temp-dir/clone `{path, cleanup}` disposer primitives (`makeTempDir`, `withTempDir`) plus an `assertSafeRef` leading-dash / argv-injection ref guard ([LRN-157](LEARNINGS.md#lrn-157)); `lib/upgrade.mjs` is retrofitted onto the shared helpers so the pattern lives in one place for future verbs to adopt.

- **CS69 (apply LRN-154 — `### LRN-NNN` H3-header enforcement in `check-learnings.mjs`):** Extend `scripts/check-learnings.mjs` with a new Check 7 that requires every learning entry's `id: LRN-<n>` frontmatter to be preceded by a matching `### LRN-<n>` H3 header on the line **immediately above** the opening ```yaml fence (only blank lines tolerated between header and fence). Two stacked rules: (1) **strict adjacency** — walking backwards, skip only blank lines; the immediately-preceding nonblank line MUST be the candidate (intervening prose, code fences, or other content disqualify it, so a `### LRN-XXX` line that appears anywhere inside a previous entry's body cannot be misclassified as the next entry's header); (2) **canonical bare-header form** — `### LRN-<digits>` with no trailing descriptive text and an **exact digit-string** comparison to the frontmatter id (not numeric parseInt), so `### LRN-1` for `id: LRN-001` is correctly flagged as a digit-string mismatch (would otherwise produce a broken `#lrn-1` anchor instead of `#lrn-001`). The bare-header constraint matches the actual `LEARNINGS.md` convention (all 159 entries) and the `lib/doc-schema.mjs assertHeadings()` exact-text resolution that other linters (e.g. `check-instructions.mjs`) rely on. A non-canonical header (decorated or absent) reports `missing \`### LRN-<n>\` H3 header`; a present-but-mismatched digit string (e.g. `### LRN-105` precedes `id: LRN-106`) reports a distinct `does not match` error naming both ids. Closes the linter gap recorded in [LRN-154](LEARNINGS.md#lrn-154) where `LEARNINGS.md` entry LRN-106 shipped with valid frontmatter but no `### LRN-106` H3 header and `check-learnings.mjs` reported 0 errors. New fixtures under `tests/fixtures/cs69/` (valid-header-matches, invalid-header-missing, invalid-header-mismatched, invalid-header-shadowed-by-prior-body, invalid-header-decorated-with-trailer, invalid-header-leading-zero-mismatch) + 6 new cases in `tests/check-learnings.test.mjs` (tests #18–#23, covering: matching header, missing header, header↔id mismatch, prior-body header shadowing, decorated-form rejection, leading-zero mismatch).
- **CS64 (lifecycle command/skill surface — extract & leverage harness verbs):** Add five new CLI subcommands that mechanize the harness's per-CS lifecycle and let process docs name them as the canonical executable path. `harness startup` (`lib/startup.mjs`) replaces the eight-command Session Start sanity sequence with one invocation; read-only and exits non-zero only on a genuinely broken tree (tests/lint/sync drift). `harness status` (`lib/status.mjs`) prints a compact resume/handoff snapshot of WORKBOARD ## Active Work plus planned/active CS file inventories — zero git, zero network. `harness claim <CS-ID>` (`lib/claim.mjs`) is dry-run by default and runs the OPERATIONS.md § Claim preflights (clean worktree, branch absent, single matching planned file, per-orchestrator claim lock) plus the pre-claim harvest gate, then renders the claim plan; `--apply` cuts the `cs<NN>/claim` branch, performs the `git mv`, and edits WORKBOARD.md — and is R3 race-aware (re-reads WORKBOARD just before write to preserve a sibling clone's intervening edit). `harness close-out <CS-ID>` (`lib/closeout.mjs`) is a two-phase verb: Phase 1 preflights the correct branch + clean worktree + populated `## Plan-vs-implementation review` section with **Outcome:** GO (NEEDS-FIX/BLOCK/missing → refuse); Phase 2 (`--apply`) renames `active → done`, removes the WORKBOARD row, and refuses to mark the close-out PR-ready until `CONTEXT.md` has also been updated (freshness gate). `harness dispatch` (`lib/dispatch.mjs`) emits the canonical sub-agent briefing preamble verbatim from OPERATIONS.md so the orchestrator can paste it into every sub-agent prompt without copy/paste drift (LRN-068 / Hard Rule § 5). The claim and close-out verbs **NEVER commit and NEVER push** (LRN-073 + C64-4/C64-5: filesystem mechanics own state, the orchestrator owns the commit message and the PR). All five live in dep-free `lib/` modules with injectable git/fs seams; tests use `os.tmpdir()` per LRN-094 (88 unit tests for the new modules, plus CS47 registry-coverage assertions). INSTRUCTIONS.md + OPERATIONS.md (+ template/managed/ + template/composed/ lockstep mirrors) name each verb at its lifecycle moment while preserving the inline manual procedure for triage/fresh-clone bootstrap. C64-9 runtime-skill spike (G-skill) returns **no-go**: silent-skip mitigation evidence is incomplete (mitigations 1+3 — doc-side inline naming + verb-side fail-fast — ship in CS64, but mitigation 2 — cold-telemetry audit for missed invocations — has not been designed). CS66 (review-family verbs) and CS67 (release verb) stubs cover the deferred surface (C64-8). Triggers the **v0.9.0 minor bump** per C64-11 / G-release (four+ new CLI subcommands ⇒ minor per OPERATIONS.md § SemVer policy).

### Changed

- **CS70 (directory-form close-out orphan guard):** `scripts/check-clickstop.mjs` now fails if any file ever present under a directory-form CS's `active/active_csNN_<slug>/` directory (in any commit, across all refs) is missing from the corresponding `done/done_csNN_<slug>/` after close-out — except the renamed plan file, `.gitkeep` placeholders, and basenames declared in an optional per-CS `.harness-closeout-allow-drop` file (C70-6 / C70-6a). This mechanically guards the CS16 failure mode where a per-file close-out rename silently dropped `sub-invaders-bootstrap-summary.md` ([agent-harness#290](https://github.com/henrik-me/agent-harness/issues/290)). Node-builtins only (git via `child_process`); a non-git checkout is a no-op, while a shallow clone runs best-effort and emits a non-failing NOTE (it may miss truncated drops but never false-positives). 6 new tests in `tests/check-clickstop-orphan.test.mjs`. The same check surfaced that the CS16 close-out had also dropped six `si-cs-plans/` consumer audit-trail copies (canonical home: the `henrik-me/sub-invaders` repo) — now declared intentional in `project/clickstops/done/done_cs16_bootstrap-sub-invaders/.harness-closeout-allow-drop`.

### Documentation

- **CS72 (consumer-template genericity invariant):** New `OPERATIONS.md § Consumer-template genericity invariant` note (mirrored in `template/composed/OPERATIONS.md` per composed-blocks lockstep) documenting that consumer-shipped onboarding docs must be repo-agnostic and that the `check-consumer-template-genericity` guard linter enforces it in `harness lint`.

- **CS70 (bootstrap-summary doctrine + stale-link cleanup):** Implements the fix for [`agent-harness#290`](https://github.com/henrik-me/agent-harness/issues/290) (Option 1 — the orchestrator bootstrap summary is harness-internal close-out evidence, not a consumer artifact). The CS16 close-out (commit `40e464c`) had renamed only the plan file inside the directory-form CS, silently dropping the sibling `sub-invaders-bootstrap-summary.md` (created in `e2b233a`). CS70: (a) restored that summary **verbatim** into `project/clickstops/done/done_cs16_bootstrap-sub-invaders/` with a leading Archive-note banner; (b) repointed the stale `active_cs16_*/…` Type-A links and appended supersession pointers to the Type-B bare-filename mentions across `done_cs25` / `done_cs27` / `done_cs30` / `planned_cs26` / `done_cs16` (the CS26 `## Deliverables` L103 reference is carved out for CS26's own claim-time re-attest) and superseded the CS16 plan's obsolete "canonical copy lives in the consumer repo" claim; (c) added directory-form CS close-out doctrine (`git mv` the whole directory, not per-file) to `OPERATIONS.md § Claim` and a cross-repo target-existence pre-flight to `OPERATIONS.md § Cross-repo procedures`, both mirrored in `template/composed/OPERATIONS.md`. The planned CS was filed via PR #296 (5-round GPT-5.5 plan review, attestation hash `d1c1de522470`). The orphan-detection linter that enforces (a) is logged under **Changed**; the two LRNs (process: directory-form close-out file-loss; architectural: cross-repo phantom-artifact) are filed at close-out.

- **CS59 (document the release-cut process + fix dangling CHANGELOG link):** Add a new **`OPERATIONS.md § Release process`** section (mirrored in `template/composed/OPERATIONS.md` per composed-blocks lockstep) covering the end-to-end harness release-cut: pre-release `[Unreleased]` audit per [LRN-101](LEARNINGS.md#lrn-101), state-of-the-world probes per [REVIEWS.md § 2.6c F6](REVIEWS.md), `npm version <x.y.z> --no-git-tag-version` to bump `package.json` + `package-lock.json` in sync, `CHANGELOG.md` `[Unreleased]` → `[x.y.z]` promotion with em-dash + link-reference updates, README v-pin sweep, `harness lint` + `node --test`, GPT-5.5 rubber-duck local review, content PR + `harness copilot-engage <pr>`, squash-merge, post-merge `git tag -a v<x.y.z> <squash-sha>` + `git push origin v<x.y.z>` to fire `.github/workflows/release.yml`, `gh release edit v<x.y.z> --draft=false` to publish the auto-draft per [LRN-121](LEARNINGS.md#lrn-121), and consumer notification via `harness cross-repo open-issue` per [§ Cross-repo procedures](OPERATIONS.md#cross-repo-procedures). New **`§ Content/release-PR admin-merge`** subsection documents the solo-orchestrator `gh pr merge --admin --squash <pr>` reality (scoped narrowly to: solo orchestrator + GPT-5.5 `Go` recorded + Copilot review attached at HEAD + all required status checks green; explicit "not a general bypass license" contrast with the [§ Workboard-only PR admin-bypass fallback](OPERATIONS.md#workboard-only-pr-admin-bypass-fallback) which is bot-automated against an exact path allowlist). Fix the dangling **`CHANGELOG.md:8`** link — `Versioning policy and release process: see [OPERATIONS.md § Release process](OPERATIONS.md)` now resolves to `OPERATIONS.md#release-process` instead of the file top. Add a one-line **`### Cutting a release`** pointer to `INSTRUCTIONS.md` (+ `template/managed/INSTRUCTIONS.md` mirror) so the release procedure is reachable from the quick-reference checklist agents re-read after every `git pull` (C59-5).

- **CS58 (apply LRN-139 + LRN-158 — plan-side fact-claim verification doctrine):** Extend the REVIEWS.md § 2.6a fact-claim doctrine (PR-side, shipped in PR #218) symmetrically to **plan reviews** of CS files under `project/clickstops/{planned,active}/`. New **REVIEWS.md § 2.6c Plan-review scope — fact-claim verification (LRN-139 / LRN-158)** codifies F1–F5 for plan reviews (F2 explicitly requires the reviewer to open cited `path:line` citations at the analyzed HEAD because line numbers drift across snapshots/syncs) and adds **F6** for state-of-the-world claims (release/tag/PR/issue/label state verified via non-mutating CLI probes — `gh release list --repo <owner>/<repo> --limit N`, `gh api repos/<owner>/<repo>/releases --jq 'map(select(.tag_name=="<tag>"))'` covering BOTH published and draft, `git ls-remote origin refs/tags/<tag>`, `gh pr view <num> --repo <owner>/<repo>`, `gh issue view <num> --repo <owner>/<repo>`, `gh label list --repo <owner>/<repo>` — with the probe recorded in the plan's Background or Constraints so subsequent reviewers can audit the same premise). Scope broadened to all reviewer-consumed plan sections (Background, Decisions, Deliverables, Exit criteria, Risks — not only the hashed Decisions+Deliverables surface). Adds an "inherited findings" discipline clause (re-verify any citation inherited from another repo, snapshot, or prior plan against the current HEAD before accepting it as a premise — the exact CS54-T1 failure mode). OPERATIONS.md § Plan review attestation procedure (CS35b) gains a **"Required verifications"** subsection cross-referencing § 2.6c with explicit reviewer-prompt-requirement language; the canonical reviewer preamble (`## Reviewer dispatch — canonical preamble`) enumerates F1–F6 inline so every plan-review dispatch that copies the preamble verbatim carries the obligation. Mirrored in `template/composed/REVIEWS.md` and `template/composed/OPERATIONS.md` per composed-blocks lockstep. **LRN-139** (CS54 T1 false-positive that survived 17 GPT-5.5 rubber-duck rounds at hash `5c40242b24c7`) and **LRN-158** (CS70 release-state premise wrong across 3 plan-review rounds at hash `7ab92e2eb150`) transition `open → applied`; LRN-158's plan-side ask is shipped here, while its CS59/CS67 content+tooling asks remain open in those CSs. Per CS58 plan C58-3, no new mechanical linter is added — fact-claim verification is inherently semantic; the change is reviewer-prompt doctrine.

### Fixed

- **CS73 (per-orchestrator claim lock):** `harness claim` now enforces the one-active-CS lock **per orchestrator** (keyed on the WORKBOARD Owner) rather than globally. `lib/claim.mjs` previously refused a claim whenever *any* other CS was Active regardless of owner — both in the `planClaim` preflight and the `applyClaimPlan` apply-time re-check — which contradicted the module's documented per-orchestrator intent and serialized every parallel orchestrator clone to a single in-flight CS. Both global checks are removed; the per-orchestrator checks (the same Owner already holding an Active row) are retained, so different orchestrators (e.g. `omni-ah`, `omni-ah-c3`) may each hold their own Active CS concurrently. Re-worded the rule across `OPERATIONS.md` (+ `template/composed/OPERATIONS.md` mirror), the `bin/harness.mjs` claim help, and `CONTEXT.md`. Aligned the shipped `cs-probes` scaffold, which executed the global rule: `probe-active.mjs` now fails only when a single Owner has more than one active CS (multiple owners pass), and `probe-tasks-resolved.mjs` validates every active CS. Patch-level fix — no new CLI surface.

- **CS64 (post-merge PVI fix — idempotency for `harness claim` / `harness close-out`):** Fix two C64-4 / C64-5 plan divergences flagged by the post-merge plan-vs-implementation review on `main@51953da`. `harness claim <NN>` and `harness close-out <NN>` are now genuinely idempotent: re-running on a fully claimed CS (planned→active rename already merged) or fully closed-out CS (active→done rename already merged) prints "CS<NN> is already claimed/closed-out (… file: …). No-op; nothing to do." and exits 0, instead of failing with "no planned CS<NN>" / "no active CS<NN>". The idempotency check runs BEFORE the git preflights so a re-run on a dirty worktree, wrong branch, or fresh checkout (no `.git/`) is still a clean no-op. Adds two pure helpers (`findActiveByCsId` in `lib/claim.mjs`, `findDoneByCsId` in `lib/closeout.mjs`) mirroring the existing `findPlannedClickstop` / `findActiveClickstop` shape, with new helper unit tests and `runClaimFromDisk` / `runCloseoutFromDisk` integration tests using `os.tmpdir()` fixtures per LRN-094.

## [0.8.0] — 2026-06-09

### Added

- **CS63c (guided update + architectural evaluations — CS63 arc, W4+W6):** Add **`harness upgrade <ref>`** — a **read-only preview** of bumping the pinned harness to `<ref>` (semver tag, branch, or 40-char SHA). It fetches that ref's templates and runs a **dry-run** sync against the consumer repo, printing the list of files that would change (per-file action + class) + a change-count summary; **nothing is applied** (additive over `lib/sync.mjs` — no apply-path rewrite, so it cannot cause data loss). To apply after reviewing, set `harness.config.json` `version` to `<ref>` and run `harness sync --mode=apply` (`--accept-major` for a major bump). New `lib/upgrade.mjs` + `tests/lib-upgrade.test.mjs`; registered in `bin/harness.mjs` `COMMAND_REGISTRY` + help (the `harness upgrade` subcommand is the minor-bump trigger for the CS63 arc). Documents clone-based install as a first-class path and the preview-then-apply upgrade flow in `README.md` + `OPERATIONS.md` (+ composed mirror). The architectural-evaluation outcomes (CLI-commands-first skills, `CONTEXT.md` history cap now + defer `OPERATIONS.md`/`LEARNINGS.md` right-sizing to CS65, C63-11 advisory disposition) are recorded in the CS63c close-out proposal artifact; follow-ups are tracked in the already-filed CS64–CS67 stubs.

- **CS63b (lifecycle automation + close-out context-integrity — CS63 arc, W2+W3+C1):** Make the advertised-but-stubbed lifecycle automation real and add the missing context-integrity gate. **`harness harvest`** is now implemented (`lib/harvest.mjs` + `bin/harness.mjs` `cmdHarvest` wired to it, replacing the `die` stub): a deterministic, network-free, **advisory** scan of `LEARNINGS.md` that surfaces stale `open` learnings (pre-claim bounded mode flags stale `process`/`architectural` entries past the threshold; weekly mode reports all open entries) — it never wedges a claim. New **`scripts/check-closeout-freshness.mjs`** (C63-5) ties the "repo is the memory" invariant to a mechanical gate: when a PR's diff contains an `active_csNN_* → done_csNN_*` close-out rename, it **requires** a `CONTEXT.md` change in the same PR (fail) and **warns** if `LEARNINGS.md` is untouched; it is narrowly scoped to the rename event (a typo fix in an existing `done_` file does not trigger it) and self-host-safe. Wired into **both** the `harness lint` aggregator (`cmdLint`, self-host-safe — runs only when the branch diff vs its `origin/main` fork point contains a close-out rename) **and** `harness pr-evidence`. Rename detection uses `git diff --no-renames` so a rename surfaces as delete+add (both the old `active_` and new `done_` paths), which the same-CS-id detector needs — `--name-only` alone reports only the destination and silently no-ops the gate. Corrects the INSTRUCTIONS.md (+ `template/managed/` mirror) doc-vs-reality automation claims (C1) and de-STUBs the top-level `harvest` CLI help. Adds `tests/lib-harvest.test.mjs`, `tests/check-closeout-freshness.test.mjs` (+ a real-rename integration regression), and updates `tests/cli.test.mjs`.

- **CS63a (consumer structural PR gate + `workboard-only` bypass hardening — CS63 arc, W1+W5):** Ship the harness's structural-integrity protection as a real **consumer merge gate**. New managed `template/managed/.github/workflows/harness-pr-check.yml` runs `harness lint` plus a managed/composed **file-class drift classifier** (`scripts/check-managed-drift.mjs`: managed/composed drift fails the PR; `seeded` is consumer-owned/advisory) on every PR; default-on for fresh `harness init` via `cmdInit` (new `pr_check.enabled` config, default `true`; opt out with `pr_check.enabled: false`). The workflow reads the harness ref **and** the opt-out from the **base-branch** config (never the PR head — a PR cannot disable the gate on itself), declares least-privilege `permissions`, uses `head.sha` for the self-host ref fallback, and carries an auditable `harness-managed-edit-ack` escape valve (label **plus** a non-empty `Harness-managed-edit:` justification line; a bare label does not clear the gate). Hardens the `workboard-only` review bypass (`pr-evidence-lint.yml` + `review-gates.yml` + template mirrors, C63-7): the skip is confined to an **exact-match** path allowlist (`WORKBOARD.md` / `CONTEXT.md` / `LEARNINGS.md` / `project/clickstops/**`), is **rename/copy-source aware** (checks `previous_filename`), re-runs on label add/remove, and **fails closed** if the GitHub files API errors. Adds `tests/check-managed-drift.test.mjs`, `tests/cs63a-pr-check-init.test.mjs`, `tests/cs63-workboard-bypass.test.mjs` (+ updates `tests/cs51-review-gates-workflow.test.mjs`). Existing consumers adopt the gate manually (copy the workflow + add `.github/workflows/harness-pr-check.yml` to `managed.files`); automatic delivery on `harness sync` is deferred to CS63c (guided update) / CS64 because `harness sync` has no new-managed-file reconciliation (it processes only files already in the consumer config). Reviewed across 8 rounds (gpt-5.5 R1–R8 + 5 GitHub Copilot rounds; PR #264).

### Changed

- **CS54b (PR-template strict-schema refresh — sibling of CS54, D54-5):** Delete the orphaned pre-strict `template/managed/.github/pull_request_template.md`. The PR template became a *composed* file at CS38a (#163) — `.github/pull_request_template.md` is rendered from `template/composed/.github/pull_request_template.md` and listed under `composed.files`, not `managed.files` — leaving the old `template/managed/` copy unreferenced by any file-list, code, linter, or sync (so it never shipped). The shipped composed template is already at the strict v0.6.0+ schema (`## Model audit` with `Implementer agent` / `Reviewer agent` rows + optional `Notes`; `## Review log` 6-column, bare reviewer-model id), so fresh `init` / `sync` consumers already inherit it — the SI PR #79 failure was a *stale consumer copy*, not the harness shipping pre-strict. Adds `tests/cs54b-pr-template-strict.test.mjs` locking the shipped template's strict structure plus a filled fixture that passes `check-review-evidence.mjs` (default strict) and `check-pr-body.mjs`. Documents the existing-consumer upgrade path in `OPERATIONS.md` § Cross-repo procedures (opt-in adoption; no auto-rewrite of consumer files). Plan C54b-1 targeted the orphan; the deviation is recorded in the CS Notes per LRN-143, with a plan-side fact-claim learning supporting CS58/LRN-139.

- **CS61 (apply LRN-145 — shared reviews-policy config reader):** Introduce a single canonical `loadReviewsPolicy({cwd,configPath})` reader (+ `ReviewsConfigError`) in a new **dep-free** `lib/reviews-policy.mjs` (Node builtins only) with **"apply the schema default when a field is absent; fail closed only on a present-but-malformed value"** semantics, sourcing per-field defaults from `schemas/harness.config.schema.json` (cached per process) and validating only the `reviews` subtree (so partial configs/fixtures that omit unrelated top-level keys still load; unknown `reviews.*` keys fail closed, matching the schema's `reviews.additionalProperties: false`). A dedicated module — not `lib/config-reader.mjs` — because the four review-gate scripts run from a `node_modules`-free `.harness-ci` clone in CI and `config-reader.mjs` imports AJV (resolves CS61 plan Q1; see LRN-147). All four review-gate linters now consume it, removing every hard-coded `gpt-5.5` / high-risk-clickstop literal under `scripts/checks/` and `scripts/check-clickstop-implementer-not-reviewer.mjs`: `check-review-log-evidence.mjs` (drops the hard-coded `gpt-5.5`; gains `--config`), `check-independence-invariant.mjs` (drops local `SCHEMA_DEFAULT_*` constants), `check-clickstop-implementer-not-reviewer.mjs` (drops the hard-coded primary model + local high-risk loader, **preserving** the CS57 GPT-5.5 non-high-risk overlap exception, the `MODEL_AUDIT_ENFORCEMENT_DATE` grandfather gate, and the C57-6 fail-closed sentinel), and `check-copilot-review-attached.mjs` (replaces the shape-lenient loader that silently accepted arrays/`{}` with the shared reader, **flipping malformed-shape `reviews` to fail-closed (exit 1)** while missing-file/absent-`reviews` still resolve to defaults). Verdicts for valid/absent configs are unchanged. Two schema-vs-runtime default divergences (`lib/review.mjs` `high_risk_clickstops: []`; `enforce_gates` absent→skip in `scripts/check-review-gates.mjs` + `bin/harness.mjs` `syncReviewGateRuleset`) are deliberately **deferred** and documented in-place (LRN-148), never silently flipped. Adds `minLength: 1` to `reviews.rubber_duck_model` / `reviews.fallback_model` in `schemas/harness.config.schema.json` so the reader's empty-model fail-closed is schema-backed (S3), matching the existing `copilot_reviewer_slug` constraint. Adds `tests/cs61-reviews-policy-reader.test.mjs` (28 cases). Transitions LRN-145 `open → applied` and closes the LRN-142 residual.

### Documentation

- **Document the clickstop-filing procedure + file CS68:** Add `OPERATIONS.md § Filing a clickstop` (+ `template/composed/OPERATIONS.md`) — the ordered procedure for creating a `planned` CS (pick a collision-free id, author from a canonical skeleton, required header fields + `## Plan review` attestation, independent GPT-5.5 plan review, `harness plan-review-hash`, `harness lint`) so the shape no longer has to be reverse-engineered from an existing CS file — with a "Filing a CS" pointer added to the `INSTRUCTIONS.md` quick-reference (+ `template/managed/INSTRUCTIONS.md`). Files `project/clickstops/planned/planned_cs68_dependency-bump-adoption-procedure.md` (plan-reviewed by gpt-5.5: R1 Needs-Fix → R2 Go-with-amendments), capturing the dependency-bump adoption procedure + a `harness review` non-CS enhancement surfaced while adopting Dependabot #226 as PR #262.

- **CS61 / LRN-145 rule 2:** Add `REVIEWS.md § 2.6b` (rubber-duck **schema-conformance verification** — checks S1/S2/S3) adjacent to the § 2.6a fact-claim checklist, mirrored in `template/composed/REVIEWS.md`, with a parallel S1–S3 obligation added to the canonical reviewer preamble in `OPERATIONS.md` (+ `template/composed/OPERATIONS.md`). Codifies that a rubber-duck reviewing a change that adds/edits a config or schema reader MUST diff the reader's required/default/validation contract against the schema — the gap that let the CS60 over-require pass three review rounds before GitHub Copilot caught it.

### Fixed

- **CS62 (fresh-clone bootstrap self-containment — [LRN-146](LEARNINGS.md#lrn-146)):** Two fixes so an orchestrator following `INSTRUCTIONS.md` § Session Start reaches all-green from a fresh clone. **Test hermeticity:** the two `harness whoami` assertions in `tests/cli.test.mjs` (`prints agent ID ending in -ah…` and `…env var override as machine-short`) no longer couple to the checkout folder's basename — each pins `--cwd` to a temp dir named `agent-harness` so `cloneSuffixFromDir` yields no `-c<N>` suffix and the strict `-ah` terminal-suffix check stays deterministic in any clone. Previously these false-red'd as `yoga-ah-c2` in an `agent-harness_copilot2` checkout, falsely tripping the "main is always green" bootstrap signal. No change to `bin/harness.mjs` clone-suffix derivation — Decision #20's `-c<N>` behavior is correct. **Env-setup precondition (docs):** `template/managed/INSTRUCTIONS.md` § Session Start (and the rendered root `INSTRUCTIONS.md`) now carries a "First-run environment setup" step before the bootstrap sanity check — Node ≥ 20 + a one-time `npm ci` (`node_modules` is gitignored/per-checkout) plus an `ERR_MODULE_NOT_FOUND` triage line ("run `npm ci`; `main` is not broken"); `README.md` § "Starting an agent session" cross-references the one-time setup and links `CONTRIBUTING.md`. LRN-146 transitions `open → applied` at close-out.
- **CS60 (open-learnings cleanup bundle — LRN-132/133/140/141/142/143/144):** A seven-learning hygiene bundle dispatched as four disjoint-ownership workstreams. **LRN-132:** `parseImplementerModels` (`lib/review.mjs`) is now context-aware — the context-blind bare `model=`/`model:` ledger scan is dropped, so a `Reviewer model: <id>` mentioned in prose is no longer mis-parsed as an implementer model (which could falsely trip the reviewer-independence invariant); explicit `Implementer models`/`Plan author model(s)`/`implementer-model =` declarations still parse. Adds `tests/cs60-parse-implementer-models.test.mjs`. **LRN-140:** `harness copilot-engage <pr>` now defaults its poll HEAD to the PR's GitHub `headRefOid` instead of the local cwd git HEAD; a new opt-in `--head <sha>` overrides it, and the CLI emits a best-effort stderr warning when the detected local HEAD differs from the PR head being polled (non-git cwd silently skips the warning rather than aborting). Help text updated; adds `tests/cs60-copilot-engage-head.test.mjs`. **LRN-142:** cleared config drift in `scripts/checks/check-independence-invariant.mjs` — the high-risk-clickstops list and primary-reviewer-model are now sourced from `harness.config.json` with fail-closed validation (per CS57) instead of silent hard-coded literals; verdicts for valid configs are unchanged. Adds `tests/cs60-config-drift.test.mjs`. A residual hard-coded `gpt-5.5` in `check-review-log-evidence.mjs` is recorded as a follow-up (out of CS60's bounded scope). **LRN-133:** verified (no code change) that `scripts/check-text-encoding.mjs` already respects `.gitignore` by default and `.tmp/` is ignored; residual work was doc-only. **LRN-143/144/141/140/133 (doc):** doctrine added to `OPERATIONS.md` (and lockstep `template/composed/OPERATIONS.md` + `.github/copilot-instructions.md` mirrors): once a `## Decisions`/`## Deliverables` row is plan-review-hashed, later factual errors are fixed in the implementation and recorded as a dated `## Notes` deviation — never by editing the hashed section (LRN-143); the PVI verdict is recorded in the **active** CS file before the `active → done` rename, since renaming first leaves a `done/` file that `check-clickstop` rejects (LRN-144); fresh git worktrees/checkouts need their own `npm install` before dependency-backed harness linters because `node_modules` is gitignored and per-checkout (LRN-141); the `copilot-engage` default-HEAD/`--head` behavior is documented (LRN-140); and the Windows LF-clean/BOM-free + gitignore-aware encoding-linter convention is noted (LRN-133). All seven LRNs transition `open → applied`.
- **CS27 / Findings #7+#8 (CS16 sub-invaders bootstrap):** Two narrow `harness` UX tightening fixes. **Finding #7:** the `lib/sync.mjs` WORKBOARD active-row detector (which drives the "Syncing mid-CS may cause process-shape changes mid-flight" warning) no longer false-positives on a freshly-init'd consumer — a row now counts as active only when its CS-Task ID and State columns are non-placeholder AND at least one of {Owner, Branch} is non-placeholder, so the canonical em-dash placeholder seed row is correctly ignored. **Finding #8:** `harness lint` now surfaces an adoption recommendation (instead of a bare `skipped (target not found)`) for the two consumer-applicable checks `pr-body` and `commit-trailers` when their target files are absent; the note appears only in non-quiet mode (suppressed under `--quiet`) and never changes the exit code. Adds `tests/cs27-workboard-active-row-detector.test.mjs` and `tests/cs27-lint-recommendations.test.mjs`.
- **CS47 / [LRN-124](LEARNINGS.md#lrn-124):** Investigate and close out the detached-HEAD working-tree-loss signature (HEAD silently detached at the most-recent release tag `v0.5.1` after a `harness` subcommand exited, reverting dirty tracked edits). **Outcome: no in-source offender — the detach is environmental, not caused by the harness CLI.** A static audit (current tree, the `v0.5.1` tag, and `git log --all -G` over all history) found no HEAD-moving git verb (`checkout`/`switch`/`reset`/`restore`/`worktree`/`stash`/`clean`) anywhere in `lib/`/`bin/`/`scripts/`; every git invocation is read-only. Adds `tests/cs47-detached-head-bisect.test.mjs`, a permanent regression guard that enumerates the live `COMMAND_REGISTRY` (now exported from `bin/harness.mjs`) and exercises every enumerated subcommand's real code path (not `--help`) — allow-listing only network/interactive ones with an explicit rationale — in both self-host and consumer scratch repos, asserting after every run — regardless of exit code — that HEAD stays attached to its branch, `rev-parse HEAD == rev-parse <branch>`, the dirty tracked sentinel is preserved, and `GIT_TRACE` records no HEAD/worktree-mutating git verb. `bin/harness.mjs` now exports `COMMAND_REGISTRY` and guards its `main()` invocation behind a direct-invocation check so the dispatch registry can be imported without running the CLI. LRN-124 stays `applied` (the "commit after every multi-file edit batch" mitigation remains in force); OPERATIONS.md absorbs the "never `git checkout <ref>` on the consumer working repo" doctrine for subcommand authors.

## [0.7.0] — 2026-06-03

### Added

- **CS54 / T5 (LRN-136):** Harden `scripts/checks/check-review-log-evidence.mjs` against decorated reviewer-model identifiers. The gate now enforces the bare-id rule `/^[A-Za-z0-9._-]+$/` on the `## Review log` `model` column, rejecting any non-bare form — parenthesized (`gpt-5.5 (R2)`, `gpt-5.5 (PvI)`, `gpt-5.5 (reviewer)`), non-parenthesized (`gpt-5.5 R2`, `gpt-5.5 - R2`, `gpt-5.5/R2`), and display-form (`Claude Opus 4.7`) — with an error citing canonical examples (`gpt-5.5`, `claude-opus-4.7`, `claude-sonnet-4.6`) and pointing at REVIEWS.md § 2.8. Does NOT auto-suggest a "bare" form (heuristic extraction is brittle for non-canonical inputs — e.g. would incorrectly suggest `Claude` for `Claude Opus 4.7`). Closes the silent-pass path where a decorated cell was normalised away from the primary reviewer and the fallback-rationale path approved it. Regression sub-cases in `tests/cs51-review-gates-logic.test.mjs` cover decorated + fallback (the historically-silent path), decorated without fallback, bare positive control, `(reviewer)` annotation, Needs-Fix row enforcement, the three non-parenthesized decoration forms, and a display-form anti-suggestion case. Does NOT touch `check-independence-invariant.mjs`.
- **CS56 / [PR #216](https://github.com/henrik-me/agent-harness/pull/216):** Add `harness cross-repo open-issue` CLI subcommand — the canonical, supported way for the harness orchestrator to file a tracking issue in a non-harness repo per Hard Rule § 6. Surface: `--repo OWNER/NAME --title T --body-file PATH [--label L ...]`. Always prepends the `harness-orchestrator` label as routing default; additional `--label` flags append. Unconditionally idempotent **over open issues** — performs an exact-title open-issue search and short-circuits to the existing URL if found (no `--idempotent` flag; the behavior is the contract). Closed issues are NOT consulted; the OPERATIONS.md "all-state pre-create check" remains an operator responsibility. Refuses `--repo henrik-me/agent-harness` (self-loop). CLI-layer realpath-based cwd-containment on `--body-file` blocks path-traversal (e.g. `../../secret`, out-of-tree symlinks) — see LRN-138. The `[harness:csNN]` title prefix is **required by doctrine** (OPERATIONS.md § Cross-repo procedures + README) but **not enforced by the CLI** on `--title`. There is intentionally NO `cross-repo open-pr` action; the absence is the guardrail. 22 regression tests in `tests/cross-repo.test.mjs`; README quick reference added.

### Changed

- **CS54 / T2:** Normalise prose `Implementer model used` → `IMPLEMENTER MODEL USED` in both occurrences in `OPERATIONS.md` (and lockstep `template/composed/OPERATIONS.md`). Aligns the backtick code-span describing the report-field with the all-caps report-shape label convention (`STATUS:`, `PREFLIGHT SHA:`, `FINAL SHA:`, `SUMMARY:`). Cosmetic; no behavioural change.

### Documentation

- **CS54 / T3 (LRN-134 → applied):** Codify the **cross-repo pin-bump PR body checklist** as a new H3 under `OPERATIONS.md § Cross-repo procedures` (mirror in `template/composed/OPERATIONS.md`, short pointer in `template/managed/.github/copilot-instructions.md` Rule 6). Consumer-repo PRs (typically pin bumps) MUST include `## Summary` / `## Changes` / `## Testing` / `## Model audit` (with `Implementer agent` and `Reviewer agent` rows since v0.6.0 strict-flip) / `## Review log` (6-column, bare reviewer-model id) / plan link at PR-open time — `.github/pull_request_template.md` cannot be assumed to inject them.
- **CS54 / T4 (LRN-135 → applied):** Document the **narrow re-attest pattern** as a new H3 under `OPERATIONS.md § Cross-repo procedures`. Defines three preconditions (trivial delta ≤ 20 lines, prior full-diff R1 with Go still in Review log, same reviewer model + agent), the sync-mode dispatch shape, and the "not a substitute for full re-review when delta is substantive" caveat. Cross-refs to REVIEWS.md § Plan review and § PR-evidence gates A4.
- **CS54 / T5 (LRN-136 → applied):** Add **Review log column rules** to `REVIEWS.md § 2.8` (mirror in `template/composed/REVIEWS.md`) documenting per-column requirements with explicit emphasis on the `model` column bare-id rule and the actor-column-for-annotations convention.
- **CS54 / T6:** New top-level section **`Config schema: reviews vs review_gates`** in `REVIEWS.md` disambiguating the two top-level `harness.config.json` blocks. `review_gates.*` is install-time + CI workflow (B1/A2..A6/A16 gate set); `reviews.*` is orchestrator-side `harness review` CLI + PR-side status checks. Field descriptions adapted from `schemas/harness.config.schema.json` (`review_gates` block L107-138, `reviews` block L139-194); the schema remains source-of-truth.
- **CS54 / LRN-139 (open):** File LRN-139 (plan-review fact-claim verification gap) — REVIEWS.md § 2.6a F1-F5 fact-claim verification doctrine (currently scoped to PR-side reviews of shipped code) should be extended to PLAN reviews so file-line citations in CS plans are verified before plan-review approval. Discovered during CS54 implementation when T1's plan-asserted "stray fence at L680" turned out to be a false positive that survived 17 rubber-duck plan-review rounds (R1-R17 at hash `5c40242b24c7`). Disposition open; follow-up CS candidate.
- **CS55 / [PR #213](https://github.com/henrik-me/agent-harness/pull/213):** Adopt v0.6.x cross-repo handoff doctrine. Add Hard Rule § 6 ("Cross-repo handoff: file issues, never commit") to `template/managed/.github/copilot-instructions.md` (mirrored in root `.github/copilot-instructions.md`). Add `## Cross-repo procedures` section to `template/composed/OPERATIONS.md` (mirrored in root `OPERATIONS.md`) covering the issue-only handoff pattern, idempotent pre-create existence check, `harness-orchestrator` label preflight (D55-3), `[harness:csNN]` title prefix convention, required body fields, and exit criteria. Add a C35-13 scope-clarification cross-reference to `template/managed/INSTRUCTIONS.md` (and root mirror `INSTRUCTIONS.md`) pointing readers at the Hard Rule and the cross-repo procedures section. File **LRN-137** (cross-repo handoff doctrine — the harness orchestrator never commits/pushes/PRs in non-harness repos; no escape hatch). SI tracking issue: [henrik-me/sub-invaders#80](https://github.com/henrik-me/sub-invaders/issues/80).
- **CS56 / [PR #217](https://github.com/henrik-me/agent-harness/pull/217):** File **LRN-138** (cwd-containment is mandatory for agent CLI flags that accept file paths whose **contents are forwarded to a third party** — i.e. the exfiltration surface, e.g. `--body-file` piped into `gh issue create`; not every filesystem-path flag). Documents the realpath + `path.relative` containment approach (CS56 is the canonical reference for the pattern) and recommends the segment-safe predicate `rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)` as the preferred form for new code. Migrating CS56's shipped (simpler, equally secure, mildly over-restrictive) form is a low-priority follow-on.

### Removed

- _None._

## [0.6.0] — 2026-05-27

### Added

- **CS51 / [#140](https://github.com/henrik-me/agent-harness/issues/140):** Add REVIEWS.md PR-side enforcement gates (`review-log-evidence`, `copilot-review-attached`, `independence-invariant`, `review-threads-resolved`), workflow template, config/ruleset sync hooks, and regression tests.
- **CS52 / [#141](https://github.com/henrik-me/agent-harness/issues/141):** Add `harness review <pr>` as the canonical content-PR review orchestrator. The new CLI validates content PRs, enforces reviewer independence, composes the manual rubber-duck prompt, can trigger/poll Copilot review, and updates PR-body `## Review log` / `## Model audit` evidence; schema, docs, and regression tests cover the new `reviews` config block and exit-code contract.
- **CS50 / [#138](https://github.com/henrik-me/agent-harness/issues/138):** Add an optional `WORKBOARD_MERGE_TOKEN` PAT admin-bypass fallback for validated workboard-only PRs so consumer repos without the G3 App can claim/close out without human admin merges.

### Changed

- **CS53 / C53-5 (C42-6 promise fulfilled):** `scripts/check-review-evidence.mjs` `--strict-agent-columns` is now the **default** behavior; missing `Implementer agent` / `Reviewer agent` rows in the `## Model audit` table (which is a key-value `| Field | Value |` table per REVIEWS.md §2.8) are errors rather than warnings. Pass `--no-strict-agent-columns` (new flag) to opt out for transitional consumers. Closes the v0.5.0-era CS42 C42-6 commitment recorded in REVIEWS.md. (Flag name retains `-columns` for backwards compatibility with the CS41 flag introduced in v0.5.0; CS41 entry below preserves the original "columns" wording as historical record.)
- **CS48 / [#142](https://github.com/henrik-me/agent-harness/issues/142):** Dispatch reporting now states that implementer self-review carries zero review weight, replaces implementer review evidence with `Implementer model used` provenance, extends the clickstop implementer-not-reviewer lint rule to model overlap, and adds LRN-127 + regression coverage anchored to the Sub Invaders PR #28 review-evidence incident.
- **CS49 / [#139](https://github.com/henrik-me/agent-harness/issues/139):** Codify orchestrator availability, 15 wall-minute sub-agent progress/stall reporting, and Workboard-first status for out-of-CS work in OPERATIONS.md; add regression coverage and LRN-126.
- **chore ([PR #200](https://github.com/henrik-me/agent-harness/pull/200)):** `scripts/check-pack.mjs` `DEFAULT_MAX_SIZE_BYTES` raised from 1MB (1048576) to 2MB (2097152). The accumulated CS49 + CS50 + CS51 + CS52 doctrine additions to OPERATIONS.md pushed the published `npm pack` size past the 1MB ceiling; bumping the default avoids gating release on doctrine growth. Tests still pin the violation path because they pass `--max-size-bytes 1` explicitly. Filed as LRN-128.

### Documentation

- **CS47 plan-filing ([PR #202](https://github.com/henrik-me/agent-harness/pull/202)):** File `project/clickstops/planned/planned_cs47_detached-head-investigation.md` per pre-claim disposition of LRN-124 (working-tree-loss doctrine). The plan investigates which `harness` CLI subcommand silently leaves HEAD detached at the most-recent release tag (5 confirmed live reproductions across CS46 + this PR; deterministic detach target = `v0.5.1` = `fe2c0b9`; offender is a SHARED helper called from at least `harness lint`, `harness plan-review-hash`, and `harness sync --mode=check`). Plan review: R1 Needs-Fix → R2 Go-with-amendments + R3 (Copilot R1 PRR-1..5 absorbed). No code changes; CS47 itself is the follow-up implementation work.

### Removed

- _(none yet)_

## [0.5.2] — 2026-05-14

### Changed

- **CS46 / [#146](https://github.com/henrik-me/agent-harness/issues/146):** Surface canonical formats for two harness-enforced constraints to remove the first-encounter CI roundtrip:
  - `template/seeded/WORKBOARD.md`: replace the em-dash placeholder row in `## Active Work` with the **header-only canonical empty state** + an HTML comment documenting both accepted forms (header-only OR single em-dash row with "no active CS" in Title) and the `_(none)_` anti-pattern. The em-dash variant remains accepted by `check-workboard.mjs` for backward compatibility — no behavior change to the linter contract.
  - `template/composed/OPERATIONS.md` § Plan-vs-implementation review (close-out gate): add an explicit **field labels are matched verbatim** callout enumerating `**Reviewer:**`, `**Date:**`, `**Outcome:**` and naming `**Verdict:**` as a common (failing) alias.
  - `template/managed/TRACKING.md` CS file front-matter skeleton: append a close-out gate reminder pointing consumers at the canonical Plan-vs-impl review skeleton in OPERATIONS.md so the TRACKING copy-paste path doesn't omit the close-out gate.
  - `scripts/check-workboard.mjs` invalid-CS-Task-ID error: extend the message with a self-documenting hint pointing at the two valid empty-state forms + the canonical seeded template path.
  - `scripts/check-clickstop.mjs` Plan-vs-impl review error: extend with verbatim labels enumerated + cross-link to the OPERATIONS.md skeleton.
  - New regression test `tests/cs46-empty-state-and-review-discoverability.test.mjs` (6 fixture-based tests including a fresh-init E2E acceptance check per issue #146 AC #1, AND a mechanical doc-drift guard asserting the canonical OPERATIONS.md skeleton + verbatim-labels callout body contains all required labels; all scratch dirs use `os.tmpdir()` per LRN-094). Per Decisions C46-1 through C46-9.

- **CS43:** `scripts/check-clickstop-implementer-not-reviewer.mjs` — the linter now recurses one level into nested clickstop subdirectories of the form `^(planned|active|done)_cs\d+[a-z]*_.*$` so multi-file CS bundles (e.g. `done_cs11_self-host/done_cs11_self-host.md`) are scanned in addition to the historical flat layout. CS-shaped filenames (`^(planned|active|done)_cs\d+[a-z]*_.*\.md$`) are linted; auxiliary docs alongside (e.g. `harness-cs-plan.md`) are ignored. Both regexes use `[a-z]*` (multi-letter suffix) to match the canonical pattern in `scripts/check-clickstop.mjs`. Adds a date-gate at `IMPLEMENTER_NOT_REVIEWER_RECURSION_ENFORCEMENT_DATE = '2026-05-14'`: pre-enforcement CS files (close date strictly before the threshold) are silently grandfathered; unparseable close dates emit a single WARN and skip; missing close dates lint normally (deferring missing-field complaints to `check-clickstop.mjs`). Live self-verify on the harness repo: 0 errors, 9 warnings (3 of 4 named pre-CS35 nested folders silently grandfathered; 1 cs22 WARN due to an em-dash close-date — pre-existing data anomaly, non-blocking). Per Decisions C43-1 through C43-5.
- **CS44:** `OPERATIONS.md` § Copilot engagement procedure (and its composed mirror `template/composed/OPERATIONS.md`) replace the stale `node`-by-login GraphQL fragment wording with the canonical `node(id: $id) { ... on Bot { databaseId login } }` fragment + the hardcoded Copilot Bot node ID `BOT_kgDOCnlnWA` actually shipped in `lib/copilot-engage.mjs`. Adds a cross-link to LRN-009 + ADR-0004 § ADR4-2 explaining why the hardcoded ID is required (`user(login: 'copilot-pull-request-reviewer')` returns `null` per the CS37 GraphQL spike). New regression test `tests/cs44-docs-impl-alignment.test.mjs` is the doc-drift watchdog that asserts all four touchpoints (lib, composed/OPERATIONS, root OPERATIONS, CHANGELOG) reference both `node(id:` AND `BOT_kgDOCnlnWA`. Per Decisions C44-1 through C44-7.
- **CS45:** `lib/copilot-engage.mjs` `resolveCopilotIdentity()` now wraps the `mkdir`/`writeFile` cache-write seam in a typed-error envelope: filesystem failures (EACCES, ENOSPC, EROFS, etc.) rethrow as `EngageError(kind: 'cache-write-failed', cause: <originalError>)` with the underlying `err.syscall` in the message instead of leaking raw fs error stacks. `bin/harness.mjs cmdCopilotEngage` adds a dedicated catch branch printing a `--cache-dir <writable-path>` hint and exiting with code **5** (lowest free positive integer; existing codes 0/2/3/4 in use for success/bad-input/timeout/auth-missing+network). `OPERATIONS.md` § Copilot engagement procedure gains a Troubleshooting subsection documenting the new exit code + `--cache-dir` escape hatch. Per Decisions C45-1 through C45-7; new lesson [LRN-123](LEARNINGS.md#lrn-123) records the broader doctrine ("audit every syscall on the cold path when introducing a typed-error class").

### Fixed

- **CS23 / [LRN-100](https://github.com/henrik-me/agent-harness/blob/main/LEARNINGS.md#lrn-100):** `.github/workflows/harness-self-check.yml` `pull_request:` trigger now includes `types: [opened, synchronize, reopened, edited]` so `gh pr edit --body` re-fires the `pr-body` job — orchestrators no longer need to manually `gh run rerun --failed` after fixing a body-only failure. Adds `tests/cs23-pr-body-trigger.test.mjs` to mechanically lock the trigger contract.

### Removed

- _(none yet)_

## [0.5.1] — 2026-05-14

### Changed

- **Bugfix [#183](https://github.com/henrik-me/agent-harness/issues/183):** `scripts/check-cs-plan.mjs` — two narrow fixes for the `cs-plan` linter that surfaced as 29 false positives across 8 SI CS files when `henrik-me/sub-invaders` bumped the harness pin from `v0.3.1` to `v0.5.0`:
  - **Gap A — defaults too aggressive.** `DEFAULT_FORBIDDEN_PREFIXES` shrunk from 5 entries (`template/composed/`, `template/seeded/`, `lib/`, `bin/`, `scripts/`) to 3 unambiguously harness-only entries (`template/composed/`, `template/seeded/`, `template/managed/`). The dropped prefixes — `lib/`, `bin/`, `scripts/` — collide with universal consumer-repo dir names (SI has all three; nearly every Node consumer has at least `scripts/`). Consumers who DO want the stricter pre-#183 coverage can opt back in via `harness.config.json → cs_plan_lint.forbidden_path_prefixes` (the override semantics already worked correctly; this change only tightens the default).
  - **Gap B — inline code spans were not exempt.** The matcher now strips backtick-delimited inline code spans (`` `template/composed/foo` ``, `` ``with embedded text`` ``, etc.) before scanning each line, in addition to the existing fenced-code-block and harness-GitHub-URL exemptions. Inline code is the natural way humans reference paths in prose and learning entries; the prior behavior flagged correctly-fenced inline references as violations. Triple-backtick fenced blocks remain exempt as before; unmatched backticks leave the line scanned normally.
  - **Schema + docs aligned.** `schemas/harness.config.schema.json` description and `harness lint --explain cs-plan` text both updated with the new defaults and the inline-code-span exemption note. SI can now drop the `cs_plan_lint.forbidden_path_prefixes` override they added as a v0.5.0 workaround.
  - +3 regression tests (#9 default-prefix scope-narrowing, #10 opt-in restores lib/ enforcement, #11 inline-code spans exempt across single-/double-/triple-backtick forms); existing tests #2 / #7 / #8 + the `planned_cs02` fixture migrated from `lib/` to `template/managed/`. Self-host `harness lint --quiet` continues at 29/0/3.
  - Shipped via [PR #184](https://github.com/henrik-me/agent-harness/pull/184) at squash `6750047`.

## [0.5.0] — 2026-05-14

### Added

- **CS41:** `harness copilot-engage <pr-number>` subcommand + `lib/copilot-engage.mjs` library — wraps the documented Copilot review-engagement primitive (`gh pr edit --add-reviewer copilot-pull-request-reviewer` per ADR-0004 § ADR4-2) so orchestrators no longer hand-craft GraphQL invocations. Auto-detects `--repo` from `git remote origin url`. Resolves Copilot's Bot node ID via the `node(id: $id) { ... on Bot { databaseId login } }` GraphQL fragment with the hardcoded Copilot Bot node ID `BOT_kgDOCnlnWA` (cached 7d at `~/.cache/harness/copilot-id.json` per C41-2; the hardcoded ID is required because `user(login: 'copilot-pull-request-reviewer')` returns `null` per the CS37 GraphQL spike — see [LRN-009](LEARNINGS.md#lrn-009) and [ADR-0004 § ADR4-2](docs/adr/0004-copilot-graphql-spike.md#adr4-2)). Polls reviews every 30s until at least one Bot review by `copilot-pull-request-reviewer` lands at the current PR head with state ∈ {APPROVED, COMMENTED, CHANGES_REQUESTED} **and submitted at or after the engage-request timestamp** (or the explicit `--submitted-after <iso>` floor if provided); the implicit submitted-after floor enforces the A5 ordering doctrine — a stale Copilot review on the same HEAD that predates the engage request MUST NOT satisfy the gate. `--no-poll` short-circuits after the request for CI usage. Exits 2 on fork PRs (`isCrossRepository == true`) per ADR4-6. The poll predicate matches `scripts/check-copilot-review.mjs` exactly so "engage CLI satisfied" = "A5+A16 gate satisfied". Per Decisions C41-1 / C41-2 / C41-3 / C41-4.
- **CS41:** `scripts/check-clickstop-implementer-not-reviewer.mjs` — new self-host-guarded linter that scans `project/clickstops/{active,done}/*.md`, parses each `## Model audit` block, and fails when `Implementer agent` ≡ `Reviewer agent` (case-insensitive). Mirrors the model-independence invariant from CS35 C35-2 at the agent-identity level (CS35 C35-18). Default behaviour: missing columns → WARNING (one-cycle migration ramp); `--strict-agent-columns` → missing columns become errors. Registered in `harness lint`. Per Decisions C41-5 / C41-6.
- **CS41:** `Implementer agent` + `Reviewer agent` columns now first-class in the `## Model audit` schema. `scripts/check-review-evidence.mjs` parser extended to ingest both rows; new `--strict-agent-columns` flag (default false in v0.5.0; flips true in v0.6.0 per C42-6 strict-flip plan) controls the missing-column severity. PR template (`template/managed/.github/pull_request_template.md`) gains the two new placeholder rows. REVIEWS.md and the composed mirror align the schema prose with the new enforcement. Per Decisions C41-6 / Deliverable 7.
- **CS41:** OPERATIONS.md § Copilot engagement procedure replaces the manual `gh api graphql` recipe with the recommended `harness copilot-engage` invocation; preserves the manual fallback as a documented escape hatch. Adds the A5-ordering doctrine reconfirmation from CS40 PR #172 (each new HEAD requires a new R-row with timestamp BEFORE the most-recent Copilot review's `submittedAt`).
- **CS40:** `harness review-output` subcommand + `scripts/check-review-output.mjs` linter — validates a reviewer's output markdown against the CS40 schema (Analyzed-HEAD line, R1/Rn per-file enumeration vs `git diff --name-only`, finding-row shape `[Blocking|Non-blocking|Suggestion] <file>:<line>: <desc>`, verdict line). Closes [#145](https://github.com/henrik-me/agent-harness/issues/145) gap #3 (PR #28's reviewer summary-passed YAML / package.json without per-file analysis). Exit codes: 0 pass / 1 error / 2 bad usage. Optional `--update-pr` flag idempotently posts the parsed output as a row in the PR body's `## Review log` (canonical 6-column schema per REVIEWS.md §2.7: `timestamp | analyzed_head | actor | model | verdict | evidence_link`; dedup key `analyzed_head + actor + model + verdict`; columns parsed by header so a future column reorder won't silently break it). New `--actor` and `--evidence-link` flags expose the canonical row's actor / evidence_link cells. Optional independence-invariant guard (`--repo`/`--pr`/`--reviewer-model`) parses the PR body's `## Model audit` (canonical `| Field | Value |` schema per REVIEWS.md §2.8) and re-asserts that the reviewer model is NOT in the implementer set, case-insensitive. Per C40-8, this linter is NOT registered with `harness pr-evidence` — it requires the reviewer-output file which is unavailable in CI; orchestrators invoke it locally after capturing reviewer output.
- **CS40:** OPERATIONS.md § Reviewer dispatch gains a new `### Post-review validation` subsection documenting the `harness review-output` invocation contract.
- **CS40:** Tests — `tests/check-review-output.test.mjs` (16 cases) + `tests/cli-review-output.test.mjs` (4 cases) covering R1 happy path, R1 missing/extra files, R1 root-level extensionless files (Makefile/LICENSE/Dockerfile), Rn delta semantics with/without `--prev-head`, malformed verdict line, malformed finding row, missing Analyzed-HEAD, Verdict-Needs-Fix-without-findings, Analyzed-HEAD mismatch warning, JSON output, independence-invariant guard violation (with injected fake-`gh`), `--update-pr` idempotency (with injected fake-`gh` round-trip), `--update-pr` byte-exact preservation of `$`-patterns in PR body (regression for `String.prototype.replace` `$&` interpretation), CLI route + help dispatch.

### Changed

- **CS41:** `harness.config.json` `review_gates` block defaults to `enabled: true` for fresh `harness init` invocations (was opt-in via `--enable-review-gates` in v0.4.0). New `_opt_out_reason: "<string>"` field on the `review_gates` block lets consumers explicitly opt out; `harness sync --mode=check` now ERRORS when `review_gates` is absent OR `enabled: false` without `_opt_out_reason`. Existing repos that ran `harness init --enable-review-gates` are unaffected; repos that never opted in must either opt-in (recommended) or set `_opt_out_reason`. Schema (`schemas/harness.config.schema.json`) and tests (`tests/sync-review-gates-default-flip.test.mjs`) updated. Per Decisions C41-7 / C41-8.
- **CS42:** `scripts/check-clickstop-plan-review.mjs --strict` default flips from `false` (v0.4.0 warn-only) to `true` (v0.5.0 error) per CS35b-10 migration ramp. Local `harness lint` invocations now ERROR rather than WARN on missing/stale `## Plan review` attestations on planned/active CS files. (The PR-time A6 gate via `harness pr-evidence` was already strict from v0.4.0; this change brings local lint into alignment.) **Migration:** any consumer with planned/active CS files lacking the `## Plan review` section will start failing `harness lint` at v0.5.0 — they MUST either backfill the attestation OR pass `--strict=false` explicitly with a documented reason. The harness's own self-host repo had retroactive grandfathering applied during CS35b, so the post-flip `harness lint --quiet` continues at 29/0/3. Per Decision C42-7.

## [0.4.0] — 2026-05-13

### Added

- **CS38b:** Retroactive `henrik-me/sub-invaders#28` self-test + harness self-host opt-in:
  - `docs/cs38b-retro-pr28-transcript.md` — verbatim re-run of `harness pr-evidence` against SI PR #28 (the canonical #145 reference failure case). All 6 documented failures (F1–F6) reproduced; **5 distinct doctrine failures** observed (B1×4 commits, A3 review-log shape, A3 model-audit shape, A4/A16 stale Copilot review, A5 ordering — subsumed by stale check). Per **C38b-5 PASS branch**: required ≥4. ✓ PASS.
  - `tests/fixtures/si-pr28/` — network-free regression fixture: `repo.bundle` (~316 KB git bundle of `e5e5b73a..ec26adf1` + ancestors), `pr.json`, `body.md`, `expected-evidence.json`, `README.md` documenting the LRN-094 + LRN-111 invariants. Anyone can re-run the fixture deterministically without GitHub network.
  - `tests/retro-si-pr28.test.mjs` (NEW; 3 tests) — clones the bundle into `os.tmpdir()` (per LRN-094), runs `harness pr-evidence`, asserts JSON-shape stability + ≥4 distinct gate failures with each assertion citing its Decision ID + REVIEWS.md anchor (per LRN-111).
  - **Harness self-host opt-in**: ran `harness init --enable-review-gates` against the harness repo itself. Patches:
    - `harness.config.json` — added `review_gates: { enabled: true, copilot_required: true, gate_set: ['B1','A3','A4','A5','A16'] }`; migrated `.github/pull_request_template.md` from `managed.files` to `composed.files` with `_inherited_class: 'managed'` + `local_blocks: ['pull-request.review-evidence']`; added `.github/workflows/pr-evidence-lint.yml` to `managed.files`; added `.harness-known-constraints.md` to `seeded.files` (closes orphan-classification gap surfaced by `tests/cs11-self-host-config.test.mjs`).
    - `.github/workflows/pr-evidence-lint.yml` — landed in the harness's own `.github/workflows/` (live workflow; will fire on all subsequent harness PRs).
    - `.github/pull_request_template.md` — appended the `<!-- harness:local-start id=pull-request.review-evidence -->` block with canonical `## Model audit` (key-value `Field | Value`) + `## Review log` (`timestamp | analyzed_head | actor | model | verdict | evidence_link`) tables per REVIEWS.md §2.7/§2.8.
    - `.harness-known-constraints.md` — generated by init (tier `public`).
    - `CONTEXT.md` — added `## Constraints` reference per init scaffold.
    - Branch-protection (`pr-evidence-lint / read-only-gates` required check on `main`) — manual maintainer step per C38a-8; instructions emitted by init, not auto-applied.
  - **Latent-violation triage** (last 10 merged harness PRs): 7 content PRs + 3 workboard-only PRs. Workboard-only PRs short-circuit per C35-19. Of the 7 content PRs (#157, #158, #159, #160, #161, #162, #163): all pass B1 (commit-trailers) + A6 (plan-review-attestation, diff-scoped); 6/7 fail A3+A4 (PR body schema was hardening through CS36/CS37/CS38a); 7/7 fail A5+A16 (Copilot-review gate did not exist yet — A5+A16 enforcement landed mid-arc in PR #160). **Disposition (per C38b-3 (b)):** grandfather all 7 — see [LRN-112](LEARNINGS.md#lrn-112) for the in-arc retroactive grandfathering notice. CS38b's own PR and onwards must comply.
  - Per Decisions C38b-1 through C38b-5.

- **CS38a:** PR-evidence CI workflow + composed PR template + `harness init --enable-review-gates` opt-in:
  - `template/managed/.github/workflows/pr-evidence-lint.yml` — managed CI workflow that wires `harness pr-evidence` into every consumer PR. Split into TWO jobs per [ADR4-8](docs/adr/0004-copilot-graphql-spike.md): `read-only-gates` (runs on `pull_request: [opened, synchronize, reopened, edited]` per LRN-100; permissions `contents: read, pull-requests: read`; computes `--skip-reasons` from event payload) and `mutation-engage` (runs on `workflow_dispatch` only with `pr_number` input; permissions `pull-requests: write`; calls `gh pr edit --add-reviewer copilot-pull-request-reviewer` per ADR4-2). Engagement and verification MUST live on separate events because Copilot delivers reviews asynchronously (~3 min). Uses the canonical clone-then-`node bin/harness.mjs` install pattern (NOT `npx harness@<ref>` — npm 10.8.x's GitFetcher regression makes `npx` invocation flaky); derive-ref step validates against the allowlist `^[a-zA-Z0-9._/-]+$` per CS12 R1 shell-injection hardening.
  - `template/composed/.github/pull_request_template.md` (NEW; composed file class) — replaces the previous `managed`-class PR template. Carries the harness-managed marker block `<!-- harness:local-start id=pull-request.review-evidence --> ... <!-- harness:local-end id=pull-request.review-evidence -->` containing the `## Model audit` + `## Review log` tables that CS37's A5+A16 + CS36's A3+A4 read. Consumer prose outside the marker block is preserved across `harness sync`.
  - `lib/file-class-migration.mjs` (NEW) — pure migration helper. Exports `migrateFileClass(config, filePath, options)` (returns a NEW config; deep-clone safe; idempotent — no-op on already-migrated configs) and `validateMigratable(config, filePath)` (returns `{ ok, reason }`). Used by `harness init --enable-review-gates` to move `.github/pull_request_template.md` from `managed.files` to `composed.files` with `_inherited_class: 'managed'` recorded for audit.
  - `schemas/harness.config.schema.json` — additive `review_gates` block: `{ enabled: bool (default false), copilot_required: bool (default false), gate_set: array of enum ['B1','A2','A3','A4','A5','A6','A16'] }`. Default opt-out in v0.4.0 (per C35-15). No schema version bump (additive only).
  - `harness init --enable-review-gates` — opt-in flag. Patches `harness.config.json` with the `review_gates` block (default `enabled: true, copilot_required: true, gate_set: ['B1','A3','A4','A5','A16','A6']` — the CS37 PASS-branch gate set per ADR4-1), migrates `.github/pull_request_template.md` to composed, and prints a branch-protection instruction block. Idempotent. The branch-protection step is intentionally manual per C38a-8 — the harness CLI does not assume maintainer authority to apply branch rulesets remotely.
  - `OPERATIONS.md` + lockstep template: new `## Init` section documenting `--enable-review-gates`; `## Sync` section gains a `### review_gates block currency` subsection documenting the v0.4.0 WARN → v0.5.0 ERROR escalation path; CS37's A5+A16 row added to the PR-evidence § Gates registered table; CS38a Canonical CI invocation section refreshed with the actual two-job workflow shape (replacing the earlier placeholder reference).
  - Per Decisions C38a-1 through C38a-10.

- **CS37:** GraphQL primitive + Copilot review gate — closes A5 + A16 enforcement on PR-evidence path:
  - `lib/github-graphql.mjs` — minimal in-process GraphQL client. Exports `graphql(query, vars, opts)` (auto/gh/fetch transport selection; token resolution chain `opts.token` > `GITHUB_TOKEN` > `GH_TOKEN` > `gh auth token`), `requestCopilotReview(repo, prNumber, opts)` helper that shells out to `gh pr edit --add-reviewer copilot-pull-request-reviewer` per ADR4-2 (the GraphQL `requestReviews` mutation rejects Bot reviewer IDs — verified via the CS37 spike), `GraphQLError` typed error class with `.kind ∈ {auth-missing, network, http-status, graphql-errors, invalid-json}`, and an `__testSeam` for unit-testing fetch + spawnSync without hitting the real API.
  - `scripts/check-copilot-review.mjs` — A5 + A16 gate. Verifies the PR has a Copilot review (login `copilot-pull-request-reviewer`, `__typename: Bot`) at the current HEAD with state in `{COMMENTED, APPROVED, CHANGES_REQUESTED}` (PENDING is rejected per ADR4-4), AND submitted after the latest local Go in the PR body's `## Review log` (A5 ordering, ADR4-5). Exports `runCheck()` + `findLatestLocalGoTimestamp()` for direct-import testing. Skip semantics per C36-5 / ADR4-7: `workboard-only` and `bot-author` exit 0 with notice; `fork-source` exits 2 with maintainer-rerun hint (forks cannot self-engage Copilot, ADR4-6).
  - `harness pr-evidence` now wires the new gate as `A5+A16 copilot-review`. Conditional dispatch: requires `--repo` and `--pr`; skipped with notice otherwise (preserves local dogfood without a real PR context).
  - `OPERATIONS.md § Copilot engagement procedure` updated with the corrected recipe (`gh pr edit --add-reviewer copilot-pull-request-reviewer`) replacing the documented-but-broken `requestReviews` GraphQL mutation. CI implication (ADR4-8) recorded: engage-and-verify in one workflow run will always fail on first execution — CS38a CI must split into separate jobs/events.
  - `docs/adr/0004-copilot-graphql-spike.md` records the full live-API spike transcript (S1 identity, S2 engagement, S3 lifecycle) plus decisions ADR4-1 through ADR4-8 that lock the design for CS38a/CS38b/CS39/CS41. Spike outcome: PASS — full A5 + A16 enforcement ships, no degradation.
- **CS36:** PR-evidence aggregator — new `harness pr-evidence` subcommand and two new gate scripts under `scripts/`:
  - `harness pr-evidence --base <sha> --head <sha> --pr-body <file> [--repo <slug>] [--pr <num>] [--skip-reasons <csv>] [--json] [--quiet]` — single entry point that runs the mechanical PR-state evidence gates against an open PR's commit graph + body markdown. Aggregates B1, A3, A4, and A6 (diff-scoped) and exits non-zero on any gate failure. Centralises skip semantics per the C35-19 / C36-5 matrix (`workboard-only` short-circuits all gates; `bot-author` skips B1+A3+A4 but still runs A6; `fork-source` runs all read-only gates). Output modes: default human-readable, `--quiet` summary-only, `--json` structured. NOT registered in `harness lint` (per C35-17 — local lint must not require PR context).
  - **B1:** `scripts/check-pr-commits.mjs` — verifies every commit in `<base>..<head>` (including merge commits) carries the canonical `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` trailer. Surfaces an actionable fetch hint when SHAs are not locally present.
  - **A3+A4:** `scripts/check-review-evidence.mjs` — single script that parses the PR body markdown and validates the `## Model audit` section (no implementer-vs-reviewer model overlap — A3) plus the `## Review log` section (latest `Go` row's `analyzed_head` equals `--head` — A4).
  - **A6:** Diff-scoped re-use of the CS35b `check-clickstop-plan-review.mjs` predicate via the new `--files <csv>` flag. Aggregator computes the planned/active CS files in the PR diff and threads them so pre-arc grandfathered files cannot fail unrelated PRs (per LRN-108).
  - Doctrine + canonical local + CI invocation in `OPERATIONS.md § PR-evidence aggregator (CS36)` and the lockstep template copy. Per Decisions C36-1 through C36-11.
- **CS35b:** Plan-review attestation linter (`scripts/check-clickstop-plan-review.mjs`) + `harness plan-review-hash <file>` CLI helper + `lib/plan-review-hash.mjs` library — enforces a `## Plan review` H2 attestation section on every `project/clickstops/planned/*.md` and `project/clickstops/active/*.md` file, with hash-based freshness verification (12-char SHA-256 prefix over Decisions+Deliverables bodies), reviewer-vs-author independence, and a verdict gate (`Go` / `Go-with-amendments` pass; `Needs-Fix` blocks). Wired into `harness lint` (warn-only on missing-section in v0.4.0 standalone mode; CS42-7 flips the standalone `--strict` default to `true` for v0.5.0). Also dispatched by the `harness pr-evidence` aggregator (lands in CS36) as gate A6, which is **STRICT in both v0.4.0 and v0.5.0** regardless of the standalone flag — local convenience asymmetry per C35b-9. Doctrine + procedure in `OPERATIONS.md § Plan review attestation procedure (CS35b)`; schema reference in `REVIEWS.md § Plan review (planned/active CS attestation)`. Retroactive grandfathering: all 9 already-filed planned files in the v0.4.0+v0.5.0 enforcement-gap arc (CS36, CS37, CS38a, CS38b, CS39, CS40, CS41, CS42, plus CS35b itself) carry `## Plan review` rows recording the GPT-5.5 R1 review of 2026-05-12 + the post-amendment R2 review of 2026-05-13. Closes the gap exposed by PR #147 (planned files merging without any documented independent review). Per Decisions C35b-1 through C35b-15.
- **CS35:** Planning-locality linter (`scripts/check-planning-locality.mjs`) — bans repo-root scratch planning files (`PLAN.md`, `ROADMAP.md`, `TODO.md`, `NOTES.md`, `STRATEGY.md`) outside `project/clickstops/{planned,active,done}/`, `template/`, `node_modules/`, `.git/`, `tests/fixtures/`. Wired into `harness lint`. Strategic planning content must live in the canonical CS arc; session storage is non-durable. (Per Decisions C35-11, C35-12.)
- **CS35:** Reviewer-doctrine front-load — `REVIEWS.md` review-log + model-audit schemas made explicit (C35-3, C35-4); R1/Rn distinction and stale-diff doctrine documented; PR-evidence gate names A1..A6 introduced as a reference table so CS36..CS41 can refer to gates by short name. (Per Decisions C35-3, C35-4, C35-5.)
- **CS35:** Reviewer-model fallback ladder (`OPERATIONS.md` § Sub-agent dispatch + `REVIEWS.md` § 2.2) — GPT-highest-available → Sonnet-highest → orchestrator's-own with independence invariant. Canonical reviewer preamble between `<!-- harness:reviewer-preamble:start/end -->` markers; orchestrator pastes verbatim per LRN-068 pattern. Copilot engagement procedure documented for v0.4.0 (manual until CS41's `harness copilot-engage` wrapper). (Per Decisions C35-1, C35-2, C35-10.)
- **`harness lint --explain` covers all 18 shipped linters** (was 3 in
  v0.3.1: `architecture`, `text-encoding`, `workboard`). New entries:
  `clickstop`, `commit-trailers`, `compose-v2`, `composed-blocks`,
  `context`, `fixtures`, `instructions`, `learnings`, `pack`, `pr-body`,
  `public-artifact`, `readme`, `scaffold-readme`, `templates`,
  `workflow-pins`. Each entry documents the linter script, target file/dir,
  rule set, and a Why or Canonical-seed line. Per CS32/D3, applies LRN-104.
- `harness lint cs-plan`: new linter that flags harness-repo-internal path prefixes (`template/composed/`, `lib/`, etc.) inside consumer CS plans; self-host-guarded. Closes the second half of LRN-105 (CS34).

### Changed

- **CS38a — `.github/pull_request_template.md` file class transitions `managed` → `composed`** — consumers that pinned to v0.3.x will see the file class change on their next `harness sync` after upgrading to v0.4.0. Consumers that DID NOT customize the prior managed PR template see no behavioural change. Consumers that DID customize will need to either run `harness init --enable-review-gates` (which performs the migration) or add an explicit `composed.overrides[".github/pull_request_template.md"] = { _inherited_class: "managed", local_blocks: ["pull-request.review-evidence"] }` entry to `harness.config.json`. The `_inherited_class: "managed"` field records prior provenance for any future audit.

- **`harness lint` now suggests `--explain <name>`** at the bottom of every
  linter failure block (gated on registry presence; suppressed under
  `--quiet`). Per CS33, applies LRN-104 (auto-suggest piece).

- **`harness lint --skip NAME`** now exits 2 with a known-linters list when
  `NAME` matches no linter, instead of silently no-op'ing the unknown
  name. Mirrors the CS31 `--only` validation. Mixed valid+typo
  selections (e.g. `--skip workflow-pins,typo`) also fail. The error
  matches the `--only` UX. A typo in a CI workflow that intends to
  skip a renamed/removed linter no longer silently re-runs that
  linter — the typo is surfaced. Per CS32/D1, applies LRN-106.

- **`harness lint --only NAME` and `harness lint:NAME`** now exit 2 with a
  known-linters list when `NAME` matches no linter, instead of silently
  exiting 0 with `Total: 0 passed, 0 failed, 0 skipped`. Refines the
  CS30/D2 contract — the `lint:NAME` dispatcher rewrite is preserved
  (the dispatcher still must NOT emit `Unknown subcommand` for `lint:typo`),
  but `cmdLint` now rejects zero-match selections so a typo in a CI
  workflow (e.g. `harness lint:text-encding`) fails loudly. Mixed
  valid+typo selections (e.g. `--only learnings,typo`) also fail. The
  error mirrors the existing `--explain unknown-name` UX —
  `lint --explain <name>` is the canonical "give me help on one linter"
  partner of `--only` / `lint:NAME` (see also LRN-104 on per-linter
  explainability). Per CS31.

## [0.3.1] — 2026-05-12

### Added

- **`harness lint:NAME`** alias as a shorthand for `harness lint --only NAME` (CS30/D2). Aliases the
  one linter name into a focused run — e.g. `harness lint:text-encoding` runs only `check-text-encoding`.
  Resolves [SI Finding #2](docs/migration-v0.2.x-to-v0.3.0.md#si-finding-2-no-lint-name-form).
- **`harness lint --explain <name>`** subcommand prints the full rule set + canonical seed/template
  path for one supported linter (currently: `architecture`, `text-encoding`, `workboard`). The
  registry is colocated with `cmdLint` in `bin/harness.mjs` and grows opportunistically. Per CS30/D5.
- **Version header on every `harness lint` run:** the first stdout line is now
  `# harness vX.Y.Z — lint (cwd: <path>)` (printed regardless of `--quiet`). Makes CI logs and
  cross-clone debugging unambiguous about which harness produced a result. Per CS30/D8.
- **`scripts/check-text-encoding.mjs --respect-gitignore`** (default ON) — when `--dir` is inside
  a git repo, the scan list comes from `git ls-files --cached --others --exclude-standard` instead
  of a recursive walk. Build artifacts in `.gitignore`d directories (e.g. dotnet's `api/bin/`,
  `api/obj/`) no longer surface as CRLF/BOM violations. `--no-respect-gitignore` re-enables the
  recursive walk. Tracked content is still always checked. Per CS30/D3.
- **`docs/migration-v0.2.x-to-v0.3.0.md`** — concrete consumer migration steps for upgrading from
  the v0.2.x line to v0.3.0 (BREAKING WORKBOARD shape) plus v0.3.1 (text-encoding gitignore default,
  improved architecture-linter discoverability). Cross-linked from `[0.3.0]` BREAKING entry. Per CS30/D4.

### Changed

- **`scripts/check-architecture.mjs` error message:** when a required heading is missing, the
  error now lists the FULL required-heading set and points at `template/seeded/ARCHITECTURE.md`
  as the canonical skeleton — plus the `harness lint --explain architecture` hint. Previous
  message just said `Missing required heading: "## Data model"` with no recovery path. Per CS30/D5.
- **`OPERATIONS.md` (composed)** new subsection "Composed-block edits — consumer vs harness-repo
  paths" clarifies which file an editor should touch in a consumer repo (root file, between
  marker comments) vs the harness repo (`template/composed/`). Resolves [SI Finding #6](docs/migration-v0.2.x-to-v0.3.0.md#si-finding-6-composed-block-paths). Per CS30/D6.
- **`OPERATIONS.md` (composed)** Reusable-CI-workflow section now documents the **SAML-safe
  `git ls-remote` fallback** for resolving an `actions/<owner>/<repo>@<tag>` SHA when the org
  enforces SAML SSO and `gh api` returns 403 (the standard recipe breaks for Azure-published
  actions). Resolves [SI Finding #7](docs/migration-v0.2.x-to-v0.3.0.md#si-finding-7-saml-blocked-gh-api). Per CS30/D7.

## [0.3.0] — 2026-05-11

### Added

- **LRN-102** ([LEARNINGS.md](LEARNINGS.md#lrn-102)): WORKBOARD shows live coordination state only — never duplicate the planned/ queue or done/ history.
- **Regression test** `tests/cs25-runtime-deps.test.mjs` locks the contract that `ajv`, `ajv-formats`, and `js-yaml` remain runtime `dependencies` (not `devDependencies`). Per CS25.

### Fixed

- **`harness init` from a fresh consumer (CS25):** moved `ajv ^8.20.0`, `ajv-formats ^3.0.1`, and `js-yaml ^4.1.0` from `devDependencies` to `dependencies` in `package.json`. Without this fix, `npx -y "github:henrik-me/agent-harness#vX.Y.Z" init` silently failed the constraint-merge and post-init sync steps with `Cannot find package 'ajv'` (visible as warnings on stderr; the warning text directed users to a manual `harness sync --mode=apply` workaround which itself also failed for the same reason). Affected every fresh consumer install on `v0.1.0` and `v0.2.0`. Surfaced during sub-invaders bootstrap (2026-05-11) Finding #1; required a manual `npm install --no-save ajv ajv-formats js-yaml` workaround into the npx cache. Per CS25.
- **Test-race regression (CS25 piggyback):** two pre-existing tests (`tests/lib-lock-reader.test.mjs`, `tests/check-clickstop.test.mjs`) wrote transient files under `REPO_ROOT` during parallel `node --test`, racing with `check-text-encoding`'s recursive walk and intermittently failing the self-host test (LRN-094 anti-pattern). Both moved to `os.tmpdir()`. CS28 forbidden-section fixtures (`_tmp_forbidden_*.md`) also moved out of `tests/fixtures/cs06/workboard/` for the same reason. Diagnostic on `tests/check-text-encoding.test.mjs` test 12 improved to surface `stderr`. Per CS25.

### Changed (BREAKING)

- **WORKBOARD shape (CS28):** `WORKBOARD.md` and `template/seeded/WORKBOARD.md` no longer contain `## Queued` or `## Recently Completed` sections. Live coordination state only — Orchestrators table + Active Work table. The queue lives in `project/clickstops/planned/` (filesystem source-of-truth, priority via filename + per-file `**Depends on:**`); historical record lives in `project/clickstops/done/`. **Consumer migration:** running `harness sync` against an existing consumer will diff the seeded WORKBOARD template, but seeded files are create-if-missing — existing WORKBOARDs are not auto-rewritten. Consumers should manually delete their `## Queued` and `## Recently Completed` sections; `harness lint` (`check-workboard.mjs`) now forbids both headings (was: `Recently Completed` was *required*). Any orchestrator process docs / scripts referencing those sections must be updated to cross-link `project/clickstops/{planned,done}/` instead. Per CS28 / [LRN-102](LEARNINGS.md#lrn-102).
- **`check-workboard.mjs` (CS28):** required headings reduced from `[Orchestrators, Active Work, Recently Completed]` to `[Orchestrators, Active Work]`; new check forbids `## Queued` and `## Recently Completed` headings (any occurrence is an error); removed the previous "exactly one Recently Completed" duplicate-section check and the "stale in-flight language in Recently Completed rows" check (both obsolete — the section is now forbidden). Per CS28.
- **`template/managed/TRACKING.md` (CS28):** rewritten lifecycle/state-table prose to drop "Queued" (now "Planned") wording and to clarify that close-out removes the WORKBOARD Active Work row (the `done/` directory IS the historical record — no "moves to Recently Completed" step). Per CS28.
- **`README.md` (CS28):** `WORKBOARD.md` per-path description rewritten to "Live coordination only — Orchestrators + Active Work. Nothing else." Per CS28.

## [0.2.0] — 2026-05-10

### Added

- **Lock schema:** new optional `fileEntry.template_prose_hash` field
  (composed-class only) records the SHA-256 of the template skeleton
  (post-templating, post-local-block-strip, LF-normalised) at sync time.
  Per CS03d / [LRN-020](LEARNINGS.md#lrn-020).
- **Schema:** new `schemas/legacy-composed-mapping.schema.json` (Draft-2020-12)
  formally defines the shape of `legacy_composed_mapping.json` (the file
  consumers author when `harness sync` raises `EMERGE_LEGACY_UNMAPPED`).
  Mirrors the runtime rules in `lib/composed.mjs validateLegacyMapping`.
  Consumer files may set `"$schema"` to the new schema for IDE autocomplete.
  Example starter file shipped at `examples/legacy-composed-mapping.example.json`.
  Per CS03e / [LRN-019](LEARNINGS.md#lrn-019).
- **Public readiness:** added public-repo issue templates, contribution/security
  docs, Dependabot and secret-scan configuration, npm pack dry-run CI, and
  ruleset documentation so the harness can be safely consumed from a public
  GitHub repository. Per CS15a / [LRN-080](LEARNINGS.md#lrn-080) /
  [LRN-081](LEARNINGS.md#lrn-081).
- **Shared config readers:** added fail-closed `lib/config-reader.mjs` and
  `lib/lock-reader.mjs` helpers used by linters and CLI paths that need
  consistent config/lock parsing. Per CS15d.
- **Template and scaffold linting:** added `check-templates` and
  `check-scaffold-readme` coverage, plus `harness lint` auto-dispatch for
  shipped scaffold policy linters. Per CS15d / [LRN-087](LEARNINGS.md#lrn-087)
  / [LRN-088](LEARNINGS.md#lrn-088) / [LRN-089](LEARNINGS.md#lrn-089)
  / [LRN-090](LEARNINGS.md#lrn-090).
- **Private-tier detection:** `harness init` can detect GitHub repository tier,
  record `constraints` in `harness.config.json`, emit the seeded
  `.harness-known-constraints.md` artifact, and accept
  `--constraint-disposition` / `--skip-constraint-detection` flags.
  Per CS15e / [LRN-092](LEARNINGS.md#lrn-092) /
  [LRN-093](LEARNINGS.md#lrn-093) / [LRN-094](LEARNINGS.md#lrn-094).

### Changed

- **Doc-schema utilities:** centralized heading collection, GitHub-style anchor
  generation, H2 collection, and section extraction in `lib/doc-schema.mjs`,
  with instructions/readme/clickstop linters delegated to the shared helpers.
  Per CS06c / [LRN-096](LEARNINGS.md#lrn-096).
- **`harness sync` no longer requires a `legacy_composed_mapping.json` when
  the only divergence between a consumer's composed file and the template is
  harness-side prose evolution.** `mergeComposed()` now uses the new
  `template_prose_hash` to distinguish "template prose evolved" (consumer
  didn't touch their prose — auto-adopt the new template prose) from
  "consumer edited prose" (existing fail-closed `EMERGE_LEGACY_UNMAPPED`
  behavior retained). First sync after upgrade from v0.1.x bootstraps the
  new field automatically (silent auto-adopt for one sync; subsequent syncs
  use full evolution detection). Per CS03d / [LRN-020](LEARNINGS.md#lrn-020).
- New public helper `computeTemplateProseHash(template)` exported from
  `lib/composed.mjs` for downstream tooling that needs to compute the same
  hash the lock writer uses.
- **CLI cleanup:** `--config` is now threaded through `sync` and `check`,
  invalid config errors include the override path, `--ref` is explicitly
  rejected where unsupported, and `harness init` finalizes by running the
  sync path so a fresh init is immediately drift-clean. Per CS15c /
  [LRN-084](LEARNINGS.md#lrn-084) / [LRN-085](LEARNINGS.md#lrn-085).
- **Restartability docs:** retired `HANDOFF.md` and consolidated bootstrap,
  session-start, open-LRN audit, and repo-layout guidance into `README.md`,
  `INSTRUCTIONS.md`, and `OPERATIONS.md`. Per CS15f /
  [LRN-098](LEARNINGS.md#lrn-098) / [LRN-099](LEARNINGS.md#lrn-099).

### Fixed

- **Workflow validation:** `check-workflow-pins` now fails on YAML parse errors
  when `js-yaml` is available, and `private-smoke.yml` quotes the step
  name that previously broke GitHub Actions parsing. Per CS14 /
  [LRN-078](LEARNINGS.md#lrn-078).
- **Reusable self-check CI:** `harness-self-check-via-reusable` now checks the PR
  head SHA instead of the synthetic merge SHA, avoiding false drift on reusable
  workflow validation.
- **Public-flip security and policy:** refreshed vulnerable lockfile content
  before the public flip and documented the GitHub ruleset admin-bypass model
  needed for protected PRs. Per CS15a / [LRN-080](LEARNINGS.md#lrn-080) /
  [LRN-081](LEARNINGS.md#lrn-081).
- **Close-out hygiene:** clickstop/workboard linters now catch missing close-out
  task rows, duplicate `Recently Completed` sections, and stale in-flight language in
  completed rows. Per CS15a / [LRN-082](LEARNINGS.md#lrn-082) /
  [LRN-083](LEARNINGS.md#lrn-083).
- **Workflow hardening:** refreshed GitHub Actions pins and pinned npm 11.2.0 in
  `private-smoke.yml` to avoid the npm 10.x `GitFetcher` regression in the
  npx-from-GitHub path.
- **Template linter markdown handling:** `check-templates` now skips tilde
  fences, indented markdown code blocks, and N-backtick inline spans without
  masking real violations in YAML or other non-markdown files. Per CS08c /
  [LRN-097](LEARNINGS.md#lrn-097).

### Changed (BREAKING)

- **Schema:** removed top-level `local_blocks` from `harness.config.json`.
  `composed.overrides[<file>].local_blocks` is now the single source of truth
  for per-file composed-block allowlists. Configs carrying the old top-level
  form are now rejected by Ajv with an `additional properties` error naming
  `local_blocks`. Migration: move every entry from `local_blocks[<file>]`
  into `composed.overrides[<file>].local_blocks` and delete the top-level
  key. Resolves [LRN-009](LEARNINGS.md#lrn-009) (CS02b).

### Migration: v0.1.0 → v0.2.0

v0.2.0 is still on the SemVer 0.x line, but it includes one intentional
breaking config-schema cleanup: top-level `local_blocks` is no longer accepted in
`harness.config.json`. The per-file form is now the only supported shape.

Mechanical migration:

1. For every top-level `local_blocks[<file>]` entry, create or update
   `composed.overrides[<file>].local_blocks` with the same array of block IDs.
2. Delete the top-level `local_blocks` key.
3. Run `harness sync --mode=check` (or `node bin/harness.mjs lint --quiet`
   in this repo) to confirm the config validates and the composed-block
   allowlists are enforced.

On the first sync after upgrading from v0.1.x, the sync engine also
bootstraps `template_prose_hash` for composed files in `.harness-lock.json`.
That one-time bootstrap auto-adopts current template prose when the consumer
has not edited prose outside local blocks; later syncs use the recorded hash
to distinguish template prose evolution from consumer-authored prose.

## [0.1.0] — 2026-05-04

Initial private-tier release. The harness governs itself (CS11 self-host) and is
ready for invitation-only consumers via `npx -y github:henrik-me/agent-harness#v0.1.0`.

### Added
- `bin/harness.mjs` — CLI dispatcher with subcommands: `init`, `sync`, `lint`,
  `pack`, `whoami`, `version`, `help` (CS04+).
- `lib/sync.mjs`, `lib/composed.mjs`, `lib/templating.mjs`, `lib/lock.mjs`,
  `lib/doc-schema.mjs` — sync engine, composed-blocks merge, templating with
  capture-group guard + escape syntax, lock read/write, shared doc parsing
  (CS03 + CS03b + CS05).
- 15 linters wired into `harness lint --quiet` aggregator (CS05–CS13):
  learnings, context, workboard, architecture, clickstop, instructions,
  readme, composed-blocks, workflow-pins, text-encoding, fixtures, pack
  (self-host-guarded), public-artifact, pr-body, commit-trailers,
  compose-v2, render-deploy-summary.
- 8 scaffold bundles via `harness init --with-scaffold <name>` (CS10):
  smoke, migrations, container-validate, health-check, seed, verify-deploy,
  feature-flags, cs-probes.
- 7 managed + 3 composed process-doc templates (CS08); `harness init`
  produces a fully linter-passing consumer repo from a single command (CS09).
- Reusable GitHub workflow `harness-checks.yml` (`workflow_call`) +
  drift-detection template `harness-drift.yml` (weekly auto-PR) (CS12).
- npm packaging readiness: `check-pack.mjs` validates tarball shape against
  forbidden patterns + required entries + size budget (CS13).
- Tag-triggered release workflow + private-consumption smoke test (CS14, this release).

### Security
- All GitHub Actions workflows pass externally-influenced values through
  `env:` and validate against an allowlist regex before shell consumption
  (LRN-075). Defence-in-depth against shell injection.
- `check-public-artifact` linter blocks accidental publication of secrets
  (GitHub PAT, AWS keys) and forbidden internal URLs (CS06).

### Documentation
- README, INSTRUCTIONS, OPERATIONS, CONVENTIONS, REVIEWS, TRACKING,
  RETROSPECTIVES — managed via `harness sync` from `template/managed/` +
  `template/composed/`. CS01 → CS11 evolution.
- CONTEXT, ARCHITECTURE, LEARNINGS (77 entries), WORKBOARD — seeded
  project-state docs.

[Unreleased]: https://github.com/henrik-me/agent-harness/compare/v0.9.0...HEAD
[0.9.0]: https://github.com/henrik-me/agent-harness/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/henrik-me/agent-harness/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/henrik-me/agent-harness/compare/v0.6.0...v0.7.0
[0.2.0]: https://github.com/henrik-me/agent-harness/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/henrik-me/agent-harness/releases/tag/v0.1.0
