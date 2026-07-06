# CS110 — First-class HELD state for planned clickstops (machine-readable holds in status / claim readiness)

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** yoga-ah-c2 (orchestrator, Claude Opus 4.8) — triage of untriaged inbound issue [#506](https://github.com/henrik-me/agent-harness/issues/506) (2026-07-05). Directed by @henrik-me ("if there are open issues evaluate if those are all triaged … if not triage issues").
**Depends on:** none. (Related surfaces the design must reuse: `reviews.high_risk_clickstops` config-side registration + the before-claim harvest gate `claim_area`.)

## Goal

Add a first-class **HELD** concept for planned clickstops so an intentional "do-not-claim until a maintainer explicitly lifts it" hold is **machine-readable** and surfaced by `harness status` and by any claim-readiness computation — instead of today's purely *documentary* 4-layer overlay that status/readiness tooling silently ignores. Deliver #506's F1–F6.

## Background

- Filed from inbound issue **#506** (state: open — re-verify `gh issue view 506` at claim-time HEAD, F6). Verified this session that #506 is open, labelled `enhancement` + `harness-orchestrator`, with **no** dedicated CS and zero references anywhere under `project/clickstops/**` (i.e. untriaged).
- **The incident (#506).** Three held planned CSs (a consumer repo's CS27/CS43/CS44) kept `**Status:** planned`; `harness status` lists the planned queue **by filename/slug only** (verified this session: `harness status` prints `Planned queue (N): CS90b — <slug> …`) and does not parse any hold; an orchestrator computing readiness from `**Depends on:**` completion **alone** reported two of the three as **READY** — the opposite of *held*. The hold was caught only because a human remembered it.
- **Why `blocked` is the wrong existing state.** A clickstop *file's* `**Status:**` is **directory-derived** — `scripts/check-clickstop.mjs` enforces only `planned / active / done` (the Status must match the `planned/`, `active/`, or `done/` directory the file lives in). `blocked` and `paused` are **WORKBOARD active-work / task states** (INSTRUCTIONS.md / OPERATIONS.md), used for a CS that has already been *claimed* and is stuck — `blocked` carries an Owner + a `reclaimable` threshold so another orchestrator may pick it up after N days. A hold is the opposite: a **planned, unclaimed** CS that must **NOT** be claimed by anyone and is **not** reclaimable — orthogonal to `blocked` (a claimed-work state), so it cannot be modelled by it.
- **Today's 4-layer documentary overlay** (none read by `harness status` / readiness): (1) a `**Hold:** ⛔ HELD` line + a `## Hold / claim gate` section in the planned file; (2) HIGH-RISK registration in `harness.config.json` `reviews.high_risk_clickstops` (**present in this repo's config** — verified this session); (3) an `open` `LEARNINGS.md` entry with `claim_area: csNN` as a before-claim-harvest backstop — but this is **advisory today**: `harness claim` runs harvest **non-strict** (`lib/harvest.mjs` / `lib/claim.mjs` — harvest exits 0 unless `--strict`), so it *surfaces* the item without hard-blocking the claim; (4) discipline / human memory. Advisory-only at claim time, **invisible at survey time** (`harness status`, readiness) — that gap is the misread. F3/F4 are what turn the advisory into an enforceable gate.
- **Grounding verified this session (re-confirm at claim HEAD).** There is **no `schemas/clickstop.schema.json`** — the clickstop contract is the **private parser in `scripts/check-clickstop.mjs`** (directory-derived Status check; header-field parse). Critically, the hold-relevant surfaces parse clickstop files **independently today**: `scripts/check-clickstop.mjs` (the contract check), `lib/status.mjs` (`harness status` — `bin/harness.mjs` delegates to it; planned rows render as `CS<NN> — <slug>` only), and `lib/claim.mjs` (the claim preflight/readiness) each have their own parsing/listing logic. So "define the hold field **once**" (F1) requires a **shared clickstop contract/parser module** consumed by all of them — else the `**Hold:**` parse gets duplicated across check-clickstop, status, claim, and lint. Reuse `reviews.high_risk_clickstops` (config-side registration, present at `harness.config.json`) and the `claim_area` before-claim-harvest gate rather than inventing parallel surfaces.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C110-1 | Shape of the HELD signal (F1) | **Recommended (back-compat):** keep `**Status:** planned` and promote the existing `**Hold:**` line to a **contract-recognized, parsed** orthogonal field (a held CS is still "planned", just gated) — mirroring how the files already separate Hold from Status. The alternative (add `held` as a distinct `**Status:**` value) is a **user-approval decision** (G110-1) because a clickstop's `**Status:**` is **directory-derived** (`check-clickstop.mjs` requires Status == the `planned/active/done` directory), so a `held` value would either violate that invariant or force a new directory + a rewrite of every status↔directory / transition rule. Define the chosen shape **once** via the shared parser module (C110-8) so every surface parses it identically. | The orthogonal field is additive + backward-compatible: existing planned files (no `**Hold:**`) parse as not-held and the directory-derived Status invariant is untouched. A `held` Status value is far more invasive — it breaks the Status==directory rule, the `planned→active` rename, readiness, and every existing CS's implicit "not held". |
| C110-8 | Shared clickstop parser (avoid duplicated Hold parsing) | Introduce (or extend) a **single shared clickstop contract/parser module** that `scripts/check-clickstop.mjs`, `lib/status.mjs`, `lib/claim.mjs`, and the new consistency lint all consume for the `**Hold:**` field — rather than each re-implementing the parse. | Today status/claim/check-clickstop parse clickstop files independently; a per-surface `**Hold:**` parse would drift. "Define once" (F1) is only real if the field is parsed from one module. |
| C110-2 | `harness status` surfaces holds (F2) | Render a `⛔ HELD` marker (and, where present, a one-line reason parsed from the `**Hold:**` field / `## Hold / claim gate` section) next to held CSs in the planned-queue snapshot. | The survey-time invisibility is the root cause of the incident; a resuming/handoff agent must see the hold without opening the file. |
| C110-3 | HELD-aware claim readiness (F3) | Any "is this claimable?" computation MUST treat a held CS as **not claimable** regardless of `**Depends on:**` state — a held CS with all deps met is **HELD**, never **READY**. | Prevents the exact incident misread; readiness must AND-in the hold, not only dep-completion. |
| C110-4 | `harness claim --apply` gate (F4) | `harness claim CS<NN> --apply` (and any claim-PR open) MUST refuse while the CS is held, with an actionable "held — lift the hold first" message. The default **dry-run** `harness claim` preflight/harvest scan stays harmless (it may report the hold but must not error). | The claim mutation is the point where a held CS would wrongly go into flight; a hard refuse at `--apply` is the enforceable backstop, while keeping the read-only preflight non-breaking. |
| C110-5 | Lint / consistency check (F5) | Add a `harness lint` check that a held CS is internally consistent — the parsed `**Hold:**` field ⇔ the `## Hold / claim gate` section present ⇔ (recommended) a matching `open` `claim_area` learning — so the layers cannot silently drift apart. Warn-or-fail decided at claim (default: fail on a half-declared hold, since a partial hold is the dangerous state). | The 4-layer overlay's failure mode is silent divergence; a consistency gate makes a partial hold a caught error rather than a survey-time surprise. |
| C110-6 | Lift path + docs (F6) | Document one canonical **lift-the-hold** procedure (clear the `**Hold:**` field/section, flip the backing `claim_area` learning to `applied`/`obsolete`, record who lifted it + when) and a `held → planned` transition, so lifting is as mechanical as holding. | A hold that is hard to lift becomes stale scaffolding; a documented mechanical lift keeps the state reversible (acceptance criterion). |
| C110-7 | SemVer + scope | **Minor** (additive parsed field + new status/claim/lint/readiness behaviour; default preserves today's parse for unheld CSs). Scope is the harness's own clickstop contract + `status`/`claim`/`lint` surfaces; do not redesign `blocked`/`paused`. | New machine-readable contract surface, backward-compatible; bounded blast radius. |

## Deliverables

1. **F1 — machine-readable hold + shared parser (C110-8)** — the chosen HELD signal (C110-1 orthogonal `**Hold:**` field by default) defined **once** in a shared clickstop contract/parser module consumed by `scripts/check-clickstop.mjs`, `lib/status.mjs`, `lib/claim.mjs`, and the F5 consistency lint (no per-surface re-parse); existing planned files without a hold parse as not-held (back-compat).
2. **F2 — `harness status` marker** — a `⛔ HELD` marker (+ one-line reason where available) next to held CSs in the planned-queue snapshot.
3. **F3 — HELD-aware readiness** — the claim-readiness computation treats a held CS as not claimable regardless of `**Depends on:**` completion (never READY).
4. **F4 — `harness claim --apply` gate** — refuses to claim a held CS with an actionable "lift the hold first" message; the default dry-run preflight/harvest scan stays harmless.
5. **F5 — consistency lint** — a `harness lint` check that a held CS's layers (hold field ⇔ `## Hold / claim gate` section ⇔ matching `open` `claim_area` learning) are consistent. Per C110-5 / Q1, keep the `claim_area`-learning arm **warning-vs-fail** (default: a hold-field ⇔ section mismatch **fails**; a missing backing `claim_area` learning is a **warning** unless a claim-time decision upgrades it) so the advisory harvest backstop is not accidentally turned into an unintended hard claim blocker.
6. **F6 — lift path + docs** — a documented canonical "lift the hold" procedure + the `held → planned` transition (OPERATIONS.md / INSTRUCTIONS.md as appropriate, + composed mirrors).
7. **Tests** (`node --test`) — the parser recognizes/ignores the hold field; `status` renders the marker; readiness never reports a held CS as READY; `claim --apply` refuses on a held CS; the consistency lint fires on a half-declared hold and stays silent on a fully-declared or unheld CS.
8. **`CHANGELOG.md` `[Unreleased]`** entry (Minor); issue **#506** referenced for auto-close on merge.

## User-approval gates

- **G110-1** — approve the **F1 shape** (recommended: orthogonal parsed `**Hold:**` field keeping `**Status:** planned`, vs. the alternative `held` status-enum value). The issue explicitly leaves this to the maintainer, and the enum-value alternative changes the status vocabulary + every status↔directory / transition rule (higher blast radius), so the shape is decided before implementation.

## Exit criteria

1. A held planned CS is machine-detectable from a contract-defined field (not prose only); an unheld CS parses as not-held (back-compat).
2. `harness status` renders a HELD marker for a held CS in the planned queue.
3. No readiness computation reports a held CS as READY / claimable, even with all `**Depends on:**` met.
4. `harness claim CS<NN> --apply` refuses on a held CS with an actionable message; the read-only preflight stays non-breaking.
5. The hold is fully reversible via the documented mechanical lift path (`held → planned`).
6. Tests + `harness lint` green; `sync --mode=check` clean; `CHANGELOG.md` entry present. Plan-vs-implementation review (GPT-5.5) GO.

## Risks + open questions

| # | Risk / what breaks | Mitigation |
|---|---|---|
| R1 | A new status-enum value (`held`) would touch the status↔directory rule, `planned→active` rename, readiness, and every existing CS's implicit "not held". | Default to the additive orthogonal `**Hold:**` field (C110-1); the enum-value alternative is gated behind G110-1. |
| R2 | The `claim --apply` gate could break the harmless default dry-run harvest/preflight scan (which must still run at survey time). | C110-4: refuse only at `--apply`; the dry-run preflight may report the hold but must not error (test both paths). |
| R3 | The consistency lint (F5) mis-fires on legitimately partial states (e.g. a hold with no backing learning yet). | Decide warn-vs-fail at claim; default to failing only a *half-declared* hold (field present but section/section-vs-field mismatch); test the fully-declared + unheld silent cases. |
| R4 | Back-compat: existing planned files (and consumers' files) have no hold field. | The absence of the field MUST parse as not-held (C110-1); add a regression test over the current planned queue. |
| Q1 | Does F5's "matching `open` `claim_area` learning" requirement belong in the hard consistency contract, or stay a soft recommendation? | Resolve at claim recon; the `claim_area` backstop already exists — reuse it, but decide whether its absence is a lint *warning* or *failure*. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | cs110-plan-review (yoga-ah-c2) | 4bdf117187fe | 2026-07-06T04:02:00Z | Go-with-amendments | Pre-pass Needs-Fix (Status-enum grounding; missing shared-parser deliverable) fixed: directory-derived Status framing + C110-8 shared parser; F5 claim_area kept advisory. Faithful to #506. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per § Claim) | planned | — | — |

## Notes / Learnings

(filled during execution)

- **Plan review (pre-claim, two independent gpt-5.5 passes).** An initial pass (2026-07-06) returned **Needs-Fix** on two blockers: (B1) the `## Background` mis-grounded the clickstop `**Status:**` vocabulary — `scripts/check-clickstop.mjs` enforces only the **directory-derived** `planned/active/done`, and `blocked`/`paused` are WORKBOARD active-work states, not clickstop-file Status values; (B2) "define the hold once" lacked a concrete deliverable given that `check-clickstop.mjs`, `lib/status.mjs`, and `lib/claim.mjs` parse clickstop files independently. Both were resolved: the Background/C110-1 now frame `blocked` as a claimed WORKBOARD state + the directory-derived Status invariant, and **C110-8** + Deliverable 1 require a shared clickstop parser module. The recorded attestation row (R1, gpt-5.5, **Go-with-amendments**) is the follow-up pass over the fixed Decisions+Deliverables (hash `4bdf117187fe`); its sole amendment — Deliverable 5 keeps the `claim_area` arm warning-vs-fail so the advisory harvest backstop isn't turned into a hard claim blocker — is applied and covered by the pinned hash.

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
