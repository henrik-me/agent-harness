# CS41 — `harness copilot-engage` CLI + `clickstop-implementer-not-reviewer` linter + flip default to opt-out

**Status:** planned
**Owner:** —
**Branch:** —
**Closed:** —
**Started:** —
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
| (populated at claim time) | planned | — | — |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out)_
