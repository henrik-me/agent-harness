# ADR 0005 — CI-gate architecture: drift-detection / review-gate layering

**Status:** Accepted (user-approval gate G90-1 granted 2026-07-05)
**Date:** 2026-07-05
**Linked CS:** [CS90](../../project/clickstops/active/active_cs90_ci-drift-review-gate-layering.md)
**Linked issues:** [#391](https://github.com/henrik-me/agent-harness/issues/391), [#392](https://github.com/henrik-me/agent-harness/issues/392), [#393](https://github.com/henrik-me/agent-harness/issues/393)
**Authored by:** yoga-ah (claude-opus-4.8)

---

## Status

**Accepted** — user-approval gate G90-1 was granted 2026-07-05. This ADR codifies decisions **C90-1 … C90-5** from the
[CS90 plan](../../project/clickstops/active/active_cs90_ci-drift-review-gate-layering.md)
and is a **hard prerequisite** for the three implementation sub-clickstops
(CS90a / CS90b / CS90c, per C90-6). Per C90-6, **no workflow, schema, or CLI
code lands under CS90 itself** — this document is CS90's sole substantive
deliverable, alongside the sub-CS filings. The layering model and the
CS90a/b/c breakdown are gated on user approval **G90-1** before any sub-CS is
claimed; **G90-1 was granted on 2026-07-05, so this ADR is now Accepted and CS90a/b/c are claimable.**

---

## Context

The harness ships four distinct CI/drift/review mechanisms as managed-template
workflows plus one recommended-but-unshipped pattern. A consumer adopting the
harness today must **hand-assemble** these layers with no authoritative guide
to how they **compose** — which aspect each guards and where they genuinely
overlap. Without that guide a consumer can easily stack two gates that do
substantially the same work, paying double CI cost and double failure surface
for one unit of protection.

The problem surfaced concretely in the `henrik-me/sub-invaders` **v0.12.0**
CI-adoption evaluation, which spawned three coupled inbound issues (all
**OPEN**; #392/#393 cite v0.12.0 explicitly, #391 is the general
drift-layering ask):

- **[#391](https://github.com/henrik-me/agent-harness/issues/391)** — *lightweight
  per-PR `sync --mode=check` drift gate as the baseline; position
  harness-drift.yml as low-activity belt-and-suspenders.* The simplest,
  highest-signal pattern (a per-PR required drift check) is left for each
  consumer to hand-author; the shipped `harness-drift.yml` cron catches drift
  up to seven days late.
- **[#392](https://github.com/henrik-me/agent-harness/issues/392)** — *harness-pr-check
  `pr_check.mode` (drift-only) + warn when consumer CI already runs harness
  lint/sync-check.* `harness-pr-check.yml` runs **`harness lint` and** a
  managed/composed-drift classifier in one job, so a consumer that already
  runs `harness lint` inline gets a redundant second lint — which blocks
  adoption of the workflow's genuinely useful managed-drift classifier plus
  its `harness-managed-edit-ack` escape valve.
- **[#393](https://github.com/henrik-me/agent-harness/issues/393)** — *review-gates.yml
  feature parity (mutation-engage, bot/fork skip-reasons, aggregate mode) +
  a migration path from pr-evidence-lint.yml.* The split per-gate
  `review-gates.yml` drops three capabilities its aggregate predecessor
  `pr-evidence-lint.yml` has, and offers no documented migration path off the
  aggregator.

Because the three issues are mutually referential, they are resolved as one
coherent design pass. The unifying deliverable is this layering ADR. The
layers are **not a menu to pick one from** — they guard different aspects of
the product/operational cycle and mostly **compose**. The ADR's job is to make
that composition explicit: which aspect each layer guards, the **one** place a
consumer consolidates rather than composes (the two L4 workflows — the same
review-process aspect, but **not** identical today, so consolidate only via
CS90c's migration mapping), and the **one** redundancy to avoid (running the
same check twice) — and to fix the required shapes for the concrete sub-CS
changes.

### Current behaviour of each mechanism (as read at CS90 authoring time)

The claims below are grounded in the workflow files and CLI as they exist in
this repo at authoring time; a sub-CS that changes any of them updates this
section.

| Mechanism | File | Trigger (current) | Job(s) | In self-host `managed.files`? |
|---|---|---|---|---|
| Weekly drift cron | [`harness-drift.yml`](../../template/managed/.github/workflows/harness-drift.yml) | `schedule: cron "0 6 * * 1"` (Mon 06:00 UTC) + `workflow_dispatch` | `drift-check` | Yes |
| PR-time structural gate | [`harness-pr-check.yml`](../../template/managed/.github/workflows/harness-pr-check.yml) | `pull_request` → `main` (opened/synchronize/reopened/edited/labeled/unlabeled) | `structural-gate` | **No** |
| Split review-evidence gates | [`review-gates.yml`](../../template/managed/.github/workflows/review-gates.yml) | `pull_request` → `main` (opened/synchronize/reopened/edited/labeled/unlabeled) | `validate-workboard-only-scope` (guard) + 4 gates | Yes |
| Aggregate review-evidence gate | [`pr-evidence-lint.yml`](../../template/managed/.github/workflows/pr-evidence-lint.yml) | `pull_request` → `main` + `pull_request_review: [submitted]` + `workflow_dispatch` | `read-only-gates` + `mutation-engage` | Yes |

---

## Decision

Define a **four-layer model** whose layers **compose** — each guards a
different aspect (drift, audited managed-file edits, the review process), so a
repo runs the layers whose aspects it needs rather than picking one from a
menu. The ADR names the single point where a consumer consolidates rather than
composes (the two L4 workflows target the same aspect but are **not** identical
today — consolidate only via CS90c's migration mapping) and the single
redundancy to avoid (the same check run twice). The per-decision summary:

| # | Decision | Maps to |
|---|---|---|
| D5-1 | Adopt the four-layer model (L1–L4) below as the authoritative CI/drift/review-gate architecture; frame it as **composition** (each layer guards a different aspect), naming the one consolidation point (L4's two workflows — same aspect, not identical today; consolidate via CS90c's migration mapping) and the one redundancy to avoid (the same check run twice). | C90-1 |
| D5-2 | Ship L1 as a **documented `ci.yml` job snippet**, not a new managed workflow; record the L1-vs-L3 drift-semantics difference (L1 is strictly stricter). | C90-2 |
| D5-3 | L3 gains a `pr_check.mode` (`drift-only` vs `lint+drift`) so a consumer that lints inline can adopt the classifier + escape valve without a redundant lint (implemented in CS90b). | C90-3 |
| D5-4 | The `mutation-engage` engagement job ported into L4's `review-gates.yml` MUST hold the least-privilege posture recorded below (implemented in CS90c). | C90-4 |
| D5-5 | A documented old→new required-status-context mapping is the migration MVP; a `harness migrate-ci` helper is a separate follow-up CS, filed only if the manual mapping proves insufficient. | C90-5 |

### The four layers

#### L1 — per-PR `harness sync --mode=check` (RECOMMENDED baseline)

**What.** A required per-PR job that runs `harness sync --mode=check` against
the consumer repo. `sync` defaults to check mode and `check` is a read-only
alias for `sync --mode=check`; the command exits `1` when any drift is
detected and `0` when the tree matches the pinned template.

**When.** This is the recommended **baseline** for every consumer. It closes
drift at PR time — before merge — rather than up to a week later.

**How it ships (C90-2).** L1 is delivered as a **documented `ci.yml` job
snippet**, NOT a new managed workflow. Shipping a fourth managed workflow
would add a file every consumer must adopt and keep in sync; a snippet a
consumer pastes into their existing `ci.yml` is **zero adoption cost**. The
canonical, hardened snippet (ref-derivation + allowlist validation mirroring
the existing `harness-drift.yml` `derive-ref` step) is authored under
**CS90a**; the illustrative form below is the shape it takes.

```yaml
# .github/workflows/ci.yml — add this job UNDER the `jobs:` map of your
# existing CI workflow (the 2-space indent below is relative to `jobs:`).
# Pin <ref> to the harness version this repo tracks (harness.config.json
# "version"), e.g. v0.12.0. SHA-pin the actions per your security policy.
  harness-sync-check:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0
        with:
          node-version: '20'
      - name: harness sync --mode=check (L1 drift gate)
        run: npx -y "github:henrik-me/agent-harness#<ref>" sync --mode=check --cwd .
```

The one-liner above mirrors the `check-drift` step of the shipped
`harness-drift.yml` (which invokes
`npx -y "github:henrik-me/agent-harness#${CLI_REF}" sync --mode=check --cwd .`).
Repos that hit the npm 10.8.x GitFetcher flakiness noted in
[`OPERATIONS.md`](../../OPERATIONS.md) should instead use the
clone-then-run pattern (`git clone` the harness at the pinned ref, `npm ci`,
then `node <harness>/bin/harness.mjs sync --mode=check --cwd .`) exactly as
`review-gates.yml` and `pr-evidence-lint.yml` already do, pinning
`npm install -g npm@10.9.2` first. **CS90a** owns the final canonical snippet
including the shell-injection-hardened ref derivation (CS12 R1); it now lives in
the consumer-facing guide [`docs/ci-drift-layering.md`](../ci-drift-layering.md)
(this block remains illustrative).

#### L2 — weekly `harness-drift.yml` cron (belt-and-suspenders)

**What.** The shipped `harness-drift.yml` — its header describes it as
"scheduled drift detection per CS12 / LRN-074." It runs weekly, calls
`harness sync --mode=check`, and **on drift (exit 1)** runs
`sync --mode=apply` and opens a fix PR via `peter-evans/create-pull-request`;
it skips the PR when there is no drift. Any other exit code fails the workflow
loudly. It holds `contents: write` + `pull-requests: write` (it must, to open
the auto-fix PR).

**When.** L2 is repositioned explicitly as **belt-and-suspenders for
low-activity repos** — repositories that merge rarely, where a per-PR gate
fires seldom and a scheduled sweep still catches template drift that landed
without a PR. Its **behaviour is unchanged** by this ADR; only its positioning
changes. The header/doc edit that records this repositioning lands under
**CS90a**.

**Redundancy note.** A high-activity repo that runs L1 on every PR gains
little from L2's weekly sweep and keeps L2's auto-fix-PR mainly as a safety
net. A low-activity repo may value L2 especially — a scheduled sweep still
catches drift that landed without a PR — but L2 remains a sweep / safety net,
**not** a substitute for L1 when PR-time drift gating is wanted (see
"Composition, not a menu" below).

#### L3 — `harness-pr-check.yml` managed-drift classifier + escape valve

**What.** The shipped `harness-pr-check.yml` — its header describes it as the
"consumer PR-time structural gate (CS63a / decision C63-2)." Its single
`structural-gate` job runs **`harness lint` and** the file-class drift
classifier
[`scripts/check-managed-drift.mjs`](../../scripts/check-managed-drift.mjs),
failing the PR when a `managed`/`composed` template file has diverged. It ships
the **`harness-managed-edit-ack` escape valve**: a PR carrying both the
`harness-managed-edit-ack` label and a `Harness-managed-edit:` justification
line in its body downgrades a managed-drift failure to a surfaced warning —
never a silent skip. It is default-on for a fresh `init` and opts out via
`pr_check.enabled: false`.

**When.** L3 is for consumers who want the **managed/composed-drift
classifier + escape valve** specifically — the ability to intentionally,
auditably diverge a managed file when justified. It is **not** in the
self-host's own `managed.files`.

**The #392 redundancy and its fix (C90-3).** Because the `structural-gate`
job runs `harness lint` *in addition to* the classifier, a consumer that
already runs `harness lint` in its own CI pays for a **second, redundant
lint** just to obtain the classifier + escape valve. (Note: L1's
`sync --mode=check` and `harness lint` are **distinct** — `sync --mode=check`
verifies template drift, `harness lint` runs the linters — so L1 does **not**
subsume the lint; the #392 redundancy is specifically the doubled `harness
lint` run for a consumer that already lints inline.) **CS90b** adds `pr_check.mode ∈ {lint+drift
(default), drift-only}` to `harness-pr-check.yml` and
[`schemas/harness.config.schema.json`](../../schemas/harness.config.schema.json):
in `drift-only` the job runs the managed-drift classifier + escape valve but
**not** `harness lint`. CS90b also adds an adoption-overlap **warning** (in
`harness sync` or a `harness doctor`) when the consumer's own workflows
already invoke `harness lint` / `sync --mode=check`. This ADR does not
prescribe schema field types beyond naming `pr_check.mode`; the schema change
is CS90b's deliverable (schema-is-source-of-truth).

#### L4 — `review-gates.yml` / `pr-evidence-lint.yml` (review-evidence enforcement)

**What.** Two workflows enforce REVIEWS.md evidence on a PR:

- **`review-gates.yml`** (name `review-gates`) is the **split per-gate**
  evolution. It runs one guard job, `validate-workboard-only-scope`, plus
  **four** enforcement gates — `review-log-evidence`,
  `copilot-review-attached`, `independence-invariant`, and
  `review-threads-resolved` — each a separate required status context. The
  four gates skip **only** on the `workboard-only` condition (the label, or a
  path-derived diff confined to the workboard allowlist).
- **`pr-evidence-lint.yml`** (name `pr-evidence-lint`) is the **aggregate**
  predecessor. Its single `read-only-gates` job runs the read-only assertions
  (B1/A3/A4/A6) plus the Copilot review gate (A5/A16) behind **one** required
  status context, and it carries a second `mutation-engage` job.

**When.** L4 is for consumers who enforce the harness review process (Copilot
review attached, review-log evidence, reviewer/implementer independence,
threads resolved). The two workflows are **not** interchangeable today — their
check sets differ (the split gates do not cover B1/A4/A5/A6), so the self-host
runs both for full coverage. Consolidating to a single L4 workflow is what
**CS90c**'s parity work + migration mapping (below) enables; do it through that
mapping — favouring the aggregate mode — not a blind swap.

**The #393 parity gap (C90-4 / C90-5).** `review-gates.yml` today drops three
things `pr-evidence-lint.yml` provides: (1) the `mutation-engage`
Copilot-engagement job; (2) the full **bot-author + fork-source** skip-reason
set (today `review-gates.yml` skips only on `workboard-only`, so Dependabot
and fork PRs false-fail the review gates); and (3) an optional single-context
aggregate mode. **CS90c** ports this parity (see the least-privilege posture
and migration mapping below).

---

## Composition, not a menu: which layers to run

**The four layers are not a menu to pick one from — they guard different
aspects of the product/operational cycle and mostly _compose_.** A repo that
wants full protection runs several together; each layer guards a distinct
concern:

| Layer | Distinct aspect it guards | When it fires |
|---|---|---|
| **L1** — per-PR `sync --mode=check` | Template **drift**, caught at merge time | Every PR |
| **L2** — weekly `harness-drift` cron | Template **drift** on a schedule, and it **auto-opens a fix PR** | Weekly (+ manual dispatch) |
| **L3** — `harness-pr-check` classifier + escape valve | **Intentional, audited** managed/composed-file edits (the `harness-managed-edit-ack` escape valve) | Every PR |
| **L4** — `review-gates.yml` / `pr-evidence-lint.yml` | The **review process** (Copilot review present, review-log evidence, reviewer/implementer independence, threads resolved) — orthogonal to drift | Every PR |

L1 (drift at PR time) and L4 (review process) guard clearly different things
and are both worth running. L2 and L3 add distinct **capabilities** on top —
L2's scheduled auto-fix PR, L3's audited escape valve — while their
drift-scanning portions overlap L1.

**Beyond composing, there are only two narrow things to get right — one
consolidation and one de-duplication:**

1. **L4 is where you _consolidate_, not compose — and only via a migration
   mapping, never a blind swap.** Both L4 workflows target the same **aspect**
   (the review process), so running both permanently is not the intended
   end-state. But they are **not identical today**: `pr-evidence-lint.yml`
   (aggregate) enforces commit-trailers (B1), model-audit independence (A3),
   stale-diff currency (A4), review ordering (A5), plan-review attestation (A6)
   and Copilot-review (A16); `review-gates.yml` (split) enforces review-log
   evidence, Copilot-review-attached, independence, and an explicit
   `review-threads-resolved` gate — so its four split contexts do **not**
   currently cover B1/A4/A5/A6. The self-host runs **both** today for full
   coverage. Issue #393 / **CS90c** is what makes consolidation to one workflow
   viable: it brings `review-gates.yml` toward parity (ports `mutation-engage`,
   the bot/fork skip-reasons, and an aggregate single-context mode) and ships a
   **migration mapping** documenting which check each context covers. So
   consolidate to one L4 workflow **through that mapping** — favouring the
   aggregate mode, which mirrors `read-only-gates`' full check set — because a
   blind swap to the four split contexts silently drops B1/A4/A5/A6. Until you
   have applied the mapping, running both is the safe (if heavier) posture, not
   a redundancy to "fix".

2. **Don't run the _same check_ twice — the only real redundancy.** It is
   specific and narrow:
   - **L3's internal `harness lint` vs your own inline `harness lint`.** L3
     (`harness-pr-check`) runs `harness lint` in addition to its drift
     classifier. If you already run `harness lint` as your own CI job, that is
     a duplicated lint — so adopt L3 in **`drift-only`** mode (CS90b) to keep
     the classifier + escape valve without the second lint. (L1's
     `sync --mode=check` runs **no** lint — it checks drift — so this
     duplication is only ever with your _own_ inline lint, never with L1.)
   - **L1's drift check vs L3's drift classifier.** Both scan for drift, so you
     keep L3 for its **escape valve**, not for a second drift scan (see the
     L1-vs-L3 drift-semantics note below).

**Everything else composes — it is not redundant.** Running L2 alongside L1
adds a scheduled sweep + auto-fix PR that L1's per-PR gate does not provide (L2
remains a sweep / safety-net, **not** a substitute for L1's merge-time gate).
Running L4 alongside L1/L2/L3 guards a different concern entirely (the review
process, not drift). So the posture is: **compose the aspects you need**,
consolidate L4 to a single implementation only through CS90c's migration
mapping (not a blind swap), and avoid only the same-check-twice duplication
above.

### The L1-vs-L3 drift-semantics difference (CRITICAL, C90-2)

**L1 is strictly stricter than L3's classifier.** This is the crux of why the
two must not be stacked blindly, and it is grounded in the code:

- **L1 — raw `sync --mode=check` fails on ANY drift, including
  seeded-file absence.** In check mode the sync engine sets
  `driftDetected = true` for a **seeded** file that is absent
  (`lib/sync.mjs`: `if (!isPresent && mode !== 'apply') driftDetected = true`
  in the seeded branch), and the CLI exits `1` whenever `driftDetected` is set
  in check mode (`bin/harness.mjs`). So an absent seeded scaffold file is a
  **failure** under L1.
- **L3 — the `check-managed-drift.mjs` classifier fails only on
  managed/composed drift.** Its `PROTECTED_CLASSES` set is exactly
  `{managed, composed}`; a **seeded** file that is absent is reported as an
  **advisory NOTE**, not a gate failure, and the classifier exits `0`
  (`scripts/check-managed-drift.mjs`).

Therefore **L1 ⊇ L3's drift coverage**: everything L3's classifier fails on
(managed/composed divergence) also fails L1, **plus** L1 additionally fails on
seeded-file absence that L3 deliberately tolerates. A consumer running L1
already has strictly stronger drift protection than L3's classifier provides;
L3's distinct value is the **`harness-managed-edit-ack` escape valve**
(auditable intentional divergence), not additional drift coverage. This is why
you add L3 for the escape valve — ideally in `drift-only`
mode — rather than for its drift half.

---

## Review-gates `mutation-engage` least-privilege posture (C90-4)

**CS90c** ports a `mutation-engage` Copilot-engagement job from
`pr-evidence-lint.yml` into `review-gates.yml`. The ported job **MUST** hold
the following least-privilege posture — the same posture
`pr-evidence-lint.yml`'s `mutation-engage` job holds today (and which
[`OPERATIONS.md`](../../OPERATIONS.md) records):

1. **`workflow_dispatch`-only trigger.** The engagement job runs **only** on
   `workflow_dispatch` (guarded by `if: github.event_name ==
   'workflow_dispatch'`). It never runs on the `pull_request` /
   `pull_request_review` events that drive the read-only gates.
2. **`pull-requests: write` on THAT job ALONE.** The engagement job holds
   `permissions: { contents: read, pull-requests: write }`; every **other**
   job's write scope must be minimized to `pull-requests: read` wherever the
   gate is verification-only. **Existing PR-event engagement path — CS90c MUST
   reconcile it.** `review-gates.yml`'s `copilot-review-attached` gate today
   holds `pull-requests: write` **and uses it**: on `pull_request` events, when
   no acceptable Copilot review is present,
   [`scripts/checks/check-copilot-review-attached.mjs`](../../scripts/checks/check-copilot-review-attached.mjs)
   posts a best-effort `@copilot review` comment via `gh pr comment` (its
   `postCopilotComment` helper). So `review-gates.yml` **already engages**
   Copilot on PR events — merely adding a `workflow_dispatch` `mutation-engage`
   job does **not** by itself yield a single `workflow_dispatch`-only
   engagement path. CS90c MUST therefore consolidate engagement: make
   `copilot-review-attached` **verification-only** (drop the auto-comment and
   its write scope) when `mutation-engage` is ported, so that exactly one job
   holds `pull-requests: write` and engagement happens only on
   `workflow_dispatch`.
3. **Validates `pr_number` refers to an OPEN PR in the SAME repo.** The job
   takes the target PR as a `workflow_dispatch` input and acts on it via
   `gh pr edit "$PR_NUM" --add-reviewer copilot-pull-request-reviewer` — which
   resolves within the workflow's own repository, so cross-repo mutation is
   structurally impossible. CS90c **MUST additionally add an explicit OPEN-PR
   guard** (belt-and-suspenders), so a dispatch against a closed/merged or
   nonexistent PR fails fast rather than relying solely on `gh pr edit`'s
   in-repo resolution.
4. **NEVER checks out or runs PR-head code.** The job checks out the base ref
   (no `ref:` override to a PR head) and runs only the `gh pr edit` mutation —
   it never executes PR-head code with the write token.

**Provenance of the posture.** Properties 1, 2 (the job-local write scope), and
4 mirror `pr-evidence-lint.yml`'s current `mutation-engage` job. Property 3's
explicit OPEN-same-repo guard, and the `copilot-review-attached`
verification-only reconciliation in property 2, are **NEW CS90c hardening** —
not existing behaviour of either workflow.

**Engagement is asynchronous (ADR-0004 / ADR4-8).** Copilot delivers a review
~3 minutes after engagement, so engage and verify **must** live on separate
events: `mutation-engage` requests the review on `workflow_dispatch`; the
verification gate re-runs on a later `pull_request` / `pull_request_review`
event. A single-run engage-and-verify always fails the verify step first.
**Trigger parity — CS90c MUST port `pull_request_review`.**
`pr-evidence-lint.yml` re-runs its gate on `pull_request_review: [submitted]`
(guarded to base `main`) precisely so a Copilot review submitted ~3 min after
engagement re-triggers verification without a manual rerun; `review-gates.yml`
today triggers **only** on `pull_request` (opened/synchronize/reopened/edited/
labeled/unlabeled), so CS90c MUST also port the `pull_request_review:
[submitted]` trigger with the same base-ref guard — otherwise an engaged review
leaves the gate stale/failed until an unrelated PR event or manual rerun. See
[ADR 0004](0004-copilot-graphql-spike.md) (ADR4-2, ADR4-8) for the spike
findings that fix the `gh pr edit --add-reviewer` engagement primitive and the
async lifecycle.

**Full skip-reason set to port.** `review-gates.yml` today skips only on
`workboard-only`. CS90c ports the full centralized skip-reason vocabulary that
`pr-evidence-lint.yml` computes from the event payload:

| Skip reason | Detected by | Why it must be ported |
|---|---|---|
| `workboard-only` | `workboard-only` label **or** a diff confined to the workboard path allowlist | Already present in `review-gates.yml`. |
| `bot-author` | PR author login matches `[bot]$` | Dependabot / app PRs otherwise **false-fail** the review gates. |
| `fork-source` | `head.repo != base.repo` | Fork PRs cannot request Copilot across forks and otherwise **false-fail**. |

**Optional single-context aggregate mode.** CS90c also adds an optional
**single-context aggregate mode** so a consumer can keep **one** required
status check (as `pr-evidence-lint.yml`'s `read-only-gates` provides) instead
of remapping branch protection to the four separate gate contexts. This is the
migration off-ramp for consumers who value a single required check.

---

## Migration mapping (#393 / C90-5)

A consumer migrating a branch-protection ruleset from the aggregate
`pr-evidence-lint.yml` to the split `review-gates.yml` must re-map their
required status-check contexts. The **default** migration path is this
documented mapping (the MVP). A `harness migrate-ci` helper (which would swap
the workflow in `managed.files` and print the exact ruleset context changes)
is a **separate follow-up CS**, filed **only** if this manual mapping proves
insufficient — it is **not** built under the CS90 arc by default (CS90 risk R5): a helper
is avoidable net-new CLI surface.

**Coverage caveat (read first).** The split `review-gates.yml` contexts are
**not** a drop-in replacement for the aggregate's check set: the four split
gates cover Copilot-review-attached, review-log evidence, independence (A3),
and threads-resolved, but do **not** cover commit-trailers (B1), stale-diff
currency (A4), review ordering (A5), or plan-review attestation (A6). A
**coverage-preserving** migration therefore targets L4's aggregate
single-context mode (CS90c) — which mirrors `read-only-gates`' full check set —
**not** the four split contexts alone. Swapping the required context from
`read-only-gates` to only the four split gates silently drops B1/A4/A5/A6.

**Old → new required-status-context mapping.**

| Old (aggregate: `pr-evidence-lint.yml`) | New (`review-gates.yml`) |
|---|---|
| `read-only-gates` — one context covering the read-only assertions (B1/A3/A4/A6) plus the Copilot review gate (A5/A16) | **Coverage-preserving:** L4's aggregate single-context mode (CS90c). The four split contexts (`review-log-evidence`, `copilot-review-attached`, `independence-invariant`, `review-threads-resolved`) cover A3/A16 + review-log + threads, but **not** B1/A4/A5/A6 — do not treat them as an equivalent replacement. |
| *(guard runs inside the aggregate job)* | `validate-workboard-only-scope` — guard job; runs only when the `workboard-only` label is present (add as required only if you enforce the workboard-only bypass guard) |
| *(single required check)* | **Or** keep a single required check by enabling L4's optional single-context aggregate mode (CS90c), avoiding the four-context remap entirely |

**Context-string caveat.** A required-status-check context is **not** simply
the job name — GitHub keys and displays these contexts as `<workflow> / <job>`
(e.g. `pr-evidence-lint / read-only-gates`, as
[`OPERATIONS.md`](../../OPERATIONS.md) references it), and the exact string can
vary (a job `name:` override changes it). When updating a ruleset, copy the
**exact** context string the ruleset UI shows for each check rather than
assuming a `<workflow> / <job>` or job-name-only format.

---

## The CS90a / CS90b / CS90c split (C90-6)

Plan review confirmed the combined implementation scope is too large for one
CS, so the split is **mandatory**. This ADR is a **hard prerequisite** for all
three sub-CSs; **no workflow, schema, or CLI code lands under CS90 itself**.

| Sub-CS | Issue | Layer | Scope (implemented under the sub-CS, not here) |
|---|---|---|---|
| **CS90a** | [#391](https://github.com/henrik-me/agent-harness/issues/391) | L1 (+ L2 repositioning) | The canonical per-PR `sync --mode=check` `ci.yml` snippet; `harness-drift.yml` header/doc repositioning as low-activity belt-and-suspenders (behaviour unchanged). |
| **CS90b** | [#392](https://github.com/henrik-me/agent-harness/issues/392) | L3 | `pr_check.mode ∈ {lint+drift, drift-only}` in `harness-pr-check.yml` + `schemas/harness.config.schema.json`; adoption-overlap warning; tests. |
| **CS90c** | [#393](https://github.com/henrik-me/agent-harness/issues/393) | L4 | `review-gates.yml` least-privilege `mutation-engage` + bot/fork skip-reasons + optional single-context aggregate mode; the migration mapping above; skip-reason-matrix test incl. bot/fork. |

Each sub-CS gets its own independent plan review and closes its issue. CS90c
in particular touches self-host-managed `review-gates.yml`, so it must land
with `sync` regeneration and a green self-host PR (CS90 R2).

---

## Consequences

**Benefits.**

- A consumer composes the layers/aspects it needs from one authoritative
  document instead of reverse-engineering four workflows.
- The L1-vs-L3 semantics note prevents the most likely mis-layering (stacking
  a redundant drift gate).
- The ported `mutation-engage` posture keeps Copilot engagement working in
  `review-gates.yml` without widening the privileged surface.
- The migration mapping de-risks moving off the aggregate gate with zero
  net-new CLI surface.

**Costs / follow-ups.**

- The four-layer model is a documentation contract the sub-CSs must keep
  accurate; a workflow change that invalidates a claim here updates this ADR.
- A `harness migrate-ci` helper remains a latent follow-up if the manual
  mapping proves insufficient in practice.

---

## Cross-references

- [CS90 plan](../../project/clickstops/active/active_cs90_ci-drift-review-gate-layering.md) — decisions C90-1 … C90-6, deliverables, risks.
- [`docs/ci-drift-layering.md`](../ci-drift-layering.md) — the consumer-facing L1 adoption guide (canonical hardened snippet) + L2 low-activity positioning (CS90a).
- [ADR 0004 — Copilot review GraphQL spike](0004-copilot-graphql-spike.md) — ADR4-2 (`gh pr edit --add-reviewer` engagement primitive), ADR4-8 (async engage/verify split) that the L4 `mutation-engage` posture builds on.
- [ADR 0001 — Three file classes for harness sync](0001-file-classes.md) — the managed/composed/seeded classes underpinning the L1-vs-L3 drift-semantics difference.
- [`harness-drift.yml`](../../template/managed/.github/workflows/harness-drift.yml) — L2.
- [`harness-pr-check.yml`](../../template/managed/.github/workflows/harness-pr-check.yml) — L3.
- [`review-gates.yml`](../../template/managed/.github/workflows/review-gates.yml) — L4 (split).
- [`pr-evidence-lint.yml`](../../template/managed/.github/workflows/pr-evidence-lint.yml) — L4 (aggregate; parity source).
- [`scripts/check-managed-drift.mjs`](../../scripts/check-managed-drift.mjs) — L3 classifier (`PROTECTED_CLASSES = {managed, composed}`).
- [`lib/sync.mjs`](../../lib/sync.mjs) / [`bin/harness.mjs`](../../bin/harness.mjs) — L1 `sync --mode=check` drift + exit-code semantics.
- [`schemas/harness.config.schema.json`](../../schemas/harness.config.schema.json) — where CS90b adds `pr_check.mode`.
- [`OPERATIONS.md`](../../OPERATIONS.md) — Copilot engagement procedure + `mutation-engage` least-privilege documentation.
- Issues: [#391](https://github.com/henrik-me/agent-harness/issues/391), [#392](https://github.com/henrik-me/agent-harness/issues/392), [#393](https://github.com/henrik-me/agent-harness/issues/393).
