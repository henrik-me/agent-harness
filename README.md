# agent-harness

Multi-agent process harness — extracted from [`henrik-me/guesswhatisnext`](https://github.com/henrik-me/guesswhatisnext) for reuse across projects.

> **Status:** pre-v0.1.0 — CS01 bootstrap complete; implementation begins in CS02. See [`project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md`](project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md) for the roadmap.

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

**Option C — install from npm by version** (planned for CS14+ post-public-flip; not active today): `npx -y @henrik-me/agent-harness@<version>` will work once the package is published. The `name` field in `package.json` already reserves the npm scope; the package is currently `private: true`. Same pinning advice via `harness.config.json` `version`.

## Quickstart (when v0.1.0 ships)

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

## How this repo governs itself

This repo follows the harness from CS01. Bootstrap proto docs (INSTRUCTIONS, CONVENTIONS, OPERATIONS, REVIEWS, TRACKING, RETROSPECTIVES) are hand-authored; from CS11 onward they are produced by `harness sync` against the canonical `template/managed/` + `template/composed/` (with local blocks preserved) and a CI gate prevents drift. Seeded project-state docs (CONTEXT, ARCHITECTURE, LEARNINGS, WORKBOARD) are preserved as-is. Project-owned files (this README, LICENSE, package.json, .gitignore, .editorconfig) are excluded from sync entirely. See [INSTRUCTIONS.md](INSTRUCTIONS.md) and [`project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md`](project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md).

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design: file-class model (managed / composed / seeded), sync engine internals, lock-file format, and the linter pipeline.

## Status

See [CONTEXT.md](CONTEXT.md) for current project state, the active clickstop, and known blockers.

## License

MIT — see [LICENSE](LICENSE).
