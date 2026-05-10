# 0003 — Constraints field for repository tier detection

**Date:** 2026-05-10
**Status:** Accepted

---

## Status

Accepted. CS15e adds an optional `constraints` field to `harness.config.json` so
`harness init` can record repository-tier detection results before consumers hit
private-free GitHub branch-protection limits.

---

## Context

[LRN-001](../../LEARNINGS.md#lrn-001) records the harness repo's CS01 discovery
that both classic branch protection and Rulesets are unavailable on private repos
in GitHub's free tier. [LRN-002](../../LEARNINGS.md#lrn-002) carried that forward:
future consumers should not discover the same limitation mid-init.

The harness governs itself, and the same disposition surface that the harness had
to choose manually should be available to consumers automatically at init time.
The configuration schema is the source of truth for that recorded state, so the
field must be schema-defined before runtime code writes it.

---

## Decision

### Optional additive field

Add a new optional top-level `constraints` object to `harness.config.json`. This
is additive and non-breaking: existing consumer configs without the field remain
valid. The corresponding CHANGELOG entry should be one `Added` item under
`[Unreleased]` for v0.2.0; CS15e γ2 does not edit `CHANGELOG.md`.

### Tier values

`constraints.tier` is exactly one of:

```text
public | private-free | private-pro | private-team | private-enterprise | unknown
```

`unknown` is the safe fallback for no git remote, an unparseable remote, repo not
found, API error, network error, missing token on a private repo, or unavailable
plan data on a private repo. Missing plan data is never interpreted as
`private-free`.

### Disposition values

`constraints.disposition` is exactly one of:

```text
discipline-only | upgrade-pro | flip-public-when-ready
```

The field is required only when `tier === "private-free"`. For every other tier it
is omitted entirely, not set to `null`. Mixed `null`/omit semantics are confusing;
omit-when-N/A is clearer and aligns with Ajv strictness defaults. The schema
enforces this with `if` / `then` / `else`.

### GitHub API path

CS15e uses Path B: native Node `fetch()` against `api.github.com`, with no npm
runtime dependencies. The token helper (`lib/get-github-token.mjs`) is structured
so a future Path D `gh auth token` fallback can be added inside that helper
without changing callers.

### Repository identity detection

`harness init` auto-detects repository identity from `git remote get-url origin`.
It parses both `https://github.com/o/r(.git)?` and `git@github.com:o/r(.git)?`.
If no origin remote exists, init still proceeds and records or reports
`tier = unknown` rather than failing.

---

## Consequences

**Benefits:**
- Consumers run `harness init` and the field is populated automatically; no extra
  discovery step is required.
- Linters and other tooling may adapt based on the field. For example, a future
  Ruleset-suggestion linter can skip recommendations when
  `disposition === "discipline-only"`.
- Consumer configs without `constraints` remain valid, so the schema change is a
  non-breaking SemVer-minor addition.

**Costs:**
- Constraint data can become stale when a repo is flipped public or a plan is
  upgraded. Consumers should re-run
  `harness init --constraint-disposition <new>` or manually edit
  `constraints` in `harness.config.json`. CS15e γ5 documents the re-evaluation
  procedure in `INSTRUCTIONS.md`.
- The init implementation must distinguish API uncertainty from private-free
  certainty. A private repo with missing plan data must resolve to `unknown`, not
  to `private-free`.

**CHANGELOG expectation:** The CS15e close-out should add one `[Unreleased]` /
`Added` entry for the optional `constraints` field and note that it is
non-breaking. The orchestrator owns that edit, not this ADR task.

## Related ADRs

- **[ADR 0001](0001-file-classes.md)** — Defines `harness.config.json` file-class
  declarations and the schema-first configuration model this field extends.
