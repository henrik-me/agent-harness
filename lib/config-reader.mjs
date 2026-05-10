/**
 * Shared harness.config.json reader with schema validation.
 *
 * Used by CLI flows that need consistent default-vs-override config loading
 * semantics and typed error reporting.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(__dirname, '..', 'schemas', 'harness.config.schema.json');

export class ConfigReaderError extends Error {
  constructor(message, { code, configPath, errors = null } = {}) {
    super(message);
    this.name = 'ConfigReaderError';
    this.code = code;
    this.configPath = configPath;
    this.errors = errors;
  }
}

export async function loadConfig({ cwd, configPath = null } = {}) {
  const baseCwd = cwd ?? process.cwd();
  const explicit = Boolean(configPath);
  const defaultPath = path.join(baseCwd, 'harness.config.json');
  const requestedPath = explicit ? configPath : defaultPath;
  const resolvedConfigPath = path.resolve(baseCwd, requestedPath);

  if (!existsSync(resolvedConfigPath)) {
    throw new ConfigReaderError(
      explicit
        ? `--config file not found: ${configPath}`
        : `harness.config.json not found at ${defaultPath}`,
      { code: 'NOT_FOUND', configPath: explicit ? configPath : defaultPath }
    );
  }

  const raw = await readFile(resolvedConfigPath, 'utf8');
  let config;
  try {
    config = JSON.parse(raw);
  } catch (err) {
    throw new ConfigReaderError(
      explicit
        ? `--config file is not valid JSON: ${configPath}: ${err.message}`
        : `harness.config.json is not valid JSON: ${defaultPath}: ${err.message}`,
      { code: 'INVALID_JSON', configPath: explicit ? configPath : defaultPath }
    );
  }

  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
  const ajv = new Ajv2020({ strict: false, validateSchema: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  if (!validate(config)) {
    const errors = validate.errors ?? [];
    const summary = summarizeAjvError(errors[0]);
    throw new ConfigReaderError(
      explicit
        ? `--config file failed schema validation: ${configPath}: ${summary}`
        : `harness.config.json failed schema validation: ${defaultPath}: ${summary}`,
      { code: 'SCHEMA_INVALID', configPath: explicit ? configPath : defaultPath, errors }
    );
  }

  return { config, configPath: resolvedConfigPath };
}

/**
 * Write a harness.config.json with schema validation.
 *
 * Validates the config against the harness.config.schema.json BEFORE writing;
 * throws ConfigReaderError with code SCHEMA_INVALID if invalid (fail-closed
 * per LRN-033). On success, writes pretty-printed JSON with a trailing
 * newline (matches existing init/sync output format).
 *
 * Added by CS15e γ4 — used by `harness init` to merge in the new
 * `constraints` block detected from the GitHub API. Mirrors the
 * read-validate semantic of `loadConfig` so init's read path and write
 * path stay symmetric (per CS15d → CS15e dependency contract).
 *
 * @param {{cwd?: string, config: object, configPath?: string|null}} opts
 * @returns {Promise<{configPath: string}>}
 */
export async function writeConfig({ cwd, config, configPath = null } = {}) {
  const baseCwd = cwd ?? process.cwd();
  const resolvedConfigPath = configPath
    ? path.resolve(baseCwd, configPath)
    : path.join(baseCwd, 'harness.config.json');

  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
  const ajv = new Ajv2020({ strict: false, validateSchema: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  if (!validate(config)) {
    const errors = validate.errors ?? [];
    const summary = summarizeAjvError(errors[0]);
    throw new ConfigReaderError(
      `config to write fails schema validation: ${summary}`,
      { code: 'SCHEMA_INVALID', configPath: resolvedConfigPath, errors }
    );
  }

  await writeFile(resolvedConfigPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  return { configPath: resolvedConfigPath };
}

function summarizeAjvError(error) {
  if (!error) {
    return 'unknown';
  }
  const propName = error.params?.additionalProperty;
  const propSuffix = propName ? ` (offending property: "${propName}")` : '';
  return `${error.message ?? 'unknown'} at "${error.instancePath ?? '/'}"${propSuffix}`;
}
