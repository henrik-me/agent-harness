/**
 * tests/cs24-changelog-touch-enforcement.test.mjs
 *
 * Tests for the CS24 / LRN-101 CHANGELOG-touch enforcement added to
 * scripts/check-clickstop.mjs and the lib/distributed-surface-globs.mjs helper.
 *
 * Fixture trees live under tests/fixtures/cs24/<case>/{active,done}/. Each case
 * is a complete, otherwise-valid clickstop so that only the CHANGELOG dimension
 * varies. The linter is spawned via spawnSync (same pattern as
 * check-clickstop.test.mjs).
 *
 * Run: node --test tests/cs24-changelog-touch-enforcement.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DISTRIBUTED_SURFACE_GLOBS,
  matchesDistributedSurface,
  extractDeliverablePathTokens,
} from '../lib/distributed-surface-globs.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const LINTER = path.join(REPO_ROOT, 'scripts', 'check-clickstop.mjs');
const FIXTURES = path.join(__dirname, 'fixtures', 'cs24');
const NODE = process.execPath;

const CHANGELOG_ERROR = 'CHANGELOG-touch task row';

/**
 * Run the linter against a fixture case directory.
 *
 * @param {string} caseName
 * @returns {{ stdout: string, stderr: string, status: number }}
 */
function runCase(caseName) {
  const result = spawnSync(NODE, [LINTER, '--dir', path.join(FIXTURES, caseName)], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? -1,
  };
}

// ---------------------------------------------------------------------------
// Fixture-based enforcement tests
// ---------------------------------------------------------------------------

describe('CS24 CHANGELOG-touch enforcement (fixtures)', () => {
  // --- Valid cases: linter emits NO CHANGELOG error, exit 0 -----------------

  it('1. active + distributed deliverable + CHANGELOG row → passes', () => {
    const r = runCase('valid-touches-distributed-with-changelog');
    assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\n${r.stdout}\n${r.stderr}`);
    assert.ok(!r.stdout.includes(CHANGELOG_ERROR), `Unexpected CHANGELOG error:\n${r.stdout}`);
  });

  it('2. done + distributed deliverable + closed before enforcement date → grandfathered', () => {
    const r = runCase('valid-grandfathered');
    assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\n${r.stdout}\n${r.stderr}`);
    assert.ok(!r.stdout.includes(CHANGELOG_ERROR), `Unexpected CHANGELOG error:\n${r.stdout}`);
  });

  it('3. active + internal-only deliverables + no CHANGELOG row → passes', () => {
    const r = runCase('valid-internal-only-no-changelog');
    assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\n${r.stdout}\n${r.stderr}`);
    assert.ok(!r.stdout.includes(CHANGELOG_ERROR), `Unexpected CHANGELOG error:\n${r.stdout}`);
  });

  it('4. active + internal-only deliverables + CHANGELOG row present anyway → passes', () => {
    const r = runCase('valid-internal-only-with-changelog');
    assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\n${r.stdout}\n${r.stderr}`);
    assert.ok(!r.stdout.includes(CHANGELOG_ERROR), `Unexpected CHANGELOG error:\n${r.stdout}`);
  });

  // --- Invalid cases: linter emits the CHANGELOG error, exit 1 --------------

  it('5. active + distributed deliverable + no CHANGELOG row → fails', () => {
    const r = runCase('invalid-active-distributed-no-changelog');
    assert.equal(r.status, 1, `Expected exit 1; got ${r.status}\n${r.stdout}\n${r.stderr}`);
    assert.ok(r.stdout.includes(CHANGELOG_ERROR), `Expected CHANGELOG error; got:\n${r.stdout}`);
  });

  it('6. done recent + distributed deliverable + no CHANGELOG row → fails', () => {
    const r = runCase('invalid-done-recent-distributed-no-changelog');
    assert.equal(r.status, 1, `Expected exit 1; got ${r.status}\n${r.stdout}\n${r.stderr}`);
    assert.ok(r.stdout.includes(CHANGELOG_ERROR), `Expected CHANGELOG error; got:\n${r.stdout}`);
  });

  it('7. done recent + distributed + Tasks present but no CHANGELOG row → fails', () => {
    const r = runCase('invalid-done-recent-no-tasks-changelog');
    assert.equal(r.status, 1, `Expected exit 1; got ${r.status}\n${r.stdout}\n${r.stderr}`);
    assert.ok(r.stdout.includes(CHANGELOG_ERROR), `Expected CHANGELOG error; got:\n${r.stdout}`);
  });

  it('8. done recent + distributed + misnamed changelog row (no verb) → fails', () => {
    const r = runCase('invalid-done-recent-misnamed-changelog-row');
    assert.equal(r.status, 1, `Expected exit 1; got ${r.status}\n${r.stdout}\n${r.stderr}`);
    assert.ok(r.stdout.includes(CHANGELOG_ERROR), `Expected CHANGELOG error; got:\n${r.stdout}`);
  });

  it('8a. active + scripts glob deliverable (scripts/*.mjs) + no CHANGELOG row → fails', () => {
    // Regression (GPT-5.5 rubber-duck, CS24): a glob-form deliverable token
    // must be extracted intact and recognised as distributed surface.
    const r = runCase('invalid-active-scripts-glob-no-changelog');
    assert.equal(r.status, 1, `Expected exit 1; got ${r.status}\n${r.stdout}\n${r.stderr}`);
    assert.ok(r.stdout.includes(CHANGELOG_ERROR), `Expected CHANGELOG error; got:\n${r.stdout}`);
  });
});

// ---------------------------------------------------------------------------
// no-Deliverables-section skip (runtime-generated fixture under os.tmpdir)
// ---------------------------------------------------------------------------

describe('CS24 CHANGELOG-touch enforcement (no Deliverables section)', () => {
  it('9. done recent with no ## Deliverables section → cannot determine → skipped', () => {
    // LRN-094: transient fixtures must NOT be written under REPO_ROOT (a
    // concurrent text-encoding walk would ENOENT-race on them).
    const root = path.join(os.tmpdir(), 'cs24-no-deliverables', 'tree');
    const doneDir = path.join(root, 'done');
    fs.rmSync(root, { recursive: true, force: true });
    fs.mkdirSync(doneDir, { recursive: true });
    fs.writeFileSync(
      path.join(doneDir, 'done_cs24099_no-deliverables.md'),
      [
        '# CS24099 — no Deliverables section',
        '',
        '**Status:** done',
        '**Owner:** test-ah',
        '**Branch:** cs24099/fixture',
        '**Started:** 2026-07-20',
        '**Closed:** 2026-08-01',
        '**Depends on:** —',
        '',
        '## Tasks',
        '',
        '| Task | State | Owner | Notes |',
        '|---|---|---|---|',
        '| T1 — do the thing | done | test-ah | core |',
        '| Close-out: docs + restart state | done | test-ah | Update WORKBOARD.md, CONTEXT.md |',
        '| Close-out: learnings + follow-ups | done | test-ah | Disposition learnings in LEARNINGS.md |',
        '',
        '## Plan-vs-implementation review',
        '',
        '**Reviewer:** rubber-duck (test)',
        '**Date:** 2026-08-01',
        '**Outcome:** GO',
        '',
      ].join('\n'),
      'utf8'
    );

    const result = spawnSync(NODE, [LINTER, '--dir', root], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    const stdout = result.stdout ?? '';
    assert.equal(result.status, 0, `Expected exit 0; got ${result.status}\n${stdout}\n${result.stderr}`);
    assert.ok(!stdout.includes(CHANGELOG_ERROR), `Unexpected CHANGELOG error:\n${stdout}`);

    fs.rmSync(root, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// Unit tests for lib/distributed-surface-globs.mjs
// ---------------------------------------------------------------------------

describe('matchesDistributedSurface (unit)', () => {
  it('10. exports the documented candidate globs', () => {
    for (const g of [
      'template/**', 'lib/**', 'scripts/**', 'bin/**',
      'scaffolds/**', 'schemas/**', 'package.json', 'package-lock.json',
    ]) {
      assert.ok(DISTRIBUTED_SURFACE_GLOBS.includes(g), `missing glob: ${g}`);
    }
  });

  it('11. matches distributed file/glob/dir tokens', () => {
    assert.equal(matchesDistributedSurface('scripts/foo.mjs', []), true);
    assert.equal(matchesDistributedSurface('lib/bar.mjs', []), true);
    assert.equal(matchesDistributedSurface('template/composed/OPERATIONS.md', []), true);
    assert.equal(matchesDistributedSurface('template/**', []), true);
    assert.equal(matchesDistributedSurface('schemas/x.schema.json', []), true);
    assert.equal(matchesDistributedSurface('bin/harness.mjs', []), true);
    assert.equal(matchesDistributedSurface('scaffolds/a/b.mjs', []), true);
    assert.equal(matchesDistributedSurface('package.json', []), true);
  });

  it('12. restricts scripts/ to *.mjs files', () => {
    assert.equal(matchesDistributedSurface('scripts/foo.mjs', []), true);
    assert.equal(matchesDistributedSurface('scripts/foo.sh', []), false);
    assert.equal(matchesDistributedSurface('scripts/README.md', []), false);
  });

  it('12a. matches broad scripts glob/dir tokens; exempts non-.mjs glob/file', () => {
    // Regression (GPT-5.5 rubber-duck, CS24): glob-form scripts tokens must
    // count as distributed surface so a `scripts/**` or `scripts/*.mjs`
    // deliverable cannot skip the CHANGELOG-touch row.
    assert.equal(matchesDistributedSurface('scripts/**', []), true);
    assert.equal(matchesDistributedSurface('scripts/*.mjs', []), true);
    assert.equal(matchesDistributedSurface('scripts/*', []), true);
    assert.equal(matchesDistributedSurface('scripts/', []), true);
    assert.equal(matchesDistributedSurface('scripts/foo.sh', []), false);
    assert.equal(matchesDistributedSurface('scripts/README.md', []), false);
  });

  it('13. does not match internal-only paths', () => {
    assert.equal(matchesDistributedSurface('LEARNINGS.md', []), false);
    assert.equal(matchesDistributedSurface('CONTEXT.md', []), false);
    assert.equal(matchesDistributedSurface('WORKBOARD.md', []), false);
    assert.equal(matchesDistributedSurface('project/clickstops/done/done_cs1_x.md', []), false);
    assert.equal(matchesDistributedSurface('tests/fixtures/cs24/', []), false);
  });

  it('14. subtracts the excluded list (file + directory entries)', () => {
    assert.equal(matchesDistributedSurface('package.json', ['package.json']), false);
    assert.equal(matchesDistributedSurface('lib/foo.mjs', ['lib/']), false);
    assert.equal(matchesDistributedSurface('lib/foo.mjs', ['lib']), false);
    // An excluded sibling does not suppress a non-excluded distributed path.
    assert.equal(matchesDistributedSurface('lib/foo.mjs', ['package.json']), true);
  });

  it('15. handles empty / non-string tokens defensively', () => {
    assert.equal(matchesDistributedSurface('', []), false);
    assert.equal(matchesDistributedSurface(undefined, []), false);
    assert.equal(matchesDistributedSurface(null, []), false);
  });
});

describe('extractDeliverablePathTokens (unit)', () => {
  it('16. extracts package.json whole, not truncated to package.js', () => {
    // Regression (GPT-5.5 rubber-duck R2, CS24): the extension alternative must
    // prefer full extensions over prefixes so `package.json` is not read as
    // `package.js` (which is NOT distributed surface).
    const tokens = extractDeliverablePathTokens('- `package.json`\n');
    assert.ok(tokens.includes('package.json'), `expected package.json in ${JSON.stringify(tokens)}`);
    assert.ok(!tokens.includes('package.js'), `unexpected package.js in ${JSON.stringify(tokens)}`);
  });

  it('17. extracts package-lock.json whole', () => {
    const tokens = extractDeliverablePathTokens('- `package-lock.json`\n');
    assert.ok(tokens.includes('package-lock.json'), JSON.stringify(tokens));
    assert.ok(!tokens.includes('package-lock.js'), JSON.stringify(tokens));
  });

  it('18. extracts concrete and glob .mjs tokens', () => {
    assert.ok(extractDeliverablePathTokens('- `scripts/foo.mjs`\n').includes('scripts/foo.mjs'));
    assert.ok(extractDeliverablePathTokens('- `scripts/*.mjs`\n').includes('scripts/*.mjs'));
  });

  it('19. extracts full .yaml / .md extensions whole', () => {
    assert.ok(extractDeliverablePathTokens('- `config.yaml`\n').includes('config.yaml'));
    assert.ok(extractDeliverablePathTokens('- `notes.md`\n').includes('notes.md'));
  });

  it('20. ignores paths mentioned in non-list, non-table prose', () => {
    assert.deepEqual(extractDeliverablePathTokens('See package.json for details.'), []);
  });

  it('21. pipeline: extracted package.json matches distributed surface when not excluded', () => {
    const first = extractDeliverablePathTokens('- `package.json`\n')[0];
    assert.equal(matchesDistributedSurface(first, []), true);
  });

  // --- R3 convergence matrix: matchesDistributedSurface is the SOLE classifier
  // and only MAXIMAL whole tokens are extracted, so no distributed prefix is
  // ever split out of a longer non-distributed path. ------------------------

  const BT = String.fromCharCode(96);
  const pipelineHit = (p) =>
    extractDeliverablePathTokens(`- ${BT}${p}${BT}\n`).some((t) =>
      matchesDistributedSurface(t, [])
    );

  it('22. pipeline classifies distributed deliverable tokens as true', () => {
    for (const p of [
      'scripts/foo.mjs',
      'scripts/**',
      'scripts/*.mjs',
      'scripts/*',
      'scripts/',
      'lib/x.mjs',
      'template/**',
      'template/composed/OPERATIONS.md',
      'schemas/x.schema.json',
      'bin/harness.mjs',
      'package.json',
      'package-lock.json',
    ]) {
      assert.equal(pipelineHit(p), true, `expected distributed: ${p}`);
    }
  });

  it('23. pipeline classifies non-distributed deliverable tokens as false', () => {
    for (const p of [
      'scripts/foo.sh',
      'scripts/README.md',
      'scripts/*.sh',
      'package.json.bak',
      'scripts/foo.mjs.bak',
      'LEARNINGS.md',
      'CONTEXT.md',
      'tests/fixtures/cs24/',
    ]) {
      assert.equal(pipelineHit(p), false, `expected non-distributed: ${p}`);
    }
  });

  it('24. strips a trailing sentence period without losing the extension', () => {
    const tokens = extractDeliverablePathTokens('- Update scripts/foo.mjs.\n');
    assert.ok(
      tokens.includes('scripts/foo.mjs'),
      `expected scripts/foo.mjs in ${JSON.stringify(tokens)}`
    );
    assert.equal(pipelineHit('scripts/foo.mjs'), true);
  });

  it('25. prefix safety: never splits a distributed prefix from a non-distributed path', () => {
    assert.ok(
      !extractDeliverablePathTokens(`- ${BT}scripts/foo.sh${BT}\n`).includes('scripts/'),
      'must not extract scripts/ from scripts/foo.sh'
    );
    assert.ok(
      !extractDeliverablePathTokens(`- ${BT}package.json.bak${BT}\n`).includes('package.json'),
      'must not extract package.json from package.json.bak'
    );
    assert.ok(
      !extractDeliverablePathTokens(`- ${BT}scripts/foo.mjs.bak${BT}\n`).includes('scripts/foo.mjs'),
      'must not extract scripts/foo.mjs from scripts/foo.mjs.bak'
    );
  });

  it('26. extracts non-.mjs and directory tokens whole (classifier decides)', () => {
    assert.ok(
      extractDeliverablePathTokens(`- ${BT}scripts/foo.sh${BT}\n`).includes('scripts/foo.sh')
    );
    assert.ok(
      extractDeliverablePathTokens(`- ${BT}package.json.bak${BT}\n`).includes('package.json.bak')
    );
    assert.ok(
      extractDeliverablePathTokens(`- ${BT}tests/fixtures/cs24/${BT}\n`).includes(
        'tests/fixtures/cs24/'
      )
    );
  });

  // --- R4: balanced Markdown emphasis (`**path**`, `*path*`, `__path__`,
  // `_path_`) is stripped so bold/italic-wrapped distributed deliverables are
  // not false-negatives, while unbalanced trailing globs (`scripts/**`) are
  // preserved. Real style: done_cs35b uses `**template/composed/OPERATIONS.md**`
  // and `| D | **lib/hooks.mjs** |` table rows. -----------------------------

  it('27. list-item bold deliverable is unwrapped and classified distributed', () => {
    const tokens = extractDeliverablePathTokens(
      '- **template/composed/OPERATIONS.md**\n'
    );
    assert.ok(
      tokens.includes('template/composed/OPERATIONS.md'),
      `expected unwrapped token in ${JSON.stringify(tokens)}`
    );
    for (const t of tokens) {
      assert.ok(!/^\*|\*$/.test(t), `token must have no leading/trailing * : ${t}`);
    }
    assert.equal(pipelineHit('**template/composed/OPERATIONS.md**'), true);
  });

  it('28. table-cell bold deliverable (done_cs35b style) is classified distributed', () => {
    const tokens = extractDeliverablePathTokens(
      '| D | **lib/hooks.mjs** | delete the hook |\n'
    );
    assert.ok(
      tokens.includes('lib/hooks.mjs'),
      `expected lib/hooks.mjs in ${JSON.stringify(tokens)}`
    );
    assert.equal(
      tokens.some((t) => matchesDistributedSurface(t, [])),
      true
    );
  });

  it('29. italic single-* and underscore emphasis are unwrapped', () => {
    assert.ok(
      extractDeliverablePathTokens('- *scripts/foo.mjs*\n').includes('scripts/foo.mjs')
    );
    assert.ok(extractDeliverablePathTokens('- _lib/x.mjs_\n').includes('lib/x.mjs'));
    assert.ok(
      extractDeliverablePathTokens('- __bin/harness.mjs__\n').includes('bin/harness.mjs')
    );
    assert.equal(pipelineHit('*scripts/foo.mjs*'), true);
    assert.equal(pipelineHit('_lib/x.mjs_'), true);
    assert.equal(pipelineHit('__bin/harness.mjs__'), true);
  });

  it('30. glob preservation: unbalanced trailing globs are NOT stripped as emphasis', () => {
    // `**` inside a bold wrapper is unwrapped to reveal the inner glob.
    assert.ok(
      extractDeliverablePathTokens('- **scripts/*.mjs**\n').includes('scripts/*.mjs'),
      'bold-wrapped scripts/*.mjs should unwrap to scripts/*.mjs'
    );
    // Bare trailing globs have NO matching leading marker -> preserved verbatim.
    assert.ok(
      extractDeliverablePathTokens('- scripts/**\n').includes('scripts/**'),
      'bare scripts/** must be preserved'
    );
    assert.ok(
      extractDeliverablePathTokens('- scripts/*\n').includes('scripts/*'),
      'bare scripts/* must be preserved'
    );
    assert.equal(pipelineHit('scripts/**'), true);
    assert.equal(pipelineHit('scripts/*'), true);
  });

  it('31. combined emphasis + trailing sentence dot both stripped', () => {
    assert.ok(
      extractDeliverablePathTokens('- Update **scripts/foo.mjs**.\n').includes(
        'scripts/foo.mjs'
      ),
      'emphasis and trailing dot must both be stripped (dot outside wrapper)'
    );
    assert.ok(
      extractDeliverablePathTokens('- **scripts/foo.mjs.**\n').includes('scripts/foo.mjs'),
      'emphasis and trailing dot must both be stripped (dot inside wrapper)'
    );
  });

  it('32. non-distributed tokens under emphasis stay false', () => {
    assert.equal(pipelineHit('**scripts/foo.sh**'), false);
    assert.equal(pipelineHit('**package.json.bak**'), false);
  });
});
