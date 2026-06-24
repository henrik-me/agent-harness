/**
 * lib/review-checklist.mjs — shared orchestration core for the CS66
 * model-dispatch review verbs (`review-doc`, `perf-review`, `security-review`).
 *
 * Plan decision C66-6: the three PR-based verbs reuse ONE orchestration path,
 * the independence invariant, and the canonical reviewer-output validation;
 * they are advisory-exit by default (`--strict` to fail) and NEVER auto-invoke
 * a paid model without an explicit reviewer output being supplied.
 *
 * Reuse seams imported from lib/review.mjs (CS52) — see "Reuse seams":
 *   ReviewError, normalizeModelId, parseReviewerOutput, computeVerdict,
 *   assertReviewerAllowed, loadReviewConfig.
 *
 * Injectable-seam pattern (mirrors lib/review.mjs `__testSeam`): every flow
 * accepts a `seam` object so tests inject fakes; no direct child_process/fs in
 * the code paths the tests exercise bypasses the seam.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeTempDir } from './disposers.mjs';
import {
  ReviewError,
  parseReviewerOutput,
  computeVerdict,
  assertReviewerAllowed,
  loadReviewConfig,
} from './review.mjs';

export { ReviewError };

/**
 * Default real-IO seam. Tests pass their own object to avoid touching git/fs.
 */
export const defaultSeam = Object.freeze({
  now() {
    return Date.now();
  },
  getDiff({ cwd = process.cwd(), base = 'main', head = 'HEAD' } = {}) {
    const range = `${base}..${head}`;
    const res = spawnSync('git', ['diff', range], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 40 * 1024 * 1024,
    });
    if (res.error) {
      throw new ReviewError(`Failed to run 'git diff ${range}': ${res.error.message}`, 'io', { cause: res.error });
    }
    if (typeof res.status === 'number' && res.status !== 0) {
      const stderr = (res.stderr || '').toString().trim();
      throw new ReviewError(`'git diff ${range}' exited ${res.status}${stderr ? `: ${stderr}` : ''}.`, 'io');
    }
    return (res.stdout || '').toString();
  },
  /**
   * Resolve a git ref (default HEAD) to a full 40-hex SHA so the composed
   * prompt and CS40 validation operate on a concrete commit (B2).
   */
  resolveSha({ cwd = process.cwd(), ref = 'HEAD' } = {}) {
    const res = spawnSync('git', ['rev-parse', ref], { cwd, encoding: 'utf8' });
    if (res.error) {
      throw new ReviewError(`Failed to resolve ${ref} to a SHA: ${res.error.message}`, 'io', { cause: res.error });
    }
    if (typeof res.status === 'number' && res.status !== 0) {
      const stderr = (res.stderr || '').toString().trim();
      throw new ReviewError(`Failed to resolve ${ref} to a SHA: ${stderr || `git rev-parse exited ${res.status}`}`, 'io');
    }
    return (res.stdout || '').toString().trim();
  },
  /**
   * Validate a completed reviewer output against the CS40 schema by invoking
   * scripts/check-review-output.mjs (CLI-only — no exports) as a subprocess
   * (B1). The output is written to a provenance-safe temp dir from
   * lib/disposers.mjs (under os.tmpdir(), never under the repo) and cleaned up
   * in a finally. Returns the subprocess result; throws ReviewError('io') only
   * if the spawn itself failed.
   */
  validateReviewerOutput({ cwd = process.cwd(), outputText, round, base, head } = {}) {
    const { path: tmpDir, cleanup } = makeTempDir('harness-revout-');
    const tmpFile = path.join(tmpDir, 'reviewer-output.md');
    try {
      fs.writeFileSync(tmpFile, String(outputText ?? ''), 'utf8');
      const scriptPath = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '..',
        'scripts',
        'check-review-output.mjs',
      );
      const res = spawnSync(
        process.execPath,
        [scriptPath, '--review-output', tmpFile, '--round', round, '--base', base, '--head', head, '--quiet'],
        { cwd, encoding: 'utf8' },
      );
      if (res.error) {
        throw new ReviewError(`Failed to run check-review-output.mjs: ${res.error.message}`, 'io', { cause: res.error });
      }
      return { status: res.status ?? 1, stdout: res.stdout || '', stderr: res.stderr || '' };
    } finally {
      cleanup();
    }
  },
  readFile(filePath, encoding = 'utf8') {
    return fs.readFileSync(filePath, encoding);
  },
  log(message) {
    process.stdout.write(`${message}\n`);
  },
  warn(message) {
    process.stderr.write(`${message}\n`);
  },
});

/**
 * Extract the set of changed file paths from a unified diff so the checklist
 * can be scoped to the PR. Returns a de-duplicated, sorted array.
 */
export function extractChangedFiles(diff) {
  const files = new Set();
  const text = String(diff || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const re = /^diff --git a\/(.+?) b\/(.+)$/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    // N4 (Copilot) — never scope the checklist to /dev/null. For a deleted file
    // the b/ side is /dev/null, so fall back to the a/ side (the real path);
    // skip the entry entirely if both sides resolve to /dev/null.
    let p = m[2];
    if (p === '/dev/null' || p === 'dev/null') p = m[1];
    if (p && p !== '/dev/null' && p !== 'dev/null') files.add(p);
  }
  return [...files].sort();
}

function fence(body) {
  return ['```', String(body ?? ''), '```'].join('\n');
}

function normalizeChecklist(checklist, verb) {
  if (!Array.isArray(checklist) || checklist.length === 0) {
    throw new ReviewError(`runChecklistReview(${verb || '?'}): checklist must be a non-empty array.`, 'bad-input');
  }
  return checklist.map((item, idx) => {
    if (item && typeof item === 'object') {
      const id = String(item.id ?? `C${idx + 1}`);
      const title = String(item.title ?? '').trim();
      const detail = item.detail == null ? '' : String(item.detail).trim();
      if (!title) {
        throw new ReviewError(`runChecklistReview(${verb || '?'}): checklist item ${id} is missing a title.`, 'bad-input');
      }
      return { id, title, detail };
    }
    const title = String(item ?? '').trim();
    if (!title) {
      throw new ReviewError(`runChecklistReview(${verb || '?'}): checklist item ${idx + 1} is empty.`, 'bad-input');
    }
    return { id: `C${idx + 1}`, title, detail: '' };
  });
}

/**
 * Compose a reviewer prompt that (a) states the verb + reviewer model +
 * independence reminder, (b) lists the checklist items, (c) scopes to the diff,
 * (d) requests the canonical reviewer-output schema consumed by
 * parseReviewerOutput / scripts/check-review-output.mjs.
 */
export function composeChecklistPrompt({
  verb,
  checklist,
  diff = '',
  diffScope = null,
  reviewerModel,
  csId = null,
  implementerModels = [],
  repo = null,
  prNumber = null,
  analyzedHead = '<head-sha>',
} = {}) {
  const items = normalizeChecklist(checklist, verb);
  const implementers = [...new Set([...implementerModels].map((s) => String(s)))].sort();
  const target = [repo, prNumber != null ? `#${prNumber}` : null].filter(Boolean).join('');
  const scope = Array.isArray(diffScope) ? diffScope : extractChangedFiles(diff);

  // C1 (Copilot) — cap the embedded diff so the prompt does not dump MBs for a
  // large PR, and so the "truncated by the CLI" claim below is truthful. Mirror
  // lib/review.mjs gitCapture: 40 KiB + the same truncation marker.
  const MAX_DIFF_CHARS = 40 * 1024;
  const diffText = String(diff ?? '');
  const wasTruncated = diffText.length > MAX_DIFF_CHARS;
  const shownDiff = wasTruncated
    ? `${diffText.slice(0, MAX_DIFF_CHARS)}\n...[truncated by harness review]`
    : diffText;

  const lines = [
    `You are the independent ${verb} reviewer${csId ? ` for ${csId}` : ''}${target ? ` (${target})` : ''}.`,
    `Reviewer model: ${reviewerModel || '(default)'}`,
    '',
    'Independence invariant: your model must NOT appear in the implementer set below.',
    `Implementer models: ${implementers.length ? implementers.join(', ') : '(none parsed)'}`,
    '',
    `Run the ${verb} checklist below against the PR diff. Verify each item against`,
    'the shipped surfaces — do not rely on the diff being internally coherent.',
    '',
    `## ${verb} checklist`,
    ...items.map((it) => `- [${it.id}] ${it.title}${it.detail ? ` — ${it.detail}` : ''}`),
    '',
    'Changed files in scope:',
    fence(scope.length ? scope.join('\n') : '(no changed files detected)'),
    '',
    wasTruncated ? 'Diff under review (truncated at 40 KiB by the CLI):' : 'Diff under review:',
    fence(shownDiff || '(empty diff)'),
    '',
    'Output schema (must match exactly enough for harness review-output):',
    `Analyzed HEAD: ${analyzedHead}`,
    '',
    '## Per-file analysis',
    '- <path>: <one-line assessment for every changed file>',
    '',
    '## Findings',
    '- [Blocking|Non-blocking|Suggestion] <path>:<line>: <description>',
    '',
    'Verdict: Go|Needs-Fix|Block',
  ];
  return lines.join('\n');
}

function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ReviewError(`${name} must be a positive integer.`, 'bad-input', { value });
  }
}

/**
 * Shared flow for the three model-dispatch verbs.
 *
 * Advisory by default: with no `reviewerOutput`, NO model is invoked — the
 * function returns the composed prompt + dispatch plan (status 'planned').
 * When `reviewerOutput` is supplied (via flag/stdin), it is parsed and a
 * verdict computed; `strict` turns a non-Go verdict into a failing exit code.
 *
 * @returns {Promise<object>} one of:
 *   { status: 'planned',  exitCode: 0, verb, checklist, prompt, plan }
 *   { status: 'complete', exitCode: 0, verb, verdict, findings, prompt, plan }
 *   { status: 'no-go',    exitCode: 0|1, verb, verdict, findings, prompt, plan }
 */
export async function runChecklistReview({
  verb,
  checklist,
  cwd = process.cwd(),
  configPath = null,
  repo = null,
  prNumber,
  base = 'main',
  head = 'HEAD',
  reviewerModel = null,
  reviewerAgent = null,
  actor = 'harness-review',
  csId = null,
  implementerModels = [],
  dryRun = false,
  strict = false,
  quiet = false,
  reviewerOutput = null,
  round = 'R1',
  seam = defaultSeam,
} = {}) {
  if (typeof verb !== 'string' || verb.trim() === '') {
    throw new ReviewError('runChecklistReview requires a non-empty verb.', 'bad-input');
  }
  const items = normalizeChecklist(checklist, verb);
  assertPositiveInteger(prNumber, 'prNumber');
  if (reviewerOutput != null && typeof reviewerOutput !== 'string') {
    throw new ReviewError(`${verb}: reviewerOutput must be a string when provided.`, 'bad-input');
  }
  if (typeof round !== 'string' || !/^R\d+$/.test(round)) {
    throw new ReviewError(`${verb}: round must match /^R\\d+$/ (e.g. 'R1', 'R2'); got '${round}'.`, 'bad-input');
  }

  const config = loadReviewConfig({ cwd, configPath });
  const effectiveModel = reviewerModel || config.rubber_duck_model;

  // B2 — resolve the head ref to a concrete 40-hex SHA so the prompt requests
  // (and CS40 validation checks against) a real commit. Tolerate failure in
  // dry-run/advisory mode; fail closed when a verdict is being computed.
  let resolvedHead;
  try {
    resolvedHead = seam.resolveSha({ cwd, ref: head });
  } catch (err) {
    if (!dryRun && reviewerOutput != null) throw err;
    resolvedHead = null;
    if (!quiet) seam.warn(`${verb}: could not resolve '${head}' to a SHA (${err.message}); using '${head}' literally.`);
  }

  const implementerSet = new Set([...implementerModels].map((s) => String(s)));
  // Independence invariant (plan C66-6, Exit criterion 4): reviewer ∉ implementers.
  // B3 — fail closed when a real verdict is being recorded but no implementer
  // models are known (cannot verify independence). Advisory previews warn only.
  if (implementerSet.size === 0) {
    if (reviewerOutput != null) {
      throw new ReviewError(
        `${verb}: cannot verify reviewer independence — no implementer models supplied ` +
          `(--implementer-models) and none parsed from the PR body. Refusing to record a verdict.`,
        'independence',
      );
    }
    if (!quiet) {
      seam.warn(`${verb}: no implementer models supplied; cannot verify reviewer independence (advisory preview only).`);
    }
  } else {
    assertReviewerAllowed({
      reviewerModel: effectiveModel,
      implementerModels: implementerSet,
      csId,
      config,
    });
  }

  let diff = '';
  try {
    diff = seam.getDiff({ cwd, base, head, repo, prNumber }) || '';
  } catch (err) {
    if (!dryRun) throw err;
    diff = '';
    if (!quiet) seam.warn(`${verb}: diff unavailable in dry-run (${err.message}); composing plan without it.`);
  }
  const diffScope = extractChangedFiles(diff);

  const prompt = composeChecklistPrompt({
    verb,
    checklist: items,
    diff,
    diffScope,
    reviewerModel: effectiveModel,
    csId,
    implementerModels: implementerSet,
    repo,
    prNumber,
    analyzedHead: resolvedHead || head,
  });

  const plan = {
    verb,
    repo,
    prNumber,
    csId,
    reviewerModel: effectiveModel,
    reviewerAgent,
    actor,
    strict: Boolean(strict),
    checklistItemCount: items.length,
    checklistIds: items.map((it) => it.id),
    diffScope,
    independence: {
      reviewerModel: effectiveModel,
      implementerModels: [...implementerSet].sort(),
    },
  };

  // ADVISORY DEFAULT — no reviewer output: do NOT call any model.
  if (reviewerOutput == null) {
    if (!quiet) {
      seam.log(`# harness ${verb} — dispatch plan (advisory; no model invoked)`);
      seam.log(prompt);
    }
    return { status: 'planned', exitCode: 0, verb, checklist: items, prompt, plan };
  }

  // Reviewer output supplied — validate (B1) then parse + verdict.
  // CS40 validation (check-review-output.mjs) is the gate plan Exit criterion 1
  // requires: a bare "Verdict: Go" with no Analyzed-HEAD / per-file enumeration
  // must NOT be accepted. The validator is CLI-only, so it is invoked via the
  // seam as a subprocess; failure fails closed.
  const validation = seam.validateReviewerOutput({
    cwd,
    outputText: reviewerOutput,
    round,
    base,
    head: resolvedHead || head,
  });
  if (!validation || validation.status !== 0) {
    const detail = (validation?.stdout || validation?.stderr || '').toString().trim();
    throw new ReviewError(
      `${verb}: reviewer output failed CS40 validation (check-review-output exit ${validation?.status})${detail ? `: ${detail}` : ''}`.trim(),
      'bad-output',
    );
  }

  const parsed = parseReviewerOutput(reviewerOutput);
  const verdict = computeVerdict({ rubberDuck: parsed });
  const isGo = verdict.exitCode === 0;
  const status = isGo ? 'complete' : 'no-go';
  // Advisory by default: even a non-Go verdict exits 0 unless --strict.
  const exitCode = isGo ? 0 : strict ? 1 : 0;

  if (!quiet) {
    seam.log(`# harness ${verb} — ${verdict.outcome} (${verdict.reviewLogVerdict})`);
    seam.log(verdict.summary);
  }
  if (!isGo && exitCode === 0 && !quiet) {
    seam.warn(`${verb}: advisory mode — non-Go verdict reported but not failing (use --strict to fail).`);
  }

  return {
    status,
    exitCode,
    verb,
    verdict,
    findings: parsed.findings,
    analyzedHead: parsed.analyzedHead,
    prompt,
    plan,
  };
}
