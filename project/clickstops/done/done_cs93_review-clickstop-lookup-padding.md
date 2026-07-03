# CS93 — harness review: fix non-dry-run clickstop-file lookup (zero-padded + directory-form)

**Status:** done
**Owner:** yoga-ah
**Branch:** cs93/content
**Started:** 2026-07-03
**Closed:** 2026-07-03
**Filed by:** yoga-ah (Claude Opus 4.8), 2026-07-03 — from inbound bug report #407 (reported by @henrik-me from consumer repo `henrik-me/authzandentitlements`).
**Depends on:** none (hard). Touches `lib/review.mjs` only (plus tests); no in-flight CS owns that surface. `lib/review-cs.mjs` `locateClickstop` is the robust reference the fix aligns to (read-only).

## Goal

Fix issue #407: `harness review <pr>` aborts its **non-dry-run** path with "Could not find clickstop file for CS02 …" even though the clickstop file exists, while `--dry-run` succeeds. Make the non-dry-run clickstop-file lookup resolve zero-padded (`cs02`) and directory-form clickstops correctly, eliminating the padding-divergence bug class.

## Background

`harness review <pr>` on a content branch (`cs02/content`) fails on the real path but not under `--dry-run`. Root cause, traced in `lib/review.mjs`:

1. `runReview` short-circuits the `--dry-run` path at `lib/review.mjs:128` **before** any clickstop lookup, so `--dry-run` never exercises the resolver — it cannot reproduce, and is not a "working resolver" to consolidate onto (contrary to the issue's guess).
2. On the real path: `extractCsIdFromBranch("cs02/content")` returns `CS02` (preserves the branch digits) → this is the `csId` printed in the error, hence the error reads "CS02".
3. `findClickstopFile({ cwd, csId: "CS02" })` builds its search token via `normalizeCsId("CS02")`, whose regex `/CS\s*0*([0-9]+[a-z]?)/i` **strips leading zeros** → `CS2` → `.toLowerCase()` → `cs2`, then does `entry.name.toLowerCase().includes("cs2_")`. The real file `active_cs02_fintech-domain-skeleton.md` contains `cs02_`, **not** `cs2_`, so nothing matches and it throws `bad-input`. The error message reports the un-normalized `CS02`, masking that the lookup actually searched for `cs2_`.

Two secondary defects in the same function:

- It gates each stage dir on `if (!fs.existsSync(dir)) continue;`. `existsSync` also returns `false` on `EACCES`, so a permission fault is silently masked as "no clickstop" (the repo's documented fail-open anti-pattern; the robust `locateClickstop` in `lib/review-cs.mjs` already reads directly and discriminates `ENOENT`).
- It only inspects `entry.isFile()` entries, so a **directory-form** clickstop (`active_cs<NN>_<slug>/active_cs<NN>_<slug>.md`, first-class since CS70) is never found — a latent near-identical failure waiting for the first directory-form content PR.

`lib/review-cs.mjs`'s `locateClickstop` (CS66) is the robust reference: it parses `cs(\d+[a-z]?)` from each flat/dir entry and compares `CS${digits}` to the target, reads directly with `ENOENT` discrimination, and supports directory form. This CS brings `findClickstopFile` up to that standard while additionally making the number comparison **padding-insensitive** (normalize both sides) so `CS02`↔`cs02` and `CS2`↔`cs2` both resolve.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C93-1 | Padding-insensitive CS-number match | Rewrite `findClickstopFile` to parse the CS number+suffix from each entry via a stage-anchored regex (`^<stage>_cs(\d+[a-z]?)_…`) and compare `normalizeCsId("CS"+digits)` against `normalizeCsId(csId)` — i.e. normalize **both** sides (both zero-stripped) instead of building a one-sided zero-stripped substring token matched against a raw zero-padded filename. | Directly fixes #407 and removes the whole padding-divergence class: branch-derived `CS02` now matches file `cs02_`, and an unpadded `cs2_` file (or `CS2` id) also resolves. No dependence on branch/filename padding staying in lockstep. |
| C93-2 | Directory-form support | Recognize directory-form clickstops: a stage entry that is a **directory** matching `^<stage>_cs(\d+[a-z]?)_…$` resolves to its inner `<dirname>.md`. Mirror `lib/review-cs.mjs` `locateClickstop`. | Directory-form CSs are first-class (CS70). Without this the same "not found" defect recurs on the first directory-form content PR reviewed via `harness review`. Cheap, aligns with the reference resolver. |
| C93-3 | Fail-closed dir read | Replace `if (!fs.existsSync(dir)) continue;` with a direct `readdirSync` (and inner `statSync`) that `continue`s only on `err.code === 'ENOENT'` and rethrows any other error. | `existsSync` returns false on `EACCES` too, silently masking a permission fault as "no clickstop." Matches the CS-documented fail-closed convention already used by `locateClickstop`. |
| C93-4 | Export for direct unit test | Add `export` to `findClickstopFile` (keep `normalizeCsId` internal). | Enables a hermetic, `os.tmpdir()`-only unit test of the resolver — the bug is entirely within this function; a full `runReview` path test would require mocking `gh` for marginal added coverage. Consistent with other exported helpers in the module. |
| C93-5 | First-match ordering preserved | Preserve the existing `active` → `planned` → `done` search order and first-match return (no new "ambiguous match" throw). | Keeps behavior a strict superset of today's (was already first-match); avoids introducing a new failure mode in a patch fix. Ambiguity across stages is not a #407 concern. |
| C93-6 | SemVer | **Patch** — bug fix to distributed runtime (`lib/review.mjs`); no new CLI subcommand/flag/schema field; the added `export` is an internal-module API, not a consumer CLI surface. CHANGELOG `[Unreleased] → Fixed`. | Restoring a broken command to its intended behavior is a fix; no consumer-visible CLI surface is added. |

## Deliverables

1. `lib/review.mjs` (edit) — rewrite `findClickstopFile` per C93-1/C93-2/C93-3 and `export` it (C93-4); leave `normalizeCsId` and all other callers unchanged.
2. `tests/cs93-review-clickstop-lookup.test.mjs` (new, `os.tmpdir()` only) — regression + robustness coverage: zero-padded flat lookup (`CS02` → `active_cs02_*.md`, the #407 case), unpadded id/file symmetry (`CS2`↔`cs02`, `CS02`↔`cs2`), directory-form lookup, letter-suffix (`CS64b`), `planned`/`done` stage coverage, not-found → `ReviewError('bad-input')`, and missing-tree (`ENOENT`) → not-found rather than crash. Minimum: cover each new branch; over-delivery welcome.
3. `CHANGELOG.md` (edit) — `[Unreleased]` `### Fixed` bullet referencing #407.
4. `LEARNINGS.md` (edit, at close-out) — file a learning for the padding-divergence + fail-open pattern (one-sided normalization matched against a raw filename), cross-ref #407 and `locateClickstop`.

## User-approval gates

- **(none)** — self-contained bug fix with no user-facing behavior change beyond making a broken command work. No suppression/grandfathering involved. The v0.12.1 release that ships this fix is tracked separately (CS94) per "a release is its own CS."

## Exit criteria

- `node bin/harness.mjs review <pr>` non-dry-run path resolves a zero-padded (`cs0N`) clickstop file — verified by the new unit test asserting `findClickstopFile({cwd, csId:'CS02'})` returns the `active_cs02_*.md` path (the exact #407 repro).
- Directory-form and letter-suffix clickstops resolve; a genuinely absent CS still throws `ReviewError` `bad-input`.
- `node --test tests/*.test.mjs` passes (incl. the new file).
- `node bin/harness.mjs lint --quiet` exits 0.
- Issue #407 closes on merge.

## Risks + open questions

- **R1 — behavior superset.** The rewrite must not regress existing flat-file resolution. Mitigation: the new matcher is a strict superset (still finds flat `.md` files; adds padding-insensitivity + directory form); regression-covered by tests. Existing `cs52-harness-review-lib` tests must stay green.
- **R2 — `normalizeCsId` shared use.** `normalizeCsId` is also used for `high_risk_clickstops` comparison (`lib/review.mjs:340-341`), where both sides are already normalized — unchanged by this CS (we only change `findClickstopFile`'s call pattern, not `normalizeCsId` itself).
- **(Resolved) OQ — consolidate onto `locateClickstop`?** Rejected: `locateClickstop` takes a `seam` and does exact-string (`CS${d}`) comparison, so importing it wholesale would not add padding-insensitivity and would couple the orchestrator verb to the CI-clone module's seam shape. Aligning the logic in-module (this CS) is lower-risk and strictly more robust.

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | cs93-plan-review | e65ce952ef83 | 2026-07-03T06:10:24Z | Go | Claims verified against lib/review.mjs line-by-line; targets real one-sided normalization bug, scope preserved, resolver regression coverage adequate; SemVer Patch sound. |

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | yoga-ah |
| Reviewer agent | rubber-duck (orchestrator: yoga-ah) |
| Notes | **Patch** SemVer (bug fix to `lib/review.mjs`; no CLI flag/subcommand/schema; the added `export` is internal-module API). Independence per REVIEWS § 2.3 — reviewer `gpt-5.5` ≠ implementer `claude-opus-4.8`. Plan reviewed by gpt-5.5 (R1 Go, hash `e65ce952ef83`). Finalized at close-out. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1 — `lib/review.mjs`: rewrite + `export` `findClickstopFile` — padding-insensitive CS-number match (C93-1), directory-form support (C93-2), fail-closed `readdir`/`stat` w/ ENOENT discrimination (C93-3), export for unit test (C93-4) | active | yoga-ah | agent-id=yoga-ah \| role=implementer \| report-status=pending \| learnings=0 |
| T2 — `tests/cs93-review-clickstop-lookup.test.mjs` (new, os.tmpdir only): #407 regression + padding/dir-form/suffix/not-found/ENOENT coverage; `CHANGELOG.md` `[Unreleased]` Fixed bullet | active | yoga-ah | agent-id=yoga-ah \| role=implementer \| report-status=pending \| learnings=0 |
| Independent content review (GPT-5.5) | pending | — | reviewer model ≠ implementer (independence per REVIEWS § 2.3); via `harness review` |
| Close-out: docs + restart state | pending | yoga-ah | Update WORKBOARD.md (remove CS93 row) + CONTEXT.md; no rendered-mirror change (lib/tests only). |
| Close-out: learnings + follow-ups | pending | yoga-ah | File LEARNINGS.md padding-divergence / one-sided-normalization entry; #407 auto-closes on merge. |

## Notes / Learnings

- Bundles the single inbound bug #407. Root cause: one-sided zero-stripping (`normalizeCsId`) building a substring token matched against a raw zero-padded filename. Aligns `findClickstopFile` with the CS66 `locateClickstop` reference resolver.

## Plan-vs-implementation review

**Reviewer:** GPT-5.5 (rubber-duck; background agent `cs93-pvi`, independent of the claude-opus-4.8 implementer per REVIEWS § 2.3)
**Date:** 2026-07-03T06:47:00Z
**Outcome:** GO

Reviewed the CS93 plan (§ Decisions C93-1…C93-6, § Deliverables 1–4, § Exit criteria) against the merged content (`dbe4e03`→`d38bfa1`, PR #411, squash `37b46e2`).

| Deliverable | Outcome | Assessment |
|---|---|---|
| 1 — `lib/review.mjs` rewrite + `export` `findClickstopFile` | match | Exported; padding-insensitive both-sides `normalizeCsId` compare (C93-1); directory-form support (C93-2); ENOENT-discriminating fail-closed `readdir`/`stat` (C93-3); `normalizeCsId` + `high_risk_clickstops` caller left unchanged. |
| 2 — `tests/cs93-review-clickstop-lookup.test.mjs` | match (over-delivered) | 12 `os.tmpdir()`-only tests incl. the exact #407 repro (`CS02`→`active_cs02_*.md`), padded/unpadded both directions, dir-form, letter-suffix, stages, non-`.md`, distinct-number non-confusion, not-found, ENOENT, and 2 ambiguity cases. |
| 3 — `CHANGELOG.md` `[Unreleased]` Fixed | match | Accurate #407 bullet; no overclaim vs shipped code. |
| 4 — `LEARNINGS.md` flip/file | done at close-out | LRN-185 filed in this close-out. |

**Accepted divergence (in-intent hardening):** C93-5 ("first-match ordering preserved") was superseded by a **fail-closed on an ambiguous `>1` match** (adopted from the Copilot R1 review), which better realizes the plan's own stated intent to align with `lib/review-cs.mjs` `locateClickstop` (which rejects ambiguity). Tested (2 new cases); not scope creep. Exit criteria 5/5 met; #407 CLOSED on merge; no overclaims (GPT-5.5 `cs93-pvi`).
