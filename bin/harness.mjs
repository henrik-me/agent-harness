#!/usr/bin/env node
/**
 * bin/harness.mjs — CLI dispatcher for the agent-harness tool.
 *
 * Source: project/clickstops/active/active_cs04_cli-dispatcher.md
 * Plan:   project/clickstops/done/done_cs01_bootstrap-repo/harness-cs-plan.md § CS04
 *
 * Subcommands: init | sync | check | lint | harvest | check-migration |
 *              composed-audit | pack | version | whoami
 *
 * Exit codes:
 *   0 — success (or no drift in check/dry-run mode)
 *   1 — operation failure (sync error, validation failure, etc.)
 *   2 — usage error (bad arguments, unknown subcommand)
 *
 * Global flags: --cwd <path>, --config <path>, --ref <ref>, --help, --debug
 *
 * @module bin/harness.mjs
 */

import { parseArgs } from 'node:util';
import { readFileSync, existsSync, readdirSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

const TOP_HELP = `
Usage: harness <subcommand> [options]

Subcommands:
  init              Scaffold harness.config.json + seeded files into a target dir
  sync              Sync managed/composed/seeded files from the harness template
  check             Alias for sync --mode=check
  lint              Run harness linters (STUB — full impl in CS06)
  harvest           Run harvest procedure (STUB — full impl in later CS)
  check-migration   Detect migration issues from an existing harness (STUB)
  composed-audit    Audit composed blocks from an existing harness (STUB)
  pack              Run npm pack --dry-run and verify file whitelist
  version           Print package version
  whoami            Derive and print the agent ID

Global flags:
  --cwd <path>      Working directory (default: process.cwd())
  --config <path>   Path to harness.config.json (default: <cwd>/harness.config.json)
  --ref <ref>       Override harness ref for sync
  --debug           Print stack traces on error
  --help            Print this help text

Exit codes:
  0  success
  1  operation failure
  2  usage error (bad arguments, unknown subcommand)
`.trimStart();

const SUBCOMMAND_HELP = {
  init: `
Usage: harness init [target_dir] [options]

Scaffold harness.config.json + seeded files into target_dir (default: cwd).
Reads template/seeded/ from the harness repo and copies any missing files.
If harness.config.json already exists, prints a warning and skips (no overwrite).

Options:
  --from-example=<gwn|si|self>  Use a bundled example config as the initial config
  --help                        Print this help
`.trimStart(),

  sync: `
Usage: harness sync [options]

Sync managed/composed/seeded files from the harness template into the consumer repo.
Wraps lib/sync.mjs sync(). Default mode is check.

Options:
  --mode=<apply|check|dry-run>  Sync mode (default: check)
  --accept-major                Allow major version bumps
  --report                      Print planned changes per file
  --cwd <path>                  Consumer repo path (default: cwd)
  --config <path>               Path to harness.config.json
  --help                        Print this help

Exit codes:
  0  success / no drift
  1  drift detected (check mode) or error
`.trimStart(),

  check: `
Usage: harness check [options]

Alias for: harness sync --mode=check

Options:
  --cwd <path>    Consumer repo path (default: cwd)
  --config <path> Path to harness.config.json
  --help          Print this help
`.trimStart(),

  lint: `
Usage: harness lint [options]

Run harness linters against the consumer repo.
STUB in CS04 — full implementation lands in CS06.

Options:
  --cwd <path>    Consumer repo path (default: cwd)
  --help          Print this help
`.trimStart(),

  harvest: `
Usage: harness harvest [options]

Run the full harvest procedure (collects learnings, updates WORKBOARD, etc.).
STUB in CS04 — full implementation in a later CS.

Options:
  --snooze=<reason>:<deferred_until>  Defer harvest with a reason and date
  --help                              Print this help
`.trimStart(),

  'check-migration': `
Usage: harness check-migration [options]

Detect migration issues from an existing harness installation.
STUB in CS04 — full implementation planned for CS19.

Options:
  --from-existing-harness  Required flag; indicates migration-check context
  --help                   Print this help
`.trimStart(),

  'composed-audit': `
Usage: harness composed-audit [options]

Audit composed blocks from an existing harness installation.
STUB in CS04 — full implementation planned for CS06/CS19.

Options:
  --from-existing-harness  Required flag; indicates audit context
  --help                   Print this help
`.trimStart(),

  pack: `
Usage: harness pack [options]

Runs npm pack --dry-run and prints the output.
Verifies the file whitelist matches what package.json declares.

Options:
  --help  Print this help
`.trimStart(),

  version: `
Usage: harness version [options]

Print the harness package version.
Also prints the linked harness ref if package.json has a harness.linkedRef field.

Options:
  --help  Print this help
`.trimStart(),

  whoami: `
Usage: harness whoami [options]

Derive and print the agent ID for this machine + repo combination.

Agent ID format: <machine-short>-<agent_suffix>[-c<N>]
  machine-short  = env var override, or hostname last segment (lowercase)
  agent_suffix   = project.agent_suffix from harness.config.json
  -c<N>          = clone-folder index if present in repo directory name

Options:
  --explain       Print full derivation chain
  --cwd <path>    Consumer repo path (default: cwd)
  --config <path> Path to harness.config.json
  --help          Print this help
`.trimStart(),
};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Strip UTF-8 BOM from a string (per LRN-018). */
function stripBOM(str) {
  return str.charCodeAt(0) === 0xFEFF ? str.slice(1) : str;
}

/** Read a JSON file, stripping BOM, returning null if missing. */
function readJSONOrNull(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(stripBOM(readFileSync(filePath, 'utf8')));
  } catch {
    return null;
  }
}

/** Read and parse package.json. */
function readPackageJSON() {
  return JSON.parse(stripBOM(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')));
}

/**
 * Derive machine-short from hostname.
 * Splits on `-` or `_`, returns the last segment lowercased.
 * Per Decision #20: "first segment after splitting, skipping user/owner prefix segments".
 */
function machineShortFromHostname(hostname) {
  const lower = hostname.toLowerCase();
  const parts = lower.split(/[-_]+/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? lower;
}

/**
 * Derive the -c<N> clone index from the repo directory name, if present.
 * E.g. a folder named `agent-harness-c2` yields `c2`; `agent-harness` yields null.
 */
function cloneSuffixFromDir(dirPath) {
  const base = path.basename(dirPath);
  const m = base.match(/-c(\d+)$/i);
  return m ? `c${m[1]}` : null;
}

/**
 * Load harness.config.json from a consumer repo path.
 * Returns null if not found.
 */
function loadConfig(consumerRepoPath, configOverride) {
  const configPath = configOverride ?? path.join(consumerRepoPath, 'harness.config.json');
  return readJSONOrNull(configPath);
}

/** Print to stderr and exit with code. */
function die(msg, code = 1) {
  process.stderr.write(msg + '\n');
  process.exit(code);
}

// ---------------------------------------------------------------------------
// Parse global args
// ---------------------------------------------------------------------------

function parseGlobalArgs() {
  // We do a first-pass manual scan for global flags and the subcommand.
  const argv = process.argv.slice(2);

  let cwd = process.cwd();
  let config = null;
  let ref = null;
  let debug = false;
  let help = false;
  let subcommand = null;
  const rest = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--cwd') {
      cwd = argv[++i] ?? die('--cwd requires a value', 2);
    } else if (arg.startsWith('--cwd=')) {
      cwd = arg.slice('--cwd='.length);
    } else if (arg === '--config') {
      config = argv[++i] ?? die('--config requires a value', 2);
    } else if (arg.startsWith('--config=')) {
      config = arg.slice('--config='.length);
    } else if (arg === '--ref') {
      ref = argv[++i] ?? die('--ref requires a value', 2);
    } else if (arg.startsWith('--ref=')) {
      ref = arg.slice('--ref='.length);
    } else if (arg === '--debug') {
      debug = true;
    } else if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (!arg.startsWith('-') && subcommand === null) {
      subcommand = arg;
    } else {
      rest.push(arg);
    }
  }

  return { cwd, config, ref, debug, help, subcommand, rest };
}

// ---------------------------------------------------------------------------
// Subcommand: init
// ---------------------------------------------------------------------------

async function cmdInit(args, global) {
  const { cwd, config: configOverride, debug } = global;

  // Parse init-specific args
  let targetDir = cwd;
  let fromExample = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') {
      process.stdout.write(SUBCOMMAND_HELP['init']);
      process.exit(0);
    } else if (a.startsWith('--from-example=')) {
      fromExample = a.slice('--from-example='.length);
    } else if (!a.startsWith('-')) {
      targetDir = path.resolve(cwd, a);
    } else {
      die(`Unknown flag: ${a}\n\n${SUBCOMMAND_HELP['init']}`, 2);
    }
  }

  const configDest = path.join(targetDir, 'harness.config.json');

  if (existsSync(configDest)) {
    process.stderr.write(
      `Warning: harness.config.json already exists at ${configDest} — skipping (use manual edit to update).\n`
    );
    return;
  }

  // Determine source config
  const exampleMap = { gwn: 'guesswhatisnext', si: 'sub-invaders', self: 'agent-harness-self' };
  let configSource = null;
  if (fromExample) {
    const key = exampleMap[fromExample];
    if (!key) {
      die(`Unknown --from-example value: "${fromExample}". Valid: gwn, si, self`, 2);
    }
    configSource = path.join(REPO_ROOT, 'examples', `${key}.harness.config.json`);
    if (!existsSync(configSource)) {
      die(`Example config not found: ${configSource}`, 1);
    }
  }

  mkdirSync(targetDir, { recursive: true });

  if (configSource) {
    copyFileSync(configSource, configDest);
    process.stdout.write(`Created harness.config.json (from example: ${fromExample}) at ${configDest}\n`);
  } else {
    // Write minimal scaffolded config
    const pkg = readPackageJSON();
    const scaffold = {
      $schema: '../schemas/harness.config.schema.json',
      version: pkg.version,
      project: {
        name: path.basename(targetDir),
        agent_suffix: 'XX',
      },
      managed: { files: [] },
      composed: { files: [] },
      seeded: { files: [] },
      scaffolds: [],
      excluded: [],
    };
    writeFileSync(configDest, JSON.stringify(scaffold, null, 2) + '\n', 'utf8');
    process.stdout.write(`Created harness.config.json at ${configDest}\n`);
  }

  // Copy seeded template files that are missing
  const seededDir = path.join(REPO_ROOT, 'template', 'seeded');
  if (existsSync(seededDir)) {
    const seededFiles = readdirSync(seededDir, { recursive: true, withFileTypes: true });
    for (const entry of seededFiles) {
      if (!entry.isFile()) continue;
      const rel = entry.parentPath
        ? path.join(path.relative(seededDir, entry.parentPath), entry.name)
        : entry.name;
      const dest = path.join(targetDir, rel);
      if (!existsSync(dest)) {
        mkdirSync(path.dirname(dest), { recursive: true });
        copyFileSync(path.join(entry.parentPath ?? seededDir, entry.name), dest);
        process.stdout.write(`Created ${rel}\n`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Subcommand: sync
// ---------------------------------------------------------------------------

async function cmdSync(args, global, defaultMode = 'check') {
  const { cwd, config: configOverride, ref, debug } = global;

  let mode = defaultMode;
  let acceptMajor = false;
  let report = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') {
      process.stdout.write(SUBCOMMAND_HELP['sync']);
      process.exit(0);
    } else if (a.startsWith('--mode=')) {
      mode = a.slice('--mode='.length);
    } else if (a === '--accept-major') {
      acceptMajor = true;
    } else if (a === '--report') {
      report = true;
    } else {
      die(`Unknown flag: ${a}\n\n${SUBCOMMAND_HELP['sync']}`, 2);
    }
  }

  if (!['apply', 'check', 'dry-run'].includes(mode)) {
    die(`Invalid --mode value: "${mode}". Must be apply, check, or dry-run.\n\n${SUBCOMMAND_HELP['sync']}`, 2);
  }

  const { sync: syncFn } = await import('../lib/sync.mjs');

  try {
    const result = await syncFn({
      consumerRepoPath: cwd,
      harnessRepoPath: REPO_ROOT,
      mode,
      acceptMajor,
    });

    if (result.warnings.length > 0) {
      for (const w of result.warnings) {
        process.stderr.write(`Warning: ${w}\n`);
      }
    }

    if (report || mode === 'dry-run') {
      for (const change of result.changes) {
        const line = `  ${change.action.padEnd(10)} ${change.class.padEnd(10)} ${change.target}`;
        process.stdout.write(line + '\n');
        if (change.preview) {
          process.stdout.write(`--- preview ---\n${change.preview}\n--- end ---\n`);
        }
      }
    }

    if (result.driftDetected && mode === 'check') {
      process.stderr.write('Drift detected. Run `harness sync --mode=apply` to apply changes.\n');
      process.exit(1);
    }

    if (mode === 'apply') {
      process.stdout.write(`Sync complete (${result.changes.filter(c => c.action !== 'skipped').length} changes applied).\n`);
    } else if (mode === 'check') {
      process.stdout.write('No drift detected.\n');
    } else {
      process.stdout.write('Dry-run complete.\n');
    }
  } catch (err) {
    process.stderr.write(`Sync error: ${err.message}\n`);
    if (debug) process.stderr.write(err.stack + '\n');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Subcommand: check (alias for sync --mode=check)
// ---------------------------------------------------------------------------

async function cmdCheck(args, global) {
  // Intercept --help before delegating
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(SUBCOMMAND_HELP['check']);
    process.exit(0);
  }
  return cmdSync(args, global, 'check');
}

// ---------------------------------------------------------------------------
// Subcommand: lint (STUB)
// ---------------------------------------------------------------------------

async function cmdLint(args, _global) {
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(SUBCOMMAND_HELP['lint']);
    process.exit(0);
  }
  process.stdout.write('TODO: lint is not yet implemented (full impl in CS06).\n');
}

// ---------------------------------------------------------------------------
// Subcommand: harvest (STUB)
// ---------------------------------------------------------------------------

async function cmdHarvest(args, _global) {
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(SUBCOMMAND_HELP['harvest']);
    process.exit(0);
  }
  process.stdout.write('harvest not yet implemented (full impl in a later CS).\n');
}

// ---------------------------------------------------------------------------
// Subcommand: check-migration (STUB)
// ---------------------------------------------------------------------------

/**
 * check-migration — detect migration issues from an existing harness installation.
 * STUB in CS04; full implementation planned for CS19 per active_cs04_cli-dispatcher.md.
 *
 * @param {string[]} args
 * @param {object} _global
 */
async function cmdCheckMigration(args, _global) {
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(SUBCOMMAND_HELP['check-migration']);
    process.exit(0);
  }
  process.stdout.write('TODO: check-migration is not yet implemented (full impl in CS19).\n');
}

// ---------------------------------------------------------------------------
// Subcommand: composed-audit (STUB)
// ---------------------------------------------------------------------------

/**
 * composed-audit — audit composed blocks from an existing harness installation.
 * STUB in CS04; full implementation planned for CS06/CS19 per active_cs04_cli-dispatcher.md.
 *
 * @param {string[]} args
 * @param {object} _global
 */
async function cmdComposedAudit(args, _global) {
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(SUBCOMMAND_HELP['composed-audit']);
    process.exit(0);
  }
  process.stdout.write('TODO: composed-audit is not yet implemented (full impl in CS06/CS19).\n');
}

// ---------------------------------------------------------------------------
// Subcommand: pack
// ---------------------------------------------------------------------------

async function cmdPack(args, _global) {
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(SUBCOMMAND_HELP['pack']);
    process.exit(0);
  }

  const result = spawnSync('npm', ['pack', '--dry-run'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
    shell: true,
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error) {
    process.stderr.write(`pack error: ${result.error.message}\n`);
    process.exit(1);
  }

  process.exit(result.status ?? 0);
}

// ---------------------------------------------------------------------------
// Subcommand: version
// ---------------------------------------------------------------------------

async function cmdVersion(args, _global) {
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(SUBCOMMAND_HELP['version']);
    process.exit(0);
  }

  const pkg = readPackageJSON();
  let out = `${pkg.version}\n`;

  if (pkg.harness?.linkedRef) {
    out += `linked-ref: ${pkg.harness.linkedRef}\n`;
  } else {
    out += `linked-ref: (none — package.json does not have a harness.linkedRef field)\n`;
  }

  process.stdout.write(out);
}

// ---------------------------------------------------------------------------
// Subcommand: whoami
// ---------------------------------------------------------------------------

async function cmdWhoami(args, global) {
  const { cwd, config: configOverride, debug } = global;

  let explain = false;

  for (const a of args) {
    if (a === '--help' || a === '-h') {
      process.stdout.write(SUBCOMMAND_HELP['whoami']);
      process.exit(0);
    } else if (a === '--explain') {
      explain = true;
    } else {
      die(`Unknown flag: ${a}\n\n${SUBCOMMAND_HELP['whoami']}`, 2);
    }
  }

  // Load config for agent_suffix
  const cfg = loadConfig(cwd, configOverride);
  const agentSuffix = cfg?.project?.agent_suffix ?? null;
  const agentEnvVarName = cfg?.project?.agent_env_var
    ?? (agentSuffix ? `HARNESS_AGENT_${agentSuffix.toUpperCase()}_MACHINE` : null);

  // Derive machine-short
  const hostname = os.hostname();
  const machineShortDerived = machineShortFromHostname(hostname);
  const envVarValue = agentEnvVarName ? process.env[agentEnvVarName] ?? null : null;
  const machineShort = envVarValue ?? machineShortDerived;

  // Derive clone index from repo dir
  const cloneSuffix = cloneSuffixFromDir(REPO_ROOT);

  // Build agent ID
  let agentId = machineShort;
  if (agentSuffix) agentId += `-${agentSuffix}`;
  if (cloneSuffix) agentId += `-${cloneSuffix}`;

  if (explain) {
    process.stdout.write(`hostname:       ${hostname}\n`);
    process.stdout.write(`machine-short:  ${machineShortDerived} (derived from hostname)\n`);
    process.stdout.write(`env-var-name:   ${agentEnvVarName ?? '(none — no config found)'}\n`);
    process.stdout.write(`env-var-value:  ${envVarValue ?? '(not set)'}\n`);
    process.stdout.write(`effective-machine-short: ${machineShort}\n`);
    process.stdout.write(`config-suffix:  ${agentSuffix ?? '(none — no config found)'}\n`);
    process.stdout.write(`repo-dir:       ${REPO_ROOT}\n`);
    process.stdout.write(`clone-suffix:   ${cloneSuffix ?? '(none)'}\n`);
    process.stdout.write(`agent-id:       ${agentId}\n`);
  } else {
    process.stdout.write(`${agentId}\n`);
  }
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

async function main() {
  const global = parseGlobalArgs();
  const { subcommand, rest, help, debug } = global;

  if (help && !subcommand) {
    process.stdout.write(TOP_HELP);
    process.exit(0);
  }

  if (!subcommand) {
    process.stderr.write(TOP_HELP);
    process.exit(2);
  }

  const dispatch = {
    init: cmdInit,
    sync: cmdSync,
    check: cmdCheck,
    lint: cmdLint,
    harvest: cmdHarvest,
    'check-migration': cmdCheckMigration,
    'composed-audit': cmdComposedAudit,
    pack: cmdPack,
    version: cmdVersion,
    whoami: cmdWhoami,
  };

  const handler = dispatch[subcommand];
  if (!handler) {
    process.stderr.write(`Unknown subcommand: "${subcommand}"\n\n${TOP_HELP}`);
    process.exit(2);
  }

  // If --help was a global flag but a subcommand is present, forward it to the subcommand.
  const subArgs = help ? ['--help', ...rest] : rest;

  try {
    await handler(subArgs, global);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    if (debug) process.stderr.write(err.stack + '\n');
    process.exit(1);
  }
}

main();
