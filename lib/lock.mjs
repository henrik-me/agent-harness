/**
 * Lock file reader/writer for harness sync.
 *
 * Reads and writes `.harness-lock.json` in the consumer repo root, conforming
 * to `schemas/harness-lock.schema.json`.
 *
 * @module lib/lock.mjs
 */

import { readFile, writeFile } from 'fs/promises';
import path from 'path';

const LOCK_FILENAME = '.harness-lock.json';

/**
 * Read `.harness-lock.json` from the consumer repo root.
 *
 * @param {string} consumerRepoPath - Absolute path to the consumer repo root.
 * @returns {Promise<object|null>} Parsed lock object, or `null` if no lock file exists.
 * @throws {Error} If the file exists but cannot be parsed as JSON.
 */
export async function readLock(consumerRepoPath) {
  const lockPath = path.join(consumerRepoPath, LOCK_FILENAME);
  try {
    const content = await readFile(lockPath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Write a lock object to `.harness-lock.json` in the consumer repo root.
 *
 * Serialises with 2-space indentation and a trailing newline (LF).
 *
 * @param {string} consumerRepoPath - Absolute path to the consumer repo root.
 * @param {object} lock - Lock object conforming to `harness-lock.schema.json`.
 * @returns {Promise<void>}
 */
export async function writeLock(consumerRepoPath, lock) {
  const lockPath = path.join(consumerRepoPath, LOCK_FILENAME);
  const content = JSON.stringify(lock, null, 2) + '\n';
  await writeFile(lockPath, content, 'utf8');
}
