# CS108 — Consumer local-block extension for the remaining managed docs (TRACKING.md / RETROSPECTIVES.md / READMEGUIDE.md)

**Status:** active
**Owner:** yoga-ah-c2
**Branch:** cs108/content
**Started:** 2026-07-05
**Closed:** —
**Filed by:** yoga-ah (orchestrator, Claude Opus 4.8) — triage of untriaged inbound issue [#408](https://github.com/henrik-me/agent-harness/issues/408) (2026-07-05). Surfaced while operating v0.12.0 in the consumer repo `henrik-me/authzandentitlements`. Directed by @henrik-me ("triage the issues, identify how to address each, such as filing CS's").
**Depends on:** none. (Related: [#390](https://github.com/henrik-me/agent-harness/issues/390) / CS89 — the sibling CODEOWNERS-as-composed reclassification. CS108 covers the **markdown** docs, which reuse the existing HTML-comment marker form, so it does **not** depend on CS89's new CODEOWNERS `#`-comment marker.)

## Goal

Give consumers a "harness core + your additions" path for the three remaining full-overwrite **`managed`** markdown docs — `TRACKING.md`, `RETROSPECTIVES.md`, `READMEGUIDE.md` — by reclassifying them **`composed`** with one allowlisted consumer local block each (`tracking.project`, `retrospectives.project`, `readmeguide.project`). Together with #390/CS89 this closes the "managed files have no consumer extension point" gap so every harness-shipped file a consumer might reasonably annotate offers a `harness core + your additions` path. The managed core stays authoritative (overwritten on every `harness sync`); only the allowlisted local block is consumer-owned.

## Background

- Filed from inbound issue **#408** (state: open; verify via `gh issue view 408` at claim-time HEAD).
- Verified at HEAD `1d01eac`:
  - `harness.config.json` `managed.files` includes `TRACKING.md`, `RETROSPECTIVES.md`, `READMEGUIDE.md`.
  - `composed.files` = `INSTRUCTIONS.md`, `CONVENTIONS.md`, `OPERATIONS.md`, `REVIEWS.md`, `.github/copilot-instructions.md`, `.github/pull_request_template.md`; each has a `composed.overrides[<file>].local_blocks` entry (e.g. `INSTRUCTIONS.md` → `["instructions.harness"]`).
  - The composed-markdown pattern (HTML-comment `<!-- harness:local-start id=X -->` / `<!-- harness:local-end id=X -->` markers) is already used by all six composed files and parsed by `lib/composed.mjs`.
- Because these three are markdown docs, they reclassify with the shipped, tested HTML-comment marker mechanism — no CS89-style CODEOWNERS `#`-comment marker innovation is needed.
- **Secondary #408 ask (managed CI workflows have no extension point):** consumers already have an escape valve — add a **separate, non-managed** workflow file (e.g. a project `dotnet build`/`test` job) that `harness sync` never touches. CS108 documents that escape valve; it does **not** add a composed-YAML block (out of scope — lower priority per the issue; workflows are not single-instance like the docs).

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Scope | Reclassify the three `managed` markdown docs (`TRACKING.md`, `RETROSPECTIVES.md`, `READMEGUIDE.md`) → `composed`, each with one consumer local block. The secondary managed-workflow ask is addressed by **documenting the existing escape valve** (a separate non-managed workflow file), not by a composed-YAML block. | Closes the docs half of the #408 gap with the proven composed pattern; the workflow half already has an escape valve, so a composed-YAML block is unwarranted complexity. |
| 2 | Marker form | Reuse the existing HTML-comment markers (`<!-- harness:local-start id=X -->` / `-end`), already parsed by `lib/composed.mjs` for markdown. | These are markdown docs; no need for CS89's CODEOWNERS-specific `#`-comment marker. Reuse the shipped, tested mechanism the other six composed docs use. |
| 3 | Local-block ids + placement | `tracking.project`, `retrospectives.project`, `readmeguide.project`; one **empty** block appended at the end of each doc's composed base, mirroring the existing composed-doc convention (e.g. `instructions.harness`). | Consistent `<doc>.project` naming + placement with the six existing composed files; empty-by-default so consumers add content with zero core drift. |
| 4 | Migration | `sync` builds from the consumer's `managed.files`/`composed.files` and throws `ESYNC_MISSING_TEMPLATE` if a listed `managed.files` entry's `template/managed/` source is gone (`lib/sync.mjs`), and `--apply-new` adopts only **new** absent managed files — **not** a managed→composed reclassification. So the implementation MUST (a) make `sync` **fail closed with a clear migration message** when it detects a now-reclassified doc still in the consumer's `managed.files` ("move `TRACKING.md`/… to `composed.files`"), never a raw `ESYNC_MISSING_TEMPLATE` stack trace; and (b) document the one-line config edit in the adoption note + CHANGELOG. Fresh `init` ships the docs as `composed` from the start. | `--apply-new` cannot auto-reclassify (per `lib/sync.mjs` semantics); an explicit, tested migration message + documented config edit is the safe, non-silent-breaking path. |
| 5 | SemVer | **Minor** — additive consumer local block + file-class reclassification, **gated by** the tested graceful-migration message (Decision 4) so no consumer `sync` silently breaks. | A documented, guided one-line config migration keeps it backward-compatible in practice; a raw `ESYNC_MISSING_TEMPLATE` would make it breaking, which Decision 4 prevents. |

## Deliverables

1. **`harness.config.json`** — move `TRACKING.md` / `RETROSPECTIVES.md` / `READMEGUIDE.md` from `managed.files` to `composed.files`; add `composed.overrides` entries with `local_blocks: ["tracking.project"]` / `["retrospectives.project"]` / `["readmeguide.project"]`.
2. **`template/composed/TRACKING.md`, `template/composed/RETROSPECTIVES.md`, `template/composed/READMEGUIDE.md`** — the composed bases (the current managed content plus an appended empty local-block marker pair). Remove the corresponding `template/managed/` copies.
3. **Root `TRACKING.md` / `RETROSPECTIVES.md` / `READMEGUIDE.md`** — re-rendered (self-host) with the empty local block; `harness sync --mode=check` reports no drift.
4. **Tests** — composed reclassification round-trips: each doc passes through `harness sync` with a **populated** local block preserved while the managed core is overwritten.
5. **Docs** — a short note (in `OPERATIONS.md` + composed mirror, or `READMEGUIDE.md`) documenting the managed-workflow escape valve (add a separate non-managed workflow file that `harness sync` never touches).
6. **`CHANGELOG.md` `[Unreleased]`** entry (Minor — file-class reclassification + new consumer local blocks; consumer-visible on the next sync, with the one-line `managed.files`→`composed.files` migration called out).
7. **Existing-consumer migration handling** — `lib/sync.mjs` detects a reclassified doc still listed in a consumer's `managed.files` (its `template/managed/` source now absent) and emits a clear, **fail-closed migration message** ("move `TRACKING.md`/`RETROSPECTIVES.md`/`READMEGUIDE.md` to `composed.files`") instead of the raw `ESYNC_MISSING_TEMPLATE` error; plus a test (un-migrated config → the migration message; migrated config → `sync` succeeds with a populated local block preserved and the managed core overwritten).
8. **Guard/linter updates** — update `scripts/check-consumer-template-genericity.mjs` (hard-codes these three docs as `template/managed/…` and fail-closes on a missing in-scope doc) and `scripts/check-doc-xref-resolvability.mjs` (hard-codes them as managed paths) to reference the new `template/composed/…` paths, with fixtures + tests updated; `harness lint` green.

## User-approval gates

- None gating (triage-directed). Escalate if reclassification would overwrite an existing consumer's synced content — it should not, since the local block ships empty and the managed core is unchanged.

## Exit criteria

- The three docs are `composed` with a `<doc>.project` local block; `harness sync --mode=check` no drift; a populated local block survives a re-sync (test-verified); the managed-workflow escape-valve note is present; CHANGELOG entry added; `harness lint` + full `node --test` green.

## Risks + open questions

- Reclassification changes the file class in `harness.config.json`; a consumer who used the #408 workaround (dropping these from `managed.files`) must re-add them to `composed.files` on adoption — document this in the adoption note, and surface the guided migration message (Deliverable 7) for a consumer who still lists them in `managed.files`.
- The new composed bases must not ship dangling cross-references — the CS76/CS81 `check-doc-xref-resolvability` guard (and the CS72 `check-consumer-template-genericity` guard) both **hard-code these three docs as `template/managed/…` and fail-closed** on a missing in-scope doc, so Deliverable 8's guard/fixture updates are a hard prerequisite for a green `harness lint` — not optional cleanup.
- Open question: does `READMEGUIDE.md` (an onboarding doc) warrant a local block, or is a project onboarding note better placed in an already-composed file? Resolve at claim-time; the issue explicitly requests all three.

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | rubber-duck (background, yoga-ah) | ae16eb78d368 | 2026-07-05T05:22:02Z | Needs-Fix | 2 blocking: removing template/managed docs breaks existing-consumer sync (ESYNC_MISSING_TEMPLATE; --apply-new doesn't reclassify); genericity+xref guards hard-code docs as managed paths. |
| R2 | gpt-5.5 | claude-opus-4.8 | rubber-duck (background, yoga-ah) | 425eb3c2e387 | 2026-07-05T05:31:02Z | Go | Both R1 blockers resolved: D4/D5/D7 fail-closed migration message + test; D8 updates genericity+xref guards to composed paths. No findings. |

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | yoga-ah |
| Reviewer agent | rubber-duck (orchestrator: yoga-ah) |
| Notes | Filing-only triage of #408. Minor SemVer (file-class reclassification + new consumer local blocks). Independence per REVIEWS § 2.3 — reviewer `gpt-5.5` ≠ implementer `claude-opus-4.8`. Finalized at close-out. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| D1: reclassify 3 docs managed→composed in `harness.config.json` (+ `composed.overrides` local_blocks) | done | yoga-ah-c2 | `tracking.project` / `retrospectives.project` / `readmeguide.project`; no `_inherited_class` |
| D2: create `template/composed/{TRACKING,RETROSPECTIVES,READMEGUIDE}.md` (managed content + empty local block); remove `template/managed/` copies | done | yoga-ah-c2 | composed banner + footer reworded; HTML-comment markers |
| D3: re-render root docs; `harness sync --mode=check` no drift | done | yoga-ah-c2 | fresh-start regeneration; no drift |
| D4/D7: `lib/sync.mjs` fail-closed migration message for reclassified doc still in `managed.files` + test | done | yoga-ah-c2 | `ESYNC_RECLASSIFIED_TO_COMPOSED` (general) |
| D4/D8: update `check-consumer-template-genericity.mjs` + `check-doc-xref-resolvability.mjs` to composed paths (+ fixtures/tests) | done | yoga-ah-c2 | both scope sets + CHECK_C_DOCS + headers |
| D4/D8: composed reclassification round-trip tests (populated local block preserved, core overwritten) | done | yoga-ah-c2 | `tests/cs108-composed-reclassification.test.mjs` |
| D5: managed-workflow escape-valve doc note | done | yoga-ah-c2 | `OPERATIONS.md § Extending managed CI workflows` (+ composed mirror) |
| D6: `CHANGELOG.md` `[Unreleased]` entry (Minor) | done | yoga-ah-c2 | migration + escape valve called out |
| Fix stale guard `--help` text in `bin/harness.mjs` (orchestrator patch) | done | yoga-ah-c2 | escalation (c): managed→composed paths in the two linter help blocks |
| Validation: `harness lint` + `node --test` + `sync --mode=check` green | done | yoga-ah-c2 | lint 41/0/3; tests 1995 pass/0 fail/5 skip; sync check no drift |
| Close-out: docs + restart state — update `WORKBOARD.md`, `CONTEXT.md`, process templates + rendered roots | planned | yoga-ah-c2 | mandatory close-out row |
| Close-out: learnings + follow-ups — file/disposition learnings in `LEARNINGS.md`, file follow-up CSs | planned | yoga-ah-c2 | mandatory close-out row |

## Notes / Learnings

### Implementation (2026-07-05)

**Execution model.** Implementation dispatched to a background general-purpose sub-agent (`cs108-impl`, model `claude-opus-4.8`) with the canonical dispatch preamble; orchestrator (`yoga-ah-c2`) reviewed the diff, applied the `bin/harness.mjs` help-text patch (escalation c), staged, and committed. Independent review is a separate reviewer sub-agent (model ≠ implementer) per REVIEWS.md § Phase 2.

**Design (per CS89 CODEOWNERS precedent).** The three docs became NORMAL composed files (no `_inherited_class`): harness owns the core, consumer owns only the `<doc>.project` block. Because the composed base core = the same managed prose (only the top banner + footer reworded, empty block appended), the managed→composed transition is a **regeneration** — an existing consumer must delete/empty the on-disk doc before sync (else `mergeComposed` fails closed with `EMERGE_LEGACY_UNMAPPED`). Deliverable 7's `ESYNC_RECLASSIFIED_TO_COMPOSED` message handles the un-migrated (`still in managed.files`) case with an actionable message instead of a raw `ESYNC_MISSING_TEMPLATE`.

**Sub-agent decisions accepted.**
- `template/seeded/harness.config.json` also moved the 3 docs to composed (fresh-`init` parity, Decision 4; `managed.files` now `[]`). Init tests (cs09) updated. Accepted.
- Root `OPERATIONS.md` was deleted + regenerated (not auto-adopted): its lock `template_prose_hash` was pre-existingly stale vs the actual root skeleton, so the template edit could not auto-adopt. The `operations.project-deploy` block held only the default placeholder → no consumer content lost; regeneration corrected the stale lock hash.

**Learnings candidates (for close-out → LEARNINGS.md).**
- process/file-class: fresh-`init` classifications live in `template/seeded/harness.config.json`, a SEPARATE source from the self-host `harness.config.json`; both must be updated on any reclassification or init tests (cs09/CS15e/CS15d) fail.
- tooling: `harness lint`'s text-encoding check runs in git mode (`git ls-files`), so a tracked-file move fails it with read-errors until the moves are staged; `--no-respect-gitignore` filesystem-walk mode confirms disk cleanliness. (Resolved at commit-stage.)
- data-integrity: `.harness-lock.json` `template_prose_hash` for `OPERATIONS.md` was latently stale vs the root skeleton (only passed check because template==root was byte-identical, short-circuiting the divergence branch). Worth auditing other composed lock entries for the same latent staleness (candidate follow-up CS).

## Plan-vs-implementation review

**Reviewer:** gpt-5.5 (rubber-duck, independent — implementer was claude-opus-4.8)
**Date:** 2026-07-05T18:25:00Z
**Outcome:** GO

CS108 matches the planned implementation intent as merged (content PR #507, squashed to `33691cb`); validation is green with only non-blocking test-shape gaps noted.

| Deliverable | Outcome | Evidence / rationale |
|---|---|---|
| D1 — self-host `harness.config.json` reclassification | match | The three docs are removed from `managed.files`, added to `composed.files`, with `tracking.project` / `retrospectives.project` / `readmeguide.project` overrides (no `_inherited_class`). |
| D2 — composed template bases + managed removal | match | `template/composed/{TRACKING,RETROSPECTIVES,READMEGUIDE}.md` exist with the expected local markers; old `template/managed/` copies absent. |
| D3 — root re-render / no drift | match | Root docs include the empty local blocks; `harness sync --mode=check --cwd .` reports "No drift detected." |
| D4 — tests | diverged | Covers per-doc config/base-parse/`mergeComposed` preservation + a sync-level migrated happy path, but the sync-level test uses a synthetic `TESTDOC.md` rather than running `sync()` for each of the three real docs. Non-blocking: the generic sync path and per-doc composed invariants are covered. |
| D5 — managed-workflow escape-valve doc note | match | `OPERATIONS.md` (+ composed mirror) include "Extending managed CI workflows (escape valve)". |
| D6 — CHANGELOG `[Unreleased]` entry | match | Minor CS108 entry with reclassification, migration instructions, and escape-valve note. |
| D7 — fail-closed migration message + test | match | `lib/sync.mjs` emits `ESYNC_RECLASSIFIED_TO_COMPOSED`; tests assert the message path + raw `ESYNC_MISSING_TEMPLATE` fallback. |
| D8 — guard-script updates + fixtures/tests | match | Genericity + xref scripts/help text reference `template/composed/...`; related tests updated; `harness lint` green. |
| Fresh-init parity — `template/seeded/harness.config.json` | added | Seeded config now ships the three docs as composed with overrides (avoids init/config drift). |
| `bin/harness.mjs` help-text fix | added | Linter `--help` text points at composed paths (CLI diagnostics consistent with the reclassification). |

**Test-coverage assessment:** gaps (non-blocking) — no per-real-doc sync-level round-trip test (per-doc coverage is at `mergeComposed` level; full `sync()` preservation tested with synthetic `TESTDOC.md`); the un-migrated migration-message test exercises `TRACKING.md` only (implementation is generic; other two covered by invariants). Validation: `node --test tests/*.test.mjs` 2001 tests / 1996 pass / 0 fail / 5 skip; `harness lint` 41/0/3; `sync --mode=check` no drift.
