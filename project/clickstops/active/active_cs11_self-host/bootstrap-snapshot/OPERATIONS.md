# OPERATIONS (proto, CS01)

Day-to-day procedures. Hand-maintained until CS11. Canonical version authored in CS08 as `template/composed/OPERATIONS.md`.

## Claim

**Bootstrap exception (CS01 only):** the very first commit landing this repo's skeleton + proto docs is a direct push to `main`. **No other direct pushes to `main` are permitted from commit 2 onward** — by discipline (CS01–CS14) or mechanically (CS15b+). See § Enforcement model.

From commit 2 onward, **everything** — including WORKBOARD claim/closeout — goes through PRs.

### Until CS15b (small-PR claim model, discipline-enforced; CS15a builds + dry-runs the bot but it is not yet the live mechanism)

WORKBOARD claim/closeout PRs are **normal small PRs labeled `workboard-only` with user review** — same review loop as any other PR. No automation; just small scope. Discipline-only because the auto-approve bot doesn't exist yet (CS15a builds it) and Rulesets aren't available on private free-tier repos.

1. Pull main: `git pull origin main --rebase`.
2. Create branch: `git checkout -b workboard/cs<NN>-claim`.
3. Edit `WORKBOARD.md`: add your row to the **Active Work** table with CS-Task ID, branch, agent ID, state, last updated.
4. Rename the CS file: `git mv project/clickstops/planned/planned_cs<NN>_<slug>.md project/clickstops/active/active_cs<NN>_<slug>.md` (or use the directory form per [TRACKING.md § Clickstop lifecycle](TRACKING.md#clickstop-lifecycle) for artifact-bearing CSs).
5. Commit: `Claim CS<NN>` with the `Co-authored-by: Copilot` trailer.
6. Push branch; open PR labeled `workboard-only`; user reviews; squash-merge.

### From CS15b onward (tiny auto-merged PRs, mechanically enforced via Ruleset)

Same shape as above, but the `workboard-auto-approve.yml` workflow + GitHub App / bot identity verifies path-restriction + label + actor allowlist and auto-approves + auto-merges. Global "Require ≥1 approving review" stays in force; the bot's review satisfies it. (Mechanical enforcement of the Ruleset begins at CS15b when the repo flips public.)

## Dispatch

Branch from main: `git checkout -b cs<NN>/<slug>`. All implementation work happens on this branch; sub-agents may be dispatched per the parallelisation table in the CS plan.

## Handoff

If you need to leave a CS in the middle: update WORKBOARD with `state=blocked` (or `paused`) and a brief reason; commit. Another orchestrator can pick it up after the documented `reclaimable` threshold (default 7d).

## Sync (consumer-only, not applicable to harness repo until CS11)

`harness sync` (CS04+) updates managed/composed files in a consumer repo from the pinned harness version. Do not run mid-CS unless fixing a harness blocker.

## Harvest

- **Weekly cadence:** Monday morning, run `harness harvest` (CS04+) and review LEARNINGS.md.
- **Before-claim cadence (CS04+):** `harness harvest` runs automatically as part of `claim`; prompts user only if stale `open` learnings tagged `process` or `architectural` exist (or learnings tagged with the `claim_area` metadata).
- See [RETROSPECTIVES.md](RETROSPECTIVES.md) for the full procedure and disposition states.

## Plan-vs-implementation review (close-out gate)

This gate is **mandatory** before opening the close-out PR and before the `active → done` rename.

**Reviewer:** GPT-5.5 (rubber-duck). Fallback: Claude Sonnet 4.6, subject to the independence invariant in [REVIEWS.md](REVIEWS.md) (non-high-risk only; user waiver always allowed).

**Inputs the reviewer must consume:**

- The active CS file (all deliverables, tasks table, sub-agent reports).
- The actual diff against the base branch: `git diff main..cs<NN>/content`.
- The test count delta (tests before vs. after).
- Any sub-agent final reports recorded in the CS file.

**Required outputs the reviewer must produce:**

- **Per-deliverable outcome table** — for each deliverable listed in the CS plan, one of: `match` | `diverged` | `added` | `dropped`, with a rationale sentence for every non-`match` entry.
- **Test-coverage assessment** — `sufficient` OR `gaps` with a specific list of untested scenarios.
- **Overall outcome** — `GO` | `NEEDS-FIX`.

**Recording the review:**

The orchestrator records the review verbatim in the active CS file's `## Plan-vs-implementation review` section **before** the `active → done` rename. The section must contain:

```
**Reviewer:** <model name + rubber-duck | fallback reason>
**Date:** <ISO 8601 timestamp>
**Outcome:** GO | NEEDS-FIX

<prose summary — per-deliverable table + coverage assessment>
```

**Blocking behaviour:**

A `NEEDS-FIX` outcome blocks close-out. Fix the gap on the `cs<NN>/content` branch and re-run the gate before proceeding.

**Mechanical enforcement:**

`check-clickstop.mjs` enforces the presence of the `## Plan-vs-implementation review` section and its required content for all `done/` files. The linter is wired into `harness lint` and runs on every PR.

## Models used

| Role | Model |
|---|---|
| Orchestrator | Claude Opus 4.7 1M |
| Mechanical sub-tasks | Claude Haiku 4.5 |
| Non-trivial sub-tasks | Claude Sonnet 4.6 |
| Local review (primary) | GPT-5.5 |
| Local review (fallback, non-high-risk) | Claude Sonnet 4.6 (with independence invariant — see REVIEWS.md) |

## Sub-agent dispatch (proto, CS01)

The orchestrator (Opus 4.7 1M) dispatches sub-agents for parallelisable sub-tasks per the parallelisation table in the [cs-plan](project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md). Sub-agents must be **briefed with structured context** and must **report back with structured progress**. Both are non-negotiable — without them, the orchestrator loses observability and the work loses traceability.

### Dispatch briefing template

Every sub-agent prompt includes (in this order):

1. **Identity + scope**: agent role (`mechanical sub-task on CS02`), CS being contributed to, exact files/areas owned by this sub-agent, boundaries (what NOT to touch).
2. **Mode**: `background` for parallel fan-out (preferred); `sync` only for tiny pre-requisite probes.
3. **Required reading**: paths to `INSTRUCTIONS.md`, `CONVENTIONS.md`, the active CS file, the cs-plan, and any relevant prior CSs (done/) — explicit list, not "read whatever you need".
4. **Conventions to follow**: ESM Node 20+, zero runtime deps, `node --test`, file-class model (managed/composed/seeded), composed parser strict rules, lock-file shape, public-artifact redaction, agent-ID naming. Quote the directly-relevant convention so the sub-agent doesn't have to chase pointers.
5. **Deliverables**: explicit list of files to create/edit + exit criteria.
6. **Self-checks before reporting back**: run tests if any, run linters if any exist, verify schemas conform, verify cross-link integrity.
7. **Decision authority + escalation**: what the sub-agent may decide independently vs. what must be escalated to the orchestrator (typically: stack/dep choices, schema field additions, anything that crosses CS boundaries).
8. **Findings to surface**: every uncertainty, decision, deviation, or surprise → file as a learning candidate (in the report; orchestrator decides whether to elevate to LEARNINGS.md). No silent decisions.
9. **Report shape** (mandatory): see § Sub-agent report shape below.

### Mandatory briefing preamble (copy verbatim into every dispatch)

The orchestrator MUST paste the block below verbatim into every sub-agent
dispatch prompt — including small or seemingly "obvious" ones. This is not
a style preference; it is the discipline that prevents individual requirements
(preflight SHA recording, BOM check, file-ownership scope, report-shape
completeness) from being silently omitted. When orchestrators re-draft the
preamble from memory or reference this section by hyperlink only, individual
steps are routinely forgotten. LRN-068 demonstrates how silently-lost process
steps are not surfaced until a downstream sub-agent raises them as
escalations — if the preamble itself is incomplete, that catch also fails.

A hyperlink to this section is NOT sufficient. Sub-agents operating under
tight context or fast-path prompting will skip non-pasted references.
Verbatim paste, not reference, is the mechanism that makes the discipline
reliable.

After pasting the block, append the task-specific sections: **Identity +
scope** (agent role, CS, exact owned files, what NOT to touch), **Required
reading** (explicit paths for this CS), **Deliverables**, **Decision
authority**, and any additional task-specific conventions. Do not modify the
pasted block itself.

```text
## CRITICAL PREFLIGHT (LRN-021)

1. Run `git log --oneline -1` NOW and record the SHA. Include it in your
   report as `PREFLIGHT SHA: <sha>`.
2. You MUST NOT commit, push, rebase, reset, `git add`, or `gh pr ...` at
   any point. The orchestrator commits at CS end.
3. At the end of your work, re-run `git log --oneline -1`. It MUST equal
   the preflight SHA. Include it as `FINAL SHA: <sha>`.
4. Run `git status --short` and include the output in your report. Only
   your owned files should appear; nothing must be staged.
5. State literally in your report: "No commit was created."

## File ownership (LRN-016)

OWN EXCLUSIVELY — you may read AND write only the files listed in the
Identity + scope section of this dispatch. You MUST NOT modify, rename,
or delete any file outside that list. Curiosity reads (grep/view) are
fine; writes are not.

Rationale: parallel sub-agents share a working tree. If two agents write
the same file, the later writer silently overwrites the earlier one's work
with no error or warning. Non-overlapping ownership is the only safe
parallel model (validated across CS03 where stubs silently replaced rich
APIs — see LRN-016).

## Required reading

Read every path listed in the Required reading section of this dispatch.
Do not infer what to read — only the explicit list counts. "Read what you
need" produces silent gaps that surface as integration failures later.

## Conventions to follow

- ESM `.mjs` only, Node 20+ stdlib. No CommonJS `require()`, no `.cjs`
  files, no npm dependencies unless explicitly authorized in this dispatch.

- LF line endings, no BOM. After every file write on Windows, normalize:
  strip BOM if present (first 3 bytes must NOT be 0xEF 0xBB 0xBF), replace
  \r\n with \n. All content comparisons must normalize in the read step.
  (LRN-006, LRN-018, LRN-065)

- `requireValue(args, i, flagName)` guard for every value-taking CLI flag
  (LRN-040). Must verify args[i+1] exists AND reject tokens starting with
  `-`, exiting code 2 + usage message. Bare `if (args[i+1])` silently
  consumes the next flag as a value.

- Schema is source of truth (LRN-039). Read `schemas/*.schema.json` BEFORE
  writing any field access against harness.config.json, .harness-lock.json,
  or any other structured config. Do not guess field names.

- Stdout for success output; stderr for errors and warnings (LRN-044).
  `--quiet` suppresses success stdout only. Errors always go to stderr.

- No dot-notation placeholders (LRN-049). Use flat keys only:
  `{{agent_suffix}}` not `{{project.agent_suffix}}`. Dot-notation is not
  supported by the template engine and will be emitted literally.

- Consumer-root-relative paths (LRN-050). Scripts run from the consumer's
  cwd, not the harness source location. Never use `import.meta.url` or
  `process.cwd()` to resolve consumer-repo files.

- Fail-closed parsers (LRN-033). Malformed JSON/YAML/etc → clear error
  message to stderr + process.exit(1). NEVER silent default. NEVER let a
  stack trace be the only error signal.

## Self-checks before reporting

Run all of the following and include each result in SELF-CHECKS RUN:

1. `git status --short` — only owned files appear; nothing staged.
2. `git log --oneline -1` — must match preflight SHA.
3. BOM check on every modified file (LRN-065):
     PowerShell: $b = [System.IO.File]::ReadAllBytes($path)
                 ($b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF) must be False
     Node:       (await fs.readFile(p))[0] === 0xEF  must be false
4. If tests were added/modified: `node --test` — report count delta
   (e.g. "23 → 27 tests; all pass").
5. For any .mjs files authored: `node -c <file>` exits 0.

## Mandatory report shape

Reports missing any field are rejected; orchestrator re-dispatches with
missing fields explicitly listed.

    STATUS: complete | partial | blocked
    PREFLIGHT SHA: <sha>
    FINAL SHA: <sha>
    SUMMARY: <one paragraph>
    FILES CHANGED:
      - <path> (created | edited | deleted) — <one-line why> — <line count>
    SELF-CHECKS RUN:
      - git status / git log / BOM check / [other checks]: pass | fail
    DECISIONS MADE:
      - <decision> — rationale
    ESCALATIONS: (none) | <issue> — recommended path
    LEARNINGS CANDIDATES: (none) | <category>: <problem>: <finding>: <evidence>
    NEXT STEPS (if partial/blocked):
      - <what's needed to complete>
```

### Sub-agent report shape (mandatory)

Every sub-agent reports back with this exact structure:

```
STATUS: complete | partial | blocked
SUMMARY: <one paragraph>
FILES CHANGED:
  - <path> (created | edited | deleted) — <one-line why>
SELF-CHECKS RUN:
  - <check name>: pass | fail (<details if fail>)
DECISIONS MADE:
  - <decision> — rationale
ESCALATIONS (orchestrator action required):
  - <issue> — recommended path
LEARNINGS CANDIDATES:
  - <category>: <problem>: <finding>: <evidence>
NEXT STEPS (if partial/blocked):
  - <what's needed to complete>
```

Anything missing this structure is rejected; the orchestrator re-dispatches with the missing pieces explicitly listed.

### Progress observability

- `background` sub-agents notify the orchestrator on completion. The orchestrator uses `read_agent` (with `wait: true` once notified) to retrieve the structured report.
- For longer-running sub-agents the orchestrator may use `list_agents` to poll, but only when it's blocked on the result.
- The orchestrator does NOT speculatively launch sub-agents "just in case" — every dispatch maps to a parallelisation-table entry in the active CS.

### Per-CS sub-agent ledger

The active CS file's `## Tasks` table records each dispatched sub-agent. The table follows the canonical schema in [TRACKING.md](TRACKING.md#cs-file-structure) (`Task | State | Owner | Notes`); sub-agent dispatch metadata is encoded into the `Notes` column with a fixed format:

```
agent-id=<sub-agent-id> | role=<short role> | report-status=<pending|dispatched|complete|partial|blocked> | learnings=<N>
```

Example row:

```
| Author harness.config.schema.json | done | sub-agent | agent-id=cs02-schema-config | role=schema-author | report-status=complete | learnings=1 |
```

This keeps the existing TRACKING.md table schema untouched (no migration of historical CS files needed) while giving the orchestrator a parseable observability ledger. Future linter `check-clickstop.mjs` (CS06) will validate the Notes-format on rows whose Owner is `sub-agent`.

**`report-status` values (lifecycle):**
- `pending` — slot reserved at claim time, not yet dispatched (initial value when a CS is claimed)
- `dispatched` — sub-agent invoked, awaiting completion notification
- `complete` — sub-agent reported back successfully (matches the report-shape `STATUS: complete`)
- `partial` — sub-agent reported partial completion; orchestrator decides next step
- `blocked` — sub-agent reported it cannot proceed; orchestrator escalates or re-dispatches

`learnings` is the integer count of learning candidates surfaced in the sub-agent's report (`-` is invalid; use `0` for "none surfaced").

## Bootstrap exception (CS01 only)

The very first commit to `main` (the layout + proto docs landing this CS) is a direct commit per a documented one-time exception. From the second commit onward, **all changes go through PRs by discipline** — see § Enforcement model below for why.

## Enforcement model

**CS01–CS14 (private repo, discipline-only):** GitHub branch protection and Rulesets both require GitHub Pro on private repos in the free tier (verified via `gh api` in CS01; recorded as [LRN-001](LEARNINGS.md)). During this phase, mechanical enforcement of "PR-required, no direct push" is **not available**. Operating model: **discipline + GPT-5.5 + user review**. PRs are still opened, reviewed, and squash-merged through the normal loop in [§ Claim](#claim) and [INSTRUCTIONS.md](INSTRUCTIONS.md). The discipline does the work the missing branch protection would have. Bot-driven WORKBOARD auto-merge is not configured (no Ruleset to satisfy).

**CS15b+ (public repo, mechanical enforcement):** flipping the repo public makes Rulesets available for free. **CS15a authors the Ruleset spec** as `docs/ruleset/main-protection.json` (committed, not applied) and **builds + dry-runs** the `workboard-auto-approve.yml` workflow + GitHub App without protected-branch requirements (bot is not yet the live claim mechanism). **CS15b applies the Ruleset** (PR-required, ≥1 approving review, dismiss stale, squash-only, linear history, conversation resolution required, signed commits required, status checks), **activates the bot** as the live tiny-PR auto-merge mechanism (Decision #23), and flips the repo to public. From CS15b onward branch protection is mechanically enforced on every push and the bot handles workboard-only PRs end-to-end.
