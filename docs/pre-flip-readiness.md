# CS15a — Pre-flip readiness

This is the single source of truth for the CS15b public visibility flip. CS15b
must not claim until every precondition below is green or explicitly marked as a
user-action dependency with captured follow-up evidence.

## Action required from @henrik-me

None. The repository is public, the main Ruleset is active, and the settings
that were private/free-tier gated during CS15a now validate through GitHub API
readback.

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
| 8 | Workboard bot workflow and App install path ready | ✅ Done | `.github/workflows/workboard-auto-approve.yml`, [`docs/cs15a-app-install.md`](cs15a-app-install.md), and `scripts/cs15a-workboard-app-helper.mjs` are authored. `WORKBOARD_BOT_APP_ID` and `WORKBOARD_BOT_PRIVATE_KEY` exist; dry-run PR #78 was approved and merged by the App. |
| 9 | Security policy | ✅ Done | [`SECURITY.md`](../SECURITY.md) uses GHSA-only reporting and supported-version table. |
| 10 | Contribution guide | ✅ Done | [`CONTRIBUTING.md`](../CONTRIBUTING.md) documents fork-to-PR, no CLA/DCO, trailer, lint/test gates. |
| 11 | Code of Conduct | ✅ Done | [`CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md), Contributor Covenant 2.1 adapted with GHSA enforcement channel. |
| 12 | Issue templates | ✅ Done | `.github/ISSUE_TEMPLATE/{bug,feature,learning,config}.yml`. |
| 13 | Pull request template public phrasing audit | ✅ Done | `.github/pull_request_template.md` reviewed; no private/internal wording found. |
| 14 | Dependabot config | ✅ Done | [`.github/dependabot.yml`](../.github/dependabot.yml), npm + GitHub Actions weekly Monday cadence, max 5 open PRs per ecosystem. |
| 15 | Squash-only merge posture | ✅ Done | Repository API now reports squash merge enabled, merge commits disabled, and rebase merging disabled. |
| 16 | Repo surface settings | ✅ Done | Repository API now reports wiki disabled, discussions disabled, auto-delete head branches enabled, and update-branch suggestions enabled. |
| 17 | Security settings | ✅ Done | After public flip: Dependabot alerts/security updates are enabled; Private Vulnerability Reporting returned `204`; `security_and_analysis.dependabot_security_updates` reports `enabled`; secret scanning reports `enabled`. The post-flip `fast-uri` Dependabot alerts are addressed by the close-out lockfile update to `3.1.2`; `npm audit --audit-level=high` reports 0 vulnerabilities on this branch. |
| 18 | Auto-merge enabled | ✅ Done | After public flip and Ruleset creation: `allow_auto_merge=true`; main Ruleset `main-protection` is active (`id=16185634`); squash merge remains enabled while merge commits/rebase are disabled. |
| 19 | Full-history gitleaks scan | ✅ Done | gitleaks `8.30.1`; `gitleaks detect --source . --redact --report-format json --report-path docs/gitleaks-history-results.json` scanned 205 commits and found no leaks. |
| 20 | License/IP grep sweep | ✅ Done | Tenant UUID, Microsoft/Azure URL, token, and GitHub URL sweeps found only documented placeholders, schema examples, test fixtures, and public/expected repository URLs. |
| 21 | Fixture tokens are obvious placeholders | ✅ Done | Public-artifact PAT fixture now uses `ghp_FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE`; CS14 docs/workflows use `ghp_FAKE_DO_NOT_USE`. |
| 22 | Release/package artifact inspection | ✅ Done | `npm pack --dry-run --json`: `henrik-me-agent-harness-0.1.0.tgz`, `96` files, `614136` bytes; `v0.1.0` GitHub Release is draft with no assets. |
| 23 | Extracted content ownership / license compatibility | ✅ Done | Git history for added harness files is authored by `henrik-me` / `henrikm`; source repo `henrik-me/guesswhatisnext` is public; project license remains MIT. |
| 24 | Public artifact redaction posture | ✅ Done | `scripts/check-public-artifact.mjs` remains wired in lint; pack dry-run excludes `.github/`, `tests/`, `project/`, lock/config, and logs. |
| 25 | Required status-check workflows exist and run | ✅ Done | PR #74 at head `8b9e839` is green for all 9 required contexts: `validate`, `validate-schemas`, `smoke / harness-lint`, `secret-scan`, `npm-pack-dry-run`, `commit-trailers`, `pr-body`, `check-workflow-pins`, and `check-public-artifact`. |

## Ruleset summary

`docs/ruleset/main-protection.json` was applied after the public flip as Ruleset
`main-protection` (`id=16185634`). It targets `refs/heads/main`, enforces
deletion and non-fast-forward protection, linear history, one approving PR
review, stale-review dismissal, review-thread resolution,
squash-only merge, and the required status checks listed in the CS15a plan.
CODEOWNER review is intentionally not required in the Ruleset because the
workboard GitHub App cannot satisfy a human CODEOWNER requirement.
Signed-commit enforcement is also intentionally not required because it can
block GitHub App squash auto-merge for workboard-only PRs; linear history plus
required PR review/status checks remain enforced.

## Bot dry-run

Done.

- PR: <https://github.com/henrik-me/agent-harness/pull/78>
- Branch: `workboard/cs15a-close`
- Label: `workboard-only`
- Merge commit: `e6b3502b1a533782be10ba44d2f180a34078f132`
- Result: `workboard-auto-approve` validated the label, branch, author, and
  path allowlists, minted the App token from `WORKBOARD_BOT_APP_ID` /
  `WORKBOARD_BOT_PRIVATE_KEY`, approved the PR, and merged it.
- Checks: all dry-run PR checks passed, including `validate`, `validate-schemas`,
  `smoke / harness-lint`, `secret-scan`, `npm-pack-dry-run`, `commit-trailers`,
  `pr-body`, `check-workflow-pins`, `check-public-artifact`, and
  `workboard-auto-approve / validate-and-approve`.

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
