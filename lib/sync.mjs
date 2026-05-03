/**
 * Sync orchestrator — harness sync engine.
 *
 * Orchestrates template application across the three file classes
 * (managed / composed / seeded), enforces all behavioural invariants
 * from the CS03 spec, and writes the `.harness-lock.json`.
 *
 * @module lib/sync.mjs
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { applyTemplating } from './templating.mjs';
import { readLock, writeLock } from './lock.mjs';
import { mergeComposed, computeBlockRecords } from './composed.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Public error class
// ---------------------------------------------------------------------------

/**
 * Thrown when sync cannot proceed safely.
 *
 * @property {string} code - Machine-readable error code (E<UPPERCASE>_<DESCRIPTOR>).
 */
export class SyncError extends Error {
  /**
   * @param {string} message
   * @param {string} code
   */
  constructor(message, code) {
    super(message);
    this.name = 'SyncError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Public types (JSDoc)
// ---------------------------------------------------------------------------

/**
 * @typedef {'managed'|'composed'|'seeded'} FileClass
 * @typedef {'created'|'updated'|'skipped'|'preserved'|'excluded'} FileAction
 * @typedef {'apply'|'check'|'dry-run'} SyncMode
 *
 * @typedef {{
 *   target: string,
 *   class: FileClass,
 *   action: FileAction,
 *   preview?: string
 * }} ChangeRecord
 *
 * @typedef {{
 *   mode: SyncMode,
 *   changes: ChangeRecord[],
 *   driftDetected: boolean,
 *   warnings: string[],
 *   lockBefore: object|null,
 *   lockAfter: object|null
 * }} SyncResult
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** SHA-256 of UTF-8 string, lowercase hex. */
function sha256(str) {
  return createHash('sha256').update(str, 'utf8').digest('hex');
}

/**
 * Check if a target file path is excluded per LRN-015.
 *
 * Entries without a trailing `/` are exact path matches.
 * Entries ending with `/` are directory-prefix matches (literal, not globs).
 *
 * @param {string} target - Repo-root-relative file path (forward slashes).
 * @param {string[]} excluded - Entries from config.excluded.
 * @returns {boolean}
 */
function isExcluded(target, excluded) {
  if (!excluded || excluded.length === 0) return false;
  const normalised = target.replace(/\\/g, '/');
  for (const entry of excluded) {
    if (entry.endsWith('/')) {
      // Directory prefix match.
      if (normalised.startsWith(entry) || normalised === entry.slice(0, -1)) return true;
    } else {
      if (normalised === entry) return true;
    }
  }
  return false;
}

/**
 * Resolve the semver major from a version string like `v0.1.0` or `v1.2.3`.
 * Returns null if the string is not a semver tag.
 *
 * @param {string} ref
 * @returns {number|null}
 */
function semverMajor(ref) {
  if (typeof ref !== 'string') return null;
  const m = /^v?(\d+)\./.exec(ref);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Try to resolve the harness repo's current git ref and SHA.
 *
 * @param {string} harnessRepoPath
 * @returns {{ harness_ref: string, resolved_sha: string }}
 */
function resolveHarnessRef(harnessRepoPath) {
  try {
    const sha = execSync(
      `git -C "${harnessRepoPath}" rev-parse HEAD`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();

    // Try to get an exact tag first.
    let ref;
    try {
      ref = execSync(
        `git -C "${harnessRepoPath}" describe --tags --exact-match HEAD`,
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      ).trim();
    } catch {
      // Fall back to abbreviated branch name.
      try {
        ref = execSync(
          `git -C "${harnessRepoPath}" rev-parse --abbrev-ref HEAD`,
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
        ).trim();
      } catch {
        ref = sha.slice(0, 7);
      }
    }

    // Validate SHA is 40 hex chars.
    if (/^[0-9a-f]{40}$/.test(sha)) {
      return { harness_ref: ref || sha, resolved_sha: sha };
    }
  } catch {
    // git not available or not a git repo.
  }
  return { harness_ref: 'unknown', resolved_sha: '0'.repeat(40) };
}

/**
 * Read and return the `$id` URI from `schemas/harness.config.schema.json`.
 *
 * @param {string} harnessRepoPath
 * @returns {Promise<string>}
 */
async function readConfigSchemaId(harnessRepoPath) {
  try {
    const schemaPath = path.join(harnessRepoPath, 'schemas', 'harness.config.schema.json');
    const raw = await readFile(schemaPath, 'utf8');
    const schema = JSON.parse(raw);
    return schema.$id ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Parse the Active Work table from a WORKBOARD.md string.
 * Returns true if at least one non-header, non-separator row exists.
 *
 * @param {string} content
 * @returns {boolean}
 */
function workboardHasActiveRows(content) {
  const lines = content.split('\n');
  let inActiveWork = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^##\s+Active Work/.test(trimmed)) {
      inActiveWork = true;
      continue;
    }
    if (inActiveWork) {
      // A new H2 section ends the Active Work table.
      if (/^##\s+/.test(trimmed) && !/^##\s+Active Work/.test(trimmed)) {
        inActiveWork = false;
        continue;
      }
      // Skip header row and separator row.
      if (trimmed.startsWith('|') && /^\|[-| ]+\|/.test(trimmed)) continue;
      if (trimmed.startsWith('|') && /CS-Task ID/.test(trimmed)) continue;
      // Any other non-empty table row is an active work row.
      if (trimmed.startsWith('|') && trimmed.length > 1) return true;
    }
  }
  return false;
}

/**
 * Minimal structural validation of a parsed harness.config.json.
 *
 * Validates required fields and throws SyncError on schema violations.
 * Full JSON Schema validation (Ajv) is applied via validateConfigSchema().
 *
 * @param {object} config
 * @throws {SyncError} ESYNC_INVALID_CONFIG
 */
function validateConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new SyncError('harness.config.json is not a JSON object.', 'ESYNC_INVALID_CONFIG');
  }
  if (typeof config.version !== 'string' || !config.version) {
    throw new SyncError(
      'harness.config.json is missing required field "version".',
      'ESYNC_INVALID_CONFIG'
    );
  }
  if (!config.project || typeof config.project !== 'object') {
    throw new SyncError(
      'harness.config.json is missing required field "project".',
      'ESYNC_INVALID_CONFIG'
    );
  }
  if (typeof config.project.name !== 'string' || !config.project.name) {
    throw new SyncError(
      'harness.config.json is missing required field "project.name".',
      'ESYNC_INVALID_CONFIG'
    );
  }
  if (typeof config.project.agent_suffix !== 'string' || !config.project.agent_suffix) {
    throw new SyncError(
      'harness.config.json is missing required field "project.agent_suffix".',
      'ESYNC_INVALID_CONFIG'
    );
  }
}

/**
 * Validate the structural shape of fields sync iterates, using AJV against
 * `schemas/harness.config.schema.json`. Also checks for duplicate target paths
 * across managed/composed/seeded file classes.
 *
 * Called AFTER the `composed_block_migrations` guard so that guard keeps its
 * existing error code even when migration specs are structurally invalid JSON.
 *
 * @param {object} config
 * @param {string} harnessRepoPath
 * @throws {SyncError} ESYNC_INVALID_CONFIG on schema violation.
 * @throws {SyncError} EBADCONFIG_DUP_PATH on duplicate path across file classes.
 */
function validateConfigSchema(config, harnessRepoPath) {
  // AJV schema validation.
  let schema;
  try {
    schema = JSON.parse(
      readFileSync(path.join(harnessRepoPath, 'schemas', 'harness.config.schema.json'), 'utf8')
    );
  } catch {
    // Schema file unavailable — skip AJV validation gracefully.
    schema = null;
  }
  if (schema) {
    const ajv = new Ajv2020({ strict: false, validateSchema: false });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    if (!validate(config)) {
      const firstErr = validate.errors?.[0];
      throw new SyncError(
        `harness.config.json failed schema validation: ` +
        `${firstErr?.message ?? 'unknown'} at "${firstErr?.instancePath ?? '/'}"`,
        'ESYNC_INVALID_CONFIG'
      );
    }
  }

  // Duplicate target path check across managed / composed / seeded.
  const seen = new Set();
  for (const target of [
    ...(config.managed?.files ?? []),
    ...(config.composed?.files ?? []),
    ...(config.seeded?.files ?? []),
  ]) {
    if (seen.has(target)) {
      throw new SyncError(
        `Duplicate target path "${target}" appears in more than one file class ` +
        `(managed / composed / seeded). Each path may appear in only one class.`,
        'EBADCONFIG_DUP_PATH'
      );
    }
    seen.add(target);
  }
}

/**
 * Ensure a directory exists, creating it recursively if needed.
 *
 * @param {string} dirPath
 */
async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

/**
 * Read a file and return its content, or null if it does not exist.
 *
 * @param {string} filePath
 * @returns {Promise<string|null>}
 */
async function readFileOrNull(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Resolve the `allowedBlockIds` for a composed file per LRN-009.
 *
 * `composed.overrides[file].local_blocks` is authoritative.
 * Falls back to top-level `local_blocks[file]` if the override is absent.
 * Emits a warning (returned as a string) if both are present and disagree.
 *
 * @param {string} target - File path (repo-root-relative).
 * @param {object} config - Parsed harness.config.json.
 * @returns {{ allowedBlockIds: string[], warning: string|null }}
 */
function resolveAllowedBlockIds(target, config) {
  const overrideBlocks = config.composed?.overrides?.[target]?.local_blocks;
  const topLevelBlocks = config.local_blocks?.[target];

  if (overrideBlocks != null && topLevelBlocks != null) {
    const overrideSet = new Set(overrideBlocks);
    const topSet = new Set(topLevelBlocks);
    const agrees =
      overrideSet.size === topSet.size &&
      [...overrideSet].every(id => topSet.has(id));

    const warning = agrees
      ? null
      : `local_blocks for "${target}" is defined in both composed.overrides and top-level ` +
        `local_blocks with different values. Using composed.overrides (authoritative per LRN-009). ` +
        `Remove top-level local_blocks in the next config update.`;
    return { allowedBlockIds: overrideBlocks, warning };
  }

  if (overrideBlocks != null) return { allowedBlockIds: overrideBlocks, warning: null };
  if (topLevelBlocks != null) return { allowedBlockIds: topLevelBlocks, warning: null };
  return { allowedBlockIds: [], warning: null };
}

// ---------------------------------------------------------------------------
// Main sync function
// ---------------------------------------------------------------------------

/**
 * Sync the harness templates into a consumer repo per the consumer's harness.config.json.
 *
 * @param {object} args
 * @param {string} args.consumerRepoPath - Absolute path to consumer repo root.
 * @param {string} args.harnessRepoPath - Absolute path to harness repo root
 *   (where `template/`, `schemas/`, etc. live).
 * @param {'apply'|'check'|'dry-run'} args.mode
 * @param {boolean} [args.acceptMajor=false] - Required to sync across a major harness
 *   version bump (config.version major differs from lock.harness_ref major).
 * @param {object} [args.legacyMapping] - Loaded `legacy_composed_mapping.json` content,
 *   if any. Applied to all composed files (the engine picks relevant regions per file).
 * @returns {Promise<SyncResult>}
 * @throws {SyncError} On any per-file or config failure that prevents safe sync.
 */
export async function sync(args) {
  const {
    consumerRepoPath,
    harnessRepoPath,
    mode,
    acceptMajor = false,
    legacyMapping = null,
  } = args;

  if (!['apply', 'check', 'dry-run'].includes(mode)) {
    throw new SyncError(`Invalid mode: "${mode}". Must be apply, check, or dry-run.`, 'ESYNC_INVALID_MODE');
  }

  const warnings = [];
  let driftDetected = false;

  // ── Step 1: Load and validate consumer config ───────────────────────────
  const configPath = path.join(consumerRepoPath, 'harness.config.json');
  const configRaw = await readFileOrNull(configPath);
  if (configRaw === null) {
    throw new SyncError(
      `harness.config.json not found at ${configPath}`,
      'ESYNC_NO_CONFIG'
    );
  }

  let config;
  try {
    config = JSON.parse(configRaw);
  } catch (err) {
    throw new SyncError(
      `harness.config.json is not valid JSON: ${err.message}`,
      'ESYNC_INVALID_CONFIG'
    );
  }

  validateConfig(config);

  // ── Step 2: composed_block_migrations reject (LRN-010) ──────────────────
  // NOTE: this check runs BEFORE full AJV schema validation so legacy test
  // configs with structurally-invalid migration specs still produce
  // EMIGRATIONSPEC_UNSUPPORTED (not ESYNC_INVALID_CONFIG).
  if (config.composed_block_migrations != null) {
    const mig = config.composed_block_migrations;
    const hasContent = typeof mig === 'object' && Object.keys(mig).length > 0;
    if (hasContent) {
      throw new SyncError(
        'harness.config.json contains "composed_block_migrations" with content. ' +
        'The v0.1.0 sync engine does not perform block migrations at runtime. ' +
        'Remove or empty this field to proceed.',
        'EMIGRATIONSPEC_UNSUPPORTED'
      );
    }
  }

  // ── Step 3: Full schema + duplicate path validation ──────────────────────
  validateConfigSchema(config, harnessRepoPath);

  // ── Step 4: Read existing lock ───────────────────────────────────────────
  const lockBefore = await readLock(consumerRepoPath);

  // ── Step 5: Major-version check ─────────────────────────────────────────
  if (lockBefore) {
    const prevMajor = semverMajor(lockBefore.harness_ref);
    const newMajor = semverMajor(config.version);
    if (prevMajor !== null && newMajor !== null && prevMajor !== newMajor && !acceptMajor) {
      throw new SyncError(
        `Major harness version bump detected: previous lock was "${lockBefore.harness_ref}" ` +
        `(major ${prevMajor}), new config targets "${config.version}" (major ${newMajor}). ` +
        `Pass acceptMajor: true to proceed.`,
        'ESYNC_MAJOR_VERSION_MISMATCH'
      );
    }
  }

  // ── Step 6: Mid-CS warning ───────────────────────────────────────────────
  const workboardPath = path.join(consumerRepoPath, 'WORKBOARD.md');
  const workboardContent = await readFileOrNull(workboardPath);
  if (workboardContent !== null && workboardHasActiveRows(workboardContent)) {
    warnings.push(
      'WORKBOARD.md has active CS rows. ' +
      'Syncing mid-CS may cause process-shape changes mid-flight. Proceed with caution.'
    );
  }

  // ── Resolve harness ref info ─────────────────────────────────────────────
  const { harness_ref, resolved_sha } = resolveHarnessRef(harnessRepoPath);
  const config_schema_version = await readConfigSchemaId(harnessRepoPath);

  // ── Build list of all files to process ──────────────────────────────────
  const excluded = Array.isArray(config.excluded) ? config.excluded : [];

  /** @type {Array<{target: string, class: FileClass}>} */
  const allFiles = [];
  for (const target of (config.managed?.files ?? [])) {
    allFiles.push({ target, class: 'managed' });
  }
  for (const target of (config.composed?.files ?? [])) {
    allFiles.push({ target, class: 'composed' });
  }
  for (const target of (config.seeded?.files ?? [])) {
    allFiles.push({ target, class: 'seeded' });
  }

  // ── Lock-before block index (for DROPPED block detection) ───────────────
  /** @type {Map<string, object[]>} target → previous block records */
  const prevBlockRecords = new Map();
  if (lockBefore?.files) {
    for (const entry of lockBefore.files) {
      if (entry.class === 'composed' && Array.isArray(entry.blocks)) {
        prevBlockRecords.set(entry.target, entry.blocks);
      }
    }
  }

  const templatingVars = config.templating ?? {};

  // ────────────────────────────────────────────────────────────────────────
  // PLAN PHASE: compute all intended outputs in memory. NO file writes.
  // Any per-file failure throws here; if we reach the end, all targets are
  // safe to write. Only then do we enter the commit phase.
  // ────────────────────────────────────────────────────────────────────────

  /**
   * @typedef {{
   *   target: string,
   *   class: FileClass,
   *   filePath: string,
   *   writeContent: string|null,
   *   action: FileAction,
   *   changeRecord: ChangeRecord,
   *   lockEntry: object
   * }} PlannedFile
   */
  /** @type {PlannedFile[]} */
  const planned = [];

  for (const { target, class: fileClass } of allFiles) {
    if (isExcluded(target, excluded)) {
      planned.push({
        target,
        class: fileClass,
        filePath: null,
        writeContent: null,
        action: 'excluded',
        changeRecord: { target, class: fileClass, action: 'excluded' },
        lockEntry: {
          target,
          source_template: `template/${fileClass}/${target}`,
          class: fileClass,
          rendered_hash: '0'.repeat(64),
          action: 'excluded',
        },
      });
      continue;
    }

    // Load template.
    const templatePath = path.join(harnessRepoPath, 'template', fileClass, target);
    const templateRaw = await readFileOrNull(templatePath);
    if (templateRaw === null) {
      throw new SyncError(
        `Template file not found: ${templatePath} (required for ${fileClass} target "${target}")`,
        'ESYNC_MISSING_TEMPLATE'
      );
    }

    const rendered = applyTemplating(templateRaw, templatingVars);
    const consumerFilePath = path.join(consumerRepoPath, ...target.split('/'));
    const currentContent = await readFileOrNull(consumerFilePath);

    // ── Managed ─────────────────────────────────────────────────────────
    if (fileClass === 'managed') {
      const renderedHash = sha256(rendered);
      const currentHash = currentContent !== null ? sha256(currentContent) : null;
      const isDrift = currentHash !== renderedHash;

      // apply: write only when content would differ (Fix #5 — no redundant writes)
      const shouldWrite = mode === 'apply' && (currentContent === null || isDrift);

      const action = currentContent === null ? 'created' : (isDrift ? 'updated' : 'skipped');
      if (mode !== 'apply' && isDrift) driftDetected = true;

      /** @type {ChangeRecord} */
      const changeRecord = { target, class: 'managed', action };
      if (mode === 'dry-run') changeRecord.preview = rendered;

      planned.push({
        target,
        class: 'managed',
        filePath: consumerFilePath,
        writeContent: shouldWrite ? rendered : null,
        action,
        changeRecord,
        lockEntry: {
          target,
          source_template: `template/managed/${target}`,
          class: 'managed',
          rendered_hash: renderedHash,
          action,
        },
      });
      continue;
    }

    // ── Seeded ───────────────────────────────────────────────────────────
    if (fileClass === 'seeded') {
      const isPresent = currentContent !== null;

      if (!isPresent && mode !== 'apply') driftDetected = true;

      const action = isPresent ? 'preserved' : 'created';
      const shouldWrite = mode === 'apply' && !isPresent;

      /** @type {ChangeRecord} */
      const changeRecord = { target, class: 'seeded', action };
      if (mode === 'dry-run' && action === 'created') changeRecord.preview = rendered;

      planned.push({
        target,
        class: 'seeded',
        filePath: consumerFilePath,
        writeContent: shouldWrite ? rendered : null,
        action,
        changeRecord,
        lockEntry: {
          target,
          source_template: `template/seeded/${target}`,
          class: 'seeded',
          rendered_hash: isPresent ? sha256(currentContent) : sha256(rendered),
          action,
        },
      });
      continue;
    }

    // ── Composed ─────────────────────────────────────────────────────────
    if (fileClass === 'composed') {
      const { allowedBlockIds, warning: allowedWarning } = resolveAllowedBlockIds(target, config);
      if (allowedWarning) warnings.push(allowedWarning);

      const lockRecords = prevBlockRecords.get(target) ?? null;

      let mergeResult;
      try {
        mergeResult = mergeComposed(rendered, currentContent ?? '', {
          allowedBlockIds,
          legacyMapping,
          lockRecords,
        });
      } catch (err) {
        throw new SyncError(
          `Composed merge failed for "${target}": ${err.message}`,
          err.code ?? 'ESYNC_COMPOSED_MERGE_FAILED'
        );
      }

      if (mergeResult.warnings) warnings.push(...mergeResult.warnings);

      const mergedContent = mergeResult.content;
      const mergedHash = sha256(mergedContent);
      const currentHash = currentContent !== null ? sha256(currentContent) : null;
      const isDrift = currentHash !== mergedHash;

      // apply: write only when content would differ (Fix #5 — no redundant writes)
      const shouldWrite = mode === 'apply' && (currentContent === null || isDrift);

      const action = currentContent === null ? 'created' : (isDrift ? 'updated' : 'skipped');
      if (mode !== 'apply' && isDrift) driftDetected = true;

      const blockRecords = computeBlockRecords(mergeResult, rendered);

      /** @type {ChangeRecord} */
      const changeRecord = { target, class: 'composed', action };
      if (mode === 'dry-run') changeRecord.preview = mergedContent;

      planned.push({
        target,
        class: 'composed',
        filePath: consumerFilePath,
        writeContent: shouldWrite ? mergedContent : null,
        action,
        changeRecord,
        lockEntry: {
          target,
          source_template: `template/composed/${target}`,
          class: 'composed',
          rendered_hash: mergedHash,
          action,
          blocks: blockRecords,
        },
      });
      continue;
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // Build result structures from plan (no writes yet).
  // ────────────────────────────────────────────────────────────────────────
  const lockFileEntries = planned.map(p => p.lockEntry);
  const changes = planned.map(p => p.changeRecord);

  const scaffolds = Array.isArray(config.scaffolds) ? config.scaffolds : [];

  /** @type {object} */
  const lockAfter = {
    harness_ref,
    resolved_sha,
    config_schema_version,
    synced_at: new Date().toISOString(),
    files: lockFileEntries.filter(e => e.action !== 'excluded'),
    scaffolds: scaffolds.map(name => ({ name, version: harness_ref })),
    excluded,
  };

  // ────────────────────────────────────────────────────────────────────────
  // COMMIT PHASE: write files then lock (apply mode only).
  // All plan-phase errors have already been thrown; reaching here means
  // every target succeeded in memory. A write failure here is non-recoverable
  // but the lock state will reflect partial progress on the next sync.
  // ────────────────────────────────────────────────────────────────────────
  if (mode === 'apply') {
    for (const p of planned) {
      if (p.writeContent !== null) {
        await ensureDir(path.dirname(p.filePath));
        await writeFile(p.filePath, p.writeContent, 'utf8');
      }
    }
    await writeLock(consumerRepoPath, lockAfter);
  }

  return {
    mode,
    changes,
    driftDetected,
    warnings,
    lockBefore,
    lockAfter: mode === 'apply' ? lockAfter : lockAfter,
  };
}
