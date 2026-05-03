# Learnings & Decisions

> **Last updated:** 2026-05-03

This file captures durable, project-applicable insights surfaced by completing CSs. See [RETROSPECTIVES.md](RETROSPECTIVES.md) for the precise definition of a "learning", the entry schema, and the harvest procedure.

**Pre-CS15b harvest invariant:** all `open` learnings must be dispositioned (status `applied`, `obsolete`, or `deferred` with explicit `deferred_until`) **before** the CS15b public-flip. This is enforced by the CS15a precondition checklist (see cs-plan). Per [LRN-003](#lrn-003) below.

**Entry schema (proto, CS01).** Each entry begins with a YAML frontmatter code fence containing the fields `id`, `date`, `category`, `source_cs`, `status`, `tags[]`, `claim_area?`, `deferred_until?`. Body follows in markdown with sections `Problem`, `Finding`, `Evidence`, `Disposition`, and any `Implications` etc. Locked into a JSON Schema by **CS02's** `schemas/learning.schema.json` (per cs-plan CS02 deliverables); CS05 builds `check-learnings.mjs` against that schema and uses the entries below as regression fixtures.

---

## Open

(none — see Applied below)

## Applied

### LRN-001

```yaml
id: LRN-001
date: 2026-05-02
category: tooling
source_cs: CS01
status: applied
tags: [github, branch-protection, private-repo, cost]
claim_area: repo-policy
```

**Problem:** The CS plan and CS01 OPERATIONS.md assumed branch protection on `main` would be enabled immediately after the bootstrap commit, providing mechanical enforcement (PR-required, etc.) from commit 2 onward.

**Finding:** **Both** classic branch protection rules **and** the modern Rulesets feature return HTTP 403 with "Upgrade to GitHub Pro or make this repository public to enable this feature" on private repos in the free tier. Verified via `gh api` against `henrik-me/agent-harness`. Mechanical branch protection is therefore not available until either (a) we flip the repo public, or (b) we upgrade to GitHub Pro.

**Evidence:** Bootstrap-commit attempt to enable protection in CS01 shell session, 2026-05-02 ~22:30 UTC. Both `PUT repos/.../branches/main/protection` and `POST repos/.../rulesets` returned 403 with the same upgrade message.

**Disposition:** **Disposition (1) chosen by user 2026-05-02T23:55Z:** discipline-only enforcement for CS01–CS14; mechanical enforcement begins at CS15b (public flip). Applied to: `OPERATIONS.md` § Bootstrap exception + § Claim + new § Enforcement model; `INSTRUCTIONS.md` Quick Reference Checklist claim line; CS01 done file Tasks table (branch-protection task removed); cs-plan working-model phases table + per-CS loop wording + CS01 deliverables.

**Implications carried forward:**
- The "spirit phase" framing in the cs-plan was right; the mechanism statement was wrong. CS01–CS14 are now consistently labeled discipline-only.
- The `workboard-auto-approve.yml` workflow (Decision #23) is built at CS15a but is not mechanically required until CS15b's Ruleset goes live.
- Future repos consuming the harness on a private free tier will hit this same wall — see [LRN-002](#lrn-002).
- Disposition (2) (upgrade to Pro for $4/mo) remains available if discipline-only proves insufficient during CS01–CS14.

### LRN-002

```yaml
id: LRN-002
date: 2026-05-02
category: process
source_cs: CS01
status: applied
tags: [harness-init, consumer-experience, private-repo]
claim_area: consumer-onboarding
```

**Problem:** When a future consumer (Sub Invaders, or any other private repo) runs `harness init` (CS04+), they will hit the same private-repo branch-protection wall as [LRN-001](#lrn-001) if they're on a free tier. They will not know this until they try, and the failure will be at a confusing moment (mid-init).

**Finding:** `harness init` should detect the consumer's repo visibility + tier and surface the constraint upfront with the same disposition options (discipline-only / upgrade / flip-public-when-ready). It should also produce a `.harness-known-constraints.md` artifact in the consumer repo so the operator has a written record of what to expect.

**Evidence:** [LRN-001](#lrn-001) + the cs-plan's CS16 (Sub Invaders bootstrap) + general principle that the harness should not surprise consumers with avoidable constraints.

**Disposition:** Filed as **planned CS** [`project/clickstops/planned/planned_cs04a_harness-init-detect-private-tier.md`](project/clickstops/planned/planned_cs04a_harness-init-detect-private-tier.md) (created during CS01 close-out, see that file for scope). Will be picked up after CS04 lands. No upstream doc edits needed.

### LRN-003

```yaml
id: LRN-003
date: 2026-05-02
category: process
source_cs: CS01
status: applied
tags: [harvest, public-flip, gating]
claim_area: repo-policy
```

**Problem:** The original CS15a precondition #4 only flagged stale `open` learnings older than 14 days tagged `process` or `architectural`. It allowed flipping public with non-stale `open` learnings still uncategorised.

**Finding:** The user's directive (2026-05-02 message: "ensure we follow up before making the repo public") tightens this: **every** `open` learning must be dispositioned before CS15b — not just stale ones. Otherwise we risk shipping public with unresolved process questions.

**Evidence:** User directive 2026-05-02. The 14-day stale check is necessary but not sufficient.

**Disposition:** Tightened CS15a precondition list to require zero `open` learnings (any age) before CS15b. Pre-CS15b harvest invariant added to top of this file. cs-plan CS15a precondition #4 reworded.

### LRN-004

```yaml
id: LRN-004
date: 2026-05-02
category: process
source_cs: CS01
status: applied
tags: [learnings-schema, format-discipline]
claim_area: docs-schema
```

**Problem:** The `LEARNINGS.md` entry schema is described in `RETROSPECTIVES.md` and prescribed in the cs-plan, but no linter enforces it until CS05 lands `check-learnings.mjs`. Hand-authored entries between CS01 and CS05 may drift from the schema.

**Finding:** Author entries strictly to the prescribed shape — **per-entry YAML frontmatter code fence** with `id`, `date`, `category`, `source_cs`, `status`, `tags[]`, `claim_area?`, `deferred_until?` — so that when the linter lands at CS05, no retrofit is needed. CS05 fixtures should include CS01–CS05 learnings to prove backward-compatibility.

**Evidence:** This file's structure went through two iterations during CS01 close-out — first a heading-only format, then converted to YAML frontmatter per-entry after a GPT-5.5 review caught the drift from the cs-plan's stated schema.

**Disposition:** This file's entries (LRN-001 through LRN-005) all conform to the YAML-frontmatter shape. CS05 implementation must use them as fixtures. Noted in cs-plan CS05 deliverables. Schema doc text in RETROSPECTIVES.md is being updated in this same close-out PR to remove the ambiguous "frontmatter" wording and explicitly say "YAML frontmatter code fence".

### LRN-005

```yaml
id: LRN-005
date: 2026-05-02
category: process
source_cs: CS01
status: applied
tags: [sub-agents, delegation, observability]
claim_area: orchestrator-loop
```

**Problem:** User directed (2026-05-02) that sub-agents must report progress properly and be instructed in behaviors. Without structured briefing + reporting, parallel fan-out from CS02+ would lose observability and traceability.

**Finding:** Need a canonical sub-agent dispatch template (briefing) AND a canonical report shape that every sub-agent must conform to. Without the template, briefings drift in quality and decisions get made silently. Without the report shape, the orchestrator can't ledger progress or surface learnings.

**Evidence:** User directive 2026-05-02. Plus the parallelisation table in the cs-plan shows CS02–CS10 with up to 9 parallel sub-tasks each — un-instrumented dispatch at that scale would be chaotic.

**Disposition:** Added § Sub-agent dispatch + § Sub-agent report shape + § Progress observability + § Per-CS sub-agent ledger to OPERATIONS.md. The ledger uses the existing `Task | State | Owner | Notes` columns (per TRACKING.md) with sub-agent metadata encoded into `Notes` as `agent-id=X | role=Y | report-status=Z | learnings=N`. Used from CS02 onward. CS08's canonical `template/managed/OPERATIONS.md` must carry these forward.

## Obsolete

(none yet)

## Deferred

(none yet)
