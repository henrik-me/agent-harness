# 0006 — Configurable review-enforcement posture

**Date:** 2026-07-05
**Status:** Proposed

---

## Status

Proposed (CS109 — inbound issue [#402](https://github.com/henrik-me/agent-harness/issues/402)).
This ADR is a **user-approval gate** (G109-adr): implementation of the config
field, the `harness ruleset` verb, and the deadlock/coherence guards MUST NOT
land until the posture model below is accepted. It is the generalized,
consumer-configurable design; the concrete self-host ruleset flip stays with
**CS106**, and the CI-gate layering ADR (`0005`) + a future single-context
`review-gates.yml` aggregate stay with **CS90 / CS90c**.

---

## Context

### The problem (#402)

GitHub's branch-protection offers exactly one native "was this reviewed?" knob:
`required_approving_review_count`. A solo-maintainer + agent repository cannot
satisfy it without one of three unsatisfying escape hatches:

1. A GitHub App / PAT that supplies an approving review (the
   `workboard-auto-approve.yml` bot path) — a shared secret with merge power.
2. A maintainer `gh pr merge --admin` bypass on every PR — which bypasses
   **all** protection, not just the approval.
3. Dropping the requirement to 0 — which removes the only review signal.

Yet the harness **already computes a stronger, machine-checkable review signal**
than a human thumbs-up: the `review-gates.yml` evidence jobs
(`review-log-evidence`, `copilot-review-attached`, `independence-invariant`,
`review-threads-resolved`) plus `read-only-gates` (`pr-evidence-lint.yml`).
#402 asks: let a repo enforce review via **that required status check** instead
of the native approval count — making review *stronger* while removing the
App/PAT/admin-bypass dependency.

### What already exists (recon at HEAD `232e5de`)

- **Ruleset source of truth:** `infra/main-protection-ruleset.json` — a GitHub
  ruleset document (`name`, `target`, `enforcement`, `conditions`, `rules[]`,
  `bypass_actors[]`). Today its single rule is `required_status_checks` whose
  `required_checks` are the four review-gate contexts. It encodes **no**
  `pull_request` rule, so `required_approving_review_count` is **not** managed
  by the harness today — it lives only in the live GitHub ruleset, hand-applied.
- **Ruleset generation:** `bin/harness.mjs` `syncReviewGateRuleset()` →
  `addReviewGateContextsToRuleset()` injects the four contexts into the source
  file during `harness sync` **when `reviews.enforce_gates === true`**. It
  writes the *file*; it never calls the GitHub API, and it does not detect drift
  against the *live* ruleset (only against the on-disk source).
- **Config blocks:** `review_gates` (`enabled`, `copilot_required`, `gate_set`)
  and `reviews` (`rubber_duck_model`, `fallback_model`, `enforce_gates`,
  `require_copilot_review`, …). The dep-free reader `lib/reviews-policy.mjs`
  reads the `reviews` subtree (schema-sourced defaults, fail-closed on malformed
  values).
- **Deadlock-safety is already achieved for the four contexts:** post-CS71 the
  `review-gates.yml` jobs always *run* and skip **internally** at the step level
  (`if: steps.wb.outputs.skip != 'true'`), so their status context is always
  *reported* (success), never absent/pending — including on workboard-only, bot,
  and fork PRs. `read-only-gates` likewise runs on every PR. This is why #402's
  premise (a safe always-green required context exists) holds **today**, and why
  CS109 has **no hard dependency** on CS90's aggregate.

### The subtlety this ADR must resolve

Today's self-host live state is effectively **"both"**: native
`required_approving_review_count = 1` **and** the four review-gate contexts are
required. So a naive `default: "human-approval"` that maps to "approval + gates
*advisory*" would, if it drove generation unconditionally, **weaken** self-host
(demote the required gates to advisory). Back-compat therefore cannot mean
"human-approval == today"; it must mean **"absent `enforcement` ⇒ generation
behaves exactly as it does today"** (i.e. `reviews.enforce_gates` alone governs
required-check injection; approval-count untouched by the harness). The enum
only changes generation when a repo **opts in** by setting it explicitly.

---

## Decision

### D1 — New optional `review_gates.enforcement` enum (F1)

Add an optional string enum `review_gates.enforcement` to
`schemas/harness.config.schema.json` with values:

```text
human-approval | required-check | both
```

**Placement:** under the existing `review_gates` block (per #402 / the CS109
plan), NOT under `reviews`. Rationale: `review_gates` is the "what does the PR
gate set look like" surface; `reviews` is the orchestrator-side
`harness review` reviewer-model/timeout surface. Enforcement posture is a
property of the gate set, so it belongs with `review_gates`. The reader is
extended in `lib/reviews-policy.mjs` (already dep-free and schema-default-driven,
imported by the PR-side gate scripts) so both `reviews.*` and
`review_gates.enforcement` resolve through one fail-closed reader.

**Default and back-compat (schema `default` vs generation trigger).** The schema
`default` is `"human-approval"` for documentation/discoverability, but
generation is **opt-in**: the ruleset renderer diverges from today's behavior
**only when `review_gates.enforcement` is explicitly present** in the config.
When the key is **absent**, `harness sync` continues exactly as today
(`reviews.enforce_gates` governs required-check injection; the harness does not
manage `required_approving_review_count`). This makes the change strictly
additive and non-breaking (SemVer **minor**) and prevents a silent demotion of
any existing consumer's required gates.

### D2 — Enforcement → ruleset mapping

When `review_gates.enforcement` is explicitly set, `harness sync` /
`harness ruleset` render `infra/main-protection-ruleset.json` as:

| `enforcement`    | `required_approving_review_count` | review-gate contexts in `required_checks` | Meaning |
|------------------|-----------------------------------|-------------------------------------------|---------|
| `human-approval` | `1`                               | **not** required (advisory only)          | Native GitHub approval is the gate; CI review-evidence is advisory. |
| `required-check` | `0`                               | **required**                              | The review-evidence check is the gate; no human approver / App / PAT / admin-bypass needed. |
| `both`           | `1`                               | **required**                              | Belt-and-braces: a human approval **and** the review-evidence check. |

To manage the approval count, the renderer adds/updates a `pull_request` rule
(GitHub ruleset `type: "pull_request"`,
`parameters.required_approving_review_count`) alongside the existing
`required_status_checks` rule. `human-approval`/`both` set it to `1`;
`required-check` sets it to `0`. The four review-gate contexts are added to
`required_checks` for `required-check`/`both` and removed for `human-approval`.

### D3 — `harness ruleset apply` / `harness ruleset check` (F2)

Add a new subcommand `ruleset` with two actions:

- **`harness ruleset check`** — read-only. Render the expected ruleset from
  config (D2), fetch the live ruleset via
  `gh api repos/{owner}/{repo}/rulesets/{id}` (or the `--ruleset-id` / config
  `reviews.ruleset_id` pointer), and **diff** them. Exit non-zero on drift
  (fail-closed on API/parse error). This is safe on every tier and is the piece
  CS109 ships enabled.
- **`harness ruleset apply`** — dry-run by default (prints the diff);
  **`--apply` is required** to PUT the rendered ruleset to the live API. `apply`
  without `--apply` never mutates. `apply --apply` is the only action that
  changes live branch protection and is gated by **G109-ruleset-apply** for the
  self-host repo.

`harness ruleset` reuses the existing renderer helpers
(`ensureRulesetRequiredChecksObject`, `addReviewGateContextsToRuleset`, plus a
new approval-count helper) so the source file and the verb never diverge.
`check` is additionally wired into `harness sync --mode=check` drift reporting
as an advisory, so a source-vs-live divergence surfaces in normal validation.

### D4 — F3 deadlock-risk guard (a `harness lint` check)

Add a linter that reads `infra/main-protection-ruleset.json` `required_checks`
and cross-references each context against the workflow jobs that produce it. It
**warns** (does not hard-fail, to avoid a chicken-and-egg block) when a required
context is produced by a job that can be **skipped at the job level**
(`if:` on the job, or a `paths:`/`branches:` filter) — because a job-level skip
leaves the required context perpetually *pending* → **deadlock**. The four
harness review-gate contexts pass (they are step-gated, never job-gated). The
guard protects a consumer who marks a genuinely skippable context as required.

### D5 — F4 posture-coherence guard (a `harness lint`/`doctor` check)

Add a check that **warns** when `review_gates.enforcement` is `required-check`
or `both` **and** the repo's documented merge path still relies on
`gh pr merge --admin` (admin bypass). `--admin` bypasses required *checks*, not
only approvals, so admin-merging under a `required-check` posture makes the gate
**decorative**. Detection is documentary (config + a known-admin-merge marker),
warning-level, and points at the reversibility steps in F5.

### D6 — Scope split (resolves the plan's open question)

F1–F5 exceed one safe CS. This ADR **recommends** the following split, to be
ratified at G109-adr:

- **CS109 (this CS):** D1 (config + schema + reader), D2 (renderer mapping),
  **`harness ruleset check`** (read-only drift, D3), D4 (deadlock guard), D5
  (coherence guard), F5 docs, and tests. All additive/safe; nothing mutates a
  live ruleset; default-absent behavior is unchanged.
- **CS109a (follow-up, filed by CS109 close-out):** **`harness ruleset apply
  --apply`** (live GitHub-API mutation) + the self-host posture selection. This
  is the high-blast-radius piece; it is gated by G109-ruleset-apply and
  coordinates with **CS106** (the concrete self-host required-check + count-0
  flip). Splitting keeps the irreversible live-mutation path in its own
  reviewed, user-approved CS.

If the maintainer prefers a single CS at G109-adr, `apply --apply` still ships
behind its explicit flag + G109-ruleset-apply; the split is a risk-bounding
recommendation, not a hard requirement.

### D7 — User-approval gates

- **G109-adr** (this ADR): accept the posture model (D1–D6) before any
  implementation lands.
- **G109-ruleset-apply**: approve the default posture and any self-host
  live-ruleset change before `harness ruleset apply --apply` runs against the
  self-host repo.

---

## Consequences

**Benefits:**

- A solo-maintainer + agent repo can drop the unsatisfiable
  `required_approving_review_count` to 0 while making review *stronger* (the
  machine-checked evidence gate becomes the required check).
- Workboard/bookkeeping PRs merge with **no** App, PAT, or admin-bypass — the
  step-gated evidence contexts already report green on them (post-CS71), so
  requiring the check does not deadlock those classes.
- The ruleset becomes harness-managed and drift-checked (`ruleset check`),
  closing today's "hand-authored, hand-applied, nothing verifies live state"
  gap.
- Strictly additive: absent `enforcement` ⇒ zero behavior change; the schema
  addition + new subcommand are SemVer **minor**.

**Costs / risks:**

- Branch-protection mutation (`apply --apply`) is high-blast-radius and hard to
  reverse — a mis-rendered required context can deadlock every PR. Mitigated by
  dry-run-first, the explicit `--apply` flag, G109-ruleset-apply, and the D6
  split that isolates live mutation in CS109a.
- The `human-approval` mapping (gates advisory) is *weaker* than today's
  self-host state; this is why the default is opt-in (absent ⇒ unchanged) and
  self-host, when it adopts the field, selects `both` or `required-check`, never
  the bare default.
- The coherence guard (D5) can only *warn* — it cannot prevent a maintainer from
  admin-merging — so it is advisory documentation, not enforcement.

**CHANGELOG expectation:** one `[Unreleased]` / `Added` entry for the optional
`review_gates.enforcement` field and the `harness ruleset` subcommand (minor,
non-breaking). The orchestrator owns that edit at close-out.

## Related ADRs

- **[ADR 0001](0001-file-classes.md)** — the schema-first `harness.config.json`
  model this field extends.
- **[ADR 0003](0003-constraints-field.md)** — precedent for an optional additive
  config field driving init/sync behavior (tier detection).
- **[ADR 0004](0004-copilot-graphql-spike.md)** — the hardened Copilot
  reviewer-attachment path whose evidence gate becomes the required check here.
- **ADR 0005** (CS90, in flight) — CI-gate drift/layering doctrine; a future
  single-context `review-gates.yml` aggregate (CS90c) would be a cleaner
  required context than the four individual contexts and should be preferred if
  it lands.

## Cross-references

- **CS106** — the concrete self-host required-check + `required_approving_review_count = 0`
  flip (a specific instance of `enforcement: required-check`); CS109 is the
  generalized surface, CS106 must not be re-implemented here.
- **#402** — the inbound feature request (F1–F5) this ADR designs.
