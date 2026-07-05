# CS86 — Deeper OPERATIONS.md right-sizing: relocate the extracted preamble source + thin the reviewer-preamble section

**Status:** done
**Owner:** yoga-ah-c2
**Branch:** cs86/content
**Started:** 2026-07-04
**Closed:** 2026-07-05
**Filed by:** CS65 close-out (2026-07-02 by `omni-ah-c3`) — the documented `## Follow-ups` "deeper OPERATIONS.md thinning" item, re-homed from the closed CS file into a visible planned CS per the "follow-ups must be a planned CS or a learning" convention.
**Depends on:** **CS65** (soft — builds on CS65's OPERATIONS thinning + the C65-5 anchor-preservation invariant and its recon that identified which sections are load-bearing).

## Goal

Continue CS65's `OPERATIONS.md` right-sizing by making the two preamble sections CS65 had to leave intact **thinnable**, without losing any procedure or breaking any heading anchor (the C65-5 invariant). CS65 stopped at ~2697 lines because ~400 of those lines are the sub-agent and reviewer preamble blocks: the sub-agent `### Mandatory briefing preamble` is **extracted live from `OPERATIONS.md` at runtime** by `lib/dispatch.mjs` (so it is load-bearing and could not be collapsed), and the `## Reviewer dispatch — canonical preamble` is duplicated human-readable doctrine (`harness review` composes its prompt in `lib/review.mjs`, not from the doc). This CS removes both from the always-loaded doc while keeping `harness dispatch` output byte-identical.

## Background

CS65's recon (see `done_cs65_process-doc-right-sizing`) established: (1) `lib/dispatch.mjs` `extractPreamble` parses the `### Mandatory briefing preamble (copy verbatim into every dispatch)` H3 + its ```text fence anchored on `## CRITICAL PREFLIGHT (LRN-021)` from the rendered `OPERATIONS.md` at runtime — so thinning that section would break `harness dispatch`; (2) the reviewer preamble is NOT read by any command, so it is safe to thin. The preamble also **ships to consumers** inside the composed `OPERATIONS.md` base, so any relocation must keep it delivered to (and discoverable/emittable in) consumer repos — this is the dominant risk and shapes the design.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C86-1 | Reviewer-preamble section (low risk) | Thin `## Reviewer dispatch — canonical preamble` to a "what it is / when to paste it / pointer" stub, moving the verbatim reviewer-preamble body to its authoritative home (`REVIEWS.md` and/or `lib/review.mjs` which already composes the prompt). Preserve the heading anchor (no rename/remove). | It is duplicated doctrine not read by any command; the executable form already lives in `lib/review.mjs`. Safe, self-contained win with no `lib/` behavior change. |
| C86-2 | Dispatch-preamble source relocation (architectural) | Move the canonical sub-agent briefing preamble **source of truth** out of `OPERATIONS.md` into a dedicated single-source file that ships to consumers (a `template/managed/` or `template/composed/` doc, TBD in the plan-review), and update `lib/dispatch.mjs` to extract from that file (self-host **and** consumer). Then thin the `OPERATIONS.md` `### Mandatory briefing preamble` section to a "run `{{harness_invoke}} dispatch` — emitted verbatim from `<file>`" pointer stub. | Removes the ~130-line always-loaded preamble block from `OPERATIONS.md` while keeping `harness dispatch` the single emitter. The preamble stops being duplicated in the procedure bible. |
| C86-3 | Hard invariants (mirror C65-5) | No procedure/policy lost; **every existing `OPERATIONS.md` heading anchor preserved** (pre/post inventory, reusing CS65's T5/C65-5 audit tooling); root↔composed lockstep (`sync --mode=check` no drift); **`harness dispatch` output byte-identical** before/after (a CLI-level regression test pins the emitted preamble for both default fenced output and `--no-fence`); the preamble still ships to and is emittable in consumer repos. | The load-bearing nature of the dispatch preamble makes silent breakage the dominant risk; make every preservation guarantee a mechanical gate. |
| C86-4 | Consumer new-file adoption / fallback (per plan-review) | On a consumer that has not yet adopted the new managed preamble-source file (new managed files require `sync --mode=apply --apply-new` — `lib/sync.mjs`), `lib/dispatch.mjs` MUST **fall back to legacy `OPERATIONS.md` extraction** (never crash); when neither source resolves, error clearly ("run `harness sync --apply-new`"). Resolve the source **consumer-root-relative** (LRN-050). | Keeps `harness dispatch` working in consumers across the upgrade → next-`sync` window; the preamble stays emittable through the transition. |

## Deliverables

1. New single-source preamble file (shipped template) + `lib/dispatch.mjs` update to extract from it in both self-host and consumer modes. (C86-2)
2. `OPERATIONS.md` (+ `template/composed/OPERATIONS.md`, lockstep) — `### Mandatory briefing preamble` and `## Reviewer dispatch — canonical preamble` sections thinned to pointer stubs; all headings preserved. (C86-1, C86-2, C86-3)
3. `REVIEWS.md` (edit) — absorb the reviewer-preamble body into its authoritative home + drop any claim that the preamble / its `scope` field lives in `OPERATIONS.md`; **retarget `tests/operations-reviewer-preamble.test.mjs`** (which currently asserts the sentinel block + fields live in `OPERATIONS.md`) to the new home. (C86-1)
4. Tests: **CLI-level** `harness dispatch` emitted-preamble byte-equality before/after for **both** default fenced output and `--no-fence`; OPERATIONS heading-anchor preservation (reuse the CS65 **C65-5** pre/post audit tooling); consumer-mode dispatch fixtures — synced-consumer success, consumer-root-relative resolution (LRN-050), and the **missing-new-managed-file fallback/error** path. (C86-3, C86-4)
5. `CHANGELOG.md` `[Unreleased]` entry (doc/CLI-plumbing change; note for consumers that the preamble source moved but `harness dispatch` is unchanged).

## User-approval gates

- **G-preamble-home** — confirm the destination file + file-class (managed vs composed) for the relocated sub-agent preamble source before the `lib/dispatch.mjs` re-point (C86-2), since it changes a consumer-shipped surface.

## Exit criteria

1. `OPERATIONS.md` (+ composed) is materially smaller than CS65's ~2697 lines, with the two preamble sections as pointer stubs; no procedure removed without an equivalent home. (C86-1, C86-2)
2. `harness dispatch` emits a **byte-identical** preamble before/after (CLI-level regression test green — default + `--no-fence`), in both self-host and consumer mode; on a consumer missing the new source file it falls back to legacy `OPERATIONS.md` extraction or errors clearly. (C86-2, C86-3, C86-4)
3. Every pre-existing `OPERATIONS.md` heading anchor still resolves (pre/post audit, reusing the CS65 C65-5 audit tooling). (C86-3)
4. `harness lint` passes; `node --test tests/*.test.mjs` green; `sync --mode=check` no drift; composed-blocks lockstep green.
5. Plan-vs-implementation review (GPT-5.5 gate) returns GO.
6. `CHANGELOG.md` `[Unreleased]` entry present.

## Risks + open questions

| # | Risk / what breaks | Mitigation |
|---|---|---|
| R1 | Relocating the dispatch-preamble source **breaks `harness dispatch`** (the dominant risk — it is load-bearing). | C86-3 byte-equality regression test on the emitted preamble; implement the `lib/dispatch.mjs` re-point + new source file first, verify `harness dispatch` unchanged, then thin the doc. |
| R2 | The preamble **ships to consumers** in composed `OPERATIONS.md`; moving its source could stop delivering it to consumers or make consumer `harness dispatch` fail to find it. | The new source file must be a shipped template (managed/composed) and `lib/dispatch.mjs` must resolve it consumer-root-relative (LRN-050); add a consumer-mode extraction fixture. G-preamble-home confirms the file-class. |
| R3 | Thinning could still lose doctrine. | Mirror CS65: keep what/when doctrine in-doc; move only the verbatim body to a single authoritative home; pre/post anchor + procedure audit. |
| Q1 | Open — new preamble source home: `template/managed/` (harness overwrites; fits a canonical block) vs a `template/composed/` doc (local-block extensible)? | G-preamble-home; default `template/managed/` (the preamble is fully harness-owned). |
| Q2 | Open — is this worth the architectural risk vs. only doing C86-1 (reviewer-preamble, safe)? | The plan-review + G-preamble-home may descope C86-2 to a later CS and ship C86-1 alone if the consumer-template risk is judged too high for the line-count gain. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | rubber-duck (orchestrator: omni-ah-c3) | b32302ad4578 | 2026-07-02T20:20:00Z | Go-with-amendments | Premises verified (dispatch extracts from OPERATIONS.md; review composes in code). Amendments applied: retarget reviewer-preamble test + REVIEWS refs; explicit consumer new-file fallback (C86-4). |

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | yoga-ah-c2 |
| Reviewer agent | rubber-duck (orchestrator: yoga-ah-c2) |
| Notes | Provisional at claim; finalized at close-out. Independence per REVIEWS.md § 2.3 — reviewer `gpt-5.5` ≠ implementer `claude-opus-4.8`. SemVer **Minor** (provisional): C86-2 adds a new shipped preamble-source template file + `lib/dispatch.mjs` resolution/fallback plumbing while keeping `harness dispatch` output byte-identical; drops to **Patch** if C86-2 is descoped to C86-1 alone (reviewer-preamble doc thinning) per Q2. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| T1 — D1: dispatch-preamble source relocation (C86-2/C86-4). Create the new single-source sub-agent briefing preamble file (shipped template — default `template/managed/`, file-class pending **G-preamble-home**) carrying the verbatim preamble body currently inlined in `OPERATIONS.md`; re-point `lib/dispatch.mjs` `extractPreamble` to resolve + extract from it in BOTH self-host and consumer modes, consumer-root-relative (LRN-050), with a fall-back to legacy `OPERATIONS.md` extraction when the new file is absent (pre-`sync --apply-new`) and a clear error when neither source resolves; register the new file for `harness sync`. Tests: CLI-level `harness dispatch` emitted-preamble byte-equality before/after for default fenced output AND `--no-fence`, self-host + consumer; consumer-mode dispatch fixtures (synced success, root-relative resolution, missing-new-file fallback/error). | done | — | agent-id=cs86-dispatch \| role=impl \| report-status=complete \| learnings=3 — owns the new preamble-source template file, `lib/dispatch.mjs`, dispatch/consumer-mode tests + fixtures; does NOT touch OPERATIONS.md/REVIEWS.md prose (cs86-docs owns those). Must land the re-point BEFORE T2 thins the OPERATIONS section. |
| T2 — D2+D3: doc thinning (C86-1/C86-3). Thin `OPERATIONS.md` `### Mandatory briefing preamble` + `## Reviewer dispatch — canonical preamble` to pointer stubs (+ `template/composed/OPERATIONS.md` lockstep + root regen via `harness sync`); move the reviewer-preamble verbatim body to its authoritative home in `REVIEWS.md` (+ composed lockstep) and drop any claim it lives in `OPERATIONS.md`; **retarget `tests/operations-reviewer-preamble.test.mjs`** to the new home. Preserve EVERY pre-existing `OPERATIONS.md` heading anchor (reuse the CS65 C65-5 pre/post audit tooling). | done | — | agent-id=cs86-docs \| role=impl \| report-status=complete \| learnings=3 — owns `OPERATIONS.md` (+composed), `REVIEWS.md` (+composed), `tests/operations-reviewer-preamble.test.mjs`, the regenerated roots; does NOT touch `lib/dispatch.mjs` or the new preamble-source file (cs86-dispatch owns those). Depends on T1 landing the dispatch re-point first. |
| T3 — Plan-vs-implementation review (GPT-5.5 close-out gate) + full self-checks green (`harness lint`, `node --test tests/*.test.mjs`, `harness sync --mode=check` zero drift, composed-blocks lockstep) | done | yoga-ah-c2 | independence: reviewer model ≠ every implementer model. PVI R1 NEEDS-FIX (C86-4 gap) → fast-follow PR #487 → **R2 GO** at `a5493d8`. |
| CHANGELOG — D5: `CHANGELOG.md` `[Unreleased]` entry (doc/CLI-plumbing: sub-agent preamble source relocated but `harness dispatch` output unchanged; note consumers adopt via `harness sync --apply-new`). | done | yoga-ah-c2 | orchestrator-owned; distributed-surface CS (LRN-101) |
| Close-out: docs + restart state | done | yoga-ah-c2 | Update WORKBOARD.md and CONTEXT.md so a fresh agent can restart from actual state |
| Close-out: learnings + follow-ups | done | yoga-ah-c2 | Filed LRN-206 (relocation-sweep, applied), LRN-207 (new-managed-file transition window, applied), LRN-208 (DISPATCH-PREAMBLE.md linter-scope, open follow-up). Closes CS65's deferred "deeper OPERATIONS.md thinning" follow-up. |

## Notes / Learnings

- **2026-07-04 relevance refresh + design (yoga-ah-c2, Claude Opus 4.8).** G-preamble-home resolved to the plan's Q1 default: new source is a **managed** root doc `DISPATCH-PREAMBLE.md` (fully harness-owned; consumers must not edit — verbatim-paste discipline; `--language-profile` is the customization seam, not doc edits). Full scope (C86-1 + C86-2) retained — plan review R1 accepted it with the C86-4 fallback. Three recon findings refine the plan:
  1. **Language profiles (CS102, landed after this plan was filed 2026-07-02).** `emitBriefing` reads BOTH `extractPreamble` (core fence anchored `## CRITICAL PREFLIGHT (LRN-021)`) AND `extractLanguageProfile` (`## LANGUAGE PROFILE: node|dotnet` fences) from the SAME doc. So a byte-identical relocation must move **all three** ```text fences + the `#### Language profiles` prose (root OPERATIONS.md 1175–1371) into `DISPATCH-PREAMBLE.md`. The interleaved `### Subcommand authoring…` H3 (1146–1173) is independent doctrine — it STAYS in OPERATIONS.md.
  2. **Managed files are rendered, not copied** (`template/managed/TRACKING.md` ≠ root TRACKING.md). The preamble source carries templating tokens `{{agent_suffix}}` (→`ah`) and `{{harness_invoke}}` (→`node bin/harness.mjs`, ×2), plus a literal `{{project.agent_suffix}}` example that stays verbatim (dot-notation unresolved). So `template/managed/DISPATCH-PREAMBLE.md` holds the SOURCE tokens; its rendered root copy `DISPATCH-PREAMBLE.md` must equal the current root OPERATIONS.md fence content byte-for-byte, and `sync --mode=check` must show no drift.
  3. **Resolution + fallback (C86-4).** `harness dispatch` resolves cwd-relative: `DISPATCH-PREAMBLE.md` if present → else legacy `OPERATIONS.md` (works because a pre-`sync --apply-new` consumer still has the OLD fenced OPERATIONS.md) → else a clear "run `harness sync --apply-new`" error. `bin/harness.mjs cmdDispatch` (line ~4940) + `lib/dispatch.mjs` (`emitBriefingFromFile`) own this.
- **Anchor preservation (C86-3).** Only real (non-fenced) headings create anchors: `### Mandatory briefing preamble…`, `### Subcommand authoring…`, `#### Language profiles`, `### Canonical reviewer preamble (CS35 C35-1)`, `## Reviewer dispatch — canonical preamble`. (`## CRITICAL PREFLIGHT`/`## LANGUAGE PROFILE:` are inside ```text fences → not anchors.) Thinning keeps every real heading as a stub (removes only fence/block bodies) so 100% of anchors survive; verified via `lib/doc-schema.mjs` `collectHeadings`/`headingAnchor` pre/post inventory + the `doc-xref-resolvability` linter.
- **Sequencing + ownership.** T1 (cs86-dispatch) lands the new file + re-point + BEFORE T2 (cs86-docs) thins OPERATIONS.md; run **sequentially** (shared cs86/content worktree — `harness sync` rewriting root OPERATIONS.md races `harness dispatch` reads). Disjoint file sets: cs86-dispatch owns `DISPATCH-PREAMBLE.md` (+template/managed), `lib/dispatch.mjs`, `bin/harness.mjs` dispatch path, `harness.config.json` managed.files, dispatch tests/fixtures; cs86-docs owns `template/composed/OPERATIONS.md`+root, `REVIEWS.md`+composed, `tests/operations-reviewer-preamble.test.mjs`.
- **Byte-equality golden baselines (pre-change, HEAD cbd3622 content):** `harness dispatch` node+fence = 6428 B (MD5 `E06E006E6CD4B3341B11C5232EFD64B7`), node `--no-fence` = 6414 B, dotnet+fence = 6142 B. Post-change output MUST match these exactly (CLI-level regression test).

## Plan-vs-implementation review

**Reviewer:** gpt-5.5 (rubber-duck) — independence: reviewer gpt-5.5 ≠ every implementer (claude-opus-4.8)
**Date:** 2026-07-05T02:52:17Z
**Outcome:** GO

**R1 (NEEDS-FIX at `b893ce0`):** the C86-4 transition error path was incomplete — a consumer who runs a normal `harness sync` (not `--apply-new`) has a thinned `OPERATIONS.md` (no preamble fence) AND no `DISPATCH-PREAMBLE.md`; the resolver fell back to the readable-but-fence-less `OPERATIONS.md` and `harness dispatch` failed with a generic extractor error instead of adoption guidance. → **Fast-follow fix PR #487 (`a5493d8`)**: the legacy fallback is now content-validated (`legacySourceHasPreamble` — returned only when `extractPreamble` succeeds; a thinned/fence-less legacy throws the `harness sync --mode=apply --apply-new` adoption error naming both paths) + regression tests (thinned-legacy adoption error, symmetric primary/legacy EISDIR fail-closed).

**R2 (GO at `a5493d8`):** all deliverables `match`; the R1 blocker is fully closed.

| Deliverable | Outcome |
|---|---|
| D1 — new managed source (`DISPATCH-PREAMBLE.md`) + `lib/dispatch.mjs` extraction (self-host + consumer, content-validated fallback) | match |
| D2 — `OPERATIONS.md` thinned to pointer stubs (+ composed lockstep, all real heading anchors preserved) | match |
| D3 — reviewer preamble → `REVIEWS.md § 2.9` + retargeted `tests/operations-reviewer-preamble.test.mjs` | match |
| D4 — tests (CLI byte-equality node/dotnet × fenced/no-fence, anchors, consumer fixtures, fallback/adoption/EISDIR fail-closed) | match |
| D5 — `CHANGELOG.md` `[Unreleased]` entry | match |

Exit criteria 1–6 all `match`. Test coverage: **sufficient** (byte-identity goldens; primary/legacy resolution; content-validated fallback; thinned-legacy adoption error; malformed-primary + non-ENOENT/EISDIR fail-closed; consumer-root-relative resolution). Self-checks green: `node --test` 1947 pass / 0 fail, `harness lint` 37/0/3, `sync --mode=check` no drift, `harness dispatch` byte-identical (6295/6283/6016 B). **Scope note:** the plan's original ~130-line estimate grew to relocating all three fences (core + `node`/`dotnet` language profiles, added by CS102 after this plan was filed) — a recorded refinement, not a divergence.
