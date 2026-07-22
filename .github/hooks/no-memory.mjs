/**
 * .github/hooks/no-memory.mjs — PreToolUse decision hook (CS114).
 *
 * Enforces the repo doctrine "Knowledge lives in the repo, not agent memory"
 * (INSTRUCTIONS.md §45–61) mechanically: the Copilot CLI runs this before the
 * store_memory tool (scoped by the `matcher` in .github/hooks/no-memory.json)
 * and this script DENIES it, redirecting durable knowledge to repo docs.
 *
 * Contract (GitHub Copilot hooks reference):
 *   - stdin  : one JSON payload with the tool name in `toolName` (camelCase)
 *              or `tool_name` (PascalCase PreToolUse form).
 *   - stdout : to deny, EXACTLY ONE JSON object
 *              {"permissionDecision":"deny","permissionDecisionReason":"…"};
 *              to allow, write NOTHING.
 *
 * Fail-safe design (C114-3):
 *   - Command PreToolUse hooks are FAIL-CLOSED on a non-zero exit, so this
 *     script ALWAYS exits 0 (a crash would otherwise deny the tool).
 *   - It denies ONLY the exact target tool; any read/parse error falls through
 *     to allow (empty stdout — fail-open).
 *   - The decision is written with a SYNCHRONOUS stdout write and the process
 *     ends naturally via `process.exitCode = 0`; `process.exit()` is never
 *     called before stdout flushes (it can truncate buffered output and drop
 *     the deny decision).
 */

import fs from 'node:fs';

const TARGET_TOOL = 'store_memory';

const DENY_REASON =
  'This repository forbids agent memory: the store_memory tool is disabled here. ' +
  'Durable, project-applicable knowledge must be recorded in versioned repo docs — ' +
  'learnings in LEARNINGS.md, doctrine/process in INSTRUCTIONS.md, OPERATIONS.md, ' +
  'CONVENTIONS.md, or REVIEWS.md — never in an assistant\'s private memory ' +
  '(see INSTRUCTIONS.md § "Knowledge lives in the repo, not agent memory"). ' +
  'Enforced by .github/hooks/no-memory.json.';

/**
 * Read all of stdin to completion as a UTF-8 string.
 *
 * @returns {Promise<string>}
 */
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Decide from a raw stdin payload. Returns the deny decision object for the
 * target tool, or null to allow (any other tool, or any parse error).
 *
 * @param {string} raw
 * @returns {{ permissionDecision: string, permissionDecisionReason: string } | null}
 */
function decide(raw) {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null; // fail-open: unparseable payload → allow
  }
  if (payload === null || typeof payload !== 'object') return null;
  const tool = payload.toolName ?? payload.tool_name;
  if (tool === TARGET_TOOL) {
    return { permissionDecision: 'deny', permissionDecisionReason: DENY_REASON };
  }
  return null;
}

async function main() {
  let decision = null;
  try {
    decision = decide(await readStdin());
  } catch {
    decision = null; // fail-open on any read error
  }
  if (decision) {
    try {
      // Synchronous write so the decision is never truncated (C114-3).
      fs.writeSync(1, JSON.stringify(decision) + '\n');
    } catch {
      // Ignore write errors (e.g. EPIPE if the consumer closed the pipe):
      // never fail the tool call on a broken stdout.
    }
  }
  process.exitCode = 0;
}

// Belt-and-suspenders: any unexpected rejection still ends with exit code 0,
// so a command PreToolUse hook is never fail-closed by this script (C114-3).
main().catch(() => {
  process.exitCode = 0;
});
