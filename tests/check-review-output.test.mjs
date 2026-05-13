/**
 * tests/check-review-output.test.mjs — Tests for the CS40 review-output linter.
 *
 * Per CS40 Deliverable 2: minimum 10 cases covering R1 enumeration completeness,
 * Rn delta semantics, finding-row schema, verdict line shape, --update-pr
 * idempotency, independence-invariant guard, and edge cases.
 *
 * Tests run the script as a subprocess so that argv parsing + exit codes are
 * exercised end-to-end. Test scratch dirs use os.tmpdir() per LRN-094 — never
 * REPO_ROOT.
 *
 * For tests that need a real `git diff --name-only` result, we initialise a
 * throwaway git repo under os.tmpdir() with two commits, then point the linter
 * at it via `cwd`. This keeps tests deterministic and offline.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'check-review-output.mjs');

/**
 * Initialise a throwaway git repo in os.tmpdir() with `files` committed at
 * the base SHA, then a second commit that adds/modifies `files2` to produce a
 * known diff between base..head. Returns { dir, base, head }.
 *
 * @param {string[]} baseFiles relative paths to create at base commit
 * @param {string[]} headFiles relative paths to create/modify at head commit
 */
function initGitRepo(baseFiles, headFiles) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-review-output-'));
  const run = (cmd, args) => {
    const r = spawnSync(cmd, args, { cwd: dir, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${r.stderr}`);
    return r.stdout.trim();
  };
  run('git', ['init', '--initial-branch=main', '--quiet']);
  run('git', ['config', 'user.email', 'test@example.com']);
  run('git', ['config', 'user.name', 'Test']);
  run('git', ['config', 'commit.gpgSign', 'false']);
  for (const f of baseFiles) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), `base content of ${f}\n`);
  }
  run('git', ['add', '-A']);
  run('git', ['commit', '-m', 'base', '--quiet']);
  const base = run('git', ['rev-parse', 'HEAD']);
  for (const f of headFiles) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), `head content of ${f}\n`);
  }
  run('git', ['add', '-A']);
  run('git', ['commit', '-m', 'head', '--quiet']);
  const head = run('git', ['rev-parse', 'HEAD']);
  return { dir, base, head };
}

/**
 * Run the linter as a subprocess. Returns { status, stdout, stderr }.
 */
function runLinter(args, cwd) {
  return spawnSync('node', [SCRIPT, ...args], { cwd: cwd || REPO_ROOT, encoding: 'utf8' });
}

/**
 * Build a minimal valid R1 reviewer output markdown.
 */
function buildReviewOutput({ analyzedHead, files = [], findings = [], verdict = 'Go' }) {
  const lines = [
    `Analyzed HEAD: ${analyzedHead}`,
    '',
    '## Per-file analysis',
    '',
    ...files.map((f) => `- ${f}: clean`),
    '',
    '## Findings',
    '',
    ...findings.map((fnd) => `- [${fnd.severity}] ${fnd.file}:${fnd.line}: ${fnd.desc}`),
    '',
    `Verdict: ${verdict}`,
    '',
  ];
  return lines.join('\n');
}

describe('check-review-output linter (CS40)', () => {
  let tmpRoot;
  let scratch;
  let repos = [];

  before(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cro-tests-'));
    scratch = path.join(tmpRoot, 'reviews');
    fs.mkdirSync(scratch, { recursive: true });
  });

  after(() => {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
    for (const r of repos) {
      try { fs.rmSync(r, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it('R1 happy path: enumeration matches diff exactly, verdict Go, no findings → exit 0', () => {
    const baseFiles = ['a.txt', 'b.txt'];
    const headFiles = ['a.txt', 'c.txt']; // modify a.txt, add c.txt
    const { dir, base, head } = initGitRepo(baseFiles, headFiles);
    repos.push(dir);

    const review = buildReviewOutput({ analyzedHead: head, files: ['a.txt', 'c.txt'] });
    const reviewFile = path.join(scratch, 'r1-happy.md');
    fs.writeFileSync(reviewFile, review);

    const r = runLinter(['--review-output', reviewFile, '--round', 'R1', '--base', base, '--head', head], dir);
    assert.strictEqual(r.status, 0, `expected exit 0, got ${r.status}; stderr: ${r.stderr}`);
    assert.match(r.stdout, /0 errors/);
  });

  it('R1 root-level extensionless files (Makefile, LICENSE, Dockerfile) are captured in enumeration', () => {
    // Regression: previously a `/[/.]/.test(filePath)` heuristic dropped any
    // path lacking `/` or `.`, causing root-level extensionless files to be
    // mis-flagged as missing. Section context (inFindingsSection) is now the
    // sole disambiguator.
    const { dir, base, head } = initGitRepo(['a.txt'], ['a.txt', 'Makefile', 'LICENSE', 'Dockerfile']);
    repos.push(dir);
    const review = buildReviewOutput({
      analyzedHead: head,
      files: ['a.txt', 'Makefile', 'LICENSE', 'Dockerfile'],
    });
    const reviewFile = path.join(scratch, 'r1-extensionless.md');
    fs.writeFileSync(reviewFile, review);

    const r = runLinter(['--review-output', reviewFile, '--round', 'R1', '--base', base, '--head', head], dir);
    assert.strictEqual(r.status, 0, `expected exit 0, got ${r.status}; stderr: ${r.stderr}`);
    // No "missing file" errors should appear.
    assert.doesNotMatch(r.stderr, /R1 enumeration missing file/, `stderr: ${r.stderr}`);
  });

  it('R1 missing file: reviewer omits a changed file → exit 1', () => {
    const { dir, base, head } = initGitRepo(['a.txt'], ['a.txt', 'b.txt']);
    repos.push(dir);
    // Reviewer enumerates only a.txt, missing b.txt
    const review = buildReviewOutput({ analyzedHead: head, files: ['a.txt'] });
    const reviewFile = path.join(scratch, 'r1-missing.md');
    fs.writeFileSync(reviewFile, review);

    const r = runLinter(['--review-output', reviewFile, '--round', 'R1', '--base', base, '--head', head], dir);
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /R1 enumeration missing file: b\.txt/);
  });

  it('R1 extra file: reviewer enumerates non-diff file → warning only, exit 0', () => {
    const { dir, base, head } = initGitRepo(['a.txt'], ['a.txt', 'b.txt']);
    repos.push(dir);
    // Reviewer enumerates a.txt, b.txt, AND a stale c.txt
    const review = buildReviewOutput({ analyzedHead: head, files: ['a.txt', 'b.txt', 'c.txt'] });
    const reviewFile = path.join(scratch, 'r1-extra.md');
    fs.writeFileSync(reviewFile, review);

    const r = runLinter(['--review-output', reviewFile, '--round', 'R1', '--base', base, '--head', head], dir);
    assert.strictEqual(r.status, 0);
    assert.match(r.stderr, /R1 enumeration extra file: c\.txt/);
  });

  it('Rn with --prev-head: enumeration matches delta diff → exit 0', () => {
    // Create base, mid, head commits to test prev-head..head delta
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cro-rn-'));
    repos.push(dir);
    const run = (cmd, args) => spawnSync(cmd, args, { cwd: dir, encoding: 'utf8' });
    run('git', ['init', '--initial-branch=main', '--quiet']);
    run('git', ['config', 'user.email', 't@e.com']);
    run('git', ['config', 'user.name', 'T']);
    run('git', ['config', 'commit.gpgSign', 'false']);
    fs.writeFileSync(path.join(dir, 'a.txt'), 'a-base');
    run('git', ['add', '-A']); run('git', ['commit', '-m', 'base', '--quiet']);
    const base = run('git', ['rev-parse', 'HEAD']).stdout.trim();
    fs.writeFileSync(path.join(dir, 'a.txt'), 'a-mid');
    fs.writeFileSync(path.join(dir, 'b.txt'), 'b-mid');
    run('git', ['add', '-A']); run('git', ['commit', '-m', 'mid', '--quiet']);
    const mid = run('git', ['rev-parse', 'HEAD']).stdout.trim();
    fs.writeFileSync(path.join(dir, 'c.txt'), 'c-head');
    run('git', ['add', '-A']); run('git', ['commit', '-m', 'head', '--quiet']);
    const head = run('git', ['rev-parse', 'HEAD']).stdout.trim();

    // Rn delta from mid..head includes only c.txt
    const review = buildReviewOutput({ analyzedHead: head, files: ['c.txt'] });
    const reviewFile = path.join(scratch, 'rn-delta.md');
    fs.writeFileSync(reviewFile, review);

    const r = runLinter(['--review-output', reviewFile, '--round', 'Rn', '--base', base, '--head', head, '--prev-head', mid], dir);
    assert.strictEqual(r.status, 0, `expected exit 0, got ${r.status}; stderr: ${r.stderr}`);
  });

  it('Rn without --prev-head: enumeration check warn-skipped, exit 0', () => {
    const { dir, base, head } = initGitRepo(['a.txt'], ['a.txt', 'b.txt']);
    repos.push(dir);
    const review = buildReviewOutput({ analyzedHead: head, files: [] });
    const reviewFile = path.join(scratch, 'rn-no-prev.md');
    fs.writeFileSync(reviewFile, review);

    const r = runLinter(['--review-output', reviewFile, '--round', 'Rn', '--base', base, '--head', head], dir);
    assert.strictEqual(r.status, 0);
    assert.match(r.stderr, /Rn enumeration check skipped: --prev-head not provided/);
  });

  it('malformed verdict line: missing entirely → exit 1', () => {
    const { dir, base, head } = initGitRepo(['a.txt'], ['a.txt', 'b.txt']);
    repos.push(dir);
    const review = [
      `Analyzed HEAD: ${head}`,
      '',
      '## Per-file analysis',
      '',
      '- a.txt: clean',
      '- b.txt: clean',
      '',
      // No Verdict line
    ].join('\n');
    const reviewFile = path.join(scratch, 'no-verdict.md');
    fs.writeFileSync(reviewFile, review);

    const r = runLinter(['--review-output', reviewFile, '--round', 'R1', '--base', base, '--head', head], dir);
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /missing or malformed "Verdict:/);
  });

  it('malformed finding row: severity outside enum → exit 1', () => {
    const { dir, base, head } = initGitRepo(['a.txt'], ['a.txt', 'b.txt']);
    repos.push(dir);
    const review = [
      `Analyzed HEAD: ${head}`,
      '',
      '## Per-file analysis',
      '',
      '- a.txt: clean',
      '- b.txt: clean',
      '',
      '## Findings',
      '',
      '- [Critical] a.txt:5: bad', // wrong severity
      '',
      'Verdict: Needs-Fix',
    ].join('\n');
    const reviewFile = path.join(scratch, 'malformed-finding.md');
    fs.writeFileSync(reviewFile, review);

    const r = runLinter(['--review-output', reviewFile, '--round', 'R1', '--base', base, '--head', head], dir);
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /malformed finding row/);
  });

  it('independence-invariant violation: reviewer model overlaps implementer set → exit 1 (fake-gh)', () => {
    // Inject a fake `gh` binary via CHECK_REVIEW_OUTPUT_GH_BIN. The shim
    // simulates `gh pr view --json body --jq .body` returning a PR body whose
    // ## Model audit table has Reviewer model gpt-5.5 in the Implementer set.
    const { dir, base, head } = initGitRepo(['a.txt'], ['a.txt', 'b.txt']);
    repos.push(dir);
    const review = buildReviewOutput({ analyzedHead: head, files: ['a.txt', 'b.txt'] });
    const reviewFile = path.join(scratch, 'guard-violation.md');
    fs.writeFileSync(reviewFile, review);

    // The PR body the fake-gh returns: includes a canonical | Field | Value |
    // Model audit table where gpt-5.5 is BOTH an implementer and the reviewer.
    const fakePrBody = [
      '## Summary', '', 'Test PR', '',
      '## Changes', '', '- a.txt', '- b.txt', '',
      '## Testing', '', 'manual', '',
      '## Model audit',
      '',
      '| Field | Value |',
      '|---|---|',
      '| Implementer models | claude-opus-4.7, gpt-5.5 |',
      '| Reviewer model | gpt-5.5 |',
      '',
      '## Review log',
      '',
      '| timestamp | analyzed_head | actor | model | verdict | evidence_link |',
      '|---|---|---|---|---|---|',
      '',
    ].join('\n');
    const fakeGh = path.join(dir, 'fake-gh.mjs');
    fs.writeFileSync(fakeGh, [
      '#!/usr/bin/env node',
      'import fs from "node:fs";',
      'const args = process.argv.slice(2);',
      // Match `pr view <num> ... --json body --jq .body`
      'if (args[0] === "pr" && args[1] === "view") {',
      `  process.stdout.write(${JSON.stringify(fakePrBody)});`,
      '  process.exit(0);',
      '}',
      'process.stderr.write("fake-gh: unexpected args " + args.join(" ") + "\\n");',
      'process.exit(1);',
    ].join('\n'));

    const r = spawnSync('node', [
      SCRIPT,
      '--review-output', reviewFile,
      '--round', 'R1',
      '--base', base,
      '--head', head,
      '--repo', 'henrik-me/agent-harness',
      '--pr', '999',
      '--reviewer-model', 'gpt-5.5',
    ], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, CHECK_REVIEW_OUTPUT_GH_BIN: fakeGh },
    });
    assert.strictEqual(r.status, 1, `expected exit 1, got ${r.status}; stderr: ${r.stderr}`);
    assert.match(r.stderr, /independence-invariant violation/, `expected violation message; stderr: ${r.stderr}`);
    assert.match(r.stderr, /gpt-5\.5/);
  });

  it('independence-invariant guard skipped without --repo/--pr → no guard run, exit 0', () => {
    // Sanity check: omitting --repo/--pr (the gh-fetch-required pair) cleanly
    // skips the guard. --reviewer-model alone does not trigger the guard
    // because the guard branch is `if (repo && pr)`.
    const { dir, base, head } = initGitRepo(['a.txt'], ['a.txt', 'b.txt']);
    repos.push(dir);
    const review = buildReviewOutput({ analyzedHead: head, files: ['a.txt', 'b.txt'] });
    const reviewFile = path.join(scratch, 'no-guard.md');
    fs.writeFileSync(reviewFile, review);

    const r = runLinter([
      '--review-output', reviewFile, '--round', 'R1', '--base', base, '--head', head,
      '--reviewer-model', 'gpt-5.5',
    ], dir);
    assert.strictEqual(r.status, 0, `expected guard-skipped exit 0, got ${r.status}; stderr: ${r.stderr}`);
  });

  it('--update-pr idempotency: second run with same inputs is a no-op (fake-gh)', () => {
    // Mock both `gh pr view` (returns a stub body) and `gh pr edit` (records
    // the new body to a file). Then run the linter twice with the same inputs;
    // first call should add a row (and write the body), second call should
    // detect the dedup hit and skip.
    const { dir, base, head } = initGitRepo(['a.txt'], ['a.txt', 'b.txt']);
    repos.push(dir);
    const review = buildReviewOutput({ analyzedHead: head, files: ['a.txt', 'b.txt'] });
    const reviewFile = path.join(scratch, 'update-pr.md');
    fs.writeFileSync(reviewFile, review);

    const stateFile = path.join(dir, 'pr-body.md');
    const initialBody = [
      '## Summary', '', 'Test PR', '',
      '## Changes', '', '- a.txt', '- b.txt', '',
      '## Testing', '', 'manual', '',
      '## Review log',
      '',
      '| timestamp | analyzed_head | actor | model | verdict | evidence_link |',
      '|---|---|---|---|---|---|',
      '',
    ].join('\n');
    fs.writeFileSync(stateFile, initialBody);

    const fakeGh = path.join(dir, 'fake-gh-update.mjs');
    fs.writeFileSync(fakeGh, [
      '#!/usr/bin/env node',
      'import fs from "node:fs";',
      'const args = process.argv.slice(2);',
      `const stateFile = ${JSON.stringify(stateFile)};`,
      // gh pr view <num> --repo <slug> --json body --jq .body  → print body
      'if (args[0] === "pr" && args[1] === "view") {',
      '  process.stdout.write(fs.readFileSync(stateFile, "utf8"));',
      '  process.exit(0);',
      '}',
      // gh pr edit <num> --repo <slug> --body-file <path>  → write to stateFile
      'if (args[0] === "pr" && args[1] === "edit") {',
      '  const bf = args.indexOf("--body-file");',
      '  if (bf < 0) { process.stderr.write("fake-gh: missing --body-file\\n"); process.exit(1); }',
      '  const newBody = fs.readFileSync(args[bf + 1], "utf8");',
      '  fs.writeFileSync(stateFile, newBody);',
      '  process.exit(0);',
      '}',
      'process.stderr.write("fake-gh: unexpected args " + args.join(" ") + "\\n");',
      'process.exit(1);',
    ].join('\n'));

    const baseArgs = [
      SCRIPT,
      '--review-output', reviewFile,
      '--round', 'R1',
      '--base', base,
      '--head', head,
      '--repo', 'henrik-me/agent-harness',
      '--pr', '999',
      '--reviewer-model', 'gpt-5.5',
      '--actor', 'yoga-ah',
      '--evidence-link', 'https://example.com/r1',
      '--update-pr',
    ];
    const env = { ...process.env, CHECK_REVIEW_OUTPUT_GH_BIN: fakeGh };

    // First run: should add a row.
    const r1 = spawnSync('node', baseArgs, { cwd: dir, encoding: 'utf8', env });
    assert.strictEqual(r1.status, 0, `first run expected exit 0, got ${r1.status}; stderr: ${r1.stderr}`);
    assert.match(r1.stderr, /## Review log row added/, `first run should add row; stderr: ${r1.stderr}`);

    // Verify the new body has the canonical row shape (6 cells in correct order).
    const afterFirst = fs.readFileSync(stateFile, 'utf8');
    // Look for the appended row line.
    const rowLine = afterFirst.split('\n').find((l) => l.includes(head) && l.includes('yoga-ah'));
    assert.ok(rowLine, `expected new row in ${afterFirst}`);
    const cells = rowLine.split('|').slice(1, -1).map((s) => s.trim());
    assert.strictEqual(cells.length, 6, `canonical row must have 6 cells, got ${cells.length}: ${rowLine}`);
    // Column order: timestamp | analyzed_head | actor | model | verdict | evidence_link
    assert.match(cells[0], /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, `cell[0] should be ISO timestamp, got ${cells[0]}`);
    assert.strictEqual(cells[1], head, 'cell[1] should be analyzed_head');
    assert.strictEqual(cells[2], 'yoga-ah', 'cell[2] should be actor');
    assert.strictEqual(cells[3], 'gpt-5.5', 'cell[3] should be model');
    assert.strictEqual(cells[4], 'Go', 'cell[4] should be verdict');
    assert.strictEqual(cells[5], 'https://example.com/r1', 'cell[5] should be evidence_link');

    // Second run: should detect dedup hit and skip.
    const r2 = spawnSync('node', baseArgs, { cwd: dir, encoding: 'utf8', env });
    assert.strictEqual(r2.status, 0, `second run expected exit 0, got ${r2.status}; stderr: ${r2.stderr}`);
    assert.match(r2.stderr, /## Review log row unchanged \(idempotent\)/, `second run should be idempotent; stderr: ${r2.stderr}`);

    // Body must be byte-identical after the no-op second run.
    const afterSecond = fs.readFileSync(stateFile, 'utf8');
    assert.strictEqual(afterSecond, afterFirst, 'idempotent second run must not alter body');
  });

  it('--update-pr: PR body containing $-patterns is preserved byte-exact (regression for String.replace `$&` interpretation)', () => {
    // Regression for the bug where `body.replace(section, newSection)` would
    // interpret `$&`, `$$`, `$<n>`, `` $` ``, and `$'` patterns in the
    // *replacement* string. If the existing PR body section contains `$`
    // characters (e.g. evidence_link URLs with query strings, finding
    // descriptions copied into earlier rows, or the dollar-sign in stub
    // section content), index-based splicing must be used instead.
    const { dir, base, head } = initGitRepo(['a.txt'], ['a.txt', 'b.txt']);
    repos.push(dir);
    const review = buildReviewOutput({ analyzedHead: head, files: ['a.txt', 'b.txt'] });
    const reviewFile = path.join(scratch, 'update-pr-dollars.md');
    fs.writeFileSync(reviewFile, review);

    const stateFile = path.join(dir, 'pr-body-dollars.md');
    // Embed multiple `$`-patterns in the existing PR body content to trip the
    // String.prototype.replace interpretation if the bug regresses.
    const initialBody = [
      '## Summary', '', 'Test PR with $$ and $& and $1 sentinels', '',
      '## Changes', '', '- a.txt', '- b.txt', '',
      '## Testing', '', 'manual', '',
      '## Review log',
      '',
      '| timestamp | analyzed_head | actor | model | verdict | evidence_link |',
      '|---|---|---|---|---|---|',
      // Existing data row whose evidence_link cell contains literal `$&`
      // tokens — must survive the splice unchanged.
      '| 2026-05-13T20:00:00Z | abc1234 | yoga-ah | claude-haiku-4.5 | Go | https://example.com/x?ref=$&y=$1 |',
      '',
    ].join('\n');
    fs.writeFileSync(stateFile, initialBody);

    const fakeGh = path.join(dir, 'fake-gh-dollars.mjs');
    fs.writeFileSync(fakeGh, [
      '#!/usr/bin/env node',
      'import fs from "node:fs";',
      'const args = process.argv.slice(2);',
      `const stateFile = ${JSON.stringify(stateFile)};`,
      'if (args[0] === "pr" && args[1] === "view") {',
      '  process.stdout.write(fs.readFileSync(stateFile, "utf8"));',
      '  process.exit(0);',
      '}',
      'if (args[0] === "pr" && args[1] === "edit") {',
      '  const bf = args.indexOf("--body-file");',
      '  const newBody = fs.readFileSync(args[bf + 1], "utf8");',
      '  fs.writeFileSync(stateFile, newBody);',
      '  process.exit(0);',
      '}',
      'process.exit(1);',
    ].join('\n'));

    const r = spawnSync('node', [
      SCRIPT,
      '--review-output', reviewFile,
      '--round', 'R1',
      '--base', base,
      '--head', head,
      '--repo', 'henrik-me/agent-harness',
      '--pr', '999',
      '--reviewer-model', 'gpt-5.5',
      '--actor', 'yoga-ah',
      // Note: evidence_link contains $-patterns too — must round-trip literally.
      '--evidence-link', 'https://example.com/r2?$&val=$1',
      '--update-pr',
    ], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, CHECK_REVIEW_OUTPUT_GH_BIN: fakeGh },
    });
    assert.strictEqual(r.status, 0, `expected exit 0, got ${r.status}; stderr: ${r.stderr}`);

    const after = fs.readFileSync(stateFile, 'utf8');
    // The pre-existing $-patterns must be preserved byte-exact.
    assert.ok(after.includes('Test PR with $$ and $& and $1 sentinels'), 'Summary $-patterns must survive splice');
    assert.ok(after.includes('https://example.com/x?ref=$&y=$1'), 'Existing evidence_link $-patterns must survive splice');
    // The newly appended evidence_link must contain literal `$&` and `$1`.
    assert.ok(after.includes('https://example.com/r2?$&val=$1'), 'New evidence_link $-patterns must round-trip literally');
  });

  it('--json output: emits structured JSON with errors/warnings/findings/enumerated_files', () => {
    const { dir, base, head } = initGitRepo(['a.txt'], ['a.txt', 'b.txt']);
    repos.push(dir);
    const review = buildReviewOutput({
      analyzedHead: head,
      files: ['a.txt', 'b.txt'],
      findings: [{ severity: 'Suggestion', file: 'a.txt', line: 10, desc: 'small nit' }],
      verdict: 'Go',
    });
    const reviewFile = path.join(scratch, 'json-out.md');
    fs.writeFileSync(reviewFile, review);

    const r = runLinter(['--review-output', reviewFile, '--round', 'R1', '--base', base, '--head', head, '--json'], dir);
    assert.strictEqual(r.status, 0);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.ok, true);
    assert.strictEqual(parsed.verdict, 'Go');
    assert.strictEqual(parsed.analyzed_head, head);
    assert.deepStrictEqual(parsed.enumerated_files.sort(), ['a.txt', 'b.txt']);
    assert.strictEqual(parsed.findings.length, 1);
    assert.strictEqual(parsed.findings[0].severity, 'Suggestion');
  });

  it('missing Analyzed HEAD line → exit 1', () => {
    const { dir, base, head } = initGitRepo(['a.txt'], ['a.txt', 'b.txt']);
    repos.push(dir);
    const review = [
      // No Analyzed HEAD line
      '## Per-file analysis',
      '',
      '- a.txt: clean',
      '- b.txt: clean',
      '',
      'Verdict: Go',
    ].join('\n');
    const reviewFile = path.join(scratch, 'no-head.md');
    fs.writeFileSync(reviewFile, review);

    const r = runLinter(['--review-output', reviewFile, '--round', 'R1', '--base', base, '--head', head], dir);
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /missing or malformed "Analyzed HEAD/);
  });

  it('Verdict Needs-Fix without findings → exit 1', () => {
    const { dir, base, head } = initGitRepo(['a.txt'], ['a.txt', 'b.txt']);
    repos.push(dir);
    const review = buildReviewOutput({
      analyzedHead: head,
      files: ['a.txt', 'b.txt'],
      findings: [],
      verdict: 'Needs-Fix',
    });
    const reviewFile = path.join(scratch, 'needs-fix-no-findings.md');
    fs.writeFileSync(reviewFile, review);

    const r = runLinter(['--review-output', reviewFile, '--round', 'R1', '--base', base, '--head', head], dir);
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /requires at least one finding row/);
  });

  it('Analyzed HEAD mismatch with --head: warning, not error', () => {
    const { dir, base, head } = initGitRepo(['a.txt'], ['a.txt', 'b.txt']);
    repos.push(dir);
    // Reviewer analyzed a stale SHA different from --head
    const staleSha = '1234567890abcdef1234567890abcdef12345678';
    const review = buildReviewOutput({ analyzedHead: staleSha, files: ['a.txt', 'b.txt'] });
    const reviewFile = path.join(scratch, 'stale-head.md');
    fs.writeFileSync(reviewFile, review);

    const r = runLinter(['--review-output', reviewFile, '--round', 'R1', '--base', base, '--head', head], dir);
    assert.strictEqual(r.status, 0); // warning-only, no error
    assert.match(r.stderr, /Analyzed HEAD '\w{40}' does not match --head/);
  });
});
