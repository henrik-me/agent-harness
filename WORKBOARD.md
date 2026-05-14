# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.

> **Last updated:** 2026-05-14 (CS41 done — `harness copilot-engage` CLI + impl-not-reviewer linter + agent columns + review_gates default-flip merged in PR #176 admin-squash `cd11fbd`. v0.5.0 arc 2/3 complete; CS42 release-cut next. Local validation post-merge: lint 29/0/3, full suite 920 / 919 pass / 1 skip / 0 fail, sync clean.)

## Orchestrators

Status vocabulary: `🟢 Active` (Last Seen within 24h), `🟡 Idle` (24h-7d), `⚪ Offline` (>7d). Agent-ID derivation per [TRACKING.md § Agent Identification](TRACKING.md#agent-identification).

| Agent ID | Machine | Repo Folder | Status | Last Seen |
|----------|---------|-------------|--------|-----------|
| yoga-ah  | HENRIKM-YOGA | C:\src\agent-harness | 🟡 Idle | 2026-05-14 |

## Active Work

| CS-Task ID | Title | State | Owner | Branch | Last Updated | Blocked Reason |
|------------|-------|-------|-------|--------|--------------|----------------|
| —          | _no active CS_ | —     | —     | —      | —            | —              |

> **Note:** WORKBOARD shows live coordination state only — active orchestrators and their active work. The queue lives in `project/clickstops/planned/` (priority via filename + per-file `**Depends on:**`); historical record lives in `project/clickstops/done/`. Do not duplicate either here.
