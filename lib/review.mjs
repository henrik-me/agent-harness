/**
 * lib/review.mjs — orchestration helpers for `harness review <pr>` (CS52).
 *
 * The v1 rubber-duck leg is intentionally manual: the CLI composes the
 * reviewer prompt, prints it for the orchestrator to dispatch to the approved
 * model, then consumes the pasted structured reviewer output. This avoids a
 * runtime dependency on any model-provider API while still centralising the
 * independence guard, Copilot trigger, PR-body update, and verdict logic.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

import { graphql, GraphQLError } from './github-graphql.mjs';

export const COPILOT_LOGIN = 'copilot-pull-request-reviewer';
export const DEFAULT_REVIEW_CONFIG = Object.freeze({
  rubber_duck_model: 'gpt-5.5',
  fallback_model: 'sonnet-4.6',
  require_copilot_review: true,
  copilot_trigger: 'mention',
  review_timeout_minutes: 30,
  high_risk_clickstops: [],
});

const ACCEPTABLE_COPILOT_STATES = new Set(['APPROVED', 'COMMENTED', 'CHANGES_REQUESTED']);
const PASSING_RUBBER_DUCK_VERDICTS = new Set(['Go']);
const NON_GO_VERDICTS = new Set(['Needs-Fix', 'Block', 'No-Go']);
const REVIEWER_OUTPUT_VERDICT_RE = /^Verdict:\s+(Go|Needs-Fix|Block|No-Go)\s*$/im;
const ANALYZED_HEAD_RE = /^Analyzed HEAD:\s+([0-9a-f]{40})\s*$/im;
const FINDING_ROW_RE = /^-\s+\[(Blocking|Non-blocking|Suggestion)\]\s+(\S+):(\d+):\s+(.+)$/i;
const ROUND_RE = /^R\d+$/;

const PR_VIEW_FIELDS = ['body', 'headRefName', 'headRefOid', 'baseRefOid', 'labels', 'url'];
const REVIEW_QUERY = `query($owner:String!, $name:String!, $num:Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $num) {
      headRefOid
      reviews(last: 30) {
        nodes {
          state
          submittedAt
          commit { oid }
          author {
            __typename
            ... on Bot { login }
            ... on User { login }
          }
        }
      }
    }
  }
}`;

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
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },
  spawnSync(cmd, args, options) {
    return spawnSync(cmd, args, options);
  },
  graphqlFn(query, variables = {}, opts = {}) {
    return graphql(query, variables, opts);
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
  reviewerAgent = actor,
  rubberDuckOutput = null,
  promptRubberDuck = null,
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
  const csId = extractCsIdFromBranch(pr.headRefName);
  const csFile = findClickstopFile({ cwd, csId });
  const csMarkdown = __testSeam.readFile(csFile, 'utf8');
  const implementerModels = parseImplementerModels(csMarkdown);

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
    if (!copilotOnly) {
      // In manual-MVP mode, printing this prompt is the dispatch artefact.
      // The orchestrator pastes it into the approved reviewer model.
    }
    let copilotDispatch = null;
    if (shouldRunCopilot) {
      copilotDispatch = triggerCopilotReview({
        owner,
        repo: repoName,
        repoSlug,
        prNumber,
        trigger: config.copilot_trigger,
        cwd,
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

  const dispatchStartedAt = new Date(__testSeam.now()).toISOString();
  let copilotDispatch = null;
  if (shouldRunCopilot) {
    copilotDispatch = triggerCopilotReview({
      owner,
      repo: repoName,
      repoSlug,
      prNumber,
      trigger: config.copilot_trigger,
      cwd,
    });
  }

  let rubberDuck = null;
  if (!copilotOnly) {
    const output = rubberDuckOutput ?? await obtainRubberDuckOutput(promptRubberDuck, prompt);
    rubberDuck = parseReviewerOutput(output);
    if (!rubberDuck.analyzedHead) {
      rubberDuck.analyzedHead = pr.headRefOid;
    }
  }

  let copilotReview = null;
  if (shouldRunCopilot) {
    const poll = await pollForCopilotReview({
      owner,
      repo: repoName,
      prNumber,
      headSha: pr.headRefOid,
      submittedAfterIso: dispatchStartedAt,
      timeoutMs,
      intervalMs: Math.min(30_000, Math.max(1_000, timeoutMs)),
      opts: transportOpts,
    });
    if (poll.timedOut) {
      throw new ReviewError(
        `Timed out after ${Math.ceil(timeoutMs / 60000)} minute(s) waiting for Copilot review on ${repoSlug}#${prNumber}.`,
        'timeout',
        { timeoutMs, poll },
      );
    }
    copilotReview = poll.review;
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

  const ledgerModelRe = /\b(?:model|implementer-model|implementer model)\s*=\s*([A-Za-z0-9_. -]+(?:\.[0-9]+)?)/gi;
  let match;
  while ((match = ledgerModelRe.exec(normalized)) !== null) {
    addModelList(models, match[1]);
  }

  return models;
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
  const csRel = path.relative(cwd, csFile);
  const implementers = [...implementerModels].sort().join(', ') || '(none parsed)';

  return [
    `You are the independent rubber-duck reviewer for ${csId} (${repo}#${prNumber}).`,
    `Reviewer model: ${reviewerModel}`,
    `Round: ${round}`,
    `Branch HEAD SHA: ${pr.headRefOid}`,
    '',
    'Independence invariant: your model must NOT appear in the implementer set below.',
    `Implementer models parsed from the CS ledger: ${implementers}`,
    '',
    'Required inputs to inspect:',
    `- Active CS file: ${csRel}`,
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
  return appendReviewLogRow(withAudit, opts).body;
}

export function appendReviewLogRow(body, {
  round = null,
  analyzedHead,
  actor,
  reviewerModel,
  verdict,
  evidenceLink = null,
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
    timestamp: new Date(__testSeam.now()).toISOString().replace(/\.\d{3}Z$/, 'Z'),
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

export function triggerCopilotReview({ owner, repo, repoSlug, prNumber, trigger = 'mention', cwd = process.cwd() } = {}) {
  assertPositiveInteger(prNumber, 'prNumber');
  if (trigger !== 'mention' && trigger !== 'reviewer') {
    throw new ReviewError(`Unsupported reviews.copilot_trigger '${trigger}' (expected mention|reviewer).`, 'bad-input');
  }
  const args = trigger === 'mention'
    ? ['api', `repos/${owner}/${repo}/issues/${prNumber}/comments`, '-f', 'body=@copilot review']
    : ['pr', 'edit', String(prNumber), '--repo', repoSlug, '--add-reviewer', COPILOT_LOGIN];
  const result = runGh(args, { cwd });
  if (result.status !== 0) {
    throw new ReviewError(
      `Failed to trigger Copilot review via '${trigger}' (gh exit ${result.status}): ${(result.stderr || '').trim()}`,
      'transport',
      { result },
    );
  }
  return { trigger, requestedAt: new Date(__testSeam.now()).toISOString() };
}

export async function pollForCopilotReview({
  owner,
  repo,
  prNumber,
  headSha,
  submittedAfterIso = null,
  timeoutMs,
  intervalMs = 30_000,
  opts = {},
} = {}) {
  const startedAt = __testSeam.now();
  const submittedAfterMs = submittedAfterIso ? Date.parse(submittedAfterIso) : null;
  let attempts = 0;
  while (true) {
    attempts++;
    let data;
    try {
      data = await __testSeam.graphqlFn(REVIEW_QUERY, { owner, name: repo, num: prNumber }, opts);
    } catch (err) {
      throw toReviewError(err, `Failed to poll Copilot review for ${owner}/${repo}#${prNumber}`);
    }
    const pr = data?.repository?.pullRequest;
    if (!pr) {
      throw new ReviewError(`PR ${owner}/${repo}#${prNumber} was not found while polling.`, 'bad-input');
    }
    const review = findLatestCopilotReview(pr.reviews?.nodes ?? [], headSha, submittedAfterMs);
    const elapsedMs = Math.max(0, __testSeam.now() - startedAt);
    if (review) return { timedOut: false, review, attempts, elapsedMs };
    if (elapsedMs >= timeoutMs) return { timedOut: true, attempts, elapsedMs };
    await __testSeam.sleep(Math.min(intervalMs, timeoutMs - elapsedMs));
  }
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
  if (!/^cs\d+\/content$/i.test(pr.headRefName || '')) {
    throw new ReviewError(
      `PR #${prNumber} head branch must match cs<NN>/content for harness review; got '${pr.headRefName || '(unknown)'}'.`,
      'bad-input',
    );
  }
  if (!pr.headRefOid || !/^[0-9a-f]{40}$/i.test(pr.headRefOid)) {
    throw new ReviewError(`PR #${prNumber} metadata did not include a valid headRefOid.`, 'transport');
  }
}

function findClickstopFile({ cwd, csId }) {
  const lower = normalizeCsId(csId).toLowerCase();
  const candidates = [];
  for (const subdir of ['active', 'planned', 'done']) {
    const dir = path.join(cwd, 'project', 'clickstops', subdir);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.toLowerCase().includes(`${lower}_`)) {
        candidates.push(path.join(dir, entry.name));
      }
    }
  }
  if (candidates.length === 0) {
    throw new ReviewError(`Could not find clickstop file for ${csId} under project/clickstops/{active,planned,done}.`, 'bad-input');
  }
  return candidates[0];
}

function upsertModelAudit(body, opts) {
  const rows = {
    'Implementer models': [...(opts.implementerModels || [])].sort().join(', ') || '_(none parsed)_',
    'Reviewer model': opts.reviewerModel,
    'Reviewer agent': opts.reviewerAgent || opts.actor || 'harness-review',
  };
  if (opts.fallbackRationale) rows['Fallback rationale'] = opts.fallbackRationale;

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

function findLatestCopilotReview(reviews, headSha, submittedAfterMs) {
  return reviews
    .filter((review) => {
      if (!review || !ACCEPTABLE_COPILOT_STATES.has(review.state)) return false;
      if (review.commit?.oid !== headSha) return false;
      if (review.author?.__typename !== 'Bot' || review.author.login !== COPILOT_LOGIN) return false;
      if (submittedAfterMs !== null) {
        const submittedMs = Date.parse(review.submittedAt || '');
        if (!Number.isFinite(submittedMs) || submittedMs < submittedAfterMs) return false;
      }
      return true;
    })
    .sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt))[0] || null;
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
  const m = String(branch || '').match(/^cs(\d+[a-z]?)\/content$/i);
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
  if (shouldRunCopilot) actions.push(`trigger Copilot via ${config.copilot_trigger}`);
  else actions.push('skip Copilot review (reviews.require_copilot_review=false or --rubber-duck-only)');
  if (noPoll) actions.push('skip polling and PR-body update');
  else actions.push(`wait up to ${config.review_timeout_minutes} minute(s), compute verdict, update PR body`);
  return actions;
}

function toReviewError(err, message) {
  if (err instanceof ReviewError) return err;
  if (err instanceof GraphQLError) {
    return new ReviewError(`${message}: ${err.message}`, err.kind === 'auth-missing' ? 'transport' : 'transport', { cause: err });
  }
  return new ReviewError(`${message}: ${err?.message ?? String(err)}`, 'transport', { cause: err });
}
