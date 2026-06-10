# Runtime-skill spike — CS64 D9 (C64-9)

**Status:** complete  
**Date:** 2026-06-10  
**Author:** omni-ah (claude-opus-4.7-1m-internal)  
**Gate:** G-skill — **no-go** (this CS); follow-up CS deferred pending the silent-skip mitigation evidence outlined below.

## Question

Should CS64's five new lifecycle verbs (`harness startup`, `status`, `claim`,
`close-out`, `dispatch`) ship paired Copilot-CLI **runtime-skill wrappers** that
auto-load and invoke the verb at the right moment in the per-CS lifecycle, so
the orchestrator no longer has to remember which verb to run?

This is the deferred follow-up to **C63-8** ("CLI-commands-first,
runtime-skills-second") and the spike scope assigned to CS64 by **C64-9**.

## Recommendation: NO-GO (this CS)

The unmitigated **silent-skip failure mode** — the failure mode where a
skill's description does not match the agent's context, the skill does not
auto-load, and the procedure regresses silently because the orchestrator
*believed* the skill would handle it — is unacceptable for core lifecycle
procedure. The verbs are now mandatory entry points for claim / close-out /
dispatch; a skill that silently fails to fire would let an orchestrator skip
the harvest gate, skip the PVI preflight, or paste a non-verbatim preamble
(LRN-068 regression) without any visible warning.

Until a workable silent-skip mitigation has been **prototyped and validated
across multiple session contexts** (see § Silent-skip mitigation below), the
G-skill amendment of 2026-06-09 binds the recommendation to no-go.

The CLI verbs themselves stand on their own merits (CS64 D1–D7): they reduce
six probe commands to one (`startup`), eliminate hand-stepping the WORKBOARD
edit (`claim` / `close-out`), and replace the 60-line canonical preamble paste
with one command (`dispatch`). Skill wrappers would be an **invocation
convenience layer on top** — valuable but not load-bearing.

## Why not "go anyway with the mitigation as a future task"?

C64-9 explicitly bars this path: *"Absent a proper mitigation, the only valid
recommendation is no-go (with the unmitigated risk recorded as the rationale)."*
Shipping wrappers first and adding mitigation later would invert the risk
ordering — the regression window (silent-skip in the wild) opens immediately
while the safety net is still being designed.

This is the same discipline that made `dispatch`'s verbatim-paste rule the
operational standard: LRN-068 / LRN-073 validated **zero** preamble violations
across ~46 sub-agent dispatches when paste discipline is honored. Skill
wrappers would directly reintroduce the failure mode LRN-068 closed.

## Silent-skip mitigation (required by G-skill, NOT YET DEMONSTRATED)

For G-skill to flip to "go", a future CS must demonstrate **at least one** of
the following mitigations, validated against a real Copilot-CLI session
context — not just specified on paper:

1. **Doc-side unconditional reminder.** INSTRUCTIONS.md and OPERATIONS.md (+
   lockstep mirrors) name the underlying verb *inline*, not just inside the
   skill block. A reader who skips the skill block (or whose context did not
   auto-load it) still completes the procedure correctly because the prose
   itself names the verb. **This is what CS64 D8 already does** for every
   verb, and is the cheapest mitigation — the orchestrator pays the
   convenience cost (no skill auto-fire) but never the regression cost
   (procedure dropped). This mitigation is satisfied as of CS64 close-out.
2. **Verb-side skill-presence telemetry.** Each verb writes a small,
   machine-readable marker (e.g. an env-var probe like
   `HARNESS_SKILL_INVOKED=1`) that the wrapper sets when it fires. The verb
   logs "invoked via skill" vs. "invoked manually" so a periodic harvest
   audit can detect skills that *should* have fired but didn't (e.g. CS-loop
   step 12 was run by hand 5 sessions in a row → skill description likely
   broken). Surfaces silent-skip from cold telemetry, not from an
   orchestrator catching it in flight.
3. **Verb-side fail-fast on skill-context mismatch.** Each verb refuses to
   run if the call site looks wrong (e.g. `harness close-out` is invoked
   while the current branch is `cs<NN>/content`, which is "should be
   close-out branch" — already enforced by lib/closeout.mjs preflight). The
   verb does not depend on the skill firing; if the skill fails to fire and
   the orchestrator runs the wrong verb anyway, the preflight blocks. CS64
   already wires this defensively into every verb that mutates state.

Mitigations (1) and (3) are **already in CS64** — they are properties of the
verbs + docs themselves, not of any skill wrapper. They are necessary but
not sufficient: a skill ecosystem study must also demonstrate that the
wrapper *adds* enough convenience over the bare verb to justify its
existence, given that mitigations (1) and (3) already mean the bare verb is
correct in the silent-skip case.

The currently-missing piece is **mitigation (2)** — the cold-telemetry
audit. Without it, an orchestrator who runs the bare verb every time (the
silent-skip case under mitigations 1 + 3) will never discover that the
skill wrapper is broken, and the skill ecosystem will rot silently.
Designing + validating that telemetry is the gating work for a future
"runtime-skill wrappers ship" CS.

## What "go" would look like (deferred)

Should a future CS bring evidence for mitigation (2), the wrapper shape
would be:

- **One skill per verb.** Skill name = verb name (e.g. `harness-startup`).
- **Trigger phrase = a fragment of the verb's INSTRUCTIONS.md leverage
  sentence.** E.g. for `startup`: "session start", "first response",
  "before claiming any CS". For `claim`: "claim a CS", "ready to start
  CS\<NN\>". This couples skill descriptions to the doc surfaces CS64 D8
  already produces, so doc updates and skill descriptions drift in sync.
- **Body = single line.** The skill body invokes the verb and prints the
  output. No procedure logic; no prose. This is the C63-8 rule.
- **Bidirectional reference.** Each skill file documents (a) which verb it
  wraps, (b) what triggers it, (c) the silent-skip mitigation in effect.
  INSTRUCTIONS.md / OPERATIONS.md gain one line per verb pointing at the
  skill ("If your CLI loads the `harness-startup` skill, it fires the
  bootstrap check automatically; otherwise run `harness startup`").

Sample (illustrative only — NOT shipped this CS):

```markdown
# harness-startup

Triggered when the user mentions "session start", "first response", or
"before claiming any CS". Invokes `harness startup --pull-ff-only` and
reports the result. Wraps the lib/startup.mjs verb (CS64 C64-3).

**Silent-skip mitigation:** INSTRUCTIONS.md § Session Start names this
verb inline; if this skill fails to load, the orchestrator still runs the
verb directly from the doc. CS64 also writes telemetry so a harvest audit
can detect missed invocations.

Body:
  exec: harness startup --pull-ff-only
```

## G-skill resolution

**Verdict: no-go (this CS).** Silent-skip mitigation evidence is incomplete
(mitigations 1 + 3 are present; mitigation 2 — cold-telemetry audit — has
not been designed or validated). C64-9's binding language ("Absent a proper
mitigation, the only valid recommendation is no-go") applies.

**Follow-up CS:** Deferred. To be filed when an interested orchestrator
prototypes and validates mitigation (2) in real session contexts and brings
the evidence back to this gate. Until then, the verbs are the only
mandatory surface; skill wrappers are not on the roadmap.

**Risk accepted by no-go:** Orchestrators continue to run the verbs by hand
(or recall them from INSTRUCTIONS.md). This is no worse than the pre-CS64
state, where they ran the underlying procedures by hand. The convenience
ceiling is "type the verb name"; the convenience floor is what CS64 D8 +
this no-go preserves: every doc reader sees the verb name explicitly.
