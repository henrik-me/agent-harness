/**
 * tests/lib-composed-from-managed.test.mjs — CS38a R2 B3.
 *
 * mergeComposedFromManaged: composed-merge variant for files transitioning
 * from `managed.files` to `composed.files` via `_inherited_class: 'managed'`.
 *
 * Tests the consumer-prose-preserving semantic (vs. mergeComposed's
 * template-prose-canonical semantic).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeComposedFromManaged, ComposedMergeError } from '../lib/composed.mjs';

const TEMPLATE = [
  '# Pull Request',
  '',
  '## Summary',
  '',
  '<!-- harness:local-start id=pull-request.review-evidence -->',
  '## Model audit',
  '',
  '| Field | Value |',
  '| --- | --- |',
  '| Implementer models | _<list>_ |',
  '<!-- harness:local-end id=pull-request.review-evidence -->',
  '',
].join('\n');

describe('mergeComposedFromManaged — fresh start', () => {
  it('renders the template verbatim when current is empty', () => {
    const result = mergeComposedFromManaged(TEMPLATE, '', {
      allowedBlockIds: ['pull-request.review-evidence'],
    });
    assert.equal(result.content, TEMPLATE);
    assert.equal(result.blocks.length, 1);
    assert.equal(result.blocks[0].id, 'pull-request.review-evidence');
    assert.equal(result.blocks[0].provenance, 'seeded-empty');
    assert.equal(result.warnings.length, 0);
    assert.match(result.templateProseHash, /^[0-9a-f]{64}$/);
  });

  it('also accepts current === null as fresh start', () => {
    const result = mergeComposedFromManaged(TEMPLATE, null, {
      allowedBlockIds: ['pull-request.review-evidence'],
    });
    assert.equal(result.content, TEMPLATE);
  });
});

describe('mergeComposedFromManaged — consumer has customized prose, no marker blocks', () => {
  it('preserves consumer prose verbatim and appends the template marker block', () => {
    const consumerFile = [
      '# My Custom PR Template',
      '',
      '## Consumer-Specific Section',
      '',
      'Org-specific guidance that must be preserved on every sync.',
      '',
      '## Checklist',
      '- [ ] item A',
      '- [ ] item B',
      '',
    ].join('\n');

    const result = mergeComposedFromManaged(TEMPLATE, consumerFile, {
      allowedBlockIds: ['pull-request.review-evidence'],
      targetForWarning: '.github/pull_request_template.md',
    });

    // Consumer's prose preserved verbatim
    assert.ok(
      result.content.startsWith('# My Custom PR Template'),
      'consumer header must be preserved verbatim'
    );
    assert.ok(
      result.content.includes('Org-specific guidance that must be preserved on every sync.'),
      'consumer prose must be preserved verbatim'
    );
    assert.ok(
      result.content.includes('- [ ] item A'),
      'consumer checklist must be preserved verbatim'
    );

    // Template marker block was appended
    assert.ok(
      result.content.includes('<!-- harness:local-start id=pull-request.review-evidence -->'),
      'template marker start must be present'
    );
    assert.ok(
      result.content.includes('<!-- harness:local-end id=pull-request.review-evidence -->'),
      'template marker end must be present'
    );
    assert.ok(
      result.content.includes('## Model audit'),
      'template block body must be present'
    );

    // Block records reflect the splice
    assert.equal(result.blocks.length, 1);
    assert.equal(result.blocks[0].id, 'pull-request.review-evidence');
    assert.equal(result.blocks[0].provenance, 'seeded-empty');

    // Warning surfaced for the splice
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /appended at end/i);
    assert.match(result.warnings[0], /\.github\/pull_request_template\.md/);
  });
});

describe('mergeComposedFromManaged — subsequent sync (consumer has the block)', () => {
  it('preserves consumer-edited block body AND consumer prose unchanged', () => {
    const consumerFile = [
      '# My Custom PR Template',
      '',
      '## Consumer-Specific Section',
      '',
      'Org-specific guidance.',
      '',
      '<!-- harness:local-start id=pull-request.review-evidence -->',
      '## Model audit',
      '',
      '| Field | Value |',
      '| --- | --- |',
      '| Implementer models | claude-opus-4.7 |',
      '| Reviewer model | gpt-5.5 |',
      '<!-- harness:local-end id=pull-request.review-evidence -->',
      '',
    ].join('\n');

    const result = mergeComposedFromManaged(TEMPLATE, consumerFile, {
      allowedBlockIds: ['pull-request.review-evidence'],
    });

    // Consumer's customized block body is preserved (not overwritten by template's placeholder)
    assert.ok(
      result.content.includes('| Implementer models | claude-opus-4.7 |'),
      'consumer-filled block body must be preserved across syncs'
    );
    assert.ok(
      result.content.includes('| Reviewer model | gpt-5.5 |'),
      'consumer-added block rows must be preserved'
    );

    // Consumer's prose preserved
    assert.ok(
      result.content.startsWith('# My Custom PR Template'),
      'consumer prose must be preserved verbatim'
    );
    assert.ok(
      result.content.includes('Org-specific guidance.'),
      'consumer prose must be preserved verbatim'
    );

    // No splice warning (block already in current)
    assert.equal(result.warnings.length, 0);

    // Block recorded as user-authored (body differs from template placeholder)
    assert.equal(result.blocks.length, 1);
    assert.equal(result.blocks[0].id, 'pull-request.review-evidence');
    assert.equal(result.blocks[0].provenance, 'user-authored');
  });

  it('records seeded-empty provenance when consumer body matches template body exactly', () => {
    const consumerFile = [
      '# My PR',
      '',
      '<!-- harness:local-start id=pull-request.review-evidence -->',
      '## Model audit',
      '',
      '| Field | Value |',
      '| --- | --- |',
      '| Implementer models | _<list>_ |',
      '<!-- harness:local-end id=pull-request.review-evidence -->',
      '',
    ].join('\n');

    const result = mergeComposedFromManaged(TEMPLATE, consumerFile, {
      allowedBlockIds: ['pull-request.review-evidence'],
    });

    assert.equal(result.blocks[0].provenance, 'seeded-empty');
  });
});

describe('mergeComposedFromManaged — allowedBlockIds enforcement', () => {
  it('throws ECOMPOSED_UNALLOWED_TEMPLATE_BLOCK when template has a non-allowed block', () => {
    const result = (() => {
      try {
        mergeComposedFromManaged(TEMPLATE, '', { allowedBlockIds: ['some-other-id'] });
      } catch (err) {
        return err;
      }
      return null;
    })();
    assert.ok(result instanceof ComposedMergeError, 'must throw ComposedMergeError');
    assert.equal(result.code, 'ECOMPOSED_UNALLOWED_TEMPLATE_BLOCK');
  });

  it('throws ECOMPOSED_UNALLOWED_CURRENT_BLOCK when current has a non-allowed block', () => {
    const consumerFile = [
      '# PR',
      '<!-- harness:local-start id=rogue-block -->',
      'unauthorized content',
      '<!-- harness:local-end id=rogue-block -->',
    ].join('\n');

    const result = (() => {
      try {
        mergeComposedFromManaged(TEMPLATE, consumerFile, {
          allowedBlockIds: ['pull-request.review-evidence'],
        });
      } catch (err) {
        return err;
      }
      return null;
    })();
    assert.ok(result instanceof ComposedMergeError, 'must throw ComposedMergeError');
    assert.equal(result.code, 'ECOMPOSED_UNALLOWED_CURRENT_BLOCK');
  });
});

describe('mergeComposedFromManaged — bypasses EMERGE_LEGACY_UNMAPPED', () => {
  // The whole point of this function: a consumer whose previously-managed file
  // diverges from the template skeleton must NOT fail. mergeComposed throws
  // EMERGE_LEGACY_UNMAPPED in that case; mergeComposedFromManaged must not.
  it('never throws EMERGE_LEGACY_UNMAPPED regardless of skeleton divergence', () => {
    const consumerFile = [
      '# Totally different header from the template',
      '',
      'Completely different prose. No matching content with the template skeleton at all.',
      '',
    ].join('\n');

    // Should not throw
    const result = mergeComposedFromManaged(TEMPLATE, consumerFile, {
      allowedBlockIds: ['pull-request.review-evidence'],
    });

    assert.ok(result.content.includes('Totally different header'));
    assert.ok(result.content.includes('Completely different prose.'));
    assert.ok(result.content.includes('<!-- harness:local-start id=pull-request.review-evidence -->'));
  });
});
