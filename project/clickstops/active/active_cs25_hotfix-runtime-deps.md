# CS25 — Hotfix: move ajv/ajv-formats/js-yaml to runtime dependencies + cut v0.2.1

**Status:** active
**Owner:** yoga-ah
**Branch:** `cs25/hotfix-runtime-deps`
**Started:** 2026-05-11
**Closed:** —
**Filed by:** Pre-claim disposition of [Finding #1](../../active/active_cs16_bootstrap-sub-invaders/sub-invaders-bootstrap-summary.md) from CS16 sub-invaders bootstrap (2026-05-11) by `yoga-ah`.
**Depends on:** None. CRITICAL — claimed without workboard-only-PR ceremony (single-orchestrator emergency hotfix, per user direction 2026-05-11).

> **Deviation from C25-5 (release shape):** The CS28 BREAKING template change (PR #120, merged 2026-05-11 at `84bb4c5`) already shifted the trajectory from v0.2.x to v0.3.0. CS25's hotfix entries are therefore added to `[Unreleased]` (not a `## [v0.2.1]` section) and will roll into the v0.3.0 release-cut CS along with CS28. Exit criteria 7 (tag `v0.2.1`), 8 (Release `v0.2.1`), 10 (README `v0.2.1` install pin) are reframed accordingly: the release-cut CS owns the tag/release/README work; CS25 owns only the dep-move + regression test + CHANGELOG entry under `[Unreleased]`.

## Goal

Move `ajv`, `ajv-formats`, and `js-yaml` from the `devDependencies` block of `package.json` into the `dependencies` block, add a regression test that fails if they are ever moved back, and cut a `v0.2.1` patch release. Without this fix, every fresh consumer install via `npx -y "github:henrik-me/agent-harness#vX.Y.Z" init` silently fails the constraint-merge and post-init sync steps with `Cannot find package 'ajv'`.

## Background

Per the CS16 sub-invaders bootstrap (2026-05-11), `harness init` from a freshly-cloned consumer repo emitted these warnings:

```
Warning: could not merge constraints into harness.config.json: Cannot find package 'ajv' imported from C:\Users\<user>\AppData\Local\npm-cache\_npx\<hash>\node_modules\@henrik-me\agent-harness\lib\config-reader.mjs
...
Warning: post-init sync failed: Cannot find package 'ajv' imported from C:\Users\<user>\AppData\Local\npm-cache\_npx\<hash>\node_modules\@henrik-me\agent-harness\lib\sync.mjs
Run `harness sync --mode=apply` manually to complete setup.
```

Root cause: `ajv` (and its peers `ajv-formats` + `js-yaml`) are declared in the `devDependencies` block of `package.json`. When `npx -y "github:..."` installs the package from a git ref, only the `dependencies` block is installed (which is currently `null`/absent). The runtime modules `lib/config-reader.mjs` and `lib/sync.mjs` import `ajv`, so any code path that touches schema validation or sync silently fails.

Self-host runs (executing directly from a cloned `agent-harness/` working tree where developer-mode `npm install` has populated the full devDependency tree) are not affected, which is why this defect persisted through CS01–CS22 close-outs without surfacing.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C25-1 | Which packages to move | All three: `ajv`, `ajv-formats`, `js-yaml`. | All three are imported from runtime `lib/*.mjs` modules per `grep -rn "import.*from 'ajv'\|from 'js-yaml'" lib/`. Splitting (e.g. moving only `ajv` and leaving `js-yaml`) would leave a similar gap. |
| C25-2 | Version pins | Keep current major-pin: `^8.20.0`, `^3.0.1`, `^4.1.0`. | These are the same pins the harness has been tested against since CS06. No reason to bump in a hotfix. |
| C25-3 | Regression test shape | New test `tests/cs25-runtime-deps.test.mjs` reads `package.json`, asserts each of the 3 packages appears in `dependencies` AND does NOT appear in `devDependencies`. | Mirrors `tests/cs23-pr-body-trigger.test.mjs` and `tests/cs14-release-workflow.test.mjs` pattern of contract-locking via shape assertion. |
| C25-4 | Validation method | Real fresh-install simulation: in CI or local dev, create a throwaway dir, run `npx -y "github:henrik-me/agent-harness#<branch-or-sha>" init` from a new throwaway repo, assert ZERO `Cannot find package` warnings on stderr. | Unit-level dep-shape test catches the regression but does not prove end-to-end that npx-install actually works. The integration probe is the only way to verify. Should run as part of `private-smoke.yml` (or a new `npx-init-smoke.yml`). |
| C25-5 | Release shape | Cut `v0.2.1` patch: tag `v0.2.1` on the CS25 close-out commit; let `release.yml` produce the draft GitHub Release; promote to published manually after smoke run passes. | Standard CS22/CS14 release pattern. Patch (not minor) because the fix is bug-only with no API surface change. |
| C25-6 | Consumer notification | Add a CHANGELOG.md entry under `## [v0.2.1]` with text `Fixed: ajv/ajv-formats/js-yaml moved from devDependencies to dependencies — fresh consumer installs via npx git ref now succeed without the workaround.` and update README's `## Installation` section to recommend pinning `v0.2.1`+. | LRN-101 pilot pattern (CHANGELOG-on-every-CS, distributed-surface gate). |

## Deliverables

1. **`package.json`:** move `ajv: ^8.20.0`, `ajv-formats: ^3.0.1`, `js-yaml: ^4.1.0` from `devDependencies` to a new `dependencies` block. Run `npm install` to refresh `package-lock.json`.
2. **Regression test:** new `tests/cs25-runtime-deps.test.mjs` per Decision C25-3. Should assert all 3 packages are in `dependencies`, NOT in `devDependencies`, with the exact pinned ranges.
3. **`CHANGELOG.md`:** add `## [v0.2.1] - YYYY-MM-DD` section per Decision C25-6.
4. **`README.md`:** bump install-pin recommendation in `## Installation` to `v0.2.1`.
5. **End-to-end smoke validation:** during the close-out, run a real fresh-install simulation per Decision C25-4 — create `C:\src\smoke-cs25\` (throwaway dir), `gh repo create` a throwaway repo, `git clone`, run `npx -y "github:henrik-me/agent-harness#<close-out-SHA>" init` and confirm zero `Cannot find package` warnings on stderr. Capture transcript in active CS file Notes section. Tear down throwaway repo + dir after.
6. **Tag + release:** push `v0.2.1` tag on close-out commit; verify `release.yml` run; promote draft to published.
7. **`sub-invaders-bootstrap-summary.md` update** (in the agent-harness CS16 active dir, IF CS16 is still active; otherwise update the done copy): cross-reference CS25 close-out commit + tag in Finding #1's resolution note.

## User-approval gates

- **G-release:** confirm release-promote step before flipping draft → published. Standard CS14/CS22 pattern.

## Exit criteria

1. `package.json` has `dependencies.ajv`, `dependencies.ajv-formats`, `dependencies.js-yaml` (all 3 present).
2. `package.json` has NO devDependency named `ajv`, `ajv-formats`, or `js-yaml` (all 3 removed from devDependencies).
3. `package-lock.json` regenerated successfully.
4. `tests/cs25-runtime-deps.test.mjs` exists and `node --test` exits 0 with the new test passing.
5. `harness lint --quiet` passes (full suite).
6. End-to-end fresh-install smoke per Deliverable #5 transcribed in Notes; ZERO `Cannot find package` warnings observed.
7. Tag `v0.2.1` exists at the close-out commit on `main`.
8. GitHub Release `v0.2.1` exists and is published (not draft).
9. CHANGELOG.md `## [v0.2.1]` section is present with the Fixed entry.
10. README's `## Installation` recommends `v0.2.1` or later.
11. CS16's `sub-invaders-bootstrap-summary.md` Finding #1 has a resolution note pointing at the CS25 close-out SHA + tag.

## Risks + open questions

| # | Risk | Mitigation |
|---|---|---|
| R1 | `npm install` regenerates `package-lock.json` with subtly different transitive deps (e.g. ajv's transitives), failing other tests | Run full `node --test` after `npm install` and ensure baseline (669/669 or current count) holds. Compare lock-file diff for any unexpected major-version transitive bumps. |
| R2 | The `private-smoke.yml` workflow does NOT currently exercise `init` from a fresh repo; only `sync` from an existing one | Either extend `private-smoke.yml` with an init-step, OR add a new `npx-init-smoke.yml`, OR run the smoke manually in the close-out (Deliverable #5). The CS25 minimum is the manual smoke; CI extension is welcome but not required to close. |
| R3 | Other code paths may also import `ajv-formats`/`js-yaml` from runtime — moving only the obvious 3 may miss a 4th transitive | Run `grep -rn "from 'ajv\|from 'js-yaml" lib/ bin/ scripts/ scaffolds/` and verify only these 3 packages appear. If anything else surfaces, add it to the moves. |
| R4 | Promoting `v0.2.1` while consumers may still be pinned to `v0.2.0` (sub-invaders + any future consumers) | The CS25 release notes should include explicit pin-bump guidance. Sub-invaders in particular will hit this in SI-CS04 (which already plans a `harness sync --mode=apply` exercise — perfect time to bump pin). |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1: Edit `package.json` — move `ajv`/`ajv-formats`/`js-yaml` from devDependencies to dependencies | done | yoga-ah | Done in this branch. |
| T2: `npm install` to refresh `package-lock.json` | done | yoga-ah | Lockfile root.dependencies now contains all 3; root.devDependencies is `{}`. |
| T3: Verify no other ajv/js-yaml runtime imports in `lib/`, `bin/`, `scripts/`, `scaffolds/` (R3 mitigation) | done | yoga-ah | `grep -rn "from 'ajv\|from 'js-yaml" lib/ bin/ scripts/ scaffolds/` returns only the 3 expected packages — no fourth dependency surfaced. Found in: lib/{config-reader,sync,lock-reader,lock,doc-schema}.mjs + scripts/{check-learnings,validate-schemas}.mjs. |
| T4: New `tests/cs25-runtime-deps.test.mjs` — assert all 3 in dependencies, none in devDependencies, lockfile mirrors | done | yoga-ah | 7 tests; all pass. |
| T5: Run full test suite + `harness lint --quiet` for regression | done | yoga-ah | Full suite: 676/676 pass (5 consecutive runs after race fix). `harness lint --quiet`: 24 pass / 0 fail / 3 skipped. |
| T6: CHANGELOG.md entry under `[Unreleased] ### Fixed` (CS25 deviation: not `[v0.2.1]` per release-trajectory note above) | done | yoga-ah | Entry added. |
| T7: Close-out: docs + restart state | pending | yoga-ah | Active→done rename + WORKBOARD active row removed at close-out PR. |
| T8: Close-out: learnings + follow-ups | pending | yoga-ah | LRN candidate: dep-shape contract should ideally be enforced earlier (CI on every PR, not just CS25's regression test). May file as planned CS or LRN at close-out. |
| T9: Did this CS need a CHANGELOG entry? (LRN-101 pilot) | done | yoga-ah | Yes — entry added under `[Unreleased] ### Fixed`. |
| T10: End-to-end fresh-install smoke (Deliverable #5) | pending | yoga-ah | Owned by the v0.3.0 release-cut CS (post-tag smoke). Skipped here per release-trajectory deviation. |

## Notes / Learnings

### CS28 piggyback test-race fix (2026-05-11)

While running the full test suite for T5, intermittently 1/676 tests failed:
`tests/check-text-encoding.test.mjs` test 12 (`linter exits 0 against the harness repo`).
Failure mode: linter exited 1 with empty `violations:` stdout (race-condition
ENOENT during recursive walk).

Root cause was **two** pre-existing tests writing transient files inside
REPO_ROOT during parallel `node --test` runs — same anti-pattern as LRN-094:

1. `tests/lib-lock-reader.test.mjs` line 18 — `mkdtempSync(path.join(process.cwd(), 'tests', '.tmp-lib-lock-reader-'))`
2. `tests/check-clickstop.test.mjs` line 75 — `path.join(REPO_ROOT, '.test-output', 'check-clickstop', name)`

Both moved to `os.tmpdir()`. Verified clean across 5 consecutive full-suite
runs. Diagnostic improved on test 12 to also surface `stderr` (which was
previously silently dropped from the failure message — the original failure
was confusing because the only visible info was an empty `violations:` blob).

This piggybacks on CS25 because the same branch needed the test suite to be
race-clean to land. Filed as Notes here rather than a separate CS, since the
fixes are 1-liner, mechanical, and follow an existing repo convention.

LRN candidate: anything writing transient files anywhere under REPO_ROOT
should be detected mechanically — perhaps a lint that grep's for
`mkdtempSync\(.*REPO_ROOT|process\.cwd\(\)` patterns inside `tests/`. File
during close-out.

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_