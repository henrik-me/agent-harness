# Agent Harness — CS Plan (rev. 2, post-GPT-5.5 review)

Spinning the agent harness out of `henrik-me/guesswhatisnext` into its own repo, with a second consumer (`henrik-me/sub-invaders`) battle-testing it before guesswhatisnext migrates onto it.

**Distribution model:** start private, switch to public after we've self-hosted (CS11) and used it on the harness repo for several dev CSs (CS12–CS14). Stay on `npx -y github:henrik-me/agent-harness#vX.Y.Z` (Option B) indefinitely; npm publication is an optional, deferred decision in the final CS.

**Self-leverage:** the harness repo follows its own process from CS01 (hand-authored proto docs, manual discipline) and is fully self-hosted from CS11 onward (CI gate prevents drift between `template/managed/` and root files).

**Sub-agent parallelism:** every CS lists internally-parallelisable sub-tasks; the orchestrator fans those out to sub-agents.

> This revision incorporates GPT-5.5 rubber-duck findings: composed file class for "managed core + local extension" docs, README ownership split, machine-readable PILOT parity manifest, full-history secret scan + license/IP review before public flip, CS17 split into Sub Invaders battle-test + shadow-migration, CS18 split into design-prep + freshness-bound execution, hot-fix stability counter, SemVer-on-process-docs concretised, reusable-workflow version-pinning linter, lock-file schema in CS02, permissions prerequisites, full PR-policy hardening before public flip.

---

## Decisions locked in

| # | Decision | Choice |
|---|---|---|
| 1 | Repo license | MIT |
| 2 | Distribution while private | `npx -y github:henrik-me/agent-harness#vX.Y.Z` (works on private repos via PAT/GitHub App token in consumer CI) |
| 3 | Repo visibility | **Private at CS01, hardened at CS15a, flip to public at CS15b** after self-hosting is proven through CS11–CS14 dev cycles AND full-history secret scan AND PR policy hardening complete |
| 4 | npm publication | Deferred; revisited as a decision in CS20. Stay on git-ref unless a concrete reason emerges. |
| 5 | First non-guesswhatisnext consumer | Sub Invaders (sea-themed Space Invaders) |
| 6 | Sub Invaders persistence v1 | Azure Storage Tables (followed by re-eval CS for Upstash Redis / Cloudflare KV) |
| 7 | Sub Invaders deployment v1 | Azure Static Web Apps (followed by re-eval CS for Cloudflare Pages + Workers full stack) |
| 8 | Sub Invaders frontend | Pure TypeScript via `tsc` only, HTML5 Canvas, ES modules, zero runtime deps, PWA service worker for offline |
| 9 | Sub Invaders backend | Single Azure Function (Node 20) inside the SWA project: `POST /score`, `GET /leaderboard?period=daily\|all`, with rate-limit + replay protection (no sign-in v1) |
| 10 | Harvest cadence | Weekly orchestrator-triggered + bounded before-claim user prompt (only stale `process`/`architectural` learnings or claim-area-relevant learnings; supports `deferred_until`; auto-escalates repeatedly-deferred items to weekly only) |
| 11 | Migration safety net | PILOT-A baseline (CS18b) executed under existing in-repo harness; PILOT-B parity (CS19/PR-2) executed under migrated harness; gates compared via machine-readable parity manifest |
| 12 | PILOT-A candidate | Picked during CS18a |
| 13 | File classes | **Three classes**: `managed` (overwrite on sync), `composed` (managed core + marker-preserved local blocks), `seeded` (create-if-missing, never overwrite) |
| 14 | Implementation model | Claude Opus 4.7 1M (orchestrator), Haiku for parallelisable mechanical sub-tasks, Sonnet for non-trivial sub-tasks |
| 15 | Local review model | GPT-5.5 rubber-duck on every CS implementation before opening PR; on every plan/template revision before commit |
| 16 | PR review (private phase, CS01–CS14) | GPT-5.5 rubber-duck + user review; Copilot review optional |
| 17 | PR review (public phase, CS15b+) | GPT-5.5 rubber-duck + Copilot review + user review on CODEOWNERS-protected paths |
| 18 | Signed commits on `main` | Off until CS15b; on from CS15b |
| 19 | Branch naming | `cs<NN>/<slug>` mirroring guesswhatisnext |
| 20 | Agent ID schema (per guesswhatisnext TRACKING.md § Agent Identification, generalised) | Format: `<machine-short>-<repo-short>[-c<N>]`. **machine-short:** lowercase first meaningful hostname segment (`HENRIKM-YOGA` → `yoga`). **repo-short:** project-defined in `harness.config.json` → `project.agent_suffix`. **-c\<N\>:** derived from clone folder: `<repo>_copilot<N>` → `-c<N>`; `<repo><N>` (bare numeric distinguisher) → `-c<N>`; otherwise omitted. Override env var name: see Decision #20c. |
| 20a | Harness repo `agent_suffix` | `ah` (so my session becomes `yoga-ah`) |
| 20b | Sub Invaders `agent_suffix` | `si` |
| 20c | Override env var pattern (revised per GPT-5.5 #6) | **`HARNESS_AGENT_<SUFFIX_UPPER>_MACHINE`** (e.g. `HARNESS_AGENT_AH_MACHINE`, `HARNESS_AGENT_SI_MACHINE`). Harness-namespaced to avoid collisions; `project.agent_env_var` overrides default. `harness whoami --explain` prints derivation chain. |
| 22 | GPT-5.5 outage fallback (per GPT-5.5 #7, revised per re-review #5 + 4th-pass #6) | Primary: GPT-5.5 rubber-duck. If unavailable >30min or 2 failed attempts: fallback to **Claude Sonnet 4.6** rubber-duck (different model family/configuration than Opus 4.7 implementer) OR explicit user waiver. **Independence invariant:** fallback reviewer must be a model/configuration **not used to materially implement the reviewed CS**. If Sonnet 4.6 performed non-trivial implementation sub-tasks within the CS being reviewed, fallback to Sonnet for that CS is forbidden — escalate to GPT-5.5 or user waiver. High-risk CSs (CS03, CS11, CS15a/b, CS18b, CS19) require GPT-5.5 OR explicit user waiver — no Sonnet fallback regardless. PR body records: model, timestamp, fallback reason, implementer-model-list-for-CS. |
| 23 | WORKBOARD claim mechanism (per GPT-5.5 #9, revised per re-review #2) | **Tiny PRs auto-merged via dedicated GitHub Action** for claim/closeout WORKBOARD updates. No direct-push-to-main exception. Mechanism: PR is labeled `workboard-only`; a dedicated workflow (`workboard-auto-approve.yml`) verifies (a) only `WORKBOARD.md` and clickstop rename paths changed, (b) label present, (c) author is in approved-actors list, then a GitHub App / bot submits the approval and triggers auto-merge. Global "Require ≥1 approving review" stays in place; the bot's review satisfies it. CI must still pass. **No Ruleset label-bypass assumed** — all gating is via the workflow + bot approval mechanism, which is mechanically valid on GitHub today. CS15a dry-run validates this end-to-end before becoming required. |
| 24 | Public-artifact redaction (per GPT-5.5 #5, revised per re-review #10) | All post-CS15b archived artifacts (shadow reports, pilot JSONs, manifests) sanitized before commit. Raw artifacts stay in source-repo private CI; only normalized gate results commit publicly. `check-public-artifact.mjs` linter (CS06) enforces. **`public_artifact_redaction` config (CS02)** declares per-artifact-type: (a) `allowed_placeholders` — explicit safe values (`https://example.com`, `00000000-0000-0000-0000-000000000000`, `ghp_FAKE_*`); (b) `forbidden_field_patterns` — regex denylist (tokens, tenant IDs, internal URL patterns); (c) `max_log_bytes_per_artifact` — bounded inclusion of log content (default 8 KB) instead of vague "no logs"; (d) `required_normalized_fields` — must be present in pilot/shadow JSON; (e) `raw_artifact_paths_forbidden` — regex denylist for artifact paths that must never commit publicly. Reduces false-positive rate; gives a concrete contract. |
| 21 | Hot-fix policy during battle-test | Hot-fixes allowed; reset stability counter and require ≥1 clean Sub Invaders CS post-fix before tagging next harness version |

---

## Prerequisites checklist (do once, before CS01)

- [ ] GitHub permission to create private repos under `henrik-me`
- [ ] GitHub permission to flip repo visibility to public (verified before CS15, but confirm now)
- [ ] GitHub permission to configure branch protection rules and required status checks
- [ ] GitHub Actions enabled at the org level for `henrik-me`
- [ ] Ability to create GitHub Releases and tags
- [ ] Ability to manage repo secrets and Dependabot
- [ ] Azure subscription accessible for Sub Invaders (CS16) — confirm before CS16 not CS01
- [ ] (Optional, CS20) `@henrik-me` npm scope availability and publish rights

---

## Phase A — Bootstrap (manual process discipline; "spirit of guesswhatisnext")

### CS01 · Create `agent-harness` repo + skeleton + bootstrap process docs
**Goal:** Stand up the repo with the directory layout from our design and **hand-authored proto** versions of the process docs so the repo follows its own process from commit 1.
**Deliverables:**
- `henrik-me/agent-harness` private repo on GitHub
- Layout: `bin/`, `lib/`, `template/{managed,seeded}/`, `scripts/`, `scaffolds/`, `schemas/`, `.github/workflows/`
- `package.json` (private:true initially), MIT `LICENSE`, `.gitignore`, `.editorconfig`
- Hand-authored `INSTRUCTIONS.md`, `CONVENTIONS.md`, `OPERATIONS.md`, `REVIEWS.md`, `TRACKING.md`, `RETROSPECTIVES.md`, `CONTEXT.md`, `WORKBOARD.md`, `LEARNINGS.md`, `ARCHITECTURE.md`, `README.md` (project-owned, never synced), `.github/copilot-instructions.md`, `.github/pull_request_template.md`, `.github/CODEOWNERS`
- `project/clickstops/{planned,active,done}/.gitkeep`
- The two pre-CS01 planning artifacts (`harness-extraction-plan.md`, `harness-cs-plan.md`) moved into `project/clickstops/done/done_cs01_bootstrap-repo.md` (or referenced from it)
- Branch protection on `main`: **deferred to CS15b** per [LRN-001](../../../LEARNINGS.md). Requires GitHub Pro on private repos; user chose discipline-only enforcement for CS01–CS14.
**Exit:** Empty `WORKBOARD.md` initialised with orchestrator table; CS01 itself filed under `project/clickstops/done/` to demonstrate the lifecycle.
**Parallelisable:** No (foundational; process discipline starts mid-CS01 once branch protection is on).
**Depends on:** prerequisites checklist

### CS02 · Define schemas (config + lock + learning) + parameterization model + file classes
**Goal:** Pin down all contracts before any code.
**Deliverables:**
- `schemas/harness.config.schema.json` (Draft-2020-12). Keys: `version` (pinned harness ref), `project` (`name`, `cs_prefix`, `repo`, **`agent_suffix`** — used in agent-ID derivation per Decision #20, **`agent_env_var`** — defaults to `HARNESS_AGENT_<SUFFIX_UPPER>_MACHINE` per Decision #20c), `managed`, `composed`, `seeded` (file-class allowlists with per-file overrides), `scaffolds` (opt-in list), `linters` (enable/disable + per-linter config), `templating` (substitution variables), `local_blocks` (per-file allowed block IDs), **`composed_block_migrations`** (per GPT-5.5 #12 — schema-only in v0.1.0; sync fails with clear "block ID renamed/split needs migration spec" message), **`public_artifact_redaction`** (per Decision #24 — per-artifact-type field allowlists/blocklists)
- `schemas/harness-lock.schema.json` for `.harness-lock.json`. Required fields: `harness_ref`, `resolved_sha`, `config_schema_version`, `synced_at` (informational only — not used in drift comparisons), `files[]` (each: `target`, `source_template`, `class`, `rendered_hash`, `action`, **for composed files** `blocks[]` per GPT-5.5 #13: `id`, `source_line_range`, `body_hash`, `template_marker_hash`, `provenance` (`user-authored` / `seeded-empty` / `migrated-from-legacy`)), `scaffolds[]` (with versions), `excluded[]` (project-owned files explicitly skipped)
- `schemas/learning.schema.json` for per-entry frontmatter
- ADR documenting the **three file classes**: `managed` (overwrite), `composed` (managed core + marker-preserved local blocks by ID, e.g. `<!-- harness:local-start id=conventions.project -->...<!-- harness:local-end id=conventions.project -->`), `seeded` (create-if-missing)
- ADR documenting README ownership split: harness repo's root `README.md` is project-owned and excluded from sync; `template/seeded/README.md` is the consumer skeleton
- Worked examples: `harness.config.json` for guesswhatisnext + sub-invaders + the harness repo itself
**Exit:** Schemas validate three example configs; both ADRs merged.
**Parallelisable:** 4 schemas + 2 ADRs + 3 examples → 9 sub-tasks.
**Depends on:** CS01

---

## Phase B — Engine

### CS03 · Sync engine library (`lib/sync.mjs`)
**Goal:** Pure-Node copy-with-templating engine that respects all three file classes and writes a `.harness-lock.json`.
**Deliverables:**
- `lib/sync.mjs` — orchestrates classes
- `lib/templating.mjs` — `{{project_name}}`-style substitution
- `lib/lock.mjs` — read/write `.harness-lock.json` per schema
- `lib/composed.mjs` — **composed-class merge** with hardened parser (per GPT-5.5 #1):
  - Markers recognized only when: occupy whole line except whitespace; outside fenced code blocks (` ``` ` and `~~~`); outside indented code blocks (4+ spaces); `id` matches strict regex `[a-z][a-z0-9.-]*`; start/end IDs match exactly
  - Fails on: dropped/duplicated/unclosed blocks; nested local blocks; marker-looking text inside code fences (rejected unless escaped)
  - Records each block's body hash + template-marker hash in lock file per GPT-5.5 #13
- Modes: `apply` (write files), `check` (exit non-zero on drift; ignores `synced_at`), `dry-run` (print diff with classification per file)
- **Sync invariant (per GPT-5.5 re-review #8):** for any composed target, `harness sync` refuses to overwrite if the target contains non-template, non-block content unless `legacy_composed_mapping.json` explicitly maps each unmarked region to a block ID OR explicitly discards it. This is a **sync-engine guarantee**, not just a separate audit — exit non-zero, no partial write. Fixtures: composed target with legacy unmarked content + no mapping → exit non-zero; mapping to block → content preserved with provenance `migrated-from-legacy`; explicit discard → omitted, recorded in lock; unmapped content → impossible to apply.
- Unit tests via `node --test`. Zero runtime deps.
- Fixtures covering each class + each parser edge case: marker-inside-fenced-code, marker-inside-indented-code, marker-in-prose-comment, duplicate-marker-in-example, nested local blocks, block-dropped, block-ID-renamed, template-reordered-around-blocks
**Exit:** Tests pass; `sync --check` against fixtures behaves correctly.
**Parallelisable:** sync.mjs / templating.mjs / lock.mjs / composed.mjs / fixtures → 5 sub-tasks.
**Depends on:** CS02

### CS04 · CLI dispatcher (`bin/harness.mjs`)
**Goal:** Single entry point with subcommands.
**Deliverables:** `harness <init|sync|check|lint|harvest|check-migration|composed-audit|pack|version|whoami>` with `--cwd`, `--config`, `--dry-run`, `--report`, `--ref`, `--accept-major`, `--explain` flags.
- `whoami [--explain]` derives the agent ID per Decision #20: reads hostname → machine-short, reads cwd folder → applies `_copilot<N>` / bare-numeric-distinguisher rules → repo-short from `project.agent_suffix` in config → applies `HARNESS_AGENT_<SUFFIX_UPPER>_MACHINE` override (or `project.agent_env_var` if customised). `--explain` prints each derivation source: hostname, cwd, env-var-name, env-var-value-if-set, config-suffix, final-ID. Used by `harness sync` and `harness harvest` to identify the calling agent in WORKBOARD updates and learnings frontmatter.
- **`composed-audit --from-existing-harness`** (per GPT-5.5 #2): for each composed target in the consumer repo, detects legacy unmarked sections, proposes block-ID mapping, lists unmapped content, emits `composed-migration-manifest.json` + before/after diff. Exits non-zero if unmapped content would be lost. Required CS19/PR-1 attachment.
- `init` scaffolds `harness.config.json` + seeded files into a target
- `sync --dry-run --report` emits a structured migration report classifying every file (overwrite / preserve / skip / conflict / project-owned)
- `check-migration --from-existing-harness` audits an existing repo against the harness templates and emits a duplicate-script + workflow-ref + config-override report (used in CS19 PR-1)
- `harvest` runs the full harvest procedure AND a **bounded before-claim check**: only stale `open` learnings tagged `process`/`architectural` *or* tagged with the claim-area metadata trigger a prompt; `--snooze=<reason>:<deferred_until>` accepted; repeated defers auto-escalate the learning to weekly-harvest-only
- `--accept-major` required to sync across a major version bump; CLI warns if syncing while a CS is `active` in WORKBOARD
- `pack` runs `npm pack --dry-run` and verifies the file whitelist
- Helpful `--help` per subcommand. Exit codes documented in OPERATIONS.md.
**Exit:** `npx . init` works against an empty dir; `npx . sync --check` works in this repo (will fail until CS11); `--accept-major` and dry-run-report verified end-to-end.
**Parallelisable:** One sub-task per subcommand → 8 sub-tasks.
**Depends on:** CS03

### CS05 · Doc-schema lib + first reference linter
**Goal:** Establish the linter pattern with one fully-implemented example.
**Deliverables:** `lib/doc-schema.mjs` (frontmatter parser, heading-tree assertion, table-shape assertion, link resolver). `scripts/check-learnings.mjs` validating: required headings, per-entry frontmatter (`id: LRN-NNN`, `category`, `status`, `source_cs`, `date`, `tags[]`, `claim_area?`, `deferred_until?`), allowed status values (`open`/`applied`/`obsolete`/`deferred`), disposition required for `applied`/`obsolete`, age-out warning for stale `open` entries, escalation flag for repeatedly-deferred entries.
**Exit:** Linter passes against the bootstrap LEARNINGS.md (which will be authored to satisfy it).
**Parallelisable:** doc-schema.mjs / check-learnings.mjs / fixtures → 3 sub-tasks.
**Depends on:** CS04

### CS06 · Remaining structural linters
**Goal:** One linter per structured doc, all built on `doc-schema.mjs`.
**Deliverables:**
- `check-context.mjs`, `check-workboard.mjs`, `check-architecture.mjs`, `check-clickstop.mjs`, `check-instructions.mjs` (cross-link integrity + dead-section detection), `check-readme.mjs` (enforces READMEGUIDE from CS08), `check-composed-blocks.mjs` (audits composed-class files for required block IDs present, no duplicates, no orphan IDs, no markers inside code fences per GPT-5.5 #1)
- **`check-workflow-pins.mjs`** (per GPT-5.5 #10): scans `.github/workflows/*.yml` for `henrik-me/agent-harness/...@ref` references and asserts every ref matches `harness.config.json` `version`. Prevents local/CI rule drift.
- **`check-public-artifact.mjs`** (per GPT-5.5 #5): scans archived shadow/pilot/migration artifacts for forbidden fields (tokens, tenant/subscription IDs, internal URLs, full logs, unredacted telemetry identifiers). Driven by `public_artifact_redaction` config. Mandatory check from CS15a onward.
- Each linter ≤ ~80 LOC with fixtures
**Exit:** All linters pass against this repo's hand-authored docs; failure modes documented.
**Parallelisable:** 9 linters → 9 sub-tasks.
**Depends on:** CS05

### CS07 · Generic policy linters
**Goal:** Port the truly-generic checks from guesswhatisnext.
**Deliverables:** `check-pr-body.mjs`, `check-commit-trailers.mjs`, `check-compose-v2.mjs`, `render-deploy-summary.mjs` — refactored to ESM, config-driven (no hard-coded project assumptions), tested against fixtures.
**Exit:** Each linter has fixture tests and is wired into `harness lint`.
**Parallelisable:** 4 ports → 4 sub-tasks. **Can run in parallel with CS05 + CS06.**
**Depends on:** CS04

---

## Phase C — Authored canonical content

### CS08 · Author managed/composed process docs (the source-of-truth set)
**Goal:** Write the canonical INSTRUCTIONS / CONVENTIONS / OPERATIONS / REVIEWS / TRACKING / RETROSPECTIVES / READMEGUIDE as templates. **Classify each file correctly** (per the file-class ADR from CS02).
**Deliverables:**
- `template/managed/INSTRUCTIONS.md` — quick-reference checklist + "When to add X" decision tree pointing at scaffolds + harvest cadence (weekly + bounded before-claim)
- `template/composed/CONVENTIONS.md` — language-agnostic core (managed) + local block `id=conventions.project` for project-specific language/framework conventions
- `template/composed/OPERATIONS.md` — claim/dispatch/handoff/sync/harvest core (managed) + local block `id=operations.project-deploy` for project-specific deploy commands. **WORKBOARD-claim mechanism (per Decision #23):** documents the tiny-PR + auto-approve-bot pattern — `workboard-only` label, dedicated `workboard-auto-approve.yml` workflow verifies path-restriction + label + actor-allowlist, GitHub App / bot submits approval and auto-merges, global review-required stays in force. Replaces guesswhatisnext's direct-push exception.
- `template/composed/REVIEWS.md` — review loop core (managed) + local block `id=reviews.project-gates` for project-specific review gates. Documents GPT-5.5 fallback policy (Decision #22).
- `template/managed/TRACKING.md` — clickstop lifecycle, workboard state machine, **§ Agent Identification** parameterised on `project.agent_suffix` (format `<machine-short>-<repo-short>[-c<N>]`, override via `HARNESS_AGENT_<SUFFIX_UPPER>_MACHINE` env var per Decision #20c — or whatever `project.agent_env_var` is set to — derivation rules per Decision #20)
- `template/managed/RETROSPECTIVES.md` — precise definition of "learning", category taxonomy (`architectural`/`operational`/`tooling`/`process`/`anti-pattern`), harvest procedure, disposition states, both cadences with bounded prompt rules
- `template/managed/READMEGUIDE.md` — harness's opinion on consumer READMEs (one-liner, status badges, quickstart, harness pointer, contributing pointer, license, screenshot/demo if applicable, links to ARCHITECTURE.md and CONTEXT.md) — enforced by `check-readme.mjs`
- `template/managed/.github/copilot-instructions.md`, `pull_request_template.md`, `CODEOWNERS` template
- **SemVer policy section in OPERATIONS.md** (per GPT-5.5 #9):
  - **Major:** removes/renames required files/headings/states; changes clickstop lifecycle; changes required gates; changes local-block IDs incompatibly; changes config schema incompatibly
  - **Minor:** adds optional scaffold/linter; adds non-blocking recommendations; adds new managed section with default-compatible behavior
  - **Patch:** typo, clarification, bug fix, linter false-positive fix with no new required behavior
  - **Update guidance:** harness updates happen in their own PR/CS; do not run `harness sync` mid-clickstop unless fixing a harness blocker; CLI warns on mid-CS or major sync
**Exit:** All `check-*` linters pass against these templates.
**Parallelisable:** 7 docs + SemVer section → 8 sub-tasks; merge step at end for cross-link integrity.
**Depends on:** CS06

### CS09 · Author seeded skeletons (the create-if-missing set)
**Goal:** Empty/structural templates a consumer fills in.
**Deliverables:**
- `template/seeded/CONTEXT.md` — required H2s: Codebase State, Architecture pointer, Blockers, Last updated
- `template/seeded/ARCHITECTURE.md` — Overview + mermaid placeholder, Components, Data model, External integrations, Cross-cutting concerns, Decision log, Known constraints
- `template/seeded/LEARNINGS.md` — header + harvest pointer + empty entry slot conforming to schema
- `template/seeded/WORKBOARD.md` — orchestrator table + active-work table headers
- **`template/seeded/README.md`** — consumer skeleton conforming to READMEGUIDE
- `template/seeded/project/clickstops/{planned,active,done}/.gitkeep`
- `template/seeded/harness.config.json` example
- **Fixture test (per GPT-5.5 #1)**: a fresh `harness init` against an empty fixture directory must produce `README.md` from `template/seeded/README.md` (proves the seeded README path is exercised even though the harness repo's own root README is project-owned)
**Exit:** `harness init` against an empty repo produces a tree that passes all linters with zero edits; fixture test green.
**Parallelisable:** 5 skeletons + fixture test → 6 sub-tasks.
**Depends on:** CS08

### CS10 · Author scaffolds
**Goal:** Copy-and-customize starting points for opt-in patterns.
**Deliverables:** `scaffolds/{smoke,migrations,container-validate,health-check,seed,verify-deploy,feature-flags,cs-probes}/` — each with `README.md` (the pattern, contract, customization points, when to use), template files with `// TODO: customize` markers, optional shipped linter (e.g., `check-migration-policy.mjs`, `check-feature-flag-policy.mjs`) parameterised via `harness.config.json`.
**Exit:** `harness init --with-scaffold smoke` drops a working stub.
**Parallelisable:** 8 scaffolds → 8 sub-tasks.
**Depends on:** CS09

---

## Phase D — Self-hosting

### CS11 · Dogfood: harness governs itself
**Goal:** Replace the bootstrap docs from CS01 with `harness sync` outputs from `template/managed/` + `template/composed/` (preserving any local blocks) + `template/seeded/`. This repo becomes the first consumer.
**Deliverables:**
- `harness.config.json` at repo root pinning `version: self`, with **explicit exclusion of project-owned files** (root `README.md`, `LICENSE`, `package.json`)
- Run `harness sync` to overwrite root files from `template/managed/`; composed files merge any in-flight local blocks; seeded files left untouched
- Run `harness lint`, commit
- CI workflow `.github/workflows/harness-self-check.yml` runs `harness sync --check && harness lint && check-workflow-pins` on every PR — guarantees no drift between `template/managed|composed/` and root files
- **Reviewer checklist (per GPT-5.5 #6) attached to the CS11 PR:**
  - Managed files: root copies must match `template/managed/` byte-for-byte
  - Composed files: managed sections match template; local blocks unchanged
  - Seeded files: existing project state preserved
  - Project-owned files: README/LICENSE/package.json excluded from sync — verify still intact
- CS01 hand-authored bootstrap docs **archived** as a CS11 clickstop artifact under `project/clickstops/done/done_cs11_self-host/bootstrap-snapshot/`, not as live root docs
- Add `harness sync --dry-run --report` output as a CS11 PR-attached artifact for review
**Exit:** CI green; intentional drift becomes impossible without updating the template; bootstrap snapshot archived.
**Parallelisable:** No (single coordinated swap).
**Depends on:** CS10

---

## Phase E — Distribution + go-public

### CS12 · Reusable GitHub workflow + drift-detection template
**Goal:** Two reusable artifacts consumers can adopt with ~10 lines.
**Deliverables:**
- `.github/workflows/harness-checks.yml` (with `on: workflow_call`) running `harness lint` + selected `check-*` scripts
- The reusable workflow is **version-locked**: it invokes the consumer-pinned CLI version from `harness.config.json` rather than the workflow-ref version, so local and CI run the exact same rules (per GPT-5.5 #10)
- `template/managed/.github/workflows/harness-drift.yml` — scheduled weekly job in consumers that runs `harness sync --check` and opens a PR via `peter-evans/create-pull-request` if drift detected
- Documentation in OPERATIONS.md
**Exit:** Both workflows used by this repo's own CI; `check-workflow-pins` from CS06 verifies version coherence.
**Parallelisable:** Reusable workflow / drift workflow / docs → 3 sub-tasks.
**Depends on:** CS11

### CS13 · NPM packaging readiness
**Goal:** Make `npm publish` a future no-op trigger, even if we never ship to npm.
**Deliverables:** `package.json` with `"type": "module"`, `"bin": { "harness": "./bin/harness.mjs" }`, `"files"` whitelist (template/, scaffolds/, scripts/, schemas/, lib/, bin/, README.md, LICENSE), `engines.node >= 20`, zero runtime deps. `npm pack --dry-run` job in CI verifying tarball size + contents. Schema published with `$id` URL for editor autocomplete. README install/usage sections covering both `npx github:...` (Option B) and `npx @henrik-me/agent-harness` (Option C, future).
**Exit:** `npm pack --dry-run` reproducible; tarball ≤ target size; nothing extraneous.
**Parallelisable:** package.json / CI dry-run / README sections / schema $id → 4 sub-tasks.
**Depends on:** CS12

### CS14 · Release tooling + `v0.1.0` + private-consumption smoke test
**Goal:** Versioning discipline + verified private-distribution path before any consumer pins us.
**Deliverables:**
- Changesets (or release-please) configured; `CHANGELOG.md` automation
- `.github/workflows/release.yml` cutting GitHub Releases on tag
- SemVer policy already documented in OPERATIONS.md (CS08)
- Tag `v0.1.0`, draft GitHub Release
- **Private-consumption smoke test (per GPT-5.5 #11):** in a clean GitHub Actions runner using a fine-grained PAT scoped to `contents:read` on the harness repo, run `npx -y github:henrik-me/agent-harness#v0.1.0 --help`. Document exact token scopes required while private. Fixture token in any examples uses obvious placeholder (`ghp_FAKE_DO_NOT_USE`).
**Exit:** Tag exists; private smoke test green; consumers (when they appear) can do `npx -y github:henrik-me/agent-harness#v0.1.0 init`.
**Parallelisable:** Release tooling / workflow / smoke test → 3 sub-tasks.
**Depends on:** CS13

### CS15a · Public-readiness hardening (per GPT-5.5 #8 split) **[GUARDRAIL]**
**Goal:** Stand up everything needed for a public repo — branch protection, CODEOWNERS, public-facing files, secret/IP review — while still private. Does NOT flip visibility.

**Pre-conditions checklist:**

*Process health:*
1. CS11 self-host CI gate has been green for ≥ all of CS12–CS14
2. `harness sync --check` runs in < 5s; `harness lint` runs in < 10s
3. `LEARNINGS.md` contains ≥ 3 `applied` learnings from CS12–CS14 demonstrating the harvest loop works
4. **All `open` learnings dispositioned** (status `applied` / `obsolete` / `deferred` with explicit `deferred-until`) — per [LRN-003](../../../LEARNINGS.md). Tightens prior wording (was: "no stale `open` learnings older than 14 days tagged `process` or `architectural`"). Zero `open` learnings of any age before CS15b proceeds.
5. Hot-fix stability counter (per GPT-5.5 #16): ≥ 1 CS landed cleanly with no harness changes during execution

*Branch protection on `main` configured (still private):*
6. Require PR; **no direct pushes** (Decision #23 tiny-PR + auto-approve-bot model replaces guesswhatisnext's direct-push exception). Configure `workboard-auto-approve.yml` workflow + GitHub App / bot identity; bot submits approval on PRs that pass path-restriction + label + actor checks; global "Require ≥1 approving review" stays in place. **No Ruleset label-bypass assumed.** **Bot threat model (per re-review #3):** GitHub App with least privilege (PR-review/write only; no admin/workflow/secrets); bot is NOT a CODEOWNER for any non-WORKBOARD path; CODEOWNERS require human review for code/config/workflow paths so bot approval alone only works for verified WORKBOARD-only PRs; `workboard-auto-approve.yml` validates exact changed paths + actor allowlist + label + branch naming + absence of workflow/config changes before invoking bot credentials; App credentials stored only in protected/trusted context, never exposed to untrusted PR code.
7. Require ≥1 approving review; dismiss stale approvals on new commits
8. Require linear history (squash-merge only)
9. Require status checks to pass: `harness-self-check`, `harness-lint`, `secret-scan` (gitleaks), `npm-pack-dry-run`, `commit-trailers`, `pr-body`, `check-workflow-pins`, `check-public-artifact`
10. Require conversation resolution before merge
11. Require signed commits readiness verified (flips on at CS15b per Decision #18)
12. No force pushes, no deletions
13. Include administrators (no ad-hoc bypass)

*CODEOWNERS coverage:*
14. Every path in `template/managed/`, `template/composed/`, `schemas/`, `lib/sync.mjs`, `lib/composed.mjs`, `bin/harness.mjs`, `.github/workflows/` requires owner review

*Required public-facing files:*
15. `SECURITY.md` (vulnerability reporting policy + supported versions table)
16. `CONTRIBUTING.md` (public-facing contributor flow)
17. `CODE_OF_CONDUCT.md`
18. `.github/ISSUE_TEMPLATE/{bug,feature,learning}.yml`
19. `.github/pull_request_template.md` audited for public phrasing
20. Dependabot or Renovate config

*Repo settings:*
21. Squash-merge only; auto-delete head branches
22. Wikis disabled; Discussions opt-in
23. Vulnerability alerts + automated security fixes on
24. "Allow auto-merge" enabled (required for tiny-PR claim model)

*Secret hygiene + license/IP review (per GPT-5.5 #4 + #15):*
25. `gitleaks detect --source . --redact` over **full history** → zero findings
26. All extracted content from guesswhatisnext owned by you / MIT-compatible
27. No tenant IDs, internal URLs, internal operational details, or private repo URLs in any commit
28. All fixture tokens use obvious placeholders (`ghp_FAKE_DO_NOT_USE`)
29. Release artifacts and packed tarball reviewed for sensitive content
30. If anything sensitive found: rotate + history-rewrite **or** clean re-export to a fresh public repo

*Branch protection dry-run:*
31. Tiny-PR workboard-claim flow tested end-to-end (claim PR auto-merges; CI green; no review block)
32. All required status checks have appeared on at least one PR (proves they exist before being made required)

**Deliverables:** All 32 preconditions satisfied; repo ready to flip but **still private**; final `pre-flip-readiness.md` artifact summarizing scan results, CODEOWNERS coverage, ruleset config.
**Exit:** Pre-flip readiness signed off; CS15b can proceed.
**Parallelisable:** Process-health audit / branch-protection setup / public-facing files / repo settings / secret-scan + IP review / branch-protection dry-run → 6 sub-tasks.
**Depends on:** CS14

### CS15b · Visibility flip + post-flip verification **[GUARDRAIL]**
**Goal:** Freeze, do final pre-flip checks, flip public, verify, retrospect.
**Pre-conditions:** CS15a complete (all 32 items satisfied). Freeze: no other PRs land between CS15a sign-off and flip.
**Deliverables:**
1. **Final scans (immediately before flip):**
   - Re-run `gitleaks detect --source . --redact` over full history (catch anything since CS15a)
   - Re-run license/IP review on any commits since CS15a
   - Confirm no `harness-shadow/` branches or other private experimental branches remain
2. **Flip:** repo visibility → public via GitHub settings
3. **Signed commits flip on** (Decision #18) — branch protection updated to require signed commits
4. **README updated** to remove private-token install instructions; add public `npx -y github:henrik-me/agent-harness#v0.1.0` example
5. **Post-flip verification:**
   - External CI run executes `npx -y github:henrik-me/agent-harness#v0.1.0 --help` with **no token** → succeeds
   - CI tokens in any prep-work consumer repos rotated/removed (no longer needed)
   - First public GitHub Release notes published
6. **Retrospective:** learnings filed about the public-flip process; any surprises during scans dispositioned
**Exit:** Repo public; no-token external consumption verified; retrospective filed.
**Parallelisable:** Final scans / README rework / verification / retrospective → 4 sub-tasks.
**Depends on:** CS15a

---

## Phase F — Adoption

### CS16 · Bootstrap Sub Invaders from harness (greenfield)
**Goal:** First real consumer; validate that `harness init` produces a working repo on a non-trivial project.
**Deliverables:**
- New `henrik-me/sub-invaders` repo
- `harness.config.json` pinning `v0.1.0` from public git-ref (no token needed since CS15b flipped public)
- Seeded files filled in:
  - `ARCHITECTURE.md` documents the locked-in stack: pure TS + HTML5 Canvas + ES modules + PWA service worker frontend; SWA-hosted Azure Function backend (`POST /score`, `GET /leaderboard`); Azure Storage Tables persistence; rate-limit + replay-protection design
  - `CONTEXT.md` documents bootstrap state
  - `README.md` follows READMEGUIDE
  - `WORKBOARD.md` initialised
- Composed files customised: `CONVENTIONS.md` `id=conventions.project` block populated for TS/Canvas; `OPERATIONS.md` `id=operations.project-deploy` block populated for SWA deploy; `REVIEWS.md` `id=reviews.project-gates` block populated for SWA-specific gates
- First Sub Invaders CS executed end-to-end under harness governance: `SI-CS01: project skeleton + canvas hello-world + SWA staging deploy`
- Two follow-up CSs filed under `project/clickstops/planned/`:
  - `planned_sicsNN_re-evaluate-persistence.md` — re-evaluate Upstash Redis vs Cloudflare KV vs Azure Storage Tables once leaderboard traffic data exists
  - `planned_sicsNN_re-evaluate-cloudflare-full-stack.md` — re-evaluate moving entire stack (Pages + Workers + KV/D1) off Azure once v1 ships
**Exit:** Sub Invaders CI green; `harness lint` passes; `SI-CS01` in `done/`; staging URL live.
**Parallelisable:** TS+canvas skeleton / SWA infra / leaderboard Function stub / ARCHITECTURE authoring / composed-block customisation → 5 sub-agents.
**Depends on:** CS15b

### CS17a · Battle-test harness on Sub Invaders → ship `v0.2.0`
**Goal:** Force the harness through real gameplay-development cycles.
**Deliverables:** ~3–5 small CSs in Sub Invaders covering: a feature flag (e.g., `dailyChallenge`), a migration-equivalent (Tables schema or partition-key change), a verify-deploy probe, a learnings-harvest cycle, and a prod deploy. Each surfaces friction → file learnings in harness repo. Disposition learnings; tag harness `v0.2.0`.
**Hot-fix policy (per GPT-5.5 #16):** harness hot-fixes during a Sub Invaders CS are not failures; they are expected. Each hot-fix resets the stability counter and requires ≥1 additional Sub Invaders CS landed cleanly post-fix before tagging `v0.2.0`.
**Exit:** Stability counter ≥ 1 satisfied; harvest cycle completed; `v0.2.0` tagged.
**Parallelisable:** Each Sub Invaders CS is independent → up to 5 sub-agents.
**Depends on:** CS16

### CS17b · Shadow-migration dry-run against guesswhatisnext throwaway branch **[GUARDRAIL, per GPT-5.5 #7]**
**Goal:** Validate **migration mechanics + mature-app surface coverage** that Sub Invaders cannot exercise (doc drift, duplicate-script retirement, reusable-workflow integration against mature CI, composed-block legacy mapping). **Explicit non-goal (per GPT-5.5 #10):** does NOT validate migrated production behavior — environment protection rules, prod secrets, OIDC, approval gates, App Insights wiring are validated only at CS19/PR-2 against the migration branch's environment.
**Deliverables:**
- Throwaway branch `harness-shadow/` of guesswhatisnext (no merge intent)
- Run on the branch:
  - `harness sync --dry-run --report` — capture which existing files would be overwritten/preserved/skipped/conflicted
  - `harness lint` — capture every existing file's linter result
  - `harness check-migration --from-existing-harness` — capture duplicate scripts, workflow-ref mismatches, config overrides required
  - **`harness composed-audit --from-existing-harness`** — capture legacy unmarked content in CONVENTIONS/OPERATIONS/REVIEWS that needs explicit block-ID mapping (per GPT-5.5 #2)
  - Reusable-workflow swap dry-run — wire up the reusable workflow in a separate workflow file (no replacement of existing workflow) and confirm it runs green on the throwaway branch
- Compile findings into `shadow-migration-report.md` (sanitized per Decision #24) archived in harness `project/clickstops/done/done_cs17b_shadow-migration/`. Raw run logs/secrets stay in private CI artifacts.
- Each surprise → harness learning + (if needed) harness fix; iterate until shadow run is clean
- **`legacy_composed_mapping.json` produced ready-to-edit (per re-review #11)** with per-region confidence levels: `auto_mapped` (parser-confident match to a known block ID), `needs_user_choice` (multiple plausible block IDs), `discard_candidate` (orphaned/superseded content the parser flags for likely discard), `unmapped` (no proposal). CS17b exit requires `unmapped == 0` — every region has at least a tentative classification. CS19 only **reviews and approves** the mapping; it does not discover the workload for the first time.
- Throwaway branch deleted after report archived
**Exit:** Shadow-migration report shows zero unexpected findings; `composed-audit` produces `legacy_composed_mapping.json` with `unmapped == 0` and explicit confidence levels; harness adjustments (if any) tagged into a `v0.2.x` patch; `v0.2.x` ready for real migration.
**Parallelisable:** Each report subsection → 5 sub-tasks (sync/lint/check-migration/composed-audit/workflow-dry-run).
**Depends on:** CS17a

### CS18a · PILOT design prep (per GPT-5.5 #5 split)
**Goal:** Define the PILOT framework so CS18b execution and CS19/PR-2 parity are objective gates, not vibes.
**Deliverables:**
- PILOT candidate selection criteria document: small diff, exercises every gate (PR checks, staging deploy, container-validate, prod deploy with approval, App Insights soak/verify-traces), low blast radius. Examples: copy tweak with telemetry tag, noop refactor with feature-flag gate, admin-only endpoint addition.
- **Per-gate parity manifest schema (per GPT-5.5 #3):** for each gate, declare:
  ```json
  {
    "gate": "container-validate",
    "required": true,
    "expected_status": "pass",
    "required_artifacts": ["container-validate.log", "summary.json"],
    "normalized_fields": ["exit_code", "check_names", "required_probe_results"],
    "ignored_fields": ["timestamp", "run_id", "duration_ms", "commit_sha"],
    "max_duration_delta_pct": 50
  }
  ```
- `parity-comparator.mjs` script that diffs `pilot-a-baseline.json` vs `pilot-b-result.json` per the manifest and exits non-zero on unapproved deltas
- `pilot-parity-allowlist.json` schema; allowlist entries must be predeclared (no post-hoc rationalisation)
- "Equivalent in shape" defined precisely: PILOT-B must exercise the **exact same named gates** as PILOT-A in the same order, not merely a similar-sized change
- **Candidate exclusion (per re-review #2):** PILOT candidates must be mergeable and comparable under **both** the existing in-repo harness AND the migrated harness using **equivalent named gates**. Changes whose value depends on a migrated-harness-only gate (e.g. a feature flag that requires `check-feature-flag-policy` which only exists in the migrated harness) are NOT valid PILOTs — they are handled as a separate post-migration smoke/acceptance PR after CS19.
- Approval process: any allowlist additions require user approval before PR-2 opens
- Storage location: artifacts live in harness repo `project/clickstops/active/CS18b/` and `CS19/`
- Comparator self-test: contrived PILOT-A and PILOT-B fixtures with intentional deltas verify the comparator catches and approves correctly
**Exit:** Schema, comparator, allowlist format, and selection criteria all reviewed and merged. Comparator self-test green.
**Parallelisable:** Selection criteria / manifest schema / comparator / allowlist / self-test → 5 sub-tasks.
**Depends on:** CS01 (can start any time after CS01; serializes against CS18b only).

### CS18b · Guesswhatisnext baseline pilot execution **[GUARDRAIL]**
**Goal:** Execute PILOT-A under the *current* in-repo harness; capture the baseline regression spec.
**Pre-conditions:** CS17b clean; CS18a artifacts merged. **Freshness SLA:** baseline must be ≤ 7 days old at CS19 PILOT-B merge-ready time AND no relevant guesswhatisnext workflow/harness/deploy changes have landed since baseline. If freshness fails, re-run CS18b. (Note: the stacked-PR design in CS19 — see GPT-5.5 #3+#4 fix — runs PILOT-B against the migration branch *before* PR-1 merges, eliminating the previous expiry-after-merge risk.)
**Freshness calendar artifact (per GPT-5.5 #14):** CS18b emits `freshness-calendar.md` recording: baseline timestamp, expiry timestamp (baseline + 7d), planned PILOT-B execution window, planned PR-1 merge window. CS19 startup checks the calendar and refuses to begin if windows don't fit before expiry. Forces upfront scheduling honesty.
**Deliverables:**
- Pick PILOT-A using CS18a criteria
- Execute end-to-end under existing in-repo harness:
  1. claim → WORKBOARD update
  2. branch + PR → all PR-body / commit-trailer / docs-consistency checks
  3. local review loop + Copilot review + thread resolution
  4. merge to main
  5. staging deploy via existing workflow
  6. ephemeral smoke + container-validate
  7. prod deploy (with explicit user approval gate)
  8. 60-min App Insights soak / verify-traces
  9. CS file moved to `done/`, learnings filed
- Capture every gate output to `pilot-a-baseline.json` (machine-readable, per CS18a manifest) + `PILOT-A-baseline.md` (human narrative). Both committed to harness repo `project/clickstops/active/CS18b/`.
**Exit:** PILOT-A merged to prod; soak passed; baseline artifacts committed; freshness SLA timer started.
**Parallelisable:** No (deliberately serial — observing live pipeline).
**Depends on:** CS17b, CS18a.

### CS19 · Migrate guesswhatisnext to harness via stacked-PR parity gate **[GUARDRAIL]**
**Goal:** Swap guesswhatisnext to consume the harness with PILOT-B parity verified **before** the migration PR merges (per GPT-5.5 #3+#4 stacked-PR fix; refined per re-review #1, #3, #4, #9). Eliminates the previous "PILOT-B as rollback" weakness — parity is now a true pre-merge gate.

**Pre-conditions:**
- CS17b clean; `legacy_composed_mapping.json` (with `unmapped == 0`) reviewed and approved
- CS18b baseline complete; `freshness-calendar.md` shows planned PR-1 + PILOT-B + final-merge windows fit before expiry
- Stacked-PR strategy: all migration work happens on long-lived branch `migration/harness-pr1`; PILOT-B runs against that branch (and a temporary staging slot wired to it) before the migration squash-merges to `main`.
- **Migration-base SHA recorded** at branch creation (per re-review #4): `migration_base_sha` captured in `migration-meta.json`. This is the `main` SHA the migration is anchored to.

**Scope of the parity gate (per re-review #3 — honest reduced-scope option chosen):**
The CS19 pre-merge parity gate covers **staging + container-validate + CI gates only**. **Production parity is NOT validated pre-merge** in CS19 v0.2.x. Production validation is performed **post-merge** on `main` with explicit user approval before the prod-deploy workflow_dispatch is triggered. A future CS (filed at CS19 close) will add a true `shadow-prod` environment for pre-merge prod parity in a later harness version. This is documented honestly in the LEARNINGS file at CS19 close-out — not papered over.

**Migration-branch divergence controls (per re-review #4):**
- CS19 startup check (per re-review #9): asserts `current_date < freshness_calendar.expiry` AND `main` has had no changes touching `workflow/harness/deploy/parity-relevant` paths since `pilot-a-baseline.commit_sha` AND `migration/harness-pr1` is rebased onto an approved `main` SHA. If any check fails: refuse to proceed; rerun CS18b or rebase as appropriate.
- Before PILOT-B (PR-2) starts: `migration/harness-pr1` MUST be rebased onto current `main`; re-run `harness composed-audit`, migration invariant verification, and CI; refresh `migration_base_sha`. Any change to migration-touched files on `main` between rebase and final merge requires another rebase + re-run.
- **Soft freeze** of unrelated changes touching migration-affected files between PR-2 start and final merge (recorded in WORKBOARD; not a hard branch lock). **Per re-review #4:** the soft freeze is **schedule protection, not correctness protection** — correctness is enforced by the final-merge SHA-equality gate below. Any emergency change touching migration-affected paths requires explicit user acknowledgement that CS19 parity restarts (rebase + composed-audit + invariant + CI + PILOT-B re-run).
- **Final-merge gate:** assert `main` HEAD SHA equals the SHA against which PILOT-B parity was validated. If `main` advanced since then, rebase + re-run PILOT-B. No exceptions.

**Deliverables:**

1. **Migration branch setup:** create `migration/harness-pr1` from `main`. Record `migration_base_sha` in `migration-meta.json`. Configure a temporary staging-slot deploy that points at this branch (the existing staging deploy continues pointing at `main` for any unrelated guesswhatisnext work).

2. **PR-1 (open against `migration/harness-pr1`):** this PR contains the full harness migration:
   - Pre-migration **project-state manifest (per GPT-5.5 #17)** captured: list of historical clickstops, learnings, workboard rows, context content, project-specific architecture sections, app-specific workflows/scripts. Stored as `pre-migration-manifest.json` (sanitized per Decision #24).
   - Run `harness sync --dry-run --report`, `harness check-migration --from-existing-harness`, **`harness composed-audit --from-existing-harness`** with the approved `legacy_composed_mapping.json`; all reports attached to PR-1
   - Add `harness.config.json` pinning `v0.2.x`, run `harness sync` (composed sync uses approved mapping; sync's fail-closed invariant per CS03 enforces no unmapped overwrite)
   - Audit diff: intended drift documented; unintended drift fixed in harness, re-tagged, re-pinned
   - Composed-class blocks: legacy unmarked content migrated into local blocks per `legacy_composed_mapping.json`
   - Retire duplicate `scripts/check-*.js`
   - Swap `.github/workflows/` policy checks to the reusable workflow from CS12
   - **Migration invariant verification:** post-sync, compare against `pre-migration-manifest.json` — no historical clickstop / learning / workboard / context content was deleted or overwritten; no unmarked composed-doc content lost unless explicitly listed in `legacy_composed_mapping.json` as discarded; any seeded-file collision was reported and skipped
   - CI green on `migration/harness-pr1`
   - **PR-1 does not merge yet** — held open pending PILOT-B parity

3. **PR-2 (PILOT-B execution against the migration branch — VALIDATION-ONLY, per re-review #1):**
   - Branch `pilot-b/<slug>` created from `migration/harness-pr1` for PILOT-B work
   - Execute PILOT-B per CS18a definition under the migrated harness
   - Deploy to the temporary migration-branch staging slot
   - Run all gates: PR checks, staging deploy, container-validate, CI gates (production gates explicitly out-of-scope per "honest reduced-scope" above)
   - `pilot-b-result.json` emitted per CS18a manifest (sanitized per Decision #24)
   - `parity-comparator.mjs` runs; classifies deltas as `predeclared-allowed` / `newly-proposed` / `rejected`
   - **Allowlist policy (per GPT-5.5 #11):** any `newly-proposed` delta requires explicit user approval AND **rerunning PILOT-B** after the allowlist addition. Emergency waivers explicitly recorded in PR + learning log. Comparator output preserves the classification audit trail.
   - **PR-2 is NOT merged into `migration/harness-pr1` or `main`.** It is a validation-only PR. Its result artifacts (`pilot-b-result.{md,json}`) are attached to PR-1's check-runs / uploaded as workflow artifacts, **not committed to the migration branch** (which would contaminate the squash-merge diff per re-review #1). PR-2 is closed as superseded once parity is clean. The pilot artifacts are committed to the **harness repo** CS archive at close-out (Step 6) — not to guesswhatisnext.
   - The PILOT-B *product change itself* is independently re-applied to `main` after the migration lands, via the **standard guesswhatisnext PR flow** — fully decoupled from the migration squash-merge. This keeps the migration diff "just migration" and avoids double-merge contamination.

4. **Final merge gate (per re-review #4):**
   - Parity comparator zero-rejected, zero-newly-proposed-unapproved
   - Migration invariant verified
   - **Re-assert `main` HEAD SHA equals the SHA against which PILOT-B parity was validated** — if `main` advanced, rebase `migration/harness-pr1`, re-run composed-audit + invariant + CI, re-run PILOT-B parity, repeat
   - User explicit approval to merge `migration/harness-pr1` → `main`
   - Squash-merge `migration/harness-pr1` → `main` (this is the actual harness migration landing — diff contains only migration mechanics)
   - Temporary staging-slot deploy decommissioned; staging returns to pointing at `main`
   - Soft freeze on migration-touched files lifted

5. **Post-merge production validation (out of pre-merge gate, per honest reduced-scope):**
   - Deploy migrated `main` to prod via existing approval-gated workflow
   - Run verify-traces / App Insights soak per existing OPERATIONS procedure
   - If anomalies: revert via documented rollback (below)
   - **File a planned-state guardrail CS** for "true shadow-prod environment for pre-merge prod parity" with an explicit trigger (per re-review #5): **must be dispositioned before the next mature production-app migration AND before harness `v0.4.0`**. Tracked as a planned-state CS in the harness repo (not just a learning), with the trigger encoded in its frontmatter so it surfaces in the right harvest cycle.

6. **Migration close-out:** archive `pilot-a-baseline.{md,json}`, `pilot-b-result.{md,json}`, `pre-migration-manifest.json`, `composed-migration-manifest.json`, `legacy_composed_mapping.json`, `freshness-calendar.md`, `migration-meta.json` (all sanitized) to harness `project/clickstops/done/`. Update guesswhatisnext LEARNINGS. File the future-shadow-prod CS as `planned_csNN_*` in the harness repo.

**Exit:** `migration/harness-pr1` merged to `main`; PILOT-B staging-parity verified pre-merge (production validation explicitly post-merge per documented scope); staging+container-validate green pre-merge, prod green post-merge; in-repo harness duplicates deleted; guesswhatisnext is now a harness consumer; project-state invariant verified; soft freeze lifted; future-shadow-prod CS filed.
**Parallelisable:** PR-1 sub-tasks (config+sync, workflow swap, duplicate retirement, diff audit, manifest verification, composed-mapping application) → 6 sub-agents. PR-2 (PILOT-B validation) is serial.
**Depends on:** CS17b, CS18b.
**Rollback path:** if anything fails post-merge (including production validation), revert `migration/harness-pr1` merge commit; guesswhatisnext continues operating with its in-repo harness as before; learnings filed; CS19 retried with adjustments. Documented rollback command + timebox in OPERATIONS.md.

### CS20 · Harvest from CS16–CS19 → ship `v0.3.0`; npm-publish decision
**Goal:** Run the harvest cycle for real one more time across two consumers; explicit decision on npm publication.
**Deliverables:**
- All `open` learnings from CS16–CS19 dispositioned
- Template improvements rolled in
- `v0.3.0` tag
- Explicit user decision recorded in `LEARNINGS.md`: **stay on git-ref**, or **publish to npm as `@henrik-me/agent-harness`**
- If publishing: CI workflow + npm scope provisioned + initial `npm publish` from tag + Sigstore attestation considered
**Exit:** v0.3.0 tagged; both consumers pin v0.3.0 cleanly; npm decision recorded.
**Parallelisable:** Per-learning disposition can fan out → N sub-tasks.
**Depends on:** CS19

---

## Dependency graph

```
CS01 → CS02 → CS03 → CS04 → CS05 → CS06 ─┐
                       └── CS07 ─────────┤
                                          ├→ CS08 → CS09 → CS10 → CS11 → CS12 → CS13 → CS14 → CS15a → CS15b → CS16 → CS17a → CS17b ─┐
                                                                                                                                    ├→ CS19 → CS20
                                                                            CS18a (start any time after CS01) → CS18b (after CS17b) ┘
```

## Parallelisation summary (sub-agent fan-out per CS)

| CS | Independent sub-tasks |
|---|---|
| CS02 | 9 (4 schemas / 2 ADRs / 3 examples) |
| CS03 | 5 (sync.mjs / templating.mjs / lock.mjs / composed.mjs / fixtures) |
| CS04 | 9 (one per subcommand incl. whoami) |
| CS05 | 3 (doc-schema lib / linter / fixtures) |
| CS06 | 9 linters incl. workflow-pins + public-artifact |
| CS07 | 4 policy checks (parallel with CS05+CS06) |
| CS08 | 8 (7 docs + SemVer section) |
| CS09 | 6 (5 skeletons + fixture test) |
| CS10 | 8 scaffolds |
| CS12 | 3 (reusable workflow / drift workflow / docs) |
| CS13 | 4 (package.json / CI dry-run / README / schema $id) |
| CS14 | 3 (release tooling / workflow / private smoke test) |
| CS15a | 6 (process-health audit / branch-protection / public-facing files / repo settings / secret+IP review / branch-protection dry-run) |
| CS15b | 4 (final scans / README rework / verification / retrospective) |
| CS16 | 5 (TS skeleton / SWA infra / leaderboard Function / ARCHITECTURE / composed-block customisation) |
| CS17a | 3–5 Sub Invaders CSs |
| CS17b | 5 (sync / lint / check-migration / composed-audit / workflow-dry-run) |
| CS18a | 5 (criteria / manifest / comparator / allowlist / self-test) |
| CS19 | 6 PR-1 sub-tasks incl. composed-mapping application (PR-2/PILOT-B serial) |
| CS20 | N learnings dispositions in parallel |

CS01, CS11, CS18b, CS19/PR-2 (PILOT-B against migration branch) are deliberately serial.

---

## Working Model — how the orchestrator (me) operates each CS

### Phases

| Phase | CSs | Enforcement |
|---|---|---|
| **Spirit phase** | CS01–CS10 | Manual discipline. I follow the model from human conventions; CI mostly absent until linters land in CS05–CS07. Mistakes recoverable. |
| **Self-host phase** | CS11–CS14 | Mechanical via `harness self-check` CI gate. Drift impossible without template change. |
| **Spirit phase / discipline-only** | CS01–CS14 | Manual discipline + GPT-5.5 review on every PR. Branch protection deferred to CS15b per [LRN-001](../../../LEARNINGS.md) (private-repo branch protection requires GitHub Pro). CI gates land progressively: linters from CS05+, self-host gate from CS11. |
| **Public-readiness phase** | CS15a | Ruleset configured (still private — Ruleset doesn't take effect until CS15b public flip); workboard-auto-approve workflow + GitHub App built; secret-scan + IP review complete; all `open` learnings dispositioned per [LRN-003](../../../LEARNINGS.md). |
| **Public-enforced phase** | CS15b+ | Repo public → Ruleset live; signed commits required; full PR policy mechanically enforced; `check-public-artifact` mandatory. |

### Per-CS loop (every CS, all phases)

1. **Pre-claim:** run `harness harvest` (when CS04 lands) — handle any high-priority stale learnings; before that, manual `LEARNINGS.md` review.
2. **Claim (per Decision #23 — tiny-PR + auto-approve-bot model from CS15a onward):** rename `planned_csNN_*.md` → `active_csNN_*.md`; update `WORKBOARD.md`; commit on a `workboard/cs<NN>-claim` branch; open PR labeled `workboard-only`. **From CS15a onward:** the `workboard-auto-approve.yml` workflow verifies path-restriction + label + actor; bot submits the approval; PR auto-merges once CI passes. **Phase A–CS14 transitional (post-bootstrap):** the only direct-to-main push in the entire repo is the CS01 bootstrap commit. From commit 2 onward, branch protection is on; WORKBOARD claim/closeout PRs are normal small PRs with user review (not bot-auto-merged) until CS15a configures the bot. Set `agent: yoga-ah` (derived per Decision #20), `status: 🟢 Active`.
3. **Branch:** `cs<NN>/<slug>`.
4. **Plan-internal:** review CS deliverables; identify parallelisable sub-tasks per the table above; dispatch sub-agents (Haiku for mechanical, Sonnet for non-trivial).
5. **Implement:** execute sub-tasks; merge sub-agent output; iterate.
6. **Local review (per Decisions #15 + #22 fallback):** primary = **rubber-duck with GPT-5.5**. If GPT-5.5 unavailable >30min or 2 failed attempts → fallback to Claude Sonnet 4.6 rubber-duck (different model family/configuration than the Opus 4.7 implementer — independent-critique invariant preserved) OR explicit user waiver. **High-risk CSs (CS03, CS11, CS15a/b, CS18b, CS19):** require GPT-5.5 OR explicit user waiver — no Sonnet fallback. PR body records: model, timestamp, fallback reason if applicable.
7. **Open PR:** body follows `pull_request_template.md`; commit trailers include `Co-authored-by: Copilot`.
8. **CI checks:** all required checks pass (linters from CS05+ enforce this mechanically).
9. **Review:**
   - **Private phase (CS01–CS15a):** GPT-5.5 + your review. Copilot review optional.
   - **Public phase (CS15b+):** GPT-5.5 + Copilot review + your review on CODEOWNERS-protected paths.
10. **Threads resolved**, then **squash-merge**.
11. **Post-merge (per Decision #23):** rename `active_csNN_*.md` → `done_csNN_*.md`; move to `project/clickstops/done/`; update `WORKBOARD.md` (status removed); update `CONTEXT.md` if the CS changed codebase state. From CS15a onward, all WORKBOARD updates go through the tiny-PR claim mechanism.
12. **Capture learnings:** file every learning surfaced during the CS into `LEARNINGS.md` per the schema (after CS05 lands; before that, hand-authored entries that the future linter will validate).
13. **Harvest reminder:** if CS-close triggers the weekly cadence, run harvest now.

### Models used

- **Implementation:** Claude Opus 4.7 1M (this me)
- **Mechanical sub-tasks:** Claude Haiku 4.5 (e.g., 9 parallel linters in CS06)
- **Non-trivial sub-tasks:** Claude Sonnet 4.6 (e.g., schema design in CS02 sub-tasks)
- **Local review:** GPT-5.5 via rubber-duck agent (mandatory pre-PR; mandatory pre-template-commit). Fallback: Claude Sonnet 4.6 rubber-duck (different model family from the Opus 4.7 implementer; non-high-risk CSs only) or user waiver.
- **PR review:** Copilot (optional pre-CS15b, mandatory post-CS15b)
- **Final approval:** you, on every PR

### Mid-CS sync prohibition

I do not run `harness sync` mid-CS unless fixing a harness blocker (per CS04 CLI warning + CS08 SemVer policy). Harness updates land in their own dedicated CS. This protects against process-shape changes mid-flight.

### What remains in `C:\src\harness\` after CS01

The two pre-CS01 planning artifacts (`harness-extraction-plan.md`, `harness-cs-plan.md`) move into the new repo as part of CS01's clickstop body. The `C:\src\harness\` working directory becomes superseded by the new repo's local clone path. Probably `C:\src\agent-harness\`.

---

## Open items resolved (cumulative)

| Q | Answer |
|---|---|
| CS06 granularity | One CS, parallelise 8 linters via sub-agents |
| Greenfield project | Sub Invaders (full spec in CS16) |
| License | MIT |
| Harvest cadence | Weekly + bounded before-claim with user prompt |
| CS10 scaffold scope | One CS, parallelise 8 scaffolds |
| Org / public-or-private | `henrik-me`, private at CS01, hardened at CS15a, public at CS15b with full PR policy enforcement |
| First adopter order | Sub Invaders before guesswhatisnext (so CS17a battle-tests + CS17b shadow-migrates before CS19 migrates) |
| Migration safety | Stacked-PR model: PILOT-A baseline (CS18b, freshness ≤ 7d, freshness-calendar artifact) → PR-1 on `migration/harness-pr1` branch → PILOT-B parity on that branch → user approval → squash-merge to `main`. Parity is a true pre-merge gate, not rollback. |
| Composed file class | Hardened parser (markers outside code fences, strict regex, exact start/end ID match); legacy unmarked content handled fail-closed via `composed-audit` + `legacy_composed_mapping.json`; lock file records per-block provenance |
| Public-artifact safety | All post-CS15b artifacts sanitized; `check-public-artifact` linter blocks tokens, tenant IDs, internal URLs, full logs |
| GPT-5.5 review fallback | Opus rubber-duck for non-high-risk CSs; user waiver otherwise; PR records model/timestamp/reason |
| WORKBOARD claim mechanism | Tiny auto-merged PRs from CS15a onward; replaces direct-push exception |
| Sub Invaders persistence | Azure Storage Tables v1; follow-ups filed in CS16 |
| Sub Invaders deployment | Azure Static Web Apps v1; follow-up filed in CS16 |
| Sub Invaders frontend stack | Pure TS + Canvas + ES modules + PWA, zero runtime deps |
| PILOT-A candidate | Picked during CS18a |
| File classes | 3-class model: managed / composed / seeded |
| README ownership | Harness repo's root README is project-owned (excluded from sync); `template/seeded/README.md` is the consumer skeleton |
| Implementation model | Opus 4.7 1M orchestrator; Haiku/Sonnet sub-agents |
| Local review | GPT-5.5 mandatory pre-PR and pre-template-commit |
| Hot-fix policy | Resets stability counter; ≥1 clean Sub Invaders CS post-fix before next harness tag |
| Mid-CS sync | Prohibited; CLI warns; harness updates in own CS |
