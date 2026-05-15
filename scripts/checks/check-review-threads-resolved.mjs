#!/usr/bin/env node
/** G-RG-4: review-threads-resolved. */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { graphql, GraphQLError } from '../../lib/github-graphql.mjs';
import { extractH2, isPlaceholder, parseTable } from './check-review-log-evidence.mjs';

const HELP = `Usage: check-review-threads-resolved.mjs (--pr-body <file> | --repo <owner/repo> --pr <num>) [options]

G-RG-4: verify every GitHub review thread on a PR is resolved.

Options:
  --pr-body <file>     Read fixture PR body markdown (expects ## Review threads table)
  --repo <owner/repo>  GitHub repository for GraphQL mode
  --pr <num>           Pull request number for GraphQL mode
  --quiet              Suppress per-finding output; print summary only
  --help               Print this help text

Exit codes:
  0  pass
  1  unresolved review threads exist
  2  bad usage or transport error
`;

class UsageError extends Error {}

function requireValue(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith('-')) throw new UsageError(`missing value for ${flag}`);
  return value;
}

function parseBoolish(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['true', 'resolved', 'yes', 'y', '1'].includes(normalized)) return true;
  if (['false', 'unresolved', 'open', 'no', 'n', '0'].includes(normalized)) return false;
  return null;
}

function colMap(headers) {
  const map = new Map();
  headers.forEach((header, index) => map.set(header.trim().toLowerCase(), index));
  return map;
}

function parseFixtureThreads(body) {
  const section = extractH2(body, 'Review threads') ?? extractH2(body, 'Review thread hygiene');
  if (!section) return { states: [], errors: ['## Review threads fixture section is missing'] };
  const table = parseTable(section.body);
  if (table.headers.length === 0) return { states: [], errors: ['## Review threads fixture table is missing'] };
  const cols = colMap(table.headers);
  const idx = cols.get('isresolved') ?? cols.get('is resolved') ?? cols.get('resolved') ?? cols.get('state');
  if (idx === undefined) return { states: [], errors: ['## Review threads fixture table must include isResolved/resolved/state column'] };
  const errors = [];
  const states = [];
  for (let i = 0; i < table.rows.length; i++) {
    const cell = table.rows[i].cells[idx] ?? '';
    if (isPlaceholder(cell)) {
      errors.push(`## Review threads fixture row ${i + 1} contains a template placeholder`);
      continue;
    }
    const parsed = parseBoolish(cell);
    if (parsed === null) {
      errors.push(`## Review threads fixture row ${i + 1} has unrecognized resolved value "${cell}"`);
      continue;
    }
    states.push(parsed);
  }
  return { states, errors };
}

export function runFixtureCheck({ body, label = '<pr-body>', quiet = false }) {
  const errors = [];
  const stdout = [];
  const stderr = [];
  const emit = (message) => {
    errors.push(message);
    if (!quiet) stdout.push(`ERROR: ${message}`);
  };

  const parsed = parseFixtureThreads(body);
  for (const error of parsed.errors) emit(`${label}: ${error}; see REVIEWS.md Review thread hygiene.`);
  const unresolved = parsed.states.filter((state) => state === false).length;
  if (unresolved > 0) {
    emit(`${label}: ${unresolved} review thread${unresolved === 1 ? '' : 's'} unresolved; resolve all PR review threads before merge.`);
  }

  return summarize(errors, stdout, stderr);
}

export async function runGraphqlCheck({ repo, prNumber, quiet = false, graphqlFn = graphql }) {
  const errors = [];
  const stdout = [];
  const stderr = [];
  const emit = (message) => {
    errors.push(message);
    if (!quiet) stdout.push(`ERROR: ${message}`);
  };

  const match = /^([^/]+)\/([^/]+)$/.exec(repo ?? '');
  if (!match) return { exitCode: 2, stdout, stderr: [`check-review-threads-resolved: --repo must be owner/repo; got '${repo}'`] };
  if (!Number.isInteger(prNumber) || prNumber < 1) return { exitCode: 2, stdout, stderr: [`check-review-threads-resolved: --pr must be a positive integer; got '${prNumber}'`] };

  const threads = [];
  let cursor = null;
  try {
    do {
      const data = await graphqlFn(
        `query($owner:String!, $name:String!, $num:Int!, $cursor:String) {
          repository(owner:$owner, name:$name) {
            pullRequest(number:$num) {
              reviewThreads(first:100, after:$cursor) {
                nodes { isResolved }
                pageInfo { hasNextPage endCursor }
              }
            }
          }
        }`,
        { owner: match[1], name: match[2], num: prNumber, cursor },
      );
      const pr = data.repository?.pullRequest;
      if (!pr) return { exitCode: 2, stdout, stderr: [`check-review-threads-resolved: PR ${repo}#${prNumber} not found`] };
      const connection = pr.reviewThreads ?? {};
      threads.push(...(connection.nodes ?? []));
      const pageInfo = connection.pageInfo ?? {};
      if (pageInfo.hasNextPage && !pageInfo.endCursor) {
        return { exitCode: 2, stdout, stderr: ['check-review-threads-resolved: GraphQL pageInfo.hasNextPage was true without endCursor'] };
      }
      cursor = pageInfo.hasNextPage ? pageInfo.endCursor : null;
    } while (cursor);
  } catch (error) {
    if (error instanceof GraphQLError && error.kind === 'auth-missing') {
      return { exitCode: 2, stdout, stderr: [`check-review-threads-resolved: ${error.message}`] };
    }
    return { exitCode: 2, stdout, stderr: [`check-review-threads-resolved: GraphQL query failed: ${error.message}`] };
  }

  const unresolved = threads.filter((thread) => thread?.isResolved === false).length;
  if (unresolved > 0) {
    emit(`${unresolved} review thread${unresolved === 1 ? '' : 's'} unresolved on ${repo}#${prNumber}; resolve every PR review thread before merge.`);
  }

  return summarize(errors, stdout, stderr);
}

function summarize(errors, stdout, stderr) {
  stdout.push(`review-threads-resolved: ${errors.length} error${errors.length === 1 ? '' : 's'}, 0 warnings`);
  return { exitCode: errors.length > 0 ? 1 : 0, stdout, stderr };
}

function parseCli(argv) {
  const parsed = { prBody: null, repo: null, pr: null, quiet: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--pr-body') parsed.prBody = requireValue(argv, i++, '--pr-body');
    else if (arg === '--repo') parsed.repo = requireValue(argv, i++, '--repo');
    else if (arg === '--pr') parsed.pr = requireValue(argv, i++, '--pr');
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
    process.stderr.write(`check-review-threads-resolved: ${error.message}\n${HELP}`);
    process.exit(2);
  }
  if (args.help) {
    process.stdout.write(HELP);
    process.exit(0);
  }

  let result;
  if (args.prBody) {
    try {
      result = runFixtureCheck({ body: readFileSync(args.prBody, 'utf8'), label: args.prBody, quiet: args.quiet });
    } catch (error) {
      process.stderr.write(`check-review-threads-resolved: cannot read --pr-body: ${error.message}\n`);
      process.exit(2);
    }
  } else if (args.repo && args.pr) {
    const prNumber = Number.parseInt(args.pr, 10);
    result = await runGraphqlCheck({ repo: args.repo, prNumber, quiet: args.quiet });
  } else {
    process.stderr.write(`check-review-threads-resolved: provide either --pr-body <file> or --repo <owner/repo> --pr <num>\n${HELP}`);
    process.exit(2);
  }

  for (const line of result.stderr) process.stderr.write(`${line}\n`);
  for (const line of result.stdout) process.stdout.write(`${line}\n`);
  process.exit(result.exitCode);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
