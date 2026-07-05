# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.

> **Last updated:** 2026-07-05 (yoga-ah — **CS107 CLOSED**: cut harness release **v0.17.0** (Minor) bundling the 9 `[Unreleased]` CSs merged since v0.16.0 (CS24/26/68/71/75/76/86/87/91). file **#489** → claim **#490** → content **PR #492** (`5580087`) admin-squash-merged (gpt-5.5 R1 Go + Copilot COMMENTED; async `read-only-gates`/`copilot-review-attached` re-run green after the Copilot review landed — LRN-194; A3/A4 Model-audit agent-identity fixed by hand `yoga-ah`→`rubber-duck` — LRN-197). **Phase B:** annotated tag `v0.17.0` on the squash SHA + Release **published to Latest** (`--no-draft`). Consumers notified issue-only (**sub-invaders#152**, **authzandentitlements#149**). #229/#394 ship already-closed; **#395** stays OPEN (Rec A/C shipped; Rec B → CS106). PVI **GO** by `gpt-5.5` (8/8 deliverables). `harness lint` 37/0/3, `node --test` 1947 pass/5 skip. See CONTEXT.md for full detail.) — prior: 2026-07-04 (yoga-ah — **CS26 CLOSED**: `harness init` improvements bundle (four findings #2/#3/#6/#9 from the CS16 bootstrap; #4/#5 obsolete). #2 normalized real `version` pin (`normalizeInitVersion`); #3 new `check-config-placeholders` linter (cmdLint, JSON-aware, skips `_comment`); #6 deleted the stray root + `.github` `.gitkeep` seeds (clickstops retained); #9 seeded `.gitattributes`. Content **PR #471** (`533d8bb`) admin-squash-merged (GPT-5.5 R1-R4 Go + Copilot ×3 nits fixed; rebased onto main around CS24). Issue **#146** reconciled (plan R6, Option A): a fresh init is structurally lint-clean via `harness lint --skip config-placeholders` + the linter flags the unfilled config; sync-gate alternative (Option C) noted for maintainer review. PVI **GO** at `533d8bb` (8/8 deliverables). **LRN-202 filed** (open). `harness lint` 36/0/3, `node --test` 1836 pass. See CONTEXT.md for full detail.)

## Orchestrators

Status vocabulary: `🟢 Active` (Last Seen within 24h), `🟡 Idle` (24h-7d), `⚪ Offline` (>7d). Agent-ID derivation per [TRACKING.md § Agent Identification](TRACKING.md#agent-identification).

| Agent ID | Machine | Repo Folder | Status | Last Seen |
|----------|---------|-------------|--------|-----------|
| omni-ah  | HENRIKM-OMNI | C:\src\agent-harness | 🟢 Active | 2026-06-24 |
| omni-ah-c2 | HENRIKM-OMNI | C:\src\agent-harness_copilot2 | 🟢 Active | 2026-07-02 |
| omni-ah-c3 | HENRIKM-OMNI | C:\src\agent-harness_copilot3 | 🟢 Active | 2026-07-02 |
| yoga-ah  | HENRIKM-YOGA | C:\src\agent-harness | 🟢 Active | 2026-07-04 |
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
| CS89 | CS89 — Ship CODEOWNERS as a composed file (project local block) + secure-by-default ownership for `.github` / `SECURITY.md` / infra | 🟢 Active | yoga-ah-c2 | cs89/content | 2026-07-05 | — |

> **Note:** WORKBOARD shows live coordination state only — active orchestrators and their active work. The queue lives in `project/clickstops/planned/` (priority via filename + per-file `**Depends on:**`); historical record lives in `project/clickstops/done/`. Do not duplicate either here.
