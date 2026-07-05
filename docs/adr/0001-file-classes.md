# 0001 — Three file classes for harness sync

**Date:** 2026-05-03
**Status:** Accepted

---

## Status

Accepted. Decision #13 in the
[CS plan](../../project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md).
Locked at CS02; this ADR codifies a decision that was made during planning and refined via
GPT-5.5 review before any engine code was written. See also
[ADR 0002](0002-readme-ownership.md) for the complementary decision on project-owned files
that are excluded from sync entirely.

---

## Context

The harness syncs a set of process-and-policy documents from a central template repository
into every consumer repo via `harness sync`. Consumer repos are diverse — a game project,
a game-engine-style harness repo itself, and future projects — so the harness must
accommodate at least three distinct ownership relationships between a file and the harness:

### Need 1 — Fully managed process docs

Some files are pure harness property. They represent the process the harness enforces:
`INSTRUCTIONS.md`, `OPERATIONS.md`, `REVIEWS.md`, `TRACKING.md`, `RETROSPECTIVES.md`, and
the docs linters. When the harness ships a new version, these files must be overwritten in
the consumer repo without ceremony. The consumer has no legitimate reason to edit them
directly; any project-specific configuration is expressed through `harness.config.json`.

A simple overwrite on every sync satisfies this category.

### Need 2 — Docs with a managed core and a project-specific extension

`CONVENTIONS.md` is the canonical example. The harness owns the sections that are
universally true across all consumers (code style, git policy, cross-link rules). The
consumer project owns sections that are genuinely project-specific (e.g. "our database
schema convention", "our UI component naming rules", "our Azure resource naming scheme").

A plain overwrite would destroy the project extension on every sync. Skipping the file
entirely would let the harness-owned sections drift. Neither is acceptable.

What is needed is a merge: the harness applies its template sections verbatim and preserves
demarcated local blocks exactly as the consumer left them. This requires a structured marker
convention and a hardened parser.

### Need 3 — Project state docs that are seeded once

`CONTEXT.md`, `ARCHITECTURE.md`, `LEARNINGS.md`, and `WORKBOARD.md` are populated entirely
by the project team. The harness provides a starting skeleton (structure, headings,
placeholder text) but must never overwrite the file once it exists. Overwriting would
destroy real project history and state.

A create-if-missing (seed once, then hands off) model satisfies this category.

### Why a single strategy fails

| Strategy | Need 1 | Need 2 | Need 3 |
|---|---|---|---|
| Always overwrite | ✅ | ❌ destroys extensions | ❌ destroys state |
| Never overwrite | ❌ harness sections drift | ❌ harness sections drift | ✅ |
| Ask per file | ❌ breaks automation | ❌ per-field merge needed | ✅ |
| **Three classes** | ✅ | ✅ | ✅ |

---

## Decision

### Three file classes

**`managed`** — On every `harness sync`, the target file is overwritten unconditionally
with the rendered template. The consumer is not expected to edit managed files. Project
configuration is expressed through `harness.config.json` + `templating` substitution
variables, not by editing the file directly. Drift between the on-disk file and the
rendered template is flagged by `harness sync --check`.

**`composed`** — On every `harness sync`, the harness renders the template sections and
splices in the consumer's preserved local blocks. The template defines *slots* using HTML
comment markers with stable IDs; the consumer fills those slots. The harness never touches
the block contents; the consumer never touches the template sections. Both sides evolve
independently. See [Composed marker syntax and parser rules](#composed-marker-syntax-and-parser-rules) below.

**`seeded`** — On first `harness init` (or the first `harness sync` that encounters a
missing file), the target file is created from the template. On every subsequent sync, if
the file already exists, it is left completely untouched. The consumer owns the file from
the moment it exists.

**Project-owned (out of scope for this ADR)** — A fourth category covers files the
consumer has explicitly declared as project-owned (e.g. `README.md` in the harness repo
itself). These are excluded from sync entirely and appear in the lock file's `excluded[]`
array. See [ADR 0002](0002-readme-ownership.md).

### File-class declaration

File classes are declared in `harness.config.json` via three top-level **objects** (one per class). Each object has a required `files` array of paths (relative to the consumer repo root) and an optional `overrides` object for per-file configuration. The schema (`schemas/harness.config.schema.json`) is the authoritative spec.

```json
{
  "managed": { "files": ["INSTRUCTIONS.md", "TRACKING.md", "RETROSPECTIVES.md"] },
  "composed": {
    "files": ["CONVENTIONS.md", "OPERATIONS.md", "REVIEWS.md"],
    "overrides": {
      "CONVENTIONS.md": { "local_blocks": ["conventions.project"] },
      "OPERATIONS.md": { "local_blocks": ["operations.project-deploy"] },
      "REVIEWS.md":   { "local_blocks": ["reviews.project-gates"] }
    }
  },
  "seeded":   { "files": ["CONTEXT.md", "ARCHITECTURE.md", "LEARNINGS.md", "WORKBOARD.md"] }
}
```

Globs are **NOT** interpreted in `files` arrays — list paths explicitly. The harness validates that every file in `template/managed/`, `template/composed/`, and `template/seeded/` is covered by exactly one class entry in the consumer's config. Files not covered by any class entry and not in the top-level `excluded[]` array cause `harness sync` to exit non-zero.

---

## Composed marker syntax and parser rules

### Marker format

Local blocks are delimited by a pair of HTML comment markers (the markers below are escaped with a leading zero-width-space `​` to prevent this ADR file itself from being parsed as containing live markers — see § Error rules):

```md
<​!-- harness:local-start id=conventions.project -->
...consumer-authored content...
<​!-- harness:local-end id=conventions.project -->
```

Two whole-line marker forms are recognized (CS89). The **HTML-comment form** above suits Markdown/HTML files. For files where an HTML comment is an **invalid line** — e.g. CODEOWNERS or other `.gitignore`-style files whose only comment syntax is `#` — the parser also recognizes an equivalent **comment-safe `#`-form** (escaped below with a zero-width-space after the `#`, for the same reason as the HTML example above):

```md
#​ harness:local-start id=codeowners.project
...consumer-authored content...
#​ harness:local-end id=codeowners.project
```

The `id` attribute identifies the block. IDs are stable across harness versions; they
appear in the lock file and in `harness.config.json` → `composed.overrides[<file>].local_blocks` (per-file allowlist).

### Parser rules (normative — identical to `lib/composed.mjs` per CS03)

A line is **recognised as a valid local-block marker** — in either the
HTML-comment form or the comment-safe `#`-form — only when ALL of the following hold:

1. **Whole-line:** the marker occupies the full line except for optional leading/trailing
   ASCII whitespace.
2. **Outside any code block:** the parser tracks open/close fences (a fence opens on a line
   that begins, after optional indentation ≤ 3 spaces, with ` ``` ` or `~~~` and closes on
   the next line matching the same sequence) AND tracks indented code blocks (a line with 4
   or more leading spaces).
3. **Valid `id`:** the `id` attribute matches the regex `[a-z][a-z0-9.-]*` (lowercase
   ASCII letter first; then lowercase letters, digits, `.`, or `-`).
4. **Matching start/end IDs:** every `<​!-- harness:local-start id=X -->` is paired with
   `<​!-- harness:local-end id=X -->` for the same `X`.

A line **inside a fenced or indented code block** that *looks like* a marker (matches the
marker shape but appears in a code-block context) is **NOT recognised as a valid marker
and is NOT silently ignored**. Per cs-plan CS03 fail-closed semantics, the parser **rejects
the file** in this case unless the marker syntax is escaped. See § Error rules.

### Error rules (fail-closed)

The parser exits non-zero (and refuses to write any output) on:

| Error | Example |
|---|---|
| Unclosed block | `local-start` with no matching `local-end` before EOF |
| Duplicate block ID | Two `local-start` markers with `id=conventions.project` |
| Dropped block | Lock file records `id=X`; template still contains the marker; current file has no block `X` |
| Nested local blocks | `local-start id=A` followed by `local-start id=B` before `local-end id=A` |
| Malformed marker (ID regex fail) | `<​!-- harness:local-start id=My Block -->` |
| Orphan end marker | `local-end id=X` with no preceding `local-start id=X` |
| **Marker-looking text inside a fenced or indented code block, not escaped** | An unescaped marker appearing inside a code fence in template or consumer content |
| Mid-line marker | A marker syntax embedded inside a line of prose (not whole-line) |

**Escape syntax** for documenting marker syntax inside code fences (e.g. in this ADR, in
how-to docs, in test fixtures): insert a zero-width space (U+200B) immediately after the
leading `<` (e.g. `<​!-- harness:local-start id=foo -->`), OR use HTML entity escaping
(`&lt;!-- harness:local-start id=foo -->`). CS03 will pin the exact escape characters
recognised by `lib/composed.mjs` and document them in the linter test fixtures
(`check-composed-blocks.mjs`).

The comment-safe `#`-form (used by files where an HTML comment is an invalid
line, such as CODEOWNERS or gitignore-style files) has **no escape form** — the
zero-width-space / `&lt;` escapes above apply to the HTML-comment form only.
This is acceptable because the `#`-form targets non-Markdown files that do not
embed marker-shaped prose; a stray whole-line marker-shaped comment there is a
genuine authoring error, and a mid-line occurrence is rejected as a mid-line
marker (matching the HTML-form behavior).

### Legacy-content fail-closed invariant

For any composed file target, `harness sync` **refuses to overwrite** if the target
contains non-template, non-block content (i.e. content that is neither a recognised marker
pair nor a template section) **unless** one of:

- `legacy_composed_mapping.json` explicitly maps each such region to a block ID (content
  preserved with `provenance: migrated-from-legacy`), or
- `legacy_composed_mapping.json` explicitly discards the region (omitted from output;
  recorded in lock file).

If neither condition holds, `harness sync` exits non-zero with a descriptive message and
writes nothing. This is enforced by the sync engine itself, not by a separate audit step.
The `harness composed-audit --from-existing-harness` command (CS04) assists in generating
the initial `legacy_composed_mapping.json` for an existing repo being migrated onto the
harness.

The shape of `legacy_composed_mapping.json` is formally defined in
[`schemas/legacy-composed-mapping.schema.json`](../../schemas/legacy-composed-mapping.schema.json)
(Draft-2020-12) per [LRN-019](../../LEARNINGS.md#lrn-019) / CS03e — consumer files may set
`"$schema"` to that path for IDE autocomplete and standalone validation. See
[`examples/legacy-composed-mapping.example.json`](../../examples/legacy-composed-mapping.example.json)
for a starter file. The runtime validator in `lib/composed.mjs` (`validateLegacyMapping`)
enforces the same rules at sync time; the JSON Schema mirrors them for authoring-time
validation via `validate-schemas.mjs`.

See the cs-plan [CS03 sync invariant](../../project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md)
for the exact fixture specification.

### Template prose evolution (v0.2.0 / CS03d / [LRN-020](../../LEARNINGS.md#lrn-020))

In v0.1.x, every harness-side prose update to a composed file (e.g. fixing a typo in the
managed core of `OPERATIONS.md`) tripped the legacy fail-closed invariant on every
existing consumer's next sync, because the consumer's old skeleton no longer matched the
new template's skeleton. Consumers had to author a `legacy_composed_mapping.json` for
every routine doc tweak — punishingly bad UX.

CS03d extends the lock-file `fileEntry` with a per-composed-file `template_prose_hash`
field that records the SHA-256 of the template skeleton (post-templating, post-block-strip,
LF-normalised) at the most recent sync. On the next sync, `mergeComposed()` consults the
recorded hash to distinguish four cases:

| Case | Prior lock has `template_prose_hash`? | Consumer skeleton matches recorded hash? | Behaviour |
|---|---|---|---|
| (a) | yes | yes | **Auto-adopt** new template prose. Consumer didn't touch their prose; the divergence is entirely template-side. Local blocks preserved. No `legacyMapping` required. |
| (b) | yes | no | **Fail-closed** (`EMERGE_LEGACY_UNMAPPED`). Consumer truly edited their prose; existing v0.1.x semantics apply unless `legacyMapping` is provided. |
| (c) | no (pre-v0.2.0 lock entry exists for this file) | n/a | **Bootstrap**: silently auto-adopt for this one sync; record the new hash. Subsequent syncs use cases (a)/(b). Acceptable risk for upgrade UX (CS03d D4). |
| (d) | no prior lock entry at all (fresh consumer file with extra prose) | n/a | **Fail-closed** (`EMERGE_LEGACY_UNMAPPED`). Cannot distinguish "never-synced existing file" from "user-edited prose post-sync" without a prior lock; preserve v0.1.x conservative behaviour. |

The new `template_prose_hash` field is **optional** in the schema — managed and seeded
file entries do not carry it, and pre-v0.2.0 composed entries that lack it trigger case
(c) bootstrap on first re-sync. From the second sync onward, evolution detection is fully
active.

---

## Lock-file recording for composed files

Per Decision #13 / GPT-5.5 finding #13 (cs-plan CS02 deliverables), the `.harness-lock.json`
entry for each composed file includes a `blocks[]` array. Each block record:

```json
{
  "id": "conventions.project",
  "source_line_range": { "start": 42, "end": 58 },
  "body_hash": "<sha256-of-block-body>",
  "template_marker_hash": "<sha256-of-marker-line-in-template>",
  "provenance": "user-authored"
}
```

| Field | Meaning |
|---|---|
| `id` | Block identifier matching the marker |
| `source_line_range` | Object `{ "start": <int>, "end": <int> }`, 1-indexed inclusive line numbers in the rendered output; used for precise drift reporting |
| `body_hash` | SHA-256 of the block body (content between the markers); used by `harness sync --check` to detect consumer edits |
| `template_marker_hash` | SHA-256 of the marker lines as they appear in the template; used to detect marker renames/deletions across harness versions |
| `provenance` | One of `user-authored` (written by the project team), `seeded-empty` (block was empty when first created; not yet edited), `migrated-from-legacy` (content came from a pre-harness file via `legacy_composed_mapping.json`) |

The `body_hash` being stable means `harness sync --check` can distinguish "consumer edited
their block" (expected: non-zero in drift mode, preserved in apply mode) from "harness
template changed its sections" (overwritten). This is the core mechanism for class-aware
drift detection.

---

## Consequences

### Benefits

**Consumer extensions survive harness updates.** When the harness ships a new
`CONVENTIONS.md` template version, the consumer's project-specific blocks (`conventions.project`,
`conventions.deployment`, etc.) are preserved verbatim. The consumer only sees the delta
in the harness-owned sections.

**Drift detection is class-aware.** `harness sync --check` reports three distinct drift
conditions: managed-file changed, composed template-section changed (requires sync),
composed block changed (informational; consumer edit, no action needed). Seeded files are
never included in drift checks — they are project-owned once created.

**Legacy migration is fail-closed, not silent-overwrite.** Existing repos that adopt the
harness do not silently lose unstructured content. The sync engine forces an explicit
mapping or discard decision for every legacy region.

**Seeded files carry no ongoing obligation.** After the first sync, seeded files cost
nothing. The harness does not need to track them, diff them, or update them.

### Costs and risks

**Composed parser complexity.** The parser must correctly track fenced code blocks,
indented code blocks, and nested structures across arbitrarily large markdown files. Edge
cases are non-trivial (fence sequences that are also indented, tildes vs. backticks,
nested fences inside HTML blocks). The CS03 fixture list covers the known edge cases; new
ones may emerge.

**Expanded linter surface.** CS06 adds `check-composed-blocks.mjs` to audit composed
files for: required block IDs present, no duplicate IDs, no orphan IDs, no markers inside
code fences. This is a net-new linter that must stay in sync with the parser rules.

**Expanded lock-file fields.** Every composed file adds a `blocks[]` array to the lock
entry. Lock files for repos with many composed files will be larger and require more fields
to be validated by `harness-lock.schema.json`.

**Block-ID stability contract.** Once a block ID appears in a consumer's repo and lock
file, renaming it in the template is a breaking change. The `composed_block_migrations`
config key (schema-only in v0.1.0; implemented in a later CS) provides the migration path,
but it adds operational overhead. Block IDs should be chosen for long-term stability.

**No partial-file ownership model.** Composed files are the only mechanism for
project-local extensions. A consumer who wants to extend a managed file must instead
request that the file be reclassified as composed in the harness template. This is
intentional — it keeps the file-class model simple — but it means the harness maintainer
must respond to extension requests.

---

## Alternatives considered

### A. `managed` + `seeded` only (no `composed`)

The simplest model. Every file is either fully harness-owned or fully project-owned.

**Rejected** because it cannot satisfy Need 2 (`CONVENTIONS.md` and similar). The choices
would be:
- Keep `CONVENTIONS.md` as `managed`: consumers can never add project-specific conventions
  without them being wiped on every sync.
- Keep `CONVENTIONS.md` as `seeded`: the harness-owned sections (code style, git policy)
  immediately drift from the template; harness version upgrades provide no value for this
  file.

Neither is acceptable for `CONVENTIONS.md`. Since this is the primary motivation for the
`composed` class, the two-class model is insufficient.

### B. Full template/overlay system (Helm-style)

Treat every file as a template with named override slots, where consumers supply a
`values.yaml`-style overlay that is merged at render time. Each template section would be
named and overridable.

**Rejected** for two reasons:
1. **Obscures intent.** The marker-in-file approach makes it visually clear in the file
   itself which regions are harness-managed and which are project-owned. A separate
   values file decouples ownership from location, making it easy to accidentally edit a
   managed section.
2. **Overkill.** The harness does not need per-line override granularity. The contract is
   coarser: certain named blocks are project-owned; everything else is harness-owned.
   HTML comment markers express this contract with zero additional infrastructure.

### C. Per-file "do not regenerate" pragma

A magic comment at the top of any file (e.g. `<!-- harness:preserve -->`) opts that file
out of all future syncs, making it behave like `seeded` from that point on.

**Rejected** because:
1. **Easy to miss.** A pragma at the top of a large file is easy to accidentally delete.
   The consequences (silent overwrite on next sync) are severe.
2. **All-or-nothing.** The pragma covers the entire file. If the harness later adds an
   important section to the template, the consumer must manually merge it because sync is
   disabled. The `composed` model is more precise: harness sections are always updated;
   local blocks are always preserved.
3. **No structural record.** There is no lock-file entry for a pragma-preserved file, so
   drift cannot be detected or reported.

---

## Notes

### Relationship to ADR 0002

[ADR 0002](0002-readme-ownership.md) covers the fourth ownership category: project-owned
files that never entered the harness sync system at all (`README.md` being the primary
example). This is distinct from the `seeded` class because `seeded` files are created by
the harness; project-owned files pre-exist and are explicitly excluded from all sync
operations.

### Block IDs are namespaced by convention

Block IDs should follow a `<doc-slug>.<section>` convention (e.g.
`conventions.project`, `conventions.deployment`, `conventions.testing`) to avoid collisions
if the same block-ID namespace is shared across multiple composed files. The schema does
not enforce this namespace convention; it is a naming guideline.

### `composed_block_migrations` is schema-only in v0.1.0

The `composed_block_migrations` config key (which handles block-ID renames and splits
across harness versions) is defined in `schemas/harness.config.schema.json` but the sync
engine in CS03 exits non-zero with a clear `"block ID renamed/split needs migration spec"`
message if a block disappears from the template without a migration entry. Full migration
execution is deferred to a later CS.

### v0.2.0 — `local_blocks` allowlist canonicalised under `composed.overrides`

In v0.1.0 the per-file allowlist could be expressed in two interchangeable
forms — top-level `local_blocks: { "FILE.md": [...] }` and per-file
`composed.overrides["FILE.md"].local_blocks: [...]`. The schema accepted both
and the engine emitted a warning when they disagreed. In v0.2.0 (CS02b) the
top-level form was removed entirely and `composed.overrides[<file>].local_blocks`
is now the single source of truth (per [LRN-009](../../LEARNINGS.md#lrn-009)).
Configs carrying the old top-level form are rejected by Ajv with an
`additional properties` error naming `local_blocks`. Migration: move every
entry from `local_blocks[<file>]` into
`composed.overrides[<file>].local_blocks` and delete the top-level key.

### Cross-references

- [cs-plan Decision #13](../../project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md) — three file classes locked in
- [cs-plan CS03](../../project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md) — `lib/composed.mjs` parser rules (normative source for this ADR's parser section)
- [cs-plan CS02](../../project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md) — lock-file schema spec (GPT-5.5 finding #13)
- [ARCHITECTURE.md § Sync engine](../../ARCHITECTURE.md) — component overview
- [LEARNINGS.md LRN-001](../../LEARNINGS.md#lrn-001) — branch-protection context (discipline-only enforcement phase this ADR was authored in)
- [LEARNINGS.md LRN-005](../../LEARNINGS.md#lrn-005) — sub-agent dispatch and reporting model used to author this ADR
