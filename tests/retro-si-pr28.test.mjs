/**
 * Retroactive regression test for `henrik-me/sub-invaders#28` — the canonical
 * #145-Phase-1 reference failure case.
 *
 * Per CS38b plan:
 * - C38b-1: transcript captured in `docs/cs38b-retro-pr28-transcript.md`.
 * - C38b-2/2b: fixture at `tests/fixtures/si-pr28/` (repo.bundle + pr.json + body.md + expected-evidence.json).
 * - C38b-5 (degradation-aware): the threshold is conditional on the active
 *   `harness.config.json.review_gates.gate_set`. If A5/A16 are in the set
 *   (CS37 spike = PASS) → require ≥4 distinct findings. If only A16 is in
 *   the set (PARTIAL) → ≥3. If only B1/A3/A4 (FAIL) → ≥3. The test reads
 *   `gate_set` to pick the active threshold so the assertion stays
 *   self-consistent with the release.
 * - LRN-094: tests use `os.tmpdir()`, never REPO_ROOT — `check-text-encoding`'s
 *   recursive walk under parallel `node --test` race-ENOENTs on Windows.
 * - LRN-111: each Decision-driven assertion cites the Decision ID + REVIEWS.md
 *   section that defines the requirement.
 *
 * Network discipline: this test runs `harness pr-evidence` WITHOUT `--repo`/`--pr`
 * so the A5+A16 copilot-review gate (which requires `gh api graphql` + auth) is
 * not invoked. The fixture's purpose is deterministic, network-free regression
 * proof of the offline gates (B1 + A3+A4); A5/A16 doctrine is proven separately
 * by `tests/check-copilot-review.test.mjs` and CS37's spike. Counting individual
 * doctrine-error lines from the offline gates still satisfies the C38b-5 PASS
 * threshold (B1 emits 4 trailer errors + A3+A4 emits 2 schema errors = 6 ≥ 4).
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
const HARNESS_CONFIG = join(REPO_ROOT, 'harness.config.json');

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
  // NOTE: deliberately NO --repo / --pr — keeps the test offline (LRN-094 spirit
  // + CI-deterministic). A5+A16 require gh api graphql + auth and are proved
  // separately by check-copilot-review.test.mjs + CS37 spike.
  const args = [
    HARNESS_BIN,
    'pr-evidence',
    '--base', SI_PR28_BASE,
    '--head', SI_PR28_HEAD,
    '--pr-body', join(FIXTURE_DIR, 'body.md'),
  ];
  if (jsonMode) args.push('--json');
  return spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
}

// Per C38b-5 (degradation-aware): pick the required-findings threshold by
// inspecting the live gate_set in harness.config.json.
function requiredFindingsFor(gateSet) {
  const set = new Set(gateSet);
  const hasOrdering = set.has('A5');
  const hasCopilot = set.has('A16');
  if (hasOrdering && hasCopilot) return 4; // PASS branch (CS37 = PASS)
  if (hasCopilot) return 3;                // PARTIAL branch (A16 only)
  return 3;                                // FAIL branch (B1+A3+A4 only)
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

test('CS38b-5 (degradation-aware): retro produces ≥ required-findings per #145', () => {
  // Per LRN-111: each gate-level assertion below cites the C38b Decision ID + REVIEWS.md
  // section that defines the requirement, so a silent regression would fail loudly.
  // Per C38b-5: the required-findings threshold is derived from the live gate_set,
  // not hardcoded — keeps the test self-consistent with degradation paths.
  const config = JSON.parse(readFileSync(HARNESS_CONFIG, 'utf8'));
  const gateSet = config.review_gates?.gate_set ?? [];
  const required = requiredFindingsFor(gateSet);

  const tmp = setupBundleClone();
  try {
    const res = runPrEvidence(tmp, false);
    assert.equal(res.status, 1, 'aggregate exit must be non-zero');
    const out = res.stdout + res.stderr;

    // Failure category 1 — B1 commit-trailers (REVIEWS.md §B1; doctrine: every
    // commit must carry `Co-authored-by: Copilot` trailer). PR #28 has 4
    // distinct commits without the trailer; assert each individually so a
    // silent B1 regression that drops 3 out of 4 errors would still fail.
    const trailerErrors = (out.match(/commit [0-9a-f]+ .*: missing Co-authored-by: Copilot trailer/g) || []).length;
    assert.ok(
      trailerErrors >= 4,
      `B1: expected ≥4 trailer errors on PR #28, saw ${trailerErrors}; raw output:\n${out}`,
    );

    // Failure category 2 — A3 ## Review log column shape (REVIEWS.md §2.7).
    assert.match(
      out,
      /## Review log table is missing required column\(s\)/,
      'A3: Review log column-shape gate must fire (REVIEWS.md §2.7)',
    );

    // Failure category 3 — A3 ## Model audit shape (REVIEWS.md §2.8).
    assert.match(
      out,
      /## Model audit table is missing "Field" or "Value" columns/,
      'A3: Model audit key-value-shape gate must fire (REVIEWS.md §2.8)',
    );

    // Aggregate-level: total distinct doctrine findings (B1 trailer errors
    // + A3+A4 schema errors) must meet the gate-set-derived threshold.
    const a34Errors = (out.match(/check-review-evidence: \d+ errors?/g) || [])
      .map((m) => parseInt(m.match(/(\d+) errors?/)[1], 10))
      .reduce((a, b) => a + b, 0);
    const totalFindings = trailerErrors + a34Errors;
    assert.ok(
      totalFindings >= required,
      `C38b-5: expected ≥${required} distinct findings (gate_set=${JSON.stringify(gateSet)}), saw ${totalFindings} (B1=${trailerErrors}, A3+A4=${a34Errors}); raw output:\n${out}`,
    );

    // Aggregate-level: at least 2 named gates must show "fail" in the offline
    // summary (B1 + A3+A4 aggregate). When --repo/--pr are passed in production
    // this rises to 3 (adds A5+A16) — but the network-free regression asserts
    // only the offline gates.
    const failCount = (out.match(/^\s*[\u2717\u2718x×]\s+\S+.*: fail/gm) || []).length;
    assert.ok(
      failCount >= 2,
      `aggregate summary must show ≥2 failed offline gates (saw ${failCount}); raw output:\n${out}`,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
