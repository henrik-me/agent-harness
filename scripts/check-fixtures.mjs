#!/usr/bin/env node
/**
 * scripts/check-fixtures.mjs — CS13 (LRN-076).
 *
 * Detects test-fixture paths that are silently swallowed by `.gitignore`.
 *
 * Background (LRN-076): Test fixtures whose paths match a `.gitignore` rule
 * (e.g. `tests/fixtures/.../credentials.log` matching `*.log`) are never
 * committed. Locally on the dev machine the file exists in the working tree
 * and the test passes; on CI the file is absent and the test silently changes
 * shape — usually still asserts something, but not what the author intended.
 * This results in CI false-greens that go undetected for many CSes.
 *
 * The linter walks `tests/fixtures/` (or another `--dir`) and runs
 * `git check-ignore --no-index <path>` on every file/dir under it. Any path
 * that matches a `.gitignore` rule is reported as a violation.
 *
 * Usage:
 *   node scripts/check-fixtures.mjs --dir <path>
 *     [--quiet]   Suppress success stdout.
 *
 * Exit codes:
 *   0 — no violations.
 *   1 — at least one violation.
 *   2 — usage error.
 *
 * @module scripts/check-fixtures.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function parseArgs(argv) {
  const args = { dir: null, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir') {
      args.dir = argv[++i];
    } else if (a.startsWith('--dir=')) {
      args.dir = a.slice('--dir='.length);
    } else if (a === '--quiet') {
      args.quiet = true;
    } else if (a === '--help' || a === '-h') {
      args.help = true;
    } else {
      args._unknown = a;
    }
  }
  return args;
}

function usage() {
  return [
    'Usage: check-fixtures --dir <path> [--quiet]',
    '',
    'Reports any file under <path> that is matched by a .gitignore rule.',
    'Exit 0 = clean; 1 = violations; 2 = usage error.',
  ].join('\n');
}

function walk(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch (e) {
      continue;
    }
    for (const ent of entries) {
      const p = path.join(cur, ent.name);
      if (ent.isDirectory()) {
        // Skip .git and node_modules defensively.
        if (ent.name === '.git' || ent.name === 'node_modules') continue;
        stack.push(p);
      } else if (ent.isFile()) {
        out.push(p);
      }
    }
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }
  if (args._unknown) {
    console.error(`check-fixtures: unknown argument: ${args._unknown}`);
    console.error(usage());
    process.exit(2);
  }
  if (!args.dir) {
    console.error('check-fixtures: --dir is required');
    console.error(usage());
    process.exit(2);
  }

  const dir = path.resolve(args.dir);
  if (!fs.existsSync(dir)) {
    console.error(`check-fixtures: directory not found: ${dir}`);
    process.exit(2);
  }

  // Find the git root (walk up from `dir` looking for `.git/`).
  let gitRoot = dir;
  while (gitRoot !== path.dirname(gitRoot)) {
    if (fs.existsSync(path.join(gitRoot, '.git'))) break;
    gitRoot = path.dirname(gitRoot);
  }
  if (!fs.existsSync(path.join(gitRoot, '.git'))) {
    console.error(`check-fixtures: no .git found at or above ${dir}`);
    process.exit(2);
  }

  const files = walk(dir);
  if (files.length === 0) {
    if (!args.quiet) {
      console.log(`check-fixtures: 0 files under ${path.relative(gitRoot, dir) || dir}.`);
    }
    process.exit(0);
  }

  // Batch via stdin to git check-ignore (one path per line).
  const rels = files.map((f) => path.relative(gitRoot, f).split(path.sep).join('/'));
  const result = spawnSync(
    'git',
    ['check-ignore', '--stdin', '--no-index'],
    {
      cwd: gitRoot,
      input: rels.join('\n') + '\n',
      encoding: 'utf8',
      shell: false,
    },
  );

  // git check-ignore exit codes: 0 = at least one matched, 1 = none matched, 128 = error.
  if (result.status === 128) {
    console.error(`check-fixtures: git check-ignore failed: ${result.stderr.trim()}`);
    process.exit(2);
  }

  const ignored = result.stdout
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  if (ignored.length === 0) {
    if (!args.quiet) {
      console.log(`check-fixtures: ${files.length} fixture files checked, 0 violations.`);
    }
    process.exit(0);
  }

  for (const p of ignored) {
    console.error(
      `VIOLATION: ${p}: matched by .gitignore (would not be committed; test depending on it would silently false-green on CI). See LRN-076.`,
    );
  }
  console.error(
    `check-fixtures: ${files.length} fixture files checked, ${ignored.length} violation(s).`,
  );
  process.exit(1);
}

main();
