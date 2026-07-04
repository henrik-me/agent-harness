/**
 * tests/check-clickstop-orphan.test.mjs — CS70 (C70-6 / C70-6a).
 *
 * Exercises the directory-form close-out orphan check in
 * scripts/check-clickstop.mjs. Each test builds a throwaway git repo under
 * os.tmpdir() (NEVER under REPO_ROOT — per LRN-094, transient writes there race
 * with check-text-encoding's recursive walk under parallel `node --test`),
 * commits a directory-form CS in its `active/` state, then transforms it to
 * `done/` and runs the linter via spawnSync.
 *
 * Cases:
 *   (a) conformant whole-directory rename            → exit 0
 *   (b) sibling artifact dropped at close-out         → exit 1 + names the file
 *   (c) dropped sibling declared in allow-drop         → exit 0
 *   (d) non-directory-form (flat) CS                   → unaffected (exit 0)
 *   (e) dropped .gitkeep placeholder                   → exit 0 (exempt)
 *   (f) relative --dir invocation (real-usage path)    → orphan still detected
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const LINTER = path.join(REPO_ROOT, 'scripts', 'check-clickstop.mjs');
const NODE = process.execPath;
const createdRoots = [];

function git(cwd, args) {
  execFileSync('git', ['-C', cwd, ...args], { stdio: 'ignore' });
}

function setupRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cs70-orphan-'));
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'cs70-test']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  createdRoots.push(root);
  return root;
}

function write(root, relPath, content) {
  const abs = path.join(root, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
}

function commitAll(root, msg) {
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', msg, '--no-verify']);
}

/** A minimal CS plan file that satisfies the per-file lifecycle checks. */
function planFile(slug, state) {
  return [
    `# ${slug}`,
    '',
    `**Status:** ${state}`,
    '**Owner:** cs70-test',
    '**Branch:** cs70-test',
    '**Started:** 2026-06-10',
    state === 'done' ? '**Closed:** 2026-06-10' : '**Closed:** —',
    '**Depends on:** —',
    '',
    '## Plan-vs-implementation review',
    '',
    '> Grandfathered: closed before plan-vs-implementation review gate was introduced (CS03b).',
    '',
    '## Tasks',
    '',
    '| Task | State | Owner | Notes |',
    '|---|---|---|---|',
    '| Close-out: docs + restart state — update WORKBOARD/CONTEXT | done | cs70-test | — |',
    '| Close-out: learnings + follow-ups — file LRNs | done | cs70-test | — |',
    '',
  ].join('\n');
}

function runLinter(root, { relativeDir = false } = {}) {
  // relativeDir mirrors real usage: `harness lint` runs check-clickstop from the
  // repo root with a RELATIVE `--dir project/clickstops`.
  const dirArg = relativeDir
    ? path.join('project', 'clickstops')
    : path.join(root, 'project', 'clickstops');
  const result = spawnSync(NODE, [LINTER, '--dir', dirArg], {
    cwd: root,
    encoding: 'utf8',
  });
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status ?? -1 };
}

/**
 * Build a directory-form CS in `active/`, commit it, then mutate to `done/`
 * via `mutate(root)` and commit again.
 *
 * @param {(root: string) => void} mutate
 * @param {{ siblings?: string[] }} [opts]
 * @returns {string} repo root
 */
function buildActiveThenClose(mutate, { siblings = ['artifact.md'] } = {}) {
  const root = setupRepo();
  const slug = 'cs90_demo';
  write(root, `project/clickstops/active/active_${slug}/active_${slug}.md`, planFile(slug, 'active'));
  for (const s of siblings) {
    write(root, `project/clickstops/active/active_${slug}/${s}`, `content of ${s}\n`);
  }
  commitAll(root, 'CS90 active (dir-form, with siblings)');
  mutate(root);
  commitAll(root, 'CS90 close-out');
  return root;
}

describe('check-clickstop directory-form orphan check (CS70)', () => {
  afterEach(() => {
    for (const r of createdRoots.splice(0)) fs.rmSync(r, { recursive: true, force: true });
  });

  it('(a) conformant whole-directory rename passes', () => {
    const slug = 'cs90_demo';
    const root = buildActiveThenClose((r) => {
      // Whole-directory rename: every sibling moves; the plan file is renamed.
      fs.mkdirSync(path.join(r, 'project/clickstops/done'), { recursive: true });
      git(r, ['mv', `project/clickstops/active/active_${slug}`, `project/clickstops/done/done_${slug}`]);
      git(r, ['mv',
        `project/clickstops/done/done_${slug}/active_${slug}.md`,
        `project/clickstops/done/done_${slug}/done_${slug}.md`]);
      // Realistic close-out also flips the inner plan file's Status active→done
      // (CS75: the hardened gate now recurses into dir-form inner files).
      write(r, `project/clickstops/done/done_${slug}/done_${slug}.md`, planFile(slug, 'done'));
    });
    const r = runLinter(root);
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stdout}`);
    assert.match(r.stdout, /Linter passed/);
  });

  it('(b) sibling dropped at close-out fails and names the missing file', () => {
    const slug = 'cs90_demo';
    const root = buildActiveThenClose((r) => {
      // Per-file rename of the plan only; sibling is dropped (the CS16 bug).
      fs.mkdirSync(path.join(r, `project/clickstops/done/done_${slug}`), { recursive: true });
      git(r, ['mv',
        `project/clickstops/active/active_${slug}/active_${slug}.md`,
        `project/clickstops/done/done_${slug}/done_${slug}.md`]);
      git(r, ['rm', '-q', `project/clickstops/active/active_${slug}/artifact.md`]);
    });
    const r = runLinter(root);
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stdout}`);
    assert.match(r.stdout, /artifact\.md/);
    assert.match(r.stdout, /missing from done\/done_cs90_demo/);
  });

  it('(c) dropped sibling declared in .harness-closeout-allow-drop passes', () => {
    const slug = 'cs90_demo';
    const root = buildActiveThenClose((r) => {
      fs.mkdirSync(path.join(r, `project/clickstops/done/done_${slug}`), { recursive: true });
      git(r, ['mv',
        `project/clickstops/active/active_${slug}/active_${slug}.md`,
        `project/clickstops/done/done_${slug}/done_${slug}.md`]);
      // Realistic close-out flips the inner plan file's Status active→done (CS75).
      write(r, `project/clickstops/done/done_${slug}/done_${slug}.md`, planFile(slug, 'done'));
      git(r, ['rm', '-q', `project/clickstops/active/active_${slug}/artifact.md`]);
      write(r, `project/clickstops/done/done_${slug}/.harness-closeout-allow-drop`,
        '# intentional drop\nartifact.md\n');
    });
    const r = runLinter(root);
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stdout}`);
    assert.match(r.stdout, /Linter passed/);
  });

  it('(d) non-directory-form (flat) CS is unaffected by the orphan check', () => {
    const root = setupRepo();
    write(root, 'project/clickstops/done/done_cs91_flat.md', planFile('cs91_flat', 'done'));
    commitAll(root, 'CS91 flat done');
    const r = runLinter(root);
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stdout}`);
    assert.match(r.stdout, /Linter passed/);
  });

  it('(e) a dropped .gitkeep placeholder is exempt (not a content artifact)', () => {
    const slug = 'cs90_demo';
    const root = buildActiveThenClose((r) => {
      fs.mkdirSync(path.join(r, `project/clickstops/done/done_${slug}`), { recursive: true });
      git(r, ['mv',
        `project/clickstops/active/active_${slug}/active_${slug}.md`,
        `project/clickstops/done/done_${slug}/done_${slug}.md`]);
      // Realistic close-out flips the inner plan file's Status active→done (CS75).
      write(r, `project/clickstops/done/done_${slug}/done_${slug}.md`, planFile(slug, 'done'));
      git(r, ['mv',
        `project/clickstops/active/active_${slug}/artifact.md`,
        `project/clickstops/done/done_${slug}/artifact.md`]);
      // The empty-dir placeholder is intentionally not carried over.
      git(r, ['rm', '-q', `project/clickstops/active/active_${slug}/snapshot/.gitkeep`]);
    }, { siblings: ['artifact.md', 'snapshot/.gitkeep'] });
    const r = runLinter(root);
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stdout}`);
    assert.match(r.stdout, /Linter passed/);
  });

  it('(f) detects a dropped orphan when invoked with a RELATIVE --dir (real-usage path)', () => {
    const slug = 'cs90_demo';
    const root = buildActiveThenClose((r) => {
      fs.mkdirSync(path.join(r, `project/clickstops/done/done_${slug}`), { recursive: true });
      git(r, ['mv',
        `project/clickstops/active/active_${slug}/active_${slug}.md`,
        `project/clickstops/done/done_${slug}/done_${slug}.md`]);
      git(r, ['rm', '-q', `project/clickstops/active/active_${slug}/artifact.md`]);
    });
    // cwd = repo root, --dir = 'project/clickstops' (relative) — exactly how
    // `harness lint` invokes the linter. Confirms activeRel resolves correctly
    // off a relative --dir so the orphan is still detected.
    const r = runLinter(root, { relativeDir: true });
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stdout}`);
    assert.match(r.stdout, /artifact\.md/);
    assert.match(r.stdout, /missing from done\/done_cs90_demo/);
  });
});
