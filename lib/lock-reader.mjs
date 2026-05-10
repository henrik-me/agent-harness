/**
 * Schema-validated lock reader and schema-canonical accessors.
 *
 * Reads `.harness-lock.json` from a consumer repository root and exposes the
 * `files[].blocks[]` lock shape defined by `schemas/harness-lock.schema.json`.
 */

import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCK_FILENAME = '.harness-lock.json';

const lockSchema = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'schemas', 'harness-lock.schema.json'), 'utf8')
);
const ajv = new Ajv2020({ strict: false, validateSchema: false });
addFormats(ajv);
const validateLock = ajv.compile(lockSchema);

export class LockReaderError extends Error {
  constructor(message, { code, lockPath, errors } = {}) {
    super(message);
    this.name = 'LockReaderError';
    this.code = code;
    this.lockPath = lockPath;
    this.errors = errors;
  }
}

export async function loadLock({ cwd = '.' } = {}) {
  const lockPath = path.resolve(cwd, LOCK_FILENAME);
  let content;

  try {
    content = await readFile(lockPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new LockReaderError(`${LOCK_FILENAME} not found at ${lockPath}`, {
        code: 'NOT_FOUND',
        lockPath,
      });
    }
    throw err;
  }

  let lock;
  try {
    lock = JSON.parse(content);
  } catch (err) {
    throw new LockReaderError(`${LOCK_FILENAME} is not valid JSON: ${lockPath}: ${err.message}`, {
      code: 'INVALID_JSON',
      lockPath,
    });
  }

  if (!validateLock(lock)) {
    const errors = validateLock.errors ?? [];
    throw new LockReaderError(
      `${LOCK_FILENAME} failed schema validation: ${lockPath}: ${JSON.stringify(errors)}`,
      { code: 'SCHEMA_INVALID', lockPath, errors }
    );
  }

  return { lock, lockPath };
}

export function getComposedBlocks(lock, file) {
  return getFileEntry(lock, file)?.blocks ?? {};
}

export function getFileEntry(lock, file) {
  const files = lock?.files;
  if (!files) return null;

  if (Array.isArray(files)) {
    return files.find(entry => entry?.target === file) ?? null;
  }

  return files[file] ?? null;
}
