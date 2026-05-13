#!/usr/bin/env node
/**
 * scripts/check-copilot-review.mjs — A5 (review ordering) + A16 (Copilot review presence) gate.
 *
 * For a given PR identified by --repo + --pr, queries GitHub GraphQL for the review list, and:
 *
 * - **A16 presence** (per ADR 0004 § ADR4-5): at least one review by `copilot-pull-request-reviewer`
 *   (Bot type) with `state ∈ {APPROVED, COMMENTED, CHANGES_REQUESTED}` and `commit.oid == --head`.
 *   PENDING does not satisfy.
 *
 * - **A5 ordering** (per ADR 0004 § ADR4-4): the latest Copilot review's `submittedAt` MUST be
 *   ≥ the latest `## Review log` Go-row timestamp (parsed from --pr-body). Combines A4 currency
 *   into a single predicate: the same review must also satisfy A16 (commit.oid == --head).
 *
 * Usage:
 *   node scripts/check-copilot-review.mjs --repo <owner/repo> --pr <num> --head <sha>
 *     [--pr-body <file>] [--skip-reasons <csv>] [--quiet] [--help]
 *
 * Exit codes:
 *   0 — A5 + A16 both pass (or skipped per skip-reasons)
 *   1 — A5 or A16 violated (Copilot review missing, stale, or out-of-order)
 *   2 — Bad usage, GraphQL/auth error, or fork-source PR (per ADR 0004 § ADR4-6)
 *
 * Tests use the exported `runCheck()` and `findLatestLocalGoTimestamp()` directly with a
 * stubbed graphqlFn — see tests/check-copilot-review.test.mjs.
 *
 * @module scripts/check-copilot-review.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { graphql, GraphQLError } from '../lib/github-graphql.mjs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const COPILOT_LOGIN = 'copilot-pull-request-reviewer';
export const ACCEPTABLE_STATES = new Set(['APPROVED', 'COMMENTED', 'CHANGES_REQUESTED']);

/** ISO 8601 instant regex (matches REVIEWS.md §2.7 timestamp format). */
export const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/** SHA40 regex (matches REVIEWS.md §2.7 analyzed_head format). */
export const SHA40_RE = /^[0-9a-f]{40}$/;

/**
 * Skip-reasons that cause this gate to exit 0 without checking GitHub at all.
 * - workboard-only: aggregator-level skip (matches CS35-19/C36-5).
 * - bot-author: A5+A16 not relevant when the implementer is a bot.
 * fork-source is NOT in this set — fork PRs exit 2 with a remediation hint per C37-6.
 */
export const SKIP_REASONS_SKIP = new Set(['workboard-only', 'bot-author']);

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

const HELP = [
  'Usage: check-copilot-review.mjs --repo <owner/repo> --pr <num> --head <sha> [options]',
  '',
  'A5 + A16 gate: verify the PR has a Copilot review at the current HEAD that was',
  'submitted after the latest local Go review. Combines #145 A4 (currency) + A5',
  '(ordering) + A16 (presence) into a single predicate per ADR 0004.',
  '',
  'Options:',
  '  --repo <owner/repo>    GitHub repo (required, e.g. henrik-me/agent-harness)',
  '  --pr <num>             PR number (required)',
  '  --head <sha>           PR HEAD SHA — Copilot review.commit.oid must match (required)',
  '  --pr-body <file>       Path to PR body markdown (for A5 ordering check). Without',
  '                         it, A16 still runs but A5 ordering is not enforced.',
  '  --skip-reasons <csv>   Comma-separated. workboard-only and bot-author: skip entirely.',
  '                         fork-source: NOT a skip — exit 2 with maintainer-rerun hint.',
  '  --quiet                Suppress per-finding output; print only the summary',
  '  --help                 Print this help text',
  '',
  'Exit codes:',
  '  0  pass (or skipped per skip-reasons)',
  '  1  Copilot review missing, stale, or violates ordering',
  '  2  bad usage, fork-source PR, or GraphQL/auth error',
  '',
].join('\n');

// ---------------------------------------------------------------------------
// Core check function (testable via direct import with DI graphqlFn)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} RunCheckOptions
 * @property {string} repo - "owner/name"
 * @property {number} prNumber
 * @property {string} headSha - 40-char hex
 * @property {string=} prBodyPath - path to PR body markdown for A5 ordering check
 * @property {Set<string>=} skipReasons
 * @property {boolean=} quiet
 * @property {function=} graphqlFn - DI for tests; defaults to the lib's graphql()
 */

/**
 * Run the A5+A16 check.
 *
 * @param {RunCheckOptions} opts
 * @returns {Promise<{exitCode: number, stdout: string[], stderr: string[]}>}
 */
export async function runCheck(opts) {
  const {
    repo,
    prNumber,
    headSha,
    prBodyPath,
    skipReasons = new Set(),
    quiet = false,
    graphqlFn = graphql,
  } = opts;

  const stdout = [];
  const stderr = [];
  const errors = [];

  function emitErr(msg) {
    errors.push(msg);
    if (!quiet) stdout.push(`ERROR: ${msg}`);
  }

  // 0. Skip handling FIRST.
  for (const reason of SKIP_REASONS_SKIP) {
    if (skipReasons.has(reason)) {
      if (!quiet) stdout.push(`check-copilot-review: skipped (${reason})`);
      stdout.push('check-copilot-review: 0 errors, 0 warnings (skipped)');
      return { exitCode: 0, stdout, stderr };
    }
  }
  if (skipReasons.has('fork-source')) {
    stderr.push(
      'check-copilot-review: fork-source PRs cannot run this gate (GITHUB_TOKEN ' +
        'is read-only on forks). Maintainer must rerun harness copilot-engage <pr> ' +
        'after pulling the branch locally.',
    );
    return { exitCode: 2, stdout, stderr };
  }

  // 0a. Required-arg validation.
  if (!repo) {
    stderr.push(`check-copilot-review: --repo <owner/repo> is required`);
    return { exitCode: 2, stdout, stderr };
  }
  const repoMatch = /^([^/]+)\/([^/]+)$/.exec(repo);
  if (!repoMatch) {
    stderr.push(`check-copilot-review: --repo must be 'owner/repo'; got '${repo}'`);
    return { exitCode: 2, stdout, stderr };
  }
  if (!prNumber || !Number.isInteger(prNumber) || prNumber < 1) {
    stderr.push(`check-copilot-review: --pr must be a positive integer; got '${prNumber}'`);
    return { exitCode: 2, stdout, stderr };
  }
  if (!headSha || !SHA40_RE.test(headSha)) {
    stderr.push(`check-copilot-review: --head must be a 40-char SHA; got '${headSha}'`);
    return { exitCode: 2, stdout, stderr };
  }

  const owner = repoMatch[1];
  const repoName = repoMatch[2];

  // 1. Query GitHub for review list + fork-source detection.
  let prData;
  try {
    prData = await graphqlFn(
      `query($owner:String!, $name:String!, $num:Int!) {
        repository(owner:$owner, name:$name) {
          pullRequest(number:$num) {
            id
            headRefOid
            isCrossRepository
            reviews(last:20) {
              nodes {
                state
                submittedAt
                commit { oid }
                author {
                  __typename
                  ... on Bot { login }
                  ... on User { login }
                }
              }
            }
          }
        }
      }`,
      { owner, name: repoName, num: prNumber },
    );
  } catch (err) {
    if (err instanceof GraphQLError && err.kind === 'auth-missing') {
      stderr.push(`check-copilot-review: ${err.message}`);
      return { exitCode: 2, stdout, stderr };
    }
    stderr.push(`check-copilot-review: GraphQL query failed: ${err.message}`);
    return { exitCode: 2, stdout, stderr };
  }

  const pr = prData.repository?.pullRequest;
  if (!pr) {
    stderr.push(
      `check-copilot-review: PR ${owner}/${repoName}#${prNumber} not found via GraphQL.`,
    );
    return { exitCode: 2, stdout, stderr };
  }

  // 2. Fork-source detection.
  if (pr.isCrossRepository) {
    stderr.push(
      `check-copilot-review: PR ${owner}/${repoName}#${prNumber} is a fork PR ` +
        `(isCrossRepository=true). GITHUB_TOKEN is read-only on forks; this gate cannot run. ` +
        `Maintainer must rerun harness copilot-engage <pr> after pulling the branch locally.`,
    );
    return { exitCode: 2, stdout, stderr };
  }

  // 3. A16 presence check.
  const allReviews = pr.reviews?.nodes ?? [];
  const copilotReviews = allReviews.filter(
    (r) =>
      r.author &&
      r.author.__typename === 'Bot' &&
      r.author.login === COPILOT_LOGIN,
  );

  if (copilotReviews.length === 0) {
    emitErr(
      `A16: no review by ${COPILOT_LOGIN} found on PR ${owner}/${repoName}#${prNumber}; ` +
        `Fix: run 'harness copilot-engage ${prNumber}' (or 'gh pr edit ${prNumber} ` +
        `--add-reviewer ${COPILOT_LOGIN}') and wait ~3-4 minutes for the review to land.`,
    );
    return summarize(errors, stdout, stderr);
  }

  const acceptableCopilotReviews = copilotReviews.filter(
    (r) => ACCEPTABLE_STATES.has(r.state) && r.commit && r.commit.oid === headSha,
  );

  if (acceptableCopilotReviews.length === 0) {
    const pending = copilotReviews.filter((r) => r.state === 'PENDING');
    const stale = copilotReviews.filter(
      (r) => ACCEPTABLE_STATES.has(r.state) && r.commit?.oid !== headSha,
    );
    if (pending.length > 0) {
      emitErr(
        `A16: latest ${COPILOT_LOGIN} review is in PENDING state ` +
          `(submitted: ${pending[pending.length - 1].submittedAt ?? 'n/a'}); ` +
          `Fix: wait for the review to submit, then re-run; if stuck, re-engage with ` +
          `'harness copilot-engage ${prNumber}'.`,
      );
    } else if (stale.length > 0) {
      const latestStale = stale[stale.length - 1];
      emitErr(
        `A16/A4: latest ${COPILOT_LOGIN} review is on stale commit ` +
          `${latestStale.commit.oid.slice(0, 7)} but PR HEAD is ${headSha.slice(0, 7)}; ` +
          `Fix: run 'harness copilot-engage ${prNumber}' to request a fresh review at the current HEAD.`,
      );
    } else {
      emitErr(
        `A16: ${COPILOT_LOGIN} review exists but neither state nor commit.oid satisfies ` +
          `(states: ${copilotReviews.map((r) => r.state).join(',')}); ` +
          `Fix: check that Copilot completed the review at HEAD ${headSha.slice(0, 7)}.`,
      );
    }
    return summarize(errors, stdout, stderr);
  }

  const latestCopilotReview = acceptableCopilotReviews.reduce((latest, r) => {
    if (!latest) return r;
    return new Date(r.submittedAt).getTime() > new Date(latest.submittedAt).getTime() ? r : latest;
  }, null);

  // 4. A5 ordering check.
  if (prBodyPath) {
    let prBodyContent;
    try {
      prBodyContent = readFileSync(prBodyPath, 'utf8');
    } catch (err) {
      stderr.push(
        `check-copilot-review: cannot read --pr-body file '${prBodyPath}': ${err.message}`,
      );
      return { exitCode: 2, stdout, stderr };
    }
    const localGoTimestamp = findLatestLocalGoTimestamp(prBodyContent);
    if (localGoTimestamp) {
      const copilotMs = new Date(latestCopilotReview.submittedAt).getTime();
      const localMs = new Date(localGoTimestamp).getTime();
      if (!(copilotMs >= localMs)) {
        emitErr(
          `A5: latest ${COPILOT_LOGIN} review (${latestCopilotReview.submittedAt}) ` +
            `was submitted BEFORE the latest local Go review (${localGoTimestamp}); ` +
            `Fix: run 'harness copilot-engage ${prNumber}' to request a fresh Copilot review ` +
            `that supersedes the local Go.`,
        );
      }
    }
  }

  return summarize(errors, stdout, stderr);
}

function summarize(errors, stdout, stderr) {
  stdout.push(
    `check-copilot-review: ${errors.length} error${errors.length === 1 ? '' : 's'}, 0 warnings`,
  );
  return { exitCode: errors.length > 0 ? 1 : 0, stdout, stderr };
}

/**
 * Parse `## Review log` from the PR body and return the most recent timestamp where verdict == 'Go'
 * (excluding any Copilot rows by actor/model). Returns null if no Go rows or no Review log section.
 *
 * @param {string} content
 * @returns {string|null}
 */
export function findLatestLocalGoTimestamp(content) {
  const lines = content.split(/\r?\n/);
  let inSection = false;
  let headerLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^## Review log\s*$/i.test(lines[i])) {
      inSection = true;
      headerLineIdx = i;
      continue;
    }
    if (inSection && /^## /.test(lines[i])) break;
  }
  if (!inSection || headerLineIdx === -1) return null;

  const rows = [];
  for (let i = headerLineIdx + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) break;
    const trimmed = lines[i].trim();
    if (!trimmed.startsWith('|')) continue;
    if (/^\|\s*-+/.test(trimmed)) continue;
    rows.push({ raw: trimmed, lineNo: i + 1 });
  }
  if (rows.length === 0) return null;

  const headerCells = rows[0].raw.split('|').slice(1, -1).map((c) => c.trim().toLowerCase());
  const tsIdx = headerCells.indexOf('timestamp');
  const actorIdx = headerCells.indexOf('actor');
  const modelIdx = headerCells.indexOf('model');
  const verdictIdx = headerCells.indexOf('verdict');
  if (tsIdx === -1 || verdictIdx === -1) return null;

  let latest = null;
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i].raw.split('|').slice(1, -1).map((c) => c.trim());
    const ts = cells[tsIdx];
    const verdict = cells[verdictIdx];
    const actor = actorIdx === -1 ? '' : cells[actorIdx] ?? '';
    const model = modelIdx === -1 ? '' : cells[modelIdx] ?? '';
    if (!ts || !ISO_TIMESTAMP_RE.test(ts)) continue;
    if (!/^Go(\b|-with-amendments)/i.test(verdict)) continue;
    // Exclude only the Copilot REVIEWER bot rows — NOT the local Copilot CLI agent
    // (which has actor="copilot" but is a distinct entity per ADR 0004 § ADR4-3).
    if (/copilot-pull-request-reviewer/i.test(actor) || /copilot-pull-request-reviewer/i.test(model)) continue;
    if (!latest || new Date(ts).getTime() > new Date(latest).getTime()) {
      latest = ts;
    }
  }
  return latest;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const isDirectInvocation =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectInvocation) {
  await runCli();
}

async function runCli() {
  let repo = null;
  let prNumberRaw = null;
  let headSha = null;
  let prBodyPath = null;
  let skipReasons = new Set();
  let quiet = false;

  function requireValue(args, i, flagName) {
    if (!args[i + 1] || args[i + 1].startsWith('-')) {
      process.stderr.write(`check-copilot-review: missing value for ${flagName}\n`);
      process.exit(2);
    }
    return args[i + 1];
  }

  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repo') {
      repo = requireValue(argv, i, '--repo');
      i++;
    } else if (a === '--pr') {
      prNumberRaw = requireValue(argv, i, '--pr');
      i++;
    } else if (a === '--head') {
      headSha = requireValue(argv, i, '--head');
      i++;
    } else if (a === '--pr-body') {
      prBodyPath = requireValue(argv, i, '--pr-body');
      i++;
    } else if (a === '--skip-reasons') {
      const csv = requireValue(argv, i, '--skip-reasons');
      skipReasons = new Set(csv.split(',').map((s) => s.trim()).filter(Boolean));
      i++;
    } else if (a === '--quiet') {
      quiet = true;
    } else if (a === '--help' || a === '-h') {
      process.stdout.write(HELP);
      process.exit(0);
    } else {
      process.stderr.write(`check-copilot-review: unknown flag: ${a}\n${HELP}`);
      process.exit(2);
    }
  }

  const prNumber = prNumberRaw === null ? null : Number.parseInt(prNumberRaw, 10);

  const result = await runCheck({
    repo,
    prNumber,
    headSha,
    prBodyPath,
    skipReasons,
    quiet,
  });

  for (const line of result.stderr) process.stderr.write(`${line}\n`);
  for (const line of result.stdout) process.stdout.write(`${line}\n`);
  process.exit(result.exitCode);
}
