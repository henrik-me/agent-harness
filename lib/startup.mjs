/**
 * lib/startup.mjs — read-only session-bootstrap verb (CS64 C64-3).
 *
 * Mechanizes the INSTRUCTIONS.md § Session Start sanity sequence into a
 * single command. Read-only and advisory: it reports the state of the repo
 * but never mutates anything. The exit code is binary — non-zero ONLY on a
 * genuinely broken tree (the "main is green" gate per C64-3), so an
 * orchestrator that just wants to see "what's in flight?" can run it freely
 * without it ever wedging a claim.
 *
 * Checks run, in order:
 *   1. git fast-forward probe (`git pull --ff-only` if requested)  — advisory
 *   2. clean-worktree check                                         — advisory
 *   3. `node --test tests/*.test.mjs`                               — broken
 *   4. `harness lint --quiet`                                       — broken
 *   5. `harness sync --mode=check`                                  — broken
 *
 * Output:
 *   - Agent ID + HEAD SHA (the "INSTRUCTIONS re-read @ <SHA>" line).
 *   - One status line per check (✓/⚠/✖).
 *   - The in-flight planned/active CS listing (delegates to lib/status.mjs).
 *
 * All git / shell / npm-test access is funnelled through an injectable
 * `runner` interface so unit tests can drive the pure logic without spawning
 * any process or touching the real worktree (R6/LRN-094 test hygiene).
 *
 * Zero runtime dependencies beyond Node 20+ stdlib + lib/status.mjs.
 *
 * @module lib/startup.mjs
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { getStatusSnapshotFromDisk, formatStatusReport } from './status.mjs';

/**
 * @typedef {object} CheckResult
 * @property {string}   name       - Human-readable label (e.g. 'git fast-forward').
 * @property {'pass'|'fail'|'skip'} status
 * @property {'broken'|'advisory'} severity
 * @property {string}   [message]  - One-line detail (always present on fail).
 */

/**
 * @typedef {object} StartupRunner
 * @property {() => string} gitHead
 * @property {() => boolean} gitWorktreeClean
 * @property {() => {ok: boolean, message: string}} [gitPullFfOnly]
 * @property {() => {ok: boolean, summary: string}} runTests
 * @property {() => {ok: boolean, summary: string}} runLint
 * @property {() => {ok: boolean, summary: string}} runSyncCheck
 */

/**
 * @typedef {object} StartupResult
 * @property {string}          agentId
 * @property {string}          headSha
 * @property {CheckResult[]}   checks
 * @property {0|1}             exitCode  - 1 iff any 'broken'-severity check failed.
 * @property {object}          snapshot  - The lib/status snapshot (in-flight arc).
 */

/**
 * Run the bootstrap sequence against an injected runner.
 *
 * @param {object} args
 * @param {StartupRunner} args.runner
 * @param {object}        args.snapshot - lib/status.mjs snapshot for the report tail.
 * @param {string}        args.agentId
 * @param {object}        [args.opts]
 * @param {boolean}       [args.opts.pullFfOnly]  - When true, run the git fast-forward probe.
 * @returns {StartupResult}
 */
export function runStartup({ runner, snapshot, agentId, opts = {} }) {
  const checks = /** @type {CheckResult[]} */ ([]);
  const headSha = runner.gitHead();

  if (opts.pullFfOnly && typeof runner.gitPullFfOnly === 'function') {
    const r = runner.gitPullFfOnly();
    checks.push({
      name: 'git fast-forward probe',
      status: r.ok ? 'pass' : 'fail',
      severity: 'advisory',
      message: r.message,
    });
  }

  const clean = runner.gitWorktreeClean();
  checks.push({
    name: 'clean worktree',
    status: clean ? 'pass' : 'fail',
    severity: 'advisory',
    message: clean ? '' : 'worktree has uncommitted changes (advisory — normal during work)',
  });

  const tests = runner.runTests();
  checks.push({
    name: 'node --test tests/*.test.mjs',
    status: tests.ok ? 'pass' : 'fail',
    severity: 'broken',
    message: tests.summary,
  });

  const lint = runner.runLint();
  checks.push({
    name: 'harness lint --quiet',
    status: lint.ok ? 'pass' : 'fail',
    severity: 'broken',
    message: lint.summary,
  });

  const sync = runner.runSyncCheck();
  checks.push({
    name: 'harness sync --mode=check',
    status: sync.ok ? 'pass' : 'fail',
    severity: 'broken',
    message: sync.summary,
  });

  const broken = checks.some((c) => c.status === 'fail' && c.severity === 'broken');
  return {
    agentId,
    headSha,
    checks,
    exitCode: broken ? 1 : 0,
    snapshot,
  };
}

/** Status glyph for a check. */
function glyph(c) {
  if (c.status === 'pass') return '✓';
  if (c.status === 'skip') return '–';
  return c.severity === 'broken' ? '✖' : '⚠';
}

/**
 * Render a startup result as a human-readable report ending in a trailing newline.
 *
 * @param {StartupResult} r
 * @returns {string}
 */
export function formatStartupReport(r) {
  const lines = [];
  lines.push(`harness startup — agent ${r.agentId}`);
  lines.push(`INSTRUCTIONS.md re-read complete @ ${r.headSha}`);
  lines.push('');
  lines.push('Bootstrap sanity check:');
  for (const c of r.checks) {
    const tag = c.severity === 'broken' ? '' : ' (advisory)';
    const detail = c.message ? ` — ${c.message}` : '';
    lines.push(`  ${glyph(c)} ${c.name}${tag}${detail}`);
  }
  lines.push('');
  lines.push(formatStatusReport(r.snapshot).trimEnd());
  return lines.join('\n') + '\n';
}

/**
 * Build a real runner that shells out to git/node/harness on disk. Used by
 * the CLI; tests inject a stub runner instead.
 *
 * @param {object} args
 * @param {string} args.cwd
 * @param {string} args.harnessBin - Absolute path to bin/harness.mjs (so the
 *   sub-invocation is anchored at the same install the caller is running).
 * @returns {StartupRunner}
 */
export function createDefaultRunner({ cwd, harnessBin }) {
  const spawnOpts = { cwd, encoding: 'utf8', shell: true };

  const runGit = (args) => spawnSync('git', args, spawnOpts);
  const runNode = (args) => spawnSync(process.execPath, args, { ...spawnOpts, shell: false });
  const runHarness = (args) =>
    spawnSync(process.execPath, [harnessBin, ...args], { ...spawnOpts, shell: false });

  return {
    gitHead() {
      const r = runGit(['log', '-1', '--format=%H']);
      if (r.status !== 0) return '';
      return (r.stdout || '').trim();
    },
    gitWorktreeClean() {
      const r = runGit(['status', '--porcelain']);
      if (r.status !== 0) return false;
      return (r.stdout || '').trim().length === 0;
    },
    gitPullFfOnly() {
      const r = runGit(['pull', '--ff-only', 'origin', 'main']);
      const ok = r.status === 0;
      const out = ((r.stdout || '') + (r.stderr || '')).trim().split('\n').pop() || '';
      return { ok, message: ok ? 'fast-forward OK' : `pull failed: ${out}` };
    },
    runTests() {
      const r = runNode(['--test', 'tests/*.test.mjs']);
      const text = (r.stdout || '') + (r.stderr || '');
      const passMatch = /ℹ pass (\d+)/.exec(text);
      const failMatch = /ℹ fail (\d+)/.exec(text);
      const pass = passMatch ? Number(passMatch[1]) : 0;
      const fail = failMatch ? Number(failMatch[1]) : 0;
      return {
        ok: r.status === 0,
        summary:
          r.status === 0
            ? `${pass} pass / ${fail} fail`
            : `node --test exited ${r.status}; ${pass} pass / ${fail} fail`,
      };
    },
    runLint() {
      const r = runHarness(['lint', '--quiet']);
      const text = (r.stdout || '') + (r.stderr || '');
      const totalMatch = /Total: (\d+) passed, (\d+) failed, (\d+) skipped/.exec(text);
      if (totalMatch) {
        const [, p, f, s] = totalMatch;
        return {
          ok: r.status === 0,
          summary: `${p} passed / ${f} failed / ${s} skipped`,
        };
      }
      return { ok: r.status === 0, summary: r.status === 0 ? 'lint passed' : `lint exited ${r.status}` };
    },
    runSyncCheck() {
      const r = runHarness(['sync', '--mode=check']);
      const text = (r.stdout || '') + (r.stderr || '');
      const lastLine = text.trim().split('\n').slice(-1)[0] || '';
      return {
        ok: r.status === 0,
        summary: r.status === 0 ? 'no drift detected' : `sync check failed: ${lastLine}`,
      };
    },
  };
}

/**
 * Convenience: run startup against the real disk + render the report.
 *
 * @param {object} args
 * @param {string} args.cwd
 * @param {string} args.harnessBin
 * @param {string} args.agentId
 * @param {object} [args.opts]
 * @returns {StartupResult}
 */
export function runStartupFromDisk({ cwd, harnessBin, agentId, opts = {} }) {
  const runner = createDefaultRunner({ cwd, harnessBin });
  const snapshot = getStatusSnapshotFromDisk({ cwd, agentId });
  return runStartup({ runner, snapshot, agentId, opts });
}
