# CS21 — Harvest process optimizations from guesswhatisnext into harness templates

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** Authored 2026-05-10 per user direction. The harness was forked out of `henrik-me/guesswhatisnext` (gwn) at CS01 (rev. 2 master plan, line 3). Since then both repos have evolved independently; gwn has accumulated process optimizations (per user 2026-05-10: *"a few new process optimizations have made it to the structure there"*) that the harness needs to capture before serving as gwn's governance layer at CS19 (master-plan migration CS) and ideally before SI-CS03 (which exercises the version-pin upgrade path on sub-invaders).
**Depends on:** CS16 (**closed 2026-05-11** — see [`done_cs16`](../done/done_cs16_bootstrap-sub-invaders/done_cs16_bootstrap-sub-invaders.md); dependency satisfied); ideally completes BEFORE SI-CS03 in sub-invaders so SI-CS03's `harness sync --mode=apply` exercise validates a non-trivial template/root delta in a real consumer.

## Goal

Survey `henrik-me/guesswhatisnext` for process-doc deltas vs. the harness's current `template/managed/`, `template/composed/`, `scripts/`, and `lib/` shapes; classify every delta as `apply` | `defer` | `obsolete` | `skip`; apply the `apply` items in this CS; file follow-up planned CSs for `defer` items; record `obsolete`/`skip` rationale in the harvest report. Do not close until the report exists, the apply set has landed, the suite is green, lint is clean, and `harness sync --mode=check` reports no drift.

## Background

- The harness was spun out of gwn at CS01. The fork was a one-time copy; there has been no continuous merge or back-port mechanism between the two repos. Since the fork (~9 months ago in plan time), gwn has continued to be developed by the same author, accumulating process-doc evolution that the harness has missed.
- The downstream consequences of the harness lagging gwn:
  1. **CS19 (master-plan migration of gwn onto harness)** is harder than necessary — every gwn-only optimization must be back-ported during the migration window, which inflates blast radius and review difficulty.
  2. **CS17a (battle-test on sub-invaders)** validates an out-of-date harness against a new consumer; surprises that show up are likely already-solved-in-gwn problems.
  3. **CS17b (shadow-migration dry-run)** depends on the harness having gwn parity at the process-doc layer, otherwise the shadow report drowns in known deltas instead of surfacing real surprises.
- gwn is **public** (verified via `gh repo view henrik-me/guesswhatisnext` on 2026-05-10 → `visibility: PUBLIC`, `defaultBranchRef.name: main`). No token plumbing needed for read access.
- The harness has no specific items pre-seeded by the user (per direction 2026-05-10: *"let the orchestrator discover all deltas"*). The full discovery-and-triage burden lives inside this CS.

## Decisions (CS21-specific)

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C21-1 | gwn target ref | `henrik-me/guesswhatisnext` `main` HEAD at CS21 claim time. Capture the SHA in the harvest report's frontmatter so re-runs are reproducible. | Snapshot avoids mid-CS drift; main is the documented contract surface. |
| C21-2 | Discovery scope | The following directory/file equivalents in gwn: process docs (root `INSTRUCTIONS.md`, `OPERATIONS.md`, `CONVENTIONS.md`, `REVIEWS.md`, `RETROSPECTIVES.md`, `TRACKING.md`, `READMEGUIDE.md`), `.github/copilot-instructions.md`, `.github/pull_request_template.md`, `.github/CODEOWNERS`, `.github/workflows/*` (CI shape only — repo-specific workflows are `skip`), `scripts/check-*.mjs` (linters), `lib/*.mjs` (shared libs), `scaffolds/*` (if present), `schemas/*.schema.json` (if present). | Constrains the survey to the surface that maps to harness templates. Excludes feature code, tests, and gwn-specific business logic. |
| C21-3 | Triage classification | Every delta gets exactly one of: `apply` (back-port into harness templates this CS), `defer` (file a new planned CS — CS21 does not implement), `obsolete` (gwn diverged in a direction the harness intentionally rejects), `skip` (gwn-specific, not transferable — e.g. references to gwn-only feature code). Each `obsolete`/`skip` requires a one-line rationale in the harvest report. | Forces explicit disposition per [INSTRUCTIONS.md § Pre-claim — learnings gate](../../../INSTRUCTIONS.md#pre-claim--learnings-gate) discipline; mirrors the LEARNINGS harvest pattern. |
| C21-4 | Apply-set bound | If `apply` count exceeds **15** items at end of survey, stop in-CS application and downgrade CS21 to a survey+follow-ups CS: file each `apply` candidate as a per-area planned CS instead of applying in-CS. Rationale: review burden of >15 template diffs in one PR exceeds the ~2hr CS heuristic from [INSTRUCTIONS.md § When to File a CS vs. Inline a Fix](../../../INSTRUCTIONS.md#when-to-file-a-cs-vs-inline-a-fix). | Bound prevents scope explosion; small CSs are cheaper than scope-inflated ones. |
| C21-5 | Release-cut handling | CS21 does **NOT** cut a release tag, even if the apply set warrants one. Release tagging is its own CS per CS14 / CS22 precedent. CS21 close-out files a planned **`CS<NN> — Cut harness v<next-semver-step>`** (next free CS integer at filing time per [LRN-086](../../../LEARNINGS.md#lrn-086); next SemVer step from the then-current published tag — likely `v0.3.0` if `v0.2.0` is the baseline at CS21 close, or `v0.2.1` for patch-level apply sets) if any `apply` lands in a **distributed harness surface**: `template/`, `lib/`, `scripts/` (linters consumers run via `npx`), `bin/` (the `harness` CLI), `scaffolds/`, `schemas/`, or any package metadata (`package.json`, `package-lock.json`, the `npm pack` manifest, the `files` allowlist). **Root-doc-only changes** (e.g. edits to `LEARNINGS.md`, `CONTEXT.md`, `WORKBOARD.md`, or root `RETROSPECTIVES.md`) **do NOT** trigger a release CS — those are repo-internal artefacts not shipped to consumers. The trigger decision is made by inspecting the apply set's file paths against this enumerated surface; if **any** file in the apply set matches a distributed-surface path, the release follow-up CS is filed. | Separates content evolution from release mechanics. The broader trigger surface reflects that the harness ships more than just `template/` + `lib/` — `scripts/check-*.mjs` and `bin/harness.mjs` are invoked directly by consumers, and any change to package metadata changes what `npm pack` produces. |
| C21-6 | LRN reservation | LRN-116..LRN-125 advisory (re-check at filing per [LRN-086](../../../LEARNINGS.md#lrn-086)). | Generous; harvest CSs typically surface multiple process LRNs. |
| C21-7 | gwn checkout location | `C:/src/guesswhatisnext` (sibling clone). Read-only operation — no commits to gwn from this CS. | Matches the cross-repo pattern CS16 establishes for sub-invaders. |
| C21-8 | Sub-invaders integration timing | If CS21 closes BEFORE SI-CS03 (sub-invaders) is claimed, **no special action**. SI-CS03's pin-bump naturally targets a newer harness ref: a fresh release tag (likely `v0.3.0` if CS21 triggered a release follow-up CS per C21-5, or `v0.2.1` for a patch-level apply set) if cut, otherwise a `main` SHA. If CS21 closes AFTER SI-CS03 is in flight, document the sequence in CS21 close-out and ensure SI-CS03's plan-vs-impl gate covers the sync. | Coordinates the two cross-repo workstreams without coupling them. (Note: CS22 cuts `v0.2.0` BEFORE CS16 claims, so `v0.2.0` is always the CS16 bootstrap pin; the question is what comes after.) |

## Deliverables

### Phase 1 — Harvest survey (always happens)

1. **`project/clickstops/active/active_cs21_*/harvest-report.md`** — the canonical artefact. Frontmatter records gwn SHA, harness SHA at survey time, and survey timestamp. Body has one section per scoped surface (process docs, copilot-instructions, PR template, CODEOWNERS, workflows-shape, linters, libs, scaffolds, schemas). Each section lists every delta with: gwn-side excerpt or pointer, harness-side excerpt or pointer, classification, rationale (for `obsolete`/`skip`), and the per-`apply` / per-`defer` task ID used in this CS or the follow-up.

2. **`project/clickstops/active/active_cs21_*/gwn-snapshot.txt`** — output of `git -C C:/src/guesswhatisnext log -1 --format=%H%n%s%n%ci` capturing the survey-time gwn SHA, subject, and committer date. Sanitised of any PII beyond the public commit metadata.

### Phase 2A — In-CS applies (only if `apply` count ≤ 15 per C21-4)

3. **Template / root file edits** for each `apply` item, landed in this CS:
   - `template/managed/<file>.md` or `template/composed/<file>.md` — the source-of-truth edit.
   - Root-rendered `<file>.md` (managed) or composed-merged root `<file>.md` (composed) — propagated via `harness sync --mode=apply` (orchestrator runs at end of apply wave).
   - `.harness-lock.json` — refreshed by sync.
   - `scripts/check-*.mjs` and/or `lib/*.mjs` — direct edits if the apply item is logic, not docs.
   - Tests under `tests/` for any logic change (per [INSTRUCTIONS.md § When to Add a Test](../../../INSTRUCTIONS.md#when-to-add-a-test)).

4. **`CHANGELOG.md` entry** under `## [Unreleased]` listing each applied item one-line each, grouped by `Added` / `Changed` / `Fixed`. No version bump (per C21-5).

5. **LRN entries** in `LEARNINGS.md` for any `obsolete` classification that represents a deliberate divergence the harness should not forget (e.g. "we considered gwn's pattern X and rejected it because Y"). Status `applied` at filing.

### Phase 2B — Follow-up CSs (only if downgraded per C21-4)

6. **`project/clickstops/planned/planned_cs<NN>_*.md`** — one planned file per `apply` candidate, using fresh CS numbers (re-check next free integer at filing per [LRN-086](../../../LEARNINGS.md#lrn-086)). Each planned file references this harvest report as its `**Filed by:**` source.

### Phase 3 — Close-out (always happens)

7. **`project/clickstops/active/active_cs21_*/release-followup-trigger.md`** (created **only if Phase 2A landed any apply touching the distributed harness surface per C21-5** — i.e. any of `template/`, `lib/`, `scripts/`, `bin/`, `scaffolds/`, `schemas/`, or package metadata `package.json` / `package-lock.json` / the `files` allowlist) — a one-paragraph trigger doc that the close-out PR uses to file the next planned CS as `CS<NN> — Cut harness v<next-semver-step>` (next free CS integer at filing time per [LRN-086](../../../LEARNINGS.md#lrn-086); next SemVer step — likely `v0.3.0` from the then-current `v0.2.0` baseline, or `v0.2.1` for patch-level apply sets). Records the `[Unreleased]` CHANGELOG hash that should become the new release anchor, and the explicit list of distributed-surface paths that triggered the cut. **If only root docs changed**, this file is NOT created and the close-out summary records "no release follow-up needed (root-doc-only apply set)" instead.

8. **`active_cs21_*` → `done_cs21_*` rename** at close-out per [OPERATIONS.md § Claim](../../../OPERATIONS.md#claim) three-PR shape.

## Exit criteria

CS21 close-out is permitted only when **all** the following are true and recorded in the active CS file's `## Plan-vs-implementation review` section:

1. `harvest-report.md` exists, has classified every discovered delta in scope per C21-2 (zero unclassified), and has frontmatter with the gwn snapshot SHA per C21-1.
2. `gwn-snapshot.txt` exists and matches the SHA in the report frontmatter.
3. Phase 2A landed (if applicable per C21-4): every `apply` item shows up in the diff against `main`; each apply item is traceable from the harvest report to a specific commit in the content PR.
4. Phase 2B landed (if applicable per C21-4): every `defer` item has a corresponding `planned_cs<NN>_*.md` filed in `project/clickstops/planned/`; the harvest report's defer entries link to the planned files by relative path.
5. `node --test tests/*.test.mjs` exits 0 (no regressions from any apply).
6. `node bin/harness.mjs lint --quiet` exits 0 (≥24 pass / 0 fail / 3 skipped — the current baseline).
7. `node bin/harness.mjs sync --mode=check --cwd .` reports `No drift detected`.
8. `CHANGELOG.md` `[Unreleased]` section lists every Phase 2A apply item.
9. If any apply touched the **distributed harness surface** per C21-5 (any of `template/`, `lib/`, `scripts/`, `bin/`, `scaffolds/`, `schemas/`, or package metadata), the Phase 3 release-followup planned CS is filed with the correct fresh integer; if the apply set was root-doc-only, the close-out summary explicitly states "no release follow-up needed (root-doc-only apply set)".
10. CS21-specific LRNs filed: at minimum one `process` LRN documenting the harvest cadence ("how often should harness sync FROM gwn?"), one `architectural` LRN if any structural divergence emerged, and any incidental LRNs surfaced during applies.

## Sub-agent fan-out

The shape of this CS is data-driven: the survey output (Phase 1) determines the Phase 2 fan-out. The orchestrator dispatches in two waves; the second wave's shape is decided **after** Phase 1 reports back.

### Wave A (single-agent survey)

| # | Sub-agent | Owned files |
|---|-----------|-------------|
| 1 | `cs21-surveyor` | `agent-harness:project/clickstops/active/active_cs21_*/harvest-report.md` AND `agent-harness:project/clickstops/active/active_cs21_*/gwn-snapshot.txt`. The surveyor clones gwn to `C:/src/guesswhatisnext` (sibling), runs structural diffs against the scoped surfaces per C21-2, classifies every delta, and writes the report. **Read-only on gwn.** **Read-only on agent-harness `template/`, `lib/`, `scripts/` outside the harvest report path.** |

Surveyor briefing must include:
- Hard no-commit preflight per [LRN-021](../../../LEARNINGS.md#lrn-021) (covers both repos).
- Explicit instruction: classification disposition is the only required output. Do NOT propose how to apply each item — that's Phase 2 work.
- A working list of helpful `git diff` and `diff -u` commands for the structural comparison.
- Reminder: gwn-specific business code (game state, telemetry, etc.) is `skip` by definition — surveyor must not get sucked into reading feature implementation.

### Wave B (data-driven, decided after Wave A reports)

The orchestrator reviews `harvest-report.md`, applies C21-4's bound test, and then either:

#### Wave B-Apply (if `apply` count ≤ 15)

Fan out **N parallel sub-agents**, one per apply-area, with disjoint file ownership:

| Pattern | Sub-agent name | Owned files |
|---|---|---|
| Process-doc apply (managed) | `cs21-apply-managed-<surface>` (e.g. `cs21-apply-managed-instructions`) | `agent-harness:template/managed/<file>.md` only. Root file gets re-rendered by orchestrator-run sync. |
| Process-doc apply (composed) | `cs21-apply-composed-<surface>` | `agent-harness:template/composed/<file>.md` only. Composed-merged root file rendered by orchestrator-run sync. |
| Linter apply | `cs21-apply-linter-<name>` | `agent-harness:scripts/check-<name>.mjs` AND `agent-harness:tests/check-<name>.test.mjs` AND `agent-harness:tests/fixtures/cs21/<name>/*` (one fixture set per linter change). |
| Lib apply | `cs21-apply-lib-<name>` | `agent-harness:lib/<name>.mjs` AND `agent-harness:tests/<name>.test.mjs` AND `agent-harness:tests/fixtures/cs21/<name>/*`. |
| Scaffold apply | `cs21-apply-scaffold-<name>` | `agent-harness:scaffolds/<name>/**` (entire scaffold directory; one apply agent per scaffold). |
| Schema apply | `cs21-apply-schema-<name>` | `agent-harness:schemas/<name>.schema.json` AND any related `tests/<name>-schema.test.mjs`. |

Each apply briefing must:
- Quote the exact gwn-side excerpt and harness-side excerpt from the harvest report.
- Quote the harvest report's classification rationale.
- Pin the gwn SHA from the harvest report's frontmatter.
- Include the standard guards: no-commit preflight ([LRN-021](../../../LEARNINGS.md#lrn-021)), schema source-of-truth ([LRN-039](../../../LEARNINGS.md#lrn-039)), explicit `--file` ([LRN-032](../../../LEARNINGS.md#lrn-032)), `requireValue` ([LRN-040](../../../LEARNINGS.md#lrn-040)), canonical preamble verbatim ([LRN-068](../../../LEARNINGS.md#lrn-068)), tempdirs in `os.tmpdir()` per [LRN-094](../../../LEARNINGS.md#lrn-094).
- Cross-repo briefings (those that read gwn for context) must state the gwn checkout path and explicitly forbid writes to gwn.

After Wave B-Apply, orchestrator-owned tasks (sequential):
- Run `node bin/harness.mjs sync --mode=apply` to propagate `template/` edits to root files.
- Run `node --test tests/*.test.mjs` and `node bin/harness.mjs lint --quiet` and `node bin/harness.mjs sync --mode=check` — must all exit 0.
- Update `CHANGELOG.md` `[Unreleased]`.
- File LRN entries.
- File the Phase 3 release-followup planned CS if any apply touched the distributed harness surface per C21-5 (`template/`, `lib/`, `scripts/`, `bin/`, `scaffolds/`, `schemas/`, or package metadata).

#### Wave B-Defer (if `apply` count > 15)

Fan out **K parallel sub-agents**, one per planned-CS-to-file, with disjoint file ownership:

| Pattern | Sub-agent name | Owned files |
|---|---|---|
| Filer | `cs21-file-planned-<surface>-<n>` | `agent-harness:project/clickstops/planned/planned_cs<NN>_*.md` (exactly one planned file per agent; `<NN>` allocated by orchestrator before dispatch). |

Each filer briefing must follow the planned-file template shape proven by `planned_cs22b_*.md` and this very file (CS21). Filer briefings receive the relevant excerpt from the harvest report verbatim.

### Wave dispatch ordering

1. Wave A: surveyor (1 agent, sync mode for fast iteration; harvest-report can be reviewed by orchestrator before Wave B).
2. (Orchestrator review + classification audit + C21-4 bound check + Wave B shape decision.)
3. Wave B: parallel fan-out per chosen sub-mode (B-Apply or B-Defer).
4. (Orchestrator-owned sequential tasks per the appropriate sub-mode.)
5. Local review (GPT-5.5 rubber-duck per [REVIEWS.md](../../../REVIEWS.md)).
6. Open content PR.
7. CI green → merge.
8. Plan-vs-implementation review gate per [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate).
9. Close-out PR.

## Risks + open questions

- **R1 (high):** Survey scope is unbounded — gwn may have evolved more than expected. Mitigation: C21-4 bound (>15 applies → downgrade to survey+follow-ups). Surveyor briefing emphasises classification, not implementation, so survey itself is bounded.
- **R2 (medium):** gwn-side process docs may have project-specific content threaded through generic process content (e.g. game-specific examples in CONVENTIONS). Surveyor must distinguish "transferable pattern" from "gwn-specific instance". Mitigation: surveyor briefing lists explicit `skip` examples.
- **R3 (medium):** Some apply items may conflict with deliberate harness divergences (e.g. file-class model — gwn may not have managed/composed/seeded). The classification must catch these as `obsolete`. Mitigation: the surveyor briefing requires reading [`ARCHITECTURE.md`](../../../ARCHITECTURE.md) so it knows what the harness has intentionally diverged on.
- **R4 (medium):** Applying template changes mid-session may interact badly with self-host. The harness governs itself (CS11), so a `template/` edit + `sync --mode=apply` ALSO updates the harness's own root files. CI catches drift. Mitigation: orchestrator runs `sync --mode=apply` exactly once at end of Wave B-Apply, then validates lint + sync + tests.
- **R5 (low):** Surveyor may surface gwn improvements to the master CS plan itself (e.g. a better dispatch model, a new CI gate). Those don't fit "process-doc back-port" cleanly. Mitigation: classification `defer` with the planned CS scoped as "process-improvement-from-gwn-<area>".
- **R6 (low):** gwn might be private at survey time (visibility flips happen). Mitigation: surveyor briefing checks `gh repo view henrik-me/guesswhatisnext` and aborts with a clear blocker message if not accessible.
- **OQ1:** Should CS21 also harvest the gwn-side `LEARNINGS.md` for cross-applicable LRN entries? **Default:** out of scope for CS21 (LRNs are project-specific by design; the harness's own learnings are independent). If the surveyor spots a gwn LRN that's clearly applicable here, classify `defer` and file as a one-LRN follow-up CS.
- **OQ2:** Should CS21 cut a release tag in-CS instead of filing the release follow-up? Per C21-5, no — release mechanics are their own CS. If user later disagrees, the release-followup planned file is trivial to redirect.

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.7-xhigh | rubber-duck dispatched (orchestrator: yoga-ah) | 2a8d22eb1cad | 2026-05-14T04:50:00Z | Go-with-amendments | CS21 grandfather attestation per CS42-7 strict-flip self-host validation. Pre-CS35b backlog item; plan content unchanged; backfill only. |
## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per [OPERATIONS.md § Claim](../../../OPERATIONS.md#claim)) | planned | — | — |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
