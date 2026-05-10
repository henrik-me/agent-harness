# Contributing

Thanks for your interest in `agent-harness`. This document explains the
workflow we use, the gates every change must pass, and the conventions
contributors are expected to follow.

## TL;DR

1. Fork → branch → PR. No CLA, no DCO.
2. Every commit ends with the `Co-authored-by: Copilot` trailer
   (see [Commit conventions](#commit-conventions)).
3. Run `node bin/harness.mjs lint --quiet` and `node --test tests/*.test.mjs`
   locally before opening the PR. Both must be green.
4. PRs are squash-merged after one approving review and all required
   status checks pass. Linear history is enforced.

## Workflow

We use a **fork → PR** model:

```bash
# 1. Fork the repo on GitHub, then clone your fork.
git clone https://github.com/<you>/agent-harness.git
cd agent-harness

# 2. Add upstream and create a branch.
git remote add upstream https://github.com/henrik-me/agent-harness.git
git checkout -b <type>/<short-slug>     # see Branch naming below

# 3. Install dev deps once.
npm ci

# 4. Make changes, run gates locally.
node --test tests/*.test.mjs
node bin/harness.mjs lint --quiet
node bin/harness.mjs sync --mode=check --cwd .

# 5. Commit and push to your fork; open the PR against henrik-me/agent-harness:main.
git push -u origin HEAD
gh pr create --fill
```

## Branch naming

| Pattern | Use for |
|---|---|
| `cs<NN>/<slug>` | Clickstop content branches (orchestrators only) |
| `workboard/cs<NN>-(claim\|close\|close-out)` | WORKBOARD-only PRs (orchestrators only) |
| `fix/<slug>` | External bug fixes |
| `feat/<slug>` | External feature work |
| `docs/<slug>` | Documentation-only changes |
| `chore/<slug>` | Repo hygiene / dependency bumps |

External contributors should use `fix/`, `feat/`, `docs/`, or `chore/`.
The `cs<NN>/` and `workboard/` prefixes are reserved for the harness's
own clickstop-driven process — see
[`OPERATIONS.md`](OPERATIONS.md) for that workflow.

## Commit conventions

- Use clear, present-tense imperative subject lines:
  `Fix sync drift on Windows`, not `fixed sync drift`.
- Keep the subject ≤ 72 characters; wrap the body at 100.
- **Every commit must end with the `Co-authored-by: Copilot` trailer.**
  This is mechanically checked by `scripts/check-commit-trailers.mjs`:

  ```text
  <subject line>

  <optional body>

  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
  ```

  Configure git locally so this trailer is added automatically:

  ```bash
  git config trailer.copilot.key 'Co-authored-by'
  git config trailer.copilot.cmd 'echo "Copilot <223556219+Copilot@users.noreply.github.com>"'
  git config commit.template <(printf '\n\n')      # optional; ensures trailer slot
  ```

  Or paste the trailer manually at the bottom of each commit message.

## Pull requests

- Fill in the PR template (`.github/pull_request_template.md`) — Summary,
  Changes, Testing, Notes. The `pr-body` linter rejects PR bodies that
  still contain placeholder italics or empty sections.
- Keep PRs small and focused. One concern per PR. If you discover an
  unrelated bug, file an issue and address it in a separate PR.
- All PRs require:
  - 1 approving review. `.github/CODEOWNERS` routes review ownership, but the
    CS15b Ruleset does not require CODEOWNER review because the workboard bot
    cannot satisfy a human CODEOWNER requirement.
  - All required status checks green (see [Required gates](#required-gates)).
  - All review threads resolved.
  - A linear-history-compatible state (rebase, don't merge, if your branch
    falls behind `main`).
- We squash-merge. Your PR description becomes the squash commit message.

## Required gates

The following must pass before a PR can merge (mechanically enforced by
the post-CS15b Ruleset):

| Check | Source | What it verifies |
|---|---|---|
| `validate` | `harness-self-check.yml` | Tests + `harness lint` + `harness sync --check` |
| `validate-schemas` | `validate-schemas.yml` | All `schemas/*.schema.json` valid |
| `smoke / harness-lint` | `private-smoke.yml` | End-to-end `npx github:` install + lint |
| `secret-scan` | `secret-scan.yml` | gitleaks PR scan |
| `npm-pack-dry-run` | `npm-pack-dry-run.yml` | `npm pack --dry-run` shape matches expectation |
| `commit-trailers` | local + reusable | Every commit has the Copilot co-author trailer |
| `pr-body` | local + reusable | PR body has no placeholders, all sections filled |
| `check-workflow-pins` | `harness-self-check.yml` | Harness workflow refs are pinned to the configured version or a 40-char SHA |
| `check-public-artifact` | `harness-self-check.yml` | Packed public artifact contains no private/test files or forbidden secret patterns |

You can run all of them locally via `node bin/harness.mjs lint --quiet`
(reuses the same script implementations the workflows call).

## Code style

- **Node.js ≥ 20**, ESM only (`"type": "module"`). No CommonJS, no
  TypeScript, no transpiler.
- **Zero runtime dependencies in production code.** `lib/` and `bin/` must
  be importable without `node_modules`. Dev-only deps (Ajv, js-yaml) live
  in `devDependencies` and are only used by `scripts/` and `tests/`.
- **`node:test` only**, run with `node --test tests/*.test.mjs`. No Jest,
  Mocha, Vitest.
- **JSDoc for public APIs** in `lib/`. Internal helpers can be implicit.
- **No silent decisions in process code** — see
  [`OPERATIONS.md`](OPERATIONS.md) for the escalation-vs-learning rule.

## Reporting bugs / requesting features

Open an issue using one of the templates under
`.github/ISSUE_TEMPLATE/`:

- **Bug report** for things that don't work.
- **Feature request** for new capabilities.
- **Learning candidate** for process gotchas worth capturing in
  `LEARNINGS.md` (typically used by orchestrators, but external
  contributors are welcome to file these too).

For **security issues, do not open a public issue.** Use the GHSA flow
described in [`SECURITY.md`](SECURITY.md).

## Code of Conduct

This project adheres to the [Contributor Covenant 2.1](CODE_OF_CONDUCT.md).
By participating you agree to uphold its terms. Conduct concerns are
reported via GitHub Security Advisory (same channel as security issues —
see [`SECURITY.md`](SECURITY.md)).

## License

By contributing you agree that your contributions are licensed under the
same license as the project ([MIT](LICENSE)).
