#!/usr/bin/env node
/**
 * run-all.mjs — CS probes dispatcher.
 *
 * Discovers every probe-*.mjs script in this directory, runs each in a child
 * process (forwarding --cwd and --quiet), and prints a pass/fail summary.
 * Exits non-zero if any probe fails.
 *
 * Usage: node scripts/cs-probes/run-all.mjs [--cwd <path>] [--quiet]
 * Exit codes: 0 = all probes pass, 1 = one or more probes fail, 2 = usage error
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Arg parsing helpers
// ---------------------------------------------------------------------------

function requireValue(args, i, flagName) {
  const next = args[i + 1];
  if (next === undefined || next.startsWith('-')) {
    process.stderr.write(`run-all: flag ${flagName} requires a value\n`);
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
        'Usage: run-all.mjs [--cwd <path>] [--quiet]\n\n' +
        'Discovers and runs every probe-*.mjs in this directory.\n\n' +
        'Exit codes: 0 = all pass, 1 = any fail, 2 = usage error\n',
      );
      process.exit(0);
      break;
    default:
      process.stderr.write(`run-all: unknown flag: ${argv[i]}\n`);
      process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// TODO: customize — extend this list with additional probe scripts if you add
// probes that do not follow the probe-*.mjs naming convention
let probeFiles;
try {
  probeFiles = fs.readdirSync(__dirname)
    .filter(f => f.startsWith('probe-') && f.endsWith('.mjs'))
    .sort();
} catch (err) {
  process.stderr.write(`run-all: cannot read probe directory: ${err.message}\n`);
  process.exit(1);
}

if (probeFiles.length === 0) {
  if (!quiet) process.stdout.write('run-all: no probe-*.mjs files found\n');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

const results = [];

for (const probeFile of probeFiles) {
  const probePath = path.join(__dirname, probeFile);
  const probeArgs = ['--cwd', cwd];
  if (quiet) probeArgs.push('--quiet');

  const result = spawnSync(process.execPath, [probePath, ...probeArgs], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });

  const passed = result.status === 0;
  results.push({ name: probeFile, passed, stdout: result.stdout, stderr: result.stderr });

  if (!quiet || !passed) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const passCount = results.filter(r => r.passed).length;
const failCount = results.length - passCount;

process.stdout.write(
  `\nrun-all: ${results.length} probe(s) — ${passCount} passed, ${failCount} failed\n`,
);

if (failCount === 0) {
  if (!quiet) process.stdout.write('run-all: ✅ all probes passed\n');
  process.exit(0);
} else {
  process.stdout.write('run-all: ❌ some probes failed\n');
  // TODO: customize — integrate into pre-PR git hook: node scripts/cs-probes/run-all.mjs --quiet
  process.exit(1);
}
