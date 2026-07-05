# CS89 — Ship CODEOWNERS as a composed file (project local block) + secure-by-default ownership for `.github` / `SECURITY.md` / infra

**Status:** done
**Owner:** yoga-ah-c2
**Branch:** cs89/content
**Started:** 2026-07-05
**Closed:** 2026-07-05
**Filed by:** Triage of open inbound issue [#390](https://github.com/henrik-me/agent-harness/issues/390) (2026-07-02 by `omni-ah-c3`). Surfaced while evaluating adoption of v0.12.0's managed `.github/CODEOWNERS` in `henrik-me/sub-invaders`.
**Depends on:** none.

## Goal

Give consumers a "harness core + your additions" path for CODEOWNERS, and encode secure-by-default ownership on the highest-risk change surfaces. Today `CODEOWNERS` is a pure **`managed`** template (full overwrite, no local block) whose core is minimal (`* @{{default_codeowner}}` + `/lib/ @{{lib_codeowner}}`). A consumer that wants project-specific ownership (e.g. sub-invaders owns `/SECURITY.md`, `/.github/`, `/infra/`) can only keep CODEOWNERS **out of `managed.files`** — forgoing all harness updates. Reclassify it **composed** with a `codeowners.project` local block, and expand the managed core to require codeowner review on CI, security-policy, and infra paths.

## Background

Filed from inbound issue **#390** (state: open; verified via `gh issue view 390`).

Verified at HEAD `3b20d0a`:

- `template/managed/.github/CODEOWNERS` — the full managed template; body is exactly `* @{{default_codeowner}}` (L21) + `/lib/ @{{lib_codeowner}}` (L24), with a header documenting the placeholders `{{repo_owner}}`, `{{default_codeowner}}`, `{{lib_codeowner}}`.
- `harness.config.json:20` — `.github/CODEOWNERS` is listed under **`managed.files`** (not composed).
- `harness.config.json` — `templating` map currently defines `repo_owner` (`:96`), `default_codeowner` (`:99`), `lib_codeowner` (`:100`) (both codeowner keys default to `henrik-me` in self-host).
- The composed mechanism is established: `composed.files` + `composed.overrides[<file>].local_blocks` (e.g. `INSTRUCTIONS.md` → `instructions.harness`, `OPERATIONS.md` → `operations.project-deploy`; `harness.config.json:26-67`).
- **Marker-syntax constraint (blocking design fact — GPT-5.5 plan review R1):** the composed parser `lib/composed.mjs` (marker match ~L76-79, block extraction ~L112-117) recognizes **only** whole-line **HTML-comment** markers `<!-- harness:local-start id=<block-id> -->` / `<!-- harness:local-end id=<block-id> -->`; it has **no** `#`-comment marker support. GitHub parses CODEOWNERS with `#`-only comments, so a raw `<!-- … -->` line is an **invalid CODEOWNERS pattern**. A composed CODEOWNERS is therefore impossible until the parser learns a CODEOWNERS-safe (`#`-prefixed) marker form — a hard prerequisite (see C89-4), not a probe. The schema documents HTML markers at `schemas/harness.config.schema.json:217-219`.
- Templating is non-strict by default (LRN memory / `lib/templating.mjs`): a new placeholder needs a **sync-side default** merged under `templatingVars` in `lib/sync.mjs`, else consumers ship the literal `{{key}}`.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C89-1 | Reclassify CODEOWNERS | Move the template from `template/managed/.github/CODEOWNERS` to `template/composed/.github/CODEOWNERS`; remove `.github/CODEOWNERS` from `managed.files` and add it to `composed.files` in `harness.config.json`; register `composed.overrides[".github/CODEOWNERS"].local_blocks = ["codeowners.project"]`. Append the `codeowners.project` local block at the file end using the **`#`-comment marker form** added by C89-4 (a raw `<!-- … -->` marker would be an invalid CODEOWNERS line). | Gives every consumer the harness-owned core **and** its future updates while letting them add project rules with zero sync drift — the same tradeoff `INSTRUCTIONS.md`/`OPERATIONS.md` already resolve. |
| C89-2 | Secure-by-default core | Expand the managed core beyond `*` and `/lib/` to require codeowner review on: `/.github/`, `/.github/workflows/`, `/SECURITY.md`, and `/infra/`. Order rules so the most-specific/highest-risk win (CODEOWNERS: last match wins — place these AFTER `*`). | CI, security policy, and infra are the highest-risk paths in any repo; requiring owner review on them is a harness-worthy secure default, not project-specific. |
| C89-3 | New templating keys | Add `security_codeowner` and `infra_codeowner` templating keys, each **defaulting to `default_codeowner`** when unset, via a sync-side default merged into `templatingVars` in `lib/sync.mjs` (so consumers never ship a literal `{{security_codeowner}}`). Document the keys in the CODEOWNERS header + READMEGUIDE/templating docs as applicable. | Lets the secure defaults be tuned per project without forcing every consumer to define new keys; the non-strict-templating gotcha (LRN) mandates a sync-side default. |
| C89-4 | Extend the composed parser for a comment-safe marker form | Teach `lib/composed.mjs` to ALSO recognize a `#`-prefixed marker form — `# harness:local-start id=<block-id>` / `# harness:local-end id=<block-id>` — in addition to the existing `<!-- … -->` HTML form (do NOT remove or break the HTML form; every current composed file must keep working). Update `schemas/harness.config.schema.json` marker docs (`:217-219`) + the file-class/composed docs to describe both forms, and add unit tests (start/end pairing, id extraction, round-trip, HTML-form regression). Hard prerequisite for C89-1. | The parser today only matches HTML-comment markers, which are invalid CODEOWNERS lines; a `#`-comment marker is both parser-recognizable (once added) and CODEOWNERS-comment-safe. Making it a general parser feature (not a CODEOWNERS special-case) keeps it reusable for any future `#`-comment composed file. |
| C89-5 | Migration for BOTH consumer classes + self-host (regeneration, NOT append) | The CODEOWNERS **core is harness-authoritative** (only the `codeowners.project` block is consumer-owned), so the transition must **regenerate** the core, not preserve it. GPT-5.5 R2 finding: the `_inherited_class` shim treats the whole outside-block as consumer prose and only *appends* missing blocks (`lib/composed.mjs:886-890,976-980,998-1005`), so an existing managed adopter would keep the OLD minimal core and NOT receive the secure-default rules. Therefore the migration REGENERATES the file: **(a) consumers with `.github/CODEOWNERS` in `managed.files`** — move the entry to `composed.files`, then delete/regenerate the file so `sync` writes the fresh composed skeleton (secure-default core + empty `codeowners.project`), then re-add project rules into the block (safe: the old file was harness-managed, so no consumer content is lost); **(b) consumers keeping a custom CODEOWNERS out of `managed.files`** — first replace their file with the new composed skeleton (secure-default core + `codeowners.project` markers), then move their project rules INTO that block, add to `composed.files`, and sync (merely wrapping an arbitrary pre-existing file would still hit the composed skeleton-mismatch / `EMERGE_LEGACY_UNMAPPED` fail-closed). Self-host: regenerate the root `.github/CODEOWNERS` as a deliverable (avoids `EMERGE_LEGACY_UNMAPPED`, OPERATIONS § CS54b `:827-829`). | `_inherited_class`-append would silently skip the secure-default upgrade for existing adopters (R2); explicit regeneration guarantees every adopter gets the authoritative core while preserving their project block. |

## Deliverables

1. `lib/composed.mjs` — extend the marker parser to recognize the `#`-comment marker form (`# harness:local-start|end id=<block-id>`) alongside the existing `<!-- … -->` form, without breaking the HTML form (C89-4). *(lib/ change — this CS's explicit deliverable, so the "never touch lib/" rule is satisfied.)*
2. `template/composed/.github/CODEOWNERS` — new composed template: expanded secure-by-default managed core (C89-2) using `{{security_codeowner}}`/`{{infra_codeowner}}` + an empty `codeowners.project` local block wrapped in `#`-comment markers (C89-1); header documents all keys.
3. Deletion of `template/managed/.github/CODEOWNERS` (moved, not duplicated).
4. `harness.config.json` — `.github/CODEOWNERS` moved from `managed.files` to `composed.files`, with a `composed.overrides` entry registering `codeowners.project`; self-host `templating` gains `security_codeowner`/`infra_codeowner` (or relies on the C89-3 sync-side default). (Core is authoritative composed — **no `_inherited_class`**; the transition regenerates the file per C89-5.)
5. `lib/sync.mjs` — sync-side defaults for `security_codeowner`/`infra_codeowner` (= `default_codeowner`) merged into `templatingVars` (C89-3).
6. `schemas/harness.config.schema.json` + composed/file-class docs — document the new `#`-comment marker form (C89-4).
7. Tests: (a) `lib/composed.mjs` unit tests for the `#`-marker form (pairing, id extraction, round-trip) + a regression that the `<!-- … -->` form still works; (b) composed CODEOWNERS renders the secure-default rules; (c) unset `security_codeowner`/`infra_codeowner` fall back to `default_codeowner` (no literal `{{…}}`); (d) the `codeowners.project` block round-trips through `sync` with no drift; (e) the rendered CODEOWNERS contains no raw `<!-- … -->` line; (f) a transition fixture — an existing managed-CODEOWNERS consumer, after the documented regeneration migration, receives the secure-default core (NOT merely an appended empty block).
8. `CHANGELOG.md` `[Unreleased]` entry + migration notes for both consumer classes + self-host (C89-5). Closes #390.

## User-approval gates

- **G89-1** — confirm the four secure-default paths (`/.github/`, `/.github/workflows/`, `/SECURITY.md`, `/infra/`) and the two new key names before implementation, since they set a harness-wide default that lands in every consumer's CODEOWNERS on next sync.
  - **Resolved 2026-07-05 (yoga-ah-c2): APPROVED as-is.** The four paths and the two key names (`security_codeowner`, `infra_codeowner`) are confirmed as planned; `/SECURITY.md` is root-only (Q1 recommendation adopted). Mapping: `/.github/`, `/.github/workflows/`, `/SECURITY.md` → `@{{security_codeowner}}`; `/infra/` → `@{{infra_codeowner}}`. Both keys default to `default_codeowner` when unset (R4: solo repos see no functional change). Disposition made autonomously under the maintainer's explicit "work autonomously and make good decisions" delegation; the recommended set passed plan-review R1–R3 (R3 Go). Subject to maintainer review at the content PR.

## Exit criteria

1. `lib/composed.mjs` recognizes the `#`-comment marker form (unit-tested) and the HTML form still works; the rendered composed CODEOWNERS contains no raw `<!-- … -->` line and parses as valid CODEOWNERS.
2. `CODEOWNERS` is a composed file: managed core (incl. secure defaults) + a `codeowners.project` local block that survives `sync` with no drift.
3. `security_codeowner`/`infra_codeowner` resolve (default → `default_codeowner`); no literal `{{key}}` in rendered output.
4. The managed→composed transition is handled: the documented one-time **regeneration** delivers the secure-default core to existing adopters (fixture-verified — not merely an appended empty block), and the self-host first `sync` does not hit `EMERGE_LEGACY_UNMAPPED`; `harness sync --mode=check` clean on self-host after regeneration; `harness lint` passes; `node --test tests/*.test.mjs` green (incl. new assertions).
5. Migration notes for both consumer classes + self-host exist; `CHANGELOG.md` `[Unreleased]` updated. Plan-vs-implementation review (GPT-5.5) GO.

## Risks + open questions

| # | Risk / what breaks | Mitigation |
|---|---|---|
| R1 | Local-block markers are invalid CODEOWNERS pattern lines → GitHub CODEOWNERS parse errors. | Resolved by C89-4: add a `#`-comment marker form to `lib/composed.mjs`; deliverable 7(e) asserts the rendered file has no raw `<!-- … -->` line. |
| R2 | Non-strict templating ships a literal `{{security_codeowner}}` to consumers that don't define it. | C89-3: sync-side default in `lib/sync.mjs`; test asserts fallback (deliverable 7c). |
| R3 | Reclassify managed→composed either hard-fails first sync (`EMERGE_LEGACY_UNMAPPED`) or, via `_inherited_class`, silently preserves the OLD core so existing adopters miss the secure defaults (GPT-5.5 R2). | C89-5 mandates explicit **regeneration** of the authoritative core (config move + fresh skeleton), not `_inherited_class`-append; deliverable 7(f) fixture-tests that an existing adopter receives the secure defaults; self-host root regenerated as a deliverable. |
| R4 | Secure defaults could over-gate a solo consumer (everything already `* @owner`). | The added rules resolve to the same owner by default (all default to `default_codeowner`), so a solo repo sees no functional change until it sets distinct owners. |
| R5 | Adding a marker form to `lib/composed.mjs` is a general parser change touching every composed file's rendering. | Additive only (HTML form unchanged); deliverable 7(a) regression-tests the HTML form; the `#`-form only activates on files that actually carry `#`-markers. |
| Q1 | Should `SECURITY.md` be `/SECURITY.md` (root only) or `SECURITY.md` (any dir)? | Recommend `/SECURITY.md` (root, where it lives). Confirm at G89-1. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | cs89-plan-review (omni-ah-c3) | 4a5703b31022 | 2026-07-02T23:49:00Z | Needs-Fix | Marker blocker: lib/composed.mjs supports only HTML markers (invalid in #-comment CODEOWNERS); deleting managed CODEOWNERS breaks existing adopters + self-host first sync (EMERGE_LEGACY_UNMAPPED). |
| R2 | gpt-5.5 | claude-opus-4.8 | cs89-review-r2 (omni-ah-c3) | 71e3c5e3098c | 2026-07-03T00:05:00Z | Needs-Fix | _inherited_class shim is append-only (preserves consumer prose), so migrated managed adopters keep the OLD minimal core and never receive the secure defaults. |
| R3 | gpt-5.5 | claude-opus-4.8 | cs89-review-r3 (omni-ah-c3) | ea308fd60e38 | 2026-07-03T00:22:00Z | Go-with-amendments | R1/R2 resolved: #-marker parser support + mandated core REGENERATION (not _inherited_class-append) + transition fixture. Minor applied: custom adopters copy skeleton first, then wrap rules. |

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | yoga-ah-c2 |
| Reviewer agent | rubber-duck (orchestrator: yoga-ah-c2) |
| Notes | Provisional at claim; finalized at close-out. Independence per REVIEWS.md § 2.3 — reviewer `gpt-5.5` ≠ implementer `claude-opus-4.8`. SemVer **Minor** (provisional): additive `#`-comment composed-marker form (HTML form preserved) + new `security_codeowner`/`infra_codeowner` templating keys + CODEOWNERS reclassified managed→composed. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| C89-4: extend `lib/composed.mjs` marker parser to ALSO recognize the `#`-comment marker form (`# harness:local-start\|end id=<id>`) without breaking the HTML form; **mirror the same `#`-form into `scripts/check-composed-blocks.mjs`'s duplicate parser** (harness lint runs it per composed file — plan gap, see Notes); update `schemas/harness.config.schema.json` marker docs (`:217-219`) + `docs/adr/0001-file-classes.md` § Composed marker syntax | done | cs89-impl | agent-id=cs89-impl \| role=implementer \| report-status=complete \| learnings=0 |
| C89-1/C89-2: add `template/composed/.github/CODEOWNERS` (secure-default core `/.github/`, `/.github/workflows/`, `/SECURITY.md`, `/infra/` + empty `codeowners.project` `#`-marker block); delete `template/managed/.github/CODEOWNERS` | done | cs89-impl | agent-id=cs89-impl \| role=implementer \| report-status=complete \| learnings=0 |
| C89-1/C89-3: `harness.config.json` move `.github/CODEOWNERS` managed→composed + `composed.overrides` `codeowners.project`; add `security_codeowner`/`infra_codeowner` templating keys; `lib/sync.mjs` sync-side defaults (= `default_codeowner`) | done | cs89-impl | agent-id=cs89-impl \| role=implementer \| report-status=complete \| learnings=0 |
| C89-5: regenerate self-host root `.github/CODEOWNERS`; migration notes for both consumer classes + self-host (regeneration, not append) | done | cs89-impl | agent-id=cs89-impl \| role=implementer \| report-status=complete \| learnings=0 |
| Tests 7(a–f): `#`-marker pairing/id/round-trip + HTML-form regression; secure-default render; templating fallback (no literal `{{…}}`); `codeowners.project` sync no-drift; no raw `<!-- … -->` line; managed→composed transition fixture | done | cs89-impl | agent-id=cs89-impl \| role=implementer \| report-status=complete \| learnings=0 |
| CHANGELOG.md `[Unreleased]` entry + migration notes (closes #390) | done | cs89-impl | agent-id=cs89-impl \| role=implementer \| report-status=complete \| learnings=0 |
| Local review — GPT-5.5 rubber-duck (independence invariant per REVIEWS.md) | planned | — | role=reviewer \| report-status=pending \| learnings=0 |
| Close-out: docs + restart state (WORKBOARD + CONTEXT + handoff) | planned | — | report-status=pending \| learnings=0 |
| Close-out: learnings + follow-ups (LEARNINGS.md) | planned | — | report-status=pending \| learnings=0 |

## Notes / Learnings

(filled during execution)

- **Plan gap found at dispatch (yoga-ah-c2, 2026-07-05):** deliverable 1 named only `lib/composed.mjs`, but `harness lint` invokes `scripts/check-composed-blocks.mjs --file .github/CODEOWNERS --allowed-ids codeowners.project` for every composed file (bin/harness.mjs:2754-2770), and that linter carries its **own** HTML-only marker parser (`scripts/check-composed-blocks.mjs:114-116` `MARKER_EXACT_RE`/`MARKER_CONTAINS`), which would not see the `#`-marker block → "required block codeowners.project missing" lint failure. Resolution: mirror the same additive `#`-form into that duplicate parser (in-scope fix — direct consequence of the composed reclassification). Learning candidate: two hand-synced marker parsers (`lib/composed.mjs` + `scripts/check-composed-blocks.mjs`) are a duplication hazard; a future CS could DRY them (the sibling `scripts/check-consumer-template-genericity.mjs` already imports `parseComposed`).
- **Migration mechanics verified (read-only source review):** `sync.driftDetected` derives ONLY from content `isDrift` (lib/sync.mjs:1341,1347), NOT from a lock class change — so moving `.github/CODEOWNERS` managed→composed and regenerating the self-host root to byte-match the composed render keeps `sync --mode=check` clean with `.harness-lock.json` left at `main` (LRN-201 precedent). Without `_inherited_class`, sync uses `mergeComposed` (template skeleton canonical, lib/sync.mjs:1311-1327); a deleted/empty consumer file hits the fresh-start path (template verbatim, composed.mjs:656-676) = the regeneration path C89-5 mandates.

## Plan-vs-implementation review

**Reviewer:** GPT-5.5 (rubber-duck; independent sub-agent `cs89-pvi` — model ≠ implementer `claude-opus-4.8`)
**Date:** 2026-07-05T16:44:11Z
**Outcome:** GO

Reviewed the merged content (squash `6bc0c86`, base `1a4ebe4`) against the 8 Deliverables + 5 Exit criteria. Observed on merged `main`: `harness sync --mode=check --cwd .` → No drift detected (exit 0); `harness lint --quiet` → 38 passed / 0 failed / 3 skipped (exit 0); `node --test tests/*.test.mjs` → 1983 tests, 1978 pass / 0 fail / 5 skipped, 218 suites (exit 0).

**Per-deliverable outcome (8/8 `match`):**

| # | Deliverable | Outcome | Rationale |
|---:|---|---|---|
| 1 | `lib/composed.mjs` `#`-marker parser | match | Parser recognizes whole-line `# harness:local-start/end id=...` alongside the unchanged HTML markers, with unit coverage for pairing, IDs, round-trip, and HTML regression. |
| 2 | New `template/composed/.github/CODEOWNERS` composed template | match | Template contains the expanded secure-default core, `{{security_codeowner}}`/`{{infra_codeowner}}`, and an empty `codeowners.project` block using `#` markers. |
| 3 | Delete `template/managed/.github/CODEOWNERS` | match | The managed template is absent; the replacement lives under `template/composed/.github/CODEOWNERS`. |
| 4 | `harness.config.json` managed→composed move + overrides + templating keys | match | `.github/CODEOWNERS` is in `composed.files`, registered with `codeowners.project`, removed from `managed.files`, relying on the approved sync-side defaults. |
| 5 | `lib/sync.mjs` sync-side defaults | match | `computeCodeownerDefaults` defaults both new owner keys to `default_codeowner`, merged under `config.templating` so explicit consumer values win. |
| 6 | Schema + composed/file-class docs document `#` markers | match | `schemas/harness.config.schema.json` and `docs/adr/0001-file-classes.md` describe both the HTML and comment-safe `#` marker forms. |
| 7 | Tests 7(a–f) | match | CS89 tests cover parser `#` markers + HTML regression, secure render, fallback/no literal placeholders, block round-trip/no drift, no raw HTML marker, and regeneration transition behavior. |
| 8 | CHANGELOG `[Unreleased]` + migration notes, closes #390 | match | `CHANGELOG.md` documents CS89 under `[Unreleased]` with migration notes for managed adopters, custom adopters, and self-host, and states Closes #390. |

**Exit criteria (5/5 met):**

- [x] 1. `#` marker form works, HTML form still works, rendered CODEOWNERS has no raw `<!-- … -->` (parser + CODEOWNERS tests; root/template `#` markers).
- [x] 2. CODEOWNERS is composed with a secure managed core plus a surviving `codeowners.project` block (`harness.config.json`, template + root CODEOWNERS, `sync --mode=check` no-drift).
- [x] 3. `security_codeowner`/`infra_codeowner` resolve with default fallback, no literal placeholders (`computeCodeownerDefaults`; rendered root owners `@henrik-me`; fallback tests).
- [x] 4. Managed→composed regeneration + self-host validation clean (transition fixture; `sync --mode=check` no-drift, `lint` 38/0/3, tests 1978 pass/0 fail).
- [x] 5. Migration notes + CHANGELOG exist; PVI outcome GO.

**Test-coverage assessment:** sufficient — deliverable 7(a–f) covered by `tests/cs89-hash-marker.test.mjs`, `tests/cs89-codeowners-composed.test.mjs`, and `tests/cs89-check-composed-blocks.test.mjs`; no blocker gaps.
