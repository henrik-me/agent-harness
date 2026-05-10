# Private-Tier Consumption Guide

> Status: historical private-tier guidance. The harness repository is public as
> of CS15a close-out, so normal public consumption no longer requires a token.
> Keep this page for private forks or private consumer scenarios.

## Required permissions

To run `npx -y github:<owner>/<private-harness-repo>#<ref> ...` against a
private harness repository or fork, the calling environment needs **read access
to the contents of that repository**.

### Option A — fine-grained Personal Access Token (recommended)

1. Visit https://github.com/settings/personal-access-tokens/new
2. Select **Repository access → Only select repositories → your private harness repository**
3. **Repository permissions** → **Contents: Read** (no other scopes required)
4. Generate; copy the token (one-time display).

Use the token in your environment:

```bash
# Example only — replace with your real token. NEVER commit a real token.
export GH_TOKEN=ghp_FAKE_DO_NOT_USE
git config --global url."https://x-access-token:${GH_TOKEN}@github.com/".insteadOf "https://github.com/"
npx -y github:henrik-me/agent-harness#v0.2.0 --help
```

### Option B — classic PAT (not recommended)

A classic PAT with `repo` (full repo control) also works, but grants far more
than necessary. Prefer Option A.

### Option C — GitHub Actions workflow (in a private consumer repo)

If you're invoking the harness from a GitHub Actions workflow in your own
private consumer repo, configure git url-rewrite using the workflow's built-in
`GITHUB_TOKEN`. Note: `GITHUB_TOKEN` only has permissions to its own repo, so
this only works if the harness is in the same repo OR if you're using an
installation-scoped GitHub App token.

For cross-repo private consumption from an Actions workflow, store a
fine-grained PAT (Option A) as a repository secret and use that in the
url-rewrite step.

See `.github/workflows/private-smoke.yml` in this repo for a working example
of the in-same-repo pattern (uses `secrets.GITHUB_TOKEN`).

## Token rotation

Fine-grained PATs default to 90-day expiration. Rotate before expiration. The
harness does not store or cache tokens; rotation is purely on the consumer
side.

## Public consumption

CS15a flipped this harness repo to public. No token is required for public
consumption — `npx -y github:henrik-me/agent-harness#v0.2.0` works
anonymously, and an
`@henrik-me/agent-harness` npm package may be published for `npx -y
@henrik-me/agent-harness@0.2.0`.

## Security notes

- **Never commit a real token.** All examples in this doc and in workflow
  files use the obvious placeholder `ghp_FAKE_DO_NOT_USE`.
- The harness `check-public-artifact` linter (CS06) detects GitHub PAT
  patterns (`ghp_[A-Za-z0-9]{36,}`) and other secrets in any directory marked
  for public artifact (e.g. release tarballs). It fails CI if a real-looking
  token is found.
- All GitHub Actions workflows in this repo apply the LRN-075 pattern:
  externally-influenced values (workflow inputs, derived refs) are passed
  through `env:` and validated against an allowlist regex before shell
  consumption.
