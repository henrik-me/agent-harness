# Learnings & Decisions

> **Last updated:** 2026-06-24 — CS72 close-out: **LRN-168** (architectural, applied) + **LRN-169** (process, applied) + **LRN-170** (architectural, open) filed — a scrub/genericity guard's scan scope must equal the exact consumer-shipped byte surface (the local-block blind-spot fix); the templating `\{{`-escape Windows-path bug + composed-reclassification seeding-completeness (every referenced `{{key}}` must be in the seeded templating map; only an init→materialize→grep check catches residue); and the distinct **cross-ref-resolvability** invariant for consumer process-doc bases (issue #229 follow-up, separate from the anchor-genericity guard). Content PR #322 (squash `1fc9b7a`); v0.9.0 remains the next release-cut. Earlier 2026-06-10 — CS70 close-out: **LRN-164** (process) + **LRN-165** (architectural) filed `applied` — directory-form close-out file-loss (CS16 per-file rename dropped `sub-invaders-bootstrap-summary.md`) + the coupled cross-repo phantom-artifact failure mode; mitigations shipped: `OPERATIONS.md § Claim` git-mv-whole-directory doctrine (C70-5), `scripts/check-clickstop.mjs` directory-form orphan guard + `.harness-closeout-allow-drop` (C70-6/C70-6a, 6 tests), and `§ Cross-repo procedures` target-existence pre-flight (C70-7); summary restored verbatim with an Archive-note banner (C70-1). Content PR #303 (squash `a5031d5`); #290 dispositioned at close-out. Earlier 2026-06-10 — CS58 close-out: **LRN-139** transitioned `open → applied` (plan-side fact-claim verification doctrine shipped as REVIEWS.md § 2.6c F1–F5 mirroring PR-side § 2.6a). **LRN-158** transitioned `open → applied` (state-of-the-world claims now F6 of plan-review, with canonical CLI probes: `gh release list --repo <o>/<r> --limit N`, `gh api repos/<o>/<r>/releases --jq 'map(select(.tag_name=="<tag>"))'`, `git ls-remote origin refs/tags/<tag>`, `gh pr|issue view <num> --repo <o>/<r>`, `gh label list --repo <o>/<r>`); LRN-158's CS59 (release-process docs) and CS67 (`harness release` verb) follow-up asks remain `open` in those CSs. OPERATIONS.md § Plan review attestation procedure gained a "Required verifications" subsection; canonical reviewer preamble extended with the F1–F6 plan-review clause; both mirrored byte-equal into `template/composed/`. PR #281 (squash HEAD `bb44def`). Earlier 2026-06-09 — CS70 close-out: **LRN-158** added (`open`) — release-cuts must `gh release list` + `gh api releases --jq '.[]'` for both published AND draft state BEFORE filing the backfill CS (CS70 was planned as a 2-phase release on the premise that `v0.7.0` was unshipped; in reality the tag + Release had existed since CS54's PR #227 created them via `release.yml` LRN-121, and the only Phase 1 action needed was deleting a stale duplicate Draft). **LRN-159** added (`open`) — `release.yml` LRN-121's tag-create event can produce a *second* artifact when manual reconciliation races with the auto-draft, leaving an `untagged-...` Draft alongside the published Release; every release-publish playbook must idempotently delete any `tag_name==<version> && draft==true` sibling. Also: confirmed the LRN-121 awk-extractor regression (auto-draft body was 30 chars / header only) — CS70 patched the body via gh API; if it recurs, file CS59 priority bump. Earlier (2026-06-08): CS61b close-out: **LRN-153** `applied`, disposition records the PR #256 squash SHA `019ba8c`; LRN-154 open → CS69. (CS63c close-out: **LRN-157** added (`open`) — an injectable side-effecting seam should OWN its cleanup (return `{path, cleanup}`), never be deleted by the caller via a path-prefix guess (not provenance-safe); also reject leading-dash refs before `git checkout` (option-injection; `--` is unusable for `<tree-ish>`). Earlier 2026-06-07 (CS63b close-out: **LRN-156** added (`open`) — `git diff --name-only` collapses renames to the destination path only, silently breaking gates that need the rename SOURCE (it broke CS63a's bypass guard **and** CS63b's close-out gate); use `--no-renames` / `--name-status -M` / files-API `previous_filename`. Earlier 2026-06-07 (CS63a close-out: **LRN-155** added (`open`) — `harness sync` has **no new-managed-file reconciliation**, so a newly-added managed file never reaches existing consumers via sync (only fresh `init` or a manual `managed.files` addition); folds into CS63c (guided update) / CS64. Earlier 2026-06-06 (out-of-CS learnings hygiene (CS61b): **LRN-106**'s missing `### LRN-106` header restored; **LRN-153** added — durable knowledge belongs in repo docs (`LEARNINGS.md` + process docs), **not** agent memory, because the orchestrator runs across multiple machines/clones; **LRN-154** added (`open`) — `check-learnings.mjs` does not enforce a `### LRN-NNN` header matching each entry's frontmatter `id`. Earlier (CS62 follow-up): **LRN-151** added (open) — a crash-corrupted local remote-tracking ref (`.git/refs/remotes/origin/<branch>` left as NUL/whitespace) makes *all* `git fetch` abort with `fatal: bad object`; repair = verify the remote via `git ls-remote`, delete the loose ref file, re-fetch (no reclone). Earlier same day (CS61 follow-up): **LRN-149** added — apply REVIEWS.md § 2.6b S1–S3 schema-conformance checks to your *own* config/schema reader BEFORE opening the PR (author-side self-check; enumerate all schema constraint dimensions up front to avoid per-dimension review-round ping-pong); **LRN-150** added — `git merge` commits also need the `Co-authored-by` trailer, which `git commit --no-edit` omits and `check-commit-trailers` then fails. Earlier same day (CS61): LRN-145 → `applied` — shared `loadReviewsPolicy` reader now backs all four review-gate linters, removing hard-coded `gpt-5.5`/high-risk literals; `REVIEWS.md § 2.6b` schema-conformance review checklist added; LRN-142 residual resolved; LRN-148 added — two schema-vs-runtime default divergences deliberately deferred + documented; LRN-147 added — review-gate scripts run from a `node_modules`-free `.harness-ci` clone, so the shared reader lives in dep-free `lib/reviews-policy.mjs`, never `config-reader.mjs` (AJV).) Earlier: 2026-06-05 (LRN-146 added — the orchestrator fresh-clone Session Start bootstrap is not self-contained: `node_modules` is gitignored/per-checkout so a fresh clone floods `node --test` with `ERR_MODULE_NOT_FOUND` (ajv/js-yaml) until dependencies are installed, and two `harness whoami` tests assert `id.endsWith('-ah')` which false-reds in any clone not named `agent-harness` (e.g. `agent-harness_copilot2` → `yoga-ah-c2`). The one-time `npm ci`/`npm install` setup step is not surfaced on the INSTRUCTIONS startup path (it lives only in CONTRIBUTING.md); filed CS62.) Earlier: 2026-06-04 (CS27 follow-up: LRN-143 added — post-plan-hash factual corrections go to implementation + a `## Notes` deviation record, never to the hashed `## Decisions`/`## Deliverables` rows (C27-3 / Copilot PR #239); LRN-144 added — the plan-vs-implementation close-out gate evaluates the merged content HEAD / content diff and its verdict is recorded in the **active** CS file *before* the active→done rename; doing the rename first leaves a half-migrated worktree (done file, unfilled PVI section) that check-clickstop false-rejects.) Earlier: 2026-05-15 (post-v0.5.2 retroactive close-out sweep: LRN-131 added — CS lifecycle compression on the SI-feedback velocity batch (CS48-CS52) left 5 stale `planned_*` files for ~16h until PR #204 retroactively renamed them; canonical close-out compression note documented as future template. Earlier post-v0.5.2 doc-sweep PR #203 added LRN-128 (orchestrator self-review on close-out), LRN-129 (gate auto-rerun on body edit), LRN-130 (UTC timestamp discipline), and amended LRN-124 with strike-count tracking.)

This file captures durable, project-applicable insights surfaced by completing CSs. See [RETROSPECTIVES.md](RETROSPECTIVES.md) for the precise definition of a "learning", the entry schema, and the harvest procedure.

**Pre-CS15b harvest invariant:** all `open` learnings must be dispositioned (status `applied`, `obsolete`, or `deferred` with explicit `deferred_until`) **before** the CS15b public-flip. This is enforced by the CS15a precondition checklist (see cs-plan). Per [LRN-003](#lrn-003) below.

**Entry schema (proto, CS01).** Each entry begins with a YAML frontmatter code fence containing the fields `id`, `date`, `category`, `source_cs`, `status`, `tags[]`, `claim_area?`, `deferred_until?`. Body follows in markdown with sections `Problem`, `Finding`, `Evidence`, `Disposition`, and any `Implications` etc. Locked into a JSON Schema by **CS02's** `schemas/learning.schema.json` (per cs-plan CS02 deliverables); CS05 builds `check-learnings.mjs` against that schema and uses the entries below as regression fixtures.

---

## Open

### LRN-184

```yaml
id: LRN-184
date: 2026-07-03
category: process
source_cs: CS92
status: applied
tags: [testing, test-seam, mocks, graphql, fixtures]
claim_area: harness-cli
```

**Problem:** A test that mocks an injectable network seam with a FIXED-ORDER response queue (e.g. `graphqlResponses = [prNode, identityNode, reviewsAt]` consumed positionally) silently breaks the moment the shared library flow under test gains one more seam call. The extra call shifts the queue, so an unrelated sibling test throws "unexpected call" / starves — a failure that surfaces only in the FULL `node --test` run, not the changed test's own file.

**Finding:** Prefer a DISPATCH-BY-QUERY mock over a positional queue: classify each call by its query/argument shape and return a per-type handler (static or call-index-aware), so adding a new call to the shared flow does not perturb existing tests. CS92 added a post-add `requested_reviewers` read to `engageCopilot`; the new CS92 test used a `classifyQuery()` / `makeGraphqlFn(handlers)` dispatcher and was unaffected, while the pre-existing positional-queue test `tests/cs60-copilot-engage-head.test.mjs` starved and needed a hand-inserted `reviewRequests` entry. Corollary: when a change adds a call to a shared flow, run the FULL suite (not just the changed file) — the break lands in a sibling.

**Evidence:** CS92 (PR #405, merge `45e4e9b`). `tests/cs92-copilot-engage-reliability.test.mjs` `makeGraphqlFn` / `classifyQuery` (dispatch-by-query, robust) vs `tests/cs60-copilot-engage-head.test.mjs` (positional `graphqlResponses` array that required a manual `reviewRequests()` insert). Surfaced by the `cs92-impl` sub-agent as a learning candidate and confirmed at orchestrator integration.

**Disposition:** Applied — the dispatch-by-query pattern is demonstrated in the CS92 test suite; adopt it for any test mocking a multi-call injectable seam. No tooling change required (convention).

---

### LRN-183

```yaml
id: LRN-183
date: 2026-07-02
category: anti-pattern
source_cs: CS85
status: deferred
deferred_until: 2026-09-01
tags: [doc-linters, inline-code, commonmark, guard, consistency-debt, follow-up]
claim_area: docs-guards
```

**Problem:** Doc linters that skip inline-code spans (so an illustrative example link/URL in backticks is not treated as a live reference) commonly strip them with the naive one-liner `line.replace(/`[^`]*`/g, '')`. CS85's review-of-record (GPT-5.5, three successive Needs-Fix rounds on PR #386) proved this pattern is NOT CommonMark-correct: it mishandles mismatched backtick runs (`` ``url``` `` — open-2/close-3 is not a valid span), escaped backticks (`` \` `` is a literal, not a delimiter), and backslashes inside a span (literal, so a backtick after `\` still closes). Depending on the linter's polarity these gaps yield false-negatives (a live bad reference hidden) or false-positives (an example flagged as broken).

**Finding:** CS85 replaced the naive stripper with a CommonMark-correct explicit forward scan (`stripInlineCode`, no regex backtracking) in `scripts/check-clickstop-link-durability.mjs`, but the fix landed ONLY in that guard. The sibling guard `scripts/check-doc-xref-resolvability.mjs` (CS81, extended by CS65's T4) still carries the identical naive `/`[^`]*`/g` at line ~276, in its `contentLines()` helper used by every live-reference check (LRN-token, cross-file anchor, relative-link, and the CS65-added classes). The two guards now diverge in correctness for the same sub-problem, and CS65's extension added more checks depending on the un-hardened copy. Candidate follow-up: extract the hardened `stripInlineCode` into a small shared, unit-tested module (node-builtins-only, review-gate-clone-safe) and have both guards import it — retiring the naive copy. Low severity / no known live failure today (both guards are green; the gap affects only backtick-wrapped example references), so this is consistency debt, not an active bug.

**Evidence:** `scripts/check-doc-xref-resolvability.mjs:276` (`lines[i].replace(/`[^`]*`/g, '')` in `contentLines()`); `scripts/check-clickstop-link-durability.mjs` `stripInlineCode` (the correct forward scan, CS85). Surfaced by CS85 review rounds R2/R3/R4 (each a Needs-Fix on exactly this inline-code class) — see `done_cs85_consumer-doc-clickstop-link-durability.md` and [LRN-180](#lrn-180) (point c).

**Disposition:** Open — not yet scheduled. Whoever next touches either doc-link guard (or files a guard-consolidation CS) should unify the inline-code stripper. No consumer impact; self-host guard internals only.

**Disposition update (2026-07-02, omni-ah-c2, weekly harvest):** **Deferred** (`deferred_until: 2026-09-01`). Consistency debt only (both guards green today); unify the `stripInlineCode` helper whoever next touches either doc-link guard, or file a guard-consolidation CS. Filed 0 days ago — deferring out of the immediate open set.

---

### LRN-182

```yaml
id: LRN-182
date: 2026-07-02
category: process
source_cs: CS65
status: applied
tags: [review-gates, copilot-engage, a5-ordering, review-log, timestamp, pr-body]
claim_area: reviews
```

**Problem:** The A5+A16 Copilot-review gate (`read-only-gates` → `check-copilot-review` / `harness pr-evidence`) treats a Copilot review as **stale** when its `submittedAt` PRECEDES the latest local Go row's `timestamp` in the PR body's `## Review log` — the A5 ordering doctrine ("a Copilot review predating the latest local Go must not satisfy the gate"). When the orchestrator hand-writes the local Go row with a rounded or future timestamp that lands AFTER Copilot's actual review time, the gate fails ("A5+A16 did not pass") even though Copilot reviewed at the correct PR HEAD and left no findings.

**Finding:** The local rubber-duck Go row's `timestamp` MUST be an instant **before** the Copilot review's `submittedAt`, because the enforced order is local-Go → then Copilot-review. When re-engaging Copilot after a fix commit, record the local Go with its real completion time (not a rounded/future value) and ensure it is earlier than Copilot's submission. `check-review-evidence` (A4) only validates the Go row's `analyzed_head`==HEAD + ISO format — it does NOT catch the A5 ordering violation, so the failure surfaces only in the separate `read-only-gates` job, which is easy to misread as a real Copilot-engagement failure.

**Evidence:** CS65 PR #388: the R5 Go row timestamped `2026-07-02T19:00:00Z` while Copilot re-reviewed at `18:57:14Z` → `read-only-gates` A5+A16 failed while `copilot-review-attached` / `review-log-evidence` / `review-threads-resolved` all passed; correcting R5 to `18:55:00Z` (before Copilot's submission) made the gate pass on re-run.

**Disposition:** Applied (CS65, merge `ef8a545`). Doctrine for future content-PR review logs; complements the A5 ordering doctrine in `OPERATIONS.md § A5 ordering doctrine` / REVIEWS.md.

---

### LRN-181

```yaml
id: LRN-181
date: 2026-07-02
category: process
source_cs: CS65
status: applied
tags: [parallel-dispatch, sub-agent-ownership, archival, test-fixtures, doc-watchdog, integration]
claim_area: clickstops
```

**Problem:** A CS that **archives or relocates content** breaks EXISTING tests that pin the moved content as real-data fixtures or doc-alignment watchdogs — CS65 moved 139 aged `LEARNINGS.md` entries to `LEARNINGS-archive.md` and thinned `OPERATIONS.md`, which broke `tests/cs49-operations-doctrine.test.mjs` (asserted `id: LRN-126` + body in `LEARNINGS.md`), `tests/cs48-implementer-self-review-ban.test.mjs` (LRN-127 evidence body), and `tests/cs44-docs-impl-alignment.test.mjs` (pinned `node(id:)` / `BOT_kgDOCnlnWA` literals in `OPERATIONS.md`). These tests are owned by **no sub-agent** — they sit outside every archival/thinning sub-agent's declared file scope — so the breakage falls through the ownership model and surfaces only in the full `node --test` suite at integration (7 failures), never in `harness lint` (which does not run `tests/`). Same full-suite-at-integration blind spot [LRN-180](#lrn-180)(d) records for lint-registry row-count tests, but a distinct class: **moved-content fixtures/watchdogs**, not registry counts.

**Finding:** Before dispatching an archival/relocation/rename sub-agent, the orchestrator must **grep `tests/` for every token, path, or literal being moved** (`LRN-###` ids, doc anchors, pinned constants like `BOT_...`) and **pre-assign the resulting test fixups to the orchestrator's integration scope** (or a dedicated sub-agent) — the moving sub-agent's disjoint [file ownership](#lrn-016) guarantees it will NOT fix them. Corollary: run a full `node --test tests/*.test.mjs` at integration (not just `harness lint`) whenever a CS moves content other suites may reference. Fixes preserve each test's intent (the content still exists) by re-pointing it at the new location (archive body + stub redirect), never by weakening the assertion.

**Evidence:** CS65 (merge `ef8a545`, #388). 7 integration `node --test` failures outside the 3 sub-agents' ownership: cs49 (`id: LRN-126` + `sub-invaders CS02 hotfix episode`), cs48 (LRN-127 `?startWave=N` evidence), cs44 (`BOT_kgDOCnlnWA` + `node(id:` in both `OPERATIONS.md` copies — the T2 thinning dropped the CS44-pinned literal), and `cs11-self-host-config` (new `LEARNINGS-archive.md` root file unclassified in `harness.config.json`). All fixed by the orchestrator at integration; `harness lint` stayed 34/0 green throughout (it does not run `tests/`).

**Disposition:** Applied (CS65). Doctrine recorded here + in the CS65 `## Notes / Learnings`; complements [LRN-180](#lrn-180)(d) (lint-registry count) and [LRN-016](#lrn-016) (sub-agent file ownership).

---

### LRN-180

```yaml
id: LRN-180
date: 2026-07-02
category: process
source_cs: CS85
status: applied
tags: [bootstrap, consumer-docs, clickstop-links, guard, both-modes, commonmark, doc-linter]
claim_area: templates
```

**Problem:** A durable consumer doc authored during bootstrap embedded harness-**transient** and harness-**institutional** artefacts: `henrik-me/sub-invaders`'s `ARCHITECTURE.md` (written by the CS16 bootstrap AUTHORING step — NOT the clean `template/seeded/ARCHITECTURE.md`) hard-linked a GitHub permalink into a `project/clickstops/active/active_cs16…` path that 404s the moment close-out `git mv`s the clickstop to `done/`, and duplicated the harness `### CS16 technology decisions` table + inline `(C16-xx)` provenance tags (#371). Same "harness-internal content leaks into a consumer doc" family as #229/#290/#370, but a distinct, previously-unguarded class: transient-clickstop-link + decision-table duplication.

**Finding:** (a) **Doctrine** — durable docs (`ARCHITECTURE.md`, design notes, onboarding) must never link into a transient `project/clickstops/active/` path (prefer, in order: no link → a commit-SHA permalink, which pins the historical tree and survives the `active/`→`done/` rename → a stable `project/clickstops/done/` pointer) nor duplicate a clickstop's decision table / `(C<NN>-<n>)` provenance; captured as the "Consumer-doc clickstop-link durability invariant" in the composed `OPERATIONS.md` base (ships to consumers). (b) **A guard whose rule is generic must RUN IN CONSUMERS, not `target:null`-skip like the CS72/CS81 self-host-only guards.** `check-clickstop-link-durability.mjs` uses the `package.json` name to select the SCAN SET (self-host: root `*.md` + `template/**/*.md`; consumer: root `*.md` + `.github/{copilot-instructions,pull_request_template}.md`), NOT to no-op — because #371's defect lives in consumer repos, and the branch-pinned-`active/`-permalink rule reads no harness-internal tokens, so it does not false-fail in consumers. (c) **A doc linter that skips inline-code needs CommonMark-correct handling or it hides live violations (false-negatives):** a run of N backticks closes only on a run of EXACTLY N (a mismatched run does NOT close); a backslash escapes a backtick ONLY in ordinary text, NOT inside a span (backslashes are literal in code spans, so a backtick after `\` still closes). A naive lazy-regex or single-`` `[^`]*` `` stripper over-strips — GPT-5.5 caught three successive false-negatives (mismatched runs, escaped backticks, backslash-inside-span); the fix is an explicit forward scan (no regex backtracking / ReDoS). (d) **Adding an always-enabled linter breaks any test asserting an EXACT dispatched-linter row count** (`tests/cs15d-aggregator.test.mjs`); it surfaces only in the FULL `node --test` suite — not the implementer's own test file or `harness lint` — so the orchestrator must run the full suite at integration when a CS adds a lint-registry entry.

**Evidence:** #371 (sub-invaders bootstrap-authored `ARCHITECTURE.md`). CS85: `scripts/check-clickstop-link-durability.mjs` (guard; `stripInlineCode` forward-scan hardened across GPT-5.5 R2/R3/R4); `template/composed/OPERATIONS.md` + root doctrine (byte-identical lockstep); `bin/harness.mjs` registration (non-null `target: cwd`, runs both modes) + `--explain` + help bullet; 38 `os.tmpdir()`-only tests; `tests/cs15d-aggregator.test.mjs` count 24→25. The harness's OWN docs + `template/seeded/ARCHITECTURE.md` verified clean (guard preventive there; consumer-active for real teeth). `harness lint` 35/0/3, `node --test` 1650/0, sync no-drift.

**Disposition:** Applied (CS85, merge `0e505c5`, #386). Minor SemVer (new linter script; no schema change). Consumer-side sub-invaders `ARCHITECTURE.md` cleanup tracked separately in that repo (notified issue-only per Hard Rule §6). #371 auto-closed on merge.

---

### LRN-179

```yaml
id: LRN-179
date: 2026-07-02
category: process
source_cs: CS83
status: applied
tags: [consumer-templates, invocation-forms, templating, render-context, npx, non-strict-templating, guard]
claim_area: templates
```

**Problem:** Consumer-shipped onboarding docs (and `OPERATIONS.md`) hard-coded harness-repo-local *run commands* — `node bin/harness.mjs <cmd>` and `node scripts/<harness-script>.mjs` — that do not exist in a consumer (which installs the CLI via `npx -y github:henrik-me/agent-harness#<ref>` and ships neither `bin/harness.mjs` nor the harness `scripts/`). Because these live in harness-managed core template prose (not consumer-owned local blocks), a consumer cannot fix them without `harness sync --mode=check` reporting drift, and `.github/copilot-instructions.md` ships as active repository custom instructions an agent reads every session (#370; re-files the command-example half of #356 CS81 left). The CS72 genericity guard caught banned LRN/CS/slug *anchor* tokens but not consumer-invalid *invocation* forms.

**Finding:** A command shown in a consumer-shipped doc must be runnable in a consumer, gated on render context via the existing `{{key}}` templating engine — NOT hard-coded. (a) A `{{harness_invoke}}` placeholder renders `node bin/harness.mjs` on the self-host (via a `templating.harness_invoke` config override) and `npx -y github:henrik-me/agent-harness#<ref>` for consumers. (b) **Non-strict-templating hazard:** `lib/templating.mjs` `applyTemplating` defaults `strict=false` and emits an unresolved `{{key}}` LITERALLY — so a new placeholder MUST have a value for every consumer or it ships as literal `{{harness_invoke}}` (worse than the bug). The fix injects a computed default UNDER `config.templating` in `lib/sync.mjs` (`{ harness_invoke: computeHarnessInvokeDefault(config), ...config.templating }`), so a config value wins and every existing consumer is covered on next sync with no re-init. (c) Map a script example to a CLI command only after verifying equivalence: `harness lint` runs check-learnings/readme/pr-body/planning-locality/text-encoding/templates but NOT `validate-schemas.mjs` (harness-repo-only) — asserting otherwise ships a false fact-claim (REVIEWS § 2.6a). (d) Guard it with a `node `-anchored invocation scan kept ORTHOGONAL to the anchor-token scan (a separate scope set), so it can cover `OPERATIONS.md`, which legitimately carries CS/LRN tokens the anchor scan bans.

**Evidence:** #370 (sub-invaders v0.10.0→v0.11.0 adoption review). CS83: 3 invocations in `template/composed/INSTRUCTIONS.md`, 3 in `.github/copilot-instructions.md` (+1 adjacent false "schema validation" claim fixed), 6 in `RETROSPECTIVES.md`, 2 in `READMEGUIDE.md`, 8 in `template/composed/OPERATIONS.md` (7 templated, 1 reworded — the clone-then-`node bin/harness.mjs` CI prose → source-ref). `computeHarnessInvokeDefault` + merge in `lib/sync.mjs`; `harness.config.json` override; `check-consumer-template-genericity.mjs` `INVOCATION_SCOPE_SET` (8 docs) + 2 patterns + 11 fixtures. **Self-host composed-root regeneration gotcha (for future composed-template CSs):** roots are regenerated in LOCKSTEP with templates and must never be left divergent — `sync --mode=apply`/`check` fail-closed here on composed divergence because the CS55-era lock's `template_prose_hash` was stale (case-b) and INSTRUCTIONS/copilot-instructions lock entries were mis-classed `managed` (case-d). Regenerated correctly via `mergeComposed(rendered, root, { lockRecords: [], lockTemplateProseHash: null })` (case-c bootstrap auto-adopt), lock left untouched (matches the `0a4eff8` self-host pattern; `sync --mode=check` compares root-vs-rendered-template, not the lock). Full `node --test` 1609 pass / 0 fail (+25); `harness lint` 34/0.

**Disposition:** Applied (CS83, merge `e05aa75`, #374). Minor SemVer (new optional `harness_invoke` templating key; open string map, no schema change). Follow-up: the self-host lock is stale (CS55-era `harness_ref`/`resolved_sha`, mis-classed composed entries) — out of CS83 scope; a lock-normalization pass could adopt it.

---

### LRN-178

```yaml
id: LRN-178
date: 2026-07-02
category: architectural
source_cs: CS82
status: applied
tags: [provenance, lock-file, npx, fail-closed, sync-engine, package-lock]
claim_area: sync-engine
```

**Problem:** `harness sync --mode=apply` derived the lock's `harness_ref` + `resolved_sha` solely by shelling `git` against the running install directory. Under `npx`/`npm` installs that directory has no `.git` (npm strips it from the installed package), so the git probe failed and the engine silently recorded a placeholder — `harness_ref: "unknown"`, an all-zero `resolved_sha`, and `version: "unknown"` scaffolds — a corrupt, non-reproducible pin that passed the lock schema (which accepts any 40-hex incl. all-zero) and only surfaced downstream (#352-F2).

**Finding:** Provenance must NOT derive solely from the CLI's own `.git`. The authoritative source under npx/npm is the install project's `node_modules/.package-lock.json`: the harness package's `packages["node_modules/<pkg>"]` entry carries the resolved commit in its `resolved` `git+https://…#<40-hex>` URL and the requested ref in `from`/spec/`version` (NOT `packages[""]`, which a `github:` install leaves without a `resolved`). The derivation is an ordered chain — (1) npx/npm cache → (2) git self-host → (3) fail-closed — resolved from the RUNNING module's package root (`import.meta.url`), not the passed-in harness path, so it is correct under both npx and self-host. Apply mode must FAIL-CLOSED (new `ESYNC_UNRESOLVED_PROVENANCE`, writing no lock) rather than persist a placeholder; `--resolved-sha` overrides only `resolved_sha`, so it is not a standalone rescue when `harness_ref` is underivable. Crucially the guard is apply-only: `sync --mode=check`/`--mode=dry-run` validate file drift, NOT provenance, so they never start red-flagging a pre-existing corrupt lock. The lock schema is deliberately NOT tightened (tightening would fail-closed on READING an existing placeholder lock).

**Evidence:** #352-F2 (sub-invaders v0.10.0 pin-adoption feedback). CS82: `lib/sync.mjs` exports `resolveHarnessProvenance(deps)` (seam-injectable fs reader + git runner + install root; npx-cache → git → fail-closed) and `validateResolvedProvenance()` (apply-only guard, new `ESYNC_UNRESOLVED_PROVENANCE` code); scaffold `version`s derive from the resolved `harness_ref`. `tests/cs82-lock-provenance.test.mjs` (27 tests, `os.tmpdir()` only) covers every branch incl. sha-without-ref → fail-closed (C82-7) and check/dry-run no-throw (C82-8); `tests/sync.test.mjs` migrated to a hermetic provenance seam. `OPERATIONS.md` + `template/composed/OPERATIONS.md` § Sync gained a "Lock provenance" subsection; `schemas/harness-lock.schema.json` left unchanged (C82-3).

**Disposition:** Applied (CS82, merge `24f36287`). The ordered chain + apply-mode fail-closed ship in `lib/sync.mjs`; docs + CHANGELOG `[Unreleased]` (Fixed, patch bump) record it.

---

### LRN-177

```yaml
id: LRN-177
date: 2026-07-02
category: tooling
source_cs: CS81
status: applied
tags: [dangling-refs, resolvability, doc-xref, linter, consumer-templates, cross-references]
claim_area: linters
```

**Problem:** The v0.10.0 consumer templates shipped three dangling cross-references that no gate caught: `OPERATIONS.md` cited placeholder learning IDs `LRN-A`/`LRN-B` (never assigned at CS70 close-out; the real IDs are `LRN-164`/`LRN-165` — #352-F1); `INSTRUCTIONS.md` linked `OPERATIONS.md#sub-agent-report-shape`, a stale anchor after the heading gained a `(mandatory)` suffix → `#sub-agent-report-shape-mandatory` (#356a); and `template/managed/READMEGUIDE.md` linked `docs/adr/000{1,2}-*.md`, which exist at the harness root but ship under no `template/` class, so they 404 in every consumer (#356b). Each is a distinct ref class, and no existing linter validated any of them: `check-instructions.mjs` checks LRN/ADR/anchor refs only for `INSTRUCTIONS.md` (not `OPERATIONS.md`/`REVIEWS.md` prose, and not cross-file `X.md#anchor` targets), and `check-consumer-template-genericity.mjs` scans `READMEGUIDE.md` only for banned tokens, not for broken relative paths.

**Finding:** A consumer-shipped doc must contain only cross-references that RESOLVE in the consumer's delivered tree, and each resolvability class needs its own mechanical guard. `scripts/check-doc-xref-resolvability.mjs` (new, node-builtins-only, self-host-gated) now validates all three: **(a)** every uppercase `LRN-<id>` token in `OPERATIONS.md`/`REVIEWS.md` resolves to a `### LRN-<id>` heading in `LEARNINGS.md`; **(b)** every `](X.md#anchor)` link in `INSTRUCTIONS.md` (where sibling doc `X.md` exists) hits a real heading (GitHub anchor algorithm); **(c)** every relative FILE link in the consumer-onboarding doc set (`READMEGUIDE.md` + the CS72 set) resolves to a target that ships under `template/` (composed/managed/seeded). Checks (b)/(c) skip fenced code + inline-code spans so example links don't false-positive; the composed process-doc bases are excluded from (c) (pervasive out-of-scope `docs/adr` links — follow-up R3). It is builtins-only by design (NOT an extension of `check-instructions.mjs`, whose `lib/doc-schema.mjs`→`js-yaml` dep would break the dependency-free review-gate clone, LRN-147), so a new linter script ⇒ **Minor** SemVer (C81-6).

**Evidence:** #352-F1 + #356 (sub-invaders v0.10.0 pin-adoption feedback). CS81: `OPERATIONS.md` + `template/composed/OPERATIONS.md` L157/591/602 `LRN-A/B`→`LRN-164/165`; both `INSTRUCTIONS.md` copies L267 anchor → `#sub-agent-report-shape-mandatory`; `template/managed/READMEGUIDE.md` L9/338 `docs/adr` pointers genericized (no `docs/adr` ref remains). `scripts/check-doc-xref-resolvability.mjs` + 18 fixture tests (`tests/cs81-doc-xref-resolvability.test.mjs`, `os.tmpdir()` only) cover each pass/fail branch; the guard passes the remediated tree (`harness lint` exit 0) and fails each reintroduced class. `REVIEWS.md` carried no placeholder LRN tokens (audited, untouched).

**Disposition:** Applied (CS81, merge `be3bf305`). The guard is wired into `harness lint` as the self-host-only `doc-xref-resolvability` entry (gated by package name, exactly like `consumer-template-genericity`); the three dangling refs are fixed in both root and `template/composed/` mirrors. Follow-up R3 (pervasive relative `docs/adr/*` links in the composed process bases `OPERATIONS.md`/`CONVENTIONS.md`) is out of scope here and tracked for the process-doc genericization track (alongside CS76).

---

### LRN-168

```yaml
id: LRN-168
date: 2026-06-24
category: architectural
source_cs: CS72
status: applied
tags: [genericity-guard, linter, consumer-templates, composed, local-blocks, scan-scope]
claim_area: linters
```

**Problem:** CS72's `check-consumer-template-genericity` guard first EXEMPTED allowlisted `harness:local-*` block bodies of the composed bases from its banned-reference scan (mirroring the plan's "local-block regions excluded" wording). But a composed template's DEFAULT local-block body is rendered verbatim into a fresh consumer's file on first init (`lib/composed.mjs` seeds an absent block from the template default), so that body IS consumer-shipped. A future `LRN-123` / `CS54` / `LEARNINGS.md#lrn-…` / slug placed in a template base's default block body would leak to consumers yet PASS the guard — a silent blind spot in the exact regression the guard exists to prevent. A fixture test even locked in the bad behavior.

**Finding:** A scrub/genericity guard's scan scope must equal the EXACT byte surface that reaches consumers — not the author's mental model of which regions are "self-host-private." The harness self-host's own anchor-laden content lives in the RENDERED repo-root docs (which the linter does not target — it scans `template/**`); the template bases (including default local-block bodies) are all consumer-shipped and must be scanned in full. Fix: scan the entire composed base; keep `parseComposed` only for fail-closed malformed-marker handling.

**Evidence:** CS72 independent gpt-5.5 review Finding 1 (NEEDS-FIX) on PR #322; `scripts/check-consumer-template-genericity.mjs` `scanComposed` (full-base scan after fix) + the inverted test; `lib/composed.mjs` seeds an absent consumer block from the template default. PVI confirmed the divergence from the plan's "exclude local blocks" wording is a correctness improvement.

**Disposition:** Applied (CS72, merge `1fc9b7a`). The shipped linter scans composed bases in full; the OPERATIONS genericity-invariant note + CHANGELOG document this.

---

### LRN-169

```yaml
id: LRN-169
date: 2026-06-24
category: process
source_cs: CS72
status: applied
tags: [templating, escape, windows-paths, composed-reclassification, seeded-config, fresh-init, placeholders]
claim_area: templates
```

**Problem:** Two related fresh-init placeholder failures surfaced when CS72 seeded the generic core docs for delivery: (1) a Windows-path example `C:\src\{{repo_short}}` shipped an UNRESOLVED `{{repo_short}}` because the templating engine treats `\{{` as its ESCAPE syntax (`lib/templating.mjs`: `\{{name}}` → literal `{{name}}`, backslash consumed) — the placeholder was emitted literally AND the backslash dropped; doubling the backslash does not help. (2) Reclassifying `INSTRUCTIONS.md` to composed without adding every `{{key}}` it references (`repo_slug`) to the SEEDED templating map left a fresh consumer's rendered doc with an unresolved `{{repo_slug}}`. Neither was caught by `harness lint` — only an init→materialize→grep-for-`{{` integration check surfaced them.

**Finding:** (a) Template authors must avoid a `\` immediately before a `{{placeholder}}` (use a non-backslash separator or a literal doc placeholder like `<repo>`); the templating escape silently consumes it. (b) Reclassifying a doc to composed requires adding EVERY `{{key}}` it references to `template/seeded/harness.config.json`'s `templating` map, and the only reliable check is a fresh `harness init` into a temp dir followed by a grep for residual `{{…}}` in the materialized core docs — `harness lint` does not catch unresolved placeholders.

**Evidence:** CS72 Copilot review + wave-4 escalation on PR #322; `TRACKING.md` `C:\src\{{repo_short}}` → `C:\src\<repo>` fix; `repo_slug` added to `template/seeded/harness.config.json`; `lib/templating.mjs` escape logic. Exit criterion 3 ("no unresolved `{{…}}`") was only met after both fixes.

**Disposition:** Applied (CS72, merge `1fc9b7a`). Recommend a future init-render placeholder-residue guard — noted for the consumer-template-delivery follow-up.

---

### LRN-171

```yaml
id: LRN-171
date: 2026-07-01
category: process
source_cs: CS67
status: deferred
deferred_until: 2026-09-01
tags: [workboard, auto-approve, pause, branch-allowlist, ci-gate]
claim_area: workflows
```

**Problem:** Pausing an in-flight CS mid-work (to pick up a prerequisite) requires a WORKBOARD state change, which goes through a PR. A `workboard/cs<NN>-pause` PR **fails** the `validate-and-approve` (workboard-auto-approve) job because its branch-name allowlist recognizes only `claim|close|close-out` actions — even though `validate-workboard-only-scope`, `pr-body`, and `commit-trailers` all pass. So a legitimately-scoped pause PR cannot auto-merge.

**Finding:** There is no first-class **pause / unclaim** workboard workflow. A pause PR must be admin-merged (owner override), or the auto-approve branch allowlist should be extended with a `pause`/`unclaim` action (and `check-workboard` should accept the `⏸️ Paused` state — it already does). Adjacent to CS71 (workboard-only gate hygiene).

**Evidence:** CS67 session — PR #331 (CS65 pause) failed `validate-and-approve` with `branch name 'workboard/cs65-pause' does not match the workboard-only branch pattern` while all substantive gates passed; admin-merged as the documented owner-override path.

**Disposition:** Open — candidate: extend `workboard-auto-approve.yml` branch regex to include `pause`/`unclaim`, or document pause admin-merge in OPERATIONS § Claim. Fold into CS71 if claimed.

**Disposition update (2026-07-02, omni-ah-c2, weekly harvest):** **Deferred** (`deferred_until: 2026-09-01`). Correction: planned **CS71** does **not** absorb this — CS71 Decision 3 explicitly leaves `workboard-auto-approve.yml` unmodified (it fixes the *evidence-gate* skip, not the `validate-and-approve` **branch allowlist**). The pause/unclaim branch-allowlist gap needs its own home (extend the `validate-and-approve` regex) or a CS when a pause PR is next required; admin-merge is the interim workaround.

### LRN-172

```yaml
id: LRN-172
date: 2026-07-01
category: process
source_cs: CS67
status: obsolete
tags: [reviews, review-log, a5-ordering, timestamps, copilot]
claim_area: review-loops
```

**Problem:** The A5+A16 gate (`scripts/check-copilot-review.mjs`) requires the Copilot review at the current HEAD to be submitted **after** the latest local (rubber-duck) Go review's timestamp. Fabricated review-log timestamps that postdate the real Copilot review fail A5 (surfacing as a stale-Go / "latest copilot review is on a stale commit" error even when Copilot *did* review the HEAD).

**Finding:** In the `## Review log`, the local Go row's `timestamp` for a given HEAD must **precede** that HEAD's real Copilot review `submitted_at`. Because the rubber-duck and Copilot are dispatched in parallel and the rubber-duck finishes first, use realistic timestamps (rubber-duck-completion `<` Copilot-`submitted_at`); never fabricate a local-Go time later than the Copilot review. Fetch the real Copilot timestamps (`gh api .../pulls/<n>/reviews`) when filling the log.

**Evidence:** CS67 PR #335 — an R5 Go row fabricated at `02:00:00Z` postdated Copilot's real `7f16be1` review (`01:48:07Z`); `read-only-gates` failed on A5 until every local-Go timestamp was corrected to precede its corresponding Copilot review.

**Disposition:** Open — candidate: a one-line note in REVIEWS.md § 2.8 (Review log) documenting the timestamp-ordering rule.

**Disposition update (2026-07-02, omni-ah-c2, weekly harvest):** **Obsolete — superseded by [LRN-182](#lrn-182)** (applied at CS65, merge `ef8a545`), which records the identical "the local `Go` row's timestamp must precede the Copilot review's `submittedAt`" rule. The A5 ordering doctrine is already documented/enforced at REVIEWS.md gate **A5** ("the Copilot review's `submittedAt` must ALSO be after the latest local `Go` row's `timestamp`"). No separate action needed.

### LRN-176

```yaml
id: LRN-176
date: 2026-07-01
category: architectural
source_cs: CS80
status: applied
tags: [release, release-yml, gh-release-create, single-creator, workflow, architecture]
claim_area: harness-cli
```

**Problem:** Two independent code paths created a GitHub Release for a pushed tag — the `harness release` verb's Phase B (`gh release create`) AND `.github/workflows/release.yml` (CS14, pre-verb; `gh release create` on `v*.*.*` push). This redundancy caused the LRN-175 duplicate-draft. CS79 mitigated it by guarding the workflow (Option A), but that left TWO release creators coordinated by an existence check — the redundancy itself remained.

**Finding:** There should be exactly ONE release creator. Because `release.yml` is **self-host-only** (never shipped to consumers) while the verb IS shipped, consumers already use the verb as their sole creator — so the clean, consistent fix is to make the **verb the single creator everywhere** and **delete `release.yml`** (not to ship the workflow to every consumer, the discarded B1 alternative). The verb already creates the release, so deleting the workflow removes the second creator with **no `lib/` change**. A manual (no-verb) tag push now creates the Release by hand (`gh release create <tag> --verify-tag --draft`; `--verify-tag` aborts rather than auto-creating a lightweight tag, matching the verb). This supersedes the CS79 guard (removed together with the workflow).

**Evidence:** CS80. `.github/workflows/release.yml` + `tests/cs14-release-workflow.test.mjs` deleted; `release.yml` was the only tag-triggered workflow, was not a required status check, and was not in `template/managed`/`managed.files`. The v0.10.0 cut (CS77) had already shown the verb creates the release itself (its draft existed before the workflow's duplicate).

**Disposition:** Applied (CS80, merge `59030a6`). `release.yml` + its test deleted; the verb is the single release creator; docs (OPERATIONS steps 9–10, bin help, INSTRUCTIONS) updated for the manual `gh release create` fallback.

### LRN-175

```yaml
id: LRN-175
date: 2026-07-01
category: tooling
source_cs: CS77
status: applied
tags: [release, release-yml, gh-release-create, duplicate-draft, workflow, idempotency]
claim_area: harness-cli
```

**Problem:** Cutting a release with `harness release --publish --apply` produces TWO draft GitHub Releases for the tag. Phase B does `git push origin v<x>`, which triggers `.github/workflows/release.yml` (fires on `v*.*.*` push); that workflow unconditionally runs `gh release create <tag> --draft` with NO idempotency probe. The verb ALSO creates its own draft via `gh release create <tag> --verify-tag --draft`. Because GitHub permits multiple *draft* releases per tag, the result is two drafts (one authored by the pusher, one by `github-actions[bot]`) with identical CHANGELOG notes.

**Finding:** Expect the double-draft on every verb-cut and reconcile per LRN-159 BEFORE publishing: `gh api repos/<owner>/<repo>/releases --jq 'map(select(.tag_name=="v<x>"))'` → if length > 1, delete the extra with `gh api -X DELETE repos/<owner>/<repo>/releases/<id>` (keep either — the notes are identical). The verb's own idempotency does NOT prevent this: its `gh release view` probe runs ~immediately after the push, before `release.yml` has spun up, so it sees no existing release and creates one; `release.yml` then creates the second ~20–40s later. A follow-up should make the verb race-proof — e.g. wait for / adopt the `release.yml` draft, or have `release.yml` no-op when a release already exists.

**Evidence:** CS77 v0.10.0 cut. After `harness release --publish --version 0.10.0 --sha 6ccc284 --pr 345 --apply`: `gh api …/releases` returned 2 entries for `v0.10.0` (id 347664859 author `henrik-me`; id 347664926 author `github-actions[bot]`), both `draft=true`, same `created_at`, identical bodies. Deleted the `github-actions[bot]` one → exactly one release; published to Latest.

**Disposition:** Applied (CS79, merge `9171ca6`). `.github/workflows/release.yml`'s "Create GitHub Release" step now guards with `if gh release view "$TAG_NAME" >/dev/null 2>&1; then exit 0; fi` before `gh release create`, so it no-ops when the verb already created the release — the verb path yields a single draft (the verb creates the release ~1–2s post-push, before the workflow's ~20–40s spin-up). Manual (no-verb) tag pushes still get a release from the workflow. Order-independent verb hardening (skip on any post-push `gh release view`) is deferred as OQ2, not required.

**Superseded by CS80 ([LRN-176](LEARNINGS.md#lrn-176)):** the CS79 workflow guard was removed together with `release.yml` — the verb is now the single release creator, eliminating the duplicate at the source (no second creator to coordinate). LRN-175 remains `applied` (the double-draft is resolved); CS80 replaced the mechanism.

### LRN-174

```yaml
id: LRN-174
date: 2026-07-01
category: tooling
source_cs: CS78
status: applied
tags: [release, git, annotated-tags, ls-remote, gh-release-create, idempotency]
claim_area: harness-cli
```

**Problem:** `gh release create <tag> --target <sha>` creates a **lightweight** git tag, not the **annotated** tag (`git tag -a … -m`) that OPERATIONS § Release process step 9 and most releases use — so `harness release` Phase B diverged from its own documented process. Fixing it exposed two subtle git behaviors: (1) `git ls-remote --tags origin refs/tags/<tag>` with an *exact* single refspec returns ONLY the tag-OBJECT sha for an annotated tag — the peeled `<commit> refs/tags/<tag>^{}` line appears only if `refs/tags/<tag>^{}` is *also* requested — so a peeled-preferring parser silently compares the tag-object sha and mis-fires `ERELEASE_TAG_EXISTS` on rerun; (2) a `git push` that fails after `git tag -a` leaves a LOCAL-only tag, and a remote-only state check then re-runs `git tag -a`, which fails on the existing local tag.

**Finding:** To cut annotated tags via the CLI: `git tag -a <tag> <sha> -m "Release <tag>"` + `git push origin <tag>`, then `gh release create <tag> --verify-tag` (release-only; `--verify-tag` aborts rather than auto-creating a lightweight tag). For idempotency, pass BOTH `refs/tags/<tag>` AND `refs/tags/<tag>^{}` to `ls-remote` (prefer the `^{}` line); and before `git tag -a`, consult the LOCAL tag (`git rev-parse -q --verify refs/tags/<tag>^{commit}`) so a failed-push rerun resumes by re-pushing instead of re-tagging. `git rev-parse -q --verify` exits 1 for absent, non-0/non-1 for real errors — fail fast on the latter.

**Evidence:** CS78 PR #341 (`c167dd8`). The blocking ls-remote peel bug was caught by the independent GPT-5.5 review and verified empirically: `git ls-remote --tags origin refs/tags/v0.9.0` → only `c22e2e… refs/tags/v0.9.0` (the tag object); adding `refs/tags/v0.9.0^{}` → also `f731ea… refs/tags/v0.9.0^{}` (the commit). v0.5.0/v0.6.0/v0.8.0/v0.9.0 are annotated; v0.7.0 is lightweight (a CS70 backfill artifact).

**Disposition:** Applied (CS78, merge `c167dd8`). `lib/release.mjs` `publishRelease` now cuts annotated tags via `git tag -a` + `git push` + `gh release create --verify-tag`, requests the peeled `^{}` refspec in `ls-remote`, and consults the local tag for push-failure resume; 69 tests + the OPERATIONS/CHANGELOG/help docs document the flow.

### LRN-173

```yaml
id: LRN-173
date: 2026-07-01
category: process
source_cs: CS67
status: applied
tags: [copilot-engage, api-lag, verification, review-at-head]
claim_area: harness-cli
```

**Problem:** `harness copilot-engage <pr>` can **exit 0** (claiming a Copilot review at HEAD was found) while the actual Copilot review at the current HEAD only lands ~1–2 minutes later — so trusting its exit code leads to acting on a stale review state. Separately, ad-hoc `gh api .../pulls/<n>/reviews` (REST) and even GraphQL `reviews` queries can lag 1–2 minutes behind the review-at-HEAD state that `check-copilot-review.mjs` and the CI `copilot-review-attached` gate observe.

**Finding:** Do not trust `copilot-engage`'s exit code alone. Verify the latest Copilot review's `commit_id == PR HEAD` before proceeding (poll the reviews list until it matches), and treat `scripts/check-copilot-review.mjs --head <HEAD>` / the CI `copilot-review-attached` gate as authoritative over ad-hoc queries. Each premature-proceed caused an extra alternating round (Copilot re-reviewed the new HEAD and found one more item).

**Evidence:** CS67 PR #335/#336 across ~7 HEADs — `copilot-engage` exited 0 at poll ~2 (≈31s) but the reviews API showed the Copilot review one commit behind for 1–2 min; the authoritative `check-copilot-review --head` and `copilot-review-attached` gate were consistent.

**Disposition:** Open — candidate: harden `lib/copilot-engage.mjs` to require `review.commit_id == headRefOid` before declaring success (not just "a review submitted at/after request time"), and add a retry/settle window.

**Disposition update (2026-07-02, omni-ah-c2, weekly harvest):** **Filed as planned CS92** (`project/clickstops/planned/planned_cs92_copilot-engage-reliability-hardening.md`, decision **C92-3**). Note: the poll path *already* enforces `commit.oid === headSha` + a submitted-after floor (`lib/copilot-engage.mjs:336-340`), so CS92 closes the **residual** gap (the `opts.noPoll` early return → explicit `verified: false`) rather than introducing review-at-HEAD from scratch. Status stays `open`; flip to `applied` at CS92 close-out.

**Applied (2026-07-03, omni-ah-c2, CS92 close-out):** Shipped in CS92 (merge `45e4e9b`, PR #405). The poll path's `commit.oid === headSha` + submitted-after-floor guarantee was already present and is **unchanged**; CS92 closed only the **residual** `opts.noPoll` gap via an additive `verified` flag (no-poll ⇒ `verified: false`, poll success ⇒ `verified: true`, exit codes unchanged) plus the LRN-160 fast-fail that removes the misleading success-worded timeout.

### LRN-170

```yaml
id: LRN-170
date: 2026-06-24
category: architectural
source_cs: CS72
status: open
tags: [consumer-templates, composed, cross-references, genericity, issue-229, follow-up]
claim_area: templates
```

**Problem:** CS72's genericity guard enforces ONE invariant for consumer-shipped onboarding docs — no harness-internal ANCHORS (`LRN-<digits>` / `CS<digits>` / `LEARNINGS.md#lrn-` / slug). But a SECOND, distinct failure mode it does not cover (issue **#229**): the consumer-shipped composed PROCESS-doc bases (`template/composed/OPERATIONS.md`, `template/composed/REVIEWS.md`) cross-reference SIBLING files a given consumer may not sync (`INSTRUCTIONS.md`, `.github/copilot-instructions.md`), producing dangling refs in the rendered consumer doc. A cross-ref to a non-synced sibling contains no banned anchor token, so the genericity guard passes it.

**Finding:** "Consumer docs are clean" needs TWO invariants: (a) no harness-internal anchors (CS72's guard), and (b) cross-refs resolve against the consumer's GUARANTEED synced set (the #229 class). CS72 deliberately scoped only (a) + the 5 onboarding docs; the OPERATIONS/REVIEWS process-doc bases were carved out (C72-3 out-of-scope). A follow-up CS should add the cross-ref-resolvability invariant + a guard for the process-doc bases, and reconcile with CS72's choice to make `INSTRUCTIONS.md` / `copilot-instructions.md` consumer-present (which partially resolves #229's `INSTRUCTIONS.md` refs for NEW consumers, but not existing ones, and not `copilot-instructions.md` universally).

**Evidence:** Issue **#229** (composed templates reference non-synced `INSTRUCTIONS.md` / `.github/copilot-instructions.md`); CS72 plan C72-3 out-of-scope carve-out; the session's #229-vs-CS72 boundary analysis. The genericity guard's scope set is the 5 onboarding docs, not the process-doc bases.

**Disposition:** Open. File a follow-up CS to add the cross-ref-resolvability invariant + guard for the OPERATIONS/REVIEWS composed bases and close issue #229. Distinct from CS72's anchor-genericity guard.

---

### LRN-167

```yaml
id: LRN-167
date: 2026-06-24
category: process
source_cs: CS66
status: open
tags: [check-clickstop, directory-form-cs, pvi-gate, fenced-code, lint, validation-gap]
claim_area: orchestrator
```

**Problem:** While building `harness review-cs` (CS66 C66-3), two pre-existing gaps surfaced in `scripts/check-clickstop.mjs`: (1) its main validation loop iterates only direct `.md` *file* entries of each `{planned,active,done}` dir (`if (!entry.isFile()) continue;` at :544), so **directory-form** CS plans (`<state>_csNN_<slug>/<state>_csNN_<slug>.md`) are never passed to `checkFile()` and escape required-field + close-out-task + `## Plan-vs-implementation review` (PVI) validation; (2) the PVI gate's heading detection (`hasMarkdownHeading` + a `/m` regex) is **not fence-aware**, so a `## Plan-vs-implementation review` line inside a fenced code block (or a 4-backtick fence containing inner triple-backticks) satisfies the gate even when no real H2 exists. A directory-form done CS missing its PVI section, or one whose only PVI heading lives in a code fence, would pass `check-clickstop` silently.

**Finding:** `review-cs` worked around both in its own code — a direct PVI backstop that reads the located file, plus a builtins-only fence-aware `findPviHeadingIndex` (tracking fence char AND opening run length per CommonMark) — so the verb is correct regardless of the linter. But `check-clickstop.mjs` itself remains the authoritative gate and should be aligned: (a) recurse into directory-form CS dirs to validate the inner plan `.md`, and (b) make the PVI heading check fence-aware (mirror the `findPviHeadingIndex` run-length logic). Until then, `review-cs` is *stricter* than the linter it backstops.

**Evidence:** `scripts/check-clickstop.mjs:543-545` (the `entry.isFile()` skip); `:284-312` (PVI gate via `hasMarkdownHeading` + `GATE_H2_RE`, no fence tracking) vs `lib/doc-schema.mjs` `assertHeadings` (scans all `^#{1,6}\s+` with no fence state); CS66 surfaced both — Copilot review on PR #320 flagged the fence-naive regex in `review-cs` `directPviProblems` and the rubber-duck R6 caught the fence-length edge case; fixed in `lib/review-cs.mjs` (`findPviHeadingIndex`, `extractPviSectionBody`, `directPviProblems`) + `tests/lib-review-cs.test.mjs`.

**Disposition:** Open. Recommend a follow-up CS to (a) make `check-clickstop.mjs`'s main loop validate directory-form CS plan files and (b) make its PVI heading gate fence-aware, mirroring `review-cs`'s `findPviHeadingIndex`. Until then the `review-cs` backstops cover the verb's own correctness.

---

### LRN-164

```yaml
id: LRN-164
date: 2026-06-10
category: process
source_cs: CS70
status: applied
tags: [close-out, directory-form-cs, git-mv, file-loss, check-clickstop, lint]
claim_area: orchestrator
```

**Problem:** A directory-form CS (plan at `<state>/<state>_csNN_<slug>/<state>_csNN_<slug>.md`) can carry sibling artifact files alongside the plan file. CS16's close-out renamed only the plan file (`git mv active_cs16_*.md -> done_cs16_*.md`) instead of the whole directory, silently dropping the sibling `sub-invaders-bootstrap-summary.md` (created in `e2b233a`). It survived only in git history and 404'd from four CS files for ~6 months (agent-harness#290).

**Finding:** Directory-form CS close-out MUST `git mv` the whole directory (`active/active_csNN_<slug>/` -> `done/done_csNN_<slug>/`), never per-file. CS70 added this as normative doctrine to `OPERATIONS.md § Claim` (C70-5, + `template/composed/OPERATIONS.md` mirror) and mechanized it in `scripts/check-clickstop.mjs` (C70-6): a directory-form orphan check that fails if any file ever present under the CS's `active/` directory in git history is missing from `done/` after close-out, with a per-CS `.harness-closeout-allow-drop` allow-list (C70-6a) for intentional drops. Node-builtins only, so it runs under the dependency-free `.harness-ci` clone (LRN-094 / LRN-147).

**Evidence:** agent-harness#290; CS16 close-out commit `40e464c` (per-file rename that dropped the summary); restored + guarded at CS70 content PR #303 (squash `a5031d5`); 6 orphan tests in `tests/check-clickstop-orphan.test.mjs`. The same check surfaced six additional dropped `si-cs-plans/*` consumer audit-trail copies (declared intentional via `.harness-closeout-allow-drop`).

**Disposition:** Applied (CS70). Cross-references LRN-165 (cross-repo phantom-artifact, the sibling failure mode), `sub-invaders#91`, and CS16 close-out `40e464c`.

---

### LRN-166

```yaml
id: LRN-166
date: 2026-06-24
category: process
source_cs: CS73
status: deferred
deferred_until: 2026-09-01
tags: [sub-agent-dispatch, briefing, changelog, structured-docs, idempotency]
claim_area: orchestrator
```

**Problem:** A CS73 sub-agent briefing instructed "add a new `### Fixed` subsection immediately before `### Documentation`" in `CHANGELOG.md`. A `### Fixed` subsection already existed under `[Unreleased]` (the CS64 post-merge PVI entry, placed after `### Documentation`). Following the positional instruction verbatim would have produced two `### Fixed` headers under one release — a malformed CHANGELOG. The implementer used good judgment and added the entry to the existing section instead and flagged the collision in DECISIONS-MADE, but a less careful agent would have created the duplicate.

**Finding:** When briefing a sub-agent to add content to a *structured, append-once* section of a doc (CHANGELOG `### Added/Changed/Fixed`, a named `##` block, a config stanza), phrase the instruction **idempotently** — "add to the existing `### Fixed` subsection under `[Unreleased]` if present, else create it (Keep-a-Changelog order)" — rather than a positional "add X before Y". Positional instructions assume a structure that may already differ, and verbatim compliance can yield duplicate headers or misordered sections. Pairs with the implementer-self-review-is-not-review-of-record rule (CS48): the orchestrator's own diff review confirmed the deviation was correct.

**Evidence:** CS73 content PR #319; sub-agent `cs73-impl` DECISIONS-MADE noted the collision and deviated correctly; `CHANGELOG.md [Unreleased]` already had a `### Fixed` subsection when the dispatch said to create one before `### Documentation`.

**Disposition:** Open. Candidate at a future harvest: add a one-line "idempotent section-add" note to `OPERATIONS.md § Sub-agent dispatch` (briefing structure).

**Disposition update (2026-07-02, omni-ah-c2, weekly harvest):** **Deferred** (`deferred_until: 2026-09-01`). A small doctrine note not yet homed to a CS; apply as a one-line `OPERATIONS.md § Sub-agent dispatch` addition at the next harvest or fold into a future dispatch-doc edit.

---

### LRN-165

```yaml
id: LRN-165
date: 2026-06-10
category: architectural
source_cs: CS70
status: applied
tags: [cross-repo, phantom-artifact, doctrine, target-verification, pre-flight]
claim_area: orchestrator
```

**Problem:** A cross-repo issue (`sub-invaders#91`) was filed whose deliverable was "update `sub-invaders-bootstrap-summary.md` in the consumer repo" — but that file never existed in the consumer repo. It was harness-internal close-out evidence authored in agent-harness (`e2b233a`) and dropped during the CS16 close-out (see LRN-164). The cross-repo handoff fired against a phantom artifact and perpetuated a false "canonical copy lives in the consumer repo" premise that propagated into done_cs16 / done_cs27 narrative.

**Finding:** Before filing a cross-repo issue whose deliverable is "update file X in consumer repo Y", the orchestrator MUST verify that file X actually exists in Y OR that a harness contract (init/sync/scaffold) produces it. If neither holds, the work belongs in a harness-side CS, not a cross-repo issue. CS70 added this target-existence pre-flight as normative doctrine to `OPERATIONS.md § Cross-repo procedures` (C70-7, + composed mirror) and restored the summary as harness-internal evidence with an Archive-note banner (C70-1) that explicitly states it is not a consumer artifact and that cross-repo issues must not be filed against it.

**Evidence:** agent-harness#290; `sub-invaders#91`; the obsolete "canonical copy lives in the `henrik-me/sub-invaders` consumer repo" claims in `done_cs16_bootstrap-sub-invaders.md` (L623) and `done_cs27_lint-detector-tightening.md` (now superseded by CS70 parentheticals); CS16 close-out `40e464c`.

**Disposition:** Applied (CS70). Cross-references LRN-164 (directory-form close-out file-loss, the upstream cause), `sub-invaders#91`, and CS16 close-out `40e464c`.

---

### LRN-158

```yaml
id: LRN-158
date: 2026-06-09
category: process
source_cs: CS70
status: applied
tags: [release-cuts, release-management, planning, audit-before-build, lrn-101-extension]
claim_area: orchestrator
```

**Problem:** CS70 was filed as a two-phase release CS on the premise that
`v0.7.0` had been bumped in `package.json` + CHANGELOG (at CS54's close-out,
commit `53e1a09`, 2026-06-03) but never tagged or shipped as a GitHub
Release. The plan went through three rounds of GPT-5.5 plan review
(R1 Needs-Fix → R2 Needs-Fix → R3 Go, hash `7ab92e2eb150`) and was
filed as PR #275 — all without the planner ever running
`gh release list` or `gh api repos/<owner>/<repo>/releases --jq '.[]'`
to verify the premise. Execution discovered the tag + a published
Release had existed at `53e1a09` since the same day CS54 closed
(auto-created by `release.yml` LRN-121); the only Phase 1 action
actually needed was deleting a stale duplicate Draft sibling.

**Finding:** Release-cut and release-backfill CSs need an
**audit-before-build precondition** as part of the planning skeleton.
LRN-101 already established this for *content* validation
(`git log v<prev>..main` to confirm the `[Unreleased]` section
matches what shipped). The same discipline applies to *release-state*
validation: before declaring a phase that mutates tag/release state,
verify the current state of both published AND draft releases.

**Evidence:**
- CS70 plan filed 2026-06-09 ~17:15Z (PR #275) on the unverified
  premise; the actual `v0.7.0` Release was published 2026-06-03 at
  21:39:48Z (created at 21:39:18Z), 6 days before CS70's plan filing.
- `gh api repos/henrik-me/agent-harness/releases --jq '.[] | select(.tag_name=="v0.7.0")'`
  returned both the published Release **and** a sibling stale Draft
  (release id `334015036`, created 21:39:18Z) — two artifacts from
  the same `release.yml` LRN-121 run.
- CS70 plan went through 3 GPT-5.5 plan-review rounds (R1/R2/R3 all
  attested at hash `7ab92e2eb150`) without anyone checking the
  release state.
- Recovery cost: 1 round-trip (claim PR #277 merged + content PR #278
  prep + R2 README pin sweep finding) before the discovery surfaced
  during Phase 1 ruleset inspection; the audit itself is ~10 seconds.

**Disposition:** Partially applied — CS58 (2026-06-09) shipped the plan-side ask (REVIEWS.md § 2.6c F6); the content (CS59) and tooling (CS67) asks below remain pending and fold into those CSs. Concrete asks for the pending CSs:

1. CS59 should document the audit-before-build precondition as a
   numbered step in OPERATIONS § Release process, with the three
   verification commands inline: `gh release list --repo <owner>/<repo> --limit N`,
   `git ls-remote origin refs/tags/<tag>`, and
   `gh api repos/<owner>/<repo>/releases --jq '.[] | select(.tag_name=="<tag>")'`
   (both published+draft).
2. CS67's `harness release` verb should refuse to proceed when the
   target tag already exists (published or draft) without an
   explicit `--reconcile` flag, surfacing the conflicting
   release id(s).
3. CS70's planning skeleton (OPERATIONS § Filing a clickstop) should
   mention the audit for any CS whose deliverables touch tag/release
   state — recommended pattern: copy the verification output into the
   plan's Constraints section so plan reviewers can validate the
   premise.

**Applied (CS58, 2026-06-09):** The plan-side ask is shipped. CS58
extended REVIEWS.md with **§ 2.6c Plan-review scope — fact-claim
verification (LRN-139 / LRN-158)**, whose **F6** check explicitly requires
the plan-review reviewer to verify every state-of-the-world claim
(release/tag/PR/issue/label state, branch protection, ruleset config) via
a non-mutating CLI probe at plan-review time and to record the probe in
the plan's Background or Constraints so subsequent reviewers can audit
the same premise. CS70 is cited in § 2.6c's empirical-motivation section.
OPERATIONS.md § Plan review attestation procedure (CS35b) gained a
"Required verifications" subsection cross-referencing § 2.6c, and the
canonical reviewer preamble (`## Reviewer dispatch — canonical preamble`)
now enumerates F1–F6 inline so every plan-review dispatch that copies
the preamble verbatim carries the state-of-the-world clause. The
content (CS59) and tooling (CS67) asks above remain open in their
respective CSs; CS58's shipped doctrine does not preempt them.

**Implications:** This is the same class of finding as LRN-101's
release-cuts content audit but extends to release-*state*. Without
this disposition, the next release-backfill CS will repeat the same
plan-then-discover round-trip.

---

### LRN-162

```yaml
id: LRN-162
date: 2026-06-10
category: anti-pattern
source_cs: CS64
status: deferred
deferred_until: 2026-09-01
tags: [fs, error-handling, existsSync, ENOENT, idempotency, lib]
claim_area: harness-cli
```

**Problem:** `fs.existsSync()` returns `false` not only when a path does
not exist (`ENOENT`) but also on **access errors** the caller cannot
distinguish from absence — `EACCES`, `EPERM`, etc. (`EISDIR` is a
*read*-side error from `readFileSync` against a directory path, not
something `existsSync` masks; `existsSync` returns `true` for both
files and directories.) Gating a subsequent `readFileSync` /
`readdirSync` behind `existsSync` silently reclassifies
unreadable-but-present files as "missing", and idempotency contracts
that rely on the missing-vs-present distinction (e.g. `harness claim`'s
"WORKBOARD has no Active Work row → safe to claim" branch) misfire by
*masking* I/O errors that should surface and fail closed. The same
read-then-discriminate-ENOENT pattern *also* correctly converts the
adjacent "path exists as wrong type" failure (`EISDIR` from
`readFileSync` against a directory path) into a hard error rather
than the same false-missing classification existsSync produces, even
though that case isn't strictly an existsSync-masking bug.

**Finding:** Never `existsSync(path) → readFileSync(path)` (or
`readdirSync`). Attempt the read directly and discriminate in `catch`:
```js
let data;
try { data = readFileSync(p, 'utf8'); }
catch (e) {
  if (e && e.code === 'ENOENT') return { missing: true };
  throw e;          // EACCES, EPERM, EISDIR, ... propagate
}
```
Same shape for `readdirSync`:
```js
function readdirSafe(p) {
  try { return readdirSync(p); }
  catch (e) {
    if (e && e.code === 'ENOENT') return [];
    throw e;
  }
}
```
Caller's outer `try/catch` then converts any non-ENOENT error to a
hard `cannot read <path>: <msg>` error rather than a false "missing"
signal. CS64's post-r2 idempotency rewrites of `runClaimFromDisk` /
`runCloseoutFromDisk` / `activeWorkRowExists` adopted this pattern at
all four sites.

**Evidence:** PR #299 (CS64 post-r2 idempotency fixes, 2026-06-10,
squash merge `86edd44`).
- Copilot R8 inline finding @ `ea15fd1`: "fs.existsSync() returns false
  on access errors (including permission errors), so an unreadable
  WORKBOARD can be misclassified as missingFile:true" — flagged at the
  two `existsSync(WORKBOARD.md) → readFileSync` sites in
  `lib/closeout.mjs:activeWorkRowExists` and
  `lib/claim.mjs:runClaimFromDisk`. Fixed in `ecdea10` by replacing
  with direct `readFileSync` + ENOENT discriminator.
- Copilot R9 inline finding @ `ecdea10`: same antipattern on
  `readdirSafe` (`existsSync(dir) → readdirSync(dir)`) at both sites
  (`lib/claim.mjs` and `lib/closeout.mjs`). Fixed in `4fec8a6` by
  rewriting `readdirSafe` to `try { readdirSync } catch (e) { if
  e.code==='ENOENT' return []; throw e; }`; re-thrown errors caught
  by the outer `find*` try/catch as `cannot read <dir>: <msg>`.
- Round-2 regression tests use `mkdirSync(path.join(root, 'WORKBOARD.md'))`
  to make the path exist as a directory, then `readFileSync` throws
  `EISDIR` — cross-platform deterministic and preserved through the
  ENOENT discriminator switch (EISDIR ≠ ENOENT).

**Disposition:** Open — candidate work: write a `scripts/checks/check-existsSync-antipattern.mjs`
linter that flags `existsSync(p) ... readFileSync(p) | readdirSync(p)`
within the same function in `lib/**/*.mjs` and `scripts/**/*.mjs`,
since the pattern is silently wrong in exactly the cases idempotency
contracts care about. Already-adopted form in CS64 lib/claim.mjs /
lib/closeout.mjs is the canonical reference. claim_area: harness-cli.

**Disposition update (2026-07-02, omni-ah-c2, weekly harvest):** **Deferred** (`deferred_until: 2026-09-01`) per @henrik-me's harvest decision. The `check-existsSync-antipattern.mjs` linter is CS-ready (CS64 `lib/claim.mjs`/`lib/closeout.mjs` is the canonical adopted form) but lower-priority than the copilot-engage reliability work filed this harvest; promote to a CS at the next harvest.

---

### LRN-163

```yaml
id: LRN-163
date: 2026-06-10
category: process
source_cs: CS64
status: deferred
deferred_until: 2026-09-01
tags: [reviews, dual-reviewer, gpt-5.5, claude-sonnet, copilot, convergence, idempotency]
claim_area: orchestrator
```

**Problem:** On content PRs that mutate harness mechanics with
idempotency / error-classification contracts (e.g. CS64 PR #289 and the
post-merge PVI fix PR #299), single-reviewer review-of-record loops
miss substantive issues that a different model catches. Each reviewer
model has a distinct blind spot: `gpt-5.5` rubber-duck reliably catches
contract/JSDoc/typedef drift and plan-vs-implementation mismatches but
under-weights fs/IO error semantics; `claude-sonnet` Copilot reliably
catches IO/error-classification antipatterns and regex-metachar bugs
in tests but under-weights typedef/contract drift; either reviewer
alone declared "no further findings" at a HEAD where the other still
had substantive blockers.

**Finding:** For content PRs touching harness mechanics with
idempotency / error-classification surfaces, alternate `gpt-5.5`
rubber-duck rounds with `claude-sonnet` Copilot rounds and budget
**4–10 cycles** of each before expecting both to converge. Don't
shortcut to "Copilot found nothing once → merge" — frequently the
previous rubber-duck round was the one that caught what Copilot
missed. The orchestrator's heuristic is: re-engage the *other* model
after every push, and only declare review-of-record complete when
**both** independently return no-new-findings at the **same** HEAD.

**Evidence:** PR #299 (CS64 post-r2, 2026-06-10, squash `86edd44`)
spanned 11 gpt-5.5 rubber-duck rounds + 10 claude-sonnet Copilot
rounds before convergence. Each model genuinely caught issues the
other missed:
- Copilot R1 caught schema-invalid CS64-T1 row form that gpt-5.5 R2
  had explicitly recommended.
- gpt-5.5 R8 caught a `runClaimFromDisk` JSDoc referencing
  `ActiveListing` that did not yet exist as a `@typedef` in
  `lib/claim.mjs` — Copilot had passed the same diff cleanly.
- Copilot R8 caught the `existsSync`-masks-permission-errors
  antipattern (see LRN-162) at two WORKBOARD-read sites; no
  rubber-duck round across R1-R10 had flagged it.
- Copilot R9 caught the same antipattern at `readdirSafe`, after
  rubber-duck R10 had flagged it as a learning candidate but
  declared the PR Go anyway.
- Convergence finally landed at R11 (gpt-5.5 Go) + R10 (Copilot
  No-Findings) at the same HEAD `4fec8a6`.

**Disposition:** Open — candidate work: codify the
"alternate-reviewer convergence" expectation in
`REVIEWS.md § Review-of-record` for content PRs in `lib/`,
specifically that "no-new-findings" from one model does not
substitute for re-engaging the other; possibly thread the
`harness review` orchestration to auto-alternate based on prior-round
reviewer-model field. claim_area: orchestrator.

**Disposition update (2026-07-02, omni-ah-c2, weekly harvest):** **Deferred** (`deferred_until: 2026-09-01`). Alternate-reviewer-convergence doctrine not yet homed to a CS; apply as a `REVIEWS.md § Review-of-record` note at the next harvest.

---

### LRN-160

```yaml
id: LRN-160
date: 2026-06-10
category: tooling
source_cs: CS69
status: applied
tags: [gh-cli, copilot-engage, reviewer-bot, idempotency, silent-no-op]
claim_area: harness-cli
```

**Problem:** `gh pr edit <pr> --add-reviewer copilot-pull-request-reviewer` can silently no-op: the command returns the PR URL and exit 0, but `gh api repos/<o>/<r>/pulls/<n> --jq .requested_reviewers` shows `[]`. The Copilot review pipeline then never triggers, and CI's A16 gate (Copilot review attached) keeps failing even though the orchestrator believes the reviewer was added.

**Finding:** After `gh pr edit --add-reviewer copilot-pull-request-reviewer` returns success, ALWAYS verify the result via `gh api repos/<o>/<r>/pulls/<n> --jq .requested_reviewers[].login`. If the list is empty, re-add (a second attempt usually sticks). The race appears related to the GraphQL backend's `requestReviews` idempotency: a recently-completed Copilot review on a stale HEAD seems to make the next add a no-op even when the new HEAD genuinely needs a fresh review. Empirically observed twice in this CS (PR #295): once after the first add returned `requested_reviewers: []` silently, again after a 401-flake retry. Re-adding always works on the second attempt.

**Evidence:** PR #295 (CS69, 2026-06-10, clone `agent-harness_copilot2`, `omni-ah-c2`). First `gh pr edit 295 --add-reviewer copilot-pull-request-reviewer` returned `https://github.com/henrik-me/agent-harness/pull/295` with exit 0; `gh api ... --jq .requested_reviewers` returned `[]`. Re-adding succeeded and Copilot reviewed within ~5 min. Pattern reproduced on the second engage cycle for HEAD `789fc4e` after the typo fix. Tangentially related: `harness copilot-engage 295` failed with GraphQL 401 inside the embedded `gh api graphql` call, so the workaround path (`gh pr edit --add-reviewer`) is the routinely-needed escape hatch.

**Disposition:** Open — candidate work: harden `harness copilot-engage` to (a) detect and recover from GraphQL-401 by retry-with-backoff, (b) post-add verify `requested_reviewers` and re-add on silent no-op, (c) optionally hide the underlying `gh` flakiness by polling for the actual Copilot review submission rather than just trusting the add. claim_area: harness-cli.

**Disposition update (2026-07-02, omni-ah-c2, weekly harvest):** **Filed as planned CS92** (`project/clickstops/planned/planned_cs92_copilot-engage-reliability-hardening.md`, decision **C92-2**: post-add `requested_reviewers` verify + one bounded re-add + `reviewer-not-requested` fast-fail). Status stays `open`; flip to `applied` at CS92 close-out with the merge SHA.

**Applied (2026-07-03, omni-ah-c2, CS92 close-out):** Shipped in CS92 (merge `45e4e9b`, PR #405). `engageCopilot` now reads back `requested_reviewers` after the add and, on a silent no-op, re-adds exactly once then re-verifies — a still-absent reviewer fails fast as typed `reviewer-not-requested` (exit 6) instead of a slow poll timeout, and an unreadable list surfaces as `reviewer-verify-unavailable` rather than a silent pass.

---

### LRN-161

```yaml
id: LRN-161
date: 2026-06-10
category: process
source_cs: CS69
status: applied
tags: [gh-cli, graphql, 401-flake, retry-with-backoff, ci-stability]
claim_area: orchestrator
```

**Problem:** Throughout this CS, `gh api graphql` and any `gh` command that internally uses GraphQL (`gh pr edit --add-reviewer`, `gh pr create` in some modes) randomly returned HTTP 401 with body `{"message":"Requires authentication","documentation_url":"https://docs.github.com/rest","status":"401"}` even though `gh auth status` reported a valid token, no `GH_TOKEN`/`GITHUB_TOKEN` env was overriding, and the next identical command 2-3 seconds later succeeded. The same 401 also affected CI workflow gates (`check-copilot-review-attached`, `check-review-threads-resolved`, gitleaks installer) that call GraphQL with the workflow-injected `GITHUB_TOKEN`. The flake rate during this CS was roughly 30% on graphql-bearing calls.

**Finding:** Treat any GraphQL 401 from `gh` or harness CI gates as a transient and retry up to 5 times with 3-second backoff before declaring failure. **Always retry the verification too** (e.g. `gh api repos/.../pulls/<n> --jq ...` after `gh pr edit`), since the flake doesn't respect operation type. For CI gates, `gh run rerun <id> --failed` is the right escalation; multiple reruns of the same job were needed for `review-threads-resolved` and `copilot-review-attached` in this CS, but each eventually passed without code change. The `gh pr create` GraphQL 401 has a clean REST workaround: `gh api repos/<o>/<r>/pulls --method POST --input -` with `{title, head, base, body}` JSON.

**Evidence:** PR #294 (CS69 claim) and PR #295 (CS69 content), 2026-06-10, clone `agent-harness_copilot2`. CI runs 27288770319, 27288873263, 27289137451 each hit 401 in at least one job and recovered after rerun. Local: `gh pr edit 295 --add-reviewer copilot-pull-request-reviewer` returned 401 on attempts 1 and 4 but succeeded on 2/3/5. `gh api graphql -f query=...` for `resolveReviewThread` hit 401 on first attempt of each thread, succeeded on second. No correlation observed with rate limits (well below 5000/h ceiling), token expiry, or specific endpoints — purely random across the GitHub GraphQL gateway. Useful pattern: wrap `gh api graphql` in a PowerShell `while($attempts -lt 5 -and -not $ok) { ... ; if ($out -match '^non-200|^HTTP') { Start-Sleep 3; continue } }` loop.

**Disposition:** Open — candidate work: add a retry-with-backoff wrapper to harness CLI commands that internally call `gh api graphql` (especially `harness copilot-engage`, `harness review`); document the pattern in OPERATIONS.md § "When gh GraphQL 401-flakes"; consider an exponential-backoff helper in `lib/` for CI gate scripts to absorb the same flake server-side rather than relying on operators noticing and reissuing `gh run rerun --failed`. claim_area: orchestrator.

**Disposition update (2026-07-02, omni-ah-c2, weekly harvest):** **Filed as planned CS92** (`project/clickstops/planned/planned_cs92_copilot-engage-reliability-hardening.md`, decision **C92-1**: shared `withRetry` + `isTransientGhError` bounded backoff around the `gh` seam calls, retrying only positively-transient errors). Status stays `open`; flip to `applied` at CS92 close-out with the merge SHA.

**Applied (2026-07-03, omni-ah-c2, CS92 close-out):** Shipped in CS92 (merge `45e4e9b`, PR #405). `lib/github-graphql.mjs` enriches `GraphQLError` (httpStatus/exitCode/stderr/transport) + exports `isTransientGhError`; `lib/copilot-engage.mjs` wraps every `gh` seam call (PR resolve, identity, reviewer add + re-add, requested-reviewers read, in-place poll read) in a `withRetry` (default 5 attempts, ~3s linear backoff) that retries ONLY positively-transient 401/≥500/transport errors and fails fast on `auth-missing`/permission-scope. The CI-gate `gh run rerun --failed` half remains an operator escalation (server-side gate hardening was out of CS92 scope).

---

### LRN-159

```yaml
id: LRN-159
date: 2026-06-09
category: tooling
source_cs: CS70
status: obsolete
tags: [release-management, release-yml, lrn-121-followup, draft-cleanup, gh-cli]
claim_area: workflows
```

**Problem:** `release.yml` (LRN-121) creates a draft GitHub Release on
every tag push. When manual reconciliation races with the auto-draft
(e.g. orchestrator publishes the release via `gh release create`
before noticing the draft, or the workflow run lands after a manual
publish), the result is **two release records for the same tag** —
the manually-published one (as Latest) and a stale `untagged-...`
Draft. The stale draft is not visible in the public release page
but appears in `gh release list` and `gh api repos/.../releases`,
causing confusion in audits and inflating the release count.

**Finding:** Every release-publish playbook must idempotently
**delete** any `tag_name==<version> && draft==true` sibling
release after the publish step lands, using `gh api -X DELETE
repos/<owner>/<repo>/releases/<release-id>`. This is independent of
LRN-121's draft-vs-published reconciliation (which only handles the
case where the auto-draft IS the one to promote); the cleanup step
handles the leftover sibling.

**Evidence:**
- CS70 Phase 1 discovered a stale Draft (release id `334015036`)
  alongside the published `v0.7.0` Release (release id different,
  published 2026-06-03T21:39:48Z) — both created within 30 seconds
  of each other on 2026-06-03 via the same CS54 PR #227 tag-push
  event. The Draft had never been cleaned up and survived for 6 days.
- CS70 Phase 2: same pattern observed on `v0.8.0` — the
  `release.yml` run after the `v0.8.0` tag push (run id
  `27225057`-era, ran 2026-06-09 17:55:57Z) produced auto-draft
  release id `336781228`. Phase 2 reconciled by PATCHing that draft
  in-place to published (so no orphan sibling for v0.8.0 this time)
  — but the manual workflow is fragile and depends on noticing the
  draft within the same session.
- Recovery for the v0.7.0 case:
  `gh api -X DELETE repos/henrik-me/agent-harness/releases/334015036`
  — idempotent, ~1s.

**Disposition:** Pending. Three potential homes:

1. **CS59** (release-process docs) should document the cleanup step
   as the final action in OPERATIONS § Release process, after
   "publish the release", with the explicit `gh api -X DELETE`
   pattern.
2. **CS67** (`harness release` verb) should automate the cleanup
   in its publish path: after the release is published, scan for
   any `tag_name==<version> && draft==true && id != <published-id>`
   sibling and delete it (idempotent; safe re-run).
3. **Tactical:** `release.yml` itself could be amended to mark the
   draft with a unique label (e.g. release annotation) the cleanup
   script can target, but that's a workflow change and probably not
   worth it if CS67 lands first.

Additionally, the `release.yml` awk-extractor regression that
truncated the v0.8.0 auto-draft body to just the section header
(`## [0.8.0] — 2026-06-09`, 30 chars) is **separately confirmed**
during CS70 and should be diagnosed as part of CS59. The CS70 fix
was a one-off API PATCH; without CS59 the next release-cut will
repeat the same body-empty workaround.

**Implications:** Without this cleanup, every harness release leaves
a stale draft sibling in the repo's release list, accumulating over
time. The audit-before-build doctrine in LRN-158 will surface them
(`gh release list` shows drafts), but each one then requires a
manual cleanup step that should be mechanical.

**Disposition update (2026-06-10, `omni-ah-c2`, planned-CS pointer refresh):** The documentation-side path is **partially landed**: `OPERATIONS.md § State-of-the-world probes` (lines ~2161-2166, landed via CS59 PR #285) already documents the `gh api -X DELETE repos/<owner>/<repo>/releases/<draft-release-id>` step — but **as a pre-cut cleanup** (delete stale drafts before the next cut starts), not as a post-publish cleanup. This addresses the audit-friction symptom but still allows a stale draft to survive between cuts (the v0.7.0 case in Evidence, 6 days). Planned **CS67** (`harness release` verb) remains the primary home for automating the **post-publish** cleanup in `harness release --publish` (decision C67-1): scan for `tag_name==<version> && draft==true && id != <published-id>` siblings and delete idempotently. Path 3 (`release.yml` annotation) deferred unless CS67 slips. Flip status to `applied` at CS67 close-out.

**Disposition update (2026-07-02, omni-ah-c2, weekly harvest):** **Obsolete — root cause removed.** CS80 **deleted `.github/workflows/release.yml`** ([LRN-176](#lrn-176), applied), so there is no longer an auto-draft-on-tag-push creator to race a manual/verb publish; the `harness release` verb is now the **single** release creator, so no `tag_name==<version> && draft==true` sibling arises. The stale-draft-sibling class this LRN describes is structurally moot (CONTEXT.md CS84 note); no post-publish cleanup step is required.

---

### LRN-157

```yaml
id: LRN-157
date: 2026-06-08
category: architectural
source_cs: CS63c
status: applied
tags: [resource-cleanup, injectable-seam, provenance, temp-dir, code-review, git-injection]
claim_area: cli
```

**Problem:** CS63c's `harness upgrade` fetches the target harness ref into a
temp `git clone` via an injectable seam, then runs a dry-run sync against it.
The first cleanup attempt had `planUpgrade()` delete the fetched dir only if its
path string started with `os.tmpdir()/harness-upgrade-` — a **path-prefix
guess**. GitHub Copilot's review showed this is **not provenance-safe**: an
injected/caller-owned fetcher returning a path under that prefix (e.g. a test
fixture) would be deleted. The original code also leaked the temp clone on the
success path and on clone/checkout failure, and reported an empty error message
when `spawnSync` failed before exec (git missing → `status: null`).

**Finding:** **An injectable side-effecting seam should OWN the lifetime of what
it creates — return a disposer (`{path, cleanup}`), not a bare path the caller
deletes by guessing.** The consumer invokes only the seam-provided `cleanup()`
(best-effort, in a `finally`, errors swallowed so they can't mask the primary
result), and never deletes by path-string inference — so a caller-owned fixture
is never removed. Failure paths must clean up their own temp dirs before
rethrowing, and error detail must fall back `stderr.trim() →
spawnSync().error?.message → status` so a pre-exec spawn failure is not an empty
message. Separately: validate refs to **reject a leading dash** before passing
to `git checkout` (a `--` separator is unusable for `git checkout <tree-ish>` —
it reassigns the ref as a pathspec), closing a git-option-injection vector.

**Evidence:** CS63c PR #270 — `lib/upgrade.mjs` (`defaultFetchHarnessAtRef`
returns `{path, cleanup}`; `planUpgrade` finally invokes only `cleanup()`;
`REF_ALLOWLIST` requires a leading alphanumeric). GitHub Copilot caught the
non-provenance-safe guard, the leaks, and the leading-dash ref; gpt-5.5 R4/R5/R7
confirmed the redesign. Tests: cleanup-called, cleanup-on-sync-throw,
string-path-never-deleted (provenance), and leading-dash-ref rejected.

**Disposition:** Open — a reusable design rule for future injectable resource
seams (fetchers, temp workspaces, clones). Candidate to fold into a
CONVENTIONS/REVIEWS note when CS64 adds more lifecycle verbs that fetch/clone.

**Disposition update (2026-06-10, `omni-ah-c2`, planned-CS pointer refresh):** **🎯 Now scoped to planned CS64b** (`planned_cs64b_verb-reliability-primitives.md`, filed 2026-06-10) — C64b-2 explicitly adopts this LRN's `{path, cleanup}` disposer pattern + `assertSafeRef` leading-dash ref rejection as a shared helper (new `lib/disposers.mjs`) plus an audit retrofitting every `lib/*.mjs` verb that allocates a temp dir / clone (incl. the CS64 verbs once that PR lands). Flip status to `applied` at CS64b close-out with the merge SHA in this Disposition. Active CS64 is intentionally *not* expanded to cover this — CS64b is the dedicated post-CS64 hardening home.

**Disposition update (2026-06-24, `omni-ah`, CS64b close-out):** **Applied** in PR #310 (squash-merge SHA **`f27c21462b5d23cac386066600c5585adb758fe3`**, 2026-06-24T04:44:26Z). C64b-2 shipped `lib/disposers.mjs` (`makeTempDir`/`withTempDir` provenance-safe `{path, cleanup}` disposers + `assertSafeRef` leading-dash/argv-injection ref guard); `lib/upgrade.mjs` was retrofitted onto the shared helpers; `tests/cs64b-disposer-pattern.test.mjs` guards against raw `mkdtempSync` in `lib/`; and OPERATIONS.md documents the disposer reviewer convention. Status flipped open → applied in this close-out.

### LRN-156

```yaml
id: LRN-156
date: 2026-06-07
category: process
source_cs: CS63b
status: deferred
deferred_until: 2026-09-01
tags: [git, rename-detection, diff, guards, false-negative]
claim_area: linters
```

**Problem:** `git diff --name-only <base> <head>` (and `gh pr diff --name-only`) silently **collapses a rename to the destination path only** when git's default rename detection is on. Two CS63 guards keyed off rename SOURCES and were therefore non-functional until review caught them: (a) CS63a's `workboard-only` bypass allowlist missed a file renamed *into* an allowlisted path (it only saw the new name); (b) CS63b's close-out-freshness gate detects an `active_csNN → done_csNN` close-out by finding the same CS id in BOTH an `active_` and a `done_` path, but `--name-only` reported only the `done_` destination, so the gate never fired — verified false-negative against the real CS63a close-out commit.

**Finding:** **When a gate needs a rename's SOURCE path, plain `--name-only` is a silent false-negative.** Use `git diff --name-only --no-renames` (rename surfaces as delete(old)+add(new) — both paths), `git diff --name-status -M` (explicit `R old new`), or the GitHub files API `previous_filename` (as `workboard-auto-approve.yml` already does). Treat a bare `--name-only` as a review red flag whenever rename sources matter, and cover it with a test that performs a REAL `git mv` (not just a synthetic file list, which bypasses the diff path).

**Evidence:** CS63a PR #264 (bypass guard fixed with the files API + `previous_filename`); CS63b PR #267 (close-out gate fixed with `--no-renames`; +2 real-`git mv` integration regression tests). `workboard-auto-approve.yml` already used `git diff --name-status -M` for the same reason. Both were caught by GitHub Copilot review / the PVI gate, not by the original implementation's tests.

**Disposition:** Open — candidate for a mechanical guard (e.g. a linter that flags `--name-only` in diff-based gate scripts where rename sources matter), or fold into CS58's fact-claim/scope-verification scope. The two in-tree gates are already fixed.

**Disposition update (2026-06-10, `omni-ah-c2`, planned-CS pointer refresh):** **CS58 closed** (PR #281) without absorbing this; in-tree gates remain fixed (no new instances surfaced since). Three remaining options: (a) tiny new linter CS that flags bare `--name-only` in `scripts/check-*.mjs` and `.github/workflows/*.yml` where rename sources matter — likely low ROI without a fresh recurrence; (b) include the check in planned **CS66** (`review-doc`/`review-cs` verbs) as a checklist item for diff-consuming scripts; (c) bullet in CONVENTIONS during planned **CS65** (process-doc right-sizing). No new CS recommended yet; revisit if a third instance appears.

**Disposition update (2026-07-02, omni-ah-c2, weekly harvest):** **Deferred** (`deferred_until: 2026-09-01`). In-tree gates remain fixed and no third instance has surfaced; a dedicated bare-`--name-only` linter is low-ROI without a fresh recurrence. Revisit at the next harvest or when a new rename-source-dependent diff gate appears.

### LRN-155

```yaml
id: LRN-155
date: 2026-06-07
category: architectural
source_cs: CS63a
status: applied
tags: [sync, managed-files, consumer-delivery, plan-fact-claim, guided-update]
claim_area: sync-engine
```

**Problem:** CS63a's plan (C63a-2 / CS63 C63-2) stated existing consumers receive the new managed `harness-pr-check.yml` gate "on next `harness sync`". This is false: `harness sync` (`lib/sync.mjs`) builds its work list **solely** from the files already listed in the consumer's `harness.config.json` `managed`/`composed`/`seeded` arrays — there is no reconciliation that adds NEW harness-shipped managed files — and `cmdInit` installs the gate only on fresh init (`if (!configExists)`, `bin/harness.mjs`). A newly-added managed file therefore reaches existing consumers only via fresh `init` or a manual `managed.files` addition, never via `sync`.

**Finding:** **The harness has no mechanism to deliver a newly-introduced managed file to existing consumers on `sync`.** Any plan that ships a new managed file and claims consumers "get it on next sync" is making a false claim (GitHub Copilot caught this in the CS63a content review). The accurate adoption path today is manual (copy the template file + add it to `managed.files`). Closing the gap — a `sync`-time managed-manifest reconciliation, or a guided `harness upgrade` that proposes new managed files — is the natural home of CS63c (guided update) / CS64 (lifecycle commands). Until then, schema/doc claims must say "fresh-init default-on + manual adoption", not "on next sync".

**Evidence:** CS63a, 2026-06-07. `lib/sync.mjs` (allFiles built from `config.managed?.files`/`composed`/`seeded` only); `bin/harness.mjs` `cmdInit` gate-install guarded by `!configExists`; GitHub Copilot review on PR #264 flagged the inaccurate "re-running `harness init`" / "on next sync" adoption claims (corrected in the merged schema description + `OPERATIONS.md`). Orchestrator escalated the auto-delivery decision to the user at close-out.

**Disposition:** Open — folds into CS63c (guided update) / CS64 (lifecycle commands). Add a sync-time new-managed-file reconciliation (or guided-upgrade proposal), then update the `pr_check` schema/doc adoption note.

**Disposition update (2026-06-10, `omni-ah-c2`, planned-CS pointer refresh):** **🎯 Now scoped to planned CS64b** (`planned_cs64b_verb-reliability-primitives.md`, filed 2026-06-10) — C64b-3 adopts this LRN as the sync-time new-managed-file reconciliation: extend `harness sync --mode=check` (and the default sync path) to surface every file present in `template/managed/` but absent from the consumer's tree; `--apply-new` adopts with per-file confirmation. The `pr_check` schema/doc adoption note is updated as part of that deliverable. Flip status to `applied` at CS64b close-out with the merge SHA in this Disposition. Active CS64 is intentionally *not* expanded to cover this.

**Disposition update (2026-06-24, `omni-ah`, CS64b close-out):** **Applied** in PR #310 (squash-merge SHA **`f27c21462b5d23cac386066600c5585adb758fe3`**, 2026-06-24T04:44:26Z). C64b-3 shipped the sync-time new-managed-file reconciliation in `lib/sync.mjs`: `harness sync` (check + default paths) surfaces every `template/managed/` file **absent from the consumer's `managed.files`** (membership, not disk presence; sentinels excluded; respects `config.excluded`) as a report-only advisory; `--apply-new` adopts them non-interactively in apply mode; the `pr_check` schema/doc note was updated. (Implementation refined the plan from disk-presence/per-file-confirmation to membership/adopt-all.) Status flipped open → applied in this close-out.

### LRN-154

```yaml
id: LRN-154
date: 2026-06-06
category: tooling
source_cs: CS61b
status: applied
tags: [learnings, check-learnings, header, frontmatter, linter-gap, counting, broken-anchor]
claim_area: harness-cli
```

**Problem:** `LEARNINGS.md` entry **LRN-106** shipped with valid YAML frontmatter (`id: LRN-106`, `status: applied`) but **no `### LRN-106` H3 header** — the only entry missing one. `scripts/check-learnings.mjs` passed it with 0 errors: the linter validates frontmatter against `schemas/learning.schema.json` but never asserts that each entry has a `### LRN-<id>` markdown header matching its frontmatter `id`. Two consequences: (a) header-based counts undercount — `^### LRN-` matched one fewer than the authoritative frontmatter count (`^id: LRN-` / `^status:`); (b) a latent broken anchor — any `[LRN-106](LEARNINGS.md#lrn-106)` link (the form `scripts/check-instructions.mjs` resolves) would not reach a heading.

**Finding:** Until the linter enforces it, count learnings by frontmatter (`^id: LRN-` / `^status:`), not by `^### LRN-` headers. `check-learnings.mjs` should gain a rule: every frontmatter `id: LRN-<n>` must be immediately preceded by a matching `### LRN-<n>` H3 header, so headerless entries (broken anchors + undercounting) fail CI. The LRN-106 header was restored in this change; the linter rule is the remaining open follow-up (small planned CS).

**Evidence:** This session, 2026-06-06, clone `C:\src\agent-harness` (`yoga-ah`). Pre-fix: `^### LRN-\d+` matched one fewer entry than `^id:\s*LRN-`, the gap localised to `id: LRN-106` having no matching header. `node scripts/check-learnings.mjs --file LEARNINGS.md` reported 0 errors both before and after restoring the header, proving the linter does not check header presence. Cross-refs: LRN-153 (why captured here, not in agent memory); `scripts/check-instructions.mjs` (resolves `LEARNINGS.md#lrn-NNN` anchors).

**Disposition:** Open — LRN-106 header restored in this change; the `check-learnings.mjs` header-presence rule remains to be implemented (file a planned CS). claim_area: harness-cli.

**Disposition update (2026-06-10, `omni-ah-c2`, planned-CS pointer refresh):** The planned CS exists: **CS69** (`planned_cs69_check-learnings-header-enforcement.md` — "Enforce `### LRN-NNN` header presence in check-learnings.mjs (apply LRN-154)"). Flip status to `applied` at CS69 close-out.

**Disposition update (2026-06-10, `omni-ah-c2`, CS69 close-out):** **Applied** in PR #295 (squash-merge SHA **`b580260f88cc2a9bf7f0c8911bf6531c46608b30`**, 2026-06-10T16:14:41Z). `scripts/check-learnings.mjs` Check 7 now enforces canonical `### LRN-NNN` H3 headers via strict-adjacency + bare-header regex + exact digit-string id comparison (per Copilot R1 hardening). 6 fixtures + 6 test cases (#18–#23) under `tests/fixtures/cs69/`. Real `LEARNINGS.md` (159 entries) passes with 0 errors. Status flipped open → applied in this close-out.

### LRN-152

```yaml
id: LRN-152
date: 2026-06-07
category: process
source_cs: CS54b
status: open
tags: [plan-review, fact-claim, deliverable-target, orphan-file, shipped-surface, doctrine-gap]
claim_area: review-loops
```

**Problem:** CS54b's plan (C54b-1 / Deliverable 1) named `template/managed/.github/pull_request_template.md` as the PR template to refresh to the strict schema and asserted the harness ships a pre-strict template. Both plan-review rounds (R1/R2, gpt-5.5) passed without catching that this file is a **dead orphan**: the PR template was migrated to a *composed* file at CS38a (#163), so the shipped source is `template/composed/.github/pull_request_template.md` (already strict), and the `template/managed/` copy is unreferenced by `managed.files` / `composed.files` / any code and never ships.

**Finding:** **Plan reviews must verify that a "modify file X" deliverable's target is the ACTUAL shipped/loaded surface, not merely that the path exists.** This is a distinct fact-claim failure mode from LRN-139 (a false-positive line citation): here the cited file *exists* but is the wrong (orphaned) surface, and the plan's premise about what ships was inverted. The check: confirm X is referenced by the relevant manifest (`harness.config.json` `managed.files` / `composed.files`), by code, or by sync — i.e. that editing X actually changes a shipped/consumed artefact. Folds into planned CS58 (extend REVIEWS.md §2.6a F1–F5 to plan reviews): add an F-check that each deliverable target path resolves to a live surface.

**Evidence:** CS54b, 2026-06-07. `done_cs54b_*.md` C54b-1 / Deliverable 1 + `## Plan review` R1/R2 (both Go, gpt-5.5) named the orphan. Discovered pre-implementation: `grep -rn 'managed/.github/pull_request_template' lib scripts bin tests harness.config.json` → 0 hits; `harness.config.json` lists `.github/pull_request_template.md` under `composed.files` (override `_inherited_class:"managed"`), not `managed.files`; git shows the composed migration at CS38a (#163). Resolved in CS54b PR #258 (squash `b4d44d0`) by deleting the orphan + retargeting the test to the composed template (deviation per LRN-143). Related: LRN-139 (plan-side fact-claim gap), planned CS58 (the fix).

**Disposition:** Open — folds into planned CS58. Adds the "deliverable target resolves to a live shipped/loaded surface" check to that scope.

**Disposition update (2026-06-10, `omni-ah-c2`, planned-CS pointer refresh):** **CS58 closed** (PR #281) shipping REVIEWS.md § 2.6c (F1–F6 fact-claim verification on plan reviews) but did not extend the F-checks to "deliverable target resolves to a live shipped/loaded surface". The remaining gap belongs in planned **CS66** (`review-cs` verb checklist; see its C66-3 — local verify-only clickstop-readiness verb). Recommended: surface to the CS66 claimer to add as an F-check item. Flip status to `applied` at CS66 close-out.

**Disposition update (2026-07-02, omni-ah-c2, weekly harvest):** Pointer refresh — **CS66 closed without absorbing this**; the deliverable-target F-check was **re-homed to planned CS75** (`project/clickstops/planned/planned_cs75_check-clickstop-validation-hardening.md`, decisions C75-3/C75-4, which bundle LRN-167 + LRN-152). Status stays `open`; flip to `applied` at **CS75** close-out with the merge SHA.

### LRN-151

```yaml
id: LRN-151
date: 2026-06-06
category: operational
source_cs: CS62
status: applied
tags: [git, crash-recovery, session-resume, remote-tracking-ref, fetch]
claim_area: orchestrator-loop
```

**Problem:** Resuming a session after a mid-operation agent crash, every `git fetch origin` (and `git fetch --prune`) aborted with `fatal: bad object refs/remotes/origin/cs62/close-out` / `error: ... did not send all necessary objects`. This blocked the Session-Start upstream sync, the staleness check, and the close-out rebase. The wording ("bad object", "necessary objects") points at the object database, misleadingly suggesting `git fsck` or a reclone, when the object store was actually intact.

**Finding:** The crash interrupted a remote-tracking **ref write**, leaving the loose ref file `.git/refs/remotes/origin/cs62/close-out` populated with only whitespace/NUL bytes. A single broken ref under `refs/remotes/` makes `git fetch` abort for *every* ref, and `git for-each-ref` flags it as `warning: ignoring broken ref ...`. `git update-ref -d <ref>` cannot clear it (`error: cannot lock ref ...: unable to resolve reference ...: reference broken`). Repair recipe: (1) prove it is local-only corruption — `git ls-remote origin refs/heads/<branch>` returns the expected SHA, so the remote is fine; (2) delete the loose ref file directly (`.git/refs/remotes/origin/<branch>`) and remove any matching line from `.git/packed-refs`; (3) re-run `git fetch origin --prune`, which succeeds and recreates the ref cleanly. No reclone, `fsck`, or object surgery is needed.

**Evidence:** This session (`yoga-ah-c2`, clone `C:\src\agent-harness_copilot2`, 2026-06-06), recovering the interrupted CS62 close-out. `git fetch origin` → `fatal: bad object refs/remotes/origin/cs62/close-out`; `git for-each-ref 'refs/remotes/origin/cs62*'` → `warning: ignoring broken ref ...`; `git update-ref -d refs/remotes/origin/cs62/close-out` → `error: ... reference broken`; the loose ref file held only blank bytes; `git ls-remote origin refs/heads/cs62/close-out` → `2e7973c…` (remote intact). After deleting the loose ref file, `git fetch origin --prune` succeeded (`* [new branch] cs62/close-out`) and immediately surfaced that `origin/main` had advanced `9f26d8d..9637691`.

**Implications carried forward:**
- Candidate promotion home if this recurs: an OPERATIONS.md "session resume / crash recovery" troubleshooting note (none exists today). Left `open` for the next harvest to decide vs. keeping it as a searchable LRN.
- General principle: a `fatal: bad object refs/remotes/...` on fetch after a crash is usually a corrupt *ref file*, not object-DB damage — check `git for-each-ref` for "ignoring broken ref" and confirm the remote with `git ls-remote` before any reclone.

**Disposition:** (2026-06-10, `omni-ah-c2`, planned-CS pointer refresh) **🎯 Now scoped to planned CS64b** (`planned_cs64b_verb-reliability-primitives.md`, filed 2026-06-10) — C64b-1 adopts this LRN as the `harness doctor` probe: a read-only `lib/doctor.mjs` walks `.git/refs/remotes/` for zero-byte / whitespace-only / NUL-only files, cross-checks `git for-each-ref ... ignoring broken ref`, and prints the LRN-151 repair recipe; `--repair` applies the deletion + `fetch` with explicit confirmation. Flip status to `applied` at CS64b close-out with the merge SHA in this Disposition. (Earlier option (b) — OPERATIONS.md "session resume / crash recovery" prose — remains a fallback if CS64b slips, but the verb is now the primary home.)

**Disposition update (2026-06-24, `omni-ah`, CS64b close-out):** **Applied** in PR #310 (squash-merge SHA **`f27c21462b5d23cac386066600c5585adb758fe3`**, 2026-06-24T04:44:26Z). `harness doctor` (`lib/doctor.mjs`, registered in `bin/harness.mjs`) is the read-only LRN-151 broken-loose-ref probe: it walks `.git/refs/remotes/` for zero-byte / whitespace-only / NUL-only ref files, prints the exact repair recipe, and with `--repair` deletes the broken loose refs + matching `packed-refs` lines and re-runs `git fetch origin --prune`. Status flipped open → applied in this close-out.

### LRN-146

```yaml
id: LRN-146
date: 2026-06-05
category: process
source_cs: CS62
status: applied
tags: [bootstrap, fresh-clone, npm-install, node-modules, session-start, test-hermeticity, clone-suffix, whoami, false-red]
claim_area: orchestrator-loop
```

**Problem:** A fresh full clone of the harness (folder `agent-harness_copilot2`, agent-id `yoga-ah-c2`) failed the `INSTRUCTIONS.md` § Session Start "Bootstrap sanity check" with 209 `node --test` failures — every one an `ERR_MODULE_NOT_FOUND` for the dev deps `ajv` / `js-yaml` (imported by `lib/sync.mjs`, `lib/doc-schema.mjs`, and the schema/plan-review linters) — because `node_modules` is gitignored and per-checkout and had never been installed in that clone. The documented orchestrator startup path does not prevent this: `README.md` § "Starting an agent session" (L77-93) tells the agent to "read INSTRUCTIONS.md and follow the Session Start bootstrap sanity check", and that checklist (root `INSTRUCTIONS.md` L75-84, rendered from `template/managed/INSTRUCTIONS.md` § Session Start) runs `node --test`, `harness lint`, and `sync --mode=check` — all dependency-backed — with **no** preceding environment-setup step. The orchestrator onboarding path never references `CONTRIBUTING.md` (L30-31) — the only **human/agent-facing setup** doc that carries the `npm ci` step, in the external-contributor fork→PR workflow — and the INSTRUCTIONS.md Pointers table omits it. (CI workflows such as `harness-self-check.yml` run `npm ci`, but that is not setup guidance surfaced to an agent on the startup path.) Net effect: an agent obeying INSTRUCTIONS from a fresh clone hits a wall of failures and can misdiagnose `main` as broken. Separately, even after the dependencies are installed, two `harness whoami` tests stay red in this clone: `tests/cli.test.mjs:148` and `:168` assert `id.endsWith('-ah')`, but the `run()` helper defaults `cwd: REPO_ROOT` (`:36`) and `whoami` calls `cloneSuffixFromDir(cwd)` (`bin/harness.mjs:3522`), where `cloneSuffixFromDir` applies `path.basename(dirPath)` internally and matches `_copilot(\d+)$` (`:617-619`). Any clone whose folder is not exactly `agent-harness` (here `agent-harness_copilot2` → `yoga-ah-c2`) makes those assertions false — a non-hermetic test coupling to an environment path element.

**Finding:** The orchestrator startup process is not self-contained for a fresh clone, in two independent ways, and both erode the "main is always green" signal the Session Start checklist exists to establish:

1. **Env-setup is undocumented in the startup path.** `node_modules` is gitignored and per-checkout (cf. **LRN-141**, which captured the same fact but applied the fix only to git-worktree sub-agent dispatch — not the orchestrator's own Session Start bootstrap). The Session Start checklist must state a one-time precondition — Node ≥ 20 + `npm ci` (since `package-lock.json` is tracked) — placed before the dependency-backed commands, with an explicit "`ERR_MODULE_NOT_FOUND` ⇒ run `npm ci`; `main` is not broken" triage line. `README.md` § "Starting an agent session" should cross-reference it.

2. **Two tests couple to the checkout path.** A test that asserts on the REPO_ROOT basename is non-hermetic and false-reds in supported multi-clone checkouts — the clone-suffix feature (Decision #20) is exactly what appends `-c<N>`. The two whoami `endsWith('-ah')` assertions must be made hermetic by pinning `--cwd` to a controlled temp dir named `agent-harness` (the pattern already at `tests/cli.test.mjs:1066` via `makeNamedDir('agent-harness')`), not by changing the production `cloneSuffixFromDir` logic, which is correct.

**Evidence:** This session, 2026-06-05, clone `C:\src\agent-harness_copilot2` (`yoga-ah-c2`), `main` @ `7932f9e`. `node --test tests/*.test.mjs` → 564 pass / 209 fail / 1 skip (774 total), all `ERR_MODULE_NOT_FOUND` (`ajv`, `js-yaml`); after `npm install` → 1081 pass / 2 fail / 1 skip (1084 total). The 2 residual failures are `harness whoami` › "prints agent ID ending in -ah…" and "…env var override as machine-short" (`tests/cli.test.mjs:144-149`, `:160-169`), both `assert.ok(id.endsWith('-ah'))` with `id = yoga-ah-c2`. `harness lint --quiet` → 29 passed / 0 failed; `harness sync --mode=check` → No drift. Citations: `run()` cwd default `tests/cli.test.mjs:36`; `cloneSuffixFromDir` `bin/harness.mjs:617-619`; whoami suffix derivation `bin/harness.mjs:3522`; `npm ci` setup step (human/agent-facing) only in `CONTRIBUTING.md:30-31` (CI workflows aside); startup path `README.md:77-93` → `INSTRUCTIONS.md:75-84` (no env-setup step). `package-lock.json` is tracked; `node_modules/` is gitignored. Related: **LRN-141** (per-checkout `node_modules`, applied to sub-agent/worktree dispatch only).

**Disposition:** Applied in CS62 (see Applied below).

**Applied (CS62, 2026-06-06):** Both surfaces shipped and merged to `main` as squash commit `9f26d8d` (PR #251). (1) **Env-setup precondition** — `template/managed/INSTRUCTIONS.md` § Session Start now carries a "First-run environment setup" step (Node ≥ 20 + one-time `npm ci`; `node_modules` is gitignored/per-checkout) with an `ERR_MODULE_NOT_FOUND` ⇒ `npm ci` triage line, placed **before** the bootstrap sanity check; the rendered root `INSTRUCTIONS.md` was regenerated via `harness sync --mode=apply`; `README.md` § "Starting an agent session" cross-references the one-time setup and links `CONTRIBUTING.md`. (2) **Test hermeticity** — the two `harness whoami` assertions in `tests/cli.test.mjs` now pin `--cwd` to an `agent-harness`-named temp dir, so the strict `endsWith('-ah')` check is independent of the checkout folder basename (no regex weakening; production `cloneSuffixFromDir` unchanged per Decision #20). gpt-5.5 review-of-record Go (3 rounds incl. 2 post-rebase re-attests) + plan-vs-implementation GO. CS62.

## Applied

### LRN-153

```yaml
id: LRN-153
date: 2026-06-06
category: process
source_cs: CS61b
status: applied
tags: [knowledge-capture, learnings, agent-memory, multi-clone, multi-machine, portability, repo-docs]
claim_area: orchestrator-loop
```

**Problem:** While doing post-CS61 learnings hygiene in clone `C:\src\agent-harness` (agent `yoga-ah`), the orchestrator tried to persist two harness facts — the layout of `LEARNINGS.md` and a counting/header gotcha (LRN-154) — via the assistant's `store_memory` tool instead of the repo. Agent/assistant "memory" is per-user and per-environment: it is never committed and does not travel to the other machines and repo clones this project is developed from (the WORKBOARD Orchestrators table lists both `yoga-ah` @ `C:\src\agent-harness` and `yoga-ah-c2` @ `C:\src\agent-harness_copilot2`). Knowledge captured only in agent memory is therefore invisible to every other clone, every other machine, and to any agent that restarts from the repo alone — the same non-durability the planning-locality rule (CS35 C35-11) guards against (it permits tactical session notes but keeps durable/strategic content in the repo, not in non-durable session-state files).

**Finding:** **Durable, project-applicable knowledge MUST live in versioned repo docs, never in agent memory.** Learnings → `LEARNINGS.md` (entry schema + harvest per RETROSPECTIVES.md); doctrine/process → `INSTRUCTIONS.md` / `OPERATIONS.md` / `CONVENTIONS.md` / `REVIEWS.md`. The repo is the single portable source of truth across machines and clones; if a fact is worth remembering, it is worth a commit. Agent memory is for ephemeral, session-local scratch only.

**Evidence:** This session, 2026-06-06, clone `C:\src\agent-harness` (`yoga-ah`), `main` @ `5517b20`. User directive: "you should store learnings in the learnings file and there should be a reference to this in instructions, agents will run on multiple different machines, and different clones of the repo" and "put knowledge in the relevant repo docs." Multi-clone coordination is already first-class in the harness (WORKBOARD.md Orchestrators table: `yoga-ah` and `yoga-ah-c2`). Cross-ref: planning-locality doctrine (INSTRUCTIONS.md § Hard rules; CS35 C35-11), which likewise keeps durable/strategic content out of non-durable session-state storage (tactical session notes are allowed).

**Disposition:** Applied — `INSTRUCTIONS.md` § Hard rules gains a **"Knowledge lives in the repo, not agent memory"** rule (rendered from `template/managed/INSTRUCTIONS.md`), citing this learning. Shipped via CS61b PR #256 (squash-merged to `main` as `019ba8c`). status: applied.

### LRN-149

```yaml
id: LRN-149
date: 2026-06-06
category: process
source_cs: CS61
status: applied
tags: [schema-conformance, config-reader, author-self-check, review-rounds, rubber-duck, copilot, efficiency]
claim_area: review-loops
```

**Problem:** CS61's content PR (#250) took ~13 GitHub Copilot review rounds to converge, and roughly half were the *same class* of finding: the new `loadReviewsPolicy` reader silently under-enforced one schema constraint dimension per round — first `reviews.additionalProperties:false` (unknown keys ignored), then empty-string `minLength` (`''` accepted), then whitespace-only values (no `\S` pattern). Each was a legitimate S1/S3 schema-conformance gap, surfaced one-at-a-time by the reviewer rather than caught up front. `REVIEWS.md § 2.6b` (also shipped in CS61) codifies the **reviewer's** schema-conformance check, but nothing instructed the **author** to run the same check on their own reader before opening the PR, so the gaps were discovered serially across rounds instead of in one sweep.

**Finding:** **When authoring (or de-drifting) a config/schema reader, run REVIEWS.md § 2.6b S1–S3 against your own reader BEFORE opening the PR** — enumerate every constraint dimension the schema declares for the subtree you read (`required`, per-field `default`, `type`, `enum`, `pattern`, `uniqueItems`, `additionalProperties`, `minLength`/`maxLength`, numeric bounds) and confirm the reader honours each: default-when-absent for optional-with-default fields, fail-closed on present-but-malformed for every constraint. A single up-front author sweep collapses the per-dimension review-round ping-pong into the first round. This is the author-side complement to the § 2.6b reviewer doctrine.

**Evidence:** CS61 PR #250 (squash-merged to `main` as `7379a6b`), 2026-06-06. Across the PR's review rounds GitHub Copilot surfaced one unhandled schema dimension at a time — `reviews.additionalProperties:false` (unknown keys were silently ignored), then empty-string `minLength` (`''` accepted), then whitespace-only values (no non-whitespace `pattern`) — each fixed in a separate round. The shipped result is verifiable on `main`: `schemas/harness.config.schema.json` `properties.reviews` now has `additionalProperties:false`, and `rubber_duck_model`/`fallback_model`/`copilot_reviewer_slug` carry `minLength:1` + `pattern:"\\S"`; `lib/reviews-policy.mjs` `normalizeReviews` enforces each fail-closed. (The per-round fixes lived on the pre-squash `cs61/content` branch and were squashed into `7379a6b`.) Cross-refs: LRN-145 (the § 2.6b reviewer checklist), LRN-039 (schema-is-source-of-truth), LRN-033 (fail-closed parsers).

**Disposition:** Applied (CS61 follow-up). `REVIEWS.md § 2.6b` (and `template/composed/REVIEWS.md`) gain an **"Author-side self-check (LRN-149)"** paragraph instructing authors to run S1–S3 on their own reader before opening the PR.

### LRN-150

```yaml
id: LRN-150
date: 2026-06-06
category: operational
source_cs: CS61
status: applied
tags: [git-merge, commit-trailer, co-authored-by, commit-trailers-gate, ci, rebase]
claim_area: orchestrator-loop
```

**Problem:** During CS61 (PR #250) `origin/main` advanced mid-flight, so the branch needed a `git merge origin/main`. Resolving the conflict and committing with `git commit --no-edit` produced a merge commit whose message had **no `Co-authored-by: Copilot` trailer** (the default merge message omits it). The full `node --test` suite then went from 1113 pass to 4 failures: the lint-aggregator tests that exercise `check-commit-trailers` against `HEAD` flagged the trailer-less merge commit. Local `harness lint --quiet` had passed moments earlier only because it ran before the merge was committed (HEAD still had a trailer).

**Finding:** **Merge commits need the `Co-authored-by` trailer too** — `git commit --no-edit` (or any default merge message) on a `git merge` omits it, and `check-commit-trailers` (run by `harness lint` and the lint-aggregator tests against `HEAD`) treats the merge commit like any other. Fix: `git commit --amend` to add the trailer (or pass the trailer as its own paragraph up front with a *second* `-m` — `git merge --no-ff -m "<msg>" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"` — because a single `-m "<msg>\n\nCo-authored-by: …"` leaves a literal `\n\n` in the message under standard shell double-quotes and never forms the blank-line-separated trailer paragraph). Note the squash-merge of the PR discards the merge commit, but the trailer gate runs on branch commits *before* the squash, so the merge commit must still carry it. **Cleaner alternative — rebase, don't merge:** when `main` advances mid-flight, `git rebase origin/main` (instead of `git merge origin/main`) avoids creating a merge commit at all, so history stays linear and every commit keeps its own `Co-authored-by` trailer — no trailer-less merge commit is ever produced. On this repo (squash-merge onto a linear `main`) rebase is the preferred update path; reserve `--amend`/second-`-m` for cases where a merge commit is unavoidable.

**Evidence:** CS61, 2026-06-06, on the pre-squash `cs61/content` branch: a `git merge origin/main` committed via `git commit --no-edit` produced a trailer-less merge commit, which made the lint-aggregator suites' `check-commit-trailers` step fail (4 `node --test` failures, `check-commit-trailers: fail` against `HEAD`); `git commit --amend` to add the trailer restored 1113 pass / 0 fail. The required trailer is defined in `.github/copilot-instructions.md` § Branch and commit conventions and enforced by `scripts/check-commit-trailers.mjs` (run by `harness lint`). The merge commits were squashed into `main` commit `7379a6b`, so — note — the trailer gate runs on branch commits *before* the squash discards the merge commit. **Re-confirmed CS85, 2026-07-02 (PR #386):** a mid-flight `git merge origin/main` produced a trailer-less merge commit that failed both `commit-trailers` and `read-only-gates` B1; `git reset --hard <content-tip> && git rebase origin/main` (force-push) replaced it with a linear, all-trailer history and the gates passed — validating the rebase-over-merge remedy.

**Disposition:** Applied — captured here as the standing operational rule; **prefer `git rebase origin/main` over `git merge`** (no merge commit, linear history, trailers preserved), or if a merge is unavoidable, amend the merge commit to carry the `Co-authored-by` trailer.

### LRN-147

```yaml
id: LRN-147
date: 2026-06-06
category: architectural
source_cs: CS61
status: applied
tags: [review-gates, harness-ci, zero-deps, module-boundary, ajv, ci-environment]
claim_area: review-loops
```

**Problem:** CS61 migrated four harness linters — the three PR-side review-gate scripts `review-gates.yml` runs (`scripts/checks/check-review-log-evidence.mjs`, `check-independence-invariant.mjs`, `check-copilot-review-attached.mjs`) plus the `harness lint`-run clickstop linter `scripts/check-clickstop-implementer-not-reviewer.mjs` — onto a shared reader that was first placed in `lib/config-reader.mjs`. All local checks (`harness lint`, `node --test`) passed because the dev/CI checkout has `node_modules` installed. But the `review-gates.yml` workflow runs three of those scripts from a **bare `git clone` into `.harness-ci/agent-harness` with NO `npm install`** — so `node .harness-ci/agent-harness/scripts/checks/check-review-log-evidence.mjs` crashed with `ERR_MODULE_NOT_FOUND: Cannot find package 'ajv'`, because `lib/config-reader.mjs` has a top-level `import Ajv2020 from 'ajv/dist/2020.js'` (for its `loadConfig`/`writeConfig` AJV validation) — even though `loadReviewsPolicy` itself never calls AJV. The failure was invisible to every local gate and surfaced only as red CI on the content PR.

**Finding:** **Any module imported (transitively) by a `review-gates.yml` gate script MUST be zero-third-party-dependency (Node builtins + relative imports only), because those scripts run from a `node_modules`-free `.harness-ci` clone.** A top-level third-party import anywhere in the reachable module graph crashes the gate at load time, regardless of whether the imported symbol is used. Concretely: `lib/config-reader.mjs` (AJV) and `lib/doc-schema.mjs` (`js-yaml`) are OFF-LIMITS to the review-gates scripts. CS61 resolved this (and plan Q1) by putting the shared reader in a dedicated dep-free `lib/reviews-policy.mjs` (only `node:fs`/`node:path`/`node:url`, reads the schema JSON directly without AJV) rather than extending `config-reader.mjs`. Verification recipe: copy `lib/`+`scripts/`+`schemas/` to a temp dir WITHOUT `node_modules` and run each gate script there; it must not throw `ERR_MODULE_NOT_FOUND`. A future hardening candidate is a CI job (or lint check) that runs the gate scripts in a deps-stripped sandbox so this regresses loudly at PR time instead of only on the `review-gates` job.

**Evidence:** CS61 PR #250, 2026-06-06. `review-gates.yml` jobs (`mkdir .harness-ci` → `git clone … .harness-ci/agent-harness` → `git checkout "$ref"` → `node .harness-ci/agent-harness/scripts/checks/<gate>.mjs`, no `npm`) at lines 32-40/60-72/94-102/122-133. CI run 27072178894 job 79903294035: `Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'ajv' imported from …/.harness-ci/agent-harness/lib/config-reader.mjs`. Fixed by moving `loadReviewsPolicy`/`ReviewsConfigError` to dep-free `lib/reviews-policy.mjs` and repointing all four importing scripts + `tests/cs61-reviews-policy-reader.test.mjs`; confirmed by a `node_modules`-stripped sandbox run (both gate scripts exit 0) and re-greened CI. `package.json` declares `ajv`/`ajv-formats`/`js-yaml` as runtime `dependencies`, but the `.harness-ci` clone never installs them. Cross-refs: LRN-039 (schema-source-of-truth), LRN-141 (fresh-worktree `npm install`), the harness convention "lib/ modules have zero runtime deps beyond Node builtins."

**Disposition:** Applied — shared reader lives in dep-free `lib/reviews-policy.mjs`; documented here as a standing constraint for future review-gate-script changes. Follow-up candidate (not blocking): a deps-stripped CI smoke that exercises the gate scripts so this class of regression fails at PR time rather than only on the live `review-gates` job.

### LRN-148

```yaml
id: LRN-148
date: 2026-06-05
category: architectural
source_cs: CS61
status: applied
tags: [schema-vs-runtime, reviews-policy, high-risk-clickstops, enforce-gates, deferred-divergence, config-reader]
claim_area: review-loops
```

**Problem:** CS61 factored the four `scripts/checks/` review-gate linters onto the shared `loadReviewsPolicy` reader (schema-default-sourced). Two *other* review-policy reads carry runtime defaults that deliberately diverge from the schema defaults, so a naive migration to the shared reader would silently change behavior: (1) `lib/review.mjs` `DEFAULT_REVIEW_CONFIG.high_risk_clickstops` is `[]`, vs the schema default `["CS03","CS11","CS15a","CS18b","CS19"]`; (2) `scripts/check-review-gates.mjs` and `bin/harness.mjs` `syncReviewGateRuleset` treat an absent `reviews.enforce_gates` as opt-OUT (skip), vs the schema default `true`.

**Finding:** Neither divergence is a bug to "align away" — each is a deliberate, correct runtime choice, and adopting the schema default would be a regression. (1) The schema's high-risk list is **this harness's own CS ids**, meaningless in a consumer repo; `lib/review.mjs` is consumer-facing runtime, so `[]` is correct there (the linters, which run against THIS repo, correctly use the CS list). (2) Flipping absent `enforce_gates` from skip→enforce is an opt-in→opt-out product change with consumer blast radius and would split the linter from `syncReviewGateRuleset` if done piecemeal. Both are therefore **documented in-place** (code comments at each site) and left unmigrated. Revisit ONLY if the schema gains consumer-relative high-risk semantics, or a deliberate decision makes review-gate enforcement opt-out by default (then change linter + sync + schema together, with a CHANGELOG entry).

**Evidence:** CS61, 2026-06-05. Sites: `lib/review.mjs` `DEFAULT_REVIEW_CONFIG.high_risk_clickstops: []`; `scripts/check-review-gates.mjs` `validate()` `config.reviews?.enforce_gates !== true`; `bin/harness.mjs` `syncReviewGateRuleset` same predicate. Schema: `schemas/harness.config.schema.json` `reviews.high_risk_clickstops.default` (the CS list) and `reviews.enforce_gates.default: true`. User-approved deferral (2026-06-05). Cross-refs: LRN-145 (shared reader + schema-conformance review rule), LRN-142 (config-vs-code drift).

**Disposition:** Applied — both divergences documented in code at all three sites and recorded here. No follow-up CS required unless an assumption above changes.

### LRN-145

```yaml
id: LRN-145
date: 2026-06-04
category: process
source_cs: CS60
status: applied
tags: [schema-source-of-truth, fail-closed, config-reader, rubber-duck, copilot-review, review-coverage-gap, gpt-5.5]
claim_area: review-loops
```

**Problem:** In CS60 the LRN-142 de-drift of `scripts/checks/check-independence-invariant.mjs` made `validateReviewsConfig()` *require* `reviews.rubber_duck_model` and `reviews.high_risk_clickstops` (throwing `ConfigError` when absent). But `schemas/harness.config.schema.json` supplies `default`s for both and lists neither in any `required` array — so a schema-valid consumer `harness.config.json` that omits them (relying on the defaults) would have been rejected by the linter, a silent breaking change that violates hard rule #4 (schema is source of truth). The GPT-5.5 rubber-duck review-of-record ran three rounds (R1 Needs-Fix → R3 Go) and **did not catch this** — it verified the fail-closed *logic* against LRN-033, but never diffed the linter's enforced-required set against the schema's `required`/`default` declarations. The defect was caught only by the subsequent GitHub Copilot PR review (which reads the schema), after the local review-of-record had already returned Go.

**Finding:** Two complementary rules.

1. **Engineering rule (resolves the LRN-039 ↔ LRN-033 tension):** an enforcement linter that sources policy from `harness.config.json`/`schemas/` must **apply the schema default when an optional field is absent** and **fail closed only on a present-but-malformed value** (wrong type, bad pattern, duplicate). "Default when absent, fail-closed on malformed" is the correct CS57/CS60 pattern — *not* "throw on absent." Over-requiring fields the schema marks optional-with-default rejects schema-valid configs and makes the linter, not the schema, the de-facto source of truth.

2. **Review-doctrine rule (a schema-conformance analogue of the LRN-139 / REVIEWS.md § 2.6a fact-claim gap):** any rubber-duck review of a change that adds or de-drifts a config/schema reader MUST cross-check the reader's enforced-required set and default values against the actual schema (`required` array + per-field `default`s), not just the local fail-closed control flow. Treat "linter requires a field the schema marks optional/defaulted" (and its inverse) as a P0 blind spot. This is the same class of unverified cross-artifact claim as LRN-139, but for schema conformance in PR-side reviews rather than file/line citations in plan reviews.

**Evidence:** CS60 PR #244. R1–R3 GPT-5.5 review-of-record returned Go at `ef4d323`; Copilot then flagged the over-require on `scripts/checks/check-independence-invariant.mjs:90-101` at that head. Fixed in `0f98a6e` (`validateReviewsConfig` now defaults absent fields, fails closed on malformed) + `9abe13f`/`7d92415` polish, re-reviewed Go (R4–R6), regression coverage in `tests/cs60-config-drift.test.mjs`. Schema check: `schemas/harness.config.schema.json` `reviews` has no `required` array and defines `default`s `rubber_duck_model: "gpt-5.5"` and `high_risk_clickstops: ["CS03","CS11","CS15a","CS18b","CS19"]`. Related: LRN-039 (schema-is-source-of-truth), LRN-033 (fail-closed parsers), LRN-142 (config-vs-code drift), LRN-139 (plan-side fact-claim verification gap). The still-open residual de-drift of `check-review-log-evidence.mjs`'s hard-coded `gpt-5.5` (recorded in the LRN-142 disposition) MUST apply rule 1 above when implemented.

**Disposition:** Resolved in CS61 (see Applied below). The shared `loadReviewsPolicy` reader in dep-free `lib/reviews-policy.mjs` plus the migration of all four review-gate checks implements rule 1 (default-when-absent / fail-closed-on-malformed, no hard-coded literals); `REVIEWS.md § 2.6b` (S1–S3) implements rule 2 (schema-conformance review doctrine). Cross-references: LRN-142 (residual now closed), LRN-148 (deferred schema-vs-runtime divergences), LRN-147 (dep-free gate-script constraint), LRN-039, LRN-033.

**Applied (CS61, 2026-06-05):** Both rules implemented. **Rule 1** — a single canonical reviews-policy reader `loadReviewsPolicy({cwd,configPath})` + `ReviewsConfigError` added in a new **dep-free** `lib/reviews-policy.mjs` (Node builtins only; NOT `lib/config-reader.mjs`, which imports AJV — the gate scripts run from a `node_modules`-free `.harness-ci` clone, see LRN-147), sourcing per-field defaults from `schemas/harness.config.schema.json` (cached) with **default-when-absent / fail-closed-on-malformed / `reviews`-subtree-only** validation; all four review-gate checks (`check-review-log-evidence.mjs`, `check-independence-invariant.mjs`, `check-clickstop-implementer-not-reviewer.mjs`, `check-copilot-review-attached.mjs`) now consume it, removing every hard-coded `gpt-5.5` / high-risk literal under `scripts/checks/` + `scripts/check-clickstop-implementer-not-reviewer.mjs` (the LRN-142 residual). **Rule 2** — `REVIEWS.md § 2.6b` (schema-conformance S1–S3 checklist) added adjacent to § 2.6a, with a parallel S1–S3 obligation in the OPERATIONS.md reviewer preamble (+ composed mirror). Tests: `tests/cs61-reviews-policy-reader.test.mjs` (28 cases) + all migrated checks' suites green. Two schema-vs-runtime default divergences were deliberately deferred and documented (see LRN-148). CS61.

### LRN-143

```yaml
id: LRN-143
date: 2026-06-04
category: process
source_cs: CS27
status: applied
tags: [plan-review-hash, decisions-immutability, deviation-record, copilot-review, gpt-5.5]
claim_area: orchestrator-loop
```

**Problem:** During CS27 a Copilot PR review discovered that an already
plan-review-hashed `## Decisions` row (C27-3) specified factually wrong
recommendation text: the `commit-trailers` lint recommendation cited a
non-existent `OPERATIONS.md § Branch and commit conventions` section and
suggested a `--signoff` trailer. Both are wrong — that section actually lives
in `.github/copilot-instructions.md`, and `check-commit-trailers.mjs` requires
a `Co-authored-by` trailer by default (`--signoff` emits `Signed-off-by`).
The obvious fix — edit the Decisions row to the correct text — would silently
invalidate the recorded plan-review hash, because plan-review hashes cover the
`## Decisions` and `## Deliverables` section bodies (per
`lib/plan-review-hash.mjs`).

**Finding:** Plan-review-hashed sections are effectively immutable after the
plan-review is recorded. When a reviewer later finds a factual error baked into
a hashed `## Decisions`/`## Deliverables` row, the correct resolution is to
(a) fix the **implementation** to the accurate text, (b) leave the hashed row
**verbatim** so the recorded hash still validates, and (c) record the
divergence explicitly in the CS file's `## Notes` section as a dated deviation.
Do **not** edit the hashed section to "make it match" — that breaks the audit
chain the hash exists to protect.

**Evidence:** CS27 content PR #239. Copilot inline comment on the
`commit-trailers` recommendation text; implementation corrected in commit
`5c2b3e1` (`bin/harness.mjs` `LINT_SKIP_RECOMMENDATIONS`); C27-3 Decisions row
left verbatim; deviation recorded in
`project/clickstops/done/done_cs27_lint-detector-tightening.md` § Notes
(~line 128). Generalises the existing rule that plan-review hashes cover only
`## Decisions`/`## Deliverables` bodies.

**Disposition:** Resolved in CS60 (see Applied below). CS60 added a note to
`OPERATIONS.md § Plan review` stating that post-hash
factual corrections go to implementation + a `## Notes` deviation record, never
to the hashed section.

**Applied (CS60, 2026-06-04):** `OPERATIONS.md § Plan review` (and lockstep `template/composed/OPERATIONS.md`) now states that once a `## Decisions`/`## Deliverables` row is plan-review-hashed, later factual errors must be fixed in the implementation and recorded as a dated `## Notes` deviation — never by editing the hashed section, which would invalidate the attestation.

### LRN-144

```yaml
id: LRN-144
date: 2026-06-04
category: process
source_cs: CS27
status: applied
tags: [plan-vs-implementation, close-out, check-clickstop, false-positive, worktree-ordering]
claim_area: orchestrator-loop
```

**Problem:** The CS27 plan-vs-implementation (PVI) close-out review reported a
`NEEDS-FIX` even though every Deliverable and Exit criterion was met and the
reviewer's substantive verdict was `GO`. The `NEEDS-FIX` did **not** come from
the substantive review — it came from the reviewer running `node --test` (which
invokes `check-clickstop.mjs`) against the in-progress close-out worktree, where
the `active_*` → `done_*` rename had already happened but the
`## Plan-vs-implementation review` section was not yet filled — because that
section is *populated from the verdict the gate is supposed to produce*. The
linter correctly rejected the unfilled section, and that mechanical failure was
surfaced as `NEEDS-FIX`, masking the substantive GO.

**Finding:** The PVI close-out gate must evaluate the **merged content HEAD**
(or the content diff `git diff main..cs<NN>/content`), not the half-migrated
close-out worktree. Per `OPERATIONS.md § Plan-vs-implementation review`, the
orchestrator records the verdict in the **active** CS file's
`## Plan-vs-implementation review` section **before** the `active → done`
rename. The CS27 mistake was doing the rename first: that produced a `done_*`
file with an unfilled PVI section — the exact state `check-clickstop` rejects.
Correct ordering is verdict-first: capture the GO, write the PVI section into
the still-`active` file, and only then perform the `active → done` rename and
close-out validation. When a linter does run on a mid-migration worktree, read
the gate's prose verdict, not the linter exit code.

**Evidence:** CS27 PVI gate (gpt-5.5 rubber-duck, background) against merged
HEAD `9101bf2` returned substantively GO; the false NEEDS-FIX came solely from
running `node --test` on the dirty close-out worktree (renamed `done_*` file,
unfilled PVI section). `OPERATIONS.md:107-108` and `OPERATIONS.md:131-135`
confirm the gate precedes the rename and the verdict is recorded in the active
file. Resolved in `done_cs27_lint-detector-tightening.md` (~line 162, Outcome
GO) then re-validated clean (check-clickstop 0 errors). Inverse of the
structural-marker *bypass* problem (placeholder PVI sections passing the linter)
captured in the CS03b check-#4 hardening LRN.

**Disposition:** Resolved in CS60 (see Applied below). CS60 added an ordering reminder to
`OPERATIONS.md § Plan-vs-implementation review (close-out gate)` — gate runs
against the merged content HEAD / content diff; record the verdict in the
**active** CS file first; the `active → done` rename is the *last* close-out
step, never performed before the PVI section is populated.

**Applied (CS60, 2026-06-04):** `OPERATIONS.md § Plan-vs-implementation review (close-out gate)` now records that the PVI verdict must be written to the active CS file before the `active → done` rename (renaming first leaves a `done/` file with an unfilled PVI section that `check-clickstop` rejects), and that the gate evaluates the merged content HEAD.

### LRN-001

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-001](LEARNINGS-archive.md#lrn-001).

---

### LRN-002

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-002](LEARNINGS-archive.md#lrn-002).

---

### LRN-003

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-003](LEARNINGS-archive.md#lrn-003).

---

### LRN-004

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-004](LEARNINGS-archive.md#lrn-004).

---

### LRN-005

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-005](LEARNINGS-archive.md#lrn-005).

---

### LRN-006

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-006](LEARNINGS-archive.md#lrn-006).

---

### LRN-007

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-007](LEARNINGS-archive.md#lrn-007).

---

### LRN-008

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-008](LEARNINGS-archive.md#lrn-008).

---

### LRN-009

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-009](LEARNINGS-archive.md#lrn-009).

---

### LRN-010

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-010](LEARNINGS-archive.md#lrn-010).

---

### LRN-011

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-011](LEARNINGS-archive.md#lrn-011).

---

### LRN-012

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-012](LEARNINGS-archive.md#lrn-012).

---

### LRN-013

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-013](LEARNINGS-archive.md#lrn-013).

---

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

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-015](LEARNINGS-archive.md#lrn-015).

---

### LRN-016

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-016](LEARNINGS-archive.md#lrn-016).

---

### LRN-017

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-017](LEARNINGS-archive.md#lrn-017).

---

### LRN-018

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-018](LEARNINGS-archive.md#lrn-018).

---

### LRN-019

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-019](LEARNINGS-archive.md#lrn-019).

---

### LRN-020

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-020](LEARNINGS-archive.md#lrn-020).

---

### LRN-021

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-021](LEARNINGS-archive.md#lrn-021).

---

### LRN-022

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-022](LEARNINGS-archive.md#lrn-022).

---

### LRN-023

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-023](LEARNINGS-archive.md#lrn-023).

---

### LRN-024

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-024](LEARNINGS-archive.md#lrn-024).

---

### LRN-025

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-025](LEARNINGS-archive.md#lrn-025).

---

### LRN-026

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-026](LEARNINGS-archive.md#lrn-026).

---

### LRN-027

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-027](LEARNINGS-archive.md#lrn-027).

---

### LRN-028

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-028](LEARNINGS-archive.md#lrn-028).

---

### LRN-029

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-029](LEARNINGS-archive.md#lrn-029).

---

### LRN-030

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-030](LEARNINGS-archive.md#lrn-030).

---

### LRN-031

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-031](LEARNINGS-archive.md#lrn-031).

---

### LRN-032

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-032](LEARNINGS-archive.md#lrn-032).

---

### LRN-033

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-033](LEARNINGS-archive.md#lrn-033).

---

### LRN-034

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-034](LEARNINGS-archive.md#lrn-034).

---

### LRN-035

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-035](LEARNINGS-archive.md#lrn-035).

---

### LRN-036

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-036](LEARNINGS-archive.md#lrn-036).

---

### LRN-037

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-037](LEARNINGS-archive.md#lrn-037).

---

### LRN-038

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-038](LEARNINGS-archive.md#lrn-038).

---

### LRN-039

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-039](LEARNINGS-archive.md#lrn-039).

---

### LRN-040

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-040](LEARNINGS-archive.md#lrn-040).

---

### LRN-041

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-041](LEARNINGS-archive.md#lrn-041).

---

### LRN-042

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-042](LEARNINGS-archive.md#lrn-042).

---

### LRN-043

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-043](LEARNINGS-archive.md#lrn-043).

---

### LRN-044

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-044](LEARNINGS-archive.md#lrn-044).

---

### LRN-045

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-045](LEARNINGS-archive.md#lrn-045).

---

### LRN-046

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-046](LEARNINGS-archive.md#lrn-046).

---

### LRN-047

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-047](LEARNINGS-archive.md#lrn-047).

---

### LRN-048

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-048](LEARNINGS-archive.md#lrn-048).

---

### LRN-049

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-049](LEARNINGS-archive.md#lrn-049).

---

### LRN-050

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-050](LEARNINGS-archive.md#lrn-050).

---

### LRN-051

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-051](LEARNINGS-archive.md#lrn-051).

---

### LRN-052

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-052](LEARNINGS-archive.md#lrn-052).

---

### LRN-053

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-053](LEARNINGS-archive.md#lrn-053).

---

### LRN-054

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-054](LEARNINGS-archive.md#lrn-054).

---

### LRN-055

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-055](LEARNINGS-archive.md#lrn-055).

---

### LRN-056

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-056](LEARNINGS-archive.md#lrn-056).

---

### LRN-057

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-057](LEARNINGS-archive.md#lrn-057).

---

### LRN-058

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-058](LEARNINGS-archive.md#lrn-058).

---

### LRN-059

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-059](LEARNINGS-archive.md#lrn-059).

---

### LRN-060

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-060](LEARNINGS-archive.md#lrn-060).

---

### LRN-061

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-061](LEARNINGS-archive.md#lrn-061).

---

### LRN-062

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-062](LEARNINGS-archive.md#lrn-062).

---

### LRN-063

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-063](LEARNINGS-archive.md#lrn-063).

---

### LRN-064

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-064](LEARNINGS-archive.md#lrn-064).

---

### LRN-065

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-065](LEARNINGS-archive.md#lrn-065).

---

### LRN-066

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-066](LEARNINGS-archive.md#lrn-066).

---

### LRN-067

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-067](LEARNINGS-archive.md#lrn-067).

---

### LRN-068

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-068](LEARNINGS-archive.md#lrn-068).

---

### LRN-069

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-069](LEARNINGS-archive.md#lrn-069).

---

### LRN-070

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-070](LEARNINGS-archive.md#lrn-070).

---

### LRN-071

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-071](LEARNINGS-archive.md#lrn-071).

---

### LRN-072

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-072](LEARNINGS-archive.md#lrn-072).

---

### LRN-073

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-073](LEARNINGS-archive.md#lrn-073).

---

### LRN-074

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-074](LEARNINGS-archive.md#lrn-074).

---

### LRN-075

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-075](LEARNINGS-archive.md#lrn-075).

---

### LRN-076

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-076](LEARNINGS-archive.md#lrn-076).

---

### LRN-077

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-077](LEARNINGS-archive.md#lrn-077).

---

### LRN-078

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-078](LEARNINGS-archive.md#lrn-078).

---

### LRN-079

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-079](LEARNINGS-archive.md#lrn-079).

---

### LRN-080

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-080](LEARNINGS-archive.md#lrn-080).

---

### LRN-081

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-081](LEARNINGS-archive.md#lrn-081).

---

### LRN-082

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-082](LEARNINGS-archive.md#lrn-082).

---

### LRN-083

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-083](LEARNINGS-archive.md#lrn-083).

---

### LRN-084

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-084](LEARNINGS-archive.md#lrn-084).

---

### LRN-085

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-085](LEARNINGS-archive.md#lrn-085).

---

### LRN-086

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-086](LEARNINGS-archive.md#lrn-086).

---

### LRN-087

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-087](LEARNINGS-archive.md#lrn-087).

---

### LRN-088

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-088](LEARNINGS-archive.md#lrn-088).

---

### LRN-089

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-089](LEARNINGS-archive.md#lrn-089).

---

### LRN-090

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-090](LEARNINGS-archive.md#lrn-090).

---

### LRN-091

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-091](LEARNINGS-archive.md#lrn-091).

---

### LRN-092

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-092](LEARNINGS-archive.md#lrn-092).

---

### LRN-093

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-093](LEARNINGS-archive.md#lrn-093).

---

### LRN-094

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-094](LEARNINGS-archive.md#lrn-094).

---

### LRN-095

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-095](LEARNINGS-archive.md#lrn-095).

---

### LRN-096

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-096](LEARNINGS-archive.md#lrn-096).

---

### LRN-097

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-097](LEARNINGS-archive.md#lrn-097).

---

### LRN-098

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-098](LEARNINGS-archive.md#lrn-098).

---

### LRN-099

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-099](LEARNINGS-archive.md#lrn-099).

---

### LRN-100

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-100](LEARNINGS-archive.md#lrn-100).

---

### LRN-126

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-126](LEARNINGS-archive.md#lrn-126).

---

### LRN-123

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-123](LEARNINGS-archive.md#lrn-123).

---

### LRN-125

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-125](LEARNINGS-archive.md#lrn-125).

---

### LRN-131

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-131](LEARNINGS-archive.md#lrn-131).

---

### LRN-132

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-132](LEARNINGS-archive.md#lrn-132).

---

### LRN-133

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-133](LEARNINGS-archive.md#lrn-133).

---

### LRN-134

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-134](LEARNINGS-archive.md#lrn-134).

---

### LRN-135

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-135](LEARNINGS-archive.md#lrn-135).

---

### LRN-136

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-136](LEARNINGS-archive.md#lrn-136).

---

### LRN-142

```yaml
id: LRN-142
date: 2026-06-03
category: tooling
source_cs: CS57
status: applied
tags: [config-vs-code-drift, high-risk-clickstops, enforcement-linter, date-gate, schema-source-of-truth, fail-closed]
claim_area: lint-and-encoding
```

**Problem:** While implementing CS57 (hardening `scripts/check-clickstop-implementer-not-reviewer.mjs`), two latent defects surfaced. (1) **Config-vs-code drift:** `harness.config.json` carried a populated `reviews.high_risk_clickstops` array and `schemas/harness.config.schema.json` defined it, yet the model-independence linter ignored the config entirely and used a hard-coded copy of the high-risk list. A schema-defined, populated, operator-editable config key was silently dead — editing it changed nothing the linter did (an LRN-039 "schema-is-source-of-truth" follow-on). (2) **Cutoff-shape trap:** the superseded PR #201 keyed its missing-`## Model audit` warn→error flip off a raw CS-number cutoff (`CS ≥ 48 → ERROR`). A baseline run showed the 8 historical `done/` clickstops CS48–CS56 have **no `## Model audit` section at all**, so that cutoff would have turned all 8 into hard errors and broken `main` on merge.

**Finding:** **An enforcement linter must read its policy inputs from the same config/schema the rest of the system treats as source-of-truth, and must grandfather pre-existing artefacts by a *date* gate, not an identifier-number cutoff.** (1) Reading `reviews.high_risk_clickstops` from `harness.config.json` (default only when the key is *absent*; explicit `[]` honored as empty; **fail-closed** with a non-zero exit on parse error / present-but-non-array / non-string element per LRN-033) closes the drift and makes the config actually authoritative — but note the linter is deliberately stricter than the runtime consumers (`lib/review.mjs`, `bin/harness.mjs`, `check-independence-invariant.mjs`), which silently default or incidentally crash on wrong-type input rather than fail closed. (2) The linter already had the right grandfathering idiom — a `parseClosedDate` + `ENFORCEMENT_DATE_MS` date gate (`IMPLEMENTER_NOT_REVIEWER_RECURSION_ENFORCEMENT_DATE`, itself mirroring `CLOSEOUT_TASK_ENFORCEMENT_DATE`). CS57 reused it with a new `MODEL_AUDIT_ENFORCEMENT_DATE` set strictly *after* the latest closed CS (2026-06-04, latest close 2026-06-03), so existing files are warn-only and only new `active/`+post-cutoff `done/` files enforce. **Always baseline-run a linter against the live repo before flipping warn→error, and grandfather by close-date using the established date-gate, never by a raw number threshold.**

**Evidence:** CS57 implementation, 2026-06-03. Baseline `node scripts/check-clickstop-implementer-not-reviewer.mjs --cwd .` → `0 errors, 53 warnings` (CS48–CS56 `done/` files all warn for absent `## Model audit`). Config drift: `harness.config.json` `reviews.high_risk_clickstops = ["CS03","CS11","CS15a","CS18b","CS19"]` defined at `schemas/harness.config.schema.json:184` but unread by the linter (hard-coded `DEFAULT_HIGH_RISK_CLICKSTOPS`). After CS57: `loadHighRiskClickstops()` reads the config (fail-closed on malformed), `MODEL_AUDIT_ENFORCEMENT_DATE = '2026-06-04'`, regression-guard test asserts the linter still exits 0 against the live `project/clickstops/`.

**Disposition:** Resolved in CS60 (see Applied below). CS57 fixed the config-vs-code drift for `check-clickstop-implementer-not-reviewer.mjs`; CS60 completed the follow-up audit of the other harness linters and de-drifted `check-independence-invariant.mjs` (config is now source-of-truth with fail-closed validation). Genuinely-remaining future candidates: a shared `lib/` config accessor so the "default only when absent, honor `[]`, fail-closed on malformed" policy is implemented once rather than re-derived per consumer, and de-drifting `check-review-log-evidence.mjs`'s hard-coded `gpt-5.5`. Cross-references: LRN-039 (schema-is-source-of-truth), LRN-033 (fail-closed parser doctrine).

**Applied (CS60, 2026-06-04):** Follow-up audit completed. `scripts/checks/check-independence-invariant.mjs` no longer hard-codes the high-risk-clickstops list or primary-reviewer model — both are now read from `harness.config.json` with fail-closed validation (CS57 pattern); verdicts for valid configs are unchanged. Regression test `tests/cs60-config-drift.test.mjs` added. Residual (recorded as a deliberate follow-up for a future shared-config-accessor pass): `check-review-log-evidence.mjs` still hard-codes `gpt-5.5`.

**Applied (CS61, 2026-06-05):** Residual resolved. CS61 introduced the shared `loadReviewsPolicy` reader in a new dep-free `lib/reviews-policy.mjs` (the "shared `lib/` config accessor" future candidate noted above; kept separate from `lib/config-reader.mjs` because the gate scripts run dep-free in CI — see LRN-147) and migrated `check-review-log-evidence.mjs` (dropping the hard-coded `gpt-5.5`), `check-clickstop-implementer-not-reviewer.mjs` (dropping its hard-coded primary model + local high-risk loader), and `check-copilot-review-attached.mjs` (replacing its shape-lenient loader) onto it. No hard-coded review-policy literals remain under `scripts/checks/` or `scripts/check-clickstop-implementer-not-reviewer.mjs`. See LRN-145 (applied).

### LRN-141

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-141](LEARNINGS-archive.md#lrn-141).

---

### LRN-140

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-140](LEARNINGS-archive.md#lrn-140).

---

### LRN-139

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-139](LEARNINGS-archive.md#lrn-139).

---

### LRN-138

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-138](LEARNINGS-archive.md#lrn-138).

---

### LRN-137

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-137](LEARNINGS-archive.md#lrn-137).

---

### LRN-127

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-127](LEARNINGS-archive.md#lrn-127).

---

### LRN-124

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-124](LEARNINGS-archive.md#lrn-124).

---

### LRN-128

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-128](LEARNINGS-archive.md#lrn-128).

---

### LRN-129

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-129](LEARNINGS-archive.md#lrn-129).

---

### LRN-130

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-130](LEARNINGS-archive.md#lrn-130).

---

### LRN-122

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-122](LEARNINGS-archive.md#lrn-122).

---

### LRN-121

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-121](LEARNINGS-archive.md#lrn-121).

---

### LRN-120

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-120](LEARNINGS-archive.md#lrn-120).

---

### LRN-119

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-119](LEARNINGS-archive.md#lrn-119).

---

### LRN-118

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-118](LEARNINGS-archive.md#lrn-118).

---

### LRN-117

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-117](LEARNINGS-archive.md#lrn-117).

---

### LRN-116

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-116](LEARNINGS-archive.md#lrn-116).

---

### LRN-115

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-115](LEARNINGS-archive.md#lrn-115).

---

### LRN-114

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-114](LEARNINGS-archive.md#lrn-114).

---

### LRN-113

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-113](LEARNINGS-archive.md#lrn-113).

---

### LRN-112

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-112](LEARNINGS-archive.md#lrn-112).

---

### LRN-111

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-111](LEARNINGS-archive.md#lrn-111).

---

### LRN-110

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-110](LEARNINGS-archive.md#lrn-110).

---

### LRN-109

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-109](LEARNINGS-archive.md#lrn-109).

---

### LRN-108

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-108](LEARNINGS-archive.md#lrn-108).

---

### LRN-107

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-107](LEARNINGS-archive.md#lrn-107).

---

### LRN-106

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-106](LEARNINGS-archive.md#lrn-106).

---

### LRN-105

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-105](LEARNINGS-archive.md#lrn-105).

---

### LRN-104

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-104](LEARNINGS-archive.md#lrn-104).

---

### LRN-103

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-103](LEARNINGS-archive.md#lrn-103).

---

### LRN-102

> **Archived.** Full entry → [LEARNINGS-archive.md#lrn-102](LEARNINGS-archive.md#lrn-102).

---

### LRN-101

```yaml
id: LRN-101
date: 2026-05-10
category: process
source_cs: CS22
status: open
tags: [release-cuts, changelog, audit-cadence, retro]
claim_area: process-release
```

**Problem:** CS22 (Cut harness v0.2.0) ran a retroactive audit of all 56 (then 57) commits since `v0.1.0` to reconcile the CHANGELOG before tagging. The audit took the `cs22-changelog-auditor` sub-agent ~6 minutes (and one re-dispatch because the initial dispatch wording made the auditor over-escalate on R1/R2 benign workflow-hardening commits). The retroactive sweep also surfaced a structural reconciliation issue at the close-out gate: the audit was anchored at `main` HEAD pre-content-merge (`a5d2314`), but `v0.1.0..v0.2.0` is one commit longer (the squash-merge itself, `1484de7`), forcing a row-57 patch during close-out. The pattern — "audit only at release-cut time" — concentrates risk and effort at exactly the wrong moment (right before publishing), and creates the mismatch between audit-time HEAD and tag-time HEAD that needed reconciling.

**Finding:** **For 53–57-commit windows, batch-audit-at-cut is workable but expensive and error-prone in two ways:**

1. **Anchor drift.** A single-shot audit captures `main` HEAD at audit time. The release tag necessarily points at a later commit (the content-PR squash). The audit table is then "off by the squash" forever unless reconciled at close-out — which is exactly what the CS22 plan-vs-impl gate caught (NEEDS-FIX 2026-05-10T23:52Z).
2. **Re-dispatch cost.** Without explicit "AUTHORIZED — benign hardening" notes for known-low-risk areas (R1 `release.yml`, R2 `private-smoke.yml`), well-disciplined sub-agents will halt and escalate, doubling the audit time.

**The cheaper alternative — CHANGELOG-on-every-CS-close-out** — would distribute the cost across the source CSs (where the author already has full context on whether a change is user-visible) and eliminate anchor drift entirely (each CS adds entries to `[Unreleased]` as part of its own close-out PR, no retroactive sweep needed). Trade-offs: requires a tighter CS template (close-out gate must include "did this CS need a CHANGELOG entry?"), and may produce smaller-grained bullets that the release-cut CS would need to consolidate. Net: probably worth piloting in CS21+ (the gwn process catch-up) and CS16 (Sub Invaders bootstrap) by adding a CHANGELOG-touch line to their close-out task tables.

**Recommended fix at the harness level:**

- Add a "Did this CS need a CHANGELOG entry?" row to the `OPERATIONS.md § Close-out` checklist, defaulting to YES for any CS whose deliverable touches `lib/`, `bin/`, `schemas/`, `template/managed/`, or `template/composed/` files (i.e. anything that ships to consumers via `npx`/`harness sync`).
- Update the `check-clickstop` linter to flag a missing CHANGELOG-touch task in the active CS file's `## Tasks` table for any CS that touches the above paths. This makes CHANGELOG-on-every-CS mechanically enforced rather than convention-only.
- For the next release-cut CS (post-v0.2.0): expect to validate the CHANGELOG against `git log v<prev>..main` rather than build it from scratch. Audit cost should drop from ~6 min sub-agent run + reconciliation to ~30 s diff-check.

**Evidence:**

- CS22 audit-report at `project/clickstops/done/done_cs22_cut-harness-v0.2.0/changelog-audit-report.md`: 57 rows, 2 sub-agent dispatches (first stopped on R1/R2 escalation; second completed in ~6 min once R1/R2 were explicitly authorised in the dispatch).
- Plan-vs-impl gate review 2026-05-10T23:52Z: VERDICT NEEDS-FIX with the explicit finding "audit table contains 56 rows and omits the `1484de7` content squash commit". Required a row-57 patch + snapshot reconciliation during close-out.
- Cost comparison: CS22's 13 CHANGELOG bullets came from 7 distinct CSs (CS06c, CS08c, CS14, CS15a, CS15c, CS15d, CS15e, CS15f). Each of those CSs could have added their own bullet at close-out for a marginal cost of ~30 s of scribing per CS, distributed across ~6 days, vs. CS22's concentrated ~6 min + reconciliation cost.

**Disposition:** Open. Recommended action: file as a tiny harness CS (touch `OPERATIONS.md` close-out checklist + `scripts/check-clickstop.mjs`); pilot the new convention in CS21 and CS16 close-outs. Until then, every release-cut CS plan must explicitly include the audit-table reconciliation step (anchor-drift fix) AND the explicit-authorization-of-R1/R2 dispatch language so the sub-agent doesn't over-escalate.

**Disposition update (2026-05-11, `yoga-ah`, pre-CS16 gate):** Two-pronged disposition. (a) **Pilot:** CS16 and CS21 close-outs will each add a CHANGELOG-touch row to their `## Tasks` table — for CS16 this is reflected in the active-CS Tasks table populated at claim time per [OPERATIONS.md § Claim](../OPERATIONS.md#claim); for CS21 the same convention applies at its claim time. (b) **Mechanical enforcement:** filed as planned [CS24 — Apply LRN-101: mechanically enforce CHANGELOG-touch task on distributed-surface CSs](../project/clickstops/planned/planned_cs24_apply-lrn-101-changelog-touch-enforcement.md). Status remains `open` until CS24 closes; will flip to `applied` at CS24 close-out per C24-7 (with pilot evidence from CS16/CS21 cited).

## Obsolete

(none yet)

## Deferred

> **Note:** Section headers (Open / Applied / Obsolete / Deferred) are organizational hints. The authoritative status for each entry is its YAML frontmatter status field. The only current deferred entry is LRN-014; check-learnings.mjs (CS06) validates the status field, not the section placement.
