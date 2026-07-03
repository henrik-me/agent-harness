/**
 * lib/github-graphql.mjs — GitHub GraphQL primitive + Copilot review request helper.
 *
 * Exports:
 *   - graphql(query, variables, opts) — execute a GraphQL query/mutation, return parsed JSON or throw.
 *   - requestCopilotReview(repo, prNumber, opts) — request a Copilot review by shelling out to
 *     `gh pr edit <pr> --add-reviewer copilot-pull-request-reviewer`. See ADR 0004 for why this
 *     is NOT done via the `requestReviews` GraphQL mutation (that mutation rejects Bot node IDs).
 *
 * Resolution order for credentials (per ADR 0004 § ADR4-7):
 *   1. Explicit `opts.token`
 *   2. `GITHUB_TOKEN` env var (via `getGitHubToken()`)
 *   3. `GH_TOKEN` env var (legacy alias used by `gh`)
 *   4. `gh auth token` shell-out (best-effort; falls back silently if `gh` not on PATH)
 *
 * Transport order:
 *   1. If `gh` is available AND no explicit `opts.token` was passed → `gh api graphql` shell-out
 *      (universally available in CI; uses gh's authenticated session including any keychain
 *      credential that env-var probing wouldn't see).
 *   2. Otherwise → native `fetch()` against `https://api.github.com/graphql` with bearer token.
 *
 * All errors thrown are instances of `GraphQLError` with a `.kind` discriminant:
 *   - `auth-missing`   — no credential resolvable; remediation message included.
 *   - `network`        — fetch threw OR `gh` exited non-zero with no JSON body.
 *   - `http-status`    — non-200 HTTP response from fetch path; `.status` populated.
 *   - `graphql-errors` — 200 OK but response.errors[] non-empty; `.graphqlErrors[]` populated.
 *   - `invalid-json`   — response body unparseable as JSON.
 *
 * Test pattern: monkeypatch `globalThis.fetch` (for the fetch path) + override `__spawn` from
 * the module's exported test seam (for the `gh` shell-out path). See tests/lib-github-graphql.test.mjs.
 *
 * Security: tokens are never logged. Errors surface remediation hints but never the token itself.
 */

import { spawnSync } from 'node:child_process';

import { getGitHubToken } from './get-github-token.mjs';

const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';
const COPILOT_REVIEWER_LOGIN = 'copilot-pull-request-reviewer';

// Test seam: tests can override these to control transport without touching real APIs.
// Default impls call the real `spawnSync` and `globalThis.fetch`.
export const __testSeam = {
  spawnSync(cmd, args, options) {
    return spawnSync(cmd, args, options);
  },
  fetch(url, init) {
    return globalThis.fetch(url, init);
  },
};

export class GraphQLError extends Error {
  constructor(message, kind, extra = {}) {
    super(message);
    this.name = 'GraphQLError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

// A `gh` failure whose stderr matches this pattern is a genuine
// permission/scope/auth denial, NOT a transient blip — it must fail fast and
// never be retried (CS92 C92-1 / LRN-161). Kept broad on purpose so a real
// 403 / SAML / insufficient-scope error is never misclassified as transient.
const SCOPE_DENIAL_RE =
  /(HTTP 403)|not accessible by integration|Resource not accessible|permission|forbidden|insufficient|scope|SAML|must have (admin|write)/i;

/**
 * Parse an HTTP status code out of a `gh` stderr snippet.
 *
 * `gh` prints lines like `HTTP 401: Bad credentials` when the API rejects a
 * request; extracting the status lets `isTransientGhError` distinguish a
 * transient 401/5xx from a permanent 4xx without keying off the coarse
 * `kind: 'network'` discriminant.
 *
 * @param {string} stderr
 * @returns {number|undefined}
 */
function parseHttpStatus(stderr) {
  if (typeof stderr !== 'string') return undefined;
  const m = stderr.match(/\bHTTP\s+(\d{3})\b/i);
  return m ? Number(m[1]) : undefined;
}

/**
 * Return true ONLY for a positively-identified transient `gh`/GraphQL error
 * that is safe to retry with backoff (CS92 C92-1 / LRN-161): a random HTTP 401
 * that is NOT `auth-missing`, an HTTP >= 500, or an explicit transport/spawn
 * failure. Everything else — `auth-missing`, `bad-input`, `fork-source`,
 * `graphql-errors`, `invalid-json`, and any permission/scope denial (matched
 * via the enriched stderr snippet) — is NON-transient and must fail fast.
 *
 * The finer signal (`httpStatus`, `transport`, `stderr`, `exitCode`) is
 * attached to `GraphQLError` at each throw site so this single predicate can
 * classify without relying on the lossy `kind: 'network'` bucket that
 * conflates a transport blip with a real permission denial.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isTransientGhError(err) {
  if (!(err instanceof GraphQLError)) return false;
  if (err.kind === 'auth-missing') return false;
  if (typeof err.stderr === 'string' && SCOPE_DENIAL_RE.test(err.stderr)) return false;

  const status =
    typeof err.httpStatus === 'number'
      ? err.httpStatus
      : typeof err.status === 'number'
        ? err.status
        : undefined;

  if (status === 401) return true;
  if (typeof status === 'number' && status >= 500 && status <= 599) return true;
  if (err.transport === true) return true;
  return false;
}

/**
 * Resolve the GitHub token from (in order): opts.token, GITHUB_TOKEN, GH_TOKEN, `gh auth token`.
 *
 * @param {{token?: string}} opts
 * @returns {string|null}
 */
function resolveToken(opts = {}) {
  if (opts.token) return opts.token;

  const fromGetter = getGitHubToken();
  if (fromGetter) return fromGetter;

  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;

  // Best-effort: try `gh auth token`. Returns null if gh missing or not authed.
  try {
    const result = __testSeam.spawnSync('gh', ['auth', 'token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.status === 0 && result.stdout) {
      return result.stdout.trim() || null;
    }
  } catch {
    // gh not on PATH or other invocation failure — fall through to null.
  }
  return null;
}

/**
 * Check if `gh` CLI is available on PATH.
 */
function ghAvailable() {
  try {
    const result = __testSeam.spawnSync('gh', ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Execute a GraphQL query or mutation against GitHub.
 *
 * @param {string} query - GraphQL document.
 * @param {object} variables - Variables map for the document.
 * @param {{token?: string, baseUrl?: string, transport?: 'gh'|'fetch'|'auto'}} opts
 * @returns {Promise<object>} - Parsed `data` field from the GraphQL response.
 * @throws {GraphQLError}
 */
export async function graphql(query, variables = {}, opts = {}) {
  const transport = opts.transport || 'auto';
  const useGh =
    transport === 'gh' || (transport === 'auto' && !opts.token && ghAvailable());

  if (useGh) {
    return graphqlViaGh(query, variables);
  }
  return graphqlViaFetch(query, variables, opts);
}

function graphqlViaGh(query, variables) {
  const args = ['api', 'graphql', '-f', `query=${query}`];
  for (const [key, value] of Object.entries(variables)) {
    args.push('-F', `${key}=${value}`);
  }
  const result = __testSeam.spawnSync('gh', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  });

  if (result.error) {
    throw new GraphQLError(
      `Failed to invoke 'gh api graphql': ${result.error.message}. ` +
        `Ensure 'gh' is on PATH or set GITHUB_TOKEN/GH_TOKEN to use the fetch transport.`,
      'network',
      { transport: true },
    );
  }

  // gh exits non-zero when GraphQL returns errors but still emits the JSON body to stdout.
  // Try to parse stdout first; only fall through to network error if stdout is empty.
  let parsed;
  if (result.stdout) {
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      throw new GraphQLError(
        `'gh api graphql' returned unparseable JSON: ${truncate(result.stdout, 400)}`,
        'invalid-json',
      );
    }
  } else {
    const stderr = (result.stderr || '').trim();
    if (/not authenticated|gh auth login/i.test(stderr)) {
      throw new GraphQLError(authErrorMessage(stderr), 'auth-missing');
    }
    const httpStatus = parseHttpStatus(stderr);
    throw new GraphQLError(
      `'gh api graphql' failed (exit ${result.status}): ${truncate(stderr, 400)}`,
      'network',
      {
        exitCode: result.status,
        stderr: truncate(stderr, 400),
        ...(httpStatus !== undefined ? { httpStatus } : {}),
      },
    );
  }

  if (parsed.errors && parsed.errors.length > 0) {
    throw new GraphQLError(
      `GraphQL errors: ${parsed.errors.map((e) => e.message).join('; ')}`,
      'graphql-errors',
      { graphqlErrors: parsed.errors },
    );
  }

  if (!('data' in parsed)) {
    throw new GraphQLError(
      `GraphQL response missing 'data' field: ${truncate(JSON.stringify(parsed), 400)}`,
      'invalid-json',
    );
  }

  return parsed.data;
}

async function graphqlViaFetch(query, variables, opts) {
  const token = resolveToken(opts);
  if (!token) {
    throw new GraphQLError(authErrorMessage(), 'auth-missing');
  }

  const url = opts.baseUrl || GITHUB_GRAPHQL_URL;
  let response;
  try {
    response = await __testSeam.fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github+json',
        'User-Agent': 'henrik-me/agent-harness',
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (e) {
    throw new GraphQLError(`fetch threw: ${e.message}`, 'network', { transport: true });
  }

  if (response.status !== 200) {
    let body = '';
    try {
      body = await response.text();
    } catch {
      // ignore
    }
    throw new GraphQLError(
      `GraphQL HTTP ${response.status}: ${truncate(body, 400)}`,
      'http-status',
      { status: response.status, httpStatus: response.status },
    );
  }

  let parsed;
  try {
    parsed = await response.json();
  } catch (e) {
    throw new GraphQLError(`Response body is not JSON: ${e.message}`, 'invalid-json');
  }

  if (parsed.errors && parsed.errors.length > 0) {
    throw new GraphQLError(
      `GraphQL errors: ${parsed.errors.map((e) => e.message).join('; ')}`,
      'graphql-errors',
      { graphqlErrors: parsed.errors },
    );
  }

  if (!('data' in parsed)) {
    throw new GraphQLError(
      `GraphQL response missing 'data' field: ${truncate(JSON.stringify(parsed), 400)}`,
      'invalid-json',
    );
  }

  return parsed.data;
}

/**
 * Request a Copilot review on the given PR by shelling out to `gh pr edit --add-reviewer`.
 *
 * Per ADR 0004 § ADR4-2: the documented `requestReviews(input:{userIds:[<bot-id>]})` GraphQL
 * mutation REJECTS Bot node IDs (returns NOT_FOUND with "Could not resolve to User node").
 * The REST endpoint behind `gh pr edit --add-reviewer` IS Bot-aware via login string, so we
 * shell out to that instead. This is the single supported engagement primitive.
 *
 * @param {{owner: string, repo: string}} repo
 * @param {number} prNumber
 * @param {{cwd?: string, login?: string}} opts - opts.login overrides the default Copilot login.
 * @returns {{ok: true, login: string} | never}
 * @throws {GraphQLError}
 */
export function requestCopilotReview(repo, prNumber, opts = {}) {
  if (!repo || !repo.owner || !repo.repo) {
    throw new GraphQLError(
      `requestCopilotReview requires {owner, repo}; got ${JSON.stringify(repo)}`,
      'network',
    );
  }
  if (!prNumber || !Number.isInteger(prNumber)) {
    throw new GraphQLError(
      `requestCopilotReview requires integer prNumber; got ${prNumber}`,
      'network',
    );
  }
  const login = opts.login || COPILOT_REVIEWER_LOGIN;
  const result = __testSeam.spawnSync(
    'gh',
    [
      'pr',
      'edit',
      String(prNumber),
      '--repo',
      `${repo.owner}/${repo.repo}`,
      '--add-reviewer',
      login,
    ],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: opts.cwd || process.cwd(),
    },
  );

  if (result.error) {
    throw new GraphQLError(
      `Failed to invoke 'gh pr edit': ${result.error.message}. ` +
        `Ensure 'gh' is installed and on PATH.`,
      'network',
      { transport: true },
    );
  }

  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    if (/not authenticated|gh auth login/i.test(stderr)) {
      throw new GraphQLError(authErrorMessage(stderr), 'auth-missing');
    }
    const httpStatus = parseHttpStatus(stderr);
    throw new GraphQLError(
      `'gh pr edit' failed (exit ${result.status}): ${truncate(stderr, 400)}. ` +
        `Verify the token has 'pull_request:write' scope on ${repo.owner}/${repo.repo}.`,
      'network',
      {
        exitCode: result.status,
        stderr: truncate(stderr, 400),
        ...(httpStatus !== undefined ? { httpStatus } : {}),
      },
    );
  }

  return { ok: true, login };
}

function authErrorMessage(stderr = '') {
  const base =
    `GitHub API access requires 'gh auth status' to show authenticated, ` +
    `OR a GITHUB_TOKEN/GH_TOKEN environment variable with 'repo' and 'read:user' scopes ` +
    `(plus 'pull_request:write' for review-request mutations). ` +
    `See lib/github-graphql.mjs for the resolution order.`;
  return stderr ? `${base} (gh stderr: ${truncate(stderr, 200)})` : base;
}

function truncate(s, n) {
  if (typeof s !== 'string') s = String(s);
  return s.length > n ? `${s.slice(0, n)}...[truncated]` : s;
}
