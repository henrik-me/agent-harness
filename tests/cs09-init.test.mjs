import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
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
});
