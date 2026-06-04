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

  // ---------------------------------------------------------------------------
  // CS57 — model-ID normalization, GPT-5.5 overlap exception, configurable
  // high-risk set (fail-closed), and date-gated missing-audit enforcement.
  // ---------------------------------------------------------------------------

  function writeTempRepo(prefix, files) {
    const cwd = mkdtempSync(path.join(scratch, prefix));
    for (const [rel, content] of Object.entries(files)) {
      const f = path.join(cwd, rel);
      mkdirSync(path.dirname(f), { recursive: true });
      writeFileSync(f, content, 'utf8');
    }
    return cwd;
  }

  function auditBlock({ impl, rev, implAgent = 'yoga-ah', revAgent = 'copilot', closed }) {
    const lines = ['# Test CS', ''];
    if (closed !== undefined) lines.push(`**Closed:** ${closed}`, '');
    lines.push(
      '## Model audit',
      '',
      '| Field | Value |',
      '|---|---|',
      `| Implementer models | ${impl} |`,
      `| Reviewer model | ${rev} |`,
      `| Implementer agent | ${implAgent} |`,
      `| Reviewer agent | ${revAgent} |`,
      '',
    );
    return lines.join('\n');
  }

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

  it('high-risk set can be configured from harness.config.json reviews.high_risk_clickstops', () => {
    const cwd = writeTempRepo('config-high-risk-', {
      'harness.config.json': JSON.stringify({ reviews: { high_risk_clickstops: ['CS41'] } }),
      'project/clickstops/active/active_cs41_configured-high-risk.md':
        auditBlock({ impl: 'gpt-5.5', rev: 'gpt-5.5' }),
    });
    const r = run(cwd);
    assert.equal(r.status, 1, `stdout:\n${r.stdout}`);
    assert.match(r.stdout, /model-independence violation/);
  });

  it('C57-3: an explicit empty high_risk_clickstops array is honored as empty (GPT-5.5 overlap allowed on a would-be-high-risk CS)', () => {
    const cwd = writeTempRepo('config-empty-high-risk-', {
      'harness.config.json': JSON.stringify({ reviews: { high_risk_clickstops: [] } }),
      // CS03 is high-risk under the default; with [] it must NOT be treated as high-risk.
      'project/clickstops/active/active_cs03_empty-high-risk.md':
        auditBlock({ impl: 'claude-opus-4.7, gpt-5.5', rev: 'gpt-5.5' }),
    });
    const r = run(cwd);
    assert.equal(r.status, 0, `stdout:\n${r.stdout}`);
    assert.doesNotMatch(r.stdout, /model-independence violation/);
  });

  it('C57-6: unparseable harness.config.json fails closed (exit 1, names the file)', () => {
    const cwd = writeTempRepo('config-bad-json-', {
      'harness.config.json': '{ this is not json',
      'project/clickstops/active/active_cs41_ok.md':
        auditBlock({ impl: 'claude-opus-4.8', rev: 'gpt-5.5' }),
    });
    const r = run(cwd);
    assert.equal(r.status, 1, `stdout:\n${r.stdout}`);
    assert.match(r.stdout, /ERROR:/);
    assert.match(r.stdout, /harness\.config\.json/);
  });

  it('C57-6: present-but-non-array high_risk_clickstops fails closed (exit 1)', () => {
    const cwd = writeTempRepo('config-wrong-type-', {
      'harness.config.json': JSON.stringify({ reviews: { high_risk_clickstops: 'CS03' } }),
      'project/clickstops/active/active_cs41_ok.md':
        auditBlock({ impl: 'claude-opus-4.8', rev: 'gpt-5.5' }),
    });
    const r = run(cwd);
    assert.equal(r.status, 1, `stdout:\n${r.stdout}`);
    assert.match(r.stdout, /ERROR:/);
    assert.match(r.stdout, /reviews\.high_risk_clickstops/);
  });

  it('C57-6: high_risk_clickstops array with a non-string element fails closed (exit 1)', () => {
    const cwd = writeTempRepo('config-non-string-elem-', {
      'harness.config.json': JSON.stringify({ reviews: { high_risk_clickstops: ['CS03', 42] } }),
      'project/clickstops/active/active_cs41_ok.md':
        auditBlock({ impl: 'claude-opus-4.8', rev: 'gpt-5.5' }),
    });
    const r = run(cwd);
    assert.equal(r.status, 1, `stdout:\n${r.stdout}`);
    assert.match(r.stdout, /ERROR:/);
    assert.match(r.stdout, /reviews\.high_risk_clickstops/);
  });

  it('C57-4: done clickstop missing Model audit closed ON/AFTER the enforcement date exits 1', () => {
    const cwd = writeTempRepo('done-post-cutoff-', {
      'project/clickstops/done/done_cs99_post-cutoff.md':
        '# Post cutoff\n\n**Closed:** 2026-12-01\n',
    });
    const r = run(cwd);
    assert.equal(r.status, 1, `stdout:\n${r.stdout}`);
    assert.match(r.stdout, /missing required model row/);
  });

  it('C57-4: done clickstop missing Model audit closed BEFORE the enforcement date is warn-only (grandfathered)', () => {
    const cwd = writeTempRepo('done-pre-cutoff-', {
      // After the recursion gate (2026-05-14) so it is linted, but before the
      // model-audit enforcement date (2026-06-04) so the missing audit is warn-only.
      'project/clickstops/done/done_cs99_pre-cutoff.md':
        '# Pre cutoff\n\n**Closed:** 2026-05-20\n',
    });
    const r = run(cwd);
    assert.equal(r.status, 0, `stdout:\n${r.stdout}`);
    assert.match(r.stdout, /WARN:/);
    assert.match(r.stdout, /missing required model row/);
  });

  it('C57-4: planned clickstop missing Model audit remains warn-only regardless of date', () => {
    const cwd = writeTempRepo('planned-only-', {
      'project/clickstops/planned/planned_cs99_no_audit.md': '# Planned only\n',
    });
    const r = run(cwd);
    assert.equal(r.status, 0, `stdout:\n${r.stdout}`);
    assert.match(r.stdout, /WARN:/);
    assert.match(r.stdout, /missing required model row/);
  });

  it('C57-4: malformed active Model audit table (wrong header columns) exits 1', () => {
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
    assert.match(r.stdout, /missing required model row/);
  });

  it('C57-5: nested active clickstop missing Model audit exits 1 with the nested path in the message', () => {
    const cwd = writeTempRepo('nested-active-', {
      'project/clickstops/active/active_cs48_nested-audit/active_cs48_nested-audit.md':
        '# Nested active without audit\n',
    });
    const r = run(cwd);
    assert.equal(r.status, 1, `stdout:\n${r.stdout}`);
    assert.match(r.stdout, /active\/active_cs48_nested-audit\/active_cs48_nested-audit\.md/);
    assert.match(r.stdout, /missing required model row/);
  });

  it('regression guard: linter exits 0 against the real repo project/clickstops/ (historical files grandfathered)', () => {
    const r = run(REPO_ROOT);
    assert.equal(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    // Guard against a silent pass-for-the-wrong-reason (e.g. zero files scanned):
    const scanned = r.stdout.match(/scanned (\d+) files/);
    assert.ok(scanned && Number(scanned[1]) > 50, `expected >50 files scanned, got: ${scanned && scanned[1]}`);
    // At least one historical done/ file must be grandfathered (warn-only) for the
    // missing ## Model audit — proves the date gate is active, not vacuous.
    assert.match(r.stdout, /WARN:\s+done\/.*missing required model row/);
  });
});
