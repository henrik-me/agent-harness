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
 * Find the line index of the REAL `## Plan-vs-implementation review` H2 — a
 * line matching /^## Plan-vs-implementation review\s*$/ that is NOT inside a
 * fenced code block. This mirrors the fence-aware "real heading" semantics of
 * scripts/check-clickstop.mjs (so a heading that exists only inside a ```/~~~
 * fence is treated as MISSING) but is reimplemented with Node builtins only —
 * lib/review-cs.mjs must stay dependency-free (cannot import doc-schema.mjs).
 *
 * Fence state toggles on any line whose trimmed form opens with a run of >=3
 * backticks or >=3 tildes. Per CommonMark, the fence closes only on a line that
 * is the SAME marker character, a run AT LEAST as long as the opening fence, and
 * nothing but fence characters — so an inner triple-backtick line does NOT close
 * a four-backtick outer fence (R6 finding).
 *
 * @param {string} content
 * @returns {number} line index of the real heading, or -1 if none exists.
 */
function findPviHeadingIndex(content) {
  const lines = String(content).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
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
      continue;
    }
    if (!inFence && /^## Plan-vs-implementation review\s*$/.test(lines[i])) {
      return i;
    }
  }
  return -1;
}

/**
 * Directly verify the `## Plan-vs-implementation review` (PVI) close-out gate
 * on the located clickstop file (B4 backstop). check-clickstop.mjs skips
 * directory-form CS files in its main loop (it only iterates `.md` files that
 * are direct directory entries — `entry.isFile()`), so a directory-form active/
 * done file escapes the PVI gate there. This mirrors the gate logic in
 * scripts/check-clickstop.mjs:284-312 against the file's content directly.
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
  // fences).
  if (findPviHeadingIndex(content) === -1) {
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
 * Extract the body of the `## Plan-vs-implementation review` section: the lines
 * after the H2 up to (but excluding) the next `# ` / `## ` heading or EOF.
 * Mirrors scripts/check-clickstop.mjs extractSectionBody semantics so the
 * direct backstop scopes field checks to the section, not the whole file.
 *
 * @param {string} content
 * @returns {string} the section body ('' if the H2 is absent).
 */
function extractPviSectionBody(content) {
  const lines = String(content).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  // C2 (Copilot) — start from the REAL (non-fenced) heading so the body scope
  // matches the fence-aware presence check above.
  const startIdx = findPviHeadingIndex(content);
  if (startIdx === -1) return '';
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^#{1,2}\s/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  return lines.slice(startIdx + 1, endIdx).join('\n');
}

/**
 * Build the human-readable aggregated report.
 *
 * @param {object} m - located file descriptor.
 * @param {{ok: boolean, details: string[]}} planReview
 * @param {{ok: boolean, details: string[]}} pvi
 * @param {boolean} strict
 * @returns {string} report text ending with a trailing newline.
 */
function buildReport(m, planReview, pvi, strict) {
  const lines = [];
  lines.push(`review-cs ${m.csId} — ${m.stage} (${m.relFile})`);
  lines.push('');

  const section = (title, res) => {
    lines.push(`${title}: ${res.ok ? 'PASS' : 'FAIL'}`);
    for (const d of res.details) lines.push(`  - ${d}`);
  };
  section('Plan review', planReview);
  section('PVI gate', pvi);
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
  let directProblems = [];
  if (m.stage === 'active' || m.stage === 'done') {
    let content;
    try {
      content = seam.readFile(m.file);
    } catch (err) {
      const msg = `review-cs: failed to read ${m.relFile} for the direct PVI check: ${err.message}`;
      seam.stderr(`${msg}\n`);
      return errorResult(normalized, msg, m);
    }
    directProblems = directPviProblems(content, m.stage);
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
  const report = buildReport(m, planReview, pvi, strict);

  if (!quiet) seam.stdout(report);

  return {
    status: complete ? 'complete' : 'incomplete',
    exitCode: strict && !complete ? 1 : 0,
    csId: normalized,
    file: m.relFile,
    state: m.stage,
    planReview,
    pvi,
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
    report: '',
    error: message,
  };
}
