# CS82 — Lock provenance robustness under npx installs (#352-F2)

**Status:** done
**Owner:** omni-ah-c2
**Branch:** cs82/content
**Started:** 2026-07-02
**Closed:** 2026-07-02
**Filed by:** omni-ah-c2 (Claude Opus 4.8), 2026-07-01 — from the consumer-feedback triage of issue **#352** (Finding 2), filed by the sub-invaders orchestrator (`omni-si`) during the v0.10.0 pin bump (consumer PR henrik-me/sub-invaders#129). @henrik-me directed the two-CS split (CS81 = doc dangling-ref fixes; this CS = the sync lock-provenance code fix).
**Depends on:** none (hard). **Revives CS26 decision C26-4** (the npx-cache lock-provenance strategy CS26's 2026-06-09 disposition wrongly marked "Obsolete/Done"). CS26 remains a separate stale bundle for its other live findings (#2/#3/#6/#9); this CS extracts only the lock-provenance strand.

## Goal

Make `harness sync --mode=apply` record **correct** pin provenance (`harness_ref`, `resolved_sha`, per-scaffold `version`) when run from an `npm`/`npx` install — or **fail loudly** if it genuinely cannot — instead of silently writing placeholder values (`harness_ref: "unknown"`, `resolved_sha: 0×40`, scaffold `version: "unknown"`).

## Background

Verified against `main` (HEAD `1e129fb`):

- `lib/sync.mjs:261-294` `resolveHarnessRef(harnessRepoPath)` derives provenance by shelling `git -C <install> rev-parse HEAD` + `git describe --tags --exact-match HEAD` (fallback `rev-parse --abbrev-ref HEAD`, then `sha[:7]`) against the **harness install directory**. On any failure it returns `{ harness_ref: 'unknown', resolved_sha: '0'.repeat(40) }` (`:294`).
- `lib/sync.mjs:834` calls it; `:838` `resolved_sha = resolvedShaOverride ?? resolved_sha_from_git` (so `--resolved-sha` fixes **only** `resolved_sha`, never `harness_ref`); `:1148` `scaffolds.map(name => ({ name, version: harness_ref }))` (so scaffold versions inherit `harness_ref`).
- An `npx -y github:henrik-me/agent-harness#v0.10.0 sync --mode=apply` install has **no `.git`** (npm strips it from a `github:` spec), so both `git` probes fail → the `:294` placeholder fallback fires and every provenance field is written wrong. A git-aware local checkout at the tag stamps everything correctly (the omni-si workaround for henrik-me/sub-invaders#129).

**Why no gate caught it:** CI `harness-sync-check` runs `sync --mode=check`, which validates **file-content drift only** — not `harness_ref` / `resolved_sha` / scaffold versions — so a corrupt lock ships green. And the documented consumer invocation (`OPERATIONS.md § Sync`) tells consumers to run via `npx github:…#<ref>` (to match CI) without warning that `--mode=apply` from a `.git`-less install cannot stamp the lock.

**Why not `config.version` (the issue's suggestion):** `config.version` is unreliable as the provenance source — it is `0.0.0-pre` in the harness's own `harness.config.json`, and a possibly-stale seed value in a consumer (CS26 Finding #2 is precisely that the seeded `version` is not reliably the pin). The **npx-cache** resolution (C26-4) reads the *actual* resolved ref→SHA of the running install and is authoritative.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C82-1 | Scope | Fix **only** lock-provenance robustness for `sync --mode=apply` (`harness_ref`, `resolved_sha`, scaffold `version`). Do **not** pull in CS26's other findings (#2 seed config.version, #3 placeholder linter, #6 `.gitkeep`, #9 `.gitattributes`) — they remain in the separate stale CS26 bundle. | Bounded, testable code change matching the confirmed #352-F2 defect. |
| C82-2 | Derivation order | **(1)** npx/npm-cache resolution — from the running module (`import.meta.url`) walk up to the harness package root, then read the **parent install project's** `node_modules/.package-lock.json` entry for the harness package (`packages["node_modules/<pkg-name>"]`): its `resolved` is a `git+https://…#<40-hex-sha>` URL (the resolved commit SHA) and its `version`/spec carries the requested ref. **Not** the harness package's own `packages[""]` (a `github:` install has no `resolved` there — `package-lock.json:6-23`). **(2)** git self-host — the existing `resolveHarnessRef` git probes (checkouts). **(3)** fail-closed (C82-3). Reject `config.version` as a source (unreliable — self-host `0.0.0-pre`). | The install project's lock stores the authoritative ref→SHA of exactly the harness install that is running; git works for self-host/checkouts; anything else is a guess. |
| C82-3 | Fail-closed backstop | **Apply-mode only:** if no path yields a real ref **and** a valid 40-hex non-zero SHA, **throw** a `SyncError` (new code `ESYNC_UNRESOLVED_PROVENANCE`) and **write nothing** — never persist a lock whose `harness_ref === 'unknown'` or `resolved_sha` is all-zero. Because `harness_ref` cannot be overridden on the CLI (C82-5), the actionable message **leads with** "run from a git checkout at the ref" or "ensure the npx/npm install's `.package-lock.json` is present"; `--resolved-sha` is noted only as fixing the SHA *once a real `harness_ref` is derivable* — not a standalone escape hatch. `--mode=check`/`--mode=dry-run` do **not** enforce this (C82-8), so they never start red-flagging existing corrupt locks. | The harness's own fail-closed doctrine ([LRN-033]); silent wrong provenance is worse than a loud, fixable error. Apply-only scoping avoids breaking `--mode=check` (which resolves provenance + builds `lockAfter` for all modes today — `lib/sync.mjs:833-839,1142-1154`). |
| C82-4 | Scaffold versions | Derive each scaffold `version` from the resolved `harness_ref` (unchanged mapping at `:1148`), which is now guaranteed non-placeholder by C82-2/C82-3. | Keeps the existing scaffold-version semantics; the fix is upstream (a real `harness_ref`). |
| C82-5 | `harness_ref` override surface | Do **not** add a new `--harness-ref` flag. C82-2 populates `harness_ref` from the npx-cache/git resolution; `--resolved-sha` continues to override only `resolved_sha` (`lib/sync.mjs:834-838`, `bin/harness.mjs:1869-1879`). If npx-cache yields a SHA but no symbolic ref, `harness_ref` takes the requested ref from the install spec/`from` field; if **neither** ref nor SHA is derivable there is **no** manual override — apply fails-closed (C82-3) directing the user to a git checkout / present npx cache. So `--resolved-sha` alone cannot rescue a cacheless-no-git apply, and the C82-3 error must not imply it can. | Avoids new CLI surface (keeps SemVer patch, C82-9); the resolution already knows the ref, and honest guidance beats a misleading escape hatch. |
| C82-6 | Docs | `OPERATIONS.md § Sync` (+ `template/composed/OPERATIONS.md` lockstep): add a **"Lock provenance"** note documenting the derivation chain + fail-closed behaviour + the npx-vs-checkout guidance the issue flagged as missing; refresh the `--resolved-sha` flag note to state it overrides only `resolved_sha`. | Closes the documentation gap #352-F2 names; keeps roots ↔ composed in lockstep. |
| C82-7 | Tests | Add a narrow **test seam** — an exported pure helper for provenance resolution (git/fs/cache injectable) — since `resolveHarnessRef` is private and hard-wires `execSync` today (`lib/sync.mjs:15,261-294`) and `sync()` has no injection args (`:700-711`). New `tests/*.test.mjs` (`os.tmpdir()` only): npx-cache lock present → real ref+SHA + matching scaffold versions; git self-host → existing path; **neither → apply fail-closed `ESYNC_UNRESOLVED_PROVENANCE`** (no lock written); npx-cache SHA-without-ref → fail-closed; `--resolved-sha` override still honoured. **Also update existing sync tests** that build `.git`-less temp harnesses and currently accept the all-zero/placeholder path (`tests/sync.test.mjs:61-86`, `:1835-1841`). | Proves each branch + the fail-closed backstop without environment coupling; the existing tests encode the *old* placeholder behaviour and must be migrated to the seam. |
| C82-8 | Check-mode provenance validation | **Out of scope (OQ1).** Whether `sync --mode=check` should also flag placeholder provenance (so consumer CI catches an already-corrupt lock) is deferred — it risks red-flagging existing consumers with committed placeholder locks and is a separate consumer-CI concern. This CS's fail-closed enforcement (C82-3) is therefore **apply-mode only**; check/dry-run stay best-effort so they never change behaviour on existing locks. | Keeps this CS a bounded producer-side fix; the check-side validation is a follow-up with its own migration consideration. |
| C82-9 | SemVer + back-compat | **Patch** (no new CLI surface, no new flag; a bug fix). Self-host + git-checkout apply paths are unchanged (still derive from git); only the previously-placeholder npx path changes (now derives, or fails-closed with guidance). Existing consumers with a committed placeholder lock are unaffected until their next `--mode=apply`, which then derives or errors actionably. | Honors § SemVer policy (bug fix ⇒ patch); the behaviour change is confined to the broken path. |

## Deliverables

1. `lib/sync.mjs` (edit) — npx-cache resolution + reordered derivation chain + an explicit `validateResolvedProvenance()`-style guard that (apply mode) throws `ESYNC_UNRESOLVED_PROVENANCE` on `harness_ref==='unknown'` / all-zero `resolved_sha` **before** `writeLock` (C82-2/C82-3/C82-4/C82-5), plus the exported provenance-resolution seam (C82-7). Note: the lock **schema** accepts any `harness_ref` string + any 40-hex SHA incl. all-zero (`schemas/harness-lock.schema.json:18-25`) and `writeLock`/`newEmptyLock` only enforce the schema (`lib/lock.mjs:138-185`), so this guard is required in `sync.mjs`; do **not** tighten the schema (it would fail-closed on *reading* an existing placeholder lock).
2. `OPERATIONS.md` + `template/composed/OPERATIONS.md` (edit, lockstep) — the "Lock provenance" note + `--resolved-sha` refresh (C82-6).
3. `tests/*.test.mjs` (new, `os.tmpdir()` only) — the branches per C82-7, **plus** updates to existing `tests/sync.test.mjs` fixtures (`:61-86`, `:1835-1841`) that relied on `.git`-less temp harnesses writing all-zero SHAs.
4. `LEARNINGS.md` (edit) — file a learning: provenance must not derive solely from the CLI's own `.git` (npx strips it); derive from the install's `package-lock.json` `resolved` or fail-closed, never write placeholders; `sync --mode=check` does not validate provenance. Flip `applied` at close-out with the merge SHA.
5. `CHANGELOG.md` (edit) — `[Unreleased]` Fixed entry.

## User-approval gates

- **G-issue-close** — confirm whether the agent or @henrik-me closes #352 at merge (shared with CS81; #352 has two findings — close only when *both* F1 (CS81) and F2 (this CS) have shipped).

## Exit criteria

- `sync --mode=apply` from an npx/npm install records a real `harness_ref` + 40-hex `resolved_sha` + real scaffold versions when the cache is present, and **fails-closed** (no lock written) when provenance is underivable — verified by tests.
- Self-host + `--resolved-sha` paths still behave as before; `node --test tests/*.test.mjs` passes; `node bin/harness.mjs lint --quiet` exits 0; `harness sync --mode=check` = no drift (roots ↔ composed lockstep).
- #352-F2 addressed; #352 closed per G-issue-close once F1 (CS81) has also shipped.

## Risks + open questions

- **R1 — npx-cache layout fragility.** npm's `package-lock.json` shape (`packages["node_modules/<pkg-name>"].resolved`) could change across versions. Mitigation: read the running install's parent-project lock robustly; if the `resolved` field is absent, **fail-closed** (C82-3), never placeholder. Test the absent-field path.
- **R2 — locating the running install's package-lock.** Across npx / npm-global / self-host the install root differs. Mitigation: resolve from the harness module path (`import.meta.url` walked up to the install root) with a documented fallback chain ending in fail-closed; cover with an injected-seam test.
- **R3 — fail-closed as a behaviour change.** An apply that used to write placeholders now errors. Mitigation: the documented CI path is `--mode=check` (never writes the lock), so CI is unaffected; the apply path gains an actionable error + the limited `--resolved-sha` override (which only fixes the SHA once a real `harness_ref` is derivable — not a standalone rescue, C82-3/C82-5). This is the intended correctness fix.
- **OQ1 — check-mode provenance validation (C82-8).** Deferred; note as a follow-up.

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | cs82-plan-review | 6e4fa1c9d5e3 | 2026-07-02T00:08:03Z | Needs-Fix | npx lock source wrong field; --resolved-sha not standalone recovery; fail-closed must be apply-only; schema allows all-zero (need explicit validator); add seam+migrate tests. |
| R2 | gpt-5.5 | claude-opus-4.8 | cs82-plan-review-r2 | 45e27c669899 | 2026-07-02T00:14:03Z | Go-with-amendments | All 5 R1 blockers resolved (correct lock key, apply-only fail-closed, explicit validator, test seam+migration). Amend Risks R1 path key + R3 override wording. |

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | omni-ah-c2 |
| Reviewer agent | rubber-duck (orchestrator: omni-ah-c2) |
| Notes | Finalized at close-out. **Patch** SemVer (bug fix, no new CLI flag). Independence per REVIEWS § 2.3 — reviewer `gpt-5.5` ≠ implementer `claude-opus-4.8`; Copilot (`claude-sonnet`) alternating across 2 rounds. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1 — npx-cache resolution in `lib/sync.mjs`: read the parent install project's `node_modules/.package-lock.json` `packages["node_modules/<pkg>"].resolved` for ref→SHA; reorder chain npx-cache→git→fail-closed (C82-2) | done | omni-ah-c2 | `resolveHarnessProvenance` in PR #366 (`24f36287`); from the running module's package root. |
| T2 — `validateResolvedProvenance()` (apply-mode) before `writeLock`: throw `ESYNC_UNRESOLVED_PROVENANCE` on `harness_ref==='unknown'`/all-zero SHA; scaffold versions from resolved ref (C82-3/4/5) | done | omni-ah-c2 | Apply-mode only; schema untouched. |
| T3 — exported provenance-resolution seam (git/fs/cache injectable); tests `os.tmpdir()` (npx-cache / self-host / fail-closed / SHA-without-ref); migrate existing `.git`-less fixtures (C82-7) | done | omni-ah-c2 | 28 fixtures; hermetic seam wrapper migrated the legacy tests. |
| T4 — OPERATIONS § Sync "Lock provenance" note + `--resolved-sha` refresh (both copies, lockstep); `LEARNINGS.md` learning; `CHANGELOG.md` `[Unreleased]` Fixed (C82-6) | done | omni-ah-c2 | LRN-178; no drift; bare `LRN-070` on the touched line. |
| T5 — Validate (`harness lint`, `node --test`, `harness check`) + review (GPT-5.5 rubber-duck + Copilot); content PR → admin-merge (C82-9) | done | omni-ah-c2 | lint 34/0/3; node --test 1585/0-fail; no drift. 2 review rounds (GPT-5.5 Go×2 + Copilot; all threads resolved). PR #366 admin-merged `24f36287`. |
| Close-out: docs + restart state — rename active→done; WORKBOARD (remove CS82; CS65 stays paused) + CONTEXT; `sync --mode=check` clean | done | omni-ah-c2 | This PR. |
| Close-out: learnings — learning finalized | done | omni-ah-c2 | LRN-178 merge SHA `24f36287`. |

## Notes / Learnings

- **Shipped** in PR #366 (squash `24f36287`, admin-merged 2026-07-02). Closes #352-F2. Revives CS26 C26-4 (npx-cache provenance); CS26's other findings (#2/#3/#6/#9) stay in that bundle.
- **Implemented by a background sub-agent** (`cs82-impl`, claude-opus-4.8). Key design: provenance derives from the running module's package root (`import.meta.url`), not `harnessRepoPath` — in production = REPO_ROOT (identical behavior), in tests points at the real repo, which kept non-owned apply tests green with zero edits.
- **Confirmed asymmetry (C82-7 vs C82-9):** the npx-cache branch fails-closed when no symbolic ref is derivable, while the git self-host branch retains its `sha[:7]` ref fallback (backward-compat). Intended: the common npx case derives a ref from the install spec; only ref-less npx installs fail closed. A direct regression test for the git `sha[:7]` fallback was added at review (GPT-5.5 R1).
- **Review:** 2 alternating rounds on PR #366 (GPT-5.5 rubber-duck **Go ×2** + Copilot). Copilot R1 flagged a `LEARNINGS.md#lrn-070` link on the CS82-touched `--resolved-sha` note (404s in the consumer-shipped composed copy) → converted to a bare `LRN-070` token per CS81's C81-2 (the rest of the composed base's pervasive `LEARNINGS.md#lrn-` links remain the CS81-R3/CS76 follow-up). Converged R2 clean.

## Plan-vs-implementation review

**Reviewer:** GPT-5.5 (rubber-duck dispatch `cs82-pvi`)
**Date:** 2026-07-02
**Outcome:** GO

Run against `main` at the squash-merge HEAD `24f36287` (PR #366). Reviewer model `gpt-5.5` differs from the implementer model `claude-opus-4.8` (independence, REVIEWS § 2.3). All Decisions/Deliverables **match** with evidence: **C82-2** — `resolveHarnessProvenance` (npx-cache → git → fail-closed), reads `packages["node_modules/<pkg>"].resolved`, derives from the running install root not `harnessRepoPath` (`lib/sync.mjs:255-455`). **C82-3/C82-8** — `validateResolvedProvenance` throws `ESYNC_UNRESOLVED_PROVENANCE` on unknown/all-zero, called only under `if (mode === 'apply')` after `--resolved-sha`, before planning/writes (`:468-483`, `:1034-1047`); check/dry-run best-effort; no schema diff. **C82-4** — scaffold versions derive from resolved `harness_ref`. **C82-5** — `--resolved-sha` overrides only `resolved_sha`; no `--harness-ref` flag; no dangling `resolveHarnessRef` callers. **C82-6** — both OPERATIONS copies carry the matching § Sync "Lock provenance" note + refreshed `--resolved-sha` note (bare `LRN-070`, no consumer-dangling `LEARNINGS.md#` link); LRN-178 `applied`; CHANGELOG `[Unreleased]` Fixed; `harness check` no drift. **C82-7** — `tests/cs82-lock-provenance.test.mjs` covers npx-cache / git self-host incl. `sha[:7]` fallback / fail-closed / SHA-without-ref / `--resolved-sha` / check-dry-run-no-throw; legacy `tests/sync.test.mjs` fixtures migrated via a hermetic seam. No `lib/lock.mjs`/`bin`/`schemas` change.

The reviewer's flagged deviation (`harness lint` 33/1/3 + a few full-suite clickstop-test failures) was the expected **close-out-in-progress** state — the empty `## Plan-vs-implementation review` + `Status: active`; populating this section + Status→done resolves it (`harness lint --quiet` = 34/0/3 at close-out).
