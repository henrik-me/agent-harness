# CS29 — Release-cut v0.3.0

**Status:** active
**Owner:** yoga-ah
**Branch:** `cs29/release-cut-v0.3.0`
**Started:** 2026-05-11
**Closed:** —
**Filed by:** Single-orchestrator emergency mode (yoga-ah, 2026-05-11) — combined CS28 BREAKING template change (PR #120, `84bb4c5`) and CS25 hotfix (PR #121, `b37a22f`) need to ship together as v0.3.0 before sub-invaders agent can pull a clean install.
**Depends on:** CS25 (`b37a22f`), CS28 (`84bb4c5`).

## Goal

Cut **v0.3.0** release: bump `package.json` `0.2.0 → 0.3.0`, transform CHANGELOG `[Unreleased]` block into `[0.3.0] — 2026-05-11`, reset `[Unreleased]` to empty sections, bump README `## Installation` install-pin recommendation to `v0.3.0`, then push tag `v0.3.0` so `release.yml` produces a draft GitHub Release. Promote draft → published only after the user G-release gate.

## Background

- **CS28 (BREAKING):** removed `## Queued` / `## Recently Completed` from WORKBOARD shape. Pre-1.0 BREAKING change → minor bump (per Keep-a-Changelog + SemVer 0.x convention).
- **CS25 (hotfix):** moved `ajv`/`ajv-formats`/`js-yaml` from devDeps → runtime deps so `npx -y "github:...#tag" init` works. Without this, every fresh consumer hits `Cannot find package 'ajv'` warnings.

Both changes are already on `main`. Bumping to v0.3.0 (vs v0.2.1) was forced by CS28's BREAKING marker — a hotfix patch on top of a breaking change can't be a pure patch.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C29-1 | Version bump | `0.2.0 → 0.3.0` (minor, not patch) | CS28 is BREAKING; pre-1.0 SemVer convention bumps minor for breaking. CS25 hotfix rolls in for free. |
| C29-2 | CHANGELOG date | `2026-05-11` | Today (UTC). |
| C29-3 | Tag form | `v0.3.0` annotated tag on the close-out merge commit | Matches `release.yml` `v*.*.*` trigger. Annotated (not lightweight) per existing CS22 convention. |
| C29-4 | README install pin | Update both `Recommend pinning to a semver tag … (e.g. v0.2.0)` and the two `npx -y github:henrik-me/agent-harness#v0.2.0` snippets to `v0.3.0`. | Distributed-surface gate (LRN-101). |
| C29-5 | Promote draft → published | User G-release gate before promote. | Standard CS22/CS14 pattern. |
| C29-6 | Post-release smoke | Manual `npx -y "github:henrik-me/agent-harness#v0.3.0" init` from a throwaway dir; assert ZERO `Cannot find package` warnings on stderr. | This is the e2e validation of CS25 Finding #1. Owned here because CS25 deferred it to "the release-cut CS". |

## Deliverables

1. **`package.json`:** version `0.2.0` → `0.3.0`.
2. **`package-lock.json`:** refresh via `npm install --package-lock-only`.
3. **`CHANGELOG.md`:** rename `## [Unreleased]` heading → `## [0.3.0] — 2026-05-11`; add a fresh empty `## [Unreleased]` block above it with the standard `### Added / ### Changed / ### Deprecated / ### Removed / ### Fixed / ### Security` skeleton (or whatever the existing pattern is — match precedent). Merge the duplicate `### Fixed` blocks under what was `[Unreleased]` into a single `### Fixed` block within the new `[0.3.0]` section.
4. **`README.md`:** bump install-pin recommendations and example snippets from `v0.2.0` → `v0.3.0`. Update the `Status:` line at the top to reference v0.3.0 (was: "v0.2.0 shipped (CS22, 2026-05-10)" → "v0.3.0 shipped (CS29, 2026-05-11)").
5. **`harness lint --quiet` + full test suite** must pass after the bump.
6. **PR + merge:** open content PR base=main head=cs29/release-cut-v0.3.0; admin-merge after CI green.
7. **Tag + push:** annotated tag `v0.3.0` on the merge commit; `git push origin v0.3.0`.
8. **Verify `release.yml`:** confirm workflow run kicks off; draft GitHub Release `v0.3.0` produced.
9. **G-release gate:** ask user before promote draft → published.
10. **Post-release smoke** (Decision C29-6): from a throwaway dir (e.g. `C:\src\smoke-cs29\throwaway`), `npx -y "github:henrik-me/agent-harness#v0.3.0" init` — assert ZERO `Cannot find package` warnings on stderr; transcribe in Notes; tear down throwaway dir.

## User-approval gates

- **G-release:** confirm release-promote step before flipping draft → published.

## Exit criteria

1. `package.json` version is `0.3.0`.
2. `package-lock.json` mirrors.
3. CHANGELOG.md has a `## [0.3.0] — 2026-05-11` section that consolidates the prior `[Unreleased]` content (CS25 + CS28 entries); fresh empty `[Unreleased]` block exists above it.
4. README.md install-pin/snippets reference `v0.3.0`.
5. `harness lint --quiet` passes (full suite).
6. Full `node --test 'tests/**/*.test.mjs'` passes.
7. PR squash-merged to main.
8. `v0.3.0` tag exists at the merge commit and is pushed to `origin`.
9. `release.yml` ran successfully; draft `v0.3.0` GitHub Release exists.
10. (G-release pending) `v0.3.0` Release is published (not draft).
11. (G-release pending) Post-release smoke: zero `Cannot find package` warnings transcribed in Notes.

## Risks + open questions

| # | Risk | Mitigation |
|---|---|---|
| R1 | `release.yml` awk extractor fails to find the `[0.3.0]` section if the heading format drifts (e.g. wrong dash) | Match exactly the precedent: `## [0.2.0] — 2026-05-10` uses em-dash `—` (U+2014). Use the same em-dash. |
| R2 | npm install regenerates lockfile with subtly different transitives | Use `npm install --package-lock-only` (no node_modules touch); diff the lockfile narrowly. Tests will catch regressions. |
| R3 | Smoke fails because the npx git fetcher hits the npm 10.8.x/10.9.x `Arborist constructor` regression noted in README | The README note already documents the workaround (clone + invoke directly). If the smoke fails on the npx path itself (not the post-install path), document and proceed — that's a known issue, not CS25's fault. |
| R4 | Sub-invaders is mid-flight on its own CS-work; bumping the harness pin mid-flight could cause confusion | The sub-invaders agent has its own CS-flow. SI-CS04 is already planned to do `harness sync --mode=apply` — perfect time to bump pin to v0.3.0. Don't push the bump on sub-invaders side from here; let SI-CS04 own it. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1: Bump `package.json` 0.2.0 → 0.3.0 | pending | yoga-ah | |
| T2: `npm install --package-lock-only` | pending | yoga-ah | |
| T3: CHANGELOG `[Unreleased]` → `[0.3.0] — 2026-05-11` + reset `[Unreleased]` skeleton + merge duplicate `### Fixed` blocks | pending | yoga-ah | |
| T4: README install-pin + snippets v0.2.0 → v0.3.0; update Status line | pending | yoga-ah | |
| T5: `harness lint --quiet` + full test suite | pending | yoga-ah | Must pass. |
| T6: Open + admin-merge PR | pending | yoga-ah | |
| T7: Tag `v0.3.0` + push | pending | yoga-ah | After merge. |
| T8: Verify `release.yml` ran + draft Release exists | pending | yoga-ah | |
| T9: **G-release** — ask user to confirm promote draft → published | pending | yoga-ah | User gate. |
| T10: Post-release smoke (Finding #1 e2e validation) | pending | yoga-ah | |
| T11: Did this CS need a CHANGELOG entry? (LRN-101 pilot) | pending | yoga-ah | Meta question — the CS itself is the CHANGELOG cut. The act of cutting doesn't add a NEW CHANGELOG entry beyond rolling [Unreleased] forward. Answer: no separate entry needed. |
| T12: Close-out docs + restart state (WORKBOARD active row removed, CONTEXT updated, active→done rename) | pending | yoga-ah | Standard close-out hygiene. |
| T13: Close-out learnings + follow-ups (file LRN candidates, planned CS for follow-ups) | pending | yoga-ah | Candidates: dep-shape contract should fire on every PR (not just CS25's regression test); REPO_ROOT-tempdir antipattern detection (could be a lint that greps tests/ for `mkdtempSync(.*REPO_ROOT|process.cwd())` patterns). |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
