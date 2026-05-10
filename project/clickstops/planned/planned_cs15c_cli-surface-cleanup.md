# CS15c — CLI surface cleanup (umbrella: CS04b + CS04d + CS09b)

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
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
| α4 | `tests/cs09-init.test.mjs` + `template/composed/OPERATIONS.md` + root `OPERATIONS.md` re-render | CS09b: sync-check assertion + integration-testing-checklist doc + lock-fixup commit. |

**File ownership disjointness:** ✅ — no two agents share a file.

**Sequencing within the CS:**
- Wave 1: α1, α3, α4 dispatch in parallel.
- α2 starts once α1's `opts.configPath` shape is settled (orchestrator can stub the interface ahead of time so α3 can author tests against the planned API).
- α4 runs OPERATIONS.md re-render LAST (after content commit; uses `--resolved-sha` flag).

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
| (populated at claim time per [OPERATIONS.md § Claim](../../../OPERATIONS.md#claim)) | planned | — | — |
| Close-out: docs + restart state (CONTEXT/WORKBOARD/HANDOFF + this CS file's RESUME POINT) | planned | — | — |
| Close-out: learnings + follow-ups (LEARNINGS.md within LRN-082..086 + supersede 3 planned files) | planned | — | — |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
