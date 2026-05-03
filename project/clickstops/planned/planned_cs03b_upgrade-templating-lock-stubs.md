# CS03b — Upgrade `lib/templating.mjs` and `lib/lock.mjs` from stubs to rich APIs

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** CS03 close-out per [LRN-016](../../../LEARNINGS.md#lrn-016) (parallel sub-agent file race lost the rich APIs that `cs03-templating` and `cs03-lock` had authored).
**Depends on:** CS03

## Goal

Recover the rich-API features for `lib/templating.mjs` and `lib/lock.mjs` that were lost in the CS03 parallel-sub-agent file race. The current v0.1.0 implementations are functional stubs; the rich APIs add safety + UX features that are nice-to-have for v0.1.0 but increasingly needed as the engine matures.

## Background

During CS03, 5 sub-agents were dispatched in parallel for the sync engine library. `cs03-sync` (Sonnet) wrote stub `lib/templating.mjs` and `lib/lock.mjs` early in its run so its own code could `import` them. The `cs03-templating` (Haiku) and `cs03-lock` (Sonnet) sub-agents reported success with much richer APIs, but their writes were not preserved on disk — the sync sub-agent's stubs remained final. Per [LRN-016](../../../LEARNINGS.md#lrn-016) and [LRN-017](../../../LEARNINGS.md#lrn-017).

Note: `lib/lock.mjs` already grew significantly during the CS03 review iterations (atomic write, schema validation, LockError class with codes, validateLockObject helper) — many of the rich-API features have ALREADY landed via fixes-v1. So this CS is mostly about templating + the few remaining lock features.

## Deliverables

### `lib/templating.mjs` upgrades
- `applyTemplating(input, vars, opts)` rich signature with `opts.strict` (default `true` once tests pass), `opts.placeholderPattern`, plus a sentinel for missing-variables collection
- `TemplatingError` class extending `Error` with `code` (e.g. `ETPL_UNKNOWN_VAR`, `ETPL_BAD_PATTERN`)
- Whitespace tolerance: `{{ name }}` works
- Escape syntax: `\{{name}}` is preserved literally as `{{name}}` (leading `\` consumed)
- Single-pass guarantee: substituted value NOT re-scanned for placeholders
- Behavioural decision (re-confirm at CS03b time): substitution applies inside fenced code blocks (consumer code samples may legitimately use `{{x}}`). Document in JSDoc.
- 9+ tests (the lost-tests baseline cs03-templating reported)

### `lib/lock.mjs` upgrades (most landed in CS03 fixes-v1; remaining):
- `newEmptyLock({ harnessRef, resolvedSha, configSchemaVersion })` helper — lock skeleton factory used by sync engine on first sync
- Verify atomic-write semantics work cross-platform (Windows MoveFileExW, Linux/macOS rename)
- Confirm `LockError.code` enum stable (`ENOLOCK | EBADLOCK | ESCHEMA`) and documented in JSDoc

### Tests
- `tests/templating.test.mjs`: minimum 9 tests covering all 9 manual scenarios from cs03-templating's report (substitution, whitespace, escape, strict/lenient, code-fence, multi-placeholder, repeat, unknown error, unicode)
- `tests/lock.test.mjs`: extend to cover `newEmptyLock` + cross-platform atomic-write spot-check

### Sync engine integration
- Update `lib/sync.mjs` to use `newEmptyLock()` for fresh-sync lock skeleton (replaces inline construction)
- Update `lib/sync.mjs` templating call to pass `opts: { strict: true }` if/when strict templating is desired (defer to a runtime decision OR keep lenient for v0.1.x backward-compat — re-confirm at CS03b)

## Exit criteria

- All existing tests still pass (162+ baseline)
- New tests cover the rich-API features
- `node scripts/validate-schemas.mjs` exit 0 (no schema regression)
- Documentation comment in `lib/templating.mjs` and `lib/lock.mjs` references this CS as the source of the rich API

## Sub-agent fan-out

3 parallel sub-tasks (per cs-plan parallelisation pattern): `lib/templating.mjs` upgrade, `lib/lock.mjs` upgrade, sync integration tests. Briefings MUST include:
- Hard "no commit" preflight (per [LRN-021](../../../LEARNINGS.md#lrn-021))
- Explicit file ownership: each sub-agent owns ONE file; sync integration sub-agent reads but does not write `templating.mjs` or `lock.mjs` (per [LRN-016](../../../LEARNINGS.md#lrn-016))
- Post-completion verification: orchestrator runs `git status --short` + per-file size check after each wave (per [LRN-017](../../../LEARNINGS.md#lrn-017))

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per OPERATIONS.md § Claim) | planned | — | — |

## Notes / Learnings

(filled during execution)
