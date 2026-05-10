# CS15e — `harness init` private-tier detection (umbrella: CS04a)

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** Pre-CS16 backlog cleanup (planning PR for cs15-cleanup-planning, 2026-05-09); user authorization for Option C umbrella bundling 2026-05-09 ("you can add the CS structure needed to optimize for parralelism"); CS04a Q1–Q5 resolved by user via Q&A 2026-05-09.
**Depends on:** CS04 (CLI dispatcher), CS09 (init flow), CS15c (uses `--config` threading), CS15d (uses `lib/config-reader.mjs`)

## ⚠️ RESUME POINT — read this first if you're a fresh agent instance

This is the **third and final** umbrella in the pre-CS16 backlog cleanup
sequence: **CS15c → CS15d → CS15e**, executed sequentially.

CS15e absorbs the CS04a planned file only. It is the only umbrella that
introduces a genuinely new feature surface (private-tier detection at `init`
time + new `constraints` schema field) rather than refactoring/extending
existing surfaces. After CS15e closes, the next mainline CS is **CS16
(Bootstrap Sub Invaders)** which is the first downstream consumer of CS15e's
constraint-detection flow.

When this CS is claimed, the superseded planned file (`planned_cs04a_*.md`)
gets moved to `done/` at close-out with the standard "absorbed by CS15e"
pointer.

**Bootstrap to claim:** see `planned_cs15c_cli-surface-cleanup.md` § Bootstrap;
expected counts after CS15c+CS15d land: 578+/0 tests, 17/0/3 lint, no drift.

## Goal

When a consumer runs `harness init` against a repo, detect upfront whether the
consumer's GitHub repo is `private` + on the `free` tier and surface the same
disposition options that [LRN-001](../../../LEARNINGS.md#lrn-001) /
[LRN-002](../../../LEARNINGS.md#lrn-002) forced for `agent-harness` itself:

- **discipline-only enforcement** (default — operate without GitHub-side branch protection)
- **upgrade to GitHub Pro** (private repos get branch protection on Pro)
- **flip-public-when-ready** (defer the decision but plan to go public)

Avoid the mid-init "wait, I can't enable branch protection" surprise. Record
the constraints + chosen disposition in a new `constraints` field on
`harness.config.json` (additive, non-breaking) and a seeded
`.harness-known-constraints.md` artifact in the consumer repo.

This CS is also the **first** consumer-facing CLI command to make GitHub API
calls. Per the resolved decisions below, the harness preserves its zero-runtime-dep
posture using native Node `fetch()` (Path B) with a `lib/get-github-token.mjs`
helper that leaves a clean upgrade path to a future Path D
(`gh auth token` fallback).

## Absorbs

| Constituent | Origin | What it brings |
|---|---|---|
| [CS04a](../planned/planned_cs04a_harness-init-detect-private-tier.md) | LRN-002 (CS01 close-out) | All deliverables (5 below) |

## Resolved decisions (CS04a Q1–Q5 + autonomous design notes)

User-resolved via Q&A 2026-05-09:

| Q | Decision | Implementation note |
|---|---|---|
| **Q1** GitHub API path | **Path B**: native Node `fetch()` to api.github.com | New `lib/get-github-token.mjs` helper from day one (env-var read only); designed for trivial Path D upgrade later (add `gh auth token` fallback in the helper, no caller changes). |
| **Q2** Repo identity detection | **Auto-detect from `git remote get-url origin`** | Parse owner/repo from URL (handle `https://github.com/o/r(.git)?` and `git@github.com:o/r(.git)?`); if no remote present, skip detection + print a one-line notice. Init still proceeds. |
| **Q3** Disposition UX | **Non-interactive flag** `--constraint-disposition discipline-only\|upgrade-pro\|flip-public-when-ready` | Default to `discipline-only` if private+free is detected and no flag passed. Always print disposition options as a notice. Works in CI without TTY. Add `--skip-constraint-detection` flag for opt-out. |
| **Q4** `.harness-known-constraints.md` file class | **`seeded`** | Created at `init`, never touched by `sync`. Add to `template/seeded/`; `init` writes directly (not templated — substitution would need values that aren't known until detection runs). |
| **Q5** Priority/timing | **Do now** in this batch | Spec is fully resolved; consistent with clearing the deferred backlog before CS16. |

Autonomous design decisions:

| Decision | Choice | Rationale |
|---|---|---|
| `constraints` schema field | New optional `constraints: { tier, disposition, detected_at, owner, repo }` object on root `harness.config.json` | Additive (non-breaking → SemVer minor / v0.2.0). New ADR `0002-constraints-field.md` documents semantics. |
| `tier` enum values | `public \| private-free \| private-pro \| private-team \| private-enterprise \| unknown` | Covers all GitHub plan tiers + a fallback for missing token / API failure. |
| Anonymous fetch | Public repos use anonymous fetch (60/hr unauth limit; init makes 2 calls). Private repos without a token resolve to `tier: unknown` with a warning + the seeded artifact still written. | Avoids forcing token setup as a prerequisite. |
| `disposition` default in `discipline-only` | Default applies only when `tier === "private-free"`. Public repos record `disposition: null` (or omit) since the constraint doesn't apply. | Disposition is meaningful only for private+free. |
| New CLI flags | `--constraint-disposition <enum>` and `--skip-constraint-detection` (boolean) | Both have `requireValue` guards per LRN-040 where applicable. |

## Deliverables

### Helpers and detection (γ1)

- [ ] `lib/get-github-token.mjs` (NEW) — exports `getGitHubToken()` returning `process.env.GITHUB_TOKEN || null`. Helper structure ready for Path D upgrade (one fallback branch to add later, no caller changes).
- [ ] `lib/detect-repo-tier.mjs` (NEW) — exports `detectRepoTier({cwd})`:
  1. Read `git remote get-url origin` from cwd; parse owner/repo.
  2. If no remote, return `{tier: 'unknown', reason: 'no-remote'}`.
  3. If unable to parse, return `{tier: 'unknown', reason: 'unparseable-remote', remoteUrl}`.
  4. `fetch('https://api.github.com/repos/{owner}/{repo}')` (with token if available); on 404 → `{tier: 'unknown', reason: 'repo-not-found'}`; on 200 read `.visibility`.
  5. If visibility === 'private', `fetch('https://api.github.com/users/{owner}')` and read `.plan.name` → map `free|pro|team|enterprise` to `private-{name}`. Default `private-free` if `.plan` absent.
  6. If visibility === 'public', return `{tier: 'public', owner, repo}`.
- [ ] `tests/lib-github-detect.test.mjs` (NEW; ≥10 tests) covering: env-var token present/absent, no-remote, unparseable-remote, public-anonymous, public-with-token, private-with-token (free/pro/team/enterprise), private-without-token (unknown), 404, network error.

### Schema + ADR (γ2)

- [ ] `schemas/harness.config.schema.json`: add optional `constraints` object property to root with subfields `tier` (enum), `disposition` (enum), `detected_at` (string, date-time format), `owner` (string), `repo` (string). `additionalProperties: false`. Required-fields rule: if `constraints` is present, `tier` is required; `disposition` required only when `tier === 'private-free'`.
- [ ] `docs/adr/0002-constraints-field.md` (NEW) — ADR documenting: rationale (LRN-001/002 lineage), Path B fetch decision, Path D upgrade path, `tier` enum semantics, `disposition` semantics, when consumers should re-evaluate, interaction with `harness sync` and `harness lint` (both should adapt: e.g., don't suggest Ruleset checks if `disposition === 'discipline-only'`). Self-host `harness.config.json` may add a `constraints: { tier: "public", ... }` block as a smoke test of the new schema field.

### Seeded template (γ3)

- [ ] `template/seeded/.harness-known-constraints.md` (NEW) — markdown body explaining: tier, disposition, detected_at, owner/repo, the 3 dispositions (with explanations), "how to re-evaluate over time" pointer to `INSTRUCTIONS.md`. **Note:** init writes this file directly with substituted values (not via templating engine); this is a seeded skeleton with placeholder text.
- [ ] `template/seeded/harness.config.json` (extend) — add a commented `constraints` placeholder so consumer-init writes a valid stub.

### CLI flow (γ4)

- [ ] `bin/harness.mjs cmdInit` — new flow:
  1. Parse `--constraint-disposition` and `--skip-constraint-detection` flags (with help text).
  2. Unless `--skip-constraint-detection`, run `detectRepoTier({cwd: targetDir})` → `{tier, owner, repo, reason}`.
  3. If `tier === 'private-free'`: pick disposition from flag, default `discipline-only`. Print disposition options notice always.
  4. Write `.harness-known-constraints.md` to targetDir from `template/seeded/` with substituted values.
  5. Write `constraints: {tier, disposition, detected_at: <iso>, owner, repo}` into the consumer's `harness.config.json` (after init's existing config writes).
  6. Print summary line: `"Constraints detected: tier=X, disposition=Y. See .harness-known-constraints.md for details."`
- [ ] `tests/cli.test.mjs` extension (≥8 new tests):
  - `init` against a fixture with mocked `git remote` returning github URL → fetch is mocked → assertion: constraints written.
  - All 3 dispositions → asserted writes.
  - `--skip-constraint-detection` skips the flow.
  - `init` against a fixture with no remote → assertion: skip notice + init proceeds.
  - `init` against a fixture with a non-github remote (e.g. gitlab) → tier: unknown.
  - Anonymous fetch path (no token, public repo) → assertion: works.
  - Private repo + no token → tier: unknown + warning.
  - `--constraint-disposition <invalid>` → exit 2 with documented enum values.

### Doc updates (γ5)

- [ ] `template/managed/INSTRUCTIONS.md` — new subsection "Re-evaluating private-tier disposition" covering when to re-check, how to update `harness.config.json`'s `constraints`, and when to delete `.harness-known-constraints.md`. Per [LRN-049](../../../LEARNINGS.md#lrn-049) flat keys only; per [LRN-050](../../../LEARNINGS.md#lrn-050) consumer-root-relative paths only.
- [ ] Re-render root `INSTRUCTIONS.md` via `harness sync --mode=apply --resolved-sha <content-commit-sha> --cwd .` per [LRN-070/074](../../../LEARNINGS.md#lrn-070).

## Sub-agent fan-out

**5 sub-agents, single wave** (4 parallel + 1 orchestrator-owned).

| Agent | Owns (write-allowed) | Deliverables |
|---|---|---|
| γ1 | `lib/get-github-token.mjs` + `lib/detect-repo-tier.mjs` + `tests/lib-github-detect.test.mjs` | Detection helpers + tests |
| γ2 | `schemas/harness.config.schema.json` + `docs/adr/0002-constraints-field.md` + harness self-host `harness.config.json` (constraints block as smoke test) | Schema + ADR + smoke-test self-host |
| γ3 | `template/seeded/.harness-known-constraints.md` + `template/seeded/harness.config.json` (constraints placeholder addition) | Seeded artifacts |
| γ4 (orchestrator) | `bin/harness.mjs` `cmdInit` (only — restrict scope to function body of `cmdInit` and SUBCOMMAND_HELP['init']) + `tests/cli.test.mjs` (init tests appendix) | Init flow + CLI tests |
| γ5 | `template/managed/INSTRUCTIONS.md` + root re-render via `--resolved-sha` | Doc updates + lock-fixup |

**File ownership disjointness:** ✅ — note γ4's `bin/harness.mjs` scope is restricted to `cmdInit` (no overlap with γ2's schema or γ3's templates).

**Sequencing within the CS:**
- γ1, γ2, γ3, γ5 dispatch in parallel; γ4 runs once γ1's API signature and γ3's template body are stable. Orchestrator can stub the helper signature ahead of time.

## Exit criteria

- 578+ tests still pass (CS-α + CS-β cumulative; CS-γ adds ≥18 new: ≥10 detect helper + ≥8 init flow).
- `harness lint --quiet`: 17/0/3 unchanged (CS-γ adds no new linters).
- `harness sync --mode=check --cwd .`: "No drift detected".
- `validate-schemas.mjs`: 4 schemas still pass; new `constraints` field validates correctly against test inputs.
- New consumer init in tempdir with a mocked git remote produces a valid `.harness-known-constraints.md` and the `constraints` block in `harness.config.json`.
- `harness init --constraint-disposition discipline-only` records the disposition.
- `harness init` against a repo with no remote prints "skipped detection" notice and proceeds without error.
- `harness init --skip-constraint-detection` skips the flow entirely.
- One superseded planned file moved to `done/` with `**Status:** done` and "absorbed by CS15e" note.

## LRN range reservation

LRN-095..099 reserved for CS15e. Expected ~3-5 LRNs (likely: getGitHubToken-helper-shape decision recorded, fetch-mocking pattern, seeded-artifact-with-init-side-effects pattern, Path B → Path D upgrade-path validation, ADR-with-CS pattern).

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per [OPERATIONS.md § Claim](../../../OPERATIONS.md#claim)) | planned | — | — |
| Close-out: docs + restart state (CONTEXT/WORKBOARD/HANDOFF + this CS file's RESUME POINT) | planned | — | — |
| Close-out: learnings + follow-ups (LEARNINGS.md within LRN-095..099 + supersede 1 planned file + file follow-up CS for Path D upgrade if appropriate) | planned | — | — |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
