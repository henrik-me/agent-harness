# Extracting the Agent Harness from `henrik-me/guesswhatisnext`

## What "the harness" actually is

After scanning the repo, the agent harness is a coherent set of **process artifacts** + **enforcement scripts**, not application code.

**Process docs (project-agnostic core, with project-specific examples mixed in):**
- `INSTRUCTIONS.md` — orchestrator workflow & quick-reference checklist
- `CONVENTIONS.md` — code/test/git/docs conventions
- `OPERATIONS.md` — claim/dispatch/handoff procedures, agent progress reporting
- `REVIEWS.md` — local + Copilot review loop
- `TRACKING.md` — clickstop/workboard lifecycle, state machine
- `WORKBOARD.md` — live multi-agent coordination table (per-project state, **not** harness)
- `CONTEXT.md` — per-project state (**not** harness)
- `LEARNINGS.md` — per-project learnings (**not** harness)
- `.github/copilot-instructions.md` — thin pointer file
- `.github/pull_request_template.md`, `CODEOWNERS`, `CONTRIBUTING.md`
- `project/clickstops/{planned,active,done}/` — directory layout convention

**Enforcement scripts (mostly generic, a few project-specific):**
- Generic harness: `check-commit-trailers.js`, `check-pr-body.js`, `check-docs-consistency.js`, `check-feature-flag-policy.js`, `check-migration-policy.js`, `check-compose-v2.js`, `render-deploy-summary.js`
- Project-specific (stay in app repo): `build-sw.js`, `smoke.js`, `cs52-*`, `verify-ai.js`, `seed-*`, `migrate.js`, `dev-server.js`, `container-validate.js`, etc.

**GitHub bits:** workflows (mixed — some generic CI lint/test scaffolding, some app-specific deploy)

So the harness is roughly: **6 markdown process files + ~7 generic check-* scripts + a clickstops directory convention + a copilot-instructions pointer + a PR template**.

---

## Extraction options (ranked)

### Option A — Standalone repo + Git submodule  ⚠️ not recommended
Put harness in `henrik-me/agent-harness`, add it as a submodule at `.harness/` in each consumer.
- ✅ Pinned per-project commit; explicit updates.
- ❌ Submodules are notoriously painful (extra clone steps, agents/CI forget `--recurse-submodules`, sub-agents editing harness docs ends up making PRs in the wrong repo).
- ❌ The harness docs need to live at the repo root (e.g. `INSTRUCTIONS.md`, `.github/copilot-instructions.md`) — submodules can't mount files at the parent root.

### Option B — Standalone repo + sync script (copy-on-update)  ✅ **recommended**
Create `henrik-me/agent-harness` containing:
```
template/
  INSTRUCTIONS.md
  CONVENTIONS.md
  OPERATIONS.md
  REVIEWS.md
  TRACKING.md
  .github/copilot-instructions.md
  .github/pull_request_template.md
  project/clickstops/{planned,active,done}/.gitkeep
scripts/
  check-commit-trailers.js
  check-pr-body.js
  check-docs-consistency.js
  check-feature-flag-policy.js
  check-migration-policy.js
  check-compose-v2.js
  render-deploy-summary.js
bin/
  harness-sync.mjs        # copies template/ + scripts/ into a target repo
  harness-init.mjs        # one-shot scaffold for a new repo
harness.config.schema.json
README.md (how to consume)
VERSION
CHANGELOG.md
```

Each consumer repo gets a tiny `harness.config.json` declaring which files to sync, the version pin, and any per-project overrides (e.g. project name, CS prefix, optional checks to disable). Bumping is then:

```
npx -y github:henrik-me/agent-harness#v0.4.0 sync
```

…which writes the harness files into the consumer repo as **regular tracked files** (so Copilot/agents see them at the expected paths). Updates land via a normal PR you can review.

- ✅ Files live where the agents expect them (root + `.github/`).
- ✅ Version-pinned (`harness.config.json` records the synced commit/tag).
- ✅ Per-project deviations stay local; sync is idempotent and shows a diff.
- ✅ Works across languages/stacks; no submodule overhead.
- ❌ Updates are explicit (must run sync) — but that's actually a feature for an agent harness.
- Mitigation: add a scheduled GitHub Action in each consumer that runs `harness sync --check` weekly and opens a PR if drift is detected (`peter-evans/create-pull-request`).

### Option C — Publish as an npm package (`@henrik-me/agent-harness`)
Same as B but distributed via npm. `npx @henrik-me/agent-harness sync`. Adds it to `devDependencies`; `npm update` + `npm run harness:sync` keeps it fresh.
- ✅ Familiar versioning (semver, lockfile).
- ✅ Easy to consume in any Node-based repo.
- ❌ Awkward for non-Node repos (Python/Go/.NET would still need Node installed) — though the JS check scripts already require Node anyway, so probably fine for your fleet.
- This is essentially Option B with a nicer distribution channel. **Use this if all your consumer repos already have Node.**

### Option D — GitHub template repository
Mark the new repo as a GitHub *template*, then "Use this template" when starting new projects.
- ✅ Zero-effort initial scaffolding.
- ❌ **No update path** — template only seeds the initial commit; later harness fixes don't propagate. Not viable as the only mechanism.
- Good as a *complement* to B/C for greenfield projects.

### Option E — Reusable GitHub Actions / composite workflow
Move the *enforcement* (check-* scripts) into `henrik-me/agent-harness/.github/workflows/` exposed via `workflow_call`, and consumers add a 5-line caller workflow.
- ✅ Auto-updates (consumers reference `@v1`).
- ❌ Only covers CI checks; can't deliver the markdown process files (which agents read locally).
- Best **combined with B/C**: docs/scripts via sync, CI checks via reusable workflow (so `check-pr-body` etc. always runs the latest).

---

## Recommended setup

**Combine B (or C) + E + D:**

1. **`henrik-me/agent-harness` repo** containing `template/`, `scripts/`, `bin/harness-sync.mjs`, reusable workflows, `CHANGELOG.md`, semver tags. Mark it as a **template repo** for greenfield use.
2. **Distribute via npm** (Option C) if all consumers are Node — gives you `npm outdated` visibility for free. Otherwise stick with `npx github:henrik-me/agent-harness#vX.Y.Z` (Option B).
3. **Reusable workflow** (`.github/workflows/harness-checks.yml` with `on: workflow_call`) so the lint/policy checks always run the pinned harness version without copying script bodies into every repo.
4. In each consumer repo:
   - `harness.config.json` (project name, CS prefix, version pin, opt-outs)
   - `npm run harness:sync` script
   - Tiny `.github/workflows/harness.yml` calling the reusable workflow + the weekly drift-check that opens an update PR

## What to extract vs. keep in `guesswhatisnext`

| Move to harness | Keep in guesswhatisnext |
|---|---|
| `INSTRUCTIONS.md`, `CONVENTIONS.md`, `OPERATIONS.md`, `REVIEWS.md`, `TRACKING.md` (templated) | `CONTEXT.md`, `WORKBOARD.md`, `LEARNINGS.md` (per-project state) |
| `.github/copilot-instructions.md`, `pull_request_template.md` | `CODEOWNERS` (project-specific) |
| `project/clickstops/{planned,active,done}/` layout + naming rules | The actual CS files (project history) |
| `scripts/check-commit-trailers.js`, `check-pr-body.js`, `check-docs-consistency.js`, `check-feature-flag-policy.js`, `check-migration-policy.js`, `check-compose-v2.js`, `render-deploy-summary.js` | All `cs52-*`, `smoke.js`, `verify-ai.js`, `build-sw.js`, `migrate.js`, `seed-*`, `container-validate.js`, `dev-server.js` |
| Reusable CI workflow that runs the above checks | App-specific workflows (deploy, e2e, smoke) |

## Important refactors before extraction

The current docs hard-code project specifics. Parameterize them via `harness.config.json` (consumed by `harness-sync` doing simple `{{project_name}}` / `{{cs_prefix}}` substitution):

- "Guess What's Next" → `{{project_name}}`
- `gwn-staging`, `gwn.metzger.dk`, Azure SQL specifics → remove from harness, leave in project `CONTEXT.md`
- `check-docs-consistency.js` (62 KB) almost certainly contains string assertions about specific files/sections — audit and gate project-specific rules behind config flags
- `check-feature-flag-policy.js` / `check-migration-policy.js` reference `submitPuzzle`, `server/db/migrations/` paths — make those configurable
- Clickstop file naming (`active_csNN_*.md`, `done_csNN_*.md`) is already generic ✅

## Suggested rollout

1. Create `henrik-me/agent-harness` from scratch (don't `git filter-repo` — clean slate is faster given the parameterization needed).
2. Copy harness files in, parameterize, add `bin/harness-sync.mjs` (pure Node, no deps; reads `harness.config.json`, copies files, performs templating, writes synced version to a `.harness-lock.json`).
3. Tag `v0.1.0`. Add reusable workflow.
4. In `guesswhatisnext`: add `harness.config.json` pinning `v0.1.0`, run sync, verify the diff is empty (or expected), commit. This becomes the regression test that extraction was clean.
5. Bootstrap a second repo from the harness to validate generality.
6. Add a scheduled drift-detection action to consumers.
