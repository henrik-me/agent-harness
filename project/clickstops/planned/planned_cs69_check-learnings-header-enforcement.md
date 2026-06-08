# CS69 — Enforce `### LRN-NNN` header presence in check-learnings.mjs (apply LRN-154)

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** CS61b close-out (2026-06-07 by `yoga-ah`). Applies **LRN-154** (`LEARNINGS.md` § LRN-154, status `open`), surfaced during CS61b when `LEARNINGS.md` entry LRN-106 shipped with valid frontmatter but no `### LRN-106` H3 header and `scripts/check-learnings.mjs` still reported 0 errors.
**Depends on:** None hard. Pure linter/tooling CS on `scripts/check-learnings.mjs` + `tests/check-learnings.test.mjs` + fixtures. May claim independently. Coordinate only to avoid landing concurrently with a CS that restructures `LEARNINGS.md` entry parsing.

## Goal

Extend `scripts/check-learnings.mjs` so that every learning entry's frontmatter `id: LRN-<n>` is introduced by a matching `### LRN-<n>` H3 header — the nearest `###` heading above the entry's YAML frontmatter block (a blank line separates the header from the opening fence). Headerless or header-mismatched entries — which undercount header-based tallies and leave broken `#lrn-<n>` anchors — must fail CI. Closes the linter gap recorded in LRN-154.

## Background

LRN-154 documents that `check-learnings.mjs` validates each entry's YAML frontmatter against `schemas/learning.schema.json` but never asserts that a markdown `### LRN-<id>` header exists for it. Two consequences were observed first-hand in CS61b: (a) `^### LRN-` counts ran one short of the authoritative `^id: LRN-` count; (b) a `[LRN-106](LEARNINGS.md#lrn-106)` link — the anchor form `scripts/check-instructions.mjs` resolves — pointed at no heading. The LRN-106 header itself was restored in CS61b (PR #256, `019ba8c`); the linter rule that would have caught it up front is the remaining follow-up.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C69-1 | Header-presence rule | Add a rule to `check-learnings.mjs`: for each entry with frontmatter `id: LRN-<n>`, require a matching `### LRN-<n>` H3 header as the nearest `###` heading preceding that entry's YAML frontmatter block (the header sits one blank line above the opening fence, not on the adjacent line). Absence is an error. | Directly closes LRN-154; mirrors the `#lrn-<n>` anchors `check-instructions.mjs` already resolves. |
| C69-2 | Header↔id match | Treat a present-but-mismatched header (e.g. `### LRN-105` above `id: LRN-106`) as an error distinct from a missing header, with a precise message naming both values. | Catches copy-paste / renumber drift — exactly the LRN-id collision renumbers CS61b had to do by hand (151→153, 152→154). |
| C69-3 | Scope discipline | No schema change, no CLI-surface change, no change to the frontmatter contract. Linter logic + fixtures + tests only. The frontmatter `id` stays the authoritative key. | Keeps the CS small and reviewable; avoids touching the shared `schemas/learning.schema.json` contract. |
| C69-4 | Fixtures + tests | Add valid (header present, matches) and invalid (header missing; header present-but-mismatched) fixtures, following the existing `tests/fixtures/cs05/` learnings-fixture pattern, with matching cases in `tests/check-learnings.test.mjs`. | Fixture-based linter testing is the repo convention (INSTRUCTIONS § When to Add a Test); invalid fixtures must exit 1 with the expected message. |

## Deliverables

1. **`scripts/check-learnings.mjs`** — header-presence + header↔id-match rule per C69-1 / C69-2, emitting `ERROR:`-prefixed lines and honouring the existing exit-code contract (0 valid / 1 errors / 2 bad usage) and `--file` / `--quiet` flags.
2. **`tests/check-learnings.test.mjs`** — new cases: header-present-matches (pass), header-missing (fail), header-present-but-mismatched (fail). Minimum 3 new cases; over-delivery welcome.
3. **`tests/fixtures/...`** — supporting valid/invalid learnings fixtures for the new cases (no fixture writes under the repo root at test time — fixtures are committed files).
4. **`LEARNINGS.md`** — at close-out, flip **LRN-154** `open → applied` with the merge SHA recorded in its Disposition prose (no frontmatter SHA field exists per `schemas/learning.schema.json`).
5. **`CHANGELOG.md`** — entry under `[Unreleased]`.

## User-approval gates

- None beyond the standard review loop. Pure internal linter hardening; no release tag required unless bundled into a later release cut.

## Exit criteria

1. `check-learnings.mjs` fails on a headerless entry and on a header↔id mismatch, and passes a well-formed file (C69-1 / C69-2).
2. `node scripts/check-learnings.mjs --file LEARNINGS.md` exits 0 against the real (now header-complete) `LEARNINGS.md`.
3. New fixture-based tests pass under `node --test tests/*.test.mjs`.
4. `harness lint --quiet` passes on self-host (full suite).
5. LRN-154 flipped to `applied`.
6. Plan-vs-implementation review (GPT-5.5 gate) returns GO.

## Risks + open questions

| # | Risk | Mitigation |
|---|---|---|
| R1 | Header-detection mis-handles an entry whose body contains a fenced `### LRN-` example | Anchor the check to the nearest `###` heading preceding each entry's YAML frontmatter block (walking back past the blank line and the opening fence), reusing the linter's existing per-entry segmentation rather than a global scan (per LRN-035 fence-robustness). |
| R2 | A concurrent CS restructures `LEARNINGS.md` parsing | Coordinate at claim; the rule layers onto the existing per-entry walk instead of replacing it. |
| R3 | `LEARNINGS.md` harbours another latent headerless entry | The new rule surfaces it on first run against the real file; fix in-band — it is the linter's own target file (exit criterion 2). |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: yoga-ah) | 34422dab3bda | 2026-06-07T18:23:22Z | Go | Verified F-A–F-F: PR #256 squash 019ba8c, check-learnings lacks header rule, 154/154 LRN counts, no number collision, structure+hash valid. 0 findings. |
| R2 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: yoga-ah) | 4fb511564a55 | 2026-06-08T01:04:26Z | Go | Amended Goal/C69-1/R1 per a Copilot finding to accurately describe LEARNINGS structure (### header + blank + yaml id, not adjacent to the fence); C/D implementable; hash 4fb511564a55; 0 findings. |
| R3 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: yoga-ah) | 335b2b3523c1 | 2026-06-08T01:24:12Z | Go | Renumbered to cs69 after the originally-filed number was taken by PR #271's dependency-bump CS; rename clean, decisions C69-1..4, substance unchanged from R2; re-hashed 335b2b3523c1. 0 findings. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per OPERATIONS.md § Claim) | planned | — | — |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
