# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.

> **Last updated:** 2026-05-13 (CS39 claimed: release v0.4.0 (CHANGELOG version-bump + package.json bump + tag push + cross-repo SI pin-bump SUB-CS PR). Final CS in v0.4.0 #145 enforcement-gap arc. After this lands, the v0.4.0 arc is complete and queue advances to v0.5.0 arc (CS40 → CS41 → CS42). CS35+CS35b+CS36+CS37+CS38a+CS38b done; CS39 active. Orchestrator yoga-ah active.)

## Orchestrators

Status vocabulary: `🟢 Active` (Last Seen within 24h), `🟡 Idle` (24h-7d), `⚪ Offline` (>7d). Agent-ID derivation per [TRACKING.md § Agent Identification](TRACKING.md#agent-identification).

| Agent ID | Machine | Repo Folder | Status | Last Seen |
|----------|---------|-------------|--------|-----------|
| yoga-ah  | HENRIKM-YOGA | C:\src\agent-harness | 🟢 Active | 2026-05-13 |

## Active Work

| CS-Task ID | Title | State | Owner | Branch | Last Updated | Blocked Reason |
|------------|-------|-------|-------|--------|--------------|----------------|
| CS39 | Release v0.4.0 + file SI pin-bump SUB-CS | active | yoga-ah | cs39/release-v0.4.0 | 2026-05-13 | — |

> **Note:** WORKBOARD shows live coordination state only — active orchestrators and their active work. The queue lives in `project/clickstops/planned/` (priority via filename + per-file `**Depends on:**`); historical record lives in `project/clickstops/done/`. Do not duplicate either here.
