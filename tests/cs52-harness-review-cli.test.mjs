/**
 * tests/cs52-harness-review-cli.test.mjs — CLI coverage for harness review.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const HARNESS = path.join(ROOT, 'bin', 'harness.mjs');

function runHarness(args, options = {}) {
  return spawnSync(process.execPath, [HARNESS, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      NO_COLOR: '1',
    },
    ...options,
  });
}

describe('harness review CLI', () => {
  it('advertises the review subcommand in top-level help', () => {
    const result = runHarness(['--help']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /review\s+Orchestrate rubber-duck \+ Copilot review/);
  });

  it('prints dedicated review help with flags and exit-code contract', () => {
    const result = runHarness(['review', '--help']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Usage: harness review <pr>/);
    assert.match(result.stdout, /--rubber-duck-only/);
    assert.match(result.stdout, /--copilot-only/);
    assert.match(result.stdout, /--model <id>/);
    assert.match(result.stdout, /--round R<n>/);
    assert.match(result.stdout, /Exit codes:/);
    assert.match(result.stdout, /0\s+Go verdict/);
    assert.match(result.stdout, /1\s+No-Go/);
    assert.match(result.stdout, /2\s+bad usage/);
  });

  it('returns usage error for invalid PR identifiers', () => {
    const result = runHarness(['review', 'not-a-pr', '--dry-run']);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /<pr> must be a positive integer/);
  });

  it('rejects mutually exclusive review mode flags', () => {
    const result = runHarness(['review', '141', '--rubber-duck-only', '--copilot-only', '--dry-run']);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /cannot be combined/);
  });

  it('supports dry-run orchestration without contacting GitHub', () => {
    const result = runHarness([
      'review',
      '141',
      '--repo',
      'henrik-me/agent-harness',
      '--dry-run',
      '--model',
      'gpt-5.6-sol',
      '--round',
      'R2',
      '--rubber-duck-only',
      '--no-poll',
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /review: dry-run/);
    assert.match(result.stdout, /reviewer model: gpt-5\.6-sol/);
    assert.match(result.stdout, /round: R2/);
    assert.match(result.stdout, /would compose manual rubber-duck prompt/);
    assert.match(result.stdout, /would skip polling and PR-body update/);
  });
});
