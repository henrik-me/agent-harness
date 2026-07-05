/**
 * tests/cs89-hash-marker.test.mjs — CS89.
 *
 * Unit tests for the additive comment-safe `#`-marker form in lib/composed.mjs:
 * whole-line start/end pairing, id extraction, serialize round-trip, the
 * HTML-form regression (unchanged), the mid-line / bad-id / structural
 * fail-closed errors, and mixed HTML + `#` files.
 *
 * Run: node --test tests/cs89-hash-marker.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseComposed,
  serializeComposed,
  ComposedParseError,
} from '../lib/composed.mjs';

const NL = '\n';

describe('CS89 #-marker — parsing & pairing', () => {
  it('pairs a whole-line #-marker start/end and extracts the id', () => {
    const src = [
      '# CODEOWNERS',
      '* @owner',
      '',
      '# harness:local-start id=codeowners.project',
      '/docs/ @docs-team',
      '# harness:local-end id=codeowners.project',
      '',
    ].join(NL);
    const parsed = parseComposed(src, { filename: 'CODEOWNERS' });
    assert.deepEqual([...parsed.blocks.keys()], ['codeowners.project']);
    const block = parsed.blocks.get('codeowners.project');
    assert.deepEqual(block.body, ['/docs/ @docs-team']);
    assert.equal(block.startMarker, '# harness:local-start id=codeowners.project');
    assert.equal(block.endMarker, '# harness:local-end id=codeowners.project');
  });

  it('round-trips a #-marked block through serializeComposed (byte-identical)', () => {
    const src = [
      '# top',
      '# harness:local-start id=codeowners.project',
      '/x @a',
      '/y @b',
      '# harness:local-end id=codeowners.project',
      '',
    ].join(NL);
    assert.equal(serializeComposed(parseComposed(src)), src);
  });

  it('accepts hyphen/dot ids (e.g. codeowners.project, a-b.c)', () => {
    const src = [
      '# harness:local-start id=a-b.c',
      'body',
      '# harness:local-end id=a-b.c',
    ].join(NL);
    assert.ok(parseComposed(src).blocks.has('a-b.c'));
  });

  it('tolerates trailing whitespace after a #-marker (whole-line strip)', () => {
    const src = [
      '# harness:local-start id=codeowners.project   ',
      'x',
      '# harness:local-end id=codeowners.project\t',
    ].join(NL);
    assert.ok(parseComposed(src).blocks.has('codeowners.project'));
  });
});

describe('CS89 #-marker — HTML-form regression (unchanged)', () => {
  it('still parses an HTML-comment block and round-trips it', () => {
    const src = [
      '# Heading',
      '<!-- harness:local-start id=foo.bar -->',
      'consumer content',
      '<!-- harness:local-end id=foo.bar -->',
      '',
    ].join(NL);
    const parsed = parseComposed(src);
    assert.deepEqual([...parsed.blocks.keys()], ['foo.bar']);
    assert.equal(serializeComposed(parsed), src);
  });

  it('still treats HTML escape forms (ZWSP / &lt;) as non-markers (no block, no throw)', () => {
    const src = [
      'prose with <\u200b!-- harness:local-start id=x --> escaped',
      'and &lt;!-- harness:local-end id=x --> entity',
    ].join(NL);
    const parsed = parseComposed(src);
    assert.equal(parsed.blocks.size, 0);
  });
});

describe('CS89 #-marker — mixed HTML + # file', () => {
  it('parses an HTML block and a #-block in the same file', () => {
    const src = [
      '<!-- harness:local-start id=html.block -->',
      'h',
      '<!-- harness:local-end id=html.block -->',
      '# harness:local-start id=hash.block',
      'c',
      '# harness:local-end id=hash.block',
    ].join(NL);
    const parsed = parseComposed(src);
    assert.deepEqual([...parsed.blocks.keys()].sort(), ['hash.block', 'html.block']);
    assert.equal(serializeComposed(parsed), src);
  });
});

describe('CS89 #-marker — fail-closed errors', () => {
  /** @returns {string|null} the ComposedParseError code, or null if no throw. */
  function code(src) {
    try {
      parseComposed(src);
      return null;
    } catch (e) {
      assert.ok(e instanceof ComposedParseError, `expected ComposedParseError, got ${e}`);
      return e.code;
    }
  }

  it('a #-marker embedded mid-line → ECOMPOSED_MIDLINE', () => {
    assert.equal(code('/foo @a # harness:local-start id=x'), 'ECOMPOSED_MIDLINE');
  });

  it('a #-marker with an invalid id → ECOMPOSED_BADID', () => {
    const src = [
      '# harness:local-start id=Bad_Id',
      'x',
      '# harness:local-end id=Bad_Id',
    ].join(NL);
    assert.equal(code(src), 'ECOMPOSED_BADID');
  });

  it('an unclosed #-block → ECOMPOSED_UNCLOSED', () => {
    assert.equal(code('# harness:local-start id=codeowners.project\nx'), 'ECOMPOSED_UNCLOSED');
  });

  it('an orphan #-end marker → ECOMPOSED_ORPHANEND', () => {
    assert.equal(code('* @a\n# harness:local-end id=codeowners.project'), 'ECOMPOSED_ORPHANEND');
  });

  it('duplicate #-block ids → ECOMPOSED_DUPID', () => {
    const src = [
      '# harness:local-start id=codeowners.project',
      'a',
      '# harness:local-end id=codeowners.project',
      '# harness:local-start id=codeowners.project',
      'b',
      '# harness:local-end id=codeowners.project',
    ].join(NL);
    assert.equal(code(src), 'ECOMPOSED_DUPID');
  });

  it('nested #-blocks → ECOMPOSED_NESTED', () => {
    const src = [
      '# harness:local-start id=a.one',
      '# harness:local-start id=b.two',
      'x',
      '# harness:local-end id=b.two',
      '# harness:local-end id=a.one',
    ].join(NL);
    assert.equal(code(src), 'ECOMPOSED_NESTED');
  });
});
