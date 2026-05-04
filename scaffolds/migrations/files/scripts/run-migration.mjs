#!/usr/bin/env node
/**
 * scripts/run-migration.mjs — Migration plan printer with a no-op adapter stub.
 *
 * Reads *.up.sql / *.down.sql files from the migrations directory, sorts them
 * by their numeric prefix, and prints the execution plan.  Does NOT execute
 * against a real database; swap the no-op adapter below for your actual DB
 * client (pg, better-sqlite3, mysql2, etc.).
 *
 * Usage:
 *   node scripts/run-migration.mjs [--dir <path>] [--direction up|down] [--verbose]
 *
 * Exit codes:
 *   0 — plan printed (or no migrations found)
 *   1 — error reading migrations directory
 *   2 — usage error
 *
 * @module scripts/run-migration.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// requireValue guard (LRN-040)
// ---------------------------------------------------------------------------

/**
 * Assert that args[i+1] exists and does not start with '-'.
 * Exits 2 with a usage error if the guard fails.
 *
 * @param {string[]} args
 * @param {number}   i
 * @param {string}   flagName
 */
function requireValue(args, i, flagName) {
  if (!args[i + 1] || args[i + 1].startsWith('-')) {
    process.stderr.write(`run-migration: missing value for ${flagName}\n`);
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const cwd = process.cwd();
let migrationsDir = path.join(cwd, 'migrations');
let direction = 'up';
let verbose = false;

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--dir') {
    requireValue(argv, i, '--dir');
    migrationsDir = path.resolve(cwd, argv[++i]);
  } else if (a === '--direction') {
    requireValue(argv, i, '--direction');
    direction = argv[++i];
    if (direction !== 'up' && direction !== 'down') {
      process.stderr.write(`run-migration: --direction must be "up" or "down"\n`);
      process.exit(2);
    }
  } else if (a === '--verbose') {
    verbose = true;
  } else if (a === '--help' || a === '-h') {
    process.stdout.write(
      'Usage: run-migration.mjs [--dir <path>] [--direction up|down] [--verbose]\n\n' +
      'Print the migration execution plan (no-op adapter; does not touch a real DB).\n\n' +
      'Options:\n' +
      '  --dir <path>         Directory containing migration files (default: ./migrations)\n' +
      '  --direction up|down  Order of execution (default: up)\n' +
      '  --verbose            Print SQL content for each migration\n' +
      '  --help               Print this help text\n'
    );
    process.exit(0);
  } else {
    process.stderr.write(`run-migration: unknown flag: ${a}\n`);
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// Read migrations directory
// ---------------------------------------------------------------------------

let entries;
try {
  entries = fs.readdirSync(migrationsDir);
} catch (err) {
  process.stderr.write(`run-migration: cannot read directory "${migrationsDir}": ${err.message}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Parse and sort migration files
// ---------------------------------------------------------------------------

const FILE_PATTERN = /^(\d{4})_([a-z0-9-]+)\.(up|down)\.sql$/;

/** @type {{ prefix: string; slug: string; direction: 'up'|'down'; file: string }[]} */
const migrations = [];

for (const entry of entries) {
  const m = FILE_PATTERN.exec(entry);
  if (!m) continue;
  migrations.push({ prefix: m[1], slug: m[2], direction: m[3], file: entry });
}

// Select the set matching the requested direction, sort by prefix.
const selected = migrations
  .filter((mg) => mg.direction === direction)
  .sort((a, b) =>
    direction === 'up'
      ? a.prefix.localeCompare(b.prefix)
      : b.prefix.localeCompare(a.prefix)
  );

if (selected.length === 0) {
  process.stdout.write(`No ${direction} migrations found in "${migrationsDir}"\n`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// No-op adapter
// TODO: customize — replace this stub with your real database client.
//
// The adapter receives:
//   filePath  {string}  absolute path to the .sql file
//   sql       {string}  file contents
//
// Return a promise that resolves when the migration has been applied.
// ---------------------------------------------------------------------------

/**
 * No-op migration adapter.
 * @param {string} _filePath
 * @param {string} _sql
 * @returns {Promise<void>}
 */
async function applyMigration(_filePath, _sql) {
  // TODO: customize — connect to your DB and execute _sql here.
  // Example (pg):
  //   await client.query(_sql);
}

// ---------------------------------------------------------------------------
// Print plan and run no-op adapter
// ---------------------------------------------------------------------------

process.stdout.write(`Migration plan (${direction}, ${selected.length} file${selected.length === 1 ? '' : 's'}):\n\n`);

for (const mg of selected) {
  const filePath = path.join(migrationsDir, mg.file);
  let sql = '';
  try {
    sql = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    process.stderr.write(`run-migration: cannot read "${filePath}": ${err.message}\n`);
    process.exit(1);
  }

  process.stdout.write(`  [${mg.prefix}] ${mg.slug} (${mg.direction})\n`);
  if (verbose) {
    const preview = sql.split('\n').map((l) => `        ${l}`).join('\n');
    process.stdout.write(`${preview}\n\n`);
  }

  await applyMigration(filePath, sql);
}

process.stdout.write(`\nDone. Applied ${selected.length} migration${selected.length === 1 ? '' : 's'} (no-op adapter).\n`);
