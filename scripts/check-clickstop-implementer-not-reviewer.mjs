#!/usr/bin/env node
/**
 * scripts/check-clickstop-implementer-not-reviewer.mjs — Agent identity independence linter.
 *
 * Scans active/ and done/ clickstop files for a `## Model audit` key-value
 * table. `Implementer agent` and `Reviewer agent` must be present and must
 * not match case-insensitively. Missing agent rows warn by default in v0.5.0;
 * pass --strict-agent-columns to turn the migration warning into an error.
 */

import fs from 'node:fs';
import path from 'node:path';
import { headingAnchor } from '../lib/doc-schema.mjs';

const LINTED_SUBDIRS = ['active', 'done'];

const HELP = `\
Usage: check-clickstop-implementer-not-reviewer.mjs [--cwd <dir>] [--strict-agent-columns] [--quiet] [--help]

Validate that ` + '`## Model audit`' + ` records distinct Implementer agent and Reviewer agent values.

Options:
  --cwd <dir>                 Consumer repo root (default: process.cwd())
  --strict-agent-columns      Treat missing Implementer/Reviewer agent rows as errors
  --quiet                     Suppress per-finding output; print only the summary
  --help                      Print this help text

Exit codes:
  0  pass (or warnings only with default --strict-agent-columns=false)
  1  agent-identity overlap detected (or strict mode + missing columns)
  2  bad usage
`;

let cwd = process.cwd();
let strictAgentColumns = false;
let quiet = false;

function requireValue(args, i, flagName) {
  if (!args[i + 1] || args[i + 1].startsWith('-')) {
    process.stderr.write(
      `check-clickstop-implementer-not-reviewer: missing value for ${flagName}\n${HELP}`
    );
    process.exit(2);
  }
  return args[i + 1];
}

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--cwd') {
    cwd = path.resolve(requireValue(argv, i, '--cwd'));
    i++;
  } else if (a.startsWith('--cwd=')) {
    const v = a.slice('--cwd='.length);
    if (!v) {
      process.stderr.write(`check-clickstop-implementer-not-reviewer: --cwd= requires a value\n${HELP}`);
      process.exit(2);
    }
    cwd = path.resolve(v);
  } else if (a === '--strict-agent-columns') {
    strictAgentColumns = true;
  } else if (a === '--quiet') {
    quiet = true;
  } else if (a === '--help' || a === '-h') {
    process.stdout.write(HELP);
    process.exit(0);
  } else {
    process.stderr.write(`check-clickstop-implementer-not-reviewer: unknown flag: ${a}\n${HELP}`);
    process.exit(2);
  }
}

if (!fs.existsSync(cwd)) {
  process.stderr.write(`check-clickstop-implementer-not-reviewer: --cwd directory not found: ${cwd}\n`);
  process.exit(2);
}

const errors = [];
const warnings = [];

function logError(msg) {
  errors.push(msg);
  if (!quiet) process.stdout.write(`ERROR: ${msg}\n`);
}

function logWarning(msg) {
  warnings.push(msg);
  if (!quiet) process.stdout.write(`WARN:  ${msg}\n`);
}

function parseTableRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((cell) => cell.trim());
}

function extractSectionWithLineNumber(content, anchor) {
  const lines = content.split('\n');
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^##\s+(.+?)\s*$/);
    if (m && headingAnchor(m[1].trim()) === anchor) {
      startIdx = i;
      break;
    }
  }
  if (startIdx === -1) return null;

  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^#{1,2}\s/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }

  return {
    body: lines.slice(startIdx + 1, endIdx).join('\n'),
    headingLine: startIdx + 1,
  };
}

function parseMarkdownTable(body) {
  const lines = body.split('\n');
  let headerCells = null;
  const dataRows = [];
  const rowLineOffsets = [];
  let sawSeparator = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stripped = line.trim();
    if (!stripped.startsWith('|')) continue;

    if (headerCells === null) {
      headerCells = parseTableRow(line);
      continue;
    }

    if (!sawSeparator) {
      if (/^\|[\s\-:|]+\|?$/.test(stripped)) {
        sawSeparator = true;
        continue;
      }
      dataRows.push(parseTableRow(line));
      rowLineOffsets.push(i);
      continue;
    }

    dataRows.push(parseTableRow(line));
    rowLineOffsets.push(i);
  }

  return { headerCells: headerCells || [], dataRows, rowLineOffsets };
}

function buildColMap(headerCells) {
  const map = new Map();
  for (let i = 0; i < headerCells.length; i++) {
    map.set(headerCells[i].toLowerCase().trim(), i);
  }
  return map;
}

function missingAgentFinding(label, line, missingFields) {
  const message =
    `${label}:${line}: ## Model audit missing required agent row(s) (absent or empty): ${missingFields.join(', ')}. ` +
    `Fix: add "| Implementer agent | <github-login> |" and ` +
    `"| Reviewer agent | <github-login> |" rows with distinct GitHub usernames.`;
  if (strictAgentColumns) {
    logError(message);
  } else {
    logWarning(message);
  }
}

function checkFile(filePath, subdir) {
  const basename = path.basename(filePath);
  const label = `${subdir}/${basename}`;
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8')
      .replace(/^\uFEFF/, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
  } catch (err) {
    logError(`${label}: cannot read file: ${err.message}`);
    return;
  }

  const section = extractSectionWithLineNumber(content, headingAnchor('Model audit'));
  if (!section) {
    missingAgentFinding(label, 1, ['Implementer agent', 'Reviewer agent']);
    return;
  }

  const { headerCells, dataRows, rowLineOffsets } = parseMarkdownTable(section.body);
  if (!headerCells || headerCells.length === 0) {
    missingAgentFinding(label, section.headingLine, ['Implementer agent', 'Reviewer agent']);
    return;
  }

  const colMap = buildColMap(headerCells);
  const fieldIdx = colMap.get('field');
  const valueIdx = colMap.get('value');
  if (fieldIdx === undefined || valueIdx === undefined) {
    missingAgentFinding(label, section.headingLine, ['Implementer agent', 'Reviewer agent']);
    return;
  }

  let implementerAgentRaw = null;
  let reviewerAgentRaw = null;
  let implementerAgentLine = section.headingLine;
  let reviewerAgentLine = section.headingLine;

  for (let i = 0; i < dataRows.length; i++) {
    const cells = dataRows[i];
    if (cells.length <= Math.max(fieldIdx, valueIdx)) continue;
    const fieldName = cells[fieldIdx].toLowerCase().trim();
    const value = cells[valueIdx];
    const rowLine = section.headingLine + 1 + rowLineOffsets[i];
    if (fieldName === 'implementer agent') {
      implementerAgentRaw = value;
      implementerAgentLine = rowLine;
    } else if (fieldName === 'reviewer agent') {
      reviewerAgentRaw = value;
      reviewerAgentLine = rowLine;
    }
  }

  const implementerAgentTrimmed = implementerAgentRaw === null ? '' : implementerAgentRaw.trim();
  const reviewerAgentTrimmed = reviewerAgentRaw === null ? '' : reviewerAgentRaw.trim();

  const missingFields = [];
  if (implementerAgentTrimmed === '') missingFields.push('Implementer agent');
  if (reviewerAgentTrimmed === '') missingFields.push('Reviewer agent');
  if (missingFields.length > 0) {
    missingAgentFinding(label, section.headingLine, missingFields);
    return;
  }

  const implementerAgent = implementerAgentTrimmed.toLowerCase();
  const reviewerAgent = reviewerAgentTrimmed.toLowerCase();
  if (implementerAgent === reviewerAgent) {
    logError(
      `${label}:${reviewerAgentLine}: ## Model audit agent-identity violation — ` +
      `Implementer agent and Reviewer agent are both "${reviewerAgentTrimmed}" ` +
      `(case-insensitive compare). Fix: dispatch a reviewer under a different GitHub identity ` +
      `and update the Reviewer agent row at ${label}:${reviewerAgentLine}.`
    );
  }
}

let filesChecked = 0;
const clickstopsDir = path.join(cwd, 'project', 'clickstops');

for (const subdir of LINTED_SUBDIRS) {
  const dirPath = path.join(clickstopsDir, subdir);
  if (!fs.existsSync(dirPath)) continue;
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (err) {
    logError(`${subdir}/: cannot read directory: ${err.message}`);
    continue;
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.md')) continue;
    if (entry.name === '.gitkeep') continue;
    filesChecked++;
    checkFile(path.join(dirPath, entry.name), subdir);
  }
}

if (!quiet) {
  process.stdout.write(
    `check-clickstop-implementer-not-reviewer: scanned ${filesChecked} files ` +
    `(strictAgentColumns=${strictAgentColumns})\n`
  );
}
process.stdout.write(
  `check-clickstop-implementer-not-reviewer: ${errors.length} errors, ${warnings.length} warnings\n`
);

process.exit(errors.length > 0 ? 1 : 0);
