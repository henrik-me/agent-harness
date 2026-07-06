# CS112 — #506 first-class HELD state for planned clickstops: parsed `**Hold:**` field + `harness status` marker + `claim --apply` gate

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** yoga-ah (orchestrator, Claude Opus 4.8) — triage of untriaged inbound issue #506 (2026-07-05), directed by @henrik-me.
**Depends on:** none

## Goal

Give planned clickstops a **machine-readable HELD** signal so an intentional
"do-not-claim until a maintainer lifts it" hold is surfaced by `harness status`
and enforced by the claim path — instead of today's purely *documentary* overlay
that status/readiness tooling silently ignores. Closes
[#506](https://github.com/henrik-me/agent-harness/issues/506) by landing F1–F4
(and deciding F5/F6): an orthogonal parsed `**Hold:**` header field recognized by
`scripts/check-clickstop.mjs`, a `⛔ HELD` marker in `harness status`, and a
`harness claim CS<NN> --apply` refusal — so the exact incident (a held CS
reported as READY) cannot recur.

## Background

Filed from inbound issue **#506** (state: **OPEN** — verified `gh issue view 506`
at plan-authoring HEAD `f2b4607`; **re-verify at claim HEAD, F6**). The request is
upstream against the harness itself (provenance: a harness orchestrator from a
consumer repo, at the maintainer's direct request), so no `[harness:csNN]` handoff
prefix applies.

**The incident (2026-07-05, a consumer repo).** Three planned clickstops were
intentionally held, but their `**Status:**` was still `planned`, and an
orchestrator computing readiness from `**Depends on:**` completion **alone**
reported two of the three as **READY** — the opposite of *held*. `blocked` is the
**wrong** existing state: it means *claimed-but-stuck*, carries an Owner + a
reclaimable threshold, and is reclaimable by another orchestrator — a hold is the
opposite (nobody may claim it; it is not reclaimable). So a hold is **orthogonal**
to `blocked`.

**Why the tooling misses it today (grounding — verify at claim HEAD):**

- **`scripts/check-clickstop.mjs` is the clickstop "schema" — code, not JSON.**
  There is **no `schemas/clickstop.schema.json`**; the header/section contract is
  enforced by this script. It requires `REQUIRED_FIELDS =
  ['Status','Owner','Branch','Started','Closed','Depends on']` (line 45), maps
  each subdir to an expected status via `DIR_STATUS` (line 48), and enforces the
  lifecycle invariant by parsing `**Status:**` with `/\*\*Status:\*\*\s*(\S+)/`
  and normalizing to letters (`checkFile`, lines 405–447). It has **no** concept
  of a hold — a held CS is indistinguishable from any other `planned` CS.
- **`lib/status.mjs` lists the planned queue by filename only.** `listClickstops`
  (line 131) `statSync`s each entry and parses the *filename* via `matchCsName`
  (line 118) — it never opens the file body. `formatStatusReport` renders each
  planned entry as `  ${p.cs} — ${p.slug}` (planned-queue loop, lines 333–335),
  with no hold signal. Its `CsListing` records (typedef lines 36–43) carry no hold
  field.
- **`lib/claim.mjs` has no hold gate.** `runClaimFromDisk` (line 710) runs the
  git preflights (lines 905–936), resolves the planned file with
  `findPlannedClickstop` (line 938), then `planClaim` → the pre-claim harvest gate
  → the `--apply` mutation — and never inspects a hold.
- **No harness code computes dependency-readiness.** A grep across `lib/`, `bin/`,
  `scripts/` finds `Depends on` only as a required-field *marker*
  (`check-clickstop.mjs` lines 45/428) and doc text (`bin/harness.mjs`); the only
  "readiness" verb (`lib/review-cs.mjs`, `harness review-cs`) checks
  *plan-review/PVI attestation freshness*, a different sense. Readiness was being
  computed **ad hoc by the orchestrator agent** — which is precisely why the hold
  was missed.

**Today's 4-layer overlay** — a `**Hold:**` line + a `## Hold / claim gate`
section, a `reviews.high_risk_clickstops` entry, an `open` `claim_area` learning,
and human memory — is robust *at claim time* but invisible *at survey time*.
Grounding on the current backstops:

- `reviews.high_risk_clickstops` (`harness.config.json` line 143; schema
  `schemas/harness.config.schema.json` lines 206–215) registers **review-model
  policy** (independence-invariant + fallback-model gating — `lib/review.mjs:399`,
  `scripts/checks/check-independence-invariant.mjs:131`), **not** a claim gate. It
  cannot hold a CS and must stay orthogonal to holds.
- The before-claim harvest gate (`lib/harvest.mjs`) fires only at
  `harness claim csNN` and only when a `claim_area`-matching `open` learning is
  **stale** (`matchesClaimArea` line 99; `stale && matchesClaimArea` line 108;
  `DEFAULT_STALE_DAYS = 14` line 32), and is **advisory** (`harvestExitCode`
  returns 0 by default, line 178). So it is silent at survey time and for the
  first 14 days.

This self-host repo currently has **no** `**Hold:**` line, `## Hold / claim gate`
section, or hold-purposed config *outside this plan file* (grep-verified — the `⛔`/`**Hold:**` tokens in this file are illustrative examples, not an active hold) — the
overlay is per-consumer prose. CS112 authors first-class support that replaces the
invisible part with a parsed contract while keeping the human-readable
`## Hold / claim gate` section.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C112-1 | **F1 — machine-readable hold (field shape).** Keep `**Status:** planned` and add an **orthogonal, OPTIONAL** parsed header field `**Hold:** ⛔ HELD — <reason>` (`<reason>` required, non-empty). Held iff the `**Hold:**` value matches `HELD` + em-dash + reason; **not held** iff the field is absent or an em-dash placeholder (`**Hold:** —`). Define the field name + shape **once** in a single shared parser (an exported `parseHold(content) → { held, reason }`, e.g. `lib/hold.mjs`) consumed by `check-clickstop.mjs`, `lib/status.mjs`, and `lib/claim.mjs`. The clickstop "schema" is **code** (`scripts/check-clickstop.mjs`) — there is **no** `schemas/clickstop.schema.json` — so "define once" means one parser, not a JSON field. | **Back-compat:** a held CS is still structurally `planned`, so existing tooling and every not-held CS are unaffected. **Reject the alternative** (`held` as a `**Status:**` value): `check-clickstop.mjs`'s dir invariant (lines 437–447 vs `DIR_STATUS` line 48) would flag `**Status:** held` in `planned/` as a mismatch, and lifting would become a lifecycle/dir rename rather than a field-clear. Single-parser rule kills field-name guessing (LRN-039 applied to code). |
| C112-2 | **F2 — `harness status` marker.** Render `⛔ HELD — <reason>` next to held CSs in the planned-queue snapshot. | Render site: `lib/status.mjs` `formatStatusReport` planned-queue loop (lines 333–335). Parse the hold in the disk wrapper `getStatusSnapshotFromDisk` (line 350) / `listClickstops` (line 131) — which today read filenames only (`matchCsName` line 118) and must newly open each planned body — and carry `held`/`holdReason` on `CsListing` (typedef lines 36–43). Keep pure `getStatusSnapshot` (line 195) and `formatStatusReport` pure over pre-parsed fields, preserving the module's pure-function design (lines 5–17). |
| C112-3 | **F3 — HELD-aware readiness.** A held CS is **not claimable regardless of `**Depends on:**` completion** — a held CS with all deps met is HELD, never READY. | There is **no central readiness function to patch** (grep-verified: no dependency-readiness code; `review-cs` "readiness" is plan-review/PVI freshness). The contract is therefore enforced at the two **real** gates — the status marker (C112-2) and the claim refusal (C112-4) — plus a documented readiness rule. Export `parseHold` (C112-1) so any orchestrator/consumer readiness computation consults the same signal instead of re-reading `**Depends on:**` alone. |
| C112-4 | **F4 — `harness claim --apply` gate.** `harness claim CS<NN> --apply` **REFUSES** on a held CS with an actionable "held — lift the hold first" message; the default **dry-run** stays **harmless** (renders the plan with a `⛔ HELD` warning, exit 0). | Gate site: `lib/claim.mjs` `runClaimFromDisk` (line 710), after `findPlannedClickstop` resolves the file (line 938) and before `planClaim`/the harvest gate/the `if (!apply)` dry-run return/the `applyClaimPlan` apply tail (≈ lines 957–990). Parse `**Hold:**` from `found.listing.entryPath`; when `held && apply`, return `{ ok: false, errors: [...] }`. Leave the pre-claim harvest gate untouched (it stays advisory — `lib/harvest.mjs` `harvestExitCode` line 178) so preflight/harvest scans stay harmless. |
| C112-5 | **F5 — lint consistency (scope).** MVP: an **intra-file** consistency check in `check-clickstop.mjs` keyed on the **parsed** hold state — `parseHold(content).held` ⇔ a `## Hold / claim gate` section (both present or both absent). An absent field or an em-dash placeholder (`**Hold:** —`, i.e. `parseHold().held === false`) is **not** held and requires **no** hold section. **Defer** the cross-file check (`**Hold:**` ⇔ a matching `open` `claim_area` learning in `LEARNINGS.md`) to a fast-follow. | The intra-file drift (machine line vs human section) is the cheap, high-value guard against the exact overlay-drift class from the incident. The cross-file correlation needs a `LEARNINGS.md` frontmatter join (`lib/harvest.mjs` `parseFrontmatterBlocks`) **and** a policy on whether a backing learning is mandatory (Q2) — out of scope for MVP. A new check (if not folded into `check-clickstop.mjs`) registers in `cmdLint`'s linter table (`bin/harness.mjs` line 3294; the existing `clickstop` entry is lines 3319–3324). |
| C112-6 | **F6 — lift path.** Document **one** canonical `held → planned` lift in `OPERATIONS.md § Lifting a hold`: (1) clear the `**Hold:** ⛔ HELD — …` line (remove it or set `**Hold:** —`); (2) remove or mark-lifted the `## Hold / claim gate` section; (3) flip any backing `claim_area` learning to resolved in `LEARNINGS.md`; (4) record who lifted + when. | Because `**Status:**` stayed `planned` throughout (C112-1), lifting is a **field-clear, not a lifecycle/dir rename** — no `planned→active`/dir churn. After the clear, `harness status` stops showing `⛔` and `claim --apply` proceeds. This mechanical symmetry (hold = set field; lift = clear field) is the payoff of the back-compat design. |
| C112-7 | **F7 — tests (minimums).** (a) `parseHold`: HELD-with-reason ⇒ held; absent/`—` ⇒ not held; reason-less `**Hold:** HELD` ⇒ shape error (`check-clickstop.mjs`). (b) status: `formatStatusReport` renders `⛔ HELD — <reason>` for a held planned listing, unchanged otherwise. (c) claim: `runClaimFromDisk({ apply: true })` on a held CS ⇒ `{ ok: false }` + "lift the hold first"; dry-run ⇒ `{ ok: true }` harmless. If C112-5 ships: HELD line without the section ⇒ lint error. | Covers the parse contract, the survey-time surface, and the claim gate — the three failure points from the incident. Minimums only; over-delivery encouraged (LRN-037). `node --test`. |
| C112-8 | **SemVer.** Classify as **Minor** (`0.17.0` → `0.18.0`). | Purely **additive, backward-compatible**: a new OPTIONAL `**Hold:**` field (existing CSs default to not-held and are unaffected — not added to `REQUIRED_FIELDS`, `check-clickstop.mjs` line 45), a new `harness status` marker, and a claim refusal that fires **only** on the new field. No breaking change to existing artefacts, CLI flags, or `schemas/*.json`. Not Patch (adds a parsed contract + behavior); not Major (nothing breaks). |

## Deliverables

1. **Shared hold parser** — a single source of truth for the `**Hold:**` field
   name + shape (exported `parseHold(content) → { held, reason }`, e.g. new
   `lib/hold.mjs`), consumed by `scripts/check-clickstop.mjs`, `lib/status.mjs`,
   and `lib/claim.mjs` (C112-1). No `schemas/*.json` change (the clickstop
   contract is code, not JSON).
2. `scripts/check-clickstop.mjs` — recognize + validate the OPTIONAL `**Hold:**`
   field via the shared parser (reason-required shape check); **do not** add it to
   `REQUIRED_FIELDS` (line 45); optional intra-file consistency keyed on
   `parseHold().held` ⇔ a `## Hold / claim gate` section (C112-5; a `**Hold:** —`
   placeholder is not held and needs no section). Update the linter's help /
   `harness lint --explain clickstop` docs to mention the optional field.
3. `lib/status.mjs` — parse the hold in `getStatusSnapshotFromDisk` (line 350) /
   `listClickstops` (line 131); carry `held`/`holdReason` on `CsListing` (typedef
   lines 36–43); render `⛔ HELD — <reason>` in the `formatStatusReport`
   planned-queue loop (lines 333–335), keeping the pure functions pure (C112-2).
4. `lib/claim.mjs` — held-refusal gate in `runClaimFromDisk` after
   `findPlannedClickstop` (line 938) for `--apply`; harmless dry-run warning
   (C112-4).
5. `OPERATIONS.md` — a `§ Lifting a hold` procedure + a hold-authoring note (the
   `**Hold:**` field shape and the companion `## Hold / claim gate` section)
   (C112-6); and the readiness rule (a held CS is never READY, regardless of
   `**Depends on:**`) where claim/readiness is documented (C112-3).
6. Tests (`node --test`) per C112-7 (minimums).
7. `CHANGELOG.md` `[Unreleased]` entry; issue #506 referenced for auto-close on
   merge.
8. `harness lint` green; `node --test tests/*.test.mjs` green; `node bin/harness.mjs
   sync --mode=check` clean (no schema change expected — confirm at claim).

## User-approval gates

- **G112-1** — Maintainer approves the **field-shape decision (C112-1)** — the
  back-compat orthogonal `**Hold:**` field over `held` as a `**Status:**` value —
  and the `claim --apply` refusal UX, **before** implementation. #506 F1 names the
  two shapes explicitly as "the maintainer's call", so the choice is gated; the
  rest of the plan (C112-2…C112-8) follows from it.

## Exit criteria

1. A held planned CS is machine-detectable from the parsed `**Hold:**` field (not
   prose only); `parseHold` is the single definition point.
2. `harness status` renders `⛔ HELD — <reason>` for a held planned CS.
3. `harness claim CS<NN> --apply` refuses on a held CS with an actionable
   "lift the hold first" message; the default dry-run stays harmless (exit 0).
4. The readiness rule (held ≠ READY, regardless of `**Depends on:**`) is
   documented, and no code path treats a held CS as claimable.
5. The hold is fully reversible via the documented `OPERATIONS.md § Lifting a hold`
   path (`held → planned` = field-clear, no dir rename).
6. Issue #506 closed. `harness lint` + `node --test tests/*.test.mjs` green.
7. Plan-vs-implementation review (GPT-5.5) verdict GO.

## Risks + open questions

| # | Risk / open question | Mitigation / resolution path |
|---|---|---|
| R1 | A `**Hold:**` shape that `check-clickstop.mjs` doesn't recognize → a hold silently ignored (the exact incident class). | One shared `parseHold` (C112-1) is the ONLY definer of the field name + shape; `check-clickstop`/`status`/`claim` all consume it; reason-required validation + a test that a malformed hold is a lint error (C112-7a). |
| R2 | Adding `Hold` to `REQUIRED_FIELDS` (`check-clickstop.mjs` line 45) would flag every existing not-held planned CS. | Hold is OPTIONAL — recognized only when present; explicitly NOT in `REQUIRED_FIELDS`; back-compat test (a CS with no `**Hold:**` passes) (C112-7). |
| R3 | `harness status` newly opening every planned file body adds I/O the pure snapshot avoided. | Parse the hold only in the disk wrapper `getStatusSnapshotFromDisk` (line 350); keep `getStatusSnapshot` (line 195) / `formatStatusReport` pure over pre-parsed `CsListing` fields — preserves the module's pure-function contract (lines 5–17). Cost is one small read per already-`statSync`'d planned file. |
| R4 | Choosing `held` as a `**Status:**` value would fight the dir-status invariant (`check-clickstop.mjs` lines 437–447) and force a `planned→held` dir/rename. | Recommend the orthogonal `**Hold:**` field (C112-1): `**Status:**` stays `planned`, and lift is a field-clear (C112-6) — no lifecycle churn. |
| R5 | Refusing only on `--apply` could still let a plain dry-run mislead a reader. | Dry-run renders a prominent `⛔ HELD` warning (C112-4, exit 0); the `harness status` marker (C112-2) is the primary survey-time signal, closing the exact gap from the incident. |
| Q1 | Should the held-refusal be hoisted **above** the git preflights (`lib/claim.mjs` lines 905–936) so a held CS is refused even on a dirty tree / wrong branch? | Resolve at claim recon; recommend yes for UX (held is more fundamental than tree-cleanliness), but it means locating the planned file earlier than line 938. |
| Q2 | Is a backing `open` `claim_area` learning MANDATORY for a hold (enabling the deferred cross-file D5 check), or optional? | Decide when the cross-file check ships (C112-5 deferred); MVP does intra-file (HELD line ⇔ `## Hold / claim gate` section) only. |
| Q3 | Should `reviews.high_risk_clickstops` (`harness.config.json` line 143) remain a SEPARATE concern from holds? | Yes — it registers review-model policy (`lib/review.mjs:399`; `scripts/checks/check-independence-invariant.mjs:131`), NOT a claim gate; documented as orthogonal so a hold is never conflated with high-risk. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | cs112-plan-review (yoga-ah) | 06713bf73408 | 2026-07-06T04:17:25Z | Go-with-amendments | Verified no-JSON-schema grounding, cited status/claim sites, back-compat D1, no readiness fn (D3); applied C112-5 parseHold().held consistency + narrowed Background 'no marker' claim. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per § Claim) | planned | — | — |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
