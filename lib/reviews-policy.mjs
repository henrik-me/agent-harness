/**
 * Shared reviews-policy reader for harness review-gate linters (CS61, applying
 * LRN-145).
 *
 * **Zero third-party dependencies (Node builtins only).** This module is
 * imported by the four PR-side review-gate scripts
 * (`scripts/checks/check-review-log-evidence.mjs`,
 * `check-independence-invariant.mjs`, `check-copilot-review-attached.mjs`, and
 * `scripts/check-clickstop-implementer-not-reviewer.mjs`). The review-gates CI
 * workflow runs those scripts from a bare `git clone` of the harness repo with
 * **no `npm install`**, so any transitive third-party import (e.g. AJV via
 * `lib/config-reader.mjs`) would crash them with `ERR_MODULE_NOT_FOUND`. It is
 * therefore deliberately separate from `lib/config-reader.mjs` (which pulls in
 * AJV for full-config validation) — resolving CS61 plan Q1: the reviews-policy
 * reader lives in its own dep-free module, NOT in `config-reader.mjs`.
 *
 * Semantics: **apply the schema default when a field is absent; fail closed
 * (throw {@link ReviewsConfigError}) only on a present-but-malformed value.**
 * Defaults are sourced from `schemas/harness.config.schema.json` (cached per
 * process), never a hard-coded constant block (C61-2 / LRN-039), and validation
 * is scoped to the `reviews` subtree only.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(__dirname, '..', 'schemas', 'harness.config.schema.json');

/**
 * Error thrown by {@link loadReviewsPolicy} when a config file is malformed.
 *
 * `code` is one of:
 *   - `NOT_FOUND`    — an explicit `configPath` was supplied but does not exist.
 *   - `READ_ERROR`   — the file exists but could not be read.
 *   - `INVALID_JSON` — the file exists but is not valid JSON.
 *   - `MALFORMED`    — the `reviews` subtree (or top-level config) is present
 *                      but has a value that violates the schema's declared
 *                      type / pattern / uniqueness for a known field.
 * `field` names the offending `reviews.*` key for `MALFORMED` (or `null`).
 */
export class ReviewsConfigError extends Error {
  constructor(message, { code, configPath = null, field = null } = {}) {
    super(message);
    this.name = 'ReviewsConfigError';
    this.code = code;
    this.configPath = configPath;
    this.field = field;
  }
}

// Cache the reviews-policy schema surface (per-field defaults, the
// copilot_trigger enum, and the high_risk_clickstops item pattern) so each
// loadReviewsPolicy() call does not re-read + re-parse the schema from disk
// (CS61 R4). Defaults are sourced from schemas/harness.config.schema.json
// rather than a hard-coded constant block, keeping the schema authoritative
// (CS61 C61-2 / LRN-039 schema-is-source-of-truth).
let reviewsSchemaCache = null;

function getReviewsSchema() {
  if (reviewsSchemaCache) return reviewsSchemaCache;
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  const reviewsSchema = schema?.properties?.reviews ?? {};
  const props = reviewsSchema.properties ?? {};
  const defaults = {};
  for (const [key, spec] of Object.entries(props)) {
    if (Object.prototype.hasOwnProperty.call(spec, 'default')) {
      defaults[key] = spec.default;
    }
  }
  reviewsSchemaCache = {
    defaults,
    triggerEnum: props.copilot_trigger?.enum ?? ['mention', 'reviewer'],
    clickstopPattern: props.high_risk_clickstops?.items?.pattern ?? '^CS\\d{2,}[A-Za-z]?$',
    // Schema-derived allowlist + the additionalProperties flag, so unknown
    // reviews.* keys fail closed exactly as the full schema would reject them
    // (the schema sets reviews.additionalProperties:false). Sourcing both from
    // the schema keeps the reader in lock-step with it (S1/S3 / REVIEWS §2.6b).
    knownKeys: new Set(Object.keys(props)),
    additionalPropertiesAllowed: reviewsSchema.additionalProperties !== false,
  };
  return reviewsSchemaCache;
}

function hasOwnKey(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

// Materialize a fresh policy object from the cached schema defaults; arrays are
// cloned so callers can never mutate the shared cache.
function applyReviewsDefaults(defaults) {
  const out = {};
  for (const [key, value] of Object.entries(defaults)) {
    out[key] = Array.isArray(value) ? [...value] : value;
  }
  return out;
}

function failReviews(message, configPath, field) {
  throw new ReviewsConfigError(message, { code: 'MALFORMED', configPath, field });
}

function normalizeReviews(reviews, { configPath, schema }) {
  if (!reviews || typeof reviews !== 'object' || Array.isArray(reviews)) {
    failReviews('reviews must be an object when present', configPath, 'reviews');
  }
  const { defaults, triggerEnum, clickstopPattern } = schema;
  const policy = applyReviewsDefaults(defaults);

  // Unknown keys: the schema sets reviews.additionalProperties:false, so a
  // typo'd or unrecognized reviews.* key (which the full schema would reject)
  // must fail closed here too rather than being silently ignored (S1/S3 /
  // REVIEWS §2.6b). The allowlist + flag are schema-derived (getReviewsSchema).
  if (!schema.additionalPropertiesAllowed) {
    for (const key of Object.keys(reviews)) {
      if (!schema.knownKeys.has(key)) {
        failReviews(
          `reviews has unknown property "${key}" (schema reviews.additionalProperties is false)`,
          configPath,
          key
        );
      }
    }
  }

  // Model/slug string fields: present → non-empty trimmed string. An empty or
  // whitespace-only model id or reviewer slug is malformed for every downstream
  // consumer (model normalization/comparison on '' is meaningless); this matches
  // the schema's minLength:1 + pattern:"\S" on
  // rubber_duck_model/fallback_model/copilot_reviewer_slug and preserves the
  // check-independence-invariant gold-standard rubber_duck_model handling being
  // factored out here.
  for (const field of ['rubber_duck_model', 'fallback_model', 'copilot_reviewer_slug']) {
    if (hasOwnKey(reviews, field)) {
      const value = reviews[field];
      if (typeof value !== 'string' || value.trim() === '') {
        failReviews(`reviews.${field} must be a non-empty string when present`, configPath, field);
      }
      policy[field] = value.trim();
    }
  }

  // Boolean toggles: present → boolean.
  for (const field of ['enforce_gates', 'require_copilot_review']) {
    if (hasOwnKey(reviews, field)) {
      if (typeof reviews[field] !== 'boolean') {
        failReviews(`reviews.${field} must be a boolean when present`, configPath, field);
      }
      policy[field] = reviews[field];
    }
  }

  // copilot_trigger: present → one of the schema enum values.
  if (hasOwnKey(reviews, 'copilot_trigger')) {
    const value = reviews.copilot_trigger;
    if (typeof value !== 'string' || !triggerEnum.includes(value)) {
      failReviews(
        `reviews.copilot_trigger must be one of ${triggerEnum.join(', ')} when present`,
        configPath,
        'copilot_trigger'
      );
    }
    policy.copilot_trigger = value;
  }

  // review_timeout_minutes: present → finite number > 0 (schema exclusiveMinimum 0).
  if (hasOwnKey(reviews, 'review_timeout_minutes')) {
    const value = reviews.review_timeout_minutes;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      failReviews(
        'reviews.review_timeout_minutes must be a number greater than 0 when present',
        configPath,
        'review_timeout_minutes'
      );
    }
    policy.review_timeout_minutes = value;
  }

  // high_risk_clickstops: present → array of unique, pattern-matching strings.
  // Uniqueness is checked case-INSENSITIVELY (normalized to upper-case), which is
  // intentionally stricter than the schema's exact-value `uniqueItems` for the
  // near-unreachable suffix-case edge (e.g. "CS03a" vs "CS03A"); this mirrors the
  // CS57/CS60 gold-standard fail-closed behavior being factored out here.
  if (hasOwnKey(reviews, 'high_risk_clickstops')) {
    const value = reviews.high_risk_clickstops;
    if (!Array.isArray(value)) {
      failReviews('reviews.high_risk_clickstops must be an array when present', configPath, 'high_risk_clickstops');
    }
    const pattern = new RegExp(clickstopPattern);
    const seen = new Set();
    for (const [index, id] of value.entries()) {
      if (typeof id !== 'string' || !pattern.test(id)) {
        failReviews(
          `reviews.high_risk_clickstops[${index}] must match ${clickstopPattern}`,
          configPath,
          'high_risk_clickstops'
        );
      }
      const normalized = id.toUpperCase();
      if (seen.has(normalized)) {
        failReviews(`reviews.high_risk_clickstops contains duplicate ${id}`, configPath, 'high_risk_clickstops');
      }
      seen.add(normalized);
    }
    policy.high_risk_clickstops = [...value];
  }

  return policy;
}

/**
 * Load the normalized reviews policy from `harness.config.json`.
 *
 * Canonical reviews-policy reader for harness review-gate linters (CS61,
 * applying LRN-145). Semantics: **apply the schema default when a field is
 * absent; fail closed (throw {@link ReviewsConfigError}) only on a
 * present-but-malformed value** (wrong type / bad pattern / duplicate).
 *
 * Validation is scoped to the `reviews` subtree only (not the full config
 * schema), so lightweight configs/fixtures that omit unrelated keys still
 * load. A missing default-path config or a config without a `reviews` key
 * yields all schema defaults; an explicit `configPath` that does not exist
 * throws `NOT_FOUND`.
 *
 * Defaults are sourced from `schemas/harness.config.schema.json` (cached per
 * process), never a hard-coded constant block (C61-2). Returns a flat policy
 * object with every reviews field populated (`rubber_duck_model`,
 * `fallback_model`, `enforce_gates`, `require_copilot_review`,
 * `copilot_reviewer_slug`, `copilot_trigger`, `review_timeout_minutes`,
 * `high_risk_clickstops`).
 *
 * @param {{cwd?: string, configPath?: string|null}} [opts]
 * @returns {{rubber_duck_model: string, fallback_model: string, enforce_gates: boolean, require_copilot_review: boolean, copilot_reviewer_slug: string, copilot_trigger: string, review_timeout_minutes: number, high_risk_clickstops: string[]}}
 */
export function loadReviewsPolicy({ cwd, configPath = null } = {}) {
  const baseCwd = cwd ?? process.cwd();
  const explicit = Boolean(configPath);
  const candidate = explicit
    ? path.resolve(baseCwd, configPath)
    : path.join(baseCwd, 'harness.config.json');
  const schema = getReviewsSchema();

  if (!existsSync(candidate)) {
    if (explicit) {
      throw new ReviewsConfigError(`--config file not found: ${configPath}`, {
        code: 'NOT_FOUND',
        configPath: candidate,
      });
    }
    return applyReviewsDefaults(schema.defaults);
  }

  let raw;
  try {
    raw = readFileSync(candidate, 'utf8');
  } catch (err) {
    throw new ReviewsConfigError(`cannot read config: ${candidate}: ${err.message}`, {
      code: 'READ_ERROR',
      configPath: candidate,
    });
  }

  let config;
  try {
    config = JSON.parse(raw);
  } catch (err) {
    throw new ReviewsConfigError(`config is not valid JSON: ${candidate}: ${err.message}`, {
      code: 'INVALID_JSON',
      configPath: candidate,
    });
  }

  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new ReviewsConfigError(`top-level config must be an object: ${candidate}`, {
      code: 'MALFORMED',
      configPath: candidate,
    });
  }

  if (!hasOwnKey(config, 'reviews')) {
    return applyReviewsDefaults(schema.defaults);
  }

  return normalizeReviews(config.reviews, { configPath: candidate, schema });
}
