/**
 * tests/cs76-doc-xref-resolvability.test.mjs
 *   — Tests for check (e) of scripts/check-doc-xref-resolvability.mjs
 *     (CS76 / C76-1..C76-8): composed-process-base cross-ref resolvability.
 *
 * Uses node:test + spawnSync. Every fixture tree is built programmatically under
 * os.tmpdir() (mkdtempSync) — nothing is ever written under the repo root (that
 * would race check-text-encoding's recursive walk under parallel `node --test`).
 * Each tree carries a self-host package.json (name '@henrik-me/agent-harness')
 * so the guard's self-host gate lets the checks run; a per-test overrides map
 * replaces or removes individual files to exercise one branch at a time.
 *
 * Check (e) scans template/composed/{OPERATIONS,REVIEWS,CONVENTIONS}.md and
 * fails on (i) a bare not-guaranteed sibling ref (INSTRUCTIONS.md /
 * .github/copilot-instructions.md) that is neither qualified with
 * "*(if your consumer syncs it)*" nor allowlisted, and (ii) any harness-internal
 * docs/adr reference. It scans inline-code spans but skips fenced code blocks.
 *
 * A closing regression block confirms the CS81 checks (a)/(b)/(c)/(d) still
 * behave when the check-(e) composed bases are present in the same tree. The
 * existing tests/cs81-doc-xref-resolvability.test.mjs remains authoritative for
 * checks (a)-(d) and is unchanged.
 *
 * Run: node --test tests/cs76-doc-xref-resolvability.test.mjs
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const LINTER = path.join(REPO_ROOT, 'scripts', 'check-doc-xref-resolvability.mjs');
const NODE = process.execPath;

// A clean self-host tree in which ALL FIVE checks pass. Checks (a)-(d) mirror the
// CS81 fixtures; check (e) adds the three composed process-doc BASES with only a
// properly-QUALIFIED sibling ref and no docs/adr references.
const CLEAN_TREE = {
  'package.json': JSON.stringify({ name: '@henrik-me/agent-harness' }, null, 2) + '\n',
  'LEARNINGS.md': '# Learnings\n\n### LRN-001\n\nProblem body.\n',
  'OPERATIONS.md': '# Operations\n\n## Report shape\n\nBody referencing LRN-001.\n',
  'REVIEWS.md': '# Reviews\n\nReview referencing LRN-001.\n',
  'INSTRUCTIONS.md': '# Instructions\n\nSee [report shape](OPERATIONS.md#report-shape).\n',
  'template/managed/READMEGUIDE.md': '# Guide\n\nSee [architecture](ARCHITECTURE.md).\n',
  'template/managed/ARCHITECTURE.md': '# Architecture\n',
  // ----- check (e) targets: clean composed process-doc bases -----
  'template/composed/OPERATIONS.md':
    '# Operations base\n\n' +
    'See Hard Rule 6 in `INSTRUCTIONS.md` *(if your consumer syncs it)* for the ' +
    'cross-repo procedure. Split the workflow into two jobs per the project ADR-0004.\n',
  'template/composed/REVIEWS.md':
    '# Reviews base\n\nNo not-guaranteed sibling refs here; the gate is `review-gates.yml`.\n',
  'template/composed/CONVENTIONS.md':
    '# Conventions base\n\nADRs follow a numeric-slug convention; keep the rationale as prose.\n',
};

const tmpDirs = [];

/**
 * Build a temp tree from CLEAN_TREE with per-file overrides applied. An override
 * value of `null` removes that file; any string replaces its content.
 *
 * @param {Record<string, string|null>} [overrides]
 * @returns {string} absolute temp dir path
 */
function buildTree(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs76-xref-'));
  tmpDirs.push(dir);
  const files = { ...CLEAN_TREE };
  for (const [rel, content] of Object.entries(overrides)) {
    if (content === null) delete files[rel];
    else files[rel] = content;
  }
  for (const [rel, content] of Object.entries(files)) {
    const dest = path.join(dir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content);
  }
  return dir;
}

/** Override just the composed OPERATIONS base body (the most common fixture). */
function opsBase(body) {
  return { 'template/composed/OPERATIONS.md': `# Operations base\n\n${body}\n` };
}
/** Override just the composed CONVENTIONS base body. */
function convBase(body) {
  return { 'template/composed/CONVENTIONS.md': `# Conventions base\n\n${body}\n` };
}
/** Override just the composed REVIEWS base body. */
function revBase(body) {
  return { 'template/composed/REVIEWS.md': `# Reviews base\n\n${body}\n` };
}

/**
 * @param {string[]} [args]
 * @returns {{ stdout: string, stderr: string, status: number }}
 */
function runLinter(args = []) {
  const result = spawnSync(NODE, [LINTER, ...args], { cwd: REPO_ROOT, encoding: 'utf8' });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? -1,
  };
}

after(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------

describe('check-doc-xref-resolvability check (e) — composed-process-base xref', () => {
  it('passes (exit 0) on a fully clean self-host tree (all five checks)', () => {
    const dir = buildTree();
    const { status, stdout } = runLinter(['--cwd', dir]);
    assert.equal(status, 0);
    assert.match(stdout, /Linter passed/);
  });

  // ----- (e)(i): bare not-guaranteed sibling refs --------------------------

  it('(e) fails (exit 1) on an unqualified bare `INSTRUCTIONS.md` prose ref (#229-A)', () => {
    // Backtick-wrapped token: this ALSO proves inline-code spans ARE scanned
    // (unlike CS81 checks (b)/(c), which strip inline code).
    const dir = buildTree(opsBase('Follow the branch-naming convention in `INSTRUCTIONS.md`.'));
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(
      stderr,
      /template\/composed\/OPERATIONS\.md:\d+: bare not-guaranteed sibling "INSTRUCTIONS\.md" must be qualified/
    );
    assert.match(stderr, /Linter FAILED/);
  });

  it('(e) fails (exit 1) on a newly-introduced unqualified `.github/copilot-instructions.md` ref', () => {
    const dir = buildTree(convBase('Always read `.github/copilot-instructions.md` before editing.'));
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(
      stderr,
      /template\/composed\/CONVENTIONS\.md:\d+: bare not-guaranteed sibling "\.github\/copilot-instructions\.md" must be qualified/
    );
  });

  it('(e) passes (exit 0) on a sibling ref qualified with "*(if your consumer syncs it)*"', () => {
    const dir = buildTree(opsBase('See the rule in `INSTRUCTIONS.md` *(if your consumer syncs it)*.'));
    assert.equal(runLinter(['--cwd', dir]).status, 0);
  });

  it('(e) passes (exit 0) on the paired-sibling "them" qualifier variant', () => {
    const dir = buildTree(
      opsBase('Per Hard Rule 6 in `INSTRUCTIONS.md` / `.github/copilot-instructions.md` *(if your consumer syncs them)*.')
    );
    assert.equal(runLinter(['--cwd', dir]).status, 0);
  });

  it('(e) passes (exit 0) on a qualified `.github/copilot-instructions.md` ref', () => {
    const dir = buildTree(opsBase('See `.github/copilot-instructions.md` *(if your consumer syncs it)* for the rules.'));
    assert.equal(runLinter(['--cwd', dir]).status, 0);
  });

  // ----- (e)(i): descriptive allowlist -------------------------------------

  it('(e) passes (exit 0) on an allowlisted genericity-invariant doc-set mention', () => {
    const dir = buildTree(
      opsBase('The core onboarding docs shipped to consumers — `INSTRUCTIONS.md`, `TRACKING.md` — are consumer-selectable.')
    );
    assert.equal(runLinter(['--cwd', dir]).status, 0);
  });

  it('(e) passes (exit 0) on an F3-style table-cell example list (DECISION: descriptive, not a cross-ref)', () => {
    // The REVIEWS.md § 2.6a/§ 2.6c F3 cells name an illustrative list of cited
    // docs; qualifying one item mid-list would misread as doctrine. Allowlisted.
    const dir = buildTree(
      revBase('| F3 | Claim matches the cited source. | Cited doc (OPERATIONS.md, REVIEWS.md, INSTRUCTIONS.md, README.md, etc.). |')
    );
    assert.equal(runLinter(['--cwd', dir]).status, 0);
  });

  // ----- (e)(i): bare-token boundary (path-qualified is NOT a sibling) -----

  it('(e) passes (exit 0) on a path-qualified `template/composed/INSTRUCTIONS.md` example (boundary excludes it)', () => {
    const dir = buildTree(
      revBase('An example nonexistent file path (`template/composed/INSTRUCTIONS.md`) illustrates a broken ref.')
    );
    assert.equal(runLinter(['--cwd', dir]).status, 0);
  });

  it('(e) does NOT mistake a lowercase `copilot-instructions.md` fragment for the uppercase sibling', () => {
    // The bare `INSTRUCTIONS.md` regex is case-sensitive, so the lowercase tail
    // of `.github/copilot-instructions.md` (here path-qualified) is not flagged.
    const dir = buildTree(revBase('The path `template/managed/.github/copilot-instructions.md` is the managed source.'));
    assert.equal(runLinter(['--cwd', dir]).status, 0);
  });

  // ----- (e)(ii): harness-internal docs/adr (no allowlist) -----------------

  it('(e) fails (exit 1) on a dangling `docs/adr/...` relative markdown link (CS81 R3)', () => {
    const dir = buildTree(convBase('See [ADR 0001](docs/adr/0001-file-classes.md) for the taxonomy.'));
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(
      stderr,
      /template\/composed\/CONVENTIONS\.md:\d+: harness-internal "docs\/adr" reference must be genericized/
    );
  });

  it('(e) fails (exit 1) on a hardcoded henrik-me/agent-harness slug ADR URL', () => {
    const dir = buildTree(
      opsBase('Per [ADR4-1](https://github.com/henrik-me/agent-harness/blob/main/docs/adr/0004-x.md) enforcement.')
    );
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(stderr, /harness-internal "docs\/adr" reference must be genericized/);
  });

  it('(e) fails (exit 1) on an inline-code `docs/adr/` path (proves inline code IS scanned)', () => {
    const dir = buildTree(convBase('ADRs live under the `docs/adr/` directory.'));
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(stderr, /harness-internal "docs\/adr" reference must be genericized/);
  });

  it('(e) fails (exit 1) on a bare `docs/adr/` directory token in prose', () => {
    const dir = buildTree(opsBase('All ADRs in docs/adr/ that touch review states are relevant.'));
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(stderr, /harness-internal "docs\/adr" reference must be genericized/);
  });

  // ----- (e): fenced code blocks are skipped -------------------------------

  it('(e) does NOT flag a `docs/adr` link inside a fenced code block', () => {
    const dir = buildTree({
      'template/composed/CONVENTIONS.md':
        '# Conventions base\n\nIllustrative example:\n\n```markdown\nSee [ADR](docs/adr/0001.md).\n```\n',
    });
    assert.equal(runLinter(['--cwd', dir]).status, 0);
  });

  it('(e) does NOT flag an unqualified sibling ref inside a fenced code block', () => {
    const dir = buildTree({
      'template/composed/OPERATIONS.md':
        '# Operations base\n\nExample snippet:\n\n```\nSee `INSTRUCTIONS.md` for the rule.\n```\n',
    });
    assert.equal(runLinter(['--cwd', dir]).status, 0);
  });

  it('(e) reports the failing base path so multi-file trees pinpoint the violation', () => {
    // Inject the violation into REVIEWS specifically; confirm the path is named.
    const dir = buildTree(revBase('Read `INSTRUCTIONS.md` for the review doctrine.'));
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(stderr, /template\/composed\/REVIEWS\.md:\d+: bare not-guaranteed sibling "INSTRUCTIONS\.md"/);
  });

  it('--quiet still reports a check-(e) failure to stderr with empty stdout (exit 1)', () => {
    const dir = buildTree(convBase('See [ADR](docs/adr/0001.md).'));
    const { status, stderr, stdout } = runLinter(['--cwd', dir, '--quiet']);
    assert.equal(status, 1);
    assert.match(stderr, /docs\/adr/);
    assert.equal(stdout.trim(), '');
  });

  // ----- Regression: CS81 checks (a)/(b)/(c)/(d) still behave ---------------

  it('(regression a) a dead LRN token still fails even with clean composed bases present', () => {
    const dir = buildTree({
      'OPERATIONS.md': '# Operations\n\n## Report shape\n\nSee LRN-777 for details.\n',
    });
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(stderr, /OPERATIONS\.md:\d+: LRN token "LRN-777" does not resolve/);
  });

  it('(regression b) a stale cross-file anchor still fails', () => {
    const dir = buildTree({
      'OPERATIONS.md': '# Operations\n\n## Sub-agent report shape (mandatory)\n\nBody.\n',
      'INSTRUCTIONS.md': '# Instructions\n\nSee [shape](OPERATIONS.md#sub-agent-report-shape).\n',
    });
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(stderr, /cross-file anchor "OPERATIONS\.md#sub-agent-report-shape" does not resolve/);
  });

  it('(regression c) a non-template relative link in READMEGUIDE still fails', () => {
    const dir = buildTree({
      'template/managed/READMEGUIDE.md': '# Guide\n\nSee [ADR 0001](docs/adr/0001-file-classes.md).\n',
    });
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(stderr, /READMEGUIDE\.md:\d+: relative link "docs\/adr\/0001-file-classes\.md" .* ships under no template\/ class/);
  });

  it('(regression d) archive/stub integrity still fails on a dead redirect', () => {
    const dir = buildTree({
      'LEARNINGS.md': '# Learnings\n\n### LRN-001\n\nProblem body.\n\n### LRN-050\n\nSee archive.\n',
      'LEARNINGS-archive.md': '# Archive\n',
    });
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1);
    assert.match(stderr, /stub "### LRN-050" has no matching full entry/);
  });
});
