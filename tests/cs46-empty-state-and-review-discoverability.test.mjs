/**
 * tests/cs46-empty-state-and-review-discoverability.test.mjs — CS46 fixture-based tests
 *
 * Verifies issue #146 deliverables:
 *   1. Seeded WORKBOARD.md template passes check-workboard.mjs cleanly with no
 *      data rows in the Active Work table (canonical empty state per C46-1).
 *   2. `_(none)_` placeholder row produces an error mentioning the new C46-3
 *      empty-table hint (header-only / em-dash forms).
 *   3. Clickstop with `**Verdict:**` instead of `**Outcome:**` produces an error
 *      containing the C46-4 verbatim-labels hint.
 *   4. Minimally-valid done/ clickstop fixture using the canonical OPERATIONS.md
 *      Plan-vs-impl review skeleton (with required close-out hygiene task rows
 *      per check-clickstop.mjs:201-208) passes lint AND does NOT pass via the
 *      grandfathering fallback (asserts exact-label enforcement per rubber-duck
 *      finding #3).
 *   5. (C46-8 acceptance) `harness init` end-to-end against a fresh os.tmpdir()
 *      target produces a consumer dir whose seeded WORKBOARD.md and seeded
 *      project/clickstops/ tree pass `harness lint --quiet` without errors.
 *
 * All scratch dirs use os.tmpdir() per LRN-094 — never write under REPO_ROOT
 * (race with check-text-encoding's recursive walk under parallel `node --test`).
 *
 * Run: node --test tests/cs46-empty-state-and-review-discoverability.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const WORKBOARD_LINTER = path.join(REPO_ROOT, 'scripts', 'check-workboard.mjs');
const CLICKSTOP_LINTER = path.join(REPO_ROOT, 'scripts', 'check-clickstop.mjs');
const HARNESS_BIN = path.join(REPO_ROOT, 'bin', 'harness.mjs');
const SEEDED_WORKBOARD = path.join(REPO_ROOT, 'template', 'seeded', 'WORKBOARD.md');
const NODE = process.execPath;

function runWorkboardLinter(args) {
  const r = spawnSync(NODE, [WORKBOARD_LINTER, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status ?? -1 };
}

function runClickstopLinter(args) {
  const r = spawnSync(NODE, [CLICKSTOP_LINTER, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status ?? -1 };
}

/**
 * Write a transient WORKBOARD.md fixture under os.tmpdir() (per LRN-094).
 */
function writeWorkboardFixture(label, body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cs46-wb-${label}-`));
  const filePath = path.join(dir, 'WORKBOARD.md');
  fs.writeFileSync(filePath, body, 'utf8');
  return { dir, filePath };
}

/**
 * Write a transient done/ clickstop fixture tree under os.tmpdir() (per LRN-094).
 * Returns the root containing done/ subdirectory.
 */
function writeDoneClickstopFixture(label, body) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `cs46-cs-${label}-`));
  const doneDir = path.join(root, 'done');
  fs.mkdirSync(doneDir, { recursive: true });
  fs.writeFileSync(path.join(doneDir, 'done_cs99_cs46-fixture.md'), body, 'utf8');
  return root;
}

// Minimum done/ fixture body that passes ALL upstream gates EXCEPT the
// Plan-vs-implementation review section (which the test injects). Mirrors
// the canonical front-matter + close-out hygiene task rows per
// check-clickstop.mjs:201-221 (rubber-duck finding #3 — fixture must satisfy
// every other gate so failures isolate the gate under test).
function buildDoneFixtureBody(planVsImplSection) {
  return [
    '# CS99 — CS46 fixture',
    '',
    '**Status:** done',
    '**Owner:** test-agent',
    '**Branch:** test/fixture',
    '**Started:** 2026-05-14',
    '**Closed:** 2026-05-14',
    '**Depends on:** —',
    '',
    '## Goal',
    '',
    'CS46 test fixture (synthetic).',
    '',
    '## Deliverables',
    '',
    '1. The thing.',
    '',
    '## Exit criteria',
    '',
    '1. Done.',
    '',
    '## Tasks',
    '',
    '| Task | State | Owner | Notes |',
    '|---|---|---|---|',
    '| Implement the thing | done | test-agent | _(none)_ |',
    '| Close-out: docs + restart state | done | test-agent | per OPERATIONS.md § Claim |',
    '| Close-out: learnings + follow-ups | done | test-agent | per OPERATIONS.md § Claim |',
    '',
    '## Notes / Learnings',
    '',
    '- (none)',
    '',
    planVsImplSection,
    '',
  ].join('\n');
}

describe('CS46 — workboard empty-state + Plan-vs-impl review discoverability', () => {

  // -------------------------------------------------------------------------
  // C46-1: seeded WORKBOARD.md template passes check-workboard cleanly with
  // header-only canonical empty state (Active Work table has zero data rows).
  // -------------------------------------------------------------------------
  it('1. seeded WORKBOARD.md template (header-only empty state) passes check-workboard with 0 errors', () => {
    assert.ok(
      fs.existsSync(SEEDED_WORKBOARD),
      `Expected seeded template at ${SEEDED_WORKBOARD}`
    );
    const r = runWorkboardLinter(['--file', SEEDED_WORKBOARD]);
    assert.equal(
      r.status, 0,
      `Seeded WORKBOARD.md must pass check-workboard cleanly; got status=${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('0 errors'),
      `Expected "0 errors" in linter output; got:\n${r.stdout}`
    );
    // Sanity: confirm the seeded template is actually using the header-only
    // canonical empty state (no data rows under the table separator).
    const body = fs.readFileSync(SEEDED_WORKBOARD, 'utf8');
    const activeWorkBlock = body.match(/## Active Work[\s\S]*?(?=\n## |\n> |\n_No active|$)/);
    assert.ok(activeWorkBlock, 'Could not locate ## Active Work block in seeded template');
    // Strip the HTML comment block first (per C46-1 documentation), then split
    // off the table region between the header-separator line and the next
    // markdown heading or paragraph.
    const stripped = activeWorkBlock[0].replace(/<!--[\s\S]*?-->/g, '');
    const tableLines = stripped.split('\n')
      .filter((line) => /^\s*\|/.test(line));
    assert.ok(
      tableLines.length === 2,
      `Expected exactly 2 pipe-rows (header + separator) in canonical empty state; got ${tableLines.length}:\n${tableLines.join('\n')}`
    );
  });

  // -------------------------------------------------------------------------
  // C46-3: `_(none)_` in CS-Task ID column produces an error AND that error
  // surfaces the new empty-table hint substring.
  // -------------------------------------------------------------------------
  it('2. _(none)_ placeholder row produces error containing C46-3 empty-table hint', () => {
    const body = [
      '# Work Board',
      '',
      '## Orchestrators',
      '',
      '| Agent ID | Machine | Repo Folder | Status | Last Seen |',
      '|----------|---------|-------------|--------|-----------|',
      '| test-ag  | TEST-PC | C:\\src\\test | 🟢 Active | 2026-05-14 |',
      '',
      '## Active Work',
      '',
      '| CS-Task ID | Title | State | Owner | Branch | Last Updated | Blocked Reason |',
      '|------------|-------|-------|-------|--------|--------------|----------------|',
      '| _(none)_ | placeholder | — | — | — | _(set on claim)_ | _(none)_ |',
      '',
    ].join('\n');
    const fx = writeWorkboardFixture('none-placeholder', body);
    try {
      const r = runWorkboardLinter(['--file', fx.filePath]);
      assert.equal(
        r.status, 1,
        `Expected exit 1 on _(none)_ placeholder; got ${r.status}\nstdout: ${r.stdout}`
      );
      assert.ok(
        r.stdout.includes('For an empty Active Work table'),
        `Expected new C46-3 empty-table hint substring "For an empty Active Work table"; got:\n${r.stdout}`
      );
      assert.ok(
        r.stdout.includes('header rows only'),
        `Expected new hint to mention "header rows only"; got:\n${r.stdout}`
      );
      assert.ok(
        r.stdout.includes('em-dash row') && r.stdout.includes('no active CS'),
        `Expected new hint to mention em-dash variant + "no active CS"; got:\n${r.stdout}`
      );
      assert.ok(
        r.stdout.includes('template/seeded/WORKBOARD.md'),
        `Expected new hint to point at template/seeded/WORKBOARD.md; got:\n${r.stdout}`
      );
    } finally {
      fs.rmSync(fx.dir, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // C46-4: clickstop with `**Verdict:**` instead of `**Outcome:**` produces
  // error containing the verbatim-labels hint.
  // -------------------------------------------------------------------------
  it('3. done/ clickstop with **Verdict:** alias triggers C46-4 verbatim-labels hint', () => {
    const planVsImpl = [
      '## Plan-vs-implementation review',
      '',
      '**Reviewer:** GPT-5.5 (rubber-duck)',
      '**Date:** 2026-05-14',
      '**Verdict:** GO',
      '',
      'Wrong label: should be **Outcome:** not **Verdict:**.',
    ].join('\n');
    const root = writeDoneClickstopFixture('verdict-alias', buildDoneFixtureBody(planVsImpl));
    try {
      const r = runClickstopLinter(['--dir', root]);
      assert.equal(
        r.status, 1,
        `Expected exit 1 on **Verdict:** alias; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
      );
      assert.ok(
        r.stdout.includes('matched verbatim'),
        `Expected new C46-4 hint "matched verbatim"; got:\n${r.stdout}`
      );
      assert.ok(
        r.stdout.includes('**Reviewer:**') &&
        r.stdout.includes('**Date:**') &&
        r.stdout.includes('**Outcome:**'),
        `Expected hint to enumerate all three required labels verbatim; got:\n${r.stdout}`
      );
      assert.ok(
        r.stdout.includes('OPERATIONS.md') && r.stdout.includes('canonical skeleton'),
        `Expected hint to reference OPERATIONS.md canonical skeleton; got:\n${r.stdout}`
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // C46-5 / C46-2: minimally-valid done/ clickstop using verbatim canonical
  // skeleton from OPERATIONS.md passes lint cleanly. Asserts the satisfied
  // path is via the exact-labels branch, NOT via the grandfathering fallback.
  // -------------------------------------------------------------------------
  it('4. done/ clickstop using verbatim canonical OPERATIONS.md skeleton passes lint via exact-label match (not grandfathering)', () => {
    const planVsImpl = [
      '## Plan-vs-implementation review',
      '',
      '**Reviewer:** GPT-5.5 (rubber-duck)',
      '**Date:** 2026-05-14T19:00:00Z',
      '**Outcome:** GO',
      '',
      'Per-deliverable outcome: all match.',
      'Test-coverage: sufficient.',
    ].join('\n');
    const fixtureBody = buildDoneFixtureBody(planVsImpl);

    // Sanity: ensure we are NOT relying on the grandfathering fallback line.
    const GRANDFATHERING = '> Grandfathered: closed before plan-vs-implementation review gate was introduced (CS03b).';
    assert.ok(
      !fixtureBody.includes(GRANDFATHERING),
      'Fixture must not contain the grandfathering line — that would mask the exact-label test'
    );

    const root = writeDoneClickstopFixture('canonical-skeleton', fixtureBody);
    try {
      const r = runClickstopLinter(['--dir', root]);
      assert.equal(
        r.status, 0,
        `Canonical skeleton must pass lint via exact-label match; got status=${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
      );
      assert.ok(
        r.stdout.includes('✅'),
        `Expected ✅ in linter output; got:\n${r.stdout}`
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // C46-8: fresh-consumer acceptance — `harness init` against a fresh
  // os.tmpdir() target dir produces a consumer whose WORKBOARD.md AND the
  // seeded `project/clickstops/` tree pass `harness lint --quiet` cleanly out
  // of the box.
  //
  // Per LRN-094: target dir is under os.tmpdir(), NEVER under REPO_ROOT.
  // -------------------------------------------------------------------------
  it('5. (C46-8 acceptance) `harness init` into fresh tmpdir → seeded WORKBOARD.md + harness lint pass cleanly', () => {
    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs46-fresh-init-'));
    try {
      // Initialize git so harness init's repo-detection works.
      const gitInit = spawnSync('git', ['init', '-q'], { cwd: targetDir, encoding: 'utf8' });
      assert.equal(gitInit.status, 0, `git init failed: ${gitInit.stderr}`);

      // Run harness init against the fresh dir.
      const initResult = spawnSync(
        NODE,
        [HARNESS_BIN, '--cwd', targetDir, 'init'],
        { encoding: 'utf8' }
      );
      assert.equal(
        initResult.status, 0,
        `harness init must exit 0; got ${initResult.status}\nstdout: ${initResult.stdout}\nstderr: ${initResult.stderr}`
      );

      const seededWb = path.join(targetDir, 'WORKBOARD.md');
      assert.ok(
        fs.existsSync(seededWb),
        `harness init must create WORKBOARD.md at ${seededWb}`
      );

      // 5a. Run the workboard linter against the freshly seeded file.
      const wbLintResult = runWorkboardLinter(['--file', seededWb]);
      assert.equal(
        wbLintResult.status, 0,
        `Freshly-seeded WORKBOARD.md must pass check-workboard with 0 errors (issue #146 acceptance criterion #1); got status=${wbLintResult.status}\nstdout: ${wbLintResult.stdout}\nstderr: ${wbLintResult.stderr}`
      );
      assert.ok(
        wbLintResult.stdout.includes('0 errors'),
        `Expected "0 errors"; got:\n${wbLintResult.stdout}`
      );

      // 5b. Run the full harness lint --quiet against the freshly init'd
      // consumer dir. The fresh-init scaffold MUST satisfy `harness lint`
      // out of the box — partial pass weakens issue #146 AC #1.
      // Skip the public-artifact check (it requires --public-artifact-dir
      // which fresh init does not provide).
      const fullLintResult = spawnSync(
        NODE,
        [HARNESS_BIN, '--cwd', targetDir, 'lint', '--quiet'],
        { encoding: 'utf8' }
      );
      assert.equal(
        fullLintResult.status, 0,
        `Freshly-init'd consumer must pass "harness lint --quiet" with exit 0 (issue #146 AC #1 strict); got ${fullLintResult.status}\nstdout: ${fullLintResult.stdout}\nstderr: ${fullLintResult.stderr}`
      );
    } finally {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // C46-2 / C46-9 doc-drift guard (rubber-duck R2 non-blocking finding):
  // mechanically assert the canonical OPERATIONS.md skeleton + verbatim-labels
  // callout exists. Without this, OPERATIONS.md could regress (e.g. someone
  // strips the callout in a future refactor) while the rest of CS46's tests
  // still pass — the discoverability fix would silently rot.
  // -------------------------------------------------------------------------
  it('6. canonical Plan-vs-impl skeleton + verbatim-labels callout present in OPERATIONS.md (template + root mirror)', () => {
    const composedOps = path.join(REPO_ROOT, 'template', 'composed', 'OPERATIONS.md');
    const rootOps = path.join(REPO_ROOT, 'OPERATIONS.md');
    for (const opsFile of [composedOps, rootOps]) {
      assert.ok(fs.existsSync(opsFile), `Expected ${opsFile} to exist`);
      const body = fs.readFileSync(opsFile, 'utf8');

      // Verbatim-labels callout must be present.
      assert.ok(
        body.includes('matched verbatim by `check-clickstop.mjs`'),
        `${opsFile}: missing verbatim-labels callout (C46-2 regression)`
      );

      // All three required field labels must appear in the canonical skeleton
      // code-block region (within ±50 lines of the callout).
      assert.ok(
        body.includes('**Reviewer:**'),
        `${opsFile}: missing **Reviewer:** label`
      );
      assert.ok(
        body.includes('**Date:**'),
        `${opsFile}: missing **Date:** label`
      );
      assert.ok(
        body.includes('**Outcome:**'),
        `${opsFile}: missing **Outcome:** label`
      );

      // The callout must explicitly call out **Verdict:** as the failing alias
      // (this is the highest-leverage anti-pattern hint per issue #146).
      assert.ok(
        body.includes('**Verdict:**'),
        `${opsFile}: callout must name **Verdict:** as failing alias (C46-2)`
      );
    }
  });

});
