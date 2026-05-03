# TRACKING (proto, CS01)

Clickstop lifecycle and agent identification. Hand-maintained until CS11. Canonical version authored in CS08 as `template/managed/TRACKING.md`.

## Clickstop lifecycle

- `project/clickstops/planned/planned_cs<NN>_<slug>.md` — queued
- `project/clickstops/active/active_cs<NN>_<slug>.md` — claimed and in flight
- `project/clickstops/done/done_cs<NN>_<slug>.md` — merged to main

State transitions are git renames (`git mv`).

### Directory form (artifact-bearing CSs)

Some CSs carry artifacts (planning docs, baseline reports, design notes, etc.) that should travel with the CS file across lifecycle stages. For those, use the **directory form**:

- `project/clickstops/planned/planned_cs<NN>_<slug>/planned_cs<NN>_<slug>.md` + sibling artifact files
- `project/clickstops/active/active_cs<NN>_<slug>/active_cs<NN>_<slug>.md` + sibling artifact files
- `project/clickstops/done/done_cs<NN>_<slug>/done_cs<NN>_<slug>.md` + sibling artifact files

Both forms are valid; the directory form is appropriate when the CS produces or carries supporting artifacts. Future `check-clickstop.mjs` (CS06) will accept either form.

## Naming

- Task IDs are uppercase in tables (`CS01`) but lowercase in branches/commits (`cs01`).
- Slugs are kebab-case.
- Branch name: `cs<NN>/<slug>` (e.g. `cs01/bootstrap-repo`).
- WORKBOARD-only PR branches: `workboard/cs<NN>-claim`, `workboard/cs<NN>-close`, etc. Before CS15a these are user-reviewed small PRs; from CS15a onward they are bot-approved/auto-merged when eligible.

## Agent Identification

The harness's project-suffix is **`ah`** (per [Decision #20a in cs-plan](project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md)).

Format: `<machine-short>-<repo-short>[-c<N>]`

- **machine-short:** lowercase first meaningful segment of `hostname`. `HENRIKM-YOGA` → `yoga`. Skip user/owner prefix segments.
- **repo-short:** `ah` for this repo.
- **-c\<N\>:** derived from clone folder:
  - `<repo>_copilot<N>` → `-c<N>` (e.g. `agent-harness_copilot2` → `-c2`)
  - `<repo><N>` (bare numeric distinguisher) → `-c<N>` (e.g. `agent-harness2` → `-c2`)
  - otherwise omitted
- **Override env var:** `HARNESS_AGENT_AH_MACHINE` (per [Decision #20c](project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md)).

Examples:
- `C:\src\agent-harness` on `HENRIKM-YOGA` → `yoga-ah`
- `C:\src\agent-harness_copilot2` on `HENRIKM-OMNI` → `omni-ah-c2`
- `C:\src\agent-harness3` on `HENRIKM-YOGA` → `yoga-ah-c3`

The CS04 CLI ships `harness whoami [--explain]` that derives this automatically.

## CS file structure

Every clickstop file has:

```
# CS<NN> — <Title>

**Status:** planned | active | done
**Owner:** <agent-id>
**Branch:** cs<NN>/<slug>
**Started:** <ISO-8601 timestamp>
**Closed:** <ISO-8601 timestamp> (when done)

## Goal
## Deliverables
## Exit criteria
## Tasks
| Task | State | Owner | Notes |

## Notes / Learnings
```

CS06's `check-clickstop.mjs` will eventually enforce this structure.

## Task locking

When a task in WORKBOARD.md's Active Work table is assigned to an agent ID, no other orchestrator may pick it up. The assignment is a lock. There is no automated reclamation in this proto phase; manual edits only.
