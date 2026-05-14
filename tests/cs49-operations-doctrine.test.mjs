/**
 * tests/cs49-operations-doctrine.test.mjs — CS49 issue #139 doctrine guard.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const OPERATIONS_DOCS = [
  { id: 'template', relPath: 'template/composed/OPERATIONS.md' },
  { id: 'root', relPath: 'OPERATIONS.md' },
];

function readRepoFile(relPath) {
  return readFileSync(path.join(REPO_ROOT, relPath), 'utf8')
    .replace(/^﻿/, '')
    .replace(/
/g, '
')
    .replace(/
/g, '
');
}

function extractH2(content, heading) {
  const headingLine = `## ${heading}`;
  const start = content.indexOf(`
${headingLine}
`);
  assert.notEqual(start, -1, `Missing section: ${headingLine}`);
  const bodyStart = start + 1;
  const next = content.indexOf('
## ', bodyStart + headingLine.length);
  return next === -1 ? content.slice(bodyStart) : content.slice(bodyStart, next);
}

function extractH3(content, heading) {
  const headingLine = `### ${heading}`;
  const start = content.indexOf(`
${headingLine}
`);
  assert.notEqual(start, -1, `Missing subsection: ${headingLine}`);
  const bodyStart = start + 1;
  const nextH3 = content.indexOf('
### ', bodyStart + headingLine.length);
  const nextH2 = content.indexOf('
## ', bodyStart + headingLine.length);
  const candidates = [nextH3, nextH2].filter((idx) => idx !== -1);
  const next = candidates.length === 0 ? -1 : Math.min(...candidates);
  return next === -1 ? content.slice(bodyStart) : content.slice(bodyStart, next);
}

describe('CS49 operations doctrine', () => {
  for (const doc of OPERATIONS_DOCS) {
    it(`${doc.id} OPERATIONS.md codifies orchestrator availability in Sub-agent dispatch`, () => {
      const subAgentDispatch = extractH2(readRepoFile(doc.relPath), 'Sub-agent dispatch');
      assert.match(subAgentDispatch, /^### Orchestrator availability invariant$/m);
      assert.match(subAgentDispatch, /delegate unless/);
      assert.match(subAgentDispatch, /When in doubt, dispatch/);
    });

    it(`${doc.id} OPERATIONS.md codifies sub-agent progress reporting and stall detection`, () => {
      const subAgentDispatch = extractH2(readRepoFile(doc.relPath), 'Sub-agent dispatch');
      assert.match(subAgentDispatch, /^### Sub-agent progress reporting$/m);
      assert.match(subAgentDispatch, /15 wall-minutes/);
      assert.match(subAgentDispatch, /stall/);
    });

    it(`${doc.id} OPERATIONS.md codifies Workboard-first out-of-CS status`, () => {
      const workboardFirst = extractH3(readRepoFile(doc.relPath), 'Workboard-first for out-of-CS work');
      assert.match(workboardFirst, /before starting/);
      assert.match(workboardFirst, /out-of-CS/);
      assert.match(workboardFirst, /WORKBOARD\.md/);
    });
  }

  it('LEARNINGS.md records the downstream consumer gap as LRN-126', () => {
    const learnings = readRepoFile('LEARNINGS.md');
    assert.match(learnings, /^### LRN-126$/m);
    assert.match(learnings, /id: LRN-126/);
    assert.match(learnings, /sub-invaders CS02 hotfix episode/);
    assert.match(learnings, /orchestrator-availability/);
  });
});
