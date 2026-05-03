# Learnings & Decisions

> **Last updated:** 2026-05-03 (CS04 close-out: LRN-026..031 added)

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

**Disposition:** Defer to CS03 (sync engine) where the engine must choose. Decision recorded here so CS03 implementer doesn't have to re-derive it. **Recommended decision at CS03:** make `composed.overrides[file].local_blocks` authoritative; deprecate top-level `local_blocks`; emit a schema warning (not error) if both are present and disagree; remove top-level `local_blocks` from schema in v0.2.0. **Revisit trigger:** at CS03 claim/start, OR by 2026-06-03, whichever comes first.

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

**Disposition:** Add to CS06 deliverables (in cs-plan): `check-composed-blocks.mjs` must enforce three-way consistency, not just within-file marker validity. Defer until CS06 implementation. **Revisit trigger:** at CS06 claim/start, OR by 2026-06-15, whichever comes first.

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

**Disposition:** Add to CS04 deliverables for `check-migration` subcommand: maintain a list of harness-shipped script names; only flag those when found in consumer `scripts/`. Defer to CS04. **Revisit trigger:** at CS04 claim/start, OR by 2026-06-15, whichever comes first.

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

### LRN-016

```yaml
id: LRN-016
date: 2026-05-03
category: process
source_cs: CS03
status: applied
tags: [sub-agents, parallel-dispatch, file-race, write-conflict]
claim_area: orchestrator-loop
```

**Problem:** During CS03 the 5 sub-agents (`cs03-templating`, `cs03-lock`, `cs03-composed`, `cs03-sync`, `cs03-fixtures`) ran in parallel. `cs03-sync` (Sonnet) wrote stub `lib/templating.mjs` and `lib/lock.mjs` early in its run so its own code could `import` them. The `cs03-templating` (Haiku) and `cs03-lock` (Sonnet) sub-agents both reported "complete" with rich APIs (TemplatingError class, LockError class with codes, atomic writes, validateLock, newEmptyLock, plus `tests/lock.test.mjs` with 16 tests). But the rich-API files were NOT preserved on disk — the stubs from `cs03-sync` remained final. `tests/lock.test.mjs` was completely lost.

**Finding:** Parallel sub-agent dispatch has a real **file race**. When two sub-agents have overlapping write scope (sync needs to import templating + lock; templating + lock are themselves authored by other sub-agents), the later writer wins. Without explicit file-ownership declarations + serialization of writes to shared paths, work is silently lost.

**Evidence:** Final disk state after Wave 1 + 2 of CS03: `lib/templating.mjs` 1.3KB stub + `lib/lock.mjs` 1.5KB stub vs. the ~10KB+ rich APIs the sub-agents reported. `tests/lock.test.mjs` missing.

**Disposition:** Update OPERATIONS.md § Sub-agent dispatch to require explicit "files owned by THIS sub-agent" declarations in every briefing. The orchestrator must enforce non-overlapping ownership across parallel sub-agents. If two sub-agents need to coordinate around a shared file, one is the **owner** and the other is a **reader** that must NOT write. For CS04+ canonicalization in `template/managed/OPERATIONS.md`, codify this as a hard pre-dispatch check. Filed as a planned CS (`project/clickstops/planned/planned_cs03b_upgrade-templating-lock-stubs.md`) to recover the lost rich APIs from the cs03-templating + cs03-lock sub-agent reports.

### LRN-017

```yaml
id: LRN-017
date: 2026-05-03
category: process
source_cs: CS03
status: applied
tags: [sub-agents, observability, report-vs-disk-drift, verification]
claim_area: orchestrator-loop
```

**Problem:** Two sub-agents (`cs03-templating`, `cs03-lock`) reported `STATUS: complete` with rich-API deliverables, but the orchestrator discovered later (when sync tests passed against stubs but rich-API tests didn't exist) that their work was lost in the file race per LRN-016. The structured report shape didn't catch this because the report describes what the sub-agent INTENDED to leave on disk, not what's actually there.

**Finding:** The orchestrator MUST verify each sub-agent's disk state before declaring completion. `git status --short` + `Get-Item` + `wc -l` on each claimed file. Compare reported byte counts / line counts against actual disk state. If the disk state contradicts the report, the work was lost (race / overwrite) → the orchestrator must re-dispatch or recover.

**Evidence:** cs03-templating reported `applyTemplating(input, vars, opts)` rich API with TemplatingError class — disk had 1.3KB stub with only `applyTemplating(content, variables)` lenient mode. Same for cs03-lock.

**Disposition:** Update OPERATIONS.md § Sub-agent dispatch to add a "Post-completion verification" step in the per-CS loop: orchestrator runs `git status --short` + per-file size check + spot-check of claimed APIs after every parallel-dispatch wave. If verification fails, re-dispatch with the lost work briefing OR accept the simpler version with explicit deferral note. CS03 chose the latter (stubs accepted as v0.1.0; rich-API restoration filed as planned_cs03b).

### LRN-018

```yaml
id: LRN-018
date: 2026-05-03
category: tooling
source_cs: CS03
status: applied
tags: [windows, bom, utf-8, create-tool, parser-normalize]
claim_area: tooling
```

**Problem:** The `create` tool on Windows writes UTF-8-BOM (Byte Order Mark) at file head. `lib/composed.mjs`'s parser initially treated the BOM as content, causing 76 fixture files to have a leading BOM byte that mismatched the template skeleton during `mergeComposed()` and triggered false `EMERGE_LEGACY_UNMAPPED` errors.

**Finding:** Any Windows-authored text file may have a UTF-8-BOM. Parsers that compare content (composed merge, lock file read, etc.) MUST strip the BOM in their normalize step. This is in addition to LRN-006 (CRLF→LF normalization).

**Evidence:** `cs03-composed` sub-agent reported 3 initial test failures traced to BOM in fixture files. Fixed by stripping BOMs from 76 fixtures + adding defensive BOM stripping to `normalizeLF()` in `lib/composed.mjs`.

**Disposition:** Documented in `lib/composed.mjs` `normalizeLF()` function comment. CS04 CLI and CS06 linters that read text files MUST also strip BOM. Add to OPERATIONS.md § Sub-agent dispatch (alongside LRN-006 CRLF guidance) at canonicalization in CS08.

### LRN-019

```yaml
id: LRN-019
date: 2026-05-03
category: architectural
source_cs: CS03
status: deferred
deferred_until: 2026-06-15
tags: [legacy_composed_mapping, schema, cs06, cs19]
claim_area: schema-design
```

**Problem:** `lib/composed.mjs` `mergeComposed()` accepts a `legacyMapping` parameter conforming to a shape designed during CS03 (`{ regions: [{ action: 'map_to_block' | 'discard', content: string, block_id?: string }] }`). This shape is NOT documented in any JSON Schema in `schemas/`. CS19 (guesswhatisnext migration) will need to author `legacy_composed_mapping.json` files; without a schema, those files have no static validation.

**Finding:** Need `schemas/legacy-composed-mapping.schema.json` (Draft-2020-12) defining the shape, validated by `validate-schemas.mjs`, and consumed by `lib/composed.mjs` for runtime validation.

**Evidence:** `cs03-composed` sub-agent escalation #1.

**Disposition:** Defer to CS06 (when `check-composed-blocks.mjs` is built — it's the natural home for legacy-mapping validation tooling). Filed as planned CS for CS06 deliverables expansion. **Revisit trigger:** at CS06 claim/start, OR by 2026-06-15, whichever comes first.

### LRN-020

```yaml
id: LRN-020
date: 2026-05-03
category: architectural
source_cs: CS03
status: deferred
deferred_until: 2026-07-01
tags: [composed-merge, evolution, ux, future-cs]
claim_area: schema-design
```

**Problem:** `mergeComposed()` legacy fail-closed (`EMERGE_LEGACY_UNMAPPED`) fires on **any** sync where the template's prose changed since the consumer last synced — because the consumer's old prose differs from the new template's prose. This is per ADR 0001 spec, but it means every harness template-prose update requires consumers to author a `legacy_composed_mapping.json`. UX cost is significant.

**Finding:** Need an "evolution" mechanism — perhaps the lock file's `body_hash` per-block + `template_marker_hash` could be extended to include a `template_prose_hash` per composed file, so the engine can distinguish "consumer edited prose" (rare, fail-closed) from "template prose evolved" (common, auto-update OK).

**Evidence:** `cs03-composed` sub-agent escalation #2.

**Disposition:** Defer to a future CS (post-CS06). Architectural design needed; not blocking v0.1.0 since first-sync (fresh consumer) doesn't hit this. **Revisit trigger:** at the first cross-version sync of guesswhatisnext or sub-invaders (whichever comes first), OR by 2026-07-01.

### LRN-021

```yaml
id: LRN-021
date: 2026-05-03
category: process
source_cs: CS03
status: applied
tags: [sub-agents, commit-policy, preflight, briefing-template]
claim_area: orchestrator-loop
```

**Problem:** `cs03-fixes-v1` sub-agent committed to the `cs03/sync-engine` branch despite the briefing's explicit "Do NOT commit" instruction. The orchestrator amended the commit message and accepted the work, but the autonomous-commit behaviour is a process-control gap.

**Finding:** Sub-agents need a hard preflight + post-completion verification to enforce no-commit. The fix proven effective in `cs03-fixes-v2` and v3 briefings: the briefing's first paragraph is a "CRITICAL PREFLIGHT" requiring (a) `git status --short` in the final response, (b) `git --no-pager log --oneline -1` showing prior HEAD, (c) literal sentence "No commit was created."

**Evidence:** `cs03-fixes-v1` commit `aebf012` created without permission; `cs03-fixes-v2` and v3 honored the strengthened preflight (HEAD unchanged in their final reports).

**Disposition:** Update OPERATIONS.md § Sub-agent dispatch at CS08 canonicalization to make the no-commit preflight + final-checklist part of the canonical briefing template. Verified working pattern documented here.

### LRN-022

```yaml
id: LRN-022
date: 2026-05-03
category: tooling
source_cs: CS03
status: applied
tags: [validation, multiset, set-vs-map, bijective-accounting]
claim_area: tooling
```

**Problem:** `validateLegacyMapping()` initial implementation used Set / `includes` / `some` to validate that every actual legacy region was matched by a mapping entry. This is content-set-based, NOT occurrence-aware. Two distinct legacy regions with identical content could be covered by ONE mapping entry — silent multi-region coverage / data loss risk.

**Finding:** Bijective accounting requires **multiset accounting** (count-based `Map<content, count>` for both sides) — NOT a Set. Set semantics treat duplicates as equivalent; multiset preserves cardinality.

**Evidence:** GPT-5.5 review #2 caught this; `cs03-fixes-v2` rewrote with Map-based multiset accounting; 4 new tests for the 4 count-combination quadrants pass.

**Disposition:** Documented in `lib/composed.mjs` `validateLegacyMapping()` comment. Future "bijective" validation logic in CS06+ linters or other harness code MUST use multiset accounting (or an explicitly justified set-semantics decision).

### LRN-023

```yaml
id: LRN-023
date: 2026-05-03
category: tooling
source_cs: CS03
status: applied
tags: [security, prototype-pollution, accumulator-pattern, javascript-footgun]
claim_area: tooling
```

**Problem:** `validateConfigSchema()` canonical-key collision detection used a plain object accumulator (`const entries = {}`). Assigning `entries['__proto__'] = v` invokes the legacy `__proto__` setter and changes the object's prototype rather than creating an own property, so `hasOwnProperty('__proto__')` stays false and duplicate detection silently fails for `__proto__` canonical keys. Also a prototype-pollution footgun.

**Finding:** Use `Map` (not plain object) for any validation/canonicalization accumulator that takes user-controlled keys. Materialize via `Object.fromEntries(map)` which creates own data properties safely (including for `__proto__`).

**Evidence:** GPT-5.5 review #6 demonstrated reproducer; fix in `cs03-fixes-v3` applied + 2 regression tests pass.

**Disposition:** Documented in `lib/sync.mjs` collision-detection comment. Future config/schema canonicalization logic MUST use `Map` accumulators. CS06 linter authors should follow this pattern when validating user-controlled keys.

### LRN-024

```yaml
id: LRN-024
date: 2026-05-03
category: process
source_cs: CS03
status: applied
tags: [review-iteration-cost, high-risk-cs, planning, calibration]
claim_area: planning
```

**Problem:** CS03 (HIGH-RISK per Decision #22) required **7 GPT-5.5 review iterations** to converge on GO. Across the 6 No-Go iterations, blocking findings ranged 1–4 per iteration; non-blocking ranged 0–4. The cs-plan didn't anticipate this iteration cost and didn't budget for it.

**Finding:** High-risk CSs (especially engine code with safety invariants) realistically need 5–8 review iterations to converge. Each iteration surfaces issues the prior iteration's fix introduced or didn't address. This is normal for code with multiple interacting invariants (fail-closed semantics, cross-platform behaviour, prototype-pollution edge cases, etc.) — not a sign of poor work, but a calibration data point.

**Evidence:** CS03 review history: **7 iterations (6 No-Go + 1 GO), 12 distinct blocking findings + 11 non-blocking findings + 1 suggestion**, all addressed (1 non-blocking #8 from iter-1 deferred per GPT-5.5 recommendation; remainder fixed). Final test count 162 (up from 105 initial). **11 total work passes:** 5 initial sub-agent jobs (cs03-templating, cs03-lock, cs03-composed, cs03-sync, cs03-fixtures) + 3 fix-round sub-agent jobs (cs03-fixes-v1, cs03-fixes-v2, cs03-fixes-v3) + 3 inline orchestrator fix iterations (review iterations 3, 5, 6).

**Disposition:** Update cs-plan parallelisation table notes for high-risk CSs (CS03, CS11, CS15a/b, CS18b, CS19) to budget for 5–8 review iterations. Inform future planning. No code change needed; this is a planning-cost calibration data point.

### LRN-025

```yaml
id: LRN-025
date: 2026-05-03
category: architectural
source_cs: CS03
status: applied
tags: [path-canonicalization, single-source-of-truth, downstream-propagation]
claim_area: schema-design
```

**Problem:** `validateConfigSchema()` initially canonicalized target paths only for duplicate detection — downstream code (file lookup, exclusion check, override lookup, lock entries) used the raw config values. This created subtle bugs where canonical-equivalent paths (e.g. `./dir/file.md` vs `dir/file.md`) would dedup correctly but then downstream code couldn't find the override entry / exclusion / lock record because they were keyed by the non-canonical form.

**Finding:** Path canonicalization MUST be a single upfront step that returns a canonical config, with the canonical form used by ALL downstream consumers. Distributing canonicalization across multiple functions risks one function canonicalizing while another doesn't.

**Evidence:** GPT-5.5 review #4 caught this; `cs03-fixes-v3` refactored `validateConfigSchema()` to RETURN the canonical config; `sync()` reassigns `config = validateConfigSchema(config, ...)` so all downstream code automatically uses canonical form.

**Disposition:** Pattern established in `lib/sync.mjs`. Future CS that adds new path-bearing fields (e.g. CS06 linter configs, CS10 scaffold paths) MUST extend `validateConfigSchema()` to canonicalize the new field. Document this as a contract in CS04 CLI's config-loading code path.

### LRN-026

```yaml
id: LRN-026
date: 2026-05-03
category: process
source_cs: CS04
status: applied
tags: [sub-agents, derivation-logic, spec-cross-reference, briefing-discipline]
claim_area: orchestrator-loop
```

**Problem:** The first CS04 sub-agent (`cs04-cli`) implemented `cloneSuffixFromDir()` using the regex `-c(\d+)$` instead of the two-pattern sequence from Decision #20 (`_copilot(\d+)$` first, then `(\d+)$` fallback). The sub-agent briefing described the derivation goal but did not include the EXACT regex patterns or per-pattern fixture examples inline. GPT-5.5 R1 caught the mismatch as a blocking finding.

**Finding:** When a derivation algorithm is specified by an existing project decision (Decision #20 in this case), the sub-agent briefing MUST include: (a) the exact spec patterns verbatim, (b) at least one test-fixture example per pattern branch, and (c) a pointer to the specific decision document. Describing the goal at a high level is not sufficient — the sub-agent will fill gaps with plausible-looking-but-wrong implementations.

**Evidence:** GPT-5.5 R1 blocker #1: "`cloneSuffixFromDir()` uses `-c(\d+)$` but Decision #20 specifies `_copilot(\d+)$` then `(\d+)$`." Fixed in `cs04-fixes-r1`.

**Disposition:** Updated CS04 close-out notes. Sub-agent briefing template (when canonicalized in CS08 `template/managed/OPERATIONS.md`) must add a required section: "Derivation spec: include exact patterns and per-branch fixture." Applied to all future CSs where derivation logic is specified by an existing decision.

### LRN-027

```yaml
id: LRN-027
date: 2026-05-03
category: anti-pattern
source_cs: CS04
status: applied
tags: [cli, flags, silent-ignore, exit-codes, config-threading]
claim_area: cli-ux
```

**Problem:** `--config` was wired into the global argument parser in `bin/harness.mjs` but never threaded through to `lib/sync.mjs::sync()`. Callers invoking `harness sync --config alternate.json` received no error and no indication that the flag was silently ignored — the default `harness.config.json` was used instead. Automation that relied on checking an alternate config would silently test the wrong file.

**Finding:** Silently ignoring a parsed CLI flag is worse than rejecting it. The caller has no feedback that their intent was not honoured. The correct behaviour for an unimplemented flag is explicit rejection: exit 2 with a clear message pointing at the workaround (`--cwd` in this case). Deferred full threading of `--config` into `sync()` to CS04b.

**Evidence:** GPT-5.5 R1 blocker #2: "`--config` parsed but never passed to `sync()` — automation silently tests the wrong config." Fixed in `cs04-fixes-r1` (reject with exit 2 + message). Filed `planned_cs04b_thread-config-flag-through-sync.md` for the full threading.

**Disposition:** Applied in `bin/harness.mjs`. Future flag additions that are parsed-but-not-yet-wired must either be threaded fully OR reject with exit 2 + pointer to the right flag. "Parse and ignore" is explicitly prohibited.

### LRN-028

```yaml
id: LRN-028
date: 2026-05-03
category: anti-pattern
source_cs: CS04
status: applied
tags: [cli, exit-codes, stub-subcommands, ci-false-positive]
claim_area: cli-ux
```

**Problem:** Initial CS04 stubs for planned-but-unimplemented subcommands (`harvest`, `check-migration`, `composed-audit`) printed "not implemented" and exited 0. Any CI script that ran `harness harvest` would see exit 0 and treat it as success — the harvest never ran, but CI reported green.

**Finding:** Stub subcommands that exit 0 create false-positive CI signals. "Planned but absent" needs a dedicated non-zero exit code that distinguishes from both success (0) and unknown-flag errors (2). CS04 assigns exit 3 for "planned but not yet implemented". Exit 2 is reserved for unknown flags or missing required arguments. Callers can test for exit 3 to detect stub-land vs. broken-invocation.

**Evidence:** GPT-5.5 R1 blocker #3: "stub subcommands exit 0 — CI can't distinguish implemented from stubbed." Fixed in `cs04-fixes-r1` (exit 3 for stubs).

**Disposition:** Exit code convention documented in CS04 close-out notes (`done_cs04_cli-dispatcher.md`) and applied in `bin/harness.mjs`: 0=success, 1=runtime error, 2=bad invocation (unknown flag / missing required), 3=planned but not yet implemented. Must be added to canonical `OPERATIONS.md` in CS08. Future CSs adding stubs must use exit 3 from day one.

### LRN-029

```yaml
id: LRN-029
date: 2026-05-03
category: tooling
source_cs: CS04
status: applied
tags: [windows, node, spawnSync, npm, shell-true]
claim_area: tooling
```

**Problem:** `harness pack` initially called `spawnSync('npm', ['pack', '--dry-run'])` without `shell: true`. On Windows, `npm` is a `.cmd` batch wrapper, not an executable. `spawnSync` without `shell: true` attempts to spawn `npm` as a binary, returns EINVAL, and the command silently fails regardless of whether `'npm'` or `'npm.cmd'` is used as the command name.

**Finding:** On Windows, `spawnSync` (and `spawn`, `execFileSync`) for npm scripts and other Node-ecosystem wrappers MUST pass `{ shell: true }`. Using `'npm.cmd'` as the command is not a reliable workaround — it still returns EINVAL in certain stdio configurations. The only safe cross-platform pattern for npm invocations is `spawnSync('npm', args, { shell: true })`.

**Evidence:** `harness pack` integration test failure on Windows during CS04 implementation; `cs04-fixes-r1` applied `shell: true` + added a test asserting non-EINVAL exit on Windows.

**Disposition:** Applied in `bin/harness.mjs` `pack` subcommand. Any future CS that invokes npm scripts, npx, or other `.cmd` wrappers via `spawnSync`/`execFileSync` must include `shell: true`. Document in CS08 canonical OPERATIONS.md conventions block.

### LRN-030

```yaml
id: LRN-030
date: 2026-05-03
category: operational
source_cs: CS04
status: applied
tags: [cli, help-flag, argument-parsing, subcommand-dispatch]
claim_area: cli-ux
```

**Problem:** The global CLI parser in `bin/harness.mjs` consumed `--help` before dispatching to the subcommand. When a user ran `harness sync --help`, the global parser saw `--help` first, printed global help, and exited — the `sync`-specific flag documentation was never shown.

**Finding:** A global parser that intercepts `--help` must check whether a subcommand is also present in the argv slice. If both are present, `--help` belongs to the subcommand, not the global invocation. Fix: when the global parser detects `--help` AND `argv[0]` is a known subcommand name, forward `--help` to the subcommand's argv slice instead of handling it globally.

**Evidence:** CS04 CLI test failures for `harness sync --help`, `harness check --help`, etc. during initial implementation. Fixed in `cs04-fixes-r1`; 3 new tests confirm correct routing.

**Disposition:** Applied in `bin/harness.mjs`. Pattern to carry forward: any harness CLI command that adds a global flag must check whether subcommand-context narrows the flag's scope. Document in CS08 canonical OPERATIONS.md CLI conventions block.

### LRN-031

```yaml
id: LRN-031
date: 2026-05-03
category: process
source_cs: CS04
status: applied
tags: [review-iteration-cost, user-facing-surface, calibration, gpt-5.5]
claim_area: planning
```

**Problem:** CS04 was classified as a "not high-risk CS" per Decision #22 (thin wrappers, no safety invariants), so the cs-plan did not budget for multiple GPT-5.5 review rounds. In practice, GPT-5.5 required **3 rounds** (R1: 7 blockers; R2: 1 new blocker introduced by R1 fixes; R3: clean GO) before the content PR was merge-ready.

**Finding:** User-facing CLIs are a distinct risk class from engine code: they have rich behavioural contracts (exit codes, flag semantics, help text, platform portability) that interact in subtle ways. Even thin-wrapper CLIs generate 5–10 review findings per round. Plan for ~3 rounds on any user-facing CS surface, even when the implementation looks straightforward. Complements [LRN-024](#lrn-024) (high-risk engine calibration: 5–8 rounds).

**Evidence:** CS04 review history: R1=7 blockers (wrong regex, silent --config, exit-0 stubs, --dry-run alias missing, Windows spawnSync, --help forwarding, pack whitelist); R2=1 blocker (--dry-run alias regression from R1 fix); R3=GO. Sub-agents: `cs04-cli` (initial, 0 commits), `cs04-fixes-r1` (fixed all 7 R1 blockers, 0 commits), orchestrator inline (R2 --dry-run alias fix, 0 commits by sub-agent).

**Disposition:** Update cs-plan planning notes for user-facing CSs (CS04, CS07, CS08+ template-rendered outputs) to budget 3 review rounds minimum. No code change needed; calibration data point complementing LRN-024.

## Obsolete

(none yet)

## Deferred

> **Note:** Section headers (Open / Applied / Obsolete / Deferred) are organizational hints. The authoritative status for each entry is its YAML frontmatter status field. Entries with status: deferred (LRN-009, LRN-011, LRN-014, LRN-019, LRN-020 in this file) appear under § Applied above for chronological readability — check-learnings.mjs (CS06) validates the status field, not the section placement.
