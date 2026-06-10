# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.

> **Last updated:** 2026-06-10 (omni-ah-c2 — pre-claim backlog disposition of CS21/CS22b/CS24/CS26: CS21 (gwn process harvest) and CS22b (multi-orchestrator coordination) **closed obsolete without implementation** via planned→done rename + disposition banner (premise inverted for CS21; discipline-only multi-orch has won in practice for CS22b); CS24 (CHANGELOG-touch linter) and CS26 (init improvements bundle) annotated with `## Status update (2026-06-09)` sections — CS24 still relevant but lower-value (convention organically adopted across ~30 CSs), CS26 partially obsolete (findings #4/#5 done by other means; #2/#3/#6/#9 remain — #6 has a new mechanism via seeded `.gitkeep` rather than `cmdInit` code, but the root-`.gitkeep` defect persists for fresh consumers). Prior: 2026-06-10 (CS59 CLOSED by omni-ah — release-cut process documented in OPERATIONS.md § Release process (mirrored into template/composed/); CHANGELOG dangling link fixed; INSTRUCTIONS.md pointer added (mirrored in template/managed/); content/release-PR admin-merge subsection scoped narrowly. PR #285 admin-squash-merged at HEAD 5a6db14.) Prior: 2026-06-10 (CS58 CLOSED by omni-ah — plan-side fact-claim verification doctrine shipped: REVIEWS.md § 2.6c (F1–F6 incl. F6 state-of-the-world); OPERATIONS.md plan-review attestation + canonical preamble updated; LRN-139 + LRN-158 → applied. PR #281 merged at HEAD bb44def.)

## Orchestrators

Status vocabulary: `🟢 Active` (Last Seen within 24h), `🟡 Idle` (24h-7d), `⚪ Offline` (>7d). Agent-ID derivation per [TRACKING.md § Agent Identification](TRACKING.md#agent-identification).

| Agent ID | Machine | Repo Folder | Status | Last Seen |
|----------|---------|-------------|--------|-----------|
| omni-ah  | HENRIKM-OMNI | C:\src\agent-harness | 🟢 Active | 2026-06-10 |
| omni-ah-c2 | HENRIKM-OMNI | C:\src\agent-harness_copilot2 | 🟢 Active | 2026-06-10 |
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
