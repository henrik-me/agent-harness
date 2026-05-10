# CS15a — Repository settings checklist

> Audience: @henrik-me. Apply these settings in the GitHub UI before CS15b
> flips the repository public and applies `docs/ruleset/main-protection.json`.

## General repository settings

Go to <https://github.com/henrik-me/agent-harness/settings>.

- [ ] **Features:** disable Wikis.
- [ ] **Features:** leave Discussions disabled.
- [ ] **Pull Requests:** allow squash merging.
- [ ] **Pull Requests:** disable merge commits.
- [ ] **Pull Requests:** disable rebase merging.
- [ ] **Pull Requests:** enable "Always suggest updating pull request
  branches".
- [ ] **Pull Requests:** enable auto-merge.
- [ ] **Pull Requests:** enable "Automatically delete head branches".

## Security settings

Go to <https://github.com/henrik-me/agent-harness/settings/security_analysis>.

- [ ] Enable Dependency graph.
- [ ] Enable Dependabot alerts.
- [ ] Enable Dependabot security updates.
- [ ] Enable Secret scanning if the control is available after the public flip.
- [ ] Enable Private vulnerability reporting.

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
