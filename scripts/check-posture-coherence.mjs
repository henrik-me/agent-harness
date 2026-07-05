#!/usr/bin/env node
/**
 * scripts/check-posture-coherence.mjs — F4 posture-coherence guard (CS109 /
 * ADR 0006 D5, docs/adr/0006-review-enforcement-posture.md).
 *
 * When a repo's `review_gates.enforcement` posture is `required-check` or `both`,
 * the review-evidence status check is the (or a) gate that actually protects
 * `main`. But `gh pr merge --admin` — and any ruleset `bypass_actors` entry —
 * bypasses required *checks*, not only approvals. A repo that requires the check
 * yet still admits a bypass path is running a **decorative** gate.
 *
 * This guard WARNS (never hard-fails) when `enforcement` ∈ {required-check, both}
 * AND either:
 *   - the ruleset source grants one or more `bypass_actors` (a live bypass path), or
 *   - no ruleset source exists yet (the required-check posture is unrendered —
 *     run `harness sync --mode=apply`).
 *
 * `human-approval` (or an absent posture) is always coherent here: the evidence
 * check is advisory, so a bypass does not defeat a required gate.
 *
 * The enforcement value is read via lib/reviews-policy.mjs `loadReviewGatesEnforcement`
 * so this guard stays in lock-step with the renderer's presence semantics
 * (absent ⇒ no posture; fail-closed on a malformed value).
 *
 * Usage:
 *   node scripts/check-posture-coherence.mjs [--config <path>] [--ruleset <path>] [--quiet]
 *
 * Exit codes:
 *   0 — coherent, or coherence WARNINGS only (advisory).
 *   1 — the config or ruleset is present but unreadable / malformed (fail-closed).
 *   2 — bad CLI usage.
 *
 * @module scripts/check-posture-coherence.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadReviewGatesEnforcement, ReviewsConfigError } from '../lib/reviews-policy.mjs';

const LINTER_NAME = 'check-posture-coherence';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

let configPath = null;
let rulesetPath = null;
let quiet = false;

const argv = process.argv.slice(2);

function requireValue(args, i, flagName) {
  if (!args[i + 1] || args[i + 1].startsWith('-')) {
    process.stderr.write(`${LINTER_NAME}: missing value for ${flagName}\n`);
    process.exit(2);
  }
  return args[i + 1];
}

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--config') {
    configPath = requireValue(argv, i, '--config');
    i++;
  } else if (a === '--ruleset') {
    rulesetPath = requireValue(argv, i, '--ruleset');
    i++;
  } else if (a === '--quiet') {
    quiet = true;
  } else if (a === '--help' || a === '-h') {
    process.stdout.write(
      'Usage: check-posture-coherence.mjs [--config <path>] [--ruleset <path>] [--quiet]\n\n' +
      'Warn when review_gates.enforcement is required-check/both but a bypass path\n' +
      '(ruleset bypass_actors, or an unrendered ruleset) makes the required gate decorative.\n\n' +
      'Options:\n' +
      '  --config <path>   harness.config.json (default: <cwd>/harness.config.json)\n' +
      '  --ruleset <path>  Ruleset JSON (default: <cwd>/infra/main-protection-ruleset.json)\n' +
      '  --quiet           Suppress per-finding output; print only the summary\n' +
      '  --help            Print this help text\n'
    );
    process.exit(0);
  } else {
    process.stderr.write(`${LINTER_NAME}: unknown flag: ${a}\n`);
    process.exit(2);
  }
}

if (!configPath) {
  configPath = path.join(process.cwd(), 'harness.config.json');
}
if (!rulesetPath) {
  rulesetPath = path.join(process.cwd(), 'infra', 'main-protection-ruleset.json');
}

// ---------------------------------------------------------------------------
// Read the enforcement posture (fail-closed, via the shared reader)
// ---------------------------------------------------------------------------

let enforcement;
try {
  enforcement = loadReviewGatesEnforcement({ cwd: process.cwd(), configPath });
} catch (err) {
  if (err instanceof ReviewsConfigError) {
    // NOT_FOUND for an explicit config that is missing is a no-op (nothing to
    // check); every other ReviewsConfigError (malformed/invalid) is fail-closed.
    if (err.code === 'NOT_FOUND') {
      process.stdout.write(`${LINTER_NAME}: no config at "${configPath}" — nothing to check.\n`);
      process.stdout.write('\n✅ Linter passed\n');
      process.exit(0);
    }
    process.stderr.write(`${LINTER_NAME}: ${err.message}\n`);
    process.exit(1);
  }
  throw err;
}

const warnings = [];
function logWarn(msg) {
  warnings.push(msg);
  if (!quiet) process.stdout.write(`WARN: ${msg}\n`);
}

// A required-check posture is only in scope for the coherence check.
const requiresCheck = enforcement.present && (enforcement.value === 'required-check' || enforcement.value === 'both');

if (requiresCheck) {
  let rulesetRaw = null;
  try {
    rulesetRaw = fs.readFileSync(rulesetPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      logWarn(
        `review_gates.enforcement is "${enforcement.value}" (review-evidence is a REQUIRED check) but ` +
        `no ruleset source exists at "${rulesetPath}" — the required-check posture is UNRENDERED. ` +
        `Run 'harness sync --mode=apply' so the required contexts are actually in the ruleset.`
      );
    } else {
      process.stderr.write(`${LINTER_NAME}: cannot read ruleset "${rulesetPath}": ${err.message}\n`);
      process.exit(1);
    }
  }

  if (rulesetRaw !== null) {
    let ruleset;
    try {
      ruleset = JSON.parse(rulesetRaw.replace(/^\uFEFF/, ''));
    } catch (err) {
      process.stderr.write(`${LINTER_NAME}: malformed JSON in "${rulesetPath}": ${err.message}\n`);
      process.exit(1);
    }
    const bypass = Array.isArray(ruleset?.bypass_actors) ? ruleset.bypass_actors : [];
    if (bypass.length > 0) {
      logWarn(
        `review_gates.enforcement is "${enforcement.value}" (review-evidence is a REQUIRED check) but the ` +
        `ruleset grants ${bypass.length} bypass actor(s). A bypass actor — and 'gh pr merge --admin' — ` +
        `bypasses required CHECKS, not only approvals, so the required-check gate is DECORATIVE for them. ` +
        `Remove bypass_actors or document the deliberate exception.`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Summary + final status (warnings never fail the linter, per ADR 0006 D5)
// ---------------------------------------------------------------------------

const posture = enforcement.present ? enforcement.value : '(absent)';
process.stdout.write(
  `\n${LINTER_NAME}: enforcement=${posture}, 0 errors, ${warnings.length} warning(s)\n`
);
process.stdout.write('\n✅ Linter passed\n');
process.exit(0);
