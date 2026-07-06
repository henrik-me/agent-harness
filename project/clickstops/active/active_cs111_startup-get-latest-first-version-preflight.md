# CS111 — `harness startup`: enforce get-latest-first (version-mismatch preflight + clearer template-not-found error)

**Status:** active
**Owner:** yoga-ah
**Branch:** cs111/content
**Started:** 2026-07-06
**Closed:** —
**Filed by:** yoga-ah-c2 (orchestrator, Claude Opus 4.8) — triage of untriaged inbound issue [#502](https://github.com/henrik-me/agent-harness/issues/502) (2026-07-05). Directed by @henrik-me ("if there are open issues evaluate if those are all triaged … if not triage issues").
**Depends on:** none.

## Goal

Make the discipline "**get latest FIRST, then invoke the harness at the pulled pin**" mechanical in `harness startup`, so an operator on a stale CLI who runs `startup --pull-ff-only` and whose pull advances `harness.config.json` `version` no longer hits a cryptic `Template file not found`. Deliver #502's asks: a **version-mismatch preflight**, a **clearer template-not-found error**, and (open question) **pull-first-then-re-exec-at-the-pulled-pin**.

## Background

- Filed from inbound issue **#502** (state: open — re-verify `gh issue view 502` at claim-time HEAD, F6). Verified this session that #502 is open with **no** dedicated CS and zero references under `project/clickstops/**` (untriaged).
- **Repro (#502).** Consumer pinned to `v0.16.0`, clone behind `origin/main`. `origin/main` merged a `v0.17.0` bump adding managed target `DISPATCH-PREAMBLE.md`. `npx -y github:henrik-me/agent-harness#v0.16.0 startup --pull-ff-only`: `--pull-ff-only` fast-forwards the tree to the `v0.17.0` config, then bootstrap `sync --mode=check` runs under the **v0.16.0** CLI, which cannot find `template/managed/DISPATCH-PREAMBLE.md` (added in v0.17.0) → `Template file not found`. Re-running `startup` with `#v0.17.0` passes.
- **Root cause (#502).** No preflight compares the running package version (`package.json` `version`) to `harness.config.json` `version`. `config.version` is used for doc-ref rendering (`sync.mjs`), major-bump detection (`sync.mjs` `semverMajor`), workflow-pin checks (`check-workflow-pins.mjs`), and review-gate identity checks (`bin/harness.mjs`) — **never** vs. the running package version.
- **Self-host caveat (verified this session — must inform the design).** In THIS repo `package.json` `version` = `0.17.0` but `harness.config.json` `version` = **`0.0.0-pre`** (a deliberate self-host sentinel). A naïve `pkg.version !== config.version` preflight would therefore **false-fail the harness's own `startup`**. The preflight MUST exempt the pre-release/sentinel case (e.g. a `0.0.0-pre` / `0.0.0-*` sentinel, or a "running from a local checkout of this same repo" detection) so it fires only in the real stale-CLI-vs-pulled-config scenario, never on the self-host or a local dev checkout.
- **Grounding to verify at claim HEAD.** `harness startup` lives in `bin/harness.mjs` (the `startup` command; it already runs `--pull-ff-only` + the bootstrap `sync --mode=check` / lint / tests sequence — confirmed working this session). The template-render "Template file not found" error originates in `lib/sync.mjs` (managed-target resolution). Consumer-side mitigation (an INSTRUCTIONS.md "get latest first + take the pin from `harness.config.json`" note) is tracked in `henrik-me/authzandentitlements` (CS51) but relies on operator discipline — hence this harness-side mechanization.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| C111-1 | Version-mismatch preflight (#502 ask 2) | Before any template rendering, compare the running CLI version identity to the pinned `harness.config.json` `version` using **normalized/equivalent** comparison — reuse/extend the existing `normalizeInitVersion` semantics (`bin/harness.mjs`, CS26) so `0.17.0` and `v0.17.0` compare **equal** (strip a leading `v`). For a **SHA-pinned** config (`version` is a 40-char commit SHA), compare against the running build's provenance/ref if determinable, else **scoped-exempt** it (do NOT fail-fast on a SHA pin the CLI cannot self-identify against) rather than false-failing. On a **real, resolvable** mismatch, **fail fast** (non-zero) with a message naming BOTH versions and the exact re-run command: `Re-run with npx -y github:henrik-me/agent-harness#<config.version> <same args>`. Run it inside `harness startup` (and share it on the `sync` render path so a mismatch is caught before the cryptic error). | The stale-CLI-vs-pulled-config collision is silent today; a fail-fast with both versions + the corrective command makes the get-latest-first discipline mechanical instead of memory-dependent. Normalization is mandatory: seeded/init pins are `v`-normalized (or SHAs), so a literal string compare would false-fail valid consumers (#502's own repro pins `v0.17.0` vs a bare `0.17.0` package). |
| C111-2 | Sentinel / SHA / local-checkout exemption | The preflight MUST NOT fire when `config.version` is a self-host sentinel (`0.0.0-pre` / `0.0.0-*` pre-release), when it is a **SHA pin the running CLI cannot self-identify against** (C111-1), or when the CLI is demonstrably the same local checkout as the repo (self-host / dev). Provide an explicit escape hatch (`--skip-version-check` flag and/or an env var) for intentional divergence. | Verified this repo runs `pkg=0.17.0` vs `config=0.0.0-pre`; without the exemption the preflight would false-fail the harness's own `startup` and every local dev checkout. The SHA/normalization exemptions prevent false-failing valid `v`-prefixed or SHA-pinned consumers. |
| C111-3 | Post-pull ordering (#502 ask 1, MVP half) | When `startup --pull-ff-only` advances `config.version`, run the preflight **after** the pull, so the mismatch is evaluated against the **pulled** pin (the state the operator will actually validate under) — turning the post-pull collision into an actionable fail-fast rather than a `Template file not found`. | The bug window is exactly "pulled new config, still on old CLI"; evaluating the preflight post-pull is what catches it. |
| C111-4 | Auto re-exec at the pulled pin (#502 ask 1, full) | **Deferred to an open question / optional stretch**, NOT the MVP. Auto re-invoking a *different* CLI version mid-run (e.g. spawning `npx …#<config.version>`) adds process-spawn complexity + a supply-chain/exec surface; the C111-1 preflight already makes the discipline mechanical (fail fast + the exact re-run command). Decide at claim whether a guarded opt-in re-exec is worth it. | Prefer the minimal, safe mechanization (fail-fast + instruct) over spawning a foreign CLI build; re-exec is reversible to add later if the preflight proves insufficient. |
| C111-5 | Clearer template-not-found error (#502 ask 3) | When a managed template target is missing during render (`lib/sync.mjs`), the error MUST hint at a possible version mismatch and print BOTH the running `pkg.version` and `config.version`, so even a code path that bypasses the startup preflight surfaces the real cause. | Defence in depth: the preflight is the primary guard, but the render-time error is where the failure actually lands, so it must self-diagnose. |
| C111-6 | SemVer + scope | **Minor** (new startup preflight + clearer error; additive, behaviour-preserving on match/sentinel). Scope is `harness startup` + the shared render-time error; do not alter the pull mechanics or the bootstrap check set otherwise. | Additive guard; bounded blast radius. |

## Deliverables

1. **Version-mismatch preflight** in `harness startup` (shared with the `sync` render path): compare the running CLI version identity to `harness.config.json` `version` using **normalized** comparison (`0.17.0` ≡ `v0.17.0`, reusing `normalizeInitVersion` semantics); on a real, resolvable mismatch fail fast (non-zero) with a message naming both versions + the exact `npx -y github:henrik-me/agent-harness#<config.version> …` re-run command. Sentinel / SHA-pin / local-checkout exemption (C111-2) + an explicit `--skip-version-check` escape hatch.
2. **Post-pull ordering** (C111-3): `startup --pull-ff-only` runs the preflight **after** the pull so a pin advance is caught against the pulled version.
3. **Clearer `Template file not found`** (C111-5): the render-time managed-target-missing error hints at a version mismatch and prints both versions.
4. **Tests** (`node --test`): the preflight fires on a real mismatch and stays silent on (a) an exact match, (b) a **normalized** match (`0.17.0` vs `v0.17.0`), (c) the `0.0.0-pre` self-host sentinel, and (d) a **SHA-pinned** config the CLI can't self-identify against; the `--skip-version-check` escape hatch suppresses it; the improved template-not-found error includes both versions.
5. **`CHANGELOG.md` `[Unreleased]`** entry (Minor); issue **#502** referenced for auto-close on merge. Optionally document the get-latest-first mechanization in INSTRUCTIONS.md's session-start checklist.

## User-approval gates

- **None (MVP).** The preflight + clearer error are additive, low-blast-radius guards. The **auto re-exec at the pulled pin** (C111-4) — if a claim-time decision pursues it — spawns a foreign CLI build and SHOULD be escalated before shipping; the MVP does not include it.

## Exit criteria

1. `harness startup` fails fast with an actionable dual-version message + the corrective `npx …#<config.version>` command when the running CLI version ≠ the pinned `config.version`, **especially after a `--pull-ff-only` that advanced the pin** (C111-3).
2. The preflight stays silent on a matching version, on the `0.0.0-pre` self-host sentinel, and under the `--skip-version-check` escape hatch (no self-host / local-dev regression).
3. The render-time `Template file not found` error names both versions and hints at a version mismatch.
4. Tests + `harness lint` green; `sync --mode=check` clean; `CHANGELOG.md` entry present. Plan-vs-implementation review (GPT-5.5) GO.

## Risks + open questions

| # | Risk / what breaks | Mitigation |
|---|---|---|
| R1 | The preflight false-fails the self-host `startup` (`pkg=0.17.0` vs `config=0.0.0-pre`) or any local dev checkout. | C111-2 sentinel/local-checkout exemption + `--skip-version-check`; a self-host `startup` regression test is a hard exit gate. |
| R2 | Over-eager failure on a **valid** consumer whose pin format differs (`v0.17.0` vs bare `0.17.0`, or a SHA pin) — a literal string compare would false-fail them. | Normalized/equivalent compare (C111-1, reuse `normalizeInitVersion`); SHA-pin scoped exemption (C111-2); tests for the `v`-prefixed + SHA cases (D4); plus the `--skip-version-check` escape hatch. |
| R3 | Auto re-exec (C111-4) spawns a foreign CLI build (complexity + supply-chain/exec surface). | Deferred out of the MVP; the fail-fast preflight is the mechanization. If pursued, escalate first. |
| Q1 | Should the preflight live only in `startup`, or in a shared preflight that every render-invoking command runs? | Resolve at claim recon; C111-1 shares it on the `sync` render path, but the exact factoring (a `assertVersionMatch()` helper vs. inline) is an implementation call. |

## Plan review

| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |
|---|---|---|---|---|---|---|---|
| R1 | gpt-5.5 | claude-opus-4.8 | cs111-plan-review (yoga-ah-c2) | ca4ef6c555d5 | 2026-07-06T04:02:00Z | Go | Pre-pass Needs-Fix (literal version compare false-fails v-prefixed/SHA pins) fixed: normalized compare (normalizeInitVersion) + SHA exemption + tests. Faithful to #502 MVP. |

## Model audit

| Field | Value |
|---|---|
| Implementer models | claude-opus-4.8 |
| Reviewer model | gpt-5.5 |
| Implementer agent | yoga-ah |
| Reviewer agent | rubber-duck (orchestrator: yoga-ah) |
| Notes | CS111 implements #502 (`harness startup` version-mismatch preflight + clearer template-not-found error). Independence per REVIEWS.md § 2.3 — reviewer `gpt-5.5` ≠ implementer `claude-opus-4.8`. |

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| C111-1/C111-2: version-mismatch preflight (shared helper) — normalized compare reusing `normalizeInitVersion`; sentinel (`0.0.0-pre`)/SHA-pin/local-checkout exemption; `--skip-version-check` escape hatch; fail-fast naming both versions + the `npx …#<config.version>` re-run command | planned | yoga-ah | role=implementer |
| C111-3: post-pull ordering — the preflight runs AFTER `--pull-ff-only` so a pin advance is evaluated against the pulled version | planned | yoga-ah | role=implementer |
| C111-5: clearer `Template file not found` (`lib/sync.mjs` `ESYNC_MISSING_TEMPLATE`) — hint at a version mismatch + print both `pkg.version` and `config.version` | planned | yoga-ah | role=implementer |
| Tests (`node --test`) — preflight fires on a real mismatch; stays silent on exact/normalized (`0.17.0`≡`v0.17.0`) match, the `0.0.0-pre` sentinel, and a SHA-pin the CLI can't self-identify against; `--skip-version-check` suppresses; the improved template-not-found error includes both versions | planned | yoga-ah | role=implementer |
| CHANGELOG.md: add `[Unreleased]` entry (Minor); reference #502 for auto-close on merge | planned | yoga-ah | role=implementer |
| Local review — GPT-5.5 rubber-duck of the implementation (independence invariant, REVIEWS.md § 2.3) + Copilot engage | planned | rubber-duck | role=reviewer |
| Close-out: docs + restart state (WORKBOARD + CONTEXT + handoff) | planned | yoga-ah | role=orchestrator |
| Close-out: learnings + follow-ups (LEARNINGS.md) | planned | yoga-ah | role=orchestrator |

## Notes / Learnings

(filled during execution)

- **Plan review (pre-claim, two independent gpt-5.5 passes).** An initial pass (2026-07-06) returned **Needs-Fix** on one blocker: a literal `pkg.version` vs `config.version` compare would **false-fail valid consumers**, because `package.json` is a bare `0.17.0` while seeded/init pins are `v`-normalized (or 40-char SHAs) — #502's own repro pins `v0.17.0`. Resolved: **C111-1** now mandates a normalized/equivalent compare (reuse `normalizeInitVersion` so `0.17.0` ≡ `v0.17.0`) + a SHA-pin scoped exemption (**C111-2**), and Deliverables 1/4 + Risk R2 add the `v`-prefixed, `0.0.0-pre` sentinel, and SHA cases. The recorded attestation row (R1, gpt-5.5, **Go**) is the follow-up pass over the fixed Decisions+Deliverables (hash `ca4ef6c555d5`).

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
