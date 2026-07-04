/**
 * tests/cs71-workboard-allowlist-consistency.test.mjs
 *   — Tests for scripts/check-workboard-allowlist-consistency.mjs (CS71 / D71-5).
 *
 * The linter asserts every workboard-allowlist occurrence (regex form in
 * review-gates.yml / pr-evidence-lint.yml + allowed-paths list form in
 * workboard-auto-approve.yml, across the rendered .github/ copies AND their
 * template/managed mirrors) parses to the identical token set.
 *
 * Fixture/scratch files are built under os.tmpdir() (LRN-094: runtime scratch
 * never touches REPO_ROOT, where the text-encoding linter walks and would race
 * a parallel `node --test`). Static assertions read the REAL repo workflows
 * read-only.
 *
 * Run: node --test tests/cs71-workboard-allowlist-consistency.test.mjs
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const LINTER = path.join(REPO_ROOT, 'scripts', 'check-workboard-allowlist-consistency.mjs');
const NODE = process.execPath;

// The canonical allowlist regex, VERBATIM (String.raw preserves the `\.` escapes).
const REGEX = String.raw`^(WORKBOARD\.md|CONTEXT\.md|LEARNINGS\.md)$|^project/clickstops/(planned|active|done)/`;

// Canonical allowed-paths.txt list form (prefixes keep their trailing slash,
// exactly as the real workboard-auto-approve.yml heredoc).
const CANON_LIST = [
  'WORKBOARD.md',
  'CONTEXT.md',
  'LEARNINGS.md',
  'project/clickstops/planned/',
  'project/clickstops/active/',
  'project/clickstops/done/',
];
// Drifted list: missing the `done` clickstop bucket -> 5 tokens, disagrees.
const DRIFT_LIST = CANON_LIST.slice(0, 5);

// The six canonical workflow paths (relative to --cwd).
const REL = {
  rg: '.github/workflows/review-gates.yml',
  pe: '.github/workflows/pr-evidence-lint.yml',
  wa: '.github/workflows/workboard-auto-approve.yml',
  mrg: 'template/managed/.github/workflows/review-gates.yml',
  mpe: 'template/managed/.github/workflows/pr-evidence-lint.yml',
  mwa: 'template/managed/.github/workflows/workboard-auto-approve.yml',
};

const EVIDENCE_JOBS = [
  'review-log-evidence',
  'copilot-review-attached',
  'independence-invariant',
  'review-threads-resolved',
];

const tmpDirs = [];

function mkdtemp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cs71-'));
  tmpDirs.push(d);
  return d;
}

function writeFile(dir, rel, content) {
  const abs = path.join(dir, ...rel.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
}

// A minimal review-gates/pr-evidence-style file carrying ONE regex-form site.
function regexFixture(regex, { marker = true } = {}) {
  const lines = [
    'name: fixture-regex',
    'on: pull_request',
    'jobs:',
    '  guard:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - id: wb',
    '        run: |',
    '          set -euo pipefail',
  ];
  if (marker) lines.push('          # harness:workboard-allowlist');
  lines.push(`          outside=$(printf '%s\\n' "$files" | grep -Ev '${regex}' || true)`);
  lines.push('          echo "done"');
  lines.push('');
  return lines.join('\n');
}

// A minimal workboard-auto-approve-style file carrying ONE list-form site.
function listFixture(tokens, { marker = true } = {}) {
  const lines = [
    'name: fixture-list',
    'on: pull_request',
    'jobs:',
    '  approve:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - id: allow',
    '        run: |',
  ];
  if (marker) lines.push('          # harness:workboard-allowlist');
  lines.push("          cat > allowed-paths.txt <<'EOF'");
  for (const t of tokens) lines.push('          ' + t);
  lines.push('          EOF');
  lines.push('          echo "done"');
  lines.push('');
  return lines.join('\n');
}

// Seed a full six-file canonical set (optionally self-host, optionally omitting keys).
function writeCanonicalSet(dir, { omit = [], selfHost = false } = {}) {
  const files = {
    rg: regexFixture(REGEX),
    pe: regexFixture(REGEX),
    wa: listFixture(CANON_LIST),
    mrg: regexFixture(REGEX),
    mpe: regexFixture(REGEX),
    mwa: listFixture(CANON_LIST),
  };
  for (const [key, content] of Object.entries(files)) {
    if (omit.includes(key)) continue;
    writeFile(dir, REL[key], content);
  }
  if (selfHost) {
    writeFile(dir, 'package.json', JSON.stringify({ name: '@henrik-me/agent-harness' }, null, 2) + '\n');
  }
}

function runLinter(args = []) {
  const r = spawnSync(NODE, [LINTER, ...args], { cwd: REPO_ROOT, encoding: 'utf8' });
  return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

after(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------

describe('check-workboard-allowlist-consistency — synthetic fixtures', () => {
  it('(a) passes (exit 0) when a regex-form and a list-form site agree', () => {
    const dir = mkdtemp();
    writeFile(dir, REL.rg, regexFixture(REGEX)); // regex form
    writeFile(dir, REL.wa, listFixture(CANON_LIST)); // list form
    const { status, stdout } = runLinter(['--cwd', dir]);
    assert.equal(status, 0, 'both forms canonicalize to the same 6-token set');
    assert.match(stdout, /Linter passed/);
  });

  it('(a2) passes (exit 0) on a full six-file self-host set that agrees', () => {
    const dir = mkdtemp();
    writeCanonicalSet(dir, { selfHost: true });
    const { status } = runLinter(['--cwd', dir]);
    assert.equal(status, 0);
  });

  it('(b) fails (exit 1) when one occurrence drifts (list missing a bucket)', () => {
    const dir = mkdtemp();
    writeFile(dir, REL.rg, regexFixture(REGEX)); // 6 tokens
    writeFile(dir, REL.wa, listFixture(DRIFT_LIST)); // 5 tokens
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1, 'occurrences disagree -> drift');
    assert.match(stderr, /drift/i);
    assert.match(stderr, /project\/clickstops\/done/, 'the diff must name the differing token');
  });

  it('(b2) fails (exit 1) on an exact<->prefix semantic swap that shares the bare path set', () => {
    // Root files as trailing-slash PREFIX matches instead of `$`-anchored exact
    // matches: the BARE path set is identical to the canonical list, so this must
    // be caught by the encoded exact:/prefix: kind, not just the path (gpt-5.5 R1).
    const rootsAsPrefix = String.raw`^(WORKBOARD\.md|CONTEXT\.md|LEARNINGS\.md)/|^project/clickstops/(planned|active|done)/`;
    const dir = mkdtemp();
    writeFile(dir, REL.rg, regexFixture(rootsAsPrefix)); // prefix:WORKBOARD.md ...
    writeFile(dir, REL.wa, listFixture(CANON_LIST)); // exact:WORKBOARD.md ...
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 1, 'exact vs prefix must not canonicalize to the same token');
    assert.match(stderr, /drift/i);
  });

  it('(b3) fails (exit 2) when a regex alternative encodes neither exact ($) nor prefix (/)', () => {
    // A root file that lost its `$` (`^WORKBOARD\.md`) is a prefix-slip: neither an
    // anchored-exact nor a trailing-slash prefix -> unparseable, fail closed.
    const slip = String.raw`^WORKBOARD\.md|^(CONTEXT\.md|LEARNINGS\.md)$|^project/clickstops/(planned|active|done)/`;
    const dir = mkdtemp();
    writeFile(dir, REL.rg, regexFixture(slip));
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 2, 'an unencoded exact/prefix alternative is a structural error');
    assert.match(stderr, /cannot parse allowlist regex/);
  });

  it('(b4) fails (exit 2) when a clickstop prefix gains a spurious `$` (`^Y/$`, both anchors)', () => {
    // `^project/clickstops/(...)/$` is anchored-exact of a slash-terminated path,
    // NOT prefix semantics — trailing-slash must not win over `$` (gpt-5.5 R2).
    const anchoredPrefix = String.raw`^(WORKBOARD\.md|CONTEXT\.md|LEARNINGS\.md)$|^project/clickstops/(planned|active|done)/$`;
    const dir = mkdtemp();
    writeFile(dir, REL.rg, regexFixture(anchoredPrefix));
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 2, '`^Y/$` (both anchored and trailing-slash) is ambiguous -> fail closed');
    assert.match(stderr, /cannot parse allowlist regex/);
  });

  it('(d) fails (exit 2) when an allowlist site is missing its marker', () => {
    const dir = mkdtemp();
    writeFile(dir, REL.rg, regexFixture(REGEX, { marker: false }));
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 2, 'a site without the marker is a structural error');
    assert.match(stderr, /missing its `# harness:workboard-allowlist` marker/);
  });

  it('(e1) fails (exit 2) on --cwd with no value (requireValue guard)', () => {
    const { status, stderr } = runLinter(['--cwd']);
    assert.equal(status, 2);
    assert.match(stderr, /missing value for --cwd/);
  });

  it('(e2) fails (exit 2) in self-host when a required workflow file is missing', () => {
    const dir = mkdtemp();
    writeCanonicalSet(dir, { selfHost: true, omit: ['mwa'] });
    const { status, stderr } = runLinter(['--cwd', dir]);
    assert.equal(status, 2, 'self-host requires all six canonical files');
    assert.match(stderr, /required workflow file missing/);
    assert.match(stderr, /workboard-auto-approve\.yml/);
  });

  it('(e3) fails (exit 2) on an unknown flag', () => {
    const { status, stderr } = runLinter(['--nope']);
    assert.equal(status, 2);
    assert.match(stderr, /unknown argument/);
  });
});

describe('check-workboard-allowlist-consistency — real repo (read-only)', () => {
  const rgText = readFileSync(path.join(REPO_ROOT, '.github', 'workflows', 'review-gates.yml'), 'utf8');
  const peText = readFileSync(path.join(REPO_ROOT, '.github', 'workflows', 'pr-evidence-lint.yml'), 'utf8');
  const rgDoc = yaml.load(rgText);

  it('(c-i) the four evidence jobs have NO job-level if referencing workboard-only', () => {
    for (const name of EVIDENCE_JOBS) {
      const job = rgDoc.jobs[name];
      assert.ok(job, `${name} job must exist`);
      assert.ok(
        job.if === undefined || !String(job.if).includes('workboard-only'),
        `${name} must always execute (no job-level workboard-only gate)`,
      );
    }
  });

  it('(c-ii) each evidence job computes wb first and gates every other step on it', () => {
    for (const name of EVIDENCE_JOBS) {
      const steps = rgDoc.jobs[name].steps;
      assert.equal(steps[0].id, 'wb', `${name}: first step must be the wb skip step`);
      assert.ok(steps.length > 1, `${name}: must have real steps after wb`);
      for (let i = 1; i < steps.length; i++) {
        assert.match(
          String(steps[i].if),
          /steps\.wb\.outputs\.skip != 'true'/,
          `${name}: step ${i} must be gated by steps.wb.outputs.skip`,
        );
      }
    }
  });

  it('(c-iii) neither review-gates.yml nor pr-evidence-lint.yml uses paths-ignore', () => {
    assert.ok(!rgText.includes('paths-ignore'), 'review-gates must not filter by paths-ignore');
    assert.ok(!peText.includes('paths-ignore'), 'pr-evidence-lint must not filter by paths-ignore');
  });

  it('(c-iv) fail-open guard: skip=true is set ONLY in the allowlist-confined branch', () => {
    for (const name of EVIDENCE_JOBS) {
      const run = String(rgDoc.jobs[name].steps[0].run);
      assert.equal(
        (run.match(/skip=true/g) || []).length,
        1,
        `${name}: skip=true must be set exactly once (success branch only)`,
      );
      assert.match(
        run,
        /if \[ -z "\$outside" \]; then skip=true/,
        `${name}: skip=true must live inside the -z "$outside" success branch`,
      );
      assert.match(
        run,
        /gh api files failed; running the real gate/,
        `${name}: the gh api failure branch must run the real gate (no skip -> fail-closed)`,
      );
    }
  });

  it('(f) the linter passes (exit 0) against the real repo end-to-end', () => {
    const { status, stdout } = runLinter(['--cwd', REPO_ROOT]);
    assert.equal(status, 0, 'all six real workflow files must agree');
    assert.match(stdout, /Linter passed/);
  });
});
