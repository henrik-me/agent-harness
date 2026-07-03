import os from 'node:os';
import path from 'node:path';
import { mkdir as fsMkdir, readFile as fsReadFile, writeFile as fsWriteFile } from 'node:fs/promises';

import { graphql, GraphQLError, isTransientGhError, requestCopilotReview } from './github-graphql.mjs';

export const COPILOT_LOGIN = 'copilot-pull-request-reviewer';
export const ACCEPTABLE_STATES = new Set(['APPROVED', 'COMMENTED', 'CHANGES_REQUESTED']);

const COPILOT_NODE_ID = 'BOT_kgDOCnlnWA';
const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_FILE = 'copilot-id.json';

const PR_NODE_QUERY = `query($owner:String!, $repo:String!, $pr:Int!) {
  repository(owner:$owner, name:$repo) {
    pullRequest(number:$pr) { id isCrossRepository headRefOid }
  }
}`;

const REVIEW_QUERY = `query($owner:String!, $name:String!, $num:Int!) {
  repository(owner:$owner, name:$name) {
    pullRequest(number:$num) {
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
}`;

// C92-2 (LRN-160): after the add mutation, read the PR's requested reviewers so
// a silent `gh pr edit --add-reviewer` no-op (exit 0 but requested_reviewers
// stays empty) is caught immediately rather than only via a full poll timeout.
const REVIEW_REQUESTS_QUERY = `query($owner:String!, $name:String!, $num:Int!) {
  repository(owner:$owner, name:$name) {
    pullRequest(number:$num) {
      reviewRequests(first:50) {
        nodes {
          requestedReviewer {
            __typename
            ... on Bot { login }
            ... on User { login }
          }
        }
      }
    }
  }
}`;

const IDENTITY_NODE_QUERY = `query($id:ID!) {
  node(id:$id) {
    __typename
    ... on Bot { id login }
    ... on User { id login }
  }
}`;

const IDENTITY_USER_FALLBACK_QUERY = `query($login:String!) {
  user(login:$login) { id login }
}`;

/**
 * Typed error surface for `lib/copilot-engage.mjs` callers (the CLI dispatcher
 * in `bin/harness.mjs cmdCopilotEngage` matches on `kind` to produce stable
 * exit codes per CS41 C41-4).
 *
 * `kind` is one of:
 *   - `'auth-missing'`        — `GITHUB_TOKEN` / `gh auth token` unavailable.
 *   - `'bad-input'`           — invalid `owner` / `repo` / `prNumber` / opt.
 *   - `'network'`             — GraphQL transport / unrecoverable upstream error.
 *   - `'fork-source'`         — fork PR cannot self-engage Copilot.
 *   - `'timeout'`             — poll loop exhausted without a matching review.
 *   - `'reviewer-not-requested'` — the Copilot reviewer never landed in
 *                               `requested_reviewers` even after one bounded
 *                               re-add (CS92 C92-2 — the LRN-160 silent add
 *                               no-op; a FAST failure, not a poll timeout).
 *   - `'reviewer-verify-unavailable'` — the requested-reviewers list could not
 *                               be read (after transient retry) to verify the
 *                               add, so success cannot be honestly reported
 *                               (CS92 C92-2 — never silently pass an unreadable
 *                               reviewer list).
 *   - `'cache-write-failed'`  — fs error writing the identity-cache file or
 *                               creating its parent dir (CS45 C45-2 — surfaces
 *                               EACCES / ENOSPC / read-only `~/.cache/`).
 */
export class EngageError extends Error {
  constructor(message, kind, extra = {}) {
    super(message, extra.cause ? { cause: extra.cause } : undefined);
    this.name = 'EngageError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

export const __testSeam = {
  now() {
    return Date.now();
  },
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },
  readFile(filePath, encoding = 'utf8') {
    return fsReadFile(filePath, encoding);
  },
  writeFile(filePath, content, encoding = 'utf8') {
    return fsWriteFile(filePath, content, encoding);
  },
  mkdir(dirPath, opts) {
    return fsMkdir(dirPath, opts);
  },
  requestFn(repo, prNumber, opts) {
    return requestCopilotReview(repo, prNumber, opts);
  },
  graphqlFn(query, variables = {}, opts = {}) {
    return graphql(query, variables, opts);
  },
};

const DEFAULT_RETRY_ATTEMPTS = 5;
const DEFAULT_RETRY_BASE_DELAY_MS = 3000;

/**
 * Run `fn`, retrying ONLY on a positively-identified transient `gh`/GraphQL
 * error (CS92 C92-1 / LRN-161) with linear backoff driven by the injectable
 * `__testSeam.sleep` (so tests are deterministic). A single random 401 or a
 * transport blip no longer aborts the whole engage; a real `auth-missing` /
 * permission-scope / bad-input error fails fast with no retry.
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{attempts?: number, baseDelayMs?: number, isTransient?: (err: unknown) => boolean}} [options]
 * @returns {Promise<T>}
 */
async function withRetry(
  fn,
  { attempts = DEFAULT_RETRY_ATTEMPTS, baseDelayMs = DEFAULT_RETRY_BASE_DELAY_MS, isTransient = isTransientGhError } = {},
) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt < attempts && isTransient(err)) {
        await __testSeam.sleep(baseDelayMs * attempt);
        continue;
      }
      throw err;
    }
  }
}

function extractRequestedReviewerLogins(data) {
  const nodes = data?.repository?.pullRequest?.reviewRequests?.nodes ?? [];
  return nodes
    .map((node) => node?.requestedReviewer?.login)
    .filter((login) => typeof login === 'string');
}

/**
 * Verify the Copilot reviewer actually landed in `requested_reviewers` after
 * the add mutation, self-healing a silent no-op with exactly one bounded re-add
 * (CS92 C92-2 / LRN-160). Returns:
 *   - `{ readable: true, present: true, logins }`  — reviewer confirmed.
 *   - `{ readable: true, present: false, logins }` — still absent after re-add.
 *   - `{ readable: false, cause }`                 — list unreadable after retry.
 * Never silently reports success from an unreadable reviewer list.
 */
async function verifyReviewerRequested({ owner, repo, prNumber, login, opts }) {
  const readLogins = async () => {
    const data = await withRetry(() =>
      __testSeam.graphqlFn(REVIEW_REQUESTS_QUERY, { owner, name: repo, num: prNumber }, opts),
    );
    return extractRequestedReviewerLogins(data);
  };

  let logins;
  try {
    logins = await readLogins();
  } catch (err) {
    return { readable: false, cause: err };
  }
  if (logins.includes(login)) {
    return { readable: true, present: true, logins };
  }

  // Silent no-op (LRN-160): re-add exactly once, then re-verify.
  try {
    await withRetry(() => __testSeam.requestFn({ owner, repo }, prNumber, { ...opts, login }));
  } catch (err) {
    throw toEngageError(err, 'Failed to re-request Copilot review after a silent add no-op');
  }

  let loginsAfterReAdd;
  try {
    loginsAfterReAdd = await readLogins();
  } catch (err) {
    return { readable: false, cause: err };
  }
  return {
    readable: true,
    present: loginsAfterReAdd.includes(login),
    logins: loginsAfterReAdd,
  };
}

export async function engageCopilot({ owner, repo, prNumber, opts = {} } = {}) {
  validateOwnerRepoPr(owner, repo, prNumber);
  const timeoutMs = normalizeMs(opts.timeoutMs, DEFAULT_TIMEOUT_MS, 'timeoutMs', true);
  const intervalMs = normalizeMs(opts.intervalMs, DEFAULT_INTERVAL_MS, 'intervalMs', false);

  const pr = await resolvePrNodeId({ owner, repo, prNumber, opts });
  if (pr.isCrossRepository) {
    throw forkSourceError(owner, repo, prNumber);
  }

  const identity = await resolveCopilotIdentity({
    cacheDir: opts.cacheDir,
    cacheTtlMs: opts.cacheTtlMs,
    opts,
  });

  let request;
  // Capture the engage-request floor BEFORE the mutation. The poll predicate
  // only accepts Copilot reviews submitted at or after this timestamp, which
  // matches the A5+A16 ordering doctrine in scripts/check-copilot-review.mjs:
  // a stale Copilot review on the same HEAD that predates the latest local Go
  // (or this engage) is INVALID and must be re-requested. (CS41 R1 finding #1)
  const engageRequestedAtMs = __testSeam.now();
  const engageRequestedAt = new Date(engageRequestedAtMs).toISOString();
  try {
    request = await withRetry(() =>
      __testSeam.requestFn(
        { owner, repo },
        prNumber,
        { ...opts, login: identity.login },
      ),
    );
  } catch (err) {
    throw toEngageError(err, 'Failed to request Copilot review');
  }

  const login = request?.login ?? identity.login;

  // C92-2 (LRN-160): a `gh pr edit --add-reviewer` add can return exit 0 while
  // requested_reviewers stays empty. Verify the reviewer landed (with a single
  // bounded re-add on a silent no-op) BEFORE polling or returning, so the miss
  // surfaces as an immediate typed failure — never a slow, misleadingly-worded
  // poll timeout.
  const verification = await verifyReviewerRequested({ owner, repo, prNumber, login, opts });
  if (verification.readable && !verification.present) {
    throw new EngageError(
      `Copilot reviewer '${login}' was not requested on ${owner}/${repo}#${prNumber} after the add ` +
        `plus one bounded re-add (observed requested_reviewers: [${verification.logins.join(', ')}]). ` +
        `'gh pr edit --add-reviewer' reported success but the reviewer did not land (LRN-160).`,
      'reviewer-not-requested',
      { requestedReviewers: verification.logins },
    );
  }
  if (!verification.readable && !opts.noPoll) {
    throw new EngageError(
      `Could not read requested reviewers for ${owner}/${repo}#${prNumber} to verify the Copilot add ` +
        `(after retry). Refusing to report success from an unreadable reviewer list (LRN-160).`,
      'reviewer-verify-unavailable',
      { cause: verification.cause },
    );
  }

  if (opts.noPoll) {
    if (!verification.readable) {
      process.stderr.write(
        `::notice::copilot-engage: could not verify requested reviewers for ${owner}/${repo}#${prNumber} ` +
          `after retry; reporting the request as unverified.\n`,
      );
    }
    return {
      requested: true,
      verified: false,
      login,
      timeoutMs,
      polledMs: 0,
      engageRequestedAt,
      headRefOid: pr.headRefOid,
      headSha: opts.headSha || pr.headRefOid,
    };
  }

  const headSha = opts.headSha || pr.headRefOid;
  if (!headSha) {
    throw new EngageError(
      `Cannot poll ${owner}/${repo}#${prNumber}: PR head SHA was not available.`,
      'bad-input',
    );
  }

  if (typeof opts.onResolvedHead === 'function') {
    opts.onResolvedHead({ headSha, prHeadSha: pr.headRefOid });
  }

  // Per C41-3 + CS41 R1 finding #1: the poll's "must-be-after" floor is the
  // MAX of the engage-request timestamp and any caller-supplied
  // `opts.submittedAfter` (so callers who already know `latestLocalGo` can
  // pass it explicitly to enforce the A5 ordering vs that row).
  const callerFloor = parseSubmittedAfter(opts.submittedAfter);
  const submittedAfterIso = callerFloor && callerFloor > engageRequestedAtMs
    ? new Date(callerFloor).toISOString()
    : engageRequestedAt;

  const poll = await pollForCopilotReview({
    owner,
    repo,
    prNumber,
    headSha,
    copilotLogin: login,
    timeoutMs,
    intervalMs,
    submittedAfterIso,
    opts,
  });

  if (poll.timedOut) {
    throw new EngageError(
      `Timed out after ${formatSeconds(timeoutMs)} waiting for ${login} review at HEAD ${shortSha(headSha)} ` +
        `submitted at or after ${submittedAfterIso}. ` +
        `The review request was accepted; rerun 'harness copilot-engage ${prNumber}' if it remains stuck, ` +
        `or rerun the A16 gate after the review lands.`,
      'timeout',
      { timeoutMs, polledMs: poll.polledMs, attempts: poll.attempts, submittedAfterIso },
    );
  }

  return {
    requested: true,
    verified: true,
    login,
    review: poll.review,
    timeoutMs,
    polledMs: poll.polledMs,
    engageRequestedAt,
    submittedAfterIso,
    headRefOid: pr.headRefOid,
    headSha,
  };
}

export async function resolveCopilotIdentity({
  cacheDir,
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  opts = {},
} = {}) {
  const effectiveCacheDir =
    cacheDir == null ? path.join(os.homedir(), '.cache', 'harness') : cacheDir;
  const login = opts.login || COPILOT_LOGIN;
  const ttlMs = normalizeMs(cacheTtlMs, DEFAULT_CACHE_TTL_MS, 'cacheTtlMs', true);
  const cacheFile = path.join(effectiveCacheDir, CACHE_FILE);
  const now = __testSeam.now();
  const cached = await readIdentityCache(cacheFile);

  if (
    cached &&
    cached.login === login &&
    typeof cached.id === 'string' &&
    typeof cached.cachedAt === 'number' &&
    now - cached.cachedAt <= ttlMs
  ) {
    return { login: cached.login, id: cached.id, source: 'cache', cachedAt: cached.cachedAt };
  }

  const fetched = await fetchCopilotIdentity(login, opts);
  const payload = { login: fetched.login, id: fetched.id, cachedAt: now };
  try {
    await __testSeam.mkdir(effectiveCacheDir, { recursive: true });
    await __testSeam.writeFile(cacheFile, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  } catch (err) {
    const syscall = err && err.syscall ? ` (syscall: ${err.syscall})` : '';
    throw new EngageError(
      `Failed to write Copilot identity cache to ${cacheFile}: ${err?.message ?? String(err)}${syscall}`,
      'cache-write-failed',
      { cause: err },
    );
  }
  return { ...payload, source: 'fetched' };
}

export async function resolvePrNodeId({ owner, repo, prNumber, opts = {} } = {}) {
  validateOwnerRepoPr(owner, repo, prNumber);
  let data;
  try {
    data = await withRetry(() =>
      __testSeam.graphqlFn(PR_NODE_QUERY, { owner, repo, pr: prNumber }, opts),
    );
  } catch (err) {
    throw toEngageError(err, `Failed to resolve PR ${owner}/${repo}#${prNumber}`);
  }

  const pr = data?.repository?.pullRequest;
  if (!pr?.id) {
    throw new EngageError(`PR ${owner}/${repo}#${prNumber} was not found via GraphQL.`, 'bad-input');
  }

  return {
    id: pr.id,
    isCrossRepository: Boolean(pr.isCrossRepository),
    headRefOid: pr.headRefOid,
  };
}

export async function pollForCopilotReview({
  owner,
  repo,
  prNumber,
  headSha,
  copilotLogin = COPILOT_LOGIN,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  intervalMs = DEFAULT_INTERVAL_MS,
  submittedAfterIso = null,
  opts = {},
} = {}) {
  validateOwnerRepoPr(owner, repo, prNumber);
  if (!headSha || typeof headSha !== 'string') {
    throw new EngageError(`headSha is required to poll for ${owner}/${repo}#${prNumber}.`, 'bad-input');
  }
  const submittedAfterMs = parseSubmittedAfter(submittedAfterIso);
  const maxMs = normalizeMs(timeoutMs, DEFAULT_TIMEOUT_MS, 'timeoutMs', true);
  const stepMs = normalizeMs(intervalMs, DEFAULT_INTERVAL_MS, 'intervalMs', false);
  const startedAt = __testSeam.now();
  let attempts = 0;

  while (true) {
    attempts++;
    let data;
    try {
      data = await withRetry(() =>
        __testSeam.graphqlFn(
          REVIEW_QUERY,
          { owner, name: repo, num: prNumber },
          opts,
        ),
      );
    } catch (err) {
      throw toEngageError(err, `Failed to poll Copilot review for ${owner}/${repo}#${prNumber}`);
    }

    const pr = data?.repository?.pullRequest;
    if (!pr) {
      throw new EngageError(`PR ${owner}/${repo}#${prNumber} was not found while polling.`, 'bad-input');
    }

    const review = findLatestMatchingCopilotReview(
      pr.reviews?.nodes ?? [],
      headSha,
      copilotLogin,
      submittedAfterMs,
    );
    const polledMs = Math.max(0, __testSeam.now() - startedAt);
    if (review) {
      return { review, timedOut: false, polledMs, attempts };
    }

    if (typeof opts.onPoll === 'function') {
      opts.onPoll({ attempts, polledMs, timeoutMs: maxMs });
    }

    if (polledMs >= maxMs) {
      return { timedOut: true, polledMs, attempts };
    }

    await __testSeam.sleep(Math.min(stepMs, maxMs - polledMs));
  }
}

function findLatestMatchingCopilotReview(reviews, headSha, copilotLogin, submittedAfterMs = null) {
  const copilotReviews = reviews.filter(
    (r) =>
      r.author &&
      r.author.__typename === 'Bot' &&
      r.author.login === copilotLogin,
  );
  const acceptableCopilotReviews = copilotReviews.filter((r) => {
    if (!ACCEPTABLE_STATES.has(r.state)) return false;
    if (!r.commit || r.commit.oid !== headSha) return false;
    if (submittedAfterMs !== null) {
      const submittedMs = new Date(r.submittedAt).getTime();
      if (!Number.isFinite(submittedMs) || submittedMs < submittedAfterMs) return false;
    }
    return true;
  });

  return acceptableCopilotReviews.reduce((latest, r) => {
    if (!latest) return r;
    return new Date(r.submittedAt).getTime() > new Date(latest.submittedAt).getTime() ? r : latest;
  }, null);
}

function parseSubmittedAfter(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const ms = new Date(value).getTime();
    if (!Number.isFinite(ms)) {
      throw new EngageError(`submittedAfter is not a valid ISO timestamp: '${value}'`, 'bad-input');
    }
    return ms;
  }
  throw new EngageError(`submittedAfter must be a string ISO timestamp or number; got '${typeof value}'`, 'bad-input');
}

async function readIdentityCache(cacheFile) {
  try {
    const raw = await __testSeam.readFile(cacheFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.login === 'string' &&
      typeof parsed.id === 'string' &&
      typeof parsed.cachedAt === 'number'
    ) {
      return parsed;
    }
  } catch {
    // Invalid/missing cache entries are treated as a miss and refreshed.
  }
  return null;
}

async function fetchCopilotIdentity(login, opts) {
  const nodeId = opts.id || (login === COPILOT_LOGIN ? COPILOT_NODE_ID : null);
  if (nodeId) {
    try {
      const data = await withRetry(() => __testSeam.graphqlFn(IDENTITY_NODE_QUERY, { id: nodeId }, opts));
      const node = data?.node;
      if (
        node?.id &&
        node.login === login &&
        (node.__typename === 'Bot' || node.__typename === 'User')
      ) {
        return { login: node.login, id: node.id };
      }
    } catch (err) {
      if (err instanceof GraphQLError && err.kind === 'auth-missing') {
        throw err;
      }
      // Fall back to user(login:) below; the canonical Copilot identity is a Bot.
    }
  }

  try {
    const data = await withRetry(() => __testSeam.graphqlFn(IDENTITY_USER_FALLBACK_QUERY, { login }, opts));
    if (data?.user?.id) {
      return { login: data.user.login ?? login, id: data.user.id };
    }
  } catch (err) {
    throw toEngageError(err, `Failed to resolve GitHub identity for ${login}`);
  }

  throw new EngageError(`Could not resolve GitHub identity for ${login}.`, 'network');
}

function validateOwnerRepoPr(owner, repo, prNumber) {
  if (!owner || typeof owner !== 'string' || !repo || typeof repo !== 'string') {
    throw new EngageError('owner and repo are required.', 'bad-input');
  }
  if (!Number.isInteger(prNumber) || prNumber < 1) {
    throw new EngageError(`prNumber must be a positive integer; got '${prNumber}'.`, 'bad-input');
  }
}

function normalizeMs(value, defaultValue, name, allowZero) {
  const ms = value ?? defaultValue;
  const min = allowZero ? 0 : 1;
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < min) {
    throw new EngageError(`${name} must be ${allowZero ? 'non-negative' : 'positive'} milliseconds.`, 'bad-input');
  }
  return ms;
}

function toEngageError(err, message) {
  if (err instanceof EngageError) return err;
  if (err instanceof GraphQLError) {
    const kind = err.kind === 'auth-missing' ? 'auth-missing' : 'network';
    return new EngageError(`${message}: ${err.message}`, kind, {
      cause: err,
      graphQlKind: err.kind,
    });
  }
  return new EngageError(`${message}: ${err?.message ?? String(err)}`, 'network', { cause: err });
}

function forkSourceError(owner, repo, prNumber) {
  return new EngageError(
    `PR ${owner}/${repo}#${prNumber} is a fork-source PR. Maintainer must rerun harness ` +
      `copilot-engage ${prNumber} after pulling the branch locally — fork PRs cannot be ` +
      `engaged from upstream because GITHUB_TOKEN is read-only on forks per ADR 0004 § ADR4-6.`,
    'fork-source',
  );
}

function shortSha(sha) {
  return typeof sha === 'string' && sha.length > 7 ? sha.slice(0, 7) : String(sha);
}

function formatSeconds(ms) {
  return `${Math.ceil(ms / 1000)}s`;
}
