# CS15a — Public-readiness preparation **[GUARDRAIL]**

**Status:** active
**Owner:** yoga-ah
**Branch:** cs15a/content (pending)
**Started:** 2026-05-09
**Closed:** —
**Filed by:** cs-plan §CS15a (Phase E mainline gate; user authorization 2026-05-09 via Q1/Q2/Q7/Q9/Q11 answers)
**Depends on:** CS14 (v0.1.0 release tooling), CS02b/CS03d/CS03e (pre-CS15a hygiene)

## ⚠️ RESUME POINT (2026-05-09T18:07Z) — read this first if you're a fresh agent instance

The previous agent instance hit a transient AI-model error mid-content-PR. **No work was lost.** All progress so far is committed at `a7e756d` on `origin/cs15a/content`.

**Bootstrap for resume:**

```powershell
cd C:\src\agent-harness
git fetch origin
git checkout cs15a/content
git pull --ff-only
git --no-pager log -3 --oneline
node bin/harness.mjs lint --quiet      # expect 15/0/3
node --test tests/*.test.mjs 2>&1 | Select-String '^# (tests|pass|fail)'   # expect 533/533/0
node bin/harness.mjs sync --mode=check --cwd .   # expect "No drift detected"
```

**What's done on this branch:**

| Item | Status | Notes |
|---|---|---|
| Plan PR (#72) | ✅ merged | `c287aab` on main |
| Claim PR (#73) | ✅ merged | `4fd8abc` on main; rename planned→active |
| `.github/workflows/workboard-auto-approve.yml` | ✅ committed | precondition #8 — full bot workflow with path-allowlist + label + branch-name + actor checks; `actions/create-github-app-token@v1` pinned to a 40-char SHA per LRN-075. |
| `docs/cs15a-app-install.md` | ✅ committed | step-by-step App registration for henrik-me (Q1) |
| `docs/ruleset/main-protection.json` | ✅ committed | Repository Rulesets API request body for CS15b |
| `SECURITY.md` | ✅ committed | GHSA-only reporting policy + supported versions |
| `CONTRIBUTING.md` | ✅ committed | fork→PR flow, no CLA/DCO, commit-trailer and local gate conventions |
| `CODE_OF_CONDUCT.md` + issue templates | ✅ authored | Contributor Covenant 2.1 with GHSA enforcement; bug/feature/learning issue forms plus blank-issue routing |
| `.github/dependabot.yml` | ✅ authored | npm + GitHub Actions, weekly Monday cadence |
| `.github/workflows/{secret-scan,npm-pack-dry-run}.yml` | ✅ authored | required status-check workflows with SHA-pinned third-party actions |
| `docs/cs15a-repo-settings-checklist.md` | ✅ authored | user-facing GitHub UI checklist |
| `docs/pre-flip-readiness.md` | ✅ authored | all 25 preconditions with evidence and action-required rows |
| Secret/IP scan (#19-24) | ✅ complete | gitleaks 8.30.1 full-history scan found no leaks; grep sweeps and artifact review documented in readiness |
| Process-health audit (#1-5) | ✅ measured live | 5/5 CI green; sync=407ms (<5s); lint=1921ms (<10s); 4 CS12-CS14 LRNs applied (075/076/077/078); 0 open LRNs; CS03e closed cleanly per Q10. |

**What still needs to be done (in order):**

1. **Verify**: `harness lint --quiet` clean, `node --test` clean, `sync --mode=check` no drift.
2. **GPT-5.5 content rubber-duck** via `task` tool with `agent_type: code-review`, `model: gpt-5.5`, mode `sync`. Brief with the 25-precondition checklist; ask reviewer to verify each.
3. **Open content PR** (do not auto-merge): title `CS15a content: public-readiness preparation (GUARDRAIL) — action required from @henrik-me`. Body: full action-required checklist front-and-center.
4. **WAIT for user actions** — App install (per `docs/cs15a-app-install.md`) + repo-settings flips (per `docs/cs15a-repo-settings-checklist.md`). User pings when done.
5. **Bot dry-run + readiness update** — open a throwaway test PR matching the bot's allowlist; verify `workboard-auto-approve.yml` triggers, validates, approves, auto-merges; capture results in `docs/pre-flip-readiness.md` § Bot dry-run.
6. **GPT-5.5 plan-vs-impl review** (LRN-064 gate) — mandatory before close-out.
7. **Close-out PR** — rename active→done, populate `## Plan-vs-implementation review` section, update WORKBOARD/CONTEXT, pre-file `planned_cs15b_visibility-flip.md`.

**Why the previous instance stopped:** transient "Failed to get response from the AI model; retried 5 times" error during a `create` tool call. No state lost. The user-required GitHub UI work (steps 19) is the natural pause point regardless.

---

## Goal

Stand up everything that **can** be prepared while the repo is still private + free-tier (per [LRN-001](../../../LEARNINGS.md#lrn-001)) — public-facing files, CODEOWNERS, bot workflow code, secret/IP review, written Ruleset spec — without actually creating the GitHub Ruleset (impossible until CS15b flips public). **DOES NOT FLIP VISIBILITY.** All 25 cs-plan preconditions must be green before CS15b can claim.

Per the user authorization (2026-05-09):
- Q1: GitHub App `agent-harness-workboard-bot`; user (henrik-me) creates and installs.
- Q2: SECURITY.md = GHSA-only.
- Q7a: No prior git-history cleanup performed; scan runs cold.
- Q7b: If gitleaks finds anything → rotate + BFG history-rewrite (re-export only as last resort).
- Q9: Author missing `secret-scan` and `npm-pack-dry-run` workflows as part of CS15a.
- Q11: User sign-off is implicit when all 25 preconditions show green in `pre-flip-readiness.md`.

## Decisions made up front (no user check-in needed)

| # | Decision | Rationale |
|---|---|---|
| D1 | **Bot identity = GitHub App** named `agent-harness-workboard-bot` (per Q1). Workflow + manifest authored by orchestrator; user creates+installs the App and stores `WORKBOARD_BOT_APP_ID` + `WORKBOARD_BOT_PRIVATE_KEY` as repo secrets. | Least-privilege scoped permissions; no PAT rotation; dedicated identity. Contents write is required only for `gh pr merge --squash --auto`, and the App token is minted after the workflow validation gate passes. |
| D2 | **SECURITY.md uses GHSA `Report a vulnerability` only** (per Q2). No public email; no per-version supported-versions table beyond `v0.1.0` and `v0.2.0` (Unreleased). | Private by default; no PII exposure; no email rotation overhead. |
| D3 | **CONTRIBUTING.md = fork → PR only**, no CLA, no DCO; existing `Co-authored-by: Copilot` trailer convention stays. | Standard public OSS; matches existing commit history. |
| D4 | **CODE_OF_CONDUCT.md = Contributor Covenant 2.1 boilerplate**; enforcement contact = "via GitHub Security Advisory" (matches Q2). | Boilerplate with no email exposure. |
| D5 | **Dependabot** (not Renovate) for npm + GitHub Actions, weekly cadence; fine-grained config in `.github/dependabot.yml`. | Native GitHub; lighter setup; existing `dependabot/...` PRs already use it. |
| D6 | **Discussions stay OFF** for the public flip (per Q6 default). Can enable later when needed. | Smaller public surface area. |
| D7 | **gitleaks scan via local install** (download Go binary or `npm install -g gitleaks-cli` if available) + `secret-scan.yml` workflow uses `gitleaks/gitleaks-action@v2` (pinned to a 40-char SHA per LRN-075). | Two layers: one-shot full-history scan now + per-PR scan going forward. |
| D8 | **`npm-pack-dry-run.yml`** wraps the existing `scripts/check-pack.mjs` (CS13) as a standalone workflow so it can be a named status check at CS15b. No new logic. | Reuses existing self-host-guarded linter. |
| D9 | **Repo settings** that need GitHub UI: prepared as a one-page checklist at `docs/cs15a-repo-settings-checklist.md`. User applies; I verify state via `gh api repos/henrik-me/agent-harness` after they confirm. | I have no settings-API write access. |
| D10 | **`pre-flip-readiness.md`** is the single artifact summarizing all 25 preconditions with checkbox status; ALSO contains the "Action required from @henrik-me" checklist (App + repo settings) so the user has one document to work from. | One document, one source of truth. |
| D11 | **Sub-agent fan-out: NONE.** All 25 preconditions span schemas, workflows, JSON, YAML, gitleaks output, repo settings checklist, and a single readiness artifact. Sequential single-content-branch execution by orchestrator. The 6 cs-plan-listed parallelisable sub-tasks could be parallelised in principle but the disjoint-file-ownership overhead exceeds the parallelism benefit at this scale. | LRN-016 caution; consistency with cs02b/cs03d/cs03e. |
| D12 | **Ruleset JSON spec format = the body shape that `POST /repos/:owner/:repo/rulesets` accepts** (Repository Rulesets API), not the older Branch Protection API. | Decision #18 / #23 in cs-plan — Rulesets are the post-CS15b enforcement mechanism. |

## Deliverables (mapped to cs-plan preconditions)

### Process-health audit (#1-5)
- [x] #1 CS11 self-host CI gate green for all of CS12-CS14 — verified via `gh run list --workflow=harness-self-check.yml --branch main --limit 5`.
- [x] #2 `harness sync --check` < 5s; `harness lint` < 10s — measured on this repo: sync 407ms; lint 1921ms.
- [x] #3 `LEARNINGS.md` ≥ 3 `applied` learnings from CS12-CS14 demonstrating harvest loop — LRN-075/076/077/078 all applied.
- [x] #4 **All `open` LRNs dispositioned** — zero `open` entries.
- [x] #5 Hot-fix stability counter ≥ 1: CS03e closed cleanly with no `lib/` or `bin/` changes — counts (per Q10 confirmation).

### Ruleset spec (#6-7)
- [x] `docs/ruleset/main-protection.json` — Repository Rulesets API JSON body for `POST /repos/:owner/:repo/rulesets`. Includes:
  - PR-required, ≥1 approving review, dismiss stale reviews on push
  - Squash-merge only, linear history, conversation resolution required
  - Signed-commits intentionally not required because GitHub App squash auto-merge can otherwise stall for workboard-only PRs
  - Status checks list (9 required checks): `validate`, `validate-schemas`, `smoke / harness-lint`, `secret-scan`, `npm-pack-dry-run`, `commit-trailers`, `pr-body`, `check-workflow-pins`, `check-public-artifact`
  - No force pushes, no deletions, include administrators (no ad-hoc bypass)
  - Bot threat model: GitHub App with PR-review/write only; Ruleset does not require CODEOWNER review because the App cannot satisfy a human CODEOWNER requirement
- [x] `.github/CODEOWNERS` — verified default `* @henrik-me` plus `/lib/ @henrik-me` covers `template/managed/`, `template/composed/`, `schemas/`, `lib/`, `bin/`, and `.github/workflows/`.

### Bot workflow + dry-run prep (#8)
- [x] `.github/workflows/workboard-auto-approve.yml` — workflow that:
  - Triggers on `pull_request_target` with label `workboard-only` so App secrets are only used from base-controlled workflow code.
  - Validates: changed paths are exclusively `WORKBOARD.md` + `project/clickstops/{planned,active,done}/**` (no `lib/`, `bin/`, `template/`, `.github/workflows/`, `schemas/`, `package.json`, etc.).
  - Validates: PR author is in an allowlist (orchestrator agent IDs).
  - Validates: branch name matches `workboard/cs<NN>-(claim|close)` or `cs<NN>/(claim|close-out)`.
  - On all checks pass → uses `actions/create-github-app-token@<sha>` + `gh pr review --approve` + `gh pr merge --squash --auto`.
  - Logs decisions clearly; rejects loudly on any validation failure.
- [x] `docs/cs15a-app-install.md` — step-by-step GitHub App registration + install + secrets-storage instructions for henrik-me.
- [ ] **Dry-run** (after user installs App): trigger workflow on a throwaway test PR; capture results in `pre-flip-readiness.md`.

### Public-facing files (#9-14)
- [x] `SECURITY.md` — GHSA-only reporting policy + supported-versions table (`v0.1.0`, `v0.2.0` (Unreleased)).
- [x] `CONTRIBUTING.md` — fork→PR flow, no CLA, commit-trailer convention, lint+test gate before PR.
- [x] `CODE_OF_CONDUCT.md` — Contributor Covenant 2.1; enforcement via GHSA.
- [x] `.github/ISSUE_TEMPLATE/bug.yml` — structured bug report.
- [x] `.github/ISSUE_TEMPLATE/feature.yml` — feature request.
- [x] `.github/ISSUE_TEMPLATE/learning.yml` — learning-candidate report (per project convention).
- [x] `.github/ISSUE_TEMPLATE/config.yml` — disable blank issues; route security to GHSA.
- [x] `.github/pull_request_template.md` — audited for public phrasing; no private/internal wording found.
- [x] `.github/dependabot.yml` — npm + GitHub Actions, weekly Monday cadence, max 5 open PRs per ecosystem.

### Repo settings checklist (#15-18)
- [x] `docs/cs15a-repo-settings-checklist.md` — one-page list for henrik-me to apply via GitHub UI:
  1. Squash-merge only (verify currently set)
  2. Auto-delete head branches
  3. Wikis disabled
  4. Discussions: leave OFF
  5. Vulnerability alerts + automated security fixes ON
  6. Allow auto-merge ON
  7. Enable Private Vulnerability Reporting (GHSA)

### Secret hygiene + license/IP review (#19-24)
- [x] Install gitleaks locally (downloaded gitleaks 8.30.1 to the session workspace and verified checksum).
- [x] `gitleaks detect --source . --redact` over **full history** → 0 findings (report at `docs/gitleaks-history-results.json`).
- [x] License/IP grep sweep: scanned tenant UUID patterns, Microsoft/Azure URLs, token-like strings, and GitHub URLs; findings are documented placeholders, test fixtures, or expected public URLs.
- [x] Verify all fixture tokens are obvious placeholders (`ghp_FAKE_DO_NOT_USE` / `ghp_FAKEFAKE...`).
- [x] Inspect release artifacts: `npm pack --dry-run` produced 96 files / 614136 bytes; `v0.1.0` GitHub Release is draft with no assets.
- [x] All extracted-from-gwn content owned by user / MIT-compatible (git history authored by henrik-me/henrikm; source repo is public; project license MIT).

### Status-check existence (#25)
- [x] `.github/workflows/secret-scan.yml` — gitleaks-action workflow on PR + main; uses pinned action SHA per LRN-075.
- [x] `.github/workflows/npm-pack-dry-run.yml` — wraps `scripts/check-pack.mjs` as a standalone workflow.
- [ ] After both workflows ship: trigger them on the cs15a content PR; verify both green; capture run URLs in `pre-flip-readiness.md` as evidence for #25.

### `pre-flip-readiness.md` artifact
- [x] `docs/pre-flip-readiness.md` — single source of truth for CS15b. Contains:
  - All 25 preconditions with checkbox status + evidence link/command for each.
  - "Action required from @henrik-me" section: App creation steps + repo settings checklist + sign-off line.
  - Ruleset JSON spec summary (full file at `docs/ruleset/main-protection.json`).
  - Bot dry-run results (filled after user installs App).
  - License/IP review summary.
  - Secret-scan summary.

## Exit criteria

- All 25 preconditions show `✅` in `docs/pre-flip-readiness.md`.
- `node bin/harness.mjs lint --quiet` → 0 failed (now likely 16-18 linters with the new workflow files counted).
- `node --test tests/*.test.mjs` → 533+ passing, 0 failing.
- `node bin/harness.mjs sync --mode=check --cwd .` → "No drift detected".
- `node scripts/validate-schemas.mjs` → 0 failed.
- All new workflows (`secret-scan.yml`, `npm-pack-dry-run.yml`, `workboard-auto-approve.yml`) appear green on the cs15a content PR.
- `## Plan-vs-implementation review` populated by GPT-5.5 with `Outcome: GO` before close-out.
- User sign-off implicit per Q11 ("when this list is solved/green you have my sign-off").

## Sub-agent fan-out

**None** per D11. Sequential single-content-branch.

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| Process-health audit (#1-5) | done | yoga-ah | agent-id=yoga-ah \| role=orchestrator \| report-status=complete \| learnings=0 |
| Ruleset spec (#6-7) | done | yoga-ah | agent-id=yoga-ah \| role=orchestrator \| report-status=complete \| learnings=0 |
| Bot workflow + manifest (#8) | in_progress | yoga-ah | agent-id=yoga-ah \| role=orchestrator \| report-status=partial (workflow + App docs done; dry-run waits on user App install) \| learnings=0 |
| Public-facing files (#9-14) | done | yoga-ah | agent-id=yoga-ah \| role=orchestrator \| report-status=complete \| learnings=0 |
| Repo-settings checklist (#15-18) | done | yoga-ah | agent-id=yoga-ah \| role=orchestrator \| report-status=complete (user settings changes still external) \| learnings=0 |
| Secret/IP scan (#19-24) | done | yoga-ah | agent-id=yoga-ah \| role=orchestrator \| report-status=complete \| learnings=0 |
| New workflows (#25) | in_progress | yoga-ah | agent-id=yoga-ah \| role=orchestrator \| report-status=partial (workflow files done; PR run evidence pending) \| learnings=0 |
| `pre-flip-readiness.md` artifact | done | yoga-ah | agent-id=yoga-ah \| role=orchestrator \| report-status=complete \| learnings=0 |
| GPT-5.5 content rubber-duck | planned | — | agent-id=— \| role=reviewer \| report-status=pending \| learnings=0 |
| User actions: App + repo settings | planned | henrik-me | external dependency |
| Bot dry-run + readiness update | planned | — | agent-id=— \| role=orchestrator \| report-status=pending \| learnings=0 |
| GPT-5.5 plan-vs-impl review | planned | — | agent-id=— \| role=reviewer \| report-status=pending \| learnings=0 |

## Risks + mitigations

- **Risk:** gitleaks finds something. **Mitigation:** Q7b authorization is in place — rotate + BFG history-rewrite. If found, file as a separate commit with explicit user check-in (history rewrite is high-blast-radius, deserves a pause).
- **Risk:** Ruleset JSON spec wrong shape (Rulesets API is newer than Branch Protection). **Mitigation:** validate against GitHub's published JSON Schema for Rulesets if available; otherwise validate by dry-running `gh api -X POST` against a throwaway repo.
- **Risk:** Bot workflow has security gap (e.g. accepts a PR with `.github/workflows/` modifications). **Mitigation:** explicit path allowlist; explicit denylist for sensitive paths; actor allowlist; label requirement; branch-name regex. Belt-and-suspenders. Audited by GPT-5.5 rubber-duck.
- **Risk:** New required status checks listed in Ruleset spec haven't actually run yet. **Mitigation:** precondition #25 explicitly requires green-on-≥1-PR before CS15b — that's the gate.
- **Risk:** User actions (App install, repo settings) take longer than expected, leaving the cs15a/content PR sitting open. **Mitigation:** PR is fine sitting open; nothing in main moves until close-out.

## Plan-vs-implementation review

> _(filled at close-out per the gate — see [OPERATIONS.md § Plan-vs-implementation review (close-out gate)](../../../OPERATIONS.md#plan-vs-implementation-review-close-out-gate))_
