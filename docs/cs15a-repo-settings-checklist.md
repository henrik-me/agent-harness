# CS15a — Repository settings checklist

> Audience: @henrik-me. Apply these settings in the GitHub UI before CS15b
> flips the repository public and applies `docs/ruleset/main-protection.json`.

## General repository settings

Go to <https://github.com/henrik-me/agent-harness/settings>.

- [x] **Features:** disable Wikis.
- [x] **Features:** leave Discussions disabled.
- [x] **Pull Requests:** allow squash merging.
- [x] **Pull Requests:** disable merge commits.
- [x] **Pull Requests:** disable rebase merging.
- [x] **Pull Requests:** enable "Always suggest updating pull request
  branches".
- [ ] **Pull Requests:** enable auto-merge. The API update succeeds but the
  repository still reports this as disabled; enable in the UI if available or
  re-check after CS15b Ruleset setup.
- [x] **Pull Requests:** enable "Automatically delete head branches".

## Security settings

Go to <https://github.com/henrik-me/agent-harness/settings/security_analysis>.

- [x] Enable Dependency graph.
- [x] Enable Dependabot alerts.
- [x] Enable Dependabot security updates.
- [ ] Enable Secret scanning if the control is available after the public flip.
- [ ] Enable Private vulnerability reporting. The API endpoint currently returns
  `404`; enable in the UI if available or re-check after the public flip.

## Actions settings

Go to <https://github.com/henrik-me/agent-harness/settings/actions>.

- [ ] Confirm Actions are allowed for this repository.
- [ ] Confirm workflow permissions are read-only by default.
- [ ] Confirm "Allow GitHub Actions to create and approve pull requests" is
  enabled only if required for the workboard bot dry-run.

## Confirmation

After completing the checklist, ping the orchestrator. The orchestrator will:

1. Verify repository settings that are exposed via `gh api`.
2. Run the workboard bot dry-run after the GitHub App from
   `docs/cs15a-app-install.md` is installed.
3. Record the evidence in `docs/pre-flip-readiness.md`.
