/**
 * lib/release.mjs — mechanize the harness release cut (CS67, decisions C67-1..C67-6).
 *
 * Turns the hand-run release sequence documented in `OPERATIONS.md § Release
 * process` into a previewable, two-phase, **dry-run-first** operation:
 *
 *   Phase A (prepare, pre-merge)  — `prepareRelease`: resolve the target version,
 *     enforce SemVer consistency (C67-2), then compute + (optionally) write the
 *     three file edits — `package.json`/`package-lock.json` version bump,
 *     `CHANGELOG.md` `[Unreleased]` → `[x.y.z]` promotion, and the README install-pin
 *     sweep. Default is dry-run (nothing written); `apply:true` writes the files
 *     for the orchestrator to commit. NEVER commits/tags/pushes (C67-3).
 *
 *   Phase B (publish, post-merge) — `publishRelease`: verify `--sha` is the real
 *     squash-merge commit on `main` (R2 — refusing branch-head/arbitrary SHAs and
 *     files-at-SHA that do not carry the version), then create the tag + GitHub
 *     Release atomically via `gh release create v<x.y.z> --target <sha>` and file
 *     consumer notifications by reusing `openIssue` from `lib/cross-repo.mjs`
 *     (issue-only, Hard Rule § 6 / C67-4). Idempotent/resumable (R7): a pre-existing
 *     tag+release pointing at the intended sha+version is skipped and only the
 *     consumer notifications are retried.
 *
 * Design (C67-5): every side-effecting operation (fs reads/writes, git, gh,
 * issue-filing, clock) is an injectable seam with a real default, so the module
 * is unit-testable with NO network/git/gh/clock and NO writes outside the test's
 * own temp dir. `bin/harness.mjs` (orchestrator-owned) wires the CLI flags and
 * delegates to the exported functions here.
 *
 * Node 20+ stdlib only; zero runtime deps. Consumer-root-relative: every path is
 * resolved against the caller-supplied `cwd`, never `import.meta.url` / `process.cwd()`.
 *
 * @module lib/release.mjs
 */

import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { openIssue as defaultOpenIssue } from './cross-repo.mjs';

/** Strict x.y.z SemVer (no pre-release/build metadata — the harness uses plain triples). */
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

/** A full 40-char hex commit SHA (the only shape Phase B will tag). */
const FULL_SHA_RE = /^[0-9a-f]{40}$/;

/** Em-dash used in the CHANGELOG version heading — repo convention (U+2014, NOT a hyphen). */
const EM_DASH = '\u2014';

/**
 * Structured error with a stable `code` for callers to switch on. Mirrors
 * `UpgradeError` / `CrossRepoError`. Stable codes:
 *  - 'ERELEASE_BAD_INPUT'         — caller-side validation failure.
 *  - 'ERELEASE_BAD_VERSION'       — invalid/ambiguous version or non-increasing bump.
 *  - 'ERELEASE_SEMVER_INCONSISTENT' — patch bump while `[Unreleased]` advertises new CLI surface (C67-2).
 *  - 'ERELEASE_FILE'              — a required file is missing/unreadable/malformed.
 *  - 'ERELEASE_BAD_REF'           — `--sha` is not a 40-char hex commit SHA.
 *  - 'ERELEASE_SHA_UNVERIFIED'    — `--sha` is not the verified squash-merge commit (R2).
 *  - 'ERELEASE_TAG_EXISTS'        — tag already exists pointing at a different SHA.
 *  - 'ERELEASE_PUBLISH'           — a `gh` publish step failed.
 */
export class ReleaseError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ReleaseError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Text + JSON helpers (normalize in the read step per LRN-006/018/065).
// ---------------------------------------------------------------------------

/** Strip a leading BOM and normalize CRLF → LF. All comparisons normalize here. */
function normalizeText(s) {
  if (typeof s !== 'string') return s;
  let t = s;
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  return t.replace(/\r\n/g, '\n');
}

/** Read a file via the seam and normalize it (BOM + line endings) in one step. */
function readNormalized(readFile, p) {
  return normalizeText(readFile(p));
}

/** Fail-closed JSON parse (LRN-033): malformed input → typed error, never a silent default. */
function parseJson(raw, label) {
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new ReleaseError(`${label}: malformed JSON: ${e.message}`, 'ERELEASE_FILE');
  }
}

/** Escape a literal string for embedding in a RegExp. */
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Parse an x.y.z version, throwing a typed error on anything else. */
function parseSemver(v, code = 'ERELEASE_BAD_VERSION') {
  const m = SEMVER_RE.exec(v ?? '');
  if (!m) {
    throw new ReleaseError(`invalid version ${JSON.stringify(v)} (expected x.y.z)`, code);
  }
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

/** Classify current→target as 'major' | 'minor' | 'patch' | 'none' | 'downgrade'. */
function classifyBump(current, target) {
  const c = parseSemver(current);
  const t = parseSemver(target);
  if (t.major !== c.major) return t.major > c.major ? 'major' : 'downgrade';
  if (t.minor !== c.minor) return t.minor > c.minor ? 'minor' : 'downgrade';
  if (t.patch !== c.patch) return t.patch > c.patch ? 'patch' : 'downgrade';
  return 'none';
}

/** ISO date (YYYY-MM-DD) from a Date — used for the CHANGELOG version heading. */
function toISODate(date) {
  return new Date(date).toISOString().slice(0, 10);
}

/** Detect the repo owner/name slug from a CHANGELOG link reference, if present. */
function detectRepoSlug(text) {
  const m = /github\.com\/([^/\s]+\/[^/\s]+)\/(?:compare|releases)/.exec(text || '');
  return m ? m[1] : null;
}

/**
 * Extract the lines of a `## [<heading>]` section (header inclusive) up to — but
 * excluding — the next `## [` header. Returns '' when the section is absent.
 */
function extractSection(text, headerRe) {
  const lines = normalizeText(text).split('\n');
  const start = lines.findIndex((l) => headerRe.test(l));
  if (start === -1) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## \[/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

/** The `## [Unreleased]` section body (header inclusive). */
function extractUnreleasedSection(text) {
  return extractSection(text, /^## \[Unreleased\]/);
}

/** The `## [<version>]` release-notes section, trimmed (for `gh release --notes`). */
function extractChangelogSection(text, version) {
  const re = new RegExp(`^## \\[${escapeRegExp(version)}\\]`);
  return extractSection(text, re).trim();
}

// ---------------------------------------------------------------------------
// Seam resolution (all optional, real defaults).
// ---------------------------------------------------------------------------

/** Run a binary and normalize the result shape to `{status,stdout,stderr,error}`. */
function spawnRun(bin, args, cwd) {
  const res = spawnSync(bin, args, { encoding: 'utf8', cwd });
  return {
    status: typeof res.status === 'number' ? res.status : 1,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    error: res.error,
  };
}

/** Resolve a failed spawn result to a non-empty detail string. */
function failDetail(res) {
  const stderr = (res && res.stderr ? res.stderr : '').trim();
  if (stderr) return stderr;
  if (res && res.error && res.error.message) return res.error.message;
  return `exited with status ${res ? res.status : '?'}`;
}

/** Trimmed stdout of a successful run, else null. */
function okStdout(res) {
  return res && res.status === 0 ? (res.stdout || '').trim() : null;
}

/** Build the effective seam set, filling every gap with a real default.
 * Default git/gh runs execute in `cwd` (the target repo) so a
 * `harness --cwd <repo> release` operates on that repo, not the shell's cwd. */
function resolveSeams(seams = {}, cwd = undefined) {
  return {
    readFile: seams.readFile || ((p) => fs.readFileSync(p, 'utf8')),
    writeFile: seams.writeFile || ((p, c) => fs.writeFileSync(p, c)),
    runGit: seams.runGit || ((args) => spawnRun('git', args, cwd)),
    runGh: seams.runGh || ((args) => spawnRun('gh', args, cwd)),
    openIssue: seams.openIssue || defaultOpenIssue,
    now: seams.now || (() => new Date()),
    bumpVersionFiles: seams.bumpVersionFiles || defaultBumpVersionFiles,
  };
}

// ---------------------------------------------------------------------------
// Phase A — version resolution + SemVer consistency.
// ---------------------------------------------------------------------------

/**
 * Resolve the target version from exactly one of `version` (x.y.z) or
 * `bump` (major|minor|patch). Throws if both or neither are supplied (C67-2).
 *
 * @param {{version?:string, bump?:string, currentVersion:string}} args
 * @returns {string} the resolved x.y.z target version.
 */
export function resolveTargetVersion({ version, bump, currentVersion }) {
  const hasVersion = version != null && version !== '';
  const hasBump = bump != null && bump !== '';
  if (hasVersion && hasBump) {
    throw new ReleaseError('provide exactly one of version or bump, not both', 'ERELEASE_BAD_VERSION');
  }
  if (!hasVersion && !hasBump) {
    throw new ReleaseError('provide exactly one of version (x.y.z) or bump (major|minor|patch)', 'ERELEASE_BAD_VERSION');
  }
  if (hasVersion) {
    parseSemver(version);
    return version;
  }
  const cur = parseSemver(currentVersion);
  switch (bump) {
    case 'major':
      return `${cur.major + 1}.0.0`;
    case 'minor':
      return `${cur.major}.${cur.minor + 1}.0`;
    case 'patch':
      return `${cur.major}.${cur.minor}.${cur.patch + 1}`;
    default:
      throw new ReleaseError(`invalid bump ${JSON.stringify(bump)} (expected major|minor|patch)`, 'ERELEASE_BAD_VERSION');
  }
}

/** True when `[Unreleased]` prose advertises a new-CLI-surface (minor-or-greater) signal. */
function advertisesMinorSurface(unreleasedText) {
  const t = unreleasedText || '';
  return (
    /new CLI subcommand/i.test(t) ||
    /\bnew\b[^\n]{0,40}\bverbs?\b/i.test(t) ||
    /minor bump/i.test(t)
  );
}

/**
 * Validate that the resolved bump is consistent with SemVer doctrine (C67-2):
 * the target must strictly increase, and a **patch** bump is refused when
 * `CHANGELOG.md [Unreleased]` advertises a new CLI subcommand/verb (a minor-bump
 * trigger per `OPERATIONS.md § SemVer policy`).
 *
 * @param {{currentVersion:string, targetVersion:string, changelogText?:string}} args
 * @returns {'major'|'minor'|'patch'} the validated bump class.
 */
export function validateSemverBump({ currentVersion, targetVersion, changelogText }) {
  const cls = classifyBump(currentVersion, targetVersion);
  if (cls === 'downgrade') {
    throw new ReleaseError(`target version ${targetVersion} is not greater than current ${currentVersion}`, 'ERELEASE_BAD_VERSION');
  }
  if (cls === 'none') {
    throw new ReleaseError(`target version ${targetVersion} equals current ${currentVersion}`, 'ERELEASE_BAD_VERSION');
  }
  if (cls === 'patch' && advertisesMinorSurface(extractUnreleasedSection(changelogText || ''))) {
    throw new ReleaseError(
      `refusing patch bump ${currentVersion} -> ${targetVersion}: CHANGELOG [Unreleased] advertises a new ` +
        `CLI subcommand/verb, which requires a minor bump per OPERATIONS.md § SemVer policy`,
      'ERELEASE_SEMVER_INCONSISTENT'
    );
  }
  return cls;
}

// ---------------------------------------------------------------------------
// Phase A — file edits.
// ---------------------------------------------------------------------------

/** Targeted version replace in package.json text (preserves all other formatting). */
function bumpPkgVersion(raw, currentVersion, targetVersion, label) {
  const re = new RegExp(`("version":\\s*")${escapeRegExp(currentVersion)}(")`);
  if (!re.test(raw)) {
    throw new ReleaseError(`${label}: could not find "version": "${currentVersion}"`, 'ERELEASE_FILE');
  }
  return raw.replace(re, `$1${targetVersion}$2`);
}

/**
 * Targeted version replace of the two root entries in package-lock.json: the
 * top-level `version` (2-space indent) and `packages[""].version` (6-space
 * indent). Indentation-anchored so a dependency that happens to share the
 * version is never rewritten. At least one root entry must match.
 */
function bumpLockVersion(raw, currentVersion, targetVersion) {
  const esc = escapeRegExp(currentVersion);
  let out = raw;
  let matched = 0;
  const top = new RegExp(`^(  "version":\\s*")${esc}(")`, 'm');
  if (top.test(out)) {
    out = out.replace(top, `$1${targetVersion}$2`);
    matched++;
  }
  const root = new RegExp(`^(      "version":\\s*")${esc}(")`, 'm');
  if (root.test(out)) {
    out = out.replace(root, `$1${targetVersion}$2`);
    matched++;
  }
  if (matched === 0) {
    throw new ReleaseError(`package-lock.json: could not find root "version": "${currentVersion}"`, 'ERELEASE_FILE');
  }
  return out;
}

/**
 * Default version-bump seam (C67-1 step a). Computes the new `package.json` +
 * `package-lock.json` content via targeted, indentation-anchored string edits
 * (deterministic and dependency-free — the same two root fields `npm version
 * --no-git-tag-version` touches) and, when `apply`, writes them through the
 * fs seam. Returns the change descriptors for the plan.
 *
 * @returns {Array<{path:string, action:string, summary:string, newContent:string}>}
 */
function defaultBumpVersionFiles({ cwd, currentVersion, targetVersion, apply, readFile, writeFile }) {
  const changes = [];
  const pkgPath = path.join(cwd, 'package.json');
  const pkgRaw = readNormalized(readFile, pkgPath);
  const pkgNew = bumpPkgVersion(pkgRaw, currentVersion, targetVersion, 'package.json');
  changes.push({
    path: 'package.json',
    action: 'updated',
    summary: `version ${currentVersion} -> ${targetVersion}`,
    newContent: pkgNew,
  });

  const lockPath = path.join(cwd, 'package-lock.json');
  let lockRaw = null;
  try {
    lockRaw = readNormalized(readFile, lockPath);
  } catch (e) {
    // Only a genuinely-absent lockfile means "bump package.json alone"; a
    // permission/IO error must not silently skip the lock bump (LRN: discriminate
    // ENOENT, never gate on a bare catch).
    if (e && e.code === 'ENOENT') {
      lockRaw = null;
    } else {
      throw new ReleaseError(`cannot read package-lock.json: ${e && e.message}`, 'ERELEASE_FILE');
    }
  }
  let lockNew = null;
  if (lockRaw != null) {
    lockNew = bumpLockVersion(lockRaw, currentVersion, targetVersion);
    changes.push({
      path: 'package-lock.json',
      action: 'updated',
      summary: `version ${currentVersion} -> ${targetVersion}`,
      newContent: lockNew,
    });
  }

  if (apply) {
    writeFile(pkgPath, pkgNew);
    if (lockNew != null) writeFile(lockPath, lockNew);
  }
  return changes;
}

/**
 * Promote `CHANGELOG.md` `[Unreleased]` → `[<version>] — <date>` and prepend a
 * fresh `[Unreleased]` skeleton, updating the link references. Pure
 * (string-in/string-out). Output matches repo convention byte-for-byte (em-dash
 * `\u2014` in the version heading; `[Unreleased]` link ref updated; new
 * `[<version>]` compare link added directly beneath it).
 *
 * @param {{changelogText:string, version:string, dateISO:string, prevVersion:string, repoSlug:string}} args
 * @returns {string} the promoted CHANGELOG text.
 */
export function promoteChangelog({ changelogText, version, dateISO, prevVersion, repoSlug }) {
  parseSemver(version);
  parseSemver(prevVersion);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO || '')) {
    throw new ReleaseError(`invalid dateISO ${JSON.stringify(dateISO)} (expected YYYY-MM-DD)`, 'ERELEASE_BAD_INPUT');
  }
  if (!repoSlug || !/^[^/\s]+\/[^/\s]+$/.test(repoSlug)) {
    throw new ReleaseError(`invalid repoSlug ${JSON.stringify(repoSlug)} (expected owner/name)`, 'ERELEASE_BAD_INPUT');
  }

  const text = normalizeText(changelogText);
  const headerRe = /^## \[Unreleased\][^\n]*$/m;
  if (!headerRe.test(text)) {
    throw new ReleaseError('CHANGELOG.md has no "## [Unreleased]" section header', 'ERELEASE_FILE');
  }

  const skeleton = [
    '## [Unreleased]',
    '',
    '### Added',
    '',
    '### Changed',
    '',
    '### Documentation',
    '',
    '### Fixed',
    '',
    `## [${version}] ${EM_DASH} ${dateISO}`,
  ].join('\n');

  // Function replacers avoid `$` being interpreted in the replacement string.
  let out = text.replace(headerRe, () => skeleton);

  const unreleasedLinkRe = /^\[Unreleased\]:[^\n]*$/m;
  if (!unreleasedLinkRe.test(out)) {
    throw new ReleaseError('CHANGELOG.md has no "[Unreleased]:" link reference', 'ERELEASE_FILE');
  }
  const newUnreleasedLink = `[Unreleased]: https://github.com/${repoSlug}/compare/v${version}...HEAD`;
  const newVersionLink = `[${version}]: https://github.com/${repoSlug}/compare/v${prevVersion}...v${version}`;
  out = out.replace(unreleasedLinkRe, () => `${newUnreleasedLink}\n${newVersionLink}`);

  return out;
}

/**
 * Sweep README install/version pins from `v<prev>` → `v<target>`, conservatively
 * (C67-1 step c). Unambiguous install pins (`#v<prev>`, anywhere) and `v<prev>`
 * tokens inside fenced code blocks are rewritten; every OTHER `v<prev>` (prose /
 * historical narrative) is LEFT untouched and reported in `warnings` for human
 * review of the dry-run diff.
 *
 * @param {{readmeText:string, prevVersion:string, targetVersion:string}} args
 * @returns {{readmeText:string, warnings:string[]}}
 */
export function sweepReadmePins({ readmeText, prevVersion, targetVersion }) {
  parseSemver(prevVersion);
  parseSemver(targetVersion);
  const text = normalizeText(readmeText);
  const lines = text.split('\n');
  const escPrev = escapeRegExp(prevVersion);
  const pinRe = new RegExp(`#v${escPrev}(?![\\d.])`, 'g');
  const pinTarget = `#v${targetVersion}`;
  const tokenRe = new RegExp(`v${escPrev}(?![\\d.])`, 'g');
  const warnings = [];
  let inFence = false;

  const swept = lines.map((line, idx) => {
    const lineNo = idx + 1;
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      return line;
    }

    // 1) Unambiguous install pins `#v<prev>` → `#v<target>` (safe in prose or code).
    let newLine = line.replace(pinRe, pinTarget);

    // 2) Remaining bare `v<prev>` tokens not part of a `#v` pin.
    let hasBareToken = false;
    tokenRe.lastIndex = 0;
    let m;
    while ((m = tokenRe.exec(newLine)) !== null) {
      if (m.index > 0 && newLine[m.index - 1] === '#') continue;
      hasBareToken = true;
      break;
    }
    if (!hasBareToken) return newLine;

    if (inFence) {
      // Inside a fenced code / install block — safe to rewrite.
      newLine = newLine.replace(tokenRe, (match, offset, str) =>
        offset > 0 && str[offset - 1] === '#' ? match : `v${targetVersion}`
      );
      return newLine;
    }

    // Prose: conservative — flag for manual review, do NOT rewrite.
    warnings.push(`review manually: README:${lineNo}: ${line.trim().slice(0, 100)}`);
    return newLine;
  });

  return { readmeText: swept.join('\n'), warnings };
}

/**
 * Phase A — prepare a release. Resolves the target version, enforces SemVer
 * consistency, and computes the file edits (version bump + CHANGELOG promotion +
 * README pin sweep). Dry-run by default (nothing written); `apply:true` writes
 * the files. NEVER commits/tags/pushes.
 *
 * @param {{version?:string, bump?:string, cwd:string, apply?:boolean, seams?:object}} args
 * @returns {{currentVersion:string, targetVersion:string, changes:Array, warnings:string[], applied:boolean}}
 */
export function prepareRelease({ version, bump, cwd, apply = false, repoSlug = null, seams = {} }) {
  if (!cwd || typeof cwd !== 'string') {
    throw new ReleaseError('cwd is required', 'ERELEASE_BAD_INPUT');
  }
  const s = resolveSeams(seams, cwd);

  const pkgPath = path.join(cwd, 'package.json');
  let pkgRaw;
  try {
    pkgRaw = readNormalized(s.readFile, pkgPath);
  } catch (e) {
    throw new ReleaseError(`cannot read package.json at ${pkgPath}: ${e.message}`, 'ERELEASE_FILE');
  }
  const pkg = parseJson(pkgRaw, 'package.json');
  const currentVersion = pkg.version;
  if (!currentVersion) {
    throw new ReleaseError('package.json has no "version" field', 'ERELEASE_FILE');
  }

  const targetVersion = resolveTargetVersion({ version, bump, currentVersion });

  const changelogPath = path.join(cwd, 'CHANGELOG.md');
  let changelogText;
  try {
    changelogText = readNormalized(s.readFile, changelogPath);
  } catch (e) {
    throw new ReleaseError(`cannot read CHANGELOG.md at ${changelogPath}: ${e.message}`, 'ERELEASE_FILE');
  }

  validateSemverBump({ currentVersion, targetVersion, changelogText });

  const changes = [];
  const warnings = [];

  // (a) version files (package.json + package-lock.json).
  const versionChanges = s.bumpVersionFiles({
    cwd,
    currentVersion,
    targetVersion,
    apply,
    readFile: s.readFile,
    writeFile: s.writeFile,
    runGit: s.runGit,
  });
  for (const c of versionChanges) changes.push(c);

  // (b) CHANGELOG promotion.
  const prevVersion = currentVersion;
  // Never guess the slug: use the caller-supplied one (bin `--repo`) or derive it
  // from an existing CHANGELOG compare/releases link; fail closed otherwise so a
  // fork/consumer never gets the harness's own slug baked into its compare links.
  const slug = repoSlug || detectRepoSlug(changelogText);
  if (!slug) {
    throw new ReleaseError(
      'cannot determine the GitHub owner/name slug for CHANGELOG compare links: CHANGELOG.md has no ' +
        'github.com/<owner>/<repo>/(compare|releases) link to derive it from. Pass --repo <owner/repo> ' +
        '(or add a compare link to CHANGELOG.md).',
      'ERELEASE_BAD_INPUT'
    );
  }
  const dateISO = toISODate(s.now());
  const newChangelog = promoteChangelog({ changelogText, version: targetVersion, dateISO, prevVersion, repoSlug: slug });
  changes.push({
    path: 'CHANGELOG.md',
    action: 'updated',
    summary: `promote [Unreleased] -> [${targetVersion}] ${EM_DASH} ${dateISO}`,
    newContent: newChangelog,
  });

  // (c) README pin sweep (best-effort — absence is a warning, not a failure).
  const readmePath = path.join(cwd, 'README.md');
  let readmeChange = null;
  let readmeText = null;
  try {
    readmeText = readNormalized(s.readFile, readmePath);
  } catch (e) {
    warnings.push(`README.md not read (${e.message}); skipped pin sweep`);
  }
  if (readmeText != null) {
    const swept = sweepReadmePins({ readmeText, prevVersion, targetVersion });
    for (const w of swept.warnings) warnings.push(w);
    if (swept.readmeText !== readmeText) {
      readmeChange = {
        path: 'README.md',
        action: 'updated',
        summary: `sweep install pins v${prevVersion} -> v${targetVersion}`,
        newContent: swept.readmeText,
      };
      changes.push(readmeChange);
    }
  }

  if (apply) {
    // Version files were already written by bumpVersionFiles; write the rest.
    s.writeFile(changelogPath, newChangelog);
    if (readmeChange) s.writeFile(readmePath, readmeChange.newContent);
  }

  return { currentVersion, targetVersion, changes, warnings, applied: !!apply };
}

/**
 * Render a Phase A plan as human-readable text (stdout-only; no side effects).
 * Mirrors `formatUpgradePlan`.
 *
 * @param {ReturnType<typeof prepareRelease>} plan
 * @returns {string}
 */
export function formatReleasePlan(plan) {
  const lines = [];
  const verb = plan.applied ? 'prepared (files written)' : 'preview (dry-run — nothing written)';
  lines.push(`harness release: ${plan.currentVersion} -> ${plan.targetVersion} — ${verb}`);
  if (!plan.changes || plan.changes.length === 0) {
    lines.push('  No file changes computed.');
  } else {
    for (const c of plan.changes) {
      lines.push(`  ${String(c.action).padEnd(8)} ${c.path}${c.summary ? ` — ${c.summary}` : ''}`);
    }
  }
  if (plan.warnings && plan.warnings.length > 0) {
    lines.push(`  Warnings (${plan.warnings.length}):`);
    for (const w of plan.warnings) lines.push(`    ! ${w}`);
  }
  if (!plan.applied) {
    lines.push('  To apply: re-run with --apply (writes files; does NOT commit/tag/push).');
  } else {
    lines.push('  Files written. Commit + open the content PR (the verb does NOT commit/tag/push).');
  }
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Phase B — publish (tag + release + consumer notifications).
// ---------------------------------------------------------------------------

/**
 * Verify a candidate `--sha` is the squash-merge commit on `main` (R2). Pure:
 * all facts are passed in as strings (the caller gathers them via git/gh seams),
 * so this is directly unit-testable. Throws `ReleaseError` on any failure.
 *
 * @param {object} args
 * @param {string} args.sha            - the candidate 40-char hex SHA.
 * @param {string} args.version        - the x.y.z release version.
 * @param {string|null} [args.originMainSha]  - current `origin/main` HEAD.
 * @param {string|null} [args.mergeCommitOid] - the merged release PR's mergeCommit.oid (optional cross-check).
 * @param {string|null} [args.branchHeadSha]  - the PR branch HEAD (must NOT equal sha).
 * @param {string|null} [args.pkgAtSha]       - `git show <sha>:package.json` content (version must match).
 * @param {string|null} [args.changelogAtSha] - `git show <sha>:CHANGELOG.md` content (must carry the version).
 * @returns {true}
 */
export function verifySquashSha({
  sha,
  version,
  originMainSha = null,
  mergeCommitOid = null,
  branchHeadSha = null,
  pkgAtSha = null,
  changelogAtSha = null,
}) {
  if (typeof sha !== 'string' || !FULL_SHA_RE.test(sha)) {
    throw new ReleaseError(`invalid sha ${JSON.stringify(sha)} (expected a 40-char hex commit SHA)`, 'ERELEASE_BAD_REF');
  }
  parseSemver(version);

  // When a PR mergeCommit.oid is known (--pr), it is authoritative: `sha` MUST
  // equal it — a later origin/main that still carries the version must NOT pass.
  // Only without a mergeCommit do we fall back to "sha is current origin/main".
  const onMain = mergeCommitOid ? sha === mergeCommitOid : Boolean(originMainSha && sha === originMainSha);
  if (!onMain) {
    throw new ReleaseError(
      `sha ${sha} is not the squash-merge commit on main ` +
        `(origin/main=${originMainSha ?? 'unknown'}${mergeCommitOid ? `, mergeCommit=${mergeCommitOid}` : ''})`,
      'ERELEASE_SHA_UNVERIFIED'
    );
  }
  if (branchHeadSha && sha === branchHeadSha) {
    throw new ReleaseError(`sha ${sha} is the PR branch head, not the squash-merge commit`, 'ERELEASE_SHA_UNVERIFIED');
  }

  if (pkgAtSha != null) {
    let v;
    try {
      v = JSON.parse(normalizeText(pkgAtSha)).version;
    } catch {
      throw new ReleaseError(`package.json at ${sha} is not valid JSON`, 'ERELEASE_SHA_UNVERIFIED');
    }
    if (v !== version) {
      throw new ReleaseError(`package.json at ${sha} has version ${JSON.stringify(v)}, expected ${version}`, 'ERELEASE_SHA_UNVERIFIED');
    }
  }
  if (changelogAtSha != null) {
    const re = new RegExp(`^## \\[${escapeRegExp(version)}\\]`, 'm');
    if (!re.test(normalizeText(changelogAtSha))) {
      throw new ReleaseError(`CHANGELOG.md at ${sha} has no "## [${version}]" section`, 'ERELEASE_SHA_UNVERIFIED');
    }
  }
  return true;
}

/**
 * Parse the commit SHA a tag resolves to from `git ls-remote --tags` stdout, or
 * null. Prefers the peeled `^{}` line (the commit an annotated tag points at) and
 * falls back to the first/only line for a lightweight tag.
 */
function parseLsRemoteSha(stdout) {
  const lines = (stdout || '')
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  // Annotated tags (the release process uses `git tag -a`) yield BOTH
  // `<tag-object> refs/tags/<t>` and `<commit> refs/tags/<t>^{}`. Prefer the
  // peeled `^{}` line — the commit the tag resolves to — so the idempotency
  // check compares commit-to-commit; fall back to the sole line for a
  // lightweight tag.
  const chosen = lines.find((l) => /\^\{\}$/.test(l)) || lines[0];
  const m = /^([0-9a-f]{40})\b/.exec(chosen);
  return m ? m[1] : null;
}

/**
 * Phase B — publish a release. Verifies `--sha` is the squash-merge commit on
 * `main`, then (when `apply`) creates the tag + GitHub Release atomically via
 * `gh release create v<version> --target <sha>` and files consumer notifications
 * via `openIssue` (issue-only, Hard Rule § 6). Idempotent/resumable (R7): a
 * pre-existing tag+release pointing at the intended sha+version is skipped and
 * only the consumer notifications are retried. A tag pointing at a DIFFERENT sha
 * is a hard error (`ERELEASE_TAG_EXISTS`).
 *
 * `draft` (default true) creates a DRAFT release for a human to review then
 * publish (`gh release edit <tag> --draft=false`), matching the LRN-121 flow;
 * pass `draft:false` (bin `--no-draft`) to publish immediately — G-publish is
 * the human gate either way.
 *
 * `consumers` is an array of `{repo, title, bodyFile, labels?}` — the SOURCE of
 * that list (config/flag) is intentionally left to the caller (open question;
 * see report).
 *
 * Verification: without `pr`, `sha` must equal the CURRENT `origin/main` HEAD
 * (a stale/arbitrary SHA fails). When `pr` (a release-PR number) is supplied,
 * `sha` must equal that PR's squash `mergeCommit.oid` and must NOT be its
 * branch head — the strong "is the squash-merge commit" check (C67 R2). Either
 * way `package.json` + `CHANGELOG.md` at `sha` must already carry the version.
 * `repo` (owner/repo), when set, targets that repo for all `gh` calls.
 *
 * @param {{version:string, sha:string, cwd?:string, repo?:string, pr?:number|string, consumers?:Array, apply?:boolean, draft?:boolean, seams?:object}} args
 * @returns {{verified:boolean, tagCreated:boolean, releaseCreated:boolean, draft:boolean, notified:Array, skipped:Array, planned?:object}}
 */
export function publishRelease({ version, sha, cwd, repo, pr = null, consumers = [], apply = false, draft = true, seams = {} }) {
  parseSemver(version);
  if (typeof sha !== 'string' || !FULL_SHA_RE.test(sha)) {
    throw new ReleaseError(`invalid sha ${JSON.stringify(sha)} (expected a 40-char hex commit SHA)`, 'ERELEASE_BAD_REF');
  }
  if (!Array.isArray(consumers)) {
    throw new ReleaseError('consumers must be an array of {repo,title,bodyFile,labels?}', 'ERELEASE_BAD_INPUT');
  }
  const s = resolveSeams(seams, cwd);
  const tag = `v${version}`;
  const repoArgs = repo ? ['--repo', repo] : [];

  // Refresh remote-tracking refs so verification runs against CURRENT origin/main
  // (the default-path guarantee). A failed fetch means the local origin/main can't
  // be trusted, so it is fatal rather than silently verifying against a stale ref.
  const fetchRes = s.runGit(['fetch', 'origin', 'main']);
  if (fetchRes.status !== 0) {
    throw new ReleaseError(
      `git fetch origin main failed; cannot verify against current origin/main: ${failDetail(fetchRes)}`,
      'ERELEASE_SHA_UNVERIFIED'
    );
  }
  const originMainSha = okStdout(s.runGit(['rev-parse', 'origin/main']));

  // Strong check: when a release PR number is supplied, verify `sha` is that
  // PR's squash mergeCommit.oid and reject its branch head (C67 R2).
  let mergeCommitOid = null;
  let branchHeadSha = null;
  if (pr != null) {
    const prView = s.runGh(['pr', 'view', String(pr), '--json', 'mergeCommit,headRefOid', ...repoArgs]);
    if (prView.status !== 0) {
      throw new ReleaseError(`cannot read PR #${pr} (gh pr view failed): ${failDetail(prView)}`, 'ERELEASE_SHA_UNVERIFIED');
    }
    let parsed;
    try {
      parsed = JSON.parse(prView.stdout);
    } catch {
      throw new ReleaseError(`gh pr view #${pr} returned non-JSON output`, 'ERELEASE_SHA_UNVERIFIED');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ReleaseError(`gh pr view #${pr} returned an unexpected JSON shape`, 'ERELEASE_SHA_UNVERIFIED');
    }
    mergeCommitOid = parsed.mergeCommit && parsed.mergeCommit.oid ? parsed.mergeCommit.oid : null;
    branchHeadSha = parsed.headRefOid || null;
    if (!mergeCommitOid) {
      throw new ReleaseError(`PR #${pr} has no mergeCommit — is it merged?`, 'ERELEASE_SHA_UNVERIFIED');
    }
  }

  const pkgRes = s.runGit(['show', `${sha}:package.json`]);
  if (pkgRes.status !== 0) {
    throw new ReleaseError(`cannot read package.json at ${sha} (git show failed): ${failDetail(pkgRes)}`, 'ERELEASE_SHA_UNVERIFIED');
  }
  const pkgAtSha = pkgRes.stdout;
  const clRes = s.runGit(['show', `${sha}:CHANGELOG.md`]);
  if (clRes.status !== 0) {
    throw new ReleaseError(`cannot read CHANGELOG.md at ${sha} (git show failed): ${failDetail(clRes)}`, 'ERELEASE_SHA_UNVERIFIED');
  }
  const changelogAtSha = clRes.stdout;

  verifySquashSha({ sha, version, originMainSha, mergeCommitOid, branchHeadSha, pkgAtSha, changelogAtSha });

  // Tag idempotency (R7): a tag pointing elsewhere is a conflict; one pointing
  // at our sha is the resumable case.
  const lsr = s.runGit(['ls-remote', '--tags', 'origin', `refs/tags/${tag}`]);
  if (lsr.status !== 0) {
    throw new ReleaseError(
      `git ls-remote for ${tag} failed; cannot determine tag state: ${failDetail(lsr)}`,
      'ERELEASE_SHA_UNVERIFIED'
    );
  }
  const existingTagSha = parseLsRemoteSha(lsr.stdout);
  let tagPointsAtSha = false;
  if (existingTagSha) {
    if (existingTagSha === sha) {
      tagPointsAtSha = true;
    } else {
      throw new ReleaseError(`tag ${tag} already exists at ${existingTagSha}, not the requested ${sha}`, 'ERELEASE_TAG_EXISTS');
    }
  }

  const notes = extractChangelogSection(changelogAtSha || '', version);
  const result = { verified: true, tagCreated: false, releaseCreated: false, draft, notified: [], skipped: [] };

  if (!apply) {
    // Dry-run: verification only. Report what would happen; mutate nothing.
    result.skipped.push('dry-run: no tag/release/issues created');
    result.planned = {
      tag,
      sha,
      draft,
      tagExists: !!existingTagSha,
      consumers: consumers.map((c) => c.repo),
    };
    return result;
  }

  // Create tag + release atomically (gh release create makes both), idempotently.
  const relView = s.runGh(['release', 'view', tag, '--json', 'tagName', ...repoArgs]);
  const releaseExists = relView.status === 0;
  if (tagPointsAtSha && releaseExists) {
    result.skipped.push(`release ${tag} already exists at ${sha}; skipping creation`);
  } else {
    const createArgs = ['release', 'create', tag, '--target', sha, '--title', tag, '--notes', notes, ...repoArgs];
    if (draft) createArgs.push('--draft');
    const cr = s.runGh(createArgs);
    if (cr.status !== 0) {
      throw new ReleaseError(`gh release create ${tag} failed: ${failDetail(cr)}`, 'ERELEASE_PUBLISH');
    }
    // When the tag was absent, gh created it alongside the release.
    result.tagCreated = !tagPointsAtSha;
    result.releaseCreated = true;
  }

  // Consumer notifications (retryable per R7 — a failure of one does not abort
  // the rest, and re-running re-tries only the unfiled issues).
  for (const c of consumers) {
    try {
      const r = s.openIssue({ repo: c.repo, title: c.title, bodyFile: c.bodyFile, labels: c.labels || [] });
      result.notified.push({ repo: c.repo, url: r.url, created: r.created });
    } catch (err) {
      result.skipped.push(`consumer ${c.repo}: notification failed (${err.message})`);
    }
  }

  return result;
}
