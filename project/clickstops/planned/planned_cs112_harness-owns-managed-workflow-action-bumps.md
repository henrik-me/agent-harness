# CS112 — Harness owns + validates + ships managed-workflow GitHub Actions version bumps (actions/checkout v6.0.2 → v7.0.0); consumer Dependabot no longer blocks on managed-drift

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** yoga-ah-c2 (orchestrator, Claude Opus 4.8) — triage of untriaged inbound issues [#515](https://github.com/henrik-me/agent-harness/issues/515) + [#496](https://github.com/henrik-me/agent-harness/issues/496) (2026-07-05). Directed by @henrik-me ("if there are open issues evaluate if those are all triaged … if not triage issues"). #515 explicitly notes it "could be resolved together with #496".
**Depends on:** none. (Related: **#393 / CS90c** — the *review*-side "Dependabot/bot PRs skip the review gates"; **CS68** — dependency-bump adoption procedure.)

## Goal

Make the harness **OWN, VALIDATE, and SHIP** the pinned GitHub Actions versions in its managed/composed workflow templates (via `harness sync`), so consumers get action bumps **without** editing managed files; and ensure a consumer's Dependabot `github-actions` bump that touches a managed workflow no longer **hard-blocks** on the required `structural-gate` managed-drift check. Concretely, bump `actions/checkout` from **v6.0.2** to **v7.0.0** (validated) across the managed templates. Close **#515** + **#496**.

## Background

- Filed from inbound issues **#515** + **#496** (state: both open — re-verify `gh issue view 515` / `496` at claim-time HEAD, F6). Verified this session both are open with **no** dedicated CS and zero references under `project/clickstops/**` (untriaged). #515 is the "harness owns + validates + ships the bump" side; #496 is the "structural-gate should not hard-block the consumer bump" side — two halves of one problem.
- **The problem (#496 / #515).** Dependabot's `github-actions` ecosystem rewrites `uses: owner/action@<sha> # vX.Y.Z` **inside harness-managed workflow files**. The managed/composed **template-drift** check (run by `harness lint` / `harness-pr-check.yml`, surfaced as the required `structural-gate`) flags this as an unauthorized managed-file edit and **fails a required check** — so in any consumer that enables Dependabot `github-actions` and requires `structural-gate`, those PRs **cannot merge without admin bypass** (defeating the "no bypass" posture). The `workflow-pins` sub-check itself *passes*; the failure is **drift**, not an invalid pin. Trigger: `henrik-me/authzandentitlements#104` (checkout 6.0.2 → 7.0.0), rewriting the pin in 6 managed workflow files.
- **Grounding verified this session (re-confirm at claim HEAD).**
  - The `actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2` pin lives in **6 template workflow files** (verified this session): `template/.github/workflows/review-gates.yml` (4 pins), `template/managed/.github/workflows/harness-drift.yml` (1), `harness-pr-check.yml` (1), `pr-evidence-lint.yml` (**2 pins**, lines 41 + 225), `review-gates.yml` (4 pins), `workboard-auto-approve.yml` (1). **The two `review-gates.yml` mirrors** (`template/.github/…` + `template/managed/.github/…`) MUST stay byte-identical — `tests/cs51-review-gates-workflow.test.mjs` asserts it — so both are bumped in lockstep. (`dotnet-ci.yml` is a language-profile/scaffold template, not a self-host managed root workflow; the consumer saw 6 *rendered* files because its set differs — verify the exact set at claim HEAD.)
  - **Self-host regeneration is asymmetric** (verified `harness.config.json` `managed.files` this session = `DISPATCH-PREAMBLE.md`, `harness-drift.yml`, `pr-evidence-lint.yml`, `review-gates.yml` only): a `sync --mode=apply` regenerates the root copies of **harness-drift / pr-evidence-lint / review-gates** from their templates. But **`workboard-auto-approve.yml` is NOT in self-host `managed.files`** (nor in `.harness-lock.json`), so `sync --mode=apply` will **not** regenerate its root copy — the root `.github/workflows/workboard-auto-approve.yml` + the `template/managed` copy must be edited in **lockstep** (byte-identical; cs50/cs63 tests assert it), or the CS must first add it to self-host `managed.files`. `harness-pr-check.yml` is an *adoptable* managed file (not in self-host `managed.files` either — CS90b), so verify whether a self-host root copy exists at claim HEAD.
  - **SHA↔tag integrity for the target bump is already verified in #515:** `git/refs/tags/v7.0.0` → `9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0` (matches Dependabot's proposed SHA). Re-verify at claim time.
  - **Breaking change:** `actions/checkout` **v7.0.0 blocks checking out the fork-PR head for `pull_request_target` and `workflow_run`** (actions/checkout#2454). The harness ships **`workboard-auto-approve.yml`, which triggers on `pull_request_target`** — so this bump MUST be validated against it. CS91 established that `workboard-auto-approve.yml` checks out `github.event.pull_request.base.sha` (never PR head), so it is expected-safe — but that property must be **verified, not assumed**, before shipping.
  - **The existing repeatable mechanism is insufficient:** `.github/dependabot.yml` already runs a `github-actions` updater, but scoped to `directory: "/"` — it bumps the **self-host root** workflows (`.github/workflows/**`), which then **DRIFT from the un-bumped templates** (`sync --mode=check` fails). So even the harness's *own* Dependabot github-actions PR would fail the harness's own drift check unless the bump is applied to the **template** and the root regenerated via `sync`. The "repeatable mechanism" (#515 ask 3) must bump the **template** pins, not just the root.
  - The two `workboard-auto-approve.yml` copies (root + `template/managed`) MUST stay byte-identical (cs50/cs63 tests).

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C112-1 | Primary approach (#515 ask 1 / #496 option 1) | The harness **OWNS** the action pins in its managed/composed workflow templates and ships bumps via `harness sync`; consumers get the bump without editing managed files. | Keeps managed files truly managed; the pin belongs upstream (a consumer hand-edit desyncs its `main` from the template and is reverted by the next `sync`). |
| C112-2 | Validation gate before shipping a bump (#515 ask 2) | A documented + (where feasible) mechanized pinned-action-bump checklist that MUST pass before a bump is templated/released: (a) **SHA↔tag integrity** (the pinned SHA resolves to the claimed tag via `git/refs/tags`); (b) **breaking-change review** — explicitly the v7 `pull_request_target`/`workflow_run` fork-head restriction vs `workboard-auto-approve.yml` (verify it checks out `base.sha`, not head); (c) **runner runtime compatibility**; (d) **managed workflows still green** on the bumped pin (the harness's own CI). | #515's crux is "validate before applying" so a bad bump is not fanned out to every consumer; the v7 breaking change against a `pull_request_target` workflow the harness ships is the concrete hazard. |
| C112-3 | Ship the concrete bump | Apply `actions/checkout` **v6.0.2 → v7.0.0** (SHA `9c091bb…`) across **all 6 template workflow files** above (both `review-gates.yml` mirrors in lockstep; both `pr-evidence-lint.yml` pins). Regenerate the `managed.files` root copies (harness-drift / pr-evidence-lint / review-gates) via `sync --mode=apply`; for `workboard-auto-approve.yml` (not in `managed.files`) edit the root + template copies in **lockstep** (byte-identical) — or first add it to self-host `managed.files`. Confirm `sync --mode=check` clean, the cs50/cs51/cs63 mirror-identity tests green, and the harness's own CI green on the bumped pin. | Delivers the actual pin #515/#496 were filed over, exercising the C112-2 gate on a real bump; the asymmetric regeneration (managed.files vs. lockstep-edit) is required for a clean self-host result. |
| C112-4 | Repeatable mechanism (#515 ask 3) | Establish a harness-side mechanism that keeps **template** pins current — the existing `.github/dependabot.yml` `github-actions` updater only bumps the drift-inducing root copies, so this needs either (i) a **Renovate `regexManager`** over `template/**` workflow files, (ii) an extra Dependabot `directory` targeting the template workflow dirs **plus** a post-bump `sync --mode=apply` step, or (iii) a small harness-side updater — chosen at claim/ADR — with the C112-2 validation gate applied to those upstream bump PRs. Not pushed onto consumers. | The current config bumps root workflows that immediately drift from the templates; a template-aware updater + the validation gate is the actual "repeatable" fix. |
| C112-5 | Drift-check tolerance vs consumer scoping (#496 options 2 / 3) | **Primary:** document that action pins in managed workflows are **harness-owned** and consumers should **scope Dependabot to ignore harness-managed workflow files** (#496 option 3). **Defer** #496 option 2 (make `check-managed-drift.mjs` tolerate an action-SHA-only edit in a managed workflow as non-drift) as an **open question** — it weakens the "managed files are truly managed" invariant and adds a supply-chain surface (a consumer could pin an arbitrary SHA behind a `# vX` comment). Decide at claim/ADR whether a bounded, opt-in tolerance is warranted. | Keeps the managed invariant + supply chain intact by default; the "don't hard-block" outcome is achieved primarily by the harness owning bumps (C112-1) so consumers never need to touch managed files. |
| C112-6 | SemVer + scope | The pin bump itself is **Patch**; the repeatable-mechanism config + validation-procedure docs are additive. Scope is the harness's managed workflow templates + the harness-side bump mechanism + docs; do **not** alter unrelated workflow logic. | Bounded blast radius; the bump is a supply-chain-validated Patch, the mechanism/docs are additive. |

## Deliverables

1. **Validated bump** — `actions/checkout` v6.0.2 → v7.0.0 (validated per C112-2, incl. the `workboard-auto-approve.yml` `base.sha` fork-head check) applied to **all 6 template workflow files** (both `review-gates.yml` mirrors + both `pr-evidence-lint.yml` pins); the `managed.files` root copies regenerated via `sync --mode=apply`, and `workboard-auto-approve.yml`'s root + template copies edited in lockstep (byte-identical); `sync --mode=check` clean; the cs50/cs51/cs63 mirror-identity tests green; the harness's own CI green on the bumped pin.
2. **Validation procedure doc** (#515 ask 2) — a documented pinned-action-bump validation checklist (SHA↔tag integrity, breaking-change review incl. the `pull_request_target` fork-head caveat, runner compat, green CI) in `OPERATIONS.md` (or a `docs/ci/` note) + composed mirrors as needed.
3. **Repeatable mechanism** (#515 ask 3 / C112-4) — a harness-side template-pin updater (Renovate `regexManager` over `template/**`, or a Dependabot dir + post-bump `sync`, or a small updater) so the harness receives + validates action-bump PRs against the **templates** (not the drift-inducing root-only path), with the C112-2 gate applied.
4. **Consumer guidance** (#496 — resolved via **option 1 + option 3**, NOT automatic SHA-only tolerance) — document that managed-workflow action pins are harness-owned and give a **valid** consumer Dependabot scoping example. NOTE: the Dependabot `github-actions` ecosystem `ignore` is **dependency-name-based, not file/path-based** — so scoping is by action dependency (e.g. `ignore: [{ dependency-name: "actions/*" }]` / `dependency-name: "actions/checkout"`) or by not enabling / narrowing the `github-actions` updater for managed consumers; a file-level path exclude of harness-managed workflow files is **unsupported** for this ecosystem and must not be recommended. Record the DEFERRED SHA-only drift tolerance (#496 option 2) as an open question with its supply-chain/invariant rationale.
5. **Tests / checks** as applicable — confirm the `workflow-pins` linter still validates the bumped pins; the mirror-identity tests (cs51 for the two `review-gates.yml` copies; cs50/cs63 for the two `workboard-auto-approve.yml` copies) must stay green.
6. **`CHANGELOG.md` `[Unreleased]`** entry; issues **#515** + **#496** referenced for auto-close on merge.
7. `harness lint` green; `node --test tests/*.test.mjs` green; `sync --mode=check` clean.

## User-approval gates

- **G112-1 (validation gate, not a posture change)** — the `actions/checkout` v7 bump touches `workboard-auto-approve.yml` (a `pull_request_target` write-token workflow). The C112-2(b) breaking-change validation (confirm it checks out `base.sha`, never fork-PR head) MUST pass before the bump ships; if validation surfaces ANY fork-head-checkout exposure, **escalate** rather than ship.

## Exit criteria

1. `actions/checkout` is pinned at v7.0.0 (validated per C112-2) across the managed/composed workflow templates + regenerated self-host copies; `sync --mode=check` clean; the two `workboard-auto-approve.yml` copies byte-identical; the harness's own CI green on the bumped pin.
2. A documented pinned-action-bump **validation procedure** exists (the C112-2 checklist).
3. A harness-side **repeatable** action-bump mechanism keeps the **template** pins current (not just the root) and applies the validation gate.
4. Consumer Dependabot-scoping guidance is documented; #496 option 2 recorded as a deferred open question.
5. **#515** + **#496** closed on merge. `harness lint` + `node --test` green; `CHANGELOG.md` entry present. Plan-vs-implementation review (GPT-5.5) GO.

## Risks + open questions

| # | Risk / what breaks | Mitigation |
|---|---|---|
| R1 | v7.0.0's fork-PR-head-checkout block breaks `workboard-auto-approve.yml` (a `pull_request_target` workflow). | C112-2(b) / G112-1: verify it checks out `base.sha` (CS91 established this) — validate, don't assume; escalate on any exposure. |
| R2 | Adopting #496 option 2 (SHA-only drift tolerance) would weaken the "managed files are truly managed" invariant + add a supply-chain surface. | Deferred (C112-5); primary fix is the harness owning bumps so consumers never edit managed files; option 2 is an opt-in open question only. |
| R3 | Self-host regeneration is **asymmetric**: `sync --mode=apply` regenerates only the `managed.files` roots (harness-drift/pr-evidence-lint/review-gates); `workboard-auto-approve.yml` is NOT in `managed.files`, so a plain apply leaves its root copy stale → root≠template drift, and the two `review-gates.yml` mirrors could desync. | Edit `workboard-auto-approve.yml` root + template in lockstep (or add it to `managed.files` first); bump both `review-gates.yml` mirrors together; `sync --mode=check` clean + the cs50/cs51/cs63 mirror-identity tests green are exit gates. |
| R4 | The harness-side updater (Renovate/Dependabot on templates) proposes a bump that breaks managed workflows. | The C112-2 validation gate + the harness's own CI run on the bump PR catch it before ship. |
| Q1 | Which repeatable mechanism (Renovate `regexManager` vs Dependabot dir + post-sync vs bespoke updater)? | Resolve at claim/ADR recon; the current `.github/dependabot.yml` root-only scope is proven insufficient (bumps drift from templates). |
| Q2 | Is a bounded, opt-in action-SHA-only drift tolerance (#496 option 2) ever worth the invariant cost? | Open question; default is "no" (consumer scoping + harness-owned bumps). |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | cs112-plan-review (yoga-ah-c2) | e62c8aa74798 | 2026-07-06T04:02:00Z | Go-with-amendments | Pre-pass Needs-Fix (missing review-gates template mirror + workboard not in managed.files) fixed; Dependabot github-actions ignore is dependency-based not path. Faithful to #515+#496. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per § Claim) | planned | — | — |

## Notes / Learnings

(filled during execution)

- **Plan review (pre-claim, two independent gpt-5.5 passes).** An initial pass (2026-07-06) returned **Needs-Fix** on two blockers: (B1) the template set was incomplete — `template/.github/workflows/review-gates.yml` also carries the pin and `tests/cs51-review-gates-workflow.test.mjs` requires it to match the `template/managed` copy, and `pr-evidence-lint.yml` has **two** checkout pins; (B2) the self-host-managed claim was wrong for `workboard-auto-approve.yml` — it is **not** in `harness.config.json` `managed.files`, so `sync --mode=apply` won't regenerate its root copy (lockstep edit or add to `managed.files`). Both resolved: the Background/C112-3/Deliverable 1/R3 now enumerate all 6 template files (both review-gates mirrors + both pr-evidence-lint pins) and the asymmetric regeneration. The recorded attestation row (R1, gpt-5.5, **Go-with-amendments**) is the follow-up pass over the fixed Decisions+Deliverables (hash `e62c8aa74798`); its sole amendment — Deliverable 4 corrects that Dependabot `github-actions` `ignore` is dependency-name-based (path/file excludes unsupported) — is applied and covered by the pinned hash.

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
