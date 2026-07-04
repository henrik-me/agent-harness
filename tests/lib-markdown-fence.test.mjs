/**
 * tests/lib-markdown-fence.test.mjs — unit tests for lib/markdown-fence.mjs
 * (CS75 C75-2). Pure in-memory string checks; no filesystem, no scratch dirs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findHeadingIndex, extractHeadingSectionBody } from '../lib/markdown-fence.mjs';

const H = 'Plan-vs-implementation review';

test('findHeadingIndex: locates a real (non-fenced) H2', () => {
  const content = '# Title\n\nintro\n\n## Plan-vs-implementation review\n\nbody\n';
  assert.equal(findHeadingIndex(content, H), 4);
});

test('findHeadingIndex: tolerates multiple spaces/tabs after the marker (CommonMark / doc-schema parity)', () => {
  assert.equal(findHeadingIndex('##  Plan-vs-implementation review\n', H), 0);
  assert.equal(findHeadingIndex('##\tPlan-vs-implementation review\n', H), 0);
  // Zero whitespace after the marker is NOT an ATX heading.
  assert.equal(findHeadingIndex('##Plan-vs-implementation review\n', H), -1);
});

test('findHeadingIndex: returns -1 when the heading is absent', () => {
  assert.equal(findHeadingIndex('# Title\n\nno gate here\n', H), -1);
});

test('findHeadingIndex: a heading inside a ``` fence is treated as MISSING', () => {
  const content = ['# Title', '', '```', '## Plan-vs-implementation review', '```', ''].join('\n');
  assert.equal(findHeadingIndex(content, H), -1);
});

test('findHeadingIndex: a heading inside a ~~~ fence is treated as MISSING', () => {
  const content = ['# Title', '', '~~~', '## Plan-vs-implementation review', '~~~', ''].join('\n');
  assert.equal(findHeadingIndex(content, H), -1);
});

test('findHeadingIndex: inner ``` cannot close an outer ```` fence — heading stays fenced', () => {
  // Outer 4-backtick fence; an inner ``` line does NOT close it, so the ## H
  // line that follows is still inside the outer fence → MISSING.
  const content = [
    '# Title',
    '',
    '````',
    '```',
    '## Plan-vs-implementation review',
    '```',
    '````',
    '',
  ].join('\n');
  assert.equal(findHeadingIndex(content, H), -1);
});

test('findHeadingIndex: a heading AFTER a properly-closed fence is found', () => {
  const content = [
    '# Title',
    '',
    '```',
    'not a heading',
    '```',
    '',
    '## Plan-vs-implementation review',
    '',
  ].join('\n');
  assert.equal(findHeadingIndex(content, H), 6);
});

test('findHeadingIndex: CRLF and bare-CR input is normalized before scanning', () => {
  const crlf = '# Title\r\n\r\n## Plan-vs-implementation review\r\n\r\nbody\r\n';
  assert.equal(findHeadingIndex(crlf, H), 2);
  const cr = '# Title\r\r## Plan-vs-implementation review\r\rbody';
  assert.equal(findHeadingIndex(cr, H), 2);
});

test('findHeadingIndex: trailing whitespace on the heading line is tolerated', () => {
  const content = '## Plan-vs-implementation review   \n';
  assert.equal(findHeadingIndex(content, H), 0);
});

test('findHeadingIndex: level param — default 2 does not match a level-3 heading', () => {
  const content = '### Plan-vs-implementation review\n';
  assert.equal(findHeadingIndex(content, H), -1); // default level 2
  assert.equal(findHeadingIndex(content, H, 3), 0);
});

test('findHeadingIndex: level 1 heading located; a longer-level line does not match', () => {
  const content = '# Deliverables\n\n## Deliverables\n';
  assert.equal(findHeadingIndex(content, 'Deliverables', 1), 0);
  assert.equal(findHeadingIndex(content, 'Deliverables', 2), 2);
});

test('findHeadingIndex: returns the FIRST real heading when duplicates exist', () => {
  const content = '## Deliverables\n\ntext\n\n## Deliverables\n';
  assert.equal(findHeadingIndex(content, 'Deliverables'), 0);
});

test('findHeadingIndex: heading text with regex metacharacters is matched literally', () => {
  const content = '## A.B(c)+ [x]\n';
  assert.equal(findHeadingIndex(content, 'A.B(c)+ [x]'), 0);
  // A different string that the metacharacters would otherwise match must NOT.
  assert.equal(findHeadingIndex('## AXBcccc x\n', 'A.B(c)+ [x]'), -1);
});

test('extractHeadingSectionBody: body runs from the heading to the next heading', () => {
  const content = '## Plan-vs-implementation review\n\n**Reviewer:** x\n**Outcome:** Go\n\n## Next\nafter\n';
  const body = extractHeadingSectionBody(content, H);
  assert.match(body, /\*\*Reviewer:\*\* x/);
  assert.match(body, /\*\*Outcome:\*\* Go/);
  assert.doesNotMatch(body, /after/);
});

test('extractHeadingSectionBody: START is fence-aware — fenced fields before a real empty heading', () => {
  // A fenced ## PVI with fields precedes a REAL empty ## PVI; the body must be
  // scoped to the real (empty) heading, NOT the fenced fields (R1 review hole).
  const content =
    '```text\n## Plan-vs-implementation review\n\n**Reviewer:** fake\n**Outcome:** Go\n```\n\n## Plan-vs-implementation review\n';
  const body = extractHeadingSectionBody(content, H);
  assert.doesNotMatch(body, /Reviewer/);
  assert.equal(body.trim(), '');
});

test('extractHeadingSectionBody: END is fence-aware — a fenced ## inside the body does not truncate', () => {
  // Copilot review finding: a `## X` that appears ONLY inside a fenced code block
  // within the section body must NOT be treated as the section boundary.
  const content =
    '## Plan-vs-implementation review\n\nbefore\n\n```md\n## Not a real boundary\n```\n\n**Outcome:** Go\n\n## Next\ntail\n';
  const body = extractHeadingSectionBody(content, H);
  assert.match(body, /before/);
  assert.match(body, /## Not a real boundary/); // the fenced heading stays in the body
  assert.match(body, /\*\*Outcome:\*\* Go/);     // content AFTER the fenced heading is retained
  assert.doesNotMatch(body, /tail/);             // the REAL next heading still bounds the body
});

test('extractHeadingSectionBody: runs to EOF when there is no following heading', () => {
  const body = extractHeadingSectionBody('## Deliverables\n\n1. a\n2. b\n', 'Deliverables');
  assert.match(body, /1\. a/);
  assert.match(body, /2\. b/);
});

test('extractHeadingSectionBody: returns empty string when the heading is absent', () => {
  assert.equal(extractHeadingSectionBody('# Title\n\nno section\n', H), '');
});
