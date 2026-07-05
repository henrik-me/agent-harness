#!/usr/bin/env node
/**
 * scripts/check-ruleset-deadlock.mjs — F3 deadlock-risk guard (CS109 / ADR 0006 D4,
 * docs/adr/0006-review-enforcement-posture.md).
 *
 * A GitHub *required* status check is only safe if its producing job ALWAYS
 * creates and reports the check run. Two classes leave a required context in the
 * "expected"/pending state forever, which DEADLOCKS every PR of the affected
 * class (the PR can never satisfy a check that is never reported):
 *
 *   1. NO PRODUCER (highest risk): a required context name matches no workflow
 *      job (job-id or its `name:`) anywhere under the workflows dir — typically a
 *      typo in the ruleset or a removed/renamed job.
 *   2. WORKFLOW-LEVEL NON-INSTANTIATION: a producing workflow carries a
 *      workflow-level `on:` path filter (`paths:` / `paths-ignore:`) that can
 *      prevent the workflow — and thus the check run — from being created for a
 *      PR that does not touch those paths.
 *
 * Job-level `if:` conditions are INFORMATIONAL only: a job skipped by a
 * job-level `if:` generally reports a "skipped" conclusion (not "pending"), so
 * it does not deadlock the way an unproduced context does — and the harness's
 * own review-gate jobs skip INTERNALLY at the step level precisely so their
 * context is always reported.
 *
 * WARN-ONLY: this guard never hard-fails on a deadlock-risk finding (exit 0),
 * to avoid a chicken-and-egg block when a context's producer is being added in
 * the same change (ADR 0006 D4). A present-but-unreadable/malformed ruleset is a
 * genuine error (exit 1, fail-closed per LRN-033).
 *
 * Usage:
 *   node scripts/check-ruleset-deadlock.mjs [--ruleset <path>] [--workflows-dir <dir>] [--quiet]
 *
 * Exit codes:
 *   0 — clean, or deadlock-risk WARNINGS only (advisory).
 *   1 — the ruleset file is present but unreadable / malformed (fail-closed).
 *   2 — bad CLI usage (unknown flag, or missing value for a value-taking flag).
 *
 * @module scripts/check-ruleset-deadlock.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const LINTER_NAME = 'check-ruleset-deadlock';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

let rulesetPath = null;
let workflowsDir = null;
let quiet = false;

const argv = process.argv.slice(2);

// requireValue guard (LRN-040): a value-taking flag must have a following token
// that exists and does not itself look like a flag; otherwise usage + exit 2.
function requireValue(args, i, flagName) {
  if (!args[i + 1] || args[i + 1].startsWith('-')) {
    process.stderr.write(`${LINTER_NAME}: missing value for ${flagName}\n`);
    process.exit(2);
  }
  return args[i + 1];
}

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--ruleset') {
    rulesetPath = requireValue(argv, i, '--ruleset');
    i++;
  } else if (a === '--workflows-dir') {
    workflowsDir = requireValue(argv, i, '--workflows-dir');
    i++;
  } else if (a === '--quiet') {
    quiet = true;
  } else if (a === '--help' || a === '-h') {
    process.stdout.write(
      'Usage: check-ruleset-deadlock.mjs [--ruleset <path>] [--workflows-dir <dir>] [--quiet]\n\n' +
      'Warn when a required status-check context cannot be reliably produced\n' +
      '(no producing job, or a workflow-level path filter can skip it) → deadlock.\n\n' +
      'Options:\n' +
      '  --ruleset <path>       Ruleset JSON (default: <cwd>/infra/main-protection-ruleset.json)\n' +
      '  --workflows-dir <dir>  Workflows dir (default: <cwd>/.github/workflows)\n' +
      '  --quiet                Suppress per-finding output; print only the summary\n' +
      '  --help                 Print this help text\n'
    );
    process.exit(0);
  } else {
    process.stderr.write(`${LINTER_NAME}: unknown flag: ${a}\n`);
    process.exit(2);
  }
}

if (!rulesetPath) {
  rulesetPath = path.join(process.cwd(), 'infra', 'main-protection-ruleset.json');
}
if (!workflowsDir) {
  workflowsDir = path.join(process.cwd(), '.github', 'workflows');
}

// ---------------------------------------------------------------------------
// Read + parse the ruleset (fail-closed, LRN-033)
// ---------------------------------------------------------------------------

let rulesetRaw;
try {
  rulesetRaw = fs.readFileSync(rulesetPath, 'utf8');
} catch (err) {
  // Do NOT gate the read behind existsSync (it also returns false on EACCES).
  // A genuinely absent ruleset is a no-op (nothing to check); any other read
  // error is fail-closed.
  if (err.code === 'ENOENT') {
    process.stdout.write(`${LINTER_NAME}: no ruleset at "${rulesetPath}" — nothing to check.\n`);
    process.stdout.write('\n✅ Linter passed\n');
    process.exit(0);
  }
  process.stderr.write(`${LINTER_NAME}: cannot read ruleset "${rulesetPath}": ${err.message}\n`);
  process.exit(1);
}

let ruleset;
try {
  ruleset = JSON.parse(rulesetRaw.replace(/^\uFEFF/, ''));
} catch (err) {
  process.stderr.write(`${LINTER_NAME}: malformed JSON in "${rulesetPath}": ${err.message}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Collect the required status-check contexts from the ruleset
// ---------------------------------------------------------------------------

/**
 * Walk the ruleset for every `required_checks` array and collect the context
 * strings (entries are either a bare string or an object with `.context`).
 *
 * @param {unknown} node
 * @param {Set<string>} out
 */
function collectRequiredContexts(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectRequiredContexts(item, out);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'required_checks' && Array.isArray(value)) {
      for (const entry of value) {
        const ctx = typeof entry === 'string' ? entry : entry && typeof entry === 'object' ? entry.context : null;
        if (typeof ctx === 'string' && ctx) out.add(ctx);
      }
    } else {
      collectRequiredContexts(value, out);
    }
  }
}

const requiredContexts = new Set();
collectRequiredContexts(ruleset, requiredContexts);

// ---------------------------------------------------------------------------
// Scan the workflow files for producing jobs + workflow-level path filters
//
// The parser is deliberately line-based and conservative: it collects standard
// two-space-indented job-ids under the top-level `jobs:` block plus each job's
// `name:` value, so an over-broad match errs toward NOT emitting a false
// "no producer" warning. It flags a workflow-level `paths:` / `paths-ignore:`
// filter (which can skip the whole workflow, and hence the check run).
// ---------------------------------------------------------------------------

/**
 * Parse one workflow file's text into { jobContexts:Set<string>, hasPathFilter:boolean }.
 * `jobContexts` = the set of names by which a produced check may be referenced
 * (job-id + `name:` display value). `hasPathFilter` = a workflow-level
 * paths/paths-ignore filter exists under `on:`.
 *
 * @param {string} text
 */
function parseWorkflow(text) {
  const lines = text.split(/\r?\n/);
  const jobContexts = new Set();
  let inJobs = false;
  let jobsIndent = -1;
  let onIndent = -1;
  let inOn = false;
  let onEvent = null;
  let currentJobIndent = -1;
  let hasPathFilter = false;

  for (const rawLine of lines) {
    // Ignore comment-only / blank lines for structural detection.
    const line = rawLine.replace(/\t/g, '  ');
    if (/^\s*#/.test(line) || line.trim() === '') continue;
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();

    // Top-level `on:` block (indent 0; accept a quoted "on":). Track it and the
    // current event so a paths filter is only counted for the pull_request
    // events that actually gate check-run creation (a `push.paths` filter, or a
    // paths filter on a non-PR event, must NOT flag a PR-required context).
    if (indent === 0 && /^["']?on["']?:/.test(trimmed)) {
      inOn = true;
      onIndent = 0;
      onEvent = null;
      inJobs = false;
      // Inline `on: pull_request` / `on: [push, pull_request]` — no nested paths.
      continue;
    }
    // Top-level `jobs:` block (indent 0).
    if (indent === 0 && /^jobs:\s*$/.test(trimmed)) {
      inJobs = true;
      jobsIndent = 0;
      inOn = false;
      continue;
    }
    // Any other indent-0 key closes both blocks.
    if (indent === 0 && /^["']?[A-Za-z0-9_.-]+["']?:/.test(trimmed)) {
      inOn = false;
      inJobs = false;
      continue;
    }

    if (inOn && indent > onIndent) {
      // Event keys sit one level under `on:` (e.g. `pull_request:`); their
      // paths/paths-ignore filters sit one level deeper. Only a filter under a
      // pull_request(_target) event can prevent the check run for a PR.
      const eventMatch = /^([A-Za-z_]+):/.exec(trimmed);
      if (indent === onIndent + 2 && eventMatch) {
        onEvent = eventMatch[1];
      } else if (
        /^paths(-ignore)?:/.test(trimmed) &&
        (onEvent === 'pull_request' || onEvent === 'pull_request_target')
      ) {
        hasPathFilter = true;
      }
      continue;
    }

    if (inJobs && indent > jobsIndent) {
      // A job-id is a key one level under `jobs:` (two-space indent in standard
      // workflows). Collect it, and — ONLY at the job's direct-child level — its
      // `name:` (the display context). A `name:` deeper than that is a STEP name
      // (which produces no status-check context) and must not be collected, or
      // the guard would falsely conclude a required context has a producer.
      const jobIdMatch = /^([A-Za-z0-9_.-]+):\s*$/.exec(trimmed);
      if (indent === jobsIndent + 2 && jobIdMatch) {
        jobContexts.add(jobIdMatch[1]);
        currentJobIndent = indent;
        continue;
      }
      const nameMatch = /^name:\s*(.+?)\s*$/.exec(trimmed);
      if (nameMatch && currentJobIndent >= 0 && indent === currentJobIndent + 2) {
        const value = nameMatch[1].replace(/^['"]/, '').replace(/['"]$/, '');
        if (value) jobContexts.add(value);
      }
    }
  }

  return { jobContexts, hasPathFilter };
}

let workflowFiles = [];
try {
  workflowFiles = fs
    .readdirSync(workflowsDir)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map((f) => path.join(workflowsDir, f));
} catch (err) {
  if (err.code !== 'ENOENT') {
    process.stderr.write(`${LINTER_NAME}: cannot read workflows dir "${workflowsDir}": ${err.message}\n`);
    process.exit(1);
  }
  // No workflows dir → every required context is a "no producer" candidate,
  // handled below (each context warns). That is the correct signal.
}

// context -> { producers:Set<file basename>, pathFilteredProducers:Set<file basename> }
const producerIndex = new Map();
for (const context of requiredContexts) {
  producerIndex.set(context, { producers: new Set(), pathFiltered: new Set() });
}

for (const file of workflowFiles) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    continue; // best-effort; unreadable workflow is skipped (not fatal)
  }
  const { jobContexts, hasPathFilter } = parseWorkflow(text);
  for (const context of requiredContexts) {
    if (jobContexts.has(context)) {
      producerIndex.get(context).producers.add(path.basename(file));
      if (hasPathFilter) producerIndex.get(context).pathFiltered.add(path.basename(file));
    }
  }
}

// ---------------------------------------------------------------------------
// Emit findings (warn-only)
// ---------------------------------------------------------------------------

const warnings = [];

function logWarn(msg) {
  warnings.push(msg);
  if (!quiet) process.stdout.write(`WARN: ${msg}\n`);
}

for (const context of [...requiredContexts].sort()) {
  const info = producerIndex.get(context);
  if (info.producers.size === 0) {
    logWarn(
      `required context "${context}" has NO producing workflow job in ${path.basename(workflowsDir)}/ ` +
      `(no job-id or job name matches). A required context with no producer stays "expected"/pending ` +
      `forever → the PR can never merge. Fix the ruleset context name or add/rename the job.`
    );
    continue;
  }
  if (info.pathFiltered.size > 0 && info.pathFiltered.size === info.producers.size) {
    logWarn(
      `required context "${context}" is produced ONLY by workflow(s) with a workflow-level ` +
      `paths/paths-ignore filter (${[...info.pathFiltered].join(', ')}). A PR that does not touch ` +
      `those paths will not create the check run → the required context stays pending → deadlock. ` +
      `Remove the path filter or do not require this context.`
    );
  }
}

// ---------------------------------------------------------------------------
// Summary + final status (warnings never fail the linter, per ADR 0006 D4)
// ---------------------------------------------------------------------------

process.stdout.write(
  `\n${LINTER_NAME}: ${requiredContexts.size} required context(s) checked, ` +
  `0 errors, ${warnings.length} warning(s)\n`
);
process.stdout.write('\n✅ Linter passed\n');
process.exit(0);
