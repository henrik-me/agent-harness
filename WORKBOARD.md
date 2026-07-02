# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.

> **Last updated:** 2026-07-02 (omni-ah-c2 — **CS84 CLOSED** (cut harness **v0.12.0** — Minor, CS83's `harness_invoke` key + #369 docs), content merge `3e66461`; annotated tag `v0.12.0` + **one DRAFT** GitHub Release + sub-invaders pin-bump issue #139. **G-publish pending:** the human runs `gh release edit v0.12.0 --draft=false` to publish to Latest. CS65 stays ⏸️ Paused (blocked on user gates).)

## Orchestrators

Status vocabulary: `🟢 Active` (Last Seen within 24h), `🟡 Idle` (24h-7d), `⚪ Offline` (>7d). Agent-ID derivation per [TRACKING.md § Agent Identification](TRACKING.md#agent-identification).

| Agent ID | Machine | Repo Folder | Status | Last Seen |
|----------|---------|-------------|--------|-----------|
| omni-ah  | HENRIKM-OMNI | C:\src\agent-harness | 🟢 Active | 2026-06-24 |
| omni-ah-c2 | HENRIKM-OMNI | C:\src\agent-harness_copilot2 | 🟢 Active | 2026-06-10 |
| omni-ah-c3 | HENRIKM-OMNI | C:\src\agent-harness_copilot3 | 🟢 Active | 2026-06-10 |
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
| CS65 | CS65 — Process-doc right-sizing: OPERATIONS.md extraction + LEARNINGS.md archival | ⏸️ Paused | omni-ah-c2 | cs65/content | 2026-07-02 | Blocked on unanswered user-approval gates (G-target/G-threshold/Q1); CS81+CS82 (#352/#356 remediation) now closed — reclaimable by owner once the gates are answered |

> **Note:** WORKBOARD shows live coordination state only — active orchestrators and their active work. The queue lives in `project/clickstops/planned/` (priority via filename + per-file `**Depends on:**`); historical record lives in `project/clickstops/done/`. Do not duplicate either here.
