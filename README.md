# agent-harness

Multi-agent process harness — extracted from [`henrik-me/guesswhatisnext`](https://github.com/henrik-me/guesswhatisnext) for reuse across projects.

> **Status:** v0.1.0 shipped (CS14, 2026-05-04). v0.2.0 unreleased: pre-public-flip hygiene (CS02b BREAKING — `local_blocks` schema cleanup; CS03d additive — `template_prose_hash` evolution detection; CS03e additive — `legacy-composed-mapping` schema). See [`CHANGELOG.md`](CHANGELOG.md) for the full delta and [`project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md`](project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md) for the roadmap. **Next gate: CS15a** (public-readiness preparation).

## What this is

A shippable kit for running coordinated, multi-agent work on a software project:

- **Process docs** — INSTRUCTIONS, CONVENTIONS, OPERATIONS, REVIEWS, TRACKING, RETROSPECTIVES — that define how orchestrators and sub-agents claim, dispatch, review, and close clickstops (CSs).
- **Structured-doc linters** — one per doc — that turn the process into mechanical enforcement.
- **Scaffolds** — opt-in starting points for smoke tests, migrations, container validation, health checks, seeders, deploy verification, feature flags, and one-shot CS probes.
- **Reusable GitHub workflow** so a consumer wires up the whole thing in ~10 lines.

Three file classes:

- **managed** — overwritten on every `harness sync`; the source of truth.
- **composed** — managed core + marker-preserved local blocks for project-specific extensions.
- **seeded** — created if missing, never overwritten.

## Installation

Two install models are supported:

**Option B — install from GitHub by ref** (today, while the repo is private + pre-publish): `npx -y github:henrik-me/agent-harness#<ref>` works in any environment with a `GITHUB_TOKEN` having `contents:read` on the harness repo. `<ref>` is a semver tag (e.g. `v0.1.0`), branch name, or 40-character commit SHA. Recommend pinning to a semver tag in `harness.config.json` `version` for reproducibility.

> **Note:** as of v0.2.0 the bare `npx -y "github:owner/repo#<sha>"` install path hits an npm 10.8.x/10.9.x `GitFetcher requires an Arborist constructor` regression on GitHub Actions runners. The harness's own reusable workflow (`harness-checks.yml`) bypasses this by cloning + invoking `node bin/harness.mjs` directly. External consumers running their own CI may want to do the same. Tracked as a known issue.

**Option C — install from npm by version** (planned for CS15+ post-public-flip; not active today): `npx -y @henrik-me/agent-harness@<version>` will work once the package is published. The `name` field in `package.json` already reserves the npm scope; the package is currently `private: true`. Same pinning advice via `harness.config.json` `version`.

## Quickstart

```bash
# In a consumer repo:
npx -y github:henrik-me/agent-harness#v0.1.0 init
# review the generated harness.config.json, then:
npx -y github:henrik-me/agent-harness#v0.1.0 sync
```

## Repo layout

```
.
├── bin/                 # harness CLI dispatcher (CS04)
├── lib/                 # sync engine, composed parser, templating, lock-file (CS03–CS05)
├── template/
│   ├── managed/         # process truth — synced into consumers, overwrite-on-sync
│   ├── composed/        # managed core + local-block extensions
│   └── seeded/          # create-if-missing skeletons
├── scripts/             # structured-doc linters + policy checks (CS05–CS07)
├── scaffolds/           # opt-in copy-and-customize patterns (CS10)
├── schemas/             # JSON Schema for config, lock file, per-doc shapes
├── .github/workflows/   # CI + reusable workflow for consumers (CS12)
└── project/clickstops/  # the harness's own CS lifecycle (planned / active / done)
```

The repo IS the persistent memory between sessions. There is no other state.
Per-path purpose:

| Path | Purpose |
|---|---|
| `INSTRUCTIONS.md` | Orchestrator workflow — bootstrap reading order, Session Start checklist (incl. sanity-check commands), Per-CS Loop, "When to Add X" recipes |
| `OPERATIONS.md` | Lifecycle procedures — Claim / Dispatch / Sync / Harvest / SemVer / Conventions; canonical sub-agent briefing preamble |
| `CONTEXT.md` | Current state, recently completed CSs with commit refs, active CS pointer, blockers, parallelism posture |
| `WORKBOARD.md` | Live coordination — Orchestrators table, Active Work (single-row by discipline), Recently Completed, Queued |
| `LEARNINGS.md` | Process learnings (LRN-001..N), schema-validated, sectioned by status |
| `ARCHITECTURE.md` | Architecture overview — Components, Data model, Decision log |
| `REVIEWS.md` | Independent-reviewer model, taxonomy, HIGH-RISK CS list, GPT-5.5 fallback rules |
| `project/clickstops/active/` | Currently in-flight CS spec (one file when active, empty when stable) |
| `project/clickstops/planned/` | Queued CSs in priority order (`planned_cs<NN>_<short-name>.md`) |
| `project/clickstops/done/` | Completed CS files with full actuals (sub-agent ledger, GPT-5.5 review log, learnings filed, follow-up planned CSs) |

## Starting an agent session

Open a fresh Copilot CLI (or equivalent) at the repo root and use a starter
prompt like:

```
cd <repo>, then read INSTRUCTIONS.md carefully and follow the Quick Reference
Checklist (especially the Session Start bootstrap sanity check). After that,
continue from where the prior session left off (check CONTEXT.md and
WORKBOARD.md for the current state). Operate autonomously from the current
repo state. Check in only for substantive design decisions not derivable from
the cs-plan + LRNs, or for changes that would materially alter the public
repo/security posture.
```

That's all you need to type. `INSTRUCTIONS.md` pulls in everything else in
the right order via its Pointers section.

## How this repo governs itself

This repo follows the harness from CS01. Bootstrap proto docs (INSTRUCTIONS, CONVENTIONS, OPERATIONS, REVIEWS, TRACKING, RETROSPECTIVES) are hand-authored; from CS11 onward they are produced by `harness sync` against the canonical `template/managed/` + `template/composed/` (with local blocks preserved) and a CI gate prevents drift. Seeded project-state docs (CONTEXT, ARCHITECTURE, LEARNINGS, WORKBOARD) are preserved as-is. Project-owned files (this README, LICENSE, package.json, .gitignore, .editorconfig) are excluded from sync entirely. See [INSTRUCTIONS.md](INSTRUCTIONS.md) and [`project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md`](project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md).

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design: file-class model (managed / composed / seeded), sync engine internals, lock-file format, and the linter pipeline.

## Status

See [CONTEXT.md](CONTEXT.md) for current project state, the active clickstop, and known blockers.

## License

MIT — see [LICENSE](LICENSE).
