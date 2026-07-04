/**
 * lib/review-cs.mjs — `harness review-cs <NN>` core (CS66 decision C66-3).
 *
 * A LOCAL, VERIFY-ONLY clickstop-readiness check. Given a clickstop number it
 * locates the single `planned`/`active`/`done` file for that CS, runs the two
 * harness clickstop linters as subprocesses, and aggregates their results into
 * one actionable "is this CS review-complete? what's missing?" report:
 *
 *   1. scripts/check-clickstop-plan-review.mjs — the `## Plan review`
 *      attestation gate (present, schema-valid, independent, hash-fresh, latest
 *      verdict Go/Go-with-amendments). Targeted at the located file via
 *      `--files`. Plan-review only lints planned/active files; for a `done` CS
 *      it is a no-op (the close-out gate covers that surface).
 *   2. scripts/check-clickstop.mjs — the lifecycle linter, which (among the
 *      core invariants) enforces the `## Plan-vs-implementation review` (PVI)
 *      close-out gate on active/done files. Run over the whole clickstops tree;
 *      findings are attributed to THIS CS by filtering the linter's per-file
 *      `ERROR: <subdir>/<basename>:` lines on the located file's label, so a
 *      sibling CS's failure never pollutes this CS's verdict.
 *
 * This is NOT a model-dispatch reviewer and does NOT reuse the `harness review`
 * PR orchestration (C66-3 / C66-6). No model, no `gh`, no network, no PR.
 *
 * Advisory by default: a missing/failing attestation prints the actionable
 * report but still exits 0. `--strict` (the `strict` option here) flips a
 * failing plan-review or PVI gate to a non-zero exit. Fail-closed: a CS that
 * cannot be uniquely located, a linter usage error, or a subprocess spawn
 * failure produces a clear stderr message and a non-zero exit — never a silent
 * pass.
 *
 * All filesystem + subprocess access goes through an injectable `seam` so the
 * tests run hermetically without touching the real linters or repo tree.
 *
 * The check-* scripts are resolved relative to THIS module via import.meta.url
 * because they are HARNESS code shipped with the CLI, not consumer-repo files
 * (so LRN-050, which concerns resolving CONSUMER files, does not apply). The
 * `--dir`/`--files` arguments ARE consumer-root-relative and run with the
 * consumer cwd.
 *
 * Zero runtime dependencies beyond Node 20+ stdlib.
 *
 * @module lib/review-cs.mjs
 */

import path from 'node:path';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findHeadingIndex, extractHeadingSectionBody } from './markdown-fence.mjs';

/** Clickstop lifecycle stages searched, in lookup order. */
const STAGES = ['planned', 'active', 'done'];

/** Directory holding the check-* linters, resolved relative to this module. */
const SCRIPTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts');

const PLAN_REVIEW_SCRIPT = path.join(SCRIPTS_DIR, 'check-clickstop-plan-review.mjs');
const LIFECYCLE_SCRIPT = path.join(SCRIPTS_DIR, 'check-clickstop.mjs');

/**
 * Default seam — real fs + child_process + process streams. Tests inject a
 * fake to drive every branch without spawning the real linters or writing
 * outside os.tmpdir().
 *
 * @typedef {object} ReviewCsSeam
 * @property {(cmd: string, args: string[], opts: object) =>
 *   {status: number|null, stdout: string, stderr: string, error?: Error}} spawnSync
 * @property {(dir: string) => string[]} readdir   - readdirSync-like.
 * @property {(p: string) => boolean}    exists    - existsSync-like.
 * @property {(p: string) => string}     readFile  - readFileSync(p,'utf8')-like.
 * @property {(s: string) => void}       stdout    - success/report writer.
 * @property {(s: string) => void}       stderr    - error/warning writer.
 */

/** @type {ReviewCsSeam} */
export const defaultSeam = {
  spawnSync,
  readdir: (dir) => readdirSync(dir),
  exists: (p) => existsSync(p),
  readFile: (p) => readFileSync(p, 'utf8'),
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
};

/**
 * Normalize a CS identifier to canonical `CS<NN>[suffix]` form.
 *
 * Accepts `CS66`, `cs66`, `66`, `66b`, `CS66b` — case-insensitive on the `cs`
 * prefix and the optional single trailing letter suffix.
 *
 * @param {string|number} raw
 * @returns {string} e.g. "CS66" or "CS22b".
 * @throws {Error} if `raw` is not a recognizable clickstop id.
 */
export function normalizeCsId(raw) {
  if (raw === undefined || raw === null || `${raw}`.trim() === '') {
    throw new Error('review-cs: a clickstop number is required (e.g. "66" or "CS66")');
  }
  const m = /^(?:cs)?(\d+)([a-z]?)$/i.exec(`${raw}`.trim());
  if (!m) {
    throw new Error(`review-cs: invalid clickstop id: "${raw}" (expected e.g. "66", "CS66", "22b")`);
  }
  return `CS${m[1]}${m[2].toLowerCase()}`;
}

/**
 * Locate the single clickstop file for `csId` under
 * `<cwd>/project/clickstops/{planned,active,done}`. Supports both the flat
 * form (`<stage>_cs<NN>_<slug>.md`) and the directory form
 * (`<stage>_cs<NN>_<slug>/<same>.md`).
 *
 * @param {string} cwd
 * @param {string} csId - normalized (e.g. "CS66").
 * @param {ReviewCsSeam} seam
 * @returns {Array<{stage: string, file: string, basename: string, label: string}>}
 */
export function locateClickstop(cwd, csId, seam) {
  const clickstopsDir = path.join(cwd, 'project', 'clickstops');
  const matches = [];
  for (const stage of STAGES) {
    const stageDir = path.join(clickstopsDir, stage);
    // C3 (Copilot) — read directly and discriminate ENOENT instead of gating on
    // exists()+swallowing every readdir error. A missing stage dir (ENOENT) is
    // benign (skip); any other error (EACCES, ENOTDIR, ...) is a real fault that
    // must propagate so runReviewCs can fail closed — never masked as "absent".
    let entries;
    try {
      entries = seam.readdir(stageDir);
    } catch (err) {
      if (err && err.code === 'ENOENT') continue;
      throw err;
    }
    const flatRe = new RegExp(`^${stage}_cs(\\d+[a-z]?)_([a-z0-9][a-z0-9.-]*)\\.md$`);
    const dirRe = new RegExp(`^${stage}_cs(\\d+[a-z]?)_([a-z0-9][a-z0-9.-]*)$`);
    for (const name of entries) {
      if (name.startsWith('.')) continue;

      const flat = flatRe.exec(name);
      if (flat) {
        if (`CS${flat[1]}` !== csId) continue;
        const file = path.join(stageDir, name);
        matches.push({ stage, file, basename: name, label: `${stage}/${name}` });
        continue;
      }

      const asDir = dirRe.exec(name);
      if (asDir) {
        if (`CS${asDir[1]}` !== csId) continue;
        // N3 (Copilot) — discriminate ENOENT instead of gating on exists(),
        // which masks EACCES. Read the inner directory and treat the inner
        // `<name>.md` as present iff it is among the entries. A missing inner
        // directory (ENOENT) is a benign skip; any other error (EACCES, ...)
        // propagates so runReviewCs can fail closed (mirrors C3 above).
        const innerDir = path.join(stageDir, name);
        let innerEntries;
        try {
          innerEntries = seam.readdir(innerDir);
        } catch (err) {
          if (err && err.code === 'ENOENT') continue;
          throw err;
        }
        const innerName = `${name}.md`;
        if (!innerEntries.includes(innerName)) continue;
        const innerMd = path.join(innerDir, innerName);
        const basename = innerName;
        matches.push({ stage, file: innerMd, basename, label: `${stage}/${basename}` });
      }
    }
  }
  return matches;
}

/**
 * Extract the linters' per-file `ERROR: <label>: ...` lines that belong to a
 * specific clickstop file (matched on its `<stage>/<basename>` label).
 *
 * @param {string} stdout
 * @param {string} label - e.g. "planned/planned_cs66_review-family-verbs.md".
 * @returns {string[]} error messages with the `ERROR: ` prefix stripped.
 */
function errorsForLabel(stdout, label) {
  if (!stdout) return [];
  return stdout
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.startsWith('ERROR:') && l.includes(label))
    .map((l) => l.replace(/^ERROR:\s*/, '').trim());
}

/**
 * Run a check-* linter through the seam and fail closed on usage / spawn
 * errors.
 *
 * @param {ReviewCsSeam} seam
 * @param {string} script
 * @param {string[]} args
 * @param {string} cwd
 * @returns {{status: number, stdout: string, stderr: string}}
 * @throws {Error} on spawn failure or a usage exit (code 2 / null status).
 */
function runLinter(seam, script, args, cwd) {
  const res = seam.spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' });
  if (!res || res.error) {
    const reason = res && res.error ? res.error.message : 'unknown spawn failure';
    throw new Error(`review-cs: failed to run ${path.basename(script)}: ${reason}`);
  }
  if (res.status === null || res.status === 2) {
    const detail = (res.stderr || res.stdout || '').trim();
    throw new Error(
      `review-cs: ${path.basename(script)} exited with a usage error (status ${res.status})` +
        (detail ? `:\n${detail}` : '')
    );
  }
  return { status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

/**
 * Directly verify the `## Plan-vs-implementation review` (PVI) close-out gate
 * on the located clickstop file (B4 backstop). This is a defense-in-depth
 * backstop that mirrors the gate logic in scripts/check-clickstop.mjs against
 * the file's content directly. (Historically check-clickstop.mjs skipped
 * directory-form CS files in its main loop, so this verb was the only PVI
 * coverage for them; CS75 added directory-form recursion to check-clickstop.mjs,
 * so this is now a redundant backstop rather than the sole coverage.)
 *
 * @param {string} content - the located file's full text.
 * @param {string} stage   - 'active' | 'done'.
 * @returns {string[]} problem detail lines (empty → the direct check passed).
 */
function directPviProblems(content, stage) {
  const problems = [];
  // C2 (Copilot) — fence-aware presence check: a `## Plan-vs-implementation
  // review` line that exists ONLY inside a code fence is not a real heading and
  // must be treated as MISSING (the old `^## ...$/m` regex matched inside
  // fences). CS75 (C75-2): the fence-aware locator now lives in the shared
  // lib/markdown-fence.mjs module (one CommonMark-correct implementation for
  // both this verb and scripts/check-clickstop.mjs).
  if (findHeadingIndex(content, 'Plan-vs-implementation review') === -1) {
    problems.push('PVI: "## Plan-vs-implementation review" H2 section missing (direct check)');
    return problems;
  }
  if (stage === 'done') {
    // Scope the field check to the PVI section BODY only — mirroring
    // scripts/check-clickstop.mjs extractSectionBody (the body runs from the H2
    // to the next `^#{1,2}\s` heading or EOF). Checking the whole file would
    // false-pass a done CS whose Reviewer/Date/Outcome live in another section
    // while the PVI section itself is empty (R2 finding).
    const body = extractPviSectionBody(content);
    const GRANDFATHERING =
      '> Grandfathered: closed before plan-vs-implementation review gate was introduced (CS03b).';
    const hasGrandfathering = body.includes(GRANDFATHERING);
    const hasAllFields =
      /^\*\*Reviewer:\*\*/m.test(body) && /^\*\*Date:\*\*/m.test(body) && /^\*\*Outcome:\*\*/m.test(body);
    if (!hasGrandfathering && !hasAllFields) {
      problems.push(
        'PVI: Reviewer/Date/Outcome field absent (direct check — expected verbatim ' +
          '"**Reviewer:**", "**Date:**", "**Outcome:**" or the grandfathering line)',
      );
    }
  }
  return problems;
}

/**
 * Extract the body of the `## Plan-vs-implementation review` section (fence-aware
 * start). Thin wrapper over the shared lib/markdown-fence.mjs extractor so the
 * direct backstop and scripts/check-clickstop.mjs share one implementation.
 *
 * @param {string} content
 * @returns {string} the section body ('' if the H2 is absent).
 */
function extractPviSectionBody(content) {
  return extractHeadingSectionBody(content, 'Plan-vs-implementation review');
}

/**
 * Extract the body of the `## Deliverables` section (fence-aware start). Thin
 * wrapper over the shared lib/markdown-fence.mjs extractor.
 *
 * @param {string} content
 * @returns {string} the section body ('' if the H2 is absent).
 */
function extractDeliverablesSectionBody(content) {
  return extractHeadingSectionBody(content, 'Deliverables');
}

/** File extensions that mark a backticked token as a filesystem path. */
const KNOWN_PATH_EXT = /\.(mjs|cjs|mts|cts|js|ts|md|json|ya?ml|txt|sh|toml|lock)$/i;

/**
 * Extract CONSERVATIVE deliverable-path tokens from a `## Deliverables` body.
 *
 * C75-4 / OQ1: to avoid false positives on prose-embedded or illustrative
 * paths, ONLY backtick-delimited spans are considered, and a span qualifies as
 * a path token only if it is a single whitespace-free token that either contains
 * a `/` or ends in a known file extension. Glob / placeholder tokens (`*`, `{}`)
 * are skipped — they never resolve to a single git-tracked file, so flagging
 * them would be a false positive. When in doubt, do NOT flag.
 *
 * @param {string} deliverablesBody
 * @returns {string[]} de-duplicated conservative path tokens.
 */
function extractConservativePathTokens(deliverablesBody) {
  const tokens = new Set();
  for (const rawLine of deliverablesBody.split('\n')) {
    for (const m of rawLine.matchAll(/`([^`\n]+)`/g)) {
      let tok = m[1].trim().replace(/[.,;:)\]]+$/, '');
      if (!tok || /\s/.test(tok)) continue;
      if (/[*{}]/.test(tok)) continue; // glob/placeholder — never one file
      const looksLikePath = tok.includes('/') || KNOWN_PATH_EXT.test(tok);
      if (!looksLikePath) continue;
      tokens.add(tok);
    }
  }
  return [...tokens];
}

/**
 * Build the set of git-tracked files (POSIX-relative) under `cwd`, or null if
 * it cannot be determined (non-git tree, git absent, spawn/usage failure). A
 * null return makes the advisory a no-op — it NEVER fails closed (C75-4).
 *
 * @param {string} cwd
 * @param {ReviewCsSeam} seam
 * @returns {Set<string>|null}
 */
function gitTrackedSet(cwd, seam) {
  let res;
  try {
    res = seam.spawnSync('git', ['-C', cwd, 'ls-files'], {
      encoding: 'utf8',
      // Large repos emit many MB of paths; the default 1MB cap would set
      // res.error and silently degrade the advisory to a no-op (Copilot review).
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null;
  }
  if (!res || res.error || res.status !== 0 || typeof res.stdout !== 'string') return null;
  const set = new Set();
  for (const line of res.stdout.split('\n')) {
    const p = line.trim();
    if (p) set.add(p);
  }
  return set;
}

/**
 * True if any tracked path begins with `prefix`. Iterates the Set directly — no
 * array copy, so there is no per-token re-spread and no doubled memory on large
 * repos (Copilot review findings).
 *
 * @param {Set<string>} tracked
 * @param {string} prefix
 * @returns {boolean}
 */
function anyTrackedWithPrefix(tracked, prefix) {
  for (const f of tracked) {
    if (f.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Best-effort deliverable-path existence advisory (C75-4). For each conservative
 * path token in the plan's `## Deliverables` section, flag any that does not
 * resolve to a git-tracked file (path-existence only — NOT manifest-membership,
 * which stays reviewer judgment per C75-3). ADVISORY ONLY: never fails closed,
 * never errors on parse/lookup ambiguity, never changes the verb's exit code.
 *
 * @param {string} content - the plan file's full text.
 * @param {string} cwd
 * @param {ReviewCsSeam} seam
 * @returns {string[]} advisory messages (empty → nothing to flag).
 */
function deliverablePathAdvisories(content, cwd, seam) {
  const body = extractDeliverablesSectionBody(content);
  if (!body) return [];
  const tokens = extractConservativePathTokens(body);
  if (tokens.length === 0) return [];
  const tracked = gitTrackedSet(cwd, seam);
  if (!tracked) return []; // cannot determine — never fail
  const advisories = [];
  for (const tok of tokens) {
    const norm = tok.replace(/\\/g, '/');
    let resolves;
    if (norm.endsWith('/')) {
      const prefix = norm;
      const exact = norm.slice(0, -1);
      resolves = tracked.has(exact) || anyTrackedWithPrefix(tracked, prefix);
    } else {
      resolves = tracked.has(norm) || anyTrackedWithPrefix(tracked, `${norm}/`);
    }
    if (!resolves) {
      advisories.push(
        `deliverable path "${tok}" does not resolve to a git-tracked file ` +
          '(advisory — path-existence only; confirm the target is a live shipped/' +
          'loaded surface per REVIEWS.md § 2.6c F2)'
      );
    }
  }
  return advisories;
}

/**
 * Build the human-readable aggregated report.
 *
 * @param {object} m - located file descriptor.
 * @param {{ok: boolean, details: string[]}} planReview
 * @param {{ok: boolean, details: string[]}} pvi
 * @param {string[]} advisories - non-blocking deliverable-path advisories.
 * @param {boolean} strict
 * @returns {string} report text ending with a trailing newline.
 */
function buildReport(m, planReview, pvi, advisories, strict) {
  const lines = [];
  lines.push(`review-cs ${m.csId} — ${m.stage} (${m.relFile})`);
  lines.push('');

  const section = (title, res) => {
    lines.push(`${title}: ${res.ok ? 'PASS' : 'FAIL'}`);
    for (const d of res.details) lines.push(`  - ${d}`);
  };
  section('Plan review', planReview);
  section('PVI gate', pvi);
  if (advisories && advisories.length > 0) {
    lines.push('');
    lines.push('Deliverable-path advisories (non-blocking):');
    for (const a of advisories) lines.push(`  - ${a}`);
  }
  lines.push('');

  const outstanding = (planReview.ok ? 0 : 1) + (pvi.ok ? 0 : 1);
  if (outstanding === 0) {
    lines.push('Result: review-complete');
  } else {
    const suffix = strict ? ' (--strict: exit 1)' : ' (advisory: exit 0)';
    lines.push(`Result: NOT review-complete — ${outstanding} item(s) outstanding${suffix}`);
  }
  return lines.join('\n') + '\n';
}

/**
 * Core of `harness review-cs <NN>`.
 *
 * @param {object} [opts]
 * @param {string} [opts.cwd]      - consumer repo root (default process.cwd()).
 * @param {string|number} opts.csId - clickstop id ("66", "CS66", "22b", ...).
 * @param {boolean} [opts.strict]  - exit 1 on a failing plan-review/PVI gate.
 * @param {boolean} [opts.quiet]   - suppress the success report on stdout.
 * @param {ReviewCsSeam} [opts.seam]
 * @returns {Promise<{
 *   status: 'complete'|'incomplete'|'error',
 *   exitCode: number,
 *   csId: string,
 *   file: string|null,
 *   state: string|null,
 *   planReview: {ok: boolean, details: string[]},
 *   pvi: {ok: boolean, details: string[]},
 *   report: string,
 *   error?: string,
 * }>}
 */
export async function runReviewCs({
  cwd = process.cwd(),
  csId,
  strict = false,
  quiet = false,
  seam = defaultSeam,
} = {}) {
  // 1. Normalize the CS id (fail closed on garbage input).
  let normalized;
  try {
    normalized = normalizeCsId(csId);
  } catch (err) {
    seam.stderr(`${err.message}\n`);
    return errorResult(`${csId}`, err.message);
  }

  // 2. Locate the single clickstop file. 0 or >1 → fail closed. A non-ENOENT
  // I/O fault during the scan (e.g. EACCES) propagates out of locateClickstop
  // (C3); convert it here into the structured fail-closed result so no stack
  // trace escapes the CLI wrapper (C4).
  let matches;
  try {
    matches = locateClickstop(cwd, normalized, seam);
  } catch (err) {
    seam.stderr(`review-cs: failed to scan clickstops for ${normalized}: ${err.message}\n`);
    return errorResult(normalized, `failed to scan clickstops: ${err.message}`);
  }
  if (matches.length === 0) {
    const msg = `review-cs: no clickstop file found for ${normalized} under project/clickstops/{planned,active,done}`;
    seam.stderr(`${msg}\n`);
    return errorResult(normalized, msg);
  }
  if (matches.length > 1) {
    const where = matches.map((x) => x.label).join(', ');
    const msg = `review-cs: ${normalized} is ambiguous — matched ${matches.length} files: ${where}`;
    seam.stderr(`${msg}\n`);
    return errorResult(normalized, msg);
  }

  const m = matches[0];
  m.csId = normalized;
  m.relFile = path.relative(cwd, m.file) || m.file;

  const clickstopsRel = path.join('project', 'clickstops');

  // 3. Run both linters via the seam. Fail closed on usage/spawn errors.
  let planRes;
  let lifeRes;
  try {
    planRes = runLinter(
      seam,
      PLAN_REVIEW_SCRIPT,
      ['--dir', clickstopsRel, '--files', m.relFile],
      cwd
    );
    lifeRes = runLinter(seam, LIFECYCLE_SCRIPT, ['--dir', clickstopsRel], cwd);
  } catch (err) {
    seam.stderr(`${err.message}\n`);
    return errorResult(normalized, err.message, m);
  }

  // 4a. Plan-review verdict for THIS file.
  const planErrors = errorsForLabel(planRes.stdout, m.label);
  // N5 (Copilot) — planOk must also require no extracted ERROR lines: a linter
  // can emit `ERROR: <label>: ...` while exiting 0, which would otherwise report
  // PASS while listing errors. Mirror pviOk's `lifeErrors.length === 0`.
  const planOk = planRes.status === 0 && planErrors.length === 0;
  let planDetails;
  if (planErrors.length > 0) {
    planDetails = planErrors;
  } else if (!planOk) {
    planDetails = ['plan-review check failed (see linter output)'];
  } else if (m.stage === 'done') {
    planDetails = ['(done: plan-review attestation not required here — covered by the close-out gate)'];
  } else {
    planDetails = ['attestation present, schema-valid, hash-fresh, latest verdict Go/Go-with-amendments'];
  }

  // 4b. PVI / lifecycle verdict for THIS file (filter by label so a sibling
  // CS's failure does not contaminate this CS's verdict). For active/done
  // files we ALSO verify the PVI gate directly (B4 backstop) because
  // check-clickstop.mjs skips directory-form CS files in its main loop.
  const lifeErrors = errorsForLabel(lifeRes.stdout, m.label);
  // Read the plan file ONCE and reuse it for BOTH the direct PVI check
  // (active/done — hard-fail on error) and the deliverable-path advisory
  // (best-effort) below, avoiding a redundant re-read (Copilot review finding).
  let fileContent = null;
  let fileReadErr = null;
  try {
    fileContent = seam.readFile(m.file);
  } catch (err) {
    fileReadErr = err;
  }

  let directProblems = [];
  if (m.stage === 'active' || m.stage === 'done') {
    if (fileContent === null) {
      const msg = `review-cs: failed to read ${m.relFile} for the direct PVI check: ${fileReadErr?.message ?? 'read failed'}`;
      seam.stderr(`${msg}\n`);
      return errorResult(normalized, msg, m);
    }
    directProblems = directPviProblems(fileContent, m.stage);
  }
  const pviOk = lifeErrors.length === 0 && directProblems.length === 0;
  let pviDetails;
  if (lifeErrors.length > 0 || directProblems.length > 0) {
    pviDetails = [...lifeErrors, ...directProblems];
  } else if (m.stage === 'planned') {
    pviDetails = ['(planned: ## Plan-vs-implementation review gate not required until active/done)'];
  } else {
    pviDetails = ['## Plan-vs-implementation review section present + complete'];
  }

  const planReview = { ok: planOk, details: planDetails };
  const pvi = { ok: pviOk, details: pviDetails };
  const complete = planOk && pviOk;

  // C75-4: best-effort deliverable-path existence advisory. ADVISORY ONLY — it
  // never fails the verb, never changes exitCode, never errors on parse/lookup
  // ambiguity. It is the cheap, non-semantic half of LRN-152 (does the path
  // exist at all); "live shipped/loaded surface" resolution stays reviewer
  // judgment (C75-3 / REVIEWS.md § 2.6c F2).
  let advisories = [];
  if (fileContent !== null) {
    try {
      advisories = deliverablePathAdvisories(fileContent, cwd, seam);
    } catch {
      advisories = []; // best-effort — a read failure must never fail the verb.
    }
  }

  const report = buildReport(m, planReview, pvi, advisories, strict);

  if (!quiet) seam.stdout(report);

  return {
    status: complete ? 'complete' : 'incomplete',
    exitCode: strict && !complete ? 1 : 0,
    csId: normalized,
    file: m.relFile,
    state: m.stage,
    planReview,
    pvi,
    advisories,
    report,
  };
}

/**
 * Build a fail-closed error result.
 *
 * @param {string} csId
 * @param {string} message
 * @param {object} [m] - located file descriptor, if known.
 * @returns {object}
 */
function errorResult(csId, message, m) {
  return {
    status: 'error',
    exitCode: 1,
    csId,
    file: m ? m.relFile || path.basename(m.file) : null,
    state: m ? m.stage : null,
    planReview: { ok: false, details: [] },
    pvi: { ok: false, details: [] },
    advisories: [],
    report: '',
    error: message,
  };
}
