import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const schema = JSON.parse(readFileSync(path.join(repoRoot, 'schemas', 'harness.config.schema.json'), 'utf8'));

function compile() {
  const ajv = new Ajv2020({ strict: false, validateSchema: false });
  addFormats(ajv);
  return ajv.compile(schema);
}

function minimalConfig() {
  return {
    version: 'v0.1.0',
    project: { name: 'fixture', agent_suffix: 'fx' },
  };
}

describe('harness.config review_gates schema', () => {
  it('accepts the CS51 reviews gate knobs', () => {
    const validate = compile();
    const cfg = {
      ...minimalConfig(),
      reviews: {
        enforce_gates: true,
        require_copilot_review: true,
        copilot_reviewer_slug: 'copilot-pull-request-reviewer[bot]',
        high_risk_clickstops: ['CS03', 'CS15a'],
      },
    };

    assert.equal(validate(cfg), true, JSON.stringify(validate.errors));
  });

  it('accepts the CS38a PASS gate set', () => {
    const validate = compile();
    const cfg = {
      ...minimalConfig(),
      review_gates: {
        enabled: true,
        copilot_required: true,
        gate_set: ['B1', 'A3', 'A4', 'A5', 'A16', 'A6'],
      },
    };

    assert.equal(validate(cfg), true, JSON.stringify(validate.errors));
  });

  it('accepts configs without review_gates', () => {
    const validate = compile();

    assert.equal(validate(minimalConfig()), true, JSON.stringify(validate.errors));
  });

  it('rejects unknown gate short names', () => {
    const validate = compile();
    const cfg = {
      ...minimalConfig(),
      review_gates: {
        enabled: true,
        copilot_required: true,
        gate_set: ['B1', 'X99'],
      },
    };

    assert.equal(validate(cfg), false);
    assert.match(JSON.stringify(validate.errors), /gate_set/);
  });

  it('rejects non-boolean enabled values', () => {
    const validate = compile();
    const cfg = {
      ...minimalConfig(),
      review_gates: {
        enabled: 'true',
        copilot_required: true,
        gate_set: ['B1'],
      },
    };

    assert.equal(validate(cfg), false);
    assert.match(JSON.stringify(validate.errors), /boolean/);
  });

  it('rejects invalid high-risk clickstop ids', () => {
    const validate = compile();
    const cfg = {
      ...minimalConfig(),
      reviews: {
        high_risk_clickstops: ['cs3'],
      },
    };

    assert.equal(validate(cfg), false);
    assert.match(JSON.stringify(validate.errors), /high_risk_clickstops/);
  });
});
