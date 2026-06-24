/**
 * lib/security-review.mjs — `harness security-review <pr>` core (CS66 decision
 * C66-5, wave 2).
 *
 * A security review pass dispatching an independent reviewer with a concrete
 * security checklist scoped to the PR diff; emits the canonical reviewer-output
 * shape; advisory by default (plan C66-6). Encodes the security patterns the
 * harness already cares about (CS12 ref allowlists, CS56 realpath containment,
 * action SHA-pinning). Thin wrapper over runChecklistReview.
 */

import { runChecklistReview } from './review-checklist.mjs';

/**
 * Concrete, enumerated security checklist (plan C66-5). Scoped to the PR diff
 * (risk R3).
 */
export const SECURITY_REVIEW_CHECKLIST = Object.freeze([
  {
    id: 'S1',
    title: 'Hard-coded secrets.',
    detail: 'No tokens, API keys, passwords, or credentials committed in the diff.',
  },
  {
    id: 'S2',
    title: 'Command / path injection.',
    detail: 'Untrusted input is not interpolated into shell commands or filesystem paths without validation.',
  },
  {
    id: 'S3',
    title: 'Unsafe deserialization.',
    detail: 'No parsing of untrusted JSON/YAML/etc. into code execution or prototype pollution; fail-closed parsers.',
  },
  {
    id: 'S4',
    title: 'Workflow `permissions` least-privilege.',
    detail: 'GitHub Actions workflows declare minimal `permissions`; no blanket write-all tokens.',
  },
  {
    id: 'S5',
    title: 'Ref / `--body-file` containment.',
    detail: 'Refs are allowlisted (CS12) and file paths are realpath-contained (CS56); no traversal escape.',
  },
  {
    id: 'S6',
    title: 'Supply-chain pin drift.',
    detail: 'Third-party actions/dependencies are SHA- or version-pinned; no unpinned or drifted references.',
  },
]);

/**
 * Run the security review. Same opts/return contract as runChecklistReview
 * (see lib/review-checklist.mjs).
 */
export async function runSecurityReview(opts = {}) {
  return runChecklistReview({ ...opts, verb: 'security-review', checklist: SECURITY_REVIEW_CHECKLIST });
}
