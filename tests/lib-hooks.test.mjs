/**
 * tests/lib-hooks.test.mjs — unit tests for lib/hooks.mjs (CS100, issue #421).
 *
 * Two layers:
 *   - Installer tests exercise installPrepareCommitMsgHook() against throwaway
 *     `git init` repos: created / skipped / refused / replaced, the POSIX exec
 *     bit, and the fail-closed throw when the path is not a git repository.
 *   - Hook-BODY tests write PREPARE_COMMIT_MSG_HOOK to a temp file and run it
 *     via a POSIX `sh` (spawnSync), asserting the trailer is placed correctly
 *     (above a comment/scissors block, at EOF when no comment exists),
 *     idempotency (exact-line, case-sensitive), and comment-marker resolution
 *     (multi-char core.commentString + the `#`/auto fallback). Hook-body tests
 *     `t.skip('no POSIX sh')` cleanly when no sh with the required coreutils
 *     (awk/grep) is available, so a Windows-only run without git-for-windows'
 *     bundled sh does not spuriously fail.
 *
 * All scratch lives under os.tmpdir() (mkdtempSync), never REPO_ROOT (LRN-094:
 * REPO_ROOT writes race with check-text-encoding's recursive walk under
 * parallel `node --test`).
 *
 * Run: node --test tests/lib-hooks.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  statSync,
  rmSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  installPrepareCommitMsgHook,
  PREPARE_COMMIT_MSG_HOOK,
  HOOK_SENTINEL,
  COPILOT_TRAILER,
} from '../lib/hooks.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a throwaway git repo under os.tmpdir(). Returns its absolute path. */
function makeGitRepo() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'harness-hooks-'));
  const r = spawnSync('git', ['init', '-q', dir], { shell: false, encoding: 'utf8' });
  assert.equal(r.status, 0, `git init failed: ${r.error?.message ?? r.stderr}`);
  return dir;
}

/** Set a local git config key in `repo`. */
function gitConfig(repo, key, value) {
  const r = spawnSync('git', ['-C', repo, 'config', key, value], {
    shell: false,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, `git config ${key} failed: ${r.stderr}`);
}

function rm(dir) {
  rmSync(dir, { recursive: true, force: true });
}

/**
 * Resolve a POSIX `sh` whose PATH also resolves the coreutils the hook needs
 * (awk + grep). Returns the command to spawn, or null when none is available.
 * git-for-windows' `bin\sh.exe` wrapper sets up the MSYS PATH (so coreutils
 * resolve); its `usr\bin\sh.exe` does not, so we verify coreutils explicitly
 * rather than merely that some sh runs.
 */
function resolveSh() {
  const hasCoreutils = (cmd) => {
    const p = spawnSync(cmd, ['-c', 'command -v awk && command -v grep'], {
      shell: false,
      encoding: 'utf8',
    });
    return !p.error && p.status === 0 && p.stdout.trim().length > 0;
  };
  if (hasCoreutils('sh')) return 'sh';
  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files\\Git\\bin\\sh.exe',
      'C:\\Program Files (x86)\\Git\\bin\\sh.exe',
    ];
    for (const c of candidates) {
      if (existsSync(c) && hasCoreutils(c)) return c;
    }
  }
  return null;
}

const SH = resolveSh();

/**
 * Run the hook body against `msgContent` inside a fresh git repo (so the hook's
 * `git config` marker lookups resolve). Optional `config` sets git config keys
 * before running. Returns the resulting message-file content.
 */
function runHookBody(msgContent, config = {}) {
  const repo = makeGitRepo();
  try {
    for (const [k, v] of Object.entries(config)) gitConfig(repo, k, v);
    const hookFile = path.join(repo, 'hook.sh');
    writeFileSync(hookFile, PREPARE_COMMIT_MSG_HOOK.replace(/\r\n/g, '\n'));
    const msgFile = path.join(repo, 'COMMIT_EDITMSG');
    writeFileSync(msgFile, msgContent);
    const r = spawnSync(SH, [hookFile, msgFile], {
      cwd: repo,
      shell: false,
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, `hook exited ${r.status}: ${r.stderr}`);
    return readFileSync(msgFile, 'utf8');
  } finally {
    rm(repo);
  }
}

const hookLines = (s) => s.split('\n');
const SCISSORS = '# ------------------------ >8 ------------------------';

// ---------------------------------------------------------------------------
// Installer tests
// ---------------------------------------------------------------------------

test('installer: fresh install creates the hook file with sentinel + shebang', () => {
  const repo = makeGitRepo();
  try {
    const res = installPrepareCommitMsgHook(repo);
    assert.equal(res.action, 'created');
    assert.ok(res.path.endsWith('prepare-commit-msg'), 'path names the hook');
    assert.ok(existsSync(res.path), 'hook file exists on disk');
    const body = readFileSync(res.path, 'utf8');
    assert.ok(body.startsWith('#!/bin/sh\n'), 'shebang is the first line');
    assert.equal(hookLines(body)[1], HOOK_SENTINEL, 'sentinel is line 2');
    assert.ok(body.includes(COPILOT_TRAILER), 'hook embeds the canonical trailer');
    assert.ok(!body.includes('\r'), 'hook is written with LF endings only');
  } finally {
    rm(repo);
  }
});

test('installer: POSIX install sets an executable mode', { skip: process.platform === 'win32' ? 'not POSIX' : false }, () => {
  const repo = makeGitRepo();
  try {
    const res = installPrepareCommitMsgHook(repo);
    const mode = statSync(res.path).mode;
    assert.ok((mode & 0o111) !== 0, `expected an exec bit, got mode ${(mode & 0o777).toString(8)}`);
  } finally {
    rm(repo);
  }
});

test('installer: re-install over our sentinel hook is a no-op (skipped, unchanged)', () => {
  const repo = makeGitRepo();
  try {
    const first = installPrepareCommitMsgHook(repo);
    assert.equal(first.action, 'created');
    const before = readFileSync(first.path, 'utf8');
    const second = installPrepareCommitMsgHook(repo);
    assert.equal(second.action, 'skipped');
    assert.equal(second.path, first.path);
    assert.equal(readFileSync(second.path, 'utf8'), before, 'content is unchanged');
  } finally {
    rm(repo);
  }
});

test('installer: a foreign hook without --force is refused and preserved', () => {
  const repo = makeGitRepo();
  try {
    // Install once to guarantee the hooks dir exists, then plant a foreign hook.
    const seed = installPrepareCommitMsgHook(repo);
    const foreign = '#!/bin/sh\necho "someone else was here"\n';
    writeFileSync(seed.path, foreign);
    const res = installPrepareCommitMsgHook(repo);
    assert.equal(res.action, 'refused');
    assert.ok(typeof res.reason === 'string' && res.reason.length > 0, 'reason is present');
    assert.ok(/--force/.test(res.reason), 'reason suggests --force');
    assert.equal(readFileSync(res.path, 'utf8'), foreign, 'foreign hook is untouched');
  } finally {
    rm(repo);
  }
});

test('installer: a foreign hook that only mentions the sentinel as a substring is refused, not skipped', () => {
  const repo = makeGitRepo();
  try {
    const seed = installPrepareCommitMsgHook(repo);
    // The sentinel text appears, but NOT as an exact whole line — so this is a
    // foreign hook and must be refused (regression guard for substring vs
    // exact-line sentinel detection).
    const foreign = `#!/bin/sh\n# mentions ${HOOK_SENTINEL} inside a longer comment line\necho hi\n`;
    writeFileSync(seed.path, foreign);
    const res = installPrepareCommitMsgHook(repo);
    assert.equal(res.action, 'refused', 'substring-only sentinel is foreign → refused');
    assert.equal(readFileSync(res.path, 'utf8'), foreign, 'foreign hook untouched');
  } finally {
    rm(repo);
  }
});

test('installer: --force overwrites a foreign hook (replaced)', () => {
  const repo = makeGitRepo();
  try {
    const seed = installPrepareCommitMsgHook(repo);
    writeFileSync(seed.path, '#!/bin/sh\necho foreign\n');
    const res = installPrepareCommitMsgHook(repo, { force: true });
    assert.equal(res.action, 'replaced');
    const body = readFileSync(res.path, 'utf8');
    assert.ok(body.includes(HOOK_SENTINEL), 'sentinel present after force-replace');
    assert.ok(!body.includes('echo foreign'), 'foreign content gone');
  } finally {
    rm(repo);
  }
});

test('installer: --force over our own hook re-writes it (replaced)', () => {
  const repo = makeGitRepo();
  try {
    installPrepareCommitMsgHook(repo);
    const res = installPrepareCommitMsgHook(repo, { force: true });
    assert.equal(res.action, 'replaced');
    assert.ok(readFileSync(res.path, 'utf8').includes(HOOK_SENTINEL));
  } finally {
    rm(repo);
  }
});

test('installer: fail-closed — a non-git directory throws', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'harness-hooks-nogit-'));
  try {
    assert.throws(() => installPrepareCommitMsgHook(dir), /not a git repository|git/i);
  } finally {
    rm(dir);
  }
});

test('installer: fail-closed — a non-ENOENT read error (target is a directory) throws, no overwrite', () => {
  // Regression guard for the existsSync-gating safety hole: existsSync() also
  // returns false on EACCES/EISDIR, which would let a foreign hook be silently
  // overwritten. The installer reads the target directly and rethrows anything
  // that is not ENOENT. Plant a DIRECTORY at the hook path → readFileSync
  // throws EISDIR → the installer must throw rather than "create" over it.
  const repo = makeGitRepo();
  try {
    const seed = installPrepareCommitMsgHook(repo); // ensure hooks dir exists
    rmSync(seed.path); // remove our just-written hook file
    mkdirSync(seed.path); // put a directory where the hook file would go
    assert.throws(
      () => installPrepareCommitMsgHook(repo),
      /cannot read the existing hook|EISDIR/i
    );
  } finally {
    rm(repo);
  }
});

// ---------------------------------------------------------------------------
// Hook-body tests (require a POSIX sh with awk/grep)
// ---------------------------------------------------------------------------

test('hook body: inserts the trailer ABOVE a merge/# comment block', (t) => {
  if (!SH) return t.skip('no POSIX sh');
  const msg =
    "Merge branch 'feature' into main\n" +
    '\n' +
    '# Please enter a commit message to explain why this merge is necessary.\n' +
    "# Lines starting with '#' will be ignored.\n";
  const out = runHookBody(msg);
  const lines = hookLines(out);
  const ti = lines.indexOf(COPILOT_TRAILER);
  const ci = lines.findIndex((l) => l.startsWith('#'));
  assert.ok(ti >= 0, 'trailer present');
  assert.ok(ti < ci, `trailer (${ti}) must be above the first comment (${ci})`);
  assert.ok(lines[0].startsWith('Merge branch'), 'merge subject preserved');
});

test('hook body: inserts ABOVE a scissors line, not at EOF', (t) => {
  if (!SH) return t.skip('no POSIX sh');
  const msg =
    'My subject\n' +
    '\n' +
    'Body paragraph.\n' +
    `${SCISSORS}\n` +
    '# Do not modify or remove the line above.\n' +
    'diff --git a/x b/x\n';
  const out = runHookBody(msg, { 'core.commentChar': '#' });
  const lines = hookLines(out);
  const ti = lines.indexOf(COPILOT_TRAILER);
  const si = lines.findIndex((l) => l.startsWith('# ------------------------ >8'));
  assert.ok(ti >= 0, 'trailer present');
  assert.ok(ti < si, `trailer (${ti}) must be above the scissors line (${si})`);
});

test('hook body: no comment line → appends at EOF with a blank separator', (t) => {
  if (!SH) return t.skip('no POSIX sh');
  const out = runHookBody('Just a subject line\n');
  assert.equal(out, `Just a subject line\n\n${COPILOT_TRAILER}\n`);
});

test('hook body: idempotent on the exact trailer, but appends on wrong-case', (t) => {
  if (!SH) return t.skip('no POSIX sh');

  // (a) Exact canonical line already present → no change, no duplicate.
  const already = `Subject\n\n${COPILOT_TRAILER}\n# comment\n`;
  const outSame = runHookBody(already);
  assert.equal(outSame, already, 'file is unchanged when the exact line is present');
  const count = hookLines(outSame).filter((l) => l === COPILOT_TRAILER).length;
  assert.equal(count, 1, 'no duplicate trailer');

  // (b) Only a wrong-case variant present → the canonical line is still added.
  const wrongCase =
    'Subject\n\nco-authored-by: copilot <223556219+Copilot@users.noreply.github.com>\n# comment\n';
  const outWrong = runHookBody(wrongCase);
  assert.ok(
    hookLines(outWrong).includes(COPILOT_TRAILER),
    'canonical trailer appended despite a wrong-case variant'
  );
});

test('hook body: multi-character core.commentString (//) is honored', (t) => {
  if (!SH) return t.skip('no POSIX sh');
  const msg =
    'Subject line\n' +
    '\n' +
    '// Please enter the commit message for your changes.\n' +
    "// Lines starting with '//' will be ignored.\n";
  const out = runHookBody(msg, { 'core.commentString': '//' });
  const lines = hookLines(out);
  const ti = lines.indexOf(COPILOT_TRAILER);
  const ci = lines.findIndex((l) => l.startsWith('//'));
  assert.ok(ti >= 0, 'trailer present');
  assert.ok(ti < ci, `trailer (${ti}) must be above the // comment (${ci})`);
});

test("hook body: core.commentChar 'auto' falls back to '#'", (t) => {
  if (!SH) return t.skip('no POSIX sh');
  const msg = 'Subject\n\n# a comment line\n';
  const out = runHookBody(msg, { 'core.commentChar': 'auto' });
  const lines = hookLines(out);
  const ti = lines.indexOf(COPILOT_TRAILER);
  const ci = lines.findIndex((l) => l.startsWith('#'));
  assert.ok(ti >= 0, 'trailer present');
  assert.ok(ti < ci, `trailer (${ti}) must be above the # comment (${ci})`);
});
