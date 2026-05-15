# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.

> **Last updated:** 2026-05-14 (Post-v0.5.2 retroactive close-out sweep: CS48-CS52 renamed `planned/ → done/` with close-out compression notes via PR #204 (after PR #203 docs refresh). Main HEAD `f8fefeb` pre-PR-204. Issues #138-#142 closed. yoga-ah → 🟡 Idle. **Suggested next CSs are priority-ordered in [CONTEXT.md § Suggested next CSs](CONTEXT.md#suggested-next-css-priority-ordered)** — top of list: cut v0.6.0 (CS51+CS52 are minor-worthy), then claim CS47.)

## Orchestrators

Status vocabulary: `🟢 Active` (Last Seen within 24h), `🟡 Idle` (24h-7d), `⚪ Offline` (>7d). Agent-ID derivation per [TRACKING.md § Agent Identification](TRACKING.md#agent-identification).

| Agent ID | Machine | Repo Folder | Status | Last Seen |
|----------|---------|-------------|--------|-----------|
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

> **Note:** WORKBOARD shows live coordination state only — active orchestrators and their active work. The queue lives in `project/clickstops/planned/` (priority via filename + per-file `**Depends on:**`); historical record lives in `project/clickstops/done/`. Do not duplicate either here.
