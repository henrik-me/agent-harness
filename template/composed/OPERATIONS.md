# OPERATIONS

> **File class:** composed — managed core + one project-local block.
> Do **not** edit the managed-core sections directly. Edit only the content
> inside the `operations.project-deploy` local block (see § Local block at the end of this file).
> All managed-core sections are overwritten on every `harness sync`.

Day-to-day procedures for claiming, dispatching, syncing, and harvesting
with the agent harness. This is the canonical operational reference for all
harness-enabled projects.

---

## Claim

The claim workflow moves a planned Clickstop (CS) into flight and establishes
a content PR on the repo. **One CS active at a time** — the WORKBOARD's
Active Work table is the live lock. No new CS may be claimed while an
existing CS has `state = Active`.

### Three-PR shape

Every CS produces exactly three PRs in sequence:

1. **Workboard-claim PR** — branch `workboard/cs<NN>-claim`; touches only
   `WORKBOARD.md` and the clickstop file rename (`planned → active`).
   Label: `workboard-only`. *(CS01–CS14: user-reviewed small PR.
   CS15b+: bot auto-approved via Decision #23.)*

2. **Content PR** — branch `cs<NN>/<slug>`; all implementation work lives
   here. Standard review loop (GPT-5.5 + user). Squash-merge only.

3. **Close-out PR** — branch `workboard/cs<NN>-close`; touches only
   `WORKBOARD.md` (row state set to done or removed), the clickstop rename
   (`active → done`), and any close-out updates to `CONTEXT.md` /
   `LEARNINGS.md`. Label: `workboard-only`. Same auto-merge rules as the
   claim PR.

### Claim steps

1. `git pull origin main --rebase` — sync with upstream.
2. `git checkout -b workboard/cs<NN>-claim` — create claim branch.
3. Edit `WORKBOARD.md`: add a row to Active Work with CS-Task ID, branch,
   agent ID, state (`🟢 Active`), and last-updated timestamp.
4. Rename the CS file:
   ```
   git mv project/clickstops/planned/planned_cs<NN>_<slug>.md \
            project/clickstops/active/active_cs<NN>_<slug>.md
   ```
   *(Use the directory form for artifact-bearing CSs — see
   [TRACKING.md § Clickstop lifecycle](TRACKING.md#clickstop-lifecycle).)*
5. Commit: `Claim CS<NN>` with the `Co-authored-by: Copilot` trailer.
6. Push; open PR labeled `workboard-only`; user reviews; squash-merge.

### Pre-claim harvest gate (CS04+)

`harness claim` runs `harness harvest` automatically before opening the
workboard PR. It prompts the user only if stale `open` learnings tagged
`process` or `architectural` exist, or learnings tagged with the
`claim_area` metadata for the current CS area. Resolve stale learnings
before the workboard-claim PR lands.

### Enforcement model

**CS01–CS14 (private repo, discipline-only):** GitHub branch protection
requires GitHub Pro on private repos (see [LRN-001](LEARNINGS.md#lrn-001)).
All PRs are opened, reviewed, and squash-merged through the normal review
loop. The discipline replaces the missing mechanical enforcement.

**CS15b+ (public repo, mechanical enforcement):** The Ruleset authored at
CS15a and applied at CS15b enforces PR-required, ≥1 approving review,
squash-only, linear history, signed commits, and conversation resolution.
Decision #23 activates the `workboard-auto-approve.yml` bot: it verifies
path-restriction + `workboard-only` label + actor allowlist, submits the
approval, and auto-merges. The global review-required rule stays in force;
the bot's review satisfies it.

---

## Dispatch

Branch from main immediately after the claim PR merges:

```
git checkout -b cs<NN>/<slug>
```

All implementation work happens on this branch. Sub-agents may be dispatched
per the parallelisation table in the active CS plan. See § Sub-agent dispatch
for the full briefing and reporting model.

---

## Handoff

If you need to leave a CS mid-flight:

1. Update `WORKBOARD.md`: set `state = ⏸ Paused` (or `🔴 Blocked`) with a
   brief reason and the `last-updated` timestamp.
2. Commit on the content branch and push: "WIP: <brief reason>" (this commit
   will be squash-merged later; it exists only to preserve work-in-progress
   state).
3. Note the `reclaimable` threshold in the WORKBOARD row (default: 7 days
   with no update). After that threshold, another orchestrator may pick it up
   by updating the WORKBOARD row with the new agent ID.

---

## Sub-agent dispatch

The orchestrator (Opus 4.7 1M) dispatches sub-agents for parallelisable
sub-tasks per the parallelisation table in the active CS plan. Sub-agents
must be **briefed with structured context** and must **report back with a
structured report**. Both requirements are non-negotiable — without them the
orchestrator loses observability and the work loses traceability.

### Models

| Role | Model |
|---|---|
| Orchestrator | Claude Opus 4.7 1M |
| Non-trivial sub-tasks | Claude Sonnet 4.6 |
| Mechanical sub-tasks | Claude Haiku 4.5 |
| Local review (primary) | GPT-5.5 |
| Local review (fallback, non-high-risk) | Claude Sonnet 4.6 (independence invariant — see REVIEWS.md) |

### Briefing template

Every sub-agent prompt includes the following sections **in this order**.
Quote directly-relevant conventions verbatim so the sub-agent does not
need to chase pointers.

#### 1. Identity + scope

State the agent role (e.g. `"mechanical sub-task on CS06"`), the CS being
contributed to, the **exact files owned by this sub-agent**, and explicit
boundaries (what NOT to touch).

Each sub-agent owns a **disjoint file set**. Overlapping write scope causes
silent file races: the later writer wins and the earlier agent's work is lost
with no error. Non-overlapping ownership is the only safe parallel model.
See **Explicit file ownership** below ([LRN-016](LEARNINGS.md#lrn-016)).

#### 2. Hard no-commit preflight ([LRN-021](LEARNINGS.md#lrn-021))

The briefing's **first paragraph** must be a `CRITICAL PREFLIGHT` block
requiring the sub-agent to:

- Record the current HEAD SHA: run `git log --oneline -1` at the start and
  include the result in the report.
- Verify at report time that the SHA is unchanged: `git log --oneline -1`
  in the final response must match the preflight SHA.
- Include `git status --short` in the final response showing only untracked
  or modified files — never staged or committed changes.
- State literally: "No commit was created."

**No commit / push / rebase / reset / gh pr** is permitted by any sub-agent.
The orchestrator commits at the end of each CS. This invariant has been
validated across 18+ sub-agent dispatches with zero violations after
standardization in [LRN-021](LEARNINGS.md#lrn-021).

#### 3. Required reading

List paths explicitly — do not say "read whatever you need":

- `INSTRUCTIONS.md`, `CONVENTIONS.md`, the active CS file, the cs-plan.
- All ADRs in `docs/adr/` that touch the deliverables area. When briefing
  a schema-author sub-agent, cross-check every ADR: ADR constraints
  frequently exceed what the cs-plan deliverables list restates (validated
  in [LRN-007](LEARNINGS.md#lrn-007) — omitting ADR 0002 cost three sub-agents a re-dispatch cycle).
- Relevant done CS files for prior art and conventions.

#### 4. Explicit file ownership ([LRN-016](LEARNINGS.md#lrn-016))

List every file the sub-agent may **write** and every file it may only
**read**. If two parallel sub-agents need the same file, designate one as
owner (may write) and the other as reader (must NOT write).

This rule was discovered empirically in CS03: `cs03-sync` wrote stubs for
`lib/templating.mjs` and `lib/lock.mjs` so its own code could `import` them.
The dedicated owners (`cs03-templating`, `cs03-lock`) reported rich APIs but
their work was silently overwritten by the stubs. The stubs — not the rich
APIs — were what remained on disk. `tests/lock.test.mjs` was lost entirely.

Verify disk state after each parallel-dispatch wave before declaring a wave
complete — see **Post-completion verification** below.

#### 5. Conventions to follow

Quote each convention verbatim in the briefing. Required conventions:

**Schema is source of truth** ([LRN-039](LEARNINGS.md#lrn-039))
Any code that reads `harness.config.json`, `.harness-lock.json`, or any
other structured config file must read `schemas/*.schema.json` first. Do not
guess field names from intuition. Guesses that match happen to work in unit
tests (because fixtures are authored against the same guess) but fail
integration silently. Before writing any field access: open the schema,
find the exact path, write the access from the schema.

**`requireValue` arg guard** ([LRN-040](LEARNINGS.md#lrn-040))
Every CLI flag that takes a value (e.g. `--file <path>`, `--config <path>`)
must guard the next token before consuming it. The guard must (a) verify
`args[i+1]` exists and (b) reject tokens that start with `-`, exiting with
code 2 and a usage message. Bare `if (args[i+1])` silently consumes the next
flag as a value, producing confusing errors like "file not found: --quiet".
The canonical guard is `requireValue(args, i, flagName)`.

**Test minimums, not exact counts** ([LRN-037](LEARNINGS.md#lrn-037))
Briefings specify a *minimum* test count. Over-delivery (writing more tests
than the minimum) is a signal of good engineering, not scope creep. It
catches edge cases the briefing did not enumerate. In CS05, delivering 12
tests against a 10-test minimum caught real `resolveLinks` contract drift.
Never specify exact counts — they create artificial pressure to stop at the
minimum and suppress coverage of discovered edge cases. The orchestrator
celebrates over-delivery on tests.

**Aggregator config single-source** ([LRN-038](LEARNINGS.md#lrn-038))
Aggregator commands (e.g. `cmdLint`) that read config AND thread it to child
subcommands must resolve the config path **exactly once** into a single
variable, then use that variable everywhere — both for local config reads and
for threading to children. Two resolution paths that agree for the happy-case
default diverge silently when a non-default `--config` or `--cwd` is passed.

**Linter explicit `--file`** ([LRN-032](LEARNINGS.md#lrn-032))
A `harness <subcommand>` wrapper that invokes a linter script must construct
the consumer-cwd-relative file path explicitly and pass it as `--file <path>`
to the script. Never let the script infer the path from `import.meta.url` or
`process.cwd()` — when the script runs as an installed package dependency,
those paths resolve inside the harness package directory, not the consumer
repo. Fix: `path.join(cwd, 'LEARNINGS.md')` as the explicit `--file` value.

**Windows `spawnSync`** ([LRN-029](LEARNINGS.md#lrn-029))
On Windows, `npm`, `npx`, and other ecosystem wrappers are `.cmd` batch
files, not executables. `spawnSync` without `{ shell: true }` attempts to
spawn the wrapper as a binary and returns EINVAL. Using `'npm.cmd'` as the
command name is not a reliable workaround. Use `{ shell: true }` for all
npm script invocations: `spawnSync('npm', args, { shell: true })`.

**`--help` re-forwarding** ([LRN-030](LEARNINGS.md#lrn-030))
A global CLI parser that intercepts `--help` must check whether a known
subcommand is also present in the argv slice before acting. If both `--help`
and a known subcommand name are present, `--help` belongs to the subcommand
— forward it to the subcommand's argv. Consuming `--help` globally when a
subcommand is present causes `harness sync --help` to print global help
instead of sync-specific flag docs.

**ESM `.mjs` only**
All harness scripts use ESM (`import`/`export`) and the `.mjs` extension.
No CommonJS `require()`. No `.cjs` files. Node.js 20+.

**LF line endings / UTF-8-BOM**
The `create` tool on Windows writes CRLF regardless of `.editorconfig`
settings ([LRN-006](LEARNINGS.md#lrn-006)). Files may also carry a UTF-8
BOM ([LRN-018](LEARNINGS.md#lrn-018)). After creating any text file on
Windows, run an explicit normalization step: strip the BOM if present and
replace `\r\n` with `\n`. All parsers that compare content must normalize in
their read step.

#### 6. Deliverables

List explicitly:

- Files to create (with purpose and minimum line / test counts).
- Files to edit (with what change is required).
- Exit criteria: the precise self-check the agent can run to verify "done".

#### 7. Self-checks before reporting

- Run `node --test` and report the test count and delta.
- Run any existing linters that cover the deliverables area.
- Verify JSON schema conformance for any `.json` files created.
- Run `git status --short` — only untracked / modified files; nothing staged.
- Run `git log --oneline -1` — HEAD must match the preflight SHA.

#### 8. Decision authority and escalation

State what the sub-agent may decide independently (e.g. internal variable
names, helper-function structure, fixture design) versus what must be
escalated to the orchestrator:

- Adding or removing npm dependencies.
- Schema field additions, renames, or type changes.
- Anything that crosses CS boundaries or touches files outside the declared
  ownership set.
- Any surprising finding that materially changes the approach.

#### 9. Findings to surface

Every uncertainty, decision, deviation, or surprise must appear in the report
as a `LEARNINGS CANDIDATES` entry. The orchestrator decides whether to elevate
to `LEARNINGS.md`. **No silent decisions.** Silent decisions are the primary
source of drift between what a sub-agent reports and what lands on disk.

### Sub-agent report shape (mandatory)

Every sub-agent reports back with **exactly** this structure. A report
missing any field is rejected; the orchestrator re-dispatches with the missing
fields explicitly listed.

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

### Per-CS sub-agent ledger

The active CS file's `## Tasks` table records each dispatched sub-agent.
The `Notes` column uses a fixed format (per
[TRACKING.md § CS file structure](TRACKING.md#cs-file-structure)):

```
agent-id=<id> | role=<short role> | report-status=<value> | learnings=<N>
```

**`report-status` lifecycle:**

| Value | Meaning |
|---|---|
| `pending` | Slot reserved at claim time, not yet dispatched (initial value). |
| `dispatched` | Sub-agent invoked; awaiting completion notification. |
| `complete` | Sub-agent reported back successfully (matches `STATUS: complete`). |
| `partial` | Sub-agent reported partial completion; orchestrator decides next step. |
| `blocked` | Sub-agent cannot proceed; orchestrator escalates or re-dispatches. |

`learnings` is the integer count of learning candidates surfaced. Use `0`
for "none surfaced"; `-` is invalid.

Example row:

```
| Author harness.config.schema.json | done | sub-agent | agent-id=cs02-schema-config | role=schema-author | report-status=complete | learnings=1 |
```

### Post-completion verification

After each parallel-dispatch wave the orchestrator verifies disk state before
declaring the wave complete ([LRN-017](LEARNINGS.md#lrn-017)):

- `git status --short` — only the expected files appear; nothing unexpected.
- Per-file size check — compare reported line/byte counts against actual
  on-disk counts. A sub-agent's report describes what it *intended* to leave;
  file races leave stubs that pass their own unit tests but have none of the
  rich APIs the report claims.
- Spot-check claimed APIs — `grep` for key exported symbols or function names.

If the on-disk state contradicts the report, the work was lost to a file race.
Re-dispatch with a recovery briefing OR accept the simpler version with an
explicit deferral note in the CS file.

### Review fix-round heuristic ([LRN-047](LEARNINGS.md#lrn-047))

When GPT-5.5 review surfaces findings after a dispatch wave:

- **(# findings) × (# affected files) ≤ ~6:** handle inline by the
  orchestrator in the same session.
- **> ~6:** dispatch a dedicated fix-round sub-agent
  (e.g. `cs<NN>-fixes-r1`).

Budget **≥3 review rounds** for any user-facing CS surface (CLI flags, help
text, platform portability). Even "thin wrapper" CLIs generate 5–10 findings
per round ([LRN-031](LEARNINGS.md#lrn-031)). Engine code with strict safety
invariants may require 5–8 rounds ([LRN-024](LEARNINGS.md#lrn-024)).

### Progress observability

- `background` sub-agents notify on completion; use `read_agent`
  (with `wait: true` once notified) to retrieve the structured report.
- Use `list_agents` to poll only when actively blocked on a result.
- The orchestrator does **not** dispatch sub-agents speculatively — every
  dispatch maps to a parallelisation-table entry in the active CS plan.

---

## Sync

`harness sync` updates managed and composed files in a consumer repo from the
pinned harness version recorded in `.harness-lock.json`.

### Modes

| Invocation | Behaviour |
|---|---|
| `harness sync` | Apply mode (default): writes updates to disk. |
| `harness sync --check` | Check mode: exits non-zero if any file is out of sync; writes nothing. Suitable for CI. |
| `harness sync --dry-run` | Dry-run mode: prints what would change; writes nothing. |

### Flags

- **`--config <path>`** — alternate config file path (default:
  `harness.config.json` in `--cwd`). The aggregator must resolve this path
  once and thread it to every subcommand
  ([LRN-038](LEARNINGS.md#lrn-038)).
- **`--cwd <path>`** — treat `<path>` as the consumer repo root.
  Default: `process.cwd()`.
- **`--accept-major`** — required when the resolved template version is a
  major bump from the pinned version (see § SemVer policy).

### File-class behaviour

| Class | Sync behaviour |
|---|---|
| **managed** | Overwrite unconditionally with the rendered template. Consumer edits are lost. |
| **composed** | Re-render template sections; splice in preserved local-block contents. Consumer prose outside markers is replaced; block contents are kept verbatim. |
| **seeded** | Create if missing (seed once); skip completely if the file already exists. |
| **excluded** | Never touched (e.g. `README.md` per ADR 0002). Listed in `harness.config.json` `excluded[]`. |

### Composed file sync invariant

For each composed file, the sync engine:

1. Parses the consumer file and extracts all local-block contents by ID.
2. Renders the template (substituting `{{templating}}` variables from config).
3. Splices preserved block contents back into their marker positions.
4. Writes the result atomically.

If the consumer file contains **non-template, non-block content** not covered
by a `legacy_composed_mapping.json` entry, sync exits non-zero and writes
nothing (fail-closed per ADR 0001 § Legacy-content fail-closed invariant).
Use `harness composed-audit --from-existing-harness` to generate the initial
mapping when migrating an existing file onto the harness.

### Composed marker syntax

Local blocks are delimited by HTML comment markers. The `id` attribute must
match `[a-z][a-z0-9.-]*`. Markers must occupy the full line (no inline use).
Nesting is an error. Duplicate IDs are an error. Every `local-start` must
have a matching `local-end`. See ADR 0001 § Composed marker syntax and parser
rules for the full normative parser specification.

To document marker syntax inside a code fence (e.g. in tests or this ADR),
insert a zero-width space (U+200B) immediately after the leading `<` to
prevent the parser from treating the example as a live marker.

### Mid-CS sync policy

Do **not** run `harness sync` mid-CS unless fixing a harness blocker. Running
mid-CS when the harness version has changed may unexpectedly update managed
and composed files. The CLI warns when sync is invoked while a CS branch is
in flight (detected from the active branch name). Major-version syncs require
`--accept-major` to proceed.

---

## Harvest

### Cadence

- **Weekly:** Monday morning, run `harness harvest` (CS04+) and review
  `LEARNINGS.md`. Disposition any `open` entries.
- **Before-claim (CS04+):** `harness harvest` runs automatically as part of
  `harness claim`. It prompts for disposition of stale `open` learnings tagged
  `process` or `architectural`, or tagged with `claim_area` metadata matching
  the current CS. Resolve before the workboard-claim PR lands.

### Bounded-before-claim invariant

All `open` learnings must be dispositioned (status `applied`, `obsolete`, or
`deferred` with an explicit `deferred_until` date) before the CS15b
public-flip. This is the pre-CS15b harvest invariant enforced by the CS15a
precondition checklist. See `LEARNINGS.md` header for the current status.

### LRN entry format

Each learning entry in `LEARNINGS.md` begins with a YAML frontmatter fence
followed by markdown body sections:

```yaml
id: LRN-<NNN>
date: YYYY-MM-DD
category: tooling | process | architectural | operational | anti-pattern
source_cs: CS<NN>
status: open | applied | obsolete | deferred
tags: [<tag>, ...]
claim_area: <area>          # optional — surfaces entry at claim of matching CS
deferred_until: YYYY-MM-DD  # required when status = deferred
```

Body sections (in order): **Problem**, **Finding**, **Evidence**,
**Disposition**. The schema is `schemas/learning.schema.json`;
`check-learnings.mjs` validates all entries as regression fixtures.

### Learning candidate lifecycle

Learning candidates are surfaced in sub-agent reports under
`LEARNINGS CANDIDATES`. The orchestrator decides whether to elevate each
candidate to a full LRN entry in `LEARNINGS.md`. Every candidate must be
surfaced — no silent decisions. The category `<problem>: <finding>:
<evidence>` format in the report directly maps to the LRN body sections.

---

## SemVer policy

The harness follows [Semantic Versioning 2.0.0](https://semver.org).

### Version bump triggers

| Change type | Bump |
|---|---|
| Breaking config schema change (field removed, renamed, or type changed) | **Major** |
| Removed or renamed CLI flag | **Major** |
| New required config field with no default | **Major** |
| New linter script added | **Minor** |
| New optional config field (backward-compatible addition) | **Minor** |
| New template file added to any class (managed, composed, or seeded) | **Minor** |
| New CLI subcommand added | **Minor** |
| Bug fix with no interface change | **Patch** |
| Documentation or comment clarification, no behaviour change | **Patch** |
| Test-only change | **Patch** |

### Harness update guidance

- **Harness-internal updates** go through their own PR/CS on the harness
  repo. Never fold harness version bumps into a consumer CS.
- **Version mismatch warning:** `harness sync` warns when the installed
  harness version differs from the version pinned in `.harness-lock.json`.
  The warning is informational for Minor/Patch diffs.
- **Major-version sync:** `harness sync` exits non-zero with a descriptive
  message if the resolved template is a major version bump from the pinned
  version. Pass `--accept-major` to override after reviewing the migration
  notes. This prevents silent breakage from schema changes or removed flags.
- **Mid-CS sync:** the CLI warns when sync is invoked while a CS branch is
  in flight. Proceed only when fixing a harness blocker.

### Stub subcommands ([LRN-028](LEARNINGS.md#lrn-028))

Planned-but-unimplemented subcommands must exit **3**, not 0. Exit 0 from a
stub creates a false-positive CI signal — callers cannot distinguish "this
worked" from "this was never implemented". Exit codes:

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Runtime error |
| `2` | Bad invocation (unknown flag or missing required argument) |
| `3` | Planned but not yet implemented |

---

## Conventions

These conventions apply to all harness scripts and CLI code. Quote the
directly-relevant items verbatim in sub-agent briefings.

### ESM only

All harness scripts use ESM (`import`/`export`) and the `.mjs` extension.
No CommonJS `require()`. No `.cjs` files. Node.js 20+. Use `node --test` for
the test runner (no external test framework).

### Line endings and BOM ([LRN-006](LEARNINGS.md#lrn-006), [LRN-018](LEARNINGS.md#lrn-018))

The `create` tool on Windows writes CRLF regardless of `.editorconfig` LF
settings. Files may also carry a UTF-8 BOM. Required normalization after
creating any text file on Windows:

```js
let content = fs.readFileSync(filePath, 'utf8');
// Strip UTF-8 BOM
if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
// Normalize CRLF → LF
content = content.replace(/\r\n/g, '\n');
fs.writeFileSync(filePath, content, 'utf8');
```

All parsers that compare content (composed merge, lock file, doc-schema)
must normalize CRLF and strip BOM in their read step. Using `\r?\n` in
regexes is an acceptable alternative to full normalization in parser contexts.

### Windows `spawnSync` ([LRN-029](LEARNINGS.md#lrn-029))

On Windows, `npm`, `npx`, and other Node-ecosystem wrappers are `.cmd` batch
files, not executables. `spawnSync` or `execFileSync` without `{ shell: true }`
attempts to spawn the wrapper as a binary and returns EINVAL regardless of
whether `'npm'` or `'npm.cmd'` is used as the command name.

Canonical pattern:

```js
import { spawnSync } from 'node:child_process';

const result = spawnSync('npm', ['pack', '--dry-run'], { shell: true });
if (result.status !== 0) { /* handle error */ }
```

Use `{ shell: true }` for **all** npm script invocations. This is the only
safe cross-platform pattern.

### `--help` re-forwarding ([LRN-030](LEARNINGS.md#lrn-030))

A global CLI parser that intercepts `--help` must check whether a subcommand
is also present in the argv slice before printing global help:

```js
// In the global arg parser, before printing global help:
if (argv.includes('--help') && knownSubcommands.has(argv[0])) {
  // --help belongs to the subcommand, not the global invocation
  return dispatchSubcommand(argv[0], ['--help']);
}
```

`harness sync --help` must show sync-specific flag documentation, not global
help. Any global flag added later must apply the same subcommand-context check.

### Explicit `--file` for linters ([LRN-032](LEARNINGS.md#lrn-032))

A `harness <subcommand>` wrapper that invokes a linter script must construct
the consumer-cwd-relative file path explicitly and pass it as `--file`:

```js
// In cmdLint (bin/harness.mjs):
const targetFile = path.join(cwd, 'LEARNINGS.md');
spawnSync(
  'node',
  ['scripts/check-learnings.mjs', '--file', targetFile],
  { shell: true, stdio: 'inherit' }
);
```

Never infer the path from `import.meta.url` inside the linter script. When
the script runs as an installed package dependency, `import.meta.url` resolves
inside the harness package directory, not the consumer repo. The `--cwd` flag
passed to the `harness` CLI defines the consumer boundary; the linter must
receive the consumer-rooted path explicitly.

### `requireValue` arg guard ([LRN-040](LEARNINGS.md#lrn-040))

All linters and CLI commands that take flag values must guard the next token
before consuming it:

```js
function requireValue(args, i, flag) {
  if (!args[i + 1] || args[i + 1].startsWith('-')) {
    process.stderr.write(`${flag}: missing or invalid value\n`);
    process.exit(2);
  }
  return args[++i];
}

// Usage — instead of bare args[i+1]:
case '--file':
  filePath = requireValue(args, i++, '--file');
  break;
```

Bare `if (args[i+1])` is prohibited. It silently consumes the next flag as a
value, producing confusing errors like "file not found: --quiet" with no
indication that argument parsing failed.

### Aggregator config single-source ([LRN-038](LEARNINGS.md#lrn-038))

Aggregator commands that both read config and thread it to child subcommands
must resolve the config path exactly once:

```js
// Resolve once:
const effectiveConfigPath = resolveConfigPath(flags.config, cwd);
const cfg = readConfig(effectiveConfigPath);

// Thread the same variable everywhere — never re-resolve independently:
runChildLinter(['--config', effectiveConfigPath, '--cwd', cwd]);
```

Two separate resolution paths that agree for the default case silently diverge
when a non-default `--config` or `--cwd` is passed by automation.

### Schema is source of truth ([LRN-039](LEARNINGS.md#lrn-039))

Before writing any code that reads `harness.config.json`,
`.harness-lock.json`, or any structured config/lock file:

1. Open the corresponding `schemas/*.schema.json`.
2. Locate the exact field path (e.g. `composed.overrides[file].local_blocks`,
   not `composed_files`).
3. Cross-reference every field access against the schema before writing a
   single line of access code.

Guessing field names from intuition passes unit tests (because the test
fixtures are typically authored against the same guessed name) but fails
integration silently. Two CS06 sub-agents independently hit this: one used
`harness_pin` instead of `version`; the other used `composed_files` instead
of `composed.files`. Both failed only at integration time.

### Stdout/stderr discipline ([LRN-044](LEARNINGS.md#lrn-044))

Scripts that emit a primary artifact to stdout (renderers, exporters) must
maintain a strict channel separation:

- **stdout** — artifact only (clean data channel; suitable for pipe capture).
- **stderr** — progress, status, and warnings (non-quiet mode only).
- **suppressed** — all output except the artifact when `--quiet` is passed.

Mixing progress text on stdout corrupts the artifact for piped callers, even
in `--quiet` mode.

### Fail-closed parsers ([LRN-033](LEARNINGS.md#lrn-033))

Any parser that encounters a malformed structured entry must emit an ERROR
and exit non-zero. Silent `continue` or silent skip violates the fail-closed
invariant and gives false confidence that the document is clean. A block that
contains an `id:` field matching the document's entry-id pattern but fails
YAML parse is not silently dropped — it surfaces as a parse-error result and
the linter emits an ERROR.

### Safety-flag depth ([LRN-045](LEARNINGS.md#lrn-045))

Safety-required flags (e.g. `--redact-required`, `--strict`) must validate
the **substance** of the requirement, not just its surface presence. A flag
named `--redact-required` must verify that the applicable redaction rule
exists and is non-empty — not merely that some config object was loaded. Check
the deepest invariant the flag implies.

---

## Local block

The section below is managed by the project team. Edit only the content
**between** the markers. The markers and all content above are managed by
the harness and will be overwritten on the next `harness sync`. The block ID
`operations.project-deploy` must be listed in `harness.config.json` under
`composed.overrides["OPERATIONS.md"].local_blocks`.

<!-- harness:local-start id=operations.project-deploy -->
_(Add project-specific deployment workflow, environment list, secrets handling, etc.)_
<!-- harness:local-end id=operations.project-deploy -->
