# CS79 — `release.yml` idempotency guard (close the double-draft race, LRN-175)

**Status:** active
**Owner:** omni-ah-c2
**Branch:** cs79/content
**Started:** 2026-07-01
**Closed:** —
**Filed by:** `omni-ah-c2` (Claude Opus 4.8) on 2026-07-01, at @henrik-me's request ("go with A") — the follow-up for **[LRN-175](../../../LEARNINGS.md#lrn-175)** surfaced by the CS77 v0.10.0 cut. The `harness release` verb's Phase B does `git push origin v<x>`, which triggers `.github/workflows/release.yml`; that workflow **unconditionally** runs `gh release create <tag> --draft` with no existence check, while the verb *also* creates its own draft — yielding **two draft releases** per cut (reconciled by hand per LRN-159 for v0.10.0). @henrik-me chose **Option A**: make `release.yml` idempotent so it no-ops when a release already exists for the tag.
**Depends on:** **CS77** (cut v0.10.0 — **closed**, `6ccc284`) which discovered + recorded LRN-175. No hard code dependency; `release.yml` is a self-host-only workflow (NOT in `template/managed/**`, NOT in `harness.config.json` `managed.files`), so this CS does not touch consumer templates.

## Goal

Eliminate the LRN-175 duplicate-draft by adding an **idempotency guard** to `.github/workflows/release.yml`'s "Create GitHub Release" step: before `gh release create`, check `gh release view <tag>` and **skip (exit 0)** if a release already exists for the tag. On a fresh cut the verb creates the release ~1–2s after pushing the tag — well before `release.yml` spins up (~20–40s) — so the guarded workflow finds the verb's release and no-ops, closing the observed double-draft. (The verb's own release-skip keys off the *pre-push* tag state, so it is not *strictly* idempotent against a release created in the brief window between its push and its own `gh release view` — see OQ2 — but that window is far shorter than the workflow's spin-up, so the verb reliably creates first.) The workflow remains a correct fallback for **manual** (non-verb) `git tag -a` + push flows. After CS79, a verb cut produces exactly one draft release with no manual reconciliation, and LRN-175 flips to `applied`.

## Background

**State-of-the-world probes ([REVIEWS.md § 2.6c F6](../../../REVIEWS.md)).** Probed 2026-07-01 by `omni-ah-c2`:

```text
$ git ls-remote origin refs/tags/v0.10.0 'refs/tags/v0.10.0^{}'
45a21b2a8491be1fc0788901c9543ac93d847f55	refs/tags/v0.10.0
6ccc28428f4795cc986a30bf5d0178dacdf070c9	refs/tags/v0.10.0^{}

$ gh api repos/henrik-me/agent-harness/releases --jq 'map(select(.tag_name=="v0.10.0")) | length'
1

$ gh release view v0.10.0 --json isDraft --jq .isDraft
false
```

The `v0.10.0` tag is annotated (peeled `^{}` == the CS77 content squash SHA `6ccc284`) and exactly one **published** release exists — the CS77 end-state, whose `release.yml` duplicate was reconciled **by hand** (the exact gap CS79 closes structurally). That `gh release view` returns draft state confirms it reports drafts (the guard's core requirement — C79-2/R1).

**Root cause.** `.github/workflows/release.yml` (CS14) fires on `v*.*.*` tag push and its final step runs `gh release create "$TAG_NAME" --title "$TAG_NAME" --draft [--notes-file … | --generate-notes]` with **no** prior existence check. The `harness release` verb's Phase B (`publishRelease` in `lib/release.mjs`) creates the tag by `git tag -a` + `git push origin <tag>` (which triggers the workflow) and then creates the release itself via `gh release create <tag> --verify-tag --draft`, guarded by its own `gh release view` idempotency probe. GitHub permits multiple *draft* releases per tag, so the workflow's unconditional create adds a second draft.

**Why the verb alone cannot prevent it.** The verb's `gh release view` probe runs ~1–2s after the push — before `release.yml` has begun — so it correctly sees no release and creates one; the workflow then creates the duplicate ~20–40s later. The fix must live on the **workflow** side (or coordinate the two). Option A guards the workflow.

**Timing / determinism.** The two paths never check simultaneously (they are ~20–40s apart), so there is no check-then-both-create race: the verb checks first and creates; the workflow checks later and — with the guard — skips. If instead a human pushes a tag manually (no verb), the workflow's guard finds no release and creates one (fallback preserved). In the **observed** ordering the cut yields exactly one release. Strictly, the verb's release-skip uses its *pre-push* tag snapshot (`tagPointsAtSha`), so it is not guaranteed idempotent against a release that appears between its push and its own `gh release view`; the ~20–40s workflow spin-up makes that window unreachable in practice, so the verb-first ordering is reliable. Fully order-independent idempotency would additionally harden the verb (OQ2).

**Scope.** `.github/workflows/release.yml` (the guard, ~4 lines) + doc lockstep: the `OPERATIONS.md § Release process` verb-note caveat (both the root copy and the `template/composed/OPERATIONS.md` byte-equal mirror) + a `CHANGELOG.md` `[Unreleased]` entry, and flip LRN-175 → `applied` at close-out. **No change to `lib/release.mjs`** (the verb creates its release first in the observed ordering; a strict order-independent hardening of the verb's release-skip is OQ2, out of scope). No schema change; no consumer-template change.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C79-1 | Approach | **Option A — make `release.yml` idempotent** (skip `gh release create` when a release already exists for the tag). NOT Option B (verb defers to the workflow) or C (verb auto-reconciles). | @henrik-me chose A. It is the smallest, lowest-risk change; keeps the verb self-contained (it need not depend on / wait for the workflow) and keeps `release.yml` useful as a fallback for manual tag pushes. |
| C79-2 | The guard | In the "Create GitHub Release" step, before the `gh release create` call, add: `if gh release view "$TAG_NAME" >/dev/null 2>&1; then echo "Release for $TAG_NAME already exists (likely created by 'harness release'); skipping to avoid a duplicate draft (LRN-175)."; exit 0; fi`. `TAG_NAME` is already passed via `env:` and allowlist-validated in the "Validate tag" step (LRN-075). | `gh release view <tag>` exits 0 iff a release exists for the tag (**including drafts**, visible to the `contents:write` `GITHUB_TOKEN`); `>/dev/null 2>&1` + exit-code branch is the standard scripted-existence idiom. `exit 0` (success no-op), not failure — a pre-existing release is the expected verb-cut state, not an error. |
| C79-3 | Verb unchanged | Do **not** modify `lib/release.mjs`. On a fresh cut the verb creates its release ~1–2s after pushing the tag — before `release.yml` spins up (~20–40s) — so guarding the workflow closes the **observed** double-draft. (The verb's release-skip keys off the pre-push tag state, so it is not strictly idempotent against a release created in the brief window before its own `gh release view`; a strict order-independent verb hardening is **OQ2**, out of scope for this minimal fix.) | Keeps the CS minimal and the equivalence proof intact; guarding the workflow closes the observed race and the verb-first timing is reliable. |
| C79-4 | Doc lockstep | Update the `OPERATIONS.md § Release process` verb-note caveat (currently: "a verb-created tag can also trigger `release.yml` (which drafts) … re-check for stale duplicate drafts before publishing") to state that `release.yml` now **no-ops** when a release already exists, so the verb path yields a single draft; edit the root `OPERATIONS.md` **and** its `template/composed/OPERATIONS.md` mirror **identically** (byte-equal). Add a `CHANGELOG.md` `[Unreleased]` `### Fixed` entry. | The caveat is now stale/over-cautious; leaving it would mislead + fail doc fact-claim gates. The CHANGELOG bullet records the fix for the next release. |
| C79-5 | Validation | Workflows are not unit-testable in this repo. Validate by (a) inspection of the guard + the ≤1-release determinism argument, (b) `node bin/harness.mjs lint --quiet` (incl. `check-workflow-pins` — the guard adds no new `uses:`, so pins are unaffected) + `node --test tests/*.test.mjs` both green, (c) `harness check` no drift (OPERATIONS byte-equal). Empirical confirmation lands on the **next** real cut (v0.11.0): exactly one draft, no manual reconciliation. | No `lib/` change ⇒ no new unit tests; the change is a self-contained workflow guard whose correctness is by construction + inspection. |
| C79-6 | Risk class + reviewer | **Standard risk** (not HIGH-RISK): a workflow guard that only *prevents* a duplicate; it creates no irreversible artifact itself (the next release cut exercises it under the CS-for-that-release's own G-publish gate). GPT-5.5 rubber-duck + Copilot review. Reviewer model `gpt-5.5` ≠ implementer `claude-opus-4.8`. Do **not** add CS79 to `reviews.high_risk_clickstops`. | The irreversible artifact (a real release) is produced by a future release CS, not CS79. |
| C79-7 | PR shape | Standard **3-PR lifecycle** — `cs79/claim` (workboard-only) → `cs79/content` (`release.yml` guard + doc lockstep + LRN-175 disposition) → `cs79/close-out` (workboard-only) — plus this filing PR. Solo-orchestrator content merge uses admin-merge. | Canonical claim → content → close-out shape. |

## Deliverables

1. **`.github/workflows/release.yml`** — the idempotency guard (C79-2) in the "Create GitHub Release" step; the workflow no longer creates a duplicate when a release already exists for the tag.
2. **Doc lockstep** — `OPERATIONS.md § Release process` verb-note caveat updated + `template/composed/OPERATIONS.md` mirror (byte-equal); `CHANGELOG.md` `[Unreleased]` `### Fixed` entry (C79-4).
3. **[LRN-175](../../../LEARNINGS.md#lrn-175) → `applied`** — status flipped with a `**Disposition:**` paragraph citing this CS's merge SHA (at close-out).
4. **Validation green** — `node bin/harness.mjs lint --quiet` (0 failed) + `node --test tests/*.test.mjs` (0 failed) + `harness check` no drift.
5. **Local review** — GPT-5.5 rubber-duck (mandatory); Copilot engaged; recorded in the content PR body's `## Model audit` + `## Review log` (C79-6).
6. **This planned file** — `## Plan review` ≥1 row reaching `Go`; renamed `planned → active` at claim, `active → done` at close-out.
7. **Close-out** — `WORKBOARD.md` CS79 row removed; `CONTEXT.md` updated; `## Plan-vs-implementation review` **GO** before the rename.

## User-approval gates

- **Gate A — approach.** Resolved: @henrik-me chose **Option A** (make `release.yml` idempotent) over B (verb defers) / C (verb auto-reconciles).

## Exit criteria

1. `.github/workflows/release.yml`'s "Create GitHub Release" step skips (`exit 0`) with a clear message when `gh release view "$TAG_NAME"` succeeds, and otherwise creates the draft as before.
2. `OPERATIONS.md` + `template/composed/OPERATIONS.md` (byte-equal) verb-note no longer implies a duplicate draft is expected from the verb path; `CHANGELOG.md` `[Unreleased]` has the `### Fixed` entry.
3. `node bin/harness.mjs lint --quiet` and `node --test tests/*.test.mjs` both exit 0; `harness check` reports no drift.
4. LRN-175 is `applied` with a `**Disposition:**` paragraph.
5. The content-PR PVI returns **GO** (GPT-5.5), recorded before the `active → done` rename.

## Risks + open questions

- **R1 — `gh release view` visibility of drafts.** The guard must detect the verb's *draft* release. Mitigation: `gh release view` shows drafts to a `contents:write` token (the workflow's `GITHUB_TOKEN`); the verb's own idempotency probe already relies on the same `gh release view`-sees-drafts behavior, validated on the v0.10.0 cut.
- **R2 — Residual race if a human pushes a tag with no verb + concurrent manual `gh release create`.** Out of scope — the double-*create* only arose from the verb+workflow pair; a human doing both manually is not a supported path. The guard still reduces (not worsens) that risk.
- **R3 — Doc lockstep drift.** Edit both `OPERATIONS.md` copies identically; `harness lint`/`check` enforce byte-equality.
- **OQ1 — Should the verb also stop creating its own release (Option B) later?** Not now — Option A is sufficient and lower-risk. Revisit only if the verb should match the manual process's "release.yml is the sole creator" shape.
- **OQ2 — Harden the verb's release-skip to be order-independent?** The verb's Phase B decides whether to create the release from `tagPointsAtSha` (the *pre-push* remote-tag snapshot) `&&` a fresh `gh release view`, so it is not strictly idempotent against a release that appears in the ~1–2s window between its push and its own `gh release view`. Empirically the verb creates first (the workflow needs ~20–40s to spin up), so Option A closes the observed race without this. A future CS could make the verb skip on **any** successful post-push `gh release view` (re-check freshly) for belt-and-suspenders order-independence — deferred, not required for LRN-175.

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: omni-ah-c2) | 9e4fd0904f9c | 2026-07-01T21:14:00Z | Go-with-amendments | Guard sound + gh release view sees drafts; add F6 probe records; narrow the "≤1 in every ordering" claim (verb release-skip uses pre-push tag snapshot). |
| R2 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: omni-ah-c2) | b1ea97ac26a7 | 2026-07-01T21:20:00Z | Go | R1 fixes verified: F6 probes added; determinism narrowed to observed verb-first ordering in Goal/Timing/C79-3 + OQ2; matches lib/release.mjs. |

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | omni-ah-c2 |
| Reviewer agent | rubber-duck (orchestrator: omni-ah-c2) |
| Notes | Planned ledger (finalized at close-out). Standard risk (C79-6); NOT added to `reviews.high_risk_clickstops`. Self-host workflow guard for LRN-175; no `lib/` change. Independence per REVIEWS § 2.3 — reviewer `gpt-5.5` ≠ implementer `claude-opus-4.8`. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1 — `release.yml` idempotency guard in the Create-GitHub-Release step (C79-2) | pending | omni-ah-c2 | `gh release view "$TAG_NAME"` → skip/exit 0 if exists. |
| T2 — Doc lockstep: OPERATIONS verb-note caveat (both copies, byte-equal) + CHANGELOG `[Unreleased]` `### Fixed` (C79-4) | pending | omni-ah-c2 | `check-doc-lockstep`/`harness check` must pass. |
| T3 — Validate (`harness lint --quiet`, `node --test`, `harness check`); GPT-5.5 rubber-duck + Copilot; content PR → admin-merge (C79-5/6/7) | pending | omni-ah-c2 | Reviewer gpt-5.5 ≠ implementer claude-opus-4.8. |
| Close-out: docs + restart state — rename active→done; WORKBOARD + CONTEXT; flip LRN-175 → applied; `sync --mode=check` clean | pending | omni-ah-c2 | Mandatory close-out row. |
| Close-out: learnings — any new LRN; follow-ups | pending | omni-ah-c2 | LRN-175 disposition = applied (this CS). |

## Notes / Learnings

- _(populated at close-out)_

## Plan-vs-implementation review

> _(filled at close-out per the gate)_
