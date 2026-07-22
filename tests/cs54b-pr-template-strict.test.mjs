/**
 * tests/cs54b-pr-template-strict.test.mjs — CS54b: lock the shipped PR template
 * at the strict v0.6.0+ schema.
 *
 * Two obligations (C54b-4):
 *   (a) Structural assertions on the RAW shipped template
 *       (`template/composed/.github/pull_request_template.md`, the source the
 *       rendered root + every `init`/`sync` consumer inherit): it must contain
 *       `## Model audit` with `Implementer agent` / `Reviewer agent` rows and a
 *       6-column `## Review log` header. Plus a regression lock that the orphan
 *       `template/managed/.github/pull_request_template.md` (deleted in CS54b —
 *       see the CS Notes deviation) stays gone.
 *   (b) A filled fixture DERIVED from that template (real 40-char SHA + ISO
 *       timestamp + bare reviewer-model id in the Review-log Go row, independent
 *       Model-audit models) must pass BOTH `check-review-evidence.mjs` (default
 *       strict A3+A4) AND `check-pr-body.mjs`. The raw placeholder-bearing
 *       template is NOT fed directly to the SHA/timestamp-strict checker.
 *
 * Scratch dirs use os.tmpdir() per LRN-094 — never REPO_ROOT.
 *
 * @module tests/cs54b-pr-template-strict.test.mjs
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

/** The shipped (composed) PR template — source of the rendered root + consumers. */
const SHIPPED_TEMPLATE = path.join(
  REPO_ROOT, 'template', 'composed', '.github', 'pull_request_template.md'
);
/** The orphan deleted in CS54b; must not come back. */
const ORPHAN_TEMPLATE = path.join(
  REPO_ROOT, 'template', 'managed', '.github', 'pull_request_template.md'
);
const CHECK_REVIEW_EVIDENCE = path.join(REPO_ROOT, 'scripts', 'check-review-evidence.mjs');
const CHECK_PR_BODY = path.join(REPO_ROOT, 'scripts', 'check-pr-body.mjs');

/** A stable "current" 40-char SHA used as the Review-log Go head + --head. */
const FIXTURE_HEAD = 'a'.repeat(40);

/**
 * Derive a strict-schema-conformant, placeholder-free PR body from the shipped
 * template: strip the leading HTML comment, fill the Model-audit values + the
 * Review-log Go row with concrete values, then blank every remaining `_( )_`
 * placeholder. Order matters — specific cells are filled before the generic
 * placeholder sweep so the audit/log values survive.
 *
 * @param {string} template  Raw template text
 * @returns {string}
 */
function deriveFilledBody(template) {
  let body = template.replace(/^<!--[\s\S]*?-->\s*/, '');
  body = body
    .replace(/\| Implementer models \| _\([^)]*\)_ \|/, '| Implementer models | claude-opus-4.8 |')
    .replace(/\| Reviewer model \| _\([^)]*\)_ \|/, '| Reviewer model | gpt-5.6-sol |')
    .replace(/\| Implementer agent \| _\([^)]*\)_ \|/, '| Implementer agent | yoga-ah-c2 |')
    .replace(/\| Reviewer agent \| _\([^)]*\)_ \|/, '| Reviewer agent | copilot |')
    .replace(/\| Notes \| _\([^)]*\)_ \|/, '| Notes | strict-schema fixture |');
  // Review-log placeholder row → a real Go row whose analyzed_head == FIXTURE_HEAD.
  // Anchor on the unique `_(40-char SHA)_` cell so this is robust to the exact
  // timestamp-placeholder text.
  body = body.replace(
    /^\|[^\n]*_\(40-char SHA\)_[^\n]*\|$/m,
    `| 2026-06-06T00:00:00Z | ${FIXTURE_HEAD} | yoga-ah-c2 | gpt-5.6-sol | Go | https://github.com/henrik-me/agent-harness/pull/1 |`
  );
  // Blank every remaining prose placeholder (Summary/Changes/Testing/Notes).
  body = body.replace(/_\([\s\S]*?\)_/g, 'Filled for the CS54b strict-schema fixture test.');
  return body;
}

describe('CS54b — shipped PR template strict schema', () => {
  let scratch;
  let template;

  before(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cs54b-pr-template-'));
    template = fs.readFileSync(SHIPPED_TEMPLATE, 'utf8');
  });

  after(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  // --- (a) structural assertions on the raw shipped template -----------------

  it('shipped composed template has a ## Model audit section with agent rows', () => {
    assert.match(template, /^## Model audit$/m, 'missing ## Model audit heading');
    assert.match(template, /\|\s*Implementer agent\s*\|/, 'missing Implementer agent row');
    assert.match(template, /\|\s*Reviewer agent\s*\|/, 'missing Reviewer agent row');
    assert.match(template, /\|\s*Implementer models\s*\|/, 'missing Implementer models row');
    assert.match(template, /\|\s*Reviewer model\s*\|/, 'missing Reviewer model row');
  });

  it('shipped composed template has a 6-column ## Review log header', () => {
    assert.match(template, /^## Review log$/m, 'missing ## Review log heading');
    assert.match(
      template,
      /\|\s*timestamp\s*\|\s*analyzed_head\s*\|\s*actor\s*\|\s*model\s*\|\s*verdict\s*\|\s*evidence_link\s*\|/,
      'missing 6-column Review log header (timestamp|analyzed_head|actor|model|verdict|evidence_link)'
    );
  });

  it('the orphan managed PR template stays deleted (CS54b)', () => {
    assert.ok(
      !fs.existsSync(ORPHAN_TEMPLATE),
      'template/managed/.github/pull_request_template.md was deleted in CS54b and must not return'
    );
  });

  // --- (b) a filled fixture derived from the template passes strict linters ---

  it('a filled fixture derived from the template passes check-review-evidence (strict)', () => {
    const fixture = path.join(scratch, 'filled-pr-body.md');
    const body = deriveFilledBody(template);
    assert.ok(!/_\(/.test(body), 'derived fixture still contains a _( )_ placeholder');
    fs.writeFileSync(fixture, body, 'utf8');

    const res = spawnSync(
      'node',
      [CHECK_REVIEW_EVIDENCE, '--pr-body', fixture, '--head', FIXTURE_HEAD],
      { encoding: 'utf8' }
    );
    assert.strictEqual(
      res.status, 0,
      `check-review-evidence should pass on a filled fixture; got ${res.status}\n${res.stdout}\n${res.stderr}`
    );
  });

  it('the same filled fixture passes check-pr-body', () => {
    const fixture = path.join(scratch, 'filled-pr-body-2.md');
    fs.writeFileSync(fixture, deriveFilledBody(template), 'utf8');

    const res = spawnSync(
      'node',
      [CHECK_PR_BODY, '--file', fixture],
      { encoding: 'utf8' }
    );
    assert.strictEqual(
      res.status, 0,
      `check-pr-body should pass on a filled fixture; got ${res.status}\n${res.stdout}\n${res.stderr}`
    );
  });
});
