import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { CORE_MANAGED_FILES } from '../lib/core-managed-files.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('CORE_MANAGED_FILES is a frozen, non-empty array of strings', () => {
  assert.ok(Array.isArray(CORE_MANAGED_FILES));
  assert.ok(CORE_MANAGED_FILES.length > 0);
  assert.ok(Object.isFrozen(CORE_MANAGED_FILES));
  for (const rel of CORE_MANAGED_FILES) assert.equal(typeof rel, 'string');
});

test('CORE_MANAGED_FILES is exactly the five core governance docs', () => {
  assert.deepEqual(
    [...CORE_MANAGED_FILES].sort(),
    [
      '.github/copilot-instructions.md',
      'INSTRUCTIONS.md',
      'READMEGUIDE.md',
      'RETROSPECTIVES.md',
      'TRACKING.md',
    ]
  );
});

test('every core managed doc exists as a template under template/managed/', () => {
  for (const rel of CORE_MANAGED_FILES) {
    const tpl = path.join(REPO_ROOT, 'template', 'managed', rel);
    assert.ok(existsSync(tpl), `missing template/managed/${rel}`);
  }
});

test('entries are unique, relative, and exclude sentinels', () => {
  const seen = new Set();
  for (const rel of CORE_MANAGED_FILES) {
    assert.ok(rel.length > 0);
    assert.ok(!rel.startsWith('/'), `must be relative: ${rel}`);
    assert.ok(!rel.includes('..'), `no parent traversal: ${rel}`);
    assert.notEqual(path.basename(rel), '.gitkeep', `no sentinel: ${rel}`);
    assert.ok(!seen.has(rel), `duplicate: ${rel}`);
    seen.add(rel);
  }
});

test('the harness self-host config tracks every core managed doc (dogfooding guard)', () => {
  const cfg = JSON.parse(readFileSync(path.join(REPO_ROOT, 'harness.config.json'), 'utf8'));
  const managed = cfg.managed?.files ?? [];
  for (const rel of CORE_MANAGED_FILES) {
    assert.ok(managed.includes(rel), `harness.config.json managed.files missing core doc ${rel}`);
  }
});

test('the seeded template config tracks every core managed doc', () => {
  const cfg = JSON.parse(
    readFileSync(path.join(REPO_ROOT, 'template', 'seeded', 'harness.config.json'), 'utf8')
  );
  const managed = cfg.managed?.files ?? [];
  for (const rel of CORE_MANAGED_FILES) {
    assert.ok(managed.includes(rel), `seeded harness.config.json managed.files missing core doc ${rel}`);
  }
});
