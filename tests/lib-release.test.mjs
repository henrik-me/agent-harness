/**
 * tests/lib-release.test.mjs — unit tests for the CS67 `harness release` engine.
 *
 * node:test + node:assert only. All side-effecting seams (fs, git, gh, openIssue,
 * clock) are injected, so NO real git/gh/npm/network is touched. The few tests
 * that exercise the default fs seams write ONLY under a per-test `os.tmpdir()`
 * mkdtemp dir (LRN-094) and clean up afterward.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  ReleaseError,
  resolveTargetVersion,
  validateSemverBump,
  promoteChangelog,
  sweepReadmePins,
  prepareRelease,
  publishRelease,
  verifySquashSha,
  formatReleasePlan,
} from '../lib/release.mjs';

const EM_DASH = '\u2014';

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

const PKG = (v) => JSON.stringify({ name: '@henrik-me/agent-harness', version: v, private: true }, null, 2) + '\n';

const LOCK = (v) =>
  [
    '{',
    '  "name": "@henrik-me/agent-harness",',
    `  "version": "${v}",`,
    '  "lockfileVersion": 3,',
    '  "packages": {',
    '    "": {',
    '      "name": "@henrik-me/agent-harness",',
    `      "version": "${v}",`,
    '      "license": "MIT"',
    '    }',
    '  }',
    '}',
    '',
  ].join('\n');

const CHANGELOG = (prev, opts = {}) =>
  [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '### Added',
    '',
    opts.unreleasedAdded || '- Some change.',
    '',
    '### Changed',
    '',
    '### Documentation',
    '',
    '### Fixed',
    '',
    `## [${prev}] ${EM_DASH} 2026-01-01`,
    '',
    '### Added',
    '',
    '- Older change.',
    '',
    `[Unreleased]: https://github.com/henrik-me/agent-harness/compare/v${prev}...HEAD`,
    `[${prev}]: https://github.com/henrik-me/agent-harness/compare/v0.0.9...v${prev}`,
    '',
  ].join('\n');

const README = (prev) =>
  [
    '# agent-harness',
    '',
    `> **Status:** v${prev} shipped (2026-01-01) — narrative mentioning v${prev} in prose.`,
    '',
    'Install by ref `(e.g. v' + prev + ')` in prose here too.',
    '',
    '```bash',
    `npx -y github:henrik-me/agent-harness#v${prev} init`,
    `npx -y github:henrik-me/agent-harness#v${prev} sync`,
    `node agent-harness/bin/harness.mjs upgrade v${prev}   # preview only`,
    '```',
    '',
  ].join('\n');

/** A seam-backed in-memory fs. */
function memFs(files) {
  const store = new Map(Object.entries(files));
  return {
    store,
    readFile: (p) => {
      const key = normKey(p);
      if (!store.has(key)) {
        const err = new Error(`ENOENT: ${key}`);
        err.code = 'ENOENT';
        throw err;
      }
      return store.get(key);
    },
    writeFile: (p, c) => store.set(normKey(p), c),
  };
}
function normKey(p) {
  return path.basename(p); // fixtures are keyed by basename for simplicity.
}

/** A git seam driven by a path-of-args → result map (matched by argv.join(' ')). */
function gitSeam(routes) {
  return (args) => {
    const key = args.join(' ');
    for (const [pattern, res] of routes) {
      if (typeof pattern === 'string' ? key === pattern : pattern.test(key)) {
        return { status: 0, stdout: '', stderr: '', ...res };
      }
    }
    return { status: 1, stdout: '', stderr: `no route for: ${key}` };
  };
}

const FULL_SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);

// ---------------------------------------------------------------------------
// resolveTargetVersion.
// ---------------------------------------------------------------------------

test('resolveTargetVersion: explicit version returned as-is', () => {
  assert.equal(resolveTargetVersion({ version: '1.2.3', currentVersion: '1.2.2' }), '1.2.3');
});

test('resolveTargetVersion: bump major/minor/patch', () => {
  assert.equal(resolveTargetVersion({ bump: 'major', currentVersion: '0.8.0' }), '1.0.0');
  assert.equal(resolveTargetVersion({ bump: 'minor', currentVersion: '0.8.0' }), '0.9.0');
  assert.equal(resolveTargetVersion({ bump: 'patch', currentVersion: '0.8.0' }), '0.8.1');
});

test('resolveTargetVersion: both version and bump → error', () => {
  assert.throws(
    () => resolveTargetVersion({ version: '1.0.0', bump: 'minor', currentVersion: '0.8.0' }),
    (e) => e instanceof ReleaseError && e.code === 'ERELEASE_BAD_VERSION'
  );
});

test('resolveTargetVersion: neither version nor bump → error', () => {
  assert.throws(
    () => resolveTargetVersion({ currentVersion: '0.8.0' }),
    (e) => e instanceof ReleaseError && e.code === 'ERELEASE_BAD_VERSION'
  );
});

test('resolveTargetVersion: malformed version → error', () => {
  assert.throws(
    () => resolveTargetVersion({ version: '1.2', currentVersion: '0.8.0' }),
    (e) => e instanceof ReleaseError && e.code === 'ERELEASE_BAD_VERSION'
  );
});

test('resolveTargetVersion: invalid bump keyword → error', () => {
  assert.throws(
    () => resolveTargetVersion({ bump: 'huge', currentVersion: '0.8.0' }),
    (e) => e.code === 'ERELEASE_BAD_VERSION'
  );
});

// ---------------------------------------------------------------------------
// validateSemverBump (C67-2).
// ---------------------------------------------------------------------------

test('validateSemverBump: patch + [Unreleased] new subcommand → ERELEASE_SEMVER_INCONSISTENT', () => {
  const changelog = CHANGELOG('0.8.0', { unreleasedAdded: '- Adds a new CLI subcommand `harness release`.' });
  assert.throws(
    () => validateSemverBump({ currentVersion: '0.8.0', targetVersion: '0.8.1', changelogText: changelog }),
    (e) => e instanceof ReleaseError && e.code === 'ERELEASE_SEMVER_INCONSISTENT'
  );
});

test('validateSemverBump: patch + "new ... verb" signal → refused', () => {
  const changelog = CHANGELOG('0.8.0', { unreleasedAdded: '- Adds a new `release` verb to the CLI.' });
  assert.throws(
    () => validateSemverBump({ currentVersion: '0.8.0', targetVersion: '0.8.1', changelogText: changelog }),
    (e) => e.code === 'ERELEASE_SEMVER_INCONSISTENT'
  );
});

test('validateSemverBump: minor bump with new subcommand → allowed', () => {
  const changelog = CHANGELOG('0.8.0', { unreleasedAdded: '- Adds a new CLI subcommand `harness release`.' });
  assert.equal(validateSemverBump({ currentVersion: '0.8.0', targetVersion: '0.9.0', changelogText: changelog }), 'minor');
});

test('validateSemverBump: patch with only a bugfix → allowed', () => {
  const changelog = CHANGELOG('0.8.0', { unreleasedAdded: '- Fixes a typo.' });
  assert.equal(validateSemverBump({ currentVersion: '0.8.0', targetVersion: '0.8.1', changelogText: changelog }), 'patch');
});

test('validateSemverBump: non-increasing target → ERELEASE_BAD_VERSION', () => {
  assert.throws(
    () => validateSemverBump({ currentVersion: '0.8.0', targetVersion: '0.8.0', changelogText: CHANGELOG('0.8.0') }),
    (e) => e.code === 'ERELEASE_BAD_VERSION'
  );
  assert.throws(
    () => validateSemverBump({ currentVersion: '0.8.0', targetVersion: '0.7.0', changelogText: CHANGELOG('0.8.0') }),
    (e) => e.code === 'ERELEASE_BAD_VERSION'
  );
});

// ---------------------------------------------------------------------------
// promoteChangelog.
// ---------------------------------------------------------------------------

test('promoteChangelog: [Unreleased] → [x.y.z] — date with em-dash + fresh skeleton', () => {
  const out = promoteChangelog({
    changelogText: CHANGELOG('0.8.0'),
    version: '0.9.0',
    dateISO: '2026-06-30',
    prevVersion: '0.8.0',
    repoSlug: 'henrik-me/agent-harness',
  });
  // New version heading with em-dash (not hyphen).
  assert.match(out, new RegExp(`^## \\[0\\.9\\.0\\] ${EM_DASH} 2026-06-30$`, 'm'));
  assert.ok(!out.includes('## [0.9.0] - 2026-06-30'), 'must use em-dash, not hyphen');
  // Fresh Unreleased skeleton prepended above the promoted section.
  const idxUnrel = out.indexOf('## [Unreleased]');
  const idxVer = out.indexOf('## [0.9.0]');
  assert.ok(idxUnrel >= 0 && idxVer > idxUnrel, 'fresh [Unreleased] precedes the new version section');
  assert.match(out, /## \[Unreleased\]\n\n### Added\n\n### Changed\n\n### Documentation\n\n### Fixed\n/);
});

test('promoteChangelog: both link references correct', () => {
  const out = promoteChangelog({
    changelogText: CHANGELOG('0.8.0'),
    version: '0.9.0',
    dateISO: '2026-06-30',
    prevVersion: '0.8.0',
    repoSlug: 'henrik-me/agent-harness',
  });
  assert.match(out, /^\[Unreleased\]: https:\/\/github\.com\/henrik-me\/agent-harness\/compare\/v0\.9\.0\.\.\.HEAD$/m);
  assert.match(out, /^\[0\.9\.0\]: https:\/\/github\.com\/henrik-me\/agent-harness\/compare\/v0\.8\.0\.\.\.v0\.9\.0$/m);
  // The new version link sits directly beneath the Unreleased link.
  const unrelLine = out.split('\n').findIndex((l) => l.startsWith('[Unreleased]:'));
  assert.ok(out.split('\n')[unrelLine + 1].startsWith('[0.9.0]:'));
});

test('promoteChangelog: missing [Unreleased] header → ERELEASE_FILE', () => {
  assert.throws(
    () => promoteChangelog({ changelogText: '# Changelog\n\nnothing here\n', version: '0.9.0', dateISO: '2026-06-30', prevVersion: '0.8.0', repoSlug: 'a/b' }),
    (e) => e instanceof ReleaseError && e.code === 'ERELEASE_FILE'
  );
});

test('promoteChangelog: invalid date → ERELEASE_BAD_INPUT', () => {
  assert.throws(
    () => promoteChangelog({ changelogText: CHANGELOG('0.8.0'), version: '0.9.0', dateISO: '06/30/2026', prevVersion: '0.8.0', repoSlug: 'a/b' }),
    (e) => e.code === 'ERELEASE_BAD_INPUT'
  );
});

test('promoteChangelog: normalizes CRLF input', () => {
  const crlf = CHANGELOG('0.8.0').replace(/\n/g, '\r\n');
  const out = promoteChangelog({ changelogText: crlf, version: '0.9.0', dateISO: '2026-06-30', prevVersion: '0.8.0', repoSlug: 'henrik-me/agent-harness' });
  assert.ok(!out.includes('\r'), 'output must be LF-only');
});

// ---------------------------------------------------------------------------
// sweepReadmePins.
// ---------------------------------------------------------------------------

test('sweepReadmePins: install pins rewritten, prose flagged, narrative untouched', () => {
  const { readmeText, warnings } = sweepReadmePins({ readmeText: README('0.8.0'), prevVersion: '0.8.0', targetVersion: '0.9.0' });
  // Install pins rewritten.
  assert.match(readmeText, /github:henrik-me\/agent-harness#v0\.9\.0 init/);
  assert.match(readmeText, /github:henrik-me\/agent-harness#v0\.9\.0 sync/);
  // In-fence bare token rewritten.
  assert.match(readmeText, /harness\.mjs upgrade v0\.9\.0/);
  // Prose narrative lines left untouched and flagged.
  assert.match(readmeText, /v0\.8\.0 shipped/);
  assert.ok(warnings.some((w) => /README:3:/.test(w)), 'status narrative flagged');
  assert.ok(warnings.some((w) => /README:5:/.test(w)), 'prose mention flagged');
});

test('sweepReadmePins: no occurrences → no changes, no warnings', () => {
  const text = '# readme\n\nno versions here\n';
  const { readmeText, warnings } = sweepReadmePins({ readmeText: text, prevVersion: '0.8.0', targetVersion: '0.9.0' });
  assert.equal(readmeText, text);
  assert.equal(warnings.length, 0);
});

test('sweepReadmePins: does not touch a different version token', () => {
  const text = '```bash\nnpx foo#v0.7.0\n```\n';
  const { readmeText } = sweepReadmePins({ readmeText: text, prevVersion: '0.8.0', targetVersion: '0.9.0' });
  assert.equal(readmeText, text, 'v0.7.0 is not the prev version → untouched');
});

// ---------------------------------------------------------------------------
// prepareRelease (Phase A).
// ---------------------------------------------------------------------------

function phaseAFiles(curr = '0.8.0', clOpts = {}) {
  return {
    'package.json': PKG(curr),
    'package-lock.json': LOCK(curr),
    'CHANGELOG.md': CHANGELOG(curr, clOpts),
    'README.md': README(curr),
  };
}

test('prepareRelease: dry-run writes nothing and returns the plan', () => {
  const fsm = memFs(phaseAFiles());
  const plan = prepareRelease({
    version: '0.9.0',
    cwd: '/repo',
    apply: false,
    seams: { readFile: fsm.readFile, writeFile: fsm.writeFile, now: () => new Date('2026-06-30T00:00:00Z') },
  });
  assert.equal(plan.currentVersion, '0.8.0');
  assert.equal(plan.targetVersion, '0.9.0');
  assert.equal(plan.applied, false);
  // Nothing mutated in the store.
  assert.equal(fsm.store.get('package.json'), PKG('0.8.0'));
  assert.equal(fsm.store.get('CHANGELOG.md'), CHANGELOG('0.8.0'));
  // Plan enumerates all expected file edits.
  const paths = plan.changes.map((c) => c.path).sort();
  assert.deepEqual(paths, ['CHANGELOG.md', 'README.md', 'package-lock.json', 'package.json']);
});

test('prepareRelease: non-ENOENT lockfile read error is fatal (ERELEASE_FILE, Copilot R2)', () => {
  const fsm = memFs(phaseAFiles());
  const readFile = (p) => {
    if (String(p).replace(/\\/g, '/').endsWith('package-lock.json')) {
      const e = new Error('permission denied');
      e.code = 'EACCES';
      throw e;
    }
    return fsm.readFile(p);
  };
  assert.throws(
    () => prepareRelease({ version: '0.9.0', cwd: '/repo', seams: { readFile, writeFile: fsm.writeFile } }),
    (e) => e instanceof ReleaseError && e.code === 'ERELEASE_FILE'
  );
});

test('prepareRelease: explicit repoSlug (bin --repo) drives the new CHANGELOG compare links (Copilot R5)', () => {
  const fsm = memFs(phaseAFiles());
  const plan = prepareRelease({
    version: '0.9.0',
    cwd: '/repo',
    repoSlug: 'octo/widgets',
    seams: { readFile: fsm.readFile, writeFile: fsm.writeFile, now: () => new Date('2026-06-30T00:00:00Z') },
  });
  const cl = plan.changes.find((c) => c.path === 'CHANGELOG.md');
  assert.match(cl.newContent, /\[Unreleased\]: https:\/\/github\.com\/octo\/widgets\/compare\/v0\.9\.0\.\.\.HEAD/);
  assert.match(cl.newContent, /\[0\.9\.0\]: https:\/\/github\.com\/octo\/widgets\/compare\/v0\.8\.0\.\.\.v0\.9\.0/);
});

test('prepareRelease: fails closed when no repoSlug and CHANGELOG has no github link (Copilot R5)', () => {
  const noLinkChangelog = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '### Added',
    '',
    '- x',
    '',
    `## [0.8.0] ${EM_DASH} 2026-01-01`,
    '',
    '### Added',
    '',
    '- y',
    '',
  ].join('\n');
  const fsm = memFs({ ...phaseAFiles(), 'CHANGELOG.md': noLinkChangelog });
  assert.throws(
    () => prepareRelease({ version: '0.9.0', cwd: '/repo', seams: { readFile: fsm.readFile, writeFile: fsm.writeFile } }),
    (e) => e instanceof ReleaseError && e.code === 'ERELEASE_BAD_INPUT' && /slug/.test(e.message)
  );
});

test('prepareRelease: apply writes bumped package.json, lock, CHANGELOG, README', () => {
  const fsm = memFs(phaseAFiles());
  prepareRelease({
    version: '0.9.0',
    cwd: '/repo',
    apply: true,
    seams: { readFile: fsm.readFile, writeFile: fsm.writeFile, now: () => new Date('2026-06-30T00:00:00Z') },
  });
  assert.match(fsm.store.get('package.json'), /"version": "0\.9\.0"/);
  assert.match(fsm.store.get('package-lock.json'), /"version": "0\.9\.0"/);
  // Both root version entries bumped in the lock.
  assert.equal((fsm.store.get('package-lock.json').match(/"version": "0\.9\.0"/g) || []).length, 2);
  assert.match(fsm.store.get('CHANGELOG.md'), new RegExp(`## \\[0\\.9\\.0\\] ${EM_DASH} 2026-06-30`));
  assert.match(fsm.store.get('README.md'), /#v0\.9\.0 init/);
});

test('prepareRelease: bump=patch with new-subcommand CHANGELOG is refused', () => {
  const fsm = memFs(phaseAFiles('0.8.0', { unreleasedAdded: '- Adds a new CLI subcommand `harness release`.' }));
  assert.throws(
    () => prepareRelease({ bump: 'patch', cwd: '/repo', seams: { readFile: fsm.readFile, writeFile: fsm.writeFile } }),
    (e) => e.code === 'ERELEASE_SEMVER_INCONSISTENT'
  );
});

test('prepareRelease: uses an injected bumpVersionFiles seam (no default JSON edit)', () => {
  const fsm = memFs(phaseAFiles());
  let called = false;
  const plan = prepareRelease({
    version: '0.9.0',
    cwd: '/repo',
    apply: false,
    seams: {
      readFile: fsm.readFile,
      writeFile: fsm.writeFile,
      now: () => new Date('2026-06-30T00:00:00Z'),
      bumpVersionFiles: () => {
        called = true;
        return [{ path: 'package.json', action: 'updated', summary: 'stub', newContent: PKG('0.9.0') }];
      },
    },
  });
  assert.ok(called, 'injected bumpVersionFiles seam was used');
  assert.ok(plan.changes.some((c) => c.summary === 'stub'));
});

test('prepareRelease: missing package.json → ERELEASE_FILE', () => {
  const fsm = memFs({ 'CHANGELOG.md': CHANGELOG('0.8.0') });
  assert.throws(
    () => prepareRelease({ version: '0.9.0', cwd: '/repo', seams: { readFile: fsm.readFile, writeFile: fsm.writeFile } }),
    (e) => e.code === 'ERELEASE_FILE'
  );
});

test('prepareRelease: default fs seams operate only under a tmpdir (LRN-094)', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'release-phaseA-'));
  try {
    writeFileSync(path.join(dir, 'package.json'), PKG('0.8.0'));
    writeFileSync(path.join(dir, 'package-lock.json'), LOCK('0.8.0'));
    writeFileSync(path.join(dir, 'CHANGELOG.md'), CHANGELOG('0.8.0'));
    writeFileSync(path.join(dir, 'README.md'), README('0.8.0'));
    const plan = prepareRelease({ version: '0.9.0', cwd: dir, apply: true, seams: { now: () => new Date('2026-06-30T00:00:00Z') } });
    assert.equal(plan.targetVersion, '0.9.0');
    assert.match(readFileSync(path.join(dir, 'package.json'), 'utf8'), /"version": "0\.9\.0"/);
    assert.match(readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8'), new RegExp(`## \\[0\\.9\\.0\\] ${EM_DASH} 2026-06-30`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// formatReleasePlan.
// ---------------------------------------------------------------------------

test('formatReleasePlan: dry-run header + per-file lines + warnings', () => {
  const plan = {
    currentVersion: '0.8.0',
    targetVersion: '0.9.0',
    applied: false,
    changes: [{ path: 'package.json', action: 'updated', summary: 'version 0.8.0 -> 0.9.0' }],
    warnings: ['review manually: README:3: foo'],
  };
  const out = formatReleasePlan(plan);
  assert.match(out, /0\.8\.0 -> 0\.9\.0/);
  assert.match(out, /dry-run/);
  assert.match(out, /package\.json/);
  assert.match(out, /review manually: README:3/);
  assert.match(out, /--apply/);
});

test('formatReleasePlan: renders a unified diff for a change with old/new content (Exit-1 / PVI)', () => {
  const plan = {
    currentVersion: '0.8.0',
    targetVersion: '0.9.0',
    applied: false,
    changes: [
      {
        path: 'package.json',
        action: 'updated',
        summary: 'version 0.8.0 -> 0.9.0',
        oldContent: '{\n  "name": "x",\n  "version": "0.8.0"\n}\n',
        newContent: '{\n  "name": "x",\n  "version": "0.9.0"\n}\n',
      },
    ],
    warnings: [],
  };
  const out = formatReleasePlan(plan);
  assert.match(out, /--- a\/package\.json/);
  assert.match(out, /\+\+\+ b\/package\.json/);
  assert.match(out, /-\s+"version": "0\.8\.0"/);
  assert.match(out, /\+\s+"version": "0\.9\.0"/);
});

test('prepareRelease: dry-run output includes a unified diff of the changes (Exit-1 / PVI)', () => {
  const fsm = memFs(phaseAFiles());
  const plan = prepareRelease({
    version: '0.9.0',
    cwd: '/repo',
    seams: { readFile: fsm.readFile, writeFile: fsm.writeFile, now: () => new Date('2026-06-30T00:00:00Z') },
  });
  const out = formatReleasePlan(plan);
  assert.match(out, /--- a\/package\.json[\s\S]*\+\+\+ b\/package\.json/);
  assert.match(out, /-\s+"version": "0\.8\.0"/);
  assert.match(out, /\+\s+"version": "0\.9\.0"/);
  assert.match(out, /--- a\/CHANGELOG\.md/);
});

test('formatReleasePlan: unchanged old/new renders no diff body (no lone gap marker) (diff-fix)', () => {
  const same = 'x\ny\nz\n';
  const out = formatReleasePlan({
    currentVersion: '0.8.0',
    targetVersion: '0.9.0',
    applied: false,
    changes: [{ path: 'f', action: 'updated', summary: 's', oldContent: same, newContent: same }],
    warnings: [],
  });
  assert.ok(!out.includes(' …'), 'no lone gap marker when content is unchanged');
  assert.ok(!out.includes('--- a/f'), 'no diff header block when the diff body is empty');
});

test('formatReleasePlan: newline-terminated content diff has no phantom trailing blank line (diff-fix)', () => {
  const out = formatReleasePlan({
    currentVersion: '0.8.0',
    targetVersion: '0.9.0',
    applied: false,
    changes: [{ path: 'f', action: 'updated', summary: 's', oldContent: 'a\nb\n', newContent: 'a\nc\n' }],
    warnings: [],
  });
  assert.match(out, /-b/);
  assert.match(out, /\+c/);
  const body = out.split('\n').filter((l) => l.startsWith('    ') && !l.includes('---') && !l.includes('+++'));
  assert.ok(body.length > 0 && body.every((l) => l.trim().length > 0), 'no blank context line from the trailing-newline sentinel');
});

// ---------------------------------------------------------------------------
// verifySquashSha (R2).
// ---------------------------------------------------------------------------

test('verifySquashSha: sha == origin/main with matching files → true', () => {
  assert.equal(
    verifySquashSha({ sha: FULL_SHA, version: '0.9.0', originMainSha: FULL_SHA, pkgAtSha: PKG('0.9.0'), changelogAtSha: CHANGELOG('0.9.0') }),
    true
  );
});

test('verifySquashSha: arbitrary sha (not on main) → ERELEASE_SHA_UNVERIFIED', () => {
  assert.throws(
    () => verifySquashSha({ sha: FULL_SHA, version: '0.9.0', originMainSha: OTHER_SHA, pkgAtSha: PKG('0.9.0') }),
    (e) => e.code === 'ERELEASE_SHA_UNVERIFIED'
  );
});

test('verifySquashSha: branch-head sha rejected even if also on main fact', () => {
  assert.throws(
    () => verifySquashSha({ sha: FULL_SHA, version: '0.9.0', originMainSha: FULL_SHA, branchHeadSha: FULL_SHA }),
    (e) => e.code === 'ERELEASE_SHA_UNVERIFIED'
  );
});

test('verifySquashSha: files-at-sha carry the wrong version → ERELEASE_SHA_UNVERIFIED', () => {
  assert.throws(
    () => verifySquashSha({ sha: FULL_SHA, version: '0.9.0', originMainSha: FULL_SHA, pkgAtSha: PKG('0.8.0') }),
    (e) => e.code === 'ERELEASE_SHA_UNVERIFIED'
  );
});

test('verifySquashSha: changelog-at-sha missing version section → ERELEASE_SHA_UNVERIFIED', () => {
  assert.throws(
    () => verifySquashSha({ sha: FULL_SHA, version: '0.9.0', originMainSha: FULL_SHA, pkgAtSha: PKG('0.9.0'), changelogAtSha: CHANGELOG('0.8.0') }),
    (e) => e.code === 'ERELEASE_SHA_UNVERIFIED'
  );
});

test('verifySquashSha: non-40-hex sha → ERELEASE_BAD_REF', () => {
  assert.throws(
    () => verifySquashSha({ sha: 'main', version: '0.9.0', originMainSha: FULL_SHA }),
    (e) => e.code === 'ERELEASE_BAD_REF'
  );
});

test('verifySquashSha: accepts mergeCommitOid as the on-main fact', () => {
  assert.equal(
    verifySquashSha({ sha: FULL_SHA, version: '0.9.0', originMainSha: OTHER_SHA, mergeCommitOid: FULL_SHA }),
    true
  );
});

// ---------------------------------------------------------------------------
// publishRelease (Phase B).
// ---------------------------------------------------------------------------

function ghRecorder() {
  const calls = [];
  return {
    calls,
    runGh: (args) => {
      calls.push(args);
      // `release view` → not found (status 1) so creation proceeds; everything else ok.
      if (args[0] === 'release' && args[1] === 'view') return { status: 1, stdout: '', stderr: 'not found' };
      return { status: 0, stdout: '', stderr: '' };
    },
  };
}

function phaseBGit({ originMain = FULL_SHA, pkgVersion = '0.9.0', tagSha = null, localTagSha = null } = {}) {
  return gitSeam([
    ['fetch origin main', { status: 0 }],
    ['rev-parse origin/main', { stdout: originMain + '\n' }],
    [/^show .*:package\.json$/, { stdout: PKG(pkgVersion) }],
    [/^show .*:CHANGELOG\.md$/, { stdout: CHANGELOG(pkgVersion) }],
    [/^ls-remote --tags origin/, { stdout: tagSha ? `${tagSha}\trefs/tags/v0.9.0\n` : '' }],
    // Local-tag probe (`rev-parse -q --verify refs/tags/<tag>^{commit}`): absent
    // by default (fresh cut → status 1), present at `localTagSha` for the
    // resume-after-push-failure case.
    [/^rev-parse -q --verify refs\/tags\//, localTagSha ? { status: 0, stdout: localTagSha + '\n' } : { status: 1, stdout: '' }],
    [/^tag -a /, { status: 0 }],
    [/^push origin /, { status: 0 }],
  ]);
}

/** A recording git seam: routes like `phaseBGit()` but captures every argv. */
function gitRecorder(opts = {}) {
  const calls = [];
  const seam = phaseBGit(opts);
  return {
    calls,
    runGit: (args) => {
      calls.push(args);
      return seam(args);
    },
  };
}

test('publishRelease: apply creates an annotated tag + pushes it, then a release without --target, and notifies consumers', () => {
  const gh = ghRecorder();
  const git = gitRecorder();
  const issues = [];
  const result = publishRelease({
    version: '0.9.0',
    sha: FULL_SHA,
    cwd: '/repo',
    consumers: [{ repo: 'henrik-me/sub-invaders', title: 'bump', bodyFile: '/x/body.md' }],
    apply: true,
    seams: {
      runGit: git.runGit,
      runGh: gh.runGh,
      openIssue: (a) => {
        issues.push(a);
        return { url: 'https://github.com/henrik-me/sub-invaders/issues/1', created: true };
      },
    },
  });
  assert.equal(result.verified, true);
  assert.equal(result.tagCreated, true);
  assert.equal(result.releaseCreated, true);
  assert.equal(result.notified.length, 1);
  assert.equal(result.notified[0].repo, 'henrik-me/sub-invaders');
  // (i) annotated tag: git tag -a v0.9.0 <sha> -m "Release v0.9.0".
  const tagCall = git.calls.find((c) => c[0] === 'tag' && c[1] === '-a');
  assert.ok(tagCall, 'git tag -a was invoked');
  assert.deepEqual(tagCall, ['tag', '-a', 'v0.9.0', FULL_SHA, '-m', 'Release v0.9.0']);
  // (ii) git push origin v0.9.0.
  const pushCall = git.calls.find((c) => c[0] === 'push');
  assert.ok(pushCall, 'git push was invoked');
  assert.deepEqual(pushCall, ['push', 'origin', 'v0.9.0']);
  // (iii) gh release create v0.9.0 with NO --target and WITH --verify-tag.
  const createCall = gh.calls.find((c) => c[0] === 'release' && c[1] === 'create');
  assert.ok(createCall, 'gh release create was invoked');
  assert.deepEqual(createCall.slice(0, 3), ['release', 'create', 'v0.9.0']);
  assert.ok(!createCall.includes('--target'), 'release create no longer passes --target');
  assert.ok(createCall.includes('--verify-tag'), 'release create passes --verify-tag');
  // openIssue reused per consumer.
  assert.equal(issues.length, 1);
  assert.equal(issues[0].repo, 'henrik-me/sub-invaders');
});

test('publishRelease: fresh cut creates the annotated tag, then pushes it, then creates the release (in order)', () => {
  const gh = ghRecorder();
  const git = gitRecorder();
  const result = publishRelease({
    version: '0.9.0',
    sha: FULL_SHA,
    cwd: '/repo',
    apply: true,
    seams: { runGit: git.runGit, runGh: gh.runGh, openIssue: () => ({ url: 'x', created: true }) },
  });
  assert.equal(result.tagCreated, true);
  assert.equal(result.releaseCreated, true);
  const tagIdx = git.calls.findIndex((c) => c[0] === 'tag' && c[1] === '-a');
  const pushIdx = git.calls.findIndex((c) => c[0] === 'push' && c[1] === 'origin');
  assert.ok(tagIdx >= 0, 'git tag -a invoked on a fresh cut');
  assert.ok(pushIdx >= 0, 'git push origin invoked on a fresh cut');
  assert.ok(tagIdx < pushIdx, 'the annotated tag is created before it is pushed');
  assert.deepEqual(git.calls[tagIdx], ['tag', '-a', 'v0.9.0', FULL_SHA, '-m', 'Release v0.9.0']);
});

test('publishRelease: git push failure is fatal (ERELEASE_PUBLISH) and aborts before the release is created', () => {
  const gh = ghRecorder();
  const runGit = gitSeam([
    ['fetch origin main', { status: 0 }],
    ['rev-parse origin/main', { stdout: FULL_SHA + '\n' }],
    [/^show .*:package\.json$/, { stdout: PKG('0.9.0') }],
    [/^show .*:CHANGELOG\.md$/, { stdout: CHANGELOG('0.9.0') }],
    [/^ls-remote --tags origin/, { stdout: '' }],
    [/^rev-parse -q --verify refs\/tags\//, { status: 1, stdout: '' }],
    [/^tag -a /, { status: 0 }],
    [/^push origin /, { status: 1, stderr: 'fatal: unable to push origin' }],
  ]);
  assert.throws(
    () =>
      publishRelease({
        version: '0.9.0',
        sha: FULL_SHA,
        cwd: '/repo',
        apply: true,
        seams: { runGit, runGh: gh.runGh, openIssue: () => ({ url: 'x', created: true }) },
      }),
    (e) => e instanceof ReleaseError && e.code === 'ERELEASE_PUBLISH' && /push/.test(e.message)
  );
  assert.ok(!gh.calls.some((c) => c[0] === 'release' && c[1] === 'create'), 'no gh release create after a failed tag push');
});

test('publishRelease: local-tag probe non-1 git failure (e.g. 128) is fatal, not read as "no tag" (Copilot)', () => {
  const gh = ghRecorder();
  const runGit = gitSeam([
    ['fetch origin main', { status: 0 }],
    ['rev-parse origin/main', { stdout: FULL_SHA + '\n' }],
    [/^show .*:package\.json$/, { stdout: PKG('0.9.0') }],
    [/^show .*:CHANGELOG\.md$/, { stdout: CHANGELOG('0.9.0') }],
    [/^ls-remote --tags origin/, { stdout: '' }],
    // Local-tag probe fails with 128 (repo/cwd problem) — must NOT be read as "absent".
    [/^rev-parse -q --verify refs\/tags\//, { status: 128, stderr: 'fatal: not a git repository' }],
  ]);
  assert.throws(
    () =>
      publishRelease({
        version: '0.9.0',
        sha: FULL_SHA,
        cwd: '/repo',
        apply: true,
        seams: { runGit, runGh: gh.runGh, openIssue: () => ({ url: 'x', created: true }) },
      }),
    (e) => e instanceof ReleaseError && e.code === 'ERELEASE_PUBLISH' && /rev-parse for local tag/.test(e.message)
  );
  assert.ok(!gh.calls.some((c) => c[0] === 'release' && c[1] === 'create'), 'no release created after a fatal local-tag probe');
});

test('publishRelease: resume after a failed push — local tag at <sha>, remote absent — skips git tag -a, re-pushes, creates the release', () => {
  const gh = ghRecorder();
  const git = gitRecorder({ localTagSha: FULL_SHA }); // remote tag absent (tagSha:null) but local tag already at our sha
  const result = publishRelease({
    version: '0.9.0',
    sha: FULL_SHA,
    cwd: '/repo',
    apply: true,
    seams: { runGit: git.runGit, runGh: gh.runGh, openIssue: () => ({ url: 'x', created: true }) },
  });
  assert.equal(result.tagCreated, true, 'the tag is (re)published this run');
  assert.equal(result.releaseCreated, true);
  assert.ok(!git.calls.some((c) => c[0] === 'tag' && c[1] === '-a'), 'git tag -a is skipped when the local tag is already at <sha>');
  assert.ok(git.calls.some((c) => c[0] === 'push' && c[1] === 'origin'), 'git push origin is retried on resume');
});

test('publishRelease: local tag at a DIFFERENT sha (remote absent) → ERELEASE_TAG_EXISTS', () => {
  assert.throws(
    () =>
      publishRelease({
        version: '0.9.0',
        sha: FULL_SHA,
        cwd: '/repo',
        apply: true,
        seams: {
          runGit: phaseBGit({ localTagSha: OTHER_SHA }),
          runGh: ghRecorder().runGh,
          openIssue: () => ({ url: 'x', created: true }),
        },
      }),
    (e) => e instanceof ReleaseError && e.code === 'ERELEASE_TAG_EXISTS'
  );
});

test('publishRelease: fully done — remote tag at <sha> and release present — creates neither the tag nor the release', () => {
  const git = gitRecorder({ tagSha: FULL_SHA }); // remote tag already present at our sha
  const ghCalls = [];
  const runGh = (args) => {
    ghCalls.push(args);
    if (args[0] === 'release' && args[1] === 'view') return { status: 0, stdout: '{"tagName":"v0.9.0"}' };
    return { status: 0, stdout: '' };
  };
  const result = publishRelease({
    version: '0.9.0',
    sha: FULL_SHA,
    cwd: '/repo',
    apply: true,
    seams: { runGit: git.runGit, runGh, openIssue: () => ({ url: 'x', created: true }) },
  });
  assert.equal(result.tagCreated, false);
  assert.equal(result.releaseCreated, false);
  assert.ok(result.skipped.some((m) => /already exists/.test(m)), 'skip message present');
  assert.ok(!git.calls.some((c) => c[0] === 'tag' && c[1] === '-a'), 'no git tag -a when already fully done');
  assert.ok(!ghCalls.some((c) => c[0] === 'release' && c[1] === 'create'), 'no gh release create when already fully done');
});

test('publishRelease: draft by default appends --draft to gh release create', () => {
  const gh = ghRecorder();
  const result = publishRelease({
    version: '0.9.0',
    sha: FULL_SHA,
    cwd: '/repo',
    apply: true,
    seams: { runGit: phaseBGit(), runGh: gh.runGh, openIssue: () => ({ url: 'x', created: true }) },
  });
  assert.equal(result.draft, true);
  const createCall = gh.calls.find((c) => c[0] === 'release' && c[1] === 'create');
  assert.ok(createCall.includes('--draft'), 'default publish creates a draft release');
});

test('publishRelease: draft:false (--no-draft) publishes immediately (no --draft)', () => {
  const gh = ghRecorder();
  const result = publishRelease({
    version: '0.9.0',
    sha: FULL_SHA,
    cwd: '/repo',
    apply: true,
    draft: false,
    seams: { runGit: phaseBGit(), runGh: gh.runGh, openIssue: () => ({ url: 'x', created: true }) },
  });
  assert.equal(result.draft, false);
  const createCall = gh.calls.find((c) => c[0] === 'release' && c[1] === 'create');
  assert.ok(!createCall.includes('--draft'), '--no-draft publishes immediately');
});

test('publishRelease: missing CHANGELOG.md at SHA → ERELEASE_SHA_UNVERIFIED (fix 1)', () => {
  const runGit = gitSeam([
    ['fetch origin main', { status: 0 }],
    ['rev-parse origin/main', { stdout: FULL_SHA + '\n' }],
    [/^show .*:package\.json$/, { stdout: PKG('0.9.0') }],
    [/^show .*:CHANGELOG\.md$/, { status: 128, stderr: "fatal: path 'CHANGELOG.md' does not exist" }],
    [/^ls-remote --tags origin/, { stdout: '' }],
  ]);
  assert.throws(
    () =>
      publishRelease({
        version: '0.9.0',
        sha: FULL_SHA,
        cwd: '/repo',
        apply: true,
        seams: { runGit, runGh: ghRecorder().runGh, openIssue: () => ({ url: 'x', created: true }) },
      }),
    (e) => e instanceof ReleaseError && e.code === 'ERELEASE_SHA_UNVERIFIED' && /CHANGELOG\.md/.test(e.message)
  );
});

test('publishRelease: --repo threads --repo <owner/repo> into gh release view + create (fix 3)', () => {
  const gh = ghRecorder();
  publishRelease({
    version: '0.9.0',
    sha: FULL_SHA,
    cwd: '/repo',
    repo: 'octo/harness',
    apply: true,
    seams: { runGit: phaseBGit(), runGh: gh.runGh, openIssue: () => ({ url: 'x', created: true }) },
  });
  for (const verb of ['view', 'create']) {
    const call = gh.calls.find((c) => c[0] === 'release' && c[1] === verb);
    assert.ok(call, `gh release ${verb} was invoked`);
    const ri = call.indexOf('--repo');
    assert.ok(ri >= 0 && call[ri + 1] === 'octo/harness', `gh release ${verb} carries --repo octo/harness`);
  }
});

test('publishRelease: --pr strong-verifies sha == PR squash mergeCommit.oid even after origin/main moved (fix 4)', () => {
  const OTHER = 'b'.repeat(40); // origin/main advanced past the release commit
  const runGit = gitSeam([
    ['fetch origin main', { status: 0 }],
    ['rev-parse origin/main', { stdout: OTHER + '\n' }],
    [/^show .*:package\.json$/, { stdout: PKG('0.9.0') }],
    [/^show .*:CHANGELOG\.md$/, { stdout: CHANGELOG('0.9.0') }],
    [/^ls-remote --tags origin/, { stdout: '' }],
    [/^rev-parse -q --verify refs\/tags\//, { status: 1, stdout: '' }],
    [/^tag -a /, { status: 0 }],
    [/^push origin /, { status: 0 }],
  ]);
  const gh = {
    calls: [],
    runGh(args) {
      this.calls.push(args);
      if (args[0] === 'pr' && args[1] === 'view') {
        return { status: 0, stdout: JSON.stringify({ mergeCommit: { oid: FULL_SHA }, headRefOid: 'c'.repeat(40) }) };
      }
      if (args[0] === 'release' && args[1] === 'view') return { status: 1, stdout: '' };
      return { status: 0, stdout: '' };
    },
  };
  const result = publishRelease({
    version: '0.9.0',
    sha: FULL_SHA,
    cwd: '/repo',
    pr: 333,
    apply: true,
    seams: { runGit, runGh: (a) => gh.runGh(a), openIssue: () => ({ url: 'x', created: true }) },
  });
  assert.equal(result.verified, true);
  assert.equal(result.releaseCreated, true);
  assert.ok(gh.calls.some((c) => c[0] === 'pr' && c[1] === 'view'), 'gathered PR mergeCommit via gh pr view');
});

test('publishRelease: --pr rejects a sha that is neither origin/main nor the PR mergeCommit.oid (fix 4)', () => {
  const runGit = gitSeam([
    ['fetch origin main', { status: 0 }],
    ['rev-parse origin/main', { stdout: 'b'.repeat(40) + '\n' }],
    [/^show .*:package\.json$/, { stdout: PKG('0.9.0') }],
    [/^show .*:CHANGELOG\.md$/, { stdout: CHANGELOG('0.9.0') }],
    [/^ls-remote --tags origin/, { stdout: '' }],
  ]);
  const runGh = (args) =>
    args[0] === 'pr' && args[1] === 'view'
      ? { status: 0, stdout: JSON.stringify({ mergeCommit: { oid: 'd'.repeat(40) }, headRefOid: 'c'.repeat(40) }) }
      : { status: 0, stdout: '' };
  assert.throws(
    () =>
      publishRelease({
        version: '0.9.0',
        sha: FULL_SHA,
        cwd: '/repo',
        pr: 333,
        apply: true,
        seams: { runGit, runGh, openIssue: () => ({ url: 'x', created: true }) },
      }),
    (e) => e instanceof ReleaseError && e.code === 'ERELEASE_SHA_UNVERIFIED'
  );
});

test('publishRelease: --pr with an unmerged PR (no mergeCommit) → ERELEASE_SHA_UNVERIFIED (fix 4)', () => {
  const runGh = (args) =>
    args[0] === 'pr' && args[1] === 'view'
      ? { status: 0, stdout: JSON.stringify({ mergeCommit: null, headRefOid: 'c'.repeat(40) }) }
      : { status: 0, stdout: '' };
  assert.throws(
    () =>
      publishRelease({
        version: '0.9.0',
        sha: FULL_SHA,
        cwd: '/repo',
        pr: 333,
        apply: true,
        seams: { runGit: phaseBGit(), runGh, openIssue: () => ({ url: 'x', created: true }) },
      }),
    (e) => e instanceof ReleaseError && e.code === 'ERELEASE_SHA_UNVERIFIED' && /mergeCommit/.test(e.message)
  );
});

test('publishRelease: --pr rejects sha == current origin/main when it != PR mergeCommit.oid (R2 B1)', () => {
  // origin/main has advanced to `sha`, but the release PR's squash commit is elsewhere:
  // with --pr the mergeCommit.oid is authoritative, so this MUST be rejected.
  const runGit = gitSeam([
    ['fetch origin main', { status: 0 }],
    ['rev-parse origin/main', { stdout: FULL_SHA + '\n' }],
    [/^show .*:package\.json$/, { stdout: PKG('0.9.0') }],
    [/^show .*:CHANGELOG\.md$/, { stdout: CHANGELOG('0.9.0') }],
    [/^ls-remote --tags origin/, { stdout: '' }],
  ]);
  const runGh = (args) =>
    args[0] === 'pr' && args[1] === 'view'
      ? { status: 0, stdout: JSON.stringify({ mergeCommit: { oid: 'd'.repeat(40) }, headRefOid: 'c'.repeat(40) }) }
      : { status: 0, stdout: '' };
  assert.throws(
    () =>
      publishRelease({
        version: '0.9.0',
        sha: FULL_SHA,
        cwd: '/repo',
        pr: 333,
        apply: true,
        seams: { runGit, runGh, openIssue: () => ({ url: 'x', created: true }) },
      }),
    (e) => e instanceof ReleaseError && e.code === 'ERELEASE_SHA_UNVERIFIED'
  );
});

test('publishRelease: git fetch failure is fatal (R2 B2)', () => {
  const runGit = gitSeam([
    ['fetch origin main', { status: 128, stderr: 'fatal: unable to access origin' }],
    ['rev-parse origin/main', { stdout: FULL_SHA + '\n' }],
    [/^show .*:package\.json$/, { stdout: PKG('0.9.0') }],
    [/^show .*:CHANGELOG\.md$/, { stdout: CHANGELOG('0.9.0') }],
    [/^ls-remote --tags origin/, { stdout: '' }],
  ]);
  assert.throws(
    () =>
      publishRelease({
        version: '0.9.0',
        sha: FULL_SHA,
        cwd: '/repo',
        apply: true,
        seams: { runGit, runGh: ghRecorder().runGh, openIssue: () => ({ url: 'x', created: true }) },
      }),
    (e) => e instanceof ReleaseError && e.code === 'ERELEASE_SHA_UNVERIFIED' && /fetch/.test(e.message)
  );
});

test('publishRelease: --pr with null PR JSON throws ReleaseError, not TypeError (R2 NB1)', () => {
  const runGh = (args) =>
    args[0] === 'pr' && args[1] === 'view' ? { status: 0, stdout: 'null' } : { status: 0, stdout: '' };
  assert.throws(
    () =>
      publishRelease({
        version: '0.9.0',
        sha: FULL_SHA,
        cwd: '/repo',
        pr: 333,
        apply: true,
        seams: { runGit: phaseBGit(), runGh, openIssue: () => ({ url: 'x', created: true }) },
      }),
    (e) => e instanceof ReleaseError && e.code === 'ERELEASE_SHA_UNVERIFIED' && /shape/.test(e.message)
  );
});

test('publishRelease: git ls-remote failure is fatal, not treated as "no tag" (Copilot)', () => {
  const runGit = gitSeam([
    ['fetch origin main', { status: 0 }],
    ['rev-parse origin/main', { stdout: FULL_SHA + '\n' }],
    [/^show .*:package\.json$/, { stdout: PKG('0.9.0') }],
    [/^show .*:CHANGELOG\.md$/, { stdout: CHANGELOG('0.9.0') }],
    [/^ls-remote --tags origin/, { status: 128, stderr: 'fatal: unable to access origin' }],
  ]);
  assert.throws(
    () =>
      publishRelease({
        version: '0.9.0',
        sha: FULL_SHA,
        cwd: '/repo',
        apply: true,
        seams: { runGit, runGh: ghRecorder().runGh, openIssue: () => ({ url: 'x', created: true }) },
      }),
    (e) => e instanceof ReleaseError && e.code === 'ERELEASE_SHA_UNVERIFIED' && /ls-remote/.test(e.message)
  );
});

test('publishRelease: annotated-tag ls-remote (peeled ^{}) idempotency compares the commit SHA (Copilot R3)', () => {
  const TAG_OBJ = 'e'.repeat(40); // annotated tag OBJECT sha (differs from the commit)
  // Realistic git: the peeled `^{}` commit line is emitted ONLY when the query
  // explicitly requests the `^{}` pattern; a bare exact-refspec query returns
  // only the tag-OBJECT line. Two routes encode that, so this test regresses if
  // the code ever drops the peel pattern from its ls-remote query.
  const baseGit = gitSeam([
    ['fetch origin main', { status: 0 }],
    ['rev-parse origin/main', { stdout: FULL_SHA + '\n' }],
    [/^show .*:package\.json$/, { stdout: PKG('0.9.0') }],
    [/^show .*:CHANGELOG\.md$/, { stdout: CHANGELOG('0.9.0') }],
    [/^ls-remote --tags origin refs\/tags\/v0\.9\.0 refs\/tags\/v0\.9\.0\^\{\}$/, { stdout: `${TAG_OBJ}\trefs/tags/v0.9.0\n${FULL_SHA}\trefs/tags/v0.9.0^{}\n` }],
    [/^ls-remote --tags origin refs\/tags\/v0\.9\.0$/, { stdout: `${TAG_OBJ}\trefs/tags/v0.9.0\n` }],
  ]);
  const gitCalls = [];
  const runGit = (args) => { gitCalls.push(args); return baseGit(args); };
  const calls = [];
  const runGh = (args) => {
    calls.push(args);
    if (args[0] === 'release' && args[1] === 'view') return { status: 0, stdout: '{"tagName":"v0.9.0"}' };
    return { status: 0, stdout: '' };
  };
  const result = publishRelease({
    version: '0.9.0',
    sha: FULL_SHA,
    cwd: '/repo',
    apply: true,
    seams: { runGit, runGh, openIssue: () => ({ url: 'x', created: true }) },
  });
  // The ls-remote query MUST request the peeled ^{} ref so an annotated remote tag
  // is compared by its commit SHA, not the tag-object SHA (else false ERELEASE_TAG_EXISTS).
  const lsrCall = gitCalls.find((c) => c[0] === 'ls-remote');
  assert.ok(lsrCall && lsrCall.includes('refs/tags/v0.9.0^{}'), 'ls-remote requests the peeled ^{} ref');
  // The peeled commit == our sha → existing tag/release is the resumable case, not a conflict.
  assert.equal(result.releaseCreated, false, 'annotated tag peeled to our commit → idempotent skip, not ERELEASE_TAG_EXISTS');
  assert.ok(result.skipped.some((s) => /already exists/.test(s)));
  assert.ok(!calls.some((c) => c[0] === 'release' && c[1] === 'create'), 'no gh release create for the resumable case');
});

test('publishRelease: remote annotated tag at sha but release ABSENT → creates release, no re-tag (R7 resumable)', () => {
  const TAG_OBJ = 'e'.repeat(40);
  const baseGit = gitSeam([
    ['fetch origin main', { status: 0 }],
    ['rev-parse origin/main', { stdout: FULL_SHA + '\n' }],
    [/^show .*:package\.json$/, { stdout: PKG('0.9.0') }],
    [/^show .*:CHANGELOG\.md$/, { stdout: CHANGELOG('0.9.0') }],
    // remote annotated tag already at our commit (peeled ^{} line == FULL_SHA).
    [/^ls-remote --tags origin/, { stdout: `${TAG_OBJ}\trefs/tags/v0.9.0\n${FULL_SHA}\trefs/tags/v0.9.0^{}\n` }],
  ]);
  const gitCalls = [];
  const runGit = (args) => { gitCalls.push(args); return baseGit(args); };
  const gh = ghRecorder(); // release view → status 1 (release ABSENT) → create proceeds
  const result = publishRelease({
    version: '0.9.0',
    sha: FULL_SHA,
    cwd: '/repo',
    apply: true,
    seams: { runGit, runGh: gh.runGh, openIssue: () => ({ url: 'x', created: true }) },
  });
  assert.equal(result.tagCreated, false, 'remote tag already at sha → no git tag -a / push');
  assert.equal(result.releaseCreated, true, 'release created because it was absent');
  assert.ok(!gitCalls.some((c) => c[0] === 'tag'), 'no git tag -a when the remote tag already exists');
  assert.ok(!gitCalls.some((c) => c[0] === 'push'), 'no git push when the remote tag already exists');
  const createCall = gh.calls.find((c) => c[0] === 'release' && c[1] === 'create');
  assert.ok(createCall && createCall.includes('--verify-tag') && !createCall.includes('--target'), 'release create uses --verify-tag, not --target');
});

test('publishRelease: dry-run verifies but creates nothing', () => {
  const gh = ghRecorder();
  let opened = 0;
  const result = publishRelease({
    version: '0.9.0',
    sha: FULL_SHA,
    cwd: '/repo',
    consumers: [{ repo: 'henrik-me/sub-invaders', title: 'bump', bodyFile: '/x/body.md' }],
    apply: false,
    seams: { runGit: phaseBGit(), runGh: gh.runGh, openIssue: () => { opened++; return { url: 'x', created: true }; } },
  });
  assert.equal(result.verified, true);
  assert.equal(result.tagCreated, false);
  assert.equal(result.releaseCreated, false);
  assert.equal(result.notified.length, 0);
  assert.equal(opened, 0, 'no issue filed in dry-run');
  assert.ok(gh.calls.every((c) => !(c[0] === 'release' && c[1] === 'create')), 'no gh release create in dry-run');
  assert.deepEqual(result.planned.consumers, ['henrik-me/sub-invaders']);
});

test('publishRelease: idempotent — existing tag+release at sha skips creation, still notifies', () => {
  const calls = [];
  const runGh = (args) => {
    calls.push(args);
    if (args[0] === 'release' && args[1] === 'view') return { status: 0, stdout: '{"tagName":"v0.9.0"}' };
    return { status: 0, stdout: '' };
  };
  let opened = 0;
  const result = publishRelease({
    version: '0.9.0',
    sha: FULL_SHA,
    cwd: '/repo',
    consumers: [{ repo: 'henrik-me/sub-invaders', title: 'bump', bodyFile: '/x/body.md' }],
    apply: true,
    seams: {
      runGit: phaseBGit({ tagSha: FULL_SHA }),
      runGh,
      openIssue: () => { opened++; return { url: 'https://x/issues/2', created: false }; },
    },
  });
  assert.equal(result.tagCreated, false);
  assert.equal(result.releaseCreated, false);
  assert.ok(result.skipped.some((m) => /already exists/.test(m)));
  assert.equal(opened, 1, 'notifications retried even when release exists');
  assert.equal(result.notified.length, 1);
  assert.ok(!calls.some((c) => c[0] === 'release' && c[1] === 'create'), 'no re-create when release already exists');
});

test('publishRelease: existing tag at a DIFFERENT sha → ERELEASE_TAG_EXISTS', () => {
  assert.throws(
    () =>
      publishRelease({
        version: '0.9.0',
        sha: FULL_SHA,
        cwd: '/repo',
        apply: true,
        seams: { runGit: phaseBGit({ tagSha: OTHER_SHA }), runGh: ghRecorder().runGh, openIssue: () => ({ url: 'x', created: true }) },
      }),
    (e) => e.code === 'ERELEASE_TAG_EXISTS'
  );
});

test('publishRelease: sha not on main → ERELEASE_SHA_UNVERIFIED', () => {
  assert.throws(
    () =>
      publishRelease({
        version: '0.9.0',
        sha: FULL_SHA,
        cwd: '/repo',
        apply: true,
        seams: { runGit: phaseBGit({ originMain: OTHER_SHA }), runGh: ghRecorder().runGh, openIssue: () => ({ url: 'x', created: true }) },
      }),
    (e) => e.code === 'ERELEASE_SHA_UNVERIFIED'
  );
});

test('publishRelease: files-at-sha wrong version → ERELEASE_SHA_UNVERIFIED', () => {
  assert.throws(
    () =>
      publishRelease({
        version: '0.9.0',
        sha: FULL_SHA,
        cwd: '/repo',
        apply: true,
        seams: { runGit: phaseBGit({ pkgVersion: '0.8.0' }), runGh: ghRecorder().runGh, openIssue: () => ({ url: 'x', created: true }) },
      }),
    (e) => e.code === 'ERELEASE_SHA_UNVERIFIED'
  );
});

test('publishRelease: bad sha format → ERELEASE_BAD_REF', () => {
  assert.throws(
    () => publishRelease({ version: '0.9.0', sha: 'origin/main', cwd: '/repo', apply: true, seams: {} }),
    (e) => e.code === 'ERELEASE_BAD_REF'
  );
});

test('publishRelease: git show package.json fails (absent file) → ERELEASE_SHA_UNVERIFIED', () => {
  const git = gitSeam([
    ['fetch origin main', { status: 0 }],
    ['rev-parse origin/main', { stdout: FULL_SHA + '\n' }],
    [/^show .*:package\.json$/, { status: 128, stderr: 'path does not exist' }],
  ]);
  assert.throws(
    () => publishRelease({ version: '0.9.0', sha: FULL_SHA, cwd: '/repo', apply: true, seams: { runGit: git, runGh: ghRecorder().runGh, openIssue: () => ({ url: 'x', created: true }) } }),
    (e) => e.code === 'ERELEASE_SHA_UNVERIFIED'
  );
});

test('publishRelease: a failing consumer notification is collected, not fatal', () => {
  const result = publishRelease({
    version: '0.9.0',
    sha: FULL_SHA,
    cwd: '/repo',
    consumers: [
      { repo: 'henrik-me/sub-invaders', title: 'bump', bodyFile: '/x/body.md' },
      { repo: 'henrik-me/other', title: 'bump', bodyFile: '/x/body.md' },
    ],
    apply: true,
    seams: {
      runGit: phaseBGit(),
      runGh: ghRecorder().runGh,
      openIssue: (a) => {
        if (a.repo === 'henrik-me/other') throw new Error('gh boom');
        return { url: 'https://x/issues/1', created: true };
      },
    },
  });
  assert.equal(result.notified.length, 1);
  assert.ok(result.skipped.some((m) => /henrik-me\/other/.test(m)));
});

test('publishRelease: invalid version → ERELEASE_BAD_VERSION', () => {
  assert.throws(
    () => publishRelease({ version: 'v0.9', sha: FULL_SHA, cwd: '/repo', apply: true, seams: {} }),
    (e) => e.code === 'ERELEASE_BAD_VERSION'
  );
});
