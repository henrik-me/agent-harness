# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.

> **Last updated:** 2026-05-13 (CS40 done — `check-review-output.mjs` linter + `harness review-output` CLI subcommand merged at `2700d7b`, closes #145 gap #3. v0.5.0 arc 1/3 done; CS41 next: copilot-engage CLI + agent-identity columns + default-flip.)

## Orchestrators

Status vocabulary: `🟢 Active` (Last Seen within 24h), `🟡 Idle` (24h-7d), `⚪ Offline` (>7d). Agent-ID derivation per [TRACKING.md § Agent Identification](TRACKING.md#agent-identification).

| Agent ID | Machine | Repo Folder | Status | Last Seen |
|----------|---------|-------------|--------|-----------|
| yoga-ah  | HENRIKM-YOGA | C:\src\agent-harness | 🟢 Active | 2026-05-13 |

## Active Work

| CS-Task ID | Title | State | Owner | Branch | Last Updated | Blocked Reason |
|------------|-------|-------|-------|--------|--------------|----------------|
| — | _no active CS_ | — | — | — | — | — |

> **Note:** WORKBOARD shows live coordination state only — active orchestrators and their active work. The queue lives in `project/clickstops/planned/` (priority via filename + per-file `**Depends on:**`); historical record lives in `project/clickstops/done/`. Do not duplicate either here.
