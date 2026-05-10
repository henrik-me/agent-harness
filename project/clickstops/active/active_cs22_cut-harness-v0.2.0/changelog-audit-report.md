# CS22 — CHANGELOG audit report

## Snapshot

| Field | Value |
|---|---|
| Audit date | 2026-05-10 |
| `v0.1.0` SHA | `c6a619ac95111eda8098c4700bdb6766bc1ad40f` |
| `main` HEAD SHA | `a5d23146aad9f2af9ecb92d73c6464188e93f158` |
| Branch | `cs22/cut-v0.2.0` |
| Commit count `v0.1.0..main` (no-merges) | 56 |
| Commit count `v0.1.0..main` (incl-merges) | 56 |
| Auditor | `cs22-changelog-auditor` |

## Commit-by-commit classification

| # | SHA (short) | Subject (one-line) | Classification | Section | Proposed CHANGELOG bullet (if applicable) |
|---|---|---|---|---|---|
| 1 | 650c72f | CS14 close-out: workboard + LRN-078 + check-workflow-pins YAML enforcement (#54) | Fixed | ### Fixed | Workflow validation: check-workflow-pins now fails on YAML parse errors; private-smoke quotes the step name that broke Actions parsing. |
| 2 | 3ec5c1d | docs(handoff): refresh for post-v0.1.0 state + add LRN-064/068/070/074-078 to critical conventions (#55) | Process-only (no entry) | — |  |
| 3 | 57eafaa | docs(handoff): close fresh-session bootstrap gaps (prereqs, sanity check, stop rules, LRN audit) (#56) | Process-only (no entry) | — |  |
| 4 | ae2a419 | docs(plan): file planned CS02b + CS03d for pre-CS15a deferred-LRN cleanup (#58) | Process-only (no entry) | — |  |
| 5 | dc05180 | Claim CS02b: drop redundant top-level local_blocks (LRN-009) (#59) | Process-only (no entry) | — |  |
| 6 | 90b04db | CS02b content: drop redundant top-level local_blocks (LRN-009 option b) (#60) | Already in [Unreleased] | ### Changed (BREAKING) | Existing CS02b breaking-schema bullet preserved in [0.2.0]. |
| 7 | c9a00cc | CS02b close-out: rename active->done, update WORKBOARD/CONTEXT, file LRN-079 (#61) | Process-only (no entry) | — |  |
| 8 | 4a19dd0 | Claim CS03d: template prose-hash for composed-merge evolution (LRN-020) (#62) | Process-only (no entry) | — |  |
| 9 | 015ed87 | CS03d content: template prose-hash for composed-merge evolution (LRN-020) (#63) | Already in [Unreleased] | ### Added / ### Changed | Existing CS03d template_prose_hash and mergeComposed bullets preserved in [0.2.0]. |
| 10 | 17e5c66 | CS03d close-out: rename active->done, update WORKBOARD/CONTEXT (#64) | Process-only (no entry) | — |  |
| 11 | 512370c | docs(LRN-011): flip deferred -> applied; cite CS06 + CS02b R2 + harness-self-check coverage (#65) | Process-only (no entry) | — |  |
| 12 | 3922632 | fix(ci): use PR head SHA (not merge SHA) for harness-self-check-via-reusable (#66) | Fixed | ### Fixed | Reusable self-check CI now checks the PR head SHA instead of the synthetic merge SHA. |
| 13 | 52b070c | docs(plan): file planned CS03e for LRN-019 (legacy-composed-mapping schema) (#67) | Process-only (no entry) | — |  |
| 14 | 94f3aa1 | Claim CS03e: legacy-composed-mapping schema (LRN-019) (#68) | Process-only (no entry) | — |  |
| 15 | ca637d1 | CS03e content: legacy-composed-mapping schema (LRN-019) (#69) | Already in [Unreleased] | ### Added | Existing CS03e schema bullet preserved in [0.2.0]. |
| 16 | 2634dd1 | CS03e close-out: rename active->done; update WORKBOARD/CONTEXT; refresh LRN-019 prose (#70) | Process-only (no entry) | — |  |
| 17 | 1b44045 | docs: refresh README + HANDOFF status after CS02b/CS03d/CS03e + CI fix (#71) | Process-only (no entry) | — |  |
| 18 | c287aab | docs(plan): file planned CS15a (public-readiness preparation) per user authorization (#72) | Process-only (no entry) | — |  |
| 19 | 4fd8abc | Claim CS15a: public-readiness preparation (GUARDRAIL) (#73) | Process-only (no entry) | — |  |
| 20 | 69fcee3 | CS15a content: public-readiness preparation | Added | ### Added | Public readiness assets: issue templates, contribution/security docs, Dependabot/secret-scan/npm-pack CI, and ruleset documentation. |
| 21 | 1c05df9 | CS15a: record repository settings progress | Process-only (no entry) | — |  |
| 22 | 2cf6d07 | CS15a: add workboard App helper | Process-only (no entry) | — |  |
| 23 | e6b3502 | Dry-run workboard bot path (#78) | Process-only (no entry) | — |  |
| 24 | 3bf8d60 | CS15a: record workboard bot dry-run | Process-only (no entry) | — |  |
| 25 | 7d14266 | CS15a: record blocked plan review | Process-only (no entry) | — |  |
| 26 | e47d2d2 | CS15a: record platform-gated settings | Process-only (no entry) | — |  |
| 27 | 62f7ec5 | CS15a close out public readiness (#82) | Fixed | ### Fixed | Public-flip security and policy: refreshed vulnerable lockfile content before public flip and recorded readiness evidence. |
| 28 | fe47575 | Allow admin override for protected PRs | Fixed | ### Fixed | Public-flip security and policy: documented the GitHub ruleset admin-bypass model needed for protected PRs. |
| 29 | 4ba8d94 | Document CS15a close-out learnings | Process-only (no entry) | — |  |
| 30 | 9a5d5af | Harden CS close-out restart docs | Fixed | ### Fixed | Close-out hygiene: clickstop/workboard linters catch missing close-out task rows, duplicate completed sections, and stale in-flight language. |
| 31 | 0f807cc | Resolve Dependabot workflow updates (#86) | Fixed | ### Fixed | Workflow hardening: refreshed GitHub Actions pins and pinned npm 11.2.0 in private-smoke for the npx-from-GitHub path. |
| 32 | 985be53 | plan(backlog): file CS15c/d/e umbrella planned files; supersede 7 originals (#87) | Process-only (no entry) | — |  |
| 33 | 8944a35 | Claim CS15c (CLI surface cleanup umbrella) (#88) | Process-only (no entry) | — |  |
| 34 | 63c54b5 | CS15c content: --config threading, --ref reject, init sync-check guard (#89) | Changed | ### Changed | CLI cleanup: --config threads through sync/check, unsupported --ref is rejected, and init finalizes through sync. |
| 35 | 6e7078d | CS15c close-out: rename active→done, supersede 3 absorbed planned files (#90) | Process-only (no entry) | — |  |
| 36 | 5d095a1 | Claim CS15d (Linter expansion umbrella, absorbs CS06b/8b/10b) (#91) | Process-only (no entry) | — |  |
| 37 | 8ad0871 | CS15d content: linter expansion umbrella (CS06b/CS08b/CS10b) (#92) | Added | ### Added | Shared config/lock readers, template/scaffold linters, and shipped scaffold-policy auto-dispatch in harness lint. |
| 38 | b02a752 | CS15d close-out: rename active→done, supersede 3 absorbed planned files, file LRN-087..091, queue 2 follow-up planned CSs (#93) | Process-only (no entry) | — |  |
| 39 | 226f035 | Claim CS15e (harness init private-tier detection, absorbs CS04a) (#94) | Process-only (no entry) | — |  |
| 40 | 962c866 | CS15e: harness init private-tier detection (absorbs CS04a) (#95) | Added | ### Added | Private-tier detection: init detects repository tier, records constraints, writes .harness-known-constraints.md, and adds disposition/skip flags. |
| 41 | 40c7b55 | CS15e close-out: rename active→done, supersede CS04a, file LRN-092..094, complete pre-CS16 backlog cleanup (#96) | Process-only (no entry) | — |  |
| 42 | 53e19d6 | LEARNINGS.md: file LRN-095 (orchestrator session-hygiene under deep context) (#97) | Process-only (no entry) | — |  |
| 43 | 90cfc1d | chore(workboard): bump yoga-ah Last Seen to 2026-05-10T07:31Z | Process-only (no entry) | — |  |
| 44 | f1c3f51 | Claim CS06c (centralize remaining doc-schema primitives in lib/doc-schema.mjs) (#99) | Process-only (no entry) | — |  |
| 45 | c9f5c8f | Claim CS08c (extend check-templates markdown-context awareness) (#100) | Process-only (no entry) | — |  |
| 46 | 2d87579 | Centralize doc-schema primitives in lib/doc-schema (CS06c) (#101) | Changed | ### Changed | Doc-schema utilities: centralized heading collection, anchor generation, H2 collection, and section extraction. |
| 47 | 91566b0 | Close out CS06c: doc-schema primitives centralized (#102) | Process-only (no entry) | — |  |
| 48 | b90d08b | CS08c: Extend check-templates markdown-context (tilde fences + indented code + N-backtick spans) (#103) | Fixed | ### Fixed | Template linter markdown handling now skips tilde fences, indented code blocks, and N-backtick spans without masking YAML violations. |
| 49 | 74befac | CS08c close-out: WORKBOARD/CONTEXT/LEARNINGS + active->done (#104) | Process-only (no entry) | — |  |
| 50 | 1f86e20 | Claim CS15f (retire HANDOFF.md and consolidate into INSTRUCTIONS / OPERATIONS / README) (#106) | Process-only (no entry) | — |  |
| 51 | 95083df | CS15f: retire HANDOFF.md; consolidate bootstrap docs (#107) | Changed | ### Changed | Restartability docs: retired HANDOFF.md and consolidated bootstrap/session-start/open-LRN guidance into canonical docs. |
| 52 | c2a9d37 | CS15f follow-up: plan-vs-impl gate fixes (#108) | Changed | ### Changed | Restartability docs: README per-path table and stale HANDOFF references corrected as part of the consolidation. |
| 53 | f636973 | CS15f close-out: rename active to done, fill plan-vs-impl, file LRN-098+099 (#109) | Process-only (no entry) | — |  |
| 54 | e8f3e4a | Plan: CS22 (Cut harness v0.2.0) + CS16 (Bootstrap Sub Invaders) + CS21 (gwn process catch-up) (#110) | Process-only (no entry) | — |  |
| 55 | 364ad8b | LRN-100: pr-body workflow doesn't re-trigger on body edits (#111) | Process-only (no entry) | — |  |
| 56 | a5d2314 | CS22 claim: cut harness v0.2.0 (#112) | Process-only (no entry) | — |  |

## Gap analysis vs. existing `[Unreleased]`

- **Already covered (no action):** CS02b BREAKING `local_blocks` removal; CS03d
  `template_prose_hash` / composed prose evolution; CS03e
  `legacy-composed-mapping.schema.json`.
- **Missing-but-needed (add to `[0.2.0]`):** CS06c shared doc-schema
  helpers (`### Changed`); CS08c template-linter markdown handling (`### Fixed`);
  CS14 close-out workflow validation/private-smoke YAML fix (`### Fixed`); CI
  reusable self-check PR-head fix (`### Fixed`); CS15a public readiness assets and
  public-flip security/policy fixes (`### Added` / `### Fixed`); CS15c CLI
  cleanup (`### Changed`); CS15d config/lock readers plus template/scaffold
  linting (`### Added`); CS15e private-tier detection (`### Added`);
  CS15f restartability-doc consolidation (`### Changed`); Dependabot workflow
  hardening/npm pin (`### Fixed`).
- **Process-only (skip):** claim PRs, plan PRs, close-out rename/workboard/context
  updates, HANDOFF-only restart notes that were superseded by CS15f, LRN-only
  bookkeeping commits, workboard Last Seen bump, CS22 claim/setup commits, and
  planned-clickstop filing/supersession commits.

## Pin-sweep target list (informational; orchestrator owns the sweep)

| Path | Line | Quoted line | Recommendation |
|---|---:|---|---|
| README.md | 5 | `> **Status:** v0.1.0 shipped (CS14, 2026-05-04). v0.2.0 unreleased: pre-public-flip hygiene ... **Next gate: CS15a** (public-readiness preparation).` | historical/stale status — update or remove in pin sweep |
| README.md | 26 | `**Option B — install from GitHub by ref** ... `<ref>` is a semver tag (e.g. `v0.1.0`), branch name, or 40-character commit SHA.` | example semver tag — update to v0.2.0 |
| README.md | 36 | `npx -y github:henrik-me/agent-harness#v0.1.0 init` | update to v0.2.0 |
| README.md | 38 | `npx -y github:henrik-me/agent-harness#v0.1.0 sync` | update to v0.2.0 |
| docs\pre-flip-readiness.md | 38 | `Release/package artifact inspection row mentions henrik-me-agent-harness-0.1.0.tgz and v0.1.0 GitHub Release.` | historical mention — leave alone |
| docs\private-consumption.md | 26 | `npx -y github:henrik-me/agent-harness#v0.1.0 --help` | update to v0.2.0 |
| docs\private-consumption.md | 58 | `consumption — `npx -y github:henrik-me/agent-harness#v0.1.0` works` | update to v0.2.0 |
| docs\adr\0001-file-classes.md | 301 | `config key (schema-only in v0.1.0; implemented in a later CS) provides the migration path,` | historical mention — leave alone |
| docs\adr\0001-file-classes.md | 378 | `### `composed_block_migrations` is schema-only in v0.1.0` | historical mention — leave alone |
| docs\adr\0001-file-classes.md | 388 | `In v0.1.0 the per-file allowlist could be expressed in two interchangeable` | historical mention — leave alone |
| template\managed\.github\workflows\harness-drift.yml | 50 | `echo "ERROR: Pin a real semver tag (e.g. 'v0.1.0'), branch name, or 40-char SHA in harness.config.json 'version'." >&2` | example semver tag — update to v0.2.0 |
| .github\workflows\harness-checks.yml | 6 | `#       uses: henrik-me/agent-harness/.github/workflows/harness-checks.yml@v0.1.0` | update to v0.2.0 |
| .github\workflows\harness-checks.yml | 8 | `#         cli-ref: v0.1.0  # optional; defaults to harness.config.json version` | update to v0.2.0 |
| .github\workflows\harness-checks.yml | 95 | `# Covers semver tags (v0.1.0), branch names (main, feature/x),` | example semver tag — update to v0.2.0 |
| .github\workflows\harness-drift.yml | 50 | `echo "ERROR: Pin a real semver tag (e.g. 'v0.1.0'), branch name, or 40-char SHA in harness.config.json 'version'." >&2` | example semver tag — update to v0.2.0 |
| .github\workflows\private-smoke.yml | 8 | `#   - workflow_dispatch (manual, with `ref` input — defaults to `v0.1.0`)` | update to v0.2.0 |
| .github\workflows\private-smoke.yml | 31 | `default: 'v0.1.0'` | update to v0.2.0 |
| .github\workflows\private-smoke.yml | 63 | `# Covers semver tags (v0.1.0), branch names (main, feature/x), and 40-char SHAs.` | example semver tag — update to v0.2.0 |
| .github\workflows\release.yml | 49 | `# Strip leading 'v' for changelog matching ([0.1.0] not [v0.1.0]).` | historical parser example — leave alone |
| examples\guesswhatisnext.harness.config.json | 4 | `"version": "v0.1.0",` | update to v0.2.0 |
| examples\sub-invaders.harness.config.json | 3 | `"version": "v0.1.0",` | update to v0.2.0 |

Summary: 11 files and 21 lines contain `v0.1.0` in the requested sweep; 15 lines are update candidates and 6 are historical mentions to leave alone.

## Risk + flag findings

- **R1 (`release.yml` regression check):** AUTHORIZED — orchestrator-reviewed. Post-v0.1.0 commit `0f807cc` is a Dependabot bump of `actions/checkout@v4 → @v6`; no semantic change to release flow.
- **R2 (`private-smoke` regression check):** AUTHORIZED — orchestrator-reviewed. Post-v0.1.0 commits: `0f807cc` adds an npm-11 pin step (works around an npm 10.x GitFetcher bug, makes smoke more reliable); `650c72f` quotes a step name to fix YAML parsing. Both are pure hardening.
- **R3 (commit-count consistency):** confirmed `git rev-list --count v0.1.0..main` and `git rev-list --count --no-merges v0.1.0..main` both return 56.
- **R4 (BREAKING-error-message check):** `grep -rn "local_blocks" lib/ scripts/` equivalent found `lib/sync.mjs:529-530` documenting that the schema rejects top-level `local_blocks`, and `lib/composed.mjs:9-13` names the migration source of truth. Runtime rejection is Ajv's `additionalProperties` error, which the existing CHANGELOG already says names `local_blocks`; no CS22 fix required.

## Recommended `[0.2.0]` block (pre-rename preview)

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

