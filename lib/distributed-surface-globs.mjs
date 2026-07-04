/**
 * lib/distributed-surface-globs.mjs — Distributed-harness-surface detection.
 *
 * Shared helper for CHANGELOG-touch enforcement (CS24 / LRN-101). A clickstop
 * whose deliverables touch the *distributed* harness surface (the files that
 * actually ship to consumers on `harness sync`) must carry a CHANGELOG-touch
 * task row. This module answers the single question "does this path token land
 * on the distributed surface?" so both `check-clickstop.mjs` and its test suite
 * can agree on the definition.
 *
 * The candidate globs mirror C24-1's enumeration:
 *   template/**, lib/**, scripts/** (restricted to *.mjs), bin/**,
 *   scaffolds/**, schemas/**, package.json, package-lock.json.
 *
 * The `excluded[]` list from `harness.config.json` is subtracted: a path that
 * matches a candidate glob but is also covered by an explicit sync exclusion is
 * NOT distributed surface (it does not ship). Per `schemas/harness.config.schema.json`,
 * `excluded[]` entries are literal paths — globs are NOT interpreted — and a
 * trailing `/` marks a directory exclusion.
 *
 * Zero runtime dependencies; Node built-ins only.
 *
 * @module lib/distributed-surface-globs.mjs
 */

/**
 * Candidate distributed-surface globs (C24-1). `scripts/**` is additionally
 * restricted to `*.mjs` files by {@link matchesDistributedSurface}; the raw
 * glob is listed here so the exported constant matches the documented surface.
 *
 * @type {readonly string[]}
 */
export const DISTRIBUTED_SURFACE_GLOBS = Object.freeze([
  'template/**',
  'lib/**',
  'scripts/**',
  'bin/**',
  'scaffolds/**',
  'schemas/**',
  'package.json',
  'package-lock.json',
]);

/**
 * Compile a simple glob into an anchored RegExp.
 *
 *   `**` matches any run of characters (including `/`).
 *   `*`  matches any run of non-`/` characters.
 *
 * All other regex metacharacters are escaped. The globs handled here are the
 * small fixed set in {@link DISTRIBUTED_SURFACE_GLOBS}, so only `*`/`**` need
 * translating.
 *
 * @param {string} glob
 * @returns {RegExp}
 */
function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*';
        i++;
      } else {
        re += '[^/]*';
      }
    } else if ('.+?^${}()|[]\\/'.includes(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}

/** Pre-compiled matchers for the candidate globs. */
const GLOB_MATCHERS = DISTRIBUTED_SURFACE_GLOBS.map((glob) => ({
  glob,
  re: globToRegExp(glob),
}));

/**
 * Whether `pathStr` is covered by an `excluded[]` entry. Entries are literal
 * (globs NOT interpreted). A trailing `/` marks a directory exclusion; a plain
 * entry matches exactly or as a directory prefix (so `lib` also covers
 * `lib/foo.mjs`, defensively, even without the trailing slash).
 *
 * @param {string} pathStr
 * @param {string[]} excludedList
 * @returns {boolean}
 */
function isExcluded(pathStr, excludedList) {
  for (const raw of excludedList) {
    if (typeof raw !== 'string' || raw === '') continue;
    const entry = raw.replace(/\\/g, '/');
    if (entry.endsWith('/')) {
      if (pathStr.startsWith(entry)) return true;
    } else if (pathStr === entry || pathStr.startsWith(`${entry}/`)) {
      return true;
    }
  }
  return false;
}

/**
 * Does a path token land on the distributed harness surface, after subtracting
 * the `excluded[]` list?
 *
 * The token may be a concrete file path (`scripts/foo.mjs`), a directory-like
 * token (`tests/fixtures/cs24/`), or a glob-ish token lifted from a deliverables
 * line (`template/**`). Excluded paths win: a token covered by `excluded[]` is
 * never distributed surface even if it matches a candidate glob.
 *
 * @param {string} pathStr        Normalized (`/`-separated) path or glob token.
 * @param {string[]} [excludedList] `harness.config.json` `excluded[]` array.
 * @returns {boolean}
 */
export function matchesDistributedSurface(pathStr, excludedList = []) {
  if (typeof pathStr !== 'string' || pathStr === '') return false;
  const token = pathStr.replace(/\\/g, '/');
  if (isExcluded(token, excludedList)) return false;

  for (const { glob, re } of GLOB_MATCHERS) {
    if (!re.test(token)) continue;
    // C24-1: only *.mjs under scripts/ counts as distributed surface.
    if (glob === 'scripts/**' && !token.endsWith('.mjs')) continue;
    return true;
  }
  return false;
}
