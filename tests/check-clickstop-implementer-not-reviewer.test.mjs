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

  it('model overlap exits 1', () => {
    const r = run(path.join(FIXTURES, 'model-overlap'));
    assert.equal(r.status, 1, `stdout:\n${r.stdout}`);
    assert.match(r.stdout, /model-independence violation/);
    assert.match(r.stdout, /claude-sonnet-4\.6/);
  });

  it('model overlap still exits 1 when agent rows are missing', () => {
    const r = run(path.join(FIXTURES, 'model-overlap-missing-agents'));
    assert.equal(r.status, 1, `stdout:\n${r.stdout}`);
    assert.match(r.stdout, /WARN:/);
    assert.match(r.stdout, /missing required agent row/);
    assert.match(r.stdout, /model-independence violation/);
  });

  it('model overlap normalizes documented family/version spelling variants', () => {
    const r = run(path.join(FIXTURES, 'model-overlap-variant'));
    assert.equal(r.status, 1, `stdout:\n${r.stdout}`);
    assert.match(r.stdout, /model-independence violation/);
    assert.match(r.stdout, /claude-opus-4\.7/);
  });

  it('GPT-5.5 model overlap is allowed for non-high-risk clickstops', () => {
    const r = run(path.join(FIXTURES, 'gpt-overlap-allowed'));
    assert.equal(r.status, 0, `stdout:\n${r.stdout}`);
    assert.doesNotMatch(r.stdout, /model-independence violation/);
  });

  it('GPT-5.5 model overlap exits 1 for high-risk clickstops', () => {
    const r = run(path.join(FIXTURES, 'gpt-overlap-high-risk'));
    assert.equal(r.status, 1, `stdout:\n${r.stdout}`);
    assert.match(r.stdout, /model-independence violation/);
    assert.match(r.stdout, /gpt-5\.5/);
  });

  it('GPT-5.5 high-risk clickstops can be configured from harness.config.json', () => {
    const cwd = mkdtempSync(path.join(scratch, 'config-high-risk-'));
    const activeDir = path.join(cwd, 'project', 'clickstops', 'active');
    mkdirSync(activeDir, { recursive: true });
    writeFileSync(
      path.join(cwd, 'harness.config.json'),
      JSON.stringify({ reviews: { high_risk_clickstops: ['CS41'] } }),
      'utf8',
    );
    writeFileSync(
      path.join(activeDir, 'active_cs41_configured-high-risk.md'),
      [
        '# Configured High Risk CS',
        '',
        '## Model audit',
        '',
        '| Field | Value |',
        '|---|---|',
        '| Implementer models | gpt-5.5 |',
        '| Reviewer model | gpt-5.5 |',
        '| Implementer agent | yoga-ah |',
        '| Reviewer agent | copilot |',
        '',
      ].join('\n'),
      'utf8',
    );
    try {
      const r = run(cwd);
      assert.equal(r.status, 1, `stdout:\n${r.stdout}`);
      assert.match(r.stdout, /model-independence violation/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('missing model columns exit 1 because independence cannot be verified', () => {
    const r = run(path.join(FIXTURES, 'missing-models'));
    assert.equal(r.status, 1, `stdout:\n${r.stdout}`);
    assert.match(r.stdout, /missing required model row/);
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
      '| Implementer models | claude-opus-4.7 |',
      '| Reviewer model | gpt-5.5 |',
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
      '| Implementer models | claude-opus-4.7 |',
      '| Reviewer model | gpt-5.5 |',
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

  it('active clickstop missing Model audit exits 1 because model independence cannot be verified', () => {
    const cwd = writeTempClickstop('active/active_cs41_no_audit.md', '# No audit here\n');
    const r = run(cwd);
    assert.equal(r.status, 1, `stdout:\n${r.stdout}`);
    assert.match(r.stdout, /WARN:/);
    assert.match(r.stdout, /Implementer agent, Reviewer agent/);
    assert.match(r.stdout, /missing required model row/);
  });

  it('nested active clickstop missing Model audit exits 1 under recursive linting', () => {
    const cwd = mkdtempSync(path.join(scratch, 'nested-active-'));
    const file = path.join(
      cwd,
      'project',
      'clickstops',
      'active',
      'active_cs48_nested-audit',
      'active_cs48_nested-audit.md',
    );
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, '# Nested active without audit\n', 'utf8');
    try {
      const r = run(cwd);
      assert.equal(r.status, 1, `stdout:\n${r.stdout}`);
      assert.match(r.stdout, /active\/active_cs48_nested-audit\/active_cs48_nested-audit\.md/);
      assert.match(r.stdout, /missing required model row/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('planned clickstop missing Model audit remains warn-only for backlog planning files', () => {
    const cwd = mkdtempSync(path.join(scratch, 'planned-only-'));
    const file = path.join(cwd, 'project', 'clickstops', 'planned', 'planned_cs99_no_audit.md');
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, '# Planned only\n', 'utf8');
    try {
      const r = run(cwd);
      assert.equal(r.status, 0, `stdout:\n${r.stdout}`);
      assert.match(r.stdout, /WARN:/);
      assert.match(r.stdout, /missing required model row/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('malformed active Model audit table exits 1 because model independence cannot be verified', () => {
    const audit = [
      '# Test',
      '',
      '## Model audit',
      '',
      '| Name | Detail |',
      '|---|---|',
      '| Implementer models | claude-opus-4.7 |',
      '| Reviewer model | gpt-5.5 |',
      '',
    ].join('\n');
    const cwd = writeTempClickstop('active/active_cs41_malformed_audit.md', audit);
    const r = run(cwd);
    assert.equal(r.status, 1, `stdout:\n${r.stdout}`);
    assert.match(r.stdout, /WARN:/);
    assert.match(r.stdout, /missing required model row/);
  });
});
