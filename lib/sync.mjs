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
import { readLock, writeLock, validateLockObject, newEmptyLock } from './lock.mjs';
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
 * Canonicalize a target file path used in managed / composed / seeded file lists
 * and `composed.overrides` keys.
 *
 * Paths are treated as POSIX-style (forward slashes) in canonical form.
 * Case-sensitivity follows POSIX semantics even on case-insensitive filesystems
 * (Windows); cross-platform case-only collisions are out of scope for v0.1.0
 * and are tracked as a deferred LRN candidate.
 *
 * @param {string} rawTarget
 * @returns {string} canonical form (forward slashes, no leading `./`, no redundant segments)
 * @throws {SyncError} EBADCONFIG_INVALID_PATH on invalid input
 */
export function canonicalizeTargetPath(rawTarget) {
  if (typeof rawTarget !== 'string' || rawTarget === '') {
    throw new SyncError(
      `Invalid target path "${rawTarget}": must be a non-empty string.`,
      'EBADCONFIG_INVALID_PATH'
    );
  }
  // Check absolute / rooted forms BEFORE backslash normalization.
  if (/^\//.test(rawTarget)) {
    throw new SyncError(
      `Invalid target path "${rawTarget}": absolute Unix paths are not allowed.`,
      'EBADCONFIG_INVALID_PATH'
    );
  }
  if (/^[A-Za-z]:/.test(rawTarget)) {
    throw new SyncError(
      `Invalid target path "${rawTarget}": Windows drive-letter paths are not allowed.`,
      'EBADCONFIG_INVALID_PATH'
    );
  }
  // Catches both rooted-backslash (\foo) and UNC (\\server\share).
  if (/^\\/.test(rawTarget)) {
    throw new SyncError(
      `Invalid target path "${rawTarget}": rooted backslash and UNC paths are not allowed.`,
      'EBADCONFIG_INVALID_PATH'
    );
  }
  if (/[\x00-\x1F]/.test(rawTarget)) {
    throw new SyncError(
      `Invalid target path "${rawTarget}": control characters are not allowed.`,
      'EBADCONFIG_INVALID_PATH'
    );
  }
  const normalized = rawTarget.replace(/\\/g, '/');
  // Trailing slash is not valid for file targets (directory targets unsupported in v0.1.0).
  if (normalized.endsWith('/')) {
    throw new SyncError(
      `Invalid target path "${rawTarget}": trailing slash is not allowed for file targets ` +
      `(directory targets are not supported in v0.1.0).`,
      'EBADCONFIG_INVALID_PATH'
    );
  }
  const segments = normalized.split('/').filter(seg => seg !== '' && seg !== '.');
  if (segments.some(seg => seg === '..')) {
    throw new SyncError(
      `Invalid target path "${rawTarget}": paths must not contain ".." segments.`,
      'EBADCONFIG_INVALID_PATH'
    );
  }
  const canonical = segments.join('/');
  if (canonical === '') {
    throw new SyncError(
      `Invalid target path "${rawTarget}": must resolve to a non-empty relative file path ` +
      `(e.g. "." or "./" canonicalize to empty and are not valid file targets).`,
      'EBADCONFIG_INVALID_PATH'
    );
  }
  return canonical;
}

/**
 * Canonicalize an excluded path entry.
 *
 * Like {@link canonicalizeTargetPath} but allows a trailing `/` which marks a
 * directory-prefix exclusion (LRN-015). All other invalid forms are rejected.
 *
 * @param {string} rawPath
 * @returns {string} canonical form (trailing `/` preserved for directory entries)
 * @throws {SyncError} EBADCONFIG_INVALID_PATH on invalid input
 */
function canonicalizeExcludedPath(rawPath) {
  if (typeof rawPath !== 'string' || rawPath === '') {
    throw new SyncError(
      `Invalid excluded path "${rawPath}": must be a non-empty string.`,
      'EBADCONFIG_INVALID_PATH'
    );
  }
  if (/^\//.test(rawPath)) {
    throw new SyncError(
      `Invalid excluded path "${rawPath}": absolute Unix paths are not allowed.`,
      'EBADCONFIG_INVALID_PATH'
    );
  }
  if (/^[A-Za-z]:/.test(rawPath)) {
    throw new SyncError(
      `Invalid excluded path "${rawPath}": Windows drive-letter paths are not allowed.`,
      'EBADCONFIG_INVALID_PATH'
    );
  }
  if (/^\\/.test(rawPath)) {
    throw new SyncError(
      `Invalid excluded path "${rawPath}": rooted backslash and UNC paths are not allowed.`,
      'EBADCONFIG_INVALID_PATH'
    );
  }
  if (/[\x00-\x1F]/.test(rawPath)) {
    throw new SyncError(
      `Invalid excluded path "${rawPath}": control characters are not allowed.`,
      'EBADCONFIG_INVALID_PATH'
    );
  }
  const normalized = rawPath.replace(/\\/g, '/');
  const hasTrailingSlash = normalized.endsWith('/');
  const withoutTrailing = hasTrailingSlash ? normalized.slice(0, -1) : normalized;
  const segments = withoutTrailing.split('/').filter(seg => seg !== '' && seg !== '.');
  if (segments.some(seg => seg === '..')) {
    throw new SyncError(
      `Invalid excluded path "${rawPath}": paths must not contain ".." segments.`,
      'EBADCONFIG_INVALID_PATH'
    );
  }
  const canonical = segments.join('/');
  if (canonical === '') {
    throw new SyncError(
      `Invalid excluded path "${rawPath}": must resolve to a non-empty relative path ` +
      `(e.g. "." or "./" canonicalize to empty and are not valid exclusions).`,
      'EBADCONFIG_INVALID_PATH'
    );
  }
  return hasTrailingSlash ? canonical + '/' : canonical;
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
 * `schemas/harness.config.schema.json`. Also canonicalizes all path-bearing
 * fields and checks for duplicate target paths across managed/composed/seeded
 * file classes.
 *
 * Called AFTER the `composed_block_migrations` guard so that guard keeps its
 * existing error code even when migration specs are structurally invalid JSON.
 *
 * @param {object} config - Raw parsed harness.config.json.
 * @param {string} harnessRepoPath
 * @returns {object} A structural copy of `config` with every path-bearing field
 *   canonicalized (forward slashes, no leading `./`, no redundant segments).
 * @throws {SyncError} ESYNC_INVALID_CONFIG on schema violation.
 * @throws {SyncError} EBADCONFIG_INVALID_PATH on invalid path value.
 * @throws {SyncError} EBADCONFIG_DUP_PATH on duplicate path across file classes.
 */
function validateConfigSchema(config, harnessRepoPath) {
  // AJV schema validation (run against raw config before canonicalization).
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
      const propName = firstErr?.params?.additionalProperty;
      const propSuffix = propName ? ` (offending property: "${propName}")` : '';
      throw new SyncError(
        `harness.config.json failed schema validation: ` +
        `${firstErr?.message ?? 'unknown'} at "${firstErr?.instancePath ?? '/'}"${propSuffix}`,
        'ESYNC_INVALID_CONFIG'
      );
    }
  }

  // ── Canonicalize + dedup file targets ─────────────────────────────────────
  // canonicalizeTargetPath validates and normalizes each path (throws
  // EBADCONFIG_INVALID_PATH on invalid input). Duplicates across classes throw
  // EBADCONFIG_DUP_PATH.
  const seen = new Map(); // canonical → original (for error messages)
  const canonManagedFiles = [];
  const canonComposedFiles = [];
  const canonSeededFiles = [];

  for (const [arr, raw] of [
    [canonManagedFiles, config.managed?.files ?? []],
    [canonComposedFiles, config.composed?.files ?? []],
    [canonSeededFiles, config.seeded?.files ?? []],
  ]) {
    for (const target of raw) {
      const canonical = canonicalizeTargetPath(target);
      if (seen.has(canonical)) {
        throw new SyncError(
          `Duplicate target path "${target}" (canonical "${canonical}") appears in more than one file class ` +
          `(managed / composed / seeded). Each path may appear in only one class.`,
          'EBADCONFIG_DUP_PATH'
        );
      }
      seen.set(canonical, target);
      arr.push(canonical);
    }
  }

  // ── Canonicalize composed.overrides keys ──────────────────────────────────
  let canonComposedOverrides = config.composed?.overrides ?? {};
  if (typeof canonComposedOverrides === 'object' && !Array.isArray(canonComposedOverrides)) {
    // Use a Map for collision detection — assigning to a plain object's '__proto__' key
    // invokes the legacy setter and changes the object's prototype rather than creating
    // an own property, bypassing duplicate detection. Map sidesteps this entirely.
    // Per GPT-5.5 review #6 blocking #1.
    const entries = new Map();
    for (const [k, v] of Object.entries(canonComposedOverrides)) {
      const canonK = canonicalizeTargetPath(k);
      if (entries.has(canonK)) {
        throw new SyncError(
          `Duplicate canonical key "${canonK}" in composed.overrides ` +
          `(raw keys collide after canonicalization). Each composed file may have at most one overrides entry.`,
          'EBADCONFIG_DUP_PATH'
        );
      }
      entries.set(canonK, v);
    }
    // Object.fromEntries creates own data properties safely (including for '__proto__').
    canonComposedOverrides = Object.fromEntries(entries);
  }

  // ── Canonicalize excluded entries ─────────────────────────────────────────
  // canonicalizeExcludedPath allows a trailing `/` (directory-prefix marker).
  const canonExcluded = (config.excluded ?? []).map(canonicalizeExcludedPath);

  // ── Build and return canonical config ─────────────────────────────────────
  const canonical = { ...config };
  if (config.managed) {
    canonical.managed = { ...config.managed, files: canonManagedFiles };
  }
  if (config.composed) {
    canonical.composed = { ...config.composed, files: canonComposedFiles, overrides: canonComposedOverrides };
  }
  if (config.seeded) {
    canonical.seeded = { ...config.seeded, files: canonSeededFiles };
  }
  canonical.excluded = canonExcluded;
  return canonical;
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
 * Resolve the `allowedBlockIds` for a composed file.
 *
 * Source of truth: `composed.overrides[file].local_blocks` (per LRN-009 disposition).
 * Files without a `composed.overrides[file]` entry have an empty allowlist
 * (no local blocks permitted in that file).
 *
 * Top-level `local_blocks` was removed in v0.2.0 (CS02b); the schema now rejects
 * any config that still carries it.
 *
 * @param {string} target - File path (repo-root-relative).
 * @param {object} config - Parsed harness.config.json.
 * @returns {{ allowedBlockIds: string[], warning: string|null }}
 */
function resolveAllowedBlockIds(target, config) {
  const overrideBlocks = config.composed?.overrides?.[target]?.local_blocks;
  if (Array.isArray(overrideBlocks)) {
    return { allowedBlockIds: overrideBlocks, warning: null };
  }
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
 * @param {string} [args.resolvedShaOverride] - CS11b: optional 40-char lowercase hex
 *   override for the lock's `resolved_sha` field. When provided, replaces the value
 *   that `resolveHarnessRef()` would derive from the working-tree HEAD. Removes the
 *   post-commit-regenerate ordering trap (LRN-070) for CSs that touch templates AND
 *   land them in the same commit. The override does NOT change `harness_ref`; that
 *   continues to be derived from git ref state. Format validation: must match
 *   `/^[0-9a-f]{40}$/`; mismatches throw SyncError ESYNC_INVALID_RESOLVED_SHA.
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
    resolvedShaOverride = null,
  } = args;

  if (!['apply', 'check', 'dry-run'].includes(mode)) {
    throw new SyncError(`Invalid mode: "${mode}". Must be apply, check, or dry-run.`, 'ESYNC_INVALID_MODE');
  }

  // CS11b: validate the resolved-sha override format BEFORE any work.
  if (resolvedShaOverride !== null && resolvedShaOverride !== undefined) {
    if (typeof resolvedShaOverride !== 'string' || !/^[0-9a-f]{40}$/.test(resolvedShaOverride)) {
      throw new SyncError(
        `Invalid resolvedShaOverride: must be a 40-character lowercase hex string. Got: ${JSON.stringify(resolvedShaOverride)}`,
        'ESYNC_INVALID_RESOLVED_SHA'
      );
    }
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
  // validateConfigSchema returns a canonical copy of config with all path-bearing
  // fields normalized (forward slashes, no leading ./, no redundant segments).
  // All downstream code uses this canonical config.
  config = validateConfigSchema(config, harnessRepoPath);

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
  const { harness_ref, resolved_sha: resolved_sha_from_git } = resolveHarnessRef(harnessRepoPath);
  // CS11b: prefer the explicit override when supplied; this lets a CS that
  // touches templates AND root files commit in a single shot, then run sync
  // with the just-made-commit's SHA pinned (avoids the LRN-070 ordering trap).
  const resolved_sha = resolvedShaOverride ?? resolved_sha_from_git;
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
        // Canonicalize the prior lock's target so it matches the current canonical config target.
        // Without this, ECOMPOSED_DROPPED protection bypasses for consumers whose prior lock
        // was written with non-canonical paths (e.g. './dir/NOTES.md' when current canonical
        // is 'dir/NOTES.md'). Per GPT-5.5 review #5 blocking #1.
        let canonTarget;
        try {
          canonTarget = canonicalizeTargetPath(entry.target);
        } catch {
          // If a prior lock entry has an invalid target (corruption / hand-edit), skip it
          // gracefully — sync will treat it as "no prior block records for this target",
          // which is the safe permissive default for prev-lock lookup.
          continue;
        }
        prevBlockRecords.set(canonTarget, entry.blocks);
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
  // Build the base skeleton via newEmptyLock (CS03b) — gives free schema
  // validation of the required-field shape (harness_ref / resolved_sha format /
  // synced_at) and a single source of truth for empty defaults. We then
  // populate the dynamic arrays in place.
  const lockAfter = newEmptyLock({
    harnessRef: harness_ref,
    resolvedSha: resolved_sha,
    configSchemaVersion: config_schema_version,
  });
  lockAfter.files = lockFileEntries.filter(e => e.action !== 'excluded');
  lockAfter.scaffolds = scaffolds.map(name => ({ name, version: harness_ref }));
  lockAfter.excluded = excluded;

  // Pre-flight: validate the planned lock object BEFORE any commit-phase writes.
  // If the lock would be invalid, we must not touch any target files.
  const lockValidation = validateLockObject(lockAfter);
  if (!lockValidation.valid) {
    throw new SyncError(
      `Planned lock object failed schema validation before commit phase: ` +
      `${JSON.stringify(lockValidation.errors)}`,
      'EBADLOCK_PLAN'
    );
  }

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
