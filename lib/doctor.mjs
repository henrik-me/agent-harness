/**
 * lib/doctor.mjs — read-only harness health probe (CS64b C64b-1).
 *
 * Detects the LRN-151 "broken loose ref" state: a crash mid-`git fetch` can
 * leave a loose ref file under `<gitDir>/refs/remotes/origin/<branch>`
 * populated with only zero / whitespace / NUL bytes. A single broken ref
 * makes EVERY subsequent `git fetch` abort with
 * `fatal: bad object refs/remotes/...`, blocking session-start sync, the
 * staleness check, and close-out rebases.
 *
 * The default verb is REPORT-ONLY and safe to run anytime (including from
 * `harness startup`): it walks the loose-ref tree, prints findings + the exact
 * LRN-151 repair recipe, and exits 0. `--repair` is the only path that mutates
 * anything — it deletes the broken loose ref files, strips matching
 * `packed-refs` lines, and re-fetches to recreate the refs cleanly. Repair is
 * idempotent (re-running after success is a no-op).
 *
 * All git access goes through an INJECTABLE `runGit` seam so unit tests run
 * with no real git or network. The filesystem is likewise injectable via `fs`.
 *
 * @module lib/doctor.mjs
 */

import { spawnSync } from 'node:child_process';
import * as nodeFs from 'node:fs';
import path from 'node:path';

const USAGE = `harness doctor — detect (and optionally repair) broken loose git refs (LRN-151)

Usage:
  harness doctor [--repair] [--quiet] [--cwd <path>]

Options:
  --repair        Delete the broken loose ref files, strip matching
                  packed-refs lines, and run \`git fetch origin --prune\`.
                  Default is report-only (read-only, safe to run anytime).
  --quiet         Suppress the "no broken refs" line and the repair-success
                  line. Broken-ref findings + the repair recipe still print to
                  stdout (a real problem is never silenced); errors go to stderr.
  --cwd <path>    Resolve the git directory relative to <path> (default: cwd).
  --help, -h      Print this help and exit 0.

Default (no --repair) is advisory: it reports broken refs and prints the
exact repair recipe, then exits 0.`;

// Whitespace bytes: tab, LF, VT, FF, CR, space.
const WHITESPACE_BYTES = new Set([0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20]);

/**
 * Default git runner. Tests inject a stub instead so no real git/network runs.
 *
 * @param {string[]} args - Arguments passed to `git`.
 * @param {object} [opts]
 * @param {string} [opts.cwd] - Working directory for the git invocation.
 * @returns {{status: number|null, stdout: string, stderr: string}}
 */
export function defaultRunGit(args, { cwd } = {}) {
  // shell:false — git is a real executable (not an npm-style .cmd wrapper, so
  // LRN-029 does not apply) and shell:false avoids the Windows %VAR%-expansion
  // footgun noted in lib/startup.mjs (CS64b Copilot review).
  const r = spawnSync('git', args, { cwd, shell: false, encoding: 'utf8' });
  return {
    status: r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
  };
}

/**
 * Classify the raw bytes of a loose ref file.
 *
 * A healthy ref is a 40-hex SHA (optionally newline-terminated) or a
 * `ref: <target>` symref — both contain at least one non-whitespace,
 * non-NUL byte, so they classify as healthy (returns null). The heuristic is
 * deliberately precise (R1): only zero-byte / NUL-only / whitespace-only
 * content is flagged as broken.
 *
 * @param {Buffer} buf - Raw file contents.
 * @returns {('zero-byte'|'nul-only'|'whitespace-only'|null)} reason or null if healthy.
 */
export function classifyRefBytes(buf) {
  if (buf.length === 0) return 'zero-byte';
  let allNul = true;
  let allBlank = true; // every byte is whitespace or NUL
  for (const b of buf) {
    if (b !== 0x00) allNul = false;
    if (b !== 0x00 && !WHITESPACE_BYTES.has(b)) {
      allBlank = false;
      break;
    }
  }
  if (allNul) return 'nul-only';
  if (allBlank) return 'whitespace-only';
  return null;
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

/**
 * Recursively collect every regular file under a directory.
 *
 * @param {object} fs - Filesystem module (injectable).
 * @param {string} dir - Absolute directory to walk.
 * @returns {string[]} Absolute file paths.
 */
function walkFiles(fs, dir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    // ENOENT is expected (the remotes ref tree may not exist) — return []. Any
    // other error (EACCES/EPERM/EIO) must NOT be swallowed into a false
    // "no broken refs" result — surface it so the caller fails loudly (LRN-162).
    if (e && e.code === 'ENOENT') return out;
    throw e;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(fs, abs));
    } else if (entry.isFile()) {
      out.push(abs);
    }
  }
  return out;
}

/**
 * READ-ONLY. Walk `<gitDir>/refs/remotes/origin/` and return every loose ref file
 * whose contents are zero-byte / NUL-only / whitespace-only (LRN-151).
 *
 * Writes nothing. Returns [] when the remotes ref tree does not exist.
 *
 * @param {object} params
 * @param {string} params.gitDir - Absolute path to the `.git` directory.
 * @param {object} [params.fs] - Filesystem module (injectable; default node fs).
 * @returns {Array<{refPath: string, absPath: string, reason: string}>}
 */
export function detectBrokenLooseRefs({ gitDir, fs = nodeFs }) {
  if (!gitDir || typeof gitDir !== 'string') {
    throw new Error('detectBrokenLooseRefs: gitDir (string) is required');
  }
  // CS64b review fix: scope detection to refs/remotes/origin/ — repair re-fetches
  // origin only, so detecting (and deleting) a broken ref under another remote
  // would orphan it (deleted but never recreated). LRN-151 is origin-scoped; a
  // non-origin broken ref is left for manual recovery rather than half-repaired.
  const remotesDir = path.join(gitDir, 'refs', 'remotes', 'origin');
  const findings = [];
  for (const absPath of walkFiles(fs, remotesDir)) {
    let buf;
    try {
      buf = fs.readFileSync(absPath);
    } catch (e) {
      // ENOENT: the ref vanished between the walk and the read (a concurrent git
      // op) — skip it. Other errors (EACCES/EPERM/EIO) must NOT be swallowed into
      // a false "no broken refs" result (LRN-162).
      if (e && e.code === 'ENOENT') continue;
      throw e;
    }
    const reason = classifyRefBytes(buf);
    if (reason !== null) {
      findings.push({
        refPath: toPosix(path.relative(gitDir, absPath)),
        absPath,
        reason,
      });
    }
  }
  findings.sort((a, b) => a.refPath.localeCompare(b.refPath));
  return findings;
}

/**
 * Build the exact, copy-pasteable LRN-151 repair recipe for the given
 * findings: delete each loose ref file, strip matching `packed-refs` lines,
 * then `git fetch origin --prune`.
 *
 * @param {Array<{refPath: string, absPath: string, reason: string}>} findings
 * @param {object} params
 * @param {string} params.gitDir - Absolute path to the `.git` directory.
 * @returns {string}
 */
export function formatRepairRecipe(findings, { gitDir }) {
  const packedRefs = toPosix(path.join(gitDir, 'packed-refs'));
  const lines = [];
  lines.push('# Broken loose ref(s) detected (LRN-151). Recommended repair:');
  lines.push('#');
  lines.push('# 1. Delete each broken loose ref file:');
  for (const f of findings) {
    lines.push(`rm "${toPosix(f.absPath)}"`);
  }
  lines.push('#');
  lines.push('# 2. Remove any matching line from the packed-refs file (if present):');
  lines.push(`#    edit ${packedRefs} and delete the line(s) ending in:`);
  for (const f of findings) {
    lines.push(`#      ${f.refPath}`);
  }
  lines.push('#');
  lines.push('# 3. Re-fetch to recreate the refs cleanly:');
  lines.push('git fetch origin --prune');
  return lines.join('\n');
}

/**
 * Remove lines from a packed-refs body whose ref name matches one of the
 * broken ref paths.
 *
 * @param {string} body - packed-refs file contents.
 * @param {Set<string>} brokenRefPaths - Ref paths to strip.
 * @returns {{body: string, stripped: number}}
 */
function stripPackedRefsLines(body, brokenRefPaths) {
  const rawLines = body.split('\n');
  const kept = [];
  let stripped = 0;
  for (const line of rawLines) {
    const trimmed = line.trim();
    // `^<sha>` peel lines and `#` header lines are never remote-tracking refs.
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('^')) {
      kept.push(line);
      continue;
    }
    const parts = trimmed.split(/\s+/);
    const refName = parts[1];
    if (refName && brokenRefPaths.has(refName)) {
      stripped += 1;
      continue;
    }
    kept.push(line);
  }
  // split('\n') + join('\n') preserves the original trailing newline (it becomes
  // a trailing empty element in `rawLines`), so no special-casing is needed.
  return { body: kept.join('\n'), stripped };
}

/**
 * Apply the LRN-151 repair: delete the broken loose ref files, strip matching
 * `packed-refs` lines, then `runGit(['fetch','origin','--prune'])`.
 *
 * IDEMPOTENT: missing files and already-stripped packed-refs lines are no-ops;
 * a second run after success does not throw.
 *
 * @param {object} params
 * @param {Array<{refPath: string, absPath: string, reason: string}>} params.findings
 * @param {string} params.gitDir - Absolute path to the `.git` directory.
 * @param {object} [params.fs] - Filesystem module (injectable; default node fs).
 * @param {(args: string[], opts?: {cwd?: string}) => {status: number|null, stdout: string, stderr: string}} params.runGit
 * @param {string} [params.cwd] - Working dir to bind `git fetch` to (the repo that was scanned).
 * @returns {{deleted: string[], packedRefsStripped: number, fetch: {status: number|null, stdout: string, stderr: string}}}
 */
export function repairBrokenLooseRefs({ findings, gitDir, fs = nodeFs, runGit, cwd }) {
  if (typeof runGit !== 'function') {
    throw new Error('repairBrokenLooseRefs: runGit must be a function');
  }
  const deleted = [];
  for (const f of findings) {
    // Delete directly and discriminate ENOENT rather than gating on existsSync()
    // — existsSync() returns false on permission errors too, which would silently
    // skip a real deletion and then report success (LRN-162).
    try {
      fs.rmSync(f.absPath);
      deleted.push(f.absPath);
    } catch (e) {
      if (e && e.code === 'ENOENT') continue; // already removed — idempotent
      throw e;
    }
  }

  let packedRefsStripped = 0;
  const packedRefsPath = path.join(gitDir, 'packed-refs');
  // Read directly and discriminate ENOENT — existsSync() masks permission errors
  // (LRN-162), which would silently skip packed-refs stripping.
  let original = null;
  try {
    original = fs.readFileSync(packedRefsPath, 'utf8');
  } catch (e) {
    if (!(e && e.code === 'ENOENT')) throw e;
  }
  if (original !== null) {
    const brokenRefPaths = new Set(findings.map((f) => f.refPath));
    const { body, stripped } = stripPackedRefsLines(original, brokenRefPaths);
    packedRefsStripped = stripped;
    if (stripped > 0) {
      fs.writeFileSync(packedRefsPath, body);
    }
  }

  // Bind the fetch to the same repo that was scanned (the resolved --cwd) — a
  // bare runGit would otherwise fetch in process.cwd() (CS64b Copilot review).
  const fetch = runGit(['fetch', 'origin', '--prune'], { cwd });
  return { deleted, packedRefsStripped, fetch };
}

/**
 * Resolve the absolute git directory for a working directory.
 *
 * @param {string} cwd
 * @param {(args: string[], opts?: object) => {status: number|null, stdout: string}} runGit
 * @returns {string} Absolute path to the `.git` directory.
 */
function resolveGitDir(cwd, runGit) {
  try {
    const r = runGit(['rev-parse', '--git-dir'], { cwd });
    if (r && r.status === 0 && (r.stdout || '').trim()) {
      return path.resolve(cwd, r.stdout.trim());
    }
  } catch {
    // fall through to default
  }
  return path.join(cwd, '.git');
}

/**
 * Top-level `harness doctor` entry. Parses flags, runs the probe, and returns
 * an exit code. The bin layer owns `process.exit`.
 *
 * Default (no `--repair`) is report-only and exits 0 (advisory). `--repair`
 * applies the fix and exits 0 on success / 1 on failure.
 *
 * @param {string[]} args - CLI arguments (after the `doctor` subcommand).
 * @param {object} [deps] - Injectable dependencies for testing.
 * @param {object} [deps.fs] - Filesystem module.
 * @param {(args: string[], opts?: object) => object} [deps.runGit] - git runner.
 * @param {(s: string) => void} [deps.stdout] - stdout sink.
 * @param {(s: string) => void} [deps.stderr] - stderr sink.
 * @returns {Promise<number>} Exit code.
 */
export async function doctor(args, deps = {}) {
  const fs = deps.fs || nodeFs;
  const runGit = deps.runGit || ((gitArgs, opts) => defaultRunGit(gitArgs, opts));
  const out = deps.stdout || ((s) => process.stdout.write(s + '\n'));
  const err = deps.stderr || ((s) => process.stderr.write(s + '\n'));

  let repair = false;
  let quiet = false;
  let cwd = deps.cwd ? path.resolve(deps.cwd) : process.cwd();

  const requireValue = (i, flagName) => {
    if (i + 1 >= args.length || args[i + 1].startsWith('-')) {
      err(`doctor: ${flagName} requires a value\n\n${USAGE}`);
      return null;
    }
    return args[i + 1];
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') {
      out(USAGE);
      return 0;
    } else if (a === '--repair') {
      repair = true;
    } else if (a === '--quiet') {
      quiet = true;
    } else if (a === '--cwd') {
      const v = requireValue(i, '--cwd');
      if (v === null) return 2;
      cwd = path.resolve(v);
      i++;
    } else if (a.startsWith('--cwd=')) {
      const v = a.slice('--cwd='.length);
      if (v === '') {
        err(`doctor: --cwd requires a value\n\n${USAGE}`);
        return 2;
      }
      cwd = path.resolve(v);
    } else {
      err(`doctor: unknown argument: ${a}\n\n${USAGE}`);
      return 2;
    }
  }

  const gitDir = resolveGitDir(cwd, runGit);

  let findings;
  try {
    findings = detectBrokenLooseRefs({ gitDir, fs });
  } catch (e) {
    err(`doctor: failed to scan loose refs: ${e.message}`);
    return 1;
  }

  if (findings.length === 0) {
    if (!quiet) out('doctor: no broken loose refs found.');
    return 0;
  }

  if (!repair) {
    // Report-only / advisory. Findings + recipe always go to stdout so the
    // user can see and copy them; the verb still exits 0 (safe to run anytime).
    out(`doctor: found ${findings.length} broken loose ref(s):`);
    for (const f of findings) {
      out(`  - ${f.refPath} (${f.reason})`);
    }
    out('');
    out(formatRepairRecipe(findings, { gitDir }));
    return 0;
  }

  // --repair: explicit, destructive path.
  let result;
  try {
    result = repairBrokenLooseRefs({ findings, gitDir, fs, runGit, cwd });
  } catch (e) {
    err(`doctor: repair failed: ${e.message}`);
    return 1;
  }

  if (!result.fetch || result.fetch.status !== 0) {
    const detail = ((result.fetch && (result.fetch.stderr || result.fetch.stdout)) || '').trim();
    err(`doctor: deleted ${result.deleted.length} ref(s) and stripped ${result.packedRefsStripped} packed-refs line(s), but \`git fetch origin --prune\` failed.`);
    if (detail) err(detail);
    return 1;
  }

  if (!quiet) {
    out(`doctor: repaired ${result.deleted.length} broken loose ref(s); stripped ${result.packedRefsStripped} packed-refs line(s); re-fetched origin.`);
  }
  return 0;
}
