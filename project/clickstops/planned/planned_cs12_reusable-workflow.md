# CS12 — Reusable GitHub workflow + drift-detection template

**Status:** planned
**Owner:** —
**Branch:** —
**Started:** —
**Closed:** —
**Filed by:** CS11b close-out (per `harness-cs-plan.md` § CS12, lines 227-236).
**Depends on:** CS11

## Goal

Two reusable GitHub Actions artifacts consumers can adopt with ~10 lines:

1. **Reusable workflow** (`.github/workflows/harness-checks.yml`) with `on: workflow_call` running `harness lint` + selected `check-*` scripts. Version-locked: it invokes the consumer-pinned CLI version from `harness.config.json` rather than the workflow-ref version, so local and CI run the exact same rules.

2. **Drift-detection template** (`template/managed/.github/workflows/harness-drift.yml`) — scheduled weekly job in consumers that runs `harness sync --mode=check` and opens a PR via `peter-evans/create-pull-request` if drift detected.

Per cs-plan: both workflows used by this repo's own CI; `check-workflow-pins` from CS06 verifies version coherence.

## Deliverables

- [ ] `.github/workflows/harness-checks.yml` — reusable workflow:
  - `on: workflow_call:` with optional input `cli-ref` (default: read from caller repo's `harness.config.json` `version` field via a small inline shell step). Allows callers to override with an explicit ref but defaults to "use whatever the caller pinned".
  - Steps: checkout (pinned SHA), setup-node 20 (pinned SHA), inline shell step to derive the effective ref (`cli-ref` input OR `jq -r .version harness.config.json` fallback), then invoke harness CLI via `npx -y github:henrik-me/agent-harness#<effective-ref> lint --quiet`. **Note**: `harness lint` is the umbrella command — `bin/harness.mjs cmdLint` aggregates 13 linters (per CS06/CS07/CS03c); cs-plan's "harness lint + selected check-* scripts" is satisfied because `harness lint` IS the aggregated entry point. No separate `check-*` invocations needed in the workflow.
  - Pin third-party actions to SHAs (note: `check-workflow-pins.mjs` currently only enforces internal `henrik-me/agent-harness` ref pinning per CS06 spec; third-party SHA pinning is enforced by CS12's explicit test below, not by the existing linter).

- [ ] `template/managed/.github/workflows/harness-drift.yml` — drift-detection workflow for consumers:
  - `on: schedule:` weekly (`cron: "0 6 * * 1"` Monday 06:00 UTC) + `workflow_dispatch:` for manual trigger.
  - **Top-level (or job-level) `permissions:` block** (required for `peter-evans/create-pull-request` to write a PR with the default GITHUB_TOKEN):
    ```yaml
    permissions:
      contents: write
      pull-requests: write
    ```
  - Steps: checkout (pinned SHA), setup-node 20 (pinned SHA), inline shell step derives ref from `harness.config.json` `version`, then a **bash step that runs `npx -y github:henrik-me/agent-harness#<ref> sync --mode=check --cwd .` and captures the exact exit code**. Logic:
    - exit `0` → set step output `drift_detected=false`; subsequent apply/PR steps gated on `if: drift_detected == 'true'` skip cleanly.
    - exit `1` (the documented "drift detected" code per `bin/harness.mjs sync --help`) → set `drift_detected=true`; proceed to apply + open PR.
    - any OTHER exit code → fail the workflow loudly (broken install / network / harness crash should NOT silently produce drift PRs).
  - On `drift_detected=true`: `npx -y github:henrik-me/agent-harness#<ref> sync --mode=apply --cwd .` to generate the update, then `peter-evans/create-pull-request@<pinned-40hex-SHA>`. PR body explains drift + links to harness ref + lists changed files. Skip-PR-on-no-drift via the `if:` step condition above.
  - **Critical: do NOT use bare `npx harness ...`** — the harness package is not on npm (per cs-plan Option B private install model). Use `npx -y github:henrik-me/agent-harness#<ref>` exclusively.
  - Template uses `{{repo_short}}`, `{{default_codeowner}}` placeholders for the PR reviewers/assignee. **All YAML scalar values containing `{{...}}` placeholders MUST be quoted** to ensure unrendered template still parses as valid YAML.
  - Pin `peter-evans/create-pull-request` to a 40-char SHA (looked up from upstream `peter-evans/create-pull-request` releases at author time; documented in YAML comment `# v<X> as of <date>`).

- [ ] Documentation in `template/composed/OPERATIONS.md` § Sync (and root mirror, manually re-rendered to bypass legacy-content fail-closed):
  - New sub-section `### Reusable CI workflow` describing how consumers invoke `harness-checks.yml` from their own workflow with `~10 lines`.
  - New sub-section `### Drift-detection workflow` describing the scheduled weekly drift PR pattern and the `harness-drift.yml` template.
  - Both sub-sections reference the version-locking model (cli-ref defaults to `harness.config.json.version`).

- [ ] This repo's own `.github/workflows/harness-self-check.yml` updated:
  - The existing inline lint+sync-check steps remain.
  - Add a NEW separate workflow `.github/workflows/harness-self-check-via-reusable.yml` that calls the new reusable workflow `.github/workflows/harness-checks.yml`. **For self-host: use `cli-ref: ${{ github.sha }}`** — NOT the harness.config.json version (`0.0.0-pre`) which is not a valid git ref. The PR's own commit SHA is always a valid `npx github:owner/repo#sha` install target. (Future, post-CS14: when real semver tags exist, switch to reading `harness.config.json.version`.)
  - Self-host drift workflow: copy `template/managed/.github/workflows/harness-drift.yml` (rendered with the harness's own templating values) to `.github/workflows/harness-drift.yml` at repo root via the standard `harness sync --mode=apply` flow. The drift workflow will run weekly against the harness repo itself — natural dogfood.

- [ ] Tests:
  - `tests/cs12-workflows.test.mjs`: parses both new YAML files via `js-yaml`, asserts on:
    - reusable workflow `on.workflow_call.inputs.cli-ref` exists with sane shape;
    - reusable workflow has the harness-CLI invocation pattern (`npx -y github:henrik-me/agent-harness#`);
    - **all third-party `uses:` refs in the new workflows are pinned to 40-char SHAs** (scan `actions/checkout`, `actions/setup-node`, `peter-evans/create-pull-request`, and any other non-`henrik-me/agent-harness` refs across all CS12 workflow files including the self-host integration workflow);
    - drift workflow `on.schedule[0].cron` is `0 6 * * 1`;
    - drift workflow has `permissions: { contents: write, pull-requests: write }` at top-level or job-level;
    - drift workflow uses `peter-evans/create-pull-request@<40-char-SHA>` (regex assertion);
    - drift workflow's `harness sync --mode=check` invocation uses the github: install pattern;
    - drift workflow captures exit code explicitly (look for `$?` or equivalent bash construct in the step) and gates apply/PR on `drift_detected`;
    - unrendered drift template (with `{{...}}` placeholders) parses as valid YAML (placeholders are quoted);
    - self-host integration workflow uses `cli-ref: ${{ github.sha }}` (proves it doesn't try to use the unreleased `0.0.0-pre` version as a git ref).

## Exit criteria

- Both new workflow files exist and pass `check-workflow-pins.mjs` (their internal harness refs are templated; third-party action SHA enforcement is via the new CS12 test).
- New self-host integration workflow (`harness-self-check-via-reusable.yml`) exists OR existing self-check workflow extended.
- Self-host drift workflow at `.github/workflows/harness-drift.yml` (rendered from template; not a synced root managed file but a one-time copy from the rendered template since it's an active workflow not a doc).
- `tests/cs12-workflows.test.mjs` ≥7 tests, all pass.
- `node --test tests/*.test.mjs` 463+ baseline still passes (this CS adds ≥7 new).
- `node bin/harness.mjs lint --quiet` 13/0/3 maintained.
- `node bin/harness.mjs sync --mode=check --cwd .` no drift (uses `--resolved-sha` from CS11b for the post-commit lock-fixup if templates are touched).
- No `TODO(CS12)` markers remain.

## Sub-agent fan-out

3 disjoint sub-tasks:
1. cs12-reusable: `.github/workflows/harness-checks.yml` + `harness-self-check-via-reusable.yml`
2. cs12-drift: `template/managed/.github/workflows/harness-drift.yml`
3. cs12-docs: OPERATIONS.md doc paragraphs (template + root mirror)

Plus orchestrator-owned: `tests/cs12-workflows.test.mjs`, sync apply for the rendered drift workflow at root, lock-fixup with `--resolved-sha`.

## Tasks

| Task | State | Owner | Notes |
|---|---|---|---|
| (populated at claim time per OPERATIONS.md § Claim) | planned | — | — |

## Plan-vs-implementation review

> _(filled at close-out per the gate)_
