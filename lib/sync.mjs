/**
 * Sync orchestrator — harness sync engine.
 *
 * Orchestrates template application across the three file classes
 * (managed / composed / seeded), enforces all behavioural invariants
 * from the CS03 spec, and writes the `.harness-lock.json`.
 *
 * @module lib/sync.mjs
 */

import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { readFileSync } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { applyTemplating } from './templating.mjs';
import { readLock, writeLock, validateLockObject, newEmptyLock } from './lock.mjs';
import { mergeComposed, mergeComposedFromManaged, computeBlockRecords } from './composed.mjs';

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
 *   newManagedFiles: string[],
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
 * Harness package root of the RUNNING module (CS82 / C82-2). Lock provenance is
 * derived from where THIS module is installed — NOT from the `harnessRepoPath`
 * argument — because `npm`/`npx` installs strip `.git` from the package yet
 * record the resolved ref→SHA in the parent install project's
 * `node_modules/.package-lock.json`. In both self-host and npx installs this
 * equals the harness install root (`bin/harness.mjs` derives the same path for
 * `harnessRepoPath`), so production behaviour is unchanged; the seam is
 * injectable for tests via `sync({ provenanceDeps })`.
 */
const HARNESS_PACKAGE_ROOT = path.resolve(__dirname, '..');

/**
 * Placeholder provenance, returned only when no resolution path yields a real
 * ref + SHA. NEVER persisted in apply mode: `validateResolvedProvenance()`
 * throws `ESYNC_UNRESOLVED_PROVENANCE` first (C82-3). check/dry-run keep it
 * best-effort (C82-8) so they never red-flag an existing corrupt lock.
 */
const UNRESOLVED_PROVENANCE = Object.freeze({
  harness_ref: 'unknown',
  resolved_sha: '0'.repeat(40),
  source: 'none',
});

/**
 * Locate the npm "hidden lockfile" (`node_modules/.package-lock.json`) of the
 * install project that contains `installRoot`, and the harness package's entry
 * key within it.
 *
 * For an npx/npm install the running module lives at
 * `<project>/node_modules/<pkg>` (or `.../node_modules/@scope/pkg`); the hidden
 * lockfile is `<project>/node_modules/.package-lock.json` and the package's
 * entry is keyed `node_modules/<pkg>` (forward slashes, per npm). Returns null
 * when `installRoot` is not under a `node_modules/` segment (e.g. a self-host
 * git checkout) so the caller falls through to the git probe.
 *
 * @param {string} installRoot
 * @returns {{ lockPath: string, pkgKey: string } | null}
 */
function npxCacheInfo(installRoot) {
  if (typeof installRoot !== 'string' || installRoot.length === 0) return null;
  const norm = installRoot.replace(/\\/g, '/');
  const marker = '/node_modules/';
  const idx = norm.lastIndexOf(marker);
  if (idx === -1) return null;
  // `norm` and `installRoot` share length + indices (backslash→slash is 1:1),
  // so slice the ORIGINAL to preserve native separators for the on-disk read.
  const nodeModulesDir = installRoot.slice(0, idx + marker.length - 1);
  const pkgRel = norm.slice(idx + marker.length).replace(/\/+$/, '');
  if (!pkgRel) return null;
  return {
    lockPath: path.join(nodeModulesDir, '.package-lock.json'),
    pkgKey: `node_modules/${pkgRel}`,
  };
}

/**
 * Parse the 40-char lowercase hex commit SHA out of an npm `resolved` git URL
 * (`git+https://…#<40-hex-sha>`). Returns null if absent/malformed.
 *
 * @param {unknown} resolved
 * @returns {string | null}
 */
function parseShaFromResolved(resolved) {
  if (typeof resolved !== 'string') return null;
  const hash = resolved.lastIndexOf('#');
  if (hash === -1) return null;
  const frag = resolved.slice(hash + 1);
  return /^[0-9a-f]{40}$/.test(frag) ? frag : null;
}

/**
 * Derive a symbolic harness ref from an npm hidden-lockfile package entry: the
 * requested `#<ref>` fragment of the install spec (`from`/`_from`/`spec`) when
 * it is not itself a SHA, else the package `version`. Returns null when no
 * symbolic ref is derivable — the caller then treats the npx-cache branch as
 * unresolved (C82-7: an npx-cache SHA WITHOUT a derivable ref fails-closed
 * rather than inventing a short-SHA ref).
 *
 * @param {Record<string, unknown>} entry
 * @returns {string | null}
 */
function deriveRefFromEntry(entry) {
  for (const field of ['from', '_from', 'spec']) {
    const v = entry[field];
    if (typeof v === 'string' && v.includes('#')) {
      const frag = v.slice(v.lastIndexOf('#') + 1);
      if (frag && !/^[0-9a-f]{40}$/.test(frag)) return frag;
    }
  }
  if (typeof entry.version === 'string' && entry.version.length > 0) return entry.version;
  return null;
}

/**
 * Resolution step 1 — npx/npm cache. Reads the install project's hidden
 * lockfile and returns the harness package's resolved ref + SHA, or null to
 * fall through. Fail-soft on every I/O / parse error (returns null, never
 * throws) so a missing/garbled cache degrades to the git probe, then
 * fail-closed.
 *
 * @param {string} installRoot
 * @param {(p: string, enc: string) => string} readFn
 * @returns {{ harness_ref: string, resolved_sha: string, source: 'npx-cache' } | null}
 */
function resolveFromNpxCache(installRoot, readFn) {
  const info = npxCacheInfo(installRoot);
  if (!info) return null;
  let raw;
  try {
    raw = readFn(info.lockPath, 'utf8');
  } catch {
    return null;
  }
  let lock;
  try {
    lock = JSON.parse(raw);
  } catch {
    return null;
  }
  const entry = lock && lock.packages && lock.packages[info.pkgKey];
  if (!entry || typeof entry !== 'object') return null;
  const sha = parseShaFromResolved(entry.resolved);
  if (!sha) return null;
  const ref = deriveRefFromEntry(entry);
  if (!ref) return null;
  return { harness_ref: ref, resolved_sha: sha, source: 'npx-cache' };
}

/**
 * Resolution step 2 — git self-host. Probes `installRoot`'s git checkout for
 * HEAD's SHA + a symbolic ref (exact tag → branch → short SHA). Returns null if
 * git is unavailable / not a repo (npx installs have no `.git`). Preserves the
 * pre-CS82 git behaviour (including the short-SHA ref fallback) so self-host and
 * git-checkout applies are unchanged (C82-9).
 *
 * @param {string} installRoot
 * @param {(cmd: string, opts: object) => string} execFn
 * @returns {{ harness_ref: string, resolved_sha: string, source: 'git' } | null}
 */
function resolveFromGit(installRoot, execFn) {
  if (typeof installRoot !== 'string' || installRoot.length === 0) return null;
  const opts = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };
  let sha;
  try {
    sha = execFn(`git -C "${installRoot}" rev-parse HEAD`, opts).trim();
  } catch {
    return null;
  }
  if (!/^[0-9a-f]{40}$/.test(sha)) return null;

  // Try to get an exact tag first, then the abbreviated branch, then short SHA.
  let ref;
  try {
    ref = execFn(`git -C "${installRoot}" describe --tags --exact-match HEAD`, opts).trim();
  } catch {
    try {
      ref = execFn(`git -C "${installRoot}" rev-parse --abbrev-ref HEAD`, opts).trim();
    } catch {
      ref = sha.slice(0, 7);
    }
  }
  return { harness_ref: ref || sha.slice(0, 7), resolved_sha: sha, source: 'git' };
}

/**
 * Resolve the running harness install's pin provenance (`harness_ref` +
 * `resolved_sha`) via the CS82 ordered chain (C82-2):
 *
 *   1. npx/npm cache — the install project's `node_modules/.package-lock.json`
 *      records the authoritative resolved ref→SHA (npm strips `.git`).
 *   2. git self-host — probe the install's own git checkout.
 *   3. fail-closed — return the `unknown` / all-zero placeholder; apply mode
 *      then throws via `validateResolvedProvenance()` (C82-3) so a placeholder
 *      is never persisted.
 *
 * Pure and seam-injectable (fs reader, git runner, install root) so tests can
 * exercise every branch with `os.tmpdir()` fixtures and never depend on the
 * CLI's own `.git` or a real npx cache (C82-7).
 *
 * @param {object} [deps]
 * @param {string} [deps.installRoot] - Harness install root (default: the
 *   running module's package root). Provenance derives from the running install,
 *   NOT from `harnessRepoPath`, because that is the artefact actually shipped.
 * @param {(p: string, enc: string) => string} [deps.readFileSync] - fs reader seam.
 * @param {(cmd: string, opts: object) => string} [deps.execSync] - git runner seam.
 * @returns {{ harness_ref: string, resolved_sha: string, source: 'npx-cache'|'git'|'none' }}
 */
export function resolveHarnessProvenance(deps = {}) {
  const installRoot = deps.installRoot ?? HARNESS_PACKAGE_ROOT;
  const readFn = deps.readFileSync ?? readFileSync;
  const execFn = deps.execSync ?? execSync;

  const fromCache = resolveFromNpxCache(installRoot, readFn);
  if (fromCache) return fromCache;

  const fromGit = resolveFromGit(installRoot, execFn);
  if (fromGit) return fromGit;

  return { ...UNRESOLVED_PROVENANCE };
}

/**
 * Fail-closed guard (apply mode only, C82-3): a lock must never persist
 * placeholder provenance. Throws `SyncError` `ESYNC_UNRESOLVED_PROVENANCE` when
 * `harness_ref` is missing / `unknown`, or `resolved_sha` is not a real (40-char
 * lowercase hex, non-all-zero) commit SHA. Call AFTER applying `--resolved-sha`
 * (which fixes only `resolved_sha`), so a valid `--resolved-sha` still cannot
 * rescue an install whose `harness_ref` is underivable (C82-5).
 *
 * @param {{ harness_ref?: string, resolved_sha?: string }} [provenance]
 * @throws {SyncError} ESYNC_UNRESOLVED_PROVENANCE
 */
export function validateResolvedProvenance({ harness_ref, resolved_sha } = {}) {
  const refOk = typeof harness_ref === 'string' && harness_ref.length > 0 && harness_ref !== 'unknown';
  const shaOk = typeof resolved_sha === 'string'
    && /^[0-9a-f]{40}$/.test(resolved_sha)
    && !/^0{40}$/.test(resolved_sha);
  if (refOk && shaOk) return;
  throw new SyncError(
    `Run 'harness sync --mode=apply' from a git checkout at the target ref, ` +
    `or ensure the npx/npm install's node_modules/.package-lock.json is present ` +
    `so the resolved ref and SHA can be read from the install cache. ` +
    `Cannot resolve harness pin provenance for '.harness-lock.json' ` +
    `(harness_ref=${JSON.stringify(harness_ref)}, resolved_sha=${JSON.stringify(resolved_sha)}). ` +
    `(--resolved-sha overrides only resolved_sha once a real harness_ref is derivable; ` +
    `it cannot by itself rescue an install with no derivable ref.)`,
    'ESYNC_UNRESOLVED_PROVENANCE'
  );
}

/**
 * Compute the default `{{harness_invoke}}` templating value for a consumer
 * render (C83-3). Resolves to `npx -y github:henrik-me/agent-harness#<ref>`,
 * where `<ref>` is the consumer's pinned `config.version` when it is a usable
 * ref, else the literal reader-placeholder `<ref>` (matching the README
 * `#<ref>` convention). The install slug is the CONSTANT published harness repo
 * `henrik-me/agent-harness` — NOT the consumer's own `repo_slug` — matching
 * `template/managed/.github/workflows/harness-drift.yml`.
 *
 * This default is merged UNDER `config.templating` at the sync render site, so a
 * consumer that sets `templating.harness_invoke` (e.g. the self-host, which
 * pins `node bin/harness.mjs`) overrides it. Because templating is non-strict
 * (lib/templating.mjs emits an unresolved `{{key}}` literally), injecting this
 * default is what prevents a literal `{{harness_invoke}}` from shipping to
 * consumers that never set the key. A `version` that is empty, `0.0.0-pre`
 * (the self-host placeholder), or not a safe ref — it must match the same
 * `[A-Za-z0-9._/-]+` allowlist the CI derive-ref step enforces — falls back to
 * the literal `<ref>` placeholder, so a malformed/injected `config.version`
 * cannot leak into the rendered command shown in consumer docs. The self-host
 * overrides `harness_invoke` in its own config anyway, so it never renders this
 * default.
 *
 * @param {{ version?: string }} [config] - The validated harness config.
 * @returns {string} The `npx …#<ref>` invocation prefix.
 */
export function computeHarnessInvokeDefault(config) {
  const v = (config && typeof config.version === 'string') ? config.version.trim() : '';
  const ref = (v && v !== '0.0.0-pre' && /^[A-Za-z0-9._/-]+$/.test(v)) ? v : '<ref>';
  return `npx -y github:henrik-me/agent-harness#${ref}`;
}

/**
 * Compute the sync-side default values for the composed CODEOWNERS secure-default
 * templating keys `{{security_codeowner}}` and `{{infra_codeowner}}` (CS89). Both
 * default to `config.templating.default_codeowner` so the secure-default rules
 * (`/.github/`, `/.github/workflows/`, `/SECURITY.md`, `/infra/`) resolve to a
 * real owner even for a consumer that never defines the new keys.
 *
 * Like `computeHarnessInvokeDefault` (C83-3), these defaults are merged UNDER
 * `config.templating` at the sync render site, so a consumer that sets either
 * key explicitly wins. Because templating is non-strict (lib/templating.mjs
 * emits an unresolved `{{key}}` literally), injecting these defaults is what
 * prevents a literal `{{security_codeowner}}` / `{{infra_codeowner}}` from
 * shipping to a consumer that only sets `default_codeowner`.
 *
 * When `default_codeowner` is unset (or non-string/empty), returns `{}` so no
 * empty owner is fabricated; the render then leaves the placeholder unresolved,
 * matching how any other unset templating key behaves.
 *
 * @param {{ templating?: { default_codeowner?: string } }} [config] - The validated harness config.
 * @returns {{ security_codeowner?: string, infra_codeowner?: string }}
 */
export function computeCodeownerDefaults(config) {
  const def = config?.templating?.default_codeowner;
  if (typeof def !== 'string' || def === '') return {};
  return { security_codeowner: def, infra_codeowner: def };
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
 * Determine whether a single Active Work table cell is a placeholder/empty
 * value rather than a concrete entry. Placeholders include: empty strings,
 * em-dash/hyphen fillers (`—`, `-`), parenthesised notes (optionally wrapped
 * in italic/bold markers, e.g. `_(set on claim)_`, `*(none)*`, `(none)`), and
 * the literal tokens `none`/`n/a`/`tbd`.
 *
 * @param {string} cell
 * @returns {boolean}
 */
function isPlaceholderWorkboardCell(cell) {
  const t = cell.trim();
  if (t === '') return true;
  if (/^[—–-]+$/.test(t)) return true;
  if (/^[_*]*\(.*\)[_*]*$/.test(t)) return true;
  if (/^(none|n\/a|tbd)$/i.test(t)) return true;
  return false;
}

/**
 * Parse the Active Work table from a WORKBOARD.md string.
 *
 * CS27 (Finding #7, Decision C27-1): a row counts as an *active* CS only when
 * its concrete identity columns are filled in — specifically (a) the CS-Task ID
 * column is non-placeholder, AND (b) the State column is non-placeholder, AND
 * (c) at least one of {Owner, Branch} is non-placeholder. Header, separator,
 * and pure-placeholder seed rows (e.g. the canonical
 * `| — | no active CS … | — | — | — | … | … |` empty-state form) are therefore
 * NOT treated as active, eliminating the false-positive "Syncing mid-CS"
 * warning on a freshly-init'd consumer.
 *
 * @param {string} content
 * @returns {boolean}
 */
export function workboardHasActiveRows(content) {
  const lines = content.split('\n');
  let inActiveWork = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^##\s+Active Work/.test(trimmed)) {
      inActiveWork = true;
      continue;
    }
    if (!inActiveWork) continue;
    // A new H2 section ends the Active Work table.
    if (/^##\s+/.test(trimmed)) {
      inActiveWork = false;
      continue;
    }
    if (!trimmed.startsWith('|')) continue;
    // Skip separator row and header row.
    if (/^\|[-:| ]+\|$/.test(trimmed)) continue;
    if (/CS-Task ID/.test(trimmed)) continue;
    // Parse the cells (drop the empties produced by the leading/trailing pipe).
    const cells = trimmed.split('|').slice(1, -1).map((c) => c.trim());
    // The Active Work table has 7 columns; anything shorter is malformed and
    // is not a concrete active row.
    if (cells.length < 5) continue;
    const [csId, , state, owner, branch] = cells;
    const idConcrete = !isPlaceholderWorkboardCell(csId);
    const stateConcrete = !isPlaceholderWorkboardCell(state);
    const ownerOrBranchConcrete =
      !isPlaceholderWorkboardCell(owner) || !isPlaceholderWorkboardCell(branch);
    if (idConcrete && stateConcrete && ownerOrBranchConcrete) return true;
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
 * Sentinel basenames that exist as placeholders inside `template/managed/`
 * directories but are NEVER deliverable consumer files (C64b-3).
 */
const MANAGED_SENTINEL_BASENAMES = new Set(['.gitkeep']);

/**
 * Recursively list every regular file under `rootDir`, returning paths relative
 * to `rootDir` with forward slashes. Returns `[]` when the directory is absent.
 *
 * @param {string} rootDir - Absolute directory path.
 * @returns {Promise<string[]>}
 */
async function listFilesRecursive(rootDir) {
  /** @type {string[]} */
  const out = [];
  async function walk(absDir, relPrefix) {
    let entries;
    try {
      entries = await readdir(absDir, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') return;
      throw err;
    }
    for (const entry of entries) {
      const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(path.join(absDir, entry.name), rel);
      } else if (entry.isFile()) {
        out.push(rel);
      }
    }
  }
  await walk(rootDir, '');
  return out;
}

/**
 * Detect harness-shipped managed files that the consumer's `managed.files`
 * does not yet track (C64b-3).
 *
 * Closes the LRN-155 asymmetry: `sync` already notices *changed* managed files
 * but, before CS64b, never noticed *new* ones because its work list is built
 * solely from `config.managed.files`. This helper enumerates the harness
 * manifest under `<harnessRepoPath>/template/managed/**` (recursively, files
 * only, excluding sentinels such as `.gitkeep`) and reports every canonical
 * target ABSENT from `config.managed.files` — membership, not disk presence.
 *
 * Detection is read-only and pure; the caller decides how to surface or adopt
 * the result (the C64b-3 report-only advisory or `--apply-new` adoption).
 *
 * @param {object} params
 * @param {object} params.config - Parsed harness.config.json (canonical or raw;
 *   `managed.files` entries are canonicalized defensively).
 * @param {string} params.harnessRepoPath - Absolute path to the harness repo
 *   root (where `template/managed/` lives).
 * @returns {Promise<{ newFiles: string[] }>}
 *   `newFiles` — all detected new managed files (canonical, sorted).
 */
export async function detectNewManagedFiles({ config, harnessRepoPath }) {
  const managedDir = path.join(harnessRepoPath, 'template', 'managed');
  const relFiles = await listFilesRecursive(managedDir);

  // Membership set: canonical targets already declared in managed.files.
  const declared = new Set(
    (config?.managed?.files ?? []).map(f => canonicalizeTargetPath(f))
  );

  /** @type {Set<string>} */
  const newFilesSet = new Set();
  for (const rel of relFiles) {
    const base = rel.split('/').pop();
    if (MANAGED_SENTINEL_BASENAMES.has(base)) continue;
    const canonical = canonicalizeTargetPath(rel);
    if (!declared.has(canonical)) newFilesSet.add(canonical);
  }
  const newFiles = [...newFilesSet].sort();

  return { newFiles };
}

/**
 * Consumer-root-relative target of the L3 structural gate workflow (CS90b).
 */
const PR_CHECK_WORKFLOW_TARGET = '.github/workflows/harness-pr-check.yml';

/**
 * Harness-managed workflow basenames excluded from the CS90b adoption-overlap
 * scan: these ship from the harness and their own `harness lint` /
 * `sync --mode=check` invocations are the layered gate itself, not a consumer's
 * independent lint that would make L3's internal lint redundant.
 */
const HARNESS_MANAGED_WORKFLOW_BASENAMES = new Set([
  'harness-pr-check.yml',
  'harness-drift.yml',
  'review-gates.yml',
  'pr-evidence-lint.yml',
  'workboard-auto-approve.yml',
]);

/**
 * Conservative text signals that a consumer workflow already runs the same lint
 * / drift-check that harness-pr-check.yml's `lint+drift` mode runs internally.
 */
const LINT_OVERLAP_SIGNALS = [
  'harness lint',
  'harness.mjs lint',
  'sync --mode=check',
  'sync --mode check',
];

/**
 * Detect the CS90b (C90b-4) adoption-overlap condition: the consumer has adopted
 * `harness-pr-check.yml` in the default `lint+drift` mode AND its own (non-
 * harness-managed) workflows already invoke `harness lint` / `sync --mode=check`,
 * so the L3 gate's internal `harness lint` is a redundant second lint. The caller
 * surfaces this as a REPORT-ONLY advisory (never changes drift/exit code).
 *
 * Adoption is membership OR disk presence: `.github/workflows/harness-pr-check.yml`
 * in `managed.files` OR the file present in the consumer tree. The self-host has
 * neither, so this never fires on `agent-harness` itself.
 *
 * Detection is read-only. When `pr_check.mode` is `drift-only` (opted out) or the
 * workflow is not adopted, the scan short-circuits to `overlap:false`.
 *
 * @param {object} params
 * @param {object} params.config - Parsed harness.config.json (canonical or raw).
 * @param {string} params.consumerRepoPath - Absolute path to the consumer repo root.
 * @returns {Promise<{ overlap: boolean, mode: 'lint+drift'|'drift-only', adopted: boolean, overlappingWorkflows: string[] }>}
 */
export async function detectPrCheckLintOverlap({ config, consumerRepoPath }) {
  // Resolve mode: only the literal 'drift-only' opts out; absent/unknown/malformed
  // resolves to the default 'lint+drift' (mirrors the workflow's fail-safe read).
  const mode = config?.pr_check?.mode === 'drift-only' ? 'drift-only' : 'lint+drift';

  // Adoption (a): declared in managed.files OR present on disk.
  const declared = new Set(
    (config?.managed?.files ?? []).map(f => canonicalizeTargetPath(f))
  );
  const adoptedViaConfig = declared.has(PR_CHECK_WORKFLOW_TARGET);
  const adoptedViaDisk =
    (await readFileOrNull(path.join(consumerRepoPath, ...PR_CHECK_WORKFLOW_TARGET.split('/')))) !== null;
  const adopted = adoptedViaConfig || adoptedViaDisk;

  // Short-circuit (b): silent unless adopted AND still in the default lint+drift.
  if (!adopted || mode !== 'lint+drift') {
    return { overlap: false, mode, adopted, overlappingWorkflows: [] };
  }

  // Scan (c): the consumer's OWN workflows (excluding harness-managed ones) for a
  // lint / sync-check invocation. ENOENT (no workflows dir) => no overlap.
  const workflowsDir = path.join(consumerRepoPath, '.github', 'workflows');
  let entries;
  try {
    entries = await readdir(workflowsDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return { overlap: false, mode, adopted, overlappingWorkflows: [] };
    throw err;
  }

  /** @type {string[]} */
  const overlappingWorkflows = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    if (!/\.ya?ml$/i.test(name)) continue;
    if (HARNESS_MANAGED_WORKFLOW_BASENAMES.has(name)) continue;
    const text = await readFileOrNull(path.join(workflowsDir, name));
    if (text === null) continue;
    // Case-insensitive scan: the signals are lowercase, so lowercase the haystack
    // once to avoid missing casing variants (e.g. `Harness lint`) — the heuristic
    // stays conservative (whole-signal substrings) while dropping false negatives.
    const haystack = text.toLowerCase();
    if (LINT_OVERLAP_SIGNALS.some(sig => haystack.includes(sig))) {
      overlappingWorkflows.push(`.github/workflows/${name}`);
    }
  }
  overlappingWorkflows.sort();

  return { overlap: overlappingWorkflows.length > 0, mode, adopted, overlappingWorkflows };
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
 *   that `resolveHarnessProvenance()` would derive from the running install. Removes the
 *   post-commit-regenerate ordering trap (LRN-070) for CSs that touch templates AND
 *   land them in the same commit. The override does NOT change `harness_ref`; that
 *   continues to be derived from the install's ref state (CS82 / C82-5). Format
 *   validation: must match `/^[0-9a-f]{40}$/`; mismatches throw
 *   SyncError ESYNC_INVALID_RESOLVED_SHA.
 * @param {object} [args.provenanceDeps] - CS82 (C82-7): optional injectable seam
 *   for `resolveHarnessProvenance()` — `{ installRoot?, readFileSync?, execSync? }`.
 *   Testing-only; each field defaults to the production value (running module's
 *   package root / real fs reader / real git runner). Not a CLI flag (no new CLI
 *   surface — C82-9).
 * @param {string} [args.configPath] - CS15c (CS04b/LRN-027): optional explicit path to
 *   harness.config.json. When provided, replaces the default `<consumerRepoPath>/harness.config.json`.
 *   Path may be absolute or relative to the consumer cwd (caller is responsible for
 *   resolving relative paths before calling). Closes the silently-ignored-flag bug
 *   from LRN-027.
 * @param {boolean} [args.applyNew=false] - CS64b (C64b-3): when true, adopt every
 *   harness-shipped managed file absent from `managed.files` — add its canonical
 *   target to `managed.files` (dedup) and copy/render the template into the
 *   consumer tree (apply mode only). Default false preserves all existing callers.
 * @param {boolean} [args.quiet=false] - CS64b (C64b-3): when true, suppress the
 *   new-managed-file advisory (success/advisory output only). Hard errors still
 *   surface. Default false preserves output.
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
    configPath: configPathOverride = null,
    applyNew = false,
    quiet = false,
    provenanceDeps = null,
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
  const configPath = configPathOverride !== null
    ? configPathOverride
    : path.join(consumerRepoPath, 'harness.config.json');
  const configRaw = await readFileOrNull(configPath);
  if (configRaw === null) {
    throw new SyncError(
      configPathOverride !== null
        ? `Config file not found at ${configPath}`
        : `harness.config.json not found at ${configPath}`,
      'ESYNC_NO_CONFIG'
    );
  }

  let config;
  try {
    config = JSON.parse(configRaw);
  } catch (err) {
    throw new SyncError(
      configPathOverride !== null
        ? `Config file ${configPath}: is not valid JSON: ${err.message}`
        : `harness.config.json is not valid JSON: ${err.message}`,
      'ESYNC_INVALID_CONFIG'
    );
  }

  // CS15c (CS04b R1 review fix): when the config path is an explicit --config
  // override, surface the override path in validation-error stderr so the user
  // sees WHICH file failed, not just the name "harness.config.json". For the
  // default-path case (no override) we keep the legacy messages verbatim for
  // back-compat with existing tests and downstream tooling.
  try {
    validateConfig(config);
  } catch (err) {
    if (configPathOverride !== null && err instanceof SyncError) {
      throw new SyncError(
        `Config file ${configPath}: ${err.message.replace(/^harness\.config\.json\s+/, '')}`,
        err.code
      );
    }
    throw err;
  }

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
  try {
    config = validateConfigSchema(config, harnessRepoPath);
  } catch (err) {
    if (configPathOverride !== null && err instanceof SyncError) {
      throw new SyncError(
        `Config file ${configPath}: ${err.message.replace(/^harness\.config\.json\s+/, '')}`,
        err.code
      );
    }
    throw err;
  }

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

  // ── Resolve harness pin provenance (CS82 / C82-2) ────────────────────────
  // Derive harness_ref + resolved_sha from the RUNNING install via the ordered
  // chain (npx-cache → git → fail-closed), NOT from harnessRepoPath: npm/npx
  // strip .git but record the resolved ref→SHA in the install's
  // node_modules/.package-lock.json. `provenanceDeps` is an injectable test seam.
  const { harness_ref, resolved_sha: resolved_sha_derived } =
    resolveHarnessProvenance(provenanceDeps ?? undefined);
  // CS11b: prefer the explicit override when supplied; this lets a CS that
  // touches templates AND root files commit in a single shot, then run sync
  // with the just-made-commit's SHA pinned (avoids the LRN-070 ordering trap).
  // CS82 / C82-5: --resolved-sha overrides ONLY resolved_sha, never harness_ref.
  const resolved_sha = resolvedShaOverride ?? resolved_sha_derived;
  // CS82 / C82-3: apply mode must never persist placeholder provenance. Validate
  // AFTER applying --resolved-sha but ONLY in apply mode — check/dry-run stay
  // best-effort (C82-8) so they never red-flag an existing corrupt lock. Running
  // here (before the plan/commit phase) means a fail-closed apply writes nothing.
  if (mode === 'apply') {
    validateResolvedProvenance({ harness_ref, resolved_sha });
  }
  const config_schema_version = await readConfigSchemaId(harnessRepoPath);

  // ── Build list of all files to process ──────────────────────────────────
  const excluded = Array.isArray(config.excluded) ? config.excluded : [];

  // ── CS64b new-managed-file reconciliation (C64b-3) ───────────────────────
  // Detect harness-shipped managed files the consumer does not yet track
  // (closes the LRN-155 asymmetry). Detection is membership-based, read-only,
  // and never changes drift state or the exit code.
  const { newFiles: detectedNewFilesRaw } =
    await detectNewManagedFiles({ config, harnessRepoPath });
  // Respect config.excluded: a managed target the consumer explicitly opted out
  // of must not be surfaced as a "new managed file" (advisory) nor materialized
  // by --apply-new — aligns C64b-3 with the isExcluded() guard in the main
  // managed copy loop above (Copilot review).
  const detectedNewFiles = detectedNewFilesRaw.filter(f => !isExcluded(f, excluded));

  // C64b-3 adoption: when --apply-new is set (apply mode only — adoption writes
  // files and rewrites managed.files), fold every detected new managed file into
  // the in-memory config so it flows through the normal managed copy/render +
  // lock path below. Idempotent: re-detection after adoption finds nothing.
  /** @type {string[]} */
  const adoptedNewFiles = [];
  if (applyNew && mode === 'apply' && detectedNewFiles.length > 0) {
    config.managed = config.managed ?? {};
    config.managed.files = Array.isArray(config.managed.files) ? config.managed.files : [];
    const present = new Set(config.managed.files.map(f => canonicalizeTargetPath(f)));
    for (const f of detectedNewFiles) {
      if (!present.has(f)) {
        config.managed.files.push(f);
        present.add(f);
        adoptedNewFiles.push(f);
      }
    }
  }

  // Outstanding (un-adopted) new managed files drive the report-only advisory.
  const adoptedSet = new Set(adoptedNewFiles);
  const newManagedFiles = detectedNewFiles.filter(f => !adoptedSet.has(f));

  // C64b-3 advisory (report-only): list new managed files still absent from
  // managed.files. Does NOT change driftDetected or the exit code; suppressed
  // under --quiet (success/advisory output only; hard errors still surface).
  if (!quiet && newManagedFiles.length > 0) {
    warnings.push(
      `New managed files are available but not tracked in managed.files: ` +
      `${newManagedFiles.join(', ')}. Run 'harness sync --mode=apply --apply-new' to adopt them ` +
      `(report-only; does not affect drift or exit code).`
    );
  }

  // ── CS90b adoption-overlap advisory (C90b-4) ─────────────────────────────
  // Report-only: when harness-pr-check.yml is adopted in the default 'lint+drift'
  // mode AND the consumer's own workflows already run `harness lint` /
  // `sync --mode=check`, the L3 gate's internal lint is a redundant second lint.
  // Recommend pr_check.mode='drift-only' (keeps the managed-drift classifier +
  // harness-managed-edit-ack escape valve, drops the second lint). Like the
  // C64b advisory this NEVER flips driftDetected / the exit code and is
  // suppressed under --quiet. The self-host adopts neither path, so it never
  // fires on `agent-harness` itself.
  const { overlap: prCheckLintOverlap, overlappingWorkflows: overlapWorkflows } =
    await detectPrCheckLintOverlap({ config, consumerRepoPath });
  if (!quiet && prCheckLintOverlap) {
    warnings.push(
      `harness-pr-check.yml is adopted in the default 'lint+drift' mode, but your own ` +
      `workflow(s) already run 'harness lint' / 'sync --mode=check': ${overlapWorkflows.join(', ')}. ` +
      `Set pr_check.mode: "drift-only" in harness.config.json to drop the redundant second lint while ` +
      `keeping the managed/composed drift classifier + harness-managed-edit-ack escape valve ` +
      `(report-only; does not affect drift or exit code).`
    );
  }

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
  /** @type {Map<string, string>} target → previous template_prose_hash (CS03d / LRN-020) */
  const prevTemplateProseHash = new Map();
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
        if (typeof entry.template_prose_hash === 'string') {
          prevTemplateProseHash.set(canonTarget, entry.template_prose_hash);
        }
      }
    }
  }

  // C83-3: inject a computed `{{harness_invoke}}` default UNDER config so a
  // consumer's own `templating.harness_invoke` (e.g. the self-host override)
  // wins. Templating is non-strict, so without this default a missing key
  // would ship the literal `{{harness_invoke}}` to consumers.
  const templatingVars = {
    harness_invoke: computeHarnessInvokeDefault(config),
    // CS89: default {{security_codeowner}}/{{infra_codeowner}} to
    // default_codeowner, UNDER config.templating so a consumer that sets
    // either key wins. Non-strict templating would otherwise ship the literal
    // placeholder to consumers that only define default_codeowner.
    ...computeCodeownerDefaults(config),
    ...(config.templating ?? {}),
  };

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
      // A managed-class target whose template/managed source is gone but which
      // now ships a template/composed base was reclassified managed→composed.
      // Fail closed with an actionable migration message instead of the raw
      // ESYNC_MISSING_TEMPLATE (general — works for ANY managed→composed move).
      if (fileClass === 'managed') {
        const composedTemplatePath = path.join(harnessRepoPath, 'template', 'composed', target);
        const composedTemplateRaw = await readFileOrNull(composedTemplatePath);
        if (composedTemplateRaw !== null) {
          throw new SyncError(
            `"${target}" was reclassified from managed to composed. Move "${target}" from ` +
            '`managed.files` to `composed.files` in harness.config.json and add a ' +
            `composed.overrides["${target}"].local_blocks entry, then delete (or empty) the ` +
            `on-disk ${target} — copy any local edits you made to it elsewhere first — before ` +
            `re-running sync so the composed skeleton regenerates.`,
            'ESYNC_RECLASSIFIED_TO_COMPOSED'
          );
        }
      }
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
      const lockTemplateProseHash = prevTemplateProseHash.get(target) ?? null;

      // C38a R2 B3: when composed.overrides[target]._inherited_class === 'managed',
      // the file was previously managed-class and is now transitioning to composed.
      // Dispatch to mergeComposedFromManaged which preserves consumer-owned prose
      // outside marker blocks (bypassing the normal EMERGE_LEGACY_UNMAPPED check).
      const inheritedFromManaged =
        config.composed?.overrides?.[target]?._inherited_class === 'managed';

      let mergeResult;
      try {
        if (inheritedFromManaged) {
          mergeResult = mergeComposedFromManaged(rendered, currentContent ?? '', {
            allowedBlockIds,
            targetForWarning: target,
          });
        } else {
          mergeResult = mergeComposed(rendered, currentContent ?? '', {
            allowedBlockIds,
            legacyMapping,
            lockRecords,
            lockTemplateProseHash,
          });
        }
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
          template_prose_hash: mergeResult.templateProseHash,
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

    // C64b-3 adoption: persist the newly-adopted managed.files entries back to
    // the consumer's harness.config.json so adoption sticks across runs
    // (idempotency). Re-parse the original raw config so only managed.files is
    // mutated and all other config FIELDS are carried through; note that
    // re-serializing via JSON.stringify re-normalizes indentation/whitespace, so
    // byte-for-byte on-disk formatting is not necessarily preserved.
    if (applyNew && adoptedNewFiles.length > 0) {
      const rawConfig = JSON.parse(configRaw);
      rawConfig.managed = rawConfig.managed ?? {};
      rawConfig.managed.files = Array.isArray(rawConfig.managed.files)
        ? rawConfig.managed.files
        : [];
      const present = new Set(rawConfig.managed.files.map(f => canonicalizeTargetPath(f)));
      for (const f of adoptedNewFiles) {
        if (!present.has(f)) {
          rawConfig.managed.files.push(f);
          present.add(f);
        }
      }
      await writeFile(configPath, JSON.stringify(rawConfig, null, 2) + '\n', 'utf8');
    }
  }

  return {
    mode,
    changes,
    driftDetected,
    warnings,
    newManagedFiles,
    lockBefore,
    lockAfter: mode === 'apply' ? lockAfter : lockAfter,
  };
}
