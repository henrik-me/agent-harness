/**
 * lib/review-doc.mjs — `harness review-doc <pr>` core (CS66 decision C66-2).
 *
 * Orchestrates a doc/prose-PR review that dispatches an independent reviewer
 * with the REVIEWS.md § 2.6a F1–F5 fact-claim checklist and emits the canonical
 * reviewer-output shape. Thin wrapper over runChecklistReview (C66-6).
 *
 * Fact-claim drift is the dominant doc-PR failure mode (REVIEWS § 2.6a,
 * verified on PR #218); making F1–F5 a verb removes reliance on the reviewer
 * remembering the checklist. The verb is a checklist harness, not an oracle
 * (plan risk R2) — it validates output shape/coverage, not reviewer judgment.
 */

import { runChecklistReview } from './review-checklist.mjs';

/**
 * The REVIEWS.md § 2.6a F1–F5 fact-claim checklist, quoted from the source of
 * truth. Each Go verdict on a doc/prose-heavy PR requires all five.
 */
export const REVIEW_DOC_CHECKLIST = Object.freeze([
  {
    id: 'F1',
    title: 'Every `--flag` mentioned exists in the CLI surface.',
    detail:
      "bin/harness.mjs (SUBCOMMAND_HELP blocks and cmdXxx argument parsers); " +
      'lib/<module>.mjs for behaviour; scripts/*.mjs for pass-through subcommands.',
  },
  {
    id: 'F2',
    title: 'Every file path mentioned exists in the tree (or is explicitly described as not-yet-existing).',
    detail: 'Repo filesystem at the analyzed HEAD.',
  },
  {
    id: 'F3',
    title:
      'Every doctrine-strength claim (required, mandatory, enforces, recommended, optional) matches the ' +
      "cited source's wording verbatim or via a documented synonym.",
    detail: 'Cited doc (OPERATIONS.md, REVIEWS.md, INSTRUCTIONS.md, README.md, etc.).',
  },
  {
    id: 'F4',
    title:
      'Every summary of a LEARNINGS.md or CS entry stays within the source entry stated scope. ' +
      'No generalisation beyond what the Problem / Finding / Decision text asserts.',
    detail: 'The LRN/CS entry itself.',
  },
  {
    id: 'F5',
    title:
      'Cross-doc claims are mutually consistent: if the diff says "OPERATIONS.md says X" or "the CLI does Y", ' +
      'OPERATIONS.md actually says X and the CLI actually does Y at the analyzed HEAD.',
    detail: 'The other doc(s) and code referenced.',
  },
]);

/**
 * Run the doc fact-claim review. Same opts/return contract as
 * runChecklistReview (see lib/review-checklist.mjs).
 *
 * @param {object} opts - all runChecklistReview opts except verb/checklist
 *   (those are fixed here): { cwd, configPath, repo, prNumber, base, head,
 *   reviewerModel, reviewerAgent, actor, csId, implementerModels, dryRun,
 *   strict, quiet, reviewerOutput, seam }.
 */
export async function runReviewDoc(opts = {}) {
  return runChecklistReview({ ...opts, verb: 'review-doc', checklist: REVIEW_DOC_CHECKLIST });
}
