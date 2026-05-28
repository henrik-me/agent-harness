# CS55 — Cross-repo handoff doctrine

**Status:** active
**Owner:** omni-ah
**Branch:** cs55/content
**Started:** 2026-05-28
**Closed:** —
**Filed by:** Copilot CLI planner sub-agent (2026-05-27)
**Depends on:** None.

## Goal

Codify the cross-repo boundary that the harness orchestrator operates directly only in `henrik-me/agent-harness`. For any repo other than `henrik-me/agent-harness`, the orchestrator must not commit, push, open branches, or create PRs; it files a GitHub issue and lets the consumer-repo agent own the PR, validation, and merge path. Status questions such as "is SI updated?" are check-only: use read-only `gh` inspection and, if needed, idempotently create one tracking issue. There is no escape hatch in the orchestrator rule; even emergencies route through an issue, while the human user can still act directly outside the orchestrator.

## Background

SI PR #79 exposed the missing doctrine while chasing the v0.6.0 pin-bump into `henrik-me/sub-invaders`. The harness orchestrator opened the consumer PR directly, then hit three `read-only-gates` failures because SI's PR template was pre-v0.6.0 strict schema and did not provide the canonical `## Model audit` / `## Review log` evidence. The PR was eventually unblocked and admin-squash-merged at `cbaa608b8196e03ebb09e168562501c105930622`, but the root cause was who opened the PR: the harness orchestrator bypassed SI-side conventions and validation knowledge. LRN-134 records the PR-body checklist gap and CS54 addresses that at the PR-body level; CS55 addresses the higher-level WHO-OPENS-THE-PR boundary. CS54 will inherit CS55's `OPERATIONS.md` `## Cross-repo procedures` H2 via merge; CS54-T3's pin-bump checklist H3 becomes a sibling of CS55's handoff-pattern H3.

## Decisions

- **D55-1 — Rule scope:** The rule applies to any repo other than `henrik-me/agent-harness`. Rationale: future-proof the doctrine without maintaining per-repo allowlists as more consumer repos adopt the harness.
- **D55-2 — No escape hatch:** Even urgent cross-repo work routes through an issue. Rationale: this is an orchestrator constraint; the human user can always self-merge, run `gh`, or otherwise act directly if they choose.
- **D55-3 — Uniform default label:** Every handoff issue MUST always carry the `harness-orchestrator` label as the routing default. Supplemental labels (e.g. `harness-sync`, `release-blocker`) are permitted as additions and never replace or remove the default. **Label preflight prerequisite (Copilot R5, refined R9):** if the target repo does not yet have the `harness-orchestrator` label, the orchestrator MUST ensure it exists BEFORE running `gh issue create --label harness-orchestrator`, otherwise `gh issue create` fails with "label not found". The preflight MUST be non-mutating to consumer-owned label metadata: invoke `gh label create <name> --repo OWNER/NAME --color 0E8A16 --description "Filed by harness orchestrator"` **without** `--force`; if `gh label create` exits non-zero AND its stderr contains an "already exists" indication, treat as success (the label already exists with whatever color/description the consumer chose — do not overwrite). Any other non-zero exit (e.g. HTTP 403) is a real failure. CS56's CLI automates this preflight; manual `gh issue create` invocations (e.g. CS55's T6) must do the same. Rationale: one predictable v1 routing label is enough for triage; idempotent-by-treating-existing-as-success preserves any color/description the consumer repo has already set on a label of the same name (e.g. if the consumer already painted `release-blocker` red, the harness MUST NOT silently repaint it green).
- **D55-4 — OPERATIONS.md ownership and ordering:** CS55 owns all `OPERATIONS.md` changes for the cross-repo doctrine (the `## Cross-repo procedures` H2 + the `### Handoff pattern: issue-only, never direct PR` H3). CS54-T3's `### Cross-repo pin-bump PR body checklist` is a sibling H3 under the same H2. Ordering contract: whichever CS lands FIRST creates the `## Cross-repo procedures` H2 plus its own H3; whichever CS lands SECOND rebases on `main`, leaves the existing H2 untouched, and only adds its sibling H3. Neither CS may re-create the H2 if it already exists.
- **D55-5 — LRN-137 lifecycle:** File LRN-137 in this CS and transition it to terminal state in this CS. The frontmatter must conform to `schemas/learning.schema.json` (status enum: `open|applied|obsolete|deferred`; `additionalProperties: false`, so no `applied_in_cs` field). Start as `status: open`; at close-out transition to `status: applied`. CS linkage is captured by the schema-required `source_cs: CS55` field; reference the applying CS in the entry body if additional narrative is needed.
- **D55-6 — SI issue as demonstration:** The SI tracking issue is the meta-demonstration of the rule applied to its own rollout. It must be labeled `harness-orchestrator`, link to Hard Rule § 6, and ask the SI agent to adopt the reciprocal "work-via-issue-only from harness orchestrator" rule.
- **D55-7 — No config changes:** Do not edit `harness.config.json` or schema. The rule is normative process doctrine, not a data-driven repo allowlist or config switch.
- **D55-8 — No CLI guardrail:** CS55 is doc-only and does not add the `harness cross-repo` CLI guardrail. That implementation belongs to CS56. The two CS plans may be drafted and reviewed in parallel (planning-only parallelism), but CS56 implementation/claim is sequential: per CS56's `Depends on:` header (line 9) and T1 claim preconditions (line 56), CS56 MUST NOT be claimed or open its content PR until CS55's content PR has merged to `main`, so that CS56's CLI codifies a doctrine already in force.

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.7-1m-internal | rubber-duck dispatched (orchestrator: copilot-cli) | ac2480d7ea68 | 2026-05-27T15:30:00Z | Go-with-amendments | Amend validation (add text-encoding), make T6 post-merge, clarify CS54 ordering/sub-agent scope, and move Plan review section. All amendments applied in this revision. |
| R2 | gpt-5.5 | claude-opus-4.7-1m-internal | narrow re-attest (orchestrator: copilot-cli) | f5a7af339815 | 2026-05-27T15:35:00Z | Go | Narrow re-attest after Copilot R1 PR feedback: SI issue title prefix unified to [harness:cs55]; check-text-encoding validation rewritten to single --dir . form. |
| R3 | gpt-5.5 | claude-opus-4.7-1m-internal | narrow re-attest (orchestrator: copilot-cli) | a6a12c8381a6 | 2026-05-27T16:55:00Z | Go | Narrow re-attest after Copilot R3: D55-5/T4 LRN frontmatter aligned to learning.schema.json (status: applied; no applied_in_cs); D55-8 clarified planning-only parallelism. |
| R4 | gpt-5.5 | claude-opus-4.7-1m-internal | narrow re-attest (orchestrator: copilot-cli) | 38355e7c192b | 2026-05-27T17:05:00Z | Go | Narrow re-attest after Copilot R4: Deliverables/T9 brought into schema (status: applied; no applied_in_cs); D55-8 cross-ref repointed at CS56 header Depends-on + T1. |
| R5 | gpt-5.5 | claude-opus-4.7-1m-internal | narrow re-attest (orchestrator: copilot-cli) | 7fe7d2ea98e8 | 2026-05-27T17:15:00Z | Go | Narrow re-attest after Copilot R5: D55-3 + T6 require idempotent `gh label create --force` preflight before `gh issue create --label` so first-time consumer repos do not fail "label not found". |
| R6 | gpt-5.5 | claude-opus-4.7-1m-internal | narrow re-attest (orchestrator: copilot-cli) | f22c892ed091 | 2026-05-27T20:55:00Z | Go | Narrow re-attest after Copilot R8: Deliverables add root mirrors (composed+managed); T3a runs `harness sync --mode=apply`; T3 (e) adds `[harness:cs<NN>]` title contract. |
| R7 | gpt-5.5 | claude-opus-4.7-1m-internal | narrow re-attest (orchestrator: copilot-cli) | fff7343f28d6 | 2026-05-27T23:35:00Z | Go | Narrow re-attest after Copilot R9: D55-3 + T6 label preflight is non-mutating (no `--force`); treat "already exists" stderr as success to preserve consumer-owned label metadata. |
| R8 | gpt-5.5 | claude-opus-4.7-1m-internal | narrow re-attest (orchestrator: copilot-cli) | 3fde10f83ded | 2026-05-28T00:30:00Z | Go | After Copilot R13+R14: T3(f) + Deliverables amend INSTRUCTIONS.md C35-13; managed source + root mirror added; T3a regenerates all 3 mirrors. |

## Deliverables

- `template/managed/.github/copilot-instructions.md` — insert a new hard rule after existing § 5 (currently after line 63) and before the `---` separator. Heading: `### 6 — Cross-repo handoff: file issues, never commit`. Content outline: rule statement; scope = any repo other than `henrik-me/agent-harness`; forbidden actions = commit, push, branch, PR, direct consumer implementation — including via delegated harness-side sub-agents, helper scripts, or background tasks (the orchestrator may not use a sub-agent or tool as a proxy to commit/push/PR in a consumer repo); check-only semantics for status questions; no escape hatch; pointer to `OPERATIONS.md § Cross-repo procedures`.
- `template/managed/INSTRUCTIONS.md` — amend the existing `### Agent does not file issues (CS35 C35-13)` section (L31-42) to add a scoping parenthetical clarifying it applies to the harness repo only; cross-repo handoff issues to OTHER repos remain allowed under Hard Rule § 6 and `OPERATIONS.md § Cross-repo procedures`. The rule itself (no internal planning issues) is preserved — this is a clarification, not a repeal.
- `template/composed/OPERATIONS.md` — create `## Cross-repo procedures` if absent; add `### Handoff pattern: issue-only, never direct PR`. Subsections: the pattern, issue body template, check-only mode for status questions, idempotent issue creation using `gh issue list --search` before `gh issue create`, and **title uniqueness contract** (every CS-driven handoff issue MUST be prefixed with `[harness:cs<NN>]`; this contract is documented HERE in the doctrine because CS56 D56-4/D56-8 keep the prefix as a doctrine rule, not a CLI-enforced rule — the CS56 CLI tests assert the example uses it but the CLI does not validate it). Also amend the existing C35-13 paragraph (L91-93) with the same scoping parenthetical as INSTRUCTIONS.md.
- `.github/copilot-instructions.md` (root mirror, **managed**, classified at `harness.config.json:22`) — regenerated from the updated `template/managed/...` source via `harness sync --mode=apply` so the live repo instructions reflect § 6 immediately (not only after the next downstream sync). Without this step, the new Hard Rule would exist in the template but not in the file that Copilot/agents actually read in `henrik-me/agent-harness` itself.
- `INSTRUCTIONS.md` (root mirror, **managed**, classified at `harness.config.json:17`) — regenerated via `harness sync --mode=apply` so the live root mirror reflects the scoped C35-13 wording. Without this step, the root mirror would still contain the absolute "agent NEVER opens issues" rule, contradicting Hard Rule § 6.
- `OPERATIONS.md` (root mirror, **composed**, classified at `harness.config.json:31`) — regenerated from the updated `template/composed/...` source via `harness sync --mode=apply` so the live `## Cross-repo procedures` section and scoped C35-13 paragraph are present at the root for both human and tooling consumers.
- `LEARNINGS.md` — file LRN-137 with frontmatter conforming to `schemas/learning.schema.json` (status enum `open|applied|obsolete|deferred`; `additionalProperties: false`). Required fields: `id: LRN-137`, `date`, `category: process`, `source_cs: CS55`, `status: open` (initially), `tags`. Do NOT add `applied_in_cs` or other non-schema fields. At close-out, transition to `status: applied`. Body evidence: SI PR #79 chase, three `read-only-gates` failures, `cbaa608b8196e03ebb09e168562501c105930622`, Hard Rule § 6, and the `OPERATIONS.md` procedure.
- `CONTEXT.md` — add a 2-3 sentence operating-model note pointing future orchestrators to Hard Rule § 6 and `OPERATIONS.md § Cross-repo procedures`.
- `WORKBOARD.md` — update during claim and close-out only, per normal CS lifecycle.
- GitHub issue in `henrik-me/sub-invaders` — title `[harness:cs55] Adopt v0.6.x cross-repo handoff doctrine`, label `harness-orchestrator`, and body asking the SI agent to run `harness sync` after CS55 merges, adopt the reciprocal issue-only rule, and validate on the SI side. The `[harness:cs55]` prefix is required by the CS56 D56-4 title-uniqueness contract so future cross-repo issues do not collide. This is a CS task, not a file deliverable.

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1 Claim CS55 (workboard) | done | omni-ah | Rename planned→active, update WORKBOARD. |
| T2 Hard Rule § 6 in managed copilot-instructions | planned | omni-ah | Cross-repo handoff: file issues, never commit. |
| T3 OPERATIONS.md cross-repo handoff doctrine | planned | omni-ah | H2 + handoff H3; scope C35-13 paragraph (R12). |
| T3a Re-render managed/composed root mirrors | planned | omni-ah | `harness sync --mode=apply`. |
| T4 File and close LRN-137 | planned | omni-ah | Schema-conformant; status open→applied. |
| T5 Add CONTEXT.md operating-model note | planned | omni-ah | 2-3 sentences referencing Hard Rule § 6. |
| T6 File SI tracking issue (post-content, pre-closeout) | planned | omni-ah | Label `harness-orchestrator` preflight without `--force`. |
| T7 Validate CS55 changes | planned | omni-ah | `harness lint`, `npm test`, schema validation. |
| T8 Plan-vs-implementation review | planned | omni-ah | gpt-5.5 reviewer; record in `## Plan-vs-implementation review`. |
| Close-out: update workboard/context restart-state docs | planned | omni-ah | Rename active→done; WORKBOARD clean; CONTEXT.md refresh. |
| Close-out: file learnings/follow-up (LRN-137 status applied) | planned | omni-ah | Transition LRN-137 open→applied per D55-5. |

### T1 — Claim CS55

- Rename `project/clickstops/planned/planned_cs55_cross-repo-handoff-doctrine.md` to `project/clickstops/active/active_cs55_cross-repo-handoff-doctrine.md`.
- Update `WORKBOARD.md` with the active CS55 row and owner.
- Follow `OPERATIONS.md § Claim`: use a `workboard/cs55-claim` branch, workboard-only PR, and squash-merge after review.
- **Exit criteria:** active CS file exists, planned file is gone, WORKBOARD active row is correct, and the claim PR is merged.

### T2 — Insert Hard Rule § 6 in managed Copilot instructions

- Edit `template/managed/.github/copilot-instructions.md` after Hard Rule § 5 and before the `---` separator.
- Use heading `### 6 — Cross-repo handoff: file issues, never commit`.
- State that the harness orchestrator must not commit, push, branch, or open PRs in any repo other than `henrik-me/agent-harness`, including via delegated harness-side sub-agents, helper scripts, or background tasks (no proxy bypass).
- Define check-only mode: for "is X updated?" questions, use read-only `gh pr list`, `gh issue list`, or `gh api`; if no tracking issue exists, create exactly one issue and report it.
- State no escape hatch and point to `OPERATIONS.md § Cross-repo procedures` for the procedure.
- **Exit criteria:** new § 6 is self-contained, appears before the separator, and contains no dot-notation placeholders.

### T3 — Add `OPERATIONS.md` cross-repo handoff procedure

- In `template/composed/OPERATIONS.md`, create `## Cross-repo procedures` if absent.
- Add `### Handoff pattern: issue-only, never direct PR` under that H2.
- Include subsection (a) **Pattern:** harness orchestrator files an issue; consumer-repo agent owns branch, PR, validation, and merge.
- Include subsection (b) **Issue body template:** required fields are CS reference, target repo, kind of work, requested consumer action, acceptance criteria, verification steps, relevant LRNs/docs, and links to harness PR/tag once available.
- Include subsection (c) **Check-only mode:** examples such as `gh pr list --repo henrik-me/sub-invaders`, `gh issue list --repo henrik-me/sub-invaders --label harness-orchestrator`, and read-only `gh api` inspection.
- Include subsection (d) **Idempotent creation:** run `gh issue list --repo <owner/repo> --label harness-orchestrator --search "<title terms> in:title"` before `gh issue create`; reuse an existing open issue if found.
- Include subsection (e) **Title uniqueness contract:** every CS-driven handoff issue title MUST be prefixed with `[harness:cs<NN>]` (e.g. `[harness:cs55] Adopt v0.6.x cross-repo handoff doctrine`) so two CSes targeting the same consumer repo cannot accidentally collapse onto the same issue. This is doctrine (documented here), not a CLI-enforced rule; CS56's CLI tests assert the example uses it but the CLI does not validate the prefix on arbitrary titles.
- Include subsection (f) **Reconcile with C35-13 (no-internal-issues rule):** the existing rule "the agent NEVER opens issues" appears in TWO managed/composed locations and BOTH must be amended in the content PR to scope it correctly: (1) `template/composed/OPERATIONS.md:91-93` (and root mirror `OPERATIONS.md:91-93`); (2) `template/managed/INSTRUCTIONS.md:31-42` "### Agent does not file issues (CS35 C35-13)" section (and root mirror `INSTRUCTIONS.md:31-42`). For each location, add a scoping parenthetical such as "(applies to the harness repo only — cross-repo handoff issues to OTHER repos are governed by Hard Rule § 6 and `## Cross-repo procedures` in `OPERATIONS.md`)" so the absolute "NEVER opens issues" wording cannot be read as contradicting the new cross-repo doctrine. INSTRUCTIONS.md is a managed file (`harness.config.json:17`) so its root mirror is regenerated by the T3a `harness sync --mode=apply` step.
- Coordinate with CS54: CS55 owns H2 creation; CS54-T3 later adds `### Cross-repo pin-bump PR body checklist` as a sibling H3.
- **Exit criteria:** H2/H3 hierarchy is stable whether CS54 has landed or not, examples are consumer-root/repo relative, and procedure contains no direct-PR path.

### T3a — Re-render managed/composed root mirrors

- After T2 (template/managed/...) and T3 (template/composed/...) edits — including the T3(f) amendments to `template/managed/INSTRUCTIONS.md` and `template/composed/OPERATIONS.md` — are committed in the content branch, run `harness sync --mode=apply` from the repo root to re-render the root mirrors. Affected mirrors: `OPERATIONS.md` (composed, `harness.config.json:31`), `.github/copilot-instructions.md` (managed, `harness.config.json:22`), and `INSTRUCTIONS.md` (managed, `harness.config.json:17`).
- Verify the rendered roots actually contain the new Hard Rule § 6, the new `## Cross-repo procedures` section, and the scoped C35-13 wording (in both `OPERATIONS.md:91-93` and `INSTRUCTIONS.md:31-42`) before committing.
- Commit the rendered roots in the same content PR as the template edits (do NOT split — drift between template and root mirror would fail `harness sync --mode=check` in CI).
- **Exit criteria:** `git diff` after `harness sync --mode=apply` is empty (mirrors in sync); `OPERATIONS.md`, `.github/copilot-instructions.md`, and `INSTRUCTIONS.md` at repo root carry the new/amended content.

### T4 — File and close LRN-137

- Add LRN-137 to `LEARNINGS.md` with YAML frontmatter conforming to `schemas/learning.schema.json`: `id: LRN-137`, `date: 2026-05-27`, `category: process`, `source_cs: CS55`, `status: open`, `tags: [...]`, and optionally `claim_area`. Do NOT add `applied_in_cs` or any other non-schema field — the schema sets `additionalProperties: false`.
- Body problem/finding/evidence should cite SI PR #79, the three `read-only-gates` failures, the pre-v0.6.0 SI template root cause, and the admin-squash commit `cbaa608b8196e03ebb09e168562501c105930622`.
- At close-out, transition `status: open` to `status: applied` (schema enum is `open|applied|obsolete|deferred`; `closed` is NOT an allowed value). CS linkage continues to be captured by `source_cs: CS55`; reference Hard Rule § 6 and the `OPERATIONS.md` procedure in the entry body, not in frontmatter.
- **Exit criteria:** `node scripts/validate-schemas.mjs` accepts LRN-137 and LRN-137 is transitioned to `status: applied` (per D55-5; `closed` is not in the schema enum) before CS55 close-out merges.

### T5 — Add operating-model context note

- Add a brief `CONTEXT.md` note under the operating-model area.
- Keep it to 2-3 sentences: cross-repo work is issue-only for the harness orchestrator; see Hard Rule § 6 and `OPERATIONS.md § Cross-repo procedures`; consumer agents own their repo's PRs and validation.
- **Exit criteria:** note is discoverable without duplicating the full rule and does not imply any escape hatch.

### T6 — File SI tracking issue (POST-content-merge, PRE-closeout)

- **Timing:** Execute T6 ONLY after the CS55 content PR has merged to `main` (so the issue body can link to the merged commit/tag), and BEFORE the close-out PR opens (so the URL can be recorded in the close-out diff). Do NOT block content-PR review on T6 completion.
- Before creating, search for an existing open SI issue with the planned title terms and label: `gh issue list --repo henrik-me/sub-invaders --label harness-orchestrator --search "[harness:cs55] Adopt v0.6.x cross-repo handoff doctrine in:title"`.
- **Label preflight (D55-3, Copilot R5; refined R9 — non-mutating):** before `gh issue create --label harness-orchestrator`, ensure the label exists in `henrik-me/sub-invaders` without overwriting consumer-owned metadata. Run `gh label create harness-orchestrator --repo henrik-me/sub-invaders --color 0E8A16 --description "Filed by harness orchestrator"` (NO `--force`). If it exits zero, the label was created. If it exits non-zero AND stderr indicates "already exists", treat as success (the SI repo already has a `harness-orchestrator` label with whatever color/description SI has chosen — preserve it). Any other non-zero exit (e.g. HTTP 403) is a real failure; abort T6 and surface the stderr. Without this preflight, `gh issue create --label harness-orchestrator` exits non-zero with "label not found" if SI has not yet adopted the label.
- If absent, create: `gh issue create --repo henrik-me/sub-invaders --title "[harness:cs55] Adopt v0.6.x cross-repo handoff doctrine" --label harness-orchestrator --body-file <body-file>`. (The `[harness:cs<NN>]` title prefix is the stable identifier per CS56 D56-4 amendment; it prevents collision with future cross-repo handoff issues.)
- Body asks the SI agent to run `harness sync` after the CS55 harness PR merges, adopt a reciprocal "I accept work-via-issue-only from harness orchestrator" rule, update SI docs as appropriate, and validate using SI's own harness checks.
- Body links Hard Rule § 6 and `OPERATIONS.md § Cross-repo procedures` at the merged-harness-PR SHA / `v0.6.x` tag.
- Record the issue URL in the active CS file's Notes section; close-out PR carries that URL forward into the done CS file.
- **Exit criteria:** one and only one open SI tracking issue exists, labeled `harness-orchestrator`, title prefixed with `[harness:cs55]`, and the close-out PR diff records its URL.

### T7 — Validate CS55 changes

- Run `harness lint` and expect the current harness lint shape to remain green; if the runner reports counts, record the baseline/actual counts in the active CS file.
- Run `node scripts/validate-schemas.mjs` to verify LRN-137 frontmatter, especially the required `id:` field.
- Run `npm test` because CS55 touches process docs consumed by harness checks; record the test count delta if tests change (expected: no test files changed, so no count increase).
- Run `node scripts/check-templates.mjs --dir template --cwd .` because template files are modified.
- Run `node scripts/check-text-encoding.mjs --dir . --quiet` to scan the whole repo (the script accepts only one `--dir` and is gitignore-aware by default, so a repo-root scan covers `template/`, `LEARNINGS.md`, and `CONTEXT.md` in one invocation without scanning `node_modules` / `.git`).
- **Exit criteria:** all commands exit 0, or any failure is fixed before PR open.

### T8 — Plan-vs-implementation review

- Before the close-out PR, run the GPT-5.5 plan-vs-implementation review per `OPERATIONS.md § Plan-vs-implementation review (close-out gate)`.
- The reviewer must be independent from the implementer model(s); implementer self-review carries no review weight.
- Record the review in `## Plan-vs-implementation review` in the active CS file.
- **Exit criteria:** review verdict is not NEEDS-FIX; any findings are addressed or explicitly dispositioned before close-out.

### T9 — Close out CS55

- Rename `project/clickstops/active/active_cs55_cross-repo-handoff-doctrine.md` to `project/clickstops/done/done_cs55_cross-repo-handoff-doctrine.md`.
- Update `WORKBOARD.md` to remove the active row or mark done per current workboard convention.
- Transition LRN-137 to `status: applied` (per D55-5 / T4 — `closed` is not in the schema enum; `applied_in_cs` is rejected by `additionalProperties: false`). CS linkage remains in `source_cs: CS55`.
- Refresh `CONTEXT.md` if the operating-model note needs final PR/tag links.
- **Exit criteria:** done CS file exists with plan-vs-implementation review recorded, WORKBOARD is clean, LRN-137 is at `status: applied` (per D55-5; `closed` is not in the schema enum), and validation still passes.

## Validation

- `git status --short` before PR open and close-out shows only CS55-owned files for the current step and nothing staged unexpectedly.
- `harness lint` exits 0; record any reported check counts in the active CS file.
- `node scripts/validate-schemas.mjs` exits 0 and accepts LRN-137 frontmatter.
- `node scripts/check-templates.mjs --dir template --cwd .` exits 0 after edits under `template/`.
- `node scripts/check-text-encoding.mjs --dir . --quiet` exits 0 (single `--dir` per script; repo-root scan with default gitignore-awareness covers all owned paths).
- `npm test` exits 0; expected test count delta is `0` unless implementation discovers a necessary docs-linter regression test.
- Manual review confirms Hard Rule § 6 is inserted after § 5, `OPERATIONS.md` has exactly one `## Cross-repo procedures` H2, and the SI issue body demonstrates the new issue-only pattern.

## Plan-vs-implementation review

_(To be filled after content PR merges, before close-out PR. Per OPERATIONS.md § Plan-vs-implementation review (close-out gate).)_

## Notes / Learnings

- CS55 deliberately supersedes the earlier session-plan escape-hatch wording: the user confirmed no orchestrator escape hatch for this doctrine.
- CS55 and CS56 are separate plans. CS55 is doc-only; CS56 owns any CLI guardrail work.
- Existing `template/composed/OPERATIONS.md` has no `## Cross-repo procedures` H2 at plan time, so CS55 implementation should expect to create it unless CS54 lands first.
