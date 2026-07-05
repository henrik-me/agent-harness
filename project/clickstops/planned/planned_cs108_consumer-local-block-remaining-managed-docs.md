# CS108 — Consumer local-block extension for the remaining managed docs (TRACKING.md / RETROSPECTIVES.md / READMEGUIDE.md)

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
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
| (populated at claim time per § Claim) | planned | — | — |

## Notes / Learnings

## Plan-vs-implementation review

> _(filled at close-out per the gate)_
