/**
 * lib/doc-schema.mjs — Shared document-parsing library for harness linters.
 *
 * Provides structural analysis helpers used by check-learnings.mjs and all
 * future CS06+ linters. Zero runtime dependencies beyond Node built-ins and
 * the already-installed js-yaml.
 *
 * @module lib/doc-schema.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a markdown text string: strip UTF-8 BOM (LRN-018) and convert
 * CRLF / bare CR to LF (LRN-006).
 *
 * @param {string} text - Raw file content.
 * @returns {string} Normalized text with LF line endings and no BOM.
 */
function normalize(text) {
  return text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Custom error class for doc-schema violations.
 *
 * @extends {Error}
 */
export class DocSchemaError extends Error {
  /**
   * @param {string} message - Human-readable description.
   * @param {string} code    - Machine-readable error code (e.g. 'PARSE_ERROR').
   */
  constructor(message, code) {
    super(message);
    this.name = 'DocSchemaError';
    this.code = code;
  }
}

/**
 * Parse all YAML frontmatter code-fence blocks from a markdown document.
 *
 * Only fences whose parsed content contains an `id` field are returned.
 * Fences whose YAML is malformed but contain an `id: LRN-` line are returned
 * with `parsed: null` and a `parseError` descriptor (B2).
 * Strips BOM and normalizes CRLF→LF before processing (per LRN-018, LRN-006).
 *
 * The fence format recognised is (trailing whitespace tolerated — B3):
 * ```yaml
 * key: value
 * ```
 *
 * @param {string} markdownText - Raw markdown file content.
 * @returns {Array<{
 *   raw: string,
 *   parsed: object|null,
 *   parseError?: { message: string, originalError: Error },
 *   lineNumber: number,
 *   endLineNumber: number,
 *   bodyAfter: string
 * }>} Array of block descriptors.  `lineNumber` / `endLineNumber` are
 *   1-indexed positions of the opening / closing fence lines.
 *   `bodyAfter` is the markdown text from after the closing fence up to
 *   (but not including) the next *entry* fence (one with an `id:` line)
 *   or EOF.  Non-entry YAML blocks inside an entry body are skipped.
 */
export function parseFrontmatterBlocks(markdownText) {
  const text = normalize(markdownText);
  const lines = text.split('\n');

  // B3: tolerate optional leading/trailing whitespace on fence markers.
  const OPEN_FENCE  = /^\s*```yaml\s*$/;
  const CLOSE_FENCE = /^\s*```\s*$/;

  // First pass: locate all ```yaml ... ``` fences (0-indexed positions).
  const fences = [];
  let i = 0;
  while (i < lines.length) {
    if (OPEN_FENCE.test(lines[i])) {
      const openIdx = i;
      const yamlLines = [];
      i++;
      while (i < lines.length && !CLOSE_FENCE.test(lines[i])) {
        yamlLines.push(lines[i]);
        i++;
      }
      // i now points at the closing ``` line (or past end if unclosed).
      const closeIdx = i;
      const raw = yamlLines.join('\n');
      // B4 (R2 tightening): classify fence as "entry" only if raw contains an
      // `id: LRN-<digits>` line. Generic `id:` keys in YAML examples (e.g. `id: example`)
      // must NOT count as entry fences, otherwise bodyAfter will be truncated.
      const isEntry = /^\s*id\s*:\s*LRN-\d+/m.test(raw);
      fences.push({ openIdx, closeIdx, raw, isEntry });
    }
    i++;
  }

  // B4: build an ordered list of entry fences for bodyAfter computation.
  // Non-entry YAML fences (e.g. examples inside an entry's body) are skipped
  // so that bodyAfter spans the full body text up to the next real entry.
  const entryFences = fences.filter((f) => f.isEntry);

  // Second pass: parse YAML and build result entries.
  const result = [];
  for (let j = 0; j < entryFences.length; j++) {
    const { openIdx, closeIdx, raw } = entryFences[j];

    // B4: bodyAfter ends at the next entry fence, not the next fence overall.
    const bodyStart = closeIdx + 1;
    const nextEntry = entryFences[j + 1];
    const bodyEnd = nextEntry ? nextEntry.openIdx - 1 : lines.length - 1;
    const bodyAfter =
      bodyStart <= bodyEnd
        ? lines.slice(bodyStart, bodyEnd + 1).join('\n')
        : '';

    let parsed;
    let parseError = null;
    try {
      parsed = yaml.load(raw, { schema: yaml.JSON_SCHEMA });
    } catch (err) {
      // B2: only treat as malformed entry when an `id: LRN-` line is present.
      if (/^\s*id\s*:\s*LRN-/m.test(raw)) {
        parseError = { message: err.message, originalError: err };
        parsed = null;
      } else {
        continue; // unparseable non-LRN fence — silently skip
      }
    }

    // For successfully-parsed fences: require an `id` field.
    if (!parseError && (!parsed || typeof parsed !== 'object' || !parsed.id)) {
      continue;
    }

    result.push({
      raw,
      parsed,
      ...(parseError !== null && { parseError }),
      lineNumber: openIdx + 1,     // 1-indexed
      endLineNumber: closeIdx + 1, // 1-indexed
      bodyAfter,
    });
  }

  return result;
}

/**
 * Assert that a set of required section headings are present in a markdown
 * document.  Uses a simple line-by-line regex (`^#{1,6} `) rather than a
 * full AST parser.
 *
 * @param {string}   markdownText      - Raw markdown file content.
 * @param {string[]} requiredHeadings  - Plain heading texts to require
 *   (e.g. `['Open', 'Applied']`).  All heading levels are checked.
 * @returns {Array<{ heading: string, severity: 'error' }>} Array of findings
 *   for each missing heading.
 */
export function assertHeadings(markdownText, requiredHeadings) {
  const text = normalize(markdownText);
  const lines = text.split('\n');
  const findings = [];

  const found = new Set();
  for (const line of lines) {
    const m = line.match(/^#{1,6}\s+(.+)$/);
    if (m) found.add(m[1].trim());
  }

  for (const h of requiredHeadings) {
    if (!found.has(h)) {
      findings.push({ heading: h, severity: 'error' });
    }
  }

  return findings;
}

/**
 * Assert that a markdown table immediately following a named heading contains
 * the required column headers.
 *
 * @param {string}   markdownText    - Raw markdown file content.
 * @param {string}   headingAnchor   - Plain text of the heading to locate
 *   (e.g. `'Tasks'`).
 * @param {string[]} requiredColumns - Column header strings that must be
 *   present in the table's first row.
 * @returns {Array<{ column: string|null, severity: 'error', message: string }>}
 *   Array of findings.  An empty array means all required columns were found.
 */
export function assertTableShape(markdownText, headingAnchor, requiredColumns) {
  const text = normalize(markdownText);
  const lines = text.split('\n');
  const findings = [];

  // Locate the target heading.
  let headingIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^#{1,6}\s+(.+)$/);
    if (m && m[1].trim() === headingAnchor) {
      headingIdx = i;
      break;
    }
  }

  if (headingIdx === -1) {
    findings.push({
      column: null,
      severity: 'error',
      message: `Heading "${headingAnchor}" not found`,
    });
    return findings;
  }

  // Find the table immediately after the heading (skip blank lines).
  let tableHeaderIdx = -1;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue;
    if (line.startsWith('|')) {
      tableHeaderIdx = i;
      break;
    }
    // Hit another heading before a table — no table under this heading.
    if (/^#{1,6}\s/.test(lines[i])) break;
  }

  if (tableHeaderIdx === -1) {
    findings.push({
      column: null,
      severity: 'error',
      message: `No table found under heading "${headingAnchor}"`,
    });
    return findings;
  }

  // Parse column headers from the first table row.
  const cols = lines[tableHeaderIdx]
    .split('|')
    .map((c) => c.trim())
    .filter((c) => c !== '');

  for (const required of requiredColumns) {
    if (!cols.includes(required)) {
      findings.push({
        column: required,
        severity: 'error',
        message: `Missing column "${required}" in table under "${headingAnchor}"`,
      });
    }
  }

  return findings;
}

/**
 * Resolve relative markdown links in a document and report which ones point
 * to missing files.
 *
 * Only relative `[text](path)` links are checked.  External URLs
 * (`http://`, `https://`) and pure anchor links (`#anchor`) are ignored.
 *
 * @param {string} markdownText - Raw markdown file content.
 * @param {string} baseDir      - Absolute path of the directory that relative
 *   link paths should be resolved against (typically the directory containing
 *   the markdown file).
 * @returns {Array<{
 *   href: string,
 *   lineNumber: number,
 *   status: 'broken'
 * }>} One entry per broken relative link found.  Links that resolve
 *   successfully are excluded from the returned array (NB-6).
 */
export function resolveLinks(markdownText, baseDir) {
  const text = normalize(markdownText);
  const lines = text.split('\n');
  const findings = [];

  const linkRegex = /\[(?:[^\]]*)\]\(([^)]+)\)/g;

  for (let i = 0; i < lines.length; i++) {
    linkRegex.lastIndex = 0;
    let m;
    while ((m = linkRegex.exec(lines[i])) !== null) {
      const href = m[1];

      // Skip external URLs and pure anchor links.
      if (
        href.startsWith('http://') ||
        href.startsWith('https://') ||
        href.startsWith('#')
      ) {
        continue;
      }

      // Strip fragment and query string to get the file path portion.
      const filePart = href.split('#')[0].split('?')[0];
      if (!filePart) continue; // pure fragment reference

      const resolved = path.resolve(baseDir, filePart);
      const exists = fs.existsSync(resolved);

      findings.push({
        href,
        lineNumber: i + 1,
        status: exists ? 'ok' : 'broken',
      });
    }
  }

  // NB-6: return only broken links per spec.
  return findings.filter((f) => f.status === 'broken');
}
