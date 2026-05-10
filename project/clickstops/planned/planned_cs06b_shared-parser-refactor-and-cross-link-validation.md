# CS06b — Shared parser primitives refactor + cross-link validation

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** CS06 close-out ([LRN-039](../../../LEARNINGS.md#lrn-039) guessed-field-name anti-pattern + [LRN-042](../../../LEARNINGS.md#lrn-042) lock-format misread; GPT-5.5 R1 NB-6 (deferred) + NB-8 (deferred)).
**Superseded by:** [CS15d](./planned_cs15d_linter-expansion.md) (planning PR `cs15-cleanup-planning`, 2026-05-09). This file remains in `planned/` for provenance until CS15d closes; it MUST NOT be claimed independently.
**Depends on:** CS06

## Goal

(1) Refactor `scripts/check-instructions.mjs`, `scripts/check-readme.mjs`, and `scripts/check-clickstop.mjs` to use `lib/doc-schema.mjs` primitives (e.g. `parseFrontmatterBlocks`, `assertHeadings`, `assertTableShape`) instead of ad-hoc markdown parsing patterns that duplicate logic already in the library. (2) Extend `scripts/check-instructions.mjs` to validate cross-file links — specifically, verify that `LEARNINGS.md#lrn-NNN` anchors referenced in INSTRUCTIONS.md actually exist in the file, and that `docs/adr/*.md#anchor` links resolve. Remove TODO(CS06b) markers from the affected scripts once refactored.

## Background

During CS06, three linter scripts were implemented with ad-hoc markdown parsing rather than using `lib/doc-schema.mjs`. GPT-5.5 NB-6 and NB-8 flagged this as technical debt during R1 review; both were deferred to this CS to keep CS06 scope bounded. Additionally, LRN-039 and LRN-042 documented that reading config/lock fields without consulting the schema leads to silent integration failures. CS06b introduces shared config/lock reader primitives in `lib/` to reduce that risk surface across all linters.

## Deliverables

- [ ] `lib/config-reader.mjs` — canonical helper to load and validate `harness.config.json` (or a `--config`-supplied path) against `schemas/harness.config.schema.json`. Used by any linter that reads config fields. Eliminates ad-hoc `JSON.parse` + guessed field names.
- [ ] `lib/lock-reader.mjs` — canonical helper to load and traverse the lock file, exposing `getComposedBlocks()` and related accessors keyed to the schema-canonical `files[].blocks[]` shape. Eliminates the guessed-shape anti-pattern from LRN-042.
- [ ] Refactor `scripts/check-instructions.mjs` to use `lib/doc-schema.mjs` functions exclusively (remove ad-hoc markdown parsing); add cross-file link validation for `LEARNINGS.md#lrn-NNN` and `docs/adr/*.md#anchor` references.
- [ ] Refactor `scripts/check-readme.mjs` to use `lib/doc-schema.mjs` functions exclusively.
- [ ] Refactor `scripts/check-clickstop.mjs` to use `lib/doc-schema.mjs` functions exclusively.
- [ ] Remove all `TODO(CS06b)` markers from affected scripts.
- [ ] Update tests for the three refactored linters to cover the new cross-link validation (check-instructions) and confirm no regression on existing behaviour.

## Exit criteria

- `node --test tests/*.test.mjs` still passes (333+ tests).
- `node scripts/validate-schemas.mjs` still passes.
- `node bin/harness.mjs lint --quiet` exits 0 (all linters pass against this repo).
- No `TODO(CS06b)` markers remain in the codebase.
- `scripts/check-instructions.mjs` exits non-zero on a fixture containing a dead `LEARNINGS.md#lrn-999` anchor.

## Sub-agent fan-out

**3 refactor sub-agents** (one per linter script, each owns its script + test file) + **2 lib sub-agents** (config-reader and lock-reader, each owns its lib file). Per [LRN-016](../../../LEARNINGS.md#lrn-016), no two sub-agents share a file. Briefings MUST include:
- Hard "no commit" preflight (per [LRN-021](../../../LEARNINGS.md#lrn-021))
- `schemas/*.schema.json` as mandatory reading before touching any field access (per [LRN-039](../../../LEARNINGS.md#lrn-039), [LRN-042](../../../LEARNINGS.md#lrn-042))
- Explicit file ownership

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per OPERATIONS.md § Claim) | planned | — | — |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
