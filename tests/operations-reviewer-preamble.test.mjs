/**
 * tests/operations-reviewer-preamble.test.mjs — CS35 Exit criteria #5.
 *
 * Asserts that OPERATIONS.md (and its template counterpart) contains exactly
 * one reviewer-preamble sentinel block delimited by:
 *   <!-- harness:reviewer-preamble:start -->
 *   <!-- harness:reviewer-preamble:end -->
 * and that the block is non-empty and contains all required field labels.
 *
 * Run: node --test tests/operations-reviewer-preamble.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const START_MARKER = '<!-- harness:reviewer-preamble:start -->';
const END_MARKER = '<!-- harness:reviewer-preamble:end -->';

const REQUIRED_FIELDS = [
  '**role:**',
  '**scope:**',
  '**independence-invariant:**',
  '**model-fallback-ladder',
  '**output-schema-link:**',
];

/**
 * Read a file relative to REPO_ROOT, normalizing line endings.
 *
 * @param {string} relPath
 * @returns {string}
 */
function readFile(relPath) {
  const abs = path.join(REPO_ROOT, relPath);
  const raw = fs.readFileSync(abs, 'utf8');
  return raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Extract the text between the reviewer-preamble sentinel markers.
 * Returns null if the markers are not found or malformed.
 *
 * @param {string} content
 * @returns {string|null}
 */
function extractPreamble(content) {
  const startIdx = content.indexOf(START_MARKER);
  const endIdx = content.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1) return null;
  if (startIdx >= endIdx) return null;
  return content.slice(startIdx + START_MARKER.length, endIdx);
}

/**
 * Run all four assertions against a given OPERATIONS.md file path.
 *
 * @param {string} relPath - Repo-root-relative path to the file.
 */
function assertOperationsFile(relPath) {
  const content = readFile(relPath);

  // 1. Exactly one start marker, exactly one end marker, start before end.
  const startCount = content.split(START_MARKER).length - 1;
  const endCount = content.split(END_MARKER).length - 1;

  assert.equal(
    startCount,
    1,
    `${relPath}: expected exactly 1 start marker, got ${startCount}`,
  );
  assert.equal(
    endCount,
    1,
    `${relPath}: expected exactly 1 end marker, got ${endCount}`,
  );

  const startIdx = content.indexOf(START_MARKER);
  const endIdx = content.indexOf(END_MARKER);
  assert.ok(
    startIdx < endIdx,
    `${relPath}: start marker must appear before end marker`,
  );

  // 2. Text between markers is non-empty after trimming.
  const preamble = extractPreamble(content);
  assert.ok(
    preamble !== null,
    `${relPath}: could not extract preamble between markers`,
  );
  assert.ok(
    preamble.trim().length > 0,
    `${relPath}: preamble text between markers must be non-empty`,
  );

  // 3. Required field labels are present (case-sensitive substring match).
  for (const field of REQUIRED_FIELDS) {
    assert.ok(
      preamble.includes(field),
      `${relPath}: preamble missing required field label: ${field}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('operations reviewer preamble block', () => {
  it('OPERATIONS.md contains valid reviewer-preamble block with all required fields', () => {
    assertOperationsFile('OPERATIONS.md');
  });

  it('template/composed/OPERATIONS.md contains valid reviewer-preamble block with all required fields', () => {
    assertOperationsFile('template/composed/OPERATIONS.md');
  });
});
