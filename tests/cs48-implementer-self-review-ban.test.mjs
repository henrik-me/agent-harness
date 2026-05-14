/**
 * tests/cs48-implementer-self-review-ban.test.mjs — CS48 / issue #142 regression tests.
 *
 * Locks the dispatch-template and LRN doctrine that implementer self-review is
 * debugging-only and never review evidence. The tests are read-only: no scratch
 * files are needed, so LRN-094's os.tmpdir() guidance is not triggered.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const CALLOUT = '**Self-review carries zero review weight.**';
const BANNED_FIELD = 'Self-review summary';
const IMPLEMENTER_FIELD = 'Implementer model used';
const PLANNED_REVIEW_CLI = 'planned `harness review` CLI';

function read(relPath) {
  return readFileSync(path.join(REPO_ROOT, relPath), 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

describe('CS48 — implementer self-review ban in dispatch template + LRN', () => {
  it('1. dispatch template contains the verbatim zero-weight self-review callout', () => {
    for (const relPath of ['template/composed/OPERATIONS.md', 'OPERATIONS.md']) {
      const content = read(relPath);
      assert.ok(
        content.includes(CALLOUT),
        `${relPath} must contain the exact CS48 callout: ${CALLOUT}`,
      );
      assert.ok(
        content.includes(PLANNED_REVIEW_CLI),
        `${relPath} must point to the planned harness review CLI without implying it already exists`,
      );
    }
  });

  it('2. dispatch template no longer asks for the stale self-review report field', () => {
    for (const relPath of ['template/composed/OPERATIONS.md', 'OPERATIONS.md']) {
      const content = read(relPath);
      assert.ok(
        !content.includes(BANNED_FIELD),
        `${relPath} must not mention or request ${BANNED_FIELD}`,
      );
      assert.ok(
        content.includes(IMPLEMENTER_FIELD),
        `${relPath} must require ${IMPLEMENTER_FIELD} for ledger/model-audit provenance`,
      );
    }
  });

  it('3. LRN-127 exists in root and seeded LEARNINGS with the Sub Invaders PR #28 evidence', () => {
    for (const relPath of ['LEARNINGS.md', 'template/seeded/LEARNINGS.md']) {
      const content = read(relPath);
      assert.ok(content.includes('### LRN-127'), `${relPath} must contain LRN-127`);
      assert.ok(
        content.includes('Implementer self-review is not a rubber-duck review'),
        `${relPath} must carry the issue #142 LRN finding text`,
      );
      assert.ok(
        content.includes('henrik-me/sub-invaders') && content.includes('PR #28'),
        `${relPath} must cite the SI PR #28 evidence`,
      );
      assert.ok(
        content.includes('?startWave=N'),
        `${relPath} must cite the concrete ?startWave=N blocking bug evidence`,
      );
    }
  });
});
