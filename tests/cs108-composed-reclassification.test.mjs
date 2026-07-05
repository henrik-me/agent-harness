/**
 * tests/cs108-composed-reclassification.test.mjs — CS108.
 *
 * Verifies the managed→composed reclassification of the three remaining
 * full-overwrite markdown docs (TRACKING.md / RETROSPECTIVES.md /
 * READMEGUIDE.md), each gaining ONE consumer local block:
 *
 *   (1) config invariants — the three docs are composed (not managed), each has
 *       a composed.overrides entry with exactly the expected single local-block
 *       id, and none carries the `_inherited_class` shim (they are NORMAL
 *       composed files: harness owns the core, consumer owns only the block);
 *   (2) each template/composed/<doc> base parses under parseComposed with
 *       exactly the one expected block id and carries its start marker;
 *   (3) round-trip — the block survives mergeComposed with an injected line
 *       preserved and the managed core intact, no EMERGE_LEGACY_UNMAPPED;
 *   (4) fresh-start regeneration — mergeComposed(rendered, '') is byte-identical
 *       to the render and includes the start marker (the CS89-style regeneration
 *       path a self-host/consumer takes after deleting the old managed root);
 *   (5) migration message (Deliverable 7) — a consumer whose config still lists
 *       a reclassified doc in `managed.files` (its template/managed source now
 *       absent, template/composed present) gets a fail-closed
 *       ESYNC_RECLASSIFIED_TO_COMPOSED SyncError (NOT the raw
 *       ESYNC_MISSING_TEMPLATE), whose message names the file and points at
 *       composed.files; a target with NO template of either class still throws
 *       the raw ESYNC_MISSING_TEMPLATE (the general fall-through is preserved).
 *
 * All scratch trees live under os.tmpdir() — nothing is written under the repo
 * root (that would race check-text-encoding's recursive walk under parallel
 * `node --test`).
 *
 * Run: node --test tests/cs108-composed-reclassification.test.mjs
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

import { applyTemplating } from '../lib/templating.mjs';
import { computeCodeownerDefaults, computeHarnessInvokeDefault, sync, SyncError } from '../lib/sync.mjs';
import { parseComposed, mergeComposed } from '../lib/composed.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const config = JSON.parse(readFileSync(path.join(repoRoot, 'harness.config.json'), 'utf8'));

// The three reclassified docs, each with its single expected local-block id.
const DOCS = [
  { target: 'TRACKING.md', blockId: 'tracking.project' },
  { target: 'RETROSPECTIVES.md', blockId: 'retrospectives.project' },
  { target: 'READMEGUIDE.md', blockId: 'readmeguide.project' },
];

/** Replicate the lib/sync.mjs templatingVars construction (mirrors cs89). */
function syncVars(cfg) {
  return {
    harness_invoke: computeHarnessInvokeDefault(cfg),
    ...computeCodeownerDefaults(cfg),
    ...(cfg.templating ?? {}),
  };
}

function renderBase(target) {
  const raw = readFileSync(path.join(repoRoot, 'template', 'composed', target), 'utf8');
  return applyTemplating(raw, syncVars(config));
}

// ---------------------------------------------------------------------------
// (1) Config invariants
// ---------------------------------------------------------------------------

describe('CS108 (1) config invariants — the three docs are composed with one block', () => {
  for (const { target, blockId } of DOCS) {
    it(`${target} is in composed.files and not managed.files`, () => {
      assert.ok(config.composed.files.includes(target), `${target} in composed.files`);
      assert.ok(!config.managed.files.includes(target), `${target} not in managed.files`);
    });

    it(`${target} has exactly the ["${blockId}"] override and no _inherited_class`, () => {
      const override = config.composed.overrides[target];
      assert.ok(override, `composed.overrides["${target}"] exists`);
      assert.deepEqual(override.local_blocks, [blockId]);
      assert.ok(!('_inherited_class' in override), 'no _inherited_class shim');
    });
  }
});

// ---------------------------------------------------------------------------
// (2) Each composed base parses with exactly its one block id
// ---------------------------------------------------------------------------

describe('CS108 (2) composed bases parse with the single expected block id', () => {
  for (const { target, blockId } of DOCS) {
    it(`${target} parses with exactly ["${blockId}"] and carries its start marker`, () => {
      const raw = readFileSync(path.join(repoRoot, 'template', 'composed', target), 'utf8');
      const parsed = parseComposed(raw, { filename: target });
      assert.deepEqual([...parsed.blocks.keys()], [blockId]);
      assert.ok(
        raw.includes(`<!-- harness:local-start id=${blockId} -->`),
        `${target} contains the start marker`,
      );
    });
  }
});

// ---------------------------------------------------------------------------
// (3) Round-trip — a populated block survives mergeComposed (no legacy unmapped)
// ---------------------------------------------------------------------------

describe('CS108 (3) a populated local block survives mergeComposed', () => {
  for (const { target, blockId } of DOCS) {
    it(`${target}: an injected block line is preserved and the managed core survives`, () => {
      const rendered = renderBase(target);
      const endMarker = `<!-- harness:local-end id=${blockId} -->`;
      const extraLine = `Project-specific note for ${target}.`;
      // "current" file = same skeleton, extra line injected INSIDE the block body.
      const current = rendered.replace(endMarker, `${extraLine}\n${endMarker}`);
      assert.notEqual(current, rendered);

      const result = mergeComposed(rendered, current, {
        allowedBlockIds: [blockId],
        lockRecords: null,
        lockTemplateProseHash: null,
      });
      assert.ok(result.content.includes(extraLine), 'injected block line preserved');
      // The managed core (the doc heading) survives the merge.
      assert.ok(result.content.startsWith('#'), 'managed core heading survives');
      assert.ok(result.content.includes(`<!-- harness:local-start id=${blockId} -->`));
    });
  }
});

// ---------------------------------------------------------------------------
// (4) Fresh-start regeneration — empty current renders byte-identically
// ---------------------------------------------------------------------------

describe('CS108 (4) fresh-start regeneration is byte-identical to the render', () => {
  for (const { target, blockId } of DOCS) {
    it(`${target}: mergeComposed(rendered, '') === rendered and includes the start marker`, () => {
      const rendered = renderBase(target);
      const result = mergeComposed(rendered, '', {
        allowedBlockIds: [blockId],
        lockRecords: null,
        lockTemplateProseHash: null,
      });
      assert.equal(result.content, rendered);
      assert.ok(result.content.includes(`<!-- harness:local-start id=${blockId} -->`));
    });
  }
});

// ---------------------------------------------------------------------------
// (5) Migration message (Deliverable 7)
// ---------------------------------------------------------------------------

describe('CS108 (5) reclassified doc still in managed.files → ESYNC_RECLASSIFIED_TO_COMPOSED', () => {
  const tmpDirs = [];
  after(() => {
    for (const d of tmpDirs) {
      try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  function tmp(prefix) {
    const d = mkdtempSync(path.join(os.tmpdir(), prefix));
    tmpDirs.push(d);
    return d;
  }

  function writeText(filePath, content) {
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, 'utf8');
  }

  /** A hermetic harness checkout at v0.1.0@<sha> without depending on ambient .git. */
  const PROVENANCE_DEPS = {
    installRoot: '/cs108-hermetic-harness-checkout',
    readFileSync: () => { throw new Error('no npx cache in hermetic fixture'); },
    execSync: (cmd) => {
      if (cmd.includes('rev-parse HEAD')) return `${'a'.repeat(40)}\n`;
      if (cmd.includes('describe --tags --exact-match')) return 'v0.1.0\n';
      if (cmd.includes('rev-parse --abbrev-ref')) return 'main\n';
      throw new Error(`unexpected git command in hermetic fixture: ${cmd}`);
    },
  };

  function buildHarnessRepo(dir, { composed = {}, managed = {} } = {}) {
    const realSchema = readFileSync(
      path.join(repoRoot, 'schemas', 'harness.config.schema.json'),
      'utf8',
    );
    writeText(path.join(dir, 'schemas', 'harness.config.schema.json'), realSchema);
    for (const [name, content] of Object.entries(composed)) {
      writeText(path.join(dir, 'template', 'composed', name), content);
    }
    for (const [name, content] of Object.entries(managed)) {
      writeText(path.join(dir, 'template', 'managed', name), content);
    }
  }

  function buildConsumerRepo(dir, configOverrides) {
    const base = {
      version: 'v0.1.0',
      project: { name: 'test-project', agent_suffix: 'test' },
      managed: { files: [] },
      composed: { files: [] },
      seeded: { files: [] },
      excluded: [],
      templating: {},
    };
    writeText(
      path.join(dir, 'harness.config.json'),
      JSON.stringify({ ...base, ...configOverrides }, null, 2) + '\n',
    );
  }

  it('throws ESYNC_RECLASSIFIED_TO_COMPOSED (not ESYNC_MISSING_TEMPLATE) with an actionable message', async () => {
    const harnessDir = tmp('cs108-harness-');
    const consumerDir = tmp('cs108-consumer-');
    // Harness has the composed base but NOT the old managed template.
    buildHarnessRepo(harnessDir, {
      composed: { 'TRACKING.md': '# TRACKING\n\n<!-- harness:local-start id=tracking.project -->\n_(empty)_\n<!-- harness:local-end id=tracking.project -->\n' },
    });
    // Consumer STILL lists it in managed.files (un-migrated config).
    buildConsumerRepo(consumerDir, { managed: { files: ['TRACKING.md'] } });

    await assert.rejects(
      () => sync({
        consumerRepoPath: consumerDir,
        harnessRepoPath: harnessDir,
        mode: 'check',
        provenanceDeps: PROVENANCE_DEPS,
      }),
      (err) => {
        assert.ok(err instanceof SyncError, 'is a SyncError');
        assert.equal(err.code, 'ESYNC_RECLASSIFIED_TO_COMPOSED');
        assert.match(err.message, /TRACKING\.md/);
        assert.match(err.message, /composed\.files/);
        return true;
      },
    );
  });

  it('a target with NO template of either class still throws the raw ESYNC_MISSING_TEMPLATE', async () => {
    const harnessDir = tmp('cs108-harness-');
    const consumerDir = tmp('cs108-consumer-');
    // No template at all for the listed target.
    buildHarnessRepo(harnessDir, {});
    buildConsumerRepo(consumerDir, { managed: { files: ['NOSUCH.md'] } });

    await assert.rejects(
      () => sync({
        consumerRepoPath: consumerDir,
        harnessRepoPath: harnessDir,
        mode: 'check',
        provenanceDeps: PROVENANCE_DEPS,
      }),
      (err) => {
        assert.ok(err instanceof SyncError, 'is a SyncError');
        assert.equal(err.code, 'ESYNC_MISSING_TEMPLATE');
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------------
// (6) Sync-level migrated happy path (end-to-end, not just mergeComposed)
// ---------------------------------------------------------------------------

describe('CS108 (6) migrated config → sync() preserves a populated block + renders the core', () => {
  const tmpDirs = [];
  after(() => {
    for (const d of tmpDirs) {
      try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  function tmp(prefix) {
    const d = mkdtempSync(path.join(os.tmpdir(), prefix));
    tmpDirs.push(d);
    return d;
  }

  function writeText(filePath, content) {
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, 'utf8');
  }

  const PROVENANCE_DEPS = {
    installRoot: '/cs108-hermetic-harness-checkout',
    readFileSync: () => { throw new Error('no npx cache in hermetic fixture'); },
    execSync: (cmd) => {
      if (cmd.includes('rev-parse HEAD')) return `${'a'.repeat(40)}\n`;
      if (cmd.includes('describe --tags --exact-match')) return 'v0.1.0\n';
      if (cmd.includes('rev-parse --abbrev-ref')) return 'main\n';
      throw new Error(`unexpected git command in hermetic fixture: ${cmd}`);
    },
  };

  const composedBase = [
    '# TESTDOC',
    '',
    '> **File class:** composed — managed core + one project-local block.',
    '',
    'Managed core prose line — harness-owned, overwritten on every sync.',
    '',
    '## Local block',
    '',
    '<!-- harness:local-start id=testdoc.project -->',
    '_(Project-local notes. Empty by default.)_',
    '<!-- harness:local-end id=testdoc.project -->',
    '',
  ].join('\n');

  it('resolves composed.files + override end-to-end and keeps the consumer block body while the core matches the template', async () => {
    const harnessDir = tmp('cs108-h6-');
    const consumerDir = tmp('cs108-c6-');

    writeText(
      path.join(harnessDir, 'schemas', 'harness.config.schema.json'),
      readFileSync(path.join(repoRoot, 'schemas', 'harness.config.schema.json'), 'utf8'),
    );
    writeText(path.join(harnessDir, 'template', 'composed', 'TESTDOC.md'), composedBase);

    // Migrated consumer config: the doc lives in composed.files with its override.
    const consumerConfig = {
      version: 'v0.1.0',
      project: { name: 'test-project', agent_suffix: 'test' },
      managed: { files: [] },
      composed: { files: ['TESTDOC.md'], overrides: { 'TESTDOC.md': { local_blocks: ['testdoc.project'] } } },
      seeded: { files: [] },
      excluded: [],
      templating: {},
    };
    writeText(path.join(consumerDir, 'harness.config.json'), JSON.stringify(consumerConfig, null, 2) + '\n');

    // On-disk doc = the composed skeleton with a POPULATED project block.
    const projectNote = 'Consumer note living inside the testdoc.project block.';
    const onDisk = composedBase.replace('_(Project-local notes. Empty by default.)_', projectNote);
    writeText(path.join(consumerDir, 'TESTDOC.md'), onDisk);

    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'dry-run',
      provenanceDeps: PROVENANCE_DEPS,
    });

    const change = result.changes.find((c) => c.target === 'TESTDOC.md');
    assert.ok(change, 'TESTDOC.md is in the sync plan');
    assert.equal(change.class, 'composed');
    // The consumer's populated block body survives the composed merge…
    assert.ok(change.preview.includes(projectNote), 'populated block body preserved through sync()');
    // …and the harness-owned core is rendered from the template.
    assert.ok(change.preview.includes('Managed core prose line'), 'managed core rendered from template');
    assert.ok(change.preview.includes('<!-- harness:local-start id=testdoc.project -->'));
    // Steady state (on-disk already matches the merged output) → no rewrite needed,
    // and crucially NO EMERGE_LEGACY_UNMAPPED was thrown.
    assert.equal(change.action, 'skipped');
  });
});
