# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versioning policy and release process: see [OPERATIONS.md § Release process](OPERATIONS.md).

## [Unreleased]

### Added

### Changed

### Fixed

### Changed (BREAKING)

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

[Unreleased]: https://github.com/henrik-me/agent-harness/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/henrik-me/agent-harness/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/henrik-me/agent-harness/releases/tag/v0.1.0
