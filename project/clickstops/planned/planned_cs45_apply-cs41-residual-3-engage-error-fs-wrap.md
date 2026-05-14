# CS45 — Apply CS41 R5 F-residual-3: wrap fs errors in `EngageError` in `lib/copilot-engage.mjs:resolveCopilotIdentity`

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** Pre-CS45 disposition of [CS41 § R5 Copilot disposition F-residual-3](../done/done_cs41_copilot-engage-cli-and-default-flip.md#r5-copilot-disposition--copilot-r4-review-residuals) (CS41 close-out, 2026-05-14, admin-merged at squash SHA `cd11fbd`). Authored 2026-05-14 by `yoga-ah` per [INSTRUCTIONS.md § Pre-claim gate](../../../INSTRUCTIONS.md#claiming-a-cs).
**Depends on:** None. Independent of CS42 (release v0.5.0); may claim before or after the v0.5.0 cut. **Note (LRN-numbering):** done_cs41 R5 prose cites this residual as "LRN-119" but `LEARNINGS.md` LRN-119 documents the unrelated A3 architectural carve-out. The canonical reference is the **F-residual-3 anchor** in done_cs41 § R5.

## Goal

Wrap the raw `fs/promises` calls in `lib/copilot-engage.mjs:resolveCopilotIdentity` (lines 201-202 at HEAD `fa047cd`) so that filesystem failures (e.g. unwritable `~/.cache/harness/`, permission-denied, ENOSPC) are surfaced as `EngageError` instances with a stable `kind` field rather than raw `node:fs` errors that propagate past the CLI's centralized error handler. The two affected calls are:

```javascript
await __testSeam.mkdir(effectiveCacheDir, { recursive: true });
await __testSeam.writeFile(cacheFile, JSON.stringify(payload, null, 2) + '\n', 'utf8');
```

Both currently lack try/catch, so a `Error: EACCES` from a locked-down CI runner or an exotic home directory would bubble all the way up with no `EngageError` wrapper, defeating the CLI's error-classification logic in `bin/harness.mjs cmdCopilotEngage`. The fix is a single try/catch wrapping both calls, with an explicit `EngageError(..., 'cache-write-failed', { cause: err })` rethrow.

## Background

The `EngageError` class (declared at `lib/copilot-engage.mjs:53-67`) is the library's documented error-classification surface. The CLI side at `bin/harness.mjs cmdCopilotEngage` matches on the `kind` field (`'auth' | 'bad-input' | 'network' | 'fork-pr' | 'timeout' | 'cache-stale' | ...`) to produce stable exit codes (per CS41 C41-4). Every other failure path in `lib/copilot-engage.mjs` correctly funnels through `EngageError`:

- GraphQL errors → `toEngageError(err, ...)` (line 117, 212, 258, 371)
- Validation → `new EngageError(..., 'bad-input', ...)` (line 217, 240, 263, 318, 322, 379, 382, 390)
- Identity resolution → `new EngageError(..., 'network', ...)` (line 374)

The two `__testSeam.mkdir`/`__testSeam.writeFile` calls at lines 201-202 are the only un-wrapped fs ops in the file. They were missed because (a) the surrounding code path is only exercised when the identity cache is missing or stale, which never happens under typical local development against a writable `~/.cache/`; (b) the CS41 happy-path tests at `tests/cli-copilot-engage.test.mjs` exercise this code path with a tmpdir-based cacheDir that is always writable. The Copilot R4 dogfood spotted the pattern through static analysis, not through a failing test.

The harm scenario: a hardened CI runner with `HOME=/sandbox` and `/sandbox/.cache` mounted read-only. `harness copilot-engage 123` would crash with `Error: EACCES: permission denied, mkdir '/sandbox/.cache/harness'` instead of the CLI's intended `harness copilot-engage: cache write failed: ... (set --cache-dir <writable-path> to override)`. The user-facing message and exit code would both be wrong.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C45-1 | Wrap both calls in a single try/catch | One `try { mkdir(...); writeFile(...); } catch (err) { throw new EngageError(...) }` block at lines 201-202. Do NOT split into two try/catches; either operation failing means the cache write failed, and the CLI handles them identically. | Single block keeps the code compact; the message can mention the operation type via `err.syscall` if available. |
| C45-2 | New `kind` value | Introduce `kind = 'cache-write-failed'`. Add it to the `EngageError.kind` JSDoc enumeration at the top of the class declaration so future call sites and the CLI's error-classifier are aware of it. | Reusing `'network'` would be misleading (this is local fs, not network); reusing `'bad-input'` would be wrong (user input is fine; the environment is the problem). A dedicated kind lets the CLI emit a tailored hint about `--cache-dir` overrides. |
| C45-3 | CLI side handler | `bin/harness.mjs cmdCopilotEngage` adds a branch on `err.kind === 'cache-write-failed'` that writes a one-line message to stderr including the offending path AND the `--cache-dir <writable-path>` escape hatch hint, then exits with a stable code (proposal: 4 — distinct from existing 0/1/2/3 = success/error/bad-usage/timeout). Confirm the existing exit code map at claim time and pick the next free integer. | Stable exit codes are part of the CLI contract; pick a fresh one to avoid colliding with existing semantics. |
| C45-4 | Test approach | Add 2 tests to `tests/cli-copilot-engage.test.mjs` exercising the new path: (a) a `__testSeam.mkdir` that throws `EACCES` → assert `EngageError` is thrown with `kind === 'cache-write-failed'` and that `err.cause` preserves the original error; (b) a `__testSeam.writeFile` that throws `ENOSPC` → same assertion shape. Plus 1 CLI-level test asserting that running `harness copilot-engage` with an unwritable `--cache-dir` produces the expected stderr message and exit code per C45-3. Minimum 3 new tests. | Standard injected-test-seam pattern (`__testSeam.mkdir = async () => { throw err; }`); already used elsewhere in the test file. |
| C45-5 | Idempotency / partial-write protection | If `mkdir` succeeds but `writeFile` throws after a partial write (low risk on Node fs-promises but possible on rare filesystems), the resulting cache file may be malformed. The next `harness copilot-engage` invocation would hit the cache-stale code path (which already exists per CS37) and re-fetch the identity, overwriting the malformed file. No additional cleanup needed. | Cache-stale recovery is already a tested path; adding explicit unlink-on-error would complicate the code without a real failure scenario. |
| C45-6 | OPERATIONS.md update | OPERATIONS.md § Copilot engagement procedure gains a small "Troubleshooting" subsection (or extends an existing one): "If `harness copilot-engage` exits with `cache-write-failed`, the most common cause is a read-only `$HOME/.cache/`. Override with `--cache-dir <writable-path>` or set `HARNESS_CACHE_DIR=<writable-path>`." Composed-mirror workflow per [LRN-070](../../../LEARNINGS.md#lrn-070) — edit `template/composed/OPERATIONS.md`, then `harness sync --mode=apply --resolved-sha <sha>` to refresh root `OPERATIONS.md` + `.harness-lock.json`. | Surfacing the escape hatch in OPERATIONS.md prevents the user from needing to read the source. |
| C45-7 | LRN status | At CS45 close-out, file a new LRN documenting the underlying lesson: "When wrapping a library in a typed-error surface, audit ALL syscalls and external calls for un-wrapped propagation paths — the CLI/library boundary is the worst place to discover an un-classified error." Pick the next free LRN number at close-out (the LEARNINGS.md vs done_cs41 numbering inconsistency means anything in the LRN-117..120 range may already be claimed by either prose; check carefully and pick the lowest unused). | Captures the meta-lesson so the next library wrapper doesn't repeat the gap. |

## Deliverables

1. **`lib/copilot-engage.mjs`** lines 201-202: wrap the two fs calls in a try/catch per C45-1; rethrow as `new EngageError(..., 'cache-write-failed', { cause: err })`.
2. **`lib/copilot-engage.mjs`** `EngageError` class JSDoc: extend the `kind` enumeration with `'cache-write-failed'` per C45-2.
3. **`bin/harness.mjs`** `cmdCopilotEngage`: add a branch handling `err.kind === 'cache-write-failed'` per C45-3; pick the next free exit code.
4. **`tests/cli-copilot-engage.test.mjs`**: 3 new tests per C45-4. Update the existing exit-code matrix table comment if one exists.
5. **`template/composed/OPERATIONS.md`** § Copilot engagement procedure: append the troubleshooting paragraph per C45-6.
6. **`OPERATIONS.md`** root: regenerated via `harness sync --mode=apply --resolved-sha <sha>` per C45-6 (do NOT hand-edit).
7. **`CHANGELOG.md`** `[Unreleased] / Changed`: "`harness copilot-engage` now reports filesystem cache-write failures via the typed `EngageError` (kind=`cache-write-failed`, exit code N) with a `--cache-dir` escape hatch hint (CS45)." Replace `N` with the actual code chosen.
8. **`LEARNINGS.md`**: new LRN per C45-7.

## Sub-agent fan-out

Single-CS scope; orchestrator-owned. No fan-out warranted (5-line library change + CLI handler + 3 tests + 1 doc paragraph + 1 LRN fits cleanly in one session).

## Exit criteria

CS45 close-out is permitted only when **all** of the following are true and recorded in the active CS file's `## Plan-vs-implementation review` section:

1. `lib/copilot-engage.mjs` lines 201-202 (or their post-CS45 equivalent) are wrapped in a try/catch that rethrows as `EngageError` with `kind === 'cache-write-failed'` per C45-1/C45-2.
2. `bin/harness.mjs cmdCopilotEngage` has a dedicated branch for the new kind with a stable exit code per C45-3.
3. All 3 (or more) new tests pass; exit-code mapping table (if present) is updated.
4. `node --test tests/*.test.mjs` exits 0; total test count is `prior + ≥3`.
5. `node bin/harness.mjs lint --quiet` exits 0 (≥29 pass / 0 fail / 3 skipped baseline).
6. `node bin/harness.mjs sync --mode=check --cwd .` reports `No drift detected`.
7. Root `OPERATIONS.md` was regenerated via `harness sync --mode=apply`, not hand-edited; `.harness-lock.json` reflects the new sha.
8. CHANGELOG.md `[Unreleased] / Changed` includes the bullet per Deliverable #7.
9. New LRN per Deliverable #8 is filed with status `applied` and references CS45 close-out commit SHA.
10. `## Plan-vs-implementation review` records at least one GPT-5.5 plan-vs-impl review with verdict Go.
11. **Smoke test** (manual or scripted): invoke `harness copilot-engage 999 --cache-dir /dev/null/unwritable` (Linux) or an equivalent unwritable path on Windows; confirm the exit code, stderr message, and absence of a stack-trace dump.

## Risks + open questions

- **R1 (low):** Choosing a fresh exit code may collide with a future CS that picks the same number. Mitigation: at claim time, grep `bin/harness.mjs` and OPERATIONS.md for `exit code` mentions to derive the next free number; document the choice in C45-3 prose at close-out.
- **R2 (low):** A test that mocks `__testSeam.mkdir` to throw must also re-set the seam in a `try/finally` to avoid bleeding into subsequent tests. The existing test file already uses this pattern; replicate carefully.
- **OQ1 (defer to claim time):** Should the `--cache-dir` flag also be exposed as an environment variable `HARNESS_CACHE_DIR` (mentioned speculatively in C45-6)? If the existing CLI does not already honour env vars for this, add it as a small ancillary deliverable so the troubleshooting hint is real, not aspirational. Verify at claim time.
- **OQ2 (defer to claim time):** The new LRN number per C45-7 may be 121 (next free after the LEARNINGS.md sequence) or higher depending on what other CSs land in between. Use the lowest unused number at close-out.

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.7-xhigh | rubber-duck dispatched (orchestrator: yoga-ah) | 926d7fe0dae5 | 2026-05-14T04:50:00Z | Go-with-amendments | CS45 grandfather: filed in PR #178 between CS35b and CS42; missed Plan-review section at filing. Backfilled here per CS42-7. Plan content unchanged. |
## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per [OPERATIONS.md § Claim](../../../OPERATIONS.md#claim)) | planned | — | — |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
