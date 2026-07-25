# CS123 — Close the claim/close-out manual-completion gap (delivers the LRN-216 + LRN-204 tooling follow-ups)

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** omni-ah (orchestrator, `claude-opus-5`) on 2026-07-24, from a maintainer-requested repo evaluation ("faster … workflows"). Both halves are the tooling follow-ups that **LRN-216** and **LRN-204** explicitly recommend and leave `status: open`.
**Depends on:** **CS120** (HARD) — both CSs modify `lib/claim.mjs`. CS120 adds the shipped-work preflight and `--allow-shipped` persistence; CS123 adds field scaffolding. CS120 lands first and CS123 rebases; they must not be dispatched to parallel sub-agents (silent file race, LRN-016).

## Goal

Make `harness claim --apply` and `harness close-out --apply` leave the tree **lint-green**, eliminating the hand-editing step that every clickstop currently pays twice.

## Background

Two open learnings describe the same defect shape — a lifecycle verb that does most of a transition and leaves the rest to the operator, where the omission is only caught later (or not at all):

- **LRN-216** (`LEARNINGS.md:175-193`, open, `claim_area: claim`). `harness claim <CS> --apply` performs only the `git mv` (planned→active) plus the WORKBOARD row insert. It does **not** flip `**Status:**` planned→active, fill `**Owner:**`/`**Branch:**`/`**Started:**`, add the `## Model audit` section, or replace the `## Tasks` placeholder — so the just-claimed `active/` file **fails `harness lint`** (`check-clickstop` + `check-clickstop-implementer-not-reviewer`). Evidence: CS90. Disposition names the fix: *"Candidate follow-up: `harness claim --apply` could scaffold these fields."*
- **LRN-204** (`LEARNINGS.md:415-433`, open, `claim_area: orchestrator`). For directory-form clickstops, `harness close-out --apply` renames the directory but not the **inner** plan file, and does not flip its `**Status:**`/`**Closed:**`. A botched close-out (`done_cs65_…/` still containing `active_cs65_….md` with `**Status:** active`) survived CI unnoticed from 2026-07-02 until CS75's recursion guard caught it. Disposition names the fix: *"recommend a follow-up CS to make `harness close-out --apply` rename the inner plan file + flip its Status for directory-form CSs."*

**Correction established during plan review:** the gap is **wider than LRN-204 states**. `applyCloseoutPlan` (`lib/closeout.mjs:503-558`) performs only (a) the `git mv` and (b) the WORKBOARD Active-Work row removal — it flips `**Status:**` and sets `**Closed:**` for **neither** the flat form nor the directory form. An earlier draft of this plan wrongly assumed the flat form already handled the status flip and scoped the fix to directory-form inner files; that would have left every flat close-out still lint-broken. Both forms need the field updates; the directory form additionally needs the inner-file rename.

Why this is the right speed investment: the three-PR shape (`OPERATIONS.md:124-144`) means the claim and close-out PRs are **mechanical bookkeeping**, yet each currently requires hand-editing before its own lint passes. That is per-clickstop toil with a known, bounded fix — unlike the larger question of reducing the PR count itself, which is a process-posture change (see C123-6).

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C123-1 | Preserve the no-commit invariant | `claim --apply` and `close-out --apply` continue to **never commit and never push** — they only extend what they write to the working tree | The no-commit property is a deliberate safety design (`OPERATIONS.md:210-220`) and a hard rule for sub-agents. This CS makes the verbs *more complete*, not more autonomous. |
| C123-2 | Claim scaffolding scope | `claim --apply` fills `**Status:** active`, `**Owner:**` (from `harness whoami`), `**Branch:**` (the **content** branch `cs<NN>/content` recorded on the claim plan, *not* the `cs<NN>/claim` branch that is checked out at claim time), `**Started:**` (UTC date), scaffolds `## Model audit`, and replaces the `## Tasks` placeholder with the close-out + CHANGELOG-touch rows `check-clickstop` requires | Exactly the set LRN-216 enumerates. The branch value follows repo convention: closed records carry `cs111/content`, `cs113/content`. |
| C123-3 | `## Model audit` completion **with validation** | `claim --apply` **requires `--implementer-models <csv>`**. Each entry must be a bare model id matching `/^[A-Za-z0-9._-]+$/`, non-placeholder, and de-duplicated; the independence predicate (implementer ∌ reviewer, plus the HIGH-RISK rule for high-risk CSs) is evaluated **before any repository mutation — including `runner.createBranch()`** — and a violation aborts leaving branch, CS file path, CS file contents, and WORKBOARD entirely unchanged. `Reviewer model` is derived from `reviews.rubber_duck_model`; `Implementer agent` from `harness whoami`; `Reviewer agent` from `DEFAULT_REVIEWER_AGENT` (`lib/review.mjs:26`, currently `rubber-duck`) unless a configured override exists | Requiring a CSV alone does not guarantee honest evidence — "write verbatim" would still admit malformed ids, placeholder text, duplicates, or a value overlapping the derived reviewer, reproducing the parser weakness this decision exists to avoid. Branch creation is itself a repository mutation, so validating after it would leave a stray branch behind on failure; validating first keeps the verb's failure genuinely atomic. |
| C123-4 | Close-out scope | `close-out --apply` sets `**Status:** done` + `**Closed:** <UTC date>` for **both** the flat and directory forms; the directory form **additionally** renames the inner plan file `active_csNN_<slug>.md` → `done_csNN_<slug>.md` | Corrects the wider gap found in review: `applyCloseoutPlan` currently does neither field update for either form. Scoping to directory-form only (as LRN-204 literally reads) would leave flat close-outs lint-broken. |
| C123-5 | Partial-state repair | `close-out --apply` must recover the specific partial state where the **outer directory was already renamed** but the inner file still reads `active_…` / `**Status:** active` — the exact CS65 breakage — rather than erroring on "destination exists" | The current done-directory lookup rejects that state, so a generic idempotency test would pass without proving recovery. This is the real-world failure mode LRN-204 documents, so it needs explicit logic and its own fixture. |
| C123-6 | Idempotency | Both verbs are safe to re-run: already-correct fields are left alone, and a partially-hand-edited file is completed, not overwritten. Only exact placeholder tokens (`—`, `(populated at claim time per § Claim)`) are treated as fillable | Operators today hand-fix these files; a verb that clobbers manual edits on re-run would be worse than the current gap. |
| C123-7 | Out of scope — the three-PR shape | Reducing the claim/close-out PRs (folding them together, or auto-merging them via the existing `workboard-auto-approve` path) is **not** in this CS | It is a process-posture change touching branch protection and review evidence, adjacent to CS106/#402. Worth doing, but it needs its own plan review and maintainer decision — see G123-2. |
| C123-8 | Out of scope — `harness review` copy/paste | Automating the rubber-duck stdin paste (`bin/harness.mjs:4119-4198`) is not in this CS | It is the single largest per-CS latency source, but it requires a model-invocation transport the harness deliberately does not have today (zero runtime deps, no network). Genuinely separate design work. |
| C123-9 | Learnings disposition | Flip **LRN-216** and **LRN-204** to `status: closed`, citing the shipped verbs. For LRN-204, **preserve its original Problem/Finding/Evidence and prior disposition text verbatim** and **append** a dated correction noting the defect was wider than recorded (both forms, not just directory-form inner files) | Both are open solely because the tooling follow-up was unbuilt; shipping it is the disposition. Rewriting LRN-204's original wording would violate the no-history-rewrite rule — the learning is evidence of what was known at the time. Appending a dated correction records the truth without erasing the record. |

## Deliverables

1. `lib/claim.mjs` (+ `bin/harness.mjs`) — scaffolding per C123-2/C123-3/C123-6, including the new required `--implementer-models <csv>` argument.
2. `lib/closeout.mjs` — `**Status:** done` + `**Closed:**` for **both** forms, directory-form inner-file rename, and partial-state repair per C123-4/C123-5/C123-6.
3. Tests: claimed file passes `harness lint` with **no hand-editing** (the LRN-216 regression test); `--implementer-models` required, validated (malformed id, placeholder text, duplicate entry, and overlap-with-reviewer each rejected), and for every invalid case asserting **no branch was created, no rename occurred, and neither the CS file nor WORKBOARD changed**; valid input written verbatim; all four `## Model audit` rows populated; `**Branch:**` populated as `cs<NN>/content`; **flat-form** close-out sets Status/Closed; **directory-form** close-out renames the inner file and sets Status/Closed; the outer-renamed/inner-stale partial state is repaired (the CS65 fixture); idempotent re-run of both verbs preserves manual edits.
4. `OPERATIONS.md` § Claim / § Close-out — remove the now-obsolete "hand-populate after `--apply`" guidance, document the new `--implementer-models` argument and its validation, and state the new post-conditions (+ composed mirror in lockstep).
5. `LEARNINGS.md` — LRN-216 flipped to closed; LRN-204 flipped to closed with its original text preserved and a dated correction appended per C123-9.
6. `CHANGELOG.md` `[Unreleased]` entry (**Minor** — `claim --apply` gains a required argument, which is a CLI behaviour change for any existing caller; call this out as an adoption note).

## User-approval gates

- **G123-1:** C123-3 makes `--implementer-models` a **required** argument of `claim --apply`, changing an existing CLI contract. Confirm with @henrik-me, including whether pre-filling `Reviewer model`/`Reviewer agent` from policy is acceptable on the independence-invariant surface.
- **G123-2:** if @henrik-me wants the three-PR shape itself reduced (C123-7), that should be filed as its own CS; flag the decision rather than absorbing it here.

## Exit criteria

1. `harness claim <CS> --apply --implementer-models <csv>` on a clean tree yields an `active/` file that passes `harness lint` with zero manual edits, with `**Branch:**` = `cs<NN>/content` and all four `## Model audit` rows populated; invalid or overlapping input aborts **before branch creation**, leaving branch, CS path, CS contents, and WORKBOARD unchanged.
2. `harness close-out --apply` sets `**Status:** done` + `**Closed:**` for the flat form **and** the directory form, and renames the directory form's inner plan file.
3. The outer-renamed/inner-stale partial state (CS65 shape) is repaired rather than erroring.
4. Re-running either verb is a no-op and preserves manual edits (C123-6).
5. `node --test` 0 fail; `harness lint` 0 fail; `sync --mode=check` no drift.
6. LRN-216 + LRN-204 dispositioned; plan-vs-implementation review Go before close-out.

## Risks + open questions

| # | Risk / what breaks | Mitigation |
|---|---|---|
| R1 | Scaffolded `## Tasks` rows are generic and become box-ticking rather than real planning. | Scaffold only the rows `check-clickstop` structurally requires (close-out + CHANGELOG-touch), leaving deliverable rows as explicit fill-in placeholders — structure automated, thinking not. |
| R2 | Pre-filling the reviewer model/agent (C123-3) weakens independence evidence if the actual review used a different model. | The value is derived from policy and must still be corrected if the review deviates; the existing `check-review-log-evidence` + independence gates continue to validate the *actual* review against the PR body. G123-1 confirms the posture. The implementer side is never guessed (C123-3 requires it as an argument). |
| R3 | Verb changes collide with CS120's claim preflight. | Declared as a HARD dependency in the header: CS120 lands first, CS123 rebases. Do not dispatch both to parallel sub-agents (shared ownership of `lib/claim.mjs`). |
| R4 | Idempotency logic misidentifies a hand-edited value as a placeholder and overwrites it. | C123-6 is regression-tested with a partially-hand-edited fixture; only exact placeholder tokens (`—`, `(populated at claim time per § Claim)`) are treated as fillable. |
| R5 | The claim verb gains enough behaviour that its no-commit safety property becomes less obvious to future agents. | C123-1 keeps the invariant and it is restated in the OPERATIONS post-conditions (deliverable 4). |
| R6 | Making `--implementer-models` required breaks any existing script or agent habit that calls `claim --apply` bare. | Deliberate (C123-3) — a silent placeholder would be worse. The failure is immediate and self-describing, the CHANGELOG carries an adoption note (deliverable 6), and G123-1 gates the decision. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R4 | gpt-5.6-sol | claude-opus-5 | cs119-123-plan-review (omni-ah) | dc80097b8d25 | 2026-07-25T01:56:50Z | Go | Go — atomic claim validation, complete audit scaffolding, both-form close-out repair, idempotency, historical preservation, and CS120 sequencing are coherent. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per § Claim) | planned | — | — |

## Notes / Learnings

- Both halves are pre-authorised by open learnings rather than newly invented scope: LRN-216 disposition ("`harness claim --apply` could scaffold these fields") and LRN-204 disposition ("recommend a follow-up CS to make `harness close-out --apply` rename the inner plan file").

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
