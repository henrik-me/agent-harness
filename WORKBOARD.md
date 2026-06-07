# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.

> **Last updated:** 2026-06-07 (CS63a CLAIMED by yoga-ah-c3 — consumer structural PR gate + bypass hardening (CS63 arc sibling W1+W5); CS63 arc plan filed via PR #260. Prior: CS61b active by yoga-ah (LRN-106 header restore); CS54b CLOSED by yoga-ah-c2 — strict PR-template lock, PR #258, LRN-152.)

## Orchestrators

Status vocabulary: `🟢 Active` (Last Seen within 24h), `🟡 Idle` (24h-7d), `⚪ Offline` (>7d). Agent-ID derivation per [TRACKING.md § Agent Identification](TRACKING.md#agent-identification).

| Agent ID | Machine | Repo Folder | Status | Last Seen |
|----------|---------|-------------|--------|-----------|
| omni-ah  | OMNI         | C:\src\agent-harness | 🟡 Idle | 2026-05-28 |
| yoga-ah  | HENRIKM-YOGA | C:\src\agent-harness | 🟢 Active | 2026-06-06 |
| yoga-ah-c2 | HENRIKM-YOGA | C:\src\agent-harness_copilot2 | 🟢 Active | 2026-06-06 |
| yoga-ah-c3 | HENRIKM-YOGA | C:\src\agent-harness_copilot3 | 🟢 Active | 2026-06-07 |

## Active Work

<!--
Active Work table accepts two empty forms (see template/seeded/WORKBOARD.md):
  (a) header-only — keep header + separator rows ONLY (form below)
  (b) em-dash placeholder — single data row with "no active CS" in Title cell
Do NOT use `_(none)_` placeholder rows — `check-workboard.mjs` will reject them.
-->

| CS-Task ID | Title | State | Owner | Branch | Last Updated | Blocked Reason |
|------------|-------|-------|-------|--------|--------------|----------------|
| CS61b | Out-of-CS learnings hygiene: restore LRN-106 header + knowledge-capture doctrine (LRN-153/154) + INSTRUCTIONS rule | 🟢 Active | yoga-ah | fix/lrn-106-missing-header | 2026-06-06 | — |
| CS63a | Consumer structural PR gate + bypass hardening (CS63 arc sibling, W1+W5) | 🟢 Active | yoga-ah-c3 | cs63a/content | 2026-06-07 | — |

> **Note:** WORKBOARD shows live coordination state only — active orchestrators and their active work. The queue lives in `project/clickstops/planned/` (priority via filename + per-file `**Depends on:**`); historical record lives in `project/clickstops/done/`. Do not duplicate either here.
