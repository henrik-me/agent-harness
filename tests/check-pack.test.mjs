/**
 * tests/check-pack.test.mjs — Tests for scripts/check-pack.mjs
 *
 * Uses node:test (consistent with other test files in this suite).
 * Spawns the linter via spawnSync.
 * Fixtures are built in OS temp directories (mkdtempSync) so that stub files
 * used for negative tests do not pollute the harness repo.
 *
 * Run: node --test tests/check-pack.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const LINTER = path.join(REPO_ROOT, 'scripts', 'check-pack.mjs');
const NODE = process.execPath;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run the linter with the given args. Returns { stdout, stderr, status }.
 *
 * @param {string[]} [args]
 * @returns {{ stdout: string, stderr: string, status: number }}
 */
function runLinter(args = []) {
  const result = spawnSync(NODE, [LINTER, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? -1,
  };
}

/**
 * Create a temporary directory, write the given files into it, and return
 * the directory path. Parent directories are created as needed.
 *
 * @param {string} prefix
 * @param {Record<string, string>} files  relative path → content
 * @returns {string} tmpdir path
 */
function makeTmpFixture(prefix, files) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `cs13-${prefix}-`));
  for (const [relPath, content] of Object.entries(files)) {
    const abs = path.join(tmpDir, relPath);
    const dir = path.dirname(abs);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
  }
  return tmpDir;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('check-pack linter', () => {

  // 1. Clean repo passes — the harness's own package satisfies all checks.
  it('1. clean repo (--cwd REPO_ROOT) exits 0', () => {
    const r = runLinter(['--cwd', REPO_ROOT]);
    assert.equal(
      r.status, 0,
      `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`,
    );
    assert.ok(
      r.stdout.includes('0 violations'),
      `Expected "0 violations" in stdout; got:\n${r.stdout}`,
    );
  });

  // 2. Forbidden-pattern violation — fixture with tests/ in files array.
  // npm will pack tests/helper.mjs; check-pack must flag it as forbidden.
  it('2. forbidden-pattern violation exits 1 and names the pattern', () => {
    const tmpDir = makeTmpFixture('forbidden', {
      'package.json': JSON.stringify({
        name: 'test-fixture-forbidden',
        version: '0.0.0',
        private: true,
        files: ['tests'],
      }),
      'tests/helper.mjs': '// stub\n',
    });

    const r = runLinter(['--cwd', tmpDir]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`,
    );
    assert.ok(
      r.stdout.includes('VIOLATION: forbidden:'),
      `Expected "VIOLATION: forbidden:" in stdout; got:\n${r.stdout}`,
    );
    assert.ok(
      r.stdout.includes('tests/'),
      `Expected "tests/" in stdout; got:\n${r.stdout}`,
    );
  });

  // 3. Size-budget violation — pass --max-size-bytes 1 against the real repo.
  it('3. size-budget violation exits 1 with size message', () => {
    const r = runLinter(['--cwd', REPO_ROOT, '--max-size-bytes', '1']);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`,
    );
    assert.ok(
      r.stdout.includes('VIOLATION: size:'),
      `Expected "VIOLATION: size:" in stdout; got:\n${r.stdout}`,
    );
    assert.ok(
      r.stdout.includes('exceeds budget'),
      `Expected "exceeds budget" in stdout; got:\n${r.stdout}`,
    );
  });

  // 4. Missing-required violation — fixture with files:["lib"] has lib/ but
  // no bin/harness.mjs and no template/, scripts/, scaffolds/, schemas/.
  it('4. missing-required violation exits 1 and names bin/harness.mjs', () => {
    const tmpDir = makeTmpFixture('missing', {
      'package.json': JSON.stringify({
        name: 'test-fixture-missing',
        version: '0.0.0',
        private: true,
        files: ['lib'],
      }),
      'lib/foo.mjs': '// stub\n',
    });

    const r = runLinter(['--cwd', tmpDir]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`,
    );
    assert.ok(
      r.stdout.includes('VIOLATION: missing-required:'),
      `Expected "VIOLATION: missing-required:" in stdout; got:\n${r.stdout}`,
    );
    assert.ok(
      r.stdout.includes('bin/harness.mjs'),
      `Expected "bin/harness.mjs" in stdout; got:\n${r.stdout}`,
    );
  });

  // 5a. Usage error — missing --cwd → exit 2.
  it('5a. missing --cwd exits 2', () => {
    const r = runLinter([]);
    assert.equal(
      r.status, 2,
      `Expected exit 2; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`,
    );
    assert.ok(
      r.stderr.includes('--cwd'),
      `Expected "--cwd" in stderr; got:\n${r.stderr}`,
    );
  });

  // 5b. Usage error — non-numeric --max-size-bytes → exit 2.
  it('5b. non-numeric --max-size-bytes exits 2', () => {
    const r = runLinter(['--cwd', REPO_ROOT, '--max-size-bytes', 'abc']);
    assert.equal(
      r.status, 2,
      `Expected exit 2; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`,
    );
    assert.ok(
      r.stderr.includes('positive integer'),
      `Expected "positive integer" in stderr; got:\n${r.stderr}`,
    );
  });

});
