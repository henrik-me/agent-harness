# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versioning policy and release process: see [OPERATIONS.md § Release process](OPERATIONS.md).

## [Unreleased]

### Added

- **Schema:** new `schemas/legacy-composed-mapping.schema.json` (Draft-2020-12)
  formally defines the shape of `legacy_composed_mapping.json` (the file
  consumers author when `harness sync` raises `EMERGE_LEGACY_UNMAPPED`).
  Mirrors the runtime rules in `lib/composed.mjs validateLegacyMapping`.
  Consumer files may set `"$schema"` to the new schema for IDE autocomplete.
  Example starter file shipped at `examples/legacy-composed-mapping.example.json`.
  Per CS03e / [LRN-019](LEARNINGS.md#lrn-019).
- **Lock schema:** new optional `fileEntry.template_prose_hash` field
  (composed-class only) records the SHA-256 of the template skeleton
  (post-templating, post-local-block-strip, LF-normalised) at sync time.
  Per CS03d / [LRN-020](LEARNINGS.md#lrn-020).

### Changed

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

### Changed (BREAKING)

- **Schema:** removed top-level `local_blocks` from `harness.config.json`.
  `composed.overrides[<file>].local_blocks` is now the single source of truth
  for per-file composed-block allowlists. Configs carrying the old top-level
  form are now rejected by Ajv with an `additional properties` error naming
  `local_blocks`. Migration: move every entry from `local_blocks[<file>]`
  into `composed.overrides[<file>].local_blocks` and delete the top-level
  key. Resolves [LRN-009](LEARNINGS.md#lrn-009) (CS02b).

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

[Unreleased]: https://github.com/henrik-me/agent-harness/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/henrik-me/agent-harness/releases/tag/v0.1.0
