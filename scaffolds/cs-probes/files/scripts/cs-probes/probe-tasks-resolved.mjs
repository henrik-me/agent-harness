#!/usr/bin/env node
/**
 * probe-tasks-resolved.mjs — CS readiness probe: task row resolution gate.
 *
 * Reads every active CS file and inspects every row in each one's ## Tasks
 * table. A row is resolved when its report-status key (embedded in the Notes
 * column as `report-status=<value>`) is a member of RESOLVED_STATUSES. Fails if
 * any row in any active CS carries a report-status in UNRESOLVED_STATUSES.
 *
 * This is the canonical pre-close-out gate: run it before opening a close-out
 * PR to confirm that no sub-agent task is still pending or in-flight.
 *
 * Usage: node scripts/cs-probes/probe-tasks-resolved.mjs [--cwd <path>] [--quiet]
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
    process.stderr.write(`probe-tasks-resolved: flag ${flagName} requires a value\n`);
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
        'Usage: probe-tasks-resolved.mjs [--cwd <path>] [--quiet]\n\n' +
        'Checks that all ## Tasks rows in every active CS have a resolved report-status.\n\n' +
        'Exit codes: 0 = pass, 1 = fail, 2 = usage error\n',
      );
      process.exit(0);
      break;
    default:
      process.stderr.write(`probe-tasks-resolved: unknown flag: ${argv[i]}\n`);
      process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// Resolution sets
// ---------------------------------------------------------------------------

// TODO: customize — extend RESOLVED_STATUSES if your project uses additional
// "done-enough-to-close" values (e.g. 'skipped', 'deferred')
const RESOLVED_STATUSES = new Set(['complete', 'partial', 'blocked']);

// TODO: customize — extend UNRESOLVED_STATUSES if your project uses non-standard
// in-flight status values beyond 'pending' and 'dispatched'
const UNRESOLVED_STATUSES = new Set(['pending', 'dispatched']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readActiveFiles(activeDir) {
  if (!fs.existsSync(activeDir)) return [];

  let entries;
  try {
    entries = fs.readdirSync(activeDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const mdFiles = entries.filter(
    e => e.isFile() && e.name.endsWith('.md') && e.name !== '.gitkeep',
  );

  const out = [];
  for (const entry of mdFiles) {
    const filePath = path.join(activeDir, entry.name);
    try {
      const raw = fs.readFileSync(filePath, 'utf8')
        .replace(/^\uFEFF/, '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');
      out.push({ filePath, basename: entry.name, raw });
    } catch {
      // Unreadable file — skip (was a null/no-op in the single-file form).
    }
  }
  return out;
}

function extractTasksSection(raw) {
  const start = raw.indexOf('\n## Tasks');
  if (start === -1) return '';
  const headerEnd = raw.indexOf('\n', start + 1);
  if (headerEnd === -1) return '';
  const nextSection = raw.indexOf('\n## ', headerEnd + 1);
  return nextSection === -1 ? raw.slice(headerEnd + 1) : raw.slice(headerEnd + 1, nextSection);
}

/**
 * Split a markdown table row into an array of trimmed cell strings.
 * Handles \| (escaped pipe) used inside cells to embed literal pipes.
 */
function parseTableRow(line) {
  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map(cell => cell.replace(/\\\|/g, '|').trim());
}

/**
 * Extract the report-status value from a Notes cell string.
 *
 * Notes cells use `\|` as an intra-cell separator, which parseTableRow has
 * already converted to `|`. Split on `|` to get individual key=value parts.
 */
function extractReportStatus(notesCell) {
  const parts = notesCell.split('|').map(s => s.trim());
  for (const part of parts) {
    const m = part.match(/^report-status=(\S+)$/);
    if (m) return m[1];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Probe logic
// ---------------------------------------------------------------------------

const activeDir = path.join(cwd, 'project', 'clickstops', 'active');
const activeFiles = readActiveFiles(activeDir);

if (activeFiles.length === 0) {
  if (!quiet) process.stdout.write('probe-tasks-resolved: PASS — no active CS found\n');
  process.exit(0);
}

let failed = false;

for (const { basename, raw } of activeFiles) {
  const tasksSection = extractTasksSection(raw);

  if (!tasksSection.trim()) {
    if (!quiet) {
      process.stdout.write(
        `probe-tasks-resolved: PASS — ${basename}: no ## Tasks section found\n`,
      );
    }
    continue;
  }

  const tableLines = tasksSection.split('\n').filter(l => l.trimStart().startsWith('|'));
  const isSeparator = l => /^\s*\|[-| :]+\|\s*$/.test(l);
  const dataRows = tableLines.filter(l => !isSeparator(l));

  if (dataRows.length <= 1) {
    if (!quiet) {
      process.stdout.write(`probe-tasks-resolved: PASS — ${basename}: no task data rows\n`);
    }
    continue;
  }

  // dataRows[0] is the header row; slice it off
  const rows = dataRows.slice(1);

  let fileFailed = false;
  let resolvedCount = 0;
  let unresolvedCount = 0;

  for (const row of rows) {
    const cells = parseTableRow(row);
    if (cells.length < 2) continue;

    // TODO: customize — adjust the Notes column index if your Tasks table layout differs
    // Default: 4-column table, Notes is the last (index 3)
    const notesCell = cells[cells.length - 1];
    const reportStatus = extractReportStatus(notesCell);

    if (reportStatus === null) {
      // Row does not carry a report-status key — skip
      // TODO: customize — treat rows without report-status as unresolved if desired
      continue;
    }

    const taskName = cells[0];

    if (UNRESOLVED_STATUSES.has(reportStatus)) {
      process.stdout.write(
        `probe-tasks-resolved: FAIL — ${basename}: ` +
        `task ${taskName} has report-status=${reportStatus}\n`,
      );
      unresolvedCount++;
      fileFailed = true;
      failed = true;
    } else if (RESOLVED_STATUSES.has(reportStatus)) {
      resolvedCount++;
    } else {
      process.stdout.write(
        `probe-tasks-resolved: WARN — ${basename}: ` +
        `task ${taskName} has unknown report-status=${reportStatus}\n`,
      );
    }
  }

  if (!fileFailed && !quiet) {
    process.stdout.write(
      `probe-tasks-resolved: PASS — ${basename}: ` +
      `${resolvedCount} resolved, ${unresolvedCount} unresolved\n`,
    );
  }
}

// TODO: customize — integrate into pre-PR git hook to enforce the close-out gate:
// node scripts/cs-probes/probe-tasks-resolved.mjs

process.exit(failed ? 1 : 0);
