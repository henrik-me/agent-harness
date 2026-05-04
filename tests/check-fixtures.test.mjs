/**
 * tests/check-fixtures.test.mjs — Tests for scripts/check-fixtures.mjs (CS13/LRN-076).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const LINTER = path.join(REPO_ROOT, 'scripts', 'check-fixtures.mjs');
const NODE = process.execPath;

function run(args = [], cwd = REPO_ROOT) {
  const r = spawnSync(NODE, [LINTER, ...args], { cwd, encoding: 'utf8' });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status ?? -1 };
}

function makeRepo() {
  const root = mkdtempSync(path.join(tmpdir(), 'check-fixtures-'));
  // init a real git repo so check-ignore has something to consult.
  spawnSync('git', ['init', '-q'], { cwd: root });
  return root;
}

describe('check-fixtures linter', () => {
  it('1. clean fixtures dir exits 0', () => {
    const repo = makeRepo();
    const fix = path.join(repo, 'tests', 'fixtures', 'sample');
    mkdirSync(fix, { recursive: true });
    writeFileSync(path.join(fix, 'data.txt'), 'hello\n');
    writeFileSync(path.join(repo, '.gitignore'), 'node_modules\n');
    const r = run(['--dir', path.join(repo, 'tests', 'fixtures')]);
    assert.equal(r.status, 0, `expected 0 got ${r.status}: ${r.stderr}`);
    assert.match(r.stdout, /0 violations/);
  });

  it('2. gitignored fixture file exits 1 with violation', () => {
    const repo = makeRepo();
    const fix = path.join(repo, 'tests', 'fixtures', 'sample');
    mkdirSync(fix, { recursive: true });
    writeFileSync(path.join(fix, 'creds.log'), 'AKIA...EXAMPLE\n');
    writeFileSync(path.join(repo, '.gitignore'), '*.log\n');
    const r = run(['--dir', path.join(repo, 'tests', 'fixtures')]);
    assert.equal(r.status, 1, `expected 1 got ${r.status}: ${r.stdout}`);
    assert.match(r.stderr, /VIOLATION.*creds\.log/);
    assert.match(r.stderr, /LRN-076/);
  });

  it('3. missing --dir exits 2', () => {
    const r = run([]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /--dir is required/);
  });

  it('4. nonexistent dir exits 2', () => {
    const r = run(['--dir', '/no/such/path/here/xyz']);
    assert.equal(r.status, 2);
  });

  it('5. real harness tests/fixtures dir is clean (regression guard)', () => {
    const r = run(['--dir', path.join(REPO_ROOT, 'tests', 'fixtures')]);
    assert.equal(r.status, 0, `expected clean; got ${r.status}; stderr: ${r.stderr}`);
  });
});
