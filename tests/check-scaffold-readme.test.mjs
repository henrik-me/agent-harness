/**
 * tests/check-scaffold-readme.test.mjs — Tests for scripts/check-scaffold-readme.mjs.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const LINTER = path.join(REPO_ROOT, 'scripts', 'check-scaffold-readme.mjs');
const NODE = process.execPath;

function run(args = [], cwd = REPO_ROOT) {
  const result = spawnSync(NODE, [LINTER, ...args], { cwd, encoding: 'utf8' });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? -1,
  };
}

function withReadme(content, callback) {
  const dir = mkdtempSync(path.join(tmpdir(), 'check-scaffold-readme-'));
  try {
    const file = path.join(dir, 'README.md');
    writeFileSync(file, content, 'utf8');
    return callback(file, dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function validReadme(name = 'sample', includeConfiguration = true, extra = '') {
  return [
    `# Scaffold: ${name}`,
    '',
    '## When to use',
    '',
    'Use this scaffold for tests.',
    '',
    '## What it ships',
    '',
    '- Test files.',
    '',
    '## Customization points',
    '',
    '- Update placeholders.',
    '',
    '## How to invoke',
    '',
    'Run it.',
    '',
    includeConfiguration ? '## Configuration\n\nNo config.\n' : '',
    extra,
  ].join('\n');
}

describe('check-scaffold-readme linter', () => {
  it('1. happy path exits 0', () => withReadme(validReadme('sample'), (file) => {
    const r = run(['--file', file, '--name', 'sample']);
    assert.equal(r.status, 0, `expected 0 got ${r.status}; stderr: ${r.stderr}`);
    assert.match(r.stdout, /OK/);
    assert.equal(r.stderr, '');
  }));

  it('2. mismatched H1 exits 1 with expected message', () => withReadme(
    validReadme('wrong'),
    (file) => {
      const r = run(['--file', file, '--name', 'sample']);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /H1 must be '# Scaffold: sample', got '# Scaffold: wrong'/);
      assert.equal(r.stdout, '');
    },
  ));

  it('3. no H1 exits 1', () => withReadme(
    validReadme('sample').replace('# Scaffold: sample\n\n', ''),
    (file) => {
      const r = run(['--file', file, '--name', 'sample']);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /no H1 heading found/);
    },
  ));

  it('4. missing one required H2 exits 1 and names it', () => withReadme(
    validReadme('sample').replace('## What it ships\n\n- Test files.\n\n', ''),
    (file) => {
      const r = run(['--file', file, '--name', 'sample']);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /missing required H2 section '## What it ships'/);
    },
  ));

  it('5. missing multiple required H2s reports all missing headings', () => withReadme(
    validReadme('sample')
      .replace('## What it ships\n\n- Test files.\n\n', '')
      .replace('## How to invoke\n\nRun it.\n\n', ''),
    (file) => {
      const r = run(['--file', file, '--name', 'sample']);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /missing required H2 section '## What it ships'/);
      assert.match(r.stderr, /missing required H2 section '## How to invoke'/);
    },
  ));

  it('6. optional Configuration section may be absent', () => withReadme(
    validReadme('sample', false),
    (file) => {
      const r = run(['--file', file, '--name', 'sample']);
      assert.equal(r.status, 0, `expected 0 got ${r.status}; stderr: ${r.stderr}`);
    },
  ));

  it('7. extra H2 sections are allowed', () => withReadme(
    validReadme('sample', true, '## See also\n\nMore docs.\n'),
    (file) => {
      const r = run(['--file', file, '--name', 'sample']);
      assert.equal(r.status, 0, `expected 0 got ${r.status}; stderr: ${r.stderr}`);
    },
  ));

  it('8. every in-tree scaffold README passes', () => {
    const scaffoldsDir = path.join(REPO_ROOT, 'scaffolds');
    const scaffoldNames = readdirSync(scaffoldsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    assert.equal(scaffoldNames.length, 8);

    for (const name of scaffoldNames) {
      const readme = path.join(scaffoldsDir, name, 'README.md');
      assert.ok(existsSync(readme), `missing README for ${name}`);
      const r = run(['--file', readme, '--name', name, '--quiet']);
      assert.equal(
        r.status,
        0,
        `${name} failed scaffold README lint\nstdout: ${r.stdout}\nstderr: ${r.stderr}`,
      );
      assert.equal(r.stdout, '');
    }
  });

  it('9. missing --file exits 2', () => {
    const r = run(['--name', 'sample']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /--file <path> is required/);
  });

  it('10. requireValue guard rejects --name --quiet', () => withReadme(
    validReadme('sample'),
    (file) => {
      const r = run(['--file', file, '--name', '--quiet']);
      assert.equal(r.status, 2);
      assert.match(r.stderr, /missing value for --name/);
    },
  ));

  it('11. target not found exits 1', () => {
    const missing = path.join(tmpdir(), 'check-scaffold-readme-missing', 'README.md');
    const r = run(['--file', missing, '--name', 'missing']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /check-scaffold-readme: target not found:/);
  });
});
