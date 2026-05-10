# CS15a — Repository settings checklist

> Audience: @henrik-me. These settings are now applied and verified after the
> CS15a public visibility flip.

## General repository settings

Go to <https://github.com/henrik-me/agent-harness/settings>.

- [x] **Features:** disable Wikis.
- [x] **Features:** leave Discussions disabled.
- [x] **Pull Requests:** allow squash merging.
- [x] **Pull Requests:** disable merge commits.
- [x] **Pull Requests:** disable rebase merging.
- [x] **Pull Requests:** enable "Always suggest updating pull request
  branches".
- [x] **Pull Requests:** enable auto-merge.
- [x] **Pull Requests:** enable "Automatically delete head branches".

## Security settings

Go to <https://github.com/henrik-me/agent-harness/settings/security_analysis>.

- [x] Enable Dependency graph.
- [x] Enable Dependabot alerts.
- [x] Enable Dependabot security updates.
- [x] Enable Secret scanning.
- [x] Enable Private vulnerability reporting.

## Actions settings

Go to <https://github.com/henrik-me/agent-harness/settings/actions>.

- [x] Confirm Actions are allowed for this repository.
- [x] Confirm workflow permissions are read-only by default.
- [x] Confirm "Allow GitHub Actions to create and approve pull requests" is
  enabled only if required for the workboard bot dry-run. This remains disabled;
  the dry-run used a GitHub App token, so the setting is not required.

## Confirmation

The orchestrator verified the exposed settings via `gh api`:

1. Repository settings, merge posture, security settings, and Actions settings.
2. Workboard bot dry-run after the GitHub App from
   `docs/cs15a-app-install.md` was installed.
3. Evidence recorded in `docs/pre-flip-readiness.md`.
