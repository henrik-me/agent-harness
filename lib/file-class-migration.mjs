/**
 * Helpers for one-time harness.config.json file-class transitions.
 *
 * The CS38a migration moves a previously managed file into the composed class
 * while recording the local-block allowlist needed by the composed merge
 * engine. Pure functions only: callers own all file I/O and schema validation.
 *
 * Zero runtime dependencies beyond Node built-ins.
 *
 * @module lib/file-class-migration.mjs
 */

/**
 * Return a deep clone that is safe to mutate in migration code.
 *
 * @param {object} value
 * @returns {object}
 */
function cloneConfig(value) {
  return structuredClone(value);
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {object} config
 * @param {string} filePath
 * @returns {boolean}
 */
function isAlreadyMigrated(config, filePath) {
  return Array.isArray(config?.composed?.files)
    && config.composed.files.includes(filePath)
    && config.composed?.overrides?.[filePath]?._inherited_class === 'managed';
}

/**
 * Check whether a file can be moved from managed.files to composed.files.
 *
 * Idempotent success: a file already in composed.files with
 * `_inherited_class: "managed"` is considered migratable because
 * migrateFileClass() will no-op on that shape.
 *
 * @param {object} config - Parsed harness.config.json object.
 * @param {string} filePath - Repo-root-relative target path.
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function validateMigratable(config, filePath) {
  if (!isObject(config)) {
    return { ok: false, reason: 'harness.config.json must be an object before file-class migration.' };
  }
  if (typeof filePath !== 'string' || filePath.length === 0) {
    return { ok: false, reason: 'filePath must be a non-empty repo-root-relative path.' };
  }
  if (isAlreadyMigrated(config, filePath)) {
    return { ok: true };
  }

  const composedFiles = config.composed?.files;
  if (Array.isArray(composedFiles) && composedFiles.includes(filePath)) {
    return { ok: false, reason: `Cannot migrate ${filePath}: already present in composed.files without a managed inheritance override.` };
  }

  const managedFiles = config.managed?.files;
  if (!Array.isArray(managedFiles) || !managedFiles.includes(filePath)) {
    return { ok: false, reason: `Cannot migrate ${filePath}: not found in managed.files.` };
  }

  return { ok: true };
}

/**
 * Move one target from managed.files to composed.files and add its composed
 * override entry. Returns a deep-cloned config object; the caller's input is
 * never mutated.
 *
 * Idempotent path: if the file is already in composed.files and its override
 * has `_inherited_class: "managed"`, the function returns a deep clone with
 * identical serialized content and performs no migration changes. This lets
 * init/sync retry after a partial run without treating the second invocation as
 * an error.
 *
 * @param {object} config - Parsed harness.config.json object.
 * @param {string} filePath - Repo-root-relative target path.
 * @param {{local_blocks?: string[]}} options - Migration metadata.
 * @returns {object} New migrated config object.
 * @throws {Error} If the migration is unsafe or missing local block metadata.
 */
export function migrateFileClass(config, filePath, options = {}) {
  const cloned = cloneConfig(config);
  if (isAlreadyMigrated(cloned, filePath)) {
    return cloned;
  }

  if (!Array.isArray(options.local_blocks) || options.local_blocks.length === 0) {
    throw new Error(`Cannot migrate ${filePath}: options.local_blocks must be a non-empty array.`);
  }

  const check = validateMigratable(cloned, filePath);
  if (!check.ok) {
    throw new Error(check.reason);
  }

  if (!isObject(cloned.composed)) cloned.composed = { files: [] };
  if (!Array.isArray(cloned.composed.files)) cloned.composed.files = [];
  if (!isObject(cloned.composed.overrides)) cloned.composed.overrides = {};

  cloned.managed.files = cloned.managed.files.filter((entry) => entry !== filePath);
  cloned.composed.files.push(filePath);
  cloned.composed.overrides[filePath] = {
    _inherited_class: 'managed',
    local_blocks: [...options.local_blocks],
  };

  return cloned;
}
