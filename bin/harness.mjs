#!/usr/bin/env node
/**
 * bin/harness.mjs — CLI dispatcher for the agent-harness tool.
 *
 * Source: project/clickstops/active/active_cs04_cli-dispatcher.md
 * Plan:   project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md § CS04
 *
 * Subcommands: init | sync | check | lint | harvest | check-migration |
 *              composed-audit | pack | plan-review-hash | version | whoami
 *
 * Exit codes:
 *   0 — success (or no drift in check/dry-run mode)
 *   1 — operation failure (sync error, validation failure, etc.)
 *   2 — usage error (bad arguments, unknown subcommand)
 *
 * Global flags: --cwd <path>, --config <path>, --ref <ref>, --help, --debug
 *
 * @module bin/harness.mjs
 */

import { parseArgs } from 'node:util';
import { readFileSync, existsSync, readdirSync, mkdirSync, copyFileSync, writeFileSync, statSync, realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

import { engageCopilot, EngageError } from '../lib/copilot-engage.mjs';
import { runReview, ReviewError } from '../lib/review.mjs';
import { migrateFileClass } from '../lib/file-class-migration.mjs';
import { openIssue as crossRepoOpenIssue, CrossRepoError } from '../lib/cross-repo.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const PR_TEMPLATE_TARGET = '.github/pull_request_template.md';
const PR_EVIDENCE_WORKFLOW_TARGET = '.github/workflows/pr-evidence-lint.yml';
const REVIEW_GATES_WORKFLOW_TARGET = '.github/workflows/review-gates.yml';
const REVIEW_EVIDENCE_BLOCK_ID = 'pull-request.review-evidence';
const REVIEW_GATE_REQUIRED_CHECKS = [
  'review-log-evidence',
  'copilot-review-attached',
  'independence-invariant',
  'review-threads-resolved',
];
const DEFAULT_HIGH_RISK_CLICKSTOPS = ['CS03', 'CS11', 'CS15a', 'CS18b', 'CS19'];
// Per C38a-6 + C37-1b PASS branch: gate_set when CS37 spike PASSED.
// CS37 closed PASS (see docs/adr/0004-copilot-graphql-spike.md). The
// `--graphql-spike-outcome` override flag specified in C38a-6 is deferred
// to a follow-up CS — for v0.4.0 this constant encodes the PASS set
// directly. A6 (plan-review attestation) is omitted from the declared
// gate_set per the plan; the `harness pr-evidence` aggregator dispatches
// A6 independently when planned/active CS files appear in the PR diff.
const DEFAULT_REVIEW_GATE_SET = ['B1', 'A3', 'A4', 'A5', 'A16'];
const REVIEW_GATES_INSTRUCTION_BLOCK = `
══════════════════════════════════════════════════════════════════════
  Review gates enabled. Branch-ruleset contexts required:

    pr-evidence-lint / read-only-gates
    review-log-evidence
    copilot-review-attached
    independence-invariant
    review-threads-resolved

  harness init/sync writes these contexts to infra/main-protection-ruleset.json
  when reviews.enforce_gates=true. Apply that ruleset to main with maintainer
  authority if your repository does not already automate ruleset updates.

  See: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/managing-rulesets-for-a-repository
══════════════════════════════════════════════════════════════════════
`.trimStart();

const WORKBOARD_PAT_INSTRUCTION_BLOCK = `
══════════════════════════════════════════════════════════════════════
  Optional workboard-only admin-merge fallback (CS50 / issue #138):

  Create a fine-grained PAT with these scopes: Contents: Read and write;
  Pull requests: Read and write. The token owner must also be allowed to
  bypass the main-protection ruleset as a repository admin / bypass actor.
  Then add as repo secret named \`WORKBOARD_MERGE_TOKEN\`.

  If you manage ruleset bypass actors via gh/api, first run:

    gh auth refresh -s admin:org

  Skipping this setup is OK: workboard-auto-approve.yml degrades gracefully
  to the GitHub App path when configured, or validation-only/manual merge
  when neither credential set is present.
══════════════════════════════════════════════════════════════════════
`.trimStart();

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

const TOP_HELP = `
Usage: harness <subcommand> [options]

Subcommands:
  init              Scaffold harness.config.json + seeded files into a target dir
  sync              Sync managed/composed/seeded files from the harness template
  check             Alias for sync --mode=check
  lint              Run all harness structural + policy linters (14 linters)
  harvest           Run harvest procedure (STUB — full impl in later CS)
  check-migration   Detect migration issues from an existing harness (STUB)
  composed-audit    Audit composed blocks from an existing harness (STUB)
  copilot-engage    Request Copilot review on a PR + poll for completion
                    (CS41 — pairs with A16)
  review           Orchestrate rubber-duck + Copilot review and update PR body
                    (CS52 — canonical content-PR review command)
  pack              Run npm pack --dry-run and verify file whitelist
  pr-evidence       Run PR-state evidence gates (B1, A3, A4, A5+A16, A6) against
                    a PR's commit graph + body markdown (CS36 + CS37)
  review-output     Validate reviewer-output markdown shape (CS40): Analyzed-HEAD,
                    R1/Rn enumeration vs git diff, finding-row schema, verdict
  plan-review-hash  Print the 12-char SHA-256 prefix of a clickstop plan's
                    Decisions+Deliverables (used to fill plan review rows)
  cross-repo        Issue-only handoff helpers for non-harness repos
                    (CS56 — supports only 'open-issue'; no 'open-pr' action)
  version           Print package version
  whoami            Derive and print the agent ID

Global flags:
  --cwd <path>      Working directory (default: process.cwd())
  --config <path>   Path to harness.config.json (default: <cwd>/harness.config.json)
  --ref <ref>       Override harness ref for sync
  --debug           Print stack traces on error
  --help            Print this help text

Exit codes:
  0  success
  1  operation failure
  2  usage error (bad arguments, unknown subcommand)
`.trimStart();

const SUBCOMMAND_HELP = {
  init: `
Usage: harness init [target_dir] [options]

Scaffold harness.config.json + seeded files into target_dir (default: cwd).
Reads template/seeded/ from the harness repo and copies any missing files.
If harness.config.json already exists, prints a warning and skips (no overwrite).

Optionally drops one or more named scaffolds from scaffolds/<name>/files/
(create-if-missing). Drops do not overwrite existing files. After successful
drop, the scaffold name is appended to harness.config.json scaffolds[].

Detects the GitHub repository tier (CS15e: visibility + plan from
api.github.com) and records the result in a new \`constraints\` block on
harness.config.json plus a seeded \`.harness-known-constraints.md\` file.
For private-free repos, the disposition (default: discipline-only) is
also recorded. See docs/adr/0003-constraints-field.md for details.

Options:
  --from-example=<gwn|si|self>          Use a bundled example config as the initial config
  --with-scaffold <name>                Drop the named scaffold (repeatable; also accepts --with-scaffold=<name>)
  --constraint-disposition <name>       Force the disposition for private-free repos:
                                          discipline-only | upgrade-pro | flip-public-when-ready
                                          (default: discipline-only)
  --skip-constraint-detection           Skip the GitHub-tier detection step entirely
                                          (no constraints block written; useful in CI without network)
  --skip-workboard-pat-prompt           Suppress the optional WORKBOARD_MERGE_TOKEN PAT setup guidance
                                          (useful in CI / non-interactive init runs)
  --enable-review-gates                 Opt the project into the PR-evidence + REVIEWS.md gate set; writes \`review_gates\` and \`reviews\` config blocks, migrates \`.github/pull_request_template.md\` to composed, installs review workflows, and injects required status-check contexts into \`infra/main-protection-ruleset.json\`. Idempotent. Per CS41 C41-7, \`enabled: true\` is now the FRESH-init default; this flag is required only when migrating an existing config that lacks the \`review_gates\` block.
  --disable-review-gates <reason>       Explicit opt-out from the PR-evidence gate set (CS41 C41-7/C41-8). Writes \`review_gates: { enabled: false, _opt_out_reason: "<reason>" }\` to harness.config.json, satisfying the \`harness sync --mode=check\` migration gate. Reason must be a non-empty string.
  --help                                Print this help
`.trimStart(),

  sync: `
Usage: harness sync [options]

Sync managed/composed/seeded files from the harness template into the consumer repo.
Wraps lib/sync.mjs sync(). Default mode is check.

Options:
  --mode=<apply|check|dry-run>  Sync mode (default: check)
  --dry-run                     Alias for --mode=dry-run
  --accept-major                Allow major version bumps
  --report                      Print planned changes per file
  --resolved-sha <40hex>        Pin the recorded lock resolved_sha to <40hex>
                                 (apply-mode only; see CS11b/LRN-070 for the
                                 post-commit-regenerate ordering trap this fixes).
  --cwd <path>                  Consumer repo path (default: cwd)
  --config <path>               Path to harness.config.json (CS15c/CS04b: now
                                wired through to the sync engine; replaces the
                                default <cwd>/harness.config.json entirely).
  --ref <ref>                   PLANNED — not yet implemented; set 'version' in
                                harness.config.json to pin a harness version.
  --help                        Print this help

Exit codes:
  0  success / no drift
  1  drift detected (check mode) or error
`.trimStart(),

  check: `
Usage: harness check [options]

Alias for: harness sync --mode=check

Options:
  --cwd <path>    Consumer repo path (default: cwd)
  --config <path> Path to harness.config.json (CS15c/CS04b: wired through).
  --ref <ref>     PLANNED — not yet implemented (set 'version' in
                  harness.config.json to pin).
  --help          Print this help
`.trimStart(),

  lint: `
Usage: harness lint [options]

Run all harness linters against the repo. Aggregates results from:
  - check-learnings.mjs   (LEARNINGS.md)
  - check-context.mjs     (CONTEXT.md)
  - check-workboard.mjs   (WORKBOARD.md)
  - check-architecture.mjs (ARCHITECTURE.md)
  - check-clickstop.mjs   (project/clickstops/)
  - check-clickstop-plan-review.mjs (planned/active CS files; CS35b)
  - check-instructions.mjs (INSTRUCTIONS.md)
  - check-readme.mjs      (README.md)
  - check-composed-blocks.mjs (each composed_files[].path from config; skipped if none)
  - check-workflow-pins.mjs (.github/workflows/)
  - check-text-encoding.mjs (BOM + line endings; walks --cwd recursively)
  - check-fixtures.mjs    (tests/fixtures/ — gitignored fixture paths; LRN-076)
  - check-templates.mjs   (template/ subtree — LRN-049/050/051 template-authoring rules)
  - check-public-artifact.mjs (skipped unless --public-artifact-dir or config provides one)
  - check-pr-body.mjs     (.github/PR_BODY.md if present)
  - check-commit-trailers.mjs (.git/COMMIT_EDITMSG if present)
  - check-compose-v2.mjs  (compose.yaml or docker-compose.yml if present)

Self-host-only (when package.json.name === '@henrik-me/agent-harness'):
  - check-pack.mjs        (package whitelist)
  - check-scaffold-readme.mjs (one invocation per scaffolds/<name>/README.md; LRN-077)

Auto-dispatched scaffold policy linters (when harness.config.json declares
the scaffold AND the consumer ships the corresponding script in scripts/):
  - scaffolds: ["migrations"]    → migration-policy    (scripts/check-migration-policy.mjs)
  - scaffolds: ["feature-flags"] → feature-flag-policy (scripts/check-feature-flag-policy.mjs)
  Missing scripts are graceful-skipped (matches pr-body/compose-v2 pattern).

Linters whose target does not exist are skipped (and noted in the summary).

Options:
  --quiet                   Suppress per-linter detail; print only the final aggregate summary
  --cwd <path>              Repo path (default: cwd)
  --only <name1,name2>      Run only named linters (e.g. --only learnings,context)
  --skip <name1,name2>      Skip named linters
  --public-artifact-dir <p> Override target dir for check-public-artifact
  --explain <linter-name>   Print rules + canonical seed path for a supported linter and exit 0
                            (currently: architecture, text-encoding, workboard)
  --help                    Print this help

Aliases:
  harness lint:NAME         Equivalent to: harness lint --only NAME
                            (e.g. harness lint:text-encoding)

Exit codes:
  0  all linters passed (warnings do not affect exit code)
  1  at least one linter reported errors
  2  bad invocation
`.trimStart(),

  harvest: `
Usage: harness harvest [options]

Run the full harvest procedure (collects learnings, updates WORKBOARD, etc.).
STUB in CS04 — full implementation in a later CS.

Options:
  --snooze=<reason>:<deferred_until>  Defer harvest with a reason and date
  --help                              Print this help
`.trimStart(),

  'check-migration': `
Usage: harness check-migration [options]

Detect migration issues from an existing harness installation.
STUB in CS04 — full implementation planned for CS19.

Options:
  --from-existing-harness  Required flag; indicates migration-check context
  --help                   Print this help
`.trimStart(),

  'composed-audit': `
Usage: harness composed-audit [options]

Audit composed blocks from an existing harness installation.
STUB in CS04 — full implementation planned for CS06/CS19.

Options:
  --from-existing-harness  Required flag; indicates audit context
  --help                   Print this help
`.trimStart(),

  pack: `
Usage: harness pack [options]

Runs npm pack --dry-run and prints the output.
Verifies the file whitelist matches what package.json declares.

Options:
  --help  Print this help
`.trimStart(),

  'plan-review-hash': `
Usage: harness plan-review-hash <file>

Print the 12-character SHA-256 prefix computed over the trimmed bodies of
the file's "## Decisions" and "## Deliverables" H2 sections. Used when
filling the "Reviewed sections hash" cell of a "## Plan review" attestation
row in a clickstop plan file (per CS35b decisions C35b-2 / C35b-3).

The output is the same value the check-clickstop-plan-review linter compares
against to detect stale attestations after plan amendments.

Options:
  --help  Print this help
`.trimStart(),

  'pr-evidence': `
Usage: harness pr-evidence --base <sha> --head <sha> --pr-body <file> [options]

Run mechanical PR-state evidence gates against the given PR's commit graph +
PR body markdown (CS36). Aggregates the following gates and exits non-zero
on any failure:

  B1 (commit-trailers)          — every commit in <base>..<head> carries the
                                 Co-authored-by: Copilot trailer.
  A3 (model-audit-independence) — PR body's "## Model audit" rows have no
                                 implementer-vs-reviewer model overlap.
  A4 (review-log-currency)      — PR body's "## Review log" latest Go row's
                                 analyzed_head equals --head (full SHA).
  A6 (plan-review-attestation)  — diff-scoped: any planned/active CS file in
                                 the PR diff carries a fresh "## Plan review"
                                 row with verdict in {Go, Go-with-amendments}
                                 (predicate from CS35b, --files diff-scoped
                                 invocation from CS36 aggregator).
  A5+A16 (copilot-review)       — CS37: Copilot review present at --head with
                                 acceptable state, AND submitted after the
                                 latest local Go in the PR body. Requires
                                 --repo + --pr; skipped with notice otherwise.

Required flags:
  --base <sha>           Merge-base SHA (full or short)
  --head <sha>           Current PR head SHA (full 40-char preferred for A4)
  --pr-body <file>       Path to a markdown file containing the PR body

Optional flags:
  --repo <slug>          Repository slug (owner/repo) — required for A5+A16
  --pr <num>             PR number — required for A5+A16
  --skip-reasons <csv>   workboard-only | bot-author | fork-source (per C35-19/C36-5).
                         "workboard-only" short-circuits ALL gates to a pass.
                         "bot-author" skips B1/A3/A4/A5+A16 (gates that fail naturally
                         on bot commits/reviews); A6 still runs.
                         "fork-source" runs all read-only gates; A5+A16 exits 2 with
                         maintainer-rerun hint.
  --json                 Emit structured JSON {gates: [{name, status, exitCode}]}
  --quiet                Suppress per-gate output; print only the summary line
  --help                 Print this help

Exit codes:
  0  all gates passed (or skipped via --skip-reasons workboard-only)
  1  at least one gate failed
  2  bad usage (missing required flag, unknown flag)
`.trimStart(),

  'review-output': `
Usage: harness review-output --review-output <file> --round R1|Rn --base <sha> --head <sha> [options]

Validate a reviewer's output markdown (CS40 — closes #145 gap #3). Parses the
reviewer's markdown content and validates it against three predicates:

  (a) Analyzed HEAD: <40-char-sha> line is present near top.
  (b) For --round R1, the per-file enumeration exactly equals the file set
      of \`git diff --name-only <base>..<head>\` (missing files = error;
      extra files = warning). For --round Rn, the enumeration is checked
      against \`git diff --name-only <prev-head>..<head>\` if --prev-head
      is provided; otherwise warn-skipped.
  (c) Each finding row matches '- [Blocking|Non-blocking|Suggestion] <file>:<line>: <desc>'.
      Verdict line 'Verdict: {Go|Needs-Fix|Block}' is present near the end.
      Verdict ≠ Go requires at least one finding row.

Optional independence-invariant guard: if --repo + --pr + --reviewer-model
are all provided, fetches the PR body via gh and asserts the reviewer model
is NOT in the implementer model set per the PR's ## Model audit table.

Optional --update-pr posts the parsed structured output as a new row in the
PR body's ## Review log section via 'gh pr edit --body-file'. The row matches
the canonical 6-column schema per REVIEWS.md §2.7
(timestamp | analyzed_head | actor | model | verdict | evidence_link), parsed
by column header so a future column reorder won't silently break it. Idempotent:
re-running with the same --review-output produces the same single row
(deduplicated by analyzed_head + actor + model + verdict).

Per CS40 C40-8, this subcommand is NOT registered with 'harness pr-evidence' —
it requires the reviewer output file which is not available in CI. It is a
standalone linter invoked by the orchestrator after capturing reviewer output.

Required flags:
  --review-output <file>       Path to markdown file with reviewer output
  --round R1|Rn                Review round
  --base <sha>                 Base SHA for diff computation
  --head <sha>                 Head SHA for diff computation

Optional flags:
  --prev-head <sha>            Required for Rn enumeration check (warn-skip if absent)
  --repo <owner/repo>          For PR-body fetch (independence guard + --update-pr)
  --pr <number>                For PR-body fetch (independence guard + --update-pr)
  --reviewer-model <model-id>  Reviewer model (required when independence guard runs or --update-pr)
  --actor <agent-id>           Actor agent ID (required with --update-pr; canonical 'actor' column per REVIEWS.md §2.7)
  --evidence-link <url>        evidence_link cell value for ## Review log row (defaults to file basename)
  --update-pr                  Post parsed output as new ## Review log row (idempotent)
  --json                       Emit machine-readable JSON instead of text
  --quiet                      Suppress per-finding output; print summary only
  --help                       Print this help

Exit codes:
  0  pass (warnings allowed)
  1  at least one error (missing/malformed shape, R1 missing files, etc.)
  2  bad usage
`.trimStart(),

  review: `
Usage: harness review <pr> [options]

Orchestrate a content-PR review round: sanity-check the PR, compose the
manual MVP rubber-duck prompt (GPT-5.5 by default, Sonnet 4.6 fallback only
when permitted), trigger Copilot, wait for completed review evidence, update
## Review log + ## Model audit in the PR body, and print a verdict.

Positional:
  <pr>  PR number (required, positive integer)

Options:
  --repo <owner/repo>      GitHub repo (default: auto-detect from git remote)
  --rubber-duck-only      Skip Copilot trigger/poll; only run the rubber-duck leg
  --copilot-only          Skip rubber-duck prompt/output; only trigger/poll Copilot
  --model <id>            Reviewer model override: gpt-5.5 | sonnet-4.6
  --round R<n>            Explicit review round (default: next available)
  --dry-run               Print planned actions without dispatching/commenting
  --no-poll               Dispatch only (print prompt / trigger Copilot), then exit
  --timeout-minutes <n>   Max wait for review evidence (default: reviews.review_timeout_minutes or 30)
  --help                  Print this help text

Manual rubber-duck MVP:
  Unless --copilot-only, --dry-run, or --no-poll is set, the CLI prints a
  reviewer prompt. Dispatch that prompt to the approved reviewer model, then
  paste the structured reviewer output to stdin and send EOF. No model API is
  called by the harness CLI in v1.

Exit codes:
  0  Go verdict, dry-run complete, or --no-poll dispatch accepted
  1  No-Go / unresolved Blocking finding / Copilot changes requested
  2  bad usage, independence-policy refusal, or tooling/transport error
`.trimStart(),

  'copilot-engage': `
Usage: harness copilot-engage <pr> [options]

Request Copilot review on a PR via 'gh pr edit --add-reviewer' and poll the
GitHub GraphQL API until a review at the current HEAD lands (or timeout).

Positional:
  <pr>  PR number (required, positive integer)

Options:
  --repo <owner/repo>    GitHub repo (default: auto-detect from current dir's git remote)
  --poll-timeout <s>     Max seconds to poll (default: 300 = 5 minutes)
  --poll-interval <s>    Polling interval in seconds (default: 30)
  --no-poll              Return immediately after the requestReviews mutation
  --submitted-after <ts> ISO-8601 floor for the review's submittedAt (default:
                         the timestamp captured immediately before the engage
                         request — guarantees a NEW review, matching the A5+A16
                         ordering doctrine in scripts/check-copilot-review.mjs)
  --cache-dir <path>     Identity-cache dir (default: ~/.cache/harness)
  --cache-ttl <days>     Identity-cache TTL in days (default: 7)
  --quiet                Suppress per-poll log lines; print only final result
  --json                 Print machine-readable JSON result
  --help                 Print this help text

Exit codes:
  0  Copilot review found at current HEAD (or --no-poll: mutation accepted)
  2  bad usage (bad arguments, fork-source PR)
  3  poll timeout (mutation accepted but no review within --poll-timeout)
  4  auth or GraphQL error
  5  identity cache write failed (use --cache-dir to override; CS45)
`.trimStart(),

  version: `
Usage: harness version [options]

Print the harness package version.
Also prints the linked harness ref if package.json has a harness.linkedRef field.

Options:
  --help  Print this help
`.trimStart(),

  whoami: `
Usage: harness whoami [options]

Derive and print the agent ID for this machine + repo combination.

Agent ID format: <machine-short>-<agent_suffix>[-c<N>]
  machine-short  = env var override, or hostname last segment (lowercase)
  agent_suffix   = project.agent_suffix from harness.config.json
  -c<N>          = clone-folder index if present in repo directory name

Options:
  --explain       Print full derivation chain
  --cwd <path>    Consumer repo path (default: cwd)
  --config <path> Path to harness.config.json
  --help          Print this help
`.trimStart(),

  'cross-repo': `
Usage: harness cross-repo <action> [options]

Issue-only handoff helpers for non-harness repositories (CS56).

The harness orchestrator never opens PRs in repos other than
henrik-me/agent-harness (Hard Rule § 6); cross-repo work routes through
GitHub issues. This subcommand is the supported CLI for that handoff.

Actions:
  open-issue    File a tracking issue in a non-harness repo (idempotent)

No 'open-pr' (or other non-issue write) action exists by design.

Usage (open-issue):
  harness cross-repo open-issue --repo OWNER/NAME --title STRING \\
      --body-file PATH [--label LABEL ...]

Behavior:
  - Refuses --repo henrik-me/agent-harness (case-insensitive). Use plain
    'gh issue create' for harness-internal issues.
  - Always applies the 'harness-orchestrator' label as the routing default;
    additional --label flags append (cannot remove the default).
  - Before 'gh issue create', preflights each label via 'gh label create'
    WITHOUT --force; "already exists" is treated as success so the consumer's
    label color/description is preserved (non-mutating per D56-3 R9).
  - Idempotent: 'gh issue list' for an exact-title open issue first. If found,
    prints the existing URL to stdout and 'existing open issue matched;
    no new issue created' to stderr; does not create a new issue. Closed
    issues never short-circuit (always creates new).
  - Recommended title prefix: '[harness:cs<NN>] <subject>' so two different
    CSes cannot collide on the same handoff issue (doctrine; not enforced
    by this CLI). See OPERATIONS.md § Cross-repo procedures.

Options:
  --repo OWNER/NAME     Target repo (required; must NOT be the harness repo)
  --title STRING        Issue title (required; non-empty after trim)
  --body-file PATH      Path to a regular file containing the issue body (required)
  --label LABEL         Extra label; repeatable. (Default 'harness-orchestrator'
                        is always applied first; --label appends.)
  --help                Print this help

Exit codes:
  0  success (new issue created OR existing-match short-circuit)
  1  operation failure (gh missing, gh failed, parse failure, body-file missing,
     label preflight could not provision a label)
  2  usage error (bad/missing flags, unknown action, self-loop repo)
`.trimStart(),
};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Strip UTF-8 BOM from a string (per LRN-018). */
function stripBOM(str) {
  return str.charCodeAt(0) === 0xFEFF ? str.slice(1) : str;
}

/** Read a JSON file, stripping BOM, returning null if missing. */
function readJSONOrNull(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(stripBOM(readFileSync(filePath, 'utf8')));
  } catch {
    return null;
  }
}

/** Read and parse package.json. */
function readPackageJSON() {
  return JSON.parse(stripBOM(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')));
}

/**
 * Derive machine-short from hostname.
 * Splits on `-` or `_`, returns the last segment lowercased.
 * Per Decision #20: "first segment after splitting, skipping user/owner prefix segments".
 */
function machineShortFromHostname(hostname) {
  const lower = hostname.toLowerCase();
  const parts = lower.split(/[-_]+/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? lower;
}

/**
 * Derive the -c<N> clone index from the consumer repo directory name, per Decision #20.
 * Patterns (checked in order):
 *   `<repo>_copilot<N>`  → `c<N>`  (e.g. `agent-harness_copilot2` → `c2`)
 *   `<repo><N>`          → `c<N>`  (trailing digits, e.g. `agent-harness3` → `c3`)
 *   otherwise            → null
 */
function cloneSuffixFromDir(dirPath) {
  const base = path.basename(dirPath);
  let m = base.match(/_copilot(\d+)$/i);
  if (m) return `c${m[1]}`;
  m = base.match(/(\d+)$/);
  if (m) return `c${m[1]}`;
  return null;
}

/**
 * Load harness.config.json from a consumer repo path.
 * Returns null if not found.
 */
function loadConfig(consumerRepoPath, configOverride) {
  const configPath = configOverride ?? path.join(consumerRepoPath, 'harness.config.json');
  return readJSONOrNull(configPath);
}

/** Print to stderr and exit with code. */
function die(msg, code = 1) {
  process.stderr.write(msg + '\n');
  process.exit(code);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readConfigForReviewGates(configDest) {
  try {
    return JSON.parse(stripBOM(readFileSync(configDest, 'utf8')));
  } catch (err) {
    die(
      `harness init --enable-review-gates: harness.config.json is not valid JSON.\n` +
        `Path: ${configDest}\nError: ${err.message}`,
      1
    );
  }
}

function ensureFileClassBlock(config, className) {
  if (config[className] === undefined) {
    config[className] = { files: [] };
  }
  if (!isPlainObject(config[className])) {
    die(`harness init --enable-review-gates: "${className}" must be an object in harness.config.json.`, 1);
  }
  if (config[className].files === undefined) {
    config[className].files = [];
  }
  if (!Array.isArray(config[className].files)) {
    die(`harness init --enable-review-gates: "${className}.files" must be an array in harness.config.json.`, 1);
  }
  return config[className];
}

function addUnique(values, value) {
  if (!values.includes(value)) {
    values.push(value);
    return true;
  }
  return false;
}

function ensureComposedOverride(config) {
  const composed = ensureFileClassBlock(config, 'composed');
  if (composed.overrides === undefined) {
    composed.overrides = {};
  }
  if (!isPlainObject(composed.overrides)) {
    die('harness init --enable-review-gates: "composed.overrides" must be an object in harness.config.json.', 1);
  }

  const existing = composed.overrides[PR_TEMPLATE_TARGET];
  if (existing === undefined) {
    composed.overrides[PR_TEMPLATE_TARGET] = { local_blocks: [REVIEW_EVIDENCE_BLOCK_ID] };
    return;
  }
  if (!isPlainObject(existing)) {
    die(`harness init --enable-review-gates: composed.overrides["${PR_TEMPLATE_TARGET}"] must be an object.`, 1);
  }

  const blocks = Array.isArray(existing.local_blocks) ? existing.local_blocks : [];
  composed.overrides[PR_TEMPLATE_TARGET] = {
    ...existing,
    local_blocks: blocks.includes(REVIEW_EVIDENCE_BLOCK_ID)
      ? blocks
      : [...blocks, REVIEW_EVIDENCE_BLOCK_ID],
  };
}

function patchReviewGatesConfig(config) {
  if (config.review_gates !== undefined && !isPlainObject(config.review_gates)) {
    die('harness init --enable-review-gates: "review_gates" must be an object when present.', 1);
  }
  if (config.reviews !== undefined && !isPlainObject(config.reviews)) {
    die('harness init --enable-review-gates: "reviews" must be an object when present.', 1);
  }

  config.review_gates = {
    ...(config.review_gates ?? {}),
    enabled: true,
    copilot_required: true,
    gate_set: [...DEFAULT_REVIEW_GATE_SET],
  };
  config.reviews = {
    ...(config.reviews ?? {}),
    enforce_gates: true,
    require_copilot_review: true,
    copilot_reviewer_slug: config.reviews?.copilot_reviewer_slug ?? 'copilot-pull-request-reviewer[bot]',
    high_risk_clickstops: Array.isArray(config.reviews?.high_risk_clickstops)
      ? config.reviews.high_risk_clickstops
      : [...DEFAULT_HIGH_RISK_CLICKSTOPS],
  };
}

function copyManagedWorkflow(targetDir, workflowTarget) {
  const src = path.join(REPO_ROOT, 'template', 'managed', ...workflowTarget.split('/'));
  const dest = path.join(targetDir, ...workflowTarget.split('/'));
  if (!existsSync(src)) {
    process.stderr.write(
      `Warning: workflow template not found at ${src}; skipping workflow copy.\n`
    );
    return;
  }

  mkdirSync(path.dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  process.stdout.write(`Created ${workflowTarget}\n`);
}

function getReviewRulesetPath(cwd) {
  return path.join(cwd, 'infra', 'main-protection-ruleset.json');
}

function checkEntryContext(entry) {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object') return entry.context ?? entry.name ?? null;
  return null;
}

function makeRequiredCheckEntry(existingArray, context) {
  const objectMode = existingArray.some((entry) => entry && typeof entry === 'object' && !Array.isArray(entry));
  return objectMode ? { context } : context;
}

function requiredChecksArrays(root) {
  const arrays = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'required_checks' && Array.isArray(value)) arrays.push(value);
      else visit(value);
    }
  };
  visit(root);
  return arrays;
}

function ensureRulesetRequiredChecksObject(ruleset) {
  let arrays = requiredChecksArrays(ruleset);
  if (arrays.length > 0) return arrays;

  if (!Array.isArray(ruleset.rules)) ruleset.rules = [];
  let rule = ruleset.rules.find((entry) => entry?.type === 'required_status_checks');
  if (!rule) {
    rule = {
      type: 'required_status_checks',
      parameters: {
        strict_required_status_checks_policy: true,
        required_checks: [],
      },
    };
    ruleset.rules.push(rule);
  }
  if (!isPlainObject(rule.parameters)) rule.parameters = {};
  if (!Array.isArray(rule.parameters.required_checks)) rule.parameters.required_checks = [];
  arrays = [rule.parameters.required_checks];
  return arrays;
}

function minimalReviewRuleset() {
  return {
    name: 'main-protection',
    target: 'branch',
    enforcement: 'active',
    conditions: {
      ref_name: {
        include: ['refs/heads/main'],
        exclude: [],
      },
    },
    rules: [
      {
        type: 'required_status_checks',
        parameters: {
          strict_required_status_checks_policy: true,
          required_checks: [],
        },
      },
    ],
    bypass_actors: [],
  };
}

function addReviewGateContextsToRuleset(ruleset) {
  const arrays = ensureRulesetRequiredChecksObject(ruleset);
  let changed = false;
  for (const checks of arrays) {
    const existing = new Set(checks.map(checkEntryContext).filter(Boolean));
    for (const context of REVIEW_GATE_REQUIRED_CHECKS) {
      if (!existing.has(context)) {
        checks.push(makeRequiredCheckEntry(checks, context));
        existing.add(context);
        changed = true;
      }
    }
  }
  return changed;
}

function syncReviewGateRuleset({ cwd, mode, configPath }) {
  const config = loadConfig(cwd, configPath);
  if (config?.reviews?.enforce_gates !== true) {
    return { drift: false, change: null };
  }

  const rulesetPath = getReviewRulesetPath(cwd);
  let ruleset;
  let existed = existsSync(rulesetPath);
  if (existed) {
    try {
      ruleset = JSON.parse(stripBOM(readFileSync(rulesetPath, 'utf8')));
    } catch (err) {
      die(`Cannot parse ${rulesetPath}: ${err.message}`, 1);
    }
  } else {
    ruleset = minimalReviewRuleset();
  }

  const before = existed ? JSON.stringify(ruleset, null, 2) + '\n' : null;
  addReviewGateContextsToRuleset(ruleset);
  const after = JSON.stringify(ruleset, null, 2) + '\n';
  const drift = before !== after;
  const action = !existed ? 'created' : (drift ? 'updated' : 'skipped');
  if (mode === 'apply' && drift) {
    mkdirSync(path.dirname(rulesetPath), { recursive: true });
    writeFileSync(rulesetPath, after, 'utf8');
  }
  return {
    drift,
    change: {
      target: 'infra/main-protection-ruleset.json',
      class: 'managed',
      action,
      preview: mode === 'dry-run' && drift ? after : undefined,
    },
  };
}

function enableReviewGatesForInit(targetDir, configDest) {
  if (!existsSync(configDest)) {
    die(`harness init --enable-review-gates: harness.config.json not found at ${configDest}`, 1);
  }

  let config = readConfigForReviewGates(configDest);
  if (!isPlainObject(config)) {
    die('harness init --enable-review-gates: harness.config.json root must be an object.', 1);
  }
  patchReviewGatesConfig(config);

  const managed = ensureFileClassBlock(config, 'managed');
  addUnique(managed.files, PR_EVIDENCE_WORKFLOW_TARGET);
  addUnique(managed.files, REVIEW_GATES_WORKFLOW_TARGET);

  if (managed.files.includes(PR_TEMPLATE_TARGET)) {
    config = migrateFileClass(config, PR_TEMPLATE_TARGET, { local_blocks: [REVIEW_EVIDENCE_BLOCK_ID] });
    process.stdout.write(`Migrated ${PR_TEMPLATE_TARGET} from managed.files to composed.files\n`);
  } else {
    const composed = ensureFileClassBlock(config, 'composed');
    if (addUnique(composed.files, PR_TEMPLATE_TARGET)) {
      process.stdout.write(`Notice: ${PR_TEMPLATE_TARGET} was not in managed.files; added to composed.files for review gates.\n`);
    } else {
      process.stdout.write(`Notice: ${PR_TEMPLATE_TARGET} is already in composed.files; leaving migration unchanged.\n`);
    }
    ensureComposedOverride(config);
  }

  writeFileSync(configDest, JSON.stringify(config, null, 2) + '\n', 'utf8');
  copyManagedWorkflow(targetDir, PR_EVIDENCE_WORKFLOW_TARGET);
  copyManagedWorkflow(targetDir, REVIEW_GATES_WORKFLOW_TARGET);
  syncReviewGateRuleset({ cwd: targetDir, mode: 'apply', configPath: configDest });
  process.stdout.write(REVIEW_GATES_INSTRUCTION_BLOCK);
}

// ---------------------------------------------------------------------------
// Parse global args
// ---------------------------------------------------------------------------

function parseGlobalArgs() {
  // We do a first-pass manual scan for global flags and the subcommand.
  const argv = process.argv.slice(2);

  let cwd = process.cwd();
  let cwdProvided = false;
  let config = null;
  let ref = null;
  let debug = false;
  let help = false;
  let subcommand = null;
  const rest = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--cwd') {
      cwd = argv[++i] ?? die('--cwd requires a value', 2);
      cwdProvided = true;
    } else if (arg.startsWith('--cwd=')) {
      cwd = arg.slice('--cwd='.length);
      cwdProvided = true;
    } else if (arg === '--config') {
      config = argv[++i] ?? die('--config requires a value', 2);
    } else if (arg.startsWith('--config=')) {
      config = arg.slice('--config='.length);
    } else if (arg === '--ref') {
      ref = argv[++i] ?? die('--ref requires a value', 2);
    } else if (arg.startsWith('--ref=')) {
      ref = arg.slice('--ref='.length);
    } else if (arg === '--debug') {
      debug = true;
    } else if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (!arg.startsWith('-') && subcommand === null) {
      subcommand = arg;
    } else {
      rest.push(arg);
    }
  }

  // Canonicalize paths to absolute, relative to the shell's cwd.
  cwd = path.resolve(process.cwd(), cwd);
  if (cwdProvided) {
    if (!existsSync(cwd)) {
      die(`--cwd path does not exist: ${cwd}`, 2);
    }
    const s = statSync(cwd);
    if (!s.isDirectory()) {
      die(`--cwd must be a directory: ${cwd}`, 2);
    }
  }
  if (config !== null) {
    config = path.resolve(process.cwd(), config);
  }

  return { cwd, config, ref, debug, help, subcommand, rest };
}

// ---------------------------------------------------------------------------
// Subcommand: init
// ---------------------------------------------------------------------------

async function cmdInit(args, global) {
  const { cwd, config: configOverride, debug } = global;

  // Parse init-specific args
  let targetDir = cwd;
  let fromExample = null;
  const withScaffolds = [];
  let constraintDisposition = null;
  let skipConstraintDetection = false;
  let skipWorkboardPatPrompt = false;
  let enableReviewGates = true;
  let enableReviewGatesExplicit = false;
  let reviewGatesOptOutReason = null;
  const VALID_DISPOSITIONS = ['discipline-only', 'upgrade-pro', 'flip-public-when-ready'];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') {
      process.stdout.write(SUBCOMMAND_HELP['init']);
      process.exit(0);
    } else if (a.startsWith('--from-example=')) {
      fromExample = a.slice('--from-example='.length);
    } else if (a === '--with-scaffold') {
      if (i + 1 >= args.length || args[i + 1].startsWith('-')) {
        die(`--with-scaffold requires a value\n\n${SUBCOMMAND_HELP['init']}`, 2);
      }
      withScaffolds.push(args[++i]);
    } else if (a.startsWith('--with-scaffold=')) {
      const v = a.slice('--with-scaffold='.length);
      if (!v) die(`--with-scaffold= requires a value\n\n${SUBCOMMAND_HELP['init']}`, 2);
      withScaffolds.push(v);
    } else if (a === '--constraint-disposition') {
      if (i + 1 >= args.length || args[i + 1].startsWith('-')) {
        die(`--constraint-disposition requires a value (one of: ${VALID_DISPOSITIONS.join(', ')})\n\n${SUBCOMMAND_HELP['init']}`, 2);
      }
      constraintDisposition = args[++i];
    } else if (a.startsWith('--constraint-disposition=')) {
      const v = a.slice('--constraint-disposition='.length);
      if (!v) die(`--constraint-disposition= requires a value (one of: ${VALID_DISPOSITIONS.join(', ')})\n\n${SUBCOMMAND_HELP['init']}`, 2);
      constraintDisposition = v;
    } else if (a === '--skip-constraint-detection') {
      skipConstraintDetection = true;
    } else if (a === '--skip-workboard-pat-prompt') {
      skipWorkboardPatPrompt = true;
    } else if (a === '--enable-review-gates') {
      enableReviewGates = true;
      enableReviewGatesExplicit = true;
      reviewGatesOptOutReason = null;
    } else if (a === '--disable-review-gates') {
      if (i + 1 >= args.length || args[i + 1].startsWith('-')) {
        die(`--disable-review-gates requires a non-empty reason\n\n${SUBCOMMAND_HELP['init']}`, 2);
      }
      reviewGatesOptOutReason = args[++i].trim();
      if (!reviewGatesOptOutReason) die(`--disable-review-gates requires a non-empty reason\n\n${SUBCOMMAND_HELP['init']}`, 2);
      enableReviewGates = false;
    } else if (a.startsWith('--disable-review-gates=')) {
      reviewGatesOptOutReason = a.slice('--disable-review-gates='.length).trim();
      if (!reviewGatesOptOutReason) die(`--disable-review-gates= requires a non-empty reason\n\n${SUBCOMMAND_HELP['init']}`, 2);
      enableReviewGates = false;
    } else if (!a.startsWith('-')) {
      targetDir = path.resolve(cwd, a);
    } else {
      die(`Unknown flag: ${a}\n\n${SUBCOMMAND_HELP['init']}`, 2);
    }
  }

  if (constraintDisposition !== null && !VALID_DISPOSITIONS.includes(constraintDisposition)) {
    die(
      `Invalid --constraint-disposition value: "${constraintDisposition}". Valid: ${VALID_DISPOSITIONS.join(', ')}`,
      2
    );
  }

  // Compute config destination eagerly (used by both pre-validation and the
  // seeded-config write below).
  const configDest = path.join(targetDir, 'harness.config.json');
  const configExists = existsSync(configDest);

  // Pre-validate all requested scaffolds before any writes (per CS10 plan critique).
  // If any name is unknown, fail fast with exit 2 — leaves target untouched.
  const scaffoldsRoot = path.join(REPO_ROOT, 'scaffolds');
  if (withScaffolds.length > 0) {
    const available = existsSync(scaffoldsRoot)
      ? readdirSync(scaffoldsRoot, { withFileTypes: true })
          .filter((e) => e.isDirectory() && existsSync(path.join(scaffoldsRoot, e.name, 'files')))
          .map((e) => e.name)
          .sort()
      : [];
    for (const name of withScaffolds) {
      if (!available.includes(name)) {
        die(
          `Unknown scaffold: "${name}". Available: ${available.length ? available.join(', ') : '(none)'}`,
          2
        );
      }
    }
    // Pre-parse existing harness.config.json so a malformed file fails fast
    // BEFORE any scaffold/seeded files are dropped (per CS10 R1 review).
    if (configExists) {
      try {
        JSON.parse(stripBOM(readFileSync(configDest, 'utf8')));
      } catch (err) {
        die(
          `Existing harness.config.json is malformed JSON; refusing to drop scaffolds.\n` +
            `Path: ${configDest}\nError: ${err.message}`,
          1
        );
      }
    }
  }

  if (configExists) {
    process.stderr.write(
      `Warning: harness.config.json already exists at ${configDest} — skipping config write (use manual edit to update).\n`
    );
  }

  // Determine source config
  const exampleMap = { gwn: 'guesswhatisnext', si: 'sub-invaders', self: 'agent-harness-self' };
  let configSource = null;
  if (fromExample) {
    const key = exampleMap[fromExample];
    if (!key) {
      die(`Unknown --from-example value: "${fromExample}". Valid: gwn, si, self`, 2);
    }
    configSource = path.join(REPO_ROOT, 'examples', `${key}.harness.config.json`);
    if (!existsSync(configSource)) {
      die(`Example config not found: ${configSource}`, 1);
    }
  }

  mkdirSync(targetDir, { recursive: true });

  if (!configExists) {
    if (configSource) {
      copyFileSync(configSource, configDest);
      process.stdout.write(`Created harness.config.json (from example: ${fromExample}) at ${configDest}\n`);
    } else {
      // Copy from template/seeded/harness.config.json (preferred), fall back to scaffold
      const seededConfigSrc = path.join(REPO_ROOT, 'template', 'seeded', 'harness.config.json');
      if (existsSync(seededConfigSrc)) {
        copyFileSync(seededConfigSrc, configDest);
        process.stdout.write(`Created harness.config.json at ${configDest}\n`);
      } else {
        // Defensive fallback: write minimal scaffolded config
        const pkg = readPackageJSON();
        const scaffold = {
          $schema: 'https://github.com/henrik-me/agent-harness/schemas/harness.config.schema.json',
          version: pkg.version,
          project: {
            name: path.basename(targetDir),
            agent_suffix: 'mp',
          },
          managed: { files: [] },
          composed: { files: [] },
          seeded: { files: [] },
          scaffolds: [],
          excluded: [],
        };
        writeFileSync(configDest, JSON.stringify(scaffold, null, 2) + '\n', 'utf8');
        process.stdout.write(`Created harness.config.json at ${configDest}\n`);
      }
    }
  }

  // CS41 / C41-7: review_gates is opt-out by default in v0.5.0+.
  // For FRESH inits we always patch the seeded config + scaffold the workflow.
  // For PRE-EXISTING configs we leave the file alone unless the caller passed
  // `--enable-review-gates` explicitly — preserving the LRN-057 invariant that
  // re-running `harness init` does not silently mutate existing repo state.
  // Callers who already have a config but lack the block will be told to act
  // by `harness sync --mode=check` (C41-8 migration error).
  if (enableReviewGates && (!configExists || enableReviewGatesExplicit)) {
    enableReviewGatesForInit(targetDir, configDest);
  } else if (reviewGatesOptOutReason !== null) {
    if (!existsSync(configDest)) {
      die(`harness init --disable-review-gates: harness.config.json not found at ${configDest}`, 1);
    }
    const config = readConfigForReviewGates(configDest);
    if (!isPlainObject(config)) {
      die('harness init --disable-review-gates: harness.config.json root must be an object.', 1);
    }
    if (config.review_gates !== undefined && !isPlainObject(config.review_gates)) {
      die('harness init --disable-review-gates: "review_gates" must be an object when present.', 1);
    }
    config.review_gates = {
      ...(config.review_gates ?? {}),
      enabled: false,
      _opt_out_reason: reviewGatesOptOutReason,
    };
    writeFileSync(configDest, JSON.stringify(config, null, 2) + '\n', 'utf8');
    process.stdout.write('Review gates disabled with explicit opt-out reason.\n');
  }

  if (!skipWorkboardPatPrompt) {
    process.stdout.write(WORKBOARD_PAT_INSTRUCTION_BLOCK);
  } else {
    process.stdout.write('Skipped WORKBOARD_MERGE_TOKEN PAT setup guidance (--skip-workboard-pat-prompt)\n');
  }

  // Fresh init also installs the managed workboard auto-approve workflow so
  // consumers can opt into either the GitHub App path or the PAT fallback.
  if (!configExists) {
    const workboardWorkflowTarget = '.github/workflows/workboard-auto-approve.yml';
    const workboardWorkflowSrc = path.join(REPO_ROOT, 'template', 'managed', ...workboardWorkflowTarget.split('/'));
    const workboardWorkflowDest = path.join(targetDir, ...workboardWorkflowTarget.split('/'));
    try {
      const cfg = JSON.parse(stripBOM(readFileSync(configDest, 'utf8')));
      const managed = ensureFileClassBlock(cfg, 'managed');
      if (addUnique(managed.files, workboardWorkflowTarget)) {
        writeFileSync(configDest, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
      }
      if (existsSync(workboardWorkflowSrc)) {
        mkdirSync(path.dirname(workboardWorkflowDest), { recursive: true });
        copyFileSync(workboardWorkflowSrc, workboardWorkflowDest);
        process.stdout.write(`Created ${workboardWorkflowTarget}\n`);
      } else {
        process.stderr.write(`Warning: workboard auto-approve workflow template not found at ${workboardWorkflowSrc}; skipping workflow copy.\n`);
      }
    } catch (err) {
      process.stderr.write(`Warning: could not install workboard auto-approve workflow: ${err.message}\n`);
    }
  }

  // Copy seeded template files that are missing
  const seededDir = path.join(REPO_ROOT, 'template', 'seeded');
  if (existsSync(seededDir)) {
    const seededFiles = readdirSync(seededDir, { recursive: true, withFileTypes: true });
    for (const entry of seededFiles) {
      if (!entry.isFile()) continue;
      // .harness-known-constraints.md is written by the constraint-detection
      // block below (with substituted tokens). Skip the verbatim seeded copy.
      if (entry.name === '.harness-known-constraints.md') continue;
      const rel = entry.parentPath
        ? path.join(path.relative(seededDir, entry.parentPath), entry.name)
        : entry.name;
      const dest = path.join(targetDir, rel);
      if (!existsSync(dest)) {
        mkdirSync(path.dirname(dest), { recursive: true });
        copyFileSync(path.join(entry.parentPath ?? seededDir, entry.name), dest);
        process.stdout.write(`Created ${rel}\n`);
      }
    }
  }

  // Drop opt-in scaffolds (CS10). Validation already happened above.
  // For each requested scaffold, walk scaffolds/<name>/files/** and copy each
  // file create-if-missing into the consumer cwd. Existing files are skipped
  // with a stderr warning. After all copies succeed, append the scaffold names
  // to harness.config.json scaffolds[].
  const droppedScaffolds = [];
  for (const name of withScaffolds) {
    const src = path.join(scaffoldsRoot, name, 'files');
    const entries = readdirSync(src, { recursive: true, withFileTypes: true });
    let anyCopied = false;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const rel = entry.parentPath
        ? path.join(path.relative(src, entry.parentPath), entry.name)
        : entry.name;
      const dest = path.join(targetDir, rel);
      if (existsSync(dest)) {
        process.stderr.write(`Skipped (exists): ${rel}\n`);
        continue;
      }
      mkdirSync(path.dirname(dest), { recursive: true });
      copyFileSync(path.join(entry.parentPath ?? src, entry.name), dest);
      process.stdout.write(`Created ${rel}\n`);
      anyCopied = true;
    }
    droppedScaffolds.push({ name, anyCopied });
  }

  // Record opted-in scaffold names in consumer's harness.config.json scaffolds[].
  // Only mutate after at least one scaffold was processed and config is parseable.
  if (droppedScaffolds.length > 0 && existsSync(configDest)) {
    try {
      const cfg = JSON.parse(stripBOM(readFileSync(configDest, 'utf8')));
      if (!Array.isArray(cfg.scaffolds)) cfg.scaffolds = [];
      let mutated = false;
      const added = [];
      for (const { name } of droppedScaffolds) {
        if (!cfg.scaffolds.includes(name)) {
          cfg.scaffolds.push(name);
          mutated = true;
          added.push(name);
        }
      }
      if (mutated) {
        writeFileSync(configDest, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
        process.stdout.write(
          `Recorded scaffolds in harness.config.json: ${added.join(', ')}\n`
        );
      }
    } catch (err) {
      process.stderr.write(
        `Warning: could not update harness.config.json scaffolds[]: ${err.message}\n`
      );
    }
  }

  // ---------------------------------------------------------------------------
  // CS15e: GitHub-tier detection + constraints recording
  // ---------------------------------------------------------------------------
  // Detects repo visibility + plan via api.github.com (γ1 helper), records the
  // result in three places:
  //   1. .harness-known-constraints.md (seeded skeleton with substituted tokens)
  //   2. harness.config.json constraints block (via lib/config-reader.mjs)
  //   3. CONTEXT.md `## Constraints` body (idempotent one-line reference)
  // The flow is skippable via --skip-constraint-detection (no GitHub API calls,
  // no constraints written). The disposition (private-free only) is configurable
  // via --constraint-disposition; defaults to discipline-only.
  if (skipConstraintDetection) {
    process.stdout.write('Skipped tier detection (--skip-constraint-detection)\n');
  } else if (!existsSync(configDest)) {
    process.stderr.write(
      'Warning: harness.config.json not present; skipping constraint detection.\n'
    );
  } else {
    let detection;
    // Test-only escape hatch (γ4): allows CLI tests to inject deterministic
    // detection results without making real GitHub API calls. Live invocations
    // never set this; documented as test-only in tests/cli.test.mjs.
    if (process.env.HARNESS_DETECT_TIER_OVERRIDE) {
      try {
        detection = JSON.parse(process.env.HARNESS_DETECT_TIER_OVERRIDE);
      } catch (err) {
        die(
          `HARNESS_DETECT_TIER_OVERRIDE is not valid JSON: ${err.message}`,
          1
        );
      }
    } else {
      const { detectRepoTier } = await import('../lib/detect-repo-tier.mjs');
      detection = await detectRepoTier({ cwd: targetDir });
    }

    const detectedAt = new Date().toISOString();
    const tier = detection.tier;
    const owner = detection.owner ?? null;
    const repo = detection.repo ?? null;

    // Resolve disposition: only meaningful for private-free; explicit override
    // wins; default discipline-only for private-free; null/omit otherwise.
    let disposition = null;
    if (tier === 'private-free') {
      disposition = constraintDisposition ?? 'discipline-only';
      // CS15e plan line 110 + LRN-064 review gap fix: surface the disposition
      // option set at init time so consumers see the choices without having to
      // open the artifact. Always printed for private-free, regardless of
      // whether the user passed --constraint-disposition.
      process.stdout.write(
        'Repository tier is private-free (free plan + private repo). ' +
        'GitHub-side branch protection is unavailable on this tier.\n' +
        'Disposition options:\n' +
        '  - discipline-only      (default — operate without GitHub-side enforcement)\n' +
        '  - upgrade-pro          (upgrade plan to enable branch protection)\n' +
        '  - flip-public-when-ready (defer; plan to make the repo public)\n' +
        `Selected disposition: ${disposition}\n`
      );
    } else if (constraintDisposition !== null) {
      // Override on a non-private-free tier: warn but record nothing in
      // constraints (the schema rejects disposition + non-private-free).
      process.stderr.write(
        `Warning: --constraint-disposition=${constraintDisposition} ignored ` +
        `(tier is "${tier}", not "private-free").\n`
      );
    }

    // (1) Write .harness-known-constraints.md from the seeded template with
    //     token substitution. Always overwritten on re-runs (idempotent).
    if (owner && repo) {
      try {
        const tplPath = path.join(REPO_ROOT, 'template', 'seeded', '.harness-known-constraints.md');
        let body = stripBOM(readFileSync(tplPath, 'utf8'));
        // Strip the leading HTML comment that documents substitution tokens
        // (it's editor-facing metadata, not for the runtime artifact).
        body = body.replace(/^<!--[\s\S]*?-->\s*\n/, '');
        body = body
          .replaceAll('<TIER>', tier)
          .replaceAll('<DETECTED_AT>', detectedAt)
          .replaceAll('<OWNER>', owner)
          .replaceAll('<REPO>', repo);
        if (disposition) {
          body = body.replaceAll('<DISPOSITION>', disposition);
        } else {
          // Strip any line containing the <DISPOSITION> token entirely.
          body = body.split('\n').filter((line) => !line.includes('<DISPOSITION>')).join('\n');
        }
        const dest = path.join(targetDir, '.harness-known-constraints.md');
        writeFileSync(dest, body, 'utf8');
        process.stdout.write(`Created .harness-known-constraints.md\n`);
      } catch (err) {
        process.stderr.write(
          `Warning: could not write .harness-known-constraints.md: ${err.message}\n`
        );
      }
    } else {
      process.stdout.write(
        `Skipped .harness-known-constraints.md (tier=${tier}, reason=${detection.reason ?? 'no-repo-data'})\n`
      );
    }

    // (2) Merge constraints into harness.config.json via lib/config-reader.mjs.
    if (owner && repo) {
      try {
        const { loadConfig: lcfg, writeConfig: wcfg } = await import('../lib/config-reader.mjs');
        const { config: existingCfg } = await lcfg({ cwd: targetDir });
        const constraints = { tier, detected_at: detectedAt, owner, repo };
        if (disposition) constraints.disposition = disposition;
        existingCfg.constraints = constraints;
        await wcfg({ cwd: targetDir, config: existingCfg });
        process.stdout.write(`Recorded constraints in harness.config.json\n`);
      } catch (err) {
        process.stderr.write(
          `Warning: could not merge constraints into harness.config.json: ${err.message}\n`
        );
      }
    }

    // (3) Update CONTEXT.md `## Constraints` body with a one-line reference.
    //     Idempotent: replaces the existing body (whether placeholder or prior
    //     init output) under the heading; appends the heading if missing.
    //     LRN-064 review gap fix: JS regex has no `\Z` anchor (was being
    //     interpreted as literal "Z"). Use `$(?![\s\S])` for true EOF or the
    //     next H2 boundary, whichever comes first.
    if (owner && repo) {
      try {
        const ctxPath = path.join(targetDir, 'CONTEXT.md');
        if (existsSync(ctxPath)) {
          const original = stripBOM(readFileSync(ctxPath, 'utf8'));
          const refLine = `See \`.harness-known-constraints.md\` for repository tier and disposition (detected ${detectedAt}).`;
          const headingRe = /^## Constraints[ \t]*\r?\n[\s\S]*?(?=^## |$(?![\s\S]))/m;
          let updated;
          if (headingRe.test(original)) {
            updated = original.replace(headingRe, `## Constraints\n\n${refLine}\n\n`);
          } else {
            const trimmed = original.replace(/\s+$/u, '');
            updated = trimmed + `\n\n## Constraints\n\n${refLine}\n`;
          }
          if (updated !== original) {
            writeFileSync(ctxPath, updated, 'utf8');
            process.stdout.write(`Updated CONTEXT.md \`## Constraints\` reference\n`);
          }
        }
      } catch (err) {
        process.stderr.write(
          `Warning: could not update CONTEXT.md: ${err.message}\n`
        );
      }
    }

    // Summary line. LRN-064 review gap fix: do NOT reference
    // .harness-known-constraints.md when we did not write it (skipped path).
    const dispText = disposition ? `, disposition=${disposition}` : '';
    if (owner && repo) {
      process.stdout.write(
        `Constraints detected: tier=${tier}${dispText}. ` +
        `See .harness-known-constraints.md for details.\n`
      );
    } else {
      const reasonText = detection.reason ? ` (reason=${detection.reason})` : '';
      process.stdout.write(
        `Constraints detection: tier=${tier}${reasonText}. ` +
        `No constraints recorded.\n`
      );
    }
  }

  // CS15c (CS09b, LRN-057 / α4 escalation): finalize init by running sync --apply
  // so composed files (CONVENTIONS.md, OPERATIONS.md, REVIEWS.md per the seeded
  // config) are materialized and the resulting repo is sync-check-clean. Without
  // this step, `harness sync --mode=check` immediately after `harness init`
  // reports drift (composed files in config but not on disk), which violates the
  // intuitive expectation that init produces a usable, validated repo.
  try {
    const { sync: syncFn } = await import('../lib/sync.mjs');
    const result = await syncFn({
      consumerRepoPath: targetDir,
      harnessRepoPath: REPO_ROOT,
      mode: 'apply',
    });
    const applied = result.changes.filter((c) => c.action !== 'skipped').length;
    if (applied > 0) {
      process.stdout.write(`Sync complete (${applied} composed/managed files materialized).\n`);
    }
  } catch (err) {
    process.stderr.write(
      `Warning: post-init sync failed: ${err.message}\n` +
      `Run \`harness sync --mode=apply\` manually to complete setup.\n`
    );
  }
}

// ---------------------------------------------------------------------------
// Subcommand: sync
// ---------------------------------------------------------------------------

async function cmdSync(args, global, defaultMode = 'check') {
  const { cwd, config: configOverride, ref, debug } = global;

  let mode = defaultMode;
  let acceptMajor = false;
  let report = false;
  let resolvedShaOverride = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') {
      process.stdout.write(SUBCOMMAND_HELP['sync']);
      process.exit(0);
    } else if (a.startsWith('--mode=')) {
      mode = a.slice('--mode='.length);
    } else if (a === '--dry-run') {
      mode = 'dry-run';
    } else if (a === '--accept-major') {
      acceptMajor = true;
    } else if (a === '--report') {
      report = true;
    } else if (a === '--resolved-sha') {
      // CS11b: pin the recorded resolved_sha in the lock to a specific commit
      // (avoids the LRN-070 post-commit-regenerate ordering trap).
      if (i + 1 >= args.length || args[i + 1].startsWith('-')) {
        die(`--resolved-sha requires a value\n\n${SUBCOMMAND_HELP['sync']}`, 2);
      }
      resolvedShaOverride = args[++i];
      if (!/^[0-9a-f]{40}$/.test(resolvedShaOverride)) {
        die(
          `--resolved-sha must be a 40-character lowercase hex string; got: "${resolvedShaOverride}"\n\n${SUBCOMMAND_HELP['sync']}`,
          2
        );
      }
    } else if (a.startsWith('--resolved-sha=')) {
      const v = a.slice('--resolved-sha='.length);
      if (!v) die(`--resolved-sha= requires a value\n\n${SUBCOMMAND_HELP['sync']}`, 2);
      if (!/^[0-9a-f]{40}$/.test(v)) {
        die(`--resolved-sha must be a 40-character lowercase hex string; got: "${v}"\n\n${SUBCOMMAND_HELP['sync']}`, 2);
      }
      resolvedShaOverride = v;
    } else {
      die(`Unknown flag: ${a}\n\n${SUBCOMMAND_HELP['sync']}`, 2);
    }
  }

  if (!['apply', 'check', 'dry-run'].includes(mode)) {
    die(`Invalid --mode value: "${mode}". Must be apply, check, or dry-run.\n\n${SUBCOMMAND_HELP['sync']}`, 2);
  }

  // CS11b: --resolved-sha only meaningful in apply mode (only apply writes the lock).
  if (resolvedShaOverride !== null && mode !== 'apply') {
    die(`--resolved-sha is only valid with --mode=apply (got mode: "${mode}").\n\n${SUBCOMMAND_HELP['sync']}`, 2);
  }

  // CS15c (CS04d, Option B): --ref is parsed at the global layer for forward-compat
  // but explicitly rejected at the subcommand body until pinning is implemented.
  if (ref !== null && ref !== undefined) {
    die(
      "--ref is not yet implemented. To pin a harness version, set 'version' in harness.config.json.",
      2
    );
  }

  if (mode === 'check') {
    const configPath = configOverride ?? path.join(cwd, 'harness.config.json');
    if (existsSync(configPath)) {
      try {
        const config = JSON.parse(stripBOM(readFileSync(configPath, 'utf8')));
        const gates = config.review_gates;
        const reason = gates?._opt_out_reason;
        const hasOptOutReason = typeof reason === 'string' && reason.trim().length > 0;
        const hasConfigIdentity =
          typeof config.version === 'string' &&
          typeof config.project?.name === 'string' &&
          typeof config.project?.agent_suffix === 'string';
        if (hasConfigIdentity && config.version !== 'self' && (gates === undefined || (gates?.enabled === false && !hasOptOutReason))) {
          process.stderr.write(
            `ERROR: review_gates is now opt-out by default in v0.5.0. Either:\n` +
            `  (a) run 'harness init --enable-review-gates' to opt in (recommended); or\n` +
            `  (b) add '\"_opt_out_reason\": \"<reason>\"' to your review_gates block to explicitly opt out.\n`
          );
          process.exit(1);
        }
      } catch {
        // Let the sync engine surface malformed JSON / schema errors with its existing diagnostics.
      }
    }
  }

  const { sync: syncFn } = await import('../lib/sync.mjs');

  try {
    const result = await syncFn({
      consumerRepoPath: cwd,
      harnessRepoPath: REPO_ROOT,
      mode,
      acceptMajor,
      resolvedShaOverride,
      // CS15c (CS04b, LRN-027 closed): wire --config through to the sync engine.
      // When set, the override replaces <cwd>/harness.config.json entirely.
      configPath: configOverride ?? null,
    });

    const rulesetResult = syncReviewGateRuleset({
      cwd,
      mode,
      configPath: configOverride ?? path.join(cwd, 'harness.config.json'),
    });
    if (rulesetResult.change) result.changes.push(rulesetResult.change);
    if (mode !== 'apply' && rulesetResult.drift) result.driftDetected = true;

    if (result.warnings.length > 0) {
      for (const w of result.warnings) {
        process.stderr.write(`Warning: ${w}\n`);
      }
    }

    if (report || mode === 'dry-run') {
      for (const change of result.changes) {
        const line = `  ${change.action.padEnd(10)} ${change.class.padEnd(10)} ${change.target}`;
        process.stdout.write(line + '\n');
        if (change.preview) {
          process.stdout.write(`--- preview ---\n${change.preview}\n--- end ---\n`);
        }
      }
    }

    if (result.driftDetected && mode === 'check') {
      process.stderr.write('Drift detected. Run `harness sync --mode=apply` to apply changes.\n');
      process.exit(1);
    }

    if (mode === 'apply') {
      process.stdout.write(`Sync complete (${result.changes.filter(c => c.action !== 'skipped').length} changes applied).\n`);
    } else if (mode === 'check') {
      process.stdout.write('No drift detected.\n');
    } else {
      process.stdout.write('Dry-run complete.\n');
    }
  } catch (err) {
    process.stderr.write(`Sync error: ${err.message}\n`);
    if (debug) process.stderr.write(err.stack + '\n');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Subcommand: check (alias for sync --mode=check)
// ---------------------------------------------------------------------------

async function cmdCheck(args, global) {
  // Intercept --help before delegating
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(SUBCOMMAND_HELP['check']);
    process.exit(0);
  }
  // Blocker 1: --mode is not allowed on check (it is always read-only)
  const hasMode = args.some(a => a === '--mode' || a.startsWith('--mode=') || a === '--dry-run');
  if (hasMode) {
    die('harness check: --mode and --dry-run are not allowed (check is read-only)', 2);
  }
  return cmdSync(args, global, 'check');
}

// ---------------------------------------------------------------------------
// Subcommand: lint
// ---------------------------------------------------------------------------

// CS30 / D5: per-linter docstrings for `harness lint --explain <name>`.
// Stays in sync with the actual linters by colocating each entry with the
// linter's name. New linters should add an entry here when they ship.
const LINTER_EXPLANATIONS = {
  architecture: `
**Linter:** check-architecture (scripts/check-architecture.mjs)
**Target:** ARCHITECTURE.md (one per consumer repo)
**Required headings (must appear as level-2 headings, in any order):**
  - Overview
  - Components
  - Data model
  - Decision log
**Other rules:**
  - All relative internal links must resolve to existing files / fragments.

**Canonical seed:** template/seeded/ARCHITECTURE.md ships a complete skeleton
with every required heading in place. The fastest way to satisfy the linter
when starting from scratch is to copy that file and fill in the sections
rather than authoring from prose alone (LRN-CS30-feedback-#5).
`.trim(),
  'text-encoding': `
**Linter:** check-text-encoding (scripts/check-text-encoding.mjs)
**Target:** the consumer repo (or any --dir)
**Rules:**
  - No UTF-8 BOM (0xEF 0xBB 0xBF) at start of any text file.
  - No CRLF or bare-\\r line endings in any text file.
  - .gitignore is respected by default (--respect-gitignore, default ON).
    Use --no-respect-gitignore to scan ignored paths too.
**Defaults:**
  - Includes: .md, .mjs, .js, .json, .yml, .yaml, .sh, .ps1, .txt, .sql, .html, .css
  - Static excludes (always): node_modules, .git
**Why:** prevents BOM creep on Windows (LRN-006/018/065) and CRLF creep from
git core.autocrlf=true (LRN-074), both of which silently break sync drift detection.
`.trim(),
  workboard: `
**Linter:** check-workboard (scripts/check-workboard.mjs)
**Target:** WORKBOARD.md
**Rules:**
  - Must contain ## Orchestrators and ## Active Work sections.
  - Must NOT contain ## Queued or ## Recently Completed (CS28 — filesystem is
    source-of-truth: planned/ for queue, done/ for history).
**Why:** WORKBOARD is live-coordination state only; the queue and history are
file-system-derived and would drift if duplicated here.
`.trim(),
  clickstop: `
**Linter:** check-clickstop (scripts/check-clickstop.mjs)
**Target:** Direct .md children under project/clickstops/{active,done,planned}/
**Rules:**
  - Filename convention: active_csNN_*.md / done_csNN_*.md / planned_csNN_*.md.
  - Required header fields: Status, Owner, Branch, Started, Closed, Depends on.
  - Lifecycle invariant: directory name must match the **Status:** value.
  - Active and recently-closed CS files must include a ## Tasks table with
    explicit close-out hygiene rows (docs/restart task + learnings/follow-up
    task) — see OPERATIONS.md close-out procedure.
  - Done CS files must include a ## Plan-vs-implementation review section
    with **Reviewer:**, **Date:**, and **Outcome:** fields at start-of-line
    (LRN-064 gate; CS03b enforcement date).
**Why:** clickstop files are the canonical record of what work is in flight,
done, or queued. Drift between filename, status, and content would silently
corrupt orchestration.
`.trim(),
  'clickstop-plan-review': `
**Linter:** check-clickstop-plan-review (scripts/check-clickstop-plan-review.mjs)
**Target:** planned/*.md and active/*.md under project/clickstops/.
**Rules:**
  - Each file MUST contain a \`## Plan review\` H2 section with the 8-column
    schema (Round | Reviewer model | Plan author model(s) | Reviewer agent |
    Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap).
  - At least one R1 row; rounds follow R<digit>+; latest verdict ∈
    {Go, Go-with-amendments} (Needs-Fix blocks merge).
  - Independence (per C35b-4): Reviewer model MUST NOT appear in any row's
    Plan author model(s) (accumulated across all rows).
  - Hash freshness (per C35b-3): the latest row's "Reviewed sections hash"
    MUST equal the SHA-256-prefix-12 of the current Decisions+Deliverables
    bodies (compute via \`harness plan-review-hash <file>\`).
  - Done CS files are skipped — \`## Plan-vs-implementation review\`
    (CS03b, scripts/check-clickstop.mjs) covers the close-out surface.
**Strictness asymmetry (per C35b-9, C35b-10, C42-7):**
  - Standalone \`harness lint\` mode: \`--strict\` defaulted to false in v0.4.0
    (warn-only on missing section); flipped to TRUE in v0.5.0 per CS42-7.
    Pass \`--strict false\` to opt out.
  - PR-evidence A6 mode (CS36-aggregator): STRICT in both v0.4.0 and v0.5.0.
  - Schema/independence/hash/verdict violations are ALWAYS errors,
    regardless of mode or --strict.
**Why:** prevents the "plan landed without independent review" gap exposed
by PR #147 (issue #145 cluster). Mirrors the close-out gate's discipline
(CS03b) for the planning surface where there is no PR-body Model-audit table.
`.trim(),
  'commit-trailers': `
**Linter:** check-commit-trailers (scripts/check-commit-trailers.mjs)
**Target:** A git commit message file (e.g. .git/COMMIT_EDITMSG) supplied via --file.
**Rules:**
  - Trailer block is the trailing run of consecutive Key: Value lines after a blank line.
  - --required Trailer1,Trailer2 enforces presence; --allow Trailer=regex enforces value shape.
  - Empty file exits 0 (early return).
**Why:** every harness commit must include the
"Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" trailer
(see OPERATIONS.md). The CI pr-body / commit-trailer workflows enforce this.
`.trim(),
  'compose-v2': `
**Linter:** check-compose-v2 (scripts/check-compose-v2.mjs)
**Target:** docker-compose.yml or compose.yaml at the repo root (auto-detected).
**Rules:**
  - No deprecated top-level \`version:\` key (Compose Spec v3-style is rejected).
  - Top-level \`services:\` key present and non-empty.
  - No known-deprecated keys: \`links:\`, \`external_links:\`, \`volume_driver:\`.
**Why:** Compose Spec v2+ no longer needs/uses \`version:\` and the v3-style
key now causes warnings in current docker compose. Catching deprecated keys
before runtime keeps consumer compose files forward-compatible.
`.trim(),
  'composed-blocks': `
**Linter:** check-composed-blocks (scripts/check-composed-blocks.mjs)
**Target:** A composed-class markdown file (e.g. CONVENTIONS.md, OPERATIONS.md, REVIEWS.md).
**Rules:**
  - Required block IDs (via --allowed-ids) are present.
  - No duplicate block IDs.
  - Every <\u200b!-- harness:local-start id=X --> has a matching end marker.
  - No markers appear UNESCAPED inside fenced code blocks (use &lt;!-- or
    insert U+200B after the < to escape).
  - Lock file (--lock) does not reference orphan IDs absent from the file.
**Why:** composed files mix harness-managed regions with consumer-local blocks
(harness:local-start / -end markers). Drift between the lock file's expected
IDs and what's actually in the file silently breaks \`harness sync\`.
`.trim(),
  context: `
**Linter:** check-context (scripts/check-context.mjs)
**Target:** CONTEXT.md (one per consumer repo).
**Rules:**
  - Required section headings are present.
  - No stale "ready to claim" language when a CS is currently active in
    project/clickstops/active/ (cross-checked via --cwd).
**Why:** CONTEXT.md is the orchestrator restart-state document. If it claims
"ready to claim" while CSnn is active, a fresh agent will misread the state
and either re-claim or skip the active CS.
`.trim(),
  'cs-plan': `
**Linter:** check-cs-plan (scripts/check-cs-plan.mjs)
**Target:** project/clickstops/{active,done,planned}/*.md (CS plan files)
**Rules:**
  - No mention of harness-repo-internal path prefixes (default:
    template/composed/, template/seeded/, template/managed/) outside
    fenced code blocks, outside backtick-delimited inline code spans
    (\`like-this\`), AND outside links to https://github.com/henrik-me/agent-harness/...
  - Configurable via harness.config.json → cs_plan_lint.forbidden_path_prefixes (string[]).
    Consumers wanting the pre-issue-#183 stricter set can opt in by adding
    \`lib/\`, \`bin/\`, \`scripts/\` to the override list.
  - Self-host-guarded: skipped when package.json#name === '@henrik-me/agent-harness'.
**Why:** consumer repos that copy CS-plan templates from the harness can
inadvertently keep harness-perspective paths (e.g. "edit template/composed/CONVENTIONS.md")
that don't exist in the consumer; sub-agents then look in the wrong place
and waste a round-trip. LRN-105 documents the SI-CS01 trigger case.
Issue #183 (post-v0.5.0) shrunk the defaults from the original 5-prefix list
(\`template/composed/\`, \`template/seeded/\`, \`lib/\`, \`bin/\`, \`scripts/\`)
to the 3 unambiguously harness-only \`template/*\` prefixes, and added
inline-code-span exemption to match the way humans naturally reference paths
in prose.
`.trim(),
  'planning-locality': `
**Linter:** check-planning-locality (scripts/check-planning-locality.mjs)
**Target:** repo working tree (file set comes from \`git ls-files\`).
**Rules:**
  - No tracked file may have a basename matching one of the banned planning-file
    names (case-insensitive): PLAN.md, ROADMAP.md, TODO.md, NOTES.md, STRATEGY.md.
  - Allow-listed path prefixes (POSIX, repo-root-relative) where banned names
    are accepted: project/clickstops/, template/, node_modules/, .git/,
    tests/fixtures/.
  - Untracked / gitignored files are not scanned (only committed or staged
    content can violate).
**Why:** Per CS35 Decision C35-11, strategic planning content (multi-CS arcs,
defaults outliving a session) MUST live in project/clickstops/{planned,active,
done}/. Session storage (e.g. ~/.copilot/session-state/<id>/plan.md) is
non-durable; any agent restart, model swap, or handoff must succeed from the
repo alone. Banning the common scratch-file shapes (per C35-12) at lint time
prevents drift toward repo-root planning files that fragment the canonical
CS arc.
`.trim(),
  fixtures: `
**Linter:** check-fixtures (scripts/check-fixtures.mjs)
**Target:** tests/fixtures/ (or any --dir).
**Rules:**
  - No path under the target may be silently swallowed by .gitignore
    (validated via \`git check-ignore --no-index\`).
**Why:** LRN-076 — test fixtures matched by .gitignore (e.g. *.log) exist
locally but are never committed. CI then runs without them, the test
silently changes shape (still asserts something — but not what was meant),
and false-greens accumulate undetected.
`.trim(),
  instructions: `
**Linter:** check-instructions (scripts/check-instructions.mjs)
**Target:** INSTRUCTIONS.md.
**Rules:**
  - Required top-level (H2) headings are present.
  - Anchor links ([text](#anchor)) resolve to existing headings.
  - Headings with no body emit WARNING (dead-section detection; non-fatal).
  - Scoped cross-file references resolve (LRN-NNN anchors and ADR files).
**Why:** INSTRUCTIONS.md is the post-pull quick-reference checklist. Broken
links or dead sections silently degrade the agent re-orientation flow.
`.trim(),
  learnings: `
**Linter:** check-learnings (scripts/check-learnings.mjs)
**Target:** LEARNINGS.md.
**Rules:**
  - Every entry's YAML frontmatter validates against schemas/learning.schema.json (AJV).
  - Status / disposition consistency (e.g. status=deferred requires deferred_until).
  - LRN-NNN sequence sanity warnings.
**Why:** LEARNINGS.md is the institutional memory. Schema validation prevents
silent typos in category/status/tags from causing missed harvests.
`.trim(),
  pack: `
**Linter:** check-pack (scripts/check-pack.mjs)
**Target:** Repo root (must contain package.json).
**Rules:**
  - Tarball unpacked-size budget (default 1 MB; --max-size-bytes override).
  - Forbidden patterns absent from packed file list.
  - Required entries present in packed file list.
**Why:** consumers get the harness via \`npx -y github:henrik-me/agent-harness\`
which runs \`npm pack\` under the hood. Size budget catches accidental .git/
or test-fixture inclusion; required-entry checks catch missed bin/ scripts.
Self-host-guarded: only runs when the consumer's package.json name is
\`@henrik-me/agent-harness\`.
`.trim(),
  'pr-body': `
**Linter:** check-pr-body (scripts/check-pr-body.mjs)
**Target:** A PR body markdown file supplied via --file.
**Rules:**
  - Required section headings present (default: Summary, Changes, Testing).
  - No placeholder text remains (TODO:, FIXME:, &lt;!-- placeholder -->, XXX:, TBD).
  - Optional --min-words per required section body.
**Why:** consistent PR bodies make the project log self-explanatory at a
later date. The CI pr-body workflow runs this against the live PR body —
when you edit a PR body in the UI to satisfy this linter, follow up with
\`gh run rerun <run-id> --failed\` (see LRN-100).
`.trim(),
  'public-artifact': `
**Linter:** check-public-artifact (scripts/check-public-artifact.mjs)
**Target:** Archived shadow / pilot / migration artifact dir (--dir). Scans .md, .txt, .log, .json.
**Rules:**
  - Forbidden patterns are config-driven via \`public_artifact_redaction\`
    in harness.config.json; hardcoded defaults apply when no config is present.
**Why:** before promoting artifacts to a public branch / release, scan for
secrets, internal URLs, and other leak vectors. Patterns are intentionally
config-driven so each consumer can codify its own redaction policy.
`.trim(),
  readme: `
**Linter:** check-readme (scripts/check-readme.mjs)
**Target:** README.md.
**Required (errors):**
  - First non-empty line is an H1.
  - At least one paragraph between the H1 and the first H2.
  - "## Quickstart" OR "## Getting started" (case-insensitive).
  - "## License" or a "MIT" mention anywhere in the file.
  - "## Architecture" OR a link to ARCHITECTURE.md.
  - "## Status" OR a link to CONTEXT.md.
**Optional (warning):**
  - At least one ![…](…) badge image in the first 30 lines.
**Why:** v0 baseline structural README check (CS06 spec, will canonicalize
when CS08 ships READMEGUIDE).
`.trim(),
  'scaffold-readme': `
**Linter:** check-scaffold-readme (scripts/check-scaffold-readme.mjs)
**Target:** scaffolds/<name>/README.md (one row per scaffold; auto-dispatched
            via --file <readme> --name <scaffold-name>).
**Required H2 headings:**
  - ## When to use
  - ## What it ships
  - ## Customization points
  - ## How to invoke
**Why:** scaffold READMEs are pattern docs — consumers read them to decide
whether to invoke the scaffold. Missing sections silently turn a useful
pattern into an unfindable one. Self-host-guarded (only runs in the harness
repo itself, not consumer repos).
`.trim(),
  templates: `
**Linter:** check-templates (scripts/check-templates.mjs)
**Target:** template/ directory (or any --file / --dir).
**Rules (LRN-049/050/051):**
  - No dot-notation placeholders ({{project.agent_suffix}}); use flat keys
    ({{agent_suffix}}) — dot-notation is emitted literally, not substituted.
  - No relative-up paths ('../...') in template-resolved file references.
  - No self-referencing TODO/FIXME tokens in PR-template files.
**Why:** template-authoring regressions are silent: a wrong placeholder
renders as literal text in the consumer's checked-in file. The linter
catches the most common authoring traps before sync ships them downstream.
`.trim(),
  'workflow-pins': `
**Linter:** check-workflow-pins (scripts/check-workflow-pins.mjs)
**Target:** .github/workflows/ (or any --dir of .yml/.yaml files).
**Rules:**
  - Every \`uses: henrik-me/agent-harness[/<path>]@<ref>\` reference must
    either be a 40-char hex SHA pin OR exactly match the \`version\` field
    in harness.config.json.
  - Branch refs (@main, @master, @v1) are ERROR unless they are a SHA or
    match the configured version.
**Why:** unpinned workflow refs let an upstream main change silently break
consumer CI between runs. Pinning to SHA (preferred) or to a release tag
makes the dependency edge explicit. For SAML-protected orgs where
\`gh api repos/<owner>/<repo>/git/ref/tags/<tag>\` returns 403, use
\`git ls-remote https://github.com/<owner>/<repo>.git refs/tags/<tag>\`
as the SAML-safe fallback (see OPERATIONS.md § Reusable CI workflow).
`.trim(),
  'review-gates': `
**Linter:** check-review-gates (scripts/check-review-gates.mjs)
**Target:** harness.config.json, .github/workflows/review-gates.yml, and
          infra/main-protection-ruleset.json.
**Rules:**
  - If \`reviews.enforce_gates=true\`, the review-gates workflow must exist.
  - harness.config.json \`managed.files\` must include the workflow target.
  - infra/main-protection-ruleset.json \`required_checks\` must include
    review-log-evidence, copilot-review-attached, independence-invariant,
    and review-threads-resolved.
**Why:** REVIEWS.md is only mechanically enforced when both the workflow and
branch ruleset contexts are installed; this catches partial sync/init states.
`.trim(),
};

async function cmdLint(args, _global) {
  let quiet = false;
  let only = null;
  let skip = new Set();
  let publicArtifactDir = null;
  let explain = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') {
      process.stdout.write(SUBCOMMAND_HELP['lint']);
      process.exit(0);
    } else if (a === '--quiet') {
      quiet = true;
    } else if (a === '--only') {
      if (!args[i + 1] || args[i + 1].startsWith('-')) die('harness lint: missing value for --only', 2);
      only = new Set(args[++i].split(',').map((s) => s.trim()).filter(Boolean));
    } else if (a.startsWith('--only=')) {
      only = new Set(a.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean));
    } else if (a === '--skip') {
      if (!args[i + 1] || args[i + 1].startsWith('-')) die('harness lint: missing value for --skip', 2);
      skip = new Set(args[++i].split(',').map((s) => s.trim()).filter(Boolean));
    } else if (a.startsWith('--skip=')) {
      skip = new Set(a.slice('--skip='.length).split(',').map((s) => s.trim()).filter(Boolean));
    } else if (a === '--public-artifact-dir') {
      if (!args[i + 1] || args[i + 1].startsWith('-')) die('harness lint: missing value for --public-artifact-dir', 2);
      publicArtifactDir = args[++i];
    } else if (a === '--explain') {
      if (!args[i + 1] || args[i + 1].startsWith('-')) die('harness lint: missing value for --explain', 2);
      explain = args[++i];
    } else if (a.startsWith('--explain=')) {
      explain = a.slice('--explain='.length);
    } else {
      die(`Unknown flag: ${a}\n\n${SUBCOMMAND_HELP['lint']}`, 2);
    }
  }

  // CS30 / D5: --explain <linter> prints rule documentation + canonical seed/template
  // file paths for one linter. Implemented for high-value linters first; falls back
  // to a friendly "no docs yet" stub for unknown names so the contract is stable.
  if (explain) {
    const docs = LINTER_EXPLANATIONS[explain];
    if (!docs) {
      const known = Object.keys(LINTER_EXPLANATIONS).sort().join(', ');
      die(`harness lint --explain: no documentation registered for linter "${explain}". Known: ${known}`, 2);
    }
    process.stdout.write(`# harness lint --explain ${explain}\n\n${docs}\n`);
    process.exit(0);
  }

  const cwd = _global.cwd ?? process.cwd();

  // Resolve composed-files list and per-file local-block allowlists from
  // harness.config.json. Schema: composed.files is string[] (file paths
  // relative to cwd); composed.overrides[file].local_blocks is the per-file
  // allowlist (single source of truth as of v0.2.0 / LRN-009). Files in
  // composed.files without a matching composed.overrides[file] entry have an
  // empty allowlist (no local blocks permitted).
  // NOTE: public_artifact_redaction has no target_dir in the schema — it is a
  // per-artifact-type map. Public-artifact linting is only enabled via --public-artifact-dir.
  let composedFilePaths = [];
  let localBlocks = {};
  const cfgPath = path.join(cwd, 'harness.config.json');
  const effectiveConfigPath = _global.config ?? cfgPath;
  if (existsSync(effectiveConfigPath)) {
    try {
      const cfg = JSON.parse(readFileSync(effectiveConfigPath, 'utf8'));
      if (Array.isArray(cfg.composed?.files)) {
        composedFilePaths = cfg.composed.files;
      }
      const overrides = cfg.composed?.overrides;
      if (overrides && typeof overrides === 'object') {
        for (const [file, override] of Object.entries(overrides)) {
          if (Array.isArray(override?.local_blocks)) {
            localBlocks[file] = override.local_blocks;
          }
        }
      }
    } catch {
      // ignore — let the per-linter validation surface config issues
    }
  }

  const publicDir = publicArtifactDir;
  const lockPath = path.join(cwd, '.harness-lock.json');

  // CS30 / D8: print a version header at the top of every `lint` invocation
  // so CI logs make it obvious which harness produced the result.
  // Honoured even under --quiet (header is one line).
  try {
    const pkg = readPackageJSON();
    process.stdout.write(`# harness v${pkg.version} — lint (cwd: ${cwd})\n`);
  } catch {
    // pkg may not be readable in unusual self-host scenarios; fail soft.
  }

  // Linter table
  const linters = [
    {
      name: 'learnings',
      script: 'check-learnings.mjs',
      args: ['--file', path.join(cwd, 'LEARNINGS.md')],
      target: path.join(cwd, 'LEARNINGS.md'),
    },
    {
      name: 'context',
      script: 'check-context.mjs',
      args: ['--file', path.join(cwd, 'CONTEXT.md'), '--cwd', cwd],
      target: path.join(cwd, 'CONTEXT.md'),
    },
    {
      name: 'workboard',
      script: 'check-workboard.mjs',
      args: ['--file', path.join(cwd, 'WORKBOARD.md')],
      target: path.join(cwd, 'WORKBOARD.md'),
    },
    {
      name: 'architecture',
      script: 'check-architecture.mjs',
      args: ['--file', path.join(cwd, 'ARCHITECTURE.md')],
      target: path.join(cwd, 'ARCHITECTURE.md'),
    },
    {
      name: 'clickstop',
      script: 'check-clickstop.mjs',
      args: ['--dir', path.join(cwd, 'project', 'clickstops')],
      target: path.join(cwd, 'project', 'clickstops'),
    },
    { name: 'clickstop-implementer-not-reviewer', script: 'check-clickstop-implementer-not-reviewer.mjs', args: ['--cwd', cwd], target: path.join(cwd, 'project', 'clickstops') },
    {
      // CS35b: plan-review attestation linter. Requires every planned/*.md and
      // active/*.md to carry a `## Plan review` H2 section with at least one
      // attestation row (Round/Reviewer model/Plan author model(s)/Reviewer
      // agent/Reviewed sections hash/Timestamp/Verdict/Findings recap). In
      // standalone mode (default), --strict default flipped to true in v0.5.0
      // (CS42-7) — missing-section is now an error by default; pass
      // `--strict false` to opt out. Schema/independence/hash/verdict
      // violations are always errors. The pr-evidence A6 gate (CS36) runs the
      // same script with --mode=pr-evidence which is STRICT regardless.
      name: 'clickstop-plan-review',
      script: 'check-clickstop-plan-review.mjs',
      args: ['--dir', path.join(cwd, 'project', 'clickstops')],
      target: path.join(cwd, 'project', 'clickstops'),
    },
    {
      name: 'instructions',
      script: 'check-instructions.mjs',
      args: ['--file', path.join(cwd, 'INSTRUCTIONS.md')],
      target: path.join(cwd, 'INSTRUCTIONS.md'),
    },
    {
      name: 'readme',
      script: 'check-readme.mjs',
      args: ['--file', path.join(cwd, 'README.md')],
      target: path.join(cwd, 'README.md'),
    },
    // composed-blocks: one invocation per composed file (skipped if none)
    ...composedFilePaths.map((filePath) => {
      const cf = path.join(cwd, filePath);
      const allowedIds = Array.isArray(localBlocks[filePath]) ? localBlocks[filePath] : [];
      // ALWAYS pass --allowed-ids for composed files (per CS02b / LRN-009):
      // an empty list explicitly forbids any local blocks, which is the
      // intended semantics for a composed file without a composed.overrides
      // entry. Without this, check-composed-blocks would treat absence of
      // --allowed-ids as "no constraint" and silently permit any block ID.
      const composedArgs = ['--file', cf, '--allowed-ids', allowedIds.join(',')];
      if (existsSync(lockPath)) composedArgs.push('--lock', lockPath);
      return {
        name: `composed-blocks:${path.basename(cf)}`,
        script: 'check-composed-blocks.mjs',
        args: composedArgs,
        target: cf,
      };
    }),
    {
      name: 'workflow-pins',
      script: 'check-workflow-pins.mjs',
      args: [
        '--dir', path.join(cwd, '.github', 'workflows'),
        ...(existsSync(effectiveConfigPath) ? ['--config', effectiveConfigPath] : []),
      ],
      target: path.join(cwd, '.github', 'workflows'),
    },
    {
      name: 'review-gates',
      script: 'check-review-gates.mjs',
      args: [
        '--cwd', cwd,
        ...(existsSync(effectiveConfigPath) ? ['--config', effectiveConfigPath] : []),
      ],
      target: existsSync(effectiveConfigPath) ? effectiveConfigPath : null,
    },
    {
      // CS03c: text-encoding linter (BOM + line endings). Walks the consumer cwd
      // recursively. Always enabled; can be skipped via --skip text-encoding.
      name: 'text-encoding',
      script: 'check-text-encoding.mjs',
      args: ['--dir', cwd],
      target: cwd,
    },
    {
      // CS13 (LRN-076): fixtures linter. Detects test-fixture paths matched by
      // .gitignore (would silently false-green on CI). Skipped if there is no
      // tests/fixtures directory.
      name: 'fixtures',
      script: 'check-fixtures.mjs',
      args: ['--dir', path.join(cwd, 'tests', 'fixtures')],
      target: path.join(cwd, 'tests', 'fixtures'),
    },
    {
      // CS34 (LRN-105): cs-plan linter. Flags harness-repo-relative paths
      // (template/composed/, lib/, etc.) inside CS plans of CONSUMER repos.
      // Self-host-guarded inside the linter script itself; the runner just
      // dispatches and the script no-ops in the harness self-host.
      name: 'cs-plan',
      script: 'check-cs-plan.mjs',
      args: [
        '--dir', path.join(cwd, 'project', 'clickstops'),
        '--cwd', cwd,
        ...(existsSync(effectiveConfigPath) ? ['--config', effectiveConfigPath] : []),
      ],
      target: path.join(cwd, 'project', 'clickstops'),
    },
    {
      // CS35 (planning-locality): bans repo-root scratch planning files
      // (PLAN.md, ROADMAP.md, TODO.md, NOTES.md, STRATEGY.md case-insensitive)
      // outside the allow-list (project/clickstops/, template/, node_modules/,
      // .git/, tests/fixtures/). Strategic planning content MUST live in the
      // canonical CS arc per Decision C35-11 — session storage is non-durable.
      name: 'planning-locality',
      script: 'check-planning-locality.mjs',
      args: ['--cwd', cwd],
      target: cwd,
    },
    {
      // CS15d (CS08b): templates linter. Enforces LRN-049 (no dot-notation
      // placeholders), LRN-050 (no relative-up paths), LRN-051 (no
      // self-referencing TODO/FIXME tokens in PR-template files). Skipped if
      // there is no template/ directory at the consumer cwd.
      name: 'templates',
      script: 'check-templates.mjs',
      args: ['--dir', path.join(cwd, 'template'), '--cwd', cwd],
      target: path.join(cwd, 'template'),
    },
    // CS13: pack linter. Self-host-guarded: only runs when the consumer's
    // package.json `name` matches `@henrik-me/agent-harness` (i.e. when the
    // harness repo is linting itself or a vendored copy). Other consumers
    // have their own packaging conventions and would get false failures.
    // Build the entry conditionally so target=null skips cleanly when not
    // applicable (per the standard target-not-found logic).
    (() => {
      let isSelfHost = false;
      try {
        const pkgPath = path.join(cwd, 'package.json');
        if (existsSync(pkgPath)) {
          const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
          if (pkg && pkg.name === '@henrik-me/agent-harness') isSelfHost = true;
        }
      } catch { /* fail-soft: skip pack linter on parse error */ }
      return {
        name: 'pack',
        script: 'check-pack.mjs',
        args: isSelfHost ? ['--cwd', cwd] : null,
        target: isSelfHost ? path.join(cwd, 'package.json') : null,
      };
    })(),
    // CS15d (CS10b): scaffold-readme self-host walk. One linter entry per
    // scaffolds/<name>/README.md in the harness repo itself. Self-host-guarded
    // (LRN-077) — consumer repos do not ship a scaffolds/ tree at the harness
    // root. For non-self-host consumers, emit a single skipped row to keep
    // the lint summary shape stable.
    ...(() => {
      let isSelfHost = false;
      try {
        const pkgPath = path.join(cwd, 'package.json');
        if (existsSync(pkgPath)) {
          const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
          if (pkg && pkg.name === '@henrik-me/agent-harness') isSelfHost = true;
        }
      } catch { /* fail-soft */ }
      if (!isSelfHost) {
        return [{
          name: 'scaffold-readme',
          script: 'check-scaffold-readme.mjs',
          args: null,
          target: null,
        }];
      }
      const scaffoldsDir = path.join(cwd, 'scaffolds');
      if (!existsSync(scaffoldsDir)) return [];
      const out = [];
      for (const entry of readdirSync(scaffoldsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const readmePath = path.join(scaffoldsDir, entry.name, 'README.md');
        if (!existsSync(readmePath)) continue;
        out.push({
          name: `scaffold-readme:${entry.name}`,
          script: 'check-scaffold-readme.mjs',
          args: ['--file', readmePath, '--name', entry.name],
          target: readmePath,
        });
      }
      return out;
    })(),
    // CS15d (CS10b part 2): scaffold-policy auto-dispatch. For each scaffold
    // declared in harness.config.json `scaffolds[]`, look up the deterministic
    // shipped-linter mapping and dispatch the linter from the consumer's
    // scripts/ dir. Mapping is intentional: scaffold names are plural
    // (categorical), shipped linter names are singular (per-item). Row names
    // mirror the linter basename (without `check-` prefix and `.mjs` suffix)
    // to make the dispatch source visible in the summary. New shipped scaffold
    // linters must be added to SHIPPED_SCAFFOLD_LINTERS below. Missing scripts
    // graceful-skip (matches pr-body/compose-v2 pattern).
    ...(() => {
      const SHIPPED_SCAFFOLD_LINTERS = {
        migrations: 'check-migration-policy.mjs',
        'feature-flags': 'check-feature-flag-policy.mjs',
      };
      let scaffolds = [];
      try {
        if (existsSync(effectiveConfigPath)) {
          const cfg = JSON.parse(readFileSync(effectiveConfigPath, 'utf8'));
          if (Array.isArray(cfg.scaffolds)) scaffolds = cfg.scaffolds;
        }
      } catch { /* ignore — surfaced by other linters */ }
      const out = [];
      for (const scaffoldName of scaffolds) {
        const linterScript = SHIPPED_SCAFFOLD_LINTERS[scaffoldName];
        if (!linterScript) continue;
        const consumerScriptPath = path.join(cwd, 'scripts', linterScript);
        const rowName = linterScript.replace(/^check-/, '').replace(/\.mjs$/, '');
        out.push({
          name: rowName,
          script: consumerScriptPath,
          args: ['--cwd', cwd],
          target: consumerScriptPath,
        });
      }
      return out;
    })(),
    {
      name: 'public-artifact',
      script: 'check-public-artifact.mjs',
      args: publicDir
        ? ['--dir', publicDir, ...(existsSync(effectiveConfigPath) ? ['--config', effectiveConfigPath] : [])]
        : null,
      target: publicDir,
    },
    // CS07: generic policy linters. Targets are project-level files that may
    // not exist in every consumer repo; skipped by the standard target-not-found logic.
    {
      name: 'pr-body',
      script: 'check-pr-body.mjs',
      args: ['--file', path.join(cwd, '.github', 'PR_BODY.md')],
      target: path.join(cwd, '.github', 'PR_BODY.md'),
    },
    {
      name: 'commit-trailers',
      script: 'check-commit-trailers.mjs',
      args: ['--file', path.join(cwd, '.git', 'COMMIT_EDITMSG')],
      target: path.join(cwd, '.git', 'COMMIT_EDITMSG'),
    },
    {
      name: 'compose-v2',
      script: 'check-compose-v2.mjs',
      args: existsSync(path.join(cwd, 'compose.yaml'))
        ? ['--file', path.join(cwd, 'compose.yaml')]
        : ['--file', path.join(cwd, 'docker-compose.yml')],
      target: existsSync(path.join(cwd, 'compose.yaml'))
        ? path.join(cwd, 'compose.yaml')
        : path.join(cwd, 'docker-compose.yml'),
    },
    // render-deploy-summary is a renderer not a checker; not invoked by `harness lint`
  ];

  const results = [];
  let anyError = false;

  // CS31 + CS32/D1: validate that every name in --only / --skip matches at
  // least one known linter base name. Without this, a typo like
  // `lint --only text-encding` or `lint --skip text-encding` silently exits 0
  // with "0 passed, 0 failed, 0 skipped" (--only) or no-effect (--skip) — a
  // usability footgun that lets typos in CI workflows pass forever. Mirrors
  // the --explain unknown-name UX (line ~1033).
  const knownBaseNames = new Set(linters.map((l) => l.name.split(':')[0]));
  if (only) {
    const unknown = [...only].filter((n) => !knownBaseNames.has(n));
    if (unknown.length > 0) {
      const known = [...knownBaseNames].sort().join(', ');
      const label = unknown.length === 1 ? 'name' : 'names';
      die(
        `harness lint --only: unknown linter ${label}: ${unknown.join(', ')}\nKnown: ${known}`,
        2,
      );
    }
  }
  if (skip.size > 0) {
    const unknown = [...skip].filter((n) => !knownBaseNames.has(n));
    if (unknown.length > 0) {
      const known = [...knownBaseNames].sort().join(', ');
      const label = unknown.length === 1 ? 'name' : 'names';
      die(
        `harness lint --skip: unknown linter ${label}: ${unknown.join(', ')}\nKnown: ${known}`,
        2,
      );
    }
  }

  for (const linter of linters) {
    const baseName = linter.name.split(':')[0];
    if (only && !only.has(baseName)) continue;
    if (skip.has(baseName)) continue;

    if (!linter.args || !linter.target || !existsSync(linter.target)) {
      results.push({ name: linter.name, status: 'skipped', reason: 'target not found' });
      continue;
    }

    if (!quiet) {
      process.stdout.write(`\n[${linter.name}]\n`);
    }
    const linterScript = path.isAbsolute(linter.script)
      ? linter.script
      : path.join(REPO_ROOT, 'scripts', linter.script);
    const fullArgs = [linterScript, ...linter.args];
    if (quiet) fullArgs.push('--quiet');
    const result = spawnSync(process.execPath, fullArgs, {
      cwd,
      stdio: quiet ? 'pipe' : 'inherit',
    });
    const exitCode = result.status ?? 1;
    results.push({ name: linter.name, status: exitCode === 0 ? 'pass' : 'fail', exitCode });
    if (exitCode !== 0) anyError = true;
    // CS33: auto-suggest --explain at the bottom of every linter failure block.
    // Gated: only for linters with a LINTER_EXPLANATIONS entry; suppressed under --quiet.
    if (exitCode !== 0 && !quiet && LINTER_EXPLANATIONS[baseName]) {
      process.stderr.write(`→ Run \`harness lint --explain ${baseName}\` for the full rule set.\n`);
    }
  }

  // Aggregate summary
  process.stdout.write('\n=== harness lint summary ===\n');
  for (const r of results) {
    const icon = r.status === 'pass' ? '✓' : r.status === 'fail' ? '✗' : '–';
    process.stdout.write(`  ${icon} ${r.name}: ${r.status}${r.reason ? ` (${r.reason})` : ''}\n`);
  }
  const passCount = results.filter((r) => r.status === 'pass').length;
  const failCount = results.filter((r) => r.status === 'fail').length;
  const skipCount = results.filter((r) => r.status === 'skipped').length;
  process.stdout.write(`\nTotal: ${passCount} passed, ${failCount} failed, ${skipCount} skipped\n`);

  process.exit(anyError ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Subcommand: harvest (STUB)
// ---------------------------------------------------------------------------

async function cmdHarvest(args, _global) {
  for (const a of args) {
    if (a === '--help' || a === '-h') {
      process.stdout.write(SUBCOMMAND_HELP['harvest']);
      process.exit(0);
    } else if (a.startsWith('--snooze=')) {
      // recognized flag — parsed but ignored until implemented
    } else {
      die(`Unknown flag: ${a}\n\n${SUBCOMMAND_HELP['harvest']}`, 2);
    }
  }
  die('harness harvest: not yet implemented (planned: CS-TBD)', 3);
}

// ---------------------------------------------------------------------------
// Subcommand: check-migration (STUB)
// ---------------------------------------------------------------------------

/**
 * check-migration — detect migration issues from an existing harness installation.
 * STUB in CS04; full implementation planned for CS19 per active_cs04_cli-dispatcher.md.
 *
 * @param {string[]} args
 * @param {object} _global
 */
async function cmdCheckMigration(args, _global) {
  let fromExistingHarness = false;
  for (const a of args) {
    if (a === '--help' || a === '-h') {
      process.stdout.write(SUBCOMMAND_HELP['check-migration']);
      process.exit(0);
    } else if (a === '--from-existing-harness') {
      fromExistingHarness = true;
    } else {
      die(`Unknown flag: ${a}\n\n${SUBCOMMAND_HELP['check-migration']}`, 2);
    }
  }
  if (!fromExistingHarness) {
    die(`harness check-migration: --from-existing-harness is required\n\n${SUBCOMMAND_HELP['check-migration']}`, 2);
  }
  die('harness check-migration: not yet implemented (planned: CS19)', 3);
}

// ---------------------------------------------------------------------------
// Subcommand: composed-audit (STUB)
// ---------------------------------------------------------------------------

/**
 * composed-audit — audit composed blocks from an existing harness installation.
 * STUB in CS04; full implementation planned for CS06/CS19 per active_cs04_cli-dispatcher.md.
 *
 * @param {string[]} args
 * @param {object} _global
 */
async function cmdComposedAudit(args, _global) {
  let fromExistingHarness = false;
  for (const a of args) {
    if (a === '--help' || a === '-h') {
      process.stdout.write(SUBCOMMAND_HELP['composed-audit']);
      process.exit(0);
    } else if (a === '--from-existing-harness') {
      fromExistingHarness = true;
    } else {
      die(`Unknown flag: ${a}\n\n${SUBCOMMAND_HELP['composed-audit']}`, 2);
    }
  }
  if (!fromExistingHarness) {
    die(`harness composed-audit: --from-existing-harness is required\n\n${SUBCOMMAND_HELP['composed-audit']}`, 2);
  }
  die('harness composed-audit: not yet implemented (planned: CS-TBD)', 3);
}

// ---------------------------------------------------------------------------
// Subcommand: pack
// ---------------------------------------------------------------------------

async function cmdPack(args, _global) {
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(SUBCOMMAND_HELP['pack']);
    process.exit(0);
  }

  const result = spawnSync('npm', ['pack', '--dry-run'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
    shell: true,
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error) {
    process.stderr.write(`pack error: ${result.error.message}\n`);
    process.exit(1);
  }

  process.exit(result.status ?? 0);
}

// ---------------------------------------------------------------------------
// Subcommand: version
// ---------------------------------------------------------------------------

async function cmdVersion(args, _global) {
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(SUBCOMMAND_HELP['version']);
    process.exit(0);
  }

  const pkg = readPackageJSON();
  let out = `${pkg.version}\n`;

  if (pkg.harness?.linkedRef) {
    out += `linked-ref: ${pkg.harness.linkedRef}\n`;
  } else {
    out += `linked-ref: (none — package.json does not have a harness.linkedRef field)\n`;
  }

  process.stdout.write(out);
}

// ---------------------------------------------------------------------------
// Subcommand: plan-review-hash (CS35b decision C35b-2)
// ---------------------------------------------------------------------------

async function cmdPlanReviewHash(args, _global) {
  let filePath = null;

  for (const a of args) {
    if (a === '--help' || a === '-h') {
      process.stdout.write(SUBCOMMAND_HELP['plan-review-hash']);
      process.exit(0);
    } else if (a.startsWith('-')) {
      die(`Unknown flag: ${a}\n\n${SUBCOMMAND_HELP['plan-review-hash']}`, 2);
    } else if (filePath === null) {
      filePath = a;
    } else {
      die(
        `harness plan-review-hash: too many positional arguments (got "${a}")\n` +
        SUBCOMMAND_HELP['plan-review-hash'],
        2
      );
    }
  }

  if (!filePath) {
    die(
      `harness plan-review-hash: <file> argument is required\n\n` +
      SUBCOMMAND_HELP['plan-review-hash'],
      2
    );
  }

  if (!existsSync(filePath)) {
    die(`harness plan-review-hash: file not found: ${filePath}`, 1);
  }

  const { computePlanReviewHash } = await import('../lib/plan-review-hash.mjs');
  const hash = computePlanReviewHash(filePath);
  process.stdout.write(`${hash}\n`);
}

// ---------------------------------------------------------------------------
// Subcommand: review-output (CS40 — closes #145 gap #3)
// ---------------------------------------------------------------------------
//
// Thin pass-through to scripts/check-review-output.mjs. All flags forwarded
// verbatim. Per C40-8, this is a STANDALONE entry point — it is NOT part of
// the `harness pr-evidence` aggregator because the reviewer-output file is
// not available in CI. It is invoked by orchestrators after capturing the
// reviewer's output (typically via the dispatched-reviewer pattern in
// OPERATIONS.md § Reviewer dispatch).

async function cmdReviewOutput(args, _global) {
  // --help is forwarded verbatim to the script which prints its own HELP.
  // We surface SUBCOMMAND_HELP['review-output'] only when invoked via
  // `harness review-output --help` at the top level (i.e. before reaching
  // the script), to keep the "harness <subcmd> --help" UX consistent.
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    process.stdout.write(SUBCOMMAND_HELP['review-output']);
    process.exit(0);
  }
  const scriptPath = path.join(REPO_ROOT, 'scripts', 'check-review-output.mjs');
  const r = spawnSync('node', [scriptPath, ...args], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

// ---------------------------------------------------------------------------
// Subcommand: copilot-engage (CS41 — A16 engagement helper)
// ---------------------------------------------------------------------------

async function cmdReview(args, global) {
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(SUBCOMMAND_HELP.review);
    process.exit(0);
  }

  let parsed;
  try {
    parsed = parseReviewArgs(args, global.cwd);
  } catch (err) {
    if (err instanceof ReviewError) {
      die(`review: ${err.message}\n\n${SUBCOMMAND_HELP.review}`, 2);
    }
    throw err;
  }

  const actor = deriveReviewActor(global.cwd, global.config);
  const promptRubberDuck = parsed.noPoll || parsed.copilotOnly || parsed.dryRun
    ? null
    : async (prompt) => {
        process.stdout.write(`${prompt}\n`);
        process.stderr.write(
          '\nreview: dispatch the prompt above to the approved rubber-duck reviewer, ' +
          'then paste the structured reviewer output to stdin and send EOF.\n',
        );
        const pasted = await readAllStdin();
        if (!pasted.trim()) {
          throw new ReviewError('no rubber-duck reviewer output was provided on stdin', 'manual-input-required');
        }
        return pasted;
      };

  try {
    const result = await runReview({
      cwd: global.cwd,
      configPath: global.config,
      repo: parsed.repo,
      prNumber: parsed.prNumber,
      reviewerModel: parsed.model,
      round: parsed.round,
      rubberDuckOnly: parsed.rubberDuckOnly,
      copilotOnly: parsed.copilotOnly,
      dryRun: parsed.dryRun,
      noPoll: parsed.noPoll,
      timeoutMinutes: parsed.timeoutMinutes,
      actor,
      reviewerAgent: actor,
      promptRubberDuck,
    });

    if (result.status === 'dry-run') {
      process.stdout.write(
        `review: dry-run for ${result.repo}#${result.prNumber}\n` +
        `  reviewer model: ${result.reviewerModel}\n` +
        `  round: ${result.round}\n` +
        result.actions.map((action) => `  - would ${action}`).join('\n') + '\n',
      );
    } else if (result.status === 'dispatched') {
      if (result.rubberDuckPrompt) {
        process.stdout.write(`${result.rubberDuckPrompt}\n`);
      }
      process.stdout.write(
        `review: dispatched ${result.round} for ${result.repo}#${result.prNumber}; polling skipped (--no-poll)\n`,
      );
    } else {
      process.stdout.write(
        `review: ${result.verdict.outcome} for ${result.repo}#${result.prNumber} ` +
        `(${result.round}, model=${result.reviewerModel})\n`,
      );
    }
    process.exit(0);
  } catch (err) {
    if (err instanceof ReviewError) {
      const code = reviewExitCode(err);
      process.stderr.write(`review: ${err.message}\n`);
      if (err.prompt) process.stderr.write(`${err.prompt}\n`);
      process.exit(code);
    }
    throw err;
  }
}

function parseReviewArgs(args, cwd) {
  let prRaw = null;
  let repo = null;
  let rubberDuckOnly = false;
  let copilotOnly = false;
  let model = null;
  let round = null;
  let dryRun = false;
  let noPoll = false;
  let timeoutMinutes = null;

  const requireValue = (i, flagName) => {
    if (i + 1 >= args.length || args[i + 1].startsWith('-')) {
      throw new ReviewError(`${flagName} requires a value`, 'bad-input');
    }
    return args[i + 1];
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--repo') {
      repo = requireValue(i, '--repo');
      i++;
    } else if (a.startsWith('--repo=')) {
      repo = a.slice('--repo='.length);
    } else if (a === '--rubber-duck-only') {
      rubberDuckOnly = true;
    } else if (a === '--copilot-only') {
      copilotOnly = true;
    } else if (a === '--model') {
      model = requireValue(i, '--model');
      i++;
    } else if (a.startsWith('--model=')) {
      model = a.slice('--model='.length);
    } else if (a === '--round') {
      round = requireValue(i, '--round');
      i++;
    } else if (a.startsWith('--round=')) {
      round = a.slice('--round='.length);
    } else if (a === '--dry-run') {
      dryRun = true;
    } else if (a === '--no-poll') {
      noPoll = true;
    } else if (a === '--timeout-minutes') {
      timeoutMinutes = Number(requireValue(i, '--timeout-minutes'));
      i++;
    } else if (a.startsWith('--timeout-minutes=')) {
      timeoutMinutes = Number(a.slice('--timeout-minutes='.length));
    } else if (!a.startsWith('-') && prRaw === null) {
      prRaw = a;
    } else if (!a.startsWith('-')) {
      throw new ReviewError(`unexpected positional argument '${a}'`, 'bad-input');
    } else {
      throw new ReviewError(`unknown flag: ${a}`, 'bad-input');
    }
  }

  if (prRaw === null) throw new ReviewError('<pr> is required', 'bad-input');
  const prNumber = Number.parseInt(prRaw, 10);
  if (!/^\d+$/.test(prRaw) || !Number.isInteger(prNumber) || prNumber < 1) {
    throw new ReviewError(`<pr> must be a positive integer; got '${prRaw}'`, 'bad-input');
  }
  if (rubberDuckOnly && copilotOnly) {
    throw new ReviewError('--rubber-duck-only and --copilot-only cannot be combined', 'bad-input');
  }
  if (model !== null && !['gpt-5.5', 'sonnet-4.6'].includes(model)) {
    throw new ReviewError(`--model must be one of: gpt-5.5, sonnet-4.6; got '${model}'`, 'bad-input');
  }
  if (round !== null && !/^R\d+$/.test(round)) {
    throw new ReviewError(`--round must match R<n> (for example R1); got '${round}'`, 'bad-input');
  }
  if (timeoutMinutes !== null && (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0)) {
    throw new ReviewError('--timeout-minutes must be a positive number', 'bad-input');
  }
  if (repo !== null && !parseRepoSlug(repo)) {
    throw new ReviewError(`--repo must be 'owner/repo'; got '${repo}'`, 'bad-input');
  }

  return { prNumber, repo, rubberDuckOnly, copilotOnly, model, round, dryRun, noPoll, timeoutMinutes };
}

function deriveReviewActor(cwd, configOverride) {
  const cfg = loadConfig(cwd, configOverride);
  const suffix = cfg?.project?.agent_suffix;
  if (!suffix) return process.env.GITHUB_ACTOR || 'harness-review';
  const envName = cfg?.project?.agent_env_var ?? `HARNESS_AGENT_${suffix.toUpperCase()}_MACHINE`;
  const machine = process.env[envName] ?? machineShortFromHostname(os.hostname());
  const cloneSuffix = cloneSuffixFromDir(cwd);
  return `${machine}-${suffix}${cloneSuffix ? `-${cloneSuffix}` : ''}`;
}

function readAllStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
    process.stdin.resume();
  });
}

function reviewExitCode(err) {
  if (err.kind === 'no-go') return 1;
  return 2;
}

async function cmdCopilotEngage(args, global) {
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(SUBCOMMAND_HELP['copilot-engage']);
    process.exit(0);
  }

  const parsed = parseCopilotEngageArgs(args, global.cwd);
  const [owner, repo] = parsed.repo.split('/');
  const headSha = detectGitHead(global.cwd);

  if (!parsed.json && !parsed.quiet) {
    process.stdout.write(
      `copilot-engage: requesting ${owner}/${repo}#${parsed.prNumber} at HEAD ${shortDisplaySha(headSha)}\n`,
    );
  }

  try {
    const result = await engageCopilot({
      owner,
      repo,
      prNumber: parsed.prNumber,
      opts: {
        headSha,
        timeoutMs: parsed.timeoutMs,
        intervalMs: parsed.intervalMs,
        noPoll: parsed.noPoll,
        cacheDir: parsed.cacheDir,
        cacheTtlMs: parsed.cacheTtlMs,
        submittedAfter: parsed.submittedAfter,
        onPoll: parsed.quiet || parsed.json
          ? undefined
          : ({ attempts, polledMs }) => {
              process.stdout.write(
                `copilot-engage: poll ${attempts} (${Math.floor(polledMs / 1000)}s elapsed): ` +
                  `waiting for Copilot review at HEAD ${shortDisplaySha(headSha)}\n`,
              );
            },
      },
    });

    if (parsed.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } else if (result.review) {
      process.stdout.write(
        `copilot-engage: ${result.login} review ${result.review.state} at ` +
          `${shortDisplaySha(result.review.commit.oid)} submitted ${result.review.submittedAt}\n`,
      );
    } else {
      process.stdout.write(`copilot-engage: ${result.login} review requested; polling skipped\n`);
    }
    process.exit(0);
  } catch (err) {
    if (err instanceof EngageError) {
      const code = copilotEngageExitCode(err);
      if (parsed.json) {
        process.stderr.write(JSON.stringify({ error: err.message, kind: err.kind }, null, 2) + '\n');
      } else if (err.kind === 'cache-write-failed') {
        // CS45 C45-3: tailor the message so the user sees the --cache-dir
        // escape hatch immediately. Preserve the typed-error message body
        // so the offending path + syscall remain visible.
        process.stderr.write(
          `copilot-engage: cache write failed: ${err.message}\n` +
          `Hint: pass --cache-dir <writable-path> to override the default ~/.cache/harness/ location.\n`,
        );
      } else {
        process.stderr.write(`copilot-engage: ${err.message}\n`);
      }
      process.exit(code);
    }
    throw err;
  }
}

function parseCopilotEngageArgs(args, cwd) {
  let repo = null;
  let prRaw = null;
  let timeoutSeconds = 300;
  let intervalSeconds = 30;
  let noPoll = false;
  let cacheDir = null;
  let cacheTtlDays = 7;
  let quiet = false;
  let json = false;
  let submittedAfter = null;

  function requireValue(i, flagName) {
    if (i + 1 >= args.length || args[i + 1].startsWith('-')) {
      die(`copilot-engage: missing value for ${flagName}\n\n${SUBCOMMAND_HELP['copilot-engage']}`, 2);
    }
    return args[i + 1];
  }

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--repo') {
      repo = requireValue(i, '--repo');
      i++;
    } else if (a.startsWith('--repo=')) {
      repo = a.slice('--repo='.length);
    } else if (a === '--poll-timeout') {
      timeoutSeconds = parseFiniteNumber(requireValue(i, '--poll-timeout'), '--poll-timeout');
      i++;
    } else if (a.startsWith('--poll-timeout=')) {
      timeoutSeconds = parseFiniteNumber(a.slice('--poll-timeout='.length), '--poll-timeout');
    } else if (a === '--poll-interval') {
      intervalSeconds = parseFiniteNumber(requireValue(i, '--poll-interval'), '--poll-interval');
      i++;
    } else if (a.startsWith('--poll-interval=')) {
      intervalSeconds = parseFiniteNumber(a.slice('--poll-interval='.length), '--poll-interval');
    } else if (a === '--no-poll') {
      noPoll = true;
    } else if (a === '--cache-dir') {
      cacheDir = path.resolve(cwd, requireValue(i, '--cache-dir'));
      i++;
    } else if (a.startsWith('--cache-dir=')) {
      cacheDir = path.resolve(cwd, a.slice('--cache-dir='.length));
    } else if (a === '--cache-ttl') {
      cacheTtlDays = parseFiniteNumber(requireValue(i, '--cache-ttl'), '--cache-ttl');
      i++;
    } else if (a.startsWith('--cache-ttl=')) {
      cacheTtlDays = parseFiniteNumber(a.slice('--cache-ttl='.length), '--cache-ttl');
    } else if (a === '--quiet') {
      quiet = true;
    } else if (a === '--json') {
      json = true;
    } else if (a === '--submitted-after') {
      submittedAfter = requireValue(i, '--submitted-after');
      i++;
    } else if (a.startsWith('--submitted-after=')) {
      submittedAfter = a.slice('--submitted-after='.length);
    } else if (!a.startsWith('-') && prRaw === null) {
      prRaw = a;
    } else if (!a.startsWith('-')) {
      die(`copilot-engage: unexpected positional argument '${a}'\n\n${SUBCOMMAND_HELP['copilot-engage']}`, 2);
    } else {
      die(`copilot-engage: unknown flag: ${a}\n\n${SUBCOMMAND_HELP['copilot-engage']}`, 2);
    }
  }

  if (prRaw === null) {
    die(`copilot-engage: <pr> is required\n\n${SUBCOMMAND_HELP['copilot-engage']}`, 2);
  }
  const prNumber = Number.parseInt(prRaw, 10);
  if (!/^\d+$/.test(prRaw) || !Number.isInteger(prNumber) || prNumber < 1) {
    die(`copilot-engage: <pr> must be a positive integer; got '${prRaw}'`, 2);
  }
  if (timeoutSeconds < 0) {
    die(`copilot-engage: --poll-timeout must be non-negative seconds`, 2);
  }
  if (intervalSeconds <= 0) {
    die(`copilot-engage: --poll-interval must be positive seconds`, 2);
  }
  if (cacheTtlDays < 0) {
    die(`copilot-engage: --cache-ttl must be non-negative days`, 2);
  }

  repo = repo || detectGitHubRepo(cwd);
  if (!parseRepoSlug(repo)) {
    die(`copilot-engage: --repo must be 'owner/repo'; got '${repo}'`, 2);
  }

  if (submittedAfter !== null) {
    const submittedAfterMs = Date.parse(submittedAfter);
    if (!Number.isFinite(submittedAfterMs)) {
      die(`copilot-engage: --submitted-after must be an ISO-8601 timestamp; got '${submittedAfter}'`, 2);
    }
    submittedAfter = new Date(submittedAfterMs).toISOString();
  }

  return {
    repo,
    prNumber,
    timeoutMs: timeoutSeconds * 1000,
    intervalMs: intervalSeconds * 1000,
    noPoll,
    cacheDir,
    cacheTtlMs: cacheTtlDays * 24 * 60 * 60 * 1000,
    quiet,
    json,
    submittedAfter,
  };
}

function parseFiniteNumber(raw, flagName) {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    die(`copilot-engage: ${flagName} must be a number; got '${raw}'`, 2);
  }
  return value;
}

function detectGitHubRepo(cwd) {
  const r = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd, encoding: 'utf8' });
  if (r.status !== 0) {
    die(
      `copilot-engage: --repo is required when git remote 'origin' cannot be read. ` +
        `Pass --repo <owner/repo>.`,
      2,
    );
  }
  const repo = parseGitHubRemote(r.stdout.trim());
  if (!repo) {
    die(
      `copilot-engage: could not parse GitHub repo from origin remote '${r.stdout.trim()}'. ` +
        `Pass --repo <owner/repo>.`,
      2,
    );
  }
  return repo;
}

function detectGitHead(cwd) {
  const r = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' });
  if (r.status !== 0) {
    die(`copilot-engage: could not detect current HEAD via 'git rev-parse HEAD'`, 2);
  }
  const head = r.stdout.trim();
  if (!/^[0-9a-f]{40}$/i.test(head)) {
    die(`copilot-engage: git rev-parse HEAD returned an invalid SHA: '${head}'`, 2);
  }
  return head;
}

function parseGitHubRemote(remote) {
  const sshPrefix = 'git@github.com:';
  const httpsPrefix = 'https://github.com/';
  let slug = null;
  if (remote.startsWith(sshPrefix)) {
    slug = remote.slice(sshPrefix.length);
  } else if (remote.startsWith(httpsPrefix)) {
    slug = remote.slice(httpsPrefix.length).split(/[?#]/, 1)[0];
  }
  if (!slug) return null;
  if (slug.endsWith('.git')) slug = slug.slice(0, -4);
  return parseRepoSlug(slug);
}

function parseRepoSlug(slug) {
  const parts = slug.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return `${parts[0]}/${parts[1]}`;
}

function copilotEngageExitCode(err) {
  if (err.kind === 'fork-source' || err.kind === 'bad-input') return 2;
  if (err.kind === 'timeout') return 3;
  if (err.kind === 'auth-missing' || err.kind === 'network') return 4;
  // CS45 C45-3: dedicated exit code for filesystem cache-write failures,
  // distinct from network/auth (kind=4) so consumers can branch on it.
  if (err.kind === 'cache-write-failed') return 5;
  return 4;
}

function shortDisplaySha(sha) {
  return typeof sha === 'string' && sha.length > 7 ? sha.slice(0, 7) : String(sha);
}

// ---------------------------------------------------------------------------
// Subcommand: pr-evidence (CS36 — B1, A3, A4, A6)
// ---------------------------------------------------------------------------
//
// Aggregates mechanical PR-state evidence gates against a PR's commit graph
// and body markdown. Per C35-17, this is a SEPARATE entry point from
// `harness lint` because PR-state checks need PR context (--base/--head/
// --pr-body) and shouldn't fire on default `harness lint` runs.
//
// Skip semantics (C35-19/C36-5) are centralised here and short-circuit gates
// per the documented matrix; the harness MUST NOT call `gh pr view` to
// determine skip applicability — caller (CI workflow or orchestrator)
// computes and passes via --skip-reasons.

async function cmdPrEvidence(args, _global) {
  let base = null;
  let head = null;
  let prBody = null;
  let repo = null;
  let pr = null;
  let skipReasonsCsv = '';
  let json = false;
  let quiet = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') {
      process.stdout.write(SUBCOMMAND_HELP['pr-evidence']);
      process.exit(0);
    } else if (a === '--base') {
      base = args[++i];
    } else if (a === '--head') {
      head = args[++i];
    } else if (a === '--pr-body') {
      prBody = args[++i];
    } else if (a === '--repo') {
      repo = args[++i];
    } else if (a === '--pr') {
      pr = args[++i];
    } else if (a === '--skip-reasons') {
      skipReasonsCsv = args[++i] || '';
    } else if (a === '--json') {
      json = true;
    } else if (a === '--quiet') {
      quiet = true;
    } else {
      die(`harness pr-evidence: unknown flag: ${a}\n\n${SUBCOMMAND_HELP['pr-evidence']}`, 2);
    }
  }

  if (!base) die(`harness pr-evidence: --base <sha> is required\n\n${SUBCOMMAND_HELP['pr-evidence']}`, 2);
  if (!head) die(`harness pr-evidence: --head <sha> is required\n\n${SUBCOMMAND_HELP['pr-evidence']}`, 2);
  if (!prBody) die(`harness pr-evidence: --pr-body <file> is required\n\n${SUBCOMMAND_HELP['pr-evidence']}`, 2);
  if (!existsSync(prBody)) die(`harness pr-evidence: --pr-body file not found: ${prBody}`, 2);

  const skipReasons = new Set(skipReasonsCsv.split(',').map((s) => s.trim()).filter(Boolean));

  // workboard-only short-circuits ALL gates per C35-7 / C36-5.
  if (skipReasons.has('workboard-only')) {
    if (json) {
      process.stdout.write(JSON.stringify({ gates: [], skipped: 'workboard-only' }, null, 2) + '\n');
    } else {
      if (!quiet) {
        process.stdout.write('harness pr-evidence: skipped (workboard-only PR)\n');
      }
      process.stdout.write('harness pr-evidence: 0 passed, 0 failed (skipped)\n');
    }
    process.exit(0);
  }

  const cwd = process.cwd();
  const skipArgs = skipReasonsCsv ? ['--skip-reasons', skipReasonsCsv] : [];

  // Build the gate list. Each entry: { name, script, args }.
  const gates = [];

  gates.push({
    name: 'B1 commit-trailers',
    script: 'check-pr-commits.mjs',
    args: ['--base', base, '--head', head, ...skipArgs],
  });

  gates.push({
    name: 'A3+A4 review-evidence',
    script: 'check-review-evidence.mjs',
    args: ['--pr-body', prBody, '--head', head, ...skipArgs],
  });

  // A6 (plan-review attestation) — diff-scoped per C36-11.
  // Compute the planned/active CS files in the PR diff. The aggregator
  // skips A6 when the diff list is empty (no CS file changes mean no
  // attestation requirement — orthogonal to the gate's intent).
  const diffArgs = [
    'diff', '--name-only', `${base}..${head}`,
    '--', 'project/clickstops/planned/', 'project/clickstops/active/',
  ];
  const diffResult = spawnSync('git', diffArgs, { cwd, encoding: 'utf8' });
  if (diffResult.status === 0) {
    const changedFiles = diffResult.stdout
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (changedFiles.length > 0) {
      gates.push({
        name: 'A6 plan-review-attestation',
        script: 'check-clickstop-plan-review.mjs',
        args: [
          '--dir', 'project/clickstops',
          '--mode', 'pr-evidence',
          '--files', changedFiles.join(','),
          ...skipArgs,
        ],
      });
    } else if (!quiet && !json) {
      process.stdout.write('A6 plan-review-attestation: skipped (no planned/active CS files in PR diff)\n');
    }
  } else if (!quiet) {
    process.stderr.write(
      `harness pr-evidence: warning — could not compute planned/active diff ` +
      `(git exit ${diffResult.status}); A6 not registered. ` +
      `Ensure both base and head SHAs are fetched locally.\n`
    );
  }

  // A5 + A16 (Copilot review gate) — CS37. Requires --repo + --pr to query GitHub
  // GraphQL. Skip with a notice when either is missing (e.g. local dogfood without
  // a real PR context).
  if (repo && pr) {
    gates.push({
      name: 'A5+A16 copilot-review',
      script: 'check-copilot-review.mjs',
      args: ['--repo', repo, '--pr', pr, '--head', head, '--pr-body', prBody, ...skipArgs],
    });
  } else if (!quiet && !json) {
    process.stdout.write(
      'A5+A16 copilot-review: skipped (--repo and --pr are required to query GitHub GraphQL)\n',
    );
  }

  // Run gates in series.
  const results = [];
  let anyFail = false;
  for (const gate of gates) {
    const scriptPath = path.join(REPO_ROOT, 'scripts', gate.script);
    if (!existsSync(scriptPath)) {
      results.push({
        name: gate.name,
        status: 'fail',
        exitCode: 2,
        message: `gate script missing: ${scriptPath}`,
      });
      anyFail = true;
      continue;
    }
    const fullArgs = [scriptPath, ...gate.args];
    if (quiet) fullArgs.push('--quiet');
    if (!quiet && !json) {
      process.stdout.write(`\n[${gate.name}]\n`);
    }
    const result = spawnSync(process.execPath, fullArgs, {
      cwd,
      encoding: 'utf8',
      stdio: json ? 'pipe' : (quiet ? 'pipe' : 'inherit'),
    });
    const exitCode = result.status ?? 1;
    const passed = exitCode === 0;
    if (!passed) anyFail = true;
    results.push({
      name: gate.name,
      status: passed ? 'pass' : 'fail',
      exitCode,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
    });
  }

  if (json) {
    const payload = {
      gates: results.map(({ name, status, exitCode, message }) => ({
        name, status, exitCode, ...(message ? { message } : {}),
      })),
    };
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  } else {
    process.stdout.write('\n=== harness pr-evidence summary ===\n');
    for (const r of results) {
      const icon = r.status === 'pass' ? '✓' : '✗';
      process.stdout.write(`  ${icon} ${r.name}: ${r.status}${r.message ? ` (${r.message})` : ''}\n`);
    }
    const passCount = results.filter((r) => r.status === 'pass').length;
    const failCount = results.filter((r) => r.status === 'fail').length;
    process.stdout.write(`\nTotal: ${passCount} passed, ${failCount} failed\n`);
  }

  process.exit(anyFail ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Subcommand: cross-repo (CS56)
// ---------------------------------------------------------------------------

async function cmdCrossRepo(args, global) {
  const { cwd } = global;

  // Help can appear anywhere; intercept early.
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(SUBCOMMAND_HELP['cross-repo']);
    process.exit(0);
  }

  const action = args[0];
  if (!action || action.startsWith('-')) {
    process.stderr.write(`cross-repo: action is required\n\n${SUBCOMMAND_HELP['cross-repo']}`);
    process.exit(2);
  }
  if (action !== 'open-issue') {
    process.stderr.write(`cross-repo: unknown action '${action}' (only 'open-issue' is supported)\n\n${SUBCOMMAND_HELP['cross-repo']}`);
    process.exit(2);
  }

  const actionArgs = args.slice(1);

  let repo = null;
  let title = null;
  let bodyFile = null;
  const labels = [];

  // Shared extractor honors D56-6 for BOTH `--flag value` and `--flag=value`:
  // the value must exist, must not be empty, and must not start with '-'
  // (which would indicate the next flag was consumed as a value).
  function extractValue(flag, eqValue, i) {
    let value;
    if (eqValue !== null) {
      value = eqValue;
    } else if (i + 1 >= actionArgs.length) {
      process.stderr.write(`cross-repo open-issue: missing value for ${flag}\n\n${SUBCOMMAND_HELP['cross-repo']}`);
      process.exit(2);
    } else {
      value = actionArgs[i + 1];
    }
    if (value === '' || value.startsWith('-')) {
      process.stderr.write(`cross-repo open-issue: invalid value for ${flag}: ${JSON.stringify(value)}\n\n${SUBCOMMAND_HELP['cross-repo']}`);
      process.exit(2);
    }
    return value;
  }

  for (let i = 0; i < actionArgs.length; i++) {
    const a = actionArgs[i];
    let flag = null;
    let eqValue = null;
    if (a === '--repo' || a === '--title' || a === '--body-file' || a === '--label') {
      flag = a;
    } else if (a.startsWith('--repo=')) {
      flag = '--repo'; eqValue = a.slice('--repo='.length);
    } else if (a.startsWith('--title=')) {
      flag = '--title'; eqValue = a.slice('--title='.length);
    } else if (a.startsWith('--body-file=')) {
      flag = '--body-file'; eqValue = a.slice('--body-file='.length);
    } else if (a.startsWith('--label=')) {
      flag = '--label'; eqValue = a.slice('--label='.length);
    } else {
      process.stderr.write(`cross-repo open-issue: unknown flag: ${a}\n\n${SUBCOMMAND_HELP['cross-repo']}`);
      process.exit(2);
    }
    const value = extractValue(flag, eqValue, i);
    if (flag === '--repo') repo = value;
    else if (flag === '--title') title = value;
    else if (flag === '--body-file') bodyFile = value;
    else if (flag === '--label') labels.push(value);
    if (eqValue === null) i++;
  }

  if (repo === null) {
    process.stderr.write(`cross-repo open-issue: --repo is required\n\n${SUBCOMMAND_HELP['cross-repo']}`);
    process.exit(2);
  }
  if (title === null) {
    process.stderr.write(`cross-repo open-issue: --title is required\n\n${SUBCOMMAND_HELP['cross-repo']}`);
    process.exit(2);
  }
  if (bodyFile === null) {
    process.stderr.write(`cross-repo open-issue: --body-file is required\n\n${SUBCOMMAND_HELP['cross-repo']}`);
    process.exit(2);
  }

  // Validate title/labels here (in addition to lib-side) so blank/whitespace
  // values get a usage error (exit 2) instead of an operation error (exit 1).
  if (title.trim() === '') {
    process.stderr.write(`cross-repo open-issue: --title must be non-empty (after trimming)\n\n${SUBCOMMAND_HELP['cross-repo']}`);
    process.exit(2);
  }
  for (const label of labels) {
    if (label.trim() === '') {
      process.stderr.write(`cross-repo open-issue: --label values must be non-empty (after trimming)\n\n${SUBCOMMAND_HELP['cross-repo']}`);
      process.exit(2);
    }
  }

  // Resolve --body-file relative to the consumer cwd.
  const resolvedBodyFile = path.isAbsolute(bodyFile) ? bodyFile : path.resolve(cwd, bodyFile);

  // SECURITY: Constrain --body-file to the working tree to prevent the agent
  // from exfiltrating arbitrary local files (e.g. ~/.ssh/id_rsa, /etc/passwd)
  // via a relative `../../secret` path or a symlink that escapes cwd. Both
  // sides resolved through realpath so symlink-based escapes are also rejected.
  // Files that do not yet exist fail the realpath check; they will subsequently
  // fail validateBodyFile() in the library with a clearer body-file-missing
  // message, which is fine — both outcomes refuse the operation.
  try {
    const realCwd = realpathSync(cwd);
    const realBody = realpathSync(resolvedBodyFile);
    const rel = path.relative(realCwd, realBody);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      process.stderr.write(
        `cross-repo open-issue: --body-file must live inside the working tree (cwd=${realCwd}); refused: ${resolvedBodyFile}\n`
      );
      process.exit(2);
    }
  } catch (err) {
    // If realpath fails because the body file doesn't exist, fall through
    // to validateBodyFile() in the library, which raises body-file-missing.
    if (err.code !== 'ENOENT') {
      process.stderr.write(`cross-repo open-issue: failed to resolve --body-file path: ${err.message}\n`);
      process.exit(1);
    }
  }

  let result;
  try {
    result = crossRepoOpenIssue({ repo, title, bodyFile: resolvedBodyFile, labels });
  } catch (err) {
    if (err instanceof CrossRepoError) {
      // bad-input is a usage error (exit 2); everything else is operation failure (exit 1).
      if (err.kind === 'bad-input') {
        process.stderr.write(`cross-repo open-issue: ${err.message}\n`);
        process.exit(2);
      }
      process.stderr.write(`cross-repo open-issue: ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  process.stdout.write(`${result.url}\n`);
  if (!result.created) {
    process.stderr.write('existing open issue matched; no new issue created\n');
  }
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Subcommand: whoami
// ---------------------------------------------------------------------------

async function cmdWhoami(args, global) {
  const { cwd, config: configOverride } = global;

  let explain = false;

  for (const a of args) {
    if (a === '--help' || a === '-h') {
      process.stdout.write(SUBCOMMAND_HELP['whoami']);
      process.exit(0);
    } else if (a === '--explain') {
      explain = true;
    } else {
      die(`Unknown flag: ${a}\n\n${SUBCOMMAND_HELP['whoami']}`, 2);
    }
  }

  // Validate --config path if explicitly provided
  if (configOverride !== null) {
    if (!existsSync(configOverride)) {
      die(`--config path does not exist: ${configOverride}`, 2);
    }
    const s = statSync(configOverride);
    if (!s.isFile()) {
      die(`--config must be a file: ${configOverride}`, 2);
    }
  }

  // Load config for agent_suffix
  const cfg = loadConfig(cwd, configOverride);
  const agentSuffix = cfg?.project?.agent_suffix ?? null;

  if (!agentSuffix) {
    die('harness whoami: cannot resolve agent ID — missing harness.config.json or project.agent_suffix', 2);
  }

  const agentEnvVarName = cfg?.project?.agent_env_var
    ?? `HARNESS_AGENT_${agentSuffix.toUpperCase()}_MACHINE`;

  // Derive machine-short
  const hostname = os.hostname();
  const machineShortDerived = machineShortFromHostname(hostname);
  const envVarValue = process.env[agentEnvVarName] ?? null;
  const machineShort = envVarValue ?? machineShortDerived;

  // Derive clone index from consumer cwd (Decision #20)
  const cloneSuffix = cloneSuffixFromDir(cwd);

  // Build agent ID
  let agentId = `${machineShort}-${agentSuffix}`;
  if (cloneSuffix) agentId += `-${cloneSuffix}`;

  if (explain) {
    process.stdout.write(`hostname:       ${hostname}\n`);
    process.stdout.write(`machine-short:  ${machineShortDerived} (derived from hostname)\n`);
    process.stdout.write(`env-var-name:   ${agentEnvVarName}\n`);
    process.stdout.write(`env-var-value:  ${envVarValue ?? '(not set)'}\n`);
    process.stdout.write(`effective-machine-short: ${machineShort}\n`);
    process.stdout.write(`config-suffix:  ${agentSuffix}\n`);
    process.stdout.write(`consumer-cwd:   ${cwd}\n`);
    process.stdout.write(`clone-suffix:   ${cloneSuffix ?? '(none)'}\n`);
    process.stdout.write(`agent-id:       ${agentId}\n`);
  } else {
    process.stdout.write(`${agentId}\n`);
  }
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

async function main() {
  const global = parseGlobalArgs();
  const { subcommand, rest, help, debug } = global;

  if (help && !subcommand) {
    process.stdout.write(TOP_HELP);
    process.exit(0);
  }

  if (!subcommand) {
    process.stderr.write(TOP_HELP);
    process.exit(2);
  }

  // CS30 / D2: support `harness lint:NAME` as a shorthand for
  // `harness lint --only NAME`. Restricted to a conservative regex so it
  // can't shadow a future legitimate subcommand. The alias rewrites
  // `subcommand` to `lint` and prepends `--only NAME` to `rest`.
  let effectiveSubcommand = subcommand;
  let effectiveRest = rest;
  const lintAliasMatch = /^lint:([a-z][a-z0-9-]+)$/.exec(subcommand);
  if (lintAliasMatch) {
    effectiveSubcommand = 'lint';
    effectiveRest = ['--only', lintAliasMatch[1], ...rest];
  }

  const dispatch = {
    init: cmdInit,
    sync: cmdSync,
    check: cmdCheck,
    lint: cmdLint,
    harvest: cmdHarvest,
    'check-migration': cmdCheckMigration,
    'composed-audit': cmdComposedAudit,
    'cross-repo': cmdCrossRepo,
    pack: cmdPack,
    'pr-evidence': cmdPrEvidence,
    'review-output': cmdReviewOutput,
    review: cmdReview,
    'copilot-engage': cmdCopilotEngage,
    'plan-review-hash': cmdPlanReviewHash,
    version: cmdVersion,
    whoami: cmdWhoami,
  };

  const handler = dispatch[effectiveSubcommand];
  if (!handler) {
    process.stderr.write(`Unknown subcommand: "${subcommand}"\n\n${TOP_HELP}`);
    process.exit(2);
  }

  // Blocker 2 historical (LRN-027): the --config flag was previously parsed but
  // silently ignored, then rejected with a stop-gap exit-2 in CS04 close-out.
  // CS15c (CS04b) closes the gap by threading --config through cmdSync. The
  // stop-gap removed; cmdSync now passes global.config into syncFn as configPath.

  // If --help was a global flag but a subcommand is present, forward it to the subcommand.
  const subArgs = help ? ['--help', ...effectiveRest] : effectiveRest;

  try {
    await handler(subArgs, global);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    if (debug) process.stderr.write(err.stack + '\n');
    process.exit(1);
  }
}

main();
