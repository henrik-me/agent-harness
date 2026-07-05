/**
 * tests/cs89-codeowners-composed.test.mjs — CS89.
 *
 * Verifies the composed CODEOWNERS template + sync-side codeowner defaults:
 *   (b) the rendered template contains the four secure-default rules;
 *   (c) computeCodeownerDefaults falls back to default_codeowner, a consumer-set
 *       key wins, and no literal {{security_codeowner}}/{{infra_codeowner}} leaks;
 *   (d) the codeowners.project block round-trips through mergeComposed with an
 *       extra project rule preserved and no EMERGE_LEGACY_UNMAPPED;
 *   (e) the rendered CODEOWNERS contains no raw <!-- ... --> line;
 *   (f) the managed→composed regeneration delivers the secure-default core
 *       (fresh-start), while wrapping the OLD managed core fails closed.
 *
 * Run: node --test tests/cs89-codeowners-composed.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { applyTemplating } from '../lib/templating.mjs';
import { computeCodeownerDefaults, computeHarnessInvokeDefault } from '../lib/sync.mjs';
import { parseComposed, mergeComposed, ComposedMergeError } from '../lib/composed.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const TEMPLATE_PATH = path.join(repoRoot, 'template', 'composed', '.github', 'CODEOWNERS');
const templateRaw = readFileSync(TEMPLATE_PATH, 'utf8');
const config = JSON.parse(readFileSync(path.join(repoRoot, 'harness.config.json'), 'utf8'));

const ALLOWED = ['codeowners.project'];

/** Replicate the lib/sync.mjs templatingVars construction (CS89 order). */
function syncVars(cfg) {
  return {
    harness_invoke: computeHarnessInvokeDefault(cfg),
    ...computeCodeownerDefaults(cfg),
    ...(cfg.templating ?? {}),
  };
}

describe('CS89 (b) composed CODEOWNERS — secure-default rules render', () => {
  it('renders the four secure-default rules to the resolved owners', () => {
    const rendered = applyTemplating(templateRaw, syncVars(config));
    const sec = config.templating.default_codeowner; // self-host: security/infra default to this
    assert.match(rendered, new RegExp(`^/\\.github/ @${sec}$`, 'm'));
    assert.match(rendered, new RegExp(`^/\\.github/workflows/ @${sec}$`, 'm'));
    assert.match(rendered, new RegExp(`^/SECURITY\\.md @${sec}$`, 'm'));
    assert.match(rendered, new RegExp(`^/infra/ @${sec}$`, 'm'));
    // the pre-existing core rules still render
    assert.match(rendered, new RegExp(`^\\* @${config.templating.default_codeowner}$`, 'm'));
    assert.match(rendered, new RegExp(`^/lib/ @${config.templating.lib_codeowner}$`, 'm'));
  });

  it('the template parses under parseComposed with only the codeowners.project block', () => {
    const parsed = parseComposed(templateRaw, { filename: 'CODEOWNERS' });
    assert.deepEqual([...parsed.blocks.keys()], ['codeowners.project']);
  });
});

describe('CS89 (c) security_codeowner/infra_codeowner default + override', () => {
  it('computeCodeownerDefaults falls back both keys to default_codeowner', () => {
    assert.deepEqual(
      computeCodeownerDefaults({ templating: { default_codeowner: 'acme' } }),
      { security_codeowner: 'acme', infra_codeowner: 'acme' }
    );
  });

  it('returns {} when default_codeowner is unset (no fabricated owner)', () => {
    assert.deepEqual(computeCodeownerDefaults({ templating: {} }), {});
    assert.deepEqual(computeCodeownerDefaults({}), {});
    assert.deepEqual(computeCodeownerDefaults(), {});
    assert.deepEqual(computeCodeownerDefaults({ templating: { default_codeowner: '' } }), {});
  });

  it('a consumer-set security_codeowner/infra_codeowner wins over the default', () => {
    const cfg = {
      templating: {
        default_codeowner: 'def',
        lib_codeowner: 'lib',
        security_codeowner: 'sec-team',
        infra_codeowner: 'infra-user',
      },
    };
    const rendered = applyTemplating(templateRaw, syncVars(cfg));
    assert.match(rendered, /^\/\.github\/ @sec-team$/m);
    assert.match(rendered, /^\/\.github\/workflows\/ @sec-team$/m);
    assert.match(rendered, /^\/SECURITY\.md @sec-team$/m);
    assert.match(rendered, /^\/infra\/ @infra-user$/m);
  });

  it('a consumer that sets only default_codeowner ships no literal {{…}} placeholder', () => {
    const cfg = { templating: { default_codeowner: 'solo', lib_codeowner: 'solo' } };
    const rendered = applyTemplating(templateRaw, syncVars(cfg));
    assert.ok(!rendered.includes('{{security_codeowner}}'), 'no literal security placeholder');
    assert.ok(!rendered.includes('{{infra_codeowner}}'), 'no literal infra placeholder');
    assert.match(rendered, /^\/\.github\/ @solo$/m);
    assert.match(rendered, /^\/infra\/ @solo$/m);
  });
});

describe('CS89 (d) codeowners.project block survives mergeComposed', () => {
  it('preserves a consumer rule added inside the block (no EMERGE_LEGACY_UNMAPPED)', () => {
    const rendered = applyTemplating(templateRaw, syncVars(config));
    const endMarker = '# harness:local-end id=codeowners.project';
    const extraRule = '/game/assets/ @art-team';
    // "current" file = same skeleton, extra project rule inside the block body.
    const current = rendered.replace(endMarker, `${extraRule}\n${endMarker}`);
    assert.notEqual(current, rendered);

    const result = mergeComposed(rendered, current, {
      allowedBlockIds: ALLOWED,
      lockRecords: null,
      lockTemplateProseHash: null,
    });
    assert.ok(result.content.includes(extraRule), 'extra project rule preserved');
    // secure-default core survives the merge
    assert.match(result.content, /^\/SECURITY\.md @/m);
    assert.match(result.content, /^\/\.github\/ @/m);
  });
});

describe('CS89 (e) rendered CODEOWNERS has no HTML marker leak', () => {
  it('contains no raw <!-- ... --> line', () => {
    const rendered = applyTemplating(templateRaw, syncVars(config));
    assert.ok(!/<!--/.test(rendered), 'rendered CODEOWNERS must not contain an HTML comment');
  });
});

describe('CS89 (f) managed→composed transition (regeneration, not append)', () => {
  it('regeneration (empty current → fresh-start) delivers the secure-default core', () => {
    const rendered = applyTemplating(templateRaw, syncVars(config));
    const result = mergeComposed(rendered, '', {
      allowedBlockIds: ALLOWED,
      lockRecords: null,
      lockTemplateProseHash: null,
    });
    for (const rule of ['/.github/ @', '/.github/workflows/ @', '/SECURITY.md @', '/infra/ @']) {
      assert.ok(result.content.includes(rule), `secure-default rule "${rule}" present`);
    }
    assert.ok(result.content.includes('# harness:local-start id=codeowners.project'));
    // fresh-start is byte-identical to the render (the C89-5 regeneration path)
    assert.equal(result.content, rendered);
  });

  it('WITHOUT regeneration, wrapping the OLD managed core fails closed (EMERGE_LEGACY_UNMAPPED)', () => {
    const rendered = applyTemplating(templateRaw, syncVars(config));
    // The pre-CS89 minimal managed core (no local block), as a "current" file.
    const oldManaged = [
      '# CODEOWNERS — managed by the harness.',
      '',
      '* @henrik-me',
      '',
      '/lib/ @henrik-me',
      '',
    ].join('\n');
    assert.throws(
      () => mergeComposed(rendered, oldManaged, {
        allowedBlockIds: ALLOWED,
        lockRecords: null, // prior lock entry was class managed → no block records
        lockTemplateProseHash: null,
      }),
      (err) => err instanceof ComposedMergeError && err.code === 'EMERGE_LEGACY_UNMAPPED'
    );
  });
});
