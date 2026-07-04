/**
 * lib/distributed-surface-globs.mjs — Distributed-harness-surface detection.
 *
 * Shared helper for CHANGELOG-touch enforcement (CS24 / LRN-101). A clickstop
 * whose deliverables touch the *distributed* harness surface (the files that
 * actually ship to consumers on `harness sync`) must carry a CHANGELOG-touch
 * task row. This module answers the single question "does this path token land
 * on the distributed surface?" so both `check-clickstop.mjs` and its test suite
 * can agree on the definition. It also extracts candidate deliverable path
 * tokens from a `## Deliverables` section body ({@link extractDeliverablePathTokens}),
 * matching full extensions whole (e.g. `.json` is NOT truncated to `.js`).
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
 * line (`template/**`, `scripts/*.mjs`). Excluded paths win: a token covered by
 * `excluded[]` is never distributed surface even if it matches a candidate glob.
 *
 * The `scripts/**` candidate is narrowed to its distributed subset: a `.mjs`
 * file or `*.mjs` glob is distributed, and a broad scripts glob/dir token
 * (`scripts/**`, `scripts/*`, `scripts/`) covers that surface and so is
 * distributed too; a concrete non-`.mjs` file or a non-`.mjs` glob
 * (`scripts/README.md`, `scripts/*.sh`) is exempt.
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
    if (glob === 'scripts/**') {
      // C24-1: only *.mjs under scripts/ is distributed surface.
      // A token ending in .mjs (concrete file or *.mjs glob) is distributed.
      // A broad scripts glob or directory token (scripts/**, scripts/*, scripts/)
      // covers the .mjs surface and is distributed. A concrete non-.mjs file
      // (scripts/README.md) or a non-.mjs glob (scripts/*.sh) is exempt.
      if (token.endsWith('.mjs')) return true;
      if (/\/\*{1,2}$/.test(token) || token.endsWith('/')) return true;
      continue;
    }
    return true;
  }
  return false;
}

/**
 * Extract candidate path/glob tokens from a `## Deliverables` section body.
 *
 * To mitigate R1 (false positives from illustrative prose mentioning paths),
 * only list-item lines (`- `, `* `, `N. `) and table rows (lines starting with
 * `|`) are scanned; other prose lines are ignored. Surrounding backticks are
 * replaced with spaces before matching.
 *
 * Extraction is deliberately simple: it lifts every MAXIMAL contiguous
 * path-like token (word chars, `.`, `/`, `*`, `-`) from the qualifying lines
 * and leaves ALL classification to {@link matchesDistributedSurface}, which is
 * the SOLE classifier. Extracting whole tokens (rather than sub-tokens) is what
 * fixes the recurring sub-token bug (R1 glob forms, R2 `package.json` →
 * `package.js`, R3 distributed-prefix-of-a-non-distributed-path): a whole token
 * such as `scripts/foo.sh`, `package.json.bak`, or `scripts/foo.mjs.bak` is
 * classified `false`, while `scripts/**`, `scripts/*.mjs`, and `package.json`
 * are `true` — so a distributed prefix is never split out of a longer
 * non-distributed path. A trailing sentence dot is stripped so an unbackticked
 * `...scripts/foo.mjs.` still yields `scripts/foo.mjs`.
 *
 * Because `*` and `_` double as Markdown emphasis markers, a bold/italic-wrapped
 * deliverable (`**template/composed/OPERATIONS.md**`, `_lib/x.mjs_`) is captured
 * WITH its wrappers by the maximal token regex. {@link normalizeToken} strips
 * *balanced* emphasis wrappers (the SAME marker at both ends) so such tokens
 * classify correctly, while an UNBALANCED trailing glob like `scripts/**` (no
 * matching leading `**`) is PRESERVED intact.
 *
 * @param {string} deliverablesBody
 * @returns {string[]} candidate tokens (may contain duplicates).
 */
export function extractDeliverablePathTokens(deliverablesBody) {
  const PATH_TOKEN_RE = /[\w./*-]+/g;
  const tokens = [];
  for (const rawLine of deliverablesBody.split('\n')) {
    const line = rawLine.trim();
    const isListItem = /^([-*]\s|\d+\.\s)/.test(line);
    const isTableRow = line.startsWith('|');
    if (!isListItem && !isTableRow) continue;
    const content = isListItem ? line.replace(/^([-*]\s|\d+\.\s)/, '') : line;
    const stripped = content.replace(/`/g, ' ');
    const matches = stripped.match(PATH_TOKEN_RE);
    if (!matches) continue;
    for (const raw of matches) {
      const token = normalizeToken(raw);
      if (token) tokens.push(token);
    }
  }
  return tokens;
}

/**
 * Normalize one raw path token: strip trailing sentence dot(s) AND *balanced*
 * Markdown emphasis wrappers, looping until stable.
 *
 * A marker is only stripped when the SAME marker (`**`, `__`, `*`, `_`) brackets
 * BOTH ends of the token — so `**path**`/`*path*`/`__path__`/`_path_` are
 * unwrapped to `path`, while an unbalanced trailing glob like `scripts/**`
 * (which has NO matching LEADING marker) is PRESERVED. Trailing dots and
 * emphasis are stripped together so combined forms like `**scripts/foo.mjs**.`
 * and `**scripts/foo.mjs.**` both reduce to `scripts/foo.mjs`.
 *
 * @param {string} raw
 * @returns {string}
 */
function normalizeToken(raw) {
  let t = raw;
  let changed = true;
  while (changed) {
    changed = false;
    const noDot = t.replace(/\.+$/, ''); // trailing sentence dot(s)
    if (noDot !== t) {
      t = noDot;
      changed = true;
    }
    // Balanced markdown emphasis wrappers only (same marker both ends), so a
    // trailing glob like `scripts/**` — which has NO matching leading marker —
    // is preserved while `**path**`/`*path*`/`__path__`/`_path_` are unwrapped.
    for (const marker of ['**', '__', '*', '_']) {
      if (
        t.length > 2 * marker.length &&
        t.startsWith(marker) &&
        t.endsWith(marker)
      ) {
        t = t.slice(marker.length, t.length - marker.length);
        changed = true;
        break;
      }
    }
  }
  return t;
}
