/**
 * Template variable substitution engine for harness sync.
 *
 * Applies `{{key}}` → value substitutions to template content per the
 * consumer's `harness.config.json` → `templating` map.
 *
 * **Single-pass guarantee**: once a placeholder is resolved, the substituted
 * value is NOT re-scanned for further placeholders. A value containing `{{x}}`
 * will appear verbatim in the output.
 *
 * **Code-block-agnostic**: substitution applies inside fenced code blocks
 * (` ``` `). Consumer code samples may legitimately contain `{{x}}`
 * placeholders. This differentiates templating from the composed parser (ADR
 * 0001), which is code-block-aware.
 *
 * **Escape syntax**: prefix any placeholder with a backslash (`\{{name}}`) to
 * preserve it literally as `{{name}}` in the output. The leading `\` is
 * consumed. Standalone `\` characters elsewhere in the content are untouched.
 *
 * Source: project/clickstops/active/active_cs03b_upgrade-templating-lock-stubs.md
 * TODO(none): no remaining stubs.
 *
 * @module lib/templating.mjs
 */

// ---------------------------------------------------------------------------
// Public error class
// ---------------------------------------------------------------------------

/**
 * Thrown when a templating operation fails due to configuration or variable
 * issues.
 *
 * @property {string} code - Machine-readable error code.
 *   `ETPL_UNKNOWN_VAR`: one or more `{{key}}` placeholders remain unresolved
 *     in strict mode (key absent from variables or value is non-string).
 *   `ETPL_BAD_PATTERN`: `opts.placeholderPattern` is not a RegExp or lacks
 *     the `g` flag.
 * @property {object} context - Structured detail about the error.
 *   For `ETPL_UNKNOWN_VAR`: `{ unknownVars: string[] }` — sorted, unique
 *     list of unresolved placeholder key names.
 *
 * @example
 * import { applyTemplating, TemplatingError } from './lib/templating.mjs';
 * try {
 *   applyTemplating('Hello {{name}}', {}, { strict: true });
 * } catch (e) {
 *   if (e instanceof TemplatingError && e.code === 'ETPL_UNKNOWN_VAR') {
 *     console.error('Missing vars:', e.context.unknownVars);
 *   }
 * }
 */
export class TemplatingError extends Error {
  /**
   * @param {string} message
   * @param {string} code
   * @param {object} [context={}]
   */
  constructor(message, code, context = {}) {
    super(message);
    this.name = 'TemplatingError';
    this.code = code;
    this.context = context;
  }
}

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

/**
 * Default placeholder pattern. Matches `{{key}}` with optional surrounding
 * whitespace inside the braces. Capture group 1 is the trimmed key name.
 *
 * @type {RegExp}
 */
const DEFAULT_PATTERN = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

/**
 * Sentinel used to temporarily mark escaped placeholders during processing.
 * Null-byte-guarded to avoid collisions with normal template content.
 */
const _ESC_OPEN = '\x00EPH\x00';
const _ESC_CLOSE = '\x00HPE\x00';

/** Restores sentinel-encoded escaped placeholders. @type {RegExp} */
const _ESC_RESTORE_RE = /\x00EPH\x00(\d+)\x00HPE\x00/g;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply `{{key}}` substitutions from a variable map to template content.
 *
 * **Whitespace tolerance**: `{{ name }}`, `{{name}}`, and `{{  name  }}` all
 * resolve to the same key `name` under the default pattern.
 *
 * **Escape syntax**: `\{{name}}` → `{{name}}` (backslash consumed). Only
 * affects the `{{...}}` placeholder form; other backslashes are untouched.
 *
 * **Single-pass guarantee**: substituted values are NOT re-scanned. A value
 * of `{{x}}` in the output is left as-is.
 *
 * **Code-block-agnostic**: templating applies inside fenced code blocks
 * (differs from the composed parser per ADR 0001).
 *
 * @param {string} content - Template content with `{{key}}` placeholders.
 * @param {Record<string, string>} [variables] - Key→value substitution map
 *   (config.templating). Null/undefined treated as empty map. Non-string
 *   values are skipped (placeholder left unchanged).
 * @param {object} [opts={}] - Options.
 * @param {boolean} [opts.strict=false] - If `true`, throw `TemplatingError`
 *   with code `ETPL_UNKNOWN_VAR` when any placeholder remains unresolved
 *   after substitution (key absent or value non-string).
 * @param {RegExp} [opts.placeholderPattern] - Override the default
 *   `/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g` pattern. Must be a `RegExp`
 *   with the `g` flag; otherwise throws `TemplatingError` code
 *   `ETPL_BAD_PATTERN`. Capture group 1 must be the key name.
 * @returns {string} Content with all recognised substitutions applied.
 * @throws {TemplatingError} `ETPL_BAD_PATTERN` — invalid `placeholderPattern`.
 * @throws {TemplatingError} `ETPL_UNKNOWN_VAR` — unresolved placeholders in
 *   strict mode.
 *
 * @example
 * // Basic substitution — backward-compatible 2-arg call
 * applyTemplating('Hello {{name}}', { name: 'world' }); // 'Hello world'
 *
 * @example
 * // Whitespace tolerance
 * applyTemplating('Hello {{ name }}', { name: 'world' }); // 'Hello world'
 *
 * @example
 * // Escape syntax
 * applyTemplating('\\{{name}}', { name: 'world' }); // '{{name}}'
 *
 * @example
 * // Strict mode
 * applyTemplating('Hello {{name}}', {}, { strict: true }); // throws TemplatingError
 */
export function applyTemplating(content, variables, opts = {}) {
  if (opts === null || typeof opts !== 'object') opts = {};

  const vars = (variables && typeof variables === 'object') ? variables : {};
  const strict = opts.strict === true;

  // ── Validate custom placeholder pattern ──────────────────────────────────
  let pattern = DEFAULT_PATTERN;
  if (opts.placeholderPattern !== undefined) {
    if (!(opts.placeholderPattern instanceof RegExp)) {
      throw new TemplatingError(
        'opts.placeholderPattern must be a RegExp with the g flag',
        'ETPL_BAD_PATTERN'
      );
    }
    if (!opts.placeholderPattern.flags.includes('g')) {
      throw new TemplatingError(
        'opts.placeholderPattern must include the g flag',
        'ETPL_BAD_PATTERN'
      );
    }
    pattern = opts.placeholderPattern;
  }

  // ── Step 1: Mark escaped placeholders with sentinels ─────────────────────
  // Matches a literal backslash immediately before `{{...}}` (any content
  // without `}` inside). The captured group is the raw `{{...}}` text.
  const escapedLiterals = [];
  let processed = content.replace(/\\(\{\{[^}]*\}\})/g, (_, literal) => {
    const idx = escapedLiterals.length;
    escapedLiterals.push(literal);
    return `${_ESC_OPEN}${idx}${_ESC_CLOSE}`;
  });

  // ── Step 2: Single-pass substitution ─────────────────────────────────────
  pattern.lastIndex = 0;
  const unknownVars = new Set();

  processed = processed.replace(pattern, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(vars, key) && typeof vars[key] === 'string') {
      return vars[key];
    }
    if (strict) unknownVars.add(key);
    return match;
  });

  // Reset lastIndex after use so the pattern can be safely reused externally.
  pattern.lastIndex = 0;

  // ── Step 3: Restore escaped placeholders ─────────────────────────────────
  if (escapedLiterals.length > 0) {
    _ESC_RESTORE_RE.lastIndex = 0;
    processed = processed.replace(_ESC_RESTORE_RE, (_, idx) => escapedLiterals[Number(idx)]);
  }

  // ── Step 4: Strict-mode check ─────────────────────────────────────────────
  if (strict && unknownVars.size > 0) {
    const sortedKeys = [...unknownVars].sort();
    const list = sortedKeys.map(k => `{{${k}}}`).join(', ');
    throw new TemplatingError(
      `Unknown templating variable(s): ${list}`,
      'ETPL_UNKNOWN_VAR',
      { unknownVars: sortedKeys }
    );
  }

  return processed;
}
