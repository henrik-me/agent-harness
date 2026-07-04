/**
 * lib/markdown-fence.mjs — Fence-aware ATX-heading locator (CS75 C75-2).
 *
 * A single, CommonMark-correct implementation of "find the FIRST real ATX
 * heading equal to a given text that is NOT inside a fenced code block". It is
 * the shared source of truth for the `## Plan-vs-implementation review` (PVI)
 * gate in both `scripts/check-clickstop.mjs` and `lib/review-cs.mjs`, replacing
 * the private copy that CS66 shipped in `review-cs` (its run-length fence
 * tracking is extracted here, generalized to accept the target heading + level).
 *
 * Why a dedicated module (not lib/doc-schema.mjs): `lib/review-cs.mjs` must stay
 * dependency-free because it runs inside the `.harness-ci` clone, and
 * `doc-schema.mjs` imports `js-yaml` (which would `ERR_MODULE_NOT_FOUND` there).
 * This module therefore imports NOTHING — it is pure, Node-builtins-only, and
 * safe for every consumer, dependency-free clone included.
 *
 * Fence semantics (preserved verbatim from `review-cs`'s `findPviHeadingIndex`):
 *   - A fence OPENS on a trimmed line beginning with a run of >=3 backticks or
 *     >=3 tildes (an info string may follow the run, e.g. ```js).
 *   - A fence CLOSES only on a line whose trimmed form is the SAME marker char,
 *     is nothing but fence characters (`run === trimmed`), and whose run length
 *     is >= the opening fence's run length. This last rule is why an inner ```
 *     line does NOT close an outer ```` fence — a four-backtick fence can embed
 *     a triple-backtick block, so a heading inside that embedded block is still
 *     fenced and must be treated as absent.
 *   - CRLF / bare-CR line endings are normalized to LF before scanning.
 *
 * @module lib/markdown-fence.mjs
 */

/** Escape a string so it can be embedded literally into a RegExp source. */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compute a per-line "is this line inside (or part of) a fenced code block" mask
 * for `lines`. A line is masked (true) when it opens a fence, closes it, is an
 * inner fence-marker line that does not close the outer fence, or lies between an
 * opener and its matching closer. CommonMark run-length rule: a fence closes only
 * on a line whose trimmed form is the SAME marker char, is nothing but fence
 * chars (`run === trimmed`), and whose run length is >= the opener's — so an
 * inner ``` cannot close an outer ````. Masked lines are never treated as real
 * ATX headings or section boundaries.
 *
 * @param {string[]} lines
 * @returns {boolean[]} mask aligned to `lines` (true = fenced / fence-marker).
 */
function fenceMask(lines) {
  const mask = new Array(lines.length).fill(false);
  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const fenceMatch = /^(`{3,}|~{3,})/.exec(trimmed);
    if (fenceMatch) {
      const run = fenceMatch[1];
      const marker = run[0];
      if (!inFence) {
        // Opening fence — an info string may follow the run (e.g. ```js).
        inFence = true;
        fenceChar = marker;
        fenceLen = run.length;
      } else if (marker === fenceChar && run === trimmed && run.length >= fenceLen) {
        // Closing fence — same char, only fence chars (run === trimmed), and a
        // run length >= the opener (so ``` cannot close ````).
        inFence = false;
        fenceChar = '';
        fenceLen = 0;
      }
      mask[i] = true; // the fence-marker line itself is never a heading/boundary
      continue;
    }
    mask[i] = inFence;
  }
  return mask;
}

/**
 * Return the 0-based line index of the FIRST real (non-fenced) ATX heading
 * equal to `'#'.repeat(level) + ' ' + headingText` (trailing whitespace
 * tolerated), or `-1` if no such heading exists outside a code fence.
 *
 * A heading that exists ONLY inside a ``` / ~~~ fenced code block is treated as
 * MISSING (returns -1 if that is the only occurrence).
 *
 * @param {string} content     - full markdown text.
 * @param {string} headingText - the heading text after the `#` run + single
 *                               space (e.g. "Plan-vs-implementation review").
 * @param {number} [level=2]   - ATX heading level (number of leading `#`).
 * @returns {number} 0-based line index of the real heading, or -1 if none.
 */
export function findHeadingIndex(content, headingText, level = 2) {
  const lines = String(content).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const headingRe = new RegExp(`^#{${level}}[ \\t]+${escapeRegExp(String(headingText))}\\s*$`);
  const masked = fenceMask(lines);
  for (let i = 0; i < lines.length; i++) {
    if (!masked[i] && headingRe.test(lines[i])) {
      return i;
    }
  }
  return -1;
}

/**
 * Extract the body of the section headed by the FIRST real (non-fenced) ATX
 * heading equal to `headingText`: the lines AFTER that heading up to (but
 * excluding) the next `# ` / `## ` heading or EOF. Returns '' if no such
 * heading exists outside a fence.
 *
 * The START is fence-aware (via {@link findHeadingIndex}), so a fenced
 * `## <headingText>` earlier in the document cannot mis-scope the body to the
 * wrong (fenced) heading — the exact hole CS75 closes for the done-stage PVI
 * field check. The END boundary is ALSO fence-aware: a `# `/`## ` line that only
 * appears INSIDE a fenced code block within the section body does not truncate
 * the body (Copilot review finding).
 *
 * @param {string} content     - full markdown text.
 * @param {string} headingText - heading text after the `#` run + single space.
 * @param {number} [level=2]   - ATX heading level.
 * @returns {string} the section body ('' if the heading is absent).
 */
export function extractHeadingSectionBody(content, headingText, level = 2) {
  const lines = String(content).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const startIdx = findHeadingIndex(content, headingText, level);
  if (startIdx === -1) return '';
  const masked = fenceMask(lines);
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (!masked[i] && /^#{1,2}\s/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  return lines.slice(startIdx + 1, endIdx).join('\n');
}
