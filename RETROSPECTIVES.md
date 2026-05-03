# RETROSPECTIVES (proto, CS01)

Definition of "learning" and harvest procedure. Hand-maintained until CS11. Canonical version authored in CS08 as `template/managed/RETROSPECTIVES.md`.

## What is a "learning"?

A **learning** is a durable, project-applicable insight surfaced by completing a CS/task/plan, that:

1. **isn't already captured** in INSTRUCTIONS / CONVENTIONS / OPERATIONS / RETROSPECTIVES / ARCHITECTURE / TRACKING / REVIEWS;
2. **would change** how a future agent or operator approaches similar work;
3. is **concrete and verifiable** (not opinion).

If a finding fails any of those three tests, it isn't a learning — it might be a doc fix, a CS to file, or just noise.

## Categories

- `architectural` — a constraint, invariant, or trade-off discovered
- `operational` — a procedural pitfall or recipe
- `tooling` — a tool/library quirk that bit us
- `process` — a workflow gap that caused waste
- `anti-pattern` — an approach we tried and shouldn't repeat

## Entry shape

Each entry in [LEARNINGS.md](LEARNINGS.md) has:

```markdown
### LRN-<NNN> · <YYYY-MM-DD> · <category> · <source-cs>

**Tags:** [optional list]
**Claim-area:** [optional, drives before-claim prompts]
**Problem:** ...
**Finding:** ...
**Evidence:** PR #..., commit <sha>, log link
**Status:** open | applied | obsolete | deferred
**Disposition:** (filled by harvest) — applied to CONVENTIONS.md § Migrations / filed CS37 / etc.
**Deferred-until:** YYYY-MM-DD (only if status=deferred)
```

CS05's `check-learnings.mjs` will eventually enforce the schema.

## Harvest procedure

The harvest procedure runs in two cadences:

### Weekly (orchestrator-triggered)

Run `harness harvest` (CS04+). For each `open` learning:

1. **Apply upstream:** edit INSTRUCTIONS / CONVENTIONS / OPERATIONS / RETROSPECTIVES / ARCHITECTURE / TRACKING / REVIEWS as appropriate. Mark `applied` with the commit SHA.
2. **File a CS:** for tooling / automation gaps. Link the CS; leave `open` until CS closes.
3. **Obsolete:** no longer relevant. Mark with reason.
4. **Defer:** leave `open` with explicit reason + `deferred-until` date. The CLI prevents repeated indefinite defers — after the second defer, the learning is auto-escalated to weekly-harvest only and dropped from before-claim prompts.

### Before-claim (bounded; runs as part of `harness harvest`)

Triggered by `claim` flow. Only prompts the user when at least one of:

- a stale `open` learning is tagged `process` or `architectural`;
- a stale `open` learning has `claim-area` matching the area being claimed.

Output is batched: "3 stale learnings; choose apply / defer / obsolete / skip-for-this-CS each."

If no stale relevant learning exists, the prompt is silent.

## What to capture as learnings

- "X assumption turned out to be wrong because Y." → architectural or operational
- "Tool Z silently drops Q under W condition." → tooling
- "We waited N days for review-of-review because the docs didn't say who approves." → process
- "We tried approach A and it had blast-radius B; don't do this again." → anti-pattern

## What NOT to capture

- Style preferences ("I prefer arrow functions").
- Restatements of existing INSTRUCTIONS/CONVENTIONS rules.
- Opinions without evidence.
- Implementation details that only matter for one specific file.

If unsure, file it as `open` and let the next harvest sort it out — the harvest disposition itself becomes calibration data.
