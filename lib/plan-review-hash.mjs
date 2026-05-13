/**
 * lib/plan-review-hash.mjs — Compute a stable content hash over the
 * `## Decisions` and `## Deliverables` sections of a clickstop plan file.
 *
 * Used by:
 *   - scripts/check-clickstop-plan-review.mjs (per CS35b, decision C35b-3) to
 *     detect when the latest `## Plan review` attestation row's
 *     "Reviewed sections hash" is stale relative to the current file content.
 *   - bin/harness.mjs `plan-review-hash <file>` subcommand (per CS35b
 *     decision C35b-2) to give orchestrators a one-shot tool for filling in
 *     the hash field at attestation time.
 *
 * Hash semantics (per C35b-2, C35b-3):
 *   - Read the file, normalize BOM + line endings to LF (per LRN-006/018).
 *   - Extract the body text under H2 `## Decisions` and H2 `## Deliverables`
 *     using lib/doc-schema.mjs#extractSectionBody (consistent with the rest
 *     of the linter family).
 *   - Trim trailing whitespace from each section body (per-line trailing
 *     whitespace is preserved so meaningful indentation is not flattened;
 *     only trailing whitespace at the section boundary is removed).
 *   - Concatenate the two trimmed bodies with a single LF separator.
 *   - Compute SHA-256 over the UTF-8 bytes of the concatenated string.
 *   - Return the first 12 hex characters of the digest. 12 chars (~48 bits)
 *     is collision-safe at the per-CS scale (≤ ~1k attestations across the
 *     repo's lifetime) and stays compact for the `## Plan review` table.
 *
 * Pure function: no side effects beyond reading the file. Reads of missing
 * sections return an empty string for that section's portion of the hash
 * input — the linter is responsible for separately reporting that the
 * required section is missing.
 *
 * Zero runtime dependencies beyond Node built-ins.
 *
 * @module lib/plan-review-hash.mjs
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import { extractSectionBody, headingAnchor } from './doc-schema.mjs';

/** H2 section names whose bodies are concatenated to form the hash input. */
export const HASHED_SECTIONS = ['Decisions', 'Deliverables'];

/** Length (hex characters) of the prefix returned by computePlanReviewHash. */
export const HASH_PREFIX_LENGTH = 12;

/**
 * Read the file at {@link filePath} and return the 12-char SHA-256 prefix
 * computed over the concatenated trimmed bodies of its `## Decisions` and
 * `## Deliverables` H2 sections.
 *
 * @param {string} filePath - Absolute path to a clickstop plan markdown file.
 * @returns {string} 12-character lowercase hex string.
 * @throws {Error} If the file cannot be read.
 */
export function computePlanReviewHash(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return computePlanReviewHashFromText(raw);
}

/**
 * Variant of {@link computePlanReviewHash} that accepts the raw markdown text
 * directly, useful for tests that synthesize fixtures in memory and for the
 * linter (which already has the file content loaded).
 *
 * @param {string} markdownText - Raw clickstop plan markdown content.
 * @returns {string} 12-character lowercase hex string.
 */
export function computePlanReviewHashFromText(markdownText) {
  const bodies = HASHED_SECTIONS.map((name) => {
    const body = extractSectionBody(markdownText, headingAnchor(name));
    return body.replace(/\s+$/u, '');
  });
  const input = bodies.join('\n');
  const digest = crypto.createHash('sha256').update(input, 'utf8').digest('hex');
  return digest.slice(0, HASH_PREFIX_LENGTH);
}
