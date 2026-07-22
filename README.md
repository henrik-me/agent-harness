# agent-harness

Multi-agent process harness — extracted from [`henrik-me/guesswhatisnext`](https://github.com/henrik-me/guesswhatisnext) for reuse across projects.

> **Status:** v0.17.0 shipped (2026-07-05) — minor release bundling the work merged since v0.16.0: **CS86** (the canonical `harness dispatch` sub-agent briefing preamble + its language-profile fences are relocated out of the always-loaded `OPERATIONS.md` into a new harness-owned **managed** [`DISPATCH-PREAMBLE.md`](DISPATCH-PREAMBLE.md) — the single source `harness dispatch` now machine-extracts, byte-identically, with a fail-closed fallback to the legacy inline `OPERATIONS.md` for un-synced consumers; the new managed file is a Minor trigger), **CS71** (the managed `review-gates.yml` / `pr-evidence-lint.yml` derive the `workboard-only` evidence-gate skip from the PR's allowlist-confined **diff** rather than the racy label, so a correctly-shaped workboard PR is green on its first CI event, plus a new `check-workboard-allowlist-consistency` linter), **CS91** (fixes [#394](https://github.com/henrik-me/agent-harness/issues/394) — `workboard-auto-approve.yml` hardening — and [#395](https://github.com/henrik-me/agent-harness/issues/395) Rec A/C: the merge-posture reframe + a bounded `workboard/maint-*` auto-merge pattern; Rec B stays open in CS106), **CS26** (a new `check-config-placeholders` linter + seeded `.gitattributes` + a real `version` pin on fresh `harness init`), **CS68** (`harness review --implementer-models` for non-CS dependency/maintenance branches), **CS24** (`check-clickstop` now mechanically requires a CHANGELOG-touch task row on distributed-surface CSs; LRN-101), **CS75** (`check-clickstop` directory-form recursion + fence-aware plan-vs-impl gate), **CS76** (fixes [#229](https://github.com/henrik-me/agent-harness/issues/229) — consumer-shipped composed process-doc cross-references resolve), and **CS87** (`copilot-engage --help` accuracy). The new managed file + new linters + new `--implementer-models` flag are the Minor triggers. See [`CHANGELOG.md`](CHANGELOG.md) for the full delta. **Prior:** v0.16.0 shipped (2026-07-04) — minor release shipping **CS102** (fixes [#423](https://github.com/henrik-me/agent-harness/issues/423)): the canonical `harness dispatch` sub-agent briefing preamble is split into a language-**agnostic** managed core (preflight, file ownership, required reading, fail-closed, report shape) plus selectable **language profiles** (`node` | `dotnet`). A new optional `dispatch.language_profile` key in `harness.config.json` + a `--language-profile <name>` CLI override splice the ecosystem-specific conventions + self-checks into the core, so a .NET consumer no longer has to negate Node/ESM/npm conventions in every dispatch (config parsed **fail-closed**; unknown profile exits 2; default `node`, backward-compatible). The new config key + flag are the Minor trigger. See [`CHANGELOG.md`](CHANGELOG.md) for the full delta. **Prior:** v0.15.0 shipped (2026-07-03) — minor release bundling the merged **#420–#424** arc: **CS100** (the new opt-in **`harness install-hooks`** verb — a git `prepare-commit-msg` hook that auto-adds the `Co-authored-by: Copilot` trailer **including on merge commits**, so the commit-trailers (B1) gate passes by construction and the recurring manual `git commit --amend` on merges goes away; fixes [#421](https://github.com/henrik-me/agent-harness/issues/421)), **CS103** (the managed `pr-evidence-lint.yml` workflow now re-runs `read-only-gates` on `pull_request_review` submissions so the async Copilot review auto-passes A5+A16 without a manual `gh run rerun`, plus a new `REVIEWS.md` §2.4.3 "leaner review sequencing" doctrine; fixes [#424](https://github.com/henrik-me/agent-harness/issues/424)), **CS97** (`check-commit-trailers` no longer false-fails on `.git/COMMIT_EDITMSG` `#`-comment/`>8`-scissors lines left by a rebase/merge; fixes [#420](https://github.com/henrik-me/agent-harness/issues/420)), and **CS101** (`harness review`'s Copilot leg delegates to the hardened `copilot-engage` REST `--add-reviewer` path; fixes [#422](https://github.com/henrik-me/agent-harness/issues/422)). The new `install-hooks` verb + the consumer-visible managed-workflow trigger are the Minor triggers. See [`CHANGELOG.md`](CHANGELOG.md) for the full delta. **Prior:** v0.14.0 shipped (2026-07-03) — minor release shipping **CS95** (fixes [#417](https://github.com/henrik-me/agent-harness/issues/417)): `harness status` and `harness claim` now compare a clickstop's **Owner** to the current full agent-id, so an orchestrator in a concurrent same-machine clone (`<id>-c<N>`) can't mistake another orchestrator's active CS for its own — `status` annotates each Active-Work / on-disk row ` (you)` / ` (not you: <id>)`, and `claim`'s already-active no-op **refuses** (exit 1, naming the owner) on an owner mismatch unless the new **`--takeover`** flag reassigns ownership (the minor-bump trigger). All comparisons are exact full-id equality — never a prefix match (`yoga-ae` ≠ `yoga-ae-c3`). See [`CHANGELOG.md`](CHANGELOG.md) for the full delta. **Prior:** v0.13.0 shipped (2026-07-03) — minor release bundling the work accumulated since v0.12.0: **CS65** (LEARNINGS archive tier — aged `applied`/`obsolete` entries move to a sibling `LEARNINGS-archive.md` behind anchor-stable `### LRN-NNN` stub redirects), **CS85** (the `check-clickstop-link-durability` guard, closing the [#371](https://github.com/henrik-me/agent-harness/issues/371) bootstrap-durability defect class in both self-host and consumer mode), **CS92** (`harness copilot-engage` reliability hardening — transient-`gh` retry, reviewer-add verification, and an honest `verified` signal), and **CS93** (fixes [#407](https://github.com/henrik-me/agent-harness/issues/407) — `harness review <pr>`'s non-dry-run clickstop lookup now resolves zero-padded and directory-form clickstops via a padding-insensitive, fail-closed resolver). See [`CHANGELOG.md`](CHANGELOG.md) for the full delta. **Prior:** v0.12.0 shipped (2026-07-02) — minor release shipping **CS83** (consumer-doc invocation-form genericity, [#370](https://github.com/henrik-me/agent-harness/issues/370)): consumer-shipped onboarding docs (`INSTRUCTIONS.md`, `.github/copilot-instructions.md`, `RETROSPECTIVES.md`, `READMEGUIDE.md`) and the `OPERATIONS.md` process base now render **consumer-valid** CLI invocations via a render-context-gated `{{harness_invoke}}` templating placeholder — the self-host renders `node bin/harness.mjs` while consumers render `npx -y github:henrik-me/agent-harness#<ref>` (injected by `lib/sync.mjs` as a default under `config.templating`, so existing consumers get the corrected form on the next `harness sync` with no re-init) — replacing the harness-repo-local `node bin/harness.mjs` / `node scripts/*.mjs` commands that don't exist in a consumer; `scripts/check-consumer-template-genericity.mjs` gains an orthogonal invocation scan so the regression cannot recur (the new optional `templating.harness_invoke` key is the minor-bump trigger). Re-files the command-example half of #356. See [`CHANGELOG.md`](CHANGELOG.md) for the full delta. **Prior:** v0.11.0 shipped (2026-07-02) — minor release closing the consumer-feedback loop on issues [#352](https://github.com/henrik-me/agent-harness/issues/352)/[#356](https://github.com/henrik-me/agent-harness/issues/356): **CS80** made the `harness release` verb the **single** creator of the GitHub Release (deleted the redundant pre-verb `release.yml`); **CS81** fixed three dangling cross-references shipped in the v0.10.0 consumer templates (placeholder `LRN-A`/`LRN-B`→`LRN-164`/`LRN-165`, a stale `INSTRUCTIONS.md` anchor, and `READMEGUIDE.md` `docs/adr` links) and added the `check-doc-xref-resolvability` linter (the minor-bump trigger); **CS82** made `harness sync --mode=apply` derive **correct** lock provenance under `npx`/`npm` installs (or fail closed) instead of silently writing placeholders. **Prior:** v0.10.0 shipped (2026-07-01) — minor release shipping the **`harness release` verb** (CS67): a previewable, two-phase, dry-run-first CLI that mechanizes the release cut that [OPERATIONS.md § Release process](OPERATIONS.md#release-process) documents by hand — Phase A previews/applies the version bump + CHANGELOG `[Unreleased]→[x.y.z]` promotion + README pin sweep (refusing a SemVer-inconsistent bump); Phase B verifies the squash SHA, cuts the **annotated** tag (`git tag -a` + push) + GitHub Release (`gh release create --verify-tag`), and files issue-only consumer notifications — with **CS78** aligning Phase B to the manual annotated-tag process. See [`CHANGELOG.md`](CHANGELOG.md) for the full delta. **Earlier:** v0.9.0 shipped (2026-06-30) — minor release bundling the lifecycle-verb arc: new CLI subcommands `harness startup` / `status` / `claim` / `close-out` / `dispatch` (CS64), `harness doctor` (CS64b), and the review-family verbs `harness review-doc` / `review-cs` / `perf-review` / `security-review` (CS66); new linters (CS69 `### LRN-NNN` H3-header enforcement, CS70 directory-form close-out orphan guard, CS72 consumer-template genericity); and the consumer-onboarding docs (`INSTRUCTIONS.md`, `.github/copilot-instructions.md`) genericized + reclassified to the composed file class (CS72). See [`CHANGELOG.md`](CHANGELOG.md) for the full delta. v0.8.0 shipped (2026-06-09) — minor release bundling the CS63 harness-hardening arc plus a multi-CS open-learnings cleanup. **New CLI subcommands** (the minor-bump triggers per [OPERATIONS.md § SemVer policy](OPERATIONS.md)): **`harness upgrade <ref>`** (CS63c, [#270](https://github.com/henrik-me/agent-harness/pull/270)) — a read-only dry-run preview of bumping the pinned harness to `<ref>`; and **`harness harvest`** (CS63b, [#267](https://github.com/henrik-me/agent-harness/pull/267)) — the de-stubbed advisory scan of stale `open` learnings. **New default-on consumer merge gate:** `template/managed/.github/workflows/harness-pr-check.yml` (CS63a, [#264](https://github.com/henrik-me/agent-harness/pull/264)) runs `harness lint` + a managed/composed file-class drift classifier on every consumer PR; fresh `harness init` opts in by default (set `pr_check.enabled: false` to opt out). Existing consumers adopt manually (copy the workflow + add it to `managed.files`). **Other shipped work:** **CS54b** ([#258](https://github.com/henrik-me/agent-harness/pull/258)) deletes the orphaned pre-strict PR template; **CS61** ([#250](https://github.com/henrik-me/agent-harness/pull/250)) ships the shared dep-free `lib/reviews-policy.mjs` config reader (LRN-145, applies/closes residual LRN-142); **CS62** ([#251](https://github.com/henrik-me/agent-harness/pull/251)) makes `harness whoami` tests hermetic against the checkout folder name (LRN-146); **CS60** ([#244](https://github.com/henrik-me/agent-harness/pull/244)) lands a 7-LRN cleanup bundle (LRN-132/133/140/141/142/143/144); **CS57** ([#232](https://github.com/henrik-me/agent-harness/pull/232)) hardens the post-CS48 model-independence linter; **CS47** ([#236](https://github.com/henrik-me/agent-harness/pull/236)) closes out the LRN-124 detached-HEAD investigation with a permanent registry-driven regression guard; **CS27** ([#239](https://github.com/henrik-me/agent-harness/pull/239)) tightens the `lib/sync.mjs` WORKBOARD active-row detector + adds `harness lint` adoption hints; **CS63b/C63-5** adds `scripts/check-closeout-freshness.mjs` (close-out PRs touching `active_csNN_* → done_csNN_*` must touch `CONTEXT.md`); and **CS68** documents the clickstop-filing procedure end-to-end. v0.7.0 shipped (2026-06-03) — minor release bundling three clickstops: **CS54** (v0.x doc cleanups: cross-repo pin-bump PR-body checklist [LRN-134], narrow re-attest pattern [LRN-135], Review log `model`-column bare-id rule + `check-review-log-evidence.mjs` gate hardening [LRN-136], and a `reviews.*` vs `review_gates.*` config-block disambiguation section; LRN-139 filed for the plan-side fact-claim verification gap), **CS55/[#213](https://github.com/henrik-me/agent-harness/pull/213)** (cross-repo handoff doctrine — Hard Rule § 6 "file issues, never commit" in non-harness repos; LRN-137), and **CS56/[#216](https://github.com/henrik-me/agent-harness/pull/216)** (new `harness cross-repo open-issue` CLI subcommand with realpath-based `--body-file` cwd-containment; LRN-138). The new CLI subcommand (CS56) is the minor-bump trigger per [OPERATIONS.md § SemVer policy](OPERATIONS.md) ("New CLI subcommand added → Minor"); CS54/CS55 alone would have been a patch. v0.6.0 shipped (2026-05-27) — minor release packaging the v0.5.2-to-v0.6.0 review-doctrine arc: **CS48/[#142](https://github.com/henrik-me/agent-harness/issues/142)** (ban implementer self-review as review evidence; LRN-127 + Sub Invaders PR #28 regression), **CS49/[#139](https://github.com/henrik-me/agent-harness/issues/139)** (codify orchestrator availability + 15-minute progress/stall reporting + Workboard-first status for out-of-CS work; LRN-126), **CS50/[#138](https://github.com/henrik-me/agent-harness/issues/138)** (optional `WORKBOARD_MERGE_TOKEN` PAT admin-bypass fallback for validated workboard-only PRs without the G3 App), **CS51/[#140](https://github.com/henrik-me/agent-harness/issues/140)** (PR-side enforcement gates: `review-log-evidence`, `copilot-review-attached`, `independence-invariant`, `review-threads-resolved`), **CS52/[#141](https://github.com/henrik-me/agent-harness/issues/141)** (`harness review <pr>` CLI as the canonical content-PR review orchestrator), the **CS47 plan-filing** doc (`planned_cs47_detached-head-investigation.md` for the v0.5.1 detached-HEAD trap; CS47 fix itself ships post-v0.6.0), and **one consumer-visible default flip**: `scripts/check-review-evidence.mjs` `--strict-agent-columns` is now the **default** behavior (CS53 C53-5; fulfills the v0.5.0-era CS42 C42-6 promise) — missing `Implementer agent` / `Reviewer agent` rows in `## Model audit` become errors rather than warnings. Pass the new `--no-strict-agent-columns` flag to opt out for transitional consumers. v0.5.2 (2026-05-14) shipped the post-v0.5.1 accumulated work: **CS46/[#146](https://github.com/henrik-me/agent-harness/issues/146)** discoverability (canonical workboard empty-state + verbatim Plan-vs-impl review labels + self-documenting linter hints), **CS45** typed-error fs envelope around `lib/copilot-engage.mjs` cache-write seam (new exit code `5` + `--cache-dir` escape hatch), **CS44** Copilot Bot doc-impl alignment, **CS43** clickstop-implementer-not-reviewer linter recursion + date-gated grandfathering, **CS23** `pull_request: types: [edited]` so `gh pr edit --body` re-fires `pr-body`. v0.5.0 (CS42, 2026-05-14) shipped the v0.5.0 arc (CS40/CS41/CS42): `harness copilot-engage <pr-number>` CLI, the `clickstop-implementer-not-reviewer` linter, first-class `Implementer agent` + `Reviewer agent` columns in `## Model audit`, `harness review-output` reviewer-output validator, and two default flips (`review_gates.enabled: true` on fresh init; `--strict` default for `check-clickstop-plan-review.mjs`). v0.4.0 (CS39, 2026-05-13) shipped the #145 enforcement-doctrine arc (CS35–CS38b: `harness pr-evidence` PR-time gates B1+A3+A4+A5+A6+A16, canonical PR template skeleton + sync migration, `pr-evidence-lint.yml` pre-merge enforcement). See [`CHANGELOG.md`](CHANGELOG.md) for the full delta and [`project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md`](project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md) for the roadmap.

## What this is

A shippable kit for running coordinated, multi-agent work on a software project:

- **Process docs** — INSTRUCTIONS, CONVENTIONS, OPERATIONS, REVIEWS, TRACKING, RETROSPECTIVES — that define how orchestrators and sub-agents claim, dispatch, review, and close clickstops (CSs).
- **Structured-doc linters** — one per doc — that turn the process into mechanical enforcement.
- **Scaffolds** — opt-in starting points for smoke tests, migrations, container validation, health checks, seeders, deploy verification, feature flags, and one-shot CS probes.
- **Reusable GitHub workflow** so a consumer wires up the whole thing in ~10 lines.

Three file classes:

- **managed** — overwritten on every `harness sync`; the source of truth.
- **composed** — managed core + marker-preserved local blocks for project-specific extensions.
- **seeded** — created if missing, never overwritten.

## Installation

Three install models are supported:

**Option A — clone and run directly** (recommended for CI and for previewing upgrades): clone the harness and invoke its CLI with Node —

```bash
git clone https://github.com/henrik-me/agent-harness.git
node agent-harness/bin/harness.mjs <command>
```

This avoids the npm `GitFetcher` regression noted below and is the pattern the harness's own reusable workflow uses (clone-then-`node bin/harness.mjs`). Pin the harness version in `harness.config.json` `version` for reproducibility, and use `harness upgrade <ref>` (see [§ Upgrading](#upgrading)) to preview a bump before applying it.

**Option B — install from GitHub by ref** (today, default `npx` path): `npx -y github:henrik-me/agent-harness#<ref>` works anonymously now that the repo is public — no token required. `<ref>` is a semver tag (e.g. `v0.17.0`), branch name, or 40-character commit SHA. Recommend pinning to a semver tag in `harness.config.json` `version` for reproducibility. (For private forks of this harness, see [`docs/private-consumption.md`](docs/private-consumption.md) for the `GITHUB_TOKEN` setup.)

> **Note:** as of v0.2.0 the bare `npx -y "github:owner/repo#<sha>"` install path hits an npm 10.8.x/10.9.x `GitFetcher requires an Arborist constructor` regression on GitHub Actions runners. The harness's own reusable workflow (`harness-checks.yml`) bypasses this by cloning + invoking `node bin/harness.mjs` directly. External consumers running their own CI may want to do the same. Tracked as a known issue. (Still applies under v0.17.0 — same npm CLI versions on the runners.)

**Option C — install from npm by version** (planned for CS15+ post-public-flip; not active today): `npx -y @henrik-me/agent-harness@<version>` will work once the package is published. The `name` field in `package.json` already reserves the npm scope; the package is currently `private: true`. Same pinning advice via `harness.config.json` `version`.

## Quickstart

```bash
# In a consumer repo:
npx -y github:henrik-me/agent-harness#v0.17.0 init
# review the generated harness.config.json, then:
npx -y github:henrik-me/agent-harness#v0.17.0 sync
```

## Upgrading

`harness upgrade <ref>` **previews** upgrading the pinned harness to `<ref>` (a
semver tag, branch, or 40-char SHA): it fetches that ref's templates and runs a
**dry-run** sync against your repo, printing the list of files that would change
(per-file action + class) plus a change-count summary. **Nothing is applied** — it
is a safe, read-only preview (additive over `sync`; no apply-path rewrite). To
apply after reviewing, set `harness.config.json` `version` to `<ref>` and run
`harness sync --mode=apply` (add `--accept-major` for a major bump). See
[OPERATIONS.md § Sync](OPERATIONS.md) for the full preview-then-apply flow.

```bash
node agent-harness/bin/harness.mjs upgrade v0.17.0   # preview only
# review the change list, then bump harness.config.json "version" to v0.17.0 and:
node agent-harness/bin/harness.mjs sync --mode=apply
```

## Repo layout

```
.
├── bin/                 # harness CLI dispatcher (CS04)
├── lib/                 # sync engine, composed parser, templating, lock-file (CS03–CS05)
├── template/
│   ├── managed/         # process truth — synced into consumers, overwrite-on-sync
│   ├── composed/        # managed core + local-block extensions
│   └── seeded/          # create-if-missing skeletons
├── scripts/             # structured-doc linters + policy checks (CS05–CS07)
├── scaffolds/           # opt-in copy-and-customize patterns (CS10)
├── schemas/             # JSON Schema for config, lock file, per-doc shapes
├── .github/workflows/   # CI + reusable workflow for consumers (CS12)
└── project/clickstops/  # the harness's own CS lifecycle (planned / active / done)
```

The repo IS the persistent memory between sessions. There is no other state.
Per-path purpose:

| Path | Purpose |
|---|---|
| `INSTRUCTIONS.md` | Orchestrator workflow — bootstrap reading order, Session Start checklist (incl. sanity-check commands), Per-CS Loop, "When to Add X" recipes |
| `OPERATIONS.md` | Lifecycle procedures — Claim / Dispatch / Sync / Harvest / SemVer / Conventions; canonical sub-agent briefing preamble |
| `CONTEXT.md` | Current state, recently completed CSs with commit refs, active CS pointer, blockers, parallelism posture |
| `WORKBOARD.md` | Live coordination only — Orchestrators table + Active Work table. Nothing else. The queue lives in `project/clickstops/planned/` and history in `project/clickstops/done/`; WORKBOARD never duplicates either. |
| `LEARNINGS.md` | Process learnings (LRN-001..N), schema-validated, sectioned by status |
| `ARCHITECTURE.md` | Architecture overview — Components, Data model, Decision log |
| `REVIEWS.md` | Independent-reviewer model, taxonomy, HIGH-RISK CS list, GPT-5.6 Sol fallback rules |
| `template/managed/` | Process truth — files synced verbatim into consumer repos; overwrite-on-sync |
| `template/composed/` | Managed-core docs that consumers can extend via local blocks; recomposed on sync |
| `template/seeded/` | Create-if-missing skeletons; seeded once into consumers and never overwritten |
| `project/clickstops/active/` | Currently in-flight CS spec (one file when active, empty when stable) |
| `project/clickstops/planned/` | Queued CSs in priority order (`planned_cs<NN>_<short-name>.md`) |
| `project/clickstops/done/` | Completed CS files with full actuals (sub-agent ledger, review log, learnings filed, follow-up planned CSs) |

## Starting an agent session

> **One-time setup (per fresh clone):** install dev dependencies before your
> first session — **Node ≥ 20**, then `npm ci` at the repo root (`node_modules`
> is gitignored and per-checkout). See [CONTRIBUTING.md](CONTRIBUTING.md) for
> detail. Skipping this makes the Session Start bootstrap check fail with
> `ERR_MODULE_NOT_FOUND` — `main` is not broken.

Open a fresh Copilot CLI (or equivalent) at the repo root and use a starter
prompt like:

```
cd <repo>, then read INSTRUCTIONS.md carefully and follow the Quick Reference
Checklist (especially the Session Start bootstrap sanity check). After that,
continue from where the prior session left off (check CONTEXT.md and
WORKBOARD.md for the current state). Operate autonomously from the current
repo state. Check in only for substantive design decisions not derivable from
the cs-plan + LRNs, or for changes that would materially alter the public
repo/security posture.
```

That's all you need to type. `INSTRUCTIONS.md` pulls in everything else in
the right order via its Pointers section.

## How this repo governs itself

This repo follows the harness from CS01. Bootstrap proto docs (INSTRUCTIONS, CONVENTIONS, OPERATIONS, REVIEWS, TRACKING, RETROSPECTIVES) are hand-authored; from CS11 onward they are produced by `harness sync` against the canonical `template/managed/` + `template/composed/` (with local blocks preserved) and a CI gate prevents drift. Seeded project-state docs (CONTEXT, ARCHITECTURE, LEARNINGS, WORKBOARD) are preserved as-is. Project-owned files (this README, LICENSE, package.json, .gitignore, .editorconfig) are excluded from sync entirely. See [INSTRUCTIONS.md](INSTRUCTIONS.md) and [`project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md`](project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md).

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design: file-class model (managed / composed / seeded), sync engine internals, lock-file format, and the linter pipeline.

## Status

See [CONTEXT.md](CONTEXT.md) for current project state, the active clickstop, and known blockers.

## CLI quick reference (cross-repo)

When harness orchestration needs work in a non-harness repository (e.g. `henrik-me/sub-invaders`), Hard Rule § 6 (see `template/managed/.github/copilot-instructions.md`) requires filing a GitHub issue rather than opening a PR. The `harness cross-repo open-issue` command is the supported way to do this.

```bash
node bin/harness.mjs cross-repo open-issue \
  --repo henrik-me/sub-invaders \
  --title "[harness:cs55] Adopt v0.6.x cross-repo handoff doctrine" \
  --body-file issue-body.md \
  --label harness-sync
```

Notes:

- The `harness-orchestrator` label is always added automatically; additional `--label` flags append.
- Titles MUST be prefixed with `[harness:cs<NN>]` so two different clickstops cannot collide on the same handoff issue (idempotency safety per D56-4).
- There is intentionally NO `harness cross-repo open-pr` command — the harness orchestrator never opens PRs in non-harness repos.
- The command refuses `--repo henrik-me/agent-harness` (use plain `gh` for harness-internal issues).

## License

MIT — see [LICENSE](LICENSE).
