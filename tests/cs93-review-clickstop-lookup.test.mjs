/**
 * tests/cs93-review-clickstop-lookup.test.mjs — CS93 (#407).
 *
 * Regression + robustness coverage for lib/review.mjs `findClickstopFile`, the
 * non-dry-run clickstop-file resolver used by `harness review <pr>`. The #407
 * defect: a branch-derived id like "CS02" was zero-stripped to "CS2" and
 * substring-matched against the raw zero-padded filename "…_cs02_…", so nothing
 * matched even though the file existed. The fix normalizes BOTH sides, supports
 * directory-form plans, and reads dirs fail-closed (ENOENT-discriminating).
 *
 * All scratch state lives under os.tmpdir() — never under REPO_ROOT (writes
 * there race check-text-encoding's recursive walk under parallel `node --test`).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { findClickstopFile, ReviewError } from '../lib/review.mjs';

let cwd;

beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'cs93-clickstop-'));
});

afterEach(() => {
  fs.rmSync(cwd, { recursive: true, force: true });
});

/** Create a flat clickstop plan file under <cwd>/project/clickstops/<stage>/. */
function writeFlat(stage, basename, body = '# plan\n') {
  const dir = path.join(cwd, 'project', 'clickstops', stage);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, basename);
  fs.writeFileSync(file, body, 'utf8');
  return file;
}

/** Create a directory-form clickstop plan (<stem>/<stem>.md). */
function writeDir(stage, stem, body = '# plan\n') {
  const dir = path.join(cwd, 'project', 'clickstops', stage, stem);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${stem}.md`);
  fs.writeFileSync(file, body, 'utf8');
  return file;
}

describe('CS93 findClickstopFile — #407 padding + robustness', () => {
  it('resolves a zero-padded flat file from a zero-padded id (the #407 repro)', () => {
    const file = writeFlat('active', 'active_cs02_fintech-domain-skeleton.md');
    assert.strictEqual(findClickstopFile({ cwd, csId: 'CS02' }), file);
  });

  it('resolves a zero-padded file from an UNPADDED id (CS2 -> cs02)', () => {
    const file = writeFlat('active', 'active_cs02_fintech-domain-skeleton.md');
    assert.strictEqual(findClickstopFile({ cwd, csId: 'CS2' }), file);
  });

  it('resolves an UNPADDED file from a zero-padded id (CS02 -> cs2)', () => {
    const file = writeFlat('active', 'active_cs2_some-slug.md');
    assert.strictEqual(findClickstopFile({ cwd, csId: 'CS02' }), file);
  });

  it('resolves a directory-form clickstop to its inner <stem>.md', () => {
    const file = writeDir('active', 'active_cs07_fintech-domain-skeleton');
    assert.strictEqual(findClickstopFile({ cwd, csId: 'CS07' }), file);
  });

  it('resolves a letter-suffix id (CS64b)', () => {
    const file = writeFlat('planned', 'planned_cs64b_sub-task-slug.md');
    assert.strictEqual(findClickstopFile({ cwd, csId: 'CS64b' }), file);
  });

  it('searches planned and done stages, not just active', () => {
    const planned = writeFlat('planned', 'planned_cs30_a-slug.md');
    const done = writeFlat('done', 'done_cs31_b-slug.md');
    assert.strictEqual(findClickstopFile({ cwd, csId: 'CS30' }), planned);
    assert.strictEqual(findClickstopFile({ cwd, csId: 'CS31' }), done);
  });

  it('does not confuse distinct multi-digit numbers (CS1 must not match cs12)', () => {
    writeFlat('active', 'active_cs12_twelve-slug.md');
    assert.throws(
      () => findClickstopFile({ cwd, csId: 'CS1' }),
      (err) => err instanceof ReviewError && err.kind === 'bad-input',
    );
  });

  it('ignores non-.md flat entries', () => {
    writeFlat('active', 'active_cs05_a-slug.txt');
    assert.throws(
      () => findClickstopFile({ cwd, csId: 'CS05' }),
      (err) => err instanceof ReviewError && err.kind === 'bad-input',
    );
  });

  it('throws ReviewError bad-input (mentioning the id) when no clickstop matches', () => {
    writeFlat('active', 'active_cs02_a-slug.md');
    assert.throws(
      () => findClickstopFile({ cwd, csId: 'CS99' }),
      (err) => err instanceof ReviewError
        && err.kind === 'bad-input'
        && /CS99/.test(err.message),
    );
  });

  it('throws not-found (not a crash) when the clickstops tree is entirely absent', () => {
    // cwd has no project/clickstops/* dirs -> every readdir is ENOENT.
    assert.throws(
      () => findClickstopFile({ cwd, csId: 'CS02' }),
      (err) => err instanceof ReviewError && err.kind === 'bad-input',
    );
  });

  it('prefers active over planned/done when the same id exists in multiple stages', () => {
    const active = writeFlat('active', 'active_cs40_active-slug.md');
    writeFlat('planned', 'planned_cs40_planned-slug.md');
    assert.strictEqual(findClickstopFile({ cwd, csId: 'CS40' }), active);
  });
});
