# CS57 — post-CS48 lint hardening: model-ID normalization + configurable high-risk + missing-audit enforcement

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** `yoga-ah` (2026-05-28) carrying forward the substantive work from closed PR #201 (`cs48/post-merge-review-fixes`), which the maintainer superseded as a stale (2026-05-15) follow-up to CS48 PR #198 with the explicit instruction: "the substantive work … will be carried forward verbatim into the new CS branch — nothing is being discarded."
**Depends on:** None. Independent of the CS54 close-out. Touches only `scripts/check-clickstop-implementer-not-reviewer.mjs` + its tests/fixtures; no template, CLI-surface, or schema changes.

## Goal

Harden `scripts/check-clickstop-implementer-not-reviewer.mjs` so the `## Model audit` model-independence lint (1) compares model IDs by normalized family+version, (2) implements the GPT-5.5 primary-reviewer overlap exception keyed off the **configured** `reviews.high_risk_clickstops` list rather than a hard-coded copy, (3) treats a missing/malformed `## Model audit` as an enforced error for in-scope clickstops (not a silent warn), and (4) applies the right lifecycle gate when recursing into nested CS directories. The behaviour change must NOT retroactively break the 8 existing `done/` clickstops (CS48–CS56) that predate Model-audit enforcement.

## Background

PR #198 (CS48, merged) added a `## Model audit` model-independence rule to this linter. PR #201 was opened on 2026-05-15 to address late Copilot review findings on that rule, but sat for 14 days while `main` advanced through v0.6.0 (CS49–CS56). On 2026-05-29 the maintainer closed #201 unmerged — not to discard it, but to re-file the substantive work under current doctrine with a proper plan-review + rubber-duck + Copilot cycle. At close time #201 had 4 red checks, all stale-branch artifacts (trailerless merge commits, a stale-diff `analyzed_head` verdict, and lint/test drift in unrelated aggregator surfaces) — none in the owned linter file, which has had **zero commits on `main` since CS48** (last touch `5379097`). The substantive delta therefore applies cleanly against current `main`.

Two facts established while filing this CS:

1. **Doctrine is unchanged.** REVIEWS.md (current `main`, line ~403) still reads: "The reviewer model must not appear in the implementer list unless the reviewer is GPT-5.5 on a non-HIGH-RISK CS; HIGH-RISK CSs forbid overlap regardless." PR #201's GPT-5.5 exception matches this verbatim.
2. **A config-vs-code drift exists on `main` today.** `harness.config.json` already carries a populated `reviews.high_risk_clickstops` array (`["CS03","CS11","CS15a","CS18b","CS19"]`), and `schemas/harness.config.schema.json` defines it (line 184), but the linter ignores the config and uses a hard-coded list. This is a live Schema-is-source-of-truth (LRN-039) gap.

**Adoption-blocker discovered during plan-filing (decisive for C57-4):** A baseline run of the *current* linter against the repo reports `0 errors, 25 warnings`. The warnings reveal that **8 `done/` clickstops closed after CS48 (CS48, CS49, CS50, CS51, CS52, CS53, CS55, CS56) have no `## Model audit` section at all.** PR #201's missing-audit policy keyed enforcement off a raw CS-number cutoff (`CS ≥ 48 → ERROR`), which would have turned all 8 of those historical files into hard errors and broken `main` on merge. This CS must gate the warn→error flip so existing closed files are grandfathered. The linter already contains the right mechanism: a `parseClosedDate` + `ENFORCEMENT_DATE_MS` date-gate grandfather (`IMPLEMENTER_NOT_REVIEWER_RECURSION_ENFORCEMENT_DATE = '2026-05-14'`, itself mirroring `CLOSEOUT_TASK_ENFORCEMENT_DATE`). C57-4 reuses that precedent rather than inventing a new cutoff shape.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C57-1 | Model-ID normalization | Adopt PR #201's `normalizeModelId()` extension: after lowercasing/compacting to a dash form, fold known families to `family-major.minor` — Claude `(opus\|sonnet\|haiku)` → `claude-<family>-<maj>.<min>`, GPT → `gpt-<maj>.<min>`. Unknown shapes pass through compacted unchanged. | Doc-style (`"Claude Sonnet 4.6"`, `gpt-5.5`) and config/CI-style (`claude-sonnet-4-6`, `gpt-5-5`) IDs must compare equal so the overlap check neither false-positives on a format difference nor false-negatives across families. Matches the family+version normalization already documented for the Model-audit independence invariant. |
| C57-2 | GPT-5.5 reviewer-overlap exception | Overlap of an implementer model with the reviewer model is an ERROR **unless** the normalized reviewer model equals the primary reviewer (`gpt-5.5`) AND the clickstop is NOT high-risk. High-risk CSs forbid overlap regardless of reviewer model. | Verbatim from PR #201; confirmed still-current doctrine (REVIEWS.md ~line 403, `independence-invariant` gate). The `PRIMARY_REVIEWER_MODEL` is itself derived via `normalizeModelId('gpt-5.5')` so the comparison is normalization-consistent. |
| C57-3 | High-risk source of truth | Read the high-risk set from `harness.config.json` → `reviews.high_risk_clickstops` (already schema-defined and populated). Compare CS IDs case-insensitively (upper-cased). Use the documented default `["CS03","CS11","CS15a","CS18b","CS19"]` when **either** the config file is absent **or** the file is valid JSON but the `reviews.high_risk_clickstops` key is missing/empty. (Present-but-wrong-type is handled by C57-6.) | Closes the LRN-039 config-vs-code drift. A missing key is a normal "consumer hasn't customized it" state, so the schema default applies; only a present-but-malformed value is a hard error. The DEFAULT constant keeps the linter sane out of the box. |
| C57-4 | Missing/malformed Model-audit enforcement + grandfather | Treat an absent or structurally-malformed `## Model audit` (no section, no header, or missing `Field`/`Value` columns) as **ERROR** for files that pass a date gate analogous to the existing `shouldLintByDateGate` but keyed on a new `MODEL_AUDIT_ENFORCEMENT_DATE`. Reuse the established date-gate semantics **verbatim** so behaviour stays consistent: `active/` and `planned/` → always evaluated; `done/` with `**Closed:**` strictly before the enforcement date → grandfathered (skip/warn-only); `done/` with an **unparseable** `**Closed:**` (em-dash/TBD) → warn+skip per C43-4; `done/` **missing** the `**Closed:**` line → lint normally (enforce — `check-clickstop.mjs` separately requires the field, so this cannot be a silent bypass); `done/` on/after the date → enforce. Set `MODEL_AUDIT_ENFORCEMENT_DATE` strictly AFTER the latest existing closed CS so the 8 known files (CS48–CS56) are grandfathered; the exact date is finalized at implementation against the live `done/` set. | A date-gate is the linter's own established grandfathering idiom (`ENFORCEMENT_DATE_MS`/`CLOSEOUT_TASK_ENFORCEMENT_DATE`). PR #201's raw `CS ≥ 48` cutoff would break the 8 historical files that lack the section (baseline-confirmed). Mirroring `shouldLintByDateGate`'s exact missing/unparseable-Closed handling (rather than blanket-grandfathering both) avoids creating a model-audit bypass and keeps the two date-gates behaviourally identical. |
| C57-5 | Nested-CS recursion lifecycle gate | Adopt PR #201's `checkFile(filePath, labelPrefix, lifecycleSubdir = labelPrefix.split('/')[0])` refactor and thread the parent `subdir` into nested recursion so a nested file (e.g. `active/active_cs48_x/active_cs48_x.md`) is gated by its true lifecycle (`active`), not by a mislabeled path. | The CS43 recursion added nested-dir walking; without threading the lifecycle, a nested active/done file could be mis-gated. PR #201 already wrote this fix and its regression test. |
| C57-6 | Malformed `harness.config.json` handling | When `harness.config.json` exists but cannot be parsed as JSON, OR parses but `reviews.high_risk_clickstops` is present with the wrong type (not an array of strings), emit a clear `ERROR:` to stderr naming the file + key and fail closed (non-zero exit) rather than silently substituting the default list. A missing/empty key is NOT an error (see C57-3). | Fail-closed parser doctrine (LRN-033): a malformed config must not silently degrade an enforcement linter to default behaviour. Scoping fail-closed to parse-error + wrong-type (not missing-key) avoids penalizing consumers who simply never set the key. This is the one refinement over PR #201, which logged the error but still defaulted. |
| C57-7 | Out of scope | No edits to REVIEWS.md / OPERATIONS.md doctrine, no `harness.config.json` value changes, no schema changes (`reviews.high_risk_clickstops` already exists), no changes to `bin/harness.mjs` or other linters, no backfill of `## Model audit` into the 8 historical CS48–CS56 files. | Scope discipline: single-linter behaviour change. Historical-file backfill, if ever wanted, is a separate doc CS — C57-4's date-gate makes it unnecessary for green CI. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | rubber-duck dispatched (orchestrator: yoga-ah) | e2d6c461d99c | 2026-05-29T05:20:29Z | Go-with-amendments | Amendments applied: C57-3/C57-6 split missing-key→default vs wrong-type→fail-closed; C57-4 mirrors shouldLintByDateGate missing/unparseable-Closed handling. No blockers. |

## Deliverables

1. **`scripts/check-clickstop-implementer-not-reviewer.mjs`** — extend per C57-1..C57-6:
   - `normalizeModelId()` family+version folding (C57-1).
   - `PRIMARY_REVIEWER_MODEL` constant + GPT-5.5 non-high-risk overlap exception in the overlap branch (C57-2).
   - `loadHighRiskClickstops()` reading `reviews.high_risk_clickstops` from `harness.config.json`: documented-default fallback on absent-file or missing/empty key; **fail-closed** (error + non-zero exit) on JSON parse error or present-but-wrong-type value (C57-3, C57-6).
   - `MODEL_AUDIT_ENFORCEMENT_DATE` + a missing-audit date gate that mirrors `shouldLintByDateGate`'s exact missing/unparseable-`**Closed:**` semantics, and a `missingAuditModelFinding(...)` error/warn split for the absent-section, missing-header, and missing-column code paths (C57-4).
   - `checkFile(filePath, labelPrefix, lifecycleSubdir)` signature + nested-recursion threading (C57-5).
   - Update the file header doc-comment, `HELP` text, and exit-code documentation to describe the new missing-model error condition and the high-risk-config source.
2. **`tests/check-clickstop-implementer-not-reviewer.test.mjs`** — carry forward PR #201's added cases and adapt the missing-audit assertions to the C57-4 **date-gate** (not CS-number) semantics. Minimum coverage (over-delivery encouraged per LRN-037):
   - bare/decorated Claude name normalization overlap (ERROR);
   - suffix/variant model-ID normalization overlap (ERROR);
   - GPT-5.5 overlap allowed on a non-high-risk CS (exit 0);
   - GPT-5.5 overlap fails on a high-risk CS (ERROR);
   - high-risk set sourced from a temp `harness.config.json` `reviews.high_risk_clickstops` (ERROR);
   - missing `## Model audit` on an `active/` file → ERROR;
   - missing `## Model audit` on a `done/` file closed AFTER the enforcement date → ERROR;
   - missing `## Model audit` on a `done/` file closed BEFORE the enforcement date → warn-only (grandfather);
   - missing `## Model audit` on a `planned/` file → warn-only;
   - malformed (wrong-header / missing-column) active Model-audit table → ERROR;
   - nested active clickstop missing Model audit under recursion → ERROR with the nested path in the message;
   - **regression guard**: linter exits 0 against the real repo `project/clickstops/` (the 8 historical CS48–CS56 files must remain grandfathered).
3. **`tests/fixtures/cs41/**`** — carry forward PR #201's `gpt-overlap-allowed/`, `gpt-overlap-high-risk/`, and the model-ID-format updates to `model-overlap*` fixtures; add/adjust any date-gated `done/` fixtures needed by Deliverable 2.
4. **`LEARNINGS.md`** — add a learning capturing the config-vs-code drift pattern (a schema-defined, populated config key silently ignored by an enforcement linter — LRN-039 follow-on) and the "raw CS-number cutoff would have broken 8 historical files; use the existing date-gate idiom" finding from this CS's baseline.

## Risk Assessment

| # | Risk | Mitigation |
|---|---|---|
| R1 | The missing-audit warn→error flip retroactively errors on existing files. | C57-4 date-gate set strictly after the latest closed CS; Deliverable-2 regression guard asserts the linter exits 0 against the live `project/clickstops/`. Implementer runs `node scripts/check-clickstop-implementer-not-reviewer.mjs --cwd .` as a self-check before reporting. |
| R2 | `MODEL_AUDIT_ENFORCEMENT_DATE` chosen too early and a yet-to-close CS slips under it without an audit. | Pick the date at implementation against the live `done/` set; document the chosen date + rationale inline (mirroring the existing `IMPLEMENTER_NOT_REVIEWER_RECURSION_ENFORCEMENT_DATE` comment). Active CSs are always enforced, so new work cannot regress. |
| R-config | C57-6 fail-closed on malformed config is a behaviour change vs PR #201 (which defaulted). A consumer with a malformed `harness.config.json` would newly fail this linter. | Scoped per the GPT-5.5 plan review: fail-closed applies ONLY to a JSON parse error or a present-but-wrong-type value; a missing/empty key uses the schema default and never errors (C57-3). Error message names the file + key. Matches LRN-033. |
| R3 | Normalization folds two genuinely-distinct models to the same ID (false-negative overlap miss). | Limit folding to the known Claude/GPT family regexes; unknown shapes pass through unchanged. Add a normalization unit assertion per family so drift is caught. |
| R4 | Test scratch dirs racing the repo's recursive text-encoding linter on Windows. | Use `os.tmpdir()` parents for all `mkdtempSync`/`writeFileSync` scratch fixtures (LRN-094); never write under REPO_ROOT. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| Implement C57-1..C57-6 in `scripts/check-clickstop-implementer-not-reviewer.mjs` (carry PR #201 forward; swap CS-number cutoff for date-gate; fail-closed config parse) | pending | — | single owned script; no template/CLI/schema changes |
| Carry-forward + adapt tests and fixtures to date-gate semantics; add real-repo grandfather regression guard | pending | — | `os.tmpdir()` scratch per LRN-094; test minimum is the Deliverable-2 list, over-delivery welcome |
| Choose + document `MODEL_AUDIT_ENFORCEMENT_DATE` against the live `done/` set | pending | — | strictly after latest closed CS; inline rationale comment |
| File LEARNINGS entry (config-vs-code drift + cutoff-shape finding) | pending | — | per Deliverable 4 |
| Self-checks: `node --test tests/check-clickstop-implementer-not-reviewer.test.mjs`, `node scripts/check-clickstop-implementer-not-reviewer.mjs --cwd .` (expect exit 0), text-encoding check on changed files | pending | — | regression guard must prove the 8 historical files stay grandfathered |
| Plan-vs-implementation review (close-out gate) | pending | — | gpt-5.5 rubber-duck per OPERATIONS.md; verdict recorded in `## Plan-vs-implementation review` before active→done rename |
| Close-out: docs + restart state (WORKBOARD row removed, CONTEXT.md if state changed, active→done rename) | pending | — | per OPERATIONS.md § Claim three-PR shape |
| Close-out: learnings + follow-ups (file/disposition LEARNINGS; planned follow-up CSs for any residuals) | pending | — | per OPERATIONS.md § Claim |

## Notes / Learnings

- **Source of carried-forward work:** closed PR #201 `cs48/post-merge-review-fixes` head `248263e` (substantive commit `b19ea10` by metzGi). Diff against `546b5fc`: `scripts/check-clickstop-implementer-not-reviewer.mjs` +85/-20, tests +109/-4, plus `gpt-overlap-allowed`/`gpt-overlap-high-risk` fixtures and `model-overlap*` format updates. The single deviation this CS makes from #201 is C57-4 (date-gate instead of `CS ≥ 48`) and C57-6 (fail-closed config), both motivated by findings recorded above.
- **Slot note:** the maintainer's #201 close comment said "re-file as a new CS (CS55+)"; CS55 and CS56 were taken by unrelated cross-repo work before this filing, so the next free slot is CS57.
