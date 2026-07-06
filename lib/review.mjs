/**
 * lib/review.mjs — orchestration helpers for `harness review <pr>` (CS52).
 *
 * The v1 rubber-duck leg is intentionally manual: the CLI composes the
 * reviewer prompt, prints it for the orchestrator to dispatch to the approved
 * model, then consumes the pasted structured reviewer output. This avoids a
 * runtime dependency on any model-provider API while still centralising the
 * independence guard, Copilot engagement (delegated to lib/copilot-engage.mjs
 * since CS101), PR-body update, and verdict logic.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

import { engageCopilot, EngageError } from './copilot-engage.mjs';

export const COPILOT_LOGIN = 'copilot-pull-request-reviewer';
// CS113 (C113-1): the `## Model audit` **Reviewer agent** must be a REVIEWER
// identity that differs from the orchestrator/implementer agent-id, or A3
// (scripts/check-review-evidence.mjs — Implementer agent === Reviewer agent →
// fail) trips. `rubber-duck` is the established reviewer-agent convention
// (REVIEWS.md § 2.8; LRN-210). It is intentionally NOT the `actor` (which is
// the orchestrator id and equals the PR's Implementer agent).
export const DEFAULT_REVIEWER_AGENT = 'rubber-duck';
export const DEFAULT_REVIEW_CONFIG = Object.freeze({
  rubber_duck_model: 'gpt-5.5',
  fallback_model: 'sonnet-4.6',
  require_copilot_review: true,
  copilot_trigger: 'reviewer',
  review_timeout_minutes: 30,
  // CS61 (LRN-145 follow-up) — DEFERRED schema-vs-runtime divergence: the schema
  // default for high_risk_clickstops is THIS harness's own CS list
  // (["CS03","CS11",...]), which is meaningless in a consumer repo. This is
  // consumer-facing runtime code, so an empty default is correct here. Hence
  // lib/review.mjs is intentionally NOT migrated to the shared loadReviewsPolicy
  // reader for this field (which would adopt the schema CS-list default). See
  // LEARNINGS.md (deferred divergence) — do not "align to schema" silently.
  high_risk_clickstops: [],
});

const PASSING_RUBBER_DUCK_VERDICTS = new Set(['Go']);
const NON_GO_VERDICTS = new Set(['Needs-Fix', 'Block', 'No-Go']);
const REVIEWER_OUTPUT_VERDICT_RE = /^Verdict:\s+(Go|Needs-Fix|Block|No-Go)\s*$/im;
const ANALYZED_HEAD_RE = /^Analyzed HEAD:\s+([0-9a-f]{40})\s*$/im;
const FINDING_ROW_RE = /^-\s+\[(Blocking|Non-blocking|Suggestion)\]\s+(\S+):(\d+):\s+(.+)$/i;
const ROUND_RE = /^R\d+$/;
const CONTENT_BRANCH_RE = /^cs(\d+[a-z]?)\/(?!claim$|close-out$)[A-Za-z0-9][A-Za-z0-9._-]*$/i;
// CS68 (C68-3): non-clickstop maintenance branches that `harness review` may
// run against. Dependency-bump adoption uses `deps/<pkg>-<ver>` (C68-2); raw
// Dependabot branches are `dependabot/...`. Scoped npm packages start with '@'.
const MAINTENANCE_BRANCH_RE = /^(?:deps|dependabot)\/[\w@][\w.@/-]*$/i;

const PR_VIEW_FIELDS = ['body', 'headRefName', 'headRefOid', 'baseRefOid', 'labels', 'url', 'isCrossRepository'];

export class ReviewError extends Error {
  constructor(message, kind, extra = {}) {
    super(message, extra.cause ? { cause: extra.cause } : undefined);
    this.name = 'ReviewError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

export const __testSeam = {
  now() {
    return Date.now();
  },
  spawnSync(cmd, args, options) {
    return spawnSync(cmd, args, options);
  },
  // CS101: review's Copilot leg delegates to the hardened copilot-engage
  // `--add-reviewer` path (issue #422). Injected here so tests can drive the
  // delegation without a live GitHub round-trip.
  engageCopilot(params) {
    return engageCopilot(params);
  },
  readFile(filePath, encoding = 'utf8') {
    return fs.readFileSync(filePath, encoding);
  },
  writeFile(filePath, content, encoding = 'utf8') {
    fs.writeFileSync(filePath, content, encoding);
  },
  unlink(filePath) {
    fs.unlinkSync(filePath);
  },
};

export async function runReview({
  cwd = process.cwd(),
  configPath = null,
  repo = null,
  prNumber,
  reviewerModel = null,
  round = null,
  rubberDuckOnly = false,
  copilotOnly = false,
  dryRun = false,
  noPoll = false,
  timeoutMinutes = null,
  actor = 'harness-review',
  reviewerAgent = DEFAULT_REVIEWER_AGENT,
  rubberDuckOutput = null,
  promptRubberDuck = null,
  implementerModelsFlag = null,
  transportOpts = {},
} = {}) {
  assertPositiveInteger(prNumber, 'prNumber');
  if (rubberDuckOnly && copilotOnly) {
    throw new ReviewError('--rubber-duck-only and --copilot-only cannot be combined.', 'bad-input');
  }

  const config = loadReviewConfig({ cwd, configPath });
  const effectiveModel = reviewerModel || config.rubber_duck_model;
  const timeoutMs = minutesToMs(timeoutMinutes ?? config.review_timeout_minutes);
  const shouldRunCopilot = copilotOnly || (!rubberDuckOnly && config.require_copilot_review !== false);
  const repoSlug = repo || detectGitHubRepo(cwd);
  const [owner, repoName] = splitRepoSlug(repoSlug);

  if (dryRun) {
    return {
      status: 'dry-run',
      repo: repoSlug,
      prNumber,
      reviewerModel: effectiveModel,
      round: round || 'next',
      actions: describePlannedActions({ rubberDuckOnly, copilotOnly, noPoll, config, reviewerModel: effectiveModel }),
      exitCode: 0,
    };
  }

  const pr = fetchPrMetadata({ repo: repoSlug, prNumber });
  validateContentPr(pr, prNumber);

  // CS68 (C68-3): clickstop branches derive the CS id + read implementer models
  // from the matching clickstop file (UNCHANGED). A non-CS maintenance branch
  // (deps/…, dependabot/…) has no cs<NN>/ id, so `extractCsIdFromBranch` throws
  // a bad-input "cannot derive CS id" ReviewError; only that signal routes to the
  // flag/PR-body resolver. findClickstopFile / read failures on a real cs<NN>/
  // branch stay OUTSIDE the try so they still surface.
  let csId = null;
  try {
    csId = extractCsIdFromBranch(pr.headRefName);
  } catch (err) {
    if (!(err instanceof ReviewError && err.kind === 'bad-input')) throw err;
    csId = null;
  }

  let csFile = null;
  let implementerModels;
  if (csId !== null) {
    csFile = findClickstopFile({ cwd, csId });
    const csMarkdown = __testSeam.readFile(csFile, 'utf8');
    implementerModels = parseImplementerModels(csMarkdown);
  } else {
    implementerModels = resolveNonCsImplementerModels({
      flagRaw: implementerModelsFlag,
      prBody: pr.body ?? '',
      branch: pr.headRefName,
    });
  }

  assertReviewerAllowed({
    reviewerModel: effectiveModel,
    implementerModels,
    csId,
    config,
  });

  const effectiveRound = round || inferNextReviewRound(pr.body || '');
  const prompt = composeRubberDuckPrompt({
    cwd,
    repo: repoSlug,
    prNumber,
    pr,
    csId,
    csFile,
    round: effectiveRound,
    reviewerModel: effectiveModel,
    implementerModels,
  });

  if (noPoll) {
    // In manual-MVP mode, returning `rubberDuckPrompt` is the dispatch
    // artefact the orchestrator pastes into the approved reviewer model.
    let copilotDispatch = null;
    if (shouldRunCopilot) {
      // CS101 (#422): request the Copilot reviewer via the hardened
      // copilot-engage `--add-reviewer` path (noPoll ⇒ request + verify, no
      // wait) rather than the ineffective @mention comment.
      copilotDispatch = await runEngageLeg({
        owner,
        repo: repoName,
        prNumber,
        opts: { ...transportOpts, noPoll: true, headSha: pr.headRefOid, cwd },
      });
    }
    return {
      status: 'dispatched',
      repo: repoSlug,
      prNumber,
      csId,
      csFile,
      round: effectiveRound,
      reviewerModel: effectiveModel,
      rubberDuckPrompt: copilotOnly ? null : prompt,
      copilotDispatch,
      exitCode: 0,
    };
  }

  // CS101 (C101-2): obtain + parse the rubber-duck output FIRST, then engage
  // Copilot AFTER a Go is parsed. `localGoAt` is the A5 ordering floor: the
  // Copilot review must post-date the local Go. Reused below as the
  // `## Review log` Go-row timestamp so the row and the poll floor agree.
  let rubberDuck = null;
  let localGoAt = null;
  if (!copilotOnly) {
    const output = rubberDuckOutput ?? await obtainRubberDuckOutput(promptRubberDuck, prompt);
    rubberDuck = parseReviewerOutput(output);
    if (!rubberDuck.analyzedHead) {
      rubberDuck.analyzedHead = pr.headRefOid;
    }
    if (PASSING_RUBBER_DUCK_VERDICTS.has(rubberDuck.verdict)) {
      localGoAt = new Date(__testSeam.now()).toISOString();
    }
  }

  let copilotReview = null;
  if (shouldRunCopilot) {
    // CS101 (C101-1): delegate to the hardened copilot-engage path (requests
    // via REST `--add-reviewer` with CS92 verify/re-add, then polls at HEAD).
    // For --copilot-only there is no local Go, so `submittedAfter` is omitted
    // and engage floors on its own request time.
    const engageOpts = {
      ...transportOpts,
      headSha: pr.headRefOid,
      timeoutMs,
      intervalMs: Math.min(30_000, Math.max(1_000, timeoutMs)),
      cwd,
    };
    if (localGoAt) engageOpts.submittedAfter = localGoAt;
    const engaged = await runEngageLeg({ owner, repo: repoName, prNumber, opts: engageOpts });
    copilotReview = engaged.review ?? null;
  }

  const verdict = computeVerdict({ rubberDuck, copilotReview });
  const updatedBody = updatePrBodyWithReview(pr.body || '', {
    round: effectiveRound,
    analyzedHead: rubberDuck?.analyzedHead || pr.headRefOid,
    actor,
    reviewerModel: effectiveModel,
    verdict: verdict.reviewLogVerdict,
    evidenceLink: evidenceLinkForRound(effectiveRound, rubberDuck, copilotReview),
    implementerModels,
    reviewerAgent,
    fallbackRationale: fallbackRationale(effectiveModel, config),
    // CS101 (#422 Copilot review): only stamp the row with the rubber-duck Go
    // moment when the LOGGED (combined) verdict is Go. A combined Needs-Fix
    // (e.g. Copilot CHANGES_REQUESTED) is determined AFTER Copilot's review, so
    // reusing `localGoAt` there would mis-timestamp it; fall back to `now()`
    // (null ⇒ appendReviewLogRow defaults to __testSeam.now()). The A5 poll
    // floor above still uses `localGoAt` independently.
    timestamp: verdict.reviewLogVerdict === 'Go' ? localGoAt : null,
    // CS113 (C113-2): the --copilot-only leg performs no fresh rubber-duck
    // review, so (a) SKIP the `## Review log` Go-row append — with no local Go
    // its timestamp falls back to record-time (`now()`), which post-dates the
    // Copilot review it records by ~1s and trips A5 (A16 already sources Copilot
    // evidence from GitHub, so the row is redundant); and (b) PRESERVE any
    // pre-existing rubber-duck `## Model audit` Reviewer model / Reviewer agent
    // instead of clobbering them with this run's defaults (LRN-197/210).
    skipReviewLog: copilotOnly,
    preserveReviewerIdentity: copilotOnly,
  });

  const bodyUpdate = writePrBody({ repo: repoSlug, prNumber, body: updatedBody, cwd });

  if (verdict.exitCode === 1) {
    throw new ReviewError(verdict.summary, 'no-go', {
      verdict,
      rubberDuck,
      copilotReview,
      bodyUpdate,
    });
  }

  return {
    status: 'complete',
    repo: repoSlug,
    prNumber,
    csId,
    csFile,
    round: effectiveRound,
    reviewerModel: effectiveModel,
    rubberDuck,
    copilotReview,
    bodyUpdate,
    verdict,
    exitCode: 0,
  };
}

export function loadReviewConfig({ cwd = process.cwd(), configPath = null } = {}) {
  const effectivePath = configPath || path.join(cwd, 'harness.config.json');
  let rawConfig = {};
  if (fs.existsSync(effectivePath)) {
    try {
      rawConfig = JSON.parse(fs.readFileSync(effectivePath, 'utf8').replace(/^\uFEFF/u, ''));
    } catch (err) {
      throw new ReviewError(`Failed to parse harness config at ${effectivePath}: ${err.message}`, 'bad-input', { cause: err });
    }
  }
  const reviews = rawConfig.reviews ?? {};
  if (reviews === null || typeof reviews !== 'object' || Array.isArray(reviews)) {
    throw new ReviewError('harness.config.json reviews must be an object when present.', 'bad-input');
  }
  return {
    ...DEFAULT_REVIEW_CONFIG,
    ...reviews,
    high_risk_clickstops: Array.isArray(reviews.high_risk_clickstops)
      ? reviews.high_risk_clickstops
      : DEFAULT_REVIEW_CONFIG.high_risk_clickstops,
  };
}

export function parseImplementerModels(markdown) {
  const models = new Set();
  const normalized = String(markdown || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (const value of findModelAuditValues(normalized, ['Implementer models', 'Plan author model(s)', 'Implementer model'])) {
    addModelList(models, value);
  }

  const planReview = extractSection(normalized, 'Plan review');
  if (planReview) {
    for (const row of parseMarkdownTableRows(planReview).dataRows) {
      const idx = parseMarkdownTableRows(planReview).headers.findIndex((h) => /^plan author model\(s\)$/i.test(h));
      if (idx >= 0 && row[idx]) addModelList(models, row[idx]);
    }
  }

  addLabelledImplementerModels(models, normalized);
  addStructuredLedgerModels(models, normalized);

  return models;
}

/**
 * CS68 (C68-3 / risk R4): resolve the implementer-model set for a non-clickstop
 * (deps/maintenance) PR, where there is no clickstop ledger to parse.
 *
 * Sources, in combination:
 *   - `flagRaw`: the `--implementer-models <csv>` value (parsed via the same
 *     `addModelList` splitter the ledger parser uses).
 *   - `prBody`: any `## Model audit` "Implementer models" rows already in the PR
 *     body (parsed via `parseImplementerModels`).
 *
 * Semantics:
 *   - Both present: the flag MUST be a superset of the body audit (compared by
 *     `normalizeModelId`). A flag that omits any audited model is a hard `policy`
 *     error — the flag must never silently shrink/overwrite the audited set. The
 *     resolved set is the union, which (given the verified superset) equals the
 *     flag set.
 *   - Exactly one present: that source is the resolved set.
 *   - Neither yields a model: a `bad-input` error naming the branch + remediation.
 */
export function resolveNonCsImplementerModels({ flagRaw = null, prBody = '', branch = '' } = {}) {
  const flagModels = new Set();
  if (typeof flagRaw === 'string' && flagRaw.trim() !== '') {
    addModelList(flagModels, flagRaw);
  }
  const bodyModels = parseImplementerModels(prBody);

  if (flagModels.size > 0 && bodyModels.size > 0) {
    const flagKeys = new Set([...flagModels].map((m) => normalizeModelId(m)));
    const missing = [...bodyModels].filter((m) => !flagKeys.has(normalizeModelId(m)));
    if (missing.length > 0) {
      throw new ReviewError(
        `--implementer-models must never shrink the audited implementer set: it omits model(s) present in the PR body ## Model audit: ${missing.join(', ')}. `
        + `Pass a superset of the audited implementer models (${[...bodyModels].sort().join(', ')}).`,
        'policy',
        { flagModels: [...flagModels], bodyModels: [...bodyModels], missing },
      );
    }
    // Union of flag ∪ body; given the verified superset this equals the flag set
    // (keeping the flag's spelling on any normalized-id collision).
    return new Set(flagModels);
  }

  if (flagModels.size > 0) return flagModels;
  if (bodyModels.size > 0) return bodyModels;

  throw new ReviewError(
    `Cannot determine implementer models for non-CS branch '${branch}': `
    + 'provide --implementer-models <csv>, or add a ## Model audit table with an "Implementer models" row to the PR body.',
    'bad-input',
  );
}

export function assertReviewerAllowed({ reviewerModel, implementerModels, csId, config = DEFAULT_REVIEW_CONFIG } = {}) {
  if (!reviewerModel) {
    throw new ReviewError('Reviewer model is required.', 'bad-input');
  }
  const reviewerKey = normalizeModelId(reviewerModel);
  const implementerKeys = new Set([...implementerModels].map((m) => normalizeModelId(m)));
  if (implementerKeys.has(reviewerKey)) {
    throw new ReviewError(
      `Independence guard refused reviewer model '${reviewerModel}': it appears in the implementer model set (${[...implementerModels].join(', ')}).`,
      'policy',
      { reviewerModel, implementerModels: [...implementerModels] },
    );
  }

  const highRisk = new Set((config.high_risk_clickstops || []).map((id) => normalizeCsId(id)));
  if (normalizeModelId(reviewerModel) === normalizeModelId(config.fallback_model) && highRisk.has(normalizeCsId(csId))) {
    throw new ReviewError(
      `Fallback reviewer model '${reviewerModel}' is forbidden for HIGH-RISK ${csId}; retry ${config.rubber_duck_model} or record an explicit user waiver.`,
      'policy',
      { reviewerModel, csId },
    );
  }
  return true;
}

export function composeRubberDuckPrompt({
  cwd = process.cwd(),
  repo,
  prNumber,
  pr,
  csId,
  csFile,
  round,
  reviewerModel,
  implementerModels,
} = {}) {
  const diffStat = gitCapture(['diff', '--stat', `${pr.baseRefOid || 'main'}..HEAD`], cwd, 20_000);
  const diffNameOnly = gitCapture(['diff', '--name-only', `${pr.baseRefOid || 'main'}..HEAD`], cwd, 20_000);
  const diff = gitCapture(['diff', `${pr.baseRefOid || 'main'}..HEAD`], cwd, 40_000);
  const csRel = csFile ? path.relative(cwd, csFile) : null;
  const reviewTarget = csId || pr.headRefName;
  const implementerSource = csId ? 'the CS ledger' : '--implementer-models / PR-body ## Model audit';
  const implementers = [...implementerModels].sort().join(', ') || '(none parsed)';

  return [
    `You are the independent rubber-duck reviewer for ${reviewTarget} (${repo}#${prNumber}).`,
    `Reviewer model: ${reviewerModel}`,
    `Round: ${round}`,
    `Branch HEAD SHA: ${pr.headRefOid}`,
    '',
    'Independence invariant: your model must NOT appear in the implementer set below.',
    `Implementer models parsed from ${implementerSource}: ${implementers}`,
    '',
    'Required inputs to inspect:',
    `- Active CS file: ${csRel || 'N/A — non-CS (deps/maintenance) branch'}`,
    `- PR branch: ${pr.headRefName}`,
    `- Base SHA: ${pr.baseRefOid || '(unknown)'}`,
    `- Head SHA: ${pr.headRefOid}`,
    '',
    'Output schema (must match exactly enough for harness review-output):',
    `Analyzed HEAD: ${pr.headRefOid}`,
    '',
    '## Per-file analysis',
    '- <path>: <one-line assessment for every changed file in R1, or every delta file in later rounds>',
    '',
    '## Findings',
    '- [Blocking|Non-blocking|Suggestion] <path>:<line>: <description>',
    '',
    'Verdict: Go|Needs-Fix|Block',
    '',
    'Changed files:',
    fence(diffNameOnly || '(git diff --name-only produced no output)'),
    '',
    'Diff stat:',
    fence(diffStat || '(git diff --stat produced no output)'),
    '',
    'Diff (truncated at 40 KiB by the CLI):',
    fence(diff || '(git diff produced no output)'),
  ].join('\n');
}

export function parseReviewerOutput(output) {
  const text = String(output || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const verdictMatch = text.match(REVIEWER_OUTPUT_VERDICT_RE);
  const headMatch = text.match(ANALYZED_HEAD_RE);
  const findings = [];
  for (const line of text.split('\n')) {
    const m = line.trim().match(FINDING_ROW_RE);
    if (m) {
      findings.push({
        severity: canonicalSeverity(m[1]),
        file: m[2],
        line: Number.parseInt(m[3], 10),
        description: m[4],
      });
    }
  }
  return {
    text,
    verdict: verdictMatch ? canonicalVerdict(verdictMatch[1]) : 'Needs-Fix',
    analyzedHead: headMatch ? headMatch[1].toLowerCase() : null,
    findings,
    blockingCount: findings.filter((f) => f.severity === 'Blocking').length,
  };
}

export function computeVerdict({ rubberDuck = null, copilotReview = null } = {}) {
  const reasons = [];
  if (rubberDuck) {
    if (!PASSING_RUBBER_DUCK_VERDICTS.has(rubberDuck.verdict)) {
      reasons.push(`rubber-duck verdict is ${rubberDuck.verdict}`);
    }
    if ((rubberDuck.blockingCount || 0) > 0) {
      reasons.push(`${rubberDuck.blockingCount} blocking rubber-duck finding(s)`);
    }
  }
  if (copilotReview?.state === 'CHANGES_REQUESTED') {
    reasons.push('Copilot review requested changes');
  }
  if (reasons.length > 0) {
    return {
      outcome: 'No-Go',
      reviewLogVerdict: 'Needs-Fix',
      exitCode: 1,
      summary: `No-Go: ${reasons.join('; ')}`,
      reasons,
    };
  }
  return {
    outcome: 'Go',
    reviewLogVerdict: 'Go',
    exitCode: 0,
    summary: 'Go: no blocking findings reported by completed review legs.',
    reasons,
  };
}

export function updatePrBodyWithReview(body, opts) {
  const withAudit = upsertModelAudit(body, opts);
  // CS113 (C113-2): the --copilot-only leg must NOT append an orchestrator-actor
  // `## Review log` Go row. With no local Go the row's timestamp falls back to
  // record-time, which post-dates the Copilot review it records and trips A5
  // (findLatestLocalGoTimestamp does not exclude the orchestrator actor). A16
  // sources Copilot review evidence from GitHub, so the row is redundant.
  if (opts.skipReviewLog) return withAudit;
  return appendReviewLogRow(withAudit, opts).body;
}

export function appendReviewLogRow(body, {
  round = null,
  analyzedHead,
  actor,
  reviewerModel,
  verdict,
  evidenceLink = null,
  timestamp = null,
} = {}) {
  if (!analyzedHead || !actor || !reviewerModel || !verdict) {
    throw new ReviewError('appendReviewLogRow requires analyzedHead, actor, reviewerModel, and verdict.', 'bad-input');
  }
  const normalizedBody = String(body || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const sectionInfo = findOrCreateSection(normalizedBody, 'Review log', canonicalReviewLogSection());
  const section = sectionInfo.section;
  const table = parseMarkdownTableRows(section);
  if (table.headers.length === 0) {
    throw new ReviewError('## Review log table is malformed: missing header row.', 'bad-input');
  }
  const lowerHeaders = table.headers.map((h) => h.toLowerCase());
  const required = ['timestamp', 'analyzed_head', 'actor', 'model', 'verdict', 'evidence_link'];
  const missing = required.filter((h) => !lowerHeaders.includes(h));
  if (missing.length > 0) {
    throw new ReviewError(`## Review log table missing required columns: ${missing.join(', ')}`, 'bad-input');
  }
  const effectiveRound = round || inferNextReviewRound(normalizedBody);
  const effectiveEvidence = evidenceLink || `harness-review:${effectiveRound}`;
  const idx = (name) => lowerHeaders.indexOf(name);
  const roundIdx = lowerHeaders.indexOf('round');

  for (const row of table.dataRows) {
    const sameRound = roundIdx >= 0
      ? row[roundIdx] === effectiveRound
      : String(row[idx('evidence_link')] || '').includes(`harness-review:${effectiveRound}`);
    const sameKey =
      sameRound &&
      String(row[idx('analyzed_head')] || '').toLowerCase() === analyzedHead.toLowerCase() &&
      row[idx('actor')] === actor &&
      row[idx('model')] === reviewerModel &&
      row[idx('verdict')] === verdict;
    if (sameKey) return { body: normalizedBody, added: false, round: effectiveRound };
  }

  const values = {
    timestamp: new Date(timestamp ?? __testSeam.now()).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    round: effectiveRound,
    analyzed_head: analyzedHead,
    actor,
    model: reviewerModel,
    verdict,
    evidence_link: effectiveEvidence,
  };
  const cells = lowerHeaders.map((h) => values[h] ?? '');
  const newRow = `| ${cells.join(' | ')} |`;
  const updatedSection = insertTableRow(section, newRow);
  return {
    body: spliceSection(normalizedBody, sectionInfo, updatedSection),
    added: true,
    round: effectiveRound,
  };
}

export function inferNextReviewRound(body) {
  const text = String(body || '');
  let maxRound = 0;
  const roundRe = /\bR(\d+)\b/g;
  let m;
  const reviewLog = extractSection(text, 'Review log') || text;
  while ((m = roundRe.exec(reviewLog)) !== null) {
    const n = Number.parseInt(m[1], 10);
    if (Number.isInteger(n) && n > maxRound) maxRound = n;
  }
  if (maxRound > 0) return `R${maxRound + 1}`;
  const table = parseMarkdownTableRows(reviewLog);
  const rows = table.dataRows.filter((row) => row.some((cell) => cell.trim() !== ''));
  return `R${rows.length + 1}`;
}

function fetchPrMetadata({ repo, prNumber }) {
  const result = runGh(['pr', 'view', String(prNumber), '--repo', repo, '--json', PR_VIEW_FIELDS.join(',')]);
  if (result.status !== 0) {
    throw new ReviewError(`Failed to fetch PR metadata via gh: ${(result.stderr || '').trim()}`, 'transport', { result });
  }
  try {
    return JSON.parse(result.stdout);
  } catch (err) {
    throw new ReviewError(`gh pr view returned invalid JSON: ${err.message}`, 'transport', { cause: err });
  }
}

function validateContentPr(pr, prNumber) {
  const labels = new Set((pr.labels || []).map((label) => typeof label === 'string' ? label : label.name).filter(Boolean));
  if (labels.has('workboard-only')) {
    throw new ReviewError(`PR #${prNumber} is labeled workboard-only; harness review only applies to content PRs.`, 'bad-input');
  }
  if (pr.isCrossRepository === true) {
    throw new ReviewError(`PR #${prNumber} is from a fork; harness review requires maintainer-local content branches.`, 'bad-input');
  }
  if (!CONTENT_BRANCH_RE.test(pr.headRefName || '') && !MAINTENANCE_BRANCH_RE.test(pr.headRefName || '')) {
    throw new ReviewError(
      `PR #${prNumber} head branch must match cs<NN>/<slug> (clickstop) or deps/<pkg>-<ver> or dependabot/… (maintenance) for harness review; got '${pr.headRefName || '(unknown)'}'.`,
      'bad-input',
    );
  }
  if (!pr.headRefOid || !/^[0-9a-f]{40}$/i.test(pr.headRefOid)) {
    throw new ReviewError(`PR #${prNumber} metadata did not include a valid headRefOid.`, 'transport');
  }
}

export function findClickstopFile({ cwd, csId }) {
  // Normalize the target CS id (strips leading zeros: "CS02" -> "CS2"), then
  // normalize each candidate the same way, so the comparison is padding-
  // insensitive on BOTH sides. The prior version normalized only the target and
  // substring-matched it against raw filenames, so a branch-derived "CS02"
  // searched for "cs2_" and never matched the zero-padded file "…_cs02_…"
  // (issue #407).
  const target = normalizeCsId(csId).toLowerCase();
  const candidates = [];
  for (const subdir of ['active', 'planned', 'done']) {
    const dir = path.join(cwd, 'project', 'clickstops', subdir);
    // Read directly and discriminate ENOENT — existsSync() also returns false on
    // EACCES, which would silently mask a permission fault as "no clickstop".
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      if (err && err.code === 'ENOENT') continue;
      throw err;
    }
    // Match the canonical clickstop stem for this stage in both flat and
    // directory form (directory-form plans are first-class since CS70). Mirrors
    // the robust resolver lib/review-cs.mjs `locateClickstop`.
    const flatRe = new RegExp(`^${subdir}_cs(\\d+[a-z]?)_[a-z0-9][a-z0-9.-]*\\.md$`, 'i');
    const dirRe = new RegExp(`^${subdir}_cs(\\d+[a-z]?)_[a-z0-9][a-z0-9.-]*$`, 'i');
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isFile()) {
        const m = flatRe.exec(entry.name);
        if (m && normalizeCsId(`CS${m[1]}`).toLowerCase() === target) {
          candidates.push(path.join(dir, entry.name));
        }
      } else if (entry.isDirectory()) {
        const m = dirRe.exec(entry.name);
        if (!m || normalizeCsId(`CS${m[1]}`).toLowerCase() !== target) continue;
        // Directory-form clickstop: the plan file is the inner <dirname>.md.
        const innerPath = path.join(dir, entry.name, `${entry.name}.md`);
        let stat;
        try {
          stat = fs.statSync(innerPath);
        } catch (err) {
          if (err && err.code === 'ENOENT') continue;
          throw err;
        }
        if (stat.isFile()) candidates.push(innerPath);
      }
    }
  }
  if (candidates.length === 0) {
    throw new ReviewError(`Could not find clickstop file for ${csId} under project/clickstops/{active,planned,done}.`, 'bad-input');
  }
  if (candidates.length > 1) {
    // Fail closed on an ambiguous match (e.g. a flat + directory form for the
    // same CS, or the same id across stages) rather than silently returning a
    // readdir-order-dependent first hit — matches lib/review-cs.mjs locateClickstop.
    throw new ReviewError(
      `Ambiguous clickstop for ${csId}: expected exactly one match, found ${candidates.length} (${candidates.join(', ')}).`,
      'bad-input',
    );
  }
  return candidates[0];
}

function upsertModelAudit(body, opts) {
  const rows = {
    'Implementer models': [...(opts.implementerModels || [])].sort().join(', ') || '_(none parsed)_',
    'Reviewer model': opts.reviewerModel,
    // CS113 (C113-1): stamp a REVIEWER identity, never the orchestrator/actor id
    // (which equals the PR's Implementer agent and trips A3). No `opts.actor`
    // fallback, so a future caller cannot reintroduce the bug.
    'Reviewer agent': opts.reviewerAgent || DEFAULT_REVIEWER_AGENT,
  };
  if (opts.fallbackRationale) rows['Fallback rationale'] = opts.fallbackRationale;

  // CS113 (C113-2): the --copilot-only leg performs no fresh rubber-duck review,
  // so PRESERVE any pre-existing (real, non-placeholder) Reviewer model /
  // Reviewer agent rather than overwriting them with this run's defaults, which
  // would erase out-of-band rubber-duck evidence (LRN-197/210). A missing or
  // still-templated placeholder is left to the default stamping above so A3 (and
  // both legs of C113-1) still record a real reviewer identity.
  if (opts.preserveReviewerIdentity) {
    const [existingModel] = findModelAuditValues(body, ['Reviewer model']);
    const [existingAgent] = findModelAuditValues(body, ['Reviewer agent']);
    const [existingImplementerAgent] = findModelAuditValues(body, ['Implementer agent']);
    if (isRealAuditValue(existingModel)) delete rows['Reviewer model'];
    // CS113: preserve an existing Reviewer agent ONLY when it is genuine reviewer
    // evidence — real AND distinct from the Implementer agent (and the orchestrator
    // actor). A pre-existing `Reviewer agent == Implementer agent` (e.g. an old
    // `harness review` stamp) is the exact A3 breakage this CS fixes, so it must
    // NOT be preserved; fall through to the DEFAULT_REVIEWER_AGENT stamping above.
    if (
      isRealAuditValue(existingAgent) &&
      !equalsAuditAgent(existingAgent, existingImplementerAgent) &&
      !equalsAuditAgent(existingAgent, opts.actor)
    ) {
      delete rows['Reviewer agent'];
    }
  }

  const sectionInfo = findOrCreateSection(body, 'Model audit', canonicalModelAuditSection());
  const section = sectionInfo.section;
  const table = parseMarkdownTableRows(section);
  let updatedSection;
  if (table.headers.length < 2 || !table.headers.some((h) => /^field$/i.test(h)) || !table.headers.some((h) => /^value$/i.test(h))) {
    updatedSection = canonicalModelAuditSection(rows).trimEnd() + '\n';
  } else {
    updatedSection = upsertFieldValueRows(section, rows);
  }
  return spliceSection(body, sectionInfo, updatedSection);
}

function upsertFieldValueRows(section, rowsByField) {
  const lines = section.replace(/\s*$/u, '').split('\n');
  const tableLineIndexes = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^\|/.test(line.trim()));
  const headerCells = splitRow(tableLineIndexes[0].line);
  const fieldIdx = headerCells.findIndex((h) => /^field$/i.test(h));
  const valueIdx = headerCells.findIndex((h) => /^value$/i.test(h));
  const seen = new Set();
  for (let i = 2; i < tableLineIndexes.length; i++) {
    const { line, index } = tableLineIndexes[i];
    const cells = splitRow(line);
    const field = cells[fieldIdx] || '';
    const matchedKey = Object.keys(rowsByField).find((key) => key.toLowerCase() === field.toLowerCase());
    if (!matchedKey) continue;
    cells[valueIdx] = rowsByField[matchedKey];
    lines[index] = `| ${cells.join(' | ')} |`;
    seen.add(matchedKey);
  }
  const missing = Object.entries(rowsByField).filter(([key]) => !seen.has(key));
  if (missing.length > 0) {
    const insertAt = tableLineIndexes[tableLineIndexes.length - 1].index + 1;
    const newRows = missing.map(([field, value]) => {
      const cells = headerCells.map((h) => {
        if (/^field$/i.test(h)) return field;
        if (/^value$/i.test(h)) return value;
        return '';
      });
      return `| ${cells.join(' | ')} |`;
    });
    lines.splice(insertAt, 0, ...newRows);
  }
  return lines.join('\n') + '\n';
}

function writePrBody({ repo, prNumber, body, cwd }) {
  const tmpPath = path.join(cwd, `.harness-review-pr-${prNumber}-${process.pid}.md`);
  __testSeam.writeFile(tmpPath, body, 'utf8');
  try {
    const result = runGh(['pr', 'edit', String(prNumber), '--repo', repo, '--body-file', tmpPath], { cwd });
    if (result.status !== 0) {
      throw new ReviewError(`Failed to update PR body via gh pr edit: ${(result.stderr || '').trim()}`, 'transport', { result });
    }
    return { updated: true };
  } finally {
    try { __testSeam.unlink(tmpPath); } catch { /* ignore cleanup */ }
  }
}

function obtainRubberDuckOutput(provider, prompt) {
  if (typeof provider !== 'function') {
    throw new ReviewError(
      'Rubber-duck reviewer output is required. In MVP manual mode, dispatch the printed prompt and paste the structured output into stdin, or rerun with --no-poll after dispatching.',
      'manual-input-required',
      { prompt },
    );
  }
  return provider(prompt);
}

// CS113 (C113-2): distinguishes a REAL recorded audit value from an unfilled
// template placeholder (e.g. `_(fill via harness review)_`) or an empty cell,
// so the --copilot-only preserve path only protects genuine rubber-duck
// evidence and still lets the default stamping fill an unreviewed placeholder.
function isRealAuditValue(value) {
  const v = String(value ?? '').trim();
  return v !== '' && !/^_\(.*\)_$/.test(v);
}

// CS113 (C113-2): case-insensitive, whitespace-trimmed audit-agent equality,
// matching the A3 predicate (scripts/check-review-evidence.mjs:537-539 compares
// Implementer agent and Reviewer agent lower-cased). Empty/absent values never
// compare equal, so a missing Implementer-agent row does not, on its own, block
// preservation of a genuine reviewer identity.
function equalsAuditAgent(a, b) {
  const av = String(a ?? '').trim().toLowerCase();
  const bv = String(b ?? '').trim().toLowerCase();
  return av !== '' && av === bv;
}

function findModelAuditValues(markdown, fieldNames) {
  const result = [];
  const section = extractSection(markdown, 'Model audit') || markdown;
  const table = parseMarkdownTableRows(section);
  const fieldIdx = table.headers.findIndex((h) => /^field$/i.test(h));
  const valueIdx = table.headers.findIndex((h) => /^value$/i.test(h));
  if (fieldIdx >= 0 && valueIdx >= 0) {
    for (const row of table.dataRows) {
      const field = row[fieldIdx] || '';
      if (fieldNames.some((name) => name.toLowerCase() === field.toLowerCase())) {
        result.push(row[valueIdx] || '');
      }
    }
  }
  return result;
}

function addLabelledImplementerModels(models, markdown) {
  const labelRe = /\b(?:implementer[- ]models?|plan author model(?:\(s\)|s)?)\s*[:=]\s*([^|\n]+)/gi;
  let match;
  while ((match = labelRe.exec(markdown)) !== null) {
    addModelList(models, match[1]);
  }
}

function addStructuredLedgerModels(models, markdown) {
  for (const line of String(markdown || '').split('\n')) {
    if (!/\brole\s*=\s*(?:impl|implementer)\b/i.test(line)) continue;
    const bareModelRe = /\bmodel\s*=\s*([A-Za-z0-9_. -]+(?:\.[0-9]+)?)/gi;
    let match;
    while ((match = bareModelRe.exec(line)) !== null) {
      const before = line.slice(0, match.index);
      if (/\breviewer\s*$/i.test(before)) continue;
      addModelList(models, match[1]);
    }
  }
}

function addModelList(models, raw) {
  for (const part of String(raw || '').split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)) {
    if (/^(?:n\/a|none|—|-|_\(none\)_)/i.test(part)) continue;
    const cleaned = part.replace(/^`|`$/g, '').trim();
    if (looksLikeModel(cleaned)) models.add(cleaned);
  }
}

function looksLikeModel(value) {
  return /\b(?:gpt|sonnet|opus|haiku|claude)\b/i.test(value) && /\d/.test(value);
}

export function normalizeModelId(model) {
  const raw = String(model || '').trim().toLowerCase();
  const compact = raw
    .replace(/claude\s+/g, 'claude-')
    .replace(/\s+/g, '-')
    .replace(/_/g, '-')
    .replace(/--+/g, '-');
  const gpt = compact.match(/\bgpt-?(\d+(?:\.\d+)?)\b/);
  if (gpt) return `gpt-${gpt[1]}`;
  const claude = compact.match(/\b(?:claude-)?(sonnet|opus|haiku)-?(\d+(?:\.\d+)?)\b/);
  if (claude) return `${claude[1]}-${claude[2]}`;
  return compact;
}

function normalizeCsId(id) {
  const m = String(id || '').match(/CS\s*0*([0-9]+[a-z]?)/i);
  return m ? `CS${m[1]}` : String(id || '').toUpperCase();
}

function extractCsIdFromBranch(branch) {
  const m = String(branch || '').match(CONTENT_BRANCH_RE);
  if (!m) throw new ReviewError(`Cannot derive CS id from branch '${branch}'.`, 'bad-input');
  return `CS${m[1]}`;
}

function fallbackRationale(model, config) {
  return normalizeModelId(model) === normalizeModelId(config.fallback_model)
    ? `Fallback model used per REVIEWS.md §2.2; primary ${config.rubber_duck_model} unavailable or explicitly overridden.`
    : '';
}

function evidenceLinkForRound(round, rubberDuck, copilotReview) {
  if (rubberDuck?.analyzedHead) return `harness-review:${round}`;
  if (copilotReview?.submittedAt) return `copilot:${copilotReview.submittedAt}`;
  return `harness-review:${round}`;
}

function parseMarkdownTableRows(markdown) {
  const lines = String(markdown || '').split(/\r?\n/).filter((line) => /^\|/.test(line.trim()));
  if (lines.length === 0) return { headers: [], dataRows: [] };
  const headers = splitRow(lines[0]);
  const dataRows = [];
  for (let i = 1; i < lines.length; i++) {
    if (/^\|[\s\-:|]+\|?$/.test(lines[i].trim())) continue;
    dataRows.push(splitRow(lines[i]));
  }
  return { headers, dataRows };
}

function splitRow(row) {
  let s = row.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((cell) => cell.trim());
}

function extractSection(markdown, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^##\\s+${escaped}\\s*$\\n([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, 'im');
  const match = String(markdown || '').match(re);
  return match ? match[1] : null;
}

function findOrCreateSection(body, heading, defaultSection) {
  const text = String(body || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^##\\s+${escaped}\\s*$\\n[\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, 'im');
  const match = text.match(re);
  if (match) {
    const start = match.index;
    const end = start + match[1].length;
    return { section: match[1], start, end, created: false };
  }
  const insertAt = text.length;
  const prefix = text.endsWith('\n') ? '\n' : '\n\n';
  return { section: defaultSection, start: insertAt, end: insertAt, created: true, prefix };
}

function spliceSection(body, sectionInfo, newSection) {
  if (sectionInfo.created) {
    return body + (sectionInfo.prefix || '\n\n') + newSection.replace(/^\n+/, '');
  }
  return body.slice(0, sectionInfo.start) + newSection + body.slice(sectionInfo.end);
}

function insertTableRow(section, newRow) {
  const trimmed = section.replace(/\s*$/u, '');
  return `${trimmed}\n${newRow}\n`;
}

function canonicalReviewLogSection() {
  return [
    '## Review log',
    '',
    '| timestamp | analyzed_head | actor | model | verdict | evidence_link |',
    '|---|---|---|---|---|---|',
    '',
  ].join('\n');
}

function canonicalModelAuditSection(rows = {}) {
  const baseRows = {
    'Implementer models': rows['Implementer models'] || '_(fill via harness review)_',
    'Reviewer model': rows['Reviewer model'] || '_(fill via harness review)_',
    'Implementer agent': rows['Implementer agent'] || '_(GitHub username of implementer)_',
    'Reviewer agent': rows['Reviewer agent'] || '_(fill via harness review)_',
  };
  if (rows['Fallback rationale']) baseRows['Fallback rationale'] = rows['Fallback rationale'];
  return [
    '## Model audit',
    '',
    '| Field | Value |',
    '|---|---|',
    ...Object.entries(baseRows).map(([field, value]) => `| ${field} | ${value} |`),
    '',
  ].join('\n');
}

function canonicalSeverity(value) {
  const lower = String(value || '').toLowerCase();
  if (lower === 'blocking') return 'Blocking';
  if (lower === 'non-blocking') return 'Non-blocking';
  return 'Suggestion';
}

function canonicalVerdict(value) {
  const v = String(value || '').trim();
  if (/^no-go$/i.test(v)) return 'No-Go';
  const match = [...NON_GO_VERDICTS, ...PASSING_RUBBER_DUCK_VERDICTS].find((x) => x.toLowerCase() === v.toLowerCase());
  return match || 'Needs-Fix';
}

function detectGitHubRepo(cwd) {
  const result = __testSeam.spawnSync('git', ['remote', 'get-url', 'origin'], { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new ReviewError('Unable to auto-detect --repo from git remote origin; pass --repo <owner/repo>.', 'bad-input');
  }
  const parsed = parseGitHubRemote(result.stdout.trim());
  if (!parsed) {
    throw new ReviewError(`Unable to parse GitHub repo from origin remote '${result.stdout.trim()}'; pass --repo <owner/repo>.`, 'bad-input');
  }
  return parsed;
}

function parseGitHubRemote(remote) {
  let slug = null;
  if (remote.startsWith('git@github.com:')) slug = remote.slice('git@github.com:'.length);
  if (remote.startsWith('https://github.com/')) slug = remote.slice('https://github.com/'.length).split(/[?#]/, 1)[0];
  if (!slug) return null;
  if (slug.endsWith('.git')) slug = slug.slice(0, -4);
  try { return splitRepoSlug(slug).join('/'); } catch { return null; }
}

function splitRepoSlug(slug) {
  const parts = String(slug || '').split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new ReviewError(`Repository slug must be owner/repo; got '${slug}'.`, 'bad-input');
  }
  return parts;
}

function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) {
    throw new ReviewError(`${name} must be a positive integer; got '${value}'.`, 'bad-input');
  }
}

function minutesToMs(minutes) {
  const n = Number(minutes);
  if (!Number.isFinite(n) || n <= 0) {
    throw new ReviewError(`review timeout must be a positive number of minutes; got '${minutes}'.`, 'bad-input');
  }
  return n * 60 * 1000;
}

function runGh(args, options = {}) {
  const ghBin = process.env.HARNESS_REVIEW_GH_BIN;
  if (ghBin && /\.(?:mjs|js|cjs)$/i.test(ghBin)) {
    return __testSeam.spawnSync(process.execPath, [ghBin, ...args], { encoding: 'utf8', ...options });
  }
  return __testSeam.spawnSync(ghBin || 'gh', args, { encoding: 'utf8', ...options });
}

function gitCapture(args, cwd, maxChars) {
  const result = __testSeam.spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
  if (result.status !== 0) return '';
  const out = result.stdout || '';
  return out.length > maxChars ? `${out.slice(0, maxChars)}\n...[truncated by harness review]` : out;
}

function fence(content) {
  return `\`\`\`\n${String(content).replace(/\n?$/u, '\n')}\`\`\``;
}

function describePlannedActions({ rubberDuckOnly, copilotOnly, noPoll, config, reviewerModel = config.rubber_duck_model }) {
  const actions = [];
  if (!copilotOnly) actions.push(`compose manual rubber-duck prompt for ${reviewerModel}`);
  const shouldRunCopilot = copilotOnly || (!rubberDuckOnly && config.require_copilot_review !== false);
  if (shouldRunCopilot) actions.push('request the Copilot reviewer via the copilot-engage --add-reviewer path');
  else actions.push('skip Copilot review (reviews.require_copilot_review=false or --rubber-duck-only)');
  if (noPoll) actions.push('skip polling and PR-body update');
  else actions.push(`wait up to ${config.review_timeout_minutes} minute(s), compute verdict, update PR body`);
  return actions;
}

/**
 * Translate a `copilot-engage` EngageError into a ReviewError, preserving
 * review's documented 0/1/2 exit contract (CS101 C101-3). `bad-input` and
 * `timeout` map to the matching review kinds; every other engage failure
 * (`auth-missing`, `network`, `cache-write-failed`, `reviewer-not-requested`,
 * `reviewer-verify-unavailable`, `fork-source`) becomes `transport`, so
 * `reviewExitCode()` yields exit 2 — never a silent poll of an un-requested
 * reviewer. A genuine Copilot CHANGES_REQUESTED stays a review No-Go
 * (exit 1) via `computeVerdict`, not this path.
 */
function toReviewErrorFromEngage(err) {
  if (err instanceof ReviewError) return err;
  if (err instanceof EngageError) {
    const kind = err.kind === 'bad-input'
      ? 'bad-input'
      : err.kind === 'timeout'
        ? 'timeout'
        : 'transport';
    return new ReviewError(err.message, kind, { cause: err, engageKind: err.kind });
  }
  return new ReviewError(
    `Copilot engagement failed: ${err?.message ?? String(err)}`,
    'transport',
    { cause: err },
  );
}

/**
 * Run review's Copilot leg through the hardened `copilot-engage`
 * `--add-reviewer` path (injectable via `__testSeam.engageCopilot`),
 * translating any EngageError into a ReviewError (CS101 C101-1/3).
 */
async function runEngageLeg({ owner, repo, prNumber, opts }) {
  try {
    return await __testSeam.engageCopilot({ owner, repo, prNumber, opts });
  } catch (err) {
    throw toReviewErrorFromEngage(err);
  }
}
