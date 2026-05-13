/**
 * tests/check-clickstop-plan-review.test.mjs — Tests for the plan-review linter.
 *
 * Per CS35b decision C35b-6/7. Tests run the script as a subprocess so that
 * argv parsing + exit codes are exercised end-to-end. Test scratch dirs use
 * os.tmpdir() per LRN-094 — never REPO_ROOT.
 *
 * Cases covered:
 *   - clean planned file with R1 Go (full 8-col schema)
 *   - clean active file with R1 Go-with-amendments
 *   - missing section + --strict=false (warn, exit 0)
 *   - missing section + --strict=true (error, exit 1)
 *   - missing section + --mode=pr-evidence (error regardless of --strict)
 *   - latest verdict Needs-Fix fails (regardless of --strict)
 *   - reviewer model overlap with same-row authors fails
 *   - reviewer model overlap with prior-row authors fails (accumulated)
 *   - malformed table column count fails
 *   - non-ISO timestamp fails
 *   - findings recap > 200 chars fails
 *   - hash mismatch (latest hash ≠ current content) fails
 *   - R1 + R2 happy path with current hash on R2 passes
 *   - hash unchanged after Background-only edit passes
 *   - done file is skipped entirely (linter no-op on done/)
 *   - --skip-reasons workboard-only short-circuits in pr-evidence mode
 *   - --files restricts linting to listed files (grandfathered file ignored)
 *   - --files silently skips files outside planned/active subdirs
 *   - --files still enforces strict pr-evidence on listed in-scope file
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  computePlanReviewHashFromText,
} from '../lib/plan-review-hash.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'check-clickstop-plan-review.mjs');

/**
 * Build a minimal valid clickstop plan body (without `## Plan review`).
 *
 * @param {object} opts
 * @returns {string}
 */
function planBody({ background = 'BG', decisions = '| C1 | x | y |', deliverables = '1. one' } = {}) {
  return [
    '# Test CS',
    '',
    '**Status:** active',
    '**Owner:** test',
    '**Branch:** test',
    '**Started:** 2026-05-13',
    '**Closed:** —',
    '**Depends on:** —',
    '',
    '## Background',
    '',
    background,
    '',
    '## Decisions',
    '',
    '| # | Decision | Choice |',
    '|---|---|---|',
    decisions,
    '',
    '## Deliverables',
    '',
    deliverables,
    '',
    '## Tasks',
    '',
    '| Task | State |',
    '|---|---|',
    '| T1 | pending |',
    '',
  ].join('\n');
}

const HEADER_ROW = '| Round | Reviewer model | Plan author model(s) | Reviewer agent | Reviewed sections hash | Timestamp (UTC) | Verdict | Findings recap (≤200 chars) |';
const SEPARATOR_ROW = '|---|---|---|---|---|---|---|---|';

/**
 * Build a `## Plan review` section from a list of row arrays.
 * Each row is [Round, ReviewerModel, AuthorModels, Agent, Hash, Timestamp, Verdict, Findings].
 *
 * @param {Array<string[]>} rows
 * @returns {string}
 */
function planReviewSection(rows) {
  const dataRows = rows.map((cells) => `| ${cells.join(' | ')} |`).join('\n');
  return ['## Plan review', '', HEADER_ROW, SEPARATOR_ROW, dataRows, ''].join('\n');
}

/**
 * Compose a full plan file with body + Plan review section appended after Decisions
 * (placement before Deliverables per C35b-1, but for testing we append at end —
 * the linter only looks for the H2 anchor anywhere in the file).
 *
 * @param {object} bodyOpts
 * @param {Array<string[]>|null} rows  null = no `## Plan review` section
 * @returns {string}
 */
function compose(bodyOpts, rows) {
  const body = planBody(bodyOpts);
  if (rows === null) return body;
  return body + planReviewSection(rows);
}

/**
 * Run the linter as a subprocess.
 *
 * @param {string} dir
 * @param {string[]} extraArgs
 * @returns {{ status: number, stdout: string, stderr: string }}
 */
function runLinter(dir, extraArgs = []) {
  const result = spawnSync('node', [SCRIPT, '--dir', dir, ...extraArgs], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

let scratch;

before(() => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'check-clickstop-plan-review-'));
  for (const sub of ['planned', 'active', 'done']) {
    fs.mkdirSync(path.join(scratch, sub), { recursive: true });
  }
});

after(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
});

/**
 * Write a file under <scratch>/<subdir>/<basename> and return path.
 * Computes the hash of the body and substitutes "AUTOHASH" placeholder
 * tokens in the rendered Plan review rows with the actual hash.
 */
function writeFile(subdir, basename, content) {
  const hashOfContent = computePlanReviewHashFromText(content);
  const finalContent = content.replace(/AUTOHASH/g, hashOfContent);
  const file = path.join(scratch, subdir, basename);
  fs.writeFileSync(file, finalContent, 'utf8');
  return file;
}

function clearScratch() {
  for (const sub of ['planned', 'active', 'done']) {
    const dir = path.join(scratch, sub);
    for (const f of fs.readdirSync(dir)) {
      fs.unlinkSync(path.join(dir, f));
    }
  }
}

describe('scripts/check-clickstop-plan-review.mjs', () => {
  it('passes a clean planned file with R1 Go', () => {
    clearScratch();
    writeFile('planned', 'planned_cs99_clean.md',
      compose({}, [['R1', 'gpt-5.5', 'claude-opus-4.7', 'agent-x', 'AUTOHASH', '2026-05-13T00:00:00Z', 'Go', 'clean review']])
    );
    const r = runLinter(scratch);
    assert.equal(r.status, 0, `expected pass; stdout=\n${r.stdout}\nstderr=\n${r.stderr}`);
  });

  it('passes a clean active file with R1 Go-with-amendments', () => {
    clearScratch();
    writeFile('active', 'active_cs99_clean.md',
      compose({}, [['R1', 'gpt-5.5', 'claude-opus-4.7', 'agent-x', 'AUTOHASH', '2026-05-13T00:00:00Z', 'Go-with-amendments', 'minor amends']])
    );
    const r = runLinter(scratch);
    assert.equal(r.status, 0, `expected pass; stdout=\n${r.stdout}`);
  });

  it('warn-only on missing section in standalone mode (default --strict=false)', () => {
    clearScratch();
    fs.writeFileSync(path.join(scratch, 'planned', 'planned_cs99_no_section.md'), planBody(), 'utf8');
    const r = runLinter(scratch);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /WARN:.*missing required H2 section/);
  });

  it('errors on missing section with --strict=true', () => {
    clearScratch();
    fs.writeFileSync(path.join(scratch, 'planned', 'planned_cs99_no_section.md'), planBody(), 'utf8');
    const r = runLinter(scratch, ['--strict', 'true']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /ERROR:.*missing required H2 section/);
  });

  it('errors on missing section in pr-evidence mode regardless of --strict=false', () => {
    clearScratch();
    fs.writeFileSync(path.join(scratch, 'planned', 'planned_cs99_no_section.md'), planBody(), 'utf8');
    const r = runLinter(scratch, ['--mode', 'pr-evidence', '--strict', 'false']);
    assert.equal(r.status, 1, `expected pr-evidence to force strict; stdout=\n${r.stdout}`);
    assert.match(r.stdout, /ERROR:.*missing required H2 section/);
  });

  it('errors when latest row verdict is Needs-Fix (regardless of strict)', () => {
    clearScratch();
    writeFile('planned', 'planned_cs99_needs_fix.md',
      compose({}, [['R1', 'gpt-5.5', 'claude-opus-4.7', 'agent-x', 'AUTOHASH', '2026-05-13T00:00:00Z', 'Needs-Fix', 'still has blockers']])
    );
    const r = runLinter(scratch);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /latest row verdict is "Needs-Fix"/);
  });

  it('errors when reviewer model overlaps same-row authors', () => {
    clearScratch();
    writeFile('planned', 'planned_cs99_overlap.md',
      compose({}, [['R1', 'gpt-5.5', 'gpt-5.5', 'agent-x', 'AUTOHASH', '2026-05-13T00:00:00Z', 'Go', 'overlap']])
    );
    const r = runLinter(scratch);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /independence invariant violated/);
  });

  it('errors when reviewer model overlaps a prior-row author (accumulated check)', () => {
    clearScratch();
    writeFile('planned', 'planned_cs99_overlap_prior.md',
      compose({}, [
        ['R1', 'claude-opus-4.7', 'gpt-5.5', 'agent-x', 'AUTOHASH', '2026-05-12T00:00:00Z', 'Needs-Fix', 'first round'],
        ['R2', 'gpt-5.5', 'claude-opus-4.7', 'agent-x', 'AUTOHASH', '2026-05-13T00:00:00Z', 'Go', 'second round — but R2 reviewer was R1 author'],
      ])
    );
    const r = runLinter(scratch);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /independence invariant violated/);
  });

  it('errors on malformed table column count', () => {
    clearScratch();
    const body = planBody();
    const malformed = body + [
      '## Plan review',
      '',
      '| Round | Reviewer model |',
      '|---|---|',
      '| R1 | gpt-5.5 |',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(scratch, 'planned', 'planned_cs99_malformed.md'), malformed, 'utf8');
    const r = runLinter(scratch);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /header has 2 columns; expected 8/);
  });

  it('errors on non-ISO timestamp', () => {
    clearScratch();
    writeFile('planned', 'planned_cs99_bad_ts.md',
      compose({}, [['R1', 'gpt-5.5', 'claude-opus-4.7', 'agent-x', 'AUTOHASH', '2026-05-13', 'Go', 'date only no time']])
    );
    const r = runLinter(scratch);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /not ISO-8601 UTC/);
  });

  it('errors on findings recap > 200 chars', () => {
    clearScratch();
    const longRecap = 'x'.repeat(201);
    writeFile('planned', 'planned_cs99_long_recap.md',
      compose({}, [['R1', 'gpt-5.5', 'claude-opus-4.7', 'agent-x', 'AUTOHASH', '2026-05-13T00:00:00Z', 'Go', longRecap]])
    );
    const r = runLinter(scratch);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /Findings recap is 201 chars; max 200/);
  });

  it('errors when latest row hash does not match current content', () => {
    clearScratch();
    const file = path.join(scratch, 'planned', 'planned_cs99_stale_hash.md');
    // Compose with a known-bad hash (12 valid hex chars but unrelated to content).
    const body = planBody();
    const staleSection = planReviewSection([
      ['R1', 'gpt-5.5', 'claude-opus-4.7', 'agent-x', 'deadbeefcafe', '2026-05-13T00:00:00Z', 'Go', 'stale hash']
    ]);
    fs.writeFileSync(file, body + staleSection, 'utf8');
    const r = runLinter(scratch);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /does not match the current Decisions\+Deliverables/);
  });

  it('passes R1 + R2 happy path with current hash on the latest row', () => {
    clearScratch();
    writeFile('active', 'active_cs99_two_rounds.md',
      compose({}, [
        ['R1', 'gpt-5.5', 'claude-opus-4.7', 'agent-x', '000000000001', '2026-05-12T00:00:00Z', 'Needs-Fix', 'first round had findings'],
        ['R2', 'gpt-5.5', 'claude-opus-4.7', 'agent-x', 'AUTOHASH', '2026-05-13T00:00:00Z', 'Go', 'second round resolved'],
      ])
    );
    const r = runLinter(scratch);
    assert.equal(r.status, 0, `expected pass; stdout=\n${r.stdout}`);
  });

  it('hash unchanged after Background-only edit (still passes)', () => {
    clearScratch();
    // First, write a file with hash for "default" body.
    const defaultBody = planBody();
    const hash = computePlanReviewHashFromText(defaultBody);
    // Now write the same file but with a different Background — the hash
    // doesn't change because Background is not in HASHED_SECTIONS.
    const bodyEdited = planBody({ background: 'COMPLETELY DIFFERENT BACKGROUND' });
    const file = path.join(scratch, 'planned', 'planned_cs99_bg_edit.md');
    fs.writeFileSync(
      file,
      bodyEdited + planReviewSection([['R1', 'gpt-5.5', 'claude-opus-4.7', 'agent-x', hash, '2026-05-13T00:00:00Z', 'Go', 'still good']]),
      'utf8'
    );
    const r = runLinter(scratch);
    assert.equal(r.status, 0, `expected pass; stdout=\n${r.stdout}`);
  });

  it('done/ files are skipped entirely', () => {
    clearScratch();
    // A done file with NO `## Plan review` and Needs-Fix would normally fail —
    // verify it's a no-op when in done/.
    fs.writeFileSync(
      path.join(scratch, 'done', 'done_cs99_no_section.md'),
      planBody(),
      'utf8'
    );
    const r = runLinter(scratch, ['--strict', 'true']);
    assert.equal(r.status, 0, `expected pass — done/ should be skipped; stdout=\n${r.stdout}`);
  });

  it('--skip-reasons workboard-only short-circuits in pr-evidence mode', () => {
    clearScratch();
    fs.writeFileSync(path.join(scratch, 'planned', 'planned_cs99_no_section.md'), planBody(), 'utf8');
    const r = runLinter(scratch, ['--mode', 'pr-evidence', '--skip-reasons', 'workboard-only']);
    assert.equal(r.status, 0, `expected skip; stdout=\n${r.stdout}`);
    assert.match(r.stdout, /skipped|workboard-only/);
  });

  it('bot-author skip reason does NOT skip pr-evidence mode (still strict)', () => {
    clearScratch();
    fs.writeFileSync(path.join(scratch, 'planned', 'planned_cs99_no_section.md'), planBody(), 'utf8');
    const r = runLinter(scratch, ['--mode', 'pr-evidence', '--skip-reasons', 'bot-author']);
    assert.equal(r.status, 1, `expected fail — bot-author does not skip A6; stdout=\n${r.stdout}`);
  });

  it('--files restricts linting to the listed files (in-scope file passes when grandfathered file exists)', () => {
    clearScratch();
    // Grandfathered planned file with NO ## Plan review section (would normally
    // fail in pr-evidence mode). It must NOT be linted because it's not in --files.
    fs.writeFileSync(
      path.join(scratch, 'planned', 'planned_cs01_grandfathered.md'),
      planBody(),
      'utf8'
    );
    // The PR-changed file with valid attestation.
    const changed = writeFile('planned', 'planned_cs99_in_pr.md',
      compose({}, [['R1', 'gpt-5.5', 'claude-opus-4.7', 'agent-x', 'AUTOHASH', '2026-05-13T00:00:00Z', 'Go', 'ok']])
    );
    const r = runLinter(scratch, ['--mode', 'pr-evidence', '--files', changed]);
    assert.equal(r.status, 0, `expected pass — only changed file in scope; stdout=\n${r.stdout}\nstderr=\n${r.stderr}`);
  });

  it('--files silently skips files outside planned/active subdirs (e.g. lib/ or done/ paths)', () => {
    clearScratch();
    // Caller passes a superset of paths from `gh pr diff --name-only` — the
    // linter should silently ignore files not under planned/ or active/.
    const r = runLinter(scratch, [
      '--mode', 'pr-evidence',
      '--files', 'lib/foo.mjs,scripts/bar.mjs,README.md',
    ]);
    assert.equal(r.status, 0, `expected pass — no in-scope files; stdout=\n${r.stdout}\nstderr=\n${r.stderr}`);
  });

  it('--files still enforces strict pr-evidence when a listed in-scope file lacks ## Plan review', () => {
    clearScratch();
    const target = path.join(scratch, 'planned', 'planned_cs99_no_section.md');
    fs.writeFileSync(target, planBody(), 'utf8');
    const r = runLinter(scratch, ['--mode', 'pr-evidence', '--files', target]);
    assert.equal(r.status, 1, `expected fail — listed file missing section is strict; stdout=\n${r.stdout}`);
  });

  it('exits 2 on bad usage (unknown flag)', () => {
    const r = runLinter(scratch, ['--unknown-flag']);
    assert.equal(r.status, 2);
  });

  it('exits 2 when --dir is missing', () => {
    const r = spawnSync('node', [SCRIPT], { encoding: 'utf8' });
    assert.equal(r.status, 2);
  });
});
