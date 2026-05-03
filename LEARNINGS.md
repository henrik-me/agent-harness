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

### LRN-006

```yaml
id: LRN-006
date: 2026-05-03
category: tooling
source_cs: CS02
status: applied
tags: [windows, line-endings, sub-agent-tooling]
claim_area: orchestrator-loop
```

**Problem:** The `create` tool writes files with CRLF line endings on Windows regardless of the project's `.editorconfig` (which says LF). Sub-agents that use `create` and then test via tools sensitive to line endings (e.g. AJV, regex parsers like the LEARNINGS extractor) hit confusing failures.

**Finding:** Sub-agents must run an explicit CRLF→LF normalization step after creating any text file on Windows. `cs02-schema-config` did this proactively via `node -e` post-creation. `cs02-ci-validate` instead made the parser regex `\r?\n`-tolerant. Either pattern is acceptable; the harness should not rely on the create tool's line endings being correct.

**Evidence:** `cs02-schema-config` report explicitly mentions the conversion step; `cs02-ci-validate` report mentions adapting the regex. Confirmed by `git status` warnings on commit (`LF will be replaced by CRLF the next time Git touches it`).

**Disposition:** Sub-agent dispatch briefing template in OPERATIONS.md § Sub-agent dispatch should add a "Line endings (Windows)" instruction to the Conventions block. Will be incorporated into the canonical `template/managed/OPERATIONS.md` at CS08 — captured here so CS08 implementer doesn't lose the context. Until then, individual sub-agent prompts include the LF normalization instruction.

### LRN-007

```yaml
id: LRN-007
date: 2026-05-03
category: process
source_cs: CS02
status: applied
tags: [orchestrator-briefing, schema-completeness, ADR-cross-check]
claim_area: orchestrator-loop
```

**Problem:** The `cs02-schema-config` sub-agent briefing listed all top-level keys from the cs-plan CS02 deliverables list (managed, composed, seeded, scaffolds, linters, etc.) but **omitted `excluded`**, even though ADR 0002 requires it. Three downstream sub-agents (`cs02-example-gwn`, `cs02-example-si`, `cs02-example-ah`) independently discovered the gap during their own validation runs and escalated it. Orchestrator had to patch the schema mid-review-loop.

**Finding:** When briefing a schema-author sub-agent, the orchestrator must cross-check the deliverables list against ALL ADRs (not just the cs-plan), because ADRs introduce constraints that a deliverables-list-only briefing misses. ADR 0002 is the source of the `excluded` requirement; cs-plan CS02 deliverables didn't restate it.

**Evidence:** GPT-5.5 content review #1 caught the schema gap. Three sub-agent reports independently called it out as a blocking issue.

**Disposition:** Orchestrator briefing template (when authored canonically in CS08 `template/managed/OPERATIONS.md` § Sub-agent dispatch) must include a "Required reading: ALL ADRs in `docs/adr/` that touch the deliverables area" step explicitly. Until CS08 lands, the orchestrator runs an ADR-cross-check before dispatching any schema-author or contract-author sub-agent.

### LRN-008

```yaml
id: LRN-008
date: 2026-05-03
category: tooling
source_cs: CS02
status: applied
tags: [ajv, json-schema, strict-mode, if-then]
claim_area: schema-tooling
```

**Problem:** AJV 8 strict mode rejects a `required` property declaration in a `then` subschema if that same property is not also declared in the same subschema's `properties`. This is stricter than the JSON Schema spec.

**Finding:** When using `if/then` to conditionally require a property (e.g. `blocks` is required only when `class == "composed"`), the `then` subschema must re-declare the property in its own `properties` block (even as `true`) to satisfy AJV's `strictRequired` check. The actual schema for that property lives in the outer schema's `properties` and works via `additionalProperties` interaction.

**Evidence:** `cs02-schema-lock` report includes the exact AJV error: `"strict mode: required property 'blocks' is not defined at '#/then' (strictRequired)"`. Workaround applied in `harness-lock.schema.json`.

**Disposition:** Documented in the schema source comment + this LRN. CS03's `lib/sync.mjs` should also use Ajv2020 with `strict: false` if it does runtime config validation, OR the if/then pattern must follow the workaround consistently across all harness schemas. Future schema-author sub-agents should reference this learning before using `if/then`.

### LRN-009

```yaml
id: LRN-009
date: 2026-05-03
category: architectural
source_cs: CS02
status: deferred
deferred_until: 2026-06-03
tags: [schema-design, redundancy, single-source-of-truth]
claim_area: schema-design
```

**Problem:** `harness.config.json` has TWO ways to express composed-block allowlists:
1. Top-level `local_blocks` (e.g. `{"CONVENTIONS.md": ["conventions.project"]}`)
2. Per-file `composed.overrides[file].local_blocks`

These can drift. The schema doesn't enforce that they agree; the engine has to pick one as authoritative.

**Finding:** Either (a) the schema should `if/then`-enforce equality between them, or (b) one form should be removed. Option (b) is cleaner but breaks the symmetry of `composed.overrides` carrying all per-file config.

**Evidence:** `cs02-example-gwn` LRN candidate #4. Confirmed by inspecting all 3 example configs — they all have the duplication.

**Disposition:** Defer to CS03 (sync engine) where the engine must choose. Decision recorded here so CS03 implementer doesn't have to re-derive it. **Recommended decision at CS03:** make `composed.overrides[file].local_blocks` authoritative; deprecate top-level `local_blocks`; emit a schema warning (not error) if both are present and disagree; remove top-level `local_blocks` from schema in v0.2.0. Revisit on 2026-06-03 (when CS03 work begins).

### LRN-010

```yaml
id: LRN-010
date: 2026-05-03
category: architectural
source_cs: CS02
status: applied
tags: [schema-ahead-of-engine, composed_block_migrations]
claim_area: schema-design
```

**Problem:** `composed_block_migrations` in `harness.config.schema.json` is a "schema-ahead-of-engine" pattern: the schema accepts the field shape, but the v0.1.0 engine rejects any config that has it (per Decision #12 and ADR 0001). Consumers who add this field thinking it works will get a runtime rejection.

**Finding:** The schema description must explicitly say "schema-only in v0.1.0; sync REJECTS at runtime if non-empty." Without this, the `additionalProperties: false` discipline misleads consumers into assuming presence-in-schema = supported-by-engine.

**Evidence:** `cs02-schema-config` LRN candidate #4. ADR 0001 § "Lock-file recording" already documents the runtime-reject behavior.

**Disposition:** The schema description for `composed_block_migrations` already explicitly states "schema-only in v0.1.0; sync fails with clear 'block ID renamed/split needs migration spec' message" (verified in `harness.config.schema.json`). CS03 implementer must implement the runtime reject behavior matching the description. Future schema fields with the same pattern (schema-ahead-of-engine) must follow the same description discipline.

### LRN-011

```yaml
id: LRN-011
date: 2026-05-03
category: operational
source_cs: CS02
status: deferred
deferred_until: 2026-06-15
tags: [composed-blocks, coordinated-authoring, cs06, cs08, cs10]
claim_area: composed-class-implementation
```

**Problem:** A composed block's lifecycle requires coordinated authoring across THREE artifacts:
1. `template/composed/<file>` must contain the `<​!-- harness:local-start id=X -->...<​!-- harness:local-end id=X -->` markers
2. Consumer's `harness.config.json` must list `X` in `composed.overrides[file].local_blocks` (and `local_blocks[file]` per LRN-009)
3. `check-composed-blocks.mjs` (CS06) must validate the block ID against the config allowlist

If any of these three drifts (e.g. CS08 author adds a new template marker without updating the example configs, or an example config lists a block ID with no corresponding template marker), sync fails at the worst time (consumer's first run).

**Finding:** Need a CS06 linter rule that validates the THREE-WAY consistency: every template marker has a config-side allowlist entry; every config-listed block ID has a template marker; every existing block file has a marker matching the template.

**Evidence:** `cs02-example-si` LRN candidate #2.

**Disposition:** Add to CS06 deliverables (in cs-plan): `check-composed-blocks.mjs` must enforce three-way consistency, not just within-file marker validity. Defer until CS06 implementation. Revisit on 2026-06-15 (when CS06 work likely begins).

### LRN-012

```yaml
id: LRN-012
date: 2026-05-03
category: process
source_cs: CS02
status: applied
tags: [sub-agent-scope, devDependencies, escalation-policy]
claim_area: orchestrator-loop
```

**Problem:** Two sub-agents (`cs02-schema-config`, `cs02-schema-lock`) installed `ajv` (and `ajv-formats`, `js-yaml` from `cs02-ci-validate`) into `node_modules/`, modified `package.json` (added `devDependencies`), and created `package-lock.json`. None of these were in their declared file scope (schemas + scripts). They did NOT escalate.

**Finding:** Adding devDependencies for testing/validation is reasonable — but it crosses sub-agent scope boundaries. The current OPERATIONS § Sub-agent dispatch briefing template doesn't say whether devDep additions are "decide independently" or "escalate". This worked out OK because the additions were aligned with `cs02-ci-validate`'s deliverables, but the next CS could see conflict (two sub-agents adding incompatible dep versions, etc.).

**Evidence:** `git status` after Wave 1 showed `M package.json`, `?? package-lock.json`, `?? node_modules/`. None of the three responsible sub-agents flagged it as a decision in their reports.

**Disposition:** Update OPERATIONS § Sub-agent dispatch briefing template (when canonicalised at CS08) to include explicit guidance: "Adding devDependencies for self-testing is permitted but must be reported in DECISIONS MADE; the orchestrator coordinates dep version conflicts across sub-agents." Until CS08, individual sub-agent prompts include this clarification. Captured in this LRN so the CS08 author doesn't have to rediscover it.

### LRN-013

```yaml
id: LRN-013
date: 2026-05-03
category: tooling
source_cs: CS02
status: applied
tags: [js-yaml, date-parsing, yaml-schema]
claim_area: schema-tooling
```

**Problem:** `js-yaml`'s `load()` function defaults to YAML 1.1 schema, which automatically converts ISO 8601 date strings (e.g. `2026-05-02`) to JavaScript `Date` objects. AJV string-validation then fails because the parsed value is a `Date`, not a string.

**Finding:** Use `yaml.JSON_SCHEMA` to opt out of YAML 1.1 type coercion, keeping all values as strings (matching JSON shape and the schema's expectations).

**Evidence:** `cs02-ci-validate` report. Implemented in `scripts/validate-schemas.mjs`: `yaml.load(entry.yaml, { schema: yaml.JSON_SCHEMA })`.

**Disposition:** Documented in this LRN; the script comment + this entry give future maintainers the context. Any future YAML-parsing harness code must use `yaml.JSON_SCHEMA`.

### LRN-014

```yaml
id: LRN-014
date: 2026-05-03
category: operational
source_cs: CS02
status: deferred
deferred_until: 2026-06-15
tags: [migration, gwn, scripts-directory, check-migration]
claim_area: gwn-migration
```

**Problem:** `guesswhatisnext` has a single `scripts/` directory containing both project-specific scripts (`smoke.js`, `migrate.js`, `cs52-*.js` etc.) AND harness-shipped check-* duplicates that CS19 will retire. Pre-migration the distinction matters for `check-migration --from-existing-harness` output.

**Finding:** `harness check-migration --from-existing-harness` (CS04 deliverable) must distinguish "harness-shipped script that will be retired" from "project-specific script that stays" when scanning a consumer's `scripts/`. Otherwise the migration report will incorrectly flag project-specific scripts as duplicates.

**Evidence:** `cs02-example-gwn` LRN candidate #3.

**Disposition:** Add to CS04 deliverables for `check-migration` subcommand: maintain a list of harness-shipped script names; only flag those when found in consumer `scripts/`. Defer to CS04. Revisit on 2026-06-15.

### LRN-015

```yaml
id: LRN-015
date: 2026-05-03
category: operational
source_cs: CS02
status: applied
tags: [excluded-list, glob-vs-explicit, config-discipline]
claim_area: schema-design
```

**Problem:** When listing files in `excluded[]`, glob patterns (e.g. `docker-compose*.yml`) are tempting but ambiguous (which `docker-compose*.yml` matches? what about `docker-compose.test.yml`?). Explicit enumeration is verbose but unambiguous.

**Finding:** The schema documents `excluded[]` as "Globs are NOT interpreted; list paths explicitly." This is the right call: each excluded path is a concrete decision, not an inferred match. Globs hide drift.

**Evidence:** `cs02-example-gwn` LRN candidate #2 + the `excluded` field description in `harness.config.schema.json` already documents this explicitly.

**Disposition:** Already in schema description. This LRN captures the rationale so future "should we add glob support?" questions have a documented answer. Engine implementer (CS03) must NOT interpret excluded paths as globs; treat each as a literal path or directory prefix.


## Obsolete

(none yet)

## Deferred

> **Note:** Section headers (Open / Applied / Obsolete / Deferred) are organizational hints. The authoritative status for each entry is its YAML frontmatter status field. Entries with status: deferred (LRN-009, LRN-011, LRN-014 in this file) appear under § Applied above for chronological readability — check-learnings.mjs (CS06) validates the status field, not the section placement.
