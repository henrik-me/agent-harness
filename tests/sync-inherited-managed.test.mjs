/**
 * tests/sync-inherited-managed.test.mjs — CS38a R2 B3.
 *
 * Integration test: when composed.overrides[<file>]._inherited_class === 'managed',
 * lib/sync.mjs dispatches to mergeComposedFromManaged and preserves consumer
 * prose outside marker blocks (instead of failing with EMERGE_LEGACY_UNMAPPED).
 *
 * This is the scenario that `harness init --enable-review-gates` creates when
 * migrating .github/pull_request_template.md from managed → composed.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  readFileSync, mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { sync } from '../lib/sync.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function makeTmpDir(prefix) {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeText(p, content) {
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, content, 'utf8');
}

function writeJSON(p, obj) {
  writeText(p, JSON.stringify(obj, null, 2) + '\n');
}

function buildHarnessRepo(dir, templates) {
  const schema = readFileSync(
    path.join(repoRoot, 'schemas', 'harness.config.schema.json'),
    'utf8'
  );
  writeText(path.join(dir, 'schemas', 'harness.config.schema.json'), schema);
  for (const [name, content] of Object.entries(templates.composed ?? {})) {
    writeText(path.join(dir, 'template', 'composed', name), content);
  }
}

const PR_TEMPLATE = [
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

describe('sync — _inherited_class: managed dispatch (CS38a R2 B3)', () => {
  let harnessDir, consumerDir;

  beforeEach(() => {
    harnessDir = makeTmpDir('harness-im-');
    consumerDir = makeTmpDir('consumer-im-');
    buildHarnessRepo(harnessDir, {
      composed: { '.github/pull_request_template.md': PR_TEMPLATE },
    });
  });

  afterEach(() => {
    try { rmSync(harnessDir, { recursive: true, force: true }); } catch { /* ignore */ }
    try { rmSync(consumerDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  function writeConsumerConfig() {
    writeJSON(path.join(consumerDir, 'harness.config.json'), {
      version: 'v0.1.0',
      project: { name: 'consumer-im', agent_suffix: 'cim' },
      managed: { files: [] },
      composed: {
        files: ['.github/pull_request_template.md'],
        overrides: {
          '.github/pull_request_template.md': {
            local_blocks: ['pull-request.review-evidence'],
            _inherited_class: 'managed',
          },
        },
      },
      seeded: { files: [] },
      excluded: [],
    });
  }

  it('preserves consumer prose outside markers and appends the template block on first sync', async () => {
    writeConsumerConfig();

    // Consumer's pre-existing file (was previously managed; has no marker blocks).
    const consumerTemplate = [
      '# Custom Org PR',
      '',
      '## Org-specific guidance',
      '',
      'This is the org playbook — must be preserved on every sync.',
      '',
      '## Checklist',
      '- [ ] item A',
      '- [ ] item B',
      '',
    ].join('\n');
    writeText(
      path.join(consumerDir, '.github', 'pull_request_template.md'),
      consumerTemplate
    );

    // Without _inherited_class handling, sync would fail with EMERGE_LEGACY_UNMAPPED
    // here because the consumer's skeleton diverges from the template skeleton.
    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'apply',
    });

    // Sync succeeded — no merge error thrown.
    assert.ok(Array.isArray(result.changes), 'sync must return a changes array');

    const merged = readFileSync(
      path.join(consumerDir, '.github', 'pull_request_template.md'),
      'utf8'
    );

    // Consumer prose preserved verbatim.
    assert.ok(
      merged.startsWith('# Custom Org PR'),
      'consumer header must be preserved verbatim'
    );
    assert.ok(
      merged.includes('This is the org playbook — must be preserved on every sync.'),
      'consumer prose must be preserved verbatim'
    );
    assert.ok(
      merged.includes('- [ ] item A'),
      'consumer checklist must be preserved verbatim'
    );

    // Template's marker block was appended.
    assert.ok(
      merged.includes('<!-- harness:local-start id=pull-request.review-evidence -->'),
      'template marker block must be appended'
    );
    assert.ok(
      merged.includes('## Model audit'),
      'template block body must be present'
    );

    // The template's own prose was NOT injected (e.g. "## Summary" line from PR_TEMPLATE)
    // because the consumer owns the prose.
    assert.equal(
      merged.indexOf('# Pull Request\n\n## Summary'),
      -1,
      'template prose must NOT replace consumer prose for inherited-managed files'
    );
  });

  it('preserves consumer-edited block body on subsequent sync', async () => {
    writeConsumerConfig();

    // Consumer's file after a previous sync — has the marker block, with consumer edits.
    const consumerTemplate = [
      '# Custom Org PR',
      '',
      '## Org-specific guidance',
      '',
      'Org playbook prose.',
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
    writeText(
      path.join(consumerDir, '.github', 'pull_request_template.md'),
      consumerTemplate
    );

    await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'apply',
    });

    const merged = readFileSync(
      path.join(consumerDir, '.github', 'pull_request_template.md'),
      'utf8'
    );

    // Consumer-customized block body is preserved.
    assert.ok(
      merged.includes('| Implementer models | claude-opus-4.7 |'),
      'consumer-filled block body must be preserved across syncs'
    );
    assert.ok(
      merged.includes('| Reviewer model | gpt-5.5 |'),
      'consumer-added rows must be preserved across syncs'
    );

    // Consumer prose preserved.
    assert.ok(
      merged.includes('Org playbook prose.'),
      'consumer outside-block prose must be preserved across syncs'
    );

    // No duplicate marker block at end (block was already in current).
    const startCount = (merged.match(/harness:local-start id=pull-request\.review-evidence/g) ?? []).length;
    assert.equal(startCount, 1, 'must not duplicate the marker block when consumer already has it');
  });

  it('renders the template verbatim when consumer file is absent (fresh start)', async () => {
    writeConsumerConfig();
    // No consumer file written.

    await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'apply',
    });

    const merged = readFileSync(
      path.join(consumerDir, '.github', 'pull_request_template.md'),
      'utf8'
    );

    // On fresh start with no current file, the template is rendered verbatim
    // (this matches mergeComposed's fresh-start behavior).
    assert.equal(merged, PR_TEMPLATE);
  });

  it('falls back to normal mergeComposed when _inherited_class is NOT set', async () => {
    // Same config but WITHOUT _inherited_class.
    writeJSON(path.join(consumerDir, 'harness.config.json'), {
      version: 'v0.1.0',
      project: { name: 'consumer-im', agent_suffix: 'cim' },
      managed: { files: [] },
      composed: {
        files: ['.github/pull_request_template.md'],
        overrides: {
          '.github/pull_request_template.md': {
            local_blocks: ['pull-request.review-evidence'],
          },
        },
      },
      seeded: { files: [] },
      excluded: [],
    });

    // Consumer's pre-existing file with diverging skeleton (no marker blocks).
    const consumerTemplate = '# Diverging consumer template with no markers\n\nSome prose.\n';
    writeText(
      path.join(consumerDir, '.github', 'pull_request_template.md'),
      consumerTemplate
    );

    // Without _inherited_class, sync MUST throw EMERGE_LEGACY_UNMAPPED on
    // skeleton divergence (this is the normal mergeComposed behavior we're
    // bypassing with _inherited_class: 'managed').
    await assert.rejects(
      () => sync({
        consumerRepoPath: consumerDir,
        harnessRepoPath: harnessDir,
        mode: 'check',
      }),
      (err) => {
        // Any merge error is fine — we just want to confirm the dispatch
        // correctly takes the NORMAL path (which fails) when _inherited_class
        // is absent. The exact code is less important than the fact that it
        // does NOT silently succeed.
        assert.match(
          err.message,
          /EMERGE_LEGACY_UNMAPPED|Composed merge failed/,
          'normal mergeComposed must fail-closed on skeleton divergence without _inherited_class'
        );
        return true;
      }
    );
  });
});
