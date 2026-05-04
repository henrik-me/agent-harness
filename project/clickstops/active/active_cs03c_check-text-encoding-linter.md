# CS03c — Add `check-text-encoding.mjs` linter to harness aggregator (BOM + line endings)

**Status:** active
**Owner:** yoga-ah
**Branch:** cs03c/content
**Started:** 2026-05-04
**Closed:** —
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
| `scripts/check-text-encoding.mjs` + `tests/check-text-encoding.test.mjs` (≥9 tests) | pending | sub-agent cs03c-linter | agent-id=yoga-ah-sub-1 \| role=linter-author \| report-status=pending \| learnings=0 |
| `bin/harness.mjs` aggregator wiring + canonical briefing preamble update (root + template) | pending | orchestrator | agent-id=yoga-ah \| role=orchestrator \| report-status=pending \| learnings=0 |

## Plan-vs-implementation review

> _(filled at close-out per the gate)_
