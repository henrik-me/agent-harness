/**
 * tests/cs82-lock-provenance.test.mjs — CS82 (#352-F2).
 *
 * Lock-provenance robustness for `harness sync --mode=apply` under npx/npm
 * installs. Exercises the exported, seam-injectable resolver
 * (`resolveHarnessProvenance`) + the apply-mode fail-closed validator
 * (`validateResolvedProvenance`) across every branch, plus `sync()` end-to-end
 * via the `provenanceDeps` seam.
 *
 * Every fixture lives under `os.tmpdir()` and every git/fs dependency is
 * injected — no test depends on the CLI's own `.git` or a real npx cache
 * (C82-7).
 *
 * Run: node --test tests/cs82-lock-provenance.test.mjs
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  readFileSync, existsSync, mkdtempSync, rmSync, mkdirSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  sync,
  SyncError,
  resolveHarnessProvenance,
  validateResolvedProvenance,
} from '../lib/sync.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const PKG_NAME = '@henrik-me/agent-harness';
const PKG_KEY = `node_modules/${PKG_NAME}`;
const SHA_A = 'abcdef0123456789abcdef0123456789abcdef01';
const SHA_B = '1234567890abcdef1234567890abcdef12345678';

// ---------------------------------------------------------------------------
// Helpers (os.tmpdir only)
// ---------------------------------------------------------------------------

function makeTmpDir(prefix = 'cs82-') {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

function removeTmpDir(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function writeText(filePath, content) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}

function writeJSON(filePath, obj) {
  writeText(filePath, JSON.stringify(obj, null, 2) + '\n');
}

/** Minimal harness repo: real config schema + a managed template stub. */
function buildHarnessRepo(dir) {
  const schema = readFileSync(
    path.join(repoRoot, 'schemas', 'harness.config.schema.json'),
    'utf8'
  );
  writeText(path.join(dir, 'schemas', 'harness.config.schema.json'), schema);
  writeText(path.join(dir, 'template', 'managed', 'INSTRUCTIONS.md'), '# Instructions\n');
}

/** Minimal consumer repo with a harness.config.json (overrides merged in). */
function buildConsumerRepo(dir, overrides = {}) {
  const config = {
    version: 'v0.1.0',
    project: { name: 'cs82-consumer', agent_suffix: 'c82' },
    managed: { files: [] },
    composed: { files: [] },
    seeded: { files: [] },
    excluded: [],
    templating: {},
    ...overrides,
  };
  writeJSON(path.join(dir, 'harness.config.json'), config);
}

/** Write an npm hidden lockfile at <projectRoot>/node_modules/.package-lock.json. */
function writeNpxCacheLock(projectRoot, entry) {
  const lock = {
    name: 'npx-install',
    lockfileVersion: 3,
    requires: true,
    packages: { [PKG_KEY]: entry },
  };
  writeJSON(path.join(projectRoot, 'node_modules', '.package-lock.json'), lock);
  return path.join(projectRoot, 'node_modules', PKG_NAME);
}

/** A fake git runner that resolves HEAD to `sha` and (optionally) tag `ref`. */
function fakeGit(sha, ref) {
  return (cmd) => {
    if (cmd.includes('rev-parse HEAD')) return `${sha}\n`;
    if (cmd.includes('describe --tags --exact-match')) {
      if (ref) return `${ref}\n`;
      throw new Error('no exact tag');
    }
    if (cmd.includes('rev-parse --abbrev-ref')) return `${ref ?? 'main'}\n`;
    throw new Error(`unexpected git command: ${cmd}`);
  };
}

const throwingRead = () => { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; };
const throwingGit = () => { throw new Error('git unavailable'); };

// ===========================================================================
// resolveHarnessProvenance() — branch coverage (pure, injected seams)
// ===========================================================================

describe('resolveHarnessProvenance() — npx/npm cache branch', () => {
  it('derives ref from the install spec `from` fragment + SHA from `resolved`', () => {
    const lock = JSON.stringify({
      packages: {
        [PKG_KEY]: {
          version: '0.10.0',
          resolved: `git+https://github.com/henrik-me/agent-harness.git#${SHA_A}`,
          from: 'github:henrik-me/agent-harness#v0.10.0',
        },
      },
    });
    const prov = resolveHarnessProvenance({
      installRoot: '/any/proj/node_modules/@henrik-me/agent-harness',
      readFileSync: () => lock,
      execSync: throwingGit,
    });
    assert.deepEqual(prov, { harness_ref: 'v0.10.0', resolved_sha: SHA_A, source: 'npx-cache' });
  });

  it('falls back to the package `version` when no spec fragment is present', () => {
    const lock = JSON.stringify({
      packages: { [PKG_KEY]: { version: '0.10.0', resolved: `git+ssh://git@x#${SHA_A}` } },
    });
    const prov = resolveHarnessProvenance({
      installRoot: '/p/node_modules/@henrik-me/agent-harness',
      readFileSync: () => lock,
      execSync: throwingGit,
    });
    assert.equal(prov.harness_ref, '0.10.0');
    assert.equal(prov.resolved_sha, SHA_A);
    assert.equal(prov.source, 'npx-cache');
  });

  it('C82-7: a cache SHA WITHOUT any derivable ref falls through to fail-closed', () => {
    // resolved has a SHA but there is no `from`/`version` → no symbolic ref.
    const lock = JSON.stringify({
      packages: { [PKG_KEY]: { resolved: `git+https://x#${SHA_A}` } },
    });
    const prov = resolveHarnessProvenance({
      installRoot: '/p/node_modules/@henrik-me/agent-harness',
      readFileSync: () => lock,
      execSync: throwingGit, // git also unavailable → placeholder
    });
    assert.equal(prov.source, 'none');
    assert.equal(prov.harness_ref, 'unknown');
    assert.equal(prov.resolved_sha, '0'.repeat(40));
  });

  it('falls through when the resolved URL carries no 40-hex SHA', () => {
    const lock = JSON.stringify({
      packages: { [PKG_KEY]: { version: '0.10.0', resolved: 'git+https://x#not-a-sha' } },
    });
    const prov = resolveHarnessProvenance({
      installRoot: '/p/node_modules/@henrik-me/agent-harness',
      readFileSync: () => lock,
      execSync: throwingGit,
    });
    assert.equal(prov.source, 'none');
  });

  it('falls through when the package entry is missing from the lock', () => {
    const lock = JSON.stringify({ packages: { 'node_modules/other': { version: '1.0.0' } } });
    const prov = resolveHarnessProvenance({
      installRoot: '/p/node_modules/@henrik-me/agent-harness',
      readFileSync: () => lock,
      execSync: throwingGit,
    });
    assert.equal(prov.source, 'none');
  });

  it('fail-soft on malformed lock JSON (falls through, never throws)', () => {
    const prov = resolveHarnessProvenance({
      installRoot: '/p/node_modules/@henrik-me/agent-harness',
      readFileSync: () => '{ not json',
      execSync: throwingGit,
    });
    assert.equal(prov.source, 'none');
  });

  it('reads a real fixture lock from os.tmpdir() with the default fs reader', () => {
    const proj = makeTmpDir('cs82-npx-');
    try {
      const installRoot = writeNpxCacheLock(proj, {
        version: '0.10.0',
        resolved: `git+https://github.com/henrik-me/agent-harness.git#${SHA_B}`,
        from: 'github:henrik-me/agent-harness#v0.9.0',
      });
      // Only installRoot injected → real readFileSync reads the on-disk fixture.
      const prov = resolveHarnessProvenance({ installRoot, execSync: throwingGit });
      assert.deepEqual(prov, { harness_ref: 'v0.9.0', resolved_sha: SHA_B, source: 'npx-cache' });
    } finally {
      removeTmpDir(proj);
    }
  });
});

describe('resolveHarnessProvenance() — git self-host branch', () => {
  it('resolves an exact tag + SHA when not under node_modules', () => {
    const prov = resolveHarnessProvenance({
      installRoot: '/tmp/harness-checkout',
      readFileSync: throwingRead,
      execSync: fakeGit(SHA_A, 'v0.1.0'),
    });
    assert.deepEqual(prov, { harness_ref: 'v0.1.0', resolved_sha: SHA_A, source: 'git' });
  });

  it('falls back to the branch name when HEAD has no exact tag', () => {
    const exec = (cmd) => {
      if (cmd.includes('rev-parse HEAD')) return `${SHA_A}\n`;
      if (cmd.includes('describe --tags --exact-match')) throw new Error('no tag');
      if (cmd.includes('rev-parse --abbrev-ref')) return 'cs82/content\n';
      throw new Error('x');
    };
    const prov = resolveHarnessProvenance({
      installRoot: '/tmp/co', readFileSync: throwingRead, execSync: exec,
    });
    assert.equal(prov.harness_ref, 'cs82/content');
    assert.equal(prov.source, 'git');
  });

  it('rejects a non-40-hex HEAD (falls through to fail-closed)', () => {
    const prov = resolveHarnessProvenance({
      installRoot: '/tmp/co',
      readFileSync: throwingRead,
      execSync: () => 'deadbeef\n', // too short
    });
    assert.equal(prov.source, 'none');
  });
});

describe('resolveHarnessProvenance() — fail-closed backstop', () => {
  it('returns the unknown/all-zero placeholder when neither branch resolves', () => {
    const prov = resolveHarnessProvenance({
      installRoot: '/tmp/nowhere',
      readFileSync: throwingRead,
      execSync: throwingGit,
    });
    assert.deepEqual(prov, { harness_ref: 'unknown', resolved_sha: '0'.repeat(40), source: 'none' });
  });

  it('prefers the npx cache over git when both are available', () => {
    const lock = JSON.stringify({
      packages: { [PKG_KEY]: { version: '0.10.0', resolved: `git+https://x#${SHA_A}`, from: 'github:henrik-me/agent-harness#v0.10.0' } },
    });
    const prov = resolveHarnessProvenance({
      installRoot: '/p/node_modules/@henrik-me/agent-harness',
      readFileSync: () => lock,
      execSync: fakeGit(SHA_B, 'v9.9.9'), // git would resolve differently
    });
    assert.equal(prov.source, 'npx-cache');
    assert.equal(prov.resolved_sha, SHA_A);
  });
});

// ===========================================================================
// validateResolvedProvenance() — fail-closed guard
// ===========================================================================

describe('validateResolvedProvenance()', () => {
  it('accepts a real ref + 40-hex non-zero SHA', () => {
    assert.doesNotThrow(() => validateResolvedProvenance({ harness_ref: 'v0.1.0', resolved_sha: SHA_A }));
  });

  for (const [label, prov] of [
    ['harness_ref === "unknown"', { harness_ref: 'unknown', resolved_sha: SHA_A }],
    ['empty harness_ref', { harness_ref: '', resolved_sha: SHA_A }],
    ['missing harness_ref', { resolved_sha: SHA_A }],
    ['all-zero resolved_sha', { harness_ref: 'v1', resolved_sha: '0'.repeat(40) }],
    ['non-40-hex resolved_sha', { harness_ref: 'v1', resolved_sha: 'abc' }],
    ['uppercase resolved_sha', { harness_ref: 'v1', resolved_sha: SHA_A.toUpperCase() }],
  ]) {
    it(`throws ESYNC_UNRESOLVED_PROVENANCE on ${label}`, () => {
      assert.throws(
        () => validateResolvedProvenance(prov),
        (err) => err instanceof SyncError && err.code === 'ESYNC_UNRESOLVED_PROVENANCE'
      );
    });
  }

  it('error message leads with actionable git-checkout / package-lock guidance', () => {
    try {
      validateResolvedProvenance({ harness_ref: 'unknown', resolved_sha: '0'.repeat(40) });
      assert.fail('expected throw');
    } catch (err) {
      assert.match(err.message, /git checkout at the target ref/);
      assert.match(err.message, /node_modules\/\.package-lock\.json/);
      assert.match(err.message, /--resolved-sha overrides only resolved_sha/);
    }
  });
});

// ===========================================================================
// sync() end-to-end via the provenanceDeps seam
// ===========================================================================

describe('sync() — provenance end-to-end (CS82)', () => {
  let harnessDir, consumerDir;

  beforeEach(() => {
    harnessDir = makeTmpDir('cs82-harness-');
    consumerDir = makeTmpDir('cs82-consumer-');
    buildHarnessRepo(harnessDir);
  });

  afterEach(() => {
    removeTmpDir(harnessDir);
    removeTmpDir(consumerDir);
  });

  it('(i) npx-cache present → apply records real ref+SHA + matching scaffold versions', async () => {
    const proj = makeTmpDir('cs82-npx-apply-');
    try {
      const installRoot = writeNpxCacheLock(proj, {
        version: '0.10.0',
        resolved: `git+https://github.com/henrik-me/agent-harness.git#${SHA_A}`,
        from: 'github:henrik-me/agent-harness#v0.10.0',
      });
      buildConsumerRepo(consumerDir, {
        managed: { files: ['INSTRUCTIONS.md'] },
        scaffolds: ['scaffold-a', 'scaffold-b'],
      });

      const result = await sync({
        consumerRepoPath: consumerDir,
        harnessRepoPath: harnessDir,
        mode: 'apply',
        provenanceDeps: { installRoot, execSync: throwingGit },
      });

      assert.equal(result.lockAfter.harness_ref, 'v0.10.0');
      assert.equal(result.lockAfter.resolved_sha, SHA_A);
      assert.deepEqual(result.lockAfter.scaffolds, [
        { name: 'scaffold-a', version: 'v0.10.0' },
        { name: 'scaffold-b', version: 'v0.10.0' },
      ]);

      const onDisk = JSON.parse(readFileSync(path.join(consumerDir, '.harness-lock.json'), 'utf8'));
      assert.equal(onDisk.harness_ref, 'v0.10.0');
      assert.equal(onDisk.resolved_sha, SHA_A);
    } finally {
      removeTmpDir(proj);
    }
  });

  it('(ii) git self-host → apply records the git-derived ref+SHA', async () => {
    buildConsumerRepo(consumerDir, { managed: { files: ['INSTRUCTIONS.md'] } });

    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'apply',
      provenanceDeps: {
        installRoot: '/tmp/harness-checkout', // no node_modules → git branch
        readFileSync: throwingRead,
        execSync: fakeGit(SHA_B, 'v0.2.0'),
      },
    });

    assert.equal(result.lockAfter.harness_ref, 'v0.2.0');
    assert.equal(result.lockAfter.resolved_sha, SHA_B);
    assert.ok(existsSync(path.join(consumerDir, '.harness-lock.json')));
  });

  it('(iii) neither → apply fails-closed with ESYNC_UNRESOLVED_PROVENANCE and writes no lock', async () => {
    buildConsumerRepo(consumerDir, { managed: { files: ['INSTRUCTIONS.md'] } });

    await assert.rejects(
      () => sync({
        consumerRepoPath: consumerDir,
        harnessRepoPath: harnessDir,
        mode: 'apply',
        provenanceDeps: { installRoot: '/tmp/nowhere', readFileSync: throwingRead, execSync: throwingGit },
      }),
      (err) => err instanceof SyncError && err.code === 'ESYNC_UNRESOLVED_PROVENANCE'
    );

    // Fail-closed runs before the commit phase → no lock and no target written.
    assert.ok(!existsSync(path.join(consumerDir, '.harness-lock.json')), 'no lock must be written');
    assert.ok(!existsSync(path.join(consumerDir, 'INSTRUCTIONS.md')), 'no target must be written');
  });

  it('(iv) npx-cache SHA-without-ref → apply fails-closed (C82-7)', async () => {
    const proj = makeTmpDir('cs82-npx-noref-');
    try {
      const installRoot = writeNpxCacheLock(proj, { resolved: `git+https://x#${SHA_A}` });
      buildConsumerRepo(consumerDir, { managed: { files: ['INSTRUCTIONS.md'] } });

      await assert.rejects(
        () => sync({
          consumerRepoPath: consumerDir,
          harnessRepoPath: harnessDir,
          mode: 'apply',
          provenanceDeps: { installRoot, execSync: throwingGit },
        }),
        (err) => err instanceof SyncError && err.code === 'ESYNC_UNRESOLVED_PROVENANCE'
      );
      assert.ok(!existsSync(path.join(consumerDir, '.harness-lock.json')));
    } finally {
      removeTmpDir(proj);
    }
  });

  it('(v) --resolved-sha override is honoured when harness_ref is derivable', async () => {
    buildConsumerRepo(consumerDir, { managed: { files: ['INSTRUCTIONS.md'] } });

    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'apply',
      resolvedShaOverride: SHA_B,
      provenanceDeps: {
        installRoot: '/tmp/harness-checkout',
        readFileSync: throwingRead,
        execSync: fakeGit(SHA_A, 'v0.3.0'), // git yields SHA_A; override must win
      },
    });

    assert.equal(result.lockAfter.harness_ref, 'v0.3.0');
    assert.equal(result.lockAfter.resolved_sha, SHA_B, '--resolved-sha overrides only resolved_sha');
    const onDisk = JSON.parse(readFileSync(path.join(consumerDir, '.harness-lock.json'), 'utf8'));
    assert.equal(onDisk.resolved_sha, SHA_B);
  });

  it('(v-neg) --resolved-sha alone cannot rescue an unresolved harness_ref (C82-5)', async () => {
    buildConsumerRepo(consumerDir, { managed: { files: ['INSTRUCTIONS.md'] } });

    await assert.rejects(
      () => sync({
        consumerRepoPath: consumerDir,
        harnessRepoPath: harnessDir,
        mode: 'apply',
        resolvedShaOverride: SHA_B, // valid SHA, but harness_ref stays 'unknown'
        provenanceDeps: { installRoot: '/tmp/nowhere', readFileSync: throwingRead, execSync: throwingGit },
      }),
      (err) => err instanceof SyncError && err.code === 'ESYNC_UNRESOLVED_PROVENANCE'
    );
  });

  it('(vi) check + dry-run modes do NOT throw on unresolved provenance (C82-8)', async () => {
    buildConsumerRepo(consumerDir, { managed: { files: [] } });
    const deps = { installRoot: '/tmp/nowhere', readFileSync: throwingRead, execSync: throwingGit };

    for (const mode of ['check', 'dry-run']) {
      const result = await sync({
        consumerRepoPath: consumerDir,
        harnessRepoPath: harnessDir,
        mode,
        provenanceDeps: deps,
      });
      assert.equal(result.lockAfter.harness_ref, 'unknown', `${mode} keeps best-effort placeholder`);
      assert.equal(result.lockAfter.resolved_sha, '0'.repeat(40));
    }
    // check/dry-run never write the lock.
    assert.ok(!existsSync(path.join(consumerDir, '.harness-lock.json')));
  });
});
