# CONVENTIONS (proto, CS01)

Hand-maintained until CS11. Canonical version authored in CS08 as `template/composed/CONVENTIONS.md`.

## Code

- **Runtime:** Node 20+. Pure ESM (`"type": "module"`). Zero runtime dependencies for the harness CLI itself; dev deps only.
- **File extension:** `.mjs` for executable scripts and library modules.
- **Style:** keep modules small (~100 LOC where reasonable); prefer pure functions; no global state.
- **Tests:** `node --test`. Place fixtures next to the code under test.
- **No build step** for the CLI. Source = published.

## Git

- **Branch naming:** `cs<NN>/<slug>` for CS work; `workboard/cs<NN>-claim` (and `workboard/cs<NN>-close`, etc.) for WORKBOARD-only PRs. Before CS15a these are user-reviewed small PRs; from CS15a onward they are bot-approved/auto-merged when eligible.
- **Commit message format:** `<short imperative subject>` followed by a body explaining *why*. Include `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` as the trailer on every commit.
- **Squash-merge** only. Linear history.
- **No force pushes** to `main`.

## Docs

- All process docs at the repo root or under `template/`.
- Markdown linted by per-doc checkers (CS06+). Use H2/H3 hierarchy consistently.
- Cross-links use repo-relative paths.
- Code/file references use backticks.

## Reviews

See [REVIEWS.md](REVIEWS.md). GPT-5.5 rubber-duck pre-PR is non-negotiable in this private phase except via documented fallback or user waiver.

## Sub-agents

- Mechanical / parallelisable sub-tasks → Haiku 4.5.
- Non-trivial sub-tasks → Sonnet 4.6.
- Orchestration → Opus 4.7 1M (the agent reading this).
- Reviews → GPT-5.5 (or fallback per REVIEWS.md).

## What goes where

- Repo-root managed docs (this file, INSTRUCTIONS, OPERATIONS, REVIEWS, TRACKING, RETROSPECTIVES) — process truth.
- Repo-root seeded docs (CONTEXT, ARCHITECTURE, LEARNINGS, WORKBOARD) — project state.
- README.md — project-owned (excluded from any future `harness sync` against this repo).
- `template/{managed,composed,seeded}/` — what the harness ships to consumers (authored in CS08–CS09).
- `lib/`, `bin/`, `scripts/`, `scaffolds/`, `schemas/` — the harness CLI implementation (CS02+).
- `project/clickstops/{planned,active,done}/` — CS lifecycle.
