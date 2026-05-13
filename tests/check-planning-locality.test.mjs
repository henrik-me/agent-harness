/**
 * tests/check-planning-locality.test.mjs — CS35 (planning-locality enforcement).
 *
 * Verifies the planning-locality linter behaves per Decisions C35-11 / C35-12:
 *   - Banned basenames at repo root fail.
 *   - Banned basenames inside allow-listed paths (template/, project/clickstops/,
 *     tests/fixtures/) are accepted.
 *   - Allowed (non-banned) basenames anywhere are accepted.
 *
 * Per LRN-094 each test creates its scratch repo under `os.tmpdir()`, never
 * under REPO_ROOT (which would race with check-text-encoding's recursive walk
 * during parallel `node --test` runs).
 *
 * @module tests/check-planning-locality.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPT = path.join(__dirname, '..', 'scripts', 'check-planning-locality.mjs');

/**
 * Set up a throwaway git repo under os.tmpdir() seeded with the given files.
 * Returns the absolute repo root.
 *
 * Per LRN-094: scratch repos must live under os.tmpdir(), never under
 * REPO_ROOT, otherwise check-text-encoding's recursive walk under parallel
 * `node --test` will race and ENOENT.
 *
 * @param {Record<string, string>} files - Map of POSIX rel-path -> file contents.
 * @returns {string} Absolute path to the temp repo root.
 */
function setupRepo(files) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'check-planning-locality-'));
  spawnSync('git', ['-C', repo, 'init', '--quiet'], { encoding: 'utf8' });
  spawnSync('git', ['-C', repo, 'config', 'user.email', 'test@example.com'], { encoding: 'utf8' });
  spawnSync('git', ['-C', repo, 'config', 'user.name', 'Test'], { encoding: 'utf8' });
  for (const [rel, contents] of Object.entries(files)) {
    const abs = path.join(repo, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, contents);
  }
  spawnSync('git', ['-C', repo, 'add', '-A'], { encoding: 'utf8' });
  spawnSync('git', ['-C', repo, 'commit', '-m', 'seed', '--quiet'], { encoding: 'utf8' });
  return repo;
}

function runLinter(repo, extraArgs = []) {
  return spawnSync('node', [SCRIPT, '--cwd', repo, ...extraArgs], { encoding: 'utf8' });
}

function cleanup(repo) {
  fs.rmSync(repo, { recursive: true, force: true });
}

test('check-planning-locality: PLAN.md at repo root fails', () => {
  const repo = setupRepo({
    'README.md': '# repo\n',
    'PLAN.md': '# strategic plan\n',
  });
  try {
    const result = runLinter(repo);
    assert.equal(result.status, 1, 'expected exit 1');
    assert.match(result.stderr, /PLAN\.md/);
    assert.match(result.stderr, /1 banned planning file/);
  } finally {
    cleanup(repo);
  }
});

test('check-planning-locality: case-insensitive — Plan.md, todo.md, ROADMAP.MD all flagged', () => {
  const repo = setupRepo({
    'README.md': '# repo\n',
    'Plan.md': '# x\n',
    'todo.md': '# y\n',
    'ROADMAP.MD': '# z\n',
  });
  try {
    const result = runLinter(repo);
    assert.equal(result.status, 1, 'expected exit 1');
    assert.match(result.stderr, /3 banned planning file/);
  } finally {
    cleanup(repo);
  }
});

test('check-planning-locality: PLAN.md inside template/ allowed', () => {
  const repo = setupRepo({
    'README.md': '# repo\n',
    'template/managed/PLAN.md': '# template skeleton allowed\n',
  });
  try {
    const result = runLinter(repo);
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
  } finally {
    cleanup(repo);
  }
});

test('check-planning-locality: NOTES.md inside project/clickstops/ allowed', () => {
  const repo = setupRepo({
    'README.md': '# repo\n',
    'project/clickstops/active/NOTES.md': '# canonical home\n',
  });
  try {
    const result = runLinter(repo);
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
  } finally {
    cleanup(repo);
  }
});

test('check-planning-locality: STRATEGY.md inside tests/fixtures/ allowed', () => {
  const repo = setupRepo({
    'README.md': '# repo\n',
    'tests/fixtures/cs99/STRATEGY.md': '# fixture for some other linter\n',
  });
  try {
    const result = runLinter(repo);
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
  } finally {
    cleanup(repo);
  }
});

test('check-planning-locality: arbitrarily-named planning content (e.g. ARCHITECTURE.md) NOT flagged', () => {
  const repo = setupRepo({
    'README.md': '# repo\n',
    'ARCHITECTURE.md': '# fine\n',
    'docs/design.md': '# fine\n',
  });
  try {
    const result = runLinter(repo);
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
  } finally {
    cleanup(repo);
  }
});

test('check-planning-locality: --quiet suppresses success stdout', () => {
  const repo = setupRepo({
    'README.md': '# repo\n',
  });
  try {
    const result = runLinter(repo, ['--quiet']);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
  } finally {
    cleanup(repo);
  }
});

test('check-planning-locality: non-git directory exits 0 with notice', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-planning-locality-nonrepo-'));
  try {
    const result = runLinter(dir);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /not a git repository/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('check-planning-locality: --help prints usage and exits 0', () => {
  const result = spawnSync('node', [SCRIPT, '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage: check-planning-locality/);
  assert.match(result.stdout, /Banned basenames/);
});

test('check-planning-locality: nested PLAN.md outside allow-list flagged with full path', () => {
  const repo = setupRepo({
    'README.md': '# repo\n',
    'docs/PLAN.md': '# violation in docs/\n',
  });
  try {
    const result = runLinter(repo);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /docs\/PLAN\.md/);
  } finally {
    cleanup(repo);
  }
});
