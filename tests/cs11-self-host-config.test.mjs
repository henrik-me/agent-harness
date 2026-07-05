import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parseComposed } from '../lib/composed.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const CONSTRAINT_FIXTURES_DIR = path.join(__dirname, 'fixtures', 'cs15e', 'schema');

function readJson(relPath) {
  const content = readFileSync(path.join(REPO_ROOT, relPath), 'utf8')
    .replace(/^\uFEFF/, '')   // strip BOM if present
    .replace(/\r\n/g, '\n');  // normalize line endings
  return JSON.parse(content);
}

function readText(relPath) {
  return readFileSync(path.join(REPO_ROOT, relPath), 'utf8')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n');
}

function compileHarnessConfigSchema() {
  const schema = readJson('schemas/harness.config.schema.json');
  const ajv = new Ajv2020({ strict: false, validateSchema: false });
  addFormats(ajv);
  return ajv.compile(schema);
}

function readConstraintFixture(name) {
  const content = readFileSync(path.join(CONSTRAINT_FIXTURES_DIR, name), 'utf8')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n');
  return JSON.parse(content);
}

describe('CS11 — self-host harness.config.json', () => {
  it('1. harness.config.json validates against harness.config.schema.json', () => {
    const config = readJson('harness.config.json');

    const validate = compileHarnessConfigSchema();
    const valid = validate(config);
    assert.ok(
      valid,
      `Schema validation failed: ${JSON.stringify(validate.errors, null, 2)}`
    );
  });

  it('2. file-class membership is exhaustive — every root .md is classified or excluded (no orphans, no overlaps)', () => {
    const config = readJson('harness.config.json');

    const managed = new Set(
      (config.managed?.files ?? []).filter(f => !f.includes('/') && f.endsWith('.md'))
    );
    const composed = new Set(
      (config.composed?.files ?? []).filter(f => !f.includes('/') && f.endsWith('.md'))
    );
    const seeded = new Set(
      (config.seeded?.files ?? []).filter(f => !f.includes('/') && f.endsWith('.md'))
    );
    const excluded = new Set(
      (config.excluded ?? []).filter(f => !f.includes('/') && f.endsWith('.md'))
    );

    // All declared sets must be disjoint
    const allDeclared = [...managed, ...composed, ...seeded, ...excluded];
    const uniqueDeclared = new Set(allDeclared);
    assert.equal(
      allDeclared.length,
      uniqueDeclared.size,
      'Overlap detected: a .md file appears in more than one file class'
    );

    // Every root .md file must appear in exactly one set
    const rootMdFiles = readdirSync(REPO_ROOT)
      .filter(f => f.endsWith('.md') && !f.includes('/'));

    const orphans = rootMdFiles.filter(
      f => !managed.has(f) && !composed.has(f) && !seeded.has(f) && !excluded.has(f)
    );
    assert.deepEqual(
      orphans,
      [],
      `Orphaned root .md files (not classified): ${orphans.join(', ')}`
    );
  });

  it('3. composed.overrides[file].local_blocks mirrors composed-template block IDs (catches drift if a template renames a local block) [LRN-009 / CS02b: single source of truth]', () => {
    const config = readJson('harness.config.json');
    const composedFiles = config.composed?.files ?? [];

    for (const file of composedFiles) {
      const templatePath = path.join('template', 'composed', file);
      const content = readText(templatePath);

      // Extract all local-block IDs from the template using the canonical
      // parser (single source of truth). It recognizes BOTH the HTML-comment
      // and the `#`-comment marker forms, so this test never drifts from the
      // runtime parser when a new marker syntax is added (CS89 — previously an
      // inline HTML-only regex here silently missed the `#`-form CODEOWNERS
      // block, a third hand-synced parser copy).
      const templateIds = new Set(
        parseComposed(content, { filename: file }).blocks.keys()
      );

      const configIds = new Set(config.composed?.overrides?.[file]?.local_blocks ?? []);

      // Check set equality
      const missingInConfig = [...templateIds].filter(id => !configIds.has(id));
      const extraInConfig = [...configIds].filter(id => !templateIds.has(id));

      assert.deepEqual(
        missingInConfig,
        [],
        `${file}: template has block IDs not listed in composed.overrides[${file}].local_blocks: ${missingInConfig.join(', ')}`
      );
      assert.deepEqual(
        extraInConfig,
        [],
        `${file}: composed.overrides[${file}].local_blocks lists IDs not found in template: ${extraInConfig.join(', ')}`
      );
    }

    // Schema invariant: top-level local_blocks was removed in v0.2.0 (LRN-009 / CS02b)
    assert.equal(config.local_blocks, undefined, 'Top-level local_blocks must not be present (removed in v0.2.0)');
  });

  it('4. templating values are defensible — 8 required keys, all non-empty strings, agent_suffix matches pattern', () => {
    const config = readJson('harness.config.json');
    const t = config.templating ?? {};

    const requiredKeys = [
      'project_name',
      'agent_suffix',
      'agent_suffix_upper',
      'repo_owner',
      'repo_slug',
      'repo_short',
      'default_codeowner',
      'lib_codeowner',
    ];

    for (const key of requiredKeys) {
      assert.ok(key in t, `templating.${key} is missing`);
      assert.equal(typeof t[key], 'string', `templating.${key} must be a string`);
      assert.ok(t[key].length > 0, `templating.${key} must be non-empty`);
    }

    assert.match(
      t.agent_suffix,
      /^[a-z][a-z0-9-]*$/,
      `templating.agent_suffix "${t.agent_suffix}" does not match ^[a-z][a-z0-9-]*$`
    );
  });
});

describe('CS15e — harness.config constraints schema', () => {
  it('accepts private-free constraints with a disposition', () => {
    const validate = compileHarnessConfigSchema();
    const valid = validate(readConstraintFixture('valid-private-free.json'));
    assert.equal(valid, true, JSON.stringify(validate.errors));
  });

  it('accepts public constraints without a disposition', () => {
    const validate = compileHarnessConfigSchema();
    const valid = validate(readConstraintFixture('valid-public.json'));
    assert.equal(valid, true, JSON.stringify(validate.errors));
  });

  it('rejects private-free constraints without a disposition', () => {
    const validate = compileHarnessConfigSchema();
    const valid = validate(readConstraintFixture('invalid-private-free-no-disposition.json'));
    assert.equal(valid, false);
    assert.ok(
      validate.errors.some(e => e.keyword === 'required' && e.params?.missingProperty === 'disposition'),
      `Expected missing disposition error; got ${JSON.stringify(validate.errors)}`
    );
  });

  it('rejects public constraints with a disposition', () => {
    const validate = compileHarnessConfigSchema();
    const valid = validate(readConstraintFixture('invalid-public-with-disposition.json'));
    assert.equal(valid, false);
    assert.ok(
      validate.errors.some(e => e.keyword === 'not' || e.instancePath === '/constraints/disposition'),
      `Expected disposition not-allowed error; got ${JSON.stringify(validate.errors)}`
    );
  });

  it('rejects null disposition at the type level', () => {
    const validate = compileHarnessConfigSchema();
    const valid = validate(readConstraintFixture('invalid-null-disposition.json'));
    assert.equal(valid, false);
    assert.ok(
      validate.errors.some(e => e.keyword === 'type' && e.instancePath === '/constraints/disposition'),
      `Expected disposition type error; got ${JSON.stringify(validate.errors)}`
    );
  });

  it('rejects unknown tier enum values', () => {
    const validate = compileHarnessConfigSchema();
    const valid = validate(readConstraintFixture('invalid-tier-enum.json'));
    assert.equal(valid, false);
    assert.ok(
      validate.errors.some(e => e.keyword === 'enum' && e.instancePath === '/constraints/tier'),
      `Expected tier enum error; got ${JSON.stringify(validate.errors)}`
    );
  });
});
