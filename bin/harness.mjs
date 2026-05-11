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

Detects the GitHub repository tier (CS15e: visibility + plan from
api.github.com) and records the result in a new \`constraints\` block on
harness.config.json plus a seeded \`.harness-known-constraints.md\` file.
For private-free repos, the disposition (default: discipline-only) is
also recorded. See docs/adr/0003-constraints-field.md for details.

Options:
  --from-example=<gwn|si|self>          Use a bundled example config as the initial config
  --with-scaffold <name>                Drop the named scaffold (repeatable; also accepts --with-scaffold=<name>)
  --constraint-disposition <name>       Force the disposition for private-free repos:
                                          discipline-only | upgrade-pro | flip-public-when-ready
                                          (default: discipline-only)
  --skip-constraint-detection           Skip the GitHub-tier detection step entirely
                                          (no constraints block written; useful in CI without network)
  --help                                Print this help
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
  --config <path>               Path to harness.config.json (CS15c/CS04b: now
                                wired through to the sync engine; replaces the
                                default <cwd>/harness.config.json entirely).
  --ref <ref>                   PLANNED — not yet implemented; set 'version' in
                                harness.config.json to pin a harness version.
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
  --config <path> Path to harness.config.json (CS15c/CS04b: wired through).
  --ref <ref>     PLANNED — not yet implemented (set 'version' in
                  harness.config.json to pin).
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
  - check-fixtures.mjs    (tests/fixtures/ — gitignored fixture paths; LRN-076)
  - check-templates.mjs   (template/ subtree — LRN-049/050/051 template-authoring rules)
  - check-public-artifact.mjs (skipped unless --public-artifact-dir or config provides one)
  - check-pr-body.mjs     (.github/PR_BODY.md if present)
  - check-commit-trailers.mjs (.git/COMMIT_EDITMSG if present)
  - check-compose-v2.mjs  (compose.yaml or docker-compose.yml if present)

Self-host-only (when package.json.name === '@henrik-me/agent-harness'):
  - check-pack.mjs        (package whitelist)
  - check-scaffold-readme.mjs (one invocation per scaffolds/<name>/README.md; LRN-077)

Auto-dispatched scaffold policy linters (when harness.config.json declares
the scaffold AND the consumer ships the corresponding script in scripts/):
  - scaffolds: ["migrations"]    → migration-policy    (scripts/check-migration-policy.mjs)
  - scaffolds: ["feature-flags"] → feature-flag-policy (scripts/check-feature-flag-policy.mjs)
  Missing scripts are graceful-skipped (matches pr-body/compose-v2 pattern).

Linters whose target does not exist are skipped (and noted in the summary).

Options:
  --quiet                   Suppress per-linter detail; print only the final aggregate summary
  --cwd <path>              Repo path (default: cwd)
  --only <name1,name2>      Run only named linters (e.g. --only learnings,context)
  --skip <name1,name2>      Skip named linters
  --public-artifact-dir <p> Override target dir for check-public-artifact
  --explain <linter-name>   Print rules + canonical seed path for a supported linter and exit 0
                            (currently: architecture, text-encoding, workboard)
  --help                    Print this help

Aliases:
  harness lint:NAME         Equivalent to: harness lint --only NAME
                            (e.g. harness lint:text-encoding)

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
  let constraintDisposition = null;
  let skipConstraintDetection = false;
  const VALID_DISPOSITIONS = ['discipline-only', 'upgrade-pro', 'flip-public-when-ready'];

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
    } else if (a === '--constraint-disposition') {
      if (i + 1 >= args.length || args[i + 1].startsWith('-')) {
        die(`--constraint-disposition requires a value (one of: ${VALID_DISPOSITIONS.join(', ')})\n\n${SUBCOMMAND_HELP['init']}`, 2);
      }
      constraintDisposition = args[++i];
    } else if (a.startsWith('--constraint-disposition=')) {
      const v = a.slice('--constraint-disposition='.length);
      if (!v) die(`--constraint-disposition= requires a value (one of: ${VALID_DISPOSITIONS.join(', ')})\n\n${SUBCOMMAND_HELP['init']}`, 2);
      constraintDisposition = v;
    } else if (a === '--skip-constraint-detection') {
      skipConstraintDetection = true;
    } else if (!a.startsWith('-')) {
      targetDir = path.resolve(cwd, a);
    } else {
      die(`Unknown flag: ${a}\n\n${SUBCOMMAND_HELP['init']}`, 2);
    }
  }

  if (constraintDisposition !== null && !VALID_DISPOSITIONS.includes(constraintDisposition)) {
    die(
      `Invalid --constraint-disposition value: "${constraintDisposition}". Valid: ${VALID_DISPOSITIONS.join(', ')}`,
      2
    );
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
      // .harness-known-constraints.md is written by the constraint-detection
      // block below (with substituted tokens). Skip the verbatim seeded copy.
      if (entry.name === '.harness-known-constraints.md') continue;
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

  // ---------------------------------------------------------------------------
  // CS15e: GitHub-tier detection + constraints recording
  // ---------------------------------------------------------------------------
  // Detects repo visibility + plan via api.github.com (γ1 helper), records the
  // result in three places:
  //   1. .harness-known-constraints.md (seeded skeleton with substituted tokens)
  //   2. harness.config.json constraints block (via lib/config-reader.mjs)
  //   3. CONTEXT.md `## Constraints` body (idempotent one-line reference)
  // The flow is skippable via --skip-constraint-detection (no GitHub API calls,
  // no constraints written). The disposition (private-free only) is configurable
  // via --constraint-disposition; defaults to discipline-only.
  if (skipConstraintDetection) {
    process.stdout.write('Skipped tier detection (--skip-constraint-detection)\n');
  } else if (!existsSync(configDest)) {
    process.stderr.write(
      'Warning: harness.config.json not present; skipping constraint detection.\n'
    );
  } else {
    let detection;
    // Test-only escape hatch (γ4): allows CLI tests to inject deterministic
    // detection results without making real GitHub API calls. Live invocations
    // never set this; documented as test-only in tests/cli.test.mjs.
    if (process.env.HARNESS_DETECT_TIER_OVERRIDE) {
      try {
        detection = JSON.parse(process.env.HARNESS_DETECT_TIER_OVERRIDE);
      } catch (err) {
        die(
          `HARNESS_DETECT_TIER_OVERRIDE is not valid JSON: ${err.message}`,
          1
        );
      }
    } else {
      const { detectRepoTier } = await import('../lib/detect-repo-tier.mjs');
      detection = await detectRepoTier({ cwd: targetDir });
    }

    const detectedAt = new Date().toISOString();
    const tier = detection.tier;
    const owner = detection.owner ?? null;
    const repo = detection.repo ?? null;

    // Resolve disposition: only meaningful for private-free; explicit override
    // wins; default discipline-only for private-free; null/omit otherwise.
    let disposition = null;
    if (tier === 'private-free') {
      disposition = constraintDisposition ?? 'discipline-only';
      // CS15e plan line 110 + LRN-064 review gap fix: surface the disposition
      // option set at init time so consumers see the choices without having to
      // open the artifact. Always printed for private-free, regardless of
      // whether the user passed --constraint-disposition.
      process.stdout.write(
        'Repository tier is private-free (free plan + private repo). ' +
        'GitHub-side branch protection is unavailable on this tier.\n' +
        'Disposition options:\n' +
        '  - discipline-only      (default — operate without GitHub-side enforcement)\n' +
        '  - upgrade-pro          (upgrade plan to enable branch protection)\n' +
        '  - flip-public-when-ready (defer; plan to make the repo public)\n' +
        `Selected disposition: ${disposition}\n`
      );
    } else if (constraintDisposition !== null) {
      // Override on a non-private-free tier: warn but record nothing in
      // constraints (the schema rejects disposition + non-private-free).
      process.stderr.write(
        `Warning: --constraint-disposition=${constraintDisposition} ignored ` +
        `(tier is "${tier}", not "private-free").\n`
      );
    }

    // (1) Write .harness-known-constraints.md from the seeded template with
    //     token substitution. Always overwritten on re-runs (idempotent).
    if (owner && repo) {
      try {
        const tplPath = path.join(REPO_ROOT, 'template', 'seeded', '.harness-known-constraints.md');
        let body = stripBOM(readFileSync(tplPath, 'utf8'));
        // Strip the leading HTML comment that documents substitution tokens
        // (it's editor-facing metadata, not for the runtime artifact).
        body = body.replace(/^<!--[\s\S]*?-->\s*\n/, '');
        body = body
          .replaceAll('<TIER>', tier)
          .replaceAll('<DETECTED_AT>', detectedAt)
          .replaceAll('<OWNER>', owner)
          .replaceAll('<REPO>', repo);
        if (disposition) {
          body = body.replaceAll('<DISPOSITION>', disposition);
        } else {
          // Strip any line containing the <DISPOSITION> token entirely.
          body = body.split('\n').filter((line) => !line.includes('<DISPOSITION>')).join('\n');
        }
        const dest = path.join(targetDir, '.harness-known-constraints.md');
        writeFileSync(dest, body, 'utf8');
        process.stdout.write(`Created .harness-known-constraints.md\n`);
      } catch (err) {
        process.stderr.write(
          `Warning: could not write .harness-known-constraints.md: ${err.message}\n`
        );
      }
    } else {
      process.stdout.write(
        `Skipped .harness-known-constraints.md (tier=${tier}, reason=${detection.reason ?? 'no-repo-data'})\n`
      );
    }

    // (2) Merge constraints into harness.config.json via lib/config-reader.mjs.
    if (owner && repo) {
      try {
        const { loadConfig: lcfg, writeConfig: wcfg } = await import('../lib/config-reader.mjs');
        const { config: existingCfg } = await lcfg({ cwd: targetDir });
        const constraints = { tier, detected_at: detectedAt, owner, repo };
        if (disposition) constraints.disposition = disposition;
        existingCfg.constraints = constraints;
        await wcfg({ cwd: targetDir, config: existingCfg });
        process.stdout.write(`Recorded constraints in harness.config.json\n`);
      } catch (err) {
        process.stderr.write(
          `Warning: could not merge constraints into harness.config.json: ${err.message}\n`
        );
      }
    }

    // (3) Update CONTEXT.md `## Constraints` body with a one-line reference.
    //     Idempotent: replaces the existing body (whether placeholder or prior
    //     init output) under the heading; appends the heading if missing.
    //     LRN-064 review gap fix: JS regex has no `\Z` anchor (was being
    //     interpreted as literal "Z"). Use `$(?![\s\S])` for true EOF or the
    //     next H2 boundary, whichever comes first.
    if (owner && repo) {
      try {
        const ctxPath = path.join(targetDir, 'CONTEXT.md');
        if (existsSync(ctxPath)) {
          const original = stripBOM(readFileSync(ctxPath, 'utf8'));
          const refLine = `See \`.harness-known-constraints.md\` for repository tier and disposition (detected ${detectedAt}).`;
          const headingRe = /^## Constraints[ \t]*\r?\n[\s\S]*?(?=^## |$(?![\s\S]))/m;
          let updated;
          if (headingRe.test(original)) {
            updated = original.replace(headingRe, `## Constraints\n\n${refLine}\n\n`);
          } else {
            const trimmed = original.replace(/\s+$/u, '');
            updated = trimmed + `\n\n## Constraints\n\n${refLine}\n`;
          }
          if (updated !== original) {
            writeFileSync(ctxPath, updated, 'utf8');
            process.stdout.write(`Updated CONTEXT.md \`## Constraints\` reference\n`);
          }
        }
      } catch (err) {
        process.stderr.write(
          `Warning: could not update CONTEXT.md: ${err.message}\n`
        );
      }
    }

    // Summary line. LRN-064 review gap fix: do NOT reference
    // .harness-known-constraints.md when we did not write it (skipped path).
    const dispText = disposition ? `, disposition=${disposition}` : '';
    if (owner && repo) {
      process.stdout.write(
        `Constraints detected: tier=${tier}${dispText}. ` +
        `See .harness-known-constraints.md for details.\n`
      );
    } else {
      const reasonText = detection.reason ? ` (reason=${detection.reason})` : '';
      process.stdout.write(
        `Constraints detection: tier=${tier}${reasonText}. ` +
        `No constraints recorded.\n`
      );
    }
  }

  // CS15c (CS09b, LRN-057 / α4 escalation): finalize init by running sync --apply
  // so composed files (CONVENTIONS.md, OPERATIONS.md, REVIEWS.md per the seeded
  // config) are materialized and the resulting repo is sync-check-clean. Without
  // this step, `harness sync --mode=check` immediately after `harness init`
  // reports drift (composed files in config but not on disk), which violates the
  // intuitive expectation that init produces a usable, validated repo.
  try {
    const { sync: syncFn } = await import('../lib/sync.mjs');
    const result = await syncFn({
      consumerRepoPath: targetDir,
      harnessRepoPath: REPO_ROOT,
      mode: 'apply',
    });
    const applied = result.changes.filter((c) => c.action !== 'skipped').length;
    if (applied > 0) {
      process.stdout.write(`Sync complete (${applied} composed/managed files materialized).\n`);
    }
  } catch (err) {
    process.stderr.write(
      `Warning: post-init sync failed: ${err.message}\n` +
      `Run \`harness sync --mode=apply\` manually to complete setup.\n`
    );
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

  // CS15c (CS04d, Option B): --ref is parsed at the global layer for forward-compat
  // but explicitly rejected at the subcommand body until pinning is implemented.
  if (ref !== null && ref !== undefined) {
    die(
      "--ref is not yet implemented. To pin a harness version, set 'version' in harness.config.json.",
      2
    );
  }

  const { sync: syncFn } = await import('../lib/sync.mjs');

  try {
    const result = await syncFn({
      consumerRepoPath: cwd,
      harnessRepoPath: REPO_ROOT,
      mode,
      acceptMajor,
      resolvedShaOverride,
      // CS15c (CS04b, LRN-027 closed): wire --config through to the sync engine.
      // When set, the override replaces <cwd>/harness.config.json entirely.
      configPath: configOverride ?? null,
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

// CS30 / D5: per-linter docstrings for `harness lint --explain <name>`.
// Stays in sync with the actual linters by colocating each entry with the
// linter's name. New linters should add an entry here when they ship.
const LINTER_EXPLANATIONS = {
  architecture: `
**Linter:** check-architecture (scripts/check-architecture.mjs)
**Target:** ARCHITECTURE.md (one per consumer repo)
**Required headings (must appear as level-2 headings, in any order):**
  - Overview
  - Components
  - Data model
  - Decision log
**Other rules:**
  - All relative internal links must resolve to existing files / fragments.

**Canonical seed:** template/seeded/ARCHITECTURE.md ships a complete skeleton
with every required heading in place. The fastest way to satisfy the linter
when starting from scratch is to copy that file and fill in the sections
rather than authoring from prose alone (LRN-CS30-feedback-#5).
`.trim(),
  'text-encoding': `
**Linter:** check-text-encoding (scripts/check-text-encoding.mjs)
**Target:** the consumer repo (or any --dir)
**Rules:**
  - No UTF-8 BOM (0xEF 0xBB 0xBF) at start of any text file.
  - No CRLF or bare-\\r line endings in any text file.
  - .gitignore is respected by default (--respect-gitignore, default ON).
    Use --no-respect-gitignore to scan ignored paths too.
**Defaults:**
  - Includes: .md, .mjs, .js, .json, .yml, .yaml, .sh, .ps1, .txt, .sql, .html, .css
  - Static excludes (always): node_modules, .git
**Why:** prevents BOM creep on Windows (LRN-006/018/065) and CRLF creep from
git core.autocrlf=true (LRN-074), both of which silently break sync drift detection.
`.trim(),
  workboard: `
**Linter:** check-workboard (scripts/check-workboard.mjs)
**Target:** WORKBOARD.md
**Rules:**
  - Must contain ## Orchestrators and ## Active Work sections.
  - Must NOT contain ## Queued or ## Recently Completed (CS28 — filesystem is
    source-of-truth: planned/ for queue, done/ for history).
**Why:** WORKBOARD is live-coordination state only; the queue and history are
file-system-derived and would drift if duplicated here.
`.trim(),
};

async function cmdLint(args, _global) {
  let quiet = false;
  let only = null;
  let skip = new Set();
  let publicArtifactDir = null;
  let explain = null;

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
    } else if (a === '--explain') {
      if (!args[i + 1] || args[i + 1].startsWith('-')) die('harness lint: missing value for --explain', 2);
      explain = args[++i];
    } else if (a.startsWith('--explain=')) {
      explain = a.slice('--explain='.length);
    } else {
      die(`Unknown flag: ${a}\n\n${SUBCOMMAND_HELP['lint']}`, 2);
    }
  }

  // CS30 / D5: --explain <linter> prints rule documentation + canonical seed/template
  // file paths for one linter. Implemented for high-value linters first; falls back
  // to a friendly "no docs yet" stub for unknown names so the contract is stable.
  if (explain) {
    const docs = LINTER_EXPLANATIONS[explain];
    if (!docs) {
      const known = Object.keys(LINTER_EXPLANATIONS).sort().join(', ');
      die(`harness lint --explain: no documentation registered for linter "${explain}". Known: ${known}`, 2);
    }
    process.stdout.write(`# harness lint --explain ${explain}\n\n${docs}\n`);
    process.exit(0);
  }

  const cwd = _global.cwd ?? process.cwd();

  // Resolve composed-files list and per-file local-block allowlists from
  // harness.config.json. Schema: composed.files is string[] (file paths
  // relative to cwd); composed.overrides[file].local_blocks is the per-file
  // allowlist (single source of truth as of v0.2.0 / LRN-009). Files in
  // composed.files without a matching composed.overrides[file] entry have an
  // empty allowlist (no local blocks permitted).
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
      const overrides = cfg.composed?.overrides;
      if (overrides && typeof overrides === 'object') {
        for (const [file, override] of Object.entries(overrides)) {
          if (Array.isArray(override?.local_blocks)) {
            localBlocks[file] = override.local_blocks;
          }
        }
      }
    } catch {
      // ignore — let the per-linter validation surface config issues
    }
  }

  const publicDir = publicArtifactDir;
  const lockPath = path.join(cwd, '.harness-lock.json');

  // CS30 / D8: print a version header at the top of every `lint` invocation
  // so CI logs make it obvious which harness produced the result.
  // Honoured even under --quiet (header is one line).
  try {
    const pkg = readPackageJSON();
    process.stdout.write(`# harness v${pkg.version} — lint (cwd: ${cwd})\n`);
  } catch {
    // pkg may not be readable in unusual self-host scenarios; fail soft.
  }

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
      // ALWAYS pass --allowed-ids for composed files (per CS02b / LRN-009):
      // an empty list explicitly forbids any local blocks, which is the
      // intended semantics for a composed file without a composed.overrides
      // entry. Without this, check-composed-blocks would treat absence of
      // --allowed-ids as "no constraint" and silently permit any block ID.
      const composedArgs = ['--file', cf, '--allowed-ids', allowedIds.join(',')];
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
      // CS13 (LRN-076): fixtures linter. Detects test-fixture paths matched by
      // .gitignore (would silently false-green on CI). Skipped if there is no
      // tests/fixtures directory.
      name: 'fixtures',
      script: 'check-fixtures.mjs',
      args: ['--dir', path.join(cwd, 'tests', 'fixtures')],
      target: path.join(cwd, 'tests', 'fixtures'),
    },
    {
      // CS15d (CS08b): templates linter. Enforces LRN-049 (no dot-notation
      // placeholders), LRN-050 (no relative-up paths), LRN-051 (no
      // self-referencing TODO/FIXME tokens in PR-template files). Skipped if
      // there is no template/ directory at the consumer cwd.
      name: 'templates',
      script: 'check-templates.mjs',
      args: ['--dir', path.join(cwd, 'template'), '--cwd', cwd],
      target: path.join(cwd, 'template'),
    },
    // CS13: pack linter. Self-host-guarded: only runs when the consumer's
    // package.json `name` matches `@henrik-me/agent-harness` (i.e. when the
    // harness repo is linting itself or a vendored copy). Other consumers
    // have their own packaging conventions and would get false failures.
    // Build the entry conditionally so target=null skips cleanly when not
    // applicable (per the standard target-not-found logic).
    (() => {
      let isSelfHost = false;
      try {
        const pkgPath = path.join(cwd, 'package.json');
        if (existsSync(pkgPath)) {
          const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
          if (pkg && pkg.name === '@henrik-me/agent-harness') isSelfHost = true;
        }
      } catch { /* fail-soft: skip pack linter on parse error */ }
      return {
        name: 'pack',
        script: 'check-pack.mjs',
        args: isSelfHost ? ['--cwd', cwd] : null,
        target: isSelfHost ? path.join(cwd, 'package.json') : null,
      };
    })(),
    // CS15d (CS10b): scaffold-readme self-host walk. One linter entry per
    // scaffolds/<name>/README.md in the harness repo itself. Self-host-guarded
    // (LRN-077) — consumer repos do not ship a scaffolds/ tree at the harness
    // root. For non-self-host consumers, emit a single skipped row to keep
    // the lint summary shape stable.
    ...(() => {
      let isSelfHost = false;
      try {
        const pkgPath = path.join(cwd, 'package.json');
        if (existsSync(pkgPath)) {
          const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
          if (pkg && pkg.name === '@henrik-me/agent-harness') isSelfHost = true;
        }
      } catch { /* fail-soft */ }
      if (!isSelfHost) {
        return [{
          name: 'scaffold-readme',
          script: 'check-scaffold-readme.mjs',
          args: null,
          target: null,
        }];
      }
      const scaffoldsDir = path.join(cwd, 'scaffolds');
      if (!existsSync(scaffoldsDir)) return [];
      const out = [];
      for (const entry of readdirSync(scaffoldsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const readmePath = path.join(scaffoldsDir, entry.name, 'README.md');
        if (!existsSync(readmePath)) continue;
        out.push({
          name: `scaffold-readme:${entry.name}`,
          script: 'check-scaffold-readme.mjs',
          args: ['--file', readmePath, '--name', entry.name],
          target: readmePath,
        });
      }
      return out;
    })(),
    // CS15d (CS10b part 2): scaffold-policy auto-dispatch. For each scaffold
    // declared in harness.config.json `scaffolds[]`, look up the deterministic
    // shipped-linter mapping and dispatch the linter from the consumer's
    // scripts/ dir. Mapping is intentional: scaffold names are plural
    // (categorical), shipped linter names are singular (per-item). Row names
    // mirror the linter basename (without `check-` prefix and `.mjs` suffix)
    // to make the dispatch source visible in the summary. New shipped scaffold
    // linters must be added to SHIPPED_SCAFFOLD_LINTERS below. Missing scripts
    // graceful-skip (matches pr-body/compose-v2 pattern).
    ...(() => {
      const SHIPPED_SCAFFOLD_LINTERS = {
        migrations: 'check-migration-policy.mjs',
        'feature-flags': 'check-feature-flag-policy.mjs',
      };
      let scaffolds = [];
      try {
        if (existsSync(effectiveConfigPath)) {
          const cfg = JSON.parse(readFileSync(effectiveConfigPath, 'utf8'));
          if (Array.isArray(cfg.scaffolds)) scaffolds = cfg.scaffolds;
        }
      } catch { /* ignore — surfaced by other linters */ }
      const out = [];
      for (const scaffoldName of scaffolds) {
        const linterScript = SHIPPED_SCAFFOLD_LINTERS[scaffoldName];
        if (!linterScript) continue;
        const consumerScriptPath = path.join(cwd, 'scripts', linterScript);
        const rowName = linterScript.replace(/^check-/, '').replace(/\.mjs$/, '');
        out.push({
          name: rowName,
          script: consumerScriptPath,
          args: ['--cwd', cwd],
          target: consumerScriptPath,
        });
      }
      return out;
    })(),
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
    const linterScript = path.isAbsolute(linter.script)
      ? linter.script
      : path.join(REPO_ROOT, 'scripts', linter.script);
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

  // CS30 / D2: support `harness lint:NAME` as a shorthand for
  // `harness lint --only NAME`. Restricted to a conservative regex so it
  // can't shadow a future legitimate subcommand. The alias rewrites
  // `subcommand` to `lint` and prepends `--only NAME` to `rest`.
  let effectiveSubcommand = subcommand;
  let effectiveRest = rest;
  const lintAliasMatch = /^lint:([a-z][a-z0-9-]+)$/.exec(subcommand);
  if (lintAliasMatch) {
    effectiveSubcommand = 'lint';
    effectiveRest = ['--only', lintAliasMatch[1], ...rest];
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

  const handler = dispatch[effectiveSubcommand];
  if (!handler) {
    process.stderr.write(`Unknown subcommand: "${subcommand}"\n\n${TOP_HELP}`);
    process.exit(2);
  }

  // Blocker 2 historical (LRN-027): the --config flag was previously parsed but
  // silently ignored, then rejected with a stop-gap exit-2 in CS04 close-out.
  // CS15c (CS04b) closes the gap by threading --config through cmdSync. The
  // stop-gap removed; cmdSync now passes global.config into syncFn as configPath.

  // If --help was a global flag but a subcommand is present, forward it to the subcommand.
  const subArgs = help ? ['--help', ...effectiveRest] : effectiveRest;

  try {
    await handler(subArgs, global);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    if (debug) process.stderr.write(err.stack + '\n');
    process.exit(1);
  }
}

main();
