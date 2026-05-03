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
// lint (now functional — runs check-learnings.mjs)
// ---------------------------------------------------------------------------

describe('harness lint', () => {
  it('exits 0 against the real LEARNINGS.md', () => {
    const r = run(['lint']);
    assert.equal(r.status, 0, `Expected exit 0 (linter passed); got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.ok(r.stdout.includes('check-learnings summary') || r.stdout.includes('✅'), `Expected lint summary in stdout; got:\n${r.stdout}`);
  });

  it('lint --help exits 0', () => {
    const r = run(['lint', '--help']);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('Usage: harness lint'));
  });

  // B1: harness lint --cwd <tmpdir> lints the tmpdir's LEARNINGS.md, not the harness one.
  it('lint --cwd <tmpdir> lints consumer LEARNINGS.md, exits 0 with 1 entry checked', () => {
    const dir = makeTmpDir('harness-lint-cwd-');
    try {
      writeText(path.join(dir, 'LEARNINGS.md'), [
        '# Test Learnings',
        '',
        '## Applied',
        '',
        '### LRN-001',
        '',
        '```yaml',
        'id: LRN-001',
        'date: 2022-01-01',
        'category: tooling',
        'source_cs: CS01',
        'status: applied',
        'tags: [test]',
        '```',
        '',
        '**Problem:** Consumer entry.',
        '',
        '**Disposition:** Applied — ok.',
        '',
      ].join('\n'));
      const r = run(['--cwd', dir, 'lint', '--quiet']);
      assert.equal(
        r.status, 0,
        `Expected exit 0 linting consumer LEARNINGS.md; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
      );
      assert.ok(
        r.stdout.includes('1 entries checked') || r.stdout.includes('Entries checked: 1'),
        `Expected "1 entries checked" in summary; got:\n${r.stdout}`
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// harvest (STUB)
// ---------------------------------------------------------------------------

describe('harness harvest', () => {
  it('exits 3 with not-yet-implemented message', () => {
    const r = run(['harvest']);
    assert.equal(r.status, 3, `Expected exit 3, got ${r.status}`);
    assert.ok(r.stderr.includes('not yet implemented'), `Expected "not yet implemented" in stderr; got: ${r.stderr}`);
  });
});

// ---------------------------------------------------------------------------
// check-migration (STUB)
// ---------------------------------------------------------------------------

describe('harness check-migration', () => {
  it('exits 3 with --from-existing-harness', () => {
    const r = run(['check-migration', '--from-existing-harness']);
    assert.equal(r.status, 3, `Expected exit 3, got ${r.status}`);
    assert.ok(r.stderr.includes('not yet implemented'), `Expected "not yet implemented" in stderr; got: ${r.stderr}`);
  });
});

// ---------------------------------------------------------------------------
// composed-audit (STUB)
// ---------------------------------------------------------------------------

describe('harness composed-audit', () => {
  it('exits 3 with --from-existing-harness', () => {
    const r = run(['composed-audit', '--from-existing-harness']);
    assert.equal(r.status, 3, `Expected exit 3, got ${r.status}`);
    assert.ok(r.stderr.includes('not yet implemented'), `Expected "not yet implemented" in stderr; got: ${r.stderr}`);
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

// ---------------------------------------------------------------------------
// Blocker 1 — check must forbid --mode
// ---------------------------------------------------------------------------

describe('harness check --mode rejection (Blocker 1)', () => {
  it('check --mode=apply exits 2 with no lock file created', () => {
    const dir = makeTmpDir('harness-check-mode-');
    try {
      writeJSON(path.join(dir, 'harness.config.json'), minimalConfig('ah'));
      const r = run(['check', '--mode=apply'], { cwd: dir });
      assert.equal(r.status, 2, `Expected exit 2, got ${r.status}`);
      assert.ok(r.stderr.includes('--mode'), `stderr missing message; got: ${r.stderr}`);
      assert.ok(!existsSync(path.join(dir, '.harness-lock.json')), '.harness-lock.json must NOT be created');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('check --mode=check exits 2 (read-only, no --mode allowed)', () => {
    const dir = makeTmpDir('harness-check-mode2-');
    try {
      writeJSON(path.join(dir, 'harness.config.json'), minimalConfig('ah'));
      const r = run(['check', '--mode=check'], { cwd: dir });
      assert.equal(r.status, 2, `Expected exit 2, got ${r.status}`);
      assert.ok(r.stderr.includes('--mode'), `stderr: ${r.stderr}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('check --dry-run exits 2 (read-only, no mode-modifying flags)', () => {
    const dir = makeTmpDir('harness-check-dryrun-');
    try {
      writeJSON(path.join(dir, 'harness.config.json'), minimalConfig('ah'));
      const r = run(['check', '--dry-run'], { cwd: dir });
      assert.equal(r.status, 2, `Expected exit 2, got ${r.status}; stderr: ${r.stderr}`);
      assert.ok(r.stderr.includes('--dry-run'), `stderr: ${r.stderr}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('sync --dry-run is accepted as alias for --mode=dry-run', () => {
    const dir = makeTmpDir('harness-sync-dryrun-');
    try {
      writeJSON(path.join(dir, 'harness.config.json'), minimalConfig('ah'));
      const r = run(['sync', '--dry-run'], { cwd: dir });
      assert.equal(r.status, 0, `Expected exit 0; stderr: ${r.stderr}; stdout: ${r.stdout}`);
      assert.ok(
        !existsSync(path.join(dir, '.harness-lock.json')),
        '.harness-lock.json must NOT be created in dry-run mode',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('sync --dry-run --report exits 0 and prints planned changes', () => {
    const dir = makeTmpDir('harness-sync-dryrun-report-');
    try {
      writeJSON(path.join(dir, 'harness.config.json'), minimalConfig('ah'));
      const r = run(['sync', '--dry-run', '--report'], { cwd: dir });
      assert.equal(r.status, 0, `Expected exit 0; stderr: ${r.stderr}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Blocker 2 — --config rejected for sync/check
// ---------------------------------------------------------------------------

describe('--config rejected for sync/check (Blocker 2)', () => {
  const cfgFile = path.join(REPO_ROOT, 'examples', 'agent-harness-self.harness.config.json');

  it('sync --config=<path> exits 2', () => {
    const r = run([`--config=${cfgFile}`, 'sync']);
    assert.equal(r.status, 2, `Expected exit 2; got ${r.status}; stderr: ${r.stderr}`);
    assert.ok(r.stderr.includes('--config is not yet supported for sync/check'), `stderr: ${r.stderr}`);
  });

  it('check --config=<path> exits 2', () => {
    const r = run([`--config=${cfgFile}`, 'check']);
    assert.equal(r.status, 2, `Expected exit 2; got ${r.status}; stderr: ${r.stderr}`);
    assert.ok(r.stderr.includes('--config is not yet supported for sync/check'), `stderr: ${r.stderr}`);
  });
});

// ---------------------------------------------------------------------------
// Blocker 3 — --cwd path canonicalization
// ---------------------------------------------------------------------------

describe('--cwd path canonicalization (Blocker 3)', () => {
  it('--cwd=./relative-dir resolves correctly for sync', () => {
    const parentDir = makeTmpDir('harness-cwd-rel-');
    const childName = 'child-repo';
    const childDir = path.join(parentDir, childName);
    mkdirSync(childDir);
    writeJSON(path.join(childDir, 'harness.config.json'), minimalConfig('ah'));
    try {
      const r = run([`--cwd=./${childName}`, 'sync', '--mode=check'], { cwd: parentDir });
      assert.equal(r.status, 0, `Expected 0; stderr: ${r.stderr}`);
    } finally {
      rmSync(parentDir, { recursive: true, force: true });
    }
  });

  it('--cwd <space> ./relative-dir resolves correctly for sync', () => {
    const parentDir = makeTmpDir('harness-cwd-rel2-');
    const childName = 'child-repo2';
    const childDir = path.join(parentDir, childName);
    mkdirSync(childDir);
    writeJSON(path.join(childDir, 'harness.config.json'), minimalConfig('ah'));
    try {
      const r = run(['--cwd', `./${childName}`, 'sync', '--mode=check'], { cwd: parentDir });
      assert.equal(r.status, 0, `Expected 0; stderr: ${r.stderr}`);
    } finally {
      rmSync(parentDir, { recursive: true, force: true });
    }
  });

  it('--cwd <nonexistent-path> exits 2', () => {
    const r = run(['--cwd=/this-path-does-not-exist-harness-test-xyz', 'sync', '--mode=check']);
    assert.equal(r.status, 2, `Expected exit 2; got ${r.status}`);
    assert.ok(r.stderr.includes('does not exist'), `stderr: ${r.stderr}`);
  });
});

// ---------------------------------------------------------------------------
// Blocker 4 — cloneSuffixFromDir derivation (via whoami --cwd)
// ---------------------------------------------------------------------------

describe('cloneSuffixFromDir derivation per Decision #20 (Blocker 4)', () => {
  function makeNamedDir(name, suffix = 'ah') {
    const parent = makeTmpDir('harness-clone-parent-');
    const dir = path.join(parent, name);
    mkdirSync(dir);
    writeJSON(path.join(dir, 'harness.config.json'), minimalConfig(suffix));
    return { parent, dir };
  }

  it('agent-harness_copilot2 → -c2 in agent ID', () => {
    const { parent, dir } = makeNamedDir('agent-harness_copilot2');
    try {
      const r = run(['whoami', `--cwd=${dir}`]);
      assert.equal(r.status, 0, `exit: ${r.status}; stderr: ${r.stderr}`);
      assert.ok(r.stdout.includes('-c2'), `Expected -c2 in output; got: ${r.stdout.trim()}`);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it('agent-harness3 → -c3 in agent ID (bare trailing digit)', () => {
    const { parent, dir } = makeNamedDir('agent-harness3');
    try {
      const r = run(['whoami', `--cwd=${dir}`]);
      assert.equal(r.status, 0, `exit: ${r.status}; stderr: ${r.stderr}`);
      assert.ok(r.stdout.includes('-c3'), `Expected -c3 in output; got: ${r.stdout.trim()}`);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it('agent-harness → no clone suffix', () => {
    const { parent, dir } = makeNamedDir('agent-harness');
    try {
      const r = run(['whoami', `--cwd=${dir}`]);
      assert.equal(r.status, 0, `exit: ${r.status}; stderr: ${r.stderr}`);
      const id = r.stdout.trim();
      assert.ok(!id.includes('-c'), `Expected no -c suffix; got: ${id}`);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it('agent-harness_copilot (no number) → no clone suffix', () => {
    const { parent, dir } = makeNamedDir('agent-harness_copilot');
    try {
      const r = run(['whoami', `--cwd=${dir}`]);
      assert.equal(r.status, 0, `exit: ${r.status}; stderr: ${r.stderr}`);
      const id = r.stdout.trim();
      assert.ok(!id.includes('-c'), `Expected no -c suffix; got: ${id}`);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Blocker 6 — whoami must fail when no agent_suffix resolvable
// ---------------------------------------------------------------------------

describe('harness whoami fail-closed (Blocker 6)', () => {
  it('exits 2 with clear message when harness.config.json is missing', () => {
    const dir = makeTmpDir('harness-whoami-noconfig-');
    try {
      const r = run(['whoami', `--cwd=${dir}`]);
      assert.equal(r.status, 2, `Expected exit 2; got ${r.status}`);
      assert.ok(
        r.stderr.includes('cannot resolve agent ID'),
        `stderr missing message; got: ${r.stderr}`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exits 2 when config exists but project.agent_suffix is missing', () => {
    const dir = makeTmpDir('harness-whoami-nosuffix-');
    try {
      writeJSON(path.join(dir, 'harness.config.json'), {
        version: 'self',
        project: { name: 'test-project' },
        managed: { files: [] },
        composed: { files: [] },
        seeded: { files: [] },
        scaffolds: [],
        excluded: [],
      });
      const r = run(['whoami', `--cwd=${dir}`]);
      assert.equal(r.status, 2, `Expected exit 2; got ${r.status}`);
      assert.ok(r.stderr.includes('cannot resolve agent ID'), `stderr: ${r.stderr}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Blocker 7 — stub subcommands fail-closed (unknown flags + missing required)
// ---------------------------------------------------------------------------

describe('stub subcommand fail-closed (Blocker 7)', () => {
  it('lint --unknown-flag exits 2', () => {
    const r = run(['lint', '--unknown-flag']);
    assert.equal(r.status, 2, `Expected exit 2; got ${r.status}`);
    assert.ok(r.stderr.includes('Unknown flag') || r.stderr.includes('--unknown-flag'), `stderr: ${r.stderr}`);
  });

  it('harvest --unknown-flag exits 2', () => {
    const r = run(['harvest', '--unknown-flag']);
    assert.equal(r.status, 2, `Expected exit 2; got ${r.status}`);
    assert.ok(r.stderr.includes('Unknown flag') || r.stderr.includes('--unknown-flag'), `stderr: ${r.stderr}`);
  });

  it('check-migration without --from-existing-harness exits 2', () => {
    const r = run(['check-migration']);
    assert.equal(r.status, 2, `Expected exit 2; got ${r.status}`);
    assert.ok(r.stderr.includes('--from-existing-harness is required'), `stderr: ${r.stderr}`);
  });

  it('check-migration --unknown-flag exits 2 (before not-implemented check)', () => {
    const r = run(['check-migration', '--from-existing-harness', '--unknown-flag']);
    assert.equal(r.status, 2, `Expected exit 2; got ${r.status}`);
  });

  it('composed-audit without --from-existing-harness exits 2', () => {
    const r = run(['composed-audit']);
    assert.equal(r.status, 2, `Expected exit 2; got ${r.status}`);
    assert.ok(r.stderr.includes('--from-existing-harness is required'), `stderr: ${r.stderr}`);
  });

  it('composed-audit --unknown-flag exits 2 (before not-implemented check)', () => {
    const r = run(['composed-audit', '--from-existing-harness', '--unknown-flag']);
    assert.equal(r.status, 2, `Expected exit 2; got ${r.status}`);
  });

  it('harvest --snooze=reason:2099-01-01 exits 3 (recognized flag, still not implemented)', () => {
    const r = run(['harvest', '--snooze=reason:2099-01-01']);
    assert.equal(r.status, 3, `Expected exit 3; got ${r.status}`);
  });
});
