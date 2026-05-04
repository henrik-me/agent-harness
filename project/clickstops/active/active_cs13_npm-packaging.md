# CS13 — npm packaging readiness

**Status:** active
**Owner:** yoga-ah
**Branch:** cs13/content
**Started:** 2026-05-04
**Closed:** —
**Filed by:** CS12 close-out (per cs-plan § CS13, lines 238-243).
**Depends on:** CS12

## Goal

Make `npm publish` a future no-op trigger, even if we never ship to npm.

## Pre-claim audit (already done — informs the plan)

Most CS13 deliverables ALREADY landed via prior CSs:
- ✅ `package.json` has `"type": "module"`, `"bin": { "harness": "./bin/harness.mjs" }`, `"files"` whitelist (bin/, lib/, template/, scripts/, scaffolds/, schemas/, README.md, LICENSE), `engines.node >= 20`, `"private": true` (correct — stays private until CS15b public flip), zero runtime deps (only devDependencies for ajv/js-yaml).
- ✅ Schemas at `schemas/*.schema.json` all have `$id` URLs (LRN-055).
- ✅ README has `npx -y github:henrik-me/agent-harness#v0.1.0 init` examples (Option B install model).

What's still needed:
1. **`npm pack --dry-run` validation** — verify tarball size + contents reproducibly (cs-plan exit criterion).
2. **CI job** for `npm pack --dry-run` (added to `.github/workflows/harness-self-check.yml`).
3. **README**: brief mention of future Option C (`npx @henrik-me/agent-harness`) once published — already implied by `name: "@henrik-me/agent-harness"` in package.json; add a single sentence.
4. **Mechanical guard**: `scripts/check-pack.mjs` linter that runs `npm pack --dry-run` and asserts (a) tarball ≤ a sane size budget, (b) tarball contents include exactly the expected directories + no surprises (no `node_modules/`, no `tests/`, no `project/`, no `.github/`, no `.harness-lock.json`, no `harness.config.json`). Wired into `harness lint` aggregator.

## Deliverables

- [ ] `scripts/check-pack.mjs` — runs `npm pack --dry-run --json` (Node 20 + npm 10 has stable JSON output) and parses the resulting file list. The npm output IS the source of truth for what gets packed (npm applies `files[]` + `.npmignore` + auto-include rules itself). The script asserts:
  - **Tarball size budget**: `unpackedSize` (or sum of file sizes) ≤ `--max-size-bytes` (default 1 MB; configurable for deliberate growth).
  - **Forbidden patterns in the packed file list**: NO entries matching `node_modules/**`, `tests/**`, `project/**`, `.github/**`, `.harness-lock.json`, `harness.config.json`, `.git/**`, `*.log`. (These would indicate an `.npmignore` bug or a `files[]` over-broadening.)
  - **Required entries**: at minimum `package.json`, `README.md`, `LICENSE`, `bin/harness.mjs`, plus at least one entry under each of `lib/`, `template/`, `scripts/`, `scaffolds/`, `schemas/`. (NPM auto-includes `package.json/README/LICENSE`; the rest come from `files[]`.)
  - CLI: `node scripts/check-pack.mjs --cwd <path> [--max-size-bytes <N>] [--quiet]`. `requireValue` guard (LRN-040). Exit 0 / 1 / 2.
  - Uses `spawnSync('npm', ['pack', '--dry-run', '--json'], { shell: true, cwd })` per LRN-029.

- [ ] `tests/check-pack.test.mjs` — covers:
  - (a) **Clean repo passes**: runs against the harness's own `cwd`, asserts exit 0.
  - (b) **Forbidden-pattern violation**: in a tmpdir fixture package with `package.json files: ["bin", "node_modules"]` (deliberately over-broad), assert the linter detects `node_modules` in pack output and exits 1.
  - (c) **Size-budget violation**: against the harness with `--max-size-bytes 1` (1 byte) → exit 1 with size-violation message.
  - (d) **Missing-required violation**: tmpdir fixture with `files: []` (empty) → exit 1 because `bin/harness.mjs` etc. are missing from pack.

- [ ] `bin/harness.mjs cmdLint` — wire `check-pack` as a new linter. **Guarded**: only enabled when the consumer cwd's `package.json` `name` matches `@henrik-me/agent-harness` OR when `--enable pack` is passed. This prevents false failures when consumers run `harness lint` against their own repos with different packaging conventions.

- [ ] `.github/workflows/harness-self-check.yml` — no separate `npm pack --dry-run` step needed; `harness lint --quiet` already invokes the new check-pack linter for the harness self-host case (per the guard above). The cs-plan exit "npm pack --dry-run reproducible" is satisfied by the lint gate failing on any pack regression.

- [ ] README — add a 2-3 sentence "Installation" sub-section under § Quickstart:
  - **Today (Option B)**: `npx -y github:henrik-me/agent-harness#<ref>` works on the private repo with a `GITHUB_TOKEN` having `contents:read`.
  - **Future (Option C, post-public-flip)**: `npx -y @henrik-me/agent-harness@<version>` — labelled as planned for CS14+ / post-CS15b. Not yet active.

- [ ] Mark planned CS04c (`pack whitelist verification`) as **superseded by CS13** in its planned file's preface, OR move it to done with a "absorbed-into-CS13" note. Avoids duplicate dispatch.

## Exit criteria

- `node scripts/check-pack.mjs --cwd .` exits 0.
- `node --test tests/*.test.mjs` 480+ baseline still passes (this CS adds ≥3 new).
- `node bin/harness.mjs lint --quiet` exits 0 (now 14 linters running).
- `node bin/harness.mjs sync --mode=check --cwd .` no drift.
- Sub-agent briefing canonical preamble may need an update if check-pack matters for sub-agent self-checks (probably not — it's an aggregator/CI-level gate, not a per-sub-agent concern).

## Sub-agent fan-out

Single sub-agent for `scripts/check-pack.mjs` + `tests/check-pack.test.mjs`. Orchestrator-owned: aggregator wiring, CI workflow update, README addition.

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| `scripts/check-pack.mjs` + `tests/check-pack.test.mjs` | pending | sub-agent cs13-pack | agent-id=yoga-ah-sub-1 \| role=linter-author \| report-status=pending \| learnings=0 |
| `bin/harness.mjs cmdLint` aggregator wiring (with self-host guard) + README installation sub-section + supersede planned CS04c | pending | orchestrator | agent-id=yoga-ah \| role=orchestrator \| report-status=pending \| learnings=0 |

## Plan-vs-implementation review

> _(filled at close-out per the gate)_
