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

  it('applies schema defaults when optional review policy fields are absent', () => {
    // Schema marks neither field required and supplies defaults, so a config
    // that omits them must inherit the defaults rather than be rejected.
    const overlapBody = writeBody('body.md', {
      implementers: 'gpt-5.6-sol',
      reviewer: 'gpt-5.6-sol',
    });

    const onlyModel = writeJson('only-model.json', {
      reviews: { rubber_duck_model: 'gpt-5.6-sol' },
    });
    // CS60 is not in the default high-risk list, so overlap is tolerated.
    const tolerated = run(['--pr-body', overlapBody, '--config', onlyModel, '--cs-id', 'CS60']);
    assert.equal(tolerated.status, 0, tolerated.stdout + tolerated.stderr);

    // A default high-risk clickstop (CS03) still forbids overlap.
    const highRisk = run(['--pr-body', overlapBody, '--config', onlyModel, '--cs-id', 'CS03']);
    assert.equal(highRisk.status, 1, highRisk.stdout + highRisk.stderr);
    assert.match(highRisk.stdout, /high-risk CS03/);

    const emptyReviews = writeJson('empty-reviews.json', { reviews: {} });
    const emptyResult = run(['--pr-body', overlapBody, '--config', emptyReviews, '--cs-id', 'CS03']);
    assert.equal(emptyResult.status, 1, emptyResult.stdout + emptyResult.stderr);
    assert.match(emptyResult.stdout, /high-risk CS03/);

    // Config file with no top-level `reviews` key also inherits schema defaults.
    const noReviews = writeJson('no-reviews.json', { version: 1, project: { name: 'x' } });
    const noReviewsHighRisk = run(['--pr-body', overlapBody, '--config', noReviews, '--cs-id', 'CS03']);
    assert.equal(noReviewsHighRisk.status, 1, noReviewsHighRisk.stdout + noReviewsHighRisk.stderr);
    assert.match(noReviewsHighRisk.stdout, /high-risk CS03/);

    const noReviewsTolerated = run(['--pr-body', overlapBody, '--config', noReviews, '--cs-id', 'CS60']);
    assert.equal(noReviewsTolerated.status, 0, noReviewsTolerated.stdout + noReviewsTolerated.stderr);
  });

  it('fails closed when a present review policy field is malformed', () => {
    const body = writeBody('body.md');
    const malformed = writeJson('malformed-high-risk.json', {
      reviews: {
        rubber_duck_model: 'gpt-5.5',
        high_risk_clickstops: 'CS03',
      },
    });
    const malformedResult = run(['--pr-body', body, '--config', malformed]);
    assert.equal(malformedResult.status, 1, malformedResult.stdout + malformedResult.stderr);
    assert.match(malformedResult.stderr, /reviews\.high_risk_clickstops must be an array/);

    const emptyModel = writeJson('empty-model.json', {
      reviews: { rubber_duck_model: '   ' },
    });
    const emptyModelResult = run(['--pr-body', body, '--config', emptyModel]);
    assert.equal(emptyModelResult.status, 1, emptyModelResult.stdout + emptyModelResult.stderr);
    assert.match(emptyModelResult.stderr, /reviews\.rubber_duck_model must be a non-empty string/);
  });

  it('fails closed when an explicit --config path does not exist', () => {
    const body = writeBody('body.md');
    const missingPath = path.join(scratch, 'does-not-exist.json');
    const result = run(['--pr-body', body, '--config', missingPath]);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /config file not found/);
  });
});
