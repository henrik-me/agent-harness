#!/usr/bin/env node
/**
 * probe-active.mjs — CS readiness probe: active clickstop front-matter.
 *
 * Checks project/clickstops/active/ for an in-flight CS and validates that its
 * front-matter fields are populated. Passes when zero or exactly one active CS
 * exists and that file's Status, Owner, Branch, and Started fields are all set.
 *
 * Usage: node scripts/cs-probes/probe-active.mjs [--cwd <path>] [--quiet]
 * Exit codes: 0 = pass, 1 = fail, 2 = usage error
 */

import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Arg parsing helpers
// ---------------------------------------------------------------------------

function requireValue(args, i, flagName) {
  const next = args[i + 1];
  if (next === undefined || next.startsWith('-')) {
    process.stderr.write(`probe-active: flag ${flagName} requires a value\n`);
    process.exit(2);
  }
  return next;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

let cwd = process.cwd();
let quiet = false;

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  switch (argv[i]) {
    case '--cwd':
      cwd = requireValue(argv, i, '--cwd');
      i++;
      break;
    case '--quiet':
      quiet = true;
      break;
    case '--help':
    case '-h':
      process.stdout.write(
        'Usage: probe-active.mjs [--cwd <path>] [--quiet]\n\n' +
        'Validates project/clickstops/active/ for a single, well-formed active CS.\n\n' +
        'Exit codes: 0 = pass, 1 = fail, 2 = usage error\n',
      );
      process.exit(0);
      break;
    default:
      process.stderr.write(`probe-active: unknown flag: ${argv[i]}\n`);
      process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// Required front-matter fields
// ---------------------------------------------------------------------------

// TODO: customize — add extra required front-matter fields for your project
const REQUIRED_FIELDS = [
  { label: 'Status',  re: /\*\*Status:\*\*\s*(\S+)/,  expected: 'active' },
  { label: 'Owner',   re: /\*\*Owner:\*\*\s*(\S+)/ },
  { label: 'Branch',  re: /\*\*Branch:\*\*\s*(\S+)/ },
  { label: 'Started', re: /\*\*Started:\*\*\s*(\S+)/ },
];

const EMPTY_PLACEHOLDER = '—';

// ---------------------------------------------------------------------------
// File checker
// ---------------------------------------------------------------------------

function checkFile(filePath) {
  const issues = [];
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8')
      .replace(/^\uFEFF/, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
  } catch (err) {
    return [`cannot read file: ${err.message}`];
  }

  for (const field of REQUIRED_FIELDS) {
    const m = raw.match(field.re);
    if (!m) {
      issues.push(`missing required field **${field.label}:**`);
      continue;
    }
    const value = m[1];
    if (value === EMPTY_PLACEHOLDER) {
      issues.push(`field **${field.label}:** is not populated (value is "${EMPTY_PLACEHOLDER}")`);
      continue;
    }
    if (field.expected && value.toLowerCase() !== field.expected) {
      issues.push(`field **${field.label}:** is "${value}" (expected "${field.expected}")`);
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Probe logic
// ---------------------------------------------------------------------------

const activeDir = path.join(cwd, 'project', 'clickstops', 'active');

if (!fs.existsSync(activeDir)) {
  if (!quiet) process.stdout.write('probe-active: PASS — no active/ directory found\n');
  process.exit(0);
}

let entries;
try {
  entries = fs.readdirSync(activeDir, { withFileTypes: true });
} catch (err) {
  process.stderr.write(`probe-active: cannot read active/: ${err.message}\n`);
  process.exit(1);
}

const mdFiles = entries
  .filter(e => e.isFile() && e.name.endsWith('.md') && e.name !== '.gitkeep')
  .map(e => path.join(activeDir, e.name));

if (mdFiles.length === 0) {
  if (!quiet) process.stdout.write('probe-active: PASS — no active CS (zero .md files)\n');
  process.exit(0);
}

let failed = false;

if (mdFiles.length > 1) {
  process.stdout.write(
    `probe-active: FAIL — ${mdFiles.length} active CS files found; expected at most 1\n`,
  );
  failed = true;
}

for (const filePath of mdFiles) {
  const basename = path.basename(filePath);
  const issues = checkFile(filePath);
  if (issues.length > 0) {
    for (const issue of issues) {
      process.stdout.write(`probe-active: FAIL — ${basename}: ${issue}\n`);
    }
    failed = true;
  } else if (!quiet) {
    process.stdout.write(`probe-active: PASS — ${basename}: front-matter valid\n`);
  }
}

// TODO: customize — add additional consumer-defined front-matter checks here
// TODO: customize — integrate into pre-PR git hook: node scripts/cs-probes/probe-active.mjs

process.exit(failed ? 1 : 0);
