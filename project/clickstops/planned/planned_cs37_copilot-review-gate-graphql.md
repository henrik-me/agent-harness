# CS37 — Copilot review gate via GraphQL (A5, A16) — HIGH RISK

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** Pre-CS37 disposition of [#145](https://github.com/henrik-me/agent-harness/issues/145) Phase 1 (gates A5, A16; #145 Change 6 GraphQL recipe). Authored 2026-05-12 by `yoga-ah`. Third CS in the v0.4.0 arc — **HIGH RISK** because it depends on Copilot's GitHub identity and the `requestReviews` mutation behaving as documented.
**Depends on:** [CS36](planned_cs36_pr-evidence-fs-and-git-linters.md) (the `harness pr-evidence` entry point), [CS35](planned_cs35_enforcement-doctrine-and-planning-locality.md) (C35-9, C35-10).

## Goal

Land the GraphQL primitive (`lib/github-graphql.mjs`) and the live-PR linter (`scripts/check-copilot-review.mjs`) that enforces A5 (Copilot review must be the LAST review submitted, after all local-clean Go rows) and A16 (Copilot review must exist for the current HEAD). The gate degrades gracefully on fork PRs (per C35-9).

## Background

PR #28 surfaced two related failures:

- **A5**: Copilot review was requested mid-fix, then the implementer pushed more commits. The resulting Copilot review was on a stale HEAD AND was followed by additional implementer changes — undetected because no gate checked review ordering.
- **A16**: No documented Copilot engagement procedure. Three mechanisms were tried; only `@copilot review` worked once at HEAD `dc58fdf`, didn't re-trigger at `ec26adf`. No gate checked whether a Copilot review existed for the current HEAD at all.

Per #145 Change 6, the canonical Copilot engagement is:
```
gh api graphql -F query='mutation($pr:ID!, $reviewer:ID!) { requestReviews(input: {pullRequestId: $pr, userIds: [$reviewer]}) { pullRequest { id } } }' \
  -F pr=<pr_node_id> -F reviewer=<copilot_node_id>
```
The Copilot reviewer node ID is resolved via `gh api graphql -F query='query { user(login: "copilot-pull-request-reviewer") { id } }'` (recipe per #145).

**This is HIGH RISK** because: (a) the `copilot-pull-request-reviewer` identity may have changed; (b) the `requestReviews` mutation may not behave as documented across all GitHub plans; (c) Copilot review states (`PENDING`, `COMMENTED`, `APPROVED`, `CHANGES_REQUESTED`) may have nuances that affect A5 ordering. CS37 deliverable #1 is a verification spike with a hard go/no-go gate.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C37-1 | Spike-first | Deliverable #1 is a verification spike: resolve `/users/copilot-pull-request-reviewer` actual node ID; run `requestReviews` against a sandbox PR; capture every Copilot review-state event for at least one full cycle (request → submit → re-request); document in `docs/adr/ADR-NNN-copilot-graphql-spike.md`. **If the spike fails, A16 enforcement degrades to doctrine-only in v0.4.0; the live linter is deferred to v0.5.0.** | Per rubber-duck finding 4: don't build a linter on assumed shapes. The spike is cheap (one sandbox PR, one mutation, one polling loop). If it works, the linter is straightforward; if it doesn't, we know early and the v0.4.0 release isn't blocked. |
| C37-2 | GraphQL transport | `gh api graphql` shell-out primary; native `fetch` with `GITHUB_TOKEN`/`GH_TOKEN` fallback. ADR documents both paths and the failure-mode error message. | `gh api` is universally available in our CI image and dev environments; `fetch` is the no-`gh` fallback for restricted environments. |
| C37-3 | Library shape | `lib/github-graphql.mjs` exports: `async function graphql(query, variables, {token, baseUrl} = {})` returning parsed JSON or throwing a typed error. Test pattern mirrors `lib/detect-repo-tier.mjs` (monkeypatch `globalThis.fetch` + `spawnSync` stubbing). | Per rubber-duck finding non-blocking 3: reuse the existing test pattern. Single function, single throw shape. |
| C37-4 | A5 ordering rule | Parse all reviews on the PR via GraphQL (`reviews(first: 100) { nodes { author{login}, state, submittedAt, commit{oid} } }`). Identify the latest `verdict ∈ {Go}` row in `## Review log` (per C35-6 timestamp). The Copilot review's `submittedAt` MUST be ≥ that timestamp AND `commit.oid` MUST equal `--head`. | Combines #145 A5 (ordering) and A4 (currency) into a single sufficient predicate. |
| C37-5 | A16 presence rule | At least one review by `copilot-pull-request-reviewer` (or current Copilot identity per spike output) MUST exist with `state ∈ {APPROVED, COMMENTED, CHANGES_REQUESTED}` and `commit.oid == --head`. `PENDING` does not satisfy. | Per #145: a pending Copilot review request without a submitted review is the exact PR #28 failure mode. |
| C37-6 | Fork PR behavior | If `--repo` ≠ origin (detected via `gh pr view <pr> --json headRepository,baseRepository`), A16 fails with exit code 2 and a message: "Copilot review gate cannot run on fork PRs (`GITHUB_TOKEN` is read-only). Maintainer must rerun `harness copilot-engage <pr>` after pulling the branch locally." | Per C35-9. Distinct exit code (2) so CI workflows can route fork PRs to a separate manual-approval path. |
| C37-7 | Auth failure contract | Single actionable error message: "GitHub API access requires `gh auth status` to show authenticated, OR a `GITHUB_TOKEN`/`GH_TOKEN` environment variable with `repo` and `read:user` scopes. See `lib/github-graphql.mjs` for the resolution order." | Per rubber-duck non-blocking 2. |

## Deliverables

1. **`docs/adr/ADR-NNN-copilot-graphql-spike.md`** (new): Records spike outcome (success/failure/partial), Copilot identity confirmed, mutation payload + response captured, review-state lifecycle observed, recommendation. **Hard go/no-go gate before any linter code is written.**
2. **`lib/github-graphql.mjs`** (new): primitive per C37-2/3/7.
3. **`tests/lib-github-graphql.test.mjs`** (new): minimum 6 cases — successful query, successful mutation, missing token error, gh-not-authenticated error, retry on 5xx, structured error on 4xx.
4. **`scripts/check-copilot-review.mjs`** (new): A5 + A16 implementation per C37-4/5/6. Conditional on spike success — if spike fails, this deliverable degrades to a doctrine-only stub that always exits 0 with a "deferred to v0.5.0" notice.
5. **`tests/check-copilot-review.test.mjs`** (new): minimum 6 cases — happy path, stale Copilot review, no Copilot review, ordering violation, fork-PR exit-2, pending-only review fails.
6. **`bin/harness.mjs`**: register `check-copilot-review` in the `pr-evidence` aggregator (per CS36's C36-2). Conditional skip if `--repo`/`--pr` not provided.
7. **OPERATIONS.md** § Copilot engagement procedure: capture the working invocation from the spike (verbatim transcript). Cross-link to the new linter.
8. **CHANGELOG.md** `[Unreleased] / Added` entry for the GraphQL primitive + Copilot review gate.

## Sub-agent fan-out

2 sub-agents, sequential (not parallel — spike must complete first):

- **Pre-CS37 spike (orchestrator-driven, NOT a sub-agent):** orchestrator runs the verification spike against a sandbox PR (e.g. a draft PR in this repo with a one-line README change). Spike output captured to `docs/adr/ADR-NNN-...`. **Hard gate: if spike fails, this CS ships only Deliverable 1 + degraded Deliverable 4; the rest defers to a follow-up CS in v0.5.0.**
- **SA-1 (`bot37-graphql-lib`)** — owns `lib/github-graphql.mjs` + `tests/lib-github-graphql.test.mjs` once spike passes.
- **SA-2 (`bot37-copilot-linter`)** — owns `scripts/check-copilot-review.mjs` + `tests/check-copilot-review.test.mjs` + the `bin/harness.mjs` routing addition. Depends on SA-1's library being merged.

Orchestrator owns ADR + OPERATIONS.md + CHANGELOG.md.

## Exit criteria

CS37 close-out is permitted only when **all** of the following are true and recorded in `## Plan-vs-implementation review`:

1. ADR-NNN exists with a `Spike outcome:` section explicitly stating PASS / PARTIAL / FAIL.
2. If PASS: `lib/github-graphql.mjs` + `scripts/check-copilot-review.mjs` exist and pass tests; `harness pr-evidence` aggregator includes the new gate.
3. If PARTIAL or FAIL: `scripts/check-copilot-review.mjs` is the degraded stub; a follow-up planned CS file is filed in `project/clickstops/planned/` for v0.5.0; CHANGELOG entry mentions the deferral.
4. `node --test tests/*.test.mjs` total = prior + ≥6 (PASS) or ≥0 (FAIL — only ADR added).
5. `node bin/harness.mjs lint --quiet` and sync drift check both pass.
6. Plan-vs-implementation review verdict `Go` per C35-2 ladder.

## Risks + open questions

- **R1 (HIGH):** Copilot identity / mutation may not behave as #145 documents. Spike-first design (C37-1) mitigates.
- **R2 (medium):** Sandbox PR for the spike consumes a real PR slot. Mitigation: use a draft PR; close immediately after spike; record run IDs in ADR.
- **R3 (low):** GraphQL rate limits during testing. Mitigation: `fetch`-fallback path tests use mocked responses; only spike hits real API.
- **OQ1:** If spike returns PARTIAL (some states observable, others not), does that count as PASS? **Default:** PARTIAL only if the failure is in the polling/timing dimension (we can detect Copilot review presence but not reliably distinguish review states). In that case ship A16 enforcement, defer A5 ordering precision to v0.5.0.

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time) | planned | — | — |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out)_
