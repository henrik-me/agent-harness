# CS90a — #391 L1: documented per-PR `sync --mode=check` baseline drift snippet + `harness-drift.yml` low-activity repositioning

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** CS90 deliverable 2 / C90-6 (2026-07-05 by `yoga-ah`) — implements inbound issue [#391](https://github.com/henrik-me/agent-harness/issues/391) under the layering model fixed by [ADR-0005](../../../docs/adr/0005-ci-drift-review-gate-layering.md) (L1 + L2 repositioning). One of the three mandatory sub-CSs split from CS90 (C90-6).
**Depends on:** **CS90** (HARD) — [ADR-0005](../../../docs/adr/0005-ci-drift-review-gate-layering.md) fixes the L1/L2 layering model and the L1-vs-L3 drift-semantics this CS documents. Do NOT claim before user-approval **G90-1** (ADR layering model + CS90a/b/c breakdown) is granted.

## Goal

Ship the **L1** baseline from ADR-0005: a documented, paste-ready per-PR `harness sync --mode=check` `ci.yml` job snippet (a snippet, NOT a new managed workflow — C90-2), and reposition the shipped `harness-drift.yml` (L2) explicitly as belt-and-suspenders for **low-activity** repos with its behaviour unchanged. Document the L1-vs-L3 drift-semantics difference so consumers do not stack redundant drift gates. Close #391.

## Background

Filed from inbound issue **#391** (state: open — re-verify `gh issue view 391` at claim-time HEAD, F6). #391 asks the harness to (1) ship/recommend a minimal per-PR `sync --mode=check` baseline (the lightweight equivalent of the `harness-sync-check` job `henrik-me/sub-invaders` hand-authored), (2) reposition `harness-drift.yml` as low-activity belt-and-suspenders keeping its auto-fix PR, and (3) document the drift-detection layering. ADR-0005 (CS90) already fixes that layering; CS90a is the concrete L1/L2 documentation change.

Grounding (verify at claim HEAD):

- `harness sync` defaults to **check** mode and `harness check` is a read-only alias for `sync --mode=check` (`bin/harness.mjs:105,191,194`). `sync --mode=check` exits `1` on drift, `0` when clean (`bin/harness.mjs:2102`).
- The shipped `harness-drift.yml` `check-drift` step already invokes `npx -y "github:henrik-me/agent-harness#${CLI_REF}" sync --mode=check --cwd .` with a shell-injection-hardened ref allowlist `^[a-zA-Z0-9._/-]+$` in its `derive-ref` step (CS12 R1). L1's snippet mirrors this.
- L1-vs-L3 semantics (ADR-0005 §"L1-vs-L3 drift-semantics"): L1's `sync --mode=check` fails on ANY drift including **seeded-file absence** (`lib/sync.mjs:1272`), whereas L3's `check-managed-drift.mjs` classifier fails only on **managed/composed** drift (`PROTECTED_CLASSES = {managed, composed}`, `check-managed-drift.mjs:46`). So L1 is strictly stricter.
- `harness-drift.yml` is in the self-host `managed.files` set, so a header edit regenerates the self-host root copy (re-run `sync --mode=apply`; keep `sync --mode=check` clean).

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C90a-1 | How L1 ships | A **documented `ci.yml` job snippet** a consumer pastes into their existing CI workflow — NOT a new managed workflow (per ADR-0005 C90-2). | A fourth managed workflow is a file every consumer must adopt and keep in sync; a snippet is zero adoption cost. |
| C90a-2 | Snippet hardening | The canonical snippet mirrors `harness-drift.yml`'s `derive-ref` step: derive the harness ref from `harness.config.json` `version`, validate against the `^[a-zA-Z0-9._/-]+$` allowlist BEFORE any shell interpolation (CS12 R1), and offer both the `npx github:` one-liner and the clone-then-run form (`git clone` + `npm ci` + `node <harness>/bin/harness.mjs sync --mode=check --cwd .`) for repos hitting the npm 10.8.x GitFetcher flakiness. | Shipping an unhardened snippet would invite shell-injection copy-paste; the two forms cover both invocation paths already used in-tree. |
| C90a-3 | Where the snippet is documented | Add the snippet + adoption guidance to a single authoritative docs home (candidate: a new `## Drift / CI layering` section in `OPERATIONS.md`, or a `docs/` guide) and cross-link it from ADR-0005. Exact home resolved at claim recon (Q1). | One authoritative location prevents the snippet drifting across README/OPERATIONS copies. |
| C90a-4 | `harness-drift.yml` repositioning | Edit ONLY the workflow's header comment (and any doc that describes it) to position L2 as **belt-and-suspenders for low-activity repos**; the cron schedule, `sync --mode=apply`, and PR-open behaviour are **unchanged**. | #391 asks for repositioning, not behaviour change; a header/doc-only edit keeps L2's proven auto-fix path intact. |
| C90a-5 | L1-vs-L3 semantics note | Document, alongside the snippet, that L1 is strictly stricter than L3's classifier (L1 fails on seeded-file absence that L3 tolerates), so consumers should not blindly stack both — add L3 only for its escape valve, ideally in `drift-only` mode (CS90b). | This is the crux of avoiding redundant double-gating (ADR-0005 C90-2); documenting it at the snippet's point-of-use is where a consumer decides. |

## Deliverables

1. A documented, hardened per-PR `harness sync --mode=check` `ci.yml` job snippet (ADR-0005 §L1) in the chosen docs home, with the `npx github:` and clone-then-run variants, the ref-allowlist hardening, and SHA-pin-your-actions guidance.
2. `harness-drift.yml` header/doc edit repositioning it as low-activity belt-and-suspenders (behaviour unchanged); self-host regeneration so `sync --mode=check` stays clean.
3. The L1-vs-L3 drift-semantics note documented at the snippet's point-of-use, cross-linked to ADR-0005.
4. `CHANGELOG.md` `[Unreleased]` entry; issue #391 referenced for auto-close on merge.
5. `harness lint` (text-encoding + doc-xref-resolvability) green; `node --test tests/*.test.mjs` green; `sync --mode=check` clean after the `harness-drift.yml` regeneration.

## User-approval gates

- Inherits **G90-1** (ADR-0005 layering model + CS90a/b/c breakdown). CS90a is not claimed until G90-1 is granted.

## Exit criteria

1. The L1 snippet exists, is shell-injection-hardened (ref allowlist), and a consumer can paste it to gate template drift at PR time.
2. `harness-drift.yml` is repositioned as low-activity belt-and-suspenders with behaviour unchanged; the self-host root copy is regenerated and `sync --mode=check` is clean.
3. The L1-vs-L3 drift-semantics note is documented and cross-linked from ADR-0005.
4. Issue #391 is closed. `harness lint` + `node --test tests/*.test.mjs` green.
5. Plan-vs-implementation review (GPT-5.5) GO.

## Risks + open questions

| # | Risk / what breaks | Mitigation |
|---|---|---|
| R1 | `harness-drift.yml` is in self-host `managed.files`; editing its header regenerates the self-host root copy and could leave `sync --mode=check` drifting if not regenerated. | Header-comment-only edit; run `sync --mode=apply` to regenerate the root copy; confirm `sync --mode=check` clean before merge (mid-CS managed-file edit, this CS's deliverable). |
| R2 | A documented snippet (vs a shipped workflow) risks low adoption or staleness relative to the workflows it mirrors. | ADR-0005 C90-2 resolved snippet over workflow (zero adoption cost); keep the snippet cross-linked from ADR-0005 + the L2 header so a future workflow change is a documented single point to update. |
| R3 | A naively-copied snippet could allow shell injection via an unvalidated ref. | Mirror `harness-drift.yml`'s `derive-ref` allowlist `^[a-zA-Z0-9._/-]+$` (CS12 R1); document SHA-pinning the `actions/*` uses. |
| Q1 | Where does the snippet live — `OPERATIONS.md`, `README.md`, or a new `docs/` guide? | Resolve at claim recon; ADR-0005 cross-links wherever it lands (C90a-3). |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | cs90-plan-review (yoga-ah) | fd5e552c9d7c | 2026-07-05T16:50:00Z | Go | Verified #391 OPEN; L1/L3 drift semantics, sync/check flags, harness-drift trigger/auto-PR, cited paths. No plan amendments. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per § Claim) | planned | — | — |

## Notes / Learnings

(filled during execution)

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
