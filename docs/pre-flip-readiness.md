# CS15a — Pre-flip readiness

This is the single source of truth for the CS15b public visibility flip. CS15b
must not claim until every precondition below is green or explicitly marked as a
user-action dependency with captured follow-up evidence.

## Action required from @henrik-me

1. Create and install the GitHub App described in
   [`docs/cs15a-app-install.md`](cs15a-app-install.md), then store the
   `WORKBOARD_BOT_APP_ID` and `WORKBOARD_BOT_PRIVATE_KEY` repository secrets.
2. Enable auto-merge and Private Vulnerability Reporting in the GitHub UI if
   those controls are available. The API accepted the other repository setting
   changes but still reports `allow_auto_merge=false`, and the private
   vulnerability reporting endpoint is unavailable for this repo state.
3. Ping the orchestrator after both are done. The orchestrator will run the
   workboard bot dry-run and record the evidence below.

## Current status

| # | Preconditions | Status | Evidence |
|---|---|---|---|
| 1 | CS11 self-host CI gate green for CS12-CS14 and current mainline prep | ✅ Done | Last 5 `harness-self-check.yml` runs on `main` all `success`: runs `25611564144`, `25611547790`, `25611184620`, `25610548546`, `25610424056`. |
| 2 | `harness sync --check` < 5s; `harness lint` < 10s | ✅ Done | Measured on this branch: sync `407ms`; lint `1921ms`. |
| 3 | At least 3 applied learnings from CS12-CS14 | ✅ Done | LRN-075, LRN-076, LRN-077, and LRN-078 are applied. |
| 4 | All `open` LRNs dispositioned | ✅ Done | `Select-String -Path LEARNINGS.md -Pattern '^status: open'` returned `0`. |
| 5 | Hot-fix stability counter >= 1 | ✅ Done | CS03e closed cleanly with no `lib/` or `bin/` changes; recorded in `CONTEXT.md`. |
| 6 | Main branch Ruleset spec authored | ✅ Done | [`docs/ruleset/main-protection.json`](ruleset/main-protection.json). |
| 7 | CODEOWNERS covers protected paths | ✅ Done | `.github/CODEOWNERS` default `* @henrik-me` plus `/lib/ @henrik-me` covers templates, schemas, `lib/`, `bin/`, and workflows. The Ruleset does not require CODEOWNER review because the GitHub App bot cannot satisfy a human CODEOWNER requirement. |
| 8 | Workboard bot workflow and App install path ready | ⚠️ Waiting on user + dry-run | `.github/workflows/workboard-auto-approve.yml` and [`docs/cs15a-app-install.md`](cs15a-app-install.md) are authored. Dry-run waits for App installation and secrets. |
| 9 | Security policy | ✅ Done | [`SECURITY.md`](../SECURITY.md) uses GHSA-only reporting and supported-version table. |
| 10 | Contribution guide | ✅ Done | [`CONTRIBUTING.md`](../CONTRIBUTING.md) documents fork-to-PR, no CLA/DCO, trailer, lint/test gates. |
| 11 | Code of Conduct | ✅ Done | [`CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md), Contributor Covenant 2.1 adapted with GHSA enforcement channel. |
| 12 | Issue templates | ✅ Done | `.github/ISSUE_TEMPLATE/{bug,feature,learning,config}.yml`. |
| 13 | Pull request template public phrasing audit | ✅ Done | `.github/pull_request_template.md` reviewed; no private/internal wording found. |
| 14 | Dependabot config | ✅ Done | [`.github/dependabot.yml`](../.github/dependabot.yml), npm + GitHub Actions weekly Monday cadence, max 5 open PRs per ecosystem. |
| 15 | Squash-only merge posture | ✅ Done | Repository API now reports squash merge enabled, merge commits disabled, and rebase merging disabled. |
| 16 | Repo surface settings | ✅ Done | Repository API now reports wiki disabled, discussions disabled, auto-delete head branches enabled, and update-branch suggestions enabled. |
| 17 | Security settings | ⚠️ Partially done; user action required | Dependabot alerts endpoint returns `204`; automated security fixes are enabled; `security_and_analysis.dependabot_security_updates` reports `enabled` in the update response. Private Vulnerability Reporting endpoint returns `404`, and secret scanning remains unavailable/disabled while private. |
| 18 | Auto-merge enabled | ⚠️ User action required | `PATCH /repos/henrik-me/agent-harness` with `allow_auto_merge=true` succeeds but the repository API still reports `allow_auto_merge=false`; enable in the GitHub UI if available, or re-check after CS15b Ruleset setup. |
| 19 | Full-history gitleaks scan | ✅ Done | gitleaks `8.30.1`; `gitleaks detect --source . --redact --report-format json --report-path docs/gitleaks-history-results.json` scanned 205 commits and found no leaks. |
| 20 | License/IP grep sweep | ✅ Done | Tenant UUID, Microsoft/Azure URL, token, and GitHub URL sweeps found only documented placeholders, schema examples, test fixtures, and public/expected repository URLs. |
| 21 | Fixture tokens are obvious placeholders | ✅ Done | Public-artifact PAT fixture now uses `ghp_FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE`; CS14 docs/workflows use `ghp_FAKE_DO_NOT_USE`. |
| 22 | Release/package artifact inspection | ✅ Done | `npm pack --dry-run --json`: `henrik-me-agent-harness-0.1.0.tgz`, `96` files, `614136` bytes; `v0.1.0` GitHub Release is draft with no assets. |
| 23 | Extracted content ownership / license compatibility | ✅ Done | Git history for added harness files is authored by `henrik-me` / `henrikm`; source repo `henrik-me/guesswhatisnext` is public; project license remains MIT. |
| 24 | Public artifact redaction posture | ✅ Done | `scripts/check-public-artifact.mjs` remains wired in lint; pack dry-run excludes `.github/`, `tests/`, `project/`, lock/config, and logs. |
| 25 | Required status-check workflows exist and run | ✅ Done | PR #74 at head `8b9e839` is green for all 9 required contexts: `validate`, `validate-schemas`, `smoke / harness-lint`, `secret-scan`, `npm-pack-dry-run`, `commit-trailers`, `pr-body`, `check-workflow-pins`, and `check-public-artifact`. |

## Ruleset summary

`docs/ruleset/main-protection.json` is the intended CS15b request body for
`POST /repos/{owner}/{repo}/rulesets`. It targets `refs/heads/main`, enforces
deletion and non-fast-forward protection, linear history, one approving PR
review, stale-review dismissal, review-thread resolution,
squash-only merge, and the required status checks listed in the CS15a plan.
CODEOWNER review is intentionally not required in the Ruleset because the
workboard GitHub App cannot satisfy a human CODEOWNER requirement.
Signed-commit enforcement is also intentionally not required because it can
block GitHub App squash auto-merge for workboard-only PRs; linear history plus
required PR review/status checks remain enforced.

## Bot dry-run

Pending. This requires the GitHub App and repository secrets from
`docs/cs15a-app-install.md`.

Expected dry-run:

1. Open a throwaway workboard-only PR on an allowed branch name.
2. Add the `workboard-only` label.
3. Confirm `workboard-auto-approve.yml` validates label, branch, actor, and
   changed paths.
4. Confirm the App approves the PR and enables squash auto-merge.
5. Record run URL, PR URL, and conclusion here.

## Secret scan summary

- Tool: gitleaks `8.30.1`, downloaded to the session workspace and verified
  against the published release checksum.
- Command: `gitleaks detect --source . --redact --report-format json
  --report-path docs/gitleaks-history-results.json`.
- Result: no leaks found; report file contains `[]`.
- PR workflow: `.github/workflows/secret-scan.yml` downloads gitleaks `8.30.1`,
  verifies the release checksum, and runs `gitleaks dir . --redact
  --exit-code 1`; PR #74 passed at head `8b9e839`.

## License/IP review summary

- Token-like strings are documented placeholders, schema examples, or deliberate
  linter fixtures.
- UUID-like strings are documented placeholder schema examples.
- Microsoft/Azure URL sweep found no internal service URLs outside the
  checklist text describing what was searched.
- GitHub URL sweep found expected public URLs for this repository, GitHub
  settings, dependency metadata, examples, and the public source repository.
- `npm pack --dry-run` excludes private process files and test fixtures from
  the package artifact.
