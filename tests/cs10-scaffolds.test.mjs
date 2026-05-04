/**
 * tests/cs10-scaffolds.test.mjs — CS10 scaffolds + harness init --with-scaffold wiring.
 *
 * Asserts the 8 named scaffold bundles exist on disk under the contract
 * (`scaffolds/<name>/README.md` + `scaffolds/<name>/files/...`), that
 * `harness init --with-scaffold <name>` drops the files create-if-missing,
 * that `harness.config.json` records the opt-in, and that consumer-relative
 * paths across all 8 scaffolds do not collide.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const HARNESS = path.join(REPO_ROOT, 'bin', 'harness.mjs');
const NODE = process.execPath;

const SCAFFOLD_NAMES = [
  'smoke',
  'migrations',
  'container-validate',
  'health-check',
  'seed',
  'verify-deploy',
  'feature-flags',
  'cs-probes',
];

function makeTmpDir() {
  return mkdtempSync(path.join(tmpdir(), 'harness-cs10-'));
}

function runHarness(args, opts = {}) {
  return spawnSync(NODE, [HARNESS, ...args], {
    encoding: 'utf8',
    cwd: opts.cwd ?? REPO_ROOT,
    ...opts,
  });
}

function listFilesRel(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  const stack = [''];
  while (stack.length) {
    const sub = stack.pop();
    const abs = path.join(dir, sub);
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const rel = sub ? path.join(sub, entry.name) : entry.name;
      if (entry.isDirectory()) stack.push(rel);
      else if (entry.isFile()) out.push(rel.replace(/\\/g, '/'));
    }
  }
  return out;
}

describe('CS10 — scaffold bundles on disk', () => {
  for (const name of SCAFFOLD_NAMES) {
    it(`${name}/ has README.md + files/ subtree`, () => {
      const root = path.join(REPO_ROOT, 'scaffolds', name);
      assert.ok(existsSync(path.join(root, 'README.md')), `Missing scaffolds/${name}/README.md`);
      const filesDir = path.join(root, 'files');
      assert.ok(existsSync(filesDir), `Missing scaffolds/${name}/files/`);
      assert.ok(statSync(filesDir).isDirectory(), `scaffolds/${name}/files is not a directory`);
      const files = listFilesRel(filesDir);
      assert.ok(files.length > 0, `scaffolds/${name}/files/ is empty`);
    });
  }
});

describe('CS10 — no consumer-path collisions across scaffolds', () => {
  it('every files/** path is unique across all 8 scaffolds', () => {
    const seen = new Map();
    const collisions = [];
    for (const name of SCAFFOLD_NAMES) {
      const filesDir = path.join(REPO_ROOT, 'scaffolds', name, 'files');
      for (const rel of listFilesRel(filesDir)) {
        if (seen.has(rel)) {
          collisions.push(`${rel}: ${seen.get(rel)} vs ${name}`);
        } else {
          seen.set(rel, name);
        }
      }
    }
    assert.deepEqual(collisions, [], `Consumer-path collisions detected:\n${collisions.join('\n')}`);
  });
});

describe('CS10 — harness init --with-scaffold drops files', () => {
  for (const name of SCAFFOLD_NAMES) {
    it(`init --with-scaffold ${name} drops at least one file and records opt-in in config`, () => {
      const dir = makeTmpDir();
      try {
        const r = runHarness(['--cwd', dir, 'init', '--with-scaffold', name]);
        assert.equal(
          r.status,
          0,
          `Expected exit 0; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
        );

        const filesDir = path.join(REPO_ROOT, 'scaffolds', name, 'files');
        const expected = listFilesRel(filesDir);
        assert.ok(expected.length > 0, `Scaffold ${name}/files/ is empty`);
        for (const rel of expected) {
          assert.ok(
            existsSync(path.join(dir, rel)),
            `Expected scaffold file ${rel} to be dropped for ${name}`
          );
        }

        // harness.config.json scaffolds[] records the opt-in
        const cfg = JSON.parse(readFileSync(path.join(dir, 'harness.config.json'), 'utf8'));
        assert.ok(
          Array.isArray(cfg.scaffolds) && cfg.scaffolds.includes(name),
          `Expected harness.config.json scaffolds[] to include "${name}"; got ${JSON.stringify(cfg.scaffolds)}`
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});

describe('CS10 — composition + idempotency + error cases', () => {
  it('multiple --with-scaffold flags compose without overwriting', () => {
    const dir = makeTmpDir();
    try {
      const r = runHarness([
        '--cwd', dir,
        'init',
        '--with-scaffold', 'smoke',
        '--with-scaffold', 'cs-probes',
      ]);
      assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstderr: ${r.stderr}`);

      assert.ok(existsSync(path.join(dir, 'scripts', 'smoke.mjs')), 'smoke runner missing');
      assert.ok(
        existsSync(path.join(dir, 'scripts', 'cs-probes', 'run-all.mjs')),
        'cs-probes runner missing'
      );

      const cfg = JSON.parse(readFileSync(path.join(dir, 'harness.config.json'), 'utf8'));
      assert.deepEqual(cfg.scaffolds.sort(), ['cs-probes', 'smoke']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('re-running init with --with-scaffold is idempotent (does not overwrite, dedupes config)', () => {
    const dir = makeTmpDir();
    try {
      const r1 = runHarness(['--cwd', dir, 'init', '--with-scaffold', 'smoke']);
      assert.equal(r1.status, 0, `1st init failed: ${r1.stderr}`);

      // Mutate the dropped file
      const droppedFile = path.join(dir, 'scripts', 'smoke.mjs');
      writeFileSync(droppedFile, '// MUTATED\n', 'utf8');

      const r2 = runHarness(['--cwd', dir, 'init', '--with-scaffold', 'smoke']);
      assert.equal(r2.status, 0, `2nd init failed: ${r2.stderr}`);

      // File preserved (not overwritten)
      assert.equal(readFileSync(droppedFile, 'utf8'), '// MUTATED\n');

      // Config not duplicated
      const cfg = JSON.parse(readFileSync(path.join(dir, 'harness.config.json'), 'utf8'));
      assert.deepEqual(cfg.scaffolds, ['smoke']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('unknown scaffold name exits 2 and leaves target untouched', () => {
    const dir = makeTmpDir();
    try {
      const r = runHarness(['--cwd', dir, 'init', '--with-scaffold', 'no-such-scaffold-xyz']);
      assert.equal(r.status, 2, `Expected exit 2; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
      assert.match(r.stderr, /Unknown scaffold/i, 'Expected "Unknown scaffold" in stderr');

      // Critical: pre-validation means NO files copied (config not produced either)
      assert.ok(
        !existsSync(path.join(dir, 'harness.config.json')),
        'Target should be untouched on validation failure'
      );
      assert.ok(!existsSync(path.join(dir, 'CONTEXT.md')), 'Seeded files should NOT be dropped');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--with-scaffold with no value exits 2', () => {
    const dir = makeTmpDir();
    try {
      const r = runHarness(['--cwd', dir, 'init', '--with-scaffold']);
      assert.equal(r.status, 2, `Expected exit 2; got ${r.status}`);
      assert.match(r.stderr, /requires a value/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--with-scaffold consuming next flag is rejected (LRN-040)', () => {
    const dir = makeTmpDir();
    try {
      // Use --from-example (init-local flag, not globally intercepted) to verify the guard.
      const r = runHarness(['--cwd', dir, 'init', '--with-scaffold', '--from-example=gwn']);
      assert.equal(r.status, 2, `Expected exit 2; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
      assert.match(r.stderr, /requires a value/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--with-scaffold=<name> equals form works', () => {
    const dir = makeTmpDir();
    try {
      const r = runHarness(['--cwd', dir, 'init', '--with-scaffold=smoke']);
      assert.equal(r.status, 0, `Expected exit 0; got ${r.status}\nstderr: ${r.stderr}`);
      assert.ok(existsSync(path.join(dir, 'scripts', 'smoke.mjs')));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('malformed existing harness.config.json fails BEFORE any scaffold copies (R1 #1)', () => {
    const dir = makeTmpDir();
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'harness.config.json'), '{ malformed', 'utf8');

      const r = runHarness(['--cwd', dir, 'init', '--with-scaffold', 'smoke']);
      assert.notEqual(r.status, 0, `Expected non-zero exit; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
      assert.match(r.stderr, /malformed JSON/i);

      // No scaffold or seeded files should be dropped
      assert.ok(!existsSync(path.join(dir, 'scripts', 'smoke.mjs')), 'Scaffold file must NOT be dropped');
      assert.ok(!existsSync(path.join(dir, 'CONTEXT.md')), 'Seeded file must NOT be dropped');
      // Original malformed config is preserved
      assert.equal(readFileSync(path.join(dir, 'harness.config.json'), 'utf8'), '{ malformed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('CS10 — shipped scaffold linters: regression tests for R1 review', () => {
  it('migration linter rejects mismatched up/down stems (R1 #3)', () => {
    const dir = makeTmpDir();
    try {
      // Init with migrations scaffold
      const r0 = runHarness(['--cwd', dir, 'init', '--with-scaffold', 'migrations']);
      assert.equal(r0.status, 0, `init failed: ${r0.stderr}`);

      // Replace example pair with a mismatched-stem pair
      const mig = path.join(dir, 'migrations');
      rmSync(path.join(mig, '0001_example.up.sql'));
      rmSync(path.join(mig, '0001_example.down.sql'));
      writeFileSync(path.join(mig, '0001_create-users.up.sql'), '-- create users\n', 'utf8');
      writeFileSync(path.join(mig, '0001_drop-posts.down.sql'), '-- drop posts\n', 'utf8');

      const linter = path.join(dir, 'scripts', 'check-migration-policy.mjs');
      const r = spawnSync(NODE, [linter, '--cwd', dir], { encoding: 'utf8', cwd: dir });
      assert.equal(r.status, 1, `Expected exit 1 (paired-up-down violation); got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
      assert.match(r.stdout + r.stderr, /paired-up-down/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags linter resolves --flags-file relative to --cwd (R1 #2)', () => {
    const dir = makeTmpDir();
    try {
      const r0 = runHarness(['--cwd', dir, 'init', '--with-scaffold', 'feature-flags']);
      assert.equal(r0.status, 0, `init failed: ${r0.stderr}`);

      const linter = path.join(dir, 'scripts', 'check-feature-flag-policy.mjs');
      // Run from REPO_ROOT (NOT from consumer dir) with relative --flags-file
      const r = spawnSync(
        NODE,
        [linter, '--cwd', dir, '--flags-file', 'flags/flags.json'],
        { encoding: 'utf8', cwd: REPO_ROOT }
      );
      // Should resolve flags/flags.json against --cwd (the consumer), not REPO_ROOT.
      // Note: the example flags.json may itself contain policy violations (e.g.
      // expired flags); we only assert path resolution, not policy outcome.
      assert.doesNotMatch(
        r.stderr,
        /flags file not found/i,
        `--flags-file should resolve against --cwd; got stderr: ${r.stderr}`
      );
      assert.doesNotMatch(
        r.stderr + r.stdout,
        /no such file/i,
        `Flags file should be findable; got: ${r.stderr}\n${r.stdout}`
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags linter handles null entry without stack trace (R1 #5)', () => {
    const dir = makeTmpDir();
    try {
      const r0 = runHarness(['--cwd', dir, 'init', '--with-scaffold', 'feature-flags']);
      assert.equal(r0.status, 0, `init failed: ${r0.stderr}`);

      // Replace flags.json with one containing a null entry
      writeFileSync(
        path.join(dir, 'flags', 'flags.json'),
        JSON.stringify({ flags: [null, { name: 'ok-flag', description: 'd', default: false, owner: 'x' }] }, null, 2),
        'utf8'
      );

      const linter = path.join(dir, 'scripts', 'check-feature-flag-policy.mjs');
      const r = spawnSync(NODE, [linter, '--cwd', dir], { encoding: 'utf8', cwd: dir });
      assert.equal(r.status, 1, `Expected exit 1; got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
      // Must produce a formatted error, not a stack trace
      assert.doesNotMatch(r.stderr, /TypeError|at .*\.mjs:\d+/i, 'Expected formatted error, got stack trace');
      assert.match(r.stdout + r.stderr, /flag\[0\]/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
