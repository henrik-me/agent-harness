#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const results = {
  schemaValidation: [],
  exampleValidation: [],
  learningValidation: [],
  passed: 0,
  failed: 0
};

// 1. Validate schemas self-validate
console.log('=== Schema Self-Validation ===\n');

const schemaFiles = [
  'schemas/harness.config.schema.json',
  'schemas/harness-lock.schema.json',
  'schemas/learning.schema.json'
];

for (const schemaFile of schemaFiles) {
  const fullPath = path.join(repoRoot, schemaFile);
  try {
    const schemaContent = fs.readFileSync(fullPath, 'utf8');
    const schema = JSON.parse(schemaContent);
    
    // Create a fresh AJV instance for each schema to avoid ID conflicts
    const ajv = new Ajv({ spec: 'draft2020', strict: false, validateSchema: false });
    addFormats(ajv);
    ajv.compile(schema);
    
    console.log(`✓ ${schemaFile}`);
    results.schemaValidation.push({ file: schemaFile, status: 'pass' });
    results.passed++;
  } catch (error) {
    console.log(`✗ ${schemaFile}: ${error.message}`);
    results.schemaValidation.push({ file: schemaFile, status: 'fail', error: error.message });
    results.failed++;
  }
}

// 2. Validate example configs
console.log('\n=== Example Config Validation ===\n');

const harness_config_schema_path = path.join(repoRoot, 'schemas/harness.config.schema.json');
const harness_config_schema_content = fs.readFileSync(harness_config_schema_path, 'utf8');
const harness_config_schema = JSON.parse(harness_config_schema_content);

const ajv_examples = new Ajv({ spec: 'draft2020', strict: false, validateSchema: false });
addFormats(ajv_examples);
const validate_harness_config = ajv_examples.compile(harness_config_schema);

const examplesDir = path.join(repoRoot, 'examples');
let exampleFiles = [];

if (fs.existsSync(examplesDir)) {
  exampleFiles = fs.readdirSync(examplesDir)
    .filter(f => f.endsWith('.harness.config.json'))
    .sort();
}

if (exampleFiles.length === 0) {
  console.log('⚠ No .harness.config.json examples found in examples/');
  console.log('(This is expected if Wave 2 example authors have not completed their tasks yet.)');
  results.exampleValidation.push({ status: 'pending', reason: 'No examples found' });
} else {
  for (const exampleFile of exampleFiles) {
    const fullPath = path.join(examplesDir, exampleFile);
    try {
      const exampleContent = fs.readFileSync(fullPath, 'utf8');
      const example = JSON.parse(exampleContent);
      const valid = validate_harness_config(example);
      if (valid) {
        console.log(`✓ ${exampleFile}`);
        results.exampleValidation.push({ file: exampleFile, status: 'pass' });
        results.passed++;
      } else {
        console.log(`✗ ${exampleFile}: ${JSON.stringify(validate_harness_config.errors)}`);
        results.exampleValidation.push({ file: exampleFile, status: 'fail', errors: validate_harness_config.errors });
        results.failed++;
      }
    } catch (error) {
      console.log(`✗ ${exampleFile}: ${error.message}`);
      results.exampleValidation.push({ file: exampleFile, status: 'fail', error: error.message });
      results.failed++;
    }
  }
}

// 3. Validate learning entries from LEARNINGS.md
console.log('\n=== Learning Entry Validation ===\n');

const learnings_schema_path = path.join(repoRoot, 'schemas/learning.schema.json');
const learnings_schema_content = fs.readFileSync(learnings_schema_path, 'utf8');
const learnings_schema = JSON.parse(learnings_schema_content);

const ajv_learnings = new Ajv({ spec: 'draft2020', strict: false, validateSchema: false });
addFormats(ajv_learnings);
const validate_learning = ajv_learnings.compile(learnings_schema);

const learningsPath = path.join(repoRoot, 'LEARNINGS.md');
const learningsContent = fs.readFileSync(learningsPath, 'utf8');

// Extract YAML frontmatter blocks under ### LRN-NNN headings
// Handle both Unix (LF) and Windows (CRLF) line endings
const lrnPattern = /### (LRN-\d+)\s*\r?\n\r?\n```yaml\r?\n([\s\S]*?)\r?\n```/g;
let match;
const learningEntries = [];

while ((match = lrnPattern.exec(learningsContent)) !== null) {
  const lrnId = match[1];
  const yamlContent = match[2];
  learningEntries.push({ id: lrnId, yaml: yamlContent });
}

if (learningEntries.length === 0) {
  console.log('⚠ No learning entries found in LEARNINGS.md');
  results.failed++;
} else {
  for (const entry of learningEntries) {
    try {
      // Use js-yaml with schema that doesn't parse dates as objects
      const parsed = yaml.load(entry.yaml, { schema: yaml.JSON_SCHEMA });
      const valid = validate_learning(parsed);
      if (valid) {
        console.log(`✓ ${entry.id}`);
        results.learningValidation.push({ id: entry.id, status: 'pass' });
        results.passed++;
      } else {
        console.log(`✗ ${entry.id}: ${JSON.stringify(validate_learning.errors)}`);
        results.learningValidation.push({ id: entry.id, status: 'fail', errors: validate_learning.errors });
        results.failed++;
      }
    } catch (error) {
      console.log(`✗ ${entry.id}: ${error.message}`);
      results.learningValidation.push({ id: entry.id, status: 'fail', error: error.message });
      results.failed++;
    }
  }
}

// Summary
console.log('\n=== Summary ===\n');
console.log(`Passed: ${results.passed}`);
console.log(`Failed: ${results.failed}`);

if (results.failed > 0) {
  console.log('\n❌ Validation failed');
  process.exit(1);
} else {
  console.log('\n✅ All validations passed');
  process.exit(0);
}
