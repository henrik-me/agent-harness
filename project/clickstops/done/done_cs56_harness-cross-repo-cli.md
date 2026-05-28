# CS56 — `harness cross-repo` CLI guardrail

**Status:** done
**Owner:** omni-ah (Copilot CLI orchestrator, claude-opus-4.7-1m-internal)
**Branch:** cs56/content (merged at e44f6a6 via PR #216)
**Started:** 2026-05-28
**Closed:** 2026-05-28
**Filed by:** Copilot CLI planner sub-agent (2026-05-27)
**Depends on:** CS55 — cross-repo handoff doctrine must exist before this CLI enforces it; CS56 may land only after CS55 merges.

## Goal

Add a `harness cross-repo open-issue` subcommand that wraps `gh issue create` with idempotent search-then-create behavior and a uniform default `harness-orchestrator` label. The command provides a safe, memorable happy path for the Hard Rule § 6 doctrine codified in CS55: when harness orchestration needs work in a non-harness repository, it files an issue instead of opening a PR. CS56 explicitly refuses to add any `open-pr` or other non-issue write surface for repos outside `henrik-me/agent-harness`. This CS is the Phase B CLI guardrail follow-on to CS55, not a replacement for the doctrine CS.

## Background

CS55 codifies the cross-repo handoff rule: the harness orchestrator is harness-repo-only, and consumer-repo changes should be requested by issue handoff rather than direct orchestrator PRs. CS55 alone is documentation/process enforcement, so it still relies on orchestrator self-policing and memory. CS56 adds the CLI affordance that makes the right action — filing an issue in the target repo — the path of least resistance while deliberately omitting any `open-pr` affordance. It cannot prevent a raw shell `gh pr create`, but it removes that action from the harness CLI surface and gives orchestrators a safer standard command. LRN-124 is a reminder that silent failures recur when process relies only on remembered discipline; a CLI guardrail reduces that class of drift.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| D56-1 | Subcommand surface | `harness cross-repo open-issue --repo OWNER/NAME --title STRING --body-file PATH [--label LABEL ...]`. No `open-pr` surface. Other future cross-repo write actions such as `add-comment` are out of scope for CS56. | Keeps Phase B narrow and aligned to the user-confirmed issue-only handoff pattern. |
| D56-2 | Repo validation | `--repo` MUST parse as `OWNER/NAME` and, after normalizing both sides to lowercase (`repo.toLowerCase() !== 'henrik-me/agent-harness'`), MUST NOT equal the harness repo. GitHub owner/name slugs are case-insensitive in the URL/API; the test suite covers mixed-case variants (`Henrik-Me/agent-harness`, `HENRIK-ME/AGENT-HARNESS`, `henrik-me/Agent-Harness`) to prevent bypass. Harness-internal issues should use plain `gh issue create`, not this handoff command. | Prevents self-loop confusion and reserves this command for non-harness repository handoffs; closes a case-bypass attack surface. |
| D56-3 | Default label | Always add `harness-orchestrator`; additional repeated `--label` flags append and cannot replace/remove the default. If `--label` is omitted, the issue still ships with `harness-orchestrator` (no labels means default-only, not unlabeled). **Label preflight (Copilot R5, refined R9):** before `gh issue create`, `openIssue` MUST ensure every requested label exists in the target repo without overwriting consumer-owned metadata. `gh issue create --label <name>` exits non-zero with "label not found" if the label is not pre-created, which would break the doctrine's happy path for newly-onboarded consumer repos. The library invokes `gh label create <name> --repo <repo> --color 0E8A16 --description "Filed by harness orchestrator"` (**without `--force`**) for each label. On exit 0 the label is created. On non-zero exit, parse stderr: if it contains an "already exists" indication (case-insensitive substring match on `already exists`), treat as success (the consumer's existing label is preserved with whatever color/description it had); any other non-zero exit is surfaced as `CrossRepoError(kind: 'label-provision-failed')` and exits 1. Rationale (R9): `--force` would silently rewrite a consumer-owned label's color/description (e.g. a red `release-blocker` becoming green); the issue-only doctrine must not mutate consumer label metadata. | Gives every issue a uniform routing label per Q4 and ensures the issue-only doctrine does not break for first-time consumer repos without modifying consumer-owned label metadata. Aligns with CS55 D55-3. |
| D56-4 | Idempotency | Before creating, run `gh issue list --repo OWNER/NAME --search "TITLE in:title" --state open --json number,title,url`. Compare results against the **exact** input title (case-sensitive `===` against `result.title`); only an exact match short-circuits. If an exact-title open issue exists, print its URL to stdout, emit `existing open issue matched; no new issue created` to stderr, and exit 0. If no exact match exists, create the issue and print the new URL to stdout. CLOSED issues never short-circuit (always create new). **Title uniqueness contract:** all CS-driven handoff issue titles MUST be prefixed with `[harness:cs<NN>]` (e.g. `[harness:cs55] Adopt v0.6.x cross-repo handoff doctrine`) so that two different CSes targeting the same consumer repo cannot accidentally collapse onto the same issue. The CLI does NOT enforce this prefix (it's a doctrine rule documented in OPERATIONS.md § Cross-repo procedures), but the test suite asserts the example uses it. Race condition: two concurrent invocations both seeing "no match" can create duplicates; acceptable risk at current scale, documented in README. | Avoids duplicate handoff issues while keeping successful output scriptable; the prefix convention scales to many consumer repos without collision. |
| D56-5 | Body input | Require `--body-file`; do not support `--body`. The file must exist and be a regular file (no directories, no `/dev/stdin`); missing/non-file path emits `CrossRepoError(kind: 'body-file-missing')` and exits 1. | File-based bodies avoid shell-escape footguns and encourage reusable issue templates. |
| D56-6 | CLI flag guards | Every value-taking flag uses a `requireValue(args, i, flagName)` guard that verifies `args[i + 1]` exists and does not start with `-`; bad args exit 2 with usage. | Applies LRN-040 and prevents silently consuming the next flag as a value. |
| D56-7 | Implementation split | Add new `lib/cross-repo.mjs` exporting `openIssue({ repo, title, bodyFile, labels })`. Add `cmdCrossRepo` in `bin/harness.mjs`; register `'cross-repo': cmdCrossRepo` in the dispatch map at `bin/harness.mjs:3299-3315` (current dispatch map is NOT globally alphabetized — at HEAD `e533e978` the order is `init, sync, check, lint, harvest, check-migration, composed-audit, pack, pr-evidence, review-output, review, copilot-engage, plan-review-hash, version, whoami`). Insert the new entry adjacent to other existing entries without globally reordering the map — concretely, place it on a new line after `'composed-audit': cmdComposedAudit,` (line 3306) and before `pack: cmdPack,` (line 3307). Inside `cmdCrossRepo`, consume `args[0]` as the action verb (currently only `open-issue`) because the top-level dispatcher in `parseGlobalArgs` (`bin/harness.mjs:862-918`) only routes the first subcommand token; the second token (`open-issue`) is forwarded as `args[0]` to the handler. | Separates CLI parsing from testable library behavior; preserves existing dispatch ordering; documents the two-token parsing contract explicitly so implementers do not assume top-level support. |
| D56-8 | Docs ownership | Do not edit `OPERATIONS.md` in CS56; CS55 owns doctrine and CLI reference there. CS56 updates only the README CLI quick reference. | Prevents parallel-file conflicts with CS55. |
| D56-9 | Existing PR-opening surfaces | No additional guardrail is needed for raw `gh pr create` calls in existing harness code because a pre-plan audit found no `gh pr create` or `gh pr --` matches under `bin/` or `lib/`. If that changes by claim time, add a task to reject non-harness `--repo` PR creation. | Avoids speculative scope; the harness CLI currently has no cross-repo PR creation surface to guard. |
| D56-10 | Test target | Add `tests/cross-repo.test.mjs` using `node --test`. Stub `gh` through a NEW injectable child-process seam dedicated to cross-repo: env var `HARNESS_CROSS_REPO_GH_BIN` (NOT a reuse of `CHECK_REVIEW_OUTPUT_GH_BIN`, which is scoped to `scripts/check-review-output.mjs` per `tests/check-review-output.test.mjs:259-398` and mocks only `gh pr view/edit`). The seam: when `HARNESS_CROSS_REPO_GH_BIN` is set, `lib/cross-repo.mjs` invokes that binary path instead of `gh`. Tests write a fake-gh shim (Node script or bash on POSIX / `.cmd` shim on Windows) into `os.tmpdir()` per LRN-094 and point the env var at it. Never call live `gh` in tests. | Matches existing network-free test practice while keeping each fake-gh seam scoped to its consumer (avoids cross-contamination between `gh pr` and `gh issue` fakes). |
| D56-11 | Schema | No `schemas/harness.config.schema.json` changes. | The command is argument-driven and does not add config fields. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-sonnet-4.6 | rubber-duck dispatched (orchestrator: copilot-cli) | 9f3e53301d03 | 2026-05-27T15:30:00Z | Go-with-amendments | Dispatch insertion stale; CS55 label rule reconciled; README quick-ref absent; added tests for gh failures/body-file/closed-open. All amendments applied. |
| R2 | gpt-5.5 | claude-sonnet-4.6 | narrow re-attest (orchestrator: copilot-cli) | 84ee40bd3d9c | 2026-05-27T15:35:00Z | Go | Narrow re-attest after Copilot R1 PR feedback: D56-2 + T2 self-loop guard switched to case-insensitive comparison; T5 test 2 expanded to cover mixed-case bypass attempts; T5 test 6 typo fix. |
| R3 | gpt-5.5 | claude-sonnet-4.6 | narrow re-attest (orchestrator: copilot-cli) | 9bce1a6ee1fa | 2026-05-27T17:15:00Z | Go | Narrow re-attest after Copilot R5: D56-3 + T2 + T5 (tests 15-16) add `gh label create --force` preflight + tests so issue create does not fail "label not found" on new repos. |
| R4 | gpt-5.5 | claude-sonnet-4.6 | narrow re-attest (orchestrator: copilot-cli) | 8ca3ebbcc352 | 2026-05-27T20:55:00Z | Go | Narrow re-attest after Copilot R8: Deliverables `CrossRepoError` `kind` list now includes `label-provision-failed` so the documented contract matches D56-3 preflight behavior. |
| R5 | gpt-5.5 | claude-sonnet-4.6 | narrow re-attest (orchestrator: copilot-cli) | 8b07a952d551 | 2026-05-27T23:35:00Z | Go | Narrow re-attest after Copilot R9: D56-3/T2 label preflight is non-mutating (drops `--force`; "already exists" = success); T5 grows to 19 tests (R9 cases 17-19); seam covers `gh label create`. |
| R6 | gpt-5.5 | claude-sonnet-4.6 | narrow re-attest (orchestrator: copilot-cli) | 1998f1235c17 | 2026-05-28T00:10:00Z | Go | Narrow re-attest after Copilot R12: T5 adds test case 20 (empty/whitespace/non-URL stdout from `gh issue create` raises `parse-failed`); Deliverables and T7 counts bumped to 20 / N+20. |

## Deliverables

- `lib/cross-repo.mjs` (NEW) — exports `openIssue({ repo, title, bodyFile, labels })`; validates repo/title/body file/labels; performs idempotent search-then-create with label preflight; emits structured errors such as `class CrossRepoError extends Error` with stable `kind` values (`bad-input`, `gh-failed`, `parse-failed`, `body-file-missing`, `label-provision-failed`).
- `bin/harness.mjs` (EDIT) — imports `openIssue`/`CrossRepoError`; adds `cmdCrossRepo`; registers `'cross-repo': cmdCrossRepo` in the dispatch map; updates `TOP_HELP` and `SUBCOMMAND_HELP` with the new subcommand and usage.
- `tests/cross-repo.test.mjs` (NEW) — 20 test cases covering: missing flags exit 2, self-loop repo rejection (`henrik-me/agent-harness`), malformed repo slugs, missing `--body-file`, non-file `--body-file` (directory), happy-path stdout/stderr routing (with label preflight), idempotent search-hit URL return, closed-issue ignored (creates new), default `harness-orchestrator` label always applied, additional `--label` append behavior, `gh` not installed error, `gh` auth/permission failure error, malformed JSON parse-failed error, `open-pr` action absence, label-preflight success when label is missing (fake `gh label create` succeeds — NO `--force` argv — then `gh issue create` runs), label-preflight non-"already-exists" failure surfaces as `CrossRepoError(kind: 'label-provision-failed')`, label-preflight "already exists" stderr is treated as success without retry (R9 non-mutating contract), blank/whitespace-only `--title` and `--label` values reject with exit 2 (R9 validation), and `gh issue create` empty/non-URL stdout surfaces as `CrossRepoError(kind: 'parse-failed')` covering the T2 URL-validation contract (R12 case 20). Uses `HARNESS_CROSS_REPO_GH_BIN` env-var seam for fake-`gh` (scoped to `gh issue list/create` and `gh label create`); shims written under `os.tmpdir()` per LRN-094.
- `README.md` (EDIT) — creates a new `## CLI quick reference (cross-repo)` H2 section near the end of README (no such section exists today at HEAD `e533e978`). Documents `harness cross-repo open-issue` with one example, the `[harness:cs<NN>]` title prefix convention from D56-4, the always-on `harness-orchestrator` default label, and the deliberate absence of any `open-pr` action.
- `WORKBOARD.md` (EDIT) — claim-time update only, when CS56 is actually claimed after CS55 merges.
- `LEARNINGS.md` — only if implementation surfaces new learnings; file LRN-138+ if needed, not as a forced deliverable.

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1 Claim CS56 (workboard) | done | omni-ah | PR #215 merged at 49caca8 (2026-05-28). |
| T2 Implement `lib/cross-repo.mjs` | done | omni-ah | 291 lines; `openIssue` + `CrossRepoError` per D56-2/3/4/5; merged in PR #216 / e44f6a6. Implementation-PR validation: lint 30/0/3; node --test 1020/0/1; validate-schemas 143/0. |
| T3 Register `cmdCrossRepo` in `bin/harness.mjs` | done | omni-ah | Dispatch entry inserted after `composed-audit`, before `pack` per D56-7. |
| T4 Update top-level help (TOP_HELP + SUBCOMMAND_HELP) | done | omni-ah | TOP_HELP row + `SUBCOMMAND_HELP['cross-repo']` block. |
| T5 Write `tests/cross-repo.test.mjs` | done | omni-ah | 22 cases (20 planned + 2 added post-R1: path-traversal, D56-6 equal-form). |
| T6 Update README CLI quick reference | done | omni-ah | New `## CLI quick reference (cross-repo)` H2 added. |
| T7 Validate implementation | done | omni-ah | Implementation-PR validation: harness lint 30/0/3; node --test 1020/0/1; validate-schemas 143/0; existing-surface audit 0 matches. Close-out PR re-validated: lint 30/0/3; validate-schemas 144/0 (post-LRN-138). |
| T8 Plan-vs-implementation review | done | omni-ah | gpt-5.5 R1 NEEDS-FIX → R2 Go (narrow re-attest); see `## Plan-vs-implementation review`. |
| Close-out: update workboard/context restart-state docs | done | omni-ah | This PR. |
| Close-out: file learnings/follow-up (LRN-138+ if any) | done | omni-ah | LRN-138 filed: agent CLI flags accepting file paths require cwd-containment to prevent exfiltration. |

### T1 — Claiming CS56

- Preconditions:
  - Verify CS55 has merged to `main`; if not, stop before claim.
  - Re-read `INSTRUCTIONS.md` and `OPERATIONS.md` after pulling latest `main`.
  - Confirm no existing `harness cross-repo` implementation exists.
- Work:
  - Rename this file from `project/clickstops/planned/planned_cs56_harness-cross-repo-cli.md` to `project/clickstops/active/active_cs56_harness-cross-repo-cli.md`.
  - Update header fields (`Status`, `Owner`, `Branch`, `Started`) and `WORKBOARD.md` per claim workflow.
  - Use the standard workboard-only claim PR flow.
- Exit criteria:
  - Claim PR merged.
  - Active CS file exists and WORKBOARD points at CS56.
  - CS55 is already merged; no implementation begins before that condition is true.

### T2 — Implementing `lib/cross-repo.mjs`

- Add `CrossRepoError extends Error` with a stable `kind` property and optional contextual fields (`repo`, `title`, `bodyFile`, `exitCode`, `stderr`).
- Export `openIssue({ repo, title, bodyFile, labels = [] })` returning a structured result, for example `{ url, created: boolean, number?: number, title }`.
- Validate:
  - `repo` matches `^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`.
  - `repo.toLowerCase() !== 'henrik-me/agent-harness'` (case-insensitive comparison — GitHub slugs are case-insensitive in the URL/API, so `Henrik-Me/agent-harness`, `HENRIK-ME/AGENT-HARNESS`, and `henrik-me/Agent-Harness` MUST all be rejected; do not let casing bypass the self-loop guard).
  - `title` is non-empty after trimming.
  - `bodyFile` exists and is a file; the library does not infer consumer roots from `import.meta.url`.
  - `labels` are non-empty strings after trimming.
- Execute:
  - `gh issue list --repo <repo> --search "<title> in:title" --state open --json number,title,url`.
  - Parse JSON fail-closed; malformed JSON becomes `CrossRepoError(kind: 'parse-failed')` with a clear message.
  - Exact-title match returns existing issue URL without creating.
  - **Label preflight (D56-3, Copilot R5; refined R9 — non-mutating):** before invoking `gh issue create`, run `gh label create <name> --repo <repo> --color 0E8A16 --description "Filed by harness orchestrator"` (**without `--force`**) for each label being applied (default `harness-orchestrator` + any `--label` additions). On exit 0 the label is newly created. On non-zero exit, parse stderr: if it contains the substring `already exists` (case-insensitive), treat as success (consumer-owned label metadata is preserved — do NOT rewrite color/description on a label the repo already owns). Any other non-zero exit is raised as `CrossRepoError(kind: 'label-provision-failed')` with the stderr message; exit 1. This preflight is required because `gh issue create --label <name>` exits non-zero with "label not found" when the label is missing, which would otherwise break the issue-only doctrine for newly-onboarded consumer repos. The non-mutating behavior is required (R9) because `--force` would silently overwrite color/description on any pre-existing consumer label (e.g. `release-blocker` already painted red in the consumer repo).
  - Miss invokes `gh issue create --repo <repo> --title <title> --body-file <bodyFile> --label harness-orchestrator` plus every additional label. Captures stdout from `gh issue create` as plain text (the real `gh` CLI prints the new issue URL as a single line to stdout, with NO `--json` flag available on `gh issue create`); trim trailing whitespace and validate it parses as a URL before returning.
- Exit criteria:
  - Library can be unit-tested without live network through an injectable `gh` runner or fake binary seam.
  - Success output is data-only; warnings/errors are available for CLI stderr handling.

### T3 — Registering `cmdCrossRepo` in `bin/harness.mjs`

- Import `openIssue` and `CrossRepoError` from `../lib/cross-repo.mjs`.
- Add `cmdCrossRepo(args, global)` near other command handlers.
- Parse action verb as the first positional argument after `cross-repo`; support only `open-issue` in CS56.
- Parse flags:
  - `--repo <OWNER/NAME>` / `--repo=OWNER/NAME`
  - `--title <STRING>` / `--title=STRING`
  - `--body-file <PATH>` / `--body-file=PATH`
  - repeated `--label <LABEL>` / `--label=LABEL`
  - `--help`
- Use `requireValue(args, i, flagName)` for all value-taking flags; missing/flag-looking values exit 2 with `SUBCOMMAND_HELP['cross-repo']`.
- Resolve relative `--body-file` against `global.cwd` before passing to `openIssue` so the command remains consumer-root-relative.
- Register `'cross-repo': cmdCrossRepo` in the dispatch map (`bin/harness.mjs:3299-3315`) by inserting a new line AFTER `'composed-audit': cmdComposedAudit,` (line 3306) and BEFORE `pack: cmdPack,` (line 3307). Do NOT globally reorder the map (it is not alphabetized today; this CS is not a refactor).
- Inside `cmdCrossRepo`, consume `args[0]` as the action verb (`open-issue` for CS56); error with exit 2 + usage if `args[0]` is missing, unknown, or starts with `-`. The top-level dispatcher in `parseGlobalArgs` (`bin/harness.mjs:862-918`) only routes the first subcommand token, so two-token parsing (`harness cross-repo open-issue`) lives entirely inside `cmdCrossRepo`.
- Exit criteria:
  - Unknown action or unknown flag exits 2.
  - `open-issue` success prints exactly `<url>\n` to stdout.
  - Existing-issue idempotency also prints the URL to stdout and writes the no-create note to stderr.

### T4 — Updating top-level help

- Add a `TOP_HELP` row for `cross-repo`, for example: `cross-repo        Issue-only handoff helpers for non-harness repos`.
- Add `SUBCOMMAND_HELP['cross-repo']` documenting:
  - `Usage: harness cross-repo open-issue --repo OWNER/NAME --title STRING --body-file PATH [--label LABEL ...]`
  - No `open-pr` action exists.
  - Default label `harness-orchestrator` is always applied.
  - Exit codes 0, 1, and 2.
- Exit criteria:
  - `node bin/harness.mjs --help` includes `cross-repo`.
  - `node bin/harness.mjs cross-repo --help` and `... open-issue --help` document all flags.

### T5 — Writing `tests/cross-repo.test.mjs`

Add targeted `node --test` coverage with fake-`gh` via the `HARNESS_CROSS_REPO_GH_BIN` env-var seam introduced in D56-10. Fake-`gh` shims are written into `os.tmpdir()` per LRN-094 (never under REPO_ROOT). Test cases:

1. `cross-repo open-issue requires repo title and body-file flags` — each missing flag exits 2 with usage on stderr.
2. `cross-repo open-issue rejects henrik-me/agent-harness self-loop repo` — exits 2 with the self-loop error message. Covers case-insensitive variants: `henrik-me/agent-harness`, `Henrik-Me/agent-harness`, `HENRIK-ME/AGENT-HARNESS`, `henrik-me/Agent-Harness` all rejected (D56-2 contract).
3. `cross-repo open-issue rejects malformed repo slugs` — e.g. `foo`, `foo/bar/baz`, `foo/`, `/bar` all exit 2.
4. `cross-repo open-issue --body-file rejects missing path` — non-existent file path exits 1 with `body-file-missing` error.
5. `cross-repo open-issue --body-file rejects non-file path` — directory path or symlink-to-directory exits 1 with `body-file-missing` error.
6. `cross-repo open-issue happy path` — fake-gh returns `[]` from `issue list --json ...` (JSON output) then `https://github.com/foo/bar/issues/123\n` from `issue create` (plain text — matches real `gh issue create` stdout format; `gh issue create` does NOT accept `--json`); asserts stdout is exactly `<url>\n`, stderr is empty on success, exit 0.
7. `openIssue returns existing open issue URL on exact title match` — fake-gh `issue list` returns `[{"title":"<exact>","url":"<url>","number":42}]`; asserts no `issue create` call, stdout = `<url>\n`, stderr contains `existing open issue matched; no new issue created`.
8. `openIssue ignores closed exact-title issues and creates new` — fake-gh `issue list --state open` returns `[]` (closed issues filtered out by `--state open`); asserts `issue create` IS invoked.
9. `openIssue applies harness-orchestrator label when --label omitted` — fake-gh asserts `issue create` argv contains `--label harness-orchestrator` exactly once and no other `--label` flags.
10. `openIssue appends repeated --label values after the default label` — fake-gh asserts `issue create` argv contains `--label harness-orchestrator` AND `--label harness-sync` AND `--label release-blocker` (in that order; harness-orchestrator first).
11. `openIssue fails closed when gh is not installed` — `HARNESS_CROSS_REPO_GH_BIN` points at a non-existent path; expects `CrossRepoError(kind: 'gh-failed')` with a clear "gh not found" message; exit 1.
12. `openIssue fails closed on gh auth/permission failure` — fake-gh exits non-zero with stderr `HTTP 403: forbidden`; expects `CrossRepoError(kind: 'gh-failed')` propagating stderr; exit 1.
13. `openIssue fails closed on malformed JSON from gh issue list` — fake-gh outputs `not-json` on stdout; expects `CrossRepoError(kind: 'parse-failed')`; exit 1.
14. `cross-repo exposes no open-pr action` — `harness cross-repo open-pr ...` exits 2 with usage; `harness cross-repo --help` does not mention `open-pr`.
15. `openIssue runs label preflight before issue create` — fake-gh `label create harness-orchestrator` succeeds (exit 0, no `--force` in argv); fake-gh `issue list` returns `[]`; fake-gh `issue create` succeeds. Asserts the recorded argv sequence is `label create harness-orchestrator ...` (NO `--force` flag) BEFORE `issue create`; if `--label foo` is also passed, a second `label create foo ...` runs first. Covers D56-3 preflight contract (Copilot R5, refined R9).
16. `openIssue fails closed when label preflight cannot provision label` — fake-gh `label create` exits non-zero with stderr `HTTP 403: forbidden` (not "already exists"); asserts `CrossRepoError(kind: 'label-provision-failed')` propagating stderr; exit 1; no `issue create` is attempted.
17. `openIssue treats "already exists" label-preflight failure as success (non-mutating)` — fake-gh `label create harness-orchestrator` exits non-zero (e.g. exit 1) with stderr `! a label with this name already exists; not modifying it`; asserts NO error is raised, NO retry with `--force`, and `issue create` proceeds normally (exit 0). Covers Copilot R9 non-mutating contract — preserves consumer-owned label color/description.
18. `cross-repo open-issue rejects blank/whitespace-only --title` — `--title ''`, `--title '   '`, `--title '\t\n'` each exit 2 with usage on stderr (validation per Tasks T2 "non-empty after trimming").
19. `cross-repo open-issue rejects blank/whitespace-only --label values` — `--label ''`, `--label '   '` each exit 2 with usage on stderr; mixed valid+blank (`--label good --label ''`) also exits 2 (validation per Tasks T2 "labels are non-empty strings after trimming").
20. `openIssue fails closed when gh issue create stdout is empty/non-URL` — three sub-cases all exit 1 with `CrossRepoError(kind: 'parse-failed')`: (a) fake-gh `issue create` exits 0 with empty stdout, (b) exits 0 with whitespace-only stdout (`"   \n"`), (c) exits 0 with non-URL text (`"created successfully\n"` or `"not-a-url"`). Asserts the error message references the unexpected output. Covers T2 contract "trim trailing whitespace and validate it parses as a URL before returning" (Copilot R12).

- Do not call live `gh`.
- Assert stdout/stderr routing: URL to stdout; existing-match note to stderr; usage and errors to stderr.
- Assert bad-usage CLI exits are 2.
- Exit criteria:
  - Targeted test file passes alone with `node --test tests/cross-repo.test.mjs`.
  - Full `node --test` count increases by the new test count and remains green.

### T6 — Updating README quick reference

- Audit README first: as of HEAD `e533e978`, README has Quickstart (L32+) and repo/process sections but NO dedicated CLI subcommand quick-reference list (the help text lives in `harness --help` / `bin/harness.mjs:TOP_HELP`).
- Create a new H2 section `## CLI quick reference (cross-repo)` near the end of README (after Quickstart, before any "Contributing" / "License" tail sections if present). Scope this CS56 section narrowly to `cross-repo`; a broader CLI quick-reference for the whole harness is out of scope.
- Section content:
  - One-paragraph intro: "When harness orchestration needs work in a non-harness repository (e.g. `henrik-me/sub-invaders`), Hard Rule § 6 (see `template/managed/.github/copilot-instructions.md`) requires filing a GitHub issue rather than opening a PR. The `harness cross-repo open-issue` command is the supported way to do this."
  - Example:

```bash
node bin/harness.mjs cross-repo open-issue \
  --repo henrik-me/sub-invaders \
  --title "[harness:cs55] Adopt v0.6.x cross-repo handoff doctrine" \
  --body-file issue-body.md \
  --label harness-sync
```

  - Notes: `harness-orchestrator` is always added automatically and additional labels append; titles MUST be prefixed with `[harness:cs<NN>]` for idempotency safety across CSes (D56-4); there is intentionally NO `harness cross-repo open-pr` command; the command refuses `--repo henrik-me/agent-harness` (use plain `gh` for harness-internal issues).
- Exit criteria:
  - README has a new `## CLI quick reference (cross-repo)` H2 section.
  - The example uses the `[harness:cs<NN>]` title prefix per D56-4.
  - The command appears exactly once in user-facing docs (this section); `OPERATIONS.md` is NOT edited in CS56.

### T7 — Validating implementation

- Run `node --test tests/cross-repo.test.mjs` first.
- Run full `node --test`; record the count delta, e.g. `N → N+20 tests; all pass` (20 cross-repo test cases per T5).
- Run `node -c lib/cross-repo.mjs`.
- Run `node bin/harness.mjs lint --quiet` or `harness lint --quiet`; expected self-host baseline after CS54/CS55 should be verified at claim time, currently planned as `30/0/3`.
- Run `node scripts/validate-schemas.mjs`.
- Re-run the existing-surface audit: grep `bin/` and `lib/` for `gh pr create` and `gh pr --`; expected result is no matches. If matches exist, stop and escalate because D56-9 no longer holds.
- Exit criteria:
  - All commands exit 0 except the deliberate grep no-match audit.
  - Validation evidence is recorded in the active CS file and PR body.

### T8 — Plan-vs-implementation review

- After the content PR has merged to `main` and BEFORE the close-out PR opens (per `OPERATIONS.md § Plan-vs-implementation review (close-out gate)`), dispatch the GPT-5.5 plan-vs-implementation review against the actual landed diff.
- Reviewer must be independent from every implementer model used.
- Record the review result in the active CS file's `## Plan-vs-implementation review` section before the close-out PR opens.
- NEEDS-FIX blocks close-out until addressed and re-reviewed (a follow-up content PR re-runs the gate against the new landed diff before close-out resumes).
- Exit criteria:
  - Latest plan-vs-implementation review verdict is `Go` or `Go-with-amendments` with amendments applied.
  - Review evidence references the merged content-PR HEAD, not an earlier draft.

### T9 — Closing out CS56

- After merge, rename `active_cs56_harness-cross-repo-cli.md` to `done_cs56_harness-cross-repo-cli.md`.
- Update `WORKBOARD.md` to remove the active row.
- Update `CONTEXT.md` if current-state or suggested-next-CS pointers change.
- File any implementation learnings as LRN-138+ and link them from the done CS file.
- Run close-out validation (`harness lint`, schema validation, and any required doc checks) before the close-out PR.
- Exit criteria:
  - Close-out PR merged.
  - Done CS file records tasks, validation evidence, reviewer evidence, and any learnings.

## Validation

Acceptance checks for CS56 implementation:

- `node --test tests/cross-repo.test.mjs` exits 0.
- Full `node --test` exits 0 with a recorded test-count delta.
- `node -c lib/cross-repo.mjs` exits 0.
- `node bin/harness.mjs lint --quiet` / `harness lint --quiet` exits 0; expected post-CS54/CS55 baseline to confirm at claim time is `30/0/3`.
- `node scripts/validate-schemas.mjs` exits 0.
- `node bin/harness.mjs --help` and `node bin/harness.mjs cross-repo --help` document the new command.
- CLI behavior checks:
  - Missing value-taking flags exit 2 and print usage to stderr.
  - `--repo henrik-me/agent-harness` exits 2.
  - Existing open exact-title issue prints existing URL to stdout and creates nothing.
  - Search miss creates one issue with `harness-orchestrator` plus any additional labels.
  - No `open-pr` action exists.
- Existing PR-surface audit: `bin/` and `lib/` have no `gh pr create` or `gh pr --` matches. If a match appears later, D56-9 must be revisited before merge.
- No `OPERATIONS.md` changes are included in the CS56 diff.

## Plan-vs-implementation review

**Reviewer:** gpt-5.5
**Date:** 2026-05-28
**Outcome:** Go (after NEEDS-FIX→Go cycle)

R1 (at ff2b226) verdict NEEDS-FIX surfaced two findings:
- **Blocking:** `--body-file` accepted relative `../../secret` paths and out-of-tree symlinks; `gh issue create --body-file` would upload them (path-traversal / data-exfiltration surface).
- **Non-blocking:** `--flag=value` forms bypassed the D56-6 dash-prefix/empty-value guard that already protected `--flag value` form.

Amendments at 2baf510:
- `cmdCrossRepo` now realpath-resolves both `global.cwd` and `--body-file`; `path.relative()` must not start with `..` or be absolute (exit 2 otherwise). ENOENT falls through to library's `body-file-missing` for clearer error.
- Shared `extractValue(flag, eqValue, i)` helper applies the D56-6 guard to both `--flag value` and `--flag=value` forms.
- Tests 21 (path-traversal rejection via sibling tmpdir body-file) and 22 (8 sub-cases for empty/dash-prefixed equal-form values) added; `runCli` test helper updated to spawn child with `cwd: scratch` so absolute bodyFile paths under tmpdir pass containment.

R2 (at 2baf510) narrow re-attest on the R1→R2 delta: verdict **Go**, both findings materially fixed, no new blocking issues.

| Decision / Task | Implementation evidence (PR #216 / e44f6a6) | Conformance |
|---|---|---|
| D56-1 surface | `lib/cross-repo.mjs` exports `openIssue`; `cmdCrossRepo` action verb `open-issue` only; no accepted `open-pr` action / no `open-pr` implementation path anywhere (intentional `open-pr` mentions in help text, README, and tests assert its absence). | Conforms |
| D56-2 repo validation | Library validates `OWNER/NAME` regex + `.toLowerCase() !== 'henrik-me/agent-harness'`; tests 2-6 cover mixed-case bypass. | Conforms |
| D56-3 label preflight (non-mutating) | `preflightLabels` runs `gh label create` without `--force`; "already exists" stderr (case-insensitive) treated as success; tests 17-19. | Conforms |
| D56-4 idempotency | `findExistingOpenIssue` calls `gh issue list --state open`; exact-title `===` match short-circuits; closed issues never match. | Conforms |
| D56-5 body-file only | Library accepts `--body-file` only; no `--body`; missing/non-file → `body-file-missing`. | Conforms |
| D56-6 flag guards | Shared `extractValue` rejects empty + dash-prefixed values for both forms (post-R1 fix). | Conforms (after R2 fix) |
| D56-7 dispatch insertion | `'cross-repo': cmdCrossRepo` inserted between `'composed-audit'` and `pack`; map not globally reordered. | Conforms |
| D56-8 docs ownership | README-only edit; OPERATIONS.md untouched in CS56 diff. | Conforms |
| D56-9 existing PR-surface audit | Post-merge audit: 0 `gh pr create` / `gh pr --` matches in bin/lib. | Conforms |
| D56-10 test seam | `HARNESS_CROSS_REPO_GH_BIN` env-var; fake-gh under `os.tmpdir()` (LRN-094); detected `.mjs/.js/.cjs` paths spawned via `process.execPath`. | Conforms |
| D56-11 no schema change | `schemas/` untouched. | Conforms |
| T1 claim CS56 | Workboard claim PR #215 merged at 49caca8. | Conforms |
| T2 implement library | `lib/cross-repo.mjs` 291 lines. | Conforms |
| T3 register handler | Dispatch entry + import in `bin/harness.mjs`. | Conforms |
| T4 update help | TOP_HELP row + `SUBCOMMAND_HELP['cross-repo']` block. | Conforms |
| T5 write tests | `tests/cross-repo.test.mjs` 22 cases. | Conforms |
| T6 README quick reference | `## CLI quick reference (cross-repo)` H2. | Conforms |
| T7 validate | lint 30/0/3; node --test 1020/0/1; validate-schemas 143/0 at impl-PR; existing-surface audit 0. | Conforms |
| T8 plan-vs-impl review | This section. | Conforms |
| T9 close-out (rename, WORKBOARD/CONTEXT, LRN-138) | This PR (cs56/close). | Conforms |
| Path-traversal security (post-R1) | `realpathSync`-based cwd containment in `cmdCrossRepo`; test 21. | Conforms |
| D56-6 fidelity (post-R1) | Shared `extractValue` helper; test 22 (8 sub-cases). | Conforms |

**Per-deliverable outcome:**

| Deliverable | Shipped at | Outcome |
|---|---|---|
| `lib/cross-repo.mjs` (NEW, 291 lines) | e44f6a6 | Conforms — generic library; CLI-layer containment kept out per D56-7 split. |
| `bin/harness.mjs` (EDIT) | e44f6a6 | Conforms — handler, dispatch entry, TOP_HELP, SUBCOMMAND_HELP, realpath cwd containment, shared `extractValue`. |
| `tests/cross-repo.test.mjs` (NEW, 22 cases) | e44f6a6 | Conforms — exceeds plan (20 → 22 after R1 path-traversal + D56-6 equal-form cases). |
| `README.md` (EDIT) | e44f6a6 | Conforms — new `## CLI quick reference (cross-repo)` H2 with `[harness:cs<NN>]` prefix example. |
| `WORKBOARD.md` (EDIT) | 8d5aed8 (this PR) | Conforms — CS56 row cleared from Active Work. |
| `LEARNINGS.md` (EDIT) | 8d5aed8 (this PR) | Conforms — LRN-138 filed (path-traversal containment pattern). |

**Test-coverage assessment:** sufficient. All 11 plan decisions (D56-1…D56-11) and the two post-R1 amendments have dedicated coverage in `tests/cross-repo.test.mjs` (cases 1-22). Path-traversal regression is locked at test 21; D56-6 equal-form regression at test 22 (8 sub-cases). Library-only error paths (`gh-failed`, `parse-failed`, `body-file-missing`, `label-provision-failed`) all have explicit cases. No untested decision paths.

## Notes / Learnings

- CS56 is Phase B of the cross-repo handoff plan; CS55 (doctrine + Hard Rule §6 + LRN-137) preceded it and merged at 00998a0.
- User-confirmed rule scope: any repo other than `henrik-me/agent-harness`. CLI enforces by rejecting the harness repo (case-insensitive) and exposing only issue creation for non-harness repos.
- Pre-plan audit found no existing `harness cross-repo` subcommand and no `gh pr create` / `gh pr --` surface in `bin/` or `lib/`; post-merge re-audit confirms still 0 matches.
- Existing tests demonstrate fake-`gh` seams via `CHECK_REVIEW_OUTPUT_GH_BIN` (scoped to `gh pr view/edit`); CS56 introduces its own `HARNESS_CROSS_REPO_GH_BIN` seam scoped to `gh issue list/create` and `gh label create` to avoid cross-contamination between fakes.
- `bin/harness.mjs` dispatcher is not globally alphabetized; CS56 inserts the new entry between `composed-audit` and `pack` without globally reordering (preserved as plan-time decision D56-7).
- **LRN-138 candidate (filed below):** agent-driven CLI flags that accept file paths must default to cwd-containment (realpath check) to prevent implicit exfiltration via downstream tools that upload file contents (`gh issue create --body-file`, `curl --data-binary @file`, etc.). The library layer can remain generic; the CLI layer is the right place for the containment policy. Surfaced by gpt-5.5 R1 on PR #216.
