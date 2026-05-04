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

- [ ] `bin/harness.mjs cmdLint` — wire `check-pack` as a new linter. **Guarded**: only enabled when the consumer cwd's `package.json` `name` matches `@henrik-me/agent-harness`. This prevents false failures when consumers run `harness lint` against their own repos with different packaging conventions. (A future `--enable pack` opt-in for non-harness packages is filed as out-of-scope here; can be added in a follow-up if needed.)

- [ ] `.github/workflows/harness-self-check.yml` — no separate `npm pack --dry-run` step needed; `harness lint --quiet` already invokes the new check-pack linter for the harness self-host case (per the guard above). The cs-plan exit "npm pack --dry-run reproducible" is satisfied by the lint gate failing on any pack regression.

- [ ] README — add a 2-3 sentence "Installation" sub-section under § Quickstart:
  - **Today (Option B)**: `npx -y github:henrik-me/agent-harness#<ref>` works on the private repo with a `GITHUB_TOKEN` having `contents:read`.
  - **Future (Option C, post-public-flip)**: `npx -y @henrik-me/agent-harness@<version>` — labelled as planned for CS14+ / post-CS15b. Not yet active.

- [ ] Mark planned CS04c (`pack whitelist verification`) as **partially superseded by CS13** — CS13's `check-pack` provides denylist/required-entries/size-budget validation. CS04c's original "exact whitelist" goal (any unexpected file → fail) is broader; it remains achievable as a follow-up extension to `check-pack.mjs` if needed but is not required for v0.1.0 go-public. Move the planned file to done/ with the supersession note. Avoids duplicate dispatch.

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
| `scripts/check-pack.mjs` + `tests/check-pack.test.mjs` | done | sub-agent cs13-pack | agent-id=yoga-ah-sub-1 \| role=linter-author \| report-status=complete \| learnings=2 |
| `bin/harness.mjs cmdLint` aggregator wiring (with self-host guard) + README installation sub-section + supersede planned CS04c | done | orchestrator | agent-id=yoga-ah \| role=orchestrator \| report-status=complete \| learnings=0 |

## Plan-vs-implementation review

**Reviewer:** GPT-5.5 (rubber-duck)
**Date:** 2026-05-04
**Outcome:** GO (R1 verdict; 3 non-blockers, 2 of which fixed inline by tightening the active CS plan)

### Plan vs implementation

| Deliverable | Outcome | Notes |
|---|---|---|
| `scripts/check-pack.mjs` (size budget + forbidden patterns + required entries) | match | 197 lines; `spawnSync('npm', ['pack', '--dry-run', '--json'], { shell: true })` per LRN-029; fail-closed JSON parse; clean exit codes 0/1/2. |
| `tests/check-pack.test.mjs` (≥4 tests) | match | 6 tests: clean repo passes; forbidden-pattern (uses `tests/` since npm strips `node_modules/`); size budget; missing required; usage errors. |
| `bin/harness.mjs cmdLint` wired with self-host guard | match | Linter enabled only when cwd's `package.json.name === "@henrik-me/agent-harness"`. Other consumers see clean skip. (R1 NB: `--enable pack` opt-in dropped from plan as out-of-scope; documented in Deliverables.) |
| README installation sub-section | match | Added "## Installation" with Option B (today) + Option C (future, post-public-flip). |
| Supersede CS04c | match | Moved planned → done with supersession note. (R1 NB: wording softened to "partially superseded" since CS13 uses denylist + required-entries, NOT exact whitelist; documented in done CS04c file.) |

### Test coverage

Sufficient. Final state:
- `node --test tests/*.test.mjs` → **486 pass / 0 fail** (was 480 baseline; +6 in check-pack.test.mjs).
- `node bin/harness.mjs lint --quiet` → **14 pass / 0 fail / 3 skipped** (was 13/0/3; +1 pack).
- `node bin/harness.mjs sync --mode=check --cwd .` → No drift.
- `node scripts/check-pack.mjs --cwd .` → exit 0; 594652 bytes / 94 entries / 0 violations.

### Findings

R1 (GO with 3 NBs, 2 addressed inline):
1. (NB) `--enable pack` opt-in planned but not implemented → plan updated to mark as out-of-scope; self-host guard is the only enablement mechanism for v0.1.0.
2. (NB) CS04c supersession overstated "whitelist" → done CS04c file updated to clarify CS13 uses denylist + required-entries, not exact whitelist. Future allowlist extension filed as a CS04c-residual follow-up if needed.
3. (NB) `.harness-lock.json` mutation noted → expected from `sync --mode=apply`; intentional.

Sub-agent learning candidates (filed by cs13-pack):
- npm always strips `node_modules/` from tarballs; `node_modules/` cannot be tested as a forbidden-pattern violation via real npm fixtures.
- `check-text-encoding.mjs --dir <file>` rejects file paths; only accepts directories.
