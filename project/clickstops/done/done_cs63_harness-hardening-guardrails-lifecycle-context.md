# CS63 — Harness hardening: consumer guardrails, lifecycle automation & context-integrity

**Status:** done
**Owner:** yoga-ah-c3
**Branch:** cs63a/content, cs63b/content, cs63c/content (siblings)
**Started:** 2026-06-06
**Closed:** 2026-06-08
**Filed by:** Harness self-review (2026-06-06 by `yoga-ah-c3`). A structural review of the harness against three axes — (1) right-sized guardrails for consumers, (2) easy install/update/extend, (3) workflows that stop agents doing forbidden things / closing too soon / losing context — surfaced nine findings plus two architectural evaluations (skills extraction, process-doc right-sizing). Consolidated here per user request to "move these into one CS."
**Depends on:** None hard. Relates to CS59 (release-process docs — shares the OPERATIONS.md surface) and CS54b (PR-template strict refresh — shares the consumer-template surface). Coordinate doc edits if claimed concurrently.

## Goal

Close the highest-leverage gaps between what the harness enforces **on itself** and what it actually **delivers to consumers**, make the lifecycle automations it advertises real (not stubs), and add the missing context-integrity gate — while deciding (not blindly executing) the two architectural questions: should procedure move from always-loaded docs into on-demand skills/CLI commands, and are the process docs right-sized.

The single most important finding: the harness holds **itself** to `harness lint` + `sync --mode=check` + tests on **every PR** (`.github/workflows/harness-self-check.yml:8-28`) but ships consumers only a **weekly scheduled + manual** drift workflow (`template/managed/.github/workflows/harness-drift.yml:11-14`, `schedule` + `workflow_dispatch`) plus review-evidence gates. The structural-integrity gate — the harness's whole value proposition — is **not delivered as a consumer merge gate**. A consumer who runs `init` + `sync` gets no PR-time guard that managed files are intact or that structure lints clean.

## Background

Review evidence (all paths verified on `main` @ `fd4da3f`, v0.7.0):

**Axis 1 — consumer guardrails**
- **G1 (🔴 core gap)** — No consumer PR-time structural gate. `harness-self-check.yml:8-28` runs `lint` + `sync --mode=check` + `node --test` on every harness PR; consumers receive only `harness-drift.yml` (weekly `schedule` Monday 06:00 + manual `workflow_dispatch`, `:11-14`) and the review-evidence gates. `harness lint` ships to consumers only as the **opt-in** reusable `harness-checks.yml` (a `workflow_call`, not a delivered always-on PR workflow).
- **G2 (🟠)** — Because drift is weekly maintenance (opens a fix-PR, `:83-99`), a consumer/agent that edits a `managed` file is **not blocked before merge**; the edit merges and is only reconciled on the next cron tick.
- **G3 (🟠)** — The `workboard-only` label short-circuits **all** review gates (`template/managed/.github/workflows/pr-evidence-lint.yml:92`; same pattern in `review-gates.yml`). Label misuse on a content PR bypasses meaningful enforcement.

**Axis 2 — install / update / extend**
- **U1 (🟠)** — Advertised lifecycle commands are stubs: `harvest`, `check-migration`, `composed-audit` all `die(... not yet implemented)` (`bin/harness.mjs:2470,2499,2528`). There is no `claim` command in `COMMAND_REGISTRY` (`:3561-3578`) at all.
- **U2 (🟠)** — No guided upgrade path: `sync` rejects `--ref` (`bin/harness.mjs:1540-1547`); updating = hand-edit `harness.config.json.version` then re-sync; major bumps only via `--accept-major` (`lib/sync.mjs:718-729`); no migration engine (`composed_block_migrations` explicitly rejected, `lib/sync.mjs:682-696`).
- **U3 (🟡)** — The documented **default** install path (`npx -y github:…#<ref>`) hits the npm 10.8/10.9 `GitFetcher requires an Arborist constructor` regression on Actions runners (`README.md:28`); the working path (clone + `node bin/harness.mjs`) is a footnote, not first-class.

**Axis 3 — closing too soon / losing context**
- **C1 (🔴)** — Doc-vs-reality drift. `INSTRUCTIONS.md:109,343` state the pre-claim learnings gate runs "automatically" via `harness harvest` / `harness claim` — but `harvest` is a stub and `claim` does not exist. The gate is doctrine-only manual, while the docs imply automation. Consumer orchestrators may trust a gate that never fires.
- **C2 (🟠)** — Close-out does not verify context was preserved. `check-clickstop.mjs` enforces the `## Plan-vs-implementation review` section + the two close-out `## Tasks` rows, but nothing ties an `active→done` rename to a `CONTEXT.md` / `LEARNINGS.md` update. The "repo is the memory" invariant has no freshness gate at the one moment memory must be written.
- **C3 (🟡)** — Many hard rules (no-commit preflight, file ownership, don't-touch-`lib/`, briefing-preamble-verbatim) are doctrine-only; the docs admit they are not mechanically enforceable under maintainer credentials.

**Architectural evaluations (user-requested)**
- **Skills** — The harness front-loads all procedure into always-read docs. Procedures that are only needed at a specific lifecycle moment (claim, dispatch, close-out, release, review) are candidates to become on-demand, invokable units. The harness already has an agent-agnostic mechanism for this: **CLI subcommands** (`harness <verb>`). The question is whether to push procedure into CLI commands (portable, testable) and/or runtime "skills" (Copilot-CLI-specific), versus leaving it in prose.
- **Doc right-sizing** — Measured sizes (via `(Get-Content).Count`): `OPERATIONS.md` 97 KB / 2038 lines (outlier), `CONTEXT.md` 77 KB / 150 lines (unbounded per-CS prose-block growth), `LEARNINGS.md` 380 KB / 3612 lines (append-only log), `INSTRUCTIONS.md` 28 KB / 556 lines (re-read every pull), `REVIEWS.md` 36 KB / 628 lines. The two with structural growth problems are `OPERATIONS.md` (procedure bible) and `CONTEXT.md` (history never capped).

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C63-1 | Scope shape | CS63 is an **umbrella/arc plan** and the single source of truth for the decisions below. Execution is **split into cohesive sibling CSs** — proposed grouping: **CS63a** consumer structural gate + bypass-hardening (template workflows + their tightly-coupled drift classifier), **CS63b** lifecycle + context-integrity code + doc-vs-reality fixes, **CS63c** guided-update + architectural-evaluation proposal + CONTEXT cap — each a thin claim-time file referencing this plan's decisions. The **G-scope** gate confirms or re-groups before any claim. | INSTRUCTIONS.md:517-518 requires template changes to land in their own CS, never piggy-backed on implementation. Bundling all execution into a single PR would violate that rule and produce an unreviewable mega-PR. One umbrella plan satisfies the user's "one CS" intent (single source of truth); sibling execution satisfies doctrine and keeps every PR reviewable. |
| C63-2 | Consumer structural PR gate (G1+G2) | Ship a new **managed** workflow `template/managed/.github/workflows/harness-pr-check.yml` that runs `harness lint --quiet` plus a new **file-class-aware drift classifier** `scripts/check-managed-drift.mjs` on every `pull_request` to the consumer's default branch, via the **clone + `node bin/harness.mjs`** install path (not `npx`, broken — U3). The classifier wraps the `lib/sync.mjs` check API and **fails only on `managed`/`composed` drift**; `seeded` drift is reported but never fails — raw `sync --mode=check` exits 1 on *any* drift including seeded **absence** (`lib/sync.mjs:884-889`), so the gate cannot call it directly. **Security:** least-privilege `permissions: contents: read, pull-requests: read`; no secrets; harness-ref validated against the existing allowlist regex (`harness-drift.yml:53-61`, `harness-checks.yml:90-101`); ref read from the **base-branch** `harness.config.json`, never PR-head, to defeat fork-PR ref injection. Wire into `init` gated by a new `pr_check.enabled` opt-out. | Delivers the harness's core value (structural integrity + managed-file protection) as an actual merge gate, closing the single biggest guardrail gap. Reuses the self-host gate's proven step sequence (`harness-self-check.yml:19-28`) and the existing ref-hardening pattern to de-risk it. |
| C63-3 | Managed-file escape hatch | The G2 hard block ships with an **auditable** release valve: a `harness-managed-edit-ack` PR label **plus a required `Harness-managed-edit:` justification line in the PR body** together convert the managed-drift failure to a **surfaced** warning (logged in gate output, never silent); where branch protection allows, the override also requires CODEOWNER approval. A bare label with no justification does **not** clear the gate. | A guardrail with no release valve gets disabled wholesale the first time it blocks an urgent fix. Requiring label + written justification (+ CODEOWNER) keeps the gate on, makes every override auditable, and prevents the ack from degenerating into the same routine bypass G3 (C63-7) closes. |
| C63-4 | Implement `harness harvest` (U1) + fix C1 | Implement `harvest` as a real, **deterministic, network-free, non-blocking-by-default** pre-claim learnings gate in a new `lib/harvest.mjs` (scans `LEARNINGS.md` `open` items tagged `process`/`architectural` or matching `claim_area`; prints disposition prompts; exit 0 advisory unless `--strict`). Then correct `INSTRUCTIONS.md`/`OPERATIONS.md` (+ mirrors) so the automation claims match reality. Mark `check-migration`/`composed-audit` as STUB in their `--help` output until implemented. | Makes the advertised pre-claim gate real instead of doctrine, and removes the misleading "automatic" language. Non-blocking-by-default prevents a buggy harvest from wedging all claims. |
| C63-5 | Close-out context-integrity linter (C2) | Add `scripts/check-closeout-freshness.mjs`: when a PR's changed-file set includes an `active_csNN_* → done_csNN_*` transition, **require** a `CONTEXT.md` change in the same PR and warn if `LEARNINGS.md` is untouched. Self-host-safe; narrowly scoped to the rename event (a typo fix in an existing `done_` file does not trigger it). Wire into the `harness lint` aggregator and `pr-evidence`. | Ties the "repo is the memory" invariant to a mechanical gate at the exact moment memory must be written, preventing silent context loss at close-out. |
| C63-6 | Guided update flow (U2+U3) | Add `harness upgrade [<ref>]`: bumps `harness.config.json.version`, runs `sync --mode=dry-run`, and prints the rendered diff + a migration summary **without applying** (apply remains an explicit second step). Make the clone-based install path first-class in `README.md`/`OPERATIONS.md` and in the `init` summary. Additive over the existing sync engine — **no rewrite** of `lib/sync.mjs` apply semantics. | Turns "edit version, hope sync is safe" into a previewable, reviewable upgrade. Additive-only keeps blast radius small and avoids touching destructive write paths. |
| C63-7 | Bypass hardening (G3) | Tighten the `workboard-only` short-circuit so it only applies when the PR diff is confined to the existing workboard diff-path allowlist (already computed in `workboard-auto-approve.yml`); a `workboard-only`-labelled PR that touches non-workboard files is **rejected**, not skipped. Keep `check-independence-invariant` / `review-log-evidence` behavior otherwise unchanged. | Removes the "slap the label on a content PR to skip review" bypass while preserving the legitimate fast path for genuine workboard-only PRs. |
| C63-8 | Skills / procedure-locality (evaluation → decision) | **Recommend CLI-commands-first, runtime-skills-second.** Push lifecycle procedure into portable, testable `harness` subcommands (`claim`, `close-out` as the next candidates after `harvest`); expose runtime "skills" (Copilot CLI) only as **thin wrappers** over those commands. Do **not** couple core procedure to one runtime's skill system. This CS delivers a written proposal + the first command (`harvest`, C63-4); the `claim`/`close-out` commands and any skill wrappers are a **follow-up CS** (`CS64`). | The harness must stay agent-agnostic (the repo is the only durable state). CLI commands give the right-time + leaner-context benefit of skills without runtime lock-in or the silent-skip failure mode. Spike-then-commit avoids a risky big-bang refactor of load-bearing procedure. |
| C63-9 | Doc right-sizing (evaluation → decision) | In this CS, do **only the safe, reversible win**: cap `CONTEXT.md` retained history (keep the current + last 2 "Prior" blocks; older detail already lives in `done_csNN` files) and add a generated-summary discipline. **Defer** the high-risk `OPERATIONS.md` extraction (2038→target ~600 lines via procedure→CLI/skill migration) and `LEARNINGS.md` archival split to a dedicated follow-up CS (`CS65`), because `OPERATIONS.md` is load-bearing and aggressive trimming could remove a procedure an agent relies on. | Right-sizing the procedure bible is real value but high blast radius; it must ride with the skills decision (C63-8), not a guardrail-hardening CS. Capping `CONTEXT.md` is low-risk and stops the worst unbounded-growth offender now. |
| C63-10 | bin/harness.mjs ownership | `bin/harness.mjs` (151 KB monolith) and the shared process docs (`INSTRUCTIONS.md`, `OPERATIONS.md` + their template mirrors, `CONTEXT.md`) are **orchestrator-owned**; sub-agents deliver only **new** files (lib modules, linters, the new workflow, fixtures, tests) plus written specs. Orchestrator integrates command registration + `cmdLint` aggregator wiring + `cmdInit` wiring + help text serially in a final wave. | Per LRN-016 (parallel file race) and LRN-068 (orchestrator-owned long-lived file edits). Multiple sub-agents editing the monolith or the shared docs concurrently would race. Disjoint new-file ownership is the only safe parallelization. |
| C63-11 | C3 disposition | Document the no-commit-preflight / file-ownership / don't-touch-`lib/` rules as **best-effort advisory** and add a CI **diff-scope advisory** where feasible, but do **not** claim mechanical enforcement. No new hard gate. | The docs already concede these are unenforceable under maintainer creds; pretending otherwise creates false confidence. Honesty over theater. |

## Deliverables

Grouped by workstream (W#). Owner column previews the parallelization in `## Parallelization`. New files unless noted "(edit)". Per C63-1 these deliverables execute under sibling CSs (proposed CS63a/b/c), not one PR.

**W1 — Consumer structural PR gate (C63-2, C63-3) → CS63a**
1. `template/managed/.github/workflows/harness-pr-check.yml` — PR-time `lint` + managed-drift gate (clone+node install path; least-privilege `permissions`; base-branch harness-ref; ref-allowlist validation), with the `harness-managed-edit-ack` label + `Harness-managed-edit:` justification-line release valve.
2. `scripts/check-managed-drift.mjs` — file-class-aware drift classifier wrapping the `lib/sync.mjs` check API (fails on managed/composed drift only; seeded reported-not-failed), `--dir`/`--files`/`--quiet` interface, exit 0/1/2, self-host-safe.
3. `schemas/harness.config.schema.json` (edit) — new `pr_check.enabled` opt-out field with schema default; **read the schema before authoring config access** (LRN-039).
4. `template/seeded/harness.config.json` (edit) — default-on for fresh init.
5. `tests/cs63-consumer-pr-check.test.mjs` + `tests/check-managed-drift.test.mjs` — workflow-pin lint, config-default, drift-classification (managed fails / seeded passes), and ack-valve coverage (≥ a meaningful minimum; over-delivery welcome per LRN-037).

**W2 — `harness harvest` + doc-vs-reality (C63-4, C1) → CS63b**
6. `lib/harvest.mjs` — deterministic, network-free `open`-learnings scanner returning disposition candidates; pure-ish (reads `LEARNINGS.md`), zero runtime deps.
7. `tests/lib-harvest.test.mjs` — unit coverage over the scanner (tag filters, `claim_area` match, empty-state silence, strict vs advisory exit).
8. Help-text STUB markers for `check-migration` / `composed-audit` (orchestrator edits `bin/harness.mjs` help in W7).

**W3 — Close-out context-integrity linter (C63-5) → CS63b**
9. `scripts/check-closeout-freshness.mjs` — `active→done` rename ⇒ require `CONTEXT.md` change + warn on stale `LEARNINGS.md`; `--files`/`--dir` interface, exit 0/1/2, self-host-safe.
10. `tests/check-closeout-freshness.test.mjs` + `tests/fixtures/cs63/closeout/*` — valid/invalid fixtures.

**W4 — Guided update (C63-6) → CS63c**
11. `lib/upgrade.mjs` — version-bump + dry-run-diff + migration-summary helper, additive over `lib/sync.mjs` (no apply-path rewrite).
12. `tests/lib-upgrade.test.mjs` — dry-run never writes; diff summary shape; major-bump still gated.

**W5 — Bypass hardening (C63-7) → CS63a**
13. `template/managed/.github/workflows/pr-evidence-lint.yml` (edit) + `template/managed/.github/workflows/review-gates.yml` (edit) — confine `workboard-only` short-circuit to the workboard diff-path allowlist; reject mixed-content PRs carrying the label. **Inline workflow logic only — no new helper file.**
14. `tests/cs63-workboard-bypass.test.mjs` — asserts a labelled mixed-content PR is rejected and a pure workboard PR still skips.

**W6 — Architectural evaluations (C63-8, C63-9, C63-11) → CS63c**
15. A written **proposal artifact** (lives in this CS's `done_` directory at close-out, not a banned root planning file) capturing: the CLI-commands-first skills recommendation, the `OPERATIONS.md`/`LEARNINGS.md` right-sizing plan, the C63-11 diff-scope-advisory disposition, and the follow-up CS stubs (`CS64` claim/close-out commands + skill wrappers; `CS65` OPERATIONS/LEARNINGS right-sizing).
16. `CONTEXT.md` (edit, orchestrator) — history cap to current + last 2 "Prior" blocks (C63-9 safe win).
17. Two new `project/clickstops/planned/planned_cs64_*.md` and `planned_cs65_*.md` stubs carrying the deferred work.
18. The **sibling-CS index files** `project/clickstops/planned/planned_cs63a_*.md`, `planned_cs63b_*.md`, `planned_cs63c_*.md` (per the G-scope-confirmed grouping) — thin files referencing this umbrella's decisions/deliverables.

**W7 — Per-sibling orchestrator integration (serial, C63-10)**
19. `bin/harness.mjs` (edit) — wire `lib/harvest.mjs` behind `cmdHarvest` (replace the `die` stub), add `check-closeout-freshness` to the `cmdLint` aggregator + `pr-evidence`, wire `harness-pr-check.yml` into `cmdInit`, add `harness upgrade` (`lib/upgrade.mjs`) to `COMMAND_REGISTRY` + `TOP_HELP` + `SUBCOMMAND_HELP`, STUB-mark `check-migration`/`composed-audit` help. (Each edit lands in the sibling CS that owns the feature, not one shared PR.)
20. `INSTRUCTIONS.md` + `OPERATIONS.md` (edit, orchestrator) **and their `template/managed/` + `template/composed/` mirrors in lockstep** — correct the harvest/claim automation claims (C1), document the consumer PR gate (C63-2), the upgrade flow (C63-6), the bypass tightening (C63-7).
21. `CHANGELOG.md` (edit) — `[Unreleased]` entries for every consumer-visible change (new workflow, new `upgrade` command, gate behavior).

## Parallelization

Wave 1 dispatches W1–W5 to sub-agents with **disjoint new-file ownership**; W6 proposal + W7 integration are orchestrator-serial in Wave 2. No two sub-agents write the same file.

| Workstream | Sub-agent | OWN (write) — disjoint | Must NOT touch |
|---|---|---|---|
| W1 | SA-1 | `template/managed/.github/workflows/harness-pr-check.yml`, `scripts/check-managed-drift.mjs`, `schemas/harness.config.schema.json`, `template/seeded/harness.config.json`, `tests/cs63-consumer-pr-check.test.mjs`, `tests/check-managed-drift.test.mjs` | `bin/`, `lib/`, other template workflows |
| W2 | SA-2 | `lib/harvest.mjs`, `tests/lib-harvest.test.mjs` | `bin/`, docs, schemas |
| W3 | SA-3 | `scripts/check-closeout-freshness.mjs`, `tests/check-closeout-freshness.test.mjs`, `tests/fixtures/cs63/closeout/**` | `bin/`, docs, `lib/` |
| W4 | SA-4 | `lib/upgrade.mjs`, `tests/lib-upgrade.test.mjs` | `bin/`, `lib/sync.mjs` (read-only), docs |
| W5 | SA-5 | `template/managed/.github/workflows/pr-evidence-lint.yml`, `template/managed/.github/workflows/review-gates.yml`, `tests/cs63-workboard-bypass.test.mjs` | W1's `harness-pr-check.yml`, `bin/`, docs |
| W6 | orchestrator | proposal artifact, `CONTEXT.md`, `planned_cs63a/b/c_*.md`, `planned_cs64/65_*.md` | sub-agent-owned new files |
| W7 | orchestrator | `bin/harness.mjs`, `INSTRUCTIONS.md`, `OPERATIONS.md` (+ mirrors), `CHANGELOG.md` | sub-agent-owned new files until merged in |

Note: W4 reads `lib/sync.mjs` but must not modify it (C63-6 additive). W1 and W5 both live under `template/managed/.github/workflows/` but own **distinct files**, so they remain disjoint. W7 is **not** a single shared PR — each `bin/harness.mjs` + doc edit lands in the sibling CS (C63a/b/c) that owns the corresponding feature, orchestrator-serial within that sibling (C63-1, C63-10).

## User-approval gates

- **G-scope** (before claim) — confirm the C63-1 grouping: umbrella plan + sibling CSs **CS63a** (template guardrails: W1+W5), **CS63b** (lifecycle/context code+docs: W2+W3), **CS63c** (update + evaluations: W4+W6). **Blocking** — sets the execution shape. Default = this grouping; user may re-group or override to a single phased-wave PR. **✅ CONFIRMED 2026-06-06 (user): option (a) — the CS63a/b/c grouping.**
- **G-gate-default** — confirm whether `harness-pr-check.yml` is **default-on** for fresh `init` (recommended) vs opt-in. **✅ CONFIRMED 2026-06-06 (user): default-on** (fresh `init` ships it enabled; existing consumers get it on the next `sync` with a one-release warn-window note in CHANGELOG).
- **G-release** — if CS63 (or its arc) ships in a tag; new CLI subcommand (`upgrade`) ⇒ **minor** bump per OPERATIONS.md § SemVer policy. **✅ CONFIRMED 2026-06-06 (user): ship the arc as one minor release once the siblings land.**

## Exit criteria

1. A consumer that runs `init` + `sync` receives a PR-time `harness-pr-check.yml` that fails on **managed/composed** drift (via `scripts/check-managed-drift.mjs`, never on `seeded` absence) and on lint errors, declares least-privilege `permissions`, validates + base-branch-sources the harness ref, and honors the `harness-managed-edit-ack` label + justification-line valve (C63-2, C63-3).
2. `harness harvest` runs a real, deterministic, network-free pre-claim learnings scan (exit 0 advisory by default); `INSTRUCTIONS.md`/`OPERATIONS.md` automation claims match reality; `check-migration`/`composed-audit` `--help` say STUB (C63-4, C1).
3. `scripts/check-closeout-freshness.mjs` blocks an `active→done` PR lacking a `CONTEXT.md` update, is wired into `harness lint` + `pr-evidence`, and is self-host-safe (C63-5).
4. `harness upgrade` previews a version bump via dry-run diff without applying; clone-based install is first-class in docs (C63-6, U2, U3).
5. `workboard-only` no longer skips review gates on a PR that touches non-workboard files; a pure workboard PR still skips (C63-7).
6. The W6 proposal artifact records the skills + right-sizing decisions; `CONTEXT.md` history is capped; `CS64`/`CS65` stubs are filed (C63-8, C63-9).
7. The execution split (umbrella + confirmed sibling grouping) is recorded and the sibling index files are filed (C63-1); each sibling PR keeps `bin/harness.mjs` + shared-doc edits orchestrator-owned and serial, with no unrelated W7 edits bleeding across siblings (C63-10); the C63-11 diff-scope-advisory disposition is documented (advisory-only or a recorded no-op).
8. `harness lint --quiet` passes on self-host (full suite incl. composed-mirror lockstep + new linters); `node --test tests/*.test.mjs` green; `sync --mode=check` reports no drift.
9. Plan-vs-implementation review (GPT-5.5 gate) returns GO for each sibling CS.
10. CHANGELOG `[Unreleased]` entries present for every consumer-visible change.

## Risks + open questions

Per-item "what can break" — the user's explicit ask.

| # | Item | Risk / what breaks | Mitigation |
|---|---|---|---|
| R1 | C63-1 scope | **Template-vs-code piggyback doctrine** (INSTRUCTIONS.md:517-518): bundling new managed workflows + managed-doc edits + lib/linter code in one PR violates the rule and yields an unreviewable mega-PR. | Phased waves / sibling CSs (`CS63a/b/c`); one PR per wave. **G-scope gate decides.** Top rubber-duck question. |
| R2 | C63-2 (G1) gate | New workflow name could collide with an existing consumer workflow; a gate built on raw `sync --mode=check` would **fail on `seeded` absence too** and block every consumer PR (huge blast radius). Using `npx` would hit the GitFetcher bug and fail spuriously. | Unique name; **file-class classifier `scripts/check-managed-drift.mjs`** fails only managed/composed (seeded reported-not-failed); clone+node install path (not npx); `pr_check.enabled` opt-out; pilot on the harness self-host first. |
| R3 | C63-3 escape hatch | A too-easy ack label becomes a routine bypass (re-creates G3 for managed files). | Ack requires **label + a `Harness-managed-edit:` justification line + (where protection allows) CODEOWNER approval**, surfaced in gate output — never a silent skip; bare label does not clear the gate. Deliverable 1 + Exit 1 enforce this. |
| R13 | C63-2 workflow security | The new workflow **clones + runs `node bin/harness.mjs`** in consumer PR CI. Default-write token permissions, or a harness ref taken from PR-head config, would let a fork PR escalate token scope or pin a malicious ref (code-exec / supply-chain blast radius). | Declare `permissions: contents: read, pull-requests: read`; no secrets; validate the ref against the existing allowlist regex (`harness-drift.yml:53-61`, `harness-checks.yml:90-101`); read the ref from the **base-branch** config only, never PR-head. Deliverable 1 + Exit 1. |
| R4 | C63-4 harvest | A buggy or blocking harvest could **wedge all claims** (non-zero exit on pre-claim). Network calls would make it nondeterministic/flaky. | Advisory exit 0 by default; `--strict` opt-in; pure file read of `LEARNINGS.md`, no network; unit-tested empty-state silence. |
| R5 | C1 doc fix | Editing `INSTRUCTIONS.md` (managed) without moving the `template/managed/` mirror in lockstep fails the composed/managed lockstep lint; risk of root/template drift. | Orchestrator owns both root + mirror; edit in the same wave; `sync --mode=check` in exit criteria catches drift. |
| R6 | C63-5 linter | False positives — not every `done_` file change needs a `CONTEXT.md` touch; an over-eager linter annoys and gets disabled. Could mis-fire on the CS63 PR itself. | Trigger **only** on the `active→done` rename event, not any `done_` edit; self-host guard; valid+invalid fixtures; grandfather pre-existing done files. |
| R7 | C63-6 upgrade | Touching upgrade/sync semantics risks **data loss** if it writes when it should preview. | Dry-run-only in this CS; never auto-apply; additive helper over `lib/sync.mjs` (no apply-path edits); test asserts zero writes in dry-run. |
| R8 | C63-7 bypass | Wrong path-allowlist logic could **break `workboard-auto-approve`** auto-merge → orchestrator workboard PRs stall. | Reuse the existing allowlist computation; only ADD the reject-if-mixed clause; test both pure-workboard (still skips) and mixed (rejected). |
| R9 | C63-8 skills | Coupling core procedure to a runtime skill system breaks agent-agnosticism and adds a **silent-skip** failure mode (worse than an unread doc). | CLI-commands-first; skills only as thin wrappers; spike + proposal, not a big-bang refactor; defer to `CS64`. |
| R10 | C63-9 doc-sizing | Aggressive `OPERATIONS.md` trimming could **delete a procedure an agent depends on**; `LEARNINGS.md` split could break LRN-anchor cross-links. | Only the safe `CONTEXT.md` cap here; defer OPERATIONS/LEARNINGS to `CS65` with the skills decision; preserve all LRN anchors. |
| R11 | C63-10 monolith | Multiple sub-agents touching `bin/harness.mjs` or shared docs would race (LRN-016). | Orchestrator-owned monolith + shared docs; sub-agents deliver new files + specs only; serial Wave-2 integration. |
| R12 | Whole-CS size | This is an **epic** (9 findings + 2 evaluations); a single CS risks scope creep, review fatigue, and a stuck branch. | C63-1 phasing; explicit deferrals (C63-8/9 → CS64/65); per-wave PRs; minimums-not-maximums sub-agent briefs. |
| Q1 | Resolved 2026-06-06 (user): **default-on**. Fresh `init` ships `harness-pr-check.yml` enabled; existing consumers receive it on the next `sync` with a one-release CHANGELOG warn-note. | G-gate-default (confirmed). |
| Q2 | Resolved 2026-06-06 (user): **CLI-commands-first; runtime skills only as thin wrappers**, go/no-go after the CS64 spike. | C63-8 proposal + CS64; not built in this CS. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: yoga-ah-c3) | ff8759f9b2a5 | 2026-06-06T23:08:00Z | Needs-Fix | 3 blocking: seeded-drift claim vs lib/sync 884-889; scope bundled vs INSTRUCTIONS 517-518; workflow security underspecified. +4 non-blocking. All addressed in R2. |
| R2 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: yoga-ah-c3) | fe3abbe9dc19 | 2026-06-06T23:16:00Z | Go-with-amendments | All 7 R1 findings verified resolved (classifier, umbrella+siblings, workflow security, ack, W5, wording). 1 non-blocking: C63-10 exit criterion — applied. |
| R3 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: yoga-ah-c3) | 5908b78f0c18 | 2026-06-06T23:34:00Z | Go | Factual correction: OPERATIONS.md line count 1615→2038 in C63-9 + Background measurements; decision substance (defer trimming to CS65, cap CONTEXT.md) unchanged. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| Sibling **CS63a** (template guardrails W1+W5) — content #264, close-out #265 | done | yoga-ah-c3 | PVI GO; LRN-155 |
| Sibling **CS63b** (lifecycle/context code W2+W3+C1) — content #267, close-out #268 | done | yoga-ah-c3 | PVI GO; LRN-156 |
| Sibling **CS63c** (guided update + evaluations W4+W6) — content #270, close-out #272 | done | yoga-ah-c3 | PVI GO; LRN-157 |
| Close-out: docs + restart state — update WORKBOARD, CONTEXT, relevant docs | done | yoga-ah-c3 | umbrella close-out; CONTEXT history capped at CS63c; WORKBOARD updated |
| Close-out: learnings + follow-ups — file/disposition LEARNINGS and planned follow-up CSs | done | yoga-ah-c3 | LRN-155/156/157 filed; CS64–CS67 follow-up stubs filed |

## Notes / Learnings

- **2026-06-06 — user decisions on the four CS63 gates (recorded by `yoga-ah-c3`):**
  1. **G-scope = (a)** — execute as the umbrella + three sibling CSs **CS63a** (template guardrails: W1+W5), **CS63b** (lifecycle/context code+docs: W2+W3), **CS63c** (guided-update + evaluations: W4+W6).
  2. **G-gate-default = default-on** — `harness-pr-check.yml` ships enabled on fresh `init`; existing consumers get it on next `sync` with a one-release CHANGELOG warn-note.
  3. **G-release = (a)** — ship the arc as one **minor** release once the siblings land.
  4. **Q2 = (a)** — CLI-commands-first; runtime skills only as thin wrappers; go/no-go after the CS64 spike.
  These resolve the blocking G-scope gate; sibling index files CS63a/b/c filed per deliverable 18.

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | yoga-ah-c3 |
| Reviewer agent | rubber-duck |
| Notes | Umbrella — no direct implementation; the three sibling CSs (CS63a/b/c) carry the code, each reviewed by gpt-5.5 (rubber-duck) + GitHub Copilot with an independent plan-vs-impl GO. Reviewer (gpt-5.5) differs from implementer (claude-opus-4.8) per the independence invariant. |

## Plan-vs-implementation review

**Reviewer:** gpt-5.5 (rubber-duck; orchestrator yoga-ah-c3)
**Date:** 2026-06-08
**Outcome:** GO

The CS63 umbrella has no implementation of its own — it is realized by the three
sibling CSs, each of which passed its own GPT-5.5 plan-vs-implementation gate:

- **CS63a** (W1+W5 template guardrails) — PVI GO; merged #264, closed #265.
- **CS63b** (W2+W3+C1 lifecycle/context code) — PVI GO; merged #267, closed #268.
- **CS63c** (W4+W6 guided update + evaluations) — PVI GO; merged #270, closed #272.

All 10 umbrella exit criteria are met: consumer PR gate (1); real `harvest` +
accurate automation docs (2); close-out-freshness gate (3); `harness upgrade`
dry-run preview + first-class clone install (4); `workboard-only` bypass
tightening (5); W6 proposal artifact + `CONTEXT.md` cap + CS64/CS65 stubs filed
(6); recorded execution split + serial shared-file edits + C63-11 advisory
disposition (7); green self-host lint/tests/sync (8); per-sibling PVI GO (9);
CHANGELOG `[Unreleased]` entries (10).
