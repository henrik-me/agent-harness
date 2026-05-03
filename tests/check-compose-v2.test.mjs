/**
 * tests/check-compose-v2.test.mjs — Tests for scripts/check-compose-v2.mjs
 *
 * Uses node:test (consistent with existing test files).
 * Spawns the linter via spawnSync (same pattern as tests/check-workflow-pins.test.mjs).
 * Fixture files live in tests/fixtures/cs07/compose-v2/.
 *
 * Run: node --test tests/check-compose-v2.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const LINTER = path.join(REPO_ROOT, 'scripts', 'check-compose-v2.mjs');
const FIXTURES = path.join(__dirname, 'fixtures', 'cs07', 'compose-v2');
const NODE = process.execPath;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run the linter with the given args. Returns { stdout, stderr, status }.
 *
 * @param {string[]} [args]
 * @returns {{ stdout: string, stderr: string, status: number }}
 */
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

/**
 * Return the absolute path to a fixture file under compose-v2/.
 *
 * @param {string} dir - fixture subdirectory name
 * @param {string} [file] - filename (defaults to docker-compose.yml)
 * @returns {string}
 */
function fixtureFile(dir, file = 'docker-compose.yml') {
  return path.join(FIXTURES, dir, file);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('check-compose-v2 linter', () => {
  // 1. Valid v2 file (no version, services present, no deprecated keys) → exit 0
  it('1. valid Compose Spec v2 file exits 0', () => {
    const r = runLinter(['--file', fixtureFile('valid-v2', 'compose.yaml')]);
    assert.equal(
      r.status, 0,
      `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('✅'),
      `Expected success indicator in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('0 errors'),
      `Expected 0 errors in summary; got:\n${r.stdout}`
    );
  });

  // 2. File with `version: "3"` → exit 1
  it('2. compose file with version: "3" exits 1', () => {
    const r = runLinter(['--file', fixtureFile('version3')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected ERROR in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.toLowerCase().includes('version') || r.stdout.includes('deprecated'),
      `Expected mention of version/deprecated in error; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('1 errors'),
      `Expected 1 error in summary; got:\n${r.stdout}`
    );
  });

  // 3. Missing `services:` → exit 1
  it('3. compose file missing services block exits 1', () => {
    const r = runLinter(['--file', fixtureFile('no-services')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected ERROR in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('services'),
      `Expected mention of 'services' in error; got:\n${r.stdout}`
    );
  });

  // 4. Service block uses `links:` → exit 1 (deprecated)
  it('4. service using deprecated links key exits 1', () => {
    const r = runLinter(['--file', fixtureFile('deprecated-links')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected ERROR in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('links'),
      `Expected mention of 'links' in error; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('deprecated'),
      `Expected mention of 'deprecated' in error; got:\n${r.stdout}`
    );
  });

  // 5. Empty services block (no services defined) → exit 1
  it('5. empty services block exits 1', () => {
    const r = runLinter(['--file', fixtureFile('empty-services')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected ERROR in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.includes('services'),
      `Expected mention of 'services' in error; got:\n${r.stdout}`
    );
  });

  // 6. Missing `--file` → exit 2
  it('6. missing --file exits 2 with usage error', () => {
    const r = runLinter([]);
    assert.equal(
      r.status, 2,
      `Expected exit 2; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stderr.includes('--file'),
      `Expected mention of '--file' in stderr; got:\n${r.stderr}`
    );
  });

  // 7. --file --quiet → exit 2 (LRN-040: requireValue guard)
  it('7. --file --quiet (value is a flag) exits 2', () => {
    const r = runLinter(['--file', '--quiet']);
    assert.equal(
      r.status, 2,
      `Expected exit 2; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stderr.includes('--file'),
      `Expected mention of '--file' in stderr; got:\n${r.stderr}`
    );
  });

  // 8. Malformed YAML → exit 1 with parse error
  it('8. malformed YAML exits 1 with parse error', () => {
    const r = runLinter(['--file', fixtureFile('malformed')]);
    assert.equal(
      r.status, 1,
      `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
    assert.ok(
      r.stdout.includes('ERROR'),
      `Expected ERROR in output; got:\n${r.stdout}`
    );
    assert.ok(
      r.stdout.toLowerCase().includes('parse') || r.stdout.toLowerCase().includes('yaml'),
      `Expected parse/yaml mention in error; got:\n${r.stdout}`
    );
  });
});
