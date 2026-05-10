#!/usr/bin/env node
/**
 * scripts/check-instructions.mjs — Linter for INSTRUCTIONS.md.
 *
 * Validates:
 *   1. Required top-level (H2) headings are present.
 *   2. In-doc anchor links ([text](#anchor)) resolve to an existing heading.
 *   3. Headings with no content body emit a WARNING (dead-section detection).
 *   4. Scoped cross-file references resolve (LRN anchors and ADR files).
 *
 * Usage:
 *   node scripts/check-instructions.mjs --file <path> [--quiet]
 *
 * Exit codes:
 *   0 — valid (warnings are printed but do not affect exit code)
 *   1 — at least one validation error
 *   2 — bad CLI usage (missing required --file flag)
 *
 * @module scripts/check-instructions.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  DocSchemaError,
  assertHeadings,
  collectHeadings,
  parseFrontmatterBlocks,
  resolveLinks,
} from '../lib/doc-schema.mjs';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

let filePath = null;
let quiet = false;

const argv = process.argv.slice(2);

function requireValue(args, i, flagName) {
  if (!args[i + 1] || args[i + 1].startsWith('-')) {
    process.stderr.write(`check-instructions: missing value for ${flagName}\n`);
    process.exit(2);
  }
  return args[i + 1];
}

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--file') {
    filePath = requireValue(argv, i, '--file');
    i++;
  } else if (a === '--quiet') {
    quiet = true;
  } else if (a === '--help' || a === '-h') {
    process.stdout.write(
      'Usage: check-instructions.mjs --file <path> [--quiet]\n\n' +
      'Validate INSTRUCTIONS.md structure and cross-link integrity.\n\n' +
      'Options:\n' +
      '  --file <path>   Path to the INSTRUCTIONS.md file to lint (REQUIRED)\n' +
      '  --quiet         Suppress per-finding output; print only the summary\n' +
      '  --help          Print this help text\n'
    );
    process.exit(0);
  } else {
    process.stderr.write(`check-instructions: unknown flag: ${a}\n`);
    process.exit(2);
  }
}

if (!filePath) {
  process.stderr.write(
    'check-instructions: --file <path> is required\n' +
    'Usage: check-instructions.mjs --file <path> [--quiet]\n'
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Required H2 headings — derived from actual INSTRUCTIONS.md sections
// ---------------------------------------------------------------------------

const REQUIRED_HEADINGS = [
  'Quick Reference Checklist',
  'Per-CS Loop',
  'Pointers',
];

// ---------------------------------------------------------------------------
// Read the target file
// ---------------------------------------------------------------------------

let markdownText;
try {
  markdownText = fs.readFileSync(filePath, 'utf8');
} catch (err) {
  process.stderr.write(`check-instructions: cannot read file "${filePath}": ${err.message}\n`);
  process.exit(1);
}

const normalized = markdownText
  .replace(/^\uFEFF/, '')
  .replace(/\r\n/g, '\n')
  .replace(/\r/g, '\n');

const lines = normalized.split('\n');

// ---------------------------------------------------------------------------
// Finding collectors
// ---------------------------------------------------------------------------

const errors = [];
const warnings = [];

function logError(msg, { stream = 'stdout' } = {}) {
  errors.push(msg);
  if (stream === 'stderr') {
    process.stderr.write(`${msg}\n`);
  } else if (!quiet) {
    process.stdout.write(`ERROR: ${msg}\n`);
  }
}

function logWarning(msg) {
  warnings.push(msg);
  if (!quiet) process.stdout.write(`WARNING: ${msg}\n`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findFileUp(startDir, filename) {
  let current = path.resolve(startDir);
  while (true) {
    const candidate = path.join(current, filename);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function extractMarkdownHrefs(text) {
  const hrefs = [];
  const linkRegex = /\[(?:[^\]]*)\]\(([^)]+)\)/g;
  for (const line of text.split('\n')) {
    linkRegex.lastIndex = 0;
    let m;
    while ((m = linkRegex.exec(line)) !== null) {
      hrefs.push(m[1]);
    }
  }
  return hrefs;
}

function validateLearningReferences(hrefs, docDir) {
  const lrnRefs = hrefs
    .filter((href) => /^LEARNINGS\.md#lrn-\d+$/i.test(href))
    .map((href) => ({
      href,
      id: `LRN-${href.match(/#lrn-(\d+)$/i)[1]}`,
    }));

  if (lrnRefs.length === 0) return;

  const learningsPath = findFileUp(docDir, 'LEARNINGS.md');
  if (!learningsPath) {
    for (const ref of lrnRefs) {
      logError(
        `INSTRUCTIONS.md: dead LRN anchor "${ref.href}" (no matching heading in LEARNINGS.md)`,
        { stream: 'stderr' }
      );
    }
    return;
  }

  let learningsText;
  try {
    learningsText = fs.readFileSync(learningsPath, 'utf8');
  } catch (err) {
    throw new DocSchemaError(`cannot read LEARNINGS.md: ${err.message}`, 'READ_ERROR');
  }

  const blocks = parseFrontmatterBlocks(learningsText);
  const malformed = blocks.find((block) => block.parseError);
  if (malformed) {
    throw new DocSchemaError(
      `LEARNINGS.md malformed YAML near line ${malformed.lineNumber}: ${malformed.parseError.message}`,
      'PARSE_ERROR'
    );
  }

  for (const ref of lrnRefs) {
    const missing = assertHeadings(learningsText, [ref.id]);
    if (missing.length > 0) {
      logError(
        `INSTRUCTIONS.md: dead LRN anchor "${ref.href}" (no matching heading in LEARNINGS.md)`,
        { stream: 'stderr' }
      );
    }
  }
}

function isAdrMarkdownReference(href) {
  const filePart = href.split('#')[0].split('?')[0];
  return filePart.startsWith('docs/adr/') && filePart.endsWith('.md');
}

function validateAdrReferences(text, docDir) {
  const brokenLinks = resolveLinks(text, docDir)
    .filter((finding) => isAdrMarkdownReference(finding.href));

  for (const finding of brokenLinks) {
    const filePart = finding.href.split('#')[0].split('?')[0];
    const resolved = path.resolve(docDir, filePart);
    logError(
      `INSTRUCTIONS.md: dead ADR reference "${filePart}" (file does not exist at ${resolved})`,
      { stream: 'stderr' }
    );
  }
}

// ---------------------------------------------------------------------------
// Parse headings from the document
// ---------------------------------------------------------------------------

/**
 * @typedef {{ level: number, text: string, anchor: string, line: number }} Heading
 */

/** @type {Heading[]} */
const headings = collectHeadings(normalized);

// Set of all anchors present in the document (for anchor validation).
const existingSlugs = new Set(headings.map((h) => h.anchor));

// ---------------------------------------------------------------------------
// Check 1 — Required H2 headings
// ---------------------------------------------------------------------------

const existingH2Texts = new Set(
  headings.filter((h) => h.level === 2).map((h) => h.text)
);
const missingRequiredHeadings = new Set(
  assertHeadings(normalized, REQUIRED_HEADINGS).map((finding) => finding.heading)
);

for (const required of REQUIRED_HEADINGS) {
  if (missingRequiredHeadings.has(required) || !existingH2Texts.has(required)) {
    logError(`Missing required heading: "## ${required}"`);
  }
}

// ---------------------------------------------------------------------------
// Check 2 — In-doc anchor cross-link integrity
//   Only links of the form [text](#anchor) are checked (in-doc anchors).
//   Cross-file links like [text](other.md#anchor) are ignored.
// ---------------------------------------------------------------------------

const anchorLinkRe = /\[([^\]]*)\]\(#([^)]+)\)/g;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  let match;
  while ((match = anchorLinkRe.exec(line)) !== null) {
    const anchor = match[2];
    if (!existingSlugs.has(anchor)) {
      logError(
        `Line ${i + 1}: broken anchor link "#${anchor}" — no matching heading found`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Check 3 — Dead-section detection
//   A heading is "dead" if the next non-blank line is another heading (or EOF).
// ---------------------------------------------------------------------------

for (let h = 0; h < headings.length; h++) {
  const heading = headings[h];
  const startLine = heading.line; // line is 1-indexed; lines[] is 0-indexed, so this skips the heading line
  const endLine = h + 1 < headings.length ? headings[h + 1].line - 1 : lines.length;

  let hasContent = false;
  for (let l = startLine; l < endLine; l++) {
    if (lines[l].trim() !== '') {
      hasContent = true;
      break;
    }
  }

  if (!hasContent) {
    logWarning(
      `Line ${heading.line}: heading "${'#'.repeat(heading.level)} ${heading.text}" has no content (dead section)`
    );
  }
}

// ---------------------------------------------------------------------------
// Check 4 — Scoped cross-file link validation
// ---------------------------------------------------------------------------

try {
  const docDir = path.dirname(path.resolve(filePath));
  const hrefs = extractMarkdownHrefs(normalized);
  validateLearningReferences(hrefs, docDir);
  validateAdrReferences(normalized, docDir);
} catch (err) {
  if (err instanceof DocSchemaError) {
    process.stderr.write(`check-instructions: ${err.message}\n`);
    process.exit(1);
  }
  throw err;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const basename = path.basename(filePath);
process.stdout.write(`\n${basename}: ${errors.length} errors, ${warnings.length} warnings\n`);

if (errors.length > 0) {
  process.stdout.write('\n❌ Linter FAILED\n');
  process.exit(1);
} else {
  process.stdout.write('\n✅ Linter passed\n');
  process.exit(0);
}
