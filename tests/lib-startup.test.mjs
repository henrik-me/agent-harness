/**
 * tests/lib-startup.test.mjs — unit tests for lib/startup.mjs (CS64 C64-3).
 *
 * Tests drive the pure runStartup() / formatStartupReport() against a stub
 * runner — no git, no spawnSync, no scratch files. The disk-touching path
 * (createDefaultRunner / runStartupFromDisk) is exercised only at the
 * integration level via the CLI smoke; here we keep it network-free.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runStartup, formatStartupReport, parseNodeTestSummary } from '../lib/startup.mjs';

function makeRunner(overrides = {}) {
  return {
    gitHead: () => '0123456789abcdef0123456789abcdef01234567',
    gitWorktreeClean: () => true,
    gitPullFfOnly: () => ({ ok: true, message: 'fast-forward OK' }),
    runTests: () => ({ ok: true, summary: '1181 pass / 0 fail' }),
    runLint: () => ({ ok: true, summary: '30 passed / 0 failed / 3 skipped' }),
    runSyncCheck: () => ({ ok: true, summary: 'no drift detected' }),
    ...overrides,
  };
}

function emptySnapshot() {
  return {
    activeWorkRows: [],
    plannedListings: [],
    activeListings: [],
    agentId: 'omni-ah',
    counts: { activeWorkRows: 0, planned: 0, active: 0 },
  };
}

test('runStartup: all-green produces exit 0 and the expected 4 checks (no pull probe)', () => {
  const r = runStartup({
    runner: makeRunner(),
    snapshot: emptySnapshot(),
    agentId: 'omni-ah',
  });
  assert.equal(r.exitCode, 0);
  assert.equal(r.agentId, 'omni-ah');
  assert.equal(r.headSha, '0123456789abcdef0123456789abcdef01234567');
  assert.equal(r.checks.length, 4);
  assert.deepEqual(
    r.checks.map((c) => c.name),
    [
      'clean worktree',
      'node --test tests/*.test.mjs',
      'harness lint --quiet',
      'harness sync --mode=check',
    ]
  );
  for (const c of r.checks) assert.equal(c.status, 'pass');
});

test('runStartup: opts.pullFfOnly inserts the git fast-forward probe as first check', () => {
  const r = runStartup({
    runner: makeRunner(),
    snapshot: emptySnapshot(),
    agentId: 'omni-ah',
    opts: { pullFfOnly: true },
  });
  assert.equal(r.checks.length, 5);
  assert.equal(r.checks[0].name, 'git fast-forward probe');
  assert.equal(r.checks[0].severity, 'advisory');
});

test('runStartup: dirty worktree fails the advisory check but exit stays 0', () => {
  const r = runStartup({
    runner: makeRunner({ gitWorktreeClean: () => false }),
    snapshot: emptySnapshot(),
    agentId: 'omni-ah',
  });
  assert.equal(r.exitCode, 0, 'advisory failure must not flip exit code');
  const cleanCheck = r.checks.find((c) => c.name === 'clean worktree');
  assert.equal(cleanCheck.status, 'fail');
  assert.equal(cleanCheck.severity, 'advisory');
  assert.match(cleanCheck.message, /worktree has uncommitted changes/);
});

test('runStartup: failed pull probe is advisory (does not flip exit code)', () => {
  const r = runStartup({
    runner: makeRunner({
      gitPullFfOnly: () => ({ ok: false, message: 'network unreachable' }),
    }),
    snapshot: emptySnapshot(),
    agentId: 'omni-ah',
    opts: { pullFfOnly: true },
  });
  assert.equal(r.exitCode, 0);
  assert.equal(r.checks[0].status, 'fail');
  assert.equal(r.checks[0].severity, 'advisory');
  assert.match(r.checks[0].message, /network unreachable/);
});

test('runStartup: failing tests flip exit code to 1 (broken tree gate)', () => {
  const r = runStartup({
    runner: makeRunner({
      runTests: () => ({ ok: false, summary: 'node --test exited 1; 1180 pass / 1 fail' }),
    }),
    snapshot: emptySnapshot(),
    agentId: 'omni-ah',
  });
  assert.equal(r.exitCode, 1);
});

test('runStartup: failing lint flips exit code to 1', () => {
  const r = runStartup({
    runner: makeRunner({
      runLint: () => ({ ok: false, summary: '29 passed / 1 failed / 3 skipped' }),
    }),
    snapshot: emptySnapshot(),
    agentId: 'omni-ah',
  });
  assert.equal(r.exitCode, 1);
});

test('runStartup: failing sync check flips exit code to 1', () => {
  const r = runStartup({
    runner: makeRunner({
      runSyncCheck: () => ({ ok: false, summary: 'sync check failed: drift detected' }),
    }),
    snapshot: emptySnapshot(),
    agentId: 'omni-ah',
  });
  assert.equal(r.exitCode, 1);
});

test('runStartup: pullFfOnly omitted when runner.gitPullFfOnly is absent even if opts asks', () => {
  const runner = makeRunner();
  delete runner.gitPullFfOnly;
  const r = runStartup({
    runner,
    snapshot: emptySnapshot(),
    agentId: 'omni-ah',
    opts: { pullFfOnly: true },
  });
  // No pull probe inserted; sequence reduces to the 4 standard checks.
  assert.equal(r.checks.length, 4);
  assert.notDeepEqual(r.checks[0].name, 'git fast-forward probe');
});

test('runStartup: snapshot is passed through to the result for the report tail', () => {
  const snap = {
    ...emptySnapshot(),
    plannedListings: [{ stage: 'planned', cs: 'CS65', slug: 'x', entry: 'planned/x', directoryForm: false }],
    counts: { activeWorkRows: 0, planned: 1, active: 0 },
  };
  const r = runStartup({ runner: makeRunner(), snapshot: snap, agentId: 'omni-ah' });
  assert.equal(r.snapshot.plannedListings.length, 1);
});

test('formatStartupReport: includes agent ID, HEAD SHA line, and check glyphs', () => {
  const r = runStartup({
    runner: makeRunner({
      gitWorktreeClean: () => false,
      runTests: () => ({ ok: false, summary: '1180 pass / 1 fail' }),
    }),
    snapshot: emptySnapshot(),
    agentId: 'omni-ah',
  });
  const out = formatStartupReport(r);
  assert.match(out, /harness startup — agent omni-ah/);
  assert.match(out, /INSTRUCTIONS\.md re-read complete @ 0123456789abcdef0123456789abcdef01234567/);
  assert.match(out, /⚠ clean worktree \(advisory\)/);
  assert.match(out, /✖ node --test/);
  assert.match(out, /✓ harness lint/);
  assert.match(out, /harness status — agent omni-ah/);
  assert.ok(out.endsWith('\n'));
});

test('formatStartupReport: pass-only run uses ✓ glyphs and elides "(advisory)" tag on broken checks', () => {
  const r = runStartup({
    runner: makeRunner(),
    snapshot: emptySnapshot(),
    agentId: 'omni-ah',
  });
  const out = formatStartupReport(r);
  assert.doesNotMatch(out, /✖/);
  assert.doesNotMatch(out, /⚠/);
  assert.match(out, /✓ node --test tests\/\*\.test\.mjs\b(?! \(advisory\))/);
});

/* ---------- parseNodeTestSummary ---------------------------------------- */

test('parseNodeTestSummary: parses spec-reporter output (TTY) — ℹ pass/fail', () => {
  const text = ['# tests/foo.test.mjs', 'ℹ tests 1273', 'ℹ pass 1272', 'ℹ fail 0', 'ℹ skipped 1'].join('\\n');
  assert.deepEqual(parseNodeTestSummary(text), { pass: 1272, fail: 0 });
});

test('parseNodeTestSummary: parses TAP-reporter output (non-TTY) — # pass/fail', () => {
  const text = ['TAP version 13', '1..3', 'ok 1 - foo', 'ok 2 - bar', 'ok 3 - baz', '# tests 3', '# pass 3', '# fail 0', '# duration_ms 12.345'].join('\\n');
  assert.deepEqual(parseNodeTestSummary(text), { pass: 3, fail: 0 });
});

test('parseNodeTestSummary: returns zeros on empty / unrecognized input', () => {
  assert.deepEqual(parseNodeTestSummary(''), { pass: 0, fail: 0 });
  assert.deepEqual(parseNodeTestSummary(null), { pass: 0, fail: 0 });
  assert.deepEqual(parseNodeTestSummary('random gibberish, no counts'), { pass: 0, fail: 0 });
});

