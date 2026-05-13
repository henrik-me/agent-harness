/**
 * Retroactive regression test for `henrik-me/sub-invaders#28` — the canonical
 * #145-Phase-1 reference failure case.
 *
 * Per CS38b plan:
 * - C38b-1: transcript captured in `docs/cs38b-retro-pr28-transcript.md`.
 * - C38b-2/2b: fixture at `tests/fixtures/si-pr28/` (repo.bundle + pr.json + body.md + expected-evidence.json).
 * - C38b-5 (PASS branch since CS37 = PASS): retroactive must produce ≥4 distinct
 *   gate failures matching #145.
 * - LRN-094: tests use `os.tmpdir()`, never REPO_ROOT — `check-text-encoding`'s
 *   recursive walk under parallel `node --test` race-ENOENTs on Windows.
 * - LRN-111: each Decision-driven assertion cites the Decision ID + REVIEWS.md
 *   section that defines the requirement.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const FIXTURE_DIR = join(REPO_ROOT, 'tests', 'fixtures', 'si-pr28');
const HARNESS_BIN = join(REPO_ROOT, 'bin', 'harness.mjs');

const SI_PR28_BASE = 'e5e5b73a28cde2864602276e23cc87c7e432db14';
const SI_PR28_HEAD = 'ec26adf1386370037ec8b49607a5e47a92f8366a';

function setupBundleClone() {
  const tmp = mkdtempSync(join(tmpdir(), 'si-pr28-retro-'));
  const cloneRes = spawnSync('git', ['clone', '--quiet', join(FIXTURE_DIR, 'repo.bundle'), tmp], {
    encoding: 'utf8',
  });
  if (cloneRes.status !== 0) {
    throw new Error(`git clone failed: ${cloneRes.stderr || cloneRes.stdout}`);
  }
  const checkout = spawnSync('git', ['checkout', '--quiet', SI_PR28_HEAD], {
    cwd: tmp,
    encoding: 'utf8',
  });
  if (checkout.status !== 0) {
    throw new Error(`git checkout failed: ${checkout.stderr || checkout.stdout}`);
  }
  return tmp;
}

function runPrEvidence(cwd, jsonMode) {
  const args = [
    HARNESS_BIN,
    'pr-evidence',
    '--base', SI_PR28_BASE,
    '--head', SI_PR28_HEAD,
    '--pr-body', join(FIXTURE_DIR, 'body.md'),
    '--repo', 'henrik-me/sub-invaders',
    '--pr', '28',
  ];
  if (jsonMode) args.push('--json');
  return spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
}

test('CS38b retro: SI PR #28 fixture exists and is well-formed', () => {
  assert.ok(existsSync(join(FIXTURE_DIR, 'repo.bundle')), 'repo.bundle present');
  assert.ok(existsSync(join(FIXTURE_DIR, 'pr.json')), 'pr.json present');
  assert.ok(existsSync(join(FIXTURE_DIR, 'body.md')), 'body.md present');
  assert.ok(existsSync(join(FIXTURE_DIR, 'expected-evidence.json')), 'expected-evidence.json present');
  const pr = JSON.parse(readFileSync(join(FIXTURE_DIR, 'pr.json'), 'utf8'));
  assert.equal(pr.number, 28);
  assert.equal(pr.baseRefOid, SI_PR28_BASE);
  assert.equal(pr.headRefOid, SI_PR28_HEAD);
});

test('CS38b retro: harness pr-evidence --json output matches expected-evidence.json shape', () => {
  const tmp = setupBundleClone();
  try {
    const res = runPrEvidence(tmp, true);
    assert.equal(res.status, 1, `expected exit 1 (failures), got ${res.status}: ${res.stderr}`);
    const actual = JSON.parse(res.stdout);
    const expected = JSON.parse(readFileSync(join(FIXTURE_DIR, 'expected-evidence.json'), 'utf8'));
    assert.deepEqual(actual, expected, 'JSON output drift from canonical fixture');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('CS38b-5 (PASS branch): retro produces ≥4 distinct doctrine failures per #145', () => {
  // Per LRN-111: each gate-level assertion below cites the C38b Decision ID + REVIEWS.md
  // section that defines the requirement, so a silent regression would fail loudly.
  const tmp = setupBundleClone();
  try {
    const res = runPrEvidence(tmp, false);
    assert.equal(res.status, 1, 'aggregate exit must be non-zero');
    const out = res.stdout + res.stderr;

    // Failure 1 — B1 commit-trailers (REVIEWS.md §B1; doctrine: every commit must
    // carry `Co-authored-by: Copilot` trailer).
    assert.match(
      out,
      /commit [0-9a-f]+ .*: missing Co-authored-by: Copilot trailer/,
      'B1: ≥1 commit must be flagged for missing Copilot trailer',
    );

    // Failure 2 — A3 ## Review log column shape (REVIEWS.md §2.7).
    assert.match(
      out,
      /## Review log table is missing required column\(s\)/,
      'A3: Review log column-shape gate must fire (REVIEWS.md §2.7)',
    );

    // Failure 3 — A3 ## Model audit shape (REVIEWS.md §2.8).
    assert.match(
      out,
      /## Model audit table is missing "Field" or "Value" columns/,
      'A3: Model audit key-value-shape gate must fire (REVIEWS.md §2.8)',
    );

    // Failure 4 — A4/A16 stale Copilot review at PR HEAD (REVIEWS.md §A4 + §A16).
    assert.match(
      out,
      /A16\/A4: latest copilot-pull-request-reviewer review is on stale commit/,
      'A16/A4: stale Copilot review gate must fire',
    );

    // Aggregate-level: at least 3 named gates must show "fail" in the summary
    // (B1 + A3+A4 aggregate + A5+A16 aggregate).
    const failCount = (out.match(/^\s*[\u2717\u2718x×]\s+\S+.*: fail/gm) || []).length;
    assert.ok(
      failCount >= 3,
      `aggregate summary must show ≥3 failed gates (saw ${failCount}); raw output:\n${out}`,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
