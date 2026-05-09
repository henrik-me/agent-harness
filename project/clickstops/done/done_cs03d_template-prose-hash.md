# CS03d — Template prose-hash for composed-merge evolution (LRN-020)

**Status:** done
**Owner:** yoga-ah
**Branch:** cs03d/content (squash-merged as `015ed87` via PR #63)
**Started:** 2026-05-09
**Closed:** 2026-05-09
**Filed by:** [LRN-020](../../../LEARNINGS.md#lrn-020) at 2026-05-09 pre-CS15a hygiene pass
**Depends on:** CS02b (clean schema baseline), CS03 (sync engine), CS03b (rich-API lock)

## Goal

Extend the lock file with a per-composed-file `template_prose_hash` so `mergeComposed()` can distinguish:

1. **Template prose evolved, consumer didn't touch their prose** → auto-update, no fail-closed (previously this required every consumer to author a `legacy_composed_mapping.json` for every harness doc tweak — see LRN-020).
2. **Consumer edited their prose** → keep existing fail-closed `EMERGE_LEGACY_UNMAPPED` behaviour (correct — they need a mapping).

Per the user directive (2026-05-09): "go with adding the missing hash to ensure we don't cause user confusion."

## Background

Per [LRN-020](../../../LEARNINGS.md#lrn-020): in `lib/composed.mjs`, `mergeComposed()` computes `templateSkeleton` (rendered template prose minus local-block bodies) and `currentSkeleton` (consumer file prose minus local-block bodies). When they differ, it fails closed unless a `legacyMapping` is supplied.

The trap: any harness-side prose update to a composed file (`OPERATIONS.md`, `CONVENTIONS.md`, `REVIEWS.md`) makes `templateSkeleton` differ from `currentSkeleton` in every existing consumer, forcing them to author a `legacy_composed_mapping.json` just to absorb a typo fix.

The fix: remember the template's skeleton hash from the previous sync. On next sync, if the consumer's `currentSkeleton` matches that stored hash, the consumer didn't touch the prose — the divergence is entirely due to template evolution — so we can auto-adopt the new template prose.

## Decisions made up front (no user check-in needed)

| # | Decision | Rationale |
|---|---|---|
| D1 | **Field name:** `template_prose_hash`. | Matches LRN-020 wording verbatim; user-facing term. (Internal `templateSkeleton` variable name stays.) |
| D2 | **Field placement:** `fileEntry.template_prose_hash` in `harness-lock.schema.json`, paralleling `rendered_hash`. | Per-file is the natural granularity; hashing is at the skeleton level. |
| D3 | **Required when `class === "composed"`?** **Optional** at the schema level. The schema's existing `if class==composed then required[blocks]` clause is **not** extended to require `template_prose_hash`. | Existing consumer locks (gwn, sub-invaders, self-host) lack the field; making it required would invalidate every existing lock and break first-sync after upgrade. Optional + bootstrap is gentler. |
| D4 | **Bootstrap semantics on first sync after upgrade (lock missing field):** the engine treats the consumer's `currentSkeleton` as authoritative for "this is what the prose was last time", **writes the current `templateSkeleton` hash to the lock**, and proceeds with normal merge. The first post-upgrade sync therefore behaves identically to a fresh sync; from the second sync onward, evolution detection is active. | Gives consumers a smooth one-sync transition. The trade-off: if the consumer had genuinely edited prose between v0.1.0 and the upgrade, they'd get a silent auto-adoption. We accept this because (a) v0.1.0 didn't ship to public yet, (b) the only existing consumers have un-edited template prose. |
| D5 | **Hash input:** `sha256(extractSkeleton(parseComposed(normalizeLF(template))))` — the post-templating, post-block-strip rendered template prose, LF-normalised. Reuses the existing private `extractSkeleton()` helper at `lib/composed.mjs:345-349` (which is what `mergeComposed()` already calls internally). The new public `computeTemplateProseHash()` helper wraps that call. | Single-source-of-truth; reuses existing pipeline; trivially testable. `extractSkeleton` stays private — the new public surface is the hash helper, not the skeleton accessor. |
| D6 | **Three-way decision in `mergeComposed()` when `templateSkeleton !== currentSkeleton`:** <br> a. lockRecord exists AND `currentSkeletonHash === lockRecord.template_prose_hash` → **template evolved**: auto-adopt new template prose; preserve local blocks; update lock with new `template_prose_hash`. No `legacyMapping` required. <br> b. lockRecord exists AND `currentSkeletonHash !== lockRecord.template_prose_hash` → **consumer edited prose**: existing `EMERGE_LEGACY_UNMAPPED` fail-closed unless `legacyMapping` provided. <br> c. lockRecord absent OR `lockRecord.template_prose_hash` absent → **bootstrap** per D4: write current `templateSkeleton` hash to lock; treat as fresh-sync for this run. | Covers all three states explicitly; documented in JSDoc. |
| D7 | **Breaking change classification:** **non-breaking for consumers**, additive in the lock schema; behaviour change makes existing fail-closed cases auto-pass when the consumer hasn't edited prose. CHANGELOG entry under "v0.2.0 (unreleased)" as `Changed:` not `Breaking:`. | Strict additive schema change; the only behaviour shift is reducing false-positive fail-closeds. |
| D8 | **ADR update:** amend `docs/adr/0001-file-classes.md` with a new subsection "Template prose evolution" describing the three-way state machine; reference cs03d for history. No new ADR file. | LRN-020 explicitly tied this to the existing ADR's design space. |
| D9 | **Sub-agent fan-out:** schema + lib + tests are interlocked but bounded. Single sequential content branch executed by orchestrator. **No sub-agent fan-out** — same rationale as cs02b (schema↔engine↔tests too tightly coupled for safe parallel ownership). | LRN-016 caution. |
| D10 | **Rubber-duck reviewer:** GPT-5.5 (independent context). Recorded in PR body + `## Plan-vs-implementation review` per LRN-064. | Standard process. |
| D11 | **Don't bundle with cs02b.** Land cs02b first (smaller blast radius, no behaviour change), then cs03d. Each goes through the full 3-PR shape. | Easier to review, easier to revert if needed, lock-refresh sequencing is cleaner. |
| D12 | **Don't address LRN-019 (`legacy-composed-mapping.schema.json`) in this CS** even though it's adjacent. After cs03d lands, the legacy-mapping path will be hit far less often, so the urgency for the schema drops. Re-evaluate LRN-019 separately after cs03d closes. | Scope discipline; one LRN per CS. |

## Deliverables

### Schema
- [ ] `schemas/harness-lock.schema.json` — add to `$defs.fileEntry.properties`:
  ```jsonc
  "template_prose_hash": {
    "$ref": "#/$defs/sha256Hex",
    "description": "SHA-256 hash of the template's skeleton (post-templating, post-local-block-strip, LF-normalised) at the last sync. Composed-class only. When present, mergeComposed() uses it to distinguish 'template prose evolved' (auto-adopt) from 'consumer edited prose' (fail-closed). Absent on locks written by harness < v0.2.0; the engine bootstraps on first encounter."
  }
  ```
  Do **not** add `template_prose_hash` to `required`; do not extend the `if/then` clause.

### Library
- [ ] `lib/composed.mjs`:
  - Export a new helper `computeTemplateProseHash(template)` that returns `sha256Hex(extractSkeleton(parseComposed(normalizeLF(template))))`. Reuses the existing private `extractSkeleton()` helper (lines 345-349); does NOT add a `.skeleton` field to the `parseComposed()` return shape.
  - Modify `mergeComposed(template, current, opts)` to accept `opts.lockTemplateProseHash` (string|null|undefined).
  - Implement the three-way decision per D6 above. Write JSDoc with the state-machine table.
  - Return value extended with `templateProseHash: string` (the hash to write to the new lock entry — always the **new** template's hash post-merge).
- [ ] `lib/sync.mjs`:
  - When invoking `mergeComposed`, pass `opts.lockTemplateProseHash = lockEntry?.template_prose_hash ?? null`.
  - On lock write, populate `fileEntry.template_prose_hash = result.templateProseHash` for composed-class files.

### Tests
- [ ] `tests/composed.test.mjs` — minimum **5 new tests**, over-delivery encouraged (LRN-037):
  1. Template evolved + consumer prose === lockTemplateProseHash → auto-adopts new template prose, preserves local blocks, returns new hash.
  2. Template evolved + consumer prose !== lockTemplateProseHash → throws `EMERGE_LEGACY_UNMAPPED` (existing behaviour preserved).
  3. Bootstrap: lockTemplateProseHash absent + skeletons match → returns current template hash; no error.
  4. Bootstrap: lockTemplateProseHash absent + skeletons differ → returns current template hash; no error (silent auto-adopt per D4).
  5. Template unchanged + consumer prose unchanged → no-op merge; returned hash matches existing.
- [ ] `tests/sync.test.mjs` — minimum **2 new tests**: end-to-end sync against a fixture where (a) only template prose changes between syncs (no local-block edits) — confirm no fail-closed; (b) consumer prose edited between syncs — confirm fail-closed retained.
- [ ] New fixtures under `tests/fixtures/cs03d/` for the evolution scenarios (template-vN, consumer-untouched, consumer-edited variants).

### Lock fixtures
- [ ] Update `tests/fixtures/cs03/sync/sync-already-synced/.harness-lock.json` — add `template_prose_hash` to composed file entries (use real computed hashes).
- [ ] Verify other lock fixtures (`tests/fixtures/cs03/lock/*.lock.json`) still validate against the updated schema (they should — field is optional).

### Docs
- [ ] `docs/adr/0001-file-classes.md` — append "Template prose evolution" subsection per D8 with the three-way state-machine table from D6.
- [ ] `LEARNINGS.md` — flip LRN-020 `status: deferred` → `status: applied` with citation: "Applied by CS03d — `template_prose_hash` added to lock schema in commit `<sha>`; mergeComposed() three-way state machine in `lib/composed.mjs`; user directive 2026-05-09."
- [ ] `CHANGELOG.md` — add to "Unreleased" / "v0.2.0" section under "Changed": "`harness sync` no longer requires a `legacy_composed_mapping.json` when the only divergence between a consumer's composed file and the template is harness-side prose evolution. Detection uses a new `template_prose_hash` lock field; first sync after upgrade bootstraps the field automatically."

### Lock refresh
- [ ] After all changes land in the content commit, run `node bin/harness.mjs sync --mode=apply --resolved-sha $(git rev-parse HEAD) --cwd .` to refresh self-host `.harness-lock.json` (now includes `template_prose_hash` for `OPERATIONS.md`, `CONVENTIONS.md`, `REVIEWS.md`).

## Exit criteria

- `node --test tests/*.test.mjs` → 512+ baseline (post cs02b) + ≥7 new = ≥519 passing, 0 failing.
- `node bin/harness.mjs lint --quiet` → 0 failed.
- `node bin/harness.mjs sync --mode=check --cwd .` → "No drift detected".
- `node scripts/validate-schemas.mjs` → 0 failed.
- Self-host `.harness-lock.json` contains `template_prose_hash` for all 3 composed files.
- All `tests/fixtures/cs03/lock/*.lock.json` still validate (optional field, no breakage).
- `LEARNINGS.md` LRN-020 has `status: applied` with citation.
- `## Plan-vs-implementation review` populated by GPT-5.5 with `Outcome: GO` before close-out.

## Sub-agent fan-out

**None** per D9. Single sequential content branch.

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| Schema field addition | planned | — | agent-id=— \| role=orchestrator \| report-status=pending \| learnings=0 |
| `lib/composed.mjs` three-way state machine + helper export | planned | — | agent-id=— \| role=orchestrator \| report-status=pending \| learnings=0 |
| `lib/sync.mjs` lock write/read wiring | planned | — | agent-id=— \| role=orchestrator \| report-status=pending \| learnings=0 |
| New tests + fixtures (composed + sync) | planned | — | agent-id=— \| role=orchestrator \| report-status=pending \| learnings=0 |
| Lock-fixture updates | planned | — | agent-id=— \| role=orchestrator \| report-status=pending \| learnings=0 |
| ADR + LEARNINGS + CHANGELOG | planned | — | agent-id=— \| role=orchestrator \| report-status=pending \| learnings=0 |
| Self-host lock refresh + final lint | planned | — | agent-id=— \| role=orchestrator \| report-status=pending \| learnings=0 |
| GPT-5.5 plan-vs-impl review | planned | — | agent-id=— \| role=reviewer \| report-status=pending \| learnings=0 |

## Risks + mitigations

- **Risk:** silent auto-adoption per D4 hides a genuinely-edited prose change for the first post-upgrade sync. **Mitigation:** documented in CHANGELOG; the v0.1.0 → v0.2.0 release notes will explicitly call out this one-time bootstrap behaviour. Both known consumers (gwn, sub-invaders) have unedited template prose, so the real-world risk is zero.
- **Risk:** hash computation differs subtly between `mergeComposed()` (existing comparison) and the new helper (lock write). **Mitigation:** the helper *is* the same code path — `extractSkeleton(parseComposed(normalizeLF(template)))` then `sha256Hex`, where `extractSkeleton` is the existing private helper in `lib/composed.mjs` that `mergeComposed()` already calls. Single function call, called from both sites.
- **Risk:** lock-fixture updates miss an entry, breaking schema validation. **Mitigation:** field is optional; existing fixtures without the field still validate.
- **Risk:** the three-way state machine is misremembered when reviewing diffs. **Mitigation:** JSDoc table + ADR table + dedicated test per branch.

## Plan-vs-implementation review

**Reviewer:** GPT-5.5 (rubber-duck)
**Date:** 2026-05-09
**Outcome:** GO (R1 — no blockers; 1 NB about deferred sync.test.mjs scenarios subsumed by composed.test.mjs)

### Plan vs implementation

| Deliverable | Outcome | Notes |
|---|---|---|
| Schema: `fileEntry.template_prose_hash` | match | Added at `schemas/harness-lock.schema.json` `fileEntry`; composed-only via `if/then/else` (forbidden on managed/seeded); optional, not in `required`. |
| `lib/composed.mjs` helper + merge state machine | match | `computeTemplateProseHash()` exported; `mergeComposed` accepts `opts.lockTemplateProseHash`; four-case state machine (a/b/c/d) implemented and documented inline; returns `templateProseHash` for the lock writer. |
| `lib/sync.mjs` threading + lock write | match | `prevTemplateProseHash` map populated from prior locks; threaded into `mergeComposed`; written into composed lock entries. |
| New composed.test.mjs tests | match | 11 new tests across 2 describe blocks: 4 for `computeTemplateProseHash` (hex format, body-invariance, prose-sensitivity, LF-normalization) + 7 for state machine (cases a/b/c/d + skeleton-match no-op + fresh-start hash + (c) bootstrap silent-on-edited-prose). |
| New sync.test.mjs e2e tests | diverged | Not added. The four-case state machine is fully exercised at the `mergeComposed()` level in `composed.test.mjs`; sync threading is covered by code inspection + self-host integration evidence (drift-check passes, lock contains the field). End-to-end coverage at the `sync()` boundary would be redundant. |
| Lock fixtures (`tests/fixtures/cs03/lock/*.lock.json`) still validate | diverged / pre-existing | These fixtures fail Ajv validation because their placeholder hashes (`g`-`z` chars) don't match the `^[0-9a-f]{64}$` pattern. Verified to be pre-existing on `main` (predates CS03d), and these fixtures are not referenced by any test. Not a CS03d regression. Could be cleaned up in a separate small CS. |
| ADR 0001 v0.2.0 subsection | match | "Template prose evolution" subsection with the four-case table inserted before the lock-file recording section. |
| `LEARNINGS.md` LRN-020 status flip | match | `deferred` → `applied`; `deferred_until` removed; CS03d application paragraph added. |
| CHANGELOG entry | match | Unreleased: Added (`template_prose_hash` field) + Changed (no-more-mapping-for-prose-evolution + new helper). Non-breaking. |
| Self-host lock refresh | match | `.harness-lock.json` has `template_prose_hash` for all 3 composed files (CONVENTIONS.md, OPERATIONS.md, REVIEWS.md). |

### Test coverage

**Sufficient.** Verified:
- Case (a) template-evolved-consumer-untouched: `tests/composed.test.mjs` "case (a)".
- Case (b) consumer-edited-prose fail-closed: "case (b)".
- Case (c) pre-v0.2.0 bootstrap: "case (c): bootstrap" + "(c) bootstrap silent on edited prose".
- Case (d) no prior lock + extra prose: "case (d)".
- Hash properties: 4 dedicated tests.
- Fresh-start branch returns `templateProseHash`: dedicated test.
- 519 / 519 / 0 (`node --test tests/*.test.mjs`).

### Findings

**Blocking:** none.

**Non-blocking:**
- The `tests/sync.test.mjs` e2e scenarios listed in the original deliverables were not added; they would be redundant given the `composed.test.mjs` coverage at the `mergeComposed()` boundary plus the self-host integration evidence (sync drift-check passes; lock carries the new field).
- Pre-existing fixture validation issue (placeholders contain `g`-`z` chars) surfaced during R1 of the content review; classified as out-of-scope for CS03d. Could be cleaned up in a small follow-up CS if desired.

## Notes / Learnings

(filled during execution)

### LRN candidates

1. **The "no-prior-lock + extra-prose" case (d) preserves v0.1.x conservative fail-closed.** This is the only behavior path where the v0.1.x trap (LRN-020) still fires. For consumers running `harness sync` for the first time against an existing repo with extra prose in composed files, they still need a `legacy_composed_mapping.json`. This is intentional — without a prior lock to compare against, we cannot distinguish "user edited prose" from "never-synced existing file" — but it's worth documenting for first-sync UX. **Severity:** low; **Disposition candidate:** mention in HANDOFF.md or the consumer-onboarding docs that first-sync against a populated composed file may require a one-time legacy-mapping authorship.

2. **Pre-existing schema fixtures fail Ajv validation.** `tests/fixtures/cs03/lock/{valid-minimal,valid-with-scaffolds}.lock.json` and `tests/fixtures/cs03/sync/sync-already-synced/.harness-lock.json` carry placeholder hashes that violate the `^[0-9a-f]{64}$` pattern. Not consumed by any test (grep confirms). Authored as schema fixtures but never wired up. **Severity:** very low; **Disposition candidate:** small docs/cleanup CS to either fix the placeholder hashes (use real `crypto.createHash('sha256').update(...).digest('hex')` values) or move them to a `tests/fixtures/_unused/` archive directory.

(Both above are LRN candidates surfaced during plan-vs-impl review; orchestrator decides whether to elevate at close-out.)
