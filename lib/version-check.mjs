/**
 * lib/version-check.mjs — get-latest-first version-pin comparator (CS111).
 *
 * Pure, zero-dependency helpers that compare the running harness CLI version
 * (package.json `version`) against a consumer's pinned `harness.config.json`
 * `version`, so `harness startup` (and the `sync` render-time error path) can
 * make the "get latest FIRST, then invoke the harness at the pulled pin"
 * discipline mechanical instead of memory-dependent (issue #502).
 *
 * Design notes:
 *   - This module is COMPARE-only. It deliberately does NOT import from
 *     `bin/harness.mjs` (that would be a lib→bin layering inversion) and does
 *     NOT call `normalizeInitVersion` (a WRITE-op that derives a pin to persist).
 *     The `v`-prefix / SHA semantics are re-implemented locally for comparison.
 *   - Every export is pure and defensively tolerant of missing/undefined fields
 *     — it NEVER throws on partial input (mirroring `normalizeInitVersion`).
 *   - Normalized comparison is mandatory: seeded/init pins are `v`-normalized
 *     (`v0.17.0`) while `package.json` is a bare `0.17.0`, so a literal string
 *     compare would false-fail valid consumers (#502's own repro pins `v0.17.0`
 *     vs a bare `0.17.0` package). `0.17.0` and `v0.17.0` therefore compare EQUAL.
 *   - Exemptions (never fail-fast): a self-host / pre-release sentinel
 *     (`0.0.0-pre` / `0.0.0-*`), a SHA pin the running CLI cannot self-identify
 *     against, an empty config version, or an unreadable running version.
 *
 * @module lib/version-check.mjs
 */

/** The published harness install slug used in the corrective re-run command. */
const HARNESS_INSTALL_SLUG = 'github:henrik-me/agent-harness';

/**
 * @typedef {'match'|'mismatch'|'exempt'} VersionOutcome
 *
 * @typedef {object} VersionVerdict
 * @property {VersionOutcome} outcome
 * @property {string|null}    exemptReason    - Why the check was exempt (only when outcome==='exempt').
 * @property {string}         runningIdentity - The running CLI version, as read (e.g. '0.17.0').
 * @property {string}         configVersion   - The pinned harness.config.json version, as read (e.g. 'v0.17.0').
 * @property {string}         rerunRef         - The ref the user should pin on re-run (e.g. 'v0.17.0' or a SHA).
 * @property {string}         message          - Actionable one-line message (populated only on 'mismatch').
 */

/** Trim + coerce any value to a string (never throws). */
function asTrimmedString(value) {
  return value == null ? '' : String(value).trim();
}

/**
 * Normalize a version string for equivalence comparison: trim, strip a single
 * leading `v`/`V`, lowercase. So `v0.17.0`, `V0.17.0` and `0.17.0` all
 * normalize to `0.17.0`.
 *
 * @param {*} value
 * @returns {string}
 */
export function normalizeVersion(value) {
  return asTrimmedString(value).replace(/^v/i, '').toLowerCase();
}

/**
 * Compute the ref the user should pin on re-run. Prefers the config version
 * verbatim when it already carries a `v` prefix or is a 40-hex SHA; otherwise
 * `v`-prefixes the normalized SemVer (so the re-run reads `#v0.17.0` / `#<sha>`).
 *
 * @param {*} configVersion
 * @returns {string}
 */
export function computeRerunRef(configVersion) {
  const s = asTrimmedString(configVersion);
  if (/^v/i.test(s)) return s;
  if (/^[0-9a-f]{40}$/i.test(s)) return s;
  const norm = normalizeVersion(s);
  return norm ? `v${norm}` : s;
}

/**
 * Build the actionable mismatch message: names BOTH versions and gives the
 * exact corrective `npx …#<rerunRef> …` re-run command plus the
 * `--skip-version-check` escape hatch.
 *
 * @param {object}   args
 * @param {VersionVerdict} args.result   - A verdict object (or `{ runningIdentity, configVersion, rerunRef }`).
 * @param {string[]} [args.startupArgs]  - The startup args to echo in the re-run command (default `['startup']`).
 * @returns {string}
 */
export function buildMismatchMessage({ result, startupArgs } = {}) {
  const r = result || {};
  const running = asTrimmedString(r.runningIdentity) || 'unknown';
  const pinned = asTrimmedString(r.configVersion) || 'unknown';
  const ref = asTrimmedString(r.rerunRef) || computeRerunRef(pinned) || '<config.version>';
  const args = Array.isArray(startupArgs) && startupArgs.length > 0 ? startupArgs : ['startup'];
  const cmd = `npx -y ${HARNESS_INSTALL_SLUG}#${ref} ${args.join(' ')}`.trim();
  return (
    `Harness version mismatch: the running CLI (version ${running}) does not match ` +
    `the pinned harness.config.json version (${pinned}). Get latest first, then re-run ` +
    `the harness at the pinned version. Re-run with: ${cmd}. ` +
    `Pass --skip-version-check to override.`
  );
}

/**
 * Compare the running CLI version against the pinned config version.
 *
 * Semantics (see module header):
 *   - Empty config version                 → exempt ('no-config-version').
 *   - `0.0.0` / `0.0.0-*` sentinel          → exempt ('sentinel').
 *   - 40-hex SHA config version             → 'match' iff `provenance.resolved_sha`
 *                                             is a real (non-all-zero) 40-hex SHA
 *                                             equal to it; else exempt ('sha-pin-unresolvable').
 *   - Empty running version                 → exempt ('running-version-unknown').
 *   - Otherwise normalized compare          → 'match' or 'mismatch'.
 *
 * Pure and never throws on partial/undefined input.
 *
 * @param {object} args
 * @param {*}      args.runningPkgVersion - The running harness `package.json` version.
 * @param {*}      args.configVersion     - The consumer's pinned `harness.config.json` version.
 * @param {{resolved_sha?: string, harness_ref?: string}} [args.provenance] - From `.harness-lock.json`.
 * @returns {VersionVerdict}
 */
export function evaluateVersionMatch({ runningPkgVersion, configVersion, provenance } = {}) {
  const running = asTrimmedString(runningPkgVersion);
  const cfg = asTrimmedString(configVersion);
  const rerunRef = computeRerunRef(cfg);

  const base = { runningIdentity: running, configVersion: cfg, rerunRef, message: '' };
  const exempt = (reason) => ({ ...base, outcome: 'exempt', exemptReason: reason });

  // No pinned version to compare against — nothing to enforce.
  if (!cfg) return exempt('no-config-version');

  // Self-host / pre-release sentinel (0.0.0, 0.0.0-pre, 0.0.0-<any>).
  if (/^0\.0\.0(?:$|[-+])/.test(cfg)) return exempt('sentinel');

  // SHA-pinned config: the CLI can only self-identify against it via provenance.
  if (/^[0-9a-f]{40}$/i.test(cfg)) {
    const sha = asTrimmedString(provenance && provenance.resolved_sha);
    const shaReal = /^[0-9a-f]{40}$/i.test(sha) && !/^0{40}$/i.test(sha);
    if (shaReal && sha.toLowerCase() === cfg.toLowerCase()) {
      return { ...base, outcome: 'match', exemptReason: null };
    }
    return exempt('sha-pin-unresolvable');
  }

  // Running version unreadable — cannot compare; skip rather than false-fail.
  if (!running) return exempt('running-version-unknown');

  if (normalizeVersion(cfg) === normalizeVersion(running)) {
    return { ...base, outcome: 'match', exemptReason: null };
  }

  const verdict = { ...base, outcome: 'mismatch', exemptReason: null };
  verdict.message = buildMismatchMessage({ result: verdict });
  return verdict;
}

/**
 * Produce a one-line hint appended to the `ESYNC_MISSING_TEMPLATE` error when a
 * managed template target is missing during render (CS111 / C111-5). Defence in
 * depth: even a render path that bypassed the startup preflight surfaces the
 * likely root cause (a stale CLI vs. a newer pinned config) by naming BOTH
 * versions. Fail-soft: returns '' when neither version is available so the
 * caller can still throw the original error unchanged.
 *
 * @param {object} args
 * @param {*} args.runningPkgVersion - The running harness `package.json` version.
 * @param {*} args.configVersion     - The consumer's pinned `harness.config.json` version.
 * @returns {string} A leading-space-prefixed hint, or '' when no version is known.
 */
export function formatTemplateMissingVersionHint({ runningPkgVersion, configVersion } = {}) {
  const running = asTrimmedString(runningPkgVersion);
  const pinned = asTrimmedString(configVersion);
  if (!running && !pinned) return '';
  const runningTxt = running || 'unknown';
  const pinnedTxt = pinned || 'unknown';
  const ref = pinned ? computeRerunRef(pinned) : '<config.version>';
  return (
    ` This can happen when the running harness CLI (version ${runningTxt}) is older than ` +
    `the pinned harness.config.json version (${pinnedTxt}): a template added in the newer ` +
    `version is absent from the older CLI. Get latest first, then re-run the harness at the ` +
    `pinned version (npx -y ${HARNESS_INSTALL_SLUG}#${ref} ...).`
  );
}
