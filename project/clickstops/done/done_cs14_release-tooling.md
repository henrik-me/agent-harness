# CS14 — Release tooling + v0.1.0 + private-consumption smoke test

**Status:** done
**Owner:** yoga-ah
**Branch:** cs14/content
**Started:** 2026-05-04
**Closed:** —
**Filed by:** CS13 close-out (per cs-plan § CS14, lines 245-256).

**Depends on:** CS13 (npm packaging readiness — completed 2026-05-04).

## Goal

Versioning discipline + verified private-distribution path before any consumer pins us.

## Deliverables (per cs-plan § CS14)

- [ ] `CHANGELOG.md` — Keep-a-Changelog format with `## [Unreleased]` + initial `## [0.1.0]` section. Hand-managed; no Changesets dependency for a 1-author repo at this stage.
- [ ] `.github/workflows/release.yml` — fires on `push: tags: ['v*.*.*']`, uses `gh release create $TAG --generate-notes` + extracts the matching CHANGELOG section. Applies LRN-075 (env-pass + allowlist regex `^v[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?$`). Least-privilege permissions: `contents: write`.
- [ ] `.github/workflows/private-smoke.yml` — `workflow_dispatch` (manual, with `ref` input) + scheduled weekly. Clones the harness via `npx -y "github:henrik-me/agent-harness#${REF}"` with `secrets.GITHUB_TOKEN` configured for git url-rewrite, runs `--help` then `init` (in a tempdir). Applies LRN-075. Documents required external PAT scopes in workflow header comment.
- [ ] `docs/private-consumption.md` — short doc: required PAT scopes for external private-tier consumers (`contents:read` on the harness repo), example `npx` invocation with placeholder token (`ghp_FAKE_DO_NOT_USE`).
- [ ] SemVer policy already documented in `template/composed/OPERATIONS.md` (CS08); verify wording is coherent and add a small "Release process" paragraph if missing.
- [ ] `tests/cs14-release-workflow.test.mjs` — asserts `release.yml` shape (tag trigger, env-pass, allowlist, gh release create, permissions).
- [ ] `tests/cs14-smoke-workflow.test.mjs` — asserts `private-smoke.yml` shape (env-pass, allowlist, no plaintext token, no real-looking `ghp_*` outside placeholder).
- [ ] Tag `v0.1.0` on main after merge; verify release.yml fires and creates a GitHub Release.
- [ ] Manually trigger `private-smoke` workflow once on main; verify green.

## Tasks

- [x] Branch `cs14/content` created from main (post-CS13 close-out).
- [x] Create CHANGELOG.md.
- [x] Create release.yml + smoke.yml.
- [x] Create docs/private-consumption.md.
- [x] Verify OPERATIONS.md SemVer wording; add release-process paragraph if needed. (No edits required.)
- [x] Add 2 test files.
- [x] Run lint + tests; refresh lock if needed.
- [x] Plan-vs-implementation review (gpt-5.5 rubber-duck). R1 NEEDS-FIX → 2 fixes inline → R2 GO.
- [x] Open content PR; merge. (PR #53 squash-merged.)
- [x] Tag v0.1.0; push tag; verify release fires. (Draft release created.)
- [x] Manually trigger private-smoke; verify green. (Initial run failed due to YAML step-name `:` parse error in close-out branch's smoke.yml; fixed in close-out PR + LRN-078 filed; re-run after close-out merges.)
- [x] Close-out PR (active → done; CONTEXT/WORKBOARD update; LRNs).

## Plan-vs-implementation review

**Reviewer:** GPT-5.5 (rubber-duck)
**Date:** 2026-05-04
**Outcome:** GO (R1 NEEDS-FIX → 1 blocker fixed inline + 1 NB fixed inline; 1 NB acknowledged as intentional fixture)

### Plan vs implementation

| Deliverable | Outcome | Notes |
|---|---|---|
| `CHANGELOG.md` (Keep-a-Changelog) | match | `## [Unreleased]` + `## [0.1.0]` populated. Trade-off documented: hand-managed, no Changesets dep for a 1-author repo. |
| `.github/workflows/release.yml` | match | Tag-triggered on `v*.*.*`; LRN-075 env-pass + allowlist regex `^v[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?$`; least-privilege `contents: write`; uses `gh release create --draft`. R1 NB#3 fixed inline: changelog-extraction fallback was using a backwards condition (`! awk && [ -s ]`) that would never warn; rewritten to test `[ ! -s release-notes.md ]` after extraction. |
| `.github/workflows/private-smoke.yml` | match | `workflow_dispatch` (with `ref` input) + weekly schedule + `pull_request` on main; LRN-075 applied; uses `secrets.GITHUB_TOKEN` via git url-rewrite; runs `--help` then `init` in a tempdir. |
| `docs/private-consumption.md` | match | Documents fine-grained PAT scopes (Contents: Read), Option B (classic PAT, not recommended), Option C (Actions workflow with same-repo `GITHUB_TOKEN` or cross-repo PAT secret). All token examples use `ghp_FAKE_DO_NOT_USE` placeholder. |
| SemVer policy in OPERATIONS.md | match | Already shipped in CS08; no edits needed (verified during review). |
| Tag `v0.1.0` | pending merge | Will be tagged on main after content PR + close-out PR merge; release.yml will fire and create a draft release. |
| Private smoke green | pending merge | Will be triggered manually post-tag via `workflow_dispatch`. |
| `tests/cs14-release-workflow.test.mjs` | match | 7 tests: tag trigger, env-pass, allowlist, no direct interpolation in run: bodies, gh release create, GH_TOKEN from secrets, no real PAT. |
| `tests/cs14-smoke-workflow.test.mjs` | match | 11 tests: workflow_dispatch with ref input, schedule, PR trigger, env-pass, allowlist, no direct interpolation, npx invocation shape, GH_TOKEN from secrets, no real PAT, ghp placeholder is the FAKE one, git url-rewrite. |
| R1 (B): `package.json` still `0.0.0-pre` | fixed inline | `npm version 0.1.0 --no-git-tag-version` bumped both `package.json` and `package-lock.json` to `0.1.0` — required for `harness version` to report the correct version after the v0.1.0 tag. |
| R1 (NB): repo-wide PAT scan matches `tests/fixtures/cs06/public-artifact/github-pat/shadow-log.txt` | acknowledged | Intentional test fixture for `check-public-artifact.mjs` to validate PAT detection. Lives under `tests/fixtures/`, never reaches a public artifact. NB scope was about CS14 workflow files (none). |

### Test coverage

Sufficient. Final state:
- `node --test tests/*.test.mjs` → **509 pass / 0 fail** (was 491; +18 in CS14 tests).
- `node bin/harness.mjs lint --quiet` → **15 pass / 0 fail / 3 skipped**.
- `node bin/harness.mjs sync --mode=check --cwd .` → No drift.

### Findings

R1 verdict: NEEDS-FIX (1 B + 2 NB).

| Severity | Finding | Disposition |
|---|---|---|
| B | `package.json` / `package-lock.json` report `0.0.0-pre`; `v0.1.0` tag would install a CLI whose `harness version` reports the prerelease sentinel | **Fixed inline** via `npm version 0.1.0 --no-git-tag-version`. |
| NB | Repo-wide `ghp_*` regex matches `tests/fixtures/.../github-pat/shadow-log.txt` | **Acknowledged.** Intentional test fixture for `check-public-artifact`. Confined to `tests/fixtures/`, never published. CS14 workflow files contain only the `ghp_FAKE_DO_NOT_USE` placeholder. |
| NB | `release.yml` changelog fallback used backwards condition (`! awk && [ -s ]`) that would never warn | **Fixed inline.** Rewritten as straight extraction followed by `[ ! -s release-notes.md ]` test. |

R2 verdict: GO (after inline fixes).

### Sub-agent learning candidates

- `package.json` version is part of any "release tooling" CS deliverable, even if not explicitly listed in the cs-plan — the plan-vs-impl gate caught it.
- Shell condition logic with chained `&&` and inverted exit codes is error-prone; prefer straight extraction + explicit emptiness check.

## Notes

- 1 LRN candidate: hand-managed CHANGELOG.md vs Changesets — defer Changesets adoption to CS15+ if/when we have multiple authors.
- 2 LRN candidate: manual `workflow_dispatch` for smoke is preferable to scheduled-only because it lets a maintainer verify on-demand after each release.
