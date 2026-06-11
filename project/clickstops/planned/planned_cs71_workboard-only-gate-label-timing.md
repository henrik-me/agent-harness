# CS71 — Eliminate transient red gates on workboard-only PRs

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** omni-ah (Claude Opus 4.8), 2026-06-11 — surfaced during a system-health validation requested by @henrik-me after red ❌ checks appeared on the merged CS70 PRs (#303 content / #304 workboard close-out). The #304 failures were a label-timing race, not a gate defect. User directive: "if proper process is followed gates should not be red."
**Depends on:** none

## Goal

Workboard-only claim/close-out PRs must show **green** review gates from their first CI run — never a transient red ❌. The evidence jobs skip when the `workboard-only` label is present in the **triggering event**, but the label is **not reliably present on the `opened` event**: `gh pr create --label` attaches labels in a *separate* API call after PR creation, so whether the `opened` payload carries the label is a **race** — observed **both ways for the identical command** (PR #305 green, PR #306 red; see Background). The **reliable** fix is to make the evidence-gate skip **path-derived** from the allowlist-confined diff, which the `opened` event always carries (D71-2…D71-7). Mandating `gh pr create --label workboard-only` at creation (D71-1) is a cheap **complementary** mitigation that reduces — but does **not** eliminate — the red. Both preserve the CS63 C63-7 guarantee that the bypass can never skip review on content.

## Background

**Observed (evidence).** On PR #304 (`workboard/cs70-close`, labelled `workboard-only`, merged at `105590c`), both `review-gates` and `pr-evidence-lint` produced **two runs at the same head SHA `683f75c` and the same `pull_request` event timestamp** — one `failure`, one `success`. The failing run executed the evidence jobs (`independence-invariant`, `review-log-evidence`, `copilot-review-attached`) and reported `## Model audit section is missing` / `## Review log section is missing`; the passing run skipped them. The divergence is a PR-`opened`-vs-`labeled` race, confirmed by the job conditions below — not a duplicate-workflow bug.

**Mechanism.**
- `.github/workflows/review-gates.yml` — the four evidence jobs each run `if: github.event_name == 'pull_request' && !contains(github.event.pull_request.labels.*.name, 'workboard-only')` (lines 47/77/109/139). On `opened`, the label is absent → the jobs run → they fail on a workboard PR body that legitimately has no `## Model audit` / `## Review log`.
- `.github/workflows/pr-evidence-lint.yml` — the `compute-skip-reasons` step (lines 99–113) derives `workboard-only` **only** from `github.event.pull_request.labels`. On `opened`, no label → no skip reason → `harness pr-evidence` runs the full read-only gate set and fails.
- `bin/harness.mjs` (line 3466) already short-circuits **all** gates to pass when `--skip-reasons` contains `workboard-only`. The CLI is correct; only the *computation of the skip reason* in the workflow is timing-dependent.

**Empirical finding — the race is real and `gh pr create --label` does NOT reliably avoid it.** This CS's own filing PRs show the non-determinism. PR #305 (opened with `gh pr create --label workboard-only`) had the label in its `opened`-event payload — `validate-workboard-only-scope` **ran** and the evidence jobs **skipped** (no red). PR #306, opened with the **identical** command, did **not**: in its `opened` run `validate-workboard-only-scope` **skipped** (label absent) and the evidence jobs **ran and failed**, then the `labeled` re-run skipped them. Same command, opposite outcome → `gh pr create --label` is racy (gh applies labels in a separate call after creation). The PR **diff**, by contrast, is always present on the `opened` event — so **path-derivation is the reliable, timing-independent fix** (Decision 1); the `--label`-at-creation convention is only a cheap **partial** mitigation (Decision 2).

**Why path-derivation is sound (the reliable primary fix).** The workboard path allowlist — `WORKBOARD.md`, `CONTEXT.md`, `LEARNINGS.md`, and `project/clickstops/(planned|active|done)/**` — is *already* the security guard for the bypass (CS63 C63-7; `validate-workboard-only-scope`). A PR whose entire diff is confined to that allowlist is, by definition, a workboard PR. Deriving the evidence-skip from the diff (which the `opened` event always carries) removes the label-timing dependency entirely. The label is retained as the human-readable / auto-merge signal.

**Scope boundary.** The content-PR `copilot-review-attached` gate is red until Copilot delivers its asynchronous review (~3 min, ADR4-8). That is a by-design pending state, not a label-timing race, and is **out of scope** here (see Decision 6).

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | **Primary fix** (reliable) | **Path-derive the evidence-gate skip** from the allowlist-confined diff (timing-independent): the four `review-gates` evidence jobs and the `pr-evidence-lint` skip computation treat a PR whose entire diff is within the allowlist as workboard-only **regardless of label presence/timing**. | The `opened` event always carries the diff; label presence is racy (#305 green vs #306 red, same command). The allowlist is already the bypass security guard (CS63 C63-7), so a diff-confined PR is definitionally workboard-only. This is the only fix that *reliably* eliminates the red. |
| 2 | **Complementary mitigation** (cheap, not sufficient alone) | Adopt `gh pr create --label workboard-only` at creation as good practice and emit it from `harness claim` / `harness close-out` guidance. **Never** a post-hoc `gh pr edit --add-label`. | Reduces red frequency (helped on #305) but does **not** eliminate it (#306). Cheap and harmless; pairs with the primary fix — not relied on alone. |
| 3 | Is the `workboard-only` **label** still required? | Yes — unchanged for **auto-merge**. `workboard-auto-approve.yml` is not modified. | Keeps the explicit labeling intent for auto-approval; the fixes only affect *when* the evidence gates skip, not auto-merge. |
| 4 | Keep `validate-workboard-only-scope` as a fail-closed guard? | Yes — retained. A PR **labelled** `workboard-only` that touches files **outside** the allowlist still fails the gate. | Defense-in-depth: prevents the label from bypassing content review via auto-merge. |
| 5 | Where do the changes live? | **Primary (D71-2…D71-7):** workflow templates (`review-gates`/`pr-evidence-lint`, template + rendered) + the consistency linter; `bin/harness.mjs` short-circuit unchanged. **Complementary (D71-1):** `OPERATIONS.md` (+ composed mirror) and the `harness claim`/`close-out` rendered guidance in `lib/claim.mjs` / `lib/closeout.mjs` (guidance-string change only — **no** gate logic). | For the path-derived tier, evidence jobs must **always execute and short-circuit internally** (report success), never be silently skipped via a failed dependency or `paths-ignore` — either would drop/falsify the required check context (fail-open, R4) or block merge. |
| 6 | Address the content-PR Copilot-review-pending red? | **Out of scope.** Documented as a distinct by-design async state (ADR4-8). | The Copilot gate is inherently pending until delivery; conflating it with the label-timing race balloons scope and risks weakening genuine review enforcement. A follow-up CS can be filed if desired. |
| 7 | (Hardening only) How to keep the allowlist definition consistent across its occurrences? | Keep the allowlist check **inline in the workflow YAML** and enforce a single source of truth with a **static consistency linter** asserting that **every** `# harness:workboard-allowlist`-marked occurrence is equivalent under a canonical normalization — `review-gates.yml` embeds it **twice** (the `validate-workboard-only-scope` guard **and** the new evidence-job skip logic), plus `pr-evidence-lint.yml` and `workboard-auto-approve.yml` (template/managed **and** rendered). Register in `harness lint`. Do **not** extract to `lib/`. | A consumer workflow cannot import a repo-local `lib/` module without first cloning the harness. A canonical (token-set, not raw-byte) consistency linter over every marked occurrence prevents silent drift across heredoc-vs-inline formatting (R3) and is fixture-testable. |

## Deliverables

- **D71-1 (COMPLEMENTARY — cheap, not sufficient alone) — `--label`-at-creation convention.** Update `OPERATIONS.md` § Claim step 6 and § Close-out PR steps to open workboard PRs with `gh pr create --base main --label workboard-only …` (label in the *create* command; **never** a post-hoc `gh pr edit --add-label`). Edit `lib/claim.mjs` and `lib/closeout.mjs` so the `harness claim` / `harness close-out` rendered PR guidance emits that exact command (a guidance-string change — **no** gate-logic change). Keep the composed `OPERATIONS.md` mirror in sync. Add a `LEARNINGS.md` entry recording the empirical non-determinism (PR #305 opened-run carried the label and skipped the evidence jobs; PR #306 — identical command — did **not**: `validate-workboard-only-scope` skipped and the evidence jobs failed — proving `--label` is racy, not a reliable fix).

*Primary fix (reliable, path-derived) — D71-2…D71-7:*

- **D71-2 — `pr-evidence-lint.yml` path-derived skip** (template/managed + rendered). `compute-skip-reasons` adds `workboard-only` when the PR diff is confined to the allowlist (`WORKBOARD.md` / `CONTEXT.md` / `LEARNINGS.md` / `project/clickstops/(planned|active|done)/`), in addition to the existing label path. Preserve the fail-closed-on-`gh api`-error behavior and the rename/copy-source (`previous_filename`) awareness (CS63 R8).
- **D71-3 — `review-gates.yml` path-derived skip** (template/managed + rendered). The four evidence jobs (`review-log-evidence`, `copilot-review-attached`, `independence-invariant`, `review-threads-resolved`) **always execute** and **short-circuit internally** to success when workboard-only (label **or** allowlist-confined diff via `gh api .../files` + the inline predicate, rename-source aware), mirroring the `pr-evidence-lint` `--skip-reasons` short-circuit. **Do NOT** gate the jobs with a job-level `if:` on a separate `compute-skip` job's output — a failed `compute-skip` would make `needs:` **silently skip** the dependents (fail-open, R4). **Fail closed** on a file-list API error (run the real gate). Retain `validate-workboard-only-scope`.
- **D71-4 — Allowlist consistency linter.** Add `scripts/check-workboard-allowlist-consistency.mjs` (Node built-ins only; `--quiet`; exit 0/1/2; `✅/❌` summary) over **every** `# harness:workboard-allowlist`-marked occurrence — `review-gates.yml` ×2 (the guard **and** the new skip logic), `pr-evidence-lint.yml`, `workboard-auto-approve.yml`; template/managed **and** rendered — asserting equivalence under canonical normalization (parse the allowlist path/regex token **set** and compare sets, not raw bytes). Register in the `harness lint` aggregator. **No `lib/` extraction.**
- **D71-5 — Tests (`tests/*.test.mjs`, `node --test`).** Minimum **6**: (a) matching marked occurrences → linter exit 0; (b) drifted token → exit 1; (c) static YAML-parse assertion that the four evidence jobs **always execute** + short-circuit internally (no silent-skip `if:`) and neither workflow uses `on: paths-ignore`, plus a **fail-open guard** test (simulated file-list error runs the real gate, never a silent pass); (d) marker comment present above each occurrence; (e) exit 2 on missing marker / bad usage; (f) rendered and template copies agree. Behavioral path-matching verified end-to-end by Exit criteria 1–3 (bash grep not node-unit-testable without a shell dep). Scratch files under `os.tmpdir()` only (LRN-094).
- **D71-6 — Hardening docs + operator notice.** `OPERATIONS.md` § "Skip-reasons matrix" note: the evidence-skip is also **path-derived** (label not required to keep gates green; still required for auto-merge — a correctly-shaped, unlabelled PR is green yet will not auto-merge until labelled; intended). Both workflows emit a `::notice::` when skipping via path-derivation. Keep the composed mirror in sync.
- **D71-7 — Self-checks green.** `harness lint` (incl. `workflow-pins`, `review-gates` structural lint, `text-encoding`), `node --test`, and `harness sync --mode=check` (zero drift between `template/managed/.github/workflows/*` and the rendered `.github/workflows/*`).

## User-approval gates

- **Gate A — Decision 7 form (resolved at plan review).** GPT-5.5 resolved this: keep the predicate **inline in YAML** + a static consistency linter; **no `lib/` extraction** (a consumer workflow cannot import repo-local `lib/` without cloning the harness). No further approval needed.
- **Gate B — Scope of Decision 6 (resolved).** Decision 6 places the content-PR Copilot-review-pending red out of scope (by-design async, ADR4-8). A follow-up CS may be filed if desired; no approval required to proceed.
- **Gate C — D71-1 inclusion (resolved: include).** D71-1 (the cheap `--label`-at-creation mitigation) is **included** as a complementary deliverable alongside the path-derived primary fix — harmless and reduces red even before the workflow change ships. The path-derived fix is **not** descopeable.

## Exit criteria

1. **(Primary)** A workboard-only-shaped PR (diff confined to the allowlist) opened **without** a pre-applied label produces **green** `review-gates` and `pr-evidence-lint` runs on its first `opened` event — verified on a real PR.
2. **(Complementary)** `OPERATIONS.md` § Claim/close-out and the `harness claim`/`close-out` rendered guidance instruct opening workboard PRs with `gh pr create --label workboard-only`.
3. A PR labelled `workboard-only` that touches a file **outside** the allowlist still **fails** `validate-workboard-only-scope` (guard intact).
4. A normal content PR (diff outside the allowlist) still runs **all** evidence gates (no accidental bypass).
5. `template/managed/.github/workflows/*` and the rendered `.github/workflows/*` are byte-aligned (`harness sync --mode=check` = no drift).
6. The D71-4 consistency linter passes (every `# harness:workboard-allowlist`-marked occurrence — `review-gates.yml` ×2, `pr-evidence-lint.yml`, `workboard-auto-approve.yml` — equivalent under canonical normalization), and the static test confirms the four evidence jobs always execute + short-circuit internally with no `paths-ignore` and a fail-closed file-list error path.
7. All self-checks in D71-7 pass; the close-out plan-vs-implementation review returns GO.

## Risks + open questions

- **R1 — Required-check context dropping.** If a job becomes "not-run" (e.g. via `paths-ignore`), branch protection may block the PR on a never-reported required context. Mitigation: jobs must *always execute and short-circuit internally* (report success), per Decision 5. Verify against the current required-status-check list before merge.
- **R2 — `gh api` cost / rate limits.** The hardening tier adds a file-listing API call to `review-gates`. Mitigation: one paginated call, fail-closed on error (mirror the existing pr-evidence-lint guard).
- **R3 — Allowlist drift across occurrences.** The allowlist regex is embedded inline in multiple marked occurrences (`review-gates.yml` ×2 — the guard **and** the new skip logic — `pr-evidence-lint.yml`, `workboard-auto-approve.yml`); they could silently diverge. Mitigation: the D71-4 consistency linter (run in `harness lint`/CI) fails if any occurrence diverges under canonical normalization; the implementer adds a `# harness:workboard-allowlist` marker comment above each occurrence so the linter can locate them reliably.
- **R4 — Fail-open via silently-skipped dependents.** A `compute-skip` job with `needs:`-dependent evidence jobs would, on `compute-skip` failure, mark dependents *skipped* (GitHub treats as success) — bypassing review (fail-open). Mitigation (D71-3): evidence jobs **always execute** and short-circuit internally, failing **closed** on a file-list API error; verified by the D71-5 fail-open guard test. This is the single most important safety invariant of the hardening tier.
- **OQ1 — Auto-merge interaction.** Confirm `workboard-auto-approve.yml` still requires the label and is unaffected (it is intentionally unchanged here).
- **OQ2 — Consumer impact.** These are managed templates synced to consumer repos; confirm the change is backward-compatible for consumers that have not opted into review gates (`review_gates.enabled` false → workflow inert).
- **OQ3 — Keep the `--label` complementary mitigation (D71-1)?** PRs #305 (green) and #306 (red) prove `gh pr create --label` is racy, so D71-1 alone is **insufficient** and the path-derived fix (D71-2…D71-7) is the required primary. D71-1 is a cheap add-on that reduces red even before the workflow change ships. **Resolved: include D71-1** (harmless, complementary). *(Earlier plan revisions inverted primary/secondary — corrected after PR #306 reproduced the race with `--label`.)*

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | general-purpose (orchestrator: omni-ah) | eb3d297f158e | 2026-06-11T18:38:00Z | Go-with-amendments | Resolve shared-predicate arch (lib vs inline), add YAML plumbing tests, cover workboard-auto-approve allowlist drift, document no-label green/no-auto-merge state. |
| R2 | gpt-5.5 | claude-opus-4.8 | general-purpose (orchestrator: omni-ah) | e6858dc11023 | 2026-06-11T18:43:00Z | Go-with-amendments | F1/F3/F4 resolved; F2 partial — require always-execute/fail-closed (no fail-open via skipped needs:); F5 — linter must cover every allowlist occurrence incl. validate-workboard-only-scope. |
| R3 | gpt-5.5 | claude-opus-4.8 | general-purpose (orchestrator: omni-ah) | 19ced0297c8a | 2026-06-11T18:47:30Z | Go | F2 resolved; F5 resolved; no new blockers. |
| R4 | gpt-5.5 | claude-opus-4.8 | general-purpose (orchestrator: omni-ah) | e803de20cd69 | 2026-06-11T18:56:00Z | Go-with-amendments | Re-review after empirical finding (#305: gh pr create --label avoids the race) → restructured to two-tier (cheap primary + optional hardening). Fix lib-scope inconsistency; scope the green guarantee. |
| R5 | gpt-5.5 | claude-opus-4.8 | general-purpose (orchestrator: omni-ah) | 93d097b6e112 | 2026-06-11T19:02:00Z | Go | F1 (lib guidance-string edits in scope) + F2 (green guarantee scoped to mandated create path; universal needs hardening) resolved; no new material blockers. |
| R6 | gpt-5.5 | claude-opus-4.8 | general-purpose (orchestrator: omni-ah) | 27d510491a54 | 2026-06-11T19:14:00Z | Go-with-amendments | Re-corrected after #306 reproduced the race with --label (#305 green/#306 red, same cmd): path-derivation = reliable primary; --label = complementary. Gate wording resolved. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per § Claim) | planned | — | — |

## Notes / Learnings

- Surfaced from the CS70 close-out (#304) red-check false alarm during a system-health validation (2026-06-11). The root cause is documented in Background; a `LEARNINGS.md` entry is a D71-1 deliverable. **Plan-evolution note:** revisions R4/R5 briefly inverted this to a `--label`-primary design on the strength of PR #305 (a single green observation); PR #306 then reproduced the race with the identical command, restoring path-derivation as the reliable primary (R6). Lesson: don't restructure a reviewed plan on a single data point.

## Plan-vs-implementation review

> _(filled at close-out per the gate)_
