// Minimal tests for the lib/templating.mjs stub.
// The original cs03-templating sub-agent shipped a richer API (strict mode,
// escape syntax, TemplatingError class) but its work was lost in a parallel
// sub-agent file race with cs03-sync (see LRN-016 at CS03 close-out).
// These tests cover the actual stub API; richer-API tests deferred to a
// planned CS that will upgrade lib/templating.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTemplating } from '../lib/templating.mjs';

test('substitutes {{key}} from variables map', () => {
  assert.equal(applyTemplating('Hello {{name}}', { name: 'world' }), 'Hello world');
});

test('leaves unknown placeholders unchanged (lenient default)', () => {
  assert.equal(applyTemplating('Hello {{unknown}}', {}), 'Hello {{unknown}}');
});

test('handles empty input', () => {
  assert.equal(applyTemplating('', { name: 'x' }), '');
});

test('handles repeated placeholders', () => {
  assert.equal(applyTemplating('{{x}} and {{x}}', { x: 'y' }), 'y and y');
});

test('handles multiple distinct placeholders', () => {
  assert.equal(applyTemplating('{{a}} and {{b}}', { a: 'foo', b: 'bar' }), 'foo and bar');
});

test('skips non-string values in the variable map', () => {
  assert.equal(applyTemplating('a={{a}} b={{b}}', { a: 'x', b: 42 }), 'a=x b={{b}}');
});

test('returns content unchanged when variables is null/undefined', () => {
  assert.equal(applyTemplating('Hello {{name}}', null), 'Hello {{name}}');
  assert.equal(applyTemplating('Hello {{name}}', undefined), 'Hello {{name}}');
});

test('substitutes inside fenced code blocks (templating is code-block-agnostic per ADR 0001 differentiation from composed parser)', () => {
  const input = '```\n{{name}}\n```';
  assert.equal(applyTemplating(input, { name: 'x' }), '```\nx\n```');
});
