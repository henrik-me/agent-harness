/**
 * tests/cs111-startup-version-preflight.test.mjs — CS111 (issue #502).
 *
 * Covers the get-latest-first version-mismatch preflight:
 *   (1) evaluateVersionMatch — pure comparator: exact/normalized match,
 *       mismatch (message names both versions + the npx re-run command),
 *       sentinel + SHA-pin exemptions, SHA-pin provenance match.
 *   (2) runStartup — the injected-runner seam: a mismatch is a 'broken' FAILED
 *       check that flips exitCode to 1; match/sentinel/skip never flip; the
 *       --skip-version-check escape hatch and a config-less checkout are skipped
 *       (never failed); ordering (post-pull, pre-clean) per C111-3.
 *   (3) formatTemplateMissingVersionHint + the sync ESYNC_MISSING_TEMPLATE throw
 *       — the render-time error names BOTH versions (C111-5).
 *
 * No real git/npm/process spawns for the startup seam. All scratch trees for the
 * sync unit live under os.tmpdir() — never under the repo root (that would race
 * check-text-encoding's recursive walk under parallel `node --test`).
 *
 * Run: node --test tests/cs111-startup-version-preflight.test.mjs
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

import {
  evaluateVersionMatch,
  computeRerunRef,
  normalizeVersion,
  formatTemplateMissingVersionHint,
} from '../lib/version-check.mjs';
import { runStartup } from '../lib/startup.mjs';
import { sync, SyncError } from '../lib/sync.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const SHA_A = 'a'.repeat(40);
const SHA_ZERO = '0'.repeat(40);

// ---------------------------------------------------------------------------
// (1) evaluateVersionMatch — pure comparator
// ---------------------------------------------------------------------------

describe('CS111 (1) evaluateVersionMatch — normalized compare + exemptions', () => {
  it('exact match: 0.17.0 vs 0.17.0', () => {
    const v = evaluateVersionMatch({ runningPkgVersion: '0.17.0', configVersion: '0.17.0' });
    assert.equal(v.outcome, 'match');
    assert.equal(v.exemptReason, null);
  });

  it('normalized match: bare pkg 0.17.0 vs v-prefixed config v0.17.0', () => {
    const v = evaluateVersionMatch({ runningPkgVersion: '0.17.0', configVersion: 'v0.17.0' });
    assert.equal(v.outcome, 'match');
  });

  it('normalized match (reverse): v-prefixed pkg v0.17.0 vs bare config 0.17.0', () => {
    const v = evaluateVersionMatch({ runningPkgVersion: 'v0.17.0', configVersion: '0.17.0' });
    assert.equal(v.outcome, 'match');
  });

  it('mismatch: 0.16.0 vs v0.17.0 — outcome mismatch + message names both versions and npx#v0.17.0', () => {
    const v = evaluateVersionMatch({ runningPkgVersion: '0.16.0', configVersion: 'v0.17.0' });
    assert.equal(v.outcome, 'mismatch');
    assert.equal(v.rerunRef, 'v0.17.0');
    assert.match(v.message, /0\.16\.0/, 'names the running version');
    assert.match(v.message, /v0\.17\.0/, 'names the pinned version');
    assert.match(
      v.message,
      /npx -y github:henrik-me\/agent-harness#v0\.17\.0/,
      'gives the corrective npx re-run command',
    );
    assert.match(v.message, /--skip-version-check/, 'mentions the escape hatch');
  });

  it('mismatch: a bare config 0.16.0 re-run ref is v-normalized to v0.16.0', () => {
    const v = evaluateVersionMatch({ runningPkgVersion: '0.17.0', configVersion: '0.16.0' });
    assert.equal(v.outcome, 'mismatch');
    assert.equal(v.rerunRef, 'v0.16.0');
    assert.match(v.message, /#v0\.16\.0/);
  });

  it('sentinel exempt: 0.0.0-pre', () => {
    const v = evaluateVersionMatch({ runningPkgVersion: '0.17.0', configVersion: '0.0.0-pre' });
    assert.equal(v.outcome, 'exempt');
    assert.equal(v.exemptReason, 'sentinel');
  });

  it('sentinel exempt: plain 0.0.0', () => {
    const v = evaluateVersionMatch({ runningPkgVersion: '0.17.0', configVersion: '0.0.0' });
    assert.equal(v.outcome, 'exempt');
    assert.equal(v.exemptReason, 'sentinel');
  });

  it('sentinel exempt: v-prefixed sentinel (v0.0.0-pre) checked on the normalized form', () => {
    const v = evaluateVersionMatch({ runningPkgVersion: '0.17.0', configVersion: 'v0.0.0-pre' });
    assert.equal(v.outcome, 'exempt');
    assert.equal(v.exemptReason, 'sentinel');
  });

  it('SHA-pin config with no provenance → exempt (sha-pin-unresolvable)', () => {
    const v = evaluateVersionMatch({ runningPkgVersion: '0.17.0', configVersion: SHA_A });
    assert.equal(v.outcome, 'exempt');
    assert.equal(v.exemptReason, 'sha-pin-unresolvable');
  });

  it('SHA-pin config with all-zero provenance → exempt (sha-pin-unresolvable)', () => {
    const v = evaluateVersionMatch({
      runningPkgVersion: '0.17.0',
      configVersion: SHA_A,
      provenance: { resolved_sha: SHA_ZERO },
    });
    assert.equal(v.outcome, 'exempt');
    assert.equal(v.exemptReason, 'sha-pin-unresolvable');
  });

  it('SHA-pin config with a matching (case-insensitive) resolved_sha → match', () => {
    const v = evaluateVersionMatch({
      runningPkgVersion: '0.17.0',
      configVersion: SHA_A,
      provenance: { resolved_sha: SHA_A.toUpperCase() },
    });
    assert.equal(v.outcome, 'match');
  });

  it('defensive: undefined/partial input never throws (empty config → exempt)', () => {
    assert.doesNotThrow(() => evaluateVersionMatch({}));
    assert.equal(evaluateVersionMatch({}).outcome, 'exempt');
    assert.equal(evaluateVersionMatch({ runningPkgVersion: '', configVersion: '0.17.0' }).exemptReason, 'running-version-unknown');
  });

  it('helpers: normalizeVersion strips a single leading v; computeRerunRef normalizes the v prefix to lowercase, keeps SHAs verbatim', () => {
    assert.equal(normalizeVersion('V0.17.0'), '0.17.0');
    assert.equal(computeRerunRef('0.17.0'), 'v0.17.0');
    assert.equal(computeRerunRef('v0.17.0'), 'v0.17.0');
    assert.equal(computeRerunRef('V0.17.0'), 'v0.17.0');
    assert.equal(computeRerunRef(SHA_A), SHA_A);
  });
});

// ---------------------------------------------------------------------------
// (2) runStartup — injected-runner seam
// ---------------------------------------------------------------------------

function emptySnapshot() {
  return {
    activeWorkRows: [],
    plannedListings: [],
    activeListings: [],
    agentId: 'omni-ah',
    counts: { activeWorkRows: 0, planned: 0, active: 0 },
  };
}

/** All broken checks pass, so ONLY the version-pin check can flip the exit code. */
function makeRunner(versionInfo, overrides = {}) {
  return {
    gitHead: () => '0123456789abcdef0123456789abcdef01234567',
    gitWorktreeClean: () => true,
    gitPullFfOnly: () => ({ ok: true, message: 'fast-forward OK' }),
    readVersionInfo: () => versionInfo,
    runTests: () => ({ ok: true, summary: '1 pass / 0 fail' }),
    runLint: () => ({ ok: true, summary: '1 passed / 0 failed / 0 skipped' }),
    runSyncCheck: () => ({ ok: true, summary: 'no drift detected' }),
    ...overrides,
  };
}

const versionCheck = (r) => r.checks.find((c) => c.name === 'version pin (get-latest-first)');

describe('CS111 (2) runStartup — version-pin preflight via the injected runner', () => {
  it('mismatch → a broken FAILED check and exitCode 1', () => {
    const r = runStartup({
      runner: makeRunner({ pkgVersion: '0.16.0', configVersion: 'v0.17.0', provenance: null }),
      snapshot: emptySnapshot(),
      agentId: 'omni-ah',
    });
    const vc = versionCheck(r);
    assert.ok(vc, 'version-pin check is present');
    assert.equal(vc.status, 'fail');
    assert.equal(vc.severity, 'broken');
    assert.equal(r.exitCode, 1, 'a real mismatch fails fast');
    assert.match(vc.message, /0\.16\.0/);
    assert.match(vc.message, /v0\.17\.0/);
    assert.match(vc.message, /npx -y github:henrik-me\/agent-harness#v0\.17\.0 startup/);
    assert.match(vc.message, /--skip-version-check/);
    // Short-circuit (C111-3 / Copilot): a mismatch must SKIP the remaining
    // clean/tests/lint/sync checks so the operator sees only the re-run message.
    assert.equal(r.checks.length, 1, 'mismatch short-circuits — only the version-pin check runs');
    for (const name of ['clean worktree', 'node --test tests/*.test.mjs', 'harness lint --quiet', 'harness sync --mode=check']) {
      assert.equal(r.checks.find((c) => c.name === name), undefined, `${name} must be skipped on mismatch`);
    }
  });

  it('mismatch with --pull-ff-only → ff-probe kept, but clean/tests/lint/sync short-circuited', () => {
    const r = runStartup({
      runner: makeRunner({ pkgVersion: '0.16.0', configVersion: 'v0.17.0', provenance: null }),
      snapshot: emptySnapshot(),
      agentId: 'omni-ah',
      opts: { pullFfOnly: true },
    });
    assert.equal(r.exitCode, 1);
    assert.ok(r.checks.find((c) => c.name === 'git fast-forward probe'), 'ff-probe runs before the version pin and is kept');
    assert.equal(versionCheck(r).status, 'fail');
    assert.equal(r.checks.length, 2, 'only ff-probe + version-pin run; the rest are short-circuited');
    for (const name of ['clean worktree', 'node --test tests/*.test.mjs', 'harness lint --quiet', 'harness sync --mode=check']) {
      assert.equal(r.checks.find((c) => c.name === name), undefined, `${name} must be skipped on mismatch`);
    }
  });

  it('exact match → pass check, exitCode 0', () => {
    const r = runStartup({
      runner: makeRunner({ pkgVersion: '0.17.0', configVersion: '0.17.0', provenance: null }),
      snapshot: emptySnapshot(),
      agentId: 'omni-ah',
    });
    assert.equal(versionCheck(r).status, 'pass');
    assert.equal(r.exitCode, 0);
  });

  it('normalized match (0.17.0 pkg vs v0.17.0 config) → pass check, exitCode 0', () => {
    const r = runStartup({
      runner: makeRunner({ pkgVersion: '0.17.0', configVersion: 'v0.17.0', provenance: null }),
      snapshot: emptySnapshot(),
      agentId: 'omni-ah',
    });
    assert.equal(versionCheck(r).status, 'pass');
    assert.equal(r.exitCode, 0);
  });

  it('self-host 0.0.0-pre sentinel → skip (exempt), exitCode NOT forced to 1', () => {
    const r = runStartup({
      runner: makeRunner({ pkgVersion: '0.17.0', configVersion: '0.0.0-pre', provenance: null }),
      snapshot: emptySnapshot(),
      agentId: 'omni-ah',
    });
    const vc = versionCheck(r);
    assert.equal(vc.status, 'skip');
    assert.match(vc.message, /sentinel/);
    assert.equal(r.exitCode, 0, 'self-host must never false-fail on the version check');
  });

  it('--skip-version-check suppresses the failure even on a mismatch', () => {
    const r = runStartup({
      runner: makeRunner({ pkgVersion: '0.16.0', configVersion: 'v0.17.0', provenance: null }),
      snapshot: emptySnapshot(),
      agentId: 'omni-ah',
      opts: { skipVersionCheck: true },
    });
    const vc = versionCheck(r);
    assert.equal(vc.status, 'skip');
    assert.match(vc.message, /--skip-version-check/);
    assert.equal(r.exitCode, 0);
  });

  it('readVersionInfo() === null (no config / fresh checkout) → skipped, not failed', () => {
    const r = runStartup({
      runner: makeRunner(null),
      snapshot: emptySnapshot(),
      agentId: 'omni-ah',
    });
    const vc = versionCheck(r);
    assert.equal(vc.status, 'skip');
    assert.match(vc.message, /fresh checkout/);
    assert.equal(r.exitCode, 0);
  });

  it('additive: a runner WITHOUT readVersionInfo adds no version check (back-compat)', () => {
    const runner = makeRunner({ pkgVersion: '0.16.0', configVersion: 'v0.17.0' });
    delete runner.readVersionInfo;
    const r = runStartup({ runner, snapshot: emptySnapshot(), agentId: 'omni-ah' });
    assert.equal(versionCheck(r), undefined);
    assert.equal(r.exitCode, 0);
  });

  it('ordering (C111-3): the version-pin check runs AFTER the ff probe and BEFORE clean worktree', () => {
    const r = runStartup({
      runner: makeRunner({ pkgVersion: '0.17.0', configVersion: 'v0.17.0', provenance: null }),
      snapshot: emptySnapshot(),
      agentId: 'omni-ah',
      opts: { pullFfOnly: true },
    });
    const names = r.checks.map((c) => c.name);
    assert.deepEqual(names.slice(0, 3), [
      'git fast-forward probe',
      'version pin (get-latest-first)',
      'clean worktree',
    ]);
  });

  it('mismatch re-run command echoes the same startup args (--pull-ff-only)', () => {
    const r = runStartup({
      runner: makeRunner({ pkgVersion: '0.16.0', configVersion: 'v0.17.0', provenance: null }),
      snapshot: emptySnapshot(),
      agentId: 'omni-ah',
      opts: { pullFfOnly: true },
    });
    assert.match(versionCheck(r).message, /#v0\.17\.0 startup --pull-ff-only/);
  });
});

// ---------------------------------------------------------------------------
// (3) Clearer Template-not-found error (C111-5)
// ---------------------------------------------------------------------------

describe('CS111 (3) formatTemplateMissingVersionHint', () => {
  it('names both versions when both are known', () => {
    const h = formatTemplateMissingVersionHint({ runningPkgVersion: '0.16.0', configVersion: 'v0.17.0' });
    assert.match(h, /0\.16\.0/);
    assert.match(h, /v0\.17\.0/);
    assert.match(h, /npx -y github:henrik-me\/agent-harness#v0\.17\.0/);
  });

  it('degrades to "unknown" when one version is missing but the other is known', () => {
    const h = formatTemplateMissingVersionHint({ runningPkgVersion: '', configVersion: 'v0.17.0' });
    assert.match(h, /unknown/);
    assert.match(h, /v0\.17\.0/);
  });

  it('returns "" (fail-soft) when neither version is available', () => {
    assert.equal(formatTemplateMissingVersionHint({}), '');
  });
});

describe('CS111 (3) sync ESYNC_MISSING_TEMPLATE error names both versions', () => {
  const tmpDirs = [];
  after(() => {
    for (const d of tmpDirs) {
      try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  function tmp(prefix) {
    const d = mkdtempSync(path.join(os.tmpdir(), prefix));
    tmpDirs.push(d);
    return d;
  }

  function writeText(filePath, content) {
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, 'utf8');
  }

  // Hermetic harness checkout so provenance never shells out to ambient git.
  const PROVENANCE_DEPS = {
    installRoot: '/cs111-hermetic-harness-checkout',
    readFileSync: () => { throw new Error('no npx cache in hermetic fixture'); },
    execSync: (cmd) => {
      if (cmd.includes('rev-parse HEAD')) return `${'a'.repeat(40)}\n`;
      if (cmd.includes('describe --tags --exact-match')) return 'v0.16.0\n';
      if (cmd.includes('rev-parse --abbrev-ref')) return 'main\n';
      throw new Error(`unexpected git command in hermetic fixture: ${cmd}`);
    },
  };

  function buildHarnessRepo(dir, pkgVersion) {
    const realSchema = readFileSync(
      path.join(repoRoot, 'schemas', 'harness.config.schema.json'),
      'utf8',
    );
    writeText(path.join(dir, 'schemas', 'harness.config.schema.json'), realSchema);
    writeText(path.join(dir, 'package.json'), JSON.stringify({ name: 'h', version: pkgVersion }, null, 2) + '\n');
    // Intentionally NO template for the target so ESYNC_MISSING_TEMPLATE fires.
  }

  function buildConsumerRepo(dir, configVersion) {
    const cfg = {
      version: configVersion,
      project: { name: 'test-project', agent_suffix: 'test' },
      managed: { files: ['NOSUCH.md'] },
      composed: { files: [] },
      seeded: { files: [] },
      excluded: [],
      templating: {},
    };
    writeText(path.join(dir, 'harness.config.json'), JSON.stringify(cfg, null, 2) + '\n');
  }

  it('the thrown message includes both pkg.version and config.version (C111-5)', async () => {
    const harnessDir = tmp('cs111-harness-');
    const consumerDir = tmp('cs111-consumer-');
    buildHarnessRepo(harnessDir, '0.16.0');
    buildConsumerRepo(consumerDir, 'v0.17.0');

    await assert.rejects(
      () => sync({
        consumerRepoPath: consumerDir,
        harnessRepoPath: harnessDir,
        mode: 'check',
        provenanceDeps: PROVENANCE_DEPS,
      }),
      (err) => {
        assert.ok(err instanceof SyncError, 'is a SyncError');
        assert.equal(err.code, 'ESYNC_MISSING_TEMPLATE', 'code is unchanged');
        assert.match(err.message, /Template file not found/, 'keeps the original message');
        assert.match(err.message, /0\.16\.0/, 'names the running pkg.version');
        assert.match(err.message, /v0\.17\.0/, 'names the pinned config.version');
        return true;
      },
    );
  });

  it('fail-soft: a harness checkout with no package.json still throws ESYNC_MISSING_TEMPLATE', async () => {
    const harnessDir = tmp('cs111-harness-nopkg-');
    const consumerDir = tmp('cs111-consumer-nopkg-');
    // Schema only — no package.json (running pkg.version unreadable).
    const realSchema = readFileSync(path.join(repoRoot, 'schemas', 'harness.config.schema.json'), 'utf8');
    writeText(path.join(harnessDir, 'schemas', 'harness.config.schema.json'), realSchema);
    buildConsumerRepo(consumerDir, 'v0.17.0');

    await assert.rejects(
      () => sync({
        consumerRepoPath: consumerDir,
        harnessRepoPath: harnessDir,
        mode: 'check',
        provenanceDeps: PROVENANCE_DEPS,
      }),
      (err) => {
        assert.ok(err instanceof SyncError);
        assert.equal(err.code, 'ESYNC_MISSING_TEMPLATE');
        // pkg.version unknown, config.version still surfaced.
        assert.match(err.message, /v0\.17\.0/);
        return true;
      },
    );
  });
});
