/**
 * tests/lib-github-graphql.test.mjs — Tests for lib/github-graphql.mjs.
 *
 * Run: node --test tests/lib-github-graphql.test.mjs
 *
 * Pattern mirrors lib-github-detect.test.mjs (CS37 ADR4-1):
 *   - Override __testSeam.fetch + __testSeam.spawnSync to control transport.
 *   - Restore originals in afterEach to keep tests isolated.
 *   - Never write transient files under REPO_ROOT (LRN-094).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  graphql,
  requestCopilotReview,
  GraphQLError,
  __testSeam,
} from '../lib/github-graphql.mjs';

const originalFetch = __testSeam.fetch;
const originalSpawnSync = __testSeam.spawnSync;
const originalToken = process.env.GITHUB_TOKEN;
const originalGhToken = process.env.GH_TOKEN;

test.afterEach(() => {
  __testSeam.fetch = originalFetch;
  __testSeam.spawnSync = originalSpawnSync;
  if (originalToken === undefined) {
    delete process.env.GITHUB_TOKEN;
  } else {
    process.env.GITHUB_TOKEN = originalToken;
  }
  if (originalGhToken === undefined) {
    delete process.env.GH_TOKEN;
  } else {
    process.env.GH_TOKEN = originalGhToken;
  }
});

// ---------------------------------------------------------------------------
// graphql() — happy paths via fetch
// ---------------------------------------------------------------------------

test('graphql via fetch: successful query returns parsed data', async () => {
  process.env.GITHUB_TOKEN = 'ghp_test';
  __testSeam.fetch = async (url, init) => {
    assert.equal(url, 'https://api.github.com/graphql');
    assert.equal(init.method, 'POST');
    assert.match(init.headers.Authorization, /^Bearer ghp_test$/);
    const body = JSON.parse(init.body);
    assert.equal(body.query, 'query { viewer { login } }');
    assert.deepEqual(body.variables, {});
    return mockResponse(200, { data: { viewer: { login: 'henrik-me' } } });
  };

  const data = await graphql('query { viewer { login } }', {}, { transport: 'fetch' });
  assert.deepEqual(data, { viewer: { login: 'henrik-me' } });
});

test('graphql via fetch: successful mutation passes variables', async () => {
  process.env.GITHUB_TOKEN = 'ghp_test';
  __testSeam.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.deepEqual(body.variables, { id: 'PR_xyz' });
    return mockResponse(200, { data: { mutated: true } });
  };

  const data = await graphql(
    'mutation($id:ID!) { foo(id: $id) }',
    { id: 'PR_xyz' },
    { transport: 'fetch' },
  );
  assert.deepEqual(data, { mutated: true });
});

// ---------------------------------------------------------------------------
// graphql() — error paths via fetch
// ---------------------------------------------------------------------------

test('graphql via fetch: missing token throws auth-missing', async () => {
  delete process.env.GITHUB_TOKEN;
  delete process.env.GH_TOKEN;
  // Stub gh auth token to also fail.
  __testSeam.spawnSync = () => ({ status: 1, stdout: '', stderr: '' });

  await assert.rejects(
    graphql('query { viewer { login } }', {}, { transport: 'fetch' }),
    (err) => {
      assert.ok(err instanceof GraphQLError);
      assert.equal(err.kind, 'auth-missing');
      assert.match(err.message, /GITHUB_TOKEN\/GH_TOKEN/);
      return true;
    },
  );
});

test('graphql via fetch: HTTP 500 throws http-status with status field', async () => {
  process.env.GITHUB_TOKEN = 'ghp_test';
  __testSeam.fetch = async () => mockResponse(500, 'internal error');

  await assert.rejects(
    graphql('query { viewer { login } }', {}, { transport: 'fetch' }),
    (err) => {
      assert.equal(err.kind, 'http-status');
      assert.equal(err.status, 500);
      assert.match(err.message, /HTTP 500/);
      return true;
    },
  );
});

test('graphql via fetch: response.errors[] throws graphql-errors', async () => {
  process.env.GITHUB_TOKEN = 'ghp_test';
  __testSeam.fetch = async () =>
    mockResponse(200, {
      errors: [
        { type: 'NOT_FOUND', message: 'Could not resolve to a User' },
      ],
    });

  await assert.rejects(
    graphql('query { foo }', {}, { transport: 'fetch' }),
    (err) => {
      assert.equal(err.kind, 'graphql-errors');
      assert.ok(Array.isArray(err.graphqlErrors));
      assert.equal(err.graphqlErrors[0].type, 'NOT_FOUND');
      return true;
    },
  );
});

test('graphql via fetch: fetch throw propagates as network error', async () => {
  process.env.GITHUB_TOKEN = 'ghp_test';
  __testSeam.fetch = async () => {
    throw new Error('connect ETIMEDOUT');
  };

  await assert.rejects(
    graphql('query { foo }', {}, { transport: 'fetch' }),
    (err) => {
      assert.equal(err.kind, 'network');
      assert.match(err.message, /ETIMEDOUT/);
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// graphql() — gh transport
// ---------------------------------------------------------------------------

test('graphql via gh: successful query parses stdout JSON', async () => {
  __testSeam.spawnSync = (cmd, args) => {
    assert.equal(cmd, 'gh');
    assert.deepEqual(args.slice(0, 3), ['api', 'graphql', '-f']);
    return {
      status: 0,
      stdout: JSON.stringify({ data: { viewer: { login: 'henrik-me' } } }),
      stderr: '',
    };
  };

  const data = await graphql('query { viewer { login } }', {}, { transport: 'gh' });
  assert.deepEqual(data, { viewer: { login: 'henrik-me' } });
});

test('graphql via gh: GraphQL errors parsed from stdout even on non-zero exit', async () => {
  __testSeam.spawnSync = () => ({
    status: 1,
    stdout: JSON.stringify({
      data: null,
      errors: [{ type: 'NOT_FOUND', message: 'no resolve' }],
    }),
    stderr: 'gh: not found',
  });

  await assert.rejects(
    graphql('query { foo }', {}, { transport: 'gh' }),
    (err) => {
      assert.equal(err.kind, 'graphql-errors');
      return true;
    },
  );
});

test('graphql via gh: gh-not-authenticated stderr maps to auth-missing', async () => {
  __testSeam.spawnSync = () => ({
    status: 4,
    stdout: '',
    stderr: 'You are not authenticated. Please run gh auth login.',
  });

  await assert.rejects(
    graphql('query { viewer { login } }', {}, { transport: 'gh' }),
    (err) => {
      assert.equal(err.kind, 'auth-missing');
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// requestCopilotReview()
// ---------------------------------------------------------------------------

test('requestCopilotReview: invokes gh pr edit with correct args', () => {
  let capturedArgs;
  __testSeam.spawnSync = (cmd, args) => {
    capturedArgs = { cmd, args };
    return { status: 0, stdout: 'https://github.com/o/r/pull/42\n', stderr: '' };
  };

  const result = requestCopilotReview({ owner: 'o', repo: 'r' }, 42);

  assert.equal(result.ok, true);
  assert.equal(result.login, 'copilot-pull-request-reviewer');
  assert.equal(capturedArgs.cmd, 'gh');
  assert.deepEqual(capturedArgs.args, [
    'pr',
    'edit',
    '42',
    '--repo',
    'o/r',
    '--add-reviewer',
    'copilot-pull-request-reviewer',
  ]);
});

test('requestCopilotReview: opts.login overrides the default reviewer', () => {
  let capturedArgs;
  __testSeam.spawnSync = (cmd, args) => {
    capturedArgs = args;
    return { status: 0, stdout: '', stderr: '' };
  };

  const result = requestCopilotReview({ owner: 'o', repo: 'r' }, 1, { login: 'other-bot' });
  assert.equal(result.login, 'other-bot');
  assert.ok(capturedArgs.includes('other-bot'));
});

test('requestCopilotReview: missing repo throws', () => {
  assert.throws(() => requestCopilotReview(null, 1), GraphQLError);
  assert.throws(() => requestCopilotReview({ owner: 'o' }, 1), GraphQLError);
});

test('requestCopilotReview: non-integer prNumber throws', () => {
  assert.throws(() => requestCopilotReview({ owner: 'o', repo: 'r' }, '1'), GraphQLError);
  assert.throws(() => requestCopilotReview({ owner: 'o', repo: 'r' }, 0), GraphQLError);
});

test('requestCopilotReview: non-zero gh exit with auth message maps to auth-missing', () => {
  __testSeam.spawnSync = () => ({
    status: 1,
    stdout: '',
    stderr: 'gh: not authenticated; please gh auth login first',
  });

  assert.throws(
    () => requestCopilotReview({ owner: 'o', repo: 'r' }, 1),
    (err) => {
      assert.equal(err.kind, 'auth-missing');
      return true;
    },
  );
});

test('requestCopilotReview: non-zero gh exit with non-auth message includes scope hint', () => {
  __testSeam.spawnSync = () => ({
    status: 1,
    stdout: '',
    stderr: 'GraphQL: not enough permissions',
  });

  assert.throws(
    () => requestCopilotReview({ owner: 'o', repo: 'r' }, 1),
    (err) => {
      assert.equal(err.kind, 'network');
      assert.match(err.message, /pull_request:write/);
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function mockResponse(status, body) {
  return {
    status,
    async json() {
      if (typeof body === 'string') {
        throw new Error('Not JSON');
      }
      return body;
    },
    async text() {
      return typeof body === 'string' ? body : JSON.stringify(body);
    },
  };
}
