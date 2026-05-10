/**
 * Shared harness.config.json reader with schema validation.
 *
 * Used by CLI flows that need consistent default-vs-override config loading
 * semantics and typed error reporting.
 */

import { readFile } from 'node:fs/promises';
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

function summarizeAjvError(error) {
  if (!error) {
    return 'unknown';
  }
  const propName = error.params?.additionalProperty;
  const propSuffix = propName ? ` (offending property: "${propName}")` : '';
  return `${error.message ?? 'unknown'} at "${error.instancePath ?? '/'}"${propSuffix}`;
}
