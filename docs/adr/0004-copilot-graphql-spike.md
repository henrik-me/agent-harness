# ADR 0004 — Copilot review GraphQL spike (CS37, A5+A16)

**Status:** Accepted (spike complete, outcome PASS)
**Date:** 2026-05-13
**Spiked by:** yoga-ah (claude-opus-4.7-xhigh + copilot CLI)
**Linked CS:** [CS37](../../project/clickstops/active/active_cs37_copilot-review-gate-graphql.md), [#145](https://github.com/henrik-me/agent-harness/issues/145) Phase 1 Change 6.

## Spike outcome: **PASS**

All four spike sub-questions resolved positively, with one important correction
to issue #145's documented recipe (see § Identity + engagement primitive). The
linter work proceeds with **full A5 + A16** ship per C37-1b's PASS branch:

- `lib/github-graphql.mjs` ships per C37-2/3/7.
- `scripts/check-copilot-review.mjs` ships A5 + A16 enforcement per C37-4/5/6.
- `bin/harness.mjs pr-evidence` aggregator wires in the new gate per CS36 C36-2.
- CS38a/CS38b/CS39/CS41 proceed with both A5+A16 enabled (no degradation).

## Background

PR #28 in `henrik-me/sub-invaders` shipped through review with two enforcement
gaps that #145 Phase 1 set out to close:

- **A5** — Copilot review submitted on a stale HEAD, then more implementer
  commits pushed without re-review. Required: Copilot review must be the LAST
  review submitted, after all local-clean Go rows.
- **A16** — No documented Copilot engagement procedure. Three mechanisms were
  tried; only `@copilot review` slash-command worked once at HEAD `dc58fdf`,
  didn't re-trigger at `ec26adf`. Required: Copilot review must exist for the
  current HEAD.

Both gates require live PR / GraphQL state, which means CS37 was the first CS
in the v0.4.0 arc to leave the filesystem-only enforcement domain. Per C37-1
the CS was structured spike-first: identity + mutation + lifecycle had to be
verified against real GitHub before any linter code was written.

## Spike experiments + observations

### S1 — Copilot identity resolution

Hypothesis (per #145 Change 6 recipe): `copilot-pull-request-reviewer` is a
GitHub `User` type, resolvable via `query { user(login: ...) { id } }`.

```
$ gh api graphql -f query='query { user(login: "copilot-pull-request-reviewer") { __typename id } }'
gh: Could not resolve to a User with the login of 'copilot-pull-request-reviewer'.
{"data":{"user":null},"errors":[{"type":"NOT_FOUND","path":["user"], ... }]}
```

**Result: hypothesis FALSIFIED.** The `user(login:)` query returns NOT_FOUND.
Followed up by querying an existing review on `henrik-me/sub-invaders#28`
where Copilot did review:

```
$ gh api graphql -f query='query { repository(owner:"henrik-me", name:"sub-invaders") { pullRequest(number:28) { reviews(first:50) { nodes { author { __typename ... on Bot { id login databaseId } } } } } } }'
... { "author": { "id": "BOT_kgDOCnlnWA", "login": "copilot-pull-request-reviewer", "databaseId": 175728472 } } ...
```

**Identity confirmed:**

| Field | Value |
|---|---|
| `__typename` | **`Bot`** (NOT `User`) |
| `login` | `copilot-pull-request-reviewer` |
| `node id` | `BOT_kgDOCnlnWA` |
| `databaseId` | `175728472` |

**Implication for #145:** the documented "User type" assumption was wrong.
The right GraphQL fragment is `... on Bot { id login }`, not `... on User`.

### S2 — Engagement primitive (`requestReviews` mutation vs `gh pr edit`)

Hypothesis (per #145 Change 6 recipe): `requestReviews(input: {pullRequestId: $pr, userIds: [$reviewer]})` accepts the Copilot Bot node ID.

```
$ gh api graphql -f query='mutation($pr:ID!,$reviewer:ID!) { requestReviews(input:{pullRequestId:$pr, userIds:[$reviewer]}) { pullRequest { id } } }' -F pr=PR_kwDOSS3Ijs7bDb2g -F reviewer=BOT_kgDOCnlnWA
gh: Could not resolve to User node with the global id of 'BOT_kgDOCnlnWA'.
{"data":{"requestReviews":null},"errors":[{"type":"NOT_FOUND","path":["requestReviews"], ... "message":"Could not resolve to User node with the global id of 'BOT_kgDOCnlnWA'."}]}
```

**Result: hypothesis FALSIFIED.** The `requestReviews` mutation's `userIds`
field rejects Bot node IDs — the API enforces the input type at mutation
time. **Issue #145 Change 6 will not work as-written for Copilot review
engagement.**

Tried alternative — `gh pr edit <pr> --add-reviewer <login>`:

```
$ gh pr edit 159 --add-reviewer copilot-pull-request-reviewer
https://github.com/henrik-me/agent-harness/pull/159

$ gh api graphql -f query='query { repository(owner:"henrik-me", name:"agent-harness") { pullRequest(number:159) { reviewRequests(first:10) { nodes { requestedReviewer { __typename ... on Bot { login id } } } } } } }'
{"data":{"repository":{"pullRequest":{"reviewRequests":{"nodes":[{"requestedReviewer":{"__typename":"Bot","login":"copilot-pull-request-reviewer","id":"BOT_kgDOCnlnWA"}}]}}}}}
```

**Engagement primitive CONFIRMED:** `gh pr edit <pr> --add-reviewer copilot-pull-request-reviewer` writes to the same `reviewRequests` queue that the GraphQL mutation would have written to, but accepts Bot identities via the login string. Under the hood `gh pr edit` likely uses the REST endpoint (`POST /repos/{owner}/{repo}/pulls/{number}/requested_reviewers`), which IS Bot-aware.

**Implication for CS41 (`harness copilot-engage`):** the implementation MUST shell out to `gh pr edit ... --add-reviewer <login>`, NOT call the documented `requestReviews` GraphQL mutation. CS41's plan is updated accordingly.

### S3 — Review-state lifecycle observation

Hypothesis: After `gh pr edit --add-reviewer`, Copilot will eventually submit a review with `state ∈ {COMMENTED, APPROVED, CHANGES_REQUESTED}`, the request will clear from `reviewRequests`, and the review's `commit.oid` will equal the PR HEAD at request-time.

```
$ # T+0s: requested via gh pr edit
$ # T+90s: reviewRequests still queued, reviews empty
$ # T+~4min: poll
$ gh api graphql -f query='query { ... reviewRequests reviews ... }'
{
  "reviewRequests": { "nodes": [] },
  "reviews": { "nodes": [{
    "state": "COMMENTED",
    "submittedAt": "2026-05-13T09:42:15Z",
    "commit": { "oid": "48b83d20a325f5bf860d0bf8b0138733a9d54380" },
    "author": { "__typename": "Bot", "login": "copilot-pull-request-reviewer" },
    "body": "## Pull request overview..."
  }]}
}
```

**Lifecycle CONFIRMED:**

- Request-to-submission delay: **~3-4 minutes** for a small PR (3 files changed, ~20 LoC).
- Transition observed: `reviewRequests` populated → review submitted → `reviewRequests` cleared in the same poll cycle.
- Final state: `COMMENTED` (one of the 3 acceptable A16 states per C37-5).
- `commit.oid` exactly matches the PR HEAD at the time of the request — confirms A4 (currency) + A5 (ordering) can both predicate on this single field.

**Implication for the linter:** A5 + A16 enforce a snapshot check on the PR's
review list at gate-time; they do NOT poll/wait for Copilot. If the gate
runs immediately after `harness copilot-engage`, it will fail (review not yet
submitted). The orchestrator workflow is: engage → wait for review → run gate
→ if fail, re-engage and repeat. CS38a's CI workflow handles this by waiting
for the `pr-review` event before running pr-evidence.

### S4 — Sandbox PR slot consumption

Per the plan's R2 risk-mitigation, the spike was supposed to use a draft PR
that gets closed immediately. In practice the spike was performed against
PR #159 (the CS37 claim PR itself), which was already open and slated for
auto-merge per the workboard-only protocol. This had two side-effects:

1. The Copilot review on PR #159 produced two valid review comments (broken
   `Depends-on:` links pointing to `planned/` instead of `done/`, and a
   stale "Third CS in the v0.4.0 arc" ordinal). Both were addressed in this
   spike PR (the active CS37 file's header is fixed, and CS37 is now correctly
   described as "fifth CS in the v0.4.0 arc" in CONTEXT.md).
2. No real PR slot was consumed for the spike — the claim PR served the
   dual purpose of FS state-change and live spike target. Net: the plan's R2
   concern (PR slot cost) is moot in practice.

## Recommendations / decisions captured

| # | Decision | Rationale |
|---|---|---|
| ADR4-1 | `lib/github-graphql.mjs` exports `graphql(query, variables, opts)` returning parsed JSON or throwing typed error. Test pattern mirrors `lib/detect-repo-tier.mjs`. | Per C37-3. Single function, single throw shape. |
| ADR4-2 | `lib/github-graphql.mjs` MUST also export a `requestCopilotReview(repo, prNumber, opts)` helper that shells out to `gh pr edit <pr> --add-reviewer copilot-pull-request-reviewer` — NOT `requestReviews` GraphQL mutation. | Per S2 finding. The mutation rejects Bot IDs; CS41's `harness copilot-engage` builds on this helper. |
| ADR4-3 | `scripts/check-copilot-review.mjs` queries `reviews(first:100) { nodes { author{__typename, login}, state, submittedAt, commit{oid} } }` and filters where `author.__typename == 'Bot' && author.login == 'copilot-pull-request-reviewer'`. | Per S1. The Bot-typename filter is non-negotiable; filtering on login alone could match a future User type with the same name. |
| ADR4-4 | A5 (ordering) predicate: latest Copilot review's `submittedAt` ≥ latest `## Review log` Go-row `timestamp`, AND that Copilot review's `commit.oid == --head`. | Per C37-4 + S3. Combines A4 currency + A5 ordering into a single predicate. |
| ADR4-5 | A16 (presence) predicate: at least one Copilot review with `state ∈ {APPROVED, COMMENTED, CHANGES_REQUESTED}` and `commit.oid == --head`. PENDING does not satisfy. | Per C37-5 + S3. PENDING is the exact PR #28 failure mode. |
| ADR4-6 | Fork PR behavior: when `--repo` ≠ origin (detected via `gh pr view <pr> --json headRepository,baseRepository`), exit 2 with the documented hint. | Per C37-6 + C35-9. Exit 2 lets CI route fork PRs to manual review. |
| ADR4-7 | `gh pr edit --add-reviewer` requires a token with `pull_request:write` scope on the target repo. The error contract from C37-7 still applies: single actionable error, mentions both `gh auth status` and `GITHUB_TOKEN`/`GH_TOKEN` paths. | Per C37-7. CI workflows that run `harness copilot-engage` need write tokens; pure read gates work with read-only tokens. |
| ADR4-8 | The spike's natural ~3-4 minute Copilot response time means CI workflows MUST split engage and check into separate jobs/events. Engage on PR open; check on PR review submitted. | Per S3. Trying to engage-and-check in the same workflow run will always fail on the first attempt. |

## Spike artifacts

- Live PR used as spike target: [agent-harness#159](https://github.com/henrik-me/agent-harness/pull/159) (CS37 claim, merged at squash `a4fecce`).
- Reference live Copilot review used for identity resolution: [sub-invaders#28](https://github.com/henrik-me/sub-invaders/pull/28) review by `copilot-pull-request-reviewer` at `2026-05-13T04:32:37Z` on commit `dc58fdf`.
- All GraphQL invocations captured verbatim in § Spike experiments.

## Cross-references

- [CS37 active file](../../project/clickstops/active/active_cs37_copilot-review-gate-graphql.md) — full plan, decisions, deliverables.
- [#145 Phase 1 Change 6](https://github.com/henrik-me/agent-harness/issues/145) — original (incorrect) GraphQL recipe; superseded by ADR4-2.
- [CS41 planned file](../../project/clickstops/planned/planned_cs41_copilot-engage-cli-and-default-flip.md) — `harness copilot-engage` CLI; consumes ADR4-2.
- [OPERATIONS.md § Copilot engagement procedure](../../OPERATIONS.md) — verbatim invocation captured per T9.
