# CS71 — Eliminate transient red gates on workboard-only PRs

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** omni-ah (Claude Opus 4.8), 2026-06-11 — surfaced during a system-health validation requested by @henrik-me after red ❌ checks appeared on the merged CS70 PRs (#303 content / #304 workboard close-out). The #304 failures were a label-timing race, not a gate defect. User directive: "if proper process is followed gates should not be red."
**Depends on:** none

## Goal

When proper process is followed, workboard-only claim/close-out PRs must show **green** review gates from their first CI run — never a transient red ❌. Today the `review-gates` and `pr-evidence-lint` evidence jobs gate on the `workboard-only` **label**, which is not present on the PR `opened` event (GitHub creates the PR, then applies the label in a separate API call). The first workflow run therefore evaluates a legitimately-incomplete workboard PR body as a normal content PR and fails, then a later event (label applied) re-runs and skips. The red run lingers in the Checks UI and reads as "the gates are broken."

This CS makes the workboard-only evidence-gate skip **path-derived** (computed from the changed-file allowlist that is already the security guard) instead of **label-timing-derived**, while preserving the CS63 C63-7 guarantee that the bypass can never skip review on content.

## Background

**Observed (evidence).** On PR #304 (`workboard/cs70-close`, labelled `workboard-only`, merged at `105590c`), both `review-gates` and `pr-evidence-lint` produced **two runs at the same head SHA `683f75c` and the same `pull_request` event timestamp** — one `failure`, one `success`. The failing run executed the evidence jobs (`independence-invariant`, `review-log-evidence`, `copilot-review-attached`) and reported `## Model audit section is missing` / `## Review log section is missing`; the passing run skipped them. The divergence is a PR-`opened`-vs-`labeled` race, confirmed by the job conditions below — not a duplicate-workflow bug.

**Mechanism.**
- `.github/workflows/review-gates.yml` — the four evidence jobs each run `if: github.event_name == 'pull_request' && !contains(github.event.pull_request.labels.*.name, 'workboard-only')` (lines 47/77/109/139). On `opened`, the label is absent → the jobs run → they fail on a workboard PR body that legitimately has no `## Model audit` / `## Review log`.
- `.github/workflows/pr-evidence-lint.yml` — the `compute-skip-reasons` step (lines 99–113) derives `workboard-only` **only** from `github.event.pull_request.labels`. On `opened`, no label → no skip reason → `harness pr-evidence` runs the full read-only gate set and fails.
- `bin/harness.mjs` (line 3466) already short-circuits **all** gates to pass when `--skip-reasons` contains `workboard-only`. The CLI is correct; only the *computation of the skip reason* in the workflow is timing-dependent.

**Why `--label` at create-time does not fix it.** `gh pr create --label X` creates the PR and applies labels in a *separate* REST call, so the `opened` webhook payload still lacks the label. Forcing the label before the first triggering event is not reliably achievable; the diff, by contrast, is available on the `opened` event.

**Why path-derivation is sound.** The workboard path allowlist — `WORKBOARD.md`, `CONTEXT.md`, `LEARNINGS.md`, and `project/clickstops/(planned|active|done)/**` — is *already* the security guard for the bypass (CS63 C63-7; `validate-workboard-only-scope`). A PR whose entire diff is confined to that allowlist is, by definition, a workboard PR. Deriving the evidence-skip from the diff (which the `opened` event already carries) removes the label-timing dependency entirely. The label is retained as the human-readable / auto-merge signal.

**Scope boundary.** The content-PR `copilot-review-attached` gate is red until Copilot delivers its asynchronous review (~3 min, ADR4-8). That is a by-design pending state, not a label-timing race, and is **out of scope** here (see Decision 5).

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | What signal drives the evidence-gate skip on workboard PRs? | Derive `workboard-only` from a **diff confined to the workboard path allowlist**, independent of label presence; skip the evidence gates whenever the diff is allowlist-confined. | The `opened` event lacks the label but carries the diff. The allowlist is already the bypass security guard, so a diff-confined PR is definitionally workboard-only — making it the trigger removes the race. |
| 2 | Is the `workboard-only` **label** still required? | Yes — unchanged for **auto-merge**. `workboard-auto-approve.yml` is not modified; only the evidence-gate *skip* is decoupled from label timing. | Keeps the explicit labeling intent for auto-approval while removing the red-gate race. Evidence-skip and auto-merge are separately motivated. |
| 3 | Keep `validate-workboard-only-scope` as a fail-closed guard? | Yes — retained. A PR **labelled** `workboard-only` that touches files **outside** the allowlist still fails the gate. | Defense-in-depth: prevents the label from bypassing content review via auto-merge. Path-derivation handles the *skip*; this guard handles the *labelled-but-content* abuse case. |
| 4 | Where does the change live? | **Workflow templates only.** `template/managed/.github/workflows/{review-gates,pr-evidence-lint}.yml` **and** the rendered `.github/workflows/` copies (the harness self-hosts; the `sync --mode=check` drift gate must stay green), plus the D71-3 consistency linter. `bin/harness.mjs` and `lib/` are unchanged. | Localizes the fix; because the allowlist predicate stays inline in YAML (Decision 6) there is **no** `lib/`/`bin/` runtime change — "workflow templates only" holds, and consumer workflows need not clone the harness to evaluate it. Jobs must **always execute and short-circuit internally** (report success), never be silently skipped via a failed dependency or `paths-ignore` — either would drop/falsify the required check context (fail-open, R4) or block merge. |
| 5 | Address the content-PR Copilot-review-pending red? | **Out of scope.** Documented as a distinct by-design async state (ADR4-8). | The Copilot gate is inherently pending until delivery; conflating it with the label-timing race balloons scope and risks weakening genuine review enforcement. A follow-up CS can be filed if desired. |
| 6 | How to keep the allowlist definition consistent across its occurrences (single source of truth)? | Keep the allowlist check **inline in the workflow YAML** (bash, as today) and enforce a single source of truth with a **static consistency linter** asserting that **every** `# harness:workboard-allowlist`-marked occurrence is equivalent under a canonical normalization — note `review-gates.yml` embeds it **twice** (the `validate-workboard-only-scope` guard **and** the new evidence-job skip logic), plus `pr-evidence-lint.yml` and `workboard-auto-approve.yml` (template/managed **and** rendered). Register in `harness lint`. Do **not** extract to `lib/`. | Resolves the Decision-4 conflict and the consumer-import problem: a consumer workflow cannot import a repo-local `lib/` module without first cloning the harness. A canonical (token-set, not raw-byte) consistency linter over every marked occurrence prevents silent drift across heredoc-vs-inline formatting (R3) and is fixture-testable without turning the YAML into runtime-code-dependent plumbing. |

## Deliverables

- **D71-1 — `pr-evidence-lint.yml` (template/managed + rendered root).** Extend the `compute-skip-reasons` step so `workboard-only` is added when the PR diff is confined to the allowlist (`WORKBOARD.md` / `CONTEXT.md` / `LEARNINGS.md` / `project/clickstops/(planned|active|done)/`), in addition to the existing label path. Preserve the existing fail-closed-on-`gh api`-error behavior and the rename/copy-source (`previous_filename`) awareness (CS63 R8).
- **D71-2 — `review-gates.yml` (template/managed + rendered root).** Make the four evidence jobs (`review-log-evidence`, `copilot-review-attached`, `independence-invariant`, `review-threads-resolved`) **always execute** and **short-circuit internally** to success when the PR is workboard-only — label present **or** diff allowlist-confined (determined via `gh api .../files` + the inline allowlist predicate, rename-source aware) — mirroring the existing `pr-evidence-lint` `--skip-reasons workboard-only` short-circuit pattern. **Do NOT** gate the jobs with a job-level `if:` on a separate `compute-skip` job's output: a failed `compute-skip` would make `needs:` **silently skip** the dependents (GitHub reports them success) — a **fail-open** bypass (R4). **Fail closed:** if the file-list API errors, run the real gate (do not grant the skip). Retain `validate-workboard-only-scope` for the labelled-but-content case (Decision 3).
- **D71-3 — Allowlist consistency linter (Decision 6).** Add `scripts/check-workboard-allowlist-consistency.mjs` (Node built-ins only; `--quiet`; exit 0/1/2; `✅/❌` summary line) that extracts **every** `# harness:workboard-allowlist`-marked allowlist occurrence — `review-gates.yml` ×2 (the `validate-workboard-only-scope` guard **and** the new evidence-job skip logic), `pr-evidence-lint.yml`, and `workboard-auto-approve.yml`, in **both** template/managed and rendered roots — and asserts they are equivalent under a **canonical normalization** (parse out the allowlist path/regex token set and compare the sets, not raw bytes) so heredoc-vs-inline formatting cannot cause silent drift or false equivalence. Register it in the `harness lint` aggregator. **No `lib/` extraction** — the predicate stays inline bash in each occurrence.
- **D71-4 — Tests (`tests/*.test.mjs`, `node --test`).** Minimum **6** new cases: (a) fixtures whose marked allowlist occurrences match under canonical normalization → consistency linter exit 0; (b) one fixture with a drifted allowlist token → exit 1; (c) a static structural assertion (parse the YAML) that the four `review-gates` evidence jobs **always execute** (no job-level `if:` that a failed dependency could turn into a silent skip) and short-circuit internally, plus a **fail-open guard** test that a simulated file-list error runs the real gate (never a silent pass), and that neither workflow uses `on: paths-ignore`; (d) marker comment present above each allowlist occurrence; (e) linter exits 2 on missing marker / bad usage; (f) the rendered and template copies of each workflow agree. Behavioral path-matching (allowlist-confined vs. outside, rename-source) is verified end-to-end by Exit criteria 1–3 (the bash grep is not node-unit-testable without a shell dependency). Scratch files (if any) under `os.tmpdir()`, never under repo root (LRN-094).
- **D71-5 — Docs + operator-facing notice.** Update `OPERATIONS.md`: the § "Skip-reasons matrix" note and the § Claim / close-out PR steps to state the workboard-only evidence-skip is **path-derived** — the label is **not** required to keep gates green but **is still required for auto-merge** (so a correctly-shaped, unlabelled PR shows green gates yet will not auto-merge until labelled; this is intended). Have both workflows emit a `::notice::` when they skip via path-derivation ("path-confined workboard-only evidence skip; label still required for auto-merge") so the green-but-not-merged state is self-explaining. Keep the composed mirror in sync (no drift). Add a `LEARNINGS.md` entry recording the label-timing race and the path-derivation fix.
- **D71-6 — Self-checks green.** `harness lint` (incl. `workflow-pins`, `review-gates` structural lint, `text-encoding`), `node --test`, and `harness sync --mode=check` (zero drift between `template/managed/.github/workflows/*` and the rendered `.github/workflows/*`).

## User-approval gates

- **Gate A — Decision 6 form (resolved at plan review).** GPT-5.5 round 1 resolved this: keep the predicate **inline in YAML** + a static consistency linter; **no `lib/` extraction** (a consumer workflow cannot import repo-local `lib/` without cloning the harness). No further approval needed.
- **Gate B — Scope of Decision 5.** Confirm the content-PR Copilot-review-pending red stays out of scope (or spin a follow-up CS) before close-out.

## Exit criteria

1. A workboard-only-shaped PR (diff confined to the allowlist) opened **without** a pre-applied label produces **green** `review-gates` and `pr-evidence-lint` runs on its first `opened` event — verified on a real PR.
2. A PR labelled `workboard-only` that touches a file **outside** the allowlist still **fails** `validate-workboard-only-scope` (guard intact).
3. A normal content PR (diff outside the allowlist) still runs **all** evidence gates (no accidental bypass).
4. `template/managed/.github/workflows/*` and the rendered `.github/workflows/*` are byte-aligned (`harness sync --mode=check` = no drift).
5. The D71-3 consistency linter passes (every `# harness:workboard-allowlist`-marked occurrence — `review-gates.yml` ×2, `pr-evidence-lint.yml`, `workboard-auto-approve.yml` — is equivalent under canonical normalization), and the static test confirms the four `review-gates` evidence jobs always execute + short-circuit internally with no `paths-ignore` and a fail-closed file-list error path.
6. All self-checks in D71-6 pass; the close-out plan-vs-implementation review returns GO.

## Risks + open questions

- **R1 — Required-check context dropping.** If a job becomes "not-run" (e.g. via `paths-ignore`), branch protection may block the PR on a never-reported required context. Mitigation: jobs must *run and skip* (report success), per Decision 4. Verify against the current required-status-check list before merge.
- **R2 — `gh api` cost / rate limits.** `review-gates` gains a file-listing API call in the new `compute-skip` job. Mitigation: one paginated call, fail-closed on error (mirror the existing pr-evidence-lint guard).
- **R3 — Allowlist drift across occurrences.** The allowlist regex is embedded inline in multiple marked occurrences (`review-gates.yml` ×2 — the guard **and** the new skip logic — `pr-evidence-lint.yml`, `workboard-auto-approve.yml`); they could silently diverge. Mitigation: the D71-3 consistency linter (run in `harness lint`/CI) fails if any occurrence diverges under canonical normalization; the implementer adds a `# harness:workboard-allowlist` marker comment above each occurrence so the linter can locate them reliably.
- **R4 — Fail-open via silently-skipped dependents.** A `compute-skip` job with `needs:`-dependent evidence jobs would, on `compute-skip` failure, mark dependents *skipped* (GitHub treats as success) — bypassing review (fail-open). Mitigation (D71-2): evidence jobs **always execute** and short-circuit internally, failing **closed** on a file-list API error; verified by the D71-4 fail-open guard test. This is the single most important safety invariant of the CS.
- **OQ1 — Auto-merge interaction.** Confirm `workboard-auto-approve.yml` still requires the label and is unaffected (it is intentionally unchanged here).
- **OQ2 — Consumer impact.** These are managed templates synced to consumer repos; confirm the change is backward-compatible for consumers that have not opted into review gates (`review_gates.enabled` false → workflow inert).

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | general-purpose (orchestrator: omni-ah) | eb3d297f158e | 2026-06-11T18:38:00Z | Go-with-amendments | Resolve shared-predicate arch (lib vs inline), add YAML plumbing tests, cover workboard-auto-approve allowlist drift, document no-label green/no-auto-merge state. |
| R2 | gpt-5.5 | claude-opus-4.8 | general-purpose (orchestrator: omni-ah) | e6858dc11023 | 2026-06-11T18:43:00Z | Go-with-amendments | F1/F3/F4 resolved; F2 partial — require always-execute/fail-closed (no fail-open via skipped needs:); F5 — linter must cover every allowlist occurrence incl. validate-workboard-only-scope. |
| R3 | gpt-5.5 | claude-opus-4.8 | general-purpose (orchestrator: omni-ah) | 19ced0297c8a | 2026-06-11T18:47:30Z | Go | F2 resolved; F5 resolved; no new blockers. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per § Claim) | planned | — | — |

## Notes / Learnings

- Surfaced from the CS70 close-out (#304) red-check false alarm during a system-health validation (2026-06-11). The root cause is documented in Background; a `LEARNINGS.md` entry is a D71-5 deliverable.

## Plan-vs-implementation review

> _(filled at close-out per the gate)_
