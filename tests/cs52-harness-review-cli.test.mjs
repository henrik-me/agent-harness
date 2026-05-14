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
    assert.match(result.stdout, /review <pr>/);
    assert.match(result.stdout, /Orchestrate rubber-duck and Copilot PR review/);
  });

  it('prints dedicated review help with flags and exit-code contract', () => {
    const result = runHarness(['review', '--help']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Usage: harness review <pr>/);
    assert.match(result.stdout, /--rubber-duck-only/);
    assert.match(result.stdout, /--copilot-only/);
    assert.match(result.stdout, /--model <model>/);
    assert.match(result.stdout, /--round <R1\|R2\|\.\.\.|Rn>/);
    assert.match(result.stdout, /Exit codes:/);
    assert.match(result.stdout, /0\s+Review gates passed/);
    assert.match(result.stdout, /1\s+Review produced a No-Go/);
    assert.match(result.stdout, /2\s+Operational failure/);
  });

  it('returns usage error for invalid PR identifiers', () => {
    const result = runHarness(['review', 'not-a-pr', '--dry-run']);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Invalid PR/);
  });

  it('rejects mutually exclusive review mode flags', () => {
    const result = runHarness(['review', '141', '--rubber-duck-only', '--copilot-only', '--dry-run']);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /mutually exclusive/);
  });

  it('supports dry-run orchestration without contacting GitHub', () => {
    const result = runHarness([
      'review',
      '141',
      '--repo',
      'henrik-me/agent-harness',
      '--dry-run',
      '--model',
      'gpt-5.5',
      '--round',
      'R2',
      '--rubber-duck-only',
      '--no-poll',
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /DRY RUN/);
    assert.match(result.stdout, /rubber-duck reviewer model: gpt-5\.5/);
    assert.match(result.stdout, /would update PR body review log round R2/);
    assert.match(result.stdout, /would skip Copilot review/);
  });
});
