# CS63c — Guided update + architectural evaluations (CS63 sibling)

**Status:** done
**Owner:** yoga-ah-c3
**Branch:** cs63c/content
**Started:** 2026-06-07
**Closed:** 2026-06-08
**Filed by:** CS63 (2026-06-06 by `yoga-ah-c3`) per the **G-scope=(a)** user decision — the **guided-update + evaluations** slice of the CS63 umbrella (workstreams W4 + W6).
**Depends on:** **CS63** (umbrella — all decisions/risks). Shares the orchestrator-owned `bin/harness.mjs` + `OPERATIONS.md`/`README.md` (+ mirrors) with CS63b → those shared-file edits **serialize** (CS63 C63-10). Independent of CS63a. The CS64/CS65 stubs this slice was to file are **already filed** (2026-06-06).

## Goal

Deliver the guided consumer-update flow (`harness upgrade`, CS63 C63-6, W4) and land the architectural-evaluation outcomes (CS63 C63-8 skills, C63-9 doc right-sizing, C63-11 advisory disposition, W6): the written proposal, the safe `CONTEXT.md` history cap, and confirmation that the deferred follow-ups (CS64/CS65) are filed.

## Background

See CS63 § Background (Axis 2 — U2/U3, and the Architectural evaluations). Updating today means hand-editing `harness.config.json.version`; there is no previewable upgrade. The skills + doc-sizing evaluations were resolved in CS63 (CLI-first; cap CONTEXT.md now, defer OPERATIONS/LEARNINGS to CS65).

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C63c-1 | Scope | This CS executes CS63 workstreams **W4** (`harness upgrade` + install-docs, decision C63-6) and **W6** (evaluations proposal + CONTEXT cap + follow-up filing, decisions C63-8/C63-9/C63-11). All substantive decisions are CS63's. | Carves the update + evaluation slice from the lifecycle-code slice (CS63b). |
| C63c-2 | Skills + sizing resolved | Per the confirmed **Q2** decision: CLI-commands-first; runtime skills only as thin wrappers (go/no-go after the CS64 spike). Doc right-sizing: cap `CONTEXT.md` history now; defer `OPERATIONS.md`/`LEARNINGS.md` trimming to CS65. | User decision 2026-06-06; CS63 C63-8/C63-9. |
| C63c-3 | Follow-ups already filed | The CS63 W6 deliverable "file CS64/CS65 stubs" is **already complete** (planned_cs64/65 filed 2026-06-06; CS66/CS67 also filed). This CS records that and the proposal, not new stub filing. | Avoids duplicate work; the deferred surface is durably tracked. |

## Deliverables

Per CS63 § Deliverables W4 + W6 (verbatim scope, minus the already-done stub filing):
1. `lib/upgrade.mjs` + `tests/lib-upgrade.test.mjs` (CS63 deliverables 11, 12) — additive over `lib/sync.mjs` (no apply-path rewrite).
2. Orchestrator-owned `bin/harness.mjs` — add `harness upgrade` to `COMMAND_REGISTRY` + `TOP_HELP` + `SUBCOMMAND_HELP` (CS63 deliverable 19 subset).
3. Architectural-evaluation **proposal artifact** (CLI-first skills recommendation + OPERATIONS/LEARNINGS right-sizing plan + C63-11 diff-scope-advisory disposition) in this CS's `done_` directory (CS63 deliverable 15).
4. Orchestrator-owned `CONTEXT.md` — history cap to current + last 2 "Prior" blocks (CS63 deliverable 16).
5. Orchestrator-owned `README.md`/`OPERATIONS.md` (+ mirror) — clone-based install first-class + `harness upgrade` documented (CS63 deliverables 18, 20 subset).
6. `CHANGELOG.md` `[Unreleased]` entry for `harness upgrade` (CS63 deliverable 21 subset).

## User-approval gates

- **G-skill** — go/no-go on runtime-skill wrappers, decided after the CS64 spike (Q2 confirmed CLI-first).
- **G-release** — folds into the single CS63-arc minor release (confirmed); the new `harness upgrade` subcommand is the **minor**-bump trigger for the arc.

## Exit criteria

1. CS63 exit criteria **4** (`harness upgrade` dry-run preview + first-class clone install) and **6** (proposal records the skills + sizing decisions; `CONTEXT.md` capped; CS64/CS65 stubs filed) are met; CS63 exit **7** C63-11 disposition documented.
2. `harness lint --quiet` passes on self-host; `node --test tests/*.test.mjs` green; `sync --mode=check` no drift.
3. Plan-vs-implementation review (GPT-5.5 gate) returns GO.
4. CHANGELOG `[Unreleased]` entry present.

## Risks + open questions

Inherits CS63 risks **R7** (upgrade must be dry-run-only / no apply-path rewrite — data-loss avoidance), **R9** (deferred verbs tracked via CS64/65/66/67 — done), **R10** (CONTEXT cap is the only doc-sizing change here; OPERATIONS/LEARNINGS deferred to CS65). See CS63 § Risks for full text.

| # | Risk / what breaks | Mitigation |
|---|---|---|
| R1 | Shared `bin/harness.mjs` + docs also edited by CS63b → concurrent edits race (CS63 R11). | Orchestrator-owned; serialize shared-file edits between CS63b and CS63c (CS63 C63-10). |
| R2 | Capping `CONTEXT.md` "Prior" blocks could drop context a reader relies on. | Older detail already lives in `done_csNN` files (CS63 C63-9); keep current + last 2 blocks; no parser depends on the block count (verified in CS63 R-review). |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: yoga-ah-c3) | 6ccb66c6e054 | 2026-06-07T00:10:30Z | Go | Owns W4+W6 + W7 subsets; deliverables 11-17/21 assigned; shared bin/docs serialized vs CS63b; CS64/65/66/67 stubs verified filed. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| W4 — `lib/upgrade.mjs` (guided `harness upgrade` dry-run preview, additive over `lib/sync.mjs`) + `tests/lib-upgrade.test.mjs` | done | yoga-ah-c3 | implemented on `cs63c/content` (prior session); CS63 deliverables 11,12 |
| W4 — `bin/harness.mjs` `harness upgrade` registration + help (serialized vs CS63b per C63-10) | done | yoga-ah-c3 | on `cs63c/content`; needs rebase onto current main (CS63a/b bin/harness.mjs edits) |
| W6 — architectural-evaluation proposal artifact (CLI-first skills + OPERATIONS/LEARNINGS right-sizing + C63-11 disposition) in the `done_` dir | done | yoga-ah-c3 | `architectural-evaluation-proposal.md` authored at close-out; records CS63 C63-8/9/11 |
| W6 — `CONTEXT.md` history cap (current + last 2 "Prior" blocks) | done | yoga-ah-c3 | capped at close-out; older detail retained in `done_csNN` files |
| W4 — `README.md`/`OPERATIONS.md` (+ mirror) clone-install first-class + `harness upgrade` documented | done | yoga-ah-c3 | merged in PR #270 (squash `4d72b14`); OPERATIONS root + composed lockstep |
| CHANGELOG `[Unreleased]` entry for `harness upgrade` | done | yoga-ah-c3 | merged in PR #270; the minor-bump trigger for the arc |
| Content PR — GPT-5.5 rubber-duck + independent reviewer, CI green, squash-merge | done | yoga-ah-c3 | PR #270 (squash `4d72b14`); 8 gpt-5.5 (R1–R8) + 3 Copilot passes; CI green |
| Close-out: docs + restart state — update WORKBOARD, CONTEXT, relevant docs | done | yoga-ah-c3 | this close-out; CONTEXT capped + WORKBOARD updated |
| Close-out: learnings + follow-ups — file/disposition LEARNINGS and any planned follow-up CSs | done | yoga-ah-c3 | LRN-157 filed; CS64–CS67 stubs confirmed filed |

## Notes / Learnings

- **8 gpt-5.5 rubber-duck rounds (R1–R8) + 3 GitHub Copilot passes** on the
  content PR #270 caught 7 real issues: module-header doc-accuracy; an
  unguarded temp-clone leak on the success path; a temp-dir leak + empty error
  on fetch failure; a **non-provenance-safe** cleanup guard (a path-prefix
  check could delete an injected fixture) → redesigned the fetch seam to return
  `{path, cleanup}` so disposal is owned by the seam, never guessed by path; a
  `finally` cleanup-mask; a **leading-dash ref → git-option injection** vector
  (closed by requiring a leading alphanumeric in `REF_ALLOWLIST`, since `--` is
  not usable for `git checkout <tree-ish>`); and a test fixture using a
  non-existent sync action. → **LRN-157** (seam-owns-cleanup pattern).
- The architectural evaluations (C63-8/9/11) were **already-confirmed**
  decisions (Q2 user-confirmed 2026-06-06); this CS records them in the
  proposal artifact and executes only the safe `CONTEXT.md` cap (C63-9), with
  OPERATIONS/LEARNINGS right-sizing deferred to CS65 and the full lifecycle
  command/skill surface to CS64.

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | yoga-ah-c3 |
| Reviewer agent | rubber-duck |
| Notes | W4 code implemented on `cs63c/content` (prior session, claude-opus-4.8); W6 deliverables orchestrator-authored (claude-opus-4.8). Reviewer GPT-5.5 + independent reviewer per REVIEWS.md independence invariant. |

## Plan-vs-implementation review

**Reviewer:** gpt-5.5 (rubber-duck; orchestrator yoga-ah-c3)
**Date:** 2026-06-08
**Outcome:** GO

Reviewed the merged CS63c content (PR #270, squash `4d72b14`) against the six
plan deliverables. Deliverables 3 and 4 were noted by the reviewer as
`deferred-to-closeout` (the proposal artifact and `CONTEXT.md` cap are authored
in this close-out commit) — both are completed here.

| Deliverable | Status | Notes |
|---|---|---|
| 1. `lib/upgrade.mjs` + tests (additive over `lib/sync.mjs`) | match | `planUpgrade()` runs sync in `mode:'dry-run'`; tests cover filtering, version read, ref validation, seam cleanup, CLI help/errors, and R7 no-write. |
| 2. `bin/harness.mjs` `harness upgrade` registry + help | match | Present in `TOP_HELP`, `SUBCOMMAND_HELP.upgrade`, `cmdUpgrade`, `COMMAND_REGISTRY`. |
| 3. Proposal artifact in `done_cs63c_*/` | done at close-out | `architectural-evaluation-proposal.md` records C63-8/9/11 + the CS64/CS65 follow-up map. |
| 4. `CONTEXT.md` history cap (current + last 2 Prior) | done at close-out | Capped to current + 2 Prior; older detail retained in `done_csNN` files. |
| 5. README/OPERATIONS (+ mirror): clone-install + `harness upgrade` | match | README Option A + `## Upgrading`; OPERATIONS root + composed both carry `### Previewing an upgrade` (lockstep PASS). |
| 6. `CHANGELOG.md` `[Unreleased]` CS63c entry | match | Present under `### Added`. |

Exit criteria: (1) met; (2) `harness lint --quiet`, `node --test tests/*.test.mjs`,
and `sync --mode=check` all pass (verified by the reviewer); (3) this review = GO;
(4) CHANGELOG entry present. **R7 invariant verified** — `harness upgrade` passes
`mode:'dry-run'` to sync, exposes no apply path, and only removes its own temp
clone; no consumer-write path exists.
