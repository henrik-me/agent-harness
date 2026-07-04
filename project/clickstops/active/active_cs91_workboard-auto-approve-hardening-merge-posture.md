# CS91 — `workboard-auto-approve.yml` hardening (#394) + workboard-merge posture doc reframe & maintenance-branch pattern (#395)

**Status:** active
**Owner:** yoga-ah
**Branch:** cs91/content
**Started:** 2026-07-04
**Closed:** —
**Filed by:** Triage of two coupled open inbound issues — [#394](https://github.com/henrik-me/agent-harness/issues/394) (bug) + [#395](https://github.com/henrik-me/agent-harness/issues/395) (design) (2026-07-02 by `omni-ah-c3`). Both surfaced from `henrik-me/sub-invaders` adopting v0.12.0's `workboard-auto-approve.yml`; grouped because both touch that one workflow + its surrounding docs (edit-collision avoidance).
**Depends on:** none. (Distinct from CS71, which fixes the *label-timing race* in evidence-gate skipping — a different concern in a different file.)

## Goal

Harden the privileged `workboard-auto-approve.yml` gate and correct the surrounding merge-posture doctrine:

- **#394 (bug/hardening)** — (1) the `allowed-paths.txt` heredoc is indented; it works today only because YAML block-scalar dedent strips the shared indentation (a *likely false positive* per the issue's own analysis) — but it is **fragile**: a future deeper indent or tab-mix would leak leading whitespace into the allowlist and silently break the path check. (2) In a `pull_request_target` workflow (write token + secrets), `git diff` can be influenced by repo diff attributes (textconv/external diff); disable them explicitly (defense-in-depth).
- **#395 (design/doc)** — reframe the docs so **maintainer admin-override is the sanctioned, zero-secret default** for merging workboard-only PRs (the App/`WORKBOARD_MERGE_TOKEN` PAT is optional automation, not the intended path); and close **Rec C**, the branch-pattern gap for ad-hoc workboard-allowlist **maintenance** PRs (e.g. a standalone `CONTEXT.md`/`LEARNINGS.md` fix) that currently fail the branch-name check. **Rec B** (make review-evidence a REQUIRED status check + drop `required_approving_review_count` to 0) is a deliberate branch-protection posture change — captured as an opt-in follow-up, not landed here.

## Background

Filed from inbound issues **#394 / #395** (both state: open; verified via `gh issue view`). Neither is referenced by any existing CS (reference scan, 2026-07-02).

Verified at HEAD `3b20d0a` in `template/managed/.github/workflows/workboard-auto-approve.yml` (trigger `pull_request_target`):

- **Heredoc** `:165-172` — `cat > allowed-paths.txt <<'EOF'` then indented body (`WORKBOARD.md`, `CONTEXT.md`, `LEARNINGS.md`, `project/clickstops/{planned,active,done}/`) then `EOF`.
- **`is_allowed()`** `:174-195` — exact/prefix match reading `allowed-paths.txt` line-by-line; **does not trim** leading/trailing whitespace from `$p`.
- **`git diff`** `:140` — `git diff --name-status -M "$base_sha" "$head_sha" > pr-files.tsv` (no `-c diff.external=` / `--no-textconv`).
- **Branch-name gate** `:82` — `grep -Eq '^(workboard/cs[0-9]+[a-z]?-(claim|close|close-out)|cs[0-9]+[a-z]?/(claim|close|close-out)|docs/file-planned-cs[0-9]+[a-z]?(-.+)?)$'` inside the `validate-and-approve` job (`:57`). No pattern for ad-hoc maintenance PRs.
- Composed `OPERATIONS.md:146-156` documents these branch patterns + the admin-merge fallback (this is where the #395 doc reframe + the CS88 #369-prose fix both live — coordinate; see R4).

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C91-1 | Harden the allowlist against whitespace (#394.1) | In `is_allowed()`, trim each allowlist line's leading/trailing whitespace **before** the `[ -z "$p" ] && continue` empty-line skip (so whitespace-only lines are also skipped): `p="${p#"${p%%[![:space:]]*}"}"; p="${p%"${p##*[![:space:]]}"}"`. Keep the heredoc as-is (it works via dedent) but make the check robust regardless of indentation/tabs. The workflow runs under **Bash** (it already uses `local`, `[[ … ]]`, `pipefail`), not pure POSIX sh, so this parameter-expansion trim is safe. | Removes the silent-break failure mode without a risky heredoc-layout change; the gate becomes correct by construction, not by YAML-dedent coincidence. |
| C91-2 | Harden `git diff` (#394.2) | Change `:140` to `git -c diff.external= diff --no-ext-diff --no-textconv --name-status -M "$base_sha" "$head_sha"`: `-c diff.external=` clears a config-set external driver, **`--no-ext-diff`** additionally disables an external driver set via **`.gitattributes`** (which `-c diff.external=` alone does NOT cover), and `--no-textconv` disables textconv filters — so the privileged `pull_request_target` invocation can't be coaxed into running a diff helper via config OR gitattributes. | Defense-in-depth on a write-token/secrets workflow; closes both the config- and attribute-driven external-diff vectors, not just the config one. |
| C91-3 | Reframe merge-posture docs (#395 Rec A) | In composed `OPERATIONS.md` (+ the workflow header), frame **maintainer admin-override (`gh pr merge <n> --admin --squash`) as the sanctioned zero-secret default** for workboard-only merges; present the App/`WORKBOARD_MERGE_TOKEN` PAT as **optional automation** for higher-volume/multi-maintainer setups — reversing the current implication that a secret is the intended path. Doc-only. | The workflow already degrades to admin-merge when no App/PAT is present; the repo-admin bypass is in every harness ruleset. Docs should not imply a secret is required. |
| C91-4 | Maintenance-branch pattern (#395 Rec C) | Add a **bounded, named** maintenance branch pattern to the `:82` regex (and the mirrored composed-doc prose) — exactly `workboard/maint-[A-Za-z0-9][A-Za-z0-9._-]*` (no nested slash after the `maint-` prefix, so it cannot accidentally broaden to a wildcard) — for ad-hoc workboard-allowlist edits (`CONTEXT.md`/`LEARNINGS.md` corrections). OR, if G91-1 prefers not to widen auto-approve at all, **document** that such edits use admin-merge instead. Never a broad `workboard/*`/`docs/*` wildcard. | Closes the gap where a legitimate maintenance PR fails the branch-name check; the anchored, slash-free pattern keeps the auto-approve surface tight (security posture of a `pull_request_target` gate). |
| C91-5 | Rec B is out of scope (opt-in follow-up) | Do NOT change `required_approving_review_count` or make review-evidence a required status check in this CS. Record #395 Rec B as a **planned follow-up CS** (branch-protection posture change: required review-evidence check + approval-count 0), cross-linked from this file and the ADR in CS90 (both touch CI/gate posture). | Rec B is a deliberate, repo-wide branch-protection change with blast radius beyond one workflow; it deserves its own plan + user-approval gate, and couples to CS90's review-gates-as-required-check work. |
| C91-6 | Self-host applicability check | `workboard-auto-approve.yml` is NOT in the self-host `managed.files`, but the self-host repo has its own `.github/workflows/workboard-auto-approve.yml`. Apply C91-1/C91-2 hardening to **both** the template AND (if it is a synced/copied managed instance) the self-host copy, keeping them byte-consistent. Confirm whether the self-host copy is hand-maintained or template-derived before editing. | Avoids fixing the template while leaving the self-host's own privileged gate unhardened; consistency prevents drift between template and self-host. |

## Deliverables

1. `template/managed/.github/workflows/workboard-auto-approve.yml` — `is_allowed()` whitespace-trim before the empty-line skip (C91-1) + hardened `git diff` (C91-2: `-c diff.external= --no-ext-diff --no-textconv`) + the bounded `workboard/maint-[A-Za-z0-9][A-Za-z0-9._-]*` pattern in the `:82` regex if G91-1 chooses the widen path.
2. `.github/workflows/workboard-auto-approve.yml` (self-host copy) — same hardening, kept byte-consistent (C91-6).
3. `template/composed/OPERATIONS.md` (+ root mirror) — merge-posture reframe (C91-3) + maintenance-branch prose (C91-4). **Coordinate with CS88** (same composed file; see R4).
4. A planned follow-up CS file for #395 **Rec B** (C91-5), cross-linked to CS90.
5. Tests/validation: a shell-lint / assertion that `allowed-paths` entries are matched even with leading whitespace (guard for C91-1), and confirmation the maintenance branch pattern matches/rejects the intended set. `CHANGELOG.md` `[Unreleased]` entry. Closes #394 (and #395 Rec A/C; Rec B tracked by the follow-up).

## User-approval gates

- **G91-1** — approve the C91-4 direction (widen the auto-approve branch regex to the bounded `workboard/maint-[A-Za-z0-9][A-Za-z0-9._-]*` prefix vs document admin-merge only), since it changes what auto-merges on a privileged `pull_request_target` workflow.

## Exit criteria

1. `is_allowed()` matches allowlist entries regardless of leading/trailing whitespace (verified by a guard/test); the heredoc path check no longer depends on YAML dedent for correctness.
2. `git diff` in the workflow disables external/textconv diff drivers.
3. Composed `OPERATIONS.md` frames admin-override as the zero-secret default and the PAT/App as optional; maintenance-PR handling (widened pattern or documented admin-merge) is stated; root mirror matches the base.
4. Template and self-host `workboard-auto-approve.yml` copies are byte-consistent after hardening.
5. #395 Rec B is captured as a cross-linked planned follow-up CS (not implemented here). `harness lint` + `node --test tests/*.test.mjs` green; `harness sync --mode=check` clean. Plan-vs-implementation review (GPT-5.5) GO. #394 referenced for auto-close.

## Risks + open questions

| # | Risk / what breaks | Mitigation |
|---|---|---|
| R1 | Widening the branch regex (C91-4) over-broadens what auto-merges on a privileged workflow. | Prefer a bounded named prefix (`workboard/maint-*`), never `*`/`docs/*` wildcards; the path allowlist (`is_allowed`) still constrains *what files* may change. G91-1 confirms direction. |
| R2 | The hardened `git diff` alters output and breaks `pr-files.tsv` parsing. | `--name-status` column format is stable; `--no-ext-diff`/`--no-textconv` affect content rendering, not the name/status columns. `-M` rename detection IS content-similarity based, so add a test exercising the TSV parser on BOTH a plain edit and a rename (`R`) entry (a copy `C` status only appears when `-C` is also passed; the parser handles both statuses) to confirm the allowlist check is unaffected by the hardened flags. |
| R3 | Editing the heredoc-adjacent shell risks the YAML block-scalar indentation the gate currently relies on. | C91-1 deliberately does NOT re-indent the heredoc; it only adds trimming in `is_allowed`, minimizing blast radius. |
| R4 | Composed `OPERATIONS.md` edit collides with CS88 (same file, overlapping L146-156 region). | Land CS88 and CS91 sequentially; the second rebases. Both touch the same block, so coordinate closely — consider merging the two OPERATIONS edits if claimed together. |
| R5 | Self-host copy diverges from template if only one is edited (C91-6). | Deliverable 2 edits both; exit criterion 4 gates byte-consistency; confirm the copy's provenance first. |
| Q1 | Bounded maintenance prefix vs admin-merge-only doc (C91-4). | Decided at G91-1. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | cs91-plan-review (omni-ah-c3) | bdea751c0728 | 2026-07-02T23:51:00Z | Needs-Fix | git-diff hardening incomplete: -c diff.external= misses a .gitattributes-set external driver — need --no-ext-diff. Other F1-F6 pass (workflow facts, CS71 distinct, CS88 same-block). |
| R2 | gpt-5.5 | claude-opus-4.8 | cs91-review-r2 (omni-ah-c3) | f66c54bd60f8 | 2026-07-03T00:12:00Z | Go | Blocker resolved: --no-ext-diff added (covers config + gitattributes vectors); trim-before-empty-skip valid Bash; bounded maint regex safe in the anchored alternation. |

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | yoga-ah |
| Reviewer agent | rubber-duck (orchestrator: yoga-ah) |
| Notes | Planned assignment per INSTRUCTIONS.md § Every CS (orchestrator + implementer sub-tasks: claude-opus-4.8; local review: gpt-5.5). Independence per REVIEWS § 2.3 — reviewer gpt-5.5 ≠ implementer claude-opus-4.8. Finalized at close-out. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1 — Harden `is_allowed()` whitespace-trim + `git diff` (`-c diff.external= --no-ext-diff --no-textconv`) in `template/managed/.github/workflows/workboard-auto-approve.yml` (C91-1, C91-2) | done | cs91-workflow | Applied to both copies; heredoc layout unchanged (R3). |
| T2 — Mirror the hardening to the self-host `.github/workflows/workboard-auto-approve.yml`, byte-consistent (C91-6) | done | cs91-workflow | Both copies byte-identical (16295 bytes). |
| T3 — Bounded maintenance-branch pattern `workboard/maint-[A-Za-z0-9][A-Za-z0-9._-]*` in the validate-and-approve regex + mirrored prose (C91-4) | done | cs91-workflow | G91-1 Option A; final alternation in `^(...)$`, slash-free (R1). |
| T4 — Merge-posture reframe in `template/composed/OPERATIONS.md` (+ root mirror): admin-override = zero-secret default, PAT/App optional (C91-3, C91-4) | done | cs91-docs | Base↔root lockstep (sync-check clean); #369 prose left for CS88 (R4). |
| T5 — File #395 Rec B as a cross-linked planned follow-up CS (C91-5) | done | yoga-ah | Filed planned CS106 (hash 257384654a2e); R1 Needs-Fix→R2 Go-with-amendments (gpt-5.5); cross-links CS90 + #402. |
| T6 — Tests: allowlist whitespace guard + maintenance-regex accept/reject + TSV parser on plain edit + rename `R` entry (R2) | done | cs91-workflow | `tests/cs91-workboard-auto-approve-hardening.test.mjs` (29 tests). |
| T7 — `CHANGELOG.md` `[Unreleased]` entry; reference #394 for auto-close | done | cs91-docs | 3 bullets (maint pattern=Minor, reframe+hardening=Patch); refs #394/#395. |
| Close-out: docs + restart state | planned | — | Update WORKBOARD.md + CONTEXT.md + relevant docs so a fresh agent can restart from actual state. |
| Close-out: learnings + follow-ups | planned | — | File LEARNINGS.md entries + ensure the #395 Rec B follow-up CS is planned. |

## Notes / Learnings

- **G91-1 resolved → Option A (bounded widen).** Approved by @henrik-me on 2026-07-04. Add the bounded, anchored, slash-free `workboard/maint-[A-Za-z0-9][A-Za-z0-9._-]*` alternation to the `validate-and-approve` branch-name regex (C91-4) so ad-hoc workboard-allowlist maintenance PRs auto-merge like claim/close PRs; the `is_allowed()` path allowlist still constrains *which* files may change. Plan R2 (gpt-5.5, Go) already vetted this as safe. Closes #395 Rec C.
- Implementation dispatched to two disjoint-ownership background sub-agents: `cs91-workflow` (both `workboard-auto-approve.yml` copies + a new `tests/cs91-*.test.mjs`) and `cs91-docs` (`template/composed/OPERATIONS.md` + root mirror + `CHANGELOG.md`). #395 Rec B follow-up CS (C91-5) authored orchestrator-side.

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
