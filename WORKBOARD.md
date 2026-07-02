# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.

> **Last updated:** 2026-07-02 (omni-ah-c3 — **CS65 resumed 🟢 Active**: @henrik-me gave sign-off; the T0 user-approval gates are resolved (G-target = ≈600-line *goal* not hard enforcement; G-threshold = archive `applied`/`obsolete` entries dated `<2026-06-01` via **stub-redirect** so all inbound anchors still resolve; Q1 = single `LEARNINGS-archive.md`). Implementation next on `cs65/content` — T4 resolvability guard + T2 OPERATIONS thinning to `harness <cmd> --help` pointers + T3 LEARNINGS archival. CS85 stays 🟢 Active under omni-ah-c2.)

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
| CS65 | CS65 — Process-doc right-sizing: OPERATIONS.md extraction + LEARNINGS.md archival | 🟢 Active | omni-ah-c3 | cs65/content | 2026-07-02 | — |
| CS85 | CS85 — Consumer-doc clickstop-link durability: bootstrap-authoring doctrine + a link-durability guard (fixes #371, harness-side) | 🟢 Active | omni-ah-c2 | cs85/content | 2026-07-02 | — |

> **Note:** WORKBOARD shows live coordination state only — active orchestrators and their active work. The queue lives in `project/clickstops/planned/` (priority via filename + per-file `**Depends on:**`); historical record lives in `project/clickstops/done/`. Do not duplicate either here.
