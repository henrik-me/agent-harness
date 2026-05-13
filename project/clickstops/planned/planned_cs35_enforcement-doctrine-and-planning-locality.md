# CS35 — Enforcement doctrine + planning-locality (front-load for v0.4.0 arc)

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** Pre-CS35 disposition of [#145](https://github.com/henrik-me/agent-harness/issues/145), [#142](https://github.com/henrik-me/agent-harness/issues/142), [#139](https://github.com/henrik-me/agent-harness/issues/139), and a planning-locality concern surfaced 2026-05-12 (session-state `~/.copilot/session-state/<id>/plan.md` was holding strategic content; non-durable; agent-handoff failure mode). Authored 2026-05-12 by `yoga-ah`. First CS in the v0.4.0 enforcement-gap arc; precedes [CS36](planned_cs36_pr-evidence-fs-and-git-linters.md), [CS37](planned_cs37_copilot-review-gate-graphql.md), [CS38a](planned_cs38a_pr-evidence-workflow-and-init.md), [CS38b](planned_cs38b_retro-pr28-and-self-host-optin.md), [CS39](planned_cs39_release-v0.4.0.md).
**Depends on:** None. CS36–CS39 depend on the doctrine + schemas + planning-locality controls landed here.

## Goal

Front-load the doctrine, schemas, planning-locality controls, and reviewer-model fallback ladder that the rest of the v0.4.0 enforcement-gap arc depends on. No mechanical PR-state gates yet — those land in CS36/CS37 — but every doctrine clause CS36–CS41 will enforce is written here first so back-links go in one direction (doctrine → linter, never the reverse).

## Background

PR #28 in `henrik-me/sub-invaders` revealed 6 enforcement gaps (catalogued in [#145](https://github.com/henrik-me/agent-harness/issues/145)) where REVIEWS / OPERATIONS doctrine was followed in spirit but not mechanically enforced:

1. 4/11 commits missing `Co-authored-by: Copilot` trailer.
2. Stale-diff false-pass (reviewer Go on a SHA before the implementer's last commit).
3. Summary-pass on YAML / package.json with no per-file enumeration.
4. Parallel review ordering (Copilot review requested mid-fix).
5. Implementer self-review counted as evidence.
6. No documented Copilot engagement procedure.

The harness self-host CI passes within its own operating envelope (small PRs, attentive orchestrator, owner-in-the-loop) which papers over the same gaps. **Self-host green is necessary but not sufficient** (LRN-XXX, filed at this CS close-out).

In addition: 2026-05-12 surfaced a planning-locality concern. Strategic planning content (multi-CS arcs, defaults that outlive a single session) was being authored to session-state `~/.copilot/session-state/<id>/plan.md`. Session storage is non-durable; any session crash, model-family swap, or agent handoff loses the plan. The fix is doctrine + a linter that bans repo-root planning files + a bootstrap sanity check that opens every session with `git ls-files project/clickstops/{planned,active}/`.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C35-1 | Reviewer dispatch ownership | Orchestrator owns dispatch via OPERATIONS.md verbatim reviewer preamble (LRN-068 pattern). Harness CLI is post-processor only — never emits prompts, never paste-protocols, never calls an LLM API. | Reuses existing canonical-preamble discipline. Avoids adding an LLM API client to the harness. Keeps the harness deterministic. |
| C35-2 | Reviewer model fallback ladder | GPT-highest-available (5.5 → 5.4 → ...) → Sonnet-highest (4.7 → 4.6 → ...) → orchestrator's own model (last resort). Independence invariant always applied. | User-confirmed 2026-05-12. Highest GPT preferred per REVIEWS.md §54; Sonnet documented as fallback; orchestrator-same-model is pragmatic last resort when neither family is available. |
| C35-3 | `## Review log` column schema | Columns: `timestamp` (ISO-8601 UTC), `analyzed_head` (full 40-char SHA), `actor` (GitHub username), `model` (string from M family per C35-2), `verdict` (Go / Needs-Fix / Block), `evidence_link` (PR comment URL / commit SHA / file ref). | All six PR #28 gaps require these fields. ISO-8601 chosen for `git log` interop; full SHA chosen so currency check (A4) is unambiguous. |
| C35-4 | `## Model audit` schema | Two columns: `Implementer models` (comma-separated list), `Reviewer model` (single value). Independence invariant: intersection MUST be empty. Comparison is case-insensitive. | Matches existing REVIEWS.md template. Comma-separated allows multiple implementer agents per CS (LRN-068 fan-out pattern). |
| C35-5 | Per-commit trailer enforcement scope | Every commit in `git log <base>..<head>` (NOT squash-only). | #145 B1 evidence: squash hides intermediate dirty state. Catching at PR-time prevents the dirty state from ever reaching `main` history. |
| C35-6 | A5 timestamp basis | Latest `verdict ∈ {Go}` row's `timestamp` column in `## Review log`. | Single canonical source; computable without GitHub API calls; orchestrator already writes the row. |
| C35-7 | Workboard-only PR exemption | Label `workboard-only` skips ALL gates (workflow-level `if: !contains(labels.*.name, 'workboard-only')`). | Existing convention; trivial to encode at workflow level. |
| C35-8 | Bot / Dependabot PR scope | Author allowlist (`dependabot[bot]`, `github-actions[bot]`) skips B1 / A3 / A4. A16 still applies if a Copilot review is explicitly requested. | Bot PRs lack the doctrine-required content (CS file, review log) by construction. |
| C35-9 | Fork PR scope | Read-only gates run normally. Copilot mutation cannot run from fork (`GITHUB_TOKEN` is read-only on fork PRs); the mutation gate fails loudly with a maintainer-rerun instruction. | GH-imposed constraint; must be documented, not papered over. |
| C35-10 | Copilot engagement venue | Local-CLI-driven via CS41 `harness copilot-engage`. CI workflow only *verifies* presence (A16 gate), never mutates. | Mutation needs maintainer authority; CI shouldn't have it. Local CLI runs under maintainer's `gh` credentials. |
| C35-11 | Planning-locality rule | Strategic planning content (multi-CS arcs, decisions outliving the session) MUST live in `project/clickstops/{planned,active,done}/**`. Tactical session-state `plan.md` may track only (a) which CS this session executes, (b) ephemeral todos for that one CS. | Session storage is non-durable. Any agent restart or handoff must succeed from the repo alone. |
| C35-12 | Banned file shapes (linter) | These names anywhere outside `project/clickstops/`: `PLAN.md`, `ROADMAP.md`, `TODO.md`, `NOTES.md`, `STRATEGY.md` (case-insensitive). Allow-listed paths: `template/**`, `node_modules/**`, `.git/**`. | Concrete, mechanical detection. Catches the most common drift toward repo-root scratch files. |
| C35-13 | Agent-files-issues anti-pattern | Doctrine (not mechanically enforceable): GitHub issues are an INBOUND channel from external contributors / the user; the agent READS them as input to file CSs. The agent does NOT file issues. | Mechanical detection requires knowing the agent's GH identity (here it uses the user's PAT — indistinguishable). Doctrine + orchestrator self-check is the only feasible enforcement. |
| C35-14 | Bootstrap sanity check extension | Add to per-session boot list (INSTRUCTIONS.md): `git ls-files project/clickstops/{planned,active}/ \| sort` so every session opens with the planned arc visible. Encourages resume over restart. | Minimal cost (one shell command); maximally surfaces existing arcs. |
| C35-15 | `--enable-review-gates` default for v0.4.0 | Opt-in (`review_gates.enabled: false` if absent from `harness.config.json`). Flip to opt-out in v0.5.0 (CS41). | Lets v0.4.0 ship without breaking existing consumers; gives consumers one release to migrate. |
| C35-16 | LRN reservation | At CS35 close-out, file LRN-XXX: "Self-host green is necessary but not sufficient" — the harness's own operating envelope (small PRs, attentive orchestrator) papers over gaps that explode in consumers with different profiles. | Captures the meta-insight that drove this entire arc. |
| C35-17 | `harness pr-evidence` entry point | PR-state gates land on a NEW `harness pr-evidence` subcommand (taking `--base/--head/--pr-body/--repo/--pr` flags), NOT on `harness lint`. CS36 ships the entry point + first linters. | Per rubber-duck finding 1: PR-state checks shouldn't fire on default `harness lint` runs and shouldn't false-skip when PR context is absent. |
| C35-18 | Agent-identity independence (separate from model independence) | `## Model audit` SHOULD include `Implementer agent` and `Reviewer agent` columns naming the GitHub usernames of the agents involved. Independence MUST hold on both axes: (a) model independence per C35-4 (no model overlap); (b) agent-identity independence (Implementer agent ≠ Reviewer agent). The columns are added to the schema in CS41 (where the enforcement linter `check-clickstop-implementer-not-reviewer` ships). v0.4.0 PRs without the agent columns produce a warning (not error); v0.5.0 may upgrade to error per C42-6. | Per GPT-5.5 review of CS41: the doctrine ("same agent shouldn't review their own work") was implicit in CS35 but not stated. Added here so CS41's enforcement linter has a doctrinal anchor in CS35 (per the "doctrine first, enforcement later" invariant). |
| C35-19 | Skip-semantics centralization | `harness pr-evidence` accepts a `--skip-reasons <comma-list>` flag (values: `workboard-only`, `bot-author`, `fork-source`). The orchestrator (or CI workflow) is responsible for computing these and passing them in; `harness pr-evidence` itself MUST NOT call `gh pr view` to determine skip applicability. CS36's CLI route reads the flag; CS38a's workflow computes the reasons from the GitHub event payload. | Per GPT-5.5 review of CS36 vs CS38a: CS36 was specced to call `gh pr view` (contradicting "pure fs/git-log") AND CI/local skip semantics could diverge. Centralization fixes both. |

## Deliverables

1. **REVIEWS.md** + **template/composed/REVIEWS.md** updates (per C35-2/3/4):
   - Reviewer model fallback ladder appended to §54.
   - `## Review log` column schema (replaces existing freeform table description).
   - `## Model audit` schema made explicit (independence invariant restated as a hard MUST).
   - R1 / Rn distinction (per #145 Change 1): R1 = first review on a given HEAD with full per-file enumeration; Rn = follow-up review on a delta with delta-only enumeration permitted.
   - Stale-diff doctrine: a Go on `analyzed_head` ≠ current HEAD is invalid (per A4).
2. **OPERATIONS.md** + **template/composed/OPERATIONS.md** updates:
   - § Sub-agent dispatch: add canonical reviewer preamble (per C35-1, mirroring LRN-068 pattern) — verbatim block to paste into reviewer dispatches.
   - § Pre-claim checklist: add planning-locality self-check (per C35-11) — externalize before claiming if session `plan.md` references >1 CS.
   - § Copilot engagement procedure (per C35-10 + #145 Change 6): document the `gh api graphql` `requestReviews` recipe + 5-min poll expectation + verification command (`gh pr view <pr> --json reviewRequests,reviews`).
3. **INSTRUCTIONS.md** updates:
   - Bootstrap sanity check extension (per C35-14): add `git ls-files project/clickstops/{planned,active}/` to the per-session boot list with rationale.
   - Planning-locality quick-rule (per C35-11) in the "Hard rules" section.
   - Banned: agent files issues (per C35-13) added to "Hard rules".
4. **CONVENTIONS.md** updates:
   - Trailer enforcement clarification (per C35-5): every commit, not squash.
   - Workboard-only / bot / fork PR predicates (per C35-7/8/9) cross-linked to the relevant linters when they ship.
5. **`scripts/check-planning-locality.mjs`** (new): walks the working tree from `git rev-parse --show-toplevel`, fails on any banned file shape (per C35-12) outside the allow-list. Wired into `harness lint` aggregator (CONVENTIONS / OPERATIONS layer — repo-state, not PR-state).
6. **`tests/check-planning-locality.test.mjs`** (new): minimum 3 test cases — banned name at root fails; banned name in `template/` allowed; allowed name in `project/clickstops/planned/` allowed.
7. **CHANGELOG.md** `[Unreleased] / Added` entries (per [LRN-101](../../../LEARNINGS.md#lrn-101) policy) for: planning-locality linter + doctrine + reviewer fallback ladder.
8. **LEARNINGS.md** new entry LRN-XXX (per C35-16) with status `applied` and disposition note linking the CS35 close-out commit.

## Sub-agent fan-out

Single orchestrator-owned CS recommended. Doctrine writing is high-coordination, low-parallelism: a single voice writing across REVIEWS / OPERATIONS / INSTRUCTIONS / CONVENTIONS keeps cross-references consistent. The planning-locality linter could be a small fan-out (1 sub-agent) but the orchestrator can do it inline given it's ~50 LOC.

If fan-out IS used: own the sub-agent strictly to `scripts/check-planning-locality.mjs` + `tests/check-planning-locality.test.mjs`; orchestrator owns all `.md` doctrine files.

## Exit criteria

CS35 close-out is permitted only when **all** of the following are true and recorded in `## Plan-vs-implementation review`:

1. REVIEWS.md / OPERATIONS.md / INSTRUCTIONS.md / CONVENTIONS.md updates per Deliverables 1–4 are landed.
2. `scripts/check-planning-locality.mjs` exists and is wired into `harness lint`. `node bin/harness.mjs lint --quiet` passes (linter count: prior + 1).
3. `tests/check-planning-locality.test.mjs` exists and passes; `node --test tests/*.test.mjs` total = prior + ≥3.
4. `node bin/harness.mjs sync --mode=check --cwd .` reports `No drift detected` (template parity).
5. Reviewer-dispatch canonical preamble exists in OPERATIONS.md as a fenced block delimited by `<!-- harness:reviewer-preamble:start -->` ... `<!-- harness:reviewer-preamble:end -->` markers; a new test `tests/operations-reviewer-preamble.test.mjs` asserts the markers exist, the block contains the required field set (`role`, `scope`, `independence-invariant`, `model-fallback-ladder`, `output-schema-link`), and the block is non-empty between markers. (Replaces the previous "verbatim-pastable + no-op dispatch" criterion which was subjective.)
6. The planning-locality linter is invoked against the harness repo itself and finds zero banned files.
7. CS36–CS41 planned CS files reference C35-N decisions by number (back-links in one direction).
8. LRN-XXX is filed and has status `applied`.
9. Plan-vs-implementation review (model picked from C35-2 ladder, independence invariant applied) verdict is `Go` against the locked decisions C35-1 through C35-17.

## Risks + open questions

- **R1 (low):** Doctrine sprawl across 4 files (REVIEWS / OPERATIONS / INSTRUCTIONS / CONVENTIONS). Mitigation: each file has a single deliverable list (Deliverables 1–4); orchestrator writes from one canonical source.
- **R2 (medium):** The planning-locality linter may flag legitimate files (e.g. consumer's `docs/PLAN-FOR-FOO.md`). Mitigation: the banned list is specific (C35-12); allow-list `template/**`. If a legitimate `PLAN.md`-shaped file emerges in another consumer, the linter exposes it and the rule is re-evaluated (LRN follow-up).
- **R3 (low):** The "agent does not file issues" rule (C35-13) is unenforceable mechanically because the agent uses the user's `gh` credentials. Mitigation: doctrine + orchestrator self-check; explicit prohibition in INSTRUCTIONS.md "Hard rules".
- **OQ1:** Is `template/composed/REVIEWS.md` updated in the same CS as `REVIEWS.md`, or is the template update folded into CS38a's PR-template migration? **Default:** in CS35 (managed-vs-composed shouldn't matter for doctrine — both must reflect the new shape). Sync-drift detection in CS38a then verifies consumers have picked up the changes.
- **OQ2:** Should `scripts/check-planning-locality.mjs` also flag `*.draft.md` or `*.scratch.md` patterns? **Default:** no — keep the rule narrow (named-file ban only). Re-evaluate after one consumer cycle.

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per [OPERATIONS.md § Claim](../../../OPERATIONS.md#claim)) | planned | — | — |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
