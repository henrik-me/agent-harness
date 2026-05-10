import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const LINTER = path.join(REPO_ROOT, 'scripts', 'check-templates.mjs');
const FIXTURES = path.join(REPO_ROOT, 'tests', 'fixtures', 'cs15d', 'check-templates');
const NODE = process.execPath;

function runLinter(args = []) {
  const result = spawnSync(NODE, [LINTER, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? -1,
  };
}

function fixture(...parts) {
  return path.join(FIXTURES, ...parts);
}

describe('check-templates linter', () => {
  it('rejects dot-notation placeholders with LRN-049 guidance', () => {
    const r = runLinter(['--file', fixture('dot-notation', 'bad.md'), '--cwd', REPO_ROOT]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /dot-notation placeholder '\{\{project\.name\}\}'/);
    assert.match(r.stderr, /LRN-049: use flat keys/);
  });

  it('accepts flat placeholders', () => {
    const r = runLinter(['--file', fixture('valid', 'managed-doc.md'), '--cwd', REPO_ROOT]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /0 violations/);
  });

  it('reports multiple dot-notation placeholders in one file', () => {
    const r = runLinter(['--file', fixture('dot-notation', 'multiple.md'), '--cwd', REPO_ROOT]);
    assert.equal(r.status, 1);
    assert.equal((r.stderr.match(/dot-notation placeholder/g) ?? []).length, 2);
    assert.match(r.stderr, /\{\{project\.name\}\}/);
    assert.match(r.stderr, /\{\{project\.agent_suffix\}\}/);
  });

  it('rejects relative-up paths with LRN-050 guidance', () => {
    const r = runLinter(['--file', fixture('relative-path', 'bad.md'), '--cwd', REPO_ROOT]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /relative '\.\.\/' path/);
    assert.match(r.stderr, /LRN-050: scripts run from consumer cwd/);
  });

  it('accepts current-directory relative paths', () => {
    const r = runLinter(['--file', fixture('valid', 'current-dir-link.md'), '--cwd', REPO_ROOT]);
    assert.equal(r.status, 0, r.stderr);
  });

  it('rejects TODO tokens in managed GitHub PR template files', () => {
    const r = runLinter([
      '--file',
      'template/managed/.github/PULL_REQUEST_TEMPLATE.md',
      '--cwd',
      fixture('self-ref-token'),
    ]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /forbidden token 'TODO:' in PR-template/);
    assert.match(r.stderr, /LRN-051: tokens self-reference/);
  });

  it('rejects FIXME tokens in managed GitHub PR template files', () => {
    const r = runLinter([
      '--file',
      'template/managed/.github/issue_template.md',
      '--cwd',
      fixture('self-ref-fixme'),
    ]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /forbidden token 'FIXME:' in PR-template/);
  });

  it('does not reject AUTOTODO without a token boundary', () => {
    const r = runLinter([
      '--file',
      'template/managed/.github/PULL_REQUEST_TEMPLATE.md',
      '--cwd',
      fixture('self-ref-autotodo'),
    ]);
    assert.equal(r.status, 0, r.stderr);
  });

  it('does not apply rule 3 to non-template files under template/managed', () => {
    const r = runLinter(['--file', fixture('non-template-token', 'template', 'managed', 'INSTRUCTIONS.md'), '--cwd', fixture('non-template-token')]);
    assert.equal(r.status, 0, r.stderr);
  });

  it('does not apply rule 3 to template-named files outside template/managed/.github', () => {
    const r = runLinter(['--file', fixture('outside-github-template', 'template', 'managed', 'docs_template.md'), '--cwd', fixture('outside-github-template')]);
    assert.equal(r.status, 0, r.stderr);
  });

  it('does not flag GitHub Actions ${{ ... }} expressions in workflow templates', () => {
    const r = runLinter(['--file', fixture('valid', 'github-actions.yml'), '--cwd', REPO_ROOT]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /0 violations/);
  });

  it('does not flag dot-notation or relative-up shown inside markdown code spans, fenced blocks, or HTML comments', () => {
    const r = runLinter(['--file', fixture('valid', 'docs-as-examples.md'), '--cwd', REPO_ROOT]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /0 violations/);
  });

  it('exits 2 when --file and --dir are both provided', () => {
    const r = runLinter(['--file', fixture('valid', 'managed-doc.md'), '--dir', fixture('valid')]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Usage: check-templates\.mjs/);
  });

  it('exits 2 when neither --file nor --dir is provided', () => {
    const r = runLinter(['--quiet']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Usage: check-templates\.mjs/);
  });

  it('exits 1 for a non-existent target', () => {
    const r = runLinter(['--file', 'does-not-exist.md', '--cwd', FIXTURES]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /check-templates: target not found: does-not-exist\.md/);
  });

  it('exits 2 when a value-taking flag is followed by another flag', () => {
    const r = runLinter(['--file', '--quiet']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /missing value for --file/);
    assert.match(r.stderr, /Usage: check-templates\.mjs/);
  });

  it('reports all violations across a directory', () => {
    const r = runLinter(['--dir', fixture('mixed'), '--cwd', fixture('mixed')]);
    assert.equal(r.status, 1);
    assert.equal((r.stderr.match(/dot-notation placeholder/g) ?? []).length, 1);
    assert.equal((r.stderr.match(/relative '\.\.\/' path/g) ?? []).length, 1);
    assert.equal((r.stderr.match(/forbidden token/g) ?? []).length, 1);
    assert.match(r.stderr, /3 violations/);
  });

  it('suppresses success stdout with --quiet while keeping errors on stderr', () => {
    const success = runLinter(['--dir', fixture('valid'), '--quiet']);
    assert.equal(success.status, 0, success.stderr);
    assert.equal(success.stdout, '');

    const failure = runLinter(['--file', fixture('dot-notation', 'bad.md'), '--quiet']);
    assert.equal(failure.status, 1);
    assert.equal(failure.stdout, '');
    assert.match(failure.stderr, /LRN-049/);
  });
});
