/**
 * tests/cs25-runtime-deps.test.mjs — Regression test for CS25.
 *
 * Asserts that ajv, ajv-formats, and js-yaml are runtime dependencies
 * (not devDependencies) so that `npx -y "github:henrik-me/agent-harness#vX"`
 * consumer installs succeed without manual `npm install` workarounds.
 *
 * If this test ever fails because someone moved one of these back to
 * devDependencies, every fresh consumer install will silently fail
 * constraint-merge + post-init sync with `Cannot find package 'ajv'`.
 *
 * See sub-invaders bootstrap (2026-05-11) Finding #1 for the original
 * failure transcript and CS28's [LRN-102](LEARNINGS.md#lrn-102) precedent
 * for why this kind of contract is locked by a regression test.
 *
 * Run: node --test tests/cs25-runtime-deps.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const REQUIRED_RUNTIME_DEPS = ['ajv', 'ajv-formats', 'js-yaml'];

describe('CS25 runtime-deps contract', () => {
  const pkgPath = path.join(REPO_ROOT, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  for (const dep of REQUIRED_RUNTIME_DEPS) {
    it(`${dep} is in dependencies`, () => {
      assert.ok(
        pkg.dependencies && Object.prototype.hasOwnProperty.call(pkg.dependencies, dep),
        `Expected "${dep}" in package.json dependencies. ` +
        `Without this, npx-from-git-ref consumer installs silently fail with ` +
        `"Cannot find package '${dep}'" (sub-invaders bootstrap 2026-05-11 Finding #1).`
      );
    });

    it(`${dep} is NOT in devDependencies`, () => {
      const devDeps = pkg.devDependencies ?? {};
      assert.ok(
        !Object.prototype.hasOwnProperty.call(devDeps, dep),
        `Expected "${dep}" to be a runtime dependency, but it is also listed in ` +
        `devDependencies. Having it in both is a footgun — npm/yarn install behavior ` +
        `with the same package in both blocks is implementation-defined and the ` +
        `dev block can mask the runtime block. Move it to dependencies only.`
      );
    });
  }

  it('package-lock.json mirrors the move', () => {
    const lockPath = path.join(REPO_ROOT, 'package-lock.json');
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    const root = lock.packages?.[''] ?? {};
    for (const dep of REQUIRED_RUNTIME_DEPS) {
      assert.ok(
        root.dependencies && Object.prototype.hasOwnProperty.call(root.dependencies, dep),
        `Expected "${dep}" in package-lock.json root dependencies. ` +
        `Run "npm install" after editing package.json to refresh the lockfile.`
      );
      const devDeps = root.devDependencies ?? {};
      assert.ok(
        !Object.prototype.hasOwnProperty.call(devDeps, dep),
        `package-lock.json root devDependencies still lists "${dep}" — re-run "npm install" ` +
        `after package.json edits to clean this up.`
      );
    }
  });
});
