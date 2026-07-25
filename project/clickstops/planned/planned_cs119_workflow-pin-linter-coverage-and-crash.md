# CS119 — `check-workflow-pins` enforces nothing: widen to third-party `uses:` refs + fix the fail-closed `totalErrors` crash

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** omni-ah (orchestrator, `claude-opus-5`) on 2026-07-24. Surfaced during a maintainer-requested repo evaluation ("evaluate the current repo, suggest updates that will improve the harness considering newer models and faster and more solid and secure workflows"). Both defects were reproduced against `main` @ `8deaa32`.
**Depends on:** none. (Related: **CS112** — managed-workflow action bumps; that CS bumps pins, this CS makes the pin *gate* real.)

## Goal

Extend `scripts/check-workflow-pins.mjs` into a real repository-wide SHA-pinning gate for third-party actions, and fix the `ReferenceError` that aborts the linter on its own fail-closed path.

Note on the existing policy statement: `OPERATIONS.md:1972` ("All third-party `uses:` refs are pinned to 40-character commit SHAs") sits inside the *reusable `harness-checks.yml` description*, so today it documents that one workflow's composition rather than a repo-wide invariant. This CS deliberately **promotes** that posture to a repo-wide, mechanically enforced rule — it does not merely "turn on" enforcement of something already globally stated.

## Background

Two independent defects, both reproduced on `main` @ `8deaa32`:

- **D1 — the linter checks zero pins.** `USES_REGEX` (`scripts/check-workflow-pins.mjs:120`) and the parsed-YAML walker (`:179`) only match refs beginning `henrik-me/agent-harness`. The self-host repo's own workflows contain **no** such refs, so the CI job `check-workflow-pins` (`.github/workflows/harness-self-check.yml:113-121`) reports `workflows: 11 files, 0 pins checked, 0 errors` and exits 0. Third-party actions are never validated. `.github/workflows/validate-schemas.yml:13-14` already violates the stated policy with `actions/checkout@v6` + `actions/setup-node@v6` (tag pins, not SHAs) and passes CI green. Every other workflow happens to be SHA-pinned by hand — an unenforced convention, one careless PR from regressing.
- **D2 — the fail-closed path crashes.** `:283` executes `totalErrors++`, but `totalErrors` is never declared (the file declares `totalPinsChecked` and the `errors[]` array). On a YAML parse failure — the exact LRN-078 scenario the branch exists to catch — the script dies with `ReferenceError: totalErrors is not defined` under ESM strict mode. Reproduced with a deliberately malformed workflow. The finding is also never pushed to `errors[]`, so absent the crash the summary would report `0 errors` and exit 0.

Coverage context: `tests/check-workflow-pins.test.mjs` has 7 cases, none exercising the parse-failure branch. Case 5 (`:147`) is titled *"real .github/workflows/ has no harness refs — vacuously passes (exit 0)"* — the blind spot is currently **codified as intended behaviour**, so D1 must be fixed in the test as well as the linter.

Scope note: this CS fixes the **gate**. It does not re-pin third-party actions beyond the minimum needed to make the repo pass its own widened gate (`validate-schemas.yml`), and it does not bump any action *version* — version bumps are CS112's arc.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C119-1 | Scope of the widened check | Validate every third-party `uses:` ref, not just `henrik-me/agent-harness` ones — but extract **only from the two valid workflow locations**: `jobs.<id>.uses` (reusable-workflow calls) and `jobs.<id>.steps[*].uses` (step actions) | D1's root cause is the owner-prefix filter. However, dropping that filter while keeping the current "recurse and grab any key named `uses`" walker would newly false-positive on an unrelated `uses` key nested under e.g. `with:`. Location-anchored extraction removes the filter without inheriting that bug. |
| C119-2 | Rule for third-party refs | Must be a 40-char hex SHA. A trailing `# vX.Y.Z` comment is encouraged but not required by the linter. | Matches the posture `OPERATIONS.md:1972` already asserts and the de-facto style in 10 of 11 workflows. Parsing the comment for correctness is out of scope (C119-8). |
| C119-3 | Rule for first-party (`henrik-me/agent-harness`) refs | Unchanged — SHA **or** exact match to `version` in `harness.config.json` | Preserves the existing consumer-pin semantics; this CS must not change how consumers pin the harness itself. |
| C119-4 | Local/reusable refs | Refs starting `./` or `.github/workflows/` are exempt (no version to pin) | Local reusable-workflow calls resolve within the repo/commit; requiring a SHA is meaningless. |
| C119-5 | Docker refs | `docker://…@sha256:<64-hex>` (digest-pinned) is **valid**; any tag-form `docker://` ref is an error | Digest pinning is the container equivalent of a SHA pin and satisfies the same immutability goal, so a blanket ban would be stricter than the rationale supports. None exist today, so this is a cheap forward-looking guardrail either way. |
| C119-6 | D2 fix | Push the parse-failure message through `logError()` (which appends to `errors[]`) and delete the undeclared `totalErrors++` | Reuses the one existing error path so the summary count, exit code, and `--quiet` behaviour all become consistent. Fail-closed by design rather than by accidental crash. |
| C119-7 | Test-case 5 disposition | **Rewrite**, don't delete — assert the real workflows dir now reports a **non-zero** pins-checked count and exits 0 | The vacuous-pass assertion is the bug's fingerprint. Asserting non-zero coverage is what prevents D1 from silently returning. |
| C119-8 | Out of scope (file follow-ups if wanted) | (a) verifying that a `# vX.Y.Z` comment matches the pinned SHA via the GitHub API; (b) bumping any action version; (c) adding `permissions:` blocks | (a) needs network access in CI; (b) is CS112; (c) is CS121. Bundling would turn a defect fix into a posture change. |
| C119-9 | Template/scaffold workflow discovery | Add a `--recursive` mode that discovers workflow directories beneath a given root, **restricted to git-tracked paths** (`git ls-files`), with a hard-coded prune list (`.git`, `node_modules`, `.tmp`, `.harness-ci`) as a belt-and-braces fallback when git is unavailable. A root containing no workflow directory is a **no-op success**; a `--dir` that does not exist stays an error (unchanged) | The current linter reads only the direct children of one directory, so hand-listed `--dir` paths would silently miss any dir nobody remembered. But naive recursion from the repo root is worse: the installed tree contains `node_modules/fast-uri/.github/workflows` and `node_modules/json-schema-traverse/.github/workflows`, whose dependency-owned refs (`actions/checkout@v6`, `coverallsapp/github-action@master`) would fail CI on content the harness does not own. Tracked-paths-only scopes discovery to product files by construction. Product dirs today: `.github/workflows`, `template/.github/workflows`, `template/managed/.github/workflows`, `scaffolds/verify-deploy/files/.github/workflows`. |

## Deliverables

1. `scripts/check-workflow-pins.mjs` — location-anchored extraction of all third-party `uses:` refs per C119-1/2/3/4/5; `--recursive` discovery per C119-9; fix the `totalErrors` crash per C119-6; update the module docblock (`:2-28`), which currently documents only the first-party rule.
2. `.github/workflows/validate-schemas.yml` — SHA-pin `actions/checkout` + `actions/setup-node` to the same SHAs already used elsewhere in the repo (`de0fac2e…` / `48b55a01…`, each with its `# vX.Y.Z` comment), so the repo passes its own widened gate.
3. Any `template/**` or `scaffolds/**` workflow violations surfaced by recursive discovery, corrected in the same PR.
4. `.github/workflows/harness-self-check.yml` — `check-workflow-pins` job switched to the recursive invocation over the repo root (C119-9).
5. `tests/check-workflow-pins.test.mjs` — rewrite case 5 per C119-7; add cases for: third-party tag pin → exit 1; third-party SHA pin → exit 0; local `./` ref → exempt; `docker://` tag → exit 1 **and** `docker://…@sha256:` digest → exit 0 (C119-5, both forms); a `with:`-nested `uses` decoy → **not** collected (C119-1); recursive discovery finding a nested product workflow dir; **an untracked/`node_modules`-style workflow dir → excluded** (C119-9, the dependency-workflow exclusion test); a root with no workflow dir → no-op success; and **YAML parse failure → exit 1 with a counted error and no `ReferenceError`** (the D2 regression test).
6. `OPERATIONS.md` — promote the SHA-pin statement at `:1972` from a `harness-checks.yml` composition note to a stated repo-wide invariant, naming its enforcing linter (+ composed mirror in lockstep if the edited region is inside managed core).
7. `LEARNINGS.md` — one entry recording the "green linter that checked nothing" class of failure (a gate whose scope silently excluded everything it was meant to guard).
8. `CHANGELOG.md` `[Unreleased]` entry.

## User-approval gates

- **G119-1:** if widening the gate over `template/**` + `scaffolds/**` (C119-9) surfaces more than a handful of violations, or any that require a *version* change rather than a tag→SHA translation, escalate before fixing — that overlaps CS112's arc.

## Exit criteria

1. `node scripts/check-workflow-pins.mjs --dir .github/workflows` reports a **non-zero** pins-checked count and exits 0; the recursive invocation over the repo root discovers the four **tracked** product workflow directories, excludes `node_modules`/untracked dirs, and exits 0.
2. A workflow with a tag-pinned third-party action exits 1 with a clear message; a `docker://` tag exits 1 while a `docker://…@sha256:` digest passes; a malformed-YAML workflow exits 1 with a counted error and **no** `ReferenceError`.
3. `node --test` 0 fail (including the new cases); `node bin/harness.mjs lint` 0 fail; `sync --mode=check` no drift.
4. Plan-vs-implementation review Go before close-out.

## Risks + open questions

| # | Risk / what breaks | Mitigation |
|---|---|---|
| R1 | Widening to all `uses:` refs makes previously-green workflows fail, blocking unrelated PRs. | Deliverables 2–3 fix every in-repo violation **in the same PR** as the linter change, so the gate turns on green. Exit criterion 1 verifies it. |
| R2 | Dropping the owner filter could collect an unrelated key named `uses` (e.g. nested under `with:`), producing false errors. | C119-1 anchors extraction to `jobs.*.uses` + `jobs.*.steps[*].uses` rather than recursing over every key; deliverable 5 includes a `with:`-nested decoy fixture asserting it is not collected. |
| R3 | Dependabot opens action-bump PRs with tag pins, which the widened gate would now reject. | Dependabot preserves the existing pin style (SHA + comment) when bumping SHA-pinned actions, so this affects only the already-tag-pinned `validate-schemas.yml`, which D2 fixes. Confirm on the next bump PR. |
| R4 | The `# vX.Y.Z` comment drifts from the SHA it annotates, giving false confidence. | Explicitly out of scope (C119-8a); called out in the linter docblock so the limitation is stated rather than implied. |
| R5 | Recursive discovery reaches dependency-owned workflows under `node_modules/`, failing CI on refs the harness does not control. | C119-9 restricts discovery to git-tracked paths with a `node_modules`/`.git`/`.tmp` prune fallback; deliverable 5 includes an explicit dependency-workflow exclusion test. Verified present in the current tree: `node_modules/fast-uri/.github/workflows`, `node_modules/json-schema-traverse/.github/workflows`. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R3 | gpt-5.6-sol | claude-opus-5 | cs119-123-plan-review (omni-ah) | 70ecf7e1712e | 2026-07-25T01:56:50Z | Go | Go — pin checks cover tracked product workflows, valid `uses` locations, third-party SHAs and Docker digests, while excluding dependency-owned workflows. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per § Claim) | planned | — | — |

## Notes / Learnings

- Reproduction of D1 on `main` @ `8deaa32`: `node scripts/check-workflow-pins.mjs --dir .github/workflows` → `workflows: 11 files, 0 pins checked, 0 errors` / `✅ All workflow pins are valid.` / exit 0.
- Reproduction of D2: a workflow with an unquoted `:` in a step name → `ERROR: ... YAML parse failed ...` immediately followed by `ReferenceError: totalErrors is not defined` at `check-workflow-pins.mjs:283`.

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
