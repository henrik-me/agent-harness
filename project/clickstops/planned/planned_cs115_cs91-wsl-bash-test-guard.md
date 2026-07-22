# CS115 — Make the CS91 bash-execution test WSL-robust (presence probe → trim-capability probe)

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** omni-ah (orchestrator, Claude Opus 4.8) on 2026-07-22. Surfaced when `harness startup` reported a broken tree (2105 pass / 1 fail) on `HENRIKM-OMNI`: `tests/cs91-workboard-auto-approve-hardening.test.mjs` group (g) deterministically false-fails because `bash` resolves to WSL bash, which mis-evaluates the POSIX `[![:space:]]` class in `${..%%..}` parameter expansion. Directed by @henrik-me ("Fix the test issue" + "file the learnings cs"). Records **LRN-224**.
**Depends on:** none.

## Goal

Restore the "main is always green" invariant on developer machines where `bash` resolves to a build that mis-evaluates the shipped C91-1 trim expansion (notably **WSL bash on Windows**), by gating the optional group-(g) bash-execution tests on a **capability probe** instead of a mere **presence probe** — so they SKIP where `bash` cannot evaluate the construct and still RUN on Linux CI / git-for-windows bash. **No change to shipped workflow behaviour.**

## Background

- `tests/cs91-workboard-auto-approve-hardening.test.mjs` group (g) runs the shipped C91-1 trim expansion (`TRIM_EXPANSION`) under `bash` and asserts it trims surrounding whitespace. On WSL bash (`…\WindowsApps\bash.exe`, v5.2.21) the POSIX `[![:space:]]` class inside `${p%%[![:space:]]*}` mis-evaluates (matches spaces too), collapsing the trim to empty (`[]`), so the assertion `[WORKBOARD.md]` fails. git-for-windows bash and Linux CI bash are correct — that is why `main` is green on CI and the shipped workflow works.
- The gate `hasBash()` was a **presence** probe (`bash -c 'printf ok'`), which returns true for WSL bash, so the (g) tests RAN and FAILED on that machine. `harness startup` then reports a broken tree though CI is green — a false local failure.
- This is **not** a parallel-race flake (it fails identically in isolation); it is **ambient-toolchain dependence** in the test guard. The fix also preserves parallel/any-order determinism (the (g) block writes no files; scratch is inline via `spawnSync`).
- Test (c) (`:106-117`) already asserts `TRIM_EXPANSION` is the actual workflow trim, so a capability probe built on `TRIM_EXPANSION` gates the (g) tests equivalently to their extracted `trimLine`.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C115-1 | Guard type | Replace the presence probe `hasBash()` with a **capability** probe `bashTrimsCorrectly()` that runs `TRIM_EXPANSION` on `"  x  "` and requires stdout `[x]` | A test that exercises SHIPPED shell behaviour must gate on whether THIS `bash` evaluates the construct correctly, not on mere `bash` presence. |
| C115-2 | Skip vs. fix-the-expansion | SKIP the (g) tests when the probe fails; do **not** modify the shipped trim expansion | The expansion runs on GitHub Actions (Linux) where it is correct; it is not meant to run on WSL bash. Skipping where unsupported keeps meaningful CI/git-bash coverage without a false local failure. |
| C115-3 | Skip-reason clarity | Update the skip reason to `"bash unavailable or mis-evaluates the POSIX [:space:] trim (e.g. WSL bash)"` | The old `'bash unavailable'` reason was misleading (bash IS available on WSL); the new reason names the actual cause. |
| C115-4 | Probe source | Build the probe on the module-level `TRIM_EXPANSION` constant (asserted == the workflow trim by test (c)) | Keeps the probe consistent with the shipped construct without a hand-typed copy; `TRIM_EXPANSION` is defined before the guard. |
| C115-5 | Scope | Single-file change to `tests/cs91-workboard-auto-approve-hardening.test.mjs` + the `LEARNINGS.md` entry; **no** workflow/lib/schema change | Bounded blast radius; test-only robustness fix. |

## Deliverables

1. `tests/cs91-workboard-auto-approve-hardening.test.mjs` — replace `hasBash()`/`BASH_AVAILABLE` with `bashTrimsCorrectly()`/`BASH_TRIM_OK` (capability probe on `TRIM_EXPANSION` requiring `[x]`); update both group-(g) `{ skip: … }` reason strings. No other test logic changes.
2. `LEARNINGS.md` — **LRN-224** recording the WSL-bash `[:space:]` param-expansion mis-eval + the presence-vs-capability-probe finding (CS115 is the fix vehicle).
3. **Verification:** on a WSL-bash machine the (g) tests SKIP (suite green, 0 fail); on Linux CI / git-bash they still RUN; `node --test tests/*.test.mjs` 0 fail; `harness lint` 0-fail; `harness startup` no longer reports a broken tree locally.

## User-approval gates

- Direction approved by @henrik-me this session ("Fix the test issue" + "file the learnings cs").

## Exit criteria

1. The `tests/cs91-…` guard is a capability probe; the (g) tests skip on `bash` builds that mis-evaluate the trim and still run on correct `bash`.
2. `node --test tests/*.test.mjs` and `harness lint` green; `harness startup` reports a green tree on `HENRIKM-OMNI`.
3. LRN-224 filed. Plan-vs-implementation review (GPT-5.5) GO before close-out.

## Risks + open questions

| # | Risk / what breaks | Mitigation |
|---|---|---|
| R1 | The capability probe FALSE-skips on a correct `bash` (silently losing coverage). | The probe requires the exact `[x]` result; git-bash + Linux CI produce `[x]` (verified this session), so they still run; only mis-evaluating builds skip. |
| R2 | `TRIM_EXPANSION` drifts from the workflow trim, so the probe tests the wrong construct. | Test (c) asserts `TRIM_EXPANSION` == the workflow trim; a drift fails (c) independently. |
| Q1 | Should `harness startup`'s broken-tree classifier special-case env-skippable tests? | Out of scope here; a broader "environment-dependent test" convention could be a follow-up. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | cs115-plan-review (omni-ah) | c600c8de91f0 | 2026-07-22T18:38:16Z | Go | No blockers; capability probe matches shipped trim, skips broken WSL bash, preserves correct Git Bash/Linux coverage. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per § Claim) | planned | — | — |

## Notes / Learnings

(filled during execution)

- Records **LRN-224**. The fix implementation is verified this session: after the guard change, `node --test tests/*.test.mjs` reports 2104 pass / 0 fail / 5 skip (the two group-(g) execution tests skip on this WSL-bash machine); the CS91 file alone is 28 pass / 0 fail / 2 skip.

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
