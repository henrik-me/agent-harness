# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.

> **Last updated:** 2026-07-02 (omni-ah-c3 — **CS65 taken over** from omni-ah-c2 (user-directed; c2 busy on other work). CS65 stays ⏸️ Paused — still gated on user-approval gates **G-target / G-threshold / Q1**, now being sought by the new owner omni-ah-c3 to resume. **Prior:** CS84 CLOSED — cut harness **v0.12.0** (draft GitHub Release pending the human's G-publish `gh release edit v0.12.0 --draft=false`).)

## Orchestrators

Status vocabulary: `🟢 Active` (Last Seen within 24h), `🟡 Idle` (24h-7d), `⚪ Offline` (>7d). Agent-ID derivation per [TRACKING.md § Agent Identification](TRACKING.md#agent-identification).

| Agent ID | Machine | Repo Folder | Status | Last Seen |
|----------|---------|-------------|--------|-----------|
| omni-ah  | HENRIKM-OMNI | C:\src\agent-harness | 🟢 Active | 2026-06-24 |
| omni-ah-c2 | HENRIKM-OMNI | C:\src\agent-harness_copilot2 | 🟢 Active | 2026-06-10 |
| omni-ah-c3 | HENRIKM-OMNI | C:\src\agent-harness_copilot3 | 🟢 Active | 2026-07-02 |
| yoga-ah  | HENRIKM-YOGA | C:\src\agent-harness | 🟢 Active | 2026-06-08 |
| yoga-ah-c2 | HENRIKM-YOGA | C:\src\agent-harness_copilot2 | 🟢 Active | 2026-06-06 |
| yoga-ah-c3 | HENRIKM-YOGA | C:\src\agent-harness_copilot3 | 🟢 Active | 2026-06-08 |

## Active Work

<!--
Active Work table accepts two empty forms (see template/seeded/WORKBOARD.md):
  (a) header-only — keep header + separator rows ONLY (form below)
  (b) em-dash placeholder — single data row with "no active CS" in Title cell
Do NOT use `_(none)_` placeholder rows — `check-workboard.mjs` will reject them.
-->

| CS-Task ID | Title | State | Owner | Branch | Last Updated | Blocked Reason |
|------------|-------|-------|-------|--------|--------------|----------------|
| CS65 | CS65 — Process-doc right-sizing: OPERATIONS.md extraction + LEARNINGS.md archival | ⏸️ Paused | omni-ah-c3 | cs65/content | 2026-07-02 | Taken over from omni-ah-c2 (2026-07-02, user-directed; c2 busy on other work). Still gated on user-approval gates G-target/G-threshold/Q1 — new owner omni-ah-c3 is seeking answers to resume. |
| CS85 | CS85 — Consumer-doc clickstop-link durability: bootstrap-authoring doctrine + a link-durability guard (fixes #371, harness-side) | 🟢 Active | omni-ah-c2 | cs85/content | 2026-07-02 | — |

> **Note:** WORKBOARD shows live coordination state only — active orchestrators and their active work. The queue lives in `project/clickstops/planned/` (priority via filename + per-file `**Depends on:**`); historical record lives in `project/clickstops/done/`. Do not duplicate either here.
