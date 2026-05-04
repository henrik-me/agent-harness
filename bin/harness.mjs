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
import { readFileSync, existsSync, readdirSync, mkdirSync, copyFileSync, writeFileSync, statSync } from 'node:fs';
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
  lint              Run all harness structural + policy linters (13 linters)
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

Optionally drops one or more named scaffolds from scaffolds/<name>/files/
(create-if-missing). Drops do not overwrite existing files. After successful
drop, the scaffold name is appended to harness.config.json scaffolds[].

Options:
  --from-example=<gwn|si|self>   Use a bundled example config as the initial config
  --with-scaffold <name>         Drop the named scaffold (repeatable; also accepts --with-scaffold=<name>)
  --help                         Print this help
`.trimStart(),

  sync: `
Usage: harness sync [options]

Sync managed/composed/seeded files from the harness template into the consumer repo.
Wraps lib/sync.mjs sync(). Default mode is check.

Options:
  --mode=<apply|check|dry-run>  Sync mode (default: check)
  --dry-run                     Alias for --mode=dry-run
  --accept-major                Allow major version bumps
  --report                      Print planned changes per file
  --resolved-sha <40hex>        Pin the recorded lock resolved_sha to <40hex>
                                 (apply-mode only; see CS11b/LRN-070 for the
                                 post-commit-regenerate ordering trap this fixes).
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

Run all harness linters against the repo. Aggregates results from:
  - check-learnings.mjs   (LEARNINGS.md)
  - check-context.mjs     (CONTEXT.md)
  - check-workboard.mjs   (WORKBOARD.md)
  - check-architecture.mjs (ARCHITECTURE.md)
  - check-clickstop.mjs   (project/clickstops/)
  - check-instructions.mjs (INSTRUCTIONS.md)
  - check-readme.mjs      (README.md)
  - check-composed-blocks.mjs (each composed_files[].path from config; skipped if none)
  - check-workflow-pins.mjs (.github/workflows/)
  - check-text-encoding.mjs (BOM + line endings; walks --cwd recursively)
  - check-public-artifact.mjs (skipped unless --public-artifact-dir or config provides one)
  - check-pr-body.mjs     (.github/PR_BODY.md if present)
  - check-commit-trailers.mjs (.git/COMMIT_EDITMSG if present)
  - check-compose-v2.mjs  (compose.yaml or docker-compose.yml if present)

Linters whose target does not exist are skipped (and noted in the summary).

Options:
  --quiet                   Suppress per-linter detail; print only the final aggregate summary
  --cwd <path>              Repo path (default: cwd)
  --only <name1,name2>      Run only named linters (e.g. --only learnings,context)
  --skip <name1,name2>      Skip named linters
  --public-artifact-dir <p> Override target dir for check-public-artifact
  --help                    Print this help

Exit codes:
  0  all linters passed (warnings do not affect exit code)
  1  at least one linter reported errors
  2  bad invocation
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
 * Derive the -c<N> clone index from the consumer repo directory name, per Decision #20.
 * Patterns (checked in order):
 *   `<repo>_copilot<N>`  → `c<N>`  (e.g. `agent-harness_copilot2` → `c2`)
 *   `<repo><N>`          → `c<N>`  (trailing digits, e.g. `agent-harness3` → `c3`)
 *   otherwise            → null
 */
function cloneSuffixFromDir(dirPath) {
  const base = path.basename(dirPath);
  let m = base.match(/_copilot(\d+)$/i);
  if (m) return `c${m[1]}`;
  m = base.match(/(\d+)$/);
  if (m) return `c${m[1]}`;
  return null;
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
  let cwdProvided = false;
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
      cwdProvided = true;
    } else if (arg.startsWith('--cwd=')) {
      cwd = arg.slice('--cwd='.length);
      cwdProvided = true;
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

  // Canonicalize paths to absolute, relative to the shell's cwd.
  cwd = path.resolve(process.cwd(), cwd);
  if (cwdProvided) {
    if (!existsSync(cwd)) {
      die(`--cwd path does not exist: ${cwd}`, 2);
    }
    const s = statSync(cwd);
    if (!s.isDirectory()) {
      die(`--cwd must be a directory: ${cwd}`, 2);
    }
  }
  if (config !== null) {
    config = path.resolve(process.cwd(), config);
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
  const withScaffolds = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') {
      process.stdout.write(SUBCOMMAND_HELP['init']);
      process.exit(0);
    } else if (a.startsWith('--from-example=')) {
      fromExample = a.slice('--from-example='.length);
    } else if (a === '--with-scaffold') {
      if (i + 1 >= args.length || args[i + 1].startsWith('-')) {
        die(`--with-scaffold requires a value\n\n${SUBCOMMAND_HELP['init']}`, 2);
      }
      withScaffolds.push(args[++i]);
    } else if (a.startsWith('--with-scaffold=')) {
      const v = a.slice('--with-scaffold='.length);
      if (!v) die(`--with-scaffold= requires a value\n\n${SUBCOMMAND_HELP['init']}`, 2);
      withScaffolds.push(v);
    } else if (!a.startsWith('-')) {
      targetDir = path.resolve(cwd, a);
    } else {
      die(`Unknown flag: ${a}\n\n${SUBCOMMAND_HELP['init']}`, 2);
    }
  }

  // Compute config destination eagerly (used by both pre-validation and the
  // seeded-config write below).
  const configDest = path.join(targetDir, 'harness.config.json');
  const configExists = existsSync(configDest);

  // Pre-validate all requested scaffolds before any writes (per CS10 plan critique).
  // If any name is unknown, fail fast with exit 2 — leaves target untouched.
  const scaffoldsRoot = path.join(REPO_ROOT, 'scaffolds');
  if (withScaffolds.length > 0) {
    const available = existsSync(scaffoldsRoot)
      ? readdirSync(scaffoldsRoot, { withFileTypes: true })
          .filter((e) => e.isDirectory() && existsSync(path.join(scaffoldsRoot, e.name, 'files')))
          .map((e) => e.name)
          .sort()
      : [];
    for (const name of withScaffolds) {
      if (!available.includes(name)) {
        die(
          `Unknown scaffold: "${name}". Available: ${available.length ? available.join(', ') : '(none)'}`,
          2
        );
      }
    }
    // Pre-parse existing harness.config.json so a malformed file fails fast
    // BEFORE any scaffold/seeded files are dropped (per CS10 R1 review).
    if (configExists) {
      try {
        JSON.parse(stripBOM(readFileSync(configDest, 'utf8')));
      } catch (err) {
        die(
          `Existing harness.config.json is malformed JSON; refusing to drop scaffolds.\n` +
            `Path: ${configDest}\nError: ${err.message}`,
          1
        );
      }
    }
  }

  if (configExists) {
    process.stderr.write(
      `Warning: harness.config.json already exists at ${configDest} — skipping config write (use manual edit to update).\n`
    );
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

  if (!configExists) {
    if (configSource) {
      copyFileSync(configSource, configDest);
      process.stdout.write(`Created harness.config.json (from example: ${fromExample}) at ${configDest}\n`);
    } else {
      // Copy from template/seeded/harness.config.json (preferred), fall back to scaffold
      const seededConfigSrc = path.join(REPO_ROOT, 'template', 'seeded', 'harness.config.json');
      if (existsSync(seededConfigSrc)) {
        copyFileSync(seededConfigSrc, configDest);
        process.stdout.write(`Created harness.config.json at ${configDest}\n`);
      } else {
        // Defensive fallback: write minimal scaffolded config
        const pkg = readPackageJSON();
        const scaffold = {
          $schema: 'https://github.com/henrik-me/agent-harness/schemas/harness.config.schema.json',
          version: pkg.version,
          project: {
            name: path.basename(targetDir),
            agent_suffix: 'mp',
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
    }
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

  // Drop opt-in scaffolds (CS10). Validation already happened above.
  // For each requested scaffold, walk scaffolds/<name>/files/** and copy each
  // file create-if-missing into the consumer cwd. Existing files are skipped
  // with a stderr warning. After all copies succeed, append the scaffold names
  // to harness.config.json scaffolds[].
  const droppedScaffolds = [];
  for (const name of withScaffolds) {
    const src = path.join(scaffoldsRoot, name, 'files');
    const entries = readdirSync(src, { recursive: true, withFileTypes: true });
    let anyCopied = false;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const rel = entry.parentPath
        ? path.join(path.relative(src, entry.parentPath), entry.name)
        : entry.name;
      const dest = path.join(targetDir, rel);
      if (existsSync(dest)) {
        process.stderr.write(`Skipped (exists): ${rel}\n`);
        continue;
      }
      mkdirSync(path.dirname(dest), { recursive: true });
      copyFileSync(path.join(entry.parentPath ?? src, entry.name), dest);
      process.stdout.write(`Created ${rel}\n`);
      anyCopied = true;
    }
    droppedScaffolds.push({ name, anyCopied });
  }

  // Record opted-in scaffold names in consumer's harness.config.json scaffolds[].
  // Only mutate after at least one scaffold was processed and config is parseable.
  if (droppedScaffolds.length > 0 && existsSync(configDest)) {
    try {
      const cfg = JSON.parse(stripBOM(readFileSync(configDest, 'utf8')));
      if (!Array.isArray(cfg.scaffolds)) cfg.scaffolds = [];
      let mutated = false;
      const added = [];
      for (const { name } of droppedScaffolds) {
        if (!cfg.scaffolds.includes(name)) {
          cfg.scaffolds.push(name);
          mutated = true;
          added.push(name);
        }
      }
      if (mutated) {
        writeFileSync(configDest, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
        process.stdout.write(
          `Recorded scaffolds in harness.config.json: ${added.join(', ')}\n`
        );
      }
    } catch (err) {
      process.stderr.write(
        `Warning: could not update harness.config.json scaffolds[]: ${err.message}\n`
      );
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
  let resolvedShaOverride = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') {
      process.stdout.write(SUBCOMMAND_HELP['sync']);
      process.exit(0);
    } else if (a.startsWith('--mode=')) {
      mode = a.slice('--mode='.length);
    } else if (a === '--dry-run') {
      mode = 'dry-run';
    } else if (a === '--accept-major') {
      acceptMajor = true;
    } else if (a === '--report') {
      report = true;
    } else if (a === '--resolved-sha') {
      // CS11b: pin the recorded resolved_sha in the lock to a specific commit
      // (avoids the LRN-070 post-commit-regenerate ordering trap).
      if (i + 1 >= args.length || args[i + 1].startsWith('-')) {
        die(`--resolved-sha requires a value\n\n${SUBCOMMAND_HELP['sync']}`, 2);
      }
      resolvedShaOverride = args[++i];
      if (!/^[0-9a-f]{40}$/.test(resolvedShaOverride)) {
        die(
          `--resolved-sha must be a 40-character lowercase hex string; got: "${resolvedShaOverride}"\n\n${SUBCOMMAND_HELP['sync']}`,
          2
        );
      }
    } else if (a.startsWith('--resolved-sha=')) {
      const v = a.slice('--resolved-sha='.length);
      if (!v) die(`--resolved-sha= requires a value\n\n${SUBCOMMAND_HELP['sync']}`, 2);
      if (!/^[0-9a-f]{40}$/.test(v)) {
        die(`--resolved-sha must be a 40-character lowercase hex string; got: "${v}"\n\n${SUBCOMMAND_HELP['sync']}`, 2);
      }
      resolvedShaOverride = v;
    } else {
      die(`Unknown flag: ${a}\n\n${SUBCOMMAND_HELP['sync']}`, 2);
    }
  }

  if (!['apply', 'check', 'dry-run'].includes(mode)) {
    die(`Invalid --mode value: "${mode}". Must be apply, check, or dry-run.\n\n${SUBCOMMAND_HELP['sync']}`, 2);
  }

  // CS11b: --resolved-sha only meaningful in apply mode (only apply writes the lock).
  if (resolvedShaOverride !== null && mode !== 'apply') {
    die(`--resolved-sha is only valid with --mode=apply (got mode: "${mode}").\n\n${SUBCOMMAND_HELP['sync']}`, 2);
  }

  const { sync: syncFn } = await import('../lib/sync.mjs');

  try {
    const result = await syncFn({
      consumerRepoPath: cwd,
      harnessRepoPath: REPO_ROOT,
      mode,
      acceptMajor,
      resolvedShaOverride,
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
  // Blocker 1: --mode is not allowed on check (it is always read-only)
  const hasMode = args.some(a => a === '--mode' || a.startsWith('--mode=') || a === '--dry-run');
  if (hasMode) {
    die('harness check: --mode and --dry-run are not allowed (check is read-only)', 2);
  }
  return cmdSync(args, global, 'check');
}

// ---------------------------------------------------------------------------
// Subcommand: lint
// ---------------------------------------------------------------------------

async function cmdLint(args, _global) {
  let quiet = false;
  let only = null;
  let skip = new Set();
  let publicArtifactDir = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') {
      process.stdout.write(SUBCOMMAND_HELP['lint']);
      process.exit(0);
    } else if (a === '--quiet') {
      quiet = true;
    } else if (a === '--only') {
      if (!args[i + 1] || args[i + 1].startsWith('-')) die('harness lint: missing value for --only', 2);
      only = new Set(args[++i].split(',').map((s) => s.trim()).filter(Boolean));
    } else if (a.startsWith('--only=')) {
      only = new Set(a.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean));
    } else if (a === '--skip') {
      if (!args[i + 1] || args[i + 1].startsWith('-')) die('harness lint: missing value for --skip', 2);
      skip = new Set(args[++i].split(',').map((s) => s.trim()).filter(Boolean));
    } else if (a.startsWith('--skip=')) {
      skip = new Set(a.slice('--skip='.length).split(',').map((s) => s.trim()).filter(Boolean));
    } else if (a === '--public-artifact-dir') {
      if (!args[i + 1] || args[i + 1].startsWith('-')) die('harness lint: missing value for --public-artifact-dir', 2);
      publicArtifactDir = args[++i];
    } else {
      die(`Unknown flag: ${a}\n\n${SUBCOMMAND_HELP['lint']}`, 2);
    }
  }

  const cwd = _global.cwd ?? process.cwd();

  // Resolve composed-files list and local_blocks allowlists from harness.config.json.
  // Schema: composed.files is string[] (file paths relative to cwd).
  // NOTE: public_artifact_redaction has no target_dir in the schema — it is a
  // per-artifact-type map. Public-artifact linting is only enabled via --public-artifact-dir.
  let composedFilePaths = [];
  let localBlocks = {};
  const cfgPath = path.join(cwd, 'harness.config.json');
  const effectiveConfigPath = _global.config ?? cfgPath;
  if (existsSync(effectiveConfigPath)) {
    try {
      const cfg = JSON.parse(readFileSync(effectiveConfigPath, 'utf8'));
      if (Array.isArray(cfg.composed?.files)) {
        composedFilePaths = cfg.composed.files;
      }
      if (cfg.local_blocks && typeof cfg.local_blocks === 'object') {
        localBlocks = cfg.local_blocks;
      }
    } catch {
      // ignore — let the per-linter validation surface config issues
    }
  }

  const publicDir = publicArtifactDir;
  const lockPath = path.join(cwd, '.harness-lock.json');

  // Linter table
  const linters = [
    {
      name: 'learnings',
      script: 'check-learnings.mjs',
      args: ['--file', path.join(cwd, 'LEARNINGS.md')],
      target: path.join(cwd, 'LEARNINGS.md'),
    },
    {
      name: 'context',
      script: 'check-context.mjs',
      args: ['--file', path.join(cwd, 'CONTEXT.md'), '--cwd', cwd],
      target: path.join(cwd, 'CONTEXT.md'),
    },
    {
      name: 'workboard',
      script: 'check-workboard.mjs',
      args: ['--file', path.join(cwd, 'WORKBOARD.md')],
      target: path.join(cwd, 'WORKBOARD.md'),
    },
    {
      name: 'architecture',
      script: 'check-architecture.mjs',
      args: ['--file', path.join(cwd, 'ARCHITECTURE.md')],
      target: path.join(cwd, 'ARCHITECTURE.md'),
    },
    {
      name: 'clickstop',
      script: 'check-clickstop.mjs',
      args: ['--dir', path.join(cwd, 'project', 'clickstops')],
      target: path.join(cwd, 'project', 'clickstops'),
    },
    {
      name: 'instructions',
      script: 'check-instructions.mjs',
      args: ['--file', path.join(cwd, 'INSTRUCTIONS.md')],
      target: path.join(cwd, 'INSTRUCTIONS.md'),
    },
    {
      name: 'readme',
      script: 'check-readme.mjs',
      args: ['--file', path.join(cwd, 'README.md')],
      target: path.join(cwd, 'README.md'),
    },
    // composed-blocks: one invocation per composed file (skipped if none)
    ...composedFilePaths.map((filePath) => {
      const cf = path.join(cwd, filePath);
      const allowedIds = Array.isArray(localBlocks[filePath]) ? localBlocks[filePath] : [];
      const composedArgs = ['--file', cf];
      if (allowedIds.length) composedArgs.push('--allowed-ids', allowedIds.join(','));
      if (existsSync(lockPath)) composedArgs.push('--lock', lockPath);
      return {
        name: `composed-blocks:${path.basename(cf)}`,
        script: 'check-composed-blocks.mjs',
        args: composedArgs,
        target: cf,
      };
    }),
    {
      name: 'workflow-pins',
      script: 'check-workflow-pins.mjs',
      args: [
        '--dir', path.join(cwd, '.github', 'workflows'),
        ...(existsSync(effectiveConfigPath) ? ['--config', effectiveConfigPath] : []),
      ],
      target: path.join(cwd, '.github', 'workflows'),
    },
    {
      // CS03c: text-encoding linter (BOM + line endings). Walks the consumer cwd
      // recursively. Always enabled; can be skipped via --skip text-encoding.
      name: 'text-encoding',
      script: 'check-text-encoding.mjs',
      args: ['--dir', cwd],
      target: cwd,
    },
    {
      name: 'public-artifact',
      script: 'check-public-artifact.mjs',
      args: publicDir
        ? ['--dir', publicDir, ...(existsSync(effectiveConfigPath) ? ['--config', effectiveConfigPath] : [])]
        : null,
      target: publicDir,
    },
    // CS07: generic policy linters. Targets are project-level files that may
    // not exist in every consumer repo; skipped by the standard target-not-found logic.
    {
      name: 'pr-body',
      script: 'check-pr-body.mjs',
      args: ['--file', path.join(cwd, '.github', 'PR_BODY.md')],
      target: path.join(cwd, '.github', 'PR_BODY.md'),
    },
    {
      name: 'commit-trailers',
      script: 'check-commit-trailers.mjs',
      args: ['--file', path.join(cwd, '.git', 'COMMIT_EDITMSG')],
      target: path.join(cwd, '.git', 'COMMIT_EDITMSG'),
    },
    {
      name: 'compose-v2',
      script: 'check-compose-v2.mjs',
      args: existsSync(path.join(cwd, 'compose.yaml'))
        ? ['--file', path.join(cwd, 'compose.yaml')]
        : ['--file', path.join(cwd, 'docker-compose.yml')],
      target: existsSync(path.join(cwd, 'compose.yaml'))
        ? path.join(cwd, 'compose.yaml')
        : path.join(cwd, 'docker-compose.yml'),
    },
    // render-deploy-summary is a renderer not a checker; not invoked by `harness lint`
  ];

  const results = [];
  let anyError = false;

  for (const linter of linters) {
    const baseName = linter.name.split(':')[0];
    if (only && !only.has(baseName)) continue;
    if (skip.has(baseName)) continue;

    if (!linter.args || !linter.target || !existsSync(linter.target)) {
      results.push({ name: linter.name, status: 'skipped', reason: 'target not found' });
      continue;
    }

    if (!quiet) {
      process.stdout.write(`\n[${linter.name}]\n`);
    }
    const linterScript = path.join(REPO_ROOT, 'scripts', linter.script);
    const fullArgs = [linterScript, ...linter.args];
    if (quiet) fullArgs.push('--quiet');
    const result = spawnSync(process.execPath, fullArgs, {
      cwd,
      stdio: quiet ? 'pipe' : 'inherit',
    });
    const exitCode = result.status ?? 1;
    results.push({ name: linter.name, status: exitCode === 0 ? 'pass' : 'fail', exitCode });
    if (exitCode !== 0) anyError = true;
  }

  // Aggregate summary
  process.stdout.write('\n=== harness lint summary ===\n');
  for (const r of results) {
    const icon = r.status === 'pass' ? '✓' : r.status === 'fail' ? '✗' : '–';
    process.stdout.write(`  ${icon} ${r.name}: ${r.status}${r.reason ? ` (${r.reason})` : ''}\n`);
  }
  const passCount = results.filter((r) => r.status === 'pass').length;
  const failCount = results.filter((r) => r.status === 'fail').length;
  const skipCount = results.filter((r) => r.status === 'skipped').length;
  process.stdout.write(`\nTotal: ${passCount} passed, ${failCount} failed, ${skipCount} skipped\n`);

  process.exit(anyError ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Subcommand: harvest (STUB)
// ---------------------------------------------------------------------------

async function cmdHarvest(args, _global) {
  for (const a of args) {
    if (a === '--help' || a === '-h') {
      process.stdout.write(SUBCOMMAND_HELP['harvest']);
      process.exit(0);
    } else if (a.startsWith('--snooze=')) {
      // recognized flag — parsed but ignored until implemented
    } else {
      die(`Unknown flag: ${a}\n\n${SUBCOMMAND_HELP['harvest']}`, 2);
    }
  }
  die('harness harvest: not yet implemented (planned: CS-TBD)', 3);
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
  let fromExistingHarness = false;
  for (const a of args) {
    if (a === '--help' || a === '-h') {
      process.stdout.write(SUBCOMMAND_HELP['check-migration']);
      process.exit(0);
    } else if (a === '--from-existing-harness') {
      fromExistingHarness = true;
    } else {
      die(`Unknown flag: ${a}\n\n${SUBCOMMAND_HELP['check-migration']}`, 2);
    }
  }
  if (!fromExistingHarness) {
    die(`harness check-migration: --from-existing-harness is required\n\n${SUBCOMMAND_HELP['check-migration']}`, 2);
  }
  die('harness check-migration: not yet implemented (planned: CS19)', 3);
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
  let fromExistingHarness = false;
  for (const a of args) {
    if (a === '--help' || a === '-h') {
      process.stdout.write(SUBCOMMAND_HELP['composed-audit']);
      process.exit(0);
    } else if (a === '--from-existing-harness') {
      fromExistingHarness = true;
    } else {
      die(`Unknown flag: ${a}\n\n${SUBCOMMAND_HELP['composed-audit']}`, 2);
    }
  }
  if (!fromExistingHarness) {
    die(`harness composed-audit: --from-existing-harness is required\n\n${SUBCOMMAND_HELP['composed-audit']}`, 2);
  }
  die('harness composed-audit: not yet implemented (planned: CS-TBD)', 3);
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
  const { cwd, config: configOverride } = global;

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

  // Validate --config path if explicitly provided
  if (configOverride !== null) {
    if (!existsSync(configOverride)) {
      die(`--config path does not exist: ${configOverride}`, 2);
    }
    const s = statSync(configOverride);
    if (!s.isFile()) {
      die(`--config must be a file: ${configOverride}`, 2);
    }
  }

  // Load config for agent_suffix
  const cfg = loadConfig(cwd, configOverride);
  const agentSuffix = cfg?.project?.agent_suffix ?? null;

  if (!agentSuffix) {
    die('harness whoami: cannot resolve agent ID — missing harness.config.json or project.agent_suffix', 2);
  }

  const agentEnvVarName = cfg?.project?.agent_env_var
    ?? `HARNESS_AGENT_${agentSuffix.toUpperCase()}_MACHINE`;

  // Derive machine-short
  const hostname = os.hostname();
  const machineShortDerived = machineShortFromHostname(hostname);
  const envVarValue = process.env[agentEnvVarName] ?? null;
  const machineShort = envVarValue ?? machineShortDerived;

  // Derive clone index from consumer cwd (Decision #20)
  const cloneSuffix = cloneSuffixFromDir(cwd);

  // Build agent ID
  let agentId = `${machineShort}-${agentSuffix}`;
  if (cloneSuffix) agentId += `-${cloneSuffix}`;

  if (explain) {
    process.stdout.write(`hostname:       ${hostname}\n`);
    process.stdout.write(`machine-short:  ${machineShortDerived} (derived from hostname)\n`);
    process.stdout.write(`env-var-name:   ${agentEnvVarName}\n`);
    process.stdout.write(`env-var-value:  ${envVarValue ?? '(not set)'}\n`);
    process.stdout.write(`effective-machine-short: ${machineShort}\n`);
    process.stdout.write(`config-suffix:  ${agentSuffix}\n`);
    process.stdout.write(`consumer-cwd:   ${cwd}\n`);
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

  // Blocker 2: --config is not yet supported for sync/check (sync engine always reads <cwd>/harness.config.json)
  if (global.config !== null && (subcommand === 'sync' || subcommand === 'check')) {
    die('--config is not yet supported for sync/check; planned for a future CS. Use --cwd to point at the consumer repo.', 2);
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
