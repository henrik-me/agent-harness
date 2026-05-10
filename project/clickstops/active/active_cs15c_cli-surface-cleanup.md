# CS15c — CLI surface cleanup (umbrella: CS04b + CS04d + CS09b)

**Status:** active
**Owner:** yoga-ah
**Branch:** cs15c/content
**Started:** 2026-05-09
**Closed:** —
**Filed by:** Pre-CS16 backlog cleanup (planning PR for cs15-cleanup-planning, 2026-05-09); user authorization for Option C umbrella bundling 2026-05-09 ("you can add the CS structure needed to optimize for parralelism").
**Depends on:** CS04 (CLI dispatcher), CS09 (init/sync fixture)

## ⚠️ RESUME POINT — read this first if you're a fresh agent instance

This is the **first** umbrella in the pre-CS16 backlog cleanup sequence:
**CS15c → CS15d → CS15e**, executed sequentially (single-orchestrator
discipline).

CS15c bundles three small previously-planned CSs (CS04b, CS04d, CS09b) into a
single claim/content/close-out cycle to maximize throughput while preserving
file-ownership disjointness across sub-agents (per [LRN-016](../../../LEARNINGS.md#lrn-016)).

When this CS is claimed, the three superseded planned files (`planned_cs04b_*.md`,
`planned_cs04d_*.md`, `planned_cs09b_*.md`) get moved to `done/` at close-out
with the standard "absorbed by CS15c" pointer (mirrors CS04c's "partially
superseded by CS13" pattern). They MUST NOT be re-claimed independently while
CS15c is active or done.

**Bootstrap to claim:**

```powershell
cd C:\src\agent-harness
git fetch origin
git checkout main
git pull --ff-only
git --no-pager log -3 --oneline
node bin/harness.mjs lint --quiet      # expect 15/0/3
node --test tests/*.test.mjs 2>&1 | Select-String '^# (tests|pass|fail)'   # expect 538/538/0
node bin/harness.mjs sync --mode=check --cwd .   # expect "No drift detected"
```

## Goal

Land three small CLI-surface refinements in one umbrella:

1. **CS04b:** Thread `--config <path>` through `bin/harness.mjs` → `lib/sync.mjs::sync()` so that `harness sync --config alt.json` and `harness check --config alt.json` actually use the alternate config (today they exit 2 with a stop-gap rejection per [LRN-027](../../../LEARNINGS.md#lrn-027)).
2. **CS04d:** Reject `harness sync --ref <X>` and `harness check --ref <X>` with exit 2 + a documented "not yet implemented" message ([Option B chosen](../planned/planned_cs04d_global-ref-flag-wiring.md) per the planned file's recommendation; Option A — full ref-pinning impl — deferred to a future CS that designs git-ref-based template fetching properly).
3. **CS09b:** Extend `tests/cs09-init.test.mjs` to also run `harness sync --mode=check` against the init-produced repo; close [LRN-057](../../../LEARNINGS.md#lrn-057) integration-testing gap surfaced when an inline harness marker in OPERATIONS.md prose only failed under sync-check, not lint alone.

All three originate from CS04 close-out (LRN-027 + R1 NB-2) and CS09 close-out
(LRN-057). Bundling them costs 1 PR pipeline instead of 3 (~9 PRs vs ~3 PRs)
without adding scope creep — they touch nearby CLI surfaces and orchestrating
their tests in one suite is natural.

## Absorbs

| Constituent | Origin | What it brings |
|---|---|---|
| [CS04b](../planned/planned_cs04b_thread-config-flag-through-sync.md) | LRN-027 (CS04 close) | `--config` threading + 3 error paths |
| [CS04d](../planned/planned_cs04d_global-ref-flag-wiring.md) | CS04 R1 NB-2 | `--ref` Option B reject + help-text update |
| [CS09b](../planned/planned_cs09b_sync-fixture-extension.md) | LRN-057 (CS09 close) | `harness sync --mode=check` step in init fixture test |

When CS15c closes, these three files get `git mv`'d to `done/` with `**Status:**`
flipped to `done` and a one-line "absorbed by CS15c" note in their bodies.

## Resolved decisions

| Decision | Choice | Rationale |
|---|---|---|
| CS04d Option A vs B | **Option B** (explicit reject) | Recommended in the planned file; Option A requires git-aware template fetching not yet designed; reject is ~10 LOC. |
| `--config` precedence | When `--config` is set, ignore `<cwd>/harness.config.json` entirely (don't merge) | Explicit > implicit; matches `--cwd` semantics. |
| `--config` error exit codes | All three error conditions exit 1 (not 2). 2 is for argv-shape errors; 1 is for runtime/IO errors. | Matches existing `die(msg, 1)` vs `die(msg, 2)` convention in `bin/harness.mjs`. |
| CS09b test placement | Extend existing `tests/cs09-init.test.mjs` (don't add a new file) | Single source of truth for "init produced a working repo"; sync-check is a natural follow-on assertion. |

## Deliverables

### CS04b (Thread `--config`)

- [ ] `lib/sync.mjs::sync(opts)` accepts `opts.configPath` (absolute or relative). When set, read config from `opts.configPath` instead of `path.join(consumerRepoPath, 'harness.config.json')`.
- [ ] `bin/harness.mjs cmdSync` and `cmdCheck` thread `global.config` (already parsed at line ~315) into `sync()` as `opts.configPath`.
- [ ] Remove the existing exit-2 stop-gap (`bin/harness.mjs:1170` per current code).
- [ ] Three error conditions, all exit 1 with clear messages:
  - File not found → `"--config path does not exist: ${configPath}"` (already enforced at argv-validation time per line ~1084 — verify message consistency)
  - Not valid JSON → `"--config file is not valid JSON: ${configPath}\n  ${parseErrorContext}"`
  - Fails schema validation → `"--config file failed schema validation: ${configPath}\n  ${ajvErrorSummary}"`
- [ ] `--help` text for sync and check documents `--config <path>` (currently lists it under global flags but doesn't say it's wired now).

### CS04d (Reject `--ref`)

- [ ] `bin/harness.mjs cmdSync` and `cmdCheck`: when `global.ref` is non-null, exit 2 with: `"--ref is not yet implemented. To pin a harness version, set 'version' in harness.config.json."`
- [ ] `--help` text for sync and check notes `--ref` is a planned flag.
- [ ] No change to argv parser (the flag stays accepted for forward-compat; the rejection happens in the subcommand body).

### CS09b (Sync-check in init fixture)

- [ ] Extend `tests/cs09-init.test.mjs` to invoke `harness sync --mode=check --cwd <fixtureDir>` after `harness init` against an empty fixture dir.
- [ ] Assert exit code 0 (no composed-parser rejection, no drift).
- [ ] Assert no unexpected file mutations (snapshot fixture-dir contents before sync-check; assert unchanged after).
- [ ] Update `template/composed/OPERATIONS.md` "Integration testing checklist" subsection (creating it if absent) to document the init→sync-check pattern; re-render root `OPERATIONS.md` via `harness sync --mode=apply --resolved-sha <content-commit-sha> --cwd .` per [LRN-070/074](../../../LEARNINGS.md#lrn-070) (CS11b's `--resolved-sha` flag).

## Sub-agent fan-out

**4 sub-agents, single wave** (3 parallel + 1 orchestrator-owned for `bin/harness.mjs`).

| Agent | Owns (write-allowed) | Deliverables |
|---|---|---|
| α1 | `lib/sync.mjs` | CS04b: accept `opts.configPath`; 3 error paths to exit 1 with clear messages. |
| α2 (orchestrator) | `bin/harness.mjs` | CS04b threading + remove stop-gap. CS04d: explicit `--ref` reject in cmdSync/cmdCheck. Update SUBCOMMAND_HELP for both. |
| α3 | `tests/cli.test.mjs` | CS04b: ≥6 new tests (happy + 3 error paths + cwd-relative + `--config=` form). CS04d: ≥2 new tests (rejection + help text). |
| α4 | `tests/cs09-init.test.mjs` + `template/composed/OPERATIONS.md` (template-side edit only) | CS09b: sync-check assertion + integration-testing-checklist doc edit (template-side). |

**File ownership disjointness:** ✅ — no two agents share a file.

**Sequencing within the CS:**
- Wave 1: α1, α3, α4 dispatch in parallel.
- α2 starts once α1's `opts.configPath` shape is settled (orchestrator can stub the interface ahead of time so α3 can author tests against the planned API).
- **Sub-agents do NOT commit** ([OPERATIONS.md § Sub-agent dispatch](../../../OPERATIONS.md#sub-agent-dispatch); [LRN-021](../../../LEARNINGS.md#lrn-021) no-commit preflight). Agents stage edits and report back. The orchestrator stages all sub-agent output, runs full validation, makes a single content commit, and then does the post-commit lock-fixup re-render of root `OPERATIONS.md` via `node bin/harness.mjs sync --mode=apply --resolved-sha <content-commit-sha> --cwd .` per [LRN-070/074](../../../LEARNINGS.md#lrn-070) (CS11b's `--resolved-sha` flag).

## Exit criteria

- 538+ tests still pass; CS-α adds ≥10 new (≥6 CS04b + ≥2 CS04d + ≥2 CS09b).
- `harness lint --quiet`: 15/0/3 unchanged.
- `harness sync --mode=check --cwd .`: "No drift detected".
- `harness sync --config alt.json --cwd <tempRepo>` reads `alt.json`; assert against fixture.
- `harness sync --config /nonexistent --cwd <tempRepo>` exits 1 with the documented message.
- `harness sync --config malformed.json --cwd <tempRepo>` exits 1 with parse-error context.
- `harness sync --config invalid-schema.json --cwd <tempRepo>` exits 1 with Ajv error summary.
- `harness sync --ref v0.2.0` exits 2 with the documented message; `harness check --ref X` exits 2 with the same.
- `tests/cs09-init.test.mjs` includes the sync-check assertion and passes.
- No `TODO(CS04b)`, `TODO(CS04d)`, `TODO(CS09b)` markers remain.
- Three superseded planned files moved to `done/` with `**Status:** done` and "absorbed by CS15c" note.

## LRN range reservation

LRN-082..086 reserved for CS15c. Expected ~2-4 LRNs (likely: bundling-pattern learning + integration-test pattern + any sub-agent surprise).

This is a **discipline-only** reservation (no mechanical infrastructure exists yet — CS22b would add `harness reserve-lrn`). For 3 sequential umbrellas with one orchestrator, the discipline is sufficient.

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| Claim PR (rename planned → active; populate Tasks; WORKBOARD update) | done | yoga-ah | branch `cs15c/claim`; merged in PR #88 @ 8944a35 |
| Branch `cs15c/content` from main post-claim | done | yoga-ah | branched from origin/main @ 8944a35 |
| α1: `lib/sync.mjs` accept `opts.configPath`; 3 error paths exit 1 | done | sub-agent α1 | CS04b deliverable; +208 lines new test file (5/5 pass); learnings=0 |
| α2 (orchestrator): `bin/harness.mjs` thread `--config`; reject `--ref`; SUBCOMMAND_HELP updates | done | yoga-ah | CS04b + CS04d; also fixed α4's init-drift escalation by appending sync --apply at end of cmdInit |
| α3: `tests/cli.test.mjs` ≥6 CS04b tests + ≥2 CS04d tests | done | sub-agent α3 | 9 new tests in CS15c describe block; existing stop-gap tests removed; learnings=0 |
| α4: `tests/cs09-init.test.mjs` sync-check assertion + `template/composed/OPERATIONS.md` integration-testing checklist subsection | done | sub-agent α4 | CS09b deliverable; surfaced real init-drift bug — orchestrator fixed via cmdInit sync-apply finalize; learnings=0 |
| Orchestrator: stage all sub-agent output; full validation; single content commit | done | yoga-ah | content commit @ 0933e9c |
| Orchestrator: post-content lock-fixup re-render of root `OPERATIONS.md` via `--resolved-sha <content-sha>` | done | yoga-ah | lock-fixup commit @ dc350b4 (LRN-070/074) |
| Plan-vs-implementation review (gpt-5.5 rubber-duck) | done | yoga-ah | LRN-064 mandatory gate; R1 NEEDS-FIX (2 blockers) → R1 fixes in commit fa78147 → R2 GO; reviews recorded below |
| Open content PR; address review iterations; squash-merge | in_progress | yoga-ah | — |
| Close-out: docs + restart state (CONTEXT/WORKBOARD/HANDOFF + RESUME POINT in this file; rename active → done; `git mv` 3 absorbed planned files to `done/` with "absorbed by CS15c" pointer) | pending | yoga-ah | required by check-clickstop close-out enforcement |
| Close-out: learnings + follow-ups (LEARNINGS.md within LRN-082..086; document any deferred follow-ups as new planned CSs) | pending | yoga-ah | required by check-clickstop close-out enforcement |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

# CS15c Plan-vs-Implementation Review (R1)

**Reviewer:** GPT-5.5
**Date:** 2026-05-09
**Content commit:** 0933e9c197868595d44f1a0a6254cad39fac856c
**Lock-fixup commit:** dc350b43734962129a58b34121287ae8743c60bf

## Outcome

**OUTCOME: NEEDS-FIX**

## Plan coverage

| Deliverable | Plan spec | Implementation | Test coverage | Verdict |
|---|---|---|---|---|
| CS04b: --config threading | Thread explicit config through sync/check; replace default config; exit 1 with documented config-error messages. | `bin/harness.mjs:588-664`, `lib/sync.mjs:604-625`; help at `bin/harness.mjs:83-121`. Error strings diverge at `lib/sync.mjs:609-625`, `lib/sync.mjs:354-382`, `lib/sync.mjs:420-423`. | `tests/sync-config-override.test.mjs:55-204`, `tests/cli.test.mjs:959-1055`; missing `check --config` coverage and exact error-message assertions. | ✗ |
| CS04d: --ref reject (Option B) | Accept parse, reject in sync/check body with exit 2 and planned-flag message. | `bin/harness.mjs:643-649`, check delegation at `bin/harness.mjs:705-717`; help at `bin/harness.mjs:101-119`. | `tests/cli.test.mjs:1057-1095`. | ✓ |
| CS09b: init→sync-check guard | Init-produced repo must pass sync check and remain unmutated; docs updated and root re-rendered. | Post-init apply at `bin/harness.mjs:560-580`; docs at `template/composed/OPERATIONS.md:635-647` and `OPERATIONS.md:635-647`; lock pin at `.harness-lock.json:2-3`. | `tests/cs09-init.test.mjs:228-250`. | ✓ |

## Test coverage assessment (R1)

The new tests exercise the main `sync --config` path, override precedence, missing/malformed/schema-invalid configs, relative paths, `--config=` form, `--ref` rejection, and init→sync-check mutation safety. Cleanup is handled with `finally`/`t.after`, and the structure looks stable. Gaps: no direct `check --config` regression despite the goal naming it, and the config-error tests are too loose to enforce the plan's documented stderr contract.

## Gates verified locally (R1)

- `harness lint --quiet`: pass — 15 passed, 0 failed, 3 skipped
- `harness sync --mode=check --cwd .`: pass — exit 0, "No drift detected" (with active-CS warning)
- `node --test tests/*.test.mjs`: pass — 552 tests, 552 pass, 0 fail
- text-encoding: pass — exit 0
- schemas: pass — 90 passed, 0 failed
- clickstop: pass — 31 files checked, 0 errors

## Findings (R1)

### Blockers (NEEDS-FIX)

- CS04b config-error message contract is not satisfied — `lib/sync.mjs:609-625`, `lib/sync.mjs:354-382`, `lib/sync.mjs:420-423`; plan requires `--config ...` messages with the override path for not-found, invalid JSON, and schema validation failures. Current JSON/schema failures omit the config path, and some schema failures still say `harness.config.json ...`. Suggested fix: when `configPathOverride` is set, rethrow validation failures with the planned `--config file ...: ${configPath}` prefix and add exact CLI/unit assertions.
- Missing direct `check --config` regression — implementation likely works via `cmdCheck()` delegating to `cmdSync()`, but the CS goal explicitly covers `harness check --config alt.json`. Add one CLI test proving `check --config` uses the alternate config instead of `<cwd>/harness.config.json`.

### Non-blocking (NB)

(none)

## Recommendation (R1)

FIX-THEN-RE-REVIEW. The functional threading is mostly in place and all local gates pass, but CS04b's documented stderr contract and `check --config` regression coverage are incomplete enough to block close-out. After tightening those messages/tests, R2 should be straightforward.

---

# CS15c Plan-vs-Implementation Review (R2)

**Reviewer:** GPT-5.5
**Date:** 2026-05-09
**Reviewed commit:** fa781477e08185205a37a1947b20e0258f606773
**Prior review:** R1 (NEEDS-FIX, 2 blockers)

## Outcome

**OUTCOME: GO**

## R1 blocker resolution

| R1 Blocker | Status | Evidence |
|---|---|---|
| Config-error message contract | resolved | `lib/sync.mjs:604-624`, `lib/sync.mjs:634-676`; tests: `tests/cli.test.mjs:990-1057`, `tests/sync-config-override.test.mjs:123-203` |
| check --config regression coverage | resolved | `tests/cli.test.mjs:1064-1080`; pipeline verified at `bin/harness.mjs:705-716` → `bin/harness.mjs:655-664` |

## Gates verified locally (R2)

- `harness lint --quiet`: pass — 15 passed, 0 failed, 3 skipped
- `harness sync --mode=check --cwd .`: pass — No drift detected
- `node --test tests/*.test.mjs`: pass — 554 tests, 554 pass, 0 fail

## Findings (R2)

### Blockers (NEEDS-FIX)

(none)

### Non-blocking (NB)

(none)

## Recommendation (R2)

The R1 blockers are addressed. Override config paths are surfaced for not-found, malformed JSON, and schema-validation failures, while default-path behavior remains guarded by existing passing tests. Proceed with opening the CS15c content PR.
