/**
 * Lock file reader/writer for harness sync.
 *
 * Reads and writes `.harness-lock.json` in the consumer repo root, conforming
 * to `schemas/harness-lock.schema.json`.
 *
 * Atomic write: writes to `.harness-lock.json.tmp` then renames to the final
 * path. On Windows, `fs.rename` within the same volume is near-atomic via
 * `MoveFileExW` with `MOVEFILE_REPLACE_EXISTING`. Cross-volume rename falls
 * back to a non-atomic copy+delete. Acceptable for v0.1.0 (lock files live in
 * the consumer repo, same volume as `.tmp`).
 *
 * @module lib/lock.mjs
 */

import { readFile, writeFile, rename } from 'fs/promises';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load and compile lock schema once at module init time.
const _lockSchema = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'schemas', 'harness-lock.schema.json'), 'utf8')
);
const _ajv = new Ajv2020({ strict: false, validateSchema: false });
addFormats(_ajv);
const _validateLock = _ajv.compile(_lockSchema);

const LOCK_FILENAME = '.harness-lock.json';
const LOCK_TMP_FILENAME = '.harness-lock.json.tmp';

// ---------------------------------------------------------------------------
// Public error class
// ---------------------------------------------------------------------------

/**
 * Thrown when a lock file operation fails due to data integrity issues.
 *
 * @property {'EBADLOCK'|'ESCHEMA'} code - Machine-readable error code.
 *   `EBADLOCK`: file exists but contains invalid JSON.
 *   `ESCHEMA`:  JSON parsed successfully but failed schema validation, OR
 *               a lock object passed to writeLock() failed validation.
 */
export class LockError extends Error {
  /**
   * @param {string} message
   * @param {'EBADLOCK'|'ESCHEMA'} code
   */
  constructor(message, code) {
    super(message);
    this.name = 'LockError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read `.harness-lock.json` from the consumer repo root.
 *
 * @param {string} consumerRepoPath - Absolute path to the consumer repo root.
 * @returns {Promise<object|null>} Parsed lock object, or `null` if no lock file exists.
 * @throws {LockError} `EBADLOCK` if the file exists but contains invalid JSON.
 * @throws {LockError} `ESCHEMA` if the parsed JSON fails schema validation against
 *   `harness-lock.schema.json`.
 */
export async function readLock(consumerRepoPath) {
  const lockPath = path.join(consumerRepoPath, LOCK_FILENAME);
  let content;
  try {
    content = await readFile(lockPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new LockError(
      `.harness-lock.json contains invalid JSON: ${err.message}`,
      'EBADLOCK'
    );
  }

  if (!_validateLock(parsed)) {
    throw new LockError(
      `.harness-lock.json failed schema validation: ${JSON.stringify(_validateLock.errors)}`,
      'ESCHEMA'
    );
  }

  return parsed;
}

/**
 * Validate a lock object against `harness-lock.schema.json` WITHOUT writing.
 *
 * Useful for pre-flight validation before any commit-phase writes occur,
 * so that an invalid planned lock is caught before target files are touched.
 *
 * @param {object} lockObj - Lock object to validate.
 * @returns {{ valid: boolean, errors?: object[] }}
 */
export function validateLockObject(lockObj) {
  const ok = _validateLock(lockObj);
  if (ok) return { valid: true };
  return { valid: false, errors: _validateLock.errors ?? [] };
}

/**
 * Write a lock object to `.harness-lock.json` in the consumer repo root.
 *
 * Validates `lockObj` against `harness-lock.schema.json` BEFORE writing.
 * Writes atomically via a `.tmp` file + `fs.rename`.
 *
 * @param {string} consumerRepoPath - Absolute path to the consumer repo root.
 * @param {object} lockObj - Lock object conforming to `harness-lock.schema.json`.
 * @returns {Promise<void>}
 * @throws {LockError} `ESCHEMA` if `lockObj` fails schema validation; no file is written.
 */
export async function writeLock(consumerRepoPath, lockObj) {
  if (!_validateLock(lockObj)) {
    throw new LockError(
      `Lock object failed schema validation: ${JSON.stringify(_validateLock.errors)}`,
      'ESCHEMA'
    );
  }

  const lockPath = path.join(consumerRepoPath, LOCK_FILENAME);
  const tmpPath  = path.join(consumerRepoPath, LOCK_TMP_FILENAME);
  const content  = JSON.stringify(lockObj, null, 2) + '\n';

  await writeFile(tmpPath, content, 'utf8');
  await rename(tmpPath, lockPath);
}
