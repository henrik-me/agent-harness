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
const MUTATING_VERBS = new Set([
  'checkout', 'switch', 'reset', 'restore', 'worktree', 'stash', 'clean',
]);

// git GLOBAL options that consume a SEPARATE following value token (i.e. the
// `--opt value` form, as opposed to `--opt=value`). Used to correctly skip past
// option values when locating the subcommand token in a GIT_TRACE line.
const VALUE_CONSUMING_GIT_OPTS = new Set([
  '-C', '-c', '--git-dir', '--work-tree', '--namespace',
  '--super-prefix', '--config-env', '--exec-path',
]);

/**
 * Shell-like tokenizer for the argv tail of a GIT_TRACE line. Honours single
 * and double quotes so a value containing spaces (e.g. `-C 'path with spaces'`)
 * stays a single token rather than fragmenting and derailing option-skipping.
 *
 * @param {string} s
 * @returns {string[]}
 */
function tokenizeArgv(s) {
  const tokens = [];
  let cur = '';
  let inS = false; // inside single quotes
  let inD = false; // inside double quotes
  let started = false; // a token has begun (even if it is the empty string '')
  for (const ch of s) {
    if (inS) { if (ch === "'") inS = false; else cur += ch; continue; }
    if (inD) { if (ch === '"') inD = false; else cur += ch; continue; }
    if (ch === "'") { inS = true; started = true; continue; }
    if (ch === '"') { inD = true; started = true; continue; }
    if (ch === ' ' || ch === '\t') {
      if (started) { tokens.push(cur); cur = ''; started = false; }
      continue;
    }
    cur += ch;
    started = true;
  }
  if (started) tokens.push(cur);
  return tokens;
}

/**
 * Scan a GIT_TRACE log for any HEAD/worktree-mutating git invocation.
 *
 * GIT_TRACE lines that name a command look like:
 *   <ts> git.c:455         trace: built-in: git checkout main
 *   <ts> run-command.c:N    trace: run_command: git -C /p checkout tag
 *   <ts>                    trace: exec: git 'reset' '--hard'
 * The command always follows a `built-in:` / `exec:` / `run_command:` category
 * tag, so we anchor on that (avoids matching the `git.c:` filename prefix), then
 * skip any leading git OPTIONS — including value-consuming globals in both
 * `--opt value` and `--opt=value` forms (e.g. `git --git-dir /p reset`, or a
 * quoted `git -C 'a b' checkout`) — so an option-prefixed mutating call is still
 * caught.
 *
 * @param {string} traceText
 * @returns {string | null} the first offending line, or null if none.
 */
function findMutatingGitVerb(traceText) {
  for (const raw of traceText.split(/\r?\n/)) {
    const m = raw.match(/\b(?:built-in|exec|run_command):\s+git\b(.*)$/);
    if (!m) continue;
    const tokens = tokenizeArgv(m[1].trim());
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok === '') continue;
      if (VALUE_CONSUMING_GIT_OPTS.has(tok)) { i++; continue; } // `--opt value`
      if (tok.startsWith('-')) continue; // `--opt=value`, bare flags, `-p`, …
      // first non-option token is the git subcommand.
      if (MUTATING_VERBS.has(tok)) return raw;
      break;
    }
  }
  return null;
}

// A minimal clickstop plan file so `plan-review-hash <file>` reaches its real
// (pure) code path instead of dying on a missing-file argument.
const PLAN_FIXTURE =
  '# Scratch plan\n\n## Decisions\n\n| # | Decision |\n|---|---|\n| C1 | x |\n\n' +
  '## Deliverables\n\n1. thing\n';

/**
 * Per-subcommand execution plan. EVERY key of COMMAND_REGISTRY must appear here
 * (enforced by the registry-coverage test below), either with `runs` (it is
 * exercised) or `skip` (allow-listed with a rationale per C47-4(b)).
 *
 * Each entry in `runs` is one invocation: `{ args, modes, freshSelfHost? }`.
 *   - `args` is the full argv after the node binary (starts with the subcommand
 *     name). `{PLAN}` is replaced with the path to a scratch plan file.
 *   - `modes` ⊆ ['selfhost','consumer'] (C47-2). Consumer runs always get a
 *     fresh scratch repo; self-host runs reuse one shared read-only clone…
 *   - …unless `freshSelfHost: true`, which gives a WRITER invocation
 *     (e.g. `sync --mode=apply`) its own dedicated clone so its writes cannot
 *     corrupt a later read-only subcommand's assertions.
 */
const SUBCOMMAND_PLAN = {
  // --- read-only, exercised in BOTH modes (fast, non-interactive) ---
  version: { runs: [{ args: ['version'], modes: ['selfhost', 'consumer'] }] },
  whoami: { runs: [{ args: ['whoami'], modes: ['selfhost', 'consumer'] }] },
  // lint + plan-review-hash are the TWO subcommands LRN-124 live-reproduced on.
  lint: { runs: [{ args: ['lint', '--quiet'], modes: ['selfhost', 'consumer'] }] },
  'plan-review-hash': {
    runs: [{ args: ['plan-review-hash', '{PLAN}'], modes: ['selfhost', 'consumer'] }],
  },
  // sync covers BOTH read-only check AND the apply path — apply is the LRN-124
  // incident-#1 trigger, so it is exercised (self-host, dedicated clone).
  sync: {
    runs: [
      { args: ['sync', '--mode=check'], modes: ['selfhost', 'consumer'] },
      { args: ['sync', '--mode=apply'], modes: ['selfhost'], freshSelfHost: true },
    ],
  },
  check: { runs: [{ args: ['check'], modes: ['selfhost', 'consumer'] }] },

  // --- stubs that die() before any git op; exercised in BOTH modes ---
  harvest: { runs: [{ args: ['harvest'], modes: ['selfhost', 'consumer'] }] },
  'check-migration': {
    runs: [{ args: ['check-migration', '--from-existing-harness'], modes: ['selfhost', 'consumer'] }],
  },
  'composed-audit': {
    runs: [{ args: ['composed-audit', '--from-existing-harness'], modes: ['selfhost', 'consumer'] }],
  },

  // init scaffolds a fresh consumer repo and finalizes via `sync --mode=apply`
  // (bin/harness.mjs cmdInit) — the second arm into the apply path. Exercised in
  // consumer mode (its only meaningful mode) with prompts/network suppressed.
  init: {
    runs: [{
      args: ['init', '--skip-constraint-detection', '--skip-workboard-pat-prompt'],
      modes: ['consumer'],
    }],
  },

  // --- allow-listed (network / interactive / heavy); each verified by the
  //     CS47 static audit to perform no HEAD-moving git op. ---
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
    const offending = findMutatingGitVerb(readFileSync(traceFile, 'utf8'));
    assert.equal(
      offending,
      null,
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

// Self-test the GIT_TRACE detector itself, so a silently-broken regex cannot
// produce a false-green across the whole suite (review concern: detector must
// actually catch real mutating-verb trace lines, including option-prefixed and
// quoted forms, while ignoring read-only git and the `git.c:` filename prefix).
test('CS47: findMutatingGitVerb detects mutating verbs and ignores read-only git', () => {
  const POSITIVE = [
    '12:00:00.123456 git.c:455               trace: built-in: git checkout main',
    "12:00:00.123456 run-command.c:655       trace: run_command: git -C /tmp/r checkout v0.5.1",
    "12:00:00.123456 git.c:455               trace: exec: git 'reset' '--hard'",
    '12:00:00.123456 git.c:455               trace: built-in: git -c advice.detachedHead=false switch tag',
    '12:00:00.123456 git.c:455               trace: run_command: git worktree add /tmp/wt v0.5.1',
    // value-consuming long options in `--opt value` form must be skipped.
    '12:00:00.123456 git.c:455               trace: exec: git --git-dir /tmp/r/.git reset --hard',
    '12:00:00.123456 git.c:455               trace: exec: git --work-tree /tmp/r checkout v0.5.1',
    // quoted option value containing spaces must stay one token.
    "12:00:00.123456 git.c:455               trace: exec: git -C 'path with spaces' checkout v0.5.1",
    // -C as a value-consuming option with the verb following its value.
    '12:00:00.123456 git.c:455               trace: run_command: git --exec-path /usr/libexec/git-core stash',
  ];
  for (const line of POSITIVE) {
    assert.ok(findMutatingGitVerb(line), `expected to flag mutating line: ${line}`);
  }

  const NEGATIVE = [
    '12:00:00.123456 git.c:455               trace: built-in: git rev-parse HEAD',
    '12:00:00.123456 run-command.c:655       trace: run_command: git -C /tmp/r rev-parse HEAD',
    '12:00:00.123456 git.c:455               trace: built-in: git describe --tags --exact-match',
    '12:00:00.123456 git.c:455               trace: built-in: git status --porcelain',
    // a path/value that merely contains a verb-like word must not trip the detector.
    '12:00:00.123456 git.c:455               trace: exec: git diff --name-only -- src/checkout.js',
    '12:00:00.123456 git.c:455               trace: built-in: git log -G stash -- lib',
    "12:00:00.123456 git.c:455               trace: exec: git -C 'checkout' rev-parse HEAD",
    '12:00:00.123456 git.c:455               trace: exec: git --git-dir reset/.git rev-parse HEAD',
    '',
  ];
  for (const line of NEGATIVE) {
    assert.equal(findMutatingGitVerb(line), null, `false positive on read-only line: ${line}`);
  }
});


// C47-1 / C47-4(a)(b): every registered subcommand must be covered.
test('CS47: every COMMAND_REGISTRY subcommand is exercised or allow-listed', () => {
  for (const name of Object.keys(COMMAND_REGISTRY)) {
    const plan = SUBCOMMAND_PLAN[name];
    assert.ok(
      plan,
      `Subcommand "${name}" is in COMMAND_REGISTRY but has no entry in SUBCOMMAND_PLAN. ` +
        `Add it to the bisection (runs) or allow-list it (skip + rationale) per CS47 C47-4(b).`,
    );
    if (plan.skip) {
      assert.equal(typeof plan.skip, 'string');
      assert.ok(plan.skip.length > 20, `Allow-list rationale for "${name}" is too thin.`);
    } else {
      assert.ok(Array.isArray(plan.runs) && plan.runs.length > 0, `"${name}" needs runs or skip.`);
      for (const run of plan.runs) {
        assert.ok(Array.isArray(run.args) && run.args.length > 0, `"${name}" run needs args.`);
        assert.ok(
          Array.isArray(run.modes) && run.modes.every((m) => m === 'selfhost' || m === 'consumer'),
          `"${name}" run modes must be a non-empty subset of {selfhost, consumer}.`,
        );
      }
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

/** Iterate (name, run) pairs that target a given mode. */
function* runsForMode(mode) {
  for (const [name, plan] of Object.entries(SUBCOMMAND_PLAN)) {
    if (plan.skip) continue;
    for (let i = 0; i < plan.runs.length; i++) {
      const run = plan.runs[i];
      if (run.modes.includes(mode)) yield { name, run, index: i };
    }
  }
}

// Consumer-mode bisection: fresh minimal scratch repo per run.
for (const { name, run, index } of runsForMode('consumer')) {
  const label = run.args.slice(1).join(' ') || '(default)';
  test(`CS47 consumer-mode: ${name} ${label} preserves HEAD + dirty sentinel`, () => {
    const repo = makeConsumerRepo();
    try {
      runAndAssert({
        repo,
        planArgs: run.args,
        mode: 'consumer',
        name: `${name}#${index}`,
        binPath: REPO_BIN,
        useCwdFlag: true,
      });
    } finally {
      rmDir(repo);
    }
  });
}

// Self-host-mode bisection (REPO_ROOT === cwd, the LRN-124 environment).
// Read-only runs reuse one shared clone; `freshSelfHost` writer runs get a
// dedicated clone so their writes cannot leak into a later assertion.
for (const { name, run, index } of runsForMode('selfhost')) {
  const label = run.args.slice(1).join(' ') || '(default)';
  test(`CS47 self-host-mode: ${name} ${label} preserves HEAD + dirty sentinel`, () => {
    let owned = null;
    const repo = run.freshSelfHost ? (owned = makeSelfHostRepo()).clone : selfHost.clone;
    try {
      runAndAssert({
        repo,
        planArgs: run.args,
        mode: 'selfhost',
        name: `${name}#${index}`,
        binPath: path.join(repo, 'bin', 'harness.mjs'),
        useCwdFlag: false,
      });
    } finally {
      if (owned) rmDir(owned.dir);
    }
  });
}
