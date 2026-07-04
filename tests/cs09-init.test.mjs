import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const HARNESS = path.join(REPO_ROOT, 'bin', 'harness.mjs');
const NODE = process.execPath;

function makeTmpDir() {
  return mkdtempSync(path.join(tmpdir(), 'harness-init-'));
}

function runHarness(args, opts = {}) {
  return spawnSync(NODE, [HARNESS, ...args], {
    encoding: 'utf8',
    cwd: opts.cwd ?? REPO_ROOT,
    ...opts,
  });
}

function runScript(scriptName, args, opts = {}) {
  return spawnSync(NODE, [path.join(REPO_ROOT, 'scripts', scriptName), ...args], {
    encoding: 'utf8',
    cwd: opts.cwd ?? REPO_ROOT,
    ...opts,
  });
}

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function snapshotTree(rootDir) {
  const files = [];

  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(rootDir, fullPath).split(path.sep).join('/');
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        files.push({ path: relPath, sha256: sha256File(fullPath), size: statSync(fullPath).size });
      }
    }
  }

  walk(rootDir);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

describe('CS09 — harness init seeds a fresh consumer repo', () => {
  it('1. harness init produces all 5 seeded skeletons + harness.config.json', () => {
    const dir = makeTmpDir();
    try {
      const r = runHarness(['--cwd', dir, 'init']);
      assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);

      // All 5 seeded skeletons + config produced
      for (const file of [
        'harness.config.json',
        'CONTEXT.md',
        'ARCHITECTURE.md',
        'LEARNINGS.md',
        'WORKBOARD.md',
        'README.md',
      ]) {
        assert.ok(
          existsSync(path.join(dir, file)),
          `Expected ${file} to be produced; not found`
        );
      }

      // Clickstops directory tree
      for (const sub of ['planned', 'active', 'done']) {
        assert.ok(
          existsSync(path.join(dir, 'project', 'clickstops', sub, '.gitkeep')),
          `Expected project/clickstops/${sub}/.gitkeep`
        );
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('2. produced CONTEXT.md passes check-context linter', () => {
    const dir = makeTmpDir();
    try {
      runHarness(['--cwd', dir, 'init']);
      const r = runScript('check-context.mjs', ['--file', path.join(dir, 'CONTEXT.md'), '--cwd', dir]);
      assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('3. produced ARCHITECTURE.md passes check-architecture linter', () => {
    const dir = makeTmpDir();
    try {
      runHarness(['--cwd', dir, 'init']);
      const r = runScript('check-architecture.mjs', ['--file', path.join(dir, 'ARCHITECTURE.md')]);
      assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('4. produced LEARNINGS.md passes check-learnings linter', () => {
    const dir = makeTmpDir();
    try {
      runHarness(['--cwd', dir, 'init']);
      const r = runScript('check-learnings.mjs', ['--file', path.join(dir, 'LEARNINGS.md')]);
      assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('5. produced WORKBOARD.md passes check-workboard linter', () => {
    const dir = makeTmpDir();
    try {
      runHarness(['--cwd', dir, 'init']);
      const r = runScript('check-workboard.mjs', ['--file', path.join(dir, 'WORKBOARD.md')]);
      assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('6. produced README.md passes check-readme linter', () => {
    const dir = makeTmpDir();
    try {
      runHarness(['--cwd', dir, 'init']);
      const r = runScript('check-readme.mjs', ['--file', path.join(dir, 'README.md')]);
      assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('7. harness lint --quiet against init-produced repo passes for all structural linters (config-placeholders flags the unfilled identity placeholders, CS26)', () => {
    const dir = makeTmpDir();
    try {
      runHarness(['--cwd', dir, 'init']);
      // The seeded config intentionally ships REPLACE_ME identity placeholders
      // (project.repo, templating.*) that the consumer must fill before sync; the
      // CS26 config-placeholders linter flags them by design, so it is asserted
      // separately and excluded from the structural-clean check below (the seeded
      // doc skeletons + clickstop/composed-blocks/etc. must still lint cleanly).
      const r = runHarness(['--cwd', dir, 'lint', '--quiet', '--skip', 'config-placeholders']);
      assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
      // The seeded skeletons cover the core 5; clickstop/composed-blocks/etc. should pass or skip
      assert.ok(
        r.stdout.includes('Total:') && r.stdout.includes('0 failed'),
        `Expected "0 failed" in summary; got:\n${r.stdout}`
      );
      // config-placeholders correctly flags the fresh-init config's un-replaced
      // REPLACE_ME identity placeholders (exit 1 by design).
      const cp = runHarness(['--cwd', dir, 'lint', '--only', 'config-placeholders', '--quiet']);
      assert.equal(
        cp.status,
        1,
        `config-placeholders must flag the fresh-init config's unfilled REPLACE_ME placeholders; got exit ${cp.status}\nstdout: ${cp.stdout}`
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('8. init-produced harness.config.json is the seeded config (not minimal scaffold)', () => {
    const dir = makeTmpDir();
    try {
      const r = runHarness(['--cwd', dir, 'init']);
      assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);

      const cfg = JSON.parse(readFileSync(path.join(dir, 'harness.config.json'), 'utf8'));

      // composed.files matches seeded template + the PR template migrated by
      // the default-on review-gates flow (CS41 C41-7: review_gates is opt-out
      // by default in v0.5.0, and a fresh init runs the migration). CS72
      // reclassified INSTRUCTIONS.md + .github/copilot-instructions.md
      // managed->composed so fresh consumers receive generic bases.
      assert.deepEqual(
        cfg.composed.files,
        [
          'INSTRUCTIONS.md',
          'CONVENTIONS.md',
          'OPERATIONS.md',
          'REVIEWS.md',
          '.github/copilot-instructions.md',
          '.github/pull_request_template.md',
        ],
      );

      // composed.overrides has the 3 original per-file allowlists (LRN-009 / CS02b)
      // plus the PR-template override added by enableReviewGatesForInit, plus the
      // 2 CS72 reclassifications (INSTRUCTIONS.md + .github/copilot-instructions.md).
      assert.equal(Object.keys(cfg.composed.overrides).length, 6);
      assert.deepEqual(cfg.composed.overrides['INSTRUCTIONS.md'].local_blocks, ['instructions.harness']);
      assert.deepEqual(cfg.composed.overrides['CONVENTIONS.md'].local_blocks, ['conventions.project']);
      assert.deepEqual(cfg.composed.overrides['OPERATIONS.md'].local_blocks, ['operations.project-deploy']);
      assert.deepEqual(cfg.composed.overrides['REVIEWS.md'].local_blocks, ['reviews.project-gates']);
      assert.deepEqual(
        cfg.composed.overrides['.github/copilot-instructions.md'].local_blocks,
        ['copilot-instructions.harness'],
      );
      assert.deepEqual(
        cfg.composed.overrides['.github/pull_request_template.md'].local_blocks,
        ['pull-request.review-evidence'],
      );
      assert.equal(cfg.local_blocks, undefined, 'Top-level local_blocks must not be present (removed in v0.2.0)');

      // CS41 C41-7: fresh init writes review_gates.enabled = true by default.
      assert.equal(cfg.review_gates?.enabled, true, 'fresh init must default review_gates.enabled to true (CS41 C41-7)');

      // templating map has expected keys
      for (const key of ['project_name', 'agent_suffix', 'agent_suffix_upper', 'repo_owner', 'default_codeowner', 'lib_codeowner', 'repo_short']) {
        assert.ok(key in cfg.templating, `Expected templating.${key}`);
      }

      // $schema is the canonical URL
      assert.equal(
        cfg.$schema,
        'https://github.com/henrik-me/agent-harness/schemas/harness.config.schema.json'
      );

      // agent_suffix matches schema pattern ^[a-z][a-z0-9-]*$
      assert.match(cfg.project.agent_suffix, /^[a-z][a-z0-9-]*$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('9. harness init with existing config skips config write but still copies seeded files (Blocker 2 regression)', () => {
    const dir = makeTmpDir();
    try {
      // Pre-write a minimal valid harness.config.json (different from seeded)
      mkdirSync(dir, { recursive: true });
      const preConfig = JSON.stringify(
        { version: 'v0.0.1', project: { name: 'pre-existing', agent_suffix: 'pe' } },
        null,
        2
      ) + '\n';
      writeFileSync(path.join(dir, 'harness.config.json'), preConfig, 'utf8');

      const r = runHarness(['--cwd', dir, 'init']);
      assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);

      // harness.config.json content must be unchanged
      const afterConfig = readFileSync(path.join(dir, 'harness.config.json'), 'utf8');
      assert.equal(afterConfig, preConfig, 'harness.config.json should be unchanged when it pre-exists');

      // Seeded files must have been created (this was the bug — they were silently skipped)
      for (const file of ['CONTEXT.md', 'ARCHITECTURE.md', 'README.md', 'LEARNINGS.md', 'WORKBOARD.md']) {
        assert.ok(existsSync(path.join(dir, file)), `Expected ${file} to be created by init`);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('10. init-produced repo passes sync --mode=check without mutations (LRN-057)', (t) => {
    const dir = makeTmpDir();
    t.after(() => rmSync(dir, { recursive: true, force: true }));

    const init = runHarness(['--cwd', dir, 'init']);
    assert.equal(init.status, 0, `Expected init exit 0; got ${init.status}
stdout: ${init.stdout}
stderr: ${init.stderr}`);

    const before = snapshotTree(dir);
    const syncCheck = runHarness(['--cwd', dir, 'sync', '--mode=check']);
    assert.equal(
      syncCheck.status,
      0,
      `Expected sync check exit 0; got ${syncCheck.status}
stdout: ${syncCheck.stdout}
stderr: ${syncCheck.stderr}`
    );
    assert.match(syncCheck.stdout, /No drift detected\./, `Expected no-drift stdout; got:
${syncCheck.stdout}`);

    const after = snapshotTree(dir);
    assert.deepEqual(after, before, 'sync --mode=check must not mutate the init-produced repo');
  });

  it('11. CS26: fresh init writes a real version pin, seeds .gitattributes, drops stray sentinels, retains clickstops sentinels', () => {
    const dir = makeTmpDir();
    try {
      const r = runHarness(['--cwd', dir, 'init']);
      assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);

      // Finding #2: version is no longer the seeded v0.1.0 placeholder
      const cfg = JSON.parse(readFileSync(path.join(dir, 'harness.config.json'), 'utf8'));
      assert.notEqual(cfg.version, 'v0.1.0', 'fresh init must overwrite the seeded v0.1.0 placeholder');
      assert.ok(
        /^v\d+\.\d+\.\d+/.test(cfg.version) || /^[0-9a-f]{40}$/.test(cfg.version),
        `version must be a SemVer tag or a full 40-hex SHA; got ${cfg.version}`,
      );

      // Finding #6: neither stray sentinel is seeded
      assert.ok(!existsSync(path.join(dir, '.gitkeep')), 'root .gitkeep must NOT be seeded');
      assert.ok(!existsSync(path.join(dir, '.github', '.gitkeep')), '.github/.gitkeep must NOT be seeded');

      // Finding #9: .gitattributes is seeded and forces LF
      const gaPath = path.join(dir, '.gitattributes');
      assert.ok(existsSync(gaPath), '.gitattributes must be seeded');
      assert.match(readFileSync(gaPath, 'utf8'), /eol=lf/, '.gitattributes must contain eol=lf');

      // Retained: the clickstops .gitkeep sentinels (C26-6)
      for (const sub of ['planned', 'active', 'done']) {
        assert.ok(
          existsSync(path.join(dir, 'project', 'clickstops', sub, '.gitkeep')),
          `project/clickstops/${sub}/.gitkeep must be retained`,
        );
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
