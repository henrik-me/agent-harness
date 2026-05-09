/**
 * tests/composed.test.mjs — Tests for lib/composed.mjs
 *
 * Covers all 8 error codes, round-trip, merge fail-closed, merge with legacy
 * mapping, block-record AJV schema validation, escape syntax, and LF line endings.
 *
 * Run: node --test tests/composed.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import {
  parseComposed,
  serializeComposed,
  mergeComposed,
  computeBlockRecords,
  computeTemplateProseHash,
  ComposedParseError,
  ComposedMergeError,
} from '../lib/composed.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot   = path.resolve(__dirname, '..');
const fixtureDir = path.join(__dirname, 'fixtures', 'cs03', 'composed');

/** Read a fixture file as UTF-8 string. */
function fixture(rel) {
  return readFileSync(path.join(fixtureDir, rel), 'utf8');
}

// ---------------------------------------------------------------------------
// AJV setup for blockEntry schema validation (self-check 5)
// ---------------------------------------------------------------------------

const lockSchema = JSON.parse(
  readFileSync(path.join(repoRoot, 'schemas', 'harness-lock.schema.json'), 'utf8')
);
// Build a standalone schema for blockEntry by inlining $defs
const blockEntrySchema = {
  ...lockSchema.$defs.blockEntry,
  $defs: lockSchema.$defs,
};
const ajv = new Ajv2020({ strict: false });
addFormats(ajv);
const validateBlockEntry = ajv.compile(blockEntrySchema);

function assertValidBlockEntry(record) {
  const ok = validateBlockEntry(record);
  if (!ok) {
    throw new assert.AssertionError({
      message: `blockEntry schema violation for id="${record.id}": ` +
               JSON.stringify(validateBlockEntry.errors),
    });
  }
}

// ---------------------------------------------------------------------------
// Helper: assert a parse error with expected code
// ---------------------------------------------------------------------------

function assertParseError(content, code, desc) {
  assert.throws(
    () => parseComposed(content),
    (err) => {
      assert.ok(err instanceof ComposedParseError, `Expected ComposedParseError, got ${err.constructor.name}`);
      assert.equal(err.code, code, `Expected code ${code}, got ${err.code}`);
      return true;
    },
    desc,
  );
}

function assertMergeError(fn, code, desc) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof ComposedMergeError || err instanceof ComposedParseError,
      `Expected Composed*Error, got ${err.constructor.name}`);
    assert.equal(err.code, code, `Expected code ${code}, got ${err.code} — ${err.message}`);
    return true;
  }, desc);
}

// ===========================================================================
// 1. Parse error codes (8 codes)
// ===========================================================================

describe('parseComposed — error: ECOMPOSED_UNCLOSED', () => {
  it('throws on unclosed local block', () => {
    assertParseError(
      fixture('parse-error-unclosed/template.md'),
      'ECOMPOSED_UNCLOSED',
      'unclosed block should throw',
    );
  });

  it('throws on inline unclosed block', () => {
    assertParseError(
      '<!-- harness:local-start id=foo -->\nno end',
      'ECOMPOSED_UNCLOSED',
    );
  });
});

describe('parseComposed — error: ECOMPOSED_DUPID', () => {
  it('throws on duplicate block id via fixture', () => {
    assertParseError(
      fixture('parse-error-dupid/template.md'),
      'ECOMPOSED_DUPID',
    );
  });

  it('throws on duplicate block id inline', () => {
    const content = [
      '<!-- harness:local-start id=abc -->',
      '<!-- harness:local-end id=abc -->',
      '<!-- harness:local-start id=abc -->',
      '<!-- harness:local-end id=abc -->',
    ].join('\n');
    assertParseError(content, 'ECOMPOSED_DUPID');
  });
});

describe('parseComposed — error: ECOMPOSED_NESTED', () => {
  it('throws on nested blocks via fixture', () => {
    assertParseError(
      fixture('parse-error-nested/template.md'),
      'ECOMPOSED_NESTED',
    );
  });

  it('throws on nested blocks inline', () => {
    const content = [
      '<!-- harness:local-start id=outer -->',
      '<!-- harness:local-start id=inner -->',
      '<!-- harness:local-end id=inner -->',
      '<!-- harness:local-end id=outer -->',
    ].join('\n');
    assertParseError(content, 'ECOMPOSED_NESTED');
  });
});

describe('parseComposed — error: ECOMPOSED_BADID', () => {
  it('throws on invalid block id (uppercase) via fixture', () => {
    assertParseError(
      fixture('parse-error-badid/template.md'),
      'ECOMPOSED_BADID',
    );
  });

  it('throws on id with spaces', () => {
    assertParseError(
      '<!-- harness:local-start id=my block -->\n<!-- harness:local-end id=my block -->',
      'ECOMPOSED_MIDLINE',  // "id=my block -->" doesn't match exact pattern → mid-line detection
    );
  });

  it('throws on id starting with digit', () => {
    assertParseError(
      '<!-- harness:local-start id=1foo -->\n<!-- harness:local-end id=1foo -->',
      'ECOMPOSED_BADID',
    );
  });
});

describe('parseComposed — error: ECOMPOSED_ORPHANEND', () => {
  it('throws on orphan end marker via fixture', () => {
    assertParseError(
      fixture('parse-error-orphanend/template.md'),
      'ECOMPOSED_ORPHANEND',
    );
  });

  it('throws on orphan end marker inline', () => {
    assertParseError(
      '<!-- harness:local-end id=ghost -->',
      'ECOMPOSED_ORPHANEND',
    );
  });
});

describe('parseComposed — error: ECOMPOSED_INCODEBLOCK', () => {
  it('throws on unescaped marker inside fenced code block (fixture)', () => {
    assertParseError(
      fixture('parse-error-incodeblock-fence/template.md'),
      'ECOMPOSED_INCODEBLOCK',
    );
  });

  it('throws on unescaped marker inside indented code block (fixture)', () => {
    assertParseError(
      fixture('parse-error-incodeblock-indent/template.md'),
      'ECOMPOSED_INCODEBLOCK',
    );
  });

  it('throws on unescaped marker inside backtick fence (inline)', () => {
    const content = [
      'Before fence.',
      '```',
      '<!-- harness:local-start id=inside-fence -->',
      '```',
    ].join('\n');
    assertParseError(content, 'ECOMPOSED_INCODEBLOCK');
  });

  it('throws on unescaped marker inside tilde fence (inline)', () => {
    const content = [
      '~~~',
      '<!-- harness:local-end id=ghost -->',
      '~~~',
    ].join('\n');
    assertParseError(content, 'ECOMPOSED_INCODEBLOCK');
  });

  it('throws on unescaped marker in 4-space indented block (inline)', () => {
    const content = '    <!-- harness:local-start id=indent-marker -->';
    assertParseError(content, 'ECOMPOSED_INCODEBLOCK');
  });
});

describe('parseComposed — error: ECOMPOSED_MIDLINE', () => {
  it('throws on mid-line marker via fixture', () => {
    assertParseError(
      fixture('parse-error-midline/template.md'),
      'ECOMPOSED_MIDLINE',
    );
  });

  it('throws on marker embedded in prose (inline)', () => {
    assertParseError(
      'Prose text <!-- harness:local-start id=foo --> more prose',
      'ECOMPOSED_MIDLINE',
    );
  });
});

// ECOMPOSED_DROPPED is tested in merge section below

// ===========================================================================
// 2. Successful parse and round-trip
// ===========================================================================

describe('parseComposed — success', () => {
  it('parses a file with no blocks', () => {
    const content = '# Title\n\nSome content.\n';
    const { sections, blocks } = parseComposed(content);
    assert.equal(blocks.size, 0);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].type, 'template');
  });

  it('parses a file with one block', () => {
    const content = [
      '# Header',
      '',
      '<!-- harness:local-start id=my.block -->',
      'Body line',
      '<!-- harness:local-end id=my.block -->',
      '',
    ].join('\n');
    const { blocks } = parseComposed(content);
    assert.equal(blocks.size, 1);
    assert.ok(blocks.has('my.block'));
    const b = blocks.get('my.block');
    assert.deepEqual(b.body, ['Body line']);
    assert.equal(b.startLine, 3);
    assert.equal(b.endLine, 5);
  });

  it('parses a file with multiple blocks', () => {
    const { blocks } = parseComposed(fixture('merge-success-multiple-blocks/template.md'));
    assert.equal(blocks.size, 3);
    assert.ok(blocks.has('first-block'));
    assert.ok(blocks.has('second-block'));
    assert.ok(blocks.has('third-block'));
  });

  it('normalizes CRLF input to LF', () => {
    const content = '# Title\r\n\r\n<!-- harness:local-start id=foo -->\r\nBody\r\n<!-- harness:local-end id=foo -->\r\n';
    const { blocks } = parseComposed(content);
    assert.ok(blocks.has('foo'));
    assert.deepEqual(blocks.get('foo').body, ['Body']);
  });

  it('accepts id with dots and hyphens', () => {
    const content = '<!-- harness:local-start id=my.block-id -->\n<!-- harness:local-end id=my.block-id -->';
    const { blocks } = parseComposed(content);
    assert.ok(blocks.has('my.block-id'));
  });
});

describe('serializeComposed — round-trip', () => {
  it('round-trip: parse → serialize → parse is idempotent', () => {
    const original = fixture('merge-success-multiple-blocks/current.md');
    const parsed1 = parseComposed(original);
    const serialized = serializeComposed(parsed1);
    const parsed2 = parseComposed(serialized);

    // Same number of blocks and same IDs
    assert.equal(parsed2.blocks.size, parsed1.blocks.size);
    for (const [id, b1] of parsed1.blocks) {
      assert.ok(parsed2.blocks.has(id), `Block ${id} missing in re-parsed result`);
      const b2 = parsed2.blocks.get(id);
      assert.deepEqual(b2.body, b1.body, `Body mismatch for block ${id}`);
    }
    // Same number of sections
    assert.equal(parsed2.sections.length, parsed1.sections.length);
  });

  it('round-trip reproduces LF-normalized content exactly', () => {
    const content = '# H\n\n<!-- harness:local-start id=x -->\nline\n<!-- harness:local-end id=x -->\n\nfooter\n';
    const serialized = serializeComposed(parseComposed(content));
    assert.equal(serialized, content);
  });

  it('round-trip on file with no blocks', () => {
    const content = 'No blocks here.\nJust plain text.\n';
    assert.equal(serializeComposed(parseComposed(content)), content);
  });
});

// ===========================================================================
// 3. Escape syntax (self-check 6)
// ===========================================================================

describe('parseComposed — escape syntax', () => {
  it('ZWSP-escaped marker inside code fence does NOT trigger ECOMPOSED_INCODEBLOCK', () => {
    const content = fixture('escape-zwsp-in-fence/template.md');
    // Should parse without throwing
    const { blocks, sections } = parseComposed(content);
    // No blocks should be registered (the escaped marker is not a real marker)
    assert.equal(blocks.size, 0);
  });

  it('HTML-entity-escaped marker inside code fence does NOT trigger ECOMPOSED_INCODEBLOCK', () => {
    const content = fixture('escape-htmlentity-in-fence/template.md');
    const { blocks } = parseComposed(content);
    assert.equal(blocks.size, 0);
  });

  it('ZWSP-escaped marker in normal prose does NOT trigger any error', () => {
    const zwsp = '\u200b';
    const content = `Some text with <${zwsp}!-- harness:local-start id=foo --> displayed as escape.\n`;
    const { blocks } = parseComposed(content);
    assert.equal(blocks.size, 0);
  });

  it('HTML-entity-escaped marker in normal prose does NOT trigger any error', () => {
    const content = 'See &lt;!-- harness:local-start id=foo --> for syntax.\n';
    const { blocks } = parseComposed(content);
    assert.equal(blocks.size, 0);
  });
});

// ===========================================================================
// 4. mergeComposed — fresh start
// ===========================================================================

describe('mergeComposed — fresh start', () => {
  it('fresh merge (empty current) uses template content, marks blocks seeded-empty', () => {
    const template = fixture('merge-success-fresh/template.md');
    const result = mergeComposed(template, '', { allowedBlockIds: ['custom-section'] });
    assert.ok(!result.content.includes('undefined'), 'content should not contain undefined');
    assert.equal(result.warnings.length, 0);
    // All blocks should be seeded-empty
    for (const b of result.blocks) {
      assert.equal(b.provenance, 'seeded-empty');
    }
  });

  it('fresh merge with null current string', () => {
    const template = '# Title\n\n<!-- harness:local-start id=foo -->\n<!-- harness:local-end id=foo -->\n';
    const result = mergeComposed(template, null, { allowedBlockIds: ['foo'] });
    assert.equal(result.blocks[0].provenance, 'seeded-empty');
  });
});

// ===========================================================================
// 5. mergeComposed — user-edited blocks
// ===========================================================================

describe('mergeComposed — user-edited blocks', () => {
  it('preserves user-authored block content', () => {
    const template = fixture('merge-success-user-edited/template.md');
    const current  = fixture('merge-success-user-edited/current.md');
    const result = mergeComposed(template, current, { allowedBlockIds: ['custom-section'] });
    assert.ok(result.content.includes('User-edited content in the block'));
    const b = result.blocks.find(x => x.id === 'custom-section');
    assert.equal(b.provenance, 'user-authored');
  });

  it('preserves all three blocks with correct provenance', () => {
    const template = fixture('merge-success-multiple-blocks/template.md');
    const current  = fixture('merge-success-multiple-blocks/current.md');
    const result = mergeComposed(template, current, {
      allowedBlockIds: ['first-block', 'second-block', 'third-block'],
    });
    assert.equal(result.blocks.length, 3);
    for (const b of result.blocks) {
      assert.equal(b.provenance, 'user-authored',
        `Expected user-authored for block ${b.id}`);
    }
    assert.ok(result.content.includes('First block content'));
    assert.ok(result.content.includes('Second block content'));
    assert.ok(result.content.includes('Third block content'));
  });

  it('output has LF line endings only (no CRLF)', () => {
    const template = fixture('merge-success-user-edited/template.md');
    const current  = fixture('merge-success-user-edited/current.md');
    const { content } = mergeComposed(template, current, { allowedBlockIds: ['custom-section'] });
    assert.ok(!content.includes('\r\n'), 'merged content must not contain CRLF');
    assert.ok(!content.includes('\r'), 'merged content must not contain bare CR');
  });
});

// ===========================================================================
// 6. mergeComposed — error: ECOMPOSED_DROPPED (self-check — 8th error code)
// ===========================================================================

describe('mergeComposed — error: ECOMPOSED_DROPPED', () => {
  it('throws ECOMPOSED_DROPPED when block in lock+template but absent from consumer', () => {
    const template = fixture('merge-error-dropped/template.md');
    const current  = fixture('merge-error-dropped/current.md');
    const lockRecords = [{ id: 'custom-block' }];
    assertMergeError(
      () => mergeComposed(template, current, { allowedBlockIds: ['custom-block'], lockRecords }),
      'ECOMPOSED_DROPPED',
      'dropped block should throw',
    );
  });

  it('does NOT throw ECOMPOSED_DROPPED when block exists in current', () => {
    const template = '<!-- harness:local-start id=keep -->\n<!-- harness:local-end id=keep -->\n';
    const current  = '<!-- harness:local-start id=keep -->\nbody\n<!-- harness:local-end id=keep -->\n';
    const lockRecords = [{ id: 'keep' }];
    // should not throw
    const result = mergeComposed(template, current, { allowedBlockIds: ['keep'], lockRecords });
    assert.ok(result.content.includes('body'));
  });
});

// ===========================================================================
// 7. mergeComposed — legacy fail-closed (self-check 3)
// ===========================================================================

describe('mergeComposed — legacy fail-closed (EMERGE_LEGACY_UNMAPPED)', () => {
  it('throws EMERGE_LEGACY_UNMAPPED when current has extra content (fixture)', () => {
    const template = fixture('merge-fail-legacy-unmapped/template.md');
    const current  = fixture('merge-fail-legacy-unmapped/current.md');
    assert.throws(
      () => mergeComposed(template, current, { allowedBlockIds: ['my-block'] }),
      (err) => {
        assert.ok(err instanceof ComposedMergeError);
        assert.equal(err.code, 'EMERGE_LEGACY_UNMAPPED');
        return true;
      },
      'legacy unmapped content should throw',
    );
  });

  it('throws EMERGE_LEGACY_UNMAPPED when legacyMapping has empty regions', () => {
    const template = fixture('merge-fail-legacy-unmapped/template.md');
    const current  = fixture('merge-fail-legacy-unmapped/current.md');
    assert.throws(
      () => mergeComposed(template, current, {
        allowedBlockIds: ['my-block'],
        legacyMapping: { regions: [] },
      }),
      (err) => err.code === 'EMERGE_LEGACY_UNMAPPED',
    );
  });
});

// ===========================================================================
// 8. mergeComposed — legacy with mapping (self-check 4)
// ===========================================================================

describe('mergeComposed — legacy with mapping', () => {
  it('succeeds with legacyMapping map_to_block, provenance = migrated-from-legacy', () => {
    const template = fixture('merge-success-legacy-mapped/template.md');
    const current  = fixture('merge-success-legacy-mapped/current.md');
    const mapping  = JSON.parse(fixture('merge-success-legacy-mapped/mapping.json'));
    const result = mergeComposed(template, current, {
      allowedBlockIds: ['my-block'],
      legacyMapping: mapping,
    });
    const b = result.blocks.find(x => x.id === 'my-block');
    assert.ok(b, 'my-block should be in result');
    assert.equal(b.provenance, 'migrated-from-legacy');
    // Content should contain the legacy text (mapped into the block)
    assert.ok(result.content.includes('SOME LEGACY CONTENT THAT IS NOT IN THE TEMPLATE'));
  });

  it('succeeds with legacyMapping discard, block content preserved from current', () => {
    const template = fixture('merge-success-legacy-discarded/template.md');
    const current  = fixture('merge-success-legacy-discarded/current.md');
    const mapping  = JSON.parse(fixture('merge-success-legacy-discarded/mapping.json'));
    const result = mergeComposed(template, current, {
      allowedBlockIds: ['my-block'],
      legacyMapping: mapping,
    });
    // Block should use current's body (user-authored), not the legacy discard content
    const b = result.blocks.find(x => x.id === 'my-block');
    assert.ok(b, 'my-block should be in result');
    // Content from current (User content) should be preserved
    assert.ok(result.content.includes('User content'));
    // Legacy content should NOT appear (was discarded from template sections)
    assert.ok(!result.content.includes('SOME LEGACY CONTENT THAT IS NOT IN THE TEMPLATE'));
  });
});

// ===========================================================================
// 10. mergeComposed — Fix #2: legacyMapping bijective validation
// ===========================================================================

describe('mergeComposed — Fix #2: legacyMapping bijective validation', () => {
  // Inline helpers: a template with two blocks and a current with two legacy regions.
  const twoBlockTemplate = [
    'Preamble',
    '<!-- harness:local-start id=b1 -->',
    '<!-- harness:local-end id=b1 -->',
    'Middle',
    '<!-- harness:local-start id=b2 -->',
    '<!-- harness:local-end id=b2 -->',
    'Footer',
    '',
  ].join('\n');

  const twoLegacyCurrent = [
    'Preamble',
    'LEGACY A',
    '<!-- harness:local-start id=b1 -->',
    'body1',
    '<!-- harness:local-end id=b1 -->',
    'Middle',
    'LEGACY B',
    '<!-- harness:local-start id=b2 -->',
    'body2',
    '<!-- harness:local-end id=b2 -->',
    'Footer',
    '',
  ].join('\n');

  const oneBlockTemplate = [
    'Preamble',
    '<!-- harness:local-start id=b1 -->',
    '<!-- harness:local-end id=b1 -->',
    'Footer',
    '',
  ].join('\n');

  const oneLegacyCurrent = [
    'Preamble',
    'LEGACY CONTENT',
    '<!-- harness:local-start id=b1 -->',
    'body1',
    '<!-- harness:local-end id=b1 -->',
    'Footer',
    '',
  ].join('\n');

  it('throws EMERGE_LEGACY_UNMAPPED when mapping content is unrelated to actual region', () => {
    const mapping = { regions: [{ action: 'discard', content: 'UNRELATED CONTENT' }] };
    assert.throws(
      () => mergeComposed(oneBlockTemplate, oneLegacyCurrent, {
        allowedBlockIds: ['b1'],
        legacyMapping: mapping,
      }),
      (err) => err instanceof ComposedMergeError && err.code === 'EMERGE_LEGACY_UNMAPPED',
    );
  });

  it('throws EMERGE_LEGACY_UNMAPPED when one of two legacy regions is not covered', () => {
    const mapping = {
      regions: [{ action: 'map_to_block', block_id: 'b1', content: 'LEGACY A' }],
    };
    assert.throws(
      () => mergeComposed(twoBlockTemplate, twoLegacyCurrent, {
        allowedBlockIds: ['b1', 'b2'],
        legacyMapping: mapping,
      }),
      (err) => err instanceof ComposedMergeError && err.code === 'EMERGE_LEGACY_UNMAPPED',
    );
  });

  it('throws EMERGE_LEGACY_BAD_MAPPING when mapping content has trailing whitespace', () => {
    const mapping = {
      regions: [{ action: 'discard', content: 'LEGACY CONTENT   ' }],
    };
    assert.throws(
      () => mergeComposed(oneBlockTemplate, oneLegacyCurrent, {
        allowedBlockIds: ['b1'],
        legacyMapping: mapping,
      }),
      (err) => err instanceof ComposedMergeError && err.code === 'EMERGE_LEGACY_BAD_MAPPING',
    );
  });

  it('throws EMERGE_LEGACY_BAD_MAPPING when map_to_block targets a nonexistent block_id', () => {
    const mapping = {
      regions: [{ action: 'map_to_block', block_id: 'nonexistent', content: 'LEGACY CONTENT' }],
    };
    assert.throws(
      () => mergeComposed(oneBlockTemplate, oneLegacyCurrent, {
        allowedBlockIds: ['b1'],
        legacyMapping: mapping,
      }),
      (err) => err instanceof ComposedMergeError && err.code === 'EMERGE_LEGACY_BAD_MAPPING',
    );
  });

  it('throws EMERGE_LEGACY_BAD_MAPPING when mapping has duplicate content entries', () => {
    const mapping = {
      regions: [
        { action: 'map_to_block', block_id: 'b1', content: 'LEGACY A' },
        { action: 'discard', content: 'LEGACY A' },
      ],
    };
    assert.throws(
      () => mergeComposed(twoBlockTemplate, twoLegacyCurrent, {
        allowedBlockIds: ['b1', 'b2'],
        legacyMapping: mapping,
      }),
      (err) => err instanceof ComposedMergeError && err.code === 'EMERGE_LEGACY_BAD_MAPPING',
    );
  });
});

// ===========================================================================
// 11. mergeComposed — Fix #3: allowedBlockIds enforcement
// ===========================================================================

describe('mergeComposed — Fix #3: allowedBlockIds enforcement', () => {
  it('throws ECOMPOSED_UNALLOWED_TEMPLATE_BLOCK when template block not in allowedBlockIds', () => {
    const template = '<!-- harness:local-start id=secret -->\n<!-- harness:local-end id=secret -->\n';
    assert.throws(
      () => mergeComposed(template, '', { allowedBlockIds: [] }),
      (err) => err instanceof ComposedMergeError && err.code === 'ECOMPOSED_UNALLOWED_TEMPLATE_BLOCK',
    );
  });

  it('throws ECOMPOSED_UNALLOWED_CURRENT_BLOCK when current block not in allowedBlockIds', () => {
    const template = '<!-- harness:local-start id=b1 -->\n<!-- harness:local-end id=b1 -->\n';
    const current = [
      '<!-- harness:local-start id=b1 -->',
      'body1',
      '<!-- harness:local-end id=b1 -->',
      '<!-- harness:local-start id=b2 -->',
      'body2',
      '<!-- harness:local-end id=b2 -->',
      '',
    ].join('\n');
    assert.throws(
      () => mergeComposed(template, current, { allowedBlockIds: ['b1'] }),
      (err) => err instanceof ComposedMergeError && err.code === 'ECOMPOSED_UNALLOWED_CURRENT_BLOCK',
    );
  });

  it('succeeds when all blocks are in allowedBlockIds', () => {
    const template = '<!-- harness:local-start id=b1 -->\n<!-- harness:local-end id=b1 -->\n';
    const current  = '<!-- harness:local-start id=b1 -->\nmy body\n<!-- harness:local-end id=b1 -->\n';
    const result = mergeComposed(template, current, { allowedBlockIds: ['b1'] });
    assert.ok(result.content.includes('my body'));
  });
});

describe('computeBlockRecords — blockEntry schema validation', () => {
  it('returns valid blockEntry records for user-authored blocks', () => {
    const template = fixture('merge-success-user-edited/template.md');
    const current  = fixture('merge-success-user-edited/current.md');
    const mergeResult = mergeComposed(template, current, { allowedBlockIds: ['custom-section'] });
    const records = computeBlockRecords(mergeResult, template);
    assert.ok(records.length > 0, 'should have at least one block record');
    for (const rec of records) {
      assertValidBlockEntry(rec);
    }
  });

  it('returns valid blockEntry records for seeded-empty blocks', () => {
    const template = fixture('merge-success-fresh/template.md');
    const mergeResult = mergeComposed(template, '', { allowedBlockIds: ['custom-section'] });
    const records = computeBlockRecords(mergeResult, template);
    for (const rec of records) {
      assertValidBlockEntry(rec);
    }
    const r = records.find(x => x.id === 'custom-section');
    assert.ok(r, 'custom-section record should exist');
    assert.equal(r.provenance, 'seeded-empty');
  });

  it('returns valid blockEntry records for migrated-from-legacy blocks', () => {
    const template = fixture('merge-success-legacy-mapped/template.md');
    const current  = fixture('merge-success-legacy-mapped/current.md');
    const mapping  = JSON.parse(fixture('merge-success-legacy-mapped/mapping.json'));
    const mergeResult = mergeComposed(template, current, {
      allowedBlockIds: ['my-block'],
      legacyMapping: mapping,
    });
    const records = computeBlockRecords(mergeResult, template);
    for (const rec of records) {
      assertValidBlockEntry(rec);
    }
    const r = records.find(x => x.id === 'my-block');
    assert.ok(r);
    assert.equal(r.provenance, 'migrated-from-legacy');
  });

  it('body_hash is SHA-256 hex of block body bytes (64 lowercase hex chars)', () => {
    const template = '<!-- harness:local-start id=hashed -->\n<!-- harness:local-end id=hashed -->\n';
    const current  = '<!-- harness:local-start id=hashed -->\nsome body content\n<!-- harness:local-end id=hashed -->\n';
    const mergeResult = mergeComposed(template, current, { allowedBlockIds: ['hashed'] });
    const records = computeBlockRecords(mergeResult, template);
    const rec = records[0];
    assert.match(rec.body_hash, /^[0-9a-f]{64}$/, 'body_hash must be 64 lowercase hex chars');
  });

  it('source_line_range start <= end and both >= 1', () => {
    const template = 'Line1\n<!-- harness:local-start id=lr -->\nbody\n<!-- harness:local-end id=lr -->\nLine5\n';
    const current  = 'Line1\n<!-- harness:local-start id=lr -->\nbody\n<!-- harness:local-end id=lr -->\nLine5\n';
    const mergeResult = mergeComposed(template, current, { allowedBlockIds: ['lr'] });
    const [rec] = computeBlockRecords(mergeResult, template);
    assert.ok(rec.source_line_range.start >= 1);
    assert.ok(rec.source_line_range.end >= rec.source_line_range.start);
  });
});

// ===========================================================================
// 10. LF line-ending invariant (self-check 7)
// ===========================================================================

describe('LF line-ending invariant', () => {
  it('mergeComposed output has no CRLF when template has CRLF', () => {
    const templateLF = '# Title\r\n\r\n<!-- harness:local-start id=x -->\r\n<!-- harness:local-end id=x -->\r\n';
    const { content } = mergeComposed(templateLF, '', { allowedBlockIds: ['x'] });
    assert.ok(!content.includes('\r'), 'output must not contain CR characters');
  });

  it('computeBlockRecords works correctly on CRLF input', () => {
    const template = '<!-- harness:local-start id=crlf -->\r\n<!-- harness:local-end id=crlf -->\r\n';
    const current  = '<!-- harness:local-start id=crlf -->\r\nsome content\r\n<!-- harness:local-end id=crlf -->\r\n';
    const mergeResult = mergeComposed(template, current, { allowedBlockIds: ['crlf'] });
    const records = computeBlockRecords(mergeResult, template);
    assert.equal(records.length, 1);
    assertValidBlockEntry(records[0]);
  });
});

// ===========================================================================
// Review #2 Bug #1: Multiset accounting for identical-content legacy regions
// ===========================================================================

describe('mergeComposed — Bug #1: multiset accounting for identical legacy regions', () => {
  // Template with one block, two distinct "separator" template lines so
  // two identical legacy regions are separated by a matching template line.
  const singleBlockTemplate = [
    'Prefix',
    '<!-- harness:local-start id=b1 -->',
    '<!-- harness:local-end id=b1 -->',
    'Footer',
    '',
  ].join('\n');

  // Template with anchoring lines to create separate legacy regions:
  //   Prefix / Middle / <block> / Suffix
  // Current inserts SAME before "Middle" and after "Middle" (before block).
  const twoSeparatorTemplate = [
    'Prefix',
    'Middle',
    '<!-- harness:local-start id=b1 -->',
    '<!-- harness:local-end id=b1 -->',
    'Suffix',
    '',
  ].join('\n');

  // Two identical legacy regions ("SAME" appears between Prefix–Middle and Middle–block).
  const twoIdenticalLegacyCurrent = [
    'Prefix',
    'SAME',
    'Middle',
    'SAME',
    '<!-- harness:local-start id=b1 -->',
    'body',
    '<!-- harness:local-end id=b1 -->',
    'Suffix',
    '',
  ].join('\n');

  // Three identical legacy regions (Prefix / SAME / Mid1 / SAME / Mid2 / SAME / block / Suffix).
  const threeSeparatorTemplate = [
    'Prefix',
    'Mid1',
    'Mid2',
    '<!-- harness:local-start id=b1 -->',
    '<!-- harness:local-end id=b1 -->',
    'Suffix',
    '',
  ].join('\n');

  const threeIdenticalLegacyCurrent = [
    'Prefix',
    'SAME',
    'Mid1',
    'SAME',
    'Mid2',
    'SAME',
    '<!-- harness:local-start id=b1 -->',
    'body',
    '<!-- harness:local-end id=b1 -->',
    'Suffix',
    '',
  ].join('\n');

  it('throws EMERGE_LEGACY_UNMAPPED when two identical actual regions have only one mapping entry', () => {
    const mapping = { regions: [{ action: 'discard', content: 'SAME' }] };
    assert.throws(
      () => mergeComposed(twoSeparatorTemplate, twoIdenticalLegacyCurrent, {
        allowedBlockIds: ['b1'],
        legacyMapping: mapping,
      }),
      (err) => err instanceof ComposedMergeError && err.code === 'EMERGE_LEGACY_UNMAPPED',
      'one mapping for two identical regions must throw EMERGE_LEGACY_UNMAPPED',
    );
  });

  it('succeeds when two identical actual regions have exactly two matching mapping entries', () => {
    const mapping = {
      regions: [
        { action: 'discard', content: 'SAME' },
        { action: 'discard', content: 'SAME' },
      ],
    };
    // Should not throw
    const result = mergeComposed(twoSeparatorTemplate, twoIdenticalLegacyCurrent, {
      allowedBlockIds: ['b1'],
      legacyMapping: mapping,
    });
    assert.ok(result.content.includes('body'));
  });

  it('throws EMERGE_LEGACY_UNMAPPED when three identical regions have only two mapping entries', () => {
    const mapping = {
      regions: [
        { action: 'discard', content: 'SAME' },
        { action: 'discard', content: 'SAME' },
      ],
    };
    assert.throws(
      () => mergeComposed(threeSeparatorTemplate, threeIdenticalLegacyCurrent, {
        allowedBlockIds: ['b1'],
        legacyMapping: mapping,
      }),
      (err) => err instanceof ComposedMergeError && err.code === 'EMERGE_LEGACY_UNMAPPED',
      'two mappings for three identical regions must throw EMERGE_LEGACY_UNMAPPED',
    );
  });

  it('throws EMERGE_LEGACY_BAD_MAPPING when one actual region has two identical mapping entries', () => {
    const mapping = {
      regions: [
        { action: 'discard', content: 'LEGACY CONTENT' },
        { action: 'discard', content: 'LEGACY CONTENT' },
      ],
    };
    // oneBlockTemplate / oneLegacyCurrent from the outer describe scope don't exist here,
    // so build inline equivalents.
    const tmpl = [
      'Preamble',
      '<!-- harness:local-start id=b1 -->',
      '<!-- harness:local-end id=b1 -->',
      'Footer',
      '',
    ].join('\n');
    const curr = [
      'Preamble',
      'LEGACY CONTENT',
      '<!-- harness:local-start id=b1 -->',
      'body1',
      '<!-- harness:local-end id=b1 -->',
      'Footer',
      '',
    ].join('\n');
    assert.throws(
      () => mergeComposed(tmpl, curr, { allowedBlockIds: ['b1'], legacyMapping: mapping }),
      (err) => err instanceof ComposedMergeError && err.code === 'EMERGE_LEGACY_BAD_MAPPING',
      'two mappings for one identical region must throw EMERGE_LEGACY_BAD_MAPPING',
    );
  });
});

// ===========================================================================
// Review #2 Bug #2: Action enum validation in legacyMapping
// ===========================================================================

describe('mergeComposed — Bug #2: action enum validation', () => {
  const tmpl = [
    'Preamble',
    '<!-- harness:local-start id=b1 -->',
    '<!-- harness:local-end id=b1 -->',
    'Footer',
    '',
  ].join('\n');
  const curr = [
    'Preamble',
    'LEGACY CONTENT',
    '<!-- harness:local-start id=b1 -->',
    'body1',
    '<!-- harness:local-end id=b1 -->',
    'Footer',
    '',
  ].join('\n');

  it('throws EMERGE_LEGACY_BAD_MAPPING for action typo "map-to-block"', () => {
    const mapping = { regions: [{ action: 'map-to-block', block_id: 'b1', content: 'LEGACY CONTENT' }] };
    assertMergeError(
      () => mergeComposed(tmpl, curr, { allowedBlockIds: ['b1'], legacyMapping: mapping }),
      'EMERGE_LEGACY_BAD_MAPPING',
    );
  });

  it('throws EMERGE_LEGACY_BAD_MAPPING for empty string action', () => {
    const mapping = { regions: [{ action: '', content: 'LEGACY CONTENT' }] };
    assertMergeError(
      () => mergeComposed(tmpl, curr, { allowedBlockIds: ['b1'], legacyMapping: mapping }),
      'EMERGE_LEGACY_BAD_MAPPING',
    );
  });

  it('throws EMERGE_LEGACY_BAD_MAPPING for unknown action "keep"', () => {
    const mapping = { regions: [{ action: 'keep', content: 'LEGACY CONTENT' }] };
    assertMergeError(
      () => mergeComposed(tmpl, curr, { allowedBlockIds: ['b1'], legacyMapping: mapping }),
      'EMERGE_LEGACY_BAD_MAPPING',
    );
  });

  it('throws EMERGE_LEGACY_BAD_MAPPING when action is "discard" but block_id is present', () => {
    const mapping = { regions: [{ action: 'discard', block_id: 'b1', content: 'LEGACY CONTENT' }] };
    assertMergeError(
      () => mergeComposed(tmpl, curr, { allowedBlockIds: ['b1'], legacyMapping: mapping }),
      'EMERGE_LEGACY_BAD_MAPPING',
    );
  });

  it('throws EMERGE_LEGACY_BAD_MAPPING when action is "discard" but block_id is null (per GPT-5.5 review #3 #1 — presence check, not nullness)', () => {
    const mapping = { regions: [{ action: 'discard', block_id: null, content: 'LEGACY CONTENT' }] };
    assertMergeError(
      () => mergeComposed(tmpl, curr, { allowedBlockIds: ['b1'], legacyMapping: mapping }),
      'EMERGE_LEGACY_BAD_MAPPING',
    );
  });

  it('throws EMERGE_LEGACY_BAD_MAPPING when action is "map_to_block" without block_id', () => {
    const mapping = { regions: [{ action: 'map_to_block', content: 'LEGACY CONTENT' }] };
    assertMergeError(
      () => mergeComposed(tmpl, curr, { allowedBlockIds: ['b1'], legacyMapping: mapping }),
      'EMERGE_LEGACY_BAD_MAPPING',
    );
  });

  it('throws EMERGE_LEGACY_BAD_MAPPING when action field is missing entirely', () => {
    const mapping = { regions: [{ content: 'LEGACY CONTENT' }] };
    assertMergeError(
      () => mergeComposed(tmpl, curr, { allowedBlockIds: ['b1'], legacyMapping: mapping }),
      'EMERGE_LEGACY_BAD_MAPPING',
    );
  });
});

// ===========================================================================
// Review #2 Bug #3: Duplicate map_to_block targets silently overwrite
// ===========================================================================

describe('mergeComposed — Bug #3: duplicate map_to_block block_id targets', () => {
  // Template with two blocks and a current file with two distinct legacy regions.
  const twoBlockTmpl = [
    'Prefix',
    '<!-- harness:local-start id=b1 -->',
    '<!-- harness:local-end id=b1 -->',
    'Middle',
    '<!-- harness:local-start id=b2 -->',
    '<!-- harness:local-end id=b2 -->',
    'Footer',
    '',
  ].join('\n');

  const twoLegacyCurr = [
    'Prefix',
    'LEGACY A',
    '<!-- harness:local-start id=b1 -->',
    'body1',
    '<!-- harness:local-end id=b1 -->',
    'Middle',
    'LEGACY B',
    '<!-- harness:local-start id=b2 -->',
    'body2',
    '<!-- harness:local-end id=b2 -->',
    'Footer',
    '',
  ].join('\n');

  it('throws EMERGE_LEGACY_BAD_MAPPING when two entries target the same block_id', () => {
    const mapping = {
      regions: [
        { action: 'map_to_block', block_id: 'b1', content: 'LEGACY A' },
        { action: 'map_to_block', block_id: 'b1', content: 'LEGACY B' },
      ],
    };
    assertMergeError(
      () => mergeComposed(twoBlockTmpl, twoLegacyCurr, {
        allowedBlockIds: ['b1', 'b2'],
        legacyMapping: mapping,
      }),
      'EMERGE_LEGACY_BAD_MAPPING',
      'two map_to_block entries to same block_id must throw EMERGE_LEGACY_BAD_MAPPING',
    );
  });

  it('succeeds when two entries target different block_ids', () => {
    const mapping = {
      regions: [
        { action: 'map_to_block', block_id: 'b1', content: 'LEGACY A' },
        { action: 'map_to_block', block_id: 'b2', content: 'LEGACY B' },
      ],
    };
    const result = mergeComposed(twoBlockTmpl, twoLegacyCurr, {
      allowedBlockIds: ['b1', 'b2'],
      legacyMapping: mapping,
    });
    assert.ok(result.content.includes('LEGACY A'));
    assert.ok(result.content.includes('LEGACY B'));
  });
});

// ===========================================================================
// 11. Fence edge-cases
// ===========================================================================

describe('parseComposed — fence edge cases', () => {
  it('backtick fence 3+ chars is recognised', () => {
    const content = '````\n<!-- harness:local-start id=x -->\n````\n';
    assertParseError(content, 'ECOMPOSED_INCODEBLOCK');
  });

  it('tilde fence is recognised', () => {
    const content = '~~~\n<!-- harness:local-end id=y -->\n~~~\n';
    assertParseError(content, 'ECOMPOSED_INCODEBLOCK');
  });

  it('fence with 1-3 leading spaces is recognised', () => {
    const content = '   ```\n<!-- harness:local-start id=z -->\n   ```\n';
    assertParseError(content, 'ECOMPOSED_INCODEBLOCK');
  });

  it('4 leading spaces is NOT a fence opener (it is an indented code block)', () => {
    // 4 spaces before ``` is NOT a fence — it is an indented code block
    // The content inside should still trigger INCODEBLOCK if it looks like a marker
    const content = '    <!-- harness:local-start id=indt -->';
    assertParseError(content, 'ECOMPOSED_INCODEBLOCK');
  });
});

// ===========================================================================
// 12. computeBlockRecords — accepts plain string (not MergeResult)
// ===========================================================================

describe('computeBlockRecords — string input', () => {
  it('accepts a plain merged content string', () => {
    const template = '<!-- harness:local-start id=p -->\n<!-- harness:local-end id=p -->\n';
    const merged   = '<!-- harness:local-start id=p -->\nbody\n<!-- harness:local-end id=p -->\n';
    const records = computeBlockRecords(merged, template);
    assert.equal(records.length, 1);
    // Without MergeResult, provenance is inferred from body comparison
    assert.equal(records[0].provenance, 'user-authored'); // body differs from template
  });

  it('infers seeded-empty when body matches template', () => {
    const template = '<!-- harness:local-start id=q -->\n\n<!-- harness:local-end id=q -->\n';
    const merged   = '<!-- harness:local-start id=q -->\n\n<!-- harness:local-end id=q -->\n';
    const records = computeBlockRecords(merged, template);
    assert.equal(records[0].provenance, 'seeded-empty');
  });
});

// ===========================================================================
// CS03d / LRN-020 — template_prose_hash + three-way state machine
// ===========================================================================

describe('CS03d — computeTemplateProseHash', () => {
  it('returns a 64-char lowercase hex SHA-256 of the template skeleton', () => {
    const template = '# Header\n\n<!-- harness:local-start id=foo -->\nbody\n<!-- harness:local-end id=foo -->\n\nfooter\n';
    const hash = computeTemplateProseHash(template);
    assert.match(hash, /^[0-9a-f]{64}$/);
  });

  it('is invariant to local-block body content (same skeleton -> same hash)', () => {
    const t1 = '# Header\n<!-- harness:local-start id=x -->\nA\n<!-- harness:local-end id=x -->\n';
    const t2 = '# Header\n<!-- harness:local-start id=x -->\nB\n<!-- harness:local-end id=x -->\n';
    assert.equal(computeTemplateProseHash(t1), computeTemplateProseHash(t2));
  });

  it('changes when the template prose changes (different non-block lines -> different hash)', () => {
    const t1 = '# Header v1\n<!-- harness:local-start id=x -->\n\n<!-- harness:local-end id=x -->\n';
    const t2 = '# Header v2\n<!-- harness:local-start id=x -->\n\n<!-- harness:local-end id=x -->\n';
    assert.notEqual(computeTemplateProseHash(t1), computeTemplateProseHash(t2));
  });

  it('is LF-normalized: CRLF input produces the same hash as LF input', () => {
    const tLF   = '# Header\n<!-- harness:local-start id=x -->\nA\n<!-- harness:local-end id=x -->\n';
    const tCRLF = '# Header\r\n<!-- harness:local-start id=x -->\r\nA\r\n<!-- harness:local-end id=x -->\r\n';
    assert.equal(computeTemplateProseHash(tLF), computeTemplateProseHash(tCRLF));
  });
});

describe('CS03d — mergeComposed three-way state machine (LRN-020)', () => {
  // Template v1: original prose
  const TEMPLATE_V1 = '# Doc\n\nIntro paragraph v1.\n\n<!-- harness:local-start id=foo -->\n\n<!-- harness:local-end id=foo -->\n\nFooter.\n';
  // Template v2: prose evolved (intro paragraph changed)
  const TEMPLATE_V2 = '# Doc\n\nIntro paragraph v2 (improved wording).\n\n<!-- harness:local-start id=foo -->\n\n<!-- harness:local-end id=foo -->\n\nFooter.\n';

  // Consumer file: untouched skeleton (matches v1 prose), block customized
  const CONSUMER_UNTOUCHED_PROSE = '# Doc\n\nIntro paragraph v1.\n\n<!-- harness:local-start id=foo -->\nMy custom block content\n<!-- harness:local-end id=foo -->\n\nFooter.\n';
  // Consumer file: edited prose (intro paragraph differs from BOTH v1 and v2)
  const CONSUMER_EDITED_PROSE = '# Doc\n\nIntro paragraph EDITED BY USER.\n\n<!-- harness:local-start id=foo -->\nMy custom block content\n<!-- harness:local-end id=foo -->\n\nFooter.\n';

  const v1Hash = computeTemplateProseHash(TEMPLATE_V1);

  it('case (a): template prose evolved, consumer untouched -> auto-adopts new template prose; preserves block', () => {
    const result = mergeComposed(TEMPLATE_V2, CONSUMER_UNTOUCHED_PROSE, {
      allowedBlockIds: ['foo'],
      lockRecords: [{ id: 'foo' }],
      lockTemplateProseHash: v1Hash,
    });
    // Adopts v2 prose
    assert.ok(result.content.includes('Intro paragraph v2 (improved wording).'));
    assert.ok(!result.content.includes('Intro paragraph v1.'));
    // Preserves consumer block
    assert.ok(result.content.includes('My custom block content'));
    // Returns the new (v2) hash for lock recording
    assert.equal(result.templateProseHash, computeTemplateProseHash(TEMPLATE_V2));
  });

  it('case (b): template prose evolved, consumer ALSO edited prose -> EMERGE_LEGACY_UNMAPPED (fail-closed retained)', () => {
    assert.throws(
      () => mergeComposed(TEMPLATE_V2, CONSUMER_EDITED_PROSE, {
        allowedBlockIds: ['foo'],
        lockRecords: [{ id: 'foo' }],
        lockTemplateProseHash: v1Hash,
      }),
      (err) => err instanceof ComposedMergeError && err.code === 'EMERGE_LEGACY_UNMAPPED',
    );
  });

  it('case (c): bootstrap — prior lock exists but no template_prose_hash (pre-v0.2.0) -> silent auto-adopt + new hash recorded', () => {
    const result = mergeComposed(TEMPLATE_V2, CONSUMER_UNTOUCHED_PROSE, {
      allowedBlockIds: ['foo'],
      lockRecords: [{ id: 'foo' }],
      lockTemplateProseHash: null,  // pre-v0.2.0 lock format
    });
    assert.ok(result.content.includes('Intro paragraph v2'));
    assert.ok(result.content.includes('My custom block content'));
    assert.equal(result.templateProseHash, computeTemplateProseHash(TEMPLATE_V2));
  });

  it('case (c) bootstrap: even when consumer edited prose, pre-v0.2.0 silently auto-adopts (acceptable risk per CS03d D4)', () => {
    // This is the documented trade-off for the upgrade path. Existing
    // consumers (gwn, sub-invaders) have unedited template prose; for them
    // this case never fires in practice.
    const result = mergeComposed(TEMPLATE_V2, CONSUMER_EDITED_PROSE, {
      allowedBlockIds: ['foo'],
      lockRecords: [{ id: 'foo' }],
      lockTemplateProseHash: null,
    });
    // Auto-adopts v2 prose silently (the consumer's edits to non-block prose are dropped).
    assert.ok(result.content.includes('Intro paragraph v2'));
    assert.ok(!result.content.includes('Intro paragraph EDITED BY USER'));
    assert.ok(result.content.includes('My custom block content'));
  });

  it('case (d): no prior lock at all (lockRecords=null) preserves v0.1.x fail-closed behavior on prose divergence', () => {
    // Distinct from case (c): no lock entry exists at all (fresh consumer
    // with extra prose), so we cannot safely silently auto-adopt — could
    // erase real user data.
    assert.throws(
      () => mergeComposed(TEMPLATE_V2, CONSUMER_UNTOUCHED_PROSE, {
        allowedBlockIds: ['foo'],
        lockRecords: null,
        lockTemplateProseHash: null,
      }),
      (err) => err instanceof ComposedMergeError && err.code === 'EMERGE_LEGACY_UNMAPPED',
    );
  });

  it('skeleton match (template prose unchanged): no-op merge; returns current template hash', () => {
    const result = mergeComposed(TEMPLATE_V1, CONSUMER_UNTOUCHED_PROSE, {
      allowedBlockIds: ['foo'],
      lockRecords: [{ id: 'foo' }],
      lockTemplateProseHash: v1Hash,
    });
    assert.ok(result.content.includes('Intro paragraph v1.'));
    assert.ok(result.content.includes('My custom block content'));
    assert.equal(result.templateProseHash, v1Hash);
  });

  it('fresh start (empty current file) returns templateProseHash for the new lock', () => {
    const result = mergeComposed(TEMPLATE_V1, '', {
      allowedBlockIds: ['foo'],
    });
    assert.equal(result.templateProseHash, v1Hash);
  });
});
