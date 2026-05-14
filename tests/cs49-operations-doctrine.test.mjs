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
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

function extractHeading(content, level, heading) {
  const lines = content.split('\n');
  const marker = `${'#'.repeat(level)} ${heading}`;
  let inFence = false;
  let start = -1;

  for (let idx = 0; idx < lines.length; idx++) {
    if (lines[idx].trim().startsWith('```')) inFence = !inFence;
    if (!inFence && lines[idx].trim() === marker) {
      start = idx;
      break;
    }
  }

  assert.notEqual(start, -1, `Missing section: ${marker}`);

  const stopRe = new RegExp(`^#{1,${level}}\\s+`);
  inFence = false;
  let end = lines.length;
  for (let idx = start + 1; idx < lines.length; idx++) {
    if (lines[idx].trim().startsWith('```')) inFence = !inFence;
    if (!inFence && stopRe.test(lines[idx])) {
      end = idx;
      break;
    }
  }

  return lines.slice(start, end).join('\n');
}

function extractSubAgentDispatch(content) {
  const startMarker = '\n## Sub-agent dispatch\n';
  const endMarker = '\n## Copilot engagement procedure';
  const start = content.indexOf(startMarker);
  assert.notEqual(start, -1, 'Missing section: ## Sub-agent dispatch');
  const end = content.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, 'Missing section boundary: ## Copilot engagement procedure');
  return content.slice(start + 1, end);
}

function extractH3(content, heading) {
  return extractHeading(content, 3, heading);
}

describe('CS49 operations doctrine', () => {
  for (const doc of OPERATIONS_DOCS) {
    it(`${doc.id} OPERATIONS.md codifies orchestrator availability in Sub-agent dispatch`, () => {
      const subAgentDispatch = extractSubAgentDispatch(readRepoFile(doc.relPath));
      assert.match(subAgentDispatch, /^### Orchestrator availability invariant$/m);
      assert.match(subAgentDispatch, /delegate unless/);
      assert.match(subAgentDispatch, /When in doubt, dispatch/);
    });

    it(`${doc.id} OPERATIONS.md codifies sub-agent progress reporting and stall detection`, () => {
      const subAgentDispatch = extractSubAgentDispatch(readRepoFile(doc.relPath));
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
