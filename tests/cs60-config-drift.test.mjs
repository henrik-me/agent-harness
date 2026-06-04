import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const CHECK = path.join(REPO_ROOT, 'scripts', 'checks', 'check-independence-invariant.mjs');

let scratch;

beforeEach(() => {
  scratch = mkdtempSync(path.join(os.tmpdir(), 'cs60-config-drift-'));
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function writeJson(name, value) {
  const file = path.join(scratch, name);
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return file;
}

function writeBody(name, { implementers = 'claude-opus-4.7', reviewer = 'claude-opus-4.7' } = {}) {
  const file = path.join(scratch, name);
  writeFileSync(
    file,
    [
      '## Summary',
      'CS60 config drift fixture.',
      '',
      '## Model audit',
      '',
      '| Field | Value |',
      '|---|---|',
      `| Implementer models | ${implementers} |`,
      `| Reviewer model | ${reviewer} |`,
      '| Implementer agent | ws-config-audit |',
      '| Reviewer agent | rubber-duck |',
      '',
    ].join('\n'),
    'utf8',
  );
  return file;
}

function run(args) {
  const result = spawnSync(process.execPath, [CHECK, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

describe('CS60 config drift guard for independence invariant', () => {
  it('uses configured primary reviewer model and high-risk clickstops instead of stale literals', () => {
    const config = writeJson('harness.config.json', {
      reviews: {
        rubber_duck_model: 'claude-opus-4.7',
        enforce_gates: true,
        high_risk_clickstops: ['CS77'],
      },
    });
    const body = writeBody('body.md');

    const normal = run(['--pr-body', body, '--config', config, '--cs-id', 'CS76']);
    assert.equal(normal.status, 0, normal.stdout + normal.stderr);

    const highRisk = run(['--pr-body', body, '--config', config, '--cs-id', 'CS77']);
    assert.equal(highRisk.status, 1, highRisk.stdout + highRisk.stderr);
    assert.match(highRisk.stdout, /high-risk CS77/);
    assert.match(highRisk.stdout, /claude-opus-4\.7/);
  });

  it('fails closed when configured review policy fields are missing or malformed', () => {
    const body = writeBody('body.md');
    const missing = writeJson('missing-high-risk.json', {
      reviews: {
        rubber_duck_model: 'gpt-5.5',
      },
    });
    const missingResult = run(['--pr-body', body, '--config', missing]);
    assert.equal(missingResult.status, 1, missingResult.stdout + missingResult.stderr);
    assert.match(missingResult.stderr, /missing reviews\.high_risk_clickstops/);

    const malformed = writeJson('malformed-high-risk.json', {
      reviews: {
        rubber_duck_model: 'gpt-5.5',
        high_risk_clickstops: 'CS03',
      },
    });
    const malformedResult = run(['--pr-body', body, '--config', malformed]);
    assert.equal(malformedResult.status, 1, malformedResult.stdout + malformedResult.stderr);
    assert.match(malformedResult.stderr, /reviews\.high_risk_clickstops must be an array/);
  });
});
