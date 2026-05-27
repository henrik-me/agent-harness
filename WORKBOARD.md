# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.

> **Last updated:** 2026-05-27 (CS53 fully closed + SI PR #79 squash-merged at `cbaa608b`. **CS54 planned** (`planned_cs54_v0.6.1-doc-cleanups-and-cross-repo-checklist.md`) for v0.6.1 patch bundling 2 real Copilot-surfaced template defects + LRN-134/135/136 codification + `reviews.*` / `review_gates.*` schema disambiguation. See the CS54 plan `## Plan review` table for the authoritative round/hash status (avoiding banner drift). CS47 detached-HEAD fix still top of suggested-next queue; CS54 second priority.)

## Orchestrators

Status vocabulary: `🟢 Active` (Last Seen within 24h), `🟡 Idle` (24h-7d), `⚪ Offline` (>7d). Agent-ID derivation per [TRACKING.md § Agent Identification](TRACKING.md#agent-identification).

| Agent ID | Machine | Repo Folder | Status | Last Seen |
|----------|---------|-------------|--------|-----------|
| omni-ah  | OMNI         | C:\src\agent-harness | 🟡 Idle | 2026-05-27 |
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
