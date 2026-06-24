# CS67 — `harness release` verb: mechanize the release cut

**Status:** active
**Owner:** omni-ah-c3
**Branch:** cs67/content
**Started:** 2026-06-24
**Closed:** —
**Filed by:** CS64 (2026-06-06 by `yoga-ah-c3`) per decision **C64-8** — the `release` verb cataloged in CS64's command/skill surface is spun out here because it depends on the release-process documentation that CS59 produces.
**Depends on:** **CS59** (hard) — `harness release` mechanizes the procedure CS59 documents as `OPERATIONS.md § Release process`; that section is the spec. Also reuses `lib/cross-repo.mjs` (CS56) for consumer notification. Do not claim before CS59 closes. **CS64b** (hard, added 2026-06-10) — `harness release` allocates a temp clone for tag/release SHA verification and consumer-notification staging; it must adopt the `lib/disposers.mjs` + `assertSafeRef` primitives (C64b-2) from the outset rather than retrofit them. C64b-3's `harness sync` new-managed-file reconciliation is also referenced by the consumer-notification path.

## Goal

Implement `harness release` to mechanize the harness release cut that CS59 documents as prose, turning a hand-run, error-prone sequence into a previewable, ordered command: version bump → CHANGELOG promotion → README pin update → (PR + merge) → tag + `gh release` on the **squash-merge SHA** → consumer notification. The verb is **dry-run-first and never auto-pushes/tags without an explicit apply** — a release is irreversible, so preview is the default.

## Background

CS59 (`§ Release process`) documents the release cut: bump `package.json` + `package-lock.json`, promote CHANGELOG `[Unreleased]` → `[x.y.z]`, update README pins, open the content/release PR, run the GPT-5.5 plan-vs-impl + Phase-2 reviews, engage Copilot, pass CI, squash-merge (solo-orchestrator via `gh pr merge --admin`), then `git tag` + `gh release create` on the squash SHA, and notify consumers via `harness cross-repo open-issue`. Today this is entirely manual; PR #227 (v0.7.0) executed it by hand. CS67 encodes the mechanical, automatable parts of that sequence behind one verb while leaving the human-gated steps (review approvals, the admin-merge decision) explicit.

The single hardest sequencing constraint: the tag and GitHub release must land on the **squash-merge commit SHA on `main`**, not the PR branch HEAD — so the tag/release step runs **after** merge, as a distinct phase.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C67-1 | Two-phase, dry-run-first | `harness release [--version <x.y.z>] [--apply]`: **Phase A (pre-merge, prepare)** — preflight (clean tree, on a release branch, CI considerations), bump `package.json` + `package-lock.json`, promote CHANGELOG `[Unreleased]`→`[x.y.z]` with the date, update README version pins; default **dry-run** prints the diff, `--apply` writes the files for the orchestrator to commit + PR. **Phase B (post-merge, publish)** — `harness release --publish --sha <squash-sha>`: **preflight-verify** the SHA is the real squash-merge commit (`git fetch origin main`; `--sha` must equal the merged release PR's `mergeCommit.oid` or current `origin/main`, must **not** be the PR branch head, the tag must be absent, and `package.json`/CHANGELOG **at that SHA** must match the release version), then create the tag + release via `gh release create <tag> --target <sha>` and fire `harness cross-repo open-issue` consumer notifications. **Idempotent/resumable**: if the tag/release already exist pointing at the intended SHA+version, skip to and retry the consumer-notification step. | A release is irreversible; preview-by-default + a two-phase split + SHA verification prevents tagging the wrong (pre-merge/arbitrary) SHA or publishing prematurely, and resumability prevents a partial publish from stranding the release. |
| C67-2 | SemVer classification input | The verb does **not** guess the bump size; `--version` is required (or derived from an explicit `--bump major|minor|patch`), and it validates the result against `OPERATIONS.md § SemVer policy` triggers, refusing an obviously inconsistent bump (e.g. patch when a new subcommand is in the CHANGELOG). | The bump-size decision is doctrine-driven (new CLI subcommand ⇒ minor, etc.); the verb enforces consistency rather than inventing the version. |
| C67-3 | Never auto-merge; publish is one explicit gated mutation | **Commits, PR creation, and merge remain explicit orchestrator actions** outside the verb (the merge path, incl. solo-orchestrator `gh pr merge --admin`, is human-gated per CS59). The only **release-repo** remote mutation the verb performs is Phase B's `gh release create <tag> --target <sha>` — which creates the remote tag + release atomically on the verified SHA; the only other Phase B remote action is the **issue-only** `harness cross-repo open-issue` consumer notification (Hard Rule § 6, never a commit). Both are gated behind `--publish` + the G-publish confirmation, printing exactly what they will do first. | Honors the no-silent-destructive-action discipline; naming the mutations precisely (rather than an ambiguous "git push", which `gh release create` does not require) removes the gaps the reviewer flagged. |
| C67-4 | Consumer notification | Phase B reuses `lib/cross-repo.mjs` (`harness cross-repo open-issue`, CS56) to file the pin-bump tracking issues into consumer repos — never commits to them (Hard Rule § 6). | Reuses the existing issue-only cross-repo handoff; keeps the orchestrator from committing into consumer repos. |
| C67-5 | Logic in `lib/`, thin `bin/` | Mechanics in `lib/release.mjs` (file bumps, CHANGELOG promotion, version validation) with injectable fs/git/`gh` seams; `bin/harness.mjs` delegates. Tests write only under `os.tmpdir()`. | Testable seams; no REPO_ROOT writes (memory). |
| C67-6 | SemVer | New CLI subcommand ⇒ **minor** bump per `OPERATIONS.md § SemVer policy`. | New consumer-visible CLI surface. |

## Deliverables

1. `lib/release.mjs` + `tests/lib-release.test.mjs` — version bump + CHANGELOG promotion + README pin update + version-vs-SemVer validation + (Phase B) tag/release/notify orchestration, all via injectable seams (C67-1..C67-5).
2. `bin/harness.mjs` (edit, orchestrator) — register `release` in `COMMAND_REGISTRY` + `TOP_HELP` + `SUBCOMMAND_HELP`; thin delegation; `--version`/`--bump`/`--apply`/`--publish`/`--sha` flags via `requireValue`.
3. `OPERATIONS.md` (edit, orchestrator) **+ `template/composed/OPERATIONS.md` mirror in lockstep** — the CS59 `§ Release process` section references `harness release` as the canonical executable path (leverage, CS64 C64-2).
4. `CHANGELOG.md` (edit) — `[Unreleased]` entry for the new subcommand.

## User-approval gates

- **G-publish** — Phase B (tag + `gh release` + consumer issues) is irreversible; explicit user/orchestrator confirmation before `--publish`.
- **G-release** — minor bump per C67-6 when this ships in a tag.

## Exit criteria

1. `harness release --version <x.y.z>` (Phase A) previews the version bump + CHANGELOG promotion + README pin update as a diff by default; `--apply` writes them without committing/pushing (C67-1, C67-3).
2. The verb refuses a SemVer-inconsistent bump and requires an explicit version/bump (C67-2).
3. `harness release --publish --sha <squash-sha>` (Phase B) **verifies the SHA is the squash-merge commit on `main`** (refusing branch-head/arbitrary SHAs), creates the tag + release via `gh release create --target`, is **idempotent** if the tag/release already exist, and files consumer notifications via `cross-repo open-issue` without committing to consumer repos (C67-1, C67-3, C67-4).
4. Mechanics are in `lib/release.mjs` with tests writing only under `os.tmpdir()`; `bin/` is thin (C67-5).
5. `OPERATIONS.md § Release process` (+ mirror) references the verb; lockstep lint passes (deliverable 3).
6. `harness lint --quiet` passes; `node --test tests/*.test.mjs` green; `sync --mode=check` no drift.
7. Plan-vs-implementation review (GPT-5.5 gate) returns GO.
8. CHANGELOG `[Unreleased]` entry present.

## Risks + open questions

| # | Risk / what breaks | Mitigation |
|---|---|---|
| R1 | A release is **irreversible** (tags, `gh release`, consumer issues); a buggy apply could tag the wrong SHA or publish prematurely. | Two-phase (C67-1): prepare (dry-run-first) vs publish; Phase B requires an explicit `--sha`; G-publish gate; no auto-push. |
| R2 | Tagging the **pre-merge branch HEAD** or an arbitrary SHA instead of the squash-merge commit produces a tag that is not on `main`. Requiring `--sha` alone does not prevent passing the wrong SHA. | C67-1 Phase B preflight **verifies** `--sha` equals the merged release PR's `mergeCommit.oid` / current `origin/main`, is not the branch head, the tag is absent, and the files at that SHA match the version — refusing otherwise. |
| R7 | A **partial publish** (tag/release created, then consumer-notification step fails) could leave the release half-done. | C67-1 Phase B is idempotent/resumable: it detects an existing tag/release pointing at the intended SHA+version and continues to retry only the consumer notifications. |
| R3 | Version / CHANGELOG / README pins drift out of sync. | `lib/release.mjs` performs all three in one prepare step + validates the version string consistently; dry-run diff shows all edits together. |
| R4 | SemVer misclassification (patch when a subcommand was added). | C67-2 validates the bump against the SemVer-policy triggers and refuses obvious inconsistencies. |
| R5 | Hard dependency on CS59 — building before the `§ Release process` spec exists risks encoding the wrong procedure. | Do not claim before CS59 closes; the section is the spec; cite it in the verb's help. |
| R6 | Consumer-notification step could be mistaken for committing into consumer repos. | C67-4 strictly reuses `cross-repo open-issue` (issue-only, Hard Rule § 6); tests assert no consumer-repo writes. |
| Q1 | Open — should Phase A open the PR itself, or only prepare files? | Default prepare-only (C67-3); revisit if a guarded `--open-pr` is wanted. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: yoga-ah-c3) | 7b44cf4f9f30 | 2026-06-06T23:49:00Z | Needs-Fix | Requiring --sha doesn't prevent tagging the wrong commit; +2 non-blocking (ambiguous git-push vs gh release create; partial-publish idempotency). All fixed in R2. |
| R2 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: yoga-ah-c3) | 9826cb248fc0 | 2026-06-06T23:58:00Z | Go-with-amendments | R1 BLOCKING resolved: Phase B verifies squash-merge SHA + idempotent publish; gh release create --target named as release mutation; consumer-issue (issue-only) mutation clarified. |

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | omni-ah-c3 |
| Reviewer agent | rubber-duck (orchestrator: omni-ah-c3) |
| Notes | Planned models — implementation dispatched to background sub-agents (`claude-opus-4.8`); sub-agent ledger refined at close-out per materially-used models. Model independence per REVIEWS § 2.3 — reviewer `gpt-5.5` ≠ every implementer model. CS67 is NOT on `reviews.high_risk_clickstops`; fallback `claude-sonnet-4.6` permitted if `gpt-5.5` unavailable. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1 — `lib/release.mjs` Phase A (prepare): version bump (`package.json` + `package-lock.json`), CHANGELOG `[Unreleased]`→`[x.y.z]` promotion, README pin update, version-vs-SemVer validation; dry-run-first, `--apply` writes only + `tests/lib-release.test.mjs` | pending | cs67-release | C67-1,C67-2,C67-5,C67-6; Deliverable 1. Injectable fs/git/gh seams; tests under os.tmpdir() only. agent-id=cs67-release \| role=implementer \| report-status=pending \| learnings=0 |
| T2 — `lib/release.mjs` Phase B (publish): verify `--sha` is the squash-merge commit on main (refuse branch-head/arbitrary), `gh release create --target`, idempotent/resumable, `cross-repo open-issue` consumer notify (issue-only) | pending | cs67-release | C67-1,C67-3,C67-4; Deliverable 1. Reuses `lib/cross-repo.mjs` + `lib/disposers.mjs`/`assertSafeRef`. agent-id=cs67-release \| role=implementer \| report-status=pending \| learnings=0 |
| T3 — `bin/harness.mjs`: register `release` in COMMAND_REGISTRY + TOP_HELP + SUBCOMMAND_HELP; thin delegation; `--version`/`--bump`/`--apply`/`--publish`/`--sha` via `requireValue` | pending | cs67-release | C67-5; Deliverable 2. agent-id=cs67-release \| role=implementer \| report-status=pending \| learnings=0 |
| T4 — `OPERATIONS.md` + `template/composed/OPERATIONS.md` mirror (lockstep): `§ Release process` references `harness release` as the canonical executable path | pending | cs67-release | C67-3; Deliverable 3. Lockstep lint. agent-id=cs67-release \| role=implementer \| report-status=pending \| learnings=0 |
| T5 — `CHANGELOG.md` `[Unreleased]` entry for the new `release` subcommand | pending | cs67-release | Deliverable 4; LRN-101 CHANGELOG-touch convention. agent-id=cs67-release \| role=implementer \| report-status=pending \| learnings=0 |
| T6 — Local rubber-duck plan-vs-implementation review (GPT-5.5) before content PR | pending | omni-ah-c3 | Independence invariant: reviewer model ≠ implementer model. |
| T7 — Open content PR (`cs67/content`); PR-level rubber-duck + `harness copilot-engage`; resolve threads; squash-merge | pending | omni-ah-c3 | Per OPERATIONS.md § Three-PR shape (content PR). |
| T8 — Close-out: docs + restart state — rename `active_cs67_*.md` → `done_cs67_*.md`; update WORKBOARD + CONTEXT handoff | pending | omni-ah-c3 | Close-out PR (`cs67/close-out`). |
| T9 — Close-out: learnings + follow-ups — file new LEARNINGS; create planned follow-up CSs for unresolved items | pending | omni-ah-c3 | Per RETROSPECTIVES.md. |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
