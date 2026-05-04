import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

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

describe('CS11 — self-host harness.config.json', () => {
  it('1. harness.config.json validates against harness.config.schema.json', () => {
    const schema = readJson('schemas/harness.config.schema.json');
    const config = readJson('harness.config.json');

    const ajv = new Ajv2020({ strict: false, validateSchema: false });
    addFormats(ajv);
    const validate = ajv.compile(schema);
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

  it('3. local_blocks mirrors composed-template block IDs (catches drift if a template renames a local block)', () => {
    const config = readJson('harness.config.json');
    const composedFiles = config.composed?.files ?? [];

    for (const file of composedFiles) {
      const templatePath = path.join('template', 'composed', file);
      const content = readText(templatePath);

      // Extract all harness:local-start block IDs from the template
      const markerRe = /<!--\s*harness:local-start\s+id=([^\s>]+)\s*-->/g;
      const templateIds = new Set();
      let m;
      while ((m = markerRe.exec(content)) !== null) {
        templateIds.add(m[1]);
      }

      const configIds = new Set(config.local_blocks?.[file] ?? []);

      // Check set equality
      const missingInConfig = [...templateIds].filter(id => !configIds.has(id));
      const extraInConfig = [...configIds].filter(id => !templateIds.has(id));

      assert.deepEqual(
        missingInConfig,
        [],
        `${file}: template has block IDs not listed in config.local_blocks: ${missingInConfig.join(', ')}`
      );
      assert.deepEqual(
        extraInConfig,
        [],
        `${file}: config.local_blocks lists IDs not found in template: ${extraInConfig.join(', ')}`
      );
    }
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
