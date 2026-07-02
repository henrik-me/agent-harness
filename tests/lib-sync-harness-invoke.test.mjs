/**
 * tests/lib-sync-harness-invoke.test.mjs — CS83 (#370) coverage for the
 * `{{harness_invoke}}` templating default injected by lib/sync.mjs.
 *
 * Verifies:
 *  - computeHarnessInvokeDefault() ref resolution: a usable `config.version`
 *    becomes the pin ref; a missing/empty/`0.0.0-pre`/non-string version falls
 *    back to the literal reader placeholder `<ref>`.
 *  - The merged-under-config precedence `{ harness_invoke: default,
 *    ...config.templating }`: a config WITHOUT the key renders the computed
 *    default; a config that SETS the key (e.g. the self-host
 *    `node bin/harness.mjs`) overrides it. This is exercised BOTH via the real
 *    sync render site (a dry-run fixture) AND directly against applyTemplating.
 *  - No literal `{{harness_invoke}}` leaks to the rendered output (the
 *    non-strict-templating hazard that motivates the sync-side default).
 *
 * Fixtures + scratch live under os.tmpdir() ONLY (LRN-094). The real template
 * tree is never written.
 *
 * Run: node --test tests/lib-sync-harness-invoke.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

import { sync, computeHarnessInvokeDefault } from '../lib/sync.mjs';
import { applyTemplating } from '../lib/templating.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(prefix) {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}
function removeTmpDir(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}
function writeText(filePath, content) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}
function writeJSON(filePath, obj) {
  writeText(filePath, JSON.stringify(obj, null, 2) + '\n');
}

// A managed template that exercises the `{{harness_invoke}}` placeholder.
const INVOKE_TARGET = 'INSTRUCTIONS.md';
const INVOKE_TEMPLATE_BODY = 'Run `{{harness_invoke}} lint` before pushing.\n';

function buildHarnessRepo(dir) {
  const schema = readFileSync(
    path.join(repoRoot, 'schemas', 'harness.config.schema.json'),
    'utf8'
  );
  writeText(path.join(dir, 'schemas', 'harness.config.schema.json'), schema);
  writeText(path.join(dir, 'template', 'managed', INVOKE_TARGET), INVOKE_TEMPLATE_BODY);
}

function baseConfig(overrides = {}) {
  return {
    version: 'v0.1.0',
    project: { name: 'test-project', agent_suffix: 'test' },
    managed: { files: [INVOKE_TARGET] },
    composed: { files: [] },
    seeded: { files: [] },
    excluded: [],
    templating: {},
    ...overrides,
  };
}

/**
 * Run a dry-run sync against a fresh tmpdir fixture and return the rendered
 * preview for the managed INSTRUCTIONS.md target. This exercises the REAL merge
 * at the lib/sync.mjs render site (not a hand-rolled copy of the precedence).
 */
async function renderInvokeTemplate(configOverrides = {}) {
  const harnessDir = makeTmpDir('harness-invoke-h-');
  const consumerDir = makeTmpDir('harness-invoke-c-');
  try {
    buildHarnessRepo(harnessDir);
    writeJSON(path.join(consumerDir, 'harness.config.json'), baseConfig(configOverrides));
    const result = await sync({
      consumerRepoPath: consumerDir,
      harnessRepoPath: harnessDir,
      mode: 'dry-run',
    });
    const change = result.changes.find(c => c.target === INVOKE_TARGET);
    assert.ok(change, 'expected a change record for the managed template');
    return change.preview;
  } finally {
    removeTmpDir(harnessDir);
    removeTmpDir(consumerDir);
  }
}

// ---------------------------------------------------------------------------
// computeHarnessInvokeDefault() — pure unit
// ---------------------------------------------------------------------------

describe('computeHarnessInvokeDefault()', () => {
  it('uses a usable config.version as the pin ref', () => {
    assert.equal(
      computeHarnessInvokeDefault({ version: 'v1.2.3' }),
      'npx -y github:henrik-me/agent-harness#v1.2.3'
    );
  });

  it('accepts a full-SHA version as the pin ref', () => {
    assert.equal(
      computeHarnessInvokeDefault({ version: 'a3f4c8d2e1b0' }),
      'npx -y github:henrik-me/agent-harness#a3f4c8d2e1b0'
    );
  });

  it('trims surrounding whitespace from a usable version', () => {
    assert.equal(
      computeHarnessInvokeDefault({ version: '  v2.0.0  ' }),
      'npx -y github:henrik-me/agent-harness#v2.0.0'
    );
  });

  it('falls back to the literal <ref> when version is missing', () => {
    assert.equal(
      computeHarnessInvokeDefault({}),
      'npx -y github:henrik-me/agent-harness#<ref>'
    );
  });

  it('falls back to <ref> for an empty / whitespace-only version', () => {
    assert.equal(
      computeHarnessInvokeDefault({ version: '' }),
      'npx -y github:henrik-me/agent-harness#<ref>'
    );
    assert.equal(
      computeHarnessInvokeDefault({ version: '   ' }),
      'npx -y github:henrik-me/agent-harness#<ref>'
    );
  });

  it('falls back to <ref> for the 0.0.0-pre self-host placeholder', () => {
    assert.equal(
      computeHarnessInvokeDefault({ version: '0.0.0-pre' }),
      'npx -y github:henrik-me/agent-harness#<ref>'
    );
  });

  it('falls back to <ref> for a version outside the safe ref allowlist (no injection into the rendered command)', () => {
    for (const bad of ['v1.0.0; rm -rf /', 'v1 2', 'v1$(whoami)', 'v1`id`', 'main branch', 'v1&&x']) {
      assert.equal(
        computeHarnessInvokeDefault({ version: bad }),
        'npx -y github:henrik-me/agent-harness#<ref>',
        `unsafe version ${JSON.stringify(bad)} must fall back to <ref>`
      );
    }
  });

  it('accepts safe refs — tags, SHAs, and branch paths with slashes/dots/dashes/underscores', () => {
    for (const good of ['v0.11.0', 'a3f4c8d2e1b0', 'release/1.0', 'feature-x_y', 'v1.2.3-rc.1']) {
      assert.equal(
        computeHarnessInvokeDefault({ version: good }),
        `npx -y github:henrik-me/agent-harness#${good}`,
        `safe version ${JSON.stringify(good)} must be used as the pin`
      );
    }
  });

  it('tolerates a null / undefined config', () => {
    assert.equal(
      computeHarnessInvokeDefault(undefined),
      'npx -y github:henrik-me/agent-harness#<ref>'
    );
    assert.equal(
      computeHarnessInvokeDefault(null),
      'npx -y github:henrik-me/agent-harness#<ref>'
    );
  });

  it('ignores a non-string version', () => {
    assert.equal(
      computeHarnessInvokeDefault({ version: 123 }),
      'npx -y github:henrik-me/agent-harness#<ref>'
    );
  });
});

// ---------------------------------------------------------------------------
// Merge precedence — { harness_invoke: default, ...config.templating }
// (direct applyTemplating, mirroring the exact sync-side precedence)
// ---------------------------------------------------------------------------

describe('templatingVars merge precedence (applyTemplating direct)', () => {
  function mergedVars(config) {
    return {
      harness_invoke: computeHarnessInvokeDefault(config),
      ...(config.templating ?? {}),
    };
  }

  it('renders the computed default when config has no harness_invoke', () => {
    const vars = mergedVars({ version: 'v3.1.0', templating: {} });
    assert.equal(
      applyTemplating('{{harness_invoke}} lint', vars),
      'npx -y github:henrik-me/agent-harness#v3.1.0 lint'
    );
  });

  it('lets a config.templating.harness_invoke override win', () => {
    const vars = mergedVars({
      version: 'v3.1.0',
      templating: { harness_invoke: 'node bin/harness.mjs' },
    });
    assert.equal(
      applyTemplating('{{harness_invoke}} lint', vars),
      'node bin/harness.mjs lint'
    );
  });

  it('does not disturb sibling templating keys', () => {
    const vars = mergedVars({
      version: 'v3.1.0',
      templating: { project_name: 'sub-invaders' },
    });
    assert.equal(vars.project_name, 'sub-invaders');
    assert.equal(vars.harness_invoke, 'npx -y github:henrik-me/agent-harness#v3.1.0');
  });
});

// ---------------------------------------------------------------------------
// Real sync render site — the merge at lib/sync.mjs (dry-run fixture)
// ---------------------------------------------------------------------------

describe('sync() renders {{harness_invoke}} via the merged default', () => {
  it('consumer without the key renders the pin-aware npx form', async () => {
    const preview = await renderInvokeTemplate({ version: 'v0.11.0', templating: {} });
    assert.equal(
      preview,
      'Run `npx -y github:henrik-me/agent-harness#v0.11.0 lint` before pushing.\n'
    );
    assert.ok(!preview.includes('{{harness_invoke}}'), 'no literal placeholder may leak');
  });

  it('consumer with no usable version renders the <ref> fallback', async () => {
    const preview = await renderInvokeTemplate({ version: '0.0.0-pre', templating: {} });
    assert.equal(
      preview,
      'Run `npx -y github:henrik-me/agent-harness#<ref> lint` before pushing.\n'
    );
    assert.ok(!preview.includes('{{harness_invoke}}'), 'no literal placeholder may leak');
  });

  it('self-host override renders node bin/harness.mjs (default suppressed)', async () => {
    const preview = await renderInvokeTemplate({
      version: '0.0.0-pre',
      templating: { harness_invoke: 'node bin/harness.mjs' },
    });
    assert.equal(preview, 'Run `node bin/harness.mjs lint` before pushing.\n');
    assert.ok(!preview.includes('npx'), 'override must not render the npx default');
  });
});
