/**
 * tests/cs43-impl-not-reviewer-recursion.test.mjs — CS43 deliverable D43-3.
 *
 * Verifies the CS43 changes to scripts/check-clickstop-implementer-not-reviewer.mjs:
 * the walker now recurses one level into `^(planned|active|done)_cs\d+[a-z]*_.*$` CS
 * subfolders under project/clickstops/{planned,active,done}/, gated by the
 * IMPLEMENTER_NOT_REVIEWER_RECURSION_ENFORCEMENT_DATE constant per CS43
 * C43-1/C43-2/C43-3/C43-4. Each fixture under tests/fixtures/cs43/<x>/
 * exercises one branch of the policy.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'check-clickstop-implementer-not-reviewer.mjs');
const FIXTURES = path.join(REPO_ROOT, 'tests', 'fixtures', 'cs43');

function run(fixtureSubdir, extraArgs = []) {
  const cwd = path.join(FIXTURES, fixtureSubdir);
  const result = spawnSync(
    process.execPath,
    [SCRIPT, '--cwd', cwd, ...extraArgs],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

describe('CS43 — check-clickstop-implementer-not-reviewer recursion + date-gate', () => {
  it('(a) pre-enforcement nested done CS is silently grandfathered', () => {
    const r = run('a-pre-enforcement');
    assert.equal(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.match(r.stdout, /0 errors, 0 warnings/);
    assert.doesNotMatch(r.stdout, /WARN:/);
    assert.doesNotMatch(r.stdout, /ERROR:/);
    assert.match(r.stdout, /scanned 1 files/);
  });

  it('(b) post-enforcement nested done CS missing agent cols WARNs by default', () => {
    const r = run('b-post-enforcement-missing-cols');
    assert.equal(r.status, 0, `stdout:\n${r.stdout}`);
    assert.match(r.stdout, /WARN:/);
    assert.match(r.stdout, /missing required agent row/);
    assert.match(r.stdout, /done_cs100_post-enforcement\/done_cs100_thing\.md/);
  });

  it('(b) post-enforcement nested done CS with --strict-agent-columns ERRORs', () => {
    const r = run('b-post-enforcement-missing-cols', ['--strict-agent-columns']);
    assert.equal(r.status, 1, `stdout:\n${r.stdout}`);
    assert.match(r.stdout, /ERROR:/);
    assert.match(r.stdout, /missing required agent row/);
    assert.match(r.stdout, /done_cs100_post-enforcement\/done_cs100_thing\.md/);
  });

  it('(c) active nested CS is always linted regardless of date', () => {
    const r = run('c-active-nested');
    assert.equal(r.status, 0, `stdout:\n${r.stdout}`);
    assert.match(r.stdout, /WARN:/);
    assert.match(r.stdout, /missing required agent row/);
    const strict = run('c-active-nested', ['--strict-agent-columns']);
    assert.equal(strict.status, 1, `strict stdout:\n${strict.stdout}`);
    assert.match(strict.stdout, /ERROR:/);
  });

  it('(d) done CS with unparseable Closed date emits WARN and skips', () => {
    const r = run('d-done-unparseable-close-date');
    assert.equal(r.status, 0, `stdout:\n${r.stdout}`);
    assert.match(r.stdout, /WARN:/);
    assert.match(r.stdout, /unparseable \*\*Closed:\*\* date/);
    assert.match(r.stdout, /'TBD'/);
    assert.doesNotMatch(r.stdout, /missing required agent row/);
    const strict = run('d-done-unparseable-close-date', ['--strict-agent-columns']);
    assert.equal(strict.status, 0, `strict-mode for unparseable date should not error: ${strict.stdout}`);
    assert.doesNotMatch(strict.stdout, /ERROR:/);
  });

  it('(e) flat-iteration path is preserved alongside the new recursion', () => {
    const r = run('e-flat-iteration-preserved');
    assert.equal(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.match(r.stdout, /0 errors, 0 warnings/);
    assert.match(r.stdout, /scanned 1 files/);
  });

  it('(f) planned nested CS is always linted regardless of date', () => {
    const r = run('f-planned-nested');
    assert.equal(r.status, 0, `stdout:\n${r.stdout}`);
    assert.match(r.stdout, /WARN:/);
    assert.match(r.stdout, /missing required agent row/);
    const strict = run('f-planned-nested', ['--strict-agent-columns']);
    assert.equal(strict.status, 1, `strict stdout:\n${strict.stdout}`);
    assert.match(strict.stdout, /ERROR:/);
  });
});
