> **Archive note — restored by CS70 (2026-06-10).**
>
> This file is **harness-internal close-out evidence** from the CS16 *sub-invaders* bootstrap session (Wave B) — a point-in-time record, **not a consumer-side artifact**. It was authored in the CS16 bootstrap's active clickstop directory at commit `e2b233a` and silently dropped during the CS16 directory-form close-out (commit `40e464c` renamed only the plan file). CS70 restores it **verbatim** at its directory-form home here.
>
> Its findings (#1–#9) were already dispositioned via **CS25 / CS26 / CS27 / CS30**. The harness does **not** emit `sub-invaders-bootstrap-summary.md` into any consumer — no `init` / `sync` / scaffold contract produces it — so **do not file cross-repo issues against this file**, and do not treat it as a consumer-side canonical copy. This supersedes the obsolete "the canonical copy lives in the `sub-invaders` consumer repo" doctrine. See `agent-harness#290`, `sub-invaders#91`, and LRN-B.
>
> Everything below this banner is byte-for-byte identical to the original `sub-invaders-bootstrap-summary.md` blob captured in commit `e2b233a` (CS16 Wave B); only this Archive-note banner was added.

---

# sub-invaders bootstrap summary (CS16, Wave B)

**Bootstrap PR:** [henrik-me/sub-invaders#1](https://github.com/henrik-me/sub-invaders/pull/1) — squash-merged at commit `49a9d3c`.
**Repo URL:** https://github.com/henrik-me/sub-invaders
**Repo created:** 2026-05-11 (public, MIT license, owner `henrik-me`).
**Harness pin used:** `v0.2.0`
**Scaffolds installed:** `feature-flags`, `verify-deploy`, `container-validate`, `seed`, `health-check`
**Final lint result:** 12 passed, 0 failed, 9 skipped (skipped checks all target harness-internal artifacts not present in consumer repos).

## Bootstrap operations performed

1. `gh repo create henrik-me/sub-invaders --public --license=MIT --description="Sea-themed Space Invaders, governed by agent-harness; first non-self-host consumer."`
2. `git clone https://github.com/henrik-me/sub-invaders C:\src\sub-invaders`
3. `npx -y "github:henrik-me/agent-harness#v0.2.0" init --constraint-disposition=flip-public-when-ready --with-scaffold=feature-flags --with-scaffold=verify-deploy --with-scaffold=container-validate --with-scaffold=seed --with-scaffold=health-check`
   - Exit 0, but emitted two warnings (see Findings #1 below).
4. **Workaround for ajv issue:** `npm install --no-save ajv ajv-formats js-yaml` into the npx cache directory `C:\Users\henri\AppData\Local\npm-cache\_npx\e35f86be63b12545`.
5. `npx -y "github:henrik-me/agent-harness#v0.2.0" sync --mode=apply` — 3 changes applied (composed file generation: `CONVENTIONS.md`, `OPERATIONS.md`, `REVIEWS.md`).
6. Stubbed `flags/flags.json` to `flags: []` (template defaults had expired 2025 dates; see Finding #5).
7. Removed stray root-level `.gitkeep` (see Finding #6).
8. Created folder skeleton: `src/engine/`, `src/game/`, `api/`, `infra/` (`.gitkeep` only — no source code per CS16 scope refinement).
9. Copied 6 SI-CS planned files from `project/clickstops/active/active_cs16_bootstrap-sub-invaders/si-cs-plans/` (this repo) → `project/clickstops/planned/` (sub-invaders).
10. Populated `WORKBOARD.md` `## Queued` section with 6 SI-CSs (priorities 1–4 active + 2 deferred re-evals).
11. `harness lint --quiet` → 12 passed, 0 failed.
12. Committed on branch `bootstrap`, pushed, opened PR #1, admin-merged via `gh pr merge 1 --squash --admin --delete-branch`.

## SI-CS planned files at `henrik-me/sub-invaders:main` (post-bootstrap)

| Filename | Purpose | Sub-agent fan-out |
|----------|---------|-------------------|
| `planned_cs01_repo-hardening-and-first-deploy.md` | Ruleset, App, security settings, governance docs, ARCHITECTURE.md, composed-blocks customisation, CI workflows, Azure provisioning (RG `rg-sub-invaders-prod`), G3+G4+G5 user gates | 8 lanes |
| `planned_cs02_engine-and-minimal-game.md` | Custom in-tree engine, game skeleton, hand-authored sprite sheet, localStorage high-score, deploy to staging | 9 lanes |
| `planned_cs03_backend-and-leaderboard.md` | .NET 8 isolated Functions, C16-12 replay protection, Storage Tables persistence, hourly cleanup, leaderboard scene | 9 lanes |
| `planned_cs04_daily-challenge-and-pin-bump.md` | Pin bump (orchestrator-owned task #1), 5 daily modifiers, daily-challenge scene, whale-shark, feature-flags + health-check scaffold exercise; v1 declared shipped | 8 lanes (incl. orchestrator) |
| `planned_cs05_re-evaluate-persistence.md` | Tripwire skeleton (no fan-out; do not claim until trigger fires) | n/a |
| `planned_cs06_re-evaluate-cloudflare-full-stack.md` | Tripwire skeleton (no fan-out; do not claim until trigger fires) | n/a |

## Harness-monitor findings (filed for follow-up agent-harness CSs)

These are real issues observed during the very first downstream-consumer `harness init` from a fresh public repo. Per the CS16 master plan Decision #21, harness fixes land as separate harness CSs — not in-band.

### Finding #1 — CRITICAL: `ajv` is a devDependency in agent-harness `package.json`

When `npx -y "github:henrik-me/agent-harness#v0.2.0"` installs the package, only `dependencies` are installed (which are `null` in the published v0.2.0). `ajv`, `ajv-formats`, and `js-yaml` are declared in `devDependencies` and therefore are NOT present at runtime. The init script attempts to load ajv for constraint-merge and post-init sync; both silently fail with `Cannot find package 'ajv'`.

**Symptoms observed during sub-invaders init:**

\\\
Warning: could not merge constraints into harness.config.json: Cannot find package 'ajv' imported from C:\Users\henri\AppData\Local\npm-cache\_npx\e35f86be63b12545\node_modules\@henrik-me\agent-harness\lib\config-reader.mjs
...
Warning: post-init sync failed: Cannot find package 'ajv' imported from C:\Users\henri\AppData\Local\npm-cache\_npx\e35f86be63b12545\node_modules\@henrik-me\agent-harness\lib\sync.mjs
Run \harness sync --mode=apply\ manually to complete setup.
\\\

**Workaround applied:** `npm install --no-save ajv ajv-formats js-yaml` into the npx cache dir before re-invoking sync. Brittle (cache may be wiped at any time) and requires manual user intervention every fresh install.

**Recommended fix:** move `ajv`, `ajv-formats`, `js-yaml` from `devDependencies` to `dependencies` in agent-harness `package.json`, cut a `v0.2.1` patch release, recommend consumers update pin.

**Impact:** every fresh consumer init via npx git ref hits this. Likely the same friction will hit any subsequent sync invocation that loads ajv. Self-host (running directly from `C:\src\agent-harness`) is unaffected because the local `npm install` populates devDependencies.

### Finding #2 — HIGH: `harness.config.json` `version` field hardcoded to `v0.1.0`

The init template seeds `harness.config.json` with `"version": "v0.1.0"` regardless of the version actually invoked. Even when invoked at `v0.2.0` ref, the seeded config records `v0.1.0`. Consumer must manually edit.

**Recommended fix:** at init time, detect the invocation ref (from `process.argv` parsing or `__dirname` resolution back to the git ref) and seed the actually-invoked version. Or, render `"version"` as a placeholder `REPLACE_ME` and require the user to set it.

**✅ Resolved — CS26 (2026-07-04).** `cmdInit` now derives the running install's provenance via `resolveHarnessProvenance()` and writes a normalized `version` (SemVer tag → full 40-hex `resolved_sha` → `v${package.json version}`) into the fresh consumer config, replacing the seeded `v0.1.0`. Fresh-init-only (preserves LRN-057/C41-8). See `project/clickstops/done/done_cs26_init-improvements-bundle/`.

### Finding #3 — HIGH: `harness.config.json` seeded with `REPLACE_ME` placeholders that lint does not detect

Init seeds:

\\\json
"project": { "name": "my-project", "agent_suffix": "mp", "repo": "REPLACE_ME/REPLACE_ME" },
"templating": { "repo_owner": "REPLACE_ME", "default_codeowner": "REPLACE_ME", "lib_codeowner": "REPLACE_ME", "repo_short": "REPLACE_ME" }
\\\

These placeholders pass through composed-block rendering and end up as literal text in CONVENTIONS.md, OPERATIONS.md, REVIEWS.md. `harness lint` does not flag them.

**Recommended fix:** add a `check-config-placeholders` linter that scans `harness.config.json` (and rendered composed files) for literal `REPLACE_ME` and fails. SI-CS01 will replace these for sub-invaders, but the gap is real.

**✅ Resolved — CS26 (2026-07-04).** New `scripts/check-config-placeholders.mjs`, registered in `harness lint`, flags standalone `REPLACE_ME` in string values under non-`_` keys of the consumer-root `harness.config.json` (JSON-aware, so the instructional `_comment` is ignored). Scoped to the config (the source of truth), not the rendered composed docs. A fresh init intentionally ships placeholders, so the linter flags them by design until filled — a fresh scaffold is *structurally* clean (`harness lint --skip config-placeholders`) plus this "fill in your identity" reminder (issue #146 refined accordingly; see CS26 R6).

### Finding #4 — HIGH: `.harness-lock.json` records `"unknown"` and `"0000..."` for npx-git-ref invocations

After `sync --mode=apply`, `.harness-lock.json` contains:

\\\json
"harness_ref": "unknown",
"resolved_sha": "0000000000000000000000000000000000000000",
"scaffolds": [{"name": "feature-flags", "version": "unknown"}, ...]
\\\

This defeats the entire pin-integrity verification mechanism. Consumers can't validate they're synced against the expected harness version.

**Recommended fix:** when sync runs from an npx-installed package, read the package's git ref from the npx cache metadata (`npm-cache/_npx/<hash>/node_modules/.package-lock.json` typically records the ref) and populate `harness_ref` + `resolved_sha` accordingly.

**⊘ Obsolete (not fixed in CS26).** Addressed independently by the CS82 provenance chain: `lib/sync.mjs` `resolveHarnessProvenance()` (npx-cache → git → fail-closed) populates `.harness-lock.json` `harness_ref` + `resolved_sha`, and `validateResolvedProvenance` refuses to persist the `unknown`/all-zero placeholder. Dispositioned obsolete during the CS26 re-author (2026-07-04).

### Finding #5 — MEDIUM: Seeded `flags/flags.json` has expired example dates causing day-1 lint fail

The seeded template ships with `"expires": "2025-12-31"` and `"expires": "2025-06-30"` example flags. By the time any consumer runs init in 2026+, the policy linter immediately fails with `STALE — "expires" date YYYY-MM-DD is in the past`.

**Recommended fix:** either (a) seed with all-future dates auto-computed at init time (e.g. `today + 90 days`), (b) seed with `expires: null`, or (c) seed with a comment-only file (no example flags). Stubbed to empty for sub-invaders.

**⊘ Obsolete (not fixed in CS26).** Obsolete by elimination — the entire `template/seeded/flags/` subtree no longer exists, so no `flags.json` is seeded and the expired-dates defect cannot occur. Dispositioned obsolete during the CS26 re-author (2026-07-04).

### Finding #6 — MEDIUM: Stray `.gitkeep` created at repo root by harness init

Init created a file literally named `.gitkeep` at the consumer repo root. `.gitkeep` files are conventionally only used inside otherwise-empty subdirectories to force git to track them. A root-level `.gitkeep` is meaningless and clutter.

**Recommended fix:** remove the `Created .gitkeep` line in init's file-creation script (the loop is likely seeding `.gitkeep` inside `./`).

**✅ Resolved — CS26 (2026-07-04).** Removed at the source: `template/seeded/.gitkeep` and `template/seeded/.github/.gitkeep` are deleted (both land in dirs that are non-empty after init). The legitimately-empty `project/clickstops/{planned,active,done}/.gitkeep` sentinels are retained. (The old unconditional `Created .gitkeep` line was already gone; the residual defect was the seeded-copy loop propagating the seed files.)

### Finding #7 — LOW: Sync warns "WORKBOARD.md has active CS rows" on fresh consumer

The warning string `WORKBOARD.md has active CS rows. Syncing mid-CS may cause process-shape changes mid-flight.` triggers on the seeded WORKBOARD's placeholder Orchestrators row (`_(placeholder — replace with real agent)_`) which pattern-matches the active-row detector. False positive on any first-sync of a freshly-init'd repo.

**Recommended fix:** tighten the active-row detector to ignore rows where every cell is a placeholder string.

### Finding #8 — LOW: Several `harness lint` checks "skipped (target not found)" without informing consumer they should consider adopting them

Lint skipped: `instructions`, `fixtures`, `templates`, `pack`, `scaffold-readme`, `public-artifact`, `pr-body`, `commit-trailers`, `compose-v2`. Several of these (notably `commit-trailers`, `pr-body`) are checks every consumer SHOULD have once they have PRs and commits. Silent skip means a consumer never learns they exist.

**Recommended fix:** for at-least the consumer-applicable checks (`commit-trailers`, `pr-body`), emit an informational note recommending the consumer add the prerequisite file (e.g. `.github/pull_request_template.md`).

### Finding #9 — LOW: No `.gitattributes` seeded; Windows consumers see CRLF round-trip warnings

Sub-invaders has no `.gitattributes`. Windows `git` with default `core.autocrlf=true` immediately surfaces 32 `LF will be replaced by CRLF the next time Git touches it` warnings at first commit. Confusing for new consumers.

**Recommended fix:** harness init should seed a `.gitattributes` with `* text=auto eol=lf` (matching the harness's own LF discipline). SI-CS01 will add this for sub-invaders.

**✅ Resolved — CS26 (2026-07-04).** `harness init` now seeds `template/seeded/.gitattributes` (`* text=auto eol=lf` + binary overrides, mirroring the harness's own root file), shipped create-if-missing by the seeded-copy loop.

## Recommended follow-up agent-harness CSs (for the workboard)

- **CS25 (proposed)**: Move `ajv`/`ajv-formats`/`js-yaml` from devDependencies to dependencies; cut v0.2.1 patch (Finding #1).
- **CS26 (proposed)**: `harness init` improvements bundle: detect-and-seed actual version (Finding #2); add `check-config-placeholders` linter (Finding #3); npx-cache-aware `.harness-lock.json` population (Finding #4); seed `flags.json` with computed-future dates or empty (Finding #5); skip stray root `.gitkeep` (Finding #6); seed `.gitattributes` (Finding #9).
- **CS27 (proposed)**: Tighten WORKBOARD active-row detector to ignore placeholder rows (Finding #7); informational notes for skip-able lints (Finding #8).

(CS25 is the highest-priority follow-up — every fresh consumer install is impacted today.)