/**
 * tests/check-cs-plan.test.mjs — Tests for scripts/check-cs-plan.mjs (CS34/LRN-105).
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
const LINTER = path.join(REPO_ROOT, 'scripts', 'check-cs-plan.mjs');
const NODE = process.execPath;

const CONSUMER_FIXTURE = path.join(REPO_ROOT, 'tests', 'fixtures', 'cs-plan-lint', 'consumer');
const SELF_HOST_FIXTURE = path.join(REPO_ROOT, 'tests', 'fixtures', 'cs-plan-lint', 'self-host');

function run(args = []) {
  const r = spawnSync(NODE, [LINTER, ...args], { encoding: 'utf8' });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status ?? -1 };
}

describe('check-cs-plan linter', () => {
  it('1. consumer with template/composed/ violation exits 1 and reports violation', () => {
    const dir = path.join(CONSUMER_FIXTURE, 'project', 'clickstops');
    const r = run(['--dir', dir, '--cwd', CONSUMER_FIXTURE]);
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}; stderr: ${r.stderr}`);
    assert.match(r.stderr, /template\/composed\//, 'stderr should mention template/composed/');
    assert.match(r.stderr, /VIOLATION:/, 'stderr should contain VIOLATION:');
  });

  it('2. consumer with lib/ violation exits 1 and reports lib/ prefix', () => {
    const dir = path.join(CONSUMER_FIXTURE, 'project', 'clickstops');
    const r = run(['--dir', dir, '--cwd', CONSUMER_FIXTURE]);
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}; stderr: ${r.stderr}`);
    assert.match(r.stderr, /planned_cs02/, 'stderr should mention the planned_cs02 fixture file');
    assert.match(r.stderr, /lib\//, 'stderr should mention the lib/ prefix');
  });

  it('3. fenced-code mention is exempt (done_cs03 must not appear as violation)', () => {
    const dir = path.join(CONSUMER_FIXTURE, 'project', 'clickstops');
    const r = run(['--dir', dir, '--cwd', CONSUMER_FIXTURE]);
    // Other fixtures (cs01, cs02) still produce violations, so exit must be 1
    // and the summary must report >0 violations — but the cs03 fenced-block
    // mention itself must NOT appear in any violation line.
    assert.equal(r.status, 1, `expected exit 1 (other fixtures violate), got ${r.status}; stderr: ${r.stderr}`);
    assert.match(r.stderr, /check-cs-plan: 4 files checked, \d+ violation\(s\)\./, 'stderr must include the summary line');
    const violationLines = r.stderr.split('\n').filter((l) => l.startsWith('VIOLATION:'));
    const cs03Lines = violationLines.filter((l) => l.includes('done_cs03'));
    assert.equal(cs03Lines.length, 0, `done_cs03 should not produce violations; got: ${cs03Lines.join('\n')}`);
  });

  it('4. harness-link mention is exempt (done_cs04 must not appear as violation)', () => {
    const dir = path.join(CONSUMER_FIXTURE, 'project', 'clickstops');
    const r = run(['--dir', dir, '--cwd', CONSUMER_FIXTURE]);
    assert.equal(r.status, 1, `expected exit 1 (other fixtures violate), got ${r.status}; stderr: ${r.stderr}`);
    const violationLines = r.stderr.split('\n').filter((l) => l.startsWith('VIOLATION:'));
    const cs04Lines = violationLines.filter((l) => l.includes('done_cs04'));
    assert.equal(cs04Lines.length, 0, `done_cs04 should not produce violations; got: ${cs04Lines.join('\n')}`);
  });

  it('5. self-host skip: exits 0 and stdout contains "skipped (self-host)"', () => {
    const dir = path.join(SELF_HOST_FIXTURE, 'project', 'clickstops');
    const r = run(['--dir', dir, '--cwd', SELF_HOST_FIXTURE]);
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}; stderr: ${r.stderr}`);
    assert.match(r.stdout, /skipped \(self-host\)/);
  });

  it('6. --quiet suppresses success stdout on clean fixture', () => {
    // Use a temp dir with zero .md files = 0 violations.
    const tmp = mkdtempSync(path.join(tmpdir(), 'cs-plan-clean-'));
    mkdirSync(path.join(tmp, 'active'), { recursive: true });
    const r = run(['--dir', tmp, '--quiet']);
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}; stderr: ${r.stderr}`);
    assert.equal(r.stdout.trim(), '', `expected empty stdout under --quiet, got: "${r.stdout}"`);
  });

  it('7. --config overrides forbidden_path_prefixes (lib/ and template/composed/ not flagged when omitted)', () => {
    // Write a temp config that only forbids template/seeded/ (omits lib/ and template/composed/).
    const tmp = mkdtempSync(path.join(tmpdir(), 'cs-plan-cfg-'));
    const cfgPath = path.join(tmp, 'harness.config.json');
    writeFileSync(cfgPath, JSON.stringify({
      version: '0.0.0',
      project: { name: 'test', agent_suffix: 'test' },
      cs_plan_lint: { forbidden_path_prefixes: ['template/seeded/'] },
    }));
    const dir = path.join(CONSUMER_FIXTURE, 'project', 'clickstops');
    const r = run(['--dir', dir, '--config', cfgPath, '--cwd', CONSUMER_FIXTURE]);
    // No fixture mentions template/seeded/, so the override produces 0 violations.
    assert.equal(r.status, 0, `expected exit 0 with override (no fixture mentions template/seeded/), got ${r.status}; stderr: ${r.stderr}`);
    assert.match(r.stdout, /check-cs-plan: 4 files checked, 0 violations\./, 'stdout must include the success summary line');
    // lib/ and template/composed/ violations should NOT be reported (they're not in the prefix list).
    const violationLines = r.stderr.split('\n').filter((l) => l.startsWith('VIOLATION:'));
    const libLines = violationLines.filter((l) => l.includes('lib/'));
    const composedLines = violationLines.filter((l) => l.includes('template/composed/'));
    assert.equal(libLines.length, 0, `lib/ should not be flagged with custom config; got: ${libLines.join('\n')}`);
    assert.equal(composedLines.length, 0, `template/composed/ should not be flagged with custom config; got: ${composedLines.join('\n')}`);
  });

  it('8. aggregator integration: harness lint --only cs-plan registers and runs the linter row', () => {
    // Build a temp consumer-shaped cwd: package.json (NOT @henrik-me/agent-harness),
    // harness.config.json minimal, plus a CS plan file with a violation. Then run
    // `node bin/harness.mjs lint --only cs-plan --cwd <tmp>` and assert the cs-plan
    // row is present in the summary AND it reports failure.
    const tmp = mkdtempSync(path.join(tmpdir(), 'cs-plan-aggr-'));
    writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'consumer-fixture-cs34', version: '0.0.0' }));
    writeFileSync(path.join(tmp, 'harness.config.json'), JSON.stringify({
      version: '0.0.0',
      project: { name: 'test', agent_suffix: 'test' },
    }));
    const csDir = path.join(tmp, 'project', 'clickstops', 'active');
    mkdirSync(csDir, { recursive: true });
    writeFileSync(
      path.join(csDir, 'active_cs01_violation.md'),
      '# CS01\n\nEdit `template/composed/CONVENTIONS.md` to register your block.\n',
    );
    const HARNESS = path.join(REPO_ROOT, 'bin', 'harness.mjs');
    const r = spawnSync(NODE, [HARNESS, '--cwd', tmp, 'lint', '--only', 'cs-plan'], { encoding: 'utf8' });
    const stdout = r.stdout ?? '';
    const stderr = r.stderr ?? '';
    // Linter must have surfaced as a row in the summary AND must have failed.
    assert.match(stdout, /cs-plan/, `cs-plan row missing from summary; stdout:\n${stdout}\nstderr:\n${stderr}`);
    assert.notEqual(r.status, 0, `expected non-zero exit because the consumer CS plan violates; got ${r.status}; stdout:\n${stdout}`);
    assert.match(stderr, /template\/composed\//, `expected violation referencing template/composed/ on stderr; got:\n${stderr}`);
  });
});
