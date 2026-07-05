/**
 * tests/cs89-check-composed-blocks.test.mjs — CS89.
 *
 * Proves the hand-synced duplicate parser in scripts/check-composed-blocks.mjs
 * recognizes the comment-safe `#`-marker form: it accepts a valid `#`-marker
 * composed file with --allowed-ids codeowners.project (exit 0) and still fails
 * closed on duplicate, orphan, and missing-required-block cases (exit 1).
 *
 * Uses committed static fixtures (tests/fixtures/cs89-check-composed/) to avoid
 * repo-root scratch writes racing the text-encoding linter's recursive walk.
 *
 * Run: node --test tests/cs89-check-composed-blocks.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const LINTER = path.join(REPO_ROOT, 'scripts', 'check-composed-blocks.mjs');
const FIXTURES = path.join(__dirname, 'fixtures', 'cs89-check-composed');
const NODE = process.execPath;

function runLinter(args) {
  const r = spawnSync(NODE, [LINTER, ...args], { cwd: REPO_ROOT, encoding: 'utf8' });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status ?? -1 };
}

function fixture(name) {
  return path.join(FIXTURES, name);
}

describe('CS89 check-composed-blocks — #-marker support', () => {
  it('accepts a valid #-marker composed file with --allowed-ids codeowners.project (exit 0)', () => {
    const r = runLinter(['--file', fixture('valid-codeowners'), '--allowed-ids', 'codeowners.project']);
    assert.equal(r.status, 0, `Expected exit 0.\nstdout:${r.stdout}\nstderr:${r.stderr}`);
    assert.match(r.stdout, /0 errors/);
  });

  it('rejects a duplicate #-marker block (exit 1)', () => {
    const r = runLinter(['--file', fixture('duplicate-block'), '--allowed-ids', 'codeowners.project']);
    assert.equal(r.status, 1, `Expected exit 1.\nstdout:${r.stdout}`);
    assert.match(r.stdout, /duplicate/);
  });

  it('rejects an orphan #-marker end (exit 1)', () => {
    const r = runLinter(['--file', fixture('orphan-end'), '--allowed-ids', 'codeowners.project']);
    assert.equal(r.status, 1, `Expected exit 1.\nstdout:${r.stdout}`);
    assert.match(r.stdout, /orphan end marker/);
  });

  it('rejects a file missing the required codeowners.project #-block (exit 1)', () => {
    const r = runLinter(['--file', fixture('missing-block'), '--allowed-ids', 'codeowners.project']);
    assert.equal(r.status, 1, `Expected exit 1.\nstdout:${r.stdout}`);
    assert.match(r.stdout, /required block id="codeowners\.project" is missing/);
  });
});
