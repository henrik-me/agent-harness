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

  // Pin --cwd to a temp dir literally named `agent-harness` so the clone-suffix
  // derivation (cloneSuffixFromDir, Decision #20) yields no `-c<N>` suffix
  // regardless of this checkout's folder name — keeps the strict `-ah`
  // terminal-suffix assertion hermetic (CS62 / LRN-146).
  function agentHarnessCwd() {
    const parent = makeTmpDir('harness-whoami-cwd-');
    const dir = path.join(parent, 'agent-harness');
    mkdirSync(dir);
    return { parent, dir };
  }

  it('prints agent ID ending in -ah with self config (hermetic --cwd)', () => {
    const { parent, dir } = agentHarnessCwd();
    try {
      const r = run([CONFIG_FLAG, 'whoami', `--cwd=${dir}`]);
      assert.equal(r.status, 0);
      const id = r.stdout.trim();
      assert.ok(id.endsWith('-ah'), `Expected agent ID ending in "-ah", got: "${id}"`);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
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
    const { parent, dir } = agentHarnessCwd();
    try {
      const r = run(
        [CONFIG_FLAG, 'whoami', `--cwd=${dir}`],
        { env: { HARNESS_AGENT_AH_MACHINE: 'testmachine' } },
      );
      assert.equal(r.status, 0);
      const id = r.stdout.trim();
      assert.ok(id.startsWith('testmachine'), `Expected ID starting with "testmachine", got: "${id}"`);
      assert.ok(id.endsWith('-ah'), `Expected ID ending with "-ah", got: "${id}"`);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
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
  it('exits 0 against the real repo (all 10 linters)', () => {
    const r = run(['lint', '--quiet']);
    assert.equal(r.status, 0, `Expected exit 0 (all linters passed); got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.ok(r.stdout.includes('harness lint summary'), `Expected aggregate summary in stdout; got:\n${r.stdout}`);
    // At least learnings + a few core linters must report pass against the real repo
    assert.ok(r.stdout.includes('learnings: pass'), `Expected learnings: pass; got:\n${r.stdout}`);
    assert.ok(r.stdout.includes('context: pass'), `Expected context: pass; got:\n${r.stdout}`);
    assert.ok(r.stdout.includes('workboard: pass'), `Expected workboard: pass; got:\n${r.stdout}`);
  });

  it('lint --help exits 0', () => {
    const r = run(['lint', '--help']);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('Usage: harness lint'));
  });

  // B1: harness lint --cwd <tmpdir> lints the tmpdir's LEARNINGS.md, not the harness one.
  it('lint --cwd <tmpdir> lints consumer LEARNINGS.md and skips missing targets', () => {
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
        `Expected exit 0 (only learnings runs, others skipped); got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
      );
      assert.ok(
        r.stdout.includes('learnings: pass'),
        `Expected "learnings: pass" in summary; got:\n${r.stdout}`
      );
      // Other linters' targets don't exist in tmpdir → must be reported as skipped
      assert.ok(
        r.stdout.includes('context: skipped') && r.stdout.includes('readme: skipped'),
        `Expected context+readme reported as skipped; got:\n${r.stdout}`
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('lint --only learnings runs only the learnings linter', () => {
    const r = run(['lint', '--only', 'learnings', '--quiet']);
    assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}`);
    assert.ok(r.stdout.includes('learnings: pass'), `Expected learnings: pass; got:\n${r.stdout}`);
    assert.ok(!r.stdout.includes('context:'), `Expected context to be filtered out; got:\n${r.stdout}`);
  });

  it('lint --skip workflow-pins,readme excludes those linters', () => {
    const r = run(['lint', '--skip', 'workflow-pins,readme', '--quiet']);
    assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}`);
    assert.ok(!/\b workflow-pins:/.test(r.stdout), `Expected workflow-pins skipped; got:\n${r.stdout}`);
    assert.ok(!/[^-]readme:/.test(r.stdout), `Expected readme skipped; got:\n${r.stdout}`);
    assert.ok(r.stdout.includes('learnings: pass'), `Expected learnings to still run; got:\n${r.stdout}`);
  });

  // B2: composed-blocks linter runs via aggregator with schema-valid config
  it('composed-blocks linter runs and passes with schema-valid config + valid composed file', () => {
    const dir = makeTmpDir('harness-lint-composed-');
    try {
      // Write a valid harness.config.json using composed.overrides[file].local_blocks
      // (the single source of truth as of v0.2.0 / LRN-009 / CS02b).
      writeJSON(path.join(dir, 'harness.config.json'), {
        version: 'v0.1.0',
        project: { name: 'test-composed', agent_suffix: 'tc' },
        composed: {
          files: ['CONVENTIONS.md'],
          overrides: { 'CONVENTIONS.md': { local_blocks: ['conventions.project'] } },
        },
      });
      // Write a composed file with the expected local block
      writeText(path.join(dir, 'CONVENTIONS.md'), [
        '# Conventions',
        '',
        '<!-- harness:local-start id=conventions.project -->',
        'Project-specific conventions go here.',
        '<!-- harness:local-end id=conventions.project -->',
        '',
      ].join('\n'));
      const r = run(['--cwd', dir, 'lint', '--only', 'composed-blocks', '--quiet']);
      assert.equal(
        r.status, 0,
        `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
      );
      assert.ok(
        r.stdout.includes('composed-blocks:CONVENTIONS.md: pass'),
        `Expected composed-blocks:CONVENTIONS.md: pass; got:\n${r.stdout}`
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // B2b (LRN-009 / CS02b regression): composed file with no composed.overrides[file]
  // entry must have an empty allowlist enforced — any local block in the file
  // is rejected. Without the explicit empty-allowlist propagation in cmdLint,
  // check-composed-blocks would treat absence of --allowed-ids as "no constraint"
  // and silently permit any block ID.
  it('composed-blocks rejects local blocks when composed.overrides[file] is absent (CS02b empty-allowlist enforcement)', () => {
    const dir = makeTmpDir('harness-lint-composed-empty-');
    try {
      writeJSON(path.join(dir, 'harness.config.json'), {
        version: 'v0.1.0',
        project: { name: 'test-composed-empty', agent_suffix: 'tce' },
        composed: { files: ['CONVENTIONS.md'] },  // no overrides → empty allowlist
      });
      writeText(path.join(dir, 'CONVENTIONS.md'), [
        '# Conventions',
        '',
        '<!-- harness:local-start id=conventions.project -->',
        'Project-specific conventions go here.',
        '<!-- harness:local-end id=conventions.project -->',
        '',
      ].join('\n'));
      const r = run(['--cwd', dir, 'lint', '--only', 'composed-blocks', '--quiet']);
      assert.notEqual(
        r.status, 0,
        `Expected non-zero exit (block id="conventions.project" is not in the (empty) allowed IDs list); got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
      );
      assert.ok(
        r.stdout.includes('composed-blocks:CONVENTIONS.md: fail') || r.stderr.includes('not in the allowed IDs list'),
        `Expected fail signal; got stdout:\n${r.stdout}\nstderr:\n${r.stderr}`
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('workflow-pins passes via aggregator when config has version matching workflow ref', () => {
    const dir = makeTmpDir('harness-lint-wfpins-');
    try {
      writeJSON(path.join(dir, 'harness.config.json'), {
        version: 'v0.1.0',
        project: { name: 'test-pins', agent_suffix: 'tp' },
      });
      const workflowsDir = path.join(dir, '.github', 'workflows');
      mkdirSync(workflowsDir, { recursive: true });
      writeText(path.join(workflowsDir, 'ci.yml'), [
        'name: CI',
        'on: [push]',
        'jobs:',
        '  lint:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: henrik-me/agent-harness@v0.1.0',
      ].join('\n'));
      const r = run(['--cwd', dir, 'lint', '--only', 'workflow-pins', '--quiet']);
      assert.equal(
        r.status, 0,
        `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
      );
      assert.ok(
        r.stdout.includes('workflow-pins: pass'),
        `Expected workflow-pins: pass; got:\n${r.stdout}`
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // B4: flag-as-value (--file --quiet) for check-learnings → exit 2
  it('linter exits 2 when flag is passed as value (--file --quiet)', () => {
    const result = spawnSync(NODE, [
      path.join(REPO_ROOT, 'scripts', 'check-learnings.mjs'),
      '--file', '--quiet',
    ], { cwd: REPO_ROOT, encoding: 'utf8' });
    assert.equal(
      result.status, 2,
      `Expected exit 2 for flag-as-value; got ${result.status}\nstderr: ${result.stderr}`
    );
    assert.ok(
      (result.stderr ?? '').includes('missing value') || (result.stderr ?? '').includes('--file'),
      `Expected missing-value error in stderr; got:\n${result.stderr}`
    );
  });

  // -------------------------------------------------------------------------
  // CS30 / D2 — `harness lint:NAME` shorthand alias for `lint --only NAME`
  // -------------------------------------------------------------------------
  it('CS30/D2: lint:NAME alias maps to lint --only NAME', () => {
    const r = run(['lint:learnings', '--quiet']);
    assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.ok(r.stdout.includes('learnings: pass'), `Expected learnings: pass; got:\n${r.stdout}`);
    assert.ok(!r.stdout.includes('context:'), `Expected context filtered out; got:\n${r.stdout}`);
  });

  it('CS31: lint:NAME with an unknown linter name exits 2 with a known-linters list (refines CS30/D2)', () => {
    // CS30 / D2 originally accepted exit 0 + "0 passed, 0 failed, 0 skipped"
    // for an unknown lint:NAME alias because the worse failure mode at the
    // time was the dispatcher returning "Unknown subcommand" (which would
    // have shadowed any future legitimate subcommand). CS31 keeps the
    // dispatcher rewrite (lint:NAME → cmdLint --only NAME), but cmdLint now
    // rejects zero-match selections with exit 2 + a useful known-linters
    // list (mirrors the existing --explain unknown-name UX). This is a
    // contract refinement, not a reversal — the dispatcher still must NOT
    // emit "Unknown subcommand" for lint:typo.
    const r = run(['lint:does-not-exist-aaa', '--quiet']);
    assert.equal(r.status, 2, `Expected exit 2; got ${r.status}\nstderr: ${r.stderr}`);
    assert.ok(
      !r.stderr.includes('Unknown subcommand'),
      `dispatcher must NOT shadow lint: with "Unknown subcommand"; got:\n${r.stderr}`,
    );
    assert.ok(
      r.stderr.includes('does-not-exist-aaa'),
      `Expected unknown name echoed in stderr; got:\n${r.stderr}`,
    );
    assert.ok(
      r.stderr.includes('Known:'),
      `Expected "Known:" listing in stderr; got:\n${r.stderr}`,
    );
  });

  it('CS31: lint --only valid,typo (mixed) still exits 2 because of the typo', () => {
    const r = run(['lint', '--only', 'learnings,typo-name-bbb', '--quiet']);
    assert.equal(r.status, 2, `Expected exit 2; got ${r.status}\nstderr: ${r.stderr}`);
    assert.ok(
      r.stderr.includes('typo-name-bbb'),
      `Expected unknown name "typo-name-bbb" echoed in stderr; got:\n${r.stderr}`,
    );
    // The "unknown linter name:" header line must list ONLY the typo, not the
    // valid co-supplied name. (The Known: list at the bottom of stderr legitimately
    // mentions every valid name, which is why we scope this assertion to the
    // header line.)
    const headerLine = r.stderr.split('\n').find((l) => l.startsWith('harness lint --only:'));
    assert.ok(headerLine, `Expected "harness lint --only:" header line in stderr; got:\n${r.stderr}`);
    assert.ok(
      !headerLine.includes('learnings'),
      `Did not expect valid name "learnings" in error header; got: ${headerLine}`,
    );
  });

  // -------------------------------------------------------------------------
  // CS32 / D1 — `--skip` zero-match validation (mirrors CS31 `--only`)
  // -------------------------------------------------------------------------
  it('CS32/D1: lint --skip <unknown> exits 2 with a known-linters list (mirrors CS31)', () => {
    const r = run(['lint', '--skip', 'does-not-exist-aaa', '--quiet']);
    assert.equal(r.status, 2, `Expected exit 2; got ${r.status}\nstderr: ${r.stderr}`);
    assert.ok(
      r.stderr.includes('does-not-exist-aaa'),
      `Expected unknown name echoed in stderr; got:\n${r.stderr}`,
    );
    assert.ok(
      r.stderr.includes('harness lint --skip:'),
      `Expected "harness lint --skip:" header in stderr; got:\n${r.stderr}`,
    );
    assert.ok(
      r.stderr.includes('Known:'),
      `Expected "Known:" listing in stderr; got:\n${r.stderr}`,
    );
  });

  it('CS32/D1: lint --skip valid,typo (mixed) still exits 2 because of the typo', () => {
    const r = run(['lint', '--skip', 'workflow-pins,typo-name-ccc', '--quiet']);
    assert.equal(r.status, 2, `Expected exit 2; got ${r.status}\nstderr: ${r.stderr}`);
    assert.ok(
      r.stderr.includes('typo-name-ccc'),
      `Expected unknown name "typo-name-ccc" echoed in stderr; got:\n${r.stderr}`,
    );
    const headerLine = r.stderr.split('\n').find((l) => l.startsWith('harness lint --skip:'));
    assert.ok(headerLine, `Expected "harness lint --skip:" header line in stderr; got:\n${r.stderr}`);
    assert.ok(
      !headerLine.includes('workflow-pins'),
      `Did not expect valid name "workflow-pins" in error header; got: ${headerLine}`,
    );
  });

  // -------------------------------------------------------------------------
  // CS30 / D5 — `harness lint --explain <name>` prints rule docs
  // -------------------------------------------------------------------------
  it('CS30/D5: lint --explain architecture prints required-heading set + canonical seed path', () => {
    const r = run(['lint', '--explain', 'architecture']);
    assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
    for (const heading of ['Overview', 'Components', 'Data model', 'Decision log']) {
      assert.ok(r.stdout.includes(heading), `Expected "${heading}" in --explain output; got:\n${r.stdout}`);
    }
    assert.ok(
      r.stdout.includes('template/seeded/ARCHITECTURE.md'),
      `Expected canonical seed path in --explain output; got:\n${r.stdout}`,
    );
  });

  it('CS30/D5: lint --explain unknown-linter exits 2 with the known-linters list', () => {
    const r = run(['lint', '--explain', 'no-such-linter-xyz']);
    assert.equal(r.status, 2, `Expected exit 2; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.ok(
      r.stderr.includes('Known:'),
      `Expected "Known:" listing in stderr; got:\n${r.stderr}`,
    );
  });

  // CS32 / D3 — LINTER_EXPLANATIONS now covers all 18 shipped linters
  it('CS32/D3: lint --explain clickstop prints rule body for a newly-added linter', () => {
    const r = run(['lint', '--explain', 'clickstop']);
    assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.ok(
      r.stdout.includes('check-clickstop'),
      `Expected linter script name in --explain output; got:\n${r.stdout}`,
    );
    assert.ok(
      r.stdout.includes('Plan-vs-implementation review'),
      `Expected representative rule in --explain output; got:\n${r.stdout}`,
    );
  });

  it('CS32/D3: lint --explain workflow-pins prints rule body for a newly-added linter', () => {
    const r = run(['lint', '--explain', 'workflow-pins']);
    assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.ok(
      r.stdout.includes('check-workflow-pins'),
      `Expected linter script name in --explain output; got:\n${r.stdout}`,
    );
    assert.ok(
      r.stdout.includes('SHA pin') || r.stdout.includes('hex SHA'),
      `Expected representative rule (SHA pin) in --explain output; got:\n${r.stdout}`,
    );
  });

  // -------------------------------------------------------------------------
  // CS33 — auto-suggest `harness lint --explain <name>` at linter failure
  // -------------------------------------------------------------------------
  it('CS33/A: failing linter with registry entry emits hint exactly once on stderr', () => {
    const dir = makeTmpDir('harness-cs33-hint-');
    try {
      // WORKBOARD.md with a forbidden ## Queued heading → workboard linter fails
      writeText(path.join(dir, 'WORKBOARD.md'), [
        '# Work Board',
        '',
        '## Orchestrators',
        '',
        'Active: none',
        '',
        '## Active Work',
        '',
        '| CS | Status |',
        '|---|---|',
        '',
        '## Queued',
        '',
        'none',
        '',
      ].join('\n'));
      const r = run(['--cwd', dir, 'lint', '--only', 'workboard']);
      assert.notEqual(
        r.status, 0,
        `Expected non-zero exit for failing workboard; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`,
      );
      const hint = '→ Run `harness lint --explain workboard` for the full rule set.';
      const hintCount = r.stderr.split(hint).length - 1;
      assert.equal(
        hintCount, 1,
        `Expected hint exactly once in stderr; found ${hintCount} times\nstderr: ${r.stderr}`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('CS33/B: failing linter under --quiet does NOT emit hint on stderr', () => {
    const dir = makeTmpDir('harness-cs33-quiet-');
    try {
      writeText(path.join(dir, 'WORKBOARD.md'), [
        '# Work Board',
        '',
        '## Orchestrators',
        '',
        'Active: none',
        '',
        '## Active Work',
        '',
        '| CS | Status |',
        '|---|---|',
        '',
        '## Queued',
        '',
        'none',
        '',
      ].join('\n'));
      const r = run(['--cwd', dir, 'lint', '--only', 'workboard', '--quiet']);
      assert.notEqual(r.status, 0, `Expected non-zero exit for failing workboard; got ${r.status}`);
      assert.ok(
        !r.stderr.includes('harness lint --explain'),
        `Expected hint suppressed under --quiet; got stderr:\n${r.stderr}`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('CS33/C: passing linter does NOT emit hint on stderr (pass-suppression)', () => {
    // Validates the pass-suppression condition from Decision C33-2.
    // Note: "not in LINTER_EXPLANATIONS" case is unreachable because CS32/D3
    // populated the registry for all 18 shipped linters. This test covers the
    // third suppression condition: a passing linter never emits the hint even
    // without --quiet.
    const r = run(['lint', '--only', 'learnings']);
    assert.equal(r.status, 0, `Expected exit 0; got ${r.status}`);
    assert.ok(
      !r.stderr.includes('harness lint --explain'),
      `Expected no hint for a passing linter; got stderr:\n${r.stderr}`,
    );
  });

  // -------------------------------------------------------------------------
  // CS30 / D8 — version header at top of every `lint` invocation
  // -------------------------------------------------------------------------
  it('CS30/D8: lint output starts with a `# harness vX.Y.Z` header line', () => {
    const r = run(['lint', '--quiet']);
    assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const firstLine = (r.stdout.split('\n')[0] ?? '');
    assert.match(
      firstLine,
      /^# harness v\d+\.\d+\.\d+ — lint \(cwd: /,
      `Expected first line to be the version header; got: ${JSON.stringify(firstLine)}`,
    );
  });

  it('CS30/D8: lint help output documents the lint:NAME alias and --explain', () => {
    const r = run(['lint', '--help']);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('lint:NAME'), `Expected "lint:NAME" in --help; got:\n${r.stdout}`);
    assert.ok(r.stdout.includes('--explain'), `Expected "--explain" in --help; got:\n${r.stdout}`);
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
// CS11b — `--resolved-sha` CLI flag tests
// ---------------------------------------------------------------------------

describe('harness sync --resolved-sha (CS11b)', () => {
  it('rejects non-hex value with exit 2', () => {
    const r = run(['sync', '--mode=apply', '--resolved-sha', 'not-a-sha']);
    assert.equal(r.status, 2, `Expected exit 2; got ${r.status}\nstderr: ${r.stderr}`);
    assert.match(r.stderr, /40-character lowercase hex/);
  });

  it('rejects uppercase hex with exit 2', () => {
    const r = run(['sync', '--mode=apply', '--resolved-sha', 'ABCDEF0123456789ABCDEF0123456789ABCDEF01']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /40-character lowercase hex/);
  });

  it('rejects short hex with exit 2', () => {
    const r = run(['sync', '--mode=apply', '--resolved-sha', '0123456789abcdef']);
    assert.equal(r.status, 2);
  });

  it('--resolved-sha without value exits 2', () => {
    const r = run(['sync', '--mode=apply', '--resolved-sha']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /requires a value/);
  });

  it('--resolved-sha consuming next flag rejected (LRN-040 guard)', () => {
    const r = run(['sync', '--mode=apply', '--resolved-sha', '--accept-major']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /requires a value/);
  });

  it('--resolved-sha=<value> equals form supported', () => {
    // Use against a tmp dir with no harness.config.json — should fail later than parse,
    // but parser should accept the well-formed value.
    const dir = makeTmpDir();
    try {
      const r = run(['sync', '--mode=apply', '--resolved-sha=0123456789abcdef0123456789abcdef01234567'], { cwd: dir });
      // Will fail with a non-2 error (no harness.config.json), but must not be 2 (parse OK)
      assert.notEqual(r.status, 2, `Expected non-2 (parser accepted value); got ${r.status}\nstderr: ${r.stderr}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--resolved-sha is rejected in --mode=check (apply-only restriction)', () => {
    const r = run(['sync', '--mode=check', '--resolved-sha', '0123456789abcdef0123456789abcdef01234567']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /only valid with --mode=apply/);
  });

  it('--resolved-sha is rejected in --mode=dry-run (apply-only restriction)', () => {
    const r = run(['sync', '--mode=dry-run', '--resolved-sha', '0123456789abcdef0123456789abcdef01234567']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /only valid with --mode=apply/);
  });
});

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
// Blocker 2 historical (CS04, LRN-027): --config was rejected with exit 2 for
// sync/check as a stop-gap. CS15c (CS04b) closes the gap by threading --config
// into the sync engine. The stop-gap tests have been replaced by the new
// `CS15c — CS04b --config threading + CS04d --ref reject` describe block at the
// end of this file.
// ---------------------------------------------------------------------------

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

describe('CS15c — CS04b --config threading + CS04d --ref reject', () => {
  const refNotImplemented = "--ref is not yet implemented. To pin a harness version, set 'version' in harness.config.json.";

  function configWithReadme(projectName, suffix) {
    return {
      ...minimalConfig(suffix),
      project: {
        name: projectName,
        agent_suffix: suffix,
      },
      seeded: { files: ['README.md'] },
      templating: {
        project_name: projectName,
      },
    };
  }

  function makeRepoWithConfig(projectName = 'cwd-config-project', suffix = 'cwd') {
    const dir = makeTmpDir('harness-cs15c-repo-');
    writeJSON(path.join(dir, 'harness.config.json'), configWithReadme(projectName, suffix));
    return dir;
  }

  function assertReadmeProjectName(repoDir, expectedProjectName) {
    const readme = readFileSync(path.join(repoDir, 'README.md'), 'utf8');
    assert.ok(
      readme.includes(`# ${expectedProjectName}`),
      `README.md should reflect override project name ${expectedProjectName}; got:\n${readme}`,
    );
  }

  it('sync --config <path> uses the alternate config instead of --cwd harness.config.json', () => {
    const repoDir = makeRepoWithConfig('cwd-config-project', 'cwd');
    const altConfigPath = path.join(makeTmpDir('harness-cs15c-config-'), 'alt.harness.config.json');
    try {
      writeJSON(altConfigPath, configWithReadme('alt-config-project', 'alt'));
      const r = run(['sync', '--mode=apply', '--config', altConfigPath, '--cwd', repoDir]);
      assert.equal(r.status, 0, `Expected exit 0; stderr: ${r.stderr}; stdout: ${r.stdout}`);
      assertReadmeProjectName(repoDir, 'alt-config-project');
    } finally {
      rmSync(path.dirname(altConfigPath), { recursive: true, force: true });
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('sync --config=<path> uses the alternate config instead of --cwd harness.config.json', () => {
    const repoDir = makeRepoWithConfig('cwd-config-project', 'cwd');
    const altConfigPath = path.join(makeTmpDir('harness-cs15c-config-equals-'), 'alt.harness.config.json');
    try {
      writeJSON(altConfigPath, configWithReadme('alt-config-equals-project', 'eq'));
      const r = run(['sync', '--mode=apply', `--config=${altConfigPath}`, '--cwd', repoDir]);
      assert.equal(r.status, 0, `Expected exit 0; stderr: ${r.stderr}; stdout: ${r.stdout}`);
      assertReadmeProjectName(repoDir, 'alt-config-equals-project');
    } finally {
      rmSync(path.dirname(altConfigPath), { recursive: true, force: true });
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('sync --config <missing-file> exits 1 with the explicit config-file message', () => {
    const repoDir = makeRepoWithConfig();
    const missingConfigPath = path.join(repoDir, 'does-not-exist.harness.config.json');
    try {
      const r = run(['sync', '--config', missingConfigPath, '--cwd', repoDir]);
      assert.equal(r.status, 1, `Expected exit 1; got ${r.status}; stderr: ${r.stderr}`);
      assert.ok(
        r.stderr.includes(`Config file not found at ${missingConfigPath}`),
        `stderr missing explicit config path; got: ${r.stderr}`,
      );
      assert.ok(
        !r.stderr.includes('harness.config.json not found at'),
        `stderr must not use legacy implicit-config message; got: ${r.stderr}`,
      );
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('sync --config <malformed-json> exits 1 with a JSON parse message', () => {
    const repoDir = makeRepoWithConfig();
    const malformedConfigPath = path.join(makeTmpDir('harness-cs15c-malformed-'), 'malformed.harness.config.json');
    try {
      writeText(malformedConfigPath, '{ this is not json\n');
      const r = run(['sync', '--config', malformedConfigPath, '--cwd', repoDir]);
      assert.equal(r.status, 1, `Expected exit 1; got ${r.status}; stderr: ${r.stderr}`);
      assert.ok(
        r.stderr.includes('is not valid JSON'),
        `stderr missing JSON parse message; got: ${r.stderr}`,
      );
    } finally {
      rmSync(path.dirname(malformedConfigPath), { recursive: true, force: true });
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('sync --config <schema-invalid-json> exits 1 with schema-related stderr (R1: includes override path)', () => {
    const repoDir = makeRepoWithConfig();
    const invalidConfigPath = path.join(makeTmpDir('harness-cs15c-invalid-schema-'), 'invalid.harness.config.json');
    try {
      writeJSON(invalidConfigPath, { project: { name: 'x', agent_suffix: 'x' } });
      const r = run(['sync', '--config', invalidConfigPath, '--cwd', repoDir]);
      assert.equal(r.status, 1, `Expected exit 1; got ${r.status}; stderr: ${r.stderr}`);
      assert.match(
        r.stderr,
        /schema|validation|invalid|missing required field/i,
        `stderr should be schema-related; got: ${r.stderr}`,
      );
      // R1 reviewer (GPT-5.5) blocker: schema-validation error stderr must include
      // the override path so users see WHICH file failed, not just "harness.config.json".
      assert.ok(
        r.stderr.includes(invalidConfigPath),
        `stderr must include the override path (got: ${r.stderr})`,
      );
    } finally {
      rmSync(path.dirname(invalidConfigPath), { recursive: true, force: true });
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('sync --config <malformed-path> stderr includes the override path (R1)', () => {
    const repoDir = makeRepoWithConfig();
    const malformedPath = path.join(makeTmpDir('harness-cs15c-malformed-path-'), 'broken.harness.config.json');
    try {
      writeText(malformedPath, '{ this is not json\n');
      const r = run(['sync', '--config', malformedPath, '--cwd', repoDir]);
      assert.equal(r.status, 1, `Expected exit 1; got ${r.status}; stderr: ${r.stderr}`);
      assert.ok(
        r.stderr.includes(malformedPath),
        `stderr must include the override path (got: ${r.stderr})`,
      );
    } finally {
      rmSync(path.dirname(malformedPath), { recursive: true, force: true });
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('check --config <path> uses the alternate config (R1: explicit check-side regression)', () => {
    const repoDir = makeRepoWithConfig('cwd-config-project', 'cwd');
    const altConfigPath = path.join(makeTmpDir('harness-cs15c-check-config-'), 'alt.harness.config.json');
    try {
      // Write an override config whose schema-invalid shape forces a clear,
      // identifiable failure path that proves the override is the file being read.
      writeJSON(altConfigPath, { project: { name: 'x', agent_suffix: 'x' } });
      const r = run(['check', '--config', altConfigPath, '--cwd', repoDir]);
      assert.equal(r.status, 1, `Expected exit 1; got ${r.status}; stderr: ${r.stderr}`);
      assert.ok(
        r.stderr.includes(altConfigPath),
        `stderr must include the override path proving check used it (got: ${r.stderr})`,
      );
      assert.ok(
        !r.stderr.includes('--config is not yet supported'),
        `stop-gap message must be gone (got: ${r.stderr})`,
      );
    } finally {
      rmSync(path.dirname(altConfigPath), { recursive: true, force: true });
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('sync --config <relative-path> resolves relative to the invocation cwd, not --cwd', () => {
    const invocationDir = makeTmpDir('harness-cs15c-invocation-');
    const repoDir = makeRepoWithConfig('cwd-relative-project', 'cwdrel');
    const relativeConfigPath = path.join('configs', 'alt.harness.config.json');
    try {
      writeJSON(path.join(invocationDir, relativeConfigPath), configWithReadme('invocation-relative-project', 'invrel'));
      writeJSON(path.join(repoDir, relativeConfigPath), configWithReadme('cwd-relative-wrong-project', 'wrong'));
      const r = run(['sync', '--mode=apply', '--config', relativeConfigPath, '--cwd', repoDir], { cwd: invocationDir });
      assert.equal(r.status, 0, `Expected exit 0; stderr: ${r.stderr}; stdout: ${r.stdout}`);
      assertReadmeProjectName(repoDir, 'invocation-relative-project');
    } finally {
      rmSync(invocationDir, { recursive: true, force: true });
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('sync --ref rejects in the subcommand body with the planned-flag message', () => {
    const repoDir = makeRepoWithConfig();
    try {
      const r = run(['sync', '--ref', 'v0.2.0', '--cwd', repoDir]);
      assert.equal(r.status, 2, `Expected exit 2; got ${r.status}; stderr: ${r.stderr}`);
      assert.ok(r.stderr.includes(refNotImplemented), `stderr missing --ref rejection; got: ${r.stderr}`);
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('check --ref rejects in the subcommand body with the planned-flag message', () => {
    const repoDir = makeRepoWithConfig();
    try {
      const r = run(['check', '--ref', 'X', '--cwd', repoDir]);
      assert.equal(r.status, 2, `Expected exit 2; got ${r.status}; stderr: ${r.stderr}`);
      assert.ok(r.stderr.includes(refNotImplemented), `stderr missing --ref rejection; got: ${r.stderr}`);
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('sync --help mentions --ref as planned or not yet implemented', () => {
    const r = run(['sync', '--help']);
    assert.equal(r.status, 0, `Expected exit 0; stderr: ${r.stderr}`);
    assert.match(r.stdout, /--ref.*(planned|not yet implemented|future)/i, `stdout missing planned --ref note; got: ${r.stdout}`);
  });

  it('check --ref=<value> parses globally before the subcommand-level rejection', () => {
    const repoDir = makeRepoWithConfig();
    try {
      const r = run(['check', '--ref=value', '--cwd', repoDir]);
      assert.equal(r.status, 2, `Expected exit 2; got ${r.status}; stderr: ${r.stderr}`);
      assert.ok(r.stderr.includes(refNotImplemented), `stderr missing --ref rejection; got: ${r.stderr}`);
      assert.ok(!/Unknown flag.*--ref/i.test(r.stderr), `--ref should not be rejected by argv parsing; got: ${r.stderr}`);
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// CS15e — `harness init` GitHub-tier detection (constraints block)
// ---------------------------------------------------------------------------

describe('CS15e — harness init constraint detection', () => {
  /**
   * The detection helper makes live GitHub API calls. To keep these CLI tests
   * deterministic + offline-safe, cmdInit honors the test-only env var
   * HARNESS_DETECT_TIER_OVERRIDE: when set, its value is parsed as JSON and
   * used verbatim as the detection result (bypassing the live helper). γ1's
   * lib/github-detect tests already cover the live algorithm thoroughly.
   */

  it('init --skip-constraint-detection skips detection and writes no constraints block', () => {
    const dir = makeTmpDir();
    try {
      const r = run(['init', '--skip-constraint-detection', dir]);
      assert.equal(r.status, 0, `Expected exit 0; stderr: ${r.stderr}`);
      assert.ok(r.stdout.includes('Skipped tier detection'), `Expected skip notice; stdout: ${r.stdout}`);
      assert.ok(!existsSync(path.join(dir, '.harness-known-constraints.md')), '.harness-known-constraints.md should NOT exist');
      const cfg = JSON.parse(readFileSync(path.join(dir, 'harness.config.json'), 'utf8'));
      assert.equal(cfg.constraints, undefined, 'constraints block should NOT be written');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('init writes constraints block + .harness-known-constraints.md + CONTEXT.md ref for tier=public', () => {
    const dir = makeTmpDir();
    const env = { HARNESS_DETECT_TIER_OVERRIDE: JSON.stringify({ tier: 'public', owner: 'acme', repo: 'widget', ownerType: 'User' }) };
    try {
      const r = run(['init', dir], { env });
      assert.equal(r.status, 0, `Expected exit 0; stderr: ${r.stderr}`);
      assert.ok(r.stdout.includes('tier=public'), `Expected summary; stdout: ${r.stdout}`);

      const cfg = JSON.parse(readFileSync(path.join(dir, 'harness.config.json'), 'utf8'));
      assert.equal(cfg.constraints?.tier, 'public');
      assert.equal(cfg.constraints?.owner, 'acme');
      assert.equal(cfg.constraints?.repo, 'widget');
      assert.equal(cfg.constraints?.disposition, undefined, 'public tier must omit disposition');
      assert.match(cfg.constraints?.detected_at ?? '', /^\d{4}-\d{2}-\d{2}T/, 'detected_at must be ISO 8601');

      const hkc = readFileSync(path.join(dir, '.harness-known-constraints.md'), 'utf8');
      assert.ok(hkc.includes('Tier: `public`'), 'known-constraints body should reflect tier');
      assert.ok(!hkc.includes('<!--'), 'leading editor comment should be stripped');
      assert.ok(!hkc.includes('Disposition:'), 'public tier must omit Disposition line');

      const ctx = readFileSync(path.join(dir, 'CONTEXT.md'), 'utf8');
      assert.ok(/^## Constraints[ \t]*\r?\n\r?\nSee `\.harness-known-constraints\.md`/m.test(ctx), `CONTEXT.md should have one-line ref under ## Constraints; got: ${ctx.slice(0, 600)}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('init writes disposition for tier=private-free with default discipline-only', () => {
    const dir = makeTmpDir();
    const env = { HARNESS_DETECT_TIER_OVERRIDE: JSON.stringify({ tier: 'private-free', owner: 'acme', repo: 'widget', ownerType: 'User' }) };
    try {
      const r = run(['init', dir], { env });
      assert.equal(r.status, 0, `Expected exit 0; stderr: ${r.stderr}`);
      const cfg = JSON.parse(readFileSync(path.join(dir, 'harness.config.json'), 'utf8'));
      assert.equal(cfg.constraints?.tier, 'private-free');
      assert.equal(cfg.constraints?.disposition, 'discipline-only', 'default disposition for private-free is discipline-only');
      const hkc = readFileSync(path.join(dir, '.harness-known-constraints.md'), 'utf8');
      assert.ok(hkc.includes('Disposition: `discipline-only`'), 'private-free must emit Disposition line');
      // CS15e plan line 110 + LRN-064 review gap fix: private-free init must
      // print the 3-option disposition notice at runtime, not just record the
      // chosen disposition silently.
      assert.ok(r.stdout.includes('Disposition options'), `Expected disposition options notice; stdout: ${r.stdout}`);
      assert.ok(r.stdout.includes('discipline-only'), 'options notice must mention discipline-only');
      assert.ok(r.stdout.includes('upgrade-pro'), 'options notice must mention upgrade-pro');
      assert.ok(r.stdout.includes('flip-public-when-ready'), 'options notice must mention flip-public-when-ready');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  for (const disp of ['discipline-only', 'upgrade-pro', 'flip-public-when-ready']) {
    it(`init --constraint-disposition ${disp} records the chosen disposition for private-free`, () => {
      const dir = makeTmpDir();
      const env = { HARNESS_DETECT_TIER_OVERRIDE: JSON.stringify({ tier: 'private-free', owner: 'acme', repo: 'widget', ownerType: 'User' }) };
      try {
        const r = run(['init', '--constraint-disposition', disp, dir], { env });
        assert.equal(r.status, 0, `Expected exit 0; stderr: ${r.stderr}`);
        const cfg = JSON.parse(readFileSync(path.join(dir, 'harness.config.json'), 'utf8'));
        assert.equal(cfg.constraints?.disposition, disp);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }

  it('init --constraint-disposition <invalid> exits 2 with documented enum values in stderr', () => {
    const dir = makeTmpDir();
    try {
      const r = run(['init', '--constraint-disposition', 'made-up-value', dir]);
      assert.equal(r.status, 2, `Expected exit 2; got ${r.status}; stderr: ${r.stderr}`);
      assert.ok(r.stderr.includes('made-up-value'), `stderr should include the bad value; got: ${r.stderr}`);
      assert.ok(r.stderr.includes('discipline-only'), `stderr should list valid values; got: ${r.stderr}`);
      assert.ok(r.stderr.includes('upgrade-pro'));
      assert.ok(r.stderr.includes('flip-public-when-ready'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('init with tier=unknown (e.g. no remote) skips constraints block silently', () => {
    const dir = makeTmpDir();
    const env = { HARNESS_DETECT_TIER_OVERRIDE: JSON.stringify({ tier: 'unknown', reason: 'no-remote' }) };
    try {
      const r = run(['init', dir], { env });
      assert.equal(r.status, 0, `Expected exit 0; stderr: ${r.stderr}`);
      assert.ok(r.stdout.includes('Skipped .harness-known-constraints.md'), `Expected skip notice; stdout: ${r.stdout}`);
      const cfg = JSON.parse(readFileSync(path.join(dir, 'harness.config.json'), 'utf8'));
      assert.equal(cfg.constraints, undefined, 'no constraints block when tier=unknown without owner/repo');
      assert.ok(!existsSync(path.join(dir, '.harness-known-constraints.md')), '.harness-known-constraints.md should NOT exist');
      // CS15e plan + LRN-064 review gap fix: the summary line on the skip
      // path must NOT reference .harness-known-constraints.md (it was not
      // written). It must surface the detection reason instead so the user
      // understands why no constraints were recorded.
      assert.ok(
        !r.stdout.includes('See .harness-known-constraints.md for details'),
        `summary must not point at an unwritten artifact; stdout: ${r.stdout}`
      );
      assert.ok(
        r.stdout.includes('No constraints recorded'),
        `summary must announce that no constraints were recorded; stdout: ${r.stdout}`
      );
      assert.ok(
        r.stdout.includes('reason=no-remote'),
        `summary must surface the detection reason; stdout: ${r.stdout}`
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('init --constraint-disposition on non-private-free tier prints warning and omits disposition', () => {
    const dir = makeTmpDir();
    const env = { HARNESS_DETECT_TIER_OVERRIDE: JSON.stringify({ tier: 'public', owner: 'acme', repo: 'widget', ownerType: 'User' }) };
    try {
      const r = run(['init', '--constraint-disposition', 'upgrade-pro', dir], { env });
      assert.equal(r.status, 0, `Expected exit 0; stderr: ${r.stderr}`);
      assert.ok(r.stderr.includes('ignored'), `Expected warning that --constraint-disposition was ignored; stderr: ${r.stderr}`);
      const cfg = JSON.parse(readFileSync(path.join(dir, 'harness.config.json'), 'utf8'));
      assert.equal(cfg.constraints?.disposition, undefined, 'disposition must be omitted for non-private-free tier');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('init is idempotent: re-runs do not duplicate the CONTEXT.md `## Constraints` heading', () => {
    const dir = makeTmpDir();
    const env = { HARNESS_DETECT_TIER_OVERRIDE: JSON.stringify({ tier: 'public', owner: 'acme', repo: 'widget', ownerType: 'User' }) };
    try {
      const r1 = run(['init', dir], { env });
      assert.equal(r1.status, 0, `Run 1 stderr: ${r1.stderr}`);
      const r2 = run(['init', dir], { env });
      assert.equal(r2.status, 0, `Run 2 stderr: ${r2.stderr}`);
      const ctx = readFileSync(path.join(dir, 'CONTEXT.md'), 'utf8');
      const headingMatches = ctx.match(/^## Constraints/gm) ?? [];
      assert.equal(headingMatches.length, 1, `Expected exactly one ## Constraints heading; got ${headingMatches.length}; CONTEXT.md: ${ctx.slice(0, 800)}`);
      // CS15e plan + LRN-064 review gap fix: stronger idempotency guard —
      // also assert that the `.harness-known-constraints.md` reference line
      // (not just the heading) appears exactly once. Catches the case where
      // the section-replacement regex fails (e.g. broken `\Z` anchor) and
      // appends a new heading + body alongside the existing one.
      const refMatches = ctx.match(/See `\.harness-known-constraints\.md` for repository tier and disposition/g) ?? [];
      assert.equal(refMatches.length, 1, `Expected exactly one constraints reference line; got ${refMatches.length}; CONTEXT.md: ${ctx.slice(0, 800)}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('init re-evaluation is idempotent even when `## Constraints` is the LAST H2 in CONTEXT.md (JS regex EOF anchor)', () => {
    // CS15e LRN-064 review gap fix: JS regex has no `\Z` anchor. The
    // section-replacement regex must use `$(?![\s\S])` (or equivalent) so
    // that re-running init against a CONTEXT.md whose `## Constraints` is
    // the trailing H2 still replaces the body rather than appending a
    // duplicate heading. This test guards against regression to the broken
    // `\Z` form.
    const dir = makeTmpDir();
    const env = { HARNESS_DETECT_TIER_OVERRIDE: JSON.stringify({ tier: 'public', owner: 'acme', repo: 'widget', ownerType: 'User' }) };
    try {
      // Run init once to lay down a valid CONTEXT.md.
      const r1 = run(['init', dir], { env });
      assert.equal(r1.status, 0, `Run 1 stderr: ${r1.stderr}`);
      // Mutate CONTEXT.md so `## Constraints` is the LAST H2 in the file.
      // The seeded template ships with `## Constraints` followed by other
      // H2s, so we strip the trailing H2s to exercise the EOF code path.
      const ctxPath = path.join(dir, 'CONTEXT.md');
      const original = readFileSync(ctxPath, 'utf8');
      const cutAt = original.indexOf('\n## ', original.indexOf('## Constraints') + 1);
      assert.ok(cutAt > 0, 'precondition: seeded CONTEXT.md must have at least one H2 after ## Constraints');
      writeFileSync(ctxPath, original.slice(0, cutAt) + '\n', 'utf8');
      const beforeRerun = readFileSync(ctxPath, 'utf8');
      const beforeHeadings = (beforeRerun.match(/^## Constraints/gm) ?? []).length;
      const beforeRefs = (beforeRerun.match(/See `\.harness-known-constraints\.md`/g) ?? []).length;
      assert.equal(beforeHeadings, 1, 'precondition: exactly one heading after mutation');
      assert.equal(beforeRefs, 1, 'precondition: exactly one ref line after mutation');
      // Re-run init; the section replacement must still be idempotent.
      const r2 = run(['init', dir], { env });
      assert.equal(r2.status, 0, `Run 2 stderr: ${r2.stderr}`);
      const after = readFileSync(ctxPath, 'utf8');
      const afterHeadings = (after.match(/^## Constraints/gm) ?? []).length;
      const afterRefs = (after.match(/See `\.harness-known-constraints\.md`/g) ?? []).length;
      assert.equal(afterHeadings, 1, `Expected exactly one ## Constraints heading after EOF re-run; got ${afterHeadings}; CONTEXT.md: ${after}`);
      assert.equal(afterRefs, 1, `Expected exactly one constraints reference line after EOF re-run; got ${afterRefs}; CONTEXT.md: ${after}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('init writes a constraints block that validates against the schema (lib/config-reader.mjs::writeConfig path)', () => {
    const dir = makeTmpDir();
    const env = { HARNESS_DETECT_TIER_OVERRIDE: JSON.stringify({ tier: 'private-pro', owner: 'acme', repo: 'widget', ownerType: 'Organization' }) };
    try {
      const r = run(['init', dir], { env });
      assert.equal(r.status, 0, `Expected exit 0; stderr: ${r.stderr}`);
      // Re-run sync --check; if writeConfig wrote a schema-invalid config the
      // sync engine will fail because it shares the same loadConfig path.
      const r2 = run(['sync', '--mode=check', '--cwd', dir]);
      assert.equal(r2.status, 0, `sync --check should succeed against init-written config; stderr: ${r2.stderr}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('init --help mentions the new flags and ADR pointer', () => {
    const r = run(['init', '--help']);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('--constraint-disposition'), 'init --help must document --constraint-disposition');
    assert.ok(r.stdout.includes('--skip-constraint-detection'), 'init --help must document --skip-constraint-detection');
    assert.ok(r.stdout.includes('discipline-only'));
    assert.ok(r.stdout.includes('upgrade-pro'));
    assert.ok(r.stdout.includes('flip-public-when-ready'));
    assert.ok(/0003-constraints-field\.md/.test(r.stdout), 'init --help should reference the ADR');
  });
});