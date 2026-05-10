# CS15a — GitHub App registration + install instructions (Q1)

> **Audience:** @henrik-me. Two of the 25 CS15a preconditions require GitHub UI work that the orchestrator cannot perform via API. This document covers the App half. The other half is `cs15a-repo-settings-checklist.md`.

## What this App is for

The `agent-harness-workboard-bot` GitHub App backs `.github/workflows/workboard-auto-approve.yml`. The main Ruleset now requires `≥1 approving review` on every PR by default; this bot supplies the approval **only for verified WORKBOARD-only PRs** (path-restricted, label-restricted, branch-name-restricted, actor-allowlisted). Per cs-plan §CS15a #8 + Decision #23 + bot threat model.

Why an App and not a PAT? Least-privilege scoped permissions, dedicated
identity, no PAT rotation, no human-account credential leak surface.

## Recommended helper path

From the repository root, run:

```powershell
node scripts/cs15a-workboard-app-helper.mjs --manifest
```

The helper starts a local callback server, opens a browser page with a
preconfigured GitHub App manifest, exchanges the returned one-time code with
GitHub, stores the two `WORKBOARD_BOT_*` repository secrets through `gh`, and
opens the App installation page. Install the App on **only**
`henrik-me/agent-harness`.

After installing, validate with:

```powershell
node scripts/cs15a-workboard-app-helper.mjs --validate
```

## Manual fallback — Step 1: Register the App

1. Go to <https://github.com/settings/apps/new> (your personal account; do NOT use an organization account for this).
2. Fill the registration form:
   - **GitHub App name:** `agent-harness-workboard-bot` (must be globally unique on GitHub; if taken, suffix with a personal qualifier like `agent-harness-workboard-bot-hm`).
   - **Homepage URL:** `https://github.com/henrik-me/agent-harness`
   - **Webhook:** **uncheck "Active"** (no webhook needed; the App is invoked from workflows only).
3. **Repository permissions** (least-privilege per the bot threat model):
   - **Contents:** Read & write (required for `gh pr merge --squash --auto`)
   - **Pull requests:** Read & write
   - **Metadata:** Read (auto-granted)
   - **All other permissions:** No access
4. **Organization permissions:** No access.
5. **Account permissions:** No access.
6. **Where can this GitHub App be installed?** "Only on this account."
7. Click **Create GitHub App**.

## Manual fallback — Step 2: Generate a private key

1. On the App's settings page, scroll to **Private keys**.
2. Click **Generate a private key**. A `.pem` file downloads — keep it; we need its contents in step 4.

## Manual fallback — Step 3: Install on the harness repo

1. On the App's settings page, click **Install App** in the left nav.
2. Click **Install** next to your account (`henrik-me`).
3. Choose **Only select repositories** → select `henrik-me/agent-harness`.
4. Confirm install.

## Manual fallback — Step 4: Store credentials as repo secrets

Either use the helper:

```powershell
node scripts/cs15a-workboard-app-helper.mjs `
  --set-secrets `
  --app-id <numeric-app-id> `
  --private-key C:\path\to\downloaded-key.pem
```

Or use the GitHub UI:

1. Go to <https://github.com/henrik-me/agent-harness/settings/secrets/actions>.
2. Add a **New repository secret**:
   - **Name:** `WORKBOARD_BOT_APP_ID`
   - **Value:** the App ID shown at the top of the App settings page (numeric).
3. Add a second **New repository secret**:
   - **Name:** `WORKBOARD_BOT_PRIVATE_KEY`
   - **Value:** **the entire contents** of the `.pem` file from step 2 (including the `-----BEGIN RSA PRIVATE KEY-----` and `-----END RSA PRIVATE KEY-----` lines, all newlines preserved).

## Step 5 — Confirm

After steps 1-4, ping the orchestrator (yoga-ah). The orchestrator will:

- Open a throwaway test PR matching the bot's allowlist (label `workboard-only`, paths under `WORKBOARD.md` + `project/clickstops/...` only).
- Trigger `workboard-auto-approve.yml` and verify the bot approves + auto-merges.
- Capture results in `docs/pre-flip-readiness.md` § Bot dry-run.

## Security model — what the App can and cannot do

**Can:** approve PRs, merge verified workboard-only PRs, read PR file lists.

**This workflow will not use the App token to:** modify branch protection,
modify Ruleset, rotate secrets, modify other workflows, manage repo settings,
manage Actions configuration, access organization data, or approve/merge a PR
that fails the workflow's path/label/actor/branch/head-SHA checks.

The App has Contents write only because GitHub requires it for merge/auto-merge
operations. The workflow mints the App token only after the PR passes the
workboard-only validation gate, then approves the validated commit SHA rather
than the mutable PR number alone.

The workflow enforces additional path/label/actor/branch-name/head-SHA
validation before it mints and uses the App token. This protects the
workflow-mediated bot path; it is not a substitute for revoking the App if the
private key is compromised.

## Revocation

If the App is compromised: <https://github.com/settings/apps/agent-harness-workboard-bot/advanced> → **Suspend installation** OR **Delete app**. The Ruleset's PR-required + ≥1 approving review rules still hold; the only effect is that WORKBOARD-only PRs require manual user review until the App is restored.
