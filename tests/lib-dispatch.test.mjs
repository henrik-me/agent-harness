/**
 * tests/lib-dispatch.test.mjs — unit tests for lib/dispatch.mjs (CS64 C64-6).
 *
 * Pure-function tests over inline markdown fixtures. The "real preamble source"
 * roundtrip check reads the on-repo DISPATCH-PREAMBLE.md read-only via
 * path.resolve from import.meta.url; no scratch files are written. CS86 relocated
 * the canonical preamble source out of OPERATIONS.md into the managed
 * DISPATCH-PREAMBLE.md (which `harness dispatch` now reads), so these cases read
 * that file rather than OPERATIONS.md.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  extractPreamble,
  renderTaskSections,
  emitBriefing,
  emitBriefingFromFile,
} from '../lib/dispatch.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DISPATCH_PREAMBLE_MD = path.join(REPO_ROOT, 'DISPATCH-PREAMBLE.md');

const MINIMAL_OPS_MD = [
  '# OPERATIONS',
  '',
  '### Mandatory briefing preamble (copy verbatim into every dispatch)',
  '',
  'Some prose explaining the discipline.',
  '',
  '```text',
  '## CRITICAL PREFLIGHT (LRN-021)',
  '',
  '1. Record the SHA.',
  '2. No commits.',
  '```',
  '',
  '### Next section',
  '',
  'Other content.',
].join('\n');

// A structurally-complete fixture for the CS102 profile-splicing path:
// core fence with both injection markers + a node and a dotnet profile fence.
// emitBriefing() now splices a language profile into the core, so it requires
// these markers/fences (MINIMAL_OPS_MD above intentionally lacks them and is
// reserved for the pure extractPreamble tests).
const PROFILE_OPS_MD = [
  '# OPERATIONS',
  '',
  '### Mandatory briefing preamble (copy verbatim into every dispatch)',
  '',
  'Some prose explaining the discipline.',
  '',
  '```text',
  '## CRITICAL PREFLIGHT (LRN-021)',
  '',
  '1. Record the SHA.',
  '2. No commits.',
  '',
  '## Conventions to follow',
  '',
  '- Agnostic core convention (LF, no BOM).',
  '<!-- harness:dispatch-language-conventions -->',
  '',
  '## Self-checks before reporting',
  '',
  '1. `git status --short`.',
  '<!-- harness:dispatch-language-self-checks -->',
  '',
  '## Mandatory report shape',
  '',
  'STATUS: complete | partial | blocked',
  '```',
  '',
  '#### Language profiles',
  '',
  'Intro prose.',
  '',
  '```text',
  '## LANGUAGE PROFILE: node',
  '',
  '### conventions',
  '',
  '- ESM `.mjs` only, Node 20+ stdlib.',
  '- Run `npm install` in fresh worktrees.',
  '- `requireValue` guard for value-taking CLI flags.',
  '',
  '<!-- harness:profile-self-checks -->',
  '',
  '### self-checks',
  '',
  '2. `node --test` count delta.',
  '3. `node -c` on authored `.mjs`.',
  '```',
  '',
  '```text',
  '## LANGUAGE PROFILE: dotnet',
  '',
  '### conventions',
  '',
  '- C#/.NET 8+; a service owns its `.csproj`.',
  '',
  '<!-- harness:profile-self-checks -->',
  '',
  '### self-checks',
  '',
  '2. `dotnet build`.',
  '3. `dotnet test`.',
  '```',
  '',
  '### Next section',
  '',
  'Other content.',
].join('\n');

test('extractPreamble returns the body of the ```text fence verbatim', () => {
  const body = extractPreamble(MINIMAL_OPS_MD);
  assert.equal(
    body,
    '## CRITICAL PREFLIGHT (LRN-021)\n\n1. Record the SHA.\n2. No commits.\n'
  );
});

test('extractPreamble throws when the canonical heading is absent', () => {
  assert.throws(
    () => extractPreamble('# OPERATIONS\n\nNo preamble here.\n'),
    /canonical preamble heading not found/
  );
});

test('extractPreamble throws when there is no anchored ```text fence after the heading', () => {
  const md = [
    '### Mandatory briefing preamble (copy verbatim into every dispatch)',
    '',
    'No code fence here.',
    '',
    '### Next section',
  ].join('\n');
  assert.throws(() => extractPreamble(md), /anchored ```text code fence not found/);
});

test('extractPreamble throws when the ```text fence has no closing fence', () => {
  const md = [
    '### Mandatory briefing preamble (copy verbatim into every dispatch)',
    '',
    '```text',
    '## CRITICAL PREFLIGHT (LRN-021)',
    'unterminated content',
  ].join('\n');
  assert.throws(() => extractPreamble(md), /no matching closing ``` fence/);
});

test('extractPreamble ignores ```text fences whose first line is not the canonical marker', () => {
  const md = [
    '### Mandatory briefing preamble (copy verbatim into every dispatch)',
    '',
    '```text',
    'wrong marker',
    '```',
    '',
    '```text',
    '## CRITICAL PREFLIGHT (LRN-021)',
    'right anchor',
    '```',
    '',
    '### Next section',
  ].join('\n');
  assert.equal(extractPreamble(md), '## CRITICAL PREFLIGHT (LRN-021)\nright anchor\n');
});

test('extractPreamble tolerates intervening sibling H3 sections between heading and fence', () => {
  const md = [
    '### Mandatory briefing preamble (copy verbatim into every dispatch)',
    '',
    'Discipline prose.',
    '',
    '### Subcommand authoring',
    '',
    'Some intervening guidance.',
    '',
    '```text',
    '## CRITICAL PREFLIGHT (LRN-021)',
    'body',
    '```',
    '',
    '### Canonical reviewer preamble',
  ].join('\n');
  assert.equal(extractPreamble(md), '## CRITICAL PREFLIGHT (LRN-021)\nbody\n');
});

test('extractPreamble rejects non-string input', () => {
  assert.throws(() => extractPreamble(undefined), /must be a string/);
  assert.throws(() => extractPreamble(42), /must be a string/);
});

test('renderTaskSections returns empty string when no task fields are present', () => {
  assert.equal(renderTaskSections(), '');
  assert.equal(renderTaskSections({}), '');
  assert.equal(renderTaskSections({ ownedFiles: [], requiredReading: [] }), '');
});

test('renderTaskSections renders Identity + scope with provided fields', () => {
  const out = renderTaskSections({
    cs: 'CS64',
    role: 'implementer',
    agentId: 'cs64-startup',
    implementerModel: 'claude-opus-4.7-1m-internal',
    summary: 'Implement lib/startup.mjs per C64-3.',
  });
  assert.match(out, /## Identity \+ scope/);
  assert.match(out, /\*\*CS:\*\* CS64/);
  assert.match(out, /\*\*Role:\*\* implementer/);
  assert.match(out, /\*\*Agent ID:\*\* `cs64-startup`/);
  assert.match(out, /\*\*Implementer model:\*\* claude-opus-4.7-1m-internal/);
  assert.match(out, /Implement lib\/startup\.mjs per C64-3\./);
});

test('renderTaskSections renders File ownership block as backtick-wrapped list', () => {
  const out = renderTaskSections({ ownedFiles: ['lib/startup.mjs', 'tests/lib-startup.test.mjs'] });
  assert.match(out, /## File ownership — OWN only/);
  assert.match(out, /- `lib\/startup\.mjs`/);
  assert.match(out, /- `tests\/lib-startup\.test\.mjs`/);
});

test('renderTaskSections renders Do NOT touch / Required reading / Deliverables / Decision authority sections', () => {
  const out = renderTaskSections({
    doNotTouch: ['lib/closeout.mjs'],
    requiredReading: ['project/clickstops/active/active_cs64_lifecycle-command-skill-surface/active_cs64_lifecycle-command-skill-surface.md'],
    deliverables: ['lib/startup.mjs', 'tests/lib-startup.test.mjs', '≥6 tests covering all branches'],
    decisionAuthority: 'You may decide JSDoc style. Escalate any new field shape on the report.',
  });
  assert.match(out, /## Do NOT touch[\s\S]*- `lib\/closeout\.mjs`/);
  assert.match(out, /## Required reading/);
  assert.match(out, /## Deliverables[\s\S]*- ≥6 tests/);
  assert.match(out, /## Decision authority[\s\S]*You may decide JSDoc style/);
});

test('emitBriefing wraps preamble in ```text fence by default (node profile spliced)', () => {
  const out = emitBriefing({ operationsMd: PROFILE_OPS_MD });
  assert.ok(out.startsWith('```text\n## CRITICAL PREFLIGHT'), 'starts with text fence + preamble');
  // The default (node) profile is spliced in place of the core markers.
  assert.match(out, /ESM `\.mjs`/);
  assert.match(out, /node --test/);
  // No injection/split markers survive in the emitted briefing.
  assert.ok(!out.includes('<!-- harness:dispatch-language-conventions -->'));
  assert.ok(!out.includes('<!-- harness:dispatch-language-self-checks -->'));
  assert.ok(!out.includes('<!-- harness:profile-self-checks -->'));
  // The core fence closes after the (spliced) preamble, before any appendix.
  assert.match(out, /STATUS: complete \| partial \| blocked\n```\n/);
});

test('emitBriefing emits bare preamble body when includeFence is false', () => {
  const out = emitBriefing({ operationsMd: PROFILE_OPS_MD, includeFence: false });
  assert.ok(out.startsWith('## CRITICAL PREFLIGHT'), 'starts with bare preamble');
  assert.ok(!out.includes('```text'));
  assert.match(out, /ESM `\.mjs`/); // node profile spliced by default
});

test('emitBriefing appends task-specific sections below the preamble', () => {
  const out = emitBriefing({
    operationsMd: PROFILE_OPS_MD,
    task: {
      cs: 'CS64',
      role: 'implementer',
      ownedFiles: ['lib/startup.mjs'],
    },
  });
  const fenceEnd = out.indexOf('```\n', 5);
  assert.ok(fenceEnd > 0, 'fence end exists');
  const tail = out.slice(fenceEnd);
  assert.match(tail, /## Identity \+ scope/);
  assert.match(tail, /## File ownership — OWN only/);
});

test('emitBriefing always ends with a trailing newline', () => {
  for (const includeFence of [true, false]) {
    const out = emitBriefing({ operationsMd: PROFILE_OPS_MD, includeFence });
    assert.ok(out.endsWith('\n'), `includeFence=${includeFence} must end with \\n`);
  }
});

test('real DISPATCH-PREAMBLE.md: extractPreamble succeeds and emits the LRN-021 preflight + ownership + report-shape sections', () => {
  const md = readFileSync(DISPATCH_PREAMBLE_MD, 'utf8');
  const preamble = extractPreamble(md);
  assert.match(preamble, /## CRITICAL PREFLIGHT \(LRN-021\)/);
  assert.match(preamble, /## File ownership \(LRN-016\)/);
  assert.match(preamble, /## Required reading/);
  assert.match(preamble, /## Self-checks before reporting/);
  assert.match(preamble, /## Reporting independence \(CS48 \/ issue #142\)/);
  assert.match(preamble, /## Mandatory report shape/);
  assert.match(preamble, /STATUS: complete \| partial \| blocked/);
  assert.match(preamble, /IMPLEMENTER MODEL USED:/);
});

test('emitBriefingFromFile reads DISPATCH-PREAMBLE.md off disk and produces a fenced briefing', () => {
  const out = emitBriefingFromFile({
    operationsPath: DISPATCH_PREAMBLE_MD,
    task: { cs: 'CS64', role: 'implementer', ownedFiles: ['lib/startup.mjs'] },
  });
  assert.match(out, /^```text\n## CRITICAL PREFLIGHT \(LRN-021\)/);
  assert.match(out, /## Identity \+ scope/);
});
