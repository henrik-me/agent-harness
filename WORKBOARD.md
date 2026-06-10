# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.

> **Last updated:** 2026-06-10 (CS59 CLOSED by omni-ah — release-cut process documented in OPERATIONS.md § Release process (mirrored byte-equal into template/composed); CHANGELOG dangling link fixed to `#release-process`; INSTRUCTIONS.md quick-reference pointer added (mirrored in managed template); content/release-PR admin-merge subsection scoped narrowly (solo orchestrator + both substantive reviews passed). PR #285 merged at HEAD 5a6db14. PVI **GO** at 5a6db14 (2026-06-10T06:48:57Z). Phase-2 Copilot review R1 COMMENTED (1 nit on placeholder consistency, addressed) → R2 COMMENTED (no new findings). Closes the doctrinal gap exposed by the v0.7.0 + v0.8.0 cuts (LRN-158 audit-before-build precondition now lives in `§ Pre-release audit` + `§ State-of-the-world probes`; LRN-159 stale duplicate drafts captured in post-merge step 10 recheck). No new learnings. Prior: CS58 CLOSED by omni-ah — plan-side fact-claim verification doctrine shipped: REVIEWS.md § 2.6c (F1–F6 incl. F6 state-of-the-world); OPERATIONS.md plan-review attestation + canonical preamble updated; LRN-139 + LRN-158 → applied. PR #281 merged at HEAD bb44def. Prior: CS70 CLOSED 2026-06-09 (PR #279) — v0.8.0 shipped Latest; LRN-158/159 filed.)

## Orchestrators

Status vocabulary: `🟢 Active` (Last Seen within 24h), `🟡 Idle` (24h-7d), `⚪ Offline` (>7d). Agent-ID derivation per [TRACKING.md § Agent Identification](TRACKING.md#agent-identification).

| Agent ID | Machine | Repo Folder | Status | Last Seen |
|----------|---------|-------------|--------|-----------|
| omni-ah  | OMNI         | C:\src\agent-harness | 🟢 Active | 2026-06-10 |
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
| — | no active CS | — | — | — | — | — |

> **Note:** WORKBOARD shows live coordination state only — active orchestrators and their active work. The queue lives in `project/clickstops/planned/` (priority via filename + per-file `**Depends on:**`); historical record lives in `project/clickstops/done/`. Do not duplicate either here.
