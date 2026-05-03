import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const HARNESS = path.join(REPO_ROOT, 'bin', 'harness.mjs');
const NODE = process.execPath;

function makeTmpDir() {
  return mkdtempSync(path.join(tmpdir(), 'harness-init-'));
}

function runHarness(args, opts = {}) {
  return spawnSync(NODE, [HARNESS, ...args], {
    encoding: 'utf8',
    cwd: opts.cwd ?? REPO_ROOT,
    ...opts,
  });
}

function runScript(scriptName, args, opts = {}) {
  return spawnSync(NODE, [path.join(REPO_ROOT, 'scripts', scriptName), ...args], {
    encoding: 'utf8',
    cwd: opts.cwd ?? REPO_ROOT,
    ...opts,
  });
}

describe('CS09 — harness init seeds a fresh consumer repo', () => {
  it('1. harness init produces all 5 seeded skeletons + harness.config.json', () => {
    const dir = makeTmpDir();
    try {
      const r = runHarness(['--cwd', dir, 'init']);
      assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);

      // All 5 seeded skeletons + config produced
      for (const file of [
        'harness.config.json',
        'CONTEXT.md',
        'ARCHITECTURE.md',
        'LEARNINGS.md',
        'WORKBOARD.md',
        'README.md',
      ]) {
        assert.ok(
          existsSync(path.join(dir, file)),
          `Expected ${file} to be produced; not found`
        );
      }

      // Clickstops directory tree
      for (const sub of ['planned', 'active', 'done']) {
        assert.ok(
          existsSync(path.join(dir, 'project', 'clickstops', sub, '.gitkeep')),
          `Expected project/clickstops/${sub}/.gitkeep`
        );
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('2. produced CONTEXT.md passes check-context linter', () => {
    const dir = makeTmpDir();
    try {
      runHarness(['--cwd', dir, 'init']);
      const r = runScript('check-context.mjs', ['--file', path.join(dir, 'CONTEXT.md'), '--cwd', dir]);
      assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('3. produced ARCHITECTURE.md passes check-architecture linter', () => {
    const dir = makeTmpDir();
    try {
      runHarness(['--cwd', dir, 'init']);
      const r = runScript('check-architecture.mjs', ['--file', path.join(dir, 'ARCHITECTURE.md')]);
      assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('4. produced LEARNINGS.md passes check-learnings linter', () => {
    const dir = makeTmpDir();
    try {
      runHarness(['--cwd', dir, 'init']);
      const r = runScript('check-learnings.mjs', ['--file', path.join(dir, 'LEARNINGS.md')]);
      assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('5. produced WORKBOARD.md passes check-workboard linter', () => {
    const dir = makeTmpDir();
    try {
      runHarness(['--cwd', dir, 'init']);
      const r = runScript('check-workboard.mjs', ['--file', path.join(dir, 'WORKBOARD.md')]);
      assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('6. produced README.md passes check-readme linter', () => {
    const dir = makeTmpDir();
    try {
      runHarness(['--cwd', dir, 'init']);
      const r = runScript('check-readme.mjs', ['--file', path.join(dir, 'README.md')]);
      assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('7. harness lint --quiet against init-produced repo passes (or skips missing targets gracefully)', () => {
    const dir = makeTmpDir();
    try {
      runHarness(['--cwd', dir, 'init']);
      const r = runHarness(['--cwd', dir, 'lint', '--quiet']);
      assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
      // The seeded skeletons cover the core 5; clickstop/composed-blocks/etc. should pass or skip
      assert.ok(
        r.stdout.includes('Total:') && r.stdout.includes('0 failed'),
        `Expected "0 failed" in summary; got:\n${r.stdout}`
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('8. init-produced harness.config.json is the seeded config (not minimal scaffold)', () => {
    const dir = makeTmpDir();
    try {
      const r = runHarness(['--cwd', dir, 'init']);
      assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);

      const cfg = JSON.parse(readFileSync(path.join(dir, 'harness.config.json'), 'utf8'));

      // composed.files matches seeded template
      assert.deepEqual(cfg.composed.files, ['CONVENTIONS.md', 'OPERATIONS.md', 'REVIEWS.md']);

      // local_blocks has the 3 expected entries
      assert.equal(Object.keys(cfg.local_blocks).length, 3);
      assert.ok('CONVENTIONS.md' in cfg.local_blocks, 'Expected local_blocks.CONVENTIONS.md');
      assert.ok('OPERATIONS.md' in cfg.local_blocks, 'Expected local_blocks.OPERATIONS.md');
      assert.ok('REVIEWS.md' in cfg.local_blocks, 'Expected local_blocks.REVIEWS.md');

      // templating map has expected keys
      for (const key of ['project_name', 'agent_suffix', 'agent_suffix_upper', 'repo_owner', 'default_codeowner', 'lib_codeowner', 'repo_short']) {
        assert.ok(key in cfg.templating, `Expected templating.${key}`);
      }

      // $schema is the canonical URL
      assert.equal(
        cfg.$schema,
        'https://github.com/henrik-me/agent-harness/schemas/harness.config.schema.json'
      );

      // agent_suffix matches schema pattern ^[a-z][a-z0-9-]*$
      assert.match(cfg.project.agent_suffix, /^[a-z][a-z0-9-]*$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('9. harness init with existing config skips config write but still copies seeded files (Blocker 2 regression)', () => {
    const dir = makeTmpDir();
    try {
      // Pre-write a minimal valid harness.config.json (different from seeded)
      mkdirSync(dir, { recursive: true });
      const preConfig = JSON.stringify(
        { version: 'v0.0.1', project: { name: 'pre-existing', agent_suffix: 'pe' } },
        null,
        2
      ) + '\n';
      writeFileSync(path.join(dir, 'harness.config.json'), preConfig, 'utf8');

      const r = runHarness(['--cwd', dir, 'init']);
      assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);

      // harness.config.json content must be unchanged
      const afterConfig = readFileSync(path.join(dir, 'harness.config.json'), 'utf8');
      assert.equal(afterConfig, preConfig, 'harness.config.json should be unchanged when it pre-exists');

      // Seeded files must have been created (this was the bug — they were silently skipped)
      for (const file of ['CONTEXT.md', 'ARCHITECTURE.md', 'README.md', 'LEARNINGS.md', 'WORKBOARD.md']) {
        assert.ok(existsSync(path.join(dir, file)), `Expected ${file} to be created by init`);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
