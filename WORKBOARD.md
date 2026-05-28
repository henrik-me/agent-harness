# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.

> **Last updated:** 2026-05-28 (CS55 claim — cross-repo handoff doctrine. CS54/CS56 plans remain in queue: CS54 v0.6.1 patch bundle, CS56 cross-repo CLI guardrail (CS55 precondition).)

## Orchestrators

Status vocabulary: `🟢 Active` (Last Seen within 24h), `🟡 Idle` (24h-7d), `⚪ Offline` (>7d). Agent-ID derivation per [TRACKING.md § Agent Identification](TRACKING.md#agent-identification).

| Agent ID | Machine | Repo Folder | Status | Last Seen |
|----------|---------|-------------|--------|-----------|
| omni-ah  | OMNI         | C:\src\agent-harness | 🟢 Active | 2026-05-28 |
| yoga-ah  | HENRIKM-YOGA | C:\src\agent-harness | 🟡 Idle | 2026-05-14 |

## Active Work

<!--
Active Work table accepts two empty forms (see template/seeded/WORKBOARD.md):
  (a) header-only — keep header + separator rows ONLY (form below)
  (b) em-dash placeholder — single data row with "no active CS" in Title cell
Do NOT use `_(none)_` placeholder rows — `check-workboard.mjs` will reject them.
-->

| CS-Task ID | Title | State | Owner | Branch | Last Updated | Blocked Reason |
|------------|-------|-------|-------|--------|--------------|----------------|
| CS55       | Cross-repo handoff doctrine | 🟡 Claimed | omni-ah | cs55/content | 2026-05-28 | — |

> **Note:** WORKBOARD shows live coordination state only — active orchestrators and their active work. The queue lives in `project/clickstops/planned/` (priority via filename + per-file `**Depends on:**`); historical record lives in `project/clickstops/done/`. Do not duplicate either here.
