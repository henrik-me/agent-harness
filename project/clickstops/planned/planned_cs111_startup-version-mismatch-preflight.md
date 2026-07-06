# CS111 — startup/sync version-mismatch preflight: fail fast (with the exact re-run command) when the running CLI ≠ pinned `config.version` (closes #502)

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** yoga-ah (orchestrator, Claude Opus 4.8) — triage of untriaged inbound issue #502 (2026-07-05), directed by @henrik-me.
**Depends on:** none

## Goal

Make "get latest first, then invoke the harness at the pulled pin" **mechanical**
instead of dependent on operator memory (#502's primary ask). When the running
harness CLI's package version does not match the repo's pinned
`harness.config.json` `version`, fail fast — **before any template rendering** —
with an actionable message that names BOTH versions and prints the exact pinned
re-run command (`npx -y github:henrik-me/agent-harness#<config.version> …`). This
turns today's cryptic `Template file not found` incident into a self-correcting
error the operator can act on in one step, without spawning a different CLI
version mid-process.

## Background

Filed from inbound issue **#502** (title: "startup: help enforce get-latest-first
… stale CLI vs freshly-pulled config yields cryptic 'Template file not found'").
State: **OPEN** — re-verify with `gh issue view 502 --json state` at claim-time
HEAD (F6 state-of-the-world probe). At filing HEAD (`f2b4607`) the issue is open
and unlabeled.

**Repro (from #502, verified against the tree):**

1. A consumer clone is pinned to `#v0.16.0` and is behind `origin/main`.
2. `origin/main` merged a `v0.17.0` bump that adds a **managed** target
   (`DISPATCH-PREAMBLE.md`).
3. `npx -y github:henrik-me/agent-harness#v0.16.0 startup --pull-ff-only`:
   - `--pull-ff-only` fast-forwards the working tree to the `v0.17.0` config
     (`lib/startup.mjs:215-220` runs `git pull --ff-only origin main`, sequenced
     first in `runStartup`, `lib/startup.mjs:78-86`);
   - the bootstrap `harness sync --mode=check` step then runs under the **still
     v0.16.0** CLI — `runSyncCheck` re-spawns the **same** `harnessBin`
     (`lib/startup.mjs:246-254` → `runHarness` → `spawnSync(process.execPath,
     [harnessBin, …])` at `lib/startup.mjs:201-202`; `harnessBin` is the running
     `__filename` per `bin/harness.mjs:5351`);
   - v0.16.0 has no `template/managed/DISPATCH-PREAMBLE.md`, so sync throws
     `Template file not found` (`lib/sync.mjs:1274-1277`,
     `ESYNC_MISSING_TEMPLATE`).
4. Re-running `startup` with `#v0.17.0` passes.

**Root cause (verified):** no code path compares the running package version
(`package.json` `version`) to `harness.config.json` `version`. `config.version`
today is read/validated (`lib/sync.mjs:642-647`; full schema at
`lib/sync.mjs:1049`), used for the `{{harness_invoke}}` default
(`computeHarnessInvokeDefault`, `lib/sync.mjs:511-515`), and for a
**major**-bump gate that compares the **lock** ref to `config.version`
(`lib/sync.mjs:1063-1075`, via `semverMajor` `lib/sync.mjs:249-253`) — but it is
**never** compared to the running `pkg.version`. Note the major-only gate would
NOT catch this incident: `v0.16.0 → v0.17.0` is the same major (`0`), so a full
version-string comparison is required.

**Self-host state (why the guard must fail-open on non-comparable versions):**
in this repo `package.json` `version` = `0.17.0` while `harness.config.json`
`version` = `0.0.0-pre` (the self-host placeholder). A naive
`pkg.version !== config.version` string compare would (a) fire spuriously on the
self-host, and (b) fire on **every** consumer, because `package.json` omits the
`v` prefix (`0.17.0`) while a pinned config carries it (`v0.17.0`). The guard
must therefore normalize the `v` prefix, only fire when BOTH sides are real
SemVer tags, and explicitly skip the `0.0.0-pre` sentinel — mirroring the
existing skip in `computeHarnessInvokeDefault` (`lib/sync.mjs:512-513`:
`v !== '0.0.0-pre'`) and the SemVer shape test used by `normalizeInitVersion`
(`bin/harness.mjs:1056`: `/^v?\d+\.\d+\.\d+/`) and `semverMajor`
(`lib/sync.mjs:251`).

The consumer-side mitigation (an INSTRUCTIONS.md "get latest first + take the pin
from `harness.config.json`" note) is tracked separately in a consumer repo and
relies on operator discipline — #502 asks the harness to make it mechanical,
which this CS delivers.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C111-1 | Introduce a running-vs-pinned **version-mismatch preflight** | Add a pure helper (proposed `computeVersionPreflight({ pkgVersion, configVersion })` exported from `lib/sync.mjs`) that returns `{ mismatch: boolean, message: string }`. The authoritative gate lives inside the sync engine `sync()` (`lib/sync.mjs`), invoked **after** config load+schema validation (`lib/sync.mjs:1049`) and **before** the template-processing loop (before `lib/sync.mjs:1252`) — a natural home is immediately after the existing major-version gate (`lib/sync.mjs:1063-1075`, "Step 5b"). On mismatch it throws a `SyncError` (proposed code `ESYNC_VERSION_MISMATCH`) whose message names both versions + the pinned re-run command. | #502 asks for a preflight "before any template rendering". Placing it in `sync()` covers **every** sync caller — direct `harness sync`, `sync --mode=check`, and startup's re-spawned check — so the stale CLI that reproduces the bug fails fast with the actionable message. Reuses the established `SyncError` fail-closed pattern (`lib/sync.mjs:1068-1073`, `1274-1277`). |
| C111-2 | Preflight trigger points + startup UX | Fire in `sync()` for **all** modes (`check`, `apply`, `dry-run`) — it is a "before rendering" invariant, not mode-specific. **Additionally** add an explicit early check step in `lib/startup.mjs` `runStartup` (a new `runVersionPreflight` runner call inserted **after** the optional `gitPullFfOnly` step and **before** `runTests`/`runLint`/`runSyncCheck`, `lib/startup.mjs:86-118`), broken-severity, short-circuiting the remaining broken checks on mismatch. | The operator lives in `startup` (#502 is a startup incident). A dedicated startup step surfaces the FULL multi-line message at the TOP of the report; relying only on `runSyncCheck` would truncate it — `runSyncCheck` summarizes with just the **last line** (`lib/startup.mjs:249` `text.trim().split('\n').slice(-1)[0]`), mangling a multi-line actionable message. Running the preflight after the pull means it sees the freshly-pulled `config.version`. |
| C111-3 | Make "invoke at the pulled pin" mechanical | **(a) Fail-fast preflight + actionable re-run message (RECOMMENDED).** Do NOT auto re-exec. The message hands the operator the exact next command; re-running it is now mechanical. Explicitly reject (b) auto re-exec-under-the-pulled-pin for CS111; note (c) an opt-in `--reexec` as a possible **future** enhancement (out of scope). | Re-exec means spawning a *different* CLI version mid-process: after `--pull-ff-only` advances `config.version`, the pulled pin is a git tag, not an installed bin, so re-exec would require a fresh `npx …#<newpin>` spawn — network-dependent, cache-dependent, and re-entrancy-risky (a buggy version probe could infinite-loop). Fail-fast is deterministic, offline, idempotent, and testable, matching the harness fail-closed doctrine (LRN-033). The self-host runs `node bin/harness.mjs` with `config.version = 0.0.0-pre`, where re-exec has no valid target anyway. |
| C111-4 | Comparison semantics (fail-open on non-comparable versions) | Compare full normalized version strings, not just major. **Fire** iff ALL hold: (i) `configVersion` matches `/^v?\d+\.\d+\.\d+/` AND `configVersion !== '0.0.0-pre'`; (ii) `pkgVersion` matches `/^v?\d+\.\d+\.\d+/`; (iii) `normalize(configVersion) !== normalize(pkgVersion)`, where `normalize` strips a single leading `v`. **Skip** (no-op) otherwise — i.e. when `config.version` is a 40-hex SHA, `0.0.0-pre`, `self`, empty, or normalizes-equal. | The repro is a **minor** bump (`v0.16.0→v0.17.0`), so a major-only check (`lib/sync.mjs:1063-1075`) misses it. The `v`-prefix normalize matches `normalizeInitVersion` (`bin/harness.mjs:1052-1057`, `withVPrefix`). The SemVer-shape gate + explicit `0.0.0-pre` skip mirror `computeHarnessInvokeDefault` (`lib/sync.mjs:512-513`) and keep the guard fail-open for SHA-pinned/self-host/`self` configs it cannot meaningfully compare (which `config.version !== 'self'` at `bin/harness.mjs:2189` shows is a real value). No schema change: `version` stays "SemVer tag or Git SHA" (`schemas/harness.config.schema.json:18-22`). |
| C111-5 | Clearer `Template file not found` error (defense-in-depth) | Enrich the `ESYNC_MISSING_TEMPLATE` throw (`lib/sync.mjs:1274-1277`) so that, for a `managed`-class target, it appends the running `pkg.version` and pinned `config.version` and hints at a possible version mismatch — in the same actionable-hint style as the adjacent managed→composed reclassification message (`lib/sync.mjs:1260-1272`). | With C111-1 firing first, this path is only reached in the **residual** case the preflight skips (e.g. a SHA-pinned config, or genuinely equal versions with a partial install). Printing both versions turns the remaining cryptic failures into diagnosable ones at near-zero cost. |
| C111-6 | Test coverage (minimums) | Unit (pure helper): (1) fires when normalized versions differ; (2) no-op when equal; (3) no-op for `0.0.0-pre`; (4) no-op for a non-SemVer SHA `config.version`; (5) no-op across the `v`-prefix asymmetry (`0.17.0` vs `v0.17.0`); (6) message includes BOTH versions AND `npx -y github:henrik-me/agent-harness#<config.version>`. Integration: (7) `sync --mode=check` throws/exits non-zero with the message when versions differ, passes when equal (existing sync test harness); (8) `runStartup` surfaces the preflight as a broken check with the full message via an injected runner (matches the existing injectable-runner style, `lib/startup.mjs:44-52`); (9) enriched `ESYNC_MISSING_TEMPLATE` message includes both versions. | Locks the fire/skip predicate and the actionable message shape (the parts #502 depends on). Uses the codebase's pure-function + injectable-runner test hygiene (`lib/startup.mjs:23-25`, R6/LRN-094) so no process spawn or real worktree is needed. Minimums only. |
| C111-7 | Where the preflight reads `pkg.version` | In `sync()`, read the RUNNING module's own `package.json` via `HARNESS_PACKAGE_ROOT` (`lib/sync.mjs:265`, `path.resolve(__dirname, '..')`), not `harnessRepoPath`. Keep the pure helper injectable (`pkgVersion` argument) so tests pass it directly. In `lib/startup.mjs`, the implementation must ADD a package-version seam — `StartupRunner` has no version-preflight seam today (`lib/startup.mjs:44-52`): read the running module's own `package.json` (via `HARNESS_PACKAGE_ROOT`) and pass it to the pure helper, or thread it through the injectable runner. (`readPackageJSON()` at `bin/harness.mjs:1028-1031` is a private CLI helper, not an existing startup seam.) | `HARNESS_PACKAGE_ROOT` is already the deliberate "running install" root for provenance (`lib/sync.mjs:255-265`); the CLI version actually executing is what must be compared. Injectability preserves pure-unit testability. |
| C111-8 | SemVer classification of this change | **Minor.** No breaking change to any public flag, API, or schema; it adds a new user-visible fail-fast gate (and a startup check line) that can change exit behavior on a detected mismatch. Note the **Patch** argument (it is fundamentally a robustness/UX bugfix with no API-surface change); classify Minor because the harness historically ships new guards/gates as Minor (cf. the `review_gates` opt-out gate in v0.5.0, `bin/harness.mjs:2189-2196`) and this introduces a new gate that alters exit behavior. **No new flag is proposed** in the recommended path, so the `requireValue` guard (LRN-040) does not apply here; if a future `--reexec` (C111-3c) is added it is a boolean flag (no value), and any value-taking flag added later MUST use the `requireValue` guard. | Keeps the release-note classification honest and bounds the flag surface to zero for CS111. |

## Deliverables

1. **`lib/sync.mjs`** — new exported pure helper (proposed `computeVersionPreflight`) implementing the C111-4 fire/skip predicate + actionable message (reusing/relocating the `#<ref>` construction so it agrees with `computeHarnessInvokeDefault`, `lib/sync.mjs:511-515`); a new `sync()` gate ("Step 5b", after `lib/sync.mjs:1063-1075`, before the template loop at `lib/sync.mjs:1252`) throwing `ESYNC_VERSION_MISMATCH` on mismatch; `pkg.version` sourced from `HARNESS_PACKAGE_ROOT` (`lib/sync.mjs:265`).
2. **`lib/sync.mjs`** — enriched `ESYNC_MISSING_TEMPLATE` message (`lib/sync.mjs:1274-1277`) printing `pkg.version` vs `config.version` + a version-mismatch hint for `managed` targets (C111-5).
3. **`lib/startup.mjs`** — a new `runVersionPreflight` runner method on the `StartupRunner` typedef (`lib/startup.mjs:44-52`) + a `createDefaultRunner` implementation (`lib/startup.mjs:192-256`); a broken-severity check inserted in `runStartup` after the pull step and before tests/lint/sync (`lib/startup.mjs:86-118`), short-circuiting the remaining broken checks on mismatch (C111-2).
4. **Tests** — the C111-6 minimum cases across the relevant `tests/*.test.mjs` (sync + startup suites).
5. **`CHANGELOG.md`** `[Unreleased]` entry describing the new preflight + clearer error; `#502` referenced for auto-close.
6. **Docs (light)** — a one-line note in `INSTRUCTIONS.md` § Session Start (`INSTRUCTIONS.md:86-94`) and/or the `startup` help text (`bin/harness.mjs:668-678`) that a version mismatch now fails fast with the pinned re-run command. No schema edit (C111-4).

## User-approval gates

- **G111-1** — approve introducing a **fail-fast** version-mismatch gate that can change exit behavior (a previously-cryptic-or-late failure now becomes an early, deliberate non-zero exit) before it lands. Blast radius: every `harness sync` / `harness startup` invocation across all consumers; the C111-4 fail-open predicate is the guard against false positives (self-host `0.0.0-pre`, SHA pins, `v`-prefix asymmetry).

## Exit criteria

1. On a running-CLI-vs-pinned-`config.version` mismatch (real SemVer tags, normalized `v`), `harness sync` (all modes) and `harness startup` fail fast with a message naming BOTH versions and printing `npx -y github:henrik-me/agent-harness#<config.version> …` — **before** any template rendering.
2. The preflight is a silent no-op when versions match, when `config.version` is `0.0.0-pre` (self-host), when it is a non-SemVer SHA/`self`, and across the `0.17.0`-vs-`v0.17.0` `v`-prefix asymmetry (C111-4).
3. The residual `Template file not found` path prints `pkg.version` vs `config.version` + a mismatch hint for managed targets (C111-5).
4. `node --test tests/*.test.mjs`, `harness lint`, and `harness sync --mode=check` are green on `main` (self-host, where the preflight correctly no-ops on `0.0.0-pre`).
5. `#502` closes on merge (auto-close reference in the CHANGELOG/PR).
6. Plan-vs-implementation review (independent GPT-5.5) verdict GO.

## Risks + open questions

| # | Risk / what breaks | Mitigation |
|---|---|---|
| R1 | A naive `pkg.version !== config.version` compare false-positives on every consumer (`v` prefix), the self-host (`0.0.0-pre`), and SHA pins — turning the "helpful" guard into a universal blocker. | C111-4: SemVer-shape gate on BOTH sides, `v`-prefix normalize (per `normalizeInitVersion`, `bin/harness.mjs:1052-1057`), explicit `0.0.0-pre` skip (per `computeHarnessInvokeDefault`, `lib/sync.mjs:512-513`); fail-open on anything non-comparable. Test cases (5) & (3)/(4) lock this. |
| R2 | Auto re-exec under the pulled pin risks infinite re-exec loops, network/cache flakiness, and cross-version state corruption. | C111-3: choose fail-fast + actionable message; defer `--reexec` (opt-in) to a future CS. |
| R3 | `startup`'s `runSyncCheck` summary keeps only the last line (`lib/startup.mjs:249`), so a multi-line actionable message would be truncated/mangled if surfaced only through the sync step. | C111-2: dedicated early `runVersionPreflight` startup step emits the full message at the top and short-circuits the noisy downstream broken checks. |
| R4 | The authoritative gate in `sync()` could block a legitimate SHA-pinned consumer whose CLI genuinely matches. | C111-4 skips non-SemVer `config.version` (SHA/`self`/empty); C111-5's enriched `Template file not found` is the residual-case safety net. |
| Q1 | Should the gate fire in `--mode=apply` and `--dry-run`, or only `--mode=check`? | C111-2 recommends all modes ("before any template rendering" is mode-agnostic); confirm at implementation that `apply`/`dry-run` callers have `config.version` loaded at the gate site (they share the `sync()` path, `lib/sync.mjs:1044-1075`). |
| Q2 | Exact error code + whether to relocate `computeHarnessInvokeDefault`'s `#<ref>` builder into a shared internal so the preflight message and the templating default cannot drift. | Resolve in implementation; prefer a single shared `#<ref>` constructor reused by both (avoids two divergent copies of the `0.0.0-pre`/allowlist rules). |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | cs111-plan-review (yoga-ah) | 405856986783 | 2026-07-06T04:17:25Z | Go-with-amendments | Verified paths/lines, #502 OPEN, 0.0.0-pre sentinel, flags/functions, fail-fast design; applied C111-7 startup-seam wording (readPackageJSON is a CLI helper, not a startup seam). |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per § Claim) | planned | — | — |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
