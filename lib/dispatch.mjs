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
 * ## Language profiles (CS102 / issue #423)
 *
 * The canonical core is language-**agnostic** (preflight, file ownership,
 * required reading, fail-closed, report shape). The ecosystem-specific
 * conventions + self-check commands live in per-language profile fences
 * (`## LANGUAGE PROFILE: <name>`) further down OPERATIONS.md. The core
 * Conventions/Self-checks sections each end with an injection marker
 * (`<!-- harness:dispatch-language-conventions -->` /
 * `<!-- harness:dispatch-language-self-checks -->`); `emitBriefing` replaces
 * each with the matching part of the selected profile (`node` default /
 * `dotnet`), so a .NET consumer no longer has to negate Node/ESM/npm noise in
 * every dispatch. Unknown profile / missing profile fence / missing split
 * marker fail closed with a clear `Error`.
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
 * Known dispatch language profiles (CS102). The first entry is the default
 * (backward-compatible with every pre-CS102 consumer). `bin/harness.mjs`
 * validates `--language-profile` / `dispatch.language_profile` against this
 * list and each name must have a `## LANGUAGE PROFILE: <name>` fence in
 * OPERATIONS.md.
 */
export const LANGUAGE_PROFILES = ['node', 'dotnet'];

/** Default language profile when neither flag nor config selects one. */
export const DEFAULT_LANGUAGE_PROFILE = 'node';

/**
 * Injection markers in the core preamble fence (replaced by the selected
 * profile's parts) and the split marker inside each profile fence.
 */
const CORE_CONVENTIONS_MARKER = '<!-- harness:dispatch-language-conventions -->';
const CORE_SELF_CHECKS_MARKER = '<!-- harness:dispatch-language-self-checks -->';
const PROFILE_SPLIT_MARKER = '<!-- harness:profile-self-checks -->';

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
 * Strip a leading `### <sub-heading>` line (and any surrounding blank lines)
 * from a slice of fence-body lines, returning the trimmed inner content joined
 * with `\n`. Used to lift the bullet/item body out of a profile fence's
 * `### conventions` / `### self-checks` part so it splices cleanly under the
 * core's `## Conventions to follow` / `## Self-checks before reporting`
 * headings without a redundant sub-heading.
 *
 * @param {string[]} lines - Fence-body line slice.
 * @param {string} heading - The sub-heading to drop if present (e.g. "### conventions").
 * @returns {string} Trimmed inner content (no leading/trailing blank lines).
 */
function stripLeadingHeading(lines, heading) {
  let start = 0;
  while (start < lines.length && lines[start].trim() === '') start++;
  if (start < lines.length && lines[start].trim() === heading) {
    start++;
    while (start < lines.length && lines[start].trim() === '') start++;
  }
  let end = lines.length;
  while (end > start && lines[end - 1].trim() === '') end--;
  return lines.slice(start, end).join('\n');
}

/**
 * Extract a language profile's conventions + self-checks from OPERATIONS.md.
 *
 * Mirrors {@link extractPreamble}: locate the ```text fence whose first content
 * line is `## LANGUAGE PROFILE: <profileName>` (unique per profile), then split
 * its body on the `<!-- harness:profile-self-checks -->` marker into the
 * conventions part (above) and the self-checks part (below). Each part's
 * `### conventions` / `### self-checks` sub-heading is stripped so the returned
 * bodies splice directly into the core's headings.
 *
 * Fail-closed: a missing profile fence, an unterminated fence, or a missing
 * split marker throws a clear `Error` rather than returning a partial result.
 *
 * @param {string} operationsMd - Raw OPERATIONS.md content.
 * @param {string} profileName - Profile name (e.g. "node", "dotnet").
 * @returns {{ conventions: string, selfChecks: string }} The two spliceable bodies.
 * @throws {Error} When inputs are invalid or the profile fence/marker is missing.
 */
export function extractLanguageProfile(operationsMd, profileName) {
  if (typeof operationsMd !== 'string') {
    throw new Error('extractLanguageProfile: operationsMd must be a string');
  }
  if (typeof profileName !== 'string' || profileName === '') {
    throw new Error('extractLanguageProfile: profileName must be a non-empty string');
  }

  const anchor = `## LANGUAGE PROFILE: ${profileName}`;
  const lines = operationsMd.split('\n');

  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== '```text') continue;
    if (lines[i + 1] !== anchor) continue;

    let close = -1;
    for (let j = i + 2; j < lines.length; j++) {
      if (lines[j] === '```') {
        close = j;
        break;
      }
    }
    if (close === -1) {
      throw new Error(
        `dispatch: language profile "${profileName}" opening \`\`\`text fence has ` +
          'no matching closing ``` fence.'
      );
    }

    const body = lines.slice(i + 2, close);
    const markerIdx = body.findIndex((l) => l === PROFILE_SPLIT_MARKER);
    if (markerIdx === -1) {
      throw new Error(
        `dispatch: language profile "${profileName}" fence is missing the ` +
          `\`${PROFILE_SPLIT_MARKER}\` split marker that separates its ` +
          'conventions from its self-checks.'
      );
    }

    const conventions = stripLeadingHeading(body.slice(0, markerIdx), '### conventions');
    const selfChecks = stripLeadingHeading(body.slice(markerIdx + 1), '### self-checks');
    return { conventions, selfChecks };
  }

  throw new Error(
    `dispatch: language profile "${profileName}" not found in OPERATIONS.md; ` +
      `expected a \`\`\`text fence whose first content line is "${anchor}". ` +
      `Known profiles: ${LANGUAGE_PROFILES.join(', ')}.`
  );
}

/**
 * Splice a language profile's conventions + self-checks into the core preamble
 * by replacing the two in-core injection markers. Fail-closed: a missing marker
 * (malformed core) throws rather than silently emitting an un-spliced core.
 *
 * @param {string} core - Verbatim core preamble body (from extractPreamble).
 * @param {{ conventions: string, selfChecks: string }} profile - Profile parts.
 * @returns {string} Core with both markers replaced.
 * @throws {Error} When either core marker is absent.
 */
function spliceLanguageProfile(core, { conventions, selfChecks }) {
  if (!core.includes(CORE_CONVENTIONS_MARKER)) {
    throw new Error(
      `dispatch: core preamble is missing the \`${CORE_CONVENTIONS_MARKER}\` ` +
        'injection marker; cannot splice language-profile conventions.'
    );
  }
  if (!core.includes(CORE_SELF_CHECKS_MARKER)) {
    throw new Error(
      `dispatch: core preamble is missing the \`${CORE_SELF_CHECKS_MARKER}\` ` +
        'injection marker; cannot splice language-profile self-checks.'
    );
  }
  return core
    .replace(CORE_CONVENTIONS_MARKER, () => conventions)
    .replace(CORE_SELF_CHECKS_MARKER, () => selfChecks);
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
  if (!task) task = {};
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
 * @param {string} [args.languageProfile] - Language profile whose conventions +
 *   self-checks are spliced into the core (default "node"). Must have a
 *   `## LANGUAGE PROFILE: <name>` fence in `operationsMd`.
 * @returns {string} Briefing text ending in a trailing newline.
 */
export function emitBriefing({
  operationsMd,
  task = {},
  includeFence = true,
  languageProfile = DEFAULT_LANGUAGE_PROFILE,
}) {
  const core = extractPreamble(operationsMd);
  const profile = extractLanguageProfile(operationsMd, languageProfile);
  const preamble = spliceLanguageProfile(core, profile);
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
 * @param {string} [args.languageProfile] - See {@link emitBriefing}.
 * @returns {string}
 */
export function emitBriefingFromFile({ operationsPath, task, includeFence, languageProfile }) {
  const md = readFileSync(operationsPath, 'utf8');
  return emitBriefing({ operationsMd: md, task, includeFence, languageProfile });
}
