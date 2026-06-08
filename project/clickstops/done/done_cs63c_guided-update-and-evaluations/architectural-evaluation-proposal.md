# CS63c — Architectural-evaluation proposal (W6)

**Author:** `yoga-ah-c3` (orchestrator) · **Date:** 2026-06-08 · **CS:** CS63c
(CS63 arc, workstream W6) · **Status:** records confirmed CS63 decisions
C63-8 / C63-9 / C63-11.

This is the written proposal artifact required by CS63 deliverable 15. It does
**not** make new decisions — it captures the three architectural-evaluation
outcomes that were resolved in the CS63 umbrella (and, for C63-8, confirmed by
the user as **Q2** on 2026-06-06), states their disposition, and maps each to
its already-filed follow-up CS so the deferred surface is durably tracked.

---

## 1 — Skills / procedure-locality (C63-8, user-confirmed Q2)

**Recommendation: CLI-commands-first, runtime-skills-second.**

The harness must stay agent-agnostic — the repository is the only durable state,
and core lifecycle procedure must not be coupled to any one runtime's "skill"
system. A runtime skill that fails to load is a **silent-skip** failure mode,
which is worse than an unread doc for load-bearing procedure.

- Push lifecycle procedure into portable, testable `harness` **verbs** (CLI
  subcommands). `harvest` (C63-4) and `upgrade` (C63-6, this CS) are the first
  two new verbs; `claim` and `close-out` are the next candidates.
- Expose runtime "skills" (e.g. Copilot CLI skills) **only as thin wrappers**
  over those verbs — invocation only, never procedure logic.
- **Spike-then-commit**, not a big-bang refactor of load-bearing procedure.

**Disposition:** Adopted as the harness direction. The full lifecycle
command/skill surface (session-bootstrap, claim, close-out, dispatch, review
family, release verbs) and the skill-wrapper go/no-go spike are scoped to
**CS64** (`planned_cs64_lifecycle-command-skill-surface.md`, already filed). The
skill-wrapper decision is explicitly a spike + written go/no-go (CS64 C64-9),
honoring the agent-agnostic constraint.

## 2 — Process-doc right-sizing (C63-9)

**Recommendation: do only the safe, reversible win now; defer the high-risk
extraction.**

- **Now (this CS):** cap `CONTEXT.md` retained history to the **current + last 2
  "Prior" blocks**. Older detail already lives in the per-CS `done_csNN` files,
  so nothing is lost — it is relocated to its durable home. This stops the worst
  unbounded-growth offender with near-zero blast radius (no parser depends on the
  block count; verified in the CS63 plan review).
- **Deferred (CS65):** the high-blast-radius work — extracting `OPERATIONS.md`
  (~2038 lines) toward a leaner pointer-style doc via the C63-8 procedure→CLI
  migration, and the `LEARNINGS.md` archival split. Both are load-bearing:
  aggressive `OPERATIONS.md` trimming could remove a procedure an agent relies
  on, and a `LEARNINGS.md` split could break LRN-anchor cross-links. This work
  must ride **with** the CS64 CLI-commands surface, not ahead of it.

**Disposition:** `CONTEXT.md` cap done in this CS63c close-out. The deferred
extraction is scoped to **CS65** (`planned_cs65_process-doc-right-sizing.md`,
already filed), to follow CS64.

## 3 — C3 (process-discipline rules) disposition (C63-11)

**Recommendation: best-effort advisory, honestly labelled — no false mechanical
claim.**

The no-commit-preflight, explicit-file-ownership, and "never touch `lib/` unless
it is your deliverable" rules cannot be mechanically enforced under maintainer
credentials (an orchestrator running as the maintainer can always commit
anywhere). The docs already concede this. Pretending these are hard gates would
create **false confidence** — honesty over theater.

- Keep the rules documented as **best-effort advisory** (as they already are in
  `copilot-instructions.md` and `OPERATIONS.md`).
- Add a CI **diff-scope advisory** where feasible (a warning surfacing
  out-of-declared-ownership edits), **not** a blocking gate.
- Add **no** new hard gate claiming mechanical enforcement.

**Disposition:** Advisory-only, recorded here. No new hard gate is introduced by
the CS63 arc. Any future diff-scope advisory is a non-blocking nicety, trackable
separately; it is **not** a CS63 deliverable and is intentionally left as a
recorded no-op for the arc.

---

## Follow-up CS map

| Decision | Disposition in CS63 arc | Deferred follow-up (filed) |
|---|---|---|
| C63-8 skills / procedure-locality | CLI-commands-first adopted; `harvest`+`upgrade` shipped | **CS64** — lifecycle command/skill surface + wrapper spike |
| C63-9 doc right-sizing | `CONTEXT.md` history cap done (CS63c) | **CS65** — `OPERATIONS.md`/`LEARNINGS.md` right-sizing |
| C63-11 C3 disposition | Advisory-only; no new hard gate | (none — recorded no-op; optional CI diff-scope advisory) |

All four deferred stubs (**CS64, CS65, CS66, CS67**) were filed 2026-06-06 with
the CS63 arc plan, so the deferred surface is durably tracked on `main`.
