#!/usr/bin/env node
/**
 * scripts/check-review-gates.mjs — CS51 review-gates installation linter.
 *
 * When harness.config.json has reviews.enforce_gates=true, verifies that the
 * consumer repo has the review-gates workflow and the four required status
 * check contexts in infra/main-protection-ruleset.json required_checks.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const REQUIRED_CONTEXTS = [
  'review-log-evidence',
  'copilot-review-attached',
  'independence-invariant',
  'review-threads-resolved',
];

const HELP = `Usage: check-review-gates.mjs --cwd <repo> [--config <file>] [--quiet]

Validate CS51 review-gates workflow + ruleset installation when
harness.config.json reviews.enforce_gates=true.

Options:
  --cwd <repo>      Consumer repo root (required)
  --config <file>   harness.config.json path (default: <cwd>/harness.config.json)
  --quiet           Suppress per-finding output; print only summary
  --help            Print this help text
`;

function requireValue(args, i, flag) {
  const value = args[i + 1];
  if (!value || value.startsWith('-')) {
    process.stderr.write(`check-review-gates: missing value for ${flag}\n${HELP}`);
    process.exit(2);
  }
  return value;
}

let cwd = null;
let configPath = null;
let quiet = false;

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === '--cwd') cwd = requireValue(argv, i++, '--cwd');
  else if (arg === '--config') configPath = requireValue(argv, i++, '--config');
  else if (arg === '--quiet') quiet = true;
  else if (arg === '--help' || arg === '-h') {
    process.stdout.write(HELP);
    process.exit(0);
  } else {
    process.stderr.write(`check-review-gates: unknown flag: ${arg}\n${HELP}`);
    process.exit(2);
  }
}

if (!cwd) {
  process.stderr.write(`check-review-gates: --cwd <repo> is required\n${HELP}`);
  process.exit(2);
}

cwd = path.resolve(cwd);
configPath = configPath ? path.resolve(configPath) : path.join(cwd, 'harness.config.json');

const errors = [];
function error(message) {
  errors.push(message);
  if (!quiet) process.stdout.write(`ERROR: ${message}\n`);
}

function readJson(file, label) {
  try {
    return JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (err) {
    error(`${label} is not valid JSON: ${err.message}`);
    return null;
  }
}

if (!existsSync(configPath)) {
  error(`harness.config.json not found at ${configPath}`);
} else {
  const config = readJson(configPath, 'harness.config.json');
  if (config) validate(config);
}

function validate(config) {
  if (config.reviews?.enforce_gates !== true) {
    if (!quiet) process.stdout.write('check-review-gates: skipped (reviews.enforce_gates is not true)\n');
    return;
  }

  const workflowRel = '.github/workflows/review-gates.yml';
  const workflowPath = path.join(cwd, ...workflowRel.split('/'));
  if (!existsSync(workflowPath)) {
    error(`${workflowRel} is missing; run harness sync --mode=apply.`);
  } else {
    const workflow = readFileSync(workflowPath, 'utf8');
    for (const context of REQUIRED_CONTEXTS) {
      if (!workflow.includes(context)) {
        error(`${workflowRel} does not reference required job/context ${context}.`);
      }
    }
  }

  if (!Array.isArray(config.managed?.files) || !config.managed.files.includes(workflowRel)) {
    error(`harness.config.json managed.files must include ${workflowRel} when reviews.enforce_gates=true.`);
  }

  const rulesetRel = 'infra/main-protection-ruleset.json';
  const rulesetPath = path.join(cwd, ...rulesetRel.split('/'));
  if (!existsSync(rulesetPath)) {
    error(`${rulesetRel} is missing; run harness sync --mode=apply to inject required_checks.`);
    return;
  }

  const ruleset = readJson(rulesetPath, rulesetRel);
  if (!ruleset) return;
  const checks = collectRequiredChecks(ruleset);
  for (const context of REQUIRED_CONTEXTS) {
    if (!checks.includes(context)) {
      error(`${rulesetRel} required_checks is missing ${context}; run harness sync --mode=apply.`);
    }
  }
}

function collectRequiredChecks(root) {
  const checks = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'required_checks' && Array.isArray(value)) {
        for (const entry of value) {
          if (typeof entry === 'string') checks.push(entry);
          else if (entry && typeof entry === 'object' && typeof entry.context === 'string') checks.push(entry.context);
        }
      } else {
        visit(value);
      }
    }
  };
  visit(root);
  return checks;
}

process.stdout.write(`check-review-gates: ${errors.length} error${errors.length === 1 ? '' : 's'}, 0 warnings\n`);
process.exit(errors.length > 0 ? 1 : 0);
