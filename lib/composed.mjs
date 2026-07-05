/**
 * lib/composed.mjs — Composed-class merge engine.
 *
 * Normative rules:  ADR 0001 § Composed marker syntax and parser rules
 *   docs/adr/0001-file-classes.md
 * Specification: CS03 active clickstop
 *   project/clickstops/active/active_cs03_sync-engine-library.md
 *
 * LRN-009 disposition (CS02b, v0.2.0): opts.allowedBlockIds (populated by the
 * sync engine from composed.overrides[file].local_blocks — the single source
 * of truth) is the authoritative input at the engine layer. The previously-
 * accepted top-level local_blocks form was removed in v0.2.0; the schema now
 * rejects any config that still carries it.
 *
 * legacy_composed_mapping.json format (proposed — escalate to orchestrator for
 * schema placement decision):
 *   { "regions": [ { "action": "map_to_block"|"discard", "block_id"?: string,
 *                    "content": string } ] }
 * "content" is the exact extra string (the non-template non-block text in the
 * current file that isn't in the template skeleton).
 */

import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

export class ComposedParseError extends Error {
  /**
   * @param {string} message
   * @param {string} code  One of ECOMPOSED_UNCLOSED | ECOMPOSED_DUPID | ECOMPOSED_DROPPED |
   *                       ECOMPOSED_NESTED | ECOMPOSED_BADID | ECOMPOSED_ORPHANEND |
   *                       ECOMPOSED_INCODEBLOCK | ECOMPOSED_MIDLINE
   */
  constructor(message, code) {
    super(message);
    this.name = 'ComposedParseError';
    this.code = code;
  }
}

export class ComposedMergeError extends Error {
  /**
   * @param {string} message
   * @param {string} code  One of EMERGE_LEGACY_UNMAPPED | EMERGE_LEGACY_BAD_MAPPING |
   *                       ECOMPOSED_UNALLOWED_TEMPLATE_BLOCK | ECOMPOSED_UNALLOWED_CURRENT_BLOCK
   */
  constructor(message, code) {
    super(message);
    this.name = 'ComposedMergeError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * SHA-256 of a UTF-8 string, returned as lowercase hex (64 chars).
 * @param {string} str
 * @returns {string}
 */
function sha256(str) {
  return createHash('sha256').update(str, 'utf8').digest('hex');
}

/** @param {string} content @returns {string} */
function normalizeLF(content) {
  // Strip UTF-8 BOM (U+FEFF) if present (defensive — tools like Windows Notepad add it)
  const stripped = content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content;
  return stripped.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// Exact (whole-line stripped) marker pattern
const MARKER_EXACT_RE = /^<!--\s+harness:local-(start|end)\s+id=([^\s>]+)\s+-->$/;
// Substring for unescaped marker
const MARKER_CONTAINS = '<!-- harness:local-';
// Escape prefixes (zero-width-space U+200B after <, and HTML entity &lt;)
const ESCAPE_ZWSP_PREFIX = '<\u200b!--';
const ESCAPE_ENTITY_PREFIX = '&lt;!--';

// Comment-safe `#`-marker form (CS89). For files where an HTML comment is an
// invalid line (e.g. CODEOWNERS / gitignore-style files, which treat only
// `#`-prefixed lines as comments). Additive: the HTML form above is unchanged.
// The `#`-form has NO escape variant — the HTML escapes (ZWSP / &lt;) apply to
// the HTML form only. A single space follows `#` (matching MARKER_HASH_CONTAINS);
// a tab or multiple spaces after `#` is not a marker. Keep these two constants
// byte-identical to the mirror in scripts/check-composed-blocks.mjs so the two
// hand-synced parsers never drift.
const MARKER_HASH_RE = /^# harness:local-(start|end)[ \t]+id=([^\s]+)[ \t]*$/;
const MARKER_HASH_CONTAINS = '# harness:local-';

// Block ID validation
const ID_RE = /^[a-z][a-z0-9.-]*$/;

/**
 * Check a line for harness marker content (escaped or unescaped).
 *
 * Recognizes two whole-line marker forms (CS89):
 *   - HTML-comment form `<!-- harness:local-start id=<id> -->` (escapable with a
 *     zero-width space after `<`, or the `&lt;` entity) — for Markdown/HTML.
 *   - `#`-comment form `# harness:local-start id=<id>` — for files where an HTML
 *     comment is an invalid line (CODEOWNERS / gitignore-style). NO escape form.
 *
 * The HTML form is tried first, then the `#`-form; both yield the same
 * whole-line result shape. A `#`-marker that is not whole-line (embedded in a
 * line of prose) is reported as `mid-line`, matching HTML behavior.
 *
 * @param {string} rawLine
 * @returns {null
 *   | { escaped: true }
 *   | { escaped: false, position: 'whole-line', type: 'start'|'end', id: string }
 *   | { escaped: false, position: 'mid-line' }}
 */
function checkMarkerLine(rawLine) {
  // Remove escaped HTML forms to detect remaining unescaped HTML markers.
  // Escapes apply to the HTML form only; the #-comment form has no escape.
  let check = rawLine;
  const hasZwsp = rawLine.includes(ESCAPE_ZWSP_PREFIX);
  const hasEntity = rawLine.includes(ESCAPE_ENTITY_PREFIX);
  if (hasZwsp) check = check.replace(/<\u200b!--/g, '');
  if (hasEntity) check = check.replace(/&lt;!--/g, '');

  const hasUnescapedHtml = check.includes(MARKER_CONTAINS);
  const hasHash = rawLine.includes(MARKER_HASH_CONTAINS);

  // No marker-like content at all
  if (!hasUnescapedHtml && !hasHash && !hasZwsp && !hasEntity) return null;

  // Only escaped HTML forms; no unescaped marker of either form
  if (!hasUnescapedHtml && !hasHash) return { escaped: true };

  // Unescaped marker present — check position (HTML form first, then #-form)
  const stripped = rawLine.replace(/^[ \t]+|[ \t]+$/g, '');
  const mHtml = MARKER_EXACT_RE.exec(stripped);
  if (mHtml) {
    return { escaped: false, position: 'whole-line', type: mHtml[1], id: mHtml[2] };
  }
  const mHash = MARKER_HASH_RE.exec(stripped);
  if (mHash) {
    return { escaped: false, position: 'whole-line', type: mHash[1], id: mHash[2] };
  }
  return { escaped: false, position: 'mid-line' };
}

/**
 * Check whether a line opens or closes a Markdown code fence.
 * Fences: line begins (after ≤3 spaces of indent) with 3+ backticks or 3+ tildes.
 *
 * @param {string} rawLine
 * @param {boolean} inFence
 * @param {string|null} fenceChar
 * @param {number} fenceLen
 * @returns {{ opens: true, char: string, len: number }
 *          | { closes: true }
 *          | null}
 */
function checkFence(rawLine, inFence, fenceChar, fenceLen) {
  const m = /^( {0,3})(`{3,}|~{3,})/.exec(rawLine);
  if (!m) return null;
  const seq = m[2];
  const char = seq[0];
  const len = seq.length;
  if (!inFence) return { opens: true, char, len };
  if (char === fenceChar && len >= fenceLen) return { closes: true };
  return null;
}

// ---------------------------------------------------------------------------
// Public types (JSDoc)
// ---------------------------------------------------------------------------

/**
 * @typedef {{ type: 'template', lines: string[], startLine: number }} TemplateSection
 * @typedef {{ type: 'block', id: string, startLine: number, endLine: number,
 *             startMarker: string, endMarker: string, body: string[] }} BlockSection
 * @typedef {{ sections: (TemplateSection|BlockSection)[], blocks: Map<string,BlockSection> }} ParsedComposed
 * @typedef {{ id: string, provenance: 'user-authored'|'seeded-empty'|'migrated-from-legacy' }} BlockRecord
 * @typedef {{ content: string, blocks: BlockRecord[], warnings: string[] }} MergeResult
 */

// ---------------------------------------------------------------------------
// parseComposed
// ---------------------------------------------------------------------------

/**
 * Parse a composed file into its template sections + named local blocks.
 *
 * @param {string} content - Raw file content.
 * @param {object} [opts]
 * @param {string} [opts.filename] - For error messages only.
 * @returns {ParsedComposed}
 * @throws {ComposedParseError} On any error per ADR 0001 § Error rules table (8 error kinds).
 */
export function parseComposed(content, opts = {}) {
  const filename = opts.filename ?? '<input>';
  const lines = normalizeLF(content).split('\n');

  let inFence = false;
  let fenceChar = null;
  let fenceLen = 0;

  let currentBlock = null; // { id, startLine, startMarker, bodyLines[] }
  const sections = [];
  const blocks = new Map();
  const seenIds = new Set();

  let templateLines = [];
  let templateStartLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const rawLine = lines[i];

    // ---- Code fence tracking ----
    const fenceResult = checkFence(rawLine, inFence, fenceChar, fenceLen);
    if (!inFence && fenceResult?.opens) {
      inFence = true;
      fenceChar = fenceResult.char;
      fenceLen = fenceResult.len;
      (currentBlock ? currentBlock.bodyLines : templateLines).push(rawLine);
      continue;
    }
    if (inFence) {
      if (fenceResult?.closes) {
        inFence = false;
        fenceChar = null;
        fenceLen = 0;
      }
      // Fail if unescaped marker-like text appears inside the fence
      const mc = checkMarkerLine(rawLine);
      if (mc !== null && !mc.escaped) {
        throw new ComposedParseError(
          `${filename}:${lineNo}: unescaped harness marker inside fenced code block ` +
          `(use \u200b after < or &lt; entity to escape)`,
          'ECOMPOSED_INCODEBLOCK'
        );
      }
      (currentBlock ? currentBlock.bodyLines : templateLines).push(rawLine);
      continue;
    }

    // ---- Indented code block (4+ leading spaces) ----
    if (/^ {4}/.test(rawLine)) {
      const mc = checkMarkerLine(rawLine);
      if (mc !== null && !mc.escaped) {
        throw new ComposedParseError(
          `${filename}:${lineNo}: unescaped harness marker inside indented code block ` +
          `(use \u200b after < or &lt; entity to escape)`,
          'ECOMPOSED_INCODEBLOCK'
        );
      }
      (currentBlock ? currentBlock.bodyLines : templateLines).push(rawLine);
      continue;
    }

    // ---- Regular line: marker detection ----
    const mc = checkMarkerLine(rawLine);

    if (mc === null || mc.escaped) {
      // Regular text or escaped marker — accumulate
      (currentBlock ? currentBlock.bodyLines : templateLines).push(rawLine);
      continue;
    }

    // Unescaped marker present
    if (mc.position === 'mid-line') {
      throw new ComposedParseError(
        `${filename}:${lineNo}: harness marker embedded in prose (not a whole-line marker)`,
        'ECOMPOSED_MIDLINE'
      );
    }

    // Whole-line marker — validate ID before structural check
    const { type, id } = mc;
    if (!ID_RE.test(id)) {
      throw new ComposedParseError(
        `${filename}:${lineNo}: invalid block id "${id}" (must match ^[a-z][a-z0-9.-]*$)`,
        'ECOMPOSED_BADID'
      );
    }

    if (type === 'start') {
      if (currentBlock !== null) {
        throw new ComposedParseError(
          `${filename}:${lineNo}: nested local block — id="${id}" opened inside id="${currentBlock.id}"`,
          'ECOMPOSED_NESTED'
        );
      }
      if (seenIds.has(id)) {
        throw new ComposedParseError(
          `${filename}:${lineNo}: duplicate local block id="${id}"`,
          'ECOMPOSED_DUPID'
        );
      }
      // Close current template section
      sections.push({ type: 'template', lines: templateLines, startLine: templateStartLine });
      templateLines = [];
      currentBlock = { id, startLine: lineNo, startMarker: rawLine, bodyLines: [] };
      seenIds.add(id);
    } else {
      // type === 'end'
      if (currentBlock === null || currentBlock.id !== id) {
        throw new ComposedParseError(
          `${filename}:${lineNo}: orphan end marker — id="${id}" has no matching start`,
          'ECOMPOSED_ORPHANEND'
        );
      }
      const block = {
        type: 'block',
        id: currentBlock.id,
        startLine: currentBlock.startLine,
        endLine: lineNo,
        startMarker: currentBlock.startMarker,
        endMarker: rawLine,
        body: currentBlock.bodyLines,
      };
      sections.push(block);
      blocks.set(block.id, block);
      currentBlock = null;
      templateStartLine = lineNo + 1;
    }
  }

  // Flush trailing template lines
  sections.push({ type: 'template', lines: templateLines, startLine: templateStartLine });

  if (currentBlock !== null) {
    throw new ComposedParseError(
      `${filename}: unclosed local block id="${currentBlock.id}" (no matching end marker)`,
      'ECOMPOSED_UNCLOSED'
    );
  }

  return { sections, blocks };
}

// ---------------------------------------------------------------------------
// serializeComposed
// ---------------------------------------------------------------------------

/**
 * Serialize a ParsedComposed back to the original string (round-trip idempotent).
 * Used for testing and for constructing composed output.
 *
 * @param {ParsedComposed} parsed
 * @returns {string}
 */
export function serializeComposed({ sections }) {
  const allLines = [];
  for (const section of sections) {
    if (section.type === 'template') {
      allLines.push(...section.lines);
    } else {
      allLines.push(section.startMarker);
      allLines.push(...section.body);
      allLines.push(section.endMarker);
    }
  }
  return allLines.join('\n');
}

// ---------------------------------------------------------------------------
// mergeComposed
// ---------------------------------------------------------------------------

/**
 * Extract non-block lines for skeleton comparison (legacy detection).
 * @param {ParsedComposed} parsed
 * @returns {string}
 */
function extractSkeleton(parsed) {
  return parsed.sections
    .filter(s => s.type === 'template')
    .flatMap(s => s.lines)
    .join('\n');
}

/**
 * Compute the SHA-256 hash of a template's "prose skeleton" — the rendered
 * template content with all local-block bodies stripped out. This hash is
 * recorded in the lock file's `fileEntry.template_prose_hash` so that the
 * next `harness sync` can distinguish "template prose evolved" from
 * "consumer edited prose" without requiring a `legacy_composed_mapping.json`.
 *
 * Per CS03d / LRN-020. Implementation reuses the existing private
 * `extractSkeleton` helper so the hash input is byte-for-byte identical to
 * the string that `mergeComposed()` already compares.
 *
 * @param {string} template - Rendered template content (post-templating).
 * @returns {string} Lowercase hex SHA-256 of `extractSkeleton(parseComposed(normalizeLF(template)))`.
 */
export function computeTemplateProseHash(template) {
  return sha256(extractSkeleton(parseComposed(normalizeLF(template))));
}

/**
 * Extract contiguous "legacy regions" — segments in the current skeleton that
 * are not present in the template skeleton. Uses greedy subsequence matching:
 * walks current lines, consuming matching template lines in order; any current
 * lines that don't match the next expected template line are accumulated into
 * a legacy region.
 *
 * Leading and trailing empty lines are stripped from each region (they are
 * structural artifacts of the section-junction line pairs produced when two
 * adjacent template sections both end/begin with a blank line). Interior blank
 * lines are preserved. Regions that are empty after stripping are discarded.
 *
 * @param {string} templateSkeleton - LF-normalised template skeleton text.
 * @param {string} currentSkeleton  - LF-normalised current-file skeleton text.
 * @returns {string[]} Each element is a non-empty string representing one
 *   contiguous run of legacy content (stripped of boundary blank lines).
 */
function extractLegacyRegions(templateSkeleton, currentSkeleton) {
  const tLines = templateSkeleton.split('\n');
  const cLines = currentSkeleton.split('\n');
  const regions = [];
  let tIdx = 0;
  let legacyLines = [];

  const flushRegion = () => {
    // Strip leading and trailing empty lines (section-boundary artifacts).
    let start = 0;
    let end = legacyLines.length - 1;
    while (start <= end && legacyLines[start].trim() === '') start++;
    while (end >= start && legacyLines[end].trim() === '') end--;
    if (start <= end) {
      regions.push(legacyLines.slice(start, end + 1).join('\n'));
    }
    legacyLines = [];
  };

  for (const cLine of cLines) {
    if (tIdx < tLines.length && cLine === tLines[tIdx]) {
      if (legacyLines.length > 0) flushRegion();
      tIdx++;
    } else {
      legacyLines.push(cLine);
    }
  }
  if (legacyLines.length > 0) flushRegion();
  return regions;
}

/**
 * Validate that a legacyMapping provides bijective coverage of all actual
 * legacy regions detected in the current file. Throws on the first violation.
 *
 * Checks (in priority order):
 * 0. Action enum validation — only 'map_to_block' and 'discard' are allowed.
 *    For 'map_to_block': block_id is required and must match [a-z][a-z0-9.-]*.
 *    For 'discard': block_id must NOT be present.
 *    Missing action → `EMERGE_LEGACY_BAD_MAPPING`.
 * 1. Mapping content that closely but not exactly matches a region (whitespace
 *    difference) → `EMERGE_LEGACY_BAD_MAPPING`
 * 2. Multiset accounting — mapping occurrences vs actual occurrences:
 *    - Any content where mapping count > actual count → `EMERGE_LEGACY_BAD_MAPPING`
 *    - Any actual content where mapping count < actual count → `EMERGE_LEGACY_UNMAPPED`
 *    - Any mapping content not present in actual at all → `EMERGE_LEGACY_BAD_MAPPING`
 * 3. No two `map_to_block` entries may target the same `block_id` →
 *    `EMERGE_LEGACY_BAD_MAPPING`
 * 4. `map_to_block` target block ID absent from template or allowedBlockIds →
 *    `EMERGE_LEGACY_BAD_MAPPING`
 *
 * @param {ParsedComposed}  templateParsed
 * @param {string}          templateSkeleton  - LF-normalised.
 * @param {string}          currentSkeleton   - LF-normalised.
 * @param {{ regions: Array<{action:string, block_id?:string, content:string}> }} legacyMapping
 * @param {string[]}        allowedBlockIds
 * @throws {ComposedMergeError}
 */
function validateLegacyMapping(
  templateParsed, templateSkeleton, currentSkeleton, legacyMapping, allowedBlockIds
) {
  const actualRegions = extractLegacyRegions(templateSkeleton, currentSkeleton);
  const entries = legacyMapping.regions;

  // Step 0: validate action enum on every entry (structural validation first).
  const VALID_ACTIONS = new Set(['map_to_block', 'discard']);
  for (const r of entries) {
    if (!Object.prototype.hasOwnProperty.call(r, 'action') || r.action == null) {
      throw new ComposedMergeError(
        `Legacy mapping entry is missing required "action" field`,
        'EMERGE_LEGACY_BAD_MAPPING'
      );
    }
    if (!VALID_ACTIONS.has(r.action)) {
      throw new ComposedMergeError(
        `Legacy mapping entry has invalid action "${r.action}". ` +
        `Allowed values: "map_to_block", "discard"`,
        'EMERGE_LEGACY_BAD_MAPPING'
      );
    }
    if (r.action === 'map_to_block') {
      if (!r.block_id || typeof r.block_id !== 'string') {
        throw new ComposedMergeError(
          `Legacy mapping entry with action "map_to_block" is missing required "block_id" field`,
          'EMERGE_LEGACY_BAD_MAPPING'
        );
      }
      if (!ID_RE.test(r.block_id)) {
        throw new ComposedMergeError(
          `Legacy mapping entry block_id "${r.block_id}" does not match [a-z][a-z0-9.-]*`,
          'EMERGE_LEGACY_BAD_MAPPING'
        );
      }
    }
    if (r.action === 'discard' && Object.prototype.hasOwnProperty.call(r, 'block_id')) {
      throw new ComposedMergeError(
        `Legacy mapping entry with action "discard" must not have a "block_id" field`,
        'EMERGE_LEGACY_BAD_MAPPING'
      );
    }
  }

  // Step 1: detect "close but not exact" mapping contents (whitespace mismatch).
  for (const r of entries) {
    const c = normalizeLF(r.content ?? '');
    const hasExact   = actualRegions.some(ar => ar === c);
    if (!hasExact) {
      const hasTrimmed = actualRegions.some(ar => ar.trim() === c.trim());
      if (hasTrimmed) {
        throw new ComposedMergeError(
          `Legacy mapping content does not exactly match detected region ` +
          `(whitespace difference): "${c.slice(0, 60)}"`,
          'EMERGE_LEGACY_BAD_MAPPING'
        );
      }
    }
  }

  // Step 2: multiset accounting — bijective coverage using occurrence counts.
  //
  // Build actualMultiset and mappingMultiset as Map<content, count>.
  const actualMultiset = new Map();
  for (const region of actualRegions) {
    actualMultiset.set(region, (actualMultiset.get(region) ?? 0) + 1);
  }
  const mappingMultiset = new Map();
  for (const r of entries) {
    const c = normalizeLF(r.content ?? '');
    mappingMultiset.set(c, (mappingMultiset.get(c) ?? 0) + 1);
  }

  // Check: for any actual content, mapping count must not exceed actual count
  // (over-mapped → BAD_MAPPING). Checked before UNMAPPED so that duplicate
  // mapping entries for existing content are reported as BAD_MAPPING.
  for (const [c, actualCount] of actualMultiset) {
    const mappingCount = mappingMultiset.get(c) ?? 0;
    if (mappingCount > actualCount) {
      throw new ComposedMergeError(
        `Legacy mapping has ${mappingCount} entries for content that appears ${actualCount} ` +
        `time(s) in the file: "${c.slice(0, 60)}"`,
        'EMERGE_LEGACY_BAD_MAPPING'
      );
    }
  }

  // Check: every actual occurrence must be covered (under-mapped → UNMAPPED).
  for (const [c, actualCount] of actualMultiset) {
    const mappingCount = mappingMultiset.get(c) ?? 0;
    if (mappingCount < actualCount) {
      throw new ComposedMergeError(
        `Consumer file contains legacy content outside local blocks that is not ` +
        `covered by any legacyMapping entry: "${c.slice(0, 60)}"`,
        'EMERGE_LEGACY_UNMAPPED'
      );
    }
  }

  // Check: mapping entries for content not present in actual at all (BAD_MAPPING).
  for (const [c, mappingCount] of mappingMultiset) {
    const actualCount = actualMultiset.get(c) ?? 0;
    if (actualCount === 0 && mappingCount > 0) {
      throw new ComposedMergeError(
        `Legacy mapping entry content does not correspond to any detected legacy ` +
        `region: "${c.slice(0, 60)}"`,
        'EMERGE_LEGACY_BAD_MAPPING'
      );
    }
  }

  // Step 3: duplicate map_to_block targets — each block_id may appear at most once.
  const mappedBlockIds = new Set();
  for (const r of entries) {
    if (r.action === 'map_to_block') {
      if (mappedBlockIds.has(r.block_id)) {
        throw new ComposedMergeError(
          `Multiple legacy mapping entries target the same block_id "${r.block_id}". ` +
          `Each block_id may be the target of at most one map_to_block entry.`,
          'EMERGE_LEGACY_BAD_MAPPING'
        );
      }
      mappedBlockIds.add(r.block_id);
    }
  }

  // Step 4: validate map_to_block targets exist in template and allowedBlockIds.
  for (const r of entries) {
    if (r.action === 'map_to_block') {
      if (!templateParsed.blocks.has(r.block_id)) {
        throw new ComposedMergeError(
          `Legacy mapping target block_id "${r.block_id}" does not exist in template`,
          'EMERGE_LEGACY_BAD_MAPPING'
        );
      }
      if (!allowedBlockIds.includes(r.block_id)) {
        throw new ComposedMergeError(
          `Legacy mapping target block_id "${r.block_id}" is not in allowedBlockIds`,
          'EMERGE_LEGACY_BAD_MAPPING'
        );
      }
    }
  }
}

/**
 * Merge a template (with marker placeholders) and a current consumer file
 * (with filled-in blocks). Returns the new content.
 *
 * @param {string} template - Template content from template/composed/<file>
 * @param {string} current  - Current consumer file (or empty string for fresh start)
 * @param {object} opts
 * @param {string[]} opts.allowedBlockIds - Per harness.config.json composed.overrides[file].local_blocks.
 *   Every block ID in the template and in the current file must appear in this list.
 * @param {object}  [opts.legacyMapping]  - legacy_composed_mapping.json content (optional)
 * @param {Array<{id:string}>} [opts.lockRecords] - Lock file block records for DROPPED check
 * @param {string|null}  [opts.lockTemplateProseHash] - SHA-256 hash of the template
 *   skeleton recorded in the prior lock entry's `template_prose_hash` field.
 *   Per CS03d / LRN-020:
 *     - If the consumer's current skeleton hash matches this value AND the
 *       template skeleton differs from the current skeleton, treat the
 *       divergence as "template prose evolved" — auto-adopt the new template
 *       prose without requiring `legacyMapping`. The local blocks are still
 *       preserved.
 *     - If the consumer's current skeleton hash does NOT match this value
 *       AND the skeletons differ, treat as "consumer edited prose" — fall
 *       through to the existing `EMERGE_LEGACY_UNMAPPED` fail-closed unless
 *       `legacyMapping` is provided.
 *     - If this option is null/undefined (no prior lock or pre-v0.2.0 lock
 *       without the field), bootstrap silently: compute the current template
 *       skeleton hash and use it as if it were the recorded value (so the
 *       first post-upgrade sync silently auto-adopts; subsequent syncs
 *       enforce evolution detection).
 *   Default: null.
 * @returns {MergeResult & { templateProseHash: string }} The merged content +
 *   block records + warnings, plus the new `template_prose_hash` value to
 *   write into the lock entry for this file.
 * @throws {ComposedParseError}  ECOMPOSED_DROPPED: block in lock+template but not in current
 * @throws {ComposedMergeError}  EMERGE_LEGACY_UNMAPPED: consumer has unmapped legacy content
 * @throws {ComposedMergeError}  EMERGE_LEGACY_BAD_MAPPING: mapping is malformed/incorrect
 * @throws {ComposedMergeError}  ECOMPOSED_UNALLOWED_TEMPLATE_BLOCK: template block not in allowedBlockIds
 * @throws {ComposedMergeError}  ECOMPOSED_UNALLOWED_CURRENT_BLOCK: current block not in allowedBlockIds
 */
export function mergeComposed(template, current, opts = {}) {
  const {
    allowedBlockIds = [],
    legacyMapping = null,
    lockRecords = null,
    lockTemplateProseHash = null,
  } = opts;

  const templateNorm = normalizeLF(template);
  const templateParsed = parseComposed(templateNorm, { filename: '<template>' });

  // Compute the new template_prose_hash up front; used for the lock entry
  // regardless of which merge path we take. Per CS03d / LRN-020.
  const templateSkeletonForHash = extractSkeleton(templateParsed);
  const newTemplateProseHash = sha256(templateSkeletonForHash);

  // Enforce allowedBlockIds on template blocks.
  for (const blockId of templateParsed.blocks.keys()) {
    if (!allowedBlockIds.includes(blockId)) {
      throw new ComposedMergeError(
        `Block id="${blockId}" in template is not in allowedBlockIds (file: <template>)`,
        'ECOMPOSED_UNALLOWED_TEMPLATE_BLOCK'
      );
    }
  }

  // Fresh start: empty or blank current file
  const currentNorm = normalizeLF(current ?? '');
  if (currentNorm.trim() === '') {
    const outputLines = [];
    const blockRecords = [];
    for (const section of templateParsed.sections) {
      if (section.type === 'template') {
        outputLines.push(...section.lines);
      } else {
        outputLines.push(section.startMarker);
        outputLines.push(...section.body);
        outputLines.push(section.endMarker);
        blockRecords.push({ id: section.id, provenance: 'seeded-empty' });
      }
    }
    return {
      content: outputLines.join('\n'),
      blocks: blockRecords,
      warnings: [],
      templateProseHash: newTemplateProseHash,
    };
  }

  const currentParsed = parseComposed(currentNorm, { filename: '<current>' });

  // Enforce allowedBlockIds on current-file blocks.
  for (const blockId of currentParsed.blocks.keys()) {
    if (!allowedBlockIds.includes(blockId)) {
      throw new ComposedMergeError(
        `Block id="${blockId}" in current file is not in allowedBlockIds (file: <current>)`,
        'ECOMPOSED_UNALLOWED_CURRENT_BLOCK'
      );
    }
  }

  // ECOMPOSED_DROPPED: lock has block X, template has X, current is missing X
  if (lockRecords) {
    for (const record of lockRecords) {
      if (templateParsed.blocks.has(record.id) && !currentParsed.blocks.has(record.id)) {
        throw new ComposedParseError(
          `Block id="${record.id}" is in the lock file and template but missing from consumer file`,
          'ECOMPOSED_DROPPED'
        );
      }
    }
  }

  // Legacy fail-closed: compare non-block skeletons
  const templateSkeleton = extractSkeleton(templateParsed);
  const currentSkeleton = extractSkeleton(currentParsed);

  if (templateSkeleton !== currentSkeleton) {
    // CS03d / LRN-020 — three-way state machine for skeleton divergence:
    //
    //   (a) Prior lock has a recorded template_prose_hash AND the consumer's
    //       current skeleton hashes to that value → "template prose evolved",
    //       consumer didn't touch their prose → AUTO-ADOPT new template prose;
    //       preserve local blocks; no `legacyMapping` required.
    //
    //   (b) Prior lock exists AND has a recorded template_prose_hash AND the
    //       consumer's current skeleton does NOT match it → "consumer edited
    //       prose" → fall through to the existing fail-closed `legacyMapping`
    //       requirement (unchanged from v0.1.x semantics).
    //
    //   (c) Prior lock exists BUT has no template_prose_hash (a pre-v0.2.0
    //       lock that's about to be upgraded by this sync) → BOOTSTRAP: silently
    //       auto-adopt for this one sync; the new lock entry will carry the
    //       hash and subsequent syncs use case (a)/(b). Acceptable risk per
    //       CS03d D4: existing consumers (gwn, sub-invaders) have unedited
    //       template prose.
    //
    //   (d) No prior lock entry at all (fresh consumer, file with extra prose
    //       but never synced) → preserve v0.1.x behavior: fall through to
    //       fail-closed `legacyMapping` requirement. We do NOT auto-adopt
    //       silently here because we cannot distinguish "never-synced existing
    //       file" from "user-edited prose post-sync" without a prior lock to
    //       compare against.
    const priorLockExists = lockRecords !== null;
    const consumerSkeletonHash = sha256(currentSkeleton);

    let path; // 'auto-adopt' | 'fail-closed'
    if (priorLockExists && lockTemplateProseHash == null) {
      path = 'auto-adopt'; // case (c) — bootstrap from pre-v0.2.0 lock
    } else if (lockTemplateProseHash != null && consumerSkeletonHash === lockTemplateProseHash) {
      path = 'auto-adopt'; // case (a) — template prose evolved
    } else {
      path = 'fail-closed'; // cases (b) and (d) — consumer edited or no prior lock
    }

    if (path === 'fail-closed') {
      if (!legacyMapping) {
        throw new ComposedMergeError(
          'Consumer file contains content outside local blocks that does not match the template. ' +
          'Provide legacy_composed_mapping.json to map or discard each legacy region.',
          'EMERGE_LEGACY_UNMAPPED'
        );
      }
      if (!Array.isArray(legacyMapping.regions) || legacyMapping.regions.length === 0) {
        throw new ComposedMergeError(
          'legacyMapping provided but legacyMapping.regions is empty — unmapped legacy content remains',
          'EMERGE_LEGACY_UNMAPPED'
        );
      }
      validateLegacyMapping(
        templateParsed, templateSkeleton, currentSkeleton, legacyMapping, allowedBlockIds
      );
    }
    // else: 'auto-adopt' path falls through to the merge pass below; the
    // template skeleton is used verbatim and local blocks are preserved.
  }

  // Build migration overrides from legacyMapping
  const migratedBlocks = new Map(); // block_id -> content lines
  if (legacyMapping?.regions) {
    for (const region of legacyMapping.regions) {
      if (region.action === 'map_to_block' && region.block_id != null) {
        // content may be a multi-line string; split into lines
        const bodyLines = region.content != null
          ? normalizeLF(region.content).split('\n')
          : [];
        migratedBlocks.set(region.block_id, bodyLines);
      }
      // action === 'discard': extra content is silently dropped (skeleton matched via mapping)
    }
  }

  // Merge pass
  const warnings = [];
  const outputLines = [];
  const blockProvenance = new Map();

  for (const section of templateParsed.sections) {
    if (section.type === 'template') {
      outputLines.push(...section.lines);
    } else {
      outputLines.push(section.startMarker);

      if (migratedBlocks.has(section.id)) {
        outputLines.push(...migratedBlocks.get(section.id));
        blockProvenance.set(section.id, 'migrated-from-legacy');
      } else if (currentParsed.blocks.has(section.id)) {
        const cb = currentParsed.blocks.get(section.id);
        outputLines.push(...cb.body);
        const sameAsTemplate = cb.body.join('\n') === section.body.join('\n');
        blockProvenance.set(section.id, sameAsTemplate ? 'seeded-empty' : 'user-authored');
      } else {
        // Block not in current: seed from template placeholder
        outputLines.push(...section.body);
        blockProvenance.set(section.id, 'seeded-empty');
        warnings.push(`Block id="${section.id}" missing from current file; seeded from template`);
      }

      outputLines.push(section.endMarker);
    }
  }

  const content = outputLines.join('\n');
  const blocks = [...blockProvenance.entries()].map(([id, provenance]) => ({ id, provenance }));
  return { content, blocks, warnings, templateProseHash: newTemplateProseHash };
}

// ---------------------------------------------------------------------------
// computeBlockRecords
// ---------------------------------------------------------------------------

/**
 * Compute SHA-256 hashes for lock-file recording.
 *
 * Returns one blockEntry per block in the merged output, conforming to the
 * `blockEntry` definition in schemas/harness-lock.schema.json.
 *
 * @param {string | MergeResult} merged - Merged file content string, OR MergeResult
 *   from mergeComposed() (the latter carries provenance overrides).
 * @param {string} template - Original template content (for marker hash computation).
 * @returns {Array<{id:string, source_line_range:{start:number,end:number},
 *                  body_hash:string, template_marker_hash:string,
 *                  provenance:'user-authored'|'seeded-empty'|'migrated-from-legacy'}>}
 */
export function computeBlockRecords(merged, template) {
  const mergedContent = (typeof merged === 'string') ? merged : merged.content;
  const provenanceMap = (merged !== null && typeof merged === 'object' && merged.blocks)
    ? new Map(merged.blocks.map(b => [b.id, b.provenance]))
    : null;

  const mergedParsed = parseComposed(mergedContent, { filename: '<merged>' });
  const templateParsed = parseComposed(normalizeLF(template), { filename: '<template>' });

  const records = [];
  for (const [id, block] of mergedParsed.blocks) {
    const tBlock = templateParsed.blocks.get(id);

    // body_hash: SHA-256 of body bytes, LF-normalized
    const bodyHash = sha256(block.body.join('\n'));

    // template_marker_hash: SHA-256 of concatenated start+end marker lines (per schema)
    const tStart = tBlock?.startMarker ?? block.startMarker;
    const tEnd   = tBlock?.endMarker   ?? block.endMarker;
    const markerHash = sha256(tStart + '\n' + tEnd);

    // Provenance: use override from MergeResult if available; else compare bodies
    let provenance;
    if (provenanceMap?.has(id)) {
      provenance = provenanceMap.get(id);
    } else if (tBlock && block.body.join('\n') === tBlock.body.join('\n')) {
      provenance = 'seeded-empty';
    } else {
      provenance = 'user-authored';
    }

    records.push({
      id,
      source_line_range: { start: block.startLine, end: block.endLine },
      body_hash: bodyHash,
      template_marker_hash: markerHash,
      provenance,
    });
  }
  return records;
}

// ---------------------------------------------------------------------------
// mergeComposedFromManaged
// ---------------------------------------------------------------------------

/**
 * Merge a template + current file for a previously-managed file that is
 * transitioning to composed-class with `_inherited_class: 'managed'` set on
 * its `composed.overrides[file]` entry.
 *
 * Semantics (per CS38a C38a-4 / R1 finding B3):
 *
 *   - **Consumer owns the prose** (content outside marker blocks). Unlike
 *     normal `mergeComposed` (where the template's skeleton is canonical and
 *     consumer divergence requires `legacyMapping`), this function treats
 *     the consumer's current outside-block content as authoritative on every
 *     sync.
 *
 *   - **Marker blocks behave normally**: when the consumer already has a
 *     marker block of an allowed id, its body is preserved (consumer-owned).
 *     When the consumer is missing an allowed marker block that exists in
 *     the template, the template's block (start marker + placeholder body +
 *     end marker) is appended at the end of the file with a blank-line
 *     separator.
 *
 *   - **Fresh start** (current is empty): identical to `mergeComposed` —
 *     emit the template verbatim and seed all blocks.
 *
 * Why this exists: a `harness init --enable-review-gates` migration moves a
 * file from `managed.files` to `composed.files` and records
 * `_inherited_class: 'managed'`. On the first `harness sync` after the
 * migration, the consumer's file has no marker blocks yet, so the normal
 * composed-merge skeleton check would fail with `EMERGE_LEGACY_UNMAPPED`.
 * This function is the dispatch target for that case (and for all subsequent
 * syncs as long as `_inherited_class: 'managed'` is set).
 *
 * @param {string} template - Template content from template/composed/<file>
 * @param {string} current  - Current consumer file (or empty string)
 * @param {object} opts
 * @param {string[]} opts.allowedBlockIds - From composed.overrides[file].local_blocks
 * @param {string}   [opts.targetForWarning] - File path for warning messages
 * @returns {MergeResult & { templateProseHash: string }}
 * @throws {ComposedMergeError} ECOMPOSED_UNALLOWED_TEMPLATE_BLOCK / ECOMPOSED_UNALLOWED_CURRENT_BLOCK
 */
export function mergeComposedFromManaged(template, current, opts = {}) {
  const { allowedBlockIds = [], targetForWarning = '<current>' } = opts;

  const templateNorm = normalizeLF(template);
  const templateParsed = parseComposed(templateNorm, { filename: '<template>' });

  for (const blockId of templateParsed.blocks.keys()) {
    if (!allowedBlockIds.includes(blockId)) {
      throw new ComposedMergeError(
        `Block id="${blockId}" in template is not in allowedBlockIds (file: <template>)`,
        'ECOMPOSED_UNALLOWED_TEMPLATE_BLOCK'
      );
    }
  }

  const templateSkeletonForHash = extractSkeleton(templateParsed);
  const newTemplateProseHash = sha256(templateSkeletonForHash);

  const currentNorm = normalizeLF(current ?? '');

  // Fresh start: empty current → render template verbatim (mirrors mergeComposed).
  if (currentNorm.trim() === '') {
    const outputLines = [];
    const blockRecords = [];
    for (const section of templateParsed.sections) {
      if (section.type === 'template') {
        outputLines.push(...section.lines);
      } else {
        outputLines.push(section.startMarker);
        outputLines.push(...section.body);
        outputLines.push(section.endMarker);
        blockRecords.push({ id: section.id, provenance: 'seeded-empty' });
      }
    }
    return {
      content: outputLines.join('\n'),
      blocks: blockRecords,
      warnings: [],
      templateProseHash: newTemplateProseHash,
    };
  }

  const currentParsed = parseComposed(currentNorm, { filename: '<current>' });

  for (const blockId of currentParsed.blocks.keys()) {
    if (!allowedBlockIds.includes(blockId)) {
      throw new ComposedMergeError(
        `Block id="${blockId}" in current file is not in allowedBlockIds (file: <current>)`,
        'ECOMPOSED_UNALLOWED_CURRENT_BLOCK'
      );
    }
  }

  const outputLines = [];
  const blockRecords = [];
  const seenBlocks = new Set();
  const warnings = [];

  // Iterate the CURRENT file's structure (consumer owns outside-block content).
  for (const section of currentParsed.sections) {
    if (section.type === 'template') {
      outputLines.push(...section.lines);
    } else {
      // type === 'block' — preserve consumer's body (normal composed semantics).
      outputLines.push(section.startMarker);
      outputLines.push(...section.body);
      outputLines.push(section.endMarker);

      const templateBlock = templateParsed.blocks.get(section.id);
      const sameAsTemplate = templateBlock
        ? section.body.join('\n') === templateBlock.body.join('\n')
        : false;
      blockRecords.push({
        id: section.id,
        provenance: sameAsTemplate ? 'seeded-empty' : 'user-authored',
      });
      seenBlocks.add(section.id);
    }
  }

  // Splice any template blocks not yet present in current at end-of-file.
  for (const [blockId, block] of templateParsed.blocks) {
    if (seenBlocks.has(blockId)) continue;
    outputLines.push('');
    outputLines.push(block.startMarker);
    outputLines.push(...block.body);
    outputLines.push(block.endMarker);
    blockRecords.push({ id: blockId, provenance: 'seeded-empty' });
    warnings.push(
      `Block id="${blockId}" appended at end of "${targetForWarning}" ` +
      `(inherited-from-managed sync); move it to your preferred location if needed`
    );
  }

  return {
    content: outputLines.join('\n'),
    blocks: blockRecords,
    warnings,
    templateProseHash: newTemplateProseHash,
  };
}
