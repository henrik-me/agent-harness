# CS15a — GitHub App registration + install instructions (Q1)

> **Audience:** @henrik-me. Two of the 25 CS15a preconditions require GitHub UI work that the orchestrator cannot perform via API. This document covers the App half. The other half is `cs15a-repo-settings-checklist.md`.

## What this App is for

The `agent-harness-workboard-bot` GitHub App backs `.github/workflows/workboard-auto-approve.yml`. From CS15b onward, when the global Ruleset requires `≥1 approving review` on every PR, this bot supplies the approval **only for verified WORKBOARD-only PRs** (path-restricted, label-restricted, branch-name-restricted, actor-allowlisted). Per cs-plan §CS15a #8 + Decision #23 + bot threat model.

Why an App and not a PAT? Least-privilege scoped permissions, dedicated
identity, no PAT rotation, no human-account credential leak surface.

## Step 1 — Register the App

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

## Step 2 — Generate a private key

1. On the App's settings page, scroll to **Private keys**.
2. Click **Generate a private key**. A `.pem` file downloads — keep it; we need its contents in step 4.

## Step 3 — Install on the harness repo

1. On the App's settings page, click **Install App** in the left nav.
2. Click **Install** next to your account (`henrik-me`).
3. Choose **Only select repositories** → select `henrik-me/agent-harness`.
4. Confirm install.

## Step 4 — Store credentials as repo secrets

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

**Cannot:** modify branch protection, modify Ruleset, rotate secrets, modify
other workflows, manage repo settings, manage Actions configuration, access
organization data, or bypass the workflow's path/label/actor/branch checks.

The App has Contents write only because GitHub requires it for merge/auto-merge
operations. The workflow mints the App token only after the PR passes the
workboard-only validation gate.

The workflow itself enforces additional path/label/actor/branch-name validation BEFORE invoking the App's credentials. Even if the App were compromised, it could not approve a PR that touched `lib/`, `bin/`, `template/`, `.github/workflows/`, `schemas/`, or `package.json` — those paths fail the workflow's pre-checks before the bot is even contacted.

## Revocation

If the App is compromised: <https://github.com/settings/apps/agent-harness-workboard-bot/advanced> → **Suspend installation** OR **Delete app**. The Ruleset's PR-required + ≥1 approving review rules still hold; the only effect is that WORKBOARD-only PRs require manual user review until the App is restored.
