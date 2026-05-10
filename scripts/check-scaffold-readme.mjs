#!/usr/bin/env node
/**
 * Validate harness scaffold README pattern-doc structure.
 */

import fs from 'node:fs';
import path from 'node:path';

const REQUIRED_H2 = [
  '## When to use',
  '## What it ships',
  '## Customization points',
  '## How to invoke',
];

const USAGE = [
  'Usage: check-scaffold-readme.mjs --file <path> --name <scaffold-name> [--quiet]',
  '',
  'Validates scaffold README.md files.',
  'Exit 0 = clean; 1 = violations; 2 = usage error.',
  '',
].join('\n');

function requireValue(args, i, flagName) {
  if (!args[i + 1] || args[i + 1].startsWith('-')) {
    process.stderr.write(`check-scaffold-readme: missing value for ${flagName}\n`);
    process.stderr.write(USAGE);
    process.exit(2);
  }
}

function usageAndExit(message) {
  if (message) process.stderr.write(`${message}\n`);
  process.stderr.write(USAGE);
  process.exit(2);
}

function parseArgs(argv) {
  const parsed = {
    file: null,
    name: null,
    quiet: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--file') {
      requireValue(argv, i, '--file');
      parsed.file = argv[++i];
    } else if (arg === '--name') {
      requireValue(argv, i, '--name');
      parsed.name = argv[++i];
    } else if (arg === '--quiet') {
      parsed.quiet = true;
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else {
      usageAndExit(`check-scaffold-readme: unknown flag: ${arg}`);
    }
  }

  return parsed;
}

function relPath(filePath) {
  const rel = path.relative(process.cwd(), path.resolve(filePath));
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel)
    ? rel.split(path.sep).join('/')
    : filePath.split(path.sep).join('/');
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  if (!args.file) {
    usageAndExit('check-scaffold-readme: --file <path> is required');
  }

  if (!args.name) {
    usageAndExit('check-scaffold-readme: --name <scaffold-name> is required');
  }

  const target = path.resolve(args.file);
  if (!fs.existsSync(target)) {
    process.stderr.write(`check-scaffold-readme: target not found: ${args.file}\n`);
    process.exit(1);
  }

  let text;
  try {
    text = fs.readFileSync(target, 'utf8');
  } catch (err) {
    process.stderr.write(`check-scaffold-readme: could not read ${args.file}: ${err.message}\n`);
    process.exit(1);
  }

  const displayPath = relPath(target);
  const lines = text.split(/\r?\n/);
  const h1 = lines.find((line) => /^#\s/.test(line.trim()));
  const h2s = new Set(lines.filter((line) => /^##\s/.test(line.trim())).map((line) => line.trim()));
  const violations = [];

  const expectedH1 = `# Scaffold: ${args.name}`;
  if (!h1) {
    violations.push(`check-scaffold-readme: ${displayPath}: no H1 heading found`);
  } else {
    const actual = h1.trim();
    if (actual !== expectedH1) {
      violations.push(
        `check-scaffold-readme: ${displayPath}: H1 must be '${expectedH1}', got '${actual}'`,
      );
    }
  }

  for (const heading of REQUIRED_H2) {
    if (!h2s.has(heading)) {
      violations.push(
        `check-scaffold-readme: ${displayPath}: missing required H2 section '${heading}'`,
      );
    }
  }

  if (violations.length > 0) {
    for (const violation of violations) process.stderr.write(`${violation}\n`);
    process.exit(1);
  }

  if (!args.quiet) {
    process.stdout.write(`check-scaffold-readme: ${displayPath}: OK\n`);
  }
  process.exit(0);
}

main();
