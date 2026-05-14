# CS41 — `harness copilot-engage` CLI + `clickstop-implementer-not-reviewer` linter + flip default to opt-out

**Status:** active
**Owner:** yoga-ah
**Branch:** cs41/copilot-engage-and-default-flip
**Closed:** —
**Started:** 2026-05-13
**Filed by:** Pre-CS41 disposition of [#145](https://github.com/henrik-me/agent-harness/issues/145) Phase 1.5 + Change 6 (Copilot engagement). Authored 2026-05-12 by `yoga-ah`. Second CS in the v0.5.0 arc.
**Depends on:** [CS40](planned_cs40_check-review-output-linter.md), [CS35](planned_cs35_enforcement-doctrine-and-planning-locality.md). For the `copilot-engage` CLI: requires either (a) CS37 = PASS (GraphQL primitive shipped in v0.4.0), OR (b) a v0.5.0 follow-up CS that ships the GraphQL primitive (filed by CS37 close-out if spike was PARTIAL/FAIL — see C37-1b). At claim time, the orchestrator MUST verify which condition holds and either claim CS41 in full or split off the engage CLI into the follow-up CS.

## Goal

Three additions:

1. **`harness copilot-engage <pr>`**: CLI subcommand that programmatically requests Copilot review on a PR using the `lib/github-graphql.mjs` primitive, then polls for completion (per #145 Change 6 procedure). Replaces ad-hoc `@copilot review` mentions.
2. **`scripts/check-clickstop-implementer-not-reviewer.mjs`**: linter ensuring the same agent doesn't appear as both implementer AND reviewer for a CS (PR #28 gap #5).
3. **Flip `review_gates.enabled` default to opt-out** (per C35-15): v0.5.0 init defaults `enabled: true`; sync warns/errors if `enabled: false` without explicit opt-out reason.

## Background

`harness copilot-engage` is the third leg of #145 Change 6: doctrine (CS35) + verify (CS37 A16) + engage (CS41). Without the engage CLI, orchestrators have to remember the GraphQL recipe by hand or fall back to `@copilot review` (which PR #28 showed is unreliable mid-fix).

The implementer-not-reviewer linter closes gap #5: PR #28's `## Model audit` had the same agent in both columns; A3 (CS36) catches model overlap but not agent-identity overlap. The doctrine — that `Implementer agent` and `Reviewer agent` are explicit columns and MUST be distinct — ships in CS35 as decision **C35-18** (agent-identity independence). This CS mechanizes enforcement and lands the schema columns in REVIEWS.md/template + retroactively updates CS36's `check-review-evidence.mjs` parser to accept (and CS38a's PR-template skeleton to render) the new columns.

The default flip is the planned migration ramp completion: v0.4.0 was opt-in to give consumers a release to migrate; v0.5.0 makes the gates the default (opt-out for legacy projects).

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C41-1 | `copilot-engage` CLI shape | `harness copilot-engage <pr> [--repo <slug>] [--poll-timeout 300] [--poll-interval 30] [--no-poll]`. Default: poll up to 5 minutes (matches #145 Change 6 expectation), 30s interval. `--no-poll` returns immediately after `requestReviews` mutation. | 5min/30s matches the documented expectation. `--no-poll` for CI use cases that observe via separate workflow. |
| C41-2 | Resolution of Copilot identity | At invocation: cache-or-fetch `gh api graphql -F query='query { user(login: "copilot-pull-request-reviewer") { id } }'` (or whatever identity the CS37 spike confirmed); cache in `~/.cache/harness/copilot-id` for 7 days. | Reduces API calls; identity is stable. 7-day TTL is a reasonable refresh cadence. |
| C41-3 | PR ID resolution | `gh api graphql -F query='query($owner:String!,$repo:String!,$pr:Int!){ repository(owner:$owner,name:$repo){ pullRequest(number:$pr){ id } } }'` with `--repo` (auto-detected from current dir if absent). | Standard PR-node-ID resolution. |
| C41-4 | Poll completion criteria | Success: at least one `Review` node by Copilot identity with `state ∈ {APPROVED, COMMENTED, CHANGES_REQUESTED}` AND `commit.oid == current PR HEAD`. Timeout: emit warning + exit 3 (distinct from auth/error exit codes). | Same predicate as CS37 A16 gate, but on a polling loop. |
| C41-5 | Implementer-not-reviewer linter | Parse `## Model audit` table; for each row, compare `Implementer agent` (orchestrator GH username) vs `Reviewer agent`. Equal = fail. (Distinct from A3 model check.) | Independence isn't just about model — it's about identity. Same agent under different model still fails. |
| C41-6 | Where to source agent identity | Option A: parse from a sibling column in `## Model audit` (`Implementer agent`/`Reviewer agent` columns, mandated by C35-18 doctrine). Option B: derive from commit authors (B1 trailer + git log). **Choose A** — explicit columns, no inference. This CS lands the columns in REVIEWS.md schema AND retroactively updates CS36's `check-review-evidence.mjs` parser to recognize the new columns AND updates CS38a's PR-template skeleton (`template/managed/.github/pull_request_template.md`) to render them. **Backward compatibility**: PRs without the new columns produce a one-cycle WARNING (not error) from `check-clickstop-implementer-not-reviewer` AND from `check-review-evidence` (which gains a `--strict-agent-columns` flag defaulting to false in v0.5.0; CS42 release notes call out the upgrade-to-error path for v0.6.0). | Inference from git is fragile; explicit columns are auditable. Backward-compat warn-not-error per GPT-5.5 BLOCKING #4: existing in-flight PRs without the columns must not fail review. |
| C41-7 | Default flip mechanics | `harness init` with no flags writes `review_gates.enabled: true` by default in v0.5.0+. `harness sync --mode=check` errors (was warns in v0.4.0) if `review_gates` block is absent OR `enabled: false` without `_opt_out_reason: <string>` field. | Migration ramp completion. Forced opt-out reason discourages silent regression. |
| C41-8 | Migration messaging | `harness sync --mode=check` failure message: "review_gates is now opt-out by default in v0.5.0. Either: (a) run `harness init --enable-review-gates` to opt in (recommended); or (b) add `\"_opt_out_reason\": \"<reason>\"` to your `review_gates` block to explicitly opt out." | Actionable, non-coercive. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.7-xhigh | rubber-duck dispatched (orchestrator: yoga-ah) | 000000000001 | 2026-05-12T00:00:00Z | Needs-Fix | CS41 plan: copilot-engage CLI + A16 default flip. R1 surfaced default-flip migration ramp + agent-identity column strictness; addressed in PR #149. |
| R2 | gpt-5.5 | claude-opus-4.7-xhigh | rubber-duck dispatched (orchestrator: yoga-ah) | 6a082ea470b5 | 2026-05-13T00:00:00Z | Go-with-amendments | Post-amendment review of the 9-CS arc (PR #149 amendments addressing R1 BLOCKING + non-blocking findings). Plan ready for claim. |
## Deliverables

1. **`bin/harness.mjs`**: register `copilot-engage` subcommand per C41-1. Routes to `lib/copilot-engage.mjs`.
2. **`lib/copilot-engage.mjs`** (new): GraphQL request + poll loop per C41-2/3/4. Reuses `lib/github-graphql.mjs`.
3. **`tests/cli-copilot-engage.test.mjs`** (new): minimum 6 cases — happy path mutation + immediate APPROVED, polling loop with timeout, `--no-poll` exits after mutation, fork-PR rejection, identity cache hit, identity cache stale.
4. **`scripts/check-clickstop-implementer-not-reviewer.mjs`** (new) per C41-5/6.
5. **`tests/check-clickstop-implementer-not-reviewer.test.mjs`** (new): minimum 5 cases — clean separation, identity overlap fail, missing columns, multi-row table, case-insensitive comparison.
6. **REVIEWS.md** + **template/composed/REVIEWS.md** updates: add `Implementer agent` + `Reviewer agent` columns to `## Model audit` schema (per C41-6 + doctrine in C35-18). Migration note: existing PRs without these columns produce a warning (not error) for one cycle; CS42 release-cut may upgrade to error in v0.6.0.
7. **`scripts/check-review-evidence.mjs`** (CS36) update: extend the `## Model audit` parser to recognize the new `Implementer agent` and `Reviewer agent` columns. Add a `--strict-agent-columns` flag (default `false` in v0.5.0; flips to `true` in v0.6.0 per C41-6 backward-compat plan). When `false`, missing columns produce a stderr warning but exit 0. Update `tests/check-review-evidence.test.mjs` with at least 3 new cases (clean with new columns, missing columns + `--strict-agent-columns=false` warns, missing columns + `--strict-agent-columns=true` fails).
8. **`template/managed/.github/pull_request_template.md`** (CS38a) update: extend the `## Model audit` table skeleton with the two new columns so newly opened PRs get them by default. Update the migration test in CS38a's deliverable set to include the new columns (or leave a forward-compat note on the migration test pointing to this CS).
9. **`harness.config.json`** schema + `bin/harness.mjs init` + `bin/harness.mjs sync` updates per C41-7/8.
10. **`tests/sync-review-gates-default-flip.test.mjs`** (new): verify default-flip behavior — fresh init writes enabled:true; sync errors on missing block; sync accepts explicit opt-out with reason.
11. **OPERATIONS.md**: § Copilot engagement procedure refresh — replace manual GraphQL recipe with `harness copilot-engage` invocation.
12. **CHANGELOG.md** `[Unreleased] / Added` (CLI + linter + agent-identity columns) + `[Unreleased] / Changed` (default flip, parser updates) entries.

## Sub-agent fan-out

2 sub-agents:

- **SA-1 (`bot41-engage`)** — owns `bin/harness.mjs copilot-engage` route + `lib/copilot-engage.mjs` + `tests/cli-copilot-engage.test.mjs`.
- **SA-2 (`bot41-impl-not-reviewer-and-flip`)** — owns the implementer-not-reviewer linter (`scripts/...` + `tests/...`) AND the default-flip work (schema, init, sync, sync test, REVIEWS.md schema columns) AND the CS36 parser update (`scripts/check-review-evidence.mjs` + `tests/check-review-evidence.test.mjs` extensions for the new columns + `--strict-agent-columns` flag) AND the CS38a PR-template skeleton update.

Orchestrator owns OPERATIONS.md + CHANGELOG.md + REVIEWS.md prose changes outside the schema columns (which are SA-2's deliverable per #6 + #7 + #8 above).

## Exit criteria

1. `harness copilot-engage --help` documents all flags per C41-1.
2. Live test against a sandbox PR succeeds: mutation requests Copilot, poll detects submitted review (manual verification step in close-out notes).
3. `harness sync --mode=check` errors against a config without `review_gates` block; passes with explicit opt-out reason.
4. REVIEWS.md `## Model audit` schema includes `Implementer agent` + `Reviewer agent` columns (per C35-18 doctrine + C41-6 schema landing); existing PRs continue to work (warn, not error) AND `check-review-evidence` correctly tolerates old PRs with `--strict-agent-columns=false` (default) AND fails with `--strict-agent-columns=true`.
5. CS38a's PR-template skeleton includes the new columns AND a fresh `harness init` test verifies the rendered template carries them.
6. `node --test tests/*.test.mjs` total = prior + ≥14 (was ≥11 before parser/template extensions).
7. `harness lint --quiet` + sync drift on the harness repo: passes (the harness's own `harness.config.json` already has `review_gates.enabled: true` from CS38b).
8. Plan-vs-implementation review `Go`.

## Risks + open questions

- **R1 (medium):** Default flip is a breaking change for consumers who haven't opted in. Mitigation: explicit opt-out path with reason field; clear migration message; v0.4.0 → v0.5.0 release notes warn loudly.
- **R2 (low):** Copilot identity may change between CS37 and CS41 (months apart). Mitigation: identity-cache TTL forces re-resolution every 7 days; ADR-NNN documents how to refresh manually.
- **R3 (low):** Polling loop may exhaust API rate limit on busy repos. Mitigation: 30s default interval; configurable; exits cleanly at timeout.
- **OQ1:** Should `copilot-engage` also write a comment/log to the PR body indicating Copilot was engaged at SHA X, time Y? **Default:** no — A16 gate already verifies; PR-body pollution avoided.

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T0 | pre-claim — review LEARNINGS.md `open` items tagged process/architectural; disposition before claim | done | yoga-ah | LRN-100 (CI workflow trigger) → CS23 planned; LRN-101 (CHANGELOG-on-every-CS) → CS24 planned. Both stable. |
| T1 | claim PR (workboard/cs41-claim → main) — rename planned→active, set Status/Owner/Branch/Started, populate Tasks, update WORKBOARD | done | yoga-ah | PR #175 admin-merged at `10c5e82f3986aa6f335823d9c874e591e5dcde50` (2026-05-14T00:13:25Z) |
| T2 | branch `cs41/copilot-engage-and-default-flip` from main | done | yoga-ah | branched + work in progress |
| T3 | implement `lib/copilot-engage.mjs` + `bin/harness.mjs copilot-engage` route per C41-1/2/3/4 (mutation + identity-cache + PR-ID resolution + poll loop + fork-PR rejection) | done | yoga-ah (SA-1) | SA-1 dispatched as background general-purpose agent; lib + CLI + help wired; uses `node(id:"BOT_kgDOCnlnWA")` (verified live via gh-api smoke test) |
| T4 | implement `tests/cli-copilot-engage.test.mjs` (≥6 cases per Deliverable 3): happy-path mutation+APPROVED, polling-loop timeout, --no-poll, fork-PR rejection, identity cache hit, identity cache stale | done | yoga-ah (SA-1) | tests pass; mock-based; lib-direct except CLI help/bad-input |
| T5 | implement `scripts/check-clickstop-implementer-not-reviewer.mjs` per C41-5/6 + tests (≥5 cases) | done | yoga-ah (SA-2) | 7 cases including case-insensitive overlap + missing-columns warn/strict; registered in `harness lint` aggregator |
| T6 | REVIEWS.md + composed/REVIEWS.md add `Implementer agent` + `Reviewer agent` columns to `## Model audit` schema per C41-6 + C35-18 doctrine | done | yoga-ah (orchestrator) | schema columns already landed in CS35 C35-18 as optional; CS41 prose updated to reflect required-in-v0.5.0 + warn-on-missing migration ramp + strict-flip in v0.6.0 per C42-6 |
| T7 | extend `scripts/check-review-evidence.mjs` parser for new agent columns + `--strict-agent-columns` flag (default false in v0.5.0) per Deliverable 7; update tests (≥3 new) | done | yoga-ah (SA-2) | parser extended; flag wired; 23 cases pass total (orig + new) |
| T8 | extend `template/managed/.github/pull_request_template.md` with new agent columns per Deliverable 8 | done | yoga-ah (SA-2) | managed PR template Model-audit skeleton extended with `Implementer agent` + `Reviewer agent` rows |
| T9 | schema + init + sync updates per C41-7/8 (default-flip mechanics + migration messaging) | done | yoga-ah (SA-2) | `_opt_out_reason` added to `schemas/harness.config.schema.json`; `cmdInit` defaults `enabled: true` for FRESH inits only (preserves LRN-057 invariant for pre-existing configs) + new `--disable-review-gates <reason>` flag; `cmdSync --mode=check` errors with C41-8 migration message when block missing OR `enabled: false` without reason |
| T10 | `tests/sync-review-gates-default-flip.test.mjs` (≥3 cases) per Deliverable 10 | done | yoga-ah (SA-2) | 3 cases: fresh-init writes block / missing-block sync error / opt-out-with-reason passes |
| T11 | OPERATIONS.md § Copilot engagement procedure refresh — replace manual GraphQL recipe with `harness copilot-engage` invocation | done | yoga-ah (orchestrator) | root + composed mirror updated; manual fallback preserved as escape hatch; A5-ordering doctrine reconfirmation from CS40 PR #172 added |
| T12 | CHANGELOG.md entries per Deliverable 12 (Added: CLI + linter + agent columns; Changed: default flip + parser updates) | done | yoga-ah (orchestrator) | `[Unreleased]` Added (CLI + linter + columns + OPERATIONS refresh) + Changed (default flip + sync migration error) |
| T13 | validate (`harness lint` + tests + sync clean); R1 plan-vs-impl review; amendments; R2 (and Copilot review fixes if surfaced); admin-merge content PR; close-out PR | in-progress | yoga-ah | local validation: lint 29/0/3, full suite 913 (912 pass / 1 skip / 0 fail), self-host sync clean. R1 next. |

## Notes / Learnings

**Implementation observations (filled mid-flight):**

- **SA-1 design pivot — Copilot identity resolution:** Verified live via `gh api graphql` that `SearchResultItem` cannot fragment-spread `... on Bot`. Working query is `node(id:"BOT_kgDOCnlnWA")` (the documented Copilot Bot node ID). Cached for 7d at `~/.cache/harness/copilot-id.json` per C41-2.
- **SA-2 surfaced schema-path typo discrepancy:** Brief said `schemas/harness-config.schema.json` but canonical path is `schemas/harness.config.schema.json` (dot, not hyphen). SA-2 used the canonical path. No change required to brief — just an orchestrator note.
- **Default-flip + LRN-057 collision (orchestrator post-SA fix):** SA-2's first cut had `enableReviewGatesForInit` always firing, which silently mutated pre-existing configs and broke `cs09-init.test.mjs` test 9 (LRN-057 invariant: re-running `harness init` must not modify pre-existing `harness.config.json`). Fixed by gating the default-on path on `(!configExists || enableReviewGatesExplicit)` so:
  - FRESH inits get the new defaults (review_gates.enabled=true + PR-template migration).
  - PRE-EXISTING configs without review_gates are left alone — `harness sync --mode=check` then fails-loud with the C41-8 migration message, prompting the consumer to opt in or opt out explicitly.
  - Explicit `--enable-review-gates` still migrates pre-existing configs.
- **LRN candidate: `cs09-init` test 8 expectation update:** `composed.files` now expected to include `.github/pull_request_template.md` after a fresh init (was previously a managed-only file). This is the visible signal that default-flip ran successfully on fresh inits.
- **LRN candidate: `cs15d-aggregator` linter count drift:** Each new linter registered in `cmdLint` requires a one-line update to the `consumer-no-scaffolds` test's expected linter count. Worth converting to a `.length >= N` assertion or auto-derived count to avoid test churn each CS that adds a linter.

**Validation snapshot (post-fix):** `harness lint --quiet`: 29 passed / 0 failed / 3 skipped. `node --test tests/`: 913 tests / 912 pass / 1 skipped / 0 fail. `harness sync --mode=check --cwd .`: no drift.

## Plan-vs-implementation review

**Reviewer:** GPT-5.5
**Date:** 2026-05-14
**Outcome:** R1 = Needs-fix (1 Blocking + 2 Non-blocking) → R2 = Go-with-amendments (3 Non-blocking, all addressed in the same content commit)

### Transcript

| # | Severity | File | Description | Status |
|---|---|---|---|---|
| 1 | Blocking | `lib/copilot-engage.mjs:264` | `copilot-engage` exits success on any Copilot review at HEAD, but `scripts/check-copilot-review.mjs:275` also enforces A5 ordering vs the latest local Go timestamp. A stale same-HEAD review predating a fresh local Go would falsely satisfy the engage CLI but fail A5+A16 in CI. | **Fixed.** Added `engageRequestedAt` floor captured BEFORE the mutation (`lib/copilot-engage.mjs:102-107`); poll now requires `submittedAt >= floor`. New `--submitted-after <iso>` CLI flag for explicit caller floor (max'd with engage-request floor). New regression test `rejects stale Copilot review on same HEAD that predates the engage request (A5 ordering — CS41 R1 #1)` and `honors --submitted-after caller floor when later than engage timestamp` in `tests/cli-copilot-engage.test.mjs`. |
| 2 | Non-blocking | `OPERATIONS.md:796` | Documented invocation uses unsupported `--timeout-ms 300000`; CLI actually exposes `--poll-timeout <seconds>`. Same mismatch in composed mirror. | **Fixed.** Both root and composed OPERATIONS.md updated to `--poll-timeout 300` + `--submitted-after <iso>` documentation. Step 4 prose rewritten to describe the ordering invariant. |
| 3 | Non-blocking | `bin/harness.mjs:120` | `cmdInit` implements `--disable-review-gates <reason>` but `harness init --help` does not document it. | **Fixed.** Init help (line ~128) now documents both `--enable-review-gates` (now FRESH-init default per C41-7) and `--disable-review-gates <reason>` (writes `_opt_out_reason` per C41-8). |

### Verdict rationale

R1 verdict was **Needs-fix** because the engage CLI's poll predicate did not match the A5+A16 gate's predicate — the central correctness claim of the CS. Specifically, the gate also requires `submittedAt > latestLocalGo` (A5 ordering doctrine, reconfirmed by CS40 PR #172). The CLI accepted any same-HEAD review, so a stale review predating a fresh local Go would falsely succeed locally then fail in CI.

The fix captures `engageRequestedAt` immediately BEFORE the `gh pr edit` mutation and uses it as an implicit `submittedAfter` floor in the poll predicate (max'd against any caller-supplied `--submitted-after <iso>` for cases where the orchestrator wants to enforce a specific local-Go floor). This makes "engage CLI satisfied" ⊆ "A5+A16 gate satisfied" assuming the orchestrator records local Go BEFORE engaging — which is the documented doctrine.

### R2 transcript (against committed HEAD `c72c1e1`)

| # | Severity | File | Description | Status |
|---|---|---|---|---|
| R2-1 | Non-blocking | `active_cs41_copilot-engage-cli-and-default-flip.md:73` (Exit criterion E2) | Live sandbox PR engage+poll evidence is required by the plan but no end-to-end run was committed; only an identity-resolution `gh api graphql` smoke test was logged. | **Waived per plan.md autonomous decision #2.** The primitive (`gh pr edit --add-reviewer copilot-pull-request-reviewer`) is already field-tested in the CS37 spike (PR #160) and CS39 PR #169 where it successfully engaged Copilot end-to-end. The CLI is a thin wrapper around that primitive plus a polling predicate that mirrors `scripts/check-copilot-review.mjs` exactly (verified by R1 #1 fix). First real-PR usage will validate post-merge during this very PR's Copilot engagement step; risk accepted. Documented here as the canonical waiver. |
| R2-2 | Non-blocking (suggestion) | `CHANGELOG.md:24` | Schema path documented as `schemas/harness-config.schema.json` (hyphen); canonical is `schemas/harness.config.schema.json` (dot). | **Fixed** in same content commit. |
| R2-3 | Non-blocking (suggestion) | `REVIEWS.md:363-367` + composed mirror | Duplicate ramp paragraph said "v0.5.0 may upgrade missing agent columns to error", but the canonical statement (`REVIEWS.md:204-209`) says strict-flip happens in v0.6.0 per C42-6. Drift between the two paragraphs. | **Fixed** in same content commit; both root and composed mirror now align with the v0.6.0/C42-6 wording. |

### R2 verdict rationale

GPT-5.5 confirmed all three R1 findings are closed (cited specific file:line for each), confirmed the cache-file naming is consistent (no remaining `copilot-identity.json` references), and re-ran lint (29/0/3) + tests (915 / 914 pass / 1 skip) + sync (clean) against `c72c1e1`. The three R2 items are all non-blocking documentation/process items that can be addressed in the same content commit; R2-1 is an explicit waiver consistent with the plan's autonomous decision #2.

### Post-R2 hotfix — null `cacheDir` regression discovered during live engage

While running `harness copilot-engage 176 --no-poll` (the very R2-1 sandbox-PR exercise that was waived), the CLI failed with `TypeError: The "path" argument must be of type string. Received null`. Root cause: `resolveCopilotIdentity({ cacheDir = path.join(os.homedir(), '.cache', 'harness') })` used JS default-parameter destructuring, which does NOT apply when the argument is explicitly `null` (only when `undefined`). The CLI parser at `bin/harness.mjs:2336` initializes `cacheDir = null` and passes it through, so the default never fired. Fixed by explicitly checking `cacheDir == null` inside `resolveCopilotIdentity`. Added regression test `resolveCopilotIdentity falls back to ~/.cache/harness when cacheDir is null (CS41 PR #176 hotfix)` (`tests/cli-copilot-engage.test.mjs`). Re-ran full suite: 916 / 915 pass / 1 skip / 0 fail. This validates R2-1 in the affirmative — the live engage now works end-to-end against PR #176, retroactively converting the waiver into demonstrated evidence.

### R3 verdict — Go (against committed HEAD `37caf32`)

GPT-5.5 reviewed the post-R2 hotfix delta `cdc0245..37caf32` covering `lib/copilot-engage.mjs:174-201` (null-safe `effectiveCacheDir`), `tests/cli-copilot-engage.test.mjs:353-387` (regression test), and the active CS file's post-R2 hotfix prose. Verdict: **Go**, with one optional hardening suggestion (test could assert exact path equality to `path.join(os.homedir(), '.cache', 'harness')` instead of substring match). Independently re-ran lint (29/0/3) + tests (916 / 915 pass / 1 skip / 0 fail) + sync (clean) at `37caf32`; appended R3 row to PR body Review log at timestamp `2026-05-14T03:34:50Z`. Optional hardening suggestion deferred (would require another amend cycle for cosmetic test-tightening); surfaced as a learning candidate.

### R4 fixes — Copilot-review findings on `37caf32`

Live `harness copilot-engage 176` (R3 dogfood) returned a Copilot review at `2026-05-14T03:44:14Z` with 6 findings, all in CS41-owned files. Addressed all 6 in-band rather than deferring to CS42 because the cluster includes 2 real correctness bugs in the linters this CS ships:

| # | File | Finding | Fix |
|---|---|---|---|
| 1 | `scripts/check-review-evidence.mjs:516-545` | Empty/whitespace-only agent cells trigger overlap error (`"".trim().toLowerCase() === "".trim().toLowerCase()`); per CS41 spec these should be treated as missing (warn-ramp) | Compute `*Trimmed` early; if empty, fall to missing-row path; only check overlap when both non-empty |
| 2 | `scripts/check-clickstop-implementer-not-reviewer.mjs:233-251` | Same empty-cell overlap bug | Same fix; `missingAgentFinding()` message updated to "missing required agent row(s) (absent or empty)" |
| 3 | `tests/sync-review-gates-default-flip.test.mjs:18-29` | `runHarness(args, cwd, env)` ignores the `cwd` parameter (subprocess always runs at REPO_ROOT) | Dropped unused `cwd` parameter; updated 3 call sites |
| 4 | `template/managed/.github/pull_request_template.md:37-38` | `<github-login>` literal placeholder is not detected by `check-pr-body.mjs`; could leak into real PR bodies | Switched to italic `_(GitHub username of …)_` placeholder consistent with the rest of the template |
| 5 | PR #176 description | Claims `lib/copilot-engage.mjs` exports `findLatestMatchingCopilotReview(...)` and `parseSubmittedAfter(...)`, but they are file-private | Will correct PR body in the R4 re-engage step (PR body is a non-source artefact) |
| 6 | `REVIEWS.md:204-205` (+ composed mirror) | Model audit table conflated overlap-strict (CS41) with missing-columns warn-then-strict (v0.5.0 → v0.6.0 per C42-6) | Reworded both rows to distinguish the two enforcement axes |

Added 4 regression tests (2 per linter) covering empty-cell and whitespace-only inputs in both default and `--strict-agent-columns` modes. Full suite: 920 / 919 pass / 1 skip / 0 fail; lint 29/0/3; sync clean.
