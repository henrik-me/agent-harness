# CS11b — `harness sync --mode=apply --resolved-sha <sha>` override flag

**Status:** active
**Owner:** yoga-ah
**Branch:** cs11b/content
**Started:** 2026-05-04
**Closed:** —
**Filed by:** CS11 close-out per [LRN-070](../../../LEARNINGS.md#lrn-070).
**Depends on:** CS11

## Goal

Add an `--resolved-sha <sha>` option to `harness sync --mode=apply` that pins the recorded `resolved_sha` in the resulting `.harness-lock.json` instead of having the engine derive it from the working-tree HEAD. Removes the post-commit-regenerate ordering trap surfaced by CS11 (lock captured the pre-CS11 claim-merge SHA because templates were uncommitted at the moment sync ran; required a follow-up commit `a4d9ece` to point the lock at the correct CS11 content commit).

## Background

CS11 ran `sync --mode=apply` during Stage B.5 with uncommitted template changes in the working tree. `resolveHarnessRef()` returned `5f19bf9` (the claim-merge HEAD), even though the templates that produced the rendered content had not been committed yet. After CS11 committed at `f6cb2dc`, the lock had to be re-applied to update `resolved_sha` to `f6cb2dc`, then re-committed (`a4d9ece`). The R1 review correctly flagged this as a lock-integrity violation — the lock claimed a `resolved_sha` that could not have produced its `rendered_hash` entries.

This pattern (sync-then-commit-then-re-sync-then-commit) creates a 2-commit minimum for any CS that touches templates AND root files. An `--resolved-sha` override would let the orchestrator commit-ahead, pin the SHA at sync time, and ship in a single commit.

## Deliverables

- [ ] `bin/harness.mjs cmdSync`: parse `--resolved-sha <sha>` flag (with `requireValue` guard per LRN-040). Validate it as 40-char lowercase hex (per `harness-lock.schema.json` `resolved_sha` regex). On invalid input, exit 2 with usage error.
- [ ] `lib/sync.mjs`: thread the override through to `resolveHarnessRef()` (or to the lock-construction site directly). When provided, skip the git-rev-parse step and use the override verbatim. When absent, retain current behavior.
- [ ] `tests/sync.test.mjs` (or new `tests/cs11b-resolved-sha-override.test.mjs`): tests for (a) override accepted with valid SHA → lock contains override, (b) invalid format → exit 2, (c) absent override → current behavior preserved.
- [ ] `template/composed/OPERATIONS.md` § Sync § Flags: document the new flag with the post-commit-regenerate use case from LRN-070.
- [ ] Mirror the docs change to root `OPERATIONS.md` (or wait for next `harness sync` to mirror it automatically — CS11 self-host means root is now generated from template).

## Exit criteria

- `node --test tests/*.test.mjs` passes (436+ baseline; this CS adds ≥3 new).
- `node bin/harness.mjs sync --mode=apply --resolved-sha <40-hex> --cwd .` writes a lock with the specified `resolved_sha`.
- `node bin/harness.mjs sync --mode=apply --resolved-sha not-a-sha --cwd .` exits 2 with a clear usage error.
- `node bin/harness.mjs sync --mode=apply --cwd .` (no override) behaves exactly as today.
- `node bin/harness.mjs lint --quiet` exits 0 with the new docs change.
- `node scripts/check-workflow-pins.mjs --dir .github/workflows` still passes.

## Sub-agent fan-out

Single sub-agent for the engine + tests + docs (small CS). Orchestrator owns the `harness sync` re-run after the engine change to keep `.harness-lock.json` consistent.

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| `bin/harness.mjs` `--resolved-sha` flag + `lib/sync.mjs` plumbing + `tests/sync.test.mjs` extension + OPERATIONS.md doc | pending | orchestrator | agent-id=yoga-ah \| role=orchestrator \| report-status=pending \| learnings=0 |

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
