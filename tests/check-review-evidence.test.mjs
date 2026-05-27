/**
 * tests/check-review-evidence.test.mjs — Tests for the A3+A4 PR-evidence linter.
 *
 * Tests run the script as a subprocess so that argv parsing + exit codes are
 * exercised end-to-end. Scratch dirs use os.tmpdir() per LRN-094 — never
 * REPO_ROOT.
 *
 * Cases covered:
 *   1. Clean review log + audit (Go row's analyzed_head matches --head,
 *      no model overlap) → exit 0
 *   2. Stale analyzed_head (latest Go row's analyzed_head ≠ --head) → exit 1
 *   3. Missing ## Review log section → exit 1 (A4 fails with explicit message)
 *   4. Missing ## Model audit section → exit 1 (A3 fails with explicit message)
 *   5. Independence violation (implementer model also the reviewer) → exit 1
 *   6a. Multiple Go rows — latest matches --head → exit 0
 *   6b. Multiple Go rows — latest does NOT match --head → exit 1
 *   7. All rows are Needs-Fix → error "no Go verdict row found" → exit 1
 *   8. Malformed analyzed_head in latest Go row (not 40-char SHA) → exit 1
 *   Bonus: --skip-reasons workboard-only → exit 0 regardless of body content
 *   Bonus: --skip-reasons bot-author → exit 0 regardless of body content
 *   Bonus: --help → exit 0 with usage text
 *   Bonus: missing --pr-body → exit 2
 *   Bonus: missing --head → exit 2
 *
 * @module tests/check-review-evidence.test.mjs
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
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'check-review-evidence.mjs');

/** A stable "current" 40-char SHA used as --head throughout tests. */
const VALID_HEAD = 'a'.repeat(40);

/** A different 40-char SHA — used to represent a stale analyzed_head. */
const OTHER_HEAD = 'b'.repeat(40);

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/**
 * Build a PR body markdown string with optional ## Review log and ## Model audit
 * sections. Pass `null` to omit a section entirely.
 *
 * @param {object} opts
 * @param {string[]|null} opts.reviewLogRows  Raw pipe-row strings for the table body
 * @param {[string,string][]|null} opts.modelAuditRows  [field, value] pairs
 * @returns {string}
 */
function buildPrBody({ reviewLogRows = [], modelAuditRows = [] } = {}) {
  const lines = ['# PR Title', ''];

  if (reviewLogRows !== null) {
    lines.push(
      '## Review log',
      '',
      '| timestamp | analyzed_head | actor | model | verdict | evidence_link |',
      '|---|---|---|---|---|---|'
    );
    for (const row of reviewLogRows) {
      lines.push(row);
    }
    lines.push('');
  }

  if (modelAuditRows !== null) {
    lines.push('## Model audit', '', '| Field | Value |', '|---|---|');
    for (const [field, value] of modelAuditRows) {
      lines.push(`| ${field} | ${value} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Build a valid Go row string for the ## Review log table.
 *
 * @param {string} [analyzedHead]
 * @param {string} [verdict]
 * @returns {string}
 */
function makeReviewRow(analyzedHead = VALID_HEAD, verdict = 'Go') {
  return `| 2026-05-14T10:32:00Z | ${analyzedHead} | yoga-ah | gpt-5.5 | ${verdict} | https://github.com/example/pull/1#issuecomment-1 |`;
}

/** Standard independence-clean Model audit rows. */
const CLEAN_AUDIT = [
  ['Implementer models', 'claude-opus-4.7'],
  ['Reviewer model', 'gpt-5.5'],
];

/** Standard independence-clean Model audit rows with explicit agent identities. */
const CLEAN_AUDIT_WITH_AGENTS = [
  ...CLEAN_AUDIT,
  ['Implementer agent', 'yoga-ah'],
  ['Reviewer agent', 'copilot'],
];

// ---------------------------------------------------------------------------
// Test runner helper
// ---------------------------------------------------------------------------

/**
 * Run the linter as a subprocess against a given PR body file.
 *
 * @param {string} prBodyPath
 * @param {string} head
 * @param {string[]} [extraArgs]
 * @returns {{ status: number, stdout: string, stderr: string }}
 */
function run(prBodyPath, head, extraArgs = []) {
  const result = spawnSync(
    'node',
    [SCRIPT, '--pr-body', prBodyPath, '--head', head, ...extraArgs],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

// ---------------------------------------------------------------------------
// Scratch directory lifecycle
// ---------------------------------------------------------------------------

let scratch;

before(() => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'check-review-evidence-'));
});

after(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
});

/**
 * Write a PR body file to the scratch directory and return the absolute path.
 *
 * @param {string} name  Filename within scratch dir
 * @param {string} content
 * @returns {string}
 */
function writeBody(name, content) {
  const file = path.join(scratch, name);
  fs.writeFileSync(file, content, 'utf8');
  return file;
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

describe('scripts/check-review-evidence.mjs', () => {
  // Case 1 ----------------------------------------------------------------
  it('case 1: clean review log + audit → exit 0', () => {
    const body = buildPrBody({
      reviewLogRows: [makeReviewRow(VALID_HEAD)],
      modelAuditRows: CLEAN_AUDIT_WITH_AGENTS,
    });
    const file = writeBody('case1.md', body);
    const r = run(file, VALID_HEAD);
    assert.equal(
      r.status, 0,
      `expected exit 0; stdout=\n${r.stdout}\nstderr=\n${r.stderr}`
    );
    assert.match(r.stdout, /0 errors/);
  });

  // CS41 agent-column cases ----------------------------------------------
  it('CS41: clean Model audit with distinct agent rows → exit 0 and no warning', () => {
    const body = buildPrBody({
      reviewLogRows: [makeReviewRow(VALID_HEAD)],
      modelAuditRows: CLEAN_AUDIT_WITH_AGENTS,
    });
    const file = writeBody('cs41_clean_agents.md', body);
    const r = run(file, VALID_HEAD);
    assert.equal(r.status, 0, `expected exit 0; stdout=\n${r.stdout}\nstderr=\n${r.stderr}`);
    assert.match(r.stdout, /0 errors/);
    assert.match(r.stdout, /0 warnings/);
    assert.doesNotMatch(r.stderr, /WARN:/);
  });

  it('CS41 / CS53 C53-5: missing agent rows with --no-strict-agent-columns → exit 0 and warn to stderr', () => {
    // CS53 C53-5 (CS42 C42-6 promise): default flipped to strict=true in v0.6.0.
    // The legacy warn-ramp behavior remains accessible via --no-strict-agent-columns
    // for transitional consumers.
    const body = buildPrBody({
      reviewLogRows: [makeReviewRow(VALID_HEAD)],
      modelAuditRows: CLEAN_AUDIT,
    });
    const file = writeBody('cs41_missing_agents_warn.md', body);
    const r = run(file, VALID_HEAD, ['--no-strict-agent-columns']);
    assert.equal(r.status, 0, `expected exit 0; stdout=\n${r.stdout}\nstderr=\n${r.stderr}`);
    assert.match(r.stderr, /WARN:/);
    assert.match(r.stderr, /missing required agent row/);
    assert.match(r.stdout, /1 warnings/);
  });

  it('CS53 C53-5: missing agent rows with default strict (v0.6.0+) → exit 1', () => {
    const body = buildPrBody({
      reviewLogRows: [makeReviewRow(VALID_HEAD)],
      modelAuditRows: CLEAN_AUDIT,
    });
    const file = writeBody('cs53_missing_agents_default_strict.md', body);
    const r = run(file, VALID_HEAD);
    assert.equal(r.status, 1, `expected exit 1; stdout=\n${r.stdout}\nstderr=\n${r.stderr}`);
    assert.match(r.stdout, /ERROR:/);
    assert.match(r.stdout, /missing required agent row/);
  });

  it('CS41: missing agent rows with --strict-agent-columns → exit 1', () => {
    const body = buildPrBody({
      reviewLogRows: [makeReviewRow(VALID_HEAD)],
      modelAuditRows: CLEAN_AUDIT,
    });
    const file = writeBody('cs41_missing_agents_strict.md', body);
    const r = run(file, VALID_HEAD, ['--strict-agent-columns']);
    assert.equal(r.status, 1, `expected exit 1; stdout=\n${r.stdout}\nstderr=\n${r.stderr}`);
    assert.match(r.stdout, /ERROR:/);
    assert.match(r.stdout, /missing required agent row/);
  });

  it('CS41: overlapping Implementer/Reviewer agent rows → exit 1', () => {
    const body = buildPrBody({
      reviewLogRows: [makeReviewRow(VALID_HEAD)],
      modelAuditRows: [
        ...CLEAN_AUDIT,
        ['Implementer agent', 'yoga-ah'],
        ['Reviewer agent', 'YOGA-AH'],
      ],
    });
    const file = writeBody('cs41_agent_overlap.md', body);
    const r = run(file, VALID_HEAD);
    assert.equal(r.status, 1, `expected exit 1; stdout=\n${r.stdout}\nstderr=\n${r.stderr}`);
    assert.match(r.stdout, /agent-identity violation/);
  });

  it('CS41 (R4 fix) / CS53 C53-5: empty agent cells with --no-strict-agent-columns → warn-as-missing, NOT overlap', () => {
    // CS53 C53-5: default flipped to strict=true in v0.6.0; legacy warn-ramp behavior
    // requires --no-strict-agent-columns. Both rows present but values are empty →
    // previously triggered overlap because "".trim().toLowerCase() === "".trim().toLowerCase().
    // Per CS41 spec, empty cells are semantically "missing" and should fall under the
    // warn-ramp (when opted-in via --no-strict-agent-columns), not the overlap-strict path.
    const body = buildPrBody({
      reviewLogRows: [makeReviewRow(VALID_HEAD)],
      modelAuditRows: [
        ...CLEAN_AUDIT,
        ['Implementer agent', ''],
        ['Reviewer agent', '   '], // whitespace-only also counts as empty
      ],
    });
    const file = writeBody('cs41_agent_empty.md', body);
    const r = run(file, VALID_HEAD, ['--no-strict-agent-columns']);
    assert.equal(r.status, 0, `expected exit 0; stdout=\n${r.stdout}\nstderr=\n${r.stderr}`);
    assert.doesNotMatch(r.stdout, /agent-identity violation/);
    assert.match(r.stderr, /WARN:/);
    assert.match(r.stderr, /missing required agent row/);
    assert.match(r.stderr, /Implementer agent.*Reviewer agent/);
  });

  it('CS41 (R4 fix): empty agent cells with --strict-agent-columns → exit 1 as missing', () => {
    const body = buildPrBody({
      reviewLogRows: [makeReviewRow(VALID_HEAD)],
      modelAuditRows: [
        ...CLEAN_AUDIT,
        ['Implementer agent', ''],
        ['Reviewer agent', ''],
      ],
    });
    const file = writeBody('cs41_agent_empty_strict.md', body);
    const r = run(file, VALID_HEAD, ['--strict-agent-columns']);
    assert.equal(r.status, 1, `expected exit 1; stdout=\n${r.stdout}\nstderr=\n${r.stderr}`);
    assert.doesNotMatch(r.stdout, /agent-identity violation/);
    assert.match(r.stdout, /missing required agent row/);
  });

  // Case 2 ----------------------------------------------------------------
  it('case 2: stale analyzed_head → exit 1', () => {
    const body = buildPrBody({
      reviewLogRows: [makeReviewRow(OTHER_HEAD)], // OTHER_HEAD ≠ VALID_HEAD
      modelAuditRows: CLEAN_AUDIT,
    });
    const file = writeBody('case2.md', body);
    const r = run(file, VALID_HEAD);
    assert.equal(r.status, 1, `expected exit 1; stdout=\n${r.stdout}`);
    assert.match(r.stdout, /stale Go verdict/);
  });

  // Case 3 ----------------------------------------------------------------
  it('case 3: missing ## Review log → exit 1 with explicit message', () => {
    // Build body with only Model audit, no Review log
    const body = [
      '# PR Title',
      '',
      '## Model audit',
      '',
      '| Field | Value |',
      '|---|---|',
      '| Implementer models | claude-opus-4.7 |',
      '| Reviewer model | gpt-5.5 |',
      '',
    ].join('\n');
    const file = writeBody('case3.md', body);
    const r = run(file, VALID_HEAD);
    assert.equal(r.status, 1, `expected exit 1; stdout=\n${r.stdout}`);
    assert.match(r.stdout, /Review log section is missing/);
  });

  // Case 4 ----------------------------------------------------------------
  it('case 4: missing ## Model audit → exit 1 with explicit message', () => {
    // Build body with only Review log, no Model audit
    const body = [
      '# PR Title',
      '',
      '## Review log',
      '',
      '| timestamp | analyzed_head | actor | model | verdict | evidence_link |',
      '|---|---|---|---|---|---|',
      makeReviewRow(VALID_HEAD),
      '',
    ].join('\n');
    const file = writeBody('case4.md', body);
    const r = run(file, VALID_HEAD);
    assert.equal(r.status, 1, `expected exit 1; stdout=\n${r.stdout}`);
    assert.match(r.stdout, /Model audit section is missing/);
  });

  // Case 5 ----------------------------------------------------------------
  it('case 5: independence violation (implementer = reviewer) → exit 1', () => {
    const body = buildPrBody({
      reviewLogRows: [makeReviewRow(VALID_HEAD)],
      modelAuditRows: [
        // gpt-5.5 appears in both implementer list AND as reviewer
        ['Implementer models', 'claude-opus-4.7, gpt-5.5'],
        ['Reviewer model', 'gpt-5.5'],
      ],
    });
    const file = writeBody('case5.md', body);
    const r = run(file, VALID_HEAD);
    assert.equal(r.status, 1, `expected exit 1; stdout=\n${r.stdout}`);
    assert.match(r.stdout, /overlap with reviewer model/);
  });

  // Case 6a ---------------------------------------------------------------
  it('case 6a: multiple Go rows — latest matches --head → exit 0', () => {
    const body = buildPrBody({
      reviewLogRows: [
        makeReviewRow(OTHER_HEAD),  // earlier Go row (stale SHA but not latest)
        makeReviewRow(VALID_HEAD),  // latest Go row (current SHA)
      ],
      modelAuditRows: CLEAN_AUDIT_WITH_AGENTS,
    });
    const file = writeBody('case6a.md', body);
    const r = run(file, VALID_HEAD);
    assert.equal(
      r.status, 0,
      `expected exit 0 (latest Go row is current); stdout=\n${r.stdout}\nstderr=\n${r.stderr}`
    );
  });

  // Case 6b ---------------------------------------------------------------
  it('case 6b: multiple Go rows — latest is stale → exit 1', () => {
    const body = buildPrBody({
      reviewLogRows: [
        makeReviewRow(VALID_HEAD),  // earlier row (current SHA, but NOT the latest)
        makeReviewRow(OTHER_HEAD),  // latest Go row (stale SHA)
      ],
      modelAuditRows: CLEAN_AUDIT,
    });
    const file = writeBody('case6b.md', body);
    const r = run(file, VALID_HEAD);
    assert.equal(r.status, 1, `expected exit 1; stdout=\n${r.stdout}`);
    assert.match(r.stdout, /stale Go verdict/);
  });

  // Case 7 ----------------------------------------------------------------
  it('case 7: all Needs-Fix rows → "no Go verdict row found" → exit 1', () => {
    const body = buildPrBody({
      reviewLogRows: [
        makeReviewRow(VALID_HEAD, 'Needs-Fix'),
        makeReviewRow(VALID_HEAD, 'Needs-Fix'),
      ],
      modelAuditRows: CLEAN_AUDIT,
    });
    const file = writeBody('case7.md', body);
    const r = run(file, VALID_HEAD);
    assert.equal(r.status, 1, `expected exit 1; stdout=\n${r.stdout}`);
    assert.match(r.stdout, /no row with verdict="Go"/);
  });

  // Case 8 ----------------------------------------------------------------
  it('case 8: malformed analyzed_head in latest Go row → exit 1', () => {
    const body = buildPrBody({
      reviewLogRows: [
        // "not-a-sha" is not a 40-char hex SHA
        makeReviewRow('not-a-sha', 'Go'),
      ],
      modelAuditRows: CLEAN_AUDIT,
    });
    const file = writeBody('case8.md', body);
    const r = run(file, VALID_HEAD);
    assert.equal(r.status, 1, `expected exit 1; stdout=\n${r.stdout}`);
    assert.match(r.stdout, /malformed analyzed_head/);
  });

  // Case 9 (R1 amendment): malformed timestamp -----------------------------
  it('case 9 (R1): malformed timestamp in a Review log row → exit 1', () => {
    // Row with non-ISO 8601 timestamp ("yesterday") should fail per REVIEWS.md §2.7
    const badRow = `| yesterday | ${VALID_HEAD} | yoga-ah | gpt-5.5 | Go | https://example.com |`;
    const body = buildPrBody({
      reviewLogRows: [badRow],
      modelAuditRows: CLEAN_AUDIT,
    });
    const file = writeBody('case9.md', body);
    const r = run(file, VALID_HEAD);
    assert.equal(r.status, 1, `expected exit 1; stdout=\n${r.stdout}`);
    assert.match(r.stdout, /malformed timestamp/i);
    // Actionable C36-9: error must include file path + line number + fix hint
    assert.match(r.stdout, new RegExp(`${file.replace(/\\/g, '\\\\')}:\\d+`));
    assert.match(r.stdout, /Fix:/);
  });

  // Case 10 (R1 amendment): missing required Review log columns -----------
  it('case 10 (R1): Review log missing a required column (e.g. "actor") → exit 1', () => {
    // Header omits "actor" — should fail per REVIEWS.md §2.7 canonical schema
    const body = [
      '# PR Title',
      '',
      '## Review log',
      '',
      '| timestamp | analyzed_head | model | verdict | evidence_link |',
      '|---|---|---|---|---|',
      `| 2026-05-14T10:32:00Z | ${VALID_HEAD} | gpt-5.5 | Go | https://example.com |`,
      '',
      '## Model audit',
      '',
      '| Field | Value |',
      '|---|---|',
      '| Implementer models | claude-opus-4.7 |',
      '| Reviewer model | gpt-5.5 |',
      '',
    ].join('\n');
    const file = writeBody('case10.md', body);
    const r = run(file, VALID_HEAD);
    assert.equal(r.status, 1, `expected exit 1; stdout=\n${r.stdout}`);
    assert.match(r.stdout, /missing required column/i);
    assert.match(r.stdout, /actor/);
    assert.match(r.stdout, /Fix:/);
  });

  // Case 11 (R1 amendment): A4 stale-head error must be actionable --------
  it('case 11 (R1): stale analyzed_head error is C36-9-actionable (file:line + fix)', () => {
    const STALE_HEAD = 'b'.repeat(40);
    const body = buildPrBody({
      reviewLogRows: [makeReviewRow(STALE_HEAD, 'Go')],
      modelAuditRows: CLEAN_AUDIT,
    });
    const file = writeBody('case11.md', body);
    const r = run(file, VALID_HEAD);
    assert.equal(r.status, 1, `expected exit 1; stdout=\n${r.stdout}`);
    assert.match(r.stdout, /stale Go verdict/i);
    assert.match(r.stdout, new RegExp(`${file.replace(/\\/g, '\\\\')}:\\d+`));
    assert.match(r.stdout, /Fix:.*re-dispatch/i);
    // The fix hint should also tell the user the new SHA to use
    assert.match(r.stdout, new RegExp(VALID_HEAD));
  });

  // Case 12 (R1 amendment): A3 independence error is C36-9-actionable -----
  it('case 12 (R1): A3 independence violation error is C36-9-actionable (file:line + fix)', () => {
    const body = buildPrBody({
      reviewLogRows: [makeReviewRow(VALID_HEAD, 'Go')],
      modelAuditRows: [
        ['Implementer models', 'gpt-5.5, claude-opus-4.7'],
        ['Reviewer model', 'gpt-5.5'], // overlap with implementer
      ],
    });
    const file = writeBody('case12.md', body);
    const r = run(file, VALID_HEAD);
    assert.equal(r.status, 1, `expected exit 1; stdout=\n${r.stdout}`);
    assert.match(r.stdout, /independence violation/i);
    assert.match(r.stdout, new RegExp(`${file.replace(/\\/g, '\\\\')}:\\d+`));
    assert.match(r.stdout, /Fix:/);
    assert.match(r.stdout, /C35-2/);
  });

  // Bonus: skip-reasons ---------------------------------------------------
  it('bonus: --skip-reasons workboard-only → exit 0 (skipped)', () => {
    // Even with a completely missing body, skip should short-circuit
    const file = writeBody('bonus_wbo.md', '# Empty PR\n');
    const r = run(file, VALID_HEAD, ['--skip-reasons', 'workboard-only']);
    assert.equal(r.status, 0, `expected exit 0; stdout=\n${r.stdout}`);
    assert.match(r.stdout, /skipped/);
    assert.match(r.stdout, /0 errors/);
  });

  it('bonus: --skip-reasons bot-author → exit 0 (skipped)', () => {
    const file = writeBody('bonus_bot.md', '# Bot PR\n');
    const r = run(file, VALID_HEAD, ['--skip-reasons', 'bot-author']);
    assert.equal(r.status, 0, `expected exit 0; stdout=\n${r.stdout}`);
    assert.match(r.stdout, /skipped/);
  });

  it('bonus: --skip-reasons fork-source does NOT skip → checks run normally', () => {
    // With a valid clean body, fork-source should still pass (checks run)
    const body = buildPrBody({
      reviewLogRows: [makeReviewRow(VALID_HEAD)],
      modelAuditRows: CLEAN_AUDIT_WITH_AGENTS,
    });
    const file = writeBody('bonus_fork.md', body);
    const r = run(file, VALID_HEAD, ['--skip-reasons', 'fork-source']);
    assert.equal(r.status, 0, `expected exit 0 (fork-source does not skip); stdout=\n${r.stdout}`);
    // Should NOT say "skipped"
    assert.doesNotMatch(r.stdout, /\(skipped\)/);
  });

  // Bonus: CLI usage errors -----------------------------------------------
  it('bonus: --help → exit 0 with usage text', () => {
    const result = spawnSync('node', [SCRIPT, '--help'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage/);
    assert.match(result.stdout, /--pr-body/);
    assert.match(result.stdout, /--head/);
  });

  it('bonus: missing --pr-body → exit 2', () => {
    const result = spawnSync('node', [SCRIPT, '--head', VALID_HEAD], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.equal(result.status, 2);
  });

  it('bonus: missing --head → exit 2', () => {
    const file = writeBody('bonus_nohead.md', '# Empty\n');
    const result = spawnSync('node', [SCRIPT, '--pr-body', file], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.equal(result.status, 2);
  });
});
