# CS97 — check-commit-trailers: strip git comment/scissors lines before trailer detection

**Status:** done
**Owner:** yoga-ah-c2
**Branch:** cs97/content
**Started:** 2026-07-03
**Closed:** 2026-07-03
**Filed by:** yoga-ah-c2 (Claude Opus 4.8), 2026-07-03 — from inbound bug report #420 (filed by the harness orchestrator from consumer repo `henrik-me/authzandentitlements`, CS10; LRN-018).
**Depends on:** none. Touches `scripts/check-commit-trailers.mjs` + its test/fixtures only; no in-flight CS owns that surface. Related but disjoint from #421 (prepare-commit-msg hook) — this CS fixes the *detector*, #421 adds a *hook*.

## Goal

Fix issue #420: `scripts/check-commit-trailers.mjs` (run by `harness lint` against `.git/COMMIT_EDITMSG`) false-fails with **"Missing required trailer: Co-authored-by"** after a `git rebase --continue` or a conflicted merge, because git leaves the real message + `Co-authored-by:` trailer **followed by** `# Conflicts:` / `# interactive rebase in progress` comment lines. The trailer is then no longer the *trailing* block, so the from-end scan breaks on the first `#` line and finds no trailers. Make the linter ignore git comment lines (and the scissors cut-line) the same way git itself does before locating the trailer block.

## Background

The linter reads the message, strips BOM, normalises line endings, then extracts the trailer block by scanning **from the end** (`scripts/check-commit-trailers.mjs:162-174`): it skips trailing blank lines, then collects consecutive `Key: Value` lines, stopping at the first line that is blank or does not match `TRAILER_RE = /^([A-Za-z][A-Za-z0-9-]*): (.+)$/`.

A `#`-prefixed comment line does not match `TRAILER_RE`, so when `COMMIT_EDITMSG` looks like:

```
<subject>

<body>

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
# Conflicts:
#	WORKBOARD.md
#
# It looks like you may be committing a merge.
```

the from-end scan hits `#	WORKBOARD.md` first, breaks immediately, and collects **zero** trailers → false "Missing required trailer". `git commit --amend --no-edit` cleared it in the consumer's case only because that rewrites `COMMIT_EDITMSG` without the comment block (LRN-018).

Git itself ignores these lines: the default `--cleanup=strip` for an editor commit removes every line whose first character is `core.commentChar` (default `#`), and `--cleanup=scissors` additionally discards everything from the scissors line (`# ------------------------ >8 ------------------------`, emitted by `git commit --verbose`) onward. The linter must mirror this **before** it locates the trailer block, so the block it inspects is the same one git will commit. A trailer line can never begin with `#` (its key must start with `[A-Za-z]`), so stripping `#` lines cannot remove a real trailer.

Related prior art: LRN-150 (merge commits need the trailer too; rebase-over-merge remedy). That covers a genuinely *trailer-less* merge commit; #420 is the distinct case where the trailer **is present** but hidden behind comment lines.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C97-1 | Strip git comment lines before trailer extraction | Add a pure helper `stripGitComments(text, commentChar)` applied to the normalised `text` **before** the trailer-block scan (before `text.split('\n')` at :155). It drops every line whose first character is `commentChar`. | Mirrors git's default `strip` cleanup exactly. The from-end scan then sees the true trailing block (message + trailer), so the post-rebase/merge `# Conflicts:` / rebase-status comments no longer mask the `Co-authored-by` trailer. Trailer keys start with `[A-Za-z]`, so no real trailer is ever `#`-prefixed. |
| C97-2 | Truncate at the scissors cut-line | Within the same single forward pass: on the first line matching the scissors marker (`^<commentChar>\s*-{2,}\s*>8\s*-{2,}`), **stop** — dropping that line and everything after it. Apply scissors-truncation and comment-stripping in one pass so ordering is unambiguous. | Mirrors `--cleanup=scissors`. `git commit --verbose` appends the full diff after the scissors line; those are non-`#` lines that would otherwise be treated as body/trailer. Stripping `#` lines alone would keep the diff, so the cut-line must be honoured explicitly. Low false-match risk: the marker requires `#`, dashes, `>8`, dashes. |
| C97-3 | Comment char is git default `#`, no new CLI flag | Introduce a module constant `COMMENT_CHAR = '#'`; do **not** add a `--comment-char` flag or spawn `git config core.commentChar`. | Keeps the linter a pure `--file` reader with **no interface change** (→ Patch). `#` is git's default and covers `.git/COMMIT_EDITMSG` in practice. A non-default/`auto` `core.commentChar` is an explicit non-goal here; if it ever matters, a follow-up CS can thread a detected value from `harness lint`. |
| C97-4 | Empty-after-strip stays clean | If, after comment/scissors stripping, `text.trim() === ''`, keep the existing empty-file behaviour (exit 0, "0 errors"). | A comment-only / scissors-only buffer has no trailers to require; git would produce an aborted (empty) commit, not a policy violation. Preserves current empty-input contract. |
| C97-5 | SemVer | **Patch** — bug fix to a distributed linter with no interface change (no new flag/subcommand/schema field; only internal parsing corrected). CHANGELOG `[Unreleased] → Fixed`, ref #420. | Restoring a linter to its intended behaviour is a fix; the `--file`/`--required`/`--allow`/`--quiet` surface is unchanged. |

## Deliverables

1. `scripts/check-commit-trailers.mjs` (edit) — add `COMMENT_CHAR` const + `stripGitComments()` helper (C97-1/C97-2); apply it to `text` immediately after line-ending normalisation and before the empty check + trailer scan (so C97-4 sees the stripped text); update the module header doc-comment ("Trailer block detection") to state that `#` comment lines and the scissors cut-line are ignored first, mirroring git. Leave `TRAILER_RE`, the from-end scan, and the `--required`/`--allow` checks otherwise unchanged.
2. `tests/check-commit-trailers.test.mjs` (edit) + `tests/fixtures/cs07/commit-trailers/` (new fixtures) — regression + parity coverage. Minimum cases (over-delivery welcome): (a) the #420 repro — subject/body/`Co-authored-by` **followed by** a `# Conflicts:` comment block → exit 0; (b) trailer followed by `# interactive rebase in progress` status comments → exit 0; (c) `git commit --verbose` scissors line + trailing diff after the trailer → exit 0 (diff not mistaken for body); (d) comment-only / scissors-only buffer → exit 0, "0 errors" (C97-4); (e) a required trailer that is genuinely absent, with comment lines present → still exit 1 (no false pass); (f) a body line beginning with `#` is stripped like git (does not itself become/hide a trailer); (g) the existing happy-path and missing-trailer fixtures still behave (no regression).
3. `CHANGELOG.md` (edit) — `[Unreleased]` `### Fixed` bullet referencing #420.
4. `LEARNINGS.md` (edit, at close-out) — file a learning: a "trailing-block" trailer detector must first strip what git strips (`#` comment lines + scissors), else post-rebase/merge `COMMIT_EDITMSG` false-fails even though the committed message is correct; cross-ref #420 / LRN-018 / LRN-150.

## User-approval gates

- **(none)** — self-contained detector bug fix; no user-facing behaviour change beyond removing a false failure. No suppression/grandfathering. The release that ships it is tracked separately per "a release is its own CS."

## Exit criteria

- The #420 repro fixture (message + `Co-authored-by` + trailing `# Conflicts:` block) exits **0** under `check-commit-trailers.mjs --file <fixture>`.
- A genuinely trailer-less message that also carries comment lines still exits **1** (no false pass introduced).
- `node --test tests/*.test.mjs` passes (incl. the new cases).
- `node bin/harness.mjs lint --quiet` exits 0.
- Issue #420 closes on merge.

## Risks + open questions

- **R1 — over-stripping a real trailer.** Mitigation: trailer keys must match `^[A-Za-z][A-Za-z0-9-]*:` so a trailer can never start with `#`; only `#`-prefixed lines are dropped. Covered by the "genuinely absent trailer still fails" and "happy-path unchanged" tests.
- **R2 — scissors false-match on a body line.** Mitigation: the marker regex requires `#` + dashes + `>8` + dashes; ordinary prose (e.g. "grew from 4 to >8") does not start with `# ----`. Covered by keeping the existing happy-path fixtures green.
- **R3 — non-default `core.commentChar`.** Out of scope by C97-3 (default `#`); noted as a possible follow-up, not a regression (today the linter already assumes `#`-shaped input implicitly).

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | cs97-plan-review | f89f80641103 | 2026-07-03T20:52:00Z | Go | No blocking findings; line citations, current-behaviour claims, fix correctness, edge cases, SemVer Patch, and deliverables/tests all verified against shipped code + #420. |

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | yoga-ah-c2 |
| Reviewer agent | rubber-duck (orchestrator: yoga-ah-c2) |
| Notes | **Patch** SemVer (bug fix to `scripts/check-commit-trailers.mjs`; no CLI flag/subcommand/schema). Independence per REVIEWS § 2.3 — reviewer `gpt-5.5` ≠ implementer `claude-opus-4.8`. Plan reviewed by gpt-5.5 (R1 Go, hash `f89f80641103`). Finalized at close-out. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1 — `scripts/check-commit-trailers.mjs`: add `COMMENT_CHAR` const + `stripGitComments()` (drop `#` lines + stop at `>8` scissors), apply to normalised text before empty-check + trailer scan; update module header doc-comment (C97-1/C97-2/C97-3/C97-4) | done | yoga-ah-c2 | agent-id=yoga-ah-c2 \| role=implementer (sub-agent cs97-impl) \| report-status=complete \| learnings=1 |
| T2 — `tests/check-commit-trailers.test.mjs` + `tests/fixtures/cs07/commit-trailers/` (new fixtures): #420 repro + rebase/merge comments + scissors+diff + empty-after-strip + genuine-missing-still-fails + `#`-body parity + no-regression; `CHANGELOG.md` `[Unreleased]` Fixed bullet (#420) | done | yoga-ah-c2 | agent-id=yoga-ah-c2 \| role=implementer (sub-agent cs97-impl) \| report-status=complete \| learnings=0 |
| Independent content review (GPT-5.5) | done | gpt-5.5 | R1 Go @ abc14c9 (cs97-review); R2 Needs-Fix (docstring overclaim) → corrected; R3 Go @ a751b90 (cs97-review3); Copilot COMMENTED, threads resolved; reviewer ≠ implementer per REVIEWS § 2.3 |
| Close-out: docs + restart state | pending | yoga-ah-c2 | Update WORKBOARD.md (remove CS97 row) + CONTEXT.md; no rendered-mirror change (scripts/tests only). |
| Close-out: learnings + follow-ups | pending | yoga-ah-c2 | File LEARNINGS.md trailer-detector-vs-comment-lines entry; #420 auto-closes on merge. |

## Notes / Learnings

- Bundles the single inbound bug #420. Sibling CS10 learnings LRN-018/020 also spawned #421 (prepare-commit-msg hook), #422, #423, #424 — filed/handled as their own CSs.

## Plan-vs-implementation review

**Reviewer:** GPT-5.5 (rubber-duck; background agent `cs97-pvi`, independent of the claude-opus-4.8 implementer per REVIEWS § 2.3)
**Date:** 2026-07-03T21:44:00Z
**Outcome:** GO

Reviewed the CS97 plan (§ Decisions C97-1…C97-5, § Deliverables 1–4, § Exit criteria) against the merged content (PR #433, squash `c1d177d`).

| Deliverable | Outcome | Assessment |
|---|---|---|
| 1 — `scripts/check-commit-trailers.mjs` `stripGitComments` | match | `COMMENT_CHAR` + single-pass `#`-line strip + `>8` scissors truncation applied to the normalised text before the empty-check + from-end trailer scan; `TRAILER_RE`, the scan, and `--required`/`--allow`/`--quiet` unchanged; header doc-comment + caveat added. |
| 2 — tests + fixtures | match | 6 new fixtures + 6 cases: #420 `# Conflicts:` repro→0, rebase-status comments→0, `--verbose` scissors+diff→0, comment/scissors-only→0, genuine-missing-with-comments→1, `#`-body/commented-trailer→1. |
| 3 — CHANGELOG | match | `[Unreleased] → Fixed` #420 bullet; no overclaim vs shipped code. |
| 4 — LEARNINGS | done at close-out | LRN-188 filed in this close-out. |

**Accepted divergence (in-intent hardening):** a docstring caveat clarifying the cleanup is COMMIT_EDITMSG-oriented (`#`-strip is trailer-safe; scissors truncation drops post-`>8` content) was added in response to the Copilot + GPT-5.5 R2 review, which independently caught an overclaim in an intermediate revision — not scope creep. Exit criteria 5/5 met; #420 CLOSED on merge; no overclaims (GPT-5.5 `cs97-pvi`).
