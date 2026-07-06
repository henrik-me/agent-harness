# CS110 — Harness-owned + validated managed-workflow action-pin bumps (actions/checkout v6.0.2→v7.0.0; closes #496 + #515)

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** yoga-ah (orchestrator, Claude Opus 4.8) — triage of untriaged inbound issues #496 + #515 (2026-07-05), directed by @henrik-me.
**Depends on:** none (logical). Soft merge-overlap only: planned **CS90b** edits `template/managed/.github/workflows/harness-pr-check.yml` job logic (`pr_check.mode`) and planned **CS90c** edits `review-gates.yml`; CS110 bumps the `actions/checkout` pin *lines* in those same files, so sequence to avoid a same-file rebase — there is no logical dependency. CS90a (done) already repositioned the L1/L2 drift gates.

## Goal

Make GitHub Actions version bumps in **harness-managed workflow templates** an
**upstream-owned, validated, and shippable** operation, so that:

1. the harness bumps the pinned action version in its own
   `template/managed/.github/workflows/*.yml` sources and ships it via
   `harness sync` — consumers never hand-edit managed files (closes **#515** pt 1);
2. no pin bump ships until it passes a defined validation gate — SHA↔tag
   integrity, breaking-change review, runner runtime compatibility, and green
   managed workflows (closes **#515** pt 2, the crux);
3. a consumer whose Dependabot still opens a `github-actions` bump against a
   managed workflow stops being hard-blocked by the required `structural-gate`
   (closes **#496**);
4. the currency mechanism runs **in the harness repo**, not pushed onto
   consumers whose managed files are frozen (closes **#515** pt 3).

The concrete first bump CS110 owns and validates is **`actions/checkout`
v6.0.2 → v7.0.0** across the 5 managed workflow templates that pin it.

## Background

Both issues are **OPEN** (verified via `gh issue view 496` / `gh issue view 515`
at claim HEAD `f2b4607`, 2026-07-05; re-verify at claim time per F6).

**The blocker.** Dependabot's `github-actions` ecosystem rewrites
`uses: owner/action@<sha> # vX.Y.Z` inside harness-managed workflow files. The
managed/composed template-drift check — `scripts/check-managed-drift.mjs`, run by
the `structural-gate` job in `template/managed/.github/workflows/harness-pr-check.yml`
(it invokes `check-managed-drift.mjs` at line 118 alongside `harness lint`) —
flags that edit as unauthorized managed drift and **fails the required check**.
The `workflow-pins` sub-check itself passes; the failure is *drift*, not an
invalid pin (issue #496 evidence; `henrik-me/authzandentitlements#104`).

**Why the drift classifier fails it.** `classifyManagedComposedDrift`
(`scripts/check-managed-drift.mjs:55-69`) fails on *any* `managed`/`composed`
file whose sync ChangeRecord action is `created` or `updated`
(`DRIFT_ACTIONS`, line 43; `PROTECTED_CLASSES = {managed, composed}`, line 46).
It keys off the sync **action**, not a line-level content diff — so it cannot
today distinguish "consumer changed only a `uses:` SHA pin" from any other
managed-file divergence. There is an existing escape valve in
`harness-pr-check.yml` (a `harness-managed-edit-ack` label + a
`Harness-managed-edit:` justification line downgrade the failure to a warning,
lines 16-18 / 92-130), but doctrine is **not** to merge such a PR: hand-editing
a managed file desyncs consumer `main` from the template and is reverted by the
next `harness sync` (#515 "Why not just merge the consumer PR").

**The pins in scope.** `actions/checkout` is SHA-pinned at `# v6.0.2` in **5**
managed workflow templates (**9** pin occurrences):

| Template (`template/managed/.github/workflows/`) | Pin line(s) | In self-host `managed.files`? |
|---|---|---|
| `harness-pr-check.yml` | 38 | No — adoptable managed (CS90b note); not self-hosted at root |
| `harness-drift.yml` | 32 | Yes (`harness.config.json` managed.files) |
| `pr-evidence-lint.yml` | 41, 225 | Yes |
| `review-gates.yml` | 83, 146, 211, 274 | Yes |
| `workboard-auto-approve.yml` | 105 | No — adoptable managed; self-hosted at root |

(Note: `dotnet-ci.yml`, named in #515, is a *consumer* workflow — it does **not**
exist in this harness repo; `Get-ChildItem -Recurse -Filter dotnet-ci.yml`
returns nothing. The harness owns the 5 files above, not 6.)

**SHA↔tag facts (verified, not assumed — LRN-221 pattern).**
`gh api repos/actions/checkout/git/ref/tags/v6.0.2` →
`de0fac2e4500dabe0009e67214ff5f5447ce83dd` (type `commit`), matching the pin in
all 5 templates. `.../git/ref/tags/v7.0.0` →
`9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0` (type `commit`), matching the SHA
Dependabot proposes.

**The v7 breaking change.** `actions/checkout` v7.0.0 blocks checking out the
fork-PR *head* for `pull_request_target` and `workflow_run` (actions/checkout#2454).
`workboard-auto-approve.yml` triggers on `pull_request_target` (line 54) — but
its checkout step reads `ref: ${{ github.event.pull_request.base.sha }}`
(line 107), never PR head, so it is **safe**. This property must be re-verified
at implementation, not assumed (#515 pt 2).

**Dependabot posture + the propagation trap.** The harness's own
`.github/dependabot.yml` runs a `github-actions` ecosystem on `directory: "/"`
(lines 16-27). Dependabot PR **#312** ("Bump actions/checkout from 6 to 7…",
branch `dependabot/github_actions/github-actions-640176b5ab`) is **OPEN** and
rewrites the checkout pin in the harness's **rendered root** `.github/workflows/`
copies — Dependabot has no knowledge of `template/managed/`. But consumers sync
from the *template*, and the harness self-host re-renders the `managed.files`
root copies (`harness-drift.yml`, `pr-evidence-lint.yml`, `review-gates.yml`)
*from* the template on `harness sync`. So merging #312 as-is is insufficient and
harmful: the next `harness sync` would **revert** those root copies to v6.0.2
(template is source of truth), and consumers would **never** receive v7.0.0.
This is exactly the source-template-propagation discipline in
[LRN-203](../../../LEARNINGS.md#lrn-203) / [LRN-081](../../../LEARNINGS-archive.md#lrn-081).

**No mechanized SHA↔tag check exists today.** `check-workflow-pins.mjs` is
registered as the `workflow-pins` linter (`bin/harness.mjs:3372-3373`), but its
`USES_REGEX` matches only `henrik-me/agent-harness…` refs
(`scripts/check-workflow-pins.mjs:6-14,119-120`), so third-party action pins
(e.g. `actions/checkout`) are **not scanned at all** — neither their SHA format
nor their SHA↔tag correspondence is validated. It does **not** verify that a
pinned third-party SHA actually resolves to its trailing `# vX.Y.Z` tag.
Mechanizing that check is net-new.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C110-1 | Own the bump (#515 pt 1) | The harness bumps the pinned action version **in its 5 managed workflow templates** and ships via `harness sync`; consumers adopt by syncing, never by editing managed files. Concrete first bump: `actions/checkout` `de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2` → `9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0` across all 9 pin lines. | Keeps managed files truly managed (#515; #496 option 1, "cleanest"). Editing the template is the only change that survives `harness sync` and reaches consumers. |
| C110-2 | Source-of-truth + PR #312 disposition | Apply the bump to `template/managed/.github/workflows/*.yml` (the source), then re-render the self-host root `managed.files` copies via `harness sync --mode=apply`; bump the two adoptable-managed templates (`harness-pr-check.yml`, `workboard-auto-approve.yml`) at source too. **Supersede and close Dependabot #312** — it edited only rendered root files and would be reverted. | The propagation trap above (LRN-203/LRN-081): a raw #312 merge is reverted by the next sync and never reaches consumers. Template-first is the only correct edit point. |
| C110-3 | Validation gate before applying (#515 pt 2 — the crux) | Ship the bump only after a **defined validation gate** passes: **(a)** SHA↔tag integrity — `gh api repos/<owner>/<action>/git/ref/tags/<tag>` must resolve to the pinned SHA (LRN-221); **(b)** breaking-change review — for v7, verify `workboard-auto-approve.yml` checks out `base.sha` not PR head (#2454); **(c)** runner runtime compatibility — the action's required Node runtime is satisfied on the pinned runner image; **(d)** green managed workflows on the bumped pin. Deliver this as **BOTH** a documented `OPERATIONS.md` checklist **and** a mechanized SHA↔tag verifier (extend `check-workflow-pins.mjs` to validate third-party `uses:` pins against their `# vX.Y.Z` comment, **or** a new `scripts/check-action-pin-integrity.mjs` — Q1). Because the SHA↔tag check needs `gh api` network, it MUST run only in the harness-side bump-validation path (a CI job or an intentionally-invoked/opt-in verb), never as part of the default offline `harness lint` (R3). | (a) is the one deterministic, supply-chain-critical check and must not be skippable by hand — mechanize it (the LRN-221 hallucination is exactly what a machine check prevents). (b)-(d) require judgment/CI and belong in a checklist. Both, so neither the judgment items nor the integrity item can be silently omitted. |
| C110-4 | Drift tolerance (#496) | **Primary: option 1** (C110-1 — harness owns the bump, so a compliant consumer never edits a managed workflow and `structural-gate` sees no drift). **Secondary/complementary: option 3** — document consumer Dependabot scoping to `ignore` harness-managed workflow paths so Dependabot does not even open the blocked PR. **Reject option 2 (drift classifier tolerates `uses:`-only edits) as the primary.** | Option 1 fixes #496 and #515 in one stroke and keeps managed files managed. Option 2 is technically costly and risky: `classifyManagedComposedDrift` keys off the sync ChangeRecord *action*, not a content diff (`check-managed-drift.mjs:55-69`), so tolerating "only a pin changed" would require the gate to fetch both file bodies and prove the sole delta is a `uses:` SHA + trailing `# vX.Y.Z` — and that tolerance widens the attack surface (a malicious SHA smuggled as "just a pin bump"). Option 3 removes the noise source without weakening the gate. |
| C110-5 | Repeatable, harness-side (#515 pt 3) | The currency mechanism — the harness's own `github-actions` Dependabot on `.github/workflows/` (`.github/dependabot.yml`) **plus** the C110-3 validation gate and the C110-2 template propagation — runs **in the harness repo**. Each accepted bump is templated + validated + shipped in a harness release (its own CS per `OPERATIONS.md § Release process`), never pushed onto consumers directly. | #515 pt 3: consumers' managed files are frozen; currency is an upstream responsibility. Reuses existing Dependabot + release machinery rather than net-new automation. |
| C110-6 | Tests (minimums) | Cover, at minimum: **(i)** if C110-3 adds a SHA↔tag verifier — a test asserting it PASSES when the pinned SHA matches the tag resolution and FAILS when it does not (fixture/injected resolver, no live network in unit tests); **(ii)** a regression guard asserting `workboard-auto-approve.yml` checks out `github.event.pull_request.base.sha` (never PR head) so a future edit cannot silently reintroduce the v7 fork-head hazard; **(iii)** if option 2 is ever adopted (it is not the primary) — a drift-tolerance test. Over-delivery beyond these minimums is welcome. | LRN-037 test-minimums posture; the risk surface is the new verifier and the `pull_request_target` safety property, not line counts. |
| C110-7 | SemVer classification | Classify at implementation: a **new linter/verb** (mechanized SHA↔tag verifier or `harness` bump-validation subcommand) ⇒ **Minor** (`OPERATIONS.md § SemVer policy`: "New linter script added" / "New CLI subcommand added"). A **pure template pin bump** with no new interface ⇒ **Patch**. If both land in this CS, the CS release is **Minor** (the larger bump wins). | Deterministic mapping to the published SemVer table; keeps consumer upgrade expectations correct. |

## Deliverables

1. **Bumped managed templates** — `actions/checkout` `# v6.0.2` → `# v7.0.0`
   (`9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0`) across all 9 pin lines in the 5
   files: `template/managed/.github/workflows/{harness-pr-check.yml:38,
   harness-drift.yml:32, pr-evidence-lint.yml:41,225,
   review-gates.yml:83,146,211,274, workboard-auto-approve.yml:105}`.
2. **Self-host root re-render** — the `managed.files` root copies
   (`harness-drift.yml`, `pr-evidence-lint.yml`, `review-gates.yml`) regenerated
   from the template via `harness sync --mode=apply`; the self-hosted root
   `workboard-auto-approve.yml` bumped to match. Optionally bump the checkout pin
   in the harness-internal-only root workflows (`harness-checks.yml`,
   `harness-self-check.yml`, `harness-self-check-via-reusable.yml`,
   `npm-pack-dry-run.yml`, `secret-scan.yml`, `validate-schemas.yml`,
   `private-smoke.yml`) for repo-wide consistency (Q2).
3. **Validation gate (C110-3)** — a new/extended check-*.mjs verifying third-party
   `uses:` SHA↔tag integrity (Q1: extend `scripts/check-workflow-pins.mjs` vs new
   `scripts/check-action-pin-integrity.mjs`), with `requireValue`-guarded flags
   (LRN-040), plus a documented `OPERATIONS.md § Managed-workflow action-pin bump`
   checklist covering integrity + breaking-change + runner-runtime + green-workflows.
4. **Consumer Dependabot scoping guidance (option 3)** — a documented `ignore`
   pattern for harness-managed workflow paths, cross-linked from the OPERATIONS
   checklist (complements C110-1, does not replace it).
5. **Tests** (`node --test`) per C110-6 (minimums).
6. **PR #312 superseded/closed** with evidence that the bump was re-applied at the
   template source (LRN-203 step 7).
7. `CHANGELOG.md` `[Unreleased]` entry; issues **#496** and **#515** referenced for
   auto-close on merge.
8. Green: `harness lint`, `check-workflow-pins`, `check-managed-drift`,
   `sync --mode=check`, and `node --test tests/*.test.mjs`.

## User-approval gates

- **G110-1 (HIGH-RISK).** Any implementation that **relaxes the required
  `structural-gate` drift tolerance** (i.e. adopts #496 option 2 in
  `check-managed-drift.mjs`) weakens a required security gate that fans out to
  every consumer and MUST have explicit user approval before implementation. The
  recommended path (C110-4 option 1 + option 3) does **not** trigger this gate.
- **G110-2 (control point).** Shipping the validated pin bump to consumers happens
  through a harness release (its own CS per `OPERATIONS.md § Release process`) and
  is gated on the C110-3 validation checklist being green for the bump. A bump
  whose validation gate is red is not templated/shipped (#515 pt 2).

## Exit criteria

1. All 9 `actions/checkout` pin lines in the 5 managed templates read
   `9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0`; the `managed.files` root
   copies are re-rendered and `sync --mode=check` is clean (no drift).
2. The C110-3 validation gate ran and is green for v6.0.2→v7.0.0: SHA↔tag verified
   via `gh api` (resolves to `9c091bb…`); breaking-change review recorded
   (`workboard-auto-approve.yml` checks out `base.sha`, safe vs #2454); runner Node
   runtime confirmed; managed workflows green on the bumped pin.
3. Issues **#496** and **#515** are closed by the merge.
4. `check-workflow-pins`, `check-managed-drift`, `harness lint`, and
   `node --test tests/*.test.mjs` are all green.
5. Dependabot PR **#312** is superseded/closed with propagation evidence.
6. Plan-vs-implementation review (GPT-5.5) verdict **GO**.

## Risks + open questions

| # | Risk / open question | Mitigation / resolution path |
|---|---|---|
| R1 | A bad bump fans out to **all** consumers via `harness sync`. | C110-3 validation gate + G110-2: no bump ships until integrity + breaking-change + runner + green-workflows pass; the v7 `pull_request_target` fork-head hazard is explicitly checked against `workboard-auto-approve.yml`. |
| R2 | Source-template propagation miss — bumping only the rendered root (as #312 does) is reverted by the next `harness sync` and never reaches consumers. | C110-2: edit `template/managed/…` first, re-render root, supersede #312 (LRN-203/LRN-081). |
| R3 | SHA↔tag verification needs network (`gh api`), which the offline per-PR `harness lint` gate avoids. | Run the mechanized integrity check in the **harness-side** bump-validation path (a CI job or an intentionally-invoked verb), not as a hard offline `harness lint` gate — matches C110-5 "runs in the harness repo" and the LRN-221 verify-against-source pattern. |
| R4 | Relaxing drift tolerance (option 2) widens the attack surface and is technically costly. | C110-4 rejects option 2 as primary; if ever pursued it is gated by G110-1 and must diff file bodies to prove the sole delta is a `uses:` SHA + `# vX.Y.Z` comment. |
| Q1 | Mechanized integrity check: **extend** `check-workflow-pins.mjs` (today matches only `henrik-me/agent-harness` refs, line 120) or add a new `scripts/check-action-pin-integrity.mjs`? | Resolve at claim recon; prefer extending the existing `workflow-pins` linter unless third-party-action scope warrants a separate script (avoid net-new CLI surface without cause). |
| Q2 | Scope: also bump the checkout pin in the harness-internal-only root workflows + the `actions/setup-node` pins (7 occurrences in the same 5 templates), or restrict to consumer-facing checkout templates? | Recommend bumping checkout across all harness root workflows for consistency; treat `setup-node` as a follow-up using the same C110-3 mechanism. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | cs110-plan-review (yoga-ah) | 1226d5ab8272 | 2026-07-06T04:19:37Z | Go-with-amendments | Verified 5 templates/9 checkout pins, drift keys off ChangeRecord action, v6/v7 SHAs, #312 root-only; amended workflow-pins claim (ignores 3rd-party refs); SHA↔tag stays off offline lint. |

## Plan-vs-implementation review

_(placeholder — enforced only when this file reaches active/ or done/)_
