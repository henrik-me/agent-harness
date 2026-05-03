/**
 * tests/render-deploy-summary.test.mjs — Tests for scripts/render-deploy-summary.mjs
 *
 * Uses node:test (consistent with existing test files).
 * Spawns the renderer via spawnSync.
 * Fixture files live in tests/fixtures/cs07/render-deploy-summary/.
 *
 * Run: node --test tests/render-deploy-summary.test.mjs
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'render-deploy-summary.mjs');
const FIXTURES = path.join(__dirname, 'fixtures', 'cs07', 'render-deploy-summary');
const NODE = process.execPath;

// Temp files created during tests — cleaned up in after()
const tempFiles = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run the renderer with given extra args. Returns { stdout, stderr, status }.
 *
 * @param {string[]} [args]
 * @returns {{ stdout: string, stderr: string, status: number }}
 */
function run(args = []) {
  const result = spawnSync(NODE, [SCRIPT, ...args], {
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
 * Return the absolute path to a fixture file.
 *
 * @param {string} name
 * @returns {string}
 */
function fixture(name) {
  return path.join(FIXTURES, name);
}

/**
 * Return a unique temp output path for use with --out.
 *
 * @param {string} suffix
 * @returns {string}
 */
function tempOut(suffix) {
  const p = path.join(REPO_ROOT, `render-deploy-summary-test-${suffix}-${Date.now()}.md`);
  tempFiles.push(p);
  return p;
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

after(() => {
  for (const p of tempFiles) {
    try { fs.unlinkSync(p); } catch { /* already gone */ }
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('render-deploy-summary', () => {

  // 1. Valid input renders all 5 sections → exit 0
  it('1. valid input → exit 0 with all 5 sections in markdown', () => {
    const r = run(['--in', fixture('valid-input.json'), '--quiet']);
    assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstdout:${r.stdout}\nstderr:${r.stderr}`);
    const md = r.stdout;
    assert.ok(md.includes('# Deployment Summary'), 'missing # Deployment Summary');
    assert.ok(md.includes('## Status'),            'missing ## Status');
    assert.ok(md.includes('## Components'),        'missing ## Components');
    assert.ok(md.includes('## Commit'),            'missing ## Commit');
    assert.ok(md.includes('## Timing'),            'missing ## Timing');
    assert.ok(md.length > 0, 'expected non-empty markdown');
  });

  // 2. Missing required field → exit 1
  it('2. missing required field "name" → exit 1', () => {
    const r = run(['--in', fixture('missing-name.json')]);
    assert.equal(r.status, 1, `Expected exit 1; got ${r.status}\nstdout:${r.stdout}\nstderr:${r.stderr}`);
    assert.ok(r.stderr.includes('"name"'), `Expected error mentioning "name"; got: ${r.stderr}`);
  });

  // 3. --out writes to file → exit 0, file exists with content
  it('3. --out writes markdown to a file', () => {
    const outPath = tempOut('out');
    const r = run(['--in', fixture('valid-input.json'), '--out', outPath]);
    assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstderr:${r.stderr}`);
    assert.ok(fs.existsSync(outPath), `Expected output file to exist at ${outPath}`);
    const content = fs.readFileSync(outPath, 'utf8');
    assert.ok(content.includes('# Deployment Summary'), 'file should contain # Deployment Summary');
    assert.ok(content.length > 0, 'expected non-empty output file');
  });

  // 4. Config with forbidden URL pattern → URL becomes <REDACTED>
  it('4. corp URL in input is redacted when config has matching pattern', () => {
    const r = run([
      '--in', fixture('with-url.json'),
      '--config', fixture('redact-config.json'),
      '--quiet',
    ]);
    assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstdout:${r.stdout}\nstderr:${r.stderr}`);
    const md = r.stdout;
    assert.ok(md.includes('<REDACTED>'), `Expected <REDACTED> in output; got:\n${md}`);
    assert.ok(!md.includes('.corp.'), `Expected .corp. to be redacted; found it in:\n${md}`);
  });

  // 5. No config + --redact-required → exit 1
  it('5. no config + --redact-required → exit 1', () => {
    // Use a cwd where no harness.config.json exists (fixtures dir has none)
    const result = spawnSync(NODE, [SCRIPT, '--in', fixture('valid-input.json'), '--redact-required'], {
      cwd: FIXTURES,
      encoding: 'utf8',
    });
    const status = result.status ?? -1;
    assert.equal(status, 1, `Expected exit 1; got ${status}\nstdout:${result.stdout}\nstderr:${result.stderr}`);
  });

  // 6. Missing --in → exit 2
  it('6. missing --in → exit 2', () => {
    const r = run([]);
    assert.equal(r.status, 2, `Expected exit 2; got ${r.status}\nstderr:${r.stderr}`);
  });

  // 7. --in --out (flag-as-value) → exit 2 (LRN-040)
  it('7. --in --out (flag-as-value guard) → exit 2', () => {
    const r = run(['--in', '--out']);
    assert.equal(r.status, 2, `Expected exit 2; got ${r.status}\nstderr:${r.stderr}`);
  });

  // 8a. succeeded → ✅
  it('8a. status "succeeded" → ✅ icon in output', () => {
    const r = run(['--in', fixture('valid-input.json'), '--quiet']);
    assert.equal(r.status, 0, `Expected exit 0; got ${r.status}`);
    assert.ok(r.stdout.includes('✅'), `Expected ✅ for succeeded; got:\n${r.stdout}`);
  });

  // 8b. failed → ❌
  it('8b. status "failed" → ❌ icon in output', () => {
    const r = run(['--in', fixture('valid-failed.json'), '--quiet']);
    assert.equal(r.status, 0, `Expected exit 0; got ${r.status}`);
    assert.ok(r.stdout.includes('❌'), `Expected ❌ for failed; got:\n${r.stdout}`);
  });

  // 8c. in-progress → ⏳
  it('8c. status "in-progress" → ⏳ icon in output', () => {
    const r = run(['--in', fixture('valid-inprogress.json'), '--quiet']);
    assert.equal(r.status, 0, `Expected exit 0; got ${r.status}`);
    assert.ok(r.stdout.includes('⏳'), `Expected ⏳ for in-progress; got:\n${r.stdout}`);
  });

  // 9. Progress message emitted (bytes count)
  it('9. progress message "deploy summary: rendered N bytes" emitted to stderr', () => {
    const r = run(['--in', fixture('valid-input.json')]);
    assert.equal(r.status, 0, `Expected exit 0; got ${r.status}`);
    assert.ok(
      r.stderr.includes('deploy summary: rendered') && r.stderr.includes('bytes'),
      `Expected progress line in stderr; got: ${r.stderr}`
    );
  });

});
