/**
 * tests/cs24-changelog-touch-enforcement.test.mjs
 *
 * Tests for the CS24 / LRN-101 CHANGELOG-touch enforcement added to
 * scripts/check-clickstop.mjs and the lib/distributed-surface-globs.mjs helper.
 *
 * Fixture trees live under tests/fixtures/cs24/<case>/{active,done}/. Each case
 * is a complete, otherwise-valid clickstop so that only the CHANGELOG dimension
 * varies. The linter is spawned via spawnSync (same pattern as
 * check-clickstop.test.mjs).
 *
 * Run: node --test tests/cs24-changelog-touch-enforcement.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DISTRIBUTED_SURFACE_GLOBS,
  matchesDistributedSurface,
} from '../lib/distributed-surface-globs.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const LINTER = path.join(REPO_ROOT, 'scripts', 'check-clickstop.mjs');
const FIXTURES = path.join(__dirname, 'fixtures', 'cs24');
const NODE = process.execPath;

const CHANGELOG_ERROR = 'CHANGELOG-touch task row';

/**
 * Run the linter against a fixture case directory.
 *
 * @param {string} caseName
 * @returns {{ stdout: string, stderr: string, status: number }}
 */
function runCase(caseName) {
  const result = spawnSync(NODE, [LINTER, '--dir', path.join(FIXTURES, caseName)], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? -1,
  };
}

// ---------------------------------------------------------------------------
// Fixture-based enforcement tests
// ---------------------------------------------------------------------------

describe('CS24 CHANGELOG-touch enforcement (fixtures)', () => {
  // --- Valid cases: linter emits NO CHANGELOG error, exit 0 -----------------

  it('1. active + distributed deliverable + CHANGELOG row → passes', () => {
    const r = runCase('valid-touches-distributed-with-changelog');
    assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\n${r.stdout}\n${r.stderr}`);
    assert.ok(!r.stdout.includes(CHANGELOG_ERROR), `Unexpected CHANGELOG error:\n${r.stdout}`);
  });

  it('2. done + distributed deliverable + closed before enforcement date → grandfathered', () => {
    const r = runCase('valid-grandfathered');
    assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\n${r.stdout}\n${r.stderr}`);
    assert.ok(!r.stdout.includes(CHANGELOG_ERROR), `Unexpected CHANGELOG error:\n${r.stdout}`);
  });

  it('3. active + internal-only deliverables + no CHANGELOG row → passes', () => {
    const r = runCase('valid-internal-only-no-changelog');
    assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\n${r.stdout}\n${r.stderr}`);
    assert.ok(!r.stdout.includes(CHANGELOG_ERROR), `Unexpected CHANGELOG error:\n${r.stdout}`);
  });

  it('4. active + internal-only deliverables + CHANGELOG row present anyway → passes', () => {
    const r = runCase('valid-internal-only-with-changelog');
    assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\n${r.stdout}\n${r.stderr}`);
    assert.ok(!r.stdout.includes(CHANGELOG_ERROR), `Unexpected CHANGELOG error:\n${r.stdout}`);
  });

  // --- Invalid cases: linter emits the CHANGELOG error, exit 1 --------------

  it('5. active + distributed deliverable + no CHANGELOG row → fails', () => {
    const r = runCase('invalid-active-distributed-no-changelog');
    assert.equal(r.status, 1, `Expected exit 1; got ${r.status}\n${r.stdout}\n${r.stderr}`);
    assert.ok(r.stdout.includes(CHANGELOG_ERROR), `Expected CHANGELOG error; got:\n${r.stdout}`);
  });

  it('6. done recent + distributed deliverable + no CHANGELOG row → fails', () => {
    const r = runCase('invalid-done-recent-distributed-no-changelog');
    assert.equal(r.status, 1, `Expected exit 1; got ${r.status}\n${r.stdout}\n${r.stderr}`);
    assert.ok(r.stdout.includes(CHANGELOG_ERROR), `Expected CHANGELOG error; got:\n${r.stdout}`);
  });

  it('7. done recent + distributed + Tasks present but no CHANGELOG row → fails', () => {
    const r = runCase('invalid-done-recent-no-tasks-changelog');
    assert.equal(r.status, 1, `Expected exit 1; got ${r.status}\n${r.stdout}\n${r.stderr}`);
    assert.ok(r.stdout.includes(CHANGELOG_ERROR), `Expected CHANGELOG error; got:\n${r.stdout}`);
  });

  it('8. done recent + distributed + misnamed changelog row (no verb) → fails', () => {
    const r = runCase('invalid-done-recent-misnamed-changelog-row');
    assert.equal(r.status, 1, `Expected exit 1; got ${r.status}\n${r.stdout}\n${r.stderr}`);
    assert.ok(r.stdout.includes(CHANGELOG_ERROR), `Expected CHANGELOG error; got:\n${r.stdout}`);
  });
});

// ---------------------------------------------------------------------------
// no-Deliverables-section skip (runtime-generated fixture under os.tmpdir)
// ---------------------------------------------------------------------------

describe('CS24 CHANGELOG-touch enforcement (no Deliverables section)', () => {
  it('9. done recent with no ## Deliverables section → cannot determine → skipped', () => {
    // LRN-094: transient fixtures must NOT be written under REPO_ROOT (a
    // concurrent text-encoding walk would ENOENT-race on them).
    const root = path.join(os.tmpdir(), 'cs24-no-deliverables', 'tree');
    const doneDir = path.join(root, 'done');
    fs.rmSync(root, { recursive: true, force: true });
    fs.mkdirSync(doneDir, { recursive: true });
    fs.writeFileSync(
      path.join(doneDir, 'done_cs24099_no-deliverables.md'),
      [
        '# CS24099 — no Deliverables section',
        '',
        '**Status:** done',
        '**Owner:** test-ah',
        '**Branch:** cs24099/fixture',
        '**Started:** 2026-07-20',
        '**Closed:** 2026-08-01',
        '**Depends on:** —',
        '',
        '## Tasks',
        '',
        '| Task | State | Owner | Notes |',
        '|---|---|---|---|',
        '| T1 — do the thing | done | test-ah | core |',
        '| Close-out: docs + restart state | done | test-ah | Update WORKBOARD.md, CONTEXT.md |',
        '| Close-out: learnings + follow-ups | done | test-ah | Disposition learnings in LEARNINGS.md |',
        '',
        '## Plan-vs-implementation review',
        '',
        '**Reviewer:** rubber-duck (test)',
        '**Date:** 2026-08-01',
        '**Outcome:** GO',
        '',
      ].join('\n'),
      'utf8'
    );

    const result = spawnSync(NODE, [LINTER, '--dir', root], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    const stdout = result.stdout ?? '';
    assert.equal(result.status, 0, `Expected exit 0; got ${result.status}\n${stdout}\n${result.stderr}`);
    assert.ok(!stdout.includes(CHANGELOG_ERROR), `Unexpected CHANGELOG error:\n${stdout}`);

    fs.rmSync(root, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// Unit tests for lib/distributed-surface-globs.mjs
// ---------------------------------------------------------------------------

describe('matchesDistributedSurface (unit)', () => {
  it('10. exports the documented candidate globs', () => {
    for (const g of [
      'template/**', 'lib/**', 'scripts/**', 'bin/**',
      'scaffolds/**', 'schemas/**', 'package.json', 'package-lock.json',
    ]) {
      assert.ok(DISTRIBUTED_SURFACE_GLOBS.includes(g), `missing glob: ${g}`);
    }
  });

  it('11. matches distributed file/glob/dir tokens', () => {
    assert.equal(matchesDistributedSurface('scripts/foo.mjs', []), true);
    assert.equal(matchesDistributedSurface('lib/bar.mjs', []), true);
    assert.equal(matchesDistributedSurface('template/composed/OPERATIONS.md', []), true);
    assert.equal(matchesDistributedSurface('template/**', []), true);
    assert.equal(matchesDistributedSurface('schemas/x.schema.json', []), true);
    assert.equal(matchesDistributedSurface('bin/harness.mjs', []), true);
    assert.equal(matchesDistributedSurface('scaffolds/a/b.mjs', []), true);
    assert.equal(matchesDistributedSurface('package.json', []), true);
  });

  it('12. restricts scripts/ to *.mjs files', () => {
    assert.equal(matchesDistributedSurface('scripts/foo.mjs', []), true);
    assert.equal(matchesDistributedSurface('scripts/foo.sh', []), false);
    assert.equal(matchesDistributedSurface('scripts/README.md', []), false);
  });

  it('13. does not match internal-only paths', () => {
    assert.equal(matchesDistributedSurface('LEARNINGS.md', []), false);
    assert.equal(matchesDistributedSurface('CONTEXT.md', []), false);
    assert.equal(matchesDistributedSurface('WORKBOARD.md', []), false);
    assert.equal(matchesDistributedSurface('project/clickstops/done/done_cs1_x.md', []), false);
    assert.equal(matchesDistributedSurface('tests/fixtures/cs24/', []), false);
  });

  it('14. subtracts the excluded list (file + directory entries)', () => {
    assert.equal(matchesDistributedSurface('package.json', ['package.json']), false);
    assert.equal(matchesDistributedSurface('lib/foo.mjs', ['lib/']), false);
    assert.equal(matchesDistributedSurface('lib/foo.mjs', ['lib']), false);
    // An excluded sibling does not suppress a non-excluded distributed path.
    assert.equal(matchesDistributedSurface('lib/foo.mjs', ['package.json']), true);
  });

  it('15. handles empty / non-string tokens defensively', () => {
    assert.equal(matchesDistributedSurface('', []), false);
    assert.equal(matchesDistributedSurface(undefined, []), false);
    assert.equal(matchesDistributedSurface(null, []), false);
  });
});
