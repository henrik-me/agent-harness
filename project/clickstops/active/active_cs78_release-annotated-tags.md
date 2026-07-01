# CS78 — `harness release` Phase B: annotated tags (match the documented process)

**Status:** active
**Owner:** omni-ah-c2
**Branch:** cs78/content
**Started:** 2026-07-01
**Closed:** —
**Filed by:** `omni-ah-c2` (Claude Opus 4.8) on 2026-07-01, at @henrik-me's request. Surfacing context: while validating the CS67 `harness release` verb ahead of the v0.10.0 cut (CS77), the GPT-5.5 plan-review found that the verb's Phase B creates the git tag via `gh release create v<x> --target <sha>`, which produces a **lightweight** tag — but [OPERATIONS.md § Release process](../../../OPERATIONS.md#release-process) step 9 and most prior releases (v0.5.0/v0.6.0/v0.8.0/v0.9.0) use an **annotated** tag (`git tag -a v<x> <sha> -m "Release v<x>"`; v0.7.0 is an exception — already lightweight, a CS70 backfill artifact). @henrik-me directed fixing the verb to emit annotated tags **before** cutting v0.10.0, so the release tooling matches the documented process and the dominant annotated-tag convention.
**Depends on:** **CS67** (`harness release` verb — **closed**, merged `b2fb81d`) — this CS refines CS67's `lib/release.mjs` Phase B. **Blocks CS77** (cut v0.10.0), which must consume the corrected verb.

## Goal

Change `harness release` Phase B (`publishRelease` in `lib/release.mjs`) so that, on `--apply`, it creates an **annotated** tag matching [OPERATIONS.md § Release process](../../../OPERATIONS.md#release-process) step 9 — `git tag -a v<x.y.z> <sha> -m "Release v<x.y.z>"` then `git push origin v<x.y.z>` — and then creates the GitHub Release on that already-existing tag via `gh release create v<x.y.z>` (release-only, **no** `--target`). Preserve the R7 idempotency/resumability contract (a tag already at the target SHA is not re-created; a tag at a different SHA is still `ERELEASE_TAG_EXISTS`; an existing release is skipped). After CS78, `git cat-file -t v<x.y.z>` on a verb-cut tag reads `tag` (annotated), not `commit` (lightweight), and the verb's tag-artifact type is byte-for-byte equivalent to the manual `git tag -a` step.

## Background

**Root cause.** `lib/release.mjs` `publishRelease` (apply branch) builds one atomic call — `gh release create v<x> --target <sha> --title <tag> --notes <notes> [--draft]` — which creates **both** the tag and the Release. When the tag does not already exist, `gh release create --target` creates it as a **lightweight** tag (a plain ref → commit, no tag object, no tagger, no message). The manual process ([OPERATIONS.md § Release process](../../../OPERATIONS.md#release-process) step 9) instead runs `git tag -a v<x> <sha> -m "Release v<x>"` + `git push origin v<x>`, producing an **annotated** tag (a first-class tag object with tagger + message that `git ls-remote` reports as both `<tag-object> refs/tags/<t>` and `<commit> refs/tags/<t>^{}`). The verb's own `parseLsRemoteSha` already anticipates annotated tags (it prefers the peeled `^{}` line and the comment at `lib/release.mjs:788` reads "Annotated tags (the release process uses `git tag -a`)") — so the read path expects annotated tags while the write path produces lightweight ones. This CS aligns the write path with the read path and the documented process.

**Discovery.** Found by the CS77 plan-review (GPT-5.5, 2026-07-01) during pre-cut validation of the verb — before any irreversible v0.10.0 artifact was created. Confirmed against the code: `lib/release.mjs:929` (`gh release create ... --target sha`) and the absence of any `git tag -a` in the publish path.

**Impact.** Functionally minor — lightweight tags still resolve for `github:owner/repo#v<x>` consumer pins and `git describe` — but (a) v0.10.0 would diverge from the **documented** process and the dominant annotated-tag convention (v0.5.0/v0.6.0/v0.8.0/v0.9.0 are annotated; v0.7.0 is already lightweight — verified via `git ls-remote --tags origin`, which shows no `^{}` peeled line for v0.7.0 — so v0.10.0 would be the *second* lightweight tag, not the first), and (b) the verb diverges from the process it is documented to mechanize, losing the tag message/tagger metadata that annotated tags carry. Because CS67 shipped this behavior (reviewed + PVI-passed) but has **not** yet appeared in any published release (still in `CHANGELOG.md` `[Unreleased]`), the refinement lands cleanly as part of the same `[Unreleased] → [0.10.0]` window with no released-behavior change to migrate.

**Blast radius.** `lib/release.mjs` `publishRelease` apply-branch (the ~15 lines at `:923–938`); `tests/lib-release.test.mjs` (the `phaseBGit()` helper + the one test asserting `gh release create --target`, plus new annotated-path/idempotency/push-failure tests); the `publishRelease` JSDoc; `bin/harness.mjs` release help text; `OPERATIONS.md § Release process` verb note + its `template/composed/OPERATIONS.md` byte-equal mirror; and the `CHANGELOG.md` `[Unreleased]` CS67 entry's tag-creation description. No schema change; no CLI-flag change; no config change.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C78-1 | Tag-creation mechanism | On `--apply`, when the tag is absent, create it with **`git tag -a v<x> <sha> -m "Release v<x>"`** then **`git push origin v<x>`** (through the `runGit` seam), then create the Release with **`gh release create v<x> --verify-tag --title <tag> --notes <notes> [--draft]`** — release-only, **`--target` removed** (the annotated tag already exists at `<sha>`) and **`--verify-tag` added** so `gh` aborts rather than auto-creating a *lightweight* tag if the pushed ref is somehow absent (defense-in-depth against the exact bug being fixed). | Matches [OPERATIONS.md § Release process](../../../OPERATIONS.md#release-process) step 9 exactly (annotated tag + push). Decoupling tag creation from release creation is required because there is no `gh` flag to make `gh release create` produce an annotated tag; `--verify-tag` (confirmed in `gh release create --help`: "Abort in case the git tag doesn't already exist in the remote repository") guarantees the pushed annotated tag is the one used. |
| C78-2 | Idempotency / resumability (preserve R7) | Keep the existing **remote** `git ls-remote --tags` state check + `parseLsRemoteSha`: **remote tag present at `<sha>`** (incl. annotated peeled to `<sha>`) → skip tagging (`tagCreated=false`); **remote tag present at a different SHA** → `ERELEASE_TAG_EXISTS`. When the **remote tag is absent**, additionally consult the **LOCAL** tag before `git tag -a` (a `git push` may have failed on a prior run, leaving a local-only tag): if a local tag exists at `<sha>` → **skip `git tag -a`** and re-`git push` (resume); if a local tag exists at a *different* SHA → `ERELEASE_TAG_EXISTS`; if absent → `git tag -a` then `git push` (`tagCreated=true`). Then independently: **release absent** → `gh release create --verify-tag`; **release present** → skip (`skipped`). | The R7 contract (a pre-existing tag+release at the intended SHA is skipped; a mismatched tag is a hard error) is a CS67 review outcome and must survive. The added **local**-tag check closes the push-failure resume gap the CS78 plan-review caught: without it, a rerun after a failed push sees the *remote* tag absent and re-runs `git tag -a`, which fails because the local tag already exists. |
| C78-3 | Failure handling | `git tag -a` non-zero → `ReleaseError(..., 'ERELEASE_PUBLISH')`; `git push origin <tag>` non-zero → `ReleaseError(..., 'ERELEASE_PUBLISH')`. Both fatal (no partial success reported). On push failure the local annotated tag is intentionally **left in place** so a rerun's local-tag-at-`<sha>` detection (C78-2) resumes by re-pushing — no `git tag -a` re-run. Keep the existing `gh release create` failure → `ERELEASE_PUBLISH`. | Consistent with the existing publish-path error taxonomy; a failed tag push must abort before the Release is created so a mismatched/lightweight tag is never left behind, while the local-tag-resume path (C78-2) keeps reruns idempotent. |
| C78-4 | Tag message | Annotated message literal **`Release v<x.y.z>`** (e.g. `Release v0.10.0`). | Byte-matches the `-m "Release v<x.y.z>"` in OPERATIONS § Release process step 9. |
| C78-5 | Docs lockstep | Update in the same PR: (1) `publishRelease` JSDoc; (2) `bin/harness.mjs` release help text ("creates the tag + GitHub Release … via `gh release create --target`" → annotated `git tag -a` + push, then release-only `gh release create`); (3) `OPERATIONS.md § Release process` verb note **and** its `template/composed/OPERATIONS.md` mirror (must stay byte-equal — `check-doc-lockstep`); (4) the `CHANGELOG.md` `[Unreleased]` CS67 entry's tag-creation phrasing. | The verb note in both OPERATIONS copies currently says the verb tags via `gh release create --target`; leaving it stale would fail the doc fact-claim gates and mislead. The CHANGELOG `[Unreleased]` bullet becomes the v0.10.0 release note (CS77), so it must describe the final behavior. |
| C78-6 | Tests | Flip the **one** `publishRelease` test that asserts `gh release create … --target <sha>` (`apply creates tag+release with --target …`) to instead assert (i) a `git tag -a <tag> <sha> -m "Release <tag>"` call, (ii) a `git push origin <tag>` call, and (iii) `gh release create <tag>` **without** `--target` **and with `--verify-tag`**. The draft / no-draft tests also drive `gh release create` through `phaseBGit()`, so extend `phaseBGit()` to route `tag -a …` and `push origin …` (status 0); the **custom `gitSeam`** in the `--pr` strong-verify publish tests (which publish with an absent remote tag) needs the same two routes plus a local-tag-absent probe. Add tests: annotated tag created+pushed on a fresh cut; **push-failure is fatal** (`ERELEASE_PUBLISH`); **resume-after-push-failure** (local tag already at `<sha>`, remote absent → skip `git tag -a`, re-push, release created); fully-done skip (remote tag+release present → neither re-created). Keep the annotated-tag-peeled-to-our-commit idempotency test green. | Only the first test hard-codes `--target`; the others assert `--draft`/no-draft but still route through the seam. The new tests lock in the annotated path, `--verify-tag`, the push-failure abort, and the local-tag resume. Tests write only under `os.tmpdir()` (LRN-094) — this CS adds no filesystem writes. |
| C78-7 | Risk class + reviewer | **Standard risk** (not HIGH-RISK): CS78 changes `lib/` behavior but itself produces **no** irreversible artifact — it is validated by unit tests and then exercised under the CS77 cut's G-publish gate. GPT-5.5 rubber-duck + Copilot review per the normal gate. Reviewer independence: the implementer model is `claude-opus-4.8`, so the reviewer model must be `gpt-5.5` (REVIEWS.md § 2.3). Do **not** add CS78 to `reviews.high_risk_clickstops`. | The irreversible artifact (the actual v0.10.0 tag) is produced by CS77, gated by G-publish; CS78 only changes how the verb *would* tag, fully covered by tests. |
| C78-8 | PR shape | Standard **3-PR lifecycle** — `cs78/claim` (workboard-only) → `cs78/content` (`lib/` fix + tests + doc lockstep) → `cs78/close-out` (workboard-only) — plus this filing PR. Solo-orchestrator content merge uses the admin-merge path. | Canonical claim → content → close-out shape; admin-merge per [OPERATIONS.md § Content/release-PR admin-merge](../../../OPERATIONS.md#contentrelease-pr-admin-merge-solo-orchestrator-reality). |

## Deliverables

1. **`lib/release.mjs`** — `publishRelease` apply-branch creates an annotated tag (`git tag -a` + `git push origin <tag>`) when absent, then `gh release create <tag>` **without** `--target` **and with `--verify-tag`**; idempotency/resumability incl. the local-tag-resume path (C78-2) and the error taxonomy (C78-3) preserved; JSDoc updated (C78-5).
2. **`tests/lib-release.test.mjs`** — the single `--target` assertion flipped to the annotated path (`git tag -a` + `git push` + `gh release create … --verify-tag`, no `--target`); `phaseBGit()` **and** the `--pr` strong-verify `gitSeam` route `tag -a` + `push`; new tests for the annotated cut, push-failure fatality, resume-after-push-failure, and the fully-done skip (C78-6). All tests `os.tmpdir()`-only.
3. **Doc lockstep** — `bin/harness.mjs` release help; `OPERATIONS.md § Release process` verb note + `template/composed/OPERATIONS.md` mirror (byte-equal); `CHANGELOG.md` `[Unreleased]` CS67 entry tag phrasing (C78-5).
4. **Validation green** — `node bin/harness.mjs lint --quiet` (0 failed) and `node --test tests/*.test.mjs` (0 failed) on the content branch.
5. **Local review** — GPT-5.5 rubber-duck (mandatory); Copilot engaged; model + timestamp + verdict recorded in the content PR body's `## Model audit` + `## Review log` (C78-7).
6. **This planned file** — `## Plan review` table populated with ≥1 row reaching `Go`; renamed `planned → active` at claim and `active → done` at close-out.
7. **Close-out** — `WORKBOARD.md` CS78 row removed; `CONTEXT.md` updated; the annotated-tag learning filed; `## Plan-vs-implementation review` populated with **Outcome: GO** before the rename. CS65 remains paused (resumed at the end of CS77, not here).

## User-approval gates

- **Gate A — fix the verb before cutting v0.10.0.** Resolved: @henrik-me chose "Pause the cut and fix the verb first so Phase B creates an annotated tag matching the process, then cut v0.10.0 with the corrected verb."

## Exit criteria

1. `publishRelease` on `--apply` invokes `git tag -a <tag> <sha> -m "Release <tag>"` then `git push origin <tag>` (when the tag is absent locally and remotely), then `gh release create <tag>` with **no** `--target` and **with** `--verify-tag`.
2. R7 idempotency intact: remote tag-at-`<sha>` present → no re-tag and release still created if absent; local tag-at-`<sha>` present but remote absent (push-failure resume) → skip `git tag -a`, re-push; tag-at-different-SHA (local or remote) → `ERELEASE_TAG_EXISTS`; tag+release both present → both skipped.
3. `git push` failure aborts with `ERELEASE_PUBLISH` before any Release is created.
4. `bin/harness.mjs` release help, both `OPERATIONS.md` copies (byte-equal), and the `CHANGELOG.md` `[Unreleased]` CS67 entry describe the annotated-tag + push + release-only flow; no stale `gh release create --target` tag-creation claim remains.
5. `node bin/harness.mjs lint --quiet` and `node --test tests/*.test.mjs` both exit 0 on the content branch.
6. The content-PR plan-vs-implementation review returns **GO** (GPT-5.5), recorded in the active CS file before the `active → done` rename.

## Risks + open questions

- **R1 — Local-tag lingering on push failure.** If `git tag -a` succeeds but `git push` fails, the local tag remains. Mitigation: abort with `ERELEASE_PUBLISH` (C78-3) and **leave** the local tag; a rerun detects the local tag at `<sha>` (C78-2), skips `git tag -a`, and re-pushes — true resume. (An earlier draft assumed a rerun would hit the *remote*-state cases; that was wrong — the remote tag is absent, so without the explicit local-tag handling the rerun's `git tag -a` would fail on the existing local tag. Hence C78-2's local check + the resume-after-push-failure test.) Document the resume behavior in the JSDoc.
- **R2 — Idempotency regression.** Decoupling tag/release creation could break the resumable path. Mitigation: C78-6's explicit resumability + fully-done-skip tests; keep the annotated-peeled-idempotency test green.
- **R3 — Doc lockstep drift.** `OPERATIONS.md` and `template/composed/OPERATIONS.md` must stay byte-equal. Mitigation: edit both identically; `harness lint` runs `check-doc-lockstep`.
- **OQ1 — Backfill prior lightweight tags?** Most prior release tags are annotated (v0.5.0/v0.6.0/v0.8.0/v0.9.0); **v0.7.0 is already lightweight** (a CS70 backfill artifact — verified via `git ls-remote --tags origin`, which shows no `^{}` peeled line for v0.7.0). Backfilling a published tag by force-retagging is **out of scope** (it rewrites a released ref that consumers may pin); this CS only affects **future** verb-cut tags, aligning them with the documented process and the dominant annotated convention.

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: omni-ah-c2) | 028ed6ac7572 | 2026-07-01T04:05:00Z | Needs-Fix | False "all prior annotated" (v0.7.0 is lightweight); local-tag push-failure resume gap; add --verify-tag guard; one-test/--pr-seam test wording. |
| R2 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: omni-ah-c2) | 54a155f616fe | 2026-07-01T04:13:00Z | Needs-Fix | R1 fixes verified; 2 residual: stale "three --target" refs at Blast-radius + T2; missing ## Plan-vs-implementation review placeholder. |
| R3 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: omni-ah-c2) | 54a155f616fe | 2026-07-01T04:17:00Z | Go | R2 fixes verified (one-test wording; PVI placeholder added); all R1 fixes intact + internally consistent; no blocker. |

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | omni-ah-c2 |
| Reviewer agent | rubber-duck (orchestrator: omni-ah-c2) |
| Notes | Planned ledger (finalized at close-out). Standard risk (C78-7); NOT added to `reviews.high_risk_clickstops`. Orchestrator `omni-ah-c2` (`claude-opus-4.8`) dispatches a background implementer sub-agent (`claude-opus-4.8`) for the `lib/`+tests+docs change; reviewer `gpt-5.5` ≠ implementer `claude-opus-4.8` (independence, REVIEWS § 2.3). |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1 — `publishRelease`: annotated `git tag -a` + `git push` then release-only `gh release create` (no `--target`); preserve R7 idempotency + error taxonomy; JSDoc (C78-1/2/3/4/5) | pending | omni-ah-c2 | Background implementer sub-agent (claude-opus-4.8). |
| T2 — Tests: flip the one `--target` assertion; extend `phaseBGit()` + the `--pr` `gitSeam`; add annotated-cut, push-failure-fatal, resume-after-push-failure, fully-done-skip tests (C78-6) | pending | omni-ah-c2 | os.tmpdir()-only (LRN-094). |
| T3 — Doc lockstep: bin help + both OPERATIONS copies (byte-equal) + CHANGELOG `[Unreleased]` CS67 tag phrasing (C78-5) | pending | omni-ah-c2 | `check-doc-lockstep` must pass. |
| T4 — Validate (`harness lint --quiet`, `node --test`); GPT-5.5 rubber-duck + Copilot; content PR → admin-merge (C78-7/C78-8) | pending | omni-ah-c2 | Independence: reviewer gpt-5.5 ≠ implementer claude-opus-4.8. |
| Close-out: docs + restart state — rename active→done; update WORKBOARD + CONTEXT; `sync --mode=check` clean | pending | omni-ah-c2 | Mandatory close-out row. CS65 stays paused (resumed at CS77 close). |
| Close-out: learnings — file the lightweight-vs-annotated finding as an LRN; follow-ups if any | pending | omni-ah-c2 | Captures the CS77-plan-review discovery. |

## Notes / Learnings

- _(populated at close-out)_

## Plan-vs-implementation review

> _(filled at close-out per the gate)_
