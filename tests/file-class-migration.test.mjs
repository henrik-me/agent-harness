import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { migrateFileClass, validateMigratable } from '../lib/file-class-migration.mjs';

const PR_TEMPLATE = '.github/pull_request_template.md';
const LOCAL_BLOCKS = ['pull-request.review-evidence'];

function baseConfig() {
  return {
    version: 'v0.1.0',
    project: { name: 'fixture', agent_suffix: 'fx' },
    managed: { files: ['README.md', PR_TEMPLATE] },
    composed: {
      files: ['OPERATIONS.md'],
      overrides: {
        'OPERATIONS.md': { local_blocks: ['operations.project-deploy'] },
      },
    },
  };
}

describe('file-class migration helper', () => {
  it('moves a managed file to composed and records inherited local blocks', () => {
    const migrated = migrateFileClass(baseConfig(), PR_TEMPLATE, { local_blocks: LOCAL_BLOCKS });

    assert.deepEqual(migrated.managed.files, ['README.md']);
    assert.deepEqual(migrated.composed.files, ['OPERATIONS.md', PR_TEMPLATE]);
    assert.deepEqual(migrated.composed.overrides[PR_TEMPLATE], {
      _inherited_class: 'managed',
      local_blocks: LOCAL_BLOCKS,
    });
  });

  it('is idempotent when the managed-to-composed migration already landed', () => {
    const migrated = migrateFileClass(baseConfig(), PR_TEMPLATE, { local_blocks: LOCAL_BLOCKS });

    assert.deepEqual(
      migrateFileClass(migrated, PR_TEMPLATE, { local_blocks: LOCAL_BLOCKS }),
      migrated,
    );
  });

  it('throws when the file is not in managed.files', () => {
    assert.throws(
      () => migrateFileClass(baseConfig(), 'MISSING.md', { local_blocks: LOCAL_BLOCKS }),
      /not found in managed\.files/,
    );
  });

  it('throws when local_blocks is missing or empty', () => {
    assert.throws(
      () => migrateFileClass(baseConfig(), PR_TEMPLATE),
      /local_blocks must be a non-empty array/,
    );
    assert.throws(
      () => migrateFileClass(baseConfig(), PR_TEMPLATE, { local_blocks: [] }),
      /local_blocks must be a non-empty array/,
    );
  });

  it('does not mutate the original config object', () => {
    const original = baseConfig();
    const before = structuredClone(original);

    migrateFileClass(original, PR_TEMPLATE, { local_blocks: LOCAL_BLOCKS });

    assert.deepEqual(original, before);
  });

  it('validateMigratable returns actionable failure reasons', () => {
    const missing = validateMigratable(baseConfig(), 'MISSING.md');
    assert.equal(missing.ok, false);
    assert.match(missing.reason, /MISSING\.md/);

    const alreadyComposed = baseConfig();
    alreadyComposed.managed.files = alreadyComposed.managed.files.filter((entry) => entry !== PR_TEMPLATE);
    alreadyComposed.composed.files.push(PR_TEMPLATE);

    const invalid = validateMigratable(alreadyComposed, PR_TEMPLATE);
    assert.equal(invalid.ok, false);
    assert.match(invalid.reason, /already present in composed\.files/);
  });
});
