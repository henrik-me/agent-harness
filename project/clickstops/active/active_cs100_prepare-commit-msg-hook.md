# CS100 — Ship an opt-in `prepare-commit-msg` hook that auto-adds the Co-authored-by trailer (incl. merge commits)

**Status:** active
**Owner:** yoga-ah
**Branch:** cs100/content
**Started:** 2026-07-03
**Closed:** —
**Filed by:** yoga-ah (orchestrator, Claude Opus 4.8), 2026-07-03, from GitHub issue #421 (`enhancement`, `harness-orchestrator`; surfaced from consumer `henrik-me/authzandentitlements` CS10, LRN-018).
**Depends on:** none

## Goal

Provide an **opt-in** git `prepare-commit-msg` hook, installable via a harness
CLI verb, that appends the canonical `Co-authored-by: Copilot` trailer to a
commit message when it is absent — importantly firing for **merge** commits as
well as normal / template / squash / amend commits. This makes the B1
commit-trailers gate (`check-pr-commits`) pass-by-construction and removes the
recurring manual `git commit --amend` on merge commits that integrate `main`
into a long-running CS branch.

## Background

- **Issue #421** (verified OPEN at plan time via `gh issue view 421 --json state` → `"OPEN"`).
- B1 (`scripts/check-pr-commits.mjs`, exposed as the `commit-trailers` PR-body
  gate at `bin/harness.mjs:4107`) requires the `Co-authored-by: Copilot
  <223556219+Copilot@users.noreply.github.com>` trailer on **every** commit in
  `<base>..<head>`, including merge commits. A `git merge` auto-message carries
  no trailer, so B1 fails until the orchestrator amends the merge commit
  (consumer evidence: `authzandentitlements` CS10 PR #18; LRN-018).
- The harness itself prefers rebase-over-merge to keep linear history (so it
  rarely creates merge commits), but consumers that merge `main` into a branch
  need this hook; it is also useful for ordinary commits.
- **Current codebase state (verified at plan HEAD):**
  - No git-hook infrastructure or implementation exists: `git config
    core.hooksPath` is unset; there is no `.githooks/` directory and no *active*
    `.git/hooks/prepare-commit-msg` (only git's default `.sample` files). The
    string `prepare-commit-msg` appears in the tree only as textual references
    in this CS100 plan and CS97's plan — not as a hook.
  - Scaffolds are copied create-if-missing via `copyFileSync`
    (`bin/harness.mjs:1637`), which does **not** preserve the executable bit —
    so a scaffold-delivered hook under `.githooks/` would require the consumer
    to additionally run `git config core.hooksPath .githooks` **and**
    `chmod +x`. This friction is why the scaffold path is rejected (Decision 1).
  - The CLI dispatches via `COMMAND_REGISTRY` (`bin/harness.mjs:4889`); each
    verb is a `cmd*` function with a `SUBCOMMAND_HELP[<name>]` entry and a
    TOP_HELP listing line. No `install-hooks` verb exists today (this CS adds it).
  - Reusable logic lives in `lib/*.mjs`; linters/utilities in `scripts/*.mjs`;
    tests in `tests/*.test.mjs` run via `node --test`.
  - `CHANGELOG.md` carries a `## [Unreleased]` block with `Added` / `Changed` /
    `Documentation` / `Fixed` subsections (verified).
- **Comment-strip hazard:** a `prepare-commit-msg` hook runs *before* git strips
  comment (`#`) lines. For a `git commit` (editor) or a `merge`, the message
  file contains the message body followed by git's comment/scissors template.
  A naive append at EOF places the trailer **below** that comment block, so git
  strips it out of the final commit and B1 still fails. The hook must therefore
  insert the trailer **above** the comment block (Decision 2). This is the same
  comment-line hazard that CS97/#420 handles on the *linter* side; here it is
  handled on the *hook* (authoring) side, and the two CSs are independent.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Delivery mechanism | Add a new opt-in CLI verb **`harness install-hooks`** that writes `.git/hooks/prepare-commit-msg` into the repo's active hooks directory and sets its mode to `0o755`. | Self-contained and robust: targets the *active* hooks dir (no `core.hooksPath` change needed), sets the exec bit correctly on POSIX (a no-op on Windows, where git-for-windows runs hooks via `sh` regardless). The scaffold path is rejected because `copyFileSync` drops the exec bit and would force the consumer to also set `core.hooksPath` and `chmod` manually. |
| 2 | Merge-commit correctness | The hook inserts the trailer **above** git's comment/scissors template (immediately before the first comment/scissors line), not at end-of-file. | `prepare-commit-msg` runs before git's message cleanup. Plain comment (`#`) lines are removed by `git stripspace --strip-comments` while non-comment lines (a trailer) survive — but with `--cleanup=scissors` or a verbose commit, everything **below the `# ------ >8 ------` scissors line is truncated**, so an EOF-appended trailer there is silently lost; an EOF trailer also lands *after* git's editable template rather than as a clean trailer block. Inserting above the first comment/scissors line is therefore robust across all cleanup modes and keeps the trailer adjacent to the message body. When no comment/scissors line exists (e.g. `git commit -m`, source `message`), append at EOF with a blank-line separator. |
| 3 | Trigger sources + skip condition | Fire for **all** sources including `merge` and `squash`; skip only when the **exact canonical trailer line** (byte-for-byte, case-sensitive) is already present. A non-canonical-casing variant (e.g. `co-authored-by:`) does **not** count as present — the hook still appends the canonical line. | The core value (LRN-018) is fixing merge commits; the hook also helps normal/template/amend/reword. B1 (`scripts/check-pr-commits.mjs`) matches the trailer **case-sensitively**, so a case-insensitive skip could leave a commit the hook believes is fine but B1 rejects; the exact-line skip keeps the hook idempotent (no duplicate on re-run/amend) while guaranteeing a B1-accepted line is present. |
| 4 | Comment-marker handling | Resolve the comment marker from `git config core.commentString` first, then `core.commentChar`; support a **multi-character** marker (e.g. `//`) as well as a single char; fall back to `#` when unset, empty, or `auto`. | Users may customize the comment marker, and modern Git supports the multi-character `core.commentString` — a single-char-only assumption would miss `//`-style comment/scissors blocks. `auto` derives a per-message marker git cannot reproduce from a hook, so `#` (git's default) is the safe fallback, documented as a known limitation. |
| 5 | Idempotency + safety | The hook body carries a sentinel marker line (`# harness:prepare-commit-msg`). `install-hooks` (a) no-ops when our sentinel hook is already installed, (b) **refuses** (exit 1) to overwrite a pre-existing hook that lacks the sentinel unless `--force` is given, (c) with `--force` overwrites either. | Never silently clobber a user's existing hook; make the verb safe to re-run and to script into setup. |
| 6 | Opt-in only | `harness init` does **not** install the hook; installation happens only when the user explicitly runs `harness install-hooks`. | The issue requires opt-in. Auto-installing a hook silently changes local commit behavior and is surprising. |
| 7 | Source-of-truth split | The hook script text and the installer live in a new `lib/hooks.mjs` (exported `PREPARE_COMMIT_MSG_HOOK` string constant + `installPrepareCommitMsgHook(repoRoot, { force })` returning a structured result). `bin/harness.mjs` adds a thin `cmdInstallHooks` wrapper + help + registry entry. | Single source of truth; the installer and hook body are unit-testable without spawning the CLI, matching the existing `lib/` + `bin/` split and the `--file`-driven, fail-closed conventions. |
| 8 | SemVer | **Minor** version bump. | A new additive verb + new library module; no breaking change to any existing surface. |

## Deliverables

1. **`lib/hooks.mjs`** (new): exports (a) `PREPARE_COMMIT_MSG_HOOK` — a POSIX-`sh`
   hook body beginning with `#!/bin/sh` and carrying the `# harness:prepare-commit-msg`
   sentinel, which resolves the comment marker from `core.commentString`/`core.commentChar`
   (Decision 4), skips only when the exact byte-for-byte canonical trailer line is
   already present (Decision 3), and otherwise inserts the canonical trailer above
   the first comment/scissors line or, absent one, appends it at EOF with a
   blank-line separator (Decision 2); and (b)
   `installPrepareCommitMsgHook(repoRoot, { force })` which locates the repo's
   git hooks directory, applies the Decision-5 safety/idempotency rules, writes
   the hook with LF line endings and mode `0o755`, and returns a structured
   result `{ action: 'created' | 'replaced' | 'skipped' | 'refused', path, reason? }`.
   Fail-closed on a missing/invalid git dir (throw a descriptive error).
2. **`bin/harness.mjs`** (edited): add `cmdInstallHooks(args, global)` supporting
   `--force` and `--help`; it calls the `lib/hooks.mjs` installer against the
   resolved repo root and maps the result to exit codes — `0` for
   `created`/`replaced`/`skipped`, `1` for `refused` (foreign hook present
   without `--force`), `2` for a usage error. Register `'install-hooks':
   cmdInstallHooks` in `COMMAND_REGISTRY`, add a `SUBCOMMAND_HELP['install-hooks']`
   entry, and add an `install-hooks` line to `TOP_HELP`.
3. **`tests/lib-hooks.test.mjs`** (new): a minimum of **10** `node --test` cases,
   all writing only under `os.tmpdir()` (never under the repo root), covering:
   fresh install creates the hook with an executable mode on POSIX; re-install
   over our own sentinel hook is a no-op `skipped`; a pre-existing foreign hook
   is `refused` without `--force`; `--force` overwrites (foreign and ours);
   the hook body inserts the trailer **above** a comment block; the hook body
   inserts **above** a scissors (`# ------ >8 ------`) line rather than at EOF;
   the hook fires on a synthesized `merge`-source invocation; the hook **skips**
   when the exact canonical trailer is already present (no duplicate) but still
   appends when only a non-canonical-casing variant (`co-authored-by:`) is
   present; a multi-character `core.commentString` (e.g. `//`) and the `#`
   fallback are both honored. Hook-body behavior is exercised by writing the
   script to a temp file and running it via `sh` (skip cleanly with a logged
   reason when no POSIX `sh` is available, so Windows-only CI does not
   spuriously fail).
4. **Docs:** an `OPERATIONS.md` subsection documenting `harness install-hooks`
   (what it does, opt-in nature, `--force`, the merge-commit rationale); a
   `CONVENTIONS.md` note pointing at the hook as the recommended way to satisfy
   the commit-trailer convention; a `README.md` mention in the verb/usage
   listing; and a `CHANGELOG.md` `[Unreleased] → Added` entry.
5. **Green gates:** `harness install-hooks --help` renders; `node bin/harness.mjs
   lint` exits 0; and `node --test tests/*.test.mjs` is green with the new tests.

## User-approval gates

- None beyond the standard review loop. This is additive, opt-in tooling with no
  change to default behavior; no destructive or irreversible action is taken
  without `--force`.

## Exit criteria

- `harness install-hooks` installs a working `prepare-commit-msg` hook that, on a
  merge commit with a git comment template present, yields a final commit message
  carrying the `Co-authored-by: Copilot` trailer (so B1 passes) — verified by test.
- Re-running `install-hooks` is idempotent; a foreign pre-existing hook is not
  clobbered without `--force`.
- New unit tests (≥8) pass; `harness lint` and the full `node --test` suite are green.
- Docs updated (OPERATIONS, CONVENTIONS, README, CHANGELOG).

## Risks + open questions

- **Windows exec bit / `sh` availability.** `0o755` chmod is a no-op on Windows;
  git-for-windows executes hooks via bundled `sh`, so the POSIX-`sh` hook runs.
  Hook-body tests skip cleanly when `sh` is unavailable (Deliverable 3).
- **`core.commentChar auto` / exotic markers.** `auto` derives a per-message
  marker a hook cannot reproduce; the multi-character `core.commentString` is
  supported, but `auto` falls back to `#` (Decision 4), documented as a known
  limitation. The trailer is still appended (at worst at EOF) so the common
  `#`-default case is fully covered.
- **Detached / worktree git dirs.** `installPrepareCommitMsgHook` resolves the
  actual hooks directory (via `git rev-parse --git-path hooks`) rather than
  assuming `.git/hooks`, so linked worktrees are handled.
- **Non-goal:** this CS does not auto-install the hook from `init`, does not add
  a scaffold, and does not touch CS97/#420's linter-side comment-stripping work
  (independent CS, owned by another orchestrator).

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | rubber-duck dispatched | 741e93461a48 | 2026-07-03T21:34:00Z | Needs-Fix | Blocking: case-insensitive skip could leave B1-failing noncanonical trailer; amend D3/tests. Also correct D2 (scissors, not plain-#) and D4 (core.commentString) rationale. |
| R2 | gpt-5.5 | claude-opus-4.8 | rubber-duck dispatched | 7b0e0530e33f | 2026-07-03T21:38:00Z | Go | R1 findings resolved (D3 exact canonical skip; D2 scissors rationale; D4 commentString; Background reword); F1–F6 reverified; no new findings. |

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | yoga-ah |
| Reviewer agent | rubber-duck (orchestrator: yoga-ah) |
| Notes | **Minor** SemVer (new `harness install-hooks` verb + `lib/hooks.mjs`; additive, no breaking change). Independence per REVIEWS § 2.3 — reviewer `gpt-5.5` ≠ implementer `claude-opus-4.8`. Plan reviewed by gpt-5.5 (R1 Needs-Fix → R2 Go, hash `7b0e0530e33f`). Finalized at close-out. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1 — `lib/hooks.mjs`: `PREPARE_COMMIT_MSG_HOOK` (sentinel; comment-marker resolution D4; exact-canonical skip D3; insert-above-comments/scissors else EOF D2) + `installPrepareCommitMsgHook(repoRoot,{force})` (D5/D7) | done | yoga-ah | agent-id=cs100-impl \| role=implementer \| report-status=complete \| learnings=2 |
| T2 — `bin/harness.mjs`: `cmdInstallHooks` (`--force`/`--help`, exit 0/1/2) + `SUBCOMMAND_HELP['install-hooks']` + `TOP_HELP` line + `COMMAND_REGISTRY` entry | done | yoga-ah | agent-id=cs100-impl \| role=implementer \| report-status=complete \| learnings=0 |
| T3 — `tests/lib-hooks.test.mjs`: ≥10 `node --test` cases (os.tmpdir only; sh-invocation for hook body, skip if no sh) | done | yoga-ah | agent-id=cs100-impl \| role=implementer \| report-status=complete \| learnings=0 |
| T4 — docs: `template/composed/OPERATIONS.md` + `template/composed/CONVENTIONS.md` (+ rendered roots via `harness sync`), `README.md`, `CHANGELOG.md [Unreleased] Added` | done | yoga-ah | agent-id=yoga-ah \| role=orchestrator \| report-status=complete \| learnings=0 (README deferred to release CS — see Notes) |
| Independent content review (GPT-5.5) | pending | — | reviewer model ≠ implementer (independence per REVIEWS § 2.3); via `harness review` |
| Close-out: docs + restart state | pending | yoga-ah | Update WORKBOARD.md (remove CS100 row) + CONTEXT.md; rendered composed mirrors (OPERATIONS/CONVENTIONS) updated via sync. |
| Close-out: learnings + follow-ups | pending | yoga-ah | File LEARNINGS.md entry (claim-time Model-audit/Tasks gap candidate); #421 auto-closes on merge. |

## Notes / Learnings

- **Deviation (README).** The plan's Deliverable 4 lists a `README.md` verb mention.
  `README.md` has no general verb/usage listing — the `## Status` line is
  release-narrated (updated only when a version ships) and the `## CLI quick
  reference` section is cross-repo-specific. The `install-hooks` mention is therefore
  deferred to the **release CS** (v0.15.0 `## Status` line, cut after #424). The
  `CHANGELOG.md [Unreleased] → Added` entry is the authoritative interim record.
- **Learning candidate (claim-time active-file gaps).** `harness claim --apply` renamed
  `planned→active` and added the WORKBOARD row but left `**Status:** planned` and an empty
  `## Model audit` / placeholder `## Tasks`. Active files require `**Status:** active`, a
  `## Model audit` section (else `clickstop-implementer-not-reviewer` errors), and populated
  `## Tasks` (incl. the two Close-out rows). The orchestrator filled these manually to make
  the claim PR lint green (evidence: PR #435 `smoke/harness-lint` + `validate` failed until
  the fix). Consider having `harness claim` scaffold these at claim time.
- **Learning candidate (verb→CS47 coupling).** Registering a new `COMMAND_REGISTRY` verb
  deterministically fails the CS47 subcommand-coverage meta-test
  (`tests/cs47-detached-head-bisect.test.mjs`) until a matching `SUBCOMMAND_PLAN` entry is
  added — a coupling that crosses the code↔tests ownership split.
- **Learning candidate (git-for-windows `sh`).** git-for-windows ships two `sh` binaries;
  only `bin\sh.exe` has coreutils (`awk`/`grep`) on PATH. Hook/shell tests spawning `sh`
  directly must resolve the coreutils-bearing one or silently no-op.

## Plan-vs-implementation review

> _(filled at close-out per the gate)_
