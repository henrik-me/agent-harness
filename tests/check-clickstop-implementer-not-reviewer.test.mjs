import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'check-clickstop-implementer-not-reviewer.mjs');
const FIXTURES = path.join(REPO_ROOT, 'tests', 'fixtures', 'cs41');

function run(cwd, extraArgs = []) {
  const result = spawnSync(
    process.execPath,
    [SCRIPT, '--cwd', cwd, ...extraArgs],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

let scratch;

before(() => {
  scratch = mkdtempSync(path.join(os.tmpdir(), 'cs41-impl-reviewer-'));
});

after(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function writeTempClickstop(relativeFile, content) {
  const file = path.join(scratch, 'project', 'clickstops', relativeFile);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content, 'utf8');
  return scratch;
}

describe('scripts/check-clickstop-implementer-not-reviewer.mjs', () => {
  it('clean separation exits 0 with no errors', () => {
    const r = run(path.join(FIXTURES, 'clean'));
    assert.equal(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.match(r.stdout, /0 errors/);
    assert.doesNotMatch(r.stdout, /WARN:/);
  });

  it('identity overlap exits 1', () => {
    const r = run(path.join(FIXTURES, 'overlap'));
    assert.equal(r.status, 1, `stdout:\n${r.stdout}`);
    assert.match(r.stdout, /agent-identity violation/);
  });

  it('missing columns default strict=false exits 0 with warning', () => {
    const r = run(path.join(FIXTURES, 'missing'));
    assert.equal(r.status, 0, `stdout:\n${r.stdout}`);
    assert.match(r.stdout, /WARN:/);
    assert.match(r.stdout, /missing required agent row/);
  });

  it('missing columns with --strict-agent-columns exits 1', () => {
    const r = run(path.join(FIXTURES, 'missing'), ['--strict-agent-columns']);
    assert.equal(r.status, 1, `stdout:\n${r.stdout}`);
    assert.match(r.stdout, /ERROR:/);
    assert.match(r.stdout, /missing required agent row/);
  });

  it('multi-row Model audit table extracts agent cells by Field name', () => {
    const r = run(path.join(FIXTURES, 'multirow'));
    assert.equal(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.match(r.stdout, /0 errors/);
    assert.doesNotMatch(r.stdout, /WARN:/);
  });

  it('case-insensitive comparison catches same GitHub username', () => {
    const r = run(path.join(FIXTURES, 'casefold'));
    assert.equal(r.status, 1, `stdout:\n${r.stdout}`);
    assert.match(r.stdout, /case-insensitive/);
  });

  it('R4 fix: empty agent cells warn-as-missing, NOT overlap (default strict=false)', () => {
    const audit = [
      '# Test',
      '',
      '## Model audit',
      '',
      '| Field | Value |',
      '|---|---|',
      '| Implementer agent |   |',
      '| Reviewer agent | |',
      '',
    ].join('\n');
    const cwd = writeTempClickstop('active/active_cs41_empty_agents.md', audit);
    const r = run(cwd);
    assert.equal(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.doesNotMatch(r.stdout, /agent-identity violation/);
    assert.match(r.stdout, /WARN:/);
    assert.match(r.stdout, /missing required agent row/);
  });

  it('R4 fix: empty agent cells with --strict-agent-columns → exit 1 as missing', () => {
    const audit = [
      '# Test',
      '',
      '## Model audit',
      '',
      '| Field | Value |',
      '|---|---|',
      '| Implementer agent | |',
      '| Reviewer agent | |',
      '',
    ].join('\n');
    const cwd = writeTempClickstop('active/active_cs41_empty_agents_strict.md', audit);
    const r = run(cwd, ['--strict-agent-columns']);
    assert.equal(r.status, 1, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.doesNotMatch(r.stdout, /agent-identity violation/);
    assert.match(r.stdout, /ERROR:/);
    assert.match(r.stdout, /missing required agent row/);
  });

  it('temporary clickstop missing Model audit warns by default', () => {
    const cwd = writeTempClickstop('active/active_cs41_no_audit.md', '# No audit here\n');
    const r = run(cwd);
    assert.equal(r.status, 0, `stdout:\n${r.stdout}`);
    assert.match(r.stdout, /WARN:/);
    assert.match(r.stdout, /Implementer agent, Reviewer agent/);
  });
});
