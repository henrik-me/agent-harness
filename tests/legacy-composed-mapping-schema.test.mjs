/**
 * tests/legacy-composed-mapping-schema.test.mjs — CS03e / LRN-019
 *
 * Validates that schemas/legacy-composed-mapping.schema.json correctly
 * accepts well-formed mappings and rejects malformed ones, mirroring the
 * runtime rules enforced by lib/composed.mjs `validateLegacyMapping`.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const fixturesDir = path.join(__dirname, 'fixtures', 'cs03e');

const AjvCtor = Ajv2020.default ?? Ajv2020;
const addFormatsFn = addFormats.default ?? addFormats;

const ajv = new AjvCtor({ strict: false });
addFormatsFn(ajv);
const schema = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'schemas', 'legacy-composed-mapping.schema.json'), 'utf8'),
);
const validate = ajv.compile(schema);

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), 'utf8'));
}

describe('legacy-composed-mapping schema — valid fixtures', () => {
  it('accepts valid-minimal (single discard region)', () => {
    const ok = validate(loadFixture('valid-minimal.json'));
    assert.equal(ok, true, JSON.stringify(validate.errors));
  });

  it('accepts valid-mixed (one map_to_block + one discard)', () => {
    const ok = validate(loadFixture('valid-mixed.json'));
    assert.equal(ok, true, JSON.stringify(validate.errors));
  });

  it('accepts the canonical example file under examples/', () => {
    const example = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'examples', 'legacy-composed-mapping.example.json'), 'utf8'),
    );
    const ok = validate(example);
    assert.equal(ok, true, JSON.stringify(validate.errors));
  });
});

describe('legacy-composed-mapping schema — invalid fixtures', () => {
  it('rejects invalid-missing-regions (no `regions` key)', () => {
    const ok = validate(loadFixture('invalid-missing-regions.json'));
    assert.equal(ok, false);
    assert.ok(
      validate.errors.some(e => e.message?.includes("must have required property 'regions'")),
      `Expected required-property error; got ${JSON.stringify(validate.errors)}`,
    );
  });

  it('rejects invalid-bad-action ("drop" not in enum)', () => {
    const ok = validate(loadFixture('invalid-bad-action.json'));
    assert.equal(ok, false);
    assert.ok(
      validate.errors.some(e => e.keyword === 'enum'),
      `Expected enum error; got ${JSON.stringify(validate.errors)}`,
    );
  });

  it('rejects invalid-map-without-block-id (action=map_to_block but no block_id)', () => {
    const ok = validate(loadFixture('invalid-map-without-block-id.json'));
    assert.equal(ok, false);
    assert.ok(
      validate.errors.some(e =>
        e.keyword === 'required' && e.params?.missingProperty === 'block_id'
      ),
      `Expected required block_id error; got ${JSON.stringify(validate.errors)}`,
    );
  });

  it('rejects invalid-discard-with-block-id (action=discard but block_id present)', () => {
    const ok = validate(loadFixture('invalid-discard-with-block-id.json'));
    assert.equal(ok, false);
    // The conditional `not: { required: [block_id] }` produces an error in the
    // allOf chain. Just assert overall failure rather than coupling to Ajv's
    // exact error shape for nested if/then/not.
  });

  it('rejects invalid-bad-block-id-pattern (uppercase letters)', () => {
    const ok = validate(loadFixture('invalid-bad-block-id-pattern.json'));
    assert.equal(ok, false);
    assert.ok(
      validate.errors.some(e => e.keyword === 'pattern'),
      `Expected pattern error; got ${JSON.stringify(validate.errors)}`,
    );
  });

  it('rejects invalid-empty-regions (regions: [] violates minItems:1, mirrors runtime EMERGE_LEGACY_UNMAPPED)', () => {
    const ok = validate(loadFixture('invalid-empty-regions.json'));
    assert.equal(ok, false);
    assert.ok(
      validate.errors.some(e => e.keyword === 'minItems'),
      `Expected minItems error; got ${JSON.stringify(validate.errors)}`,
    );
  });

  it('rejects invalid-region-missing-content (per-region content is required)', () => {
    const ok = validate(loadFixture('invalid-region-missing-content.json'));
    assert.equal(ok, false);
    assert.ok(
      validate.errors.some(e =>
        e.keyword === 'required' && e.params?.missingProperty === 'content'
      ),
      `Expected required content error; got ${JSON.stringify(validate.errors)}`,
    );
  });
});

describe('legacy-composed-mapping schema — schema/runtime parity (CS03e R2)', () => {
  it('accepts valid-region-with-extra-key (regionEntry has no additionalProperties:false; runtime tolerates extra keys)', () => {
    const ok = validate(loadFixture('valid-region-with-extra-key.json'));
    assert.equal(ok, true, JSON.stringify(validate.errors));
  });

  it('accepts valid-root-with-extra-key (root has no additionalProperties:false; runtime only inspects regions)', () => {
    const ok = validate(loadFixture('valid-root-with-extra-key.json'));
    assert.equal(ok, true, JSON.stringify(validate.errors));
  });
});

describe('legacy-composed-mapping schema — schema document itself', () => {
  it('is a valid Draft-2020-12 schema (validateSchema:true)', () => {
    const checker = new AjvCtor({ strict: false, validateSchema: true });
    addFormatsFn(checker);
    const valid = checker.validateSchema(schema);
    assert.equal(valid, true, JSON.stringify(checker.errors));
  });

  it('compiles via Ajv2020 without throwing', () => {
    const compiler = new AjvCtor({ strict: false });
    addFormatsFn(compiler);
    assert.doesNotThrow(() => compiler.compile(schema));
  });
});
