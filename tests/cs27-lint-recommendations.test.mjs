// tests/cs27-lint-recommendations.test.mjs — CS27 Finding #8.
//
// `harness lint` checks `pr-body` (.github/PR_BODY.md) and `commit-trailers`
// (.git/COMMIT_EDITMSG) target consumer-applicable files a fresh consumer
// typically lacks, so they silently skip with "target not found" and the
// consumer never learns the check exists (Finding #8).
//
// Decisions C27-2 + C27-3: in the (non-quiet) lint summary, surface an adoption
// recommendation for those two checks instead of a bare skip. Under --quiet the
// recommendation is suppressed (the row falls back to the plain skipped form),
// and when the prerequisite files are present the recommendation never appears
// (the check runs normally).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const CLI = path.join(REPO_ROOT, 'bin', 'harness.mjs');

const MINIMAL_CONFIG = JSON.stringify(
  {
    version: 'self',
    project: { name: 'cs27-consumer', agent_suffix: 'tst' },
    managed: { files: [] },
    composed: { files: [] },
    seeded: { files: [] },
    excluded: [],
  },
  null,
  2,
);

// Scratch dirs must live under os.tmpdir(), never under REPO_ROOT — writes there
// race check-text-encoding's recursive walk under parallel `node --test`.
function makeConsumer() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'cs27-lint-'));
  writeFileSync(path.join(dir, 'harness.config.json'), MINIMAL_CONFIG);
  return dir;
}

function lint(dir, extraArgs = []) {
  const result = spawnSync(process.execPath, [CLI, '--cwd', dir, 'lint', ...extraArgs], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env },
  });
  return (result.stdout ?? '') + (result.stderr ?? '');
}

const PR_BODY_REC = 'pr-body: not configured (recommendation:';
const COMMIT_TRAILERS_REC = 'commit-trailers: not configured (recommendation:';

test('CS27 Finding #8: non-quiet lint surfaces recommendations when prerequisites are absent', () => {
  const dir = makeConsumer();
  try {
    const out = lint(dir);
    assert.ok(out.includes(PR_BODY_REC), `expected pr-body recommendation; got:\n${out}`);
    assert.ok(out.includes(COMMIT_TRAILERS_REC), `expected commit-trailers recommendation; got:\n${out}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CS27 Finding #8: --quiet suppresses the recommendations (plain skipped rows)', () => {
  const dir = makeConsumer();
  try {
    const out = lint(dir, ['--quiet']);
    assert.ok(!out.includes('recommendation:'), `expected no recommendation under --quiet; got:\n${out}`);
    assert.ok(/–\s*pr-body:\s*skipped \(target not found\)/.test(out), `expected plain skipped pr-body row; got:\n${out}`);
    assert.ok(/–\s*commit-trailers:\s*skipped \(target not found\)/.test(out), `expected plain skipped commit-trailers row; got:\n${out}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CS27 Finding #8: recommendations do NOT appear when the prerequisite files are present', () => {
  const dir = makeConsumer();
  try {
    mkdirSync(path.join(dir, '.github'), { recursive: true });
    writeFileSync(path.join(dir, '.github', 'PR_BODY.md'), '## Summary\n\nbody\n');
    mkdirSync(path.join(dir, '.git'), { recursive: true });
    writeFileSync(path.join(dir, '.git', 'COMMIT_EDITMSG'), 'chore: probe\n');
    const out = lint(dir);
    assert.ok(!out.includes(PR_BODY_REC), `pr-body recommendation should be absent when PR_BODY.md exists; got:\n${out}`);
    assert.ok(!out.includes(COMMIT_TRAILERS_REC), `commit-trailers recommendation should be absent when COMMIT_EDITMSG exists; got:\n${out}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
