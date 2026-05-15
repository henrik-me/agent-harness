#!/usr/bin/env node
/** G-RG-2: copilot-review-attached. */

import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { graphql, GraphQLError } from '../../lib/github-graphql.mjs';
import { extractH2, isPlaceholder, parseTable } from './check-review-log-evidence.mjs';

const DEFAULT_COPILOT_REVIEWER = 'copilot-pull-request-reviewer[bot]';
const ACCEPTABLE_STATES = new Set(['APPROVED', 'COMMENTED', 'CHANGES_REQUESTED']);

const HELP = `Usage: check-copilot-review-attached.mjs (--pr-body <file> | --repo <owner/repo> --pr <num>) [options]

G-RG-2: verify GitHub Copilot has submitted a PR review. In --repo/--pr mode,
missing reviews trigger a best-effort '@copilot review' PR comment via gh.

Options:
  --pr-body <file>        Read fixture PR body markdown (expects ## Copilot review table)
  --repo <owner/repo>     GitHub repository for GraphQL mode
  --pr <num>              Pull request number for GraphQL mode
  --config <file>         harness.config.json path (default: ./harness.config.json if present)
  --reviewer-login <slug> Copilot reviewer login (default from config or ${DEFAULT_COPILOT_REVIEWER})
  --quiet                 Suppress per-finding output; print summary only
  --help                  Print this help text

Exit codes:
  0  pass (or skipped when reviews.require_copilot_review=false)
  1  Copilot review missing
  2  bad usage or transport error
`;

class UsageError extends Error {}

function requireValue(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith('-')) throw new UsageError(`missing value for ${flag}`);
  return value;
}

function normalizeLogin(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\[bot\]$/i, '');
}

function loadReviewsConfig(configPath) {
  const candidate = configPath ?? path.resolve(process.cwd(), 'harness.config.json');
  if (!existsSync(candidate)) return {};
  try {
    const cfg = JSON.parse(readFileSync(candidate, 'utf8'));
    return cfg.reviews && typeof cfg.reviews === 'object' ? cfg.reviews : {};
  } catch (error) {
    throw new UsageError(`cannot parse --config ${candidate}: ${error.message}`);
  }
}

function colMap(headers) {
  const map = new Map();
  headers.forEach((header, index) => map.set(header.trim().toLowerCase(), index));
  return map;
}

function parseFixtureReviews(body) {
  const section = extractH2(body, 'Copilot review') ?? extractH2(body, 'Copilot review attached');
  if (!section) return { rows: [], errors: ['## Copilot review fixture section is missing'] };
  const table = parseTable(section.body);
  if (table.headers.length === 0) return { rows: [], errors: ['## Copilot review fixture table is missing'] };
  const cols = colMap(table.headers);
  const loginIdx = cols.get('login') ?? cols.get('author') ?? cols.get('reviewer');
  const stateIdx = cols.get('state') ?? cols.get('review state');
  if (loginIdx === undefined || stateIdx === undefined) {
    return { rows: [], errors: ['## Copilot review fixture table must include login/reviewer and state columns'] };
  }
  const errors = [];
  const rows = table.rows.map((row, index) => {
    const login = row.cells[loginIdx] ?? '';
    const state = String(row.cells[stateIdx] ?? '').trim().toUpperCase();
    if (isPlaceholder(login) || isPlaceholder(state)) {
      errors.push(`## Copilot review fixture row ${index + 1} contains a template placeholder`);
    }
    return { login, state };
  });
  return { rows, errors };
}

export function runFixtureCheck({ body, label = '<pr-body>', reviewerLogin = DEFAULT_COPILOT_REVIEWER, config = {}, quiet = false }) {
  const errors = [];
  const stdout = [];
  const stderr = [];
  const emit = (message) => {
    errors.push(message);
    if (!quiet) stdout.push(`ERROR: ${message}`);
  };

  if (config.require_copilot_review === false) {
    stdout.push('copilot-review-attached: 0 errors, 0 warnings (skipped: reviews.require_copilot_review=false)');
    return { exitCode: 0, stdout, stderr };
  }

  const parsed = parseFixtureReviews(body);
  for (const error of parsed.errors) emit(`${label}: ${error}; see REVIEWS.md Phase 2 Required PR-side gates.`);
  const target = normalizeLogin(reviewerLogin);
  const found = parsed.rows.some((row) => normalizeLogin(row.login) === target && ACCEPTABLE_STATES.has(row.state));
  if (!found) {
    emit(`${label}: no acceptable review by ${reviewerLogin}; expected state ∈ {APPROVED, COMMENTED, CHANGES_REQUESTED}.`);
  }
  return summarize(errors, stdout, stderr);
}

export async function runGraphqlCheck({ repo, prNumber, reviewerLogin = DEFAULT_COPILOT_REVIEWER, config = {}, quiet = false, graphqlFn = graphql, commentFn = postCopilotComment }) {
  const errors = [];
  const stdout = [];
  const stderr = [];
  const emit = (message) => {
    errors.push(message);
    if (!quiet) stdout.push(`ERROR: ${message}`);
  };

  if (config.require_copilot_review === false) {
    stdout.push('copilot-review-attached: 0 errors, 0 warnings (skipped: reviews.require_copilot_review=false)');
    return { exitCode: 0, stdout, stderr };
  }

  const match = /^([^/]+)\/([^/]+)$/.exec(repo ?? '');
  if (!match) return { exitCode: 2, stdout, stderr: [`check-copilot-review-attached: --repo must be owner/repo; got '${repo}'`] };
  if (!Number.isInteger(prNumber) || prNumber < 1) return { exitCode: 2, stdout, stderr: [`check-copilot-review-attached: --pr must be a positive integer; got '${prNumber}'`] };

  let data;
  try {
    data = await graphqlFn(
      `query($owner:String!, $name:String!, $num:Int!) {
        repository(owner:$owner, name:$name) {
          pullRequest(number:$num) {
            reviews(last:50) {
              nodes {
                state
                author {
                  __typename
                  ... on Bot { login }
                  ... on User { login }
                }
              }
            }
            latestReviews(last:50) {
              nodes {
                state
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
      { owner: match[1], name: match[2], num: prNumber },
    );
  } catch (error) {
    if (error instanceof GraphQLError && error.kind === 'auth-missing') {
      return { exitCode: 2, stdout, stderr: [`check-copilot-review-attached: ${error.message}`] };
    }
    return { exitCode: 2, stdout, stderr: [`check-copilot-review-attached: GraphQL query failed: ${error.message}`] };
  }

  const pr = data.repository?.pullRequest;
  if (!pr) return { exitCode: 2, stdout, stderr: [`check-copilot-review-attached: PR ${repo}#${prNumber} not found`] };
  const reviews = [...(pr.reviews?.nodes ?? []), ...(pr.latestReviews?.nodes ?? [])];
  const target = normalizeLogin(reviewerLogin);
  const found = reviews.some((review) => {
    const login = normalizeLogin(review.author?.login ?? '');
    return login === target && ACCEPTABLE_STATES.has(review.state);
  });

  if (!found) {
    emit(`no acceptable review by ${reviewerLogin} found on ${repo}#${prNumber}; posting '@copilot review' comment as a best-effort trigger.`);
    const comment = commentFn(repo, prNumber);
    if (!comment.ok) {
      stderr.push(`check-copilot-review-attached: failed to post '@copilot review': ${comment.message}`);
    } else if (!quiet) {
      stdout.push(`Posted '@copilot review' comment on ${repo}#${prNumber}.`);
    }
  }

  return summarize(errors, stdout, stderr);
}

function postCopilotComment(repo, prNumber) {
  const env = { ...process.env };
  if (!env.GH_TOKEN && env.GITHUB_TOKEN) env.GH_TOKEN = env.GITHUB_TOKEN;
  const result = spawnSync('gh', ['pr', 'comment', String(prNumber), '--repo', repo, '--body', '@copilot review'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) {
    return { ok: false, message: (result.stderr || result.stdout || '').trim() || `gh exited ${result.status}` };
  }
  return { ok: true };
}

function summarize(errors, stdout, stderr) {
  stdout.push(`copilot-review-attached: ${errors.length} error${errors.length === 1 ? '' : 's'}, 0 warnings`);
  return { exitCode: errors.length > 0 ? 1 : 0, stdout, stderr };
}

function parseCli(argv) {
  const parsed = { prBody: null, repo: null, pr: null, configPath: null, reviewerLogin: null, quiet: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--pr-body') parsed.prBody = requireValue(argv, i++, '--pr-body');
    else if (arg === '--repo') parsed.repo = requireValue(argv, i++, '--repo');
    else if (arg === '--pr') parsed.pr = requireValue(argv, i++, '--pr');
    else if (arg === '--config') parsed.configPath = requireValue(argv, i++, '--config');
    else if (arg === '--reviewer-login') parsed.reviewerLogin = requireValue(argv, i++, '--reviewer-login');
    else if (arg === '--quiet') parsed.quiet = true;
    else if (arg === '--help' || arg === '-h') parsed.help = true;
    else throw new UsageError(`unknown flag: ${arg}`);
  }
  return parsed;
}

async function main() {
  let args;
  try {
    args = parseCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`check-copilot-review-attached: ${error.message}\n${HELP}`);
    process.exit(2);
  }
  if (args.help) {
    process.stdout.write(HELP);
    process.exit(0);
  }

  let config;
  try {
    config = loadReviewsConfig(args.configPath);
  } catch (error) {
    process.stderr.write(`check-copilot-review-attached: ${error.message}\n`);
    process.exit(2);
  }
  const reviewerLogin = args.reviewerLogin ?? config.copilot_reviewer_slug ?? DEFAULT_COPILOT_REVIEWER;

  let result;
  if (args.prBody) {
    try {
      result = runFixtureCheck({
        body: readFileSync(args.prBody, 'utf8'),
        label: args.prBody,
        reviewerLogin,
        config,
        quiet: args.quiet,
      });
    } catch (error) {
      process.stderr.write(`check-copilot-review-attached: cannot read --pr-body: ${error.message}\n`);
      process.exit(2);
    }
  } else if (args.repo && args.pr) {
    const prNumber = Number.parseInt(args.pr, 10);
    result = await runGraphqlCheck({ repo: args.repo, prNumber, reviewerLogin, config, quiet: args.quiet });
  } else {
    process.stderr.write(`check-copilot-review-attached: provide either --pr-body <file> or --repo <owner/repo> --pr <num>\n${HELP}`);
    process.exit(2);
  }

  for (const line of result.stderr) process.stderr.write(`${line}\n`);
  for (const line of result.stdout) process.stdout.write(`${line}\n`);
  process.exit(result.exitCode);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
