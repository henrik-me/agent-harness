#!/usr/bin/env node
/**
 * scripts/check-templates.mjs — CS15d / CS08b.
 *
 * Detects template-authoring regressions captured by LRN-049, LRN-050, and
 * LRN-051.
 */

import fs from 'node:fs';
import path from 'node:path';

const USAGE = 'Usage: check-templates.mjs (--file <path> | --dir <path>) [--cwd <path>] [--quiet]\n';

function requireValue(args, i, flagName) {
  if (!args[i + 1] || args[i + 1].startsWith('-')) {
    process.stderr.write(`check-templates: missing value for ${flagName}\n`);
    process.stderr.write(USAGE);
    process.exit(2);
  }
}

function parseArgs(argv) {
  const args = {
    cwd: process.cwd(),
    file: null,
    dir: null,
    quiet: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file') {
      requireValue(argv, i, '--file');
      args.file = argv[++i];
    } else if (a === '--dir') {
      requireValue(argv, i, '--dir');
      args.dir = argv[++i];
    } else if (a === '--cwd') {
      requireValue(argv, i, '--cwd');
      args.cwd = argv[++i];
    } else if (a === '--quiet') {
      args.quiet = true;
    } else if (a === '--help' || a === '-h') {
      process.stdout.write(
        'Usage: check-templates.mjs (--file <path> | --dir <path>) [options]\n\n' +
        'Validate harness template files for forbidden dot-notation placeholders, relative-up paths, and PR-template self-reference tokens.\n\n' +
        'Options:\n' +
        '  --file <path>   File to scan\n' +
        '  --dir <path>    Directory to scan recursively\n' +
        '  --cwd <path>    Consumer root for relative path arguments and reports (default: process.cwd())\n' +
        '  --quiet         Suppress success stdout\n' +
        '  --help          Print this help text\n',
      );
      process.exit(0);
    } else {
      process.stderr.write(`check-templates: unknown flag: ${a}\n`);
      process.stderr.write(USAGE);
      process.exit(2);
    }
  }

  if ((args.file && args.dir) || (!args.file && !args.dir)) {
    process.stderr.write('check-templates: exactly one of --file or --dir is required\n');
    process.stderr.write(USAGE);
    process.exit(2);
  }

  return args;
}

function slashPath(p) {
  return p.split(path.sep).join('/');
}

function resolveFromCwd(cwd, target) {
  return path.resolve(cwd, target);
}

function relFromCwd(cwd, filePath) {
  const rel = path.relative(cwd, filePath) || path.basename(filePath);
  return slashPath(rel);
}

function isPrTemplatePath(relPath, basename) {
  return relPath.includes('template/managed/.github/') && basename.toLowerCase().includes('template');
}

function walkFiles(root) {
  const out = [];
  const stack = [root];
  while (stack.length > 0) {
    const cur = stack.pop();
    const entries = fs.readdirSync(cur, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(cur, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === 'node_modules') continue;
        stack.push(fullPath);
      } else if (entry.isFile()) {
        out.push(fullPath);
      }
    }
  }
  return out.sort((a, b) => slashPath(a).localeCompare(slashPath(b)));
}

function stripMarkdownNonScannable(line, state) {
  if (state.inFencedCode) {
    if (/^\s*```/.test(line)) state.inFencedCode = false;
    return '';
  }
  if (/^\s*```/.test(line)) {
    state.inFencedCode = true;
    return '';
  }

  let scan = line;
  if (state.inHtmlComment) {
    const close = scan.indexOf('-->');
    if (close === -1) return '';
    scan = scan.slice(close + 3);
    state.inHtmlComment = false;
  }
  while (true) {
    const open = scan.indexOf('<!--');
    if (open === -1) break;
    const close = scan.indexOf('-->', open + 4);
    if (close === -1) {
      scan = scan.slice(0, open);
      state.inHtmlComment = true;
      break;
    }
    scan = scan.slice(0, open) + scan.slice(close + 3);
  }
  scan = scan.replace(/`[^`]*`/g, '');
  return scan;
}

function lintFile(filePath, cwd) {
  const relPath = relFromCwd(cwd, filePath);
  const basename = path.basename(filePath);
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split('\n');
  const violations = [];
  const checkRule3 = isPrTemplatePath(relPath, basename);
  const state = { inFencedCode: false, inHtmlComment: false };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;
    const scan = stripMarkdownNonScannable(line, state);
    if (!scan) continue;

    for (const match of scan.matchAll(/(?<!\$)\{\{[^}]+\.[^}]+\}\}/g)) {
      violations.push(
        `check-templates: ${relPath}: line ${lineNumber}: dot-notation placeholder '${match[0]}' (LRN-049: use flat keys; dot-notation is emitted literally)`,
      );
    }

    if (/\.\.\//.test(scan)) {
      violations.push(
        `check-templates: ${relPath}: line ${lineNumber}: relative '../' path (LRN-050: scripts run from consumer cwd; relative-up paths break)`,
      );
    }

    if (checkRule3) {
      const tokenMatch = /(?:^|\s)(TODO|FIXME):/i.exec(scan);
      if (tokenMatch) {
        violations.push(
          `check-templates: ${relPath}: line ${lineNumber}: forbidden token '${tokenMatch[1].toUpperCase()}:' in PR-template (LRN-051: tokens self-reference into rendered docs)`,
        );
      }
    }
  }

  return violations;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = path.resolve(args.cwd);
  const targetArg = args.file ?? args.dir;
  const target = resolveFromCwd(cwd, targetArg);

  if (!fs.existsSync(target)) {
    process.stderr.write(`check-templates: target not found: ${targetArg}\n`);
    process.exit(1);
  }

  const stat = fs.lstatSync(target);
  let files;
  if (args.file) {
    if (!stat.isFile() || stat.isSymbolicLink()) {
      process.stderr.write(`check-templates: target not found: ${targetArg}\n`);
      process.exit(1);
    }
    files = [target];
  } else {
    if (!stat.isDirectory()) {
      process.stderr.write(`check-templates: target not found: ${targetArg}\n`);
      process.exit(1);
    }
    files = walkFiles(target);
  }

  const violations = files.flatMap((file) => lintFile(file, cwd));

  if (violations.length > 0) {
    for (const violation of violations) {
      process.stderr.write(`${violation}\n`);
    }
    process.stderr.write(
      `check-templates: ${files.length} files checked, ${violations.length} violation${violations.length === 1 ? '' : 's'}.\n`,
    );
    process.exit(1);
  }

  if (!args.quiet) {
    process.stdout.write(`check-templates: ${files.length} files checked, 0 violations.\n`);
  }
}

main();
