# CS03c — Add `check-no-bom.mjs` linter to harness aggregator

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** CS03b close-out per [LRN-065](../../../LEARNINGS.md#lrn-065).
**Depends on:** CS03b

## Goal

Add a `scripts/check-no-bom.mjs` linter that detects UTF-8 BOM in any text file under the consumer repo and fails with a clear diagnostic. Wire it into `bin/harness.mjs` `cmdLint` aggregator. Mechanically prevents the BOM-creep failure mode surfaced repeatedly by sub-agent file writes on Windows (LRN-006, LRN-018, LRN-065).

## Background

Three separate LRNs have documented sub-agent-introduced BOM:
- [LRN-006](../../../LEARNINGS.md#lrn-006) — `create` tool on Windows writes CRLF (BOM-adjacent issue).
- [LRN-018](../../../LEARNINGS.md#lrn-018) — file creates may carry BOM.
- [LRN-065](../../../LEARNINGS.md#lrn-065) — full-file rewrites by sub-agents on Windows can reintroduce BOM (CS03b).

Each was caught at content-PR review by the orchestrator after sub-agents' self-checks failed to surface it. A linter run by both sub-agent self-checks AND `harness lint --quiet` would catch it at the source.

## Deliverables

- [ ] `scripts/check-no-bom.mjs` — CLI: `node scripts/check-no-bom.mjs --cwd <path> [--include <glob,...>] [--exclude <glob,...>] [--quiet]`. `requireValue` guard (LRN-040). Default `--include`: text-file extensions (`*.md`, `*.mjs`, `*.js`, `*.json`, `*.yml`, `*.yaml`, `*.sh`, `*.ps1`, `*.txt`, `*.sql`, `*.html`). Default `--exclude`: `node_modules/`, `.git/`. For each file, read first 3 bytes; if `EF BB BF`, report violation. Exit 0/1/2.
- [ ] Wire into `bin/harness.mjs` `cmdLint` as a 14th linter (per LRN-038 single-source config; per `lint --only=no-bom` etc.).
- [ ] Tests: `tests/check-no-bom.test.mjs` — happy path (no BOM in fixture tree), violation (fixture tree with BOM file), `--include`/`--exclude` glob behavior, exit codes.
- [ ] Update sub-agent briefing template in `template/composed/OPERATIONS.md` § Sub-agent dispatch § Self-checks: "Run `node scripts/check-no-bom.mjs --cwd <owned-paths>` as part of self-checks." Mirror in root.

## Exit criteria

- `node bin/harness.mjs lint --quiet` runs check-no-bom against this repo and exits 0.
- New linter test ≥6.
- All existing tests pass (432+ baseline).
- Sub-agent briefing template updated (root + template).
- No `TODO(CS03c)` markers remain.

## Sub-agent fan-out

Single sub-agent (linter author) + orchestrator wires aggregator + briefing-template edit. ~2 sub-tasks.

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per OPERATIONS.md § Claim) | planned | — | — |

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
