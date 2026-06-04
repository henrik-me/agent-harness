/**
 * tests/cs47-detached-head-bisect.test.mjs — CS47 detached-HEAD bisection guard.
 *
 * Background (LRN-124): three working-tree-loss incidents in a single CS46
 * session, plus two live reproductions during CS47 plan-filing, all sharing one
 * signature — after a `harness` subcommand exited, the working repo's HEAD was
 * found detached at the most-recent release tag (`v0.5.1`) and dirty tracked
 * edits had silently reverted. The offending subcommand was never bisected.
 *
 * This test is the bisection + permanent regression guard required by CS47
 * decisions C47-1, C47-2 and acceptance bar C47-4:
 *
 *   - It enumerates EVERY subcommand from the LIVE dispatch registry
 *     (`COMMAND_REGISTRY`, exported from bin/harness.mjs) rather than a
 *     hard-coded list (C47-1, PRR-1). A registry key that is neither exercised
 *     nor explicitly allow-listed fails the suite — so a future subcommand
 *     cannot silently escape coverage.
 *   - For each exercised subcommand it runs the real code path (NOT `--help`,
 *     which would short-circuit before any git op) in BOTH a self-host clone
 *     (REPO_ROOT === cwd, the LRN-124 environment) and a fresh consumer scratch
 *     repo (the downstream-consumer regression watchdog) per C47-2.
 *   - After each run it asserts, regardless of exit code (C47-4(d) + PRR-3/PRR-4):
 *       (a) HEAD is still attached to the original branch (`git symbolic-ref HEAD`);
 *       (b) the branch ref followed HEAD (`rev-parse HEAD == rev-parse <branch>`);
 *       (c) the dirty TRACKED sentinel file's content is unchanged;
 *       (d) the sentinel's `git status --porcelain` entry is unchanged;
 *       (e) GIT_TRACE recorded NO HEAD/worktree-mutating git verb
 *           (checkout/switch/reset/restore/worktree/stash/clean) — the
 *           argv-level dynamic evidence that no subcommand performs the
 *           LRN-124 detach.
 *
 * Outcome at authoring time (CS47): the static audit found NO HEAD-moving git
 * verb anywhere in lib/bin/scripts — not in current code, not at the v0.5.1 tag,
 * not in any commit in history (`git log -G` over all such verbs). This dynamic
 * suite corroborates that: every exercised subcommand leaves HEAD + sentinel
 * intact in both modes and emits no mutating git verb. The LRN-124 detach was
 * therefore NOT caused by the harness CLI source; it is environmental (see the
 * LRN-124 addendum). This suite stands as the guard that fails loudly the day a
 * contributor adds a bare `git checkout <ref>` (or sibling) to any subcommand.
 *
 * Scratch repos live under os.tmpdir() (never REPO_ROOT) per LRN-094.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  symlinkSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { COMMAND_REGISTRY } from '../bin/harness.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_BIN = path.join(REPO_ROOT, 'bin', 'harness.mjs');

const SENTINEL = 'sentinel.txt';
const SENTINEL_CLEAN = 'v1\n';
const SENTINEL_DIRTY = 'v2-dirty\n';

// git verbs that move HEAD or destroy the working tree — the LRN-124 vector.
const MUTATING_VERB_RE =
  /\bgit\s+['"]?(checkout|switch|reset|restore|worktree|stash|clean)\b/;

// A minimal clickstop plan file so `plan-review-hash <file>` reaches its real
// (pure) code path instead of dying on a missing-file argument.
const PLAN_FIXTURE =
  '# Scratch plan\n\n## Decisions\n\n| # | Decision |\n|---|---|\n| C1 | x |\n\n' +
  '## Deliverables\n\n1. thing\n';

/**
 * Per-subcommand execution plan. EVERY key of COMMAND_REGISTRY must appear here
 * (enforced by the registry-coverage test below), either with `modes` (it is
 * exercised) or `skip` (allow-listed with a rationale per C47-4(b)).
 *
 * `args` is the full argv after the node binary (i.e. it starts with the
 * subcommand name). `{PLAN}` is replaced with the path to a scratch plan file.
 */
const SUBCOMMAND_PLAN = {
  // --- exercised in BOTH modes (safe, fast, non-interactive, read-only) ---
  version: { args: ['version'], modes: ['selfhost', 'consumer'] },
  whoami: { args: ['whoami'], modes: ['selfhost', 'consumer'] },
  // lint + plan-review-hash are the TWO subcommands LRN-124 live-reproduced on.
  lint: { args: ['lint', '--quiet'], modes: ['selfhost', 'consumer'] },
  'plan-review-hash': { args: ['plan-review-hash', '{PLAN}'], modes: ['selfhost', 'consumer'] },
  sync: { args: ['sync', '--mode=check'], modes: ['selfhost', 'consumer'] },
  check: { args: ['check'], modes: ['selfhost', 'consumer'] },

  // --- exercised in consumer mode only (stubs that die before any git op) ---
  harvest: { args: ['harvest'], modes: ['consumer'] },
  'check-migration': { args: ['check-migration', '--from-existing-harness'], modes: ['consumer'] },
  'composed-audit': { args: ['composed-audit', '--from-existing-harness'], modes: ['consumer'] },

  // --- allow-listed (network / interactive / heavy); each verified by the
  //     CS47 static audit to perform no HEAD-moving git op. ---
  init: {
    skip: 'Scaffolds many files and may prompt for a Workboard PAT on stdin (CI hang risk); ' +
      'its git surface is repo scaffolding, never a ref checkout (CS47 static audit).',
  },
  pack: {
    skip: 'Spawns `npm pack --dry-run` against REPO_ROOT (not cwd); slow/IO-heavy and performs ' +
      'no git HEAD-moving operation (bin/harness.mjs cmdPack).',
  },
  'copilot-engage': {
    skip: 'Requires gh auth + GitHub API polling for a Copilot review; only read-only ' +
      '`git rev-parse HEAD` locally (bin/harness.mjs).',
  },
  review: {
    skip: 'Requires gh auth + GitHub PR fetch to compose/post a review; git usage is read-only ' +
      'diff (lib/review.mjs).',
  },
  'cross-repo': {
    skip: 'Requires gh auth to file cross-repo issues; performs no HEAD-moving git operation ' +
      '(lib/cross-repo.mjs).',
  },
  'pr-evidence': {
    skip: 'Aggregator that fetches PR metadata; git usage is read-only diff/log (bin/harness.mjs).',
  },
  'review-output': {
    skip: 'Reads a reviewer-output file + read-only `git diff` (scripts/check-review-output.mjs); ' +
      'a post-review capture tool, not exercised here.',
  },
};

function git(cwd, args, env) {
  return spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: env ?? process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function gitOut(cwd, args) {
  const r = git(cwd, args);
  return (r.stdout ?? '').trim();
}

/** Create a fresh minimal consumer scratch repo with a v0.5.1 tag + dirty sentinel. */
function makeConsumerRepo() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'cs47-consumer-'));
  const id = ['-c', 'user.name=cs47-test', '-c', 'user.email=cs47@test.local'];
  git(dir, ['init', '--quiet', '-b', 'investigation']);
  git(dir, [...id, 'commit', '--allow-empty', '--quiet', '-m', 'bootstrap']);
  git(dir, ['tag', 'v0.5.1']);
  writeFileSync(path.join(dir, SENTINEL), SENTINEL_CLEAN);
  git(dir, ['add', SENTINEL]);
  git(dir, [...id, 'commit', '--quiet', '-m', 'add sentinel']);
  writeFileSync(path.join(dir, SENTINEL), SENTINEL_DIRTY); // dirty, NOT staged
  writeFileSync(path.join(dir, 'scratch-plan.md'), PLAN_FIXTURE);
  return dir;
}

/**
 * Create a self-host clone of the real harness repo (REPO_ROOT === cwd, the
 * LRN-124 environment). Local clone is fast (hardlinked objects) and carries the
 * real release tags + history. node_modules is gitignored, so a junction/symlink
 * is wired up for dependency-backed linters. The current working-tree
 * bin/harness.mjs is overlaid so the suite exercises the exact code under review.
 */
function makeSelfHostRepo() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'cs47-selfhost-'));
  const clone = path.join(dir, 'clone');
  const r = spawnSync('git', ['clone', '--quiet', '--local', REPO_ROOT, clone], {
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    throw new Error(`self-host clone failed: ${r.stderr || r.stdout}`);
  }
  // Overlay the current bin/harness.mjs (uncommitted CS47 edits) so the clone
  // runs the exact code under review.
  writeFileSync(path.join(clone, 'bin', 'harness.mjs'), readFileSync(REPO_BIN));
  // Wire node_modules so dependency-backed linter children can import.
  const nm = path.join(REPO_ROOT, 'node_modules');
  if (existsSync(nm)) {
    try {
      symlinkSync(nm, path.join(clone, 'node_modules'), 'junction');
    } catch {
      try {
        symlinkSync(nm, path.join(clone, 'node_modules'), 'dir');
      } catch {
        /* best-effort: dependency-backed children may error, which is fine —
           the invariant assertions still hold regardless of exit code. */
      }
    }
  }
  // Dirty tracked sentinel (committed, then modified) per PRR-4.
  const id = ['-c', 'user.name=cs47-test', '-c', 'user.email=cs47@test.local'];
  writeFileSync(path.join(clone, SENTINEL), SENTINEL_CLEAN);
  git(clone, ['add', SENTINEL]);
  git(clone, [...id, 'commit', '--quiet', '-m', 'add sentinel']);
  writeFileSync(path.join(clone, SENTINEL), SENTINEL_DIRTY);
  writeFileSync(path.join(clone, 'scratch-plan.md'), PLAN_FIXTURE);
  return { dir, clone };
}

function rmDir(p) {
  if (p && existsSync(p)) {
    rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

/**
 * Assert the LRN-124 invariants on `repo` after a subcommand ran.
 * @param {string} repo - the scratch repo dir.
 * @param {string} origHeadRef - the symbolic-ref HEAD captured before the run.
 * @param {string} traceFile - the GIT_TRACE log for the run.
 * @param {string} label - human-readable subcommand+mode label.
 */
function assertInvariants(repo, origHeadRef, traceFile, label) {
  // (a) HEAD still attached to the same branch — not detached.
  const headRef = gitOut(repo, ['symbolic-ref', 'HEAD']);
  assert.equal(
    headRef,
    origHeadRef,
    `${label}: HEAD detached or moved (expected ${origHeadRef}, got "${headRef || '(detached)'}")`,
  );

  // (b) the branch ref followed HEAD (PRR-3).
  const branch = origHeadRef.replace(/^refs\/heads\//, '');
  const headSha = gitOut(repo, ['rev-parse', 'HEAD']);
  const branchSha = gitOut(repo, ['rev-parse', branch]);
  assert.equal(headSha, branchSha, `${label}: HEAD and branch ${branch} diverged (PRR-3)`);

  // (c) the dirty tracked sentinel content is preserved.
  const content = readFileSync(path.join(repo, SENTINEL), 'utf8');
  assert.equal(content, SENTINEL_DIRTY, `${label}: dirty sentinel edit was reverted (LRN-124)`);

  // (d) the sentinel's porcelain status entry is unchanged (still modified).
  const status = gitOut(repo, ['status', '--porcelain', '--', SENTINEL]);
  assert.equal(status, `M ${SENTINEL}`, `${label}: sentinel porcelain status changed ("${status}")`);

  // (e) no HEAD/worktree-mutating git verb was invoked (argv-level evidence).
  if (existsSync(traceFile)) {
    const trace = readFileSync(traceFile, 'utf8');
    const offending = trace
      .split(/\r?\n/)
      .find((line) => MUTATING_VERB_RE.test(line));
    assert.equal(
      offending,
      undefined,
      `${label}: subcommand invoked a HEAD/worktree-mutating git verb:\n  ${offending}`,
    );
  }
}

/** Run one subcommand in the given repo and assert invariants. */
function runAndAssert({ repo, planArgs, mode, name, binPath, useCwdFlag }) {
  const origHeadRef = gitOut(repo, ['symbolic-ref', 'HEAD']);
  // Ensure the sentinel is dirty before each run (read-only self-host reuse).
  writeFileSync(path.join(repo, SENTINEL), SENTINEL_DIRTY);

  const traceFile = path.join(os.tmpdir(), `cs47-trace-${mode}-${name}-${process.pid}-${Date.now()}.log`);
  rmDir(traceFile);

  const args = planArgs.map((a) => (a === '{PLAN}' ? path.join(repo, 'scratch-plan.md') : a));
  const cliArgs = useCwdFlag ? ['--cwd', repo, ...args] : args;

  const r = spawnSync(process.execPath, [binPath, ...cliArgs], {
    cwd: repo,
    encoding: 'utf8',
    timeout: 120000,
    env: { ...process.env, GIT_TRACE: traceFile, HARNESS_NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Exit code is intentionally NOT asserted — many subcommands legitimately
  // error in a minimal scratch repo; the invariants must hold regardless.
  assertInvariants(repo, origHeadRef, traceFile, `${name} [${mode}]`);
  rmDir(traceFile);
  return r;
}

// --- shared self-host clone (read-only subcommands only → reusable) ----------
let selfHost = null;
before(() => {
  selfHost = makeSelfHostRepo();
});
after(() => {
  if (selfHost) rmDir(selfHost.dir);
});

// C47-1 / C47-4(a)(b): every registered subcommand must be covered.
test('CS47: every COMMAND_REGISTRY subcommand is exercised or allow-listed', () => {
  for (const name of Object.keys(COMMAND_REGISTRY)) {
    const plan = SUBCOMMAND_PLAN[name];
    assert.ok(
      plan,
      `Subcommand "${name}" is in COMMAND_REGISTRY but has no entry in SUBCOMMAND_PLAN. ` +
        `Add it to the bisection (modes) or allow-list it (skip + rationale) per CS47 C47-4(b).`,
    );
    if (plan.skip) {
      assert.equal(typeof plan.skip, 'string');
      assert.ok(plan.skip.length > 20, `Allow-list rationale for "${name}" is too thin.`);
    } else {
      assert.ok(Array.isArray(plan.modes) && plan.modes.length > 0, `"${name}" needs modes or skip.`);
    }
  }
  // Guard the reverse direction too: no stale SUBCOMMAND_PLAN entry.
  for (const name of Object.keys(SUBCOMMAND_PLAN)) {
    assert.ok(
      name in COMMAND_REGISTRY,
      `SUBCOMMAND_PLAN has stale entry "${name}" not in COMMAND_REGISTRY.`,
    );
  }
});

// Consumer-mode bisection: fresh minimal scratch repo per subcommand.
for (const [name, plan] of Object.entries(SUBCOMMAND_PLAN)) {
  if (plan.skip || !plan.modes.includes('consumer')) continue;
  test(`CS47 consumer-mode: ${name} preserves HEAD + dirty sentinel`, () => {
    const repo = makeConsumerRepo();
    try {
      runAndAssert({
        repo,
        planArgs: plan.args,
        mode: 'consumer',
        name,
        binPath: REPO_BIN,
        useCwdFlag: true,
      });
    } finally {
      rmDir(repo);
    }
  });
}

// Self-host-mode bisection: shared clone (REPO_ROOT === cwd). All self-host
// subcommands are read-only, so the clone is reused across them.
for (const [name, plan] of Object.entries(SUBCOMMAND_PLAN)) {
  if (plan.skip || !plan.modes.includes('selfhost')) continue;
  test(`CS47 self-host-mode: ${name} preserves HEAD + dirty sentinel`, () => {
    runAndAssert({
      repo: selfHost.clone,
      planArgs: plan.args,
      mode: 'selfhost',
      name,
      binPath: path.join(selfHost.clone, 'bin', 'harness.mjs'),
      useCwdFlag: false,
    });
  });
}
