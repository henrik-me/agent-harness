# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.

> **Last updated:** 2026-07-02 (omni-ah-c2 — **CS85 CLOSED**: consumer-doc clickstop-link durability — a bootstrap-authoring doctrine (*"Consumer-doc clickstop-link durability invariant"* in the composed `OPERATIONS.md` base + root mirror) + a new **`check-clickstop-link-durability`** lint guard that flags **branch-pinned** GitHub permalinks into transient `project/clickstops/active/` paths (which 404 on close-out), allows **SHA-pinned** ones, skips fenced/inline code, and — unlike the CS72/CS81 self-host-only guards — **runs in both self-host and consumer mode** (scan-mode by `package.json` name, not `target:null`). Closes the harness-side root cause of **#371** (bootstrap-authored sub-invaders `ARCHITECTURE.md` linked a now-404 `active/cs16` path + duplicated the CS16 decision table). Content **PR #386** (`0e505c5`) admin-squash-merged — **GPT-5.5 review-of-record R1-R7** (R1 Go + R2/R3/R4 caught genuine CommonMark false-negatives in the guard's inline-code skipper — mismatched backtick runs, escaped backticks, backslash-literal-inside-spans — each fixed + regression-tested; R5 Go; R6/R7 post-merge/post-rebase re-attest) + **Copilot** clean (chunk-slice suggestion applied). SemVer **Minor** (new linter). PVI **GO** by `gpt-5.5` at `0e505c5`. **LRN-180 filed** (applied). sub-invaders notified issue-only. **#371 auto-closed on merge.** **CS65 stays 🟢 Active** under omni-ah-c3. Implementer: `claude-opus-4.8` (orchestrator + sub-agent `cs85-guard`); review-of-record: `gpt-5.5` (rubber-duck) + `claude-sonnet` (Copilot).)

## Orchestrators

Status vocabulary: `🟢 Active` (Last Seen within 24h), `🟡 Idle` (24h-7d), `⚪ Offline` (>7d). Agent-ID derivation per [TRACKING.md § Agent Identification](TRACKING.md#agent-identification).

| Agent ID | Machine | Repo Folder | Status | Last Seen |
|----------|---------|-------------|--------|-----------|
| omni-ah  | HENRIKM-OMNI | C:\src\agent-harness | 🟢 Active | 2026-06-24 |
| omni-ah-c2 | HENRIKM-OMNI | C:\src\agent-harness_copilot2 | 🟢 Active | 2026-07-02 |
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
| CS102 | CS102 — harness dispatch: language-agnostic preamble core + consumer-selectable language profile | 🟢 Active | yoga-ah-c2 | cs102/content | 2026-07-03 | — |
| CS104 | CS104 — Cut harness release v0.15.0 | 🟢 Active | yoga-ah | cs104/content | 2026-07-03 | — |

> **Note:** WORKBOARD shows live coordination state only — active orchestrators and their active work. The queue lives in `project/clickstops/planned/` (priority via filename + per-file `**Depends on:**`); historical record lives in `project/clickstops/done/`. Do not duplicate either here.
