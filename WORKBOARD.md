# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.

> **Last updated:** 2026-06-10 (omni-ah-c2 — **CS69 CLOSED**: PR #295 merged at `b580260` (2026-06-10T16:14:41Z). `scripts/check-learnings.mjs` Check 7 enforces canonical `### LRN-NNN` H3 headers (strict adjacency + bare-header regex + exact digit-string id comparison, post-Copilot R1 hardening). 6 fixtures + 6 test cases (#18–#23) under `tests/fixtures/cs69/`. Real `LEARNINGS.md` (159 entries pre-merge → 161 with new LRN-160/161) passes with 0 errors. **LRN-154 → applied** with merge SHA disposition. **LRN-160 / LRN-161 filed** as `open` (gh CLI `--add-reviewer` silent no-op; intermittent GraphQL-401 storm with retry-with-backoff pattern). Review chain: 3× gpt-5.5 rubber-duck Go (R3/R4/R6) + 3× Copilot reviews (R5 No-Findings @ `8a175d4` after F1/F2/F3 fix; R7 No-Findings @ `789fc4e` after typo fix). Prior: 2026-06-10 (omni-ah-c2 — **claimed CS69** `check-learnings-header-enforcement` to apply LRN-154 (`### LRN-NNN` H3-header presence + header↔id-match rule in `scripts/check-learnings.mjs`). Plan-review R3=Go @ hash `335b2b3523c1` (gpt-5.5). Pure linter+fixtures+tests; no `template/` or `lib/*.mjs` overlap with the active CS64 work on sibling clone. Prior: 2026-06-10 (omni-ah-c2 — **filed planned CS64b** `verb-reliability-primitives` absorbing LRN-151 / LRN-155 / LRN-157 as a dedicated post-CS64 hardening CS rather than expanding active CS64 mid-flight: C64b-1 `harness doctor` probe (LRN-151 broken-loose-ref recovery), C64b-2 `lib/disposers.mjs` + `assertSafeRef` leading-dash ref rejection (LRN-157), C64b-3 `harness sync` new-managed-file reconciliation (LRN-155). CS65 / CS66 / CS67 / CS68 `**Depends on:**` preambles updated to add CS64b as a hard dependency (preamble-only, plan-review hashes intact). The three LRN dispositions redirected from "CS64 scope candidate" to "now scoped to CS64b". Prior: 2026-06-10 (omni-ah-c2 — LRN disposition pointer refresh: 7 open LRNs got `Disposition update` lines pointing at their current planned/active home CSs — LRN-151→active CS64 (added; was no Disposition), LRN-152→planned CS66 (CS58 closed without absorbing), LRN-154→planned CS69 (the planned CS exists), LRN-155→active CS64 (CS63c closed without absorbing), LRN-156→options enumerated (CS58 closed; CS65/CS66/new-linter), LRN-157→active CS64, LRN-159→planned CS67 (CS59 closed without doc). No CS file edits (avoiding plan-review hash invalidation). LRN-101 untouched — already named CS24 in its 2026-05-11 update. Prior: 2026-06-10 (CS64 CLAIMED by omni-ah — lifecycle command/skill surface: extract & leverage harness verbs. 5 new verbs (`startup`/`claim`/`close-out`/`dispatch`/`status`) + catalog + doc leverage wiring + runtime-skill spike with mandatory silent-skip mitigation + CS66/CS67 stubs. SemVer minor → v0.9.0 (G-release). G-status pre-resolved 2026-06-09 (include in CS64); G-skill resolves post-spike. Plan-review R3 Go @ 2026-06-09T17:15Z (hash `bf7dc0c2e6db`). Prior: omni-ah-c2 — pre-claim backlog disposition of CS21/CS22b/CS24/CS26: CS21 and CS22b **closed obsolete without implementation** via planned→done rename + disposition banner; CS24 and CS26 annotated with `## Status update (2026-06-09)` sections. Prior: 2026-06-10 (CS59 CLOSED by omni-ah — release-cut process documented in OPERATIONS.md § Release process; CHANGELOG dangling link fixed; INSTRUCTIONS.md pointer added; content/release-PR admin-merge subsection scoped narrowly. PR #285 admin-squash-merged at HEAD 5a6db14.) Prior: 2026-06-10 (CS58 CLOSED by omni-ah — plan-side fact-claim verification doctrine shipped: REVIEWS.md § 2.6c F1–F6; LRN-139 + LRN-158 → applied. PR #281 merged at HEAD bb44def.)

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
| CS64 | Lifecycle command/skill surface: extract & leverage harness verbs | 🟢 Active | omni-ah | cs64/content | 2026-06-10 | — |

> **Note:** WORKBOARD shows live coordination state only — active orchestrators and their active work. The queue lives in `project/clickstops/planned/` (priority via filename + per-file `**Depends on:**`); historical record lives in `project/clickstops/done/`. Do not duplicate either here.
