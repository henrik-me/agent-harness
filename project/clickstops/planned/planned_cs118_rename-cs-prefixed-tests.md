# CS118 — Rename existing `cs<NN>-*.test.mjs` to behavior-based names (per CS117)

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** omni-ah (orchestrator, Claude Opus 4.8) on 2026-07-22. Deferred-execution follow-up to CS117, per @henrik-me's test-naming directive ("named based on what they do not the CS they came from") — filed now, executed as its own CS to keep the 56-file rename out of unattended work.
**Depends on:** CS117 (the documented convention).

## Goal

Apply the CS117 behavior-based test-naming convention retroactively: rename the existing `tests/cs<NN>-*.test.mjs` files (56 at the reviewed HEAD; re-enumerate at claim HEAD) to behavior-based names (drop the `cs<NN>-` prefix; keep/refine the descriptive slug) and add a top-of-file comment linking the originating clickstop. Preserve git history and keep the full test suite green.

## Background

- The repo has 56 `tests/cs<NN>-*.test.mjs` files (at the reviewed HEAD; re-enumerate at claim HEAD) from the old (clickstop-tied) naming convention. CS117 documents the new behavior-based convention; this CS applies it to the existing set.
- Most `cs<NN>-*` filenames already carry a descriptive slug (e.g. `cs91-workboard-auto-approve-hardening` → `workboard-auto-approve-hardening`), so the rename is largely prefix-stripping + adding a link comment.
- Tests are discovered via `node --test tests/*.test.mjs` (glob), so renames need **no import updates between tests** — but references in docs, comments, CI configs, and memories/learnings must be swept.
- Several tests are referenced BY NAME in prose (LEARNINGS.md, done clickstops, CONTEXT). Those are historical/evidence and must NOT be rewritten (they refer to the file as it was named then); only CURRENT references (CI, active docs, cross-test comments) get updated.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C118-1 | Rename mapping | `tests/cs<NN>-<slug>.test.mjs` → `tests/<slug>.test.mjs` via `git mv`; resolve collisions with a more specific behavior name. KNOWN collisions to disambiguate: (a) `cs89-check-composed-blocks` must NOT become `check-composed-blocks.test.mjs` (already exists) → use a distinct behavior name (e.g. `composed-blocks-hash-marker.test.mjs`); (b) `cs76-doc-xref-resolvability` AND `cs81-doc-xref-resolvability` both strip to `doc-xref-resolvability` → give each a distinct behavior name | Applies CS117; `git mv` preserves blame/history; the two known prefix-strip collisions must be disambiguated (re-scan for others at claim HEAD). |
| C118-2 | Work-item comment | Add a top-of-file comment to each renamed file: `// Introduced by CS<NN> (<short description>).` | Preserves the traceability the filename carried (C117-2). |
| C118-3 | Reference sweep (current only) | Grep the repo for each old `cs<NN>-*.test.mjs` name; update CURRENT references (CI workflows, live code/process docs, cross-test comments, and planned/active clickstop files); LEAVE historical prose (`LEARNINGS.md`, `done/**`, `CONTEXT.md` history) unchanged. CRITICAL: do NOT rewrite an ATTESTED plan's `## Decisions`/`## Deliverables` (it invalidates the pinned plan-review hash) — e.g. planned CS115 names `tests/cs91-workboard-auto-approve-hardening.test.mjs`. For such an attested reference, EITHER update the reference AND re-attest that CS (so its pinned hash matches the new path), OR defer CS118 execution until that CS has closed out and leave the reference unchanged — never re-attest a stale path | Renames must not orphan live references, rewrite historical evidence, or silently invalidate a pinned plan-review attestation. |
| C118-4 | Scope | Rename ONLY `tests/cs<NN>-*.test.mjs`; leave `check-*`/`lib-*`/other already-behavior-named tests | Bounded to the cs-prefixed set. |
| C118-5 | Behavior-preserving | `node --test tests/*.test.mjs` must still discover + pass ALL tests with an UNCHANGED test count; record pre/post FILE counts too — 56 `cs<NN>-*` renamed, ZERO `cs<NN>-*` remaining, total `.test.mjs` file count unchanged | The rename is mechanical; the test-count + file-count invariants prove nothing was lost or dropped from glob discovery. |

## Deliverables

1. Every `tests/cs<NN>-*.test.mjs` renamed (via `git mv`) to a behavior-based name, each with a top-of-file work-item-link comment.
2. Current-reference sweep applied (CI/active-docs/cross-test comments); historical prose untouched.
3. Verification: `node --test tests/*.test.mjs` green with the **same test count** as before; record pre/post file counts (56 renamed, ZERO `cs<NN>-*` remaining, total `.test.mjs` unchanged); `node bin/harness.mjs lint --quiet` 0-fail; `sync --mode=check` no drift.

## User-approval gates

- **G118-1:** this is a large (56-file) rename. Surface the full rename mapping (old → new) for confirmation before merge; escalate any non-obvious/collision-prone name rather than guessing.

## Exit criteria

1. No `tests/cs<NN>-*.test.mjs` remain; all renamed with work-item-link comments.
2. Full `node --test` green with an unchanged test count; `harness lint` + `sync --mode=check` green.
3. Plan-vs-implementation review (gpt-5.6-sol) GO before close-out.

## Risks + open questions

| # | Risk / what breaks | Mitigation |
|---|---|---|
| R1 | A renamed file collides or drops from glob discovery. | C118-5: assert the total test count is unchanged before/after. |
| R2 | A live doc/CI reference to an old filename is orphaned. | C118-3 reference sweep (grep each old name); update current references. |
| R3 | The 56-file diff is hard to review. | Mechanical + test-count-invariant; per-file mapping table in the PR body; batch by area if needed. |
| Q1 | Do any CI workflows or scripts name specific `cs<NN>-*.test.mjs` files (vs the `tests/*.test.mjs` glob)? | Resolve at claim time via the C118-3 grep sweep. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.6-sol | claude-opus-4.8 | cs117-cs118-plan-review (omni-ah) | 261f82e313b7 | 2026-07-22T22:13:55Z | Go | Exact scope, collision handling, reference preservation, re-attestation, and test/file-count invariants are now coherent and execution-ready. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per § Claim) | planned | — | — |

## Notes / Learnings

(filled during execution)

- **Plan review (gpt-5.6-sol `cs117-cs118-plan-review`):** R1 Go-with-amendments (count ~80→56; recorded two prefix-strip collisions — `cs89-check-composed-blocks` + `cs76`/`cs81`→`doc-xref-resolvability`; added the attested-plan reference guard) → R2 Go-with-amendments (fix the re-attestation-branch wording + the G118-1 count) → R3 **Go** (hash `261f82e313b7`).

- Deferred-execution CS: filed now (per @henrik-me's "convention now + dedicated rename CS" scope choice); the actual 56-file rename is executed when this CS is claimed.

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
