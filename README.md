# agent-harness

Multi-agent process harness — extracted from [`henrik-me/guesswhatisnext`](https://github.com/henrik-me/guesswhatisnext) for reuse across projects.

> **Status:** v0.5.2 shipped (2026-05-14) — patch release packaging the post-v0.5.1 accumulated work: **CS46/[#146](https://github.com/henrik-me/agent-harness/issues/146)** discoverability (canonical workboard empty-state + verbatim Plan-vs-impl review labels + self-documenting linter hints), **CS45** typed-error fs envelope around `lib/copilot-engage.mjs` cache-write seam (new exit code `5` + `--cache-dir` escape hatch), **CS44** Copilot Bot doc-impl alignment (canonical `node(id:)` + `BOT_kgDOCnlnWA` referenced in OPERATIONS + CHANGELOG), **CS43** clickstop-implementer-not-reviewer linter recursion + date-gated grandfathering, **CS23** `.github/workflows/harness-self-check.yml` `pull_request: types: [edited]` so `gh pr edit --body` re-fires `pr-body`. Net consumer impact: better error messages, cleaner fresh-init scaffold, additive `harness copilot-engage` exit code; non-breaking. v0.5.1 (Bugfix [#183](https://github.com/henrik-me/agent-harness/issues/183), 2026-05-14) shipped the `cs-plan` linter false-positive fix (`DEFAULT_FORBIDDEN_PREFIXES` shrunk to harness-only `template/*` entries; inline backtick-delimited code spans exempt). v0.5.0 (CS42, 2026-05-14) shipped the v0.5.0 arc: adds `harness copilot-engage <pr-number>` CLI (CS41) wrapping the documented Copilot review-engagement primitive, the `clickstop-implementer-not-reviewer` linter (CS41) enforcing model-independence at the agent-identity level, first-class `Implementer agent` + `Reviewer agent` columns in the `## Model audit` schema (CS41), `harness review-output` reviewer-output validator (CS40), and **two breaking-ish defaults**: `harness.config.json` `review_gates` now defaults to `enabled: true` on fresh `harness init` (CS41 — set `_opt_out_reason` to opt out) and `scripts/check-clickstop-plan-review.mjs --strict` defaults to `true` (CS42 per CS35b-10 — local lint now errors rather than warns on missing `## Plan review` attestations). v0.4.0 (CS39, 2026-05-13) shipped the #145 enforcement-doctrine arc (CS35–CS38b: `harness pr-evidence` PR-time gates B1+A3+A4+A5+A6+A16, canonical PR template skeleton + sync migration, `pr-evidence-lint.yml` pre-merge enforcement). See [`CHANGELOG.md`](CHANGELOG.md) for the full delta and [`project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md`](project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md) for the roadmap.

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

**Option B — install from GitHub by ref** (today, default install path): `npx -y github:henrik-me/agent-harness#<ref>` works anonymously now that the repo is public — no token required. `<ref>` is a semver tag (e.g. `v0.5.2`), branch name, or 40-character commit SHA. Recommend pinning to a semver tag in `harness.config.json` `version` for reproducibility. (For private forks of this harness, see [`docs/private-consumption.md`](docs/private-consumption.md) for the `GITHUB_TOKEN` setup.)

> **Note:** as of v0.2.0 the bare `npx -y "github:owner/repo#<sha>"` install path hits an npm 10.8.x/10.9.x `GitFetcher requires an Arborist constructor` regression on GitHub Actions runners. The harness's own reusable workflow (`harness-checks.yml`) bypasses this by cloning + invoking `node bin/harness.mjs` directly. External consumers running their own CI may want to do the same. Tracked as a known issue. (Still applies under v0.5.2 — same npm CLI versions on the runners.)

**Option C — install from npm by version** (planned for CS15+ post-public-flip; not active today): `npx -y @henrik-me/agent-harness@<version>` will work once the package is published. The `name` field in `package.json` already reserves the npm scope; the package is currently `private: true`. Same pinning advice via `harness.config.json` `version`.

## Quickstart

```bash
# In a consumer repo:
npx -y github:henrik-me/agent-harness#v0.5.2 init
# review the generated harness.config.json, then:
npx -y github:henrik-me/agent-harness#v0.5.2 sync
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
| `WORKBOARD.md` | Live coordination only — Orchestrators table + Active Work table. Nothing else. The queue lives in `project/clickstops/planned/` and history in `project/clickstops/done/`; WORKBOARD never duplicates either. |
| `LEARNINGS.md` | Process learnings (LRN-001..N), schema-validated, sectioned by status |
| `ARCHITECTURE.md` | Architecture overview — Components, Data model, Decision log |
| `REVIEWS.md` | Independent-reviewer model, taxonomy, HIGH-RISK CS list, GPT-5.5 fallback rules |
| `template/managed/` | Process truth — files synced verbatim into consumer repos; overwrite-on-sync |
| `template/composed/` | Managed-core docs that consumers can extend via local blocks; recomposed on sync |
| `template/seeded/` | Create-if-missing skeletons; seeded once into consumers and never overwritten |
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
