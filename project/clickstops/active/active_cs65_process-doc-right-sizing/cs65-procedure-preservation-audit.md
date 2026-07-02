# CS65 — Procedure-preservation & anchor-integrity audit (C65-5, Deliverable 5)

**Date:** 2026-07-02 · **Owner:** omni-ah-c3 · **Branch:** `cs65/content`

This artifact discharges the C65-5 hard invariant — *no procedure an agent relies
on is silently deleted, and no existing public heading anchor is removed without a
same-anchor stub or redirect* — with mechanical, re-runnable evidence.

## 1. OPERATIONS.md heading-anchor preservation (C65-5, R2)

A pre-thinning heading inventory of both `OPERATIONS.md` (root) and
`template/composed/OPERATIONS.md` was captured **before** any T2 edit, then
re-compared after thinning by `cs65-t5-audit.mjs` (fence-aware GitHub-anchor
slugging, mirroring `lib/doc-schema.mjs headingAnchor`).

| Doc | Pre headings | Post headings | Lost anchors |
|---|---|---|---|
| `OPERATIONS.md` | 113 | 113 | **0** |
| `template/composed/OPERATIONS.md` | 113 | 113 | **0** |

**Result: ✅ every pre-thinning heading anchor is still present.** No heading was
renamed, merged, or deleted — only section *bodies* were collapsed. The 103
inbound `OPERATIONS.md#…` links repo-wide therefore all still resolve.

## 2. Procedure reachability (C65-1/C65-5, R1)

The thinning collapses only the *executable step-by-step* of sections whose steps
are mechanized by a `harness` verb; the doctrine/rationale/invariants stay in the
doc, and any executable detail that lived **only** in OPERATIONS prose was
backfilled into the command `--help`. Every thinned section remains reachable:

| Section (heading preserved) | Executable detail now reachable via | Doctrine kept in-doc |
|---|---|---|
| `### Claim steps` | `harness claim --help` (incl. the backfilled WORKBOARD Active-Work row fields) | Three-PR shape, pre-claim gates |
| `### Post-review validation (CS40 — harness review-output)` | `harness review-output --help` | why + "pr-evidence does NOT include this gate" policy |
| `### Reviewer dispatch via harness review (CS52)` | `harness review --help` | don't-merge-until-Go A5/A16 doctrine |
| `### Recommended invocation (CS41+)` | `harness copilot-engage --help` | REST-vs-GraphQL primitive, the `node(id: …)`/`BOT_kgDOCnlnWA` identity resolution (CS44-pinned), poll predicate, LRN-009/ADR-0004 |

**Sections deliberately NOT thinned** (kept in full — no command-duplication or
load-bearing): the `## Sub-agent dispatch` / `### Mandatory briefing preamble` /
`## Reviewer dispatch — canonical preamble` blocks are **extracted live from
OPERATIONS.md at runtime** by `lib/dispatch.mjs` (`harness dispatch`) and the
reviewer path, so they are the source of truth and must stay verbatim; the
Release / Sync / Cross-repo / Handoff / Plan-vs-implementation-review sections are
doctrine-dense (ordering traps, policy, invariants) with only partial or read-only
command equivalents. Per the G-target resolution, the ≈600-line target is a *goal*
subordinate to no-procedure-loss + anchor-preservation, so these were kept.

## 3. LEARNINGS.md anchor-integrity (C65-3/C65-4, R2)

Archival moved 139 aged `applied` entries (dated `<2026-06-01`) to
`LEARNINGS-archive.md`, leaving an anchor-stable `### LRN-NNN` stub + redirect in
`LEARNINGS.md`.

- All **179** `### LRN-` headings that existed pre-archival still exist in
  `LEARNINGS.md` (40 full + 139 stubs) → every `LEARNINGS.md#lrn-nnn` anchor (396
  inbound links repo-wide) and every bare `LRN-###` token (2384 repo-wide) still
  resolves.
- The stub↔archive integrity invariants (no dead redirect, no orphan, no
  double-full, no open/deferred archived) are enforced mechanically by
  `check-doc-xref-resolvability.mjs` check (d) and `check-learnings.mjs`
  sibling-archive validation.

## 4. Mechanical gates (all green at audit time)

- `node bin/harness.mjs lint --quiet` → 34 passed / 0 failed / 3 skipped
- `node --test tests/*.test.mjs` → 1628 tests, 1627 pass, 0 fail, 1 skip
- `node bin/harness.mjs sync --mode=check --cwd .` → No drift detected (exit 0)
- `cs65-t5-audit.mjs` (this audit) → AUDIT PASSED: no procedure heading anchor lost

## Re-running this audit

The heading-diff audit script (`cs65-t5-audit.mjs`) and the captured pre-thinning
baselines are session-workspace tooling; the durable evidence is the four
mechanical gates above (re-runnable from the repo), the archive/stub integrity
guards (`check-doc-xref-resolvability.mjs` check (d), `check-learnings.mjs`), and
this artifact.
