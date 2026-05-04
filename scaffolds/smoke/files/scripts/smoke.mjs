#!/usr/bin/env node
/**
 * scripts/smoke.mjs — Lightweight smoke-test runner.
 *
 * Performs HTTP(S) GET checks against a deployed or local service. Each check
 * asserts the response status code, optional body text fragments, and an
 * optional JSON-shape predicate. Exits 0 when all checks pass, 1 when any
 * check fails.
 *
 * Extend the CHECKS array below with your own endpoints and assertions.
 *
 * Usage:
 *   node scripts/smoke.mjs [--base-url <url>] [--timeout <ms>] [--help]
 *
 * Exit codes:
 *   0 — all checks passed
 *   1 — one or more checks failed
 *   2 — usage error (bad flags)
 *
 * @module scripts/smoke.mjs
 */

import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

// ---------------------------------------------------------------------------
// TODO: customize — default base URL for your service
// Override at runtime with --base-url <url>
// ---------------------------------------------------------------------------
const DEFAULT_BASE_URL = 'http://localhost:8080'; // TODO: customize

// TODO: customize — default request timeout in milliseconds
const DEFAULT_TIMEOUT_MS = 5000; // TODO: customize

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

/**
 * Guard that a CLI flag value exists and is not another flag token.
 * Exits 2 with a usage message if the guard fails (per LRN-040).
 * @param {string[]} args
 * @param {number} i
 * @param {string} flagName
 * @returns {string}
 */
function requireValue(args, i, flagName) {
  if (!args[i + 1] || args[i + 1].startsWith('-')) {
    process.stderr.write(`smoke: missing value for ${flagName}\n`);
    process.exit(2);
  }
  return args[i + 1];
}

let baseUrl = DEFAULT_BASE_URL;
let timeoutMs = DEFAULT_TIMEOUT_MS;

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--base-url') {
    baseUrl = requireValue(argv, i, '--base-url');
    i++;
  } else if (a === '--timeout') {
    const raw = requireValue(argv, i, '--timeout');
    i++;
    timeoutMs = Number(raw);
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      process.stderr.write(`smoke: --timeout must be a positive integer (got: ${raw})\n`);
      process.exit(2);
    }
  } else if (a === '--help' || a === '-h') {
    process.stdout.write(
      'Usage: node scripts/smoke.mjs [--base-url <url>] [--timeout <ms>]\n\n' +
        'Perform HTTP smoke checks against a deployed or local service.\n\n' +
        'Options:\n' +
        `  --base-url <url>   Base URL of the service (default: ${DEFAULT_BASE_URL})\n` +
        `  --timeout <ms>     Request timeout in milliseconds (default: ${DEFAULT_TIMEOUT_MS})\n` +
        '  --help             Print this help text\n'
    );
    process.exit(0);
  } else {
    process.stderr.write(`smoke: unknown flag: ${a}\n`);
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// TODO: customize — define your smoke checks here.
//
// Each entry:
//   label           {string}   Human-readable check name (shown in output)
//   path            {string}   URL path appended to baseUrl
//   expect.status   {number}   Expected HTTP status code
//   expect.bodyIncludes {string[]}  Substrings that must appear in the body
//   expect.json     {Function} Optional: (parsedBody) => boolean predicate
//
// Add, remove, or modify entries to match your service's endpoints.
// ---------------------------------------------------------------------------
const CHECKS = [
  {
    label: 'health endpoint returns 200',
    path: '/health', // TODO: customize
    expect: {
      status: 200,
      bodyIncludes: [], // TODO: customize — e.g. ['ok', '"status"']
      // Uncomment and adjust to assert JSON shape:
      // json: (obj) => typeof obj.status === 'string', // TODO: customize
    },
  },
  // TODO: customize — add more checks, e.g.:
  // {
  //   label: 'API version endpoint',
  //   path: '/api/version',
  //   expect: {
  //     status: 200,
  //     json: (obj) => typeof obj.version === 'string',
  //   },
  // },
];

// ---------------------------------------------------------------------------
// HTTP GET helper — Node stdlib only, no npm dependencies
// ---------------------------------------------------------------------------

/**
 * Perform an HTTP(S) GET and resolve with { status, body }.
 * @param {string} urlString
 * @param {number} ms  Timeout in milliseconds
 * @returns {Promise<{status: number, body: string}>}
 */
function httpGet(urlString, ms) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(urlString);
    } catch {
      reject(new Error(`Invalid URL: ${urlString}`));
      return;
    }

    const lib = parsedUrl.protocol === 'https:' ? https : http;
    const req = lib.get(urlString, { timeout: ms }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: chunks.join('') }));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timed out after ${ms}ms`));
    });
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Run checks
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

process.stdout.write(`Running smoke checks against ${baseUrl}\n\n`);

for (const check of CHECKS) {
  const url = baseUrl.replace(/\/$/, '') + check.path;
  let result;

  try {
    result = await httpGet(url, timeoutMs);
  } catch (err) {
    process.stderr.write(`  FAIL  ${check.label}\n        ${err.message}\n`);
    failed++;
    continue;
  }

  const failures = [];

  if (check.expect.status !== undefined && result.status !== check.expect.status) {
    failures.push(`expected status ${check.expect.status}, got ${result.status}`);
  }

  for (const fragment of check.expect.bodyIncludes ?? []) {
    if (!result.body.includes(fragment)) {
      failures.push(`body missing expected text: ${JSON.stringify(fragment)}`);
    }
  }

  if (typeof check.expect.json === 'function') {
    let parsed;
    try {
      parsed = JSON.parse(result.body);
    } catch {
      failures.push('body is not valid JSON');
    }
    if (parsed !== undefined && !check.expect.json(parsed)) {
      failures.push('JSON shape assertion failed');
    }
  }

  if (failures.length === 0) {
    process.stdout.write(`  PASS  ${check.label}\n`);
    passed++;
  } else {
    failures.forEach((f) => process.stderr.write(`  FAIL  ${check.label}\n        ${f}\n`));
    failed++;
  }
}

process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
