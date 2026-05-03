/**
 * tests/doc-schema.test.mjs — Unit tests for lib/doc-schema.mjs
 *
 * Covers: BOM stripping, CRLF normalization, trailing-whitespace fences,
 * malformed-YAML parseError, non-entry YAML bodyAfter, multiple entries,
 * empty input, resolveLinks returning only broken links.
 *
 * Run: node --test tests/doc-schema.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatterBlocks, resolveLinks } from '../lib/doc-schema.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal valid entry YAML block text (with LF endings). */
function entryBlock(id, overrides = {}) {
  const fields = {
    id,
    date: '2024-01-01',
    category: 'tooling',
    source_cs: 'CS01',
    status: 'open',
    tags: '[test]',
    ...overrides,
  };
  const lines = Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('\n');
  return '```yaml\n' + lines + '\n```';
}

// ---------------------------------------------------------------------------
// parseFrontmatterBlocks
// ---------------------------------------------------------------------------

describe('parseFrontmatterBlocks', () => {
  // 1. Empty input → empty array
  it('1. empty input returns empty array', () => {
    assert.deepEqual(parseFrontmatterBlocks(''), []);
    assert.deepEqual(parseFrontmatterBlocks('\n\n'), []);
  });

  // 2. BOM stripping — UTF-8 BOM (\uFEFF) at start of file must be stripped
  it('2. BOM at start of file is stripped and entry is parsed correctly', () => {
    const md = '\uFEFF# Title\n\n' + entryBlock('LRN-001') + '\n';
    const blocks = parseFrontmatterBlocks(md);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].parsed.id, 'LRN-001');
  });

  // 3. CRLF normalization — CRLF line endings parse identically to LF
  it('3. CRLF line endings parse identically to LF', () => {
    const lfMd = '# Title\n\n' + entryBlock('LRN-001') + '\n';
    const crlfMd = lfMd.replace(/\n/g, '\r\n');
    const lfBlocks   = parseFrontmatterBlocks(lfMd);
    const crlfBlocks = parseFrontmatterBlocks(crlfMd);
    assert.equal(lfBlocks.length, 1);
    assert.equal(crlfBlocks.length, 1, 'CRLF file should yield 1 block');
    assert.equal(crlfBlocks[0].parsed.id, lfBlocks[0].parsed.id);
    assert.equal(crlfBlocks[0].lineNumber, lfBlocks[0].lineNumber);
  });

  // 4. Trailing-whitespace fences — ```yaml<space> and ```<space> are valid
  it('4. fence lines with trailing whitespace are recognised', () => {
    const md = '# Title\n\n```yaml   \nid: LRN-001\ndate: 2024-01-01\ncategory: tooling\nsource_cs: CS01\nstatus: open\ntags: [test]\n```   \n';
    const blocks = parseFrontmatterBlocks(md);
    assert.equal(blocks.length, 1, 'trailing-whitespace fences should be accepted');
    assert.equal(blocks[0].parsed.id, 'LRN-001');
  });

  // 5. Malformed YAML with id: LRN- returns entry with parseError, parsed = null
  it('5. malformed YAML with id: LRN- returns parseError block with parsed=null', () => {
    const md = '# Title\n\n```yaml\nid: LRN-001\ntags: [bad, "unclosed\n```\n';
    const blocks = parseFrontmatterBlocks(md);
    assert.equal(blocks.length, 1, 'malformed LRN entry should still be returned');
    assert.equal(blocks[0].parsed, null);
    assert.ok(blocks[0].parseError, 'parseError field should be set');
    assert.ok(typeof blocks[0].parseError.message === 'string', 'parseError.message should be a string');
    assert.ok(blocks[0].parseError.originalError instanceof Error, 'parseError.originalError should be an Error');
  });

  // 6. Non-entry YAML block inside body — bodyAfter must not be truncated
  it('6. non-entry yaml fence inside entry body does not truncate bodyAfter', () => {
    const md = [
      '# Title',
      '',
      '```yaml',
      'id: LRN-001',
      'date: 2024-01-01',
      'category: tooling',
      'source_cs: CS01',
      'status: applied',
      'tags: [test]',
      '```',
      '',
      'Some prose.',
      '',
      '```yaml',
      'example_key: example_value',
      '```',
      '',
      '**Disposition:** Applied.',
      '',
    ].join('\n');
    const blocks = parseFrontmatterBlocks(md);
    assert.equal(blocks.length, 1);
    assert.ok(
      blocks[0].bodyAfter.includes('**Disposition:**'),
      `bodyAfter should include Disposition paragraph; got:\n${blocks[0].bodyAfter}`
    );
  });

  // 7. Multiple entries — boundaries are correct
  it('7. multiple entries have correct lineNumbers and bodyAfter boundaries', () => {
    const md = [
      '# Title',           // line 1
      '',                   // line 2
      '```yaml',            // line 3  (openIdx=2, 0-indexed)
      'id: LRN-001',
      'date: 2024-01-01',
      'category: tooling',
      'source_cs: CS01',
      'status: open',
      'tags: [test]',
      '```',               // line 10
      '',
      'Body of first entry.',
      '',
      '```yaml',            // line 14
      'id: LRN-002',
      'date: 2024-01-02',
      'category: tooling',
      'source_cs: CS02',
      'status: open',
      'tags: [test2]',
      '```',
      '',
      'Body of second entry.',
    ].join('\n');

    const blocks = parseFrontmatterBlocks(md);
    assert.equal(blocks.length, 2);

    assert.equal(blocks[0].parsed.id, 'LRN-001');
    assert.equal(blocks[1].parsed.id, 'LRN-002');

    // First entry's bodyAfter should contain its body but not LRN-002's
    assert.ok(blocks[0].bodyAfter.includes('Body of first entry.'));
    assert.ok(!blocks[0].bodyAfter.includes('Body of second entry.'));

    // Second entry's bodyAfter should contain its body
    assert.ok(blocks[1].bodyAfter.includes('Body of second entry.'));
  });

  // 8. Malformed YAML without LRN- id is silently skipped
  it('8. malformed YAML without id: LRN- is silently skipped', () => {
    const md = '# Title\n\n```yaml\nsome_key: [bad, "unclosed\n```\n';
    const blocks = parseFrontmatterBlocks(md);
    assert.equal(blocks.length, 0, 'non-LRN malformed YAML should be silently skipped');
  });
});

// ---------------------------------------------------------------------------
// resolveLinks — NB-6: returns ONLY broken links
// ---------------------------------------------------------------------------

describe('resolveLinks', () => {
  it('9. returns only broken links, not ok links', () => {
    // Use REPO_ROOT as baseDir so README.md definitely exists and a fake file doesn't.
    const md = [
      '[existing](README.md)',
      '[missing](this-file-does-not-exist-cs05.md)',
    ].join('\n');

    const results = resolveLinks(md, REPO_ROOT);

    // Should contain only the broken link
    assert.equal(results.length, 1, `Expected 1 broken link; got ${results.length}: ${JSON.stringify(results)}`);
    assert.equal(results[0].href, 'this-file-does-not-exist-cs05.md');
    assert.equal(results[0].status, 'broken');
  });

  it('10. returns empty array when all links resolve', () => {
    const md = '[readme](README.md)';
    const results = resolveLinks(md, REPO_ROOT);
    assert.equal(results.length, 0, 'no broken links expected');
  });
});
