# CS15e — `harness init` private-tier detection (umbrella: CS04a)

**Status:** done
**Owner:** yoga-ah
**Branch:** cs15e/content (merged in PR #95, 2026-05-10) → cs15e/close-out (this PR)
**Started:** 2026-05-10
**Closed:** 2026-05-10
**Filed by:** Pre-CS16 backlog cleanup (planning PR for cs15-cleanup-planning, 2026-05-09); user authorization for Option C umbrella bundling 2026-05-09 ("you can add the CS structure needed to optimize for parralelism"); CS04a Q1–Q5 resolved by user via Q&A 2026-05-09.
**Depends on:** CS04 (CLI dispatcher), CS09 (init flow), CS15c (uses `--config` threading), CS15d (uses `lib/config-reader.mjs`)

## ⚠️ RESUME POINT — read this first if you're a fresh agent instance

**This CS is DONE.** Content PR #95 merged 2026-05-10; close-out PR forthcoming on `cs15e/close-out`. The pre-CS16 backlog cleanup sequence (CS15c → CS15d → CS15e) is now COMPLETE. The next mainline CS is **CS16 (Bootstrap Sub Invaders)** — the first downstream consumer of CS15e's constraint-detection flow. See `WORKBOARD.md` and `INSTRUCTIONS.md` for the next CS to claim.

This is the **third and final** umbrella in the pre-CS16 backlog cleanup
sequence: **CS15c → CS15d → CS15e**, executed sequentially.

CS15e absorbs the CS04a planned file only. It is the only umbrella that
introduces a genuinely new feature surface (private-tier detection at `init`
time + new `constraints` schema field) rather than refactoring/extending
existing surfaces.

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
| `constraints` schema field | New optional `constraints: { tier, disposition, detected_at, owner, repo }` object on root `harness.config.json` | Additive (non-breaking → SemVer minor / v0.2.0). New ADR `0003-constraints-field.md` documents semantics. |
| `tier` enum values | `public \| private-free \| private-pro \| private-team \| private-enterprise \| unknown` | Covers all GitHub plan tiers + a fallback for missing token / API failure. |
| Anonymous fetch | Public repos use anonymous fetch (60/hr unauth limit; init makes 2 calls). Private repos without a token resolve to `tier: unknown` with a warning + the seeded artifact still written. | Avoids forcing token setup as a prerequisite. |
| `disposition` representation | When the disposition isn't applicable (any tier other than `private-free`), the `disposition` key is **omitted entirely** from `constraints` (not set to `null`). Schema enforces this via `if/then/else`. | Schemas with mixed `null`/omit are confusing; omit-when-N/A is the cleaner JSON Schema pattern and aligns with Ajv's strictness defaults. |
| New CLI flags | `--constraint-disposition <enum>` and `--skip-constraint-detection` (boolean) | Both have `requireValue` guards per LRN-040 where applicable. |
| **CS15d helper integration (γ4)** | γ4's init flow MUST use `loadConfig({cwd, configPath})` from `lib/config-reader.mjs` (delivered by CS15d β1) to read the consumer `harness.config.json` before merging in the new `constraints` block, then write back via the same module's `writeConfig({cwd, config})` writer (γ4 to add the writer if β1 didn't ship one). This is the operational evidence of the CS15d → CS15e dependency. | Otherwise the dependency is declarative-only and risks drift between init's read path and sync's read path (LRN-039 schema-first discipline). |

## Deliverables

### Helpers and detection (γ1)

- [ ] `lib/get-github-token.mjs` (NEW) — exports `getGitHubToken()` returning `process.env.GITHUB_TOKEN || null`. Helper structure ready for Path D upgrade (one fallback branch to add later, no caller changes).
- [ ] `lib/detect-repo-tier.mjs` (NEW) — exports `detectRepoTier({cwd})`:
  1. Read `git remote get-url origin` from cwd; parse owner/repo.
  2. If no remote, return `{tier: 'unknown', reason: 'no-remote'}`.
  3. If unable to parse, return `{tier: 'unknown', reason: 'unparseable-remote', remoteUrl}`.
  4. `fetch('https://api.github.com/repos/{owner}/{repo}')` (with token if available); on 404 → `{tier: 'unknown', reason: 'repo-not-found'}`; on 200 read `.visibility` AND `.owner.type` (`User` or `Organization` — record verbatim in result).
  5. If visibility === 'private', `fetch('https://api.github.com/{users|orgs}/{owner}')` (route on `.owner.type` from step 4) and read `.plan.name` → map `free|pro|team|enterprise` to `private-{name}`. **If `.plan` is absent or `.plan.name` is unrecognized:** return `{tier: 'unknown', reason: 'plan-data-unavailable'}` (do NOT default to `private-free` — that would be a misleading over-warn).
  6. If visibility === 'public', return `{tier: 'public', owner, repo}`.
- [ ] `tests/lib-github-detect.test.mjs` (NEW; ≥10 tests) covering: env-var token present/absent, no-remote, unparseable-remote, public-anonymous, public-with-token, private-with-token (free/pro/team/enterprise — both User-owner and Org-owner code paths), private-without-token (unknown), private-with-token-but-plan-absent (unknown), 404, network error.

### Schema + ADR (γ2)

- [ ] `schemas/harness.config.schema.json`: add optional `constraints` object property to root with subfields `tier` (enum: `public | private-free | private-pro | private-team | private-enterprise | unknown`), `disposition` (enum: `discipline-only | upgrade-pro | flip-public-when-ready` — `null` is **not** an enum value; `disposition` is **omitted entirely** when not applicable), `detected_at` (string, date-time format), `owner` (string), `repo` (string). `additionalProperties: false`. Conditional rule via `if/then/else`: when `constraints.tier === 'private-free'`, `disposition` is required; otherwise it must be omitted.
- [ ] `docs/adr/0003-constraints-field.md` (NEW) — ADR documenting: rationale (LRN-001/002 lineage), Path B fetch decision, Path D upgrade path, `tier` enum semantics, `disposition` semantics (omitted when not applicable, never null), when consumers should re-evaluate, interaction with `harness sync` and `harness lint` (both should adapt: e.g., don't suggest Ruleset checks if `disposition === 'discipline-only'`). Self-host `harness.config.json` may add a `constraints: { tier: "public", ... }` block as a smoke test of the new schema field.

### Seeded template (γ3)

- [ ] `template/seeded/.harness-known-constraints.md` (NEW) — markdown body explaining: tier, disposition, detected_at, owner/repo, the 3 dispositions (with explanations), "how to re-evaluate over time" pointer to `INSTRUCTIONS.md`. **Note:** init writes this file directly with substituted values (not via templating engine); this is a seeded skeleton with placeholder text.
- [ ] `template/seeded/harness.config.json` (extend) — add a commented `constraints` placeholder so consumer-init writes a valid stub.

### CLI flow (γ4)

- [ ] `bin/harness.mjs cmdInit` — new flow:
  1. Parse `--constraint-disposition` and `--skip-constraint-detection` flags (with help text).
  2. Unless `--skip-constraint-detection`, run `detectRepoTier({cwd: targetDir})` → `{tier, owner, repo, reason, ownerType?}`.
  3. If `tier === 'private-free'`: pick disposition from flag, default `discipline-only`. Print disposition options notice always.
  4. Write `.harness-known-constraints.md` to targetDir from `template/seeded/` with substituted values.
  5. **Use `lib/config-reader.mjs::loadConfig({cwd: targetDir})` (delivered by CS15d β1)** to read the consumer's `harness.config.json`, merge in `constraints: {tier, [disposition,] detected_at: <iso>, owner, repo}` (omit `disposition` when not applicable), and write the merged config back via `lib/config-reader.mjs::writeConfig({cwd, config})` (γ4 adds the writer if β1 didn't include one — see § Resolved decisions).
  6. **Append a one-line reference to `.harness-known-constraints.md` into the consumer's `CONTEXT.md`** under a new H2 (or extend an existing "Constraints" H2 if present), using the same flat-key + consumer-root-relative-path discipline as managed templates ([LRN-049](../../../LEARNINGS.md#lrn-049), [LRN-050](../../../LEARNINGS.md#lrn-050)). This is a CS04a-original exit criterion (`planned_cs04a_*.md` line 27) carried forward into CS15e.
  7. Print summary line: `"Constraints detected: tier=X, disposition=Y. See .harness-known-constraints.md for details."`
- [ ] `tests/cli.test.mjs` extension (≥10 new tests):
  - `init` against a fixture with mocked `git remote` returning github URL → fetch is mocked → assertion: constraints written.
  - All 3 dispositions → asserted writes.
  - `--skip-constraint-detection` skips the flow.
  - `init` against a fixture with no remote → assertion: skip notice + init proceeds.
  - `init` against a fixture with a non-github remote (e.g. gitlab) → tier: unknown.
  - Anonymous fetch path (no token, public repo) → assertion: works.
  - Private repo + no token → tier: unknown + warning.
  - Private repo + token but `.plan` data absent → tier: unknown (NOT `private-free`).
  - `--constraint-disposition <invalid>` → exit 2 with documented enum values.
  - `init` writes a CONTEXT.md `.harness-known-constraints.md` reference exactly once even on re-runs (idempotent).
  - `init`'s read of `harness.config.json` goes through `lib/config-reader.mjs::loadConfig` (assert via spy/mock or by introducing a tracer in the helper module).

### Doc updates (γ5)

- [ ] `template/managed/INSTRUCTIONS.md` — new subsection "Re-evaluating private-tier disposition" covering when to re-check, how to update `harness.config.json`'s `constraints`, and when to delete `.harness-known-constraints.md`. Per [LRN-049](../../../LEARNINGS.md#lrn-049) flat keys only; per [LRN-050](../../../LEARNINGS.md#lrn-050) consumer-root-relative paths only.
- [ ] Re-render root `INSTRUCTIONS.md` via `harness sync --mode=apply --resolved-sha <content-commit-sha> --cwd .` per [LRN-070/074](../../../LEARNINGS.md#lrn-070).

## Sub-agent fan-out

**5 sub-agents, single wave** (4 parallel + 1 orchestrator-owned).

| Agent | Owns (write-allowed) | Deliverables |
|---|---|---|
| γ1 | `lib/get-github-token.mjs` + `lib/detect-repo-tier.mjs` + `tests/lib-github-detect.test.mjs` | Detection helpers + tests |
| γ2 | `schemas/harness.config.schema.json` + `docs/adr/0003-constraints-field.md` + harness self-host `harness.config.json` (constraints block as smoke test) | Schema + ADR + smoke-test self-host |
| γ3 | `template/seeded/.harness-known-constraints.md` + `template/seeded/harness.config.json` (constraints placeholder addition) | Seeded artifacts |
| γ4 (orchestrator) | `bin/harness.mjs` `cmdInit` (only — restrict scope to function body of `cmdInit` and SUBCOMMAND_HELP['init']) + `tests/cli.test.mjs` (init tests appendix) | Init flow + CLI tests |
| γ5 | `template/managed/INSTRUCTIONS.md` (template-side edit only) + new `template/seeded/CONTEXT.md` placeholder for the new "Constraints" H2 (so init can reliably append into it) | Doc updates and template-side edit only |

**File ownership disjointness:** ✅ — note γ4's `bin/harness.mjs` scope is restricted to `cmdInit` (no overlap with γ2's schema or γ3's templates).

**Sequencing within the CS:**
- γ1, γ2, γ3, γ5 dispatch in parallel; γ4 runs once γ1's API signature and γ3's template body are stable. Orchestrator can stub the helper signature ahead of time.
- **Sub-agents do NOT commit** ([OPERATIONS.md § Sub-agent dispatch](../../../OPERATIONS.md#sub-agent-dispatch); [LRN-021](../../../LEARNINGS.md#lrn-021) no-commit preflight). Agents stage edits and report back. The orchestrator stages all sub-agent output, runs full validation, makes a single content commit, and then does the post-commit lock-fixup re-render of root `INSTRUCTIONS.md` via `node bin/harness.mjs sync --mode=apply --resolved-sha <content-commit-sha> --cwd .` per [LRN-070/074](../../../LEARNINGS.md#lrn-070) (CS11b's `--resolved-sha` flag).

## Exit criteria

- 578+ tests still pass (CS-α + CS-β cumulative; CS-γ adds ≥20 new: ≥10 detect helper + ≥10 init flow).
- `harness lint --quiet`: 17/0/3 unchanged (CS-γ adds no new linters).
- `harness sync --mode=check --cwd .`: "No drift detected".
- `validate-schemas.mjs`: 4 schemas still pass; new `constraints` field validates correctly against test inputs (positive: `private-free` requires `disposition`; positive: `public` rejects `disposition`; negative: `disposition: null` rejected).
- New consumer init in tempdir with a mocked git remote produces a valid `.harness-known-constraints.md` and the `constraints` block in `harness.config.json` written via `lib/config-reader.mjs::writeConfig` (asserted by spy/mock).
- **Consumer's `CONTEXT.md` post-init contains a one-line reference to `.harness-known-constraints.md`** (this is a CS04a-original exit criterion carried forward — `planned_cs04a_*.md` line 27).
- `harness init --constraint-disposition discipline-only` records the disposition.
- `harness init` against a repo with no remote prints "skipped detection" notice and proceeds without error.
- `harness init --skip-constraint-detection` skips the flow entirely.
- Private repo with a token but no `.plan` data → tier resolves to `unknown` (NOT `private-free`).
- Re-running `init` is idempotent w.r.t. the CONTEXT.md reference (no duplicate lines).
- One superseded planned file moved to `done/` with `**Status:** done` and "absorbed by CS15e" note.

## LRN range reservation

LRN-095..099 reserved for CS15e. Expected ~3-5 LRNs (likely: getGitHubToken-helper-shape decision recorded, fetch-mocking pattern, seeded-artifact-with-init-side-effects pattern, Path B → Path D upgrade-path validation, ADR-with-CS pattern).

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| Claim PR (rename planned → active; populate Tasks; WORKBOARD update) | done | yoga-ah | branch `workboard/cs15e-claim`; PR #94 |
| γ1: `lib/get-github-token.mjs` + `lib/detect-repo-tier.mjs` + `tests/lib-github-detect.test.mjs` (≥10 tests) | done | sub-agent γ1 | 12 tests initial; +3 added during NEEDS-FIX response (private-team, private-enterprise, anonymous-against-private) for 15 total |
| γ2: `schemas/harness.config.schema.json` (constraints subschema with if/then/else) + `docs/adr/0003-constraints-field.md` + harness self-host smoke block + 6 fixtures + 6 schema tests | done | sub-agent γ2 | 6/6 schema tests; ADR renamed 0002→0003 due to collision with existing 0002-readme-ownership.md |
| γ3: `template/seeded/.harness-known-constraints.md` (NEW) + (chosen Option A: leave seeded harness.config.json untouched) | done | sub-agent γ3 | 62-line skeleton with substitution tokens; HTML comment block stripped at write time by γ4 |
| γ4 (orchestrator): `bin/harness.mjs` cmdInit (flags + detection block) + `lib/config-reader.mjs::writeConfig` + `tests/cli.test.mjs` (12 → 14 init tests after NEEDS-FIX strengthening) | done | yoga-ah | HARNESS_DETECT_TIER_OVERRIDE env hook for deterministic CLI tests; idempotent CONTEXT.md regex; 3 NEEDS-FIX gaps fixed (skip-summary leak, missing disposition notice, broken `\Z` anchor) |
| γ5: `template/managed/INSTRUCTIONS.md` re-evaluation subsection + `template/seeded/CONTEXT.md` ## Constraints anchor | done | sub-agent γ5 | +47 lines INSTRUCTIONS.md; +4 lines CONTEXT.md |
| Race fix: `tests/lib-github-detect.test.mjs` tempRoot `process.cwd()` → `os.tmpdir()` (and `tests/render-deploy-summary.test.mjs` pre-existing race) | done | yoga-ah | recursive linter ENOENT during parallel test runs; documented as LRN-094 |
| Re-render root `INSTRUCTIONS.md` via `harness sync --mode=apply --resolved-sha <content-sha>` | done | yoga-ah | per LRN-070/074; commit d0211d0 |
| Plan-vs-implementation review (GPT-5.5) | done | yoga-ah | per LRN-064 mandatory close-out gate; initial NEEDS-FIX (3 blocking gaps), re-review GO after fixes (commit 27f56ae) |
| Open content PR; CI green; admin merge | done | yoga-ah | PR #95 merged 2026-05-10 (squash, 4 commits → 962c866) |
| Close-out: docs + restart state (CONTEXT/WORKBOARD/HANDOFF + this CS file's RESUME POINT; rename active → done; `git mv` planned_cs04a to done/ with "absorbed by CS15e" pointer) | done | yoga-ah | done in cs15e/close-out branch (this PR) |
| Close-out: learnings + follow-ups (LEARNINGS.md within LRN-092..099; re-check max LRN id per LRN-086) | done | yoga-ah | LRN-092..094 filed; reservation range LRN-095..099 not used (only 3 LRNs needed) |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

### Initial review (NEEDS-FIX)

**Reviewer:** GPT-5.5 (sub-agent dispatch via Sonnet orchestrator)
**Date:** 2026-05-10
**Branch:** cs15e/content
**Content commit:** b9aeba4
**Lock-fixup commit:** d0211d0
**Outcome:** NEEDS-FIX (superseded by re-review GO below)

Three blocking gaps surfaced, all in `bin/harness.mjs cmdInit`:

1. Skip-path summary still printed `See .harness-known-constraints.md for details` even when the file was deliberately not written (no-remote / tier=unknown path) — user-misleading.
2. The CS plan (line 110) required a 3-option disposition notice at init time when tier=private-free; the implementation only wrote the chosen disposition into the artifact and a one-line summary.
3. The `CONTEXT.md ## Constraints` section-replacement regex used `\Z` as the EOF anchor; JS regex does not recognise `\Z` (it is interpreted as a literal `Z`), so the regex would have failed to match when `## Constraints` was the LAST H2 in `CONTEXT.md`, producing duplicate headings on re-run. The seeded `CONTEXT.md` ships with H2s after `## Constraints`, which masked the bug; the test only checked heading-count, not reference-line-count.

Recommendations (non-blocking):
- Add explicit `private-team` / `private-enterprise` / anonymous-against-private (404 → repo-not-found) tests to the γ1 test matrix.
- Strengthen idempotency assertions to count reference lines, not just headings.

### Re-review after NEEDS-FIX (GO)

**Reviewer:** GPT-5.5 (re-review)
**Date:** 2026-05-10
**Branch:** cs15e/content
**Fix commit:** 27f56ae
**Prior verdict:** NEEDS-FIX (3 gaps)
**Outcome:** GO

**Gap re-checks:**
- Gap 1 (skip-path summary): RESOLVED — `bin/harness.mjs:764-769` now prints `Constraints detection: tier=${tier}${reasonText}. No constraints recorded.` on the no-`owner && repo` path, with `reasonText` from `detection.reason`, and no `.harness-known-constraints.md` reference. `tests/cli.test.mjs:1250-1275` exercises `tier=unknown` / `reason=no-remote` and asserts no `See .harness-known-constraints.md for details`, plus `No constraints recorded` and `reason=no-remote`.
- Gap 2 (disposition notice): RESOLVED — `bin/harness.mjs:649-663` unconditionally emits a multi-line stdout notice for `tier === 'private-free'` listing all 3 dispositions (`discipline-only`, `upgrade-pro`, `flip-public-when-ready`) and the selected disposition. `tests/cli.test.mjs:1198-1215` asserts stdout includes `Disposition options` and all 3 choices.
- Gap 3 (regex EOF anchor + idempotency test): RESOLVED — `bin/harness.mjs:724-739` uses `const headingRe = /^## Constraints[ \t]*\r?\n[\s\S]*?(?=^## |$(?![\s\S]))/m;`, so `\Z` is gone and JS-native EOF handling is in place. `tests/cli.test.mjs:1295-1312` strengthens idempotency by asserting both heading-count and ref-line-count are 1, and `tests/cli.test.mjs:1318-1351` adds the explicit “LAST H2 in CONTEXT.md” mutation/re-run test with both counts asserted as 1.

**Recommendation follow-up (landed in 27f56ae):**
- private-team / private-enterprise tests landed: YES — `tests/lib-github-detect.test.mjs:207-244`
- anonymous-against-private test landed: YES — `tests/lib-github-detect.test.mjs:246-273`

**New gaps introduced by the fix commit:** none.

**Final verdict:** GO. Cleared for content-PR + close-out.
