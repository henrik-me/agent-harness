# CS120 — Detect (and retroactively fix) planned clickstops whose work already shipped: claim-time lifecycle-bypass gate

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** omni-ah (orchestrator, `claude-opus-5`) on 2026-07-24. Surfaced during a maintainer-requested repo evaluation: `harness status` on `main` @ `8deaa32` still offers **CS114, CS115, CS116, CS117** as claimable although all four have merged content PRs.
**Depends on:** none. (Strongly related: **CS110** — first-class HELD state for planned clickstops; both add machine-readable claim-readiness signals and should reuse one mechanism.)

## Goal

Stop the planned queue from silently diverging from `main`: make every content commit **declare** the clickstop it implements via a durable git trailer, use that declaration to block a claim that would redo shipped work, and retroactively reconcile the four clickstops currently in that state.

Note on reliability: a purely retrospective scan of commit subjects **cannot** be made complete — see C120-3 and R2. CS115's content commit (`fix(test): make CS91 bash-execution guard a trim-capability probe (WSL-robust) (#539)`) names CS91, the *subject* of the fix, and contains the string "CS115" nowhere. No subject grammar can recover that link. The reliable signal must therefore be **declared at commit time**; the retrospective scan is a best-effort backstop for the pre-declaration backlog.

## Background

On `main` @ `8deaa32`, four consecutive clickstops shipped **outside** the documented three-PR lifecycle (`OPERATIONS.md:124-144` — "Every CS produces exactly three PRs in sequence"):

| CS | Filing PR | Content PR (merged) | Claim PR | Close-out PR | On-disk state |
|---|---|---|---|---|---|
| CS114 | #537 | **#542** `feat(hooks): … (CS114)` | *(none)* | *(none)* | `planned/` |
| CS115 | #538 | **#539** `fix(test): … WSL-robust` | *(none)* | *(none)* | `planned/` |
| CS116 | #540 | **#541** `feat(review): … (CS116)` | *(none)* | *(none)* | `planned/` |
| CS117 | #543 | **#544** `docs(conventions): … (CS117)` | *(none)* | *(none)* | `planned/` |

Contrast CS113, which followed the shape correctly: claim #532 → content #534 → close-out #535.

Consequences observed:

- `harness status` lists all four under "Planned queue (9)" as available work. An orchestrator claiming CS116 today would re-implement an already-merged change.
- `project/clickstops/done/` has no `done_cs114..117` files, `active/` is empty, and WORKBOARD Active Work reads "no active CS" — so *every* status surface agrees the work is not done, while `main` says otherwise.
- No linter, gate, or CI check flagged it. `harness lint` is green at 43/0/3.
- There are no in-flight close-out PRs (the only two open PRs are Dependabot #311/#536), so this is settled divergence, not work-in-progress.

The harness has no reconciliation between the planned queue and merged `main`. Every existing clickstop gate validates a file's *internal shape*; none validates the file's *claim about reality*.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C120-1 | **Primary signal — a durable commit trailer** | Content commits carry a `Clickstop: CS<NN>` **git trailer**. The reconciler resolves a planned CS as *shipped* when a commit reachable from `main` carries its id in that trailer | Chosen specifically because it is **durable and offline-readable**: trailers live in the commit object, so `git log --format=%(trailers)` answers the question with no GitHub API, no auth, no pagination, and no network. A PR-body field would not survive into git history and would force every consumer of the signal (claim, status, lint) to call the API. The repo already enforces a trailer convention (`Co-authored-by`) via the existing `commit-trailers` CI job, so this reuses a proven mechanism. |
| C120-2 | Branch classification (which commits must carry the trailer) | Deterministic, by **head branch grammar**: `cs<NN>/<slug>` is a **content** branch ⇒ trailer required and its id must equal `<NN>` — except the reserved lifecycle slugs `claim`, `close`, `close-out`. `workboard/*`, `docs/file-planned-*`, and Dependabot branches are **lifecycle/exempt** ⇒ the trailer is **forbidden**. Anything else ⇒ exempt with a warning | Verified against real heads: content branches use varied slugs — `cs115/fix-cs91-bash-capability-probe`, `cs114/implement-no-memory-hook`, `cs116/bump-review-model`, `cs117/revise-conventions-test-naming`, and only `cs113/content` uses the literal slug. Matching only `cs<NN>/content` would have exempted four of the five most recent content PRs, defeating completeness. The grammar matches `copilot-instructions.md` ("Branch names: `csNN/<slug>` for CS work; `workboard/csNN-<action>`"). |
| C120-3 | Trailer is **forbidden** on lifecycle branches | The `commit-trailers` job rejects a `Clickstop:` trailer on any exempt branch; the `prepare-commit-msg` hook adds it **only** on classified content branches | After squash-merge, branch provenance is gone from `main` — so a lifecycle commit that carried the trailer would be indistinguishable from content and would create a **false shipped signal**, which is worse than the gap being closed. Forbidding it at the only point where branch context still exists is what keeps the signal sound. |
| C120-4 | Squash-message preservation is a **precondition**, not a post-merge hope | The trailer signal requires the repo's squash-merge message setting to preserve commit messages. Verified on the harness: `squash_merge_commit_message = COMMIT_MESSAGES` (custom trailers such as `Copilot-Session` demonstrably survive on `main`). Implementation adds this as (a) an explicit precondition checked before the gate is enabled and (b) an **adoption check** surfaced to consumers, whose repos may differ — failing closed with guidance rather than silently degrading | Verifying only after CS120 merges would be too late, and a consumer with `PULL_REQUEST_BODY` squash messages would lose the trailer entirely, turning a blocking gate into a silent no-op. Making the setting an enforced precondition keeps the signal trustworthy wherever the harness is adopted. |
| C120-5 | **Backstop signal — retrospective, advisory only** | For merged work predating the trailer, additionally scan merged-commit subjects for the id in either observed content form — `(CS<NN>)` (e.g. #541/#542/#544) or a leading `CS<NN>:` (e.g. `CS113: …`, commit `2fafb01`) — and treat a hit as an **advisory** signal, never a hard block | Recovers 3 of the 4 known cases at near-zero cost while being explicit that it is incomplete. Advisory-only means its false negatives cannot create false confidence and its false positives cannot deadlock a claim. |
| C120-6 | False-positive exclusion grammar | Exclude subjects whose conventional-commit scope or leading phrase marks them as lifecycle bookkeeping: `docs: file planned …`, `chore(workboard): …`. Applied to the C120-5 backstop scan only | Verified against real subjects: filing commits read `docs: file planned CS116 (…)` and claim/close-out read `chore(workboard): claim CS113 …`. These mostly would not match C120-5's grammar anyway — the exclusion is defence-in-depth, not the primary protection, and is documented as such rather than overclaimed. |
| C120-7 | Primary enforcement point | **`harness claim` preflight — blocking on the C120-1 trailer signal**, advisory on the C120-5 backstop, with an explicit `--allow-shipped "<reason>"` override | Claim time is where the waste occurs. Blocking only on the durable signal keeps the gate trustworthy; the heuristic warns without ever deadlocking a legitimate claim. |
| C120-8 | Override persistence | `--allow-shipped "<reason>"` appends a dated row to a `## Claim overrides` subsection of the claimed CS file's `## Notes / Learnings`, recording agent, UTC timestamp, the matched evidence, and the reason. Re-running is idempotent (no duplicate row for the same evidence) and never rewrites existing rows | An override that leaves no artefact is indistinguishable from the bypass this CS exists to prevent. Naming the exact location + idempotency rule makes it testable rather than aspirational. |
| C120-9 | Secondary surface | `harness status` prints a `⚠ shipped-but-planned` marker beside affected queue entries (advisory, exit code unchanged) | Status is the orientation surface an agent reads first; a marker there prevents the mistake before claim is attempted, without breaking scripts that parse the exit code. |
| C120-10 | `harness lint` posture | Add a `clickstop-queue-reconciliation` linter that **skips** (not fails) when git history is unavailable or shallow, and otherwise errors on the C120-1 signal only | The trailer signal is a git-history read, so shallow `actions/checkout` (default `fetch-depth: 1`) genuinely cannot see it — hence the skip, which matches the existing 3-skipped precedent in `harness lint`. This is now coherent: the primary signal really is a history read, not an API call. |
| C120-11 | Retroactive reconciliation of CS114–117 | **In scope.** For each, run a **real retrospective plan-vs-implementation review now** (reviewer model per current policy, differing from the implementer model recorded on the merged PR) and record its *actual* present-day reviewer, agent, and UTC timestamp | The detector's first run must find a clean tree. But a review that never happened cannot be back-dated into existence — so this performs the review rather than asserting one. |
| C120-12 | Date semantics for the reconciled records | `**Closed:**` = the **reconciliation** date (when the retrospective review concluded). The content-merge date is recorded separately in the file body as "shipped: `<date>` via PR #NNN" | Setting `Closed` to the old merge date would assert that closure happened then, which is precisely the false claim being corrected. Keeping the two dates distinct preserves an honest timeline. |
| C120-13 | Do NOT rewrite history or re-run the merged work | Reconciliation adds records; it never reverts, re-implements, rewrites commits, or edits pre-existing evidence | The shipped code is good and reviewed; the defect is in the process record, so only the record is corrected. |
| C120-14 | Out of scope (follow-ups) | (a) a *required status check* that a content PR has a matching claim PR; (b) auto-generating close-out PRs; (c) unifying with CS110's HELD state | (a) is a branch-protection posture change of the CS106/#402 class; (b) is CS123; (c) needs CS110 first. |

## Deliverables

1. `Clickstop: CS<NN>` commit-trailer convention per C120-1: documented in `CONVENTIONS.md`, added to the `install-hooks` `prepare-commit-msg` hook **only on classified content branches** (C120-3), and enforced in the existing `commit-trailers` CI job using the C120-2 branch grammar — required on `cs<NN>/<slug>`, **rejected** on lifecycle/exempt branches.
2. Squash-message precondition + consumer adoption check per C120-4.
3. New `scripts/check-clickstop-queue-reconciliation.mjs` implementing C120-1 (blocking signal, read via `git log --format` trailers) and C120-5/C120-6 (advisory backstop), registered in `harness lint` per C120-10 (skip-on-shallow-history).
4. `lib/claim.mjs` (+ `bin/harness.mjs` CLI surface) — preflight per C120-7 and override persistence per C120-8.
5. `lib/status.mjs` — `⚠ shipped-but-planned` marker per C120-9.
6. Retroactive reconciliation of **CS114, CS115, CS116, CS117** per C120-11/C120-12/C120-13: a real retrospective plan-vs-implementation review for each, `planned_cs11N_*.md` → `done_cs11N_*.md`, `**Status:** done`, `**Closed:**` = reconciliation date, "shipped `<date>` via PR #NNN" recorded in the body, plus WORKBOARD/CONTEXT updates.
7. Tests: trailer present/absent/mismatched-id; branch classification for every class in C120-2 — including the **real slugs** `cs115/fix-cs91-bash-capability-probe`, `cs114/implement-no-memory-hook`, `cs116/bump-review-model`, `cs117/revise-conventions-test-naming`, `cs113/content` (all content ⇒ required) and `workboard/*` / `docs/file-planned-*` / Dependabot (exempt ⇒ trailer **rejected**); the reserved lifecycle slugs `claim`/`close`/`close-out`; advisory-only behaviour of C120-5 including a case asserting **CS115's real subject is NOT detected** (the documented limitation, pinned so it cannot be mistaken for a bug later); the C120-6 exclusion grammar against real subjects; shallow-history skip; squash-setting precondition failure; `--allow-shipped` row written, idempotent on re-run, and non-destructive to existing rows; status marker rendering.
8. `OPERATIONS.md` — document the trailer requirement + branch grammar, the squash precondition, the reconciliation gate in the Claim section, the "planned queue is a claim about reality" invariant, and the C120-5 incompleteness (+ composed mirror in lockstep).
9. `LEARNINGS.md` — entry recording the four-CS lifecycle bypass, why no existing gate caught it, and the shape-vs-reality gap in clickstop validation.
10. `CHANGELOG.md` `[Unreleased]` entry.

## User-approval gates

- **G120-1:** the retroactive reconciliation of CS114–117 (C120-11) performs four real retrospective reviews and closes the records. Confirm the approach and the wording with @henrik-me before committing, since it sets precedent for how bypassed work is regularised.
- **G120-2:** if investigation shows the bypass was deliberate (a sanctioned fast path for small/mechanical CSs), stop and escalate — the correct fix would then be to *document that fast path* in OPERATIONS.md, not to gate against it.
- **G120-3:** C120-1 adds a required commit trailer for content branches, affecting every future CS commit and any consumer adopting the convention (including the C120-4 squash-setting requirement). Confirm before implementing.

## Exit criteria

1. A planned CS whose content commit carries the `Clickstop: CS<NN>` trailer (C120-1) is flagged by the linter, marked in `status`, and blocks `harness claim` absent `--allow-shipped`; the C120-5 backstop warns without blocking.
2. Branch classification (C120-2) requires the trailer on every `cs<NN>/<slug>` content branch — verified against the five real recent slugs, not just `cs<NN>/content` — and **rejects** it on `workboard/*`, `docs/file-planned-*`, and Dependabot branches (C120-3), each covered by test.
3. The C120-4 squash-message precondition is checked, and a repo whose setting would drop the trailer fails closed with guidance.
4. Filing, claim, and close-out commit subjects do **not** trip the backstop (C120-6 verified against real subjects), and the documented CS115 limitation is pinned by test.
5. The whole signal path resolves **offline** from git history alone — no GitHub API call, token, or network access in `claim`, `status`, or `lint`.
6. `harness status` lists **none** of CS114, CS115, CS116, CS117 in the planned queue, and `project/clickstops/done/` contains a `done_` record for each with `**Status:** done`, a reconciliation `**Closed:**` date, and a completed retrospective review.
7. `--allow-shipped "<reason>"` writes exactly one override row, is idempotent on re-run, and leaves prior rows intact.
8. `node --test` 0 fail; `harness lint` 0 fail (the new linter green, not skipped, on a full local clone); `sync --mode=check` no drift.
9. Plan-vs-implementation review Go before close-out.

## Risks + open questions

| # | Risk / what breaks | Mitigation |
|---|---|---|
| R1 | This CS's own filing commit names CS120 while CS120 is planned → self-trip. | The filing commit is on a `docs/file-planned-*` branch, where C120-3 **forbids** the trailer, and C120-6 excludes `docs: file planned` subjects from the backstop; a test asserts this exact shape is ignored. |
| R2 | **The backstop is incomplete by construction.** CS115's content commit names CS91, not CS115, so no subject grammar recovers it. | Accepted, explicit, and *tested as a known limitation* (deliverable 7). The reliable path is C120-1's trailer; the backstop is advisory-only (C120-5) precisely so its incompleteness cannot create false confidence. Catching 3 of 4 historically, and 4 of 4 going forward, is the honest claim. |
| R3 | Shallow CI checkout makes the linter skip, so CI never actually enforces it. | Accepted per C120-10; the blocking surface is `harness claim` (local, full clone). Optionally set `fetch-depth: 0` for the single lint job — evaluate cost during implementation. |
| R4 | A CS id legitimately reused for a follow-up arc (e.g. `CS90` → `CS90a/b/c`) trips the gate. | Suffixed ids are distinct ids (`CS90` ≠ `CS90a`); the trailer value, branch grammar, and backstop regex all anchor on the full id. Add a fixture covering `CS90` vs `CS90a` vs `CS90c`. |
| R5 | The four retrospective reviews (C120-11) are performed long after the fact and may be shallower than a contemporaneous review. | Accepted and disclosed: each record states it is a retrospective review with its real date, and C120-12 keeps the shipped date distinct from the closure date so the timeline cannot be misread as a normal close-out. |
| R6 | Shared ownership of `lib/claim.mjs` with CS123 causes a silent file race (LRN-016). | CS123 declares `Depends on: CS120`, so CS120 lands first and CS123 rebases. Do not dispatch both to parallel sub-agents. |
| R7 | Squash-merge rewrites the commit message, so a trailer written on a branch commit may not survive to `main` — and a consumer repo may be configured differently. | C120-4 makes the squash-message setting an explicit **precondition + consumer adoption check** that fails closed, rather than a post-merge experiment. Verified on this repo: `squash_merge_commit_message = COMMIT_MESSAGES`, and custom trailers (`Copilot-Session`) demonstrably survive on `main`. |
| R8 | A trailer accidentally added to a lifecycle commit creates a **false** shipped signal, which is worse than the original gap. | C120-3 forbids the trailer on exempt branches and the `commit-trailers` job rejects it there — enforced at the only point where branch provenance still exists (pre-squash). Covered by test in deliverable 7. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R4 | gpt-5.6-sol | claude-opus-5 | cs119-123-plan-review (omni-ah) | ff004278a27e | 2026-07-25T01:56:50Z | Go | Go — durable trailers, real content-branch grammar, lifecycle rejection, squash-setting precondition, retrospective reconciliation, and claim override evidence are coherent. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per § Claim) | planned | — | — |

## Notes / Learnings

- Evidence gathered on `main` @ `8deaa32` (local `HEAD` verified equal to `origin/main`, 0 ahead / 0 behind).
- `harness status` output at filing time listed CS114/115/116/117 in "Planned queue (9)".

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
