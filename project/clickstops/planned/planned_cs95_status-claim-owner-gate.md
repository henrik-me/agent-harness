# CS95 — harness status/claim: gate active-CS ownership by full agent-id (concurrent same-machine clones)

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** yoga-ah (Claude Opus 4.8), 2026-07-03 — from inbound bug report #417 (filed by the harness orchestrator running in consumer repo `henrik-me/authzandentitlements`).
**Depends on:** none (hard). Touches `lib/status.mjs`, `lib/claim.mjs`, `bin/harness.mjs` (cmdClaim + help), tests. No in-flight CS owns these surfaces.

## Goal

Fix #417: `harness status` and `harness claim` never compare a clickstop's **Owner** to the current **agent-id**, so an orchestrator in a concurrent same-machine clone (`yoga-ae-c3`) can mistake another orchestrator's active CS (owned by `yoga-ae`) for its own and resume/adopt it — worsened by the base id being a **prefix** of the suffixed id. Make ownership explicit in `status` output and gate the `claim` resume/already-active path on an exact full-agent-id match.

## Background

Both verbs already hold both values but never compare them:

- **`status`** (`lib/status.mjs` `formatStatusReport`) prints `agent <id>` and, per row, `owner=<owner>`, but never flags a mismatch. The templated INSTRUCTIONS.md frames `harness status` as a "resume snapshot" ("resume rather than restart"), so another orchestrator's active CS reads as *your* work.
- **`claim`** (`lib/claim.mjs` `runClaimFromDisk`, already-active branch ~L700-763): on an already-`active/` CS it verifies a WORKBOARD Active Work row exists for the CS **by CS id only** (L744, exact-id) and returns `{ok:true, alreadyClaimed:true}` — a benign no-op — **without comparing the row's Owner to the current `agentId`**. So `harness claim CS10` from `yoga-ae-c3` on a CS owned by `yoga-ae` reports "already claimed, no-op" and silently treats it as the current agent's.

The full agent-id (incl. the `-c<N>` clone suffix) is already derived by `deriveAgentId` (`bin/harness.mjs` L4405; `${machineShort}-${agentSuffix}[-${cloneSuffix}]`) and threaded into both `cmdStatus` (→ `snapshot.agentId`) and `cmdClaim` (→ `runClaimFromDisk` `agentId`). The fix is purely comparison logic + a new escape-hatch flag; no id-derivation change. Exact string equality is the correct comparator: `yoga-ae !== yoga-ae-c3`, so it is prefix-collision-safe (a substring/`startsWith` comparator would NOT be).

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C95-1 | `status` ownership annotation | In `formatStatusReport`, when `agentId` is a real id (not null / not `"unknown"`), annotate each **Active Work** row and each **On-disk active** row with ownership relative to the current agent: owned → ` (you)`; not-owned → ` (not you: <agentId>)`. On-disk rows carry no owner, so join to the Active Work rows by CS id (exact, upper-cased) to source the owner; a listing with no matching WORKBOARD row is annotated ` (owner unknown — no WORKBOARD row)`. Annotations are **appended** to each line (never inserted mid-field) so existing substring assertions stay valid. | Directly satisfies acceptance #1 ("visibly marks that row as not-owned-by-you"). Appending (vs. restructuring into split sections) keeps the section headers that INSTRUCTIONS/startup reference and minimises test churn while still making ownership unambiguous "at a glance". Exact-match is prefix-collision-safe. |
| C95-2 | `claim` already-active owner gate | In `runClaimFromDisk`'s already-active branch, after confirming the WORKBOARD Active Work row exists, compare that row's **Owner** to `agentId`. If they differ and `--takeover` was not passed, **refuse**: `{ok:false, errors:["CS<NN> is already active and owned by a DIFFERENT orchestrator (owner=<owner>, you=<agentId>); refusing to adopt it. Coordinate with the owner, or pass --takeover to reassign ownership to <agentId>."]}` (exit 1). If owner equals `agentId`, unchanged (`alreadyClaimed` no-op). | Satisfies acceptance #2 ("no resume/claim path silently adopts an active CS owned by a different — incl. suffix-differing — agent-id"). The refusal is loud, names the owner and the current id, and does not mutate anything. |
| C95-3 | `--takeover` escape hatch (reassign) | Add a `--takeover` flag to `harness claim` (threaded as `runClaimFromDisk({takeover})`). It only affects the already-active owner-mismatch branch. With `--takeover`: under `--apply`, reassign the WORKBOARD Active Work row's **Owner → agentId** and **Last Updated → today** (a bounded one-row edit via a new `reassignActiveWorkRowOwner` helper), write `WORKBOARD.md`, and return `{ok:true, takeover:true, message:"Took over CS<NN> from <old-owner>; Owner reassigned to <agentId> in WORKBOARD.md — commit on a takeover branch."}`; under dry-run (no `--apply`), return `{ok:true, takeover:true, dryRun:true, message:"Would take over CS<NN> from <old-owner> (reassign Owner → <agentId>); re-run with --apply."}`. `--takeover` on a non-mismatch (owned or planned) CS is a no-op passthrough. | A refuse-with-no-escape dead-ends a legitimate takeover (owner offline/abandoned) into manual WORKBOARD editing — the exact error-prone step the harness avoids. Reassigning Owner is the meaningful takeover so subsequent `status`/`claim` from the new agent are consistent; branch/state/title are preserved (same work continues). Mutation only under `--apply`, matching the verb's dry-run/apply model. The verb still NEVER commits. |
| C95-4 | Exact full-id comparison | Ownership equality is exact trimmed-string equality on the full derived agent-id (incl. any `-c<N>` suffix). No `startsWith`/prefix/substring matching anywhere. Comparison is skipped (no annotation / no gate) only when `agentId` is null or the literal `"unknown"`. | The reported trap is precisely the base-vs-suffixed prefix collision; exact match is the only correct comparator. When the id cannot be derived (`unknown`), silently skipping is safer than a false mismatch. |
| C95-5 | Help-text doctrine note | Extend `bin/harness.mjs` `SUBCOMMAND_HELP` for `status` and `claim` with a one-line ownership note (status marks not-you rows; claim refuses a different-owner active CS unless `--takeover`). No template (`INSTRUCTIONS.md`/`OPERATIONS.md`) edits in this CS. | Documents the behavior at the point of use without expanding into composed/managed template surface (kept out of scope; a doctrine line in the process docs can be a follow-up). |
| C95-6 | SemVer | **Minor** — adds the new `--takeover` CLI flag (a backward-compatible CLI-surface addition). The `status` annotation + `claim` owner-gate alone would be a Patch, but the new flag drives Minor. CHANGELOG `[Unreleased]` → **Added** (`--takeover`) + **Fixed** (ownership gate/annotation, #417). | New backward-compatible CLI flag is a feature (Minor per SemVer spirit; nearest table row: "New CLI subcommand added → Minor"). No flag removed/renamed, no schema change. |

## Deliverables

1. `lib/status.mjs` (edit) — ownership annotation in `formatStatusReport` (C95-1/C95-4): a small `ownershipNote(owner, agentId)` helper + Active-Work/On-disk-active join-by-CS-id.
2. `lib/claim.mjs` (edit) — already-active owner gate (C95-2) + `takeover` param + `reassignActiveWorkRowOwner(workboardMd, csId, newOwner, lastUpdated)` helper (C95-3). Preserve all existing partial-state / ambiguous / I/O-error branches.
3. `bin/harness.mjs` (edit) — `cmdClaim` parses `--takeover` (+ `--takeover=`… n/a; boolean) and threads it to `runClaimFromDisk`; handle the `takeover` result shape (print message, exit 0); `SUBCOMMAND_HELP['claim']` + `['status']` ownership notes (C95-5).
4. `tests/lib-status.test.mjs` + `tests/lib-claim.test.mjs` (edit/new, `os.tmpdir()` only) — status: owned → `(you)`, not-owned → `(not you: …)`, on-disk join, unknown-agent no-annotation, prefix-collision (`yoga-ae` vs `yoga-ae-c3`) not-owned. claim: owner-match still `alreadyClaimed`; owner-mismatch refuses (names owner+you); `--takeover` dry-run previews; `--takeover --apply` reassigns Owner+Last Updated in WORKBOARD; `reassignActiveWorkRowOwner` unit. **Update** the existing `alreadyClaimed` tests that pass a mismatching `agentId` (e.g. owner `omni-ah` / agentId `test-agent`) to align with the new gate (use a matching id for the happy path; add the mismatch case as its own test). Minimum: cover each new branch.
5. `CHANGELOG.md` (edit) — `[Unreleased]` Added (`--takeover`) + Fixed (#417 ownership gate/annotation).
6. `LEARNINGS.md` (edit, at close-out) — file the "compare full agent-id, never prefix-match; resume/no-op paths must gate on ownership" learning; cross-ref #417.

## User-approval gates

- **(none)** — self-contained CLI safety fix + a backward-compatible flag. `--takeover` mutates only `WORKBOARD.md` under `--apply` (the verb never commits); the release that ships it is CS96.

## Exit criteria

- `harness status` from an agent-id differing from an active CS Owner marks that row not-owned-by-you (unit test asserts ` (not you: <agentId>)`), including the `yoga-ae` vs `yoga-ae-c3` prefix case; an owned row shows ` (you)`.
- `harness claim CS<NN>` on an already-active CS whose Owner ≠ current agent-id **refuses** (exit 1, names the owner) unless `--takeover`; with `--takeover --apply` it reassigns Owner to the current agent-id in `WORKBOARD.md`.
- Owner-matches-you still returns the `alreadyClaimed` no-op (regression preserved).
- `node --test tests/*.test.mjs` passes (incl. updated existing claim tests); `node bin/harness.mjs lint --quiet` exits 0.
- #417 closes on merge.

## Risks + open questions

- **R1 — existing test breakage (expected).** The owner gate changes the outcome of `alreadyClaimed` tests that pass a mismatching `agentId`; those are updated in-CS (Deliverable 4), not grandfathered. Confirmed: `tests/lib-claim.test.mjs` L777-806 uses owner `omni-ah` / agentId `test-agent`.
- **R2 — status output stability.** Annotations are appended per line so existing `assert.match` (substring, no `$` anchor) assertions hold; verified against `tests/lib-status.test.mjs` L236-237. No section-header change.
- **R3 — takeover mutation scope.** `--takeover --apply` edits exactly one WORKBOARD row's Owner + Last Updated (not branch/state/title). It runs in the pre-worktree-clean idempotency region; the user reviews the diff and commits on a takeover branch (verb never commits). Documented in the message.
- **(Resolved) OQ — split vs annotate.** The issue "ideally" wants split "Your"/"Other" sections; inline annotation is chosen (C95-1) as equally clear at-a-glance with far lower test/structure churn. A structural split can be a follow-up.

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | cs95-plan-review | 973dc1086ca1 | 2026-07-03T19:55:22Z | Go | All fact-claims held (status/claim/CLI/test citations); exact full-id equality + refuse-by-default + --takeover sound. Close-out has same gap but is out of CS95 scope (noted follow-up). |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per § Claim) | planned | — | — |

## Notes / Learnings

- Bundles inbound #417. Root cause: `status`/`claim` never compared clickstop Owner to the current full agent-id; the already-active claim no-op adopted a different-owner CS. Fix: exact full-id comparison + `--takeover` escape hatch.

## Plan-vs-implementation review

> _(filled at close-out per the gate)_
