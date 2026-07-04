#!/usr/bin/env node
// check-workboard-allowlist-consistency.mjs
//
// CS71 (D71-4): workboard-allowlist consistency guard.
//
// The workboard path allowlist is the single source of truth that decides
// whether a PR is "workboard-only" (docs/clickstop bookkeeping) and may skip
// the heavy review-evidence gates. It appears in the workflow tree in TWO
// textual forms:
//
//   * regex form  — `grep -Ev '^(WORKBOARD\.md|CONTEXT\.md|LEARNINGS\.md)$|^project/clickstops/(planned|active|done)/'`
//                   (review-gates.yml guard + 4 evidence-job skip steps,
//                    pr-evidence-lint.yml compute-skip-reasons).
//   * list form   — the `allowed-paths.txt` heredoc in workboard-auto-approve.yml
//                   (WORKBOARD.md / CONTEXT.md / LEARNINGS.md /
//                    project/clickstops/{planned,active,done}/).
//
// If these drift apart, a PR can pass one gate's notion of "workboard-only"
// while another gate uses a different set — re-introducing the transient-red /
// silent-bypass failure classes CS71 exists to kill. This linter parses every
// allowlist SITE (in both forms, in every workflow copy) into a canonical token
// set and asserts they are all identical.
//
// Each allowlist site MUST carry a `# harness:workboard-allowlist` marker on one
// of the few lines immediately above it; a missing marker is a structural error
// (a future edit could add a new allowlist site the drift-check never sees).
//
// Exit codes:
//   0  all allowlist occurrences are equivalent.
//   1  drift — two or more occurrences disagree on the token set.
//   2  bad usage / a required workflow file is missing (self-host) / an
//      allowlist site is missing its marker / a marked site cannot be parsed /
//      a required file lost its allowlist entirely.
//
// Node built-ins only. Consumer-root-relative: all paths resolve against --cwd
// (default process.cwd()), never import.meta.url (LRN-050).

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const LINTER = 'check-workboard-allowlist-consistency';
const SELF_HOST_PKG = '@henrik-me/agent-harness';

// The six canonical workflow files (relative to --cwd). In self-host ALL six
// must exist; a consumer may have only a subset (the aggregator self-host-gates
// this linter, so consumers normally never run it — but if invoked standalone
// it tolerates absent canonical files rather than failing spuriously).
const CANDIDATES = [
  '.github/workflows/review-gates.yml',
  '.github/workflows/pr-evidence-lint.yml',
  '.github/workflows/workboard-auto-approve.yml',
  'template/managed/.github/workflows/review-gates.yml',
  'template/managed/.github/workflows/pr-evidence-lint.yml',
  'template/managed/.github/workflows/workboard-auto-approve.yml',
];

const MARKER = '# harness:workboard-allowlist';
const MARKER_WINDOW = 3; // lines above a site to search for the marker

const HELP = `Usage: node scripts/check-workboard-allowlist-consistency.mjs [--cwd <path>] [--quiet]

Asserts every workboard-allowlist occurrence (regex form + allowed-paths list
form, across every workflow copy) parses to the identical token set.

Options:
  --cwd <path>   Directory to scan (default: current working directory).
  --quiet        Print only the one-line pass/fail summary.
  -h, --help     Show this help and exit 0.

Exit: 0 = consistent; 1 = drift; 2 = usage error / missing file / missing
marker / unparseable allowlist.
`;

function normalizeLF(text) {
  let s = text;
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1); // strip BOM
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function requireValue(args, i, flagName) {
  const v = args[i + 1];
  if (v === undefined || v.startsWith('-')) {
    process.stderr.write(`${LINTER}: missing value for ${flagName}\n`);
    process.exit(2);
  }
  return v;
}

function detectMode(root) {
  const pkgPath = path.join(root, 'package.json');
  let raw;
  try {
    raw = fs.readFileSync(pkgPath, 'utf8');
  } catch {
    return 'consumer'; // no/unreadable package.json -> treat as consumer (fail-soft)
  }
  try {
    const pkg = JSON.parse(normalizeLF(raw));
    return pkg && pkg.name === SELF_HOST_PKG ? 'self-host' : 'consumer';
  } catch {
    return 'consumer';
  }
}

// Detect every allowlist-bearing SITE in a file by CONTENT signature, so a
// missing marker is still caught (we don't key off the marker to find sites).
function findSites(lines) {
  const sites = [];
  // regex-form: a line containing `grep -Ev` and `WORKBOARD`.
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('grep -Ev') && lines[i].includes('WORKBOARD')) {
      sites.push({ kind: 'regex', lineIndex: i, lineNo: i + 1, raw: lines[i] });
    }
  }
  // list-form: a heredoc whose body contains the three root allowlist files.
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/<<-?\s*'?([A-Za-z_][A-Za-z0-9_]*)'?\s*$/);
    if (!m) continue;
    const term = m[1];
    const body = [];
    let end = -1;
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() === term) {
        end = j;
        break;
      }
      body.push(lines[j]);
    }
    if (end === -1) continue; // unterminated heredoc -> not treated as a site
    const trimmed = body.map((b) => b.trim());
    if (
      trimmed.includes('WORKBOARD.md') &&
      trimmed.includes('CONTEXT.md') &&
      trimmed.includes('LEARNINGS.md')
    ) {
      sites.push({ kind: 'list', lineIndex: i, lineNo: i + 1, body });
    }
    i = end; // skip past the heredoc body
  }
  return sites;
}

function hasMarkerAbove(lines, siteLineIndex) {
  const start = Math.max(0, siteLineIndex - MARKER_WINDOW);
  for (let k = start; k < siteLineIndex; k++) {
    if (lines[k].includes(MARKER)) return true;
  }
  return false;
}

function extractRegexString(line) {
  const idx = line.indexOf('grep -Ev');
  if (idx === -1) return null;
  const after = line.slice(idx + 'grep -Ev'.length);
  const q1 = after.indexOf("'");
  if (q1 === -1) return null;
  const q2 = after.indexOf("'", q1 + 1);
  if (q2 === -1) return null;
  return after.slice(q1 + 1, q2);
}

// Split a regex on top-level `|` (alternations not nested inside `(...)`).
function splitTopLevelPipe(re) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of re) {
    if (ch === '(') {
      depth++;
      cur += ch;
    } else if (ch === ')') {
      depth--;
      cur += ch;
    } else if (ch === '|' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  return parts;
}

// Expand one top-level alternative into its concrete allowlist tokens, each
// tagged with its match SEMANTICS so an exact<->prefix swap (or a dropped `$`
// / `/`) is caught as drift/structural error instead of canonicalizing to the
// same bare path (rubber-duck R1, gpt-5.5):
//  - strip leading ^ anchor, note whether a trailing $ anchor is present,
//  - unescape \. -> .,
//  - expand a single prefix(a|b|c)suffix group into {prefix+a+suffix, ...},
//  - `^X$`  -> `exact:X`   (anchored exact match, e.g. a root file),
//  - `^Y/`  -> `prefix:Y`  (trailing-slash prefix match, e.g. a clickstop dir),
//  - `^Y/$` -> null        (BOTH anchored and trailing-slash — an anchored-exact
//                           of a slash-terminated path, NOT prefix semantics),
//  - `^Z`   -> null        (neither anchored-exact nor trailing-slash prefix —
//                           an unencoded/ambiguous form). null => parse failure
//                           so a dropped `$`/`/` or a spurious `$` fails closed.
function expandAlternative(alt) {
  let s = alt;
  if (s.startsWith('^')) s = s.slice(1);
  const anchoredEnd = s.endsWith('$');
  if (anchoredEnd) s = s.slice(0, -1);
  s = s.replace(/\\\./g, '.');
  let bases;
  const open = s.indexOf('(');
  if (open !== -1) {
    const close = s.indexOf(')', open);
    if (close === -1) return null; // malformed group
    const prefix = s.slice(0, open);
    const suffix = s.slice(close + 1);
    const opts = s.slice(open + 1, close).split('|');
    bases = opts.map((o) => prefix + o + suffix);
  } else {
    bases = [s];
  }
  const out = [];
  for (const b of bases) {
    const trailingSlash = b.endsWith('/');
    // prefix ONLY when trailing-slash and NOT $-anchored; exact ONLY when
    // $-anchored and NOT trailing-slash. `^Y/$` (both) and `^Z` (neither) are
    // ambiguous/unencoded -> null (structural error, fail closed). (gpt-5.5 R2)
    if (trailingSlash && !anchoredEnd) out.push(`prefix:${b.slice(0, -1)}`);
    else if (anchoredEnd && !trailingSlash) out.push(`exact:${b}`);
    else return null;
  }
  return out;
}

function parseRegexTokens(regexStr) {
  const alts = splitTopLevelPipe(regexStr);
  const set = new Set();
  for (const alt of alts) {
    const toks = expandAlternative(alt);
    if (toks === null) return null;
    for (const t of toks) set.add(t);
  }
  return set;
}

function parseListTokens(bodyLines) {
  const set = new Set();
  for (const raw of bodyLines) {
    const t = raw.trim();
    if (!t) continue;
    // Trailing '/' => prefix match; otherwise exact — matching
    // workboard-auto-approve.yml is_allowed() (prefix entries end in '/',
    // exact entries do not). Encode the kind so it agrees with the regex form.
    if (t.endsWith('/')) set.add(`prefix:${t.slice(0, -1)}`);
    else set.add(`exact:${t}`);
  }
  return set;
}

function tokenKey(set) {
  return [...set].sort().join('|');
}

export function checkTree({ cwd } = {}) {
  const root = path.resolve(cwd || process.cwd());
  const mode = detectMode(root);
  const structural = []; // -> exit 2
  const driftMsgs = []; // -> exit 1
  const collected = []; // { file, lineNo, kind, tokens }
  let fileCount = 0;

  for (const rel of CANDIDATES) {
    const abs = path.join(root, ...rel.split('/'));
    let content;
    try {
      content = fs.readFileSync(abs, 'utf8');
    } catch (e) {
      if (e && e.code === 'ENOENT') {
        if (mode === 'self-host') {
          structural.push(`required workflow file missing: ${rel}`);
        }
        continue; // consumer: absent canonical file tolerated
      }
      structural.push(`${rel}: cannot read file: ${e && e.message}`);
      continue;
    }
    fileCount++;
    const lines = normalizeLF(content).split('\n');
    const sites = findSites(lines);
    if (sites.length === 0) {
      structural.push(
        `${rel}: no workboard-allowlist site found (allowlist removed?)`,
      );
      continue;
    }
    for (const site of sites) {
      if (!hasMarkerAbove(lines, site.lineIndex)) {
        structural.push(
          `allowlist site missing its \`${MARKER}\` marker at ${rel}:${site.lineNo}`,
        );
        continue;
      }
      let tokens;
      if (site.kind === 'regex') {
        const re = extractRegexString(site.raw);
        if (re === null) {
          structural.push(
            `${rel}:${site.lineNo}: cannot extract allowlist regex from grep -Ev line`,
          );
          continue;
        }
        tokens = parseRegexTokens(re);
        if (tokens === null) {
          structural.push(
            `${rel}:${site.lineNo}: cannot parse allowlist regex: ${re}`,
          );
          continue;
        }
      } else {
        tokens = parseListTokens(site.body);
        if (tokens.size === 0) {
          structural.push(
            `${rel}:${site.lineNo}: allowlist heredoc body is empty`,
          );
          continue;
        }
      }
      collected.push({ file: rel, lineNo: site.lineNo, kind: site.kind, tokens });
    }
  }

  // Group by canonical token key; more than one distinct group = drift.
  if (collected.length > 1) {
    const groups = new Map();
    for (const s of collected) {
      const key = tokenKey(s.tokens);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    }
    if (groups.size > 1) {
      for (const [key, members] of groups) {
        const where = members.map((m) => `${m.file}:${m.lineNo} (${m.kind})`).join(', ');
        const toks = key.split('|').join(', ');
        driftMsgs.push(`allowlist variant {${toks}} at: ${where}`);
      }
    }
  }

  return { mode, structural, driftMsgs, siteCount: collected.length, fileCount };
}

function main(argv) {
  let cwd = process.cwd();
  let quiet = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--cwd') {
      cwd = requireValue(argv, i, '--cwd');
      i++;
    } else if (a === '--quiet') {
      quiet = true;
    } else if (a === '-h' || a === '--help') {
      process.stdout.write(HELP);
      process.exit(0);
    } else {
      process.stderr.write(`${LINTER}: unknown argument: ${a}\n`);
      process.stderr.write(HELP);
      process.exit(2);
    }
  }

  let res;
  try {
    res = checkTree({ cwd });
  } catch (e) {
    process.stderr.write(`${LINTER}: ${(e && e.message) || e}\n`);
    process.exit(2);
  }

  if (res.structural.length > 0) {
    for (const m of res.structural) process.stderr.write(`ERROR: ${m}\n`);
    process.stderr.write(`\u274c ${LINTER}: ${res.structural.length} structural error(s)\n`);
    process.exit(2);
  }

  if (res.driftMsgs.length > 0) {
    for (const m of res.driftMsgs) process.stderr.write(`ERROR: ${m}\n`);
    process.stderr.write(`\u274c ${LINTER}: workboard-allowlist occurrences disagree (drift)\n`);
    process.exit(1);
  }

  if (quiet) {
    process.stdout.write(
      `\u2705 ${LINTER}: ${res.siteCount} allowlist sites across ${res.fileCount} files agree\n`,
    );
  } else {
    process.stdout.write(
      `${LINTER}: mode=${res.mode}; scanned ${res.fileCount} workflow file(s); ` +
        `${res.siteCount} allowlist site(s) all equivalent.\n`,
    );
    process.stdout.write(`\u2705 Linter passed\n`);
  }
  process.exit(0);
}

main(process.argv.slice(2));
