// Tests for lib/templating.mjs — rich API (CS03b upgrade).
// Covers: basic substitution, lenient default, escape syntax, whitespace
// tolerance, single-pass guarantee, strict mode, custom pattern validation,
// TemplatingError class properties, and code-block-agnostic behaviour.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTemplating, TemplatingError } from '../lib/templating.mjs';

// ── Existing baseline tests (must still pass) ────────────────────────────────

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

// ── New rich-API tests ────────────────────────────────────────────────────────

test('whitespace tolerance: {{ name }} and {{  name  }} resolve to the same key', () => {
  assert.equal(applyTemplating('{{ name }}', { name: 'world' }), 'world');
  assert.equal(applyTemplating('{{  name  }}', { name: 'world' }), 'world');
  assert.equal(applyTemplating('{{name }}', { name: 'world' }), 'world');
  assert.equal(applyTemplating('{{ name}}', { name: 'world' }), 'world');
});

test('escape syntax: \\{{name}} becomes literal {{name}} (backslash consumed)', () => {
  assert.equal(applyTemplating('\\{{name}}', { name: 'world' }), '{{name}}');
  // mixed: escaped and non-escaped in same string
  assert.equal(applyTemplating('\\{{a}} and {{a}}', { a: 'X' }), '{{a}} and X');
});

test('single-pass guarantee: substituted value containing {{y}} is not re-substituted', () => {
  const result = applyTemplating('{{x}}', { x: '{{y}}', y: 'final' });
  assert.equal(result, '{{y}}');
  assert.notEqual(result, 'final');
});

test('strict mode: throws TemplatingError with ETPL_UNKNOWN_VAR for unresolved placeholder', () => {
  assert.throws(
    () => applyTemplating('Hello {{name}} and {{age}}', {}, { strict: true }),
    (err) => {
      assert.ok(err instanceof TemplatingError);
      assert.equal(err.code, 'ETPL_UNKNOWN_VAR');
      // keys are sorted and unique
      assert.deepEqual(err.context.unknownVars, ['age', 'name']);
      assert.ok(err.message.includes('{{age}}'));
      assert.ok(err.message.includes('{{name}}'));
      return true;
    }
  );
});

test('strict mode: passes when all placeholders are resolved', () => {
  const result = applyTemplating('Hello {{name}}', { name: 'world' }, { strict: true });
  assert.equal(result, 'Hello world');
});

test('custom placeholderPattern: non-RegExp throws ETPL_BAD_PATTERN', () => {
  assert.throws(
    () => applyTemplating('content', {}, { placeholderPattern: 'not-a-regex' }),
    (err) => {
      assert.ok(err instanceof TemplatingError);
      assert.equal(err.code, 'ETPL_BAD_PATTERN');
      return true;
    }
  );
});

test('custom placeholderPattern: RegExp without g flag throws ETPL_BAD_PATTERN', () => {
  assert.throws(
    () => applyTemplating('content', {}, { placeholderPattern: /\{\{(\w+)\}\}/ }),
    (err) => {
      assert.ok(err instanceof TemplatingError);
      assert.equal(err.code, 'ETPL_BAD_PATTERN');
      return true;
    }
  );
});

test('TemplatingError: name is TemplatingError and instanceof Error', () => {
  const err = new TemplatingError('test', 'ETPL_UNKNOWN_VAR', { unknownVars: ['x'] });
  assert.equal(err.name, 'TemplatingError');
  assert.ok(err instanceof Error);
  assert.ok(err instanceof TemplatingError);
  assert.equal(err.code, 'ETPL_UNKNOWN_VAR');
  assert.deepEqual(err.context, { unknownVars: ['x'] });
});

// CS03b R1 fix: explicit unicode VALUE coverage per the planned test scenarios
// list in active_cs03b_*.md. Note: placeholder KEYS are intentionally ASCII-only
// (default pattern `[a-zA-Z_][a-zA-Z0-9_]*`) — author convention across the
// harness uses snake_case ASCII identifiers (e.g. `agent_suffix`, `repo_owner`).
// Callers needing non-ASCII keys can supply `opts.placeholderPattern` with the
// `u` flag and a Unicode property class (see next test).
test('substitutes unicode/non-ASCII values (ASCII keys per default pattern)', () => {
  // Non-ASCII value
  assert.equal(
    applyTemplating('Hello {{name}}', { name: '世界 🌍 café' }),
    'Hello 世界 🌍 café'
  );
  // Multiple unicode replacements
  assert.equal(
    applyTemplating('{{a}}-{{b}}', { a: 'αβγ', b: '🚀' }),
    'αβγ-🚀'
  );
  // Whitespace tolerance still works with unicode values
  assert.equal(applyTemplating('{{ greeting }}', { greeting: '你好' }), '你好');
  // Strict mode reports an unknown ASCII key cleanly even when other values
  // contain unicode (proves substitution + error reporting interop).
  assert.throws(
    () => applyTemplating('{{x}} {{missing}}', { x: 'café' }, { strict: true }),
    (err) => err.code === 'ETPL_UNKNOWN_VAR' && err.context.unknownVars.includes('missing')
  );
});

test('custom placeholderPattern can support non-ASCII keys via Unicode property classes', () => {
  // Demonstrate that callers needing unicode KEYS can supply a custom pattern.
  // Default pattern is ASCII-only by intention; this test pins the extension point.
  const unicodePattern = /\{\{\s*([\p{L}_][\p{L}\p{N}_]*)\s*\}\}/gu;
  assert.equal(
    applyTemplating('Hello {{名前}}', { '名前': '世界' }, { placeholderPattern: unicodePattern }),
    'Hello 世界'
  );
});

test('custom placeholderPattern with no capture group throws ETPL_BAD_PATTERN (CS03b R1 fix)', () => {
  // Per R1 review: a regex without a first capture group produces undefined key.
  // The runtime guard inside the replace callback must surface this as a clear
  // ETPL_BAD_PATTERN error, not a misleading "{{undefined}}" report.
  const noCaptureGroup = /\{\{\s*[a-z]+\s*\}\}/g;
  assert.throws(
    () => applyTemplating('Hello {{name}}', { name: 'world' }, { placeholderPattern: noCaptureGroup }),
    (err) => err.code === 'ETPL_BAD_PATTERN'
  );
});
