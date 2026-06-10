/**
 * lib/dispatch.mjs — canonical sub-agent briefing preamble emitter (CS64 C64-6).
 *
 * Mechanizes the LRN-073 verbatim-paste discipline: instead of asking the
 * orchestrator to copy the ~130-line `### Mandatory briefing preamble` block
 * from `OPERATIONS.md` by hand for every dispatch, this module extracts the
 * canonical block at run time and emits a ready-to-paste briefing with the
 * task-specific sections (identity + scope, required reading, deliverables,
 * decision authority) appended below it.
 *
 * Output-only. Zero mutation. Zero runtime dependencies beyond Node 20+
 * stdlib. The preamble source is parsed deterministically from the rendered
 * `OPERATIONS.md` so the emitted block stays byte-equal to the documented
 * source — when the documented preamble changes, every dispatch picks up the
 * change immediately without a code edit (C64-2 leverage principle).
 *
 * The CLI in `bin/harness.mjs` delegates to `emitBriefing()` and prints the
 * result on stdout. Errors (preamble section missing, code fence missing)
 * surface as `Error` instances the CLI converts to a stderr message +
 * `process.exit(1)`.
 *
 * @module lib/dispatch.mjs
 */

import { readFileSync } from 'node:fs';

/** H3 heading exactly as it appears in OPERATIONS.md. */
const PREAMBLE_HEADING = '### Mandatory briefing preamble (copy verbatim into every dispatch)';

/**
 * Canonical content marker — the first content line inside the preamble fence.
 * Used as a robust anchor because OPERATIONS.md may interleave sibling H3
 * sections (e.g. "Subcommand authoring") between the preamble heading and the
 * actual ```text fence, so we cannot stop at H3 boundaries.
 */
const PREAMBLE_CONTENT_MARKER = '## CRITICAL PREFLIGHT (LRN-021)';

/**
 * Extract the verbatim preamble code-fence body from OPERATIONS.md markdown.
 *
 * Strategy: locate the canonical preamble H3 heading (must exist; surfaces a
 * clear error otherwise so renaming the section breaks loudly). Then scan
 * forward for ```text fences and return the body of the first one whose first
 * content line equals `## CRITICAL PREFLIGHT (LRN-021)` — this anchor is
 * unique to the canonical preamble across the entire OPERATIONS.md, so it
 * tolerates intervening sibling H3 sections (LRN-124's "Subcommand authoring"
 * section ships between the heading and the fence in v0.8.x).
 *
 * @param {string} operationsMd - Raw OPERATIONS.md content.
 * @returns {string} Verbatim preamble body (without the surrounding fence
 *   markers; trailing newline preserved).
 * @throws {Error} When the heading or its anchored ```text fence cannot be
 *   located.
 */
export function extractPreamble(operationsMd) {
  if (typeof operationsMd !== 'string') {
    throw new Error('extractPreamble: operationsMd must be a string');
  }

  const lines = operationsMd.split('\n');
  const headingIdx = lines.findIndex((l) => l === PREAMBLE_HEADING);
  if (headingIdx === -1) {
    throw new Error(
      `dispatch: canonical preamble heading not found in OPERATIONS.md\n` +
        `  expected H3: ${PREAMBLE_HEADING}\n` +
        `  This usually means OPERATIONS.md was renamed/restructured; ` +
        `dispatch emits from the documented source and cannot proceed.`
    );
  }

  for (let i = headingIdx + 1; i < lines.length; i++) {
    if (lines[i] !== '```text') continue;
    const firstContent = lines[i + 1];
    if (firstContent !== PREAMBLE_CONTENT_MARKER) continue;

    for (let j = i + 2; j < lines.length; j++) {
      if (lines[j] === '```') {
        return lines.slice(i + 1, j).join('\n') + '\n';
      }
    }
    throw new Error('dispatch: opening ```text fence has no matching closing ``` fence.');
  }

  throw new Error(
    'dispatch: anchored ```text code fence not found after the preamble heading; ' +
      `expected the fence body to start with: ${PREAMBLE_CONTENT_MARKER}\n` +
      '  The canonical preamble must live in a ```text-tagged fence whose first ' +
      'content line is the LRN-021 preflight heading so the extractor can locate ' +
      'it deterministically across doc reorganisations.'
  );
}

/**
 * Render a task-specific "Identity + scope" / "Required reading" /
 * "Deliverables" / "Decision authority" appendix per the OPERATIONS.md
 * "After pasting the block, append the task-specific sections" instruction.
 *
 * All fields are optional; sections with empty content are omitted so the
 * caller can build up a briefing incrementally and emit a minimal-but-valid
 * stub.
 *
 * @param {object} task
 * @param {string} [task.cs]              - Clickstop ID (e.g. "CS64").
 * @param {string} [task.role]            - Sub-agent role (e.g. "implementer").
 * @param {string} [task.agentId]         - Canonical sub-agent agent-id token
 *                                          (e.g. "cs64-startup").
 * @param {string} [task.summary]         - One-paragraph description of the task.
 * @param {string[]} [task.ownedFiles]    - Paths the sub-agent may write.
 * @param {string[]} [task.doNotTouch]    - Paths/areas the sub-agent must not touch.
 * @param {string[]} [task.requiredReading] - Paths the sub-agent must read.
 * @param {string[]} [task.deliverables]  - Required outputs / exit criteria.
 * @param {string}   [task.decisionAuthority] - What the sub-agent decides vs. escalates.
 * @param {string}   [task.implementerModel] - Model id used for the sub-agent.
 * @returns {string} Markdown-formatted appendix ending in a trailing newline,
 *   or '' when no task fields are present.
 */
export function renderTaskSections(task = {}) {
  const out = [];

  if (task.cs || task.role || task.agentId || task.summary || task.implementerModel) {
    out.push('## Identity + scope');
    out.push('');
    if (task.cs) out.push(`- **CS:** ${task.cs}`);
    if (task.role) out.push(`- **Role:** ${task.role}`);
    if (task.agentId) out.push(`- **Agent ID:** \`${task.agentId}\``);
    if (task.implementerModel) {
      out.push(`- **Implementer model:** ${task.implementerModel}`);
    }
    if (task.summary) {
      out.push('');
      out.push(task.summary);
    }
    out.push('');
  }

  if (Array.isArray(task.ownedFiles) && task.ownedFiles.length > 0) {
    out.push('## File ownership — OWN only');
    out.push('');
    for (const f of task.ownedFiles) out.push(`- \`${f}\``);
    out.push('');
  }

  if (Array.isArray(task.doNotTouch) && task.doNotTouch.length > 0) {
    out.push('## Do NOT touch');
    out.push('');
    for (const f of task.doNotTouch) out.push(`- \`${f}\``);
    out.push('');
  }

  if (Array.isArray(task.requiredReading) && task.requiredReading.length > 0) {
    out.push('## Required reading');
    out.push('');
    for (const f of task.requiredReading) out.push(`- \`${f}\``);
    out.push('');
  }

  if (Array.isArray(task.deliverables) && task.deliverables.length > 0) {
    out.push('## Deliverables');
    out.push('');
    for (const d of task.deliverables) out.push(`- ${d}`);
    out.push('');
  }

  if (task.decisionAuthority) {
    out.push('## Decision authority');
    out.push('');
    out.push(task.decisionAuthority);
    out.push('');
  }

  if (out.length === 0) return '';
  return out.join('\n');
}

/**
 * Compose a full sub-agent briefing: verbatim canonical preamble + the
 * task-specific appendix. The two are separated by a blank line; the
 * preamble is emitted as a ```text fenced block so it pastes cleanly into a
 * sub-agent prompt as code.
 *
 * @param {object} args
 * @param {string} args.operationsMd      - Raw OPERATIONS.md content.
 * @param {object} [args.task]            - Task-specific fields (see renderTaskSections).
 * @param {boolean} [args.includeFence]   - When true (default), wrap the
 *   verbatim preamble in a ```text fence so it round-trips when re-pasted.
 *   When false, emit the preamble body bare (used by tests that compare
 *   against the documented source).
 * @returns {string} Briefing text ending in a trailing newline.
 */
export function emitBriefing({ operationsMd, task = {}, includeFence = true }) {
  const preamble = extractPreamble(operationsMd);
  const sections = renderTaskSections(task);

  const parts = [];
  if (includeFence) {
    parts.push('```text');
    parts.push(preamble.replace(/\n$/, ''));
    parts.push('```');
    parts.push('');
  } else {
    parts.push(preamble.replace(/\n$/, ''));
    parts.push('');
  }
  if (sections) parts.push(sections.replace(/\n$/, ''));

  return parts.join('\n') + '\n';
}

/**
 * Convenience: load OPERATIONS.md from disk + emit a briefing.
 *
 * @param {object} args
 * @param {string} args.operationsPath - Absolute path to OPERATIONS.md.
 * @param {object} [args.task]
 * @param {boolean} [args.includeFence]
 * @returns {string}
 */
export function emitBriefingFromFile({ operationsPath, task, includeFence }) {
  const md = readFileSync(operationsPath, 'utf8');
  return emitBriefing({ operationsMd: md, task, includeFence });
}
