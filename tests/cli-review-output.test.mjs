/**
 * tests/cli-review-output.test.mjs — Tests for `harness review-output` CLI route.
 *
 * Per CS40 Deliverable 3 + Exit criterion #1. Verifies:
 *   - `harness review-output --help` shows all CS40 C40-1 flags
 *   - subcommand dispatches to scripts/check-review-output.mjs
 *   - exit code is propagated from the script
 *   - top-level `harness --help` lists the new subcommand
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const HARNESS = path.join(REPO_ROOT, 'bin', 'harness.mjs');

describe('harness review-output CLI route (CS40)', () => {
  it('--help prints subcommand help with all CS40 flags', () => {
    const r = spawnSync('node', [HARNESS, 'review-output', '--help'], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0);
    // All flags from C40-1 must be documented.
    for (const flag of [
      '--review-output', '--round', '--base', '--head',
      '--prev-head', '--repo', '--pr', '--reviewer-model',
      '--update-pr', '--json', '--quiet', '--help',
    ]) {
      assert.match(r.stdout, new RegExp(flag.replace(/-/g, '\\-')), `missing flag in help: ${flag}`);
    }
  });

  it('top-level harness --help lists review-output subcommand', () => {
    const r = spawnSync('node', [HARNESS, '--help'], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /review-output\s+Validate reviewer-output markdown/);
  });

  it('missing required flags exits 2 (bad usage propagated from script)', () => {
    const r = spawnSync('node', [HARNESS, 'review-output'], { encoding: 'utf8' });
    assert.strictEqual(r.status, 2);
    // The script writes its error to stderr; with stdio:'inherit' in cmdReviewOutput
    // the test process can't capture it directly, but exit code is the contract.
  });

  it('happy-path R1 dispatch returns exit 0', () => {
    // Initialise a tiny git repo for the diff.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-ro-'));
    try {
      const run = (cmd, args) => spawnSync(cmd, args, { cwd: dir, encoding: 'utf8' });
      run('git', ['init', '--initial-branch=main', '--quiet']);
      run('git', ['config', 'user.email', 't@e.com']);
      run('git', ['config', 'user.name', 'T']);
      run('git', ['config', 'commit.gpgSign', 'false']);
      fs.writeFileSync(path.join(dir, 'a.txt'), 'a-base');
      run('git', ['add', '-A']); run('git', ['commit', '-m', 'base', '--quiet']);
      const base = run('git', ['rev-parse', 'HEAD']).stdout.trim();
      fs.writeFileSync(path.join(dir, 'b.txt'), 'b-head');
      run('git', ['add', '-A']); run('git', ['commit', '-m', 'head', '--quiet']);
      const head = run('git', ['rev-parse', 'HEAD']).stdout.trim();

      const review = [
        `Analyzed HEAD: ${head}`, '', '## Per-file analysis', '', '- b.txt: clean', '',
        'Verdict: Go', '',
      ].join('\n');
      const rf = path.join(dir, 'review.md');
      fs.writeFileSync(rf, review);

      const r = spawnSync('node', [
        HARNESS, 'review-output',
        '--review-output', rf,
        '--round', 'R1',
        '--base', base,
        '--head', head,
      ], { cwd: dir, encoding: 'utf8' });
      assert.strictEqual(r.status, 0, `expected exit 0, got ${r.status}`);
    } finally {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });
});
