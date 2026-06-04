/**
 * tests/cs60-parse-implementer-models.test.mjs — LRN-132 parser regressions.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { parseImplementerModels } from '../lib/review.mjs';

describe('CS60 parseImplementerModels regressions', () => {
  it('parses implementer models from Model audit text without treating reviewer model as implementer', () => {
    const markdown = [
      '# CS60',
      '',
      '## Model audit',
      '',
      'Implementer models: claude-opus-4.8',
      'Reviewer model: gpt-5.5',
      '',
    ].join('\n');

    const models = parseImplementerModels(markdown);
    assert.equal(models.has('claude-opus-4.8'), true);
    assert.equal(models.has('gpt-5.5'), false);
  });

  it('ignores free prose reviewer model declarations outside Model audit', () => {
    const models = parseImplementerModels('Reviewer model = gpt-5.5\n');

    assert.deepEqual([...models], []);
  });

  it('still parses genuine implementer-model declarations', () => {
    const models = parseImplementerModels('implementer-model = claude-sonnet-4.6\n');

    assert.equal(models.has('claude-sonnet-4.6'), true);
  });

  it('still parses Plan author model(s) declarations', () => {
    const models = parseImplementerModels('Plan author model(s): claude-haiku-4.5\n');

    assert.equal(models.has('claude-haiku-4.5'), true);
  });
});
