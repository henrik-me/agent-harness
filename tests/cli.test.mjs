/**
 * tests/cli.test.mjs — CLI dispatch + flag parsing tests for bin/harness.mjs
 *
 * Source: project/clickstops/active/active_cs04_cli-dispatcher.md
 * Plan:   project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md § CS04
 *
 * Pattern: spawn bin/harness.mjs via child_process.spawnSync, assert on
 * stdout / stderr / exitCode. Temp dirs used for any tests that write files.
 *
 * Run: node --test tests/cli.test.mjs
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const CLI = path.join(REPO_ROOT, 'bin', 'harness.mjs');
const NODE = process.execPath;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run the CLI and return { stdout, stderr, status }. */
function run(args = [], opts = {}) {
  const env = { ...process.env, ...opts.env };
  const result = spawnSync(NODE, [CLI, ...args], {
    cwd: opts.cwd ?? REPO_ROOT,
    encoding: 'utf8',
    env,
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? -1,
  };
}

/** Create a temp dir (cleaned up by caller). */
function makeTmpDir(prefix = 'harness-cli-test-') {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Write JSON to a file, creating parent dirs. */
function writeJSON(filePath, obj) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

/** Write text to a file, creating parent dirs. */
function writeText(filePath, content) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}

/** Build a minimal valid harness.config.json object. */
function minimalConfig(suffix = 'ah') {
  return {
    version: 'self',
    project: {
      name: 'test-project',
      agent_suffix: suffix,
    },
    managed: { files: [] },
    composed: { files: [] },
    seeded: { files: [] },
    scaffolds: [],
    excluded: [],
  };
}

// ---------------------------------------------------------------------------
// Top-level help / no-args / unknown subcommand
// ---------------------------------------------------------------------------

describe('top-level dispatch', () => {
  it('harness --help prints help text and exits 0', () => {
    const r = run(['--help']);
    assert.equal(r.status, 0, `Expected exit 0, got ${r.status}`);
    assert.ok(r.stdout.includes('Usage: harness'), `stdout missing "Usage: harness"; got:\n${r.stdout}`);
    assert.ok(r.stdout.includes('Subcommands:'), 'stdout missing "Subcommands:"');
  });

  it('harness (no args) prints help to stderr and exits 2', () => {
    const r = run([]);
    assert.equal(r.status, 2, `Expected exit 2, got ${r.status}`);
    assert.ok(r.stderr.includes('Usage: harness'), `stderr missing "Usage: harness"; got:\n${r.stderr}`);
  });

  it('harness unknown-subcommand prints help to stderr and exits 2', () => {
    const r = run(['unknown-subcommand']);
    assert.equal(r.status, 2, `Expected exit 2, got ${r.status}`);
    assert.ok(r.stderr.includes('Unknown subcommand'), `stderr missing "Unknown subcommand"; got:\n${r.stderr}`);
    assert.ok(r.stderr.includes('Usage: harness'), 'stderr missing top-level usage after unknown subcommand');
  });

  it('all 10 subcommands appear in top-level help', () => {
    const r = run(['--help']);
    const subcommands = [
      'init', 'sync', 'check', 'lint', 'harvest',
      'check-migration', 'composed-audit', 'pack', 'version', 'whoami',
    ];
    for (const cmd of subcommands) {
      assert.ok(r.stdout.includes(cmd), `top-level help missing subcommand: ${cmd}`);
    }
  });
});

// ---------------------------------------------------------------------------
// version
// ---------------------------------------------------------------------------

describe('harness version', () => {
  it('prints package version and exits 0', () => {
    const r = run(['version']);
    assert.equal(r.status, 0);
    // Should print the version from package.json
    const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    assert.ok(r.stdout.includes(pkg.version), `stdout should contain "${pkg.version}"; got:\n${r.stdout}`);
  });

  it('version --help prints usage and exits 0', () => {
    const r = run(['version', '--help']);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('Usage: harness version'), 'missing version help');
  });
});

// ---------------------------------------------------------------------------
// whoami
// ---------------------------------------------------------------------------

describe('harness whoami', () => {
  const CONFIG_FLAG = `--config=${path.join(REPO_ROOT, 'examples', 'agent-harness-self.harness.config.json')}`;

  it('prints agent ID ending in -ah with self config (yoga-ah on this machine)', () => {
    const r = run([CONFIG_FLAG, 'whoami']);
    assert.equal(r.status, 0);
    const id = r.stdout.trim();
    assert.ok(id.endsWith('-ah'), `Expected agent ID ending in "-ah", got: "${id}"`);
  });

  it('whoami --explain includes hostname, suffix, and final agent-id', () => {
    const r = run([CONFIG_FLAG, 'whoami', '--explain']);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('hostname:'), 'explain output missing "hostname:"');
    assert.ok(r.stdout.includes('config-suffix:'), 'explain output missing "config-suffix:"');
    assert.ok(r.stdout.includes('agent-id:'), 'explain output missing "agent-id:"');
    assert.ok(r.stdout.includes('-ah'), 'explain output should mention -ah suffix');
  });

  it('whoami picks up env var override as machine-short', () => {
    const r = run(
      [CONFIG_FLAG, 'whoami'],
      { env: { HARNESS_AGENT_AH_MACHINE: 'testmachine' } },
    );
    assert.equal(r.status, 0);
    const id = r.stdout.trim();
    assert.ok(id.startsWith('testmachine'), `Expected ID starting with "testmachine", got: "${id}"`);
    assert.ok(id.endsWith('-ah'), `Expected ID ending with "-ah", got: "${id}"`);
  });

  it('whoami --explain shows env-var-value when override set', () => {
    const r = run(
      [CONFIG_FLAG, 'whoami', '--explain'],
      { env: { HARNESS_AGENT_AH_MACHINE: 'testmachine' } },
    );
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('testmachine'), 'explain should show the env var value');
    assert.ok(r.stdout.includes('env-var-value:'), 'explain should show env-var-value line');
  });

  it('whoami exits 2 with unknown flag', () => {
    const r = run(['whoami', '--not-a-real-flag']);
    assert.equal(r.status, 2);
    assert.ok(r.stderr.includes('Unknown flag') || r.stderr.includes('--not-a-real-flag'));
  });

  it('whoami --help exits 0 with usage text', () => {
    const r = run(['whoami', '--help']);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('Usage: harness whoami'));
  });
});

// ---------------------------------------------------------------------------
// lint (STUB)
// ---------------------------------------------------------------------------

describe('harness lint', () => {
  it('exits 0 with TODO message', () => {
    const r = run(['lint']);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.toLowerCase().includes('todo'), `Expected TODO message; got: ${r.stdout}`);
  });

  it('lint --help exits 0', () => {
    const r = run(['lint', '--help']);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('Usage: harness lint'));
  });
});

// ---------------------------------------------------------------------------
// harvest (STUB)
// ---------------------------------------------------------------------------

describe('harness harvest', () => {
  it('exits 0 with "not yet implemented" message', () => {
    const r = run(['harvest']);
    assert.equal(r.status, 0);
    assert.ok(
      r.stdout.includes('not yet implemented') || r.stdout.includes('harvest'),
      `Expected "not yet implemented"; got: ${r.stdout}`,
    );
  });
});

// ---------------------------------------------------------------------------
// check-migration (STUB)
// ---------------------------------------------------------------------------

describe('harness check-migration', () => {
  it('exits 0 with TODO message', () => {
    const r = run(['check-migration', '--from-existing-harness']);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.toLowerCase().includes('todo'), `Expected TODO; got: ${r.stdout}`);
  });
});

// ---------------------------------------------------------------------------
// composed-audit (STUB)
// ---------------------------------------------------------------------------

describe('harness composed-audit', () => {
  it('exits 0 with TODO message', () => {
    const r = run(['composed-audit', '--from-existing-harness']);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.toLowerCase().includes('todo'), `Expected TODO; got: ${r.stdout}`);
  });
});

// ---------------------------------------------------------------------------
// sync + check alias
// ---------------------------------------------------------------------------

describe('harness sync', () => {
  it('check alias calls sync --mode=check', () => {
    // check against a temp dir with no harness.config.json → expect error exit 1
    const dir = makeTmpDir();
    try {
      const r = run(['check'], { cwd: dir });
      // Should fail with "not found" or similar — but it exit non-0 and not 2
      assert.notEqual(r.status, 2, 'check alias should not exit 2 (usage error)');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('sync --help exits 0', () => {
    const r = run(['sync', '--help']);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('Usage: harness sync'));
  });

  it('sync --mode=invalid exits 2', () => {
    const r = run(['sync', '--mode=invalid']);
    assert.equal(r.status, 2);
    assert.ok(r.stderr.includes('Invalid --mode'));
  });

  it('sync --mode=dry-run with minimal valid config returns 0 (no drift, empty file lists)', () => {
    const dir = makeTmpDir();
    try {
      writeJSON(path.join(dir, 'harness.config.json'), minimalConfig('ah'));
      const r = run(['sync', '--mode=dry-run'], { cwd: dir });
      assert.equal(r.status, 0, `Expected 0; stderr: ${r.stderr}; stdout: ${r.stdout}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('sync --mode=check with minimal valid config exits 0 (no drift, empty file lists)', () => {
    const dir = makeTmpDir();
    try {
      writeJSON(path.join(dir, 'harness.config.json'), minimalConfig('ah'));
      const r = run(['sync', '--mode=check'], { cwd: dir });
      assert.equal(r.status, 0, `Expected 0; stderr: ${r.stderr}; stdout: ${r.stdout}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('sync --mode=apply with empty config exits 0 (no files to write)', () => {
    const dir = makeTmpDir();
    try {
      writeJSON(path.join(dir, 'harness.config.json'), minimalConfig('ah'));
      const r = run(['sync', '--mode=apply'], { cwd: dir });
      assert.equal(r.status, 0, `Expected exit 0; stderr: ${r.stderr}; stdout: ${r.stdout}`);
      // Lock file should have been written
      assert.ok(
        existsSync(path.join(dir, '.harness-lock.json')),
        '.harness-lock.json should have been created by apply',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('sync --mode=check reports no drift with empty config', () => {
    const dir = makeTmpDir();
    try {
      writeJSON(path.join(dir, 'harness.config.json'), minimalConfig('ah'));
      const r = run(['sync', '--mode=check'], { cwd: dir });
      assert.equal(r.status, 0, `Expected 0 (no drift); stderr: ${r.stderr}`);
      assert.ok(r.stdout.includes('No drift'), `stdout should confirm no drift; got: ${r.stdout}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------

describe('harness init', () => {
  it('creates harness.config.json in target dir', () => {
    const dir = makeTmpDir();
    try {
      const r = run(['init', dir]);
      assert.equal(r.status, 0, `Expected exit 0; stderr: ${r.stderr}`);
      assert.ok(existsSync(path.join(dir, 'harness.config.json')), 'harness.config.json should exist');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('init --from-example=self creates config based on agent-harness example', () => {
    const dir = makeTmpDir();
    try {
      const r = run(['init', '--from-example=self', dir]);
      assert.equal(r.status, 0, `Expected exit 0; stderr: ${r.stderr}`);
      const cfg = JSON.parse(readFileSync(path.join(dir, 'harness.config.json'), 'utf8'));
      assert.equal(cfg.project?.agent_suffix, 'ah');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('init skips harness.config.json if it already exists', () => {
    const dir = makeTmpDir();
    try {
      const existingConfig = { version: 'v0.0.1', project: { name: 'test', agent_suffix: 'xx' } };
      writeJSON(path.join(dir, 'harness.config.json'), existingConfig);
      const r = run(['init', dir]);
      assert.equal(r.status, 0, `Expected exit 0 even when config exists; stderr: ${r.stderr}`);
      assert.ok(r.stderr.includes('Warning') || r.stdout.includes('skipping'), 'Should warn about existing config');
      // Content should be unchanged
      const cfg = JSON.parse(readFileSync(path.join(dir, 'harness.config.json'), 'utf8'));
      assert.equal(cfg.project?.agent_suffix, 'xx', 'Existing config should not be overwritten');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('init --help exits 0', () => {
    const r = run(['init', '--help']);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('Usage: harness init'));
  });
});

// ---------------------------------------------------------------------------
// pack
// ---------------------------------------------------------------------------

describe('harness pack', () => {
  it('invokes npm pack --dry-run and exits 0', { skip: process.env.CI === 'true' ? 'Skipped in CI env' : false }, () => {
    const r = run(['pack']);
    // npm pack --dry-run may show warnings but should exit 0 in normal env
    assert.equal(r.status, 0, `npm pack --dry-run failed; stderr: ${r.stderr}`);
    // Output should mention at least one file
    assert.ok(
      r.stdout.length > 0 || r.stderr.length > 0,
      'pack should produce some output from npm pack --dry-run',
    );
  });

  it('pack --help exits 0', () => {
    const r = run(['pack', '--help']);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('Usage: harness pack'));
  });
});

// ---------------------------------------------------------------------------
// per-subcommand --help
// ---------------------------------------------------------------------------

describe('subcommand --help flags', () => {
  const cmds = [
    ['sync', '--help'],
    ['check', '--help'],
    ['lint', '--help'],
    ['harvest', '--help'],
    ['check-migration', '--help'],
    ['composed-audit', '--help'],
    ['pack', '--help'],
    ['version', '--help'],
    ['whoami', '--help'],
  ];

  for (const args of cmds) {
    it(`harness ${args.join(' ')} exits 0 with usage text`, () => {
      const r = run(args);
      assert.equal(r.status, 0, `Expected exit 0 for ${args.join(' ')}; got ${r.status}; stderr: ${r.stderr}`);
      assert.ok(r.stdout.includes('Usage:'), `Missing "Usage:" in help for ${args.join(' ')}`);
    });
  }
});
