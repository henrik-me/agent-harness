# CS03c — Add `check-text-encoding.mjs` linter to harness aggregator (BOM + line endings)

**Status:** done
**Owner:** yoga-ah
**Branch:** cs03c/content (squash-merged as `fcb635e`)
**Started:** 2026-05-04
**Closed:** 2026-05-04
**Filed by:** CS03b close-out per [LRN-065](../../../LEARNINGS.md#lrn-065). Scope extended at claim time to also cover line endings (LRN-074, surfaced in CS11 close-out R1/R2 — Windows core.autocrlf + sync drift gate interaction).
**Depends on:** CS03b, CS11 (self-host so the linter exercises against rendered root files).

## Goal

Add a `scripts/check-text-encoding.mjs` linter that detects (a) UTF-8 BOM and (b) CRLF line endings in any text file under the consumer repo and fails with a clear diagnostic. Wire it into `bin/harness.mjs` `cmdLint` aggregator. Mechanically prevents two recurring failure modes:
- **BOM creep** (LRN-006, LRN-018, LRN-065) from sub-agent file writes on Windows.
- **CRLF creep** (CS11 close-out R1/R2; LRN-074 to be filed at this CS's close-out) from git's `core.autocrlf=true` on Windows interacting with `applyTemplating()` (which produces LF) and `harness sync --mode=check` (which compares working-tree bytes against lock hashes).

## Background

Multiple LRNs documented BOM/EOL incidents:
- [LRN-006](../../../LEARNINGS.md#lrn-006) — `create` tool on Windows writes CRLF.
- [LRN-018](../../../LEARNINGS.md#lrn-018) — file creates may carry BOM.
- [LRN-065](../../../LEARNINGS.md#lrn-065) — full-file rewrites by sub-agents on Windows can reintroduce BOM (CS03b).
- LRN-074 (filed at this CS's close-out) — Windows autocrlf + harness sync drift gate (CS11).

Each was caught at content-PR review by the orchestrator after sub-agents' self-checks failed to surface it. A linter run by both sub-agent self-checks AND `harness lint --quiet` would catch it at the source.

## Deliverables

- [ ] `scripts/check-text-encoding.mjs` — CLI: `node scripts/check-text-encoding.mjs --dir <path> [--include <ext,...>] [--exclude <glob,...>] [--quiet] [--no-check-bom] [--no-check-line-endings]`. `requireValue` guard (LRN-040). Default `--include`: text-file extensions (`.md`, `.mjs`, `.js`, `.json`, `.yml`, `.yaml`, `.sh`, `.ps1`, `.txt`, `.sql`, `.html`, `.css`). Default `--exclude`: `node_modules/`, `.git/`. For each matched file: (1) read first 3 bytes — if `EF BB BF`, report BOM violation; (2) scan content for `\r\n` or bare `\r` — if found, report line-endings violation. Exit 0 / 1 (any violation) / 2 (usage error). Stdout for report; stderr for usage errors. `--quiet` suppresses success stdout.
- [ ] Wire into `bin/harness.mjs` `cmdLint` as a new linter named `text-encoding`. Per LRN-038 single-source config: aggregator threads `--cwd` through. Linter is enabled by default; can be skipped with `--skip text-encoding`.
- [ ] Tests: `tests/check-text-encoding.test.mjs` — covering: (a) clean fixture passes, (b) BOM-bearing file fails with BOM violation, (c) CRLF-bearing file fails with line-endings violation, (d) both violations together, (e) `--include` narrowing, (f) `--exclude` narrowing, (g) `--no-check-bom` skips BOM check, (h) `--no-check-line-endings` skips line-endings check, (i) usage error on missing `--dir`.
- [ ] Update sub-agent briefing canonical preamble in `template/composed/OPERATIONS.md` § Mandatory briefing preamble § Self-checks (and root mirror): replace the current PowerShell BOM-check snippet with "Run `node scripts/check-text-encoding.mjs --dir <owned-paths> --quiet` and confirm exit 0".

## Exit criteria

- `node bin/harness.mjs lint --quiet` runs check-text-encoding against this repo and exits 0 (13 linters total now, was 12).
- New linter test ≥9.
- All existing tests pass (436+ baseline).
- Sub-agent canonical briefing preamble updated (root + template).
- No `TODO(CS03c)` markers remain.

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| `scripts/check-text-encoding.mjs` + `tests/check-text-encoding.test.mjs` (≥9 tests) | done | sub-agent cs03c-linter | agent-id=yoga-ah-sub-1 \| role=linter-author \| report-status=complete \| learnings=0 |
| `bin/harness.mjs` aggregator wiring + canonical briefing preamble update (root + template) | done | orchestrator | agent-id=yoga-ah \| role=orchestrator \| report-status=complete \| learnings=0 |

## Plan-vs-implementation review

**Reviewer:** GPT-5.5 (rubber-duck)
**Date:** 2026-05-04
**Outcome:** GO (R2 verdict; R1 found 1 blocker, fixed inline)

### Plan vs implementation

| Deliverable | What got built | Outcome | Notes |
|---|---|---|---|
| `scripts/check-text-encoding.mjs` (BOM + CRLF detection, glob/exclude flags, `--quiet`, exit 0/1/2) | Authored 167 lines; default `--include` covers 12 text extensions; `--exclude` uses directory-segment matching (R1 fix); `requireValue` guard on every value-taking flag | match | R1 caught a real bug: substring exclude match was skipping `.github/`. Fixed to segment-prefix match. |
| `tests/check-text-encoding.test.mjs` (≥9 tests) | 14 tests (9 required + 3 extras + 2 R1-regression for the segment-match bug) | match | Includes self-host check (`--dir REPO_ROOT` exits 0). |
| `bin/harness.mjs cmdLint` aggregator wired with `text-encoding` linter | Added after `workflow-pins`; always enabled; skip via `--skip text-encoding` | match | `harness lint --quiet` now reports 13 pass / 0 fail / 3 skipped (was 12/0/3). |
| Canonical sub-agent briefing preamble updated (root + template) | Replaced inline PowerShell BOM-check snippet with `node scripts/check-text-encoding.mjs --dir <owned-paths> --quiet`; updated SELF-CHECKS RUN report-shape line accordingly | match | Single-command self-check is more reliable than the previous PowerShell scriptlet. |
| `harness sync --mode=apply` re-run after template edit (LRN-070 pattern) | Lock refreshed; `sync --mode=check` exits 0 cleanly | match | — |

### Test coverage

Sufficient. Final state:
- `node --test tests/*.test.mjs` → **450 pass / 0 fail** (was 436 baseline; +14 in tests/check-text-encoding.test.mjs).
- `node bin/harness.mjs lint --quiet` → 13 pass / 0 fail / 3 skipped.
- `node bin/harness.mjs sync --mode=check --cwd .` → No drift detected.
- `node scripts/check-text-encoding.mjs --dir .` → 338 files checked, 0 violations.

### Findings

R1 (NEEDS-FIX, 1 blocker):
- `.git` substring match in default exclude was false-matching `.github/`, hiding any future BOM/CRLF in workflow/copilot-instructions files. Fixed via segment-prefix match (`relPathNorm === p || relPathNorm.startsWith(p + '/')`); 2 new regression tests pin the correct behavior.

R2: GO. No remaining blockers. Linter is the third CS-introduced enforcement gate (after CS03b plan-vs-impl review gate and CS11 harness-self-check.yml drift gate); the discipline-based BOM/EOL convention now has mechanical backing.
