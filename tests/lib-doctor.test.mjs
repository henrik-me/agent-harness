/**
 * tests/lib-doctor.test.mjs — unit tests for lib/doctor.mjs (CS64b C64b-1).
 *
 * Builds a synthetic `<tmp>/.git/refs/remotes/origin/...` fixture under
 * os.tmpdir() (LRN-094: never REPO_ROOT) containing a healthy ref plus
 * zero-byte / whitespace-only / NUL-only broken refs, and a packed-refs file
 * with a matching line. All git access is stubbed — no real git, no network.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

import {
  detectBrokenLooseRefs,
  formatRepairRecipe,
  repairBrokenLooseRefs,
  classifyRefBytes,
  doctor,
} from '../lib/doctor.mjs';

const HEALTHY_SHA = '2e7973c0123456789abcdef0123456789abcdef';

/**
 * Build a throwaway `<tmp>/.git` fixture. Returns { gitDir, root, cleanup }.
 */
function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-doctor-'));
  const gitDir = path.join(root, '.git');
  const originDir = path.join(gitDir, 'refs', 'remotes', 'origin');
  const nestedDir = path.join(originDir, 'cs62');
  fs.mkdirSync(nestedDir, { recursive: true });

  // Healthy ref: 40-hex SHA + trailing newline.
  fs.writeFileSync(path.join(originDir, 'main'), `${HEALTHY_SHA}\n`);
  // Healthy symref.
  fs.writeFileSync(path.join(originDir, 'HEAD'), 'ref: refs/remotes/origin/main\n');
  // Broken: zero-byte.
  fs.writeFileSync(path.join(originDir, 'zero'), Buffer.alloc(0));
  // Broken: whitespace-only.
  fs.writeFileSync(path.join(originDir, 'blank'), '   \n\t \n');
  // Broken: NUL-only (nested under cs62/close-out, mirroring LRN-151).
  fs.writeFileSync(path.join(nestedDir, 'close-out'), Buffer.from([0, 0, 0, 0]));

  // packed-refs with a matching line for the NUL-only broken ref + an
  // unrelated healthy line that must survive.
  const packed = [
    '# pack-refs with: peeled fully-peeled sorted',
    `${HEALTHY_SHA} refs/remotes/origin/main`,
    `1111111111111111111111111111111111111111 refs/remotes/origin/cs62/close-out`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(gitDir, 'packed-refs'), packed);

  return {
    gitDir,
    root,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

/** A stub runGit that records calls and returns a configurable status. */
function makeStubGit(status = 0) {
  const calls = [];
  const fn = (args) => {
    calls.push(args);
    return { status, stdout: '', stderr: status === 0 ? '' : 'boom' };
  };
  fn.calls = calls;
  return fn;
}

test('classifyRefBytes: healthy sha and symref classify as null', () => {
  assert.equal(classifyRefBytes(Buffer.from(`${HEALTHY_SHA}\n`)), null);
  assert.equal(classifyRefBytes(Buffer.from('ref: refs/remotes/origin/main\n')), null);
});

test('classifyRefBytes: zero / nul / whitespace classify as broken', () => {
  assert.equal(classifyRefBytes(Buffer.alloc(0)), 'zero-byte');
  assert.equal(classifyRefBytes(Buffer.from([0, 0, 0])), 'nul-only');
  assert.equal(classifyRefBytes(Buffer.from('  \n\t\r ')), 'whitespace-only');
  // Mixed whitespace + NUL (not all-NUL) → whitespace-only.
  assert.equal(classifyRefBytes(Buffer.from([0x20, 0x00, 0x0a])), 'whitespace-only');
});

test('detectBrokenLooseRefs: finds exactly the broken refs, not the healthy ones', () => {
  const fx = makeFixture();
  try {
    const findings = detectBrokenLooseRefs({ gitDir: fx.gitDir });
    const refPaths = findings.map((f) => f.refPath);
    assert.deepEqual(refPaths, [
      'refs/remotes/origin/blank',
      'refs/remotes/origin/cs62/close-out',
      'refs/remotes/origin/zero',
    ]);
    // Healthy refs are absent.
    assert.ok(!refPaths.includes('refs/remotes/origin/main'));
    assert.ok(!refPaths.includes('refs/remotes/origin/HEAD'));
    // Reasons are correct.
    const byPath = Object.fromEntries(findings.map((f) => [f.refPath, f.reason]));
    assert.equal(byPath['refs/remotes/origin/zero'], 'zero-byte');
    assert.equal(byPath['refs/remotes/origin/blank'], 'whitespace-only');
    assert.equal(byPath['refs/remotes/origin/cs62/close-out'], 'nul-only');
  } finally {
    fx.cleanup();
  }
});

test('detectBrokenLooseRefs: writes nothing (mtimes + dir listing unchanged)', () => {
  const fx = makeFixture();
  try {
    const before = fs.readdirSync(path.join(fx.gitDir, 'refs', 'remotes', 'origin')).sort();
    detectBrokenLooseRefs({ gitDir: fx.gitDir });
    const after = fs.readdirSync(path.join(fx.gitDir, 'refs', 'remotes', 'origin')).sort();
    assert.deepEqual(after, before);
    // The healthy ref content is untouched.
    assert.equal(
      fs.readFileSync(path.join(fx.gitDir, 'refs', 'remotes', 'origin', 'main'), 'utf8'),
      `${HEALTHY_SHA}\n`
    );
  } finally {
    fx.cleanup();
  }
});

test('detectBrokenLooseRefs: missing refs/remotes tree returns []', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-doctor-empty-'));
  try {
    fs.mkdirSync(path.join(root, '.git'), { recursive: true });
    const findings = detectBrokenLooseRefs({ gitDir: path.join(root, '.git') });
    assert.deepEqual(findings, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('detectBrokenLooseRefs: requires a gitDir string', () => {
  assert.throws(() => detectBrokenLooseRefs({ gitDir: null }), /gitDir/);
});

test('formatRepairRecipe: emits rm + packed-refs + git fetch origin --prune', () => {
  const fx = makeFixture();
  try {
    const findings = detectBrokenLooseRefs({ gitDir: fx.gitDir });
    const recipe = formatRepairRecipe(findings, { gitDir: fx.gitDir });
    assert.match(recipe, /^rm "/m);
    assert.match(recipe, /packed-refs/);
    assert.match(recipe, /git fetch origin --prune/);
    // One rm line per finding.
    const rmLines = recipe.split('\n').filter((l) => l.startsWith('rm "'));
    assert.equal(rmLines.length, findings.length);
    // The broken ref paths appear in the packed-refs instructions.
    assert.match(recipe, /refs\/remotes\/origin\/cs62\/close-out/);
  } finally {
    fx.cleanup();
  }
});

test('repairBrokenLooseRefs: deletes loose files, strips packed-refs, fetches', () => {
  const fx = makeFixture();
  try {
    const findings = detectBrokenLooseRefs({ gitDir: fx.gitDir });
    const git = makeStubGit(0);
    const result = repairBrokenLooseRefs({ findings, gitDir: fx.gitDir, runGit: git });

    // Broken loose files gone.
    for (const f of findings) {
      assert.equal(fs.existsSync(f.absPath), false, `${f.refPath} should be deleted`);
    }
    assert.equal(result.deleted.length, findings.length);

    // Healthy ref survives.
    assert.ok(fs.existsSync(path.join(fx.gitDir, 'refs', 'remotes', 'origin', 'main')));

    // packed-refs: the matching close-out line is stripped, the main line kept.
    const packed = fs.readFileSync(path.join(fx.gitDir, 'packed-refs'), 'utf8');
    assert.ok(!packed.includes('refs/remotes/origin/cs62/close-out'));
    assert.ok(packed.includes('refs/remotes/origin/main'));
    assert.equal(result.packedRefsStripped, 1);

    // git fetch origin --prune was invoked exactly once.
    assert.deepEqual(git.calls, [['fetch', 'origin', '--prune']]);
  } finally {
    fx.cleanup();
  }
});

test('repairBrokenLooseRefs: is idempotent (second run is a no-op, no throw)', () => {
  const fx = makeFixture();
  try {
    const findings = detectBrokenLooseRefs({ gitDir: fx.gitDir });
    const git1 = makeStubGit(0);
    repairBrokenLooseRefs({ findings, gitDir: fx.gitDir, runGit: git1 });

    // Re-run with the SAME (now stale) findings: files already gone, packed-refs
    // already stripped. Must not throw and must report zero deletions/strips.
    const git2 = makeStubGit(0);
    const result2 = repairBrokenLooseRefs({ findings, gitDir: fx.gitDir, runGit: git2 });
    assert.equal(result2.deleted.length, 0);
    assert.equal(result2.packedRefsStripped, 0);
    // fetch still runs (harmless no-op on a healthy repo).
    assert.deepEqual(git2.calls, [['fetch', 'origin', '--prune']]);

    // A fresh detect now finds nothing.
    assert.deepEqual(detectBrokenLooseRefs({ gitDir: fx.gitDir }), []);
  } finally {
    fx.cleanup();
  }
});

test('repairBrokenLooseRefs: requires a runGit function', () => {
  assert.throws(
    () => repairBrokenLooseRefs({ findings: [], gitDir: 'x', runGit: undefined }),
    /runGit/
  );
});

test('doctor: report-only default prints findings + recipe and exits 0', async () => {
  const fx = makeFixture();
  try {
    const out = [];
    const err = [];
    const git = makeStubGit(0);
    const code = await doctor(['--cwd', fx.root], {
      runGit: (args, opts) => {
        if (args[0] === 'rev-parse') return { status: 0, stdout: '.git\n', stderr: '' };
        return git(args, opts);
      },
      stdout: (s) => out.push(s),
      stderr: (s) => err.push(s),
    });
    assert.equal(code, 0);
    const text = out.join('\n');
    assert.match(text, /broken loose ref/);
    assert.match(text, /git fetch origin --prune/);
    // Report-only: fetch was NOT invoked.
    assert.equal(git.calls.length, 0);
    // Loose files still present (read-only).
    assert.ok(fs.existsSync(path.join(fx.gitDir, 'refs', 'remotes', 'origin', 'zero')));
  } finally {
    fx.cleanup();
  }
});

test('doctor: --repair applies the fix and exits 0', async () => {
  const fx = makeFixture();
  try {
    const out = [];
    const fetchCalls = [];
    const code = await doctor(['--cwd', fx.root, '--repair'], {
      runGit: (args) => {
        if (args[0] === 'rev-parse') return { status: 0, stdout: '.git\n', stderr: '' };
        fetchCalls.push(args);
        return { status: 0, stdout: '', stderr: '' };
      },
      stdout: (s) => out.push(s),
      stderr: () => {},
    });
    assert.equal(code, 0);
    assert.deepEqual(fetchCalls, [['fetch', 'origin', '--prune']]);
    assert.ok(!fs.existsSync(path.join(fx.gitDir, 'refs', 'remotes', 'origin', 'zero')));
    assert.match(out.join('\n'), /repaired/);
  } finally {
    fx.cleanup();
  }
});

test('doctor: --repair returns 1 when git fetch fails', async () => {
  const fx = makeFixture();
  try {
    const err = [];
    const code = await doctor(['--cwd', fx.root, '--repair'], {
      runGit: (args) => {
        if (args[0] === 'rev-parse') return { status: 0, stdout: '.git\n', stderr: '' };
        return { status: 1, stdout: '', stderr: 'fatal: could not fetch' };
      },
      stdout: () => {},
      stderr: (s) => err.push(s),
    });
    assert.equal(code, 1);
    assert.match(err.join('\n'), /fetch/);
  } finally {
    fx.cleanup();
  }
});

test('doctor: clean repo (no broken refs) exits 0; --quiet suppresses success stdout', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-doctor-clean-'));
  try {
    const originDir = path.join(root, '.git', 'refs', 'remotes', 'origin');
    fs.mkdirSync(originDir, { recursive: true });
    fs.writeFileSync(path.join(originDir, 'main'), `${HEALTHY_SHA}\n`);

    const out = [];
    const code = await doctor(['--cwd', root, '--quiet'], {
      runGit: (args) =>
        args[0] === 'rev-parse'
          ? { status: 0, stdout: '.git\n', stderr: '' }
          : { status: 0, stdout: '', stderr: '' },
      stdout: (s) => out.push(s),
      stderr: () => {},
    });
    assert.equal(code, 0);
    assert.equal(out.length, 0, 'quiet should suppress success stdout');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('doctor: --help prints usage to stdout and exits 0', async () => {
  const out = [];
  const code = await doctor(['--help'], { stdout: (s) => out.push(s), stderr: () => {} });
  assert.equal(code, 0);
  assert.match(out.join('\n'), /Usage:/);
});

test('doctor: --cwd without a value exits 2 (requireValue guard, LRN-040)', async () => {
  const err = [];
  const code = await doctor(['--cwd'], { stdout: () => {}, stderr: (s) => err.push(s) });
  assert.equal(code, 2);
  assert.match(err.join('\n'), /--cwd requires a value/);
});

test('doctor: --cwd followed by a flag is rejected (requireValue guard)', async () => {
  const err = [];
  const code = await doctor(['--cwd', '--repair'], { stdout: () => {}, stderr: (s) => err.push(s) });
  assert.equal(code, 2);
  assert.match(err.join('\n'), /--cwd requires a value/);
});

test('doctor: unknown argument exits 2 with usage', async () => {
  const err = [];
  const code = await doctor(['--bogus'], { stdout: () => {}, stderr: (s) => err.push(s) });
  assert.equal(code, 2);
  assert.match(err.join('\n'), /unknown argument/);
});
