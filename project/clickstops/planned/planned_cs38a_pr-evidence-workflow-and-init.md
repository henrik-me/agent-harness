# CS38a — `pr-evidence-lint.yml` workflow + composed PR template + `--enable-review-gates` init

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** Pre-CS38a disposition of [#145](https://github.com/henrik-me/agent-harness/issues/145) Phase 1. Authored 2026-05-12 by `yoga-ah`. Fourth CS in the v0.4.0 arc.
**Depends on:** [CS36](planned_cs36_pr-evidence-fs-and-git-linters.md), [CS37](planned_cs37_copilot-review-gate-graphql.md), [CS35](planned_cs35_enforcement-doctrine-and-planning-locality.md) (C35-7/8/9/15).

## Goal

Wire the `harness pr-evidence` linters (CS36 + CS37) into a CI workflow that consumers can opt into via `harness init --enable-review-gates`. Migrate the PR template from `managed` to `composed` so consumers can keep their project-specific PR-template content while picking up the doctrine-required Review log + Model audit skeleton blocks. Add the `review_gates` config schema. Generate (do NOT silently apply) a "branch-protection required-checks" instruction block.

## Background

CS36 and CS37 ship the linters but they're invoked manually. To prevent recurrence at consumer sites, the linters need to run automatically on every PR. The natural surface is a GitHub Actions workflow.

Two non-trivial wiring concerns:

1. **PR template migration**: existing consumers have `.github/pull_request_template.md` classified as **managed** (harness overwrites in full on every sync). Consumers commonly customize PR templates with project-specific checklists. To inject doctrine-required `## Review log` / `## Model audit` skeleton blocks without erasing customization, the file must move from `managed` to `composed` (marker-block injection, consumer keeps surrounding content). This requires a one-time file-class transition.
2. **Permissions split**: the workflow has two jobs with very different permission needs. The read-only gates (B1/A3/A4) need only `contents: read`. The Copilot-mutation gate (A16) needs `pull-requests: write` AND maintainer authority — but `pull_request` from forks restricts `GITHUB_TOKEN`. Per C35-9/10, mutation runs only via `workflow_dispatch` from maintainers; CI's job is verification (read-only).

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C38a-1 | Workflow filename | `template/managed/.github/workflows/pr-evidence-lint.yml`. | Standard `template/managed/.github/workflows/` location; consumer's `harness sync` lands it in `.github/workflows/`. |
| C38a-2 | Job split | Job 1 `read-only-gates` (`contents: read`, `pull-requests: read`): runs B1, A3, A4, A16-verify. Job 2 `mutation-engage` (`pull-requests: write`): triggered only via `workflow_dispatch`. | Per C35-9/10. Forks can run Job 1; Job 2 is maintainer-only. |
| C38a-3 | Workflow trigger | Job 1: `pull_request: [opened, synchronize, reopened, edited]` (per LRN-100). Job 2: `workflow_dispatch: { inputs: { pr_number: { required: true } } }`. | LRN-100 says PR-body edits must re-trigger; same applies here. |
| C38a-4 | PR template migration | `composed.overrides` is an OBJECT MAP keyed by file path (per `schemas/harness.config.schema.json:285-300`), NOT an array. Migration shape: the file moves from the `managed.files` array to the `composed.files` array; an entry is added to `composed.overrides[".github/pull_request_template.md"]` with `{ "_inherited_class": "managed", "local_blocks": ["pull-request.body"] }`. The `_inherited_class` field signals to the sync engine that this file was previously managed and may have consumer customization outside the marker block — preserve all content not inside `<!-- harness:review-evidence:start --> ... <!-- harness:review-evidence:end -->` markers. Migration sync test verifies a consumer config with the file in `managed.files` round-trips cleanly to the new shape on first sync after upgrade. | Per GPT-5.5 review BLOCKING #2: original spec used wrong shape (array). Corrected to match actual schema. |
| C38a-5 | PR template skeleton | Composed marker block at top of `template/composed/.github/pull_request_template.md`: `<!-- harness:review-evidence:start -->` ... `<!-- harness:review-evidence:end -->` containing empty `## Review log` and `## Model audit` H2 sections with column headers. Consumers free to add content above/below the markers. | Composed-block convention already used elsewhere in the codebase. |
| C38a-6 | `review_gates` config schema | `harness.config.json` gains `review_gates: { enabled: bool, copilot_required: bool, gate_set: ["B1","A3","A4","A5","A16"] }`. Default if absent: `{ enabled: false, copilot_required: false, gate_set: [] }` (opt-in for v0.4.0 per C35-15). `harness init --enable-review-gates` writes `{ enabled: true, copilot_required: true, gate_set: <conditional set per C37-1b> }`. **Per C37-1b**: if CS37 spike PASS, `gate_set: ["B1","A3","A4","A5","A16"]`; if PARTIAL with A5 deferred, `gate_set: ["B1","A3","A4","A16"]`; if FAIL, `gate_set: ["B1","A3","A4"]` and `copilot_required: false`. The init command checks the CS37 close-out artefact (or a `--graphql-spike-outcome` override flag) to determine the gate set. | Explicit field; sync warns on missing in v0.5.0; CS41 flips the default. Degradation-aware per C37-1b. |
| C38a-7 | Init flag | `bin/harness.mjs init` gains `--enable-review-gates` flag that writes the `review_gates` block AND lands the workflow file AND emits the branch-protection instruction block. | Single command, one composed effect. |
| C38a-8 | Branch-protection instructions | `harness init --enable-review-gates` prints (does NOT apply) a markdown block listing required status checks to add manually: "Add to your branch ruleset: status checks `pr-evidence-lint / read-only-gates`. See https://docs.github.com/.../branch-rulesets ." Idempotent — same output on re-invocation. | Per rubber-duck non-blocking 5: don't silently mutate rulesets. Operator authority required. |
| C38a-9 | Sync drift reporting | `harness sync --mode=check` warns (NOT errors) if `review_gates` is absent in v0.4.0; errors in v0.5.0 (per C41). | Migration ramp; consumers have one release to opt in cleanly. |
| C38a-10 | Bot / fork / workboard label predicates (centralized via C35-19) | Workflow's first step computes a `SKIP_REASONS` env var from the GitHub event payload (`labels.*.name`, `user.login`, `head.repo.full_name == base.repo.full_name`). The `harness pr-evidence` invocation receives `--skip-reasons "$SKIP_REASONS"` per C36-5. The harness CLI alone decides which gates to skip — workflow does NOT have its own `if:` predicates beyond label-based total-skip (`workboard-only`). For fork-source: the workflow runs `pr-evidence` with `--skip-reasons fork-source`; the linter exits 0 for read-only gates and exits 2 for the Copilot mutation gate; the workflow step has `continue-on-error: false` for read-only and a separate step with `continue-on-error: true` + `id: copilot-gate` for the mutation; a final aggregate step reads `steps.copilot-gate.outcome` and emits a workflow annotation `Notice: Copilot review gate skipped (fork PR; maintainer must manually rerun via workflow_dispatch)` without failing the job. | Per C35-19 + GPT-5.5 NON-BLOCKING #3 (exit-code mapping). Centralized skip semantics; explicit fork annotation pattern. |

## Deliverables

1. **`template/managed/.github/workflows/pr-evidence-lint.yml`** (new): two jobs per C38a-2/3/10; uses `actions/checkout@v4` with `fetch-depth: 0` (B1 needs full history); installs the harness via the canonical pattern used by every other workflow in this repo: derive `CLI_REF` from `harness.config.json.version`; clone `henrik-me/agent-harness` to a tempdir using the `GITHUB_TOKEN`-rewritten URL; `npm ci`; invoke `node $TMP/agent-harness/bin/harness.mjs pr-evidence --base ${{ github.event.pull_request.base.sha }} --head ${{ github.event.pull_request.head.sha }} --pr-body <(gh pr view ${{ github.event.pull_request.number }} --json body --jq .body) --skip-reasons "$SKIP_REASONS"`. Reference workflow patterns: `.github/workflows/harness-checks.yml:104-120` and `.github/workflows/private-smoke.yml:75-105`. Bare `npx harness pr-evidence` MUST NOT be used — the package is private and `npx harness` is not an installable shortcut. | Per GPT-5.5 BLOCKING #3: original `npx harness pr-evidence` invocation is not executable.
2. **`template/composed/.github/pull_request_template.md`** (new) + **classification change** in `harness.config.json` schema: file moves from `managed` to `composed` with marker block per C38a-5.
3. **Schema**: `schemas/harness.config.schema.json` adds `review_gates` block per C38a-6. Includes JSON Schema validation + helpful descriptions.
4. **`bin/harness.mjs`**: `init` gains `--enable-review-gates` per C38a-7; emits instruction block per C38a-8.
5. **Migration**: `lib/file-class-migration.mjs` (new, or extend existing sync logic) handles `managed → composed` transition for the PR template; sync writes `composed.overrides[]` entry on first encounter; doesn't overwrite consumer content within markers on subsequent syncs.
6. **Tests**:
   - `tests/template-pr-evidence-workflow.test.mjs`: workflow YAML shape (jobs, triggers, permissions, `if:` predicates) — pattern from `tests/cs12-workflows.test.mjs`.
   - `tests/init-enable-review-gates.test.mjs`: `harness init --enable-review-gates` writes config + workflow + emits instructions.
   - `tests/file-class-migration.test.mjs`: managed→composed roundtrip.
   - `tests/schema-review-gates.test.mjs`: schema validation accepts/rejects expected shapes.
7. **OPERATIONS.md**: § Init — document the `--enable-review-gates` opt-in path. § Sync — document the v0.4.0 warn → v0.5.0 error escalation.
8. **CHANGELOG.md** `[Unreleased] / Added` + `[Unreleased] / Changed` entries (file-class transition is a Changed).

## Sub-agent fan-out

2 sub-agents:

- **SA-1 (`bot38a-workflow`)** — owns `template/managed/.github/workflows/pr-evidence-lint.yml` + `tests/template-pr-evidence-workflow.test.mjs`. Coordination: must use `npx harness pr-evidence` invocation pattern (CS36).
- **SA-2 (`bot38a-init-and-migration`)** — owns `bin/harness.mjs init` flag + `lib/file-class-migration.mjs` + schema update + the three init/migration/schema tests + `template/composed/.github/pull_request_template.md`.

Orchestrator owns OPERATIONS.md / CHANGELOG.md edits.

## Exit criteria

1. `template/managed/.github/workflows/pr-evidence-lint.yml` lands; YAML parses; jobs + triggers + permissions match C38a-2/3.
2. PR template successfully migrates from managed to composed; consumer-content preservation verified by test.
3. `harness init --enable-review-gates` (against a fresh tempdir) writes config + workflow + emits the instruction block exactly once.
4. `harness sync --mode=check` against the harness repo itself: warn (NOT error) when `review_gates` absent.
5. `node --test tests/*.test.mjs` total = prior + ≥10.
6. `harness lint --quiet` and sync drift checks pass.
7. Plan-vs-implementation review `Go`.

## Risks + open questions

- **R1 (medium):** File-class transition is novel. Mitigation: dedicated test file + migration script + explicit CHANGELOG note + CS38b's retroactive self-test exposes any drift.
- **R2 (low):** Workflow may exceed Actions minutes on busy consumers. Mitigation: read-only job is fast (~30s); mutation job is workflow_dispatch only.
- **OQ1:** Should `--enable-review-gates` also opt the consumer's existing PRs into the gate via a backfill comment? **Default:** no — too invasive. Consumer can manually re-trigger CI on open PRs after enabling.

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time) | planned | — | — |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out)_
