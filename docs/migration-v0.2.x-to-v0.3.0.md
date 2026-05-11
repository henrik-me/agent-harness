# Migration: v0.2.x → v0.3.x

This guide walks an existing consumer repo (one that was bootstrapped on
`harness v0.2.0` or earlier) through the steps required to consume the
`v0.3.x` line cleanly.

> **TL;DR — the four blocking changes:**
>
> 1. Bump `harness.config.json` `version` to `v0.3.x`.
> 2. Delete the `## Queued` and `## Recently Completed` sections from your
>    `WORKBOARD.md` ([CS28 BREAKING](#change-1-workboard-shape-cs28-breaking)).
> 3. Make sure your `ARCHITECTURE.md` has the four required headings:
>    `## Overview`, `## Components`, `## Data model`, `## Decision log`
>    ([architecture linter contract](#change-2-architecture-linter-discoverability-cs30d5)).
> 4. (Optional but recommended on dirty working trees:) re-run
>    `harness lint` — `text-encoding` is now `.gitignore`-aware and will no
>    longer flag CRLF/BOM in `.gitignore`d build outputs.

---

## Why upgrade

| Version | What it brings | Breaks anything? |
|---|---|---|
| **v0.3.0** | `ajv` / `ajv-formats` / `js-yaml` are now runtime `dependencies` (no more `Cannot find package 'ajv'` warnings on `npx -y ...init`); WORKBOARD shape simplified to coordination-state only | **Yes** — WORKBOARD shape (CS28). See [Change 1](#change-1-workboard-shape-cs28-breaking). |
| **v0.3.1** | Gitignore-aware `text-encoding`; better architecture-linter errors; `lint:NAME` alias; `lint --explain`; version header in `lint` output; SAML-safe `git ls-remote` recipe in OPERATIONS | **No** behavioural breakage. The new `text-encoding` default is strictly more-excluding (gitignored content is skipped), so a previously-passing consumer cannot newly fail. |

---

## Change 1 — WORKBOARD shape (CS28, BREAKING)

### What changed

- The seeded `WORKBOARD.md` template no longer ships with `## Queued` or
  `## Recently Completed` sections.
- `scripts/check-workboard.mjs` now **forbids** both headings — any
  occurrence of either is a lint error. This was a deliberate inversion:
  in v0.2.x, `## Recently Completed` was *required*; in v0.3.0+, it is
  *forbidden*.

### Why

WORKBOARD is the live-coordination single-pane-of-glass for orchestrators:
who is currently active and what active work each is on. The queue is the
filesystem (`project/clickstops/planned/`); the historical record is also
the filesystem (`project/clickstops/done/`). Duplicating either inside
WORKBOARD invites divergence — the live file becomes a stale ledger when
nobody updates it. Removing the sections moves WORKBOARD to a single
narrow purpose. See [LRN-102](../LEARNINGS.md#lrn-102) for the full rationale.

### Migration steps

In your consumer repo:

1. **Open `WORKBOARD.md`.**
2. **Delete the `## Queued` section** (the heading and every row beneath it).
3. **Delete the `## Recently Completed` section** (heading + rows).
4. **Verify with `harness lint --only workboard`** (or
   `harness lint:workboard` under v0.3.1+).
5. Commit on a small one-file PR with the message
   `chore: drop WORKBOARD ## Queued and ## Recently Completed (CS28 BREAKING)`.

### Note for in-flight consumers

Existing `WORKBOARD.md` files are **not** auto-rewritten by `harness sync` —
seeded files are create-if-missing. The five-line manual edit above is the
fix; nothing else is required.

---

## Change 2 — Architecture-linter discoverability (CS30/D5)

### What changed

- The seeded `template/seeded/ARCHITECTURE.md` already shipped with all four
  required headings (since CS09). What was *missing* was an obvious failure
  message when a hand-authored ARCHITECTURE.md missed one of them.
- `scripts/check-architecture.mjs` now prints the **full required-heading
  set** + the canonical seed-file path + a `harness lint --explain
  architecture` hint on the first missing-heading error.
- New subcommand `harness lint --explain <linter-name>` prints the rules for
  one linter — e.g. `harness lint --explain architecture` lists the four
  required headings inline.

### Why

[SI Finding #5]: a sub-agent hand-authored an ARCHITECTURE.md from
OPERATIONS prose alone, missed `## Data model`, and the original error
message gave no path forward except reading the linter source.

### Migration steps

If your `ARCHITECTURE.md` is missing any of:

- `## Overview`
- `## Components`
- `## Data model`
- `## Decision log`

…add the missing heading(s) and a short paragraph each. The fastest path is
to copy `template/seeded/ARCHITECTURE.md` from the harness repo and fill in
the sections.

---

## Change 3 — `text-encoding` is now `.gitignore`-aware (CS30/D3)

### What changed

- `scripts/check-text-encoding.mjs --respect-gitignore` is the new default
  (ON). When the scan target is inside a git repo, the scan list comes from
  `git ls-files --cached --others --exclude-standard` — i.e. tracked +
  untracked-but-not-ignored. Files matched by `.gitignore`,
  `.git/info/exclude`, or the global excludes file are skipped.
- Tracked content is **still always checked.** Gitignore-awareness narrows
  the scan; it does not weaken the contract.
- Opt-out via `--no-respect-gitignore`. Falls back to the recursive walk
  with a one-line warning on stderr if `git` isn't on PATH or the target
  isn't inside a git repo.

### Why

[SI Finding #3]: `dotnet build api/` emitted 19+ CRLF JSON files into
`api/bin/` and `api/obj/`. Both were `.gitignore`d and would never reach a
PR — but `harness lint` flagged them all and exited non-zero, breaking the
local lint→commit loop.

### Migration steps

**No action required** if your repo is clean. If you previously had a
workaround (e.g. running `harness lint` from a clean tree only, or scripting
around the false-positives), you can drop it.

If you want the old behaviour for some reason, pass `--no-respect-gitignore`
to either the script directly or to `harness lint` (currently via
`--public-artifact-dir <path>`-style escape; per-script flags are not
threaded through `cmdLint` yet).

---

## Optional CS30 niceties

- `harness lint:NAME` is shorthand for `harness lint --only NAME`.
  E.g. `harness lint:text-encoding`.
- `harness lint --explain <name>` (see Change 2 above).
- Every `harness lint` run starts with `# harness vX.Y.Z — lint (cwd: ...)`
  so CI logs make the version unambiguous.
- OPERATIONS.md now documents the SAML-safe `git ls-remote
  https://github.com/<org>/<repo>.git refs/tags/<tag>` recipe for resolving
  pinned-action SHAs when `gh api repos/<org>/...` returns 403 (Azure and
  similar SAML-protected orgs).

---

## Cross-references

Subheadings below provide stable anchor targets for the `[SI Finding #N]`
reference-style links used elsewhere in this guide and in `CHANGELOG.md`.

### SI Finding #1 ajv runtime deps

`ajv`/`ajv-formats`/`js-yaml` runtime deps. **Fixed in v0.3.0**
([CS25](../CHANGELOG.md#030--2026-05-11)). Migration: just bump the pin.

### SI Finding #2 no lint-NAME form

No `harness lint:NAME` shorthand for re-running a single linter. **Fixed
in v0.3.1** (CS30/D2). Use `harness lint:<name>` (or the equivalent
`harness lint --only <name>`) to drill into one linter.

### SI Finding #3 text-encoding gitignored files

`scripts/check-text-encoding.mjs` walked the filesystem and flagged CRLF /
BOM in `.gitignore`d build artifacts (e.g. dotnet `api/bin`, `api/obj`).
**Fixed in v0.3.1** (CS30/D3) — see [Change 3 above](#change-3--text-encoding-is-now-gitignore-aware-cs30d3).

### SI Finding #4 seeded WORKBOARD forbidden sections

The seeded `WORKBOARD.md` shipped with `## Queued` and
`## Recently Completed` sections, then the new linter forbade them on day
zero. **Fixed in v0.3.0** (CS28) — seeded template no longer ships those
sections; existing consumers must do the manual delete documented in
[Change 1 above](#change-1--workboard-shape-cs28-breaking).

### SI Finding #5 architecture-linter discoverability

`Missing required heading: "## Data model"` gave no path forward.
**Fixed in v0.3.1** (CS30/D5) — first missing-heading error now lists the
full required-heading set, points at the canonical seed file, and hints at
`harness lint --explain architecture`. See [Change 2 above](#change-2--architecture-linter-discoverability-cs30d5).
Existing ARCHITECTUREs without `## Data model` must still add it.

### SI Finding #6 composed-block paths

CS plan templates referenced `template/composed/<file>` (the harness-repo
view), which doesn't exist in consumer repos. **Fixed in v0.3.1**
(CS30/D6) — new OPERATIONS.md subsection "Composed-block edits — consumer
vs harness-repo paths" disambiguates which file an editor should touch in
each repo type.

### SI Finding #7 SAML-blocked gh api

`gh api repos/Azure/<repo>/git/ref/tags/<tag>` returned 403 because Azure
enforces SAML SSO and standard CLI tokens aren't SSO'd. **Fixed in
v0.3.1** (CS30/D7) — OPERATIONS.md Reusable-CI-workflow section now
documents `git ls-remote https://github.com/<org>/<repo>.git refs/tags/<tag>`
as the SAML-safe fallback (works without auth).

### SI Finding #8 no version header

`harness lint` output didn't identify the harness version that produced
it, slowing cross-clone debugging. **Fixed in v0.3.1** (CS30/D8) — every
`harness lint` run now starts with `# harness vX.Y.Z — lint (cwd: ...)`
on the first stdout line, regardless of `--quiet`.

[SI Finding #1]: #si-finding-1-ajv-runtime-deps
[SI Finding #2]: #si-finding-2-no-lint-name-form
[SI Finding #3]: #si-finding-3-text-encoding-gitignored-files
[SI Finding #4]: #si-finding-4-seeded-workboard-forbidden-sections
[SI Finding #5]: #si-finding-5-architecture-linter-discoverability
[SI Finding #6]: #si-finding-6-composed-block-paths
[SI Finding #7]: #si-finding-7-saml-blocked-gh-api
[SI Finding #8]: #si-finding-8-no-version-header
