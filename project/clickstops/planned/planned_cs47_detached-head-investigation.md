# CS47 — Investigate harness CLI detached-HEAD bug (LRN-124 root cause)

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** Pre-claim disposition of [LRN-124](../../../LEARNINGS.md#lrn-124) (filed 2026-05-14 by `yoga-ah` during CS46 close-out — three working-tree-loss incidents in a single session, all symptomatic of the same root cause).
**Depends on:** None. May claim independently. Investigation-bounded scope; small enough to ship in a single sitting if root cause is local.

## Goal

Identify which `harness` CLI subcommand (or which call path inside one) leaves the working repo's HEAD detached at the most-recently-released tag (observed: `v0.5.1`) on exit, causing silent working-tree-loss when an orchestrator subsequently invokes another git-touching tool. Apply the narrowest fix that prevents the detached-HEAD side effect; if the offending subcommand legitimately needs to inspect a tagged ref, restore the original branch state in a `try { ... } finally { ... }` block before returning.

## Background

CS46 (2026-05-14, single session, single orchestrator) experienced **three** working-tree-loss incidents — all the same symptom signature:

1. Multi-file `edit` tool batch completes; `git status --short` shows N modified files.
2. Subsequent harness command runs (`harness sync --mode=apply`, `harness copilot-engage`, `harness lint --quiet` followed by `harness sync --mode=check` in the three respective incidents).
3. After the harness command exits, `git status --short` shows ONLY the newly-CREATED file(s) as untracked — the modified files have silently reverted.
4. `git status` reveals: `HEAD detached at v0.5.1`. Working tree is clean from v0.5.1's perspective; the orchestrator's edits are gone with no error message.

LRN-124 captured the operational discipline ("commit immediately after every multi-file edit batch, before any harness command"), but the root cause — which subcommand's call path invokes `git checkout` on the most-recent release tag without restoring branch state — is unidentified. Without a fix, every multi-orchestrator session continues to incur this risk.

The same `v0.5.1` tag was observed in all three incidents → strongly suggests the offending code path reads a "most-recent release tag" (likely from `.harness-lock.json` `resolved_sha` lookup, or from `git describe --tags --abbrev=0`, or from the `version` field in the consumer's `harness.config.json`) and uses it as a checkout target.

Candidate locations to investigate (`grep -rn "git checkout\|git -c\|spawnSync.*checkout\|execFileSync.*checkout" lib/ scripts/ bin/`):

- `lib/sync.mjs` — sync may inspect the lock's `resolved_sha` or render-from-template using a release tag's content.
- `lib/copilot-engage.mjs` — auth/cache flow.
- `bin/harness.mjs cmdCopilotEngage` — CLI entry.
- `scripts/check-clickstop.mjs` and `scripts/check-clickstop-implementer-not-reviewer.mjs` — date-gated grandfathering may shell out to git for tag dates.
- `lib/lock-reader.mjs` (or wherever the lock JSON is parsed and provenance verified).

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C47-1 | Reproduction approach | **Mechanical bisection driven by the live `bin/harness.mjs` dispatch registry.** The test imports the dispatcher (or parses `cmdRegistry`) and enumerates every registered subcommand at run time; for each subcommand the test must EITHER exercise it under the bisection harness OR appear in an explicit `KNOWN_NON_GIT_TOUCHING` allow-list with a one-line rationale. New subcommands added later that are neither tested nor allow-listed fail the suite. Per subcommand: setup fixtures → run subcommand → assert (a) `git symbolic-ref HEAD` returns the original branch ref AND (b) a pre-staged dirty-tracked sentinel file's contents are unchanged AND (c) `git status --porcelain` for the sentinel is identical to the pre-run snapshot. | LRN-124 evidence is observational, not bisected. Hard-coded subcommand lists go stale (CS52's `review`, the `check` alias, future commands). Asserting only HEAD-attached can pass even if the offending code path does `checkout-then-restore` while clobbering dirty edits — the symptom in LRN-124 was lost edits, not detached HEAD per se. |
| C47-2 | Reproduction realism — self-host condition | Bisection runs in TWO modes per subcommand: **(a) consumer mode** = a freshly-initialized consumer scratch repo at `os.tmpdir()/cs47-<rand>/` invoking the harness CLI from a sibling clone of `agent-harness`; **(b) self-host mode** = a full clone of the agent-harness repo itself into `os.tmpdir()/cs47-selfhost-<rand>/`, then run the CLI inside that clone (REPO_ROOT === cwd, matching the LRN-124 environment). Each scratch repo: `git init && git checkout -b investigation && git -c user.name=cs47-test -c user.email=cs47@test.local commit --allow-empty -m bootstrap`, then `git tag v0.5.1` on the bootstrap commit. Add a `sentinel.txt` tracked file with known content + a deliberate dirty edit before each subcommand run. Both modes assert HEAD attachment AND sentinel preservation. | LRN-124 occurred in the self-host harness repo where `REPO_ROOT === cwd`; consumer-mode-only repro may miss the actual bug. The self-host mode is the *primary* repro; consumer mode is the regression watchdog for downstream consumers. Identity config required because `git commit --allow-empty` without `user.name`/`user.email` fails on fresh dirs. |
| C47-3 | Fix shape | Preference order: **(1) `git show <ref>:<path>`** for read-only inspection of tagged content (no checkout, no worktree, no risk to working tree); **(2) `git worktree add --detach <unique-tmpdir> <ref>`** for multi-file scoped operations (cleanup with `git worktree remove --force <path>` + `rmSync({ recursive: true, force: true, maxRetries: 5, retryDelay: 200 })` for Windows EPERM/EBUSY); **(3) `try { prevRef = git symbolic-ref HEAD; restoreStash = git stash push --include-untracked --quiet; ... } finally { restore prev ref + pop stash }`** as a last-resort narrow checkout that MUST also stash dirty tracked edits before checkout. NEVER bare `git checkout <ref>` on the consumer's working repo. | Read-only `git show` is the narrowest and safest. Worktrees provide full ref content inspection without touching the consumer's working tree but require Windows-aware cleanup (EPERM on locked refs, lingering child handles). The `try/finally` fallback must include stash to address LRN-124's lost-edits symptom — restoring the branch ref alone does not restore dirty tracked-file contents. |
| C47-4 | Regression test acceptance bar | The bisection test from C47-1 is the regression suite. Close-out gate requires: (a) test enumerates from live `bin/harness.mjs` dispatch (not a hard-coded list), (b) every registered subcommand is tested or explicitly skip-listed with rationale, (c) BOTH consumer-mode and self-host-mode assertions are green for every tested subcommand, (d) each tested subcommand asserts HEAD-attached AND dirty-sentinel-preserved AND `git status --porcelain` unchanged, (e) the close-out notes section explicitly identifies offending subcommand(s) by name and the line(s) of `lib/`/`bin/`/`scripts/` code where the detach originated, OR explicitly states "bisection found no offender — likely environmental — see learning addendum to LRN-124". A green test without (e) is a false-green and fails the gate. | Acceptance criteria must prevent the failure mode where a sub-agent ships an under-coverage test that passes without actually fixing the root cause. The named-offender-or-explicit-no-finding requirement forces the sub-agent to actually do the bisection work, not just write a green test. |
| C47-5 | Out of scope | Other working-tree-loss vectors (e.g. `git stash` consumed by background processes, `git clean -fd` in a CI runner, `npm install --git` interactions with consumer dirty-tree, IDE-plugin-driven git operations). CS47 scope is strictly: identify the harness CLI subcommand(s) that destroy dirty tracked edits silently AND prevent the destruction. | Scope discipline. If the bisection turns up no offender (i.e. the issue is environmental — e.g. the orchestrator's session shell shared with another process), surface as a learning addendum to LRN-124 + escalate. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.7-xhigh | rubber-duck dispatched (orchestrator: copilot) | f51c397980b6 | 2026-05-15T01:50:00Z | Needs-Fix | Needs dynamic subcommand coverage and a self-host/dirty-tree repro; current test can pass without fixing root cause. |
| R2 | gpt-5.5 | claude-opus-4.7-xhigh | rubber-duck dispatched (orchestrator: copilot) | b835577b821c | 2026-05-15T02:00:00Z | Go-with-amendments | Blocking gaps fixed; amend fixture realism and clarify self-host clone setup before execution. |

## Deliverables

1. **`tests/cs47-detached-head-bisect.test.mjs`** — new file. Imports/parses `bin/harness.mjs` dispatch registry at run time (no hard-coded subcommand list per C47-1). For each registered subcommand: either (a) runs it in BOTH consumer-mode and self-host-mode scratch repos per C47-2 with HEAD-attachment + dirty-sentinel-preservation + porcelain-unchanged assertions, OR (b) it appears in `KNOWN_NON_GIT_TOUCHING` allow-list with a one-line rationale. Test fails loudly if a registered subcommand is neither tested nor allow-listed. Per-test cleanup uses `rmSync({ recursive: true, force: true, maxRetries: 5, retryDelay: 200 })` for Windows EPERM/EBUSY hardness.
2. **Identified offender(s) + narrow fix** in the relevant `lib/*.mjs` / `bin/harness.mjs` / `scripts/*.mjs` per C47-3 (preference order: `git show` → `git worktree add --detach` → narrow `try/finally` with stash). Close-out notes MUST name the offending file/line OR explicitly document "no offender found" per C47-4(e).
3. **Updated LRN-124** — Disposition update appended noting the root cause + applied fix + reference to CS47 close-out SHA. Status remains `applied`. If no offender found, append an addendum noting environmental hypothesis and re-state the operational mitigation.
4. **CHANGELOG.md** `[Unreleased]/Fixed` bullet citing CS47 + LRN-124 + the offending subcommand(s) (or the no-offender outcome with addendum reference).
5. **Optional: OPERATIONS.md update** — if the fix is "use `git show` / `git worktree` for tagged-ref inspection", add a brief sub-section under § Sub-agent dispatch documenting the doctrine for future contributors writing harness subcommands (NEVER `git checkout <ref>` on the consumer's working repo without stashing dirty edits first).

## Risk Assessment

| # | Risk | Mitigation |
|---|---|---|
| R1 | Bisection turns up NO offender — issue may be environmental (shared shell session, another process holding the cwd, IDE git plugin) | Capture `lsof` / `Get-Process` output during the test runs; if no offender found, document as learning addendum to LRN-124 and escalate (the discipline of "commit before any command" remains the operational mitigation). |
| R2 | Offending subcommand checks out a tag for legitimate reasons (e.g. inspecting historical template content) — naive removal would break that subcommand's behaviour | C47-3 prefers `git show <ref>:<path>` (read-only) > `git worktree add --detach` (scoped) > `try/finally` with stash (last resort). The bisection test asserts non-detached HEAD AND dirty-sentinel-preserved AFTER the subcommand exits — so checking out and properly restoring (including stashed edits) is acceptable. |
| R3 | Multi-subcommand offender — the issue is a shared helper called from several CLI entries | The bisection per C47-1 enumerates from the live dispatch registry and will identify all affected subcommands. Fix the shared helper once; the test then proves all entries are clean. |
| R4 | Test flakes on Windows (file locking on tagged refs, lingering git child handles, worktree metadata, identity config missing) | Use `os.tmpdir()` per LRN-094; `fs.mkdtempSync` for unique per-test dirs; explicit `git -c user.name=... -c user.email=...` on every scratch-repo command; no background children left running across asserts; `rmSync({ recursive: true, force: true, maxRetries: 5, retryDelay: 200 })` cleanup in `afterEach` to absorb EPERM/EBUSY; `git worktree remove --force` before rm. |
| R5 | False green: sub-agent ships an under-coverage bisection test that passes but doesn't actually identify the offender | C47-4 acceptance bar requires (a) live-registry enumeration, (b) explicit allow-list for skipped subcommands, (c) both consumer-mode AND self-host-mode green, (d) HEAD + sentinel + porcelain assertions, (e) named offender or explicit no-finding statement in close-out. Plan-vs-implementation review (close-out gate) verifies all five. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| Bisection test per C47-1: enumerate harness subcommands from live dispatch registry; per-subcommand HEAD + dirty-sentinel + porcelain assertions in BOTH consumer-mode and self-host-mode (per C47-2) | pending | — | use `os.tmpdir()` per LRN-094; `KNOWN_NON_GIT_TOUCHING` allow-list with rationale per skip |
| Identify offender(s); apply fix per C47-3 (`git show` > `git worktree add --detach` > `try/finally` with stash) | pending | — | NEVER bare `git checkout <ref>` on the consumer's working repo |
| Update LRN-124 Disposition with root cause + fix reference (or no-offender addendum per C47-4(e)) | pending | — | per Deliverable #3 |
| CHANGELOG `[Unreleased]/Fixed` bullet citing CS47 + LRN-124 | pending | — | per Deliverable #4 |
| Self-checks: `node --test tests/cs47-*` + `harness lint` + `harness sync --mode=check` | pending | — | regression suite must include the bisection test |
| Plan-vs-implementation review (close-out gate) | pending | — | gpt-5.5 rubber-duck per OPERATIONS.md; gate verifies C47-4(a)-(e) |

## Notes / Learnings

**Live reproduction during plan-filing (2026-05-15, this PR):** The orchestrator (gpt-style; `claude-opus-4.7-xhigh`) reproduced LRN-124 in real time while running `node bin/harness.mjs lint --quiet` to validate the freshly-placed plan file before committing. After lint completed, `git status -sb` returned `## HEAD (no branch)` and `git rev-parse HEAD` returned a SHA matching the most-recent release tag commit (`fe2c0b9` = `v0.5.1`). The orchestrator's prepared commit landed in detached HEAD as `d2a1571`; the subsequent `git push -u origin docs/file-planned-cs47` pushed the local branch ref (which was still pointing at main HEAD `5379097` from the pre-detach checkout) instead of the newly-made commit. Recovery required `git checkout main && git checkout -b docs/file-planned-cs47 && git cherry-pick d2a1571`.

**Implications for CS47 execution:**

1. **The offender includes `harness lint`.** This contradicts the original plan's candidate list (which named `sync`, `copilot-engage`, `check-clickstop`). The bisection per C47-1 should NOT skip read-only-looking subcommands like `lint`; the live evidence proves they can detach HEAD. Add `lint` (`--quiet` and full mode) to the C47-1 enumeration and assert non-detachment + sentinel preservation.
2. **The detach target is the most-recent release tag** (`v0.5.1` in this case), not an arbitrary commit. This narrows the C47-3 search: look for code that reads `git describe --tags --abbrev=0` or `git tag --list 'v*' --sort=-v:refname | head -1` or the `version` field from `harness.config.json` and uses it as a checkout target without restoring HEAD.
3. **The push-the-wrong-ref symptom is a secondary failure mode** worth a separate test assertion: after running a harness subcommand that detaches HEAD, even a properly-formatted `git push -u origin <branch>` can push stale ref state because the local branch was never updated to follow the detached commit. The bisection test should snapshot the local branch ref's value before/after each subcommand and assert no silent change. (Track this as **C47-6** in close-out if confirmed by the bisection test.)
4. **Tracked dirty files were not lost in this incident** because the orchestrator's only edit was a NEW (untracked) file. LRN-124's original symptom (lost tracked-file edits) was not re-triggered, but the detach mechanism is identical — confirming the C47-2 dirty-sentinel assertion is necessary to also test the LRN-124 superset (lost edits) and not just the detach side effect.

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
