# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.

> **Last updated:** 2026-05-12 (CS34 claimed: check-cs-plan.mjs linter — flag harness-repo paths in consumer-targeted CS plans; orchestrator yoga-ah)

## Orchestrators

Status vocabulary: `🟢 Active` (Last Seen within 24h), `🟡 Idle` (24h-7d), `⚪ Offline` (>7d). Agent-ID derivation per [TRACKING.md § Agent Identification](TRACKING.md#agent-identification).

| Agent ID | Machine | Repo Folder | Status | Last Seen |
|----------|---------|-------------|--------|-----------|
| yoga-ah  | HENRIKM-YOGA | C:\src\agent-harness | 🟢 Active | 2026-05-12 |

## Active Work

| CS-Task ID | Title | State | Owner | Branch | Last Updated | Blocked Reason |
|------------|-------|-------|-------|--------|--------------|----------------|
| CS34 | `check-cs-plan.mjs` linter — flag harness-repo paths in consumer-targeted CS plans (LRN-105 follow-up) | claim | yoga-ah | `cs34/content` | 2026-05-12 | — |

> **Note:** WORKBOARD shows live coordination state only — active orchestrators and their active work. The queue lives in `project/clickstops/planned/` (priority via filename + per-file `**Depends on:**`); historical record lives in `project/clickstops/done/`. Do not duplicate either here.
