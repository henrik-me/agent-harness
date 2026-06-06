/**
 * tests/cs61-reviews-policy-reader.test.mjs — Tests for the shared
 * reviews-policy reader (CS61, applying LRN-145).
 *
 * Covers: default-when-absent, fail-closed-on-malformed (each reviews field),
 * explicit-missing-config, schema-default parity, and subtree-only validation.
 *
 * Run: node --test tests/cs61-reviews-policy-reader.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { loadReviewsPolicy, ReviewsConfigError } from '../lib/reviews-policy.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(__dirname, '..', 'schemas', 'harness.config.schema.json');

function schemaReviewsDefaults() {
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  const props = schema.properties.reviews.properties;
  const defaults = {};
  for (const [key, spec] of Object.entries(props)) {
    if (Object.prototype.hasOwnProperty.call(spec, 'default')) {
      defaults[key] = spec.default;
    }
  }
  return defaults;
}

// Scratch dirs live under os.tmpdir(), never REPO_ROOT (LRN-094/CS25:
// REPO_ROOT writes race with check-text-encoding's recursive walk under
// parallel `node --test`).
async function makeTmpDir(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeConfigFile(dir, value) {
  const p = path.join(dir, 'harness.config.json');
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return p;
}

// --- default-when-absent ---------------------------------------------------

test('returns all schema defaults when the default-path config is absent', async (t) => {
  const cwd = await makeTmpDir('cs61-reader-absent-');
  t.after(() => rm(cwd, { recursive: true, force: true }));

  const policy = loadReviewsPolicy({ cwd });
  assert.deepEqual(policy, schemaReviewsDefaults());
});

test('returns all schema defaults when reviews key is absent', async (t) => {
  const cwd = await makeTmpDir('cs61-reader-no-reviews-');
  t.after(() => rm(cwd, { recursive: true, force: true }));

  await writeConfigFile(cwd, { version: 'v0.1.0', project: { name: 'x' } });
  const policy = loadReviewsPolicy({ cwd });
  assert.deepEqual(policy, schemaReviewsDefaults());
});

test('schema-default parity: reader all-defaults equals schema declared defaults (R1 guard)', async (t) => {
  const cwd = await makeTmpDir('cs61-reader-parity-');
  t.after(() => rm(cwd, { recursive: true, force: true }));

  const policy = loadReviewsPolicy({ cwd });
  const expected = schemaReviewsDefaults();
  // Every schema-declared default field is present in the reader output.
  for (const key of Object.keys(expected)) {
    assert.deepEqual(policy[key], expected[key], `default mismatch for ${key}`);
  }
  // The reader does not invent extra fields beyond schema defaults.
  assert.deepEqual(Object.keys(policy).sort(), Object.keys(expected).sort());
});

// --- partial reviews: default for absent, value for present ----------------

test('applies defaults for absent fields and keeps present valid values', async (t) => {
  const cwd = await makeTmpDir('cs61-reader-partial-');
  t.after(() => rm(cwd, { recursive: true, force: true }));

  await writeConfigFile(cwd, { reviews: { rubber_duck_model: 'gpt-5.5-custom', enforce_gates: false } });
  const policy = loadReviewsPolicy({ cwd });
  const defaults = schemaReviewsDefaults();

  assert.equal(policy.rubber_duck_model, 'gpt-5.5-custom');
  assert.equal(policy.enforce_gates, false);
  // Absent fields fall back to schema defaults.
  assert.equal(policy.fallback_model, defaults.fallback_model);
  assert.deepEqual(policy.high_risk_clickstops, defaults.high_risk_clickstops);
  assert.equal(policy.copilot_trigger, defaults.copilot_trigger);
});

test('trims whitespace on present string fields', async (t) => {
  const cwd = await makeTmpDir('cs61-reader-trim-');
  t.after(() => rm(cwd, { recursive: true, force: true }));

  await writeConfigFile(cwd, { reviews: { rubber_duck_model: '  gpt-5.5  ' } });
  const policy = loadReviewsPolicy({ cwd });
  assert.equal(policy.rubber_duck_model, 'gpt-5.5');
});

test('accepts a fully-specified reviews block', async (t) => {
  const cwd = await makeTmpDir('cs61-reader-full-');
  t.after(() => rm(cwd, { recursive: true, force: true }));

  const reviews = {
    rubber_duck_model: 'gpt-5.5',
    fallback_model: 'sonnet-4.6',
    enforce_gates: true,
    require_copilot_review: false,
    copilot_reviewer_slug: 'copilot-pull-request-reviewer[bot]',
    copilot_trigger: 'reviewer',
    review_timeout_minutes: 45,
    high_risk_clickstops: ['CS03', 'CS61'],
  };
  await writeConfigFile(cwd, { reviews });
  const policy = loadReviewsPolicy({ cwd });
  assert.deepEqual(policy, reviews);
});

// --- explicit configPath handling ------------------------------------------

test('throws NOT_FOUND for an explicit configPath that does not exist', async (t) => {
  const cwd = await makeTmpDir('cs61-reader-explicit-missing-');
  t.after(() => rm(cwd, { recursive: true, force: true }));

  const missing = path.join(cwd, 'nope.json');
  assert.throws(
    () => loadReviewsPolicy({ cwd, configPath: missing }),
    (err) => {
      assert(err instanceof ReviewsConfigError);
      assert.equal(err.code, 'NOT_FOUND');
      return true;
    }
  );
});

test('reads an explicit configPath when it exists', async (t) => {
  const cwd = await makeTmpDir('cs61-reader-explicit-ok-');
  t.after(() => rm(cwd, { recursive: true, force: true }));

  const alt = path.join(cwd, 'alt.json');
  await writeFile(alt, `${JSON.stringify({ reviews: { fallback_model: 'alt-model' } }, null, 2)}\n`, 'utf8');
  const policy = loadReviewsPolicy({ cwd, configPath: alt });
  assert.equal(policy.fallback_model, 'alt-model');
});

test('throws INVALID_JSON for an unparseable config', async (t) => {
  const cwd = await makeTmpDir('cs61-reader-badjson-');
  t.after(() => rm(cwd, { recursive: true, force: true }));

  const p = path.join(cwd, 'harness.config.json');
  await writeFile(p, '{ not: valid json', 'utf8');
  assert.throws(
    () => loadReviewsPolicy({ cwd }),
    (err) => {
      assert(err instanceof ReviewsConfigError);
      assert.equal(err.code, 'INVALID_JSON');
      return true;
    }
  );
});

test('throws MALFORMED when the top-level config is not an object', async (t) => {
  const cwd = await makeTmpDir('cs61-reader-toplevel-');
  t.after(() => rm(cwd, { recursive: true, force: true }));

  const p = path.join(cwd, 'harness.config.json');
  await writeFile(p, '[1, 2, 3]', 'utf8');
  assert.throws(
    () => loadReviewsPolicy({ cwd }),
    (err) => {
      assert(err instanceof ReviewsConfigError);
      assert.equal(err.code, 'MALFORMED');
      return true;
    }
  );
});

// --- fail-closed-on-malformed: each field ----------------------------------

const MALFORMED_CASES = [
  ['reviews itself an array', { reviews: ['nope'] }, 'reviews'],
  ['rubber_duck_model empty', { reviews: { rubber_duck_model: '   ' } }, 'rubber_duck_model'],
  ['rubber_duck_model non-string', { reviews: { rubber_duck_model: 5 } }, 'rubber_duck_model'],
  ['fallback_model empty', { reviews: { fallback_model: '' } }, 'fallback_model'],
  ['copilot_reviewer_slug empty', { reviews: { copilot_reviewer_slug: '' } }, 'copilot_reviewer_slug'],
  ['enforce_gates non-boolean', { reviews: { enforce_gates: 'true' } }, 'enforce_gates'],
  ['require_copilot_review non-boolean', { reviews: { require_copilot_review: 1 } }, 'require_copilot_review'],
  ['copilot_trigger bad enum', { reviews: { copilot_trigger: 'webhook' } }, 'copilot_trigger'],
  ['review_timeout_minutes zero', { reviews: { review_timeout_minutes: 0 } }, 'review_timeout_minutes'],
  ['review_timeout_minutes negative', { reviews: { review_timeout_minutes: -5 } }, 'review_timeout_minutes'],
  ['review_timeout_minutes non-number', { reviews: { review_timeout_minutes: '30' } }, 'review_timeout_minutes'],
  ['high_risk_clickstops non-array', { reviews: { high_risk_clickstops: 'CS03' } }, 'high_risk_clickstops'],
  ['high_risk_clickstops bad pattern', { reviews: { high_risk_clickstops: ['CS03', 'nope'] } }, 'high_risk_clickstops'],
  ['high_risk_clickstops lowercase fails pattern', { reviews: { high_risk_clickstops: ['cs03'] } }, 'high_risk_clickstops'],
  // Both ids pass the case-sensitive pattern (^CS\d{2,}[A-Za-z]?$) but collide
  // when upper-cased, so this actually exercises the case-insensitive duplicate
  // path (not the pattern check, which would short-circuit a lowercase dup).
  ['high_risk_clickstops duplicate', { reviews: { high_risk_clickstops: ['CS15a', 'CS15A'] } }, 'high_risk_clickstops'],
  ['high_risk_clickstops non-string item', { reviews: { high_risk_clickstops: [3] } }, 'high_risk_clickstops'],
];

for (const [label, config, expectedField] of MALFORMED_CASES) {
  test(`fails closed on malformed present value: ${label}`, async (t) => {
    const cwd = await makeTmpDir('cs61-reader-malformed-');
    t.after(() => rm(cwd, { recursive: true, force: true }));

    await writeConfigFile(cwd, config);
    assert.throws(
      () => loadReviewsPolicy({ cwd }),
      (err) => {
        assert(err instanceof ReviewsConfigError, `${label}: expected ReviewsConfigError`);
        assert.equal(err.code, 'MALFORMED', `${label}: expected MALFORMED code`);
        assert.equal(err.field, expectedField, `${label}: expected field ${expectedField}`);
        return true;
      }
    );
  });
}

test('high_risk_clickstops duplicate detection exercises the case-insensitive path, not the pattern check', async (t) => {
  const cwd = await makeTmpDir('cs61-reader-dup-path-');
  t.after(() => rm(cwd, { recursive: true, force: true }));

  // CS15a and CS15A both satisfy the pattern, so the failure must come from the
  // duplicate check (upper-cased collision), proving that code path is reached.
  await writeConfigFile(cwd, { reviews: { high_risk_clickstops: ['CS15a', 'CS15A'] } });
  assert.throws(
    () => loadReviewsPolicy({ cwd }),
    (err) => {
      assert(err instanceof ReviewsConfigError);
      assert.equal(err.code, 'MALFORMED');
      assert.equal(err.field, 'high_risk_clickstops');
      assert.match(err.message, /duplicate/i, `expected a duplicate (not pattern) error: ${err.message}`);
      return true;
    }
  );
});

// --- subtree-only validation -----------------------------------------------

test('subtree-only: a config that omits unrelated required top-level keys still loads', async (t) => {
  const cwd = await makeTmpDir('cs61-reader-subtree-');
  t.after(() => rm(cwd, { recursive: true, force: true }));

  // No version/project/managed/... — these are required by the full schema,
  // but the reviews-policy reader must not run full-config validation.
  await writeConfigFile(cwd, { reviews: { rubber_duck_model: 'gpt-5.5' } });
  const policy = loadReviewsPolicy({ cwd });
  assert.equal(policy.rubber_duck_model, 'gpt-5.5');
});

test('subtree-only: unknown reviews keys fail closed (schema additionalProperties:false)', async (t) => {
  const cwd = await makeTmpDir('cs61-reader-unknown-');
  t.after(() => rm(cwd, { recursive: true, force: true }));

  // The schema sets reviews.additionalProperties:false, so a typo'd/unknown
  // reviews.* key the full schema would reject must also fail closed here.
  await writeConfigFile(cwd, { reviews: { rubber_duck_model: 'gpt-5.5', made_up_key: true } });
  assert.throws(
    () => loadReviewsPolicy({ cwd }),
    (err) => {
      assert(err instanceof ReviewsConfigError);
      assert.equal(err.code, 'MALFORMED');
      assert.equal(err.field, 'made_up_key');
      return true;
    }
  );
});

// --- immutability ----------------------------------------------------------

test('returned high_risk_clickstops is a fresh array (cache not mutable via caller)', async (t) => {
  const cwd = await makeTmpDir('cs61-reader-immutable-');
  t.after(() => rm(cwd, { recursive: true, force: true }));

  const a = loadReviewsPolicy({ cwd });
  a.high_risk_clickstops.push('CS99');
  const b = loadReviewsPolicy({ cwd });
  assert.deepEqual(b.high_risk_clickstops, schemaReviewsDefaults().high_risk_clickstops);
});
