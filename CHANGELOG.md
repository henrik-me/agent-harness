# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versioning policy and release process: see [OPERATIONS.md § Release process](OPERATIONS.md).

## [Unreleased]

### Added

- **CS51 / [#140](https://github.com/henrik-me/agent-harness/issues/140):** Add REVIEWS.md PR-side enforcement gates (`review-log-evidence`, `copilot-review-attached`, `independence-invariant`, `review-threads-resolved`), workflow template, config/ruleset sync hooks, and regression tests.
- **CS52 / [#141](https://github.com/henrik-me/agent-harness/issues/141):** Add `harness review <pr>` as the canonical content-PR review orchestrator. The new CLI validates content PRs, enforces reviewer independence, composes the manual rubber-duck prompt, can trigger/poll Copilot review, and updates PR-body `## Review log` / `## Model audit` evidence; schema, docs, and regression tests cover the new `reviews` config block and exit-code contract.
- **CS50 / [#138](https://github.com/henrik-me/agent-harness/issues/138):** Add an optional `WORKBOARD_MERGE_TOKEN` PAT admin-bypass fallback for validated workboard-only PRs so consumer repos without the G3 App can claim/close out without human admin merges.

### Changed

- **CS48 / [#142](https://github.com/henrik-me/agent-harness/issues/142):** Dispatch reporting now states that implementer self-review carries zero review weight, replaces implementer review evidence with `Implementer model used` provenance, extends the clickstop implementer-not-reviewer lint rule to model overlap, and adds LRN-127 + regression coverage anchored to the Sub Invaders PR #28 review-evidence incident.
- **CS49 / [#139](https://github.com/henrik-me/agent-harness/issues/139):** Codify orchestrator availability, 15 wall-minute sub-agent progress/stall reporting, and Workboard-first status for out-of-CS work in OPERATIONS.md; add regression coverage and LRN-126.
- **chore ([PR #200](https://github.com/henrik-me/agent-harness/pull/200)):** `scripts/check-pack.mjs` `DEFAULT_MAX_SIZE_BYTES` raised from 1MB (1048576) to 2MB (2097152). The accumulated CS49 + CS50 + CS51 + CS52 doctrine additions to OPERATIONS.md pushed the published `npm pack` size past the 1MB ceiling; bumping the default avoids gating release on doctrine growth. Tests still pin the violation path because they pass `--max-size-bytes 1` explicitly. Filed as LRN-128.

### Documentation

- **CS47 plan-filing ([PR #202](https://github.com/henrik-me/agent-harness/pull/202)):** File `project/clickstops/planned/planned_cs47_detached-head-investigation.md` per pre-claim disposition of LRN-124 (working-tree-loss doctrine). The plan investigates which `harness` CLI subcommand silently leaves HEAD detached at the most-recent release tag (5 confirmed live reproductions across CS46 + this PR; deterministic detach target = `v0.5.1` = `fe2c0b9`; offender is a SHARED helper called from at least `harness lint`, `harness plan-review-hash`, and `harness sync --mode=check`). Plan review: R1 Needs-Fix → R2 Go-with-amendments + R3 (Copilot R1 PRR-1..5 absorbed). No code changes; CS47 itself is the follow-up implementation work.

### Removed

- _(none yet)_

## [0.5.2] — 2026-05-14

### Changed

- **CS46 / [#146](https://github.com/henrik-me/agent-harness/issues/146):** Surface canonical formats for two harness-enforced constraints to remove the first-encounter CI roundtrip:
  - `template/seeded/WORKBOARD.md`: replace the em-dash placeholder row in `## Active Work` with the **header-only canonical empty state** + an HTML comment documenting both accepted forms (header-only OR single em-dash row with "no active CS" in Title) and the `_(none)_` anti-pattern. The em-dash variant remains accepted by `check-workboard.mjs` for backward compatibility — no behavior change to the linter contract.
  - `template/composed/OPERATIONS.md` § Plan-vs-implementation review (close-out gate): add an explicit **field labels are matched verbatim** callout enumerating `**Reviewer:**`, `**Date:**`, `**Outcome:**` and naming `**Verdict:**` as a common (failing) alias.
  - `template/managed/TRACKING.md` CS file front-matter skeleton: append a close-out gate reminder pointing consumers at the canonical Plan-vs-impl review skeleton in OPERATIONS.md so the TRACKING copy-paste path doesn't omit the close-out gate.
  - `scripts/check-workboard.mjs` invalid-CS-Task-ID error: extend the message with a self-documenting hint pointing at the two valid empty-state forms + the canonical seeded template path.
  - `scripts/check-clickstop.mjs` Plan-vs-impl review error: extend with verbatim labels enumerated + cross-link to the OPERATIONS.md skeleton.
  - New regression test `tests/cs46-empty-state-and-review-discoverability.test.mjs` (6 fixture-based tests including a fresh-init E2E acceptance check per issue #146 AC #1, AND a mechanical doc-drift guard asserting the canonical OPERATIONS.md skeleton + verbatim-labels callout body contains all required labels; all scratch dirs use `os.tmpdir()` per LRN-094). Per Decisions C46-1 through C46-9.

- **CS43:** `scripts/check-clickstop-implementer-not-reviewer.mjs` — the linter now recurses one level into nested clickstop subdirectories of the form `^(planned|active|done)_cs\d+[a-z]*_.*$` so multi-file CS bundles (e.g. `done_cs11_self-host/done_cs11_self-host.md`) are scanned in addition to the historical flat layout. CS-shaped filenames (`^(planned|active|done)_cs\d+[a-z]*_.*\.md$`) are linted; auxiliary docs alongside (e.g. `harness-cs-plan.md`) are ignored. Both regexes use `[a-z]*` (multi-letter suffix) to match the canonical pattern in `scripts/check-clickstop.mjs`. Adds a date-gate at `IMPLEMENTER_NOT_REVIEWER_RECURSION_ENFORCEMENT_DATE = '2026-05-14'`: pre-enforcement CS files (close date strictly before the threshold) are silently grandfathered; unparseable close dates emit a single WARN and skip; missing close dates lint normally (deferring missing-field complaints to `check-clickstop.mjs`). Live self-verify on the harness repo: 0 errors, 9 warnings (3 of 4 named pre-CS35 nested folders silently grandfathered; 1 cs22 WARN due to an em-dash close-date — pre-existing data anomaly, non-blocking). Per Decisions C43-1 through C43-5.
- **CS44:** `OPERATIONS.md` § Copilot engagement procedure (and its composed mirror `template/composed/OPERATIONS.md`) replace the stale `node`-by-login GraphQL fragment wording with the canonical `node(id: $id) { ... on Bot { databaseId login } }` fragment + the hardcoded Copilot Bot node ID `BOT_kgDOCnlnWA` actually shipped in `lib/copilot-engage.mjs`. Adds a cross-link to LRN-009 + ADR-0004 § ADR4-2 explaining why the hardcoded ID is required (`user(login: 'copilot-pull-request-reviewer')` returns `null` per the CS37 GraphQL spike). New regression test `tests/cs44-docs-impl-alignment.test.mjs` is the doc-drift watchdog that asserts all four touchpoints (lib, composed/OPERATIONS, root OPERATIONS, CHANGELOG) reference both `node(id:` AND `BOT_kgDOCnlnWA`. Per Decisions C44-1 through C44-7.
- **CS45:** `lib/copilot-engage.mjs` `resolveCopilotIdentity()` now wraps the `mkdir`/`writeFile` cache-write seam in a typed-error envelope: filesystem failures (EACCES, ENOSPC, EROFS, etc.) rethrow as `EngageError(kind: 'cache-write-failed', cause: <originalError>)` with the underlying `err.syscall` in the message instead of leaking raw fs error stacks. `bin/harness.mjs cmdCopilotEngage` adds a dedicated catch branch printing a `--cache-dir <writable-path>` hint and exiting with code **5** (lowest free positive integer; existing codes 0/2/3/4 in use for success/bad-input/timeout/auth-missing+network). `OPERATIONS.md` § Copilot engagement procedure gains a Troubleshooting subsection documenting the new exit code + `--cache-dir` escape hatch. Per Decisions C45-1 through C45-7; new lesson [LRN-123](LEARNINGS.md#lrn-123) records the broader doctrine ("audit every syscall on the cold path when introducing a typed-error class").

### Fixed

- **CS23 / [LRN-100](https://github.com/henrik-me/agent-harness/blob/main/LEARNINGS.md#lrn-100):** `.github/workflows/harness-self-check.yml` `pull_request:` trigger now includes `types: [opened, synchronize, reopened, edited]` so `gh pr edit --body` re-fires the `pr-body` job — orchestrators no longer need to manually `gh run rerun --failed` after fixing a body-only failure. Adds `tests/cs23-pr-body-trigger.test.mjs` to mechanically lock the trigger contract.

### Removed

- _(none yet)_

## [0.5.1] — 2026-05-14

### Changed

- **Bugfix [#183](https://github.com/henrik-me/agent-harness/issues/183):** `scripts/check-cs-plan.mjs` — two narrow fixes for the `cs-plan` linter that surfaced as 29 false positives across 8 SI CS files when `henrik-me/sub-invaders` bumped the harness pin from `v0.3.1` to `v0.5.0`:
  - **Gap A — defaults too aggressive.** `DEFAULT_FORBIDDEN_PREFIXES` shrunk from 5 entries (`template/composed/`, `template/seeded/`, `lib/`, `bin/`, `scripts/`) to 3 unambiguously harness-only entries (`template/composed/`, `template/seeded/`, `template/managed/`). The dropped prefixes — `lib/`, `bin/`, `scripts/` — collide with universal consumer-repo dir names (SI has all three; nearly every Node consumer has at least `scripts/`). Consumers who DO want the stricter pre-#183 coverage can opt back in via `harness.config.json → cs_plan_lint.forbidden_path_prefixes` (the override semantics already worked correctly; this change only tightens the default).
  - **Gap B — inline code spans were not exempt.** The matcher now strips backtick-delimited inline code spans (`` `template/composed/foo` ``, `` ``with embedded text`` ``, etc.) before scanning each line, in addition to the existing fenced-code-block and harness-GitHub-URL exemptions. Inline code is the natural way humans reference paths in prose and learning entries; the prior behavior flagged correctly-fenced inline references as violations. Triple-backtick fenced blocks remain exempt as before; unmatched backticks leave the line scanned normally.
  - **Schema + docs aligned.** `schemas/harness.config.schema.json` description and `harness lint --explain cs-plan` text both updated with the new defaults and the inline-code-span exemption note. SI can now drop the `cs_plan_lint.forbidden_path_prefixes` override they added as a v0.5.0 workaround.
  - +3 regression tests (#9 default-prefix scope-narrowing, #10 opt-in restores lib/ enforcement, #11 inline-code spans exempt across single-/double-/triple-backtick forms); existing tests #2 / #7 / #8 + the `planned_cs02` fixture migrated from `lib/` to `template/managed/`. Self-host `harness lint --quiet` continues at 29/0/3.
  - Shipped via [PR #184](https://github.com/henrik-me/agent-harness/pull/184) at squash `6750047`.

## [0.5.0] — 2026-05-14

### Added

- **CS41:** `harness copilot-engage <pr-number>` subcommand + `lib/copilot-engage.mjs` library — wraps the documented Copilot review-engagement primitive (`gh pr edit --add-reviewer copilot-pull-request-reviewer` per ADR-0004 § ADR4-2) so orchestrators no longer hand-craft GraphQL invocations. Auto-detects `--repo` from `git remote origin url`. Resolves Copilot's Bot node ID via the `node(id: $id) { ... on Bot { databaseId login } }` GraphQL fragment with the hardcoded Copilot Bot node ID `BOT_kgDOCnlnWA` (cached 7d at `~/.cache/harness/copilot-id.json` per C41-2; the hardcoded ID is required because `user(login: 'copilot-pull-request-reviewer')` returns `null` per the CS37 GraphQL spike — see [LRN-009](LEARNINGS.md#lrn-009) and [ADR-0004 § ADR4-2](docs/adr/0004-copilot-graphql-spike.md#adr4-2)). Polls reviews every 30s until at least one Bot review by `copilot-pull-request-reviewer` lands at the current PR head with state ∈ {APPROVED, COMMENTED, CHANGES_REQUESTED} **and submitted at or after the engage-request timestamp** (or the explicit `--submitted-after <iso>` floor if provided); the implicit submitted-after floor enforces the A5 ordering doctrine — a stale Copilot review on the same HEAD that predates the engage request MUST NOT satisfy the gate. `--no-poll` short-circuits after the request for CI usage. Exits 2 on fork PRs (`isCrossRepository == true`) per ADR4-6. The poll predicate matches `scripts/check-copilot-review.mjs` exactly so "engage CLI satisfied" = "A5+A16 gate satisfied". Per Decisions C41-1 / C41-2 / C41-3 / C41-4.
- **CS41:** `scripts/check-clickstop-implementer-not-reviewer.mjs` — new self-host-guarded linter that scans `project/clickstops/{active,done}/*.md`, parses each `## Model audit` block, and fails when `Implementer agent` ≡ `Reviewer agent` (case-insensitive). Mirrors the model-independence invariant from CS35 C35-2 at the agent-identity level (CS35 C35-18). Default behaviour: missing columns → WARNING (one-cycle migration ramp); `--strict-agent-columns` → missing columns become errors. Registered in `harness lint`. Per Decisions C41-5 / C41-6.
- **CS41:** `Implementer agent` + `Reviewer agent` columns now first-class in the `## Model audit` schema. `scripts/check-review-evidence.mjs` parser extended to ingest both rows; new `--strict-agent-columns` flag (default false in v0.5.0; flips true in v0.6.0 per C42-6 strict-flip plan) controls the missing-column severity. PR template (`template/managed/.github/pull_request_template.md`) gains the two new placeholder rows. REVIEWS.md and the composed mirror align the schema prose with the new enforcement. Per Decisions C41-6 / Deliverable 7.
- **CS41:** OPERATIONS.md § Copilot engagement procedure replaces the manual `gh api graphql` recipe with the recommended `harness copilot-engage` invocation; preserves the manual fallback as a documented escape hatch. Adds the A5-ordering doctrine reconfirmation from CS40 PR #172 (each new HEAD requires a new R-row with timestamp BEFORE the most-recent Copilot review's `submittedAt`).
- **CS40:** `harness review-output` subcommand + `scripts/check-review-output.mjs` linter — validates a reviewer's output markdown against the CS40 schema (Analyzed-HEAD line, R1/Rn per-file enumeration vs `git diff --name-only`, finding-row shape `[Blocking|Non-blocking|Suggestion] <file>:<line>: <desc>`, verdict line). Closes [#145](https://github.com/henrik-me/agent-harness/issues/145) gap #3 (PR #28's reviewer summary-passed YAML / package.json without per-file analysis). Exit codes: 0 pass / 1 error / 2 bad usage. Optional `--update-pr` flag idempotently posts the parsed output as a row in the PR body's `## Review log` (canonical 6-column schema per REVIEWS.md §2.7: `timestamp | analyzed_head | actor | model | verdict | evidence_link`; dedup key `analyzed_head + actor + model + verdict`; columns parsed by header so a future column reorder won't silently break it). New `--actor` and `--evidence-link` flags expose the canonical row's actor / evidence_link cells. Optional independence-invariant guard (`--repo`/`--pr`/`--reviewer-model`) parses the PR body's `## Model audit` (canonical `| Field | Value |` schema per REVIEWS.md §2.8) and re-asserts that the reviewer model is NOT in the implementer set, case-insensitive. Per C40-8, this linter is NOT registered with `harness pr-evidence` — it requires the reviewer-output file which is unavailable in CI; orchestrators invoke it locally after capturing reviewer output.
- **CS40:** OPERATIONS.md § Reviewer dispatch gains a new `### Post-review validation` subsection documenting the `harness review-output` invocation contract.
- **CS40:** Tests — `tests/check-review-output.test.mjs` (16 cases) + `tests/cli-review-output.test.mjs` (4 cases) covering R1 happy path, R1 missing/extra files, R1 root-level extensionless files (Makefile/LICENSE/Dockerfile), Rn delta semantics with/without `--prev-head`, malformed verdict line, malformed finding row, missing Analyzed-HEAD, Verdict-Needs-Fix-without-findings, Analyzed-HEAD mismatch warning, JSON output, independence-invariant guard violation (with injected fake-`gh`), `--update-pr` idempotency (with injected fake-`gh` round-trip), `--update-pr` byte-exact preservation of `$`-patterns in PR body (regression for `String.prototype.replace` `$&` interpretation), CLI route + help dispatch.

### Changed

- **CS41:** `harness.config.json` `review_gates` block defaults to `enabled: true` for fresh `harness init` invocations (was opt-in via `--enable-review-gates` in v0.4.0). New `_opt_out_reason: "<string>"` field on the `review_gates` block lets consumers explicitly opt out; `harness sync --mode=check` now ERRORS when `review_gates` is absent OR `enabled: false` without `_opt_out_reason`. Existing repos that ran `harness init --enable-review-gates` are unaffected; repos that never opted in must either opt-in (recommended) or set `_opt_out_reason`. Schema (`schemas/harness.config.schema.json`) and tests (`tests/sync-review-gates-default-flip.test.mjs`) updated. Per Decisions C41-7 / C41-8.
- **CS42:** `scripts/check-clickstop-plan-review.mjs --strict` default flips from `false` (v0.4.0 warn-only) to `true` (v0.5.0 error) per CS35b-10 migration ramp. Local `harness lint` invocations now ERROR rather than WARN on missing/stale `## Plan review` attestations on planned/active CS files. (The PR-time A6 gate via `harness pr-evidence` was already strict from v0.4.0; this change brings local lint into alignment.) **Migration:** any consumer with planned/active CS files lacking the `## Plan review` section will start failing `harness lint` at v0.5.0 — they MUST either backfill the attestation OR pass `--strict=false` explicitly with a documented reason. The harness's own self-host repo had retroactive grandfathering applied during CS35b, so the post-flip `harness lint --quiet` continues at 29/0/3. Per Decision C42-7.

## [0.4.0] — 2026-05-13

### Added

- **CS38b:** Retroactive `henrik-me/sub-invaders#28` self-test + harness self-host opt-in:
  - `docs/cs38b-retro-pr28-transcript.md` — verbatim re-run of `harness pr-evidence` against SI PR #28 (the canonical #145 reference failure case). All 6 documented failures (F1–F6) reproduced; **5 distinct doctrine failures** observed (B1×4 commits, A3 review-log shape, A3 model-audit shape, A4/A16 stale Copilot review, A5 ordering — subsumed by stale check). Per **C38b-5 PASS branch**: required ≥4. ✓ PASS.
  - `tests/fixtures/si-pr28/` — network-free regression fixture: `repo.bundle` (~316 KB git bundle of `e5e5b73a..ec26adf1` + ancestors), `pr.json`, `body.md`, `expected-evidence.json`, `README.md` documenting the LRN-094 + LRN-111 invariants. Anyone can re-run the fixture deterministically without GitHub network.
  - `tests/retro-si-pr28.test.mjs` (NEW; 3 tests) — clones the bundle into `os.tmpdir()` (per LRN-094), runs `harness pr-evidence`, asserts JSON-shape stability + ≥4 distinct gate failures with each assertion citing its Decision ID + REVIEWS.md anchor (per LRN-111).
  - **Harness self-host opt-in**: ran `harness init --enable-review-gates` against the harness repo itself. Patches:
    - `harness.config.json` — added `review_gates: { enabled: true, copilot_required: true, gate_set: ['B1','A3','A4','A5','A16'] }`; migrated `.github/pull_request_template.md` from `managed.files` to `composed.files` with `_inherited_class: 'managed'` + `local_blocks: ['pull-request.review-evidence']`; added `.github/workflows/pr-evidence-lint.yml` to `managed.files`; added `.harness-known-constraints.md` to `seeded.files` (closes orphan-classification gap surfaced by `tests/cs11-self-host-config.test.mjs`).
    - `.github/workflows/pr-evidence-lint.yml` — landed in the harness's own `.github/workflows/` (live workflow; will fire on all subsequent harness PRs).
    - `.github/pull_request_template.md` — appended the `<!-- harness:local-start id=pull-request.review-evidence -->` block with canonical `## Model audit` (key-value `Field | Value`) + `## Review log` (`timestamp | analyzed_head | actor | model | verdict | evidence_link`) tables per REVIEWS.md §2.7/§2.8.
    - `.harness-known-constraints.md` — generated by init (tier `public`).
    - `CONTEXT.md` — added `## Constraints` reference per init scaffold.
    - Branch-protection (`pr-evidence-lint / read-only-gates` required check on `main`) — manual maintainer step per C38a-8; instructions emitted by init, not auto-applied.
  - **Latent-violation triage** (last 10 merged harness PRs): 7 content PRs + 3 workboard-only PRs. Workboard-only PRs short-circuit per C35-19. Of the 7 content PRs (#157, #158, #159, #160, #161, #162, #163): all pass B1 (commit-trailers) + A6 (plan-review-attestation, diff-scoped); 6/7 fail A3+A4 (PR body schema was hardening through CS36/CS37/CS38a); 7/7 fail A5+A16 (Copilot-review gate did not exist yet — A5+A16 enforcement landed mid-arc in PR #160). **Disposition (per C38b-3 (b)):** grandfather all 7 — see [LRN-112](LEARNINGS.md#lrn-112) for the in-arc retroactive grandfathering notice. CS38b's own PR and onwards must comply.
  - Per Decisions C38b-1 through C38b-5.

- **CS38a:** PR-evidence CI workflow + composed PR template + `harness init --enable-review-gates` opt-in:
  - `template/managed/.github/workflows/pr-evidence-lint.yml` — managed CI workflow that wires `harness pr-evidence` into every consumer PR. Split into TWO jobs per [ADR4-8](docs/adr/0004-copilot-graphql-spike.md): `read-only-gates` (runs on `pull_request: [opened, synchronize, reopened, edited]` per LRN-100; permissions `contents: read, pull-requests: read`; computes `--skip-reasons` from event payload) and `mutation-engage` (runs on `workflow_dispatch` only with `pr_number` input; permissions `pull-requests: write`; calls `gh pr edit --add-reviewer copilot-pull-request-reviewer` per ADR4-2). Engagement and verification MUST live on separate events because Copilot delivers reviews asynchronously (~3 min). Uses the canonical clone-then-`node bin/harness.mjs` install pattern (NOT `npx harness@<ref>` — npm 10.8.x's GitFetcher regression makes `npx` invocation flaky); derive-ref step validates against the allowlist `^[a-zA-Z0-9._/-]+$` per CS12 R1 shell-injection hardening.
  - `template/composed/.github/pull_request_template.md` (NEW; composed file class) — replaces the previous `managed`-class PR template. Carries the harness-managed marker block `<!-- harness:local-start id=pull-request.review-evidence --> ... <!-- harness:local-end id=pull-request.review-evidence -->` containing the `## Model audit` + `## Review log` tables that CS37's A5+A16 + CS36's A3+A4 read. Consumer prose outside the marker block is preserved across `harness sync`.
  - `lib/file-class-migration.mjs` (NEW) — pure migration helper. Exports `migrateFileClass(config, filePath, options)` (returns a NEW config; deep-clone safe; idempotent — no-op on already-migrated configs) and `validateMigratable(config, filePath)` (returns `{ ok, reason }`). Used by `harness init --enable-review-gates` to move `.github/pull_request_template.md` from `managed.files` to `composed.files` with `_inherited_class: 'managed'` recorded for audit.
  - `schemas/harness.config.schema.json` — additive `review_gates` block: `{ enabled: bool (default false), copilot_required: bool (default false), gate_set: array of enum ['B1','A2','A3','A4','A5','A6','A16'] }`. Default opt-out in v0.4.0 (per C35-15). No schema version bump (additive only).
  - `harness init --enable-review-gates` — opt-in flag. Patches `harness.config.json` with the `review_gates` block (default `enabled: true, copilot_required: true, gate_set: ['B1','A3','A4','A5','A16','A6']` — the CS37 PASS-branch gate set per ADR4-1), migrates `.github/pull_request_template.md` to composed, and prints a branch-protection instruction block. Idempotent. The branch-protection step is intentionally manual per C38a-8 — the harness CLI does not assume maintainer authority to apply branch rulesets remotely.
  - `OPERATIONS.md` + lockstep template: new `## Init` section documenting `--enable-review-gates`; `## Sync` section gains a `### review_gates block currency` subsection documenting the v0.4.0 WARN → v0.5.0 ERROR escalation path; CS37's A5+A16 row added to the PR-evidence § Gates registered table; CS38a Canonical CI invocation section refreshed with the actual two-job workflow shape (replacing the earlier placeholder reference).
  - Per Decisions C38a-1 through C38a-10.

- **CS37:** GraphQL primitive + Copilot review gate — closes A5 + A16 enforcement on PR-evidence path:
  - `lib/github-graphql.mjs` — minimal in-process GraphQL client. Exports `graphql(query, vars, opts)` (auto/gh/fetch transport selection; token resolution chain `opts.token` > `GITHUB_TOKEN` > `GH_TOKEN` > `gh auth token`), `requestCopilotReview(repo, prNumber, opts)` helper that shells out to `gh pr edit --add-reviewer copilot-pull-request-reviewer` per ADR4-2 (the GraphQL `requestReviews` mutation rejects Bot reviewer IDs — verified via the CS37 spike), `GraphQLError` typed error class with `.kind ∈ {auth-missing, network, http-status, graphql-errors, invalid-json}`, and an `__testSeam` for unit-testing fetch + spawnSync without hitting the real API.
  - `scripts/check-copilot-review.mjs` — A5 + A16 gate. Verifies the PR has a Copilot review (login `copilot-pull-request-reviewer`, `__typename: Bot`) at the current HEAD with state in `{COMMENTED, APPROVED, CHANGES_REQUESTED}` (PENDING is rejected per ADR4-4), AND submitted after the latest local Go in the PR body's `## Review log` (A5 ordering, ADR4-5). Exports `runCheck()` + `findLatestLocalGoTimestamp()` for direct-import testing. Skip semantics per C36-5 / ADR4-7: `workboard-only` and `bot-author` exit 0 with notice; `fork-source` exits 2 with maintainer-rerun hint (forks cannot self-engage Copilot, ADR4-6).
  - `harness pr-evidence` now wires the new gate as `A5+A16 copilot-review`. Conditional dispatch: requires `--repo` and `--pr`; skipped with notice otherwise (preserves local dogfood without a real PR context).
  - `OPERATIONS.md § Copilot engagement procedure` updated with the corrected recipe (`gh pr edit --add-reviewer copilot-pull-request-reviewer`) replacing the documented-but-broken `requestReviews` GraphQL mutation. CI implication (ADR4-8) recorded: engage-and-verify in one workflow run will always fail on first execution — CS38a CI must split into separate jobs/events.
  - `docs/adr/0004-copilot-graphql-spike.md` records the full live-API spike transcript (S1 identity, S2 engagement, S3 lifecycle) plus decisions ADR4-1 through ADR4-8 that lock the design for CS38a/CS38b/CS39/CS41. Spike outcome: PASS — full A5 + A16 enforcement ships, no degradation.
- **CS36:** PR-evidence aggregator — new `harness pr-evidence` subcommand and two new gate scripts under `scripts/`:
  - `harness pr-evidence --base <sha> --head <sha> --pr-body <file> [--repo <slug>] [--pr <num>] [--skip-reasons <csv>] [--json] [--quiet]` — single entry point that runs the mechanical PR-state evidence gates against an open PR's commit graph + body markdown. Aggregates B1, A3, A4, and A6 (diff-scoped) and exits non-zero on any gate failure. Centralises skip semantics per the C35-19 / C36-5 matrix (`workboard-only` short-circuits all gates; `bot-author` skips B1+A3+A4 but still runs A6; `fork-source` runs all read-only gates). Output modes: default human-readable, `--quiet` summary-only, `--json` structured. NOT registered in `harness lint` (per C35-17 — local lint must not require PR context).
  - **B1:** `scripts/check-pr-commits.mjs` — verifies every commit in `<base>..<head>` (including merge commits) carries the canonical `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` trailer. Surfaces an actionable fetch hint when SHAs are not locally present.
  - **A3+A4:** `scripts/check-review-evidence.mjs` — single script that parses the PR body markdown and validates the `## Model audit` section (no implementer-vs-reviewer model overlap — A3) plus the `## Review log` section (latest `Go` row's `analyzed_head` equals `--head` — A4).
  - **A6:** Diff-scoped re-use of the CS35b `check-clickstop-plan-review.mjs` predicate via the new `--files <csv>` flag. Aggregator computes the planned/active CS files in the PR diff and threads them so pre-arc grandfathered files cannot fail unrelated PRs (per LRN-108).
  - Doctrine + canonical local + CI invocation in `OPERATIONS.md § PR-evidence aggregator (CS36)` and the lockstep template copy. Per Decisions C36-1 through C36-11.
- **CS35b:** Plan-review attestation linter (`scripts/check-clickstop-plan-review.mjs`) + `harness plan-review-hash <file>` CLI helper + `lib/plan-review-hash.mjs` library — enforces a `## Plan review` H2 attestation section on every `project/clickstops/planned/*.md` and `project/clickstops/active/*.md` file, with hash-based freshness verification (12-char SHA-256 prefix over Decisions+Deliverables bodies), reviewer-vs-author independence, and a verdict gate (`Go` / `Go-with-amendments` pass; `Needs-Fix` blocks). Wired into `harness lint` (warn-only on missing-section in v0.4.0 standalone mode; CS42-7 flips the standalone `--strict` default to `true` for v0.5.0). Also dispatched by the `harness pr-evidence` aggregator (lands in CS36) as gate A6, which is **STRICT in both v0.4.0 and v0.5.0** regardless of the standalone flag — local convenience asymmetry per C35b-9. Doctrine + procedure in `OPERATIONS.md § Plan review attestation procedure (CS35b)`; schema reference in `REVIEWS.md § Plan review (planned/active CS attestation)`. Retroactive grandfathering: all 9 already-filed planned files in the v0.4.0+v0.5.0 enforcement-gap arc (CS36, CS37, CS38a, CS38b, CS39, CS40, CS41, CS42, plus CS35b itself) carry `## Plan review` rows recording the GPT-5.5 R1 review of 2026-05-12 + the post-amendment R2 review of 2026-05-13. Closes the gap exposed by PR #147 (planned files merging without any documented independent review). Per Decisions C35b-1 through C35b-15.
- **CS35:** Planning-locality linter (`scripts/check-planning-locality.mjs`) — bans repo-root scratch planning files (`PLAN.md`, `ROADMAP.md`, `TODO.md`, `NOTES.md`, `STRATEGY.md`) outside `project/clickstops/{planned,active,done}/`, `template/`, `node_modules/`, `.git/`, `tests/fixtures/`. Wired into `harness lint`. Strategic planning content must live in the canonical CS arc; session storage is non-durable. (Per Decisions C35-11, C35-12.)
- **CS35:** Reviewer-doctrine front-load — `REVIEWS.md` review-log + model-audit schemas made explicit (C35-3, C35-4); R1/Rn distinction and stale-diff doctrine documented; PR-evidence gate names A1..A6 introduced as a reference table so CS36..CS41 can refer to gates by short name. (Per Decisions C35-3, C35-4, C35-5.)
- **CS35:** Reviewer-model fallback ladder (`OPERATIONS.md` § Sub-agent dispatch + `REVIEWS.md` § 2.2) — GPT-highest-available → Sonnet-highest → orchestrator's-own with independence invariant. Canonical reviewer preamble between `<!-- harness:reviewer-preamble:start/end -->` markers; orchestrator pastes verbatim per LRN-068 pattern. Copilot engagement procedure documented for v0.4.0 (manual until CS41's `harness copilot-engage` wrapper). (Per Decisions C35-1, C35-2, C35-10.)
- **`harness lint --explain` covers all 18 shipped linters** (was 3 in
  v0.3.1: `architecture`, `text-encoding`, `workboard`). New entries:
  `clickstop`, `commit-trailers`, `compose-v2`, `composed-blocks`,
  `context`, `fixtures`, `instructions`, `learnings`, `pack`, `pr-body`,
  `public-artifact`, `readme`, `scaffold-readme`, `templates`,
  `workflow-pins`. Each entry documents the linter script, target file/dir,
  rule set, and a Why or Canonical-seed line. Per CS32/D3, applies LRN-104.
- `harness lint cs-plan`: new linter that flags harness-repo-internal path prefixes (`template/composed/`, `lib/`, etc.) inside consumer CS plans; self-host-guarded. Closes the second half of LRN-105 (CS34).

### Changed

- **CS38a — `.github/pull_request_template.md` file class transitions `managed` → `composed`** — consumers that pinned to v0.3.x will see the file class change on their next `harness sync` after upgrading to v0.4.0. Consumers that DID NOT customize the prior managed PR template see no behavioural change. Consumers that DID customize will need to either run `harness init --enable-review-gates` (which performs the migration) or add an explicit `composed.overrides[".github/pull_request_template.md"] = { _inherited_class: "managed", local_blocks: ["pull-request.review-evidence"] }` entry to `harness.config.json`. The `_inherited_class: "managed"` field records prior provenance for any future audit.

- **`harness lint` now suggests `--explain <name>`** at the bottom of every
  linter failure block (gated on registry presence; suppressed under
  `--quiet`). Per CS33, applies LRN-104 (auto-suggest piece).

- **`harness lint --skip NAME`** now exits 2 with a known-linters list when
  `NAME` matches no linter, instead of silently no-op'ing the unknown
  name. Mirrors the CS31 `--only` validation. Mixed valid+typo
  selections (e.g. `--skip workflow-pins,typo`) also fail. The error
  matches the `--only` UX. A typo in a CI workflow that intends to
  skip a renamed/removed linter no longer silently re-runs that
  linter — the typo is surfaced. Per CS32/D1, applies LRN-106.

- **`harness lint --only NAME` and `harness lint:NAME`** now exit 2 with a
  known-linters list when `NAME` matches no linter, instead of silently
  exiting 0 with `Total: 0 passed, 0 failed, 0 skipped`. Refines the
  CS30/D2 contract — the `lint:NAME` dispatcher rewrite is preserved
  (the dispatcher still must NOT emit `Unknown subcommand` for `lint:typo`),
  but `cmdLint` now rejects zero-match selections so a typo in a CI
  workflow (e.g. `harness lint:text-encding`) fails loudly. Mixed
  valid+typo selections (e.g. `--only learnings,typo`) also fail. The
  error mirrors the existing `--explain unknown-name` UX —
  `lint --explain <name>` is the canonical "give me help on one linter"
  partner of `--only` / `lint:NAME` (see also LRN-104 on per-linter
  explainability). Per CS31.

## [0.3.1] — 2026-05-12

### Added

- **`harness lint:NAME`** alias as a shorthand for `harness lint --only NAME` (CS30/D2). Aliases the
  one linter name into a focused run — e.g. `harness lint:text-encoding` runs only `check-text-encoding`.
  Resolves [SI Finding #2](docs/migration-v0.2.x-to-v0.3.0.md#si-finding-2-no-lint-name-form).
- **`harness lint --explain <name>`** subcommand prints the full rule set + canonical seed/template
  path for one supported linter (currently: `architecture`, `text-encoding`, `workboard`). The
  registry is colocated with `cmdLint` in `bin/harness.mjs` and grows opportunistically. Per CS30/D5.
- **Version header on every `harness lint` run:** the first stdout line is now
  `# harness vX.Y.Z — lint (cwd: <path>)` (printed regardless of `--quiet`). Makes CI logs and
  cross-clone debugging unambiguous about which harness produced a result. Per CS30/D8.
- **`scripts/check-text-encoding.mjs --respect-gitignore`** (default ON) — when `--dir` is inside
  a git repo, the scan list comes from `git ls-files --cached --others --exclude-standard` instead
  of a recursive walk. Build artifacts in `.gitignore`d directories (e.g. dotnet's `api/bin/`,
  `api/obj/`) no longer surface as CRLF/BOM violations. `--no-respect-gitignore` re-enables the
  recursive walk. Tracked content is still always checked. Per CS30/D3.
- **`docs/migration-v0.2.x-to-v0.3.0.md`** — concrete consumer migration steps for upgrading from
  the v0.2.x line to v0.3.0 (BREAKING WORKBOARD shape) plus v0.3.1 (text-encoding gitignore default,
  improved architecture-linter discoverability). Cross-linked from `[0.3.0]` BREAKING entry. Per CS30/D4.

### Changed

- **`scripts/check-architecture.mjs` error message:** when a required heading is missing, the
  error now lists the FULL required-heading set and points at `template/seeded/ARCHITECTURE.md`
  as the canonical skeleton — plus the `harness lint --explain architecture` hint. Previous
  message just said `Missing required heading: "## Data model"` with no recovery path. Per CS30/D5.
- **`OPERATIONS.md` (composed)** new subsection "Composed-block edits — consumer vs harness-repo
  paths" clarifies which file an editor should touch in a consumer repo (root file, between
  marker comments) vs the harness repo (`template/composed/`). Resolves [SI Finding #6](docs/migration-v0.2.x-to-v0.3.0.md#si-finding-6-composed-block-paths). Per CS30/D6.
- **`OPERATIONS.md` (composed)** Reusable-CI-workflow section now documents the **SAML-safe
  `git ls-remote` fallback** for resolving an `actions/<owner>/<repo>@<tag>` SHA when the org
  enforces SAML SSO and `gh api` returns 403 (the standard recipe breaks for Azure-published
  actions). Resolves [SI Finding #7](docs/migration-v0.2.x-to-v0.3.0.md#si-finding-7-saml-blocked-gh-api). Per CS30/D7.

## [0.3.0] — 2026-05-11

### Added

- **LRN-102** ([LEARNINGS.md](LEARNINGS.md#lrn-102)): WORKBOARD shows live coordination state only — never duplicate the planned/ queue or done/ history.
- **Regression test** `tests/cs25-runtime-deps.test.mjs` locks the contract that `ajv`, `ajv-formats`, and `js-yaml` remain runtime `dependencies` (not `devDependencies`). Per CS25.

### Fixed

- **`harness init` from a fresh consumer (CS25):** moved `ajv ^8.20.0`, `ajv-formats ^3.0.1`, and `js-yaml ^4.1.0` from `devDependencies` to `dependencies` in `package.json`. Without this fix, `npx -y "github:henrik-me/agent-harness#vX.Y.Z" init` silently failed the constraint-merge and post-init sync steps with `Cannot find package 'ajv'` (visible as warnings on stderr; the warning text directed users to a manual `harness sync --mode=apply` workaround which itself also failed for the same reason). Affected every fresh consumer install on `v0.1.0` and `v0.2.0`. Surfaced during sub-invaders bootstrap (2026-05-11) Finding #1; required a manual `npm install --no-save ajv ajv-formats js-yaml` workaround into the npx cache. Per CS25.
- **Test-race regression (CS25 piggyback):** two pre-existing tests (`tests/lib-lock-reader.test.mjs`, `tests/check-clickstop.test.mjs`) wrote transient files under `REPO_ROOT` during parallel `node --test`, racing with `check-text-encoding`'s recursive walk and intermittently failing the self-host test (LRN-094 anti-pattern). Both moved to `os.tmpdir()`. CS28 forbidden-section fixtures (`_tmp_forbidden_*.md`) also moved out of `tests/fixtures/cs06/workboard/` for the same reason. Diagnostic on `tests/check-text-encoding.test.mjs` test 12 improved to surface `stderr`. Per CS25.

### Changed (BREAKING)

- **WORKBOARD shape (CS28):** `WORKBOARD.md` and `template/seeded/WORKBOARD.md` no longer contain `## Queued` or `## Recently Completed` sections. Live coordination state only — Orchestrators table + Active Work table. The queue lives in `project/clickstops/planned/` (filesystem source-of-truth, priority via filename + per-file `**Depends on:**`); historical record lives in `project/clickstops/done/`. **Consumer migration:** running `harness sync` against an existing consumer will diff the seeded WORKBOARD template, but seeded files are create-if-missing — existing WORKBOARDs are not auto-rewritten. Consumers should manually delete their `## Queued` and `## Recently Completed` sections; `harness lint` (`check-workboard.mjs`) now forbids both headings (was: `Recently Completed` was *required*). Any orchestrator process docs / scripts referencing those sections must be updated to cross-link `project/clickstops/{planned,done}/` instead. Per CS28 / [LRN-102](LEARNINGS.md#lrn-102).
- **`check-workboard.mjs` (CS28):** required headings reduced from `[Orchestrators, Active Work, Recently Completed]` to `[Orchestrators, Active Work]`; new check forbids `## Queued` and `## Recently Completed` headings (any occurrence is an error); removed the previous "exactly one Recently Completed" duplicate-section check and the "stale in-flight language in Recently Completed rows" check (both obsolete — the section is now forbidden). Per CS28.
- **`template/managed/TRACKING.md` (CS28):** rewritten lifecycle/state-table prose to drop "Queued" (now "Planned") wording and to clarify that close-out removes the WORKBOARD Active Work row (the `done/` directory IS the historical record — no "moves to Recently Completed" step). Per CS28.
- **`README.md` (CS28):** `WORKBOARD.md` per-path description rewritten to "Live coordination only — Orchestrators + Active Work. Nothing else." Per CS28.

## [0.2.0] — 2026-05-10

### Added

- **Lock schema:** new optional `fileEntry.template_prose_hash` field
  (composed-class only) records the SHA-256 of the template skeleton
  (post-templating, post-local-block-strip, LF-normalised) at sync time.
  Per CS03d / [LRN-020](LEARNINGS.md#lrn-020).
- **Schema:** new `schemas/legacy-composed-mapping.schema.json` (Draft-2020-12)
  formally defines the shape of `legacy_composed_mapping.json` (the file
  consumers author when `harness sync` raises `EMERGE_LEGACY_UNMAPPED`).
  Mirrors the runtime rules in `lib/composed.mjs validateLegacyMapping`.
  Consumer files may set `"$schema"` to the new schema for IDE autocomplete.
  Example starter file shipped at `examples/legacy-composed-mapping.example.json`.
  Per CS03e / [LRN-019](LEARNINGS.md#lrn-019).
- **Public readiness:** added public-repo issue templates, contribution/security
  docs, Dependabot and secret-scan configuration, npm pack dry-run CI, and
  ruleset documentation so the harness can be safely consumed from a public
  GitHub repository. Per CS15a / [LRN-080](LEARNINGS.md#lrn-080) /
  [LRN-081](LEARNINGS.md#lrn-081).
- **Shared config readers:** added fail-closed `lib/config-reader.mjs` and
  `lib/lock-reader.mjs` helpers used by linters and CLI paths that need
  consistent config/lock parsing. Per CS15d.
- **Template and scaffold linting:** added `check-templates` and
  `check-scaffold-readme` coverage, plus `harness lint` auto-dispatch for
  shipped scaffold policy linters. Per CS15d / [LRN-087](LEARNINGS.md#lrn-087)
  / [LRN-088](LEARNINGS.md#lrn-088) / [LRN-089](LEARNINGS.md#lrn-089)
  / [LRN-090](LEARNINGS.md#lrn-090).
- **Private-tier detection:** `harness init` can detect GitHub repository tier,
  record `constraints` in `harness.config.json`, emit the seeded
  `.harness-known-constraints.md` artifact, and accept
  `--constraint-disposition` / `--skip-constraint-detection` flags.
  Per CS15e / [LRN-092](LEARNINGS.md#lrn-092) /
  [LRN-093](LEARNINGS.md#lrn-093) / [LRN-094](LEARNINGS.md#lrn-094).

### Changed

- **Doc-schema utilities:** centralized heading collection, GitHub-style anchor
  generation, H2 collection, and section extraction in `lib/doc-schema.mjs`,
  with instructions/readme/clickstop linters delegated to the shared helpers.
  Per CS06c / [LRN-096](LEARNINGS.md#lrn-096).
- **`harness sync` no longer requires a `legacy_composed_mapping.json` when
  the only divergence between a consumer's composed file and the template is
  harness-side prose evolution.** `mergeComposed()` now uses the new
  `template_prose_hash` to distinguish "template prose evolved" (consumer
  didn't touch their prose — auto-adopt the new template prose) from
  "consumer edited prose" (existing fail-closed `EMERGE_LEGACY_UNMAPPED`
  behavior retained). First sync after upgrade from v0.1.x bootstraps the
  new field automatically (silent auto-adopt for one sync; subsequent syncs
  use full evolution detection). Per CS03d / [LRN-020](LEARNINGS.md#lrn-020).
- New public helper `computeTemplateProseHash(template)` exported from
  `lib/composed.mjs` for downstream tooling that needs to compute the same
  hash the lock writer uses.
- **CLI cleanup:** `--config` is now threaded through `sync` and `check`,
  invalid config errors include the override path, `--ref` is explicitly
  rejected where unsupported, and `harness init` finalizes by running the
  sync path so a fresh init is immediately drift-clean. Per CS15c /
  [LRN-084](LEARNINGS.md#lrn-084) / [LRN-085](LEARNINGS.md#lrn-085).
- **Restartability docs:** retired `HANDOFF.md` and consolidated bootstrap,
  session-start, open-LRN audit, and repo-layout guidance into `README.md`,
  `INSTRUCTIONS.md`, and `OPERATIONS.md`. Per CS15f /
  [LRN-098](LEARNINGS.md#lrn-098) / [LRN-099](LEARNINGS.md#lrn-099).

### Fixed

- **Workflow validation:** `check-workflow-pins` now fails on YAML parse errors
  when `js-yaml` is available, and `private-smoke.yml` quotes the step
  name that previously broke GitHub Actions parsing. Per CS14 /
  [LRN-078](LEARNINGS.md#lrn-078).
- **Reusable self-check CI:** `harness-self-check-via-reusable` now checks the PR
  head SHA instead of the synthetic merge SHA, avoiding false drift on reusable
  workflow validation.
- **Public-flip security and policy:** refreshed vulnerable lockfile content
  before the public flip and documented the GitHub ruleset admin-bypass model
  needed for protected PRs. Per CS15a / [LRN-080](LEARNINGS.md#lrn-080) /
  [LRN-081](LEARNINGS.md#lrn-081).
- **Close-out hygiene:** clickstop/workboard linters now catch missing close-out
  task rows, duplicate `Recently Completed` sections, and stale in-flight language in
  completed rows. Per CS15a / [LRN-082](LEARNINGS.md#lrn-082) /
  [LRN-083](LEARNINGS.md#lrn-083).
- **Workflow hardening:** refreshed GitHub Actions pins and pinned npm 11.2.0 in
  `private-smoke.yml` to avoid the npm 10.x `GitFetcher` regression in the
  npx-from-GitHub path.
- **Template linter markdown handling:** `check-templates` now skips tilde
  fences, indented markdown code blocks, and N-backtick inline spans without
  masking real violations in YAML or other non-markdown files. Per CS08c /
  [LRN-097](LEARNINGS.md#lrn-097).

### Changed (BREAKING)

- **Schema:** removed top-level `local_blocks` from `harness.config.json`.
  `composed.overrides[<file>].local_blocks` is now the single source of truth
  for per-file composed-block allowlists. Configs carrying the old top-level
  form are now rejected by Ajv with an `additional properties` error naming
  `local_blocks`. Migration: move every entry from `local_blocks[<file>]`
  into `composed.overrides[<file>].local_blocks` and delete the top-level
  key. Resolves [LRN-009](LEARNINGS.md#lrn-009) (CS02b).

### Migration: v0.1.0 → v0.2.0

v0.2.0 is still on the SemVer 0.x line, but it includes one intentional
breaking config-schema cleanup: top-level `local_blocks` is no longer accepted in
`harness.config.json`. The per-file form is now the only supported shape.

Mechanical migration:

1. For every top-level `local_blocks[<file>]` entry, create or update
   `composed.overrides[<file>].local_blocks` with the same array of block IDs.
2. Delete the top-level `local_blocks` key.
3. Run `harness sync --mode=check` (or `node bin/harness.mjs lint --quiet`
   in this repo) to confirm the config validates and the composed-block
   allowlists are enforced.

On the first sync after upgrading from v0.1.x, the sync engine also
bootstraps `template_prose_hash` for composed files in `.harness-lock.json`.
That one-time bootstrap auto-adopts current template prose when the consumer
has not edited prose outside local blocks; later syncs use the recorded hash
to distinguish template prose evolution from consumer-authored prose.

## [0.1.0] — 2026-05-04

Initial private-tier release. The harness governs itself (CS11 self-host) and is
ready for invitation-only consumers via `npx -y github:henrik-me/agent-harness#v0.1.0`.

### Added
- `bin/harness.mjs` — CLI dispatcher with subcommands: `init`, `sync`, `lint`,
  `pack`, `whoami`, `version`, `help` (CS04+).
- `lib/sync.mjs`, `lib/composed.mjs`, `lib/templating.mjs`, `lib/lock.mjs`,
  `lib/doc-schema.mjs` — sync engine, composed-blocks merge, templating with
  capture-group guard + escape syntax, lock read/write, shared doc parsing
  (CS03 + CS03b + CS05).
- 15 linters wired into `harness lint --quiet` aggregator (CS05–CS13):
  learnings, context, workboard, architecture, clickstop, instructions,
  readme, composed-blocks, workflow-pins, text-encoding, fixtures, pack
  (self-host-guarded), public-artifact, pr-body, commit-trailers,
  compose-v2, render-deploy-summary.
- 8 scaffold bundles via `harness init --with-scaffold <name>` (CS10):
  smoke, migrations, container-validate, health-check, seed, verify-deploy,
  feature-flags, cs-probes.
- 7 managed + 3 composed process-doc templates (CS08); `harness init`
  produces a fully linter-passing consumer repo from a single command (CS09).
- Reusable GitHub workflow `harness-checks.yml` (`workflow_call`) +
  drift-detection template `harness-drift.yml` (weekly auto-PR) (CS12).
- npm packaging readiness: `check-pack.mjs` validates tarball shape against
  forbidden patterns + required entries + size budget (CS13).
- Tag-triggered release workflow + private-consumption smoke test (CS14, this release).

### Security
- All GitHub Actions workflows pass externally-influenced values through
  `env:` and validate against an allowlist regex before shell consumption
  (LRN-075). Defence-in-depth against shell injection.
- `check-public-artifact` linter blocks accidental publication of secrets
  (GitHub PAT, AWS keys) and forbidden internal URLs (CS06).

### Documentation
- README, INSTRUCTIONS, OPERATIONS, CONVENTIONS, REVIEWS, TRACKING,
  RETROSPECTIVES — managed via `harness sync` from `template/managed/` +
  `template/composed/`. CS01 → CS11 evolution.
- CONTEXT, ARCHITECTURE, LEARNINGS (77 entries), WORKBOARD — seeded
  project-state docs.

[Unreleased]: https://github.com/henrik-me/agent-harness/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/henrik-me/agent-harness/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/henrik-me/agent-harness/releases/tag/v0.1.0
