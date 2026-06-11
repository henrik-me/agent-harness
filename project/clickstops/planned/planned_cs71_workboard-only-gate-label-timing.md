# CS71 — Eliminate transient red gates on workboard-only PRs

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** omni-ah (Claude Opus 4.8), 2026-06-11 — surfaced during a system-health validation requested by @henrik-me after red ❌ checks appeared on the merged CS70 PRs (#303 content / #304 workboard close-out). The #304 failures were a label-timing race, not a gate defect. User directive: "if proper process is followed gates should not be red."
**Depends on:** none

## Goal

When proper process is followed, workboard-only claim/close-out PRs must show **green** review gates from their first CI run — never a transient red ❌. The `review-gates` and `pr-evidence-lint` evidence jobs correctly skip when the `workboard-only` label is present in the triggering event. The race occurs only when the label is attached **after** the PR `opened` event (a create-then-`gh pr edit` flow, or web-UI labeling): the first run evaluates a legitimately-incomplete workboard PR as a content PR and fails, then a later `labeled` event re-runs and skips. The lingering red run reads as "the gates are broken."

This CS fixes it in **two tiers**: **(primary, cheap)** mandate label-at-creation so the label is in the `opened` payload — empirically verified to avoid the race (Background, PR #305); **(hardening, optional)** path-derive the evidence-skip from the allowlist-confined diff so PRs created *without* `--label` (web UI, other tooling) also stay green. Both preserve the CS63 C63-7 guarantee that the bypass can never skip review on content. **Scope:** the **primary** tier guarantees first-run green for the mandated creation path — i.e. "proper process" per the user directive; **universal** first-run green regardless of creation method (web-UI open, post-hoc labeling) requires the **hardening** tier. If the hardening tier is descoped (OQ3/Gate C), the green guarantee is explicitly scoped to the mandated `gh pr create --label workboard-only` path.

## Background

**Observed (evidence).** On PR #304 (`workboard/cs70-close`, labelled `workboard-only`, merged at `105590c`), both `review-gates` and `pr-evidence-lint` produced **two runs at the same head SHA `683f75c` and the same `pull_request` event timestamp** — one `failure`, one `success`. The failing run executed the evidence jobs (`independence-invariant`, `review-log-evidence`, `copilot-review-attached`) and reported `## Model audit section is missing` / `## Review log section is missing`; the passing run skipped them. The divergence is a PR-`opened`-vs-`labeled` race, confirmed by the job conditions below — not a duplicate-workflow bug.

**Mechanism.**
- `.github/workflows/review-gates.yml` — the four evidence jobs each run `if: github.event_name == 'pull_request' && !contains(github.event.pull_request.labels.*.name, 'workboard-only')` (lines 47/77/109/139). On `opened`, the label is absent → the jobs run → they fail on a workboard PR body that legitimately has no `## Model audit` / `## Review log`.
- `.github/workflows/pr-evidence-lint.yml` — the `compute-skip-reasons` step (lines 99–113) derives `workboard-only` **only** from `github.event.pull_request.labels`. On `opened`, no label → no skip reason → `harness pr-evidence` runs the full read-only gate set and fails.
- `bin/harness.mjs` (line 3466) already short-circuits **all** gates to pass when `--skip-reasons` contains `workboard-only`. The CLI is correct; only the *computation of the skip reason* in the workflow is timing-dependent.

**Empirical finding — `gh pr create --label` avoids the race (verified on this CS's own filing PR #305).** A workboard-only PR opened with `gh pr create --label workboard-only` carries the label in the **`opened`** event payload: PR #305's first (opened-event) `review-gates` run executed `validate-workboard-only-scope` (which runs *only* when the label is present) and **skipped** all four evidence jobs — **zero** transient red. The #304 race therefore came from labeling **after** creation (a separate `gh pr edit`/web-UI label, or a create flow that omits `--label`), not from `gh pr create --label` itself. This makes **mandating label-at-creation the cheap primary fix** (Decision 1); path-derivation (Decision 2) is **hardening** for PRs not created via `gh ... --label` (e.g. the GitHub web UI, or a tool that labels post-hoc).

**Why path-derivation is sound (hardening tier).** The workboard path allowlist — `WORKBOARD.md`, `CONTEXT.md`, `LEARNINGS.md`, and `project/clickstops/(planned|active|done)/**` — is *already* the security guard for the bypass (CS63 C63-7; `validate-workboard-only-scope`). A PR whose entire diff is confined to that allowlist is, by definition, a workboard PR. Deriving the evidence-skip from the diff (which the `opened` event always carries) removes any residual label-timing dependency. The label is retained as the human-readable / auto-merge signal.

**Scope boundary.** The content-PR `copilot-review-attached` gate is red until Copilot delivers its asynchronous review (~3 min, ADR4-8). That is a by-design pending state, not a label-timing race, and is **out of scope** here (see Decision 5).

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | **Primary fix** (cheap, low-risk) | **Mandate label-at-creation:** workboard claim/close-out PRs MUST be opened with `gh pr create --label workboard-only` (empirically places the label in the `opened` payload → evidence jobs skip from the first run, PR #305). Document in `OPERATIONS.md` § Claim / close-out PR steps; have `harness claim` / `harness close-out` emit the exact `gh pr create --label workboard-only` command in their rendered PR guidance. **Never** a post-hoc `gh pr edit --add-label`. | Resolves the observed #304 race (post-hoc labeling) with a one-line process/verb change and **no** gate-logic surgery. |
| 2 | **Secondary fix** (hardening; descopeable at claim per OQ3) | **Path-derive the evidence-skip** from the allowlist-confined diff so PRs created WITHOUT `--label` (web UI, other tools, post-hoc labeling) also skip the evidence gates on their first run. | Defense-in-depth: "green when proper process is followed" should not depend on every workboard PR being created via `gh ... --label`. Descopeable if the primary fix is judged sufficient. |
| 3 | Is the `workboard-only` **label** still required? | Yes — unchanged for **auto-merge**. `workboard-auto-approve.yml` is not modified. | Keeps the explicit labeling intent for auto-approval; the two fixes only affect *when* the evidence gates skip, not auto-merge. |
| 4 | Keep `validate-workboard-only-scope` as a fail-closed guard? | Yes — retained. A PR **labelled** `workboard-only` that touches files **outside** the allowlist still fails the gate. | Defense-in-depth: prevents the label from bypassing content review via auto-merge. |
| 5 | Where do the changes live? | **Primary (D71-1):** `OPERATIONS.md` (+ composed mirror) and the `harness claim`/`close-out` rendered guidance in `lib/claim.mjs` / `lib/closeout.mjs` (guidance-string change only — **no** gate logic). **Hardening (D71-2…D71-7):** workflow templates (`review-gates`/`pr-evidence-lint`, template + rendered) + the consistency linter; `bin/harness.mjs` short-circuit unchanged. | For the hardening tier, evidence jobs must **always execute and short-circuit internally** (report success), never be silently skipped via a failed dependency or `paths-ignore` — either would drop/falsify the required check context (fail-open, R4) or block merge. |
| 6 | Address the content-PR Copilot-review-pending red? | **Out of scope.** Documented as a distinct by-design async state (ADR4-8). | The Copilot gate is inherently pending until delivery; conflating it with the label-timing race balloons scope and risks weakening genuine review enforcement. A follow-up CS can be filed if desired. |
| 7 | (Hardening only) How to keep the allowlist definition consistent across its occurrences? | Keep the allowlist check **inline in the workflow YAML** and enforce a single source of truth with a **static consistency linter** asserting that **every** `# harness:workboard-allowlist`-marked occurrence is equivalent under a canonical normalization — `review-gates.yml` embeds it **twice** (the `validate-workboard-only-scope` guard **and** the new evidence-job skip logic), plus `pr-evidence-lint.yml` and `workboard-auto-approve.yml` (template/managed **and** rendered). Register in `harness lint`. Do **not** extract to `lib/`. | A consumer workflow cannot import a repo-local `lib/` module without first cloning the harness. A canonical (token-set, not raw-byte) consistency linter over every marked occurrence prevents silent drift across heredoc-vs-inline formatting (R3) and is fixture-testable. |

## Deliverables

- **D71-1 (PRIMARY) — Mandate label-at-creation.** Update `OPERATIONS.md` § Claim step 6 and § Close-out PR steps to require opening workboard PRs with `gh pr create --base main --label workboard-only …` (label in the *create* command; **never** a post-hoc `gh pr edit --add-label`). Edit `lib/claim.mjs` and `lib/closeout.mjs` so the `harness claim` / `harness close-out` rendered PR guidance emits that exact command (a guidance-string change — **no** gate-logic change). Keep the composed `OPERATIONS.md` mirror in sync (no drift). Add a `LEARNINGS.md` entry recording the empirical finding (PR #305 opened-run carried the label and skipped the evidence jobs; #304 raced via post-hoc labeling).

*Hardening tier — D71-2…D71-7, optional / descopeable per OQ3 if the primary fix is judged sufficient:*

- **D71-2 — `pr-evidence-lint.yml` path-derived skip** (template/managed + rendered). `compute-skip-reasons` adds `workboard-only` when the PR diff is confined to the allowlist (`WORKBOARD.md` / `CONTEXT.md` / `LEARNINGS.md` / `project/clickstops/(planned|active|done)/`), in addition to the existing label path. Preserve the fail-closed-on-`gh api`-error behavior and the rename/copy-source (`previous_filename`) awareness (CS63 R8).
- **D71-3 — `review-gates.yml` path-derived skip** (template/managed + rendered). The four evidence jobs (`review-log-evidence`, `copilot-review-attached`, `independence-invariant`, `review-threads-resolved`) **always execute** and **short-circuit internally** to success when workboard-only (label **or** allowlist-confined diff via `gh api .../files` + the inline predicate, rename-source aware), mirroring the `pr-evidence-lint` `--skip-reasons` short-circuit. **Do NOT** gate the jobs with a job-level `if:` on a separate `compute-skip` job's output — a failed `compute-skip` would make `needs:` **silently skip** the dependents (fail-open, R4). **Fail closed** on a file-list API error (run the real gate). Retain `validate-workboard-only-scope`.
- **D71-4 — Allowlist consistency linter.** Add `scripts/check-workboard-allowlist-consistency.mjs` (Node built-ins only; `--quiet`; exit 0/1/2; `✅/❌` summary) over **every** `# harness:workboard-allowlist`-marked occurrence — `review-gates.yml` ×2 (the guard **and** the new skip logic), `pr-evidence-lint.yml`, `workboard-auto-approve.yml`; template/managed **and** rendered — asserting equivalence under canonical normalization (parse the allowlist path/regex token **set** and compare sets, not raw bytes). Register in the `harness lint` aggregator. **No `lib/` extraction.**
- **D71-5 — Tests (`tests/*.test.mjs`, `node --test`).** Minimum **6**: (a) matching marked occurrences → linter exit 0; (b) drifted token → exit 1; (c) static YAML-parse assertion that the four evidence jobs **always execute** + short-circuit internally (no silent-skip `if:`) and neither workflow uses `on: paths-ignore`, plus a **fail-open guard** test (simulated file-list error runs the real gate, never a silent pass); (d) marker comment present above each occurrence; (e) exit 2 on missing marker / bad usage; (f) rendered and template copies agree. Behavioral path-matching verified end-to-end by Exit criteria 1–3 (bash grep not node-unit-testable without a shell dep). Scratch files under `os.tmpdir()` only (LRN-094).
- **D71-6 — Hardening docs + operator notice.** `OPERATIONS.md` § "Skip-reasons matrix" note: the evidence-skip is also **path-derived** (label not required to keep gates green; still required for auto-merge — a correctly-shaped, unlabelled PR is green yet will not auto-merge until labelled; intended). Both workflows emit a `::notice::` when skipping via path-derivation. Keep the composed mirror in sync.
- **D71-7 — Self-checks green.** `harness lint` (incl. `workflow-pins`, `review-gates` structural lint, `text-encoding`), `node --test`, and `harness sync --mode=check` (zero drift between `template/managed/.github/workflows/*` and the rendered `.github/workflows/*`).

## User-approval gates

- **Gate A — Decision 7 form (resolved at plan review).** GPT-5.5 resolved this: keep the predicate **inline in YAML** + a static consistency linter; **no `lib/` extraction** (a consumer workflow cannot import repo-local `lib/` without cloning the harness). No further approval needed.
- **Gate B — Scope of Decision 6.** Confirm the content-PR Copilot-review-pending red stays out of scope (or spin a follow-up CS) before close-out.
- **Gate C — Hardening-tier descope (OQ3).** Confirm at claim time whether the hardening tier (D71-2…D71-7) is implemented now or deferred, given the primary fix (D71-1) alone eliminates the observed race.

## Exit criteria

1. **(Primary)** `OPERATIONS.md` § Claim/close-out and the `harness claim`/`close-out` rendered guidance instruct opening workboard PRs with `gh pr create --label workboard-only`; a workboard PR so created shows **green** `review-gates` and `pr-evidence-lint` on its first `opened` run (as PR #305 already demonstrated).
2. **(Hardening, if implemented)** A workboard-only-shaped PR (diff confined to the allowlist) opened **without** a pre-applied label still produces green evidence runs on its first `opened` event.
3. A PR labelled `workboard-only` that touches a file **outside** the allowlist still **fails** `validate-workboard-only-scope` (guard intact).
4. A normal content PR (diff outside the allowlist) still runs **all** evidence gates (no accidental bypass).
5. **(Hardening)** `template/managed/.github/workflows/*` and the rendered `.github/workflows/*` are byte-aligned (`harness sync --mode=check` = no drift).
6. **(Hardening)** The D71-4 consistency linter passes (every `# harness:workboard-allowlist`-marked occurrence — `review-gates.yml` ×2, `pr-evidence-lint.yml`, `workboard-auto-approve.yml` — equivalent under canonical normalization), and the static test confirms the four evidence jobs always execute + short-circuit internally with no `paths-ignore` and a fail-closed file-list error path.
7. All self-checks in D71-7 pass; the close-out plan-vs-implementation review returns GO.

## Risks + open questions

- **R1 — Required-check context dropping.** If a job becomes "not-run" (e.g. via `paths-ignore`), branch protection may block the PR on a never-reported required context. Mitigation: jobs must *always execute and short-circuit internally* (report success), per Decision 5. Verify against the current required-status-check list before merge.
- **R2 — `gh api` cost / rate limits.** The hardening tier adds a file-listing API call to `review-gates`. Mitigation: one paginated call, fail-closed on error (mirror the existing pr-evidence-lint guard).
- **R3 — Allowlist drift across occurrences.** The allowlist regex is embedded inline in multiple marked occurrences (`review-gates.yml` ×2 — the guard **and** the new skip logic — `pr-evidence-lint.yml`, `workboard-auto-approve.yml`); they could silently diverge. Mitigation: the D71-4 consistency linter (run in `harness lint`/CI) fails if any occurrence diverges under canonical normalization; the implementer adds a `# harness:workboard-allowlist` marker comment above each occurrence so the linter can locate them reliably.
- **R4 — Fail-open via silently-skipped dependents.** A `compute-skip` job with `needs:`-dependent evidence jobs would, on `compute-skip` failure, mark dependents *skipped* (GitHub treats as success) — bypassing review (fail-open). Mitigation (D71-3): evidence jobs **always execute** and short-circuit internally, failing **closed** on a file-list API error; verified by the D71-5 fail-open guard test. This is the single most important safety invariant of the hardening tier.
- **OQ1 — Auto-merge interaction.** Confirm `workboard-auto-approve.yml` still requires the label and is unaffected (it is intentionally unchanged here).
- **OQ2 — Consumer impact.** These are managed templates synced to consumer repos; confirm the change is backward-compatible for consumers that have not opted into review gates (`review_gates.enabled` false → workflow inert).
- **OQ3 — Descope the hardening tier?** PR #305 shows the primary fix (D71-1, label-at-creation) alone eliminates the observed race. Decide at claim time (Gate C) whether the hardening tier (D71-2…D71-7, path-derived skip) is implemented now or deferred to a follow-up — it adds value only for workboard PRs created **without** `gh ... --label` (web UI, other tooling). Recommendation: land D71-1 first; gate the hardening tier on whether non-`gh` workboard-PR creation is a real path for this project.

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | general-purpose (orchestrator: omni-ah) | eb3d297f158e | 2026-06-11T18:38:00Z | Go-with-amendments | Resolve shared-predicate arch (lib vs inline), add YAML plumbing tests, cover workboard-auto-approve allowlist drift, document no-label green/no-auto-merge state. |
| R2 | gpt-5.5 | claude-opus-4.8 | general-purpose (orchestrator: omni-ah) | e6858dc11023 | 2026-06-11T18:43:00Z | Go-with-amendments | F1/F3/F4 resolved; F2 partial — require always-execute/fail-closed (no fail-open via skipped needs:); F5 — linter must cover every allowlist occurrence incl. validate-workboard-only-scope. |
| R3 | gpt-5.5 | claude-opus-4.8 | general-purpose (orchestrator: omni-ah) | 19ced0297c8a | 2026-06-11T18:47:30Z | Go | F2 resolved; F5 resolved; no new blockers. |
| R4 | gpt-5.5 | claude-opus-4.8 | general-purpose (orchestrator: omni-ah) | e803de20cd69 | 2026-06-11T18:56:00Z | Go-with-amendments | Re-review after empirical finding (#305: gh pr create --label avoids the race) → restructured to two-tier (cheap primary + optional hardening). Fix lib-scope inconsistency; scope the green guarantee. |
| R5 | gpt-5.5 | claude-opus-4.8 | general-purpose (orchestrator: omni-ah) | 93d097b6e112 | 2026-06-11T19:02:00Z | Go | F1 (lib guidance-string edits in scope) + F2 (green guarantee scoped to mandated create path; universal needs hardening) resolved; no new material blockers. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per § Claim) | planned | — | — |

## Notes / Learnings

- Surfaced from the CS70 close-out (#304) red-check false alarm during a system-health validation (2026-06-11). The root cause is documented in Background; a `LEARNINGS.md` entry is a D71-5 deliverable.

## Plan-vs-implementation review

> _(filled at close-out per the gate)_
