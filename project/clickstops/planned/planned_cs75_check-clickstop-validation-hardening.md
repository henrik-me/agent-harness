# CS75 — check-clickstop validation hardening: directory-form recursion + fence-aware PVI gate + deliverable-target F-check

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** omni-ah-c3 (Claude Opus 4.8), 2026-06-30 — filed from the open-LRN harvest triage requested by @henrik-me. Bundles **LRN-167** (`check-clickstop.mjs` directory-form + fence-aware-PVI gaps, surfaced while building `review-cs` at CS66) and **LRN-152** (plan-review deliverable-target-resolves-to-live-surface check, orphaned when its designated home CS66 closed without absorbing it).
**Depends on:** none (hard). Touches `scripts/check-clickstop.mjs` (CS03b/CS70), `lib/doc-schema.mjs`, `lib/review-cs.mjs` (CS66 — the fence-aware reference), and `REVIEWS.md` plan-review doctrine (CS58 § 2.6c). No in-flight CS owns these surfaces.

## Goal

Make `scripts/check-clickstop.mjs` — the authoritative clickstop gate — at least as strict as the `review-cs` verb that backstops it, by closing two structural validation gaps (LRN-167), and re-home the orphaned plan-review fact-claim check (LRN-152) so a "modify file X" deliverable is verified to target an actual shipped/loaded surface rather than merely an existing path.

## Background

CS66's `review-cs` verb shipped its own fence-aware + directory-form backstops because two pre-existing gaps in `check-clickstop.mjs` let malformed clickstops pass the linter (LRN-167):

1. **Directory-form CS plans escape validation.** The main loop iterates only direct `.md` *file* entries of each `{planned,active,done}` dir (`if (!entry.isFile()) continue;` at `scripts/check-clickstop.mjs:544`), so a directory-form plan (`<state>/<state>_csNN_<slug>/<state>_csNN_<slug>.md`) is never passed to `checkFile()` and escapes required-field, close-out-task, and `## Plan-vs-implementation review` (PVI) validation.
2. **The PVI gate is not fence-aware.** The gate (`scripts/check-clickstop.mjs:284-312`) detects the `## Plan-vs-implementation review` H2 via `hasMarkdownHeading` + a `/m` regex (`GATE_H2_RE`), neither of which tracks fenced code blocks, so a `## Plan-vs-implementation review` line *inside* a fenced code block satisfies the gate even when no real H2 exists.

`review-cs` already solves both with a builtins-only, CommonMark-correct `findPviHeadingIndex` (`lib/review-cs.mjs:233` — tracks fence char + opening run length so an inner ``` cannot close an outer ````). It is deliberately **stdlib-only** (it does *not* import `lib/doc-schema.mjs`) because review gate scripts run in the dependency-free `.harness-ci` clone and `lib/doc-schema.mjs` imports `js-yaml` (which would `ERR_MODULE_NOT_FOUND` there). So the shared fence-aware helper must live in a **new node-builtins-only module** that both `check-clickstop.mjs` and `review-cs.mjs` import — **not** in `doc-schema.mjs`. Until the gate adopts this logic, the verb is *stricter than the gate it backstops*.

Separately, **LRN-152** recorded that plan reviews must verify a "modify file X" deliverable targets the *actual shipped/loaded* surface (referenced by `harness.config.json` `managed.files`/`composed.files`, by code, or by sync), not merely that the path exists — a distinct fact-claim failure mode from LRN-139 (a false line citation). CS54b's plan named a dead-orphan `template/managed/.github/pull_request_template.md` (the real surface had migrated to *composed* at CS38a) and both plan-review rounds passed it. LRN-152 was assigned to CS66's `review-cs` checklist, but CS66 closed without absorbing it; it is currently orphaned (`status: open`, with no mention in `done_cs66`/`review-cs.mjs`/`REVIEWS.md`).

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C75-1 | Directory-form recursion | Extend the `check-clickstop.mjs` main loop so that, for each `{planned,active,done}` dir entry that is a **directory** whose name matches the canonical clickstop stem `^(planned\|active\|done)_cs\d+[a-z]*_` (multi-letter suffix allowed — **align with / derive from the existing `FILENAME_RE`**, not a fresh `[a-z]?`), it locates the inner plan file `<dir>/<dirname>.md` and passes it to `checkFile()` (same `subdir` classification). A conforming directory whose inner `<dirname>.md` is absent, or that holds a stray differently-named `<state>_csNN_*.md`, is a **structure error**, not a silent skip. Keep the existing direct-`.md`-file path. | Directory-form plans are first-class (CS70 doctrine); the gate must validate them or required-field/PVI/close-out checks silently do not run. Aligns with the file the orphan-check (C70-6) already reasons about; one regex source prevents suffix-length drift. |
| C75-2 | Fence-aware PVI heading, shared helper | Replace the PVI gate's fence-naive `hasMarkdownHeading` + `GATE_H2_RE` detection with a **fence-aware** heading scan. Extract `review-cs`'s `findPviHeadingIndex` run-length fence tracking into a **new node-builtins-only module** (e.g. `lib/markdown-fence.mjs`), consumed by **both** `check-clickstop.mjs` and `lib/review-cs.mjs`, so there is one CommonMark-correct implementation. **Not** `lib/doc-schema.mjs`: it imports `js-yaml`, and `review-cs` must stay stdlib-only for the dependency-free `.harness-ci` clone (importing `doc-schema` there would `ERR_MODULE_NOT_FOUND`). | A `## PVI` heading inside a code fence must not satisfy the gate. One zero-dep shared helper prevents the two implementations from drifting, removes the CS66 backstop duplication, and preserves `review-cs`'s stdlib-only CI invariant. |
| C75-3 | LRN-152 deliverable-target F-check (doctrine) | Add a plan-review fact-claim check to `REVIEWS.md § 2.6c` (the F1–F6 plan-review set; + `template/composed/REVIEWS.md` lockstep): a "modify file X" deliverable's target MUST resolve to a **live shipped/loaded surface** — referenced by `harness.config.json` `managed.files`/`composed.files`, by code/sync, or otherwise demonstrably consumed — not merely an existing path. Cross-link LRN-152 / LRN-139. | The orphaned LRN-152 needs a home; the check is fundamentally semantic (reviewer judgment about whether editing X changes a shipped artifact), so doctrine is the primary mechanism, consistent with CS58's deliberate choice not to over-mechanize fact-claim verification. |
| C75-4 | LRN-152 mechanical assist (best-effort, bounded) | In `review-cs`, add a **best-effort advisory** that, for each filesystem-path-looking token in the plan's `## Deliverables`, flags any that does not resolve to a **git-tracked** file in the tree (path-existence only). Explicitly **do not** attempt full manifest-membership resolution (that stays reviewer judgment per C75-3). Advisory only — never fail-closed on parse ambiguity. | The cheap, non-semantic half (does the path exist at all) is mechanizable; it is a *supplement* to C75-3, not a replacement (it would not have caught CS54b, whose orphan path existed). Advisory severity avoids false positives on prose-embedded illustrative paths. |
| C75-5 | No new errors — *after* legacy directory-form remediation | Enabling C75-1 recursion validates the **6 existing directory-form CSs** for the first time, surfacing latent defects. A **pre-flight audit** (the CS's first task — run the hardened gate over them) enumerates every newly-surfaced error; each is **repaired** or shown to already satisfy the checks. The definitive set today (verified by running the real gate over all 6 inner files) is **two**: `done_cs01_bootstrap-repo` is missing `**Depends on:**` → add `**Depends on:** none`; `done_cs22_cut-harness-v0.2.0` carries a stale `**Status:** active` in `done/` → fix to `**Status:** done`. The other four pass — all have a real `## Plan-vs-implementation review` H2; `done_cs11` is close-out-task-exempt as a pre-`CLOSEOUT_TASK_ENFORCEMENT_DATE` (`2026-05-10`) close, and `done_cs16`/`cs63c`/`cs64` already satisfy the close-out-task rows. The zero-new-errors acceptance check is evaluated **after** this remediation. | A linter-hardening CS must not retroactively break `main`-green. Defects are repaired in-CS — not silently suppressed — and the pre-flight audit makes the affected set auditable rather than assumed (the original "already valid" premise was false; recursion legitimately surfaces two real stale-header defects). |
| C75-6 | SemVer | **Patch** — stricter internal lint + a doctrine F-check; no new CLI subcommand, flag, or schema field. CHANGELOG `[Unreleased]` → Fixed (+ Changed for the REVIEWS.md doctrine addition). | Tightening an internal gate to match documented/backstopped intent is a fix; no consumer-visible CLI surface is added (`review-cs` advisory text changes, but no new flag). |

## Deliverables

1. `scripts/check-clickstop.mjs` (edit) — directory-form recursion in the main loop (C75-1) + fence-aware PVI heading detection via the shared helper (C75-2).
2. `lib/markdown-fence.mjs` (new, node-builtins only — zero runtime deps) — shared fence-aware heading-locator helper (C75-2), consumed by both `check-clickstop.mjs` and `lib/review-cs.mjs`.
3. `lib/review-cs.mjs` (edit) — consume the shared helper instead of its private `findPviHeadingIndex` (C75-2); add the best-effort deliverable-path advisory (C75-4).
4. `REVIEWS.md` (edit) + `template/composed/REVIEWS.md` (edit, lockstep) — add the LRN-152 deliverable-target-resolves F-check to § 2.6c plan-review checks (C75-3); composed-blocks lockstep stays green.
5. `tests/*.test.mjs` (new/edit, `os.tmpdir()` only) — directory-form CS validation (valid + missing-PVI + missing-required-field cases); fenced-PVI-heading rejection (incl. the inner-```-inside-```` edge case); shared-helper unit tests; the `review-cs` deliverable-path advisory. Minimum: cover each new branch; over-delivery on tests is welcome.
6. `LEARNINGS.md` (edit) — flip LRN-167 + LRN-152 `open → applied` at close-out with the merge SHA; cross-ref this CS.
7. `CHANGELOG.md` (edit) — `[Unreleased]` Fixed/Changed entries.
8. `project/clickstops/done/done_cs01_bootstrap-repo/done_cs01_bootstrap-repo.md` (edit — add `**Depends on:** none`) **and** `project/clickstops/done/done_cs22_cut-harness-v0.2.0/done_cs22_cut-harness-v0.2.0.md` (edit — stale `**Status:** active` → `**Status:** done`): repair the two defects recursion surfaces (C75-5). Record the pre-flight audit result (the enumerated newly-validated directory-form set + per-file disposition) in this CS's `done_` directory.

## User-approval gates

- **G-no-regression** — confirm with the orchestrator before suppressing or grandfathering any *new* error C75-5 surfaces against the live `project/clickstops/**` tree (it should surface none; a surfaced error means a real latent defect to fix in that CS file).

## Exit criteria

- `node bin/harness.mjs lint --quiet` exits 0 (0 failed) over the live tree; the hardened `check-clickstop` produces no new errors on conforming files (C75-5).
- A fenced `## Plan-vs-implementation review` heading no longer satisfies the gate; a directory-form CS missing required fields/PVI now fails.
- `check-clickstop.mjs` and `review-cs` share one fence-aware heading helper (no duplicated implementation).
- `REVIEWS.md` + composed mirror carry the LRN-152 F-check; lockstep lint green.
- Full `node --test tests/*.test.mjs` passes.

## Risks + open questions

- **R1 — directory-form discovery shape.** The rule for locating the inner plan file (`<dir>/<dirname>.md`) must match CS70's directory-form convention; a CS dir with a differently-named inner file should be a structure error, not a silent skip. Confirm against existing `done_cs64_*/`, `done_cs16_*/`.
- **R2 — shared-helper extraction risk.** Moving `findPviHeadingIndex` into the new `lib/markdown-fence.mjs` module must preserve `review-cs`'s exact CommonMark semantics (run-length close rule) and keep the module dependency-free; regression-test the inner-```-inside-```` case on both consumers.
- **OQ1 — C75-4 advisory false positives.** Prose-embedded or illustrative paths in `## Deliverables` may trip the path-existence advisory; is advisory-only (never fail) the right severity, or should it sit behind a flag? (Plan-review input wanted.)
- **(Resolved) LRN-152 flip basis** — doctrine (C75-3) + the C75-4 advisory is sufficient to flip LRN-152 `applied` (Deliverable 6), consistent with CS58 keeping fact-claim verification semantic rather than fully mechanized; no extra mechanical check in `check-clickstop-plan-review` is required.

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | cs75-plan-review | 98a962020edc | 2026-06-30T20:12:00Z | Needs-Fix | C75-5 'zero new errors' false (done_cs01 missing Depends on); doc-schema imports js-yaml vs review-cs stdlib-only; [a-z]? vs [a-z]* suffix; OQ2 conflicts Deliverable 6. |
| R2 | gpt-5.5 | claude-opus-4.8 | cs75-review-r2 | ad84b49e31f5 | 2026-06-30T20:28:00Z | Needs-Fix | Recursion also newly errors done_cs22 (stale Status:active in done/); 'close-out-task date-grandfathered' wording inaccurate (CS16/63c/64 satisfy via rows). |
| R3 | gpt-5.5 | claude-opus-4.8 | cs75-review-r3 | 46a713be3802 | 2026-06-30T20:36:00Z | Go | Definitive newly-failing set verified exactly two: done_cs01 (+Depends on), done_cs22 (Status active->done); wording accurate; no new findings. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per § Claim) | planned | — | — |

## Notes / Learnings

- Bundles LRN-167 (directory-form + fence-aware PVI) and LRN-152 (deliverable-target-resolves). LRN-152 was orphaned by CS66's close-out (its assigned home shipped without it).

## Plan-vs-implementation review

> _(filled at close-out per the gate)_
