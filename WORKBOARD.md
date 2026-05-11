# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.

> **Last updated:** 2026-05-11T00:55Z (CS16 claim — yoga-ah; scope refinement merged 2026-05-11; cs16/content branch)

## Orchestrators

Status vocabulary: `🟢 Active` (Last Seen within 24h), `🟡 Idle` (24h-7d), `⚪ Offline` (>7d). Agent-ID derivation per [TRACKING.md § Agent Identification](TRACKING.md#agent-identification).

| Agent ID | Machine | Repo Folder | Status | Last Seen |
|----------|---------|-------------|--------|-----------|
| yoga-ah  | HENRIKM-YOGA | C:\src\agent-harness | 🟢 Active | 2026-05-11T00:55Z |

## Active Work

| CS-Task ID | Title | State | Owner | Branch | Last Updated | Blocked Reason |
|------------|-------|-------|-------|--------|--------------|----------------|
| CS16 | Bootstrap Sub Invaders (slim scope per 2026-05-11 refinement) | claimed | yoga-ah | `cs16/content` | 2026-05-11T00:55Z | — |
| CS25 | Hotfix: ajv/ajv-formats/js-yaml → runtime deps | active | yoga-ah | `cs25/hotfix-runtime-deps` | 2026-05-11 | — |
| CS30 | SI bootstrap-feedback fixes (8 findings) | active | yoga-ah | `cs30/si-feedback-fixes` | 2026-05-11 | — |

CS16 active file: [`project/clickstops/active/active_cs16_bootstrap-sub-invaders/active_cs16_bootstrap-sub-invaders.md`](project/clickstops/active/active_cs16_bootstrap-sub-invaders/active_cs16_bootstrap-sub-invaders.md). Effective scope (per scope-refinement merged 2026-05-11): repo create + `harness init` + folder skeleton + file 4 active SI-CS planned files + 2 re-eval skeletons + bootstrap PR. All other work (Ruleset, security, ARCHITECTURE, composed blocks, stub code, Azure provisioning) is reassigned to SI-CS01..04 in `henrik-me/sub-invaders`.

> **Note:** WORKBOARD shows live coordination state only — active orchestrators and their active work. The queue lives in `project/clickstops/planned/` (priority via filename + per-file `**Depends on:**`); historical record lives in `project/clickstops/done/`. Do not duplicate either here.
